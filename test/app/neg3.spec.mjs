// UI-Tests Modul Verhandlung, Etappe 3 (Delegationen, Sitzungen, Bilanz, Kürzel, Zusammenführen, Vorschau, Kartenmodelle) gegen dist/sgk-navigator.html.
// Aufruf: npx playwright test -c test/app/playwright.config.mjs test/app/neg3.spec.mjs
// Daten: echte Beispiel-Dossiers data/neg-demo*.json (über die Oberfläche geladen bzw. im Test über src/neg abgewandelt).
import { test, expect } from '@playwright/test';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { unzipSync, strFromU8 } from 'fflate';
import { layoutCheck, buttonCheck } from './helpers.mjs';
import * as N from '../../src/neg/index.js';
import { validateCard, cardToDocx, cardToPdf } from '../../src/export/index.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const APP = 'file://' + join(ROOT, 'dist/sgk-navigator.html');
const OUT = join(ROOT, 'test/app/out/neg3');
const SHOTS = join(ROOT, 'test/app/screenshots');
mkdirSync(OUT, { recursive: true });
mkdirSync(SHOTS, { recursive: true });
test.use({ actionTimeout: 20000 });

async function open(page, hash = '#/dossiers?ui=de', { by = 'NB' } = {}) {
  const log = { errors: [], requests: [] };
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push(m.text()); });
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  page.on('request', (r) => { const u = r.url(); if (!/^(file|data|blob):/.test(u)) log.requests.push(u); });
  if (by !== null) await page.addInitScript((v) => { try { if (!sessionStorage.getItem('by-set')) { localStorage.setItem('sgkn.by', v); sessionStorage.setItem('by-set', '1'); } } catch { /* */ } }, by);
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
async function loadDemo(page, key = 'demo-dtc') {
  await nav(page, '#/dossiers');
  await page.locator('#btn-demo').click();
  await page.locator('#demo-load-' + key).click();
  await expect(page).toHaveURL(/#\/synopse\?.*ds=/);
  await page.waitForSelector('.syn-row:not(.syn-headrow)');
  await page.waitForSelector('.toast', { state: 'detached', timeout: 10000 }).catch(() => {});
  return (await dossier(page)).id;
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
const xmlText = (x) => x.replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
async function pdfText(buf, max = 8) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, verbosity: 0 });
  const doc = await task.promise;
  let text = '';
  for (let i = 1; i <= Math.min(doc.numPages, max); i++) text += (await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(' ') + '\n';
  const n = doc.numPages;
  await task.destroy();
  return { pages: n, text: text.replace(/\s+/g, ' ') };
}
async function printPdf(page, hash, name) {
  await nav(page, hash);
  await page.waitForSelector('.np');
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ format: 'A4', landscape: true, printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  writeFileSync(join(OUT, name + '.pdf'), pdf);
  return pdfText(pdf);
}
/** Beispiel-Dossier aus data/ über die Kernbibliothek lesen. */
const demo = (f = 'neg-demo-dtc.json') => N.importDossier(readFileSync(join(ROOT, 'data', f), 'utf8')).dossier;
const withUi = (h, ui) => `${h}${h.includes('?') ? '&' : '?'}ui=${ui}`;
/** Zeile des DTC-Beispiels, die Art. 8 SGK ändert (Rat), und Zeile mit CH-Position. */
const DTC_ART8_ROW = 'r002990';

// ------------------------------------------------------------------ Begriffe
test('Begriffe der Oberfläche = Begriffe der Word-Ausgaben (src/neg/i18n.js), Etappe 3', async () => {
  const { DOC_TEXT } = await import('../../src/neg/i18n.js');
  const de = (await import('../../src/app/modules/neg/i18n/de.js')).default.neg;
  const fr = (await import('../../src/app/modules/neg/i18n/fr.js')).default.neg;
  for (const [l, d] of [['de', de], ['fr', fr]]) {
    const D = DOC_TEXT[l];
    expect(d.dstance, `${l}: Haltungen der Delegationen`).toEqual(D.delegStance);
    expect(d.ivres, `${l}: Wirkung der Interventionen`).toEqual(D.interventionResult);
    expect(d.outcome, `${l}: Ergebnis`).toEqual(D.outcome);
    expect(d.delegKind, `${l}: Art der Delegation`).toEqual(D.delegKind);
    expect(d.suggestion).toBe(D.suggestion);
    expect(d.fict).toBe(D.fictitiousDeleg);
    expect(d.iv.result).toBe(D.result);
    expect(d.bal.outcome).toBe(D.outcomeL);
    expect(d.bal.title).toBe(D.balanceTitle);
    expect(d.mt.body).toBe(D.body);
    expect(d.mt.report).toBe(D.meetingReport);
    expect(d.mt.date).toBe(D.date);
    expect(d.mt.docs).toBe(D.docs);
    expect(d.mt.note).toBe(D.note);
    expect(d.dl.meeting).toBe(D.meeting);
    expect(d.dl.text).toBe(D.stanceText);
    expect(d.nav.delegationen).toBe(D.delegations);
  }
  const s = JSON.stringify(de);
  expect(s).not.toContain('ß');
  expect(/!/.test(s)).toBe(false);
});

// ------------------------------------------------------------------ Beispiel DTC
test('Beispiel DTC: in «Beispiel laden» mit Kurzbeschrieb; fiktive Delegationen, Sitzung und Interventionen gekennzeichnet', async ({ page }) => {
  const log = await open(page);
  await page.locator('#btn-demo').click();
  await expect(page.locator('.ndemo-item')).toHaveCount(3);
  const item = page.locator('.ndemo-item', { has: page.locator('#demo-load-demo-dtc') });
  await expect(item).toContainText('2024/0670(COD)');
  await expect(item).toContainText('EU Digital Travel application: Kommissionsvorschlag');
  await page.keyboard.press('Escape');
  const id = await loadDemo(page);
  const d = await dossier(page);
  expect(d.procedure).toBe('2024/0670(COD)');
  expect(d.demo).toBe(true);
  await nav(page, `#/delegationen?ds=${id}&ui=de`);
  await expect(page.locator('.ndl-fict')).toContainText('fiktiv');
  await expect(page.locator('.ndl-mx thead .ndl-fmark')).toHaveCount(3);
  await nav(page, `#/delegationen?ds=${id}&nkt=meetings&ui=de`);
  await expect(page.locator('#mt-table .tag-demo')).toHaveText('Beispiel (fiktiv)');
  await nav(page, `#/delegationen?ds=${id}&nkt=meetings&po=m1~post&ui=de`);
  await expect(page.locator('.niv-item .tag-demo')).toHaveCount(3);
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
});

// ------------------------------------------------------------------ Kürzel
test('Kürzel: einmal abfragen beim ersten Speichern einer Position, in der Dossierleiste änderbar, im Verlauf sichtbar', async ({ page }) => {
  const log = await open(page, '#/dossiers?ui=de', { by: null });
  const id = await loadDemo(page);
  const d = await dossier(page);
  const row = Object.keys(d.positions)[0];
  await expect(page.locator('#by-badge')).toHaveText(/Kürzel/);
  await nav(page, `#/synopse?ds=${id}&r=${row}&ui=de`);
  await page.fill('#pos-text', 'Neue Begründung mit Kürzel.');
  await page.locator('#pos-save').click();
  await expect(page.locator('#nby-h')).toHaveText('Ihr Kürzel');
  await page.fill('#by-input', 'TB');
  await page.locator('#by-ok').click();
  await expect.poll(async () => (await dossier(page)).positions[row].text).toBe('Neue Begründung mit Kürzel.');
  const h = (await dossier(page)).positions[row].history;
  expect(h[h.length - 1].by).toBe('TB');
  await expect(page.locator('#by-badge')).toHaveText('TB');
  await page.locator('.nd-hist summary').click();
  await expect(page.locator('.nd-hist-list li').first().locator('.nby-tag')).toHaveText('TB');
  // Ändern über die Dossierleiste; nächstes Speichern ohne Rückfrage
  await page.locator('#by-badge').click();
  await page.fill('#by-input', 'XY');
  await page.locator('#by-ok').click();
  await expect(page.locator('#by-badge')).toHaveText('XY');
  await page.fill('#pos-text', 'Zweite Fassung.');
  await page.locator('#pos-save').click();
  await expect(page.locator('#nby-h')).toHaveCount(0);
  await expect.poll(async () => { const x = (await dossier(page)).positions[row].history; return x[x.length - 1].by; }).toBe('XY');
  expect(await page.evaluate(() => localStorage.getItem('sgkn.by'))).toBe('XY');
  expect(log.errors).toEqual([]);
});

// ------------------------------------------------------------------ Haltungen und Matrix
test('Haltungen für mehrere Delegationen erfassen, Verlauf, Matrix mit Filtern und Kennzahlen, Rückgängig', async ({ page }) => {
  const log = await open(page);
  const id = await loadDemo(page);
  const d0 = await dossier(page);
  const row = DTC_ART8_ROW;
  await nav(page, `#/synopse?ds=${id}&r=${row}&ui=de`);
  await page.locator('#ndt-deleg').click();
  const before = (d0.stances[row] || []).length;
  await page.selectOption('#rd-sf-stance', 'support');
  for (const g of ['de', 'fr', 'nl']) await page.locator('#rd-sf-g-' + g).click();
  await expect(page.locator('#rd-sf-save')).toHaveText(/Für 3 Delegationen erfassen/);
  await page.fill('#rd-sf-text', 'unterstützt Abs. 2g');
  await page.locator('#rd-sf-save').click();
  await expect.poll(async () => ((await dossier(page)).stances[row] || []).length).toBe(before + 3);
  const st = (await dossier(page)).stances[row].slice(-3);
  expect(st.map((x) => x.deleg).sort()).toEqual(['de', 'fr', 'nl']);
  expect(st.every((x) => x.stance === 'support' && x.by === 'NB' && x.meeting === 'm1' && x.text === 'unterstützt Abs. 2g')).toBe(true);
  // zweite Haltung von DE in neuer Sitzung: Verlauf
  await page.selectOption('#rd-sf-stance', 'reservation');
  await page.selectOption('#rd-sf-meeting', '');
  await page.locator('#rd-sf-g-de').click();
  await page.locator('#rd-sf-save').click();
  await expect(page.locator('.ndl-st', { hasText: 'Deutschland' }).locator('.ndl-earlier summary')).toHaveText('1 frühere Haltung');
  // Intervention zur Zeile
  await page.fill('#rd-if-text', 'CH schlägt «where available» vor.');
  await page.selectOption('#rd-if-result', 'partly');
  await page.locator('#rd-if-save').click();
  await expect.poll(async () => (await dossier(page)).interventions.filter((x) => x.row === row).length).toBe(2);
  // Matrix
  await nav(page, `#/delegationen?ds=${id}&ui=de`);
  await expect(page.locator('#mx-table thead th.ndl-c-d')).toHaveCount(6);
  await expect(page.locator(`#mx-${row} td.ndl-c-d .dst`)).toHaveCount(6);
  expect(await page.locator('#mx-table thead th').first().evaluate((e) => getComputedStyle(e).position)).toBe('sticky');
  expect(await page.locator(`#mx-${row} th.ndl-c-row`).evaluate((e) => getComputedStyle(e).position)).toBe('sticky');
  // Symbol und Text (für Screenreader und Tooltip), nie nur Farbe
  const cell = page.locator(`#mx-${row} td.ndl-c-d .dst`).first();
  await expect(cell.locator('.dst-sym')).not.toHaveText('');
  await expect(cell.locator('.sr')).not.toHaveText('');
  await page.locator('.seg button', { hasText: 'mit Äusserung' }).click();
  await expect(page.locator('#mx-table')).toHaveClass(/is-text/);
  await expect(page.locator(`#mx-${row} .ndl-txt`).first()).toContainText('unterstützt Abs. 2g');
  // Filter
  await page.selectOption('#mx-deleg', 'de');
  await expect(page.locator('#mx-table thead th.ndl-c-d')).toHaveCount(1);
  await page.selectOption('#mx-deleg', '');
  await page.selectOption('#mx-stance', 'oppose');
  await expect(page.locator('.ndl')).toContainText('Keine Zeilen entsprechen den Filtern');
  await page.selectOption('#mx-stance', 'support');
  await expect(page.locator(`#mx-${row}`)).toBeVisible();
  await page.selectOption('#mx-stance', '');
  await page.selectOption('#mx-meeting', 'm1');
  expect(await page.locator('#mx-table tbody tr').count()).toBeGreaterThan(0);
  await page.selectOption('#mx-meeting', '');
  await page.locator('#mx-withpos').check();
  const n = await page.locator('#mx-table tbody tr').count();
  const dd = await dossier(page);
  expect(n).toBe(Object.keys(dd.stances).filter((r) => dd.positions[r]).length);
  // Kennzahlen: gleiche Haltung wie CH (CH-Position der Zeile: Unterstützung mit Änderungen → Unterstützung)
  await expect(page.locator('#mx-allies')).toContainText('FR');
  await expect(page.locator('#mx-allies')).toContainText('NL');
  // Rückgängig (Intervention, Haltung DE, drei Haltungen)
  for (let i = 0; i < 3; i++) await page.locator('.dbar button', { hasText: 'Rückgängig' }).click();
  await expect.poll(async () => ((await dossier(page)).stances[row] || []).length).toBe(before);
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
});

// ------------------------------------------------------------------ Sitzung
test('Sitzung anlegen, vorbereiten, nachbereiten (Intervention, Haltung); Sitzungsbericht als Word (DE/FR) und Druckansicht', async ({ page }) => {
  test.setTimeout(180000);
  const log = await open(page);
  const id = await loadDemo(page);
  await nav(page, `#/delegationen?ds=${id}&nkt=meetings&ui=de`);
  await page.locator('#mt-new').click();
  await page.fill('#mt-date', '2026-04-02');
  await page.fill('#mt-body', 'Ratsarbeitsgruppe Grenzen');
  await page.fill('#mt-title', 'Lesung Kompromisstext Art. 8');
  await page.locator('.ndl-docs .check', { hasText: 'WK 4049/26' }).locator('input').check();
  await page.locator('#mt-save').click();
  await expect(page).toHaveURL(/po=m2/);
  await expect(page.locator('#mt-h')).toHaveText('Lesung Kompromisstext Art. 8');
  // Vorbereiten: anstehende Zeilen mit CH-Position und geänderte
  const d = await dossier(page);
  await expect(page.locator('#mt-agenda tbody tr')).toHaveCount(Object.keys(d.positions).length);
  await page.locator('.seg button', { hasText: /^geändert/ }).click();
  expect(await page.locator('#mt-agenda tbody tr').count()).toBeGreaterThan(0);
  // Nachbereiten
  await page.locator('.seg button', { hasText: /^Nachbereiten/ }).click();
  await page.selectOption('#mt-if-row', DTC_ART8_ROW);
  await page.fill('#mt-if-text', 'Intervention CH: Frist von 36 Stunden prüfen.');
  await page.selectOption('#mt-if-result', 'taken-up');
  await page.locator('#mt-if-save').click();
  await expect(page.locator('.niv-item', { hasText: 'Frist von 36 Stunden' })).toBeVisible();
  await page.selectOption('#mt-sf-row', DTC_ART8_ROW);
  await page.selectOption('#mt-sf-stance', 'scrutiny');
  await page.locator('#mt-sf-g-it').click();
  await page.locator('#mt-sf-g-at').click();
  await page.locator('#mt-sf-save').click();
  await expect(page.locator('.nmt-stances li')).toHaveCount(1);
  const d2 = await dossier(page);
  const iv = d2.interventions.find((x) => /36 Stunden/.test(x.text));
  expect(iv).toMatchObject({ meeting: 'm2', row: DTC_ART8_ROW, result: 'taken-up', by: 'NB' });
  expect(d2.stances[DTC_ART8_ROW].filter((s) => s.meeting === 'm2').map((s) => s.deleg).sort()).toEqual(['at', 'it']);
  // Wirkung ändern
  await page.locator('.niv-item', { hasText: 'Frist von 36 Stunden' }).locator('select').selectOption('rejected');
  await expect.poll(async () => (await dossier(page)).interventions.find((x) => /36 Stunden/.test(x.text)).result).toBe('rejected');
  // Sitzungsbericht Word DE und FR
  const w = await download(page, () => page.locator('#mt-word').click());
  expect(w.name).toMatch(/^Sitzungsbericht_.*\.docx$/);
  const x = xmlText(docxXml(w.bytes));
  expect(x).toContain('Sitzungsbericht');
  expect(x).toContain('Frist von 36 Stunden');
  await page.locator('.nmt .seg button', { hasText: 'FR' }).click();
  const wf = await download(page, () => page.locator('#mt-word').click());
  expect(xmlText(docxXml(wf.bytes))).toContain('Rapport de séance');
  writeFileSync(join(OUT, 'sitzungsbericht-de.docx'), w.bytes);
  writeFileSync(join(OUT, 'sitzungsbericht-fr.docx'), wf.bytes);
  // Druckansicht
  const p = await printPdf(page, `#/druck?ds=${id}&pv=meeting&po=m2~de&ui=de`, 'druck-sitzung');
  expect(p.text).toContain('Sitzungsbericht');
  expect(p.text).toContain('Frist von 36 Stunden');
  expect(p.text).toMatch(/LIMITE/);
  const pf = await printPdf(page, `#/druck?ds=${id}&pv=meeting&po=m1~fr&ui=de`, 'druck-sitzung-fr');
  expect(pf.text).toContain('Rapport de séance');
  // Ausgabe: Abschnitt Sitzungsbericht
  await nav(page, `#/ausgabe?ds=${id}&ui=de`);
  await page.selectOption('#out-meeting', 'm2');
  const wo = await download(page, () => page.locator('#out-meeting-word').click());
  expect(xmlText(docxXml(wo.bytes))).toContain('Frist von 36 Stunden');
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
});

// ------------------------------------------------------------------ Bilanz
test('Bilanz: Vorschlag gekennzeichnet und bestätigen, Ergebnis ändern mit Notiz, Statistik, Word DE/FR, Druckansicht', async ({ page }) => {
  test.setTimeout(180000);
  const log = await open(page);
  const id = await loadDemo(page);
  const d = await dossier(page);
  await nav(page, `#/position?ds=${id}&nkt=bilanz&ui=de`);
  await expect(page.locator('.nbal-row')).toHaveCount(Object.keys(d.positions).length);
  const open1 = Object.keys(d.positions).filter((r) => !d.positions[r].outcome);
  const sugg = page.locator(`#bal-${open1[0]} .nbal-sugg`);
  await expect(sugg).toContainText('Vorschlag (nicht bestätigt)');
  await expect(sugg.locator('.nbal-reason')).not.toHaveText('');
  const status = await page.evaluate((r) => window.__sgk.neg.core.suggestOutcome(window.__sgk.neg.dossier(), r).status, open1[0]);
  await page.locator('#bal-ok-' + open1[0]).click();
  await expect.poll(async () => ((await dossier(page)).positions[open1[0]].outcome || {}).status).toBe(status);
  expect((await dossier(page)).positions[open1[0]].outcome.by).toBe('NB');
  await expect(page.locator(`#bal-${open1[0]} .nbal-conf`)).toBeVisible();
  // ändern mit Notiz
  await page.locator('#bal-edit-' + open1[1]).click();
  await page.selectOption('#bal-st-' + open1[1], 'not');
  await page.fill('#bal-note-' + open1[1], 'Kompromiss streicht das Anliegen.');
  await page.locator('#bal-save-' + open1[1]).click();
  await expect.poll(async () => ((await dossier(page)).positions[open1[1]].outcome || {}).note).toBe('Kompromiss streicht das Anliegen.');
  const h = (await dossier(page)).positions[open1[1]].history;
  expect(h[h.length - 1]).toMatchObject({ source: 'outcome', outcome: 'not', by: 'NB' });
  // Vergleich Textvorschlag ↔ Kompromiss aufklappbar
  if (await page.locator(`#bal-${open1[2]} .nbal-cmp`).count()) {
    await page.locator(`#bal-${open1[2]} .nbal-cmp summary`).click();
    await expect(page.locator(`#bal-${open1[2]} .nbal-diff`)).toBeVisible();
  }
  // Statistik
  const b = await page.evaluate(() => window.__sgk.neg.core.balance(window.__sgk.neg.dossier()));
  await expect(page.locator('#bal-outcomes tr', { hasText: 'nicht erreicht' }).locator('td.num')).toHaveText(String(b.byOutcome.not));
  // Word DE/FR und Druck
  const w = await download(page, () => page.locator('#bal-word').click());
  expect(w.name).toMatch(/^Bilanz_.*\.docx$/);
  const x = xmlText(docxXml(w.bytes));
  expect(x).toContain('Bilanz der Anliegen der Schweiz');
  expect(x).toContain('Kompromiss streicht das Anliegen.');
  expect(x).toContain('Vorschlag (nicht bestätigt)');
  writeFileSync(join(OUT, 'bilanz-de.docx'), w.bytes);
  await page.locator('.nbal .seg button', { hasText: 'FR' }).click();
  const wf = await download(page, () => page.locator('#bal-word').click());
  expect(xmlText(docxXml(wf.bytes))).toContain('Bilan des préoccupations de la Suisse');
  writeFileSync(join(OUT, 'bilanz-fr.docx'), wf.bytes);
  const p = await printPdf(page, `#/druck?ds=${id}&pv=balance&po=de&ui=de`, 'druck-bilanz');
  expect(p.text).toContain('Bilanz');
  expect(p.text).toContain('Kompromiss streicht das Anliegen.');
  expect(p.text).toContain('Vorschlag (nicht bestätigt)');
  const pf = await printPdf(page, `#/druck?ds=${id}&pv=balance&po=fr&ui=fr`, 'druck-bilanz-fr');
  expect(pf.text).toContain('Bilan');
  // Ausgabe: Abschnitt Bilanz
  await nav(page, `#/ausgabe?ds=${id}&ui=de`);
  await expect(page.locator('#out-bal-h')).toHaveText('Bilanz');
  const wo = await download(page, () => page.locator('#out-balance-word').click());
  expect(xmlText(docxXml(wo.bytes))).toContain('Bilanz der Anliegen der Schweiz');
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
});

// ------------------------------------------------------------------ Zusammenführen
function mergeFiles() {
  const base = demo();
  const rows = Object.keys(base.positions);
  const [r1, r2] = rows;
  // Person A: Position r1 (Text), neue Sitzung
  let a = N.setPosition(base, r1, { text: 'Text von A.' }, { by: 'AA', at: '2026-11-10T09:00:00.000Z' });
  a = N.addMeeting(a, { date: '2026-11-05', body: 'Ratsarbeitsgruppe', title: 'Sitzung von A' }).dossier;
  // Person B: Position r1 anders (Text), Position r2 (Priorität), Haltung, Intervention i3 gelöscht
  let b = N.setPosition(base, r1, { text: 'Text von B.' }, { by: 'BB', at: '2026-11-10T10:00:00.000Z' });
  b = N.setPosition(b, r2, { priority: 'redline' }, { by: 'BB', at: '2026-11-10T10:05:00.000Z' });
  b = N.setStance(b, r2, { deleg: 'se', stance: 'oppose', text: 'Haltung aus Datei B', meeting: 'm1', by: 'BB', at: '2026-11-10T10:06:00.000Z' }).dossier;
  b = N.removeIntervention(b, 'i3');
  const w = (name, d) => { const f = join(OUT, name); writeFileSync(f, N.exportDossier(d, { compact: true })); return f; };
  return { r1, r2, base: w('stamm.json', base), a: w('datei-a.json', a), b: w('datei-b.json', b) };
}

test('Zusammenführen: Projektdatei einer Kollegin ohne und mit Stammdatei, Konflikte entscheiden, Sicherung, Ergebnis, Rückgängig', async ({ page }) => {
  test.setTimeout(180000);
  const f = mergeFiles();
  const log = await open(page);
  // Stand A als eigenes Dossier
  await page.setInputFiles('#neg-project-file', f.a);
  await expect(page).toHaveURL(/#\/synopse\?.*ds=d-2024-0670/);
  const id = (await dossier(page)).id;
  await page.locator('#dbar-merge').click();
  await expect(page).toHaveURL(/#\/zusammenfuehren/);
  await expect(page.locator('.nhead-title')).toHaveText('Projektdatei zusammenführen');
  await expect(page.locator('#merge-base-h')).toContainText('optional');
  await page.setInputFiles('#merge-theirs', f.b);
  // ohne Stammdatei: Hinweis, Konflikte, Übersicht
  await expect(page.locator('.nmerge-warn')).toContainText('Ohne Stammdatei erkennt das Tool keine Löschungen');
  const nConf = await page.locator('.nmc').count();
  expect(nConf).toBeGreaterThanOrEqual(1);
  await expect(page.locator('.nmc', { hasText: 'Position CH' }).first()).toContainText('Text von B.');
  await expect(page.locator('#mg-apply')).toBeDisabled();
  await page.locator('#mg-l-theirs summary').click();
  await expect(page.locator('#mg-l-theirs li').first()).toBeVisible();
  // Konflikte: Sammelaktion «andere Datei»
  await page.locator('#mg-all-theirs').click();
  await expect(page.locator('#mg-prog')).toHaveText(`${nConf} von ${nConf} entschieden`);
  await page.locator('#mg-backup').uncheck();
  await page.locator('#mg-apply').click();
  await expect(page.locator('.nhead-title')).toHaveText('Zusammengeführt');
  let d = await dossier(page);
  expect(d.positions[f.r1].text).toBe('Text von B.');
  expect(d.positions[f.r2].priority).toBe('redline');
  expect(d.stances[f.r2].some((s) => s.text === 'Haltung aus Datei B' && s.by === 'BB')).toBe(true);
  expect(d.meetings.some((m) => m.title === 'Sitzung von A')).toBe(true);
  expect(d.interventions.some((x) => x.id === 'i3')).toBe(true); // ohne Stammdatei keine Löschung
  expect(d.positions[f.r1].history.some((h) => h.by === 'AA')).toBe(true);
  expect(d.positions[f.r1].history.some((h) => h.by === 'BB')).toBe(true);
  // Rückgängig
  await page.locator('#mg-undo').click();
  await expect.poll(async () => (await dossier(page)).positions[f.r1].text).toBe('Text von A.');
  // mit Stammdatei: Löschung erkannt, Text beider Seiten zusammenführen und bearbeiten
  await nav(page, `#/zusammenfuehren?ds=${id}&ui=de`);
  await page.setInputFiles('#merge-theirs', f.b);
  await page.setInputFiles('#merge-base', f.base);
  await expect(page.getByText('Ohne Stammdatei erkennt')).toHaveCount(0);
  await page.locator('#mg-l-rem summary').click();
  await expect(page.locator('#mg-l-rem')).toContainText('Intervention');
  const c = page.locator('.nmc', { hasText: 'Text von B.' });
  await expect(c.locator('.nmc-side.is-base')).toBeVisible();
  await expect(c.locator('.nmc-diff-t ins')).toBeVisible();
  await c.locator('.seg button', { hasText: 'Beide zusammenführen' }).click();
  await c.locator('textarea').fill('Text von A und B, bereinigt.');
  const rest = page.locator('.nmc:not(.is-decided)');
  while (await rest.count()) await rest.first().locator('.seg button', { hasText: 'Mein Stand' }).click();
  await expect(page.locator('#mg-apply')).toBeEnabled();
  const bk = await download(page, () => page.locator('#mg-apply').click());
  expect(bk.name).toMatch(/^Verhandlung_.*\.json$/);
  expect(JSON.parse(readFileSync(bk.path, 'utf8')).positions[f.r1].text).toBe('Text von A.');
  await expect(page.locator('.nhead-title')).toHaveText('Zusammengeführt');
  d = await dossier(page);
  expect(d.positions[f.r1].text).toBe('Text von A und B, bereinigt.');
  expect(d.interventions.some((x) => x.id === 'i3')).toBe(false);
  // Projektdatei des Ergebnisses lädt fehlerfrei
  expect(N.importDossier(JSON.stringify(d)).errors).toEqual([]);
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
});

test('Zusammenführen: Kürzel wird beim Öffnen abgefragt; andere Dossier-Kennung wird gewarnt (DE/FR)', async ({ page }) => {
  const log = await open(page, '#/dossiers?ui=de', { by: null });
  const id = await loadDemo(page);
  await nav(page, `#/zusammenfuehren?ds=${id}&ui=de`);
  await expect(page.locator('#nby-h')).toBeVisible();
  await page.fill('#by-input', 'MM');
  await page.keyboard.press('Enter');
  await expect(page.locator('#nby-h')).toHaveCount(0);
  await expect(page.locator('#by-badge')).toHaveText('MM');
  const other = N.exportDossier(demo('neg-demo-screening.json'), { compact: true });
  writeFileSync(join(OUT, 'anderes-dossier.json'), other);
  await page.setInputFiles('#merge-theirs', join(OUT, 'anderes-dossier.json'));
  await expect(page.locator('.nmerge-warn')).toContainText('gehört zu einem anderen Dossier');
  await nav(page, `#/zusammenfuehren?ds=${id}&ui=fr`);
  await expect(page.locator('.nmerge-warn')).toContainText('appartient à un autre dossier');
  expect(log.errors).toEqual([]);
});

// ------------------------------------------------------------------ Vorschau
test('Wirkung im geltenden Recht (DTC, Zeile zu Art. 8 SGK): Diff je Spur, Kennzeichnung, Link mit pv; Übersicht Wirkung im SGK', async ({ page }) => {
  const log = await open(page);
  const id = await loadDemo(page);
  await nav(page, `#/synopse?ds=${id}&r=${DTC_ART8_ROW}&ui=de`);
  await page.locator('#ndt-impact').click();
  await expect(page.locator('.npv-hypo')).toContainText('hypothetisch, nicht amtlich');
  await expect(page.locator('.npv-title')).toContainText('Art. 8 SGK');
  await expect(page.locator('#pv-blocks ins').first()).toBeVisible();
  await expect(page.locator('#pv-blocks .npv-b.is-row').first()).toContainText('36 hours');
  const href = await page.locator('#pv-open-sgk').getAttribute('href');
  expect(href).toMatch(new RegExp(`^#/lesen\\?u=art_8(&k=[^&]+)?&pv=${id}~(council|ep|com|agreement)~latest$`));
  // ganze Bestimmung zeigt mehr Blöcke
  const nRow = await page.locator('#pv-blocks li').count();
  await page.locator('.npv .seg button', { hasText: 'ganze Bestimmung' }).click();
  expect(await page.locator('#pv-blocks li').count()).toBeGreaterThan(nRow);
  // Spur wechseln: Kommission
  await page.locator('.npv .seg button', { hasText: 'Kommission' }).click();
  expect(await page.locator('#pv-open-sgk').getAttribute('href')).toContain(`pv=${id}~com~latest`);
  // Übersicht
  await nav(page, `#/wirkung?ds=${id}&ui=de`);
  await expect(page.locator('.nhead-title')).toHaveText('Wirkung im SGK');
  await expect(page.locator('.npv-hypo')).toBeVisible();
  const l = page.locator('#pvo-link-council-art_8');
  await expect(l).toBeVisible();
  expect(await l.getAttribute('href')).toBe(`#/lesen?u=art_8&pv=${id}~council~latest`);
  await expect(page.locator('#pvo-council')).toBeVisible();
  await expect(page.locator('section', { has: page.locator('#pvo-council') }).locator('.npv-unres-d summary')).toContainText('Nicht angewandt');
  // Link führt in das Modul Rechtsakte (Zielansicht baut UI-RECHTSAKTE)
  await l.click();
  await expect(page).toHaveURL(new RegExp(`#/lesen\\?.*u=art_8.*pv=${id}`));
  // Lesen stellt in der Vorschau den Rechtstext auf EN um (history.replaceState); abwarten, sonst überschreibt das die nächste Navigation
  await expect(page).toHaveURL(/[?&]l=en/);
  // FR: Gründe übersetzt
  await nav(page, `#/wirkung?ds=${id}&ui=fr`);
  const sec = page.locator('section', { has: page.locator('#pvo-council') });
  await sec.locator('.npv-unres-d summary').click();
  await expect(sec.locator('.npv-unres-l li span[lang="fr"]').first()).toBeVisible();
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
});

// ------------------------------------------------------------------ Anleitung
test('Anleitung DE/FR: neue Aufgaben, Begriffe, Arbeit im Team, Grenzen; Kontext-Hilfe aus den neuen Ansichten', async ({ page }) => {
  const log = await open(page);
  const id = await loadDemo(page);
  for (const [ui, words] of [['de', ['Stammdatei', 'Haltung einer Delegation', 'Intervention', 'Bilanz', 'Konflikt', 'Vorschau', 'Eine Person führt die Stammdatei']], ['fr', ['Fichier de référence', 'Position d’une délégation', 'Intervention', 'Bilan', 'Conflit', 'Aperçu', 'Une personne tient le fichier de référence']]]) {
    await nav(page, withUi('#/n-anleitung', ui));
    await expect(page.locator('.g-task')).toHaveCount(13);
    await expect(page.locator('#g-teamarbeit')).toBeVisible();
    const body = await page.locator('.guide').innerText();
    expect(body).not.toContain('[[');
    expect(body).not.toContain('⟦');
    expect(body).not.toContain('{n}');
    for (const w of words) expect(body, `${ui}: ${w}`).toContain(w);
  }
  for (const [h, sec] of [[`#/delegationen?ds=${id}`, 'delegationen'], [`#/delegationen?ds=${id}&nkt=meetings`, 'sitzung'], [`#/position?ds=${id}&nkt=bilanz`, 'bilanz'], [`#/wirkung?ds=${id}`, 'vorschau'], [`#/zusammenfuehren?ds=${id}`, 'team']]) {
    await nav(page, withUi(h, 'de'));
    await page.locator('.help-link').first().click();
    await expect(page).toHaveURL(new RegExp('#/n-anleitung\\?.*sec=' + sec));
    await expect(page.locator('#g-' + sec)).toBeInViewport();
  }
  expect(log.errors).toEqual([]);
});

// ------------------------------------------------------------------ Kartenmodelle
test('Kartenmodelle (Zeile, Chronologie, Vergleich, Was ist neu, Wirkung) gültig nach validateCard; DOCX und PDF über src/export; Menü in der Oberfläche', async ({ page }) => {
  test.setTimeout(180000);
  const log = await open(page);
  const id = await loadDemo(page);
  const cards = await page.evaluate((r) => window.__sgk.neg.cards(r), DTC_ART8_ROW);
  for (const k of ['row', 'chron', 'compareSide', 'compareRedline', 'changes', 'impact']) {
    const c = cards[k];
    expect(c, k).toBeTruthy();
    const v = validateCard(c);
    expect(v.errors, k).toEqual([]);
    const docx = cardToDocx(c, { redline: 'format' });
    const x = xmlText(docxXml(docx));
    expect(x.length, k).toBeGreaterThan(100);
    expect(x, k).toContain(c.title.slice(0, 20));
    const tracked = xmlText(docxXml(cardToDocx(c, { redline: 'tracked', author: 'NB' })));
    expect(tracked.length).toBeGreaterThan(50);
    const pdf = cardToPdf(c, { format: 'a4' });
    const p = await pdfText(pdf, 3);
    expect(p.pages, k).toBeGreaterThan(0);
    expect(p.text, k).toContain(c.title.slice(0, 12));
    writeFileSync(join(OUT, `karte-${k}.docx`), docx);
    writeFileSync(join(OUT, `karte-${k}.pdf`), pdf);
  }
  expect(cards.impact.kind).toBe('preview');
  expect(cards.impact.sections[0].flags[0].kind).toBe('preview');
  expect(JSON.stringify(cards.impact)).toContain('36 hours');
  expect(cards.compareSide.columns).toHaveLength(2);
  // in der Oberfläche: Menü der Chronologie mit Word-Export aus dem Kartenmodell
  await nav(page, `#/synopse?ds=${id}&r=${DTC_ART8_ROW}&ui=de`);
  await page.locator('#ndt-chron').click();
  await page.locator('.nd-sec .export-menu > button').click();
  const w = await download(page, () => page.locator('.menu-item', { hasText: 'Word, Änderungen formatiert' }).click());
  expect(w.name).toMatch(/\.docx$/);
  expect(xmlText(docxXml(w.bytes))).toContain('Article 13');
  await page.locator('.nd-sec .export-menu > button').click();
  const pdf = await download(page, () => page.locator('.menu-item', { hasText: 'PDF mit Text, A4' }).click());
  expect((await pdfText(pdf.bytes)).text).toContain('Article 13');
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
});

// ------------------------------------------------------------------ Alte Projektdatei
test('Alte Projektdatei ohne Delegationen, Sitzungen, Haltungen, Interventionen, Ergebnisse lädt; neue Ansichten funktionieren', async ({ page }) => {
  const d = demo();
  for (const k of ['delegations', 'meetings', 'stances', 'interventions']) delete d[k];
  for (const p of Object.values(d.positions)) delete p.outcome;
  const f = join(OUT, 'alt.json');
  writeFileSync(f, N.exportDossier(d, { compact: true }));
  const log = await open(page);
  await page.setInputFiles('#neg-project-file', f);
  await expect(page).toHaveURL(/#\/synopse/);
  const id = (await dossier(page)).id;
  for (const h of [`#/delegationen?ds=${id}`, `#/delegationen?ds=${id}&nkt=meetings`, `#/delegationen?ds=${id}&nkt=deleg`, `#/position?ds=${id}&nkt=bilanz`, `#/ausgabe?ds=${id}`, `#/wirkung?ds=${id}`, `#/zusammenfuehren?ds=${id}`]) {
    await nav(page, h + '&ui=de');
    await page.waitForTimeout(50);
  }
  await nav(page, `#/delegationen?ds=${id}&ui=de`);
  await expect(page.locator('.ndl .empty-title')).toHaveText('Noch keine Haltungen erfasst');
  await nav(page, `#/delegationen?ds=${id}&nkt=deleg&ui=de`);
  await expect(page.locator('#dg-table tbody tr')).toHaveCount(33);
  await nav(page, `#/synopse?ds=${id}&r=${DTC_ART8_ROW}&ui=de`);
  await page.locator('#ndt-deleg').click();
  await page.locator('#rd-sf-g-be').click();
  await page.locator('#rd-sf-save').click();
  await expect.poll(async () => ((await dossier(page)).stances || {})[DTC_ART8_ROW]).toHaveLength(1);
  expect((await dossier(page)).delegations).toHaveLength(33);
  expect(log.errors).toEqual([]);
});

// ------------------------------------------------------------------ Grosse Matrix
test('Matrix bleibt flüssig bei 400 Zeilen × 35 Delegationen (seitenweises Rendern, fixierte Kopfzeile und Zeilenspalte)', async ({ page }) => {
  let d = demo();
  d = { ...d, id: 'd-matrix', short: 'Matrix gross', stances: {}, interventions: [], meetings: d.meetings };
  d = N.ensureDelegations({ ...d, delegations: undefined });
  for (let i = 0; i < 4; i++) d = N.addDelegation(d, { kind: 'other', code: 'X' + i, name: 'Extra ' + i }).dossier;
  const dels = d.delegations.slice(0, 35).map((x) => x.id);
  const rows = N.sortedRows(d).slice(0, 400).map((r) => r.id);
  const S = ['support', 'oppose', 'reservation', 'scrutiny', 'proposal', 'neutral'];
  let n = 0;
  const stances = {};
  rows.forEach((rid, i) => { stances[rid] = dels.map((g, j) => ({ id: 'h' + (++n), deleg: g, stance: S[(i + j) % 6], text: (i + j) % 5 ? '' : 'Äusserung ' + n, meeting: 'm1', at: '2026-03-17T10:00:00.000Z' })); });
  d = { ...d, stances };
  const f = join(OUT, 'matrix-gross.json');
  writeFileSync(f, N.exportDossier(d, { compact: true }));
  const log = await open(page);
  await page.setInputFiles('#neg-project-file', f);
  await expect(page).toHaveURL(/#\/synopse/);
  const t0 = Date.now();
  await nav(page, '#/delegationen?ds=d-matrix&ui=de');
  await page.waitForSelector('#mx-table tbody tr');
  const ms = Date.now() - t0;
  expect(ms).toBeLessThan(4000);
  await expect(page.locator('#mx-table thead th.ndl-c-d')).toHaveCount(35);
  const first = await page.locator('#mx-table tbody tr').count();
  expect(first).toBeLessThanOrEqual(80);
  await page.locator('#mx-scroll').evaluate((e) => { e.scrollTop = e.scrollHeight; });
  await expect.poll(() => page.locator('#mx-table tbody tr').count()).toBeGreaterThan(first);
  // fixierte Kopfzeile und Zeilenspalte bleiben beim Scrollen sichtbar
  await page.locator('#mx-scroll').evaluate((e) => { e.scrollTop = 600; e.scrollLeft = 800; });
  const pos = await page.evaluate(() => {
    const w = document.getElementById('mx-scroll').getBoundingClientRect();
    const th = document.querySelector('#mx-table thead th.ndl-c-d').getBoundingClientRect();
    const rc = document.querySelector('#mx-table tbody tr:nth-child(20) th.ndl-c-row').getBoundingClientRect();
    return { headTop: th.top - w.top, rowLeft: rc.left - w.left };
  });
  expect(Math.abs(pos.headTop)).toBeLessThan(3);
  expect(Math.abs(pos.rowLeft)).toBeLessThan(3);
  const t1 = Date.now();
  await page.selectOption('#mx-stance', 'oppose');
  await page.waitForSelector('#mx-table tbody tr');
  expect(Date.now() - t1).toBeLessThan(3000);
  await page.selectOption('#mx-stance', '');
  await page.locator('.seg button', { hasText: 'mit Äusserung' }).click();
  await page.waitForSelector('#mx-table.is-text');
  expect(log.errors).toEqual([]);
});

// ------------------------------------------------------------------ FR, Layout, Schaltflächen, Screenshots
const DE_WORDS = ['Fassung', 'Fassungen', 'Spur', 'Zeile', 'Zeilen', 'Haltung', 'Haltungen', 'Delegation', 'Sitzung', 'Sitzungen', 'Intervention der', 'Ergebnis', 'Bilanz', 'Vorschlag', 'Zusammenführen',
  'Stammdatei', 'Konflikt', 'Konflikte', 'Kürzel', 'Wirkung', 'Vorschau', 'erreicht', 'teilweise', 'nicht', 'und', 'oder', 'mit', 'der', 'die', 'das', 'Unterstützung', 'Ablehnung', 'Vorbehalt', 'Prüfvorbehalt',
  'Gremium', 'Datum', 'Bemerkung', 'Rückgängig', 'Anleitung', 'Druckansicht', 'Beispiel', 'gleich', 'Übersicht', 'Ausgangsstand', 'Bestimmung', 'Spur'];
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
const NEW_VIEWS = (id, row) => [
  ['delegationen', `#/delegationen?ds=${id}`],
  ['delegationen-text', `#/delegationen?ds=${id}&po=v:text`],
  ['sitzungen', `#/delegationen?ds=${id}&nkt=meetings`],
  ['sitzung-vorbereiten', `#/delegationen?ds=${id}&nkt=meetings&po=m1`],
  ['sitzung-nachbereiten', `#/delegationen?ds=${id}&nkt=meetings&po=m1~post`],
  ['delegationen-verwalten', `#/delegationen?ds=${id}&nkt=deleg`],
  ['bilanz', `#/position?ds=${id}&nkt=bilanz`],
  ['wirkung', `#/wirkung?ds=${id}`],
  ['zusammenfuehren', `#/zusammenfuehren?ds=${id}`],
  ['ausgabe', `#/ausgabe?ds=${id}`],
  ['zeile-delegationen', `#/synopse?ds=${id}&r=${row}`, '#ndt-deleg'],
  ['zeile-wirkung', `#/synopse?ds=${id}&r=${row}`, '#ndt-impact'],
  ['druck-bilanz', `#/druck?ds=${id}&pv=balance&po=de`],
  ['druck-sitzung', `#/druck?ds=${id}&pv=meeting&po=m1~de`],
];
async function show(page, h, tab, ui) {
  await nav(page, withUi(h, ui));
  if (tab) await page.locator(tab).click();
  await page.waitForTimeout(60);
}
/** Stand «Person A» (DTC-Beispiel mit eigenen Änderungen) als aktives Dossier laden. */
async function loadA(page) {
  await nav(page, '#/dossiers');
  await page.setInputFiles('#neg-project-file', join(OUT, 'datei-a.json'));
  await expect(page).toHaveURL(/#\/synopse\?.*ds=/);
  await page.waitForSelector('.toast', { state: 'detached', timeout: 10000 }).catch(() => {});
  return (await dossier(page)).id;
}
/** Zusammenführen mit geladener Datei (Konflikte sichtbar). */
async function mergeLoaded(page, id, ui) {
  await nav(page, withUi(`#/zusammenfuehren?ds=${id}`, ui));
  if (!(await page.locator('.nmc').count())) {
    await page.setInputFiles('#merge-theirs', join(OUT, 'datei-b.json'));
    await page.setInputFiles('#merge-base', join(OUT, 'stamm.json'));
  }
  await page.waitForSelector('.nmc');
}

test('Oberfläche FR in allen neuen Ansichten: keine fehlenden Schlüssel, keine deutschen Reste', async ({ page }) => {
  test.setTimeout(180000);
  mergeFiles();
  const log = await open(page, '#/dossiers?ui=fr');
  const id = await loadA(page);
  const d = await dossier(page);
  const user = [d.short, d.title, ...(d.meetings || []).flatMap((m) => [m.title, m.body, m.note]), ...(d.delegations || []).filter((g) => g.fictitious).flatMap((g) => [g.name.de, g.name.fr, g.code]),
    ...Object.values(d.stances || {}).flat().map((s) => s.text), ...(d.interventions || []).flatMap((x) => [x.text, x.note]), ...Object.values(d.positions).flatMap((p) => [p.text, p.outcome && p.outcome.note]), 'Text von A.', 'Text von B.', 'Haltung aus Datei B', 'Sitzung von A'].filter(Boolean).sort((a, b) => b.length - a.length);
  const found = [];
  const check = async (name) => {
    let txt = await uiText(page);
    for (const u of user) txt = txt.split(u).join(' ');
    const body = await page.evaluate(() => document.body.innerText);
    if (body.includes('⟦')) found.push(`${name}: fehlender Schlüssel ${body.slice(body.indexOf('⟦'), body.indexOf('⟦') + 40)}`);
    for (const w of DE_WORDS) {
      const m = new RegExp(`(^|[^\\p{L}])${w}(?=$|[^\\p{L}])`, 'u').exec(txt);
      if (m) found.push(`${name}: «${w}» in «${txt.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\n/g, ' ')}»`);
    }
  };
  for (const [name, h, tab] of NEW_VIEWS(id, DTC_ART8_ROW)) { await show(page, h, tab, 'fr'); await check(name); }
  await mergeLoaded(page, id, 'fr');
  await check('zusammenfuehren-konflikte');
  await nav(page, withUi(`#/delegationen?ds=${id}&nkt=meetings`, 'fr'));
  await page.locator('#mt-new').click();
  await check('sitzung-neu');
  await page.locator('#by-badge').click();
  await check('dialog-kuerzel');
  await page.keyboard.press('Escape');
  expect(found, found.slice(0, 30).join('\n')).toEqual([]);
  expect(log.errors).toEqual([]);
});

for (const width of [1024, 1280, 1440, 1920]) {
  test(`Etappe 3: Überlauf und Überlappung bei ${width} px (DE und FR)`, async ({ page }) => {
    test.setTimeout(240000);
    mergeFiles();
    await page.setViewportSize({ width, height: 900 });
    const log = await open(page);
    const id = await loadA(page);
    const all = [];
    for (const ui of ['de', 'fr']) {
      for (const [name, h, tab] of NEW_VIEWS(id, DTC_ART8_ROW)) {
        await show(page, h, tab, ui);
        for (const i of await page.evaluate(layoutCheck)) all.push(`${width} ${ui} ${name}: ${i}`);
      }
      await mergeLoaded(page, id, ui);
      for (const i of await page.evaluate(layoutCheck)) all.push(`${width} ${ui} zusammenfuehren-konflikte: ${i}`);
      await nav(page, withUi(`#/delegationen?ds=${id}&nkt=meetings`, ui));
      await page.locator('#mt-new').click();
      for (const i of await page.evaluate(layoutCheck)) all.push(`${width} ${ui} sitzung-neu: ${i}`);
      // Reiter des Moduls: Platz oder sauberer Umbruch
      const navOk = await page.evaluate(() => { const v = document.querySelector('.views'); return v ? [...v.querySelectorAll('a')].every((a) => a.getBoundingClientRect().right <= innerWidth && a.scrollWidth <= a.clientWidth + 1) : true; });
      if (!navOk) all.push(`${width} ${ui}: Reiter des Moduls ragen heraus`);
    }
    expect(all, all.slice(0, 30).join('\n')).toEqual([]);
    expect(log.errors).toEqual([]);
  });
}

test('Etappe 3: Schaltflächen erkennbar, Tastaturbedienung und sichtbarer Fokus', async ({ page }) => {
  mergeFiles();
  const log = await open(page);
  const id = await loadA(page);
  const probs = [];
  for (const [name, h, tab] of NEW_VIEWS(id, DTC_ART8_ROW)) {
    if (name.startsWith('druck')) continue;
    await show(page, h, tab, 'de');
    for (const p of await page.evaluate(buttonCheck)) probs.push(`${name}: ${p}`);
  }
  await mergeLoaded(page, id, 'de');
  for (const p of await page.evaluate(buttonCheck)) probs.push(`zusammenfuehren-konflikte: ${p}`);
  expect(probs, probs.join('\n')).toEqual([]);
  // Tastatur: Delegation in der Mehrfachauswahl per Leertaste wählen, Fokusring sichtbar
  await nav(page, `#/synopse?ds=${id}&r=${DTC_ART8_ROW}&ui=de`);
  await page.locator('#ndt-deleg').focus();
  await page.keyboard.press('Enter');
  await page.locator('#rd-sf-g-at').focus();
  expect(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)).toBe('solid');
  await page.keyboard.press('Space');
  await expect(page.locator('#rd-sf-g-at')).toHaveAttribute('aria-pressed', 'true');
  // Etiketten (Haltung der Delegation, Ergebnis) sehen nicht wie Schaltflächen aus
  await nav(page, `#/position?ds=${id}&nkt=bilanz&ui=de`);
  expect(await page.locator('.nout-t').first().evaluate((e) => getComputedStyle(e).cursor)).not.toBe('pointer');
  expect(log.errors).toEqual([]);
});

test('Screenshots Etappe 3: neue Ansichten DE und FR bei 1440, kritische bei 1024 und 1920', async ({ page }) => {
  test.setTimeout(300000);
  mergeFiles();
  await open(page);
  const id = await loadA(page);
  const shot = async (w, ui, name, h, tab, after) => {
    await page.setViewportSize({ width: w, height: 900 });
    await show(page, h, tab, ui);
    await page.evaluate(() => document.querySelectorAll('.view, .panel-body, #syn-scroll').forEach((e) => { e.scrollTop = 0; }));
    if (after) await after();
    await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(SHOTS, `neg3-${w}-${ui}-${name}.png`) });
  };
  const scrollTo = (sel) => async () => { await page.locator(sel).first().scrollIntoViewIfNeeded(); };
  for (const ui of ['de', 'fr']) {
    for (const [name, h, tab] of NEW_VIEWS(id, DTC_ART8_ROW)) await shot(1440, ui, name, h, tab);
    await shot(1440, ui, 'bilanz-liste', `#/position?ds=${id}&nkt=bilanz`, null, scrollTo('.nbal-list'));
    await shot(1440, ui, 'delegationen-matrix', `#/delegationen?ds=${id}`, null, scrollTo('#mx-table'));
    await shot(1440, ui, 'zeile-delegationen-formular', `#/synopse?ds=${id}&r=${DTC_ART8_ROW}`, '#ndt-deleg', scrollTo('.ndl-form'));
    await page.setViewportSize({ width: 1440, height: 900 });
    await mergeLoaded(page, id, ui);
    await page.screenshot({ path: join(SHOTS, `neg3-1440-${ui}-zusammenfuehren-uebersicht.png`) });
    await page.locator('.nmc').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(SHOTS, `neg3-1440-${ui}-zusammenfuehren-konflikte.png`) });
    for (const w of [1024, 1920]) {
      await shot(w, ui, 'delegationen', `#/delegationen?ds=${id}`);
      await shot(w, ui, 'zeile-delegationen', `#/synopse?ds=${id}&r=${DTC_ART8_ROW}`, '#ndt-deleg');
      await shot(w, ui, 'zeile-wirkung', `#/synopse?ds=${id}&r=${DTC_ART8_ROW}`, '#ndt-impact');
      await shot(w, ui, 'bilanz', `#/position?ds=${id}&nkt=bilanz`);
      await shot(w, ui, 'sitzung-nachbereiten', `#/delegationen?ds=${id}&nkt=meetings&po=m1~post`);
      await page.setViewportSize({ width: w, height: 900 });
      await mergeLoaded(page, id, ui);
      await page.locator('.nmc').first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(SHOTS, `neg3-${w}-${ui}-zusammenfuehren-konflikte.png`) });
    }
  }
  // Dialog Kürzel
  await page.setViewportSize({ width: 1440, height: 900 });
  await nav(page, `#/synopse?ds=${id}&ui=de`);
  await page.locator('#by-badge').click();
  await page.screenshot({ path: join(SHOTS, 'neg3-1440-de-dialog-kuerzel.png') });
});

// ------------------------------------------------------------------ Word-Dokumente mit LibreOffice öffnen (falls vorhanden)
test('Sitzungsbericht und Bilanz (Word) lassen sich mit LibreOffice öffnen und in PDF wandeln', async () => {
  test.setTimeout(180000);
  const soffice = ['/usr/bin/soffice', '/usr/local/bin/soffice', '/usr/bin/libreoffice'].find((p) => existsSync(p));
  test.skip(!soffice, 'LibreOffice nicht installiert');
  const d = demo();
  const files = [['bilanz-de', N.buildPositionDocx(d, { variant: 'balance', lang: 'de' }), 'Bilanz der Anliegen der Schweiz'], ['sitzungsbericht-fr', N.buildPositionDocx(d, { variant: 'meeting', lang: 'fr' }), 'Rapport de séance']];
  const dir = join(OUT, 'soffice');
  mkdirSync(dir, { recursive: true });
  for (const [name, bytes, want] of files) {
    const f = join(dir, name + '.docx');
    writeFileSync(f, bytes);
    execFileSync(soffice, ['--headless', '--convert-to', 'pdf', '--outdir', dir, f], { timeout: 120000, stdio: 'ignore' });
    const p = await pdfText(readFileSync(join(dir, name + '.pdf')));
    expect(p.pages).toBeGreaterThan(0);
    expect(p.text).toContain(want);
  }
});
