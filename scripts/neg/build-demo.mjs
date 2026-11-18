// Baut die Beispiel-Dossiers aus amtlich veröffentlichten Dokumenten (raw-neg/, siehe data/NEG_NOTES.md), ergänzt um eine
// klar als FIKTIV gekennzeichnete Demonstration (Positionen, Konsultationsrunde mit "Stelle A (Beispiel)", "Stelle B (Beispiel)").
// Keine realen Positionen der Schweiz, keine Aussagen realer Ämter.
//
// data/neg-demo.json           SGK-Revision 2021/0428(COD). Raster = Vier-Spalten-Tabelle ST 14288/23 (Zeilen und Reihenfolge);
//                              dazu nur eindeutig zugeordnete Absätze aus COM(2021) 891, ST 10426/22 (Ratsmandat) und
//                              ST 6331/24 (endgültiger Kompromisstext). Nicht oder mehrdeutig zugeordnete Absätze werden
//                              übersprungen (Anzahl in note und buildLog).
// data/neg-demo-screening.json Screening 2020/0278(COD): fünf öffentliche Vier-Spalten-Fassungen in zeitlicher Folge.
// data/neg-demo-dtc.json       EU Digital Travel application 2024/0670(COD) (ändert u. a. Art. 2, 8, 8a, 8b SGK, neuer Art. 8ba).
//                              Raster = Drei-Spalten-Tabelle WK 3948/26; dazu eindeutig zugeordnete Absätze aus COM(2024) 670 und
//                              dem Ratsmandat ST 15634/25 sowie der Vier-Spalten-Auszug WK 4049/26 (Art. 3a–3d).
//
// Etappe 3: rows[].amends belegt (annotateAmends: aus der Vorschau gegen data/dataset.json bzw. Fundstelle auf Ebene Einheit),
// fiktive Delegationshaltungen («Delegation A (Beispiel)» …), eine fiktive Sitzung mit Interventionen der Schweiz (Platzhaltertext),
// ein fiktives Ergebnis. Realen Mitgliedstaaten, Institutionen und der Schweiz werden keine Äusserungen zugeschrieben.
//
// Danach maschinelle Prüfung (checkDossier, auch in test/neg/real.test.mjs): keine Zeile ohne Text, keine zwei Zeilen mit
// gleicher Fundstelle und gleichem Text in derselben Spur, Reihenfolge = Rasterfassung. Abbruch bei Verstoss.
//
// Aufruf: node scripts/neg/build-demo.mjs

import fs from 'node:fs';
import path from 'node:path';
import { DOMParser } from 'linkedom';
import { pdfjs, RAW, ROOT, sha256, parsePdfCached, defaultMapping } from './lib-node.mjs';
import { createDossier, exportDossier, importDossier, setPosition, addConsultation, setDecision, sortedRows, latestCell } from '../../src/neg/model.js';
import { parseProposalHtml } from '../../src/neg/proposal-html.js';
import { parseTextPdf } from '../../src/neg/pdf-text.js';
import { planMerge, applyMerge } from '../../src/neg/merge.js';
import { importResponse } from '../../src/neg/consultation.js';
import { annotateAmends } from '../../src/neg/preview.js';
import { ensureDelegations, addDelegation, addMeeting, setStance, addIntervention, setOutcome } from '../../src/neg/delegations.js';
import { checkDossier } from './check-demo.mjs';

const NOW = '2026-11-12T12:00:00.000Z';
const DATASET = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/dataset.json'), 'utf8'));
const REG = 'https://data.consilium.europa.eu/doc/document/';

function fileMeta(name) {
  const buf = fs.readFileSync(path.join(RAW, name));
  return { name, size: buf.length, sha256: sha256(buf), type: name.split('.').pop() };
}
async function textPdf(name) {
  const p = await parseTextPdf(new Uint8Array(fs.readFileSync(path.join(RAW, name))), { pdfjs });
  p.meta.file = fileMeta(name);
  return p;
}
const fourCol = (name) => parsePdfCached(path.join(RAW, name));

function makeMerger(st) {
  return (parsed, mapping, docMeta, opts = {}) => {
    const plan = planMerge(st.d, parsed, mapping, { docMeta });
    const res = applyMerge(st.d, plan, { now: NOW, ambiguous: 'skip', unmatched: opts.unmatched || 'new' });
    st.d = res.dossier;
    const e = { doc: docMeta.ref, rows: plan.stats.rows, matched: plan.stats.matched, added: plan.stats.new - res.skipped.new, skipped: res.skipped.ambiguous + res.skipped.new };
    st.log.push(e);
    console.log(`${docMeta.ref}: ${e.rows} Zeilen/Absätze, zugeordnet ${e.matched}, neu angelegt ${e.added}, übersprungen ${e.skipped} (mehrdeutig ${res.skipped.ambiguous}, nicht zugeordnet ${res.skipped.new})`);
    return res;
  };
}

function fictitious(d, { picks, scopeExtra, basis, posBasis, ...opts2 }) {
  const rows = sortedRows(d);
  const chosen = [];
  for (const p of picks) {
    const r = rows.find((x) => p.test(x, d) && !chosen.includes(x.id));
    if (!r) continue;
    chosen.push(r.id);
    d = setPosition(d, r.id, {
      stance: p.stance, priority: p.priority,
      text: 'Beispieltext (fiktiv): Hier steht die Kernaussage der Position mit kurzer Begründung.',
      proposal: p.stance === 'support-with-changes' ? 'Example (fictitious): proposed wording in English.' : '',
      fallback: p.priority === 'redline' ? 'Beispiel (fiktiv): Rückfallposition.' : '',
      owner: 'Stelle A (Beispiel)', basis: posBasis,
    }, { at: NOW });
  }
  const scope = chosen.concat(rows.filter(scopeExtra).map((r) => r.id)).filter((v, i, a) => a.indexOf(v) === i);
  d = addConsultation(d, {
    id: 'k1', title: 'Beispielrunde (fiktiv)', deadline: '2026-12-04', lang: 'de', created: NOW, basis, scope,
    offices: [{ id: 'o1', abbr: 'Stelle A', name: 'Stelle A (Beispiel)' }, { id: 'o2', abbr: 'Stelle B', name: 'Stelle B (Beispiel)' }],
  }).dossier;
  const A = { consultationId: 'k1', items: [
    { rowId: scope[0], comment: 'Beispielkommentar: Zustimmung mit redaktioneller Anregung.', proposal: '', source: 'cell' },
    { rowId: scope[1], comment: 'Beispielkommentar: Bitte Tragweite klären.', proposal: 'Example (fictitious): alternative wording.', source: 'cell' },
  ], general: 'Beispielkommentar: allgemeine Bemerkung von Stelle A.', unmatched: [] };
  const B = { consultationId: 'k1', items: [
    { rowId: scope[0], comment: 'Beispielkommentar: Vorbehalt zur vorgeschlagenen Formulierung.', proposal: '', source: 'word-comment', author: 'Stelle B (Beispiel)' },
  ], general: '', unmatched: ['Beispielkommentar ohne Zeilenbezug.'] };
  d = importResponse(d, 'k1', A, { office: 'o1', now: NOW, file: { name: 'Beispiel_Stelle_A.docx', sha256: null } }).dossier;
  d = importResponse(d, 'k1', B, { office: 'o2', now: NOW, file: { name: 'Beispiel_Stelle_B.docx', sha256: null } }).dossier;
  d = setDecision(d, 'k1', 'a1-1', { decision: 'accepted', reply: 'Beispielantwort: übernommen.', applied: true, at: NOW });
  d = setDecision(d, 'k1', 'a1-2', { decision: 'partly', reply: 'Beispielantwort: teilweise übernommen.', at: NOW });
  d.consultations[0].fictitious = true;
  return fictitiousMeeting(d, chosen, opts2);
}

/**
 * Fiktive Delegationen, eine fiktive Sitzung, Haltungen und Interventionen der Schweiz (Platzhaltertexte), ein fiktives Ergebnis.
 * Haltungen nur für die drei fiktiven Delegationen «Delegation A/B/C (Beispiel)»; reale Staaten und Institutionen erhalten keine.
 */
function fictitiousMeeting(d, chosen, { meeting, outcomeDoc }) {
  d = ensureDelegations(d);
  for (const [id, code] of [['bsp-a', 'A'], ['bsp-b', 'B'], ['bsp-c', 'C']]) {
    d = addDelegation(d, { id, kind: 'other', code: `${code} (Bsp.)`, name: { de: `Delegation ${code} (Beispiel)`, fr: `Délégation ${code} (exemple)`, en: `Delegation ${code} (example)` }, at: NOW }).dossier;
  }
  d.delegations.forEach((x) => { if (x.id.startsWith('bsp-')) x.fictitious = true; });
  const m = addMeeting(d, { id: 'm1', date: meeting.date, body: meeting.body, title: 'Beispielsitzung (fiktiv)', docs: meeting.docs, note: 'Fiktive Sitzung zur Demonstration; Haltungen und Interventionen sind erfunden.', at: NOW });
  d = m.dossier;
  d.meetings[0].fictitious = true;
  const S = [
    ['bsp-a', 'support', 'Beispieläusserung (fiktiv): unterstützt den Text.'],
    ['bsp-b', 'reservation', 'Beispieläusserung (fiktiv): Vorbehalt zur Tragweite.'],
    ['bsp-c', 'proposal', 'Beispieläusserung (fiktiv): schlägt eine andere Formulierung vor.'],
  ];
  chosen.slice(0, 3).forEach((rid, i) => {
    for (const [deleg, stance, text] of S.slice(0, 3 - i)) d = setStance(d, rid, { deleg, stance, text, meeting: 'm1', at: NOW, by: 'BSP' }).dossier;
  });
  const R = ['partly', 'taken-up', 'open'];
  chosen.slice(0, 2).forEach((rid, i) => { d = addIntervention(d, { meeting: 'm1', row: rid, text: `Beispielintervention (fiktiv) ${i + 1}: Die Schweiz bringt hier ihr Anliegen ein.`, result: R[i], note: 'Beispiel (fiktiv)', at: NOW, by: 'BSP' }).dossier; });
  d = addIntervention(d, { meeting: 'm1', row: null, text: 'Beispielintervention (fiktiv) ohne Zeilenbezug: allgemeine Bemerkung der Schweiz.', result: 'open', note: '', at: NOW, by: 'BSP' }).dossier;
  d.interventions.forEach((x) => { x.fictitious = true; });
  if (chosen[0] && d.positions[chosen[0]]) d = setOutcome(d, chosen[0], { status: 'partly', note: 'Beispiel (fiktiv): Anliegen teilweise aufgenommen.', doc: outcomeDoc, at: NOW, by: 'BSP' });
  return d;
}

function write(d, file, gridDoc, gridParsed) {
  const errs = checkDossier(d, { gridDoc, gridNums: gridParsed.rows.map((r) => r.num) });
  if (errs.length) { console.error(errs.join('\n')); throw new Error(`${errs.length} Verstösse in ${file}`); }
  const out = path.join(ROOT, 'data', file);
  fs.writeFileSync(out + '.tmp', exportDossier(d, { compact: true }));   // verlustfreie Kurzform
  const back = importDossier(fs.readFileSync(out + '.tmp', 'utf8'));
  if (back.errors.length) throw new Error('Kurzform nicht lesbar: ' + back.errors.join('; '));
  const A = normalize(back.dossier), Bn = normalize(d);
  for (const k of Object.keys(Bn)) if (JSON.stringify(A[k]) !== JSON.stringify(Bn[k])) {
    if (k === 'cells') for (const rid of Object.keys(Bn.cells)) if (JSON.stringify(A.cells[rid]) !== JSON.stringify(Bn.cells[rid])) { console.error(rid, JSON.stringify(Bn.cells[rid]).slice(0, 400), '\n', JSON.stringify(A.cells[rid]).slice(0, 400)); break; }
    throw new Error('Kurzform nicht verlustfrei: ' + k);
  }
  fs.renameSync(out + '.tmp', out);   // atomar
  console.log(`geschrieben: data/${file} (${(fs.statSync(out).size / 1024).toFixed(0)} KB), ${d.rows.length} Zeilen, ${d.documents.length} Dokumente; Prüfung: 0 Verstösse`);
}

// Vergleichsform: leere Zellen ohne html/text, status null, clean abgeleitet
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
function normalize(d) {
  const x = canon(JSON.parse(JSON.stringify(d)));
  for (const byT of Object.values(x.cells)) for (const list of Object.values(byT)) for (const c of list) { if (c.empty) { delete c.html; delete c.text; } c.status = c.status || null; delete c.clean; }
  return canon(x);
}

/** Werke der Bibliothek (data/works/index.json) mit Datensatz; Stand = jüngster Stand mit Datum ≤ date */
function libraryWorks(ids, date) {
  const idx = path.join(ROOT, 'data/works/index.json');
  if (!fs.existsSync(idx)) return [];
  const out = [];
  for (const w of JSON.parse(fs.readFileSync(idx, 'utf8'))) {
    if (!ids.includes(w.id) || !w.dataset) continue;
    const f = path.join(ROOT, 'data/works', w.dataset);
    if (!fs.existsSync(f)) continue;
    const ds = JSON.parse(fs.readFileSync(f, 'utf8'));
    const st = ds.stages.slice().sort((a, b) => a.order - b.order).filter((x) => !x.date || x.date <= date).pop();
    const m = /\((?:EU|EC)\)\s*(?:No\s*)?(\d+\/\d+)/.exec(w.number || '') || /^3(\d{4})R(\d{4})$/.exec(w.celex);
    const act = m && m[2] ? `${m[1]}/${+m[2]}` : m ? m[1] : null;
    if (st && act) out.push({ work: w.id, act, dataset: ds, baseStage: st.id });
  }
  return out;
}

const startsWith = (re) => (r, d) => ['agreement', 'council', 'com'].some((t) => { const c = latestCell(d, r.id, t); return c && !c.empty && re.test(c.text); });

// ------------------------------------------------------------------ 1 SGK-Revision
{
  const st = { d: createDossier({ id: 'd-2021-0428', procedure: '2021/0428(COD)', short: 'SGK-Revision (Beispiel)', title: 'Proposal for a Regulation amending Regulation (EU) 2016/399 on a Union Code on the rules governing the movement of persons across borders', now: NOW }), log: [] };
  const merge = makeMerger(st);
  const grid = await fourCol('ST-14288-2023.pdf');
  merge(grid, defaultMapping(grid), { id: 'doc3', kind: 'four-column', ref: 'ST 14288/23', title: 'Four-column table', date: '2023-10-19', classification: 'public', file: grid.meta.file, source: `${REG}ST-14288-2023-INIT/en/pdf` });
  const com = parseProposalHtml(fs.readFileSync(path.join(RAW, '52021PC0891_EN.html'), 'utf8'), { DOMParser });
  merge(com, { 0: 'com' }, { id: 'doc1', kind: 'proposal', ref: 'COM(2021) 891', title: 'Commission proposal (CELEX 52021PC0891)', date: '2021-12-14', classification: 'public', file: fileMeta('52021PC0891_EN.html'), source: 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:52021PC0891' }, { unmatched: 'skip' });
  const ga = await textPdf('ST-10426-2022.pdf');
  merge(ga, { 0: 'council' }, { id: 'doc2', kind: 'mandate', ref: 'ST 10426/22', title: 'General approach (Council mandate)', date: '2022-06-13', classification: 'public', file: ga.meta.file, source: `${REG}ST-10426-2022-INIT/en/pdf` }, { unmatched: 'skip' });
  const fc = await textPdf('ST-6331-2024.pdf');
  merge(fc, { 0: 'agreement' }, { id: 'doc4', kind: 'compromise', ref: 'ST 6331/24', title: 'Final compromise text with a view to agreement', date: '2024-02-13', classification: 'limite', file: fc.meta.file, note: 'Im öffentlichen Ratsregister abrufbar; Einstufung laut Dokument LIMITE.', source: `${REG}ST-6331-2024-INIT/en/pdf` }, { unmatched: 'skip' });
  let d = st.d;
  d.demo = true;
  const skipped = st.log.slice(1).map((l) => `${l.doc} ${l.skipped} von ${l.rows}`).join(', ');
  d.note = `Beispiel-Dossier. Texte aus amtlich veröffentlichten Dokumenten (EUR-Lex, öffentliches Ratsregister). Raster: Vier-Spalten-Tabelle ST 14288/23. Aus Vorschlag und fortlaufenden Texten nur eindeutig zugeordnete Absätze übernommen; übersprungene Absätze: ${skipped}. Positionen, Konsultation und Kommentare sind FIKTIV und dienen nur der Demonstration.`;
  d.workRef = { act: '2016/399', work: 'sgk' };
  d = fictitious(d, {
    picks: [
      { test: startsWith(/^[‘“'"]?\s*Article 25a\b/), stance: 'support-with-changes', priority: 'high' },
      { test: startsWith(/^[‘“'"]?\s*Article 21a\b/), stance: 'scrutiny', priority: 'medium' },
      { test: startsWith(/^\(1\)\s*In accordance with Article 3\(2\) of the Treaty/), stance: 'support', priority: 'low' },
      { test: startsWith(/^[‘“'"]?\s*Article 23a\b/), stance: 'reservation', priority: 'redline' },
    ],
    scopeExtra: (r) => /^Recital (1|2|3)$/.test(r.label),
    basis: { track: 'agreement', doc: 'doc4', compareTo: 'doc3', compareTrack: 'council' },
    posBasis: { track: 'agreement', doc: 'doc3' },
    meeting: { date: '2023-11-07', body: 'Ratsarbeitsgruppe (Beispiel)', docs: ['doc3'] }, outcomeDoc: 'doc4',
  });
  const am = annotateAmends(d, DATASET, { baseStage: 's06' });   // Stand vor VO (EU) 2024/1717
  d = am.dossier;
  console.log(`amends: aus Vorschau ${am.stats.preview} ${JSON.stringify(am.stats.byWork)}, unbelegte Einträge der Fundstelle verworfen ${am.stats.dropped}`);
  d.updated = NOW;
  d.buildLog = st.log;
  write(d, 'neg-demo.json', 'doc3', grid);
}

// ------------------------------------------------------------------ 2 Screening: fünf Vier-Spalten-Fassungen
{
  const st = { d: createDossier({ id: 'd-2020-0278', procedure: '2020/0278(COD)', short: 'Screening (Beispiel)', title: 'Proposal for a Regulation introducing a screening of third country nationals at the external borders and amending Regulations (EC) No 767/2008, (EU) 2017/2226, (EU) 2018/1240 and (EU) 2019/817', now: NOW }), log: [] };
  const merge = makeMerger(st);
  const series = [
    ['ST-8413-2023', 'ST 8413/23', '2023-04-25', 'public'],
    ['ST-10863-2023', 'ST 10863/23', '2023-06-20', 'limite'],
    ['WK-13716-2023', 'WK 13716/23', '2023-11-03', 'limite'],   // Deckblatt am Dokumentende: Nummer und Datum von Hand
    ['WK-16364-2023', 'WK 16364/23', '2023-12-05', 'limite'],
    ['WK-16999-2023', 'WK 16999/23', '2023-12-16', 'limite'],
  ];
  let first = null;
  for (const [f, ref, date, cls] of series) {
    const p = await fourCol(`${f}.pdf`);
    if (!first) first = p;
    merge(p, defaultMapping(p), { kind: 'four-column', ref, title: 'Four-column table', date, classification: cls, file: p.meta.file, source: `${REG}${f}-INIT/en/pdf`, ...(cls === 'limite' ? { note: 'Im öffentlichen Ratsregister abrufbar; Einstufung laut Dokument LIMITE.' } : {}) });
  }
  let d = st.d;
  d.demo = true;
  d.note = 'Beispiel-Dossier. Fünf öffentliche Vier-Spalten-Fassungen der Screening-Verordnung (öffentliches Ratsregister) in zeitlicher Folge. Positionen, Konsultation und Kommentare sind FIKTIV und dienen nur der Demonstration.';
  const docs = st.d.documents;
  const byLabel = (re) => (r) => re.test(r.label || '');
  d = fictitious(d, {
    picks: [
      { test: byLabel(/^Article 6\(5c\)$/), stance: 'reservation', priority: 'redline' },
      { test: byLabel(/^Article 5$/), stance: 'support-with-changes', priority: 'high' },
      { test: byLabel(/^Recital 19$/), stance: 'scrutiny', priority: 'medium' },
      { test: byLabel(/^Article 1$/), stance: 'support', priority: 'low' },
    ],
    scopeExtra: (r) => /^Recital (1|2)$/.test(r.label),
    basis: { track: 'agreement', doc: docs[4].id, compareTo: docs[3].id },
    posBasis: { track: 'agreement', doc: docs[2].id },
    meeting: { date: '2023-12-12', body: 'Ratsarbeitsgruppe (Beispiel)', docs: [docs[3].id] }, outcomeDoc: docs[4].id,
  });
  // Die Screening-Verordnung ändert nicht den SGK, sondern VIS, EES, ETIAS und Interoperabilität: Vorschau gegen die Werke der
  // Bibliothek (data/works), soweit beim Bau vorhanden, je am Stand zum Datum der ersten Fassung (25.4.2023)
  const works = libraryWorks(['vis', 'ees', 'etias', 'iop'], '2023-04-25');
  console.log(`Werke der Bibliothek für amends: ${works.map((w) => `${w.work} (${w.baseStage})`).join(', ') || 'keine'}`);
  const am = annotateAmends(d, null, { works });
  d = am.dossier;
  console.log(`amends: aus Vorschau ${am.stats.preview} ${JSON.stringify(am.stats.byWork)}, unbelegte Einträge der Fundstelle verworfen ${am.stats.dropped}`);
  d.updated = NOW;
  d.buildLog = st.log;
  write(d, 'neg-demo-screening.json', docs[0].id, first);
}

// ------------------------------------------------------------------ 3 EU Digital Travel application 2024/0670(COD)
{
  const grid = await fourCol('WK-3948-2026.pdf');
  const st = { d: createDossier({ id: 'd-2024-0670', procedure: '2024/0670(COD)', short: 'EU Digital Travel application (Beispiel)', title: (grid.meta.title || '').replace(/\s*-\s*Three column table\s*$/i, '') || 'Proposal for a Regulation establishing an application for the electronic submission of travel data (“EU Digital Travel application”) and amending Regulations (EU) 2016/399 and (EU) 2018/1726', now: NOW }), log: [] };
  const merge = makeMerger(st);
  merge(grid, defaultMapping(grid), { id: 'doc3', kind: 'four-column', ref: 'WK 3948/26', title: 'Three-column table', date: '2026-03-12', classification: 'limite', file: grid.meta.file, note: 'Im öffentlichen Ratsregister abrufbar; Einstufung laut Dokument LIMITE. Drei Spalten: Kommission, EP-Mandat, Ratsmandat.', source: `${REG}WK-3948-2026-INIT/en/pdf` });
  const com = parseProposalHtml(fs.readFileSync(path.join(RAW, '52024PC0670_EN.html'), 'utf8'), { DOMParser });
  merge(com, { 0: 'com' }, { id: 'doc1', kind: 'proposal', ref: 'COM(2024) 670', title: 'Commission proposal (CELEX 52024PC0670)', date: '2024-10-08', classification: 'public', file: fileMeta('52024PC0670_EN.html'), source: 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:52024PC0670' }, { unmatched: 'skip' });
  const man = await textPdf('ST-15634-2025.pdf');
  merge(man, { 0: 'council' }, { id: 'doc2', kind: 'mandate', ref: 'ST 15634/25', title: 'Mandate for negotiations with the European Parliament', date: '2025-11-19', classification: 'public', file: man.meta.file, source: `${REG}ST-15634-2025-INIT/en/pdf` }, { unmatched: 'skip' });
  const w4 = await fourCol('WK-4049-2026.pdf');
  merge(w4, defaultMapping(w4), { id: 'doc4', kind: 'four-column', ref: 'WK 4049/26', title: 'State of play Articles 3a–3d (four-column table)', date: '2026-03-13', classification: 'limite', file: w4.meta.file, note: 'Im öffentlichen Ratsregister abrufbar; Einstufung laut Dokument LIMITE. Nur Art. 3a–3d.', source: `${REG}WK-4049-2026-INIT/en/pdf` }, { unmatched: 'skip' });
  let d = st.d;
  d.demo = true;
  const skipped = st.log.slice(1).map((l) => `${l.doc} ${l.skipped} von ${l.rows}`).join(', ');
  d.note = `Beispiel-Dossier. Texte aus amtlich veröffentlichten Dokumenten (EUR-Lex, öffentliches Ratsregister). Raster: Drei-Spalten-Tabelle WK 3948/26. Aus Vorschlag, Ratsmandat und Vier-Spalten-Auszug WK 4049/26 nur eindeutig zugeordnete Absätze bzw. Zeilen übernommen; übersprungen: ${skipped}. Positionen, Konsultation, Delegationshaltungen, Sitzung und Interventionen sind FIKTIV und dienen nur der Demonstration.`;
  d.workRef = { act: '2016/399', work: 'sgk' };
  const rowText = (re) => (r, dd) => ['council', 'com'].some((t) => { const c = latestCell(dd, r.id, t); return c && !c.empty && re.test(c.clean || c.text); });
  d = fictitious(d, {
    picks: [
      { test: rowText(/^[“‘"']?\s*2g\.\s/), stance: 'support-with-changes', priority: 'high' },
      { test: rowText(/^1\.\s*Persons enjoying the right of free movement under Union law who are/), stance: 'scrutiny', priority: 'medium' },
      { test: rowText(/^[“‘"']?\s*4a\.\s*Alternatively to paragraph 4/), stance: 'reservation', priority: 'redline' },
      { test: rowText(/^\(1\)\s*The carrying out of effective and efficient border checks/), stance: 'support', priority: 'low' },
    ],
    scopeExtra: (r) => /^Recital (1|2)$/.test(r.label),
    basis: { track: 'council', doc: 'doc3', compareTo: 'doc2' },
    posBasis: { track: 'council', doc: 'doc3' },
    meeting: { date: '2026-03-17', body: 'Ratsarbeitsgruppe (Beispiel)', docs: ['doc3', 'doc4'] }, outcomeDoc: 'doc4',
  });
  const am = annotateAmends(d, DATASET, {});   // geltender SGK (jüngster Stand)
  d = am.dossier;
  console.log(`amends: aus Vorschau ${am.stats.preview} ${JSON.stringify(am.stats.byWork)}, unbelegte Einträge der Fundstelle verworfen ${am.stats.dropped}`);
  d.updated = NOW;
  d.buildLog = st.log;
  write(d, 'neg-demo-dtc.json', 'doc3', grid);
}
