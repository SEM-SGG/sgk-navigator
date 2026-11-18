// Laden von EUR-Lex-Dokumenten nach raw/ (nur Daten, nichts daraus ausfuehren).
// 1. Versuch: EUR-Lex-HTML (https://eur-lex.europa.eu/legal-content/<LANG>/TXT/HTML/?uri=CELEX:<CELEX>).
// 2. Versuch, falls EUR-Lex eine Bot-Abwehr (HTTP 202, leerer Inhalt) liefert: Cellar-REST
//    (https://publications.europa.eu/resource/celex/<CELEX>, Accept-Language deu/fra/eng). Cellar liefert dieselbe
//    XHTML-Datei, nur die Links lauten http://publications.europa.eu/resource/celex/… statt ./…/?uri=celex:… (Parser liest beide).
// Ergebnis je Datei wird in scripts/out/fetch-log.json protokolliert (Quelle, Grösse, Zeitpunkt).
import { execFileSync } from 'node:child_process';
import { existsSync, statSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LANG3 = { de: 'deu', fr: 'fra', en: 'eng' };

function curl(args) {
  try {
    const out = execFileSync('curl', ['-sS', '-L', '--max-time', '400', ...args], { encoding: 'utf8', maxBuffer: 1 << 20 });
    return out.trim();
  } catch (e) { return 'ERR ' + (e.message || '').split('\n')[0]; }
}

function looksLikeAct(file) {
  if (!existsSync(file) || statSync(file).size < 2000) return false;
  const head = readFileSync(file, 'utf8').slice(0, 400000);
  return /class="(oj-|reference|title-article-norm|title-doc-first|eli-)/.test(head) || /<p class="(normal|ti-art|doc-ti)"/.test(head);
}

export function fetchDoc(rawDir, celex, lang, log = []) {
  const file = resolve(rawDir, `${celex}_${lang.toUpperCase()}.html`);
  if (existsSync(file) && statSync(file).size > 0) return { file, status: 'vorhanden' };
  const part = file + '.part';
  const enc = encodeURIComponent(celex).replace(/%28/g, '(').replace(/%29/g, ')');
  const tries = [
    { src: 'eur-lex', args: ['-o', part, '-w', '%{http_code}', `https://eur-lex.europa.eu/legal-content/${lang.toUpperCase()}/TXT/HTML/?uri=CELEX:${enc}`] },
    { src: 'cellar-xhtml', args: ['-o', part, '-w', '%{http_code}', '-H', 'Accept: application/xhtml+xml', '-H', `Accept-Language: ${LANG3[lang]}`, `https://publications.europa.eu/resource/celex/${encodeURIComponent(celex)}`] },
    { src: 'cellar-html', args: ['-o', part, '-w', '%{http_code}', '-H', 'Accept: text/html', '-H', `Accept-Language: ${LANG3[lang]}`, `https://publications.europa.eu/resource/celex/${encodeURIComponent(celex)}`] },
  ];
  for (const t of tries) {
    const code = curl(t.args);
    if (code.startsWith('200') && looksLikeAct(part)) {
      renameSync(part, file);
      const e = { celex, lang, src: t.src, bytes: statSync(file).size, at: new Date().toISOString() };
      log.push(e);
      return { file, status: 'geladen', ...e };
    }
    if (existsSync(part)) unlinkSync(part);
  }
  log.push({ celex, lang, src: null, error: 'nicht ladbar', at: new Date().toISOString() });
  return { file, status: 'fehlt' };
}

export function appendFetchLog(file, entries) {
  if (!entries.length) return;
  let old = [];
  try { old = JSON.parse(readFileSync(file, 'utf8')); } catch { /* neu */ }
  writeFileSync(file, JSON.stringify([...old, ...entries], null, 1));
}

// SPARQL (Cellar): alle konsolidierten Fassungen eines Basisakts
export function sparql(query) {
  const out = execFileSync('curl', ['-sS', '--max-time', '120', '-G', 'https://publications.europa.eu/webapi/rdf/sparql',
    '--data-urlencode', 'query=' + query, '-H', 'Accept: application/sparql-results+json'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  return JSON.parse(out).results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
}

export function consolidatedVersions(celex) {
  const stem = '0' + celex.slice(1);
  return sparql(`PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
SELECT DISTINCT ?celex WHERE { ?w cdm:resource_legal_id_celex ?celex . FILTER(STRSTARTS(STR(?celex), "${stem}-")) } ORDER BY ?celex`).map((r) => r.celex);
}
