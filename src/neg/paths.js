// SGK-Navigator, Modul Verhandlung — Fundstellen (Labels) und Pfade (ESM, isomorph)
//
// parseLabel("Article 3(2), first subparagraph, point (a)") -> { kind:"article", art:"3", par:"2", sub:"1", pt:["a"] }
// labelFromPath(path) -> "Article 3(2), first subparagraph, point (a)"
// groupOf(path) -> "art_3" | "recitals" | "citations" | "annex_I" | "formula" | "other"
// pathKey(path) -> stabiler Vergleichsschlüssel
// StructureTracker: leitet aus fortlaufenden Zelltexten (ohne Fundstellen-Zwischenzeilen) Pfade ab.

const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth'];
const ordNum = (w) => { const i = ORD.indexOf(String(w || '').toLowerCase()); return i < 0 ? null : String(i + 1); };
const numOrd = (n) => ORD[+n - 1] || `${n}th`;

/** Fundstellen-Label in Pfad zerlegen. Unbekanntes -> { kind:"other" }. */
export function parseLabel(label) {
  const s = String(label || '').replace(/\s+/g, ' ').trim();
  if (!s) return { kind: 'other' };
  let m;
  if (/^formula$/i.test(s) || /^title$/i.test(s)) return { kind: 'formula' };
  if ((m = /^citation\s+(\S+)/i.exec(s))) return { kind: 'citation', no: m[1] };
  if ((m = /^recital\s*\(?\s*([0-9]+[a-z]*|-?[a-z0-9]+)\s*\)?/i.exec(s))) return { kind: 'recital', no: m[1] };
  if ((m = /^annex\s+([IVXLC]+[a-z]*|\d+[a-z]*)\b(.*)$/i.exec(s))) {
    const p = { kind: 'annex', annex: m[1] };
    const rest = m[2];
    const pm = /point\s+\(?([0-9a-z.]+)\)?/i.exec(rest); if (pm) p.pt = [pm[1]];
    const pa = /part\s+([A-Z0-9]+)/i.exec(rest); if (pa) p.part = pa[1];
    return p;
  }
  if ((m = /^article\s+(-?\d+[a-z]*)\s*(?:\((-?\d+[a-z]*)\))?(.*)$/i.exec(s))) {
    const p = { kind: 'article', art: m[1] };
    if (m[2]) p.par = m[2];
    const rest = m[3] || '';
    let k;
    if ((k = /\b(\w+)\s+paragraph\b/i.exec(rest)) && !p.par) { const n = ordNum(k[1]); if (n) p.par = n; }
    if ((k = /\b(\w+)\s+subparagraph\b/i.exec(rest))) { const n = ordNum(k[1]); if (n) p.sub = n; }
    const pts = [];
    const re = /\bpoints?\s+\(?\s*(-?[0-9a-z]+)\s*\)?/gi;
    while ((k = re.exec(rest))) pts.push(k[1]);
    const trail = /(?:^|,)\s*(-?[a-z])\s*$/i.exec(rest);   // "Article 7, first paragraph -a"
    if (!pts.length && (k = /\s(-[a-z])\s*$/i.exec(rest))) pts.push(k[1]);
    else if (!pts.length && trail && rest.trim().length > 2) pts.push(trail[1]);
    if (pts.length) p.pt = pts;
    if (/\bintroductory\b/i.test(rest)) p.intro = true;
    if (/\btitle\b|\bheading\b/i.test(rest)) p.heading = true;
    return p;
  }
  if ((m = /^(chapter|section|title|part)\s+([IVXLC0-9]+[a-z]*)/i.exec(s))) return { kind: 'heading', level: m[1].toLowerCase(), no: m[2] };
  return { kind: 'other', text: s.slice(0, 80) };
}

/** Pfad -> Label im Stil der Vier-Spalten-Tabellen */
export function labelFromPath(p) {
  if (!p) return '';
  switch (p.kind) {
    case 'formula': return 'Formula';
    case 'citation': return `Citation ${p.no}`;
    case 'recital': return `Recital ${p.no}`;
    case 'heading': return `${p.level[0].toUpperCase()}${p.level.slice(1)} ${p.no}`;
    case 'annex': return `Annex ${p.annex}${p.part ? `, Part ${p.part}` : ''}${p.pt ? `, point ${p.pt.join(', point ')}` : ''}`;
    case 'article': {
      let s = `Article ${p.art}`;
      if (p.par && p.parStyle === 'ord') s += `, ${numOrd(p.par)} paragraph`;
      else if (p.par) s += `(${p.par})`;
      if (p.sub) s += `, ${numOrd(p.sub)} subparagraph`;
      if (p.intro) s += ', introductory part';
      if (p.pt && p.pt.length) s += p.pt.map((x) => `, point (${x})`).join('');
      if (p.heading) s += ', title';
      if (p.target) {
        const tg = p.target;
        const what = tg.annex ? `Annex ${tg.annex}` : tg.art ? `Article ${tg.art}${tg.par ? `(${tg.par})` : ''}${tg.pt ? tg.pt.map((x) => `(${x})`).join('') : ''}` : '';
        if (what) s += ` › ${tg.act ? tg.act + ' ' : ''}${what}`;
      }
      return s;
    }
    default: return p.text || '';
  }
}

export function groupOf(p) {
  if (!p) return 'other';
  if (p.kind === 'article') return `art_${p.art}`;
  if (p.kind === 'recital') return 'recitals';
  if (p.kind === 'citation' || p.kind === 'formula') return 'preamble';
  if (p.kind === 'annex') return `annex_${p.annex}`;
  if (p.kind === 'heading') return 'headings';
  return 'other';
}

export function pathKey(p) {
  if (!p) return '';
  switch (p.kind) {
    case 'formula': return 'formula';
    case 'citation': return `cit:${p.no}`;
    case 'recital': return `rec:${String(p.no).toLowerCase()}`;
    case 'heading': return `h:${p.level}:${p.no}`;
    case 'annex': return `anx:${p.annex}${p.part ? ':' + p.part : ''}${p.pt ? ':' + p.pt.join('.') : ''}`;
    case 'article': return `art:${p.art}${p.par ? ':p' + p.par : ''}${p.sub ? ':s' + p.sub : ''}${p.intro ? ':intro' : ''}${p.pt ? ':' + p.pt.join('.') : ''}${p.heading ? ':title' : ''}${p.target ? '>' + [p.target.act, p.target.annex ? 'anx' + p.target.annex : '', p.target.art, p.target.par, (p.target.pt || []).join('.'), p.target.heading ? 't' : ''].join(':') : ''}`;
    default: return `o:${(p.text || '').toLowerCase()}`;
  }
}

/** Basisakt -> Werk-Id der Bibliothek (data/works/index.json: sgk, ees, etias, vis, iop); andere Akte: "eu-<jahr>-<nr>" */
export const WORK_IDS = { '2016/399': 'sgk', '2017/2226': 'ees', '2018/1240': 'etias', '767/2008': 'vis', '2019/817': 'iop' };
export function workOf(act) {
  if (!act) return null;
  if (WORK_IDS[act]) return WORK_IDS[act];
  return `eu-${act.replace('/', '-')}`;
}

const OPEN_Q = /^[‘“'"«]\s*/;
const CLOSE_Q = /[’”'"»]\s*[;.,]?\s*$/;
const INSTR = /\b(is|are) (amended|replaced|inserted|added|deleted|renamed|renumbered)\b|\bthe following\b.*\b(is|are) (inserted|added)\b|\bis replaced by the following\b/i;

/**
 * Strukturverfolgung für Tabellen ohne Fundstellen-Zwischenzeilen und für fortlaufende Texte.
 * feed(text) liefert den Pfad der Texteinheit, die mit `text` beginnt.
 * Erkennt: Formel, Bezugsvermerke ("Having regard"), "Whereas:", Erwägungsgründe "(12)", "Article 5",
 * Absätze "1.", Buchstaben "(a)"/"a)", Ziffern "(i)"/"i)", Anhänge "ANNEX II", Kapitel/Titel.
 * Änderungsrechtsakte: "Regulation (EU) 2016/399 is amended as follows:", Änderungsbefehle "(3) Article 13 is replaced by
 * the following:", Unterbefehle "(a) point 27 is replaced", eingefügter Wortlaut in Anführungszeichen ("‘Article 13 …").
 * Pfad dann: { kind:"article", art:<Artikel des Änderungsakts>, pt:[<Befehl>, <Unterbefehl>?], target:{ act, art, par?, pt? } }.
 */
export class StructureTracker {
  constructor() {
    this.state = { zone: 'formula', art: null, par: null, pt: [], cit: 0, annex: null, lastRec: null, act: null, cmd: null, sub: null, target: null, inQuote: false };
  }
  _amendPath() {
    const st = this.state;
    const pt = [st.cmd, st.sub].filter(Boolean);
    const p = { kind: 'article', art: st.art, ...(pt.length ? { pt } : {}) };
    if (st.target) p.target = { act: st.act, ...clean(st.target) };
    return p;
  }
  feed(rawText) {
    const st = this.state;
    const t = String(rawText || '').replace(/\s+/g, ' ').trim();
    let m;
    if (!t) return { kind: 'other' };
    if (/^(proposal for a )?(regulation|directive|decision)\b.*\b(of the european parliament|of the council)/i.test(t) && st.zone === 'formula') return { kind: 'formula' };
    if (/^\d{4}\/\d{4}\s*\(COD\)$/i.test(t)) return { kind: 'formula' };
    if (/^THE EUROPEAN PARLIAMENT AND THE COUNCIL/i.test(t) || /^THE COUNCIL OF THE EUROPEAN UNION/i.test(t)) { st.zone = 'citations'; return { kind: 'formula' }; }
    if (/^(Having regard|After (transmission|consulting)|Acting in accordance|After consulting)/i.test(t)) { st.zone = 'citations'; st.cit++; return { kind: 'citation', no: String(st.cit) }; }
    if (/^Whereas:?$/i.test(t)) { st.zone = 'recitals'; return { kind: 'citation', no: 'whereas' }; }
    if (/^HA(VE|S) ADOPTED THIS (REGULATION|DIRECTIVE|DECISION)/i.test(t)) { st.zone = 'articles'; return { kind: 'formula', text: 'enacting' }; }
    if (!st.inQuote && (m = /^ANNEX\s*([IVXLC]+[a-z]*)?\b/.exec(t)) && t.length < 200 && /^ANNEX\b/.test(t)) { st.zone = 'annex'; st.annex = m[1] || 'I'; st.art = null; return { kind: 'annex', annex: st.annex }; }
    if (!st.inQuote && (m = /^(CHAPTER|TITLE|SECTION)\s+([IVXLC0-9]+[a-z]*)\b/.exec(t)) && t.length < 200) return { kind: 'heading', level: m[1].toLowerCase(), no: m[2] };
    // Artikelüberschrift des Rechtsakts selbst (nicht in Anführungszeichen)
    if (!st.inQuote && !OPEN_Q.test(t) && (m = /^Article\s+(\d+[a-z]*)\b(?!\s*\(|\s+of\b|\s+is\b|\s+are\b|\s+shall\b|\s+thereof)/.exec(t)) && t.length < (st.zone === 'recitals' ? 120 : 250)) {
      st.zone = 'articles'; st.art = m[1]; st.par = null; st.pt = []; st.act = null; st.cmd = null; st.sub = null; st.target = null; st.inQuote = false;
      return { kind: 'article', art: st.art, heading: true };
    }
    if ((st.zone === 'formula' || st.zone === 'citations') && /^\(\s*\d+[a-z]*\s*\)\s+\S/.test(t) && t.length > 40) st.zone = 'recitals';
    if (st.zone === 'recitals' && (m = /^\(\s*(\d+[a-z]*)\s*\)/.exec(t))) { st.lastRec = m[1]; return { kind: 'recital', no: m[1] }; }
    if (st.zone === 'recitals' && (m = /^\(\s*(-?\d*[a-z]*)\s*\)/.exec(t)) && m[1]) { st.lastRec = m[1]; return { kind: 'recital', no: m[1] }; }
    if (st.zone === 'annex' && !st.act) {
      if ((m = /^(\d+[a-z]*)\.\s/.exec(t))) return { kind: 'annex', annex: st.annex, pt: [m[1]] };
      return { kind: 'annex', annex: st.annex };
    }
    if (st.zone === 'articles' && st.art) {
      // Einleitung eines Änderungsartikels
      if (!st.inQuote && (m = /^(?:Regulation|Directive|Decision)\s+\((?:EU|EC|EEC)\)\s*(?:No\s*)?(\d{2,4}\/\d{1,4})\b.*\bis (?:hereby )?amended as follows/i.exec(t))) {
        st.act = m[1].length > 4 && /^\d{4}\//.test(m[1]) ? m[1] : m[1]; st.cmd = null; st.sub = null; st.target = null;
        return { kind: 'article', art: st.art, intro: true };
      }
      if (st.act) return this._amending(t);
      return this._plain(t);
    }
    if (st.zone === 'recitals' && st.lastRec) return { kind: 'recital', no: st.lastRec, cont: true };
    return { kind: st.zone === 'citations' ? 'citation' : 'other', ...(st.zone === 'citations' ? { no: String(st.cit) } : { text: t.slice(0, 60) }) };
  }
  _plain(t) {
    const st = this.state;
    let m;
    if ((m = /^(\d+[a-z]*)\.\s*/.exec(t))) { st.par = m[1]; st.pt = []; return { kind: 'article', art: st.art, par: st.par }; }
    const pm = /^\(?\s*([a-z]{1,2}|-[a-z])\s*\)/.exec(t);
    const roman = /^\(?\s*(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\s*\)/.exec(t);
    if (roman && st.pt.length && !(st.pt[0] === 'h' && roman[1] === 'i')) { const pt = [st.pt[0], roman[1]]; return { kind: 'article', art: st.art, ...(st.par ? { par: st.par } : {}), pt }; }
    if (pm) { st.pt = [pm[1]]; return { kind: 'article', art: st.art, ...(st.par ? { par: st.par } : {}), pt: [pm[1]] }; }
    if ((m = /^\(\s*(\d+[a-z]*)\s*\)/.exec(t))) { st.pt = [m[1]]; return { kind: 'article', art: st.art, ...(st.par ? { par: st.par } : {}), pt: [m[1]] }; }
    return { kind: 'article', art: st.art, ...(st.par ? { par: st.par } : {}), ...(st.pt.length ? { pt: st.pt.slice() } : {}), cont: true };
  }
  _amending(t) {
    const st = this.state;
    let m;
    const startsQuote = OPEN_Q.test(t);
    const endsQuote = CLOSE_Q.test(t) && !/^\(?[a-z0-9]+\)?\s*$/.test(t);
    if (!st.inQuote && !startsQuote) {
      // Änderungsbefehl "(3) Article 13 is replaced by the following:" / "(4) Chapter V is renamed"
      if ((m = /^\(\s*(\d+[a-z]*)\s*\)\s*(.*)$/.exec(t))) {
        st.cmd = m[1]; st.sub = null; st.target = targetOf(m[2], null);
        return this._amendPath();
      }
      // Unterbefehl "(a) point 27 is replaced by the following:"
      if ((m = /^\(?\s*([a-z]{1,2})\s*\)\s*(.*)$/.exec(t)) && st.cmd && INSTR.test(m[2])) {
        st.sub = m[1]; st.target = targetOf(m[2], st.target);
        return this._amendPath();
      }
      if (INSTR.test(t)) { st.target = targetOf(t, st.target); return this._amendPath(); }
    }
    if (startsQuote) st.inQuote = true;
    if (st.inQuote) {
      const body = t.replace(OPEN_Q, '');
      const tg = { ...(st.target || {}) };
      if ((m = /^Article\s+(\d+[a-z]*)\b/.exec(body)) && body.length < 250) { tg.art = m[1]; delete tg.par; delete tg.pt; tg.heading = true; }
      else if ((m = /^(\d+[a-z]*)\.\s/.exec(body))) { tg.par = m[1]; delete tg.pt; delete tg.heading; }
      else if ((m = /^\(?\s*(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\s*\)/.exec(body)) && tg.pt && tg.pt.length) { tg.pt = [tg.pt[0], m[1]]; delete tg.heading; }
      else if ((m = /^\(?\s*([a-z]{1,2})\s*\)/.exec(body))) { tg.pt = [m[1]]; delete tg.heading; }
      else if ((m = /^\(\s*(\d+[a-z]*)\s*\)/.exec(body))) { tg.pt = [m[1]]; delete tg.heading; }
      else if (/^ANNEX\b/.test(body)) { tg.annex = (/^ANNEX\s+([IVXLC]+)/.exec(body) || [])[1] || null; delete tg.art; }
      else delete tg.heading;
      st.target = tg;
      const p = this._amendPath();
      if (endsQuote) st.inQuote = false;
      return p;
    }
    return { ...this._amendPath(), cont: true };
  }
}

function clean(o) { const r = {}; for (const [k, v] of Object.entries(o || {})) if (v !== undefined && v !== null && !(Array.isArray(v) && !v.length)) r[k] = v; return r; }

/** Ziel eines Änderungsbefehls */
function targetOf(text, prev) {
  const t = String(text || '');
  let m;
  const out = {};
  if ((m = /\bArticles?\s+(\d+[a-z]*)(?:\((\d+[a-z]*)\))?/.exec(t))) { out.art = m[1]; if (m[2]) out.par = m[2]; }
  else if ((m = /\bAnnex(?:es)?\s+([IVXLC]+[a-z]*)/.exec(t))) out.annex = m[1];
  else if (prev) Object.assign(out, { art: prev.art, annex: prev.annex });
  if ((m = /\bparagraph\s+(\d+[a-z]*)/.exec(t)) && !out.par) out.par = m[1];
  if ((m = /\bpoints?\s+\(?([0-9a-z]+)\)?/.exec(t))) out.pt = [m[1]];
  return clean(out);
}

/** Pfad -> "amends"-Verweis für das SGK-Modul ({ work, unit, key? }) */
export function amendsOf(path) {
  const tg = path && path.target;
  if (!tg || !tg.act) return null;
  const work = workOf(tg.act);
  if (tg.annex) return { work, unit: `anx_${tg.annex}` };
  if (!tg.art) return null;
  const key = tg.par ? `p${tg.par}${tg.pt ? '.' + tg.pt.join('.') : ''}` : null;
  return { work, unit: `art_${tg.art}`, ...(key ? { key } : {}) };
}

/**
 * Änderungsbefehl in Änderungsverordnungen erkennen: "Article 8 is amended as follows", "in Article 2, point 5 is replaced",
 * "the following Article 25a is inserted". Liefert { work, unit, key? } oder null.
 * workMatch: Regex für den Basisakt (Standard: 2016/399 -> "sgk").
 */
export function detectAmends(text, context = {}) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const work = context.work || null;
  if (!work) return null;
  let m;
  if ((m = /^\(?\d+[a-z]*\)?\s*(?:in\s+)?Article\s+(\d+[a-z]*)(?:\((\d+[a-z]*)\))?\s*(?:,|is|are|shall)/i.exec(t))) {
    return { work, unit: `art_${m[1]}`, ...(m[2] ? { key: `p${m[2]}` } : {}) };
  }
  if ((m = /^\(?\d+[a-z]*\)?\s*the following Articles?\s+(\d+[a-z]*)/i.exec(t))) return { work, unit: `art_${m[1]}` };
  if ((m = /^\(?\d+[a-z]*\)?\s*Annex(?:es)?\s+([IVXLC]+)/i.exec(t))) return { work, unit: `anx_${m[1]}` };
  return null;
}

/**
 * Fundstellen eindeutig machen: kommt dieselbe Fundstelle in einem Dokument mehrfach vor (z. B. mehrere Zeilen "deleted" im
 * selben Änderungspunkt, zwei Zeilen "Formula" für die Unterschriften), wird die Zeilennummer der Tabelle angehängt:
 * "Article 4 [118]". Die Fundstelle der Quelle bleibt in sourceLabel erhalten. Verändert die Eingabe nicht.
 */
export function uniqueDerivedLabels(rows) {
  const count = new Map();
  for (const r of rows) count.set(r.label, (count.get(r.label) || 0) + 1);
  return rows.map((r) => (r.num && count.get(r.label) > 1 ? { ...r, label: `${r.label} [${r.num}]`, ...(r.labelSource === 'table' ? { sourceLabel: r.label } : {}) } : r));
}
