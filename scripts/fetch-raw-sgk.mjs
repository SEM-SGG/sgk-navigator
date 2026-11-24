// Lädt die EUR-Lex-Dateien des Schengener Grenzkodex, die scripts/build-data.mjs, die Begründung (scripts/rationale/) und die
// Formulare (scripts/forms/) brauchen, nach raw/ (nur Daten, nichts daraus ausführen). Vorhandene Dateien werden übersprungen.
// Die weiteren Werke lädt scripts/build-work.mjs selbst. Quelle: EUR-Lex, sonst Cellar (scripts/lib-fetch.mjs).
// Aufruf: node scripts/fetch-raw-sgk.mjs [--dir raw] [--only 02016R0399-20251012] [--langs de,fr,en] [--also <CELEX,…>]
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchDoc, appendFetchLog } from './lib-fetch.mjs';
import { readFileSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
// Fassungen des SGK (Stände s00–s07 fest, ab s08 aus data/sgk-fassungen.json) und Änderungsakte (Erwägungsgründe, Formulare,
// ETIAS-Ergänzung)
const FASSUNGEN = JSON.parse(readFileSync(resolve(ROOT, 'data/sgk-fassungen.json'), 'utf8')).stages.map((s) => s.celex);
export const SGK_RAW = [
  '32016R0399', '02016R0399-20161006', '02016R0399-20170407', '02016R0399-20240710', ...FASSUNGEN,
  '32016R1624', '32017R0458', '32017R2225', '32017R2225R(01)', '32018R1240', '32018R1240R(03)', '02018R1240-20260612', '32019R0817', '32021R1134', '32024R1717', '32024R1717R(01)',
];
const dir = resolve(ROOT, opt('--dir', 'raw'));
const langs = opt('--langs', 'de,fr,en').split(',');
const list = opt('--only', null) ? opt('--only').split(',') : [...SGK_RAW, ...(opt('--also', null) ? opt('--also').split(',') : [])];
mkdirSync(dir, { recursive: true });
mkdirSync(resolve(ROOT, 'scripts/out'), { recursive: true });
const log = [];
let missing = 0;
for (const celex of list) for (const lang of langs) {
  const r = fetchDoc(dir, celex, lang, log);
  if (r.status === 'fehlt') missing++;
  console.log(`${celex} ${lang.toUpperCase()}: ${r.status}`);
}
appendFetchLog(resolve(ROOT, 'scripts/out/fetch-log.json'), log);
if (missing) console.log(`${missing} Datei(en) nicht ladbar (z. B. Sprachfassung gibt es nicht). Siehe scripts/out/fetch-log.json.`);
