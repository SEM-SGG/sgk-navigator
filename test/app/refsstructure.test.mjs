// Einheitstests Verweisstruktur (structureModel, src/app/ui/refsstructure-model.js) mit den echten Datensätzen und der echten
// Datenschicht (src/app/data.js, mit esbuild gebündelt). Gegenprobe Art. 8 SGK und Gleichheit mit egoGraph für jede Einheit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { egoGraph } from '../../src/app/ui/refsgraph-model.js';
import { structureModel, levelOf, strongest } from '../../src/app/ui/refsstructure-model.js';
import { resolveCelex, stageAt } from '../../src/core/library.js';

const ROOT = new URL('../../', import.meta.url).pathname;
const plugin = { name: 'sgk-core', setup(b) { b.onResolve({ filter: /^sgk-core\/(model|parser)$/ }, (a) => ({ path: join(ROOT, 'src/core', a.path.endsWith('model') ? 'model.js' : 'parser.js') })); } };
const bundle = await build({ entryPoints: [join(ROOT, 'src/app/data.js')], bundle: true, write: false, format: 'esm', platform: 'node', plugins: [plugin], logLevel: 'error' });
const file = join(mkdtempSync(join(tmpdir(), 'sgk-rs-')), 'data.mjs');
writeFileSync(file, bundle.outputFiles[0].text);
const { Data, setLibraryContext } = await import(pathToFileURL(file).href);

const index = JSON.parse(readFileSync(join(ROOT, 'data/works/index.json'), 'utf8'));
setLibraryContext({ worksIndex: index });
const read = (f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
const datas = {};
for (const w of index) {
  const ds = read(w.id === 'sgk' ? 'data/dataset.json' : 'data/works/' + w.dataset);
  const acts = read(w.id === 'sgk' ? 'data/acts.json' : 'data/works/' + w.acts);
  datas[w.id] = new Data({ dataset: ds, acts, work: w });
}
// SGK wie in der App (build.mjs): Erwägungsgründe als Einheit rct an erster Stelle
const sgkW = index.find((w) => w.id === 'sgk');
const rct = read('data/works/' + sgkW.recitals);
const dsR = read('data/dataset.json');
const sgkApp = new Data({ dataset: { ...dsR, units: { [rct.unit.id]: rct.unit, ...dsR.units }, toc: [rct.toc, ...dsR.toc] }, acts: read('data/acts.json'), work: sgkW });

/** Bibliothek wie in der App (refsgraph.js libFor) */
const libFor = (d, stageId, all = datas) => ({
  workOfCelex: (c) => resolveCelex(index, c), workData: (id) => all[id] || null, order: index.map((w) => w.id),
  abbr: (id, ui) => { const w = index.find((x) => x.id === id); return w ? w.abbr[ui] || w.abbr.de : id; },
  source: (id) => ({ data: all[id], stageId: stageAt(all[id].ds, d.stageDate(stageId)) || all[id].latest.id }),
});
const sgk = datas.sgk;
const S = sgk.latest.id;
const model = structureModel(sgk, 'de', S, { lib: libFor(sgk, S), ui: 'de' });
const iOf = (m, id) => m.units.findIndex((u) => u.id === id);

test('Gegenprobe Art. 8 SGK (s08, DE): eingehend 14 Einheiten / 62 Fundstellen aus dem SGK, ausgehend 22 Ziele / 41 Fundstellen', () => {
  assert.equal(S, 's08');
  const i = iOf(model, 'art_8');
  const p = model.per[i];
  assert.deepEqual(p.inOwn, { units: 14, refs: 62 });
  assert.deepEqual([p.inUnits, p.inRefs], [16, 64]); // dazu Art. 11 EES-VO und Art. 80 ETIAS-VO
  assert.deepEqual(p.inSources.filter((x) => x.kind === 'own').slice(0, 4).map((x) => x.label + ':' + x.n), ['Art. 8b:17', 'Anhang VI:14', 'Art. 8d:9', 'Anhang VII:9']);
  assert.deepEqual([p.outTargets, p.outRefs], [22, 41]);
  assert.deepEqual(p.outOwn.map((x) => x.label + ':' + x.n), ['Art. 6a:5', 'Art. 6:3', 'Art. 5:2', 'Anhang II:1']);
  const cell = (r) => model.cells[r][i];
  assert.equal(cell('ees').n, 11);
  assert.deepEqual(cell('ees').targets.map((x) => x.label), ['Art. 23', 'Art. 13', 'Art. 27']);
  assert.deepEqual(['etias', 'vis', 'iop', 'ext'].map((r) => cell(r).n), [4, 4, 5, 6]);
  assert.equal(cell('vis').targets.find((x) => x.label === 'Art. 22g').missing, true);
  assert.deepEqual(model.rows.map((r) => r.id), ['ees', 'etias', 'vis', 'iop', 'ext']);
  // Bögen an Art. 8: 4 ausgehend, 14 eingehend; Art. 6 in beide Richtungen (8→6: 3, 6→8: 2)
  const touching = model.arcs.filter((a) => a.a === i || a.b === i);
  const outN = touching.filter((a) => (a.a === i ? a.ab : a.ba) > 0).length, inN = touching.filter((a) => (a.a === i ? a.ba : a.ab) > 0).length;
  assert.deepEqual([touching.length, outN, inN], [17, 4, 14]);
  const a6 = touching.find((a) => model.units[a.a].id === 'art_6');
  assert.deepEqual([a6.ab, a6.ba, a6.n], [2, 3, 5]);
  assert.equal(p.selfCount, 21);
  assert.deepEqual(strongest(model, i).map((x) => `${x.dir}:${x.label}:${x.n}`), ['in:Art. 8b:17', 'in:Anhang VI:14', 'in:Art. 8d:9']);
});

/** egoGraph und structureModel liefern für jede Einheit dieselben Summen */
function sameAsEgo(d, m, lib) {
  const diff = [];
  for (const u of m.units) {
    const g = egoGraph(d, 'de', m.stageId, u.id, null, { lib, ui: 'de' });
    const p = m.per[u.i];
    const a = [g.incoming.units, g.incoming.refs, g.incoming.own.units, g.incoming.own.refs, g.outgoing.targets, g.outgoing.refs, g.selfCount, g.uncertainCount];
    const b = [p.inUnits, p.inRefs, p.inOwn.units, p.inOwn.refs, p.outTargets, p.outRefs, p.selfCount, p.uncertainCount];
    if (a.join() !== b.join()) diff.push(`${u.id}: ego ${a.join()} / struct ${b.join()}`);
    // Zellen = ausgehende Gruppen der weiteren Werke und Fremdakte
    for (const gr of g.outgoing.groups) {
      if (gr.kind === 'own') continue;
      const rid = gr.kind === 'foreign' ? 'ext' : gr.work;
      const c = m.cells[rid] && m.cells[rid][u.i];
      if (!c || c.n !== gr.refs || c.targets.length !== gr.total) diff.push(`${u.id} ${rid}: ego ${gr.refs}/${gr.total} / struct ${c ? c.n + '/' + c.targets.length : '-'}`);
    }
    // eigene Ziele = Bögen in ausgehender Richtung (+ Ziele ausserhalb der Achse)
    const own = g.outgoing.groups.find((x) => x.kind === 'own');
    const arcOut = m.arcs.reduce((s, x) => s + (x.a === u.i ? x.ab : x.b === u.i ? x.ba : 0), 0);
    if ((own ? own.refs : 0) !== arcOut + p.outOwn.filter((x) => !m.units.some((y) => y.id === x.unit)).reduce((s, x) => s + x.n, 0)) diff.push(`${u.id}: Bögen ausgehend ${arcOut} / ego ${own ? own.refs : 0}`);
  }
  return diff;
}

test('Gleichheit mit egoGraph über alle Einheiten: SGK (mit Erwägungsgründen wie in der App), EES-VO, VIS-VO', () => {
  const all = { ...datas, sgk: sgkApp };
  const mS = structureModel(sgkApp, 'de', S, { lib: libFor(sgkApp, S, all), ui: 'de' });
  assert.ok(!mS.units.some((u) => u.id === 'rct'), 'Erwägungsgründe nicht auf der Achse');
  assert.equal(mS.units.length, 70);
  assert.deepEqual(sameAsEgo(sgkApp, mS, libFor(sgkApp, S, all)), []);
  for (const w of ['ees', 'vis']) {
    const d = datas[w];
    const m = structureModel(d, 'de', d.latest.id, { lib: libFor(d, d.latest.id), ui: 'de' });
    assert.ok(m.units.length > 60, w);
    assert.deepEqual(sameAsEgo(d, m, libFor(d, d.latest.id)), [], w);
  }
  // FR: dieselben Zahlen wie egoGraph
  const mF = structureModel(sgk, 'fr', S, { lib: libFor(sgk, S), ui: 'fr' });
  const i = iOf(mF, 'art_8');
  const g = egoGraph(sgk, 'fr', S, 'art_8', null, { lib: libFor(sgk, S), ui: 'fr' });
  assert.deepEqual([mF.per[i].inRefs, mF.per[i].outRefs], [g.incoming.refs, g.outgoing.refs]);
  assert.equal(mF.units[i].num, '8');
  assert.equal(mF.units[iOf(mF, 'art_8a')].num, '8 bis');
});

test('Gruppenbildung: oberste Gliederungsebene (Titel bzw. Kapitel), Anhänge als eigene Gruppe, lückenlos', () => {
  assert.deepEqual(model.groups.map((g) => `${g.type}:${g.num || ''}:${g.to - g.from + 1}`), ['title:I:4', 'title:II:24', 'title:III:17', 'title:IV:13', 'annexes::12']);
  for (const [w, last] of [['ees', 'annexes'], ['vis', 'annexes'], ['iop', 'chapter']]) {
    const d = datas[w];
    const m = structureModel(d, 'de', d.latest.id, { lib: libFor(d, d.latest.id), ui: 'de' });
    assert.equal(m.groups[0].type, 'chapter', w);
    assert.equal(m.groups.at(-1).type, last, w);
    let next = 0;
    for (const g of m.groups) { assert.equal(g.from, next, w); next = g.to + 1; }
    assert.equal(next, m.units.length, w);
    for (const u of m.units) assert.equal(u.type === 'annex', u.group === 'annexes', `${w} ${u.id}`);
  }
  // Art. 8 gehört zu Titel II, Kapitel II wird nicht als eigene Gruppe geführt
  assert.equal(model.units[iOf(model, 'art_8')].group, 'tit_II');
});

test('Werk ohne Verweise auf ein bestimmtes Werk: Zeile bleibt, ohne Zellen (SGK-Basistext s00 kennt die EES-VO nicht)', () => {
  const m0 = structureModel(sgk, 'de', 's00', { lib: libFor(sgk, 's00'), ui: 'de' });
  const ees = m0.rows.find((r) => r.id === 'ees');
  assert.ok(ees);
  assert.deepEqual([ees.refs, ees.units], [0, 0]);
  assert.ok(m0.cells.ees.every((c) => c === null));
  assert.ok(m0.rows.find((r) => r.id === 'ext').refs > 0);
  assert.ok(m0.units.length < model.units.length, 'Art. 8a bis 8d fehlen im Basistext');
  // ohne Bibliothek: nur die Zeile Fremdakte, eingehend nur aus dem eigenen Werk
  const m1 = structureModel(sgk, 'de', S, { ui: 'de' });
  assert.deepEqual(m1.rows.map((r) => r.id), ['ext']);
  assert.deepEqual(m1.per[iOf(m1, 'art_8')].inOwn, { units: 14, refs: 62 });
  assert.equal(m1.per[iOf(m1, 'art_8')].inUnits, 14);
});

test('Deckkraftstufen 1 · 2–3 · 4–7 · 8 und mehr', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 7, 8, 40].map(levelOf), [0, 1, 2, 2, 3, 3, 4, 4]);
});
