// Einheitstests der wöchentlichen Fassungsprüfung (scripts/check-fassungen.mjs, scripts/fassungen/lib.mjs): Abfragen
// gemockt (kein Netz), Status gegen die Daten im Repo wie im Tool, Text des Issues, Marker, Wiederholungen bei Fehlern.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorks, checkAll, issueBody, keysOfBody, itemKeys, fetchQuery, MARKER, TITLE } from '../../scripts/fassungen/lib.mjs';

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

test('Issue: Titel, Marker mit Schlüsseln, Tabelle mit EUR-Lex-Links, Hinweis auf Fehler, Anleitung', async () => {
  const q = fakeQuery({ '32016R0399': { cons: [['02016R0399-20991231', '2099-12-31']] }, '32017R2226': { fail: true } });
  const res = await checkAll(works, q, { only: ['sgk', 'ees'] });
  const { title, body, keys } = issueBody(res, { now: new Date('2026-11-23T04:17:00Z'), repoUrl: 'https://github.com/org/repo', commit: 'abcdef1234567' });
  assert.equal(title, TITLE);
  assert.ok(body.startsWith(`<!-- ${MARKER} {"items":["sgk:02016R0399-20991231"]} -->`));
  assert.deepEqual(keysOfBody(body), keys);
  assert.match(body, /Geprüft am 23\. November 2026, 05:17 Uhr, Datenstand des Repos: Commit `abcdef1`/);
  assert.match(body, /\| SGK \| Konsolidierte Fassung \| `02016R0399-20991231` \| 31\. Dezember 2099 \| neu \| \[DE\]\(https:\/\/eur-lex\.europa\.eu\/legal-content\/DE\/TXT\/HTML\/\?uri=CELEX:02016R0399-20991231\) · \[FR\]/);
  assert.match(body, /Nicht geprüft \(Fehler bei der Abfrage\): EES-VO \(HTTP 503\)/);
  assert.match(body, /https:\/\/github\.com\/org\/repo\/blob\/main\/MAINTAINING\.md#neue-fassung-einbauen/);
  assert.ok(!/ß/.test(body));
  assert.equal(keysOfBody('ohne Marker'), null);
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
