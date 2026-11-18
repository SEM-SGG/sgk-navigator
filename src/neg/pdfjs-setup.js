// SGK-Navigator, Modul Verhandlung — pdf.js in einer einzelnen HTML-Datei unter file:// betreiben (Browser)
//
// setupPdfjs(pdfjs, { workerSource?, workerModule?, mode?:"auto"|"blob"|"main" }) -> Promise<{ mode, pdfjs }>
//
//   pdfjs        : Modulobjekt von "pdfjs-dist/legacy/build/pdf.min.mjs" (vom Build gebündelt)
//   workerSource : Quelltext des pdf.js-Workers als KLASSISCHES Skript (IIFE) als String. Der Build bündelt dazu
//                  "pdfjs-dist/legacy/build/pdf.worker.min.mjs" mit esbuild format:"iife" und bettet das Ergebnis als Text
//                  ein (Muster: test/neg/browser/build.mjs, Plugin "?worker-classic"). Grund: Chrome lehnt Modul-Worker
//                  aus blob:-URLs unter file:// (Ursprung "null") ab; klassische Blob-Worker laufen.
//                  -> Modus "blob": eigener Thread, Oberfläche bleibt bedienbar. Geprüft mit Chrome (Playwright),
//                     test/neg/pdfjs-browser.test.mjs. workerType:"module" nur für http(s)-Auslieferung.
//   workerModule : das importierte Worker-Modul selbst ({ WorkerMessageHandler }) -> Modus "main": pdf.js arbeitet im
//                  Hauptthread ("fake worker"; langsamer für die Bedienung, aber ohne Worker-Unterstützung lauffähig).
//   mode "auto"  : "blob", falls workerSource vorhanden und ein Probe-PDF darüber lesbar ist, sonst "main".
//
// Keine Netzwerkzugriffe: Schriften werden nicht nachgeladen (extractPdfPages setzt useSystemFonts:false,
// disableFontFace:true, useWorkerFetch:false); Textextraktion braucht keine Standardschriften-Dateien.

// Kleinstes gültiges PDF (eine leere Seite) zum Prüfen des Workers
const PROBE = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF';

async function probe(pdfjs) {
  const data = new TextEncoder().encode(PROBE);
  const task = pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 });
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('pdf.js-Worker antwortet nicht')), 8000));
  const doc = await Promise.race([task.promise, timeout]);
  const n = doc.numPages;
  await task.destroy();
  return n === 1;
}

export async function setupPdfjs(pdfjs, { workerSource, workerModule, mode = 'auto', workerType = 'classic' } = {}) {
  if (!pdfjs || !pdfjs.GlobalWorkerOptions) throw new Error('pdfjs-Modul fehlt');
  const useMain = () => {
    if (!workerModule || !workerModule.WorkerMessageHandler) throw new Error('workerModule mit WorkerMessageHandler fehlt' + (setupPdfjs.lastError ? ` (Worker-Probe: ${setupPdfjs.lastError})` : ''));
    globalThis.pdfjsWorker = workerModule;    // pdf.js erkennt dies und arbeitet ohne separaten Worker
    return { mode: 'main', pdfjs };
  };
  if (mode === 'main') return useMain();
  if (workerSource && typeof Worker !== 'undefined' && typeof Blob !== 'undefined') {
    let worker = null;
    try {
      const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
      worker = workerType === 'module' ? new Worker(url, { type: 'module' }) : new Worker(url);
      pdfjs.GlobalWorkerOptions.workerPort = worker;
      if (mode === 'blob') return { mode: 'blob', pdfjs };
      if (await probe(pdfjs)) return { mode: 'blob', pdfjs };
    } catch (e) {
      if (mode === 'blob') throw e;
      setupPdfjs.lastError = String(e && e.message || e);
    }
    try { if (worker) worker.terminate(); } catch { /* egal */ }
    pdfjs.GlobalWorkerOptions.workerPort = null;
  }
  return useMain();
}
