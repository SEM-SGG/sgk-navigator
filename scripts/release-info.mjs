// Angaben für eine Release aus CHANGELOG.md (oberster Abschnitt = Version). Ohne Abschnitt im Changelog keine Release.
// Aufruf im Wurzelverzeichnis:
//   node scripts/release-info.mjs                    prüft CHANGELOG.md und nennt die Version
//   node scripts/release-info.mjs --version          Version des obersten Abschnitts, zum Beispiel 2026.12.02
//   node scripts/release-info.mjs --notes            Abschnitt dieser Version (Markdown, Text der Release)
//   node scripts/release-info.mjs --has <version>    endet ohne Fehler, wenn CHANGELOG.md einen Abschnitt zu <version> hat
// Endet mit Fehler und deutscher Meldung, wenn CHANGELOG.md nicht stimmt (Form der Version, leerer Abschnitt, Reihenfolge).
import { readFileSync } from 'node:fs';
import { checkChangelog, changelogSection } from './release/changelog.mjs';
import { ASSET } from '../src/app/config/update-source.js';

const md = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const fail = (msg) => { console.error(msg); process.exit(1); };
const r = checkChangelog(md);
const [arg, val] = process.argv.slice(2);
if (arg === '--has') {
  if (!changelogSection(md, val || '')) fail(`CHANGELOG.md: Abschnitt «## ${val} (Datum)» fehlt oder ist leer. Ohne Abschnitt im Changelog gibt es keine Release.`);
  console.log(`CHANGELOG.md: Abschnitt ${val} vorhanden.`);
  process.exit(0);
}
if (!r.ok) fail(r.errors.join('\n'));
if (arg === '--version') console.log(r.version);
else if (arg === '--notes') {
  const s = changelogSection(md, val || r.version);
  if (!s) fail(`CHANGELOG.md: Abschnitt ${val} fehlt.`);
  console.log(s.de + (s.fr ? `\n\n**Français**\n\n${s.fr}` : ''));
} else if (arg) fail(`Unbekannte Option ${arg}.`);
else console.log(`Version ${r.version}: Abschnitt in CHANGELOG.md vorhanden, Datei ${ASSET}.`);
