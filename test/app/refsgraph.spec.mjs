// UI-Tests Verweisnetz (Grafik in der Chronologie-Schublade und vergrösserte Ansicht als Dialog).
import { test, expect } from '@playwright/test';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const APP = 'file://' + join(ROOT, 'dist/sgk-navigator.html');
const AXE = readFileSync(join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

async function open(page, hash) {
  const log = { errors: [], requests: [] };
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push(m.text()); });
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  page.on('request', (r) => { const u = r.url(); if (!/^(file|data|blob):/.test(u)) log.requests.push(u); });
  await page.goto(APP + hash);
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready, null, { timeout: 30000 });
  return log;
}
const hashOf = (page) => page.evaluate(() => location.hash);
const hashParam = (page, k) => new URLSearchParams(new URL(page.url()).hash.split('?')[1] || '').get(k);
const missingKeys = (page) => page.evaluate(() => (document.body.innerText.match(/⟦[^⟧]+⟧/g) || []));
const panelSeg = (page, label) => page.locator('aside.panel .panel-tools .seg button', { hasText: label });
const refsSeg = (page, label) => page.locator('.refs-tools .seg button', { hasText: label });
const node = (page, label, scope = 'aside.panel') => page.locator(`${scope} .rg-node[aria-label^="${label}"]`).first();

test('Netz in der Schublade: Schalter, Knoten, Tooltip, Navigation, Liste bleibt Standard', async ({ page }) => {
  const log = await open(page, '#/lesen?u=art_8&k=p3.a&l=de');
  const panel = page.locator('aside.panel');
  await expect(panel).toBeVisible();
  // Standard wie bisher: Chronologie oben, Verweise als Liste darunter
  await expect(panel.locator('ol.chron')).toBeVisible();
  await expect(refsSeg(page, 'Liste')).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.locator('.refs-panel .ref-list').first()).toBeVisible();
  await expect(panel.locator('svg.rg')).toHaveCount(0);
  // Segment «Verweise»: nur der Verweis-Bereich
  await expect(panelSeg(page, 'Änderungen')).toHaveAttribute('aria-pressed', 'true');
  await panelSeg(page, 'Verweise').click();
  await expect(panelSeg(page, 'Verweise')).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.locator('ol.chron')).toHaveCount(0);
  await expect(panel.locator('.refs-panel')).toBeVisible();
  // Netz
  await refsSeg(page, 'Netz').click();
  const svg = panel.locator('svg.rg');
  await expect(svg).toBeVisible();
  await expect(svg).toHaveAttribute('role', 'group');
  await expect(svg).toHaveAttribute('aria-label', /Verweisnetz Art\. 8 Abs\. 3 Bst\. a SGK/);
  await expect(panel.locator('.rg-counters')).toContainText('5 Einheiten · 13 Fundstellen');
  await expect(panel.locator('.rg-counters')).toContainText('3 Ziele · 6 Fundstellen');
  // Umfang ganzer Artikel
  await refsSeg(page, 'ganzer Artikel').click();
  await expect(panel.locator('.rg-counters')).toContainText('16 Einheiten · 64 Fundstellen');
  await expect(panel.locator('.rg-counters')).toContainText('22 Ziele · 41 Fundstellen');
  expect(await panel.locator('.rg-node').count()).toBeGreaterThan(15);
  await expect(node(page, 'Art. 23 EES-VO')).toBeVisible();
  // SVG passt in die Schublade
  const fits = await page.evaluate(() => { const s = document.querySelector('aside.panel svg.rg').getBoundingClientRect(); const b = document.querySelector('aside.panel .panel-body').getBoundingClientRect(); return s.left >= b.left - 1 && s.right <= b.right + 1; });
  expect(fits).toBe(true);
  // Tooltip bei Fokus
  const n8b = node(page, 'Art. 8b SGK');
  await n8b.focus();
  const tip = panel.locator('.rg-tip[role="tooltip"]');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('Art. 8b → Art. 8');
  await expect(tip).toContainText('17 Fundstellen');
  await expect(tip.locator('mark').first()).toBeVisible();
  await expect(n8b).toHaveAttribute('aria-describedby', /rg-tip/);
  await expect(panel.locator('.rg-edge.is-hot')).toHaveCount(1);
  // Fremdakt öffnet EUR-Lex in neuem Tab
  const ext = panel.locator('.rg-node[href*="eur-lex"]').first();
  await expect(ext).toHaveAttribute('target', '_blank');
  await expect(ext).toHaveAttribute('href', /CELEX:3/);
  // Klick auf Knoten Art. 8b navigiert zu Art. 8b
  await n8b.click();
  await expect(page).toHaveURL(/u=art_8b(&|$)/);
  await expect(page.locator('.unit-meta')).toContainText('Art. 8b SGK');
  expect(await missingKeys(page)).toEqual([]);
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
});

test('Vergrössern: Dialog über der Seite, Hash unverändert, Esc schliesst nur den Dialog, Fokus zurück, axe', async ({ page }) => {
  const log = await open(page, '#/lesen?u=art_8&k=p3.a&l=de');
  await refsSeg(page, 'Netz').click();
  const h0 = await hashOf(page);
  await page.locator('#rg-expand').click();
  const dlg = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(dlg).toBeVisible();
  await expect(dlg).toHaveAttribute('aria-labelledby', 'rgdlg-h');
  await expect(page.locator('#rgdlg-h')).toHaveText('Verweisnetz · Art. 8 Abs. 3 Bst. a SGK');
  expect(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]'))).toBe(true);
  expect(await hashOf(page)).toBe(h0);
  // Seite dahinter scrollt nicht
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('hidden');
  // Umfang im Dialog, volles Netz ohne Zusammenfassung
  await dlg.locator('.seg button', { hasText: 'ganzer Artikel' }).click();
  await expect(dlg.locator('.rg-counters')).toContainText('16 Einheiten · 64 Fundstellen');
  await expect(dlg.locator('.rg-node.is-more')).toHaveCount(0);
  expect(await dlg.locator('.rg-node').count()).toBe(16 + 22);
  await expect(dlg.locator('.rg-node[href*="eur-lex"]').first()).toHaveAttribute('target', '_blank');
  await expect(dlg.locator('.rg-node[aria-label*="fehlt im Datensatz"]')).toHaveCount(1);
  // Fokusfalle: Tab bleibt im Dialog, auch über die SVG-Knoten
  for (let i = 0; i < 45; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]'))).toBe(true);
  }
  // axe-Prüfung des Dialogs
  const violations = await page.evaluate(async (src) => {
    if (!window.axe) { const sc = document.createElement('script'); sc.textContent = src; document.head.appendChild(sc); }
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))); // Farbübergänge abwarten
    const r = await window.axe.run(document.querySelector('[role="dialog"]'), { resultTypes: ['violations'], rules: { region: { enabled: false } } });
    return r.violations.map((v) => v.id + ': ' + v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', '));
  }, AXE);
  expect(violations).toEqual([]);
  // Esc schliesst nur den Dialog; die Schublade bleibt, Fokus auf «Vergrössern»
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(page.locator('aside.panel')).toBeVisible();
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('rg-expand');
  expect(await hashOf(page)).toBe(h0);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe('hidden');
  // Schliessen-Schaltfläche
  await page.locator('#rg-expand').click();
  await page.locator('[role="dialog"] button[aria-label="Verweisnetz schliessen"]').click();
  await expect(dlg).toHaveCount(0);
  expect(await hashOf(page)).toBe(h0);
  // Klick auf einen Knoten im Dialog: Dialog schliesst, dann Navigation
  await page.locator('#rg-expand').click();
  await node(page, 'Art. 8d SGK', '[role="dialog"]').click();
  await expect(dlg).toHaveCount(0);
  await expect(page).toHaveURL(/u=art_8d(&|$)/);
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
});

test('Breite 1100 px: Schublade fixiert über dem Text, Netz passt, Dialog fast vollflächig', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 850 });
  const log = await open(page, '#/lesen?u=art_8&k=*&l=de');
  const panel = page.locator('aside.panel');
  expect(await panel.evaluate((e) => getComputedStyle(e).position)).toBe('fixed');
  // Einheitenebene: «Chronologie | Verweise»
  await expect(panelSeg(page, 'Chronologie')).toHaveAttribute('aria-pressed', 'true');
  await panelSeg(page, 'Verweise').click();
  await expect(panel.locator('ol.chron')).toHaveCount(0);
  await refsSeg(page, 'Netz').click();
  await expect(panel.locator('svg.rg')).toBeVisible();
  // Einheit: kein Umfangsschalter
  await expect(page.locator('.refs-tools .seg')).toHaveCount(1);
  const r = await page.evaluate(() => { const s = document.querySelector('aside.panel svg.rg').getBoundingClientRect(); const b = document.querySelector('aside.panel .panel-body').getBoundingClientRect(); return { s: s.right, b: b.right, sw: document.documentElement.scrollWidth, w: innerWidth }; });
  expect(r.s).toBeLessThanOrEqual(r.b + 1);
  expect(r.sw).toBeLessThanOrEqual(r.w + 1);
  // «n weitere» öffnet den Dialog
  await page.locator('aside.panel .rg-node.is-more').first().click();
  const dlg = page.locator('[role="dialog"]');
  await expect(dlg).toBeVisible();
  const box = await dlg.boundingBox();
  expect(box.width).toBeGreaterThan(1100 - 60);
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(panel).toBeVisible();
  expect(log.errors).toEqual([]);
});

test('Andere Werke und FR: EES-VO Art. 23 mit Verweisen aus dem SGK, Oberfläche FR', async ({ page }) => {
  const log = await open(page, '#/lesen?w=ees&u=art_23&k=*&l=de');
  await panelSeg(page, 'Verweise').click();
  await refsSeg(page, 'Netz').click();
  const panel = page.locator('aside.panel');
  await expect(node(page, 'Art. 8 SGK')).toBeVisible();
  await node(page, 'Art. 8 SGK').click();
  await expect(page).toHaveURL(/u=art_8/);
  expect(hashParam(page, 'w')).toBe(null); // SGK ist das Standardwerk
  await expect(page.locator('.workbar-tab[data-work="sgk"]')).toHaveAttribute('aria-selected', 'true');
  for (const w of ['etias', 'vis', 'iop']) {
    await page.evaluate((h) => { location.hash = h; }, `#/lesen?w=${w}&u=art_5&k=*&l=de`);
    await page.waitForTimeout(300);
    if (!(await panel.count())) continue;
    if (await panelSeg(page, 'Verweise').count()) await panelSeg(page, 'Verweise').click();
    await expect(panel.locator('svg.rg, .refs-panel p.muted').first()).toBeVisible();
  }
  await page.evaluate(() => { location.hash = '#/lesen?u=art_8&k=p3.a&l=fr&ui=fr'; });
  await page.waitForTimeout(400);
  await expect(refsSeg(page, 'Réseau')).toHaveAttribute('aria-pressed', 'true'); // Einstellung gespeichert
  await expect(page.locator('#rg-expand')).toHaveText(/Agrandir/);
  await expect(page.locator('aside.panel .rg-counters')).toContainText('5 unités · 13 occurrences');
  expect(await missingKeys(page)).toEqual([]);
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
});
