// Beispielexporte nach der Carbon-Umstellung (Abnahme, kein Test): Karte als PNG, PDF als Bild, PDF mit Text, Word-Baustein,
// Druckansichten beider Module, Konsultationsdokument und Briefing als Word. Ablage: test/app/screenshots/carbon-export/.
// Aufruf: node test/app/carbon-exports.mjs [--file dist/sgk-navigator.html]
import { chromium } from 'playwright';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const FILE = resolve(ROOT, arg('--file', 'dist/sgk-navigator.html'));
const OUT = join(ROOT, 'test/app/screenshots/carbon-export');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await ctx.addInitScript(() => { try { localStorage.setItem('sgkn.by', 'NB'); } catch { /* */ } });
const page = await ctx.newPage();
const go = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(300); };
const save = async (name, act) => {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), act()]);
  const f = join(OUT, name + (dl.suggestedFilename().match(/\.[a-z0-9]+$/i) || [''])[0]);
  await dl.saveAs(f);
  console.log('gespeichert', f.replace(ROOT + '/', ''));
};
const menu = async (sel, label) => { await page.locator(sel).click(); await page.locator('.menu-item').filter({ hasText: label }).first().click(); };
await page.goto('file://' + FILE + '#/lesen?u=art_8&k=p3.a.i&l=de&ui=de');
await page.waitForFunction(() => window.__sgk && window.__sgk.ready, null, { timeout: 30000 });
await page.evaluate(() => document.fonts.ready);
// Chronologie einer Bestimmung (Schublade in Lesen)
const P = '.panel .export-menu > button';
await save('karte-chronologie-a4', () => menu(P, /^PNG A4/));
await save('karte-chronologie-169', () => menu(P, /^PNG 16:9/));
await save('karte-chronologie-a4-bild', () => menu(P, /PDF A4/));
await save('karte-chronologie-a4-text', () => menu(P, /PDF mit Text, A4/));
await save('karte-chronologie-word', () => menu(P, /Word, Redline als Formatierung/));
// Vergleich
await go('#/vergleich?u=art_8&k=p3.a&a=s00&b=s08&l=de&ui=de');
const V = '.view-compare .export-menu > button';
await save('karte-vergleich-a4', () => menu(V, /^PNG A4/));
await save('karte-vergleich-169-text', () => menu(V, /PDF mit Text, 16:9/));
// Druckansicht Lesen (Rechtsakte): Druckmedium emulieren
await go('#/lesen?u=art_8&l=de&ui=de');
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: join(OUT, 'druck-lesen.pdf'), format: 'A4', printBackground: true });
await page.emulateMedia({ media: 'screen' });
console.log('gespeichert test/app/screenshots/carbon-export/druck-lesen.pdf');
// Verhandlung: Beispiel-Dossier
await go('#/dossiers?ui=de');
await page.locator('#btn-demo').click();
await page.locator('#demo-load-demo').click();
await page.waitForSelector('.syn-row:not(.syn-headrow)');
const d = await page.evaluate(() => window.__sgk.neg.dossier());
const k = d.consultations[0].id;
await go(`#/konsultation?ds=${d.id}&nk=${k}&ui=de`);
await save('konsultation', () => page.locator('#cons-word').click());
await go(`#/ausgabe?ds=${d.id}&ui=de`);
await save('briefing', () => page.locator('#out-briefing-word').click());
for (const [name, h] of [['druck-briefing', `#/druck?ds=${d.id}&pv=briefing&po=all~order~de`], ['druck-synopse', `#/druck?ds=${d.id}&pv=synopse`], ['druck-konsultation', `#/druck?ds=${d.id}&pv=consultation&po=${k}`]]) {
  await go(h + '&ui=de');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, name + '.png') });
  await page.evaluate(() => document.body.classList.add('neg-printing'));
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: join(OUT, name + '.pdf'), format: 'A4', landscape: true, printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => document.body.classList.remove('neg-printing'));
  console.log('gespeichert', name + '.png/.pdf');
}
await browser.close();
