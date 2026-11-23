// UI-Tests Verweisstruktur (Übersicht, Abschnitt nach dem Zeitstrahl): Platzhalter, Bögen, Auswahl, Tastatur, Tooltip, Leiste,
// Dialog Verweisnetz, Tabelle (gespeichert), PNG-Export, EES-VO, FR, schmales Fenster, axe.
import { test, expect } from '@playwright/test';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, statSync } from 'node:fs';

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
/** Abschnitt in den sichtbaren Bereich bringen und auf das Diagramm (oder die Tabelle) warten */
async function show(page) {
  await page.evaluate(() => document.querySelector('#rs-h').scrollIntoView({ block: 'start' }));
  await expect(page.locator('.rs-sec svg.rs-svg, .rs-sec .rs-tbl')).toBeVisible({ timeout: 20000 });
}
/** Index der Spalte einer Einheit (aria-label beginnt mit der Zitierung) */
const colIndex = (page, cite) => page.evaluate((c) => [...document.querySelectorAll('.rs-col')].findIndex((g) => { const s = g.getAttribute('aria-label').replace(/\s/g, ' '); return s.startsWith(c + ':') || s.startsWith(c + ' :'); }), cite);
/** Klick auf die Spalte im Bereich der Achsenbeschriftung (dort liegen keine Bögen) */
const clickCol = async (page, i) => {
  const yLab = await page.evaluate(() => { const g = document.querySelector('.rs-col .rs-col-hit'); const ax = document.querySelector('.rs-axis-l'); return Number(ax.getAttribute('y1')) - Number(g.getAttribute('y')) + 10; });
  await page.locator('#rs-u-' + i).click({ position: { x: 4, y: yLab } });
};
// Vor der Prüfung laufende CSS-Übergänge abwarten: Wird eine Schaltfläche gerade aktiv (z. B. «PNG» nach dem Neuberechnen
// des Modells), misst axe sonst die Kontraste mitten im Farbübergang.
const axeSection = (page) => page.evaluate(async (src) => {
  if (!window.axe) { const sc = document.createElement('script'); sc.textContent = src; document.head.appendChild(sc); }
  await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})));
  const r = await window.axe.run(document.querySelector('.rs-sec'), { resultTypes: ['violations'], rules: { region: { enabled: false } } });
  return r.violations.map((v) => v.id + ': ' + v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', '));
}, AXE);

test('SGK: Platzhalter ohne Layoutsprung, Bögen, Auswahl Art. 8, Leiste, Tooltip, Tastatur, Text lesen', async ({ page }) => {
  const log = await open(page, '#/uebersicht');
  const sec = page.locator('section.rs-sec');
  await expect(sec.locator('h2')).toHaveText('Verweisstruktur');
  // Reihenfolge: nach dem Zeitstrahl, vor der Abweichenden Anwendung und der Matrix
  expect(await page.evaluate(() => [...document.querySelectorAll('.ov-sec h2')].map((h) => h.id))).toEqual(['tl-h', 'rs-h', 'app-h', 'mx-h']);
  await expect(sec.locator('.rs-stand')).toContainText('Rechtstext DE');
  // Platzhalter (falls noch sichtbar): gleiche Höhe wie das Diagramm
  const ph = await page.evaluate(() => { const e = document.querySelector('.rs-ph'); return e ? e.getBoundingClientRect().height : null; });
  await show(page);
  await expect(sec.locator('.rs-ph')).toHaveCount(0);
  const h = await page.evaluate(() => document.querySelector('.rs-scroll').getBoundingClientRect().height);
  if (ph != null) expect(Math.abs(h - ph)).toBeLessThanOrEqual(3);
  // Achse: 70 Einheiten des SGK (ohne Erwägungsgründe), Gruppen Titel I bis IV und Anhänge
  await expect(sec.locator('.rs-col[role="option"]')).toHaveCount(70);
  await expect(sec.locator('.rs-band-t')).toHaveText(['Titel I', 'Titel II', 'Titel III', 'Titel IV', 'Anhänge']);
  await expect(sec.locator('.rs-lab-row')).toHaveCount(5);
  await expect(sec.locator('.rs-lab-row').first()).toContainText('EES-VO');
  await expect(sec.locator('.rs-hint')).toHaveText('Einheit wählen, um ihre Verweise hervorzuheben.');
  // Klick auf Art. 8: 4 ausgehende und 14 eingehende Bögen hervorgehoben
  const i8 = await colIndex(page, 'Art. 8');
  expect(i8).toBe(8);
  await clickCol(page, i8);
  await expect(page.locator('#rs-u-8')).toHaveAttribute('aria-selected', 'true');
  await expect(sec.locator('.rs-arcs .rs-arc.is-out')).toHaveCount(4);
  await expect(sec.locator('.rs-arcs .rs-arc.is-in')).toHaveCount(14);
  expect(await sec.locator('.rs-arcs .rs-arc.is-dim').count()).toBe(221 - 17);
  const bar = sec.locator('.rs-bar');
  await expect(bar).toContainText('Gewählt: Art. 8 Grenzübertrittskontrollen von Personen');
  await expect(bar).toContainText('16 Einheiten · 64 Fundstellen');
  await expect(bar).toContainText('22 Ziele · 41 Fundstellen');
  await expect(bar.locator('.rs-top li')).toHaveText(['Art. 8b → Art. 8 · 17 Fundstellen', 'Anhang VI → Art. 8 · 14 Fundstellen', 'Art. 8d → Art. 8 · 9 Fundstellen']);
  // Tooltip auf einer Zelle (EES-VO, Art. 8)
  const cell = sec.locator('.rs-row').first().locator('rect.rs-cell').nth(await page.evaluate(() => { const cs = [...document.querySelectorAll('.rs-row')][0].querySelectorAll('rect.rs-cell'); const x8 = Number(document.querySelector('#rs-u-8 .rs-col-hit').getAttribute('x')); return [...cs].findIndex((c) => Math.abs(Number(c.getAttribute('x')) - x8 - 1.5) < 0.01); }));
  await cell.hover();
  const tip = sec.locator('.rs-tip[role="tooltip"]');
  await expect(tip).toContainText('Art. 8 → EES-VO: 11 Fundstellen in Art. 23, 13, 27');
  await expect(tip).toContainText('Deckkraftstufe 4 von 4');
  // Tooltip auf einem Bogen (stärkster eingehender: Art. 8b)
  const pt = await page.evaluate(() => { const el = [...document.querySelectorAll('.rs-arc.is-in')].sort((a, b) => parseFloat(b.style.strokeWidth) - parseFloat(a.style.strokeWidth))[0]; const q = el.getPointAtLength(el.getTotalLength() / 2); const m = el.getScreenCTM(); return [q.x * m.a + m.e, q.y * m.d + m.f]; });
  await page.mouse.move(pt[0], pt[1]);
  await expect(tip).toHaveText('Art. 8b → Art. 8 · 17 Fundstellen');
  await expect(sec.locator('.rs-arcs .rs-arc.is-hot')).toHaveCount(1);
  await page.mouse.move(5, 5);
  // erneuter Klick hebt die Auswahl auf
  await clickCol(page, i8);
  await expect(page.locator('#rs-u-8')).toHaveAttribute('aria-selected', 'false');
  await expect(sec.locator('.rs-bar')).toHaveCount(0);
  await expect(sec.locator('.rs-arcs .rs-arc.is-out, .rs-arcs .rs-arc.is-in, .rs-arcs .rs-arc.is-dim')).toHaveCount(0);
  // Tastatur: Roving-Tabindex, Pfeiltasten, Pos1/Ende, Enter wählt, Pfeil runter zeigt eine Verbindung
  await page.locator('#rs-u-8').focus();
  await page.keyboard.press('Home');
  await expect(page.locator('#rs-u-0')).toBeFocused();
  expect(await sec.locator('.rs-col[tabindex="0"]').count()).toBe(1);
  await page.keyboard.press('End');
  await expect(page.locator('#rs-u-69')).toBeFocused();
  await page.keyboard.press('Home');
  for (let k = 0; k < 8; k++) await page.keyboard.press('ArrowRight');
  await expect(page.locator('#rs-u-8')).toBeFocused();
  await expect(page.locator('#rs-u-8')).toHaveAttribute('tabindex', '0');
  await expect(tip).toContainText('Art. 8');
  await expect(tip).toContainText('Eingehend: 16 Einheiten · 64 Fundstellen');
  await expect(page.locator('#rs-u-8')).toHaveAttribute('aria-describedby', 'rs-tip');
  await page.keyboard.press('Enter');
  await expect(page.locator('#rs-u-8')).toHaveAttribute('aria-selected', 'true');
  await expect(sec.locator('.rs-arcs .rs-arc.is-out')).toHaveCount(4);
  await page.keyboard.press('ArrowDown');
  await expect(tip).toHaveText('Art. 8b → Art. 8 · 17 Fundstellen');
  await page.keyboard.press('ArrowDown');
  await expect(tip).toHaveText('Anhang VI → Art. 8 · 14 Fundstellen');
  await page.keyboard.press('Escape');
  await expect(tip).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#rs-u-8')).toHaveAttribute('aria-selected', 'false');
  await page.keyboard.press(' ');
  await expect(page.locator('#rs-u-8')).toHaveAttribute('aria-selected', 'true');
  // Sichtbarer Fokus (Carbon: 2 px focus)
  expect(await page.locator('#rs-u-8 .rs-focus').evaluate((e) => getComputedStyle(e).stroke)).not.toBe('none');
  // axe ohne Befund (mit Auswahl und Leiste)
  expect(await axeSection(page)).toEqual([]);
  // Text lesen
  await sec.locator('#rs-read').click();
  await expect(page).toHaveURL(/#\/lesen\?.*u=art_8(&|$)/);
  await expect(page.locator('.unit-meta')).toContainText('Art. 8 SGK');
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
});

test('Verweisnetz zeigen öffnet den Dialog, Escape schliesst ihn; Chronologie öffnen', async ({ page }) => {
  const log = await open(page, '#/uebersicht');
  await show(page);
  await clickCol(page, 8);
  const h0 = await page.evaluate(() => location.hash);
  await page.locator('#rs-net').click();
  const dlg = page.locator('[role="dialog"][aria-modal="true"]');
  await expect(dlg).toBeVisible();
  await expect(page.locator('#rgdlg-h')).toHaveText('Verweisnetz · Art. 8 SGK');
  await expect(dlg.locator('.rg-counters')).toContainText('16 Einheiten · 64 Fundstellen');
  await expect(dlg.locator('.rg-counters')).toContainText('22 Ziele · 41 Fundstellen');
  expect(await page.evaluate(() => location.hash)).toBe(h0);
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(page.locator('#rs-net')).toBeFocused();
  await expect(page.locator('#rs-u-8')).toHaveAttribute('aria-selected', 'true');
  await page.locator('#rs-chron').click();
  await expect(page).toHaveURL(/#\/chronik\?.*u=art_8(&|$)/);
  expect(log.errors).toEqual([]);
});

test('Tabelle: Art. 8 mit richtigen Zahlen, «alle Einheiten zeigen», Wahl bleibt nach Reload gespeichert; PNG-Export', async ({ page }) => {
  const log = await open(page, '#/uebersicht');
  await show(page);
  const sec = page.locator('section.rs-sec');
  await expect(sec.locator('.seg button', { hasText: 'Diagramm' })).toHaveAttribute('aria-pressed', 'true');
  await sec.locator('.seg button', { hasText: 'Tabelle' }).click();
  const tbl = sec.locator('table#tbl-refs-structure');
  await expect(tbl).toBeVisible();
  await expect(tbl.locator('thead th')).toHaveText(['Einheit', 'verweist auf (Einheiten im Rechtsakt)', 'Verweise hierauf', 'EES-VO', 'ETIAS-VO', 'VIS-VO', 'IO-VO', 'Fremdakte']);
  const row8 = tbl.locator('tbody tr').filter({ has: page.locator('th button', { hasText: /^Art\. 8$/ }) });
  await expect(row8).toHaveCount(1);
  expect(await row8.locator('td').allInnerTexts()).toEqual(['11', '64', '11', '4', '4', '5', '6']);
  const n0 = await tbl.locator('tbody tr').count();
  await sec.locator('label.rs-all input').check();
  expect(await tbl.locator('tbody tr').count()).toBe(70);
  expect(n0).toBeLessThanOrEqual(70);
  expect(await axeSection(page)).toEqual([]);
  // gespeichert (settingsStore)
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
  await show(page);
  await expect(sec.locator('.seg button', { hasText: 'Tabelle' })).toHaveAttribute('aria-pressed', 'true');
  await expect(sec.locator('table#tbl-refs-structure')).toBeVisible();
  // Einheit als Link zur Chronologie
  await sec.locator('table#tbl-refs-structure tbody th button', { hasText: /^Art\. 8a$/ }).click();
  await expect(page).toHaveURL(/#\/chronik\?.*u=art_8a(&|$)/);
  // zurück, Diagramm, PNG-Export mit Auswahl
  await page.evaluate(() => { location.hash = '#/uebersicht'; });
  await show(page);
  await sec.locator('.seg button', { hasText: 'Diagramm' }).click();
  await expect(sec.locator('svg.rs-svg')).toBeVisible();
  await clickCol(page, 8);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.locator('#rs-png').click()]);
  expect(dl.suggestedFilename()).toBe('Verweisstruktur_SGK_Art-8_s08_DE.png');
  const f = join(ROOT, 'test/app/out', dl.suggestedFilename());
  await dl.saveAs(f);
  expect(statSync(f).size).toBeGreaterThan(50000);
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
});

test('EES-VO und FR-Oberfläche', async ({ page }) => {
  const log = await open(page, '#/uebersicht?w=ees');
  await show(page);
  const sec = page.locator('section.rs-sec');
  await expect(sec.locator('.rs-col[role="option"]')).toHaveCount(82);
  await expect(sec.locator('.rs-band-t').first()).toHaveText('Kapitel I');
  await expect(sec.locator('.rs-lab-row').first()).toContainText('SGK');
  const i = await colIndex(page, 'Art. 23');
  await clickCol(page, i);
  await expect(sec.locator('.rs-bar')).toContainText('15 Einheiten · 46 Fundstellen');
  await expect(sec.locator('.rs-bar')).toContainText('7 Ziele · 19 Fundstellen');
  await expect(sec.locator('.rs-bar .rs-top')).toContainText('Art. 8 SGK → Art. 23 · 8 Fundstellen');
  expect(await axeSection(page)).toEqual([]);
  // FR
  await page.evaluate(() => { location.hash = '#/uebersicht?ui=fr'; });
  await show(page);
  await expect(sec.locator('h2')).toHaveText('Structure des renvois');
  await expect(sec.locator('.rs-band-t')).toHaveText(['Titre I', 'Titre II', 'Titre III', 'Titre IV', 'Annexes']);
  await expect(sec.locator('.rs-lab-row').last()).toContainText('Actes externes');
  const j = await colIndex(page, 'art. 8 bis');
  expect(j).toBe(9);
  await clickCol(page, 8);
  await expect(sec.locator('.rs-bar')).toContainText('16 unités · 64 occurrences');
  await expect(sec.locator('.rs-bar .rs-bar-title')).toHaveAttribute('lang', 'de');
  expect(await page.evaluate(() => (document.body.innerText.match(/⟦[^⟧]+⟧/g) || []))).toEqual([]);
  expect(await axeSection(page)).toEqual([]);
  expect(log.errors).toEqual([]);
});

test('Breite 1100 px: horizontaler Scroll im Diagrammbereich statt Überlappung, Beschriftungsspalte bleibt stehen', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 850 });
  const log = await open(page, '#/uebersicht');
  await show(page);
  const r = await page.evaluate(() => {
    const sc = document.querySelector('.rs-scroll');
    const out = { pageOverflow: document.documentElement.scrollWidth > innerWidth + 1, scroll: sc.scrollWidth > sc.clientWidth + 1, role: sc.getAttribute('role'), tab: sc.getAttribute('tabindex'), label: sc.getAttribute('aria-label') };
    // Spaltenbeschriftungen überlappen nicht (gedreht: Abstand der Grundlinien mindestens Schriftgrösse 12 px)
    const nums = [...document.querySelectorAll('.rs-num')].map((e) => e.getBoundingClientRect());
    const rot = !!document.querySelector('.rs-num[transform]');
    out.numOverlap = nums.some((a, i) => i && (rot ? a.left - nums[i - 1].left < 12 : a.left < nums[i - 1].right - 0.5));
    // Gruppenbeschriftungen passen in ihre Bänder
    out.bandOverflow = [...document.querySelectorAll('.rs-band')].some((g) => { const t = g.querySelector('text'); if (!t) return false; const tr = t.getBoundingClientRect(), br = g.querySelector('rect').getBoundingClientRect(); return tr.right > br.right + 0.5; });
    sc.scrollLeft = 300;
    return out;
  });
  expect(r).toEqual({ pageOverflow: false, scroll: true, role: 'region', tab: '0', label: 'Diagramm Verweisstruktur SGK', numOverlap: false, bandOverflow: false });
  await page.waitForTimeout(100);
  const sticky = await page.evaluate(() => { const sc = document.querySelector('.rs-scroll').getBoundingClientRect(); const l = document.querySelector('.rs-labels').getBoundingClientRect(); return Math.abs(l.left - sc.left) < 1.5; });
  expect(sticky).toBe(true);
  // Fokus auf eine Spalte rechts ausserhalb scrollt sie in den sichtbaren Bereich (rechts der Beschriftungsspalte)
  await page.locator('#rs-u-0').focus();
  await page.keyboard.press('End');
  const vis = await page.evaluate(() => { const sc = document.querySelector('.rs-scroll').getBoundingClientRect(); const c = document.querySelector('#rs-u-69 .rs-col-hit').getBoundingClientRect(); return c.left >= sc.left + 224 - 1 && c.right <= sc.right + 1; });
  expect(vis).toBe(true);
  expect(log.errors).toEqual([]);
});
