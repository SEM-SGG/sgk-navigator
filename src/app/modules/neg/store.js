// Persistenz und Zustand des Moduls Verhandlung.
// IndexedDB "sgk-navigator-neg" (eigene Datenbank, unabhängig vom SGK-Modul): Store "dossiers" (ganzes Dossier je Id),
// Store "kv" (Liste der Dossiers mit Kurzangaben). Automatisch speichern (verzögert), Statusanzeige, Rückgängig.
import { createStore, getState, go } from '../../state.js';
import { toast } from '../../app.js';
import { t } from '../../lib/i18n.js';
import { exportDossier, importDossier, embeddedDemo, topClassification } from './core.js';

const DB = 'sgk-navigator-neg';
let dbp = null;
function openDb() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in window) || !window.indexedDB) { reject(new Error('IndexedDB')); return; }
    let req;
    try { req = indexedDB.open(DB, 1); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => { const db = req.result; db.createObjectStore('dossiers'); db.createObjectStore('kv'); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB'));
    req.onblocked = () => reject(new Error('IndexedDB blockiert'));
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
}
function tx(store, mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tr = db.transaction(store, mode);
    let res;
    const r = fn(tr.objectStore(store));
    if (r) r.onsuccess = () => { res = r.result; };
    tr.oncomplete = () => resolve(res);
    tr.onerror = () => reject(tr.error || new Error('IndexedDB'));
    tr.onabort = () => reject(tr.error || new Error('IndexedDB abgebrochen'));
  }));
}

/** Liste: [{ id, title, short, procedure, updated, created, demo, rows, docs, positions, consultations, classification }] */
export const listStore = createStore({ loaded: false, items: [], dbOk: true });
/** Aktives Dossier (oder null) */
export const dossierStore = createStore(null);
/** Speicherstatus: { state: 'idle'|'dirty'|'saving'|'saved'|'error', at, msg } */
export const saveStore = createStore({ state: 'idle', at: null });
/** Rückgängig-Stapel: [{ label, dossier }] (nur aktives Dossier) */
export const undoStore = createStore([]);
/** Auswahl in der Synopse/Position (nicht im Hash) */
export const selStore = createStore(new Set());

export function summary(d) {
  return {
    id: d.id, title: d.title, short: d.short || '', procedure: d.procedure || '', updated: d.updated, created: d.created, demo: !!d.demo, demoKey: d.demoKey || null,
    rows: d.rows.length, docs: d.documents.length, positions: Object.keys(d.positions || {}).length, consultations: (d.consultations || []).length,
    classification: topClassification(d),
  };
}

export async function loadList() {
  try {
    const items = (await tx('kv', 'readonly', (s) => s.get('list'))) || [];
    listStore.set({ loaded: true, items, dbOk: true });
  } catch (e) {
    listStore.set({ loaded: true, items: listStore.get().items || [], dbOk: false });
  }
}
async function writeList(items) {
  listStore.set({ ...listStore.get(), items });
  await tx('kv', 'readwrite', (s) => s.put(items, 'list'));
}
async function putDossier(d) {
  await tx('dossiers', 'readwrite', (s) => s.put(d, d.id));
  const items = listStore.get().items.filter((x) => x.id !== d.id);
  items.push(summary(d));
  await writeList(items);
}

let timer = null;
let pending = null;
async function flush() {
  if (!pending) return;
  const d = pending;
  pending = null;
  saveStore.set({ state: 'saving', at: null });
  try {
    await putDossier(d);
    saveStore.set({ state: pending ? 'dirty' : 'saved', at: new Date() });
  } catch (e) {
    saveStore.set({ state: 'error', at: new Date(), msg: e && e.message });
    listStore.set({ ...listStore.get(), dbOk: false });
  }
}
/** Sofort speichern (z. B. vor dem Schliessen). */
export function saveNow() { clearTimeout(timer); return flush(); }
function schedule(d) {
  pending = d;
  saveStore.set({ state: 'dirty', at: null });
  clearTimeout(timer);
  timer = setTimeout(flush, 350);
}
window.addEventListener('beforeunload', () => { if (pending) flush(); });

/**
 * Änderung am aktiven Dossier: fn(dossier) -> dossier. label: Text für "Rückgängig".
 * Rückgabe: neues Dossier.
 */
export function mutate(fn, label) {
  const cur = dossierStore.get();
  if (!cur) return null;
  const next = fn(cur);
  if (!next || next === cur) return cur;
  if (label) undoStore.set((l) => [...l.slice(-14), { label, dossier: cur }]);
  dossierStore.set(next);
  schedule(next);
  return next;
}
export function undo() {
  const l = undoStore.get();
  if (!l.length) return;
  const last = l[l.length - 1];
  undoStore.set(l.slice(0, -1));
  dossierStore.set(last.dossier);
  schedule(last.dossier);
  toast(t('neg.undo.done', { what: last.label }), 'info', 3500);
}

export async function readDossier(id) {
  return tx('dossiers', 'readonly', (s) => s.get(id));
}
/** Dossier öffnen (aus IndexedDB, sonst aus dem Speicher der aktuellen Sitzung). */
export async function openDossier(id) {
  const cur = dossierStore.get();
  if (cur && cur.id === id) return cur;
  if (pending) await saveNow();
  let d = null;
  try { d = await readDossier(id); } catch { d = null; }
  if (!d && memory.has(id)) d = memory.get(id);
  undoStore.set([]);
  selStore.set(new Set());
  dossierStore.set(d || null);
  return d;
}
const memory = new Map(); // Rückfall ohne IndexedDB

/** Neues oder importiertes Dossier speichern und öffnen. */
export async function addDossier(d) {
  memory.set(d.id, d);
  undoStore.set([]);
  selStore.set(new Set());
  dossierStore.set(d);
  try { await putDossier(d); saveStore.set({ state: 'saved', at: new Date() }); }
  catch (e) {
    listStore.set({ ...listStore.get(), items: [...listStore.get().items.filter((x) => x.id !== d.id), summary(d)], dbOk: false });
    saveStore.set({ state: 'error', at: new Date(), msg: e && e.message });
  }
  return d;
}
export async function deleteDossier(id) {
  memory.delete(id);
  if (dossierStore.get() && dossierStore.get().id === id) { dossierStore.set(null); undoStore.set([]); }
  try { await tx('dossiers', 'readwrite', (s) => s.delete(id)); } catch { /* ignorieren */ }
  try { await writeList(listStore.get().items.filter((x) => x.id !== id)); } catch { listStore.set({ ...listStore.get(), items: listStore.get().items.filter((x) => x.id !== id) }); }
}

/** Beispiel-Dossier laden (eingebettet, erst jetzt entpackt). */
export async function loadDemo(key) {
  const d = embeddedDemo(key);
  if (!d) throw new Error(t('neg.dossiers.noDemo'));
  d.demo = true;
  return addDossier(d);
}

// ------------------------------------------------------------------ Projektdatei
const pad = (n) => String(n).padStart(2, '0');
export function projectFileName(d) {
  const x = new Date();
  const name = (d.short || d.procedure || d.title || d.id).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  return `Verhandlung_${name}_${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}.json`;
}
/** Dateiname ohne Sonderzeichen (Browser ersetzen sonst den ganzen Namen durch "download"). */
export const safeFileName = (n) => String(n).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-');
export function download(blob, name) {
  name = safeFileName(name);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function exportProjectFile(d) {
  download(new Blob([exportDossier(d, { compact: true })], { type: 'application/json' }), projectFileName(d));
}
/** Projektdatei lesen; liefert { dossier, warnings } oder wirft mit verständlicher Meldung. */
export async function readProjectFile(file) {
  const txt = await file.text();
  const r = importDossier(txt);
  if (!r.dossier) throw new Error(t('neg.dossiers.importBad', { msg: (r.errors || []).slice(0, 3).join('; ') }));
  return r;
}

/** Aktives Dossier aus dem Hash nachladen. */
export async function syncFromRoute() {
  const id = getState().ds;
  const cur = dossierStore.get();
  if (!id) return;
  if (cur && cur.id === id) return;
  const d = await openDossier(id);
  if (!d) { toast(t('neg.dossiers.notFound'), 'warning'); go({ view: 'dossiers', ds: null, r: null }, { replace: true }); }
}
