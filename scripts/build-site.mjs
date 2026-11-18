// Baut die Download-Seite für GitHub Pages (Quelle site/) und das Manifest version.json, das der SGK-Navigator für den
// Hinweis auf neue Versionen abfragt (src/app/config/update-source.js). Läuft im Release-Workflow (.github/workflows/release.yml).
//
// Aufruf: node scripts/build-site.mjs --version JJJJ.MM.TT[-n] [--file dist/SGK-Navigator.html] [--out dist/site]
//         [--repo <owner>/<name>] [--notes-de "…"] [--notes-fr "…"] (auch SGK_NOTES_DE, SGK_NOTES_FR)
// --file: gebaute Datei; ihre eingebettete Version muss --version entsprechen (Abbruch sonst), Grösse für die Seite.
// --repo: Vorgabe GITHUB_REPOSITORY, sonst src/app/config/update-source.js.
// --release-notes <datei>: zusätzlich den Text des GitHub-Releases (Markdown) schreiben.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT, ASSET } from '../src/app/config/update-source.js';
import { parseVersion } from '../src/app/lib/updatecheck.js';
import { fmtDate } from '../src/app/lib/format.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const p = (...x) => join(ROOT, ...x);
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));

const v = parseVersion(opt('--version', process.env.SGK_VERSION || ''));
if (!v) { console.error('--version JJJJ.MM.TT[-n] fehlt oder ist ungültig'); process.exit(1); }
const VERSION = v.text;
const OUT = resolve(ROOT, opt('--out', 'dist/site'));
const repoSpec = opt('--repo', process.env.GITHUB_REPOSITORY || `${PROJECT.owner}/${PROJECT.repo}`);
const [owner, repo] = repoSpec.split('/');
if (!owner || !repo) { console.error('--repo <owner>/<name> ungültig: ' + repoSpec); process.exit(1); }
if (`${owner}/${repo}`.toLowerCase() !== `${PROJECT.owner}/${PROJECT.repo}`.toLowerCase()) {
  console.warn(`WARNUNG: Repo ${owner}/${repo} weicht von src/app/config/update-source.js (${PROJECT.owner}/${PROJECT.repo}) ab; das Tool sucht neue Versionen dort.`);
}
const gh = `https://github.com/${owner}/${repo}`;
const links = {
  page: `https://${owner.toLowerCase()}.github.io/${repo}/`,
  url: `${gh}/releases/download/v${VERSION}/${ASSET}`,
  latest: `${gh}/releases/latest/download/${ASSET}`,
  release: `${gh}/releases/tag/v${VERSION}`,
  releases: `${gh}/releases`,
  repo: gh,
  issues: `${gh}/issues/new/choose`,
};

// gebaute Datei prüfen
let sizeMb = 7;
const file = opt('--file', null);
if (file) {
  const html = readFileSync(resolve(ROOT, file), 'utf8');
  const m = /<script type="application\/json" id="sgk-meta">([^<]+)<\/script>/.exec(html);
  const embedded = m ? JSON.parse(m[1]).version : null;
  if (embedded !== VERSION) { console.error(`Version der Datei (${embedded}) passt nicht zu --version (${VERSION})`); process.exit(1); }
  sizeMb = Math.round(statSync(resolve(ROOT, file)).size / 1024 / 1024);
}

// Datenstand je Rechtsakt: jüngster Stand (Datum, Quelle)
const idx = readJson(p('data/works/index.json'));
const stand = idx.map((w) => {
  const ds = readJson(w.id === 'sgk' ? p('data/dataset.json') : p('data/works', w.dataset));
  const st = [...ds.stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).at(-1);
  return { id: w.id, abbr: w.abbr, short: w.short, number: w.number, date: st.date, celex: st.source && st.source.celex };
});
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (s, l) => (l === 'fr' ? `règlement ${s.number.replace('(EU)', '(UE)').replace('(EG) Nr.', '(CE) n°')}` : `Verordnung ${s.number}`);
const standHtml = (l) => stand.map((s) => `<li><strong>${esc(s.short[l])}</strong> (${esc(num(s, l))})${l === 'fr' ? '&#8239;: version du' : ': Fassung vom'} ${esc(fmtDate(s.date, l))}${s.celex ? ` (<span class="mono">${esc(s.celex)}</span>)` : ''}</li>`).join('');

const notes = {
  de: opt('--notes-de', process.env.SGK_NOTES_DE || '') || 'Neue Version des SGK-Navigators. Datenstand der Rechtsakte siehe unten.',
  fr: opt('--notes-fr', process.env.SGK_NOTES_FR || '') || 'Nouvelle version du SGK-Navigator. État des données des actes ci-dessous.',
};
const dateText = { de: fmtDate(v.date, 'de'), fr: fmtDate(v.date, 'fr') };

const fill = (tpl, map) => tpl.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => { if (!(k in map)) throw new Error('Platzhalter ohne Wert: ' + k); return map[k]; });
const page = fill(readFileSync(p('site/index.html'), 'utf8'), {
  VERSION: esc(VERSION), DATE_DE: esc(dateText.de), DATE_FR: esc(dateText.fr), SIZE_MB: String(sizeMb),
  URL: esc(links.url), LATEST: esc(links.latest), RELEASE: esc(links.release), RELEASES: esc(links.releases), REPO: esc(links.repo), ISSUES: esc(links.issues),
  NOTES_DE: esc(notes.de), NOTES_FR: esc(notes.fr), STAND_DE: standHtml('de'), STAND_FR: standHtml('fr'),
});

const manifest = {
  version: VERSION, date: v.date, url: links.url, page: links.page, release: links.release, notes, dateText,
  data: stand.map((s) => ({ id: s.id, abbr: s.abbr.de, date: s.date, celex: s.celex })),
};

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'fonts'), { recursive: true });
writeFileSync(join(OUT, 'index.html'), page);
writeFileSync(join(OUT, 'version.json'), JSON.stringify(manifest, null, 2) + '\n');
copyFileSync(p('site/site.css'), join(OUT, 'site.css'));
copyFileSync(p('site/site.js'), join(OUT, 'site.js'));
writeFileSync(join(OUT, '.nojekyll'), '');
for (const [pkg, f] of [['ibm-plex-sans', 'ibm-plex-sans-latin-300-normal.woff2'], ['ibm-plex-sans', 'ibm-plex-sans-latin-400-normal.woff2'], ['ibm-plex-sans', 'ibm-plex-sans-latin-600-normal.woff2'], ['ibm-plex-mono', 'ibm-plex-mono-latin-400-normal.woff2']]) {
  copyFileSync(p('node_modules/@fontsource', pkg, 'files', f), join(OUT, 'fonts', f));
}
copyFileSync(p('src/export/fonts/OFL.txt'), join(OUT, 'fonts', 'OFL.txt'));
const notesFile = opt('--release-notes', null);
if (notesFile) {
  const short = (d) => d.split('-').reverse().join('.');
  const md = [
    notes.de, '', `*${notes.fr}*`, '',
    `**Herunterladen:** unten unter «Assets» die Datei \`${ASSET}\` wählen und per Doppelklick in Chrome oder Edge öffnen. Ein GitHub-Konto ist nicht nötig. Anleitung: ${links.page}`,
    '', '**Datenstand:**', ...stand.map((s) => `- ${s.abbr.de}: Fassung vom ${short(s.date)} (\`${s.celex}\`)`),
    '', 'Keine amtliche Veröffentlichung. Massgebend ist allein das Amtsblatt der Europäischen Union.', '',
  ].join('\n');
  mkdirSync(dirname(resolve(ROOT, notesFile)), { recursive: true });
  writeFileSync(resolve(ROOT, notesFile), md);
}
console.log(`Download-Seite ${OUT.replace(ROOT + '/', '')}: Version ${VERSION} (${dateText.de}), Download ${links.url}, Seite ${links.page}`);
