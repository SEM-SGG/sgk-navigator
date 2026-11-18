// Anwendungszustand mit Deep Links über den URL-Hash.
// Format: #/<ansicht>?u=art_8&k=p3.a.i&s=s07&l=de ...
import { useEffect, useState } from 'preact/hooks';
import { uiLang, setUiLang, UI_LANGS } from './lib/i18n.js';

export const DEFAULTS = {
  view: 'uebersicht',
  w: 'sgk',     // Werk der Bibliothek (Modul Rechtsakte): sgk | ees | etias | vis | iop
  u: null,      // Einheit
  k: null,      // Blockschlüssel
  s: null,      // Stand (Lesen)
  l: 'de',      // Sprache
  m: 'stand',   // Lesemodus: stand | datum | alle
  d: null,      // Stichtag (Modus datum)
  red: '0',     // Redline gegenüber Vorstand
  a: null,      // Vergleich: alter Stand
  b: null,      // Vergleich: neuer Stand
  cm: 'stand',  // Vergleichsart: stand | sprache
  l2: 'fr',     // Vergleich: zweite Sprache
  lay: 'side',  // side | redline
  sc: 'changed',// changed | full
  act: null,    // TOC-Filter Akt
  ch: '0',      // TOC-Filter nur geänderte
  q: null,      // Suchbegriff
  sec: null,    // Anleitung: Abschnitt
  ui: null,     // Oberflächensprache (de | fr); wird immer in den Hash geschrieben, damit Deep Links sie mitgeben
  // Modul Verhandlung
  ds: null,     // Dossier-Id
  r: null,      // Zeile (Detail)
  nh: null,     // ausgeblendete Spuren (Komma-Liste)
  nv: null,     // gezeigte Fassung je Spur ("com:doc1,council:doc3"); sonst jüngste
  nd: 'none',   // Diff-Modus: none | com | prev | tracks
  na: null,     // Diff zwischen Spuren: Spur A
  nb: null,     // Diff zwischen Spuren: Spur B
  np: '1',      // Spalte CH-Position sichtbar
  nm: '1',      // Auszeichnung der Quelle zeigen
  nfc: null,    // Filter: geändert seit Fassung (Dokument-Id)
  nfs: null,    // Filter: Status (Komma-Liste agreed,provisional,open,deleted,none)
  nfp: null,    // Filter: with | without (CH-Position)
  nfh: null,    // Filter: Haltung (Komma-Liste)
  nfr: null,    // Filter: Priorität (Komma-Liste)
  nfo: null,    // Filter: nur veraltete Positionen ('1')
  nq: null,     // Stichwort
  ng: null,     // Gliederung: Gruppe
  nk: null,     // Konsultationsrunde
  nkt: null,    // Konsultation: Reiter
  nkf: null,    // Konsultation: Filter (open | office:<id> | decision:<d>)
  pv: null,     // Druckansicht (Modul Verhandlung): briefing | report | consultation | synopse | changes;
                // Modul Rechtsakte (lesen, vergleich, chronik): Vorschau <dossierId>~<trackId>~<docId|latest>
  pv2: null,    // Vorschau, Vergleich zweier Spuren: zweite Spur <trackId>~<docId|latest>
  po: null,     // Druckansicht: Optionen (kompakt kodiert)
};
const KEYS = Object.keys(DEFAULTS).filter((k) => k !== 'view');

export function parseHash(hash) {
  const h = (hash || '').replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  const st = { ...DEFAULTS };
  if (path) st.view = decodeURIComponent(path.split('/')[0]);
  const p = new URLSearchParams(query);
  for (const k of KEYS) if (p.has(k)) st[k] = p.get(k);
  return st;
}
export function toHash(st) {
  const p = new URLSearchParams();
  for (const k of KEYS) if (k !== 'ui' && st[k] != null && st[k] !== '' && st[k] !== DEFAULTS[k]) p.set(k, st[k]);
  p.set('ui', uiLang());
  const q = p.toString();
  return `#/${st.view}${q ? '?' + q : ''}`;
}

let current = parseHash(location.hash);
const subs = new Set();
function emit() { for (const f of subs) f(current); }
/** Sprache aus einem Deep Link übernehmen (ohne die gespeicherte Wahl zu ändern). */
function syncUi() { if (UI_LANGS.includes(current.ui) && current.ui !== uiLang()) setUiLang(current.ui, { persist: false }); }
window.addEventListener('hashchange', () => {
  current = parseHash(location.hash);
  syncUi();
  emit();
});
/** Beim Start: Hash vervollständigen (u. a. ui), ohne neuen Verlaufseintrag. */
export function normalizeHash() {
  const h = toHash(current);
  if (h !== location.hash) history.replaceState(null, '', h);
}
export const getState = () => current;
/** Navigiert mit Patch; null entfernt Parameter. */
export function go(patch, { replace = false } = {}) {
  const next = { ...current, ...patch };
  const h = toHash(next);
  current = next;
  if (h !== location.hash) {
    if (replace) history.replaceState(null, '', h);
    else history.pushState(null, '', h);
  }
  emit();
}
export function useRoute() {
  const [st, set] = useState(current);
  useEffect(() => { const f = (s) => set(s); subs.add(f); return () => subs.delete(f); }, []);
  return st;
}

// Kleiner Ereignisspeicher für globale, nicht im Hash geführte Zustände
export function createStore(initial) {
  let value = initial;
  const ls = new Set();
  return {
    get: () => value,
    set: (v) => { value = typeof v === 'function' ? v(value) : v; for (const f of ls) f(value); },
    use() {
      const [v, setV] = useState(value);
      useEffect(() => { const f = (x) => setV(() => x); ls.add(f); return () => ls.delete(f); }, []);
      return v;
    },
  };
}
