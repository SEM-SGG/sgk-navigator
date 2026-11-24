// data/zur-kenntnis.txt: Akte und Vorschläge, welche die Pflegenden zur Kenntnis genommen haben, ohne sie in die Daten
// aufzunehmen. Je Zeile eine CELEX-Nummer, danach auf Wunsch eine Bemerkung. Zeilen mit «#» am Anfang und leere Zeilen
// zählen nicht. Die Fassungsprüfung (scripts/check-fassungen.mjs) und «Aktualisieren» im Werkzeug (build.mjs bettet die Liste
// ein) melden diese Einträge nicht mehr als neu. Konsolidierte Fassungen lassen sich so nicht abstellen.
export const KENNTNIS_FILE = 'data/zur-kenntnis.txt';
const CELEX = /^[0-9][0-9]{4}[A-Z]{1,2}[0-9]{4}(?:R\(\d+\)|\(\d+\))?$/;

/** [{ celex, note, line }]; ungültige Zeilen in errors. */
export function parseKenntnis(text) {
  const items = [], errors = [];
  String(text || '').split(/\r?\n/).forEach((raw, i) => {
    const l = raw.trim();
    if (!l || l.startsWith('#')) return;
    const [celex, ...rest] = l.split(/\s+/);
    if (!CELEX.test(celex)) { errors.push({ line: i + 1, text: l }); return; }
    if (/^0/.test(celex)) { errors.push({ line: i + 1, text: l, cons: true }); return; }
    items.push({ celex, note: rest.join(' ').replace(/^[-–:]\s*/, ''), line: i + 1 });
  });
  return { items, errors };
}
export const readKenntnis = (text) => parseKenntnis(text).items;
