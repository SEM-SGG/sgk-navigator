// Node-Hilfen für Skripte und Tests (nicht Teil der Bibliothek): pdf.js laden, PDFs mit Zwischenspeicher parsen.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseFourColumnPdf } from '../../src/neg/pdf-fourcol.js';

export { pdfjs };
export const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
export const RAW = path.join(ROOT, 'raw-neg');
const CACHE = path.join(ROOT, 'scripts/neg/out/cache');

export function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

/** Vier-Spalten-PDF parsen (Ergebnis zwischengespeichert, Schlüssel: Datei-Hash + Parser-Quelltext) */
export async function parsePdfCached(file, { force = false } = {}) {
  const buf = fs.readFileSync(file);
  const parserSrc = ['pdf-fourcol.js', 'pdf-extract.js', 'paths.js', 'util.js'].map((f) => fs.readFileSync(path.join(ROOT, 'src/neg', f), 'utf8')).join('\n');
  const key = sha256(Buffer.concat([buf, Buffer.from(parserSrc)])).slice(0, 24);
  const cf = path.join(CACHE, `${path.basename(file)}.${key}.json`);
  if (!force && fs.existsSync(cf)) return JSON.parse(fs.readFileSync(cf, 'utf8'));
  const parsed = await parseFourColumnPdf(new Uint8Array(buf), { pdfjs });
  parsed.meta.file = { name: path.basename(file), size: buf.length, sha256: sha256(buf), type: 'pdf' };
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(cf, JSON.stringify(parsed));
  return parsed;
}

/** Standard-Zuordnung Spalte -> Spur aus suggestedTrack */
export function defaultMapping(parsed) {
  const m = {};
  for (const c of parsed.columns) m[c.index] = c.suggestedTrack || null;
  return m;
}
