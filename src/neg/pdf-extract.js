// SGK-Navigator, Modul Verhandlung — PDF-Grundbausteine (ESM, isomorph)
//
// extractPdfPages(bytes, { pdfjs, onProgress, pages }) -> { numPages, meta, pages:[PageData], warnings }
// PageData = { n, width, height, items:[Item], rects:[Rect] }
//   Item = { str, x0, x1, y, top, bottom, size, font, bold, italic }   (y = Grundlinie; Koordinaten mit Ursprung oben links)
//   Rect = { x0, y0, x1, y1, kind:"fill"|"stroke", color:"#rrggbb", lw }   (y0 < y1, Ursprung oben links)
//
// pdfjs wird injiziert (Modulobjekt von pdfjs-dist, legacy build). Keine Netzwerkzugriffe:
// Schriften werden nicht nachgeladen (useSystemFonts:false, disableFontFace:true, kein standardFontDataUrl).

const DEFAULT_OPS = {
  save: 10, restore: 11, transform: 12, setLineWidth: 2, constructPath: 91,
  stroke: 20, closeStroke: 21, fill: 22, eoFill: 23, fillStroke: 24, eoFillStroke: 25,
  closeFillStroke: 26, closeEOFillStroke: 27, rawFillPath: 94,
  setFillRGBColor: 59, setStrokeRGBColor: 58, paintFormXObjectBegin: 74, paintFormXObjectEnd: 75,
};

function mul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
function apply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }

/** Schriftname -> { bold, italic } */
export function fontStyle(name) {
  const n = String(name || '').replace(/^[A-Z]{6}\+/, '');
  const bold = /bold|black|heavy|semibold|demi|,B\b|-B$/i.test(n);
  const italic = /italic|oblique|,I\b|-I$|-BI$|BoldIt|It$/i.test(n);
  return { bold, italic, family: n };
}

/** Pfaddaten (DrawOPS) in Teilpfade mit Punkten zerlegen */
function subpaths(data) {
  const out = [];
  let cur = null;
  if (!data) return out;
  for (let i = 0; i < data.length;) {
    const op = data[i++];
    if (op === 0) { cur = { pts: [[data[i++], data[i++]]], closed: false, curve: false }; out.push(cur); }
    else if (op === 1) { if (!cur) { cur = { pts: [], closed: false, curve: false }; out.push(cur); } cur.pts.push([data[i++], data[i++]]); }
    else if (op === 2) { if (cur) { cur.curve = true; cur.pts.push([data[i + 4], data[i + 5]]); } i += 6; }
    else if (op === 3) { if (cur) { cur.curve = true; cur.pts.push([data[i + 2], data[i + 3]]); } i += 4; }
    else if (op === 4) { if (cur) cur.closed = true; }
    else break;
  }
  return out;
}

function isAxisRect(pts) {
  // 4 oder 5 Punkte, achsenparallel
  let p = pts;
  if (p.length === 5 && Math.abs(p[0][0] - p[4][0]) < 0.01 && Math.abs(p[0][1] - p[4][1]) < 0.01) p = p.slice(0, 4);
  if (p.length !== 4) return null;
  const xs = new Set(p.map((q) => Math.round(q[0] * 10)));
  const ys = new Set(p.map((q) => Math.round(q[1] * 10)));
  if (xs.size > 2 || ys.size > 2) return null;
  for (let k = 0; k < 4; k++) {
    const a = p[k], b = p[(k + 1) % 4];
    if (Math.abs(a[0] - b[0]) > 0.05 && Math.abs(a[1] - b[1]) > 0.05) return null;
  }
  return p;
}

/**
 * Grafik einer Seite aus der Operatorliste lesen (nur achsenparallele Rechtecke und Linien).
 * Rückgabe in PDF-Koordinaten (Ursprung unten links).
 */
export function graphicsFromOperatorList(opList, OPS = DEFAULT_OPS) {
  const rects = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  let fill = '#000000', strokeC = '#000000', lw = 1;
  const stack = [];
  const fillOps = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke, OPS.rawFillPath]);
  const strokeOps = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const { fnArray, argsArray } = opList;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const a = argsArray[i];
    if (fn === OPS.save) stack.push([ctm, fill, strokeC, lw]);
    else if (fn === OPS.restore) { const s = stack.pop(); if (s) [ctm, fill, strokeC, lw] = s; }
    else if (fn === OPS.transform) ctm = mul(ctm, a);
    else if (fn === OPS.paintFormXObjectBegin) { stack.push([ctm, fill, strokeC, lw]); if (a && a[0]) ctm = mul(ctm, a[0]); }
    else if (fn === OPS.paintFormXObjectEnd) { const s = stack.pop(); if (s) [ctm, fill, strokeC, lw] = s; }
    else if (fn === OPS.setFillRGBColor) fill = typeof a[0] === 'string' ? a[0] : rgbHex(a);
    else if (fn === OPS.setStrokeRGBColor) strokeC = typeof a[0] === 'string' ? a[0] : rgbHex(a);
    else if (fn === OPS.setLineWidth) lw = a[0];
    else if (fn === OPS.constructPath) {
      const op = a[0];
      const data = a[1] && a[1][0];
      const doFill = fillOps.has(op), doStroke = strokeOps.has(op);
      if (!doFill && !doStroke) continue;
      const scale = Math.hypot(ctm[0], ctm[1]) || 1;
      for (const sp of subpaths(data)) {
        if (sp.curve || sp.pts.length < 2) continue;
        const pts = sp.pts.map((q) => apply(ctm, q[0], q[1]));
        const r = isAxisRect(pts);
        if (r) {
          const xs = r.map((q) => q[0]), ys = r.map((q) => q[1]);
          const box = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
          if (doFill) rects.push({ ...box, kind: 'fill', color: fill, lw: 0 });
          if (doStroke) {
            const w = lw * scale;
            rects.push({ x0: box.x0, y0: box.y0 - w / 2, x1: box.x1, y1: box.y0 + w / 2, kind: 'stroke', color: strokeC, lw: w });
            rects.push({ x0: box.x0, y0: box.y1 - w / 2, x1: box.x1, y1: box.y1 + w / 2, kind: 'stroke', color: strokeC, lw: w });
            rects.push({ x0: box.x0 - w / 2, y0: box.y0, x1: box.x0 + w / 2, y1: box.y1, kind: 'stroke', color: strokeC, lw: w });
            rects.push({ x0: box.x1 - w / 2, y0: box.y0, x1: box.x1 + w / 2, y1: box.y1, kind: 'stroke', color: strokeC, lw: w });
          }
          continue;
        }
        if (doStroke) {
          const w = Math.max(lw * scale, 0.1);
          for (let k = 1; k < pts.length; k++) {
            const [x0, y0] = pts[k - 1], [x1, y1] = pts[k];
            if (Math.abs(y0 - y1) < 0.05) rects.push({ x0: Math.min(x0, x1), y0: y0 - w / 2, x1: Math.max(x0, x1), y1: y0 + w / 2, kind: 'stroke', color: strokeC, lw: w });
            else if (Math.abs(x0 - x1) < 0.05) rects.push({ x0: x0 - w / 2, y0: Math.min(y0, y1), x1: x0 + w / 2, y1: Math.max(y0, y1), kind: 'stroke', color: strokeC, lw: w });
          }
        }
      }
    }
  }
  return rects;
}

function rgbHex(a) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  if (!a || a.length < 3) return '#000000';
  const f = a[0] <= 1 && a[1] <= 1 && a[2] <= 1 ? 255 : 1;
  return '#' + c(a[0] * f) + c(a[1] * f) + c(a[2] * f);
}

/** Textobjekte einer Seite normalisieren (Ursprung oben links). Nur waagrechter Text. */
export function itemsFromTextContent(tc, fontNames, pageHeight, viewBoxY = 0) {
  const items = [];
  for (const it of tc.items) {
    if (typeof it.str !== 'string' || it.str === '') continue;
    const t = it.transform;
    if (Math.abs(t[1]) > 0.01 || Math.abs(t[2]) > 0.01) {
      // gedrehter Text (z. B. Wasserzeichen "DRAFT"): ausweisen, aber nicht als Inhalt verwenden
      items.push({ str: it.str, rotated: true, x0: t[4], x1: t[4], y: pageHeight - (t[5] - viewBoxY), top: 0, bottom: 0, size: Math.hypot(t[0], t[1]), font: '', bold: false, italic: false });
      continue;
    }
    const size = Math.abs(t[3]) || it.height || 10;
    const yb = pageHeight - (t[5] - viewBoxY);
    const fname = fontNames[it.fontName] || '';
    const st = fontStyle(fname);
    items.push({
      str: it.str, x0: t[4], x1: t[4] + it.width, y: yb, top: yb - size * 0.8, bottom: yb + size * 0.2, size,
      font: st.family, bold: st.bold, italic: st.italic,
    });
  }
  return items;
}

/**
 * Alle (oder ausgewählte) Seiten lesen.
 * @param {Uint8Array} bytes
 * @param {{pdfjs:object, onProgress?:(p:{phase:string,done:number,total:number})=>void, pages?:number[], graphics?:boolean}} opts
 */
export async function extractPdfPages(bytes, opts = {}) {
  const { pdfjs, onProgress, graphics = true } = opts;
  if (!pdfjs || typeof pdfjs.getDocument !== 'function') throw new Error('pdfjs fehlt (Option { pdfjs })');
  const warnings = [];
  // Kopie: pdf.js überträgt (detach) den Puffer an den Worker
  const data = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes);
  const task = pdfjs.getDocument({
    data, isEvalSupported: false, fontExtraProperties: true, useSystemFonts: false, disableFontFace: true,
    useWorkerFetch: false, stopAtErrors: false, verbosity: 0,
  });
  let doc;
  try { doc = await task.promise; } catch (e) {
    return { numPages: 0, meta: {}, pages: [], warnings: [{ code: 'pdf-open-failed', message: String(e && e.message || e) }] };
  }
  const OPS = pdfjs.OPS || DEFAULT_OPS;
  const meta = {};
  try {
    const md = await doc.getMetadata();
    meta.title = md?.info?.Title || '';
    meta.author = md?.info?.Author || '';
    meta.created = md?.info?.CreationDate || '';
  } catch { /* ohne Metadaten */ }
  const numPages = doc.numPages;
  const want = opts.pages || Array.from({ length: numPages }, (_, i) => i + 1);
  const pages = [];
  for (let k = 0; k < want.length; k++) {
    const n = want[k];
    try {
      const page = await doc.getPage(n);
      const [vx0, vy0, vx1, vy1] = page.view;
      const width = vx1 - vx0, height = vy1 - vy0;
      let rects = [];
      const fontNames = {};
      if (graphics) {
        const ol = await page.getOperatorList();
        rects = graphicsFromOperatorList(ol, OPS);
      }
      const tc = await page.getTextContent({ disableNormalization: false });
      for (const it of tc.items) {
        if (it.fontName && !(it.fontName in fontNames)) {
          let name = '';
          try { const f = page.commonObjs.has(it.fontName) ? page.commonObjs.get(it.fontName) : null; name = f && f.name || ''; } catch { name = ''; }
          if (!name && tc.styles && tc.styles[it.fontName]) name = tc.styles[it.fontName].fontFamily || '';
          fontNames[it.fontName] = name;
        }
      }
      const items = itemsFromTextContent(tc, fontNames, vy1, 0).map((i) => ({ ...i, x0: i.x0 - vx0, x1: i.x1 - vx0 }));
      const rr = rects.map((r) => ({ ...r, x0: r.x0 - vx0, x1: r.x1 - vx0, y0: vy1 - r.y1, y1: vy1 - r.y0 }));
      pages.push({ n, width, height, rotate: page.rotate || 0, items, rects: rr });
      if (page.rotate) warnings.push({ code: 'page-rotated', page: n, message: `Seite ${n} ist gedreht (${page.rotate}°)` });
      page.cleanup();
    } catch (e) {
      warnings.push({ code: 'page-failed', page: n, message: `Seite ${n} nicht lesbar: ${e && e.message || e}` });
    }
    if (onProgress) onProgress({ phase: 'read', done: k + 1, total: want.length });
  }
  try { await task.destroy(); } catch { /* egal */ }
  return { numPages, meta, pages, warnings };
}
