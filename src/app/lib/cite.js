// Zitierweise nach SPEC §7.2.
// DE (Schweiz): "Art. 8 Abs. 3 Bst. a Ziff. i SGK", "Anhang V Teil B SGK"
// FR: "art. 8, par. 3, point a) i), CFS"      EN: "Article 8(3)(a)(i) SBC"

const ROMAN = /^(?:x{0,3})(?:ix|iv|v?i{0,3})(?:[a-z])?$/;
const FR_SUFFIX = { a: 'bis', b: 'ter', c: 'quater', d: 'quinquies', e: 'sexies', f: 'septies', g: 'octies', h: 'nonies', i: 'decies' };
const ORD = {
  de: (n) => `${n}`,
  fr: (n) => ['', 'premier', 'deuxième', 'troisième', 'quatrième', 'cinquième', 'sixième', 'septième', 'huitième', 'neuvième', 'dixième'][n] || `${n}e`,
  frF: (n) => ['', 'première', 'deuxième', 'troisième', 'quatrième', 'cinquième', 'sixième', 'septième', 'huitième', 'neuvième', 'dixième'][n] || `${n}e`,
  en: (n) => ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'][n] || `${n}th`,
};

/** Zerlegt einen Blockschlüssel in typisierte Segmente. */
export function parseKey(key) {
  if (!key) return [];
  const segs = [];
  let prevType = null;
  for (const raw of String(key).split('.')) {
    let m;
    let seg;
    if ((m = /^p(\d+[a-z]*)$/.exec(raw))) seg = { type: 'par', v: m[1] };
    else if ((m = /^n(\d+[a-z]*)$/.exec(raw))) seg = { type: 'num', v: m[1] };
    else if ((m = /^s(\d+)([a-z]*)$/.exec(raw))) seg = { type: 'sub', v: Number(m[1]), x: m[2] };
    else if ((m = /^d(\d+)$/.exec(raw))) seg = { type: 'dash', v: Number(m[1]) };
    else if ((m = /^pt([A-Z0-9]+)$/.exec(raw))) seg = { type: 'part', v: m[1] };
    else if ((m = /^h(\d+)$/.exec(raw))) seg = { type: 'head', v: Number(m[1]) };
    else if ((m = /^t(\d+)$/.exec(raw))) seg = { type: 'table', v: Number(m[1]) };
    else if ((m = /^g(\d+)$/.exec(raw))) seg = { type: 'img', v: Number(m[1]) };
    else if (/^[a-z]+$/.test(raw) && prevType === 'let' && ROMAN.test(raw)) seg = { type: 'rom', v: raw };
    else if (/^[a-z]+$/.test(raw)) seg = { type: 'let', v: raw };
    else seg = { type: 'raw', v: raw };
    segs.push(seg);
    prevType = seg.type;
  }
  return segs;
}

function frNum(num) {
  // "8a" -> "8 bis"
  const m = /^(\d+)([a-i])$/.exec(num || '');
  return m ? `${m[1]} ${FR_SUFFIX[m[2]]}` : num;
}
function frLetter(v) {
  // "ba" -> "b bis", "iiia" -> "iii bis"; reine römische Ziffern ("ii", "vi") bleiben unverändert.
  const PURE = /^(?=[ivx])(?:x{0,3})(?:ix|iv|v?i{0,3})$/;
  if (v.length < 2 || PURE.test(v)) return v;
  const head = v.slice(0, -1);
  const suf = FR_SUFFIX[v[v.length - 1]];
  if (suf && (PURE.test(head) || head.length === 1)) return `${head} ${suf}`;
  return v;
}

/**
 * Zitat einer Einheit oder Bestimmung.
 * @param {{type:string,num:string}} unit
 * @param {string|null} key
 * @param {'de'|'fr'|'en'} lang
 * @param {{de:string,fr:string,en:string}} abbr  Werkabkürzung
 */
export function cite(unit, key, lang = 'de', abbr = { de: 'SGK', fr: 'CFS', en: 'SBC' }) {
  if (!unit) return '';
  const a = (abbr && abbr[lang]) || '';
  if (unit.type === 'recitals') {
    // Erwägungsgründe: "Erw. 12 SGK", "consid. 12, CFS", "recital 12 SBC"; ganze Einheit: "Erwägungsgründe SGK"
    const m = /^r(\d+[a-z]*)/.exec(key || '');
    const head = m ? { de: `Erw. ${m[1]}`, fr: `consid. ${m[1]}`, en: `recital ${m[1]}` }[lang] : { de: 'Erwägungsgründe', fr: 'considérants', en: 'Recitals' }[lang];
    const s = m || lang !== 'fr' ? head : head[0].toUpperCase() + head.slice(1);
    return a ? (lang === 'fr' ? `${s}, ${a}` : `${s} ${a}`) : s;
  }
  // Aufeinanderfolgende Nummern (Anhang: 2.1.2) als eine Dezimalgliederung zitieren.
  const segs = [];
  for (const g of parseKey(key)) {
    const last = segs[segs.length - 1];
    if (g.type === 'num' && last && last.type === 'num') segs[segs.length - 1] = { type: 'num', v: `${last.v}.${g.v}`, dotted: true };
    else segs.push(g);
  }
  const isAnnex = unit.type === 'annex';
  const num = unit.num || '';
  if (lang === 'fr') {
    let s = isAnnex ? `annexe ${num}` : `art. ${frNum(num)}`;
    let lastPoint = false;
    for (const g of segs) {
      if (g.type === 'par') { s += `, par. ${frNum(g.v)}`; lastPoint = false; }
      else if (g.type === 'num') { s += g.dotted ? `, point ${g.v}` : `, point ${g.v})`; lastPoint = true; }
      else if (g.type === 'let') { s += `, point ${frLetter(g.v)})`; lastPoint = true; }
      else if (g.type === 'rom') { s += lastPoint ? ` ${frLetter(g.v)})` : `, point ${frLetter(g.v)})`; lastPoint = true; }
      else if (g.type === 'sub') { s += `, ${ORD.fr(g.v)} alinéa`; lastPoint = false; }
      else if (g.type === 'dash') { s += `, ${ORD.fr(g.v)} tiret`; lastPoint = false; }
      else if (g.type === 'part') { s += `, partie ${g.v}`; lastPoint = false; }
      else if (g.type === 'table') { s += `, tableau ${g.v}`; }
      else if (g.type === 'img') { s += `, figure ${g.v}`; }
    }
    return a ? `${s}, ${a}` : s;
  }
  if (lang === 'en') {
    let s = isAnnex ? `Annex ${num}` : `Article ${num}`;
    let tail = '';
    for (const g of segs) {
      if (g.type === 'par' || g.type === 'let' || g.type === 'rom' || g.type === 'num') {
        if (tail) tail += `, point (${g.v})`;
        else s += `(${g.v})`;
      }
      else if (g.type === 'sub') tail += `, ${ORD.en(g.v)} subparagraph`;
      else if (g.type === 'dash') tail += `, ${ORD.en(g.v)} indent`;
      else if (g.type === 'part') tail += `, Part ${g.v}`;
      else if (g.type === 'table') tail += `, table ${g.v}`;
      else if (g.type === 'img') tail += `, figure ${g.v}`;
    }
    s += tail;
    return a ? (tail ? `${s}, ${a}` : `${s} ${a}`) : s;
  }
  // de
  let s = isAnnex ? `Anhang ${num}` : `Art. ${num}`;
  for (let i = 0; i < segs.length; i++) {
    const g = segs[i];
    if (g.type === 'par') s += ` Abs. ${g.v}`;
    else if (g.type === 'let') s += ` Bst. ${g.v}`;
    else if (g.type === 'rom') s += ` Ziff. ${g.v}`;
    else if (g.type === 'num') s += i > 0 && segs[i - 1].type === 'rom' ? ` Nr. ${g.v}` : ` Ziff. ${g.v}`;
    else if (g.type === 'sub') s += ` Unterabs. ${ORD.de(g.v)}`;
    else if (g.type === 'dash') s += ` Strich ${g.v}`;
    else if (g.type === 'part') s += ` Teil ${g.v}`;
    else if (g.type === 'table') s += ` Tabelle ${g.v}`;
    else if (g.type === 'img') s += ` Abbildung ${g.v}`;
  }
  return a ? `${s} ${a}` : s;
}

/** Kurzform ohne Werkabkürzung, für Listen. */
export const citeShort = (unit, key, lang = 'de') => cite(unit, key, lang, null);
