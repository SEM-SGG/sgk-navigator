// Zeilenauswahl und Zellansicht für Synopse, Position, Konsultation und Druckansichten.
import { fold } from '../../lib/format.js';
import { cellFor, prevCell, compareCells, rowStatus, stalePositions, docsByDate, htmlToText, hasPosition, sanitizeInline, subgroupOf, cleanText } from './core.js';
import { escapeHtml } from '../../lib/format.js';

/** Zwischenspeicher je Dossierobjekt (Dossiers sind unveränderlich). */
const caches = new WeakMap();
function cache(d) {
  let c = caches.get(d);
  if (!c) { c = { stale: null, status: new Map(), search: new Map(), changed: new Map(), docIdx: null }; caches.set(d, c); }
  return c;
}
export function staleSet(d) { const c = cache(d); if (!c.stale) c.stale = new Set(stalePositions(d)); return c.stale; }
export function statusOf(d, rowId) { const c = cache(d); if (!c.status.has(rowId)) c.status.set(rowId, rowStatus(d, rowId)); return c.status.get(rowId); }
function docIdx(d) { const c = cache(d); if (!c.docIdx) c.docIdx = new Map(docsByDate(d).map((x, i) => [x.id, i])); return c.docIdx; }

function searchText(d, row) {
  const c = cache(d);
  let s = c.search.get(row.id);
  if (s === undefined) {
    const parts = [row.label, row.num || ''];
    for (const list of Object.values(d.cells[row.id] || {})) { const last = list[list.length - 1]; if (last) parts.push(cleanText(last)); }
    const p = d.positions[row.id];
    if (p) parts.push(p.text, p.proposal, p.fallback, p.owner);
    s = fold(parts.filter(Boolean).join(' \n '));
    c.search.set(row.id, s);
  }
  return s;
}
const norm = (x) => cleanText(x).replace(/\s+/g, ' ').trim();
/** Hat sich die Zeile nach Fassung docId in irgendeiner Spur geändert? */
export function changedSince(d, rowId, docId) {
  const c = cache(d);
  const k = rowId + '|' + docId;
  if (c.changed.has(k)) return c.changed.get(k);
  const idx = docIdx(d);
  const lim = idx.get(docId) ?? -1;
  let res = false;
  for (const list of Object.values(d.cells[rowId] || {})) {
    let atX = null, last = null;
    for (const x of list) { const i = idx.get(x.doc) ?? -1; if (i <= lim) atX = x; last = x; }
    if (last && (idx.get(last.doc) ?? -1) > lim && norm(atX) !== norm(last)) { res = true; break; }
    if (last && !atX && (idx.get(last.doc) ?? -1) > lim) { res = true; break; }
  }
  c.changed.set(k, res);
  return res;
}

const csv = (s) => (s ? String(s).split(',').filter(Boolean) : []);
/** Filter aus dem Hash lesen. */
export function filtersOf(route) {
  return { q: route.nq || '', since: route.nfc || null, status: csv(route.nfs), pos: route.nfp || null, stance: csv(route.nfh), prio: csv(route.nfr), stale: route.nfo === '1' };
}
export const activeFilterCount = (f) => [f.q, f.since, f.status.length, f.pos, f.stance.length, f.prio.length, f.stale].filter(Boolean).length;

export function filterRows(d, rows, f) {
  const q = f.q ? fold(f.q.trim()) : '';
  const words = q ? q.split(/\s+/).filter(Boolean) : [];
  const stale = f.stale ? staleSet(d) : null;
  return rows.filter((r) => {
    const p = d.positions[r.id];
    if (f.pos === 'with' && !hasPosition(p)) return false;
    if (f.pos === 'without' && hasPosition(p)) return false;
    if (f.stance.length && !(p && f.stance.includes(p.stance || 'none'))) return false;
    if (f.prio.length && !(p && hasPosition(p) && f.prio.includes(p.priority))) return false;
    if (stale && !stale.has(r.id)) return false;
    if (f.status.length) { const s = statusOf(d, r.id) || 'none'; if (!f.status.includes(s)) return false; }
    if (f.since && !changedSince(d, r.id, f.since)) return false;
    if (words.length) { const s = searchText(d, r); if (!words.every((w) => s.includes(w))) return false; }
    return true;
  });
}

/** Gliederung: Gruppen in Reihenfolge, je Gruppe Zähler und optionale Untergruppen. */
export function outline(rows, visible) {
  const vis = new Set(visible.map((r) => r.id));
  const groups = [];
  const byId = new Map();
  let seenArticle = false;
  for (const r of rows) {
    let g = r.group || 'other';
    // Anzeigegruppen: Titel des Vorschlags zur Präambel, Schlussformeln nach den Artikeln, Anhang ohne Nummer.
    if (/^art_/.test(g)) seenArticle = true;
    else if (g === 'other' && /^annex\b/i.test(r.label || '')) g = 'annex_';
    else if (g === 'other' && !seenArticle && /title/i.test(r.label || '')) g = 'preamble';
    else if (g === 'preamble' && seenArticle) g = 'final';
    let G = byId.get(g);
    if (!G) { G = { id: g, total: 0, shown: 0, first: null, subs: [], subMap: new Map() }; byId.set(g, G); groups.push(G); }
    G.total++;
    if (vis.has(r.id)) { G.shown++; if (!G.first) G.first = r.id; }
    const sg = subgroupOf(r);
    if (sg) {
      let S = G.subMap.get(sg);
      if (!S) { S = { id: sg, total: 0, shown: 0, first: null }; G.subMap.set(sg, S); G.subs.push(S); }
      S.total++;
      if (vis.has(r.id)) { S.shown++; if (!S.first) S.first = r.id; }
    }
  }
  for (const G of groups) if (G.total < 12 || G.subs.length < 2) G.subs = [];
  return groups;
}

/**
 * Ansicht einer Zelle: { cell, html (sicher), diff: boolean, note } für Spur und Diff-Einstellung.
 * opt: { mode: none|com|prev|tracks, docs: {track: docId}, a, b }
 */
export function cellView(d, rowId, track, opt) {
  const c = cellFor(d, rowId, track, opt.docs[track] || null);
  if (!c) return { cell: null, html: '', diff: false, note: 'none' };
  if (c.empty) return { cell: c, html: '', diff: false, note: 'empty' };
  let base = null, useDiff = false;
  if (opt.mode === 'com' && track !== 'com') { base = cellFor(d, rowId, 'com', null); useDiff = true; }
  else if (opt.mode === 'prev') { base = prevCell(d, rowId, track, c); useDiff = true; if (!base) return { cell: c, html: shown(c.html, opt), diff: false, note: 'first' }; }
  else if (opt.mode === 'tracks' && opt.a && opt.b && track === opt.b && opt.a !== opt.b) { base = cellFor(d, rowId, opt.a, opt.docs[opt.a] || null); useDiff = true; }
  if (!useDiff) return { cell: c, html: shown(c.html, opt), diff: false, note: null };
  const r = compareCells(base && !base.empty ? base.html : '', c.html, { clean: true });
  return { cell: c, html: opt.markup === false ? stripSource(r.redline) : r.redline, diff: true, changed: r.changed, note: !base || base.empty ? 'nobase' : r.changed ? null : 'same' };
}

/** Auszeichnung der Quelle entfernen: gestrichene Teile weg, b/i/u weg (Diff-Markierung ins/del bleibt). */
export function stripSource(html) {
  return String(html || '').replace(/<s>[\s\S]*?<\/s>/gi, '').replace(/<\/?(b|i|u|strong|em)>/gi, '');
}
/** Anzeige einer Zelle ohne Diff: mit oder ohne Auszeichnung der Quelle. */
export function shown(html, opt) {
  return opt && opt.markup === false ? stripSource(sanitizeInline(html)) : sanitizeInline(html);
}
export { escapeHtml };
