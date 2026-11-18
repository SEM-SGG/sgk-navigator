// Einheitstests Aktualisieren: JSONP-Transport (simuliertes document/script), Zuordnung CELEX -> Werk,
// Statuslogik für ein anderes Werk als den SGK (EES-VO), Dekodierung gespeicherter HTML-Dateien.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerStrings, withUiLang } from '../../src/app/lib/i18n.js';
import de from '../../src/app/i18n/de.js';
import fr from '../../src/app/i18n/fr.js';
import { jsonp, MAX_PARALLEL } from '../../src/app/lib/sparql.js';
import { assignWork, statusOf, rowsForWork, countAttention, isPartial, stageOfActIn } from '../../src/app/modules/sgk/updatelogic.js';
import { decodeHtml, isMhtml } from '../../src/app/lib/decode.js';

registerStrings('de', de);
registerStrings('fr', fr);
const read = (p) => JSON.parse(readFileSync(new URL('../../' + p, import.meta.url)));

// ------------------------------------------------------------------ JSONP
function fakeEnv() {
  const window = {};
  const appended = [];
  const head = {
    children: [],
    appendChild(el) { el.parentNode = head; head.children.push(el); appended.push(el); },
    removeChild(el) { head.children = head.children.filter((x) => x !== el); el.parentNode = null; },
  };
  const document = { head, createElement: (tag) => ({ tagName: tag.toUpperCase(), parentNode: null }) };
  return { window, document, head, appended };
}
const cbName = (el) => new URL(el.src).searchParams.get('callback');
const URL0 = 'https://publications.europa.eu/webapi/rdf/sparql?query=SELECT&format=json';

test('JSONP: Erfolg liefert die Antwort, Script und Callback werden entfernt', async () => {
  const env = fakeEnv();
  const p = jsonp(URL0, 1000, env);
  assert.equal(env.appended.length, 1);
  const el = env.appended[0];
  assert.equal(el.tagName, 'SCRIPT');
  assert.ok(el.src.startsWith(URL0 + '&callback='), el.src);
  const name = cbName(el);
  assert.match(name, /^[A-Za-z_$][\w$]*$/);
  assert.equal(typeof env.window[name], 'function');
  const answer = { head: { vars: [] }, results: { bindings: [{ celex: { value: 'x' } }] } };
  env.window[name](answer);
  if (el.onload) el.onload(); // Browser: load nach Ausführung des Skripts
  assert.deepEqual(await p, answer);
  assert.equal(env.head.children.length, 0);
  assert.ok(!(name in env.window));
  assert.equal(el.onload, null);
  assert.equal(el.onerror, null);
});

test('JSONP: eindeutiger Callback-Name je Aufruf', async () => {
  const env = fakeEnv();
  const ps = [jsonp(URL0, 1000, env), jsonp(URL0, 1000, env), jsonp(URL0, 1000, env)];
  const names = env.appended.map(cbName);
  assert.equal(new Set(names).size, 3);
  names.forEach((n) => env.window[n]({ results: { bindings: [] } }));
  await Promise.all(ps);
  assert.equal(Object.keys(env.window).length, 0);
});

test('JSONP: Ladefehler -> update.err.offline, aufgeräumt', async () => {
  const env = fakeEnv();
  const p = jsonp(URL0, 1000, env);
  const el = env.appended[0];
  const name = cbName(el);
  el.onerror();
  await assert.rejects(p, /Keine Verbindung zum Endpunkt/);
  assert.equal(env.head.children.length, 0);
  assert.ok(!(name in env.window));
});

test('JSONP: Antwort ohne results.bindings oder ohne Callback-Aufruf -> Formatfehler', async () => {
  const env = fakeEnv();
  const p1 = jsonp(URL0, 1000, env);
  env.window[cbName(env.appended[0])]({ results: { bindings: 'kein Array' } });
  await assert.rejects(p1, /keine gültige Antwort/);
  const p2 = jsonp(URL0, 1000, env);
  env.appended[1].onload(); // Skript geladen, Callback nie aufgerufen (z. B. Fehlerseite)
  await assert.rejects(p2, /keine gültige Antwort/);
  const p3 = jsonp(URL0, 1000, env);
  env.window[cbName(env.appended[2])](null);
  await assert.rejects(p3, /keine gültige Antwort/);
  assert.equal(env.head.children.length, 0);
  assert.equal(Object.keys(env.window).length, 0);
});

test('JSONP: Zeitüberschreitung -> update.err.timeout, verspätete Antwort ignoriert, Platzhalter danach entfernt', async () => {
  const env = fakeEnv();
  env.graceMs = 40;
  const p = jsonp(URL0, 20, env);
  const el = env.appended[0];
  const name = cbName(el);
  await assert.rejects(p, /Zeitüberschreitung/);
  assert.equal(env.head.children.length, 0, 'Script entfernt');
  assert.equal(el.onload, null);
  // verspätete Antwort: kein Fehler, keine Wirkung
  assert.equal(typeof env.window[name], 'function');
  assert.doesNotThrow(() => env.window[name]({ results: { bindings: [] } }));
  assert.ok(!(name in env.window), 'Platzhalter entfernt sich beim Aufruf');
  // ohne verspätete Antwort: Platzhalter nach graceMs entfernt
  const p2 = jsonp(URL0, 10, env);
  const n2 = cbName(env.appended[1]);
  await assert.rejects(p2, /Zeitüberschreitung/);
  assert.equal(typeof env.window[n2], 'function');
  await new Promise((r) => setTimeout(r, 70));
  assert.ok(!(n2 in env.window));
});

test('JSONP: Meldungen in der Oberflächensprache, Parallelität begrenzt', async () => {
  const env = fakeEnv();
  const p = withUiLang('fr', () => jsonp(URL0, 1000, env));
  withUiLang('fr', () => env.appended[0].onerror());
  await assert.rejects(p, /Pas de connexion/);
  assert.ok(MAX_PARALLEL >= 2 && MAX_PARALLEL <= 3);
});

// ------------------------------------------------------------------ Zuordnung CELEX -> Werk
const index = read('data/works/index.json');
test('Zuordnung CELEX -> Werk der Bibliothek', () => {
  const cases = {
    '32016R0399': 'sgk', '02016R0399-20251012': 'sgk', '32016R0399R(08)': 'sgk',
    '02017R2226-20260612': 'ees', '32017R2226': 'ees', '32017R2226R(03)': 'ees',
    '02018R1240-20251118': 'etias', '32018R1240R(06)': 'etias',
    '02008R0767-20260612': 'vis', '32008R0767': 'vis',
    '02019R0817-20250128': 'iop', '32019R0817': 'iop',
    ' 02017r2226-20260612 ': 'ees',
  };
  for (const [c, w] of Object.entries(cases)) assert.equal(assignWork(index, c), w, c);
  for (const c of ['32017R2225', '32024R1356', '02016R1624-20200101', '', null, 'Notiz']) assert.equal(assignWork(index, c), null, String(c));
});

// ------------------------------------------------------------------ Statuslogik für die EES-VO
function mockData(id) {
  const ds = read(`data/works/${id}.dataset.json`);
  const acts = read(`data/works/${id}.acts.json`);
  const actList = Array.isArray(acts) ? acts : acts.acts;
  const stages = ds.stages.map((s, i) => ({ ...s, order: typeof s.order === 'number' ? s.order : i })).sort((a, b) => a.order - b.order);
  const stageOfAct = new Map();
  for (const s of stages) if (s.act && !stageOfAct.has(s.act)) stageOfAct.set(s.act, s.id);
  const m = new Map(actList.map((a) => [a.celex, a]));
  return { workId: id, work: ds.work, langs: ds.langs, stages, actList, act: (c) => m.get(c) || null, stageOfAct };
}

test('Status gegen die Daten der EES-VO (nicht SGK), inklusive Uploads dieses Werks', () => {
  const d = mockData('ees');
  const s1 = statusOf(d, { celex: '02017R2226-20260612', date: '2026-06-12' }, 'cons', []);
  assert.equal(s1.known, true);
  assert.match(s1.label, /im Datensatz \(Stand s04\)/);
  const s2 = statusOf(d, { celex: '02017R2226-20270115', date: '2027-01-15' }, 'cons', []);
  assert.equal(s2.known, false);
  assert.deepEqual(s2.missing, ['de', 'fr', 'en']);
  // SGK-Fassung desselben Datums ist für die EES-VO nicht «im Datensatz»
  assert.equal(statusOf(d, { celex: '02016R0399-20260612' }, 'cons', []).known, false);
  // Upload der neuen Fassung (DE): bekannt, aber unvollständig
  const up = [{ work: 'ees', celex: '02017R2226-20270115', lang: 'de' }];
  const s3 = statusOf(d, { celex: '02017R2226-20270115' }, 'cons', up);
  assert.equal(s3.known, true);
  assert.ok(isPartial(s3));
  assert.match(s3.label, /hochgeladen.*fehlt: FR, EN/);
  // Akte: Änderungsakt mit Stand, Berichtigung in stage.acts (nicht stage.act), neu, älter und nicht erfasst
  assert.match(statusOf(d, { celex: '32024R1356', kind: 'amendment', date: '2024-05-22' }, 'act').label, /Stand s04/);
  assert.equal(stageOfActIn(d, '32017R2226R(01)'), 's01');
  assert.match(statusOf(d, { celex: '32017R2226R(01)', kind: 'corrigendum', date: '2018-10-15', langs: ['de'] }, 'act').label, /Stand s01/);
  const sNew = statusOf(d, { celex: '32026R0101', kind: 'amendment', date: '2026-10-01' }, 'act');
  assert.equal(sNew.known, false);
  assert.equal(sNew.label, 'neu');
  const sOld = statusOf(d, { celex: '32015R0001', kind: 'amendment', date: '2015-01-01' }, 'act');
  assert.equal(sOld.unlisted, true);
  const sMt = statusOf(d, { celex: '32017R2226R(09)', kind: 'corrigendum', date: '2026-10-01', langs: [], langs3: ['MLT'] }, 'act');
  assert.equal(sMt.irrelevant, true);
  assert.match(sMt.label, /betrifft nur MLT/);
  // Sprachfassungen aus der Prüfung: nur ES vorhanden -> nicht ladbar; nur DE -> neu, nur DE verlinkt
  const sEs = statusOf(d, { celex: '02017R2226-20231231', date: '2023-12-31', langs3: [], langs: [] }, 'cons', []);
  assert.equal(sEs.known, true);
  assert.equal(sEs.irrelevant, true);
  assert.equal(sEs.label, 'nicht in DE, FR, EN verfügbar');
  const sDe = statusOf(d, { celex: '02017R2226-20270201', date: '2027-02-01', langs3: ['DEU'], langs: ['de'] }, 'cons', []);
  assert.equal(sDe.known, false);
  assert.deepEqual(sDe.missing, ['de']);
  assert.equal(sDe.label, 'neu, nur DE');
  assert.equal(countAttention(rowsForWork({ consolidated: [{ celex: '02017R2226-20231231', date: '2023-12-31', langs3: [], langs: [] }], acts: [] }, d, [])), 0);
  // Zeilen der gemeinsamen Tabelle
  const res = {
    consolidated: [{ celex: '02017R2226-20260612', date: '2026-06-12' }, { celex: '02017R2226-20270115', date: '2027-01-15' }],
    acts: [{ celex: '32024R1356', kind: 'amendment', date: '2024-05-22' }, { celex: '32026R0101', kind: 'amendment', date: '2026-10-01' }],
  };
  const rows = rowsForWork(res, d, []);
  assert.deepEqual(rows.map((r) => r.celex), ['02017R2226-20270115', '32026R0101', '02017R2226-20260612', '32024R1356']);
  assert.equal(countAttention(rows), 2);
  assert.deepEqual(rows[0].langs, ['de', 'fr', 'en']);
  const rowsUp = rowsForWork(res, d, up);
  assert.deepEqual(rowsUp[0].langs, ['fr', 'en'], 'nur fehlende Sprachen verlinkt');
  assert.equal(countAttention(rowsUp), 2, 'unvollständig zählt weiter');
  const full = ['de', 'fr', 'en'].map((lang) => ({ work: 'ees', celex: '02017R2226-20270115', lang }));
  assert.equal(countAttention(rowsForWork(res, d, full)), 1);
});

// ------------------------------------------------------------------ Dekodierung gespeicherter Dateien
test('Gespeicherte HTML-Datei: UTF-8, BOM, UTF-16, windows-1252 mit meta charset; MHTML erkannt', () => {
  const s = '<html><head><meta charset="utf-8"></head><body><p>Grenzübertritt — Prüfung ►M1</p></body></html>';
  const utf8 = new TextEncoder().encode(s);
  assert.equal(decodeHtml(utf8), s);
  assert.equal(decodeHtml(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8])), s);
  const u16 = new Uint8Array(2 + s.length * 2);
  u16[0] = 0xff; u16[1] = 0xfe;
  for (let i = 0; i < s.length; i++) { u16[2 + i * 2] = s.charCodeAt(i) & 0xff; u16[3 + i * 2] = s.charCodeAt(i) >> 8; }
  assert.equal(decodeHtml(u16), s);
  const l1 = '<html><head><meta http-equiv="Content-Type" content="text/html; charset=windows-1252"></head><body>Grenzübertritt</body></html>';
  const b = new Uint8Array([...l1].map((c) => c.charCodeAt(0)));
  assert.equal(decodeHtml(b), l1);
  assert.ok(isMhtml('From: <Saved by Blink>\nSnapshot-Content-Location: https://eur-lex.europa.eu/\nMIME-Version: 1.0\nContent-Type: multipart/related;\n'));
  assert.ok(!isMhtml(s));
});

// ------------------------------------------------------------------ Texte
import deRa from '../../src/app/i18n/de-ra.js';
import frRa from '../../src/app/i18n/fr-ra.js';
test('Texte Aktualisieren: kein ß, keine Ausrufezeichen, FR mit geschützten Leerzeichen (de.js, fr.js, Anleitung in de-ra.js, fr-ra.js)', () => {
  const sde = JSON.stringify([de.update, de.upload, deRa.guide.task.aktualisieren]);
  assert.ok(!sde.includes('ß'));
  assert.ok(!/!/.test(sde.replace(/\[\[|\]\]/g, '')));
  assert.ok(!/\b(einfach|bitte|schnell)\b/i.test(sde));
  const g = frRa.guide.task.aktualisieren;
  for (const v of [g.title, ...g.steps, g.after]) {
    assert.ok(!/ [:;?!]/.test(v), v);
    assert.ok(!/« | »/.test(v), v);
  }
  assert.equal(de.update.all.how, 'Link öffnen, Seite mit Ctrl+S als Webseite (nur HTML) speichern, Dateien hier ablegen.');
  assert.ok(deRa.guide.task.aktualisieren.after.includes('JSONP'));
});
