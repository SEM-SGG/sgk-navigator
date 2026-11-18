// Baut die Minimalbeispiele als einzelne HTML-Dateien (wie die Anwendung: alles inline, file://).
// Muster für build.mjs der Oberfläche: Plugin "textImport" lädt "<pfad>?text" als String.
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
// "<modul>?worker-classic": Worker-Modul von pdf.js als klassisches Skript (IIFE) bündeln und als String einbetten.
// Grund: Chrome lehnt Modul-Worker aus blob:-URLs unter file:// (Ursprung "null") ab, klassische Worker gehen.
export const textImport = {
  name: 'pdfjs-worker-classic',
  setup(b) {
    b.onResolve({ filter: /\?worker-classic$/ }, (a) => ({ path: path.resolve(a.resolveDir, '../../../node_modules', a.path.replace(/\?worker-classic$/, '')), namespace: 'worker-classic' }));
    b.onLoad({ filter: /.*/, namespace: 'worker-classic' }, async (a) => {
      const r = await esbuild.build({ entryPoints: [a.path], bundle: true, format: 'iife', write: false, minify: true, target: 'es2022', logLevel: 'error' });
      return { contents: r.outputFiles[0].text, loader: 'text' };
    });
  },
};
export async function buildDemo(entry, outHtml) {
  const r = await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', write: false, minify: true, target: 'es2022', plugins: [textImport], logLevel: 'error' });
  const js = r.outputFiles[0].text;
  // "</script" im Code entschärfen
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>pdf.js offline</title></head><body><script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
  fs.mkdirSync(path.dirname(outHtml), { recursive: true });
  fs.writeFileSync(outHtml, html);
  return { bytes: Buffer.byteLength(html), jsBytes: Buffer.byteLength(js) };
}
