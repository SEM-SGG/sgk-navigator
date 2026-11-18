// SGK-Navigator — Karten als PDF mit echtem, durchsuchbarem Text (ESM, isomorph; jsPDF + eingebettete Teilmengen-Schriften).
//
// cardToPdf(card, { format: "a4" | "16x9", onWarning?, date? }) -> Uint8Array   (date: ISO-Datum, macht die Ausgabe reproduzierbar)
// cardsToPdf(cards, opts) -> Uint8Array          (Sammelkorb; jede Karte beginnt auf neuer Seite, Seitenzahlen fortlaufend)
//
// Satz: eigener Zeilenumbruch nur an Leerzeichen (U+0020), keine Silbentrennung, Flattersatz. Gliederungszeichen hängend.
// Seitenumbruch nur zwischen Zeilen; Überschrift/Metazeile bleiben mit den ersten zwei Textzeilen zusammen;
// erste und letzte Zeile eines Absatzes stehen nie allein (Schusterjunge/Hurenkind). Kopf nur auf der ersten Seite einer Karte,
// Seitenfuss (Titel, «Seite i von n») nur bei mehreren Seiten. Gegenüberstellung als Tabelle mit wiederholtem Kopf;
// zu lange Zeilen werden zwischen Textzeilen geteilt.

import { CARBON } from '../app/tokens.js';
import { jsPDF } from 'jspdf';
import { normalizeCard, assertCard, uiLocale, label as lbl, blockIndents } from './model.js';
import { PDF_FONTS, pdfStyle, loadFont, registerFonts } from './fonts.js';

export const PDF_FORMATS = {
  a4: {
    w: 595.28, h: 841.89, orient: 'portrait', ml: 51, mr: 51, mt: 46, mb: 54,
    body: 10, lead: 1.42, cell: 9.5, ui: 9, title: 20, sub: 11.5, unit: 9.5, head: 9.5, meta: 8, src: 7.5, brand: 8,
    step: 22, labelCol: 82, bar: 13, cellPad: 5,
  },
  '16x9': {
    w: 960, h: 540, orient: 'landscape', ml: 48, mr: 48, mt: 36, mb: 40,
    body: 15, lead: 1.36, cell: 13, ui: 12.5, title: 26, sub: 15, unit: 12.5, head: 13, meta: 11, src: 10, brand: 11,
    step: 30, labelCol: 132, bar: 16, cellPad: 7,
  },
};

const SCALED = ['body', 'cell', 'ui', 'title', 'sub', 'unit', 'head', 'meta', 'src', 'brand', 'step', 'labelCol', 'bar', 'cellPad'];
/** Format mit verkleinerter Schrift (Ränder unverändert) */
function scaleFormat(F, s) {
  const G = { ...F };
  for (const k of SCALED) G[k] = F[k] * s;
  return G;
}

// Farben aus dem Design System Carbon (src/app/tokens.js): Karte schwarz-weiss mit Diff- und Aktfarben, kein Blau.
const C = {
  text: CARBON.ink, meta: CARBON['ink-muted'], rule: CARBON['hairline-strong'], light: CARBON['border-strong'], brand: CARBON.ink,
  ins: CARBON['diff-ins-text'], insBg: CARBON['diff-ins-bg'], del: CARBON['diff-del-text'], delBg: CARBON['diff-del-bg'], headBg: CARBON['surface-1'],
  flag: { reconstructed: CARBON['ink-muted'], pending: CARBON['pending-text'], 'not-applicable': CARBON['pending-text'], preview: CARBON['ink-muted'], editorial: CARBON['ink-muted'], derogation: CARBON['error-text'], info: CARBON['ink-muted'] },
};

// Ersatz für Zeichen, die keine der beiden Schriften kennt (sollte bei SGK-Text nicht vorkommen; wird gemeldet)
const SUBST = { '­': '', '​': '', '‌': '', '‍': '', '﻿': '', '\t': ' ', '‑': '-', ' ': ' ', ' ': ' ' };

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ------------------------------------------------------------------ Messen und Schriftwahl

class Measure {
  constructor(doc, warn) {
    this.doc = doc;
    this.cache = new Map();
    this.warn = warn;
    this.cps = {};
    for (const [fam, f] of Object.entries(PDF_FONTS)) for (const [st, key] of Object.entries(f.styles)) this.cps[fam + ':' + st] = loadFont(key).cps;
    this.cur = null;
  }
  setFont(fam, st) {
    const k = fam + ':' + st;
    if (this.cur !== k) { this.doc.setFont(PDF_FONTS[fam].name, st); this.cur = k; }
  }
  width(text, fam, st, size) {
    if (!text) return 0;
    const k = fam + ':' + st + '\u0000' + text;
    let w = this.cache.get(k);
    if (w === undefined) {
      this.setFont(fam, st);
      w = this.doc.getStringUnitWidth(text);
      this.cache.set(k, w);
    }
    return w * size;
  }
  /** Text in Stücke mit verfügbarer Schrift zerlegen: [{ t, fam, st }] */
  resolve(text, fam, b, i) {
    const out = [];
    const other = fam === 'serif' ? 'sans' : 'serif';
    let last = null;
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      let f = fam, c = ch;
      let st = pdfStyle(f, b, i);
      if (!this.cps[f + ':' + st].has(cp) && cp > 32) {
        const st2 = pdfStyle(other, b, i);
        if (this.cps[other + ':' + st2].has(cp)) { f = other; st = st2; } else if (ch in SUBST) { c = SUBST[ch]; if (c && !this.cps[f + ':' + st].has(c.codePointAt(0))) c = '?'; }
        else { c = '?'; this.warn && this.warn(`Zeichen U+${cp.toString(16).toUpperCase().padStart(4, '0')} in keiner Schrift, ersetzt durch «?»`); }
      }
      if (!c) continue;
      if (last && last.fam === f && last.st === st) last.t += c; else { last = { t: c, fam: f, st }; out.push(last); }
    }
    return out;
  }
}

// ------------------------------------------------------------------ Zeilenumbruch

/**
 * Piece = { t, fam:'serif'|'sans', b, i, size, color, op:'eq'|'ins'|'del', sup, sub } | { box:'#rrggbb', size }
 * Liefert Zeilen: [{ items:[{ x, w, t?, fam, st, size, color, op, sup, sub, box? }], w }]
 */
function breakLines(M, pieces, width) {
  // 1. Atome: Wortteile, Leerzeichen, Zeilenumbrüche
  const atoms = [];
  for (const p of pieces) {
    if (p.box) { atoms.push({ kind: 'word', part: { box: p.box, size: p.size, w: p.size * 0.72, gap: p.size * 0.35 } }); continue; }
    const size = p.sup || p.sub ? p.size * 0.66 : p.size;
    for (const seg of M.resolve(p.t, p.fam, p.b, p.i)) {
      for (const tok of seg.t.match(/\n|[ ]+|[^ \n]+/g) || []) {
        if (tok === '\n') atoms.push({ kind: 'br' });
        else {
          const part = { t: tok, fam: seg.fam, st: seg.st, size, base: p.size, color: p.color, op: p.op || 'eq', sup: p.sup, sub: p.sub };
          part.w = M.width(tok, seg.fam, seg.st, size);
          atoms.push({ kind: tok[0] === ' ' ? 'space' : 'word', part });
        }
      }
    }
  }
  // 2. Wörter (Teile ohne Leerzeichen dazwischen) mit vorangehendem Leerraum
  const words = [];
  let pendSpace = [], cur = null;
  for (const a of atoms) {
    if (a.kind === 'br') { words.push({ br: true }); cur = null; pendSpace = []; continue; }
    if (a.kind === 'space') { cur = null; pendSpace.push(a.part); continue; }
    if (!cur) { cur = { parts: [], space: pendSpace }; pendSpace = []; words.push(cur); }
    const prev = cur.parts[cur.parts.length - 1];
    // Gestrichenes direkt vor Eingefügtem (oder umgekehrt) ohne Leerzeichen: kleiner sichtbarer Abstand, kein Zeichen
    if (prev && !prev.box && !a.part.box && prev.op !== a.part.op && prev.op !== 'eq' && a.part.op !== 'eq') a.part = { ...a.part, gap0: a.part.size * 0.3 };
    cur.parts.push(a.part);
  }
  // 3. Zeilen füllen
  const lines = [];
  let line = { items: [], w: 0 };
  const flush = () => { lines.push(line); line = { items: [], w: 0 }; };
  const place = (parts) => { for (const p of parts) { if (p.gap0 && line.items.length) line.w += p.gap0; line.items.push({ ...p, x: line.w }); line.w += p.box ? p.w + p.gap : p.w; } };
  for (const wd of words) {
    if (wd.br) { flush(); continue; }
    const ww = wd.parts.reduce((a, p, k) => a + (p.box ? p.w + p.gap : p.w) + (k && p.gap0 ? p.gap0 : 0), 0);
    const sw = wd.space.reduce((a, p) => a + p.w, 0);
    if (line.items.length && line.w + sw + ww > width + 0.01) flush();
    if (line.items.length) place(wd.space);
    if (!line.items.length && ww > width) {
      // Notfall: Wort länger als die Zeile, zeichenweise teilen
      for (const p of wd.parts) {
        if (p.box) { place([p]); continue; }
        let buf = '';
        for (const ch of p.t) {
          const w2 = M.width(buf + ch, p.fam, p.st, p.size);
          if (line.w + w2 > width && buf) { place([{ ...p, t: buf, w: M.width(buf, p.fam, p.st, p.size) }]); flush(); buf = ch; } else buf += ch;
        }
        if (buf) place([{ ...p, t: buf, w: M.width(buf, p.fam, p.st, p.size) }]);
      }
      continue;
    }
    place(wd.parts);
  }
  if (line.items.length || !lines.length) flush();
  // Leerzeichen am Zeilenende entfernen
  for (const l of lines) {
    while (l.items.length && l.items[l.items.length - 1].t && /^ +$/.test(l.items[l.items.length - 1].t)) l.items.pop();
    l.w = l.items.length ? l.items[l.items.length - 1].x + l.items[l.items.length - 1].w : 0;
  }
  return lines;
}

/** Gleich formatierte Nachbarn zu einem Textaufruf zusammenfassen (weniger Operatoren, sauberer Textfluss) */
function mergeItems(items) {
  const out = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && !it.box && !last.box && last.fam === it.fam && last.st === it.st && last.size === it.size && last.color === it.color && last.op === it.op && !!last.sup === !!it.sup && !!last.sub === !!it.sub && Math.abs(last.x + last.w - it.x) < 0.01) {
      last.t += it.t; last.w += it.w;
    } else out.push({ ...it });
  }
  return out;
}

function drawLine(doc, M, line, x0, baseline) {
  for (const it of mergeItems(line.items)) {
    const x = x0 + it.x;
    if (it.box) {
      doc.setFillColor(...hex(it.box));
      doc.rect(x, baseline - it.size * 0.68, it.w, it.w, 'F');
      continue;
    }
    const base = it.base || it.size;
    const y = it.sup ? baseline - base * 0.36 : it.sub ? baseline + base * 0.12 : baseline;
    if (it.op === 'ins' || it.op === 'del') {
      doc.setFillColor(...hex(it.op === 'ins' ? C.insBg : C.delBg));
      doc.rect(x, baseline - base * 0.86, it.w, base * 1.12, 'F');
    }
    M.setFont(it.fam, it.st);
    doc.setFontSize(it.size);
    doc.setTextColor(...hex(it.op === 'ins' ? C.ins : it.op === 'del' ? C.del : it.color || C.text));
    doc.text(it.t, x, y, { baseline: 'alphabetic' });
    if (it.op === 'ins' || it.op === 'del') {
      doc.setDrawColor(...hex(it.op === 'ins' ? C.ins : C.del));
      doc.setLineWidth(Math.max(0.5, base * 0.06));
      const ly = it.op === 'ins' ? baseline + base * 0.13 : baseline - base * 0.27;
      doc.line(x, ly, x + it.w, ly);
    }
  }
}

// ------------------------------------------------------------------ Flussobjekte

/**
 * Item: { h, before, keepNext, indent, bar, draw(doc, x, yTop, width), split?(avail) -> [a, b] | null, header?: Item, isHeader?: boolean }
 */
function textItems(M, F, pieces, { width, indent = 0, size, before = 0, after = 0, lead = F.lead, keepNext = false, bar = null, hangLabel = null, orphans = true }) {
  const lines = breakLines(M, pieces, width);
  const h = size * lead;
  return lines.map((ln, k) => {
    const it = {
      h, before: k === 0 ? before : 0, keepNext: false, bar, line: ln,
      draw: (doc, x, y) => {
        const bl = y + (h - size) / 2 + size * 0.8;
        if (k === 0 && hangLabel) drawLine(doc, M, hangLabel.line, x + indent - hangLabel.hang, bl);   // Zeichen zuerst: Lesereihenfolge
        drawLine(doc, M, ln, x + indent, bl);
      },
    };
    if (k === lines.length - 1) it.after = after;
    return it;
  }).map((it, k, arr) => {
    if (keepNext) it.keepNext = true;
    else if (orphans && arr.length > 1 && (k === 0 || k === arr.length - 2)) it.keepNext = true;
    return it;
  });
}

const space = (h) => ({ h, before: 0, keepNext: false, space: true, draw() {} });

/** Pieces eines Rechtstext-Blocks */
function runPieces(runs, size, extra = {}) {
  return runs.map((r) => ({ t: r.t, fam: 'serif', b: r.b || extra.b, i: r.i || extra.i, size, color: extra.color || C.text, op: r.op, sup: r.sup, sub: r.sub }));
}

/** Blockfolge -> Items (Abschnitt oder Zelle) */
function blockItems(M, F, blocks, { width, size, bar = null, x0 = 0, first = true }) {
  const out = [];
  const lead = F.lead;
  const ind = blockIndents(blocks, { step: F.step, hang: (l) => M.width(l, 'serif', 'normal', size) + size * 0.55 });
  blocks.forEach((b, k) => {
    const before = k === 0 && first ? size * 0.35 : size * 0.42;
    const { left, hang } = ind[k];
    if (b.type === 'table') {
      if (b.label) out.push(...textItems(M, F, [{ t: b.label, fam: 'serif', size, color: C.text }], { width: width - left + hang, indent: x0 + left - hang, size, before, bar, keepNext: true }));
      out.push(...tableBlockItems(M, F, b, { width: width - left, x: x0 + left, size: size * 0.92, bar }));
      return;
    }
    const extra = b.type === 'heading' ? { b: true } : b.type === 'img' ? { i: true, color: C.meta } : {};
    const pieces = runPieces(b.runs, size, extra);
    if (!pieces.length) pieces.push({ t: ' ', fam: 'serif', size, color: C.text });
    let hangLabel = null;
    if (b.label) {
      const ll = breakLines(M, [{ t: b.label, fam: 'serif', b: b.type === 'heading', size, color: C.text, op: 'eq' }], 1e6)[0];
      hangLabel = { line: ll, hang };
    }
    out.push(...textItems(M, F, pieces, { width: width - left, indent: x0 + left, size, before, lead, bar, hangLabel, keepNext: b.type === 'heading' }));
  });
  return out;
}

/** Grid-Zeile: Spalten mit gestapelten Zeilen-Items; teilbar zwischen Zeilen */
function gridItem(cols, { pad, rules = 'h', fill = null, bar = null, minH = 0 }) {
  // cols: [{ x, w, items:[Item] }]  -> Positionen berechnen
  const stack = (items) => { let y = 0; const pos = []; items.forEach((it, k) => { y += k ? it.before || 0 : 0; pos.push({ it, dy: y }); y += it.h; }); return { pos, h: y }; };
  const laid = cols.map((c) => ({ ...c, ...stack(c.items) }));
  const h = Math.max(minH, ...laid.map((c) => c.h)) + 2 * pad;
  const item = {
    h, before: 0, keepNext: false, bar, grid: true,
    draw(doc, x, y) {
      const bx = (c) => (c.bx !== undefined ? c.bx : c.x), bw = (c) => (c.bw !== undefined ? c.bw : c.w);
      const x1 = x + bx(laid[0]), x2 = x + bx(laid[laid.length - 1]) + bw(laid[laid.length - 1]);
      if (fill) { doc.setFillColor(...hex(fill)); doc.rect(x1, y, x2 - x1, h, 'F'); }
      for (const c of laid) for (const p of c.pos) p.it.draw(doc, x + c.x, y + pad + p.dy);
      doc.setDrawColor(...hex(C.light));
      doc.setLineWidth(0.6);
      doc.line(x1, y + h, x2, y + h);
      if (rules === 'box') { doc.line(x1, y, x2, y); for (const c of laid) doc.line(x + bx(c), y, x + bx(c), y + h); doc.line(x2, y, x2, y + h); }
      else for (const c of laid.slice(1)) doc.line(x + bx(c), y, x + bx(c), y + h);
    },
    split(avail) {
      const lim = avail - 2 * pad;
      if (lim <= 0) return null;
      const a = [], b = [];
      let any = false, rest = false;
      for (const c of laid) {
        const fa = [], fb = [];
        for (const p of c.pos) {
          if (p.dy + p.it.h <= lim + 0.01 && !fb.length) fa.push(p.it); else fb.push(p.it);
        }
        // keine einzelne Zeile auf der Folgeseite (Hurenkind): mindestens zwei Zeilen hinübernehmen, sofern vorn drei bleiben
        const textLines = (arr) => arr.filter((it) => !it.mark).length;
        while (fb.length && textLines(fb) < 2 && textLines(fa) > 3) fb.unshift(fa.pop());
        if (fa.length) any = true;
        if (fb.length) rest = true;
        a.push({ x: c.x, w: c.w, bx: c.bx, bw: c.bw, items: fa });
        b.push({ x: c.x, w: c.w, bx: c.bx, bw: c.bw, items: fb.map((it, k) => (k === 0 ? { ...it, before: 0 } : it)) });
      }
      if (!any || !rest) return null;
      return [gridItem(a, { pad, rules, fill, bar }), gridItem(b, { pad, rules, fill, bar })];
    },
  };
  return item;
}

function tableBlockItems(M, F, b, { width, x, size, bar }) {
  const ncols = Math.max(...b.rows.map((r) => r.cells.reduce((a, c) => a + c.span, 0)));
  const cw = width / ncols;
  const pad = 3;
  return b.rows.map((r) => {
    let col = 0;
    const cols = r.cells.map((c) => {
      const w = cw * c.span;
      const cx = x + col * cw;
      col += c.span;
      const pieces = runPieces(c.runs, size, r.header ? { b: true } : {});
      return { x: cx + pad, w: w - 2 * pad, bx: cx, bw: w, items: pieces.length ? textItems(M, F, pieces, { width: w - 2 * pad, size, orphans: false }) : [] };
    });
    return gridItem(cols, { pad, rules: 'box', bar });
  });
}

// ------------------------------------------------------------------ Karte -> Items

function cardItems(M, F, card) {
  const W = F.w - F.ml - F.mr;
  const items = [];
  const ui = (t, size, extra = {}) => ({ t, fam: 'sans', size, color: extra.color || C.text, b: extra.b, i: extra.i, op: extra.op });

  // Kopf
  if (card.brand || card.work) {
    const left = card.brand ? breakLines(M, [ui(card.brand, F.brand, { b: true, color: C.brand })], W / 2)[0] : null;
    const right = card.work ? breakLines(M, [ui(card.work, F.brand, { color: C.meta })], W / 2)[0] : null;
    const h = F.brand * 1.5;
    items.push({ h, before: 0, keepNext: true, draw(doc, x, y) { const bl = y + F.brand * 1.05; if (left) drawLine(doc, M, left, x, bl); if (right) drawLine(doc, M, right, x + W - right.w, bl); } });
    items.push(space(F.brand * 0.6));
  }
  // Carbon: Zitierung in Plex Sans (SGKN Sans), nicht fett, gross (display-md; im PDF ohne Schnitt 300)
  items.push(...textItems(M, F, [{ t: card.title, fam: 'sans', size: F.title * 1.15, color: C.text }], { width: W, size: F.title * 1.15, lead: 1.2, keepNext: true }));
  if (card.subtitle) items.push(...textItems(M, F, [ui(card.subtitle, F.sub)], { width: W, size: F.sub, lead: 1.35, before: F.sub * 0.25, keepNext: true }));
  if (card.unitLine) items.push(...textItems(M, F, [ui(card.unitLine, F.unit, { color: C.meta })], { width: W, size: F.unit, lead: 1.35, before: F.unit * 0.2, keepNext: true }));
  items.push({ h: F.body * 1.3, before: 0, keepNext: true, draw(doc, x, y) { doc.setDrawColor(...hex(C.rule)); doc.setLineWidth(1.1); doc.line(x, y + F.body * 0.55, x + W, y + F.body * 0.55); } });
  if (card.stats) items.push(...textItems(M, F, [ui(card.stats, F.meta, { color: C.meta })], { width: W, size: F.meta, lead: 1.4, keepNext: true, after: F.meta * 0.5 }));

  // Abschnitte
  card.sections.forEach((s, si) => {
    const bar = s.color ? { color: s.color, id: 'sec' + si } : { color: C.light, id: 'sec' + si };
    const inW = W - F.bar;
    const head = [];
    if (s.code) head.push(ui(s.code + '  ', F.head, { b: true }));
    if (s.heading) head.push(ui(s.heading, F.head));
    if (s.tag) head.push(ui('   ' + s.tag, F.head, { b: true, color: '#3A4250' }));
    for (const f of s.flags) head.push(ui('   [' + f.label + ']', F.head * 0.92, { color: C.flag[f.kind] || C.meta }));
    const before = si === 0 ? F.body * 0.4 : F.body * 1.15;
    if (head.length) items.push(...textItems(M, F, head, { width: inW, indent: F.bar, size: F.head, lead: 1.45, before, keepNext: true, bar }));
    if (s.meta.length) items.push(...textItems(M, F, [ui(s.meta.join(' | '), F.meta, { color: C.meta })], { width: inW, indent: F.bar, size: F.meta, lead: 1.45, keepNext: true, bar }));
    items.push(...blockItems(M, F, s.blocks, { width: inW, size: F.body, bar, x0: F.bar }));
  });

  // Gegenüberstellung
  if (card.columns && card.rows && card.rows.length) {
    const withLabels = card.rows.some((r) => r.label || r.tag) || !!card.labelHeading;
    const pad = F.cellPad;
    const lw = withLabels ? F.labelCol : 0;
    const cw = (W - lw) / 2;
    const xs = withLabels ? [0, lw, lw + cw] : [0, cw];
    const ws = withLabels ? [lw, cw, cw] : [cw, cw];
    const cellCols = (contents) => contents.map((items, k) => ({ x: xs[k] + pad, w: ws[k] - 2 * pad, bx: xs[k], bw: ws[k], items }));
    const headCells = [];
    if (withLabels) headCells.push(textItems(M, F, [ui(card.labelHeading || '', F.meta, { b: true })], { width: lw - 2 * pad, size: F.meta, lead: 1.35 }));
    for (const c of card.columns) headCells.push(textItems(M, F, [ui(c.heading, F.ui, { b: true })], { width: cw - 2 * pad, size: F.ui, lead: 1.35 }));
    const header = gridItem(cellCols(headCells), { pad, fill: C.headBg });
    header.isHeader = true;
    header.before = F.body * 0.5;
    header.keepNext = true;
    items.push(header);
    const empty = lbl(card, 'empty');
    for (const r of card.rows) {
      const contents = [];
      if (withLabels) {
        const li = [];
        if (r.label) li.push(...textItems(M, F, [ui(r.label, F.meta, { b: true })], { width: lw - 2 * pad, size: F.meta, lead: 1.4, orphans: false }));
        if (r.tag) li.push(...textItems(M, F, [ui(r.tag, F.meta * 0.92, { color: C.meta })], { width: lw - 2 * pad, size: F.meta * 0.92, lead: 1.4, before: 2, orphans: false }));
        contents.push(li);
      }
      for (const cell of r.cells) {
        if (!cell) { contents.push(textItems(M, F, [ui(empty, F.cell, { color: C.meta })], { width: cw - 2 * pad, size: F.cell })); continue; }
        const ci = blockItems(M, F, cell.blocks, { width: cw - 2 * pad, size: F.cell, first: false }).map((it, k) => (k === 0 ? { ...it, before: 0 } : it));
        if (cell.marks && cell.marks.length) {
          const mp = [];
          cell.marks.forEach((m, k) => { if (k) mp.push(ui('   ', F.meta * 0.92)); if (m.color) mp.push({ box: m.color, size: F.meta * 0.92 }); mp.push(ui(m.label, F.meta * 0.92, { color: C.meta })); });
          ci.push(...textItems(M, F, mp, { width: cw - 2 * pad, size: F.meta * 0.92, lead: 1.4, before: F.cell * 0.3, orphans: false }).map((it) => Object.assign(it, { mark: true })));
        }
        contents.push(ci);
      }
      const g = gridItem(cellCols(contents), { pad });
      g.header = header;
      items.push(g);
    }
  }

  // Fuss
  const foot = [];
  for (const f of card.footnotes) foot.push([{ t: f.mark, fam: 'sans', size: F.src, color: C.meta, sup: true }, ui(' ' + f.text, F.src, { color: C.meta })]);
  const leg = [];
  for (const l of card.legend) {
    if (leg.length) leg.push(ui('     ', F.meta));
    if (l.op) leg.push(ui(l.label, F.meta, { op: l.op }));
    else { if (l.color) leg.push({ box: l.color, size: F.meta }); if (l.code) leg.push(ui(l.code + ' ', F.meta, { b: true })); leg.push(ui(l.label, F.meta)); }
  }
  // Fuss (Trennlinie, Fussnoten, Legende, Quelle, Hinweis) bleibt beisammen, sofern er auf eine Seite passt
  const fi = [];
  fi.push({ h: F.body * 1.2, before: F.body * 0.6, draw(doc, x, y) { doc.setDrawColor(...hex(C.light)); doc.setLineWidth(0.7); doc.line(x, y + F.body * 0.6, x + W, y + F.body * 0.6); } });
  for (const fp of foot) fi.push(...textItems(M, F, fp, { width: W, size: F.src, lead: 1.4, orphans: false }));
  if (leg.length) fi.push(...textItems(M, F, leg, { width: W, size: F.meta, lead: 1.7, before: F.src * 0.4, orphans: false }));
  if (card.source) fi.push(...textItems(M, F, [ui(card.source, F.src, { color: C.meta })], { width: W, size: F.src, lead: 1.4, before: F.src * 0.5, orphans: false }));
  if (card.disclaimer) fi.push(...textItems(M, F, [ui(card.disclaimer, F.src, { color: C.meta })], { width: W, size: F.src, lead: 1.4, before: F.src * 0.2, orphans: false }));
  fi.forEach((it, k) => { it.keepNext = k < fi.length - 1; });
  items.push(...fi);
  return items;
}

// ------------------------------------------------------------------ Umbruch auf Seiten

function paginate(items, F) {
  const top = F.mt, bottom = F.h - F.mb, pageH = bottom - top;
  const pages = [];
  let page = [], y = top;
  const newPage = () => { pages.push(page); page = []; y = top; };
  const place = (it, before) => { y += before; page.push({ it, y }); y += it.h + (it.after || 0); };
  const chainH = (i) => {
    let tot = items[i].h;
    let j = i;
    while (items[j].keepNext && j + 1 < items.length) {
      j++;
      const nx = items[j];
      tot += (nx.before || 0) + (nx.grid && nx.split ? Math.min(nx.h, 3 * (F.body * F.lead)) : nx.h);
      if (tot > pageH) return items[i].h;   // Kette länger als eine Seite: ignorieren
    }
    return tot;
  };
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const atTop = page.length === 0 || page.every((p) => p.it.isHeader);
    const before = page.length === 0 ? 0 : it.before || 0;
    // Tabellenkopf auf neuer Seite wiederholen
    if (page.length === 0 && it.header && !it.isHeader) { place(it.header, 0); }
    const need = before + (it.keepNext ? chainH(i) : it.h);
    if (y + need > bottom + 0.01) {
      const avail = bottom - y - before;
      // Tabellenzeilen nur teilen, wenn sie gross sind (über 40 % der Seite); sonst ganz auf die nächste Seite
      const bigRow = it.h > pageH * 0.4;
      if (it.split && (bigRow || atTop) && (!it.keepNext || atTop) && avail > F.body * 2) {
        const parts = it.split(avail);
        if (parts) { place(parts[0], before); newPage(); parts[1].header = it.header; items.splice(i + 1, 0, parts[1]); continue; }
      }
      if (!atTop) { newPage(); i--; continue; }
      if (it.split && y + it.h > bottom) {
        const parts = it.split(bottom - y);
        if (parts) { place(parts[0], 0); newPage(); parts[1].header = it.header; items.splice(i + 1, 0, parts[1]); continue; }
      }
    }
    if (it.space && page.length === 0) continue;
    place(it, before);
  }
  if (page.length) pages.push(page);
  return pages;
}

function drawPage(doc, F, page) {
  // Randmarken der Abschnitte (zusammenhängende Läufe je Abschnitt)
  let run = null;
  const bars = [];
  for (const p of page) {
    const b = p.it.bar;
    if (b && run && run.id === b.id) run.y2 = p.y + p.it.h;
    else { if (run) bars.push(run); run = b ? { id: b.id, color: b.color, y1: p.y, y2: p.y + p.it.h } : null; }
  }
  if (run) bars.push(run);
  for (const b of bars) { doc.setFillColor(...hex(b.color)); doc.rect(F.ml, b.y1 + 1, 2.6, Math.max(0, b.y2 - b.y1 - 1), 'F'); }
  for (const p of page) p.it.draw(doc, F.ml, p.y);
}

/** 32 Hexzeichen aus einem Text (FNV-1a, viermal mit verschiedenen Startwerten); nur als Datei-ID */
function fileId(text) {
  let out = '';
  for (const seed of [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]) {
    let h = seed >>> 0;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    out += h.toString(16).padStart(8, '0');
  }
  return out.toUpperCase();
}

// ------------------------------------------------------------------ Öffentlich

/**
 * Mehrere Karten als ein PDF (Sammelkorb).
 * @param {import('./model.js').Card[]} cards
 * @param {{ format?: 'a4'|'16x9', onWarning?: (msg:string)=>void, title?: string, date?: string, fit?: boolean, minScale?: number }} [opts]
 * @returns {Uint8Array}
 */
export function cardsToPdf(cards, opts = {}) {
  if (!Array.isArray(cards) || !cards.length) throw new Error('cardsToPdf: mindestens eine Karte nötig');
  cards.forEach((c, i) => assertCard(c, cards.length > 1 ? i : null));
  const fk = opts.format === '16x9' || opts.format === '169' ? '16x9' : 'a4';
  const F = PDF_FORMATS[fk];
  const doc = new jsPDF({ unit: 'pt', format: [F.w, F.h].sort((a, b) => a - b), orientation: F.orient, compress: true, putOnlyUsedFonts: true });
  registerFonts(doc);
  const warned = new Set();
  const M = new Measure(doc, (m) => { if (!warned.has(m)) { warned.add(m); if (opts.onWarning) opts.onWarning(m); } });
  const norm = cards.map(normalizeCard);
  const all = [];
  for (const card of norm) {
    let pages = paginate(cardItems(M, F, card), F);
    // Folie: Schrift verkleinern, bis die Karte auf eine Seite passt (wie die Oberfläche; Untergrenze opts.minScale)
    const fit = opts.fit !== undefined ? opts.fit : fk === '16x9';
    if (fit && pages.length > 1) {
      const min = opts.minScale || 0.72;
      const at = (sc) => { const G = scaleFormat(F, sc); return { G, pages: paginate(cardItems(M, G, card), G) }; };
      if (at(min).pages.length === 1) {
        let lo = min, hi = 1, best = at(min);
        for (let k = 0; k < 6; k++) { const mid = (lo + hi) / 2; const r = at(mid); if (r.pages.length === 1) { lo = mid; best = r; } else hi = mid; }
        pages = best.pages;
      }
    }
    for (const pg of pages) all.push({ card, pg });
  }
  const n = all.length;
  all.forEach(({ card, pg }, k) => {
    if (k) doc.addPage([F.w, F.h].sort((a, b) => a - b), F.orient);
    drawPage(doc, F, pg);
    if (n > 1) {
      const sz = F.src;
      const left = breakLines(M, [{ t: card.title, fam: 'sans', size: sz, color: C.meta }], (F.w - F.ml - F.mr) * 0.7)[0];
      const right = breakLines(M, [{ t: lbl(card, 'page', { i: k + 1, n }), fam: 'sans', size: sz, color: C.meta }], 1e6)[0];
      const y = F.h - F.mb + sz * 2;
      drawLine(doc, M, left, F.ml, y);
      drawLine(doc, M, right, F.w - F.mr - right.w, y);
    }
  });
  const first = norm[0];
  doc.setProperties({ title: opts.title || (norm.length === 1 ? [first.title, first.subtitle].filter(Boolean).join(': ') : norm.map((c) => c.title).join('; ')), creator: 'SGK-Navigator', subject: first.subtitle || '' });
  try { doc.setLanguage(uiLocale(first)); } catch { /* Sprache nicht in der Liste von jsPDF */ }
  // Datum und Datei-ID fest, wenn opts.date gesetzt ist: gleiche Eingabe, gleiche Bytes (Node und Browser)
  const when = opts.date ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(opts.date) ? opts.date + 'T00:00:00Z' : opts.date) : new Date();
  if (!Number.isNaN(when.getTime())) doc.setCreationDate(when);
  doc.setFileId(fileId(norm.map((c) => c.title).join('|') + '|' + fk + '|' + when.toISOString() + '|' + all.length));
  return new Uint8Array(doc.output('arraybuffer'));
}

/**
 * Eine Karte als PDF.
 * @param {import('./model.js').Card} card
 * @param {{ format?: 'a4'|'16x9', onWarning?: (msg:string)=>void }} [opts]
 * @returns {Uint8Array}
 */
export function cardToPdf(card, opts = {}) {
  return cardsToPdf([card], opts);
}
