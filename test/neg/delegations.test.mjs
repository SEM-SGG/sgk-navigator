// Delegationen, Sitzungen, Haltungen, Interventionen, Ergebnis, Bilanz (SPEC3 §3.7), synthetisch und am Beispiel-Dossier
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { unzipSync, strFromU8 } from 'fflate';
import { createDossier, exportDossier, importDossier, validateDossier, setPosition } from '../../src/neg/model.js';
import { planMerge, applyMerge } from '../../src/neg/merge.js';
import {
  defaultDelegations, ensureDelegations, addDelegation, updateDelegation, removeDelegation, addMeeting, updateMeeting, removeMeeting,
  setStance, removeStance, addIntervention, updateIntervention, removeIntervention, setOutcome, stanceMatrix, suggestOutcome, balance,
} from '../../src/neg/delegations.js';
import { buildPositionDocx } from '../../src/neg/outputs.js';
import { DOC_TEXT } from '../../src/neg/i18n.js';
import { parseXml } from '../../src/neg/xml.js';
import { hasSoffice } from './helpers.mjs';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const NOW = '2026-03-01T10:00:00.000Z';
const cell = (h, status = null) => ({ html: h, text: h.replace(/<[^>]+>/g, ''), status, empty: !h });

/** Dossier mit Ratsfassung (V1) und Kompromiss (V2) */
function sample() {
  let d = createDossier({ id: 'd-t', title: 'Test', procedure: '2099/0001(COD)', now: '2026-01-01T00:00:00Z' });
  const mk = (rows, ref, date) => ({ meta: { kind: 'four-column', ref, date }, columns: [{ index: 0, header: 'Council Mandate', suggestedTrack: 'council' }, { index: 1, header: 'Draft Agreement', suggestedTrack: 'agreement' }],
    rows: rows.map(([num, label, a, b]) => ({ num, label, labelSource: 'table', path: { kind: 'other' }, cells: { 0: cell(a), 1: cell(b) } })), warnings: [] });
  const v1 = mk([
    ['1', 'Article 1(1)', '1. Member States shall check persons at the border.', ''],
    ['2', 'Article 1(2)', '2. Checks shall be carried out within 24 hours.', ''],
    ['3', 'Article 1(3)', '3. Data shall be kept for ten years.', ''],
    ['4', 'Article 1(4)', '4. The Commission shall report annually.', ''],
  ], 'V1', '2026-01-10');
  d = applyMerge(d, planMerge(d, v1, { 0: 'council', 1: 'agreement' }), { now: '2026-01-10T00:00:00Z' }).dossier;
  const v2 = mk([
    ['1', 'Article 1(1)', '1. Member States shall check persons at the border.', '1. Member States shall check all persons at the external border.'],
    ['2', 'Article 1(2)', '2. Checks shall be carried out within 24 hours.', '2. Checks shall be carried out within 48 hours.'],
    ['3', 'Article 1(3)', '3. Data shall be kept for ten years.', 'deleted'],
    ['4', 'Article 1(4)', '4. The Commission shall report annually.', '4. The Commission shall report annually.'],
  ], 'V2', '2026-02-10');
  d = applyMerge(d, planMerge(d, v2, { 0: 'council', 1: 'agreement' }), { now: '2026-02-10T00:00:00Z' }).dossier;
  return d;
}

test('Voreinstellung der Delegationen: Schengen-Staaten, KOM, EP, Vorsitz, JD Rat', () => {
  const ds = defaultDelegations();
  const ms = ds.filter((x) => x.kind === 'ms');
  assert.equal(ms.length, 29);
  for (const c of ['CH', 'IS', 'LI', 'NO', 'DE', 'FR', 'EL', 'BG', 'RO']) assert.ok(ms.some((x) => x.code === c), c);
  for (const c of ['CY', 'IE']) assert.ok(!ms.some((x) => x.code === c), c);
  assert.deepEqual(ds.filter((x) => x.kind === 'institution').map((x) => x.id), ['com', 'ep', 'pres', 'cls']);
  for (const x of ds) { assert.ok(x.name.de && x.name.fr && x.name.en); assert.ok(!/ß/.test(x.name.de)); }
  assert.equal(new Set(ds.map((x) => x.id)).size, ds.length);
});

test('Anlegen, ändern, löschen; Eingabe bleibt unverändert; Validierung meldet Fehler', () => {
  const d0 = sample();
  const snap = JSON.stringify(d0);
  let d = ensureDelegations(d0);
  d = addDelegation(d, { kind: 'other', code: 'X', name: 'Delegation X (Beispiel)', at: NOW }).dossier;
  assert.ok(d.delegations.some((x) => x.id === 'x' && x.name.fr === 'Delegation X (Beispiel)'));
  assert.throws(() => addDelegation(d, { id: 'de', kind: 'ms', code: 'DE' }), /existiert bereits/);
  d = updateDelegation(d, 'x', { name: { de: 'X', fr: 'X', en: 'X' } });
  let r = addMeeting(d, { date: '2026-02-12', body: 'Working Party on Frontiers', title: 'WP 12.2.', docs: ['doc2'], at: NOW });
  d = r.dossier; const m1 = r.id;
  assert.equal(m1, 'm1');
  const rows = d.rows.map((x) => x.id);
  r = setStance(d, rows[0], { deleg: 'x', stance: 'support', text: 'ok', meeting: m1, at: NOW, by: 'NB' }); d = r.dossier; const h1 = r.id;
  r = setStance(d, rows[0], { deleg: 'de', stance: 'scrutiny', text: '', meeting: m1, at: NOW }); d = r.dossier;
  assert.throws(() => setStance(d, rows[0], { deleg: 'zz', stance: 'support' }), /Delegation/);
  assert.throws(() => setStance(d, rows[0], { deleg: 'de', stance: 'maybe' }), /Haltung/);
  d = setStance(d, rows[0], { id: h1, stance: 'proposal', text: 'neu', at: '2026-03-02T00:00:00Z' }).dossier;
  assert.equal(d.stances[rows[0]].find((s) => s.id === h1).stance, 'proposal');
  assert.equal(d.stances[rows[0]].find((s) => s.id === h1).deleg, 'x');
  r = addIntervention(d, { meeting: m1, row: rows[1], text: 'CH: 48 statt 24 Stunden', result: 'open', at: NOW, by: 'NB' }); d = r.dossier; const i1 = r.id;
  d = updateIntervention(d, i1, { result: 'taken-up' }, { at: NOW });
  assert.equal(d.interventions[0].result, 'taken-up');
  assert.deepEqual(validateDossier(d).errors, []);
  assert.deepEqual(validateDossier(d).warnings, []);
  // Sitzung löschen: Inhalt bleibt, Bezug wird null
  const d2 = removeMeeting(d, m1);
  assert.equal(d2.meetings.length, 0);
  assert.equal(d2.interventions[0].meeting, null);
  assert.ok(d2.stances[rows[0]].every((s) => s.meeting === null));
  // Delegation löschen: deren Haltungen fallen weg
  const d3 = removeDelegation(d, 'x');
  assert.ok(!d3.stances[rows[0]].some((s) => s.deleg === 'x'));
  assert.equal(removeStance(d, rows[0], h1).stances[rows[0]].length, 1);
  assert.equal(removeIntervention(d, i1).interventions.length, 0);
  assert.equal(JSON.stringify(d0), snap, 'Eingabe unverändert');
  // ungültige Strukturen
  assert.match(validateDossier({ ...d, meetings: {} }).errors.join(), /meetings/);
  assert.match(validateDossier({ ...d, stances: [] }).errors.join(), /stances/);
  assert.match(validateDossier({ ...d, meetings: [{ id: 'm1' }, { id: 'm1' }] }).errors.join(), /Doppelte Id m1/);
  assert.match(validateDossier({ ...d, interventions: [{ id: 'i9', row: 'r999999', meeting: 'm7' }] }).warnings.join(), /unbekannte Sitzung m7.*unbekannte Zeile r999999|unbekannte Zeile r999999/);
  assert.equal(updateMeeting(d, m1, { note: 'n' }).meetings[0].note, 'n');
});

test('Projektdatei: neue Felder verlustfrei (voll und Kurzform); alte Dateien ohne die Felder bleiben gültig', () => {
  let d = ensureDelegations(sample());
  const rows = d.rows.map((x) => x.id);
  d = addMeeting(d, { date: '2026-02-12', body: 'WP', title: 'T', docs: ['doc2'], at: NOW }).dossier;
  d = setStance(d, rows[0], { deleg: 'fr', stance: 'reservation', text: 'Ä é «x»', meeting: 'm1', at: NOW, by: 'AB' }).dossier;
  d = addIntervention(d, { meeting: 'm1', row: null, text: 'allgemein', result: 'open', at: NOW }).dossier;
  d = setPosition(d, rows[1], { stance: 'support-with-changes', priority: 'high', text: 'x', proposal: '2. Checks shall be carried out within 48 hours.' }, { at: NOW, by: 'AB' });
  d = setOutcome(d, rows[1], { status: 'achieved', note: 'n', doc: 'doc2', at: NOW, by: 'AB' });
  for (const compact of [false, true]) {
    const back = importDossier(exportDossier(d, { compact }));
    assert.deepEqual(back.errors, []);
    for (const f of ['delegations', 'meetings', 'stances', 'interventions']) assert.deepEqual(back.dossier[f], d[f], `${f} (compact ${compact})`);
    assert.deepEqual(back.dossier.positions, d.positions);
    assert.equal(back.dossier.positions[rows[1]].history.at(-1).by, 'AB');
    assert.equal(back.dossier.positions[rows[1]].outcome.status, 'achieved');
  }
  // alte Projektdateien (Etappe 2) ohne die neuen Felder
  for (const f of ['neg-demo.json', 'neg-demo-screening.json', 'neg-demo-dtc.json']) {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
    for (const k of ['delegations', 'meetings', 'stances', 'interventions']) delete raw[k];
    for (const p of Object.values(raw.positions)) delete p.outcome;
    const r = importDossier(JSON.stringify(raw));
    assert.deepEqual(r.errors, [], f);
    assert.ok(!('delegations' in r.dossier));
    assert.equal(stanceMatrix(r.dossier).rows.length, 0);
    assert.ok(balance(r.dossier).total >= 3);
  }
});

test('stanceMatrix: jüngste Haltung je Delegation, frühere in «earlier», Filter Sitzung und Zeilen', () => {
  let d = ensureDelegations(sample());
  const rows = d.rows.map((x) => x.id);
  d = addMeeting(d, { id: 'm1', date: '2026-02-01', body: 'WP', at: NOW }).dossier;
  d = addMeeting(d, { id: 'm2', date: '2026-02-20', body: 'WP', at: NOW }).dossier;
  d = setStance(d, rows[0], { deleg: 'de', stance: 'scrutiny', meeting: 'm1', at: '2026-02-01T10:00:00Z' }).dossier;
  d = setStance(d, rows[0], { deleg: 'de', stance: 'support', meeting: 'm2', at: '2026-02-20T10:00:00Z' }).dossier;
  d = setStance(d, rows[0], { deleg: 'it', stance: 'oppose', meeting: 'm2', at: '2026-02-20T10:00:00Z' }).dossier;
  d = setStance(d, rows[2], { deleg: 'com', stance: 'neutral', meeting: null, at: '2026-02-21T10:00:00Z' }).dossier;
  const mx = stanceMatrix(d);
  assert.deepEqual(mx.delegations.map((x) => x.id), ['de', 'it', 'com']);
  assert.equal(mx.rows.length, 2);
  assert.equal(mx.rows[0].cells.de.stance, 'support');
  assert.deepEqual(mx.rows[0].cells.de.earlier.map((e) => e.stance), ['scrutiny']);
  assert.deepEqual(mx.counts.byStance, { support: 1, oppose: 1, neutral: 1 });
  const m1 = stanceMatrix(d, { meeting: 'm1' });
  assert.equal(m1.rows.length, 1);
  assert.equal(m1.rows[0].cells.de.stance, 'scrutiny');
  assert.equal(stanceMatrix(d, { rows: [rows[2]] }).rows[0].rowId, rows[2]);
});

test('suggestOutcome: Vorschlag mit Begründung (nicht verbindlich); balance zählt Ergebnisse und Interventionen', () => {
  let d = sample();
  const [r1, r2, r3, r4] = d.rows.map((x) => x.id);
  const basis = { track: 'council', doc: 'doc1' };
  d = setPosition(d, r2, { stance: 'support-with-changes', priority: 'high', text: 'Frist verlängern', proposal: '2. Checks shall be carried out within 48 hours.', basis }, { at: NOW });
  d = setPosition(d, r3, { stance: 'oppose', priority: 'redline', text: 'Speicherdauer zu lang', basis }, { at: NOW });
  d = setPosition(d, r4, { stance: 'support', priority: 'low', text: 'Bericht unterstützt', basis }, { at: NOW });
  d = setPosition(d, r1, { stance: 'support-with-changes', priority: 'medium', text: 'Präzisierung', proposal: '1. Member States shall check persons at the internal border.', basis }, { at: NOW });
  const s2 = suggestOutcome(d, r2);
  assert.equal(s2.status, 'achieved');
  assert.equal(s2.compared.doc, 'doc2');
  assert.match(s2.reason.de, /100 % der vorgeschlagenen Änderungen/);
  assert.match(s2.reason.fr, /100 % des modifications proposées/);
  assert.equal(suggestOutcome(d, r3).status, 'achieved');      // abgelehnte Bestimmung gestrichen
  assert.equal(suggestOutcome(d, r4).status, 'achieved');      // unterstützter Text unverändert
  const s1 = suggestOutcome(d, r1);
  assert.equal(s1.status, 'not');                               // «internal» nicht übernommen
  assert.ok(s1.measure.share < 0.35);
  assert.equal(suggestOutcome(d, 'r999999').status, 'open');
  // Ergebnis bestätigen und Bilanz
  d = setOutcome(d, r2, { status: 'achieved', doc: 'doc2', at: NOW });
  d = setOutcome(d, r1, { status: 'not', at: NOW });
  assert.equal(d.positions[r2].history.at(-1).source, 'outcome');
  d = addMeeting(d, { date: '2026-02-12', body: 'WP', at: NOW }).dossier;
  d = addIntervention(d, { meeting: 'm1', row: r2, text: 'CH', result: 'taken-up', at: NOW }).dossier;
  d = addIntervention(d, { meeting: 'm1', row: null, text: 'CH allg.', result: 'open', at: NOW }).dossier;
  const b = balance(d);
  assert.equal(b.total, 4);
  assert.deepEqual([b.byOutcome.achieved, b.byOutcome.not, b.byOutcome.unset], [1, 1, 2]);
  assert.equal(b.byPriority.high.achieved, 1);
  assert.equal(b.achievedShare, 0.5);
  assert.deepEqual(b.interventions.byResult, { 'taken-up': 1, open: 1 });
  assert.equal(b.interventions.withoutRow, 1);
  assert.equal(b.rows.find((x) => x.rowId === r3).suggestion.status, 'achieved');
  assert.equal(b.rows.find((x) => x.rowId === r2).suggestion, null);
  assert.throws(() => setOutcome(d, r2, { status: 'won' }), /Ergebnis/);
});

test('Begriffe DE/FR vollständig, ohne «ß»', () => {
  const keys = ['delegation', 'meeting', 'delegStance', 'interventionResult', 'outcome', 'balanceTitle', 'meetingReport', 'suggestion', 'suggestionHint', 'stancesL', 'interventions'];
  for (const k of keys) { assert.ok(DOC_TEXT.de[k], k); assert.ok(DOC_TEXT.fr[k], k); }
  assert.deepEqual(Object.keys(DOC_TEXT.de).sort(), Object.keys(DOC_TEXT.fr).sort());
  assert.ok(!/ß/.test(JSON.stringify(DOC_TEXT.de)));
});

function docxText(bytes) {
  const files = unzipSync(bytes);
  for (const [n, b] of Object.entries(files)) if (/\.xml$|\.rels$/.test(n)) parseXml(strFromU8(b));   // wohlgeformt
  return strFromU8(files['word/document.xml']).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

test('buildPositionDocx: Varianten «balance» und «meeting» in DE und FR (am Beispiel-Dossier)', () => {
  const d = importDossier(fs.readFileSync(path.join(ROOT, 'data/neg-demo-dtc.json'), 'utf8')).dossier;
  assert.ok(d.meetings && d.meetings.length && d.interventions.length);
  const de = docxText(buildPositionDocx(d, { variant: 'balance', lang: 'de', asOf: '2026-11-12', zipTime: new Date('2026-11-12T00:00:00Z') }));
  assert.match(de, /Bilanz der Anliegen der Schweiz/);
  assert.match(de, /Vorschlag \(nicht bestätigt\)/);
  assert.match(de, /teilweise erreicht/);
  const fr = docxText(buildPositionDocx(d, { variant: 'balance', lang: 'fr', asOf: '2026-11-12' }));
  assert.match(fr, /Bilan des préoccupations de la Suisse/);
  const mde = docxText(buildPositionDocx(d, { variant: 'meeting', lang: 'de', meetingId: 'm1' }));
  assert.match(mde, /Sitzungsbericht/);
  assert.match(mde, /Interventionen der Schweiz/);
  assert.match(mde, /Delegation A \(Beispiel\)|A \(Bsp\.\)/);
  assert.match(mde, /Beispielintervention \(fiktiv\)/);
  const mfr = docxText(buildPositionDocx(d, { variant: 'meeting', lang: 'fr' }));
  assert.match(mfr, /Rapport de séance/);
  assert.match(mfr, /Positions des délégations/);
  // deterministisch
  const a = buildPositionDocx(d, { variant: 'meeting', lang: 'de', asOf: '2026-11-12', zipTime: new Date('2026-11-12T00:00:00Z') });
  const b = buildPositionDocx(d, { variant: 'meeting', lang: 'de', asOf: '2026-11-12', zipTime: new Date('2026-11-12T00:00:00Z') });
  assert.deepEqual(a, b);
});

test('LibreOffice öffnet Bilanz und Sitzungsbericht (Umwandlung nach PDF)', { skip: !hasSoffice && 'soffice fehlt', timeout: 120000 }, () => {
  const d = importDossier(fs.readFileSync(path.join(ROOT, 'data/neg-demo.json'), 'utf8')).dossier;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neg-bal-'));
  for (const [variant, lang] of [['balance', 'de'], ['meeting', 'fr']]) {
    const f = path.join(dir, `${variant}-${lang}.docx`);
    fs.writeFileSync(f, buildPositionDocx(d, { variant, lang, asOf: '2026-11-12' }));
    execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', dir, f], { stdio: 'ignore', timeout: 90000 });
    const pdf = f.replace(/\.docx$/, '.pdf');
    assert.ok(fs.existsSync(pdf) && fs.statSync(pdf).size > 5000, pdf);
    const txt = execFileSync('pdftotext', [pdf, '-']).toString();
    assert.match(txt, variant === 'balance' ? /Bilanz der Anliegen/ : /Rapport de séance/);
  }
});
