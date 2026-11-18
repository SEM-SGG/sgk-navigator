// Prüfung auf neue Fassungen ausserhalb des Browsers (scripts/check-fassungen.mjs, .github/workflows/fassungen.yml).
// Verwendet dieselben SPARQL-Abfragen (src/app/lib/sparql.js, checkUpdates) und dieselbe Statuslogik
// (src/app/modules/sgk/updatelogic.js) wie «Aktualisieren» → «Alle Rechtsakte prüfen» im Tool, gegen die Daten im Repo
// (data/dataset.json, data/acts.json, data/works/*). Nur der Transport unterscheidet sich: hier ein normales fetch().
import './env.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (p) => JSON.parse(readFileSync(ROOT + p, 'utf8'));

const { registerStrings, withUiLang } = await import('../../src/app/lib/i18n.js');
registerStrings('de', (await import('../../src/app/i18n/de.js')).default);
const D = await import('../../src/app/data.js');
const { checkUpdates, queryUrl, eurlexHtml } = await import('../../src/app/lib/sparql.js');
const { rowsForWork, needsAttention, isNew } = await import('../../src/app/modules/sgk/updatelogic.js');
const { fmtDate } = await import('../../src/app/lib/format.js');
const { PROJECT } = await import('../../src/app/config/update-source.js');

export const MARKER = 'sgk-fassungen';
export const TITLE = 'Neue Fassungen verfügbar';

/** Werke der Bibliothek mit Data-Instanz wie im Build (SGK mit Erwägungsgründen). */
export function loadWorks() {
  const idx = read('data/works/index.json');
  const worksIndex = idx.map((w) => ({ id: w.id, celex: w.celex, number: w.number, short: w.short, abbr: w.abbr, full: !!w.full, assets: !!w.assets }));
  D.setLibraryContext({ worksIndex, derogations: [] });
  return idx.map((w) => {
    let dataset, acts;
    if (w.id === 'sgk') {
      dataset = read('data/dataset.json');
      acts = read('data/acts.json');
    } else {
      dataset = read('data/works/' + w.dataset);
      acts = w.acts && existsSync(ROOT + 'data/works/' + w.acts) ? read('data/works/' + w.acts) : [];
    }
    const work = worksIndex.find((x) => x.id === w.id);
    return { w: work, data: new D.Data({ dataset, acts, work }) };
  });
}

/** SPARQL-Abfrage per fetch (serverseitig, keine CORS-Beschränkung). Drei Versuche, Zeitlimit je Versuch 90 s. */
export function fetchQuery({ fetchFn = globalThis.fetch, tries = 3, timeoutMs = 90000, waitMs = 5000 } = {}) {
  return async (sparql) => {
    let last;
    for (let i = 1; i <= tries; i++) {
      try {
        const r = await fetchFn(queryUrl(sparql), { headers: { Accept: 'application/sparql-results+json' }, signal: AbortSignal.timeout(timeoutMs) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        if (!j || !j.results || !Array.isArray(j.results.bindings)) throw new Error('Antwort ohne results.bindings');
        return j.results.bindings;
      } catch (e) {
        last = e;
        if (i < tries) await new Promise((res) => setTimeout(res, waitMs * i));
      }
    }
    throw last;
  };
}

/**
 * Alle Werke prüfen. Ergebnis je Werk: { id, abbr, celex, rows (nur neue bzw. unvollständige Einträge), error }.
 * Gezählt wird wie im Tool (countAttention): konsolidierte Fassungen neu oder unvollständig, Akte neu.
 */
export async function checkAll(works, query, { only = null } = {}) {
  const out = [];
  for (const { w, data } of works) {
    if (only && !only.includes(w.id)) continue;
    const entry = { id: w.id, abbr: w.abbr.de, celex: w.celex, rows: [], error: null, latest: data.latest ? data.latest.id : null };
    try {
      const res = await checkUpdates(w.celex, { query });
      entry.checked = res.checked;
      entry.rows = withUiLang('de', () => rowsForWork(res, data, [])
        .filter((r) => (r.type === 'cons' ? needsAttention(r.st) : isNew(r.st)))
        .map((r) => ({ type: r.type, kind: r.kind, celex: r.celex, date: r.date, status: r.st.label, langs: r.langs, title: r.item.title || null })));
    } catch (e) {
      entry.error = String((e && e.message) || e);
    }
    out.push(entry);
  }
  return out;
}

/** Schlüssel der gefundenen Einträge (für den Vergleich mit dem bestehenden Issue). */
export const itemKeys = (results) => results.flatMap((r) => r.rows.map((x) => `${r.id}:${x.celex}`)).sort();

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'));
const LANG_ORDER = ['de', 'fr', 'en'];

/** Titel und Text des Issues (Markdown, deutsch). ctx: { now, repoUrl, commit } */
export function issueBody(results, ctx = {}) {
  const now = ctx.now || new Date();
  const repoUrl = ctx.repoUrl || PROJECT.source;
  const keys = itemKeys(results);
  const rows = results.flatMap((r) => r.rows.map((x) => ({ ...x, abbr: r.abbr })));
  const failed = results.filter((r) => r.error);
  const time = new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }).format(now);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(now);
  const lines = [];
  lines.push(`<!-- ${MARKER} ${JSON.stringify({ items: keys })} -->`);
  lines.push('Die wöchentliche Prüfung beim Amt für Veröffentlichungen der EU (SPARQL-Endpunkt) hat Einträge gefunden, die in den Daten dieses Repos noch fehlen. Es ist dieselbe Prüfung wie im Tool unter «Aktualisieren» → «Alle Rechtsakte prüfen».');
  lines.push('');
  lines.push(`Geprüft am ${withUiLang('de', () => fmtDate(day))}, ${time} Uhr${ctx.commit ? `, Datenstand des Repos: Commit \`${String(ctx.commit).slice(0, 7)}\`` : ''}.`);
  lines.push('');
  lines.push('| Rechtsakt | Art | CELEX | Datum | Status | EUR-Lex |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const x of rows) {
    const langs = LANG_ORDER.filter((l) => (x.langs || []).includes(l));
    const links = langs.map((l) => `[${l.toUpperCase()}](${eurlexHtml(x.celex, l)})`).join(' · ') || '–';
    const kind = withUiLang('de', () => D.kindLabel(x.kind));
    lines.push(`| ${esc(x.abbr)} | ${esc(kind)} | \`${esc(x.celex)}\` | ${x.date ? withUiLang('de', () => fmtDate(x.date)) : '–'} | ${esc(x.status)} | ${links} |`);
  }
  lines.push('');
  if (failed.length) {
    lines.push(`Nicht geprüft (Fehler bei der Abfrage): ${failed.map((r) => `${esc(r.abbr)} (${esc(r.error)})`).join('; ')}. Die nächste Prüfung versucht es erneut.`);
    lines.push('');
  }
  lines.push('**Was ist zu tun?**');
  lines.push('');
  lines.push(`- **Neue konsolidierte Fassung:** zentral in die Daten einbauen und danach ein Release erstellen. Anleitung: [MAINTAINING.md, «Neue Fassung einbauen»](${repoUrl}/blob/main/MAINTAINING.md#neue-fassung-einbauen). Bis dahin können Nutzende die Fassung im Tool unter «Aktualisieren» selbst laden.`);
  lines.push(`- **Neuer Akt** (Änderungsakt, Berichtigung, Abweichung, Vorschlag): Der Wortlaut kommt mit der nächsten konsolidierten Fassung. Soll der Akt schon vorher im Tool erscheinen (Liste der Akte, Anwendbarkeit), ihn in \`data/acts.json\` (SGK) bzw. \`data/works/<werk>.acts.json\` erfassen.`);
  lines.push('- Ist alles erledigt oder bewusst nicht übernommen, dieses Issue schliessen. Die nächste Prüfung eröffnet bei Bedarf ein neues.');
  lines.push('');
  lines.push('_Automatisch erstellt von `.github/workflows/fassungen.yml` (`scripts/check-fassungen.mjs`). Das Issue wird jede Woche aktualisiert, solange es offen ist._');
  return { title: TITLE, body: lines.join('\n'), keys };
}

/** Schlüssel aus dem Text eines bestehenden Issues lesen (Marker in der ersten Zeile). */
export function keysOfBody(body) {
  const m = new RegExp(`<!-- ${MARKER} (\\{.*?\\}) -->`).exec(body || '');
  if (!m) return null;
  try { const j = JSON.parse(m[1]); return Array.isArray(j.items) ? j.items.slice().sort() : null; } catch { return null; }
}
