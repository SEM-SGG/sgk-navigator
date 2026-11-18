// UI-Tests Aktualisieren: alle Rechtsakte auf einmal prüfen (SPARQL per JSONP, gemockt und live) und Dateien
// gemeinsam ablegen (echte EUR-Lex-Dateien aus test/app/fixtures-live/, geladen mit test/app/tools/fetch-eurlex.mjs).
import { test, expect } from '@playwright/test';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { fulfillSparql, sparqlBinding as binding, endpointReachable } from './helpers.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const APP = 'file://' + join(ROOT, 'dist/sgk-navigator.html');
const APP_UPLOAD2 = 'file://' + join(ROOT, 'test/app/out/sgk-navigator-upload-2.html');
const LIVE = (f) => join(ROOT, 'test/app/fixtures-live', f);
const AMENDS = 'http://publications.europa.eu/ontology/cdm#resource_legal_amends_resource_legal';
const PROPOSES = 'http://publications.europa.eu/ontology/cdm#resource_legal_proposes_to_amend_resource_legal';

async function open(page, hash = '', url = APP) {
  const log = { errors: [], requests: [] };
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push(m.text()); });
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  page.on('request', (r) => { const u = r.url(); if (!/^(file|data|blob):/.test(u)) log.requests.push(u); });
  await page.goto(url + hash);
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready, null, { timeout: 30000 });
  return log;
}

/** Gemockter Endpunkt: Antworten je Werk (CELEX in der Abfrage), verzögert; zählt gleichzeitige Abfragen. */
async function mockEndpoint(page, { fail = [], delay = 150 } = {}) {
  const stats = { calls: 0, active: 0, maxActive: 0, callbacks: new Set(), types: new Set() };
  await page.route('https://publications.europa.eu/**', async (route) => {
    const req = route.request();
    stats.calls++;
    stats.types.add(req.resourceType());
    stats.active++; stats.maxActive = Math.max(stats.maxActive, stats.active);
    const url = new URL(req.url());
    stats.callbacks.add(url.searchParams.get('callback'));
    const q = url.searchParams.get('query') || '';
    await new Promise((r) => setTimeout(r, delay));
    stats.active--;
    const work = (q.match(/"[03](\d{4}R\d{4})"/) || [])[1];
    if (fail.some((c) => c.includes(work))) return route.abort('connectionrefused');
    let rows = [];
    if (q.includes('STRSTARTS')) {
      rows = {
        '2016R0399': [{ celex: '02016R0399-20251012', date: '2025-10-12' }],
        '2017R2226': [{ celex: '02017R2226-20260612', date: '2026-06-12' }, { celex: '02017R2226-20261101', date: '2026-11-01' }],
        '2018R1240': [{ celex: '02018R1240-20231231', date: '2023-12-31' }, { celex: '02018R1240-20260612', date: '2026-06-12' }],
        '2019R0817': [{ celex: '02019R0817-20260612', date: '2026-06-12' }],
      }[work] || [];
    } else if (q.includes('VALUES ?celex')) {
      // Sprachfassungen DE/FR/EN der konsolidierten Fassungen: ETIAS 20231231 nur ES (wie beim echten Endpunkt)
      rows = (q.match(/"(0\d{4}R\d{4}-\d{8})"/g) || []).map((x) => x.slice(1, -1)).map((c) => ({ celex: c, langs: c === '02018R1240-20231231' ? '' : 'DEU,ENG,FRA' }));
    } else if (!q.includes('GROUP_CONCAT')) {
      rows = {
        '2016R0399': [{ celex: '32017R2225', rel: AMENDS, date: '2017-11-30', title: 'Verordnung (EU) 2017/2225' }],
        '2017R2226': [{ celex: '32024R1356', rel: AMENDS, date: '2024-05-14', title: 'Verordnung (EU) 2024/1356' }, { celex: '52026PC0999', rel: PROPOSES, date: '2026-10-20', title: 'Vorschlag zur Änderung' }],
        '2019R0817': [{ celex: '52026PC1037', rel: PROPOSES, date: '2026-10-27', title: 'Vorschlag IO' }],
      }[work] || [];
    }
    await fulfillSparql(route, rows.map(binding));
  });
  return stats;
}

// ------------------------------------------------------------------ (a) gemeinsame Prüfung, gemockt
test('Alle Rechtsakte prüfen (gemockt, JSONP): Fortschritt, Tabelle, Fehler eines Rechtsakts, Links, gleiches Ergebnis im Werk-Tab', async ({ page }) => {
  const stats = await mockEndpoint(page, { fail: ['32008R0767'], delay: 250 });
  const log = await open(page, '#/aktualisieren');
  expect(stats.calls).toBe(0);
  await expect(page.locator('#all-h')).toHaveText('Alle Rechtsakte prüfen');
  await expect(page.locator('#all-how')).toHaveText('Link öffnen, Seite mit Ctrl+S als Webseite (nur HTML) speichern, Dateien hier ablegen.');
  const prog = page.locator('#all-progress');
  await expect(prog).toHaveAttribute('aria-live', 'polite');
  await page.locator('#btn-check-all').click();
  await expect(page.locator('#btn-check-all')).toBeDisabled();
  await expect(prog).toContainText(/\d von 5 geprüft/);
  await expect(page.locator('#btn-check-all')).toBeEnabled({ timeout: 60000 });
  await expect(prog).toContainText(/^Geprüft am .*, \d\d:\d\d Uhr: 4 von 5 geprüft, 3 neu oder unvollständig, 1 Rechtsakt nicht geprüft\.$/);
  // Transport: Skripte (JSONP), je Abfrage eigener Callback, höchstens 2 gleichzeitig;
  // je Werk 4 Abfragen (Fassungen, deren Sprachen, Akte, Sprachen der Berichtigungen), bei der VIS-VO 3 (Fassungen fehlgeschlagen)
  expect(stats.calls).toBe(19);
  expect([...stats.types]).toEqual(['script']);
  expect(stats.callbacks.size).toBe(19);
  expect(stats.maxActive).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => Object.keys(window).filter((k) => k.startsWith('__sgkJsonp')).length)).toBe(0);
  expect(await page.locator('script[src*="publications.europa.eu"]').count()).toBe(0);
  // Tabelle mit Kopf
  const tbl = page.locator('#tbl-all');
  await expect(tbl.locator('thead th')).toHaveText(['Rechtsakt', 'Art', 'CELEX', 'Datum', 'Status', 'Herunterladen']);
  // SGK: nichts Neues; EES: neue Fassung und neuer Vorschlag; ETIAS: neue Fassung; VIS: Fehler; IO: Vorschlag
  await expect(tbl.locator('tr[data-work="sgk"]')).toHaveText(/SGK\s*keine neuen Fassungen oder Akte/);
  const eesNew = tbl.locator('tr[data-work="ees"][data-celex="02017R2226-20261101"]');
  await expect(eesNew).toHaveClass(/is-new/);
  await expect(eesNew).toContainText('Konsolidierte Fassung');
  await expect(eesNew).toContainText('1. November 2026');
  await expect(eesNew.locator('.tag')).toHaveText('neu');
  await expect(eesNew.locator('a')).toHaveCount(3);
  await expect(eesNew.locator('a').nth(1)).toHaveAttribute('href', 'https://eur-lex.europa.eu/legal-content/FR/TXT/HTML/?uri=CELEX:02017R2226-20261101');
  await expect(eesNew.locator('a').first()).toHaveAttribute('target', '_blank');
  await expect(tbl.locator('tr[data-work="ees"][data-celex="52026PC0999"]')).toContainText('Vorschlag');
  await expect(tbl.locator('tr[data-work="ees"][data-celex="02017R2226-20260612"]')).toHaveCount(0); // bekannt, ausgeblendet
  await expect(tbl.locator('tr[data-work="etias"][data-celex="02018R1240-20260612"]')).toHaveCount(0);
  await expect(tbl.locator('tr[data-work="etias"]')).toHaveText(/ETIAS-VO\s*keine neuen Fassungen oder Akte/); // 20231231 nur ES
  await expect(tbl.locator('tr[data-work="iop"][data-celex="52026PC1037"]')).toHaveClass(/is-new/);
  const vis = tbl.locator('tr[data-work="vis"]');
  await expect(vis).toHaveCount(1);
  await expect(vis).toHaveClass(/is-error/);
  await expect(vis).toContainText('Prüfung fehlgeschlagen.');
  await expect(vis).toContainText('Keine Verbindung zum Endpunkt');
  // alle Einträge zeigen: bekannte Einträge mit Status gegen das jeweilige Werk
  await page.locator('#all-show').check();
  const eesKnown = tbl.locator('tr[data-work="ees"][data-celex="02017R2226-20260612"]');
  await expect(eesKnown.locator('.tag')).toHaveText('im Datensatz (Stand s04)');
  await expect(eesKnown).toContainText('alle Sprachen vorhanden');
  await expect(tbl.locator('tr[data-work="ees"][data-celex="32024R1356"] .tag')).toHaveText('im Datensatz (Stand s04)');
  await expect(tbl.locator('tr[data-work="sgk"][data-celex="32017R2225"] .tag')).toHaveText(/im Datensatz \(Stand s03\)/);
  const esOnly = tbl.locator('tr[data-work="etias"][data-celex="02018R1240-20231231"]');
  await expect(esOnly.locator('.tag')).toHaveText('nicht in DE, FR, EN verfügbar');
  await expect(esOnly).toHaveClass(/is-irrelevant/);
  await expect(esOnly.locator('a')).toHaveCount(0);
  // Werk-Tab EES zeigt dasselbe Ergebnis ohne neue Abfrage
  const before = stats.calls;
  await page.evaluate(() => { location.hash = '#/aktualisieren?w=ees'; });
  await expect(page.locator('#tbl-cons tr.is-new')).toContainText('02017R2226-20261101');
  await expect(page.locator('#chk-h')).toHaveText('EES-VO auf neue Fassungen prüfen');
  await page.evaluate(() => { location.hash = '#/aktualisieren?w=vis'; });
  await expect(page.locator('#tbl-cons')).toHaveCount(0);
  expect(stats.calls).toBe(before);
  // Einzelprüfung im Werk-Tab läuft weiter wie bisher (VIS hier mit Fehler)
  await page.locator('#btn-check').click();
  await expect(page.locator('.notice-error')).toContainText('Keine Verbindung');
  expect(log.errors.filter((e) => !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(e))).toEqual([]);
});

test('CSP: Skripte nur vom SPARQL-Endpunkt, nicht von anderen Pfaden desselben Ursprungs', async ({ page }) => {
  let other = 0;
  await page.route('https://publications.europa.eu/**', async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname !== '/webapi/rdf/sparql') { other++; return route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.__pwned = 1;' }); }
    return fulfillSparql(route, []);
  });
  await open(page, '#/aktualisieren');
  const csp = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content);
  expect(csp).toContain("script-src 'unsafe-inline' https://publications.europa.eu/webapi/rdf/sparql;");
  expect(csp).toContain('connect-src https://publications.europa.eu');
  const r = await page.evaluate(() => new Promise((res) => {
    const s = document.createElement('script');
    s.src = 'https://publications.europa.eu/resource/x.js';
    s.onload = () => res('load'); s.onerror = () => res('error');
    document.head.appendChild(s);
  }));
  expect(r).toBe('error');
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(other).toBe(0);
});

test('Alle Rechtsakte prüfen auf Französisch, ohne unübersetzte Schlüssel', async ({ page }) => {
  await mockEndpoint(page, { delay: 20 });
  await open(page, '#/aktualisieren?ui=fr');
  await expect(page.locator('#all-h')).toHaveText('Vérifier tous les actes');
  await page.locator('#btn-check-all').click();
  await expect(page.locator('#all-progress')).toContainText(/5 sur 5 vérifiés/, { timeout: 60000 });
  await expect(page.locator('#tbl-all thead th')).toHaveText(['Acte', 'Type', 'CELEX', 'Date', 'Statut', 'Télécharger']);
  await expect(page.locator('#tbl-all tr[data-work="sgk"]')).toContainText('aucune nouvelle version ni nouvel acte');
  expect(await page.evaluate(() => document.body.innerText.match(/⟦[^⟧]+⟧/g) || [])).toEqual([]);
});

// ------------------------------------------------------------------ (b) gemeinsame Ablage mit echten EUR-Lex-Dateien
test('Gemeinsame Ablage: echte EUR-Lex-Dateien zweier Werke, automatische Zuordnung, Protokoll, Status in der Tabelle', { tag: '@daten' }, async ({ page }) => {
  test.setTimeout(300000);
  const files = ['02016R0399-20251012_DE.html', '02017R2226-20260612_DE.html', '02017R2226-20260612_FR.html', '32017R2225_DE.html'];
  test.skip(!existsSync(APP_UPLOAD2.slice(7)), 'Testvariante fehlt');
  test.skip(files.some((f) => !existsSync(LIVE(f))), 'test/app/fixtures-live/ fehlt (node test/app/tools/fetch-eurlex.mjs …)');
  // Prüfung gemockt: die beiden Fassungen fehlen in dieser Testvariante und gelten als neu
  await page.route('https://publications.europa.eu/**', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('query') || '';
    let rows = [];
    if (q.includes('STRSTARTS') && q.includes('02016R0399')) rows = [{ celex: '02016R0399-20251012', date: '2025-10-12' }];
    if (q.includes('STRSTARTS') && q.includes('02017R2226')) rows = [{ celex: '02017R2226-20260612', date: '2026-06-12' }];
    await fulfillSparql(route, rows.map(binding));
  });
  const log = await open(page, '#/aktualisieren', APP_UPLOAD2);
  const before = await page.evaluate(() => ({ sgk: window.__sgk.data().stages.length, ees: window.__sgk.work('ees').stages.length }));
  await page.locator('#btn-check-all').click();
  await expect(page.locator('#all-progress')).toContainText('5 von 5 geprüft', { timeout: 60000 });
  await expect(page.locator('#tbl-all tr[data-celex="02016R0399-20251012"] .tag')).toHaveText('neu');
  await expect(page.locator('#tbl-all tr[data-celex="02017R2226-20260612"] .tag')).toHaveText('neu');
  // mehrere Dateien auf einmal, gemischt: zwei Werke, ein Änderungsakt, eine Nicht-EUR-Lex-Datei, ein Duplikat
  await page.locator('#file-input-all').setInputFiles([
    ...files.map((f) => ({ name: f, mimeType: 'text/html', buffer: readFileSync(LIVE(f)) })),
    { name: 'notiz.html', mimeType: 'text/html', buffer: Buffer.from('<html><body><p>Notiz</p></body></html>') },
    { name: 'Kopie EES DE.html', mimeType: 'text/html', buffer: readFileSync(LIVE('02017R2226-20260612_DE.html')) },
  ]);
  const items = page.locator('#all-log li');
  await expect(items).toHaveCount(6, { timeout: 240000 });
  const text = await items.allInnerTexts();
  console.log('Protokoll:\n' + text.join('\n'));
  await expect(page.locator('#all-log li', { hasText: '02016R0399-20251012_DE.html' })).toHaveClass('ok');
  await expect(page.locator('#all-log li', { hasText: '02016R0399-20251012_DE.html' })).toContainText(/SGK, Fassung vom 12\. Oktober 2025, DE geladen \(Stand s\d+\)\./);
  await expect(page.locator('#all-log li', { hasText: '02017R2226-20260612_DE.html' })).toContainText(/EES-VO, Fassung vom 12\. Juni 2026, DE geladen \(Stand s\d+\)\./);
  await expect(page.locator('#all-log li', { hasText: '02017R2226-20260612_FR.html' })).toContainText(/EES-VO, Fassung vom 12\. Juni 2026, FR geladen \(Stand s\d+\)\./);
  await expect(page.locator('#all-log li', { hasText: '32017R2225_DE.html' })).toContainText('Die Datei betrifft 32017R2225, keinen Rechtsakt der Bibliothek. Möglich sind konsolidierte Fassungen von SGK, EES-VO, ETIAS-VO, VIS-VO, IO-VO.');
  await expect(page.locator('#all-log li', { hasText: 'notiz.html' })).toContainText('nicht nach einem EUR-Lex-Dokument');
  const dup = page.locator('#all-log li', { hasText: 'Kopie EES DE.html' });
  await expect(dup).toHaveClass('dup');
  await expect(dup).toContainText('EES-VO: Die Fassung 02017R2226-20260612 (DE) ist bereits im Datensatz');
  // neue Stände je Werk, Status in der gemeinsamen Tabelle nicht mehr «neu»
  const after = await page.evaluate(() => ({ sgk: window.__sgk.data().stages.length, ees: window.__sgk.work('ees').stages.length }));
  expect(after).toEqual({ sgk: before.sgk + 1, ees: before.ees + 1 });
  const sgkRow = page.locator('#tbl-all tr[data-celex="02016R0399-20251012"]');
  await expect(sgkRow.locator('.tag')).toHaveText(/^hochgeladen \(Stand s\d+\), fehlt: FR, EN$/);
  await expect(sgkRow.locator('.tag')).toHaveClass(/tag-partly/);
  await expect(sgkRow.locator('a')).toHaveText(['FR', 'EN']);
  await expect(page.locator('#tbl-all tr[data-celex="02017R2226-20260612"] .tag')).toHaveText(/^hochgeladen \(Stand s\d+\), fehlt: EN$/);
  await expect(page.locator('#all-progress')).toContainText('2 neu oder unvollständig');
  // Uploads erscheinen je Werk in der bestehenden Liste
  await page.evaluate(() => { location.hash = '#/aktualisieren?w=ees'; });
  await expect(page.locator('#tbl-uploads tbody tr')).toHaveCount(2);
  await page.evaluate(() => { location.hash = '#/aktualisieren?w=sgk'; });
  await expect(page.locator('#tbl-uploads tbody tr')).toHaveCount(1);
  expect(log.errors).toEqual([]);
});

test('Ablage je Werk: Datei eines anderen Werks wird zugeordnet statt abgewiesen; gespeicherte Seite («komplett») wird angenommen', { tag: '@daten' }, async ({ page }) => {
  test.setTimeout(300000);
  const f = LIVE('variants/02017R2226-20260612_DE.dom.html');
  test.skip(!existsSync(APP_UPLOAD2.slice(7)) || !existsSync(f), 'Testvariante oder fixtures-live/variants fehlt');
  await open(page, '#/aktualisieren?w=sgk', APP_UPLOAD2);
  // serialisierte Seite (wie «Webseite, komplett»), Dateiname wie von Chrome vorgeschlagen, mit BOM
  const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), readFileSync(f)]);
  await page.locator('#file-input').setInputFiles({ name: 'Konsolidierter TEXT_ 32017R2226 — DE — 12.06.2026.html', mimeType: 'text/html', buffer: buf });
  const li = page.locator('#dropzone ~ .up-log li').first();
  await expect(li).toHaveClass('ok', { timeout: 120000 });
  await expect(li).toContainText(/Zugeordnet zu EES-VO statt SGK: Fassung vom 12\. Juni 2026, DE geladen \(Stand s\d+\)\./);
  // MHTML («Webseite, eine Datei») wird verständlich abgewiesen
  await page.locator('#file-input').setInputFiles({ name: 'seite.mhtml', mimeType: 'multipart/related', buffer: Buffer.from('From: <Saved by Blink>\r\nSnapshot-Content-Location: https://eur-lex.europa.eu/\r\nMIME-Version: 1.0\r\nContent-Type: multipart/related;\r\n\ttype="text/html"\r\n\r\n<html><body>CELEX</body></html>') });
  await expect(page.locator('#dropzone ~ .up-log li').first()).toContainText('MHTML');
  await page.evaluate(() => { location.hash = '#/aktualisieren?w=ees'; });
  await expect(page.locator('#tbl-uploads tbody tr')).toHaveCount(1);
  await page.evaluate(() => { location.hash = '#/aktualisieren?w=sgk'; });
  await expect(page.locator('#tbl-uploads')).toHaveCount(0);
});

// ------------------------------------------------------------------ (c) live gegen den echten Endpunkt (ohne Netz übersprungen)
test('Live: alle Rechtsakte gegen den echten SPARQL-Endpunkt prüfen (file://, CSP, JSONP)', { tag: '@netz' }, async ({ page }) => {
  test.skip(!!process.env.OFFLINE, 'OFFLINE gesetzt');
  test.skip(!(await endpointReachable(page)), 'Endpunkt nicht erreichbar (kein Netz)');
  test.setTimeout(240000);
  const log = await open(page, '#/aktualisieren');
  await page.locator('#btn-check-all').click();
  await expect(page.locator('#btn-check-all')).toBeEnabled({ timeout: 200000 });
  const prog = await page.locator('#all-progress').innerText();
  console.log('Live:', prog);
  expect(prog).toMatch(/5 von 5 geprüft/);
  await page.locator('#all-show').check();
  for (const [w, c] of [['sgk', '02016R0399-20251012'], ['ees', '02017R2226-20260612'], ['etias', '02018R1240-20260612'], ['vis', '02008R0767-20260612'], ['iop', '02019R0817-20260612']]) {
    await expect(page.locator(`#tbl-all tr[data-work="${w}"][data-celex="${c}"] .tag`)).toContainText('im Datensatz');
  }
  await page.locator('#all-show').uncheck();
  console.log((await page.locator('#tbl-all tbody tr').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ')).join('\n'));
  expect(log.errors).toEqual([]);
});
