// Hilfen für die Exporttests: erwarteter Kartentext, Abdeckung (LCS), Word-Auswertung (annehmen/ablehnen), Werkzeuge.
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { parseXml, child, children, attr } from '../../src/neg/xml.js';
import { normalizeCard, runsText } from '../../src/export/model.js';
import { trackedRight } from '../../src/export/docx.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FIX = join(ROOT, 'test', 'export', 'fixtures');
export const OUT = join(ROOT, 'test', 'export', 'out');
mkdirSync(OUT, { recursive: true });

export const fixtures = () => readdirSync(FIX).filter((f) => f.endsWith('.json')).sort().map((f) => ({ name: f.replace(/\.json$/, ''), card: JSON.parse(readFileSync(join(FIX, f), 'utf8')) }));

export const has = (cmd) => { try { execFileSync('which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; } };

/** Wörter: an Leerraum (inkl. geschütztem Leerzeichen) getrennt */
export const tokens = (s) => String(s).replace(/[   ]/g, ' ').split(/\s+/).filter(Boolean);

/**
 * Erwarteter Text der Karte in Lesereihenfolge (alle Läufe, auch gestrichene), wie er im PDF stehen muss.
 * which: 'all' (PDF, Format-Redline), 'new', 'old'
 */
export function cardText(card, which = 'all', { segments = false, target = 'pdf' } = {}) {
  const c = normalizeCard(card);
  const out = [];
  // Gestrichenes direkt vor Eingefügtem ist im PDF optisch getrennt (kleiner Abstand): als Wortgrenze zählen
  const rt = (runs) => (which === 'all' && target === 'pdf' ? runs.map((r, k) => (k && r.op !== runs[k - 1].op && r.op !== 'eq' && runs[k - 1].op !== 'eq' ? ' ' : '') + r.t).join('') : runsText(runs, which));
  const blocks = (bs) => { for (const b of bs) { const lab = b.label ? b.label + ' ' : ''; if (b.type === 'table') for (const r of b.rows) for (const x of r.cells) out.push(rt(x.runs)); else out.push(lab + rt(b.runs)); } };
  if (target === 'pdf' && c.brand) out.push(c.brand);   // Kopfzeile nur im PDF
  if (target === 'pdf' && c.work) out.push(c.work);
  out.push(c.title, c.subtitle, c.unitLine, c.stats);
  for (const s of c.sections) {
    out.push(s.code, s.heading, s.tag, ...s.flags.map((f) => '[' + f.label + ']'));
    out.push(s.meta.join(' | '));
    blocks(s.blocks);
  }
  if (c.columns && c.rows && c.rows.length) {
    out.push(c.labelHeading, ...c.columns.map((x) => x.heading));
    for (const r of c.rows) {
      out.push(r.label, r.tag);
      for (const cell of r.cells) {
        if (!cell) { out.push('—'); continue; }
        blocks(cell.blocks);
        for (const m of cell.marks || []) out.push(m.label);
      }
    }
  }
  for (const f of c.footnotes) out.push(f.mark, f.text);
  for (const l of c.legend) out.push(l.code || '', l.label);
  out.push(c.source, c.disclaimer);
  const segs = out.filter(Boolean);
  return segments ? segs : segs.join('\n');
}

/** Abdeckung je Absatz/Zelle: jeder Abschnitt des erwarteten Texts muss in sich geordnet im Ergebnis stehen */
export function segmentCoverage(segs, actual) {
  const b = tokens(actual);
  let tot = 0, ok = 0;
  const bad = [];
  for (const s of segs) {
    const a = tokens(s);
    const r = coverage(s, actual);
    tot += a.length; ok += r.inOrder;
    if (r.inOrder < a.length) bad.push(s.slice(0, 60));
  }
  return { words: tot, ordered: tot ? ok / tot : 1, bad, outWords: b.length };
}

/** Anteil der erwarteten Wörter, die in gleicher Reihenfolge im Ergebnis stehen (LCS), und Anteil ohne Reihenfolge */
export function coverage(expected, actual) {
  const a = tokens(expected), b = tokens(actual);
  const n = a.length, m = b.length;
  let prev = new Uint32Array(m + 1), cur = new Uint32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    const ai = a[i - 1];
    for (let j = 1; j <= m; j++) cur[j] = ai === b[j - 1] ? prev[j - 1] + 1 : (prev[j] > cur[j - 1] ? prev[j] : cur[j - 1]);
    [prev, cur] = [cur, prev];
  }
  const lcs = prev[m];
  const bag = new Map();
  for (const t of b) bag.set(t, (bag.get(t) || 0) + 1);
  let found = 0;
  const missing = [];
  for (const t of a) { const k = bag.get(t) || 0; if (k) { found++; bag.set(t, k - 1); } else missing.push(t); }
  return { words: n, inOrder: lcs, ordered: n ? lcs / n : 1, anyOrder: n ? found / n : 1, missing };
}

// ------------------------------------------------------------------ Word

export function docxParts(bytes) {
  const files = unzipSync(bytes);
  const out = {};
  for (const [k, v] of Object.entries(files)) out[k] = strFromU8(v);
  return out;
}

/**
 * Absätze des Hauptdokuments mit Text nach «alle annehmen» und «alle ablehnen», Formatierung je Lauf und Revisionen.
 * Absatzmarke als eingefügt/gelöscht markiert: Absatz fehlt in der abgelehnten bzw. angenommenen Fassung.
 */
export function docxParagraphs(documentXml) {
  const doc = parseXml(documentXml);
  const body = child(doc, 'w:body') || child(child(doc, 'w:document'), 'w:body');
  const paras = [];
  const walkBlock = (el, inTable) => {
    for (const c of el.children || []) {
      if (!c.name) continue;
      if (c.name === 'w:p') paras.push(readP(c, inTable));
      else if (c.name === 'w:tbl') for (const tr of children(c, 'w:tr')) for (const tc of children(tr, 'w:tc')) walkBlock(tc, true);
      else if (c.name === 'w:sdt') walkBlock(child(c, 'w:sdtContent') || c, inTable);
    }
  };
  const readP = (p, inTable) => {
    const pPr = child(p, 'w:pPr');
    const style = attr(child(pPr, 'w:pStyle'), 'w:val');
    const markRPr = child(pPr, 'w:rPr');
    const markIns = !!child(markRPr, 'w:ins'), markDel = !!child(markRPr, 'w:del');
    let acc = '', rej = '', all = '';
    const runs = [];
    let ins = 0, del = 0;
    const walk = (el, mode) => {
      for (const c of el.children || []) {
        if (!c.name) continue;
        if (c.name === 'w:ins') { ins++; walk(c, 'ins'); } else if (c.name === 'w:del') { del++; walk(c, 'del'); } else if (c.name === 'w:r') {
          const rPr = child(c, 'w:rPr');
          const f = { u: !!child(rPr, 'w:u'), s: !!child(rPr, 'w:strike'), b: !!child(rPr, 'w:b') && attr(child(rPr, 'w:b'), 'w:val') !== '0', lang: attr(child(rPr, 'w:lang'), 'w:val'), mode };
          let t = '';
          for (const x of c.children || []) {
            if (x.name === 'w:t' || x.name === 'w:delText') t += (x.children || []).map((y) => y.text || '').join('');
            else if (x.name === 'w:tab') t += '\t';
            else if (x.name === 'w:br') t += '\n';
          }
          if (mode !== 'ins') rej += t;
          if (mode !== 'del') acc += t;
          all += t;
          runs.push({ t, ...f });
        } else walk(c, mode);
      }
    };
    walk(p, null);
    return { style, inTable, acc, rej, all, runs, ins, del, markIns, markDel };
  };
  walkBlock(body, false);
  return paras;
}

/**
 * Text eines Dokuments nach «alle annehmen» bzw. «alle ablehnen», nach der Semantik von WordprocessingML:
 * eine entfernte Absatzmarke (abgelehnt: eingefügt; angenommen: gestrichen) verbindet den Absatz mit dem folgenden.
 * Liefert die Absätze als Liste (opts.list) oder mit "\n" verbunden.
 */
export function docxText(paras, which, { list = false, filter = null } = {}) {
  const out = [];
  let carry = null;
  for (const p of paras) {
    const t = which === 'acc' ? p.acc : which === 'rej' ? p.rej : p.all;
    const gone = (which === 'acc' && p.markDel) || (which === 'rej' && p.markIns);
    const cur = carry ? { t: carry.t + t, p: carry.keep ? carry.p : p } : { t, p };
    if (gone && which !== 'all') { carry = { t: cur.t, p: cur.p, keep: false }; continue; }
    carry = null;
    out.push(cur);
  }
  if (carry) out.push(carry);
  const sel = filter ? out.filter((x) => filter(x.p)) : out;
  return list ? sel.map((x) => x.t) : sel.map((x) => x.t).join('\n');
}

/**
 * Erwartete Rechtstext-Absätze der Karte (Blöcke mit Zeichen und Tab) in Dokumentreihenfolge, je Lesart.
 * Für Gegenüberstellungen im Modus «tracked»: linke Spalte immer alte Fassung, rechte Spalte vollständige Redline.
 */
export function expectedBlockParas(card, which, mode) {
  const c = normalizeCard(card);
  const out = [];
  const add = (b, w) => {
    if (b.type === 'table') return;
    const whole = b.op;
    if (mode === 'tracked' && ((w === 'new' && whole === 'del') || (w === 'old' && whole === 'ins'))) return;   // Absatz entfällt
    out.push((b.label ? b.label + '\t' : '') + runsText(b.runs, w));
  };
  for (const s of c.sections) for (const b of s.blocks) add(b, which);
  if (c.columns && c.rows) for (const r of c.rows) {
    const [L, R] = r.cells;
    if (mode === 'tracked' && c.columns[0].lang === c.columns[1].lang) {
      for (const b of L ? L.blocks : []) out.push((b.label ? b.label + '\t' : '') + runsText(b.runs, 'old'));
      const merged = trackedRight(L, R);
      for (const b of merged || (R ? R.blocks : [])) add(b, which);
    } else {
      for (const b of L ? L.blocks : []) out.push((b.label ? b.label + '\t' : '') + runsText(b.runs, 'all'));
      for (const b of R ? R.blocks : []) out.push((b.label ? b.label + '\t' : '') + runsText(b.runs, 'all'));
    }
  }
  return out;
}

export const LEGAL_STYLES = new Set(['SGKText', 'SGKTextHeading', 'SGKTextNote']);

/** LibreOffice mit eigenem Profil (andere Prozesse im selben Arbeitsbaum stören nicht). Mehrere Dateien in einem Aufruf. */
const LO_PROFILE = 'file:///tmp/sgk-export-lo-profile-' + process.pid;   // je Testprozess eigenes Profil (Tests laufen parallel)
process.on('exit', () => { try { rmSync(LO_PROFILE.replace('file://', ''), { recursive: true, force: true }); } catch { /* egal */ } });
export function sofficeMany(files, to, outdir, { infilter } = {}) {
  mkdirSync(outdir, { recursive: true });
  const args = ['-env:UserInstallation=' + LO_PROFILE, '--headless', '--norestore', '--nolockcheck'];
  if (infilter) args.push('--infilter=' + infilter);
  execFileSync('soffice', [...args, '--convert-to', to, '--outdir', outdir, ...files], { stdio: 'pipe', timeout: 600000 });
  const ext = to.split(':')[0];
  return files.map((file) => {
    const p = join(outdir, file.replace(/^.*\//, '').replace(/\.[^.]+$/, '') + '.' + ext);
    if (!existsSync(p)) throw new Error('soffice lieferte keine Datei: ' + p);
    return p;
  });
}
export const soffice = (file, to, outdir, o) => sofficeMany([file], to, outdir, o)[0];

/** Wohlgeformtheit mit xmllint (wirft mit Meldung) */
export function xmlWellFormed(name, xml) {
  try { execFileSync('xmllint', ['--noout', '-'], { input: xml, stdio: ['pipe', 'pipe', 'pipe'] }); return true; } catch (e) { throw new Error(name + ': ' + String(e.stderr || e.message).slice(0, 500)); }
}

/** Seiten rendern (PNG), liefert Pfade */
export function renderPages(pdf, prefix, dpi = 70) {
  execFileSync('pdftoppm', ['-r', String(dpi), '-png', pdf, prefix]);
  const dir = dirname(prefix), base = prefix.replace(/^.*\//, '');
  return readdirSync(dir).filter((f) => f.startsWith(base + '-') && f.endsWith('.png')).sort().map((f) => join(dir, f));
}

/** Wörter mit Rahmen je Seite (pdftotext -bbox) */
export function pdfWords(file) {
  const xml = execFileSync('pdftotext', ['-bbox', '-enc', 'UTF-8', file, '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const pages = [];
  const re = /<page width="([\d.]+)" height="([\d.]+)">|<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[1]) pages.push({ w: +m[1], h: +m[2], words: [] });
    else pages[pages.length - 1].words.push({ x0: +m[3], y0: +m[4], x1: +m[5], y1: +m[6], t: m[7] });
  }
  return pages;
}

/**
 * Prüft Geometrie: alle Wörter innerhalb der Seite (mit Rand), keine zwei Wörter überlappen deutlich.
 * Überlappung: Schnittfläche > 25 % der kleineren Wortfläche.
 */
export function pdfGeometry(file, { margin = 10 } = {}) {
  const pages = pdfWords(file);
  const outside = [], overlaps = [];
  pages.forEach((p, pi) => {
    for (const w of p.words) if (w.x0 < margin || w.y0 < margin || w.x1 > p.w - margin || w.y1 > p.h - margin) outside.push({ page: pi + 1, t: w.t });
    const ws = [...p.words].sort((a, b) => a.y0 - b.y0);
    for (let i = 0; i < ws.length; i++) {
      for (let j = i + 1; j < ws.length && ws[j].y0 < ws[i].y1; j++) {
        const a = ws[i], b = ws[j];
        const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
        if (ix <= 0 || iy <= 0) continue;
        const small = Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0));
        if (ix * iy > 0.25 * small) overlaps.push({ page: pi + 1, a: a.t, b: b.t });
      }
    }
  });
  return { pages: pages.length, words: pages.reduce((n, p) => n + p.words.length, 0), outside, overlaps };
}

export const pdftotext = (file, raw = true) => execFileSync('pdftotext', [...(raw ? ['-raw'] : []), '-enc', 'UTF-8', file, '-'], { encoding: 'utf8' });
export const pdfPages = (file) => +/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [file], { encoding: 'utf8' }))[1];
export const write = (name, data) => { const p = join(OUT, name); writeFileSync(p, data); return p; };

/** Alle Zielzeichen der ToUnicode-Tabellen eines PDF (qpdf entpackt die Ströme) */
export function pdfToUnicodeChars(file) {
  const q = execFileSync('qpdf', ['--qdf', '--object-streams=disable', file, '-'], { maxBuffer: 1 << 28 }).toString('latin1');
  const set = new Set();
  for (const sec of q.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of sec[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      const hex = m[2];
      const units = [];
      for (let i = 0; i < hex.length; i += 4) units.push(parseInt(hex.slice(i, i + 4), 16));
      set.add(String.fromCharCode(...units));
    }
  }
  return set;
}

/**
 * Leistungskarte: n Blöcke aus dem Datensatz (DE, Basistext gegen jüngsten Stand, Wort-Diff), Abschnitte zu je 30 Blöcken.
 */
export async function perfCard(n = 300) {
  const { diffText } = await import('../../src/app/lib/diff.js');
  const { htmlToRuns, redlineRuns } = await import('../../src/export/model.js');
  const ds = JSON.parse(readFileSync(join(ROOT, 'data', 'dataset.json'), 'utf8'));
  const blocks = [];
  for (const e of ds.toc) {
    const u = ds.units[e.id];
    if (!u || !u.versions.de) continue;
    const vs = u.versions.de;
    const A = new Map((vs[0].blocks || []).map((b) => [b.k, b]));
    for (const b of vs[vs.length - 1].blocks || []) {
      if (b.ty === 'img' || b.ty === 'table' || !b.t) continue;
      const a = A.get(b.k);
      let runs;
      if (!a) runs = htmlToRuns(b.t).map((r) => ({ ...r, op: 'ins' }));
      else if (a.t === b.t) runs = htmlToRuns(b.t);
      else { const d = diffText(a.t, b.t); runs = redlineRuns(d.oldHtml, d.newHtml, d.redline); }
      blocks.push({ key: e.id + '#' + b.k, label: b.l || '', depth: Math.min(b.d, 4), ...(b.ty === 'heading' ? { type: 'heading' } : {}), runs });
      if (blocks.length >= n) break;
    }
    if (blocks.length >= n) break;
  }
  const sections = [];
  for (let i = 0; i < blocks.length; i += 30) sections.push({ heading: `Blöcke ${i + 1}–${Math.min(i + 30, blocks.length)}`, tag: 'geändert', color: '#332288', meta: ['Leistungsprüfung'], blocks: blocks.slice(i, i + 30) });
  return { kind: 'chronology', title: `Leistungskarte mit ${blocks.length} Blöcken`, subtitle: 'Basistext gegen jüngsten Stand', textLang: 'de', uiLang: 'de', sections,
    legend: [{ op: 'ins', label: 'eingefügt' }, { op: 'del', label: 'gestrichen' }], source: 'Quelle: data/dataset.json' };
}
