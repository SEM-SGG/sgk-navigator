// SGK-Navigator — Schriften für den PDF-Export (ESM, isomorph).
// Quelle: fonts-data.js (generiert von test/export/tools/make-fonts.py). Dekodierung beim ersten Gebrauch, danach im Speicher.

import { unzlibSync } from 'fflate';
import { FONT_DATA, FONT_META } from './fonts-data.js';

export { FONT_META };

/** jsPDF-Namen je Familie und Schnitt */
export const PDF_FONTS = {
  serif: { name: 'SGKNSerif', styles: { normal: 'serif-regular', italic: 'serif-italic', bold: 'serif-bold' } },
  sans: { name: 'SGKNSans', styles: { normal: 'sans-regular', bold: 'sans-bold' } },
};

/** Verfügbarer Schnitt: fett hat Vorrang vor kursiv (kein fett-kursiv); Sans ohne kursiv */
export function pdfStyle(family, b, i) {
  const st = PDF_FONTS[family].styles;
  if (b && st.bold) return 'bold';
  if (i && st.italic) return 'italic';
  return 'normal';
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64I = new Uint8Array(128);
for (let i = 0; i < 64; i++) B64I[B64.charCodeAt(i)] = i;

/** base64 -> Bytes, ohne atob/Buffer (Browser und Node gleich) */
export function b64decode(s) {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const n = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(n);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64I[clean.charCodeAt(i)], b = B64I[clean.charCodeAt(i + 1)];
    const c = i + 2 < clean.length ? B64I[clean.charCodeAt(i + 2)] : 0, d = i + 3 < clean.length ? B64I[clean.charCodeAt(i + 3)] : 0;
    const v = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < n) out[o++] = (v >> 16) & 255;
    if (o < n && i + 2 < clean.length) out[o++] = (v >> 8) & 255;
    if (o < n && i + 3 < clean.length) out[o++] = v & 255;
  }
  return out.subarray(0, o);
}

/** Codepunkte aus der cmap-Tabelle (Formate 4 und 12) */
export function cmapCodepoints(ttf) {
  const dv = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength);
  const numTables = dv.getUint16(4);
  let cmapOff = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const tag = String.fromCharCode(ttf[rec], ttf[rec + 1], ttf[rec + 2], ttf[rec + 3]);
    if (tag === 'cmap') cmapOff = dv.getUint32(rec + 8);
  }
  const set = new Set();
  if (cmapOff < 0) return set;
  const n = dv.getUint16(cmapOff + 2);
  let best = -1, bestFmt = 0;
  for (let i = 0; i < n; i++) {
    const pid = dv.getUint16(cmapOff + 4 + i * 8), eid = dv.getUint16(cmapOff + 6 + i * 8);
    const off = cmapOff + dv.getUint32(cmapOff + 8 + i * 8);
    const fmt = dv.getUint16(off);
    if ((pid === 3 && (eid === 1 || eid === 10)) || pid === 0) {
      if (fmt === 12 && bestFmt !== 12) { best = off; bestFmt = 12; } else if (fmt === 4 && best < 0) { best = off; bestFmt = 4; }
    }
  }
  if (best < 0) return set;
  if (bestFmt === 4) {
    const segX2 = dv.getUint16(best + 6);
    const ends = best + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = dv.getUint16(ends + s * 2), start = dv.getUint16(starts + s * 2);
      const delta = dv.getInt16(deltas + s * 2), roff = dv.getUint16(ranges + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g;
        if (roff === 0) g = (c + delta) & 0xffff;
        else { const gi = ranges + s * 2 + roff + (c - start) * 2; g = dv.getUint16(gi); if (g) g = (g + delta) & 0xffff; }
        if (g) set.add(c);
      }
    }
  } else {
    const groups = dv.getUint32(best + 12);
    for (let gi = 0; gi < groups; gi++) {
      const o = best + 16 + gi * 12;
      const s = dv.getUint32(o), e = dv.getUint32(o + 4), g0 = dv.getUint32(o + 8);
      for (let c = s; c <= e; c++) if (g0 + (c - s)) set.add(c);
    }
  }
  return set;
}

const cache = new Map();

/** Schrift dekodieren: { bytes, binary (für jsPDF addFileToVFS), cps:Set } */
export function loadFont(key) {
  let f = cache.get(key);
  if (f) return f;
  const z = FONT_DATA[key];
  if (!z) throw new Error('Schrift fehlt: ' + key);
  const bytes = unzlibSync(b64decode(z));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  f = { key, bytes, binary, cps: cmapCodepoints(bytes) };
  cache.set(key, f);
  return f;
}

/** Alle Schriften in einem jsPDF-Dokument registrieren */
export function registerFonts(doc) {
  for (const fam of Object.values(PDF_FONTS)) {
    for (const [style, key] of Object.entries(fam.styles)) {
      const file = key + '.ttf';
      doc.addFileToVFS(file, loadFont(key).binary);
      doc.addFont(file, fam.name, style);
    }
  }
}
