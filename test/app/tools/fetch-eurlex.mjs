// Lädt EUR-Lex-HTML-Fassungen mit Chrome (EUR-Lex verlangt eine Browser-Prüfung) und speichert den Antworttext
// unverändert, wie Chrome «Webseite, nur HTML» ihn speichert. Ziel: test/app/fixtures-live/ (nicht im Paket).
// Aufruf: node test/app/tools/fetch-eurlex.mjs DE:02016R0399-20240710 FR:02017R2226-20260612 …
//         Zusatz «:dom» (z. B. DE:02017R2226-20260612:dom) speichert zusätzlich die serialisierte Seite wie «Webseite, komplett»
//         nach test/app/fixtures-live/variants/<celex>_<lang>.dom.html.
// Für die Tests benötigt: DE:02016R0399-20240710 DE:02016R0399-20251012 FR:02016R0399-20251012 DE:02017R2226-20260612:dom
//   FR:02017R2226-20260612 DE:32017R2225 DE:32016R0399
// Zusätzlich für den Äquivalenztest (test/app/equiv.test.mjs, equiv.spec.mjs, stored.spec.mjs): EN:02016R0399-20251012
//   EN:02017R2226-20260612 DE:02018R1240-20260612 FR:02018R1240-20260612 EN:02018R1240-20260612 DE:02008R0767-20260612
//   FR:02008R0767-20260612 EN:02008R0767-20260612 DE:02019R0817-20260612 FR:02019R0817-20260612 EN:02019R0817-20260612
// Netz über HTTPS_PROXY (falls gesetzt).
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = join(ROOT, 'test/app/fixtures-live');
mkdirSync(OUT, { recursive: true });
const items = process.argv.slice(2).map((a) => { const [l, c, v] = a.split(':'); return { lang: l.toUpperCase(), celex: c, dom: v === 'dom' }; });
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', proxy });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();
for (const { lang, celex, dom } of items) {
  const url = `https://eur-lex.europa.eu/legal-content/${lang}/TXT/HTML/?uri=CELEX:${celex}`;
  let body = null;
  for (let i = 0; i < 4 && !body; i++) {
    const resp = await page.goto(url, { waitUntil: 'load', timeout: 120000 });
    await page.waitForTimeout(1500);
    // nach der WAF-Prüfung lädt die Seite neu; dann die eigentliche Antwort holen
    const r2 = resp && resp.status() === 200 ? resp : await page.waitForResponse((r) => r.url().startsWith(url.split('?')[0]) && r.status() === 200, { timeout: 60000 }).catch(() => null);
    if (r2) { const b = await r2.body(); if (b.length > 5000) body = b; }
  }
  if (!body) { console.error('nicht geladen:', url); continue; }
  const f = join(OUT, `${celex}_${lang}.html`);
  writeFileSync(f, body);
  console.log(f, body.length);
  if (dom) {
    mkdirSync(join(OUT, 'variants'), { recursive: true });
    const g = join(OUT, 'variants', `${celex}_${lang}.dom.html`);
    writeFileSync(g, await page.content());
    console.log(g);
  }
}
await browser.close();
