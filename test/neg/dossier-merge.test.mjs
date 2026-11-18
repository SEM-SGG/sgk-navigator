// Projektdateien vergleichen und zusammenführen (SPEC3 §3.8): realistische Szenarien am Beispiel-Dossier (Screening),
// Idempotenz, Symmetrie der Konflikte, kein Datenverlust, Entscheide über resolutions. Ohne Rohdaten (Folgefassung synthetisch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { importDossier, validateDossier, setPosition, setDecision, sortedRows, latestCell, exportDossier } from '../../src/neg/model.js';
import { planMerge, applyMerge } from '../../src/neg/merge.js';
import { importResponse } from '../../src/neg/consultation.js';
import { addMeeting, setStance, addIntervention, updateIntervention, removeIntervention, setOutcome } from '../../src/neg/delegations.js';
import { diffDossiers, mergeDossiers } from '../../src/neg/dossier-merge.js';
import { checkDossier } from '../../scripts/neg/check-demo.mjs';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const BASE = importDossier(fs.readFileSync(path.join(ROOT, 'data/neg-demo-screening.json'), 'utf8')).dossier;
const T1 = '2026-11-13T09:00:00.000Z', T2 = '2026-11-13T15:00:00.000Z';

/** Folgefassung (synthetisch aus dem Beispiel): jüngster Text je Spur, drei Zeilen geändert, eine Zeile neu */
function followUp(d, { sha = 'sha-folgefassung-6', ref = 'WK 99999/23', date = '2023-12-20' } = {}) {
  const tracks = ['com', 'ep', 'council', 'agreement'];
  const rows = [];
  sortedRows(d).forEach((r, i) => {
    const cells = {};
    tracks.forEach((t, k) => { const c = latestCell(d, r.id, t); cells[k] = c && !c.empty ? { html: c.html, text: c.text, status: c.status || null, empty: false } : { html: '', text: '', status: null, empty: true }; });
    if (i === 40 || i === 41 || i === 42) cells[3] = { html: `${cells[3].html || ''} <b>(geänderter Kompromisstext ${i})</b>`, text: `${cells[3].text || ''} (geänderter Kompromisstext ${i})`, status: 'agreed', empty: false };
    rows.push({ num: (r.numHistory && r.numHistory.length ? r.num : r.num), label: r.sourceLabel || r.label, labelSource: 'table', path: r.path, cells });
    if (i === 50) rows.push({ num: `${r.num}z`, label: 'Recital 99z', labelSource: 'table', path: { kind: 'recital', no: '99z' }, cells: { 0: { html: '', text: '', status: null, empty: true }, 1: { html: '', text: '', status: null, empty: true }, 2: { html: '', text: '', status: null, empty: true }, 3: { html: '(99z) New compromise recital.', text: '(99z) New compromise recital.', status: 'open', empty: false } } });
  });
  return { meta: { kind: 'four-column', ref, date, classification: 'limite', file: { name: `${ref}.pdf`, size: 1, sha256: sha, type: 'pdf' } }, columns: tracks.map((t, k) => ({ index: k, header: t, suggestedTrack: t })), rows, warnings: [] };
}
function importDoc(d, parsed, now) {
  const plan = planMerge(d, parsed, { 0: 'com', 1: 'ep', 2: 'council', 3: 'agreement' }, { docMeta: { kind: 'four-column', ref: parsed.meta.ref, date: parsed.meta.date, file: parsed.meta.file, title: 'Four-column table' } });
  return applyMerge(d, plan, { now, ambiguous: 'new', unmatched: 'new' }).dossier;
}
const resp = (rows, who, sha) => ({ consultationId: 'k1', items: rows.map((r, i) => ({ rowId: r, comment: `Beispielkommentar ${who} ${i + 1}`, proposal: '', source: 'cell' })), general: '', unmatched: [] });

/** Szenario: Stammdatei BASE wird an zwei Personen verteilt */
function scenario() {
  const pos = Object.keys(BASE.positions);
  const free = sortedRows(BASE).map((r) => r.id).filter((id) => !BASE.positions[id]);
  const scope = BASE.consultations[0].scope;
  // Person A (mine)
  let a = BASE;
  a = setPosition(a, pos[0], { text: 'Beispieltext (fiktiv): von A präzisiert.' }, { at: T1, by: 'A' });         // nur A ändert
  a = setPosition(a, free[0], { stance: 'support', priority: 'low', text: 'Beispieltext (fiktiv): neue Position A.' }, { at: T1, by: 'A' });
  a = setPosition(a, free[2], { stance: 'oppose', priority: 'high', text: 'Beispieltext (fiktiv): A lehnt ab.' }, { at: T1, by: 'A' });   // beide, verschieden
  a = importDoc(a, followUp(BASE), T1);                                                                         // Folgefassung (doc6 bei A)
  a = importResponse(a, 'k1', resp([scope[0]], 'Stelle A, Datei 2'), { office: 'o1', now: T1, file: { name: 'A2.docx', sha256: 'sha-a2' } }).dossier;   // a3 bei A
  a = setDecision(a, 'k1', 'a1-2', { decision: 'accepted', reply: 'A: übernommen', at: T1, by: 'A' });       // beide, verschieden
  a = setDecision(a, 'k1', 'a2-1', { decision: 'noted', reply: 'A: zur Kenntnis', at: T1, by: 'A' });        // nur A
  a = addMeeting(a, { date: '2024-01-10', body: 'Ratsarbeitsgruppe (Beispiel)', title: 'Zweite Beispielsitzung (fiktiv)', at: T1 }).dossier;   // m2 bei A
  a = setStance(a, pos[1], { deleg: 'bsp-a', stance: 'support', text: 'A erfasst', meeting: 'm2', at: T1, by: 'A' }).dossier;
  a = removeIntervention(a, 'i3', { at: T1 });                                                                  // A löscht, B unverändert
  a = removeIntervention(a, 'i2', { at: T1 });                                                                  // A löscht, B ändert
  // Person B (theirs): zuerst ein anderes Dokument, dann dieselbe Folgefassung
  let b = BASE;
  b = setPosition(b, free[1], { stance: 'scrutiny', priority: 'medium', text: 'Beispieltext (fiktiv): neue Position B.' }, { at: T2, by: 'B' });
  b = setPosition(b, free[2], { stance: 'support', priority: 'medium', text: 'Beispieltext (fiktiv): B unterstützt.' }, { at: T2, by: 'B' });
  b = importDoc(b, followUp(BASE, { sha: 'sha-anderes-dokument', ref: 'WK 88888/23', date: '2023-12-18' }), T2);   // doc6 bei B = anderes Dokument
  b = importDoc(b, followUp(BASE), T2);                                                                         // doc7 bei B = Folgefassung von A
  b = importResponse(b, 'k1', resp([scope[1]], 'Stelle B, Datei 2'), { office: 'o2', now: T2, file: { name: 'B2.docx', sha256: 'sha-b2' } }).dossier;   // a3 bei B (anderer Inhalt)
  b = importResponse(b, 'k1', resp([scope[0]], 'Stelle A, Datei 2'), { office: 'o1', now: T2, file: { name: 'A2.docx', sha256: 'sha-a2' } }).dossier;   // a4 bei B = a3 bei A
  b = setDecision(b, 'k1', 'a1-2', { decision: 'rejected', reply: 'B: abgelehnt', at: T2, by: 'B' });
  b = setDecision(b, 'k1', 'a4-1', { decision: 'accepted', reply: 'B: ok', at: T2, by: 'B' });
  b = addMeeting(b, { date: '2024-01-24', body: 'JHA Counsellors (Beispiel)', title: 'Dritte Beispielsitzung (fiktiv)', at: T2 }).dossier;      // m2 bei B (andere Sitzung)
  b = addIntervention(b, { meeting: 'm2', row: pos[1], text: 'Beispielintervention (fiktiv) von B', result: 'open', at: T2, by: 'B' }).dossier;
  b = updateIntervention(b, 'i2', { note: 'B: ergänzt' }, { at: T2, by: 'B' });
  b = setOutcome(b, pos[0], { status: 'partly', note: 'B: Beispiel', at: T2, by: 'B' });
  return { a, b, pos, free };
}

test('Vergleich: diffDossiers erkennt hinzugefügte, entfernte und geänderte Elemente; gleiche Datei = gleich', () => {
  assert.equal(diffDossiers(BASE, BASE).same, true);
  const { a } = scenario();
  const df = diffDossiers(BASE, a);
  assert.equal(df.same, false);
  const kinds = (p) => df.entries.filter((e) => e.path.startsWith(p)).map((e) => e.kind);
  assert.ok(kinds('documents/').includes('added'));
  assert.ok(kinds('interventions/').includes('removed'));
  assert.ok(df.entries.find((e) => e.path === `positions/${Object.keys(BASE.positions)[0]}`).fields.includes('text'));
  // Export/Import (Kurzform) ändert nichts
  assert.equal(diffDossiers(a, importDossier(exportDossier(a, { compact: true })).dossier).same, true);
});

test('Idempotenz: merge(a, a) = a (mit und ohne base)', () => {
  const { a } = scenario();
  for (const base of [null, BASE]) {
    const r = mergeDossiers(a, a, { base });
    assert.equal(r.conflicts.length, 0);
    assert.equal(diffDossiers(a, r.merged).same, true, JSON.stringify(diffDossiers(a, r.merged).entries.slice(0, 3)));
    assert.equal(r.applied.fromMine + r.applied.fromTheirs + r.applied.combined, 0);
  }
  const r2 = mergeDossiers(BASE, BASE);
  assert.equal(diffDossiers(BASE, r2.merged).same, true);
});

test('Szenario mit Stammdatei (base): einseitige Änderungen übernommen, beidseitige als Konflikt, Löschungen, Abbildung gleicher Dokumente', () => {
  const { a, b, pos, free } = scenario();
  const r = mergeDossiers(a, b, { base: BASE });
  const m = r.merged;
  assert.deepEqual(validateDossier(m).errors, []);
  assert.deepEqual(checkDossier(m), [], 'keine Dubletten nach dem Zusammenführen');
  // Dokumente: Folgefassung (gleicher sha256) einmal; anderes Dokument von B mit neuer Id
  const docs = m.documents.map((x) => x.ref);
  assert.equal(docs.filter((x) => x === 'WK 99999/23').length, 1);
  assert.equal(docs.filter((x) => x === 'WK 88888/23').length, 1);
  assert.equal(r.mapping.docs.doc7, 'doc6');
  assert.notEqual(r.mapping.docs.doc6, 'doc6');
  assert.equal(m.documents.length, BASE.documents.length + 2);
  // Zeilen: neue Zeile «Recital 99z» (bei A aus der Folgefassung, bei B aus dem anderen Dokument entstanden) nur einmal,
  // mit den Zellen beider Dokumente
  const z = m.rows.filter((x) => x.label === 'Recital 99z');
  assert.equal(z.length, 1);
  assert.deepEqual(m.cells[z[0].id].agreement.map((c) => c.doc).sort(), ['doc6', r.mapping.docs.doc6].sort());
  assert.equal(m.rows.length, BASE.rows.length + 1);
  // Positionen
  assert.match(m.positions[pos[0]].text, /von A präzisiert/);          // nur A geändert
  assert.equal(m.positions[pos[0]].outcome.status, 'partly');            // nur B geändert (Feld outcome) → feldweise vereinigt
  assert.ok(m.positions[free[0]] && m.positions[free[1]]);               // je eine neue Position
  const ids = r.conflicts.map((c) => c.id).sort();
  assert.ok(ids.includes(`positions/${free[2]}/stance`) && ids.includes(`positions/${free[2]}/text`), ids.join());
  assert.ok(ids.includes('consultations/k1/decisions/a1-2'));
  assert.ok(ids.includes('interventions/i2'));                           // A gelöscht, B geändert
  assert.equal(r.conflicts.find((c) => c.id === 'interventions/i2').kind, 'delete-modify');
  // Verlauf vereinigt (beide Einträge zu free[2])
  assert.deepEqual(m.positions[free[2]].history.map((h) => h.by), ['A', 'B']);
  // Rückmeldungen: A2-Datei einmal (a3), B2-Datei mit neuer Id; Entscheid zu A2 von B auf a3 abgebildet
  const k = m.consultations[0];
  assert.equal(k.responses.length, 4);
  assert.equal(r.mapping.responses.k1.a4, 'a3');
  assert.equal(k.decisions['a3-1'].reply, 'B: ok');
  assert.equal(k.decisions['a2-1'].reply, 'A: zur Kenntnis');
  // Sitzungen: zwei verschiedene «m2» → beide vorhanden; Intervention von B zeigt auf die umbenannte Sitzung
  assert.equal(m.meetings.length, 3);
  const mB = m.meetings.find((x) => x.body === 'JHA Counsellors (Beispiel)');
  assert.ok(m.interventions.some((x) => x.meeting === mB.id && /von B/.test(x.text)));
  // Löschung i3 (A) übernommen, da B unverändert
  assert.ok(!m.interventions.some((x) => x.id === 'i3'));
  assert.ok(r.removed.some((x) => x.path === 'interventions/i3' && x.by === 'mine'));
  // Konflikte nicht automatisch entschieden: Ergebnis enthält «mine»
  assert.equal(k.decisions['a1-2'].decision, 'accepted');
});

test('Kein Datenverlust: jedes Element beider Seiten steht im Ergebnis, in einem Konflikt oder ist (mit base) gelöscht', () => {
  const { a, b } = scenario();
  for (const base of [BASE, null]) {
    const r = mergeDossiers(a, b, { base });
    const inMerged = (side, mapped) => {
      const df = diffDossiers(mapped, r.merged);
      const conflictPaths = new Set(r.conflicts.map((c) => c.path));
      const removed = new Set(r.removed.map((x) => x.path));
      const lost = df.entries.filter((e) => e.kind === 'removed' && !conflictPaths.has(e.path) && !removed.has(e.path) && !e.path.startsWith('positions/'));
      assert.deepEqual(lost.map((e) => e.path), [], `${side}, base ${!!base}`);
      // geänderte Elemente: nur bei Konflikten (dort ist «mine» bzw. der Entscheid übernommen) oder Vereinigung (Verlauf, Umfang, Positionen feldweise)
      const changed = df.entries.filter((e) => e.kind === 'changed' && !conflictPaths.has(e.path) && !e.path.startsWith('positions/') && !e.path.endsWith('/scope') && e.path !== 'rows#order');
      for (const e of changed) assert.ok(r.conflicts.some((c) => c.path.startsWith(e.path)) || e.path.startsWith('rows/') || e.path.startsWith('documents/') || e.path.startsWith('meta/'), `${side}: ${e.path}`);
    };
    inMerged('mine', a);
    // Verlaufseinträge aller Positionen beider Seiten vorhanden
    for (const side of [a, b]) for (const [rid, p] of Object.entries(side.positions)) {
      const mrid = side === b ? (r.mapping.rows[rid] || rid) : rid;
      const mp = r.merged.positions[mrid];
      if (!mp) { assert.ok(r.conflicts.some((c) => c.path.startsWith(`positions/${mrid}`)) || r.removed.some((x) => x.path === `positions/${mrid}`), rid); continue; }
      const hs = new Set(mp.history.map((h) => JSON.stringify(h)));
      for (const h of p.history || []) assert.ok(hs.has(JSON.stringify(h)), `Verlauf ${rid}`);
    }
    // Zellen beider Seiten (theirs abgebildet) vorhanden
    let cellsB = 0;
    for (const [rid, byT] of Object.entries(b.cells)) for (const [tid, list] of Object.entries(byT)) for (const c of list) {
      cellsB++;
      const mrid = r.mapping.rows[rid] || rid, mdoc = r.mapping.docs[c.doc] || c.doc;
      assert.ok(((r.merged.cells[mrid] || {})[tid] || []).some((x) => x.doc === mdoc), `Zelle ${rid}/${tid}/${c.doc}`);
    }
    assert.ok(cellsB > 1000);
    // Haltungen, Interventionen, Sitzungen, Rückmeldungen von theirs vorhanden (abgebildet)
    for (const s of Object.values(b.stances).flat()) assert.ok(Object.values(r.merged.stances).flat().some((x) => x.id === (r.mapping.stances[s.id] || s.id)));
    const gone = (p) => r.conflicts.some((c) => c.path === p) || r.removed.some((x) => x.path === p);
    for (const x of b.interventions) { const id = r.mapping.interventions[x.id] || x.id; assert.ok(r.merged.interventions.some((y) => y.id === id) || gone(`interventions/${id}`), id); }
    for (const x of b.meetings) assert.ok(r.merged.meetings.some((y) => y.id === (r.mapping.meetings[x.id] || x.id)));
    for (const x of b.consultations[0].responses) assert.ok(r.merged.consultations[0].responses.some((y) => y.id === r.mapping.responses.k1[x.id]));
  }
});

test('Ohne base: Löschungen nicht erkennbar (Element bleibt), Positionen über den Verlauf entschieden, sonst Konflikt', () => {
  const { a, b, pos, free } = scenario();
  const r = mergeDossiers(a, b);
  assert.ok(r.merged.interventions.some((x) => x.id === 'i3'), 'ohne base bleibt das gelöschte Element erhalten');
  assert.match(r.merged.positions[pos[0]].text, /von A präzisiert/);    // Verlauf B ⊂ Verlauf A? nein: B hat outcome-Eintrag → feldweise Konflikt nur, wo verschieden
  const ids = r.conflicts.map((c) => c.id);
  assert.ok(ids.includes(`positions/${free[2]}/stance`));
  assert.ok(ids.includes('consultations/k1/decisions/a1-2'));
  // Verlauf als Teilmenge: nur A hat geändert → ohne Konflikt übernommen
  const onlyA = setPosition(BASE, pos[2], { priority: 'high' }, { at: T1, by: 'A' });
  const r2 = mergeDossiers(onlyA, BASE);
  assert.equal(r2.conflicts.length, 0);
  assert.equal(r2.merged.positions[pos[2]].priority, 'high');
  const r3 = mergeDossiers(BASE, onlyA);
  assert.equal(r3.conflicts.length, 0);
  assert.equal(r3.merged.positions[pos[2]].priority, 'high');
});

test('Symmetrie der Konflikte: merge(a, b) und merge(b, a) melden dieselben Konflikte mit vertauschten Seiten', () => {
  const { a, b } = scenario();
  for (const base of [BASE, null]) {
    const ab = mergeDossiers(a, b, { base });
    const ba = mergeDossiers(b, a, { base });
    const key = (c) => c.path;
    const shared = ab.conflicts.filter((c) => ba.conflicts.some((x) => key(x) === key(c)));
    // Konflikte an Elementen der Stammdatei bzw. ohne Umbenennung sind symmetrisch
    const sym = (list) => list.filter((c) => !/\/(a[3-9]|m[2-9]|i[4-9]|h[7-9])\b|doc[6-9]/.test(c.path)).map(key).sort();
    assert.deepEqual(sym(ab.conflicts), sym(ba.conflicts), `base ${!!base}`);
    for (const c of shared) {
      const d = ba.conflicts.find((x) => key(x) === key(c));
      assert.deepEqual(c.mine, d.theirs, c.path);
      assert.deepEqual(c.theirs, d.mine, c.path);
      assert.equal(c.kind, d.kind);
    }
    assert.ok(shared.length >= 3);
  }
});

test('Entscheide (resolutions): "theirs", "mine" und eigener Wert; danach keine offenen Unterschiede bei erneutem Zusammenführen', () => {
  const { a, b, free } = scenario();
  const r0 = mergeDossiers(a, b, { base: BASE });
  const res = {};
  for (const c of r0.conflicts) res[c.id] = 'theirs';
  res['consultations/k1/decisions/a1-2'] = { value: { decision: 'partly', reply: 'gemeinsam bereinigt', at: T2, applied: false } };
  const r = mergeDossiers(a, b, { base: BASE, resolutions: res });
  assert.equal(r.merged.positions[free[2]].stance, 'support');
  assert.equal(r.merged.consultations[0].decisions['a1-2'].reply, 'gemeinsam bereinigt');
  assert.ok(!r.merged.interventions.some((x) => x.id === 'i2') || r.merged.interventions.find((x) => x.id === 'i2').note === 'B: ergänzt');
  // Ergebnis zurück an beide: merge(Ergebnis, Ergebnis) idempotent, merge(Ergebnis, a) mit base=Ergebnis ohne Konflikte
  assert.equal(mergeDossiers(r.merged, r.merged).conflicts.length, 0);
  assert.equal(mergeDossiers(r.merged, r.merged, { base: r.merged }).conflicts.length, 0);
});
