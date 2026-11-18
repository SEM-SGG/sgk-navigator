// Tests Anwendbarkeit je Einzelaenderung (node --test test/core)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeAt, getVersion, _composeBlockwise } from '../../src/core/model.js';
import { changeApplicability, composeAtDate, actApplicableAt, findChange, derogationsAt } from '../../src/core/applicability.js';
import { normText } from '../../src/core/text.js';

const here = dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(readFileSync(resolve(here, '../../data', f), 'utf8'));
const ds = process.env.SGK_DATASET ? JSON.parse(readFileSync(process.env.SGK_DATASET, 'utf8')) : load('dataset.json');
const acts = load('acts.json');
const der = load('derogations.json');
const LANGS = ['de', 'fr', 'en'];
const sig = (v) => (v ? (v.repealed ? 'REP|' : '') + v.blocks.map((b) => b.k + '=' + normText(b.t || '') + '@' + (b.o || '')).join('\n') : 'NULL');
const units = Object.keys(ds.units);

test('changeApplicability: Akt-Datum, abweichendes Datum, hängig, Vorschlag, vor Annahme, verbraucht', () => {
  let r = changeApplicability(acts, '32017R0458', 'art_8', 'p2', '2017-04-07');
  assert.equal(r.applicable, true); assert.equal(r.from, '2017-04-07'); assert.equal(r.status, 'applicable');
  r = changeApplicability(acts, '32017R0458', 'art_8', 'p2', '2017-04-06');
  assert.equal(r.applicable, false); assert.equal(r.status, 'future');
  r = changeApplicability(acts, '32017R2225', 'art_8', 'p9', '2025-10-12');
  assert.equal(r.applicable, true);
  r = changeApplicability(acts, '32017R2225', 'art_12a', 'p1', '2026-01-15');
  assert.equal(r.applicable, false); assert.equal(r.status, 'future'); assert.equal(r.from, '2026-04-10');
  assert.match(r.basis.de, /Art\. 5 Abs\. 13 der VO \(EU\) 2025\/1534/);
  r = changeApplicability(acts, '32017R2225', 'art_12a', 'p1', '2026-04-10');
  assert.equal(r.applicable, true);
  r = changeApplicability(acts, '32017R2225', 'art_12a', 'p1', '2026-10-07');
  assert.equal(r.status, 'expired'); assert.equal(r.until, '2026-10-06');
  r = changeApplicability(acts, '32017R2225', 'art_12a', 'p2', '2026-10-07');
  assert.equal(r.applicable, true, 'Art. 12a Abs. 2 ist nicht befristet');
  r = changeApplicability(acts, '32018R1240', 'art_8', 'p3.ba', '2026-11-12');
  assert.equal(r.applicable, false); assert.equal(r.status, 'pending'); assert.equal(r.from, null);
  r = changeApplicability(acts, '52024PC0670', 'art_8', 'p3.j', '2026-11-12');
  assert.equal(r.status, 'proposal');
  r = changeApplicability(acts, '32017R2225', 'art_8', 'p9', '2016-01-01');
  assert.equal(r.status, 'not-adopted');
  r = changeApplicability(acts, '3XXXXX', 'art_8', 'p9', '2026-01-01');
  assert.equal(r.status, 'unknown');
  assert.throws(() => changeApplicability(acts, '32017R2225', 'art_8', 'p9', '15.1.2026'));
});

test('findChange: exakter Schlüssel, Vorfahre, ganze Einheit', () => {
  const ees = acts.find((a) => a.celex === '32017R2225');
  assert.equal(findChange(ees, 'art_8', 'p3.a.iii').key, 'p3.a.iii');
  assert.equal(findChange(ees, 'art_8a', 'p4.b.iii').key, '');
  assert.equal(findChange(ees, 'art_12a', 'p1').unit, 'art_12a');
  assert.equal(findChange(ees, 'art_8', 'p5'), null);
});

test('Eigenschaft: Datum nach allen Anwendungsdaten ohne hängige Akte = bisheriges Ergebnis (alle Einheiten, drei Sprachen)', () => {
  const date = '2026-11-12';
  let n = 0;
  for (const lang of LANGS) for (const u of units) {
    const old = composeAt(ds, u, lang, (c) => actApplicableAt(acts, c, date));
    const neu = composeAtDate(ds, acts, der, u, lang, date).version;
    assert.equal(sig(neu), sig(old), `${u}/${lang}`);
    n++;
  }
  assert.equal(n, units.length * 3);
});

test('Eigenschaft: ohne hängige Akte und nach allen Daten = jüngster Stand (synthetisch alle Akte anwendbar)', () => {
  const all = acts.map((a) => (a.kind === 'proposal' ? a : { ...a, application: { ...a.application, status: 'applicable', date: a.application.date || '2026-01-01' } }));
  const last = ds.stages.slice().sort((a, b) => a.order - b.order).pop();
  for (const lang of LANGS) for (const u of units) {
    const v = getVersion(ds, u, lang, last.id);
    const c = composeAtDate(ds, all, der, u, lang, '2030-01-01').version;
    if (!v) { assert.ok(!c || !c.blocks.length); continue; }
    assert.equal(sig(c), sig(v), `${u}/${lang}`);
  }
});

test('Eigenschaft: 15. Januar 2026 liefert Hinweise zu den ausgesetzten Bestimmungen', () => {
  const d = '2026-01-15';
  const kinds = (u, lang = 'de') => composeAtDate(ds, acts, der, u, lang, d).notices;
  const has = (ns, key, effect) => ns.some((n) => n.kind === 'derogation' && n.celex === '32025R1534' && n.key === key && n.effect === effect);
  for (const lang of LANGS) {
    assert.ok(has(kinds('art_8', lang), 'p9', 'suspended'), 'Art. 8 Abs. 9 ausgesetzt');
    assert.ok(has(kinds('art_9', lang), 'p3', 'suspended'), 'Art. 9 Abs. 3 ausgesetzt');
    assert.ok(has(kinds('art_12', lang), null, 'suspended'), 'Art. 12 ausgesetzt');
    assert.ok(has(kinds('art_12a', lang), null, 'suspended'), 'Art. 12a verschoben');
    assert.ok(has(kinds('art_6', lang), 'p1.f.i', 'conditional'));
    assert.ok(has(kinds('art_42a', lang), 'p1.s2', 'modified'));
  }
  const n = kinds('art_8', 'fr').find((x) => x.key === 'p9');
  assert.equal(n.basis, 'art. 5, par. 12, du règlement (UE) 2025/1534');
  assert.equal(n.until, '2026-04-09');
  // Art. 12a: Wortlaut am 15. Januar 2026 nicht anwendbar, Hinweis "future"
  const r = composeAtDate(ds, acts, der, 'art_12a', 'de', d);
  assert.equal(r.version.blocks.length, 0);
  assert.ok(r.notices.some((x) => x.kind === 'future' && x.key === 'p1' && x.from === '2026-04-10'));
  // Nach dem Ende der schrittweisen Inbetriebnahme keine Abweichungshinweise mehr
  for (const u of ['art_8', 'art_9', 'art_12', 'art_12a', 'art_6', 'art_42a']) {
    assert.equal(composeAtDate(ds, acts, der, u, 'de', '2026-04-10').notices.filter((x) => x.kind === 'derogation').length, 0, u);
  }
  // 9. April 2026: letzter Tag
  assert.ok(has(composeAtDate(ds, acts, der, 'art_8', 'de', '2026-04-09').notices, 'p9', 'suspended'));
});

test('Hängige Änderungen erscheinen als Hinweis, nicht im Wortlaut (ETIAS, VIS-Revision, Interoperabilität)', () => {
  const r = composeAtDate(ds, acts, der, 'art_8', 'en', '2026-11-12');
  const keys = new Set(r.version.blocks.map((b) => b.k));
  assert.ok(!keys.has('p3.ba'), 'Art. 8 Abs. 3 Bst. ba (ETIAS) nicht im anwendbaren Text');
  assert.ok(!keys.has('p4a'), 'Art. 8 Abs. 4a (MID) nicht im anwendbaren Text');
  assert.ok(keys.has('p3.c'), 'Art. 8 Abs. 3 Bst. c bleibt bis zur VIS-Revision');
  for (const [celex, key] of [['32018R1240', 'p3.ba'], ['32019R0817', 'p4a'], ['32021R1134', 'p3.c']]) {
    assert.ok(r.notices.some((n) => n.kind === 'pending' && n.celex === celex && n.key === key), celex + ' ' + key);
  }
  // Art. 12a Abs. 1 nach dem 6. Oktober 2026: verbraucht, bleibt im Text
  const a = composeAtDate(ds, acts, der, 'art_12a', 'de', '2026-11-12');
  assert.equal(a.version.blocks.length, 2);
  assert.ok(a.notices.some((n) => n.kind === 'expired' && n.key === 'p1' && n.until === '2026-10-06'));
});

test('Vor dem Basisakt und vor einem Änderungsakt', () => {
  const r = composeAtDate(ds, acts, der, 'art_8', 'de', '2016-01-01');
  assert.ok(!r.version || r.version.blocks.length === 0);
  const s = composeAtDate(ds, acts, der, 'art_8', 'de', '2016-12-31');
  assert.equal(sig(s.version), sig(getVersion(ds, 'art_8', 'de', 's01')));
  assert.equal(s.notices.length, 0, 'keine Hinweise zu später angenommenen Akten');
});

test('composeAt: blockweise Zusammensetzung gleich wie aktweise für alle Präfixe und Lücken', () => {
  const st = ds.stages.slice().sort((a, b) => a.order - b.order);
  let n = 0;
  for (const lang of LANGS) for (const u of units) for (let i = 0; i < st.length; i++) {
    const inc = new Set(st.slice(0, i + 1).map((s) => s.act));
    for (const variant of [inc, new Set([...inc].filter((c) => c !== '32018R1240'))]) {
      const pred = (c) => variant.has(c);
      assert.equal(sig(_composeBlockwise(ds, u, lang, pred)), sig(composeAt(ds, u, lang, pred)), `${u}/${lang}/${st[i].id}`);
      n++;
    }
  }
  assert.ok(n > 3000);
});

test('composeAt: bisherige Prädikate (celex) => boolean unverändert, erweiterte Form schliesst Einzelblöcke aus', () => {
  const last = ds.stages.slice().sort((a, b) => a.order - b.order).pop();
  const v = getVersion(ds, 'art_8', 'de', last.id);
  assert.equal(sig(composeAt(ds, 'art_8', 'de', () => true)), sig(v));
  const calls = [];
  const c = composeAt(ds, 'art_8', 'de', (celex, block, unitId) => {
    if (block) calls.push(unitId);
    return !(block && celex === '32017R2225' && block.k === 'p9');
  });
  assert.ok(calls.every((x) => x === 'art_8'));
  assert.ok(!c.blocks.some((b) => b.k === 'p9'));
  assert.equal(c.blocks.length, v.blocks.length - 1);
});

test('derogations.json: Schema, Schlüssel existieren, dreisprachig', () => {
  const last = ds.stages.slice().sort((a, b) => a.order - b.order).pop();
  for (const d of der) {
    assert.match(d.celex, /^3\d{4}[A-Z]\d{4}/);
    assert.match(d.from, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(d.until === null || /^\d{4}-\d{2}-\d{2}$/.test(d.until));
    assert.ok(['verified', 'check'].includes(d.confidence));
    assert.ok(d.sources.length);
    for (const a of d.affects) {
      assert.ok(['suspended', 'modified', 'conditional'].includes(a.effect));
      assert.ok(ds.units[a.unit], a.unit);
      if (a.key) {
        const keys = new Set(getVersion(ds, a.unit, 'en', last.id).blocks.map((b) => b.k));
        assert.ok(keys.has(a.key), a.unit + '#' + a.key);
      }
      for (const l of LANGS) { assert.ok(a.note[l], 'note ' + l); assert.ok(a.basis[l], 'basis ' + l); assert.ok(!/ß/.test(a.note.de + a.basis.de)); }
    }
  }
  assert.equal(derogationsAt(der, 'art_8', '2025-10-11').length, 0);
  assert.ok(derogationsAt(der, 'art_8', '2025-10-12').length >= 4);
});

test('acts.json: applicableFrom nur bei Abweichung, gültiges Datum, nach Akt-Datum oder begründet', () => {
  for (const a of acts) for (const c of a.changes || []) {
    if (!c.applicableFrom) continue;
    assert.match(c.applicableFrom, /^\d{4}-\d{2}-\d{2}$/);
    assert.notEqual(c.applicableFrom, a.application.date, `${a.celex} ${c.unit}: gleich wie Akt`);
    assert.ok(c.basis && c.basis.de && c.basis.fr && c.basis.en, `${a.celex} ${c.unit}: Begründung fehlt`);
  }
});
