// SGK-Navigator, Modul Verhandlung — Vier-Spalten-Tabellen aus PDF (ESM, isomorph)
//
// parseFourColumnPdf(bytes, { pdfjs, onProgress?, pages? }) -> Promise<ParsedDoc>
// analyzeFourColumnPages(pages, opts) -> ParsedDoc            (rein, ohne pdf.js; Eingabe aus extractPdfPages)
//
// ParsedDoc = { meta, columns:[{index, header, suggestedTrack}], rows:[{num, label, labelSource, path, status, pages,
//               cells:{<colIndex>:{html, text, status, empty, notes?, tags?}}}], warnings:[{code,message,page?,row?}], stats }
//
// Verfahren (siehe data/NEG_NOTES.md):
//  - Spalten aus den senkrechten Tabellenlinien (Operatorliste), Zuordnung über die Kopfzeile ("Commission Proposal" …).
//  - Zeilen aus den waagrechten Tabellenlinien; Bänder ohne innere senkrechte Linien = Fundstellen-Zwischenzeilen
//    (Trilogue Table Editor). Ohne Linien: Rückfall auf vertikale Lücken.
//  - Zeilennummer aus der schmalen ersten Spalte, Statuskürzel (G/Y/R) aus dem Rand, Status aus Zellfarbe.
//  - Zellen über Seitenumbrüche zusammengeführt (Band ohne Nummer am Seitenanfang = Fortsetzung).
//  - Fett/kursiv aus Schriftnamen; unterstrichen/gestrichen aus dünnen Linien unter bzw. durch den Text.
//  - Kopf-/Fusszeilen = alles ausserhalb der Tabelle.

import { extractPdfPages } from './pdf-extract.js';
import { segmentsToHtml, htmlToText, htmlToCleanText, parseDateEn, parseDocRef, parseProcedure, parseClassification, warn } from './util.js';
import { parseLabel, labelFromPath, StructureTracker, groupOf, amendsOf, uniqueDerivedLabels } from './paths.js';

const HEADER_RE = /commission|proposal|\bEP\b|parliament|mandate|council|general approach|draft|agreement|compromise|position|amendment|auxiliary|comment|presidency|\bCD\s*\d/i;
const LABEL_RE = /^(formula|citation|recital|article|annex|chapter|section|title|part|heading|preamble|enacting|final provisions)\b/i;

export function suggestTrack(header) {
  const h = String(header || '');
  if (/draft\s+(agreement|compromise)|agreement|compromise|trilogue outcome/i.test(h)) return 'agreement';
  if (/commission/i.test(h)) return 'com';
  if (/\bEP\b|parliament/i.test(h)) return 'ep';
  if (/council|general approach/i.test(h)) return 'council';
  return null;
}

// ------------------------------------------------------------------ Farben

function hexRgb(c) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(c || ''));
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
}
function lum(c) { const [r, g, b] = hexRgb(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
function hsv(c) {
  const [r, g, b] = hexRgb(c).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max ? d / max : 0, v: max };
}
/** Zellfarbe -> Status (Konvention Trilogue Table Editor: grün = vereinbart, gelb = weitgehend, rot = offen) */
export function colorStatus(c) {
  if (!c) return null;
  const { h, s, v } = hsv(c);
  if (v < 0.35) return null;
  if (h >= 70 && h <= 170 && s >= 0.06) return 'agreed';
  if (h >= 40 && h < 70 && s >= 0.25) return 'provisional';
  if ((h < 20 || h > 335) && s >= 0.15) return 'open';
  return null;
}
const LETTER_STATUS = { G: 'agreed', Y: 'provisional', R: 'open' };

/** Schriftfamilie ohne Untergruppen-Präfix und Schnitt ("ABCDEF+TimesNewRomanPS-BoldMT" -> "timesnewroman") */
export function fontFamily(name) {
  return String(name || '').replace(/^[A-Z]{6}\+/, '').replace(/[-,](bold|italic|oblique|regular|roman|bolditalic|boldoblique|semibold|light)\w*$/i, '')
    .replace(/(PS)?(MT)?\d*$/i, '').replace(/[-,]?(Bold|Italic|Oblique)+$/i, '').replace(/PS$/i, '').toLowerCase();
}

// ------------------------------------------------------------------ Geometrie

function cluster(values, tol) {
  // values: [{v, w}] -> [{v (gewichteter Mittelwert), w}]
  const s = values.slice().sort((a, b) => a.v - b.v);
  const out = [];
  for (const x of s) {
    const last = out[out.length - 1];
    if (last && x.v - last.max <= tol) { last.sum += x.v * x.w; last.w += x.w; last.max = x.v; last.v = last.sum / last.w; }
    else out.push({ v: x.v, w: x.w, sum: x.v * x.w, max: x.v });
  }
  return out;
}

/** Grundstruktur einer Seite: Spaltengrenzen, Tabellenbereich, Trennlinien */
export function pageGrid(pg) {
  const dark = (r) => lum(r.color) < 0.6;
  const vr = pg.rects.filter((r) => r.x1 - r.x0 <= 2.5 && r.y1 - r.y0 >= 4 && dark(r));
  const hr = pg.rects.filter((r) => r.y1 - r.y0 <= 2.5 && r.x1 - r.x0 >= 4 && dark(r));
  if (vr.length < 3) return null;
  const vcl = cluster(vr.map((r) => ({ v: (r.x0 + r.x1) / 2, w: r.y1 - r.y0 })), 1.6);
  const maxW = Math.max(...vcl.map((c) => c.w));
  let xs = vcl.filter((c) => c.w >= Math.max(20, maxW * 0.35)).map((c) => c.v);
  if (xs.length < 3) return null;
  // Tabellenbereich: senkrechte Ausdehnung der Spaltenlinien
  const inTable = vr.filter((r) => xs.some((x) => Math.abs((r.x0 + r.x1) / 2 - x) < 1.6));
  const top = Math.min(...inTable.map((r) => r.y0)), bottom = Math.max(...inTable.map((r) => r.y1));
  const x0 = xs[0], x1 = xs[xs.length - 1];
  // waagrechte Trennlinien: Enden auf Spaltengrenzen
  const allX = vcl.map((c) => c.v);
  const near = (v) => xs.some((x) => Math.abs(x - v) <= 3) || allX.some((x) => Math.abs(x - v) <= 3);
  const seps = hr.filter((r) => near(r.x0) && near(r.x1) && r.y0 >= top - 3 && r.y1 <= bottom + 3);
  const ycl = cluster(seps.map((r) => ({ v: (r.y0 + r.y1) / 2, w: r.x1 - r.x0 })), 1.6).map((c) => c.v);
  // Zierlinien (unter-/durchgestrichen): dünn, waagrecht, keine Trennlinie
  const sepSet = new Set(seps);
  const deco = pg.rects.filter((r) => r.y1 - r.y0 <= 2.2 && r.x1 - r.x0 >= 1 && !sepSet.has(r) && r.x0 >= x0 - 16 && r.x1 <= x1 + 16 && r.y0 >= top - 2 && r.y1 <= bottom + 2 && lum(r.color) < 0.92);
  const vrAll = vr.filter((r) => r.y1 > top - 1 && r.y0 < bottom + 1 && (r.x0 + r.x1) / 2 > x0 - 15 && (r.x0 + r.x1) / 2 < x1 + 15);
  return { xs, x0, x1, top, bottom, ys: ycl, vr: inTable, vrAll, deco };
}

// ------------------------------------------------------------------ Text einer Zelle

function median(arr) { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }

/** Textobjekte zu Zeilen gruppieren (Hoch-/Tiefstellung erkannt) */
export function groupLines(items) {
  if (!items.length) return [];
  const med = median(items.map((i) => i.size));
  const big = items.filter((i) => i.size >= med * 0.85).sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const small = items.filter((i) => i.size < med * 0.85);
  const lines = [];
  for (const it of big) {
    const l = lines.find((L) => Math.abs(L.y - it.y) <= Math.max(1.2, 0.3 * Math.min(L.size, it.size)) && !(it.x0 < L.x1 - 2 && it.x1 > L.x0 + 2 && false));
    if (l) { l.items.push(it); l.size = Math.max(l.size, it.size); l.x0 = Math.min(l.x0, it.x0); l.x1 = Math.max(l.x1, it.x1); }
    else lines.push({ y: it.y, size: it.size, items: [it], x0: it.x0, x1: it.x1 });
  }
  const rest = [];
  for (const it of small) {
    let best = null, bd = Infinity;
    for (const L of lines) {
      const d = L.y - it.y; // >0: Objekt liegt höher
      if (d >= -0.25 * L.size && d <= 0.75 * L.size && it.x0 >= L.x0 - L.size * 3 && it.x0 <= L.x1 + L.size * 3) {
        if (Math.abs(d) < bd) { bd = Math.abs(d); best = L; }
      }
    }
    if (best) {
      const d = best.y - it.y;
      best.items.push({ ...it, sup: d > 0.18 * best.size, sub: d < -0.12 * best.size });
    } else rest.push(it);
  }
  rest.sort((a, b) => a.y - b.y || a.x0 - b.x0);
  for (const it of rest) {
    const l = lines.find((L) => L.small && Math.abs(L.y - it.y) <= Math.max(1, 0.3 * it.size));
    if (l) { l.items.push(it); l.x0 = Math.min(l.x0, it.x0); l.x1 = Math.max(l.x1, it.x1); }
    else lines.push({ y: it.y, size: it.size, items: [it], x0: it.x0, x1: it.x1, small: true });
  }
  lines.sort((a, b) => a.y - b.y);
  for (const L of lines) L.items.sort((a, b) => a.x0 - b.x0);
  return lines;
}

/** Zierlinien auf Textobjekte anwenden; teilt Objekte bei teilweiser Überdeckung (an Wortgrenzen). */
function decorate(items, deco) {
  const out = [];
  for (const it of items) {
    const marks = [];
    for (const d of deco) {
      if (d.x1 <= it.x0 + 0.5 || d.x0 >= it.x1 - 0.5) continue;
      const yc = (d.y0 + d.y1) / 2;
      const rel = yc - it.y; // >0 unterhalb der Grundlinie
      let kind = null;
      if (rel >= -0.12 * it.size && rel <= 0.32 * it.size) kind = 'u';
      else if (rel < -0.12 * it.size && rel >= -0.55 * it.size) kind = 's';
      if (kind) marks.push({ kind, x0: Math.max(d.x0, it.x0), x1: Math.min(d.x1, it.x1) });
    }
    if (!marks.length) { out.push(it); continue; }
    // Schnittpunkte in Zeichenindizes (proportional, an Leerzeichen ausgerichtet)
    const n = it.str.length;
    const w = Math.max(it.x1 - it.x0, 0.01);
    const toIdx = (x) => {
      let k = Math.round(((x - it.x0) / w) * n);
      k = Math.max(0, Math.min(n, k));
      for (let r = 0; r <= 3; r++) {
        if (k - r >= 0 && (k - r === 0 || it.str[k - r - 1] === ' ' || it.str[k - r] === ' ')) return k - r;
        if (k + r <= n && (k + r === n || it.str[k + r - 1] === ' ' || it.str[k + r] === ' ')) return k + r;
      }
      return k;
    };
    const flags = Array.from({ length: n }, () => ({ u: false, s: false }));
    for (const m of marks) {
      const a = m.x0 - it.x0 < 1 ? 0 : toIdx(m.x0), b = it.x1 - m.x1 < 1 ? n : toIdx(m.x1);
      for (let k = a; k < b; k++) flags[k][m.kind] = true;
    }
    let start = 0;
    for (let k = 1; k <= n; k++) {
      if (k === n || flags[k].u !== flags[start].u || flags[k].s !== flags[start].s) {
        const part = it.str.slice(start, k);
        out.push({ ...it, str: part, x0: it.x0 + (start / n) * w, x1: it.x0 + (k / n) * w, u: flags[start].u, s: flags[start].s });
        start = k;
      }
    }
  }
  return out;
}

/** Zeilen -> Segmente (Leerzeichen aus Abständen, Absatzwechsel aus grösseren Zeilenabständen) */
function linesToSegments(lines, pitch) {
  const segs = [];
  let prevLine = null;
  for (const L of lines) {
    if (prevLine) {
      const gap = L.y - prevLine.y;
      const lastSeg = segs[segs.length - 1];
      const p = pitch(prevLine.size) || prevLine.size * 1.15;
      if (gap > p * 1.38) segs.push({ br: true });
      else if (lastSeg && !lastSeg.br && /[-‐–]$/.test(lastSeg.t) && !/\s[-‐–]$/.test(lastSeg.t) && /^[\p{L}\p{N}]/u.test(L.items[0]?.str || '')) { /* Bindestrich am Zeilenende: kein Leerzeichen, Bindestrich bleibt */ }
      else segs.push({ t: ' ', b: lastSeg && lastSeg.b, i: lastSeg && lastSeg.i, u: false, s: false });
    }
    let prev = null;
    for (const it of L.items) {
      if (prev) {
        const gap = it.x0 - prev.x1;
        if (gap > 0.15 * Math.min(it.size, prev.size) && !/\s$/.test(prev.str) && !/^\s/.test(it.str)) segs.push({ t: ' ', b: prev.b, i: prev.i, u: prev.u && it.u, s: prev.s && it.s });
      }
      segs.push({ t: it.str, b: it.bold, i: it.italic, u: !!it.u, s: !!it.s, sup: !!it.sup, sub: !!it.sub });
      prev = it;
    }
    prevLine = L;
  }
  // Leerzeichen normalisieren
  for (const s of segs) if (s.t) s.t = s.t.replace(/[\s ]+/g, ' ');
  return segs;
}

function trimSegs(segs) {
  while (segs.length && (segs[0].br || segs[0].t === ' ' || segs[0].t === '')) segs.shift();
  while (segs.length && (segs[segs.length - 1].br || segs[segs.length - 1].t === ' ' || segs[segs.length - 1].t === '')) segs.pop();
  if (segs.length) {
    if (segs[0].t) segs[0] = { ...segs[0], t: segs[0].t.replace(/^\s+/, '') };
    const L = segs.length - 1;
    if (segs[L].t) segs[L] = { ...segs[L], t: segs[L].t.replace(/\s+$/, '') };
  }
  return segs;
}

// ------------------------------------------------------------------ Seitenanalyse

function itemsIn(items, x0, x1, y0, y1) {
  return items.filter((i) => !i.rotated && i.str.trim() !== '' && i.y > y0 && i.y - i.size * 0.6 < y1 && (i.x0 + Math.min(i.x1, i.x0 + 4)) / 2 >= x0 - 1 && i.x0 < x1 - 0.5);
}

/** Text einer Zeile mit Leerzeichen aus Abständen */
export function lineText(L) {
  let s = ''; let prev = null;
  for (const it of L.items) {
    if (prev && it.x0 - prev.x1 > 0.15 * Math.min(it.size, prev.size) && !/\s$/.test(s) && !/^\s/.test(it.str)) s += ' ';
    s += it.str; prev = it;
  }
  return s.replace(/\s+/g, ' ').trim();
}

/** Text der Seite (für Metadaten und Erkennung) */
export function pageText(pg) {
  const lines = groupLines(pg.items.filter((i) => !i.rotated && i.str.trim() !== ''));
  return lines.map(lineText).join('\n');
}

function analyzePage(pg, ctx) {
  const grid = pageGrid(pg);
  if (!grid) return { n: pg.n, table: false };
  let { xs, ys, top, bottom } = grid;
  // Band-Grenzen: Linien + oberer/unterer Tabellenrand
  const bounds = [...new Set([top, ...ys, bottom].map((v) => Math.round(v * 10) / 10))].sort((a, b) => a - b);
  const bandsY = [];
  for (let k = 1; k < bounds.length; k++) if (bounds[k] - bounds[k - 1] > 3) bandsY.push([bounds[k - 1], bounds[k]]);
  const fills = pg.rects.filter((r) => r.kind === 'fill' && r.x1 - r.x0 > 3 && r.y1 - r.y0 > 3);
  const toIv = (b) => { const out = []; for (let k = 1; k < b.length; k++) out.push({ x0: b[k - 1], x1: b[k], w: b[k] - b[k - 1] }); return out; };
  // Senkrechte Linien je Band (Zeilen können in Word eingerückt sein: eigene Spaltengrenzen je Band)
  const bands = [];
  const sig = new Map();
  for (const [y0, y1] of bandsY) {
    const h = y1 - y0;
    const rv = grid.vrAll.filter((r) => Math.min(r.y1, y1) - Math.max(r.y0, y0) > h * 0.5);
    const bx = cluster(rv.map((r) => ({ v: (r.x0 + r.x1) / 2, w: 1 })), 1.6).map((c) => c.v);
    const items = itemsIn(pg.items, Math.min(grid.x0, bx[0] ?? grid.x0), Math.max(grid.x1, bx[bx.length - 1] ?? grid.x1), y0, y1);
    const full = bx.length <= 2;
    const bandFills = fills.filter((f) => f.y0 < y1 - 1 && f.y1 > y0 + 1 && f.x0 < grid.x1 && f.x1 > grid.x0);
    const band = { y0, y1, full, items, fills: bandFills, bx };
    if (!full) { const k = bx.map((v) => Math.round(v)).join(','); sig.set(k, (sig.get(k) || 0) + h); band.sig = k; }
    bands.push(band);
  }
  // vorherrschende Spaltengrenzen der Seite
  let domKey = null, domW = 0;
  for (const [k, w] of sig) if (w > domW || (w === domW && k.split(',').length > (domKey || '').split(',').length)) { domKey = k; domW = w; }
  let intervals;
  if (domKey) {
    const b = bands.find((x) => x.sig === domKey).bx;
    intervals = toIv(b);
  } else intervals = toIv(xs);
  for (const band of bands) {
    if (band.full || band.sig === domKey) band.intervals = intervals;
    else band.intervals = toIv(band.bx);
  }
  // Statuskürzel im Rand
  const markers = pg.items.filter((i) => /^[GYR]$/.test(i.str.trim()) && i.size < 8 && (i.x1 <= grid.x0 + 1 || i.x0 >= grid.x1 - 1));
  // Kopf- und Fusszeilen (ausserhalb der Tabelle)
  const outside = pg.items.filter((i) => !i.rotated && i.str.trim() && (i.y < top - 1 || i.y - i.size * 0.6 > bottom + 1));
  const below = groupLines(outside.filter((i) => i.y - i.size * 0.6 > bottom + 1 && !markers.includes(i)));
  return { n: pg.n, table: true, grid, intervals, bands, markers, outside, below, width: pg.width, height: pg.height, rotated: pg.items.filter((i) => i.rotated) };
}

// ------------------------------------------------------------------ Spaltenmodell

function headerLabels(band, intervals) {
  const maxSize = Math.max(...band.items.map((i) => i.size), 0);
  return intervals.map((iv) => {
    const its = band.items.filter((i) => i.x0 >= iv.x0 - 1 && i.x0 < iv.x1 - 0.5 && i.size >= maxSize * 0.8);
    return groupLines(its).map(lineText).join(' ').replace(/\s+/g, ' ').trim();
  });
}

function isHeaderBand(band, intervals) {
  if (!band || !band.items.length) return false;
  const labels = headerLabels(band, intervals);
  const hits = labels.filter((l) => HEADER_RE.test(l) && l.length <= 50).length;
  const boldShare = band.items.filter((i) => i.bold).length / band.items.length;
  const darkFill = band.fills.some((f) => lum(f.color) < 0.4 && (f.x1 - f.x0) > 40);
  return hits >= 2 && (boldShare > 0.6 || darkFill);
}
/** Kopfzeile = erstes Band der Tabelle auf der Seite, falls es Spaltentitel enthält */
function headerBandOf(p) {
  const first = p.bands.find((b) => b.items.length);
  return first && isHeaderBand(first, p.intervals) ? first : null;
}

// ------------------------------------------------------------------ Hauptfunktion (rein)

/**
 * Seiten (aus extractPdfPages) zu ParsedDoc verarbeiten.
 * @param {{pages:object[], meta?:object, warnings?:object[]}} ex
 * @param {{onProgress?:Function}} opts
 */
export function analyzeFourColumnPages(ex, opts = {}) {
  const warnings = [...(ex.warnings || [])];
  const analyzed = [];
  for (let k = 0; k < ex.pages.length; k++) {
    analyzed.push(analyzePage(ex.pages[k], {}));
    if (opts.onProgress && k % 10 === 0) opts.onProgress({ phase: 'analyze', done: k + 1, total: ex.pages.length });
  }
  const tablePages = analyzed.filter((p) => p.table);
  const meta = docMeta(ex, analyzed);
  if (!tablePages.length) {
    warnings.push(warn('no-table', 'Keine Tabelle mit Linien gefunden. Ist das Dokument eine Vier-Spalten-Tabelle?'));
    return { meta, columns: [], rows: [], warnings, stats: { pages: ex.pages.length, tablePages: 0, rows: 0 } };
  }
  // Dokument-Spaltenmodell aus der ersten Kopfzeile
  let model = null;
  for (const p of tablePages) {
    const hb = headerBandOf(p);
    if (hb) {
      const labels = headerLabels(hb, p.intervals);
      model = buildModel(p.intervals, labels, p);
      break;
    }
  }
  if (!model) {
    const p = tablePages[0];
    model = buildModel(p.intervals, p.intervals.map(() => ''), p);
    warnings.push(warn('no-header', 'Keine Kopfzeile mit Spaltentiteln erkannt; Spalten nach Position benannt.'));
  }
  const columns = model.cols.map((c, i) => ({ index: i, header: c.header || `Spalte ${i + 1}`, suggestedTrack: suggestTrack(c.header) }));
  // Zeilenabstand je Schriftgrösse (dokumentweit) für Absatzerkennung
  const pitches = new Map();
  const pitch = (size) => pitches.get(Math.round(size)) || null;
  collectPitches(tablePages, pitches);

  const body = bodyFont(tablePages);
  const rows = [];
  let pendingLabel = null;
  let decoCount = 0, strikeCount = 0, footnoteLines = 0;
  const stats = { pages: ex.pages.length, tablePages: tablePages.length, bands: 0, labelBands: 0, continuations: 0, hyphenJoins: 0 };
  let numbered = false;
  for (const p of tablePages) {
    p.headerBand = headerBandOf(p);
    const map = mapColumns(p, model, warnings);
    if (!map) continue;
    let firstBody = true;
    for (const band of p.bands) {
      stats.bands++;
      if (band === p.headerBand) continue;
      if (!band.items.length) { firstBody = false; continue; }
      if (band.full || crossesBoundaries(band, map)) {
        const txt = bandText(band);
        if (LABEL_RE.test(txt) || txt.length < 160) {
          stats.labelBands++;
          pendingLabel = txt;
          firstBody = false;
          continue;
        }
      }
      // Nummer
      const bIv = (iv) => bandInterval(band, p.intervals, iv);
      let num = null;
      const numIv = map.numIv ? bIv(map.numIv) : null;
      if (numIv) {
        const nItems = band.items.filter((i) => i.x0 >= numIv.x0 - 1 && i.x0 < numIv.x1);
        const t = nItems.map((i) => i.str).join('').replace(/\s+/g, '');
        if (/^\d+[a-z]*$/i.test(t)) { num = t; numbered = true; }
        else if (t) warnings.push(warn('num-unreadable', `Zeilennummer nicht lesbar: "${t}"`, { page: p.n }));
      }
      // Zellen
      const cells = {};
      let any = false;
      for (let ci = 0; ci < model.cols.length; ci++) {
        const iv = map.cols[ci] ? bIv(map.cols[ci]) : null;
        if (!iv) continue;
        const its = band.items.filter((i) => i.x0 >= iv.x0 - 1 && i.x0 < iv.x1 - 0.5);
        if (its.some((i) => i.x1 > iv.x1 + 4)) warnings.push(warn('text-overflow', `Text ragt über die Spaltengrenze (Seite ${p.n}, Spalte ${ci + 1})`, { page: p.n }));
        const deco = p.grid.deco.filter((d) => d.x0 >= iv.x0 - 1 && d.x1 <= iv.x1 + 1 && d.y0 >= band.y0 - 1 && d.y1 <= band.y1 + 1);
        const cellFill = band.fills.filter((f) => f.x0 <= iv.x0 + 3 && f.x1 >= iv.x1 - 3 && (f.y1 - f.y0) >= (band.y1 - band.y0) * 0.5).map((f) => colorStatus(f.color)).find(Boolean) || null;
        const { segs, notes, tags, decoUsed, strikes, fnLines } = cellSegments(its, deco, band, pitch, body);
        decoCount += decoUsed; strikeCount += strikes; footnoteLines += fnLines;
        cells[ci] = { segs, notes, tags, status: cellFill };
        if (segs.length || notes.length) any = true;
      }
      const marker = p.markers.find((m) => m.y > band.y0 - 1 && m.y - m.size < band.y1 + 1);
      const rowStatus = marker ? LETTER_STATUS[marker.str.trim()] : null;
      const prev = rows[rows.length - 1];
      const continuation = !num && firstBody && prev && pendingLabel === null && (numbered || looksLikeContinuation(prev, cells));
      if (continuation) {
        stats.continuations++;
        for (const ci of Object.keys(cells)) {
          const c = cells[ci];
          const pc = prev._cells[ci] || (prev._cells[ci] = { segs: [], notes: [], tags: [], status: null });
          if (c.segs.length) {
            if (pc.segs.length) {
              const last = pc.segs[pc.segs.length - 1];
              if (last.t && /[^\s][-‐–]$/.test(last.t) && /^[\p{L}\p{N}]/u.test(c.segs[0].t || '')) stats.hyphenJoins++;
              else pc.segs.push({ t: ' ' });
            }
            pc.segs.push(...c.segs);
          }
          pc.notes.push(...c.notes);
          pc.tags.push(...c.tags);
          pc.status = pc.status || c.status;
        }
        prev.status = prev.status || rowStatus;
        if (!prev.pages.includes(p.n)) prev.pages.push(p.n);
      } else if (any || num) {
        if (!num && numbered) warnings.push(warn('row-without-number', `Zeile ohne Nummer auf Seite ${p.n}`, { page: p.n }));
        rows.push({ num, label: pendingLabel, labelSource: pendingLabel ? 'table' : null, status: rowStatus, pages: [p.n], _cells: cells });
        pendingLabel = null;
      }
      firstBody = false;
    }
    if (opts.onProgress) opts.onProgress({ phase: 'rows', done: tablePages.indexOf(p) + 1, total: tablePages.length });
  }
  // Fussnoten unterhalb der Tabelle (Word-Seitenfussnoten): Fusszeilen (auf vielen Seiten wiederkehrend) ausnehmen,
  // Rest als Fussnoten lesen und an die Zelle mit dem passenden hochgestellten Verweis auf derselben Seite hängen.
  const footnotes = pageFootnotes(tablePages);
  for (const fn of footnotes) {
    const cand = rows.filter((r) => r.pages.includes(fn.page));
    let hit = null;
    for (let k = cand.length - 1; k >= 0 && !hit; k--) {
      for (const [ci, c] of Object.entries(cand[k]._cells)) {
        if (c.segs.some((sg) => sg.sup && sg.t.trim() === fn.n)) { hit = { row: cand[k], ci }; break; }
      }
    }
    if (hit) {
      const c = hit.row._cells[hit.ci];
      c.segs.push({ br: true }, { t: fn.n, sup: true }, { t: ' ' + fn.text });
      fn.row = hit.row.num; fn.col = +hit.ci;
    } else warnings.push(warn('footnote-unattached', `Fussnote ${fn.n} auf Seite ${fn.page} keiner Zelle zuordenbar: "${fn.text.slice(0, 60)}"`, { page: fn.page }));
  }
  stats.pageFootnotes = footnotes.length;

  // Zellen fertigstellen, Pfade ableiten
  const tracker = new StructureTracker();
  const order = preferredOrder(columns);
  const tableLabels = rows.filter((r) => r.label).length > rows.length * 0.2;
  let prevOut = null;
  const outRows = rows.map((r) => {
    const cells = {};
    for (let ci = 0; ci < columns.length; ci++) {
      const c = r._cells[ci] || { segs: [], notes: [], tags: [], status: null };
      const html = segmentsToHtml(trimSegs(c.segs.slice()));
      const text = htmlToText(html);
      const cell = { html, text, status: c.status || null, empty: !text };
      if (c.notes.length) cell.notes = c.notes;
      if (c.tags.length) cell.tags = [...new Set(c.tags)];
      cells[ci] = cell;
    }
    // Zeilenstatus auf Spur "agreement" übertragen, wenn dort keine Farbe
    const agIdx = columns.findIndex((c) => c.suggestedTrack === 'agreement');
    if (r.status && agIdx >= 0 && !cells[agIdx].status && !cells[agIdx].empty) cells[agIdx].status = r.status;
    const firstText = order.map((ci) => cells[ci] && !cells[ci].empty ? (htmlToCleanText(cells[ci].html) || cells[ci].text) : '').find((t) => t && t.trim()) || '';
    const derived = tracker.feed(firstText);
    let path, label = r.label, labelSource = r.labelSource;
    if (label) { path = parseLabel(label); if (derived.target && path.kind === 'article') path.target = derived.target; }
    else if (tableLabels && prevOut) { path = prevOut.path; label = prevOut.label; labelSource = 'inherited'; }
    else { path = derived; label = labelFromPath(derived); labelSource = 'derived'; }
    prevOut = { num: r.num, label, labelSource, path, group: groupOf(path), amends: amendsOf(path), status: r.status || null, pages: r.pages, cells };
    return prevOut;
  });
  if (decoCount === 0 && outRows.length > 20) warnings.push(warn('no-decorations', 'Keine Unter-/Durchstreichungen gefunden. Änderungsmarkierungen der Quelle sind möglicherweise nur farbig und gehen verloren.'));
  if (strikeCount > 0) warnings.push(warn('strike-detected', `${strikeCount} durchgestrichene Textstellen aus Linien erkannt (als <s> markiert). Bitte stichprobenweise prüfen: Durchstreichungen sind im PDF nur geometrisch erkennbar.`));
  warnings.push(warn('colors-not-read', 'Schriftfarben werden aus dem PDF nicht gelesen; Statusfarben nur aus Zellhintergrund und Randkürzeln.'));
  const nums = outRows.filter((r) => r.num).map((r) => r.num);
  const dupNums = nums.filter((n, i) => nums.indexOf(n) !== i);
  if (dupNums.length) warnings.push(warn('duplicate-num', `Doppelte Zeilennummern: ${[...new Set(dupNums)].slice(0, 10).join(', ')}`));
  stats.rows = outRows.length;
  stats.numbered = numbered;
  stats.withLabel = outRows.filter((r) => r.labelSource === 'table').length;
  stats.decorations = decoCount;
  stats.strikes = strikeCount;
  stats.footnoteLines = footnoteLines;
  stats.cells = outRows.reduce((n, r) => n + Object.values(r.cells).filter((c) => !c.empty).length, 0);
  meta.layout = stats.withLabel > outRows.length * 0.2 ? 'tte' : 'classic';
  meta.kind = 'four-column';
  meta.source = 'pdf';
  meta.pages = ex.pages.length;
  // Zeilen ohne jeden Text (nur Nummer) nicht ausgeben
  const empties = outRows.filter((r) => Object.values(r.cells).every((c) => c.empty));
  if (empties.length) warnings.push(warn('empty-row', `${empties.length} Zeilen ohne Text übersprungen (Nr. ${empties.map((r) => r.num).join(', ')})`));
  const kept = outRows.filter((r) => !empties.includes(r));
  stats.rows = kept.length;
  return { meta, columns, rows: uniqueDerivedLabels(kept), warnings, stats, footnotes };
}

/** Fussnoten unterhalb der Tabelle je Seite (ohne wiederkehrende Fusszeilen) */
function pageFootnotes(pages) {
  const key = (L) => lineText(L).replace(/\d+/g, '#');
  const freq = new Map();
  for (const p of pages) for (const L of p.below || []) { const k = key(L); freq.set(k, (freq.get(k) || 0) + 1); }
  const minRep = Math.max(3, pages.length * 0.3);
  const out = [];
  for (const p of pages) {
    const lines = (p.below || []).filter((L) => (freq.get(key(L)) || 0) < minRep);
    let cur = null;
    for (const L of lines) {
      const first = L.items[0];
      const t = lineText(L);
      const m = /^(\d{1,3})\s*(.*)$/.exec(t);
      const numStart = m && first && /^\d{1,3}$/.test(first.str.trim());
      if (numStart) {
        cur = { page: p.n, n: m[1], text: m[2] };
        out.push(cur);
      } else if (cur) cur.text = (cur.text ? cur.text + ' ' : '') + t;
    }
  }
  return out.filter((f) => f.text);
}

function bodyFont(pages) {
  const fam = new Map(), sizes = new Map();
  for (const p of pages) for (const b of p.bands) for (const i of b.items) {
    const f = fontFamily(i.font); const n = i.str.length;
    fam.set(f, (fam.get(f) || 0) + n);
    const sz = Math.round(i.size * 2) / 2; sizes.set(sz, (sizes.get(sz) || 0) + n);
  }
  const top = (m) => [...m].sort((a, b) => b[1] - a[1])[0];
  const f = top(fam), z = top(sizes);
  return f && z ? { family: f[0], size: z[0] } : null;
}

/** Seitenintervall -> Intervall dieses Bandes (bei eingerückten Zeilen andere Grenzen) */
function bandInterval(band, pageIv, iv) {
  if (!band.intervals || band.intervals === pageIv) return iv;
  const k = pageIv.indexOf(iv);
  if (band.intervals.length === pageIv.length && k >= 0) return band.intervals[k];
  let best = null, bo = 0;
  for (const v of band.intervals) { const o = Math.min(v.x1, iv.x1) - Math.max(v.x0, iv.x0); if (o > bo) { bo = o; best = v; } }
  return best && bo > iv.w * 0.5 ? best : null;
}

function preferredOrder(columns) {
  const pref = ['com', 'council', 'ep', 'agreement'];
  const idx = [];
  for (const t of pref) { const i = columns.findIndex((c) => c.suggestedTrack === t); if (i >= 0) idx.push(i); }
  for (let i = 0; i < columns.length; i++) if (!idx.includes(i)) idx.push(i);
  return idx;
}

function looksLikeContinuation(prev, cells) {
  // Ohne Zeilennummern: Fortsetzung, wenn der Text der ersten gefüllten Spalte klein beginnt
  // oder die vorherige Zelle nicht mit Satzzeichen endet.
  for (const ci of Object.keys(cells)) {
    const c = cells[ci];
    if (!c.segs.length) continue;
    const first = (c.segs.find((s) => s.t && s.t.trim()) || {}).t || '';
    if (/^[a-z]/.test(first.trim())) return true;
    const pc = prev._cells[ci];
    const last = pc && pc.segs.length ? pc.segs.filter((s) => s.t).map((s) => s.t).join('').trim() : '';
    if (last && !/[.;:]$/.test(last)) return true;
    return false;
  }
  return false;
}

function bandText(band) {
  return groupLines(band.items).map(lineText).join(' ').replace(/\s+/g, ' ').trim();
}

function crossesBoundaries(band, map) {
  // Text, der deutlich über eine innere Spaltengrenze läuft (verbundene Zelle ohne Linien)
  if (!map.numIv) return false;
  const inner = band.intervals ? band.intervals.slice(1).map((v) => v.x0) : map.innerX;
  return band.items.some((i) => inner.some((x) => i.x0 < x - 4 && i.x1 > x + 8)) && !band.items.some((i) => i.x0 >= map.numIv.x0 - 1 && i.x0 < map.numIv.x1 && /^\d+[a-z]*$/i.test(i.str.trim()));
}

function buildModel(intervals, labels, p) {
  // Nummernspalte: erste schmale Spalte ohne Spaltentitel; Rinnen: sehr schmale Spalten ohne Titel
  const cols = [];
  let numIdx = -1;
  intervals.forEach((iv, k) => {
    const lab = labels[k] || '';
    if (k === 0 && iv.w < 75 && !HEADER_RE.test(lab)) { numIdx = k; return; }
    if (iv.w < 22 && !lab) return;
    cols.push({ header: lab, x0: iv.x0, x1: iv.x1, ivIndex: k });
  });
  return { cols, numIdx, intervals, width: p.width };
}

function mapColumns(p, model, warnings) {
  // Seite -> Dokumentspalten. Bevorzugt über Kopfzeile, sonst über Lage.
  const iv = p.intervals;
  const hb = p.headerBand !== undefined ? p.headerBand : headerBandOf(p);
  if (!hb && model.lastMap && sameGrid(model.lastMap.iv, p.intervals)) return { ...model.lastMap.map, innerX: p.intervals.slice(1).map((v) => v.x0) };
  const cols = [];
  let numIv = null;
  if (model.numIdx === 0) {
    const m = model.intervals[0];
    numIv = iv.find((v) => v.w < 75 && Math.min(v.x1, m.x1) - Math.max(v.x0, m.x0) > m.w * 0.6) || null;
  }
  const labels = hb ? headerLabels(hb, iv) : null;
  for (let ci = 0; ci < model.cols.length; ci++) {
    const mc = model.cols[ci];
    let found = null;
    if (labels && mc.header) {
      const k = labels.findIndex((l) => l && l === mc.header);
      if (k >= 0) found = iv[k];
    }
    if (!found && !labels) {
      // Seite ohne Kopfzeile: grösste Überlappung mit der Lage im Spaltenmodell
      let best = null, bo = 0;
      for (const v of iv) { const o = Math.min(v.x1, mc.x1) - Math.max(v.x0, mc.x0); if (o > bo) { bo = o; best = v; } }
      if (best && bo > (mc.x1 - mc.x0) * 0.6 && !cols.includes(best)) found = best;
    }
    cols.push(found);
  }
  if (labels) {
    // Spalten mit Titel, die im Modell fehlen (z. B. zweite Tabelle mit anderen Spalten): Warnung
    const extra = labels.filter((l, k) => l && HEADER_RE.test(l) && !model.cols.some((c) => c.header === l) && iv[k] !== numIv);
    if (extra.length) warnings.push(warn('column-unknown', `Spalte(n) "${extra.join('", "')}" auf Seite ${p.n} nicht im Spaltenmodell; Text dieser Spalten wird nicht übernommen`, { page: p.n }));
  }
  if (cols.filter(Boolean).length < Math.min(2, model.cols.length)) {
    warnings.push(warn('columns-unmapped', `Spalten auf Seite ${p.n} nicht zuordenbar; Seite übersprungen`, { page: p.n }));
    return null;
  }
  const innerX = iv.slice(1).map((v) => v.x0);
  const map = { cols: cols.map((c) => (c ? iv.find((v) => v === c) : null)), numIv, innerX };
  if (hb) model.lastMap = { iv, map };
  return map;
}

function sameGrid(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((v, k) => Math.abs(v.x0 - b[k].x0) < 2 && Math.abs(v.x1 - b[k].x1) < 2);
}

function collectPitches(pages, pitches) {
  const acc = new Map();
  for (const p of pages) {
    for (const b of p.bands) {
      if (b.full) continue;
      for (const iv of p.intervals) {
        const its = b.items.filter((i) => i.x0 >= iv.x0 - 1 && i.x0 < iv.x1 - 0.5);
        const L = groupLines(its);
        for (let k = 1; k < L.length; k++) {
          const d = L[k].y - L[k - 1].y;
          if (Math.round(L[k].size) !== Math.round(L[k - 1].size)) continue;
          const key = Math.round(L[k].size);
          if (!acc.has(key)) acc.set(key, []);
          const arr = acc.get(key);
          if (arr.length < 4000) arr.push(d);
        }
      }
    }
  }
  for (const [k, arr] of acc) {
    // häufigster Abstand (Modus auf 0.5 pt)
    const h = new Map();
    for (const d of arr) { const r = Math.round(d * 2) / 2; h.set(r, (h.get(r) || 0) + 1); }
    let best = null, bn = 0;
    for (const [r, n] of h) if (n > bn && r > k * 0.8) { bn = n; best = r; }
    if (best) pitches.set(k, best);
  }
}

function cellSegments(items, deco, band, pitch, body) {
  // Hinweise des Trilogue Table Editor ("Text Origin: …") und Themen-Etiketten (Text auf dunkler Fläche) abtrennen
  const notes = [], tags = [];
  const darkFills = band.fills.filter((f) => lum(f.color) < 0.45 && hsv(f.color).s > 0.3);
  const plain = [];
  for (const it of items) {
    if (darkFills.some((f) => it.x0 >= f.x0 - 1 && it.x1 <= f.x1 + 1 && it.y >= f.y0 && it.y - it.size * 0.6 <= f.y1)) { tags.push(it); continue; }
    plain.push(it);
  }
  let lines = groupLines(plain);
  // "Text Origin:"-Hinweise (Monospace): Zeile mit "Text Origin" und Folgezeilen gleicher Schrift
  const keep = [];
  for (let k = 0; k < lines.length; k++) {
    const L = lines[k];
    const s = lineText(L);
    const foreign = body && L.items.every((i) => fontFamily(i.font) !== body.family && i.size <= body.size * 0.96);
    if (/^\s*Text Origin:/i.test(s) || foreign) {
      const font = L.items[0].font;
      let t = s;
      while (k + 1 < lines.length && lines[k + 1].items.every((i) => i.font === font)) { k++; t += ' ' + lineText(lines[k]); }
      notes.push(t.replace(/\s+/g, ' '));
      continue;
    }
    keep.push(L);
  }
  lines = keep;
  let decoUsed = 0, strikes = 0, fnLines = 0;
  if (deco.length) {
    for (const L of lines) {
      const before = L.items.length;
      L.items = decorate(L.items, deco);
      const u = L.items.filter((i) => i.u || i.s);
      if (u.length) decoUsed++;
      strikes += L.items.filter((i) => i.s).length;
      void before;
    }
  }
  for (const L of lines) if (/^_{5,}$/.test(lineText(L))) fnLines++;
  const segs = linesToSegments(lines, pitch);
  const tagText = groupLines(tags).map(lineText).filter(Boolean);
  return { segs, notes, tags: tagText, decoUsed, strikes, fnLines };
}

// ------------------------------------------------------------------ Metadaten

function docMeta(ex, analyzed) {
  const first = ex.pages[0];
  const t1 = first ? pageText(first) : '';
  const t2 = ex.pages[1] ? pageText(ex.pages[1]) : '';
  const all = t1 + '\n' + t2;
  // Fusszeile der Tabellenseiten (Titel, Verfahren, Datum)
  const foot = analyzed.find((p) => p.table && p.outside && p.outside.length);
  const footText = foot ? foot.outside.map((i) => i.str).join(' ') : '';
  const meta = {
    ref: parseDocRef(t1.split('\n').slice(0, 12).join(' ')) || null,
    date: parseDateEn(t1.split('\n').slice(0, 8).join(' ')) || parseDateEn(footText),
    procedure: parseProcedure(all) || parseProcedure(footText),
    classification: parseClassification(t1) || 'public',
    title: null,
  };
  const subj = /Subject:\s*([\s\S]{10,600}?)(?:\n\s*\n|Delegations will find|In view of|\n[A-Z][a-z]+ will find)/.exec(t1);
  if (subj) meta.title = subj[1].replace(/\s+/g, ' ').trim();
  else {
    const m = /(Proposal for a[\s\S]{10,400}?\(COD\))/i.exec(all);
    if (m) meta.title = m[1].replace(/\s+/g, ' ').trim();
  }
  meta.footer = footText.replace(/\s+/g, ' ').trim().slice(0, 400) || null;
  if (ex.meta && ex.meta.created) meta.pdfCreated = ex.meta.created;
  return meta;
}

/**
 * Vier-Spalten-PDF lesen.
 * @param {Uint8Array} bytes
 * @param {{pdfjs:object, onProgress?:(p:{phase:string,done:number,total:number})=>void, pages?:number[]}} opts
 */
export async function parseFourColumnPdf(bytes, opts = {}) {
  const ex = await extractPdfPages(bytes, { pdfjs: opts.pdfjs, onProgress: opts.onProgress, pages: opts.pages });
  if (!ex.pages.length) return { meta: { kind: 'four-column', source: 'pdf' }, columns: [], rows: [], warnings: ex.warnings, stats: { pages: 0, rows: 0 } };
  return analyzeFourColumnPages(ex, opts);
}
