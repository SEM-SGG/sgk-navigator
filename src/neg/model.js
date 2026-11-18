// SGK-Navigator, Modul Verhandlung — Dossier-Modell und Projektdatei (ESM, isomorph)
//
// Schema: SPEC2.md §4. Alle Funktionen sind rein: Eingaben werden nicht verändert, Rückgaben sind neue Objekte
// (strukturell geteilt nur dort, wo nichts verändert wird).
//
// createDossier({ id?, title, short?, procedure?, tracks? }) -> dossier
// DEFAULT_TRACKS
// exportDossier(dossier) -> string (JSON)
// importDossier(jsonOrObject) -> { dossier, warnings, migrated }       (wirft nie; ungültig -> { dossier:null, errors })
// validateDossier(dossier) -> { errors:[], warnings:[] }
// docsByDate(dossier) -> documents sortiert nach Datum (dann Importzeit)
// cellsOf(dossier, rowId, trackId) -> [Zelle] (sortiert)
// latestCell(dossier, rowId, trackId, { upToDoc? }) -> Zelle | null
// sortedRows(dossier) -> rows nach order
// setPosition(dossier, rowId, patch, { source?, at?, by? }) -> dossier     (mit Verlauf; by = Kürzel der bearbeitenden Person)
// addConsultation(dossier, { title, deadline, lang, basis, scope, offices }) -> { dossier, id }

import { clone, htmlToText, htmlToCleanText } from './util.js';

export const SCHEMA = 1;

export const DEFAULT_TRACKS = [
  { id: 'com', kind: 'commission', label: { de: 'Kommission', fr: 'Commission', en: 'Commission' } },
  { id: 'ep', kind: 'parliament', label: { de: 'Europäisches Parlament', fr: 'Parlement européen', en: 'European Parliament' } },
  { id: 'council', kind: 'council', label: { de: 'Rat', fr: 'Conseil', en: 'Council' } },
  { id: 'agreement', kind: 'agreement', label: { de: 'Kompromiss (Trilog)', fr: 'Compromis (trilogue)', en: 'Draft agreement' } },
];

export const STANCES = ['support', 'support-with-changes', 'scrutiny', 'reservation', 'oppose', 'none'];
export const PRIORITIES = ['redline', 'high', 'medium', 'low'];
export const DECISIONS = ['accepted', 'partly', 'rejected', 'noted', 'open'];
export const DOC_KINDS = ['four-column', 'proposal', 'compromise', 'mandate', 'ep-report', 'other'];
export const CLASSIFICATIONS = ['public', 'limite', 'restricted', 'internal'];

const nowIso = () => new Date().toISOString();

export function createDossier({ id, title = '', short = '', procedure = '', tracks, now } = {}) {
  const t = now || nowIso();
  return {
    schema: SCHEMA, kind: 'neg-dossier',
    id: id || `d-${(procedure || 'neu').replace(/[^0-9a-z]+/gi, '-').replace(/-+$/, '').toLowerCase()}`,
    title, short, procedure, lang: 'en',
    created: t, updated: t,
    tracks: clone(tracks || DEFAULT_TRACKS),
    documents: [], rows: [], cells: {}, positions: {}, consultations: [],
  };
}

export function docsByDate(dossier) {
  return dossier.documents.slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.importedAt || '').localeCompare(String(b.importedAt || '')));
}

export function docIndex(dossier) {
  const m = new Map();
  docsByDate(dossier).forEach((d, i) => m.set(d.id, i));
  return m;
}

export function sortedRows(dossier) {
  return dossier.rows.slice().sort((a, b) => a.order - b.order);
}

export function cellsOf(dossier, rowId, trackId) {
  return ((dossier.cells[rowId] || {})[trackId] || []).slice();
}

/** Jüngste Zelle einer Spur (optional: höchstens bis Dokument upToDoc einschliesslich) */
export function latestCell(dossier, rowId, trackId, { upToDoc } = {}) {
  const list = cellsOf(dossier, rowId, trackId);
  if (!list.length) return null;
  if (!upToDoc) return list[list.length - 1];
  const idx = docIndex(dossier);
  const lim = idx.get(upToDoc);
  if (lim === undefined) return null;
  let best = null;
  for (const c of list) if ((idx.get(c.doc) ?? -1) <= lim) best = c;
  return best;
}

/** Zellen einer Zeile in Dokumentreihenfolge sortieren (nach Datum) */
export function sortCells(dossier, list) {
  const idx = docIndex(dossier);
  return list.slice().sort((a, b) => (idx.get(a.doc) ?? 1e9) - (idx.get(b.doc) ?? 1e9));
}

// ------------------------------------------------------------------ Validierung und Migration

export function validateDossier(d) {
  const errors = [], warnings = [];
  if (!d || typeof d !== 'object') return { errors: ['Kein Objekt'], warnings };
  if (d.kind !== 'neg-dossier') errors.push('Feld "kind" ist nicht "neg-dossier"');
  if (typeof d.schema !== 'number') errors.push('Feld "schema" fehlt');
  else if (d.schema > SCHEMA) errors.push(`Schema ${d.schema} ist neuer als unterstützt (${SCHEMA})`);
  for (const f of ['tracks', 'documents', 'rows', 'consultations']) if (!Array.isArray(d[f])) errors.push(`Feld "${f}" ist keine Liste`);
  for (const f of ['cells', 'positions']) if (!d[f] || typeof d[f] !== 'object' || Array.isArray(d[f])) errors.push(`Feld "${f}" ist kein Objekt`);
  if (errors.length) return { errors, warnings };
  const trackIds = new Set(d.tracks.map((t) => t.id));
  const docIds = new Set(d.documents.map((x) => x.id));
  const rowIds = new Set();
  for (const r of d.rows) {
    if (!r.id) { errors.push('Zeile ohne Id'); continue; }
    if (rowIds.has(r.id)) errors.push(`Doppelte Zeilen-Id ${r.id}`);
    rowIds.add(r.id);
    if (typeof r.order !== 'number') warnings.push(`Zeile ${r.id}: order fehlt`);
  }
  for (const [rid, byTrack] of Object.entries(d.cells)) {
    if (!rowIds.has(rid)) { warnings.push(`Zellen für unbekannte Zeile ${rid}`); continue; }
    for (const [tid, list] of Object.entries(byTrack)) {
      if (!trackIds.has(tid)) warnings.push(`Zeile ${rid}: unbekannte Spur ${tid}`);
      if (!Array.isArray(list)) { errors.push(`Zeile ${rid}, Spur ${tid}: keine Liste`); continue; }
      for (const c of list) if (!docIds.has(c.doc)) warnings.push(`Zeile ${rid}, Spur ${tid}: unbekanntes Dokument ${c.doc}`);
    }
  }
  for (const rid of Object.keys(d.positions)) if (!rowIds.has(rid)) warnings.push(`Position für unbekannte Zeile ${rid}`);
  for (const k of d.consultations) {
    if (!k.id) errors.push('Konsultation ohne Id');
    for (const rid of k.scope || []) if (!rowIds.has(rid)) warnings.push(`Konsultation ${k.id}: unbekannte Zeile ${rid}`);
  }
  // Etappe 3 (SPEC3 §3.7), alle optional
  for (const f of ['delegations', 'meetings', 'interventions']) if (d[f] !== undefined && !Array.isArray(d[f])) errors.push(`Feld "${f}" ist keine Liste`);
  if (d.stances !== undefined && (!d.stances || typeof d.stances !== 'object' || Array.isArray(d.stances))) errors.push('Feld "stances" ist kein Objekt');
  if (errors.length) return { errors, warnings };
  const delIds = new Set((d.delegations || []).map((x) => x.id));
  const meetIds = new Set((d.meetings || []).map((x) => x.id));
  const uniq = (list, what) => { const seen = new Set(); for (const x of list) { if (!x || !x.id) errors.push(`${what} ohne Id`); else if (seen.has(x.id)) errors.push(`Doppelte Id ${x.id} (${what})`); else seen.add(x.id); } };
  uniq(d.delegations || [], 'Delegation'); uniq(d.meetings || [], 'Sitzung'); uniq(d.interventions || [], 'Intervention');
  uniq(Object.values(d.stances || {}).flat(), 'Haltung');
  if (errors.length) return { errors, warnings };
  for (const m of d.meetings || []) for (const doc of m.docs || []) if (!docIds.has(doc)) warnings.push(`Sitzung ${m.id}: unbekanntes Dokument ${doc}`);
  for (const [rid, list] of Object.entries(d.stances || {})) {
    if (!rowIds.has(rid)) warnings.push(`Haltungen für unbekannte Zeile ${rid}`);
    if (!Array.isArray(list)) { errors.push(`Haltungen ${rid}: keine Liste`); continue; }
    for (const s of list) {
      if (d.delegations && !delIds.has(s.deleg)) warnings.push(`Haltung ${s.id}: unbekannte Delegation ${s.deleg}`);
      if (s.meeting && !meetIds.has(s.meeting)) warnings.push(`Haltung ${s.id}: unbekannte Sitzung ${s.meeting}`);
    }
  }
  for (const x of d.interventions || []) {
    if (x.meeting && !meetIds.has(x.meeting)) warnings.push(`Intervention ${x.id}: unbekannte Sitzung ${x.meeting}`);
    if (x.row && !rowIds.has(x.row)) warnings.push(`Intervention ${x.id}: unbekannte Zeile ${x.row}`);
  }
  return { errors, warnings };
}

function migrate(d) {
  // Schema 0 (Vorabversion ohne Feld "schema"): fehlende Felder ergänzen
  const out = clone(d);
  let migrated = false;
  if (out.schema === undefined && out.kind === 'neg-dossier') { out.schema = 1; migrated = true; }
  for (const f of ['tracks', 'documents', 'rows', 'consultations']) if (out[f] === undefined) { out[f] = f === 'tracks' ? clone(DEFAULT_TRACKS) : []; migrated = true; }
  for (const f of ['cells', 'positions']) if (out[f] === undefined) { out[f] = {}; migrated = true; }
  if (!out.lang) out.lang = 'en';
  for (const k of out.consultations || []) {
    if (!k.responses) { k.responses = []; migrated = true; }
    if (!k.decisions) { k.decisions = {}; migrated = true; }
    if (!k.offices) { k.offices = []; migrated = true; }
  }
  return { out, migrated };
}

/**
 * Projektdatei schreiben. { compact:true }: verlustfreie Kurzform (cellFormat "compact-1"): unveränderte Folgezellen einer Spur
 * als { doc, same:1 }, "text" nur wenn ≠ htmlToText(html), ohne "clean"; leere Zellen { doc, empty:true }. importDossier stellt
 * das volle Schema wieder her. Beispieldateien sind kompakt gespeichert: immer über importDossier laden.
 */
export function exportDossier(dossier, { compact = false } = {}) {
  const base = { ...dossier, schema: SCHEMA, kind: 'neg-dossier' };
  if (!compact) return JSON.stringify(base, null, 1);
  const cells = {};
  for (const [rid, byTrack] of Object.entries(dossier.cells)) {
    cells[rid] = {};
    for (const [tid, list] of Object.entries(byTrack)) {
      let prev = null;
      cells[rid][tid] = list.map((c) => {
        let o;
        if (c.empty) o = { doc: c.doc, empty: true, ...(c.status ? { status: c.status } : {}), ...(c.notes ? { notes: c.notes } : {}), ...(c.tags ? { tags: c.tags } : {}) };
        else if (prev && !prev.empty && prev.html === c.html && (prev.status || null) === (c.status || null) && JSON.stringify(prev.notes || null) === JSON.stringify(c.notes || null) && JSON.stringify(prev.tags || null) === JSON.stringify(c.tags || null)) o = { doc: c.doc, same: 1 };
        else {
          o = { doc: c.doc, html: c.html };
          if (c.text !== htmlToText(c.html)) o.text = c.text;
          if (c.status) o.status = c.status;
          if (c.notes) o.notes = c.notes;
          if (c.tags) o.tags = c.tags;
        }
        prev = c;
        return o;
      });
    }
  }
  return JSON.stringify({ ...base, cellFormat: 'compact-1', cells });
}

function expandCells(d) {
  if (d.cellFormat !== 'compact-1') return false;
  for (const byTrack of Object.values(d.cells)) {
    for (const [tid, list] of Object.entries(byTrack)) {
      let prev = null;
      byTrack[tid] = list.map((c) => {
        let o;
        if (c.empty) o = { doc: c.doc, empty: true, status: c.status || null, ...(c.notes ? { notes: c.notes } : {}), ...(c.tags ? { tags: c.tags } : {}) };
        else if (c.same && prev && !prev.empty) o = { ...prev, doc: c.doc };
        else {
          o = { doc: c.doc, html: c.html || '', text: c.text !== undefined ? c.text : htmlToText(c.html || ''), status: c.status || null, empty: false };
          if (c.notes) o.notes = c.notes;
          if (c.tags) o.tags = c.tags;
          if (/<s>/.test(o.html)) o.clean = htmlToCleanText(o.html);
        }
        prev = o;
        return o;
      });
    }
  }
  delete d.cellFormat;
  return true;
}

/** Projektdatei einlesen: JSON-Text oder Objekt. Wirft nicht. */
export function importDossier(input) {
  let obj = input;
  if (typeof input === 'string' || input instanceof Uint8Array) {
    const txt = typeof input === 'string' ? input : new TextDecoder().decode(input);
    try { obj = JSON.parse(txt.replace(/^﻿/, '')); } catch (e) { return { dossier: null, errors: [`Keine gültige JSON-Datei: ${e.message}`], warnings: [] }; }
  }
  if (!obj || typeof obj !== 'object') return { dossier: null, errors: ['Leere Datei'], warnings: [] };
  if (obj.kind !== 'neg-dossier') return { dossier: null, errors: ['Keine Dossier-Datei des Verhandlungsmoduls (kind ≠ "neg-dossier")'], warnings: [] };
  const { out, migrated } = migrate(obj);
  expandCells(out);
  const v = validateDossier(out);
  if (v.errors.length) return { dossier: null, errors: v.errors, warnings: v.warnings };
  return { dossier: out, errors: [], warnings: v.warnings, migrated };
}

// ------------------------------------------------------------------ Positionen

/**
 * CH-Position setzen oder ändern; der vorherige Stand kommt in den Verlauf.
 * patch: { stance?, priority?, text?, proposal?, fallback?, owner?, basis? }
 */
export function setPosition(dossier, rowId, patch, { source = 'manual', at, by } = {}) {
  const t = at || nowIso();
  const d = { ...dossier, positions: { ...dossier.positions }, updated: t };
  const prev = dossier.positions[rowId];
  const base = prev ? clone(prev) : { stance: 'none', priority: 'medium', text: '', proposal: '', fallback: '', owner: '', basis: null, updated: t, history: [] };
  const next = { ...base, ...clone(patch), updated: t };
  if (!next.basis) next.basis = defaultBasis(dossier);
  next.history = [...(base.history || []), { at: t, stance: next.stance, priority: next.priority, text: next.text, proposal: next.proposal, source, ...(by ? { by } : {}) }];
  d.positions[rowId] = next;
  return d;
}

/** Bezug einer neuen Position: jüngstes Dokument, Spur "agreement" falls vorhanden, sonst "council"/"com" */
export function defaultBasis(dossier) {
  const docs = docsByDate(dossier);
  const last = docs[docs.length - 1];
  if (!last) return null;
  const pref = ['agreement', 'council', 'ep', 'com'];
  const track = pref.find((t) => (last.tracks || []).includes(t)) || (last.tracks || [])[0] || null;
  return { track, doc: last.id };
}

// ------------------------------------------------------------------ Konsultationen

export function addConsultation(dossier, { id, title, deadline = null, lang = 'de', basis = null, scope = [], offices = [], created } = {}) {
  const t = created || nowIso();
  const kid = id || `k${dossier.consultations.length + 1}`;
  if (dossier.consultations.some((k) => k.id === kid)) throw new Error(`Konsultation ${kid} existiert bereits`);
  const k = { id: kid, title: title || `Ämterkonsultation ${dossier.consultations.length + 1}`, created: t, deadline, lang, basis: basis || defaultBasis(dossier), scope: scope.slice(), offices: clone(offices), exports: [], responses: [], decisions: {} };
  return { dossier: { ...dossier, consultations: [...dossier.consultations, k], updated: t }, id: kid };
}

export function findConsultation(dossier, id) {
  return dossier.consultations.find((k) => k.id === id) || null;
}

/** Entscheid zu einer Rückmeldung setzen: decision ∈ DECISIONS */
export function setDecision(dossier, consultationId, itemId, { decision, reply = '', applied = false, at, by } = {}) {
  if (!DECISIONS.includes(decision)) throw new Error(`Unbekannter Entscheid: ${decision}`);
  const t = at || nowIso();
  return {
    ...dossier, updated: t,
    consultations: dossier.consultations.map((k) => (k.id !== consultationId ? k : { ...k, decisions: { ...k.decisions, [itemId]: { decision, reply, at: t, applied, ...(by ? { by } : {}) } } })),
  };
}
