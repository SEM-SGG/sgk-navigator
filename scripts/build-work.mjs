#!/usr/bin/env node
// SGK-Navigator — baut ein weiteres Werk der Bibliothek (Etappe 3) reproduzierbar aus raw/.
//
// Aufruf:
//   node scripts/build-work.mjs <id> <celex> [--offline]   ein Werk, z. B. node scripts/build-work.mjs ees 32017R2226
//   node scripts/build-work.mjs all [--offline]              alle Werke aus scripts/works-config.mjs, danach data/works/index.json
//   node scripts/build-work.mjs sgk [--dry-run]              nur: Einheit Erwägungsgründe in data/dataset.json ergänzen (mit Nachweis;
//                                                            --dry-run prüft und protokolliert nur, ohne zu schreiben)
//
// Ablauf je Werk:
//   1. Konsolidierte Fassungen per SPARQL ermitteln (alle CELEX 0<jjjj><R><nnnn>-*); Ergebnis und Akt-Metadaten werden in
//      scripts/out/works/<id>.sources.json zwischengespeichert. --offline (oder SPARQL nicht erreichbar): nur dieser Zwischenspeicher.
//   2. Fehlende Dateien nach raw/<CELEX>_<LANG>.html laden (scripts/lib-fetch.mjs: EUR-Lex, sonst Cellar). Nicht ladbare Sprachfassungen
//      werden protokolliert; ein Stand ohne DE, FR und EN entfällt (Grund im Zwischenspeicher und in data/VALIDATION_WORKS.md).
//   3. Jede Fassung mit src/core/parser.js parsen; Stände: s00 = ABl.-Fassung, danach je konsolidierte Fassung (nach Datum) ein Stand.
//      stage.acts = CELEX der Akte, die im Vergleich zur Vorfassung neu in der Modifikatorenliste stehen (Vereinigung über die Sprachen).
//   4. Datensatz mit src/core/model.js buildDataset (Herkunft je Block aus den Markern), Einheit Erwägungsgründe (rct) aus der ABl.-Fassung.
//   5. Schlanke Akt-Metadaten: Titel wörtlich aus Cellar (expression_title), Fundstellen aus der Modifikatorentabelle der Fassungen,
//      Änderungen je Einheit aus den Markern. Anwendbarkeit: status "unknown" (nicht geprüft).
//   6. Ausgabe atomar: data/works/<id>.dataset.json, data/works/<id>.acts.json; bei "all" zusätzlich data/works/index.json.
//
// Weiteres Werk hinzufügen: Eintrag in scripts/works-config.mjs (WORKS: celex, number, short, abbr; TOPICS für neue Akte),
// dann `node scripts/build-work.mjs <id> <celex>`, `node scripts/build-work.mjs all` (Index) und `node scripts/validate-works.mjs`.
// Bilder werden nicht eingebettet (Block ty "img" mit asset null und Alternativtext; die Oberfläche verlinkt auf EUR-Lex).

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { DOMParser } from './lib-dom.mjs';
import { parseEurLex, htmlToText } from '../src/core/parser.js';
import { buildDataset, getVersion } from '../src/core/model.js';
import { normText } from '../src/core/text.js';
import { fetchDoc, appendFetchLog, consolidatedVersions, sparql } from './lib-fetch.mjs';
import { WORKS, TOPICS, CORR_WORD, LANGS } from './works-config.mjs';
import { recitalsUnit, withRecitals, withoutRecitals, modifierRows, ojOfRow, baseOjRef, attributeStage, readRawFile, hasRaw, RECITALS_ID } from './lib-works.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '..');
export const RAW = resolve(ROOT, 'raw');
export const OUT = resolve(ROOT, 'data/works');
const CACHE = resolve(ROOT, 'scripts/out/works');
export const GENERATED = process.env.SGK_GENERATED || '2026-11-12';

export function writeAtomic(file, content) {
  const tmp = file + '.tmp-' + process.pid;
  writeFileSync(tmp, content);
  renameSync(tmp, file);
}
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const isoToDmy = (iso) => { const [y, m, d] = iso.split('-'); return `${+d}.${+m}.${y}`; };
const isCorr = (c) => /R\(\d+\)$/.test(c);
const baseOfCorr = (c) => c.replace(/R\(\d+\)$/, '');

// ------------------------------------------------------------------ Cellar-Metadaten (wörtlich)
function sparqlMeta(celexList) {
  const vals = celexList.map((c) => `"${c}"^^<http://www.w3.org/2001/XMLSchema#string>`).join(' ');
  const rows = sparql(`PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
SELECT DISTINCT ?celex ?lang ?title ?doc ?eif ?eli WHERE { VALUES ?celex { ${vals} } ?w cdm:resource_legal_id_celex ?celex .
 OPTIONAL { ?w cdm:work_date_document ?doc } OPTIONAL { ?w cdm:resource_legal_date_entry-into-force ?eif } OPTIONAL { ?w cdm:resource_legal_eli ?eli }
 OPTIONAL { ?e cdm:expression_belongs_to_work ?w . ?e cdm:expression_uses_language ?l . ?e cdm:expression_title ?title .
   BIND(STRAFTER(STR(?l), "language/") AS ?lang) FILTER(?lang IN ("DEU", "FRA", "ENG")) } }`);
  const L = { DEU: 'de', FRA: 'fr', ENG: 'en' };
  const out = {};
  for (const r of rows) {
    const m = out[r.celex] || (out[r.celex] = { title: {}, adopted: null, eif: [], eli: null });
    if (r.lang && r.title) m.title[L[r.lang]] = r.title.replace(/\s+/g, ' ').trim();
    if (r.doc) m.adopted = r.doc;
    if (r.eif && r.eif > '1900' && !m.eif.includes(r.eif)) m.eif.push(r.eif);
    if (r.eli) m.eli = r.eli;
  }
  for (const m of Object.values(out)) m.eif.sort();
  return out;
}

function loadCache(id) {
  const f = resolve(CACHE, `${id}.sources.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
}
function saveCache(id, obj) {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
  writeAtomic(resolve(CACHE, `${id}.sources.json`), JSON.stringify(obj, null, 1) + '\n');
}

// ------------------------------------------------------------------ Notizen je Stand
function noteOj(ojRef) {
  return {
    de: `Amtsblattfassung (${ojRef.de}), von EUR-Lex.`,
    fr: `Version publiée au JO (${ojRef.fr}), depuis EUR-Lex.`,
    en: `Official Journal version (${ojRef.en}), from EUR-Lex.`,
  };
}
function noteCons(iso, langs) {
  const d = isoToDmy(iso);
  const only = langs.length < 3 ? { de: ` Nur ${langs.map((l) => l.toUpperCase()).join(', ')} verfügbar.`, fr: ` Disponible uniquement en ${langs.map((l) => l.toUpperCase()).join(', ')}.`, en: ` Available only in ${langs.map((l) => l.toUpperCase()).join(', ')}.` } : { de: '', fr: '', en: '' };
  return {
    de: `Konsolidierte Fassung vom ${d}, von EUR-Lex.${only.de}`,
    fr: `Version consolidée du ${d}, depuis EUR-Lex.${only.fr}`,
    en: `Consolidated version of ${d}, from EUR-Lex.${only.en}`,
  };
}

// ------------------------------------------------------------------ Herkunftswechsel ohne Textänderung
// Ein Block, dessen Wortlaut (normalisiert) gegenüber der Vorfassung gleich bleibt, behält die Herkunft der Vorfassung:
// o bezeichnet den Akt der letzten Wortlautänderung. Grund: Marker der konsolidierten Fassungen sind nicht immer genau
// (z. B. fehlt in 02017R2226-20181009 DE nach ▼C1 der Rückwechsel ▼B, sodass Art. 61 ff. bis zum nächsten Marker der
// Berichtigung zugeschrieben würden; in der Folgefassung steht wieder ▼B). Ohne diese Regel entstünden Scheinänderungen.
// Versionen, die danach mit der Vorfassung übereinstimmen, entfallen. Jeder Fall wird protokolliert (VALIDATION_WORKS.md).
function keepOriginWithoutTextChange(ds) {
  const om = new Map(ds.stages.map((s) => [s.id, s.order]));
  const kept = [];
  const nt = (b) => (b.ty === 'img' ? 'IMG' : normLbl(b.l) + '\u2046' + normText(b.t || '', { caseFold: b.ty === 'heading' }));
  for (const [uid, u] of Object.entries(ds.units)) {
    for (const [lang, vs] of Object.entries(u.versions)) {
      vs.sort((a, b) => om.get(a.stage) - om.get(b.stage));
      for (let i = 1; i < vs.length; i++) {
        const prev = vs[i - 1], v = vs[i];
        if (prev.repealed || v.repealed) continue;
        const pm = new Map(prev.blocks.map((b) => [b.k, b]));
        for (const b of v.blocks) {
          const p = pm.get(b.k);
          if (p && b.o !== p.o && nt(b) === nt(p) && !b.x) { kept.push({ unit: uid, lang, stage: v.stage, key: b.k, marker: b.o, kept: p.o }); b.o = p.o; }
        }
        const same = prev.blocks.length === v.blocks.length && normText(prev.title || '', { caseFold: true }) === normText(v.title || '', { caseFold: true })
          && v.blocks.every((b, j) => b.k === prev.blocks[j].k && b.o === prev.blocks[j].o && nt(b) === nt(prev.blocks[j]));
        if (same) {
          // unveränderte Version: Darstellung der Vorfassung gilt weiter
          vs.splice(i, 1); i--;
        }
      }
    }
  }
  return kept;
}

// Nummer "(EU) 2024/1356" bzw. "(EG) Nr. 810/2009" aus dem deutschen Titel (Cellar); für Berichtigungen die des berichtigten Akts
function numberOf(c, meta, cfg, baseCelex) {
  if (c === baseCelex) return cfg.number;
  const m = meta[c] || null;
  const t = m && (m.title.de || '');
  const mm = t && t.match(/\((EU|EG|EWG)\)\s*(Nr\.\s*)?\d+\/\d+/);
  if (mm) return mm[0].replace(/\s+/g, ' ');
  // Berichtigungen ohne deutsche Fassung: Nummer aus dem Titel der berichtigten Fassung in einer anderen Sprache ist sprachabhängig; daher aus der CELEX
  const y = c.slice(1, 5), n = String(+c.slice(6, 10));
  return +y >= 2015 ? `(EU) ${y}/${n}` : null;
}

// ------------------------------------------------------------------ Gliederungszeichen als Teil des Vergleichs
// model.js vergleicht Blöcke nur über den Text; eine Änderung allein des Gliederungszeichens (z. B. Berichtigung 32019R0817R(01):
// «„da)» wird «„db)» in Art. 62 Nr. 5 Bst. a IO-VO) bliebe sonst unsichtbar und die alte Darstellung stünde im neuen Stand.
// Darum wird das normalisierte Zeichen (ohne Klammern, Punkte, Anführungszeichen, Leerraum; Kleinschreibung) für den Aufbau
// vorübergehend dem Text vorangestellt und danach wieder entfernt. Der gespeicherte Wortlaut ist unverändert.
const LBL = /^\u2045([^\u2046]*)\u2046 /;
const normLbl = (l) => htmlToText(l || '').toLowerCase().replace(/[\s()\[\].„“”"«»‘’‚'‹›]/g, '');
function withLabelInText(p) {
  return { ...p, units: p.units.map((u) => ({ ...u, blocks: u.blocks.map((b) => (b.ty === 'img' || b.ty === 'table' ? b : { ...b, t: `\u2045${normLbl(b.l)}\u2046 ${b.t}` })) })) };
}
function stripLabelFromText(ds, log) {
  for (const u of Object.values(ds.units)) for (const vs of Object.values(u.versions)) for (const v of vs) for (const b of v.blocks) if (typeof b.t === 'string') b.t = b.t.replace(LBL, '');
  for (const e of log) { if (typeof e.before === 'string') e.before = e.before.replace(LBL, ''); if (typeof e.after === 'string') e.after = e.after.replace(LBL, ''); }
}

// ------------------------------------------------------------------ Schlüssel nach Sprachmehrheit angleichen
// Fälle: (a) die Quelle führt in einer Sprache dasselbe Gliederungszeichen zweimal (EES 20260612 FR Art. 9: zweimal «2 bis.»;
// DE «(2a)», «(2b)»), der Parser vergibt "p2a~2"; (b) eine Sprachfassung schreibt Absatznummern anders als üblich (IO-VO ABl. DE
// Art. 16 und 74: «1.» statt «(1)», daher Aufzählungsschlüssel n1 statt p1). Regel: Stimmen in einem Stand zwei Sprachen in allen
// Schlüsseln einer Einheit überein, hat die dritte gleich viele Blöcke und an jeder abweichenden Stelle ein Gliederungszeichen mit
// demselben Kern (ohne Klammern und Punkte, z. B. «1.» = «(1)», «2 bis.» ≠ «2b» ausgenommen bei «~»), übernimmt die dritte die
// Schlüssel der beiden anderen, in diesem und allen späteren Ständen. Das Gliederungszeichen l bleibt wie in der Quelle. Protokolliert.
function alignKeysToMajority(ds) {
  const fixed = [];
  const om = new Map(ds.stages.map((s) => [s.id, s.order]));
  const core = (l) => normLbl(l).replace(/^([0-9]+)(bis)$/, '$1a');
  for (const [uid, u] of Object.entries(ds.units)) {
    for (const st of ds.stages) {
      const vs = Object.fromEntries(LANGS.map((l) => [l, (u.versions[l] || []).find((v) => v.stage === st.id) || null]));
      for (const lang of LANGS) {
        const v = vs[lang];
        const [oa, ob] = LANGS.filter((l) => l !== lang).map((l) => getVersion(ds, uid, l, st.id));
        if (!v || v.repealed || !oa || !ob || oa.repealed || ob.repealed) continue;
        if (oa.blocks.length !== v.blocks.length || ob.blocks.length !== v.blocks.length) continue;
        if (oa.blocks.some((b, i) => b.k !== ob.blocks[i].k)) continue;
        const diffs = v.blocks.map((b, i) => [b, oa.blocks[i]]).filter(([b, a]) => b.k !== a.k);
        if (!diffs.length) continue;
        const ok = diffs.every(([b, a]) => b.k.includes('~') || core(b.l) === core(a.l));
        const target = new Set(oa.blocks.map((b) => b.k));
        if (!ok || target.size !== oa.blocks.length) continue;
        const map = new Map(diffs.map(([b, a]) => [b.k, a.k]));
        for (const w of u.versions[lang]) {
          if (om.get(w.stage) < st.order || w.repealed) continue;
          const have = new Set(w.blocks.map((b) => b.k));
          if (w !== v && [...map.values()].some((k) => have.has(k) && !map.has(k))) continue;
          for (const b of w.blocks) if (map.has(b.k)) b.k = map.get(b.k);
        }
        fixed.push({ unit: uid, stage: st.id, lang, map: Object.fromEntries(map), labels: diffs.map(([b]) => b.l).join(' ') });
      }
    }
  }
  return fixed;
}

// ------------------------------------------------------------------ Werk bauen
export function buildWork(id, celex, { offline = false, log = console.log } = {}) {
  const cfg = WORKS[id];
  if (!cfg) throw new Error(`Werk ${id} fehlt in scripts/works-config.mjs`);
  if (cfg.celex !== celex) throw new Error(`Werk ${id}: CELEX ${celex} passt nicht zu ${cfg.celex}`);
  const cache = loadCache(id) || {};
  // 1. Fassungen
  let versions = null, versionsFrom = 'cache';
  if (!offline) {
    try { versions = consolidatedVersions(celex); versionsFrom = 'sparql'; } catch (e) { log(`SPARQL nicht erreichbar (${e.message.split('\n')[0]}), Zwischenspeicher`); }
  }
  if (!versions) versions = cache.versions;
  if (!versions) throw new Error(`Werk ${id}: keine Fassungsliste (SPARQL und Zwischenspeicher fehlen)`);
  versions = versions.slice().sort((a, b) => a.slice(-8).localeCompare(b.slice(-8)));
  // 2. Laden
  const fetchLog = [];
  const avail = {};
  for (const c of [celex, ...versions]) {
    avail[c] = [];
    for (const lang of LANGS) {
      if (!hasRaw(RAW, c, lang) && !offline) fetchDoc(RAW, c, lang, fetchLog);
      if (hasRaw(RAW, c, lang)) avail[c].push(lang);
    }
  }
  appendFetchLog(resolve(ROOT, 'scripts/out/fetch-log.json'), fetchLog);
  if (avail[celex].length !== 3) throw new Error(`Werk ${id}: ABl.-Fassung nicht in allen Sprachen vorhanden (${avail[celex].join(',')})`);
  // 3. Parsen
  const parsed = {};
  const parse = (c, lang) => {
    const k = c + '_' + lang;
    if (!parsed[k]) {
      const p = parseEurLex(readRawFile(RAW, c, lang), { DOMParser });
      if (p.lang !== lang) throw new Error(`${c} ${lang}: Sprache der Datei ist ${p.lang}`);
      parsed[k] = p;
    }
    return parsed[k];
  };
  const skipped = [];
  const stagesIn = [];
  const p0 = Object.fromEntries(LANGS.map((l) => [l, parse(celex, l)]));
  if (LANGS.some((l) => p0[l].kind !== 'oj')) throw new Error(`${celex}: keine ABl.-Fassung`);
  // Fundstelle des Basisakts aus dem Kopf der jüngsten konsolidierten Fassung je Sprache
  const baseOj = {};
  for (const lang of LANGS) {
    for (const c of versions.slice().reverse()) { if (avail[c].includes(lang)) { baseOj[lang] = baseOjRef(readRawFile(RAW, c, lang)); if (baseOj[lang]) break; } }
  }
  stagesIn.push({ celex, kind: 'oj', date: p0.de.date, langs: LANGS.slice(), byLang: p0 });
  for (const c of versions) {
    if (!avail[c].length) { skipped.push({ celex: c, reason: 'keine Sprachfassung DE, FR oder EN ladbar' }); continue; }
    const byLang = Object.fromEntries(avail[c].map((l) => [l, parse(c, l)]));
    const date = `${c.slice(-8, -4)}-${c.slice(-4, -2)}-${c.slice(-2)}`;
    for (const [l, p] of Object.entries(byLang)) {
      if (p.kind !== 'consolidated') throw new Error(`${c} ${l}: Format ${p.kind}, erwartet konsolidiert`);
      if (p.date && p.date !== date) log(`Hinweis: ${c} ${l}: Datum im Kopf ${p.date} statt ${date}`);
    }
    stagesIn.push({ celex: c, kind: 'consolidated', date, langs: avail[c].slice(), byLang });
  }
  // Modifikatoren je Stand (Vereinigung über die Sprachen) und neu eingearbeitete Akte
  let prev = new Set();
  const input = [];
  stagesIn.forEach((s, i) => {
    const mods = [];
    for (const lang of s.langs) for (const m of s.byLang[lang].modifiers) if (m.celex !== celex && !mods.includes(m.celex)) mods.push(m.celex);
    // Reihenfolge: Änderungsakte vor Berichtigungen, sonst wie in der Modifikatorenliste
    mods.sort((a, b) => (isCorr(a) - isCorr(b)));
    const cur = new Set(mods);
    const acts = i === 0 ? [celex] : mods.filter((m) => !prev.has(m));
    s.allMods = mods;
    s.dropped = i === 0 ? [] : [...prev].filter((m) => !cur.has(m));
    prev = new Set([...prev, ...cur]);
    const sid = 's' + String(i).padStart(2, '0');
    const stage = {
      id: sid, act: acts[0] || s.celex, acts, order: i, date: s.date,
      source: { kind: s.kind, celex: s.celex, note: s.kind === 'oj' ? noteOj(baseOj) : noteCons(s.date, s.langs) },
      langs: s.langs,
    };
    s.stage = stage;
    input.push({ stage, byLang: Object.fromEntries(Object.entries(s.byLang).map(([l, p]) => [l, withLabelInText(p)])) });
  });
  // 4. Datensatz
  const buildLog = [];
  const meta = (() => {
    const all = new Set([celex]);
    for (const s of stagesIn) for (const m of s.allMods) all.add(m);
    let m = null;
    if (!offline) { try { m = sparqlMeta([...all]); } catch (e) { log(`SPARQL (Metadaten) nicht erreichbar: ${e.message.split('\n')[0]}`); } }
    if (m && cache.meta) for (const c of all) if (!m[c] && cache.meta[c]) m[c] = cache.meta[c];
    return m || cache.meta || {};
  })();
  const bm = meta[celex] || { title: {} };
  for (const l of LANGS) if (!bm.title[l]) throw new Error(`${celex}: amtlicher Titel ${l} fehlt (Cellar)`);
  const work = {
    id, celex, eli: `http://data.europa.eu/eli/reg/${celex.slice(1, 5)}/${+celex.slice(6)}`,
    title: { de: bm.title.de, fr: bm.title.fr, en: bm.title.en }, short: cfg.short, abbr: cfg.abbr, number: cfg.number,
  };
  let ds = buildDataset(input, null, { work, generated: GENERATED, assets: null, log: buildLog });
  stripLabelFromText(ds, buildLog);
  // Bilder: nicht eingebettet
  for (const u of Object.values(ds.units)) for (const vs of Object.values(u.versions)) for (const v of vs) for (const b of v.blocks) if (b.ty === 'img') b.asset = null;
  const keysAligned = alignKeysToMajority(ds);
  const originKept = keepOriginWithoutTextChange(ds);
  const rct = recitalsUnit(RAW, celex, 's00');
  ds = withRecitals(ds, rct);
  // 5. Akte
  const attributions = [];
  for (const s of stagesIn.slice(1)) {
    const newActs = s.stage.acts.slice();
    const att = attributeStage(ds, s.stage, s.byLang, { newActs, listed: s.allMods, dropped: s.dropped });
    attributions.push(...att.map((a) => ({ stage: s.stage.id, ...a })));
    // stage.acts: neu gelistete Akte und Akte, deren Marker in dieser Fassung erstmals Änderungen tragen
    for (const a of att) if (a.explained && a.act && !a.x && !s.stage.acts.includes(a.act) && a.why && a.why.startsWith('Marker eines bereits')) s.stage.acts.push(a.act);
    s.stage.act = s.stage.acts[0] || s.celex;
    const dst = ds.stages.find((x) => x.id === s.stage.id); // buildDataset arbeitet mit Kopien der Stand-Objekte
    dst.acts = s.stage.acts.slice(); dst.act = s.stage.act;
  }
  const rowsBy = {};  // celex -> lang -> row (jüngste Fassung, die den Akt führt)
  for (const s of stagesIn.slice(1)) for (const lang of s.langs) {
    for (const r of modifierRows(readRawFile(RAW, s.celex, lang))) { (rowsBy[r.celex] = rowsBy[r.celex] || {})[lang] = r; }
  }
  const actIds = [celex, ...new Set(stagesIn.flatMap((s) => s.allMods))];
  const firstStage = (c) => (stagesIn.find((s) => s.stage.acts.includes(c)) || {}).stage;
  const acts = actIds.map((c) => {
    const m = meta[c] || { title: {}, eif: [] };
    const corr = isCorr(c);
    const kind = c === celex ? 'base' : corr ? 'corrigendum' : 'amendment';
    const st = c === celex ? ds.stages[0] : firstStage(c);
    const title = {};
    for (const l of LANGS) title[l] = m.title[l] || null;
    const oj = {};
    let published = null;
    if (c === celex) { for (const l of LANGS) oj[l] = baseOj[l] || null; published = p0.de.date; }
    else for (const l of LANGS) { const r = rowsBy[c] && rowsBy[c][l]; const o = r ? ojOfRow(r, l, c) : { oj: null }; oj[l] = o.oj; if (o.published) published = published || o.published; }
    const corrected = corr ? baseOfCorr(c) : null;
    let number = numberOf(corr ? corrected : c, meta, cfg, celex);
    if (corr) number = (number || corrected) + ', Berichtigung ' + c.match(/R\(\d+\)$/)[0];
    const langs = corr ? LANGS.filter((l) => stagesIn.some((s) => s.langs.includes(l) && s.byLang[l].modifiers.some((x) => x.celex === c))) : null;
    const topicBase = TOPICS[corr ? corrected : c] || null;
    const topic = corr ? Object.fromEntries(LANGS.map((l) => [l, CORR_WORD[l] + (topicBase ? ' ' + topicBase[l] : '')])) : topicBase;
    // Änderungen je Einheit aus den Markern (alle Sprachen)
    const byUnit = new Map();
    for (const a of attributions) {
      if (a.act !== c) continue;
      const e = byUnit.get(a.unit) || { unit: a.unit, key: null, action: null, keys: new Set(), stage: a.stage, kinds: new Set() };
      if (a.key && a.key !== '_title') e.keys.add(a.key);
      e.kinds.add(a.change);
      byUnit.set(a.unit, e);
    }
    const changes = [...byUnit.values()].map((e) => {
      const prevV = ds.units[e.unit] && ds.units[e.unit].versions.de ? ds.units[e.unit].versions.de.filter((v) => ds.stages.find((s) => s.id === v.stage).order < ds.stages.find((s) => s.id === e.stage).order) : [];
      const existed = prevV.length && !prevV[prevV.length - 1].repealed;
      const action = e.kinds.has('repealed') ? 'deleted' : !existed && e.kinds.has('inserted') ? 'inserted' : 'amended';
      return { unit: e.unit, key: null, action, keys: [...e.keys], stage: e.stage, applicableFrom: null };
    });
    const tocIdx = new Map(ds.toc.map((t, i) => [t.id, i]));
    changes.sort((a, b) => (tocIdx.get(a.unit) ?? 1e9) - (tocIdx.get(b.unit) ?? 1e9));
    const entry = {
      celex: c, kind, number, topic, title,
      adopted: corr ? null : (m.adopted || null),
      published, oj, inForce: corr ? null : (m.eif && m.eif.length ? m.eif[0] : null),
      application: {
        status: 'unknown', date: null, basis: null,
        note: { de: 'Anwendbarkeit nicht geprüft.', fr: 'Applicabilité non vérifiée.', en: 'Applicability not checked.' },
      },
      changes, langs, eurlex: `https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:${c}`,
      stage: st ? st.id : null, confidence: 'check',
      checkNote: 'Metadaten maschinell aus Cellar (SPARQL) und dem Kopf der konsolidierten Fassungen; Anwendbarkeit nicht geprüft.',
    };
    if (corr) entry.corrects = corrected;
    if (c === celex) entry.changes = [];
    return entry;
  });
  acts.sort((a, b) => (a.kind === 'base' ? -1 : b.kind === 'base' ? 1 : (a.published || '9').localeCompare(b.published || '9') || a.celex.localeCompare(b.celex)));
  // 6. Ausgabe
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  const dsJson = JSON.stringify(ds);
  const actsJson = JSON.stringify(acts, null, 1) + '\n';
  writeAtomic(resolve(OUT, `${id}.dataset.json`), dsJson);
  writeAtomic(resolve(OUT, `${id}.acts.json`), actsJson);
  saveCache(id, {
    id, celex, versionsFrom, versions, skipped,
    availability: avail,
    stages: stagesIn.map((s) => ({ id: s.stage.id, celex: s.celex, date: s.date, langs: s.langs, acts: s.stage.acts, modifiers: s.allMods, droppedFromList: s.dropped })),
    recitals: rct.info,
    attributions: { total: attributions.length, unexplained: attributions.filter((a) => !a.explained) },
    meta,
    output: { dataset: { bytes: Buffer.byteLength(dsJson), sha256: sha256(dsJson) }, acts: { bytes: Buffer.byteLength(actsJson), sha256: sha256(actsJson) } },
    editorial: buildLog.filter((x) => x.kind === 'editorial'),
    originKept,
    keysAligned,
  });
  const nVer = Object.values(ds.units).reduce((a, u) => a + Object.values(u.versions).reduce((b, v) => b + v.length, 0), 0);
  log(`${id}: ${ds.stages.length} Stände, ${Object.keys(ds.units).length} Einheiten, ${nVer} Versionen, ${acts.length} Akte, ${(dsJson.length / 1e6).toFixed(2)} MB` + (skipped.length ? `; ausgelassen: ${skipped.map((s) => s.celex).join(', ')}` : ''));
  return { ds, acts };
}

// ------------------------------------------------------------------ Index
export function writeIndex() {
  const idx = [{
    id: 'sgk', celex: '32016R0399', number: '(EU) 2016/399', dataset: '../dataset.json', acts: '../acts.json', assets: '../assets.json',
    short: { de: 'Schengener Grenzkodex', fr: 'Code frontières Schengen', en: 'Schengen Borders Code' }, abbr: { de: 'SGK', fr: 'CFS', en: 'SBC' }, full: true,
    // Erwägungsgründe des SGK als separate Datei ({ toc, unit }); die Oberfläche hängt die Einheit rct ein (toc an erster Stelle)
    recitals: 'sgk.recitals.json',
  }];
  for (const [id, w] of Object.entries(WORKS)) {
    if (!existsSync(resolve(OUT, `${id}.dataset.json`))) continue;
    idx.push({ id, celex: w.celex, number: w.number, dataset: `${id}.dataset.json`, acts: `${id}.acts.json`, assets: null, short: w.short, abbr: w.abbr, full: false });
  }
  writeAtomic(resolve(OUT, 'index.json'), JSON.stringify(idx, null, 1) + '\n');
  return idx;
}

// ------------------------------------------------------------------ SGK: Einheit Erwägungsgründe ergänzen
// Nachweis: data/dataset.json ohne rct muss byte-identisch mit dem Ausgangsstand sein.
export function addRecitalsToSgk({ log = console.log, dryRun = false } = {}) {
  const file = resolve(ROOT, 'data/dataset.json');
  const before = readFileSync(file, 'utf8');
  const obj = JSON.parse(before);
  const baseline = JSON.stringify(withoutRecitals(obj));
  const hadRct = !!obj.units[RECITALS_ID];
  if (!hadRct && baseline !== before) throw new Error('data/dataset.json ist nicht in kompakter Normalform (JSON.stringify), Nachweis nicht möglich');
  const rct = recitalsUnit(RAW, '32016R0399', 's00');
  const next = JSON.stringify(withRecitals(obj, rct));
  const check = JSON.stringify(withoutRecitals(JSON.parse(next)));
  if (check !== baseline) throw new Error('SGK: Ergänzung um rct verändert andere Teile des Datensatzes');
  if (!dryRun) writeAtomic(file, next);
  // Einheit und toc-Eintrag zusätzlich einzeln, damit sie ohne Neubau eingefügt werden können (withRecitals in scripts/lib-works.mjs)
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  writeAtomic(resolve(OUT, 'sgk.recitals.json'), JSON.stringify({ toc: rct.toc, unit: rct.unit }));
  const proof = { dryRun, baselineSha256: sha256(baseline), afterSha256: sha256(next), afterWithoutRctSha256: sha256(check), identical: check === baseline, hadRct, recitals: rct.info, bytesBefore: Buffer.byteLength(baseline), bytesAfter: Buffer.byteLength(next) };
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
  writeAtomic(resolve(CACHE, 'sgk.recitals-proof.json'), JSON.stringify(proof, null, 1) + '\n');
  log(`SGK: Einheit rct ${dryRun ? 'geprüft (nicht geschrieben)' : 'ergänzt'} (${rct.info.de.recitals} Erwägungsgründe), übrige Teile byte-identisch: ${proof.identical}`);
  return proof;
}

async function main() {
  const args = process.argv.slice(2);
  const offline = args.includes('--offline');
  const pos = args.filter((a) => !a.startsWith('--'));
  if (!pos.length) { console.error('Aufruf: node scripts/build-work.mjs <id> <celex> | all | sgk'); process.exit(2); }
  const t0 = Date.now();
  if (pos[0] === 'sgk') { addRecitalsToSgk({ dryRun: args.includes('--dry-run') }); return; }
  if (pos[0] === 'all') {
    for (const [id, w] of Object.entries(WORKS)) buildWork(id, w.celex, { offline });
  } else {
    const id = pos[0];
    const celex = pos[1] || (WORKS[id] && WORKS[id].celex);
    buildWork(id, celex, { offline });
  }
  writeIndex();
  console.log(`fertig in ${Date.now() - t0} ms`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
