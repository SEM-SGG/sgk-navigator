// Einheitstests des Workflows «Fassungen» und der Veröffentlichung: Fassungsprüfung (scripts/check-fassungen.mjs,
// scripts/fassungen/lib.mjs; Abfragen gemockt, kein Netz), Liste «zur Kenntnis genommen», Einbau und Pull Request
// (scripts/fassungen/einbau-lib.mjs), Changelog und Version der Produktdokumentation (scripts/release/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWorks, checkAll, issueBody, keysOfBody, itemKeys, fetchQuery, befundOf, MARKER, TITLE } from '../../scripts/fassungen/lib.mjs';
import { parseKenntnis } from '../../scripts/fassungen/kenntnis.mjs';
import { sgkActOf, sgkNote, nextStageId, planPr, prText, judgeValidation, changelogLines, commitSubject, stageChanges, changedOldStages, testCounts, FP_MARK, STATUS_MARK } from '../../scripts/fassungen/einbau-lib.mjs';
import { checkChangelog, changelogSection, insertChangelog, nextVersion, plainNotes, latestVersion } from '../../scripts/release/changelog.mjs';
import { checkDocVersion, setDocVersion, docVersionMessage, DOC_FILE } from '../../scripts/release/dokumentation.mjs';
import { statusOf, setAcknowledged } from '../../src/app/modules/sgk/updatelogic.js';

const lit = (v) => ({ type: 'literal', value: v });
/** Ersatz des Endpunkts: antwortet je nach Abfrage (konsolidierte Fassungen, Sprachen, Akte). */
function fakeQuery(answers) {
  const calls = [];
  const q = async (sparql) => {
    calls.push(sparql);
    const base = /resource_legal_id_celex "([^"]+)"/.exec(sparql)?.[1];
    if (/act_consolidated_based_on_resource_legal/.test(sparql)) return (answers[base]?.cons || []).map(([c, d]) => ({ celex: lit(c), date: lit(d) }));
    if (/GROUP_CONCAT/.test(sparql) && /VALUES \?celex/.test(sparql)) {
      const list = [...sparql.matchAll(/"([^"]+)"\^\^xsd:string/g)].map((m) => m[1]);
      return list.map((c) => ({ celex: lit(c), langs: lit('DEU,FRA,ENG') }));
    }
    if (/resource_legal_corrects_resource_legal \?target ; cdm:resource_legal_id_celex/.test(sparql)) return [];
    if (/VALUES \?rel/.test(sparql)) {
      if (answers[base]?.fail) throw new Error('HTTP 503');
      return (answers[base]?.acts || []).map(([c, rel, d, title]) => ({ celex: lit(c), rel: { type: 'uri', value: 'http://publications.europa.eu/ontology/cdm#' + rel }, date: lit(d), ...(title ? { title: lit(title) } : {}) }));
    }
    return [];
  };
  q.calls = calls;
  return q;
}

const works = loadWorks();

test('Daten im Repo: fünf Werke, Data-Instanzen wie im Build', () => {
  assert.deepEqual(works.map((x) => x.w.id), ['sgk', 'ees', 'etias', 'vis', 'iop']);
  for (const { data } of works) assert.ok(data.stages.length > 0 && data.actList.length > 0);
});

test('Status wie im Tool: bekannte Fassung nichts, neue Fassung und neuer Akt gemeldet, ältere nicht erfasste Akte nicht', async () => {
  const sgkLatest = works[0].data.stages.at(-1).source.celex; // 02016R0399-20251012
  const q = fakeQuery({
    '32016R0399': { cons: [[sgkLatest, '2025-10-12'], ['02016R0399-20991231', '2099-12-31']], acts: [['32099R0001', 'resource_legal_amends_resource_legal', '2099-01-01', 'Verordnung 2099/1']] },
    '32017R2226': { cons: [], acts: [['32010R0001', 'resource_legal_amends_resource_legal', '2010-01-01']] },
    '32018R1240': { fail: true },
  });
  const res = await checkAll(works, q, { only: ['sgk', 'ees', 'etias'] });
  assert.equal(res.length, 3);
  const [sgk, ees, etias] = res;
  assert.deepEqual(sgk.rows.map((r) => [r.type, r.celex, r.status]), [['cons', '02016R0399-20991231', 'neu'], ['act', '32099R0001', 'neu']]);
  assert.deepEqual(sgk.rows[0].langs, ['de', 'fr', 'en']);
  assert.equal(ees.rows.length, 0, 'älterer, nicht erfasster Akt ist nicht «neu»');
  assert.match(etias.error, /503/);
  assert.deepEqual(itemKeys(res), ['sgk:02016R0399-20991231', 'sgk:32099R0001']);
});

test('Issue: Handlungsbedarf (Fassungen) getrennt von Information (Akte), Marker, Links, Fehler, Anleitung zur Kenntnisnahme', async () => {
  const q = fakeQuery({
    '32016R0399': { cons: [['02016R0399-20991231', '2099-12-31']], acts: [['52099PC0001', 'resource_legal_amends_resource_legal', '2099-01-01', 'Vorschlag']] },
    '32017R2226': { fail: true },
  });
  const res = await checkAll(works, q, { only: ['sgk', 'ees'], acknowledged: [] });
  const { title, body, keys } = issueBody(res, { now: new Date('2026-11-23T04:17:00Z'), repoUrl: 'https://github.com/org/repo', commit: 'abcdef1234567', acknowledgedCount: 2 });
  assert.equal(title, TITLE);
  assert.equal(TITLE, 'Neue Fassungen auf EUR-Lex');
  assert.ok(body.startsWith(`<!-- ${MARKER} {"items":["sgk:02016R0399-20991231","sgk:52099PC0001"]} -->`));
  assert.deepEqual(keysOfBody(body), keys);
  assert.match(body, /Geprüft am 23\. November 2026, 05:17 Uhr, Datenstand des Repositorys: Commit `abcdef1`/);
  const [cons, info] = body.split('## Handlungsbedarf')[1].split('## Zur Information');
  assert.match(body, /## Handlungsbedarf: neue konsolidierte Fassungen/);
  assert.match(cons, /\| SGK \| `02016R0399-20991231` \| 31\. Dezember 2099 \| neu \| \[DE\]\(https:\/\/eur-lex\.europa\.eu\/legal-content\/DE\/TXT\/HTML\/\?uri=CELEX:02016R0399-20991231\)/);
  assert.match(cons, /baut diese Fassungen selbst ein und eröffnet dazu einen Pull Request/);
  assert.doesNotMatch(cons, /52099PC0001/);
  assert.match(info, /\| SGK \| Änderungsakt \| `52099PC0001` \|/);
  assert.match(info, /https:\/\/github\.com\/org\/repo\/edit\/main\/data\/zur-kenntnis\.txt/);
  assert.match(info, /^ {3}52099PC0001 {2}SGK: Änderungsakt vom 1\. Januar 2099$/m);
  assert.match(body, /2 Einträge aus `data\/zur-kenntnis\.txt` sind zur Kenntnis genommen/);
  assert.match(issueBody(res, { acknowledgedCount: 1 }).body, /Ein Eintrag aus `data\/zur-kenntnis\.txt` ist zur Kenntnis genommen und hier nicht aufgeführt\./);
  assert.doesNotMatch(issueBody(res, { acknowledgedCount: 0 }).body, /zur Kenntnis genommen und hier nicht/);
  assert.match(body, /Nicht geprüft \(Fehler bei der Abfrage\): EES-VO \(HTTP 503\)/);
  assert.ok(!/ß/.test(body));
  assert.equal(keysOfBody('ohne Marker'), null);
  const b = befundOf(res, 'x');
  assert.deepEqual([b.cons.map((x) => x.celex), b.info.map((x) => x.celex), b.hasFindings], [['02016R0399-20991231'], ['52099PC0001'], true]);
  assert.equal(b.fingerprint, befundOf(res, 'x').fingerprint);
  assert.notEqual(b.fingerprint, befundOf(res, 'y').fingerprint, 'Zusatzangabe (Stand data/acts.json) ändert den Fingerabdruck');
  const onlyInfo = befundOf(res.map((r) => ({ ...r, rows: r.rows.filter((x) => x.type !== 'cons') })));
  assert.equal(onlyInfo.hasFindings, false, 'Akte allein lösen keinen Einbau aus');
});

test('Zur Kenntnis genommen: Datei lesen, Akt gilt in Prüfung und Werkzeug als bekannt, Fassungen nicht abstellbar', async () => {
  const k = parseKenntnis('# Kommentar\n\n52099PC0001  Vorschlag – gesehen\n32099R0001\nfalsch\n02016R0399-20991231 Fassung\n');
  assert.deepEqual(k.items.map((x) => [x.celex, x.note]), [['52099PC0001', 'Vorschlag – gesehen'], ['32099R0001', '']]);
  assert.deepEqual(k.errors.map((e) => e.line), [5, 6]);
  assert.deepEqual(parseKenntnis(readFileSync(new URL('../../data/zur-kenntnis.txt', import.meta.url), 'utf8')).errors, [], 'data/zur-kenntnis.txt ist lesbar');
  const q = fakeQuery({ '32016R0399': { cons: [['02016R0399-20991231', '2099-12-31']], acts: [['52099PC0001', 'resource_legal_amends_resource_legal', '2099-01-01']] } });
  const res = await checkAll(works, q, { only: ['sgk'], acknowledged: k.items });
  assert.deepEqual(res[0].rows.map((r) => r.celex), ['02016R0399-20991231']);
  const data = works[0].data;
  setAcknowledged(['52099PC0001']);
  const st = statusOf(data, { celex: '52099PC0001', date: '2099-01-01', kind: 'proposal' }, 'act');
  assert.deepEqual([st.known, st.acknowledged, st.label], [true, true, 'zur Kenntnis genommen']);
  setAcknowledged([]);
  assert.equal(statusOf(data, { celex: '52099PC0001', date: '2099-01-01', kind: 'proposal' }, 'act').known, false);
});

test('Einbau SGK: Akt aus der Liste der Änderungsakte, nächster Stand, Herkunftsangabe', () => {
  const r = (...c) => c.map((celex) => ({ celex }));
  const prev = { de: r('32016R0399', '32024R1717'), fr: r('32016R0399', '32024R1717'), en: r('32016R0399', '32024R1717') };
  const neu = { de: r('32016R0399', '32024R1717', '32025D1544', '32024R1717R(01)'), fr: r('32016R0399', '32024R1717', '32025D1544'), en: r('32016R0399', '32024R1717', '32025D1544') };
  assert.deepEqual(sgkActOf(neu, prev), { act: '32024R1717R(01)', newActs: ['32025D1544', '32024R1717R(01)'], etiasConsolidated: false });
  assert.equal(sgkActOf(prev, prev).act, null);
  assert.equal(sgkActOf({ de: r('32018R1240', '32099R0001') }, prev).etiasConsolidated, true);
  assert.equal(nextStageId(['s07', 's08']), 's09');
  assert.equal(nextStageId(['s07']), 's08');
  assert.match(sgkNote('2026-12-01', true).de, /^Konsolidierte Fassung vom 1\.12\.2026 von EUR-Lex; ergänzt um Art\. 80 der Verordnung \(EU\) 2018\/1240\.$/);
  assert.deepEqual(Object.keys(sgkNote('2026-12-01', false)), ['de', 'fr', 'en']);
});

test('Einbau: geänderte Bestimmungen je Sprache, geänderte bisherige Stände', () => {
  const v = (stage, label, t) => ({ stage, label, blocks: [{ k: 'p1', t }] });
  const before = { langs: ['de'], stages: [{ id: 's00' }], toc: [{ id: 'art_1' }, { id: 'art_2' }], units: { art_1: { versions: { de: [v('s00', 'Artikel 1', 'a')] } }, art_2: { versions: { de: [v('s00', 'Artikel 2', 'b')] } } } };
  const after = JSON.parse(JSON.stringify(before));
  after.stages.push({ id: 's01' });
  after.units.art_2.versions.de.push(v('s01', 'Artikel 2', 'c'));
  assert.deepEqual(stageChanges(after, 's01'), { de: ['Artikel 2'] });
  assert.deepEqual(changedOldStages(before, after), []);
  after.units.art_1.versions.de[0].blocks[0].t = 'x';
  assert.deepEqual(changedOldStages(before, after), [{ stage: 's00', lang: 'de', units: ['Artikel 1'] }]);
});

test('Prüfberichte: bestanden, Hinweis bei gestiegener Zahl, nicht bestanden bei fehlendem Wortlaut', () => {
  const cov = (c) => [{ stage: 's00', coverage: c }];
  const sgk = (c, ud = 0) => ({ coverage: cov(c), coverageDs: cov(1), coverageDsPatched: [], actText: [{ bad: [] }], lang: [], stageDiff: Array.from({ length: ud }, () => ({ expected: false, explained: null })) });
  const w = (c) => ({ works: { ees: { coverage: cov(c), coverageDs: cov(1), changes: { unexplainedWithoutDefect: 0 }, lang: [] } }, budget: { gzTotal: 1e6, ok: true } });
  const ok = judgeValidation({ sgk: sgk(1), works: w(1) }, { sgk: sgk(1), works: w(1) });
  assert.equal(ok.passed, true);
  assert.ok(ok.rows.every((r) => r.verdict === 'ok'));
  const hint = judgeValidation({ sgk: sgk(1, 2), works: w(1) }, { sgk: sgk(1, 3), works: w(1) });
  assert.equal(hint.passed, true);
  assert.equal(hint.rows.find((r) => /ohne Erklärung/.test(r.label)).verdict, 'hinweis');
  const bad = judgeValidation({ sgk: sgk(1), works: w(1) }, { sgk: sgk(0.99), works: w(1) });
  assert.equal(bad.passed, false);
  assert.equal(judgeValidation({ sgk: null, works: w(1) }, { sgk: { ...sgk(1), reverseSkipped: ['32099R0001'] }, works: w(1) }).rows.find((r) => /Umkehr/.test(r.label)).verdict, 'hinweis');
});

test('Pull Request: Zustände ok, Fachangaben, Fehler; Fingerabdruck; kein doppelter Pull Request; Probelauf', () => {
  const e = {
    fingerprint: 'abc123', today: '2026-12-07', versionBefore: '2026.11.24', version: '2026.12.07', subject: 'SGK-Navigator 2026.12.07: SGK-Fassung vom 1. Dezember 2026 nachgeführt',
    cons: [{ abbr: 'SGK', celex: '02016R0399-20261201', date: '2026-12-01' }], issue: 5, issueHasInfo: false, changelog: '- SGK: …',
    works: [{ abbr: 'SGK', expected: ['02016R0399-20261201'], newStages: [{ stage: 's09', celex: '02016R0399-20261201', date: '2026-12-01', act: '32026R0001', langs: { de: ['Artikel 8'], fr: ['Article 8'], en: ['Article 8'] }, note: { de: 'Konsolidierte Fassung …' } }] }],
    foreign: [], validation: { passed: true, rows: [{ label: 'SGK: Wortlaut', before: '100,00 %', after: '100,00 %', verdict: 'ok' }] }, fachangaben: [],
  };
  const tests = { results: [{ label: 'Kern', ok: true, counts: { pass: 3, fail: 0 } }] };
  const a = prText(e, tests);
  assert.equal(a.status, 'ok');
  assert.equal(a.title, e.subject);
  assert.ok(a.body.startsWith(`<!-- ${FP_MARK}: abc123 -->\n<!-- ${STATUS_MARK}: ok -->`));
  for (const h of ['## Befund', '## Text im Changelog', '## Was sich ändert', '## Prüfberichte', '## Übrige Stände', '## Tests', '## So prüfst du diesen Pull Request']) assert.ok(a.body.includes(h), h);
  assert.match(a.body, /- Deutsch: Artikel 8/);
  assert.match(a.body, /Alle bisherigen Stände aller Rechtsakte sind inhaltlich unverändert/);
  assert.match(a.body, /\nCloses #5\n$/);
  assert.ok(!/Nicht zusammenführen/.test(a.body));
  const f = prText({ ...e, issueHasInfo: true, fachangaben: [{ kind: 'acts', title: 'Eintrag für den Akt 32026R0001', text: 'fehlt', task: 'Erfasse den Akt 32026R0001 in acts.json …' }] }, tests);
  assert.equal(f.status, 'fachangaben');
  assert.equal(f.failed, false);
  assert.match(f.body, /Nicht zusammenführen, bevor die Fachangaben ergänzt sind/);
  assert.match(f.body, /## Von dir zu liefern[\s\S]*```\nErfasse den Akt 32026R0001/);
  assert.match(f.body, /Bezug: #5/);
  const c = prText({ ...e, fachangaben: [{ kind: 'check', title: 'Mehrere neue Akte', text: 'prüfen' }] }, tests);
  assert.equal(c.status, 'ok', 'ein Prüfhinweis macht keinen Entwurf');
  assert.match(c.body, /## Besonders zu prüfen/);
  const x = prText({ ...e, foreign: [{ abbr: 'EES-VO', stage: 's02', lang: 'fr', units: ['Article 9'] }] }, { results: [{ label: 'Kern', ok: false, tail: 'not ok 1' }] });
  assert.equal(x.status, 'fehler');
  assert.match(x.body, /\*\*Nicht zusammenführen\.\*\*/);
  assert.match(x.body, /Test fehlgeschlagen: Kern/);
  assert.match(x.body, /\*\*Warnung:\*\* EES-VO, Stand s02, Französisch: Article 9/);
  const fe = prText({ ...e, error: 'HTTP 503', step: 'Daten bauen', works: [], validation: null, foreign: null }, null);
  assert.equal(fe.status, 'fehler');
  assert.match(fe.body, /Einbau gescheitert im Schritt «Daten bauen»: HTTP 503/);
  const p = prText(e, tests, { probelauf: true });
  assert.ok(p.title.startsWith('Probelauf: '));
  assert.ok(!/Closes/.test(p.body));
  // Kein doppelter Pull Request: gleicher Befund ohne Fehler bleibt stehen (auch ein Entwurf mit Fachangaben)
  assert.equal(planPr(null, 'abc123'), 'create');
  assert.equal(planPr({ body: a.body }, 'abc123'), 'skip');
  assert.equal(planPr({ body: f.body }, 'abc123'), 'skip');
  assert.equal(planPr({ body: x.body }, 'abc123'), 'update');
  assert.equal(planPr({ body: a.body }, 'def456'), 'update');
  assert.deepEqual(changelogLines(e.works), ['SGK: konsolidierte Fassung vom 1. Dezember 2026 (`02016R0399-20261201`) als Stand s09 eingebaut; eine Bestimmung geändert.']);
  assert.equal(commitSubject('2026.12.07', [...e.works, { abbr: 'EES-VO', newStages: [{ date: '2026-12-01' }] }]), 'SGK-Navigator 2026.12.07: SGK-Fassung vom 1. Dezember 2026 und EES-VO-Fassung vom 1. Dezember 2026 nachgeführt');
  assert.deepEqual(testCounts('ℹ pass 5\nℹ fail 0\nℹ skipped 2\n'), { pass: 5, fail: 0, skipped: 2 });
  assert.deepEqual(testCounts('  104 passed (4.3m)\n'), { pass: 104 });
});

test('Changelog: Version zuoberst, Schema, Reihenfolge, Abschnitt mit Französisch, neue Version am selben Tag', () => {
  const md = '# Änderungen\n\nEinleitung.\n\n## 2026.12.02 (2. Dezember 2026)\n\n- Neu: `x`.\n\n### Français\n\n- Nouveau.\n\n## 2026.11.18 (18. November 2026)\n\n- Erste.\n';
  assert.deepEqual(checkChangelog(md), { ok: true, version: '2026.12.02', errors: [] });
  assert.deepEqual(changelogSection(md, '2026.12.02'), { de: '- Neu: `x`.', fr: '- Nouveau.' });
  assert.equal(changelogSection(md, '2026.11.18').fr, null);
  assert.equal(plainNotes('- Neu: `x`.\n- **Zwei** [Link](https://a)'), 'Neu: x. Zwei Link');
  assert.match(checkChangelog(md.replace('2026.12.02', '2026.11.01')).errors.join(), /muss neuer sein/);
  assert.match(checkChangelog(md.replace('2026.12.02', '2026-12-02')).errors.join(), /hat nicht die Form JJJJ\.MM\.TT/);
  assert.match(checkChangelog('# Änderungen\n').errors.join(), /kein Abschnitt/);
  assert.match(checkChangelog(md.replace('- Neu: `x`.\n\n### Français\n\n- Nouveau.\n', '')).errors.join(), /ist leer/);
  const ins = insertChangelog(md, '2026.12.07', '7. Dezember 2026', ['SGK: neu.']);
  assert.equal(latestVersion(ins), '2026.12.07');
  assert.ok(ins.indexOf('Einleitung.') < ins.indexOf('## 2026.12.07'));
  assert.equal(nextVersion('2026-12-07', ['2026.12.02']), '2026.12.07');
  assert.equal(nextVersion('2026-12-07', ['2026.12.07', '2026.12.07-2']), '2026.12.07-3');
  const repo = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8');
  assert.deepEqual(checkChangelog(repo).errors, [], 'CHANGELOG.md im Repository ist gültig');
});

test('Produktdokumentation: Versionsangaben finden, prüfen, setzen; Meldung mit Datei, Zeile, Behebung', () => {
  const html = '<title>X (v2026.11.18)</title>\n<span>Version 2026.11.18 · Datenstand</span><span>Versione 2026.11.18</span>\n<p>(version 2026.11.18) (Tag v2026.11.18) am 2026.11.18</p>';
  const r = checkDocVersion(html, '2026.12.02');
  assert.equal(r.ok, false);
  assert.equal(r.found, 5);
  assert.deepEqual(r.wrong.map((w) => w.line), [1, 2, 2, 3, 3]);
  const msg = docVersionMessage(r, '2026.12.02');
  assert.ok(msg.startsWith(`${DOC_FILE}: Die Versionsangabe passt nicht zur Version in CHANGELOG.md (2026.12.02).`));
  assert.match(msg, /Zeile 2: nennt 2026\.11\.18 statt 2026\.12\.02/);
  assert.match(msg, /Behebung: Ein Agent führt «node scripts\/check-dokumentation\.mjs --fix» aus/);
  const fixed = setDocVersion(html, '2026.12.02');
  assert.deepEqual(checkDocVersion(fixed, '2026.12.02'), { ok: true, found: 5, wrong: [] });
  assert.match(fixed, /am 2026\.11\.18<\/p>/, 'Daten ohne Bezug zur Version bleiben');
  assert.throws(() => setDocVersion('<p>ohne</p>', '2026.12.02'), /keine Versionsangabe/);
  const doc = readFileSync(new URL('../../' + DOC_FILE, import.meta.url), 'utf8');
  const repo = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8');
  assert.equal(checkDocVersion(doc, latestVersion(repo)).ok, true, 'Produktdokumentation nennt die Version aus CHANGELOG.md');
});

test('fetchQuery: JSON-Ergebnis, Wiederholung nach Fehler, Fehler nach drei Versuchen', async () => {
  let n = 0;
  const ok = { ok: true, status: 200, json: async () => ({ results: { bindings: [{ x: lit('1') }] } }) };
  const f1 = async (url, init) => { n++; assert.match(url, /^https:\/\/publications\.europa\.eu\/webapi\/rdf\/sparql\?query=.+&format=json$/); assert.equal(init.headers.Accept, 'application/sparql-results+json'); if (n === 1) throw new Error('ECONNRESET'); return ok; };
  assert.deepEqual(await fetchQuery({ fetchFn: f1, waitMs: 1 })('SELECT 1'), [{ x: lit('1') }]);
  assert.equal(n, 2);
  const f2 = async () => ({ ok: false, status: 500, json: async () => ({}) });
  await assert.rejects(fetchQuery({ fetchFn: f2, waitMs: 1 })('SELECT 1'), /HTTP 500/);
  const f3 = async () => ({ ok: true, status: 200, json: async () => ({ fehler: 1 }) });
  await assert.rejects(fetchQuery({ fetchFn: f3, waitMs: 1, tries: 1 })('SELECT 1'), /results\.bindings/);
});
