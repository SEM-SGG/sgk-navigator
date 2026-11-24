// Hinweis auf neue Versionen (src/app/ui/updatenotice.js) mit gemocktem Endpunkt (page.route). Varianten aus global-setup:
// sgk-navigator-update.html (github-release sgg-test/sgk-navigator-test, Version 2026.11.18), sgk-navigator-update-manifest.html
// (Manifest https://example.org/sgk/version.json), dist/ ohne Quelle (Funktion aus).
import { test, expect } from '@playwright/test';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const APP_OFF = 'file://' + join(ROOT, 'dist/sgk-navigator.html');
const APP_GH = 'file://' + join(ROOT, 'test/app/out/sgk-navigator-update.html');
const APP_MF = 'file://' + join(ROOT, 'test/app/out/sgk-navigator-update-manifest.html');
const APP_DEF = 'file://' + join(ROOT, 'test/app/out/sgk-navigator-update-default.html');
const PAGES = 'https://sem-sgg.github.io/sgk-navigator/';
const API_DEF = 'https://api.github.com/repos/SEM-SGG/sgk-navigator/releases/latest';
const DL_DEF = 'https://github.com/SEM-SGG/sgk-navigator/releases/download/v2026.12.12/SGK-Navigator.html';
const API = 'https://api.github.com/repos/sgg-test/sgk-navigator-test/releases/latest';
const DL = 'https://github.com/sgg-test/sgk-navigator-test/releases/download/v2026.12.12/SGK-Navigator.html';
// Screenshots: SGK_SHOTS_V=<Ordner>, sonst test/app/screenshots/version (in .gitignore)
const SHOTS = process.env.SGK_SHOTS_V || join(ROOT, 'test/app/screenshots/version');
mkdirSync(SHOTS, { recursive: true });

const release = (tag) => ({ tag_name: tag, name: 'SGK-Navigator ' + tag, draft: false, prerelease: false, published_at: '2026-12-12T08:00:00Z', html_url: `https://github.com/sgg-test/sgk-navigator-test/releases/tag/${tag}`,
  assets: [{ name: 'SGK-Navigator.html', browser_download_url: DL.replace('v2026.12.12', tag) }] });

/** Endpunkt mocken: answer = Objekt (200), Zahl (Status) oder 'abort'. Zählt Anfragen. */
async function mock(ctxOrPage, url, answer) {
  const st = { calls: 0, headers: [] };
  await ctxOrPage.route(url, async (route) => {
    st.calls++;
    st.headers.push(route.request().headers());
    const a = typeof answer === 'function' ? answer(st.calls) : answer;
    if (a === 'abort') return route.abort('internetdisconnected');
    if (typeof a === 'number') return route.fulfill({ status: a, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: '{"message":"x"}' });
    return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: JSON.stringify(a) });
  });
  return st;
}
async function open(page, url, hash = '') {
  const log = { errors: [], requests: [] };
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED/.test(m.text())) log.errors.push(m.text()); });
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  page.on('request', (r) => { const u = r.url(); if (!/^(file|data|blob):/.test(u)) log.requests.push(u); });
  await page.goto(url + hash);
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready, null, { timeout: 30000 });
  return log;
}
/** Zustand der Versionssuche im Speicher lesen und ändern: patch { lastCheck?, remindUntil? } (Zeitpunkte als ISO-Text). */
const editState = (page, patch = {}) => page.evaluate((p) => new Promise((res) => {
  const r = indexedDB.open('sgk-navigator', 1);
  r.onsuccess = () => {
    const st = r.result.transaction('kv', 'readwrite').objectStore('kv');
    const g = st.get('update');
    g.onsuccess = () => {
      const v = g.result || {};
      if (p.lastCheck) v.lastCheck = p.lastCheck;
      if (p.remindUntil && v.remind) v.remind.until = p.remindUntil;
      st.put(v, 'update').onsuccess = () => res(v);
    };
  };
}), patch);
const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();

test.skip(!existsSync(APP_GH.slice(7)) || !existsSync(APP_MF.slice(7)) || !existsSync(APP_DEF.slice(7)), 'Testvarianten fehlen');

test('Neue Version: Hinweis oben im Inhaltsbereich, Link auf das Release-Asset, «Später erinnern» 7 Tage, Schliessen nur für die Sitzung', async ({ browser }) => {
  const ctx = await browser.newContext();
  const st = await mock(ctx, API, release('v2026.12.12'));
  const page = await ctx.newPage();
  const log = await open(page, APP_GH);
  const n = page.locator('#update-notice');
  await expect(n).toBeVisible();
  await expect(n).toHaveAttribute('role', 'status');
  await expect(n).toContainText('Eine neue Version des SGK-Navigators ist verfügbar (Stand 12. Dezember 2026).');
  await expect(n).toContainText('Heruntergeladene Datei im selben Browser öffnen; Ihre Uploads, Notizen und Positionen bleiben im Browser erhalten.');
  const a = page.locator('#update-download');
  await expect(a).toHaveText('Neue Version herunterladen');
  await expect(a).toHaveAttribute('href', DL);
  await expect(a).toHaveAttribute('target', '_blank');
  await expect(page.locator('#update-later')).toHaveText('Später erinnern');
  await expect(page.locator('#update-close')).toHaveAttribute('aria-label', 'Hinweis schliessen');
  expect(st.calls).toBe(1);
  expect(st.headers[0].cookie).toBeUndefined();
  // Lage: über dem Inhalt der Ansicht, unter der Kopfzeile
  const [hb, nb, mb] = await Promise.all(['.app-head', '#update-notice', '.app > .view'].map((s) => page.locator(s).first().boundingBox()));
  expect(nb.y).toBeGreaterThanOrEqual(hb.y + hb.height - 1);
  expect(nb.y + nb.height).toBeLessThanOrEqual(mb.y + 1);
  await page.screenshot({ path: join(SHOTS, 'neue-version-de.png') });
  // Schliessen: weg, nach dem Neuladen wieder da (gespeichertes Ergebnis, keine neue Abfrage am selben Tag)
  await page.locator('#update-close').click();
  await expect(n).toHaveCount(0);
  await page.reload();
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
  await expect(n).toBeVisible();
  expect(st.calls).toBe(1);
  // Später erinnern: auch nach dem Neuladen weg; nach Ablauf (7 Tage) wieder da
  await page.locator('#update-later').click();
  await expect(n).toHaveCount(0);
  // Speichern in IndexedDB ist asynchron: erst neu laden, wenn die Wahl gespeichert ist (auf langsamen Rechnern sonst zu früh)
  await expect.poll(async () => ((await editState(page)).remind || {}).version, { timeout: 10000 }).toBe('2026.12.12');
  await page.reload();
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
  await page.waitForTimeout(300);
  await expect(n).toHaveCount(0);
  const s = await editState(page);
  expect(s.remind.version).toBe('2026.12.12');
  const days = (new Date(s.remind.until) - Date.now()) / 86400000;
  expect(days).toBeGreaterThan(6.9);
  expect(days).toBeLessThan(7.01);
  await editState(page, { remindUntil: ago(0.0001) });
  await page.reload();
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
  await expect(n).toBeVisible();
  // Tastatur: Link und Schaltflächen erreichbar
  await page.locator('#update-download').focus();
  await expect(page.locator('#update-download')).toBeFocused();
  expect(log.errors).toEqual([]);
  // französische Oberfläche
  await page.goto(APP_GH + '#/uebersicht?ui=fr');
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
  await expect(n).toContainText('Une nouvelle version du SGK-Navigator est disponible (état au 12 décembre 2026).');
  await expect(page.locator('#update-download')).toHaveText('Télécharger la nouvelle version');
  await page.screenshot({ path: join(SHOTS, 'neue-version-fr.png') });
  await ctx.close();
});

test('Gleiche oder ältere Version, Entwurf, unlesbare Angabe: kein Hinweis; automatische Prüfung höchstens einmal pro Tag', async ({ browser }) => {
  for (const tag of ['v2026.11.18', '2026.11.01', 'neueste']) {
    const ctx = await browser.newContext();
    const st = await mock(ctx, API, release(tag));
    const page = await ctx.newPage();
    const log = await open(page, APP_GH);
    await expect.poll(() => st.calls).toBe(1);
    await page.waitForTimeout(300);
    await expect(page.locator('#update-notice')).toHaveCount(0);
    await expect(page.locator('.toast')).toHaveCount(0);
    await page.reload();
    await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
    await page.waitForTimeout(300);
    expect(st.calls, tag).toBe(1); // am selben Tag keine zweite Abfrage
    // letzte Prüfung gestern: wieder fällig
    await editState(page, { lastCheck: ago(1.5) });
    await page.reload();
    await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
    await expect.poll(() => st.calls).toBe(2);
    expect(log.errors).toEqual([]);
    await ctx.close();
  }
});

test('Fehler beim automatischen Start still; manuelle Prüfung in «Info» mit verständlicher Meldung; Einstellung abschaltbar', async ({ browser }) => {
  const ctx = await browser.newContext();
  let answer = 'abort';
  const st = await mock(ctx, API, () => answer);
  const page = await ctx.newPage();
  const log = await open(page, APP_GH, '#/info');
  await expect.poll(() => st.calls).toBe(1);
  await page.waitForTimeout(300);
  await expect(page.locator('.toast')).toHaveCount(0);
  await expect(page.locator('#update-notice')).toHaveCount(0);
  await expect(page.locator('#update-msg')).toBeEmpty();
  // Info: Version, Schaltfläche, Einstellung
  await expect(page.locator('#app-version')).toHaveText('2026.11.18');
  await expect(page.locator('#info-version')).toContainText('erstellt am 18. November 2026');
  await expect(page.locator('#info-version')).toContainText('api.github.com');
  const btn = page.locator('#btn-update-check');
  await expect(btn).toHaveText('Jetzt nach neuer Version suchen');
  const chk = page.locator('#chk-update-auto');
  await expect(chk).toBeChecked();
  await expect(page.locator('label.check', { has: chk })).toHaveText('Beim Start nach neuer Version suchen');
  const cases = [
    ['abort', 'keine Verbindung zum Dienst'],
    [404, 'Es ist noch keine Version veröffentlicht.'],
    [403, 'nimmt im Moment keine weiteren Anfragen an'],
    [429, 'nimmt im Moment keine weiteren Anfragen an'],
    [500, 'Der Dienst meldet den Fehler 500.'],
    [{ tag_name: 'x' }, 'keine lesbare Versionsangabe'],
    [release('v2026.11.18'), 'Sie verwenden die neueste Version (2026.11.18).'],
  ];
  for (const [a, text] of cases) {
    answer = a;
    await btn.click();
    await expect(page.locator('#update-msg')).toContainText(text);
    await expect(btn).toBeEnabled();
  }
  await expect(page.locator('#update-msg .notice-success')).toBeVisible();
  answer = 404;
  await btn.click();
  await expect(page.locator('#update-msg .notice-error')).toBeVisible();
  await page.screenshot({ path: join(SHOTS, 'info-version-fehler-de.png'), fullPage: false });
  answer = release('v2026.12.12');
  await btn.click();
  await expect(page.locator('#update-msg')).toContainText('Eine neue Version ist verfügbar (Stand 12. Dezember 2026).');
  await expect(page.locator('#update-msg a').first()).toHaveAttribute('href', DL);
  await expect(page.locator('#update-msg a').nth(1)).toHaveAttribute('href', 'https://github.com/sgg-test/sgk-navigator-test/releases/tag/v2026.12.12');
  await expect(page.locator('#update-notice')).toBeVisible();
  await page.locator('#info-version').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(SHOTS, 'info-version-de.png') });
  // abschalten: am nächsten Tag keine automatische Abfrage
  await chk.uncheck();
  const calls = st.calls;
  await editState(page, { lastCheck: ago(2) });
  await page.reload();
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
  await page.waitForTimeout(500);
  expect(st.calls).toBe(calls);
  await expect(page.locator('#chk-update-auto')).not.toBeChecked();
  // französisch
  await page.goto(APP_GH + '#/info?ui=fr');
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
  await expect(page.locator('#btn-update-check')).toHaveText('Rechercher maintenant une nouvelle version');
  await page.locator('#info-version').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(SHOTS, 'info-version-fr.png') });
  expect(log.errors).toEqual([]);
  await ctx.close();
});

test('Manifest als Quelle: Hinweis mit Link und Kurztext aus der JSON-Datei', async ({ browser }) => {
  const ctx = await browser.newContext();
  const st = await mock(ctx, 'https://example.org/sgk/version.json', { version: '2026.12.12', date: '2026-12-12', url: 'https://example.org/sgk/SGK-Navigator.html', notes: { de: 'Neu: VIS-VO in der Fassung vom 1. Dezember 2026.', fr: 'Nouveau : règlement VIS.' } });
  const page = await ctx.newPage();
  const log = await open(page, APP_MF);
  await expect(page.locator('#update-notice')).toContainText('Neu: VIS-VO in der Fassung vom 1. Dezember 2026.');
  await expect(page.locator('#update-download')).toHaveAttribute('href', 'https://example.org/sgk/SGK-Navigator.html');
  expect(st.calls).toBe(1);
  expect(log.errors).toEqual([]);
  await ctx.close();
});

test('Ohne Quelle (leere Konfiguration): keine Anfrage, kein Hinweis, keine Schaltfläche; CSP nur mit Quelle um api.github.com ergänzt', async ({ page }) => {
  const log = await open(page, APP_OFF, '#/info');
  await page.waitForTimeout(1500);
  expect(log.requests).toEqual([]);
  await expect(page.locator('#update-notice')).toHaveCount(0);
  await expect(page.locator('#btn-update-check')).toHaveCount(0);
  await expect(page.locator('#chk-update-auto')).toHaveCount(0);
  await expect(page.locator('#app-version')).toHaveText(/^\d{4}\.\d{2}\.\d{2}(-\d+)?$/);
  await expect(page.locator('#info-version')).toContainText('keine Quelle für neue Versionen eingerichtet');
  const csp = (f) => /Content-Security-Policy" content="([^"]+)"/.exec(readFileSync(f, 'utf8').slice(0, 5000))[1];
  const off = csp(APP_OFF.slice(7)), gh = csp(APP_GH.slice(7)), mf = csp(APP_MF.slice(7)), def = csp(APP_DEF.slice(7));
  expect(def).toContain('connect-src https://publications.europa.eu https://sem-sgg.github.io https://api.github.com data: blob:');
  expect(off).toContain('connect-src https://publications.europa.eu data: blob:');
  expect(gh).toContain('connect-src https://publications.europa.eu https://api.github.com data: blob:');
  expect(mf).toContain('connect-src https://publications.europa.eu https://example.org data: blob:');
  for (const c of [off, gh, mf, def]) expect(/script-src ([^;]+)/.exec(c)[1]).toBe("'unsafe-inline' https://publications.europa.eu/webapi/rdf/sparql");
  expect(log.errors).toEqual([]);
});

test('Vorgabe SEM-SGG: Manifest auf GitHub Pages, Download aufs Release-Asset, «Was ist neu»; ersatzweise Releases-API; Projektlinks in «Info»', async ({ browser }) => {
  const manifest = { version: '2026.12.12', date: '2026-12-12', url: DL_DEF, page: PAGES, notes: { de: 'Neu: VIS-VO in der Fassung vom 1. Dezember 2026.', fr: 'Nouveau : règlement VIS.' } };
  // 1. Manifest erreichbar: keine Anfrage an die API
  let ctx = await browser.newContext();
  let mf = await mock(ctx, PAGES + 'version.json', manifest);
  let api = await mock(ctx, API_DEF, 404);
  let page = await ctx.newPage();
  let log = await open(page, APP_DEF);
  await expect(page.locator('#update-notice')).toContainText('Eine neue Version des SGK-Navigators ist verfügbar (Stand 12. Dezember 2026).');
  await expect(page.locator('#update-download')).toHaveAttribute('href', DL_DEF);
  const wn = page.locator('#update-whatsnew');
  await expect(wn).toHaveText('Was ist neu');
  await expect(wn).toHaveAttribute('href', PAGES);
  await expect(wn).toHaveAttribute('target', '_blank');
  expect(mf.calls).toBe(1);
  expect(api.calls).toBe(0);
  expect(log.requests).toEqual([PAGES + 'version.json']);
  // Info: Netztext nennt beide Adressen, Projektlinks
  await page.goto(APP_DEF + '#/info');
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
  await expect(page.locator('#info-version')).toContainText('sem-sgg.github.io');
  await expect(page.locator('#info-version')).toContainText('ersatzweise bei api.github.com');
  await expect(page.locator('#lnk-project')).toHaveAttribute('href', PAGES);
  await expect(page.locator('#lnk-project')).toHaveText('Projektseite und Download');
  await expect(page.locator('#lnk-source')).toHaveAttribute('href', 'https://github.com/SEM-SGG/sgk-navigator');
  await expect(page.locator('#lnk-source')).toHaveText('Quellcode auf GitHub');
  await expect(page.locator('#lnk-issues')).toHaveAttribute('href', 'https://github.com/SEM-SGG/sgk-navigator/issues/new/choose');
  await expect(page.locator('#info-project')).toContainText('dafür ist ein Konto nötig');
  await expect(page.locator('#lnk-docs')).toHaveAttribute('href', 'https://sem-sgg.github.io/sgk-navigator/dokumentation.html');
  await expect(page.locator('#lnk-docs')).toHaveText('Produktdokumentation');
  await expect(page.locator('#lnk-contact')).toHaveAttribute('href', 'mailto:sektion-grenze@sem.admin.ch');
  await expect(page.locator('#info-project')).toContainText('Rückmeldungen ohne GitHub-Konto an die Sektion Grundlagen Grenze (SGG), SEM: sektion-grenze@sem.admin.ch');
  for (const id of ['#lnk-project', '#lnk-docs', '#lnk-source', '#lnk-issues']) { await expect(page.locator(id)).toHaveAttribute('target', '_blank'); await expect(page.locator(id)).toHaveAttribute('rel', 'noopener noreferrer'); }
  await page.locator('#btn-update-check').click();
  await expect(page.locator('#update-msg')).toContainText('Eine neue Version ist verfügbar (Stand 12. Dezember 2026).');
  await expect(page.locator('#update-msg a').nth(1)).toHaveText('Was ist neu');
  await page.locator('#info-version').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(SHOTS, 'info-projekt-de.png') });
  await page.goto(APP_DEF + '#/info?ui=fr');
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
  await expect(page.locator('#lnk-project')).toHaveText('Page du projet et téléchargement');
  await expect(page.locator('#lnk-issues')).toHaveText('Signaler une erreur');
  await expect(page.locator('#lnk-docs')).toHaveText('Documentation du produit');
  await expect(page.locator('#info-project')).toContainText('Section Base Frontières');
  await expect(page.locator('#update-whatsnew')).toHaveText('Nouveautés');
  await page.locator('#info-version').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(SHOTS, 'info-projekt-fr.png') });
  expect(log.errors).toEqual([]);
  await ctx.close();
  // 2. Manifest nicht erreichbar (Pages gesperrt): Ersatz über die Releases-API
  ctx = await browser.newContext();
  mf = await mock(ctx, PAGES + 'version.json', 'abort');
  api = await mock(ctx, API_DEF, { tag_name: 'v2026.12.12', draft: false, prerelease: false, html_url: 'https://github.com/SEM-SGG/sgk-navigator/releases/tag/v2026.12.12', assets: [{ name: 'SGK-Navigator.html', browser_download_url: DL_DEF }] });
  page = await ctx.newPage();
  log = await open(page, APP_DEF);
  await expect(page.locator('#update-notice')).toBeVisible();
  await expect(page.locator('#update-download')).toHaveAttribute('href', DL_DEF);
  await expect(page.locator('#update-whatsnew')).toHaveAttribute('href', 'https://github.com/SEM-SGG/sgk-navigator/releases/tag/v2026.12.12');
  expect(mf.calls).toBe(1);
  expect(api.calls).toBe(1);
  expect(log.errors).toEqual([]);
  await ctx.close();
  // 3. beide nicht erreichbar: automatisch still, manuell verständliche Meldung
  ctx = await browser.newContext();
  mf = await mock(ctx, PAGES + 'version.json', 404);
  api = await mock(ctx, API_DEF, 404);
  page = await ctx.newPage();
  log = await open(page, APP_DEF, '#/info');
  await expect.poll(() => api.calls).toBe(1);
  await expect(page.locator('#update-notice')).toHaveCount(0);
  await page.locator('#btn-update-check').click();
  await expect(page.locator('#update-msg')).toContainText('Es ist noch keine Version veröffentlicht.');
  expect(log.errors).toEqual([]);
  await ctx.close();
});
