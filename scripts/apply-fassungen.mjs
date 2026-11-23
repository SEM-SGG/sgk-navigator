// Baut neue konsolidierte Fassungen in die Daten ein (Workflow «Fassungen», MAINTAINING.md, «Neue Fassung einbauen»):
//   1. Rohdaten von EUR-Lex bzw. Cellar laden (scripts/fetch-raw-sgk.mjs; die weiteren Rechtsakte lädt build-work.mjs selbst)
//   2. Prüfberichte des bisherigen Stands erzeugen (Vergleichswerte; dafür den bisherigen SGK-Stand neu bauen)
//   3. SGK: neue Fassung als weiteren Stand in data/sgk-fassungen.json eintragen (Akt aus der Liste der Änderungsakte)
//   4. Daten bauen: scripts/build-data.mjs (SGK), scripts/build-work.mjs all (EES, ETIAS, VIS, IO)
//   5. Prüfberichte erzeugen: scripts/validate.mjs, scripts/validate-works.mjs
//   6. Version (Datum) und CHANGELOG.md, Version in der Produktdokumentation
//   7. Zusammenfassung nach <out>/einbau.json für scripts/fassungen-pr.mjs
// Fachangaben (Anwendbarkeit, Eintrag in data/acts.json) erfindet das Skript nicht: Fehlen sie, steht das in einbau.json
// unter «fachangaben», und der Pull Request nennt, was die Fachperson liefern muss.
// Aufruf im Wurzelverzeichnis:
//   node scripts/apply-fassungen.mjs --befund befund.json [--out <ordner>] [--today JJJJ-MM-TT]
//   node scripts/apply-fassungen.mjs --rebuild [--out <ordner>]   alles neu laden und bauen, auch ohne Befund (Probelauf)
// Exit-Code: 0 eingebaut oder kein Befund (Urteil in einbau.json), 1 Einbau gescheitert, 2 Rohdaten nicht geladen.
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { changelogEntries, changelogSection, insertChangelog, latestVersion, nextVersion, fmtDateDe, todayZurich } from './release/changelog.mjs';
import { DOC_FILE, setDocVersion } from './release/dokumentation.mjs';
import { compareVersions, parseVersion } from '../src/app/lib/updatecheck.js';
import { sgkActOf, sgkNote, nextStageId, stageChanges, changedOldStages, judgeValidation, changelogLines, commitSubject, LANGS } from './fassungen/einbau-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = (f) => join(ROOT, f);
const read = (f) => readFileSync(P(f), 'utf8');
const readJson = (f) => (existsSync(P(f)) ? JSON.parse(read(f)) : null);
const FASSUNGEN = 'data/sgk-fassungen.json';

function run(cmd, args) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: process.env });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} endete mit Code ${r.status ?? r.signal}`);
}
const rawFile = (celex, lang) => P(`raw/${celex}_${lang.toUpperCase()}.html`);

/** Datensätze aller Werke: { id: { abbr, file, ds } } */
function datasets() {
  const out = {};
  for (const w of readJson('data/works/index.json')) {
    const file = w.id === 'sgk' ? 'data/dataset.json' : `data/works/${w.dataset}`;
    out[w.id] = { abbr: w.abbr.de, file, ds: readJson(file) };
  }
  return out;
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (['--befund', '--out', '--today'].includes(a)) o[a.slice(2)] = argv[++i];
    else if (a === '--rebuild') o.rebuild = true;
    else throw new Error(`Unbekannte Option ${a}`);
  }
  return o;
}

export async function main(argv = process.argv.slice(2)) {
  const opt = parseArgs(argv);
  const out = opt.out || mkdtempSync(join(tmpdir(), 'sgk-einbau-'));
  mkdirSync(out, { recursive: true });
  const befund = opt.befund ? JSON.parse(readFileSync(opt.befund, 'utf8')) : { cons: [], info: [], fingerprint: 'probelauf', issue: null };
  const today = opt.today || befund.today || todayZurich();
  const before = { changelog: read('CHANGELOG.md'), doc: read(DOC_FILE), works: readJson('scripts/out/works/validation-works.json'), data: datasets(), sgk: null };
  const e = {
    today, versionBefore: latestVersion(before.changelog), version: null, cons: befund.cons || [], issue: befund.issue || null,
    issueHasInfo: !!befund.issueHasInfo, fingerprint: befund.fingerprint, rebuild: !!opt.rebuild, subject: null, changelog: null,
    works: [], fachangaben: [], foreign: null, validation: null, step: null, error: null, durations: {},
    started: new Date().toISOString(), fetched: null,
  };
  const save = () => writeFileSync(join(out, 'einbau.json'), JSON.stringify(e, null, 1));
  const step = async (name, fn) => { e.step = name; const t0 = Date.now(); try { return await fn(); } finally { e.durations[name] = Date.now() - t0; } };
  console.log(`Ergebnis nach ${join(out, 'einbau.json')}`);
  if (!e.cons.length && !e.rebuild) { e.nothing = true; save(); console.log('Kein Befund: nichts einzubauen.'); return 0; }
  const sgkNew = e.cons.filter((x) => x.work === 'sgk').sort((a, b) => a.date.localeCompare(b.date));

  // 1 Rohdaten (SGK; die weiteren Rechtsakte lädt build-work.mjs im Schritt «Daten bauen» selbst)
  try {
    await step('Rohdaten laden', () => {
      run('node', ['scripts/fetch-raw-sgk.mjs', ...(sgkNew.length ? ['--also', sgkNew.map((x) => x.celex).join(',')] : [])]);
      const need = [...JSON.parse(read(FASSUNGEN)).stages.map((s) => s.celex), ...sgkNew.map((x) => x.celex), '32016R0399', '02016R0399-20240710'];
      const missing = need.flatMap((c) => LANGS.filter((l) => !existsSync(rawFile(c, l))).map((l) => `${c} ${l.toUpperCase()}`));
      if (missing.length) throw new Error(`Dateien nicht ladbar: ${missing.join(', ')}`);
    });
  } catch (err) {
    e.error = String(err.message || err); save();
    console.error(`\nRohdaten nicht geladen: ${e.error}`);
    return 2;
  }

  try {
    // 2 Vergleichswerte
    // validate.mjs liest das Protokoll des Baus (scripts/out/build-log.json); der Neubau des bisherigen Stands ergibt
    // dieselben Daten.
    await step('Prüfberichte vorher', () => {
      run('node', ['scripts/build-data.mjs']);
      run('node', ['scripts/validate.mjs']);
      before.sgk = readJson('scripts/out/validation-results.json');
    });
    // 3 SGK: Stand eintragen
    if (sgkNew.length) {
      await step('SGK-Fassung eintragen', async () => {
        const { modifierRows } = await import('./lib-works.mjs');
        const f = JSON.parse(read(FASSUNGEN));
        const acts = readJson('data/acts.json');
        const rowsOf = (celex) => Object.fromEntries(LANGS.map((l) => [l, modifierRows(readFileSync(rawFile(celex, l), 'utf8'))]));
        for (const c of sgkNew) {
          if (f.stages.some((s) => s.celex === c.celex)) continue;
          const prev = (f.stages.at(-1) || { celex: '02016R0399-20240710' }).celex; // ohne Eintrag: Fassung von s07
          const a = sgkActOf(rowsOf(c.celex), rowsOf(prev));
          const id = nextStageId(['s07', ...f.stages.map((s) => s.id)]);
          if (!a.act) throw new Error(`${c.celex}: Die Liste der Änderungsakte nennt gegenüber ${prev} keinen neuen Akt; der Akt des Stands ${id} ist nicht bestimmbar.`);
          f.stages.push({ id, celex: c.celex, date: c.date, act: a.act, note: sgkNote(c.date, !a.etiasConsolidated) });
          console.log(`SGK: ${c.celex} als Stand ${id}, Akt ${a.act} (neu in der Liste der Änderungsakte: ${a.newActs.join(', ')})`);
          if (!acts.some((x) => x.celex === a.act)) {
            e.fachangaben.push({
              kind: 'acts', act: a.act, stage: id,
              title: `Eintrag für den Akt ${a.act} in data/acts.json`,
              text: `Die Fassung des SGK vom ${fmtDateDe(c.date)} bildet den Stand ${id}. Als Akt dieses Stands hat der Workflow \`${a.act}\` bestimmt, den jüngsten neuen Eintrag in der Liste der Änderungsakte von EUR-Lex (neu gegenüber der vorigen Fassung: ${a.newActs.map((x) => '`' + x + '`').join(', ')}). \`data/acts.json\` kennt diesen Akt noch nicht. Den Eintrag ergänzt ein Agent. Titel, Nummer, Amtsblatt und Daten übernimmt er von EUR-Lex. Zwei Angaben kann nur eine Fachperson machen: die **Anwendbarkeit** (ab wann die Änderungen gelten, mit Fundstelle im Akt, und ob einzelne Bestimmungen ein anderes Datum haben) und die **Kurzbezeichnung** in Deutsch, Französisch und Englisch (ein bis drei Wörter, zum Beispiel «Überprüfung», «filtrage», «screening»). Prüfe ausserdem, ob \`${a.act}\` der richtige Akt für diesen Stand ist.`,
              task: `Erfasse den Akt ${a.act} in data/acts.json im Repository SEM-SGG/sgk-navigator. Die Anwendbarkeit lautet: … (ab wann, Fundstelle; abweichende Daten einzelner Bestimmungen). Die Kurzbezeichnung lautet: … (DE), … (FR), … (EN). Halte dich an AGENTS.md, Ablauf «Akt erfassen».`,
            });
          }
          if (a.newActs.length > 1) e.fachangaben.push({ kind: 'check', title: `Mehrere neue Akte im Stand ${id}`, text: `Die Fassung vom ${fmtDateDe(c.date)} führt mehrere neue Einträge in der Liste der Änderungsakte: ${a.newActs.map((x) => '`' + x + '`').join(', ')}. Der Navigator ordnet den Stand dem jüngsten zu (\`${a.act}\`). Bestimmungen, die ein älterer dieser Akte geändert hat, zeigt er mit der Herkunft aus den Markern von EUR-Lex. Prüfe unter «Was sich ändert», ob das zutrifft. Ist ein eigener Stand je Akt nötig, gib einem Agenten den Auftrag «Baue die neue Fassung des SGK vom ${fmtDateDe(c.date)} ein» (AGENTS.md).` });
        }
        writeFileSync(P(FASSUNGEN), JSON.stringify(f, null, 1) + '\n');
      });
    }
    // 4 Daten
    await step('Daten bauen', () => {
      run('node', ['scripts/build-data.mjs']);
      run('node', ['scripts/build-work.mjs', 'all']);
      run('node', ['scripts/forms/extract-images.mjs']);
      // Herkunft der in diesem Lauf geladenen Dateien (scripts/lib-fetch.mjs: EUR-Lex, sonst Cellar)
      const log = readJson('scripts/out/fetch-log.json') || [];
      e.fetched = {};
      for (const x of log.filter((x) => x.at >= e.started)) { const k = x.src || 'nicht ladbar'; e.fetched[k] = (e.fetched[k] || 0) + 1; }
      console.log(`Abruf in diesem Lauf: ${Object.entries(e.fetched).map(([k, n]) => `${k} ${n}`).join(', ') || 'keine Datei (alle schon vorhanden)'}`);
    });
    // 5 Prüfberichte
    await step('Prüfberichte erzeugen', () => {
      run('node', ['scripts/validate.mjs']);
      run('node', ['scripts/validate-works.mjs']);
    });
    // 6 Version
    await step('Version', () => {
      // Version = Datum des Einbaus; besteht sie schon oder ist sie nicht neuer als die bisherige, folgt -2, -3 …
      const taken = changelogEntries(before.changelog).map((x) => x.version);
      let v = nextVersion(today, taken);
      if (e.versionBefore && compareVersions(v, e.versionBefore) <= 0) v = nextVersion(parseVersion(e.versionBefore).date, taken);
      e.version = v;
    });
    // 7 Zusammenfassung, Changelog und Version in der Produktdokumentation
    await step('Zusammenfassung', () => {
      const after = datasets();
      const fass = JSON.parse(read(FASSUNGEN)).stages;
      e.foreign = [];
      for (const [id, a] of Object.entries(after)) {
        const b = before.data[id];
        const oldIds = new Set((b ? b.ds.stages : []).map((s) => s.id));
        const expected = e.cons.filter((x) => x.work === id).map((x) => x.celex);
        const newStages = a.ds.stages.filter((s) => !oldIds.has(s.id)).map((s) => ({
          stage: s.id, celex: s.source && s.source.celex, date: s.date, act: s.act, note: s.source && s.source.note, langs: stageChanges(a.ds, s.id),
          missing: false,
        }));
        for (const c of expected) if (!newStages.some((s) => s.celex === c)) newStages.push({ stage: (fass.find((f) => f.celex === c) || {}).id || '–', celex: c, date: e.cons.find((x) => x.celex === c).date, langs: {}, missing: true });
        if (b) for (const f of changedOldStages(b.ds, a.ds)) e.foreign.push({ abbr: a.abbr, ...f });
        if (newStages.length || expected.length) e.works.push({ id, abbr: a.abbr, expected, newStages });
      }
      e.validation = judgeValidation({ sgk: before.sgk, works: before.works }, { sgk: readJson('scripts/out/validation-results.json'), works: readJson('scripts/out/works/validation-works.json') });
      const lines = changelogLines(e.works);
      const md = insertChangelog(before.changelog, e.version, fmtDateDe(today), lines.length ? lines : ['Daten neu gebaut, ohne neue Fassung (Probelauf).']);
      writeFileSync(P('CHANGELOG.md'), md);
      writeFileSync(P(DOC_FILE), setDocVersion(before.doc, e.version));
      e.changelog = changelogSection(md, e.version).de;
      e.subject = commitSubject(e.version, e.works.filter((w) => w.newStages.some((s) => !s.missing)));
    });
    e.step = null;
  } catch (err) {
    e.error = String(err.message || err); save();
    console.error(`\nEinbau gescheitert im Schritt «${e.step}»: ${e.error}`);
    return 1;
  }
  save();
  console.log(`\nEingebaut: ${e.subject}. Prüfungen ${e.validation.passed ? 'bestanden' : 'NICHT bestanden'}; geänderte bisherige Stände: ${e.foreign.length}; Fachangaben offen: ${e.fachangaben.length}.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code), (err) => { console.error(err.stack || err.message); process.exit(1); });
}
