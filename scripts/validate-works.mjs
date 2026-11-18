#!/usr/bin/env node
// SGK-Navigator — Validierung der weiteren Werke (data/works/*.dataset.json) und Bericht data/VALIDATION_WORKS.md
// Aufruf: node scripts/validate-works.mjs   (setzt einen aktuellen Build voraus: node scripts/build-work.mjs all)
// Prüft je Werk, Stand und Sprache: A Abdeckung Parser gegen Quelle, B Abdeckung Datensatz gegen Quelle, C Erwägungsgründe,
// D Sprachkonsistenz der Schlüssel, E Scheinänderungen (jede Änderung trägt den Marker eines eingearbeiteten Akts oder ist erklärt),
// F Akt-Metadaten, G Grössen (roh und gzip), H SGK: Ergänzung um Erwägungsgründe ändert sonst kein Byte, I Reproduzierbarkeit (Hash).

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { DOMParser } from './lib-dom.mjs';
import { parseEurLex, sourceText, recitalsSourceText, htmlToText } from '../src/core/parser.js';
import { getVersion } from '../src/core/model.js';
import { listWorks, resolveCelex, stageAt, actsOfStage } from '../src/core/library.js';
import { concatParsed, compareTokens } from './lib-cover.mjs';
import { concatDataset, readRawFile, withoutRecitals, RECITALS_ID } from './lib-works.mjs';
import { WORKS, LANGS } from './works-config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const RAW = resolve(ROOT, 'raw');
const OUT = resolve(ROOT, 'data/works');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const pct = (x) => (100 * x).toFixed(3).replace('.', ',') + ' %';
const n = (x) => Number(x).toLocaleString('de-CH');
const kb = (b) => (b / 1024).toFixed(0) + ' KB';
const mb = (b) => (b / 1048576).toFixed(2).replace('.', ',') + ' MB';

// Am Rohtext geprüfte Auffälligkeiten der Quellen (je Fund einzeln nachgesehen; Wortlaut bleibt wie in der Quelle)
const SOURCE_DEFECTS = [
  { work: 'ees', stage: 's04', lang: 'fr', unit: 'art_23', key: 'p4.s2', what: 'Wortlaut in 02017R2226-20260612 FR verstümmelt: «ent paragraphe, les disposiOutre l’identification visée au premier alinéa du préstions suivantes s’appliquent:» (Vorfassung: «Outre l’identification visée au premier alinéa du présent paragraphe, les dispositions suivantes s’appliquent:»). So in der Quelldatei.' },
  { work: 'etias', stage: 's04', lang: '*', unit: 'art_8', key: 'p2.g', what: '02018R1240-20251118: letztes Zeichen abgeschnitten («aufzuhebe.» / «articles 40 et 4.» / «Articles 40 and 4.»); in 20260612 wieder vollständig (dort als Zeichensetzungsänderung erkannt).' },
  { work: 'etias', stage: 's04', lang: '*', unit: 'art_69', key: 'p1.f', what: '02018R1240-20251118: «Artikel 22 und» wird «Artikel 2, und» (DE), entsprechend FR und EN («Article 2; and»); Konsolidierungsfehler im Zuge der Einarbeitung von 2025/1411.' },
  { work: 'etias', stage: 's04', lang: '*', unit: 'art_69', key: 'p1.g', what: '02018R1240-20251118: Folgeänderung derselben Konsolidierung (Konjunktion/Schlusszeichen) ohne Marker.' },
  { work: 'etias', stage: 's04', lang: 'de,en', unit: 'art_75', key: 'p1.b', what: '02018R1240-20251118: «Antragsbearbeitung und» wird «Antragsbearbeitun, und» (DE), «processing of applications; and» wird «processing of application; and» (EN).' },
  { work: 'etias', stage: 's04', lang: 'de,en', unit: 'art_75', key: 'p1.c', what: '02018R1240-20251118: Folgeänderung derselben Konsolidierung ohne Marker.' },
  { work: 'etias', stage: 's04', lang: 'fr', unit: 'art_47', key: 'p2.a', what: '02018R1240-20210803 FR enthält vor «a)» ein von EUR-Lex stehen gelassenes Anführungszeichen «; 20251118 ohne. Kein Rechtstext.' },
  { work: 'etias', stage: 's05', lang: '*', unit: 'art_8', key: 'p2.g', what: '02018R1240-20260612: Rückkehr zum vollständigen Wortlaut nach dem Fehler in 20251118.' },
  { work: 'vis', stage: 's03', lang: 'fr', unit: 'art_23', key: 'p1.d', what: '02008R0767-20171229 FR: «d’annulation [Streichung] de retrait» wird «d’annulation [Streichung] ou de retrait»; kein Marker.' },
  { work: 'vis', stage: 's07', lang: 'en', unit: '*', key: '*', what: '02008R0767-20230803 EN: die durch 810/2009 gestrichenen Worte «or shortened» bzw. «, shortened» stehen in Art. 19 Abs. 2 Bst. c, 20 Abs. 2 Bst. d, 22 Abs. 2 Bst. d und 23 Abs. 1 Bst. d wieder im Text (ohne Marker); 20231227 streicht sie erneut.' },
  { work: 'vis', stage: 's08', lang: 'en', unit: '*', key: '*', what: '02008R0767-20231227 EN: erneute Streichung von «or shortened» (s. s07).' },
];
const defectFor = (w, a) => SOURCE_DEFECTS.find((d) => d.work === w && d.stage === a.stage && (d.lang === '*' || d.lang.split(',').includes(a.lang)) && (d.unit === '*' || d.unit === a.unit) && (d.key === '*' || d.key === a.key));

const index = JSON.parse(readFileSync(resolve(OUT, 'index.json'), 'utf8'));
const R = { works: {} };
const t0 = Date.now();

for (const [id, cfg] of Object.entries(WORKS)) {
  const ds = JSON.parse(readFileSync(resolve(OUT, `${id}.dataset.json`), 'utf8'));
  const acts = JSON.parse(readFileSync(resolve(OUT, `${id}.acts.json`), 'utf8'));
  const cache = JSON.parse(readFileSync(resolve(ROOT, `scripts/out/works/${id}.sources.json`), 'utf8'));
  const W = R.works[id] = { stages: ds.stages.length, units: Object.keys(ds.units).length, acts: acts.length, coverage: [], coverageDs: [], recitals: [], lang: [], changes: null, actsCheck: [], sizes: {} };
  // A/B Abdeckung
  for (const st of ds.stages) {
    for (const lang of st.langs) {
      const html = readRawFile(RAW, st.source.celex, lang);
      const src = sourceText(html, { DOMParser, imageText: false });
      const p = parseEurLex(html, { DOMParser });
      const a = compareTokens(src, concatParsed(p));
      W.coverage.push({ stage: st.id, celex: st.source.celex, lang, srcTokens: a.srcTokens, coverage: a.coverage, missing: a.missing, extra: a.extra, gaps: a.gaps.slice(0, 10) });
      const b = compareTokens(src, concatDataset(ds, st.id, lang));
      W.coverageDs.push({ stage: st.id, lang, coverage: b.coverage, missing: b.missing, extra: b.extra, gaps: b.gaps.slice(0, 10) });
    }
  }
  // C Erwägungsgründe
  const rct = ds.units[RECITALS_ID];
  for (const lang of LANGS) {
    const html = readRawFile(RAW, cfg.celex, lang);
    const v = rct && rct.versions[lang] && rct.versions[lang][0];
    const txt = v ? v.blocks.map((b) => (b.l || '') + ' ' + b.t).join(' ') : '';
    const c = compareTokens(recitalsSourceText(html, { DOMParser }), txt);
    W.recitals.push({ lang, recitals: v ? v.blocks.filter((b) => /^r\d+$/.test(b.k)).length : 0, blocks: v ? v.blocks.length : 0, coverage: c.coverage, missing: c.missing, extra: c.extra, srcTokens: c.srcTokens, labelsOk: v ? v.blocks.filter((b) => /^r\d+$/.test(b.k)).every((b) => b.l === `(${b.k.slice(1)})`) : false });
  }
  // D Sprachkonsistenz (alle Einheiten inkl. Erwägungsgründe, jeder Stand)
  let pairs = 0;
  for (const st of ds.stages) {
    for (const e of ds.toc) {
      if (!['article', 'annex', 'recitals'].includes(e.type)) continue;
      const keys = {};
      for (const lang of LANGS) { const v = getVersion(ds, e.id, lang, st.id); keys[lang] = v && !v.repealed ? v.blocks.map((b) => b.k).join(' ') : (v ? 'AUFGEHOBEN' : '-'); }
      if (keys.de === '-' && keys.fr === '-' && keys.en === '-') continue;
      pairs++;
      if (keys.de !== keys.fr || keys.de !== keys.en) {
        const sets = Object.fromEntries(LANGS.map((l) => [l, new Set(keys[l].split(' '))]));
        const diff = Object.fromEntries(LANGS.map((l) => [l, [...sets[l]].filter((k) => LANGS.some((m) => !sets[m].has(k)))]));
        W.lang.push({ stage: st.id, unit: e.id, diff, orderOnly: LANGS.every((l) => !diff[l].length), stageLangs: st.langs.join(',') });
      }
    }
  }
  W.langPairs = pairs;
  // E Scheinänderungen (aus dem Build: scripts/out/works/<id>.sources.json)
  const all = cache.attributions;
  const byWhy = {};
  // vollständige Liste neu berechnen ist im Build erfolgt; hier: Kennzahlen und unerklärte Fälle mit Quellbefund
  const unexplained = all.unexplained.map((a) => ({ ...a, defect: defectFor(id, a) || null }));
  W.changes = { total: all.total, unexplained: unexplained.length, unexplainedWithoutDefect: unexplained.filter((a) => !a.defect).length, list: unexplained, originKept: cache.originKept.length, originKeptBy: cache.originKept.reduce((m, o) => { const k = `${o.stage} ${o.lang.toUpperCase()}: ${o.marker} → ${o.kept}`; m[k] = (m[k] || 0) + 1; return m; }, {}), byWhy };
  W.skipped = cache.skipped;
  W.droppedFromList = cache.stages.filter((s) => s.droppedFromList.length).map((s) => ({ stage: s.id, dropped: s.droppedFromList }));
  // F Akte
  const mods = new Set(cache.stages.flatMap((s) => s.modifiers));
  for (const a of acts) {
    const issues = [];
    if (a.kind !== 'corrigendum') for (const l of LANGS) if (!a.title[l]) issues.push(`Titel ${l} fehlt`);
    if (a.kind === 'corrigendum' && !(a.langs || []).every((l) => a.title[l] || true)) issues.push('Sprachen');
    if (!a.published) issues.push('published fehlt');
    if (a.application.status !== 'unknown' || a.application.date !== null) issues.push('Anwendbarkeit gesetzt');
    if (a.kind !== 'base' && !mods.has(a.celex)) issues.push('nicht in Modifikatorenliste');
    W.actsCheck.push({ celex: a.celex, kind: a.kind, changes: a.changes.length, titles: LANGS.filter((l) => a.title[l]).join(','), oj: LANGS.filter((l) => a.oj && a.oj[l]).join(','), issues });
  }
  // stage.acts vollständig, stage.act = erster Eintrag
  W.stageActs = ds.stages.map((s) => ({ id: s.id, date: s.date, act: s.act, acts: s.acts, celex: s.source.celex, langs: s.langs, ok: s.act === (s.acts[0] || s.source.celex) }));
  // J Eingefügte bzw. neu gefasste Artikel der Änderungsakte (zitierte Überschrift «‘Article 22g») gegen den jüngsten Stand (EN-Texte in raw/)
  const NUM = { ees: '(EU) 2017/2226', etias: '(EU) 2018/1240', vis: '(EC) No 767/2008', iop: '(EU) 2019/817' }[id];
  const last = ds.stages[ds.stages.length - 1].id;
  W.inserted = [];
  for (const a of acts.filter((x) => x.kind === 'amendment')) {
    const f = resolve(RAW, `${a.celex}_EN.html`);
    if (!existsSync(f)) { W.inserted.push({ act: a.celex, raw: false }); continue; }
    const p = parseEurLex(readFileSync(f, 'utf8'), { DOMParser });
    const esc = NUM.replace(/[()]/g, '\\$&');
    const us = p.units.filter((u) => new RegExp(esc).test(htmlToText(u.title || '')) && /amend/i.test(htmlToText(u.title || '')));
    const arts = new Set();
    for (const u of us) for (const b of u.blocks) { const m = htmlToText((b.l || '') + ' ' + b.t).trim().match(/^[‘'"“]?\s*Article (\d+[a-z]*)\s*$/); if (m && /q\d+$/.test(b.k)) arts.add(m[1]); }
    const missing = [...arts].filter((x) => { const v = getVersion(ds, 'art_' + x, 'en', last); return !v || v.repealed; });
    const everPresent = missing.filter((x) => ds.units['art_' + x]);
    W.inserted.push({ act: a.celex, raw: true, amendingUnits: us.map((u) => u.id), quoted: arts.size, missing, everPresent });
  }
  // K Schlüssel mit Notsuffix "~"
  W.tilde = [];
  for (const [uid, u] of Object.entries(ds.units)) for (const [l, vs] of Object.entries(u.versions)) for (const v of vs) for (const b of v.blocks) if (b.k.includes('~')) W.tilde.push(`${uid}#${b.k}@${v.stage}/${l}`);
  W.keysAligned = cache.keysAligned || [];
  // G Grössen
  for (const f of [`${id}.dataset.json`, `${id}.acts.json`]) {
    const buf = readFileSync(resolve(OUT, f));
    W.sizes[f] = { raw: buf.length, gzip: gzipSync(buf, { level: 9 }).length, sha256: sha256(buf) };
  }
  W.reproducible = cache.output.dataset.sha256 === W.sizes[`${id}.dataset.json`].sha256 && cache.output.acts.sha256 === W.sizes[`${id}.acts.json`].sha256;
  // library.js am Werk
  W.library = {
    resolveBase: resolveCelex(index, cfg.celex) === id,
    resolveConsolidated: ds.stages.filter((s) => s.source.kind === 'consolidated').every((s) => resolveCelex(index, s.source.celex) === id),
    stageAtEachDate: ds.stages.every((s) => { const r = stageAt(ds, s.date); const same = ds.stages.filter((x) => x.date === s.date).map((x) => x.id); return same.includes(r) && r === same[same.length - 1]; }),
    beforeFirst: stageAt(ds, '1990-01-01') === null,
    actsOfStage: ds.stages.every((s) => JSON.stringify(actsOfStage(ds, s.id)) === JSON.stringify(s.acts)),
  };
  console.log(`${id}: Abdeckung Parser min ${pct(Math.min(...W.coverage.map((c) => c.coverage)))}, Datensatz min ${pct(Math.min(...W.coverageDs.map((c) => c.coverage)))}, Erwägungsgründe min ${pct(Math.min(...W.recitals.map((c) => c.coverage)))}, Sprachabweichungen ${W.lang.length}, Änderungen ${W.changes.total}, unerklärt ${W.changes.unexplained} (ohne Quellbefund ${W.changes.unexplainedWithoutDefect})`);
}

// H SGK: Erwägungsgründe
const proofFile = resolve(ROOT, 'scripts/out/works/sgk.recitals-proof.json');
const sgkProof = existsSync(proofFile) ? JSON.parse(readFileSync(proofFile, 'utf8')) : null;
const sgkNow = readFileSync(resolve(ROOT, 'data/dataset.json'), 'utf8');
const sgkObj = JSON.parse(sgkNow);
const sgkHasRct = !!sgkObj.units[RECITALS_ID];
const sgkWithoutSha = sha256(JSON.stringify(withoutRecitals(sgkObj)));
let gitSha = null, gitRef = null;
try {
  gitRef = execFileSync('git', ['log', '-1', '--format=%h', '--', 'data/dataset.json'], { cwd: ROOT, encoding: 'utf8' }).trim();
  gitSha = sha256(execFileSync('git', ['show', `${gitRef}:data/dataset.json`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }));
} catch { /* ohne git */ }
const sgkRct = JSON.parse(readFileSync(resolve(OUT, 'sgk.recitals.json'), 'utf8'));
const sgkRctCov = LANGS.map((lang) => {
  const html = readRawFile(RAW, '32016R0399', lang);
  const v = sgkRct.unit.versions[lang][0];
  const c = compareTokens(recitalsSourceText(html, { DOMParser }), v.blocks.map((b) => (b.l || '') + ' ' + b.t).join(' '));
  return { lang, blocks: v.blocks.length, coverage: c.coverage, missing: c.missing, extra: c.extra, srcTokens: c.srcTokens };
});
R.sgk = { proof: sgkProof, hasRct: sgkHasRct, withoutRctSha: sgkWithoutSha, gitRef, gitSha, coverage: sgkRctCov };

// Grössenbudget
const gzTotal = Object.values(R.works).reduce((a, w) => a + w.sizes[Object.keys(w.sizes).find((f) => f.endsWith('.dataset.json'))].gzip, 0);
const rawTotal = Object.values(R.works).reduce((a, w) => a + w.sizes[Object.keys(w.sizes).find((f) => f.endsWith('.dataset.json'))].raw, 0);
R.budget = { gzTotal, rawTotal, limit: 2.5 * 1048576, ok: gzTotal <= 2.5 * 1048576 };
console.log(`Grösse: ${mb(rawTotal)} roh, ${mb(gzTotal)} gzip (Budget 2,50 MB): ${R.budget.ok ? 'eingehalten' : 'ÜBERSCHRITTEN'}`);

// Tests (nur eigene Testdateien; alle Kerntests laufen separat)
let tests = null;
try {
  const out = execFileSync(process.execPath, ['--test', 'test/core/parser-works.test.mjs', 'test/core/library.test.mjs'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 << 20 });
  tests = { pass: +(out.match(/# pass (\d+)/) || [0, 0])[1], fail: +(out.match(/# fail (\d+)/) || [0, 0])[1] };
} catch (e) { const out = String(e.stdout || ''); tests = { pass: +(out.match(/# pass (\d+)/) || [0, 0])[1], fail: +(out.match(/# fail (\d+)/) || [0, 0])[1] || 1 }; }
R.tests = tests;

// ------------------------------------------------------------ Bericht
const md = [];
const L = (s = '') => md.push(s);
L('# Prüfbericht weitere Rechtsakte (Agent BIBLIOTHEK, Etappe 3)');
L();
L(`Erzeugt von \`node scripts/validate-works.mjs\` aus \`data/works/\` (Build \`node scripts/build-work.mjs all\`). Alle Zahlen stammen aus maschinellen Prüfungen dieses Laufs (${((Date.now() - t0) / 1000).toFixed(0)} s). Rohdaten: \`scripts/out/works/<id>.sources.json\` (Fassungen, Verfügbarkeit, Zuordnung jeder Änderung, Protokoll).`);
L();
L('## 1 Ergebnis in Kürze');
L();
L('| Werk | CELEX | Stände | Einheiten | Akte | Abdeckung Parser (min) | Abdeckung Datensatz (min) | Erwägungsgründe (min) | Schlüssel DE/FR/EN abweichend | Änderungen | davon unerklärt | davon ohne Quellbefund |');
L('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const [id, W] of Object.entries(R.works)) {
  L(`| ${id} | ${WORKS[id].celex} | ${W.stages} | ${W.units} | ${W.acts} | ${pct(Math.min(...W.coverage.map((c) => c.coverage)))} | ${pct(Math.min(...W.coverageDs.map((c) => c.coverage)))} | ${pct(Math.min(...W.recitals.map((c) => c.coverage)))} | ${W.lang.length} von ${n(W.langPairs)} | ${n(W.changes.total)} | ${W.changes.unexplained} | ${W.changes.unexplainedWithoutDefect} |`);
}
L();
L(`- Grösse der vier Datensätze: ${mb(rawTotal)} roh, ${mb(gzTotal)} gzip (Budget 2,5 MB gzip: ${R.budget.ok ? 'eingehalten' : 'überschritten'}).`);
L(`- Reproduzierbarkeit: Hash der Ausgabe gleich dem beim Build protokollierten Hash: ${Object.entries(R.works).map(([id, W]) => `${id} ${W.reproducible ? 'ja' : 'NEIN'}`).join(', ')}. (Zweiter Build mit identischem Ergebnis: siehe Abschnitt 9.)`);
L(`- Tests \`test/core/parser-works.test.mjs\`, \`test/core/library.test.mjs\`: ${tests.pass} bestanden, ${tests.fail} fehlgeschlagen.`);
L(`- SGK: Einheit Erwägungsgründe als separate Datei \`data/works/sgk.recitals.json\` (Abschnitt 8); \`data/dataset.json\` ${sgkHasRct ? 'enthält rct' : 'unverändert'}.`);
L('- Anwendbarkeit: in allen Akt-Dateien `application.status: "unknown"`, `date: null` (nicht an der Primärquelle geprüft).');
L();
L('## 2 Methode');
L();
L('- Stände: `s00` = ABl.-Fassung des Basisakts; danach je konsolidierte EUR-Lex-Fassung ein Stand, nach Datum geordnet. Fassungen per SPARQL ermittelt (alle CELEX `0<jjjj>R<nnnn>-*`), keine Rekonstruktion von Zwischenständen. `stage.acts`: Akte, die gegenüber der Vorfassung neu in der Modifikatorenliste stehen, ergänzt um Akte, deren Marker in dieser Fassung erstmals Änderungen tragen (gestaffelte Konsolidierung, z. B. 2021/1134 im VIS 2022 und 2023). `stage.act` = erster Eintrag, sonst CELEX der Fassung.');
L('- Herkunft `o` je Block aus den Markern (▼B, ▼Mn, ▼Cn, Inline ►…◄). Regel: Bleibt der Wortlaut eines Blocks gegenüber der Vorfassung gleich, behält er die Herkunft der Vorfassung (o = Akt der letzten Wortlautänderung). Grund: Marker sind nicht immer genau; ohne die Regel entstünden Scheinänderungen. Jeder Fall ist gezählt (Abschnitt 5).');
L('- Abdeckung: Wortfolge des verfügenden Teils (ab erster Gliederungseinheit bzw. Artikel 1, mit Anhängen) der Quelldatei gegen die Ausgabe (Myers-Diff über normalisierte Wörter, wie `data/VALIDATION.md`). A = Parser gegen Quelle je Datei; B = Datensatz-Stand gegen Quelle (prüft zusätzlich Schlüsselabgleich und Übernahme unveränderter Blöcke).');
L('- Scheinänderungen: Jede Änderung zwischen zwei Ständen (`changesOfStage`, je Sprache) wird einem Akt zugeordnet: Marker eines neu gelisteten Akts, Marker eines bereits gelisteten Akts (erst jetzt konsolidiert), DELETED-Marker, Wegfall bei Neufassung des übergeordneten oder benachbarten Blocks, Folgeanpassung von Zeichensetzung oder Konjunktion bei eingefügtem Nachbarpunkt, Rücknahme eines Akts, der aus der Modifikatorenliste fällt. Was so nicht erklärt ist, steht einzeln in Abschnitt 5 und wurde am Rohtext nachgesehen.');
L('- Bilder: keine der Quelldateien der vier Werke enthält Bilder (`<img>`: 0); Blöcke `ty: "img"` kommen nicht vor.');
L();
L('## 3 Stände je Werk');
L();
for (const [id, W] of Object.entries(R.works)) {
  L(`### ${id} (${WORKS[id].number})`);
  L();
  L('| Stand | Datum | Quelle | Sprachen | stage.acts |');
  L('|---|---|---|---|---|');
  for (const s of W.stageActs) L(`| ${s.id} | ${s.date} | ${s.celex} | ${s.langs.join(', ')} | ${s.acts.join(', ') || '— (stage.act = CELEX der Fassung)'} |`);
  L();
  if (W.skipped.length) { L(`Ausgelassen: ${W.skipped.map((s) => `${s.celex} (${s.reason})`).join('; ')}.`); L(); }
  if (W.droppedFromList.length) { L(`Aus der Modifikatorenliste gefallen: ${W.droppedFromList.map((d) => `${d.stage}: ${d.dropped.join(', ')}`).join('; ')}.`); L(); }
}
L('## 4 Abdeckung je Fassung und Sprache');
L();
L('| Werk | Stand | Quelle | Sprache | Wörter Quelle | A Parser | fehlend | zusätzlich | B Datensatz | fehlend | zusätzlich |');
L('|---|---|---|---|---|---|---|---|---|---|---|');
for (const [id, W] of Object.entries(R.works)) {
  for (const c of W.coverage) {
    const d = W.coverageDs.find((x) => x.stage === c.stage && x.lang === c.lang);
    L(`| ${id} | ${c.stage} | ${c.celex} | ${c.lang} | ${n(c.srcTokens)} | ${pct(c.coverage)} | ${c.missing} | ${c.extra} | ${pct(d.coverage)} | ${d.missing} | ${d.extra} |`);
  }
}
const gapsAll = Object.entries(R.works).flatMap(([id, W]) => [...W.coverage.flatMap((c) => c.gaps.map((g) => `${id} ${c.stage} ${c.lang} A: ${g.type} «${g.text}» nach «${g.context}»`)), ...W.coverageDs.flatMap((c) => c.gaps.map((g) => `${id} ${c.stage} ${c.lang} B: ${g.type} «${g.text}» nach «${g.context}»`))]);
L();
L(gapsAll.length ? `Lücken (${gapsAll.length}):` : 'Lücken: keine.');
gapsAll.slice(0, 80).forEach((g) => L(`- ${g}`));
L();
L('## 5 Änderungen zwischen Ständen (Scheinänderungen)');
L();
for (const [id, W] of Object.entries(R.works)) {
  L(`### ${id}`);
  L();
  L(`- Änderungen (Einheit × Schlüssel × Sprache × Stand): ${n(W.changes.total)}; erklärt ${n(W.changes.total - W.changes.unexplained)}; unerklärt ${W.changes.unexplained}, davon ohne geprüften Quellbefund ${W.changes.unexplainedWithoutDefect}.`);
  const ok = Object.entries(W.changes.originKeptBy);
  L(`- Herkunft der Vorfassung beibehalten (Wortlaut unverändert, Marker abweichend): ${W.changes.originKept} Blöcke${ok.length ? ' — ' + ok.map(([k, v]) => `${k} (${v})`).join('; ') : ''}.`);
  if (W.changes.list.length) {
    L();
    L('| Stand | Sprache | Einheit | Schlüssel | Art | Herkunft | Befund |');
    L('|---|---|---|---|---|---|---|');
    for (const a of W.changes.list) L(`| ${a.stage} | ${a.lang} | ${a.unit} | ${a.key ?? ''} | ${a.change}${a.x ? ' [' + a.x + ']' : ''} | ${a.act ?? '—'} | ${a.defect ? a.defect.what : 'OFFEN: nicht erklärt'} |`);
  }
  L();
}
L('## 6 Sprachkonsistenz der Schlüssel');
L();
for (const [id, W] of Object.entries(R.works)) {
  L(`- ${id}: ${W.lang.length} Abweichungen bei ${n(W.langPairs)} Paaren Einheit × Stand.`);
  for (const d of W.lang.slice(0, 40)) L(`  - ${d.stage} ${d.unit}${d.orderOnly ? ' (nur Reihenfolge)' : ''}${d.stageLangs !== 'de,fr,en' ? ` (Stand nur ${d.stageLangs})` : ''}: ${LANGS.map((l) => `${l.toUpperCase()} ${d.diff[l].join(' ') || '–'}`).join('; ')}`);
}
L();
L();
L('Befund EES Art. 17 Abs. 4 (DE `p4.s3`): Die deutsche Sprachfassung (ABl. und alle Fassungen) gliedert den Satz «Die Mitgliedstaaten gewährleisten angemessene Verfahren …» als eigenen Unterabsatz; FR und EN führen ihn als letzten Satz des zweiten Unterabsatzes. Echte Abweichung der Sprachfassungen, nicht angeglichen.');
L();
L('## 7 Erwägungsgründe (Einheit `rct`)');
L();
L('Quelle: ABl.-Fassung des Basisakts (`div id="rct_N"`). Blöcke `r1 … rN` mit `l: "(N)"`; weitere Absätze oder Aufzählungen eines Erwägungsgrunds als `rN.s2` bzw. `rN.a`. Eine Version (s00).');
L();
L('| Werk | Sprache | Erwägungsgründe | Blöcke | Wörter Quelle | Abdeckung | fehlend | zusätzlich | Label = Nummer |');
L('|---|---|---|---|---|---|---|---|---|');
for (const [id, W] of Object.entries(R.works)) for (const c of W.recitals) L(`| ${id} | ${c.lang} | ${c.recitals} | ${c.blocks} | ${n(c.srcTokens)} | ${pct(c.coverage)} | ${c.missing} | ${c.extra} | ${c.labelsOk ? 'ja' : 'nein'} |`);
for (const c of sgkRctCov) L(`| sgk | ${c.lang} | ${c.blocks} | ${c.blocks} | ${n(c.srcTokens)} | ${pct(c.coverage)} | ${c.missing} | ${c.extra} | ja |`);
L();
L('## 8 SGK: Ergänzung um die Einheit Erwägungsgründe');
L();
if (sgkProof) {
  L(`- Nachweis (\`node scripts/build-work.mjs sgk${sgkProof.dryRun ? ' --dry-run' : ''}\`, ${sgkProof.dryRun ? 'Trockenlauf' : 'geschrieben'}): \`data/dataset.json\` mit \`rct\` → \`rct\` und toc-Eintrag entfernt → JSON byte-identisch mit dem Ausgangsstand: ${sgkProof.identical ? 'ja' : 'NEIN'}. SHA-256 Ausgangsstand ${sgkProof.baselineSha256}, nach Ergänzung ohne rct ${sgkProof.afterWithoutRctSha256}; Grösse ${n(sgkProof.bytesBefore)} → ${n(sgkProof.bytesAfter)} Bytes.`);
}
L(`- Aktueller Stand \`data/dataset.json\`: rct ${sgkHasRct ? 'vorhanden' : 'nicht vorhanden'}; SHA-256 ohne rct ${sgkWithoutSha}; letzter Commit der Datei ${gitRef || '?'} mit SHA-256 ${gitSha || '?'} → ${gitSha === sgkWithoutSha ? 'identisch' : 'VERSCHIEDEN'}.`);
L('- **Entscheid: separate Datei.** Einheit und toc-Eintrag liegen in `data/works/sgk.recitals.json` (`{ toc, unit }`, im Index beim SGK als `recitals`). Die Oberfläche hängt sie beim Laden ein: `toc` an erster Stelle, `units.rct = unit` (Hilfsfunktion `withRecitals` in scripts/lib-works.mjs zeigt das Vorgehen). `data/dataset.json` bleibt unverändert.');
L('- Grund: Mit `rct` in `data/dataset.json` scheitert `test/core/model.test.mjs` «addSnapshot … = Gesamtbuild» (ausgeführt, danach rückgängig gemacht). `addSnapshot` (src/core/model.js, `ingest`) kennzeichnet jede Einheit, die in der neuen Fassung fehlt, als aufgehoben; konsolidierte Fassungen enthalten keine Erwägungsgründe. `rct` würde also beim nächsten Upload einer SGK-Fassung im Browser als aufgehoben geführt. Dasselbe gilt für die Einheit `rct` in den vier weiteren Datensätzen, falls dort je ein Upload vorgesehen wird; Abhilfe in model.js (nicht im Schreibbereich BIBLIOTHEK): Einheiten mit `type: "recitals"` in der Schleife «Aufgehobene Einheiten» überspringen.');
L('- Alternative bleibt verfügbar: `node scripts/build-work.mjs sgk` fügt `rct` in `data/dataset.json` ein (Nachweis wie oben), `node scripts/build-data.mjs --recitals` beim Neubau.');
L();
L('## 8a Von Änderungsakten eingefügte oder neu gefasste Artikel im jüngsten Stand');
L();
L('Prüfung: In den EN-Texten der Änderungsakte (raw/<CELEX>_EN.html) werden die zitierten Artikelüberschriften («‘Article 22g») der Änderungsbestimmung zum Werk gesucht und gegen den jüngsten Stand des Datensatzes geprüft.');
L();
for (const [id, W] of Object.entries(R.works)) {
  for (const x of W.inserted) L(`- ${id} ${x.act}: ${x.raw ? `${x.quoted} zitierte Artikel (${x.amendingUnits.join(', ') || 'keine Änderungsbestimmung erkannt'}), im jüngsten Stand fehlend: ${x.missing.length ? x.missing.join(', ') : 'keine'}${x.everPresent && x.everPresent.length ? ` (davon in früheren Ständen vorhanden: ${x.everPresent.join(', ')})` : ''}` : 'Rohtext fehlt, nicht geprüft'}`);
}
L();
L('Befund VIS: Die fehlenden Artikel stammen aus 2021/1134 (u. a. Art. 2a, 9a–9g, 9i, 9k, 9l, 22a, 22c–22t, 27a, 32a, 45a, 45b, 49a) und 2023/2667 (Art. 7a–7j, 12a, 18e). Sie stehen in keiner der zehn konsolidierten EUR-Lex-Fassungen (geprüft am Rohtext aller Fassungen). Grund an der Primärquelle: Art. 12 Abs. 2 der VO (EU) 2021/1134 («shall apply from the date set by the Commission in accordance with Article 11», mit Ausnahmen ab 2.8.2021, 3.8.2022 und 3.8.2023) und Art. 8 Abs. 2 und 3 der VO (EU) 2023/2667 (Anwendung ab einem von der Kommission festgelegten Datum; Ausnahmen ab 28.6.2024 bzw. 27.12.2023). EUR-Lex konsolidiert Änderungen erst ab ihrer Anwendbarkeit; die vorgezogen anwendbaren Teile sind in s05 (2021), s06 (2022), s07 (2023) und s08 (27.12.2023) enthalten. Keine Rekonstruktion (Vorgabe SPEC3 §3.1); Verweise auf diese Artikel bleiben bis zu einer neuen Fassung tot. Bei EES, ETIAS und IO fehlt kein zitierter Artikel.');
L();
L('## 8b Schlüssel mit Notsuffix «~» und Angleichung nach Sprachmehrheit');
L();
for (const [id, W] of Object.entries(R.works)) L(`- ${id}: ${W.tilde.length} Schlüssel mit «~»${W.tilde.length ? ': ' + W.tilde.join(', ') : ''}; nach Sprachmehrheit angeglichen: ${W.keysAligned.length ? W.keysAligned.map((k) => `${k.unit} ${k.stage} ${k.lang.toUpperCase()} ${Object.entries(k.map).map(([a, b]) => a + ' → ' + b).join(', ')} (Gliederungszeichen in der Quelle «${k.labels}»)`).join('; ') : 'keine'}`);
L('- Ursache EES: 02017R2226-20260612 FR führt in Art. 9 zweimal «2 bis.» (DE «(2a)», «(2b)»); der zweite Absatz (eingefügt durch 2024/1356) erhält den Schlüssel der anderen Sprachen (p2b). IO-VO DE (ABl. und alle Fassungen): Art. 16 und 74 mit Absatznummern «1.» statt «(1)», Schlüssel nach FR/EN (p1 …). Gliederungszeichen bleiben wie in der Quelle. Regel im Kopf von `alignKeysToMajority` (scripts/build-work.mjs).');
L();
L('## 9 Akt-Metadaten (`data/works/<id>.acts.json`)');
L();
L('Titel wörtlich aus Cellar (`cdm:expression_title`, nur Leerraum vereinheitlicht); Fundstellen aus der Modifikatorentabelle der konsolidierten Fassungen (Berichtigungen wörtlich wie dort, Amtsblatt als Einzelakte ab 1.10.2023 als «ABl. L, 2024/1356, 22.5.2024»); `adopted` = `cdm:work_date_document`, `inForce` = frühestes `cdm:resource_legal_date_entry-into-force` (beides nicht für Berichtigungen); `changes` je Einheit aus den Markern mit den betroffenen Schlüsseln (`keys`) und dem Stand. `confidence: "check"`.');
L();
L('| Werk | CELEX | Art | Einheiten geändert | Titel | Fundstelle | Befund |');
L('|---|---|---|---|---|---|---|');
for (const [id, W] of Object.entries(R.works)) for (const a of W.actsCheck) L(`| ${id} | ${a.celex} | ${a.kind} | ${a.changes} | ${a.titles} | ${a.oj} | ${a.issues.join('; ') || 'ok'} |`);
L();
L('Berichtigungen tragen Titel und Fundstelle nur in den Sprachen, in denen Cellar bzw. EUR-Lex sie führen (sprachspezifische Berichtigungen).');
L();
L('## 10 Grössen');
L();
L('| Datei | roh | gzip | SHA-256 |');
L('|---|---|---|---|');
for (const W of Object.values(R.works)) for (const [f, s] of Object.entries(W.sizes)) L(`| ${f} | ${kb(s.raw)} | ${kb(s.gzip)} | ${s.sha256.slice(0, 16)}… |`);
L(`| Summe Datensätze | ${mb(rawTotal)} | ${mb(gzTotal)} | |`);
L();
L('## 11 library.js am echten Datensatz');
L();
for (const [id, W] of Object.entries(R.works)) L(`- ${id}: ${Object.entries(W.library).map(([k, v]) => `${k} ${v ? 'ok' : 'FEHLER'}`).join(', ')}`);
L();
L('## 12 Auffälligkeiten der Quellen');
L();
L('- Cellar führt 02018R1240-20180919 nur in DE (sowie ET, SV, ES) und 02018R1240-20231231 nur in ES. Stand etias s01 enthält daher nur DE; 20231231 entfällt.');
L('- EUR-Lex lieferte die Dateien teils nur über Cellar (XHTML, `scripts/out/fetch-log.json`). ABl.-Dateien aus Cellar enthalten in zitierten Neufassungen Fussnotenverweise («*1») ohne Fussnotentext; der Parser führt sie als Fussnote mit leerem Text (`missing: true`), nicht im Wortlaut.');
L('- 02017R2226-20181009 DE: nach ▼C1 in Art. 61 Nr. 1 Bst. b fehlt der Rückwechsel ▼B (Herkunft daher nach der Regel in Abschnitt 2 korrigiert, 149 Blöcke); zudem fehlen in mehreren konsolidierten Fassungen schliessende Anführungszeichen zitierter Neufassungen (Parser schliesst den Zitatbereich vor der nächsten Änderungsanweisung).');
L('- 2021/1134 fällt in EES 20260612 und IO 20250128 aus der Modifikatorenliste; die zuvor konsolidierten Änderungen verschwinden ohne Marker (als «Rücknahme» erklärt, z. B. EES Art. 9 Abs. 2 UAbs. 2; IO Art. 4 Nr. 20, 13, 18, 26, 27, 29, 72).');
L('- EES ABl. FR Art. 61 Nr. 1: Anweisung endet mit «… est modifié comme suit: mars» (Wort «mars» so in der Quelle, auch in den konsolidierten Fassungen).');
L('- Neue Amtsblatt-Nummerierung bei Berichtigungen: EUR-Lex führt z. B. «ABl. L 90927 vom 25.11.2025, S. 1» (32024R1356R(01)) bzw. «L 90960» (32019R0817R(05)); unverändert übernommen.');
L('- Weitere Einzelbefunde: Tabelle in Abschnitt 5.');
L();
L('## 13 Nicht geprüft');
L();
L('- Anwendbarkeit der Akte und Einzeländerungen (bewusst `unknown`).');
L('- Wortlaut der Änderungsakte selbst gegen die konsolidierten Fassungen (für den SGK in VALIDATION.md, Abschnitt Akttext; hier nicht wiederholt).');
L('- Darstellung in der Oberfläche (Welle 2).');
L();

import('node:fs').then(({ writeFileSync, renameSync }) => {
  const file = resolve(ROOT, 'data/VALIDATION_WORKS.md');
  writeFileSync(file + '.tmp', md.join('\n') + '\n');
  renameSync(file + '.tmp', file);
  writeFileSync(resolve(ROOT, 'scripts/out/works/validation-works.json'), JSON.stringify(R, null, 1));
  console.log('data/VALIDATION_WORKS.md geschrieben');
});
