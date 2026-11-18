// Globale Speicher der Anwendung.
import { t } from './lib/i18n.js';
import { createStore } from './state.js';
import { kvGet, kvSet } from './lib/store.js';

export const dataStore = createStore(null);
export const basketStore = createStore([]);
export const toastStore = createStore([]);
export const uploadsStore = createStore([]);
export const settingsStore = createStore({ origin: true });
export const panelStore = createStore({ basket: false });

export const useData = () => dataStore.use();

let tid = 0;
export function toast(text, kind = 'info', ms = 6000) {
  const id = ++tid;
  toastStore.set((l) => [...l, { id, text, kind }]);
  if (ms) setTimeout(() => toastStore.set((l) => l.filter((t) => t.id !== id)), ms);
  return id;
}

export async function loadPersisted() {
  basketStore.set((await kvGet('basket', [])) || []);
  settingsStore.set({ origin: true, ...((await kvGet('settings', {})) || {}) });
  uploadsStore.set((await kvGet('uploads', [])) || []);
}
export function persistBasket() { kvSet('basket', basketStore.get()).catch(() => toast(t('basket.saveFailed'), 'error')); }
export function persistSettings() { kvSet('settings', settingsStore.get()).catch(() => {}); }

export function addToBasket(item) {
  basketStore.set((l) => [...l, { ...item, id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` }]);
  persistBasket();
  toast(t('basket.added', { n: basketStore.get().length }), 'success', 3500);
}
