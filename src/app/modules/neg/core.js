// Adapter zwischen Oberfläche und Kernbibliothek src/neg (Agent NEG-CORE).
// Alle Aufrufe der Oberfläche gehen über diese Datei. Was src/neg (noch) nicht liefert, ist hier als kleine, reine
// Ersatzfunktion umgesetzt und mit "Brücke" gekennzeichnet (Abschlussbericht: Liste der Brücken).
//
// Reine Funktionen: Eingabe-Dossier bleibt unverändert, Rückgabe ist ein neues Dossier (strukturell geteilt).
import * as N from '../../../neg/index.js';
import { gunzipSync, strFromU8 } from 'fflate';
import { getBy } from '../../lib/user.js';

export const core = N;
export const { STANCES, PRIORITIES, DECISIONS, DOC_KINDS, CLASSIFICATIONS, DEFAULT_TRACKS } = N;
export const STATUSES = ['agreed', 'provisional', 'open', 'deleted'];
export const CLASS_RANK = { public: 0, internal: 1, limite: 2, restricted: 3 };

const nowIso = () => new Date().toISOString();
const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

// ------------------------------------------------------------------ Eingebettete Ressourcen
function embeddedText(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const raw = el.textContent.trim();
  if (!raw) return null;
  const bin = atob(raw);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return strFromU8(gunzipSync(u8));
}
/** Eingebettete Beispiel-Dossiers (nur Kurzangaben; der Inhalt wird erst beim Laden entpackt). */
export function demoList() {
  return [...document.querySelectorAll('script.neg-demo')].map((el) => ({
    key: el.dataset.key, title: el.dataset.title, procedure: el.dataset.procedure, docs: Number(el.dataset.docs || 0), rows: Number(el.dataset.rows || 0), from: el.dataset.from || null, to: el.dataset.to || null,
  }));
}
export function embeddedDemo(key) {
  const k = key || (demoList()[0] || {}).key;
  const txt = k ? embeddedText('neg-demo-' + k) : null;
  if (!txt) return null;
  const { dossier, errors } = N.importDossier(txt);
  if (!dossier) throw new Error(errors.join('; '));
  dossier.demo = true;
  dossier.demoKey = k;
  return dossier;
}
export const hasEmbeddedDemo = () => demoList().length > 0;

let pdfP = null;
/** pdf.js laden: Bibliothek als Inline-Skript, Worker als Blob (CSP worker-src blob:), sonst Hauptthread. */
export function loadPdfjs() {
  if (pdfP) return pdfP;
  pdfP = (async () => {
    if (!window.pdfjsLib) {
      const src = embeddedText('neg-pdfjs');
      if (!src) throw new Error('pdf.js fehlt in dieser Datei');
      const s = document.createElement('script');
      s.textContent = src;
      document.head.appendChild(s);
      s.remove();
    }
    const lib = window.pdfjsLib;
    if (!lib || !lib.getDocument) throw new Error('pdf.js konnte nicht gestartet werden');
    const workerSource = embeddedText('neg-pdfworker');
    const ensureMain = () => {
      if (!window.pdfjsWorker) { const s = document.createElement('script'); s.textContent = workerSource; document.head.appendChild(s); s.remove(); }
      return window.pdfjsWorker;
    };
    try {
      const r = await N.setupPdfjs(lib, { workerSource, mode: 'auto', workerModule: { get WorkerMessageHandler() { return ensureMain().WorkerMessageHandler; } } });
      return r.pdfjs;
    } catch (e) {
      const r = await N.setupPdfjs(lib, { workerModule: ensureMain(), mode: 'main' });
      return r.pdfjs;
    }
  })();
  pdfP.catch(() => { pdfP = null; });
  return pdfP;
}

// ------------------------------------------------------------------ Lesen
export function docMap(d) { return new Map(d.documents.map((x) => [x.id, x])); }
export const docsByDate = N.docsByDate;
export const sortedRows = N.sortedRows;

/** Zelle, die in einer Spur für die gewählte Fassung gilt (jüngste bis einschliesslich doc). */
export function cellFor(d, rowId, track, docId) {
  return docId ? N.latestCell(d, rowId, track, { upToDoc: docId }) : N.latestCell(d, rowId, track);
}
/** Vorgängerzelle derselben Spur (vor der Zelle c). */
export function prevCell(d, rowId, track, c) {
  const list = N.cellsOf(d, rowId, track);
  const i = list.findIndex((x) => x === c || (x.doc === c.doc));
  return i > 0 ? list[i - 1] : null;
}
/** Dokumente, die Zellen für eine Spur liefern (nach Datum). */
export function docsOfTrack(d, track) {
  return N.docsByDate(d).filter((x) => (x.tracks || []).includes(track));
}
/** Höchste Einstufung der Dokumente des Dossiers. */
export function topClassification(d) {
  let best = null;
  for (const x of d.documents) if (x.classification && (best === null || (CLASS_RANK[x.classification] ?? 0) > (CLASS_RANK[best] ?? 0))) best = x.classification;
  return best;
}
export const rowStatus = (d, rowId) => N.rowStatus(d, rowId);
export const stalePositions = (d) => N.stalePositions(d);
export const rowHistory = N.rowHistory;
export const compareCells = N.compareCells;
export const changesBetween = N.changesBetween;
export const sanitizeInline = N.sanitizeInline;
export const htmlToText = N.htmlToText;
export const htmlToCleanText = N.htmlToCleanText;
/** Bereinigter Text einer Zelle (ohne Gestrichenes der Quelle) für Suche, Änderungserkennung und Diff. */
export const cleanText = (c) => (!c || c.empty ? '' : c.clean != null ? c.clean : N.htmlToCleanText(c.html || c.text || ''));
export const visibleRowId = N.visibleRowId;

/** Hat die Position Inhalt? */
export const hasPosition = (p) => !!p && (p.stance && p.stance !== 'none' || !!(p.text || p.proposal || p.fallback));

// ------------------------------------------------------------------ Dossier
export function newDossier({ title, procedure, short }) {
  const base = N.createDossier({ title, procedure, short });
  // Brücke: Id eindeutig machen (createDossier leitet sie aus der Verfahrensnummer ab)
  base.id = `${base.id}-${Date.now().toString(36)}`;
  return base;
}
export function touch(d) { return { ...d, updated: nowIso() }; }

// ------------------------------------------------------------------ Import
export const detectDocument = N.detectDocument;
export const planMerge = N.planMerge;
export const applyMerge = N.applyMerge;

/** Datei parsen: liefert ParsedDoc. type aus detectDocument; parser: 'four-column' | 'text' | 'proposal'. */
export async function parseFile({ bytes, type, parser, onProgress }) {
  if (type === 'pdf') {
    const pdfjs = await loadPdfjs();
    if (parser === 'text') return N.parseTextPdf(bytes, { pdfjs, onProgress });
    return N.parseFourColumnPdf(bytes, { pdfjs, onProgress });
  }
  if (type === 'docx') return parser === 'text' ? N.parseTextDocx(bytes) : N.parseFourColumnDocx(bytes);
  if (type === 'html') return N.parseProposalHtml(new TextDecoder().decode(bytes), { DOMParser: window.DOMParser });
  throw new Error('unsupported');
}
export async function sha256(bytes) {
  try { const h = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join(''); } catch { return null; }
}

/** Brücke: Import rückgängig machen (Dokument und seine Zellen entfernen; Zeilen, die nur dieses Dokument trug, entfernen). */
export function removeDocument(d, docId) {
  const cells = {};
  const keepRows = new Set();
  for (const [rid, byTrack] of Object.entries(d.cells)) {
    const nt = {};
    for (const [tid, list] of Object.entries(byTrack)) {
      const l = list.filter((c) => c.doc !== docId);
      if (l.length) { nt[tid] = l; keepRows.add(rid); }
    }
    if (Object.keys(nt).length) cells[rid] = nt;
  }
  const rows = d.rows.filter((r) => keepRows.has(r.id) || r.createdBy !== docId || d.positions[r.id]).map((r) => {
    if (!r.numHistory || !r.numHistory.length) return r;
    const last = r.numHistory[r.numHistory.length - 1];
    if (last.doc !== docId) return r;
    return { ...r, num: last.num, numHistory: r.numHistory.slice(0, -1) };
  });
  const rowIds = new Set(rows.map((r) => r.id));
  const remaining = N.docsByDate({ ...d, documents: d.documents.filter((x) => x.id !== docId) });
  const fallback = remaining[remaining.length - 1] || null;
  const positions = {};
  for (const [rid, p] of Object.entries(d.positions)) {
    if (!rowIds.has(rid)) continue;
    positions[rid] = p.basis && p.basis.doc === docId ? { ...p, basis: fallback ? { track: p.basis.track, doc: fallback.id } : null } : p;
  }
  return { ...d, documents: d.documents.filter((x) => x.id !== docId), rows, cells, positions, updated: nowIso() };
}

/** Brücke: Fassung ohne Datei anlegen (manuelle Erfassung). */
export function addManualDocument(d, meta) {
  let n = d.documents.length + 1;
  while (d.documents.some((x) => x.id === `doc${n}`)) n++;
  const doc = { id: `doc${n}`, kind: meta.kind || 'other', ref: meta.ref || '', title: meta.title || '', date: meta.date || null, classification: meta.classification || 'internal', file: null, importedAt: nowIso(), tracks: meta.tracks || [], stats: { rows: 0, pages: 0 }, warnings: [], note: meta.note || '', manual: true };
  return { dossier: { ...d, documents: [...d.documents, doc], updated: nowIso() }, docId: doc.id };
}

// ------------------------------------------------------------------ Manuelle Korrektur (Brücken)
function nextRowId(d) {
  let max = 0;
  for (const r of d.rows) { const m = /^r(\d+)$/.exec(r.id); if (m) max = Math.max(max, Number(m[1])); }
  return 'r' + String(max + 1).padStart(6, '0');
}
function renumber(rows) {
  return rows.slice().sort((a, b) => a.order - b.order).map((r, i) => (r.order === (i + 1) * 10 ? r : { ...r, order: (i + 1) * 10 }));
}
export function addRow(d, { afterId = null, label = '', num = null, docId = null }) {
  const id = nextRowId(d);
  const after = d.rows.find((r) => r.id === afterId);
  const p = N.parseLabel ? N.parseLabel(label) : { kind: 'other' };
  const row = { id, order: after ? after.order + 5 : (d.rows.reduce((m, r) => Math.max(m, r.order), 0) + 10), num: num || null, label, path: p, group: N.groupOf ? N.groupOf(p) : 'other', amends: N.amendsOf ? N.amendsOf(p) : null, createdBy: docId || 'manual', manual: true };
  return { dossier: { ...d, rows: renumber([...d.rows, row]), updated: nowIso() }, rowId: id };
}
export function updateRow(d, rowId, patch) {
  const rows = d.rows.map((r) => {
    if (r.id !== rowId) return r;
    const n = { ...r, ...patch };
    if (patch.label !== undefined && N.parseLabel) { n.path = N.parseLabel(patch.label); n.group = N.groupOf(n.path); n.amends = r.amends || N.amendsOf(n.path); }
    return n;
  });
  return { ...d, rows, updated: nowIso() };
}
export function moveRow(d, rowId, dir) {
  const rows = N.sortedRows(d);
  const i = rows.findIndex((r) => r.id === rowId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return d;
  const a = rows[i], b = rows[j];
  return { ...d, rows: renumber(d.rows.map((r) => (r.id === a.id ? { ...r, order: b.order } : r.id === b.id ? { ...r, order: a.order } : r))), updated: nowIso() };
}
export function deleteRow(d, rowId) {
  const cells = { ...d.cells }; delete cells[rowId];
  const positions = { ...d.positions }; delete positions[rowId];
  return { ...d, rows: d.rows.filter((r) => r.id !== rowId), cells, positions, updated: nowIso() };
}
const joinHtml = (a, b) => [a, b].filter((x) => x && x.trim()).join(' ');
/** Zeile dropId in keepId zusammenführen: Zellen gleicher Spur und Fassung werden aneinandergehängt. */
export function mergeRows(d, keepId, dropId) {
  if (keepId === dropId) return d;
  const keep = clone(d.cells[keepId] || {});
  for (const [tid, list] of Object.entries(d.cells[dropId] || {})) {
    if (!keep[tid]) keep[tid] = [];
    for (const c of list) {
      const t = keep[tid].find((x) => x.doc === c.doc);
      if (t) { t.html = joinHtml(t.html, c.html); t.text = joinHtml(t.text, c.text); t.empty = !t.text; }
      else keep[tid].push(clone(c));
    }
    keep[tid] = N.docsByDate ? keep[tid].sort((x, y) => docOrder(d, x.doc) - docOrder(d, y.doc)) : keep[tid];
  }
  const cells = { ...d.cells, [keepId]: keep }; delete cells[dropId];
  const positions = { ...d.positions };
  if (!positions[keepId] && positions[dropId]) positions[keepId] = positions[dropId];
  delete positions[dropId];
  return { ...d, rows: d.rows.filter((r) => r.id !== dropId), cells, positions, updated: nowIso() };
}
function docOrder(d, docId) { const l = N.docsByDate(d); const i = l.findIndex((x) => x.id === docId); return i < 0 ? 1e9 : i; }
/** Zeile teilen: parts = { <track>: { doc, first, second } } (Klartext oder Inline-HTML). Neue Zeile direkt danach. */
export function splitRow(d, rowId, { label2 = '', parts }) {
  const row = d.rows.find((r) => r.id === rowId);
  if (!row) return { dossier: d, rowId: null };
  const { dossier: d2, rowId: nid } = addRow(d, { afterId: rowId, label: label2 || row.label, num: row.num ? row.num + 'b' : null, docId: row.createdBy });
  let out = d2;
  for (const [tid, p] of Object.entries(parts)) {
    out = setCell(out, rowId, tid, p.doc, { html: p.first });
    if (p.second && p.second.trim()) out = setCell(out, nid, tid, p.doc, { html: p.second });
  }
  return { dossier: out, rowId: nid };
}
/** Zelle setzen oder ersetzen (Text einfügen, Korrektur). */
export function setCell(d, rowId, track, docId, { html, status }) {
  const clean = N.sanitizeInline(String(html || '').replace(/\r?\n/g, '<br>'));
  const text = N.htmlToText(clean).trim();
  const byTrack = { ...(d.cells[rowId] || {}) };
  const list = (byTrack[track] || []).slice();
  const i = list.findIndex((c) => c.doc === docId);
  const cell = { ...(i >= 0 ? list[i] : { doc: docId, status: null }), html: clean, text, empty: !text, edited: true };
  if (status !== undefined) cell.status = status || null;
  if (i >= 0) list[i] = cell; else list.push(cell);
  list.sort((a, b) => docOrder(d, a.doc) - docOrder(d, b.doc));
  byTrack[track] = list;
  let docs = d.documents;
  const doc = d.documents.find((x) => x.id === docId);
  if (doc && !(doc.tracks || []).includes(track)) docs = d.documents.map((x) => (x.id === docId ? { ...x, tracks: [...(x.tracks || []), track] } : x));
  return { ...d, documents: docs, cells: { ...d.cells, [rowId]: byTrack }, updated: nowIso() };
}

// ------------------------------------------------------------------ Kürzel der bearbeitenden Person (`by`)
/** Optionen um das Kürzel aus src/app/lib/user.js ergänzen (ausser es ist ausdrücklich gesetzt). */
export function withBy(o = {}) {
  const by = o.by !== undefined ? o.by : getBy();
  const out = { ...o };
  if (by) out.by = by; else delete out.by;
  return out;
}

// ------------------------------------------------------------------ Position
/** setPosition mit Kürzel der bearbeitenden Person im Verlauf. */
export const setPosition = (d, rowId, patch, opts) => N.setPosition(d, rowId, patch, withBy(opts));
/** Brücke: Massenbearbeitung (Haltung oder Priorität für mehrere Zeilen). */
export function setPositionsBulk(d, rowIds, patch) {
  let out = d;
  const at = nowIso();
  for (const rid of rowIds) out = N.setPosition(out, rid, patch, withBy({ source: 'bulk', at }));
  return out;
}
/** Brücke: Bezug der Position auf die aktuelle Fassung der Bezugsspur setzen. */
export function refreshBasis(d, rowId) {
  const p = d.positions[rowId];
  if (!p) return d;
  const track = (p.basis && p.basis.track) || (N.defaultBasis(d) || {}).track;
  const last = N.latestCell(d, rowId, track);
  const doc = last ? last.doc : (N.defaultBasis(d) || {}).doc;
  return N.setPosition(d, rowId, { basis: { track, doc } }, withBy({ source: 'basis' }));
}

// ------------------------------------------------------------------ Konsultation
export const addConsultation = N.addConsultation;
export const buildConsultationDocx = N.buildConsultationDocx;
export const parseConsultationDocx = N.parseConsultationDocx;
export const importResponse = N.importResponse;
export const aggregateConsultation = N.aggregateConsultation;
export const consultationRows = N.consultationRows;
/** setDecision mit Kürzel der bearbeitenden Person. */
export const setDecision = (d, kId, itemId, v) => N.setDecision(d, kId, itemId, withBy(v));

export function updateConsultation(d, kId, patch) {
  return { ...d, consultations: d.consultations.map((k) => (k.id === kId ? { ...k, ...patch } : k)), updated: nowIso() };
}
export function deleteConsultation(d, kId) {
  return { ...d, consultations: d.consultations.filter((k) => k.id !== kId), updated: nowIso() };
}
export function removeResponse(d, kId, respId) {
  return updateConsultation(d, kId, (() => {
    const k = d.consultations.find((x) => x.id === kId);
    const ids = new Set(((k.responses || []).find((r) => r.id === respId) || { items: [] }).items.map((i) => i.id));
    const decisions = {};
    for (const [i, v] of Object.entries(k.decisions || {})) if (!ids.has(i)) decisions[i] = v;
    return { responses: k.responses.filter((r) => r.id !== respId), decisions };
  })());
}
/** Brücke: nicht zuordenbaren Text einer Rückmeldung einer Zeile zuordnen. */
export function assignUnmatched(d, kId, respId, index, rowId) {
  const k = d.consultations.find((x) => x.id === kId);
  const responses = k.responses.map((r) => {
    if (r.id !== respId) return r;
    const text = (r.unmatched || [])[index];
    if (text == null) return r;
    let n = r.items.length + 1;
    while (r.items.some((i) => i.id === `${r.id}-${n}`)) n++;
    return { ...r, unmatched: r.unmatched.filter((_, i) => i !== index), items: [...r.items, { id: `${r.id}-${n}`, row: rowId, comment: typeof text === 'string' ? text : text.text, proposal: '', source: 'manual' }] };
  });
  return updateConsultation(d, kId, { responses });
}
/** Brücke: Rückmeldung einer anderen Stelle zuordnen. */
export function setResponseOffice(d, kId, respId, officeId) {
  const k = d.consultations.find((x) => x.id === kId);
  return updateConsultation(d, kId, { responses: k.responses.map((r) => (r.id === respId ? { ...r, office: officeId } : r)) });
}
/** Brücke: Kommentar oder Textvorschlag einer Rückmeldung in die CH-Position übernehmen (Quelle im Verlauf). */
export function applyToPosition(d, kId, itemId, what, { officeLabel = '' } = {}) {
  const k = d.consultations.find((x) => x.id === kId);
  let item = null;
  for (const r of k.responses || []) for (const i of r.items) if (i.id === itemId) item = i;
  if (!item) return d;
  const p = d.positions[item.row] || {};
  const patch = {};
  const tag = officeLabel ? `[${officeLabel}] ` : '';
  if (what === 'proposal') patch.proposal = item.proposal || N.htmlToText(item.proposalHtml || '');
  else patch.text = [p.text, tag + item.comment].filter(Boolean).join('\n');
  let out = N.setPosition(d, item.row, patch, withBy({ source: `consultation:${kId}` }));
  const dec = (k.decisions || {})[itemId] || { decision: 'accepted', reply: '' };
  out = N.setDecision(out, kId, itemId, withBy({ decision: dec.decision === 'open' ? 'accepted' : dec.decision, reply: dec.reply || '', applied: true }));
  return out;
}

// ------------------------------------------------------------------ Ausgabe
export const buildPositionDocx = N.buildPositionDocx;
export const positionRows = N.positionRows;
export const positionStats = N.positionStats;
export const exportDossier = N.exportDossier;
export const importDossier = N.importDossier;
export const DOC_TEXT = N.DOC_TEXT;

// ------------------------------------------------------------------ Gliederung
/** Gruppe → Anzeigename (sprachabhängig über tr). */
export function groupLabel(g, tr) {
  if (!g) return tr('neg.group.other');
  if (g === 'preamble') return tr('neg.group.preamble');
  if (g === 'recitals') return tr('neg.group.recitals');
  let m = /^art_(.+)$/.exec(g);
  if (m) return tr('neg.group.article', { n: m[1] });
  m = /^(?:anx|annex)_(.*)$/.exec(g);
  if (m) return tr('neg.group.annex', { n: m[1] }).trim();
  if (g === 'title' || g === 'headings') return tr('neg.group.title');
  if (g === 'final') return tr('neg.group.final');
  if (g === 'other') return tr('neg.group.other');
  return g;
}
/** Untergruppe einer Zeile in grossen Artikeln von Änderungsrechtsakten (z. B. "Nummer 1 › 2016/399 Article 2"). */
export function subgroupOf(row) {
  const p = row.path || {};
  if (p.target && (p.target.art || p.target.annex)) return `${p.target.act || ''}|${p.target.art ? 'art ' + p.target.art : 'anx ' + p.target.annex}`;
  return null;
}
export function subgroupLabel(key, tr) {
  const [act, unit] = key.split('|');
  const [k, n] = unit.split(' ');
  return (k === 'art' ? tr('neg.group.article', { n }) : tr('neg.group.annex', { n })) + (act ? ` (${act})` : '');
}

// ================================================================== Etappe 3: Delegationen, Sitzungen, Bilanz
export const { DELEG_STANCES, INTERVENTION_RESULTS, OUTCOMES, DELEG_KINDS } = N;
export const meetingsByDate = N.meetingsByDate;
export const stanceMatrix = N.stanceMatrix;
export const suggestOutcome = N.suggestOutcome;
export const balance = N.balance;
export const defaultDelegations = N.defaultDelegations;
/** Delegationen des Dossiers; ohne eigene Liste die Voreinstellung (ohne das Dossier zu ändern). */
export function delegationsOf(d) { return Array.isArray(d.delegations) ? d.delegations : N.defaultDelegations(); }
export const ensureDelegations = N.ensureDelegations;
export const addDelegation = (d, x) => N.addDelegation(d, x);
export const updateDelegation = (d, id, patch) => N.updateDelegation(d, id, patch);
export const removeDelegation = (d, id) => N.removeDelegation(d, id);
export const addMeeting = (d, x) => N.addMeeting(d, x);
export const updateMeeting = (d, id, patch) => N.updateMeeting(d, id, patch);
export const removeMeeting = (d, id) => N.removeMeeting(d, id);
/**
 * Haltung setzen (mit Kürzel). Brücke: setStance behält beim Ändern die bisherige Sitzung, wenn `meeting: null` übergeben wird
 * (`null ?? alt`); soll die Sitzung entfernt werden, wird die Haltung entfernt und mit gleicher Id neu gesetzt.
 */
export function setStance(d, rowId, x) {
  let base = d;
  if (x.id && x.meeting === null) {
    const old = ((d.stances || {})[rowId] || []).find((s) => s.id === x.id);
    if (old && old.meeting) base = N.removeStance(d, rowId, x.id);
  }
  return N.setStance(base, rowId, withBy(x));
}
/** Gleiche Haltung für mehrere Delegationen (Mehrfachauswahl). Rückgabe: { dossier, ids }. */
export function setStances(d, rowId, delegs, { stance, text = '', meeting = null }) {
  let out = d;
  const ids = [];
  const at = nowIso();
  for (const deleg of delegs) { const r = N.setStance(out, rowId, withBy({ deleg, stance, text, meeting, at })); out = r.dossier; ids.push(r.id); }
  return { dossier: out, ids };
}
export const removeStance = (d, rowId, id) => N.removeStance(d, rowId, id);
export const addIntervention = (d, x) => N.addIntervention(d, withBy(x));
export const updateIntervention = (d, id, patch) => N.updateIntervention(d, id, patch, withBy({}));
export const removeIntervention = (d, id) => N.removeIntervention(d, id);
export const setOutcome = (d, rowId, x) => N.setOutcome(d, rowId, withBy(x));
/** Brücke: Ergebnis zurücksetzen (Feld entfernen, Verlaufseintrag). */
export function clearOutcome(d, rowId) {
  const p = d.positions[rowId];
  if (!p || !p.outcome) return d;
  const at = nowIso();
  const { outcome, ...rest } = p;
  const by = getBy();
  const history = [...(p.history || []), { at, stance: p.stance, priority: p.priority, text: p.text, proposal: p.proposal, source: 'outcome', outcome: null, ...(by ? { by } : {}) }];
  return { ...d, updated: at, positions: { ...d.positions, [rowId]: { ...rest, history } } };
}
/** Haltung der Schweiz zu einer Zeile als Haltung einer Delegation (für «gleiche Haltung wie CH»): Haltung der Delegation CH, sonst aus der Position. */
export const CH_AS_DELEG = { support: 'support', 'support-with-changes': 'support', scrutiny: 'scrutiny', reservation: 'reservation', oppose: 'oppose' };
export function chStanceOf(d, rowId, matrixRow) {
  const c = matrixRow && matrixRow.cells && matrixRow.cells.ch;
  if (c) return c.stance;
  const p = d.positions[rowId];
  return p && p.stance ? CH_AS_DELEG[p.stance] || null : null;
}
/** Jüngster Kompromisstext einer Zeile (Spur agreement) oder null. */
export function latestCompromiseCell(d, rowId) {
  const list = (d.cells[rowId] || {}).agreement || [];
  for (let i = list.length - 1; i >= 0; i--) if (!list[i].empty && (list[i].html || list[i].text)) return list[i];
  return null;
}

// ================================================================== Etappe 3: Projektdateien zusammenführen
export const diffDossiers = N.diffDossiers;
export const mergeDossiers = N.mergeDossiers;
const covered = (path, set) => { for (const c of set) if (c === path || c.startsWith(path + '/') || path.startsWith(c + '/')) return true; return false; };
/**
 * Zusammenführen mit Übersicht für die Oberfläche: Ergebnis von mergeDossiers und Listen der Pfade, die sich gegenüber «mein Stand» ändern
 * (aus der anderen Datei bzw. kombiniert) oder nur bei mir stehen. Konfliktpfade sind ausgenommen.
 */
export function mergeOverview(mine, theirs, { base = null, resolutions = {} } = {}) {
  const r = N.mergeDossiers(mine, theirs, { base: base || undefined, resolutions });
  const cpaths = new Set(r.conflicts.map((c) => c.path));
  const skip = (e) => e.path === 'rows#order' || /^meta\/(updated|created|cellFormat)$/.test(e.path);
  const dm = N.diffDossiers(mine, r.merged).entries.filter((e) => !skip(e) && !covered(e.path, cpaths));
  const dt = N.diffDossiers(theirs, r.merged).entries.filter((e) => !skip(e) && !covered(e.path, cpaths));
  const dtSet = new Set(dt.map((e) => e.path));
  const dmSet = new Set(dm.map((e) => e.path));
  const removedSet = new Set((r.removed || []).map((x) => x.path));
  const fromTheirs = [], combined = [];
  for (const e of dm) { if (removedSet.has(e.path)) continue; (dtSet.has(e.path) ? combined : fromTheirs).push(e); }
  const fromMine = dt.filter((e) => !dmSet.has(e.path) && e.kind !== 'removed');
  return { ...r, lists: { fromTheirs, combined, fromMine, removed: r.removed || [] } };
}

// ================================================================== Etappe 3: Vorschau hängiger Vorschläge
const pvCache = new WeakMap();
/** Ausgangsstand der Vorschau: jüngster Stand des Datensatzes mit Datum bis zur jüngsten Fassung des Dossiers (sonst jüngster Stand). */
export const enStages = (dataset) => ((dataset && dataset.stages) || []).filter((s) => !s.langs || s.langs.includes('en'));
export function defaultBaseStage(d, dataset) {
  const stages = enStages(dataset);
  if (!stages.length) return null;
  const last = N.docsByDate(d).map((x) => x.date).filter(Boolean).sort().slice(-1)[0];
  if (!last) return stages[stages.length - 1].id;
  let best = null;
  for (const s of stages) if (s.date && s.date <= last) best = s;
  return (best || stages[stages.length - 1]).id;
}
/** buildPreview mit Zwischenspeicher je Dossierobjekt; Fehler werden als { error } zurückgegeben. */
export function previewFor(d, dataset, { track, doc = null, baseStage = null }) {
  if (!dataset) return { error: 'no-dataset' };
  let m = pvCache.get(d);
  if (!m) { m = new Map(); pvCache.set(d, m); }
  const key = `${track}|${doc || ''}|${baseStage || ''}|${dataset.generated || ''}`;
  if (!m.has(key)) {
    let v;
    try { v = N.buildPreview(d, doc ? { track, doc } : { track }, dataset, { lang: 'en', ...(baseStage ? { baseStage } : {}) }); } catch (e) { v = { error: e.message || String(e) }; }
    m.set(key, v);
  }
  return m.get(key);
}
/** Spuren, in denen die Vorschau mindestens eine Einheit ändert oder etwas nicht auflösen kann. */
export function previewTracks(d, dataset, baseStage) {
  return d.tracks.map((x) => ({ id: x.id, p: previewFor(d, dataset, { track: x.id, baseStage }) })).filter((x) => !x.p.error && (Object.keys(x.p.units).length || x.p.unresolved.length));
}
/** Link in das Modul Rechtsakte (Vertrag SPEC3 §5): #/lesen?u=<unit>&pv=<dossierId>~<trackId>~<docId|latest> */
export function previewLink(d, unit, track, doc, key) {
  return `#/lesen?u=${encodeURIComponent(unit)}${key ? '&k=' + encodeURIComponent(key) : ''}&pv=${[d.id, track, doc || 'latest'].map(encodeURIComponent).join('~')}`;
}
// Brücke: Gründe der Vorschau kommen deutsch aus der Kernbibliothek; für die Oberfläche FR übersetzt (sonst Original, als Deutsch gekennzeichnet).
const REASONS_FR = [
  [/^Behälteranweisung ohne Artikel oder Anhang$/, () => 'Instruction de structure sans article ni annexe'],
  [/^Änderung «in accordance with the Annex».*/, () => 'Modification « in accordance with the Annex » : le libellé figure dans l’annexe de l’acte modificatif'],
  [/^Umbenennung einer Kapitel- oder Abschnittsüberschrift.*/, () => 'Changement de titre d’un chapitre ou d’une section : non représenté dans le schéma des blocs'],
  [/^Umnummerierung – nicht angewandt$/, () => 'Renumérotation : non appliquée'],
  [/^Anweisung ohne neuen Wortlaut$/, () => 'Instruction sans nouveau libellé'],
  [/^Änderung auf Ebene «(.+)» nicht unterstützt$/, (m) => `Modification au niveau « ${m[1]} » non prise en charge`],
  [/^Einheit nicht bestimmbar \(.*\)$/, () => 'Unité indéterminable (ni l’instruction ni le libellé ne citent d’article ou d’annexe)'],
  [/^Einheit nicht bestimmbar$/, () => 'Unité indéterminable'],
  [/^Einheit (\S+) im Stand (\S+) nicht vorhanden(?: \(ersetzen\))?$/, (m) => `Unité ${m[1]} absente de l’état ${m[2]}`],
  [/^Einheit (\S+) ist in dieser Vorschau aufgehoben$/, (m) => `Unité ${m[1]} abrogée dans cet aperçu`],
  [/^Einheit (\S+) besteht im Stand (\S+) bereits \(einfügen\)$/, (m) => `Unité ${m[1]} déjà présente dans l’état ${m[2]} (insertion)`],
  [/^Titeländerung ohne Wortlaut$/, () => 'Modification du titre sans libellé'],
  [/^(\S+): Ziel nicht vorhanden$/, (m) => `${m[1]} : cible introuvable`],
  [/^(\S+): Block (\S+) besteht im Stand (\S+) bereits \(einfügen\)$/, (m) => `${m[1]} : le bloc ${m[2]} existe déjà dans l’état ${m[3]} (insertion)`],
  [/^(\S+): Gliederung des Wortlauts \((.*)\) passt nicht zum Ziel (.+)$/, (m) => `${m[1]} : la structure du libellé (${m[2]}) ne correspond pas à la cible ${m[3]}`],
  [/^(\S+): Gliederungszeichen des Wortlauts \((.*)\) passt nicht zur Anweisung$/, (m) => `${m[1]} : le signe de structure du libellé (${m[2]}) ne correspond pas à l’instruction`],
  [/^(\S+): Behälter (\S+) nicht vorhanden$/, (m) => `${m[1]} : élément parent ${m[2]} introuvable`],
  [/^(\S+): Wortlaut ohne einfügbare Gliederung$/, (m) => `${m[1]} : libellé sans structure insérable`],
  [/^(\S+): (Unterabsatz|Absatz|Punkt|Gedankenstrich) erwartet, Wortlaut beginnt mit «(.*)»$/, (m) => `${m[1]} : ${{ Unterabsatz: 'alinéa', Absatz: 'paragraphe', Punkt: 'point', Gedankenstrich: 'tiret' }[m[2]]} attendu, le libellé commence par « ${m[3]} »`],
  [/^(\S+): Bezugsstelle «(.*)» nicht auflösbar$/, (m) => `${m[1]} : point de référence « ${m[2]} » introuvable`],
  [/^(\S+) (\S+): Einleitungsteil mit mehr als einem Absatz im Wortlaut$/, (m) => `${m[1]} ${m[2]} : partie introductive comportant plus d’un paragraphe`],
  [/^Überschrift des Wortlauts \((.*)\) passt nicht zum Ziel der Anweisung \((.*)\)$/, (m) => `Le titre du libellé (${m[1]}) ne correspond pas à la cible de l’instruction (${m[2]})`],
  [/^Wortersetzung: Wörter nicht erkennbar$/, () => 'Remplacement de mots : mots non identifiables'],
  [/^(\S+): Wortersetzung «(.*)» im Ziel nicht gefunden$/, (m) => `${m[1]} : remplacement de mots « ${m[2]} » introuvable dans la cible`],
];
/** Grund einer nicht angewandten Anweisung in der Oberflächensprache: { text, lang }. */
export function reasonText(reason, lang) {
  if (lang !== 'fr') return { text: reason, lang: 'de' };
  for (const [re, f] of REASONS_FR) { const m = re.exec(reason); if (m) return { text: f(m), lang: 'fr' }; }
  return { text: reason, lang: 'de' };
}
