// SGK-Navigator — Verweisnetz (ESM, isomorph, ohne Abhaengigkeit von src/app)
//
// extractRefs(text, lang, ctx) -> [ { start, end, text, target, targets?, uncertain? } ]
//   text: Klartext eines Blocks (Tags entfernt, siehe plainText); ctx: { work, unit, key, keysOf?, toc?, unitType? }
//   target: { work, unit, key, kind: "internal"|"external", label, instrument?, rest? }
//   targets: nur bei Bereichen («Artikel 23 bis 28»): alle Ziele des Bereichs (inklusive Anfang und Ende)
// buildRefIndex(dataset, lang, stageId, { worksIndex, datasets? }) -> { out, in, external, stats }
// linkifyHtml(blockHtml, refs) -> html     setzt <a data-ref> um die Fundstellen; der Wortlaut bleibt unveraendert
// plainText(html) -> string                Klartext, auf den sich start/end beziehen
//
// Grundsaetze: nichts raten. Was nicht sicher aufloesbar ist, kommt mit target.unit = null und uncertain: true zurueck.
// Selbstverweise ohne weitere Angabe («dieser Artikel», «diese Verordnung») gelten nicht als Verweis.

import { getVersion } from './model.js';

// ------------------------------------------------------------------ Klartext

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
function decodeEntity(e) {
  const n = e.slice(1, -1);
  if (ENT[n] !== undefined) return ENT[n];
  if (/^#x[0-9a-f]+$/i.test(n)) return String.fromCodePoint(parseInt(n.slice(2), 16));
  if (/^#\d+$/.test(n)) return String.fromCodePoint(parseInt(n.slice(1), 10));
  return e;
}
const TOKEN_RE = /<[^>]*>|&(?:[a-z]+|#\d+|#x[0-9a-f]+);/gi;

// Klartext eines Inline-HTML: Tags entfernt (<br> = Leerzeichen), Entitaeten aufgeloest
export function plainText(html) {
  let out = '';
  let last = 0;
  const s = String(html || '');
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(s))) {
    out += s.slice(last, m.index);
    if (m[0][0] === '<') { if (/^<br\b/i.test(m[0])) out += ' '; }
    else out += decodeEntity(m[0]);
    last = m.index + m[0].length;
  }
  return out + s.slice(last);
}

// ------------------------------------------------------------------ Ebenen

// Rang: je kleiner, desto hoeher in der Gliederung
const RANK = { work: 0, tit: 0.5, cha: 0.7, sec: 0.8, art: 1, anx: 1, part: 2, par: 2, sub: 3, num: 3.5, pt: 4, ptx: 4, ptu: 4, rom: 5, indent: 6, sen: 7 };
const UNIT_TYPES = new Set(['art', 'anx']);
const DIV_TYPES = new Set(['tit', 'cha', 'sec']);
const rank = (c) => RANK[c.t];

const FR_SUF = { bis: 'a', ter: 'b', quater: 'c', quinquies: 'd', sexies: 'e', septies: 'f', octies: 'g', nonies: 'h', decies: 'i' };
const ORD = {
  de: { erste: 1, ersten: 1, erster: 1, zweite: 2, zweiten: 2, zweiter: 2, dritte: 3, dritten: 3, dritter: 3, vierte: 4, vierten: 4, vierter: 4, fünfte: 5, fünften: 5, fünfter: 5, sechste: 6, sechsten: 6, sechster: 6, letzte: -1, letzten: -1, letzter: -1 },
  fr: { premier: 1, première: 1, '1er': 1, deuxième: 2, second: 2, seconde: 2, troisième: 3, quatrième: 4, cinquième: 5, sixième: 6, septième: 7, dernier: -1, dernière: -1 },
  en: { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, last: -1 },
};
const ROMAN_ONLY = /^(?:i{1,3}|iv|vi{0,3}|ix|xi{0,3}|xiv|xvi{0,3}|xix|xx)$/;
const ROMAN_SUF = /^(?:i{1,3}|iv|vi{0,3}|ix|xi{0,3}|xiv|xvi{0,3}|xix|xx)[a-z]?$/;

// ------------------------------------------------------------------ Rechtsakte

// Benannte Instrumente ohne eindeutige CELEX werden mit instrument-Code gefuehrt
const NAMED = {
  CISA: { celex: '42000A0922(02)', label: { de: 'SDÜ', fr: 'CAAS', en: 'CISA' } },
  SA: { celex: '42000A0922(01)', label: { de: 'Übereinkommen von Schengen', fr: 'accord de Schengen', en: 'Schengen Agreement' } },
  TFEU: { celex: null, label: { de: 'AEUV', fr: 'TFUE', en: 'TFEU' } },
  TEU: { celex: null, label: { de: 'EUV', fr: 'TUE', en: 'TEU' } },
  CFR: { celex: null, label: { de: 'Charta', fr: 'Charte', en: 'Charter' } },
};

function fullYear(y) {
  const n = parseInt(y, 10);
  if (y.length === 4) return n;
  if (y.length === 2) return n >= 50 ? 1900 + n : 2000 + n;
  return null;
}

// CELEX aus Aktbezeichnung; kind: R (Verordnung), L (Richtlinie), D (Beschluss/Entscheidung), F (Rahmenbeschluss), H (Empfehlung)
export function celexOf(kind, a, b, hasNo) {
  // hasNo: Schreibweise «Nr. N/JJJJ» (Nummer vor Jahr); sonst «JJJJ/N»
  let year, num;
  if (hasNo) { num = a; year = b; } else { year = a; num = b; }
  const y = fullYear(year);
  if (!y || y < 1950 || y > 2100) return null;
  const n = parseInt(num, 10);
  if (!n || n > 9999) return null;
  return '3' + y + kind + String(n).padStart(4, '0');
}

const KIND_WORD = {
  de: (w) => /^Durchführungsverordnung|^Verordnung|Delegierte/.test(w) ? 'R' : /^Richtlinie/.test(w) ? 'L' : /^Rahmenbeschluss/.test(w) ? 'F' : /^Empfehlung/.test(w) ? 'H' : 'D',
  fr: (w) => /^règlement/i.test(w) ? 'R' : /^directive/i.test(w) ? 'L' : /^décision-cadre/i.test(w) ? 'F' : /^recommandation/i.test(w) ? 'H' : 'D',
  en: (w) => /Regulation$/.test(w) ? 'R' : /Directive$/.test(w) ? 'L' : /Framework/.test(w) ? 'F' : /Recommendation$/.test(w) ? 'H' : 'D',
};

// ------------------------------------------------------------------ Sprachgrammatik

const SP = '[\\s\\u00a0\\u202f]+';
const APO = "[’']";

// Einschub mit Bezeichnung in Anfuehrungszeichen: «Teil B1 („Visum nicht erforderlich“) und Teil B2»
const ASIDE = '\\s*\\(\\s*[„“"‚‘\'«][^()]{0,80}\\)';
const ASIDE_Y = new RegExp(ASIDE, 'yu');
function listRe(val, seps) {
  // val ( sep val )*  — sep muss von einem Wert gefolgt sein
  return `(?:${val})(?:${ASIDE})?(?:(?:\\s*,\\s*(?:(?:${seps})${SP})?|${SP}(?:${seps})${SP})(?:${val})(?:${ASIDE})?)*`;
}

function mk(src, flags = 'yu') { return new RegExp(src, flags); }

const G = {};

// ---- Deutsch
{
  const ART = '\\d+[a-z]{0,2}(?![\\p{L}\\d/])|[IVX]+(?![\\p{L}\\d])';
  const PAR = '\\d+(?:\\.\\d+)+(?![\\p{L}\\d/])|\\d+[a-z]?(?![\\p{L}\\d/])';
  // Zweibuchstabige Funktionswoerter sind keine Buchstabenwerte («Buchstaben a und b und in Artikel 18»)
  const NOTW = '(?!(?:in|im|an|am|zu|um|so|es|ob|ab|je|er|wo|da)(?![\\p{L}\\d)]))';
  const LET = `${NOTW}[a-z]{1,2}(?![\\p{L}\\d)])`;
  const ROM = '[ivxl]+[a-h]?(?:\\)|(?![\\p{L}\\d)]))|\\d+(?![\\p{L}\\d/])';
  const NUM = '\\d+(?:\\.\\d+)*[a-z]?(?![\\p{L}\\d/])(?:\\.(?=\\s*(?:,|und|oder|bis|et|ou|à|and|or|to)\\s))?';
  const RUP = '[IVXL]+[a-z]?(?![\\p{L}\\d])';
  const SEPS = 'und|oder|bis|sowie|bzw\\.|beziehungsweise';
  const ORDW = Object.keys(ORD.de).join('|');
  G.de = {
    start: /(?<![\p{L}\d])(?:Artikel|Artikels|Artikeln|Art\.|Absatz|Absatzes|Absätze|Absätzen|Unterabsatz|Unterabsatzes|Unterabsätze|Unterabsätzen|Buchstabe|Buchstaben|Buchstabens|Ziffer|Ziffern|Nummer|Nummern|Anhang|Anhangs|Anhanges|Anhänge|Anhängen|Teil|Teils|Titel|Titels|Kapitel|Kapitels|Abschnitt|Abschnitts|Satz|Sätze|Satzes|Kennbuchstabe|Kennbuchstaben|Gedankenstrich|Gedankenstrichs|Gedankenstriche|Durchführungsverordnung|Durchführungsbeschluss|Durchführungsbeschlusses|Delegierten|Delegierte|Verordnung|Richtlinie|Rahmenbeschluss|Rahmenbeschlusses|Beschluss|Beschlusses|Entscheidung|Empfehlung|Übereinkommens|Übereinkommen|Schengener|AEUV|EUV|Charta|Vertrag|Vertrags|Vertrages|erste|ersten|erster|zweite|zweiten|zweiter|dritte|dritten|dritter|vierte|vierten|vierter|fünften|fünfter|letzten|letzter)(?![\p{L}])/gu,
    items: [
      { t: 'art', re: mk(`(?:Artikel|Artikels|Artikeln|Art\\.)${SP}(${listRe(ART, SEPS)})`), val: new RegExp(ART, 'gu') },
      { t: 'par', re: mk(`(?:Absatz|Absatzes|Absätze|Absätzen|Abs\\.)${SP}(${listRe(PAR, SEPS)})`), val: new RegExp(PAR, 'gu') },
      { t: 'sub', re: mk(`(?:Unterabsatz|Unterabsatzes|Unterabsätze|Unterabsätzen|Unterabs\\.)${SP}(${listRe('\\d+(?![\\p{L}\\d/])', SEPS)})`), val: /\d+/gu },
      { t: 'sub', ord: true, re: mk(`(${listRe(`(?:${ORDW})`, 'und|oder')})${SP}(?:Unterabsatz|Unterabsatzes|Unterabsätze|Unterabsätzen)(?![\\p{L}])`), val: new RegExp(`(?:${ORDW})`, 'gu') },
      { t: 'pt', re: mk(`(?:Buchstabe|Buchstaben|Buchstabens|Bst\\.)${SP}(${listRe(LET, SEPS)})`), val: new RegExp(LET, 'gu') },
      { t: 'ptu', re: mk(`(?:Buchstabe|Buchstaben)${SP}([A-Z](?![\\p{L}\\d)]))`), val: /[A-Z]/gu },
      { t: 'ptu', re: mk(`(?:Kennbuchstabe|Kennbuchstaben)${SP}(${listRe('[A-Z](?![\\p{L}\\d)])', SEPS)})`), val: /[A-Z]/gu },
      { t: 'rom', re: mk(`(?:Ziffer|Ziffern|Ziff\\.)${SP}(${listRe(ROM, SEPS)})`), val: new RegExp(ROM, 'gu') },
      { t: 'num', re: mk(`(?:Nummer|Nummern)${SP}(${listRe(NUM, SEPS)})`), val: new RegExp(NUM, 'gu') },
      { t: 'sen', re: mk(`(?:Satz|Sätze|Satzes)${SP}(${listRe('\\d+(?![\\p{L}\\d/])', SEPS)})`), val: /\d+/gu },
      { t: 'sen', ord: true, re: mk(`(${listRe(`(?:${ORDW})`, 'und|oder')})${SP}(?:Satz|Satzes|Sätze)(?![\\p{L}])`), val: new RegExp(`(?:${ORDW})`, 'gu') },
      { t: 'indent', ord: true, re: mk(`(${listRe(`(?:${ORDW})`, 'und|oder')})${SP}(?:Gedankenstrich|Gedankenstrichs|Gedankenstriches|Gedankenstriche)(?![\\p{L}])`), val: new RegExp(`(?:${ORDW})`, 'gu') },
      { t: 'anx', re: mk(`(?:Anhang|Anhangs|Anhanges|Anhänge|Anhängen)${SP}(${listRe(RUP, SEPS)})`), val: new RegExp(RUP, 'gu') },
      { t: 'part', re: mk(`(?:Teil|Teils|Teile|Teilen)${SP}(${listRe('[A-Z]\\d?(?![\\p{L}\\d])', SEPS)})`), val: /[A-Z]\d?/gu },
      { t: 'tit', re: mk(`(?:Titel|Titels)${SP}([IVX]+)(?![\\p{L}\\d])`), val: /[IVX]+/gu },
      { t: 'cha', re: mk(`(?:Kapitel|Kapitels)${SP}([IVX]+)(?![\\p{L}\\d])`), val: /[IVX]+/gu },
      { t: 'sec', re: mk(`(?:Abschnitt|Abschnitts|Abschnittes)${SP}(\\d+)(?![\\p{L}\\d])`), val: /\d+/gu },
    ],
    rel: [
      { r: 'art', re: mk(`(?:dieses|des${SP}vorliegenden)${SP}Artikels|(?:diesem|dem${SP}vorliegenden)${SP}Artikel(?![\\p{L}])`) },
      { r: 'par', re: mk(`(?:dieses|des${SP}vorliegenden)${SP}(?:Absatzes|Unterabsatzes)|(?:diesem|dem${SP}vorliegenden)${SP}(?:Absatz|Unterabsatz)(?![\\p{L}])`) },
      { r: 'pt', re: mk(`(?:dieses|des${SP}vorliegenden)${SP}Buchstabens|(?:diesem|dem${SP}vorliegenden)${SP}Buchstaben(?![\\p{L}])`) },
      { r: 'rom', re: mk(`(?:dieser|der${SP}vorliegenden)${SP}Ziffer(?![\\p{L}])`) },
      { r: 'anx', re: mk(`(?:dieses|des${SP}vorliegenden)${SP}(?:Anhangs|Anhanges)|(?:diesem|dem${SP}vorliegenden)${SP}Anhang(?![\\p{L}])`) },
      { r: 'part', re: mk(`(?:dieses|des${SP}vorliegenden)${SP}Teils(?![\\p{L}])`) },
      { r: 'prevArt', re: mk(`(?:des${SP}genannten|des${SP}vorgenannten|jenes|desselben)${SP}Artikels(?![\\p{L}])`) },
    ],
    acts: [
      { re: mk(`((?:Delegierten?${SP})?(?:Durchführungsverordnung|Durchführungsbeschlusses|Durchführungsbeschluss|Verordnung|Richtlinie|Rahmenbeschlusses|Rahmenbeschluss|Beschlusses|Beschluss|Entscheidung|Empfehlung))${SP}(?:\\((EU|EG|EWG|Euratom|EGKS)\\)${SP})?(?:(Nr\\.)(?:${SP})?)?(\\d{1,4})\\/(\\d{1,4})(?:\\/(EG|EU|EWG|JI|GASP|Euratom))?(?![\\d/])`), num: true },
      { re: mk(`(?:dieser|der${SP}vorliegenden|vorliegender|dieselbe)${SP}Verordnung(?![\\p{L}])`), self: true },
      { re: mk(`(?:jenes|des${SP}genannten|des${SP}vorgenannten|desselben)${SP}Protokolls(?![\\p{L}])`), prev: true },
      { re: mk(`(?:jener|der${SP}genannten|der${SP}vorgenannten|derselben)${SP}(?:Verordnung|Richtlinie|Entscheidung|Durchführungsverordnung)(?![\\p{L}])|(?:jenes|des${SP}genannten|des${SP}vorgenannten|desselben)${SP}(?:Beschlusses|Übereinkommens|Durchführungsbeschlusses)(?![\\p{L}])`), prev: true },
      { re: mk(`Übereinkommens?${SP}zur${SP}Durchführung${SP}des${SP}Übereinkommens${SP}von${SP}Schengen(?:${SP}vom${SP}14\\.${SP}Juni${SP}1985)?`), named: 'CISA' },
      { re: mk(`Schengener${SP}Durchführungsübereinkommens?`), named: 'CISA' },
      { re: mk(`Übereinkommens?${SP}von${SP}Schengen(?:${SP}vom${SP}14\\.${SP}Juni${SP}1985)?`), named: 'SA' },
      { re: mk('AEUV(?![\\p{L}])'), named: 'TFEU' },
      { re: mk(`Vertrags?${SP}über${SP}die${SP}Arbeitsweise${SP}der${SP}Europäischen${SP}Union`), named: 'TFEU' },
      { re: mk('EUV(?![\\p{L}])'), named: 'TEU' },
      { re: mk(`Vertrag(?:s|es)?${SP}über${SP}die${SP}Europäische${SP}Union`), named: 'TEU' },
      { re: mk(`Charta(?:${SP}der${SP}Grundrechte(?:${SP}der${SP}Europäischen${SP}Union)?)?(?![\\p{L}])`), named: 'CFR' },
    ],
    and: mk(`\\s*(?<![\\p{L}])(?:und\\/oder|und|oder|sowie|bzw\\.|beziehungsweise)${SP}`),
    comma: mk('\\s*,\\s*'),
    glue: mk(`(?:\\s*(?<![\\p{L}])(?:der|des|den|dem|die|in|nach|gemäß|gemäss)(?=${SP}))+`),
    ws: mk(SP),
    aside: mk(`\\s*\\(\\s*[„“"‚‘'«][^()]{0,80}\\)`),
    gen: /(?<![\p{L}])(?:des|der)$/u,
    skip: null,
    poss: mk(`\\s*(?<![\\p{L}])(?:deren|dessen)(?=${SP})`),
    possBefore: /(?<![\p{L}])(?:deren|dessen)[\s\u00a0]+$/u,
    thereof: null,
    unknownActLong: mk(`${SP}(?:des|der)${SP}[^;:.,()]{0,120}?(?<![\\p{L}])(?:Protokolls|Übereinkommens|Abkommens|Vertrags|Vertrages|Beschlusses|Rahmenbeschlusses|Akte|Akts)(?![\\p{L}])`),
    unknownAct: mk(`(?:\\s*,)?(?:\\s*(?<![\\p{L}])(?:der|des|den|dem|die)(?=${SP}))+${SP}(?:[\\p{L}\\d-]+${SP}){0,2}?[\\p{L}-]*?(?:Verordnung|verordnung|Richtlinie|richtlinie|Beschlusses|beschlusses|Beschluss|beschluss|Entscheidung|entscheidung|Übereinkommens|übereinkommens|Übereinkommen|übereinkommen|Abkommens|abkommens|Abkommen|abkommen|Vertrags|vertrags|Vertrages|vertrages|Protokolls|protokolls|Protokolles|Akte|akte|Akts|Kodex|Kodexes)(?![\\p{L}])`),
    sepRange: /^(?:bis)$/,
    listSep: mk(`\\s*,\\s*(?:(?:${SEPS})${SP})?|${SP}(?:${SEPS})${SP}`),
  };
}

// ---- Französisch
{
  const SUFW = 'bis|ter|quater|quinquies|sexies|septies|octies|nonies|decies';
  const ART = `\\d+(?:er)?(?:${SP}(?:${SUFW}))?(?![\\p{L}\\d/])|[IVX]+(?![\\p{L}\\d])`;
  const PAR = `\\d+(?:${SP}(?:bis|ter|quater))?(?![\\p{L}\\d/])`;
  const PTV = `[a-z]{1,4}(?:${SP}(?:bis|ter|quater))?\\)(?:${SP}[ivxl]+(?:${SP}(?:bis|ter|quater))?\\))?|\\d+(?:\\.\\d+)*\\)?(?:${SP}[a-z]{1,2}\\))?(?![\\p{L}\\d/])(?:\\.(?=\\s*(?:,|und|oder|bis|et|ou|à|and|or|to)\\s))?`;
  const RUP = `[IVXL]+(?:${SP}(?:bis|ter))?(?![\\p{L}\\d])`;
  const SEPS = 'et|ou|à';
  const ORDW = Object.keys(ORD.fr).join('|');
  G.fr = {
    start: /(?<![\p{L}\d])(?:[Aa]rticles?|art\.|paragraphes?|par\.|points?|[Aa]nnexes?|[Pp]arties?|titre|chapitre|section|premier|première|1er|deuxième|second|seconde|troisième|quatrième|cinquième|sixième|dernier|dernière|règlement|directive|décision|décision-cadre|recommandation|convention|accord|traité|TFUE|TUE|[Cc]harte)(?![\p{L}])/gu,
    items: [
      { t: 'art', re: mk(`(?:[Aa]rticles?|art\\.)${SP}(${listRe(ART, SEPS)})`), val: new RegExp(ART, 'gu') },
      { t: 'par', re: mk(`(?:paragraphes?|par\\.)${SP}(${listRe(PAR, SEPS)})`), val: new RegExp(`\\d+(?:${SP}(?:bis|ter|quater))?`, 'gu') },
      { t: 'sub', ord: true, re: mk(`(${listRe(`(?:${ORDW})`, 'et|ou')})${SP}alinéas?(?![\\p{L}])`), val: new RegExp(`(?:${ORDW})`, 'gu') },
      { t: 'ptu', re: mk(`points?${SP}(${listRe('[A-Z](?![\\p{L}\\d)])', SEPS)})`), val: /[A-Z]/gu },
      { t: 'ptx', re: mk(`points?${SP}(${listRe(PTV, SEPS)})`), val: new RegExp(PTV, 'gu') },
      { t: 'indent', ord: true, re: mk(`(${listRe(`(?:${ORDW})`, 'et|ou')})${SP}tirets?(?![\\p{L}])`), val: new RegExp(`(?:${ORDW})`, 'gu') },
      { t: 'sen', ord: true, re: mk(`(${listRe(`(?:${ORDW})`, 'et|ou')})${SP}phrases?(?![\\p{L}])`), val: new RegExp(`(?:${ORDW})`, 'gu') },
      { t: 'anx', re: mk(`[Aa]nnexes?${SP}(${listRe(RUP, SEPS)})`), val: new RegExp(`[IVXL]+(?:${SP}(?:bis|ter))?`, 'gu') },
      { t: 'part', re: mk(`[Pp]arties?${SP}(${listRe('[A-Z]\\d?(?![\\p{L}\\d])', SEPS)})`), val: /[A-Z]\d?/gu },
      { t: 'tit', re: mk(`titre${SP}([IVX]+)(?![\\p{L}\\d])`), val: /[IVX]+/gu },
      { t: 'cha', re: mk(`chapitre${SP}([IVX]+)(?![\\p{L}\\d])`), val: /[IVX]+/gu },
      { t: 'sec', re: mk(`section${SP}(\\d+)(?![\\p{L}\\d])`), val: /\d+/gu },
    ],
    rel: [
      { r: 'art', re: mk(`présent${SP}article(?![\\p{L}])`) },
      { r: 'par', re: mk(`présent${SP}(?:paragraphe|alinéa)(?![\\p{L}])`) },
      { r: 'pt', re: mk(`présent${SP}point(?![\\p{L}])`) },
      { r: 'anx', re: mk(`présente${SP}annexe(?![\\p{L}])`) },
      { r: 'part', re: mk(`présente${SP}partie(?![\\p{L}])`) },
      { r: 'prevArt', re: mk(`(?:dudit|ledit|audit|du${SP}même)${SP}article(?![\\p{L}])`) },
    ],
    acts: [
      { re: mk(`(règlement${SP}d${APO}exécution|règlement${SP}délégué|décision${SP}d${APO}exécution|décision-cadre|règlement|directive|décision|recommandation)${SP}(?:\\((UE|CE|CEE|Euratom|CECA)\\)${SP})?(?:(n(?:${SP})?[°ºo]\\.?)(?:${SP})?)?(\\d{1,4})\\/(\\d{1,4})(?:\\/(CE|UE|CEE|JAI|PESC|Euratom))?(?![\\d/])`), num: true },
      { re: mk(`présent${SP}règlement(?![\\p{L}])`), self: true },
      { re: mk(`(?:dudit|ledit|audit|du${SP}même)${SP}protocole(?![\\p{L}])`), prev: true },
      { re: mk(`(?:dudit|ledit|audit|du${SP}même|de${SP}ce|ce)${SP}(?:règlement|décision)(?![\\p{L}])|(?:ladite|de${SP}ladite|à${SP}ladite|de${SP}la${SP}même|cette)${SP}(?:directive|décision|convention)(?![\\p{L}])|(?:dudit|ledit|audit)${SP}(?:accord|traité)(?![\\p{L}])`), prev: true },
      { re: mk(`convention${SP}d${APO}application${SP}de${SP}l${APO}accord${SP}de${SP}Schengen(?:${SP}du${SP}14${SP}juin${SP}1985)?`), named: 'CISA' },
      { re: mk(`convention${SP}de${SP}Schengen(?![\\p{L}])`), named: 'CISA' },
      { re: mk(`accord${SP}de${SP}Schengen(?:${SP}du${SP}14${SP}juin${SP}1985)?`), named: 'SA' },
      { re: mk('TFUE(?![\\p{L}])'), named: 'TFEU' },
      { re: mk(`traité${SP}sur${SP}le${SP}fonctionnement${SP}de${SP}l${APO}Union${SP}européenne`), named: 'TFEU' },
      { re: mk('TUE(?![\\p{L}])'), named: 'TEU' },
      { re: mk(`traité${SP}sur${SP}l${APO}Union${SP}européenne`), named: 'TEU' },
      { re: mk(`[Cc]harte(?:${SP}des${SP}droits${SP}fondamentaux(?:${SP}de${SP}l${APO}Union${SP}européenne)?)?(?![\\p{L}])`), named: 'CFR' },
    ],
    and: mk(`\\s*(?<![\\p{L}])(?:et\\/ou|et|ou|ainsi${SP}que)${SP}`),
    comma: mk('\\s*,\\s*'),
    glue: mk(`(?:\\s*(?<![\\p{L}])(?:de${SP}l${APO}|à${SP}l${APO}|d${APO}|l${APO}|de${SP}la(?=${SP})|à${SP}la(?=${SP})|(?:du|des|de|au|aux|à|le|la|les)(?=${SP})))+`),
    ws: mk(SP),
    aside: mk(`\\s*\\(\\s*[„“"‚‘'«][^()]{0,80}\\)`),
    gen: /(?<![\p{L}])(?:du|des|de|de\s+la|de\s+l[’']|d[’'])$/u,
    skip: mk(`\\s*,?\\s*respectivement\\s*,?`),
    poss: mk(`(?:\\s*(?<![\\p{L}])(?:à|de)(?=${SP}))?${SP}(?:son|sa|ses)(?=${SP})`),
    possBefore: /(?<![\p{L}])(?:son|sa|ses)[\s\u00a0]+$/u,
    thereof: null,
    unknownAct: mk(`(?:\\s*,)?\\s*(?<![\\p{L}])(?:du|de${SP}la|de${SP}l${APO}|des|de|à${SP}la|au)(?:${SP})?(?:[\\p{L}-]+${SP}){0,2}?(?:règlement|directive|décision|convention|accord|traité|protocole|acte|code)(?![\\p{L}])`),
    sepRange: /^(?:à)$/,
    listSep: mk(`\\s*,\\s*(?:(?:${SEPS})${SP})?|${SP}(?:${SEPS})${SP}`),
  };
}

// ---- Englisch
{
  const PAREN = '\\((?:\\d+[a-z]?|[a-z]{1,5})\\)';
  const ART = `\\d+[a-z]{0,2}(?:${PAREN})*(?![\\p{L}\\d/])|[IVX]+(?![\\p{L}\\d(])|(?:${PAREN})+`;
  const PAR = `\\d+[a-z]?(?: ?\\([a-z]{1,5}\\))*(?![\\p{L}\\d/])|\\(\\d+[a-z]?\\)(?:\\([a-z]{1,5}\\))*|(?:\\([a-z]{1,5}\\))+`;
  const PTV = `(?:\\([a-z]{1,5}\\))+|\\(?\\d+(?:\\.\\d+)*\\)?(?:\\([a-z]{1,5}\\))*(?![\\p{L}\\d/])(?:\\.(?=\\s*(?:,|und|oder|bis|et|ou|à|and|or|to)\\s))?`;
  const RUP = '[IVXL]+[a-z]?(?![\\p{L}\\d])';
  const SEPS = 'and|or|to';
  const ORDW = Object.keys(ORD.en).join('|');
  G.en = {
    start: /(?<![\p{L}\d])(?:Articles?|Art\.|paragraphs?|[Ss]ubparagraphs?|points?|Annex|Annexes|[Pp]arts?|Title|Chapter|Section|first|second|third|fourth|fifth|sixth|last|Implementing|Delegated|Framework|Council|Commission|Regulation|Directive|Decision|Recommendation|Convention|Schengen|TFEU|TEU|Treaty|Charter)(?![\p{L}])/gu,
    items: [
      { t: 'art', re: mk(`(?:Articles?|Art\\.)${SP}(${listRe(ART, SEPS)})`), val: new RegExp(ART, 'gu') },
      { t: 'par', re: mk(`paragraphs?${SP}(${listRe(PAR, SEPS)})`), val: new RegExp(PAR, 'gu') },
      { t: 'sub', ord: true, re: mk(`(${listRe(`(?:${ORDW})`, 'and|or')})${SP}subparagraphs?(?![\\p{L}])`), val: new RegExp(`(?:${ORDW})`, 'gu') },
      { t: 'sub', re: mk(`[Ss]ubparagraphs?${SP}(${listRe('\\d+(?![\\p{L}\\d/])', SEPS)})`), val: /\d+/gu },
      { t: 'sub', ord: true, re: mk(`(${listRe(`(?:${ORDW})`, 'and|or')})${SP}paragraphs?(?![\\p{L}])`), val: new RegExp(`(?:${ORDW})`, 'gu') },
      { t: 'ptu', re: mk(`points?${SP}(${listRe('[A-Z](?![\\p{L}\\d)])', SEPS)})`), val: /[A-Z]/gu },
      { t: 'ptx', re: mk(`points?${SP}(${listRe(PTV, SEPS)})`), val: new RegExp(PTV, 'gu') },
      { t: 'indent', ord: true, re: mk(`(${listRe(`(?:${ORDW})`, 'and|or')})${SP}indents?(?![\\p{L}])`), val: new RegExp(`(?:${ORDW})`, 'gu') },
      { t: 'sen', ord: true, re: mk(`(${listRe(`(?:${ORDW})`, 'and|or')})${SP}sentences?(?![\\p{L}])`), val: new RegExp(`(?:${ORDW})`, 'gu') },
      { t: 'anx', re: mk(`(?:Annex|Annexes)${SP}(${listRe(RUP, SEPS)})`), val: new RegExp(RUP, 'gu') },
      { t: 'part', re: mk(`[Pp]arts?${SP}(${listRe('[A-Z]\\d?(?![\\p{L}\\d])', SEPS)})`), val: /[A-Z]\d?/gu },
      { t: 'tit', re: mk(`Title${SP}([IVX]+)(?![\\p{L}\\d])`), val: /[IVX]+/gu },
      { t: 'cha', re: mk(`Chapter${SP}([IVX]+)(?![\\p{L}\\d])`), val: /[IVX]+/gu },
      { t: 'sec', re: mk(`Section${SP}(\\d+)(?![\\p{L}\\d])`), val: /\d+/gu },
    ],
    rel: [
      { r: 'art', re: mk(`this${SP}Article(?![\\p{L}])`) },
      { r: 'par', re: mk(`this${SP}(?:paragraph|subparagraph)(?![\\p{L}])`) },
      { r: 'pt', re: mk(`this${SP}point(?![\\p{L}])`) },
      { r: 'anx', re: mk(`this${SP}Annex(?![\\p{L}])`) },
      { r: 'part', re: mk(`this${SP}Part(?![\\p{L}])`) },
      { r: 'prevArt', re: mk(`(?:that|the${SP}said|the${SP}same)${SP}Article(?![\\p{L}])`) },
    ],
    acts: [
      { re: mk(`((?:Council${SP}|Commission${SP})?(?:Implementing${SP}Regulation|Delegated${SP}Regulation|Implementing${SP}Decision|Framework${SP}Decision|Regulation|Directive|Decision|Recommendation))${SP}(?:\\((EU|EC|EEC|Euratom|ECSC)\\)${SP})?(?:(No\\.?)(?:${SP})?)?(\\d{1,4})\\/(\\d{1,4})(?:\\/(EC|EU|EEC|JHA|CFSP|Euratom))?(?![\\d/])`), num: true },
      { re: mk(`this${SP}Regulation(?![\\p{L}])`), self: true },
      { re: mk(`(?:that|the${SP}said|the${SP}same)${SP}(?:Regulation|Directive|Decision|Convention|Agreement|Treaty|Protocol)(?![\\p{L}])`), prev: true },
      { re: mk(`Convention${SP}implementing${SP}the${SP}Schengen${SP}Agreement(?:${SP}of${SP}14${SP}June${SP}1985)?`), named: 'CISA' },
      { re: mk(`Schengen${SP}Convention(?![\\p{L}])`), named: 'CISA' },
      { re: mk(`Schengen${SP}Agreement(?:${SP}of${SP}14${SP}June${SP}1985)?`), named: 'SA' },
      { re: mk('TFEU(?![\\p{L}])'), named: 'TFEU' },
      { re: mk(`Treaty${SP}on${SP}the${SP}Functioning${SP}of${SP}the${SP}European${SP}Union`), named: 'TFEU' },
      { re: mk('TEU(?![\\p{L}])'), named: 'TEU' },
      { re: mk(`Treaty${SP}on${SP}European${SP}Union`), named: 'TEU' },
      { re: mk(`Charter(?:${SP}of${SP}Fundamental${SP}Rights(?:${SP}of${SP}the${SP}European${SP}Union)?)?(?![\\p{L}])`), named: 'CFR' },
    ],
    and: mk(`\\s*(?<![\\p{L}])(?:and\\/or|and|or|as${SP}well${SP}as)${SP}`),
    comma: mk('\\s*,\\s*'),
    glue: mk(`(?:\\s*(?<![\\p{L}])(?:of|the|in|under|to)(?=${SP}))+`),
    ws: mk(SP),
    aside: mk(`\\s*\\(\\s*[„“"‚‘'«][^()]{0,80}\\)`),
    gen: /(?<![\p{L}])(?:of|of\s+the|to)$/u,
    skip: mk(`\\s*,?\\s*respectively\\s*,?`),
    poss: null,
    thereof: mk(`${SP}(?:thereto|thereof)(?![\\p{L}])`),
    unknownAct: mk(`(?:\\s*,)?${SP}(?:of|to)${SP}(?:the${SP})?(?:[\\p{Lu}\\d][\\p{L}\\d-]*${SP}){0,3}?(?:Regulation|Directive|Decision|Convention|Agreement|Treaty|Protocol|Act|Code)(?![\\p{L}])`),
    sepRange: /^(?:to)$/,
    listSep: mk(`\\s*,\\s*(?:(?:${SEPS})${SP})?|${SP}(?:${SEPS})${SP}`),
  };
}

// ------------------------------------------------------------------ Werte zerlegen

// Werteliste eines Gliederungselements: [{ v, s, e, range, comps? }]
function splitValues(g, item, text, m, groupStart) {
  // Liste exakt nach ihrer Struktur zerlegen: Wert (Trenner Wert)*; Trennwoerter sind nie Werte
  const raw = m[1];
  const vals = [];
  const vre = item.valY || (item.valY = new RegExp(item.val.source, 'yu'));
  const sre = g.listSep;
  let p = 0;
  let between = '';
  while (p < raw.length) {
    vre.lastIndex = p;
    const mm = vre.exec(raw);
    if (!mm || !mm[0]) break;
    const range = vals.length > 0 && g.sepRange.test(between.trim().replace(/^,\s*/, ''));
    vals.push({ raw: mm[0], s: groupStart + p, e: groupStart + p + mm[0].length, range, sep: between.trim() });
    p += mm[0].length;
    ASIDE_Y.lastIndex = p;
    const am = ASIDE_Y.exec(raw);
    if (am) p += am[0].length;
    sre.lastIndex = p;
    const sm = sre.exec(raw);
    if (!sm) break;
    between = sm[0];
    p += sm[0].length;
  }
  return vals;
}

const clean = (s) => s.replace(/[\s  ]+/g, ' ').trim();

// Komponenten eines Einzelwerts (sprachabhaengig)
function valueComps(lang, t, raw) {
  let v = clean(raw);
  if (/^\(?\d+(?:\.\d+)*\)?\.$/.test(v) || /\d\.$/.test(v)) v = v.replace(/\.$/, '');
  if (t === 'par' && /^\d+(?:\.\d+)+$/.test(v)) return [{ t: 'num', v }];
  if (t === 'art') {
    if (/^[IVX]+$/.test(v)) return [{ t: 'art', v, roman: true }];
    if (lang === 'fr') {
      const m = v.match(/^(\d+)(?:er)?(?: (\w+))?$/u);
      return [{ t: 'art', v: m[1] + (m[2] ? (FR_SUF[m[2]] || '') : '') }];
    }
    if (lang === 'en') {
      const m = v.match(/^(\d+[a-z]{0,2})?((?:\([^)]+\))*)$/);
      const comps = m[1] ? [{ t: 'art', v: m[1] }] : [];
      return comps.concat(parenComps(m[2], m[1] ? 'art' : null));
    }
    return [{ t: 'art', v }];
  }
  if (t === 'par') {
    if (lang === 'fr') { const m = v.match(/^(\d+)(?: (bis|ter|quater))?$/); return [{ t: 'par', v: m[1] + (m[2] ? FR_SUF[m[2]] : '') }]; }
    if (lang === 'en') {
      const w = v.replace(/ /g, '');
      let m = w.match(/^\((\d+[a-z]?)\)((?:\([^)]+\))*)$/);
      if (m) return [{ t: 'par', v: m[1] }].concat(parenComps(m[2], 'par'));
      m = w.match(/^(\d+[a-z]?)?((?:\([^)]+\))*)$/);
      if (!m) return [];
      const comps = m[1] ? [{ t: 'par', v: m[1] }] : [];
      return comps.concat(parenComps(m[2], 'par'));
    }
    return [{ t: 'par', v }];
  }
  if (t === 'ptx') {
    if (lang === 'fr') {
      let m = v.match(/^([a-z]{1,4})(?: (bis|ter|quater))?\)(?: ([ivxl]+)(?: (bis|ter|quater))?\))?$/);
      if (m) {
        const comps = [{ t: 'ptx', v: m[1] + (m[2] ? FR_SUF[m[2]] : '') }];
        if (m[3]) comps.push({ t: 'rom', v: m[3] + (m[4] ? FR_SUF[m[4]] : '') });
        return comps;
      }
      m = v.match(/^(\d+(?:\.\d+)*)\)?(?: ([a-z]{1,2})\))?$/);
      if (m) { const comps = [{ t: 'num', v: m[1] }]; if (m[2]) comps.push({ t: 'pt', v: m[2] }); return comps; }
      return [];
    }
    // en
    let m = v.match(/^((?:\([a-z]{1,5}\))+)$/);
    if (m) return parenComps(m[1], 'pt-start');
    m = v.match(/^\(?(\d+(?:\.\d+)*)\)?((?:\([a-z]{1,5}\))*)$/);
    if (m) return [{ t: 'num', v: m[1] }].concat(parenComps(m[2], 'num'));
    return [];
  }
  if (t === 'rom') { v = v.replace(/\)$/, ''); return /^\d+$/.test(v) ? [{ t: 'num', v }] : [{ t: 'rom', v }]; }
  if (t === 'anx') {
    if (lang === 'fr') { const m = v.match(/^([IVXL]+)(?: (bis|ter))?$/); return [{ t: 'anx', v: m[1] + (m[2] ? FR_SUF[m[2]] : '') }]; }
    return [{ t: 'anx', v }];
  }
  return [{ t, v }];
}

// EN-Klammerfolgen: (3)(a)(i) ; after = Typ des vorangehenden Elements
function parenComps(s, after) {
  const out = [];
  if (!s) return out;
  const parts = s.match(/\(([^)]+)\)/g) || [];
  let prev = after;
  for (const p of parts) {
    const x = p.slice(1, -1);
    if (/^\d+[a-z]?$/.test(x)) {
      // Ziffer: nach Artikel = Absatz; sonst Nummer
      const t = prev === 'art' ? 'par' : 'num';
      out.push({ t, v: x }); prev = t; continue;
    }
    if (prev === 'pt' || prev === 'ptx') { out.push({ t: 'rom', v: x }); prev = 'rom'; continue; }
    if (prev === 'rom') { out.push({ t: 'rom', v: x }); prev = 'rom'; continue; }
    // erster Buchstabenwert: Buchstabe oder (falls eindeutig roemisch und mehrstellig) offen
    out.push({ t: 'ptx', v: x }); prev = 'ptx';
  }
  return out;
}

function ordValue(lang, w) { const n = ORD[lang][clean(w).toLowerCase()]; return n === undefined ? null : n; }

// ------------------------------------------------------------------ Akt-Erkennung

const NAMED_SECTOR = { CISA: 'conv', SA: 'conv', TFEU: 'treaty', TEU: 'treaty', CFR: 'charter' };
function anaphorSector(w) {
  if (/Verordnung|règlement|Regulation/i.test(w)) return 'R';
  if (/Richtlinie|directive/i.test(w)) return 'L';
  if (/Entscheidung|Beschluss|décision|Decision/i.test(w)) return 'D';
  if (/Übereinkommen|convention|accord|Agreement/i.test(w)) return 'conv';
  if (/traité|Treaty|Vertrag/i.test(w)) return 'treaty';
  if (/Protokoll|protocole|Protocol/i.test(w)) return 'protocol';
  return null;
}

function matchAct(g, lang, text, pos) {
  for (const a of g.acts) {
    a.re.lastIndex = pos;
    const m = a.re.exec(text);
    if (!m) continue;
    const res = { s: pos, e: pos + m[0].length };
    if (a.self) return { ...res, kind: 'act', self: true };
    if (a.prev) return { ...res, kind: 'act', prev: true, sector: anaphorSector(m[0]) };
    if (a.named) return { ...res, kind: 'act', named: a.named, celex: NAMED[a.named].celex, sector: NAMED_SECTOR[a.named] };
    const kind = KIND_WORD[lang](clean(m[1]));
    const celex = celexOf(kind, m[4], m[5], !!m[3]);
    return { ...res, kind: 'act', celex, sector: kind, label: clean(m[0]) };
  }
  return null;
}

function matchItem(g, lang, text, pos) {
  for (const it of g.items) {
    it.re.lastIndex = pos;
    const m = it.re.exec(text);
    if (!m) continue;
    const gs = it.ord ? pos : pos + m[0].length - m[1].length;
    const vals = splitValues(g, it, text, m, gs);
    if (!vals.length) continue;
    for (const v of vals) {
      if (it.ord) {
        const n = ordValue(lang, v.raw);
        v.comps = [{ t: it.t, v: n === null ? null : String(n) }];
      } else v.comps = valueComps(lang, it.t, v.raw);
    }
    if (vals.some((v) => !v.comps.length)) continue;
    return { kind: 'lvl', t: it.t, s: pos, e: pos + m[0].length, vals };
  }
  return null;
}

function matchRel(g, text, pos) {
  for (const r of g.rel) {
    r.re.lastIndex = pos;
    const m = r.re.exec(text);
    if (m) return { kind: 'rel', r: r.r, s: pos, e: pos + m[0].length };
  }
  return null;
}

function stickyLen(re, text, pos) { re.lastIndex = pos; const m = re.exec(text); return m ? m[0].length : 0; }

// ------------------------------------------------------------------ Kontext

function segType(seg, prevType) {
  if (/^pt[A-Z0-9]/.test(seg)) return 'part';
  if (/^p\d/.test(seg)) return 'par';
  if (/^s\d/.test(seg)) return 'sub';
  if (/^n\d/.test(seg)) return 'num';
  if (/^d\d/.test(seg)) return 'indent';
  if (/^[htg]\d/.test(seg)) return 'other';
  if (/^[a-z]{1,4}$/.test(seg)) return (prevType === 'pt' || prevType === 'rom') ? 'rom' : 'pt';
  return 'other';
}
function keySegs(key) {
  const out = [];
  let prev = null;
  for (const s of String(key || '').split('.').filter(Boolean)) { const t = segType(s, prev); out.push({ s, t }); prev = t; }
  return out;
}

function compSeg(c) {
  switch (c.t) {
    case 'par': return 'p' + c.v;
    case 'num': return c.v.split('.').map((x) => 'n' + x).join('.');
    case 'pt': case 'rom': case 'ptx': return c.v;
    case 'indent': return c.v && c.v !== '-1' ? 'd' + c.v : null;
    case 'part': return 'pt' + c.v;
    default: return null;
  }
}

// ------------------------------------------------------------------ Beschriftung

function labelOf(lang, comps, act) {
  const by = (t) => comps.filter((c) => c.t === t);
  const parts = [];
  const unit = comps.find((c) => UNIT_TYPES.has(c.t) || DIV_TYPES.has(c.t));
  const sub = comps.find((c) => c.t === 'sub');
  const ordTxt = (n, l, fem) => {
    const N = parseInt(n, 10);
    if (l === 'de') return N === -1 ? 'letzter' : N + '.';
    if (l === 'fr') return N === -1 ? (fem ? 'dernière' : 'dernier') : N === 1 ? (fem ? '1re' : '1er') : N + 'e';
    return N === -1 ? 'last' : (['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'][N] || N + 'th');
  };
  if (lang === 'de') {
    for (const c of comps) {
      if (c.t === 'art') parts.push('Art. ' + c.v);
      else if (c.t === 'anx') parts.push('Anhang ' + c.v);
      else if (c.t === 'tit') parts.push('Titel ' + c.v);
      else if (c.t === 'cha') parts.push('Kapitel ' + c.v);
      else if (c.t === 'sec') parts.push('Abschnitt ' + c.v);
      else if (c.t === 'part') parts.push('Teil ' + c.v);
      else if (c.t === 'par') parts.push('Abs. ' + c.v);
      else if (c.t === 'sub') parts.push('Unterabs. ' + (c.v === '-1' ? 'letzter' : c.v));
      else if (c.t === 'num') parts.push('Nr. ' + c.v);
      else if (c.t === 'pt' || c.t === 'ptx') parts.push('Bst. ' + c.v);
      else if (c.t === 'rom') parts.push('Ziff. ' + c.v);
      else if (c.t === 'indent') parts.push(ordTxt(c.v, 'de') + ' Lemma');
      else if (c.t === 'sen') parts.push('Satz ' + c.v);
      else if (c.t === 'ptu') parts.push('Kennbuchstabe ' + c.v);
    }
  } else if (lang === 'fr') {
    for (const c of comps) {
      if (c.t === 'art') parts.push('art. ' + frNum(c.v));
      else if (c.t === 'anx') parts.push('annexe ' + frNum(c.v));
      else if (c.t === 'tit') parts.push('titre ' + c.v);
      else if (c.t === 'cha') parts.push('chapitre ' + c.v);
      else if (c.t === 'sec') parts.push('section ' + c.v);
      else if (c.t === 'part') parts.push('partie ' + c.v);
      else if (c.t === 'par') parts.push('par. ' + frNum(c.v));
      else if (c.t === 'sub') parts.push(ordTxt(c.v, 'fr') + ' al.');
      else if (c.t === 'num') parts.push('point ' + c.v);
      else if (c.t === 'pt' || c.t === 'ptx') parts.push('point ' + frNum(c.v) + ')');
      else if (c.t === 'rom') parts[parts.length - 1] = (parts[parts.length - 1] || 'point') + ' ' + frNum(c.v) + ')';
      else if (c.t === 'indent') parts.push(ordTxt(c.v, 'fr') + ' tiret');
      else if (c.t === 'sen') parts.push(ordTxt(c.v, 'fr', true) + ' phrase');
      else if (c.t === 'ptu') parts.push('point ' + c.v);
    }
  } else {
    let cur = '';
    const flush = () => { if (cur) { parts.push(cur); cur = ''; } };
    for (const c of comps) {
      if (c.t === 'art') { flush(); cur = 'Article ' + c.v; }
      else if (c.t === 'anx') { flush(); cur = 'Annex ' + c.v; }
      else if (c.t === 'tit') { flush(); parts.push('Title ' + c.v); }
      else if (c.t === 'cha') { flush(); parts.push('Chapter ' + c.v); }
      else if (c.t === 'sec') { flush(); parts.push('Section ' + c.v); }
      else if (c.t === 'part') { flush(); parts.push('Part ' + c.v); }
      else if (c.t === 'par') { if (cur) cur += '(' + c.v + ')'; else cur = 'paragraph ' + c.v; }
      else if (c.t === 'sub') { flush(); parts.push(ordTxt(c.v, 'en') + ' subparagraph'); }
      else if (c.t === 'num') { flush(); cur = 'point ' + c.v; }
      else if (c.t === 'pt' || c.t === 'ptx' || c.t === 'rom') { if (cur) cur += '(' + c.v + ')'; else cur = 'point (' + c.v + ')'; }
      else if (c.t === 'indent') { flush(); parts.push(ordTxt(c.v, 'en') + ' indent'); }
      else if (c.t === 'ptu') { flush(); parts.push('point ' + c.v); }
    }
    flush();
  }
  let s = lang === 'en' ? parts.join(', ') : lang === 'fr' ? parts.join(', ') : parts.join(' ');
  if (act) {
    const al = act.named ? NAMED[act.named].label[lang] : act.label ? act.label : act.celex || '?';
    const bare = act.named === 'TFEU' || act.named === 'TEU';
    s = s ? s + (lang === 'de' || bare ? ' ' : lang === 'fr' ? ', ' : ' of ') + al : al;
  }
  void by; void unit; void sub;
  return s;
}
function frNum(v) {
  const m = String(v).match(/^(\d+|[IVXL]+|[a-z]+?)([a-i])?$/);
  if (!m) return v;
  // nur Artikel/Absatz/Anhang mit Zusatzbuchstaben als bis/ter darstellen
  if (/^\d+$/.test(m[1]) && m[2]) return m[1] + ' ' + Object.keys(FR_SUF).find((k) => FR_SUF[k] === m[2]);
  return v;
}

// ------------------------------------------------------------------ Kette bilden

function chainRefs(lang, items) {
  // items: lvl | rel | act | conn('and'|'comma')
  const refs = [];
  let group = [];          // Verweise seit dem letzten Akt
  let last = null;
  let conn = 'none';
  let merge = null;        // laufende Praefix-Zusammenfuehrung { refs, upto }
  const newRef = (comps, s, e, inheritFrom) => {
    const r = { comps, s, e, act: null, explicitTop: comps.length ? rank(comps[0]) : 9, rel: null };
    if (inheritFrom && comps.length && inheritFrom.comps.length && rank(comps[0]) > rank(inheritFrom.comps[0])) {
      r.comps = inheritFrom.comps.filter((c) => rank(c) < rank(comps[0])).concat(comps);
      r.act = inheritFrom.act; r.rel = inheritFrom.rel; r.anchored = inheritFrom.anchored;
      r.inherited = true;
    }
    refs.push(r); group.push(r); last = r; return r;
  };
  const insertSorted = (r, comps) => {
    const top = rank(comps[0]), bottom = rank(comps[comps.length - 1]);
    r.comps = r.comps.filter((c) => rank(c) < top).concat(comps, r.comps.filter((c) => rank(c) > bottom));
  };
  const applyLvl = (C, s, e, connType) => {
    const rC = rank(C[0]);
    if (!last || last.closed) { merge = null; return newRef(C, s, e, null); }
    if (connType === 'and') { merge = null; return newRef(C, s, e, last); }
    const deep = last.comps.length ? rank(last.comps[last.comps.length - 1]) : -1;
    // Gleich- oder hoeherrangiges Element ohne Trenner und ohne Genitiv («Absatz 27a Absatz 3»): Kette fehlerhaft
    if (connType === 'none' && last.comps.length && rC <= deep && !(merge && rC > merge.bottom && rC < merge.upto)) {
      merge = null;
      last.malformed = true;
      const r = newRef(C, s, e, null);
      r.malformed = true;
      return r;
    }
    if (connType === 'glue') connType = 'none';
    if (merge && rC > merge.bottom && rC < merge.upto) {
      for (const r of merge.refs) insertSorted(r, C);
      merge.bottom = rank(C[C.length - 1]);
      last.e = Math.max(last.e, e);
      return last;
    }
    merge = null;
    if (rC > deep) { last.comps = last.comps.concat(C); last.e = e; return last; }
    if (rC < last.explicitTop && connType === 'none') {
      // Praefix: auf die nachlaufenden Verweise derselben Gruppe anwenden, die tiefer ansetzen
      const run = [];
      for (let i = group.length - 1; i >= 0; i--) { if (group[i].explicitTop > rC && !group[i].anchored) run.unshift(group[i]); else break; }
      if (!run.length) {
        if (last.act || last.anchored || !group.includes(last)) { merge = null; return newRef(C, s, e, null); }
        run.push(last);
      }
      const upto = Math.min(...run.map((r) => r.explicitTop));
      for (const r of run) { insertSorted(r, C); r.explicitTop = rC; }
      last.e = Math.max(last.e, e);
      merge = { refs: run, upto, bottom: rank(C[C.length - 1]) };
      return last;
    }
    return newRef(C, s, e, last);
  };

  // EN «Article 20, point (c)(ii) of Article 24(6)»: ein tieferes Element nach Komma, dem per Genitiv ein hoeheres folgt,
  // gehoert zum folgenden Element und beginnt einen neuen Verweis
  for (let i = 2; lang === 'en' && i + 2 < items.length; i++) {
    const p0 = items[i - 2], a = items[i - 1], it = items[i], g1 = items[i + 1], nx = items[i + 2];
    if (it.kind === 'lvl' && p0.kind === 'lvl' && p0.t === 'art' && a.kind === 'conn' && a.c === 'comma' && !a.glued
      && g1.kind === 'conn' && g1.glued && g1.c !== 'and' && nx.kind === 'lvl' && nx.t === 'art' && it.t !== 'art') it.ownerAhead = true;
  }
  for (const it of items) {
    if (it.kind === 'conn') {
      // Komma mit Genitiv-Leim («partie A, point 4, de l'annexe XII») wirkt wie ein Praefix
      if (it.c === 'and') conn = 'and';
      else if (it.c === 'glue' || it.glued) conn = conn === 'and' ? 'and' : 'glue';
      else conn = conn === 'and' ? 'and' : 'comma';
      continue;
    }
    if (it.kind === 'lvl') {
      let prevValRef = null;
      for (let i = 0; i < it.vals.length; i++) {
        const v = it.vals[i];
        let C = v.comps;
        if (i === 0 && it.ownerAhead) {
          merge = null;
          prevValRef = newRef(C, it.s, v.e, null);
        } else if (i === 0) {
          // EN-Teilwert «(3)» am Listenanfang ist nicht moeglich; normal verarbeiten
          prevValRef = applyLvl(C, it.s, v.e, conn);
        } else if (v.range) {
          const base = prevValRef;
          const end = v.raw[0] === '(' ? replaceLast(base.comps, C) : base.comps.filter((c) => rank(c) < rank(C[0])).concat(C);
          base.rangeEnd = end;
          base.e = v.e;
        } else if (v.raw[0] === '(') {
          // EN-Teilwert: «Article 8(2) and (3)», «points (a)(i) and (ii)»
          const r = newRef(replaceLast(prevValRef.comps, C), v.s, v.e, null);
          r.act = prevValRef.act; r.rel = prevValRef.rel; r.anchored = prevValRef.anchored; r.explicitTop = prevValRef.explicitTop;
          prevValRef = r;
          merge = null;
        } else {
          const pl = prevValRef.comps[prevValRef.comps.length - 1];
          if (C.length === 1 && C[0].t === 'ptx' && pl && pl.t === 'rom' && ROMAN_ONLY.test(C[0].v)) C = [{ t: 'rom', v: C[0].v }];
          prevValRef = newRef(C, v.s, v.e, prevValRef);
          merge = null;
        }
      }
      conn = 'none';
      continue;
    }
    if (it.kind === 'rel') {
      if (it.r === 'prevArt') {
        if (last) { const r = applyLvl([{ t: 'art', v: null, prevArt: true }], it.s, it.e, 'glue'); r.prevArt = true; }
      } else if (last && !last.closed) {
        // Bezug auf die Einheit (bzw. den Absatz/Buchstaben) des Kontexts
        const rC = it.r === 'art' || it.r === 'anx' ? 1 : it.r === 'par' || it.r === 'part' ? 2 : it.r === 'pt' ? 4 : 5;
        if (rC < last.explicitTop) {
          const run = [];
          for (let i = group.length - 1; i >= 0; i--) { if (group[i].explicitTop > rC && !group[i].anchored) run.unshift(group[i]); else break; }
          for (const r of run) { r.rel = it.r; r.anchored = true; r.explicitTop = 1; }
          last.e = it.e;
        }
      }
      conn = 'none';
      merge = null;
      continue;
    }
    if (it.kind === 'act') {
      if (!group.length || group.every((r) => r.act)) {
        if (!it.self && !it.prev && (it.celex || it.named)) {
          const r = newRef([], it.s, it.e, null);
          r.act = it; r.standalone = true; r.closed = true;
        }
      } else {
        for (const r of group) if (!r.act) r.act = it;
        last.e = Math.max(last.e, it.e);
      }
      group = [];
      conn = 'none';
      merge = null;
      continue;
    }
  }
  return refs;
}

// Teilwert mit k Klammergruppen ersetzt die letzten k Komponenten (Typen bleiben)
function replaceLast(prev, C) {
  const k = C.length;
  if (k > prev.length) return C;
  const head = prev.slice(0, prev.length - k);
  const tail = prev.slice(prev.length - k).map((c, i) => ({ t: c.t, v: C[i].v }));
  return head.concat(tail);
}

// Kette ab Position pos lesen
function readChain(g, lang, text, pos) {
  const items = [];
  let p = pos;
  let lastGood = pos;
  const first = matchItem(g, lang, text, p) || matchAct(g, lang, text, p);
  if (!first) return { items, end: pos + 1 };
  const pushTok = (t) => {
    if (t.kind === 'lvl') items.push(t);
    else if (t.kind === 'rel') items.push(t);
    else items.push({ kind: 'act', ...t });
    p = t.e; lastGood = p;
    // «Annex XII thereto»: Rueckbezug auf den zuletzt genannten Akt
    if (g.thereof && t.kind === 'lvl') {
      const n = stickyLen(g.thereof, text, p);
      if (n) { items.push({ kind: 'act', prev: true, sector: null, s: p, e: p + n }); p += n; lastGood = p; }
    }
  };
  pushTok(first.kind ? first : { ...first, kind: 'act' });
  for (;;) {
    let q = p;
    let conn = null;
    let glued = false;
    let poss = false;
    // Trenner, Einschuebe («Teil A („EU, EWR, CH“)»), «respectively»
    for (let guard = 0; guard < 6; guard++) {
      let n = g.aside ? stickyLen(g.aside, text, q) : 0;
      if (n) { q += n; continue; }
      n = g.skip ? stickyLen(g.skip, text, q) : 0;
      if (n) { q += n; continue; }
      n = stickyLen(g.comma, text, q);
      if (n) { if (conn !== 'and') conn = 'comma'; q += n; continue; }
      n = stickyLen(g.and, text, q);
      if (n) { conn = 'and'; q += n; continue; }
      break;
    }
    // Rueckbezug mit Artikel («der genannten Verordnung») vor dem Artikel-Leim versuchen
    let tok = null;
    {
      const w = stickyLen(g.ws, text, q);
      const a = matchAct(g, lang, text, q + w);
      if (a && (a.prev || a.self)) { tok = a; q = q + w; }
    }
    if (!tok) {
      let n = g.poss ? stickyLen(g.poss, text, q) : 0;
      if (n) { q += n; poss = true; }
      else {
        n = stickyLen(g.glue, text, q);
        if (n) {
          const gt = text.slice(q, q + n).trim();
          // DE «des dem Vertrag … beigefügten Protokolls»: Partizipialkonstruktion, Bezugswort folgt erst spaeter
          if (lang === 'de' && /(?:des|der)\s+(?:dem|den|die)$/u.test(gt)) break;
          glued = !!(g.gen && g.gen.test(gt)); q += n;
        }
      }
      n = stickyLen(g.ws, text, q);
      if (n) q += n;
      if (q === p) break;
      tok = matchItem(g, lang, text, q) || matchRel(g, text, q) || matchAct(g, lang, text, q);
      if (tok && poss && tok.kind !== 'lvl') tok = null;
    }
    if (!tok) break;
    if (conn) items.push({ kind: 'conn', c: conn, glued });
    else if (glued) items.push({ kind: 'conn', c: 'glue', glued: true });
    pushTok(tok.kind ? tok : { ...tok, kind: 'act' });
    if (poss) items.push({ kind: 'act', prev: true, sector: null, s: tok.e, e: tok.e });
  }
  // Ein nicht erkannter Akt folgt («… du règlement délégué de la Commission»): Kette darf nicht als intern gelten
  let tailUnknown = false;
  if (g.unknownAct && items.length && items[items.length - 1].kind !== 'act') {
    if (stickyLen(g.unknownAct, text, lastGood)) tailUnknown = true;
    else if (g.unknownActLong && stickyLen(g.unknownActLong, text, lastGood)) tailUnknown = true;
  }
  return { items, end: lastGood, tailUnknown };
}

// ------------------------------------------------------------------ Aufloesung

function expandRange(ctx, unitId, startComps, endComps, keysOf, toc) {
  // Einheitsbereich (Artikel 23 bis 28) oder Bereich auf der letzten Ebene (Buchstaben c bis f)
  const sTop = startComps.find((c) => c.t === 'art' || c.t === 'anx');
  const eTop = endComps.find((c) => c.t === 'art' || c.t === 'anx');
  const lastS = startComps[startComps.length - 1], lastE = endComps[endComps.length - 1];
  if (sTop && eTop && lastS === sTop && lastE === eTop) {
    const a = (sTop.t === 'art' ? 'art_' : 'anx_') + sTop.v, b = (eTop.t === 'art' ? 'art_' : 'anx_') + eTop.v;
    if (toc && toc.length) {
      const ids = toc.map((e) => e.id);
      const i = ids.indexOf(a), j = ids.indexOf(b);
      // nur Einheiten, die im Stand bestehen (das Inhaltsverzeichnis vereinigt alle Staende)
      if (i >= 0 && j >= i) return { units: ids.slice(i, j + 1).filter((x) => x.startsWith(sTop.t === 'art' ? 'art_' : 'anx_') && (!ctx.unitExists || ctx.unitExists(x))), approx: false };
    }
    if (sTop.t === 'art' && /^\d+$/.test(sTop.v) && /^\d+$/.test(eTop.v)) {
      const out = [];
      for (let n = +sTop.v; n <= +eTop.v; n++) out.push('art_' + n);
      return { units: out, approx: true };
    }
    return null;
  }
  if (lastS && lastE && lastS.t === lastE.t && ['pt', 'ptx', 'rom', 'par', 'num'].includes(lastS.t)) {
    return { lastLevel: true, from: lastS.v, to: lastE.v, t: lastS.t };
  }
  return null;
}

function seqBetween(t, a, b) {
  if (t === 'par' || t === 'num') {
    if (/^\d+$/.test(a) && /^\d+$/.test(b)) { const o = []; for (let n = +a; n <= +b; n++) o.push(String(n)); return o; }
    // «Nummern 2.1 bis 2.4»: gleicher Praefix, Bereich auf der letzten Stufe
    const A = String(a).split('.'), B = String(b).split('.');
    if (t === 'num' && A.length === B.length && A.length > 1 && A.slice(0, -1).join('.') === B.slice(0, -1).join('.') && /^\d+$/.test(A[A.length - 1]) && /^\d+$/.test(B[B.length - 1])) {
      const o = []; for (let n = +A[A.length - 1]; n <= +B[B.length - 1]; n++) o.push(String(n)); return o;
    }
    return null;
  }
  if ((t === 'pt' || t === 'ptx') && /^[a-z]$/.test(a) && /^[a-z]$/.test(b)) {
    const o = []; for (let c = a.charCodeAt(0); c <= b.charCodeAt(0); c++) o.push(String.fromCharCode(c)); return o;
  }
  if (t === 'rom') {
    const R = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];
    const i = R.indexOf(a), j = R.indexOf(b);
    if (i >= 0 && j >= i) return R.slice(i, j + 1);
  }
  return null;
}

function hasKey(keys, k) {
  if (!keys) return null;
  if (keys.has(k)) return true;
  const pre = k + '.';
  for (const x of keys) if (x.startsWith(pre)) return true;
  return false;
}

// Komponenten -> Ziel. Rueckgabe { target, uncertain }
function resolveRef(lang, r, ctx, lastActRef, prevArtComps) {
  const keysOfUnit = ctx.keysOf || null;
  let act = r.act;
  let uncertain = false;
  const why = [];
  if (act && act.prev) {
    const found = lastActRef ? (act.sector ? lastActRef[act.sector] : lastActRef.any) : null;
    if (found) act = found; else { uncertain = true; why.push('anaphor-act'); }
  }
  if (r.unknownAct) { uncertain = true; why.push('unknown-act'); }
  if (r.malformed) { uncertain = true; why.push('malformed-chain'); }
  // Aenderungsartikel eines anderen Werks («Regulation (EC) No 767/2008 is amended as follows»):
  // Verweise ohne Aktangabe meinen den geaenderten Akt; im zitierten neuen Wortlaut auch «diese Verordnung»
  let viaAmended = false;
  if (ctx.amends && !r.unknownAct && (!act || (act.self && ctx.quoted))) {
    const hasUnit = r.comps.some((c) => UNIT_TYPES.has(c.t) && !c.prevArt);
    if (hasUnit) { act = { kind: 'act', celex: ctx.amends, sector: ctx.amends.charAt(5), label: ctx.amendsLabel || ctx.amends }; viaAmended = true; }
    else { uncertain = true; why.push('relative-in-amendment'); }
  } else if (ctx.quoted && !ctx.amends && (!act || act.self)) {
    uncertain = true; why.push('quoted-text');
  }
  const unresolved = !!(act && act.prev) || !!r.unknownAct;
  let comps = r.comps.slice();
  if (comps.some((c) => c.prevArt)) {
    if (prevArtComps) {
      const i = comps.findIndex((c) => c.prevArt);
      comps.splice(i, 1, ...prevArtComps.filter((c) => UNIT_TYPES.has(c.t)));
      if (!act && prevArtComps.act) act = prevArtComps.act;
    } else { uncertain = true; why.push('anaphor-article'); comps = comps.filter((c) => !c.prevArt); }
  }
  const external = !!(act && !act.self && !unresolved && act.celex !== ctx.work && (act.celex || act.named));
  const workCelex = external ? (act.celex || null) : (unresolved ? null : ctx.work);
  const unitComp = comps.find((c) => UNIT_TYPES.has(c.t));
  const divComps = comps.filter((c) => DIV_TYPES.has(c.t));
  const keyComps = comps.filter((c) => !UNIT_TYPES.has(c.t) && !DIV_TYPES.has(c.t));
  let unit = null;
  let relative = false;
  let base = [];
  if (unitComp && unitComp.roman && !external) { uncertain = true; why.push('roman-article'); }
  if (unitComp) unit = (unitComp.t === 'art' ? 'art_' : 'anx_') + unitComp.v;
  else if (divComps.length && !keyComps.length) {
    // Titel/Kapitel
    const tit = divComps.find((c) => c.t === 'tit');
    const cha = divComps.find((c) => c.t === 'cha');
    if (external) unit = null;
    else if (tit && cha) unit = `tit_${tit.v}.cpt_${cha.v}`;
    else if (tit) unit = `tit_${tit.v}`;
    else if (cha && ctx.tocIds && ctx.tocIds.has(`cpt_${cha.v}`)) unit = `cpt_${cha.v}`;   // Werke ohne Titelgliederung
    else if (cha && ctx.toc) {
      // Kapitel ohne Titel: Titel des Kontexts
      const byId = new Map(ctx.toc.map((e) => [e.id, e]));
      let e = byId.get(ctx.unit);
      while (e && e.type !== 'title') e = byId.get(e.parent);
      if (e) unit = `${e.id}.cpt_${cha.v}`; else { uncertain = true; why.push('chapter-without-title'); }
    } else { uncertain = true; why.push('division'); }
    if (unit && ctx.tocIds && !external && !ctx.tocIds.has(unit)) { /* tot, nicht unsicher */ }
  } else if (!external && !unresolved) {
    // relativ
    relative = true;
    if (!ctx.unit || !(ctx.unitType === 'article' || ctx.unitType === 'annex')) { uncertain = true; why.push('relative-outside-unit'); }
    else {
      unit = ctx.unit;
      if (keyComps.length) {
        const top = rank(keyComps[0]);
        let segs = keySegs(ctx.key).filter((x) => x.t !== 'sub' && x.t !== 'other');
        if (r.rel === 'art' || r.rel === 'anx') segs = [];
        else if (r.rel === 'par' || r.rel === 'part') segs = segs.filter((x) => x.t === 'par' || x.t === 'part');
        else if (r.rel === 'pt') segs = segs.filter((x) => rank({ t: x.t }) <= 4);
        base = segs.filter((x) => rank({ t: x.t === 'pt' ? 'pt' : x.t }) < top).map((x) => x.s);
      }
    }
  } else if (external && keyComps.length) {
    // Absatz/Buchstabe eines Fremdakts ohne Artikel: unklar
    uncertain = true; why.push('external-without-article');
  }

  // Schluessel bilden (Unterabsatz und Satz verfeinern nur, Schluessel bleibt beim Elternteil)
  let segs = base.slice();
  let rest = [];
  let prevT = segs.length ? keySegs(segs.join('.')).pop().t : null;
  for (const c of keyComps) {
    if (c.t === 'sub' || c.t === 'sen' || c.t === 'ptu') { rest.push(c); continue; }
    if (c.t === 'indent' && (c.v === null || c.v === '-1')) { rest.push(c); continue; }
    if (rest.length && rest.some((x) => x.t === 'sub' && x.v !== '1')) {
      // Buchstabe in einem spaeteren Unterabsatz: nicht sicher abbildbar
      uncertain = true; why.push('point-in-subparagraph');
    }
    let cc = c;
    if (c.t === 'ptx') {
      // Buchstabe oder roemische Ziffer (FR/EN «point»): nach Buchstabe = Ziffer
      cc = { t: (prevT === 'pt' || prevT === 'rom') ? 'rom' : 'pt', v: c.v, amb: ROMAN_SUF.test(c.v) && !/^[a-z]{2}$/.test(c.v) || ROMAN_ONLY.test(c.v) };
    }
    const seg = compSeg(cc);
    if (seg) segs.push(seg);
    prevT = cc.t;
    cc.used = true;
  }
  let key = segs.length ? segs.join('.') : null;
  let ambiguous = null;
  const keys = unit && !external ? (keysOfUnit ? keysOfUnit(unit) : null) : (unit && external && ctx.keysOfWork ? ctx.keysOfWork(workCelex, unit) : null);

  // Mehrdeutigkeit Buchstabe/Ziffer pruefen und Varianten gegen den Datensatz
  if (key && keys) {
    if (!hasKey(keys, key)) {
      const alts = [];
      // Absatz <-> Nummer (z. B. «Article 2(16)», Begriffsbestimmungen)
      if (/^p\d/.test(key)) alts.push(key.replace(/^p(\d)/, 'n$1'));
      // Buchstabe <-> roemische Ziffer
      const sg = key.split('.');
      const lastSeg = sg[sg.length - 1];
      if (keyComps.some((c) => c.t === 'ptx') && ROMAN_SUF.test(lastSeg) && relative) {
        const cs = keySegs(ctx.key).filter((x) => x.t === 'par' || x.t === 'pt' || x.t === 'part' || x.t === 'num');
        const withPt = cs.filter((x) => x.t !== 'pt' || true);
        const ptIdx = withPt.findIndex((x) => x.t === 'pt');
        if (ptIdx >= 0) alts.push(withPt.slice(0, ptIdx + 1).map((x) => x.s).concat(lastSeg).join('.'));
      }
      const ok = alts.filter((a) => hasKey(keys, a));
      const m1 = /^p(\d+)$/.exec(key);
      if (m1 && !ok.length && keys.size && ![...keys].some((x) => /^p\d/.test(x)) && keys.has('s' + m1[1])) {
        // Artikel ohne nummerierte Absaetze: «Absatz 1» = erster (unnummerierter) Absatz
        key = null; rest.unshift({ t: 'sub', v: m1[1] });
      } else if (ok.length === 1) key = ok[0];
      else if (relative) { uncertain = true; why.push('relative-not-found'); }
    } else if (relative && keyComps.some((c) => c.t === 'ptx')) {
      // beide Lesarten vorhanden? dann unsicher
      const sg = key.split('.');
      const lastSeg = sg[sg.length - 1];
      if (ROMAN_ONLY.test(lastSeg) && sg.length >= 1) {
        const cs = keySegs(ctx.key).filter((x) => x.t === 'par' || x.t === 'pt' || x.t === 'part' || x.t === 'num');
        const ptIdx = cs.findIndex((x) => x.t === 'pt');
        if (ptIdx >= 0) {
          const alt = cs.slice(0, ptIdx + 1).map((x) => x.s).concat(lastSeg).join('.');
          if (alt !== key && hasKey(keys, alt)) { uncertain = true; why.push('point-ambiguous'); ambiguous = [key, alt]; }
        }
      }
    }
  } else if (relative && keys && !key) {
    // nur Unterabsatz o. Ae. relativ
  }
  if (unit && !external && relative && keys && key === null && !keyComps.length) {
    uncertain = true; why.push('relative-empty');
  }

  const kind = external || unresolved ? 'external' : 'internal';
  let target;
  if (uncertain) {
    target = { work: workCelex, unit: null, key: null, kind, label: labelOf(lang, comps, external ? act : null) };
  } else if (external) {
    const inLib = ctx.inLibrary ? ctx.inLibrary(workCelex) : false;
    target = { work: workCelex, unit: inLib ? unit : null, key: inLib ? key : null, kind, label: labelOf(lang, comps, act) };
    if (!inLib && unit) target.provision = { unit, key };
    if (act.named) target.instrument = act.named;
  } else {
    target = { work: ctx.work, unit, key, kind, label: labelOf(lang, comps, null) };
  }
  if (rest.length) target.rest = rest.map((c) => c.t + (c.v === null ? '' : ':' + c.v)).join(',');
  if (viaAmended) target.via = 'amended-act';
  return { target, uncertain, why, unit, key, external, relative, comps, act, ambiguous };
}

// ------------------------------------------------------------------ Hauptfunktion

export function extractRefs(text, lang, ctx = {}) {
  const g = G[lang];
  if (!g) throw new Error('Sprache nicht unterstuetzt: ' + lang);
  const s = String(text || '');
  const out = [];
  g.start.lastIndex = 0;
  let m;
  let lastAct = null;
  let prevArt = null;
  let minPos = 0;
  while ((m = g.start.exec(s))) {
    if (m.index < minPos) continue;
    const { items, end, tailUnknown } = readChain(g, lang, s, m.index);
    if (!items.length) continue;
    minPos = end;
    g.start.lastIndex = Math.max(g.start.lastIndex, end);
    if (g.possBefore && items[0].kind === 'lvl' && g.possBefore.test(s.slice(Math.max(0, m.index - 12), m.index))) {
      items.splice(1, 0, { kind: 'act', prev: true, sector: null, s: items[0].e, e: items[0].e });
    }
    const refs = chainRefs(lang, items);
    const chainOut = [];
    if (tailUnknown) {
      for (let i = refs.length - 1; i >= 0 && !refs[i].act && !refs[i].rel; i--) refs[i].unknownAct = true;
    }
    for (const r of refs) {
      if (!r.comps.length && !r.standalone) continue;
      if (r.standalone && r.act && r.act.celex && r.act.celex === ctx.work) continue;
      if (r.standalone && r.act && r.act.named && s[r.s - 1] === '(' && s[r.e] === ')' && chainOut.some((x) => x.target && x.target.instrument === r.act.named)) continue;
      if (r.standalone && r.act && r.act.named && s[r.s - 1] === '(' && s[r.e] === ')' && out.some((x) => x.target && x.target.instrument === r.act.named && x.end >= r.s - 3)) continue;
      const res = resolveRef(lang, r, ctx, lastAct, prevArt);
      // Fremdakt merken (fuer «jener Verordnung»)
      if (r.act && !r.act.self && !r.act.prev && (r.act.celex || r.act.named) && r.act.celex !== ctx.work && r.act.sector) lastAct = { ...(lastAct || {}), [r.act.sector]: r.act, any: r.act };
      if (res.unit && res.unit.startsWith('art_')) { prevArt = res.comps.filter((c) => UNIT_TYPES.has(c.t)); prevArt.act = res.external ? res.act : null; }
      if (r.s <= 1 && !res.external && res.target.unit && res.target.unit === ctx.unit && (res.target.key || null) === (ctx.key || null)) continue;
      // Ueberschrift eines Teils («Teil D1: …» im Block ptD.ptD1) ist kein Verweis
      if (r.s <= 1 && !res.external && ctx.key && /^pt/.test(ctx.key.split('.').pop()) && r.comps.length === 1 && r.comps[0].t === 'part' && 'pt' + r.comps[0].v === ctx.key.split('.').pop()) continue;
      const ref = { start: r.s, end: r.e, text: s.slice(r.s, r.e), target: res.target };
      if (res.uncertain) { ref.uncertain = true; ref.why = res.why; }
      if (res.ambiguous && res.why.length === 1) ref._amb = { keys: res.ambiguous, unit: res.unit, comps: res.comps };
      if (r.rangeEnd) {
        const er = resolveRef(lang, { ...r, comps: r.rangeEnd }, ctx, lastAct, prevArt);
        const ex = !res.uncertain && !er.uncertain ? expandRange(ctx, res.unit, res.comps, er.comps, ctx.keysOf, res.external ? null : ctx.toc) : null;
        const targets = [];
        if (ex && ex.units) {
          for (const u of ex.units) targets.push({ ...res.target, unit: res.target.unit === null ? null : u, key: null, ...(res.target.provision ? { provision: { unit: u, key: null } } : {}) });
          if (ex.approx) ref.rangeApprox = true;
        } else if (ex && ex.lastLevel) {
          const seq = seqBetween(ex.t, ex.from, ex.to);
          if (seq && res.target.key) {
            const baseKey = res.target.key.split('.').slice(0, -1);
            const prefix = ex.t === 'par' ? 'p' : ex.t === 'num' ? 'n' : '';
            const keys = ctx.keysOf && !res.external && res.target.unit ? ctx.keysOf(res.target.unit) : null;
            for (const v of seq) {
              const k = baseKey.concat(prefix + v).join('.');
              if (keys && !hasKey(keys, k)) continue;
              targets.push({ ...res.target, key: k });
            }
          }
        }
        if (targets.length) { ref.targets = targets; ref.target = targets[0]; }
        else { ref.range = { to: er.target }; }
      }
      chainOut.push(ref);
    }
    // Mehrdeutiger Buchstabe/Ziffer in einer Aufzaehlung («points (i), (ii) and (iii)»): Lesart der eindeutigen Geschwister
    for (const ref of chainOut) {
      if (!ref._amb) continue;
      const par = (k) => k.split('.').slice(0, -1).join('.');
      const sib = new Set(chainOut.filter((x) => x !== ref && !x.uncertain && x.target && x.target.unit === ref._amb.unit && x.target.key).map((x) => par(x.target.key)));
      const hits = ref._amb.keys.filter((k) => sib.has(par(k)));
      if (hits.length === 1) {
        ref.target = { work: ctx.work, unit: ref._amb.unit, key: hits[0], kind: 'internal', label: ref.target.label };
        delete ref.uncertain; delete ref.why; ref.inferred = 'list';
      }
      delete ref._amb;
    }
    out.push(...chainOut);
  }
  // Spannen duerfen sich nicht ueberlappen (Sicherheitsnetz)
  out.sort((a, b) => a.start - b.start || a.end - b.end);
  const res = [];
  let lastEnd = -1;
  for (const r of out) { if (r.start >= lastEnd && r.end > r.start) { res.push(r); lastEnd = r.end; } }
  return res;
}

// ------------------------------------------------------------------ Index

function refId(t) {
  if (!t) return '';
  const local = t.unit ? t.unit + '#' + (t.key || '') : '';
  return t.kind === 'external' ? (t.work || t.instrument || '?') + (local ? ':' + local : '') : local;
}
export { refId };

function worksList(worksIndex) {
  return Array.isArray(worksIndex) ? worksIndex : worksIndex && Array.isArray(worksIndex.works) ? worksIndex.works : worksIndex ? Object.values(worksIndex) : [];
}
function libraryLookup(worksIndex) {
  const set = new Map(worksList(worksIndex).filter((w) => w && w.celex).map((w) => [w.celex, w.id]));
  return (celex) => !!celex && set.has(celex);
}
// Datensaetze anderer Werke: { <celex>|<werk-id>: dataset }; Schluessel nach CELEX vereinheitlichen
function datasetsByCelex(datasets, worksIndex) {
  if (!datasets) return null;
  const idToCelex = new Map(worksList(worksIndex).filter((w) => w && w.id && w.celex).map((w) => [w.id, w.celex]));
  const m = {};
  for (const [k, d] of Object.entries(datasets)) {
    if (!d || !d.units) continue;
    const c = (d.work && d.work.celex) || idToCelex.get(k) || k;
    m[c] = d;
  }
  return m;
}

// Geaenderter Akt eines Aenderungsartikels: aus Titel oder Einleitungssatz, nur wenn genau ein Fremdakt genannt ist
const AMEND_RE = {
  de: [/^Änderung(?:en)?\s+(?:der|des)\s+/u, /\s(?:wird|werden)\s+wie\s+folgt\s+geändert/u],
  fr: [/^Modifications?\s+(?:du|de\s+la|de\s+l[’']|des)\s*/u, /\s(?:est|sont)\s+modifiée?s?\s+comme\s+suit/u],
  en: [/^Amendments?\s+to\s+/u, /\s(?:is|are)\s+(?:hereby\s+)?amended\s+as\s+follows/u],
};
export function amendedActOf(version, lang, work) {
  if (!version || version.repealed) return null;
  const R = AMEND_RE[lang];
  if (!R) return null;
  const cands = [];
  if (version.title && R[0].test(version.title)) cands.push(version.title);
  const first = version.blocks.find((b) => b.ty !== 'img' && b.ty !== 'table');
  if (first && R[1].test(plainText(first.t)) && !first.k.includes('.')) cands.push(plainText(first.t).split(R[1])[0]);
  for (const t of cands) {
    const refs = extractRefs(t, lang, { work });
    const acts = [...new Set(refs.filter((r) => r.target && r.target.kind === 'external' && r.target.work && !r.target.unit && !(r.target.provision)).map((r) => r.target.work))];
    if (acts.length === 1) return { celex: acts[0], label: refs.find((r) => r.target.work === acts[0]).text };
  }
  return null;
}

function versionKeys(v) { return new Set((v && !v.repealed ? v.blocks : []).map((b) => b.k)); }

export function buildRefIndex(dataset, lang, stageId, opts = {}) {
  const { worksIndex = null } = opts;
  const datasets = datasetsByCelex(opts.datasets || null, worksIndex);
  const ds = dataset;
  const work = ds.work && ds.work.celex;
  const inLibrary = libraryLookup(worksIndex);
  const keyCache = new Map();
  const keysOf = (unit) => {
    if (!keyCache.has(unit)) keyCache.set(unit, ds.units[unit] ? versionKeys(getVersion(ds, unit, lang, stageId)) : new Set());
    return keyCache.get(unit);
  };
  const extCache = new Map();
  const keysOfWork = datasets ? (celex, unit) => {
    const d = datasets[celex];
    if (!d || !d.units[unit]) return null;
    const k = celex + '|' + unit;
    if (!extCache.has(k)) {
      const st = d.stages.slice().sort((a, b) => a.order - b.order).pop();
      extCache.set(k, versionKeys(getVersion(d, unit, lang, st.id)));
    }
    return extCache.get(k);
  } : null;
  const toc = ds.toc;
  const tocIds = new Set(toc.map((e) => e.id));
  const existCache = new Map();
  const unitExists = (unit) => {
    if (!existCache.has(unit)) { const v = ds.units[unit] ? getVersion(ds, unit, lang, stageId) : null; existCache.set(unit, !!v && !v.repealed); }
    return existCache.get(unit);
  };
  const out = {}, inn = {}, external = {};
  const stats = { blocks: 0, refs: 0, internal: 0, external: 0, uncertain: 0, dead: [], deadExternal: [], inLibrary: 0 };
  const addIn = (k, entry) => { (inn[k] || (inn[k] = [])).push(entry); };
  for (const e of toc) {
    const u = ds.units[e.id];
    if (!u) continue;
    const v = getVersion(ds, e.id, lang, stageId);
    if (!v || v.repealed) continue;
    const unitType = u.type === 'recitals' ? 'recitals' : u.type;
    const am = u.type === 'article' ? amendedActOf(v, lang, work) : null;
    if (am) (stats.amending || (stats.amending = [])).push({ unit: e.id, celex: am.celex });
    for (const b of v.blocks) {
      if (b.ty === 'table' || b.ty === 'img') continue;
      stats.blocks++;
      const quoted = /(?:^|\.)q\d/.test(b.k);
      const isIntro = am && !b.k.includes('.') && b === v.blocks[0];
      const ctx = { work, unit: e.id, key: b.k, unitType, keysOf, keysOfWork, toc, tocIds, inLibrary, quoted, unitExists, amends: am && !isIntro ? am.celex : null, amendsLabel: am ? am.label : null };
      const refs = extractRefs(plainText(b.t), lang, ctx);
      if (!refs.length) continue;
      const src = e.id + '#' + b.k;
      out[src] = refs;
      for (const r of refs) {
        stats.refs++;
        if (r.uncertain) stats.uncertain++;
        for (const t of r.targets || [r.target]) {
          if (t.kind === 'internal' && t.unit) {
            stats.internal++;
            const exists = ds.units[t.unit] ? (t.key ? hasKey(keysOf(t.unit), t.key) : !!getVersion(ds, t.unit, lang, stageId) && !getVersion(ds, t.unit, lang, stageId).repealed) : tocIds.has(t.unit);
            if (!exists) stats.dead.push({ from: src, text: r.text, unit: t.unit, key: t.key });
            const entry = { unit: e.id, key: b.k, text: r.text, targetKey: t.key || null };
            addIn(t.unit, entry);
            if (t.key) addIn(t.unit + '#' + t.key, entry);
          } else if (t.kind === 'external') {
            stats.external++;
            if (t.unit) {
              stats.inLibrary++;
              const d = datasets && datasets[t.work];
              if (d) {
                const ks = keysOfWork(t.work, t.unit);
                if (!ks || (t.key && !hasKey(ks, t.key))) stats.deadExternal.push({ from: src, text: r.text, work: t.work, unit: t.unit, key: t.key });
              }
            }
            const c = t.work || t.instrument || '?';
            (external[c] || (external[c] = [])).push({ unit: e.id, key: b.k, target: t });
          }
        }
      }
    }
  }
  return { out, in: inn, external, stats };
}

// ------------------------------------------------------------------ Verlinken

function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

export function linkifyHtml(blockHtml, refs) {
  const html = String(blockHtml || '');
  if (!refs || !refs.length) return html;
  const plain = plainText(html);
  // Fundstellen gegen den Klartext pruefen; falls verschoben, in der Naehe suchen
  const spans = [];
  for (const r of refs) {
    let s = r.start, e = r.end;
    if (plain.slice(s, e) !== r.text) {
      const i = plain.indexOf(r.text, Math.max(0, s - 40));
      if (i < 0 || !r.text) continue;
      s = i; e = i + r.text.length;
    }
    if (spans.length && s < spans[spans.length - 1].e) continue;
    spans.push({ s, e, r });
  }
  if (!spans.length) return html;
  const open = (r) => {
    const t = r.target || {};
    let a = `<a data-ref="${escAttr(refId(t))}" data-ref-kind="${t.kind || ''}"`;
    if (r.uncertain) a += ' data-uncertain="1"';
    return a + '>';
  };
  let out = '';
  let pi = 0;           // Position im Klartext
  let si = 0;           // naechste Spanne
  let inside = false;
  let i = 0;
  const L = html.length;
  const atPlain = () => {
    // Spannenwechsel an Klartextposition pi
    if (inside && pi === spans[si].e) { out += '</a>'; inside = false; si++; }
    if (!inside && si < spans.length && pi === spans[si].s) { out += open(spans[si].r); inside = true; }
  };
  while (i < L) {
    const ch = html[i];
    if (ch === '<') {
      const j = html.indexOf('>', i);
      const tagStr = html.slice(i, j + 1);
      const isBr = /^<br\b/i.test(tagStr);
      if (isBr) {
        atPlain();
        if (inside) { out += '</a>' + tagStr + open(spans[si].r); } else out += tagStr;
        pi++;
      } else if (inside) {
        out += '</a>' + tagStr;
        const reopen = pi < spans[si].e;
        if (reopen) out += open(spans[si].r);
        if (!reopen) { inside = false; si++; }
      } else {
        // vor einem Tag: Spanne beginnt erst nach dem Tag
        out += tagStr;
      }
      i = j + 1;
      continue;
    }
    atPlain();
    if (ch === '&') {
      const m = /^&(?:[a-z]+|#\d+|#x[0-9a-f]+);/i.exec(html.slice(i, i + 12));
      if (m) { out += m[0]; i += m[0].length; pi++; continue; }
    }
    out += ch; i++; pi++;
  }
  if (inside) out += '</a>';
  return out;
}

// Entfernt die von linkifyHtml gesetzten Anker (fuer Tests: Wortlaut vorher = nachher)
export function unlinkHtml(html) {
  return String(html || '').replace(/<a data-ref="[^"]*"[^>]*>/g, '').replace(/<\/a>/g, '');
}
