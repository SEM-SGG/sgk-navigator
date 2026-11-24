// Prüft, ob die Produktdokumentation (docs/sgk-navigator-dokumentation.html) die Version des obersten Abschnitts von
// CHANGELOG.md nennt. Läuft in «CI», im Workflow «Release» vor der Veröffentlichung und beim Einbau neuer Fassungen.
// Aufruf im Wurzelverzeichnis:
//   node scripts/check-dokumentation.mjs         prüft; endet mit Fehler und nennt jede abweichende Stelle
//   node scripts/check-dokumentation.mjs --fix   setzt die Version aus CHANGELOG.md an allen Stellen
//   node scripts/check-dokumentation.mjs --version <v>   prüft gegen <v> statt gegen den obersten Abschnitt (Workflow «Release»)
import { readFileSync, writeFileSync } from 'node:fs';
import { latestVersion } from './release/changelog.mjs';
import { DOC_FILE, checkDocVersion, setDocVersion, docVersionMessage } from './release/dokumentation.mjs';

const root = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
try {
  const [arg, given] = process.argv.slice(2);
  const version = arg === '--version' ? given : latestVersion(read('CHANGELOG.md'));
  if (!version) throw new Error('CHANGELOG.md: kein Abschnitt «## JJJJ.MM.TT (Datum)» gefunden.');
  const html = read(DOC_FILE);
  if (arg === '--fix') {
    const out = setDocVersion(html, version);
    if (out !== html) writeFileSync(new URL(DOC_FILE, root), out);
    console.log(`${DOC_FILE}: Version ${version} an ${checkDocVersion(out, version).found} Stellen gesetzt.`);
  } else if (arg && arg !== '--version') {
    throw new Error(`Unbekannte Option ${arg}. Aufruf: node scripts/check-dokumentation.mjs [--fix]`);
  } else {
    const r = checkDocVersion(html, version);
    if (!r.ok) { console.error(docVersionMessage(r, version)); process.exit(1); }
    console.log(`${DOC_FILE}: Version ${version} an allen ${r.found} Stellen.`);
  }
} catch (e) { console.error(e.message); process.exit(1); }
