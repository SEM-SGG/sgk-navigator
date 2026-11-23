// Prüfung auf neue Fassungen ausserhalb des Browsers (scripts/check-fassungen.mjs, .github/workflows/fassungen.yml).
// Verwendet dieselben SPARQL-Abfragen (src/app/lib/sparql.js, checkUpdates) und dieselbe Statuslogik
// (src/app/modules/sgk/updatelogic.js) wie «Aktualisieren» → «Alle Rechtsakte prüfen» im Tool, gegen die Daten im Repo
// (data/dataset.json, data/acts.json, data/works/*). Nur der Transport unterscheidet sich: hier ein normales fetch().
import './env.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { KENNTNIS_FILE, parseKenntnis } from './kenntnis.mjs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (p) => JSON.parse(readFileSync(ROOT + p, 'utf8'));

const { registerStrings, withUiLang } = await import('../../src/app/lib/i18n.js');
registerStrings('de', (await import('../../src/app/i18n/de.js')).default);
const D = await import('../../src/app/data.js');
const { checkUpdates, queryUrl, eurlexHtml } = await import('../../src/app/lib/sparql.js');
const { rowsForWork, needsAttention, isNew, setAcknowledged } = await import('../../src/app/modules/sgk/updatelogic.js');
const { fmtDate } = await import('../../src/app/lib/format.js');
const { PROJECT } = await import('../../src/app/config/update-source.js');

export const MARKER = 'sgk-fassungen';
export const TITLE = 'Neue Fassungen auf EUR-Lex';

/** Liste «zur Kenntnis genommen» aus dem Repo (data/zur-kenntnis.txt); fehlt die Datei, ist sie leer. */
export function loadKenntnis() {
  const f = ROOT + KENNTNIS_FILE;
  return existsSync(f) ? parseKenntnis(readFileSync(f, 'utf8')) : { items: [], errors: [] };
}

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
 * Gezählt wird wie im Tool (countAttention): konsolidierte Fassungen neu oder unvollständig, Akte neu. Akte aus
 * data/zur-kenntnis.txt (acknowledged) gelten wie im Tool als bekannt.
 */
export async function checkAll(works, query, { only = null, acknowledged = null } = {}) {
  setAcknowledged(acknowledged || loadKenntnis().items);
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

/** Befund: neue konsolidierte Fassungen (Handlungsbedarf, Einbau) getrennt von neuen Akten und Vorschlägen (Information). */
export function befundOf(results, extra = '') {
  const cons = results.flatMap((r) => r.rows.filter((x) => x.type === 'cons').map((x) => ({ ...x, work: r.id, abbr: r.abbr })));
  const info = results.flatMap((r) => r.rows.filter((x) => x.type !== 'cons').map((x) => ({ ...x, work: r.id, abbr: r.abbr })));
  const keys = cons.map((x) => `${x.work}:${x.celex}`).sort();
  return { cons, info, hasFindings: cons.length > 0, fingerprint: fingerprint(keys, extra), failed: results.filter((r) => r.error).map((r) => ({ id: r.id, abbr: r.abbr, error: r.error })) };
}

/** Fingerabdruck eines Befunds: gleiche neue Fassungen (und gleiche Zusatzangabe, z. B. Stand von data/acts.json) = gleicher Wert. */
export const fingerprint = (keys, extra = '') => createHash('sha256').update(JSON.stringify([keys, extra])).digest('hex').slice(0, 16);

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'));
const LANG_ORDER = ['de', 'fr', 'en'];
const links = (x) => LANG_ORDER.filter((l) => (x.langs || []).includes(l)).map((l) => `[${l.toUpperCase()}](${eurlexHtml(x.celex, l)})`).join(' · ') || '–';
const dateDe = (iso) => (iso ? withUiLang('de', () => fmtDate(iso)) : '–');

/**
 * Titel und Text des Issues (Markdown, deutsch). ctx: { now, repoUrl, commit, acknowledgedCount, kenntnisErrors }.
 * Zwei Teile: «Handlungsbedarf» (neue konsolidierte Fassungen; der Workflow baut sie ein und eröffnet einen Pull Request)
 * und «Zur Information» (neue Akte und Vorschläge; zur Kenntnis nehmen über data/zur-kenntnis.txt).
 */
export function issueBody(results, ctx = {}) {
  const now = ctx.now || new Date();
  const repoUrl = ctx.repoUrl || PROJECT.source;
  const keys = itemKeys(results);
  const b = befundOf(results);
  const time = new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' }).format(now);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(now);
  const L = [];
  L.push(`<!-- ${MARKER} ${JSON.stringify({ items: keys })} -->`);
  L.push('Die wöchentliche Prüfung beim Amt für Veröffentlichungen der EU (SPARQL-Endpunkt von Cellar) hat Einträge gefunden, die in den Daten dieses Repositorys fehlen. Es ist dieselbe Prüfung wie im SGK-Navigator unter «Aktualisieren» → «Alle Rechtsakte prüfen».');
  L.push('');
  L.push(`Geprüft am ${dateDe(day)}, ${time} Uhr${ctx.commit ? `, Datenstand des Repositorys: Commit \`${String(ctx.commit).slice(0, 7)}\`` : ''}.`);
  L.push('');
  L.push('## Handlungsbedarf: neue konsolidierte Fassungen', '');
  if (b.cons.length) {
    L.push('| Rechtsakt | CELEX | Datum | Status | EUR-Lex |', '| --- | --- | --- | --- | --- |');
    for (const x of b.cons) L.push(`| ${esc(x.abbr)} | \`${esc(x.celex)}\` | ${dateDe(x.date)} | ${esc(x.status)} | ${links(x)} |`);
    L.push('', 'Der Workflow «Fassungen» baut diese Fassungen selbst ein und eröffnet dazu einen Pull Request. Prüfe ihn und führe ihn zusammen; danach erscheint die neue Version von selbst. Anleitung: ' + `[MAINTAINING.md, «Neue Fassung einbauen»](${repoUrl}/blob/main/MAINTAINING.md#neue-fassung-einbauen). Der Pull Request schliesst dieses Issue, sofern es keine Akte und Vorschläge zur Information mehr nennt.`);
  } else L.push('Keine. Alle konsolidierten Fassungen sind in den Daten.');
  L.push('');
  L.push('## Zur Information: neue Akte und Vorschläge', '');
  if (b.info.length) {
    L.push('| Rechtsakt | Art | CELEX | Datum | EUR-Lex |', '| --- | --- | --- | --- | --- |');
    for (const x of b.info) L.push(`| ${esc(x.abbr)} | ${esc(withUiLang('de', () => D.kindLabel(x.kind)))} | \`${esc(x.celex)}\` | ${dateDe(x.date)} | ${links(x)} |`);
    L.push('', 'Hier besteht kein Handlungsbedarf: Den Wortlaut eines Änderungsakts übernimmt der Navigator mit der nächsten konsolidierten Fassung. Wer einen Eintrag gesehen hat, nimmt ihn zur Kenntnis. Dann meldet ihn weder diese Prüfung noch der Navigator weiter als neu:', '');
    const uniq = [...new Map(b.info.map((x) => [x.celex, x])).values()];
    L.push(`1. Öffne [data/zur-kenntnis.txt zum Bearbeiten](${repoUrl}/edit/main/data/zur-kenntnis.txt).`);
    L.push('2. Kopiere die folgenden Zeilen ans Ende der Datei. Lösche die Zeilen, die du noch nicht zur Kenntnis nehmen willst. Die Bemerkung nach der CELEX-Nummer darfst du ändern.');
    L.push('', '   ```', ...uniq.map((x) => `   ${x.celex}  ${x.abbr}: ${withUiLang('de', () => D.kindLabel(x.kind))} vom ${dateDe(x.date)}`), '   ```', '');
    L.push('3. Wähle **Commit changes…**, dann **Create a new branch for this commit and start a pull request** und **Propose changes**, danach **Create pull request**.');
    L.push('4. Führe den Pull Request zusammen, sobald der Lauf «CI» grün ist. Die nächste Prüfung schliesst dieses Issue, wenn nichts mehr offen ist.');
    L.push('', `Soll ein Akt im Navigator in der Liste der Akte erscheinen, mit Anwendbarkeit für die Schweiz, gib einem Agenten den Auftrag aus [AGENTS.md, Ablauf «Akt erfassen»](${repoUrl}/blob/main/AGENTS.md#akt-erfassen).`);
  } else L.push('Keine.');
  L.push('');
  if (ctx.acknowledgedCount) L.push(`${ctx.acknowledgedCount} Einträge aus \`data/zur-kenntnis.txt\` sind zur Kenntnis genommen und hier nicht aufgeführt.`, '');
  if (ctx.kenntnisErrors && ctx.kenntnisErrors.length) L.push(`**Achtung:** \`data/zur-kenntnis.txt\` enthält Zeilen, die nicht mit einer CELEX-Nummer eines Akts beginnen: ${ctx.kenntnisErrors.map((e) => `Zeile ${e.line} («${esc(e.text.slice(0, 40))}»)`).join(', ')}. Diese Zeilen zählen nicht.`, '');
  if (b.failed.length) L.push(`Nicht geprüft (Fehler bei der Abfrage): ${b.failed.map((r) => `${esc(r.abbr)} (${esc(r.error)})`).join('; ')}. Die nächste Prüfung versucht es erneut.`, '');
  L.push('_Automatisch erstellt vom Workflow «Fassungen» (`.github/workflows/fassungen.yml`, `scripts/check-fassungen.mjs`). Das Issue wird bei jeder Prüfung aktualisiert, solange es offen ist, und geschlossen, wenn nichts mehr offen ist._');
  return { title: TITLE, body: L.join('\n'), keys };
}

/** Schlüssel aus dem Text eines bestehenden Issues lesen (Marker in der ersten Zeile). */
export function keysOfBody(body) {
  const m = new RegExp(`<!-- ${MARKER} (\\{.*?\\}) -->`).exec(body || '');
  if (!m) return null;
  try { const j = JSON.parse(m[1]); return Array.isArray(j.items) ? j.items.slice().sort() : null; } catch { return null; }
}
