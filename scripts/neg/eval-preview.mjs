// Pflichtprüfung der Vorschau (SPEC3 §3.6): endgültigen Kompromisstext ST 6331/24 auf den SGK-Stand vor VO (EU) 2024/1717
// (EN, s06) anwenden und mit dem echten Stand s07 vergleichen. Zwei Eingaben:
//   A  vollständiger Text aus raw-neg/ST-6331-2024.pdf (jeder Absatz eine Zeile; parseTextPdf → applyMerge in leeres Dossier)
//   B  Beispiel-Dossier data/neg-demo.json, Spur agreement, nur Zellen von doc4 (ST 6331/24; dort 264 von 330 Absätzen zugeordnet)
// Vergleich je Einheit und Block: Blöcke über Schlüssel, sonst über Textgleichheit/-ähnlichkeit (Umnummerierung) zugeordnet.
// Klassen der Abweichungen: Einschätzung von Hand in scripts/neg/eval-preview-notes.json (je Einheit/Schlüssel), hier eingelesen.
// Ausgabe: scripts/neg/out/eval-preview.txt / .json.   Aufruf: node scripts/neg/eval-preview.mjs [--detail <unit>]
import fs from 'node:fs';
import path from 'node:path';
import { diffWordsWithSpace } from 'diff';
import { pdfjs, RAW, ROOT, sha256 } from './lib-node.mjs';
import { parseTextPdf } from '../../src/neg/pdf-text.js';
import { createDossier, importDossier } from '../../src/neg/model.js';
import { planMerge, applyMerge } from '../../src/neg/merge.js';
import { buildPreview, cellParagraphs } from '../../src/neg/preview.js';
import { getVersion } from '../../src/core/model.js';
import { normText, similarity } from '../../src/core/text.js';

const OUT = path.join(ROOT, 'scripts/neg/out');
const CACHE = path.join(OUT, 'cache');
const args = process.argv.slice(2);
const detail = args.includes('--detail') ? args[args.indexOf('--detail') + 1] : null;
const ds = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/dataset.json'), 'utf8'));
const notes = fs.existsSync(path.join(ROOT, 'scripts/neg/eval-preview-notes.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/neg/eval-preview-notes.json'), 'utf8')) : {};
const NOW = '2026-11-12T12:00:00.000Z';

/** fortlaufenden Text parsen (zwischengespeichert: Schlüssel Datei + Parser-Quelltext) */
export async function parseTextCached(file) {
  const buf = fs.readFileSync(file);
  const src = ['pdf-text.js', 'pdf-extract.js', 'pdf-fourcol.js', 'paths.js', 'util.js'].map((f) => fs.readFileSync(path.join(ROOT, 'src/neg', f), 'utf8')).join('\n');
  const key = sha256(Buffer.concat([buf, Buffer.from(src)])).slice(0, 24);
  const cf = path.join(CACHE, `${path.basename(file)}.text.${key}.json`);
  if (fs.existsSync(cf)) return JSON.parse(fs.readFileSync(cf, 'utf8'));
  const p = await parseTextPdf(new Uint8Array(buf), { pdfjs });
  p.meta.file = { name: path.basename(file), size: buf.length, sha256: sha256(buf), type: 'pdf' };
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(cf, JSON.stringify(p));
  return p;
}
/** Dossier mit genau einem Dokument, jeder Absatz eine Zeile */
export function dossierFromParsed(parsed, track, docMeta, { id = 'd-eval', title = '' } = {}) {
  let d = createDossier({ id, title, now: NOW });
  const plan = planMerge(d, parsed, { 0: track }, { docMeta });
  d = applyMerge(d, plan, { now: NOW, ambiguous: 'new', unmatched: 'new' }).dossier;
  return d;
}

const plainOf = (t) => String(t || '').replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '');
const N = (t) => normText(plainOf(t).replace(/▌/g, ' '));
const NL = (l) => String(l || '').replace(/[\s.()]/g, '');

/** Blöcke zweier Versionen zuordnen: gierig nach Ähnlichkeit (gleicher Schlüssel +0,15, gleicher Text = 1,2), Schwelle 0,45 */
function align(realBlocks, pvBlocks) {
  const cand = [];
  realBlocks.forEach((r, i) => pvBlocks.forEach((p, j) => {
    const same = N(p.t) === N(r.t);
    const sim = same ? 1.2 : similarity(plainOf(p.t), plainOf(r.t));
    const sc = sim + (p.k === r.k ? 0.15 : 0);
    if (sc >= 0.45 || (p.k === r.k && (r.ty === 'img' || p.ty === 'img'))) cand.push({ i, j, sc });
  }));
  cand.sort((a, b) => b.sc - a.sc || a.i - b.i);
  const ri = new Map(), pj = new Set();
  for (const c of cand) { if (ri.has(c.i) || pj.has(c.j)) continue; ri.set(c.i, c.j); pj.add(c.j); }
  const pairs = realBlocks.map((r, i) => { const j = ri.get(i); const p = j === undefined ? null : pvBlocks[j]; return { r, p, moved: !!p && p.k !== r.k }; });
  const extra = pvBlocks.filter((_, j) => !pj.has(j));
  return { pairs, extra };
}
function classify(pr) {
  if (!pr.p) return 'missing';
  const same = N(pr.p.t) === N(pr.r.t);
  const lab = NL(pr.p.l) === NL(pr.r.l);
  if (same && !pr.moved && lab) return 'identical';
  if (same) return 'renumbered';
  return 'different';
}
function wdiff(a, b) {
  return diffWordsWithSpace(N(a), N(b)).map((x) => (x.added ? `{+${x.value}+}` : x.removed ? `[-${x.value}-]` : x.value)).join('');
}

function evaluate(pv, baseStage, realStage, { ref = null, sourceText = '', useNotes = false, like = null } = {}) {
  const changed = Object.keys(ds.units).filter((u) => getVersion(ds, u, 'en', baseStage) !== getVersion(ds, u, 'en', realStage));
  const unitsAll = [...new Set([...changed, ...Object.keys(pv.units)])].sort((a, b) => Object.keys(ds.units).indexOf(a) - Object.keys(ds.units).indexOf(b));
  const res = { units: [], totals: { units: { realChanged: changed.length, previewTouched: Object.keys(pv.units).length, both: 0, identical: 0, onlyReal: 0, onlyPreview: 0 }, blocks: { real: 0, identical: 0, renumbered: 0, different: 0, missing: 0, extra: 0 }, words: { real: 0, common: 0 } } };
  for (const u of unitsAll) {
    const real = getVersion(ds, u, 'en', realStage);
    const pvv = pv.units[u] ? pv.units[u].previewVersion : getVersion(ds, u, 'en', baseStage);
    const rb = real && !real.repealed ? real.blocks : [];
    const pb = pvv && !pvv.repealed ? pvv.blocks : [];
    const { pairs, extra } = align(rb, pb);
    const counts = { real: rb.length, identical: 0, renumbered: 0, different: 0, missing: 0, extra: extra.length };
    const devs = [];
    for (const pr of pairs) {
      const c = classify(pr);
      counts[c]++;
      if (c !== 'identical') devs.push({ key: pr.r.k, pvKey: pr.p ? pr.p.k : null, kind: c, sim: pr.p ? +similarity(plainOf(pr.p.t), plainOf(pr.r.t)).toFixed(2) : 0, real: plainOf(pr.r.t), preview: pr.p ? plainOf(pr.p.t) : null, label: [pr.r.l, pr.p && pr.p.l], diff: pr.p ? wdiff(pr.p.t, pr.r.t) : null });
      // Wortabdeckung (Wörter des echten Blocks, die im zugeordneten Vorschaublock in gleicher Folge vorkommen)
      const rw = N(pr.r.t).split(' ').filter(Boolean);
      res.totals.words.real += rw.length;
      if (pr.p) res.totals.words.common += diffWordsWithSpace(N(pr.p.t), N(pr.r.t)).filter((x) => !x.added && !x.removed).reduce((n, x) => n + x.value.split(' ').filter(Boolean).length, 0);
    }
    for (const b of extra) devs.push({ key: null, pvKey: b.k, kind: 'extra', preview: plainOf(b.t), label: [null, b.l] });
    const titleSame = N(real && real.title) === N(pvv && pvv.title);
    if (!titleSame) devs.push({ key: '_title', kind: 'title', real: real && real.title, preview: pvv && pvv.title, diff: wdiff(pvv && pvv.title, real && real.title) });
    // Einordnung: 1. Vermerk von Hand (eval-preview-notes.json); 2. sonst automatisch, wenn der Wortlaut der Vorschau im
    // bereinigten Quelltext steht (Vorschau quellentreu) und der echte Wortlaut im Parlamentsstandpunkt ST 9156/24 (C) schon
    // so lautet: Überarbeitung zwischen Kompromisstext und Annahme (Rechts- und Sprachsachverständige)
    const refV = ref && ref.units[u] ? ref.units[u].previewVersion : null;
    const refBlocks = refV && !refV.repealed ? refV.blocks : [];
    for (const dv of devs) {
      const n = useNotes ? (notes[`${u}#${dv.key || dv.pvKey}`] || notes[`${u}#*`]) : null;
      if (n) { dv.class = n.class; dv.why = n.why; continue; }
      if (like) {
        // B: gleiche Abweichung wie in A → gleiche Einordnung; fehlt nur in B → Absatz im Beispiel-Dossier nicht zugeordnet
        const la = (like.units.find((x) => x.unit === u) || { devs: [] }).devs.find((x) => (x.key || x.pvKey) === (dv.key || dv.pvKey) && x.kind === dv.kind && N(x.preview || '') === N(dv.preview || ''));
        if (la && la.class) { dv.class = la.class; dv.why = la.why; continue; }
        if (dv.kind === 'missing' || dv.kind === 'different' || dv.kind === 'renumbered' || dv.kind === 'extra' || dv.kind === 'title') { dv.class = 'demo'; dv.why = 'Absatz von ST 6331/24 im Beispiel-Dossier nicht (eindeutig) zugeordnet bzw. Zeile mit anderer Zellfolge; in A (vollständiger Text) nicht abweichend oder anders'; continue; }
      }
      if (!ref) continue;
      const faithful = dv.preview == null || (sourceText && sourceText.includes(N(dv.preview)));
      dv.faithful = faithful;
      if (dv.kind === 'title') {
        if (refV && N(refV.title) === N(dv.real)) { dv.class = 'redaktionell'; dv.why = 'Titel: im Parlamentsstandpunkt bereits wie im ABl.'; }
        continue;
      }
      const inRef = dv.real != null && refBlocks.some((b) => N(b.t) === N(dv.real));
      const prevInRef = dv.preview != null && refBlocks.some((b) => N(b.t) === N(dv.preview));
      if (faithful && dv.kind !== 'extra' && inRef) { dv.class = 'redaktionell'; dv.why = dv.kind === 'renumbered' ? 'Wortlaut gleich, Nummer/Gliederungszeichen im Parlamentsstandpunkt wie im ABl.' : 'Vorschau quellentreu; Wortlaut im Parlamentsstandpunkt wie im ABl.'; }
      else if (faithful && dv.kind === 'extra' && !prevInRef) { dv.class = 'redaktionell'; dv.why = 'Block der Kompromissfassung, im Parlamentsstandpunkt nicht mehr so vorhanden'; }
    }
    const unitIdentical = counts.identical === counts.real && !extra.length && titleSame;
    const inReal = changed.includes(u), inPv = !!pv.units[u];
    if (inReal && inPv) res.totals.units.both++;
    if (inReal && !inPv) res.totals.units.onlyReal++;
    if (!inReal && inPv) res.totals.units.onlyPreview++;
    if (unitIdentical) res.totals.units.identical++;
    for (const k of Object.keys(counts)) res.totals.blocks[k] += counts[k];
    res.units.push({ unit: u, inReal, inPreview: inPv, identical: unitIdentical, titleSame, counts, devs });
  }
  return res;
}

function report(name, pv, ev, lines) {
  const t = ev.totals;
  lines.push(`== ${name}`);
  lines.push(`Vorschau: ${JSON.stringify(pv.stats)}`);
  lines.push(`Nicht aufgelöst: ${pv.unresolved.length}`);
  for (const u of pv.unresolved) lines.push(`  - ${u.label}: ${u.reason} | ${u.text.slice(0, 120)}`);
  lines.push(`Einheiten: durch 2024/1717 geändert ${t.units.realChanged}, von der Vorschau berührt ${t.units.previewTouched}, beide ${t.units.both}, nur echt ${t.units.onlyReal}, nur Vorschau ${t.units.onlyPreview}; wortgleich (alle Blöcke, Titel) ${t.units.identical}`);
  lines.push(`Blöcke (echter Stand): ${t.blocks.real}; identisch ${t.blocks.identical}, Text gleich aber umnummeriert/Gliederungszeichen ${t.blocks.renumbered}, Text abweichend ${t.blocks.different}, fehlt in Vorschau ${t.blocks.missing}; zusätzlich in Vorschau ${t.blocks.extra}`);
  lines.push(`Wörter (echter Stand, in den zugeordneten Blöcken): ${t.words.real}, davon in der Vorschau in gleicher Folge ${t.words.common} (${(100 * t.words.common / t.words.real).toFixed(1)} %)`);
  const byClass = {};
  for (const u of ev.units) for (const d of u.devs) { const k = d.class || 'unklassiert'; byClass[k] = (byClass[k] || 0) + 1; }
  lines.push(`Abweichungen nach Klasse: ${JSON.stringify(byClass)}`);
  for (const u of ev.units) {
    const c = u.counts;
    lines.push(`-- ${u.unit} ${u.inReal ? 'E' : '-'}${u.inPreview ? 'V' : '-'} ${u.identical ? 'IDENTISCH' : ''} Blöcke ${c.real}: id ${c.identical}, umn ${c.renumbered}, abw ${c.different}, fehlt ${c.missing}, extra ${c.extra}${u.titleSame ? '' : ', Titel abweichend'}`);
    for (const d of u.devs) {
      lines.push(`   ${d.kind.padEnd(10)} ${d.key || '–'} ${d.pvKey && d.pvKey !== d.key ? '(V ' + d.pvKey + ')' : ''} ${d.sim !== undefined ? 'sim ' + d.sim : ''} [${d.class || 'unklassiert'}] ${d.why || ''}`);
      if (detail && (detail === 'all' || detail === u.unit)) {
        if (d.diff) lines.push(`        ${d.diff.slice(0, 1200)}`);
        else lines.push(`        E: ${(d.real || '').slice(0, 400)}\n        V: ${(d.preview || '').slice(0, 400)}`);
        if (d.label && d.label[0] !== d.label[1]) lines.push(`        Label E ${d.label[0]} V ${d.label[1]}`);
      }
    }
  }
}

const lines = [];
const out = {};
// A: vollständiger Text
const parsed = await parseTextCached(path.join(RAW, 'ST-6331-2024.pdf'));
const dA = dossierFromParsed(parsed, 'agreement', { id: 'doc4', kind: 'compromise', ref: 'ST 6331/24', date: '2024-02-13', title: 'Final compromise text' }, { id: 'd-eval-6331', title: 'amending Regulation (EU) 2016/399' });
dA.workRef = { act: '2016/399', work: 'sgk' };
const t0 = Date.now();
const pvA = buildPreview(dA, { track: 'agreement' }, ds, { lang: 'en', baseStage: 's06' });
const msA = Date.now() - t0;
const evA = evaluate(pvA, 's06', 's07');
report(`A  ST 6331/24 vollständig (${parsed.rows.length} Absätze) auf s06, Vergleich mit s07 — ${msA} ms`, pvA, evA, lines);
out.A = { stats: pvA.stats, unresolved: pvA.unresolved, totals: evA.totals, units: evA.units, ms: msA };
// C: Parlamentsstandpunkt erster Lesung (ST 9156/24, nach rechtlich-sprachlicher Überarbeitung) als Vergleichsgrösse
const parsedC = await parseTextCached(path.join(RAW, 'ST-9156-2024.pdf'));
const dC = dossierFromParsed(parsedC, 'ep', { id: 'doc9', kind: 'ep-report', ref: 'ST 9156/24', date: '2024-04-29', title: 'Outcome of the EP first reading' }, { id: 'd-eval-9156', title: 'amending Regulation (EU) 2016/399' });
dC.workRef = { act: '2016/399', work: 'sgk' };
const pvC = buildPreview(dC, { track: 'ep' }, ds, { lang: 'en', baseStage: 's06' });
const evC = evaluate(pvC, 's06', 's07');
const srcA = N(parsed.rows.map((r) => cellParagraphs(r.cells[0].html).map((x) => x.plain).join(' ')).join(' '));
const evA2 = evaluate(pvA, 's06', 's07', { ref: pvC, sourceText: srcA, useNotes: true });
lines.length = 0;
report(`A  ST 6331/24 vollständig (${parsed.rows.length} Absätze) auf s06, Vergleich mit s07 — ${msA} ms`, pvA, evA2, lines);
out.A = { stats: pvA.stats, unresolved: pvA.unresolved, totals: evA2.totals, units: evA2.units, ms: msA };
lines.push('');
report(`C  Vergleichsgrösse: Parlamentsstandpunkt ST 9156/24 (${parsedC.rows.length} Absätze) auf s06, Vergleich mit s07`, pvC, evC, lines);
out.C = { stats: pvC.stats, unresolved: pvC.unresolved, totals: evC.totals, units: evC.units };
// B: Beispiel-Dossier
const demo = importDossier(fs.readFileSync(path.join(ROOT, 'data/neg-demo.json'), 'utf8')).dossier;
const doc4 = demo.documents.find((x) => x.ref === 'ST 6331/24');
const pvB = buildPreview(demo, { track: 'agreement', doc: doc4.id }, ds, { lang: 'en', baseStage: 's06' });
const evB = evaluate(pvB, 's06', 's07', { like: evA2 });
lines.push('');
report(`B  Beispiel-Dossier data/neg-demo.json, Spur agreement, Dokument ${doc4.id} (ST 6331/24) auf s06, Vergleich mit s07`, pvB, evB, lines);
out.B = { stats: pvB.stats, unresolved: pvB.unresolved, totals: evB.totals, units: evB.units };
// D: Beispiel-Dossier 2024/0670(COD) am geltenden SGK (jüngster Stand), je Spur
const dtcFile = path.join(ROOT, 'data/neg-demo-dtc.json');
if (fs.existsSync(dtcFile)) {
  const dtc = importDossier(fs.readFileSync(dtcFile, 'utf8')).dossier;
  lines.push('');
  lines.push(`== D  Beispiel-Dossier data/neg-demo-dtc.json (2024/0670(COD)) am geltenden SGK`);
  out.D = {};
  for (const [track, doc] of [['com', null], ['ep', null], ['council', 'doc2'], ['council', null]]) {
    const t1 = Date.now();
    const pv = buildPreview(dtc, { track, ...(doc ? { doc } : {}) }, ds, { lang: 'en' });
    const ms = Date.now() - t1;
    const ch = { insert: 0, replace: 0, delete: 0 };
    for (const u of Object.values(pv.units)) for (const c of u.changes) ch[c.action] = (ch[c.action] || 0) + 1;
    const ref = doc ? (dtc.documents.find((x) => x.id === doc) || {}).ref : 'jüngste Zelle je Zeile';
    lines.push(`-- Spur ${track} (${ref}), Stand ${pv.base}, ${ms} ms: Anweisungen ${pv.stats.instructions} (davon andere Akte ${pv.stats.otherAct}), angewandt ${pv.stats.applied}, nicht aufgelöst ${pv.stats.unresolved}; Einheiten ${Object.keys(pv.units).join(', ')}; Blockänderungen ${JSON.stringify(ch)}`);
    for (const u of pv.unresolved) lines.push(`     nicht aufgelöst: ${u.label} | ${u.reason} | ${u.text.slice(0, 120)}`);
    out.D[`${track}${doc ? ':' + doc : ''}`] = { base: pv.base, stats: pv.stats, units: Object.keys(pv.units), changes: ch, unresolved: pv.unresolved, ms };
  }
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'eval-preview.txt'), lines.join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'eval-preview.json'), JSON.stringify(out, null, 1));
console.log(lines.join('\n'));
