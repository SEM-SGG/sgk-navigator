// SGK-Navigator, Modul Verhandlung — Word-Dateien lesen (ESM, isomorph; fflate + eigener XML-Parser)
//
// readDocx(bytes) -> { ok, warnings, parts, body:[Block], comments:Map(id->{author,date,text}), customProps:{}, coreProps:{} }
//   Block = { type:"p", style, runs:[Run], comments:[id], numbered } | { type:"tbl", rows:[{ cells:[Cell], header:boolean }] }
//   Cell  = { blocks:[Block], span, vMerge:"restart"|"continue"|null, fill:"#rrggbb"|null, comments:[id] }
//   Run   = { t, b, i, u, s, sup, sub, color, highlight, ins:boolean, del:boolean, author? }
// runsToSegments(runs, { deleted:"mark"|"drop" }) -> Segmente für segmentsToHtml
// blockText(block, opts) / cellText(cell, opts)

import { unzipSync, strFromU8 } from 'fflate';
import { parseXml, child, children, attr, descendants } from './xml.js';
import { segmentsToHtml, htmlToText, warn } from './util.js';

const onOff = (el) => { if (!el) return false; const v = attr(el, 'w:val'); return v === null || !/^(0|false|off|none)$/i.test(v); };

function runProps(rPr) {
  const p = {};
  if (!rPr) return p;
  if (onOff(child(rPr, 'w:b'))) p.b = true;
  if (onOff(child(rPr, 'w:i'))) p.i = true;
  const u = child(rPr, 'w:u'); if (u && attr(u, 'w:val') !== 'none') p.u = true;
  if (onOff(child(rPr, 'w:strike')) || onOff(child(rPr, 'w:dstrike'))) p.s = true;
  const va = attr(child(rPr, 'w:vertAlign'), 'w:val');
  if (va === 'superscript') p.sup = true; else if (va === 'subscript') p.sub = true;
  const col = attr(child(rPr, 'w:color'), 'w:val'); if (col && col !== 'auto' && col !== '000000') p.color = '#' + col.toLowerCase();
  const hl = attr(child(rPr, 'w:highlight'), 'w:val'); if (hl && hl !== 'none') p.highlight = hl;
  const shd = attr(child(rPr, 'w:shd'), 'w:fill'); if (shd && shd !== 'auto' && !/^f{6}$/i.test(shd)) p.shade = '#' + shd.toLowerCase();
  if (onOff(child(rPr, 'w:vanish'))) p.hidden = true;
  return p;
}

/** Läufe eines Absatzes, inkl. Änderungsverfolgung und Kommentarbereiche */
function readParagraph(pEl, ctx) {
  const runs = [];
  const comments = new Set();
  const style = attr(child(child(pEl, 'w:pPr'), 'w:pStyle'), 'w:val');
  const numbered = !!child(child(pEl, 'w:pPr'), 'w:numPr');
  const walk = (el, mode) => {
    for (const c of el.children || []) {
      if (!c.name) continue;
      switch (c.name) {
        case 'w:r': readRun(c, mode); break;
        case 'w:ins': case 'w:moveTo': walk(c, { ...mode, ins: true, author: attr(c, 'w:author') }); break;
        case 'w:del': case 'w:moveFrom': walk(c, { ...mode, del: true, author: attr(c, 'w:author') }); break;
        case 'w:hyperlink': case 'w:smartTag': case 'w:customXml': case 'w:fldSimple': case 'w:sdtContent': case 'w:dir': case 'w:bdo': walk(c, mode); break;
        case 'w:sdt': walk(child(c, 'w:sdtContent') || c, mode); break;
        case 'w:commentRangeStart': comments.add(attr(c, 'w:id')); ctx.open.add(attr(c, 'w:id')); break;
        case 'w:commentRangeEnd': comments.add(attr(c, 'w:id')); ctx.open.delete(attr(c, 'w:id')); break;
        case 'mc:AlternateContent': { const ch = child(c, 'mc:Choice') || child(c, 'mc:Fallback'); if (ch) walk(ch, mode); break; }
        default: break;
      }
    }
  };
  const readRun = (r, mode) => {
    const props = runProps(child(r, 'w:rPr'));
    if (props.hidden) return;
    for (const c of r.children || []) {
      if (!c.name) continue;
      if (c.name === 'w:t' || c.name === 'w:delText') runs.push({ t: textOfT(c), ...props, ...(mode.ins ? { ins: true } : {}), ...(mode.del || c.name === 'w:delText' ? { del: true } : {}), ...(mode.author ? { author: mode.author } : {}) });
      else if (c.name === 'w:tab') runs.push({ t: '\t', ...props, ...(mode.del ? { del: true } : {}), ...(mode.ins ? { ins: true } : {}) });
      else if (c.name === 'w:br' || c.name === 'w:cr') runs.push({ br: true, ...(mode.del ? { del: true } : {}) });
      else if (c.name === 'w:noBreakHyphen') runs.push({ t: '‑', ...props });
      else if (c.name === 'w:softHyphen') { /* weiches Trennzeichen: weglassen */ }
      else if (c.name === 'w:sym') runs.push({ t: String.fromCharCode(parseInt(attr(c, 'w:char') || '20', 16) & 0xff || 32), ...props });
      else if (c.name === 'w:commentReference') comments.add(attr(c, 'w:id'));
      else if (c.name === 'w:footnoteReference' || c.name === 'w:endnoteReference') runs.push({ t: ctx.noteMark(c), ...props, sup: true });
    }
  };
  for (const id of ctx.open) comments.add(id);
  walk(pEl, {});
  return { type: 'p', style, numbered, runs, comments: [...comments] };
}
function textOfT(t) { return (t.children || []).map((c) => c.text || '').join(''); }

function readTable(tbl, ctx) {
  const rows = [];
  for (const tr of children(tbl, 'w:tr')) {
    const trPr = child(tr, 'w:trPr');
    const header = !!child(trPr, 'w:tblHeader');
    const cells = [];
    for (const tcHolder of tr.children.filter((c) => c.name === 'w:tc' || c.name === 'w:sdt' || c.name === 'w:customXml')) {
      const tcs = tcHolder.name === 'w:tc' ? [tcHolder] : descendants(tcHolder, 'w:tc');
      for (const tc of tcs) {
        const tcPr = child(tc, 'w:tcPr');
        const span = +(attr(child(tcPr, 'w:gridSpan'), 'w:val') || 1);
        const vm = child(tcPr, 'w:vMerge');
        const vMerge = vm ? (attr(vm, 'w:val') === 'restart' ? 'restart' : 'continue') : null;
        const fill = attr(child(tcPr, 'w:shd'), 'w:fill');
        const blocks = readBlocks(tc, ctx);
        const comments = new Set();
        for (const b of flatParas(blocks)) for (const id of b.comments) comments.add(id);
        cells.push({ blocks, span, vMerge, fill: fill && fill !== 'auto' && !/^f{6}$/i.test(fill) ? '#' + fill.toLowerCase() : null, comments: [...comments] });
      }
    }
    rows.push({ cells, header });
  }
  return { type: 'tbl', rows };
}

function readBlocks(container, ctx) {
  const out = [];
  for (const c of container.children || []) {
    if (!c.name) continue;
    if (c.name === 'w:p') out.push(readParagraph(c, ctx));
    else if (c.name === 'w:tbl') out.push(readTable(c, ctx));
    else if (c.name === 'w:sdt') out.push(...readBlocks(child(c, 'w:sdtContent') || c, ctx));
    else if (c.name === 'w:customXml' || c.name === 'w:ins' || c.name === 'w:del') out.push(...readBlocks(c, ctx));
  }
  return out;
}

export function flatParas(blocks, out = []) {
  for (const b of blocks) {
    if (b.type === 'p') out.push(b);
    else if (b.type === 'tbl') for (const r of b.rows) for (const c of r.cells) flatParas(c.blocks, out);
  }
  return out;
}

/** Läufe -> Segmente. deleted: "mark" (als gestrichen) | "drop"; inserted: "plain" | "mark" (als unterstrichen) */
export function runsToSegments(runs, { deleted = 'mark', inserted = 'plain' } = {}) {
  const segs = [];
  for (const r of runs) {
    if (r.del && deleted === 'drop') continue;
    if (r.br) { segs.push({ br: true }); continue; }
    segs.push({ t: r.t.replace(/\t/g, ' '), b: !!r.b, i: !!r.i, u: !!r.u || (r.ins && inserted === 'mark'), s: !!r.s || (r.del && deleted === 'mark'), sup: !!r.sup, sub: !!r.sub });
  }
  return segs;
}

export function blocksHtml(blocks, opts) {
  const segs = [];
  for (const p of flatParas(blocks)) {
    const s = runsToSegments(p.runs, opts);
    if (!s.some((x) => x.t && x.t.trim())) continue;
    if (segs.length) segs.push({ br: true });
    segs.push(...s);
  }
  return segmentsToHtml(segs);
}
export const blocksText = (blocks, opts) => htmlToText(blocksHtml(blocks, opts));

function readProps(xml) {
  const out = {};
  if (!xml) return out;
  for (const p of descendants(xml, 'cust:property')) {
    const name = attr(p, 'name');
    const v = (p.children || []).find((c) => c.name);
    out[name] = v ? (v.children || []).map((c) => c.text || '').join('') : '';
  }
  return out;
}

/**
 * .docx lesen. Wirft nicht: bei Fehlern ok:false mit Warnung.
 */
export function readDocx(bytes) {
  const warnings = [];
  let files;
  try { files = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)); } catch (e) {
    return { ok: false, warnings: [warn('zip-invalid', `Keine gültige Word-Datei (ZIP): ${e.message}`)], body: [], comments: new Map(), customProps: {}, coreProps: {}, parts: [] };
  }
  const get = (name) => { const k = Object.keys(files).find((f) => f.toLowerCase() === name.toLowerCase()); return k ? strFromU8(files[k]) : null; };
  const docXml = get('word/document.xml');
  if (!docXml) return { ok: false, warnings: [warn('no-document', 'word/document.xml fehlt: keine Word-Datei?')], body: [], comments: new Map(), customProps: {}, coreProps: {}, parts: Object.keys(files) };
  let doc;
  try { doc = parseXml(docXml); } catch (e) { return { ok: false, warnings: [warn('xml-invalid', `document.xml nicht lesbar: ${e.message}`)], body: [], comments: new Map(), customProps: {}, coreProps: {}, parts: Object.keys(files) }; }
  // Fussnoten (nur als Zeichen; Texte unten angehängt)
  const notes = new Map();
  for (const kind of ['footnotes', 'endnotes']) {
    const x = get(`word/${kind}.xml`);
    if (!x) continue;
    try {
      const fx = parseXml(x);
      for (const fn of descendants(fx, kind === 'footnotes' ? 'w:footnote' : 'w:endnote')) {
        const id = attr(fn, 'w:id');
        if (+id <= 0) continue;
        const ctx2 = { open: new Set(), noteMark: () => '' };
        notes.set(`${kind}:${id}`, blocksText(readBlocks(fn, ctx2)).replace(/^\s*\d*\s*/, ''));
      }
    } catch { warnings.push(warn('notes-unreadable', `${kind}.xml nicht lesbar`)); }
  }
  let noteNo = 0;
  const noteList = [];
  const ctx = {
    open: new Set(),
    noteMark: (el) => { noteNo++; const k = `${el.name === 'w:footnoteReference' ? 'footnotes' : 'endnotes'}:${attr(el, 'w:id')}`; noteList.push({ n: String(noteNo), text: notes.get(k) || '' }); return String(noteNo); },
  };
  const bodyEl = child(doc, 'w:body') || doc;
  const body = readBlocks(bodyEl, ctx);
  // Kommentare
  const comments = new Map();
  const cx = get('word/comments.xml');
  if (cx) {
    try {
      for (const c of descendants(parseXml(cx), 'w:comment')) {
        const ctx2 = { open: new Set(), noteMark: () => '' };
        comments.set(attr(c, 'w:id'), { author: attr(c, 'w:author') || '', initials: attr(c, 'w:initials') || '', date: attr(c, 'w:date') || '', text: blocksText(readBlocks(c, ctx2), { deleted: 'drop' }) });
      }
    } catch { warnings.push(warn('comments-unreadable', 'comments.xml nicht lesbar')); }
  }
  let customProps = {}, coreProps = {};
  try { customProps = readProps(get('docProps/custom.xml') && parseXml(get('docProps/custom.xml'))); } catch { /* egal */ }
  try {
    const core = get('docProps/core.xml');
    if (core) { const cx2 = parseXml(core); for (const c of cx2.children || []) if (c.name) coreProps[c.name.replace(/^.*:/, '')] = (c.children || []).map((x) => x.text || '').join(''); }
  } catch { /* egal */ }
  // Fusszeilen-Texte (Dossier-/Runden-Kennung als Rückfall)
  const footers = Object.keys(files).filter((f) => /^word\/footer\d*\.xml$/i.test(f)).map((f) => { try { return blocksText(readBlocks(parseXml(strFromU8(files[f])), { open: new Set(), noteMark: () => '' })); } catch { return ''; } });
  return { ok: true, warnings, body, comments, customProps, coreProps, footers, notes: noteList, parts: Object.keys(files) };
}
