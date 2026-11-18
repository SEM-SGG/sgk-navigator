// Vorschau hängiger Vorschläge (Etappe 3, Erweiterung 1, Seite Rechtsakte).
// Ein Dossier des Moduls Verhandlung (nur gelesen) wird mit buildPreview (src/neg/preview.js) auf den geltenden Stand eines Werks
// angewandt. Das Ergebnis wird als zusätzlicher Stand ("pv", bei zwei Spuren "pv1"/"pv2") in eine Kopie des Datensatzes eingefügt,
// damit Lesen, Chronologie, Vergleich und Exportkarten unverändert damit arbeiten. Nur Englisch (Verhandlungssprache).
import { buildPreview } from '../neg/preview.js';
import { Data } from './data.js';
import { workData, validWork, workById } from './library.js';
import { readDossier, listStore, loadList } from './modules/neg/store.js';
import { demoList, embeddedDemo, docsOfTrack } from './modules/neg/core.js';
import { todayIso } from './lib/format.js';
import { workNum } from './modules/sgk/workbar.js';

/** "d-2024-0670~council~latest" -> { dossier, track, doc|null } */
export function parsePv(pv) {
  const [dossier, track, doc] = String(pv || '').split('~');
  if (!dossier || !track) return null;
  return { dossier, track, doc: doc && doc !== 'latest' ? doc : null };
}
export const makePv = (dossier, track, doc) => `${dossier}~${track}~${doc || 'latest'}`;
/** zweite Spur: "<track>~<doc|latest>" */
export function parsePv2(pv2) {
  const [track, doc] = String(pv2 || '').split('~');
  return track ? { track, doc: doc && doc !== 'latest' ? doc : null } : null;
}

// ------------------------------------------------------------------ Dossiers (nur lesend)
const DEMO_DTC = 'demo-dtc';
let demoCache = null;
function demos() {
  if (demoCache) return demoCache;
  demoCache = new Map();
  return demoCache;
}
/** Beispiel-Dossier aus der HTML-Datei (ohne Speichern). */
export function demoDossier(key = DEMO_DTC) {
  const c = demos();
  if (c.has(key)) return c.get(key);
  let d = null;
  try { d = embeddedDemo(key); } catch (e) { console.warn('Beispiel-Dossier', e); }
  if (d) c.set(key, d);
  return d;
}
export const hasDemo = (key = DEMO_DTC) => demoList().some((x) => x.key === key);
export const DEMO_KEY = DEMO_DTC;

/** Gespeicherte Dossiers (Kurzangaben) plus geladene Beispiele. */
export async function listDossiers() {
  if (!listStore.get().loaded) { try { await loadList(); } catch { /* ohne Speicher */ } }
  const items = (listStore.get().items || []).map((x) => ({ id: x.id, title: x.short || x.title, procedure: x.procedure, stored: true }));
  for (const [, d] of demos()) if (!items.some((x) => x.id === d.id)) items.push({ id: d.id, title: d.short || d.title, procedure: d.procedure, stored: false, demo: true });
  return items;
}

const dossierCache = new Map();
/** Dossier lesen: Speicher des Moduls Verhandlung, sonst eingebettetes Beispiel mit derselben Id. */
export async function getDossier(id) {
  let d = null;
  try { d = await readDossier(id); } catch { d = null; }
  if (d) { dossierCache.set(id, d); return d; }
  for (const [, x] of demos()) if (x.id === id) return x;
  for (const m of demoList()) {
    const x = demoDossier(m.key);
    if (x && x.id === id) return x;
  }
  return dossierCache.get(id) || null;
}

/** Spuren mit Zellen und ihre Fassungen (Dokumente) */
export function tracksOf(d) {
  return (d.tracks || []).map((tr) => ({ id: tr.id, label: tr.label, docs: docsOfTrack(d, tr.id) })).filter((x) => x.docs.length);
}

// ------------------------------------------------------------------ Vorschau-Datensatz
const resultCache = new Map();
function preview(d, sel, data) {
  const key = [d.id, d.updated || '', sel.track, sel.doc || 'latest', data.workId, data.latest.id, data.stages.length].join('|');
  if (resultCache.has(key)) return resultCache.get(key);
  const res = buildPreview(d, { track: sel.track, doc: sel.doc || undefined }, data.ds, { lang: 'en', baseStage: data.latest.id, act: workNum(data.wk || workById(data.workId)) });
  resultCache.set(key, res);
  return res;
}

const unitKind = (id) => (/^anx_/.test(id) ? { type: 'annex', num: id.slice(4) } : /^art_/.test(id) ? { type: 'article', num: id.slice(4) } : { type: 'article', num: id });
const numKey = (n) => { const m = /^(\d+)([a-z]*)$/.exec(String(n)); if (!m) return 1e9; const x = m[2] || ''; return Number(m[1]) * 1e4 + (x ? (x.charCodeAt(0) - 96) * 100 : 0) + (x.length > 1 ? x.charCodeAt(1) - 96 : 0); };

/**
 * Data mit Vorschaustand(en). sels: [{ track, doc }] (eine oder zwei Spuren).
 * Ergebnis: Data mit data.preview = { dossier, runs: [{ stage, tag, track, doc, res }] }.
 */
export function previewData(base, d, sels) {
  const ds0 = base.ds;
  let order = Math.max(...ds0.stages.map((s) => s.order)) + 1;
  const stages = [...ds0.stages];
  const units = { ...ds0.units };
  const toc = [...ds0.toc];
  const acts = [...base.actList];
  const runs = sels.map((sel, i) => {
    const res = preview(d, sel, base);
    const stage = sels.length > 1 ? 'pv' + (i + 1) : 'pv';
    const tag = `preview:${d.id}:${sel.track}`; // = Herkunft o der geänderten Blöcke (buildPreview)
    return { stage, tag, track: sel.track, doc: sel.doc || null, res };
  });
  const trackLabel = (id) => { const tr = (d.tracks || []).find((x) => x.id === id); return tr ? tr.label : { de: id, fr: id, en: id }; };
  const docOf = (id) => (d.documents || []).find((x) => x.id === id) || null;
  for (const r of runs) {
    const tl = trackLabel(r.track);
    const doc = r.doc ? docOf(r.doc) : null;
    const ref = doc ? doc.ref || doc.title : null;
    stages.push({ id: r.stage, act: r.tag, acts: [r.tag], order: order++, date: todayIso(), langs: ['en'], trackLabel: tl,
      source: { kind: 'preview', celex: null, note: { de: 'Vorschau, hypothetisch, nicht amtlich', fr: 'Aperçu hypothétique, non officiel', en: 'Preview, hypothetical' } } });
    if (!acts.some((a) => a.celex === r.tag)) acts.push({ celex: r.tag, kind: 'proposal', preview: true, number: `${d.short || d.procedure || d.id}: ${tl.de || r.track}${ref ? ', ' + ref : ''}`,
      numberFr: `${d.short || d.procedure || d.id}: ${tl.fr || r.track}${ref ? ', ' + ref : ''}`,
      topic: { de: 'Vorschau', fr: 'Aperçu', en: 'Preview' }, application: { status: 'pending', date: null }, procedure: { stage: 'open' } });
  }
  const touched = new Set(runs.flatMap((r) => Object.keys(r.res.units)));
  for (const u of touched) {
    const orig = ds0.units[u];
    const baseV = orig ? base.version(u, 'en', base.latest.id) : null;
    const en = orig ? [...(orig.versions.en || [])] : [];
    for (const r of runs) {
      const x = r.res.units[u];
      let v = x ? x.previewVersion : baseV;
      if (!v) v = { repealed: true, absent: true, blocks: [], label: '', title: '' };
      en.push({ ...v, stage: r.stage });
    }
    const k = unitKind(u);
    units[u] = orig ? { ...orig, versions: { ...orig.versions, en } } : { id: u, type: k.type, num: k.num, versions: { en } };
    if (!orig && !toc.some((e) => e.id === u)) {
      // neue Einheit nach der vorangehenden Einheit gleicher Art einordnen
      let at = -1, parent = null;
      toc.forEach((e, i) => { if (e.type === k.type && numKey(e.num) < numKey(k.num)) { at = i; parent = e.parent || null; } });
      toc.splice(at + 1, 0, { id: u, type: k.type, parent, num: k.num, from: runs[0].stage, to: null, preview: true });
    }
  }
  const ds = { ...ds0, stages, units, toc };
  const out = new Data({ dataset: ds, acts, assets: base.assets, meta: base.meta, work: base.wk });
  out.preview = { dossier: { id: d.id, title: d.title, short: d.short, procedure: d.procedure, demo: !!d.demo }, runs, trackLabel, docOf, base: base.latest.id, touched: [...touched] };
  out.workId = base.workId;
  return out;
}

const dataCache = new Map();
/** Data für eine Exportkarte bzw. Ansicht: Vorschau (spec.pv) oder Werk (spec.w). */
export async function dataFor(spec) {
  if (!spec || !spec.pv) return workData(validWork(spec && spec.w));
  const sel = parsePv(spec.pv);
  if (!sel) return workData(validWork(spec.w));
  const d = await getDossier(sel.dossier);
  if (!d) throw new Error('Dossier ' + sel.dossier);
  const base = workData(validWork(spec.w));
  const s2 = parsePv2(spec.pv2);
  const sels = [{ track: sel.track, doc: sel.doc }, ...(s2 ? [s2] : [])];
  const key = [d.id, d.updated || '', JSON.stringify(sels), base.workId, base.latest.id, base.stages.length].join('|');
  if (dataCache.has(key)) return dataCache.get(key);
  const pd = previewData(base, d, sels);
  dataCache.set(key, pd);
  return pd;
}
