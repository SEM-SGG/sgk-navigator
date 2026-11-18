// Hochgeladene Fassungen: verarbeiten, persistieren, beim Start erneut anwenden; Projektdatei.
import { t, uiLang } from './lib/i18n.js';
import { readHtmlFile } from './lib/decode.js';
import { assignWork } from './modules/sgk/updatelogic.js';
import { planStored, hadEffect } from './lib/storedplan.js';
import { fmtDate } from './lib/format.js';
import { Data, parseUpload, parseEurLexFile, applySnapshot } from './data.js';
import { dataStore, uploadsStore, basketStore, settingsStore, toast, persistBasket, persistSettings } from './app.js';
import { kvGet, kvSet } from './lib/store.js';
import { workData, workBundle, setWorkDataset, works, workById, workAbbr } from './library.js';

let baseBundle = null; // { dataset, acts, assets, meta } aus der HTML-Datei

export function setBase(bundle) { baseBundle = bundle; }

const workOf = (u) => u.work || 'sgk';
const isFull = (w) => w === 'sgk' || !!(workById(w) || {}).full;
function rebuild(dataset, work = 'sgk') {
  if (work === 'sgk') dataStore.set(new Data({ ...baseBundle, dataset }));
  else setWorkDataset(work, dataset);
}

/** Eingebetteter Datensatz eines Werks (ohne Uploads). */
const baseOf = (w) => (w === 'sgk' ? baseBundle.dataset : (workBundle(w) || {}).dataset);

/**
 * Wendet alle gespeicherten Uploads auf die eingebetteten Datensätze an (je Werk).
 * Uploads, deren Fassung (CELEX) und Sprache der eingebettete Datensatz schon enthält (neue Version des Tools), werden nicht
 * erneut eingearbeitet, sondern aus dem Speicher entfernt (src/app/lib/storedplan.js); einmalige Meldung mit der Anzahl.
 * Liefert { ok, removed: [meta], blocked: [meta] }.
 */
export async function applyStoredUploads({ notify = true } = {}) {
  const list = uploadsStore.get();
  const ids = [...new Set(['sgk', ...list.map(workOf)])].filter((w) => works().some((x) => x.id === w));
  let ok = 0;
  const removed = [], blocked = [];
  for (const w of ids) {
    const base = baseOf(w);
    if (!base) continue;
    let ds = base;
    for (const u of list.filter((x) => workOf(x) === w)) {
      const plan = planStored(base, u);
      if (plan.action === 'contained') { removed.push(u); continue; }
      if (plan.action === 'blocked') { blocked.push(u); continue; }
      const parsed = await kvGet('snap:' + u.id);
      if (!parsed) { toast(t('upload.storedMissing', { celex: u.celex, lang: u.lang.toUpperCase() }), 'warning'); continue; }
      try {
        const next = applySnapshot(ds, parsed, { date: u.date, actCelex: u.actCelex || undefined, full: isFull(w) });
        if (plan.action === 'tryLang' && !hadEffect(ds, next, plan.stage, u.lang)) { removed.push(u); continue; }
        ds = next;
        ok++;
      } catch (e) {
        toast(t('upload.storedFailed', { celex: u.celex, msg: e.message }), 'error');
      }
    }
    if (w === 'sgk' || ds !== base) rebuild(ds, w);
  }
  if (removed.length) {
    const gone = new Set(removed.map((u) => u.id));
    uploadsStore.set((l) => l.filter((u) => !gone.has(u.id)));
    try {
      await kvSet('uploads', uploadsStore.get());
      for (const u of removed) await kvSet('snap:' + u.id, null);
    } catch { /* Speicher nicht verfügbar: beim nächsten Start erneut */ }
    if (notify) toast(t('upload.storedIncluded', { n: removed.length }), 'info', 0);
  }
  if (blocked.length && notify) toast(t('upload.storedBlocked', { n: blocked.length, list: blocked.map((u) => `${u.celex} ${u.lang.toUpperCase()}`).join(', ') }), 'warning', 0);
  return { ok, removed, blocked };
}

/**
 * Verarbeitet hochgeladene Dateien nacheinander. Jede Datei wird anhand der CELEX-Nummer in ihrem Inhalt dem
 * passenden Werk der Bibliothek zugeordnet (Basisakt, konsolidierte Fassung oder Berichtigung).
 * home: Werk der Ablage, aus der die Dateien stammen (null: gemeinsame Ablage aller Rechtsakte).
 * Liefert ein Protokoll [{ name, ok, msg, work?, moved?, duplicate?, celex?, lang?, date?, stage? }].
 */
export async function handleFiles(files, home = 'sgk') {
  const log = [];
  for (const file of files) {
    const entry = { name: file.name, ok: false, msg: '' };
    log.push(entry);
    try {
      if (file.size > 40 * 1024 * 1024) throw new Error(t('upload.err.tooBig'));
      const text = await readHtmlFile(file);
      const pre = parseEurLexFile(text);
      const work = assignWork(works(), pre.celex);
      if (!work) throw new Error(pre.celex ? t('upload.err.notLibrary', { celex: pre.celex, list: works().map((w) => workAbbr(w, uiLang())).join(', ') }) : t('upload.err.notLibraryUnknown'));
      entry.work = work;
      entry.moved = !!home && work !== home;
      const data = workData(work);
      const { parsed, lang, celex, date } = parseUpload(text, data, uploadsStore.get().filter((u) => workOf(u) === work), { parsed: pre });
      const ds = applySnapshot(data.ds, parsed, { date, full: data.full });
      const id = `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
      await kvSet('snap:' + id, parsed);
      const meta = { id, work, celex, lang, date, name: file.name, size: file.size, addedAt: new Date().toISOString() };
      uploadsStore.set((l) => [...l, meta]);
      await kvSet('uploads', uploadsStore.get());
      rebuild(ds, work);
      const nd = workData(work);
      const st = nd.stages.find((s) => s.source && s.source.celex === celex) || nd.latest;
      Object.assign(entry, { ok: true, celex, lang, date, stage: st && st.id });
      const vars = { work: workAbbr(workById(work), uiLang()), home: home ? workAbbr(workById(home), uiLang()) : '', date: date ? fmtDate(date) : '', lang: lang.toUpperCase(), stage: st ? st.id : '?' };
      entry.msg = t(entry.moved ? (date ? 'upload.okMoved' : 'upload.okMovedNoDate') : (date ? 'upload.okWork' : 'upload.okWorkNoDate'), vars);
    } catch (e) {
      entry.msg = e.message || String(e);
      entry.duplicate = !!e.duplicate;
      if (entry.work) entry.moved = !!home && entry.work !== home;
    }
  }
  return log;
}

export async function removeUpload(id) {
  const gone = uploadsStore.get().find((u) => u.id === id);
  uploadsStore.set((l) => l.filter((u) => u.id !== id));
  if (gone && workOf(gone) !== 'sgk' && workBundle(workOf(gone))) rebuild(workBundle(workOf(gone)).dataset, workOf(gone));
  await kvSet('uploads', uploadsStore.get());
  await kvSet('snap:' + id, null);
  await applyStoredUploads();
}

export async function exportProject() {
  const uploads = [];
  for (const u of uploadsStore.get()) uploads.push({ meta: u, parsed: await kvGet('snap:' + u.id) });
  const obj = { app: 'SGK-Navigator', format: 'sgk-projekt', version: 1, exported: new Date().toISOString(), work: baseBundle.dataset.work && baseBundle.dataset.work.celex, uploads, basket: basketStore.get(), settings: settingsStore.get() };
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date();
  a.download = `SGK-Navigator_Projekt_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return obj;
}

export async function importProject(file) {
  let obj;
  try { obj = JSON.parse(await file.text()); } catch { throw new Error(t('project.err.noJson')); }
  if (!obj || obj.format !== 'sgk-projekt') throw new Error(t('project.err.notProject'));
  if (obj.version > 1) throw new Error(t('project.err.newer'));
  const known = new Set(uploadsStore.get().map((u) => `${u.celex}|${u.lang}`)); // CELEX der Fassung enthält das Werk
  let added = 0, included = 0;
  for (const u of obj.uploads || []) {
    if (!u.meta || !u.parsed || known.has(`${u.meta.celex}|${u.meta.lang}`)) continue;
    // Fassung schon im eingebetteten Datensatz dieser Version des Tools: nicht anlegen
    const w = workOf(u.meta);
    const base = works().some((x) => x.id === w) ? baseOf(w) : null;
    const plan = base ? planStored(base, u.meta) : { action: 'apply' };
    if (plan.action === 'contained') { included++; known.add(`${u.meta.celex}|${u.meta.lang}`); continue; }
    if (plan.action === 'tryLang') {
      try {
        const next = applySnapshot(base, u.parsed, { date: u.meta.date, full: isFull(w) });
        if (!hadEffect(base, next, plan.stage, u.meta.lang)) { included++; known.add(`${u.meta.celex}|${u.meta.lang}`); continue; }
      } catch { /* wie bisher anlegen; Fehler meldet applyStoredUploads */ }
    }
    await kvSet('snap:' + u.meta.id, u.parsed);
    uploadsStore.set((l) => [...l, u.meta]);
    known.add(`${u.meta.celex}|${u.meta.lang}`);
    added++;
  }
  const ids = new Set(basketStore.get().map((c) => c.id));
  const nb = (obj.basket || []).filter((c) => !ids.has(c.id));
  basketStore.set((l) => [...l, ...nb]);
  persistBasket();
  if (obj.settings) { settingsStore.set({ ...settingsStore.get(), ...obj.settings }); persistSettings(); }
  await applyStoredUploads();
  return { uploads: added, cards: nb.length, included };
}
