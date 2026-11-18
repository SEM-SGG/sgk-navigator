// Vorschau hängiger Vorschläge im SGK (SPEC3 §3.6): Änderungsanweisungen erkennen, synthetisch anwenden, Pflichtprüfung am
// historischen Fall (ST 6331/24 auf s06 gegen s07; übersprungen ohne raw-neg/), Beispiel-Dossier 2024/0670(COD), amends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseAmendingInstruction, buildPreview, annotateAmends, cellParagraphs } from '../../src/neg/preview.js';
import { createDossier, importDossier } from '../../src/neg/model.js';
import { planMerge, applyMerge } from '../../src/neg/merge.js';
import { parseTextPdf } from '../../src/neg/pdf-text.js';
import { getVersion } from '../../src/core/model.js';
import { normText } from '../../src/core/text.js';
import { RAW, rawExists } from './helpers.mjs';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const DATASET = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/dataset.json'), 'utf8'));
const NOW = '2026-11-12T12:00:00.000Z';

test('parseAmendingInstruction: typische Anweisungen der Unionsgesetzgebung', () => {
  const P = parseAmendingInstruction;
  let r = P('(2) Article 8 is amended as follows:');
  assert.equal(r.action, 'amend-intro'); assert.equal(r.container, true); assert.equal(r.target.art, '8');
  r = P('(a) paragraph 3 is replaced by the following:');
  assert.deepEqual([r.action, r.target.what, r.target.par, r.container], ['replace', 'paragraph', '3', false]);
  r = P('(b) in paragraph 3, the following point (ba) is inserted:');
  assert.deepEqual([r.action, r.target.what, r.target.par, r.target.num], ['insert', 'point', '3', 'ba']);
  r = P('(c) point (c) is deleted;');
  assert.deepEqual([r.action, r.target.what, r.target.pt], ['delete', 'point', ['c']]);
  r = P('(1) in Article 2, the following points are added:');
  assert.deepEqual([r.action, r.target.art, r.target.what], ['add', '2', 'point']);
  r = P('(3) Article 13 is replaced by the following:');
  assert.deepEqual([r.action, r.target.what, r.target.art], ['replace', 'article', '13']);
  r = P('(4) the following Article 21a is inserted:');
  assert.deepEqual([r.action, r.target.what, r.target.num, r.target.isNew], ['insert', 'article', '21a', true]);
  r = P('Regulation (EU) 2016/399 is amended as follows:');
  assert.deepEqual([r.action, r.target.what, r.target.act], ['amend-intro', 'act', '2016/399']);
  r = P('(a) in paragraph 1, the introductory wording is replaced by the following:');
  assert.equal(r.action, 'replace'); assert.equal(r.target.intro, true);
  r = P('in Article 22(4), the following subparagraph is inserted after the seventh subparagraph:');
  assert.equal(r.action, 'insert'); assert.equal(r.position, 'after');
  r = P('“ a) paragraph 2 is replaced by the following:');           // Anführungszeichen vor der Anweisung (Vier-Spalten-Tabelle)
  assert.deepEqual([r.action, r.target.par], ['replace', '2']);
  // keine Anweisung: Normtext mit «deleted»
  assert.equal(P('Personal data shall be deleted after five years.').action, 'none');
  assert.equal(P('The Member States shall ensure that the data are deleted without delay.').action, 'none');
  assert.equal(P('').action, 'none');
});

test('cellParagraphs: Streichungen, nur stehen gebliebenes Gliederungszeichen, Leerzeichen, «▌»', () => {
  const p = cellParagraphs('1. To <s>consider</s><b><i>assess</i></b> :<br>a) <s>the use of alternative measures</s><br>shall<s> notify the Commission</s><b><i>in close cooperation</i></b> determine<br>▌');
  assert.deepEqual(p.map((x) => x.plain), ['1. To assess :', 'a)', 'shall in close cooperation determine']);
  assert.equal(p[1].labelOnly, true);
});

/** kleiner Datensatz im Schema von SPEC.md §5 (EN), mit zusätzlicher Einheit «rct» (Erwägungsgründe, Etappe 3) */
function miniDataset() {
  const v = (blocks, title = 'Title') => ({ en: [{ stage: 's00', label: 'Article', title, blocks: blocks.map(([k, l, t]) => ({ k, d: k.split('.').length - 1, l, t, o: '32016R0399' })) }] });
  return {
    schema: 1, work: { id: 'sgk', celex: '32016R0399' }, langs: ['en'],
    stages: [{ id: 's00', act: '32016R0399', order: 0, date: '2016-03-23' }],
    toc: [],
    units: {
      rct: { id: 'rct', type: 'recitals', versions: { en: [{ stage: 's00', label: 'Recitals', title: '', blocks: [{ k: 'r1', d: 0, l: '(1)', t: 'Recital one.', o: '32016R0399' }] }] } },
      art_2: { id: 'art_2', type: 'article', num: '2', versions: v([['n1', '1.', '‘internal borders’ means …;'], ['n2', '2.', '‘external borders’ means …;']], 'Definitions') },
      art_8: { id: 'art_8', type: 'article', num: '8', versions: v([['p1', '1.', 'Cross-border movement shall be subject to checks.'], ['p2', '2.', 'Persons shall be checked as follows:'], ['p2.a', '(a)', 'verification of identity;'], ['p2.b', '(b)', 'verification of documents.'], ['p3', '3.', 'Old paragraph three.']], 'Border checks') },
    },
  };
}
function dossierFrom(paras, track = 'council') {
  let d = createDossier({ id: 'd-test', title: 'Proposal amending Regulation (EU) 2016/399', now: NOW });
  const parsed = { meta: { kind: 'mandate', ref: 'T 1/26', date: '2026-01-01' }, columns: [{ index: 0, header: 'Council', suggestedTrack: track }],
    rows: paras.map((t) => ({ num: null, label: 'x', labelSource: 'derived', path: { kind: 'other' }, cells: { 0: { html: t, text: t.replace(/<[^>]+>/g, ''), status: null, empty: false } } })), warnings: [] };
  d = applyMerge(d, planMerge(d, parsed, { 0: track }, { docMeta: { id: 'doc1', ref: 'T 1/26', date: '2026-01-01' } }), { now: NOW, ambiguous: 'new', unmatched: 'new' }).dossier;
  return d;
}

test('buildPreview synthetisch: ersetzen, einfügen, streichen, neuer Artikel; Unsicheres nicht angewandt', () => {
  const ds = miniDataset();
  const d = dossierFrom([
    'Regulation (EU) 2016/399 is amended as follows:',
    '(1) in Article 2, the following point is added:',
    '‘3. ‘digital travel credential’ means a digital representation;’',
    '(2) Article 8 is amended as follows:',
    '(a) paragraph 3 is replaced by the following:',
    '‘3. New paragraph three.’;',
    '(b) in paragraph 2, the following point (ba) is inserted:',
    '‘(ba) verification of travel data;’',
    '(c) in paragraph 2, point (a) is deleted;',
    '(d) paragraph 9 is replaced by the following:',
    '‘9. Paragraph nine does not exist.’;',
    '(3) the following Article 8ba is inserted:',
    '‘Article 8ba',
    'Use of the application',
    '1. Persons may use the application.',
    '2. Use shall be voluntary.’',
  ]);
  const before = JSON.stringify(ds);
  const pv = buildPreview(d, { track: 'council' }, ds, { lang: 'en' });
  assert.equal(JSON.stringify(ds), before, 'Datensatz unverändert');
  assert.equal(pv.base, 's00');
  assert.deepEqual(Object.keys(pv.units).sort(), ['art_2', 'art_8', 'art_8ba']);
  const a8 = pv.units.art_8.previewVersion;
  assert.deepEqual(a8.blocks.map((b) => b.k), ['p1', 'p2', 'p2.b', 'p2.ba', 'p3']);
  assert.equal(a8.blocks.find((b) => b.k === 'p3').t, 'New paragraph three.');
  assert.equal(a8.blocks.find((b) => b.k === 'p3').o, 'preview:d-test:council');
  assert.equal(a8.blocks.find((b) => b.k === 'p1').o, '32016R0399');
  assert.equal(a8.blocks.find((b) => b.k === 'p2.ba').l, '(ba)');
  assert.equal(pv.units.art_2.previewVersion.blocks.at(-1).k, 'n3');
  assert.equal(pv.units.art_8ba.baseVersion, null);
  assert.deepEqual(pv.units.art_8ba.previewVersion.blocks.map((b) => b.k), ['p1', 'p2']);
  assert.equal(pv.units.art_8ba.previewVersion.title, 'Use of the application');
  assert.equal(pv.unresolved.length, 1);
  assert.match(pv.unresolved[0].reason, /Absatz 9 nicht vorhanden/);
  assert.equal(pv.stats.applied, 5);
  // Versionen im Blockschema: k, d, l, t, o
  for (const b of a8.blocks) for (const f of ['k', 'd', 'l', 't', 'o']) assert.ok(f in b, f);
  // Einheit «rct» im Datensatz stört nicht und wird nicht berührt
  assert.ok(!pv.units.rct);
});

test('buildPreview: Anweisungen an andere Rechtsakte werden nicht auf den SGK angewandt', () => {
  const ds = miniDataset();
  const d = dossierFrom([
    'Article 12', 'Amendments to Regulation (EC) No 2252/2004', 'Regulation (EC) No 2252/2004 is amended as follows:',
    '(1) Article 8 is replaced by the following:', '‘Article 8', 'Something else', '1. Not for the SBC.’',
    'Article 13', 'Amendments to Regulation (EU) 2016/399', 'Regulation (EU) 2016/399 is amended as follows:',
    '(1) in Article 8, paragraph 1 is replaced by the following:', '‘1. Cross-border movement shall be subject to digital checks.’',
  ]);
  const pv = buildPreview(d, { track: 'council' }, ds, {});
  assert.deepEqual(Object.keys(pv.units), ['art_8']);
  assert.deepEqual(pv.units.art_8.changes.map((c) => [c.key, c.action]), [['p1', 'replace']]);
  assert.ok(pv.stats.otherAct >= 1);
});

const scoreBlocks = (pvVer, real) => {
  const N = (t) => normText(String(t || '').replace(/<[^>]+>/g, ''));
  const m = new Map((pvVer ? pvVer.blocks : []).map((b) => [b.k, b]));
  return real.blocks.filter((b) => m.has(b.k) && N(m.get(b.k).t) === N(b.t)).length;
};

test('Pflichtprüfung: ST 6331/24 auf s06 ergibt die durch VO (EU) 2024/1717 geänderten Einheiten (Vergleich mit s07)', { skip: !rawExists('ST-6331-2024.pdf') && 'Rohdaten fehlen', timeout: 120000 }, async () => {
  const parsed = await parseTextPdf(new Uint8Array(fs.readFileSync(path.join(RAW, 'ST-6331-2024.pdf'))), { pdfjs });
  let d = createDossier({ id: 'd-eval', title: 'amending Regulation (EU) 2016/399', now: NOW });
  d = applyMerge(d, planMerge(d, parsed, { 0: 'agreement' }, { docMeta: { id: 'doc4', ref: 'ST 6331/24', date: '2024-02-13' } }), { now: NOW, ambiguous: 'new', unmatched: 'new' }).dossier;
  const pv = buildPreview(d, { track: 'agreement' }, DATASET, { lang: 'en', baseStage: 's06' });
  const changed = Object.keys(DATASET.units).filter((u) => getVersion(DATASET, u, 'en', 's06') !== getVersion(DATASET, u, 'en', 's07'));
  assert.deepEqual(Object.keys(pv.units).sort(), changed.sort(), 'gleiche Einheiten wie der echte Stand');
  assert.equal(pv.unresolved.length, 1);
  assert.match(pv.unresolved[0].text, /Chapter V is renamed/);
  let identical = 0, total = 0;
  for (const u of changed) { const real = getVersion(DATASET, u, 'en', 's07'); total += real.blocks.length; identical += scoreBlocks(pv.units[u].previewVersion, real); }
  assert.equal(total, 219);
  assert.ok(identical >= 79, `identische Blöcke ${identical}`);
  // Abweichungen sind eingeordnet (scripts/neg/eval-preview.mjs): keine offenen Zuordnungsfehler
  const notes = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/neg/eval-preview-notes.json'), 'utf8'));
  assert.ok(!Object.values(notes).some((n) => n && n.class === 'zuordnung'));
});

test('Beispiel-Dossier 2024/0670(COD): Vorschau am geltenden SGK; Datensatz mit Einheit «rct» unschädlich', () => {
  const d = importDossier(fs.readFileSync(path.join(ROOT, 'data/neg-demo-dtc.json'), 'utf8')).dossier;
  const ds = { ...DATASET, units: { ...DATASET.units, rct: { id: 'rct', type: 'recitals', versions: { en: [{ stage: 's00', label: 'Recitals', title: '', blocks: [{ k: 'r1', d: 0, l: '(1)', t: 'x', o: '32016R0399' }] }] } } } };
  const last = ds.stages.slice().sort((a, b) => a.order - b.order).at(-1).id;
  const com = buildPreview(d, { track: 'com' }, ds, { lang: 'en' });
  assert.equal(com.base, last);
  assert.deepEqual(Object.keys(com.units).sort(), ['art_2', 'art_8', 'art_8a', 'art_8ba']);
  assert.equal(com.unresolved.length, 0);
  const cn = buildPreview(d, { track: 'council', doc: 'doc2' }, ds, { lang: 'en' });
  assert.deepEqual(Object.keys(cn.units).sort(), ['art_2', 'art_8', 'art_8a', 'art_8b', 'art_8ba']);
  assert.ok(cn.unresolved.length >= 1 && cn.unresolved.every((u) => u.reason && u.row));
  // eingefügte Begriffsbestimmungen 31–33 (Ratsmandat) mit Herkunft der Vorschau
  const a2 = cn.units.art_2.previewVersion.blocks;
  assert.deepEqual(a2.filter((b) => b.o.startsWith('preview:')).map((b) => b.k), ['n31', 'n32', 'n33']);
  assert.ok(a2.length === getVersion(ds, 'art_2', 'en', last).blocks.length + 3);
});

test('rows[].amends in den Beispiel-Dossiers: nur belegte Einträge (Vorschau), Ziel besteht in der Vorschau', () => {
  for (const [f, base] of [['neg-demo.json', 's06'], ['neg-demo-dtc.json', null]]) {
    const d = importDossier(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')).dossier;
    const am = d.rows.filter((r) => r.amends);
    assert.ok(am.length > 30, f);
    assert.ok(am.every((r) => r.amends.source === 'preview' && r.amends.work === 'sgk'), f);
    const again = annotateAmends(d, DATASET, base ? { baseStage: base } : {});
    assert.equal(again.stats.preview, am.length, `${f}: reproduzierbar`);
    const pvs = d.tracks.map((t) => buildPreview(d, { track: t.id }, DATASET, base ? { baseStage: base } : {}));
    for (const r of am.filter((x) => x.amends.key)) {
      const ok = pvs.some((pv) => pv.units[r.amends.unit] && pv.units[r.amends.unit].previewVersion.blocks.some((b) => b.k === r.amends.key));
      assert.ok(ok, `${f} ${r.id}: Schlüssel ${r.amends.unit}#${r.amends.key} in keiner Vorschau`);
    }
  }
  const s = importDossier(fs.readFileSync(path.join(ROOT, 'data/neg-demo-screening.json'), 'utf8')).dossier;
  assert.ok(s.rows.filter((r) => r.amends).every((r) => r.amends.source === 'preview' && ['vis', 'ees', 'etias', 'iop'].includes(r.amends.work)));
});
