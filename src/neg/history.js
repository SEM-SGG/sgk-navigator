// SGK-Navigator, Modul Verhandlung — Auswertungen (ESM, isomorph, rein)
//
// rowHistory(dossier, rowId, trackId) -> [ { doc, ref, date, html, text, status, empty, change } ]
//   change: "new" (erste Fassung mit Text) | "changed" (geltender Wortlaut anders) | "markup" (nur Auszeichnung anders) | "unchanged" | "status" | "removed" | "empty"
// changesBetween(dossier, docA, docB, trackId) -> [ { row, num, label, change:"changed"|"new"|"removed"|"status", a, b, diff } ]
//   docA darf null sein: dann gilt die letzte frühere Fassung derselben Spur vor docB (je Zeile).
// stalePositions(dossier) -> [ rowId ]   (Text der Bezugsspur hat sich seit dem Bezugsdokument geändert)
// rowStatus(dossier, rowId) -> "agreed"|"provisional"|"open"|"deleted"|null  (jüngster Status über alle Spuren)

import { docsByDate, sortedRows } from './model.js';
import { compareCells, sameText, sameHtml, sameClean } from './diff.js';

export function rowHistory(dossier, rowId, trackId) {
  const docs = new Map(dossier.documents.map((d) => [d.id, d]));
  const list = ((dossier.cells[rowId] || {})[trackId] || []);
  const out = [];
  let prev = null;
  for (const c of list) {
    const d = docs.get(c.doc) || {};
    let change;
    if (c.empty) change = prev && !prev.empty ? 'removed' : 'empty';
    else if (!prev || prev.empty) change = 'new';
    else if (!sameClean(prev, c)) change = 'changed';
    else if (!sameText(prev, c) || !sameHtml(prev, c)) change = 'markup';   // nur Auszeichnung der Quelle anders
    else if ((prev.status || null) !== (c.status || null)) change = 'status';
    else change = 'unchanged';
    out.push({ doc: c.doc, ref: d.ref || null, date: d.date || null, kind: d.kind || null, html: c.html, text: c.text, status: c.status || null, empty: !!c.empty, change });
    prev = c;
  }
  return out;
}

function cellAt(dossier, rowId, trackId, docId) {
  return ((dossier.cells[rowId] || {})[trackId] || []).find((c) => c.doc === docId) || null;
}

/** Zelle der letzten Fassung dieser Spur vor docB (für die Zeile) */
function prevCell(dossier, rowId, trackId, docB, order) {
  const list = ((dossier.cells[rowId] || {})[trackId] || []);
  const ib = order.get(docB);
  let best = null;
  for (const c of list) { const i = order.get(c.doc); if (i !== undefined && i < ib) best = c; }
  return best;
}

export function changesBetween(dossier, docA, docB, trackId, { clean = false, markup = false } = {}) {
  const docs = docsByDate(dossier);
  const order = new Map(docs.map((d, i) => [d.id, i]));
  if (!order.has(docB)) return [];
  const out = [];
  for (const r of sortedRows(dossier)) {
    const b = cellAt(dossier, r.id, trackId, docB);
    const a = docA ? cellAt(dossier, r.id, trackId, docA) : prevCell(dossier, r.id, trackId, docB, order);
    const aHas = a && !a.empty, bHas = b && !b.empty;
    let change = null;
    if (bHas && !aHas) change = 'new';
    else if (aHas && !bHas) {
      // nur als gestrichen melden, wenn docB diese Spur liefert (sonst fehlt die Spur schlicht)
      const dB = docs.find((d) => d.id === docB);
      if (dB && (dB.tracks || []).includes(trackId)) change = 'removed';
    } else if (aHas && bHas) {
      if (!sameClean(a, b)) change = 'changed';
      else if ((!sameText(a, b) || !sameHtml(a, b)) && markup) change = 'markup';
      else if ((a.status || null) !== (b.status || null)) change = 'status';
    }
    if (!change) continue;
    const item = { row: r.id, num: r.num || null, label: r.label || '', change, a: a ? { doc: a.doc, html: a.html, text: a.text, status: a.status || null } : null, b: b ? { doc: b.doc, html: b.html, text: b.text, status: b.status || null } : null };
    if (change === 'changed') item.diff = compareCells(a, b, { clean });
    out.push(item);
  }
  return out;
}

export function stalePositions(dossier) {
  const docs = docsByDate(dossier);
  const order = new Map(docs.map((d, i) => [d.id, i]));
  const out = [];
  for (const [rowId, pos] of Object.entries(dossier.positions || {})) {
    const basis = pos.basis;
    if (!basis || !basis.track || !basis.doc || !order.has(basis.doc)) continue;
    const list = ((dossier.cells[rowId] || {})[basis.track] || []);
    if (!list.length) continue;
    const ib = order.get(basis.doc);
    // Bezugszelle: die Zelle des Bezugsdokuments oder die letzte davor
    let ref = null;
    for (const c of list) { const i = order.get(c.doc); if (i !== undefined && i <= ib) ref = c; }
    const latest = list[list.length - 1];
    if ((order.get(latest.doc) ?? -1) <= ib) continue;
    if (!ref) { if (!latest.empty) out.push(rowId); continue; }
    if (!!ref.empty !== !!latest.empty || !sameClean(ref, latest)) out.push(rowId);
  }
  return out;
}

const STATUS_RANK = { agreed: 3, provisional: 2, open: 1, deleted: 0 };
export function rowStatus(dossier, rowId) {
  const docs = docsByDate(dossier);
  const order = new Map(docs.map((d, i) => [d.id, i]));
  let best = null, bi = -1;
  for (const list of Object.values(dossier.cells[rowId] || {})) {
    for (const c of list) {
      const i = order.get(c.doc) ?? -1;
      if (c.status && (i > bi || (i === bi && (STATUS_RANK[c.status] ?? -1) > (STATUS_RANK[best] ?? -1)))) { best = c.status; bi = i; }
    }
  }
  return best;
}
