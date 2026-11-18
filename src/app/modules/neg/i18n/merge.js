// Tiefes Zusammenführen der Wörterbücher (Etappe 3 ergänzt neg.* aus de3.js/fr3.js; Listen und Texte ersetzen, Objekte werden vereinigt).
export function deepMerge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? deepMerge(a[k], v) : v;
  }
  return out;
}
