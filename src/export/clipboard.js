// SGK-Navigator — «Als formatierten Text kopieren»: HTML mit Inline-Styles und reiner Text (ESM, isomorph).
//
// cardToClipboard(card, { colors?, textRedline? }) -> { html, text }
//   html: nur Inline-Styles (kein <style>, keine Klassen), Absätze <p> und Tabellen <table>, damit Word und Outlook
//         Formatierung, Einzüge und Redline beim Einfügen übernehmen. <ins>/<del> tragen zusätzlich text-decoration.
//         Tabulator nach dem Gliederungszeichen als <span style="mso-tab-count:1"> (von Word erkannt).
//   text: reiner Text; Redline als [-gestrichen-] {+eingefügt+} (textRedline: "marks" Standard | "new" | "old").
// Einbindung im Browser: navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }),
//   'text/plain': new Blob([text], { type: 'text/plain' }) })]); Rückfall: document.execCommand('copy') mit contenteditable.

import { CARBON } from '../app/tokens.js';
import { normalizeCard, assertCard, textLocale, uiLocale, label as lbl, blockIndents } from './model.js';

const COL = { ins: CARBON['diff-ins-text'], del: CARBON['diff-del-text'], meta: CARBON['ink-muted'], rule: CARBON['border-strong'], head: CARBON['surface-1'] };
const FONT = "font-family:Arial,'Liberation Sans',Helvetica,sans-serif";
const STEP = 21.25;   // pt, wie Word (0,75 cm)

const escH = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** Text mit Zeilenumbrüchen; mehrfache Leerzeichen bleiben erhalten */
const txt = (s) => escH(s).replace(/ {2,}/g, (m) => ' ' + '&nbsp;'.repeat(m.length - 1)).replace(/\n/g, '<br>');
const hang = (label) => { const est = [...label].reduce((a, c) => a + (/[il.,;:()|'’\s]/.test(c) ? 3 : /[mwMW]/.test(c) ? 8.5 : 5.75), 0) + 4.5; return est <= STEP ? STEP : Math.ceil(est / 7.1) * 7.1; };
const pt = (x) => Math.round(x * 100) / 100 + 'pt';

function runsHtml(runs, colors) {
  return runs.map((r) => {
    let s = txt(r.t);
    if (r.sup) s = `<sup>${s}</sup>`; else if (r.sub) s = `<sub>${s}</sub>`;
    if (r.i) s = `<i>${s}</i>`;
    if (r.b) s = `<b>${s}</b>`;
    if (r.lang) s = `<span lang="${escH(r.lang)}">${s}</span>`;
    if (r.op === 'ins') s = `<ins style="text-decoration:underline;${colors ? 'color:' + COL.ins + ';' : ''}">${s}</ins>`;
    else if (r.op === 'del') s = `<del style="text-decoration:line-through;${colors ? 'color:' + COL.del + ';' : ''}">${s}</del>`;
    return s;
  }).join('');
}

function blocksHtml(card, blocks, colors) {
  const ind = blockIndents(blocks, { step: STEP, hang });
  return blocks.map((b, k) => {
    const { left, hang: h } = ind[k];
    const lang = textLocale(b.lang, card);
    if (b.type === 'table') {
      const rows = b.rows.map((r) => `<tr>${r.cells.map((c) => `<td${c.span > 1 ? ` colspan="${c.span}"` : ''} valign="top" style="border:1px solid ${COL.rule};padding:2pt 4pt;vertical-align:top;${FONT};font-size:9.5pt;${r.header ? 'font-weight:bold;' : ''}">${runsHtml(c.runs, colors)}</td>`).join('')}</tr>`).join('');
      return (b.label ? `<p lang="${lang}" style="margin:0 0 4pt ${pt(left - h)};${FONT};font-size:10pt;">${txt(b.label)}</p>` : '')
        + `<table lang="${lang}" style="border-collapse:collapse;margin:0 0 6pt ${pt(left)};">${rows}</table>`;
    }
    const style = `margin:${b.type === 'heading' ? '4pt' : '0'} 0 4pt ${pt(left)};${h ? `text-indent:-${pt(h)};` : ''}${FONT};font-size:10pt;line-height:115%;${b.type === 'img' ? `font-style:italic;color:${COL.meta};` : ''}${b.type === 'heading' ? 'font-weight:bold;' : ''}`;
    const label = b.label ? `${txt(b.label)}<span style="mso-tab-count:1">&nbsp;&nbsp;</span>` : '';
    return `<p lang="${lang}" style="${style}">${label}${runsHtml(b.runs, colors)}</p>`;
  }).join('\n');
}

const sq = (color) => (color ? `<span style="color:${escH(color)};">■</span> ` : '');

function cardHtml(card, colors) {
  const ul = uiLocale(card);
  const p = (inner, st) => `<p style="${FONT};${st}">${inner}</p>`;
  const out = [];
  out.push(p(txt(card.title), 'margin:0 0 3pt 0;font-size:14pt;font-weight:bold;'));
  if (card.subtitle) out.push(p(txt(card.subtitle), 'margin:0 0 2pt 0;font-size:11pt;'));
  if (card.unitLine) out.push(p(txt(card.unitLine), `margin:0 0 8pt 0;font-size:10pt;color:${COL.meta};`));
  if (card.stats) out.push(p(txt(card.stats), `margin:0 0 4pt 0;font-size:8pt;color:${COL.meta};`));
  for (const s of card.sections) {
    const head = [sq(s.color), s.code ? `<b>${txt(s.code)}</b>&nbsp;&nbsp;` : '', txt(s.heading), s.tag ? `&nbsp;&nbsp;<b>${txt(s.tag)}</b>` : '', ...s.flags.map((f) => `&nbsp;&nbsp;<i>[${txt(f.label)}]</i>`)].join('');
    out.push(p(head, 'margin:10pt 0 1pt 0;font-size:10pt;'));
    if (s.meta.length) out.push(p(txt(s.meta.join(' | ')), `margin:0 0 4pt 0;font-size:8pt;color:${COL.meta};`));
    out.push(blocksHtml(card, s.blocks, colors));
  }
  if (card.columns && card.rows && card.rows.length) {
    const withLabels = card.rows.some((r) => r.label || r.tag) || !!card.labelHeading;
    const td = (inner, w, extra = '') => `<td width="${w}%" valign="top" style="width:${w}%;border-top:1px solid ${COL.rule};border-bottom:1px solid ${COL.rule};padding:3pt 4pt;vertical-align:top;${FONT};font-size:10pt;${extra}">${inner}</td>`;
    const ws = withLabels ? [18, 41, 41] : [50, 50];
    const head = (withLabels ? [card.labelHeading || ''] : []).concat(card.columns.map((c) => c.heading));
    const rows = [`<tr>${head.map((h, k) => td(`<b>${txt(h)}</b>`, ws[k], 'font-size:9pt;background:' + COL.head + ';')).join('')}</tr>`];
    for (const r of card.rows) {
      const cells = [];
      if (withLabels) cells.push(td(`${r.label ? `<b>${txt(r.label)}</b>` : ''}${r.tag ? `<br><span style="font-size:8pt;color:${COL.meta};">${txt(r.tag)}</span>` : ''}`, ws[0], 'font-size:9pt;'));
      r.cells.forEach((c, k) => {
        const inner = c ? blocksHtml(card, c.blocks, colors) + ((c.marks || []).length ? p(c.marks.map((m) => sq(m.color) + txt(m.label)).join('&nbsp;&nbsp; '), `margin:2pt 0 0 0;font-size:8pt;color:${COL.meta};`) : '') : txt(lbl(card, 'empty'));
        cells.push(td(inner, ws[withLabels ? k + 1 : k]));
      });
      rows.push(`<tr>${cells.join('')}</tr>`);
    }
    out.push(`<table lang="${ul}" width="100%" cellpadding="4" cellspacing="0" style="border-collapse:collapse;width:100%;margin:6pt 0 6pt 0;">${rows.join('\n')}</table>`);
  }
  for (const f of card.footnotes) out.push(p(`<sup>${txt(f.mark)}</sup> ${txt(f.text)}`, `margin:0 0 2pt 0;font-size:8pt;color:${COL.meta};`));
  const leg = card.legend.map((l) => (l.op ? runsHtml([{ t: l.label, op: l.op }], colors) : `${sq(l.color)}${l.code ? `<b>${txt(l.code)}</b> ` : ''}${txt(l.label)}`));
  if (leg.length) out.push(p(leg.join('&nbsp;&nbsp;&nbsp;&nbsp; '), 'margin:8pt 0 2pt 0;font-size:8.5pt;'));
  if (card.source) out.push(p(txt(card.source), `margin:0 0 2pt 0;font-size:8pt;color:${COL.meta};`));
  if (card.disclaimer) out.push(p(txt(card.disclaimer), `margin:0 0 2pt 0;font-size:8pt;color:${COL.meta};`));
  return `<div lang="${ul}" style="${FONT};font-size:10pt;color:${CARBON.ink};">\n${out.join('\n')}\n</div>`;
}

function runsText(runs, mode) {
  return runs.map((r) => {
    if (r.op === 'del') return mode === 'new' ? '' : mode === 'old' ? r.t : `[-${r.t}-]`;
    if (r.op === 'ins') return mode === 'old' ? '' : mode === 'new' ? r.t : `{+${r.t}+}`;
    return r.t;
  }).join('');
}

function blocksText(blocks, mode, pad = '') {
  return blocks.map((b) => {
    const ind = pad + '    '.repeat(b.depth);
    const body = b.type === 'table' ? b.rows.map((r) => r.cells.map((c) => runsText(c.runs, mode)).join(' | ')).join('\n' + ind) : runsText(b.runs, mode);
    return ind + (b.label ? b.label + ' ' : '') + body.replace(/\n/g, '\n' + ind);
  }).join('\n');
}

function cardText(card, mode) {
  const out = [card.title];
  if (card.subtitle) out.push(card.subtitle);
  if (card.unitLine) out.push(card.unitLine);
  if (card.stats) out.push(card.stats);
  for (const s of card.sections) {
    out.push('', [s.code, s.heading, s.tag ? '– ' + s.tag : '', ...s.flags.map((f) => '[' + f.label + ']')].filter(Boolean).join(' '));
    if (s.meta.length) out.push(s.meta.join(' | '));
    out.push(blocksText(s.blocks, mode));
  }
  if (card.columns && card.rows && card.rows.length) {
    for (const r of card.rows) {
      out.push('', [r.label, r.tag ? `(${r.tag})` : ''].filter(Boolean).join(' '));
      r.cells.forEach((c, k) => {
        out.push(`  ${card.columns[k].heading}:`);
        out.push(c ? blocksText(c.blocks, mode, '    ') + ((c.marks || []).length ? '\n    (' + c.marks.map((m) => m.label).join(', ') + ')' : '') : '    ' + lbl(card, 'empty'));
      });
    }
  }
  if (card.footnotes.length) out.push('', ...card.footnotes.map((f) => `${f.mark} ${f.text}`));
  const leg = card.legend.map((l) => (l.op ? (mode === 'marks' ? (l.op === 'ins' ? `{+${l.label}+}` : `[-${l.label}-]`) : '') : [l.code, l.label].filter(Boolean).join(' '))).filter(Boolean);
  if (leg.length) out.push('', leg.join('; '));
  if (card.source) out.push(card.source);
  if (card.disclaimer) out.push(card.disclaimer);
  return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

/**
 * Karte für die Zwischenablage.
 * @param {import('./model.js').Card} card
 * @param {{ colors?: boolean, textRedline?: 'marks'|'new'|'old' }} [opts]
 * @returns {{ html: string, text: string }}
 */
export function cardToClipboard(card, opts = {}) {
  assertCard(card);
  const c = normalizeCard(card);
  return { html: cardHtml(c, opts.colors !== false), text: cardText(c, opts.textRedline || 'marks') };
}

/** Mehrere Karten hintereinander (Sammelkorb) */
export function cardsToClipboard(cards, opts = {}) {
  const parts = cards.map((c) => cardToClipboard(c, opts));
  return { html: parts.map((p) => p.html).join('\n<p style="margin:0;">&nbsp;</p>\n'), text: parts.map((p) => p.text).join('\n') };
}
