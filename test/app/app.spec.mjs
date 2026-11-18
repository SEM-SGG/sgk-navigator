// UI-Tests gegen dist/sgk-navigator.html über file:// in Chrome.
// Aufruf: npx playwright test -c test/app/playwright.config.mjs
import { test, expect } from '@playwright/test';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { fulfillSparql, endpointReachable } from './helpers.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const APP = 'file://' + join(ROOT, 'dist/sgk-navigator.html');
const APP_UPLOAD = 'file://' + join(ROOT, 'test/app/out/sgk-navigator-upload.html');
// Quelldateien aus raw/ (Datenpflege); fehlen sie, die per test/app/tools/fetch-eurlex.mjs geladenen Dateien aus test/app/fixtures-live/
const RAW = (f) => (existsSync(join(ROOT, 'raw', f)) ? join(ROOT, 'raw', f) : join(ROOT, 'test/app/fixtures-live', f));
const SHOTS = join(ROOT, 'test/app/screenshots');
mkdirSync(SHOTS, { recursive: true });

/** Öffnet die App, sammelt Konsolenfehler und Netzwerkzugriffe. */
async function open(page, hash = '', url = APP) {
  const log = { errors: [], requests: [] };
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push(m.text()); });
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  page.on('request', (r) => { const u = r.url(); if (!/^(file|data|blob):/.test(u)) log.requests.push(u); });
  await page.goto(url + hash);
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready, null, { timeout: 30000 });
  return log;
}

/** Wählt eine Bestimmung mit mindestens zwei Fassungen (bevorzugt Art. 8 Abs. 3 Bst. a Ziff. i). */
async function target(page) {
  return page.evaluate(() => {
    const d = window.__sgk.data();
    const ok = (u, k) => d.unit(u) && d.history(u, 'de', k).length >= 2;
    if (ok('art_8', 'p3.a.i')) return { u: 'art_8', k: 'p3.a.i' };
    for (const u of d.unitOrder) {
      const vs = d.versions(u, 'de');
      const last = vs[vs.length - 1];
      for (const b of (last && last.blocks) || []) if (b.ty !== 'table' && b.ty !== 'img' && ok(u, b.k)) return { u, k: b.k };
    }
    return null;
  });
}
const info = (page) => page.evaluate(() => {
  const d = window.__sgk.data();
  return { fixtures: !!d.meta.fixtures, stages: d.stages.map((s) => s.id), first: d.stages[0].id, latest: d.latest.id, notes: d.notes, units: d.unitOrder.length };
});
const hashParam = (page, k) => new URLSearchParams(new URL(page.url()).hash.split('?')[1] || '').get(k);

function pngSize(buf) {
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// ------------------------------------------------------------------ Start
test('Start ohne Konsolenfehler und ohne Netzwerkrequests, alle Ansichten', async ({ page }) => {
  const log = await open(page, '#/uebersicht');
  await expect(page.locator('.ov-head h1')).toContainText('Grenzkodex');
  for (const v of ['lesen', 'chronik', 'vergleich', 'aktualisieren', 'anleitung', 'info', 'uebersicht']) {
    await page.locator('.views a', { hasText: { lesen: 'Lesen', chronik: 'Chronologie', vergleich: 'Vergleich', aktualisieren: 'Aktualisieren', anleitung: 'Anleitung', info: 'Info', uebersicht: 'Übersicht' }[v] }).click();
    await expect(page).toHaveURL(new RegExp('#/' + v));
    await expect(page.locator('main, .view').first()).toBeVisible();
  }
  await page.waitForTimeout(300);
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
  const i = await info(page);
  console.log('Datensatz:', i.fixtures ? 'Fixtures' : 'echt', '| Stände', i.stages.length, '| Einheiten', i.units, '| Hinweise', i.notes.length ? i.notes : 'keine');
});

// ------------------------------------------------------------------ 1 Finden, lesen, Stand wechseln, Herkunft
test('Ablauf 1: Artikel finden (Nummer, Art. 8a, Stichwort), Stand wechseln, Herkunft', async ({ page }) => {
  const log = await open(page, '#/lesen');
  const q = page.locator('#toc-q');
  await q.fill('8');
  await q.press('Enter');
  await expect(page).toHaveURL(/u=art_8(&|$)/);
  await expect(page.locator('.unit-meta')).toContainText('Art. 8 SGK');
  await q.fill('Art. 8a');
  await q.press('Enter');
  await expect(page).toHaveURL(/u=art_8a/);
  await expect(page.locator('.toc-unit.is-current')).toContainText('Art. 8a');
  await q.fill('Einreisevoraussetzungen');
  await q.press('Enter');
  const hits = page.locator('.search-res li a');
  await expect(hits.first()).toBeVisible();
  expect(await hits.count()).toBeGreaterThan(0);
  await expect(hits.first().locator('mark')).toBeVisible();
  await hits.first().click();
  await expect(page.locator('.blk').first()).toBeVisible();
  // Stand wechseln
  const i = await info(page);
  await page.goto(APP + '#/lesen?u=art_8');
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
  await expect(page.locator(`.stagebar .stg[aria-pressed="true"]`)).toHaveCount(1);
  const textLatest = await page.locator('.legal-read').innerText();
  expect(await page.locator('.mark-code').count()).toBeGreaterThan(0); // Herkunft am Rand
  await page.locator('.stagebar .stg').first().click();
  expect(hashParam(page, 's')).toBe(i.first);
  const textFirst = await page.locator('.legal-read').innerText();
  expect(textFirst).not.toBe(textLatest);
  // Redline gegenüber Vorstand
  await page.locator('.stagebar .stg').last().click();
  await page.getByLabel('Änderungen gegenüber Vorstand').check();
  expect(hashParam(page, 'red')).toBe('1');
  expect(log.errors).toEqual([]);
});

// ------------------------------------------------------------------ 2 Chronologie
test('Ablauf 2: Bestimmung anklicken, Chronologie mit Wort-Diff', async ({ page }) => {
  await open(page, '#/lesen');
  const t = await target(page);
  expect(t).not.toBeNull();
  await page.goto(`${APP}#/lesen?u=${t.u}`);
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
  await page.locator(`.blk[data-k="${t.k}"]`).click();
  await expect(page.locator('.panel')).toBeVisible();
  expect(hashParam(page, 'k')).toBe(t.k);
  const steps = page.locator('.panel .step');
  expect(await steps.count()).toBeGreaterThanOrEqual(2);
  expect(await page.locator('.panel ins, .panel del').count()).toBeGreaterThan(0);
  await expect(page.locator('.panel .step').first().locator('.chip')).toBeVisible();
  // Tastatur: Enter auf einem Block
  await page.locator('.panel .btn-icon[aria-label="Chronologie schliessen"]').click();
  await page.locator(`.blk[data-k="${t.k}"]`).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.panel')).toBeVisible();
  // Breit anzeigen und Chronologie der ganzen Einheit
  await page.getByRole('button', { name: 'Breit anzeigen' }).click();
  await expect(page).toHaveURL(/#\/chronik/);
  await page.locator('select').nth(1).selectOption('*');
  expect(await page.locator('.chron .step').count()).toBeGreaterThanOrEqual(2);
});

// ------------------------------------------------------------------ 3 Vergleich und Sprachvergleich
test('Ablauf 3: zwei Stände vergleichen (nebeneinander, Redline) und Sprachvergleich', async ({ page }) => {
  await open(page, '#/lesen');
  const t = await target(page);
  const i = await info(page);
  await page.goto(`${APP}#/vergleich?u=${t.u}&a=${i.first}&b=${i.latest}`);
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
  await expect(page.locator('.cmp-side')).toBeVisible();
  expect(await page.locator('.cmp-row.st-changed, .cmp-row.st-ins, .cmp-row.st-del').count()).toBeGreaterThan(0);
  expect(await page.locator('.cmp ins, .cmp del').count()).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Redline' }).click();
  await expect(page.locator('.cmp-redline')).toBeVisible();
  expect(hashParam(page, 'lay')).toBe('redline');
  await page.getByRole('button', { name: 'Volltext' }).click();
  expect(await page.locator('.cmp-row.st-same').count()).toBeGreaterThan(0);
  // Sprachvergleich DE neben FR
  await page.getByRole('button', { name: 'Sprachen' }).click();
  await expect(page.locator('.cmp-headrow')).toContainText('Französisch');
  const right = await page.locator('.cmp-row:not(.cmp-headrow) .cmp-c:nth-child(3)').first().innerText();
  expect(right).toMatch(/[éèàç]|\b(les|des|du|la|le)\b/);
  // EN statt FR
  await page.locator('label.field', { hasText: 'Rechts' }).locator('select').selectOption('en');
  await expect(page.locator('.cmp-headrow')).toContainText('Englisch');
});

// ------------------------------------------------------------------ 4 Matrix
test('Ablauf 4: Änderungsmatrix, Klick öffnet Vergleich', async ({ page }) => {
  await open(page, '#/uebersicht');
  const cells = page.locator('.mx-cell button');
  expect(await cells.count()).toBeGreaterThan(0);
  await expect(page.locator('.tl-row').first()).toBeVisible();
  await cells.first().click();
  await expect(page).toHaveURL(/#\/vergleich/);
  expect(hashParam(page, 'a')).toBeTruthy();
  expect(hashParam(page, 'b')).toBeTruthy();
  await expect(page.locator('.cmp')).toBeVisible();
});

// ------------------------------------------------------------------ 5 Export
async function exportVia(page, scope, item) {
  await page.locator(`${scope} .export-menu > button`).click();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.getByRole('menuitem', { name: new RegExp('^' + item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click()]);
  const f = join(ROOT, 'test/app/out', dl.suggestedFilename());
  await dl.saveAs(f);
  return { file: f, buf: readFileSync(f), name: dl.suggestedFilename() };
}

test('Ablauf 5: Karte als PNG und PDF (A4, 16:9) und Sammelkorb als ein PDF', async ({ page }) => {
  const log = await open(page, '#/lesen');
  const t = await target(page);
  await page.goto(`${APP}#/lesen?u=${t.u}&k=${t.k}`);
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
  const png = await exportVia(page, '.panel', 'PNG A4');
  const s = pngSize(png.buf);
  expect(s.w).toBe(794 * 2);
  expect(s.h).toBeGreaterThan(400);
  expect(png.buf.length).toBeGreaterThan(20000);
  writeFileSync(join(SHOTS, 'export-chronologie-a4.png'), png.buf);
  const png169 = await exportVia(page, '.panel', 'PNG 16:9');
  expect(pngSize(png169.buf).w).toBe(1280 * 2);
  writeFileSync(join(SHOTS, 'export-chronologie-16x9.png'), png169.buf);
  const pdf = await exportVia(page, '.panel', 'PDF A4');
  const doc = await PDFDocument.load(pdf.buf);
  expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  const { width, height } = doc.getPage(0).getSize();
  expect(Math.round(width)).toBe(595);
  expect(Math.round(height)).toBe(842);
  writeFileSync(join(ROOT, 'test/app/out/export-chronologie-a4.pdf'), pdf.buf);
  // Vergleichskarte 16:9 als PDF
  const i = await info(page);
  await page.goto(`${APP}#/vergleich?u=${t.u}&a=${i.first}&b=${i.latest}`);
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
  const pdf169 = await exportVia(page, '.view-compare', 'PDF 16:9');
  const d169 = await PDFDocument.load(pdf169.buf);
  const p0 = d169.getPage(0).getSize();
  expect(p0.width).toBeGreaterThan(p0.height);
  writeFileSync(join(ROOT, 'test/app/out/export-vergleich-16x9.pdf'), pdf169.buf);
  // ganzer Artikel als PDF A4: mehrseitig
  const pdfLong = await exportVia(page, '.view-compare', 'PDF A4');
  const dl2 = await PDFDocument.load(pdfLong.buf);
  console.log('Vergleich ganze Einheit, PDF A4:', dl2.getPageCount(), 'Seiten');
  writeFileSync(join(ROOT, 'test/app/out/export-vergleich-einheit-a4.pdf'), pdfLong.buf);
  // eine Bestimmung als PNG
  await page.goto(`${APP}#/vergleich?u=${t.u}&k=${t.k}&a=${i.first}&b=${i.latest}`);
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
  const cmpPng = await exportVia(page, '.view-compare', 'PNG A4');
  expect(pngSize(cmpPng.buf).w).toBe(1588);
  writeFileSync(join(SHOTS, 'export-vergleich-a4.png'), cmpPng.buf);
  const cmpPng169 = await exportVia(page, '.view-compare', 'PNG 16:9');
  writeFileSync(join(SHOTS, 'export-vergleich-16x9.png'), cmpPng169.buf);
  // Sammelkorb: zwei Karten, ein PDF
  await page.locator('.view-compare .export-menu > button').click();
  await page.getByRole('menuitem', { name: 'In Sammelkorb (A4)' }).click();
  await page.goto(`${APP}#/lesen?u=${t.u}&k=${t.k}`);
  await page.locator('.panel .export-menu > button').click();
  await page.getByRole('menuitem', { name: 'In Sammelkorb (16:9)' }).click();
  await expect(page.locator('#btn-basket .badge')).toHaveText('2');
  await page.locator('#btn-basket').click();
  await expect(page.locator('.bk-item')).toHaveCount(2);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.locator('#btn-basket-pdf').click()]);
  const f = join(ROOT, 'test/app/out', dl.suggestedFilename());
  await dl.saveAs(f);
  const bd = await PDFDocument.load(readFileSync(f));
  expect(bd.getPageCount()).toBeGreaterThanOrEqual(2);
  console.log('Sammelkorb-PDF:', dl.suggestedFilename(), bd.getPageCount(), 'Seiten');
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
});

// ------------------------------------------------------------------ 6 Anwendbar per Datum, alle beschlossenen
test('Ablauf 6: Sicht anwendbares Recht per Datum (berechnet) und alle beschlossenen Änderungen', async ({ page }) => {
  await open(page, '#/lesen?u=art_8&m=datum&d=2020-01-01');
  await expect(page.locator('.notice-computed')).toContainText('Berechnete Sicht');
  const r = await page.evaluate(() => {
    const d = window.__sgk.data();
    const v = d.composeAt('art_8', 'de', '2020-01-01');
    const dom = [...document.querySelectorAll('.legal-read .blk')].map((e) => e.dataset.k);
    const bad = (v.blocks || []).filter((b) => b.o && !d.includedAt(b.o, '2020-01-01')).map((b) => b.k);
    const latest = d.version('art_8', 'de', d.latest.id).blocks.map((b) => b.k);
    return { dom, keys: (v.blocks || []).map((b) => b.k), bad, latest };
  });
  expect(r.dom).toEqual(r.keys);
  expect(r.bad).toEqual([]);
  expect(r.keys).not.toEqual(r.latest);
  // Datum ändern über das Feld
  await page.locator('input[type="date"]').fill('2026-11-11');
  await page.locator('input[type="date"]').dispatchEvent('change');
  await expect(page).toHaveURL(/d=2026-11-11/);
  // Alle beschlossenen Änderungen: noch nicht anwendbare Stellen schraffiert
  await page.getByRole('button', { name: 'Alle beschlossenen Änderungen' }).click();
  await expect(page.locator('.notice-info')).toContainText('Alle beschlossenen Änderungen');
  expect(await page.locator('.blk.is-pending').count()).toBeGreaterThan(0);
  await expect(page.locator('.mark-pend').first()).toContainText('nicht anwendbar');
});

// ------------------------------------------------------------------ 7 Aktualisieren: SPARQL (gemockt und echt), Upload, Projektdatei
const binding = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { type: 'literal', value: v }]));
test('Ablauf 7a: auf neue Fassungen prüfen (SPARQL gemockt)', async ({ page }) => {
  let calls = 0;
  await page.route('https://publications.europa.eu/**', async (route) => {
    calls++;
    const q = decodeURIComponent(new URL(route.request().url()).searchParams.get('query') || '');
    let rows = [];
    if (q.includes('STRSTARTS')) rows = [{ celex: '02016R0399-20240710', date: '2024-07-10' }, { celex: '02016R0399-20261002', date: '2026-10-02' }];
    else if (q.includes('GROUP_CONCAT')) rows = [{ celex: '32016R0399R(08)', langs: 'MLT' }];
    else rows = [
      { celex: '32017R2225', rel: 'http://publications.europa.eu/ontology/cdm#resource_legal_amends_resource_legal', date: '2017-11-30', title: 'Verordnung (EU) 2017/2225' },
      { celex: '32026R9999', rel: 'http://publications.europa.eu/ontology/cdm#resource_legal_amends_resource_legal', date: '2026-10-20', title: 'Verordnung (EU) 2026/9999 zur Änderung' },
      { celex: '32016R0399R(08)', rel: 'http://publications.europa.eu/ontology/cdm#resource_legal_corrects_resource_legal', date: '2026-10-02' },
    ];
    await fulfillSparql(route, rows.map(binding));
  });
  await open(page, '#/aktualisieren');
  expect(calls).toBe(0);
  await page.locator('#btn-check').click();
  await expect(page.locator('#tbl-cons tbody tr')).toHaveCount(2);
  const newCons = page.locator('#tbl-cons tr.is-new');
  await expect(newCons).toHaveCount(1);
  await expect(newCons).toContainText('02016R0399-20261002');
  await expect(newCons.locator('a').first()).toHaveAttribute('href', 'https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:02016R0399-20261002');
  await expect(page.locator('#tbl-acts tr.is-new')).toContainText('32026R9999');
  await expect(page.locator('#tbl-acts tr', { hasText: '32016R0399R(08)' })).toContainText('MLT');
  expect(calls).toBe(4); // konsolidierte Fassungen, deren Sprachen, Akte, Sprachen der Berichtigungen
});

test('Ablauf 7a: Fehlerfall kein Netz wird verständlich gemeldet', async ({ page }) => {
  await page.route('https://publications.europa.eu/**', (route) => route.abort('internetdisconnected'));
  await open(page, '#/aktualisieren');
  await page.locator('#btn-check').click();
  await expect(page.locator('.notice-error')).toContainText('Keine Verbindung');
});

test('Ablauf 7b: SPARQL echt gegen den Endpunkt', { tag: '@netz' }, async ({ page }) => {
  test.skip(!!process.env.OFFLINE, 'OFFLINE gesetzt');
  test.skip(!(await endpointReachable(page)), 'Endpunkt nicht erreichbar (kein Netz)');
  await open(page, '#/aktualisieren');
  await page.locator('#btn-check').click();
  await expect(page.locator('#tbl-cons tbody tr').first()).toBeVisible({ timeout: 60000 });
  await expect(page.locator('#tbl-cons')).toContainText('02016R0399-20251012');
  await expect(page.locator('#tbl-acts')).toContainText('32017R2225');
  await expect(page.locator('#tbl-acts')).toContainText('52024PC0670');
  console.log('SPARQL echt:', await page.locator('#chk-result').innerText());
  await page.screenshot({ path: join(SHOTS, '1440-aktualisieren-sparql-echt.png'), fullPage: false });
  await page.locator('#tbl-acts').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(SHOTS, '1440-aktualisieren-sparql-echt-akte.png') });
});

test('Ablauf 7c: Upload, Fehlerfälle mit echten Dateien aus raw/', { tag: '@daten' }, async ({ page }) => {
  test.skip(['32017R2225_DE.html', '32016R0399_DE.html', '02016R0399-20240710_DE.html'].some((f) => !existsSync(RAW(f))), 'raw/ bzw. test/app/fixtures-live/ fehlt (node test/app/tools/fetch-eurlex.mjs …)');
  await open(page, '#/aktualisieren');
  // Änderungsakt statt konsolidierter Fassung
  await page.locator('#file-input').setInputFiles(RAW('32017R2225_DE.html'));
  await expect(page.locator('.up-log li')).toHaveCount(1, { timeout: 60000 });
  await expect(page.locator('.up-log li.err')).toContainText(/betrifft 32017R2225|Parser|Kernbibliothek/);
  // Basisakt (Amtsblatt-Fassung) statt konsolidierter Fassung
  await page.locator('#file-input').setInputFiles(RAW('32016R0399_DE.html'));
  await expect(page.locator('.up-log li').first()).toContainText(/nur konsolidierte Fassungen|Parser|Kernbibliothek/, { timeout: 60000 });
  // keine EUR-Lex-Datei
  await page.locator('#file-input').setInputFiles({ name: 'notiz.html', mimeType: 'text/html', buffer: Buffer.from('<html><body><p>Notiz</p></body></html>') });
  await expect(page.locator('.up-log li').first()).toContainText('EUR-Lex');
  // bereits enthaltene Fassung (nur mit echten Daten sinnvoll)
  const i = await info(page);
  if (!i.fixtures) {
    await page.locator('#file-input').setInputFiles(RAW('02016R0399-20240710_DE.html'));
    await expect(page.locator('.up-log li').first()).toContainText(/bereits im Datensatz/, { timeout: 90000 });
  }
});

test('Ablauf 7c: Upload einer echten konsolidierten Fassung erzeugt neuen Stand (persistiert)', { tag: '@daten' }, async ({ page }) => {
  test.skip(!existsSync(RAW('02016R0399-20251012_DE.html')), 'raw/ bzw. test/app/fixtures-live/ fehlt');
  test.skip(!existsSync(join(ROOT, 'test/app/out/sgk-navigator-upload.html')), 'Testvariante fehlt');
  await open(page, '#/aktualisieren', APP_UPLOAD);
  const before = await info(page);
  test.skip(before.fixtures, 'Nur mit echten Daten (Fixtures enthalten keinen SGK-Text)');
  const hasCore = await page.evaluate(() => document.body.innerText.length >= 0 && window.__sgk.data().notes);
  void hasCore;
  await page.locator('#file-input').setInputFiles(RAW('02016R0399-20251012_DE.html'));
  await expect(page.locator('.up-log li')).toHaveCount(1, { timeout: 120000 });
  await expect(page.locator('.up-log li.ok')).toContainText(/SGK, Fassung vom 12\. Oktober 2025, DE geladen \(Stand s\d+\)/);
  // erneuter Upload derselben Datei wird als Duplikat erkannt
  await page.locator('#file-input').setInputFiles(RAW('02016R0399-20251012_DE.html'));
  await expect(page.locator('.up-log li').first()).toContainText('bereits im Datensatz', { timeout: 120000 });
  const after = await info(page);
  expect(after.stages.length).toBe(before.stages.length + 1);
  await expect(page.locator('#tbl-uploads tbody tr')).toHaveCount(1);
  // nach Neuladen weiterhin vorhanden (IndexedDB)
  await page.reload();
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
  await page.waitForFunction((n) => window.__sgk.data().stages.length === n, after.stages.length, { timeout: 60000 });
  // der neue Stand ist lesbar
  const newStage = after.latest;
  await page.goto(`${APP_UPLOAD}#/lesen?u=art_8&s=${newStage}`);
  await expect(page.locator('.legal-read .blk').first()).toBeVisible();
  // Projektdatei exportieren und in frischem Kontext importieren
  await page.goto(`${APP_UPLOAD}#/aktualisieren`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-export-project').click()]);
  const pf = join(ROOT, 'test/app/out', dl.suggestedFilename());
  await dl.saveAs(pf);
  const proj = JSON.parse(readFileSync(pf, 'utf8'));
  expect(proj.format).toBe('sgk-projekt');
  expect(proj.uploads.length).toBe(1);
});

test('Ablauf 7d: Projektdatei exportieren und importieren', async ({ page, browser }) => {
  await open(page, '#/lesen?u=art_8&k=p3.a.i');
  await page.locator('.panel .export-menu > button').click();
  await page.getByRole('menuitem', { name: 'In Sammelkorb (A4)' }).click();
  await page.goto(APP + '#/aktualisieren');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-export-project').click()]);
  const pf = join(ROOT, 'test/app/out', 'projekt-test.json');
  await dl.saveAs(pf);
  const proj = JSON.parse(readFileSync(pf, 'utf8'));
  expect(proj.format).toBe('sgk-projekt');
  expect(proj.basket.length).toBe(1);
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await open(p2, '#/aktualisieren');
  await p2.locator('#project-input').setInputFiles(pf);
  await expect(p2.locator('.notice-success')).toContainText('Importiert: 0 Fassungen, 1 Karte');
  await expect(p2.locator('#btn-basket .badge')).toHaveText('1');
  // falsche Datei
  await p2.locator('#project-input').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') });
  await expect(p2.locator('.notice-error')).toContainText('keine Projektdatei');
  await ctx2.close();
});

// ------------------------------------------------------------------ 8 Deep Links
test('Ablauf 8: Deep Link mit Ansicht, Einheit, Bestimmung, Stand und Sprache', async ({ page }) => {
  await open(page, '#/lesen');
  const t = await target(page);
  const i = await info(page);
  await page.goto(`${APP}#/lesen?u=${t.u}&k=${t.k}&s=${i.first}&l=fr`);
  await page.reload();
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
  await expect(page.locator('.panel')).toBeVisible();
  await expect(page.locator('.legal-read')).toHaveAttribute('lang', 'fr');
  expect(hashParam(page, 'ui')).toBe('de'); // Oberflächensprache unabhängig vom Rechtstext
  await expect(page.locator(`.stagebar .stg[aria-pressed="true"]`)).toHaveCount(1);
  expect(await page.locator('.stagebar .stg').first().getAttribute('aria-pressed')).toBe('true');
  await expect(page.locator(`.blk[data-k="${t.k}"]`)).toHaveClass(/is-sel/);
  // Zitierweise folgt der Oberflächensprache, nicht dem Rechtstext
  if (t.u === 'art_8' && t.k === 'p3.a.i') await expect(page.locator('.panel-title')).toHaveText('Art. 8 Abs. 3 Bst. a Ziff. i SGK');
  if (t.u === 'art_8' && t.k === 'p3.a.i') {
    await page.goto(`${APP}#/lesen?u=${t.u}&k=${t.k}&s=${i.first}&l=de&ui=fr`);
    await expect(page.locator('.panel-title')).toHaveText('art. 8, par. 3, point a) i), CFS');
    await expect(page.locator('.legal-read')).toHaveAttribute('lang', 'de');
    await page.goto(`${APP}#/lesen?u=${t.u}&k=${t.k}&s=${i.first}&l=fr&ui=de`);
    await expect(page.locator('.panel-title')).toHaveText('Art. 8 Abs. 3 Bst. a Ziff. i SGK');
  }
  // Zurück-Navigation im Browser
  await page.locator('.views a', { hasText: 'Übersicht' }).click();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`k=${t.k.replace(/\./g, '\\.')}`));
});

// ------------------------------------------------------------------ Screenshots
test('Druckansicht: Lesen als PDF über Druckmedien', async ({ page }) => {
  await open(page, '#/lesen?u=art_8');
  await page.emulateMedia({ media: 'print' });
  await page.screenshot({ path: join(SHOTS, 'druck-lesen.png') });
  const buf = await page.pdf({ format: 'A4' });
  const doc = await PDFDocument.load(buf);
  expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
  writeFileSync(join(ROOT, 'test/app/out/druck-lesen-art8.pdf'), buf);
});
