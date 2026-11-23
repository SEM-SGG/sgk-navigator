// Download-Seite für GitHub Pages (site/, scripts/build-site.mjs): Inhalt DE/FR, Sprachwahl, Link aufs Release-Asset,
// version.json, keine externen Anfragen, Barrierefreiheit (axe-core, WCAG 2.1 AA), Tastatur, schmale Breite.
// Die Seite wird über einen lokalen HTTP-Server geladen (wie auf GitHub Pages, gleicher Ursprung für version.json).
import { test, expect } from '@playwright/test';
import { resolve, dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'test/app/out/site');
// Screenshots: SGK_SHOTS_SITE=<Ordner>, sonst test/app/screenshots/site (in .gitignore)
const SHOTS = process.env.SGK_SHOTS_SITE || join(ROOT, 'test/app/screenshots/site');
const AXE = readFileSync(join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const DL = 'https://github.com/SEM-SGG/sgk-navigator/releases/download/v2026.11.18/SGK-Navigator.html';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain' };

let server, base;
test.beforeAll(async () => {
  mkdirSync(SHOTS, { recursive: true });
  execFileSync('node', ['scripts/build-site.mjs', '--version', '2026.11.18', '--out', 'test/app/out/site', '--repo', 'SEM-SGG/sgk-navigator',
    '--notes-de', 'Erste Version im Repo der Sektion Grundlagen Grenze.', '--notes-fr', 'Première version dans le dépôt de la section.'], { cwd: ROOT, encoding: 'utf8' });
  server = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    // axe-core vom selben Ursprung (die Seite erlaubt per CSP nur Skripte von dort)
    if (u.pathname === '/sgk-navigator/__axe.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(AXE); }
    let f = join(OUT, decodeURIComponent(u.pathname.replace(/^\/sgk-navigator/, '')));
    if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(OUT) || !existsSync(f)) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
    res.end(readFileSync(f));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/sgk-navigator/`;
});
test.afterAll(() => new Promise((r) => server.close(r)));

async function open(page, hash = '') {
  const log = { errors: [], external: [] };
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push(m.text()); });
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  page.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1:')) log.external.push(r.url()); });
  await page.goto(base + hash);
  await page.waitForLoadState('networkidle');
  return log;
}
async function axe(page) {
  await page.addScriptTag({ url: base + '__axe.js' });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'], resultTypes: ['violations'] })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`));
}

test('Download-Seite DE: Inhalt, Schaltfläche aufs Release-Asset, Version, drei Schritte, Hinweis, Kontakt, keine externen Anfragen', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'de-CH' });
  const page = await ctx.newPage();
  const log = await open(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'de-CH');
  const de = page.locator('[data-l="de"].lang-block');
  await expect(de).toBeVisible();
  await expect(page.locator('[data-l="fr"].lang-block')).toBeHidden();
  await expect(de.locator('h1')).toHaveText('SGK-Navigator');
  const btn = page.locator('#dl-de');
  await expect(btn).toHaveText('SGK-Navigator herunterladen');
  await expect(btn).toHaveAttribute('href', DL);
  expect((await btn.boundingBox()).height).toBeGreaterThanOrEqual(48);
  await expect(de).toContainText('Version 2026.11.18 vom 18. November 2026');
  await expect(de).toContainText('kein GitHub-Konto nötig');
  await expect(de.locator('.steps li')).toHaveCount(3);
  await expect(de.locator('.steps')).toContainText('Chrome oder Edge');
  await expect(de.locator('.steps')).toContainText('im selben Browser');
  await expect(de).toContainText('Keine amtliche Veröffentlichung.');
  await expect(de).toContainText('Sektion Grundlagen Grenze (SGG), Staatssekretariat für Migration SEM');
  await expect(de).toContainText('Erste Version im Repo der Sektion Grundlagen Grenze.');
  await expect(de.locator('.facts li')).toHaveCount(5);
  await expect(de.locator('.facts')).toContainText('Schengener Grenzkodex (Verordnung (EU) 2016/399): Fassung vom 12. Oktober 2025');
  // Produktdokumentation unter dokumentation.html, Kontakt ohne GitHub-Konto
  await expect(page.locator('#docs-de')).toHaveAttribute('href', 'dokumentation.html');
  const doc = await page.request.get(base + 'dokumentation.html');
  expect(doc.ok()).toBe(true);
  expect(await doc.text()).toContain('SGK-Navigator');
  await expect(de.locator('a[href="mailto:sektion-grenze@sem.admin.ch"]')).toHaveText('sektion-grenze@sem.admin.ch');
  expect(await page.locator('body').innerText()).not.toMatch(/ß/);
  expect(log.external).toEqual([]);
  expect(log.errors).toEqual([]);
  await page.screenshot({ path: join(SHOTS, 'download-seite-de.png'), fullPage: true });
  expect(await axe(page)).toEqual([]);
  await ctx.close();
});

test('Download-Seite FR: Sprachwahl per Schaltfläche und Browsersprache, gespeichert; Tastatur; version.json', async ({ browser }) => {
  let ctx = await browser.newContext({ locale: 'de-CH' });
  let page = await ctx.newPage();
  let log = await open(page);
  const fr = page.locator('[data-set-lang="fr"]');
  await expect(fr).toHaveAttribute('aria-pressed', 'false');
  await fr.focus();
  await page.keyboard.press('Enter');
  await expect(fr).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr-CH');
  await expect(page.locator('#fr-h1')).toBeFocused();
  await expect(page.locator('#dl-fr')).toHaveText('Télécharger le SGK-Navigator');
  await expect(page.locator('#dl-fr')).toHaveAttribute('href', DL);
  const frb = page.locator('[data-l="fr"].lang-block');
  await expect(frb).toContainText('Version 2026.11.18 du 18 novembre 2026');
  await expect(frb).toContainText('Pas une publication officielle.');
  await expect(frb.locator('.steps li')).toHaveCount(3);
  await expect(page.locator('#docs-fr')).toHaveText('Documentation du produit');
  await expect(frb.locator('a[href="mailto:sektion-grenze@sem.admin.ch"]')).toBeVisible();
  await expect(page.locator('[data-l="de"].lang-block')).toBeHidden();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr-CH'); // gespeichert
  await page.screenshot({ path: join(SHOTS, 'download-seite-fr.png'), fullPage: true });
  expect(await axe(page)).toEqual([]);
  // version.json: Manifest für den Hinweis im Tool
  const v = await page.evaluate(async () => (await fetch('version.json')).json());
  expect(v).toMatchObject({ version: '2026.11.18', date: '2026-11-18', url: DL, page: 'https://sem-sgg.github.io/sgk-navigator/' });
  expect(v.notes.fr).toBe('Première version dans le dépôt de la section.');
  expect(log.external).toEqual([]);
  expect(log.errors).toEqual([]);
  await ctx.close();
  // Browsersprache fr ohne gespeicherte Wahl
  ctx = await browser.newContext({ locale: 'fr-CH' });
  page = await ctx.newPage();
  log = await open(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr-CH');
  await ctx.close();
});

test('Download-Seite schmal (375 px): kein horizontaler Scroll, Schaltfläche volle Breite; ohne JavaScript beide Sprachen', async ({ browser }) => {
  let ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, locale: 'de-CH' });
  let page = await ctx.newPage();
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const b = await page.locator('#dl-de').boundingBox();
  expect(b.width).toBeGreaterThan(300);
  await page.screenshot({ path: join(SHOTS, 'download-seite-de-375.png'), fullPage: true });
  await ctx.close();
  ctx = await browser.newContext({ javaScriptEnabled: false });
  page = await ctx.newPage();
  await page.goto(base);
  await expect(page.locator('[data-l="de"].lang-block')).toBeVisible();
  await expect(page.locator('[data-l="fr"].lang-block')).toBeVisible();
  await expect(page.locator('.lang-switch')).toBeHidden();
  await ctx.close();
});

test('Download-Seite ohne --notes: Kurztext aus CHANGELOG.md, Französisch aus «### Français»', () => {
  const out = 'test/app/out/site-changelog';
  const v = execFileSync('node', ['scripts/release-info.mjs', '--version'], { cwd: ROOT, encoding: 'utf8' }).trim();
  execFileSync('node', ['scripts/build-site.mjs', '--version', v, '--out', out], { cwd: ROOT, encoding: 'utf8' });
  const m = JSON.parse(readFileSync(join(ROOT, out, 'version.json'), 'utf8'));
  const md = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
  const first = md.split(`## ${v} `)[1].split('\n').find((l) => l.startsWith('- ')).slice(2).replace(/`/g, '');
  expect(m.notes.de.startsWith(first.slice(0, 60))).toBe(true);
  expect(m.notes.fr).not.toMatch(/Nouvelle version du SGK-Navigator/);
  expect(existsSync(join(ROOT, out, 'dokumentation.html'))).toBe(true);
});
