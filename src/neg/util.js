// SGK-Navigator, Modul Verhandlung — Hilfsfunktionen (ESM, isomorph, ohne Abhängigkeiten ausser src/core/text.js)

import { normText, similarity } from '../core/text.js';

export { normText, similarity };

const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ENT[c]);
export const decodeEntities = (s) => String(s ?? '')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (m, n) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[n]);

/** Inline-HTML (b i u s sup sub br) -> Klartext; <br> -> "\n" */
export function htmlToText(html) {
  return decodeEntities(String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
    .replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

/** Klartext ohne gestrichene Teile (<s>…</s>) */
export function htmlToCleanText(html) {
  return htmlToText(String(html || '').replace(/<s>[\s\S]*?<\/s>/gi, ''));
}

const ALLOWED = new Set(['b', 'i', 'u', 's', 'sup', 'sub', 'br']);
/** Inline-HTML auf erlaubte Tags reduzieren (ohne Attribute) */
export function sanitizeInline(html) {
  return String(html || '').replace(/<\s*(\/?)\s*([a-z0-9]+)[^>]*>/gi, (m, sl, name) => {
    const n = name.toLowerCase();
    const map = { strong: 'b', em: 'i', strike: 's', del: 's', ins: 'u' };
    const t = map[n] || n;
    if (!ALLOWED.has(t)) return '';
    if (t === 'br') return sl ? '' : '<br>';
    return `<${sl}${t}>`;
  });
}

/** Segmente [{t, b,i,u,s,sup,sub}] -> Inline-HTML (Tags minimal verschachtelt) */
export function segmentsToHtml(segsIn) {
  const ORDER = ['b', 'i', 'u', 's', 'sup', 'sub'];
  // Leerzeichen übernehmen die gemeinsame Formatierung der Nachbarn (vermeidet "</u> <u>")
  const segs = segsIn.map((s) => ({ ...s }));
  for (let k = 0; k < segs.length; k++) {
    const sg = segs[k];
    if (!sg.t || sg.t.trim() !== '') continue;
    const a = segs[k - 1], b = segs[k + 1];
    if (!a || !b || a.br || b.br) continue;
    for (const f of ['b', 'i', 'u', 's']) sg[f] = !!(a[f] && b[f]);
    sg.sup = false; sg.sub = false;
  }
  let out = '';
  let open = [];
  const closeTo = (n) => { while (open.length > n) out += `</${open.pop()}>`; };
  for (const sg of segs) {
    if (sg.br) { closeTo(0); out += '<br>'; continue; }
    if (!sg.t) continue;
    const want = ORDER.filter((k) => sg[k]);
    // längster gemeinsamer Präfix
    let k = 0;
    while (k < open.length && k < want.length && open[k] === want[k]) k++;
    closeTo(k);
    for (let j = k; j < want.length; j++) { out += `<${want[j]}>`; open.push(want[j]); }
    out += String(sg.t).replace(/[&<>]/g, (c) => ENT[c]);
  }
  closeTo(0);
  // leere Tags und Leerzeichen-Tags zusammenfassen
  return out.replace(/<(b|i|u|s|sup|sub)><\/\1>/g, '').replace(/<\/(b|i|u|s|sup|sub)><\1>/g, '');
}

/** Datum aus englischem Text ("13 December 2023", "15-02-2024", "05 December 2023") -> ISO */
const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
export function parseDateEn(s) {
  const t = String(s || '');
  let m = /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i.exec(t);
  if (m) return `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /\b(\d{1,2})[-./](\d{1,2})[-./](\d{4})\b/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t);
  if (m) return m[0];
  return null;
}

/** Ratsdokument-Nummer erkennen: "8413/23", "WK 16999/2023", "14601/21 ADD 1", "PE-CONS 40/24" */
export function parseDocRef(s) {
  const t = String(s || '');
  let m = /\bWK\s+(\d{1,5})\/(\d{4})(?:\s+(INIT|REV\s*\d+|ADD\s*\d+|COR\s*\d+))?/i.exec(t);
  if (m) return `WK ${m[1]}/${m[2].slice(2)}${m[3] && !/INIT/i.test(m[3]) ? ' ' + m[3].toUpperCase().replace(/\s+/, ' ') : ''}`;
  m = /\bPE-CONS\s+(\d{1,4})\/(\d{2})/.exec(t);
  if (m) return `PE-CONS ${m[1]}/${m[2]}`;
  m = /\b(\d{3,5})(?:\/(\d))?\/(\d{2})(?:\s+(REV\s*\d+|ADD\s*\d+|COR\s*\d+))?\b/.exec(t);
  if (m) return `ST ${m[1]}${m[2] ? '/' + m[2] : ''}/${m[3]}${m[4] ? ' ' + m[4].toUpperCase() : ''}`;
  m = /\bCOM\s*\((\d{4})\)\s*(\d+)/.exec(t);
  if (m) return `COM(${m[1]}) ${m[2]}`;
  return null;
}

/** Verfahrensnummer "2021/0428(COD)" */
export function parseProcedure(s) {
  const m = /\b(\d{4})\s*\/\s*(\d{4})\s*\(\s*(COD|CNS|NLE|APP)\s*\)/.exec(String(s || ''));
  return m ? `${m[1]}/${m[2]}(${m[3]})` : null;
}

/** Einstufung aus Dokumenttext */
export function parseClassification(s) {
  const t = String(s || '');
  if (/\bRESTREINT\s+UE|\bRESTRICTED\b/.test(t)) return 'restricted';
  if (/\bLIMITE\b/.test(t)) return 'limite';
  return null;
}

/** sha256 (hex) über WebCrypto, falls verfügbar; sonst null */
export async function sha256Hex(bytes) {
  const c = globalThis.crypto && globalThis.crypto.subtle;
  if (!c) return null;
  const h = await c.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

export function warn(code, message, extra) { return { code, message, ...(extra || {}) }; }

/** Natürlicher Vergleich von Zeilennummern "12" < "12a" < "12b" < "13" */
export function cmpNum(a, b) {
  const pa = /^(\d+)([a-z]*)$/i.exec(String(a || '')), pb = /^(\d+)([a-z]*)$/i.exec(String(b || ''));
  if (!pa || !pb) return String(a).localeCompare(String(b));
  return (+pa[1] - +pb[1]) || pa[2].localeCompare(pb[2]);
}

/** Wörter für Abdeckungsmessungen */
export function words(t) {
  return normText(String(t || '')).split(/[\s\-‐‑–—]+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean);
}
