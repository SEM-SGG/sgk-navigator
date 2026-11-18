// Äquivalenz Upload ↔ zentraler Build (node --test test/app/equiv.test.mjs).
// Je Werk: Testvariante ohne die jüngste konsolidierte Fassung (wie build.mjs --drop-stage / --drop-work-stage), Upload der echten
// EUR-Lex-Dateien DE, FR, EN aus test/app/fixtures-live/ mit den Funktionen der Anwendung (parseEurLexFile, parseUpload,
// applySnapshot wie handleFiles), Vergleich mit dem zentral gebauten Datensatz je Sprache:
// (a) Einheiten, Blöcke, Schlüssel, normalisierter Text, Gliederungszeichen, Herkunft; (b) Verweisindex (Data.refIndex);
// (c) Vergleich/Redline gegen den Vorgänger (compareRows, diffText); (d) Chronologie (changesOfStage, unitSteps);
// (e) Sprachvergleich (gleiche Blockstruktur über DE/FR/EN). Ohne fixtures-live: übersprungen.
// Parser: linkedom (wie der zentrale Build); den Parser von Chrome prüft test/app/equiv.spec.mjs.
import './equiv/env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadAll, diffAll } from './equiv/run.mjs';
import { loadWork, targetStage, haveFixtures, LANGS } from './equiv/lib.mjs';
import { EXPLAINED_META, KNOWN_CENTRAL, isKnown } from './equiv/expected.mjs';
import { rekey } from '../../src/core/model.js';

const WORKS = ['sgk', 'ees', 'etias', 'vis', 'iop'];
const celexOf = (id) => targetStage(id, loadWork(id).dataset).source.celex;

for (const id of WORKS) {
  const celex = celexOf(id);
  test(`Äquivalenz ${id}: Upload ${celex} DE, FR, EN = zentraler Stand`, { skip: !haveFixtures(celex) && 'test/app/fixtures-live/ fehlt (node test/app/tools/fetch-eurlex.mjs …)' }, async () => {
    const r = await uploadAll(id);
    assert.ok(r.sb, 'Stand des Uploads fehlt');
    assert.equal(r.log.length, 3);
    assert.deepEqual(r.log.map((x) => x.celex), [celex, celex, celex]);
    const d = diffAll(r);
    // erklärbare Unterschiede der Stand-Metadaten (Akt-Zuordnung, Erläuterung der Quelle): nur diese Felder
    for (const m of d.meta) assert.ok(EXPLAINED_META.includes(m.field), `${id}: unerwartete Abweichung der Stand-Metadaten ${JSON.stringify(m)}`);
    assert.equal(r.B.stage(r.sb).source.celex, celex);
    assert.deepEqual(r.B.stage(r.sb).langs, r.A.stage(r.sa).langs, 'Sprachen des Stands');
    for (const k of [...LANGS, 'langs']) {
      const rest = d[k].filter((x) => !isKnown(id, r.sa, x));
      assert.deepEqual(rest, [], `${id} ${k}: Abweichungen\n${rest.slice(0, 20).map((x) => `${x.cat} ${x.unit}#${x.key}: ${x.detail}`).join('\n')}`);
    }
    // bekannte Fehler des zentralen Datensatzes müssen weiterhin auftreten (sonst Ausnahme entfernen)
    for (const kc of KNOWN_CENTRAL.filter((x) => x.work === id)) {
      assert.ok(LANGS.some((l) => d[l].some((x) => x.unit === kc.unit)), `${id}: bekannte Abweichung ${kc.unit} tritt nicht mehr auf`);
    }
  });
}

test('Äquivalenz: Reihenfolge der Sprachen beim Upload ist ohne Einfluss (EES-VO EN, FR, DE; IO-VO FR, EN, DE)', { skip: !haveFixtures(celexOf('ees')) || !haveFixtures(celexOf('iop')) }, async () => {
  for (const [id, langs] of [['ees', ['en', 'fr', 'de']], ['iop', ['fr', 'en', 'de']]]) {
    const r = await uploadAll(id, { langs });
    const d = diffAll(r);
    for (const k of [...LANGS, 'langs']) assert.deepEqual(d[k].filter((x) => !isKnown(id, r.sa, x)), [], `${id} ${langs.join(',')} ${k}`);
  }
});

test('applySnapshot verändert den übergebenen Datensatz nicht (erneutes Anwenden geht vom eingebetteten Stand aus)', { skip: !haveFixtures(celexOf('ees')) }, async () => {
  const D = await import('../../src/app/data.js');
  const { variantOf, fixtureFile, worksIndex } = await import('./equiv/lib.mjs');
  const { readFileSync } = await import('node:fs');
  const full = loadWork('ees');
  const base = variantOf('ees', full.dataset);
  const before = JSON.stringify(base);
  const data = new D.Data({ dataset: base, acts: full.acts, work: worksIndex().find((w) => w.id === 'ees') });
  const p = D.parseEurLexFile(readFileSync(fixtureFile(celexOf('ees'), 'de'), 'utf8'));
  const ds = D.applySnapshot(data.ds, p, { date: p.date, full: false });
  assert.equal(JSON.stringify(base), before);
  assert.equal(ds.stages.length, base.stages.length + 1);
  assert.notEqual(ds.units, data.ds.units);
});

test('rekey: exactFirst ordnet unveränderte Blöcke zuerst zu; ohne Option unverändertes Verhalten', () => {
  const prev = { fr: { blocks: [
    { k: 'p2', t: 'Deux' }, { k: 'p3', t: 'Trois' }, { k: 'p3.b', t: 'la finalité;' }, { k: 'p3.c', t: 'la date;' },
  ] } };
  const next = { fr: [
    { k: 'p2', t: 'Deux' }, { k: 'p2a', t: 'Deux bis' }, { k: 'p2a.b', t: 'la finalité;' }, { k: 'p2a.c', t: 'la date;' },
    { k: 'p3', t: 'Trois' }, { k: 'p3.b', t: 'la finalité;' }, { k: 'p3.c', t: 'la date;' },
  ] };
  const old = rekey(prev, next).byLang.fr.map((b) => b.k);
  assert.deepEqual(old, ['p2', 'p2a', 'p3.b', 'p3.c', 'p3', 'p3.ba', 'p3.ca']); // bisheriges Verhalten (Schlüssel «gestohlen»)
  const ex = rekey(prev, next, null, null, '', { exactFirst: true }).byLang.fr.map((b) => b.k);
  assert.deepEqual(ex, ['p2', 'p2a', 'p2a.b', 'p2a.c', 'p3', 'p3.b', 'p3.c']);
});

test('Gespeicherter Upload SGK 02016R0399-20251012 FR in der vollständigen Version: Sprache nicht in stage.langs, Einarbeiten ändert nichts -> enthalten', { skip: !haveFixtures(celexOf('sgk')) }, async () => {
  const D = await import('../../src/app/data.js');
  const { planStored, hadEffect } = await import('../../src/app/lib/storedplan.js');
  const { fixtureFile, worksIndex } = await import('./equiv/lib.mjs');
  const { readFileSync } = await import('node:fs');
  const full = loadWork('sgk');
  for (const lang of ['fr', 'en', 'de']) {
    const plan = planStored(full.dataset, { celex: '02016R0399-20251012', lang });
    assert.equal(plan.action, lang === 'de' ? 'contained' : 'tryLang');
    if (plan.action !== 'tryLang') continue;
    const p = D.parseEurLexFile(readFileSync(fixtureFile('02016R0399-20251012', lang), 'utf8'));
    const data = new D.Data({ dataset: full.dataset, acts: full.acts, work: worksIndex()[0] });
    const next = D.applySnapshot(data.ds, p, { date: p.date, full: true });
    assert.equal(hadEffect(data.ds, next, plan.stage, lang), false, lang);
    assert.equal(next.stages.length, data.ds.stages.length);
  }
});

test('Doppelte Stände reproduziert: bisheriges erneutes Einarbeiten (addSnapshot ohne Prüfung) in die vollständige Version; planStored erkennt alle 15 Uploads als enthalten', { skip: WORKS.some((id) => !haveFixtures(celexOf(id))) }, async () => {
  const D = await import('../../src/app/data.js');
  const { planStored } = await import('../../src/app/lib/storedplan.js');
  const { fixtureFile } = await import('./equiv/lib.mjs');
  const { readFileSync } = await import('node:fs');
  const extra = {};
  for (const id of WORKS) {
    const full = loadWork(id);
    const st = targetStage(id, full.dataset);
    let ds = structuredClone(full.dataset);
    for (const lang of LANGS) {
      const p = D.parseEurLexFile(readFileSync(fixtureFile(st.source.celex, lang), 'utf8'));
      ds = D.core.addSnapshot(ds, p, { date: p.date }); // wie bisher applyStoredUploads beim Start
      assert.ok(['contained', 'tryLang'].includes(planStored(full.dataset, { celex: st.source.celex, lang }).action), `${id} ${lang}`);
    }
    // kein zusätzlicher Stand (addSnapshot findet den Stand über source.celex), aber zusätzliche Versionen im selben Stand
    assert.equal(ds.stages.length, full.dataset.stages.length, id);
    let n = 0;
    for (const u of Object.values(ds.units)) for (const vs of Object.values(u.versions)) n += Math.max(0, vs.filter((v) => v.stage === st.id).length - 1);
    extra[id] = n;
  }
  assert.deepEqual(extra, { sgk: 0, ees: 0, etias: 0, vis: 2, iop: 3 });
});
