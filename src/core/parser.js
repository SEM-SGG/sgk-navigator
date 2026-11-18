// SGK-Navigator — Parser fuer EUR-Lex-HTML (ABl.-Fassung, konsolidiert alt, konsolidiert neu).
// ESM, isomorph: keine Node-APIs. Der DOMParser wird injiziert (Browser: window.DOMParser, Node: linkedom).
//
// parseEurLex(htmlString, { DOMParser }) ->
//   { kind:"oj"|"consolidated", format:"oj"|"cons-old"|"cons-new", celex, lang, date,
//     modifiers:[{marker, celex, title}], units:[…], toc:[…], hasImages, workTitle }
//
// Ein unit: { id, type:"article"|"annex", num, label, title, blocks:[…], deletions:[…] }
// Ein block: { k, d, l, t, o, fn?, ty?, html?, img?, act? }   (act = Markeraktion INSERTED|REPLACED|null)

import { normLabelKey, ROMAN_RE } from './text.js';

const BASE_FALLBACK = null;

// ------------------------------------------------------------------ Hilfen

const LANG_WORDS = {
  article: null, // unten gesetzt (braucht SUFFIX_ALT)
  annex: /^(ANHANG|ANNEXE|ANNEX)(?:\s+([IVXLC]+)\s*([a-z]|bis|ter|quater)?)?\s*$/i,
  division: /^(TITEL|TITRE|TITLE|KAPITEL|CHAPITRE|CHAPTER|ABSCHNITT|SECTION)\s+([IVXLC0-9]+)\s*([a-z]|bis|ter|quater)?\s*$/i,
  part: /^(TEIL|PARTIE|PART|Teil|Partie|Part)\s+([A-Z][0-9]?|[IVX]+|\d+)\b\s*[:.]?\s*(.*)$/,
  final: /in allen ihren Teilen verbindlich|obligatoire dans tous ses éléments|binding in its entirety/i,
};

const SUFFIX = { bis: 'a', ter: 'b', quater: 'c', quinquies: 'd', sexies: 'e', septies: 'f', octies: 'g', nonies: 'h', decies: 'i',
  // ab undecies (VIS-VO nach 2021/1134: Art. 9 undecies = 9j, Art. 22 vicies = 22s …)
  undecies: 'j', duodecies: 'k', terdecies: 'l', quaterdecies: 'm', quindecies: 'n', sexdecies: 'o', septdecies: 'p',
  octodecies: 'q', novodecies: 'r', vicies: 's', unvicies: 't', duovicies: 'u', tervicies: 'v', quatervicies: 'w', quinvicies: 'x' };
const SUFFIX_ALT = 'bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies|undecies|duodecies|terdecies|quaterdecies|quindecies|sexdecies|septdecies|octodecies|novodecies|vicies|unvicies|duovicies|tervicies|quatervicies|quinvicies';
LANG_WORDS.article = new RegExp('^(Artikel|Article)\\s+(\\d+|premier|1er)\\s*([a-z]|' + SUFFIX_ALT + ')?\\s*$', 'i');

function numSuffix(n, suf) {
  if (!suf) return n;
  const s = suf.toLowerCase();
  return n + (SUFFIX[s] || s);
}

function divType(word) {
  const w = word.toUpperCase();
  if (['TITEL', 'TITRE', 'TITLE'].includes(w)) return 'title';
  if (['KAPITEL', 'CHAPITRE', 'CHAPTER'].includes(w)) return 'chapter';
  return 'section';
}
const DIV_PREFIX = { title: 'tit', chapter: 'cpt', section: 'sct' };

export function cleanSpace(s) {
  return s.replace(/[  -   　\t\r\n]+/g, ' ').replace(/ {2,}/g, ' ');
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function hasClass(el, c) {
  const cl = el.getAttribute && el.getAttribute('class');
  if (!cl) return false;
  return (' ' + cl + ' ').includes(' ' + c + ' ');
}
function classList(el) {
  const cl = el.getAttribute && el.getAttribute('class');
  return cl ? cl.split(/\s+/) : [];
}
function tag(el) { return el.tagName ? el.tagName.toLowerCase() : ''; }
function elementChildren(el) { return Array.from(el.children || []); }
function childByClass(el, c, t) {
  return elementChildren(el).find((x) => hasClass(x, c) && (!t || tag(x) === t)) || null;
}
const BLOCK_TAGS = new Set(['p', 'div', 'table', 'ul', 'ol', 'li', 'figure', 'img', 'hr', 'h1', 'h2', 'h3', 'h4']);
function isInlineOnly(el) {
  if (!cleanSpace(el.textContent || '').trim()) return false;
  return !elementChildren(el).some((c) => BLOCK_TAGS.has(tag(c)));
}
function childrenByTag(el, t) { return elementChildren(el).filter((x) => tag(x) === t); }
function tableRows(tbl) {
  const rows = [];
  for (const c of elementChildren(tbl)) {
    if (tag(c) === 'tr') rows.push(c);
    else if (['tbody', 'thead', 'tfoot'].includes(tag(c))) rows.push(...childrenByTag(c, 'tr'));
  }
  return rows;
}

// Marker-Link: <a title="32017R2225: REPLACED">▼M3</a>
function readMarker(a) {
  const title = a.getAttribute('title') || '';
  const href = a.getAttribute('href') || '';
  const text = cleanSpace(a.textContent).trim();
  let celex = null, action = null;
  const m = title.match(/^([0-9A-Z()]+?)(?::\s*(INSERTED|REPLACED|DELETED|AMENDED))?\s*$/);
  if (m) { celex = m[1]; action = m[2] || null; }
  if (!celex) {
    const h = decodeURIComponent(href).match(/celex:([0-9A-Z()]+)/i);
    if (h) celex = h[1].toUpperCase();
  }
  return { celex, action, label: text.replace(/^[▼►]\s*/, '') };
}

// ------------------------------------------------------------------ Inline-HTML

const INLINE_MAP = [
  [['italics', 'oj-italic', 'italic'], 'i'],
  [['boldface', 'oj-bold', 'bold'], 'b'],
  [['superscript', 'oj-super', 'super'], 'sup'],
  [['subscript', 'oj-sub', 'sub'], 'sub'],
];

function inlineTagFor(el) {
  const t = tag(el);
  if (t === 'i' || t === 'em') return 'i';
  if (t === 'b' || t === 'strong') return 'b';
  if (t === 'sup') return 'sup';
  if (t === 'sub') return 'sub';
  if (t === 'span') {
    const cls = classList(el);
    for (const [names, out] of INLINE_MAP) if (cls.some((c) => names.includes(c))) return out;
  }
  return null;
}

// Wandelt den Inhalt eines Elements in bereinigtes Inline-HTML um.
// Fussnotenverweise werden entfernt und in fns gesammelt. Inline-Marker (►C1 … ◄) werden entfernt, ihre CELEX gemeldet.
function inlineHtml(el, ctx, out, opts = {}) {
  const fns = out.fns;
  const parts = [];
  const visit = (node) => {
    if (node.nodeType === 3) { parts.push(escapeHtml(node.nodeValue)); return; }
    if (node.nodeType !== 1) return;
    const t = tag(node);
    if (opts.skip && opts.skip(node)) return;
    if (t === 'br') { parts.push('<br>'); return; }
    if (t === 'img') { out.imgs.push(node); return; }
    if (t === 'script' || t === 'style') return;
    if (t === 'a') {
      const href = node.getAttribute('href') || '';
      const title = node.getAttribute('title') || '';
      const txt = cleanSpace(node.textContent).trim();
      // Inline-Marker
      if (/^[▼►]/.test(txt) && (title || /celex/i.test(href))) {
        const mk = readMarker(node);
        if (mk.celex) out.inlineMarkers.push(mk);
        return;
      }
      // Fussnotenverweis
      if (href.startsWith('#')) {
        const fn = ctx.footnotes.get(href.slice(1));
        if (fn) {
          fns.push({ n: txt.replace(/[()]/g, '').trim(), t: fn });
          parts.push('\u0001');
          return;
        }
        // Verweis auf eine Fussnote, deren Text in der Datei fehlt (ABl.-Dateien aus Cellar: Fussnoten "*1" in zitierten Neufassungen)
        if (isNoteRef(node)) {
          fns.push({ n: txt.replace(/[()]/g, '').trim(), t: '', missing: true });
          parts.push('\u0001');
          return;
        }
      }
      node.childNodes.forEach(visit);
      return;
    }
    if (t === 'span' && /^\s*◄\s*$/.test(node.textContent)) return; // Ende Inline-Marker
    const it = inlineTagFor(node);
    if (it) {
      parts.push(`<${it}>`);
      node.childNodes.forEach(visit);
      parts.push(`</${it}>`);
      return;
    }
    node.childNodes.forEach(visit);
  };
  if (opts.nodes) opts.nodes.forEach(visit); else el.childNodes.forEach(visit);
  let h = parts.join('');
  if (h.includes('\u0002')) h = h.replace(/\s*\u0002\s*(?=[,;:.)])/g, '').replace(/\s*\u0002\s*/g, ' ');
  h = cleanSpace(h);
  // Klammern um entfernte Fussnotenverweise entfernen: "Rates (\u0001)" -> "Rates"
  h = h.replace(/\s*\(\s*(?:<sup>\s*)?\u0001(?:\s*<\/sup>)?\s*\)/g, '');
  h = h.replace(/\s*(?:<sup>\s*)?\u0001(?:\s*<\/sup>)?/g, '');
  h = tidyInline(h);
  return h;
}

// Fussnotenverweis des ABl.-Formats (<a href="#ntr…"><span class="oj-note-tag">…</span></a>), auch ohne auffindbaren Fussnotentext
function isNoteRef(a) {
  const href = a.getAttribute('href') || '';
  return href.startsWith('#') && !!a.querySelector('.oj-note-tag');
}

export function tidyInline(h) {
  let prev;
  do {
    prev = h;
    h = h.replace(/<(i|b|sup|sub)>(\s*)<\/\1>/g, '$2');
    h = h.replace(/<\/(i|b|sup|sub)>(\s*)<\1>/g, '$2');
  } while (h !== prev);
  // Leerzeichen aus Tags herausziehen
  h = h.replace(/<(i|b|sup|sub)> +/g, ' <$1>').replace(/ +<\/(i|b|sup|sub)>/g, '</$1> ');
  h = h.replace(/(<br>\s*)+$/g, '').replace(/^(\s*<br>)+/g, '');
  h = h.replace(/ {2,}/g, ' ').trim();
  return h;
}

export function htmlToText(h) {
  return h.replace(/<br>/g, ' ').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/ {2,}/g, ' ').trim();
}

// ------------------------------------------------------------------ Gliederungszeichen

// Zerlegt ein Gliederungszeichen in Familie und Schluesselsegment.
// fam: P (Absatz), N (Ziffer), A (Buchstabe), R (roemisch), D (Strich), X (unbekannt)
export function classifyLabel(raw, prevSeg) {
  let l = cleanSpace(raw).trim();
  if (!l) return null;
  // von EUR-Lex stehen gelassene Anfuehrungszeichen vor dem Zeichen ("«a)") gehoeren nicht zum Gliederungszeichen
  if (/^[„“«‘‚"]\s*\S/.test(l)) l = l.replace(/^[„“«‘‚"]\s*/, '');
  if (/^[—–\-•▪]$/.test(l)) return { fam: 'D', seg: null, l };
  let core = l.replace(/^\(\s*/, '').replace(/\s*\)\s*\.?$/, '').replace(/\s*\.$/, '').trim();
  // "b bis" / "1 bis" / "i bis"
  let m = core.match(new RegExp('^([0-9]+(?:\\.[0-9]+)*|[a-z]{1,4})\\s*(' + SUFFIX_ALT + ')$', 'i'));
  if (m) core = m[1] + SUFFIX[m[2].toLowerCase()];
  // "(2-a)" (DE/EN) bzw. "2 -bis." (FR): so in der VIS-VO (Art. 6, Berichtigung 32024R1356R(01)); eigener Absatz vor (3), nicht (2a)
  const mh = core.match(/^(\d+)\s*-\s*(a|bis)$/i);
  if (mh) return { fam: 'N', comps: [mh[1] + '-a'], seg: 'n' + mh[1] + '-a', l };
  if (/^\d+(\.\d+)*[a-z]?$/.test(core)) {
    const comps = core.split('.');
    return { fam: 'N', comps, seg: comps.map((c) => 'n' + c).join('.'), l };
  }
  if (/^[a-z]{1,2}$/.test(core) || ROMAN_RE.test(core)) {
    const isRoman = ROMAN_RE.test(core);
    const isLetter = /^[a-z]{1,2}$/.test(core) && !(/^(ii|iii|iv|vi|vii|viii|ix|xi|xii)$/.test(core));
    let fam;
    if (isRoman && isLetter) {
      // i, v, x (und ia, va, xa): Buchstabe, wenn der vorherige Geschwisterpunkt h, u bzw. w war
      const ctx = prevSeg && typeof prevSeg === 'object' ? prevSeg : { prevSeg };
      const prev = typeof ctx.prevSeg === 'string' ? ctx.prevSeg : '';
      const want = { i: 'h', v: 'u', x: 'w' }[core[0]];
      const nextRoman = { i: 'ii', v: 'vi', x: 'xi' }[core];
      if (ctx.look && nextRoman && ctx.look === nextRoman) fam = 'R';
      else if (prev && prev[0] === want && !ctx.colon) fam = 'A';
      else if (prev && prev[0] === want && ctx.colon) fam = 'R';
      else fam = 'R';
    } else fam = isRoman ? 'R' : 'A';
    return { fam, seg: core, l };
  }
  if (/^[A-Z]$/.test(core)) return { fam: 'U', seg: core.toLowerCase(), l };
  return null;
}

// Fuehrendes Gliederungszeichen aus einem Text abtrennen (fuer Absaetze und Aufzaehlungen ohne eigenes Label-Element)
const LEAD_RE = [
  /^(\(\s*\d+\s*[a-z]?\s*\))\s+/,                                         // (1) (2a)
  /^(\d+(?:\.\d+)*\s*(?:<i>)?\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies)?\s*(?:<\/i>)?\s*[a-z]?\s*\.)\s+/, // 1. 1.1. 2 bis.
  /^(\(\s*[a-z]{1,4}\s*\)|[a-z]{1,4}\s*(?:<i>)?\s*(?:bis|ter|quater|quinquies|sexies|septies)?\s*(?:<\/i>)?\s*\))\s+/,  // a) (a) iii) b bis)
  /^(\d+\s*\))\s+/,                                                        // 1)
  /^(\d+\s*(?:<i>)?\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies)\s*(?:<\/i>)?\s*\))\s+/, // 22 bis) (FR, zitierte Begriffsbestimmungen)
  /^([—–])\s+/,                                                            // Strich
];
const MONTH_AFTER = /^(Januar|Jänner|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\b/;
function splitLeadLabel(h) {
  for (const re of LEAD_RE) {
    const m = h.match(re);
    if (m) {
      const rest = h.slice(m[0].length);
      if (MONTH_AFTER.test(rest)) return null;
      return { label: htmlToText(m[1]), rest };
    }
  }
  return null;
}

// ------------------------------------------------------------------ Formaterkennung und Metadaten

function detectFormat(doc) {
  if (doc.querySelector('.oj-ti-art, .oj-doc-ti, .oj-normal')) return 'oj';
  if (doc.querySelector('.grid-container, .eli-subdivision')) return 'cons-new';
  return 'cons-old';
}

const MONTHS = null;
function dmy(s) {
  const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function readMeta(doc, fmt) {
  const meta = { celex: null, lang: null, date: null, workTitle: null };
  if (fmt === 'oj') {
    const lg = doc.querySelector('.oj-hd-lg');
    meta.lang = lg ? cleanSpace(lg.textContent).trim().toLowerCase() : null;
    const dt = doc.querySelector('.oj-hd-date');
    meta.date = dt ? dmy(dt.textContent) : null;
    const tis = Array.from(doc.querySelectorAll('.oj-doc-ti')).map((p) => cleanSpace(p.textContent).trim());
    const first = tis[0] || '';
    const m = first.match(/\((EU|EG|EWG|CE|UE|EC|EEC)\)\s*(?:Nr\.|n°|No)?\s*(\d{4})\/(\d+)/i) || first.match(/(\d{4})\/(\d+)/);
    // vor 2015: "(EG) Nr. 767/2008" = Nummer/Jahr
    const mo = !m && first.match(/\((?:EG|EWG|CE|CEE|EC|EEC|EU|UE)\)\s*(?:Nr\.|n\s*[°º]|n\s?o)\s*(\d+)\/(\d{4})/i); // FR 2008: "N<sup>o</sup>" als "N o"
    if (mo) {
      const type = /RICHTLINIE|DIRECTIVE/i.test(first) ? 'L' : /BESCHLUSS|DÉCISION|DECISION/i.test(first) ? 'D' : 'R';
      meta.celex = `3${mo[2]}${type}${mo[1].padStart(4, '0')}`;
    } else if (m) {
      const year = m.length === 4 ? m[2] : m[1];
      const num = m.length === 4 ? m[3] : m[2];
      const type = /RICHTLINIE|DIRECTIVE/i.test(first) ? 'L' : /BESCHLUSS|DÉCISION|DECISION/i.test(first) ? 'D' : 'R';
      meta.celex = `3${year}${type}${num.padStart(4, '0')}`;
    }
    meta.workTitle = tis.slice(0, 3).join(' ');
  } else {
    const ref = doc.querySelector('.reference');
    if (ref) {
      const t = cleanSpace(ref.textContent).trim();
      const m = t.match(/^0?(\d{4}[A-Z]\d{4})\s*—\s*([A-Z]{2})\s*—\s*(\d{2})\.(\d{2})\.(\d{4})/);
      if (m) {
        meta.celex = `0${m[1]}-${m[5]}${m[4]}${m[3]}`;
        meta.lang = m[2].toLowerCase();
        meta.date = `${m[5]}-${m[4]}-${m[3]}`;
      }
    }
    const tis = Array.from(doc.querySelectorAll('.title-doc-first')).map((p) => cleanSpace(p.textContent).replace(/[►◄]\s*C\d+/g, '').replace(/[►◄]/g, '').trim());
    meta.workTitle = tis.slice(0, 3).join(' ');
  }
  return meta;
}

function readModifiers(doc, fmt) {
  if (fmt === 'oj') return [];
  const mods = [];
  const seen = new Set();
  for (const p of doc.querySelectorAll('p.arrow')) {
    const a = p.querySelector('a');
    if (!a) continue;
    const txt = cleanSpace(a.textContent).trim();
    if (!txt.startsWith('►')) continue;
    const mk = readMarker(a);
    if (!mk.celex || seen.has(mk.celex)) continue;
    seen.add(mk.celex);
    const tr = p.closest('tr');
    let title = '';
    if (tr) {
      const tds = tr.querySelectorAll('td');
      if (tds[1]) title = cleanSpace(tds[1].textContent).trim();
    }
    mods.push({ marker: mk.label, celex: mk.celex, title });
  }
  return mods;
}

function collectFootnotes(doc, fmt) {
  const map = new Map();
  const sel = fmt === 'oj' ? 'p.oj-note' : 'p.footnote, .footnote';
  for (const p of doc.querySelectorAll(sel)) {
    const a = p.querySelector('a[id]');
    if (!a) continue;
    const id = a.getAttribute('id');
    const clone = p.cloneNode(true);
    const ca = clone.querySelector('a[id]');
    if (ca) ca.remove();
    const t = cleanSpace(clone.textContent).trim();
    map.set(id, t);
  }
  return map;
}

// ------------------------------------------------------------------ Rohbaum

// Rohknoten: { kind:'para'|'li'|'heading'|'table'|'img'|'del', label, html, origin, action, fns, cls, children:[] }
function mkNode(kind, ctx, extra = {}) {
  return {
    kind, label: null, html: '', origin: ctx.origin.celex, action: ctx.origin.action,
    fns: [], cls: null, children: [], ...extra,
  };
}

class Walker {
  constructor(doc, fmt, meta, footnotes) {
    this.doc = doc; this.fmt = fmt; this.meta = meta; this.footnotes = footnotes;
    this.origin = { celex: meta.baseCelex, action: null };
    this.units = []; this.toc = []; this.unit = null; this.divStack = [];
    this.pendingFinal = false;
    this.stopped = false;
    this.hasImages = false;
  }

  get rootSink() { return this.unit ? this.unit.raw : null; }

  sinkOf(sink) { return sink || this.rootSink; }

  push(sink, node) {
    const s = this.sinkOf(sink);
    if (!s) return false; // ausserhalb einer Einheit (z. B. Titelei)
    s.push(node);
    return true;
  }

  setMarker(a, sink) {
    const mk = readMarker(a);
    if (!mk.celex) return;
    this.origin = { celex: mk.celex, action: mk.action };
    if (mk.action === 'DELETED') {
      const n = mkNode('del', this);
      this.push(sink, n);
    }
  }

  // Divisionen (Titel, Kapitel, Abschnitt)
  startDivision(labelText, headingText, origin) {
    const m = labelText.match(LANG_WORDS.division);
    if (!m) return false;
    const type = divType(m[1]);
    const num = numSuffix(m[2], m[3]);
    const level = { title: 0, chapter: 1, section: 2 }[type];
    while (this.divStack.length && this.divStack[this.divStack.length - 1].level >= level) this.divStack.pop();
    const parent = this.divStack.length ? this.divStack[this.divStack.length - 1] : null;
    const id = (parent ? parent.id + '.' : '') + DIV_PREFIX[type] + '_' + num;
    this.divFailed = false;
    const entry = { id, type, parent: parent ? parent.id : null, num, label: labelText, text: headingText || '', level, origin };
    this.toc.push(entry);
    this.divStack.push(entry);
    this.lastDiv = entry;
    this.unit = null;
    return true;
  }

  startArticle(labelText) {
    const m = labelText.match(LANG_WORDS.article);
    if (!m) return false;
    const num = numSuffix(/^(premier|1er)$/i.test(m[2]) ? '1' : m[2], m[3]);
    this.startUnit({ id: 'art_' + num, type: 'article', num, label: labelText });
    return true;
  }

  startAnnex(labelText) {
    const m = labelText.match(LANG_WORDS.annex);
    if (!m) return false;
    const num = m[2] ? numSuffix(m[2], m[3]) : '';
    this.divStack = [];
    this.startUnit({ id: num ? 'anx_' + num : 'anx', type: 'annex', num, label: labelText });
    return true;
  }

  startUnit(u) {
    const parent = u.type === 'article' && this.divStack.length ? this.divStack[this.divStack.length - 1].id : null;
    this.unit = { ...u, parent, title: null, titleOrigin: null, labelOrigin: this.origin.celex, raw: [], deletions: [] };
    this.units.push(this.unit);
    this.lastDiv = null;
  }

  // ---------------- ABl.-Format
  walkOJ() {
    const enc = this.doc.querySelector('#enc_1') || this.doc.querySelector('.eli-subdivision[id^="enc"]');
    if (enc) this.ojBlock(enc, null);
    for (const anx of this.doc.querySelectorAll('.eli-container[id^="anx_"]')) {
      this.unit = null;
      this.ojBlock(anx, null);
    }
  }

  ojBlock(el, sink) {
    for (const c of elementChildren(el)) this.ojEl(c, sink);
  }

  ojEl(c, sink) {
    const t = tag(c);
    const id = c.getAttribute('id') || '';
    if (id.startsWith('fnp')) { this.unit = null; return; }
    if (t === 'hr') return;
    if (t === 'p') {
      if (hasClass(c, 'oj-note')) return;
      if (hasClass(c, 'oj-ti-section-1')) {
        const label = cleanSpace(c.textContent).trim();
        // Ueberschrift folgt in der naechsten eli-title
        const next = childByClass(c.parentNode, 'eli-title');
        const hp = next ? (childByClass(next, 'oj-ti-section-2') || next.querySelector('p')) : null;
        const heading = hp ? cleanSpace(hp.textContent).trim() : '';
        if (!this.startDivision(label, heading, this.origin.celex)) { this.heading(c, sink); this.divFailed = true; }
        return;
      }
      if (hasClass(c, 'oj-ti-section-2')) { if (this.divFailed) { this.heading(c, sink); this.divFailed = false; } return; } // sonst bereits verarbeitet
      // Zitierte Artikel in Aenderungsbestimmungen („Artikel 17a …): kein neuer Artikel, sondern Text des aendernden Artikels
      if (hasClass(c, 'oj-ti-art')) { if (sink || !this.startArticle(cleanSpace(c.textContent).trim())) this.heading(c, sink); return; }
      if (hasClass(c, 'oj-sti-art')) { if (this.unit && !this.unit.title && !sink) { this.setTitle(c); } else this.heading(c, sink); return; }
      if (hasClass(c, 'oj-doc-ti')) {
        if (this.startAnnex(cleanSpace(c.textContent).trim())) return;
        // ABl. 2008 (VIS): Anhangtitel als zweites oj-doc-ti
        if (this.unit && this.unit.type === 'annex' && !this.unit.title && !this.unit.raw.length && !sink) { this.setTitle(c); return; }
        this.heading(c, sink);
        return;
      }
      if (hasClass(c, 'oj-ti-grseq-1') || hasClass(c, 'oj-ti-tbl')) { this.heading(c, sink); return; }
      if (hasClass(c, 'oj-image')) { this.images(c, sink); return; }
      this.para(c, sink, null);
      return;
    }
    if (t === 'figure' || t === 'img') { this.images(c, sink); return; }
    if (t === 'a' && (id.startsWith('textofimagelink'))) return;
    if (t === 'div' && id.endsWith('.tif')) { this.imageText(c, sink); return; }
    if (t === 'table') {
      if (hasClass(c, 'oj-table')) { this.table(c, sink); return; }
      this.ojLayoutTable(c, sink);
      return;
    }
    if (t === 'span') { this.para(c, sink, null); return; }
    if (t === 'div') {
      if (hasClass(c, 'oj-enumeration-spacing')) {
        // ABl. 2008: <div class="oj-enumeration-spacing"><p style="display: inline;">1.</p><p style="display: inline;">Text</p></div>
        const ps = elementChildren(c);
        const label = ps.length > 1 ? cleanSpace(ps[0].textContent).trim() : '';
        if (label && label.length <= 14) {
          const li = mkNode('li', this, { label });
          if (this.push(sink, li)) for (const x of ps.slice(1)) { if (tag(x) === 'p') this.para(x, li.children, li._filled ? null : li); else this.ojEl(x, li.children); }
          return;
        }
        this.ojBlock(c, sink);
        return;
      }
      if (hasClass(c, 'eli-title')) {
        // Titel einer Division/Artikel: in oj-sti-art/oj-ti-section-2 behandelt; Artikeltitel innerhalb von eli-title
        for (const p of elementChildren(c)) this.ojEl(p, sink);
        return;
      }
      this.ojBlock(c, sink);
    }
  }

  ojLayoutTable(tbl, sink) {
    const rows = tableRows(tbl);
    for (const tr of rows) {
      const tds = Array.from(tr.children).filter((x) => tag(x) === 'td');
      if (tds.length < 2) { tds.forEach((td) => this.ojBlockMixed(td, sink)); continue; }
      const content = tds[tds.length - 1];
      let label = '';
      for (let i = tds.length - 2; i >= 0; i--) {
        const lt = cleanSpace(tds[i].textContent).trim();
        if (lt) { label = lt; break; }
      }
      // Fussnotenzeichen im Label entfernen
      const li = mkNode('li', this, { label: label || null });
      if (!this.push(sink, li)) continue;
      this.ojBlockMixed(content, li.children, li);
    }
  }

  // Inhalt einer Tabellenzelle: Absaetze, verschachtelte Tabellen, lose Inline-Inhalte
  ojBlockMixed(el, sink, owner) {
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const txt = run.map((n) => n.textContent).join('');
      if (cleanSpace(txt).trim()) this.paraNodes(run, sink, owner);
      run = [];
    };
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 3) { run.push(n); continue; }
      if (n.nodeType !== 1) continue;
      const t = tag(n);
      if (t === 'p' || t === 'table' || t === 'div' || t === 'figure' || t === 'img' || hasClass(n, 'oj-note')) {
        flush();
        if (t === 'p' && !hasClass(n, 'oj-ti-grseq-1') && !hasClass(n, 'oj-image') && !hasClass(n, 'oj-note')) {
          this.para(n, sink, owner && !owner._filled ? owner : null);
          continue;
        }
        this.ojEl(n, sink);
        continue;
      }
      run.push(n);
    }
    flush();
  }

  // ---------------- konsolidierte Formate (alt und neu)
  walkCons() {
    const body = this.doc.body;
    // Beginn: erste Division, erster Artikel oder erster Anhang (Titelei und Aenderungsliste werden nur nach Markern durchsucht)
    this.startEl = body.querySelector('p.title-division-1, p.title-article-norm, p.title-annex-1');
    this.started = false;
    this.consBlock(body, null);
  }

  consBlock(el, sink) {
    for (const c of elementChildren(el)) {
      if (this.stopped) return;
      this.consEl(c, sink);
    }
  }

  consEl(c, sink) {
    const t = tag(c);
    const id = c.getAttribute('id') || '';
    const cls = classList(c);
    if (t === 'p' && (hasClass(c, 'modref') || hasClass(c, 'arrow'))) {
      const a = c.querySelector('a');
      if (a && /^▼/.test(cleanSpace(a.textContent).trim())) this.setMarker(a, sink);
      return;
    }
    if (!this.started) {
      if (c === this.startEl) this.started = true;
      else if (this.startEl && c.contains && c.contains(this.startEl)) { this.consBlock(c, sink); return; }
      else {
        for (const p of c.querySelectorAll ? c.querySelectorAll('p.modref, p.arrow') : []) {
          const a = p.querySelector('a');
          if (a && /^▼/.test(cleanSpace(a.textContent).trim())) this.setMarker(a, sink);
        }
        return;
      }
    }
    if (id.startsWith('fnp')) { this.unit = null; return; }
    if (t === 'hr') return;
    if (t === 'div' && /\.tif$/i.test(id)) { this.imageText(c, sink); return; }
    if (t === 'a' && id.startsWith('textofimagelink')) return;
    if (t === 'p' && c.querySelector('a[id^="textofimagelink"]') && cleanSpace(c.textContent).trim().length < 40) return;
    if (t === 'p') {
      if (hasClass(c, 'footnote')) return;
      if (hasClass(c, 'title-division-1')) {
        const label = cleanSpace(c.textContent).trim();
        // Ueberschrift: naechstes p.title-division-2 (ggf. in eli-title)
        let heading = '';
        let headOrigin = this.origin.celex;
        let probe = c.nextElementSibling;
        for (let i = 0; probe && i < 4; i++, probe = probe.nextElementSibling) {
          if (hasClass(probe, 'modref')) { const a = probe.querySelector('a'); if (a) { const mk = readMarker(a); if (mk.celex) headOrigin = mk.celex; } continue; }
          const h2 = hasClass(probe, 'title-division-2') ? probe : (childByClass(probe, 'title-division-2', 'p') || (hasClass(probe, 'eli-title') ? probe.querySelector('p.title-division-2') : null));
          if (h2) { heading = cleanSpace(h2.textContent).trim(); break; }
          if (hasClass(probe, 'title-division-1') || hasClass(probe, 'title-article-norm')) break;
        }
        if (!this.startDivision(label, heading, headOrigin)) { this.para(c, sink, null); this.divFailed = true; }
        return;
      }
      if (hasClass(c, 'title-division-2')) { if (this.divFailed) { this.para(c, sink, null); this.divFailed = false; } return; }
      if (hasClass(c, 'title-article-norm')) {
        const txt = cleanSpace(c.textContent).trim();
        if (!this.startArticle(txt)) this.heading(c, sink);
        return;
      }
      if (hasClass(c, 'stitle-article-norm')) {
        if (this.unit && !this.unit.title) { this.setTitle(c); }
        else this.heading(c, sink);
        return;
      }
      if (hasClass(c, 'title-annex-1')) {
        const txt = cleanSpace(c.textContent).trim();
        if (!this.startAnnex(txt)) this.heading(c, sink);
        return;
      }
      if (cls.some((x) => /^title-(gr-seq|annex-2|table)/.test(x))) { this.heading(c, sink); return; }
      if (!cleanSpace(c.textContent).trim() && !c.querySelector('img')) return;
      if (this.isFinalFormula(c, sink)) return;
      this.para(c, sink, null);
      return;
    }
    if (t === 'img') { this.images(c, sink); return; }
    if (t === 'table') {
      if (this.isLayoutTable(c)) this.consLayoutTable(c, sink);
      else this.table(c, sink);
      return;
    }
    if (t === 'div') {
      if (hasClass(c, 'eli-title')) {
        const tp = elementChildren(c).find((x) => tag(x) === 'p');
        if (this.unit && !this.unit.title && tp && !hasClass(tp, 'title-division-2') && this.unit.raw.length === 0 && !sink) {
          this.setTitle(tp);
          for (const x of elementChildren(c)) if (x !== tp) this.consEl(x, sink);
          return;
        }
        this.consBlock(c, sink); return;
      }
      if (isInlineOnly(c) && !hasClass(c, 'grid-container') && !hasClass(c, 'grid-list-column-1')) { this.para(c, sink, null); return; }
      if (hasClass(c, 'grid-container')) { this.gridItem(c, sink); return; }
      const style = c.getAttribute('style') || '';
      if (/margin-left/.test(style)) { this.marginItem(c, sink); return; }
      if (hasClass(c, 'norm') && childByClass(c, 'no-parag', 'span')) { this.noParag(c, sink); return; }
      this.consBlock(c, sink);
      return;
    }
    if (t === 'span' && cleanSpace(c.textContent).trim()) { this.para(c, sink, null); return; }
  }

  isFinalFormula(p, sink) {
    if (sink) return false;
    if (!this.unit || this.unit.type !== 'article') return false;
    if (LANG_WORDS.final.test(p.textContent) && p.textContent.length < 200) { this.unit = null; return true; }
    return false;
  }

  isLayoutTable(tbl) {
    if (tbl.querySelector('p.tbl-norm, p.tbl-hdr, th')) return false;
    const rows = tableRows(tbl);
    if (rows.length !== 1) return false;
    const tds = Array.from(rows[0].children).filter((x) => tag(x) === 'td');
    if (tds.length < 2 || tds.length > 3) return false;
    const label = cleanSpace(tds[tds.length - 2].textContent).trim();
    return label.length <= 14;
  }

  consLayoutTable(tbl, sink) {
    const tr = tableRows(tbl)[0];
    const tds = Array.from(tr.children).filter((x) => tag(x) === 'td');
    const label = cleanSpace(tds[tds.length - 2].textContent).trim();
    const li = mkNode('li', this, { label: label || null });
    if (!this.push(sink, li)) return;
    this.consContent(tds[tds.length - 1], li);
  }

  // Inhalt eines Aufzaehlungselements: erstes Text-p wird Text des Elements, Rest Kinder
  consContent(el, li) {
    let run = [];
    const flush = () => {
      if (!run.length) return;
      if (cleanSpace(run.map((n) => n.textContent).join('')).trim()) this.paraNodes(run, li.children, li);
      run = [];
    };
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 3) { run.push(n); continue; }
      if (n.nodeType !== 1) continue;
      const t = tag(n);
      if ((t === 'div' && /\.tif$/i.test(n.getAttribute('id') || '')) || (t === 'p' && n.querySelector('a[id^="textofimagelink"]'))) { flush(); this.consEl(n, li.children); continue; }
      if ((t === 'p' || (t === 'div' && isInlineOnly(n) && !hasClass(n, 'grid-container'))) && !hasClass(n, 'modref') && !hasClass(n, 'arrow') && !/^title-/.test(n.getAttribute('class') || '')) {
        flush();
        if (!li._filled) this.para(n, li.children, li); else this.para(n, li.children, null);
        continue;
      }
      if (t === 'span' || t === 'a' || t === 'i' || t === 'b' || t === 'sup' || t === 'br') { run.push(n); continue; }
      flush();
      this.consEl(n, li.children);
    }
    flush();
  }

  gridItem(div, sink) {
    const c1 = childByClass(div, 'grid-list-column-1');
    const c2 = childByClass(div, 'grid-list-column-2');
    const label = c1 ? cleanSpace(c1.textContent).trim() : '';
    const li = mkNode('li', this, { label: label || null });
    if (!this.push(sink, li)) return;
    if (c2) this.consContent(c2, li);
  }

  marginItem(div, sink) {
    // Altes Format: <div style="margin-left…"><p class="norm">a)<span style="word-spacing…"> </span>Text</p> … </div>
    const first = elementChildren(div).find((x) => tag(x) === 'p' && !hasClass(x, 'modref'));
    let label = null;
    if (first) {
      const sp = Array.from(first.childNodes).find((n) => n.nodeType === 1 && tag(n) === 'span' && /word-spacing/.test(n.getAttribute('style') || ''));
      if (sp) {
        const before = [];
        for (const n of Array.from(first.childNodes)) { if (n === sp) break; before.push(n); }
        label = cleanSpace(before.map((n) => n.textContent).join('')).trim();
        first._labelSplit = sp;
      }
    }
    if (label === null || label === '') {
      // Kein Label-Trennzeichen: als transparenter Container behandeln
      this.consBlock(div, sink);
      return;
    }
    const li = mkNode('li', this, { label: label || null });
    if (!this.push(sink, li)) return;
    this.consContent(div, li);
  }

  noParag(div, sink) {
    // Neues Format: <div class="norm"><span class="no-parag">(1)</span><div class="norm inline-element">…</div></div>
    const sp = childByClass(div, 'no-parag', 'span');
    const label = cleanSpace(sp.textContent).trim();
    const inl = childByClass(div, 'inline-element') || div;
    const node = mkNode('li', this, { label, inlineLabel: true });
    if (!this.push(sink, node)) return;
    node.paraLabel = true;
    this.consContent(inl, node);
  }

  // Titel der aktuellen Einheit; Herkunft aus einem Inline-Marker im Titel ("►M1 Titel ◄"), sonst aktueller Marker
  setTitle(el) {
    const r = this.inline(el);
    this.unit.title = r.html;
    this.unit.titleOrigin = r.inlineMarkers.length ? r.inlineMarkers[0].celex : this.origin.celex;
  }

  // ---------------- gemeinsame Bausteine
  inline(el, opts) {
    const out = { fns: [], imgs: [], inlineMarkers: [] };
    const html = inlineHtml(el, this, out, opts);
    return { html, ...out };
  }

  // Absatz aus einem Element
  para(el, sink, owner) {
    const opts = {};
    if (el._labelSplit) {
      // Label im alten Format abtrennen
      const sp = el._labelSplit;
      let seen = false;
      const nodes = [];
      for (const n of Array.from(el.childNodes)) { if (seen) nodes.push(n); if (n === sp) seen = true; }
      opts.nodes = nodes;
    }
    const r = this.inline(el, opts);
    this.emitPara(r, sink, owner, el);
  }

  paraNodes(nodes, sink, owner) {
    const r = this.inline(null, { nodes });
    this.emitPara(r, sink, owner, null);
  }

  emitPara(r, sink, owner, el) {
    if (r.imgs.length) { r.imgs.forEach((img) => this.images(img, sink)); }
    for (const mk of r.inlineMarkers) {
      // Inline-Marker: Herkunft des Blocks ist die Berichtigung bzw. der Aenderungsakt
      r.inlineOrigin = mk.celex;
    }
    let html = r.html;
    if ((!html || !htmlToText(html)) && r.inlineMarkers.length) {
      // Absatz besteht nur aus einem Inline-Marker (z. B. "►(1)(2) M3" nach einem Formularbild):
      // Herkunft auf das unmittelbar vorangehende Bild uebertragen
      const s = this.sinkOf(sink);
      const last = s && s[s.length - 1];
      if (last && last.kind === 'img') { last.origin = r.inlineMarkers[0].celex; last.action = r.inlineMarkers[0].action; last.orphanMarker = true; }
      return;
    }
    if (!html || !htmlToText(html)) {
      // leere Absaetze ignorieren (Fussnotenreste wie "(1)" unter Bildern bleiben als Text erhalten)
      return;
    }
    if (owner && !owner._filled) {
      owner.html = html; owner.fns = r.fns; owner._filled = true;
      if (r.inlineOrigin) { owner.origin = r.inlineOrigin; owner.inlineOrigin = r.inlineOrigin; }
      return;
    }
    const n = mkNode('para', this, { html, fns: r.fns, cls: el ? (hasClass(el, 'list') ? 'list' : 'norm') : 'norm' });
    if (el) {
      let prev = el.previousElementSibling;
      while (prev && tag(prev) === 'p' && (hasClass(prev, 'modref') || !cleanSpace(prev.textContent).trim())) prev = prev.previousElementSibling;
      if (prev && hasClass(prev, 'grid-container')) n.afterGrid = true;
    }
    if (r.inlineOrigin) { n.origin = r.inlineOrigin; n.inlineOrigin = r.inlineOrigin; }
    this.push(sink, n);
  }

  heading(el, sink) {
    const r = this.inline(el);
    if (!r.html) return;
    const n = mkNode('heading', this, { html: r.html, fns: r.fns });
    this.push(sink, n);
  }

  images(el, sink) {
    const imgs = tag(el) === 'img' ? [el] : Array.from(el.querySelectorAll('img'));
    for (const img of imgs) {
      const src = img.getAttribute('src') || '';
      const m = src.match(/^data:(image\/[a-z+]+);base64,(.*)$/s);
      const n = mkNode('img', this, { html: '' });
      if (m) { n.img = { mime: m[1] === 'image/jpg' ? 'image/jpeg' : m[1], data: m[2].replace(/\s+/g, '') }; this.hasImages = true; }
      else n.img = { src };
      n.alt = cleanSpace(img.getAttribute('alt') || '').trim();
      if (/^(image|bild|img)(\s*\d+)?$/i.test(n.alt)) n.alt = '';
      this.push(sink, n);
    }
  }

  // ABl.: verborgener "Text von Bild" zum vorangehenden Bild
  imageText(div, sink) {
    const s = this.sinkOf(sink);
    if (!s || !s.length) return;
    const last = s[s.length - 1];
    if (last.kind !== 'img') return;
    const lines = Array.from(div.querySelectorAll('p')).map((p) => this.inline(p).html).filter(Boolean);
    last.imgText = lines.join('<br>');
  }

  table(tbl, sink) {
    const n = mkNode('table', this);
    n.html = cleanTable(tbl, this);
    n.text = cleanSpace(Array.from(tbl.querySelectorAll('td, th')).map((td) => htmlToText(this.inline(td).html)).join(' ')).trim();
    n.fns = [];
    this.push(sink, n);
  }
}

function cleanTable(tbl, w) {
  const out = [];
  const allowed = new Set(['table', 'thead', 'tbody', 'tr', 'th', 'td']);
  const visit = (el) => {
    const t = tag(el);
    if (allowed.has(t)) {
      let attrs = '';
      for (const a of ['colspan', 'rowspan']) {
        const v = el.getAttribute(a);
        if (v && /^\d+$/.test(v) && v !== '1') attrs += ` ${a}="${v}"`;
      }
      out.push(`<${t}${attrs}>`);
      if (t === 'td' || t === 'th') {
        const ps = elementChildren(el).filter((x) => tag(x) === 'p');
        if (ps.length) out.push(ps.map((p) => '<p>' + w.inline(p).html + '</p>').join(''));
        else out.push(w.inline(el).html);
      } else elementChildren(el).forEach(visit);
      out.push(`</${t}>`);
      return;
    }
    if (t === 'col' || t === 'colgroup') return;
    elementChildren(el).forEach(visit);
  };
  visit(tbl);
  return out.join('');
}

// ------------------------------------------------------------------ Normalisierung des Rohbaums und Schluessel

// Absatznummern: DE "(1)", FR/EN "1." — Aufzaehlungsziffern: DE "1.", FR "1)", EN "(1)"
function isParaStyle(label, lang) {
  const l = cleanSpace(label || '').trim();
  if (lang === 'de') return /^\(\s*\d/.test(l);
  return /^\d+[^)]*\.$/.test(l) && !/^\(/.test(l);
}

const FAM_RANK_ART = { P: 1, N: 3, A: 3, L: 3, R: 4, D: 5, X: 6 };
const FAM_RANK_ANX = { A: 10, L: 9, R: 11, D: 12, X: 13 };

function famOf(node, inAnnex, atRoot, prevSeg, lang) {
  const R = inAnnex ? FAM_RANK_ANX : FAM_RANK_ART;
  if (node.kind === 'heading') {
    const txt = htmlToText(node.html);
    const pm = txt.match(LANG_WORDS.part);
    if (pm) return { fam: 'H', part: pm[2], rank: 0 };
    const lead = splitLeadLabel(node.html);
    if (lead) {
      const c = classifyLabel(lead.label);
      if (c && c.fam === 'N') return { fam: 'N', comps: c.comps, rank: 1 + c.comps.length, seg: c.seg, label: lead.label, headNum: true, rest: lead.rest };
    }
    return { fam: 'h', rank: 99 };
  }
  if (node.kind !== 'li' && node.kind !== 'para') return { fam: node.kind, rank: 99 };
  const label = node.label;
  if (node.kind === 'para' && !label) return { fam: 'U', rank: 99 };
  const c = classifyLabel(label || '', prevSeg);
  if (!c) return { fam: 'X', rank: R.X, seg: null };
  let fam = c.fam;
  if (fam === 'N') {
    if (!inAnnex && atRoot && node.paraLabel && isParaStyle(label, lang)) return { fam: 'P', rank: 1, seg: 'p' + c.comps.join('') };
    return { fam: 'N', comps: c.comps, rank: inAnnex ? 1 + c.comps.length : R.N, seg: c.seg };
  }
  if (fam === 'D') return { fam: 'D', rank: R.D, seg: null };
  if (fam === 'U') return { fam: 'L', rank: R.L, seg: c.seg }; // Grossbuchstabe
  return { fam, rank: R[fam] || R.X, seg: c.seg };
}

// Absatznummern, die im Text stehen ("(1)   Text"), als Label abtrennen
function liftParaLabels(nodes, inAnnex, depth) {
  for (const n of nodes) {
    if (n.kind === 'para' && !n.label) {
      const lead = splitLeadLabel(n.html);
      if (lead) {
        const c = classifyLabel(lead.label);
        const ok = c && (depth === 0 ? (c.fam === 'N' || c.fam === 'A' || c.fam === 'R' || c.fam === 'D') : (c.fam === 'A' || c.fam === 'R' || c.fam === 'D' || c.fam === 'N'));
        if (ok && (depth === 0 || n.cls !== 'list')) {
          n.label = lead.label; n.html = lead.rest; n.inlineLabel = true;
          if (depth === 0 && !inAnnex && c.fam === 'N') n.paraLabel = true;
          n.kind = 'li';
        }
      }
    }
    if (n.kind === 'li' && n.inlineLabel && depth === 0 && !inAnnex) {
      const c = classifyLabel(n.label || '');
      if (c && c.fam === 'N') n.paraLabel = true;
    }
    if (n.children.length) liftParaLabels(n.children, inAnnex, depth + 1);
  }
}

// Flache Geschwisterfolgen verschachteln.
// Konsolidierte Fassungen (v. a. 2017) stellen Aufzaehlungen und Fortsetzungsabsaetze oft als flache Geschwister dar,
// die ABl.-Fassung verschachtelt sie. Ziel: identischer Baum fuer alle Formate.
function nestSiblings(nodes, inAnnex, atRoot, lang, ownerFam = null) {
  const out = [];
  const stack = []; // {node, fam, parent(stack-index) }
  let prevSeg = null;
  const isListFam = (f) => ['A', 'R', 'D', 'L', 'X'].includes(f.fam) || (f.fam === 'N' && !inAnnex);
  const isOwner = (f) => f.fam === 'P' || f.fam === 'H' || (inAnnex && f.fam === 'N');
  const attachTo = (entry, n) => { if (entry) entry.node.children.push(n); else out.push(n); };
  const top = () => stack[stack.length - 1];
  for (let idx = 0; idx < nodes.length; idx++) {
    const n = nodes[idx];
    // Vorausschau fuer i)/v)/x): roemisch, wenn das naechste Listenelement ii)/vi)/xi) ist oder der Vorgaenger mit ":" endet
    let look = null;
    for (let j = idx + 1; j < nodes.length; j++) { if (nodes[j].label) { look = normCore(nodes[j].label); break; } }
    const prevNode = idx > 0 ? nodes[idx - 1] : null;
    const colon = prevNode ? /:\s*(<[^>]+>\s*)*$/.test(prevNode.html || '') : false;
    const f = famOf(n, inAnnex, atRoot, { prevSeg, look, colon }, lang);
    // Mehrdeutige Zeichen i, v, x: anhand offener Listen entscheiden
    if ((f.fam === 'A' || f.fam === 'R') && ['i', 'v', 'x'].includes(f.seg) && stack.length) {
      const letterPrev = { i: 'h', v: 'u', x: 'w' }[f.seg];
      const romanPrev = { i: null, v: 'iv', x: 'ix' }[f.seg];
      const openA = stack.findIndex((e) => e.f.fam === 'A' && e.f.seg === letterPrev);
      const lastR = [...stack].reverse().find((e) => e.f.fam === 'R');
      const t = stack[stack.length - 1];
      if (romanPrev && lastR && lastR.f.seg === romanPrev) f.fam = 'R';
      else if (openA >= 0 && t !== stack[openA]) f.fam = 'A';
      else if (openA >= 0 && t === stack[openA]) {
        const hasRoman = t.node.children.some((c) => (c._fam && c._fam.fam === 'R') || (c.label && /^(i|ii|iii|iv)$/.test(normCore(c.label))));
        f.fam = hasRoman ? 'A' : ((look === { i: 'ii', v: 'vi', x: 'xi' }[f.seg] || colon) ? 'R' : 'A');
      }
      f.rank = (inAnnex ? FAM_RANK_ANX : FAM_RANK_ART)[f.fam];
    }
    // Eingefuegte Punkte "ia", "iiia", "ba": Familie des Basispunkts (i als Buchstabe -> ia Buchstabe)
    if ((f.fam === 'A' || f.fam === 'R') && f.seg && f.seg.length >= 2 && stack.length) {
      const sib = [...stack].reverse().find((x) => (x.f.fam === 'A' || x.f.fam === 'R') && x.f.seg && x.f.seg.length === f.seg.length && x.f.seg.slice(0, -1) === f.seg.slice(0, -1) && x.f.seg < f.seg);
      if (sib) { f.fam = sib.f.fam; f.rank = (inAnnex ? FAM_RANK_ANX : FAM_RANK_ART)[f.fam]; }
      else for (let cut = f.seg.length - 1; cut >= 1; cut--) {
        const base = f.seg.slice(0, cut);
        const e = [...stack].reverse().find((x) => (x.f.fam === 'A' || x.f.fam === 'R') && x.f.seg === base);
        if (e) { f.fam = e.f.fam; f.rank = (inAnnex ? FAM_RANK_ANX : FAM_RANK_ART)[f.fam]; break; }
      }
    }
    n._fam = f;
    if (n.kind === 'quote') { out.push(n); continue; }
    if (f.fam === 'A' || f.fam === 'R') prevSeg = f.seg;
    if (f.fam === 'H') {
      // Unterteil "Teil D1" unter "Teil D", sofern vorhanden
      const sub = String(f.part).match(/^([A-Z])(\d+)$/);
      const parentPart = sub ? stack.find((e) => e.f.fam === 'H' && e.f.part === sub[1]) : null;
      if (parentPart) {
        stack.length = stack.indexOf(parentPart) + 1;
        parentPart.node.children.push(n); stack.push({ node: n, f }); continue;
      }
      stack.length = 0; out.push(n); stack.push({ node: n, f }); continue;
    }
    if (f.fam === 'P') {
      while (stack.length && top().f.fam !== 'H') stack.pop();
      attachTo(top(), n); stack.push({ node: n, f }); continue;
    }
    if (f.fam === 'N' && inAnnex) {
      while (stack.length) {
        const tf = top().f;
        if (tf.fam === 'H') break;
        if (tf.fam === 'N' && tf.comps && f.comps && tf.comps.length < f.comps.length && f.comps.slice(0, tf.comps.length).join('.') === tf.comps.join('.')) break;
        stack.pop();
      }
      attachTo(top(), n); stack.push({ node: n, f }); continue;
    }
    if (isListFam(f)) {
      let i = stack.length - 1;
      while (i >= 0 && !(stack[i].f.fam === f.fam && (f.fam !== 'N' || (stack[i].f.comps || []).length === (f.comps || []).length))) {
        if (isOwner(stack[i].f)) { i = -1; break; }
        i--;
      }
      if (i >= 0) { stack.length = i; }
      attachTo(top(), n); stack.push({ node: n, f }); continue;
    }
    // Unnummerierte Absaetze, Ueberschriften, Tabellen, Bilder, Loeschmarken
    if (n.kind === 'del') {
      // Loeschmarke bleibt an der aktuellen Stelle (Geschwister des obersten Elements)
      attachTo(stack.length > 1 ? stack[stack.length - 2] : (stack.length && !isListFam(top().f) ? top() : null), n);
      continue;
    }
    if (n.kind === 'para' && n.cls === 'list' && stack.length && isListFam(top().f)) {
      if (n.afterGrid) {
        // neues Format: loser Fortsetzungsabsatz nach Gitterliste gehoert zum Eigentuemer der Liste
        while (stack.length && isListFam(top().f)) stack.pop();
        attachTo(top(), n);
        continue;
      }
      // Fortsetzungsabsatz: gehoert zum obersten Element, ausser dieses ist Blatt einer Unterliste
      const t = top();
      const parentListish = stack.length > 1 ? isListFam(stack[stack.length - 2].f) : ownerFam !== null;
      if (parentListish && !t.node.children.length) { stack.pop(); attachTo(top(), n); }
      else attachTo(t, n);
      continue;
    }
    // normaler Absatz: an den naechsten Eigentuemer (Absatz, Teil, Anhangpunkt) oder an die Wurzel
    while (stack.length && !isOwner(top().f)) stack.pop();
    attachTo(top(), n);
    // Unterabsatz, dem eine Aufzaehlung folgt, deren Zeichen im Eigentuemer schon vergeben sind
    // (z. B. Art. 65 Abs. 3 ETIAS: zweite und dritte Liste a), b), c) nach Unterabsatz 4 bzw. 5): die Liste gehoert zum Unterabsatz.
    if (n.kind === 'para' && f.fam === 'U') {
      const nx = nodes[idx + 1];
      const ownerEntry = top();
      const ownerNode = ownerEntry ? ownerEntry.node : null;
      const sibs = ownerNode ? ownerNode.children : out;
      const nl = nx && nx.label ? normCore(nx.label) : null;
      const taken = nl && sibs.some((c) => c !== n && c.label && normCore(c.label) === nl);
      const takenFlat = nl && nodes.slice(0, idx).some((c) => c.label && normCore(c.label) === nl);
      if (nl && (taken || (!ownerNode && takenFlat))) stack.push({ node: n, f: { fam: 'S', rank: 98 } });
    }
  }
  const nestRec = (n) => {
    if (n.children.length) {
      n.children = nestSiblings(n.children, inAnnex, false, lang, n._fam ? n._fam.fam : 'U');
    }
  };
  for (const n of out) nestRec(n);
  return out;
}

function normCore(label) {
  let core = cleanSpace(label).trim().replace(/^\(\s*/, '').replace(/\s*\)\s*\.?$/, '').replace(/\s*\.$/, '').trim();
  return core;
}

// Konsolidierte Fassungen schliessen Listencontainer nach Loeschungen teils falsch: Ein Buchstabe "i)" nach "h)"
// steht dann innerhalb des Containers von h). Solche Elemente (und alle folgenden Geschwister) eine Ebene hoeher setzen.
const NEXT_LETTER = (x) => (x.length === 1 ? String.fromCharCode(x.charCodeAt(0) + 1) : null);
function liftMisplaced(nodes) {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.children.length) liftMisplaced(n.children);
    const core = n.label ? normCore(n.label) : '';
    if (!/^[a-z]$/.test(core)) continue;
    const nxt = NEXT_LETTER(core);
    if (!['i', 'v', 'x'].includes(nxt)) continue;
    const romanBefore = { i: 'ii', v: 'iv', x: 'ix' }[nxt];
    let sawRoman = false;
    for (let j = 0; j < n.children.length; j++) {
      const c = n.children[j];
      const cc = c.label ? normCore(c.label) : '';
      if (cc && ROMAN_RE.test(cc) && cc !== nxt) sawRoman = sawRoman || cc === romanBefore || cc.length >= 2;
      if (cc === nxt && sawRoman && !(nxt === 'v' && n.children.slice(0, j).some((x) => x.label && normCore(x.label) === 'iv'))) {
        const moved = n.children.splice(j);
        nodes.splice(i + 1, 0, ...moved);
        break;
      }
    }
  }
}

// ------------------------------------------------------------------ Zitierte Neufassungen in Aenderungsbestimmungen
// Aendernde Artikel (z. B. Art. 61 EES-VO: "Artikel 15 wird wie folgt geaendert: a) … erhaelt folgende Fassung: „(2) …“")
// enthalten zitierten Wortlaut eines anderen Rechtsakts. Seine Gliederungszeichen gehoeren nicht zur Gliederung dieses Akts,
// und die EUR-Lex-Formate stellen ihn verschieden verschachtelt dar. Ein zitierter Bereich beginnt mit einem Block, dessen
// Gliederungszeichen oder Text mit einem oeffnenden Anfuehrungszeichen beginnt, direkt nach einer Anweisung (Text endet mit ":"),
// und endet mit dem Block, dessen letzter Text mit einem schliessenden Anfuehrungszeichen endet. Der Bereich wird flach als
// Folge von Bloecken q1, q2, … unter der Anweisung gefuehrt (Schluessel positionsstabil, Gliederungszeichen bleiben sichtbar).
const Q_OPEN = /^\s*[„“«‘‚"]/;
// Anfuehrungszeichen je Sprache (DE „…“ ‚…‘; FR «…» “…”; EN ‘…’ “…”). Apostrophe (FR ’, EN ’ vor Buchstaben) zaehlen nicht.
const Q_SETS = {
  de: { open: /[„‚]/g, close: /[“‘]/g, end: /[“‘"]\s*[.;,]?\s*$/ },
  fr: { open: /[«“]/g, close: /[»”]/g, end: /[»”"]\s*[.;,]?\s*$/ },
  en: { open: /[‘“]/g, close: /’(?!\p{L})|”/gu, end: /[’”"]\s*[.;,]?\s*$/ },
  xx: { open: /[„‚«‘“]/g, close: /[“”»’]/g, end: /[“”»’‘"]\s*[.;,]?\s*$/ },
};
function nodeText(n) { return n.kind === 'table' ? (n.text || '') : htmlToText(n.html || ''); }
function allText(n) { return [n.kind === 'del' ? '' : nodeText(n), ...n.children.map(allText)].join(' '); }
function lastText(n) {
  for (let i = n.children.length - 1; i >= 0; i--) { const t = lastText(n.children[i]); if (t) return t; }
  return n.kind === 'del' ? '' : nodeText(n);
}
function opensQuote(n) {
  if (n.kind === 'del' || n.kind === 'img') return false;
  const l = cleanSpace(n.label || '').trim();
  if (l) return Q_OPEN.test(l);
  return Q_OPEN.test(nodeText(n));
}
// Aenderungsanweisung: endet mit ":" und enthaelt ein Anweisungswort (sonst z. B. "… hat Folgendes anzuzeigen:" mit einem
// von EUR-Lex stehen gelassenen Anfuehrungszeichen im folgenden Punkt, Art. 47 Abs. 2 ETIAS FR 2021)
const INSTR_WORD = /(Fassung|eingefügt|angefügt|hinzugefügt|ersetzt|gestrichen|geändert|remplac|insér|ajouté|modifié|libellé|suivante?s?\s*:|replaced|inserted|added|amended|worded|following\s*:|following (?:point|paragraph|subparagraph|article|sentence|definition|chapter|section|annex|text|indent|title|heading|words)s?)/i;
function isInstruction(n) { if (!n || n.kind === 'del') return false; const t = nodeText(n); return /:\s*$/.test(t) && INSTR_WORD.test(t); }
function flattenQuoted(nodes, acc) {
  for (const n of nodes) {
    if (n.kind === 'quote') { acc.push(...n.items); continue; }
    const it = { ...n, children: [] };
    if (it.kind === 'heading') it.kind = 'para';
    if ((it.kind === 'para' || it.kind === 'li') && !cleanSpace(it.label || '').trim()) {
      // „(3) Text  ->  Label „(3), Text
      const m = (it.html || '').match(/^(\s*[„“«‘‚"]\s*)(.*)$/s);
      if (m) {
        const lead = splitLeadLabel(m[2]);
        if (lead) { it.label = m[1].trim() + lead.label; it.html = lead.rest; }
      } else {
        // "(2b) Text" ohne eigenes Label-Element: die Formate trennen das Zeichen verschieden ab, daher immer abtrennen
        const lead = splitLeadLabel(it.html || '');
        if (lead && htmlToText(lead.rest)) { it.label = lead.label; it.html = lead.rest; }
      }
    }
    acc.push(it);
    if (n.children.length) flattenQuoted(n.children, acc);
  }
  return acc;
}
// Naechstes Gliederungszeichen derselben Art: "1." -> "2.", "b)" -> "c)", "(3)" -> "(4)", "ii)" -> "iii)"
const ROMANS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx'];
function nextLabel(label) {
  const l = cleanSpace(label || '').trim();
  const m = l.match(/^(\(?)([0-9]+|[a-z]{1,4})([).]?)$/i);
  if (!m) return null;
  const [, pre, core, post] = m;
  let nx = null;
  if (/^\d+$/.test(core)) nx = String(+core + 1);
  else if (ROMANS.includes(core.toLowerCase()) && core.length > 1) nx = ROMANS[ROMANS.indexOf(core.toLowerCase()) + 1] || null;
  else if (core.length === 1) nx = String.fromCharCode(core.charCodeAt(0) + 1);
  return nx ? pre + nx + post : null;
}
// Eindeutige Aenderungsanweisung (fuer das Abschliessen eines nicht geschlossenen Zitats)
const STRONG_INSTR = /((wird|werden)\b.{0,200}\b(gestrichen|eingefügt|angefügt|ersetzt|geändert|hinzugefügt|aufgehoben)|(erhält|erhalten)\b.{0,200}\bFassung|\b(est|sont)\s+(ainsi\s+)?(modifiée?s?|remplacée?s?|insérée?s?|ajoutée?s?|supprimée?s?|abrogée?s?)(?!\p{L})|\b(is|are)\s+(hereby\s+)?(amended|replaced|inserted|added|deleted|repealed)\b)/iu;
function markQuotes(nodes, ownerIsInstruction, stats, lang) {
  const QS = Q_SETS[lang] || Q_SETS.xx;
  const count = (t, re) => (t.match(re) || []).length;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const prev = i > 0 ? nodes[i - 1] : null;
    const instr = prev ? isInstruction(prev) : ownerIsInstruction;
    if (instr && opensQuote(n)) {
      // Ende: Block, dessen letzter Text mit einem schliessenden Zeichen endet und nach dem alle Anfuehrungszeichen des Bereichs geschlossen sind
      // Fehlt das schliessende Zeichen (konsolidierte Fassungen nach Berichtigungen oder Fussnoten), endet der Bereich vor der naechsten
      // Aenderungsanweisung, deren Gliederungszeichen auf ein Gliederungszeichen vor dem Bereich folgt (z. B. "2." nach "1.", "c)" nach "b)").
      const succ = new Set();
      const seenShape = new Set();
      for (let k = i - 1; k >= 0; k--) {
        const lb = cleanSpace(nodes[k].label || '').trim();
        if (!lb || Q_OPEN.test(lb)) continue;
        const shape = lb.replace(/[0-9]+/g, '9').replace(/[a-z]+/gi, 'a');
        if (seenShape.has(shape)) continue;
        seenShape.add(shape);
        const nx = nextLabel(lb);
        if (nx) succ.add(nx);
      }
      let j = i, bal = 0, cut = false;
      for (; j < nodes.length; j++) {
        if (j > i && succ.size) {
          const lj = cleanSpace(nodes[j].label || '').trim();
          if (lj && succ.has(lj) && !opensQuote(nodes[j]) && STRONG_INSTR.test(nodeText(nodes[j]))) { j--; cut = true; break; }
        }
        const full = (cleanSpace(nodes[j].label || '').trim() + ' ' + allText(nodes[j]));
        bal += count(full, QS.open) - count(full, QS.close);
        if (QS.end.test(lastText(nodes[j])) && bal <= 0) break;
      }
      if (cut) stats.cut = (stats.cut || 0) + 1;
      else if (j >= nodes.length) { j = nodes.length - 1; stats.unclosed++; }
      const region = nodes.slice(i, j + 1);
      const q = { kind: 'quote', items: flattenQuoted(region, []), origin: n.origin, action: n.action, fns: [], children: [], label: null, html: '' };
      stats.regions++;
      if (prev) { nodes.splice(i, j - i + 1); prev.children.push(q); i--; }
      else { nodes.splice(i, j - i + 1, q); }
      continue;
    }
    if (n.kind !== 'quote' && n.children.length) markQuotes(n.children, isInstruction(n), stats, lang);
  }
}

// Schluessel vergeben
function assignKeys(nodes, parentKey, depth, parentIsText, blocks, unit, ctxFamPrev) {
  let sIdx = parentIsText ? 1 : 0;
  let dIdx = 0, hIdx = 0, tIdx = 0, gIdx = 0, xIdx = 0, qIdx = 0;
  const used = new Set();
  let lastKey = null;
  const join = (seg) => (parentKey ? parentKey + '.' + seg : seg);
  for (const n of nodes) {
    const f = n._fam || { fam: 'U' };
    let seg;
    let ty;
    let l = '';
    if (n.kind === 'del') {
      unit.deletions.push({ after: lastKey, act: n.origin, parent: parentKey, at: blocks.length });
      continue;
    }
    if (n.kind === 'quote') {
      for (const it of n.items) {
        if (it.kind === 'del') { unit.deletions.push({ after: lastKey, act: it.origin, parent: parentKey, at: blocks.length }); continue; }
        const key = join('q' + (++qIdx));
        used.add(key); lastKey = key;
        const b = { k: key, d: depth, l: cleanSpace(it.label || '').trim(), t: '', o: it.origin };
        if (it.kind === 'table') { b.ty = 'table'; b.html = it.html; b.t = escapeHtml(it.text); }
        else if (it.kind === 'img') { b.ty = 'img'; b.img = it.img; b.t = it.imgText || escapeHtml(it.alt || ''); }
        else b.t = it.html;
        if (it.fns && it.fns.length) b.fn = it.fns;
        if (it.action) b.act = it.action;
        if (it.inlineOrigin) b.inl = it.inlineOrigin;
        b.q = 1;
        blocks.push(b);
      }
      continue;
    }
    if (n.kind === 'heading') {
      ty = 'heading';
      if (f.fam === 'H') seg = 'pt' + f.part;
      else if (f.fam === 'N' && f.headNum) { seg = f.seg; l = f.label; }
      else seg = 'h' + (++hIdx);
    } else if (n.kind === 'table') { ty = 'table'; seg = 't' + (++tIdx); }
    else if (n.kind === 'img') { ty = 'img'; seg = 'g' + (++gIdx); }
    else if (f.fam === 'U') seg = 's' + (++sIdx);
    else if (f.fam === 'D') { seg = 'd' + (++dIdx); l = n.label; }
    else if (f.seg) { seg = f.seg; l = n.label; }
    else { seg = 'x' + (++xIdx); l = n.label || ''; }
    if (f.fam === 'N' && parentKey && f.comps && f.comps.length > 1) {
      // Anhang: "1.1.2." unter "1.1." -> nur letzte Komponente anhaengen, wenn Elternteil Praefix ist
      const pk = parentKey.split('.').filter((x) => /^n\d/.test(x));
      if (pk.length) seg = 'n' + f.comps[f.comps.length - 1];
    }
    let key = join(seg);
    if (used.has(key)) { let i = 2; while (used.has(key + '~' + i)) i++; key = key + '~' + i; unit.collisions = (unit.collisions || 0) + 1; }
    used.add(key);
    lastKey = key;
    const b = { k: key, d: depth, l: l || '', t: '', o: n.origin };
    if (n.kind === 'table') { b.ty = 'table'; b.html = n.html; b.t = escapeHtml(n.text); }
    else if (n.kind === 'img') { b.ty = 'img'; b.img = n.img; b.t = n.imgText || escapeHtml(n.alt || ''); }
    else {
      if (ty) b.ty = ty;
      b.t = (f.fam === 'N' && f.headNum) ? tidyInline(f.rest) : n.html;
    }
    if (n.fns && n.fns.length) b.fn = n.fns;
    if (n.action) b.act = n.action;
    if (n.inlineOrigin) b.inl = n.inlineOrigin;
    blocks.push(b);
    if (n.children.length) {
      const isText = n.kind === 'li' || n.kind === 'para' || (n.kind === 'heading' && false);
      assignKeys(n.children, key, depth + 1, isText, blocks, unit);
    }
  }
}

// Bereinigt einen Rohbaum zu Bloecken
function finishUnit(u, lang) {
  const inAnnex = u.type === 'annex';
  // Anhangtitel: erste unnummerierte Ueberschrift vor jedem anderen Inhalt
  if (inAnnex && !u.title) {
    const first = u.raw.find((n) => n.kind !== 'del');
    if (first && first.kind === 'heading') {
      const txt = htmlToText(first.html);
      if (!LANG_WORDS.part.test(txt) && !splitLeadLabel(first.html)) {
        u.title = first.html; u.titleOrigin = first.origin;
        u.raw.splice(u.raw.indexOf(first), 1);
      }
    }
  }
  const qs = { regions: 0, unclosed: 0 };
  markQuotes(u.raw, false, qs, lang);
  if (qs.regions) u.quotes = qs;
  liftParaLabels(u.raw, inAnnex, 0);
  liftMisplaced(u.raw);
  const tree = nestSiblings(u.raw, inAnnex, true, lang);
  const blocks = [];
  assignKeys(tree, '', 0, false, blocks, u);
  // Wurzelebene: Einleitungssatz s1 statt s1 fuer Artikel ohne Absatznummern ist korrekt
  delete u.raw;
  u.blocks = blocks;
  return u;
}

// ------------------------------------------------------------------ Einstieg

// Inline-Streichung "►M1 ————— ◄" (konsolidierte Fassungen): Die Strichfolge ist ein Marker, kein Wortlaut. Sie wird durch ein
// Steuerzeichen ersetzt, das inlineHtml samt Leerraum vor Satzzeichen entfernt ("extended ►M1 ————— ◄, referred" -> "extended, referred").
const DEL_STUB = '\u0002';
function markInlineDeletions(doc) {
  for (const a of doc.querySelectorAll('a[title$=": DELETED"]')) {
    if (!/^\s*►/.test(a.textContent || '')) continue;
    let n = a.parentNode && tag(a.parentNode) === 'span' && !hasClass(a.parentNode, 'boldface') ? a.parentNode : a;
    let t = n.nextSibling;
    while (t && t.nodeType === 3 && !t.nodeValue.trim()) t = t.nextSibling;
    if (t && t.nodeType === 3 && /^\s*—{3,}/.test(t.nodeValue)) t.nodeValue = t.nodeValue.replace(/^\s*—{3,}/, DEL_STUB);
  }
}

export function parseEurLex(html, { DOMParser } = {}) {
  if (!DOMParser) throw new Error('parseEurLex: DOMParser fehlt');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const fmt = detectFormat(doc);
  if (fmt !== 'oj') markInlineDeletions(doc);
  const meta = readMeta(doc, fmt);
  meta.baseCelex = fmt === 'oj' ? meta.celex : (meta.celex ? '3' + meta.celex.slice(1, 10) : null);
  const footnotes = collectFootnotes(doc, fmt);
  const w = new Walker(doc, fmt, meta, footnotes);
  if (fmt === 'oj') w.walkOJ(); else w.walkCons();
  const units = w.units.map((u) => finishUnit(u, meta.lang));
  const toc = [];
  for (const d of w.toc) toc.push({ id: d.id, type: d.type, parent: d.parent, num: d.num, label: d.label, heading: d.text, origin: d.origin });
  for (const u of units) toc.push({ id: u.id, type: u.type, parent: u.parent, num: u.num });
  // Dokumentreihenfolge: Divisionen vor ihren Artikeln
  const order = [];
  const seen = new Set();
  const divById = new Map(w.toc.map((d) => [d.id, d]));
  for (const u of units) {
    const chain = [];
    let p = u.parent;
    while (p && !seen.has(p)) { chain.unshift(p); p = divById.get(p) ? divById.get(p).parent : null; }
    for (const c of chain) { seen.add(c); order.push(toc.find((x) => x.id === c)); }
    order.push(toc.find((x) => x.id === u.id));
  }
  for (const d of toc) if (!order.includes(d)) order.push(d);
  return {
    kind: fmt === 'oj' ? 'oj' : 'consolidated',
    format: fmt,
    celex: meta.celex,
    baseCelex: meta.baseCelex,
    lang: meta.lang,
    date: meta.date,
    workTitle: meta.workTitle,
    modifiers: readModifiers(doc, fmt),
    hasImages: w.hasImages,
    units,
    toc: order,
  };
}

// Fuer Validierung: sichtbarer Fliesstext des verfuegenden Teils (ab Artikel 1 inkl. Anhaenge),
// ohne Marker, ohne Fussnotenzeichen, ohne Fussnotentexte, ohne Schlussformel.
export function sourceText(html, { DOMParser, imageText = true } = {}) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const fmt = detectFormat(doc);
  if (fmt !== 'oj') markInlineDeletions(doc);
  const footnotes = collectFootnotes(doc, fmt);
  const parts = [];
  const skipNode = (n) => {
    if (n.nodeType !== 1) return false;
    const t = tag(n);
    if (t === 'script' || t === 'style') return true;
    if (hasClass(n, 'modref') || hasClass(n, 'arrow') || hasClass(n, 'oj-note') || hasClass(n, 'footnote')) return true;
    if (t === 'a') {
      const href = n.getAttribute('href') || '';
      const txt = cleanSpace(n.textContent).trim();
      if (/^[▼►]/.test(txt)) return true;
      if (href.startsWith('#') && (footnotes.has(href.slice(1)) || isNoteRef(n))) return true;
      if ((n.getAttribute('id') || '').startsWith('textofimagelink')) return true;
    }
    if (!imageText && t === 'div' && /\.tif$/i.test(n.getAttribute('id') || '')) return true;
    if (t === 'span' && /^\s*◄\s*$/.test(n.textContent)) return true;
    return false;
  };
  const textOf = (el) => {
    const acc = [];
    const v = (n) => {
      if (skipNode(n)) return;
      if (n.nodeType === 3) { acc.push(n.nodeValue); return; }
      if (n.nodeType === 1) {
        const t = tag(n);
        const block = ['p', 'div', 'td', 'th', 'tr', 'table', 'li', 'br', 'figure'].includes(t);
        if (block) acc.push(' ');
        n.childNodes.forEach(v);
        if (block) acc.push(' ');
      }
    };
    v(el);
    return acc.join('');
  };
  if (fmt === 'oj') {
    const enc = doc.querySelector('#enc_1');
    if (enc) parts.push(textOf(enc));
    for (const anx of doc.querySelectorAll('.eli-container[id^="anx_"]')) parts.push(textOf(anx));
  } else {
    // ab erster Division/erstem Artikel bis Ende, ohne Schlussformel
    const all = Array.from(doc.body.querySelectorAll('p.title-division-1, p.title-article-norm, p.title-annex-1'));
    const first = all[0];
    if (first) {
      // Alle Knoten in Dokumentreihenfolge ab first einsammeln
      const walker = [];
      let started = false;
      const v = (n) => {
        if (n === first) started = true;
        if (n.nodeType === 1) {
          const id = n.getAttribute('id') || '';
          if (id.startsWith('fnp')) return;
          if (skipNode(n)) return;
          const t = tag(n);
          if (started && t === 'p' && LANG_WORDS.final.test(n.textContent) && n.textContent.length < 200 && !n.closest('.grid-container')) return;
          const block = ['p', 'div', 'td', 'th', 'tr', 'table', 'li', 'br', 'figure'].includes(t);
          if (block && started) walker.push(' ');
          n.childNodes.forEach(v);
          if (block && started) walker.push(' ');
          return;
        }
        if (n.nodeType === 3 && started) walker.push(n.nodeValue);
      };
      v(doc.body);
      parts.push(walker.join(''));
    }
  }
  // Klammern um entfernte Fussnotenzeichen (konsolidierte Fassungen: "Rates (<a>6</a>)") entfernen, wie im Blocktext
  return cleanSpace(parts.join(' ').replace(/\u0002/g, ' ')).replace(/\s*\(\s*\)/g, '').trim();
}

// ------------------------------------------------------------------ Erwaegungsgruende (nur ABl.-Fassung)
// parseRecitals(htmlString, { DOMParser }) -> { celex, lang, recitals: [ { n, k, l, t, fn?, sub: [ { k, l, t, fn? } ] } ] }
// Quelle: <div class="eli-subdivision" id="rct_N"> mit Layout-Tabelle (Nummer | Text). Weitere Absaetze bzw. Aufzaehlungen
// innerhalb eines Erwaegungsgrunds werden als Unterbloecke rN.s2 … bzw. rN.<Zeichen> gefuehrt.
export function parseRecitals(html, { DOMParser } = {}) {
  if (!DOMParser) throw new Error('parseRecitals: DOMParser fehlt');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const fmt = detectFormat(doc);
  const meta = readMeta(doc, fmt);
  const footnotes = collectFootnotes(doc, fmt);
  const w = new Walker(doc, fmt, { ...meta, baseCelex: meta.celex }, footnotes);
  const out = [];
  for (const div of doc.querySelectorAll('div[id^="rct_"]')) {
    const id = div.getAttribute('id');
    const mm = id.match(/^rct_(\d+)$/);
    if (!mm) continue;
    const n = +mm[1];
    const tbl = elementChildren(div).find((x) => tag(x) === 'table');
    let label = '', cell = div;
    if (tbl) {
      const tr = tableRows(tbl)[0];
      const tds = tr ? elementChildren(tr).filter((x) => tag(x) === 'td') : [];
      if (tds.length >= 2) { label = cleanSpace(tds[0].textContent).trim(); cell = tds[tds.length - 1]; }
    }
    const items = [];
    const visit = (el, depth) => {
      for (const c of elementChildren(el)) {
        const t = tag(c);
        if (t === 'p') { const r = w.inline(c); if (htmlToText(r.html)) items.push({ l: '', t: r.html, fn: r.fns, depth }); continue; }
        if (t === 'table') {
          for (const tr of tableRows(c)) {
            const tds = elementChildren(tr).filter((x) => tag(x) === 'td');
            if (tds.length < 2) { tds.forEach((td) => visit(td, depth)); continue; }
            const l = cleanSpace(tds[tds.length - 2].textContent).trim();
            const before = items.length;
            visit(tds[tds.length - 1], depth + 1);
            if (items.length > before) items[before].l = l;
          }
          continue;
        }
        if (t === 'div' || t === 'span') visit(c, depth);
      }
    };
    visit(cell, 0);
    if (!items.length) continue;
    const head = items[0];
    const rec = { n, k: 'r' + n, l: label || `(${n})`, t: head.t, sub: [] };
    if (head.fn && head.fn.length) rec.fn = head.fn;
    let s = 1;
    const used = new Set();
    for (const it of items.slice(1)) {
      let seg;
      const c = it.l ? classifyLabel(it.l) : null;
      if (c && c.seg) seg = c.seg; else if (c && c.fam === 'D') seg = 'd' + (rec.sub.filter((x) => /\.d\d+$/.test(x.k)).length + 1); else seg = 's' + (++s);
      let k = rec.k + '.' + seg;
      if (used.has(k)) { let i = 2; while (used.has(k + '~' + i)) i++; k += '~' + i; }
      used.add(k);
      const b = { k, l: it.l, t: it.t, d: it.depth ? 2 : 1 };
      if (it.fn && it.fn.length) b.fn = it.fn;
      rec.sub.push(b);
    }
    out.push(rec);
  }
  return { celex: meta.celex, lang: meta.lang, recitals: out };
}

// Fuer Validierung: Klartext aller Erwaegungsgruende (ohne Fussnotenzeichen)
export function recitalsSourceText(html, { DOMParser } = {}) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const fmt = detectFormat(doc);
  const footnotes = collectFootnotes(doc, fmt);
  const acc = [];
  const v = (n) => {
    if (n.nodeType === 3) { acc.push(n.nodeValue); return; }
    if (n.nodeType !== 1) return;
    if (tag(n) === 'a') { const href = n.getAttribute('href') || ''; if (href.startsWith('#') && (footnotes.has(href.slice(1)) || isNoteRef(n))) return; }
    const block = ['p', 'div', 'td', 'tr', 'table'].includes(tag(n));
    if (block) acc.push(' ');
    n.childNodes.forEach(v);
    if (block) acc.push(' ');
  };
  for (const div of doc.querySelectorAll('div[id^="rct_"]')) if (/^rct_\d+$/.test(div.getAttribute('id'))) v(div);
  return cleanSpace(acc.join('')).replace(/\s*\(\s*\)/g, '').trim();
}
