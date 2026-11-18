// Kürzel der bearbeitenden Person (für Verlaufseinträge `by` und als Autor nachverfolgter Änderungen im Word-Export).
// Bleibt lokal im Browser (localStorage); fehlt der Speicher, gilt der Wert für die laufende Sitzung.

const KEY = 'sgkn.by';
let current = null;
const listeners = new Set();

/** @returns {string} Kürzel oder '' */
export function getBy() {
  if (current !== null) return current;
  try { current = (localStorage.getItem(KEY) || '').trim(); } catch { current = ''; }
  return current;
}

/** Setzt das Kürzel (max. 24 Zeichen, ohne Steuerzeichen). */
export function setBy(value) {
  const v = String(value || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 24);
  current = v;
  try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch { /* nur Sitzung */ }
  for (const fn of listeners) { try { fn(v); } catch { /* Listener darf nicht stören */ } }
  return v;
}

/** Meldet Änderungen; gibt die Abmeldefunktion zurück. */
export function onByChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
