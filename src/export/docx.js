// SGK-Navigator — Karten als Word-Baustein (.docx), eigenes OOXML mit fflate (ESM, isomorph).
//
// cardToDocx(card, { redline: "format"|"tracked", author?, date?, colors? }) -> Uint8Array
// cardsToDocx(cards, opts) -> Uint8Array      (Sammelkorb; jede weitere Karte beginnt auf neuer Seite, pageBreaks:false schaltet ab)
//
// Grundsätze: A4 hoch, Arial 10 pt (LibreOffice: Liberation Sans), keine Kopf-/Fusszeilen, keine Nummerierungsdefinitionen.
// Alle Absätze tragen eigene Formatvorlagen mit Präfix «SGK» (eindeutige IDs und Namen), die vollständig definiert sind
// (nicht auf «Standard» aufbauend), damit der Inhalt beim Kopieren in eine Aktennotiz unverändert aussieht.
// Einzüge und Sprache (w:lang) sind direkt am Absatz bzw. Lauf gesetzt.

import { CARBON } from '../app/tokens.js';
import { zipSync, strToU8 } from 'fflate';
import { normalizeCard, assertCard, textLocale, uiLocale, label as lbl, mergeRedline, blockIndents } from './model.js';

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

// Masse in Twips (1/20 pt)
const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 1134;           // A4, Ränder 2 cm
const TEXT_W = PAGE_W - 2 * MARGIN;                              // 9638
const STEP = 425;                                                // Einzug je Gliederungsstufe (0,75 cm) = hängender Einzug
const LABEL_COL = 1560;                                          // Fundstellenspalte der Gegenüberstellung (2,75 cm)
const CELL_MAR = 85;                                             // Zellinnenrand links/rechts

// Farben aus dem Design System Carbon (src/app/tokens.js), ohne '#'. Schrift bleibt Arial (in jedem Word vorhanden).
const W = (k) => CARBON[k].slice(1).toUpperCase();
export const DOCX_COLORS = { ins: W('diff-ins-text'), del: W('diff-del-text'), meta: W('ink-muted'), rule: W('border-strong'), head: W('ink') };
const FLAG_COLORS = { reconstructed: W('ink-muted'), pending: W('pending-text'), 'not-applicable': W('pending-text'), preview: W('ink-muted'), editorial: W('ink-muted'), derogation: W('error-text'), info: W('ink-muted') };

/** XML-Text maskieren; im XML 1.0 unzulässige Zeichen entfernen. */
export function esc(s) {
  return String(s ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '$1')
    .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/** Datum im Format xsd:dateTime ohne Millisekunden */
const isoDate = (d) => {
  if (!d) return new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d + 'T00:00:00Z';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? new Date().toISOString().replace(/\.\d+Z$/, 'Z') : x.toISOString().replace(/\.\d+Z$/, 'Z');
};

// ------------------------------------------------------------------ Läufe

/**
 * rPr in Schemareihenfolge. f: { b, i, strike, color, sz, u, sup, sub, lang }
 */
function rPr(f) {
  const p = [];
  if (f.b) p.push('<w:b/><w:bCs/>');
  if (f.i) p.push('<w:i/><w:iCs/>');
  if (f.strike) p.push('<w:strike/>');
  if (f.color) p.push(`<w:color w:val="${f.color}"/>`);
  if (f.sz) p.push(`<w:sz w:val="${f.sz}"/><w:szCs w:val="${f.sz}"/>`);
  if (f.u) p.push('<w:u w:val="single"/>');
  if (f.sup) p.push('<w:vertAlign w:val="superscript"/>');
  else if (f.sub) p.push('<w:vertAlign w:val="subscript"/>');
  if (f.lang) p.push(`<w:lang w:val="${esc(f.lang)}"/>`);
  return p.length ? `<w:rPr>${p.join('')}</w:rPr>` : '';
}

/** Text in w:r-Elemente; "\n" -> w:br, "\t" -> w:tab; del: w:delText */
function textRuns(text, f, del = false) {
  if (!text) return '';
  const pr = rPr(f);
  const tag = del ? 'w:delText' : 'w:t';
  let out = '';
  for (const [k, line] of String(text).split('\n').entries()) {
    let inner = k ? '<w:br/>' : '';
    for (const [m, piece] of line.split('\t').entries()) {
      if (m) inner += '<w:tab/>';
      if (piece) inner += `<${tag} xml:space="preserve">${esc(piece)}</${tag}>`;
    }
    if (inner) out += `<w:r>${pr}${inner}</w:r>`;
  }
  return out;
}

class Ctx {
  constructor(card, opts) {
    this.card = card;
    this.mode = opts.redline === 'tracked' ? 'tracked' : 'format';
    this.colors = opts.colors !== false;
    this.author = opts.author || 'SGK-Navigator';
    this.date = isoDate(opts.date);
    this.ids = opts._ids || { n: 1 };
  }
  rev(kind, inner) { return inner ? `<w:${kind} w:id="${this.ids.n++}" w:author="${esc(this.author)}" w:date="${this.date}">${inner}</w:${kind}>` : ''; }
  /** Läufe des Rechtstexts. mode: "format" | "tracked" | "plain-old" (nur alte Fassung, ohne Marken) */
  runs(runs, lang, mode = this.mode, base = {}) {
    let out = '';
    for (const r of runs) {
      if (mode === 'plain-old' && r.op === 'ins') continue;
      const f = { ...base, b: base.b || r.b, i: base.i || r.i, sup: r.sup, sub: r.sub, lang: textLocale(r.lang || lang, this.card) };
      if (mode === 'format' && r.op !== 'eq') {
        if (r.op === 'ins') f.u = true; else f.strike = true;
        if (this.colors) f.color = DOCX_COLORS[r.op];
      }
      if (mode === 'tracked' && r.op === 'ins') out += this.rev('ins', textRuns(r.t, f));
      else if (mode === 'tracked' && r.op === 'del') out += this.rev('del', textRuns(r.t, f, true));
      else out += textRuns(r.t, f);
    }
    return out;
  }
  ui(text, f = {}) { return textRuns(text, { ...f, lang: uiLocale(this.card) }); }
}

/** Absatz. o: { style, ind:{left,hanging,firstLine}, keepNext, pageBreakBefore, markRev: "ins"|"del", spacingAfter, ctx } */
function para(content, o = {}) {
  const p = [];
  if (o.style) p.push(`<w:pStyle w:val="${o.style}"/>`);
  if (o.keepNext) p.push('<w:keepNext/>');
  if (o.pageBreakBefore) p.push('<w:pageBreakBefore/>');
  if (o.spacingAfter !== undefined || o.spacingBefore !== undefined) p.push(`<w:spacing${o.spacingBefore !== undefined ? ` w:before="${o.spacingBefore}"` : ''}${o.spacingAfter !== undefined ? ` w:after="${o.spacingAfter}"` : ''}/>`);
  if (o.ind) p.push(`<w:ind w:left="${o.ind.left || 0}"${o.ind.hanging ? ` w:hanging="${o.ind.hanging}"` : ''}/>`);
  if (o.markRev && o.ctx) p.push(`<w:rPr><w:${o.markRev} w:id="${o.ctx.ids.n++}" w:author="${esc(o.ctx.author)}" w:date="${o.ctx.date}"/></w:rPr>`);
  return `<w:p>${p.length ? `<w:pPr>${p.join('')}</w:pPr>` : ''}${content}</w:p>`;
}

/** Hängender Einzug: Gliederungszeichen breiter als eine Stufe? (grobe Schätzung, Arial 10 pt ≈ 110 Twips je Zeichen) */
function hangFor(label) {
  const est = [...label].reduce((a, c) => a + (/[il.,;:()|'’\s]/.test(c) ? 60 : /[mwMW]/.test(c) ? 170 : 115), 0) + 90;
  return est <= STEP ? STEP : Math.ceil(est / 142) * 142;
}

// ------------------------------------------------------------------ Blöcke

/** Blockfolge -> Absätze/Tabellen mit gemeinsamen Einzügen. mode wie Ctx.runs; width: verfügbare Breite (Twips). */
function blocksXml(ctx, blocks, mode = ctx.mode, width = TEXT_W) {
  const ind = blockIndents(blocks, { step: STEP, hang: hangFor });
  const marks = mode === 'tracked' ? paragraphMarks(blocks) : [];
  return blocks.map((b, k) => blockXml(ctx, b, ind[k], mode, width, marks[k] || null)).join('');
}

/**
 * Überarbeitungsmarke der Absatzmarken (Modus «tracked»).
 * Ganz gestrichener Block: eigene Absatzmarke gestrichen. Folge ganz eingefügter Blöcke a..b: wie Word beim Tippen
 * («Eingabe» am Ende des Vorgängers) gelten die Marken a-1..b-1 als eingefügt, die Marke von b bleibt; nur wenn kein
 * unveränderter Vorgänger in derselben Folge steht, die Marken a..b. Beide Formen ergeben in Word dasselbe; die erste
 * vermeidet, dass LibreOffice beim Ablehnen einen eingefügten Lauf am Ende des Vorgängers mit dem eingefügten Absatz
 * verschmilzt und dabei den Absatzumbruch des Vorgängers mitnimmt (geprüft mit LibreOffice 24.2).
 */
function paragraphMarks(blocks) {
  const m = blocks.map((b) => (b.type !== 'table' && b.op === 'del' ? 'del' : null));
  const isIns = (b) => b && b.type !== 'table' && b.op === 'ins';
  for (let a = 0; a < blocks.length; a++) {
    if (!isIns(blocks[a])) continue;
    let b = a;
    while (isIns(blocks[b + 1])) b++;
    const prev = blocks[a - 1];
    if (prev && prev.type !== 'table' && prev.op !== 'ins' && prev.op !== 'del') for (let j = a - 1; j < b; j++) m[j] = 'ins';
    else for (let j = a; j <= b; j++) m[j] = 'ins';
    a = b;
  }
  return m;
}

function blockXml(ctx, b, ind0, mode, width, mark = null) {
  const lang = b.lang;
  if (b.type === 'table') return tableBlockXml(ctx, b, ind0, mode, width);
  const trackedWhole = mode === 'tracked' && (b.op === 'ins' || b.op === 'del') ? b.op : null;
  let content = '';
  const ind = { left: ind0.left, hanging: ind0.hang || 0 };
  if (b.label) {
    const labelRuns = textRuns(b.label, { lang: textLocale(lang, ctx.card), b: b.type === 'heading' }, trackedWhole === 'del') + `<w:r><w:tab/></w:r>`;
    content += trackedWhole ? ctx.rev(trackedWhole, labelRuns) : labelRuns;
  }
  const base = b.type === 'heading' ? { b: true } : b.type === 'img' ? { i: true } : {};
  const runs = mode === 'plain-old' ? b.runs.filter((r) => r.op !== 'ins') : b.runs;
  content += ctx.runs(runs, lang, mode, base);
  const style = b.type === 'heading' ? 'SGKTextHeading' : b.type === 'img' ? 'SGKTextNote' : 'SGKText';
  return para(content, { style, ind, keepNext: b.type === 'heading', markRev: mark, ctx });
}

function tableBlockXml(ctx, b, ind0, mode, width) {
  const left = ind0.left;
  const avail = Math.max(2000, width - left);
  const ncols = Math.max(...b.rows.map((r) => r.cells.reduce((a, c) => a + c.span, 0)));
  const colW = Math.floor(avail / ncols);
  const grid = `<w:tblGrid>${Array.from({ length: ncols }, () => `<w:gridCol w:w="${colW}"/>`).join('')}</w:tblGrid>`;
  const bd = `<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="${DOCX_COLORS.rule}"/><w:left w:val="single" w:sz="4" w:space="0" w:color="${DOCX_COLORS.rule}"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="${DOCX_COLORS.rule}"/><w:right w:val="single" w:sz="4" w:space="0" w:color="${DOCX_COLORS.rule}"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="${DOCX_COLORS.rule}"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="${DOCX_COLORS.rule}"/></w:tblBorders>`;
  const tblPr = `<w:tblPr><w:tblW w:w="${colW * ncols}" w:type="dxa"/><w:tblInd w:w="${left}" w:type="dxa"/>${bd}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="${CELL_MAR}" w:type="dxa"/><w:right w:w="${CELL_MAR}" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>`;
  const rows = b.rows.map((r) => `<w:tr>${r.header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${r.cells.map((c) => {
    const tcPr = `<w:tcPr><w:tcW w:w="${colW * c.span}" w:type="dxa"/>${c.span > 1 ? `<w:gridSpan w:val="${c.span}"/>` : ''}</w:tcPr>`;
    const runs = mode === 'plain-old' ? c.runs.filter((x) => x.op !== 'ins') : c.runs;
    return `<w:tc>${tcPr}${para(ctx.runs(runs, b.lang, mode, r.header ? { b: true } : {}), { style: 'SGKCellText' })}</w:tc>`;
  }).join('')}</w:tr>`).join('');
  let out = '';
  if (b.label) out += para(textRuns(b.label, { lang: textLocale(b.lang, ctx.card) }), { style: 'SGKText', ind: { left: ind0.left - ind0.hang }, keepNext: true });
  return out + `<w:tbl>${tblPr}${grid}${rows}</w:tbl>`;
}

const square = (ctx, color) => (color ? textRuns('■ ', { color: color.replace('#', '').toUpperCase(), lang: uiLocale(ctx.card) }) : '');

function sectionXml(ctx, s) {
  let out = '';
  let head = square(ctx, s.color);
  if (s.code) head += ctx.ui(s.code + '  ', { b: true });
  if (s.heading) head += ctx.ui(s.heading);
  if (s.tag) head += ctx.ui('  ' + s.tag, { b: true, color: DOCX_COLORS.head });
  for (const f of s.flags) head += ctx.ui('  [' + f.label + ']', { i: true, color: FLAG_COLORS[f.kind] || DOCX_COLORS.meta });
  if (head) out += para(head, { style: 'SGKSectionHead', keepNext: true });
  if (s.meta.length) out += para(ctx.ui(s.meta.join(' | ')), { style: 'SGKMeta', keepNext: true });
  out += blocksXml(ctx, s.blocks);
  return out;
}

// ------------------------------------------------------------------ Gegenüberstellung

function compareTableXml(ctx, card) {
  const withLabels = card.rows.some((r) => r.label || r.tag) || !!card.labelHeading;
  const lw = withLabels ? LABEL_COL : 0;
  const cw = Math.floor((TEXT_W - lw) / 2);
  const widths = withLabels ? [lw, cw, cw] : [cw, cw];
  const inner = (w) => w - 2 * CELL_MAR;
  const grid = `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  const bd = `<w:tblBorders><w:top w:val="single" w:sz="6" w:space="0" w:color="${DOCX_COLORS.head}"/><w:bottom w:val="single" w:sz="6" w:space="0" w:color="${DOCX_COLORS.head}"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="${DOCX_COLORS.rule}"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="${DOCX_COLORS.rule}"/></w:tblBorders>`;
  const tblPr = `<w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/>${bd}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="${CELL_MAR}" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="${CELL_MAR}" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>`;
  const tc = (w, content) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${content || para('', { style: 'SGKCellText' })}</w:tc>`;
  const headCells = [];
  if (withLabels) headCells.push(tc(lw, para(ctx.ui(card.labelHeading || ''), { style: 'SGKTableHead' })));
  for (const c of card.columns) headCells.push(tc(cw, para(ctx.ui(c.heading), { style: 'SGKTableHead' })));
  const trs = [`<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>${headCells.join('')}</w:tr>`];
  const empty = lbl(card, 'empty');
  for (const r of card.rows) {
    const cells = [];
    if (withLabels) {
      let c = '';
      if (r.label) c += para(ctx.ui(r.label, { b: true }), { style: 'SGKCellLabel' });
      if (r.tag) c += para(ctx.ui(r.tag), { style: 'SGKCellTag' });
      cells.push(tc(lw, c));
    }
    const [L, R] = r.cells;
    let leftXml, rightXml;
    const cellBlocks = (blocks, mode) => blocksXml(ctx, blocks, mode, inner(cw));
    const marksXml = (cell) => (cell && cell.marks && cell.marks.length ? para(cell.marks.map((m) => square(ctx, m.color) + ctx.ui(m.label)).join(ctx.ui('   ')), { style: 'SGKCellTag' }) : '');
    // Änderungsverfolgung nur zwischen zwei Fassungen derselben Sprache (nicht im Sprachvergleich)
    const sameLang = card.columns[0].lang === card.columns[1].lang;
    if (ctx.mode === 'tracked' && sameLang) {
      // links: alte Fassung ohne Marken; rechts: vollständige Redline als Überarbeitung (annehmen = neue Fassung)
      leftXml = L ? cellBlocks(L.blocks, 'plain-old') : para(ctx.ui(empty), { style: 'SGKCellText' });
      const merged = trackedRight(L, R);
      rightXml = merged ? cellBlocks(merged, 'tracked') + marksXml(R) : (R ? cellBlocks(R.blocks, 'format') + marksXml(R) : para(ctx.ui(empty), { style: 'SGKCellText' }));
    } else {
      leftXml = L ? cellBlocks(L.blocks, 'format') + marksXml(L) : para(ctx.ui(empty), { style: 'SGKCellText' });
      rightXml = R ? cellBlocks(R.blocks, 'format') + marksXml(R) : para(ctx.ui(empty), { style: 'SGKCellText' });
    }
    cells.push(tc(cw, leftXml), tc(cw, rightXml));
    trs.push(`<w:tr>${cells.join('')}</w:tr>`);
  }
  return `<w:tbl>${tblPr}${grid}${trs.join('')}</w:tbl>`;
}

/**
 * Rechte Spalte im Modus «tracked»: Blöcke mit vollständiger Redline (alt -> neu).
 * Gleich viele Blöcke links und rechts: paarweise zusammensetzen. Nur rechts: eingefügt. Nur links: gestrichen.
 * null, wenn sich die Fassungen nicht zusammensetzen lassen (dann Formatierung als Rückfall).
 */
export function trackedRight(L, R) {
  const lb = L ? L.blocks : [], rb = R ? R.blocks : [];
  if (!lb.length && !rb.length) return null;
  if (!lb.length) return rb.map((b) => ({ ...b, op: 'ins', runs: b.runs ? b.runs.map((x) => ({ ...x, op: x.op === 'del' ? 'del' : 'ins' })) : b.runs, rows: b.rows }));
  if (!rb.length) return lb.map((b) => ({ ...b, op: 'del', runs: b.runs ? b.runs.filter((x) => x.op !== 'ins').map((x) => ({ ...x, op: 'del' })) : b.runs }));
  if (lb.length !== rb.length) return null;
  const out = [];
  for (let k = 0; k < lb.length; k++) {
    if (lb[k].type === 'table' || rb[k].type === 'table') return null;
    const m = mergeRedline(lb[k].runs, rb[k].runs);
    if (!m) return null;
    const vis = m.filter((x) => /\S/.test(x.t));
    const op = vis.length && vis.every((x) => x.op === 'ins') ? 'ins' : vis.length && vis.every((x) => x.op === 'del') ? 'del' : 'eq';
    out.push({ ...rb[k], runs: m, op });
  }
  return out;
}

// ------------------------------------------------------------------ Karte

function legendXml(ctx, card) {
  const parts = [];
  for (const l of card.legend) {
    if (l.op) {
      if (ctx.mode === 'tracked') continue;  // Marken in Word: Darstellung der Überarbeitungen
      parts.push(textRuns(l.label, { u: l.op === 'ins', strike: l.op === 'del', color: ctx.colors ? DOCX_COLORS[l.op] : null, lang: uiLocale(card) }));
    } else {
      parts.push(square(ctx, l.color) + (l.code ? ctx.ui(l.code + ' ', { b: true }) : '') + ctx.ui(l.label));
    }
  }
  let out = '';
  if (parts.length) out += para(parts.join(ctx.ui('    ')), { style: 'SGKLegend' });
  if (ctx.mode === 'tracked' && hasChanges(card)) out += para(ctx.ui(lbl(card, 'tracked')), { style: 'SGKLegend' });
  return out;
}

function hasChanges(card) {
  const blocks = [...card.sections.flatMap((s) => s.blocks), ...(card.rows || []).flatMap((r) => r.cells.flatMap((c) => (c ? c.blocks : [])))];
  return blocks.some((b) => (b.runs || (b.rows || []).flatMap((r) => r.cells.flatMap((c) => c.runs))).some((r) => r.op !== 'eq'));
}

function cardBody(card, opts, first, ids) {
  const ctx = new Ctx(card, { ...opts, _ids: ids });
  let out = '';
  out += para(ctx.ui(card.title), { style: 'SGKTitle', keepNext: true, pageBreakBefore: !first && opts.pageBreaks !== false });
  if (card.subtitle) out += para(ctx.ui(card.subtitle), { style: 'SGKSubtitle', keepNext: true });
  if (card.unitLine) out += para(ctx.ui(card.unitLine), { style: 'SGKUnit', keepNext: true });
  if (card.stats) out += para(ctx.ui(card.stats), { style: 'SGKMeta', keepNext: true });
  for (const s of card.sections) out += sectionXml(ctx, s);
  if (card.columns && card.rows && card.rows.length) out += compareTableXml(ctx, card) + para('', { style: 'SGKSpacer' });
  for (const f of card.footnotes) out += para(ctx.ui(f.mark, { sup: true }) + ctx.ui(' ' + f.text), { style: 'SGKSource' });
  out += legendXml(ctx, card);
  if (card.source) out += para(ctx.ui(card.source), { style: 'SGKSource' });
  if (card.disclaimer) out += para(ctx.ui(card.disclaimer), { style: 'SGKSource' });
  return out;
}

// ------------------------------------------------------------------ Paket

function stylesXml(lang) {
  const F = '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>';
  // Jede SGK-Vorlage ist vollständig: Schrift, Grösse, Farbe, Abstände, Zeilenabstand, Ausrichtung, Einzug 0.
  const ps = (id, name, { sz = 20, b = false, i = false, color = '000000', before = 0, after = 80, keepNext = false, line = 252 } = {}) =>
    `<w:style w:type="paragraph" w:customStyle="1" w:styleId="${id}"><w:name w:val="${name}"/><w:qFormat/><w:pPr>${keepNext ? '<w:keepNext/>' : ''}<w:widowControl/><w:spacing w:before="${before}" w:after="${after}" w:line="${line}" w:lineRule="auto"/><w:ind w:left="0" w:right="0" w:firstLine="0"/><w:jc w:val="left"/></w:pPr><w:rPr>${F}${b ? '<w:b/><w:bCs/>' : '<w:b w:val="0"/><w:bCs w:val="0"/>'}${i ? '<w:i/><w:iCs/>' : '<w:i w:val="0"/><w:iCs w:val="0"/>'}<w:color w:val="${color}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W_NS}>
<w:docDefaults><w:rPrDefault><w:rPr>${F}<w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="${lang}" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
${ps('SGKTitle', 'SGK Titel', { sz: 28, b: true, after: 60, keepNext: true })}
${ps('SGKSubtitle', 'SGK Untertitel', { sz: 22, after: 40, keepNext: true })}
${ps('SGKUnit', 'SGK Einheit', { sz: 20, color: DOCX_COLORS.meta, after: 160, keepNext: true })}
${ps('SGKSectionHead', 'SGK Abschnitt', { sz: 20, before: 200, after: 20, keepNext: true })}
${ps('SGKMeta', 'SGK Metazeile', { sz: 16, color: DOCX_COLORS.meta, after: 80, keepNext: true })}
${ps('SGKText', 'SGK Rechtstext', { sz: 20, after: 80 })}
${ps('SGKTextHeading', 'SGK Rechtstext Zwischentitel', { sz: 20, b: true, before: 80, after: 80, keepNext: true })}
${ps('SGKTextNote', 'SGK Rechtstext Bildhinweis', { sz: 18, i: true, color: DOCX_COLORS.meta, after: 80 })}
${ps('SGKTableHead', 'SGK Tabellenkopf', { sz: 18, b: true, after: 0, keepNext: true })}
${ps('SGKCellLabel', 'SGK Fundstelle', { sz: 18, after: 20 })}
${ps('SGKCellTag', 'SGK Etikett', { sz: 16, color: DOCX_COLORS.meta, after: 40 })}
${ps('SGKCellText', 'SGK Tabellentext', { sz: 20, after: 60 })}
${ps('SGKLegend', 'SGK Legende', { sz: 17, before: 120, after: 40 })}
${ps('SGKSource', 'SGK Quelle', { sz: 16, color: DOCX_COLORS.meta, after: 40 })}
${ps('SGKSpacer', 'SGK Abstand', { sz: 8, after: 0, line: 240 })}
</w:styles>`;
}

function packageDocx({ body, title, lang, date }) {
  const sect = `<w:sectPr><w:pgSz w:w="${PAGE_W}" w:h="${PAGE_H}"/><w:pgMar w:top="${MARGIN}" w:right="${MARGIN}" w:bottom="${MARGIN}" w:left="${MARGIN}" w:header="567" w:footer="567" w:gutter="0"/><w:cols w:space="708"/></w:sectPr>`;
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${W_NS}><w:body>${body}${sect}</w:body></w:document>`;
  const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:settings ${W_NS}><w:defaultTabStop w:val="425"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title><dc:creator>SGK-Navigator</dc:creator><dc:language>${esc(lang)}</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">${date}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${date}</dcterms:modified></cp:coreProperties>`;
  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>SGK-Navigator</Application></Properties>`;
  const files = {
    '[Content_Types].xml': ct, '_rels/.rels': rels, 'word/document.xml': documentXml, 'word/_rels/document.xml.rels': docRels,
    'word/styles.xml': stylesXml(lang), 'word/settings.xml': settings, 'docProps/core.xml': core, 'docProps/app.xml': app,
  };
  const mtime = new Date('2026-01-01T00:00:00Z');   // feste Zeitstempel: gleiche Eingabe, gleiche Datei
  const zf = {};
  for (const [k, v] of Object.entries(files)) zf[k] = [strToU8(v), { level: 6, mtime }];
  return zipSync(zf);
}

/**
 * Mehrere Karten als ein Word-Dokument (Sammelkorb).
 * @param {import('./model.js').Card[]} cards
 * @param {{ redline?: 'format'|'tracked', author?: string, date?: string, colors?: boolean, pageBreaks?: boolean }} [opts]
 * @returns {Uint8Array}
 */
export function cardsToDocx(cards, opts = {}) {
  if (!Array.isArray(cards) || !cards.length) throw new Error('cardsToDocx: mindestens eine Karte nötig');
  cards.forEach((c, i) => assertCard(c, cards.length > 1 ? i : null));
  const norm = cards.map(normalizeCard);
  const ids = { n: 1 };
  const date = isoDate(opts.date);
  const body = norm.map((c, i) => cardBody(c, { ...opts, date }, i === 0, ids)).join('');
  return packageDocx({ body, title: norm.length === 1 ? [norm[0].title, norm[0].subtitle].filter(Boolean).join(': ') : norm.map((c) => c.title).join('; '), lang: uiLocale(norm[0]), date });
}

/**
 * Eine Karte als Word-Baustein.
 * @param {import('./model.js').Card} card
 * @param {{ redline?: 'format'|'tracked', author?: string, date?: string, colors?: boolean }} [opts]
 * @returns {Uint8Array}
 */
export function cardToDocx(card, opts = {}) {
  return cardsToDocx([card], opts);
}
