// SGK-Navigator, Modul Verhandlung — Delegationen, Sitzungen, Haltungen, Interventionen der Schweiz, Ergebnis und Bilanz
// (ESM, isomorph, rein: Eingaben werden nicht verändert, Rückgaben sind neue Objekte). SPEC3 §3.7.
//
// Schema-Ergänzungen im Dossier (alle optional; Projektdateien ohne diese Felder bleiben gültig):
//   delegations:   [ { id, kind:"ms"|"institution"|"other", code, name:{de,fr,en}, abbr?:{de,fr,en}, schengen?:boolean } ]
//   meetings:      [ { id, date, body, title, docs:[docId], note } ]
//   stances:       { <rowId>: [ { id, deleg, stance:"support"|"oppose"|"reservation"|"scrutiny"|"proposal"|"neutral", text, meeting|null, at, by? } ] }
//   interventions: [ { id, meeting|null, row|null, text, result:"taken-up"|"partly"|"rejected"|"open", note, at, by? } ]
//   positions[rowId].outcome: { status:"achieved"|"partly"|"not"|"open"|"obsolete", note, doc|null, at, by? }
//
// Funktionen (Rückgabe: neues Dossier bzw. { dossier, id }):
//   defaultDelegations() -> [Delegation]                 Schengen-Staaten (25 EU + CH, IS, LI, NO), KOM, EP, Vorsitz, JD Rat
//   ensureDelegations(d) -> d                            setzt die Voreinstellung, falls d.delegations fehlt
//   addDelegation(d, {id?, kind, code, name, abbr?}) -> { dossier, id }; updateDelegation(d, id, patch) -> d; removeDelegation(d, id) -> d
//   addMeeting(d, {id?, date, body, title, docs?, note?}) -> { dossier, id }; updateMeeting(d, id, patch) -> d; removeMeeting(d, id) -> d
//   setStance(d, rowId, {id?, deleg, stance, text?, meeting?, at?, by?}) -> { dossier, id }   (mit id: ändern, sonst neu)
//   removeStance(d, rowId, stanceId) -> d
//   addIntervention(d, {id?, meeting, row?, text, result?, note?, at?, by?}) -> { dossier, id }; updateIntervention(d, id, patch) -> d; removeIntervention(d, id) -> d
//   setOutcome(d, rowId, {status, note?, doc?, at?, by?}) -> d       (Ergebnis der CH-Position; Verlaufseintrag in positions[rowId].history)
//   stanceMatrix(d, { rows?, meeting? }) -> { delegations:[{id,code,name,kind}], rows:[{ rowId, num, label, cells:{ <delegId>:{ stance, text, meeting, at, id, earlier } } }], counts:{ byStance, byDelegation } }
//   suggestOutcome(d, rowId) -> { status, confidence:"medium"|"low", basis:{track,doc}|null, compared:{track,doc}|null, measure:{…}, reason:{de,fr} }   (nur Vorschlag)
//   balance(d, { suggest?:true }) -> { total, byOutcome, byPriority:{ <prio>:{ <status>:n } }, achievedShare, rows:[…], interventions:{ total, byResult, byMeeting }, meetings, delegations }
//
// Löschen: removeDelegation entfernt auch deren Haltungen; removeMeeting löst die Sitzung nur (Haltungen und Interventionen
// behalten ihren Inhalt, `meeting` wird null) – es geht kein Inhalt verloren.

import { sortedRows, latestCell, docsByDate } from './model.js';
import { clone, htmlToCleanText, htmlToText } from './util.js';
import { normText, similarity } from '../core/text.js';
import { diffWords } from 'diff';
import { T } from './i18n.js';

export const DELEG_STANCES = ['support', 'oppose', 'reservation', 'scrutiny', 'proposal', 'neutral'];
export const INTERVENTION_RESULTS = ['taken-up', 'partly', 'rejected', 'open'];
export const OUTCOMES = ['achieved', 'partly', 'not', 'open', 'obsolete'];
export const DELEG_KINDS = ['ms', 'institution', 'other'];

const nowIso = () => new Date().toISOString();

// Schengen-Staaten Stand 2026 (EU-Mitgliedstaaten im Schengen-Raum, alphabetisch nach Ratskürzel; dann assoziierte Staaten).
// Zypern und Irland sind nicht Schengen-Vollanwender; bei Bedarf mit addDelegation ergänzen.
const MS = [
  ['AT', 'Österreich', 'Autriche', 'Austria'], ['BE', 'Belgien', 'Belgique', 'Belgium'], ['BG', 'Bulgarien', 'Bulgarie', 'Bulgaria'],
  ['CZ', 'Tschechien', 'Tchéquie', 'Czechia'], ['DE', 'Deutschland', 'Allemagne', 'Germany'], ['DK', 'Dänemark', 'Danemark', 'Denmark'],
  ['EE', 'Estland', 'Estonie', 'Estonia'], ['EL', 'Griechenland', 'Grèce', 'Greece'], ['ES', 'Spanien', 'Espagne', 'Spain'],
  ['FI', 'Finnland', 'Finlande', 'Finland'], ['FR', 'Frankreich', 'France', 'France'], ['HR', 'Kroatien', 'Croatie', 'Croatia'],
  ['HU', 'Ungarn', 'Hongrie', 'Hungary'], ['IT', 'Italien', 'Italie', 'Italy'], ['LT', 'Litauen', 'Lituanie', 'Lithuania'],
  ['LU', 'Luxemburg', 'Luxembourg', 'Luxembourg'], ['LV', 'Lettland', 'Lettonie', 'Latvia'], ['MT', 'Malta', 'Malte', 'Malta'],
  ['NL', 'Niederlande', 'Pays-Bas', 'Netherlands'], ['PL', 'Polen', 'Pologne', 'Poland'], ['PT', 'Portugal', 'Portugal', 'Portugal'],
  ['RO', 'Rumänien', 'Roumanie', 'Romania'], ['SE', 'Schweden', 'Suède', 'Sweden'], ['SI', 'Slowenien', 'Slovénie', 'Slovenia'],
  ['SK', 'Slowakei', 'Slovaquie', 'Slovakia'],
];
const ASSOC = [['CH', 'Schweiz', 'Suisse', 'Switzerland'], ['IS', 'Island', 'Islande', 'Iceland'], ['LI', 'Liechtenstein', 'Liechtenstein', 'Liechtenstein'], ['NO', 'Norwegen', 'Norvège', 'Norway']];
const INST = [
  ['com', 'COM', { de: 'Europäische Kommission', fr: 'Commission européenne', en: 'European Commission' }, { de: 'KOM', fr: 'COM', en: 'COM' }],
  ['ep', 'EP', { de: 'Europäisches Parlament', fr: 'Parlement européen', en: 'European Parliament' }, { de: 'EP', fr: 'PE', en: 'EP' }],
  ['pres', 'PRES', { de: 'Vorsitz (Präsidentschaft)', fr: 'Présidence', en: 'Presidency' }, { de: 'Vorsitz', fr: 'PRES', en: 'PRES' }],
  ['cls', 'CLS', { de: 'Juristischer Dienst des Rates', fr: 'Service juridique du Conseil', en: 'Council Legal Service' }, { de: 'JD Rat', fr: 'SJC', en: 'CLS' }],
];

export function defaultDelegations() {
  return [
    ...MS.map(([c, de, fr, en]) => ({ id: c.toLowerCase(), kind: 'ms', code: c, name: { de, fr, en }, schengen: true })),
    ...ASSOC.map(([c, de, fr, en]) => ({ id: c.toLowerCase(), kind: 'ms', code: c, name: { de, fr, en }, schengen: true, associated: true })),
    ...INST.map(([id, code, name, abbr]) => ({ id, kind: 'institution', code, name, abbr })),
  ];
}

export function ensureDelegations(d) {
  if (Array.isArray(d.delegations)) return d;
  return { ...d, delegations: defaultDelegations() };
}

const touch = (d, t) => ({ ...d, updated: t });
function newId(prefix, existing) {
  let n = existing.length + 1;
  const set = new Set(existing);
  while (set.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}
function check(list, value, what) { if (!list.includes(value)) throw new Error(`Unbekannte ${what}: ${value}`); }
const allStanceIds = (d) => Object.values(d.stances || {}).flat().map((s) => s.id);

// ------------------------------------------------------------------ Delegationen

export function addDelegation(dossier, { id, kind = 'other', code = '', name = {}, abbr, at } = {}) {
  check(DELEG_KINDS, kind, 'Art der Delegation');
  const d0 = ensureDelegations(dossier);
  const ids = d0.delegations.map((x) => x.id);
  const did = id || (code && !ids.includes(code.toLowerCase()) ? code.toLowerCase() : newId('g', ids));
  if (ids.includes(did)) throw new Error(`Delegation ${did} existiert bereits`);
  const nm = typeof name === 'string' ? { de: name, fr: name, en: name } : clone(name);
  const x = { id: did, kind, code: code || did.toUpperCase(), name: nm, ...(abbr ? { abbr: clone(abbr) } : {}) };
  return { dossier: { ...touch(d0, at || nowIso()), delegations: [...d0.delegations, x] }, id: did };
}
export function updateDelegation(dossier, id, patch, { at } = {}) {
  const d0 = ensureDelegations(dossier);
  if (!d0.delegations.some((x) => x.id === id)) throw new Error(`Unbekannte Delegation ${id}`);
  if (patch.kind) check(DELEG_KINDS, patch.kind, 'Art der Delegation');
  const p = clone(patch); delete p.id;
  return { ...touch(d0, at || nowIso()), delegations: d0.delegations.map((x) => (x.id === id ? { ...x, ...p } : x)) };
}
export function removeDelegation(dossier, id, { at } = {}) {
  const d0 = ensureDelegations(dossier);
  const stances = {};
  for (const [rid, list] of Object.entries(d0.stances || {})) { const l = list.filter((s) => s.deleg !== id); if (l.length) stances[rid] = l; }
  return { ...touch(d0, at || nowIso()), delegations: d0.delegations.filter((x) => x.id !== id), ...(d0.stances ? { stances } : {}) };
}

// ------------------------------------------------------------------ Sitzungen

export function addMeeting(dossier, { id, date = null, body = '', title = '', docs = [], note = '', at } = {}) {
  const list = dossier.meetings || [];
  const mid = id || newId('m', list.map((m) => m.id));
  if (list.some((m) => m.id === mid)) throw new Error(`Sitzung ${mid} existiert bereits`);
  const m = { id: mid, date, body, title, docs: docs.slice(), note };
  return { dossier: { ...touch(dossier, at || nowIso()), meetings: [...list, m] }, id: mid };
}
export function updateMeeting(dossier, id, patch, { at } = {}) {
  const list = dossier.meetings || [];
  if (!list.some((m) => m.id === id)) throw new Error(`Unbekannte Sitzung ${id}`);
  const p = clone(patch); delete p.id;
  return { ...touch(dossier, at || nowIso()), meetings: list.map((m) => (m.id === id ? { ...m, ...p } : m)) };
}
export function removeMeeting(dossier, id, { at } = {}) {
  const out = { ...touch(dossier, at || nowIso()), meetings: (dossier.meetings || []).filter((m) => m.id !== id) };
  if (dossier.stances) out.stances = Object.fromEntries(Object.entries(dossier.stances).map(([rid, l]) => [rid, l.map((s) => (s.meeting === id ? { ...s, meeting: null } : s))]));
  if (dossier.interventions) out.interventions = dossier.interventions.map((x) => (x.meeting === id ? { ...x, meeting: null } : x));
  return out;
}
export function meetingsByDate(dossier) {
  return (dossier.meetings || []).slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || a.id.localeCompare(b.id));
}

// ------------------------------------------------------------------ Haltungen der Delegationen

export function setStance(dossier, rowId, { id, deleg, stance, text = '', meeting = null, at, by } = {}) {
  const t = at || nowIso();
  const d0 = ensureDelegations(dossier);
  if (!d0.rows.some((r) => r.id === rowId)) throw new Error(`Unbekannte Zeile ${rowId}`);
  const list = (d0.stances || {})[rowId] || [];
  const old = id ? list.find((s) => s.id === id) : null;
  const next = { ...(old || {}), id: id || newId('h', allStanceIds(d0)), deleg: deleg ?? old?.deleg, stance: stance ?? old?.stance, text: text ?? old?.text ?? '', meeting: meeting ?? old?.meeting ?? null, at: t, ...(by ? { by } : {}) };
  if (!d0.delegations.some((x) => x.id === next.deleg)) throw new Error(`Unbekannte Delegation ${next.deleg}`);
  check(DELEG_STANCES, next.stance, 'Haltung');
  if (next.meeting && !(d0.meetings || []).some((m) => m.id === next.meeting)) throw new Error(`Unbekannte Sitzung ${next.meeting}`);
  const l2 = old ? list.map((s) => (s.id === id ? next : s)) : [...list, next];
  return { dossier: { ...touch(d0, t), stances: { ...(d0.stances || {}), [rowId]: l2 } }, id: next.id };
}
export function removeStance(dossier, rowId, stanceId, { at } = {}) {
  const st = { ...(dossier.stances || {}) };
  const l = (st[rowId] || []).filter((s) => s.id !== stanceId);
  if (l.length) st[rowId] = l; else delete st[rowId];
  return { ...touch(dossier, at || nowIso()), stances: st };
}

// ------------------------------------------------------------------ Interventionen der Schweiz

export function addIntervention(dossier, { id, meeting = null, row = null, text = '', result = 'open', note = '', at, by } = {}) {
  check(INTERVENTION_RESULTS, result, 'Wirkung');
  const t = at || nowIso();
  const list = dossier.interventions || [];
  if (meeting && !(dossier.meetings || []).some((m) => m.id === meeting)) throw new Error(`Unbekannte Sitzung ${meeting}`);
  if (row && !dossier.rows.some((r) => r.id === row)) throw new Error(`Unbekannte Zeile ${row}`);
  const iid = id || newId('i', list.map((x) => x.id));
  if (list.some((x) => x.id === iid)) throw new Error(`Intervention ${iid} existiert bereits`);
  const x = { id: iid, meeting, row, text, result, note, at: t, ...(by ? { by } : {}) };
  return { dossier: { ...touch(dossier, t), interventions: [...list, x] }, id: iid };
}
export function updateIntervention(dossier, id, patch, { at, by } = {}) {
  const list = dossier.interventions || [];
  if (!list.some((x) => x.id === id)) throw new Error(`Unbekannte Intervention ${id}`);
  if (patch.result) check(INTERVENTION_RESULTS, patch.result, 'Wirkung');
  const t = at || nowIso();
  const p = clone(patch); delete p.id;
  return { ...touch(dossier, t), interventions: list.map((x) => (x.id === id ? { ...x, ...p, at: t, ...(by ? { by } : {}) } : x)) };
}
export function removeIntervention(dossier, id, { at } = {}) {
  return { ...touch(dossier, at || nowIso()), interventions: (dossier.interventions || []).filter((x) => x.id !== id) };
}

// ------------------------------------------------------------------ Ergebnis der CH-Position

export function setOutcome(dossier, rowId, { status, note = '', doc = null, at, by } = {}) {
  check(OUTCOMES, status, 'Ergebnis');
  const t = at || nowIso();
  const pos = dossier.positions[rowId];
  if (!pos) throw new Error(`Zeile ${rowId} hat keine Position`);
  const outcome = { status, note, doc, at: t, ...(by ? { by } : {}) };
  const history = [...(pos.history || []), { at: t, stance: pos.stance, priority: pos.priority, text: pos.text, proposal: pos.proposal, source: 'outcome', outcome: status, ...(by ? { by } : {}) }];
  return { ...touch(dossier, t), positions: { ...dossier.positions, [rowId]: { ...pos, outcome, history } } };
}

// ------------------------------------------------------------------ Matrix der Haltungen

/** jüngste Haltung je Delegation und Zeile (optional nur einer Sitzung); frühere Haltungen in `earlier` */
export function stanceMatrix(dossier, { rows: only, meeting } = {}) {
  const dels = ensureDelegations(dossier).delegations;
  const mDate = new Map((dossier.meetings || []).map((m) => [m.id, m.date || '']));
  const key = (s) => `${(s.meeting && mDate.get(s.meeting)) || ''}|${s.at || ''}`;
  const want = only ? new Set(only) : null;
  const used = new Set();
  const byStance = {}, byDelegation = {};
  const rows = [];
  for (const r of sortedRows(dossier)) {
    if (want && !want.has(r.id)) continue;
    let list = (dossier.stances || {})[r.id] || [];
    if (meeting) list = list.filter((s) => s.meeting === meeting);
    if (!list.length) continue;
    const cells = {};
    for (const s of list.slice().sort((a, b) => key(a).localeCompare(key(b)))) {
      const prev = cells[s.deleg];
      cells[s.deleg] = { id: s.id, stance: s.stance, text: s.text || '', meeting: s.meeting || null, at: s.at || null, ...(s.by ? { by: s.by } : {}), earlier: prev ? [...prev.earlier, { id: prev.id, stance: prev.stance, text: prev.text, meeting: prev.meeting, at: prev.at }] : [] };
    }
    for (const [dg, c] of Object.entries(cells)) {
      used.add(dg);
      byStance[c.stance] = (byStance[c.stance] || 0) + 1;
      byDelegation[dg] = byDelegation[dg] || {};
      byDelegation[dg][c.stance] = (byDelegation[dg][c.stance] || 0) + 1;
    }
    rows.push({ rowId: r.id, num: r.num, label: r.label, cells });
  }
  const delegations = dels.filter((x) => used.has(x.id)).map((x) => ({ id: x.id, code: x.code, name: x.name, kind: x.kind, ...(x.abbr ? { abbr: x.abbr } : {}) }));
  for (const dg of used) if (!dels.some((x) => x.id === dg)) delegations.push({ id: dg, code: dg.toUpperCase(), name: { de: dg, fr: dg, en: dg }, kind: 'other', unknown: true });
  return { delegations, rows, counts: { byStance, byDelegation } };
}

// ------------------------------------------------------------------ Vorschlag für das Ergebnis

const toks = (h) => normText(h ? htmlToCleanText(h) || htmlToText(h) : '', { caseFold: true }).split(' ').filter(Boolean);
const cellText = (c) => (c && !c.empty ? (c.clean !== undefined ? c.clean : htmlToCleanText(c.html || '') || c.text || '') : '');

/**
 * Jüngster Kompromisstext (Spur agreement) mit Text. Leere Kompromisszellen bedeuten in Vier-Spalten-Tabellen «noch kein
 * Kompromiss», nicht «gestrichen»; gestrichen ist eine Zelle mit Text «deleted», Status deleted oder ganz durchgestrichenem Text.
 */
function latestCompromise(dossier, rowId) {
  const list = (dossier.cells[rowId] || {}).agreement || [];
  for (let i = list.length - 1; i >= 0; i--) if (!list[i].empty && (list[i].html || list[i].text)) return { track: 'agreement', cell: list[i] };
  return null;
}

/**
 * Ergebnis der CH-Position vorschlagen (kein Entscheid): vergleicht den Textvorschlag (bzw. bei Positionen ohne Vorschlag die Haltung)
 * mit dem jüngsten Kompromisstext (Spur agreement). Mit Textvorschlag: Änderungen des Vorschlags gegenüber dem Bezugstext
 * (eingefügte und gestrichene Wörter) und Anteil, der im Kompromiss umgesetzt ist (eingefügte Wörter vorhanden, gestrichene fehlen).
 * Schwellen: ≥ 0,8 achieved, ≥ 0,35 partly, sonst not. Ohne Bezugstext: Ähnlichkeit Vorschlag–Kompromiss (≥ 0,95 / ≥ 0,6).
 */
export function suggestOutcome(dossier, rowId) {
  const pos = dossier.positions[rowId];
  const R = (status, confidence, de, fr, extra = {}) => ({ status, confidence, reason: { de, fr }, ...extra });
  if (!pos || pos.stance === 'none') return R('open', 'low', 'Keine Position erfasst.', 'Aucune position saisie.', { basis: null, compared: null, measure: {} });
  const comp = latestCompromise(dossier, rowId);
  const basisCell = pos.basis && pos.basis.track ? ((dossier.cells[rowId] || {})[pos.basis.track] || []).find((c) => c.doc === pos.basis.doc) || latestCell(dossier, rowId, pos.basis.track) : null;
  const basis = pos.basis || null;
  if (!comp) return R('open', 'low', 'Kein Kompromisstext (Spur «Kompromiss») vorhanden.', 'Aucun texte de compromis (piste « Compromis ») disponible.', { basis, compared: null, measure: {} });
  const compared = { track: comp.track, doc: comp.cell.doc };
  const ref = (dossier.documents.find((x) => x.id === comp.cell.doc) || {}).ref || comp.cell.doc;
  const compText = cellText(comp.cell);
  const deleted = !compText.trim() || comp.cell.status === 'deleted' || /^deleted\.?$/i.test(compText.trim());
  const basisText = cellText(basisCell);
  const proposal = String(pos.proposal || '').trim();
  if (proposal) {
    if (deleted) return R('not', 'medium', `Bestimmung im Kompromiss (${ref}) gestrichen; Textvorschlag nicht umgesetzt.`, `Disposition supprimée dans le compromis (${ref}) ; proposition de texte non reprise.`, { basis, compared, measure: { deleted: true } });
    const B = toks(basisText), P = toks(proposal), C = toks(compText);
    if (B.length) {
      const parts = diffWords(B.join(' '), P.join(' '));
      const ins = parts.filter((x) => x.added).flatMap((x) => x.value.trim().split(' ').filter(Boolean));
      const del = parts.filter((x) => x.removed).flatMap((x) => x.value.trim().split(' ').filter(Boolean));
      if (ins.length + del.length === 0) return R(similarity(basisText, compText) >= 0.95 ? 'achieved' : 'partly', 'low', 'Textvorschlag entspricht dem Bezugstext; Vergleich nur über die Ähnlichkeit zum Kompromiss.', 'La proposition correspond au texte de référence ; comparaison uniquement par similarité avec le compromis.', { basis, compared, measure: { similarity: +similarity(basisText, compText).toFixed(2) } });
      const cset = new Map(); for (const w of C) cset.set(w, (cset.get(w) || 0) + 1);
      const bset = new Map(); for (const w of B) bset.set(w, (bset.get(w) || 0) + 1);
      let insHit = 0; for (const w of ins) if (cset.get(w)) { insHit++; cset.set(w, cset.get(w) - 1); }
      const cAll = new Map(); for (const w of C) cAll.set(w, (cAll.get(w) || 0) + 1);
      let delHit = 0; for (const w of del) { const before = bset.get(w) || 0; const now = cAll.get(w) || 0; if (now < before) { delHit++; cAll.set(w, now + 1); } }
      const share = (insHit + delHit) / (ins.length + del.length);
      const status = share >= 0.8 ? 'achieved' : share >= 0.35 ? 'partly' : 'not';
      const pct = Math.round(share * 100);
      return R(status, 'medium',
        `${pct} % der vorgeschlagenen Änderungen (${ins.length} eingefügte, ${del.length} gestrichene Wörter gegenüber dem Bezugstext) stehen im Kompromiss ${ref}.`,
        `${pct} % des modifications proposées (${ins.length} mots insérés, ${del.length} mots supprimés par rapport au texte de référence) figurent dans le compromis ${ref}.`,
        { basis, compared, measure: { share: +share.toFixed(2), inserted: ins.length, insertedFound: insHit, deleted: del.length, deletedGone: delHit } });
    }
    const sim = similarity(proposal, compText);
    const status = sim >= 0.95 ? 'achieved' : sim >= 0.6 ? 'partly' : 'not';
    return R(status, 'low', `Kein Bezugstext; Ähnlichkeit Textvorschlag – Kompromiss ${ref}: ${Math.round(sim * 100)} %.`, `Pas de texte de référence ; similarité proposition – compromis ${ref} : ${Math.round(sim * 100)} %.`, { basis, compared, measure: { similarity: +sim.toFixed(2) } });
  }
  // ohne Textvorschlag: Haltung und Textentwicklung seit dem Bezug
  const sim = basisText ? similarity(basisText, compText) : null;
  const unchanged = sim !== null && sim >= 0.95;
  const st = pos.stance;
  if (st === 'support') {
    if (deleted) return R('not', 'medium', `Unterstützte Bestimmung im Kompromiss (${ref}) gestrichen.`, `Disposition soutenue supprimée dans le compromis (${ref}).`, { basis, compared, measure: { deleted: true } });
    if (unchanged) return R('achieved', 'medium', `Unterstützter Text im Kompromiss ${ref} unverändert (Ähnlichkeit ${Math.round(sim * 100)} %).`, `Texte soutenu inchangé dans le compromis ${ref} (similarité ${Math.round(sim * 100)} %).`, { basis, compared, measure: { similarity: +sim.toFixed(2) } });
    return R('partly', 'low', `Unterstützter Text im Kompromiss ${ref} geändert${sim !== null ? ` (Ähnlichkeit ${Math.round(sim * 100)} %)` : ''}; inhaltlich prüfen.`, `Texte soutenu modifié dans le compromis ${ref}${sim !== null ? ` (similarité ${Math.round(sim * 100)} %)` : ''} ; à vérifier.`, { basis, compared, measure: { similarity: sim === null ? null : +sim.toFixed(2) } });
  }
  if (st === 'oppose' || st === 'reservation') {
    if (deleted) return R('achieved', 'medium', `Abgelehnte bzw. mit Vorbehalt belegte Bestimmung im Kompromiss (${ref}) gestrichen.`, `Disposition rejetée ou faisant l’objet d’une réserve supprimée dans le compromis (${ref}).`, { basis, compared, measure: { deleted: true } });
    if (unchanged) return R('not', 'medium', `Bestimmung im Kompromiss ${ref} unverändert übernommen.`, `Disposition reprise sans changement dans le compromis ${ref}.`, { basis, compared, measure: { similarity: +sim.toFixed(2) } });
    return R('partly', 'low', `Bestimmung im Kompromiss ${ref} geändert${sim !== null ? ` (Ähnlichkeit ${Math.round(sim * 100)} %)` : ''}; prüfen, ob das Anliegen aufgenommen ist.`, `Disposition modifiée dans le compromis ${ref}${sim !== null ? ` (similarité ${Math.round(sim * 100)} %)` : ''} ; vérifier si la préoccupation est reprise.`, { basis, compared, measure: { similarity: sim === null ? null : +sim.toFixed(2) } });
  }
  return R('open', 'low', `Haltung «${T('de').stance[st] || st}» ohne Textvorschlag: kein maschineller Vergleich möglich.`, `Appréciation « ${T('fr').stance[st] || st} » sans proposition de texte : pas de comparaison automatique possible.`, { basis, compared, measure: {} });
}

// ------------------------------------------------------------------ Bilanz

export function balance(dossier, { suggest = true } = {}) {
  const byOutcome = { achieved: 0, partly: 0, not: 0, open: 0, obsolete: 0, unset: 0 };
  const byPriority = {};
  const rows = [];
  const ivs = dossier.interventions || [];
  for (const r of sortedRows(dossier)) {
    const pos = dossier.positions[r.id];
    if (!pos || (pos.stance === 'none' && !pos.text)) continue;
    const outcome = pos.outcome || null;
    const status = outcome ? outcome.status : 'unset';
    byOutcome[status] = (byOutcome[status] || 0) + 1;
    const pr = pos.priority || 'medium';
    byPriority[pr] = byPriority[pr] || { achieved: 0, partly: 0, not: 0, open: 0, obsolete: 0, unset: 0 };
    byPriority[pr][status]++;
    const rowIvs = ivs.filter((x) => x.row === r.id);
    rows.push({
      rowId: r.id, num: r.num, label: r.label, stance: pos.stance, priority: pos.priority, text: pos.text || '', proposal: pos.proposal || '',
      outcome, suggestion: suggest && !outcome ? suggestOutcome(dossier, r.id) : null,
      interventions: rowIvs.map((x) => ({ id: x.id, meeting: x.meeting, result: x.result })),
    });
  }
  const total = rows.length;
  const decided = total - byOutcome.unset - byOutcome.open - byOutcome.obsolete;
  const byResult = {}; const byMeeting = {};
  for (const x of ivs) { byResult[x.result] = (byResult[x.result] || 0) + 1; const k = x.meeting || '-'; byMeeting[k] = (byMeeting[k] || 0) + 1; }
  return {
    total, byOutcome, byPriority,
    achievedShare: decided ? +((byOutcome.achieved + 0.5 * byOutcome.partly) / decided).toFixed(2) : null,
    rows,
    interventions: { total: ivs.length, byResult, byMeeting, withoutRow: ivs.filter((x) => !x.row).length },
    meetings: meetingsByDate(dossier).map((m) => ({ id: m.id, date: m.date, body: m.body, title: m.title, interventions: ivs.filter((x) => x.meeting === m.id).length, stances: Object.values(dossier.stances || {}).flat().filter((s) => s.meeting === m.id).length })),
    lastDoc: (docsByDate(dossier).slice(-1)[0] || {}).id || null,
  };
}
