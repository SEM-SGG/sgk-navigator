// Einheitstests Verweisnetz (egoGraph, src/app/ui/refsgraph-model.js) mit den echten Datensätzen und der echten Datenschicht
// (src/app/data.js, mit esbuild gebündelt, weil sie das virtuelle Modul sgk-core/model verwendet).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { egoGraph, shortActLabel, inScope } from '../../src/app/ui/refsgraph-model.js';
import { resolveCelex, stageAt } from '../../src/core/library.js';

const ROOT = new URL('../../', import.meta.url).pathname;
const plugin = { name: 'sgk-core', setup(b) { b.onResolve({ filter: /^sgk-core\/(model|parser)$/ }, (a) => ({ path: join(ROOT, 'src/core', a.path.endsWith('model') ? 'model.js' : 'parser.js') })); } };
const bundle = await build({ entryPoints: [join(ROOT, 'src/app/data.js')], bundle: true, write: false, format: 'esm', platform: 'node', plugins: [plugin], logLevel: 'error' });
const file = join(mkdtempSync(join(tmpdir(), 'sgk-rg-')), 'data.mjs');
writeFileSync(file, bundle.outputFiles[0].text);
const { Data, setLibraryContext } = await import(pathToFileURL(file).href);

const index = JSON.parse(readFileSync(join(ROOT, 'data/works/index.json'), 'utf8'));
setLibraryContext({ worksIndex: index });
const datas = {};
for (const w of index) {
  const ds = JSON.parse(readFileSync(join(ROOT, w.id === 'sgk' ? 'data/dataset.json' : 'data/works/' + w.dataset), 'utf8'));
  const acts = JSON.parse(readFileSync(join(ROOT, w.id === 'sgk' ? 'data/acts.json' : 'data/works/' + w.acts), 'utf8'));
  datas[w.id] = new Data({ dataset: ds, acts, work: w });
}
/** Bibliothek wie in der App (refsgraph.js libFor): Stand der weiteren Werke passend zum Datum des Stands */
const libFor = (d, stageId, cross = true) => ({
  workOfCelex: (c) => resolveCelex(index, c), workData: (id) => datas[id] || null, order: index.map((w) => w.id),
  abbr: (id, ui) => { const w = index.find((x) => x.id === id); return w ? w.abbr[ui] || w.abbr.de : id; },
  ...(cross ? { source: (id) => ({ data: datas[id], stageId: stageAt(datas[id].ds, d.stageDate(stageId)) || datas[id].latest.id }) } : {}),
});
const sgk = datas.sgk;
const S = sgk.latest.id;
const g8 = (key, opts = {}) => egoGraph(sgk, 'de', S, 'art_8', key, { lib: libFor(sgk, S), ui: 'de', ...opts });
const rowsOf = (g) => g.outgoing.groups.map((x) => [x.label || 'ext', x.rows.map((r) => r.label + ':' + r.n + (r.missing ? '!' : ''))]);

test('Stand s08 ist der jüngste SGK-Stand', () => assert.equal(S, 's08'));

test('Art. 8 SGK, ganzer Artikel: eingehend 14 Einheiten / 62 Fundstellen aus dem SGK, dazu 2 aus der Bibliothek', () => {
  const g = g8(null);
  assert.equal(g.center.label, 'Art. 8 SGK');
  assert.deepEqual(g.incoming.own, { units: 14, refs: 62 });
  assert.equal(g.incoming.units, 16);
  assert.equal(g.incoming.refs, 64);
  const own = g.incoming.groups.filter((x) => x.kind === 'own');
  assert.deepEqual(own.slice(0, 4).map((x) => x.label + ':' + x.n), ['Art. 8b:17', 'Anhang VI:14', 'Art. 8d:9', 'Anhang VII:9']);
  assert.deepEqual(g.incoming.groups.filter((x) => x.kind === 'library').map((x) => x.label + ':' + x.n).sort(), ['Art. 11 EES-VO:1', 'Art. 80 ETIAS-VO:1']);
  // ohne weitere Werke: genau die Zahlen der Gegenprobe
  const g0 = egoGraph(sgk, 'de', S, 'art_8', null, { lib: libFor(sgk, S, false), ui: 'de' });
  assert.equal(g0.incoming.units, 14);
  assert.equal(g0.incoming.refs, 62);
});

test('Art. 8 SGK, ganzer Artikel: ausgehend 22 Ziele / 41 Fundstellen, gruppiert nach Werk in der Reihenfolge der Werk-Tabs', () => {
  const g = g8(null);
  assert.equal(g.outgoing.targets, 22);
  assert.equal(g.outgoing.refs, 41);
  assert.deepEqual(rowsOf(g), [
    ['SGK', ['Art. 6a:5', 'Art. 6:3', 'Art. 5:2', 'Anhang II:1']],
    ['EES-VO', ['Art. 23:8', 'Art. 13:2', 'Art. 27:1']],
    ['ETIAS-VO', ['Art. 47:3', 'Art. 48:1']],
    ['VIS-VO', ['Art. 18:2', 'Art. 20:1', 'Art. 22g:1!']],
    ['IO-VO', ['Art. 6:1', 'Art. 17:1', 'Art. 25:1', 'Art. 69:1', 'Art. 72:1']],
    ['ext', ['RL 2004/82/EG:2', 'VO 2252/2004:1', 'VO 2016/1624:1', 'VO 539/2001:1', 'RL 2004/38/EG:1']],
  ]);
  assert.equal(g.uncertainCount, 0);
  assert.equal(g.selfCount, 21); // Verweise innerhalb von Art. 8 (z. B. «Absatz 2») sind keine Kanten
  assert.ok(!g.outgoing.groups[0].rows.some((r) => r.unit === 'art_8'));
});

test('missing-Flag: Art. 8 Abs. 3 Bst. bb -> Art. 22g VIS-VO (fehlt im VIS-Datensatz)', () => {
  const g = g8('p3.bb');
  const vis = g.outgoing.groups.find((x) => x.work === 'vis');
  assert.deepEqual(vis.rows.map((r) => [r.label, r.missing, r.full]), [['Art. 22g', true, 'Art. 22g VIS-VO']]);
  const g2 = g8(null);
  assert.equal(g2.outgoing.groups.find((x) => x.work === 'vis').rows.filter((r) => r.missing).length, 1);
  assert.equal(g2.outgoing.groups.find((x) => x.work === 'ees').rows.filter((r) => r.missing).length, 0);
});

test('Umfang Bestimmung: Art. 8 Abs. 3 Bst. a mit Unterblöcken; Umfang Einheit = ganzer Artikel', () => {
  const g = g8('p3.a');
  assert.equal(g.center.scope, 'provision');
  assert.equal(g.center.label, 'Art. 8 Abs. 3 Bst. a SGK');
  assert.equal(g.center.rest, 'Abs. 3 Bst. a');
  assert.deepEqual(g.incoming.groups.map((x) => x.label + ':' + x.n), ['Art. 8b:5', 'Art. 8d:5', 'Art. 6:1', 'Art. 9:1', 'Art. 42a:1']);
  assert.deepEqual(rowsOf(g), [['SGK', ['Art. 6a:2', 'Art. 6:1']], ['EES-VO', ['Art. 23:3']]]);
  // Quellen der ausgehenden Fundstellen liegen im Umfang (p3.a und p3.a.*)
  for (const gr of g.outgoing.groups) for (const r of gr.rows) for (const it of r.items) assert.ok(inScope(it.key, 'p3.a'), it.key);
  const gu = g8('p3.a', { scope: 'unit' });
  assert.equal(gu.center.scope, 'unit');
  assert.equal(gu.outgoing.targets, 22);
  assert.equal(gu.incoming.own.refs, 62);
});

test('Zusammenfassung «n weitere» (Schublade): höchstens 7 Zeilen links, je Werk höchstens 4 Zeilen rechts; Summen bleiben', () => {
  const g = g8(null, { maxIncoming: 7, maxPerGroup: 4 });
  assert.equal(g.incoming.groups.length, 7);
  const more = g.incoming.groups[6];
  assert.equal(more.more, true);
  assert.equal(more.units, 10);
  assert.equal(g.incoming.groups.reduce((s, x) => s + x.n, 0), 64);
  assert.equal(g.incoming.units, 16);
  const io = g.outgoing.groups.find((x) => x.work === 'iop');
  assert.equal(io.rows.length, 3);
  assert.deepEqual([io.hidden.rows, io.hidden.n], [2, 2]);
  assert.equal(g.outgoing.groups.find((x) => x.kind === 'foreign').hidden.rows, 2);
  assert.equal(g.outgoing.groups.find((x) => x.work === 'sgk').hidden, null);
  assert.equal(g.outgoing.targets, 22);
  // Dialog: ohne Begrenzung
  assert.ok(g8(null).incoming.groups.every((x) => !x.more));
});

test('Einheit ohne Verweise: leeres Netz (Art. 1 SGK)', () => {
  const g = egoGraph(sgk, 'de', S, 'art_1', null, { lib: libFor(sgk, S), ui: 'de' });
  assert.equal(g.empty, true);
  assert.equal(g.incoming.units, 0);
  assert.equal(g.outgoing.targets, 0);
});

test('Werk ausser SGK: EES-VO Art. 23 eingehend aus dem SGK (Art. 8 SGK, 8 Fundstellen), Stand passend zum Datum', () => {
  const ees = datas.ees;
  const g = egoGraph(ees, 'de', ees.latest.id, 'art_23', null, { lib: libFor(ees, ees.latest.id), ui: 'de' });
  assert.equal(g.center.label, 'Art. 23 EES-VO');
  const fromSgk = g.incoming.groups.filter((x) => x.work === 'sgk');
  assert.deepEqual(fromSgk.map((x) => x.label + ':' + x.n), ['Art. 8 SGK:8', 'Art. 8a SGK:3', 'Art. 6 SGK:2']);
  assert.equal(fromSgk[0].kind, 'library');
  assert.equal(fromSgk[0].ref, '32016R0399:art_8#');
  assert.deepEqual(g.incoming.own, { units: 8, refs: 21 });
  assert.equal(g.uncertainCount, 1);
  assert.deepEqual(rowsOf(g), [['EES-VO', ['Art. 16:4', 'Art. 17:2', 'Art. 27:2', 'Art. 14:1']], ['VIS-VO', ['Art. 18:7', 'Art. 19a:2', 'Art. 20:1']]]);
});

test('Oberfläche FR: Zitierweise und Kurzbezeichnung der Fremdakte', () => {
  const g = egoGraph(sgk, 'fr', S, 'art_8', null, { lib: libFor(sgk, S), ui: 'fr' });
  assert.equal(g.center.label, 'art. 8, CFS');
  assert.equal(g.incoming.groups[0].label, 'art. 8 ter');
  assert.deepEqual(g.outgoing.groups.at(-1).rows.slice(0, 2).map((r) => r.label), ['dir. 2004/82/CE', 'règl. 2252/2004']);
  assert.equal(shortActLabel('32004L0082', 'Richtlinie 2004/82/EG', 'fr'), 'dir. 2004/82/CE');
  assert.equal(shortActLabel('32016R1624', 'Art. 3 Verordnung (EU) 2016/1624', 'de'), 'VO 2016/1624');
});
