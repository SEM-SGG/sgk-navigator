// SGK-Navigator, Modul Verhandlung — Vier-Spalten-Tabellen und fortlaufende Texte aus Word (ESM, isomorph)
//
// parseFourColumnDocx(bytes, { deleted?:"mark"|"drop", inserted?:"plain"|"mark" }) -> ParsedDoc
//   Generisch: jede Tabelle mit ≥ 2 Textspalten ist importierbar. Die Kopfzeile (Spaltentitel) bestimmt die Spalten;
//   eine schmale erste Spalte mit Zahlen ("12", "12a") ist die Zeilennummer; Zeilen, die über alle Spalten verbunden
//   sind, gelten als Fundstellen-Zwischenzeile (Trilogue Table Editor). Zell-Schattierung -> Status (grün = agreed …).
//   Änderungsverfolgung: w:ins übernommen; w:del als gestrichen markiert (deleted:"mark") oder weggelassen ("drop").
//   Mehrere Tabellen mit gleicher Kopfzeile werden aneinandergehängt. Verbundene Zellen (gridSpan/vMerge) werden aufgelöst.
// parseTextDocx(bytes, opts) -> ParsedDoc  (fortlaufender Text; Absätze ausserhalb von Tabellen; Tabellen als Text)

import { readDocx, flatParas, runsToSegments, blocksHtml } from './docx-read.js';
import { segmentsToHtml, htmlToText, htmlToCleanText, parseDateEn, parseDocRef, parseProcedure, parseClassification, warn } from './util.js';
import { parseLabel, labelFromPath, StructureTracker, groupOf, amendsOf, uniqueDerivedLabels } from './paths.js';
import { suggestTrack, colorStatus } from './pdf-fourcol.js';
import { suggestTextTrack } from './pdf-text.js';

const HEADER_RE = /commission|proposal|\bEP\b|parliament|mandate|council|general approach|draft|agreement|compromise|position|amendment|comment/i;

/** Tabelle in ein Raster auflösen: je Zeile Liste der Gitterspalten mit Verweis auf die Zelle */
function grid(tbl) {
  const rows = [];
  const above = [];
  for (const r of tbl.rows) {
    const g = [];
    let col = 0;
    for (const c of r.cells) {
      for (let k = 0; k < c.span; k++) {
        if (c.vMerge === 'continue' && above[col + k]) g[col + k] = { cell: above[col + k].cell, merged: true, spanStart: k === 0 };
        else g[col + k] = { cell: c, merged: false, spanStart: k === 0, span: c.span };
      }
      col += c.span;
    }
    for (let k = 0; k < g.length; k++) if (g[k] && !g[k].merged) above[k] = g[k];
    rows.push({ g, header: r.header, raw: r });
  }
  return rows;
}

function cellHtml(cell, opts) { return blocksHtml(cell.blocks, opts); }

export function parseFourColumnDocx(bytes, opts = {}) {
  const d = readDocx(bytes);
  const warnings = [...d.warnings];
  const meta = { kind: 'four-column', source: 'docx', ref: null, date: null, procedure: null, title: null, classification: 'internal' };
  if (!d.ok) return { meta, columns: [], rows: [], warnings, stats: { rows: 0 } };
  const ropts = { deleted: opts.deleted || 'mark', inserted: opts.inserted || 'plain' };
  // Text vor der ersten Tabelle -> Metadaten
  const pre = [];
  for (const b of d.body) { if (b.type === 'tbl') break; pre.push(htmlToText(segmentsToHtml(runsToSegments(b.runs, { deleted: 'drop' })))); }
  const preText = pre.join('\n');
  meta.ref = parseDocRef(preText); meta.date = parseDateEn(preText); meta.procedure = parseProcedure(preText) || parseProcedure((d.footers || []).join(' '));
  meta.classification = parseClassification(preText) || 'internal';
  const pm = /(Proposal for a [\s\S]{10,400}?)(\n|$)/i.exec(preText); if (pm) meta.title = pm[1].trim();
  // Tabellen mit Kopfzeile
  const tables = [];
  const collect = (blocks) => { for (const b of blocks) if (b.type === 'tbl') tables.push(b); };
  collect(d.body);
  let model = null;
  const rowsOut = [];
  let pendingLabel = null;
  let tracked = 0, colored = 0, merged = 0;
  for (const tbl of tables) {
    const G = grid(tbl);
    if (!G.length) continue;
    const width = Math.max(...G.map((r) => r.g.length));
    if (width < 2) continue;
    // Kopfzeile suchen (erste 3 Zeilen)
    let hIdx = -1, heads = null;
    for (let i = 0; i < Math.min(3, G.length); i++) {
      const hs = G[i].g.map((x, k) => (x && x.spanStart && !x.merged ? htmlToText(cellHtml(x.cell, { deleted: 'drop' })) : (x && x.spanStart === false ? null : '')));
      if (hs.filter((h) => h && HEADER_RE.test(h) && h.length < 60).length >= 2) { hIdx = i; heads = hs; break; }
    }
    if (hIdx < 0 && !model) {
      // Tabelle ohne Kopfzeile: nur übernehmen, wenn ≥ 2 Spalten mit Text
      const textCols = new Set();
      for (const r of G) r.g.forEach((x, k) => { if (x && x.spanStart && htmlToText(cellHtml(x.cell)).length > 20) textCols.add(k); });
      if (textCols.size < 2) continue;
      heads = Array.from({ length: width }, (_, k) => (textCols.has(k) ? `Spalte ${k + 1}` : ''));
      warnings.push(warn('no-header', 'Tabelle ohne erkennbare Spaltentitel: Spalten nach Position benannt; bitte Zuordnung prüfen.'));
    }
    if (heads) {
      const cols = [];
      let numCol = -1;
      heads.forEach((h, k) => {
        if (h === null) return;
        if (!h || !h.trim()) {
          // schmale erste Spalte mit Zahlen?
          const nums = G.slice(hIdx + 1).map((r) => r.g[k] && r.g[k].spanStart && !r.g[k].merged && r.g[k].span === 1 ? htmlToText(cellHtml(r.g[k].cell)) : '').filter(Boolean);
          if (k === 0 && nums.length && nums.filter((t) => /^\d+[a-z]*$/i.test(t.trim())).length >= nums.length * 0.6) { numCol = k; return; }
          return;
        }
        cols.push({ k, header: h.replace(/\s+/g, ' ').trim() });
      });
      if (!model) model = { cols, numCol, width };
      else if (cols.map((c) => c.header).join('|') !== model.cols.map((c) => c.header).join('|')) {
        warnings.push(warn('table-different-header', `Weitere Tabelle mit anderen Spaltentiteln (${cols.map((c) => c.header).join(' | ')}) übersprungen`));
        continue;
      }
    }
    if (!model) continue;
    for (let i = (hIdx >= 0 ? hIdx + 1 : 0); i < G.length; i++) {
      const r = G[i];
      if (r.header) continue;
      // Wiederholte Kopfzeile?
      const firstTexts = r.g.map((x) => (x && x.spanStart && !x.merged ? htmlToText(cellHtml(x.cell, { deleted: 'drop' })) : ''));
      if (model.cols.every((c) => firstTexts[c.k] === c.header)) continue;
      // Über alle Spalten verbundene Zeile -> Fundstelle
      const distinct = new Set(r.g.filter(Boolean).map((x) => x.cell));
      if (distinct.size === 1 && r.g.length >= model.width - 1 && r.g.length > 1) {
        const t = htmlToText(cellHtml(r.g[0].cell, { deleted: 'drop' })).trim();
        if (t) { pendingLabel = t; merged++; }
        continue;
      }
      const num = model.numCol >= 0 && r.g[model.numCol] ? htmlToText(cellHtml(r.g[model.numCol].cell, { deleted: 'drop' })).trim() : null;
      const cells = {};
      let any = false;
      model.cols.forEach((c, ci) => {
        const x = r.g[c.k];
        if (!x || (x.merged && !x.spanStart)) { cells[ci] = { html: '', text: '', status: null, empty: true }; return; }
        const html = x.merged ? '' : cellHtml(x.cell, ropts);
        const text = htmlToText(html);
        const runs = flatParas(x.cell.blocks).flatMap((p) => p.runs);
        if (runs.some((u) => u.ins || u.del)) tracked++;
        if (runs.some((u) => u.color && u.t && u.t.trim())) colored++;
        cells[ci] = { html, text, status: colorStatus(x.cell.fill) || null, empty: !text };
        if (text) any = true;
      });
      if (!any && !num) continue;
      rowsOut.push({ num: num && /^\d+[a-z]*$/i.test(num) ? num : null, label: pendingLabel, cells });
      if (num && !/^\d+[a-z]*$/i.test(num)) warnings.push(warn('num-unreadable', `Zeilennummer nicht lesbar: "${num.slice(0, 20)}"`));
      pendingLabel = null;
    }
  }
  if (!model) {
    warnings.push(warn('no-table', 'Keine Tabelle mit mindestens zwei Textspalten gefunden.'));
    return { meta, columns: [], rows: [], warnings, stats: { rows: 0 } };
  }
  const columns = model.cols.map((c, i) => ({ index: i, header: c.header, suggestedTrack: suggestTrack(c.header) }));
  const tracker = new StructureTracker();
  const pref = ['com', 'council', 'ep', 'agreement'];
  const order = [...pref.map((t) => columns.findIndex((c) => c.suggestedTrack === t)).filter((i) => i >= 0), ...columns.map((c) => c.index)];
  const tableLabels = rowsOut.filter((r) => r.label).length > rowsOut.length * 0.2;
  let prev = null;
  const rows = rowsOut.map((r) => {
    const first = order.map((ci) => r.cells[ci] && !r.cells[ci].empty ? htmlToCleanText(r.cells[ci].html) : '').find(Boolean) || '';
    const derived = tracker.feed(first);
    let path, label = r.label, labelSource = r.label ? 'table' : null;
    if (label) { path = parseLabel(label); if (derived.target && path.kind === 'article') path.target = derived.target; }
    else if (tableLabels && prev) { path = prev.path; label = prev.label; labelSource = 'inherited'; }
    else { path = derived; label = labelFromPath(derived); labelSource = 'derived'; }
    prev = { num: r.num, label, labelSource, path, group: groupOf(path), amends: amendsOf(path), status: null, cells: r.cells };
    return prev;
  });
  if (tracked) warnings.push(warn('tracked-changes', `${tracked} Zellen mit Änderungsverfolgung: Einfügungen übernommen, Löschungen ${ropts.deleted === 'drop' ? 'weggelassen' : 'als gestrichen markiert'}.`));
  if (colored) warnings.push(warn('colored-text', `${colored} Zellen mit farbigem Text: Farben werden nicht übernommen (nur fett, kursiv, unterstrichen, gestrichen).`));
  meta.layout = tableLabels ? 'tte' : 'classic';
  return { meta, columns, rows: uniqueDerivedLabels(rows), warnings, stats: { rows: rows.length, tables: tables.length, labelRows: merged, tracked, colored } };
}

export function parseTextDocx(bytes, opts = {}) {
  const d = readDocx(bytes);
  const warnings = [...d.warnings];
  const meta = { kind: 'compromise', source: 'docx', ref: null, date: null, procedure: null, title: null, classification: 'internal' };
  if (!d.ok) return { meta, columns: [], rows: [], warnings, stats: { rows: 0 } };
  const ropts = { deleted: opts.deleted || 'mark', inserted: opts.inserted || 'plain' };
  const paras = [];
  let numbered = 0;
  const walk = (blocks) => {
    for (const b of blocks) {
      if (b.type === 'p') {
        const html = segmentsToHtml(runsToSegments(b.runs, ropts));
        const text = htmlToText(html);
        if (b.numbered) numbered++;
        if (text) paras.push({ html, text });
      } else if (b.type === 'tbl') for (const r of b.rows) for (const c of r.cells) walk(c.blocks);
    }
  };
  walk(d.body);
  const all = paras.map((p) => p.text).join('\n');
  const head = paras.slice(0, 30).map((p) => p.text).join('\n');
  meta.ref = parseDocRef(head); meta.date = parseDateEn(head); meta.procedure = parseProcedure(all.slice(0, 5000));
  meta.classification = parseClassification(head) || 'internal';
  const sm = /Subject:\s*([^\n]{10,600})/.exec(head); if (sm) meta.title = sm[1].replace(/\s+/g, ' ').trim();
  // Beginn des Rechtstexts: "ANNEX" bzw. Formel
  let start = paras.findIndex((p) => /^ANNEX$/.test(p.text.trim()));
  if (start < 0) start = paras.findIndex((p) => /^(Proposal for a|REGULATION OF|THE EUROPEAN PARLIAMENT AND THE COUNCIL)/.test(p.text));
  if (start < 0) start = 0; else if (/^ANNEX$/.test(paras[start].text.trim())) start++;
  const tracker = new StructureTracker();
  const rows = paras.slice(start).map((p) => {
    const path = tracker.feed(htmlToCleanText(p.html) || p.text);
    return { num: null, label: labelFromPath(path), labelSource: 'derived', path, group: groupOf(path), amends: amendsOf(path), status: null, cells: { 0: { html: p.html, text: p.text, status: null, empty: false } } };
  });
  if (numbered) warnings.push(warn('auto-numbering', `${numbered} Absätze mit automatischer Word-Nummerierung: die Nummern selbst stehen nicht im Text und fehlen im Import.`));
  for (const n of d.notes || []) {
    const r = rows.find((x) => x.cells[0].html.includes(`<sup>${n.n}</sup>`));
    if (r) { r.cells[0].html += `<br><sup>${n.n}</sup> ${n.text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}`; r.cells[0].text = htmlToText(r.cells[0].html); }
  }
  meta.kind = /mandate|general approach/i.test(meta.title || '') ? 'mandate' : 'compromise';
  return { meta, columns: [{ index: 0, header: meta.kind === 'mandate' ? 'Council mandate' : 'Compromise text', suggestedTrack: suggestTextTrack(meta) }], rows, warnings, stats: { rows: rows.length, numbered } };
}
