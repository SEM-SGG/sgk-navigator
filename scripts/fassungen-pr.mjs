// Pull Request zum Einbau neuer Fassungen (Workflow «Fassungen»). Drei Schritte:
//   node scripts/fassungen-pr.mjs plan --befund befund.json
//       entscheidet, ob ein Einbau nötig ist: nein ohne neue konsolidierte Fassung oder wenn ein offener Pull Request des
//       Workflows denselben Fingerabdruck trägt (auch ein Entwurf, der auf Fachangaben wartet). Schreibt einbau=true|false
//       und befund nach $GITHUB_OUTPUT. Im Probelauf (PROBELAUF=true) mit REBUILD=true baut er auch ohne Befund.
//   node scripts/fassungen-pr.mjs tests --out <ordner>
//       führt die Tests aus und schreibt <ordner>/tests.json. Endet mit Fehler, wenn ein Test fehlschlägt.
//   node scripts/fassungen-pr.mjs publish --einbau <ordner>
//       liest einbau.json (scripts/apply-fassungen.mjs) und tests.json, schreibt <ordner>/pr.md, committet auf den Zweig
//       fassungen/einbau, pusht und eröffnet oder aktualisiert den Pull Request. Entwurf, wenn Einbau, Prüfung oder Test
//       scheiterten (dann endet der Schritt mit Fehler) oder Fachangaben fehlen. Im Probelauf nur pr.md und die
//       Zusammenfassung des Laufs: kein Push, kein Pull Request.
// Umgebung: GH_TOKEN, GH_REPO für gh; BASE Zielzweig (Vorgabe main); PROBELAUF=true für einen Probelauf ohne Wirkung.
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { planPr, prText, testCounts, BRANCH } from './fassungen/einbau-lib.mjs';

export const BOT = { name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com' };
/** Dateien, die der Einbau ändert. Nur sie gehen in den Commit. */
export const COMMIT_FILES = ['data/dataset.json', 'data/assets.json', 'data/sgk-fassungen.json', 'data/works', 'data/VALIDATION.md', 'data/VALIDATION_WORKS.md', 'scripts/out/works', 'CHANGELOG.md', 'docs/sgk-navigator-dokumentation.html'];

export const TESTS = [
  { id: 'release-info', label: 'Version und Changelog', cmd: 'node', args: ['scripts/release-info.mjs'] },
  { id: 'dokumentation', label: 'Version in der Produktdokumentation', cmd: 'node', args: ['scripts/check-dokumentation.mjs'] },
  { id: 'core', label: 'Kern mit Rohdaten (test:core)', cmd: 'npm', args: ['run', 'test:core'] },
  { id: 'unit', label: 'Anwendung, Einheitstests (test:app:unit)', cmd: 'npm', args: ['run', 'test:app:unit'] },
  { id: 'neg', label: 'Modul Verhandlung (test:neg)', cmd: 'npm', args: ['run', 'test:neg'] },
  { id: 'build', label: 'Navigator und Download-Seite bauen', cmd: 'bash', args: ['-c', 'v="$(node scripts/release-info.mjs --version)" && node build.mjs --version "$v" --out dist/SGK-Navigator.html && node scripts/build-site.mjs --version "$v" --file dist/SGK-Navigator.html --out dist/site'] },
  { id: 'browser', label: 'Oberflächentests (test:app:ci)', cmd: 'npm', args: ['run', 'test:app:ci'], env: { OFFLINE: '1', SGK_CHROME: 'bundled' } },
];

function sh(cmd, args, { input, allowFail = false, env: extra } = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024, env: extra ? { ...process.env, ...extra } : process.env });
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  if (r.status !== 0 && !allowFail) throw new Error(`${cmd} ${args.slice(0, 2).join(' ')}: ${(r.stderr || r.stdout || '').trim()}`);
  return r;
}
const gh = (args, o) => sh('gh', args, o).stdout;
const git = (args, o) => sh('git', args, o).stdout;
function output(pairs) {
  const f = process.env.GITHUB_OUTPUT;
  if (f) appendFileSync(f, Object.entries(pairs).map(([k, v]) => { const d = `EOF_${k}_${Date.now()}`; return `${k}<<${d}\n${v}\n${d}\n`; }).join(''));
}
const summary = (line) => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n'); };
const env = () => ({ base: process.env.BASE || 'main', probelauf: process.env.PROBELAUF === 'true', rebuild: process.env.REBUILD === 'true' });
const repoUrl = () => (process.env.GITHUB_REPOSITORY ? `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY}` : undefined);

/** Offener Pull Request des Workflows auf dem Einbau-Zweig (nicht aus einem Fork), sonst null. */
export const ownPr = (list) => (list || []).find((p) => !p.isCrossRepository) || null;
export function openPr(base) {
  return ownPr(JSON.parse(gh(['pr', 'list', '--head', BRANCH, '--base', base, '--state', 'open', '--json', 'number,body,isDraft,url,title,isCrossRepository']) || '[]'));
}

export function plan({ befundFile }) {
  const { base, probelauf, rebuild } = env();
  const befund = JSON.parse(readFileSync(befundFile, 'utf8'));
  let einbau = false, why;
  if (!befund.hasFindings) {
    einbau = probelauf && rebuild;
    why = einbau ? 'Probelauf ohne Befund: alles neu laden und bauen, ohne Pull Request.' : 'Keine neue konsolidierte Fassung: kein Einbau.';
  } else if (probelauf) {
    einbau = true; why = `Probelauf: Einbau ohne Pull Request (Fingerabdruck ${befund.fingerprint}).`;
  } else {
    const pr = openPr(base);
    const action = planPr(pr, befund.fingerprint);
    einbau = action !== 'skip';
    why = action === 'skip' ? `Pull Request #${pr.number} enthält diesen Befund schon (Fingerabdruck ${befund.fingerprint}). Kein neuer Einbau.`
      : action === 'update' ? `Pull Request #${pr.number} wird neu gebaut (Fingerabdruck ${befund.fingerprint}).`
      : `Neuer Einbau auf ${BRANCH} (Fingerabdruck ${befund.fingerprint}).`;
  }
  console.log(why);
  summary(why);
  output({ einbau: String(einbau), befund: JSON.stringify(befund) });
  return einbau;
}

export function tests({ out }) {
  mkdirSync(out, { recursive: true });
  const results = [];
  for (const t of TESTS) {
    console.log(`\n$ ${t.cmd} ${t.args.join(' ')}`);
    const t0 = Date.now();
    const r = spawnSync(t.cmd, t.args, { encoding: 'utf8', env: { ...process.env, ...(t.env || {}) }, maxBuffer: 256 * 1024 * 1024 });
    const text = (r.stdout || '') + (r.stderr || '');
    process.stdout.write(text);
    const ok = r.status === 0;
    results.push({ id: t.id, label: t.label, ok, status: r.status, ms: Date.now() - t0, counts: testCounts(text), tail: ok ? null : text.trim().split('\n').slice(-40).join('\n').slice(-4000) });
  }
  writeFileSync(join(out, 'tests.json'), JSON.stringify({ results }, null, 1));
  const bad = results.filter((r) => !r.ok);
  console.log(`\nTests: ${results.length - bad.length} von ${results.length} bestanden${bad.length ? '; fehlgeschlagen: ' + bad.map((r) => r.label).join(', ') : ''}.`);
  return bad.length ? 1 : 0;
}

export function publish({ einbau }) {
  const { base, probelauf } = env();
  const file = join(einbau, 'einbau.json');
  if (!existsSync(file)) { console.error(`${file} fehlt: Das Einbau-Skript hat kein Ergebnis geschrieben. Kein Pull Request; das Issue bleibt.`); return 1; }
  const e = JSON.parse(readFileSync(file, 'utf8'));
  if (e.nothing) { console.log('Kein Befund: kein Pull Request.'); return 0; }
  if (e.error && e.step === 'Rohdaten laden') {
    const msg = `Rohdaten von EUR-Lex und Cellar nicht geladen: ${e.error}. Kein Pull Request; das Issue bleibt.`;
    console.error(msg); summary(msg); return 1;
  }
  const t = existsSync(join(einbau, 'tests.json')) ? JSON.parse(readFileSync(join(einbau, 'tests.json'), 'utf8')) : null;
  const { title, body, failed, reasons, status } = prText(e, t, { probelauf, repoUrl: repoUrl() });
  const draft = status !== 'ok';
  writeFileSync(join(einbau, 'pr.md'), `# ${title}\n\n${body}`);
  if (probelauf) {
    console.log(`Probelauf: kein Push, kein Pull Request. Text des Pull Requests in ${join(einbau, 'pr.md')}.\n\n# ${title}\n\n${body}`);
    summary(`## Probelauf: ${title}\n\nKein Push, kein Pull Request. Den vollen Text enthält das Artefakt «einbau» (\`pr.md\`).${failed ? `\n\nDer Pull Request wäre ein Entwurf:\n\n- ${reasons.join('\n- ')}` : status === 'fachangaben' ? '\n\nDer Pull Request wäre ein Entwurf: Fachangaben fehlen.' : ''}`);
    return failed ? 1 : 0;
  }
  const dir = mkdtempSync(join(tmpdir(), 'sgk-pr-'));
  const bodyFile = join(dir, 'body.md');
  writeFileSync(bodyFile, body);
  git(['switch', '-C', BRANCH]);
  git(['add', '--', ...COMMIT_FILES.filter((f) => existsSync(f))]);
  const msg = `${e.subject || title}\n\nEingebaut vom Workflow «Fassungen» (Fingerabdruck ${e.fingerprint}).${failed ? '\nEinbau unvollständig: ' + reasons.join(' ') : ''}`;
  const id = { GIT_AUTHOR_NAME: BOT.name, GIT_AUTHOR_EMAIL: BOT.email, GIT_COMMITTER_NAME: BOT.name, GIT_COMMITTER_EMAIL: BOT.email };
  git(['commit', '--allow-empty', '--quiet', '--no-verify', '-F', '-'], { input: msg, env: id });
  // Der Zweig gehört dem Workflow; er überschreibt ihn bei jedem neuen Einbau. Weist GitHub das ab, löscht der Lauf den
  // Zweig und legt ihn neu an (ein offener Pull Request schliesst sich dabei; unten entsteht ein neuer).
  const push = () => sh('git', ['push', '--force', '--quiet', 'origin', `HEAD:refs/heads/${BRANCH}`], { allowFail: true });
  let pushed = push();
  if (pushed.status !== 0) {
    console.error(`Push auf ${BRANCH} abgewiesen: ${(pushed.stderr || '').trim()}\nZweiter Versuch mit neu angelegtem Zweig.`);
    sh('git', ['push', '--quiet', 'origin', '--delete', BRANCH], { allowFail: true });
    pushed = push();
    if (pushed.status !== 0) throw new Error(`git push: ${(pushed.stderr || pushed.stdout || '').trim()}`);
  }
  const pr = openPr(base);
  let url;
  if (pr) {
    gh(['pr', 'edit', String(pr.number), '--title', title, '--body-file', bodyFile]);
    if (draft && !pr.isDraft) gh(['pr', 'ready', String(pr.number), '--undo']);
    if (!draft && pr.isDraft) gh(['pr', 'ready', String(pr.number)]);
    url = pr.url;
    console.log(`Pull Request #${pr.number} aktualisiert${draft ? ' (Entwurf)' : ''}: ${url}`);
  } else {
    url = gh(['pr', 'create', '--base', base, '--head', BRANCH, '--title', title, '--body-file', bodyFile, ...(draft ? ['--draft'] : [])]).trim();
    console.log(`Pull Request eröffnet${draft ? ' (Entwurf)' : ''}: ${url}`);
  }
  summary(`${draft ? 'Entwurf' : 'Pull Request'}: ${url}`);
  if (failed) { console.error(`\nEinbau unvollständig:\n- ${reasons.join('\n- ')}`); return 1; }
  return 0;
}

function args(argv) {
  const o = { cmd: argv[0] };
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--befund') o.befundFile = argv[++i];
    else if (argv[i] === '--out') o.out = argv[++i];
    else if (argv[i] === '--einbau') o.einbau = argv[++i];
    else throw new Error(`Unbekannte Option ${argv[i]}`);
  }
  return o;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const o = args(process.argv.slice(2));
    if (o.cmd === 'plan' && o.befundFile) plan(o);
    else if (o.cmd === 'tests' && o.out) process.exit(tests(o));
    else if (o.cmd === 'publish' && o.einbau) process.exit(publish(o));
    else { console.error('Aufruf: node scripts/fassungen-pr.mjs plan --befund <datei> | tests --out <ordner> | publish --einbau <ordner>'); process.exit(2); }
  } catch (err) { console.error(err.message); process.exit(1); }
}
