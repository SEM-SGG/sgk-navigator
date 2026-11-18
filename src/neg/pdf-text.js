// SGK-Navigator, Modul Verhandlung — fortlaufender Text aus PDF (Kompromissvorschlag, Mandat) (ESM, isomorph)
//
// parseTextPdf(bytes, { pdfjs, onProgress?, startAtAnnex? = true }) -> Promise<ParsedDoc>
// analyzeTextPages(ex, opts) -> ParsedDoc   (rein; Eingabe aus extractPdfPages)
//
// Eine Spalte (Index 0). Absätze aus Zeilenabständen und Nummerierung; Kopf-/Fusszeilen (auf vielen Seiten
// wiederkehrend) entfernt; Text ab der Seite "ANNEX" (Ratsdokumente: Deckblatt und Vermerk entfallen), sonst ab Seite 1.
// Fett/kursiv aus Schriftnamen, unterstrichen/gestrichen aus Linien (wie Vier-Spalten-PDF).
// Seitenfussnoten (unter dem kurzen Trennstrich) werden an den Absatz mit dem passenden hochgestellten Verweis gehängt.

import { extractPdfPages } from './pdf-extract.js';
import { groupLines, lineText, pageText } from './pdf-fourcol.js';
import { segmentsToHtml, htmlToText, htmlToCleanText, parseDateEn, parseDocRef, parseProcedure, parseClassification, warn } from './util.js';
import { StructureTracker, labelFromPath, groupOf, amendsOf } from './paths.js';

const NUM_START = /^(\(\s*\d+[a-z]*\s*\)|\d+[a-z]*\.|\(?[a-z]{1,2}\)|\(?(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\)|Article\s+\d+[a-z]*\b|ANNEX\b|CHAPTER\b|TITLE\b|SECTION\b|[‘“'"]\s*Article\b|–|-\s)/;

export function suggestTextTrack(meta) {
  const t = `${meta.title || ''} ${meta.subject || ''}`;
  if (/final compromise|provisional agreement|with a view to agreement|confirmation of the final/i.test(t)) return 'agreement';
  if (/general approach|mandate for negotiations|negotiating mandate|presidency compromise|compromise (text|proposal)|revised text/i.test(t)) return 'council';
  if (/position of the european parliament|report|amendments? adopted/i.test(t)) return 'ep';
  return null;
}

function decoRects(pg) {
  // Breite bis 85 % der Seite: Durchstreichungen über die ganze Satzspiegelbreite (inkl. Gliederungszeichen) kommen vor
  // (ST 6331/24 S. 37: 418–432 pt bei 595 pt); Trennlinien von Kopf-/Fusszeilen treffen keine Textzeile des Rumpfs.
  return pg.rects.filter((r) => r.y1 - r.y0 <= 2.2 && r.x1 - r.x0 >= 1 && r.x1 - r.x0 < pg.width * 0.85 && !/^#f[0-9a-f]f[0-9a-f]f[0-9a-f]$/i.test(r.color));
}

function decorateLine(L, deco) {
  // wie in pdf-fourcol: Linien unter (u) bzw. durch (s) die Grundlinie
  const out = [];
  for (const it of L.items) {
    const marks = [];
    for (const d of deco) {
      if (d.x1 <= it.x0 + 0.5 || d.x0 >= it.x1 - 0.5) continue;
      const rel = (d.y0 + d.y1) / 2 - it.y;
      let kind = null;
      if (rel >= -0.12 * it.size && rel <= 0.32 * it.size) kind = 'u';
      else if (rel < -0.12 * it.size && rel >= -0.55 * it.size) kind = 's';
      if (kind) marks.push({ kind, x0: Math.max(d.x0, it.x0), x1: Math.min(d.x1, it.x1) });
    }
    if (!marks.length) { out.push(it); continue; }
    const n = it.str.length, w = Math.max(it.x1 - it.x0, 0.01);
    const idx = (x) => {
      let k = Math.max(0, Math.min(n, Math.round(((x - it.x0) / w) * n)));
      for (let r = 0; r <= 3; r++) {
        if (k - r >= 0 && (k - r === 0 || it.str[k - r - 1] === ' ' || it.str[k - r] === ' ')) return k - r;
        if (k + r <= n && (k + r === n || it.str[k + r - 1] === ' ' || it.str[k + r] === ' ')) return k + r;
      }
      return k;
    };
    const flags = Array.from({ length: n }, () => ({ u: false, s: false }));
    for (const m of marks) { const a = m.x0 - it.x0 < 1 ? 0 : idx(m.x0), b = it.x1 - m.x1 < 1 ? n : idx(m.x1); for (let k = a; k < b; k++) flags[k][m.kind] = true; }
    let st = 0;
    for (let k = 1; k <= n; k++) {
      if (k === n || flags[k].u !== flags[st].u || flags[k].s !== flags[st].s) {
        out.push({ ...it, str: it.str.slice(st, k), x0: it.x0 + (st / n) * w, x1: it.x0 + (k / n) * w, u: flags[st].u, s: flags[st].s });
        st = k;
      }
    }
  }
  L.items = out;
  return L;
}

export function analyzeTextPages(ex, opts = {}) {
  const warnings = [...(ex.warnings || [])];
  const pages = ex.pages;
  const startAtAnnex = opts.startAtAnnex !== false;
  // Seitenzeilen
  const P = pages.map((pg) => ({ pg, lines: groupLines(pg.items.filter((i) => !i.rotated && i.str.trim())) }));
  // wiederkehrende Kopf-/Fusszeilen
  const key = (L) => lineText(L).replace(/\d+/g, '#');
  const freq = new Map();
  for (const p of P) for (const L of p.lines) if (L.y < p.pg.height * 0.15 || L.y > p.pg.height * 0.8) { const k = key(L); freq.set(k, (freq.get(k) || 0) + 1); }
  const minRep = Math.max(3, pages.length * 0.3);
  // Beginn: Seite mit "ANNEX" oben
  let first = 0;
  if (startAtAnnex) {
    const k = P.findIndex((p) => p.lines.slice(0, 3).some((L) => /^ANNEX( [IVX]+)?$/.test(lineText(L))));
    if (k >= 0) first = k; else warnings.push(warn('no-annex', 'Keine Seite "ANNEX" gefunden: Text ab Seite 1 gelesen.'));
  }
  const paras = [];
  const footnotes = [];
  let cur = null;
  const pitches = [];
  for (let pi = first; pi < P.length; pi++) {
    const { pg } = P[pi];
    // Fussnotentrennstrich: kurze waagrechte Linie in der unteren Seitenhälfte, linksbündig
    // (nicht zu verwechseln mit Unter-/Durchstreichungen: kein Text auf Höhe der Linie, darunter Zeilen mit Fussnotennummer)
    const leftX = Math.min(...P[pi].lines.map((L) => L.x0), pg.width);
    const sep = pg.rects.filter((r) => r.y1 - r.y0 <= 1.5 && r.x1 - r.x0 > 40 && r.x1 - r.x0 < pg.width * 0.35 && r.y0 > pg.height * 0.4
      && Math.abs(r.x0 - leftX) < 4
      && !pg.items.some((i) => !i.rotated && i.str.trim() && i.x1 > r.x0 && i.x0 < r.x1 && i.y > r.y0 - 4 && i.y < r.y0 + 12)
      && P[pi].lines.some((L) => L.y > r.y1 && /^\d{1,3}$/.test((L.items[0] || {}).str?.trim() || '')))
      .sort((a, b) => a.y0 - b.y0)[0];
    const footY = Math.min(...P[pi].lines.filter((L) => L.y > pg.height * 0.8 && (freq.get(key(L)) || 0) >= minRep).map((L) => L.y - L.size), pg.height);
    const body = [], fns = [];
    for (const L of P[pi].lines) {
      if ((freq.get(key(L)) || 0) >= minRep && (L.y < pg.height * 0.15 || L.y > pg.height * 0.8)) continue;
      if (L.y >= footY) continue;
      if (pi === first && /^ANNEX( [IVX]+)?$/.test(lineText(L))) continue;
      if (sep && L.y > sep.y1) fns.push(L); else body.push(L);
    }
    const deco = decoRects(pg).filter((r) => !sep || r !== sep);
    let prevY = null;
    for (let li = 0; li < body.length; li++) {
      const L = decorateLine(body[li], deco);
      const t = lineText(L);
      const gap = prevY === null ? null : L.y - prevY;
      if (gap !== null && gap > 0 && gap < L.size * 2.2) pitches.push(gap);
      const pitch = median(pitches) || L.size * 1.4;
      const startsNum = NUM_START.test(t);
      let newPara;
      if (!cur) newPara = true;
      else if (gap === null) {
        // Seitenanfang: Fortsetzung, wenn kein Nummernbeginn und vorheriger Absatz nicht abgeschlossen
        const last = htmlToText(segmentsToHtml(cur.segs)).trim();
        newPara = startsNum || /[.;:]$/.test(last) && !/^[a-z]/.test(t);
      } else {
        newPara = gap > pitch * 1.3;
        // Nummerierte Einheit ohne Abstand (z. B. Begriffsbestimmungen): neue Zeile am linken Rand nach Satzende
        if (!newPara && startsNum && cur.lastEnd && L.x0 <= cur.minX + 2) newPara = true;
      }
      if (newPara) { cur = { segs: [], page: pg.n, refs: [], minX: L.x0 }; paras.push(cur); }
      else if (cur.segs.length) {
        const last = cur.segs[cur.segs.length - 1];
        if (!(last.t && /[^\s][-‐–]$/.test(last.t) && /^[\p{L}\p{N}]/u.test(t))) cur.segs.push({ t: ' ' });
      }
      let prev = null;
      const med = median(L.items.map((i) => i.size));
      for (const it of L.items) {
        if (prev && it.x0 - prev.x1 > 0.15 * Math.min(it.size, prev.size) && !/\s$/.test(prev.str) && !/^\s/.test(it.str)) cur.segs.push({ t: ' ', b: prev.bold && it.bold, i: prev.italic && it.italic });
        const sup = it.sup || (it.size < med * 0.8 && /^\d{1,3}$/.test(it.str.trim()));
        cur.segs.push({ t: it.str.replace(/\s+/g, ' '), b: it.bold, i: it.italic, u: !!it.u, s: !!it.s, sup, sub: !!it.sub });
        if (sup) cur.refs.push({ n: it.str.trim(), page: pg.n });
        prev = it;
      }
      prevY = L.y;
      cur.minX = Math.min(cur.minX ?? L.x0, L.x0);
      cur.lastEnd = /[.;:’”]\s*$/.test(t);
    }
    // Fussnoten dieser Seite
    // (Zeilen werden wie der Rumpf auf Unter-/Durchstreichung geprüft: gestrichene Fussnoten bleiben gestrichen)
    let fcur = null;
    const fnSegs = (items) => {
      const out = [];
      let prev = null;
      for (const it of items) {
        if (prev && it.x0 - prev.x1 > 0.15 * Math.min(it.size, prev.size) && !/\s$/.test(prev.str) && !/^\s/.test(it.str)) out.push({ t: ' ', s: !!(prev.s && it.s), u: !!(prev.u && it.u) });
        out.push({ t: it.str.replace(/\s+/g, ' '), b: it.bold, i: it.italic, u: !!it.u, s: !!it.s });
        prev = it;
      }
      return out;
    };
    for (const L0 of fns) {
      const L = decorateLine(L0, deco);
      const t = lineText(L);
      const first = (L.items[0] || {}).str?.trim() || '';
      const m = /^(\d{1,3})\s+(.*)$/.exec(t);
      if (m && /^\d{1,3}$/.test(first)) { fcur = { page: pg.n, n: m[1], text: m[2], nS: !!L.items[0].s, segs: fnSegs(L.items.slice(1)) }; footnotes.push(fcur); }
      else if (/^\d{1,3}$/.test(t)) { fcur = { page: pg.n, n: t, text: '', nS: !!(L.items[0] || {}).s, segs: [] }; footnotes.push(fcur); }
      else if (fcur) { fcur.text = (fcur.text ? fcur.text + ' ' : '') + t; if (fcur.segs.length) fcur.segs.push({ t: ' ', s: !!(fcur.segs[fcur.segs.length - 1].s && (L.items[0] || {}).s) }); fcur.segs.push(...fnSegs(L.items)); }
    }
    if (opts.onProgress && pi % 10 === 0) opts.onProgress({ phase: 'paragraphs', done: pi + 1, total: P.length });
  }
  // Fussnoten anhängen
  for (const f of footnotes) {
    const target = paras.find((p) => p.refs.some((r) => r.n === f.n && r.page === f.page));
    if (target) {
      const segs = f.segs && f.segs.length ? f.segs : [{ t: f.text }];
      if (segs[0].t && !/^\s/.test(segs[0].t)) segs.unshift({ t: ' ', s: !!(f.nS && segs[0].s) });
      target.segs.push({ br: true }, { t: f.n, sup: true, s: !!f.nS }, ...segs);
    }
    else warnings.push(warn('footnote-unattached', `Fussnote ${f.n} auf Seite ${f.page} keinem Absatz zuordenbar`, { page: f.page }));
  }
  // Formel ("Proposal for a" / "REGULATION …" / "amending …") zu einer Zeile zusammenfassen
  const fi = paras.findIndex((p) => /^THE (EUROPEAN PARLIAMENT AND THE )?COUNCIL OF THE EUROPEAN UNION/.test(htmlToText(segmentsToHtml(p.segs))));
  if (fi > 1) {
    let a = 0;
    while (a < fi && /^\d{4}\/\d{4}\s*\(COD\)$/.test(htmlToText(segmentsToHtml(paras[a].segs)).trim())) a++;
    if (fi - a > 1) {
      const m = paras[a];
      for (let k = a + 1; k < fi; k++) { m.segs.push({ t: ' ' }, ...paras[k].segs); m.refs.push(...paras[k].refs); }
      paras.splice(a + 1, fi - a - 1);
    }
  }
  const tracker = new StructureTracker();
  const rows = [];
  for (const p of paras) {
    const html = segmentsToHtml(trim(p.segs));
    const text = htmlToText(html);
    if (!text) continue;
    const path = tracker.feed((htmlToCleanText(html) || text).split('\n')[0]);
    rows.push({ num: null, label: labelFromPath(path), labelSource: 'derived', path, group: groupOf(path), amends: amendsOf(path), status: null, pages: [p.page], cells: { 0: { html, text, status: null, empty: false } } });
  }
  const meta = textMeta(pages);
  meta.kind = /mandate|general approach/i.test(meta.title || '') ? 'mandate' : 'compromise';
  meta.source = 'pdf';
  meta.pages = pages.length;
  const track = suggestTextTrack(meta);
  const strikes = rows.filter((r) => /<s>/.test(r.cells[0].html)).length;
  if (strikes) warnings.push(warn('strike-detected', `${strikes} Absätze mit durchgestrichenem Text (aus Linien erkannt). Stichprobe prüfen.`));
  warnings.push(warn('colors-not-read', 'Schriftfarben werden aus dem PDF nicht gelesen.'));
  return { meta, columns: [{ index: 0, header: meta.kind === 'mandate' ? 'Council mandate' : 'Compromise text', suggestedTrack: track }], rows, warnings, stats: { pages: pages.length, firstPage: first + 1, rows: rows.length, footnotes: footnotes.length } };
}

function trim(segs) {
  while (segs.length && (segs[0].br || !String(segs[0].t || '').trim())) segs.shift();
  while (segs.length && (segs[segs.length - 1].br || !String(segs[segs.length - 1].t || '').trim())) segs.pop();
  return segs;
}
function median(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

function textMeta(pages) {
  const t1 = pages[0] ? pageText(pages[0]) : '';
  const head = t1.split('\n').slice(0, 14).join(' ');
  const meta = { ref: parseDocRef(head), date: parseDateEn(head), procedure: parseProcedure(t1), classification: parseClassification(t1) || 'public', title: null };
  const subj = /Subject:\s*([\s\S]{10,700}?)(?:\n\s*\n|\nDelegations|\nI\.\s|\n1\.\s|\nFollowing|\nAt its meeting)/.exec(t1);
  if (subj) meta.title = subj[1].replace(/\s+/g, ' ').trim();
  return meta;
}

export async function parseTextPdf(bytes, opts = {}) {
  const ex = await extractPdfPages(bytes, { pdfjs: opts.pdfjs, onProgress: opts.onProgress, pages: opts.pages });
  if (!ex.pages.length) return { meta: { kind: 'compromise', source: 'pdf' }, columns: [], rows: [], warnings: ex.warnings, stats: { pages: 0, rows: 0 } };
  return analyzeTextPages(ex, opts);
}
