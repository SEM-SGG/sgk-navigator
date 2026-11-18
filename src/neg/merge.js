// SGK-Navigator, Modul Verhandlung — Zusammenführen einer neuen Fassung (ESM, isomorph, rein)
//
// planMerge(dossier, parsedDoc, mapping, opts?) -> MergePlan
//   mapping: { <colIndex>: trackId | null }  (null/fehlend = Spalte nicht übernehmen)
//   opts: { docMeta?: { id?, kind?, ref?, title?, date?, classification?, file?, note? }, now? }
// applyMerge(dossier, plan, overrides?) -> { dossier, docId, rowIds:{<planIdx>: rowId}, skipped:{ambiguous,new,manual}, warnings }
//   overrides: { rows?: { <planIdx>: { rowId?: string|"new", skip?: boolean } }, doc?: {…Metadaten},
//                ambiguous?: "skip" (Standard: mehrdeutige Zeilen ohne Entscheid nicht übernehmen) | "new",
//                unmatched?: "new" (Standard: neue Zeilen anlegen) | "skip" }
//
// MergePlan = { doc, mapping, rows:[PlanRow], missing:[rowId], stats, warnings }
// PlanRow  = { idx, num, label, path, match:"matched"|"new"|"ambiguous", rowId, score, reason, candidates:[{rowId, score, reason}],
//              after: rowId|null, cells:{ <trackId>: { change:"unchanged"|"changed"|"new"|"removed"|"empty"|"status", html, text, status, prev } } }
//
// Abgleich (SPEC2 §5.1): zuerst Zeilennummer + Fundstelle, dann Pfad, dann Textähnlichkeit; Reihenfolge wird respektiert
// (Kandidaten zwischen den benachbarten sicheren Treffern erhalten einen Bonus). Neue Zwischenzeilen ("12a") werden nach
// dem vorangehenden Treffer eingeordnet.

import { similarity, normText, clone, htmlToText, htmlToCleanText } from './util.js';
import { pathKey, groupOf } from './paths.js';
import { sortedRows, docsByDate, latestCell, defaultBasis } from './model.js';
import { sameText, sameHtml } from './diff.js';

const TH_MATCH = 0.78;      // ab hier sicherer Treffer
const TH_AMBIG = 0.5;       // ab hier mehrdeutig (Prüfmaske)
const MARGIN = 0.08;        // Abstand zum zweitbesten Kandidaten

function normLabel(l) { return String(l || '').toLowerCase().replace(/\s+/g, ' ').replace(/[“”"']/g, '').trim(); }

/** Texte einer geparsten Zeile je Spur (nach mapping) */
function parsedTexts(prow, mapping) {
  const out = {};
  for (const [ci, tid] of Object.entries(mapping)) {
    if (!tid) continue;
    const c = prow.cells[ci];
    if (c && !c.empty && c.text) out[tid] = htmlToCleanText(c.html) || c.text;
  }
  return out;
}
function simText(a, b) { return similarity(a, b); }

function rowTexts(dossier, rowId) {
  const out = {};
  for (const [tid, list] of Object.entries(dossier.cells[rowId] || {})) {
    for (let k = list.length - 1; k >= 0; k--) { const c = list[k]; if (!c.empty && c.text) { out[tid] = htmlToCleanText(c.html) || c.text; break; } }
  }
  return out;
}

function textScore(pt, rt) {
  let best = 0, same = false;
  for (const [t, a] of Object.entries(pt)) if (rt[t]) { same = true; best = Math.max(best, similarity(a, rt[t])); }
  if (!same) {
    // keine gemeinsame Spur: über Kreuz vergleichen (z. B. Kompromisstext gegen Kommissionsvorschlag)
    for (const a of Object.values(pt)) for (const b of Object.values(rt)) best = Math.max(best, similarity(a, b) * 0.95);
  }
  return best;
}

export function planMerge(dossier, parsed, mapping, opts = {}) {
  const warnings = [];
  const docId = (opts.docMeta && opts.docMeta.id) || nextDocId(dossier);
  const tracks = [...new Set(Object.values(mapping).filter(Boolean))];
  for (const t of tracks) if (!dossier.tracks.some((x) => x.id === t)) warnings.push({ code: 'unknown-track', message: `Spur ${t} existiert im Dossier nicht und wird angelegt` });
  const meta = parsed.meta || {};
  const doc = {
    id: docId, kind: meta.kind || 'other', ref: meta.ref || null, title: meta.title || '', date: meta.date || null,
    classification: meta.classification || 'internal', file: meta.file || null, tracks,
    stats: { rows: parsed.rows.length, pages: meta.pages || null }, warnings: (parsed.warnings || []).map((w) => w.message || String(w)), note: '',
    ...(opts.docMeta || {}),
  };
  doc.id = docId;
  const existing = sortedRows(dossier);
  const pos = new Map(existing.map((r, i) => [r.id, i]));
  const exTexts = new Map(existing.map((r) => [r.id, rowTexts(dossier, r.id)]));
  const P = parsed.rows.map((r, idx) => ({ idx, r, texts: parsedTexts(r, mapping), key: pathKey(r.path), nl: normLabel(r.label) }));
  const assigned = new Map();   // planIdx -> {rowId, score, reason}
  const used = new Set();

  // Pass 1: Zeilennummer (+ Fundstelle) eindeutig
  const byNum = new Map();
  for (const r of existing) if (r.num) { const k = String(r.num).toLowerCase(); if (!byNum.has(k)) byNum.set(k, []); byNum.get(k).push(r); }
  for (const p of P) {
    if (!p.r.num) continue;
    const cands = (byNum.get(String(p.r.num).toLowerCase()) || []).filter((r) => !used.has(r.id));
    if (cands.length !== 1) continue;
    const r = cands[0];
    const labelOk = !p.nl || !r.label || normLabel(r.label) === p.nl || pathKey(r.path) === p.key;
    const ts = textScore(p.texts, exTexts.get(r.id));
    const hasText = Object.keys(p.texts).length && Object.keys(exTexts.get(r.id)).length;
    if (labelOk && (!hasText || ts >= 0.25)) { assigned.set(p.idx, { rowId: r.id, score: 1, reason: 'num+label' }); used.add(r.id); }
    else if (labelOk || ts >= 0.6) { assigned.set(p.idx, { rowId: r.id, score: 0.85, reason: labelOk ? 'num+label, Text stark abweichend' : 'num+text' }); used.add(r.id); }
  }
  // Pass 2: übrige über Pfad und Text, mit Reihenfolge-Fenster
  const anchorsBefore = (idx) => { for (let k = idx - 1; k >= 0; k--) if (assigned.has(k)) return pos.get(assigned.get(k).rowId); return -1; };
  const anchorsAfter = (idx) => { for (let k = idx + 1; k < P.length; k++) if (assigned.has(k)) return pos.get(assigned.get(k).rowId); return existing.length; };
  const pending = [];
  for (const p of P) {
    if (assigned.has(p.idx)) continue;
    const lo = anchorsBefore(p.idx), hi = anchorsAfter(p.idx);
    const cands = [];
    for (const r of existing) {
      if (used.has(r.id)) continue;
      const i = pos.get(r.id);
      const inWin = i > lo && i < hi;
      // ausserhalb des Fensters nur bei sehr ähnlichem Text
      const ts = textScore(p.texts, exTexts.get(r.id));
      const samePath = p.key && p.r.path && p.r.path.kind !== 'other' && pathKey(r.path) === p.key;
      const sameLabel = p.nl && normLabel(r.label) === p.nl;
      const sameNum = p.r.num && r.num && String(p.r.num).toLowerCase() === String(r.num).toLowerCase();
      let score = ts;
      const why = [];
      if (ts > 0.3) why.push(`Text ${(ts * 100).toFixed(0)} %`);
      if (sameLabel) { score = Math.max(score, 0.55) + 0.15; why.push('Fundstelle'); }
      else if (samePath) { score = Math.max(score, 0.5) + 0.1; why.push('Pfad'); }
      if (sameNum) { score += 0.1; why.push('Nummer'); }
      if (inWin) { score += 0.08; why.push('Reihenfolge'); } else score -= 0.1;
      if (score >= TH_AMBIG - 0.1) cands.push({ rowId: r.id, score, reason: why.join(', ') });
    }
    cands.sort((a, b) => b.score - a.score);
    pending.push({ p, cands: cands.slice(0, 5) });
  }
  // gierig nach bestem Wert zuteilen (nur sichere Treffer)
  pending.sort((a, b) => (b.cands[0]?.score || 0) - (a.cands[0]?.score || 0));
  for (const { p, cands } of pending) {
    const free = cands.filter((c) => !used.has(c.rowId));
    const best = free[0], second = free[1];
    if (best && best.score >= TH_MATCH && (!second || best.score - second.score >= MARGIN)) {
      assigned.set(p.idx, { rowId: best.rowId, score: best.score, reason: best.reason }); used.add(best.rowId);
    }
  }
  // Pass 3: Ausrichtung zwischen sicheren Treffern (Reihenfolge bleibt erhalten): in jeder Lücke die Folge
  // nicht zugeordneter Zeilen beider Seiten so paaren, dass die Summe der Textähnlichkeit maximal ist (ab 0.35).
  alignGaps(P, existing, pos, assigned, used, exTexts);
  const ambiguous = new Map();
  for (const { p, cands } of pending) {
    if (assigned.has(p.idx)) continue;
    const free = cands.filter((c) => !used.has(c.rowId));
    if (free[0] && free[0].score >= TH_AMBIG) ambiguous.set(p.idx, free);
  }
  // Plan-Zeilen
  const rows = [];
  let lastRowId = null;
  for (const p of P) {
    const a = assigned.get(p.idx);
    const amb = ambiguous.get(p.idx);
    const match = a ? 'matched' : amb ? 'ambiguous' : 'new';
    const rowId = a ? a.rowId : null;
    const cells = {};
    for (const [ci, tid] of Object.entries(mapping)) {
      if (!tid) continue;
      const c = p.r.cells[ci] || { html: '', text: '', status: null, empty: true };
      const prev = rowId ? latestCell(dossier, rowId, tid) : null;
      let change;
      if (c.empty) change = prev && !prev.empty ? 'removed' : 'empty';
      else if (!prev || prev.empty) change = 'new';
      else if (!sameText(prev, c)) change = 'changed';
      else if (!sameHtml(prev, c)) change = 'changed';
      else if ((prev.status || null) !== (c.status || null)) change = 'status';
      else change = 'unchanged';
      cells[tid] = { change, html: c.html, text: c.text, status: c.status || null, ...(c.notes ? { notes: c.notes } : {}), ...(c.tags ? { tags: c.tags } : {}), prev: prev ? { doc: prev.doc, html: prev.html, text: prev.text, status: prev.status || null } : null };
    }
    const cap = (v) => Math.round(Math.min(1, v) * 100) / 100;
    rows.push({ idx: p.idx, num: p.r.num || null, label: p.r.label || '', path: p.r.path || { kind: 'other' }, labelSource: p.r.labelSource || null, amends: p.r.amends || null, match, rowId, score: cap(a ? a.score : amb ? amb[0].score : 0), reason: a ? a.reason : '', candidates: (amb || []).map((c) => ({ ...c, score: cap(c.score) })), after: lastRowId, cells });
    if (rowId) lastRowId = rowId;
  }
  // Zeilen des Dossiers mit Inhalt in den betroffenen Spuren, die in der neuen Fassung fehlen
  const matchedIds = new Set(rows.filter((r) => r.rowId).map((r) => r.rowId));
  const ambIds = new Set(rows.flatMap((r) => r.candidates.map((c) => c.rowId)));
  const missing = existing.filter((r) => !matchedIds.has(r.id) && !ambIds.has(r.id) && tracks.some((t) => { const c = latestCell(dossier, r.id, t); return c && !c.empty; })).map((r) => r.id);
  const stats = {
    rows: rows.length,
    matched: rows.filter((r) => r.match === 'matched').length,
    new: rows.filter((r) => r.match === 'new').length,
    ambiguous: rows.filter((r) => r.match === 'ambiguous').length,
    missing: missing.length,
    cells: {},
  };
  for (const r of rows) for (const c of Object.values(r.cells)) stats.cells[c.change] = (stats.cells[c.change] || 0) + 1;
  return { doc, mapping: { ...mapping }, rows, missing, stats, warnings };
}

function alignGaps(P, existing, pos, assigned, used, exTexts) {
  const anchors = [];
  for (const p of P) if (assigned.has(p.idx)) anchors.push({ pi: p.idx, ei: pos.get(assigned.get(p.idx).rowId) });
  // nur monotone Anker verwenden
  const mono = [];
  for (const a of anchors) if (!mono.length || a.ei > mono[mono.length - 1].ei) mono.push(a);
  const bounds = [{ pi: -1, ei: -1 }, ...mono, { pi: P.length, ei: existing.length }];
  for (let k = 1; k < bounds.length; k++) {
    const a = bounds[k - 1], b = bounds[k];
    const ps = P.filter((p) => p.idx > a.pi && p.idx < b.pi && !assigned.has(p.idx));
    const es = existing.filter((r, i) => i > a.ei && i < b.ei && !used.has(r.id));
    if (!ps.length || !es.length || ps.length * es.length > 40000) continue;
    const S = ps.map((p) => es.map((r) => { const s = textScore(p.texts, exTexts.get(r.id)); return s >= 0.35 ? s : 0; }));
    // DP: maximale Summe bei erhaltener Reihenfolge
    const n = ps.length, m = es.length;
    const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) D[i][j] = Math.max(D[i - 1][j], D[i][j - 1], D[i - 1][j - 1] + S[i - 1][j - 1]);
    let i = n, j = m;
    while (i > 0 && j > 0) {
      if (S[i - 1][j - 1] > 0 && D[i][j] === D[i - 1][j - 1] + S[i - 1][j - 1]) {
        assigned.set(ps[i - 1].idx, { rowId: es[j - 1].id, score: 0.5 + S[i - 1][j - 1] / 2, reason: `Text ${(S[i - 1][j - 1] * 100).toFixed(0)} %, Reihenfolge (Ausrichtung)` });
        used.add(es[j - 1].id); i--; j--;
      } else if (D[i][j] === D[i - 1][j]) i--; else j--;
    }
  }
}

function nextDocId(dossier) {
  let n = dossier.documents.length + 1;
  const ids = new Set(dossier.documents.map((d) => d.id));
  while (ids.has(`doc${n}`)) n++;
  return `doc${n}`;
}

function nextRowId(used) {
  let n = used.size + 1;
  let id;
  do { id = `r${String(n * 10).padStart(6, '0')}`; n++; } while (used.has(id));
  used.add(id);
  return id;
}

/**
 * Plan übernehmen. Gibt ein neues Dossier zurück (Eingabe bleibt unverändert).
 */
export function applyMerge(dossier, plan, overrides = {}) {
  const warnings = [];
  const now = overrides.now || new Date().toISOString();
  const d = clone(dossier);
  const doc = { ...plan.doc, ...(overrides.doc || {}), importedAt: now };
  if (d.documents.some((x) => x.id === doc.id)) throw new Error(`Dokument ${doc.id} existiert bereits`);
  for (const t of doc.tracks) if (!d.tracks.some((x) => x.id === t)) d.tracks.push({ id: t, kind: 'other', label: { de: t, fr: t, en: t } });
  d.documents.push(doc);
  const usedIds = new Set(d.rows.map((r) => r.id));
  const orderOf = new Map(d.rows.map((r) => [r.id, r.order]));
  const rowIds = {};
  const ro = overrides.rows || {};
  const ambiguousMode = overrides.ambiguous || 'skip';   // "skip" (Standard) | "new"
  const newMode = overrides.unmatched || 'new';          // "new" (Standard) | "skip": neue Zeilen nicht anlegen
  const skipped = { ambiguous: 0, new: 0, manual: 0 };
  // Einfügepunkte: neue Zeilen nach dem vorangehenden zugeordneten Treffer der Fassung
  let prevId = null;
  const inserts = []; // { id, afterId }
  for (const pr of plan.rows) {
    const o = ro[pr.idx] || {};
    if (o.skip) { skipped.manual++; continue; }
    let rid = null;
    if (o.rowId && o.rowId !== 'new') {
      if (!orderOf.has(o.rowId)) { warnings.push({ code: 'override-unknown-row', message: `Unbekannte Zeile ${o.rowId}` }); }
      else rid = o.rowId;
    } else if (!o.rowId && pr.match === 'matched') rid = pr.rowId;
    if (!o.rowId && pr.match === 'ambiguous') {
      if (ambiguousMode === 'skip') { skipped.ambiguous++; continue; }
      warnings.push({ code: 'ambiguous-as-new', message: `Mehrdeutige Zeile ${pr.num || pr.label} ohne Entscheid als neue Zeile übernommen`, idx: pr.idx });
    }
    if (!o.rowId && pr.match === 'new' && newMode === 'skip') { skipped.new++; continue; }
    if (!rid) {
      rid = nextRowId(usedIds);
      d.rows.push({ id: rid, order: 0, num: pr.num, label: pr.label, path: pr.path, group: groupOf(pr.path), amends: pr.amends || null, createdBy: doc.id });
      inserts.push({ id: rid, afterId: prevId });
    } else {
      // Zeilennummer/Fundstelle aktualisieren, falls neu vorhanden
      const row = d.rows.find((r) => r.id === rid);
      if (pr.num && row.num !== pr.num) { row.numHistory = [...(row.numHistory || []), { doc: doc.id, num: row.num }]; row.num = pr.num; }
      if (pr.label && pr.labelSource === 'table' && row.label !== pr.label) { row.label = pr.label; row.path = pr.path; row.group = groupOf(pr.path); }
      if (pr.amends && !row.amends) row.amends = pr.amends;
    }
    rowIds[pr.idx] = rid;
    prevId = rid;
    // Zellen
    for (const [tid, c] of Object.entries(pr.cells)) {
      // leere Zelle knapp speichern: { doc, empty:true } (+ status)
      const cell = c.text ? { doc: doc.id, html: c.html || '', text: c.text, status: c.status || null, empty: false } : { doc: doc.id, empty: true, status: c.status || null };
      if (c.notes) cell.notes = c.notes;
      if (c.tags) cell.tags = c.tags;
      if (cell.html && /<s>/.test(cell.html)) cell.clean = htmlToCleanText(cell.html);
      if (!d.cells[rid]) d.cells[rid] = {};
      if (!d.cells[rid][tid]) d.cells[rid][tid] = [];
      d.cells[rid][tid].push(cell);
    }
  }
  // Reihenfolge der neuen Zeilen festlegen
  placeInserts(d, inserts);
  // Zellen nach Dokumentdatum sortieren
  const docs = docsByDate(d);
  const di = new Map(docs.map((x, i) => [x.id, i]));
  for (const byTrack of Object.values(d.cells)) for (const t of Object.keys(byTrack)) byTrack[t].sort((a, b) => (di.get(a.doc) ?? 1e9) - (di.get(b.doc) ?? 1e9));
  d.updated = now;
  if (skipped.ambiguous) warnings.push({ code: 'ambiguous-skipped', message: `${skipped.ambiguous} mehrdeutige Zeilen ohne Entscheid nicht übernommen` });
  if (skipped.new) warnings.push({ code: 'new-skipped', message: `${skipped.new} nicht zugeordnete Zeilen nicht übernommen` });
  doc.skipped = skipped;
  return { dossier: d, docId: doc.id, rowIds, skipped, warnings };
}

function placeInserts(d, inserts) {
  if (!inserts.length) return;
  const newIds = new Set(inserts.map((x) => x.id));
  const order = d.rows.filter((r) => !newIds.has(r.id)).sort((a, b) => a.order - b.order).map((r) => r.id);
  // in Planreihenfolge einfügen: Vorgänger ist entweder eine bestehende oder eine bereits eingefügte neue Zeile
  for (const ins of inserts) {
    const at = ins.afterId === null ? -1 : order.indexOf(ins.afterId);
    order.splice(at + 1, 0, ins.id);
  }
  // neue Ordnungszahlen in Zehnerschritten (Ids bleiben stabil)
  const byId = new Map(d.rows.map((r) => [r.id, r]));
  order.forEach((id, i) => { byId.get(id).order = (i + 1) * 10; });
}

export { defaultBasis };
