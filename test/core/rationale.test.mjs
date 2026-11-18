// Tests data/rationale.json (Agent BEGRÜNDUNG): node --test test/core/rationale.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify } from '../../scripts/rationale/verify.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const R = JSON.parse(readFileSync(resolve(here, '../../data/rationale.json'), 'utf8'));
const ACTS = ['32016R1624', '32017R0458', '32017R2225', '32018R1240', '32019R0817', '32021R1134', '32024R1717'];
// Gegenprüfung mit den Quelldateien in raw/ (Datenpflege, nicht im Repo); ohne raw/ werden diese Tests übersprungen.
const RAW_OK = ACTS.every((c) => ['DE', 'FR', 'EN'].every((l) => existsSync(resolve(here, `../../raw/${c}_${l}.html`))));
const NEED_RAW = { skip: !RAW_OK && 'raw/ fehlt (Datenpflege, siehe MAINTAINING.md)' };
const res = RAW_OK ? verify() : null;

test('rationale: alle sieben Änderungsakte vorhanden, Schema', () => {
  assert.deepEqual(Object.keys(R).sort(), ACTS);
  for (const c of ACTS) {
    const A = R[c];
    assert.ok(A.recitals && Array.isArray(A.map), c);
    for (const [n, v] of Object.entries(A.recitals)) {
      assert.match(n, /^\d+$/);
      for (const l of ['de', 'fr', 'en']) assert.equal(typeof v[l], 'string', `${c} (${n}) ${l}`);
      for (const l of ['de', 'fr', 'en']) assert.ok(!/<(?!\/?(i|b|sup|sub|br)>)/.test(v[l]), `${c} (${n}) ${l}: nur erlaubte Tags`);
    }
    for (const m of A.map) {
      assert.ok(typeof m.unit === 'string' && (m.key === null || typeof m.key === 'string'));
      assert.ok(['direct', 'thematic'].includes(m.strength));
      assert.ok(m.recitals.length > 0 && typeof m.why === 'string' && m.why.length > 3);
    }
  }
});

test('rationale: Wortlaut 100 % gleich der Quelle (unabhängige Regex-Extraktion)', NEED_RAW, () => {
  assert.ok(res.wording.checked >= 3 * 120, `geprüft: ${res.wording.checked}`);
  assert.deepEqual(res.wording.diffs, []);
  assert.equal(res.wording.equal, res.wording.checked);
});

test('rationale: Nummern in DE, FR, EN vorhanden und gleich viele', NEED_RAW, () => {
  assert.deepEqual(res.numbers.problems, []);
});

test('rationale: Zuordnungsziele existieren und werden vom Akt geändert', NEED_RAW, () => {
  assert.ok(res.targets.checked > 50);
  assert.deepEqual(res.targets.problems, []);
});

test('rationale: Akte mit anderem Hauptgegenstand nur mit SGK-bezogenen Erwägungsgründen', () => {
  for (const c of ['32016R1624', '32018R1240', '32019R0817', '32021R1134']) {
    assert.equal(R[c].selection, 'sbc-related');
    assert.ok(Object.keys(R[c].recitals).length < R[c].total / 4, c);
  }
  for (const c of ['32017R0458', '32017R2225', '32024R1717']) assert.equal(Object.keys(R[c].recitals).length, R[c].total, c);
});

test('rationale: Änderungen ohne Erwägungsgrund entsprechen dem Bericht', NEED_RAW, () => {
  const expected = {
    '32017R2225': ['art_2 n26 (inserted)', 'art_8 p2.a.s2 (replaced)', 'art_8 p3.a.i.s2 (replaced)', 'art_8 p3.a.i.s3 (inserted)', 'art_8 p3.g.i (replaced)',
      'art_9 p3a (inserted)', 'art_14 p3.s3 (replaced)', 'art_20 p1.a (replaced)', 'anx_IV n1a (inserted)', 'anx_V ptA.n1.s2 (inserted)', 'anx_VII n1 (replaced)'],
    '32021R1134': ['art_8 p3.c (deleted)', 'art_8 p3.d (deleted)', 'art_8 p3.e (deleted)', 'art_8 p3.f (deleted)'],
  };
  for (const c of ACTS) assert.deepEqual(res.coverage[c].unmappedChanges, expected[c] || [], c);
});

test('rationale: Stichproben der juristischen Zuordnung', () => {
  const has = (c, unit, key, n, s) => R[c].map.some((m) => m.unit === unit && m.key === key && m.recitals.includes(n) && m.strength === s);
  assert.ok(has('32016R1624', 'art_29', 'p1', '28', 'direct'));
  assert.ok(has('32017R0458', 'art_8', 'p2f', '9', 'direct'));
  assert.ok(has('32017R2225', 'art_12a', null, '7', 'direct'));
  assert.ok(has('32017R2225', 'art_42a', null, '19', 'direct'));
  assert.ok(has('32018R1240', 'art_8', 'p3.ba', '37', 'direct'));
  assert.ok(has('32019R0817', 'art_8', 'p4a', '65', 'direct'));
  assert.ok(has('32024R1717', 'art_25', 'p1.c', '35', 'direct'));
  assert.ok(has('32024R1717', 'art_23a', null, '27', 'direct'));
  assert.ok(has('32024R1717', 'art_24', 's1', '22', 'direct'));
});
