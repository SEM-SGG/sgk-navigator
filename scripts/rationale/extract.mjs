// Extrahiert die Erwägungsgründe eines EUR-Lex-Akts (ABl.-Format, ids rct_N) wortgetreu.
// Ausgabe je Erwägungsgrund: { n: "12", t: "<inline-html>", fn: [ { n, t } ] }
// Regeln wie im Datensatz (SPEC §5.2): erlaubte Tags <i> <b> <sup> <sub> <br>, Fussnotenverweise nicht im Text (in fn),
// mehrere Absätze bzw. Listenpunkte eines Erwägungsgrunds durch <br> getrennt.
import { readFileSync } from 'node:fs';
import { DOMParser } from '../lib-dom.mjs';

const WS = /[\s  -   　]+/g;
export const cleanSpace = (s) => s.replace(WS, ' ');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const tag = (el) => (el.tagName ? el.tagName.toLowerCase() : '');
const cls = (el) => ((el.getAttribute && el.getAttribute('class')) || '').split(/\s+/);
const kids = (el) => Array.from(el.children || []);

function inlineTag(el) {
  const t = tag(el);
  if (t === 'i' || t === 'em') return 'i';
  if (t === 'b' || t === 'strong') return 'b';
  if (t === 'sup') return 'sup';
  if (t === 'sub') return 'sub';
  if (t === 'span') {
    const c = cls(el);
    if (c.includes('oj-italic') || c.includes('italic')) return 'i';
    if (c.includes('oj-bold') || c.includes('bold')) return 'b';
    if (c.includes('oj-super') || c.includes('superscript')) return 'sup';
    if (c.includes('oj-sub') || c.includes('subscript')) return 'sub';
  }
  return null;
}

function tidy(h) {
  let prev;
  do {
    prev = h;
    h = h.replace(/<(i|b|sup|sub)>(\s*)<\/\1>/g, '$2').replace(/<\/(i|b|sup|sub)>(\s*)<\1>/g, '$2');
  } while (h !== prev);
  h = h.replace(/<(i|b|sup|sub)> +/g, ' <$1>').replace(/ +<\/(i|b|sup|sub)>/g, '</$1> ');
  return h.replace(/ {2,}/g, ' ').trim();
}

function inline(el, footnotes, fns) {
  const parts = [];
  const visit = (node) => {
    if (node.nodeType === 3) { parts.push(esc(node.nodeValue)); return; }
    if (node.nodeType !== 1) return;
    const t = tag(node);
    if (t === 'br') { parts.push('<br>'); return; }
    if (t === 'a') {
      const href = node.getAttribute('href') || '';
      if (href.startsWith('#') && footnotes.has(href.slice(1))) {
        fns.push({ n: cleanSpace(node.textContent).replace(/[()\s]/g, ''), t: footnotes.get(href.slice(1)) });
        parts.push('\u0001');
        return;
      }
    }
    const it = inlineTag(node);
    if (it) { parts.push(`<${it}>`); node.childNodes.forEach(visit); parts.push(`</${it}>`); return; }
    node.childNodes.forEach(visit);
  };
  el.childNodes.forEach(visit);
  let h = cleanSpace(parts.join(''));
  h = h.replace(/\s*\u0001/g, '');
  return tidy(h);
}

function readFootnotes(doc) {
  const m = new Map();
  for (const p of doc.querySelectorAll('p.oj-note, p.note')) {
    const a = p.querySelector('a[id]');
    if (!a) continue;
    const clone = p.cloneNode(true);
    const first = clone.querySelector('a[id]');
    if (first) first.remove();
    m.set(a.getAttribute('id'), cleanSpace(clone.textContent).trim());
  }
  return m;
}

// Zeilen eines Erwägungsgrunds: Absätze der Textzelle; verschachtelte Listentabellen als "Zeichen Text"
function linesOf(td, footnotes, fns) {
  const lines = [];
  for (const c of kids(td)) {
    const t = tag(c);
    if (t === 'p') { const h = inline(c, footnotes, fns); if (h) lines.push(h); }
    else if (t === 'table') {
      for (const tr of c.querySelectorAll('tr')) {
        const tds = kids(tr).filter((x) => tag(x) === 'td');
        const seg = [];
        for (const x of tds) {
          for (const y of kids(x)) {
            if (tag(y) === 'table') throw new Error('Tabelle in Tabelle (Tiefe 3) nicht vorgesehen');
            const h = inline(y, footnotes, fns); if (h) seg.push(h);
          }
        }
        if (seg.length) lines.push(seg.join(' '));
      }
    } else if (t === 'div') { lines.push(...linesOf(c, footnotes, fns)); }
    else { const h = inline(c, footnotes, fns); if (h) lines.push(h); }
  }
  return lines;
}

export function extractRecitals(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const footnotes = readFootnotes(doc);
  const out = [];
  for (const div of doc.querySelectorAll('div[id^="rct_"]')) {
    const id = div.getAttribute('id');
    if (!/^rct_\d+$/.test(id)) continue;
    const tbl = kids(div).find((x) => tag(x) === 'table');
    const tr = tbl.querySelector('tr');
    const tds = kids(tr).filter((x) => tag(x) === 'td');
    if (tds.length !== 2) throw new Error(`${id}: ${tds.length} Zellen`);
    const label = cleanSpace(tds[0].textContent).trim();
    const m = label.match(/^\((\d+)\)$/);
    if (!m) throw new Error(`${id}: Nummer "${label}"`);
    const fns = [];
    const lines = linesOf(tds[1], footnotes, fns);
    const r = { id, n: m[1], t: lines.join('<br>') };
    if (fns.length) r.fn = fns;
    out.push(r);
  }
  return out;
}

export function readRecitals(rawDir, celex, lang) {
  return extractRecitals(readFileSync(`${rawDir}/${celex}_${lang.toUpperCase()}.html`, 'utf8'));
}
