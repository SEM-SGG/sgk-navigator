// UI-Tests Modul Verhandlung (Etappe 2) gegen dist/sgk-navigator.html über file://.
// Aufruf: npx playwright test -c test/app/playwright.config.mjs test/app/neg.spec.mjs
// Echte Dateien: raw-neg/ST-8413-2023.pdf und ST-10863-2023.pdf (öffentliche Vier-Spalten-Tabellen des Rats, Screening, Fassungen 1 und 2),
// selbst erzeugte Word-Tabellen test/app/fixtures/neg-fourcol*.docx, Beispiel-Dossier(s) aus data/neg-demo*.json.
import { test, expect } from '@playwright/test';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { layoutCheck, buttonCheck } from './helpers.mjs';
import { editDocx, rowsWithId, fillCell, fillGeneral, addComment } from '../neg/helpers.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const APP = 'file://' + join(ROOT, 'dist/sgk-navigator.html');
const OUT = join(ROOT, 'test/app/out');
const SHOTS = join(ROOT, 'test/app/screenshots');
const FIX = join(ROOT, 'test/app/fixtures');
const RAW = join(ROOT, 'raw-neg');
mkdirSync(OUT, { recursive: true });
mkdirSync(SHOTS, { recursive: true });
test.use({ actionTimeout: 20000 });
const DEMO_KEYS = existsSync(join(ROOT, 'data')) ? readdirSync(join(ROOT, 'data')).filter((f) => /^neg-demo[\w-]*\.json$/.test(f)).map((f) => f.replace(/^neg-/, '').replace(/\.json$/, '')) : [];

async function open(page, hash = '#/dossiers?ui=de') {
  const log = { errors: [], requests: [] };
  // Kürzel der bearbeitenden Person voreinstellen (Etappe 3: sonst fragt das erste Speichern einer Position danach)
  await page.addInitScript(() => { try { if (!localStorage.getItem('sgkn.by')) localStorage.setItem('sgkn.by', 'TS'); } catch { /* */ } });
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push(m.text()); });
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  page.on('request', (r) => { const u = r.url(); if (!/^(file|data|blob):/.test(u)) log.requests.push(u); });
  await page.goto(APP + hash);
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready, null, { timeout: 30000 });
  return log;
}
async function nav(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForTimeout(80);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
const dossier = (page) => page.evaluate(() => window.__sgk.neg.dossier());
const dossierId = (page) => page.evaluate(() => window.__sgk.neg.dossier() && window.__sgk.neg.dossier().id);
async function loadDemo(page, key = 'demo') {
  await nav(page, '#/dossiers');
  await page.locator('#btn-demo').click();
  await page.locator('#demo-load-' + key).click();
  await expect(page).toHaveURL(/#\/synopse\?.*ds=/);
  await page.waitForSelector('.syn-row:not(.syn-headrow)');
  return dossierId(page);
}
async function newDossier(page, title, proc = '') {
  await nav(page, '#/dossiers');
  await page.locator('#btn-new-dossier').click();
  await page.fill('#nd-title-in', title);
  await page.fill('#nd-proc-in', proc);
  await page.locator('.nnew button[type=submit]').click();
  await expect(page).toHaveURL(/#\/import\?.*ds=/);
  return dossierId(page);
}
/** Datei importieren bis zur Übernahme; mehrdeutige Zeilen dem besten Kandidaten zuordnen. Liefert die Kennzahlen der Prüfmaske. */
async function importFile(page, file, { expectProgress = false } = {}) {
  await page.setInputFiles('#neg-import-file', file);
  if (expectProgress) await expect(page.locator('.nprog')).toBeVisible({ timeout: 8000 });
  await page.waitForSelector('#imp-next', { timeout: 150000 });
  await page.locator('#imp-next').click();
  await page.waitForSelector('#imp-apply');
  const sum = await page.locator('.nsum-v').allInnerTexts();
  if (await page.locator('#imp-amb-best').count() && await page.locator('#imp-amb-best').isEnabled()) await page.locator('#imp-amb-best').click();
  await expect(page.locator('#imp-apply')).toBeEnabled();
  await page.locator('#imp-apply').click();
  await page.waitForSelector('.nchg-sec');
  return sum.map((x) => Number(x.replace(/\D/g, '')));
}
async function download(page, action) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), action()]);
  const f = join(OUT, dl.suggestedFilename());
  await dl.saveAs(f);
  return { name: dl.suggestedFilename(), path: f, bytes: new Uint8Array(readFileSync(f)) };
}
function docxXml(bytes) {
  const files = unzipSync(bytes);
  expect(files['word/document.xml'], 'word/document.xml im ZIP').toBeTruthy();
  return strFromU8(files['word/document.xml']);
}
async function pdfInfo(buf) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, verbosity: 0 });
  const doc = await task.promise;
  let text = '';
  for (let i = 1; i <= Math.min(doc.numPages, 6); i++) text += (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(' ') + '\n';
  const n = doc.numPages;
  await task.destroy();
  return { pages: n, text: text.replace(/\s+/g, ' ') };
}

// ------------------------------------------------------------------ Start, Modulwechsel
test('Start ohne Konsolenfehler und ohne Netzwerk; Modulwechsel SGK ↔ Verhandlung, eigener Speicher', async ({ page }) => {
  const log = await open(page, '#/uebersicht?ui=de');
  await expect(page.locator('.modbar-tab[aria-current="page"]')).toContainText('SGK');
  await expect(page.locator('#btn-basket')).toBeVisible();
  await page.locator('.modbar-tab', { hasText: 'Verhandlung' }).click();
  await expect(page).toHaveURL(/#\/dossiers/);
  await expect(page.locator('.modbar-tab[aria-current="page"]')).toContainText('Verhandlung');
  await expect(page.locator('.views a[aria-current="page"]')).toHaveText('Dossiers');
  await expect(page.locator('#btn-basket')).toHaveCount(0);
  await expect(page.locator('.neg-empty-title')).toHaveText('Noch kein Dossier');
  await expect(page.locator('.nconf')).toContainText('Vertraulich');
  await nav(page, '#/position?ui=de');
  await expect(page.locator('.neg-empty-title')).toHaveText('Kein Dossier gewählt');
  await page.locator('.modbar-tab', { hasText: 'SGK' }).click();
  await expect(page).toHaveURL(/#\/uebersicht/);
  await expect(page.locator('#btn-basket')).toBeVisible();
  // Rückkehr in die zuletzt besuchte Ansicht des Moduls
  await page.locator('.modbar-tab', { hasText: 'Verhandlung' }).click();
  await expect(page).toHaveURL(/#\/position/);
  // IndexedDB des Moduls getrennt vom SGK-Modul
  expect(await page.evaluate(() => indexedDB.databases().then((l) => l.map((x) => x.name).sort()))).toContain('sgk-navigator-neg');
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
});

// ------------------------------------------------------------------ Beispiel-Dossier und Synopse
test('Beispiel-Dossier laden; Synopse: Spuren, Fassungswahl, Diff-Modi, Filter, Suche, Gliederung, Zeile öffnen, Im SGK öffnen', async ({ page }) => {
  test.setTimeout(180000);
  const log = await open(page);
  await page.locator('#btn-demo').click();
  await expect(page.locator('.ndemo-item')).toHaveCount(DEMO_KEYS.length || 1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#ndemo-h')).toHaveCount(0);
  const id = await loadDemo(page);
  const d = await dossier(page);
  expect(d.demo).toBe(true);
  await expect(page.locator('.dbar .tag-demo')).toHaveText('Beispiel');
  // Seitenweises Rendern: nicht alle Zeilen sofort im DOM, fixierte Kopfzeile
  const rendered = await page.locator('.syn-row:not(.syn-headrow)').count();
  expect(rendered).toBeGreaterThan(20);
  expect(rendered).toBeLessThan(d.rows.length);
  expect(await page.locator('.syn-headrow').evaluate((e) => getComputedStyle(e).position)).toBe('sticky');
  await page.locator('#syn-scroll').evaluate((e) => { e.scrollTop = e.scrollHeight; });
  await expect.poll(() => page.locator('.syn-row:not(.syn-headrow)').count()).toBeGreaterThan(rendered);
  // Spuren ein- und ausblenden
  await expect(page.locator('.syn-hc:not(.syn-hpos)')).toHaveCount(4);
  await page.locator('.trk-btn').nth(1).click();
  await expect(page.locator('.syn-hc:not(.syn-hpos)')).toHaveCount(3);
  expect(page.url()).toContain('nh=ep');
  await page.locator('.trk-btn').nth(1).click();
  await expect(page.locator('.syn-hc:not(.syn-hpos)')).toHaveCount(4);
  // Fassung je Spur wählen (Kommission: Vorschlag statt jüngste Fassung)
  const comDocs = d.documents.filter((x) => x.tracks.includes('com'));
  await page.locator('.syn-hc').first().locator('select').selectOption(comDocs[0].id);
  expect(page.url()).toContain('nv=com%3A' + comDocs[0].id);
  await expect(page.locator('.syn-hc').first().locator('.syn-hc-doc')).toContainText(comDocs[0].ref);
  // Diff-Modi (Markierung nie nur über Farbe: ins unterstrichen, del durchgestrichen)
  await page.selectOption('#syn-diff', 'com');
  await expect(page.locator('.syn-table ins').first()).toBeVisible();
  expect(await page.locator('.syn-table ins').first().evaluate((e) => getComputedStyle(e).textDecorationLine)).toContain('underline');
  await page.selectOption('#syn-diff', 'prev');
  expect(await page.locator('.syn-c.is-diff').count()).toBeGreaterThan(0);
  await page.selectOption('#syn-diff', 'tracks');
  await page.selectOption('#syn-da', 'com');
  await page.selectOption('#syn-db', 'council');
  await expect(page.locator('.syn-hc-diff')).toHaveCount(1);
  await page.selectOption('#syn-diff', 'none');
  await expect(page.locator('.syn-table ins')).toHaveCount(0);
  // Auszeichnung der Quelle ein/aus
  const withMarkup = await page.locator('.syn-table .ncell s, .syn-table .ncell b').count();
  await page.locator('#syn-view').click();
  await page.locator('#syn-markup').uncheck();
  expect(page.url()).toContain('nm=0');
  expect(await page.locator('.syn-table .ncell s, .syn-table .ncell b').count()).toBeLessThanOrEqual(withMarkup);
  await page.locator('#syn-markup').check();
  await page.keyboard.press('Escape');
  // Filter: mit Position, Haltung, Priorität, Status, geändert seit, Stichwort
  const total = d.rows.length;
  const nPos = Object.keys(d.positions).length;
  await expect(page.locator('#syn-filters')).toHaveCount(0);
  await page.locator('#syn-filter-btn').click();
  await page.selectOption('#syn-fpos', 'with');
  await expect(page.locator('.syn-count-n')).toContainText(`${nPos} von ${total} Zeilen`);
  await expect(page.locator('#syn-filter-btn .badge')).toHaveText('1');
  await expect(page.locator('.fchip')).toHaveText('mit Position');
  await expect(page.locator('.syn-row:not(.syn-headrow)')).toHaveCount(nPos);
  await page.selectOption('#syn-prio', 'high');
  expect(await page.locator('.syn-row:not(.syn-headrow)').count()).toBeLessThanOrEqual(nPos);
  await expect(page.locator('.fchip')).toHaveCount(2);
  await page.locator('.syn-reset').click();
  await expect(page.locator('.fchip')).toHaveCount(0);
  await expect(page.locator('.syn-count-n')).toHaveText(`${total} Zeilen`);
  await page.selectOption('#syn-status', 'none');
  await expect(page.locator('.syn-count-n')).toContainText('von');
  await page.selectOption('#syn-status', '');
  const sinceDoc = [...d.documents].sort((a, b) => a.date.localeCompare(b.date)).slice(-2)[0];
  await page.selectOption('#syn-since', sinceDoc.id);
  const sinceText = await page.locator('.syn-count-n').innerText();
  expect(Number(sinceText.split(' von ')[0].replace(/\D/g, ''))).toBeLessThan(total);
  await page.selectOption('#syn-since', '');
  await page.fill('#syn-q', 'screening OR nonexistentword');
  await expect(page.locator('.syn-none')).toBeVisible();
  await page.fill('#syn-q', 'border');
  const qText = await page.locator('.syn-count-n').innerText();
  const nq = Number(qText.split(' von ')[0].replace(/\D/g, ''));
  expect(nq).toBeGreaterThan(0);
  expect(nq).toBeLessThan(total);
  expect(page.url()).toContain('nq=border');
  await page.fill('#syn-q', '');
  // Gliederung mit Zählern springt zur Gruppe
  const groups = page.locator('.syn-groups > li > .syn-g');
  expect(await groups.count()).toBeGreaterThan(2);
  await expect(groups.first().locator('.syn-g-n')).toHaveText(/\d+/);
  await groups.last().click();
  await page.waitForTimeout(200);
  // Zeile öffnen: Detail mit Position, Chronologie, Vergleich, Rückmeldungen, Bearbeiten; Blättern
  await page.locator('.syn-open').first().click();
  await expect(page.locator('.npanel')).toBeVisible();
  const r1 = new URL(page.url()).hash.match(/r=(r\d+)/)[1];
  await page.locator('#ndt-chron').click();
  expect(await page.locator('.nchron .step').count()).toBeGreaterThan(0);
  await page.locator('#ndt-compare').click();
  await expect(page.locator('.nd-cmp, .npanel .muted').first()).toBeVisible();
  await page.locator('.npanel .panel-tools button', { hasText: 'Nächste' }).click();
  await expect(page).not.toHaveURL(new RegExp('r=' + r1 + '(&|$)'));
  await page.keyboard.press('Escape');
  await expect(page.locator('.npanel')).toHaveCount(0);
  // Deep Link mit Zeile; Im SGK öffnen bei amends
  const amendRow = d.rows.find((r) => r.amends && r.amends.work === 'sgk' && r.amends.unit);
  await nav(page, `#/synopse?ds=${id}&r=${amendRow.id}&ui=de`);
  await expect(page.locator('#syn-' + amendRow.id)).toHaveClass(/is-active/);
  await page.locator('.npanel a', { hasText: 'Im SGK öffnen' }).click();
  await expect(page).toHaveURL(new RegExp('#/lesen\\?u=' + amendRow.amends.unit));
  await expect(page.locator('.modbar-tab[aria-current="page"]')).toContainText('SGK');
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
});

test('Zweites Beispiel-Dossier (Screening, fünf Fassungen): Synopse mit Vorfassungs-Diff und "Was ist neu"', async ({ page }) => {
  test.skip(!DEMO_KEYS.includes('demo-screening'), 'data/neg-demo-screening.json fehlt');
  const log = await open(page);
  const id = await loadDemo(page, 'demo-screening');
  const d = await dossier(page);
  expect(d.documents.length).toBe(5);
  expect(d.rows.length).toBeGreaterThan(300);
  await nav(page, `#/synopse?ds=${id}&nd=prev&ui=de`);
  expect(await page.locator('.syn-c.is-diff').count()).toBeGreaterThan(0);
  const docs = [...d.documents].sort((a, x) => a.date.localeCompare(x.date));
  await nav(page, `#/import?ds=${id}&nkt=changes&po=${docs[1].id}&ui=de`);
  expect(await page.locator('.nchg-item').count()).toBeGreaterThan(0);
  // beide Beispiele nebeneinander in der Liste
  await loadDemo(page, 'demo');
  await nav(page, '#/dossiers?ui=de');
  await expect(page.locator('.nlist tbody tr')).toHaveCount(2);
  expect(log.errors).toEqual([]);
});

// ------------------------------------------------------------------ Import echter Vier-Spalten-PDF
test('Import echter Vier-Spalten-PDF (ST 8413/23) in neues Dossier, Folgefassung ST 10863/23 mit "Was ist neu", Import rückgängig', { tag: '@daten' }, async ({ page }) => {
  test.skip(!existsSync(join(RAW, 'ST-8413-2023.pdf')) || !existsSync(join(RAW, 'ST-10863-2023.pdf')), 'raw-neg/ fehlt (öffentliche Ratsdokumente, siehe scripts/neg/fetch-raw.mjs)');
  test.setTimeout(300000);
  const log = await open(page);
  await newDossier(page, 'Screening (Test)', '2020/0278(COD)');
  await expect(page.locator('.nstepper li.is-current')).toContainText('Datei');
  await page.setInputFiles('#neg-import-file', join(RAW, 'ST-8413-2023.pdf'));
  await expect(page.locator('.nprog')).toBeVisible({ timeout: 8000 });
  await page.waitForSelector('#imp-next', { timeout: 150000 });
  // Erkennung mit Vorschlag
  await expect(page.locator('#imp-ref')).toHaveValue('ST 8413/23');
  await expect(page.locator('#imp-kind')).toHaveValue('four-column');
  expect(await page.locator('#imp-date').inputValue()).toMatch(/^2023-04-2\d$/);
  // Spaltenzuordnung mit Vorschau
  expect(await page.locator('.nmap-sel').evaluateAll((l) => l.map((s) => s.value))).toEqual(['com', 'ep', 'council', 'agreement']);
  expect(await page.locator('.nmap tbody tr').count()).toBeGreaterThan(0);
  await expect(page.locator('.nwarn')).toBeVisible();
  await page.locator('#imp-next').click();
  await expect(page.locator('.nsum')).toBeVisible();
  await page.locator('#imp-apply').click();
  await page.waitForSelector('.nchg-sec');
  let d = await dossier(page);
  expect(d.documents).toHaveLength(1);
  expect(d.rows.length).toBeGreaterThan(300);
  // Folgefassung
  await nav(page, `#/import?ds=${d.id}&ui=de`);
  const sum = await importFile(page, join(RAW, 'ST-10863-2023.pdf'));
  expect(sum[0]).toBeGreaterThan(50);            // unverändert
  expect(sum[1]).toBeGreaterThan(10);            // geändert
  d = await dossier(page);
  expect(d.documents).toHaveLength(2);
  await expect(page.locator('.nhead-title')).toContainText('ST 10863/23');
  await expect(page.locator('.nchg-sec')).toHaveCount(4);
  expect(await page.locator('.nchg-item').count()).toBeGreaterThan(10);
  expect(await page.locator('.nchg-item ins, .nchg-item del').count()).toBeGreaterThan(5);
  await expect(page.locator('.dbar .nclass')).toHaveText(/LIMITE/);
  await page.screenshot({ path: join(SHOTS, 'neg-1440-de-was-ist-neu.png') });
  // Synopse: geändert seit Fassung 1
  await page.locator('.nhead ~ .toolbar button', { hasText: 'In der Synopse zeigen' }).click();
  await expect(page).toHaveURL(/nfc=/);
  const cnt = await page.locator('.syn-count-n').innerText();
  expect(Number(cnt.split(' von ')[0].replace(/\D/g, ''))).toBeGreaterThan(5);
  // Import rückgängig: Fassung entfernen, dann Rückgängig
  await nav(page, `#/import?ds=${d.id}&ui=de`);
  await page.locator('button[aria-label="Fassung ST 10863/23 entfernen"]').click();
  await page.locator('.modal .btn-danger').click();
  await expect.poll(async () => (await dossier(page)).documents.length).toBe(1);
  await page.locator('.dbar button', { hasText: 'Rückgängig' }).click();
  await expect.poll(async () => (await dossier(page)).documents.length).toBe(2);
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
});

// ------------------------------------------------------------------ Import Word
test('Import einer selbst erzeugten Vier-Spalten-Tabelle (.docx) und einer Folgefassung', async ({ page }) => {
  const log = await open(page);
  await newDossier(page, 'Docx-Test', '2099/0002(COD)');
  await importFile(page, join(FIX, 'neg-fourcol.docx'));
  let d = await dossier(page);
  expect(d.rows.map((r) => r.label)).toEqual(['Formula', 'Recital 1', 'Recital 2', 'Article 1, first paragraph', 'Article 1, point (1)', 'Article 2']);
  expect(d.documents[0]).toMatchObject({ ref: 'WK 1111/99', classification: 'limite', kind: 'four-column' });
  await nav(page, `#/import?ds=${d.id}&ui=de`);
  await page.setInputFiles('#neg-import-file', join(FIX, 'neg-fourcol-2.docx'));
  await page.locator('#imp-next').click();
  await expect(page.locator('.nchk-item.k-new')).toHaveCount(1);
  await expect(page.locator('.nchk-item.k-new')).toContainText('Recital 2a');
  await page.locator('#imp-apply').click();
  await page.waitForSelector('.nchg-sec');
  await expect(page.locator('.nchg-sec').filter({ hasText: 'Kompromiss' })).toContainText('Recital 2a');
  d = await dossier(page);
  expect(d.rows).toHaveLength(7);
  expect(d.rows.find((r) => r.label === 'Recital 2a').order).toBeLessThan(d.rows.find((r) => r.label === 'Article 1, first paragraph').order);
  // Status aus Zellfarbe
  await nav(page, `#/synopse?ds=${d.id}&ui=de`);
  await expect(page.locator('.syn-row .nst-agreed').first()).toBeVisible();
  expect(log.errors).toEqual([]);
});

// ------------------------------------------------------------------ Position
test('Position erfassen, nach Neuladen wiederfinden; veraltete Position nach neuer Fassung, Bezug aktualisieren', async ({ page }) => {
  const log = await open(page);
  const id = await newDossier(page, 'Positionstest', '2099/0002(COD)');
  await importFile(page, join(FIX, 'neg-fourcol.docx'));
  const row = (await dossier(page)).rows.find((r) => r.label === 'Recital 2');
  await nav(page, `#/synopse?ds=${id}&r=${row.id}&ui=de`);
  await page.selectOption('#pos-stance', 'reservation');
  await page.locator('.npanel .seg button', { hasText: 'rote Linie' }).click();
  await page.fill('#pos-text', 'Befristung zwingend.');
  await page.fill('#pos-proposal', 'for a limited period');
  await page.fill('#pos-owner', 'SEM/SGG');
  await expect(page.locator('.nform .warn-text')).toBeVisible();
  await page.locator('#pos-save').click();
  await expect(page.locator('.nsave.is-ok')).toBeVisible();
  await expect(page.locator(`#syn-${row.id} .nstance`)).toHaveText(/Vorbehalt/);
  await expect(page.locator(`#syn-${row.id} .nprio`)).toHaveText(/rote Linie/);
  // Neu laden
  await page.reload();
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
  await nav(page, `#/synopse?ds=${id}&r=${row.id}&ui=de`);
  await expect(page.locator('#pos-stance')).toHaveValue('reservation');
  await expect(page.locator('#pos-text')).toHaveValue('Befristung zwingend.');
  await expect(page.locator('.npanel .seg button[aria-pressed="true"]')).toHaveText('rote Linie');
  await expect(page.locator('.nd-hist summary')).toContainText('1');
  // Neue Fassung ändert den Kompromisstext → veraltet
  await nav(page, `#/import?ds=${id}&ui=de`);
  await importFile(page, join(FIX, 'neg-fourcol-2.docx'));
  await nav(page, `#/synopse?ds=${id}&r=${row.id}&ui=de`);
  await expect(page.locator('.nd-stale')).toBeVisible();
  await expect(page.locator('.nd-stale ins').first()).toBeVisible();
  await page.locator('#syn-filter-btn').click();
  await page.selectOption('#syn-fpos', 'stale');
  await expect(page.locator('.syn-row:not(.syn-headrow)')).toHaveCount(1);
  await page.locator('.nd-stale button', { hasText: 'Bezug aktualisieren' }).click();
  await expect(page.locator('.nd-stale')).toHaveCount(0);
  // Position CH: Kennzahlen und Massenbearbeitung
  await nav(page, `#/position?ds=${id}&ui=de`);
  await expect(page.locator('.nkpi-btn').first()).toContainText('1');
  await page.selectOption('#pos-scope', 'all');
  await page.locator('.npos thead input[type=checkbox]').check();
  await page.selectOption('#bulk-prio', 'low');
  await page.locator('#bulk-apply').click();
  await expect.poll(async () => Object.values((await dossier(page)).positions).filter((p) => p.priority === 'low').length).toBe(7);
  await page.locator('.dbar button', { hasText: 'Rückgängig' }).click();
  await expect.poll(async () => Object.keys((await dossier(page)).positions).length).toBe(1);
  expect(log.errors).toEqual([]);
});

// ------------------------------------------------------------------ Konsultation
test('Konsultation: Runde anlegen, Word exportieren (gültiges ZIP), Rückmeldungen zweier Stellen einlesen, Entscheide setzen, in Position übernehmen', async ({ page }) => {
  test.setTimeout(180000);
  const log = await open(page);
  const id = await loadDemo(page);
  await nav(page, `#/konsultation?ds=${id}&ui=de`);
  await page.locator('#cons-new').click();
  await page.fill('#round-title', 'Testrunde Ämter');
  await page.locator('input[name="round-scope"][value="withPos"]').check();
  await page.fill('#round-deadline', '2026-12-18');
  await page.fill('#off-abbr-0', 'BJ');
  await page.fill('#off-name-0', 'Bundesamt für Justiz');
  await page.locator('#off-add').click();
  await page.fill('#off-abbr-1', 'fedpol');
  await page.fill('#off-name-1', 'Bundesamt für Polizei');
  await page.locator('#round-create').click();
  await expect(page.locator('#cons-round option:checked')).toHaveText('Testrunde Ämter');
  const k = (await dossier(page)).consultations.find((x) => x.title === 'Testrunde Ämter');
  expect(k.scope.length).toBe(Object.keys((await dossier(page)).positions).length);
  // Word neutral und je Stelle
  const neutral = await download(page, () => page.locator('#cons-word').click());
  expect(neutral.name).toMatch(/^Konsultation_.*neutral.*\.docx$/);
  const xml = docxXml(neutral.bytes);
  expect(rowsWithId(xml).length).toBe(k.scope.length);
  const perOffice = {};
  for (const o of ['BJ', 'fedpol']) {
    await page.locator('.menu > button', { hasText: 'Word je Stelle' }).click();
    perOffice[o] = await download(page, () => page.getByRole('menuitem', { name: new RegExp('^' + o) }).click());
    docxXml(perOffice[o].bytes);
  }
  // Programmatisch ausfüllen wie die Stellen
  const rows = rowsWithId(docxXml(perOffice.BJ.bytes)).map((r) => r.id);
  const fBJ = join(OUT, 'Antwort_BJ.docx'), fFed = join(OUT, 'Antwort_fedpol.docx');
  writeFileSync(fBJ, editDocx(perOffice.BJ.bytes, (c) => { let x = c.get('word/document.xml'); x = fillCell(x, rows[0], 4, 'BJ: Befristung präzisieren.'); x = fillCell(x, rows[0], 5, 'for a period not exceeding six months'); x = fillGeneral(x, 'BJ: keine weiteren Bemerkungen.'); c.set('word/document.xml', x); }));
  writeFileSync(fFed, editDocx(perOffice.fedpol.bytes, (c) => { let x = c.get('word/document.xml'); x = fillCell(x, rows[0], 4, 'fedpol: Vorbehalt zur Umsetzung.'); x = fillCell(x, rows[1], 4, 'fedpol: einverstanden.'); c.set('word/document.xml', x); addComment(c, rows[1], 'fedpol: Kommentar in Word.', 'fedpol'); }));
  await page.setInputFiles('#cons-response-files', [fBJ, fFed]);
  await expect(page.locator('.nprogt .nrecv')).toHaveCount(2);
  await expect(page.locator('.nround-sum')).toContainText('2 von 2 Stellen');
  // Aggregierte Sicht
  await page.locator('.nd-toolbar .seg button', { hasText: 'Rückmeldungen und Entscheide' }).click();
  await expect(page.locator('.nagg-off')).toHaveCount(2);
  const items = page.locator('.nitem');
  expect(await items.count()).toBeGreaterThanOrEqual(3);
  const first = page.locator(`#agg-${rows[0]}`);
  await expect(first.locator('.nitem')).toHaveCount(2);
  const bj = first.locator('.nitem', { hasText: 'BJ: Befristung' });
  await bj.locator('.nitem-sel').selectOption('partly');
  await bj.locator('textarea').fill('Teilweise übernommen: Frist im Erwägungsgrund.');
  await bj.locator('textarea').blur();
  await bj.locator('button', { hasText: 'Textvorschlag in Position' }).click();
  await bj.locator('button', { hasText: 'Kommentar in Position' }).click();
  await expect(bj.locator('.nitem-applied')).toBeVisible();
  let d = await dossier(page);
  const kk = d.consultations.find((x) => x.id === k.id);
  const bjItem = kk.responses.flatMap((r) => r.items).find((i) => i.comment.startsWith('BJ: Befristung'));
  expect(kk.decisions[bjItem.id]).toMatchObject({ decision: 'partly', reply: 'Teilweise übernommen: Frist im Erwägungsgrund.', applied: true });
  expect(d.positions[rows[0]].proposal).toBe('for a period not exceeding six months');
  expect(d.positions[rows[0]].text).toContain('[BJ] BJ: Befristung präzisieren.');
  expect(d.positions[rows[0]].history.slice(-1)[0].source).toBe('consultation:' + k.id);
  // Filter "unbearbeitet", Mehrfachauswahl, Entscheid für alle
  await page.selectOption('#agg-filter', 'open');
  const open1 = await page.locator('.nitem').count();
  expect(open1).toBeGreaterThan(0);
  await page.locator('.nbulk input[type=checkbox]').check();
  await page.selectOption('#agg-bulk-dec', 'noted');
  await page.locator('#agg-bulk-apply').click();
  await expect(page.locator('.neg-empty')).toBeVisible();
  d = await dossier(page);
  expect(Object.values(d.consultations.find((x) => x.id === k.id).decisions).filter((x) => x.decision === 'noted').length).toBe(open1);
  // Rückmeldungen zur Zeile im Detail
  await nav(page, `#/synopse?ds=${id}&r=${rows[0]}&ui=de`);
  await page.locator('#ndt-feedback').click();
  await expect(page.locator('.nfb-item').filter({ hasText: 'BJ: Befristung' })).toBeVisible();
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
});

// ------------------------------------------------------------------ Ausgaben und Druckansichten
test('Briefing und Konsultationsbericht als Word; Druckansichten als PDF (Druckmedien)', async ({ page }) => {
  test.setTimeout(240000);
  const log = await open(page);
  const id = await loadDemo(page);
  const d = await dossier(page);
  const k = d.consultations[0];
  await nav(page, `#/ausgabe?ds=${id}&ui=de`);
  await expect(page.locator('.nout-n')).toContainText(`${Object.keys(d.positions).length} Zeilen`);
  const b = await download(page, () => page.locator('#out-briefing-word').click());
  expect(b.name).toMatch(/^Verhandlungsbriefing_.*\.docx$/);
  const bx = docxXml(b.bytes);
  expect(bx).toContain('Verhandlungsbriefing');
  expect(bx).toContain(Object.values(d.positions)[0].text.slice(0, 30));
  await page.locator('.nout .seg button', { hasText: 'nur rote Linien' }).click();
  await page.locator('.nout .seg button', { hasText: 'FR' }).first().click();
  const bfr = await download(page, () => page.locator('#out-briefing-word').click());
  expect(docxXml(bfr.bytes)).toContain('Note de négociation');
  const r = await download(page, () => page.locator('#out-report-word').click());
  expect(docxXml(r.bytes)).toContain('Konsultationsbericht');
  // Druckansichten über Druckmedien
  const prints = [
    ['briefing', `pv=briefing&po=all~order~de`, 'Verhandlungsbriefing'],
    ['briefing-fr', `pv=briefing&po=all~priority~fr`, 'Note de négociation'],
    ['bericht', `pv=report&po=${k.id}~~de`, 'Konsultationsbericht'],
    ['leseversion', `pv=consultation&po=${k.id}`, 'Leseversion'],
    ['synopse', `pv=synopse&nfp=with&nd=com`, 'Synopse'],
    ['was-ist-neu', `pv=changes&po=${[...d.documents].sort((a, x) => a.date.localeCompare(x.date)).slice(-1)[0].id}`, 'Was ist neu'],
  ];
  for (const [name, q, want] of prints) {
    await nav(page, `#/druck?ds=${id}&${q}&ui=de`);
    await page.waitForSelector('.np');
    await page.emulateMedia({ media: 'print' });
    expect(await page.locator('.app-head').isVisible()).toBe(false);
    const pdf = await page.pdf({ format: 'A4', landscape: true, printBackground: true });
    await page.emulateMedia({ media: 'screen' });
    writeFileSync(join(OUT, `druck-${name}.pdf`), pdf);
    const info = await pdfInfo(pdf);
    expect(info.pages, name).toBeGreaterThan(0);
    expect(info.text, name).toContain(want);
    if (name !== 'was-ist-neu') expect(info.text, name).toMatch(/LIMITE|Intern|Interne|öffentlich|Public|Öffentlich/);
  }
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
});

// ------------------------------------------------------------------ Projektdatei
test('Projektdatei exportieren und importieren (mit Rückfrage vor dem Überschreiben)', async ({ page }) => {
  const log = await open(page);
  const id = await loadDemo(page);
  const d = await dossier(page);
  const f = await download(page, () => page.locator('.dbar button', { hasText: 'Projektdatei' }).click());
  expect(f.name).toMatch(/^Verhandlung_.*_\d{4}-\d{2}-\d{2}\.json$/);
  const obj = JSON.parse(readFileSync(f.path, 'utf8'));
  expect(obj.kind).toBe('neg-dossier');
  expect(Object.keys(obj.positions)).toHaveLength(Object.keys(d.positions).length);
  // Dossier löschen (mit Rückfrage), dann aus der Projektdatei wiederherstellen
  await nav(page, '#/dossiers?ui=de');
  await page.locator(`button[aria-label^="${d.short} löschen"]`).click();
  await page.locator('.modal .btn-danger').click();
  await expect(page.locator('.nlist')).toHaveCount(0);
  await page.setInputFiles('#neg-project-file', f.path);
  await expect(page).toHaveURL(new RegExp('#/synopse\\?.*ds=' + id));
  expect(Object.keys((await dossier(page)).positions)).toHaveLength(Object.keys(d.positions).length);
  // Nochmals importieren: Rückfrage
  await nav(page, '#/dossiers?ui=de');
  await page.setInputFiles('#neg-project-file', f.path);
  await expect(page.locator('#nconfirm-h')).toHaveText('Dossier überschreiben');
  await page.locator('.modal .btn-danger').click();
  await expect(page).toHaveURL(/#\/synopse/);
  // Ungültige Datei
  await nav(page, '#/dossiers?ui=de');
  writeFileSync(join(OUT, 'kein-dossier.json'), '{"kind":"other"}');
  await page.setInputFiles('#neg-project-file', join(OUT, 'kein-dossier.json'));
  await expect(page.locator('.toast-error')).toContainText('Keine gültige Projektdatei');
  expect(log.errors).toEqual([]);
});

// ------------------------------------------------------------------ Grosse Dossiers
test('Synopse bleibt flüssig bei 1200 Zeilen (seitenweises Rendern)', async ({ page }) => {
  const log = await open(page);
  const base = JSON.parse(readFileSync(join(FIX, 'neg-dossier.json'), 'utf8'));
  const big = { ...base, id: 'd-big', short: 'Gross', rows: [], cells: {}, positions: {}, consultations: [] };
  for (let i = 0; i < 1200; i++) {
    const src = base.rows[i % base.rows.length];
    const id = 'r' + String(i + 1).padStart(6, '0');
    big.rows.push({ ...src, id, order: (i + 1) * 10, num: String(i + 1) });
    big.cells[id] = base.cells[src.id];
  }
  const f = join(OUT, 'gross.json');
  writeFileSync(f, JSON.stringify(big));
  await nav(page, '#/dossiers?ui=de');
  await page.setInputFiles('#neg-project-file', f);
  await page.waitForSelector('.syn-row:not(.syn-headrow)');
  const t0 = Date.now();
  await nav(page, '#/synopse?ds=d-big&nd=prev&ui=de');
  await page.waitForSelector('.syn-c.is-diff');
  expect(Date.now() - t0).toBeLessThan(4000);
  expect(await page.locator('.syn-row:not(.syn-headrow)').count()).toBeLessThanOrEqual(61);
  const t1 = Date.now();
  await page.fill('#syn-q', 'instrumentalisation');
  await expect(page.locator('.syn-count-n')).toContainText('100 von 1 200 Zeilen');
  expect(Date.now() - t1).toBeLessThan(3000);
  expect(log.errors).toEqual([]);
});

// ------------------------------------------------------------------ Französisch
const DE_WORDS = ['Fassung', 'Fassungen', 'Spur', 'Spuren', 'Zeile', 'Zeilen', 'Haltung', 'Priorität', 'Entscheid', 'Rückmeldung', 'Rückmeldungen', 'Stelle', 'Stellen',
  'Ausgabe', 'Konsultation', 'übernehmen', 'Gespeichert', 'Rückgängig', 'und', 'oder', 'mit', 'der', 'die', 'das', 'nicht', 'Anleitung', 'Druckansicht', 'Bearbeiten',
  'Vergleich', 'Position und Begründung', 'Gliederung', 'Stichwort', 'Beispiel', 'rote Linie', 'offen', 'Runde', 'Frist', 'Umfang', 'Projektdatei', 'Prüfvorbehalt', 'Vertraulich'];
const uiText = (page) => page.evaluate(() => {
  const ui = document.documentElement.lang.slice(0, 2);
  const out = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walk.nextNode())) {
    const el = n.parentElement;
    if (!el || !el.offsetParent && el.tagName !== 'BODY') continue;
    if (el.closest('script, style, [aria-hidden="true"], .card-host, .uc, textarea, option')) continue;
    const l = (el.closest('[lang]') || document.documentElement).getAttribute('lang').slice(0, 2);
    if (l === ui) out.push(n.nodeValue);
  }
  for (const a of document.querySelectorAll('[title], [aria-label], [placeholder]')) {
    if (a.closest('.uc')) continue;
    const l = (a.closest('[lang]') || document.documentElement).getAttribute('lang').slice(0, 2);
    if (l !== ui) continue;
    for (const k of ['title', 'aria-label', 'placeholder']) if (a.getAttribute(k)) out.push(a.getAttribute(k));
  }
  return out.join('\n');
});
const NEG_VIEWS = (id, row, k) => [
  ['dossiers', '#/dossiers'],
  ['synopse', `#/synopse?ds=${id}`],
  ['synopse-diff', `#/synopse?ds=${id}&nd=com&nfp=with`],
  ['zeile-position', `#/synopse?ds=${id}&r=${row}`],
  ['import', `#/import?ds=${id}`],
  ['was-ist-neu', `#/import?ds=${id}&nkt=changes&po=doc2`],
  ['position', `#/position?ds=${id}`],
  ['konsultation', `#/konsultation?ds=${id}&nk=${k}`],
  ['konsultation-entscheide', `#/konsultation?ds=${id}&nk=${k}&nkt=agg`],
  ['ausgabe', `#/ausgabe?ds=${id}`],
  ['anleitung', `#/n-anleitung?ds=${id}`],
  ['druck-briefing', `#/druck?ds=${id}&pv=briefing&po=all~order~de`],
];
const withUi = (h, ui) => `${h}${h.includes('?') ? '&' : '?'}ui=${ui}`;
async function demoContext(page) {
  const id = await loadDemo(page);
  await page.waitForSelector('.toast', { state: 'detached', timeout: 10000 });
  const d = await dossier(page);
  const row = Object.keys(d.positions)[0];
  return { id, row, k: d.consultations[0].id, d };
}

test('Oberfläche FR: alle Ansichten ohne fehlende Schlüssel und ohne deutsche Reste; Zeile im Detail, Dialoge', async ({ page }) => {
  test.setTimeout(180000);
  const log = await open(page, '#/dossiers?ui=fr');
  await expect(page.locator('.modbar-tab[aria-current="page"]')).toContainText('Négociation');
  const { id, row, k, d } = await demoContext(page);
  // Nutzerdaten (Titel, Stellen, Dateinamen, Kommentare) sind keine Oberflächentexte
  const user = [d.short, d.title, ...d.consultations.flatMap((x) => [x.title, ...x.offices.flatMap((o) => [o.name, o.abbr]), ...x.responses.map((r) => r.file && r.file.name)])].filter(Boolean).sort((a, b) => b.length - a.length);
  const found = [];
  const check = async (name) => {
    let txt = await uiText(page);
    for (const u of user) txt = txt.split(u).join(' ');
    const body = await page.evaluate(() => document.body.innerText);
    if (body.includes('⟦')) found.push(`${name}: fehlender Schlüssel ${body.slice(body.indexOf('⟦'), body.indexOf('⟦') + 40)}`);
    for (const w of DE_WORDS) {
      const re = new RegExp(`(^|[^\\p{L}])${w}(?=$|[^\\p{L}])`, 'u');
      const m = re.exec(txt);
      if (m) found.push(`${name}: «${w}» in «${txt.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\n/g, ' ')}»`);
    }
  };
  for (const [name, h] of NEG_VIEWS(id, row, k)) {
    await nav(page, withUi(h, 'fr'));
    await page.waitForTimeout(60);
    await check(name);
  }
  for (const tab of ['chron', 'compare', 'feedback', 'edit']) {
    await nav(page, withUi(`#/synopse?ds=${id}&r=${row}`, 'fr'));
    await page.locator('#ndt-' + tab).click();
    await check('zeile-' + tab);
  }
  await nav(page, withUi(`#/konsultation?ds=${id}`, 'fr'));
  await page.locator('#cons-new').click();
  await check('dialog-runde');
  await page.keyboard.press('Escape');
  await nav(page, withUi('#/dossiers', 'fr'));
  await page.locator('#btn-demo').click();
  await check('dialog-beispiel');
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr-CH');
  await expect(page.locator('.views a', { hasText: 'Consultation' })).toBeVisible();
  expect(found, found.slice(0, 30).join('\n')).toEqual([]);
  expect(log.errors).toEqual([]);
});

test('Anleitung Verhandlung DE/FR: Abschnitte, Schritte, Kontext-Hilfe aus den Ansichten, Verweis aus der SGK-Anleitung', async ({ page }) => {
  const log = await open(page);
  const { id } = await demoContext(page);
  for (const ui of ['de', 'fr']) {
    await nav(page, withUi('#/n-anleitung', ui));
    await expect(page.locator('.g-sec')).toHaveCount(8);
    await expect(page.locator('.g-task')).toHaveCount(13);
    expect(await page.locator('.g-steps li').count()).toBeGreaterThan(35);
    const body = await page.locator('.guide').innerText();
    expect(body).not.toContain('[[');
    expect(body).not.toContain('⟦');
    expect(body).toContain(await page.evaluate(() => window.__sgk.i18n.t('neg.cons.wordNeutral')));
  }
  for (const [h, sec] of [[`#/synopse?ds=${id}`, 'synopse'], [`#/import?ds=${id}`, 'import'], [`#/position?ds=${id}`, 'position'], [`#/konsultation?ds=${id}`, 'konsultation'], [`#/ausgabe?ds=${id}`, 'briefing'], ['#/dossiers', 'dossier']]) {
    await nav(page, withUi(h, 'de'));
    await page.locator('.help-link').first().click();
    await expect(page).toHaveURL(new RegExp('#/n-anleitung\\?.*sec=' + sec));
    await expect(page.locator('#g-' + sec)).toBeInViewport();
    await expect(page.locator('.modbar-tab[aria-current="page"]')).toContainText('Verhandlung');
  }
  await nav(page, '#/anleitung?ui=de');
  await page.locator('.g-negref a').click();
  await expect(page).toHaveURL(/#\/n-anleitung/);
  expect(log.errors).toEqual([]);
});

// ------------------------------------------------------------------ Synopse: Gliederung unter 1312 px als Overlay
// Nach dem Laden verdeckt nichts die Steuerleiste oder die Tabellenspalten; die Gliederung öffnet über «Gliederung»,
// liegt dann als Overlay mit Schatten darüber und schliesst bei Wahl eines Eintrags und mit Escape. Ab 1312 px steht sie als Spalte.
const coverCheck = () => {
  const out = [];
  const pos = document.querySelector('.syn-hpos');
  const posLeft = pos && getComputedStyle(pos).position === 'sticky' ? pos.getBoundingClientRect().left : Infinity;
  const els = [...document.querySelectorAll('.syn-bar button, .syn-bar select, .syn-bar input, .syn-bar a, .syn-status button, .syn-headrow > [role="columnheader"]')];
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
    const x = Math.min(r.left + Math.min(r.width / 2, 24), innerWidth - 1), y = r.top + Math.min(r.height / 2, 20);
    if (!el.classList.contains('syn-hpos') && x >= posLeft) continue; // unter der mitlaufenden Positionsspalte (Tabelle scrollt horizontal)
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(hit === el || el.contains(hit))) out.push(`${(el.textContent || el.getAttribute('aria-label') || el.id || el.tagName).trim().slice(0, 30)} verdeckt durch ${hit ? (hit.closest('[class]') || hit).className : '—'}`);
  }
  return out;
};
for (const width of [375, 1024, 1280]) {
  test(`Synopse ${width} px: Gliederung geschlossen, nichts verdeckt; Overlay schliesst bei Wahl und mit Escape`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const log = await open(page);
    const { id } = await demoContext(page);
    await nav(page, `#/synopse?ds=${id}&ui=de`);
    await page.waitForSelector('.syn-row:not(.syn-headrow)');
    await expect(page.locator('.syn-nav')).toHaveCount(0);
    expect(await page.evaluate(coverCheck)).toEqual([]);
    const btn = page.locator('#syn-outline-btn');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    // öffnen: Overlay mit Schatten, Fokus im Overlay
    await btn.click();
    const navEl = page.locator('.syn-nav');
    await expect(navEl).toBeVisible();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(await navEl.evaluate((n) => [getComputedStyle(n).position, getComputedStyle(n).boxShadow !== 'none'])).toEqual(['absolute', true]);
    expect(await page.evaluate(() => !!document.activeElement.closest('.syn-nav'))).toBe(true);
    expect((await page.evaluate(coverCheck)).length).toBeGreaterThan(0); // Gegenprobe: die Prüfung erkennt das offene Overlay
    // Wahl eines Eintrags schliesst und springt
    const before = await page.locator('#syn-scroll').evaluate((e) => e.scrollTop);
    await page.locator('.syn-groups > li > .syn-g:not([disabled])').last().click();
    await expect(navEl).toHaveCount(0);
    await page.waitForTimeout(200);
    expect(await page.locator('#syn-scroll').evaluate((e) => e.scrollTop)).toBeGreaterThan(before);
    // Escape schliesst und gibt den Fokus an die Schaltfläche zurück
    await btn.click();
    await expect(navEl).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(navEl).toHaveCount(0);
    await expect(btn).toBeFocused();
    expect(await page.evaluate(coverCheck)).toEqual([]);
    // Klick daneben schliesst
    await btn.click();
    await expect(navEl).toBeVisible();
    const cnt = await page.locator('.syn-count-n').boundingBox();
    await page.mouse.click(width - 8, cnt.y + cnt.height / 2);
    await expect(navEl).toHaveCount(0);
    // 375 px: das Navigationsmenü liegt über der Gliederung und bleibt bedienbar
    if (width < 672) {
      await btn.click();
      await expect(navEl).toBeVisible();
      await page.locator('#btn-menu').click();
      const menuLink = page.locator('#head-menu a[href="#/position"]');
      await expect(menuLink).toBeVisible();
      const b = await menuLink.boundingBox();
      expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y).closest('#head-menu'), [b.x + b.width / 2, b.y + b.height / 2])).toBe(true);
      await menuLink.click();
      await expect(page).toHaveURL(/#\/position/);
    }
    expect(log.errors).toEqual([]);
  });
}
test('Synopse 1440 px: Gliederung als Spalte, verdeckt nichts', async ({ page }) => {
  const log = await open(page);
  const { id } = await demoContext(page);
  await nav(page, `#/synopse?ds=${id}&ui=de`);
  await page.waitForSelector('.syn-row:not(.syn-headrow)');
  await expect(page.locator('.syn-nav')).toBeVisible();
  expect(await page.locator('.syn-nav').evaluate((n) => getComputedStyle(n).position)).not.toBe('absolute');
  expect(await page.evaluate(coverCheck)).toEqual([]);
  expect(log.errors).toEqual([]);
});

// ------------------------------------------------------------------ Überlauf, Überlappung, Schaltflächen
for (const width of [1024, 1280, 1440, 1920]) {
  test(`Modul Verhandlung: Überlauf und Überlappung bei ${width} px (DE und FR)`, async ({ page }) => {
    test.setTimeout(240000);
    await page.setViewportSize({ width, height: 900 });
    const log = await open(page);
    const { id, row, k } = await demoContext(page);
    const all = [];
    for (const ui of ['de', 'fr']) {
      for (const [name, h] of NEG_VIEWS(id, row, k)) {
        await nav(page, withUi(h, ui));
        await page.waitForTimeout(60);
        for (const i of await page.evaluate(layoutCheck)) all.push(`${width} ${ui} ${name}: ${i}`);
      }
      for (const tab of ['chron', 'compare', 'edit']) {
        await nav(page, withUi(`#/synopse?ds=${id}&r=${row}`, ui));
        await page.locator('#ndt-' + tab).click();
        for (const i of await page.evaluate(layoutCheck)) all.push(`${width} ${ui} zeile-${tab}: ${i}`);
      }
      await nav(page, withUi(`#/synopse?ds=${id}&nd=tracks&na=com&nb=agreement`, ui));
      for (const i of await page.evaluate(layoutCheck)) all.push(`${width} ${ui} synopse-tracks: ${i}`);
      await nav(page, withUi(`#/konsultation?ds=${id}`, ui));
      await page.locator('#cons-new').click();
      for (const i of await page.evaluate(layoutCheck)) all.push(`${width} ${ui} dialog-runde: ${i}`);
      await page.keyboard.press('Escape');
    }
    expect(all, all.slice(0, 30).join('\n')).toEqual([]);
    expect(log.errors).toEqual([]);
  });
}

test('Modul Verhandlung: Schaltflächen erkennbar (Form ohne Hover, Mindestgrösse, Zeiger, Fokusring)', async ({ page }) => {
  await open(page);
  const { id, row, k } = await demoContext(page);
  const probs = [];
  for (const [name, h] of NEG_VIEWS(id, row, k)) {
    await nav(page, withUi(h, 'de'));
    for (const p of await page.evaluate(buttonCheck)) probs.push(`${name}: ${p}`);
  }
  expect(probs).toEqual([]);
  await nav(page, withUi(`#/synopse?ds=${id}&r=${row}`, 'de'));
  await page.locator('#pos-text').focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)).toBe('solid');
  // Etiketten (Haltung, Priorität, Status) sehen nicht wie Schaltflächen aus
  await nav(page, withUi(`#/position?ds=${id}`, 'de'));
  expect(await page.locator('.npos .nstance').first().evaluate((e) => getComputedStyle(e).cursor)).not.toBe('pointer');
  expect(await page.locator('.npos .nstance').first().evaluate((e) => getComputedStyle(e).boxShadow)).toBe('none');
});

// ------------------------------------------------------------------ Screenshots
test('Screenshots Modul Verhandlung: alle Ansichten DE und FR bei 1440, kritische Stellen bei 1024 und 1920', { tag: '@daten' }, async ({ page }) => {
  test.skip(!existsSync(join(RAW, 'ST-8413-2023.pdf')), 'raw-neg/ fehlt (öffentliche Ratsdokumente, siehe scripts/neg/fetch-raw.mjs)');
  test.setTimeout(300000);
  await open(page);
  for (const ui of ['de', 'fr']) {
    await nav(page, withUi('#/dossiers', ui));
    await page.screenshot({ path: join(SHOTS, `neg-1440-${ui}-dossiers-leer.png`) });
    await nav(page, withUi('#/synopse?ds=x', ui));
  }
  const { id, row, k } = await demoContext(page);
  const shot = async (w, ui, name, h, after) => {
    await page.setViewportSize({ width: w, height: 900 });
    await nav(page, withUi(h, ui));
    await page.evaluate(() => document.querySelectorAll('.view, .panel-body, #syn-scroll').forEach((e) => { e.scrollTop = 0; }));
    if (after) await after();
    await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(SHOTS, `neg-${w}-${ui}-${name}.png`) });
  };
  for (const ui of ['de', 'fr']) {
    for (const [name, h] of NEG_VIEWS(id, row, k)) await shot(1440, ui, name, h);
    for (const tab of ['chron', 'compare', 'feedback', 'edit']) await shot(1440, ui, 'zeile-' + tab, `#/synopse?ds=${id}&r=${row}`, () => page.locator('#ndt-' + tab).click());
    await shot(1440, ui, 'dialog-runde', `#/konsultation?ds=${id}`, () => page.locator('#cons-new').click());
    await page.keyboard.press('Escape');
    await shot(1440, ui, 'dialog-beispiel', '#/dossiers', () => page.locator('#btn-demo').click());
    await page.keyboard.press('Escape');
    for (const w of [1024, 1920]) {
      await shot(w, ui, 'synopse', `#/synopse?ds=${id}`);
      await shot(w, ui, 'synopse-diff', `#/synopse?ds=${id}&nd=com&nfp=with`);
      await shot(w, ui, 'zeile-position', `#/synopse?ds=${id}&r=${row}`);
      await shot(w, ui, 'konsultation-entscheide', `#/konsultation?ds=${id}&nk=${k}&nkt=agg`);
      await shot(w, ui, 'position', `#/position?ds=${id}`);
    }
  }
  // Prüfmaske mit echter Folgefassung (DE)
  await page.setViewportSize({ width: 1440, height: 900 });
  await newDossier(page, 'Screening (Screenshot)', '2020/0278(COD)');
  await page.setInputFiles('#neg-import-file', join(RAW, 'ST-8413-2023.pdf'));
  await page.waitForSelector('#imp-next', { timeout: 150000 });
  await page.screenshot({ path: join(SHOTS, 'neg-1440-de-import-erkennung.png') });
  await page.locator('#imp-next').click();
  await page.locator('#imp-apply').click();
  await page.waitForSelector('.nchg-sec');
  await nav(page, withUi(`#/import?ds=${await dossierId(page)}`, 'de'));
  await page.setInputFiles('#neg-import-file', join(RAW, 'ST-10863-2023.pdf'));
  await page.waitForSelector('#imp-next', { timeout: 150000 });
  await page.locator('#imp-next').click();
  await page.waitForSelector('#imp-apply');
  await page.screenshot({ path: join(SHOTS, 'neg-1440-de-import-pruefung.png') });
});
