// SGK-Navigator — Bibliothek der Rechtsakte (Werke). ESM, isomorph, ohne Abhaengigkeiten.
//
// index: Inhalt von data/works/index.json (Liste der Werke, s. SPEC3.md §3.1)
// dataset: Datensatz nach SPEC.md §5 (schema 1), fuer die weiteren Werke mit Zusatzfeld stage.acts

// CELEX vereinheitlichen: Leerraum weg, Grossbuchstaben ausser dem Klammerteil "R(01)"
function normCelex(c) {
  return String(c || '').trim().replace(/\s+/g, '').toUpperCase();
}

// Konsolidierte Fassung "02017R2226-20260612" -> Basisakt "32017R2226"; Berichtigung "32017R2226R(03)" -> "32017R2226"
function baseOf(celex) {
  let c = normCelex(celex);
  const m = c.match(/^0(\d{4}[A-Z]\d{4})-\d{8}$/);
  if (m) c = '3' + m[1];
  return c.replace(/R\(\d+\)$/, '');
}

export function listWorks(index) {
  return (Array.isArray(index) ? index : []).map((w) => ({ ...w }));
}

// Werk zu einer CELEX: Basisakt, eine seiner konsolidierten Fassungen oder eine seiner Berichtigungen
export function resolveCelex(index, celex) {
  if (!celex || !Array.isArray(index)) return null;
  const c = normCelex(celex);
  for (const w of index) if (normCelex(w.celex) === c) return w.id;
  const b = baseOf(c);
  for (const w of index) if (normCelex(w.celex) === b) return w.id;
  return null;
}

// Juengster Stand mit date <= isoDate (Reihenfolge nach stage.order). Vor dem ersten Stand: null.
export function stageAt(dataset, isoDate) {
  if (!dataset || !Array.isArray(dataset.stages)) return null;
  const d = String(isoDate || '').slice(0, 10);
  const sorted = dataset.stages.slice().sort((a, b) => a.order - b.order);
  let best = null;
  for (const s of sorted) if (s.date && s.date <= d) best = s;
  return best ? best.id : null;
}

// Akte, die im Stand neu eingearbeitet sind. Fallback ohne stage.acts (SGK): stage.act.
export function actsOfStage(dataset, stageId) {
  const s = dataset && Array.isArray(dataset.stages) ? dataset.stages.find((x) => x.id === stageId) : null;
  if (!s) return [];
  if (Array.isArray(s.acts)) return s.acts.slice();
  return s.act ? [s.act] : [];
}
