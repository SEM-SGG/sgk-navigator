// UI-Tests Etappe 3, Modul Rechtsakte (Erweiterungen A–G) gegen dist/sgk-navigator.html über file://, mit echten Daten.
// A Werke, B Verweise, C Begründung, D Anwendbarkeit je Einzeländerung, E Formulare als Text, F Text-Export, G Vorschau.
import { test, expect } from '@playwright/test';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { unzipSync, strFromU8 } from 'fflate';
import { layoutCheck, buttonCheck, fulfillSparql } from './helpers.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const APP = 'file://' + join(ROOT, 'dist/sgk-navigator.html');
const APP_UPLOAD_EES = 'file://' + join(ROOT, 'test/app/out/sgk-navigator-upload-ees.html');
// Quelldateien aus raw/ (Datenpflege); fehlen sie, die per test/app/tools/fetch-eurlex.mjs geladenen Dateien aus test/app/fixtures-live/
const RAW = (f) => (existsSync(join(ROOT, 'raw', f)) ? join(ROOT, 'raw', f) : join(ROOT, 'test/app/fixtures-live', f));
const SHOTS = join(ROOT, 'test/app/screenshots');
const OUT = join(ROOT, 'test/app/out/e3');
mkdirSync(SHOTS, { recursive: true });
mkdirSync(OUT, { recursive: true });
const WORKS = ['sgk', 'ees', 'etias', 'vis', 'iop'];

async function open(page, hash = '', url = APP) {
  const log = { errors: [], requests: [] };
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push(m.text()); });
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  page.on('request', (r) => { const u = r.url(); if (!/^(file|data|blob):/.test(u)) log.requests.push(u); });
  await page.goto(url + hash);
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready, null, { timeout: 30000 });
  return log;
}
/** Navigation über den Hash (ohne Neuladen) */
async function nav(page, hash, wait = 120) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await page.waitForTimeout(wait);
}
const hashParam = (page, k) => new URLSearchParams(new URL(page.url()).hash.split('?')[1] || '').get(k);
const missingKeys = (page) => page.evaluate(() => (document.body.innerText.match(/⟦[^⟧]+⟧/g) || []));

async function download(page, trigger) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), trigger()]);
  const f = join(OUT, dl.suggestedFilename());
  await dl.saveAs(f);
  return { file: f, buf: readFileSync(f), name: dl.suggestedFilename() };
}
async function menuExport(page, scope, id) {
  // Chronologie (Carbon): Exportkarte in der Seitenleiste statt Menü; gleiche Einträge (Format = Menü-ID)
  const card = page.locator(`${scope} .xcard`);
  if (await card.count()) {
    await card.locator('#xc-format').selectOption(id);
    return download(page, () => card.locator('#xc-export').click());
  }
  await page.locator(`${scope} .export-menu > button`).first().click();
  return download(page, () => page.locator('#' + id).click());
}
function docxXml(buf) {
  expect(buf.subarray(0, 2).toString()).toBe('PK');
  const z = unzipSync(new Uint8Array(buf));
  expect(Object.keys(z)).toContain('word/document.xml');
  return strFromU8(z['word/document.xml']);
}
const pdfText = (file) => execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });

// ------------------------------------------------------------------ A Werke
test('A: Werkwahl, alle Ansichten für fünf Werke in DE/FR × DE/FR/EN ohne Konsolenfehler, ohne unübersetzte Schlüssel, ohne Netz', async ({ page }) => {
  test.setTimeout(420000);
  const log = await open(page, '#/uebersicht');
  const views = ['uebersicht', 'lesen', 'chronik', 'vergleich', 'vergleich?cm=sprache', 'aktualisieren', 'info'];
  const issues = [];
  for (const w of WORKS) for (const ui of ['de', 'fr']) for (const l of ['de', 'fr', 'en']) {
    for (const v of views) {
      const [path, q] = v.split('?');
      await nav(page, `#/${path}?w=${w}&l=${l}&ui=${ui}${q ? '&' + q : ''}`, 60);
      await expect(page.locator('.view').first()).toBeVisible();
      const miss = await missingKeys(page);
      if (miss.length) issues.push(`${w}/${ui}/${l}/${v}: ${miss.join(' ')}`);
    }
    // Lesen: Text vorhanden, Werkleiste markiert
    await nav(page, `#/lesen?w=${w}&l=${l}&ui=${ui}&u=art_1`, 150);
    await expect(page.locator('.legal-read .blk').first()).toBeVisible();
    await expect(page.locator(`.workbar-tab[data-work="${w}"]`)).toHaveAttribute('aria-selected', 'true');
  }
  expect(issues).toEqual([]);
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
});

test('A: Werkwahl per Klick, Zitierweise je Werk, Fassung per Datum, keine Anwendbarkeit bei den weiteren Werken, Erwägungsgründe', async ({ page }) => {
  const log = await open(page, '#/lesen?u=art_9');
  await page.locator('.workbar-tab[data-work="ees"]').click();
  await expect(page).toHaveURL(/w=ees/);
  // Tabs nach Carbon: role="tab", aria-selected, Pfeiltasten wechseln das Werk
  await expect(page.locator('.workbar-tabs')).toHaveAttribute('role', 'tablist');
  await expect(page.locator('.workbar-tab[data-work="ees"]')).toHaveAttribute('role', 'tab');
  await page.locator('.workbar-tab[data-work="ees"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/w=etias/);
  await expect(page.locator('.workbar-tab[data-work="etias"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.workbar-tab[data-work="etias"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page).toHaveURL(/w=ees/);
  await expect(page.locator('.unit-meta').first()).toContainText('EES-VO');
  await expect(page.locator('.workbar-note')).toContainText('konsolidierte Fassungen');
  // keine Sicht «Alle beschlossenen Änderungen», «Fassung per Datum» statt «Anwendbar am»
  await expect(page.getByRole('button', { name: 'Alle beschlossenen Änderungen' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Fassung per Datum …' }).click();
  await page.locator('#read-date').fill('2019-01-01');
  await expect(page.locator('.notice-info')).toContainText('Fassung per Datum');
  await expect(page.locator('.unit-meta').first()).toContainText('Konsolidierte Fassung vom 9. Oktober 2018');
  // nichts als «anwendbar» ausgewiesen (Lesen, Chronologie, Info)
  await nav(page, '#/lesen?w=ees&u=art_9', 300);
  await expect(page.locator('.act-legend .tag-ok')).toHaveCount(0);
  await nav(page, '#/chronik?w=ees&u=art_9', 300);
  await expect(page.locator('.chron .step').first()).toBeVisible();
  expect(await page.locator('.chron').innerText()).not.toMatch(/anwendbar seit/);
  await expect(page.locator('.chron')).toContainText('Konsolidierte Fassung vom');
  await nav(page, '#/info?w=ees', 300);
  await expect(page.locator('.tbl-data').nth(1)).toContainText('nicht erhoben');
  await expect(page.locator('#tbl-works tbody tr')).toHaveCount(5);
  // Erwägungsgründe: an erster Stelle im Inhaltsverzeichnis, zitierbar
  await nav(page, '#/lesen?w=sgk&u=rct&k=r12', 400);
  await expect(page.locator('.toc-tree > .toc-unit').first()).toContainText('Erwägungsgründe');
  await expect(page.locator('.panel-title')).toHaveText('Erw. 12 SGK');
  await nav(page, '#/lesen?w=sgk&u=rct&k=r12&ui=fr', 400);
  await expect(page.locator('.panel-title')).toHaveText('consid. 12, CFS');
  await nav(page, '#/lesen?w=vis&u=rct&k=r5&ui=de', 400);
  await expect(page.locator('.panel-title')).toHaveText('Erw. 5 VIS-VO');
  // Suche nach Erwägungsgrund
  await nav(page, '#/lesen?w=sgk&ui=de', 200);
  await page.locator('#toc-q').fill('Erw. 7');
  await page.locator('#toc-q').press('Enter');
  await expect(page).toHaveURL(/u=rct&k=r7/);
  // bestehende Links ohne w bleiben gültig (SGK)
  await page.goto(APP + '#/lesen?u=art_8&k=p3.a.i');
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
  await expect(page.locator('.workbar-tab[data-work="sgk"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.panel-title')).toHaveText('Art. 8 Abs. 3 Bst. a Ziff. i SGK');
  expect(log.errors).toEqual([]);
});

test('A: Upload einer konsolidierten Fassung für die EES-VO erzeugt einen neuen Stand dieses Werks', { tag: '@daten' }, async ({ page }) => {
  test.skip(['02016R0399-20240710_DE.html', '02017R2226-20260612_DE.html'].some((f) => !existsSync(RAW(f))), 'raw/ bzw. test/app/fixtures-live/ fehlt');
  test.skip(!existsSync(join(ROOT, 'test/app/out/sgk-navigator-upload-ees.html')), 'Testvariante fehlt');
  const log = await open(page, '#/aktualisieren?w=ees', APP_UPLOAD_EES);
  const before = await page.evaluate(() => ({ ees: window.__sgk.work('ees').stages.length, sgk: window.__sgk.data().stages.length }));
  await expect(page.locator('.unit-title')).toContainText('Einreise-/Ausreisesystem');
  // Fassung eines anderen Werks wird nicht abgewiesen, sondern dem SGK zugeordnet (hier bereits im Datensatz)
  await page.locator('#file-input').setInputFiles(RAW('02016R0399-20240710_DE.html'));
  await expect(page.locator('.up-log li').first()).toContainText(/SGK: Die Fassung 02016R0399-20240710 \(DE\) ist bereits im Datensatz/, { timeout: 120000 });
  await page.locator('#file-input').setInputFiles(RAW('02017R2226-20260612_DE.html'));
  await expect(page.locator('.up-log li.ok')).toHaveCount(1, { timeout: 120000 });
  const after = await page.evaluate(() => ({ ees: window.__sgk.work('ees').stages.length, sgk: window.__sgk.data().stages.length, latest: window.__sgk.work('ees').latest.id }));
  expect(after.ees).toBe(before.ees + 1);
  expect(after.sgk).toBe(before.sgk);
  await expect(page.locator('#tbl-uploads tbody tr')).toHaveCount(1);
  // im SGK erscheint der Upload nicht
  await nav(page, '#/aktualisieren?w=sgk', 300);
  await expect(page.locator('#tbl-uploads')).toHaveCount(0);
  // nach Neuladen weiterhin vorhanden, Stand lesbar
  await page.goto(APP_UPLOAD_EES + `#/lesen?w=ees&u=art_9&s=${after.latest}&l=de`);
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
  await page.waitForFunction((n) => window.__sgk.work('ees').stages.length === n, after.ees, { timeout: 60000 });
  await expect(page.locator('.legal-read .blk').first()).toBeVisible();
  expect(log.errors).toEqual([]);
});

test('A: Aktualisieren je Werk: SPARQL-Abfrage mit der CELEX der EES-VO (gemockt), Ergebnis nur bei diesem Werk', async ({ page }) => {
  const queries = [];
  const binding = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { type: 'literal', value: v }]));
  await page.route('https://publications.europa.eu/**', async (route) => {
    const q = decodeURIComponent(new URL(route.request().url()).searchParams.get('query') || '');
    queries.push(q);
    let rows = [];
    if (q.includes('STRSTARTS')) rows = [{ celex: '02017R2226-20260612', date: '2026-06-12' }, { celex: '02017R2226-20261101', date: '2026-11-01' }];
    else if (!q.includes('GROUP_CONCAT')) rows = [{ celex: '32024R1356', rel: 'http://publications.europa.eu/ontology/cdm#resource_legal_amends_resource_legal', date: '2024-05-14', title: 'Verordnung (EU) 2024/1356' }];
    await fulfillSparql(route, rows.map(binding));
  });
  await open(page, '#/aktualisieren?w=ees');
  await page.locator('#btn-check').click();
  await expect(page.locator('#tbl-cons tbody tr')).toHaveCount(2);
  expect(queries.some((q) => q.includes('"02017R2226"'))).toBe(true);
  expect(queries.some((q) => q.includes('32017R2226'))).toBe(true);
  await expect(page.locator('#tbl-cons tr.is-new')).toContainText('02017R2226-20261101');
  await expect(page.locator('#tbl-cons tr', { hasText: '02017R2226-20260612' })).toContainText('s04');
  await nav(page, '#/aktualisieren?w=sgk', 300);
  await expect(page.locator('#tbl-cons')).toHaveCount(0);
});

// ------------------------------------------------------------------ B Verweise
test('B: Verweise im Text (intern, anderes Werk, extern), Schalter, Bereich «Verweise», mitbetroffen, Tastatur', async ({ page }) => {
  const log = await open(page, '#/lesen?u=art_8&l=de');
  const text = page.locator('.legal-read');
  // intern
  const intLink = text.locator('a.ref:not(.ref-lib):not(.ref-ext)').first();
  await expect(intLink).toBeVisible();
  const href = await intLink.getAttribute('href');
  const want = new URLSearchParams(href.split('?')[1]);
  await intLink.click();
  await expect(page).toHaveURL(new RegExp('u=' + want.get('u')));
  if (want.get('k')) expect(hashParam(page, 'k')).toBe(want.get('k'));
  // anderes Werk der Bibliothek, passender Stand (Datum des SGK-Stands)
  await nav(page, '#/lesen?u=art_8&l=de&k=', 300);
  const lib = text.locator('a.ref-lib', { hasText: '2017/2226' }).first();
  await expect(lib).toBeVisible();
  await lib.click();
  await expect(page).toHaveURL(/w=ees/);
  const st = await page.evaluate(() => { const s = new URLSearchParams(location.hash.split('?')[1]).get('s'); const d = window.__sgk.work('ees'); return { s, date: d.stageDate(s) }; });
  expect(st.date <= '2025-10-12').toBe(true);
  await expect(page.locator('.workbar-tab[data-work="ees"]')).toHaveAttribute('aria-selected', 'true');
  // extern: neuer Tab auf EUR-Lex, gekennzeichnet
  await nav(page, '#/lesen?w=sgk&u=art_6a&l=de', 300);
  const ext = text.locator('a.ref-ext').first();
  await expect(ext).toHaveAttribute('target', '_blank');
  await expect(ext).toHaveAttribute('href', /eur-lex\.europa\.eu\/legal-content\/DE\/TXT\/\?uri=CELEX:3/);
  await expect(ext).toHaveAttribute('title', /EUR-Lex/);
  // Wortlaut unverändert: Text mit und ohne Links gleich
  const withLinks = await text.innerText();
  await page.locator('#chk-refs').uncheck();
  await expect(text.locator('a.ref')).toHaveCount(0);
  expect(await text.innerText()).toBe(withLinks);
  await page.locator('#chk-refs').check();
  await expect(text.locator('a.ref').first()).toBeVisible();
  // Klick auf den Block (nicht auf den Link) öffnet weiterhin die Chronologie
  await nav(page, '#/lesen?w=sgk&u=art_8&l=de', 300);
  await page.locator('.legal-read .blk[data-k="p3.a.i"] .lbl').click();
  await expect(page).toHaveURL(/k=p3\.a\.i/);
  await expect(page.locator('.refs-panel')).toBeVisible();
  // Tastatur: Enter auf dem Block öffnet die Chronologie, Enter auf einem Link folgt dem Verweis
  await nav(page, '#/lesen?w=sgk&u=art_8&l=de', 300);
  await page.locator('.legal-read .blk[data-k="p2"]').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/k=p2(&|$)/);
  await nav(page, '#/lesen?w=sgk&u=art_8&l=de', 300);
  const l2 = text.locator('a.ref:not(.ref-ext)').first();
  const h2 = new URLSearchParams((await l2.getAttribute('href')).split('?')[1]);
  await l2.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp('u=' + h2.get('u')));
  // Bereich «Verweise»: verweist auf / wird verwiesen von, anklickbar
  await nav(page, '#/lesen?w=sgk&u=art_6&k=p1&l=de', 400);
  const rp = page.locator('.refs-panel');
  await expect(rp).toContainText('wird verwiesen von');
  const inc = rp.locator('details', { hasText: 'wird verwiesen von' });
  if (!(await inc.getAttribute('open'))) await inc.locator('summary').click();
  const first = inc.locator('.ref-cite').first();
  await expect(first).toBeVisible();
  const target = new URLSearchParams((await first.getAttribute('href')).split('?')[1]);
  await first.click();
  await expect(page).toHaveURL(new RegExp('u=' + target.get('u')));
  // Chronologie: mitbetroffen
  await nav(page, '#/chronik?w=sgk&u=art_6&k=p1&l=de', 400);
  const aff = page.locator('.affected button');
  await expect(aff).toContainText('mitbetroffen');
  await aff.click();
  await expect(page.locator('.affected .ref-item').first()).toBeVisible();
  await nav(page, '#/chronik?w=sgk&u=art_6&k=p1&l=fr&ui=fr', 400);
  await expect(page.locator('.affected button')).toContainText('concern');
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
});

// ------------------------------------------------------------------ C Begründung
test('C: Begründung je Änderungsschritt (Erwägungsgründe, direkt/thematisch, redaktionell gekennzeichnet), DE und FR', async ({ page }) => {
  const log = await open(page, '#/chronik?u=art_8&k=p3.a.i&l=de');
  const rat = page.locator('details.rat').first();
  await expect(rat).toBeVisible();
  await rat.locator('summary').click();
  await expect(rat).toContainText('redaktionelle Zuordnung, nicht amtlich');
  await expect(rat).toContainText('Erwägungsgrund');
  await expect(rat.locator('.tag', { hasText: /direkt|thematisch/ }).first()).toBeVisible();
  await expect(rat.locator('.rat-text').first()).toHaveAttribute('lang', 'de');
  // Rechtstext FR: Wortlaut französisch; Oberfläche FR
  await nav(page, '#/chronik?u=art_25&l=fr&ui=fr', 400);
  const r2 = page.locator('details.rat').first();
  await r2.locator('summary').click();
  await expect(r2).toContainText('non officielle');
  await expect(r2.locator('.rat-text').first()).toHaveAttribute('lang', 'fr');
  expect(await missingKeys(page)).toEqual([]);
  // optional in die Exportkarte: Schalter, dann Word und PNG
  await nav(page, '#/chronik?u=art_8&k=p3.a.i&l=de&ui=de', 400);
  await page.locator('#chk-ratexport').check();
  const w = await menuExport(page, '.view-chronik', 'x-docx');
  const xml = docxXml(w.buf);
  expect(xml).toContain('Begründung (Erwägungsgründe des Änderungsakts)');
  expect(xml).toContain('redaktionelle Zuordnung, nicht amtlich');
  const png = await menuExport(page, '.view-chronik', 'x-png-a4');
  expect(png.buf.subarray(0, 4).toString('hex')).toBe('89504e47');
  writeFileSync(join(SHOTS, 'e3-export-chronologie-begruendung.png'), png.buf);
  await page.locator('#chk-ratexport').uncheck();
    // Einheit ohne Zuordnung (weitere Werke): kein Bereich
  await nav(page, '#/chronik?w=ees&u=art_9&ui=de', 400);
  await expect(page.locator('details.rat')).toHaveCount(0);
  expect(log.errors).toEqual([]);
});

// ------------------------------------------------------------------ D Anwendbarkeit
test('D: Stichtag 15. Januar 2026 zeigt die Aussetzung nach VO (EU) 2025/1534 bei Art. 8 Abs. 9, Art. 9 Abs. 3, Art. 12, Art. 12a', async ({ page }) => {
  const log = await open(page, '#/lesen?u=art_8&m=datum&d=2026-01-15&l=de');
  const n = page.locator('.app-notices');
  await expect(n).toContainText('Art. 8 Abs. 9 SGK');
  await expect(n).toContainText('ausgesetzt');
  await expect(n).toContainText('2025/1534');
  await expect(page.locator('.legal-read .blk[data-k="p9"] .blk-flag')).toContainText('ausgesetzt');
  await nav(page, '#/lesen?u=art_9&m=datum&d=2026-01-15&l=de', 300);
  await expect(page.locator('.app-notices')).toContainText('Art. 9 Abs. 3 SGK');
  await expect(page.locator('.legal-read .blk[data-k="p3"] .blk-flag')).toContainText('ausgesetzt');
  await nav(page, '#/lesen?u=art_12&m=datum&d=2026-01-15&l=de', 300);
  await expect(page.locator('.app-notices')).toContainText('Art. 12 SGK');
  await expect(page.locator('.app-notices .blk-flag', { hasText: 'ausgesetzt' })).toHaveCount(1);
  await nav(page, '#/lesen?u=art_12a&m=datum&d=2026-01-15&l=de', 300);
  await expect(page.locator('.app-notices')).toContainText('ausgesetzt');
  await expect(page.locator('.app-notices')).toContainText('Art. 12a SGK');
  // FR
  await nav(page, '#/lesen?u=art_8&m=datum&d=2026-01-15&l=fr&ui=fr', 300);
  await expect(page.locator('.app-notices')).toContainText('suspendu');
  await expect(page.locator('.app-notices')).toContainText('art. 8, par. 9, CFS');
  // nach dem Ende der schrittweisen Inbetriebnahme keine Abweichung mehr
  await nav(page, '#/lesen?u=art_8&m=datum&d=2026-05-01&l=de&ui=de', 300);
  await expect(page.locator('.app-notices .flag-suspended')).toHaveCount(0);
  // Chronologie Art. 12a: eigenes Anwendungsdatum, befristet (berechnet)
  await nav(page, '#/chronik?u=art_12a&l=de', 300);
  await expect(page.locator('.chron')).toContainText('diese Änderung anwendbar ab 10. April 2026');
  await expect(page.locator('.chron')).toContainText('befristet bis 6. Oktober 2026');
  await expect(page.locator('.chron .tag-recon', { hasText: 'berechnet' }).first()).toBeVisible();
  // Übersicht: Tabelle und Zeitraum im Zeitstrahl
  await nav(page, '#/uebersicht', 400);
  await expect(page.locator('#tbl-owndates')).toContainText('Art. 12a SGK');
  await expect(page.locator('#tbl-owndates')).toContainText('12. Oktober 2025 bis 9. April 2026');
  await expect(page.locator('.tl-derog')).toHaveCount(1);
  await expect(page.locator('.tl-own').first()).toBeAttached();
  await expect(page.locator('.mx-cell.has-own').first()).toBeAttached();
  expect(log.errors).toEqual([]);
});

// ------------------------------------------------------------------ E Formulare
test('E: Formulare als Text (Bild | Text, Transkription, sic, abgelöster Punkt), Formularvergleich, Suche', async ({ page }) => {
  const log = await open(page, '#/lesen?u=anx_V&l=de&s=s08');
  const fig = page.locator('.legal-read .form-fig').first();
  await expect(fig).toBeVisible();
  await fig.getByRole('button', { name: 'Text' }).click();
  const ft = page.locator('.legal-read .form-text').first();
  await expect(ft).toContainText('Transkription, nicht amtlich');
  await expect(ft).toContainText('EINREISEVERWEIGERUNG');
  await expect(ft.locator('.form-note')).toBeVisible();
  // abgelöster Grund (C) ab ETIAS mit Verweis auf den massgebenden Block
  await expect(ft.locator('.is-superseded')).toHaveCount(1);
  await expect(ft.locator('.form-sup a')).toContainText('Anhang V Teil B Bst. c SGK');
  // Umschalten öffnet nicht die Chronologie
  expect(hashParam(page, 'k')).toBeNull();
  // FR: sic-Stelle gekennzeichnet
  await nav(page, '#/lesen?u=anx_V&l=fr&s=s08', 400);
  await expect(page.locator('.legal-read .sic-mark').first()).toHaveText('[sic]');
  // Formularvergleich (Vergleich 2016 gegen nach EES)
  await nav(page, '#/vergleich?u=anx_V&a=s00&b=s08&l=de&cm=stand&sc=changed', 500);
  const cmp = page.locator('.form-cmp').first();
  await expect(cmp).toBeVisible();
  await expect(cmp.locator('.form-blk.st-ins').first()).toBeVisible();
  await expect(cmp).toContainText('(J)');
  // Chronologie des Bildblocks: Formularfassungen als Text
  await nav(page, '#/chronik?u=anx_V&k=ptB.g1&l=de', 500);
  await expect(page.locator('.form-cmp-box').first()).toBeVisible();
  // Suche findet Formulartext
  await nav(page, '#/lesen?u=art_1&l=de', 200);
  await page.locator('#toc-q').fill('vorstellig geworden');
  await page.locator('#toc-q').press('Enter');
  await expect(page.locator('.search-res')).toContainText('Anhang V');
  expect(log.errors).toEqual([]);
});

// ------------------------------------------------------------------ F Export
test('F: Text-Export (Word, Word mit Änderungsverfolgung, PDF mit Text, Zwischenablage) für Chronologie, Vergleich, Sprachvergleich, Formular, Sammelkorb', async ({ page, context }) => {
  test.setTimeout(300000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const log = await open(page, '#/lesen?u=art_8&k=p3.a.i&l=de');
  // Menü gegliedert
  await page.locator('.panel .export-menu > button').click();
  const seps = await page.locator('.menu-pop .menu-sep').allInnerTexts();
  expect(seps).toEqual(['Bild', 'Text (bearbeitbar, durchsuchbar)', 'Weitere']);
  await page.keyboard.press('Escape');
  // Chronologie einer Bestimmung
  const d1 = await menuExport(page, '.panel', 'x-docx');
  const x1 = docxXml(d1.buf);
  expect(x1).toContain('Art. 8 Abs. 3 Bst. a Ziff. i SGK');
  expect(x1).toMatch(/<w:strike\/>|<w:dstrike|w:val="single"/);
  const d2 = await menuExport(page, '.panel', 'x-docx-tracked');
  const x2 = docxXml(d2.buf);
  expect(x2).toContain('<w:ins ');
  expect(x2).toContain('<w:del ');
  const p1 = await menuExport(page, '.panel', 'x-pdftext-a4');
  expect(p1.buf.subarray(0, 5).toString()).toBe('%PDF-');
  const t1 = pdfText(p1.file);
  expect(t1).toContain('Art. 8 Abs. 3 Bst. a Ziff. i SGK');
  expect(t1).toMatch(/Drittstaatsangehörigen/);
  const p2 = await menuExport(page, '.panel', 'x-pdftext-169');
  expect(pdfText(p2.file)).toContain('Art. 8 Abs. 3 Bst. a Ziff. i SGK');
  // Zwischenablage
  await page.locator('.panel .export-menu > button').click();
  await page.locator('#x-clip').click();
  await expect(page.locator('.toast-success', { hasText: 'Zwischenablage' })).toBeVisible();
  const clip = await page.evaluate(() => window.__sgkLastClip);
  expect(clip.html).toContain('Art. 8 Abs. 3 Bst. a Ziff. i SGK');
  expect(clip.html).toMatch(/<del|<ins/);
  const fromClipboard = await page.evaluate(async () => { const items = await navigator.clipboard.read(); const it = items[0]; return it.types.includes('text/html') ? await (await it.getType('text/html')).text() : ''; });
  expect(fromClipboard).toContain('Art. 8 Abs. 3 Bst. a Ziff. i SGK');
  // Chronologie der Einheit (Word, PDF)
  await nav(page, '#/chronik?u=art_8&l=de', 400);
  const u1 = await menuExport(page, '.view-chronik', 'x-docx');
  expect(docxXml(u1.buf)).toContain('Art. 8 SGK');
  // Vergleich nebeneinander und Redline
  await nav(page, '#/vergleich?u=art_8&a=s00&b=s08&l=de&cm=stand&lay=side&sc=changed', 400);
  const c1 = await menuExport(page, '.view-compare', 'x-docx-tracked');
  const xc = docxXml(c1.buf);
  expect(xc).toContain('<w:tbl>');
  expect(xc).toContain('<w:ins ');
  const c2 = await menuExport(page, '.view-compare', 'x-pdftext-a4');
  expect(pdfText(c2.file)).toContain('Art. 8 SGK');
  await nav(page, '#/vergleich?u=art_8&a=s00&b=s08&l=de&cm=stand&lay=redline&sc=changed', 300);
  const c3 = await menuExport(page, '.view-compare', 'x-docx');
  expect(docxXml(c3.buf)).toContain('Art. 8 SGK');
  // Sprachvergleich
  await nav(page, '#/vergleich?u=art_8&k=p2&cm=sprache&l=de&l2=fr', 300);
  const s1 = await menuExport(page, '.view-compare', 'x-pdftext-a4');
  const ts = pdfText(s1.file);
  expect(ts).toContain('Art. 8 Abs. 2 SGK');
  expect(ts).toMatch(/franchissement|frontières/);
  // Formularvergleich (Vergleich mit Formularzeilen als Text)
  await nav(page, '#/vergleich?u=anx_V&a=s00&b=s08&l=de&cm=stand&sc=changed', 400);
  const f1 = await menuExport(page, '.view-compare', 'x-docx');
  const xf = docxXml(f1.buf);
  expect(xf).toContain('Formular');
  expect(xf).toContain('(J)');
  // weiteres Werk
  await nav(page, '#/chronik?w=ees&u=art_9&l=fr&ui=fr', 400);
  const e1 = await menuExport(page, '.view-chronik', 'x-pdftext-a4');
  expect(pdfText(e1.file)).toContain('art. 9, règlement EES');
  // Sammelkorb: zwei Karten als Word und als PDF mit Text
  await nav(page, '#/vergleich?w=sgk&u=art_8&k=p3.a&a=s00&b=s08&l=de&cm=stand&ui=de', 400);
  await page.locator('.view-compare .export-menu > button').first().click();
  await page.locator('#x-basket-a4').click();
  await nav(page, '#/lesen?w=sgk&u=art_8&k=p3.a.i&l=de', 400);
  await page.locator('.panel .export-menu > button').click();
  await page.locator('#x-basket-a4').click();
  await page.locator('#btn-basket').click();
  await expect(page.locator('.bk-item')).toHaveCount(2);
  const bw = await download(page, () => page.locator('#btn-basket-docx').click());
  const xb = docxXml(bw.buf);
  expect(xb).toContain('Art. 8 Abs. 3 Bst. a SGK');
  expect(xb).toContain('Art. 8 Abs. 3 Bst. a Ziff. i SGK');
  const bp = await download(page, () => page.locator('#btn-basket-pdftext').click());
  const tb = pdfText(bp.file);
  expect(tb).toContain('Art. 8 Abs. 3 Bst. a SGK');
  expect(tb).toContain('Art. 8 Abs. 3 Bst. a Ziff. i SGK');
  // Beispieldateien für die Sichtprüfung
  writeFileSync(join(OUT, 'beispiel-chronologie-tracked.docx'), d2.buf);
  writeFileSync(join(OUT, 'beispiel-vergleich-text.pdf'), c2.buf);
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
});

// ------------------------------------------------------------------ G Vorschau
test('G: Vorschau mit Beispiel-Dossier DTC: Spur Rat am geltenden SGK ändert Art. 2, 8, 8a, 8b und fügt Art. 8ba ein', async ({ page }) => {
  test.setTimeout(180000);
  const log = await open(page, '#/lesen?u=art_8&l=de');
  await page.locator('#btn-preview').click();
  await expect(page.locator('.pv-bar .notice-computed')).toContainText('hypothetisch, nicht amtlich');
  await page.locator('#pv-demo, .pv-demo-btn').first().click();
  expect(await page.evaluate(() => new URLSearchParams(location.hash.split('?')[1]).get('pv'))).toBe('d-2024-0670~council~latest');
  expect(hashParam(page, 'l')).toBe('en');
  const chips = page.locator('.pv-chips');
  await expect(chips).toContainText('Art. 8ba', { timeout: 60000 });
  const units = await chips.locator('a').allInnerTexts();
  for (const u of ['Art. 2', 'Art. 8', 'Art. 8a', 'Art. 8b']) expect(units.map((x) => x.replace(/\s+neu$/, '').trim())).toContain(u);
  await expect(chips.locator('a', { hasText: 'Art. 8ba' })).toContainText('neu');
  // geänderte Blöcke gekennzeichnet (Herkunft preview:…), Text auf Englisch
  await expect(page.locator('.legal-read .mark-code', { hasText: 'Vorschau' }).first()).toBeVisible();
  await expect(page.locator('.legal-read')).toHaveAttribute('lang', 'en');
  // nicht angewandte Anweisungen mit Grund
  const un = page.locator('.pv-unres');
  if (await un.count()) { await un.locator('summary').click(); await expect(un.locator('li').first()).toBeVisible(); }
  // neue Einheit lesen
  await chips.locator('a', { hasText: 'Art. 8ba' }).click();
  await expect(page).toHaveURL(/u=art_8ba/);
  await expect(page.locator('.legal-read .blk').first()).toBeVisible();
  // Vergleich: Basis gegen Vorschau
  await nav(page, '#/vergleich?u=art_8&cm=vorschau&pv=d-2024-0670~council~latest&l=en', 1500);
  await expect(page.locator('.cmp .cmp-row.st-changed, .cmp .cmp-row.st-ins').first()).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.cmp .cmp-headrow')).toContainText('Vorschau: Rat');
  // Vergleich zweier Spuren (Kommission gegen Rat)
  await nav(page, '#/vergleich?u=art_8&cm=vorschau&pv=d-2024-0670~com~latest&pv2=council~latest&l=en', 1500);
  await expect(page.locator('.cmp .cmp-headrow')).toContainText('Vorschau: Kommission', { timeout: 60000 });
  await expect(page.locator('.cmp .cmp-headrow')).toContainText('Vorschau: Rat');
  // Export der Vorschaukarte (Word, PDF mit Text)
  const w = await menuExport(page, '.view-compare', 'x-docx');
  expect(docxXml(w.buf)).toContain('Art. 8 SGK');
  const p = await menuExport(page, '.view-compare', 'x-pdftext-a4');
  expect(pdfText(p.file)).toMatch(/hypothetisch|Vorschau/);
  const pp = await menuExport(page, '.view-compare', 'x-png-a4');
  expect(pp.buf.subarray(0, 4).toString('hex')).toBe('89504e47');
  writeFileSync(join(SHOTS, 'e3-export-vorschau-vergleich.png'), pp.buf);
    // Chronologie mit Vorschau als letztem Schritt; Deep Link funktioniert nach Neuladen
  await page.goto(APP + '#/chronik?u=art_8&pv=d-2024-0670~council~latest&l=en');
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
  await expect(page.locator('.chron .step').last()).toContainText('Vorschau', { timeout: 60000 });
  // FR
  await page.goto(APP + '#/lesen?u=art_8&pv=d-2024-0670~council~latest&l=en&ui=fr');
  await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
  await expect(page.locator('.pv-bar')).toContainText('hypothétique', { timeout: 60000 });
  expect(await missingKeys(page)).toEqual([]);
  expect(log.errors).toEqual([]);
  expect(log.requests).toEqual([]);
});

// ------------------------------------------------------------------ Layout, Grösse, Screenshots
const STATES = [
  ['werk-ees-lesen', '#/lesen?w=ees&u=art_9&l=de'],
  ['werk-vis-uebersicht', '#/uebersicht?w=vis'],
  ['werk-etias-fassung-datum', '#/lesen?w=etias&u=art_17&m=datum&d=2022-01-01'],
  ['verweise-panel', '#/lesen?u=art_6&k=p1&l=de'],
  ['chronik-begruendung', '#/chronik?u=art_8&k=p3.a.i&l=de', ['details.rat summary', '.affected button']],
  ['datum-hinweise', '#/lesen?u=art_8&m=datum&d=2026-01-15&l=de'],
  ['uebersicht-anwendbarkeit', '#/uebersicht', [], '#app-h'],
  ['formular-text', '#/lesen?u=anx_V&l=de&s=s08', ['.legal-read .form-switch button:nth-child(2)']],
  ['formular-vergleich', '#/vergleich?u=anx_V&a=s00&b=s08&l=de&cm=stand&sc=changed'],
  ['vorschau-lesen', '#/lesen?u=art_8&pv=d-2024-0670~council~latest&l=en&red=1'],
  ['vorschau-vergleich', '#/vergleich?u=art_8&cm=vorschau&pv=d-2024-0670~com~latest&pv2=council~latest&l=en'],
  ['info-werke', '#/info?w=iop', [], '#wk-h'],
  ['anleitung-neu', '#/anleitung?sec=vorschau'],
  ['exportmenue', '#/lesen?u=art_8&k=p3.a.i&l=de', ['.panel .export-menu > button']],
];

for (const width of [1024, 1280, 1440, 1920]) {
  test(`Layout Etappe 3 bei ${width} px (DE und FR): kein Überlauf, keine Überlappung, Schaltflächen`, async ({ page }) => {
    test.setTimeout(300000);
    await page.setViewportSize({ width, height: 900 });
    const log = await open(page, '#/uebersicht');
    const issues = [];
    for (const ui of ['de', 'fr']) for (const [name, hash, clicks = [], scroll] of STATES) {
      await page.goto(APP + hash + '&ui=' + ui);
      await page.waitForFunction(() => window.__sgk && window.__sgk.ready);
      await page.waitForTimeout(hash.includes('pv=') ? 1500 : 400);
      for (const c of clicks) { const el = page.locator(c).first(); if (await el.count()) { await el.click(); await page.waitForTimeout(300); } }
      if (scroll) await page.locator(scroll).first().scrollIntoViewIfNeeded();
      for (const x of await page.evaluate(layoutCheck)) issues.push(`${ui} ${name}: ${x}`);
      for (const x of await page.evaluate(buttonCheck)) issues.push(`${ui} ${name}: Schaltfläche ${x}`);
      for (const k of await missingKeys(page)) issues.push(`${ui} ${name}: Schlüssel ${k}`);
      if (width === 1440 || ((width === 1024 || width === 1920) && /vorschau|hinweise|werk-ees|formular-text|exportmenue/.test(name))) {
        await page.screenshot({ path: join(SHOTS, `e3-${width}-${ui}-${name}.png`) });
      }
    }
    expect(issues).toEqual([]);
    expect(log.errors).toEqual([]);
  });
}

test('Dateigrösse ≤ 9 MB, Werke komprimiert eingebettet', async () => {
  const size = statSync(join(ROOT, 'dist/sgk-navigator.html')).size;
  console.log('Grösse dist/sgk-navigator.html:', (size / 1024 / 1024).toFixed(2), 'MB');
  expect(size).toBeLessThanOrEqual(9 * 1024 * 1024);
  const html = readFileSync(join(ROOT, 'dist/sgk-navigator.html'), 'utf8');
  for (const w of ['ees', 'etias', 'vis', 'iop']) expect(html).toContain(`id="work-${w}" data-enc="gz64"`);
});
