// UI-Tests Etappe 1b: Oberflächensprache, rohes Markup, Überlauf und Überlappung, Anleitung, Export FR, Screenshots.
// Aufruf: npx playwright test -c test/app/playwright.config.mjs test/app/ui.spec.mjs
import { test, expect } from '@playwright/test';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { layoutCheck } from './helpers.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const APP = 'file://' + join(ROOT, 'dist/sgk-navigator.html');
const SHOTS = join(ROOT, 'test/app/screenshots');
mkdirSync(SHOTS, { recursive: true });

async function open(page, hash = '') {
  const log = { errors: [], requests: [] };
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push(m.text()); });
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  page.on('request', (r) => { const u = r.url(); if (!/^(file|data|blob):/.test(u)) log.requests.push(u); });
  await page.goto(APP + hash);
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready, null, { timeout: 30000 });
  return log;
}
/** Navigation ohne Neuladen (schnell): Hash setzen und auf Darstellung warten. */
async function nav(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForTimeout(60);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const VIEWS = (u = 'art_8', k = 'p3.a.i') => [
  ['uebersicht', '#/uebersicht'],
  ['lesen', `#/lesen?u=${u}`],
  ['lesen-chronologie', `#/lesen?u=${u}&k=${k}`],
  ['lesen-anhang', '#/lesen?u=anx_VII'],
  ['lesen-anhang-ohne-titel', '#/lesen?u=anx_V'],
  ['lesen-datum', `#/lesen?u=${u}&m=datum&d=2020-01-01`],
  ['lesen-alle', `#/lesen?u=${u}&m=alle`],
  ['lesen-redline', `#/lesen?u=${u}&red=1`],
  ['suche', `#/lesen?u=${u}&q=Sonderbestimmungen`],
  ['chronik', `#/chronik?u=${u}&k=${k}`],
  ['chronik-einheit', `#/chronik?u=${u}&k=*`],
  ['vergleich', `#/vergleich?u=${u}&a=s00&b=s08`],
  ['vergleich-redline', `#/vergleich?u=${u}&a=s00&b=s08&lay=redline`],
  ['sprachvergleich', `#/vergleich?u=${u}&cm=sprache`],
  ['aktualisieren', '#/aktualisieren'],
  ['anleitung', '#/anleitung'],
  ['info', '#/info'],
];
const withUi = (h, ui, l) => `${h}${h.includes('?') ? '&' : '?'}ui=${ui}${l ? '&l=' + l : ''}`;

// ------------------------------------------------------------------ Sprache der Oberfläche
// Deutsche Wörter, die in der FR-Oberfläche nicht vorkommen dürfen (ausserhalb von Rechtstext mit lang="de").
const DE_WORDS = ['Stand', 'Stände', 'Einheit', 'Einheiten', 'Bestimmung', 'Änderung', 'Änderungen', 'anwendbar', 'beschlossen', 'Vergleich',
  'Sammelkorb', 'Übersicht', 'Anleitung', 'geändert', 'eingefügt', 'gestrichen', 'nicht', 'und', 'oder', 'mit', 'der', 'die', 'das', 'Akt', 'Akte',
  'Fassung', 'Fassungen', 'Datei', 'hochladen', 'Rechtstext', 'Oberfläche', 'Wortlaut', 'VO', 'Berichtigung', 'Basistext', 'aufgehoben', 'seit', 'nach', 'Anhang', 'Abs.', 'Bst.'];

/** Sichtbarer Text, dessen nächstes lang-Attribut die Oberflächensprache trägt (Rechtstext ausgenommen). */
const uiText = (page) => page.evaluate(() => {
  const ui = document.documentElement.lang.slice(0, 2);
  const out = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walk.nextNode())) {
    const el = n.parentElement;
    if (!el || !el.offsetParent && el.tagName !== 'BODY') continue;
    if (el.closest('script, style, [aria-hidden="true"], .card-host')) continue;
    const l = (el.closest('[lang]') || document.documentElement).getAttribute('lang').slice(0, 2);
    if (l === ui) out.push(n.nodeValue);
  }
  for (const a of document.querySelectorAll('[title], [aria-label], [placeholder]')) {
    const l = (a.closest('[lang]') || document.documentElement).getAttribute('lang').slice(0, 2);
    if (l !== ui) continue;
    for (const k of ['title', 'aria-label', 'placeholder']) if (a.getAttribute(k)) out.push(a.getAttribute(k));
  }
  return out.join('\n');
});

test('Oberflächensprache DE/FR unabhängig vom Rechtstext DE/FR/EN, ohne fehlende Schlüssel und ohne deutsche Reste in FR', async ({ page }) => {
  test.setTimeout(240000);
  const log = await open(page, '#/uebersicht?ui=de');
  const found = [];
  for (const ui of ['de', 'fr']) {
    for (const l of ['de', 'fr', 'en']) {
      await nav(page, withUi(`#/lesen?u=art_8&k=p3.a.i`, ui, l));
      await expect(page.locator('html')).toHaveAttribute('lang', ui === 'fr' ? 'fr-CH' : 'de-CH');
      await expect(page.locator('.legal-read')).toHaveAttribute('lang', l);
      await expect(page.locator('.panel-title')).toHaveText(ui === 'fr' ? 'art. 8, par. 3, point a) i), CFS' : 'Art. 8 Abs. 3 Bst. a Ziff. i SGK');
      await expect(page.locator('.views a[aria-current="page"]')).toHaveText(ui === 'fr' ? 'Lecture' : 'Lesen');
      expect(new URL(page.url()).hash).toContain('ui=' + ui);
      for (const [name, h] of VIEWS()) {
        await nav(page, withUi(h, ui, l));
        const txt = await uiText(page);
        const body = await page.evaluate(() => document.body.innerText);
        expect(body, `${ui}/${l} ${name}: fehlender Schlüssel`).not.toContain('⟦');
        if (ui === 'fr') {
          for (const w of DE_WORDS) {
            const re = new RegExp(`(^|[^\\p{L}])${w.replace('.', '\\.')}(?=$|[^\\p{L}])`, 'u');
            const m = re.exec(txt);
            if (m) found.push(`${l} ${name}: «${w}» in «${txt.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\n/g, ' ')}»`);
          }
        }
      }
    }
  }
  expect(found, found.join('\n')).toEqual([]);
  // Umschalter in der Kopfzeile: Wahl bleibt erhalten (localStorage), Rechtstext unverändert
  await nav(page, '#/lesen?u=art_8&l=en&ui=de');
  await page.locator('.head-lang button', { hasText: 'FR' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr-CH');
  expect(new URL(page.url()).hash).toContain('ui=fr');
  expect(new URL(page.url()).hash).toContain('l=en');
  await page.goto(APP + '#/lesen?u=art_8');
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr-CH');
  await expect(page.locator('.views a[aria-current="page"]')).toHaveText('Lecture');
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
});

test('Startsprache: Browsersprache fr → FR, sonst DE', async ({ browser }) => {
  for (const [locale, want] of [['fr-CH', 'fr-CH'], ['de-CH', 'de-CH'], ['en-US', 'de-CH']]) {
    const ctx = await browser.newContext({ locale });
    const p = await ctx.newPage();
    await p.goto(APP);
    await p.waitForFunction(() => window.__sgk && window.__sgk.ready);
    await expect(p.locator('html')).toHaveAttribute('lang', want);
    await ctx.close();
  }
});

// ------------------------------------------------------------------ Rohes Markup
test('Kein rohes "<b>" oder "&amp;" in sichtbarem Text, Optionen, Titeln (alle Einheiten, DE und FR)', async ({ page }) => {
  test.setTimeout(240000);
  await open(page, '#/lesen?ui=de');
  const units = await page.evaluate(() => window.__sgk.data().unitOrder);
  const RAW = /<\/?(b|i|sup|sub|br|strong|em)\s*\/?>|&(amp|lt|gt|quot|nbsp|#\d+);/i;
  const scan = () => page.evaluate((src) => {
    const re = new RegExp(src, 'i');
    const bad = [];
    const txt = document.body.innerText;
    const m = re.exec(txt);
    if (m) bad.push('Text: ' + txt.slice(Math.max(0, m.index - 30), m.index + 40));
    for (const o of document.querySelectorAll('option')) if (re.test(o.textContent)) bad.push('Option: ' + o.textContent);
    for (const e of document.querySelectorAll('[title], [aria-label], img[alt]')) for (const k of ['title', 'aria-label', 'alt']) if (e.getAttribute(k) && re.test(e.getAttribute(k))) bad.push(`${k}: ${e.getAttribute(k).slice(0, 80)}`);
    if (re.test(document.title)) bad.push('document.title');
    return bad;
  }, RAW.source);
  const bad = [];
  for (const ui of ['de', 'fr']) {
    for (const l of ['de', 'fr']) {
      for (const u of units) {
        await nav(page, `#/lesen?u=${u}&l=${l}&ui=${ui}`);
        for (const b of await scan()) bad.push(`${ui}/${l} ${u}: ${b}`);
      }
      for (const h of ['#/uebersicht', '#/chronik?u=anx_VII&k=*', '#/vergleich?u=anx_VII&sc=full', '#/vergleich?u=anx_VII&cm=sprache', '#/lesen?q=Sonderbestimmungen', '#/lesen?q=Anhang%20VII', '#/info', '#/anleitung']) {
        await nav(page, withUi(h, ui, l));
        for (const b of await scan()) bad.push(`${ui}/${l} ${h}: ${b}`);
      }
    }
  }
  expect(bad, bad.slice(0, 20).join('\n')).toEqual([]);
  // Überschrift: Titel ohne doppelte Fettung, Kleinschreibung wie im Amtsblatt
  await nav(page, '#/lesen?u=anx_II&l=de&ui=de');
  await expect(page.locator('h1.unit-title')).toHaveText('Erfassung von informationen');
  expect(await page.locator('h1.unit-title b').count()).toBe(0);
  // Anhänge ohne Titel: abgeleiteter Kurzbeschrieb, gedämpft
  for (const u of ['anx_V', 'anx_VIII', 'anx_XII']) {
    await nav(page, `#/lesen?u=${u}&l=de&ui=de`);
    await expect(page.locator(`.toc-unit.is-current .toc-title`)).toHaveClass(/is-derived/);
    expect((await page.locator('.toc-unit.is-current .toc-title').innerText()).length).toBeGreaterThan(10);
    await expect(page.locator('h1.unit-title')).toHaveClass(/is-derived/);
  }
});

// ------------------------------------------------------------------ Überlauf und Überlappung
for (const width of [1024, 1280, 1440, 1920]) {
  test(`Überlauf und Überlappung bei ${width} px (DE, FR, Rechtstext DE und FR, Panel offen, Upload-Stand simuliert)`, async ({ page }) => {
    test.setTimeout(240000);
    await page.setViewportSize({ width, height: 900 });
    const log = await open(page, '#/uebersicht?ui=de');
    const all = [];
    for (const ui of ['de', 'fr']) {
      for (const l of ['de', 'fr']) {
        for (const [name, h] of VIEWS()) {
          await nav(page, withUi(h, ui, l));
          await page.waitForTimeout(40);
          for (const i of await page.evaluate(layoutCheck)) all.push(`${width} ${ui}/${l} ${name}: ${i}`);
        }
      }
    }
    // zusätzlicher Stand (wie nach einem Upload): Standleiste mit 10 Einträgen, mit und ohne Panel
    await page.evaluate(() => {
      const d = window.__sgk.data();
      const last = d.stages[d.stages.length - 1];
      const extra = { ...last, id: 's09', order: last.order + 1, act: '02016R0399-20261002', source: { kind: 'uploaded', celex: '02016R0399-20261002' }, langs: ['de', 'fr', 'en'] };
      d.stages.push(extra); d.stageById.set('s09', extra);
      if (!d.acts.has(extra.act)) { const a = d.synthAct(extra.act, { date: '2026-10-02' }); d.acts.set(a.celex, a); d.colors.set(a.celex, '#882255'); }
    });
    for (const ui of ['de', 'fr']) for (const h of ['#/lesen?u=art_8', '#/lesen?u=art_8&k=p3.a.i', '#/lesen?u=anx_V&k=*']) {
      await nav(page, withUi(h, ui, 'fr'));
      expect(await page.locator('.stagebar .stg').count()).toBe(10);
      for (const i of await page.evaluate(layoutCheck)) all.push(`${width} ${ui} +Upload ${h}: ${i}`);
    }
    expect(all, all.slice(0, 30).join('\n')).toEqual([]);
    expect(log.errors).toEqual([]);
  });
}

// ------------------------------------------------------------------ Schaltflächen erkennbar
test('Schaltflächen: Form ohne Hover erkennbar, Mindestgrösse, Fokusring', async ({ page }) => {
  await open(page, '#/chronik?u=art_8&k=p3.a.i&ui=de');
  const probs = [];
  for (const h of ['#/chronik?u=art_8&k=p3.a.i', '#/lesen?u=art_8&k=p3.a.i', '#/vergleich?u=art_8', '#/aktualisieren', '#/uebersicht']) {
    await nav(page, withUi(h, 'de'));
    probs.push(...await page.evaluate(() => {
      const out = [];
      for (const b of document.querySelectorAll('button, a.btn, a.btn-icon, [role="button"]')) {
        const r = b.getBoundingClientRect();
        if (!r.width || b.closest('.menu-pop, .stagebar-legend') || b.classList.contains('link') || b.matches('.blk')) continue;
        const s = getComputedStyle(b);
        const shaped = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent' || s.boxShadow !== 'none' || s.borderStyle !== 'none' && parseFloat(s.borderWidth) > 0;
        const bareOk = b.classList.contains('is-bare') || b.matches('.tl-act, .mx-cell button, .chip-btn') ;
        if (!shaped && !bareOk) out.push(`ohne Form: ${b.textContent.trim().slice(0, 30) || b.getAttribute('aria-label')}`);
        if (Math.min(r.width, r.height) < 31 && !b.closest('.toc-search')) out.push(`zu klein (${Math.round(r.width)}x${Math.round(r.height)}): ${b.textContent.trim().slice(0, 30) || b.getAttribute('aria-label')}`);
        if (s.cursor !== 'pointer' && !b.disabled) out.push(`kein Zeiger: ${b.textContent.trim().slice(0, 30)}`);
      }
      return out;
    }));
  }
  expect(probs).toEqual([]);
  // "Im Text zeigen" ist als Schaltfläche erkennbar (Feedback 5)
  await nav(page, '#/chronik?u=art_8&k=p3.a.i&ui=de');
  const btn = page.getByRole('button', { name: 'Im Text zeigen' });
  await expect(btn).toHaveClass(/btn-tertiary/);
  // Carbon: gefüllte (Sekundär, Charcoal) oder gerahmte Fläche statt Schatten-Rahmen
  expect(await btn.evaluate((b) => { const s = getComputedStyle(b); return s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.boxShadow !== 'none' || parseFloat(s.borderTopWidth) > 0; })).toBe(true);
  // Fokusring sichtbar
  await btn.focus();
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
  expect(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)).toBe('solid');
  // Status-Etiketten sehen nicht wie Schaltflächen aus: Carbon-Tag (radius-xs, 24 px hoch, ohne Rahmen), kein Zeiger
  await nav(page, '#/lesen?u=art_8&ui=de');
  const tag = page.locator('.act-legend .tag').first();
  expect(await tag.evaluate((e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return [s.cursor, parseFloat(s.borderRadius) <= 2, s.boxShadow, s.borderStyle, r.height < 31]; })).toEqual(['auto', true, 'none', 'none', true]);
  // Anklickbarer Block: Hinweis über dem Text und Symbol bei Hover
  await expect(page.locator('.hint')).toBeVisible();
  const blk = page.locator('.blk[role="button"]').nth(2);
  await blk.hover();
  await page.waitForTimeout(300);
  expect(Number(await blk.locator('.blk-go').evaluate((e) => getComputedStyle(e).opacity))).toBeGreaterThan(0.9);
});

// ------------------------------------------------------------------ Anleitung
test('Anleitung DE und FR: Abschnitte, Sprungmarken, Kontext-Hilfe, Bezeichnungen aus der Oberfläche', async ({ page }) => {
  const log = await open(page, '#/anleitung?ui=de');
  for (const ui of ['de', 'fr']) {
    await nav(page, `#/anleitung?ui=${ui}`);
    await expect(page.locator('.g-sec')).toHaveCount(7);
    await expect(page.locator('.g-task')).toHaveCount(18); // Etappe 3: sieben Aufgaben ergänzt; «Neue Version des Tools erhalten»
    expect(await page.locator('.g-steps li').count()).toBeGreaterThan(35);
    const body = await page.locator('.guide').innerText();
    expect(body).not.toContain('[[');
    expect(body).not.toContain('⟦');
    // Bezeichnungen identisch mit der Oberfläche
    const ui1 = await page.evaluate(() => window.__sgk.i18n.t('read.mode.datum'));
    await expect(page.locator('.g-task#g-sichten .ui-ref').first()).toHaveText(await page.evaluate(() => window.__sgk.i18n.t('nav.lesen')));
    expect(body).toContain(ui1);
    // Legende mit echten Bausteinen
    expect(await page.locator('.g-legend .blk .mark-code').count()).toBeGreaterThanOrEqual(2);
    expect(await page.locator('.g-legend .chip').count()).toBeGreaterThan(5);
    expect(await page.locator('.g-legend .tag').count()).toBeGreaterThan(4);
    // Sprungmarke
    await page.locator('.g-toc a', { hasText: await page.evaluate(() => window.__sgk.i18n.t('guide.sec.legende')) }).click();
    await expect(page).toHaveURL(/sec=legende/);
    await expect(page.locator('#g-legende')).toBeInViewport();
  }
  // Kontext-Hilfe aus den Ansichten
  for (const [h, sec] of [['#/lesen?u=art_8', 'lesen'], ['#/vergleich?u=art_8', 'vergleich'], ['#/uebersicht', 'uebersicht'], ['#/aktualisieren', 'aktualisieren'], ['#/chronik?u=art_8', 'chronologie']]) {
    await nav(page, withUi(h, 'fr'));
    await page.locator('.help-link').first().click();
    await expect(page).toHaveURL(new RegExp('sec=' + sec));
    await expect(page.locator('#g-' + sec)).toBeInViewport();
  }
  await page.screenshot({ path: join(SHOTS, '1440-fr-anleitung-kontext.png') });
  expect(log.errors).toEqual([]);
});

// ------------------------------------------------------------------ Export in FR
test('Export einer Karte in FR: Dateiname, Titel, Legende und Quellenzeile französisch', async ({ page }) => {
  const log = await open(page, '#/lesen?u=art_8&k=p3.a.i&l=de&ui=fr');
  await page.evaluate(() => {
    window.__cards = [];
    new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList.contains('card-host')) setTimeout(() => { const c = n.querySelector('.card'); if (c) window.__cards.push(c.innerText); }, 0); })
      .observe(document.body, { childList: true });
  });
  await page.locator('.panel .export-menu > button').click();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.getByRole('menuitem', { name: 'PNG A4' }).click()]);
  expect(dl.suggestedFilename()).toBe('art-8-par-3-point-a-i-CFS_Chronologie_A4.png');
  const f = join(ROOT, 'test/app/out', dl.suggestedFilename());
  await dl.saveAs(f);
  const card = (await page.evaluate(() => window.__cards))[0] || '';
  expect(card).toContain('art. 8, par. 3, point a) i), CFS');
  expect(card).toContain('Chronologie des versions');
  expect(card).toContain('Source : EUR-Lex, règlement (UE) 2016/399 (CFS)');
  expect(card).toContain('Seul le Journal officiel');
  expect(card).not.toMatch(/Quelle|Stand nach|anwendbar|eingefügt/);
  // Karte FR, Vergleich als PDF
  await nav(page, '#/vergleich?u=art_8&k=p3.a.i&a=s00&b=s08&ui=fr');
  await page.locator('.view-compare .export-menu > button').click();
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), page.getByRole('menuitem', { name: 'PDF 16:9' }).click()]);
  expect(dl2.suggestedFilename()).toBe('art-8-par-3-point-a-i-CFS_Comparaison_16x9.pdf');
  const png = readFileSync(f);
  // PNG der FR-Karte als Screenshot ablegen
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(SHOTS, 'export-fr-chronologie-a4.png'), png);
  // Sammelkorb: Karte behält ihre Sprache, auch nach Wechsel auf DE
  await page.locator('.view-compare .export-menu > button').click();
  await page.getByRole('menuitem', { name: 'Ajouter au panier (A4)' }).click();
  await page.locator('.head-lang button', { hasText: 'DE' }).click();
  await page.locator('#btn-basket').click();
  await expect(page.locator('.bk-item').first()).toContainText('art. 8, par. 3, point a) i), CFS');
  await expect(page.locator('.bk-item').first()).toContainText('Karte FR');
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
});

// ------------------------------------------------------------------ Screenshots
test('Screenshots: alle Ansichten DE und FR bei 1440, Problemstellen bei 1024, 1280, 1920', async ({ page }) => {
  test.setTimeout(300000);
  for (const f of readdirSync(SHOTS)) if (/^(1024|1280|1440|1920)-/.test(f) && !f.includes('sparql-echt') && !f.includes('kontext')) unlinkSync(join(SHOTS, f));
  await open(page, '#/uebersicht?ui=de');
  const shot = async (w, ui, name, h, after) => {
    await page.setViewportSize({ width: w, height: 900 });
    await nav(page, withUi(h, ui));
    if (!h.includes('sec=')) await page.evaluate(() => document.querySelectorAll('.reader, .view, .panel-body').forEach((e) => { e.scrollTop = 0; }));
    await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
    if (after) await after();
    await page.waitForTimeout(120);
    await page.screenshot({ path: join(SHOTS, `${w}-${ui}-${name}.png`) });
  };
  for (const ui of ['de', 'fr']) {
    for (const [name, h] of VIEWS()) await shot(1440, ui, name, h);
    await shot(1440, ui, 'uebersicht-matrix', '#/uebersicht', () => page.evaluate(() => document.querySelector('#mx-h').scrollIntoView({ block: 'start' })));
    await shot(1440, ui, 'uebersicht-zeitstrahl', '#/uebersicht', () => page.evaluate(() => document.querySelector('#tl-h').scrollIntoView({ block: 'start' })));
    await shot(1440, ui, 'lesen-toc-anhaenge', '#/lesen?u=anx_VII');
    await shot(1440, ui, 'anleitung-legende', '#/anleitung?sec=legende');
    await shot(1440, ui, 'sammelkorb', '#/lesen?u=art_8', () => page.locator('#btn-basket').click());
    await page.keyboard.press('Escape');
    for (const w of [1024, 1280, 1920]) {
      await shot(w, ui, 'lesen-standleiste', '#/lesen?u=art_8');
      await shot(w, ui, 'lesen-standleiste-panel', '#/lesen?u=art_8&k=p3.a.i');
      await shot(w, ui, 'zeitstrahl', '#/uebersicht', () => page.evaluate(() => document.querySelector('#tl-h').scrollIntoView({ block: 'start' })));
      await shot(w, ui, 'toc-anhaenge', '#/lesen?u=anx_VII');
      await shot(w, ui, 'chronik', '#/chronik?u=art_8&k=p3.a.i');
      await shot(w, ui, 'vergleich', '#/vergleich?u=art_8&a=s00&b=s08');
    }
  }
});

// ------------------------------------------------------------------ Meldungen und Sammelkorb (Carbon-Nacharbeit)
/** Elemente, deren Mitte von einer Meldung (.toast) überdeckt wird */
const toastCovers = (sel) => {
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (!r.width || r.bottom <= 0 || r.top >= innerHeight) continue;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (hit && hit.closest('.toast')) out.push((el.textContent || el.getAttribute('aria-label') || el.className).trim().slice(0, 30));
  }
  return out;
};
for (const [width, ui] of [[1024, 'fr'], [1440, 'de'], [375, 'de']]) {
  test(`Meldungen verdecken keine Bedienelemente (${width} px ${ui.toUpperCase()}): Lesen und Sammelkorb`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const log = await open(page, `#/lesen?u=art_8&k=p3.a.i&ui=${ui}`);
    await page.locator('.panel .export-menu > button').click();
    await page.locator('#x-basket-a4').click();
    await expect(page.locator('.toast')).toBeVisible();
    expect(await page.evaluate(toastCovers, '.reader-tools button, .reader-tools select, .stg, .app-head a, .app-head button, .panel button, .workbar-tab')).toEqual([]);
    await page.keyboard.press('Escape');
    await page.locator('#btn-basket').click();
    await expect(page.locator('.drawer')).toBeVisible();
    await page.locator('.drawer .bk-item').first().waitFor();
    // Meldung bei offener Schublade (Word erstellt) liegt über der Fusszeile
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('#btn-basket-docx').click()]);
    expect(dl.suggestedFilename()).toMatch(/\.docx$/);
    await expect(page.locator('.toast').last()).toBeVisible();
    expect(await page.evaluate(toastCovers, '.drawer button')).toEqual([]);
    expect(log.errors).toEqual([]);
  });
}

test('Sammelkorb: Fokusfalle, Escape schliesst immer, schliesst beim Modulwechsel', async ({ page }) => {
  const log = await open(page, '#/lesen?u=art_8&k=p3.a.i&ui=de');
  await page.locator('.panel .export-menu > button').click();
  await page.locator('#x-basket-a4').click();
  await page.locator('#btn-basket').click();
  const dr = page.locator('.drawer');
  await expect(dr).toBeVisible();
  await expect(page.locator('.drawer .panel-head .btn-icon')).toBeFocused(); // Schublade fertig geöffnet
  // Fokusfalle: 30 Tabulatorschritte bleiben in der Schublade
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press(i % 7 === 6 ? 'Shift+Tab' : 'Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('.drawer'))).toBe(true);
  }
  // Escape schliesst auch, wenn der Fokus ausserhalb liegt
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('Escape');
  await expect(dr).toHaveCount(0);
  await expect(page.locator('#btn-basket')).toBeFocused();
  // Modulwechsel schliesst
  await page.locator('#btn-basket').click();
  await expect(dr).toBeVisible();
  await page.evaluate(() => { location.hash = '#/dossiers?ui=de'; });
  await expect(dr).toHaveCount(0);
  expect(log.errors).toEqual([]);
});

test('Kopfzeile: Etikett BETA und Rückmelde-Symbol in allen Ansichten beider Module, 375 px ohne Überlauf, nicht im Druck', async ({ page }) => {
  const ISSUES = 'https://github.com/SEM-SGG/sgk-navigator/issues/new/choose';
  const log = await open(page, '#/uebersicht?ui=de');
  const tag = page.locator('.app-head #beta-tag');
  const fb = page.locator('.app-head #lnk-feedback');
  // Etikett und Symbol liegen ausserhalb des Links .brand, Reihenfolge Wortmarke, Etikett, Symbol
  const geo = () => page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const b = r('.app-head .brand'), g = r('#beta-tag'), f = r('#lnk-feedback'), h = r('.app-head');
    return { nested: !!document.querySelector('.brand #beta-tag, .brand #lnk-feedback, #beta-tag a, #beta-tag button'), order: b.right <= g.left && g.right <= f.left + 1, gap: g.left - b.right,
      fb: [f.width, f.height], right: f.right, head: h.height, sw: document.documentElement.scrollWidth, w: innerWidth };
  });
  // Alle Ansichten der Top-Navigation in beiden Modulen
  for (const mod of ['#/uebersicht?ui=de', '#/dossiers?ui=de']) {
    await nav(page, mod);
    const hrefs = await page.locator('.app-head .views a').evaluateAll((l) => l.map((a) => a.getAttribute('href')));
    expect(hrefs.length).toBeGreaterThan(3);
    for (const h of hrefs) {
      await nav(page, h);
      await expect(tag, h).toBeVisible();
      await expect(fb, h).toBeVisible();
    }
  }
  await nav(page, '#/uebersicht?ui=de');
  await expect(tag).toHaveText('BETA' + 'Beta: Dieses Tool ist in Erprobung. Rückmeldungen sind willkommen.');
  await expect(tag).toHaveAttribute('title', 'Beta: Dieses Tool ist in Erprobung. Rückmeldungen sind willkommen.');
  await expect(fb).toHaveAttribute('href', ISSUES);
  await expect(fb).toHaveAttribute('target', '_blank');
  await expect(fb).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(fb).toHaveAccessibleName('Fehler melden oder Änderung vorschlagen');
  await expect(fb).toHaveAttribute('title', /^Fehler melden oder Änderung vorschlagen\. Öffnet GitHub in einem neuen Tab\. Meldungen sind öffentlich: keine Inhalte mit dem Vermerk INTERN oder höher, keine Personendaten\.$/);
  // Neutrales Grau, Kontrast mindestens 4.5:1, kleine Schrift
  const look = await tag.evaluate((e) => { const s = getComputedStyle(e); return { color: s.color, bg: s.backgroundColor, size: parseFloat(s.fontSize) }; });
  const lum = (c) => { const v = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const [l1, l2] = [lum(look.color), lum(look.bg)].sort((a, b) => b - a);
  expect((l1 + 0.05) / (l2 + 0.05)).toBeGreaterThanOrEqual(4.5);
  expect(look.size).toBeGreaterThanOrEqual(11);
  expect(look.size).toBeLessThanOrEqual(12);
  // Klickfläche wie die übrigen Werkzeuge der Top-Navigation (48 px), Fokus mit der Tastatur
  let g = await geo();
  expect(g.nested).toBe(false);
  expect(g.order).toBe(true);
  expect(g.fb).toEqual([48, 48]);
  await page.locator('.app-head .brand').focus();
  await page.keyboard.press('Tab');
  await expect(fb).toBeFocused();
  expect(await fb.evaluate((e) => getComputedStyle(e).outlineStyle)).not.toBe('none');
  // FR
  await nav(page, '#/uebersicht?ui=fr');
  await expect(tag.locator('[aria-hidden="true"]')).toHaveText('BÊTA');
  await expect(fb).toHaveAccessibleName('Signaler une erreur ou proposer une modification');
  // 375 px in beiden Modulen und Sprachen: eine Zeile, kein Überlauf, beide sichtbar
  await page.setViewportSize({ width: 375, height: 800 });
  for (const h of ['#/uebersicht?ui=de', '#/lesen?u=art_8&ui=de', '#/dossiers?ui=de', '#/uebersicht?ui=fr']) {
    await nav(page, h);
    await expect(tag, h).toBeVisible();
    await expect(fb, h).toBeVisible();
    g = await geo();
    expect(g.sw, h).toBeLessThanOrEqual(g.w);
    expect(g.head, h).toBe(48);
    expect(g.right, h).toBeLessThanOrEqual(375);
    expect(g.fb, h).toEqual([48, 48]);
    expect((await page.evaluate(layoutCheck)).filter((x) => /Kopfzeile|Seite scrollt horizontal|Überlauf .*(app-head|brand|head-tools|tag-beta|head-feedback)/.test(x)), h).toEqual([]);
  }
  // Druck: Kopfzeile mit Etikett und Symbol ausgeblendet
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ media: 'print' });
  await expect(tag).toBeHidden();
  await expect(fb).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
});
