// Prüft die Wortlauttreue von parseFourColumnPdf gegen einen unabhängig gewonnenen Spaltentext.
//
// Referenz: `pdftotext -bbox-layout` (Poppler, unabhängig von pdf.js) mit eigener, einfacher Spaltentrennung:
//   - Spaltengrenzen aus Lücken im Belegungshistogramm der Wort-x-Ausdehnung über alle Tabellenseiten
//   - Kopfzeile (Zeile mit den Spaltentiteln) und alles darüber, Fusszeile (unterste 62 pt) ausgeschlossen
//   - Wörter je Spalte in Lesereihenfolge (Seite, Zeile, x)
// Vergleich: Wortfolgen (normalisiert, klein) je Spalte, LCS über diffArrays.
//   Abdeckung = gemeinsame Wörter / Referenzwörter; Genauigkeit = gemeinsame Wörter / Parserwörter;
//   Fehlzuordnung = Parserwörter einer Spalte, die nicht passen, aber unter den nicht passenden Referenzwörtern einer anderen Spalte stehen.
//
// Aufruf: node scripts/neg/validate-pdf.mjs raw-neg/ST-14288-2023.pdf [...]  (schreibt scripts/neg/out/validate-pdf.json)

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { diffArrays } from 'diff';
import { parseFourColumnPdf } from '../../src/neg/pdf-fourcol.js';
import { words } from '../../src/neg/util.js';

const HEADER_WORDS = /^(comments|comment|commission|proposal|ep|mandate|council|draft|agreement|compromise|auxiliary|cd\d|clean|vs\.ec|vs\.ceu|position|general|approach|parliament|amendments)$/i;

export function bboxWords(file) {
  const html = execFileSync('pdftotext', ['-bbox-layout', file, '-'], { maxBuffer: 1 << 30 }).toString('utf8');
  const pages = [];
  const pageRe = /<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g;
  let pm;
  while ((pm = pageRe.exec(html))) {
    const W = +pm[1], H = +pm[2];
    const lines = [];
    const lineRe = /<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/line>/g;
    let lm;
    while ((lm = lineRe.exec(pm[3]))) {
      const ws = [];
      const wRe = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/word>/g;
      let wm;
      while ((wm = wRe.exec(lm[5]))) ws.push({ x0: +wm[1], y0: +wm[2], x1: +wm[3], y1: +wm[4], t: wm[5].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'") });
      if (ws.length) lines.push({ y0: +lm[2], y1: +lm[4], x0: +lm[1], x1: +lm[3], words: ws });
    }
    pages.push({ W, H, lines });
  }
  return pages;
}

export function refColumns(pages) {
  // Statuskürzel im Rand (winzige G/Y/R) gehören zu keiner Spalte
  for (const p of pages) for (const l of p.lines) l.words = l.words.filter((w) => !(/^[GYR]$/.test(w.t) && w.y1 - w.y0 < 7));
  for (const p of pages) p.lines = p.lines.filter((l) => l.words.length);
  // Kopfzeile: Zeilen im oberen Seitenviertel, die auf vielen Seiten gleich (Text und Lage) wiederkehren
  const freq = new Map();
  const key = (l) => l.words.map((w) => w.t).join(' ');
  for (const p of pages) for (const l of p.lines) if (l.y0 < p.H * 0.25) { const k = key(l); freq.set(k, (freq.get(k) || 0) + 1); }
  const table = [];
  pages.forEach((p, i) => {
    const rep = p.lines.filter((l) => l.y0 < p.H * 0.6 && ((freq.get(key(l)) || 0) >= Math.max(3, pages.length * 0.4) || (l.words.length <= 4 && l.words.filter((w) => HEADER_WORDS.test(w.t)).length >= 2 && l.words.every((w) => HEADER_WORDS.test(w.t)))));
    const hw = rep.filter((l) => l.words.some((w) => HEADER_WORDS.test(w.t)));
    if (!hw.length) return;
    const y = Math.min(...hw.map((l) => l.y0));
    const grp = rep.filter((l) => l.y0 >= y - 12 && l.y0 < y + 16);
    table.push({ idx: i, p, headerY: Math.max(...grp.map((l) => l.y1)), headerWords: grp.flatMap((l) => l.words), headerLines: grp });
  });
  // Seiten ohne wiederholte Kopfzeile zwischen erster und letzter Tabellenseite gehören dazu
  if (table.length) {
    const have = new Set(table.map((t) => t.idx));
    // Kopfzeile nur auf wenigen Seiten wiederholt: Tabelle läuft bis zum Dokumentende
    const lastIdx = table.length >= 3 ? table[table.length - 1].idx : pages.length;
    for (let i = table[0].idx + 1; i < lastIdx; i++) if (!have.has(i)) table.push({ idx: i, p: pages[i], headerY: 20, headerWords: [] });
    table.sort((a, b) => a.idx - b.idx);
  }
  // Fusszeile: Zeilen im unteren Seitenfünftel, deren Text (ohne Ziffern) auf vielen Seiten wiederkehrt
  const fkey = (l) => l.words.map((w) => w.t).join(' ').replace(/\d+/g, '#');
  const ff = new Map();
  const hasLetters = (l) => l.words.map((w) => w.t).join(" ").length >= 4;
  for (const p of pages) for (const l of p.lines) if (l.y0 > p.H * 0.8 && hasLetters(l)) { const k = fkey(l); ff.set(k, (ff.get(k) || 0) + 1); }
  for (const t of table) {
    const foot = t.p.lines.filter((l) => l.y0 > t.p.H * 0.8 && hasLetters(l) && (ff.get(fkey(l)) || 0) >= Math.max(3, pages.length * 0.4));
    // ohne wiederkehrende Fusszeile: nur reine Seitenzahl ganz unten ausschliessen
    t.footY = foot.length ? Math.min(...foot.map((l) => l.y0)) : t.p.H - 50;
  }
  // Je Seite: Spaltenmitten aus den Spaltentiteln (kleine Umschalter wie "CLEAN" ausgenommen), Grenzen am tiefsten Punkt
  // des Belegungshistogramms der Seite zwischen zwei Titeln. Seiten ohne Kopfzeile übernehmen die Grenzen der Vorseite.
  let prevCols = null;
  const allLabels = new Set();
  // globales Histogramm für die Grenze der Nummernspalte (auf Seiten ohne Nummern fehlt dort Text)
  const GW = Math.ceil(Math.max(...pages.map((p) => p.W)));
  const ghist = new Float64Array(GW + 2);
  let gMinX = GW;
  for (const t of table) for (const l of t.p.lines) {
    if (l.y0 <= t.headerY || l.y0 >= t.footY - 0.5) continue;
    for (const w of l.words) { gMinX = Math.min(gMinX, w.x0); for (let x = Math.max(0, Math.floor(w.x0)); x <= Math.min(GW, Math.ceil(w.x1)); x++) ghist[x] += 1; }
  }
  const starts = new Map();
  for (const t of table) for (const l of t.p.lines) {
    if (l.y0 <= t.headerY || l.y0 >= t.footY - 0.5) continue;
    const x = Math.round(l.words[0].x0); starts.set(x, (starts.get(x) || 0) + 1);
  }
  const cutG = (a, b) => {
    let mn = Infinity;
    for (let x = Math.ceil(a); x <= Math.floor(b); x++) mn = Math.min(mn, ghist[x]);
    let st = null, best = null;
    for (let x = Math.ceil(a); x <= Math.floor(b) + 1; x++) {
      const low = x <= Math.floor(b) && ghist[x] <= mn;
      if (low && st === null) st = x;
      if (!low && st !== null) { if (!best || x - 1 - st > best[1] - best[0]) best = [st, x - 1]; st = null; }
    }
    return best ? (best[0] + best[1]) / 2 : (a + b) / 2;
  };
  for (const t of table) {
    if (!t.headerWords.length) { t.cols = prevCols; continue; }
    // Titelstücke = Poppler-Zeilen der Kopfzeile (ohne kleine Umschalter); übereinanderliegende Stücke zusammenfassen
    const hMax = Math.max(...t.headerWords.map((w) => w.y1 - w.y0));
    const pieces = [];
    for (const l of t.headerLines) {
      const ws = l.words.filter((w) => w.y1 - w.y0 >= hMax * 0.75).sort((a, b) => a.x0 - b.x0);
      // Poppler kann zwei Titel in eine Zeile legen: an grossen Lücken trennen
      let cur = null;
      for (const w of ws) {
        if (cur && w.x0 - cur.x1 < 12) { cur.x1 = w.x1; cur.t += ' ' + w.t; }
        else { cur = { x0: w.x0, x1: w.x1, y0: w.y0, t: w.t }; pieces.push(cur); }
      }
    }
    pieces.sort((a, b) => a.y0 - b.y0);
    const labels = [];
    for (const pc of pieces) {
      const L = labels.find((l) => Math.abs((pc.x0 + pc.x1) / 2 - (l.x0 + l.x1) / 2) < 35 && pc.y0 > l.y0 + 3 && pc.y0 < l.y0 + 16);
      if (L) { L.x0 = Math.min(L.x0, pc.x0); L.x1 = Math.max(L.x1, pc.x1); L.t += ' ' + pc.t; }
      else labels.push({ ...pc });
    }
    labels.sort((a, b) => a.x0 - b.x0);
    const W = Math.ceil(t.p.W);
    const hist = new Float64Array(W + 2);
    let minX = W;
    for (const l of t.p.lines) {
      if (l.y0 <= t.headerY || l.y0 >= t.footY - 0.5) continue;
      for (const w of l.words) { minX = Math.min(minX, w.x0); for (let x = Math.max(0, Math.floor(w.x0)); x <= Math.min(W, Math.ceil(w.x1)); x++) hist[x] += 1; }
    }
    const cut = (a, b) => {
      let mn = Infinity;
      for (let x = Math.ceil(a); x <= Math.floor(b); x++) mn = Math.min(mn, hist[x]);
      let st = null, best = null;
      for (let x = Math.ceil(a); x <= Math.floor(b) + 1; x++) {
        const low = x <= Math.floor(b) && hist[x] <= mn;
        if (low && st === null) st = x;
        if (!low && st !== null) { if (!best || x - 1 - st > best[1] - best[0]) best = [st, x - 1]; st = null; }
      }
      return best ? (best[0] + best[1]) / 2 : (a + b) / 2;
    };
    const cols = [];
    const firstLeft = labels[0].x0;
    let left = 0;
    if (gMinX < firstLeft - 20) {
      // Grenze Nummernspalte | erste Inhaltsspalte: häufigster linker Zeilenanfang (linksbündiger Text) im Fenster, minus 3 pt
      const lo = gMinX + 8, hi = (labels[0].x0 + labels[0].x1) / 2;
      let best = null, bn = 0;
      for (const [x, n] of starts) if (x > lo && x < hi && n > bn) { bn = n; best = x; }
      const c = best !== null ? best - 3 : cutG(lo, firstLeft - 2);
      cols.push({ name: '#', x0: 0, x1: c }); left = c;
    }
    for (let k = 0; k < labels.length; k++) {
      const right = k + 1 < labels.length ? cut(labels[k].x1, labels[k + 1].x0) : W + 1;
      cols.push({ name: labels[k].t, x0: left, x1: right });
      allLabels.add(labels[k].t);
      left = right;
    }
    t.cols = cols;
    prevCols = cols;
  }
  return { table: table.filter((t) => t.cols), labels: [...allLabels] };
}

export function refTexts(table) {
  // Rückgabe: Map Spaltenname -> Wortliste ("#" = Nummernspalte mit Fundstellen-Zwischenzeilen)
  const out = new Map();
  for (const t of table) {
    const cols = t.cols;
    const perCol = cols.map(() => []);
    for (const l of t.p.lines) {
      if (l.y0 <= t.headerY || l.y0 >= t.footY - 0.5) continue;
      // verbundene Zelle (Fundstellen-Zwischenzeile): Zeile beginnt in der Nummernspalte und läuft lückenlos darüber hinaus
      const c0 = cols.findIndex((c) => l.words[0].x0 >= c.x0 && l.words[0].x0 < c.x1);
      let merged = false;
      if (c0 === 0 && cols[0].name === '#' && cols.length > 1 && l.x1 > cols[0].x1 + 4) merged = l.words.every((w, k) => k === 0 || w.x0 - l.words[k - 1].x1 < 12);
      for (const w of l.words) {
        const c = merged ? 0 : cols.findIndex((cc) => w.x0 >= cc.x0 && w.x0 < cc.x1);
        if (c >= 0) perCol[c].push({ ...w, ly: l.y1 });
      }
    }
    perCol.forEach((ws, c) => {
      ws.sort((a, b) => (Math.abs(a.ly - b.ly) < 2 ? a.x0 - b.x0 : a.ly - b.ly));
      const name = cols[c].name;
      if (!out.has(name)) out.set(name, []);
      out.get(name).push(...ws.map((w) => w.t));
    });
  }
  for (const [k, v] of out) out.set(k, words(v.join(' ')).map((w) => w.toLowerCase()));
  return out;
}

function lcsMatch(a, b) {
  const parts = diffArrays(a, b);
  let common = 0;
  const onlyA = [], onlyB = [], hunks = [];
  parts.forEach((p, k) => {
    if (p.added) onlyB.push(...p.value);
    else if (p.removed) onlyA.push(...p.value);
    else common += p.value.length;
    if ((p.added || p.removed) && p.value.length >= 3) {
      const before = parts[k - 1] && !parts[k - 1].added && !parts[k - 1].removed ? parts[k - 1].value.slice(-6).join(' ') : '';
      hunks.push({ kind: p.added ? 'extra' : 'fehlt', n: p.value.length, text: p.value.slice(0, 25).join(' '), before });
    }
  });
  hunks.sort((x, y) => y.n - x.n);
  return { common, onlyA, onlyB, hunks: hunks.slice(0, 8) };
}

export async function validateFile(file) {
  const bytes = new Uint8Array(fs.readFileSync(file));
  const t0 = Date.now();
  const parsed = await parseFourColumnPdf(bytes, { pdfjs });
  const ms = Date.now() - t0;
  const pages = bboxWords(file);
  const { table, labels } = refColumns(pages);
  const ref = refTexts(table);
  // Parser-Spaltentexte: Nummernspalte (Fundstellen-Zwischenzeilen + Nummer), dann Inhaltsspalten
  // Nummernspalte seitenweise: Fundstellen/Nummern der Zeilen, die auf der Seite beginnen, dann Seitenfussnoten
  // (die Referenz liest Seitenfussnoten links unten, also in der Nummernspalte). Seitenfussnoten in den Zellen ausgenommen.
  const pNum = [];
  const fnByPage = new Map();
  for (const f of parsed.footnotes || []) { if (!fnByPage.has(f.page)) fnByPage.set(f.page, []); fnByPage.get(f.page).push(f); }
  const pCols = parsed.columns.map(() => []);
  let curPage = null;
  const flushFn = (pg) => { for (const f of fnByPage.get(pg) || []) pNum.push(f.n, f.text); fnByPage.delete(pg); };
  for (const r of parsed.rows) {
    const pg = r.pages[0];
    if (curPage !== null && pg !== curPage) for (let q = curPage; q < pg; q++) flushFn(q);
    curPage = pg;
    if (r.labelSource === 'table') pNum.push(r.label);
    if (r.num) pNum.push(r.num);
    parsed.columns.forEach((c, i) => {
      const cell = r.cells[i];
      if (!cell) return;
      // Hochgestelltes als eigenes Wort (Referenz trennt es über die Grundlinie)
      let h = cell.html;
      for (const f of parsed.footnotes || []) if (f.row === r.num && f.col === i) h = h.replace(`<br><sup>${f.n}</sup> ${f.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}`, '');
      const t = h.replace(/<sup>/g, ' ').replace(/<\/sup>/g, ' ').replace(/<br>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      pCols[i].push(t, ...(cell.notes || []), ...(cell.tags || []));
    });
  }
  for (const pg of [...fnByPage.keys()].sort((a, b) => a - b)) flushFn(pg);
  const names = ['#', ...parsed.columns.map((c) => c.header)];
  const parsedTexts = [pNum, ...pCols].map((arr) => words(arr.join(' ')).map((w) => w.toLowerCase()));
  const res = { file: path.basename(file), ms, pages: parsed.stats.pages, rows: parsed.stats.rows, layout: parsed.meta.layout, refColumns: ref.size, parserColumns: parsedTexts.length, columns: [] };
  const missingNames = [...ref.keys()].filter((k) => !names.includes(k));
  if (missingNames.length) res.note = `Referenzspalten ohne Gegenstück im Parser: ${missingNames.join(', ')}`;
  const n = names.length;
  const unmatchedRef = [], unmatchedPar = [];
  for (let k = 0; k < n; k++) {
    const R = ref.get(names[k]) || [], P = parsedTexts[k];
    const m = lcsMatch(R, P);
    unmatchedRef.push(m.onlyA); unmatchedPar.push(m.onlyB);
    res.columns.push({ col: k === 0 ? 'Nr./Fundstelle' : names[k], refWords: R.length, parsedWords: P.length, common: m.common, coverage: R.length ? m.common / R.length : 1, precision: P.length ? m.common / P.length : 1, sampleMissing: m.onlyA.slice(0, 12).join(' '), sampleExtra: m.onlyB.slice(0, 12).join(' '), hunks: m.hunks });
  }
  // Fehlzuordnungen über Spalten
  for (let k = 0; k < n; k++) {
    const pool = new Map();
    for (let j = 0; j < n; j++) if (j !== k) for (const w of unmatchedRef[j]) pool.set(w, (pool.get(w) || 0) + 1);
    let mis = 0;
    for (const w of unmatchedPar[k]) { const c = pool.get(w); if (c) { mis++; pool.set(w, c - 1); } }
    res.columns[k].misassigned = mis;
    res.columns[k].misassignedPct = res.columns[k].parsedWords ? mis / res.columns[k].parsedWords : 0;
  }
  const tot = res.columns.slice(1).reduce((a, c) => ({ ref: a.ref + c.refWords, par: a.par + c.parsedWords, com: a.com + c.common, mis: a.mis + c.misassigned }), { ref: 0, par: 0, com: 0, mis: 0 });
  res.total = { refWords: tot.ref, parsedWords: tot.par, coverage: tot.ref ? tot.com / tot.ref : 1, precision: tot.par ? tot.com / tot.par : 1, misassignedPct: tot.par ? tot.mis / tot.par : 0 };
  res.warnings = parsed.warnings.reduce((m, w) => { m[w.code] = (m[w.code] || 0) + 1; return m; }, {});
  res.stats = parsed.stats;
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2);
  const all = [];
  const pct = (v) => (v * 100).toFixed(2) + ' %';
  for (const f of files) {
    const r = await validateFile(f);
    all.push(r);
    console.log(`\n${r.file}: ${r.pages} S., ${r.rows} Zeilen, ${r.ms} ms, Layout ${r.layout}${r.note ? ' — ' + r.note : ''}`);
    for (const c of r.columns) console.log(`  ${c.col.padEnd(22)} Ref ${String(c.refWords).padStart(6)}  Parser ${String(c.parsedWords).padStart(6)}  Abdeckung ${pct(c.coverage).padStart(9)}  Genauigkeit ${pct(c.precision).padStart(9)}  Fehlzuordnung ${pct(c.misassignedPct).padStart(8)}${c.coverage < 1 ? '  fehlt: ' + c.sampleMissing : ''}${c.precision < 1 ? '  extra: ' + c.sampleExtra : ''}`);
    if (process.env.HUNKS) for (const c of r.columns) for (const h of c.hunks || []) console.log(`    [${c.col}] ${h.kind} ${h.n}: …${h.before} ⟨${h.text}⟩`);
    console.log(`  TOTAL Inhalt: Abdeckung ${pct(r.total.coverage)}, Genauigkeit ${pct(r.total.precision)}, Fehlzuordnung ${pct(r.total.misassignedPct)}`);
  }
  fs.mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
  fs.writeFileSync(new URL('./out/validate-pdf.json', import.meta.url), JSON.stringify(all, null, 1));
}
