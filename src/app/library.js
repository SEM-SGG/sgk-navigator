// Bibliothek der Rechtsakte (Etappe 3, Erweiterung 3): Werkwahl, Datensätze der weiteren Werke erst bei Bedarf entpacken,
// Zusatzdaten (Abweichungen, Begründung, Formulare) des SGK, Vorschau-Datensätze (Erweiterung 1).
// Der SGK bleibt in dataStore (dieselbe Data-Instanz wie bisher, Uploads eingeschlossen); weitere Werke liegen in workCache.
import { gunzipSync, strFromU8 } from 'fflate';
import { createStore } from './state.js';
import { dataStore } from './app.js';
import { Data } from './data.js';
import { resolveCelex, stageAt as libStageAt } from '../core/library.js';

/** Liest eingebettetes JSON (gz64 oder Klartext). */
export function readJsonScript(id) {
  const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
  if (!el) return null;
  const txt = el.textContent.trim();
  if (!txt) return null;
  if (el.dataset.enc === 'gz64') {
    const bin = atob(txt);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return JSON.parse(strFromU8(gunzipSync(u8)));
  }
  return JSON.parse(txt);
}

let index = null;
/** Werke der Bibliothek: [{ id, celex, number, short, abbr, full, assets }]; ohne Index nur der SGK. */
export function works() {
  if (index) return index;
  const list = readJsonScript('sgk-works');
  index = Array.isArray(list) && list.length ? list : [{ id: 'sgk', celex: '32016R0399', number: '(EU) 2016/399', full: true, assets: true }];
  return index;
}
export const workById = (id) => works().find((w) => w.id === id) || null;
export const DEFAULT_WORK = 'sgk';
export const validWork = (id) => (workById(id) ? id : DEFAULT_WORK);
export const workOfCelex = (celex) => resolveCelex(works(), celex);
export const stageAt = libStageAt;

/** Zähler: ändert sich, wenn ein Werk neu aufgebaut wurde (Upload), damit Ansichten neu rendern. */
export const libStore = createStore(0);
const cache = new Map();     // workId -> Data
const bases = new Map();     // workId -> { dataset, acts, assets, meta }
let baseMeta = {};

export function setLibraryMeta(meta) { baseMeta = meta || {}; }

/** Eingebettetes Bündel eines weiteren Werks (entpackt beim ersten Zugriff). */
export function workBundle(id) {
  if (id === DEFAULT_WORK) return null;
  if (bases.has(id)) return bases.get(id);
  const raw = readJsonScript('work-' + id);
  if (!raw) return null;
  const b = { dataset: raw.dataset, acts: raw.acts || [], assets: {}, meta: baseMeta, work: workById(id) };
  bases.set(id, b);
  return b;
}

/** Data-Instanz eines Werks (SGK: dataStore). */
export function workData(id) {
  const wid = validWork(id);
  if (wid === DEFAULT_WORK) return dataStore.get();
  if (cache.has(wid)) return cache.get(wid);
  const b = workBundle(wid);
  if (!b) return dataStore.get();
  const d = new Data(b);
  cache.set(wid, d);
  return d;
}
/** Ersetzt den Datensatz eines Werks (nach Upload). */
export function setWorkDataset(id, dataset) {
  if (id === DEFAULT_WORK) return;
  const b = workBundle(id);
  if (!b) return;
  cache.set(id, new Data({ ...b, dataset }));
  libStore.set((n) => n + 1);
}
export function useLibrary() { return libStore.use(); }

// ------------------------------------------------------------------ Zusatzdaten (nur SGK)
let extras = null;
export function sgkExtras() {
  if (extras) return extras;
  let derogations = [], rationale = {}, forms = [];
  try { derogations = readJsonScript('sgk-derogations') || []; } catch (e) { console.warn('derogations', e); }
  try { rationale = readJsonScript('sgk-rationale') || {}; } catch (e) { console.warn('rationale', e); }
  try { forms = readJsonScript('sgk-forms') || []; } catch (e) { console.warn('forms', e); }
  const formIdx = new Map();
  for (const f of forms) formIdx.set(`${f.unit}|${f.key}|${f.lang}|${f.asset}`, f);
  extras = { derogations, rationale, forms, formIdx };
  return extras;
}
/** Transkription zu einem Bild-Block (oder null). */
export function formFor(data, unitId, block, lang) {
  if (!data || data.workId !== DEFAULT_WORK || !block || block.ty !== 'img') return null;
  return sgkExtras().formIdx.get(`${unitId}|${block.k}|${lang}|${block.asset}`) || null;
}

/** Werkkürzel in der gewünschten Sprache */
export function workAbbr(w, lang) { return (w && w.abbr && (w.abbr[lang] || w.abbr.de)) || (w && w.id) || ''; }
export function workShort(w, lang) { return (w && w.short && (w.short[lang] || w.short.de)) || workAbbr(w, lang); }
