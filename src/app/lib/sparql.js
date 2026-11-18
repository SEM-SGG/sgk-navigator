// Abfrage des SPARQL-Endpunkts des Amts für Veröffentlichungen (Publications Office) per JSONP.
// Der Endpunkt erlaubt keinen direkten Abruf (keine CORS-Freigabe); siehe jsonp().
import { t } from './i18n.js';
export const ENDPOINT = 'https://publications.europa.eu/webapi/rdf/sparql';

// Konsolidierte Fassungen über die Beziehung zum Basisakt (act_consolidated_based_on_resource_legal): rund 1 s.
// Die frühere Suche nur über STRSTARTS auf allen CELEX-Nummern dauerte 5–30 s und lief live in Zeitüberschreitungen;
// der Filter bleibt als Absicherung (gleiches Ergebnis für alle fünf Werke am 18.11.2026 geprüft).
const Q_CONSOLIDATED = (workCelex, prefix) => `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT DISTINCT ?celex ?date WHERE {
  ?base cdm:resource_legal_id_celex "${workCelex}"^^xsd:string .
  ?w cdm:act_consolidated_based_on_resource_legal ?base ; cdm:resource_legal_id_celex ?celex .
  FILTER(STRSTARTS(STR(?celex), "${prefix}"))
  OPTIONAL { ?w cdm:work_date_document ?date }
} ORDER BY ?celex`;

const Q_ACTS = (celex) => `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT DISTINCT ?celex ?rel ?date ?title ?titleFr WHERE {
  ?target cdm:resource_legal_id_celex "${celex}"^^xsd:string .
  VALUES ?rel { cdm:resource_legal_amends_resource_legal cdm:resource_legal_corrects_resource_legal cdm:resource_legal_derogates_resource_legal cdm:resource_legal_proposes_to_amend_resource_legal }
  ?act ?rel ?target .
  ?act cdm:resource_legal_id_celex ?celex .
  OPTIONAL { ?act cdm:work_date_document ?date }
  OPTIONAL { ?e cdm:expression_belongs_to_work ?act ; cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/DEU> ; cdm:expression_title ?title }
  OPTIONAL { ?f cdm:expression_belongs_to_work ?act ; cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/FRA> ; cdm:expression_title ?titleFr }
} ORDER BY ?date`;

// Sprachfassungen DE, FR, EN der gefundenen konsolidierten Fassungen (exakte CELEX, schnell). Manche Fassungen gibt es
// nur in einzelnen Sprachen (z. B. 02018R1240-20231231 nur ES); sie sind für die Anwendung nicht ladbar.
const LANG_URI = (c) => `<http://publications.europa.eu/resource/authority/language/${c}>`;
const Q_CONS_LANGS = (list) => `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT ?celex (GROUP_CONCAT(DISTINCT ?l; separator=",") AS ?langs) WHERE {
  VALUES ?celex { ${list.map((c) => `"${c}"^^xsd:string`).join(' ')} }
  ?w cdm:resource_legal_id_celex ?celex .
  OPTIONAL { VALUES ?lu { ${['DEU', 'FRA', 'ENG'].map(LANG_URI).join(' ')} }
    ?e cdm:expression_belongs_to_work ?w ; cdm:expression_uses_language ?lu . BIND(REPLACE(STR(?lu), "^.*/", "") AS ?l) }
} GROUP BY ?celex`;

const Q_CORR_LANGS = (celex) => `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT ?celex (GROUP_CONCAT(DISTINCT ?l; separator=",") AS ?langs) WHERE {
  ?target cdm:resource_legal_id_celex "${celex}"^^xsd:string .
  ?act cdm:resource_legal_corrects_resource_legal ?target ; cdm:resource_legal_id_celex ?celex .
  ?e cdm:expression_belongs_to_work ?act ; cdm:expression_uses_language ?lu .
  BIND(REPLACE(STR(?lu), "^.*/", "") AS ?l)
} GROUP BY ?celex`;

// Transport JSONP: Der Endpunkt sendet keinen Header Access-Control-Allow-Origin, ein fetch() aus einer file://-Seite
// (Origin null) wird deshalb vom Browser blockiert. Virtuoso liefert mit &format=json&callback=<name> die Antwort
// als Aufruf <name>(<SPARQL-JSON>); ein <script src> führt ihn aus. Die CSP (build.mjs) erlaubt Skripte nur von
// genau dieser Adresse. Kein eval: Die Antwort wird vom Browser als Skript geladen und ruft den Callback auf.
let seq = 0;
const GRACE_MS = 120000; // Platzhalter für verspätete Antworten nach Zeitüberschreitung
const isResult = (j) => !!(j && typeof j === 'object' && j.results && Array.isArray(j.results.bindings));

/**
 * Lädt url als Skript mit eindeutigem globalem Callback und liefert das übergebene Objekt.
 * url erhält den Parameter callback=<name>. Fehler: update.err.offline (Skript nicht ladbar, auch HTTP-Fehler),
 * update.err.timeout, update.err.format (keine SPARQL-JSON-Antwort). Script-Element und Callback werden nach
 * Erfolg, Fehler oder Zeitüberschreitung entfernt; eine verspätete Antwort nach Zeitüberschreitung wird ignoriert
 * (kurzlebiger Platzhalter, damit kein Skriptfehler entsteht; danach ebenfalls entfernt).
 * env (nur Tests): { document, window, graceMs }
 */
export function jsonp(url, timeoutMs = 45000, env = {}) {
  const doc = env.document || globalThis.document;
  const win = env.window || globalThis;
  const graceMs = env.graceMs != null ? env.graceMs : GRACE_MS;
  return new Promise((resolve, reject) => {
    const name = `__sgkJsonp_${Date.now().toString(36)}_${++seq}`;
    const el = doc.createElement('script');
    let settled = false;
    let timer = null;
    const removeEl = () => {
      el.onload = null; el.onerror = null;
      if (el.parentNode) el.parentNode.removeChild(el);
    };
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      removeEl();
      try { delete win[name]; } catch { win[name] = undefined; }
      if (err) reject(err); else resolve(value);
    };
    win[name] = (j) => {
      if (!isResult(j)) finish(new Error(t('update.err.format')));
      else finish(null, j);
    };
    el.onerror = () => finish(new Error(t('update.err.offline')));
    // geladen, aber Callback nicht aufgerufen (z. B. Fehlerseite eines Proxys): keine gültige Antwort
    el.onload = () => finish(new Error(t('update.err.format')));
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      removeEl();
      // verspätete Antwort ignorieren, Platzhalter nach graceMs entfernen
      const stub = () => { try { delete win[name]; } catch { win[name] = undefined; } };
      win[name] = stub;
      setTimeout(() => { if (win[name] === stub) stub(); }, graceMs);
      reject(new Error(t('update.err.timeout')));
    }, timeoutMs);
    el.async = true;
    el.referrerPolicy = 'no-referrer';
    el.src = `${url}${url.includes('?') ? '&' : '?'}callback=${name}`;
    (doc.head || doc.body || doc.documentElement).appendChild(el);
  });
}

// Der Endpunkt drosselt: höchstens MAX_PARALLEL Abfragen gleichzeitig (über alle Prüfungen hinweg).
export const MAX_PARALLEL = 2;
let active = 0;
const waiting = [];
function limited(fn) {
  return new Promise((resolve, reject) => {
    const go = () => {
      active++;
      Promise.resolve().then(fn).then(resolve, reject).finally(() => { active--; const next = waiting.shift(); if (next) next(); });
    };
    if (active < MAX_PARALLEL) go(); else waiting.push(go);
  });
}

export const QUERY_TIMEOUT_MS = 45000;
/** Adresse einer Abfrage (JSON-Ergebnis). */
export const queryUrl = (query) => `${ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
async function run(query) {
  const j = await limited(() => jsonp(queryUrl(query), QUERY_TIMEOUT_MS));
  return j.results.bindings;
}

const REL = {
  resource_legal_amends_resource_legal: 'amendment',
  resource_legal_corrects_resource_legal: 'corrigendum',
  resource_legal_derogates_resource_legal: 'derogation',
  resource_legal_proposes_to_amend_resource_legal: 'proposal',
};
const ISO3 = { DEU: 'de', FRA: 'fr', ENG: 'en' };

/**
 * Prüft einen Rechtsakt (CELEX des Basisakts): konsolidierte Fassungen und zugehörige Akte.
 * opts.query (nur ausserhalb des Browsers, z. B. scripts/check-fassungen.mjs): eigene Abfragefunktion (SPARQL-Text ->
 * results.bindings), etwa per fetch; Vorgabe ist JSONP mit begrenzter Parallelität.
 */
export async function checkUpdates(workCelex = '32016R0399', opts = {}) {
  const q = opts.query || run;
  const prefix = '0' + workCelex.slice(1);
  const consWithLangs = async () => {
    const cons = (await q(Q_CONSOLIDATED(workCelex, prefix))).filter((b) => b.celex && b.celex.value !== workCelex && /^[0-9A-Z()-]+$/.test(b.celex.value));
    const list = [...new Set(cons.map((b) => b.celex.value))];
    // Sprachen sind eine Zusatzangabe: schlägt die Abfrage fehl, bleibt sie offen (keine Einschränkung der Links)
    const langs = list.length ? await q(Q_CONS_LANGS(list)).catch(() => []) : [];
    return { cons, langs: new Map(langs.filter((b) => b.celex).map((b) => [b.celex.value, (b.langs ? b.langs.value : '').split(',').filter(Boolean)])) };
  };
  const [{ cons, langs: consLangs }, acts, corr] = await Promise.all([
    consWithLangs(),
    q(Q_ACTS(workCelex)),
    q(Q_CORR_LANGS(workCelex)).catch(() => []),
  ]);
  const corrLangs = new Map(corr.filter((b) => b.celex && b.langs).map((b) => [b.celex.value, b.langs.value.split(',').filter(Boolean)]));
  const seen = new Set();
  const actList = [];
  for (const b of acts) {
    if (!b.celex || !b.rel) continue;
    const celex = b.celex.value;
    if (seen.has(celex)) continue;
    seen.add(celex);
    const rel = b.rel.value.split('#')[1];
    const langs3 = corrLangs.get(celex) || null;
    actList.push({ celex, kind: REL[rel] || rel, date: b.date ? b.date.value.slice(0, 10) : null, title: b.title ? b.title.value : null, titleFr: b.titleFr ? b.titleFr.value : null, langs3, langs: langs3 ? langs3.map((l) => ISO3[l]).filter(Boolean) : null });
  }
  return {
    checked: new Date().toISOString(),
    consolidated: cons.map((b) => {
      const c = { celex: b.celex.value, date: b.date ? b.date.value.slice(0, 10) : null };
      const l3 = consLangs.get(c.celex);
      if (l3) { c.langs3 = l3; c.langs = l3.map((l) => ISO3[l]).filter(Boolean); }
      return c;
    }),
    acts: actList,
  };
}

export const eurlexHtml = (celex, lang) => `https://eur-lex.europa.eu/legal-content/${lang.toUpperCase()}/TXT/HTML/?uri=CELEX:${encodeURIComponent(celex)}`;
