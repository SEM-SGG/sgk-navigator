// Einheitstests: Hinweis auf neue Versionen (src/app/lib/updatecheck.js) und Prüfung gespeicherter Uploads gegen den
// eingebetteten Datensatz (src/app/lib/storedplan.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseVersion, compareVersions, isNewer, versionOfBuild, sourceInfo, parseAnswer, fetchLatest, autoCheckDue, shouldShow, remindLater } from '../../src/app/lib/updatecheck.js';
import { planStored, hadEffect, stageOfFassung } from '../../src/app/lib/storedplan.js';
import { DEFAULT_UPDATE_SOURCE, PROJECT } from '../../src/app/config/update-source.js';
import de from '../../src/app/i18n/de.js';
import fr from '../../src/app/i18n/fr.js';

// ------------------------------------------------------------------ Versionen
test('Version: Schema JJJJ.MM.TT[-n], «v» erlaubt, numerischer Vergleich, unlesbar nie neuer', () => {
  assert.deepEqual(parseVersion('v2026.12.12'), { y: 2026, m: 12, d: 12, n: 1, date: '2026-12-12', text: '2026.12.12' });
  assert.equal(parseVersion('2026.1.5-3').text, '2026.01.05-3');
  for (const bad of ['', null, '1.2.3', '2026-12-12', '2026.13.01', '2026.12.32', 'latest', 'v2026.12']) assert.equal(parseVersion(bad), null, String(bad));
  assert.ok(compareVersions('2026.12.12', '2026.11.18') > 0);
  assert.ok(compareVersions('2026.11.18-2', '2026.11.18') > 0);
  assert.ok(compareVersions('2026.11.18-1', '2026.11.18') === 0);
  assert.ok(compareVersions('2026.2.1', '2026.10.1') < 0); // numerisch, nicht als Text
  assert.ok(compareVersions('v2027.01.01', '2026.12.31') > 0);
  assert.equal(compareVersions('x', '2026.11.18'), null);
  assert.equal(isNewer('2026.11.18', '2026.11.18'), false);
  assert.equal(isNewer('2026.11.17', '2026.11.18'), false);
  assert.equal(isNewer('kaputt', '2026.11.18'), false);
  assert.equal(isNewer('2026.12.12', null), false);
  assert.equal(versionOfBuild(new Date('2026-11-18T23:30:00Z')), '2026.11.19'); // Europe/Zurich
  assert.equal(versionOfBuild(new Date('2026-11-18T10:00:00Z'), 2), '2026.11.18-2');
});

test('Quelle: leer = aus; github-release und manifest; nur https; Vorgabe des Nutzers', () => {
  assert.equal(sourceInfo(null), null);
  assert.equal(sourceInfo({ kind: '' }), null);
  assert.equal(sourceInfo({ kind: 'github-release', owner: '', repo: '' }), null);
  assert.equal(sourceInfo({ kind: 'github-release', owner: 'a b', repo: 'x' }), null);
  assert.equal(sourceInfo({ kind: 'manifest', url: 'http://example.org/v.json' }), null);
  assert.equal(sourceInfo({ kind: 'anders', url: 'https://x' }), null);
  const g = sourceInfo({ kind: 'github-release', owner: 'org', repo: 'sgk-navigator', asset: 'SGK-Navigator.html' });
  assert.equal(g.endpoint, 'https://api.github.com/repos/org/sgk-navigator/releases/latest');
  assert.equal(g.origin, 'https://api.github.com');
  const m = sourceInfo({ kind: 'manifest', url: 'https://raw.githubusercontent.com/org/repo/main/version.json' });
  assert.equal(m.origin, 'https://raw.githubusercontent.com');
  // Vorgabe: Manifest auf GitHub Pages der Organisation SEM-SGG, ersatzweise Releases-API
  assert.deepEqual(DEFAULT_UPDATE_SOURCE, { kind: 'manifest', url: 'https://sem-sgg.github.io/sgk-navigator/version.json', page: 'https://sem-sgg.github.io/sgk-navigator/', fallback: { kind: 'github-release', owner: 'SEM-SGG', repo: 'sgk-navigator', asset: 'SGK-Navigator.html' } });
  const d = sourceInfo(DEFAULT_UPDATE_SOURCE);
  assert.equal(d.endpoint, 'https://sem-sgg.github.io/sgk-navigator/version.json');
  assert.equal(d.fallback.endpoint, 'https://api.github.com/repos/SEM-SGG/sgk-navigator/releases/latest');
  assert.deepEqual(d.origins, ['https://sem-sgg.github.io', 'https://api.github.com']);
  assert.equal(d.fallback.fallback, undefined);
  assert.deepEqual(m.origins, ['https://raw.githubusercontent.com']);
  // ungültige Ersatzquelle wird ignoriert
  assert.deepEqual(sourceInfo({ kind: 'manifest', url: 'https://example.org/v.json', fallback: { kind: 'github-release', owner: '', repo: '' } }).origins, ['https://example.org']);
  assert.deepEqual(PROJECT, { owner: 'SEM-SGG', repo: 'sgk-navigator', asset: 'SGK-Navigator.html', page: 'https://sem-sgg.github.io/sgk-navigator/', source: 'https://github.com/SEM-SGG/sgk-navigator', issues: 'https://github.com/SEM-SGG/sgk-navigator/issues/new/choose', releases: 'https://github.com/SEM-SGG/sgk-navigator/releases', latest: 'https://github.com/SEM-SGG/sgk-navigator/releases/latest/download/SGK-Navigator.html' });
});

test('Antwort: GitHub-Release (Asset, sonst Release-Seite; Entwurf/Vorabversion abgewiesen) und Manifest', () => {
  const g = sourceInfo({ kind: 'github-release', owner: 'org', repo: 'r', asset: 'SGK-Navigator.html' });
  const rel = { tag_name: 'v2026.12.12', html_url: 'https://github.com/org/r/releases/tag/v2026.12.12', assets: [{ name: 'andere.zip', browser_download_url: 'https://github.com/org/r/releases/download/v2026.12.12/andere.zip' }, { name: 'SGK-Navigator.html', browser_download_url: 'https://github.com/org/r/releases/download/v2026.12.12/SGK-Navigator.html' }] };
  assert.deepEqual(parseAnswer(g, rel), { version: '2026.12.12', date: '2026-12-12', url: 'https://github.com/org/r/releases/download/v2026.12.12/SGK-Navigator.html', notes: null, page: rel.html_url });
  assert.equal(parseAnswer(g, { ...rel, assets: [] }).url, rel.html_url);
  assert.equal(parseAnswer(g, { ...rel, assets: [{ name: 'SGK-Navigator.html', browser_download_url: 'javascript:alert(1)' }] }).url, rel.html_url);
  assert.throws(() => parseAnswer(g, { ...rel, prerelease: true }), /format/);
  assert.throws(() => parseAnswer(g, { ...rel, tag_name: 'neu', name: 'neu' }), /format/);
  const m = sourceInfo({ kind: 'manifest', url: 'https://example.org/v.json' });
  assert.deepEqual(parseAnswer(m, { version: '2026.12.12', date: '2026-12-12', url: 'https://example.org/SGK-Navigator.html', notes: { de: 'Neu: VIS-VO', fr: 'Nouveau' } }),
    { version: '2026.12.12', date: '2026-12-12', url: 'https://example.org/SGK-Navigator.html', notes: { de: 'Neu: VIS-VO', fr: 'Nouveau' }, page: null });
  assert.throws(() => parseAnswer(m, { version: '2026.12.12', url: 'http://example.org/x.html' }), /format/);
  // «Was ist neu»: page aus dem Manifest (nur https), sonst page der Quelle
  const mp = sourceInfo({ kind: 'manifest', url: 'https://example.org/v.json', page: 'https://example.org/' });
  assert.equal(parseAnswer(mp, { version: '2026.12.12', url: 'https://example.org/a.html' }).page, 'https://example.org/');
  assert.equal(parseAnswer(mp, { version: '2026.12.12', url: 'https://example.org/a.html', page: 'https://example.org/#neu' }).page, 'https://example.org/#neu');
  assert.equal(parseAnswer(mp, { version: '2026.12.12', url: 'https://example.org/a.html', page: 'javascript:alert(1)' }).page, 'https://example.org/');
});

test('Abfrage: Fehlerarten offline, 404, Rate-Limit, HTTP-Fehler, Format; Kopfzeilen ohne Anmeldedaten', async () => {
  const g = sourceInfo({ kind: 'github-release', owner: 'org', repo: 'r' });
  const resp = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => { if (body === undefined) throw new Error('x'); return body; } });
  let seen = null;
  const ok = await fetchLatest(g, { fetchFn: async (u, o) => { seen = { u, o }; return resp(200, { tag_name: '2026.12.12', html_url: 'https://github.com/org/r/releases/tag/2026.12.12', assets: [] }); } });
  assert.equal(ok.version, '2026.12.12');
  assert.equal(seen.u, 'https://api.github.com/repos/org/r/releases/latest');
  assert.equal(seen.o.credentials, 'omit');
  assert.equal(seen.o.headers.Accept, 'application/vnd.github+json');
  const code = async (f) => { try { await fetchLatest(g, { fetchFn: f }); return 'ok'; } catch (e) { return e.code; } };
  assert.equal(await code(async () => { throw new TypeError('Failed to fetch'); }), 'offline');
  assert.equal(await code(async () => resp(404, {})), 'notfound');
  assert.equal(await code(async () => resp(403, {})), 'ratelimit');
  assert.equal(await code(async () => resp(429, {})), 'ratelimit');
  assert.equal(await code(async () => resp(500, {})), 'status');
  assert.equal(await code(async () => resp(200)), 'format');
  // Zeitüberschreitung: Abbruch nach timeoutMs
  const slow = (u, o) => new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(new Error('abort'))));
  try { await fetchLatest(g, { fetchFn: slow, timeoutMs: 20 }); assert.fail(); } catch (e) { assert.equal(e.code, 'offline'); }
});

test('Ersatzquelle: Manifest nicht erreichbar oder fehlerhaft -> Releases-API; Fehlerwahl, wenn beide scheitern', async () => {
  const info = sourceInfo({ kind: 'manifest', url: 'https://org.github.io/r/version.json', page: 'https://org.github.io/r/', fallback: { kind: 'github-release', owner: 'org', repo: 'r' } });
  const resp = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
  const rel = { tag_name: 'v2026.12.12', html_url: 'https://github.com/org/r/releases/tag/v2026.12.12', assets: [{ name: 'SGK-Navigator.html', browser_download_url: 'https://github.com/org/r/releases/download/v2026.12.12/SGK-Navigator.html' }] };
  const man = { version: '2026.12.12', date: '2026-12-12', url: 'https://github.com/org/r/releases/download/v2026.12.12/SGK-Navigator.html', notes: { de: 'Neu', fr: 'Nouveau' } };
  const run = (mf, api) => { const urls = []; return fetchLatest(info, { fetchFn: async (u) => { urls.push(u); const a = u.includes('api.github.com') ? api : mf; if (a === 'offline') throw new TypeError('Failed to fetch'); return typeof a === 'number' ? resp(a, {}) : resp(200, a); } }).then((r) => ({ r, urls }), (e) => ({ code: e.code, urls })); };
  let x = await run(man, rel);
  assert.deepEqual(x.urls, ['https://org.github.io/r/version.json']);
  assert.equal(x.r.page, 'https://org.github.io/r/');
  assert.equal(x.r.via, undefined);
  for (const bad of ['offline', 404, 500, { version: 'x' }]) {
    x = await run(bad, rel);
    assert.deepEqual(x.urls, ['https://org.github.io/r/version.json', 'https://api.github.com/repos/org/r/releases/latest'], String(bad));
    assert.equal(x.r.version, '2026.12.12');
    assert.equal(x.r.via, 'fallback');
    assert.equal(x.r.url, rel.assets[0].browser_download_url);
    assert.equal(x.r.page, rel.html_url);
  }
  assert.equal((await run('offline', 'offline')).code, 'offline');
  assert.equal((await run(404, 404)).code, 'notfound');
  assert.equal((await run('offline', 403)).code, 'ratelimit');
  assert.equal((await run(500, 'offline')).code, 'status');
  assert.equal((await run({ version: 'x' }, 404)).code, 'format');
});

test('Taktung: automatisch höchstens einmal pro Kalendertag, nicht wenn abgeschaltet', () => {
  const now = new Date(2026, 10, 18, 9, 0);
  assert.equal(autoCheckDue(null, now), true);
  assert.equal(autoCheckDue({ auto: true }, now), true);
  assert.equal(autoCheckDue({ auto: false }, now), false);
  assert.equal(autoCheckDue({ auto: true, lastCheck: new Date(2026, 10, 18, 8, 0).toISOString() }, now), false);
  assert.equal(autoCheckDue({ auto: true, lastCheck: new Date(2026, 10, 17, 23, 59).toISOString() }, now), true);
  assert.equal(autoCheckDue({ auto: false, lastCheck: new Date(2026, 10, 1).toISOString() }, now), false);
  assert.equal(autoCheckDue({ auto: true, lastCheck: 'kaputt' }, now), true);
  assert.equal(autoCheckDue({ auto: true, lastCheck: new Date(2026, 10, 20).toISOString() }, now), true); // Uhr zurückgestellt
});

test('Anzeige: nur neuere Version; «Später erinnern» blendet diese Version 7 Tage aus, eine neuere sofort wieder ein', () => {
  const now = new Date(2026, 10, 18, 9, 0);
  const r = { version: '2026.12.12', date: '2026-12-12', url: 'https://x' };
  assert.equal(shouldShow(r, '2026.11.18', {}, now), true);
  assert.equal(shouldShow({ ...r, version: '2026.11.18' }, '2026.11.18', {}, now), false);
  assert.equal(shouldShow({ ...r, version: '2026.10.01' }, '2026.11.18', {}, now), false);
  assert.equal(shouldShow(null, '2026.11.18', {}, now), false);
  const st = remindLater({ auto: true }, '2026.12.12', now);
  assert.equal(st.auto, true);
  assert.equal(shouldShow(r, '2026.11.18', st, now), false);
  assert.equal(shouldShow(r, '2026.11.18', st, new Date(now.getTime() + 6 * 86400000)), false);
  assert.equal(shouldShow(r, '2026.11.18', st, new Date(now.getTime() + 7 * 86400000 + 1000)), true);
  assert.equal(shouldShow({ ...r, version: '2026.12.20' }, '2026.11.18', st, now), true);
});

test('Texte Version: kein ß, keine Ausrufezeichen, FR mit geschützten Leerzeichen, Wortlaut des Hinweises', () => {
  const sde = JSON.stringify([de.update.v, de.upload.storedIncluded, de.upload.storedBlocked, de.project.nIncluded]);
  assert.ok(!sde.includes('ß'));
  assert.ok(!sde.includes('!'));
  const walk = (o) => (typeof o === 'string' ? [o] : Object.values(o).flatMap(walk));
  for (const v of walk([fr.update.v, fr.upload.storedIncluded, fr.upload.storedBlocked, fr.project.nIncluded])) assert.ok(!/ [:;?!]/.test(v), v);
  assert.equal(de.update.v.notice.replace('{date}', '12. Dezember 2026'), 'Eine neue Version des SGK-Navigators ist verfügbar (Stand 12. Dezember 2026).');
  assert.equal(de.upload.storedIncluded.other.replace('{n}', 2), '2 hochgeladene Fassungen sind jetzt im Tool enthalten und wurden aus dem lokalen Speicher entfernt.');
});

// ------------------------------------------------------------------ gespeicherte Uploads
const ds = JSON.parse(readFileSync(new URL('../../data/dataset.json', import.meta.url)));
const ees = JSON.parse(readFileSync(new URL('../../data/works/ees.dataset.json', import.meta.url)));
const etias = JSON.parse(readFileSync(new URL('../../data/works/etias.dataset.json', import.meta.url)));

test('Gespeicherte Uploads: Fassung und Sprache enthalten -> überspringen; Sprache fehlt -> versuchen bzw. blockiert; sonst anwenden', () => {
  // SGK s08 (02016R0399-20251012) führt in stage.langs nur DE (nur DE geändert)
  assert.deepEqual(planStored(ds, { celex: '02016R0399-20251012', lang: 'de' }), { action: 'contained', stage: 's08' });
  assert.deepEqual(planStored(ds, { celex: '02016R0399-20251012', lang: 'fr' }), { action: 'tryLang', stage: 's08' });
  // 02016R0399-20240710 speist s03, s05, s06, s07: jüngster Stand zählt
  assert.equal(stageOfFassung(ds, '02016R0399-20240710').id, 's07');
  assert.deepEqual(planStored(ds, { celex: '02016R0399-20240710', lang: 'en' }), { action: 'contained', stage: 's07' });
  assert.deepEqual(planStored(ees, { celex: '02017R2226-20260612', lang: 'fr' }), { action: 'contained', stage: 's04' });
  assert.deepEqual(planStored(ees, { celex: '02017R2226-20270101', lang: 'de' }), { action: 'apply' });
  // ETIAS s01 nur DE (FR, EN bei EUR-Lex nicht vorhanden), spätere Stände folgen
  assert.deepEqual(planStored(etias, { celex: '02018R1240-20180919', lang: 'fr' }), { action: 'blocked', stage: 's01' });
});

test('Gespeicherte Uploads: hadEffect erkennt Änderungen im Stand und in der Sprache', () => {
  const a = { stages: [{ id: 's1', langs: ['de'] }], units: { u: { versions: { de: [{ stage: 's1', blocks: [{ k: 'p1', t: 'x' }] }], fr: [{ stage: 's0', blocks: [] }] } } } };
  const b = structuredClone(a);
  assert.equal(hadEffect(a, b, 's1', 'fr'), false);
  b.units.u.versions.fr.push({ stage: 's1', blocks: [{ k: 'p1', t: 'y' }] });
  assert.equal(hadEffect(a, b, 's1', 'fr'), true);
  const c = structuredClone(a); c.stages[0].langs.push('fr');
  assert.equal(hadEffect(a, c, 's1', 'fr'), true);
  assert.equal(hadEffect(a, structuredClone(a), 's1', 'de'), false);
});
