// Hilfsskript: Screenshots einzelner Hashes. node test/app/shot.mjs <name> <hash> [breite]
import { chromium } from 'playwright';
import { resolve } from 'node:path';
const [name, hash = '', width = '1440', file = 'dist/sgk-navigator.html'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) errs.push('request: ' + r.url()); });
await page.goto('file://' + resolve(file) + hash);
await page.waitForFunction(() => window.__sgk && window.__sgk.ready, null, { timeout: 30000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `test/app/screenshots/${name}.png` });
console.log(errs.join('\n') || 'keine Fehler');
await browser.close();
