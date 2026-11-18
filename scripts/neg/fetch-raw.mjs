// Lädt die amtlich veröffentlichten Dokumente nach raw-neg/ (nur Daten; raw-neg/ ist nicht im Git).
// Quellen: öffentliches Ratsregister (data.consilium.europa.eu) und EUR-Lex. Liste und Verwendung: data/NEG_NOTES.md.
// Aufruf: node scripts/neg/fetch-raw.mjs   (vorhandene Dateien werden übersprungen)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const RAW = path.resolve(new URL('../../raw-neg', import.meta.url).pathname);
const COUNCIL = ['ST-14288-2023', 'ST-10426-2022', 'ST-9937-2022', 'ST-9713-2022', 'ST-9377-2022', 'ST-6331-2024', 'ST-6568-2024', 'ST-9156-2024',
  'ST-8413-2023', 'ST-10863-2023', 'WK-13716-2023', 'WK-16364-2023', 'WK-16999-2023', 'ST-16759-2023', 'ST-16760-2023', 'WK-2527-2024',
  'WK-1588-2024', 'ST-10613-2025', 'ST-7749-2025', 'ST-8390-2023', 'ST-9796-2023', 'ST-15634-2025', 'WK-3948-2026', 'WK-4049-2026'];
const EURLEX = ['52021PC0891', '52024PC0670'];
fs.mkdirSync(RAW, { recursive: true });
const get = (url, file) => {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return console.log('vorhanden', path.basename(file));
  execFileSync('curl', ['-sS', '-L', '--fail', '-o', file, url], { stdio: 'inherit' });
  console.log('geladen', path.basename(file), fs.statSync(file).size);
};
for (const d of COUNCIL) get(`https://data.consilium.europa.eu/doc/document/${d}-INIT/en/pdf`, path.join(RAW, `${d}.pdf`));
for (const c of EURLEX) get(`https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${c}`, path.join(RAW, `${c}_EN.html`));
