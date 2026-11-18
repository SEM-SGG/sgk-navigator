// SGK-Navigator, Modul Verhandlung — Kommissionsvorschlag aus EUR-Lex-HTML (ESM, isomorph)
//
// parseProposalHtml(htmlString, { DOMParser }) -> ParsedDoc
//   Eine Spalte (Index 0, Spur "com"). Je Absatz eine Zeile; Formel (Statut + Dokumenttyp + Titel) wird zusammengefasst.
//   Begründung (Explanatory Memorandum) und Finanzbogen werden übersprungen, Fussnoten an den Absatz gehängt
//   ("<br><sup>n</sup> Text"). Formate: COM-Dokumente (Klassen "Statut", "Titrearticle", "li ManualConsidrant" …) und
//   ABl.-Format ("oj-*", Listen als Tabellen) in vereinfachter Form.

import { StructureTracker, labelFromPath, groupOf, amendsOf } from './paths.js';
import { htmlToText, parseDateEn, parseProcedure, sanitizeInline, warn } from './util.js';

const FORMULA_CLASSES = ['Statut', 'Typedudocument', 'Titreobjet'];
const SKIP_CLASSES = ['footnote', 'Logo', 'cpMarking', 'pageBreak'];

function cls(el) { return (el.getAttribute && el.getAttribute('class')) || ''; }
function hasCls(el, c) { return (' ' + cls(el) + ' ').includes(' ' + c + ' '); }

/** Inline-HTML eines Elements (b i u s sup sub br), Fussnotenzeichen als <sup>n</sup> */
function inlineHtml(el, fnRefs) {
  let out = '';
  const walk = (n) => {
    if (n.nodeType === 3) { out += n.nodeValue.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]); return; }
    if (n.nodeType !== 1) return;
    const t = n.tagName.toLowerCase();
    if (t === 'a' && hasCls(n, 'footnoteRef')) { const id = (n.getAttribute('href') || '').replace(/^#/, ''); fnRefs.push(id); out += `<sup>${n.textContent.trim()}</sup>`; return; }
    if (t === 'a' && /^#(footnote|ntr)/.test(n.getAttribute('href') || '')) { const id = (n.getAttribute('href') || '').replace(/^#/, ''); fnRefs.push(id); out += `<sup>${n.textContent.replace(/[()\s]/g, '')}</sup>`; return; }
    if (t === 'br') { out += '<br>'; return; }
    if (t === 'span' && hasCls(n, 'FootnoteReference')) { n.childNodes.forEach(walk); return; }
    if (t === 'span' && hasCls(n, 'num')) { n.childNodes.forEach(walk); out += ' '; return; }
    const map = { b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', s: 's', strike: 's', del: 's', sup: 'sup', sub: 'sub' };
    let tagName = map[t] || null;
    const style = (n.getAttribute('style') || '').toLowerCase();
    if (!tagName && t === 'span') {
      if (hasCls(n, 'oj-bold') || /font-weight:\s*bold/.test(style)) tagName = 'b';
      else if (hasCls(n, 'oj-italic') || /font-style:\s*italic/.test(style)) tagName = 'i';
      else if (hasCls(n, 'oj-sup') || hasCls(n, 'Superscript')) tagName = 'sup';
    }
    if (tagName) out += `<${tagName}>`;
    n.childNodes.forEach(walk);
    if (tagName) out += `</${tagName}>`;
  };
  el.childNodes.forEach(walk);
  return out;
}

function tidy(html) {
  return sanitizeInline(html).replace(/[\s ]+/g, ' ').replace(/\s*<br>\s*/g, '<br>').replace(/(<br>){2,}/g, '<br>').replace(/^(\s|<br>)+|(\s|<br>)+$/g, '').replace(/<(b|i|u|s|sup|sub)>\s*<\/\1>/g, '').trim();
}

export function parseProposalHtml(html, { DOMParser } = {}) {
  const warnings = [];
  if (!DOMParser) throw new Error('DOMParser fehlt (Option { DOMParser })');
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const body = doc.body || doc.documentElement;
  const isOj = !!body.querySelector('[class^="oj-"], [class*=" oj-"]');
  // Fussnoten: <dd id="footnoteN"> (COM) bzw. <p class="oj-note"> (ABl.)
  const footnotes = new Map();
  for (const f of body.querySelectorAll('dd[id^="footnote"], p.oj-note')) {
    let id = f.getAttribute('id') || '';
    if (!id) { const a = f.querySelector('a[id]'); id = a ? a.getAttribute('id') : ''; }
    const txt = htmlToText(tidy(inlineHtml(f, []))).replace(/^\(?\d+\)?\s*/, '');
    if (id) footnotes.set(id, txt);
  }
  const meta = { kind: 'proposal', source: 'html', ref: null, date: null, procedure: null, title: null, classification: 'public' };
  const ri = body.querySelector('p.Rfrenceinstitutionnelle');
  if (ri) { const m = /COM\s*\((\d{4})\)\s*(\d+)/.exec(ri.textContent); if (m) meta.ref = `COM(${m[1]}) ${m[2]}`; }
  const em = body.querySelector('p.Emission');
  const dm = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec((em && em.textContent) || body.textContent.slice(0, 3000));
  if (dm) meta.date = `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
  meta.procedure = parseProcedure(body.textContent.slice(0, 20000));
  // Alle Absätze in Dokumentreihenfolge (ABl.-Listen als Tabellen werden aufgelöst)
  const all = [];
  const ojList = (table) => {
    for (const tr of table.querySelectorAll(':scope > tbody > tr, :scope > tr')) {
      const tds = tr.querySelectorAll(':scope > td');
      if (tds.length < 2) continue;
      const num = tds[0].textContent.trim();
      let first = true;
      for (const ch of tds[1].children) {
        const tn = ch.tagName.toLowerCase();
        if (tn === 'table') { ojList(ch); continue; }
        if (tn !== 'p') continue;
        const refs = [];
        const h = tidy(inlineHtml(ch, refs));
        all.push({ html: (first && num ? `${num} ` : '') + h, refs, cls: cls(ch) });
        first = false;
      }
    }
  };
  const visit = (el) => {
    for (const ch of Array.from(el.children)) {
      const t = ch.tagName.toLowerCase();
      if (SKIP_CLASSES.some((c) => hasCls(ch, c)) || t === 'dl' || t === 'dd') continue;
      if (t === 'table' && isOj) { ojList(ch); continue; }
      if (t === 'p') {
        const refs = [];
        const h = tidy(inlineHtml(ch, refs));
        if (h) all.push({ html: h, refs, cls: cls(ch) });
        continue;
      }
      if (ch.children.length) visit(ch);
    }
  };
  visit(body);
  // Verfügender Teil: ab Formel vor "THE EUROPEAN PARLIAMENT AND THE COUNCIL…" bis zum nächsten Deckblatt
  // bzw. Finanzbogen; Begründung und Deckblätter entfallen.
  const isFormula = (p) => FORMULA_CLASSES.some((c) => (' ' + p.cls + ' ').includes(' ' + c + ' '));
  const isCover = (p) => /\b(Rfrenceinstitutionnelle|Typedudocument_cp|Titreobjet_cp|Emission|Fait)\b/.test(p.cls) || /^LEGISLATIVE FINANCIAL STATEMENT/i.test(htmlToText(p.html));
  let i0 = all.findIndex((p) => /\bInstitutionquiagit\b/.test(p.cls) || /^THE (EUROPEAN PARLIAMENT AND THE )?COUNCIL OF THE EUROPEAN UNION/.test(htmlToText(p.html)));
  if (isOj) i0 = all.findIndex((p) => /oj-doc-ti/.test(p.cls));
  const paras = [];
  let rii = null;
  if (i0 < 0) warnings.push(warn('no-text', 'Kein verfügender Teil gefunden (Formel "THE EUROPEAN PARLIAMENT AND THE COUNCIL …" fehlt).'));
  else {
    let s0 = i0;
    while (s0 > 0 && isFormula(all[s0 - 1])) s0--;
    for (let k = s0 - 1; k >= 0 && k >= s0 - 4; k--) if (/Rfrenceinterinstitutionnelle/.test(all[k].cls)) { rii = all[k]; break; }
    for (let k = s0; k < all.length; k++) {
      if (k > i0 && isCover(all[k])) break;
      paras.push(all[k]);
    }
  }
  // Formel zusammenfassen
  const merged = [];
  if (rii) merged.push({ html: rii.html, refs: [], cls: 'formula' });
  for (const p of paras) {
    const prev = merged[merged.length - 1];
    if (prev && FORMULA_CLASSES.some((c) => p.cls.includes(c)) && FORMULA_CLASSES.some((c) => prev.cls.includes(c))) { prev.html += ' ' + p.html; prev.refs.push(...p.refs); continue; }
    merged.push({ ...p });
  }
  // Fussnoten anhängen
  for (const p of merged) {
    for (const id of p.refs) {
      const txt = footnotes.get(id);
      const n = (/(\d+)$/.exec(id) || [])[1];
      const sup = (p.html.match(/<sup>([^<]+)<\/sup>/g) || []).map((x) => x.replace(/<\/?sup>/g, ''));
      if (txt) p.html += `<br><sup>${sup.shift() || n || ''}</sup> ${txt.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}`;
    }
  }
  const tracker = new StructureTracker();
  const rows = merged.map((p) => {
    const text = htmlToText(p.html);
    const path = tracker.feed(text.split('\n')[0]);
    return { num: null, label: labelFromPath(path), labelSource: 'derived', path, group: groupOf(path), amends: amendsOf(path), status: null, cells: { 0: { html: p.html, text, status: null, empty: !text } } };
  });
  const titleRow = merged.find((p) => /REGULATION|DIRECTIVE|DECISION/.test(p.html) && FORMULA_CLASSES.some((c) => p.cls.includes(c)));
  meta.title = titleRow ? htmlToText(titleRow.html).replace(/\s+/g, ' ') : null;
  if (isOj) meta.kind = 'other';
  return { meta, columns: [{ index: 0, header: 'Commission proposal', suggestedTrack: 'com' }], rows, warnings, stats: { rows: rows.length, footnotes: footnotes.size, format: isOj ? 'oj' : 'com' } };
}
