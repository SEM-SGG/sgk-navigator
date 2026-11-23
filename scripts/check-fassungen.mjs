// Prüft für alle Rechtsakte der Bibliothek beim Amt für Veröffentlichungen der EU (SPARQL-Endpunkt von Cellar), ob es neue
// konsolidierte Fassungen oder neue Akte gibt, die in den Daten des Repositorys fehlen. Gleiche Abfragen und Statuslogik wie
// «Aktualisieren» im Werkzeug. Läuft im Workflow «Fassungen» (.github/workflows/fassungen.yml).
//
// Ergebnis: Issue «Neue Fassungen auf EUR-Lex» mit zwei Teilen: neue konsolidierte Fassungen (Handlungsbedarf; der Workflow
// baut sie danach ein) und neue Akte und Vorschläge (Information; zur Kenntnis nehmen über data/zur-kenntnis.txt).
// Ist nichts mehr offen, schliesst das Skript das Issue. Ein offenes Issue wird aktualisiert, nie doppelt eröffnet.
//
// Aufruf:
//   node scripts/check-fassungen.mjs --dry-run              nur ausgeben, nichts auf GitHub ändern (Probelauf)
//   node scripts/check-fassungen.mjs                        Issue eröffnen, aktualisieren oder schliessen (gh CLI, GH_TOKEN)
//   Optionen: --out <datei> (Befund als JSON für scripts/fassungen-pr.mjs), --works sgk,ees (nur diese Werke),
//             --json <datei> (Rohergebnis je Werk)
// Hinter einem Proxy (lokal): NODE_USE_ENV_PROXY=1 node scripts/check-fassungen.mjs --dry-run
// Exit 0 auch bei Befund; Exit 1, wenn kein einziges Werk geprüft werden konnte oder gh fehlschlägt.
import { writeFileSync, mkdtempSync, appendFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { loadWorks, fetchQuery, checkAll, issueBody, keysOfBody, befundOf, loadKenntnis, MARKER } from './fassungen/lib.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const DRY = flag('--dry-run');
const only = opt('--works', null) ? opt('--works').split(',') : null;
const repo = process.env.GITHUB_REPOSITORY || null;
const repoUrl = repo ? `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${repo}` : undefined;
const summary = (t) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, t + '\n'); };

const kenntnis = loadKenntnis();
const works = loadWorks();
const results = await checkAll(works, fetchQuery(), { only, acknowledged: kenntnis.items });
if (opt('--json', null)) writeFileSync(opt('--json'), JSON.stringify(results, null, 2));

for (const r of results) {
  if (r.error) console.log(`${r.abbr}: nicht geprüft (${r.error})`);
  else console.log(`${r.abbr}: ${r.rows.length ? r.rows.map((x) => `${x.celex} (${x.type === 'cons' ? 'Fassung' : 'Akt'}, ${x.status})`).join(', ') : 'nichts Neues'}`);
}
for (const r of results.filter((x) => x.error)) console.log(`::warning title=Fassungsprüfung::${r.abbr} nicht geprüft: ${r.error}`);
for (const e of kenntnis.errors) console.log(`::warning title=data/zur-kenntnis.txt::Zeile ${e.line} zählt nicht: ${e.text.slice(0, 60)}`);

// Der Fingerabdruck umfasst bei einer neuen Fassung des SGK auch data/acts.json: Ergänzt eine Fachperson dort den Änderungsakt,
// baut der nächste Lauf den Pull Request neu.
const sgkCons = results.some((r) => r.id === 'sgk' && r.rows.some((x) => x.type === 'cons'));
const extra = sgkCons ? createHash('sha256').update(readFileSync(new URL('../data/acts.json', import.meta.url))).digest('hex').slice(0, 16) : '';
const befund = { ...befundOf(results, extra), today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date()), commit: process.env.GITHUB_SHA || null, issue: null, issueHasInfo: false };
const found = results.some((r) => r.rows.length);
const issue = issueBody(results, { repoUrl, commit: process.env.GITHUB_SHA, acknowledgedCount: kenntnis.items.length, kenntnisErrors: kenntnis.errors });
befund.issueHasInfo = befund.info.length > 0;

const failed = results.filter((r) => r.error);
const save = () => { if (opt('--out', null)) writeFileSync(opt('--out'), JSON.stringify(befund, null, 1)); };
summary(found ? `## Befund\n\nNeue konsolidierte Fassungen: ${befund.cons.length}. Neue Akte und Vorschläge (Information): ${befund.info.length}.\n` : `## Keine neuen Fassungen\n\nGeprüft: ${results.filter((r) => !r.error).map((r) => r.abbr).join(', ') || 'keines'}.\n`);

if (failed.length === results.length) {
  save();
  console.error('Kein Rechtsakt konnte geprüft werden (Endpunkt nicht erreichbar?).');
  process.exit(1);
}
if (DRY) {
  save();
  if (found) console.log(`\n--- Probelauf: dieses Issue würde eröffnet bzw. aktualisiert ---\n\nTitel: ${issue.title}\n\n${issue.body}`);
  else console.log('Nichts Neues: kein Issue (ein offenes Issue würde geschlossen).');
  process.exit(0);
}

// ------------------------------------------------------------ GitHub (gh CLI)
const gh = (a) => execFileSync('gh', [...a, ...(repo ? ['--repo', repo] : [])], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] });
const dir = mkdtempSync(join(tmpdir(), 'sgk-fassungen-'));
const file = (name, text) => { const f = join(dir, name); writeFileSync(f, text); return f; };
try {
  const open = JSON.parse(gh(['issue', 'list', '--state', 'open', '--limit', '200', '--json', 'number,title,body']));
  const mine = open.find((x) => (x.body || '').includes(`<!-- ${MARKER} `));
  if (!found) {
    if (mine) {
      gh(['issue', 'comment', String(mine.number), '--body-file', file('done.md', 'Die Prüfung findet nichts mehr, was fehlt: Alle konsolidierten Fassungen sind in den Daten, alle neuen Akte und Vorschläge erfasst oder zur Kenntnis genommen. Das Issue wird geschlossen. Die nächste Prüfung eröffnet bei Bedarf ein neues.')]);
      gh(['issue', 'close', String(mine.number)]);
      console.log(`Nichts mehr offen: Issue #${mine.number} geschlossen.`);
      summary(`Issue #${mine.number} geschlossen.`);
    } else console.log('Nichts Neues: kein Issue.');
  } else if (!mine) {
    const url = gh(['issue', 'create', '--title', issue.title, '--body-file', file('body.md', issue.body)]).trim();
    befund.issue = Number(url.split('/').pop()) || null;
    console.log('Issue eröffnet: ' + url);
    summary(`Issue eröffnet: ${url}`);
  } else {
    const before = keysOfBody(mine.body) || [];
    gh(['issue', 'edit', String(mine.number), '--title', issue.title, '--body-file', file('body.md', issue.body)]);
    const added = issue.keys.filter((k) => !before.includes(k));
    if (added.length) gh(['issue', 'comment', String(mine.number), '--body-file', file('comment.md', `Neu seit der letzten Prüfung: ${added.map((k) => '`' + k.replace(':', ' ') + '`').join(', ')}. Die Tabellen oben sind aktualisiert.`)]);
    befund.issue = mine.number;
    console.log(`Issue #${mine.number} aktualisiert${added.length ? ` (${added.length} neu, Kommentar geschrieben)` : ' (keine neuen Einträge)'}.`);
    summary(`Issue #${mine.number} aktualisiert.`);
  }
} catch (e) {
  save();
  console.error('GitHub-Aufruf fehlgeschlagen: ' + (e.message || e));
  process.exit(1);
}
save();
