// SGK-Navigator, Modul Verhandlung — Wort-Diff zweier Zellen (ESM, isomorph)
//
// compareCells(a, b, { clean? }) -> { changed, oldHtml, newHtml, redline, ins, del, segments:[{op:"eq"|"ins"|"del", html}] }
//   a, b: Zelle ({html} oder Inline-HTML-String). Gleiche Semantik wie diffText im SGK-Modul (src/app/lib/diff.js):
//   Wortweise, Tags bleiben auf ihrer Seite, kurze gemeinsame Stücke zwischen Änderungen werden der Änderung
//   zugeschlagen, weitgehend neu gefasster Text (< 40 % gemeinsame Wörter) wird als Ganzes ersetzt.
//   Erlaubte Tags: b i u s sup sub br. clean:true entfernt vor dem Vergleich gestrichenen Text (<s>…</s>) der Quelle.
//   Ausgabe-Markierung: <ins>…</ins> und <del>…</del>.

import { diffArrays } from 'diff';
import { decodeEntities, escapeHtml } from './util.js';

const TOKEN = /([\s ]+)|([\p{L}\p{N}\p{M}]+(?:[’'\-‑][\p{L}\p{N}\p{M}]+)*)|([^\s<])/gu;
const TAGS = ['i', 'b', 'u', 's', 'sup', 'sub', 'br', 'em', 'strong'];

export function tokenize(html) {
  const out = [];
  const parts = String(html || '').split(/(<[^>]+>)/);
  for (const part of parts) {
    if (!part) continue;
    if (part[0] === '<' && part[part.length - 1] === '>') { const t = normTag(part); if (t) out.push({ tag: true, v: t }); continue; }
    const text = decodeEntities(part);
    TOKEN.lastIndex = 0;
    let m;
    while ((m = TOKEN.exec(text))) out.push({ tag: false, v: m[0], ws: !!m[1] });
  }
  return out;
}
function normTag(t) {
  const m = /^<\s*(\/?)\s*([a-z0-9]+)/i.exec(t);
  if (!m) return '';
  const name = m[2].toLowerCase();
  if (!TAGS.includes(name)) return '';
  if (name === 'br') return '<br>';
  return `<${m[1]}${name === 'em' ? 'i' : name === 'strong' ? 'b' : name}>`;
}

const words = (toks) => toks.filter((t) => !t.tag && !t.ws).length;

function cleanup(parts, a, b) {
  const isChg = (p) => p && (p.added || p.removed);
  const common = parts.filter((p) => !isChg(p)).reduce((n, p) => n + words(p.value), 0);
  const total = Math.max(words(a), words(b));
  if (total >= 6 && common / total < 0.4) return [{ removed: true, value: a }, { added: true, value: b }];
  for (let i = 1; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!isChg(p) && isChg(parts[i - 1]) && isChg(parts[i + 1]) && words(p.value) <= 2 && !p.value.some((t) => t.tag)) p.absorb = true;
  }
  const out = [];
  let rem = [], add = [];
  const flush = () => { if (rem.length) out.push({ removed: true, value: rem }); if (add.length) out.push({ added: true, value: add }); rem = []; add = []; };
  for (const p of parts) {
    if (p.removed) rem = rem.concat(p.value);
    else if (p.added) add = add.concat(p.value);
    else if (p.absorb) { rem = rem.concat(p.value); add = add.concat(p.value); }
    else { flush(); out.push(p); }
  }
  flush();
  return out;
}

function emit(tokens, mode) {
  if (mode !== 'eq') {
    if (tokens.every((t) => t.tag || t.ws)) return emit(tokens, 'eq');
    let a = 0, b = tokens.length;
    while (a < b && tokens[a].ws) a++;
    while (b > a && tokens[b - 1].ws) b--;
    if (a > 0 || b < tokens.length) return emit(tokens.slice(0, a), 'eq') + emit(tokens.slice(a, b), mode) + emit(tokens.slice(b), 'eq');
  }
  let s = '', open = false;
  const wrap = mode === 'del' ? ['<del>', '</del>'] : mode === 'ins' ? ['<ins>', '</ins>'] : null;
  for (const t of tokens) {
    if (t.tag) { if (open) { s += wrap[1]; open = false; } s += t.v; }
    else { if (wrap && !open) { s += wrap[0]; open = true; } s += escapeHtml(t.v); }
  }
  if (open) s += wrap[1];
  return s;
}

const stripStruck = (html) => String(html || '').replace(/<s>[\s\S]*?<\/s>/gi, '').replace(/[ \u00a0]{2,}/g, ' ');
const htmlOf = (x) => (x && typeof x === 'object' ? x.html : x) || '';

/**
 * Zwei Zellen vergleichen.
 * @param {{html:string}|string|null} a  ältere Fassung
 * @param {{html:string}|string|null} b  neuere Fassung
 * @param {{clean?:boolean}} opts
 */
export function compareCells(a, b, opts = {}) {
  let ha = htmlOf(a), hb = htmlOf(b);
  if (opts.clean) { ha = stripStruck(ha); hb = stripStruck(hb); }
  const A = tokenize(ha), B = tokenize(hb);
  const parts = cleanup(diffArrays(A, B, { comparator: (x, y) => x.tag === y.tag && x.v === y.v }), A, B);
  let oldHtml = '', newHtml = '', redline = '', ins = 0, del = 0;
  const segments = [];
  const textOnly = (tokens) => tokens.filter((t) => !t.tag || t.v === '<br>');
  for (const p of parts) {
    if (p.removed) {
      del += words(p.value);
      const h = emit(p.value, 'del');
      oldHtml += h; redline += emit(textOnly(p.value), 'del');
      segments.push({ op: 'del', html: emit(p.value, 'eq') });
    } else if (p.added) {
      ins += words(p.value);
      const h = emit(p.value, 'ins');
      newHtml += h; redline += h;
      segments.push({ op: 'ins', html: emit(p.value, 'eq') });
    } else {
      const e = emit(p.value, 'eq');
      oldHtml += e; newHtml += e; redline += e;
      segments.push({ op: 'eq', html: e });
    }
  }
  return { changed: ins + del > 0, oldHtml, newHtml, redline, ins, del, segments };
}

/** Textgleichheit für Änderungserkennung (Leerraum normalisiert, Formatierung ignoriert) */
export function sameText(a, b) {
  const n = (x) => decodeEntities(String(htmlOf(x)).replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '')).replace(/[\s ]+/g, ' ').trim();
  return n(a) === n(b);
}
/** Gleichheit des geltenden Wortlauts: Gestrichenes (<s>, <del>) zählt nicht, Formatierung wird ignoriert. */
export function sameClean(a, b) {
  const n = (x) => decodeEntities(String(htmlOf(x)).replace(/<(s|del|strike)\b[^>]*>[\s\S]*?<\/\1>/g, ' ').replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '')).replace(/[\s ]+/g, ' ').replace(/\s+([.,;:)])/g, '$1').trim();
  return n(a) === n(b);
}
/** Gleichheit inkl. Formatierung (b i u s sup sub) */
export function sameHtml(a, b) {
  const n = (x) => String(htmlOf(x)).replace(/[\s ]+/g, ' ').replace(/<(\/?)(strong|em)>/g, (m, s, t) => `<${s}${t === 'strong' ? 'b' : 'i'}>`).trim();
  return n(a) === n(b);
}
