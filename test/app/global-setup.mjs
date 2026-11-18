// Baut die App und Testvarianten (Upload-Tests, SPEC §5.5; Äquivalenz; Hinweis auf neue Versionen).
// Alle Varianten ausser denen für den Versionshinweis ohne Quelle für neue Versionen (--update-source none), damit die
// bestehenden Tests «keine Netzanfragen» weiterhin gelten. Der Auslieferungsbuild (npm run build) nutzt die Vorgabe aus
// src/app/config/update-source.js.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export default function () {
  if (process.env.SKIP_BUILD) return;
  const run = (args) => console.log(execFileSync('node', ['build.mjs', ...args], { cwd: root, encoding: 'utf8' }).trim());
  const off = ['--update-source', 'none'];
  run([...off]);
  run(['--drop-stage', 'last-consolidated', '--out', 'test/app/out/sgk-navigator-upload.html', ...off]);
  run(['--drop-work-stage', 'ees:last', '--out', 'test/app/out/sgk-navigator-upload-ees.html', ...off]);
  // gemeinsame Ablage zweier Werke (test/app/update.spec.mjs) und doppelte Stände (test/app/stored.spec.mjs): ohne letzte
  // konsolidierte Fassung von SGK und EES-VO
  run(['--drop-stage', 'last-consolidated', '--drop-work-stage', 'ees:last', '--out', 'test/app/out/sgk-navigator-upload-2.html', ...off]);
  // Äquivalenz Upload ↔ zentraler Build (test/app/equiv.spec.mjs): ohne jüngste Fassung aller fünf Werke
  run(['--drop-stage', 'last-consolidated', '--drop-work-stage', 'ees:last,etias:last,vis:last,iop:last', '--out', 'test/app/out/sgk-navigator-upload-all.html', ...off]);
  // Hinweis auf neue Versionen (test/app/version.spec.mjs): Quelle gesetzt, Version fest
  run(['--update-source', 'github-release:sgg-test/sgk-navigator-test', '--version', '2026.11.18', '--out', 'test/app/out/sgk-navigator-update.html']);
  run(['--update-source', 'manifest:https://example.org/sgk/version.json', '--version', '2026.11.18', '--out', 'test/app/out/sgk-navigator-update-manifest.html']);
  // Vorgabe aus src/app/config/update-source.js (Manifest auf GitHub Pages SEM-SGG, ersatzweise Releases-API), wie der Auslieferungsbuild
  run(['--update-source', 'default', '--version', '2026.11.18', '--out', 'test/app/out/sgk-navigator-update-default.html']);
}
