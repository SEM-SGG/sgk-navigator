// Upload einer konsolidierten Fassung: gleiche Aufbereitung wie im zentralen Build (Äquivalenztest test/app/equiv.test.mjs).
//
// SGK (full): der zentrale Build arbeitet die jüngste Fassung mit addSnapshot ein (scripts/build-data.mjs), also genau wie der
// Upload; keine Nachbearbeitung.
// Weitere Werke (full: false): scripts/build-work.mjs baut alle Stände mit buildDataset und bearbeitet danach nach. Dieselben
// Schritte führt der Upload hier für den hochgeladenen Stand aus (portiert, Verhalten gleich; Quelle der Regeln und Begründung
// dort):
//   1. Gliederungszeichen als Teil des Vergleichs (withLabelInText / stripLabelFromText)
//   2. Bilder ohne eingebettete Daten (asset null, die Oberfläche verlinkt auf EUR-Lex)
//   3. stage.langs = eingelesene Sprachen (wie im zentralen Build: verfügbare Sprachen, nicht nur geänderte)
//   4. Schlüssel nach Sprachmehrheit angleichen (alignKeysToMajority), sobald alle Sprachen des Werks eingelesen sind
//   5. Herkunft ohne Textänderung beibehalten, unveränderte Versionen entfernen (keepOriginWithoutTextChange)
// Alle Funktionen sind rein (ohne Browser-APIs) und verändern den übergebenen Datensatz.
import { normText } from '../../core/text.js';
import { htmlToText } from '../../core/parser.js';
import { getVersion } from '../../core/model.js';

const LBL = /^⁅([^⁆]*)⁆ /;
export const normLbl = (l) => htmlToText(l || '').toLowerCase().replace(/[\s()\[\].„“”"«»‘’‚'‹›]/g, '');
const prefixable = (b) => b.ty !== 'img' && b.ty !== 'table' && typeof b.t === 'string';

/** Parser-Ergebnis mit Gliederungszeichen im Text (wie build-work.mjs withLabelInText). */
export function withLabelInText(p) {
  return { ...p, units: p.units.map((u) => ({ ...u, blocks: u.blocks.map((b) => (prefixable(b) ? { ...b, t: `⁅${normLbl(b.l)}⁆ ${b.t}` } : b)) })) };
}
/** Alle Versionen eines Datensatzes vorübergehend mit Gliederungszeichen im Text versehen bzw. es wieder entfernen. */
export function labelsIntoText(ds) {
  for (const u of Object.values(ds.units)) for (const vs of Object.values(u.versions)) for (const v of vs) for (const b of v.blocks) if (prefixable(b) && !LBL.test(b.t)) b.t = `⁅${normLbl(b.l)}⁆ ${b.t}`;
}
export function labelsOutOfText(ds) {
  for (const u of Object.values(ds.units)) for (const vs of Object.values(u.versions)) for (const v of vs) for (const b of v.blocks) if (typeof b.t === 'string') b.t = b.t.replace(LBL, '');
}

/** Schlüssel nach Sprachmehrheit angleichen, nur im Stand stageId und danach (build-work.mjs alignKeysToMajority). */
export function alignKeysToMajority(ds, stageId) {
  const fixed = [];
  const LANGS = ds.langs || ['de', 'fr', 'en'];
  const om = new Map(ds.stages.map((s) => [s.id, s.order]));
  const st = ds.stages.find((s) => s.id === stageId);
  if (!st || LANGS.length !== 3) return fixed;
  const core = (l) => normLbl(l).replace(/^([0-9]+)(bis)$/, '$1a');
  for (const [uid, u] of Object.entries(ds.units)) {
    for (const lang of LANGS) {
      const v = (u.versions[lang] || []).find((x) => x.stage === st.id) || null;
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
      fixed.push({ unit: uid, stage: st.id, lang, map: Object.fromEntries(map) });
    }
  }
  return fixed;
}

/** Herkunft ohne Textänderung beibehalten; Versionen des Stands, die danach der Vorfassung gleichen, entfallen. */
export function keepOriginWithoutTextChange(ds, stageId) {
  const om = new Map(ds.stages.map((s) => [s.id, s.order]));
  const kept = [];
  const nt = (b) => (b.ty === 'img' ? 'IMG' : normLbl(b.l) + '⁆' + normText(b.t || '', { caseFold: b.ty === 'heading' }));
  for (const [uid, u] of Object.entries(ds.units)) {
    for (const [lang, vs] of Object.entries(u.versions)) {
      vs.sort((a, b) => om.get(a.stage) - om.get(b.stage));
      const i = vs.findIndex((v) => v.stage === stageId);
      if (i < 1) continue;
      const prev = vs[i - 1], v = vs[i];
      if (prev.repealed || v.repealed) continue;
      const pm = new Map(prev.blocks.map((b) => [b.k, b]));
      for (const b of v.blocks) {
        const p = pm.get(b.k);
        if (p && b.o !== p.o && nt(b) === nt(p) && !b.x) { kept.push({ unit: uid, lang, key: b.k, marker: b.o, kept: p.o }); b.o = p.o; }
      }
      const same = prev.blocks.length === v.blocks.length && normText(prev.title || '', { caseFold: true }) === normText(v.title || '', { caseFold: true })
        && v.blocks.every((b, j) => b.k === prev.blocks[j].k && b.o === prev.blocks[j].o && nt(b) === nt(prev.blocks[j]));
      if (same) vs.splice(i, 1);
    }
  }
  return kept;
}

/**
 * Fassung einer Sprache einarbeiten wie der zentrale Build.
 * addSnapshot: Kernfunktion; ds wird verändert (der Aufrufer übergibt eine Kopie); full: Werk mit Ständen je Änderungsakt (SGK).
 */
export function addUploadedSnapshot(addSnapshot, ds, parsed, opts = {}, { full = true } = {}) {
  if (full) return addSnapshot(ds, parsed, opts);
  labelsIntoText(ds);
  try {
    addSnapshot(ds, withLabelInText(parsed), opts);
  } finally {
    labelsOutOfText(ds);
  }
  const st = [...ds.stages].sort((a, b) => b.order - a.order).find((s) => s.source && s.source.celex === parsed.celex);
  if (!st) return ds;
  for (const u of Object.values(ds.units)) for (const v of u.versions[parsed.lang] || []) if (v.stage === st.id) for (const b of v.blocks) if (b.ty === 'img') b.asset = null;
  if (!st.langs.includes(parsed.lang)) st.langs.push(parsed.lang);
  const LANGS = ds.langs || ['de', 'fr', 'en'];
  st.langs.sort((a, b) => LANGS.indexOf(a) - LANGS.indexOf(b));
  if (LANGS.every((l) => st.langs.includes(l))) alignKeysToMajority(ds, st.id);
  keepOriginWithoutTextChange(ds, st.id);
  return ds;
}
