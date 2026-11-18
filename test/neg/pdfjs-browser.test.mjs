// Prüft, dass pdf.js in einer einzelnen HTML-Datei unter file:// ohne separate Worker-Datei läuft (Chrome via Playwright).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildDemo } from './browser/build.mjs';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const OUT = path.join(ROOT, 'test/neg/out');
const PDF = path.join(ROOT, 'raw-neg/WK-4049-2026.pdf');
const CHROME = '/usr/bin/google-chrome';
let chromium = null;
try { chromium = createRequire('/opt/npm-tools/node_modules/')('playwright').chromium; } catch { try { chromium = (await import('playwright')).chromium; } catch { chromium = null; } }
const skip = !chromium ? 'playwright fehlt' : !fs.existsSync(CHROME) ? 'Chrome fehlt' : !fs.existsSync(PDF) ? 'raw-neg/WK-4049-2026.pdf fehlt' : false;

for (const variant of ['blob', 'main']) {
  test(`pdf.js offline in Einzeldatei (${variant})`, { skip, timeout: 120000 }, async () => {
    const html = path.join(OUT, `pdfjs-${variant}.html`);
    const size = await buildDemo(path.join(ROOT, `test/neg/browser/entry-${variant}.mjs`), html);
    fs.writeFileSync(path.join(OUT, `pdfjs-${variant}.size.json`), JSON.stringify(size));
    const browser = await chromium.launch({ executablePath: CHROME, args: ['--allow-file-access-from-files'] });
    try {
      const page = await browser.newPage();
      const requests = [];
      page.on('request', (r) => { if (!/^(file|blob|data):/.test(r.url())) requests.push(r.url()); });
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto('file://' + html);
      await page.waitForFunction(() => typeof window.runNeg === 'function', null, { timeout: 30000 });
      const b64 = fs.readFileSync(PDF).toString('base64');
      const res = await page.evaluate((b) => window.runNeg(b), b64);
      assert.equal(res.href, 'file:');
      assert.equal(res.mode, variant === 'blob' ? 'blob' : 'main');
      assert.equal(res.rows, 46);
      assert.deepEqual(res.cols, ['Commission Proposal', 'EP Mandate', 'Council Mandate', 'Draft compromise']);
      assert.ok(res.progress > 0);
      assert.deepEqual(requests, [], 'keine Netzwerkzugriffe');
      assert.deepEqual(errors, []);
      fs.writeFileSync(path.join(OUT, `pdfjs-${variant}.result.json`), JSON.stringify({ ...res, size }, null, 1));
    } finally { await browser.close(); }
  });
}

const BIG = path.join(ROOT, 'raw-neg/ST-9796-2023.pdf');
test('Leistung: 377-seitige Vier-Spalten-Tabelle im Browser unter 30 s (blob)', { skip: skip || (!fs.existsSync(BIG) && 'raw-neg/ST-9796-2023.pdf fehlt'), timeout: 180000 }, async () => {
  const html = path.join(OUT, 'pdfjs-blob.html');
  if (!fs.existsSync(html)) await buildDemo(path.join(ROOT, 'test/neg/browser/entry-blob.mjs'), html);
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    const page = await browser.newPage();
    await page.goto('file://' + html);
    await page.waitForFunction(() => typeof window.runNeg === 'function', null, { timeout: 30000 });
    const res = await page.evaluate((b) => window.runNeg(b), fs.readFileSync(BIG).toString('base64'));
    fs.writeFileSync(path.join(OUT, 'pdfjs-perf.result.json'), JSON.stringify(res, null, 1));
    assert.equal(res.rows, 797);   // 2 leere Zeilen der Quelle übersprungen
    assert.ok(res.ms < 30000, `Dauer ${res.ms} ms`);
  } finally { await browser.close(); }
});
