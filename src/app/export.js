// Export von Karten als PNG und PDF (offline, file://).
import { CARBON } from './tokens.js';
import { html } from 'htm/preact';
import { render } from 'preact';
import { toCanvas, getFontEmbedCSS } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { Card, FORMATS, cardTitle, cardSubtitle } from './ui/card.js';
import { t, withUiLang, uiLang } from './lib/i18n.js';

const L = (spec) => spec.ui || uiLang();

let fontCSS = null;
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

export function fileBase(data, spec) {
  return withUiLang(L(spec), () => {
    const ti = cardTitle(data, spec).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
    const kind = t(spec.kind === 'compare' ? (spec.cm === 'sprache' ? 'export.file.lang' : 'export.file.compare') : 'export.file.chron');
    return `${ti}_${kind}_${spec.format === '169' ? '16x9' : 'A4'}`;
  });
}

async function mountCard(data, spec) {
  const host = document.createElement('div');
  host.className = 'card-host';
  host.setAttribute('aria-hidden', 'true');
  document.body.appendChild(host);
  const f = FORMATS[spec.format] || FORMATS.a4;
  let fs = f.h ? 19 : 16;
  const draw = () => withUiLang(L(spec), () => render(html`<${Card} data=${data} spec=${spec} fs=${fs} />`, host));
  draw();
  await document.fonts.ready;
  await frame();
  // 16:9: Schrift verkleinern, bis die Karte auf eine Folie passt (Untergrenze 11 px)
  if (f.h) {
    while (host.firstElementChild.offsetHeight > f.h && fs > 11) {
      fs -= 1;
      draw();
      await frame();
    }
  }
  return host;
}

const MAX_PX = 16000; // Canvas-Grenze der Browser (Höhe)

/** Montiert die Karte und führt fn(node, geometrie) aus. */
async function withCard(data, spec, fn) {
  const host = await mountCard(data, spec);
  try {
    const node = host.firstElementChild;
    const top = node.getBoundingClientRect().top;
    const breaks = [...node.querySelectorAll('.cbrk')].map((e) => Math.round(e.getBoundingClientRect().top - top)).filter((y) => y > 0);
    const w = node.offsetWidth, h = node.offsetHeight;
    if (!fontCSS) fontCSS = await getFontEmbedCSS(node);
    return await fn(node, { w, h, breaks });
  } finally {
    render(null, host);
    host.remove();
  }
}
const snap = (node, w, h, ratio, offset = 0) => toCanvas(node, {
  pixelRatio: ratio, backgroundColor: CARBON.canvas, width: w, height: h, fontEmbedCSS: fontCSS, cacheBust: false,
  style: offset ? { marginTop: `-${offset}px` } : undefined,
});

/** Rendert die ganze Karte auf ein Canvas (2x, bei sehr langen Karten weniger). */
export async function cardCanvas(data, spec) {
  return withCard(data, spec, async (node, g) => {
    const ratio = Math.min(2, MAX_PX / g.h);
    if (ratio < 1) throw new Error(t('export.tooLong', { px: Math.round(g.h / 1000) * 1000 }));
    const canvas = await snap(node, g.w, g.h, ratio);
    return { canvas, ...g, ratio };
  });
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function exportPng(data, spec) {
  data = await resolveData(spec, data);
  const { canvas } = await cardCanvas(data, spec);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  download(blob, fileBase(data, spec) + '.png');
}

const PAGE = {
  a4: { w: 210, h: 297, margin: 12, orientation: 'portrait' },
  169: { w: 338.67, h: 190.5, margin: 0, orientation: 'landscape' },
};

function slices(h, pageH, breaks) {
  const out = [];
  let start = 0;
  while (start < h - 1) {
    let end = Math.min(h, start + pageH);
    if (end < h) {
      const cand = breaks.filter((y) => y > start + pageH * 0.35 && y <= start + pageH);
      if (cand.length) end = Math.max(...cand);
    }
    out.push([start, end]);
    start = end;
  }
  return out;
}

async function addCardPages(pdf, data, spec, first) {
  const fmt = spec.format === '169' ? '169' : 'a4';
  const P = PAGE[fmt];
  return withCard(data, spec, async (node, { w, h, breaks }) => {
    const usableW = P.w - 2 * P.margin;
    const usableH = P.h - 2 * P.margin;
    const mmPerPx = usableW / w;
    const pageHpx = Math.floor(usableH / mmPerPx);
    const parts = slices(h, pageHpx, breaks);
    for (let i = 0; i < parts.length; i++) {
      const [s, e] = parts[i];
      if (!(first && i === 0)) pdf.addPage([P.w, P.h], P.orientation);
      // Seite einzeln rendern (verschoben), damit lange Karten die Canvas-Grenze nicht überschreiten
      const c = await snap(node, w, e - s, 2, s);
      pdf.addImage(c.toDataURL('image/png'), 'PNG', P.margin, P.margin, usableW, (e - s) * mmPerPx, undefined, 'FAST');
      if (parts.length > 1) {
        pdf.setFontSize(7);
        pdf.setTextColor(110);
        pdf.text(withUiLang(L(spec), () => `${cardTitle(data, spec)}  |  ${t('export.page', { i: i + 1, n: parts.length })}`), P.margin || 6, P.h - (P.margin ? P.margin / 2 : 3));
      }
    }
    return parts.length;
  });
}

function newPdf(spec) {
  const fmt = spec.format === '169' ? '169' : 'a4';
  const P = PAGE[fmt];
  return new jsPDF({ unit: 'mm', format: [P.w, P.h], orientation: P.orientation, compress: true });
}

/** Data passend zur Karte (Werk der Bibliothek oder Vorschau); ohne w/pv die übergebene (SGK). */
async function resolveData(spec, data) {
  if (!spec.pv && (!spec.w || spec.w === 'sgk')) return data;
  const { dataFor } = await import('./preview.js');
  return dataFor(spec);
}

export async function buildPdf(data, specs) {
  const pdf = newPdf(specs[0]);
  let pages = 0;
  let d0 = data;
  for (let i = 0; i < specs.length; i++) { const d = await resolveData(specs[i], data); if (i === 0) d0 = d; pages += await addCardPages(pdf, d, specs[i], i === 0); }
  withUiLang(L(specs[0]), () => pdf.setProperties({ title: specs.length === 1 ? `${cardTitle(d0, specs[0])}: ${cardSubtitle(d0, specs[0])}` : t('export.pdfTitleMany', { n: specs.length }), creator: 'SGK-Navigator', subject: t('ra.brandSub') }));
  return { pdf, pages };
}

export async function exportPdf(data, specs, name) {
  const list = Array.isArray(specs) ? specs : [specs];
  const { pdf } = await buildPdf(data, list);
  const blob = pdf.output('blob');
  const d0 = await resolveData(list[0], data);
  download(blob, name || (list.length === 1 ? fileBase(d0, list[0]) : t('export.file.basket', { n: list.length })) + '.pdf');
}

/** Druckansicht: Karten in eigenem Container, dann Browser-Druck. */
export async function printCards(data, specs) {
  let root = document.getElementById('print-root');
  if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
  const ds = [];
  for (const s of specs) ds.push(await resolveData(s, data));
  render(html`${specs.map((s, i) => html`<div class="print-card">${withUiLang(L(s), () => { const host = document.createElement('div'); render(html`<${Card} data=${ds[i]} spec=${{ ...s, format: 'a4' }} />`, host); return html`<div dangerouslySetInnerHTML=${{ __html: host.innerHTML }}></div>`; })}</div>`)}`, root);
  document.body.classList.add('printing');
  await document.fonts.ready;
  await frame();
  const done = () => { document.body.classList.remove('printing'); render(null, root); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(() => { if (document.body.classList.contains('printing') && !window.matchMedia('print').matches) done(); }, 1500);
}

// ------------------------------------------------------------------ Generische Karten (Modul Verhandlung)
// spec: { draw: (fs) => VNode einer <article class="card card-a4|card-169">, format: 'a4'|'169', name: Dateiname ohne Endung, title, ui }
async function mountDraw(spec) {
  const host = document.createElement('div');
  host.className = 'card-host';
  host.setAttribute('aria-hidden', 'true');
  document.body.appendChild(host);
  const f = FORMATS[spec.format] || FORMATS.a4;
  let fs = f.h ? 19 : 16;
  const draw = () => withUiLang(L(spec), () => render(spec.draw(fs), host));
  draw();
  await document.fonts.ready;
  await frame();
  if (f.h) {
    while (host.firstElementChild.offsetHeight > f.h && fs > 11) { fs -= 1; draw(); await frame(); }
  }
  return host;
}
async function withDraw(spec, fn) {
  const host = await mountDraw(spec);
  try {
    const node = host.firstElementChild;
    const top = node.getBoundingClientRect().top;
    const breaks = [...node.querySelectorAll('.cbrk')].map((e) => Math.round(e.getBoundingClientRect().top - top)).filter((y) => y > 0);
    if (!fontCSS) fontCSS = await getFontEmbedCSS(node);
    return await fn(node, { w: node.offsetWidth, h: node.offsetHeight, breaks });
  } finally {
    render(null, host);
    host.remove();
  }
}
/** Exportiert eine generische Karte als PNG oder PDF (what: 'png' | 'pdf'). */
export async function exportCustom(spec, what) {
  if (what === 'png') {
    const canvas = await withDraw(spec, async (node, g) => {
      const ratio = Math.min(2, MAX_PX / g.h);
      if (ratio < 1) throw new Error(t('export.tooLong', { px: Math.round(g.h / 1000) * 1000 }));
      return snap(node, g.w, g.h, ratio);
    });
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    download(blob, spec.name + '.png');
    return;
  }
  const fmt = spec.format === '169' ? '169' : 'a4';
  const P = PAGE[fmt];
  const pdf = new jsPDF({ unit: 'mm', format: [P.w, P.h], orientation: P.orientation, compress: true });
  await withDraw(spec, async (node, { w, h, breaks }) => {
    const usableW = P.w - 2 * P.margin;
    const usableH = P.h - 2 * P.margin;
    const mmPerPx = usableW / w;
    const parts = slices(h, Math.floor(usableH / mmPerPx), breaks);
    for (let i = 0; i < parts.length; i++) {
      const [s, e] = parts[i];
      if (i > 0) pdf.addPage([P.w, P.h], P.orientation);
      const c = await snap(node, w, e - s, 2, s);
      pdf.addImage(c.toDataURL('image/png'), 'PNG', P.margin, P.margin, usableW, (e - s) * mmPerPx, undefined, 'FAST');
      if (parts.length > 1) {
        pdf.setFontSize(7); pdf.setTextColor(110);
        pdf.text(`${spec.title || ''}  |  ${withUiLang(L(spec), () => t('export.page', { i: i + 1, n: parts.length }))}`, P.margin || 6, P.h - (P.margin ? P.margin / 2 : 3));
      }
    }
  });
  pdf.setProperties({ title: spec.title || spec.name, creator: 'SGK-Navigator' });
  download(pdf.output('blob'), spec.name + '.pdf');
}

// ------------------------------------------------------------------ Text-Export (Etappe 3, Erweiterung 2): Word, PDF mit Text, Zwischenablage
// what: 'docx' (Redline als Formatierung) | 'docxTracked' (Änderungsverfolgung) | 'pdftext' (A4) | 'pdftext169' | 'clip'
const MIME = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pdf: 'application/pdf' };

async function lib() { return import('../export/index.js'); }
async function author() { try { const u = await import('./lib/user.js'); return (u.getBy && u.getBy()) || undefined; } catch { return undefined; } }

/** Kartenmodell aus spec (Werk oder Vorschau) oder aus einer Modellfunktion */
export async function modelOf(spec, model) {
  if (model) return await model();
  const { dataFor } = await import('./preview.js');
  const { cardModel } = await import('./cardmodel.js');
  const d = await dataFor(spec);
  return cardModel(d, spec);
}

export function textFileBase(card, what, n) {
  const ti = String(card.title || 'Karte').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  const kind = withUiLang(card.uiLang, () => t(card.kind === 'chronology' ? 'export.file.chron' : card.kind === 'preview' ? 'export.file.preview' : 'export.file.compare'));
  if (n) return withUiLang(card.uiLang, () => t('export.file.basket', { n }));
  return `${ti}_${kind}${what === 'docxTracked' ? '_' + withUiLang(card.uiLang, () => t('export.file.tracked')) : ''}`;
}

/** Schreibt formatierten Text in die Zwischenablage (ClipboardItem, Rückfall execCommand). */
export async function copyFormatted(html, text) {
  if (navigator.clipboard && window.ClipboardItem && window.isSecureContext !== false) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      return 'clipboard';
    } catch (e) { console.warn('Zwischenablage (ClipboardItem) nicht verfügbar, Rückfall', e); }
  }
  const el = document.createElement('div');
  el.contentEditable = 'true';
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;opacity:0;';
  el.innerHTML = html;
  document.body.appendChild(el);
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(range);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  sel.removeAllRanges();
  el.remove();
  if (!ok) throw new Error(t('export.clipFailed'));
  return 'execCommand';
}

/** Eine Karte als Text-Export. Liefert { bytes?, name? } (für Tests). */
export async function exportText(spec, what, model) {
  const card = await modelOf(spec, model);
  const L = await lib();
  if (what === 'clip') {
    const { html: h, text } = L.cardToClipboard(card);
    window.__sgkLastClip = { html: h, text };
    await copyFormatted(h, text);
    return { card };
  }
  let bytes, name, mime;
  if (what === 'docx' || what === 'docxTracked') {
    bytes = L.cardToDocx(card, what === 'docxTracked' ? { redline: 'tracked', author: await author() } : { redline: 'format' });
    name = textFileBase(card, what) + '.docx'; mime = MIME.docx;
  } else {
    bytes = L.cardToPdf(card, { format: what === 'pdftext169' ? '16x9' : 'a4' });
    name = textFileBase(card, what) + (what === 'pdftext169' ? '_16x9' : '_A4') + '.pdf'; mime = MIME.pdf;
  }
  download(new Blob([bytes], { type: mime }), name);
  return { card, name, size: bytes.length };
}

/** Sammelkorb als Word oder PDF mit Text */
export async function exportBasketText(items, what) {
  const cards = [];
  for (const it of items) cards.push(await modelOf({ ...it, ui: it.ui || uiLang() }));
  const L = await lib();
  if (what === 'docx' || what === 'docxTracked') {
    const bytes = L.cardsToDocx(cards, what === 'docxTracked' ? { redline: 'tracked', author: await author() } : { redline: 'format' });
    download(new Blob([bytes], { type: MIME.docx }), textFileBase(cards[0], what, cards.length) + '.docx');
    return bytes.length;
  }
  const bytes = L.cardsToPdf(cards, { format: 'a4' });
  download(new Blob([bytes], { type: MIME.pdf }), textFileBase(cards[0], what, cards.length) + '_Text.pdf');
  return bytes.length;
}
