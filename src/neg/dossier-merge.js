// SGK-Navigator, Modul Verhandlung — Projektdateien vergleichen und zusammenführen (ESM, isomorph, rein). SPEC3 §3.8.
//
// diffDossiers(a, b) -> { same, entries:[ { path, kind:"added"|"removed"|"changed", a, b, fields? } ] }
//   Vergleich je Element (Pfad wie unten). `updated` des Dossiers, `importedAt` der Dokumente und `order` der Zeilen zählen nicht
//   als Inhalt (Reihenfolge der Zeilen: Eintrag "rows#order", falls verschieden). Ids werden 1:1 verglichen (keine Abbildung).
// mergeDossiers(mine, theirs, { base?, resolutions?, now? }) ->
//   { merged, conflicts:[ { id, path, label, mine, theirs, base?, kind } ], applied:{ fromMine, fromTheirs, identical, combined },
//     removed:[ { path, by:"mine"|"theirs" } ], mapping:{ docs, rows, consultations, offices, responses, meetings, interventions, stances }, warnings }
//   kind: "both-changed" (beide Seiten verschieden geändert) | "delete-modify" (eine Seite gelöscht, die andere geändert; nur mit base)
//   resolutions: { <conflictId>: "mine" | "theirs" | { value } }  (Konflikt-Id = Pfad; ohne Entscheid gilt im Ergebnis "mine")
//
// Pfade (= Konflikt-Ids): meta/<feld>, tracks/<id>, documents/<id>, rows/<id>, cells/<rowId>/<spur>/<docId>, positions/<rowId>
// bzw. positions/<rowId>/<feld>, stances/<rowId>/<id>, delegations/<id>, meetings/<id>, interventions/<id>, consultations/<id>,
// consultations/<id>/offices/<id>, consultations/<id>/responses/<id>, consultations/<id>/decisions/<itemId>, consultations/<id>/scope.
//
// Regeln:
//  - Gleiche Id und gleicher Inhalt = identisch. Nur auf einer Seite vorhanden = übernehmen (mit base: auf der anderen Seite gelöscht,
//    falls in base vorhanden und dort unverändert → gelöscht; geändert → Konflikt "delete-modify").
//  - Auf beiden Seiten verschieden: mit base dreiseitig (nur eine Seite weicht von base ab → diese Seite); Positionen feldweise.
//    Ohne base: Positionen anhand des Verlaufs (ist der Verlauf der einen Seite in dem der anderen enthalten, gilt die längere Seite);
//    sonst Konflikt. Konflikte werden nie automatisch entschieden.
//  - Listen (Verlauf der Positionen, Rückmeldungen, Haltungen, Interventionen, Umfang der Runde) werden ohne Dubletten vereinigt.
//  - Unabhängig importierte gleiche Dokumente (gleicher sha256) werden aufeinander abgebildet, ebenso deren neue Zeilen
//    (Dokument der Entstehung, Zeilennummer, Fundstelle, Text) und Zellen. Gleiche Id mit verschiedenem Gegenstand (z. B. beide Seiten
//    legen «m2» für verschiedene Sitzungen an) → das Element von theirs erhält eine neue Id (mapping), es geht nichts verloren.

import { clone } from './util.js';

const nowIso = () => new Date().toISOString();
const COLLECTIONS = ['tracks', 'documents', 'rows', 'cells', 'positions', 'consultations', 'delegations', 'meetings', 'stances', 'interventions'];
const VOLATILE_META = new Set(['updated', 'created', 'cellFormat']);

function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v).sort()) if (v[k] !== undefined) o[k] = canon(v[k]); return o; }
  return v;
}
const J = (v) => JSON.stringify(canon(v));
const eq = (a, b) => J(a) === J(b);

function stripDoc(d) { if (!d) return d; const x = { ...d }; delete x.importedAt; return x; }
function stripRow(r) { if (!r) return r; const x = { ...r }; delete x.order; return x; }

// ------------------------------------------------------------------ Abflachen

/** Dossier → Map(Pfad → Wert) */
function flatten(d) {
  const m = new Map();
  if (!d) return m;
  for (const [k, v] of Object.entries(d)) if (!COLLECTIONS.includes(k) && !VOLATILE_META.has(k)) m.set(`meta/${k}`, v);
  for (const f of ['tracks', 'delegations', 'meetings', 'interventions']) for (const x of d[f] || []) m.set(`${f}/${x.id}`, x);
  for (const x of d.documents || []) m.set(`documents/${x.id}`, stripDoc(x));
  for (const x of d.rows || []) m.set(`rows/${x.id}`, stripRow(x));
  for (const [rid, byT] of Object.entries(d.cells || {})) for (const [tid, list] of Object.entries(byT)) for (const c of list) m.set(`cells/${rid}/${tid}/${c.doc}`, c);
  for (const [rid, p] of Object.entries(d.positions || {})) m.set(`positions/${rid}`, p);
  for (const [rid, list] of Object.entries(d.stances || {})) for (const s of list) m.set(`stances/${rid}/${s.id}`, s);
  for (const k of d.consultations || []) {
    const { offices, responses, decisions, scope, ...rest } = k;
    m.set(`consultations/${k.id}`, rest);
    for (const o of offices || []) m.set(`consultations/${k.id}/offices/${o.id}`, o);
    for (const r of responses || []) { const x = { ...r }; delete x.importedAt; m.set(`consultations/${k.id}/responses/${r.id}`, x); }
    for (const [iid, dec] of Object.entries(decisions || {})) m.set(`consultations/${k.id}/decisions/${iid}`, dec);
    m.set(`consultations/${k.id}/scope`, (scope || []).slice());
  }
  return m;
}

// ------------------------------------------------------------------ Vergleich

export function diffDossiers(a, b) {
  const A = flatten(a), B = flatten(b);
  const entries = [];
  const paths = [...new Set([...A.keys(), ...B.keys()])];
  for (const p of paths) {
    const x = A.get(p), y = B.get(p);
    if (x === undefined) entries.push({ path: p, kind: 'added', a: undefined, b: clone(y) });
    else if (y === undefined) entries.push({ path: p, kind: 'removed', a: clone(x), b: undefined });
    else if (!eq(x, y)) {
      const e = { path: p, kind: 'changed', a: clone(x), b: clone(y) };
      if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x)) e.fields = [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => !eq(x[k], y[k]));
      entries.push(e);
    }
  }
  const oa = (a.rows || []).slice().sort((p, q) => p.order - q.order).map((r) => r.id).filter((id) => (b.rows || []).some((r) => r.id === id));
  const ob = (b.rows || []).slice().sort((p, q) => p.order - q.order).map((r) => r.id).filter((id) => (a.rows || []).some((r) => r.id === id));
  if (!eq(oa, ob)) entries.push({ path: 'rows#order', kind: 'changed', a: oa, b: ob });
  entries.sort((p, q) => p.path.localeCompare(q.path));
  return { same: entries.length === 0, entries };
}

// ------------------------------------------------------------------ Abbildung der Ids von theirs

function freshId(prefix, used, width = 0) {
  let n = 1;
  const make = (k) => (width ? `${prefix}${String(k).padStart(width, '0')}` : `${prefix}${k}`);
  while (used.has(make(n))) n++;
  const id = make(n);
  used.add(id);
  return id;
}
/** neue Zeilen-Id im Muster von applyMerge (r + 6 Ziffern, Zehnerschritte nach der höchsten vergebenen) */
function freshRowId(used) {
  let n = Math.max(0, ...[...used].map((x) => +(/^r(\d+)$/.exec(x) || [0, 0])[1])) + 10;
  let id;
  do { id = `r${String(n).padStart(6, '0')}`; n += 10; } while (used.has(id));
  used.add(id);
  return id;
}
const rowText = (d, rid, docId) => {
  for (const list of Object.values((d.cells || {})[rid] || {})) { const c = list.find((x) => x.doc === docId && !x.empty); if (c) return c.text || ''; }
  return '';
};

function buildMapping(M, T, B) {
  const map = { docs: {}, rows: {}, consultations: {}, offices: {}, responses: {}, items: {}, meetings: {}, interventions: {}, stances: {} };
  const inBase = (coll, id) => !!B && (B[coll] || []).some((x) => x.id === id);
  // Dokumente
  const usedDocs = new Set([...(M.documents || []).map((x) => x.id), ...(T.documents || []).map((x) => x.id), ...((B && B.documents) || []).map((x) => x.id)]);
  const sha = (x) => (x && x.file && x.file.sha256) || null;
  const sameDoc = (x, y) => (sha(x) && sha(y) ? sha(x) === sha(y) : (x.ref || null) === (y.ref || null) && (x.date || null) === (y.date || null) && (x.kind || null) === (y.kind || null));
  for (const t of T.documents || []) {
    if (inBase('documents', t.id)) { map.docs[t.id] = t.id; continue; }
    const bySha = (M.documents || []).find((m) => sha(m) && sha(m) === sha(t));
    const same = (M.documents || []).find((m) => m.id === t.id);
    if (bySha) map.docs[t.id] = bySha.id;
    else if (same && sameDoc(same, t)) map.docs[t.id] = t.id;
    else if (same) map.docs[t.id] = freshId('doc', usedDocs);
    else map.docs[t.id] = t.id;
  }
  const md = (id) => (id && map.docs[id]) || id;
  // Zeilen
  const usedRows = new Set([...(M.rows || []).map((x) => x.id), ...(T.rows || []).map((x) => x.id), ...((B && B.rows) || []).map((x) => x.id)]);
  const mRows = new Map((M.rows || []).map((r) => [r.id, r]));
  const taken = new Set();
  for (const t of T.rows || []) {
    if (inBase('rows', t.id)) { map.rows[t.id] = t.id; taken.add(t.id); continue; }
    const created = md(t.createdBy);
    const same = mRows.get(t.id);
    const matchRow = (m) => m && md(m.createdBy) === created && ((m.num || null) === (t.num || null)) && m.label === t.label && rowText(M, m.id, created) === rowText(T, t.id, t.createdBy);
    // gleiche Fundstelle und für ein gemeinsames Dokument derselbe Text in derselben Spur (Zeile auf beiden Seiten aus
    // verschiedenen Dokumenten entstanden, aber dieselbe Bestimmung)
    const sharedCell = (m) => m && m.label === t.label && Object.entries((T.cells || {})[t.id] || {}).some(([tid, list]) => list.some((c) => !c.empty
      && (((M.cells || {})[m.id] || {})[tid] || []).some((x) => !x.empty && x.doc === md(c.doc) && x.text === c.text)));
    if (same && (matchRow(same) || sharedCell(same) || (!B && md(same.createdBy) === created && same.label === t.label))) { map.rows[t.id] = t.id; taken.add(t.id); continue; }
    const cand = (M.rows || []).find((m) => !taken.has(m.id) && !(B && inBase('rows', m.id)) && (matchRow(m) || sharedCell(m)));
    if (cand) { map.rows[t.id] = cand.id; taken.add(cand.id); continue; }
    map.rows[t.id] = same ? freshRowId(usedRows) : t.id;
  }
  // Sitzungen, Interventionen, Haltungen, Konsultationen (fortlaufende Ids: gleiche Id, anderer Gegenstand → neue Id)
  const seqMap = (coll, prefix, sameFn, target) => {
    const used = new Set([...(M[coll] || []).map((x) => x.id), ...(T[coll] || []).map((x) => x.id), ...((B && B[coll]) || []).map((x) => x.id)]);
    for (const t of T[coll] || []) {
      if (inBase(coll, t.id)) { target[t.id] = t.id; continue; }
      const same = (M[coll] || []).find((m) => m.id === t.id);
      const twin = (M[coll] || []).find((m) => m.id !== t.id && !inBase(coll, m.id) && eq(norm(coll, m), norm(coll, t)));
      if (same && sameFn(same, t)) target[t.id] = t.id;
      else if (twin && !same) target[t.id] = twin.id;
      else if (same) target[t.id] = freshId(prefix, used);
      else target[t.id] = t.id;
    }
  };
  const norm = (coll, x) => { const y = { ...x }; delete y.id; if (coll === 'interventions') { y.row = y.row && (map.rows[y.row] || y.row); } return y; };
  seqMap('meetings', 'm', (m, t) => (m.date || null) === (t.date || null) && (m.body || '') === (t.body || ''), map.meetings);
  seqMap('interventions', 'i', (m, t) => (m.meeting || null) === (t.meeting || null) && (m.row || null) === ((t.row && map.rows[t.row]) || t.row || null), map.interventions);
  // Haltungen (Ids dossierweit eindeutig)
  const allSt = (d) => Object.entries((d && d.stances) || {}).flatMap(([rid, l]) => l.map((s) => ({ ...s, rid })));
  const usedSt = new Set([...allSt(M), ...allSt(T), ...allSt(B)].map((s) => s.id));
  const mSt = new Map(allSt(M).map((s) => [s.id, s]));
  const bSt = new Set(allSt(B).map((s) => s.id));
  for (const s of allSt(T)) {
    if (bSt.has(s.id)) { map.stances[s.id] = s.id; continue; }
    const m = mSt.get(s.id);
    const twin = allSt(M).find((x) => x.id !== s.id && !bSt.has(x.id) && x.rid === (map.rows[s.rid] || s.rid) && x.deleg === s.deleg && (x.meeting || null) === ((s.meeting && map.meetings[s.meeting]) || s.meeting || null) && x.stance === s.stance && (x.text || '') === (s.text || ''));
    if (m && m.rid === (map.rows[s.rid] || s.rid) && m.deleg === s.deleg) map.stances[s.id] = s.id;
    else if (twin && !m) map.stances[s.id] = twin.id;
    else map.stances[s.id] = m ? freshId('h', usedSt) : s.id;
  }
  // Konsultationen, Stellen, Rückmeldungen
  const usedK = new Set([...(M.consultations || []), ...(T.consultations || []), ...((B && B.consultations) || [])].map((k) => k.id));
  for (const tk of T.consultations || []) {
    const mk = (M.consultations || []).find((k) => k.id === tk.id);
    let kid = tk.id;
    if (!inBase('consultations', tk.id) && mk && mk.title !== tk.title && mk.created !== tk.created) kid = freshId('k', usedK);
    map.consultations[tk.id] = kid;
    const mk2 = kid === tk.id ? mk : null;
    const bk = B && (B.consultations || []).find((k) => k.id === tk.id);
    map.offices[kid] = {}; map.responses[kid] = {}; map.items[kid] = {};
    const usedO = new Set([...((mk2 && mk2.offices) || []), ...(tk.offices || [])].map((o) => o.id));
    for (const o of tk.offices || []) {
      const inB = bk && (bk.offices || []).some((x) => x.id === o.id);
      const same = mk2 && (mk2.offices || []).find((x) => x.id === o.id);
      const byName = mk2 && (mk2.offices || []).find((x) => x.name === o.name && x.abbr === o.abbr);
      map.offices[kid][o.id] = inB || !same || (same.name === o.name) ? (same || inB || !byName ? o.id : byName.id) : (byName ? byName.id : freshId('o', usedO));
    }
    const usedA = new Set([...((mk2 && mk2.responses) || []), ...(tk.responses || [])].map((r) => r.id));
    const sig = (r, offMap, rowMap) => J({ office: offMap(r.office), sha: (r.file && r.file.sha256) || null, name: (r.file && r.file.name) || null, items: (r.items || []).map((it) => [rowMap(it.row), it.comment || '', it.proposal || '']), general: r.general || '' });
    for (const r of tk.responses || []) {
      const inB = bk && (bk.responses || []).some((x) => x.id === r.id);
      const tsig = sig(r, (o) => map.offices[kid][o] || o, (x) => map.rows[x] || x);
      const mine = (mk2 && mk2.responses) || [];
      const same = mine.find((x) => x.id === r.id);
      const twin = mine.find((x) => sig(x, (o) => o, (y) => y) === tsig);
      let aid;
      if (inB) aid = r.id;
      else if (twin) aid = twin.id;
      else if (same) aid = freshId('a', usedA);
      else aid = r.id;
      map.responses[kid][r.id] = aid;
      for (const it of r.items || []) map.items[kid][it.id] = aid === r.id ? it.id : it.id.replace(new RegExp(`^${r.id}-`), `${aid}-`);
    }
  }
  return map;
}

/** theirs mit abgebildeten Ids umschreiben */
function remap(T, map) {
  const d = clone(T);
  const doc = (id) => (id && map.docs[id]) || id;
  const row = (id) => (id && map.rows[id]) || id;
  const basis = (b) => (b ? { ...b, ...(b.doc ? { doc: doc(b.doc) } : {}), ...(b.compareTo ? { compareTo: doc(b.compareTo) } : {}) } : b);
  d.documents = (d.documents || []).map((x) => ({ ...x, id: doc(x.id) }));
  d.rows = (d.rows || []).map((r) => ({ ...r, id: row(r.id), ...(r.createdBy ? { createdBy: doc(r.createdBy) } : {}), ...(r.numHistory ? { numHistory: r.numHistory.map((h) => ({ ...h, doc: doc(h.doc) })) } : {}) }));
  const cells = {};
  for (const [rid, byT] of Object.entries(d.cells || {})) { cells[row(rid)] = {}; for (const [tid, list] of Object.entries(byT)) cells[row(rid)][tid] = list.map((c) => ({ ...c, doc: doc(c.doc) })); }
  d.cells = cells;
  const pos = {};
  for (const [rid, p] of Object.entries(d.positions || {})) pos[row(rid)] = { ...p, basis: basis(p.basis), ...(p.outcome ? { outcome: { ...p.outcome, doc: doc(p.outcome.doc) } } : {}) };
  d.positions = pos;
  if (d.meetings) d.meetings = d.meetings.map((m) => ({ ...m, id: map.meetings[m.id] || m.id, docs: (m.docs || []).map(doc) }));
  const meet = (id) => (id && map.meetings[id]) || id;
  if (d.interventions) d.interventions = d.interventions.map((x) => ({ ...x, id: map.interventions[x.id] || x.id, meeting: meet(x.meeting), row: row(x.row) }));
  if (d.stances) { const st = {}; for (const [rid, l] of Object.entries(d.stances)) st[row(rid)] = l.map((s) => ({ ...s, id: map.stances[s.id] || s.id, meeting: meet(s.meeting) })); d.stances = st; }
  d.consultations = (d.consultations || []).map((k) => {
    const kid = map.consultations[k.id] || k.id;
    const om = map.offices[kid] || {}, am = map.responses[kid] || {}, im = map.items[kid] || {};
    const decisions = {};
    for (const [iid, dec] of Object.entries(k.decisions || {})) decisions[im[iid] || iid] = dec;
    return {
      ...k, id: kid, basis: basis(k.basis), scope: (k.scope || []).map(row),
      offices: (k.offices || []).map((o) => ({ ...o, id: om[o.id] || o.id })),
      responses: (k.responses || []).map((r) => ({ ...r, id: am[r.id] || r.id, office: om[r.office] || r.office, items: (r.items || []).map((it) => ({ ...it, id: im[it.id] || it.id, row: row(it.row) })) })),
      decisions,
    };
  });
  return d;
}

// ------------------------------------------------------------------ Zusammenführen

const labelOf = (path, M, T) => {
  const seg = path.split('/');
  const rowLabel = (rid) => { const r = (M.rows || []).find((x) => x.id === rid) || (T.rows || []).find((x) => x.id === rid); return r ? `${r.num ? r.num + ' ' : ''}${r.label}` : rid; };
  switch (seg[0]) {
    case 'positions': return `Position CH: ${rowLabel(seg[1])}${seg[2] ? ` (${seg[2]})` : ''}`;
    case 'cells': return `Zelle ${rowLabel(seg[1])} [${seg[2]}, ${seg[3]}]`;
    case 'rows': return `Zeile ${rowLabel(seg[1])}`;
    case 'stances': return `Haltung ${rowLabel(seg[1])} (${seg[2]})`;
    case 'consultations': return seg[2] ? `Konsultation ${seg[1]}: ${seg[2]} ${seg[3] || ''}`.trim() : `Konsultation ${seg[1]}`;
    case 'meta': return `Dossier: ${seg[1]}`;
    default: return path;
  }
};

/** Verlaufseinträge vereinigen (ohne Dubletten, nach Zeit) */
function unionHistory(a = [], b = []) {
  const seen = new Set(); const out = [];
  for (const h of [...a, ...b]) { const k = J(h); if (!seen.has(k)) { seen.add(k); out.push(h); } }
  return out.map((h, i) => ({ h, i })).sort((x, y) => String(x.h.at || '').localeCompare(String(y.h.at || '')) || x.i - y.i).map((x) => x.h);
}
const histSet = (p) => new Set((p.history || []).map(J));
const subset = (a, b) => { for (const x of a) if (!b.has(x)) return false; return true; };
const maxIso = (...xs) => xs.filter(Boolean).sort().slice(-1)[0] || null;
const minIso = (...xs) => xs.filter(Boolean).sort()[0] || null;

export function mergeDossiers(mine, theirs, { base = null, resolutions = {}, now } = {}) {
  const warnings = [];
  if (mine.id !== theirs.id) warnings.push({ code: 'dossier-id-differs', message: `Dossier-Ids verschieden (${mine.id} / ${theirs.id})` });
  const map = buildMapping(mine, theirs, base);
  const T = remap(theirs, map);
  const FM = flatten(mine), FT = flatten(T), FB = base ? flatten(base) : null;
  const out = new Map();
  const conflicts = [];
  const removed = [];
  const applied = { fromMine: 0, fromTheirs: 0, identical: 0, combined: 0 };
  const conflict = (path, kind, m, t, b) => {
    const c = { id: path, path, label: labelOf(path, mine, T), mine: clone(m), theirs: clone(t), kind, ...(b !== undefined ? { base: clone(b) } : {}) };
    conflicts.push(c);
    const r = resolutions[path];
    if (r === 'theirs') return t;
    if (r && typeof r === 'object' && 'value' in r) return r.value;
    return m;
  };
  const paths = [...new Set([...FM.keys(), ...FT.keys()])];
  for (const p of paths) {
    const m = FM.get(p), t = FT.get(p), b = FB ? FB.get(p) : undefined;
    if (p.startsWith('positions/')) { const v = mergePosition(p, m, t, b, FB !== null, conflict, applied, removed); if (v !== undefined) out.set(p, v); continue; }
    if (p.endsWith('/scope') && p.startsWith('consultations/')) {
      const u = [...new Set([...(m || []), ...(t || [])])];
      if (m && t && eq(m, t)) applied.identical++; else if (!t) applied.fromMine++; else if (!m) applied.fromTheirs++; else applied.combined++;
      out.set(p, u); continue;
    }
    if (m !== undefined && t !== undefined) {
      if (eq(m, t)) { applied.identical++; out.set(p, m); continue; }
      if (p.startsWith('rows/')) {
        // dieselbe Zeile, auf beiden Seiten aus verschiedenen Dokumenten entstanden: Entstehung = mine, Nummernverlauf vereinigt
        const strip = (x) => { const y = { ...x }; delete y.createdBy; delete y.numHistory; return y; };
        if (eq(strip(m), strip(t))) {
          const nh = unionHistory(m.numHistory || [], t.numHistory || []);
          out.set(p, { ...m, ...(nh.length ? { numHistory: nh } : {}) });
          applied.combined++;
          continue;
        }
      }
      if (b !== undefined && eq(b, m)) { applied.fromTheirs++; out.set(p, t); continue; }
      if (b !== undefined && eq(b, t)) { applied.fromMine++; out.set(p, m); continue; }
      out.set(p, conflict(p, 'both-changed', m, t, b));
      continue;
    }
    if (m !== undefined) {
      if (b !== undefined) {
        if (eq(b, m)) { removed.push({ path: p, by: 'theirs' }); continue; }
        const v = conflict(p, 'delete-modify', m, undefined, b);
        if (v !== undefined) out.set(p, v);
        continue;
      }
      applied.fromMine++; out.set(p, m); continue;
    }
    if (b !== undefined) {
      if (eq(b, t)) { removed.push({ path: p, by: 'mine' }); continue; }
      const v = conflict(p, 'delete-modify', undefined, t, b);
      if (v !== undefined) out.set(p, v);
      continue;
    }
    applied.fromTheirs++; out.set(p, t);
  }
  const merged = rebuild(out, mine, T, base, now);
  return { merged, conflicts, applied, removed, mapping: map, warnings };
}

/** Position: feldweise dreiseitig (mit base) bzw. über den Verlauf (ohne base); Verlauf vereinigt */
function mergePosition(path, m, t, b, haveBase, conflict, applied, removed) {
  if (m !== undefined && t !== undefined) {
    if (eq(m, t)) { applied.identical++; return m; }
    const history = unionHistory(m.history, t.history);
    const updated = maxIso(m.updated, t.updated);
    const fields = [...new Set([...Object.keys(m), ...Object.keys(t)])].filter((k) => k !== 'history' && k !== 'updated');
    const res = { };
    let fromM = false, fromT = false;
    if (b !== undefined) {
      for (const f of fields) {
        if (eq(m[f], t[f])) { if (m[f] !== undefined) res[f] = m[f]; continue; }
        if (eq(b[f], m[f])) { if (t[f] !== undefined) res[f] = t[f]; fromT = true; continue; }
        if (eq(b[f], t[f])) { if (m[f] !== undefined) res[f] = m[f]; fromM = true; continue; }
        const v = conflict(`${path}/${f}`, 'both-changed', m[f], t[f], b[f]);
        if (v !== undefined) res[f] = v;
      }
    } else {
      const hm = histSet(m), ht = histSet(t);
      const side = subset(ht, hm) ? 'mine' : subset(hm, ht) ? 'theirs' : null;
      // letzter gemeinsamer Verlaufseintrag: Stand vor der Verzweigung (für die im Verlauf geführten Felder)
      const common = (m.history || []).filter((h) => ht.has(J(h)));
      const last = common[common.length - 1] || null;
      for (const f of fields) {
        if (eq(m[f], t[f])) { if (m[f] !== undefined) res[f] = m[f]; continue; }
        if (side === 'mine') { if (m[f] !== undefined) res[f] = m[f]; fromM = true; continue; }
        if (side === 'theirs') { if (t[f] !== undefined) res[f] = t[f]; fromT = true; continue; }
        if (m[f] === undefined) { res[f] = t[f]; fromT = true; continue; }     // Feld nur auf einer Seite (z. B. outcome): ergänzt
        if (t[f] === undefined) { res[f] = m[f]; fromM = true; continue; }
        if (last && f in last) {
          if (eq(t[f], last[f]) && !eq(m[f], last[f])) { res[f] = m[f]; fromM = true; continue; }
          if (eq(m[f], last[f]) && !eq(t[f], last[f])) { res[f] = t[f]; fromT = true; continue; }
        }
        const v = conflict(`${path}/${f}`, 'both-changed', m[f], t[f]);
        if (v !== undefined) res[f] = v;
      }
    }
    if (fromM && fromT) applied.combined++; else if (fromT) applied.fromTheirs++; else if (fromM) applied.fromMine++; else applied.combined++;
    return { ...res, updated, history };
  }
  const only = m !== undefined ? m : t;
  const side = m !== undefined ? 'mine' : 'theirs';
  if (b !== undefined) {
    if (eq(b, only)) { removed.push({ path, by: side === 'mine' ? 'theirs' : 'mine' }); return undefined; }
    return conflict(path, 'delete-modify', m, t, b);
  }
  if (side === 'mine') applied.fromMine++; else applied.fromTheirs++;
  return only;
}

function rebuild(out, M, T, B, now) {
  const get = (prefix) => [...out.entries()].filter(([p]) => p.startsWith(prefix));
  const d = {};
  // Kopf: Felder in der Reihenfolge von mine
  for (const k of Object.keys(M)) {
    if (COLLECTIONS.includes(k)) { d[k] = undefined; continue; }
    if (VOLATILE_META.has(k)) continue;
    if (out.has(`meta/${k}`)) d[k] = out.get(`meta/${k}`);
  }
  for (const [p, v] of get('meta/')) { const k = p.slice(5); if (!(k in d)) d[k] = v; }
  d.created = minIso(M.created, T.created) || M.created;
  d.updated = now || maxIso(M.updated, T.updated) || M.updated;
  const ordered = (coll) => {
    const ids = [...(M[coll] || []).map((x) => x.id), ...(T[coll] || []).map((x) => x.id)];
    return [...new Set(ids)].filter((id) => out.has(`${coll}/${id}`)).map((id) => out.get(`${coll}/${id}`));
  };
  d.tracks = ordered('tracks');
  // Dokumente: importedAt = früheste
  const imp = new Map();
  for (const x of [...(M.documents || []), ...(T.documents || [])]) if (x.importedAt) imp.set(x.id, minIso(imp.get(x.id), x.importedAt));
  d.documents = ordered('documents').map((x) => (imp.has(x.id) ? { ...x, importedAt: imp.get(x.id) } : x));
  // Zeilen: Reihenfolge von mine, neue Zeilen von theirs nach ihrem Vorgänger
  const keep = new Set(get('rows/').map(([p]) => p.slice(5)));
  const seqM = (M.rows || []).slice().sort((a, b) => a.order - b.order).map((r) => r.id).filter((id) => keep.has(id));
  const seqT = (T.rows || []).slice().sort((a, b) => a.order - b.order).map((r) => r.id);
  const seq = seqM.slice();
  let prev = null;
  for (const id of seqT) {
    if (!keep.has(id)) continue;
    if (!seq.includes(id)) { const at = prev === null ? -1 : seq.indexOf(prev); seq.splice(at + 1, 0, id); }
    prev = id;
  }
  const orderM = new Map((M.rows || []).map((r) => [r.id, r.order]));
  const sameSeq = seq.length === seqM.length && seq.every((id, i) => id === seqM[i]);
  d.rows = seq.map((id, i) => ({ ...out.get(`rows/${id}`), order: sameSeq ? orderM.get(id) : (i + 1) * 10 }));
  // Zellen: nach Dokumentdatum
  const docDate = new Map(d.documents.map((x, i) => [x.id, `${x.date || ''}|${x.importedAt || ''}|${String(i).padStart(4, '0')}`]));
  d.cells = {};
  for (const [p, c] of get('cells/')) {
    const [, rid, tid] = p.split('/');
    ((d.cells[rid] = d.cells[rid] || {})[tid] = d.cells[rid][tid] || []).push(c);
  }
  for (const [rid, byT] of Object.entries(d.cells)) for (const tid of Object.keys(byT)) {
    // gleiche Dokumente wie bei mine: Reihenfolge von mine beibehalten (Idempotenz), sonst nach Dokumentdatum
    const ml = ((M.cells || {})[rid] || {})[tid];
    const docs = byT[tid].map((c) => c.doc);
    if (ml && ml.length === docs.length && ml.every((c) => docs.includes(c.doc))) { const pos = new Map(ml.map((c, i) => [c.doc, i])); byT[tid].sort((a, b) => pos.get(a.doc) - pos.get(b.doc)); }
    else byT[tid].sort((a, b) => String(docDate.get(a.doc) || '').localeCompare(String(docDate.get(b.doc) || '')));
  }
  d.positions = {};
  for (const [p, v] of get('positions/')) d.positions[p.slice(10)] = v;
  // Konsultationen
  d.consultations = [];
  const kids = [...new Set([...(M.consultations || []), ...(T.consultations || [])].map((k) => k.id))];
  for (const kid of kids) {
    const head = out.get(`consultations/${kid}`);
    if (!head) continue;
    const sub = (what) => [...new Set([...(((M.consultations || []).find((k) => k.id === kid) || {})[what] || []), ...(((T.consultations || []).find((k) => k.id === kid) || {})[what] || [])].map((x) => x.id))]
      .filter((id) => out.has(`consultations/${kid}/${what}/${id}`)).map((id) => out.get(`consultations/${kid}/${what}/${id}`));
    const decisions = {};
    for (const [p, v] of get(`consultations/${kid}/decisions/`)) decisions[p.split('/').slice(3).join('/')] = v;
    const impR = new Map();
    for (const k of [...(M.consultations || []), ...(T.consultations || [])].filter((k) => k.id === kid)) for (const r of k.responses || []) if (r.importedAt) impR.set(r.id, minIso(impR.get(r.id), r.importedAt));
    const responses = sub('responses').map((r) => (impR.has(r.id) ? { ...r, importedAt: impR.get(r.id) } : r));
    d.consultations.push({ ...head, scope: out.get(`consultations/${kid}/scope`) || [], offices: sub('offices'), responses, decisions });
  }
  // Etappe 3: nur, wenn auf einer Seite vorhanden
  for (const f of ['delegations', 'meetings', 'interventions']) if (M[f] || T[f]) d[f] = ordered(f);
  if (M.stances || T.stances) {
    d.stances = {};
    const order = new Map([...Object.values(M.stances || {}).flat(), ...Object.values(T.stances || {}).flat()].map((s, i) => [s.id, i]));
    for (const [p, v] of get('stances/')) { const [, rid] = p.split('/'); (d.stances[rid] = d.stances[rid] || []).push(v); }
    for (const l of Object.values(d.stances)) l.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }
  for (const k of Object.keys(d)) if (d[k] === undefined) delete d[k];
  return d;
}
