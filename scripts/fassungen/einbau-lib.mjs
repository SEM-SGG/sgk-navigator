// Reine Funktionen für den Einbau neuer Fassungen (scripts/apply-fassungen.mjs) und den Pull Request dazu
// (scripts/fassungen-pr.mjs). Ohne Netz und ohne Dateizugriff, Einheitstests in test/app/fassungen.test.mjs.
import { fmtDateDe } from '../release/changelog.mjs';

export const LANGS = ['de', 'fr', 'en'];
export const LANG_NAMES = { de: 'Deutsch', fr: 'Französisch', en: 'Englisch' };
export const FP_MARK = 'sgk-fassungen-fingerabdruck';
export const STATUS_MARK = 'sgk-fassungen-status';
export const MAX_BODY = 60000;
const ETIAS = '32018R1240';

export const fingerprintOf = (body) => { const m = new RegExp(`<!-- ${FP_MARK}: ([0-9a-f]+) -->`).exec(body || ''); return m ? m[1] : null; };
export const prStatusOf = (body) => { const m = new RegExp(`<!-- ${STATUS_MARK}: (\\w+) -->`).exec(body || ''); return m ? m[1] : null; };

/**
 * Was mit einem offenen Pull Request des Workflows geschieht: 'create' (keiner offen), 'skip' (gleicher Befund und kein
 * Fehler: unverändert lassen, auch einen Entwurf, der auf Fachangaben wartet), 'update' (neu bauen).
 */
export function planPr(existing, fp) {
  if (!existing) return 'create';
  if (fingerprintOf(existing.body) === fp && prStatusOf(existing.body) !== 'fehler') return 'skip';
  return 'update';
}
export const BRANCH = 'fassungen/einbau';

/** Nächster Stand nach dem letzten: s08 -> s09 */
export const nextStageId = (ids) => 's' + String(Math.max(-1, ...ids.map((x) => Number(String(x).slice(1)) || 0)) + 1).padStart(2, '0');

/**
 * Akt, mit dem eine neue konsolidierte Fassung des SGK ihren Stand bildet: die Einträge der Liste der Änderungsakte («▼M…»,
 * «►C…») der neuen Fassung, die in der vorigen Fassung fehlen, vereinigt über die Sprachen; massgebend ist der letzte
 * (jüngste). rows: { de: modifierRows(neu), … }, prevRows: dasselbe für die vorige Fassung.
 * Ergebnis { act, newActs, etiasConsolidated } (act null, wenn kein neuer Eintrag).
 */
export function sgkActOf(rows, prevRows) {
  const prev = new Set(Object.values(prevRows).flat().map((r) => r.celex));
  const order = [];
  for (const l of LANGS) for (const r of rows[l] || []) if (!prev.has(r.celex) && !order.includes(r.celex)) order.push(r.celex);
  const all = new Set(Object.values(rows).flat().map((r) => r.celex));
  return { act: order.at(-1) || null, newActs: order, etiasConsolidated: all.has(ETIAS) };
}

/** Herkunftsangabe eines neuen SGK-Stands in drei Sprachen. etias: Art. 80 ETIAS-VO ergänzt (nicht von EUR-Lex konsolidiert). */
export function sgkNote(iso, etias) {
  const [y, m, d] = iso.split('-');
  const dmy = `${+d}.${+m}.${y}`;
  return etias ? {
    de: `Konsolidierte Fassung vom ${dmy} von EUR-Lex; ergänzt um Art. 80 der Verordnung (EU) 2018/1240.`,
    fr: `Version consolidée du ${dmy} (EUR-Lex); complétée par l’article 80 du règlement (UE) 2018/1240.`,
    en: `Consolidated version of ${dmy} (EUR-Lex); supplemented by Article 80 of Regulation (EU) 2018/1240.`,
  } : {
    de: `Konsolidierte Fassung vom ${dmy}, von EUR-Lex.`,
    fr: `Version consolidée du ${dmy}, depuis EUR-Lex.`,
    en: `Consolidated version of ${dmy}, from EUR-Lex.`,
  };
}

/** Bestimmungen mit einer Version im Stand stageId, je Sprache: { de: ['Artikel 8', …], … } */
export function stageChanges(ds, stageId) {
  const out = {};
  for (const l of ds.langs || LANGS) {
    out[l] = [];
    for (const t of ds.toc || []) {
      const u = ds.units[t.id];
      const v = u && (u.versions[l] || []).find((x) => x.stage === stageId);
      if (v) out[l].push(v.repealed ? `${v.label || t.id} (aufgehoben)` : (v.label || t.id));
    }
  }
  return out;
}

/** Stände, die vorher schon bestanden und sich inhaltlich geändert haben: [{ stage, lang, units: [...] }] */
export function changedOldStages(before, after) {
  const res = [];
  const ids = new Set((before.stages || []).map((s) => s.id));
  for (const l of after.langs || LANGS) {
    const per = new Map();
    for (const [uid, u] of Object.entries(after.units)) {
      const bu = before.units[uid];
      for (const v of u.versions[l] || []) {
        if (!ids.has(v.stage)) continue;
        const bv = bu && (bu.versions[l] || []).find((x) => x.stage === v.stage);
        if (!bv || JSON.stringify(bv) !== JSON.stringify(v)) (per.get(v.stage) || per.set(v.stage, []).get(v.stage)).push(v.label || uid);
      }
      for (const bv of (bu && bu.versions[l]) || []) {
        if (!(u.versions[l] || []).some((x) => x.stage === bv.stage)) (per.get(bv.stage) || per.set(bv.stage, []).get(bv.stage)).push(`${bv.label || uid} (entfallen)`);
      }
    }
    for (const [stage, units] of per) res.push({ stage, lang: l, units });
  }
  return res;
}

const pct = (x) => `${(100 * x).toFixed(2).replace('.', ',')} %`;
const sum = (a, f) => a.reduce((n, x) => n + f(x), 0);
const minCov = (a) => (a.length ? Math.min(...a.map((x) => x.coverage)) : 1);

/**
 * Urteil über die Prüfberichte. before/after: { sgk: Ergebnis von validate.mjs (scripts/out/validation-results.json),
 * works: Ergebnis von validate-works.mjs (scripts/out/works/validation-works.json) }. Zeilen { label, before, after, verdict }
 * mit verdict 'ok' (bestanden), 'hinweis' (gestiegen, begründen) oder 'fehler' (nicht bestanden).
 */
export function judgeValidation(before, after) {
  const rows = [];
  const add = (label, b, a, verdict, text = null) => rows.push({ label, before: b, after: a, verdict, text });
  const S = after.sgk, SB = before.sgk;
  if (S) {
    // Datensatz gegen Quelle: Stände mit ETIAS-Ergänzung gegen Quelle plus Ergänzung (coverageDsPatched), die übrigen direkt
    const dsCov = (R) => { const p = new Set((R.coverageDsPatched || []).map((x) => x.stage)); return minCov([...(R.coverageDs || []).filter((x) => !p.has(x.stage)), ...(R.coverageDsPatched || [])]); };
    const c = minCov(S.coverage), cd = dsCov(S);
    add('SGK: Wortlaut vollständig (Parser gegen EUR-Lex)', SB ? pct(minCov(SB.coverage)) : '–', pct(c), c === 1 ? 'ok' : 'fehler');
    add('SGK: Datensatz gleich Quelle (mit ETIAS-Ergänzung)', SB ? pct(dsCov(SB)) : '–', pct(cd), cd === 1 ? 'ok' : 'fehler');
    const bad = sum(S.actText || [], (x) => x.bad.length);
    add('SGK: Wortlaut der Änderungsakte, Abweichungen', SB ? sum(SB.actText || [], (x) => x.bad.length) : '–', bad, bad === 0 ? 'ok' : 'fehler');
    add('SGK: Schlüssel in DE, FR, EN verschieden', SB ? (SB.lang || []).length : '–', (S.lang || []).length, (S.lang || []).length === 0 ? 'ok' : 'fehler');
    if ((S.reverseSkipped || []).length) add('SGK: Umkehrprüfung (Wortlaut des Akts im Stand)', '–', `nicht eingerichtet für ${S.reverseSkipped.join(', ')}`, 'hinweis', 'die ändernden Bestimmungen des Akts sind in scripts/validate.mjs (AMEND) nachzutragen; Auftrag an einen Agenten');
    const ud = (R) => (R.stageDiff || []).filter((x) => !x.expected && !x.explained).length;
    const u = ud(S), ub = SB ? ud(SB) : null;
    add('SGK: Änderungen zwischen Ständen ohne Erklärung', ub ?? '–', u, ub !== null && u > ub ? 'hinweis' : 'ok', ub !== null && u > ub ? 'gestiegen; data/VALIDATION.md, Abschnitt Standdifferenzen, nennt jeden Fall' : null);
  }
  const W = after.works && after.works.works, WB = before.works && before.works.works;
  for (const [id, w] of Object.entries(W || {})) {
    const b = WB && WB[id];
    const c = Math.min(minCov(w.coverage || []), minCov(w.coverageDs || []));
    add(`${id.toUpperCase()}: Wortlaut vollständig (Quelle und Datensatz)`, b ? pct(Math.min(minCov(b.coverage || []), minCov(b.coverageDs || []))) : '–', pct(c), c === 1 ? 'ok' : 'fehler');
    const ue = (x) => (x && x.changes ? x.changes.unexplainedWithoutDefect : 0);
    add(`${id.toUpperCase()}: Änderungen ohne Zuordnung zu einem Akt`, b ? ue(b) : '–', ue(w), ue(w) === 0 ? 'ok' : 'fehler');
    const ld = (x) => (x && x.lang ? x.lang.length : 0);
    add(`${id.toUpperCase()}: Schlüssel in DE, FR, EN verschieden`, b ? ld(b) : '–', ld(w), b && ld(w) > ld(b) ? 'hinweis' : 'ok', b && ld(w) > ld(b) ? 'gestiegen; data/VALIDATION_WORKS.md nennt jeden Fall' : null);
  }
  if (after.works && after.works.budget) add('Grösse der weiteren Werke (gzip, Budget 2,5 MB)', before.works && before.works.budget ? `${(before.works.budget.gzTotal / 1e6).toFixed(2)} MB` : '–', `${(after.works.budget.gzTotal / 1e6).toFixed(2)} MB`, after.works.budget.ok ? 'ok' : 'fehler');
  return { rows, passed: rows.every((r) => r.verdict !== 'fehler') };
}

/** Zeilen für CHANGELOG.md (ohne «- »). */
export function changelogLines(works) {
  const out = [];
  for (const w of works) for (const s of w.newStages) {
    const n = LANGS.reduce((m, l) => Math.max(m, (s.langs[l] || []).length), 0);
    out.push(`${w.abbr}: konsolidierte Fassung vom ${fmtDateDe(s.date)} (\`${s.celex}\`) als Stand ${s.stage} eingebaut${n ? `; ${n === 1 ? 'eine Bestimmung' : `${n} Bestimmungen`} geändert` : ''}.`);
  }
  return out;
}

/** Betreff von Commit und Pull Request. */
export function commitSubject(version, works) {
  const parts = works.flatMap((w) => w.newStages.map((s) => `${w.abbr}-Fassung vom ${fmtDateDe(s.date)}`));
  const list = parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} und ${parts.at(-1)}`;
  return `SGK-Navigator ${version}: ${list || 'Fassungen'} nachgeführt`;
}

/** Zähler aus der Ausgabe von node --test und Playwright. */
export function testCounts(output) {
  const s = String(output || '');
  const c = {};
  for (const m of s.matchAll(/^[#ℹ]\s*(pass|fail|skipped)\s+(\d+)\s*$/gmu)) c[m[1]] = (c[m[1]] || 0) + Number(m[2]);
  if (!Object.keys(c).length) for (const m of s.matchAll(/^\s*(\d+)\s+(passed|failed|skipped|flaky)\b/gm)) c[{ passed: 'pass', failed: 'fail', skipped: 'skipped', flaky: 'flaky' }[m[2]]] = Number(m[1]);
  return c;
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const VERDICT = { ok: 'bestanden', hinweis: 'Hinweis', fehler: '**nicht bestanden**' };
const unitList = (u) => (u.length ? u.slice(0, 40).join(', ') + (u.length > 40 ? ` und ${u.length - 40} weitere` : '') : 'keine');

/**
 * Titel und Text des Pull Requests. e: einbau.json (scripts/apply-fassungen.mjs), tests: tests.json oder null.
 * ctx: { probelauf, repoUrl }. Ergebnis { title, body, failed, reasons, status } mit status 'ok', 'fachangaben' oder 'fehler'.
 */
export function prText(e, tests, ctx = {}) {
  const repoUrl = ctx.repoUrl || 'https://github.com/SEM-SGG/sgk-navigator';
  const reasons = [];
  if (e.error) reasons.push(`Einbau gescheitert im Schritt «${e.step || 'unbekannt'}»: ${e.error}`);
  if (e.validation && !e.validation.passed) reasons.push('Mindestens eine Prüfung ist nicht bestanden (Abschnitt «Prüfberichte»).');
  for (const w of e.works || []) for (const s of w.newStages) if (s.missing) reasons.push(`${w.abbr}: Die Fassung vom ${fmtDateDe(s.date)} fehlt nach dem Einbau in den Daten.`);
  for (const w of e.works || []) for (const s of w.expected || []) if (!w.newStages.some((x) => x.celex === s)) reasons.push(`${w.abbr}: Die gemeldete Fassung \`${s}\` ist nicht als neuer Stand eingebaut.`);
  if ((e.foreign || []).length) reasons.push('Ein bestehender Stand hat sich inhaltlich geändert (Abschnitt «Übrige Stände»).');
  if (!e.error) {
    if (!tests) reasons.push('Die Tests sind nicht gelaufen.');
    else for (const t of tests.results.filter((x) => !x.ok)) reasons.push(`Test fehlgeschlagen: ${t.label}.`);
  }
  // Fachangaben: «acts» (Eintrag in data/acts.json fehlt) macht den Pull Request zum Entwurf; «check» nennt nur, was die
  // Fachperson besonders prüfen soll.
  const needs = (e.fachangaben || []).filter((x) => x.kind !== 'check');
  const checks = (e.fachangaben || []).filter((x) => x.kind === 'check');
  const failed = reasons.length > 0;
  const status = failed ? 'fehler' : needs.length ? 'fachangaben' : 'ok';
  const title = (ctx.probelauf ? 'Probelauf: ' : '') + (e.subject || 'SGK-Navigator: Fassungen nachgeführt');
  const L = [`<!-- ${FP_MARK}: ${e.fingerprint} -->`, `<!-- ${STATUS_MARK}: ${status} -->`];
  if (failed) {
    L.push('> [!CAUTION]', '> **Nicht zusammenführen.** Der automatische Einbau ist nicht vollständig gelungen. Dieser Pull Request ist darum ein Entwurf.', '>');
    for (const r of reasons) L.push(`> - ${cell(r)}`);
    L.push('>', `> Was du tust, steht in [MAINTAINING.md, «Wenn der Pull Request ein Entwurf ist»](${repoUrl}/blob/main/MAINTAINING.md#wenn-der-pull-request-ein-entwurf-ist).`, '');
  } else if (needs.length) {
    L.push('> [!IMPORTANT]', '> **Nicht zusammenführen, bevor die Fachangaben ergänzt sind.** Der Einbau ist gelungen, aber es fehlen Angaben, die nur eine Fachperson liefern kann (Abschnitt «Von dir zu liefern»). Dieser Pull Request ist darum ein Entwurf.', '');
  }
  if (ctx.probelauf) L.push('> [!NOTE]', '> **Probelauf.** Dieser Text stammt aus einem Probelauf des Workflows «Fassungen». Der Probelauf eröffnet keinen Pull Request und ändert kein Issue.', '');
  L.push(`Das Amt für Veröffentlichungen der EU führt neue konsolidierte Fassungen. Der Workflow «Fassungen» hat sie eingebaut. Die Version steigt von ${e.versionBefore || '–'} auf **${e.version || '–'}**.`, '');
  L.push('## Befund', '', `Prüfung vom ${e.today ? fmtDateDe(e.today) : '–'}.`, '');
  L.push('| Rechtsakt | CELEX | Datum | EUR-Lex |', '| --- | --- | --- | --- |');
  for (const x of e.cons || []) L.push(`| ${cell(x.abbr)} | \`${cell(x.celex)}\` | ${x.date ? fmtDateDe(x.date) : '–'} | [DE](https://eur-lex.europa.eu/legal-content/DE/TXT/HTML/?uri=CELEX:${x.celex}) · [FR](https://eur-lex.europa.eu/legal-content/FR/TXT/HTML/?uri=CELEX:${x.celex}) · [EN](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${x.celex}) |`);
  L.push('');
  if (needs.length) {
    L.push('## Von dir zu liefern', '');
    for (const n of needs) {
      L.push(`### ${n.title}`, '', n.text, '');
      if (n.task) L.push('Gib einem Agenten (Claude Code im Browser oder Codex mit angebundenem Repository) diesen Auftrag. Ersetze die Pünktchen durch deine Angabe:', '', '```', n.task, '```', '');
    }
    L.push('Der Agent eröffnet einen eigenen Pull Request. Führe ihn zusammen. Starte danach den Workflow «Fassungen» neu (**Actions** → **Fassungen** → **Run workflow**). Er baut diesen Pull Request mit den neuen Angaben neu.', '');
  }
  if (checks.length) {
    L.push('## Besonders zu prüfen', '');
    for (const n of checks) L.push(`### ${n.title}`, '', n.text, '');
  }
  if (e.changelog) L.push('## Text im Changelog', '', 'Dieser Abschnitt in `CHANGELOG.md` wird zum Text der Release:', '', '```markdown', e.changelog, '```', '');
  if ((e.works || []).length) {
    L.push('## Was sich ändert', '');
    for (const w of e.works) {
      L.push(`### ${w.abbr}`, '');
      for (const s of w.newStages) {
        L.push(`Neuer Stand ${s.stage}, konsolidierte Fassung vom ${fmtDateDe(s.date)} (\`${s.celex}\`)${s.act ? `, Akt \`${s.act}\`` : ''}. Geänderte Bestimmungen gegenüber dem Stand davor:`, '');
        for (const l of LANGS) if (s.langs[l]) L.push(`- ${LANG_NAMES[l]}: ${cell(unitList(s.langs[l]))}`);
        if (s.note) L.push('', `Herkunftsangabe im Navigator: «${cell(s.note.de)}»`);
        L.push('');
      }
    }
  }
  if (e.validation) {
    L.push('## Prüfberichte', '', 'Zahlen aus den Prüfberichten vor und nach dem Einbau. Einzelheiten stehen in `data/VALIDATION.md` (SGK) und `data/VALIDATION_WORKS.md` (weitere Rechtsakte).', '');
    L.push('| Prüfung | vorher | nachher | Urteil |', '| --- | --- | --- | --- |');
    for (const r of e.validation.rows) L.push(`| ${cell(r.label)} | ${cell(r.before)} | ${cell(r.after)} | ${VERDICT[r.verdict]}${r.text ? ': ' + cell(r.text) : ''} |`);
    L.push('', '«Hinweis» hindert das Zusammenführen nicht, verlangt aber einen Blick in den genannten Bericht. «nicht bestanden» macht den Pull Request zum Entwurf.', '');
  }
  if (e.fetched) {
    const SRC = { 'eur-lex': 'EUR-Lex', 'cellar-xhtml': 'Cellar (XHTML)', 'cellar-html': 'Cellar (HTML)' };
    const parts = Object.entries(e.fetched).map(([k, n]) => `${n} von ${SRC[k] || k}`);
    L.push(`Rohdaten: ${parts.length ? `in diesem Lauf geladen ${parts.join(', ')}` : 'alle aus dem Zwischenspeicher des Workflows'}.`, '');
  }
  if (e.foreign) {
    L.push('## Übrige Stände', '');
    if (!e.foreign.length) L.push('Alle bisherigen Stände aller Rechtsakte sind inhaltlich unverändert.');
    for (const f of e.foreign.slice(0, 20)) L.push(`- **Warnung:** ${cell(f.abbr)}, Stand ${f.stage}, ${LANG_NAMES[f.lang] || f.lang}: ${cell(unitList(f.units))}`);
    L.push('');
  }
  L.push('## Tests', '');
  if (!tests) L.push(e.error ? 'Nicht ausgeführt, weil der Einbau gescheitert ist.' : 'Nicht ausgeführt.');
  else {
    L.push('| Test | Ergebnis |', '| --- | --- |');
    for (const t of tests.results) {
      const c = t.counts || {};
      const n = ['pass', 'fail', 'skipped'].filter((k) => c[k] !== undefined).map((k) => `${c[k]} ${{ pass: 'bestanden', fail: 'fehlgeschlagen', skipped: 'übersprungen' }[k]}`).join(', ');
      L.push(`| ${cell(t.label)} | ${t.ok ? '**bestanden**' : '**fehlgeschlagen**'}${n ? ` (${n})` : ''} |`);
    }
    for (const t of tests.results.filter((x) => !x.ok && x.tail)) L.push('', `<details><summary>Letzte Zeilen von «${cell(t.label)}»</summary>`, '', '```', t.tail, '```', '', '</details>');
  }
  L.push('', '## So prüfst du diesen Pull Request', '');
  L.push(
    '1. Vergleiche den Abschnitt «Befund» mit EUR-Lex. Die Links in der Tabelle führen zur Fassung.',
    '2. Lies «Was sich ändert». Dort stehen nur die Rechtsakte aus dem Befund, je Sprache mit den geänderten Bestimmungen.',
    '3. Prüfe «Prüfberichte», «Übrige Stände» und «Tests»: Jede Prüfung zeigt «bestanden» oder «Hinweis», unter «Übrige Stände» steht keine Warnung, jeder Test zeigt «bestanden».',
    '4. Gib den Lauf «CI» frei: Unten im Pull Request steht «Some checks are waiting for approval». Wähle dort **Approve workflows to run**. GitHub verlangt diese Freigabe, weil der Pull Request von einem Workflow stammt. Fehlt **Approve workflows to run** und erscheint kein Lauf «CI», wähle unten **Close pull request** und danach **Reopen pull request**.',
    '5. Lies «Text im Changelog». Du darfst ihn verbessern: **Files changed** → bei `CHANGELOG.md` das Menü **…** → **Edit file**, danach **Commit changes** im selben Zweig.',
    `6. Wähle **Merge pull request** und **Confirm merge**. Der Workflow «Release» veröffentlicht danach die Version ${e.version || 'mit der neuen Nummer'} und aktualisiert die Download-Seite.`,
    '',
    'Ist der Pull Request ein Entwurf, führe ihn nicht zusammen. Das Vorgehen steht in `MAINTAINING.md`, Abschnitt «Neue Fassung einbauen».',
  );
  const ref = e.issue && !ctx.probelauf ? (e.issueHasInfo ? `\nBezug: #${e.issue} (das Issue bleibt offen, weil es auch Akte und Vorschläge zur Information nennt)\n` : `\nCloses #${e.issue}\n`) : '';
  let body = L.join('\n') + '\n';
  if (body.length + ref.length > MAX_BODY) body = body.slice(0, MAX_BODY - ref.length - 200) + '\n\n… Text gekürzt, weil GitHub die Länge begrenzt. Der volle Text liegt im Artefakt «einbau» des Laufs (`pr.md`).\n';
  return { title, body: body + ref, failed, reasons, status };
}
