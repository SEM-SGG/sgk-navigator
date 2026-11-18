// Gemeinsame Hilfen fuer scripts/build-work.mjs, scripts/build-data.mjs und scripts/validate-works.mjs
// (nur Node-Skripte; raw/ wird gelesen und geparst, nie ausgefuehrt)
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DOMParser } from './lib-dom.mjs';
import { parseRecitals, htmlToText, cleanSpace } from '../src/core/parser.js';
import { changesOfStage, getVersion } from '../src/core/model.js';
import { LANGS } from './works-config.mjs';

export const RECITALS_LABEL = { de: 'Erwägungsgründe', fr: 'Considérants', en: 'Recitals' };
export const RECITALS_ID = 'rct';

export function rawFile(rawDir, celex, lang) { return resolve(rawDir, `${celex}_${lang.toUpperCase()}.html`); }
export function readRawFile(rawDir, celex, lang) { return readFileSync(rawFile(rawDir, celex, lang), 'utf8'); }
export function hasRaw(rawDir, celex, lang) { return existsSync(rawFile(rawDir, celex, lang)); }

// ------------------------------------------------------------------ Erwaegungsgruende als Einheit
// Bloecke r1 … rN (l "(1)") aus der ABl.-Fassung; weitere Absaetze/Aufzaehlungen eines Erwaegungsgrunds als rN.s2, rN.a …
export function recitalBlocks(html, baseCelex) {
  const r = parseRecitals(html, { DOMParser });
  const blocks = [];
  for (const rec of r.recitals) {
    const b = { k: rec.k, d: 0, l: rec.l, t: rec.t, o: baseCelex };
    if (rec.fn && rec.fn.length) b.fn = rec.fn;
    blocks.push(b);
    for (const s of rec.sub) {
      const c = { k: s.k, d: s.d, l: s.l || '', t: s.t, o: baseCelex };
      if (s.fn && s.fn.length) c.fn = s.fn;
      blocks.push(c);
    }
  }
  return { parsed: r, blocks };
}

export function recitalsUnit(rawDir, baseCelex, stageId = 's00') {
  const unit = { id: RECITALS_ID, type: 'recitals', num: null, versions: {} };
  const info = {};
  for (const lang of LANGS) {
    const { parsed, blocks } = recitalBlocks(readRawFile(rawDir, baseCelex, lang), baseCelex);
    if (parsed.lang && parsed.lang !== lang) throw new Error(`Erwägungsgründe ${baseCelex}: Sprache ${parsed.lang} statt ${lang}`);
    unit.versions[lang] = [{ stage: stageId, label: RECITALS_LABEL[lang], title: '', blocks }];
    info[lang] = { recitals: parsed.recitals.length, blocks: blocks.length };
  }
  return { unit, toc: { id: RECITALS_ID, type: 'recitals', parent: null, num: null, from: stageId, to: null }, info };
}

// Datensatz um die Einheit Erwaegungsgruende ergaenzen (toc-Eintrag an erster Stelle, Einheit am Ende von units)
export function withRecitals(ds, rct) {
  const out = { ...ds, toc: [rct.toc, ...ds.toc.filter((e) => e.id !== RECITALS_ID)], units: { ...ds.units } };
  delete out.units[RECITALS_ID];
  out.units[RECITALS_ID] = rct.unit;
  return out;
}
export function withoutRecitals(ds) {
  const out = { ...ds, toc: ds.toc.filter((e) => e.id !== RECITALS_ID), units: { ...ds.units } };
  delete out.units[RECITALS_ID];
  return out;
}

// ------------------------------------------------------------------ Modifikatorentabelle im Kopf konsolidierter Fassungen
// Liefert je CELEX: { celex, marker, kind: 'amendment'|'corrigendum', cells: [...] } (Zelltexte wörtlich, Leerraum vereinheitlicht)
export function modifierRows(html) {
  const rows = [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const hd of doc.querySelectorAll('p.hd-modifiers')) {
    let t = hd.nextElementSibling;
    while (t && t.tagName.toLowerCase() !== 'table') t = t.nextElementSibling;
    if (!t) continue;
    for (const tr of t.querySelectorAll('tr')) {
      const a = tr.querySelector('p.arrow a[title]');
      if (!a) continue;
      const marker = cleanSpace(a.textContent).replace(/[►▼\s]/g, '');
      const cells = Array.from(tr.querySelectorAll('td')).slice(1).map((td) => cleanSpace(td.textContent).trim());
      rows.push({ celex: a.getAttribute('title').trim(), marker, cells, corr: /^C\d+$/.test(marker) });
    }
  }
  return rows;
}

// Amtsblattfundstelle aus einer Zeile "L 243 | 1 | 15.9.2009" (Aenderungsakt) bzw. "Berichtigung, ABl. L 284 vom 12.11.2018, S. 39 (767/2008)"
const OJ_FMT = {
  de: (n, d, p) => `ABl. ${n} vom ${d}, S. ${p}`,
  fr: (n, d, p) => `JO ${n} du ${d}, p. ${p}`,
  en: (n, d, p) => `OJ ${n}, ${d}, p. ${p}`,
};
const OJ_FMT_NEW = { de: (y, n, d) => `ABl. L, ${y}/${n}, ${d}`, fr: (y, n, d) => `JO L, ${y}/${n}, ${d}`, en: (y, n, d) => `OJ L, ${y}/${n}, ${d}` };
export function dmyToIso(s) {
  const m = String(s || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}
export function ojOfRow(row, lang, celex) {
  if (row.corr) {
    const t = row.cells[0] || '';
    const m = t.match(/^(?:Berichtigung|Rectificatif|Corrigendum)\s*,\s*(.+?)\s*\([^()]*\)\s*$/);
    const ref = m ? m[1] : null;
    return { oj: ref, published: ref ? dmyToIso(ref) : null };
  }
  const [, num, page, date] = row.cells;
  if (!num || !date) return { oj: null, published: null };
  const iso = dmyToIso(date);
  const n = num.replace(/\s+/g, ' ').trim();
  const actNo = String(+celex.slice(6, 10));
  // Amtsblatt als Einzelakte (ab 1.10.2023): EUR-Lex fuehrt "L <Aktnummer>", Seite 1; amtliche Zitierweise "ABl. L, 2024/1356, 22.5.2024"
  if (iso && iso >= '2023-10-01' && n === `L ${actNo}` && page === '1') return { oj: OJ_FMT_NEW[lang](celex.slice(1, 5), actNo, date), published: iso };
  return { oj: OJ_FMT[lang](n, date, page), published: iso };
}

// Fundstelle des Basisakts im Kopf der konsolidierten Fassung: "(ABl. L 218 vom 13.8.2008, S. 60)"
export function baseOjRef(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const p = doc.querySelector('p.title-doc-oj-reference');
  return p ? cleanSpace(p.textContent).trim().replace(/^\(/, '').replace(/\)$/, '') : null;
}

// ------------------------------------------------------------------ Aenderungen eines Stands und ihre Herkunft
// Je Sprache die Aenderungen gegenueber der Vorfassung (changesOfStage) mit dem verursachenden Akt:
//   Block eingefuegt/ersetzt: b.o; Block gestrichen bzw. Einheit aufgehoben: DELETED-Marker der geparsten Fassung;
//   Titel: titleOrigin. explained = Akt ist in diesem Stand neu eingearbeitet (stage.acts).
// opts.listed: alle Akte der Modifikatorenliste dieser Fassung; opts.dropped: Akte, die gegenüber der Vorfassung aus der Liste fielen
export function attributeStage(ds, stage, parsedByLang, opts = {}) {
  const res = [];
  const acts = new Set(opts.newActs || stage.acts || [stage.act]);
  const listed = new Set(opts.listed || []);
  const dropped = new Set(opts.dropped || []);
  const prevStage = ds.stages.filter((s) => s.order < stage.order).sort((a, b) => b.order - a.order)[0];
  for (const lang of stage.langs) {
    const p = parsedByLang[lang];
    const pu = new Map(p ? p.units.map((u) => [u.id, u]) : []);
    for (const c of changesOfStage(ds, stage.id, lang)) {
      const u = pu.get(c.unit);
      let act = null, how = null, x = null;
      if (c.key === '_title') { act = u ? u.titleOrigin || null : null; how = 'titleOrigin'; }
      else if (c.change === 'deleted' || c.change === 'repealed') {
        const dels = u ? (u.deletions || []).map((d) => d.act) : [];
        const hit = dels.find((a) => acts.has(a));
        act = hit || dels[0] || null; how = dels.length ? 'DELETED-Marker' : (u ? 'ohne Marker' : 'Einheit fehlt');
        if (!act && !u && p) {
          // Einheit fehlt ganz: DELETED-Marker "▼Mn —————" an ihrer Stelle steht am Ende der vorangehenden Einheit
          const order = ds.toc.filter((t) => t.type === 'article' || t.type === 'annex').map((t) => t.id);
          for (let i = order.indexOf(c.unit) - 1; i >= 0; i--) {
            const pu2 = pu.get(order[i]);
            if (!pu2) continue;
            const tail = (pu2.deletions || []).filter((d) => d.at >= pu2.blocks.length);
            if (tail.length) { act = tail[tail.length - 1].act; how = `DELETED-Marker am Ende von ${pu2.id}`; }
            break;
          }
        }
      } else {
        const v = getVersion(ds, c.unit, lang, stage.id);
        const b = v && v.blocks ? v.blocks.find((y) => y.k === c.key) : null;
        act = b ? b.o : null; how = 'Herkunft o'; x = b ? b.x || null : null;
      }
      let explained = !!act && acts.has(act) && !x;
      let why = explained ? 'Marker eines neu gelisteten Akts' : null;
      if (!explained && act && !x && listed.has(act) && act !== ds.work.celex) {
        explained = true; why = 'Marker eines bereits gelisteten Akts: Änderung erst in dieser Fassung konsolidiert';
      }
      if (!explained && dropped.size && prevStage) {
        // Rücknahme: Akt fällt aus der Modifikatorenliste, Bestimmung kehrt ohne Marker zum früheren Wortlaut zurück bzw. entfällt
        const pv = getVersion(ds, c.unit, lang, prevStage.id);
        const pb = pv && pv.blocks && c.key ? pv.blocks.find((y) => y.k === c.key) : null;
        if (pb && dropped.has(pb.o)) { explained = true; why = `Rücknahme ohne Marker: ${pb.o} nicht mehr in der Modifikatorenliste`; act = act || pb.o; }
      }
      res.push({ lang, unit: c.unit, key: c.key, change: c.change, act, how, x, explained, why });
    }
  }
  // Folgeanpassung ohne Marker: Zeichensetzung oder Konjunktion ("und", "oder", ";" statt ".") eines Nachbarpunkts, wenn im selben
  // Stand ein neu eingearbeiteter Akt einen Punkt mit demselben übergeordneten Schlüssel eingefügt oder gestrichen hat
  const parentOf = (k) => (k && k.includes('.') ? k.slice(0, k.lastIndexOf('.')) : '');
  // Wegfall ohne Löschmarker bei Neufassung: ein Block entfällt, während im selben Stand ein übergeordneter oder benachbarter Block
  // (gleicher übergeordneter Schlüssel) mit dem Marker eines eingearbeiteten Akts ersetzt oder eingefügt wird (z. B. "Absatz 2 erhält folgende
  // Fassung" mit weniger Buchstaben als zuvor)
  for (const r of res) {
    if (r.explained || r.change !== 'deleted') continue;
    const rel = res.find((o) => o !== r && o.lang === r.lang && o.unit === r.unit && o.explained && !o.x && o.act && (o.change === 'inserted' || o.change === 'replaced')
      && (parentOf(o.key) === parentOf(r.key) || String(r.key).startsWith(o.key + '.')));
    if (rel) { r.explained = true; r.act = rel.act; r.why = `Wegfall bei Neufassung von ${rel.key} durch ${rel.act}, ohne Löschmarker`; }
  }
  // Unterblöcke eines erklärt gestrichenen Blocks
  for (const r of res) {
    if (r.explained || r.change !== 'deleted') continue;
    const anc = res.find((o) => o !== r && o.lang === r.lang && o.unit === r.unit && o.explained && o.change === 'deleted' && String(r.key).startsWith(o.key + '.'));
    if (anc) { r.explained = true; r.act = anc.act; r.why = `mit ${anc.key} entfallen (${anc.why})`; }
  }
  for (const r of res) {
    if (r.explained || !r.x) continue;
    const sib = res.find((o) => o !== r && o.lang === r.lang && o.unit === r.unit && (o.change === 'inserted' || o.change === 'deleted')
      && o.act && o.explained && !o.x
      && (parentOf(o.key) === parentOf(r.key) || (r.x === 'punct' && (parentOf(o.key) === '' || String(r.key).startsWith(parentOf(o.key) + '.')))));
    if (sib) { r.explained = true; r.why = `Folgeanpassung (${r.x === 'punct' ? 'Zeichensetzung' : 'Wortlaut'}) zu ${sib.change === 'inserted' ? 'eingefügtem' : 'gestrichenem'} ${sib.key} (${sib.act}), ohne Marker in der Quelle`; }
  }
  return res;
}

// Text eines Datensatz-Stands in Dokumentreihenfolge (wie scripts/validate.mjs, ohne Bilder und ohne Erwaegungsgruende)
export function concatDataset(ds, stageId, lang) {
  const om = new Map(ds.stages.map((s) => [s.id, s.order]));
  const ord = om.get(stageId);
  const parts = [];
  for (const e of ds.toc) {
    if (e.type === 'recitals') continue;
    if (e.type !== 'article' && e.type !== 'annex') {
      if (om.get(e.from) > ord) continue;
      let h = null;
      for (const x of (e.heading && e.heading[lang]) || []) if (om.get(x.from) <= ord) h = x;
      if (h) parts.push(h.label, h.text);
      continue;
    }
    const v = getVersion(ds, e.id, lang, stageId);
    if (!v || v.repealed) continue;
    parts.push(v.label, v.title || '');
    for (const b of v.blocks) { if (b.ty === 'img') continue; parts.push(b.l || '', b.t); }
  }
  return parts.join(' ');
}

export function plain(h) { return htmlToText(h || ''); }
