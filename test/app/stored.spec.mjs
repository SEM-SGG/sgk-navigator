// Gespeicherte Uploads und neue zentrale Version des Tools: keine doppelten Stände (src/app/uploads.js applyStoredUploads,
// importProject; Entscheidungslogik src/app/lib/storedplan.js). Gleicher Browser-Kontext = gleicher Speicher; die Varianten liegen
// unter verschiedenen file://-Pfaden (Chrome teilt den Speicher aller file://-Seiten, siehe auch der Test am Ende).
import { test, expect } from '@playwright/test';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const APP = 'file://' + join(ROOT, 'dist/sgk-navigator.html');
const APP_UPLOAD2 = 'file://' + join(ROOT, 'test/app/out/sgk-navigator-upload-2.html');      // ohne SGK s08, ohne EES s04
const APP_UPLOAD_EES = 'file://' + join(ROOT, 'test/app/out/sgk-navigator-upload-ees.html'); // mit SGK s08, ohne EES s04
const LIVE = (f) => join(ROOT, 'test/app/fixtures-live', f);
// Screenshots: SGK_SHOTS_V=<Ordner>, sonst test/app/screenshots/version (in .gitignore)
const SHOTS = process.env.SGK_SHOTS_V || join(ROOT, 'test/app/screenshots/version');
const SGK = ['02016R0399-20251012_DE.html', '02016R0399-20251012_FR.html', '02016R0399-20251012_EN.html'];
const EES = ['02017R2226-20260612_DE.html', '02017R2226-20260612_FR.html'];

async function open(page, url, hash = '') {
  const log = { errors: [] };
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push(m.text()); });
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  await page.goto(url + hash);
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready, null, { timeout: 30000 });
  return log;
}
const counts = (page) => page.evaluate(() => ({ sgk: window.__sgk.data().stages.length, ees: window.__sgk.work('ees').stages.length }));
/** Inhalt des lokalen Speichers: Liste der Uploads und Zahl der gespeicherten Fassungen (snap:*, nicht null). */
const storage = (page) => page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('sgk-navigator', 1);
  r.onsuccess = () => {
    const st = r.result.transaction('kv').objectStore('kv');
    const out = { uploads: null, snaps: 0 };
    const g = st.get('uploads');
    g.onsuccess = () => { out.uploads = (g.result || []).map((u) => `${u.work || 'sgk'}:${u.celex}:${u.lang}`); };
    const c = st.openCursor();
    c.onsuccess = () => { const cur = c.result; if (!cur) { res(out); return; } if (String(cur.key).startsWith('snap:') && cur.value) out.snaps++; cur.continue(); };
  };
}));
const upload = async (page, files) => {
  await page.locator('#file-input-all').setInputFiles(files.map((f) => ({ name: f, mimeType: 'text/html', buffer: readFileSync(LIVE(f)) })));
  await expect(page.locator('#all-log li')).toHaveCount(files.length, { timeout: 240000 });
  expect(await page.locator('#all-log li:not(.ok)').allInnerTexts()).toEqual([]);
};

test('Doppelte Stände: Uploads, die eine neue Version des Tools enthält, werden beim Start übersprungen, entfernt und einmal gemeldet', { tag: '@daten' }, async ({ browser }) => {
  test.setTimeout(600000);
  test.skip([APP_UPLOAD2, APP_UPLOAD_EES].some((u) => !existsSync(u.slice(7))), 'Testvarianten fehlen');
  test.skip([...SGK, ...EES].some((f) => !existsSync(LIVE(f))), 'test/app/fixtures-live/ fehlt');
  const ctx = await browser.newContext({ acceptDownloads: true });
  const p0 = await ctx.newPage();
  await open(p0, APP);
  const full = await counts(p0);
  await p0.close();

  // 1. Variante ohne SGK s08 und ohne EES s04: fünf Dateien hochladen
  const p1 = await ctx.newPage();
  const log1 = await open(p1, APP_UPLOAD2, '#/aktualisieren');
  const c0 = await counts(p1);
  expect(c0).toEqual({ sgk: full.sgk - 1, ees: full.ees - 1 });
  await upload(p1, [...SGK, ...EES]);
  expect(await counts(p1)).toEqual(full);
  expect((await storage(p1)).uploads).toHaveLength(5);
  // Projektdatei für den Importtest
  await p1.evaluate(() => { location.hash = '#/aktualisieren?w=sgk'; });
  const dl = p1.waitForEvent('download');
  await p1.locator('#btn-export-project').click();
  const projFile = join(ROOT, 'test/app/tmp/projekt-doppelt.json');
  mkdirSync(dirname(projFile), { recursive: true });
  await (await dl).saveAs(projFile);
  await p1.close();

  // 2. neue Version mit SGK s08 (ohne EES s04): die drei SGK-Uploads entfallen, die EES-Uploads bleiben wirksam
  const p2 = await ctx.newPage();
  const log2 = await open(p2, APP_UPLOAD_EES, '#/aktualisieren?w=sgk');
  await expect(p2.locator('.toast', { hasText: '3 hochgeladene Fassungen sind jetzt im Tool enthalten und wurden aus dem lokalen Speicher entfernt.' })).toBeVisible();
  expect(await counts(p2)).toEqual(full);
  let s = await storage(p2);
  expect(s.uploads.sort()).toEqual(['ees:02017R2226-20260612:de', 'ees:02017R2226-20260612:fr']);
  expect(s.snaps).toBe(2);
  await expect(p2.locator('#tbl-uploads tbody tr')).toHaveCount(0);
  await p2.close();

  // 3. vollständige Version: auch die EES-Uploads entfallen; Zahl der Stände wie die vollständige Version
  const p3 = await ctx.newPage();
  const log3 = await open(p3, APP, '#/aktualisieren?w=ees');
  const msg = p3.locator('.toast', { hasText: '2 hochgeladene Fassungen sind jetzt im Tool enthalten und wurden aus dem lokalen Speicher entfernt.' });
  await expect(msg).toBeVisible();
  await expect(msg).toHaveClass(/toast-info/);
  expect(await counts(p3)).toEqual(full);
  s = await storage(p3);
  expect(s).toEqual({ uploads: [], snaps: 0 });
  await expect(p3.locator('#tbl-uploads tbody tr')).toHaveCount(0);
  mkdirSync(SHOTS, { recursive: true });
  await p3.screenshot({ path: join(SHOTS, 'doppelte-uploads-bereinigt-de.png') });
  // Meldung erscheint nur einmal
  await p3.reload();
  await p3.waitForFunction(() => window.__sgk && window.__sgk.ready);
  await p3.waitForTimeout(500);
  await expect(p3.locator('.toast', { hasText: 'im Tool enthalten' })).toHaveCount(0);

  // 4. Projektdatei in der vollständigen Version importieren: keine doppelten Fassungen, Meldung im Ergebnis
  await p3.locator('#project-input').setInputFiles(projFile);
  await expect(p3.locator('.up-sec .notice')).toContainText('Importiert: 0 Fassungen, 0 Karten, 5 Fassungen bereits im Tool enthalten, nicht übernommen.');
  expect(await counts(p3)).toEqual(full);
  expect(await storage(p3)).toEqual({ uploads: [], snaps: 0 });
  for (const l of [log1, log2, log3]) expect(l.errors).toEqual([]);
  await ctx.close();
});

test('Doppelte Stände: Meldung auf Französisch; Projektimport in eine Version ohne die Fassung legt sie an', { tag: '@daten' }, async ({ browser }) => {
  test.setTimeout(300000);
  test.skip(!existsSync(APP_UPLOAD2.slice(7)) || !existsSync(LIVE(SGK[0])), 'Testvariante oder fixtures-live fehlt');
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { try { localStorage.setItem('sgk-navigator.ui', 'fr'); } catch { /* */ } });
  const p1 = await ctx.newPage();
  await open(p1, APP_UPLOAD2, '#/aktualisieren');
  await upload(p1, [SGK[0]]);
  await p1.close();
  const p2 = await ctx.newPage();
  await open(p2, APP, '#/aktualisieren');
  await expect(p2.locator('.toast', { hasText: '1 version importée est désormais intégrée à l’outil et a été supprimée de la mémoire locale.' })).toBeVisible();
  await p2.screenshot({ path: join(SHOTS, 'doppelte-uploads-bereinigt-fr.png') });
  await ctx.close();
  // Projektdatei aus Test 1 in der Variante ohne SGK s08 und EES s04: alle fünf Fassungen werden angelegt
  const projFile = join(ROOT, 'test/app/tmp/projekt-doppelt.json');
  test.skip(!existsSync(projFile), 'Projektdatei aus dem ersten Test fehlt');
  const c2 = await browser.newContext();
  const p3 = await c2.newPage();
  await open(p3, APP_UPLOAD2, '#/aktualisieren');
  const before = await counts(p3);
  await p3.locator('#project-input').setInputFiles(projFile);
  await expect(p3.locator('.up-sec .notice')).toContainText('Importiert: 5 Fassungen, 0 Karten.');
  expect(await counts(p3)).toEqual({ sgk: before.sgk + 1, ees: before.ees + 1 });
  await c2.close();
});

test('Browser-Speicher: zwei Dateien unter verschiedenen file://-Pfaden teilen IndexedDB und localStorage (Chrome)', async ({ browser }) => {
  const dir = join(ROOT, 'test/app/tmp/speicher');
  mkdirSync(join(dir, 'a'), { recursive: true });
  mkdirSync(join(dir, 'Downloads'), { recursive: true });
  copyFileSync(APP.slice(7), join(dir, 'a', 'sgk-navigator.html'));
  copyFileSync(APP.slice(7), join(dir, 'Downloads', 'SGK-Navigator (1).html'));
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await open(p, 'file://' + join(dir, 'a', 'sgk-navigator.html'));
  expect(await p.evaluate(() => location.origin)).toBe('file://');
  await p.evaluate(async () => {
    localStorage.setItem('probe', 'a');
    await new Promise((res) => { const r = indexedDB.open('sgk-navigator', 1); r.onsuccess = () => { const tx = r.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put('a', 'probe'); tx.oncomplete = res; }; });
  });
  const q = await ctx.newPage();
  await open(q, 'file://' + join(dir, 'Downloads', 'SGK-Navigator%20(1).html'));
  const got = await q.evaluate(() => new Promise((res) => { const r = indexedDB.open('sgk-navigator', 1); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('probe'); g.onsuccess = () => res({ ls: localStorage.getItem('probe'), idb: g.result }); }; }));
  expect(got).toEqual({ ls: 'a', idb: 'a' });
  await ctx.close();
});
