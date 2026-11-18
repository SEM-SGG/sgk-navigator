// Playwright-Konfiguration für die UI-Tests (Chrome, file://).
//
// Browser: SGK_CHROME=<Pfad> (eigenes Chrome), SGK_CHROME=bundled (Chromium von «npx playwright install chromium»);
// ohne Angabe /usr/bin/google-chrome, falls vorhanden, sonst ebenfalls das Chromium von Playwright.
// Netz: über HTTPS_PROXY, falls gesetzt (nur für die Live-Tests gegen den SPARQL-Endpunkt); ohne HTTPS_PROXY direkt.
// Auswahl: Tests mit Tag @netz brauchen Netz, Tests mit Tag @daten Dateien ausserhalb des Repos (raw/, raw-neg/,
// test/app/fixtures-live/). Die CI-Auswahl (npm run test:app:ci) lässt beide weg; fehlen die Dateien, überspringen sich die
// Tests auch selbst.
import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = process.env.SGK_CHROME === 'bundled' ? undefined
  : process.env.SGK_CHROME || (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.mjs/,
  timeout: 120000,
  expect: { timeout: 15000 },
  workers: 2,
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  globalSetup: './global-setup.mjs',
  use: {
    browserName: 'chromium',
    ...(chrome ? { launchOptions: { executablePath: chrome } } : {}),
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    // Netz über den Proxy der Umgebung (Live-Tests gegen den SPARQL-Endpunkt); ohne HTTPS_PROXY direkt
    ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' }, ignoreHTTPSErrors: true } : {}),
  },
});
