// Screenshots aller Ansichten nach der Carbon-Umstellung (Abnahme, kein Test).
// Aufruf: node test/app/carbon-shots.mjs [--file dist/sgk-navigator.html] [--w 1440,375] [--ui de,fr] [--only lesen,synopse] [--prefix carbon] [--check]
// --check: zusätzlich layoutCheck/buttonCheck (helpers.mjs) und horizontales Scrollen der Seite je Ansicht ausgeben.
import { chromium } from 'playwright';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync } from 'node:fs';
import { layoutCheck, buttonCheck } from './helpers.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const FILE = resolve(ROOT, arg('--file', 'dist/sgk-navigator.html'));
const WIDTHS = arg('--w', '1440').split(',').map(Number);
const UIS = arg('--ui', 'de').split(',');
const ONLY = arg('--only', '') ? arg('--only', '').split(',') : null;
const PREFIX = arg('--prefix', 'carbon');
const CHECK = process.argv.includes('--check');
const FULL = process.argv.includes('--full');
const AXE = process.argv.includes('--axe');
const axeSrc = AXE ? (await import('node:fs')).readFileSync(join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8') : '';
const axeAll = {};
const AXE_RULES = arg('--axe-rules', '') ? arg('--axe-rules', '').split(',') : null;
const SHOTS = join(ROOT, 'test/app/screenshots');
const MERGE = join(ROOT, 'test/app/out/neg3');
mkdirSync(SHOTS, { recursive: true });

// [Name, Hash, Aktion(page)?] Modul Rechtsakte
const RA = [
  ['uebersicht', '#/uebersicht'],
  ['uebersicht-zeitstrahl', '#/uebersicht', (p) => p.evaluate(() => document.querySelector('#tl-h').scrollIntoView({ block: 'start' }))],
  ['lesen', '#/lesen?u=art_8&l=de'],
  ['lesen-schublade', '#/lesen?u=art_8&k=p3.a.i&l=de'],
  ['lesen-anwendbar-hinweise', '#/lesen?u=art_8&m=datum&d=2026-01-15&l=de'],
  ['chronologie', '#/chronik?u=art_8&k=p3.a.i&l=de', async (p) => { for (const s of ['details.rat summary']) { const l = p.locator(s).first(); if (await l.count()) await l.click(); } await p.evaluate(() => document.querySelectorAll('.view').forEach((e) => { e.scrollTop = 0; })); }],
  ['chronologie-begruendung', '#/chronik?u=art_8&k=p3.a.i&l=de', async (p) => { const l = p.locator('details.rat summary').first(); if (await l.count()) { await l.click(); await l.scrollIntoViewIfNeeded(); } }],
  ['vergleich', '#/vergleich?u=art_8&k=p3.a&a=s00&b=s08&l=de'],
  ['vergleich-redline', '#/vergleich?u=art_8&k=p3.a&a=s00&b=s08&lay=redline&l=de'],
  ['vorschau-vorschlag', '#/lesen?u=art_8&pv=d-2024-0670~council~latest&l=en&red=1'],
  ['anhang-formular', '#/lesen?u=anx_V&l=de&s=s08', async (p) => { const b = p.locator('.legal-read .form-switch button:nth-child(2)').first(); if (await b.count()) { await b.click(); await b.scrollIntoViewIfNeeded(); } }],
  ['werk-ees', '#/lesen?w=ees&u=art_9&l=de'],
  ['aktualisieren', '#/aktualisieren'],
  ['anleitung', '#/anleitung'],
  ['anleitung-legende', '#/anleitung?sec=legende', (p) => p.evaluate(() => { const e = document.getElementById('g-legende'); if (e) e.scrollIntoView({ block: 'start' }); })],
  ['anleitung-legende-2', '#/anleitung?sec=legende', (p) => p.evaluate(() => { const e = document.querySelector('.g-legend h3:nth-of-type(3)') || document.getElementById('g-legende'); if (e) e.scrollIntoView({ block: 'start' }); })],
  ['info', '#/info'],
  ['exportmenue', '#/lesen?u=art_8&k=p3.a.i&l=de', (p) => p.locator('.panel .export-menu > button').click()],
  ['sammelkorb', '#/lesen?u=art_8&k=p3.a.i&l=de', async (p) => {
    if (!(await p.locator('#btn-basket .badge').count())) { await p.locator('.panel .export-menu > button').click(); await p.locator('.menu-item').filter({ hasText: /Sammelkorb|panier/i }).first().click(); await p.waitForTimeout(300); }
    await p.evaluate(() => { location.hash = '#/lesen?u=art_8'; }); await p.waitForTimeout(300);
    await p.locator('#btn-basket').click();
  }],
];
// Modul Verhandlung (id, row, k aus dem Beispiel-Dossier)
const NEG = (id, row, k) => [
  ['n-synopse', `#/synopse?ds=${id}`],
  ['n-synopse-diff', `#/synopse?ds=${id}&nd=com&nfp=with`],
  ['n-zeile-position', `#/synopse?ds=${id}&r=${row}`],
  ['n-zeile-wirkung', `#/synopse?ds=${id}&r=${row}`, (p) => p.locator('#ndt-impact').click()],
  ['n-zeile-delegationen', `#/synopse?ds=${id}&r=${row}`, (p) => p.locator('#ndt-deleg').click()],
  ['n-import', `#/import?ds=${id}`],
  ['n-position', `#/position?ds=${id}`],
  ['n-bilanz', `#/position?ds=${id}&nkt=bilanz`],
  ['n-delegationen', `#/delegationen?ds=${id}`],
  ['n-sitzung', `#/delegationen?ds=${id}&nkt=meetings&po=m1`],
  ['n-konsultation', `#/konsultation?ds=${id}&nk=${k}`],
  ['n-konsultation-entscheide', `#/konsultation?ds=${id}&nk=${k}&nkt=agg`],
  ['n-ausgabe', `#/ausgabe?ds=${id}`],
  ['n-wirkung', `#/wirkung?ds=${id}`],
  ['n-anleitung', `#/n-anleitung?ds=${id}`],
  ['n-dialog-runde', `#/konsultation?ds=${id}`, (p) => p.locator('#cons-new').click()],
  ['n-dialog-beispiel', '#/dossiers', (p) => p.locator('#btn-demo').click()],
  ['n-dossiers-beispiel', '#/dossiers'],
];

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const report = [];
for (const ui of UIS) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('sgkn.by', 'NB'); } catch { /* */ } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) errs.push('request: ' + r.url()); });
  const go = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(120); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); };
  const withUi = (h) => `${h}${h.includes('?') ? '&' : '?'}ui=${ui}`;
  await page.goto('file://' + FILE + '#/uebersicht?ui=' + ui);
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready, null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  const shot = async (w, name, h, act) => {
    if (ONLY && !ONLY.some((o) => name.includes(o))) return;
    await page.setViewportSize({ width: w, height: 900 });
    await page.keyboard.press('Escape').catch(() => {});
    await go(withUi(h));
    await page.evaluate(() => document.querySelectorAll('.reader, .view, .panel-body, #syn-scroll').forEach((e) => { e.scrollTop = 0; }));
    if (act) { try { await act(page); } catch (e) { report.push(`${w} ${ui} ${name}: Aktion fehlgeschlagen ${e.message.split('\n')[0]}`); } }
    await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(SHOTS, `${PREFIX}-${w}-${ui}-${name}.png`), fullPage: FULL });
    if (AXE) {
      const r = await page.evaluate(async ([src, rules]) => {
        if (!window.axe) { const sc = document.createElement('script'); sc.textContent = src; document.head.appendChild(sc); }
        const res = await window.axe.run(document, rules ? { resultTypes: ['violations'], runOnly: { type: 'rule', values: rules } } : { resultTypes: ['violations'], rules: { region: { enabled: false } } });
        return res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => ({ t: n.target.join(' '), s: (n.failureSummary || '').split('\n').slice(1, 2).join(' ').slice(0, 160) })) }));
      }, [axeSrc, AXE_RULES]);
      for (const v of r) for (const n of v.nodes) { const k = `${v.id} | ${n.t}`; (axeAll[k] = axeAll[k] || { v, n, views: [] }).views.push(`${w}-${ui}-${name}`); }
    }
    if (CHECK) {
      const hs = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 ? `Seite scrollt horizontal (${document.documentElement.scrollWidth} > ${innerWidth})` : '');
      if (hs) report.push(`${w} ${ui} ${name}: ${hs}`);
      // je Bereich höchstens eine sichtbare Primärschaltfläche
      const prim = await page.evaluate(() => {
        const areas = new Map();
        for (const b of document.querySelectorAll('.btn-primary')) {
          const r = b.getBoundingClientRect();
          if (!r.width || getComputedStyle(b).visibility === 'hidden') continue;
          const a = b.closest('[role="dialog"], .modal, form, .npanel, .panel, .side-card, .drawer, .nprint-bar, .view-tools, .reader-tools, .unit-bar, .syn-tools, section, main, aside') || document.body;
          areas.set(a, [...(areas.get(a) || []), b.textContent.trim().slice(0, 24)]);
        }
        return [...areas.entries()].filter(([, l]) => l.length > 1).map(([a, l]) => `${a.className || a.tagName}: ${l.join(' / ')}`);
      });
      for (const i of prim) report.push(`${w} ${ui} ${name}: mehrere Primärschaltflächen in ${i}`);
      // Schaltflächen bleiben 32 oder 40 px hoch (kein mehrzeiliger Text); Bereiche ausser Tabellenrahmen scrollen nicht horizontal
      const small = await page.evaluate(() => {
        const out = [];
        for (const b of document.querySelectorAll('.btn, .btn-icon, .workbar-tab')) {
          const r = b.getBoundingClientRect();
          if (!r.width || b.closest('.menu-pop, .card-host')) continue;
          // mehrzeiliger Text: Textknoten auf mehr als einer Zeile
          const tops = new Set();
          const tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
          for (let n = tw.nextNode(); n; n = tw.nextNode()) { if (!n.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); for (const x of rg.getClientRects()) if (x.width > 1) tops.add(Math.round(x.top / 4)); }
          if (tops.size > 1 || r.height > (b.closest('.modal > .panel-foot') ? 65 : 49)) out.push(`Schaltfläche ${Math.round(r.height)} px hoch, mehrzeilig: ${b.textContent.trim().slice(0, 30)}`);
          if (r.right > innerWidth + 0.5 && !b.closest('.tbl-scroll, .syn-table, .stagebar, .cmp, .tl-scroll, .mx-wrap, .workbar-tabs')) out.push(`Schaltfläche ragt hinaus: ${b.textContent.trim().slice(0, 30)}`);
        }
        for (const v of document.querySelectorAll('.view, main, .reader, .wide')) {
          if (v.scrollWidth > v.clientWidth + 1 && getComputedStyle(v).overflowX !== 'hidden' && !v.matches('.syn-main')) out.push(`Bereich scrollt horizontal: ${v.className || v.tagName} (${v.scrollWidth} > ${v.clientWidth})`);
        }
        return out;
      });
      for (const i of small) report.push(`${w} ${ui} ${name}: ${i}`);
      if (w >= 1024) {
        for (const i of await page.evaluate(layoutCheck)) report.push(`${w} ${ui} ${name}: ${i}`);
        for (const i of await page.evaluate(buttonCheck)) report.push(`${w} ${ui} ${name}: Schaltfläche ${i}`);
      }
    }
  };
  for (const w of WIDTHS) for (const [n, h, a] of RA) await shot(w, n, h, a);
  // Verhandlung: leer, dann Beispiel-Dossier laden
  for (const w of WIDTHS) await shot(w, 'n-dossiers-leer', '#/dossiers');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.keyboard.press('Escape');
  await go(withUi('#/dossiers'));
  await page.locator('#btn-demo').click();
  await page.locator('#demo-load-demo').click();
  await page.waitForSelector('.syn-row:not(.syn-headrow)');
  await page.waitForSelector('.toast', { state: 'detached', timeout: 10000 }).catch(() => {});
  const d = await page.evaluate(() => window.__sgk.neg.dossier());
  const ctxIds = { id: d.id, row: Object.keys(d.positions)[0], k: (d.consultations[0] || {}).id };
  for (const w of WIDTHS) for (const [n, h, a] of NEG(ctxIds.id, ctxIds.row, ctxIds.k)) await shot(w, n, h, a);
  // Zusammenführen mit Konflikten (Dateien aus test/app/out/neg3, von neg3.spec.mjs erzeugt)
  if (existsSync(join(MERGE, 'datei-a.json'))) {
    await go(withUi('#/dossiers'));
    await page.setInputFiles('#neg-project-file', join(MERGE, 'datei-a.json'));
    await page.waitForURL(/#\/synopse\?.*ds=/);
    await page.waitForSelector('.toast', { state: 'detached', timeout: 10000 }).catch(() => {});
    const a = await page.evaluate(() => window.__sgk.neg.dossier());
    for (const w of WIDTHS) {
      await shot(w, 'n-zusammenfuehren', `#/zusammenfuehren?ds=${a.id}`, async (p) => {
        if (!(await p.locator('.nmc').count())) { await p.setInputFiles('#merge-theirs', join(MERGE, 'datei-b.json')); await p.setInputFiles('#merge-base', join(MERGE, 'stamm.json')); }
        await p.waitForSelector('.nmc', { timeout: 10000 }); await p.locator('.nmc').first().evaluate((e) => e.scrollIntoView({ block: 'start' }));
      });
      await shot(w, 'n-delegationen-matrix', `#/delegationen?ds=${a.id}`, (p) => p.locator('#mx-table').first().scrollIntoViewIfNeeded());
      await shot(w, 'n-sitzung-nachbereiten', `#/delegationen?ds=${a.id}&nkt=meetings&po=m1~post`);
      await shot(w, 'n-dialog-kuerzel', `#/synopse?ds=${a.id}`, (p) => p.locator('#by-badge').click());
    }
  }
  if (errs.length) report.push(`${ui}: Konsole/Netz: ${[...new Set(errs)].slice(0, 10).join(' | ')}`);
  await ctx.close();
}
await browser.close();
if (AXE) {
  const ks = Object.keys(axeAll);
  console.log(`axe-core: ${ks.length} Befunde (Regel | Element), über ${new Set(Object.values(axeAll).flatMap((x) => x.views)).size} Ansichten`);
  for (const k of ks) console.log(`${axeAll[k].v.impact} ${k} :: ${axeAll[k].n.s} [${axeAll[k].views.length}x, z. B. ${axeAll[k].views[0]}]`);
}
console.log(report.length ? report.join('\n') : 'keine Befunde');
