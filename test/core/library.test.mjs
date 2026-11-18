// Tests src/core/library.js (node --test test/core/library.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listWorks, resolveCelex, stageAt, actsOfStage } from '../../src/core/library.js';

const here = dirname(fileURLToPath(import.meta.url));
const WORKS = resolve(here, '../../data/works');

const INDEX = [
  { id: 'sgk', celex: '32016R0399', full: true },
  { id: 'ees', celex: '32017R2226', full: false },
  { id: 'vis', celex: '32008R0767', full: false },
];
const DS = {
  stages: [
    { id: 's00', act: '32017R2226', acts: ['32017R2226'], order: 0, date: '2017-12-09' },
    { id: 's01', act: '32018R1240', acts: ['32018R1240', '32017R2226R(01)'], order: 1, date: '2018-10-09' },
    { id: 's02', act: '02017R2226-20190611', acts: [], order: 2, date: '2019-06-11' },
  ],
};

test('listWorks: Kopie der Liste, Reihenfolge bleibt', () => {
  const l = listWorks(INDEX);
  assert.deepEqual(l.map((w) => w.id), ['sgk', 'ees', 'vis']);
  l[0].id = 'x';
  assert.equal(INDEX[0].id, 'sgk');
  assert.deepEqual(listWorks(null), []);
});

test('resolveCelex: Basisakt, konsolidierte Fassung, Berichtigung, fremd', () => {
  assert.equal(resolveCelex(INDEX, '32017R2226'), 'ees');
  assert.equal(resolveCelex(INDEX, ' 32017r2226 '), 'ees');
  assert.equal(resolveCelex(INDEX, '02017R2226-20260612'), 'ees');
  assert.equal(resolveCelex(INDEX, '32017R2226R(03)'), 'ees');
  assert.equal(resolveCelex(INDEX, '02008R0767-20100405'), 'vis');
  assert.equal(resolveCelex(INDEX, '32016R0399R(08)'), 'sgk');
  assert.equal(resolveCelex(INDEX, '32019R0817'), null);
  assert.equal(resolveCelex(INDEX, '32017R2225'), null, 'Nachbarnummer ist ein anderes Werk');
  assert.equal(resolveCelex(INDEX, ''), null);
  assert.equal(resolveCelex(null, '32017R2226'), null);
});

test('stageAt: jüngster Stand mit date <= Datum', () => {
  assert.equal(stageAt(DS, '2016-01-01'), null);
  assert.equal(stageAt(DS, '2017-12-09'), 's00');
  assert.equal(stageAt(DS, '2018-10-08'), 's00');
  assert.equal(stageAt(DS, '2018-10-09'), 's01');
  assert.equal(stageAt(DS, '2026-11-12'), 's02');
  assert.equal(stageAt(DS, '2026-11-12T10:00:00Z'), 's02');
  assert.equal(stageAt({ stages: [] }, '2020-01-01'), null);
});

test('actsOfStage: stage.acts, Rückfall stage.act (SGK ohne acts), unbekannter Stand', () => {
  assert.deepEqual(actsOfStage(DS, 's01'), ['32018R1240', '32017R2226R(01)']);
  assert.deepEqual(actsOfStage(DS, 's02'), []);
  assert.deepEqual(actsOfStage({ stages: [{ id: 's03', act: '32017R2225', order: 3 }] }, 's03'), ['32017R2225']);
  assert.deepEqual(actsOfStage(DS, 's99'), []);
  const a = actsOfStage(DS, 's01'); a.push('x');
  assert.equal(DS.stages[1].acts.length, 2, 'Rückgabe ist eine Kopie');
});

test('echte Bibliothek: index.json, jedes Werk lösbar, stageAt/actsOfStage konsistent', { skip: !existsSync(resolve(WORKS, 'index.json')) }, () => {
  const index = JSON.parse(readFileSync(resolve(WORKS, 'index.json'), 'utf8'));
  assert.deepEqual(index.map((w) => w.id), ['sgk', 'ees', 'etias', 'vis', 'iop']);
  assert.equal(index[0].full, true);
  for (const w of index.slice(1)) {
    assert.equal(w.full, false);
    assert.equal(w.assets, null);
    assert.equal(resolveCelex(index, w.celex), w.id);
    const ds = JSON.parse(readFileSync(resolve(WORKS, w.dataset), 'utf8'));
    assert.equal(ds.schema, 1);
    assert.equal(ds.work.celex, w.celex);
    assert.equal(ds.stages[0].source.kind, 'oj');
    assert.ok(ds.stages.slice(1).every((s) => s.source.kind === 'consolidated'));
    for (const s of ds.stages) {
      assert.equal(stageAt(ds, s.date), ds.stages.filter((x) => x.date <= s.date).pop().id);
      assert.deepEqual(actsOfStage(ds, s.id), s.acts);
      assert.equal(s.act, s.acts[0] || s.source.celex);
      if (s.source.kind === 'consolidated') assert.equal(resolveCelex(index, s.source.celex), w.id);
    }
    // Erwägungsgründe: eine Version, Labels "(n)"
    const rct = ds.units.rct;
    assert.equal(ds.toc[0].id, 'rct');
    assert.equal(ds.toc[0].type, 'recitals');
    for (const l of ['de', 'fr', 'en']) {
      assert.equal(rct.versions[l].length, 1);
      const heads = rct.versions[l][0].blocks.filter((b) => /^r\d+$/.test(b.k));
      assert.ok(heads.length > 30);
      heads.forEach((b, i) => { assert.equal(b.k, 'r' + (i + 1)); assert.equal(b.l, `(${i + 1})`); });
    }
    const acts = JSON.parse(readFileSync(resolve(WORKS, w.acts), 'utf8'));
    assert.equal(acts[0].celex, w.celex);
    assert.equal(acts[0].kind, 'base');
    for (const a of acts) { assert.equal(a.application.status, 'unknown'); assert.equal(a.application.date, null); }
  }
});
