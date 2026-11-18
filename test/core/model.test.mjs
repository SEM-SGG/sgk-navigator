// Tests Kernbibliothek (node --test test/core)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getVersion, composeAt, blockHistory, changesOfStage, addSnapshot } from '../../src/core/model.js';
import { buildAll, parseRaw, LANGS, rawPath } from '../../scripts/build-data.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dsFile = resolve(here, '../../data/dataset.json');

let full = null;
function fullDataset() {
  if (!full) full = existsSync(dsFile) ? JSON.parse(readFileSync(dsFile, 'utf8')) : buildAll().ds;
  return full;
}
const strip = (v) => v && { label: v.label, title: v.title, repealed: !!v.repealed, blocks: v.blocks };

test('composeAt: alle Akte bis und mit Stand N eingeschlossen ergibt exakt getVersion(N)', () => {
  const ds = fullDataset();
  const stages = ds.stages.slice().sort((a, b) => a.order - b.order);
  let checked = 0;
  for (const st of stages) {
    const incl = new Set(stages.filter((s) => s.order <= st.order).map((s) => s.act));
    for (const uid of Object.keys(ds.units)) {
      for (const lang of LANGS) {
        const v = getVersion(ds, uid, lang, st.id);
        const c = composeAt(ds, uid, lang, (celex) => incl.has(celex));
        if (!v) { assert.ok(!c || c.empty || !c.blocks.length, `${uid}/${lang}/${st.id}: composeAt liefert Text, getVersion nicht`); continue; }
        assert.deepEqual(strip(c), strip(v), `${uid}/${lang}/${st.id}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 1500, 'zu wenige Faelle geprueft: ' + checked);
});

test('composeAt: ETIAS ausgeschlossen, spaetere Akte eingeschlossen (berechnete Sicht)', () => {
  const ds = fullDataset();
  const all = new Set(ds.stages.map((s) => s.act));
  const c = composeAt(ds, 'art_8', 'de', (celex) => celex !== '32018R1240' && all.has(celex));
  const ii = c.blocks.find((b) => b.k === 'p3.a.ii');
  assert.equal(ii.o, '32017R0458', 'Art. 8 Abs. 3 Bst. a Ziff. ii ohne ETIAS: Fassung 2017/458');
  assert.ok(!c.blocks.some((b) => b.k === 'p3.ba'), 'Bst. ba (ETIAS) darf fehlen');
  assert.ok(c.blocks.some((b) => b.k === 'p3.bb'), 'Bst. bb (2021/1134) bleibt');
  assert.ok(c.blocks.some((b) => b.k === 'p4a'), 'Abs. 4a (2019/817) bleibt');
});

// braucht alle Quelldateien des SGK in raw/ (Datenpflege, nicht im Repo)
const RAW_SGK = ['32016R0399', '02016R0399-20161006', '02016R0399-20170407', '02016R0399-20240710', '02016R0399-20251012'].every((c) => LANGS.every((l) => existsSync(rawPath(c, l))));
test('addSnapshot: Datensatz ohne 20251012 bauen, 20251012 per addSnapshot ergaenzen = Gesamtbuild', { skip: !RAW_SGK && 'raw/ fehlt (Datenpflege, siehe MAINTAINING.md)' }, () => {
  const { ds: without } = buildAll({ without: '02016R0399-20251012' });
  assert.ok(!without.stages.some((s) => s.id === 's08'));
  const order = [...without.stages.map((s) => s.act), '32024R1717R(01)'];
  for (const lang of LANGS) {
    addSnapshot(without, parseRaw('02016R0399-20251012', lang), { actCelex: '32024R1717R(01)', date: '2025-10-12', actOrder: order });
  }
  const ref = fullDataset();
  const s08 = without.stages.find((s) => s.act === '32024R1717R(01)');
  assert.ok(s08, 'neuer Stand angelegt');
  assert.deepEqual(s08.langs, ['de'], 'nur DE betroffen');
  const refS08 = ref.stages.find((s) => s.id === 's08');
  for (const lang of LANGS) {
    const a = changesOfStage(without, s08.id, lang);
    const b = changesOfStage(ref, refS08.id, lang);
    assert.deepEqual(a, b, `Aenderungen ${lang}`);
  }
  for (const uid of Object.keys(ref.units)) for (const lang of LANGS) {
    assert.deepEqual(strip(getVersion(without, uid, lang, s08.id)), strip(getVersion(ref, uid, lang, 's08')), `${uid}/${lang}`);
  }
  const ch = changesOfStage(without, s08.id, 'de');
  assert.deepEqual(ch, [{ unit: 'art_25', key: 'p1.a', change: 'replaced' }]);
  // ETIAS-Patch bleibt im neuen Stand erhalten (EUR-Lex hat 2018/1240 nicht konsolidiert)
  const v = getVersion(without, 'art_8', 'fr', s08.id);
  assert.ok(v.blocks.some((b) => b.k === 'p3.ba' && b.o === '32018R1240'));
});

test('blockHistory: Art. 8 Abs. 3 Bst. a Ziff. ii', () => {
  const ds = fullDataset();
  const h = blockHistory(ds, 'art_8', 'de', 'p3.a.ii');
  assert.deepEqual(h.map((x) => [x.stage, x.change, x.act]), [
    ['s00', 'base', '32016R0399'],
    ['s02', 'replaced', '32017R0458'],
    ['s04', 'replaced', '32018R1240R(03)'],
  ]);
});

test('blockHistory: Art. 25 Abs. 1 Bst. a (DE-Berichtigung nur in DE)', () => {
  const ds = fullDataset();
  const de = blockHistory(ds, 'art_25', 'de', 'p1.a');
  const fr = blockHistory(ds, 'art_25', 'fr', 'p1.a');
  assert.equal(de[de.length - 1].stage, 's08');
  assert.equal(de[de.length - 1].act, '32024R1717R(01)');
  assert.notEqual(fr[fr.length - 1].stage, 's08');
});

test('Staende s00 -> s01 -> s02: nur Aenderungen der Akte 2016/1624 bzw. 2017/458 (oder ausgewiesene Zeichensetzung/redaktionelle Abweichung)', () => {
  const ds = fullDataset();
  for (const [sid, act] of [['s01', '32016R1624'], ['s02', '32017R0458']]) {
    for (const lang of LANGS) {
      for (const c of changesOfStage(ds, sid, lang)) {
        if (c.change === 'deleted' || c.change === 'punct' || c.change === 'editorial') continue;
        const b = getVersion(ds, c.unit, lang, sid).blocks.find((x) => x.k === c.key);
        assert.equal(b.o, act, `${sid}/${lang} ${c.unit} ${c.key}`);
      }
    }
  }
});

test('Schluessel sprachuebergreifend identisch in jedem Stand', () => {
  const ds = fullDataset();
  for (const st of ds.stages) for (const uid of Object.keys(ds.units)) {
    const keys = LANGS.map((l) => { const v = getVersion(ds, uid, l, st.id); return v ? v.blocks.map((b) => b.k).join(' ') : null; });
    assert.equal(keys[1], keys[0], `${st.id} ${uid} fr`);
    assert.equal(keys[2], keys[0], `${st.id} ${uid} en`);
  }
});
