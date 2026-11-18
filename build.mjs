// Baut dist/sgk-navigator.html: eine selbsttragende Datei (JS, CSS, Schriften, Icons, Daten inline).
// Aufruf: node build.mjs [--fixtures] [--out <pfad>] [--drop-stage <id>|last-consolidated] [--drop-work-stage <id>:last[,…]]
//         [--update-source none|default|github-release:<owner>/<repo>[/<asset>]|manifest:<https-URL>[+github-release:…]] (sonst SGK_UPDATE_SOURCE, sonst
//         src/app/config/update-source.js) [--version JJJJ.MM.TT[-n]] (sonst SGK_VERSION, sonst Builddatum Europe/Zurich, -n aus SGK_BUILD_N)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lastStage, lastConsolidatedStage, dropStage } from './scripts/lib-variant.mjs';
import { DEFAULT_UPDATE_SOURCE } from './src/app/config/update-source.js';
import { sourceInfo, versionOfBuild, parseVersion } from './src/app/lib/updatecheck.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const OUT = resolve(ROOT, opt('--out', 'dist/sgk-navigator.html'));
const FORCE_FIX = flag('--fixtures');
const DROP = opt('--drop-stage', null);
const p = (...x) => join(ROOT, ...x);
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));

// ------------------------------------------------------------ Daten wählen
const haveReal = existsSync(p('data/dataset.json')) && existsSync(p('data/acts.json'));
const useFix = FORCE_FIX || !haveReal;
if (!useFix && !existsSync(p('data/acts.json'))) console.warn('data/acts.json fehlt');
const dsFile = useFix ? p('test/app/fixtures/dataset.json') : p('data/dataset.json');
const actsFile = useFix || !existsSync(p('data/acts.json')) ? p('test/app/fixtures/acts.json') : p('data/acts.json');
const assetsFile = useFix ? p('test/app/fixtures/assets.json') : p('data/assets.json');
let dataset = readJson(dsFile);
let acts = readJson(actsFile);
const assets = existsSync(assetsFile) ? readJson(assetsFile) : {};
// Etappe 3: Bibliothek weiterer Rechtsakte (data/works/index.json). SGK bleibt in sgk-dataset/acts/assets;
// weitere Werke werden je für sich komprimiert eingebettet und erst bei Bedarf entpackt (src/app/library.js).
const worksIndexFile = p('data/works/index.json');
const worksIndex = !useFix && existsSync(worksIndexFile) ? readJson(worksIndexFile) : [];
const works = [];
for (const w of worksIndex) {
  if (w.id === 'sgk') continue;
  const df = p('data/works', w.dataset), af = w.acts ? p('data/works', w.acts) : null;
  if (!existsSync(df)) { console.warn('Werk ohne Datensatz, übersprungen: ' + w.id); continue; }
  works.push({ w, dataset: readJson(df), acts: af && existsSync(af) ? readJson(af) : [] });
}
// Erwägungsgründe des SGK (separate Datei, BIBLIOTHEK §8): Einheit rct einhängen, toc-Eintrag an erster Stelle
const sgkEntry = worksIndex.find((w) => w.id === 'sgk');
if (!useFix && sgkEntry && sgkEntry.recitals && existsSync(p('data/works', sgkEntry.recitals))) {
  const r = readJson(p('data/works', sgkEntry.recitals));
  if (r.unit && !dataset.units[r.unit.id]) {
    dataset = { ...dataset, units: { [r.unit.id]: r.unit, ...dataset.units }, toc: [r.toc, ...dataset.toc] };
  }
}
// Testvariante: letzten Stand weiterer Werke entfernen (Upload-Tests), z. B. --drop-work-stage ees:last oder ees:last,vis:last
const DROPW = opt('--drop-work-stage', null);
if (DROPW) {
  for (const spec of DROPW.split(',')) {
    const [wid] = spec.split(':');
    const x = works.find((y) => y.w.id === wid);
    if (!x) throw new Error('Werk nicht gefunden: ' + wid);
    const st = lastStage(x.dataset);
    dropStage(x.dataset, st);
    console.log(`Testvariante: Werk ${wid}, Stand ${st.id} (${st.source.celex}) entfernt.`);
  }
}
// Zusatzdaten Etappe 3 (nur SGK): Abweichungen, Begründung, Formulare als Text
const extra = (f) => (!useFix && existsSync(p('data', f)) ? readJson(p('data', f)) : null);
const derogations = extra('derogations.json');
const rationale = extra('rationale.json');
const forms = extra('forms.json');
let status = null;
if (!useFix && existsSync(p('data/STATUS.md'))) {
  const s = readFileSync(p('data/STATUS.md'), 'utf8');
  status = /^- final/im.test(s) ? 'final' : /vorläufig/i.test(s) ? 'vorläufig' : null;
}

// Testvariante: einen Stand entfernen (für den Upload-Test mit echter Datei, SPEC §5.5)
if (DROP) {
  const st = DROP === 'last-consolidated' ? lastConsolidatedStage(dataset) : dataset.stages.find((s) => s.id === DROP);
  if (!st) throw new Error('Stand zum Entfernen nicht gefunden: ' + DROP);
  const later = dataset.stages.filter((s) => s.order > st.order);
  if (later.length) console.warn(`Achtung: nach ${st.id} folgen weitere Stände (${later.map((s) => s.id).join(', ')}); sie bleiben erhalten.`);
  dataset = dropStage({ ...dataset }, st);
  console.log(`Testvariante: Stand ${st.id} (${st.source.celex}) entfernt.`);
}

// ------------------------------------------------------------ Version und Quelle für neue Versionen (src/app/ui/updatenotice.js)
function updateSourceFrom(spec) {
  if (!spec || spec === 'default') return null;
  if (spec === 'none' || spec === 'off') return { kind: '' };
  const gh = (x) => {
    const m = /^github-release:([^/]+)\/([^/]+)(?:\/(.+))?$/.exec(x);
    return m ? { kind: 'github-release', owner: m[1], repo: m[2], asset: m[3] || 'SGK-Navigator.html', url: '' } : null;
  };
  if (gh(spec)) return gh(spec);
  // manifest:<https-URL> oder manifest:<https-URL>+github-release:<owner>/<repo>[/<asset>] (Releases-API als Ersatz)
  const m = /^manifest:(https:\/\/.+?)(?:\+(github-release:.+))?$/.exec(spec);
  if (m) {
    const src = { kind: 'manifest', owner: '', repo: '', asset: '', url: m[1] };
    if (m[2]) { src.fallback = gh(m[2]); if (!src.fallback) throw new Error('--update-source: Ersatzquelle unbekannt ' + m[2]); }
    return src;
  }
  throw new Error('--update-source: unbekannte Angabe ' + spec);
}
const UPDATE_SOURCE = updateSourceFrom(opt('--update-source', process.env.SGK_UPDATE_SOURCE || null)) || DEFAULT_UPDATE_SOURCE;
const UPDATE_INFO = sourceInfo(UPDATE_SOURCE);
const VERSION = opt('--version', process.env.SGK_VERSION || null) || versionOfBuild(new Date(), Number(process.env.SGK_BUILD_N || 1));
if (!parseVersion(VERSION)) throw new Error('Version nicht im Schema JJJJ.MM.TT[-n]: ' + VERSION);

// ------------------------------------------------------------ Kernbibliothek (virtuelle Module)
const coreModel = p('src/core/model.js');
const coreParser = p('src/core/parser.js');
const empty = p('src/app/core-missing.js');
const corePlugin = {
  name: 'sgk-core',
  setup(b) {
    b.onResolve({ filter: /^sgk-core\/(model|parser)$/ }, (a) => {
      const f = a.path.endsWith('model') ? coreModel : coreParser;
      return { path: existsSync(f) && !FORCE_FIX_CORE ? f : empty };
    });
  },
};
const FORCE_FIX_CORE = flag('--no-core');

const bundle = await build({
  entryPoints: [p('src/app/main.js')],
  bundle: true, write: false, format: 'iife', target: ['chrome110', 'firefox115', 'safari16.4', 'edge110'],
  minify: !flag('--dev'), legalComments: 'none', charset: 'utf8',
  plugins: [corePlugin],
  external: ['html2canvas', 'dompurify', 'canvg', 'core-js'],
  define: { __SGK_UPDATE_SOURCE__: JSON.stringify(UPDATE_SOURCE), __LOGO_SRC__: JSON.stringify('data:image/svg+xml;base64,' + readFileSync(p('src/app/assets/logo.svg')).toString('base64')) },
  logLevel: 'warning',
});
let js = bundle.outputFiles[0].text;

// ------------------------------------------------------------ Modul Verhandlung: pdf.js (Bibliothek und Worker) und Beispiel-Dossier
// pdf.js wird als IIFE (globale Variablen pdfjsLib bzw. pdfjsWorker) gebaut, komprimiert eingebettet und erst beim ersten
// PDF-Import entpackt (src/app/modules/neg/core.js). Der Worker läuft als Blob-Worker (CSP worker-src blob:), sonst im Hauptthread.
const iife = async (file, globalName) => (await build({
  entryPoints: [p(file)], bundle: true, write: false, format: 'iife', globalName, minify: true, legalComments: 'none',
  target: ['chrome110', 'firefox115', 'safari16.4', 'edge110'], logLevel: 'error', define: { 'import.meta.url': '"about:blank"' },
})).outputFiles[0].text;
const pdfjsLib = await iife('node_modules/pdfjs-dist/legacy/build/pdf.min.mjs', 'pdfjsLib');
const pdfjsWorker = await iife('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', 'pdfjsWorker');
const gzText = (s) => gzipSync(Buffer.from(s), { level: 9 }).toString('base64');
// Beispiel-Dossiers: alle data/neg-demo*.json (Schlüssel = Dateiname ohne "neg-"), sonst das Test-Dossier aus den Fixtures
import { readdirSync } from 'node:fs';
const demoFiles = (!FORCE_FIX && existsSync(p('data')) ? readdirSync(p('data')).filter((f) => /^neg-demo[\w-]*\.json$/.test(f)).sort((a, b) => a.length - b.length || a.localeCompare(b)).map((f) => p('data', f)) : []);
if (!demoFiles.length && existsSync(p('test/app/fixtures/neg-dossier.json'))) demoFiles.push(p('test/app/fixtures/neg-dossier.json'));
const negDemos = [];
for (const f of demoFiles) {
  try {
    const d = readJson(f);
    if (d.kind !== 'neg-dossier') { console.warn('Kein Dossier, übersprungen: ' + f); continue; }
    negDemos.push({ key: f.replace(/^.*\//, '').replace(/^neg-/, '').replace(/\.json$/, ''), file: f.replace(ROOT + '/', ''), d });
  } catch (e) { console.warn(`Beispiel-Dossier nicht lesbar (${f}): ${e.message}`); }
}
const attr = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// ------------------------------------------------------------ CSS und Schriften
const font = (pkg, file) => readFileSync(p('node_modules/@fontsource', pkg, 'files', file)).toString('base64');
// Carbon: IBM Plex Sans (Oberfläche), Serif (Rechtstext), Mono (Kennungen); Teilmenge latin, für Serif zusätzlich latin-ext
// (Namen wie «Łódź» im Rechtstext). Die unicode-range stammt aus den CSS-Dateien von @fontsource.
const range = (pkg, w, st, subset) => {
  const css = readFileSync(p('node_modules/@fontsource', pkg, st === 'italic' ? `${w}-italic.css` : `${w}.css`), 'utf8');
  const m = css.split('@font-face').find((x) => x.includes(`${pkg}-${subset}-${w}-${st}.woff2`));
  const r = m && /unicode-range:\s*([^;]+);/.exec(m);
  return r ? r[1].trim() : null;
};
const faces = [
  ['IBM Plex Sans', 'ibm-plex-sans', 300, 'normal', 'latin'], ['IBM Plex Sans', 'ibm-plex-sans', 400, 'normal', 'latin'], ['IBM Plex Sans', 'ibm-plex-sans', 400, 'italic', 'latin'], ['IBM Plex Sans', 'ibm-plex-sans', 600, 'normal', 'latin'],
  ['IBM Plex Serif', 'ibm-plex-serif', 400, 'normal', 'latin'], ['IBM Plex Serif', 'ibm-plex-serif', 400, 'italic', 'latin'],
  ['IBM Plex Serif', 'ibm-plex-serif', 400, 'normal', 'latin-ext'], ['IBM Plex Serif', 'ibm-plex-serif', 400, 'italic', 'latin-ext'],
  // echter Fettschnitt für die Quellenauszeichnung «neu (fett)» im Rechtstext der Synopse
  ['IBM Plex Serif', 'ibm-plex-serif', 600, 'normal', 'latin'], ['IBM Plex Serif', 'ibm-plex-serif', 600, 'normal', 'latin-ext'],
  ['IBM Plex Mono', 'ibm-plex-mono', 400, 'normal', 'latin'], ['IBM Plex Mono', 'ibm-plex-mono', 500, 'normal', 'latin'],
];
// Zeichen, die in den Teilmengen fehlen (✓ ≈ → aus Plex Sans; ○ ● ■ ✕ ✎ … aus DejaVu Sans), siehe test/app/tools/make-ui-symbols.py
const symSrc = readFileSync(p('src/app/assets/ui-symbols.js'), 'utf8');
const symFont = (name) => [...symSrc.matchAll(/export const ([A-Z]+) = '([^']+)'/g)].find((m) => m[1] === name)[2];
const symCss = `@font-face{font-family:"SGKN Zeichen";font-display:block;src:url(data:font/ttf;base64,${symFont('ZEICHEN')}) format("truetype")}\n@font-face{font-family:"SGKN Symbole";font-display:block;src:url(data:font/ttf;base64,${symFont('SYMBOLE')}) format("truetype")}`;
const fontCss = faces.map(([fam, pkg, w, st, sub]) => { const r = range(pkg, w, st, sub); return `@font-face{font-family:"${fam}";font-style:${st};font-weight:${w};font-display:block;src:url(data:font/woff2;base64,${font(pkg, `${pkg}-${sub}-${w}-${st}.woff2`)}) format("woff2")${r ? `;unicode-range:${r}` : ''}}`; }).join('\n') + '\n' + symCss;
// Modul-Stylesheets (src/app/modules/<modul>/*.css) werden in alphabetischer Reihenfolge an styles.css angehängt.
const moduleCss = existsSync(p('src/app/modules'))
  ? readdirSync(p('src/app/modules'), { withFileTypes: true }).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((d) => readdirSync(p('src/app/modules', d.name)).filter((f) => f.endsWith('.css')).sort().map((f) => p('src/app/modules', d.name, f)))
  : [];
const css = [p('src/app/styles.css'), ...moduleCss].map((f) => readFileSync(f, 'utf8')).join('\n');
const icons = readFileSync(p('src/app/assets/icons.svg'), 'utf8').replace(/<\?xml[^>]*>/, '');

// ------------------------------------------------------------ Daten einbetten
const gz = (obj) => gzipSync(Buffer.from(JSON.stringify(obj)), { level: 9 }).toString('base64');
const meta = { version: VERSION, built: new Date().toISOString(), fixtures: useFix, status, sources: { dataset: dsFile.replace(ROOT + '/', ''), acts: actsFile.replace(ROOT + '/', ''), assets: existsSync(assetsFile) ? assetsFile.replace(ROOT + '/', '') : null }, dropped: DROP || null };
// script-src: zusätzlich genau der SPARQL-Endpunkt (Pfad, nicht der ganze Ursprung) für die Prüfung auf neue Fassungen
// per JSONP (src/app/lib/sparql.js); der Endpunkt sendet keine CORS-Freigabe, fetch() aus file:// ist blockiert.
// connect-src: zusätzlich die Ursprünge der Versionsangabe, nur wenn eine Quelle eingerichtet ist (Manifest auf GitHub Pages,
// ersatzweise api.github.com).
const csp = [
  "default-src 'none'", "script-src 'unsafe-inline' https://publications.europa.eu/webapi/rdf/sparql", "style-src 'unsafe-inline'", 'img-src data: blob:', 'font-src data:',
  `connect-src https://publications.europa.eu${UPDATE_INFO ? ' ' + UPDATE_INFO.origins.join(' ') : ''} data: blob:`, 'worker-src blob:', "base-uri 'none'", "form-action 'none'",
].join('; ');

const htmlOut = `<!DOCTYPE html>
<html lang="de-CH">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="description" content="SGK-Navigator: Änderungen am Schengener Grenzkodex nachverfolgen, vergleichen und exportieren.">
<title>SGK-Navigator</title>
<style>${fontCss}</style>
<style>${css}</style>
</head>
<body>
<div hidden aria-hidden="true">${icons}</div>
<div id="app"></div>
<script type="application/json" id="sgk-meta">${JSON.stringify(meta)}</script>
<script type="application/octet-stream" id="sgk-dataset" data-enc="gz64">${gz(dataset)}</script>
<script type="application/octet-stream" id="sgk-acts" data-enc="gz64">${gz(acts)}</script>
<script type="application/octet-stream" id="sgk-assets" data-enc="gz64">${gz(assets)}</script>
<script type="application/json" id="sgk-works">${JSON.stringify(worksIndex.map((w) => ({ id: w.id, celex: w.celex, number: w.number, short: w.short, abbr: w.abbr, full: !!w.full, assets: !!w.assets })))}</script>
${works.map((x) => `<script type="application/octet-stream" class="sgk-work" id="work-${x.w.id}" data-enc="gz64" data-work="${x.w.id}">${gz({ dataset: x.dataset, acts: x.acts })}</script>`).join('\n')}
${derogations ? `<script type="application/octet-stream" id="sgk-derogations" data-enc="gz64">${gz(derogations)}</script>` : ''}
${rationale ? `<script type="application/octet-stream" id="sgk-rationale" data-enc="gz64">${gz(rationale)}</script>` : ''}
${forms ? `<script type="application/octet-stream" id="sgk-forms" data-enc="gz64">${gz(forms)}</script>` : ''}
${negDemos.map((x) => `<script type="application/octet-stream" class="neg-demo" id="neg-demo-${x.key}" data-enc="gz64" data-key="${x.key}" data-src="${x.file}" data-title="${attr(x.d.short || x.d.title)}" data-procedure="${attr(x.d.procedure)}" data-docs="${x.d.documents.length}" data-rows="${x.d.rows.length}" data-from="${attr((x.d.documents.map((y) => y.date).filter(Boolean).sort()[0]) || '')}" data-to="${attr((x.d.documents.map((y) => y.date).filter(Boolean).sort().slice(-1)[0]) || '')}">${gz(x.d)}</script>`).join('\n')}
<script type="application/octet-stream" id="neg-pdfjs" data-enc="gz64t">${gzText(pdfjsLib)}</script>
<script type="application/octet-stream" id="neg-pdfworker" data-enc="gz64t">${gzText(pdfjsWorker)}</script>
<script>${js.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>
`;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, htmlOut);
const size = statSync(OUT).size;
console.log(`Verhandlung: Beispiel-Dossiers ${negDemos.length ? negDemos.map((x) => x.file + ' (' + x.d.rows.length + ' Zeilen)').join(', ') : 'keine'} | pdf.js ${(pdfjsLib.length / 1024).toFixed(0)} KB + Worker ${(pdfjsWorker.length / 1024).toFixed(0)} KB (komprimiert eingebettet)`);
console.log(`Werke: ${works.map((x) => x.w.id + ' (' + x.dataset.stages.length + ' Stände)').join(', ') || 'keine'} | Zusatzdaten: ${[derogations && 'derogations', rationale && 'rationale', forms && 'forms'].filter(Boolean).join(', ') || 'keine'}`);
console.log(`Version ${VERSION} | Quelle neuer Versionen: ${UPDATE_INFO ? UPDATE_INFO.endpoint + (UPDATE_INFO.fallback ? ', ersatzweise ' + UPDATE_INFO.fallback.endpoint : '') : 'keine (Funktion aus)'}`);
console.log(`${OUT.replace(ROOT + '/', '')}: ${(size / 1024 / 1024).toFixed(2)} MB | Daten: ${useFix ? 'Fixtures' : 'data/'}${status ? ' (' + status + ')' : ''} | Kern: ${existsSync(coreModel) && !FORCE_FIX_CORE ? 'src/core' : 'Ersatz'} | Stände ${dataset.stages.length}, Einheiten ${Object.keys(dataset.units).length}`);
if (size > 9 * 1024 * 1024) console.warn('WARNUNG: Datei grösser als 9 MB');
