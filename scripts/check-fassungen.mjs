// Prüft für alle Rechtsakte der Bibliothek, ob es beim Amt für Veröffentlichungen der EU neue konsolidierte Fassungen oder
// neue Akte gibt, die in den Daten des Repos fehlen, und eröffnet bzw. aktualisiert das Issue «Neue Fassungen verfügbar».
// Läuft wöchentlich in GitHub Actions (.github/workflows/fassungen.yml); gleiche Abfragen und Statuslogik wie im Tool.
//
// Aufruf:
//   node scripts/check-fassungen.mjs --dry-run            nur ausgeben (Titel und Text des Issues), nichts auf GitHub ändern
//   node scripts/check-fassungen.mjs                      Issue eröffnen bzw. aktualisieren (gh CLI, GH_TOKEN)
//   Optionen: --works sgk,ees (nur diese Werke), --json <datei> (Ergebnis als JSON speichern)
// Hinter einem Proxy (lokal): NODE_USE_ENV_PROXY=1 node scripts/check-fassungen.mjs --dry-run (Node ab 22.21 liest HTTPS_PROXY).
// Ergebnis: Exit 0 (auch wenn etwas neu ist), Exit 1, wenn kein einziges Werk geprüft werden konnte oder gh fehlschlägt.
import { writeFileSync, mkdtempSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadWorks, fetchQuery, checkAll, issueBody, keysOfBody, MARKER } from './fassungen/lib.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const DRY = flag('--dry-run');
const only = opt('--works', null) ? opt('--works').split(',') : null;
const repo = process.env.GITHUB_REPOSITORY || null;
const repoUrl = repo ? `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${repo}` : undefined;

const works = loadWorks();
const results = await checkAll(works, fetchQuery(), { only });
if (opt('--json', null)) writeFileSync(opt('--json'), JSON.stringify(results, null, 2));

for (const r of results) {
  if (r.error) console.log(`${r.abbr}: nicht geprüft (${r.error})`);
  else console.log(`${r.abbr}: ${r.rows.length ? r.rows.map((x) => `${x.celex} (${x.status})`).join(', ') : 'nichts Neues'}`);
}
const failed = results.filter((r) => r.error);
for (const r of failed) console.log(`::warning title=Fassungsprüfung::${r.abbr} nicht geprüft: ${r.error}`);
const found = results.some((r) => r.rows.length);
const issue = issueBody(results, { repoUrl, commit: process.env.GITHUB_SHA });

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, found ? `## ${issue.title}\n\n${issue.body.split('\n').slice(1).join('\n')}\n` : `## Keine neuen Fassungen\n\nGeprüft: ${results.filter((r) => !r.error).map((r) => r.abbr).join(', ') || 'keines'}.\n`);
}

if (failed.length === results.length) {
  console.error('Kein Rechtsakt konnte geprüft werden (Endpunkt nicht erreichbar?).');
  process.exit(1);
}
if (!found) {
  console.log('Nichts Neues: kein Issue.');
  process.exit(0);
}
if (DRY) {
  console.log('\n--- Trockenlauf: dieses Issue würde eröffnet bzw. aktualisiert ---\n');
  console.log(`Titel: ${issue.title}\n`);
  console.log(issue.body);
  process.exit(0);
}

// ------------------------------------------------------------ GitHub (gh CLI)
const gh = (a, input) => execFileSync('gh', [...a, ...(repo ? ['--repo', repo] : [])], { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'inherit'] });
const dir = mkdtempSync(join(tmpdir(), 'sgk-fassungen-'));
const bodyFile = join(dir, 'body.md');
writeFileSync(bodyFile, issue.body);
try {
  const open = JSON.parse(gh(['issue', 'list', '--state', 'open', '--limit', '200', '--json', 'number,title,body']));
  const mine = open.find((x) => (x.body || '').includes(`<!-- ${MARKER} `));
  if (!mine) {
    const url = gh(['issue', 'create', '--title', issue.title, '--body-file', bodyFile]).trim();
    console.log('Issue eröffnet: ' + url);
  } else {
    const before = keysOfBody(mine.body) || [];
    gh(['issue', 'edit', String(mine.number), '--title', issue.title, '--body-file', bodyFile]);
    const added = issue.keys.filter((k) => !before.includes(k));
    if (added.length) {
      const cFile = join(dir, 'comment.md');
      writeFileSync(cFile, `Neu seit der letzten Prüfung: ${added.map((k) => '`' + k.replace(':', ' ') + '`').join(', ')}. Die Tabelle oben ist aktualisiert.`);
      gh(['issue', 'comment', String(mine.number), '--body-file', cFile]);
    }
    console.log(`Issue #${mine.number} aktualisiert${added.length ? ` (${added.length} neu, Kommentar geschrieben)` : ' (keine neuen Einträge)'}.`);
  }
} catch (e) {
  console.error('GitHub-Aufruf fehlgeschlagen: ' + (e.message || e));
  process.exit(1);
}
