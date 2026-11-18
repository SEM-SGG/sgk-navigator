// Modell, Projektdatei, Zusammenführen, Auswertungen (synthetisch, ohne Rohdaten)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDossier, exportDossier, importDossier, setPosition, sortedRows, latestCell } from '../../src/neg/model.js';
import { planMerge, applyMerge } from '../../src/neg/merge.js';
import { rowHistory, changesBetween, stalePositions, rowStatus } from '../../src/neg/history.js';
import { compareCells } from '../../src/neg/diff.js';
import { parseLabel, labelFromPath, StructureTracker, amendsOf } from '../../src/neg/paths.js';
import { buildPositionDocx, positionRows } from '../../src/neg/outputs.js';
import { unzipSync, strFromU8 } from 'fflate';

const cell = (h, status = null) => ({ html: h, text: h.replace(/<[^>]+>/g, ''), status, empty: !h });
const doc = (rows, meta = {}) => ({ meta: { kind: 'four-column', ref: meta.ref || 'X', date: meta.date || '2026-01-01', classification: 'public' },
  columns: [{ index: 0, header: 'Commission Proposal', suggestedTrack: 'com' }, { index: 1, header: 'Draft Agreement', suggestedTrack: 'agreement' }],
  rows: rows.map(([num, label, a, b, st]) => ({ num, label, labelSource: label ? 'table' : 'derived', path: parseLabel(label), cells: { 0: cell(a), 1: cell(b, st) } })), warnings: [] });
const MAP = { 0: 'com', 1: 'agreement' };

function twoVersions() {
  let d = createDossier({ title: 'T', procedure: '2099/0002(COD)', now: '2026-01-01T00:00:00Z' });
  const v1 = doc([
    ['1', 'Recital 1', '(1) Text one about borders.', ''],
    ['2', 'Recital 2', '(2) Text two about visas and checks.', ''],
    ['3', 'Article 1(1)', '1. Member States shall check persons.', '1. Member States shall check persons.'],
    ['4', 'Article 1(2)', '2. Checks shall be proportionate.', ''],
  ], { ref: 'V1', date: '2026-01-10' });
  d = applyMerge(d, planMerge(d, v1, MAP), { now: '2026-01-10T00:00:00Z' }).dossier;
  const v2 = doc([
    ['1', 'Recital 1', '(1) Text one about borders.', '(1) Text one about external borders.', 'agreed'],
    ['2', 'Recital 2', '(2) Text two about visas and checks.', ''],
    ['2a', 'Recital 2a', '', '(2a) New recital on data protection.'],
    ['3', 'Article 1(1)', '1. Member States shall check persons.', '1. Member States shall check all persons.'],
    ['4', 'Article 1(2)', '2. Checks shall be proportionate.', '2. Checks shall be proportionate.'],
  ], { ref: 'V2', date: '2026-02-10' });
  return { d, v2 };
}

test('Projektdatei: Export, Import, Validierung, Fehler ohne Ausnahme', () => {
  const { d } = twoVersions();
  const json = exportDossier(d);
  const r = importDossier(json);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.dossier, JSON.parse(json));
  assert.deepEqual(importDossier('{kaputt').dossier, null);
  assert.match(importDossier('{"kind":"other"}').errors[0], /kind/);
  const old = JSON.parse(json); delete old.schema; delete old.consultations;
  const m = importDossier(old);
  assert.equal(m.migrated, true);
  assert.deepEqual(m.dossier.consultations, []);
});

test('planMerge/applyMerge: Zuordnung, neue Zwischenzeile 12a, Zellenänderungen, Eingabe unverändert', () => {
  const { d, v2 } = twoVersions();
  const before = JSON.stringify(d);
  const plan = planMerge(d, v2, MAP);
  assert.equal(JSON.stringify(d), before);
  assert.deepEqual(plan.rows.map((r) => r.match), ['matched', 'matched', 'new', 'matched', 'matched']);
  assert.deepEqual(plan.rows.map((r) => r.cells.agreement.change), ['new', 'empty', 'new', 'changed', 'new']);
  assert.equal(plan.rows[0].cells.agreement.status, 'agreed');
  const res = applyMerge(d, plan, { now: '2026-02-10T00:00:00Z' });
  assert.equal(JSON.stringify(d), before, 'applyMerge verändert die Eingabe nicht');
  const rows = sortedRows(res.dossier);
  assert.deepEqual(rows.map((r) => r.num), ['1', '2', '2a', '3', '4']);
  assert.equal(rowStatus(res.dossier, rows[0].id), 'agreed');
});

test('Mehrdeutige Zeilen: Kandidaten, Übersteuerung durch Prüfmaske', () => {
  let d = createDossier({ title: 'T' });
  d = applyMerge(d, planMerge(d, doc([['1', 'Article 1', 'Article 1 Subject matter', ''], ['2', 'Article 2', 'Article 2 Scope', '']]), MAP)).dossier;
  // ohne Nummer und Fundstelle, Text zwischen beiden
  const v = { ...doc([[null, '', 'Article 1 Subject matter and scope', '']]) };
  v.rows[0].labelSource = 'derived'; v.rows[0].path = { kind: 'other' };
  const plan = planMerge(d, v, MAP);
  assert.ok(['ambiguous', 'matched'].includes(plan.rows[0].match));
  const target = sortedRows(d)[1].id;
  const res = applyMerge(d, plan, { rows: { 0: { rowId: target } } });
  assert.equal(res.rowIds[0], target);
  const res2 = applyMerge(d, plan, { rows: { 0: { rowId: 'new' } } });
  assert.equal(res2.dossier.rows.length, 3);
  if (plan.rows[0].match === 'ambiguous') {
    const def = applyMerge(d, plan);                       // Standard: mehrdeutig ohne Entscheid -> übersprungen
    assert.equal(def.skipped.ambiguous, 1);
    assert.equal(def.dossier.rows.length, 2);
    assert.equal(applyMerge(d, plan, { ambiguous: 'new' }).dossier.rows.length, 3);
  }
  const onlyMatched = applyMerge(d, planMerge(d, doc([['9', 'Article 9', 'Completely different text here', '']]), MAP), { unmatched: 'skip' });
  assert.equal(onlyMatched.skipped.new, 1);
  assert.equal(onlyMatched.dossier.rows.length, 2);
});

test('rowHistory, changesBetween, compareCells', () => {
  const { d, v2 } = twoVersions();
  const dd = applyMerge(d, planMerge(d, v2, MAP)).dossier;
  const r3 = sortedRows(dd).find((r) => r.num === '3');
  const h = rowHistory(dd, r3.id, 'agreement');
  assert.deepEqual(h.map((x) => [x.ref, x.change]), [['V1', 'new'], ['V2', 'changed']]);
  const ch = changesBetween(dd, 'doc1', 'doc2', 'agreement');
  assert.deepEqual(ch.map((c) => [c.num, c.change]), [['1', 'new'], ['2a', 'new'], ['3', 'changed'], ['4', 'new']]);
  assert.equal(ch[2].diff.redline, '1. Member States shall check <ins>all</ins> persons.');
  assert.deepEqual(changesBetween(dd, null, 'doc2', 'agreement').map((c) => c.num), ['1', '2a', '3', '4']);
  const c = compareCells({ html: 'The <s>old</s> text <b>here</b>' }, { html: 'The new text <b>here</b>' }, { clean: true });
  assert.equal(c.redline, 'The <ins>new</ins> text <b>here</b>');
});

test('stalePositions: Text seit Bezug geändert', () => {
  const { d, v2 } = twoVersions();
  const r3 = sortedRows(d).find((r) => r.num === '3');
  const r2 = sortedRows(d).find((r) => r.num === '2');
  let x = setPosition(d, r3.id, { stance: 'support', priority: 'high', basis: { track: 'agreement', doc: 'doc1' } }, { at: '2026-01-11T00:00:00Z' });
  x = setPosition(x, r2.id, { stance: 'oppose', priority: 'redline', basis: { track: 'com', doc: 'doc1' } }, { at: '2026-01-11T00:00:00Z' });
  assert.deepEqual(stalePositions(x), []);
  x = applyMerge(x, planMerge(x, v2, MAP)).dossier;
  assert.deepEqual(stalePositions(x), [r3.id]);
  x = setPosition(x, r3.id, { text: 'neu' }, { at: '2026-02-11T00:00:00Z' });
  assert.equal(x.positions[r3.id].history.length, 2);
  // Briefing
  const rows = positionRows(x);
  assert.equal(rows.length, 2);
  const docx = buildPositionDocx(x, { variant: 'briefing', lang: 'de', filter: { priority: ['redline'] } });
  const xml = strFromU8(unzipSync(docx)['word/document.xml']);
  assert.match(xml, /rote Linie/);
  assert.doesNotMatch(xml, /Unterstützung<\/w:t>/);
  assert.match(strFromU8(unzipSync(buildPositionDocx(x, { variant: 'full', lang: 'fr' }))['word/document.xml']), /Positions de la Suisse/);
});

test('Fundstellen: parseLabel/labelFromPath, Strukturverfolgung in Änderungsrechtsakten', () => {
  assert.deepEqual(parseLabel('Article 3(2), first subparagraph, point (a)'), { kind: 'article', art: '3', par: '2', sub: '1', pt: ['a'] });
  assert.deepEqual(parseLabel('Article 3, first paragraph, point (-n)'), { kind: 'article', art: '3', par: '1', pt: ['-n'] });
  assert.deepEqual(parseLabel('Recital 26a'), { kind: 'recital', no: '26a' });
  assert.equal(labelFromPath({ kind: 'article', art: '5', par: '4', pt: ['a'] }), 'Article 5(4), point (a)');
  const tr = new StructureTracker();
  const seq = ['HAVE ADOPTED THIS REGULATION:', 'Article 1', 'Regulation (EU) 2016/399 is amended as follows:', '(3) Article 13 is replaced by the following:', '‘Article 13', '1. The main purpose of border surveillance;', 'a) first;', 'i) sub;’'];
  const ps = seq.map((t) => tr.feed(t));
  assert.deepEqual(amendsOf(ps[5]), { work: 'sgk', unit: 'art_13', key: 'p1' });
  assert.deepEqual(amendsOf(ps[7]), { work: 'sgk', unit: 'art_13', key: 'p1.a.i' });
  assert.equal(labelFromPath(ps[6]), 'Article 1, point (3) › 2016/399 Article 13(1)(a)');
});
