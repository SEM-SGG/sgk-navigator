// Bundle-Grösse mit esbuild (minifiziert, gzip): Bibliothek allein und Zuwachs gegenüber dem, was die App schon bündelt (jsPDF, fflate).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { ROOT, OUT } from './lib.mjs';

const EXTERNAL = ['html2canvas', 'dompurify', 'canvg', 'core-js'];   // wie build.mjs
const size = async (contents) => {
  const r = await build({ stdin: { contents, resolveDir: ROOT, loader: 'js' }, bundle: true, write: false, format: 'iife', minify: true, legalComments: 'none', charset: 'utf8', target: ['chrome110'], external: EXTERNAL, metafile: true, logLevel: 'error' });
  const b = Buffer.from(r.outputFiles[0].contents);
  const inputs = {};
  for (const o of Object.values(r.metafile.outputs)) for (const [k, v] of Object.entries(o.inputs)) inputs[k] = v.bytesInOutput;
  return { min: b.length, gz: gzipSync(b, { level: 9 }).length, inputs };
};

test('Bundle: Zuwachs durch src/export unter 400 KB (minifiziert)', async () => {
  const all = await size("import * as X from './src/export/index.js'; window.X = X;");
  const base = await size("import { jsPDF } from 'jspdf'; import * as F from 'fflate'; window.X = [jsPDF, F];");
  const own = Object.entries(all.inputs).filter(([k]) => k.startsWith('src/export/')).map(([k, v]) => `${k} ${v}`);
  const kb = (n) => (n / 1024).toFixed(1) + ' KB';
  const lines = [
    `Bibliothek allein (mit jsPDF, fflate): ${kb(all.min)} minifiziert, ${kb(all.gz)} gzip`,
    `jsPDF + fflate (in der App schon vorhanden): ${kb(base.min)} minifiziert, ${kb(base.gz)} gzip`,
    `Zuwachs für die App: ${kb(all.min - base.min)} minifiziert, ${kb(all.gz - base.gz)} gzip`,
    `Anteile src/export (Bytes im Bundle): ${own.join(', ')}`,
  ];
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'size.txt'), lines.join('\n') + '\n');
  assert.ok(all.min - base.min < 400 * 1024, lines.join('\n'));
  assert.ok(all.gz < 400 * 1024, lines.join('\n'));
});
