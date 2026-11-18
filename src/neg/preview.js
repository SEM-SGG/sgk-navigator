// SGK-Navigator, Modul Verhandlung — Vorschau hängiger Vorschläge im SGK (ESM, isomorph, rein)
//
// parseAmendingInstruction(text) -> { action, target, position?, container, level?, cmd?, strong }
//   action: "replace" | "insert" | "add" | "delete" | "amend-intro" | "rename" | "renumber" | "substitute" | "none"
//   target: { act?, art?, annex?, part?, par?, parOrd?, sub?, pt?:[], pts?:[], range?:{from,to}, indent?, intro?, title?, chapter?,
//             what: "article"|"annex"|"paragraph"|"subparagraph"|"point"|"indent"|"title"|"intro"|"chapter"|"sentence"|"words"|"act", isNew? }
//   container: true bei «… is amended as follows:» (trägt keinen Wortlaut, Unterbefehle folgen)
// buildPreview(dossier, { track, doc? }, dataset, { lang:"en", baseStage?, act?:"2016/399" }) ->
//   { base, units:{ <unitId>:{ baseVersion, previewVersion, changes:[{ key, action, row, confidence }] } },
//     unresolved:[{ row, label, reason, text }], roles:{ <rowId>:{ role, unit?, key? } }, stats:{ rows, applied, unresolved, … } }
// annotateAmends(dossier, dataset|null, { work?, act?, baseStage?, tracks?, works?:[{work,act,dataset,baseStage?}] }) -> { dossier, stats:{ preview, dropped, rows, byWork } }
//
// Verfahren (Einzelheiten data/NEG_NOTES.md §9):
//  1. Zeilen des Dossiers in Rasterreihenfolge; je Zeile die Zelle der Spur (mit doc: genau die Zelle dieses Dokuments, sonst die
//     jüngste). Gestrichener Text der Quelle (<s>) gehört nicht zum Wortlaut; Zellen «deleted» gelten als leer. <br> trennt Absätze.
//  2. Jeder Absatz ist Änderungsanweisung, neuer Wortlaut (Folgeabsätze einer Anweisung «… by the following:» / «… is inserted:»)
//     oder Rahmentext (Erwägungsgründe, Bezugsvermerke, Schlussbestimmungen, Anweisungen an andere Rechtsakte).
//  3. Ziel im Datensatz auflösen (Einheit art_N / anx_N, Blockschlüssel nach SPEC.md §5.2), Änderung auf die englische Fassung des
//     Basisstands anwenden. Was nicht sicher auflösbar ist (Ziel fehlt, Gliederungszeichen passt nicht, Wortlaut fehlt), kommt in
//     `unresolved` und wird nicht angewandt.
//  4. Wortlaut wird nicht verändert. Einzige Eingriffe: umschliessende Anführungszeichen am Anfang und Ende des eingefügten Wortlauts
//     und das Schlusszeichen der Anweisung («’;», «”.») werden entfernt; das führende Gliederungszeichen wird wie im Datensatz in `l`
//     abgetrennt (Schreibweise der Quelle bleibt, z. B. «a)»); Fussnotenzeichen (hochgestellte Ziffern, «*») kommen wie im Datensatz
//     nach `fn`; Leerraum wird auf ein Leerzeichen zusammengefasst; Auszeichnungen der Quelle (b i u) entfallen, sup/sub bleiben.

import { getVersion, rekey } from '../core/model.js';
import { normText } from '../core/text.js';
import { sortedRows, latestCell } from './model.js';
import { decodeEntities, clone } from './util.js';

const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth'];
const ORD_RE = `(${ORD.join('|')}|last)`;
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx'];
const ROMAN_SET = new Set(ROMAN);
const ROMAN_BASE_RE = /^(xx|xix|xviii|xvii|xvi|xv|xiv|xiii|xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i)([a-z]?)$/;
const ordNum = (w) => (w === 'last' ? -1 : ORD.indexOf(String(w).toLowerCase()) + 1);

// ------------------------------------------------------------------ Text einer Zelle in Absätze zerlegen

const escT = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const WS = /[\s  -​  　]+/g;

/**
 * Gestrichenen Text entfernen. Stand der gestrichene Teil als eigenes Wort zwischen zwei Wörtern (Leerraum am Rand) und
 * schliesst der eingefügte Text ohne Leerzeichen an («shall<s> notify the Commission</s><b>in close</b>»), bleibt ein
 * Leerzeichen stehen (sonst «shallin»). Wortinterne Änderungen («<s>25</s>25(2)») bleiben unberührt.
 */
function dropStruck(html) {
  const vis = (h) => decodeEntities(String(h).replace(/<[^>]+>/g, ''));
  let out = '';
  let i = 0;
  const re = /<(s|del)>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(html))) {
    out += html.slice(i, m.index);
    i = m.index + m[0].length;
    const x = vis(m[2]);
    const before = vis(out).slice(-1);
    let k = i, after = '';
    while (k < html.length && !after) { if (html[k] === '<') { const e = html.indexOf('>', k); k = e < 0 ? html.length : e + 1; continue; } after = html[k]; }
    if (/^\s|\s$/.test(x) && /[\p{L}\p{N},;:)]/u.test(before) && /[\p{L}\p{N}(]/u.test(after)) out += ' ';
  }
  return out + html.slice(i);
}

/** Inline-HTML einer Zelle -> Absätze { html (nur sup/sub), plain, fns:[n] }; gestrichener Text entfällt */
export function cellParagraphs(html) {
  const out = [];
  for (const raw of String(html || '').split(/<br\s*\/?>/i)) {
    const struck = /<(s|del)>/i.test(raw);
    const part = dropStruck(raw);
    const fns = [];
    // Fussnotenverweise: hochgestellte Ziffern oder Sterne
    let x = part.replace(/<sup>\s*\(?\s*(\d{1,3}|\*{1,3})\s*\)?\s*<\/sup>/gi, (m, n, off) => { fns.push({ n, at: off }); return '\u0001' + n + '\u0002'; });
    // Tags ausser sup/sub entfernen
    const keep = [];
    x = x.replace(/<\s*(\/?)\s*([a-z0-9]+)[^>]*>/gi, (m, sl, name) => { const n = name.toLowerCase(); if (n === 'sup' || n === 'sub') { keep.push(`<${sl}${n}>`); return `\u0003${keep.length - 1}\u0004`; } return ''; });
    x = decodeEntities(x).replace(WS, ' ');
    // Fussnotentext am Absatzanfang («¹ Council Directive …»): als Fussnote kennzeichnen
    let fnText = null;
    const fm = /^\s*\u0001(\d{1,3}|\*{1,3})\u0002\s*(.*)$/.exec(x);
    if (fm) { fnText = fm[1]; x = fm[2]; fns.length = 0; }
    const refs = [];
    const html = escT(x).replace(/\u0003(\d+)\u0004/g, (m, i) => keep[+i]).replace(/\u0001([^\u0002]*)\u0002/g, (m, n) => { refs.push(n); return ''; }).replace(/<(sup|sub)>\s*<\/\1>/g, '').replace(/ +/g, ' ').trim();
    const plain = x.replace(/\u0003\d+\u0004/g, '').replace(/\u0001([^\u0002]*)\u0002/g, '').replace(/ +/g, ' ').trim();
    if (!plain || /^[▌\s]+$/.test(plain)) continue;          // «▌» = Streichungszeichen im Parlamentsstandpunkt, kein Wortlaut
    if (/^deleted\.?$/i.test(plain)) continue;              // Vier-Spalten-Tabelle: Bestimmung in dieser Spur gestrichen
    // ganzer Text gestrichen, nur das Gliederungszeichen ist ungestrichen geblieben (Linie beginnt erst nach «a)»; ST 6331/24 Art. 26 Abs. 2)
    // Folgt ein Absatz ohne Gliederungszeichen, gehört das Zeichen zu diesem (ST 6331/24 Anhang XII Nr. 2): labelOnly, Entscheid im Aufrufer
    if (struck && /^(\(?\s*[0-9a-z]{1,5}\s*\)|\d+[a-z]*\.|[-–—•])\s*[;,.]?$/i.test(plain)) { out.push({ html, plain, refs, labelOnly: true }); continue; }
    out.push({ html, plain, refs, ...(fnText ? { fnText } : {}) });
  }
  return out;
}

// ------------------------------------------------------------------ Änderungsanweisungen erkennen

const LEAD_RES = [
  { re: /^\(\s*(\d+[a-z]*)\s*\)\s*/, kind: 'digit' },
  { re: /^(\d+[a-z]*)\)\s*/, kind: 'digit' },
  { re: /^\(\s*([a-z]{1,4})\s*\)\s*/, kind: 'alpha' },
  { re: /^([a-z]{1,4})\)\s*/, kind: 'alpha' },
];
function leadLabel(s) {
  for (const { re, kind } of LEAD_RES) {
    const m = re.exec(s);
    if (m) {
      let k = kind;
      if (kind === 'alpha') k = ROMAN_SET.has(m[1]) ? (['i', 'v', 'x'].includes(m[1]) ? 'ambiguous' : (m[1].length > 1 && /^(ii|iii|iv|vi|vii|viii|ix|xi|xii)$/.test(m[1]) ? 'roman' : 'letter')) : 'letter';
      return { label: m[1], kind: k, rest: s.slice(m[0].length) };
    }
  }
  return null;
}

const NUM = '(\\d+[a-z]*)';
const PT = '\\(?\\s*([0-9]+[a-z]*|[a-z]{1,4})\\s*\\)?';
// Rang in der Gliederung: Einheit > Teil > Absatz > Unterabsatz > Punkt > Gedankenstrich > Einleitung/Titel
const RANK = { article: 0, annex: 0, 'article-bare': 0, 'annex-bare': 0, chapter: 0, part: 1, paragraph: 2, 'paragraph-bare': 2, parOrd: 2, subOrd: 3, subparagraph: 3, point: 4, 'point-bare': 4, indOrd: 5, indent: 5, intro: 6, title: 6, sentence: 6, senOrd: 6, words: 6 };
const WHAT = { article: 'article', 'article-bare': 'article', annex: 'annex', 'annex-bare': 'annex', chapter: 'chapter', part: 'part', paragraph: 'paragraph', 'paragraph-bare': 'paragraph', parOrd: 'paragraph', subOrd: 'subparagraph', subparagraph: 'subparagraph', point: 'point', 'point-bare': 'point', indOrd: 'indent', indent: 'indent', intro: 'intro', title: 'title', sentence: 'sentence', senOrd: 'sentence', words: 'words' };

/** Verweise in einem Satzteil, von links nach rechts (zusammengesetzte «Article 8(3)(a)» werden zerlegt) */
function refsOf(phrase) {
  const s = String(phrase || '');
  const refs = [];
  const pats = [
    { type: 'article', re: new RegExp(`\\bArticles?\\s+${NUM}((?:\\s*\\(\\s*[0-9a-z]+\\s*\\))*)((?:\\s*(?:,|and|to)\\s*\\d+[a-z]*\\b)*)`, 'iy') },
    { type: 'annex', re: /\bAnnex(?:es)?\s+([IVXLC]+[a-z]*)\b((?:\s*(?:,|and|to)\s*[IVXLC]+[a-z]*\b)*)/y },
    { type: 'part', re: /\bPart\s+([A-Z][0-9]*|[IVX]+)\b/y },
    { type: 'chapter', re: /\b(Chapter|Title|Section)\s+([IVXLC0-9]+[a-z]*)\b/y },
    { type: 'ordinal', re: new RegExp(`\\b${ORD_RE}\\s+(subparagraph|paragraph|indent|sentence)s?\\b`, 'iy') },
    { type: 'paragraph', re: new RegExp(`\\bparagraphs?\\s+${NUM}((?:\\s*\\(\\s*[0-9a-z]+\\s*\\))*)(?:\\s*(and|to|,)\\s*${NUM}\\b)?`, 'iy') },
    { type: 'point', re: new RegExp(`\\bpoints?\\s+${PT}((?:\\s*\\(\\s*[0-9a-z]+\\s*\\))*)(?:\\s*(and|to|,)\\s*${PT})?`, 'iy') },
    { type: 'annex-bare', re: /\bannex\b/iy },
    { type: 'subparagraph', re: /\bsubparagraphs?\b/iy },
    { type: 'indent', re: /\bindents?\b/iy },
    { type: 'paragraph-bare', re: /\bparagraphs?\b/iy },
    { type: 'point-bare', re: /\bpoints?\b/iy },
    { type: 'article-bare', re: /\barticles?\b/iy },
    { type: 'intro', re: /\bintroductory\s+(?:wording|part|sentence|phrase|words)\b/iy },
    { type: 'title', re: /\b(?:title|heading)\b/iy },
    { type: 'sentence', re: /\bsentences?\b/iy },
    { type: 'words', re: /\bwords?\b/iy },
  ];
  const parens = (g) => (g ? [...g.matchAll(/\(\s*([0-9a-z]+)\s*\)/gi)].map((x) => x[1]) : []);
  let i = 0;
  while (i < s.length) {
    let hit = null;
    for (const p of pats) {
      p.re.lastIndex = i;
      const m = p.re.exec(s);
      if (m) { hit = { p, m }; break; }
    }
    if (!hit) { const n = s.slice(i).search(/[\s,;(]\S/); if (n < 0) break; i += n + 1; continue; }
    const { p, m } = hit;
    const at = i;
    if (p.type === 'article') {
      const more = m[3] ? [...m[3].matchAll(/(,|and|to)\s*(\d+[a-z]*)/g)].map((x) => x[2]) : [];
      refs.push({ type: 'article', v: m[1], at, ...(more.length ? { list: [m[1], ...more] } : {}) });
      const ps = parens(m[2]);
      if (ps.length) { refs.push({ type: 'paragraph', v: ps[0], at }); for (const x of ps.slice(1)) refs.push({ type: 'point', v: x, at }); }
    } else if (p.type === 'annex') {
      const more = m[2] ? [...m[2].matchAll(/(,|and|to)\s*([IVXLC]+[a-z]*)/g)].map((x) => x[2]) : [];
      refs.push({ type: 'annex', v: m[1], at, ...(more.length ? { list: [m[1], ...more] } : {}) });
    } else if (p.type === 'part') refs.push({ type: 'part', v: m[1], at });
    else if (p.type === 'chapter') refs.push({ type: 'chapter', v: `${m[1]} ${m[2]}`, at });
    else if (p.type === 'ordinal') refs.push({ type: { subparagraph: 'subOrd', paragraph: 'parOrd', indent: 'indOrd', sentence: 'senOrd' }[m[2].toLowerCase()], n: ordNum(m[1]), at });
    else if (p.type === 'paragraph') {
      const r = { type: 'paragraph', v: m[1], at };
      if (m[3] && m[4]) { if (m[3] === 'to') r.range = { from: m[1], to: m[4] }; else r.list = [m[1], m[4]]; }
      refs.push(r);
      for (const x of parens(m[2])) refs.push({ type: 'point', v: x, at });
    } else if (p.type === 'point') {
      const r = { type: 'point', v: m[1], at };
      const sub = parens(m[2]);
      if (m[3] && m[4]) { if (m[3] === 'to') r.range = { from: m[1], to: m[4] }; else r.list = [m[1], m[4]]; }
      refs.push(r);
      for (const x of sub) refs.push({ type: 'point', v: x, at, sub: true });
    } else refs.push({ type: p.type, at });
    i += Math.max(1, m[0].length);
  }
  return refs;
}

const ACT_RE = /\b(?:Regulation|Directive|Decision)\s+\((EU|EC|EEC|Euratom)\)\s*(?:No\s*)?(\d{2,4}\/\d{1,4})/i;
const ACT_RE_G = /\b(?:of|to|in)?\s*(?:Council\s+|Commission\s+)?(?:Implementing\s+|Delegated\s+)?(?:Regulation|Directive|Decision)\s+\((?:EU|EC|EEC|Euratom)\)\s*(?:No\s*)?\d{2,4}\/\d{1,4}(?:\s+of the European Parliament and of the Council)?/gi;

/** Pfad aus Verweisen (in Rangfolge) */
function pathFrom(refs) {
  const t = {};
  for (const r of refs.slice().sort((a, b) => (RANK[a.type] - RANK[b.type]) || (a.at - b.at))) {
    switch (r.type) {
      case 'article': t.art = r.v; break;
      case 'annex': t.annex = r.v; break;
      case 'part': t.part = r.v; break;
      case 'chapter': t.chapter = r.v; break;
      case 'paragraph': t.par = r.v; break;
      case 'parOrd': t.parOrd = r.n; break;
      case 'subOrd': t.sub = r.n; break;
      case 'point': t.pt = [...(t.pt || []), r.v.toLowerCase()]; break;
      case 'indOrd': t.indent = r.n; break;
      case 'intro': t.intro = true; break;
      case 'title': t.title = true; break;
      case 'senOrd': t.sentence = r.n; break;
      default: break;
    }
  }
  return t;
}

/**
 * Änderungsanweisung zerlegen (nur Englisch). Liefert action "none", wenn der Text keine Anweisung ist.
 * target: Pfad (art, annex, part, par|parOrd, sub, pt[], indent) — bei replace/delete/amend-intro einschliesslich des Objekts,
 * bei insert/add der Behälter; dazu what (Art des Objekts), num/list/range (Nummern des Objekts), isNew.
 */
export function parseAmendingInstruction(text) {
  const s0 = String(text || '').replace(/<[^>]+>/g, '').replace(WS, ' ').trim();
  const none = { action: 'none', target: {}, container: false, strong: false };
  if (!s0 || s0.length > 700) return none;
  // Anführungszeichen vor einer Anweisung («“ a) paragraph 2 is replaced …», Vier-Spalten-Tabellen) gehören nicht dazu
  const q = /^[‘“"'«„]\s*(?=\(?[0-9a-z]{1,4}\)\s|\(?\d+[a-z]*\)?\s+(?:in|the|Article|Annex|paragraph|point)\b)/i.exec(s0);
  const lead = leadLabel(q ? s0.slice(q[0].length) : s0);
  const s = (lead ? lead.rest : s0).replace(/[“”„]/g, '"').replace(/[‘’‚]/g, "'");
  const VERB = /\b(is|are|shall be)\s+(?:hereby\s+)?(amended|replaced|inserted|added|deleted|repealed|renamed|renumbered)\b|\b(becomes|become)\b/i;
  const vm = VERB.exec(s);
  if (!vm) return none;
  const subject = s.slice(0, vm.index).trim().replace(/,\s*$/, '');
  const comp = s.slice(vm.index + vm[0].length).trim();
  const verb = (vm[2] || 'becomes').toLowerCase();
  let action;
  if (verb === 'amended') { if (!/^(as follows|in accordance with|accordingly)/i.test(comp)) return none; action = 'amend-intro'; }
  else if (verb === 'replaced') {
    if (/^by\s+(the following|'|")/i.test(comp) || /^by\s*:/i.test(comp)) action = 'replace';
    else if (/^by\b/i.test(comp) && /\b(words?|date|figure|reference)\b/i.test(subject)) action = 'substitute';
    else return none;
  } else if (verb === 'inserted') action = 'insert';
  else if (verb === 'added') action = 'add';
  else if (verb === 'deleted' || verb === 'repealed') action = 'delete';
  else if (verb === 'renamed') action = 'rename';
  else action = 'renumber';
  if (vm[1] && /^shall be$/i.test(vm[1]) && action !== 'replace') return none;
  // Subjekt muss ein Strukturverweis sein (sonst z. B. «data are deleted …» im Normtext)
  const STRUCT = /^(?:(?:in|to)\s+[^,]{0,80},\s*)?(?:the\s+)?(?:following\s+|new\s+|a\s+new\s+)?(?:(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last)\s+)?(?:articles?|annex(?:es)?|paragraphs?|points?|subparagraphs?|indents?|sentences?|words?|title|heading|introductory|chapter|section|part|regulation|directive|decision)\b/i;
  if (!STRUCT.test(subject) && !/^(?:in|to)\s+(?:article|annex)/i.test(subject)) return none;
  if (action === 'delete' && subject.length > 220) return none;
  const target = {};
  const compHead = comp.split(/[:'"]/)[0];
  const actM = ACT_RE.exec(subject) || (action !== 'replace' && action !== 'insert' && action !== 'add' ? null : ACT_RE.exec(compHead));
  if (actM) target.act = actM[2];
  const subj = subject.replace(ACT_RE_G, ' ');
  // Position «after …» / «before …» (nur einfügen)
  let posRefs = null, posRel = null, compCont = compHead.replace(ACT_RE_G, ' ');
  const posM = /\b(after|before)\b\s+(.*)$/i.exec(compCont);
  if (posM && (action === 'insert' || action === 'add')) { posRel = posM[1].toLowerCase(); posRefs = refsOf(posM[2]); compCont = compCont.slice(0, posM.index); }
  const sRefs = refsOf(subj);
  const cRefs = action === 'insert' || action === 'add' ? refsOf(compCont) : [];
  if (!sRefs.length && !cRefs.length) {
    if (action === 'amend-intro' && target.act) return { action, target: { act: target.act, what: 'act' }, container: true, strong: true, ...(lead ? { cmd: { label: lead.label, kind: lead.kind } } : {}) };
    return none;
  }
  // Objekt: höchster Rang im Subjekt (bei gleichem Rang der letzte)
  let obj = null;
  for (const r of sRefs) if (!obj || RANK[r.type] > RANK[obj.type] || (RANK[r.type] === RANK[obj.type] && !r.sub && r.at >= obj.at)) obj = r;
  if (!obj && cRefs.length) obj = null;
  const isNew = action === 'insert' || action === 'add';
  let path;
  if (isNew) {
    const contRefs = [...sRefs.filter((r) => r !== obj && !(r.sub && obj && r.at === obj.at)), ...cRefs];
    path = pathFrom(contRefs);
    if (obj) {
      target.what = WHAT[obj.type];
      if (obj.v && !/^bare|^ordinal/.test(obj.type)) target.num = String(obj.v);
      if (obj.list) target.list = obj.list.map(String);
      if (obj.range) target.range = obj.range;
      // «point (b)(ii) is inserted» -> Behälter b, neues ii
      const subs = sRefs.filter((r) => r.sub && r.at === obj.at);
      if (subs.length) { path.pt = [...(path.pt || []), obj.v.toLowerCase(), ...subs.slice(0, -1).map((x) => x.v.toLowerCase())]; target.num = subs[subs.length - 1].v; }
    }
    target.isNew = true;
  } else {
    path = pathFrom(sRefs);
    target.what = obj ? WHAT[obj.type] : null;
    if (obj && obj.list) target.list = obj.list.map(String);
    if (obj && obj.range) target.range = obj.range;
  }
  Object.assign(target, path);
  if (!target.what) return none;
  const res = { action, target, container: action === 'amend-intro' };
  if (posRefs && posRefs.length) { res.position = posRel; res.anchor = { ...pathFrom(posRefs), what: WHAT[posRefs[posRefs.length - 1].type] }; }
  if (lead) res.cmd = { label: lead.label, kind: lead.kind };
  res.strong = !!lead || /^(?:in\s+)?(?:article|annex|the following|a new|new)\b/i.test(subject) || /^(?:the\s+)?(?:paragraph|point|subparagraph|indent|(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last)\s+\w+|introductory)\b/i.test(subject);
  if (action === 'substitute') {
    const w = /\b(?:words?|date|figure|reference)\s+(['"])(.+?)\1/i.exec(subject); const n = /^by\s+(?:the\s+(?:words?|date|figure|reference)\s+)?(['"])(.+?)\1/i.exec(comp);
    if (w && n) res.words = { from: w[2], to: n[2] };
  }
  // Wortlaut im selben Absatz («… is replaced by the following: ‘…’»)
  const cm = /^(.*?\b(?:by the following|as follows|(?:is|are) (?:inserted|added)(?:[^:]{0,80})?)\s*:)\s*(\S.*)$/i.exec(s0);
  if (cm && /^[‘“"'«„]/.test(cm[2]) && action !== 'rename') res.inline = cm[2];
  if (action === 'rename') { const q = /:\s*[“‘"']\s*(.+?)\s*[”’"']?\s*[;.]?\s*$/.exec(s0); if (q) res.inline = q[1]; }
  return res;
}

/** Ziel einer Unteranweisung mit dem Behälter verbinden */
function mergeTarget(parent, own) {
  const PATH = ['art', 'annex', 'part', 'chapter', 'par', 'parOrd', 'sub', 'pt', 'indent'];
  if (own.art || own.annex) return clone(own);
  const t = {};
  if (parent) for (const k of [...PATH, 'act']) if (parent[k] !== undefined) t[k] = clone(parent[k]);
  if (own.part !== undefined) { t.part = own.part; delete t.par; delete t.parOrd; delete t.sub; delete t.pt; delete t.indent; }
  if (own.par !== undefined || own.parOrd !== undefined) { delete t.par; delete t.parOrd; delete t.sub; delete t.pt; delete t.indent; if (own.par !== undefined) t.par = own.par; else t.parOrd = own.parOrd; }
  if (own.sub !== undefined) { t.sub = own.sub; delete t.pt; delete t.indent; }
  if (own.pt) { t.pt = (own.par !== undefined || own.parOrd !== undefined || own.sub !== undefined) ? own.pt.slice() : [...(t.pt || []), ...own.pt]; delete t.indent; }
  if (own.indent !== undefined) t.indent = own.indent;
  for (const k of ['what', 'num', 'list', 'range', 'isNew', 'intro', 'title', 'sentence', 'chapter', 'act']) if (own[k] !== undefined) t[k] = clone(own[k]);
  return t;
}

// ------------------------------------------------------------------ Gliederung des neuen Wortlauts

/** Führendes Gliederungszeichen eines Absatzes -> { fam, seg, l, plain, html } */
function splitLabel(plain, html) {
  const pats = [
    [/^(\d+(?:\.\d+)*[a-z]*)\.(?=\s|[A-Z‘“])/, 'N'],    // 1.  12.  2g.  1.1.  (auch ohne Leerzeichen vor Grossbuchstaben: «2ga.Before», Quelle)
    [/^(\d+[a-z])\s+(?=[A-Z‘“'"])/, 'Nbare'],            // «3a As regards …» (Quelle ohne Punkt)
    [/^\(\s*(\d+[a-z]*)\s*\)(?=\s)/, 'NP'],              // (1)
    [/^\(\s*([a-z]{1,4})\s*\)(?=\s)/, 'A'],              // (a) (ba) (iii)
    [/^([a-z]{1,4})\)(?=\s)/, 'A'],                      // a) iii)
    [/^(x{0,2}(?:ix|iv|v?i{1,3}|v))\.(?=\s)/, 'Rdot'],   // i. ii. iv.
    [/^([-–—•▪])(?=\s)/, 'D'],
  ];
  for (const [re, fam] of pats) {
    const m = re.exec(plain);
    if (!m || !m[1]) continue;
    const lab = fam === 'Nbare' ? m[1] : m[0];
    return { fam: fam === 'Nbare' ? 'N' : fam, seg: m[1], l: lab, plain: plain.slice(m[0].length).trim(), html: stripLeadHtml(html, m[0]) };
  }
  return { fam: 'U', seg: null, l: '', plain, html };
}
function stripLeadHtml(html, lead) {
  let h = html, k = 0, i = 0;
  const n = String(lead).length;
  while (i < h.length && k < n) {
    if (h[i] === '<') { const e = h.indexOf('>', i); i = e < 0 ? h.length : e + 1; continue; }
    const ent = /^&(amp|lt|gt);/.exec(h.slice(i, i + 5));
    if (ent) { i += ent[0].length; k++; continue; }
    i++; k++;
  }
  return h.slice(i).replace(/^\s+/, '');
}

function romanVal(seg) { const m = ROMAN_BASE_RE.exec(seg); return m ? ROMAN.indexOf(m[1]) + 1 + (m[2] ? (m[2].charCodeAt(0) - 96) / 100 : 0) : null; }
const isRomanSeg = (s) => /^(xx|xix|xviii|xvii|xvi|xv|xiv|xiii|xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i)[a-z]?$/.test(s) && !/^[a-z]$/.test(s.replace(/^(i|v|x)$/, ''));

/** Schlüsselsegment-Vergleich (natürliche Ordnung: 2 < 2a < 2g < 3 < 10; b < ba < c; ii < iii < iv) */
function cmpSeg(a, b) {
  const sa = String(a).replace(/^[pn](?=\d)/, ''), sb = String(b).replace(/^[pn](?=\d)/, '');
  const na = /^(\d+)([a-z]*)$/.exec(sa), nb = /^(\d+)([a-z]*)$/.exec(sb);
  if (na && nb) return (+na[1] - +nb[1]) || na[2].localeCompare(nb[2]);
  const ra = romanVal(sa), rb = romanVal(sb);
  if (ra !== null && rb !== null && (sa.length > 1 || sb.length > 1) && ROMAN_SET.has(sa.replace(/[a-z]$/, '') || sa) && ROMAN_SET.has(sb.replace(/[a-z]$/, '') || sb) && !(/^[a-z]{1,2}$/.test(sa) && /^[a-z]{1,2}$/.test(sb) && (!ROMAN_SET.has(sa) || !ROMAN_SET.has(sb)))) return ra - rb;
  return sa.localeCompare(sb);
}
const famOfSeg = (seg) => (/^p\d/.test(seg) ? 'P' : /^n\d/.test(seg) ? 'N' : /^s\d/.test(seg) ? 'U' : /^d\d/.test(seg) ? 'D' : /^pt/.test(seg) ? 'H' : /^h\d/.test(seg) ? 'h' : /^[tg]\d/.test(seg) ? 'X' : 'A');
const depthOf = (k) => k.split('.').length - 1;
function uniq(key, used) { let k = key; let i = 2; while (used.has(k)) k = `${key}~${i++}`; used.add(k); return k; }

function decideRoman(seg, stack, labels, i) {
  if (!['i', 'v', 'x'].includes(seg)) return 'R';
  const lists = stack.filter((e) => e.fam === 'A' || e.fam === 'R');
  const top = lists[lists.length - 1];
  const look = (labels.slice(i + 1).find((l) => l.seg) || {}).seg;
  const nextR = { i: 'ii', v: 'vi', x: 'xi' }[seg];
  const pred = { i: 'h', v: 'u', x: 'w' }[seg];
  const predR = { i: null, v: 'iv', x: 'ix' }[seg];
  if (top && top.fam === 'R' && predR && top.seg === predR) return 'R';
  if (top && top.fam === 'A' && top.seg === pred) return look === nextR ? 'R' : 'A';
  if (top && top.fam === 'A') return 'R';
  return look === nextR ? 'R' : 'A';
}

/**
 * Absätze des neuen Wortlauts gliedern und Schlüssel vergeben (Konventionen SPEC.md §5.2, wie der Parser des SGK-Moduls).
 * opts: { root: Schlüssel des Behälters ('' = Einheit), inAnnex, numScheme: 'p'|'n' (Ziffer mit Punkt auf Artikelebene),
 *         parentIsText: Behälter ist Textblock (Unterabsätze ab s2), sStart: erster s-Index auf Behälterebene }
 * Rückgabe: [{ k, d, l, t, ty?, fns, row }]
 */
function structure(paras, { root = '', inAnnex = false, numScheme = 'p', parentIsText = false, sStart = null } = {}) {
  const out = [];
  const stack = [];
  const sIdx = new Map(), dIdx = new Map(), hIdx = new Map();
  const used = new Set();
  const join = (p, s) => (p ? `${p}.${s}` : s);
  const isOwner = (e) => e.fam === 'P' || e.fam === 'H' || (inAnnex && e.fam === 'N');
  const nextS = (parent, isText) => {
    const n = sIdx.has(parent) ? sIdx.get(parent) + 1 : (parent === root && sStart ? sStart : (isText ? 2 : 1));
    sIdx.set(parent, n);
    return `s${n}`;
  };
  const nextH = (parent) => { const n = (hIdx.get(parent) || 0) + 1; hIdx.set(parent, n); return join(parent, `h${n}`); };
  const labels = paras.map((p) => splitLabel(p.plain, p.html));
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    const lab = labels[i];
    const push = (b) => { b.k = uniq(b.k, used); b.d = depthOf(b.k); b.row = p.row; if (!b.fns) b.fns = p.fns || []; out.push(b); return b; };
    let fam = lab.fam;
    const seg = lab.seg;
    if (inAnnex && fam === 'U') {
      const pm = /^(?:PART|Part)\s+([A-Z][0-9]*)\b\s*(.*)$/.exec(p.plain);
      if (pm) {
        stack.length = 0;
        const head = p.plain.slice(0, p.plain.length - pm[2].length).trim();
        const b = push({ k: join(root, `pt${pm[1]}`), l: '', t: escT(head), ty: 'heading', fns: [] });
        stack.push({ key: b.k, fam: 'H' });
        if (pm[2]) push({ k: nextH(b.k), l: '', t: stripLeadHtml(p.html, head), ty: 'heading' });
        continue;
      }
    }
    if (fam === 'Rdot') fam = 'R';
    if (fam === 'NP') fam = 'N';
    if (fam === 'A' && ROMAN_SET.has(seg)) fam = decideRoman(seg, stack, labels, i);
    // Ziffer mit Punkt («4.») bzw. ohne Punkt vor Grossbuchstaben («3a As regards …», Quelle ohne Punkt) ist in Artikeln mit
    // Absatzzählung immer ein Absatz, auch nach Buchstaben (die Aufzählung «(1)» innerhalb von Punkten hat die Familie NP)
    if (fam === 'N' && !inAnnex && numScheme === 'p' && (lab.l.endsWith('.') || /^\d+[a-z]$/.test(lab.l)) && !seg.includes('.') && labels[i].fam !== 'NP') fam = 'P';
    if (fam === 'U') {
      const top = stack[stack.length - 1];
      if (inAnnex && top && top.fam === 'H' && p.plain.length < 200 && !/[.:;,]$/.test(p.plain) && !out.some((b) => b.k.startsWith(top.key + '.') && b.ty !== 'heading')) {
        push({ k: nextH(top.key), l: '', t: p.html, ty: 'heading' });
        continue;
      }
      while (stack.length > 1 && !isOwner(stack[stack.length - 1])) stack.pop();
      const owner = stack[stack.length - 1];
      const parent = owner ? owner.key : root;
      const isText = owner ? owner.fam !== 'H' : parentIsText;
      push({ k: join(parent, nextS(parent, isText)), l: '', t: p.html });
      continue;
    }
    let segKey = fam === 'P' ? `p${seg}` : fam === 'N' ? `n${seg}` : fam === 'D' ? null : seg;
    let comps = null;
    if (fam === 'P') { while (stack.length && stack[stack.length - 1].fam !== 'H') stack.pop(); }
    else if (fam === 'N' && inAnnex) {
      comps = String(seg).split('.');
      while (stack.length) {
        const t = stack[stack.length - 1];
        if (t.fam === 'H') break;
        if (t.fam === 'N' && t.comps && t.comps.length < comps.length && comps.slice(0, t.comps.length).join('.') === t.comps.join('.')) break;
        stack.pop();
      }
      segKey = `n${comps[comps.length - 1]}`;
    } else {
      let k = stack.length - 1;
      while (k >= 0 && stack[k].fam !== fam) { if (isOwner(stack[k])) { k = -1; break; } k--; }
      if (k >= 0) stack.length = k;
    }
    const parent = stack.length ? stack[stack.length - 1].key : root;
    if (fam === 'D') { const n = (dIdx.get(parent) || 0) + 1; dIdx.set(parent, n); segKey = `d${n}`; }
    const b = push({ k: join(parent, segKey), l: lab.l, t: lab.html });
    stack.push({ key: b.k, fam, seg, comps });
  }
  return out;
}

// ------------------------------------------------------------------ Anführungszeichen

const OPEN_RE = /^\s*(?:[‘“"'«„‚]\s*)+/;
const CLOSE_RE = /([.;:!?)\]…])\s*(?:[’”"'»]\s*)+(?:[;.,]\s*)?(?:(?:and|or)\s*)?$/;
const CLOSE_BARE_RE = /^\s*(?:[’”"'»]\s*)+[;.,]?\s*$/;
/** Öffnendes Anführungszeichen entfernen; Definitionsbegriff am Anfang («‘border surveillance’ means») bleibt */
function stripOpen(p) {
  const m = OPEN_RE.exec(p.plain);
  if (!m) return { p, had: false };
  const rest = p.plain.slice(m[0].length);
  const keepOne = /^[A-Za-z][^’”"'‘“]{0,90}[’”"']\s+(means|refers|shall mean)\b/.test(rest);
  const cut = keepOne ? m[0].replace(/[‘“"'«„‚]\s*$/, '') : m[0];
  if (!cut) return { p, had: true };
  return { p: { ...p, plain: p.plain.slice(cut.length).trim(), html: stripLeadHtml(p.html, cut) }, had: true };
}
function stripClose(p) {
  if (CLOSE_BARE_RE.test(p.plain)) return { p: null, closed: true };
  const m = CLOSE_RE.exec(p.plain);
  if (!m) return { p, closed: false };
  const tail = p.plain.length - m.index - m[1].length;
  return { p: { ...p, plain: p.plain.slice(0, p.plain.length - tail).trim(), html: cutTailHtml(p.html, tail) }, closed: true };
}
function cutTailHtml(html, n) {
  let h = html, i = h.length, k = 0;
  while (i > 0 && k < n) {
    if (h[i - 1] === '>') { const s = h.lastIndexOf('<', i - 1); i = s < 0 ? 0 : s; continue; }
    if (h[i - 1] === ';') { const s = h.lastIndexOf('&', i - 1); if (s >= 0 && /^&(amp|lt|gt);$/.test(h.slice(s, i))) { i = s; k++; continue; } }
    i--; k++;
  }
  return h.slice(0, i).replace(/\s+$/, '');
}

// ------------------------------------------------------------------ Hilfen Datensatz

function versionOf(ds, unitId, lang, stage) {
  const v = getVersion(ds, unitId, lang, stage);
  return v && !v.repealed ? v : null;
}
const parentOf = (k) => { const i = k.lastIndexOf('.'); return i < 0 ? '' : k.slice(0, i); };
const segOf = (k) => { const i = k.lastIndexOf('.'); return i < 0 ? k : k.slice(i + 1); };
const childrenOf = (blocks, parent) => blocks.filter((b) => parentOf(b.k) === parent);
function subtreeEnd(blocks, i) {
  const k = blocks[i].k;
  let j = i + 1;
  while (j < blocks.length && blocks[j].k.startsWith(k + '.')) j++;
  return j;
}
function containerEnd(blocks, parent) {
  if (!parent) return blocks.length;
  const i = blocks.findIndex((b) => b.k === parent);
  return i < 0 ? blocks.length : subtreeEnd(blocks, i);
}
function numSchemeOf(blocks) {
  const roots = blocks.filter((b) => !b.k.includes('.'));
  if (roots.some((b) => /^p\d/.test(b.k))) return 'p';
  if (roots.some((b) => /^n\d/.test(b.k))) return 'n';
  return 'p';
}
const normCmp = (t) => normText(t || '');

/**
 * Ziel im Blockbaum einer Einheit auflösen.
 * Rückgabe: ersetzen/löschen { keys:[…], intro?, subFirst? }; einfügen/anfügen { container, newSegs, what }; sonst { error }.
 */
function resolvePath(blocks, t, action) {
  const has = (k) => blocks.some((b) => b.k === k);
  const kids = (k) => childrenOf(blocks, k);
  const insert = action === 'insert' || action === 'add';
  const scheme = numSchemeOf(blocks);
  const ordName = (n) => (n === -1 ? 'letzter' : `${n}.`);
  let key = '';
  if (t.part) { key = `pt${String(t.part).toUpperCase()}`; if (!has(key)) return { error: `Teil ${t.part} nicht vorhanden` }; }
  if (t.par !== undefined) {
    const k = [`p${t.par}`, `n${t.par}`].map((s) => (key ? `${key}.${s}` : s)).find(has);
    if (!k) return { error: `Absatz ${t.par} nicht vorhanden` };
    key = k;
  } else if (t.parOrd) {
    const roots = kids(key).filter((b) => /^(s|p|n)\d/.test(segOf(b.k)) && b.ty !== 'heading');
    const pick = t.parOrd === -1 ? roots[roots.length - 1] : roots[t.parOrd - 1];
    if (!pick) return { error: `${ordName(t.parOrd)} Absatz nicht vorhanden` };
    key = pick.k;
  }
  let subFirst = false;
  if (t.sub) {
    const subs = kids(key).filter((b) => /^s\d/.test(segOf(b.k)));
    if (!key) {
      const pick = t.sub === -1 ? subs[subs.length - 1] : subs[t.sub - 1];
      if (!pick) return { error: `${ordName(t.sub)} Unterabsatz nicht vorhanden` };
      key = pick.k;
    } else if (t.sub === 1 || (t.sub === -1 && !subs.length)) subFirst = true;
    else {
      const pick = t.sub === -1 ? subs[subs.length - 1] : subs[t.sub - 2];
      if (!pick) return { error: `${ordName(t.sub)} Unterabsatz in ${key} nicht vorhanden` };
      key = pick.k;
    }
  }
  for (const c of t.pt || []) {
    const s = String(c).toLowerCase();
    const cands = (/^\d/.test(s) ? [`n${s}`, `p${s}`] : [s]).map((x) => (key ? `${key}.${x}` : x));
    const k = cands.find(has);
    if (!k) return { error: `Punkt (${s}) nicht vorhanden${key ? ` in ${key}` : ''}` };
    key = k; subFirst = false;
  }
  if (t.indent) {
    const ds = kids(key).filter((b) => /^d\d/.test(segOf(b.k)));
    const pick = t.indent === -1 ? ds[ds.length - 1] : ds[t.indent - 1];
    if (!pick) return { error: `${ordName(t.indent)} Gedankenstrich nicht vorhanden` };
    key = pick.k; subFirst = false;
  }
  if (insert) {
    const conv = (v) => {
      const s = String(v).toLowerCase();
      if (t.what === 'paragraph') return /^\d/.test(s) ? `${scheme === 'n' && !key ? 'n' : 'p'}${s}` : s;
      if (t.what === 'point') return /^\d/.test(s) ? `n${s}` : s;
      return s;
    };
    let newSegs = null;
    if (t.range) newSegs = { from: conv(t.range.from), to: conv(t.range.to) };
    else if (t.list) newSegs = t.list.map(conv);
    else if (t.num) newSegs = [conv(t.num)];
    return { container: key, newSegs, what: t.what };
  }
  if (!key) return { error: 'Ziel innerhalb der Einheit nicht bestimmbar' };
  if ((t.list || t.range) && (t.what === 'point' || t.what === 'paragraph')) {
    const parent = parentOf(key);
    const fam = famOfSeg(segOf(key));
    const sibs = kids(parent).filter((b) => famOfSeg(segOf(b.k)) === fam);
    let keys;
    if (t.range) keys = sibs.filter((b) => cmpSeg(segOf(b.k), String(t.range.from).toLowerCase()) >= 0 && cmpSeg(segOf(b.k), String(t.range.to).toLowerCase()) <= 0).map((b) => b.k);
    else keys = t.list.map((v) => sibs.find((b) => cmpSeg(segOf(b.k), String(v).toLowerCase()) === 0)).map((b) => b && b.k);
    if (!keys.length || keys.some((k) => !k)) return { error: 'nicht alle genannten Bestimmungen vorhanden' };
    return { keys };
  }
  return { keys: [key], intro: !!t.intro || t.what === 'intro', subFirst };
}
function segInExpect(sg, expect) {
  if (Array.isArray(expect)) return expect.some((e) => cmpSeg(e, sg) === 0 && famOfSeg(e) === famOfSeg(sg));
  if (expect.from && expect.to) return cmpSeg(sg, expect.from) >= 0 && cmpSeg(sg, expect.to) <= 0;
  return true;
}

// ------------------------------------------------------------------ Vorschau

/**
 * Vorschau einer Spur auf den SGK.
 * @param {object} dossier   Dossier (volles Schema, über importDossier geladen)
 * @param {{track:string, doc?:string}} sel  Spur; doc = nur Zellen dieses Dokuments (sonst jüngste Zelle je Zeile)
 * @param {object} dataset   SGK-Datensatz (SPEC.md §5)
 * @param {{lang?:string, baseStage?:string, act?:string}} opts
 */
export function buildPreview(dossier, sel, dataset, opts = {}) {
  const lang = opts.lang || 'en';
  const track = sel && sel.track;
  if (!track) throw new Error('buildPreview: Spur fehlt');
  const stages = dataset.stages.slice().sort((a, b) => a.order - b.order);
  const base = opts.baseStage || stages[stages.length - 1].id;
  if (!stages.some((s) => s.id === base)) throw new Error(`buildPreview: unbekannter Stand ${base}`);
  const ACT = opts.act || '2016/399';
  const tag = `preview:${dossier.id}:${track}`;
  const docOnly = sel.doc || null;
  // Ohne erkannten Kontext («Regulation (EU) 2016/399 is amended as follows») gilt der Akt nur, wenn das Dossier ihn als Bezug führt
  // oder der Titel genau einen geänderten Akt nennt (Titel mit mehreren Akten, z. B. Screening: keine Annahme)
  const titleActs = new Set([...`${dossier.title || ''}`.matchAll(/\b(?:\(E[UC]\)\s*(?:No\s*)?)(\d{1,4}\/\d{1,4})/g)].map((m) => m[1]));
  const assumeAct = (dossier.workRef && dossier.workRef.act === ACT) || (titleActs.size === 1 && titleActs.has(ACT));

  const units = new Map();
  const unresolved = [];
  const roles = {};
  const stats = { rows: 0, paragraphs: 0, instructions: 0, applied: 0, unresolved: 0, wording: 0, frame: 0, otherAct: 0 };
  let actCtx = null;
  let ctx = [];
  let lastAlpha = null;
  let pending = null;
  let zoneArticles = false;
  let heldLabel = null;

  const rowLabel = (rid) => { const r = dossier.rows.find((x) => x.id === rid); return r ? r.label : ''; };
  const fail = (rowIds, reason, text) => {
    stats.unresolved++;
    unresolved.push({ row: rowIds[0], rows: rowIds.slice(), label: rowLabel(rowIds[0]), reason, text: String(text || '').slice(0, 300) });
    for (const rid of rowIds) if (roles[rid]) roles[rid].unresolved = true;
  };
  const setRole = (rid, role, extra) => { if (!roles[rid] || roles[rid].role === 'frame') roles[rid] = { role, ...(extra || {}) }; else if (extra && extra.unit && !roles[rid].unit) Object.assign(roles[rid], extra); };
  const unitState = (unitId) => {
    if (units.has(unitId)) return units.get(unitId);
    const v = versionOf(dataset, unitId, lang, base);
    const st = { unitId, base: v, exists: !!v, label: v ? v.label : null, title: v ? v.title : '', blocks: v ? clone(v.blocks) : [], repealed: false, changes: [], touched: false };
    units.set(unitId, st);
    return st;
  };
  const unitOf = (t) => (t.art ? `art_${t.art}` : t.annex ? `anx_${t.annex}` : null);
  const markRows = (unitId, fresh, rows) => {
    for (const b of fresh) if (b.row && roles[b.row] && !roles[b.row].key) Object.assign(roles[b.row], { unit: unitId, key: b.k });
    for (const rid of rows) if (roles[rid]) { roles[rid].unit = unitId; if (!roles[rid].key && fresh[0]) roles[rid].key = fresh[0].k; }
  };

  const levelOf = (ins) => {
    if (!ins.cmd) return null;
    if (ins.cmd.kind === 'digit') return 1;
    if (ins.cmd.kind === 'letter') return 2;
    if (ins.cmd.kind === 'roman') return 3;
    const pred = { i: 'h', v: 'u', x: 'w' }[ins.cmd.label];
    const top = ctx.length ? ctx[ctx.length - 1].level : 0;
    if (lastAlpha === pred && top < 2) return 2;
    return top >= 2 ? 3 : 2;
  };

  function handleInstruction(ins, rid, plain) {
    stats.instructions++;
    const own = ins.target;
    if (own.what === 'act' && ins.action === 'amend-intro') {
      actCtx = own.act === ACT ? ACT : 'other'; ctx = [];
      setRole(rid, actCtx === ACT ? 'instruction' : 'other-act', { act: own.act });
      if (actCtx !== ACT) stats.otherAct++;
      return;
    }
    let level = levelOf(ins);
    if (level === 2 && ins.cmd) lastAlpha = ins.cmd.label;
    if (level === null) level = own.art || own.annex || (own.isNew && (own.what === 'article' || own.what === 'annex')) ? 1 : (ctx.length ? ctx[ctx.length - 1].level + 1 : 1);
    while (ctx.length && ctx[ctx.length - 1].level >= level) ctx.pop();
    const inherited = ctx.length && ctx[ctx.length - 1].skip;
    const act = own.act || (inherited ? 'other' : null) || (actCtx === 'other' ? 'other' : actCtx) || (assumeAct ? ACT : null);
    if (act !== ACT) {
      stats.otherAct++;
      setRole(rid, 'other-act', { act: own.act || null });
      if (ins.container) ctx.push({ level, target: own, skip: true });
      else if (['replace', 'insert', 'add', 'substitute'].includes(ins.action)) pending = { skip: true, ins, target: own, rows: [rid], paras: [], started: false, quoteClosed: false };
      return;
    }
    const merged = mergeTarget(ctx.length ? ctx[ctx.length - 1].target : null, own);
    setRole(rid, 'instruction', unitOf(merged) ? { unit: unitOf(merged) } : {});
    if (ins.container) {
      if (!unitOf(merged)) { fail([rid], 'Behälteranweisung ohne Artikel oder Anhang', plain); return; }
      ctx.push({ level, target: merged, row: rid });
      if (/in accordance with/i.test(plain)) fail([rid], 'Änderung «in accordance with the Annex» – Wortlaut steht im Anhang des Änderungsakts; nicht aufgelöst', plain);
      return;
    }
    if (ins.action === 'rename' || ins.action === 'renumber') {
      fail([rid], ins.action === 'rename' ? 'Umbenennung einer Kapitel- oder Abschnittsüberschrift – im Blockschema nicht abgebildet' : 'Umnummerierung – nicht angewandt', plain);
      return;
    }
    if (ins.action === 'delete') { execute({ ins, target: merged, paras: [], rows: [rid], quoteOpen: true, quoteClosed: true }); return; }
    pending = { ins, target: merged, rows: [rid], paras: [], quoteOpen: false, quoteClosed: false, started: false };
    if (ins.inline) addWording(ins.inline, rid, { html: escT(ins.inline), refs: [] });
  }

  function addWording(plain, rid, para) {
    let p = { html: para.html, plain, refs: para.refs || [], ...(para.fnText ? { fnText: para.fnText } : {}) };
    if (!pending.started || pending.quoteClosed) {
      const o = stripOpen(p);
      p = o.p;
      if (o.had) pending.quoteOpen = true;
      pending.started = true; pending.quoteClosed = false;
    }
    const c = stripClose(p);
    // Fussnotentext (am Seitenende der Quelle) trägt oft das Schlusszeichen des zitierten Wortlauts, obwohl danach noch
    // Wortlaut folgt (ST 6331/24 Art. 5 Abs. 4, Art. 13): schliesst das Zitat nicht
    if (c.closed && !p.fnText) pending.quoteClosed = true;
    if (c.p && c.p.plain) pending.paras.push({ ...c.p, row: rid });
    if (!pending.rows.includes(rid)) pending.rows.push(rid);
    stats.wording++;
    setRole(rid, pending.skip ? 'other-act' : 'wording', !pending.skip && pending.target && unitOf(pending.target) ? { unit: unitOf(pending.target) } : {});
  }

  function finalize() {
    const p = pending; pending = null;
    if (!p || p.skip) return;
    if (!p.paras.length) { fail(p.rows, 'Anweisung ohne neuen Wortlaut', ''); return; }
    execute(p);
  }

  function prepareParas(paras) {
    const body = [];
    const notes = new Map();
    let inNotes = false;
    for (const p of paras) {
      if (/^_{3,}\s*$/.test(p.plain)) { inNotes = true; continue; }
      const star = /^(\*{1,3})\s+(.*)$/.exec(p.plain);
      const num = inNotes ? /^\(?(\d{1,3})\)?\s+\S/.exec(p.plain) : null;
      if (p.fnText || (inNotes && star) || num) {
        const n = p.fnText || (star ? star[1] : num[1]);
        const t = p.fnText ? p.html : stripLeadHtml(p.html, star ? star[1] : /^\(?\d{1,3}\)?/.exec(p.plain)[0]);
        notes.set(String(n), t);
        continue;
      }
      inNotes = false;
      body.push({ ...p });
    }
    for (const p of body) {
      p.fns = (p.refs || []).map((n) => ({ n: String(n), t: notes.get(String(n)) || '' }));
      for (const n of [...notes.keys()].filter((x) => /^\*+$/.test(x)).sort((a, b) => b.length - a.length)) {
        const re = new RegExp(`(\\S)${n.replace(/\*/g, '\\*')}(?![*])(?=[\\s,.;:)\\]]|$)`, 'g');
        if (re.test(p.plain)) {
          p.plain = p.plain.replace(re, '$1'); p.html = p.html.replace(re, '$1');
          p.fns.push({ n, t: notes.get(n) });
        }
      }
    }
    return body;
  }

  function execute(p) {
    const { ins } = p;
    const t = p.target;
    const rows = p.rows;
    const paras = prepareParas(p.paras);
    const conf = p.quoteOpen && p.quoteClosed ? 'high' : 'medium';
    const what = t.what;
    if (what === 'article' || what === 'annex') { execUnit(p, paras, conf); return; }
    if (what === 'act' || what === 'chapter' || what === 'sentence' || what === 'words' && ins.action !== 'substitute') { fail(rows, `Änderung auf Ebene «${what}» nicht unterstützt`, (paras[0] || {}).plain || ''); return; }
    const unitId = unitOf(t);
    if (!unitId) { fail(rows, 'Einheit nicht bestimmbar', (paras[0] || {}).plain); return; }
    const st = unitState(unitId);
    if (!st.exists && !st.touched) { fail(rows, `Einheit ${unitId} im Stand ${base} nicht vorhanden`, ''); return; }
    if (st.repealed) { fail(rows, `Einheit ${unitId} ist in dieser Vorschau aufgehoben`, ''); return; }
    if (what === 'title') {
      if (ins.action !== 'replace' || !paras.length) { fail(rows, 'Titeländerung ohne Wortlaut', ''); return; }
      st.title = paras.map((x) => x.html).join(' '); st.touched = true;
      st.changes.push({ key: '_title', action: 'replace', row: rows[0], rows, confidence: conf });
      markRows(unitId, [], rows);
      stats.applied++;
      return;
    }
    if (ins.action === 'substitute') { applySubstitute(st, t, ins, rows); return; }
    const blocks = st.blocks;
    const res = resolvePath(blocks, t, ins.action);
    if (res.error) { fail(rows, `${unitId}: ${res.error}`, (paras[0] || {}).plain); return; }
    const scheme = numSchemeOf(st.base ? st.base.blocks : blocks);
    const inAnnex = unitId.startsWith('anx_');
    const record = (fresh, removed) => {
      const newKeys = new Set(fresh.map((b) => b.k));
      for (const b of fresh) st.changes.push({ key: b.k, action: removed.some((x) => x.k === b.k) ? 'replace' : 'insert', row: b.row || rows[0], rows, confidence: conf });
      for (const b of removed) if (!newKeys.has(b.k)) st.changes.push({ key: b.k, action: 'delete', row: rows[0], confidence: conf });
      st.touched = true;
      markRows(unitId, fresh, rows);
      stats.applied++;
    };
    if (ins.action === 'delete') {
      const removed = [];
      for (const key of res.keys) {
        const i = blocks.findIndex((b) => b.k === key);
        if (i < 0) continue;
        removed.push(...blocks.splice(i, (res.subFirst ? i + 1 : subtreeEnd(blocks, i)) - i));
      }
      if (!removed.length) { fail(rows, `${unitId}: Ziel nicht vorhanden`, ''); return; }
      record([], removed);
      return;
    }
    if (ins.action === 'replace') {
      const key = res.keys[0];
      const i = blocks.findIndex((b) => b.k === key);
      const first = paras[0];
      const lab = splitLabel(first.plain, first.html);
      if (res.intro || (res.subFirst && lab.fam === 'U')) {
        // Einleitungsteil bzw. erster Unterabsatz: nur der Text des Blocks (Gliederungszeichen bleibt), allfällige Folgeabsätze als Unterblöcke
        if (res.intro && paras.length !== 1) { fail(rows, `${unitId} ${key}: Einleitungsteil mit mehr als einem Absatz im Wortlaut`, paras.map((x) => x.plain).join(' / ')); return; }
        const nb0 = { ...blocks[i], t: lab.fam !== 'U' ? lab.html : first.html, ...(lab.fam !== 'U' ? { l: lab.l } : {}), o: tag, row: first.row, ...(first.fns && first.fns.length ? { fn: first.fns.map((f) => ({ n: f.n, t: f.t || '' })) } : {}) };
        const removed = [blocks[i]];
        blocks[i] = nb0;
        const fresh = [nb0];
        if (paras.length > 1) {
          const kids = structure(paras.slice(1), { root: key, inAnnex, numScheme: scheme, parentIsText: true }).map((b) => toBlock(b, tag));
          // bestehende gegliederte Unterblöcke vor dem ersten Unterabsatz ersetzen
          let j = i + 1;
          while (j < blocks.length && blocks[j].k.startsWith(key + '.') && !/^s\d/.test(blocks[j].k.slice(key.length + 1).split('.')[0])) j++;
          removed.push(...blocks.splice(i + 1, j - i - 1, ...kids));
          fresh.push(...kids);
        }
        record(fresh, removed);
        return;
      }
      const parent = parentOf(key);
      const seg = segOf(key);
      const isS = /^s\d/.test(seg);
      const isText = !!parent && !/^pt|^h\d/.test(segOf(parent));
      const nb = structure(paras, { root: parent, inAnnex, numScheme: scheme, parentIsText: isText, sStart: isS ? +seg.slice(1) : null });
      const tops = nb.filter((b) => parentOf(b.k) === parent);
      const allowed = new Set(res.keys.map(segOf));
      if (isS) { let n = 0; for (const b of tops.slice(1)) { if (!/^s\d/.test(segOf(b.k))) continue; const old = b.k; const nk = `${key}${'abcdefghij'[n++]}`; for (const x of nb) if (x.k === old || x.k.startsWith(old + '.')) x.k = nk + x.k.slice(old.length); } }
      const tops2 = nb.filter((b) => parentOf(b.k) === parent);
      const bad = tops2.filter((b) => !allowed.has(segOf(b.k)) && !(isS && segOf(b.k).startsWith(seg)));
      if (!tops2.length || bad.length) {
        fail(rows, `${unitId}: Gliederung des Wortlauts (${tops2.map((b) => b.l || segOf(b.k)).join(', ') || 'ohne Gliederungszeichen'}) passt nicht zum Ziel ${res.keys.join(', ')}`, first.plain);
        return;
      }
      let at = i;
      const removed = [];
      for (const k of res.keys) {
        const ii = blocks.findIndex((b) => b.k === k);
        if (ii < 0) continue;
        if (ii < at) at = ii;
        removed.push(...blocks.splice(ii, subtreeEnd(blocks, ii) - ii));
      }
      const fresh = nb.map((b) => toBlock(b, tag));
      blocks.splice(Math.min(at, blocks.length), 0, ...fresh);
      record(fresh, removed);
      return;
    }
    // einfügen / anfügen
    const parent = res.container;
    if (parent && !blocks.some((b) => b.k === parent)) { fail(rows, `${unitId}: Behälter ${parent} nicht vorhanden`, ''); return; }
    const kids = childrenOf(blocks, parent);
    const maxS = Math.max(0, ...kids.map((b) => /^s(\d+)$/.exec(segOf(b.k))).filter(Boolean).map((m) => +m[1]));
    const isText = !!parent && !/^pt|^h\d/.test(segOf(parent));
    const nb = structure(paras, { root: parent, inAnnex, numScheme: scheme, parentIsText: isText, sStart: maxS ? maxS + 1 : null });
    const tops = nb.filter((b) => parentOf(b.k) === parent);
    if (!tops.length) { fail(rows, `${unitId}: Wortlaut ohne einfügbare Gliederung`, paras[0].plain); return; }
    for (const b of tops) {
      const sg = segOf(b.k);
      const fam = famOfSeg(sg);
      if (blocks.some((x) => x.k === b.k)) { fail(rows, `${unitId}: Block ${b.k} besteht im Stand ${base} bereits (einfügen)`, b.t); return; }
      if (res.newSegs && res.newSegs.length !== 0 && !segInExpect(sg, res.newSegs)) { fail(rows, `${unitId}: Gliederungszeichen des Wortlauts (${b.l || sg}) passt nicht zur Anweisung`, b.t); return; }
      if (res.what === 'subparagraph' && fam !== 'U') { fail(rows, `${unitId}: Unterabsatz erwartet, Wortlaut beginnt mit «${b.l}»`, b.t); return; }
      if (res.what === 'paragraph' && !['P', 'N', 'U'].includes(fam)) { fail(rows, `${unitId}: Absatz erwartet, Wortlaut beginnt mit «${b.l || 'Text'}»`, b.t); return; }
      if (res.what === 'point' && !['A', 'N'].includes(fam) && !(fam === 'A' || isRomanSeg(sg))) { fail(rows, `${unitId}: Punkt erwartet, Wortlaut beginnt mit «${b.l || 'Text'}»`, b.t); return; }
      if (res.what === 'indent' && fam !== 'D') { fail(rows, `${unitId}: Gedankenstrich erwartet, Wortlaut beginnt mit «${b.l || 'Text'}»`, b.t); return; }
    }
    const fresh = nb.map((b) => toBlock(b, tag));
    const firstSeg = segOf(tops[0].k);
    const fam = famOfSeg(firstSeg);
    let at;
    if (ins.anchor && !(ins.anchor.art || ins.anchor.annex)) {
      const cont = { ...t }; delete cont.what; delete cont.num; delete cont.list; delete cont.range; delete cont.isNew;
      const anc = resolvePath(blocks, mergeTarget(cont, ins.anchor), 'replace');
      const ai = anc.error ? -1 : blocks.findIndex((b) => b.k === anc.keys[0]);
      if (ai < 0) { fail(rows, `${unitId}: Bezugsstelle «${ins.position} …» nicht auflösbar`, ''); return; }
      at = ins.position === 'before' ? ai : subtreeEnd(blocks, ai);
    } else if (fam === 'U') at = containerEnd(blocks, parent);
    else {
      const sibs = kids.filter((b) => famOfSeg(segOf(b.k)) === fam || (fam === 'P' && famOfSeg(segOf(b.k)) === 'U' && !parent));
      const same = sibs.filter((b) => famOfSeg(segOf(b.k)) === fam);
      const prev = same.filter((b) => cmpSeg(segOf(b.k), firstSeg) < 0).pop();
      const next = same.find((b) => cmpSeg(segOf(b.k), firstSeg) > 0);
      if (prev) at = subtreeEnd(blocks, blocks.indexOf(prev));
      else if (next) at = blocks.indexOf(next);
      else at = containerEnd(blocks, parent);
    }
    blocks.splice(at, 0, ...fresh);
    record(fresh, []);
  }

  function execUnit(p, paras, conf) {
    const { ins } = p;
    const t = p.target;
    const rows = p.rows;
    const pre = t.what === 'annex' ? 'anx_' : 'art_';
    const expectNums = ins.action === 'replace' || ins.action === 'delete' ? (t.list || [t.art || t.annex].filter(Boolean)) : (t.list || (t.num ? [t.num] : null));
    const expectIds = expectNums && expectNums.length ? expectNums.map((n) => pre + n) : null;
    if (ins.action === 'delete') {
      for (const unitId of expectIds || []) {
        const st = unitState(unitId);
        if (!st.exists) { fail(rows, `Einheit ${unitId} im Stand ${base} nicht vorhanden`, ''); continue; }
        st.repealed = true; st.blocks = []; st.touched = true;
        st.changes.push({ key: null, action: 'delete', row: rows[0], rows, confidence: 'high' });
        markRows(unitId, [], rows);
        stats.applied++;
      }
      return;
    }
    const groups = [];
    for (const q of paras) {
      const h = /^(Article|ANNEX|Annex)\s+(\d+[a-z]*|[IVXLC]+[a-z]*)\b\s*(.*)$/.exec(q.plain);
      const isHead = h && (/^article$/i.test(h[1]) ? /^\d/.test(h[2]) : /^[IVXLC]/.test(h[2])) && !/^(of|is|are|shall|thereof|to|and|or|\(|,)/i.test(h[3]) && q.plain.length < 260;
      if (isHead) groups.push({ head: { kind: /^article$/i.test(h[1]) ? 'art' : 'anx', num: h[2], rest: h[3], para: q }, paras: [] });
      else { if (!groups.length) groups.push({ head: null, paras: [] }); groups[groups.length - 1].paras.push(q); }
    }
    if (!groups.length) { fail(rows, 'Anweisung ohne neuen Wortlaut', ''); return; }
    for (const g of groups) {
      let unitId = g.head ? `${g.head.kind}_${g.head.num}` : null;
      if (expectIds && unitId && !expectIds.includes(unitId)) { fail(rows, `Überschrift des Wortlauts (${unitId}) passt nicht zum Ziel der Anweisung (${expectIds.join(', ')})`, g.head.para.plain); continue; }
      unitId = unitId || (expectIds && expectIds.length === 1 ? expectIds[0] : null);
      if (!unitId) { fail(rows, 'Einheit nicht bestimmbar (weder Anweisung noch Wortlaut nennen Artikel oder Anhang)', (paras[0] || {}).plain); continue; }
      const st = unitState(unitId);
      if (ins.action === 'replace' && !st.exists && !st.touched) { fail(rows, `Einheit ${unitId} im Stand ${base} nicht vorhanden (ersetzen)`, ''); continue; }
      if ((ins.action === 'insert' || ins.action === 'add') && st.exists) { fail(rows, `Einheit ${unitId} besteht im Stand ${base} bereits (einfügen)`, ''); continue; }
      const inAnnex = unitId.startsWith('anx_');
      let title = '';
      const bodyParas = g.paras.slice();
      const label = g.head ? (g.head.kind === 'art' ? `Article ${g.head.num}` : `ANNEX ${g.head.num}`) : (st.label || unitLabel(unitId));
      if (g.head) {
        const rest = g.head.rest;
        const headLen = g.head.para.plain.length - rest.length;
        if (inAnnex && /^(PART|Part)\s+[A-Z]/.test(rest)) bodyParas.unshift({ ...g.head.para, plain: rest, html: stripLeadHtml(g.head.para.html, g.head.para.plain.slice(0, headLen)) });
        else if (rest) title = stripLeadHtml(g.head.para.html, g.head.para.plain.slice(0, headLen));
        else if (bodyParas.length && splitLabel(bodyParas[0].plain, bodyParas[0].html).fam === 'U' && bodyParas[0].plain.length < 250 && !/[.;:]$/.test(bodyParas[0].plain) && !/^(PART|Part)\s+[A-Z]\b/.test(bodyParas[0].plain)) title = bodyParas.shift().html;
      } else title = st.title || '';
      const built = structure(bodyParas, { root: '', inAnnex, numScheme: st.base ? numSchemeOf(st.base.blocks) : 'p' }).map((b) => toBlock(b, tag));
      let nb = built;
      if (st.base && ins.action === 'replace') { try { nb = rekey({ [lang]: st.base }, { [lang]: built }).byLang[lang]; } catch { nb = built; } }
      const prev = st.base ? st.base.blocks : [];
      st.blocks = nb.map((b) => { const old = prev.find((x) => x.k === b.k); return old && normCmp(old.t) === normCmp(b.t) && old.ty === b.ty ? { ...b, o: old.o } : b; });
      st.label = label; st.title = title; st.repealed = false; st.touched = true;
      st.changes.push({ key: null, action: ins.action === 'replace' ? 'replace' : 'insert', row: rows[0], rows, confidence: g.head ? conf : 'medium' });
      if (g.head && g.head.para.row && roles[g.head.para.row]) Object.assign(roles[g.head.para.row], { unit: unitId });
      markRows(unitId, st.blocks.filter((b) => b.row), rows);
      stats.applied++;
    }
  }

  function applySubstitute(st, t, ins, rows) {
    if (!ins.words) { fail(rows, 'Wortersetzung: Wörter nicht erkennbar', ''); return; }
    const scope = { ...t, what: t.pt ? 'point' : t.par ? 'paragraph' : 'article' };
    const whole = !t.pt && t.par === undefined && !t.parOrd && !t.sub;
    const res = whole ? { keys: st.blocks.map((b) => b.k) } : resolvePath(st.blocks, scope, 'replace');
    if (res.error) { fail(rows, `${st.unitId}: ${res.error}`, ''); return; }
    let n = 0;
    const from = escT(ins.words.from);
    for (const key of res.keys) {
      const i = st.blocks.findIndex((b) => b.k === key);
      const j = whole ? i + 1 : subtreeEnd(st.blocks, i);
      for (let k = i; k < j; k++) {
        const b = st.blocks[k];
        const cnt = b.t.split(from).length - 1;
        if (cnt) { st.blocks[k] = { ...b, t: b.t.split(from).join(escT(ins.words.to)), o: tag }; n += cnt; st.changes.push({ key: b.k, action: 'replace', row: rows[0], rows, confidence: 'medium' }); }
      }
    }
    if (!n) { fail(rows, `${st.unitId}: Wortersetzung «${ins.words.from}» im Ziel nicht gefunden`, ''); return; }
    st.touched = true; stats.applied++;
    markRows(st.unitId, [], rows);
  }

  // ---------------------------------------------------------- Zeilen durchgehen
  for (const r of sortedRows(dossier)) {
    let c;
    if (docOnly) c = ((dossier.cells[r.id] || {})[track] || []).find((x) => x.doc === docOnly) || null;
    else c = latestCell(dossier, r.id, track);
    if (!c || c.empty || !c.html) continue;
    const paras = cellParagraphs(c.html);
    if (!paras.length) continue;
    stats.rows++;
    const kind = r.path && r.path.kind;
    for (const para of paras) {
      stats.paragraphs++;
      const plain = para.plain;
      if (/^HAVE ADOPTED THIS/i.test(plain)) { zoneArticles = true; if (pending) finalize(); setRole(r.id, 'frame'); stats.frame++; continue; }
      const preamble = !zoneArticles && (kind === 'recital' || kind === 'citation' || kind === 'formula');
      if (!pending || para.labelOnly) heldLabel = null;
      if (pending) {
        const ins = preamble ? { action: 'none' } : parseAmendingInstruction(plain);
        const strongIns = ins.action !== 'none' && ins.strong && (/:\s*$/.test(plain) || ins.inline || ins.action === 'delete' || ins.action === 'rename' || ins.action === 'renumber' || ins.container);
        const bareArticle = /^Article\s+\d+[a-z]*\s*$/.test(plain);
        const unitLevel = pending.target && (pending.target.what === 'article' || pending.target.what === 'annex');
        const hasHead = pending.paras.some((x) => /^(Article|ANNEX)\s+\S+/.test(x.plain));
        const finalClause = /^(This Regulation shall enter into force|This Regulation shall be binding|Done at\b|For the European Parliament|For the Council)/i.test(plain) || /^(?:Article\s+\d+[a-z]*\s+)?Amendments?\s+to\s+(?:Council\s+)?(?:Regulation|Directive|Decision)\b/i.test(plain);
        if (strongIns || finalClause || preamble) finalize();
        else if (pending.quoteClosed && !OPEN_RE.test(plain)) finalize();
        else if (bareArticle && (!unitLevel || (hasHead && !pending.target.list))) finalize();
        else if (para.labelOnly) { heldLabel = { para, row: r.id }; continue; }
        else {
          if (heldLabel) {
            // gestrichener Absatz, nur Gliederungszeichen stehen geblieben: gehört zum folgenden Absatz, wenn dieser keines hat
            if (splitLabel(plain, para.html).fam === 'U') { addWording(`${heldLabel.para.plain} ${plain}`, r.id, { ...para, html: `${heldLabel.para.html} ${para.html}` }); heldLabel = null; continue; }
            heldLabel = null;
          }
          addWording(plain, r.id, para); continue;
        }
      }
      if (para.labelOnly) continue;
      if (preamble) { setRole(r.id, 'frame'); stats.frame++; continue; }
      const ins = parseAmendingInstruction(plain);
      if (ins.action !== 'none') { zoneArticles = true; handleInstruction(ins, r.id, plain); continue; }
      const am = /^(?:Article\s+\d+[a-z]*\s+)?Amendments?\s+to\s+(?:Council\s+)?(?:Regulation|Directive|Decision)\s+\((?:EU|EC|EEC)\)\s*(?:No\s*)?(\d{1,4}\/\d{1,4})/i.exec(plain);
      if (am) { actCtx = am[1] === ACT ? ACT : 'other'; ctx = []; setRole(r.id, 'frame'); stats.frame++; continue; }
      if (/^Article\s+\d+[a-z]*\b/.test(plain) && plain.length < 200) { ctx = []; actCtx = null; setRole(r.id, 'frame'); stats.frame++; continue; }
      setRole(r.id, 'frame'); stats.frame++;
    }
  }
  if (pending) finalize();

  const outUnits = {};
  for (const [unitId, st] of units) {
    if (!st.touched) continue;
    const meta = { dossier: dossier.id, track, doc: docOnly, base };
    const pv = st.repealed
      ? { stage: tag, label: st.label || unitLabel(unitId), title: st.title || '', blocks: [], repealed: true, preview: meta }
      : { stage: tag, label: st.label || unitLabel(unitId), title: st.title || '', blocks: st.blocks.map(cleanOut), preview: meta };
    outUnits[unitId] = { baseVersion: st.base, previewVersion: pv, changes: st.changes };
  }
  return { base, track, doc: docOnly, units: outUnits, unresolved, roles, stats };
}

function unitLabel(unitId) {
  const m = /^(art|anx)_(.+)$/.exec(unitId);
  return m ? (m[1] === 'art' ? `Article ${m[2]}` : `ANNEX ${m[2]}`) : unitId;
}
function toBlock(b, tag) {
  const o = { k: b.k, d: b.d, l: b.l || '', t: b.t, o: tag };
  if (b.ty) o.ty = b.ty;
  const fns = (b.fns || []).filter((f) => f && f.n);
  if (fns.length) o.fn = fns.map((f) => ({ n: f.n, t: f.t || '' }));
  if (b.row) o.row = b.row;
  return o;
}
function cleanOut(b) {
  const o = { k: b.k, d: b.d, l: b.l || '', t: b.t, o: b.o };
  for (const f of ['ty', 'html', 'asset', 'fn', 'x', 'nt', 'ch']) if (b[f] !== undefined) o[f] = b[f];
  if (b.row) o.row = b.row;
  return o;
}

// ------------------------------------------------------------------ rows[].amends füllen

/**
 * rows[].amends belegt füllen: nur was die Vorschau sicher auflöst (Spuren agreement, council, ep, com; die erste Spur, die eine
 * Zeile auflöst, gilt). Zeilen mit Rolle "instruction" oder "wording" und aufgelöster Einheit → { work, unit, key?, source:"preview" }
 * (key = erster betroffener Block). Alle übrigen Zeilen: amends = null (bisherige Einträge aus der Fundstelle des Parsers sind
 * Näherungen und werden verworfen; Anzahl in stats.dropped).
 * Mehrere Werke (z. B. Screening ändert VIS, EES, ETIAS, Interoperabilität): opts.works = [ { work, act, dataset, baseStage? } ];
 * sonst ein Werk: dataset mit opts { work:"sgk", act:"2016/399", baseStage? }. dataset null und keine works: alle amends null.
 * Rückgabe { dossier, stats:{ preview, dropped, rows, byWork } }.
 */
export function annotateAmends(dossier, dataset, opts = {}) {
  const works = opts.works || (dataset ? [{ work: opts.work || 'sgk', act: opts.act || '2016/399', dataset, baseStage: opts.baseStage }] : []);
  const tracks = opts.tracks || ['agreement', 'council', 'ep', 'com'].filter((t) => dossier.tracks.some((x) => x.id === t));
  const found = new Map();
  for (const w of works) {
    for (const track of tracks) {
      const pv = buildPreview(dossier, { track }, w.dataset, { lang: opts.lang || 'en', act: w.act, ...(w.baseStage ? { baseStage: w.baseStage } : {}) });
      for (const [rid, info] of Object.entries(pv.roles)) {
        if (found.has(rid)) continue;
        if ((info.role === 'instruction' || info.role === 'wording') && info.unit && !info.unresolved) found.set(rid, { work: w.work, unit: info.unit, ...(info.key && info.key !== '_title' ? { key: info.key } : {}), source: 'preview' });
      }
    }
  }
  const stats = { preview: 0, dropped: 0, rows: dossier.rows.length, byWork: {} };
  const rows = dossier.rows.map((r) => {
    const a = found.get(r.id);
    if (a) { stats.preview++; stats.byWork[a.work] = (stats.byWork[a.work] || 0) + 1; return { ...r, amends: a }; }
    if (r.amends) { stats.dropped++; return { ...r, amends: null }; }
    return r;
  });
  return { dossier: { ...dossier, rows }, stats };
}
