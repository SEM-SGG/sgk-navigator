// Wortlauttreue von parseTextPdf: Wörter aller Absätze (inkl. angehängter Fussnoten) gegen pdftotext der Seiten ab
// "ANNEX" (unabhängig: Poppler), ohne Zeilen, die auf ≥30 % der Seiten wiederkehren (Kopf-/Fusszeilen, Ziffern normalisiert).
// Abweichungen der Reihenfolge (Fussnoten stehen im PDF am Seitenende, im Ergebnis beim Absatz) zählen als nicht gemeinsam.
// Aufruf: node scripts/neg/validate-text.mjs raw-neg/ST-6331-2024.pdf …
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { diffArrays } from 'diff';
import { parseTextPdf } from '../../src/neg/pdf-text.js';
import { words } from '../../src/neg/util.js';

const out = [];
for (const f of process.argv.slice(2)) {
  const p = await parseTextPdf(new Uint8Array(fs.readFileSync(f)), { pdfjs });
  const txt = execFileSync('pdftotext', ['-f', String(p.stats.firstPage), f, '-'], { maxBuffer: 1 << 28 }).toString('utf8');
  const pages = txt.split('\f');
  const key = (l) => l.trim().replace(/\d+/g, '#');
  const freq = new Map();
  for (const pg of pages) for (const l of new Set(pg.split('\n').map(key))) if (l) freq.set(l, (freq.get(l) || 0) + 1);
  const keep = pages.map((pg) => pg.split('\n').filter((l) => l.trim() && (freq.get(key(l)) || 0) < Math.max(3, pages.length * 0.3)).join('\n')).join('\n');
  const R = words(keep.replace(/^ANNEX$/m, '')).map((w) => w.toLowerCase());
  const P = words(p.rows.map((r) => r.cells[0].html.replace(/<sup>/g, ' ').replace(/<\/sup>/g, ' ').replace(/<br>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')).join(' ')).map((w) => w.toLowerCase());
  let common = 0;
  for (const part of diffArrays(R, P)) if (!part.added && !part.removed) common += part.value.length;
  // zusätzlich reihenfolgeunabhängig (Wortmengen mit Vielfachheit): misst Verlust/Zusatz unabhängig von Umstellungen
  const bag = new Map(); for (const w of R) bag.set(w, (bag.get(w) || 0) + 1);
  let inter = 0; for (const w of P) { const c = bag.get(w); if (c) { inter++; bag.set(w, c - 1); } }
  const r = { bagCoverage: inter / R.length, bagPrecision: inter / P.length, file: path.basename(f), pages: p.stats.pages, firstPage: p.stats.firstPage, rows: p.rows.length, refWords: R.length, parsedWords: P.length, coverage: common / R.length, precision: common / P.length, footnotes: p.stats.footnotes, warnings: p.warnings.map((w) => w.code) };
  out.push(r);
  console.log(`${r.file}: ab Seite ${r.firstPage}, ${r.rows} Absätze; Abdeckung ${(r.coverage * 100).toFixed(2)} %, Genauigkeit ${(r.precision * 100).toFixed(2)} %; ohne Reihenfolge: Abdeckung ${(r.bagCoverage * 100).toFixed(2)} %, Genauigkeit ${(r.bagPrecision * 100).toFixed(2)} % (Ref ${r.refWords}, Parser ${r.parsedWords} Wörter)`);
}
fs.mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./out/validate-text.json', import.meta.url), JSON.stringify(out, null, 1));
