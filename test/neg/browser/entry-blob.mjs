// Minimalbeispiel: pdf.js in einer einzelnen HTML-Datei, Worker als Blob aus eingebettetem Quelltext
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.min.mjs';
import workerSource from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker-classic';
import { setupPdfjs, parseFourColumnPdf } from '../../../src/neg/index.js';
window.runNeg = async (b64) => {
  const t0 = performance.now();
  const setup = await setupPdfjs(pdfjs, { workerSource, mode: window.__mode || 'auto' });
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const progress = [];
  const r = await parseFourColumnPdf(bytes, { pdfjs: setup.pdfjs, onProgress: (p) => progress.push(p.phase) });
  return { mode: setup.mode, rows: r.rows.length, cols: r.columns.map((c) => c.header), first: r.rows[0] && r.rows[0].num, ms: Math.round(performance.now() - t0), progress: progress.length, href: location.protocol };
};
