// Browser: mit esbuild gebündelte Seite (IIFE, Externals wie build.mjs) unter file:// ohne Netzwerkzugriff.
// Alle Funktionen laufen; DOCX und PDF byte-gleich mit Node (feste Datumsangabe), Zwischenablage gleich; Leistung 300 Blöcke.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as X from '../../src/export/index.js';
import { fixtures, perfCard, ROOT, OUT } from './lib.mjs';

const PW = '/opt/npm-tools/node_modules/playwright';
const CHROME = '/usr/bin/google-chrome';
const ok = existsSync(PW) && existsSync(CHROME);
const DIR = join(OUT, 'browser');
const OPTS = { date: '2026-11-12', author: 'SGK-Navigator Test' };
const b64 = (u8) => Buffer.from(u8).toString('base64');

test('Browser (file://, ohne Netz): gleiche Ergebnisse wie Node, Leistung', { skip: !ok && 'Playwright oder Chrome fehlt', timeout: 300000 }, async () => {
  mkdirSync(DIR, { recursive: true });
  const FX = fixtures();
  const perf = await perfCard(300);
  const js = (await build({
    stdin: { contents: "import * as X from './src/export/index.js'; window.SGKExport = X;", resolveDir: ROOT, loader: 'js' },
    bundle: true, write: false, format: 'iife', minify: true, legalComments: 'none', charset: 'utf8',
    target: ['chrome110', 'firefox115', 'safari16.4', 'edge110'], external: ['html2canvas', 'dompurify', 'canvg', 'core-js'], logLevel: 'error',
  })).outputFiles[0].text;
  const data = JSON.stringify({ cards: FX.map((f) => f.card), names: FX.map((f) => f.name), perf, opts: OPTS }).replace(/</g, '\\u003c');
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<title>Export-Test</title></head><body><p id="s">läuft</p>
<script id="data" type="application/json">${data}</script>
<script>${js.replace(/<\/script/gi, '<\\/script')}</script>
<script>
(function () {
  const D = JSON.parse(document.getElementById('data').textContent);
  const X = window.SGKExport;
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const out = {};
  const perfRun = () => {
    const t = {};
    let t0 = performance.now(); X.cardToDocx(D.perf, { ...D.opts, redline: 'format' }); t.docxFormat = performance.now() - t0;
    t0 = performance.now(); X.cardToDocx(D.perf, { ...D.opts, redline: 'tracked' }); t.docxTracked = performance.now() - t0;
    t0 = performance.now(); X.cardToPdf(D.perf, { format: 'a4', date: D.opts.date }); t.pdfA4 = performance.now() - t0;
    t0 = performance.now(); X.cardToPdf(D.perf, { format: '16x9', date: D.opts.date }); t.pdf169 = performance.now() - t0;
    t0 = performance.now(); X.cardToClipboard(D.perf); t.clip = performance.now() - t0;
    return t;
  };
  try {
    out.__perf = perfRun();   // kalt: erster Aufruf, Schriften werden dabei dekodiert
    D.cards.forEach((c, i) => {
      const n = D.names[i];
      out[n] = {
        valid: X.validateCard(c).ok,
        docxFormat: b64(X.cardToDocx(c, { ...D.opts, redline: 'format' })),
        docxTracked: b64(X.cardToDocx(c, { ...D.opts, redline: 'tracked' })),
        pdfA4: b64(X.cardToPdf(c, { format: 'a4', date: D.opts.date })),
        pdf169: b64(X.cardToPdf(c, { format: '16x9', date: D.opts.date })),
        clip: X.cardToClipboard(c),
      };
    });
    out.__basketDocx = b64(X.cardsToDocx(D.cards, { ...D.opts, redline: 'tracked' }));
    out.__basketPdf = b64(X.cardsToPdf(D.cards, { format: 'a4', date: D.opts.date }));
    out.__perfWarm = perfRun();
    window.__result = out;
    document.getElementById('s').textContent = 'fertig';
  } catch (e) { window.__error = String(e && e.stack || e); document.getElementById('s').textContent = 'Fehler'; }
})();
</script></body></html>`;
  const page = join(DIR, 'export-test.html');
  writeFileSync(page, html);
  writeFileSync(join(DIR, 'bundle.min.js'), js);

  const { chromium } = createRequire(import.meta.url)(PW);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const ctx = await browser.newContext({ offline: true });
    const requests = [];
    await ctx.route('**/*', (route) => { const u = route.request().url(); if (u.startsWith('file:')) return route.continue(); requests.push(u); return route.abort(); });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on('pageerror', (e) => errors.push(String(e)));
    pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await pg.goto(pathToFileURL(page).href);
    await pg.waitForFunction(() => window.__result || window.__error, null, { timeout: 240000 });
    const err = await pg.evaluate(() => window.__error || null);
    assert.equal(err, null);
    const res = await pg.evaluate(() => window.__result);
    assert.deepEqual(requests, [], 'Netzwerkzugriffe');
    assert.deepEqual(errors, [], 'Fehler in der Konsole');
    const lines = [];
    for (const { name, card } of FX) {
      const r = res[name];
      assert.ok(r.valid, name);
      assert.equal(r.docxFormat, b64(X.cardToDocx(card, { ...OPTS, redline: 'format' })), `${name}: DOCX format`);
      assert.equal(r.docxTracked, b64(X.cardToDocx(card, { ...OPTS, redline: 'tracked' })), `${name}: DOCX tracked`);
      assert.equal(r.pdfA4, b64(X.cardToPdf(card, { format: 'a4', date: OPTS.date })), `${name}: PDF A4`);
      assert.equal(r.pdf169, b64(X.cardToPdf(card, { format: '16x9', date: OPTS.date })), `${name}: PDF 16:9`);
      assert.deepEqual(r.clip, X.cardToClipboard(card), `${name}: Zwischenablage`);
      lines.push(`${name}: DOCX format/tracked, PDF A4/16:9, Zwischenablage byte-gleich mit Node`);
    }
    assert.equal(res.__basketDocx, b64(X.cardsToDocx(FX.map((f) => f.card), { ...OPTS, redline: 'tracked' })));
    assert.equal(res.__basketPdf, b64(X.cardsToPdf(FX.map((f) => f.card), { format: 'a4', date: OPTS.date })));
    const t = res.__perf;
    const fmt = (x) => `DOCX format ${x.docxFormat.toFixed(0)} ms, DOCX tracked ${x.docxTracked.toFixed(0)} ms, PDF A4 ${x.pdfA4.toFixed(0)} ms, PDF 16:9 ${x.pdf169.toFixed(0)} ms, Zwischenablage ${x.clip.toFixed(0)} ms`;
    lines.push(`Leistung 300 Blöcke (Chrome headless), erster Aufruf: ${fmt(t)}`);
    lines.push(`Leistung 300 Blöcke, wiederholt: ${fmt(res.__perfWarm)}`);
    lines.push(`Bundle (IIFE, minifiziert): ${js.length} Zeichen`);
    writeFileSync(join(DIR, 'report.txt'), lines.join('\n') + '\n');
    assert.ok(t.docxFormat < 2000 && t.docxTracked < 2000, `DOCX zu langsam: ${JSON.stringify(t)}`);
    assert.ok(t.pdfA4 < 5000 && t.pdf169 < 5000, `PDF zu langsam: ${JSON.stringify(t)}`);
  } finally {
    await browser.close();
  }
});

test('Browser: Zwischenablage unter file:// (ClipboardItem mit text/html und text/plain, zurückgelesen)', { skip: !ok && 'Playwright oder Chrome fehlt', timeout: 120000 }, async () => {
  const card = fixtures().find((f) => f.name === 'chronology-art8-3a-ii-de').card;
  const { html, text } = X.cardToClipboard(card);
  const page = join(DIR, 'clipboard-test.html');
  mkdirSync(DIR, { recursive: true });
  writeFileSync(page, '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><button id="b">Kopieren</button></body></html>');
  const { chromium } = createRequire(import.meta.url)(PW);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const ctx = await browser.newContext({ offline: true });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    const pg = await ctx.newPage();
    await pg.goto(pathToFileURL(page).href);
    assert.equal(await pg.evaluate(() => window.isSecureContext), true);
    await pg.click('#b');
    const got = await pg.evaluate(async ({ html, text }) => {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      const out = {};
      for (const it of await navigator.clipboard.read()) for (const t of it.types) out[t] = await (await it.getType(t)).text();
      return out;
    }, { html, text });
    assert.equal(got['text/plain'], text);
    // Chrome bereinigt HTML beim Lesen; Redline-Auszeichnung und Wortlaut müssen erhalten bleiben
    assert.match(got['text/html'], /<ins style="text-decoration:\s*underline;[^"]*">, die erforderliche Reisegenehmigung<\/ins>/);
    assert.match(got['text/html'], /<del style="text-decoration:\s*line-through;[^"]*">eingehende Prüfung, ob das Reisedokument Fälschungs- oder Verfälschungsmerkmale aufweist;<\/del>/);
  } finally {
    await browser.close();
  }
});
