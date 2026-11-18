// Erzeugt die Testdaten des Moduls Verhandlung (fiktiv, schema-konform):
//   neg-dossier.json   kleines Dossier: 12 Zeilen, 4 Spuren, 3 Fassungen, Positionen, eine Konsultationsrunde mit 2 Rückmeldungen
//   neg-fourcol.docx   selbst erzeugte Vier-Spalten-Tabelle (Word), strukturell wie aus dem Trilogue Table Editor
//   neg-fourcol-2.docx Folgefassung derselben Tabelle (geänderte, neue und vereinbarte Zeilen)
// Aufruf: node test/app/fixtures/make-neg-fixtures.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDossier, validateDossier, setPosition, addConsultation, setDecision } from '../../../src/neg/model.js';
import { para, run, table, packageDocx } from '../../../src/neg/docx-write.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const AT = '2026-11-01T09:00:00.000Z';

// ------------------------------------------------------------------ Dossier
let d = createDossier({ id: 'd-test-0001', title: 'Proposal for a Regulation amending Regulation (EU) 2016/399 (test fixture)', short: 'Testdossier', procedure: '2099/0001(COD)', now: AT });
d.documents = [
  { id: 'doc1', kind: 'proposal', ref: 'COM(2099) 1', title: 'Proposal (fixture)', date: '2099-01-10', classification: 'public', file: null, importedAt: AT, tracks: ['com'], stats: { rows: 12 }, warnings: [], note: '' },
  { id: 'doc2', kind: 'four-column', ref: 'WK 100/99', title: 'Four-column table (fixture)', date: '2099-03-01', classification: 'limite', file: null, importedAt: AT, tracks: ['com', 'ep', 'council', 'agreement'], stats: { rows: 12 }, warnings: [], note: '' },
  { id: 'doc3', kind: 'four-column', ref: 'WK 200/99', title: 'Four-column table, rev. 1 (fixture)', date: '2099-04-15', classification: 'limite', file: null, importedAt: AT, tracks: ['com', 'ep', 'council', 'agreement'], stats: { rows: 12 }, warnings: [], note: '' },
];
const R = [
  ['1', 'Formula', { kind: 'formula' }, 'preamble'],
  ['2', 'Recital 1', { kind: 'recital', no: '1' }, 'recitals'],
  ['3', 'Recital 2', { kind: 'recital', no: '2' }, 'recitals'],
  ['4', 'Recital 3', { kind: 'recital', no: '3' }, 'recitals'],
  ['5', 'Article 1, first paragraph', { kind: 'article', art: '1' }, 'art_1'],
  ['6', 'Article 1, point (1)', { kind: 'article', art: '1', pt: ['1'] }, 'art_1'],
  ['7', 'Article 1, point (1)(a)', { kind: 'article', art: '1', pt: ['1', 'a'] }, 'art_1'],
  ['8', 'Article 1, point (2)', { kind: 'article', art: '1', pt: ['2'] }, 'art_1'],
  ['9', 'Article 1, point (3)', { kind: 'article', art: '1', pt: ['3'] }, 'art_1'],
  ['10', 'Article 2', { kind: 'article', art: '2' }, 'art_2'],
  ['11', 'Article 2, second paragraph', { kind: 'article', art: '2', par: '2' }, 'art_2'],
  ['12', 'Annex I', { kind: 'annex', annex: 'I' }, 'anx_I'],
];
const TXT = [
  '2099/0001 (COD)',
  '(1) The area without internal border control is one of the main achievements of the Union.',
  '(2) Member States should be able to reintroduce border control only as a measure of last resort.',
  '(3) Travellers should be informed in good time about checks at the external borders.',
  'Regulation (EU) 2016/399 is amended as follows:',
  '(1) Article 2 is amended as follows:',
  '(a) point 27 is replaced by the following: ‘27. ‘instrumentalisation of migrants’ means a situation where a third country instigates irregular migratory flows;’',
  '(2) in Article 8, paragraph 3 is replaced by the following:',
  '(3) Article 25 is replaced by the following:',
  'This Regulation shall enter into force on the twentieth day following that of its publication.',
  'It shall apply from [24 months after entry into force].',
  'Standard form for refusal of entry at the border.',
];
d.rows = R.map(([num, label, path, group], i) => ({ id: 'r' + String((i + 1) * 10).padStart(6, '0'), order: (i + 1) * 10, num, label, path, group, amends: i === 6 ? { work: 'sgk', unit: 'art_2' } : i === 7 ? { work: 'sgk', unit: 'art_8', key: 'p3' } : null, createdBy: 'doc1' }));
const cell = (doc, html, status = null) => ({ doc, html, text: html.replace(/<[^>]+>/g, ''), status, empty: !html });
d.cells = {};
d.rows.forEach((r, i) => {
  const base = TXT[i];
  const ep = i === 2 ? '(2) Member States should be able to reintroduce border control <b><i><u>temporarily and</u></i></b> only as a measure of last resort.' : i === 8 ? '' : base;
  const council = i === 1 ? '(1) The area without internal border control is one of the <b>most tangible</b> achievements of the Union.' : base;
  const agr2 = i === 1 ? '(1) The area without internal border control is one of the most tangible achievements of the Union.' : i === 2 ? '(2) Member States should be able to reintroduce border control temporarily and only as a measure of last resort.' : i < 5 ? base : '';
  const agr3 = i === 2 ? '(2) Member States should be able to reintroduce border control temporarily, and only as a measure of last resort, for a limited period.' : i === 9 ? 'This Regulation shall enter into force on the twentieth day following that of its publication in the Official Journal.' : agr2 || (i >= 5 ? base : '');
  d.cells[r.id] = {
    com: [cell('doc1', base), cell('doc2', base), cell('doc3', base)],
    ep: [cell('doc2', ep), cell('doc3', ep)],
    council: [cell('doc2', council), cell('doc3', i === 7 ? '(2) in Article 8, paragraph 3 is <s>replaced</s> <b>amended</b> as follows:' : council)],
    agreement: [cell('doc2', agr2, i < 2 ? 'agreed' : i === 2 ? 'provisional' : null), cell('doc3', agr3, i < 3 ? 'agreed' : i === 7 ? 'open' : i === 9 ? 'provisional' : null)],
  };
});
// Positionen (Bezug: Kompromiss, Fassung doc2 → Zeile 3 und 10 sind danach veraltet)
d = setPosition(d, 'r000030', { stance: 'support-with-changes', priority: 'redline', text: 'Wiedereinführung nur befristet; Befristung im Text verankern.', proposal: 'temporarily and only as a measure of last resort, for a period not exceeding six months', fallback: 'Befristung in einem Erwägungsgrund', owner: 'SEM/SGG', basis: { track: 'agreement', doc: 'doc2' } }, { at: AT });
d = setPosition(d, 'r000020', { stance: 'support', priority: 'medium', text: 'Einverstanden.', owner: 'SEM/SGG', basis: { track: 'agreement', doc: 'doc3' } }, { at: AT });
d = setPosition(d, 'r000080', { stance: 'scrutiny', priority: 'high', text: 'Auswirkungen auf Art. 8 Abs. 3 SGK prüfen.', owner: 'fedpol', basis: { track: 'council', doc: 'doc3' } }, { at: AT });
d = setPosition(d, 'r000100', { stance: 'oppose', priority: 'low', text: 'Frist zu kurz.', owner: 'BJ', basis: { track: 'agreement', doc: 'doc2' } }, { at: AT });
// Konsultationsrunde mit zwei Rückmeldungen
const r1 = addConsultation(d, { id: 'k1', title: 'Ämterkonsultation (Test)', deadline: '2099-05-01', lang: 'de', basis: { track: 'agreement', doc: 'doc3', compareTo: 'doc2' }, scope: ['r000020', 'r000030', 'r000080', 'r000100'], offices: [{ id: 'o1', abbr: 'BJ', name: 'Bundesamt für Justiz' }, { id: 'o2', abbr: 'fedpol', name: 'Bundesamt für Polizei' }], created: AT });
d = r1.dossier;
d.consultations[0].responses = [
  { id: 'a1', office: 'o1', file: { name: 'Antwort_BJ.docx', sha256: null }, importedAt: AT, items: [
    { id: 'a1-1', row: 'r000030', comment: 'Befristung auf sechs Monate unterstützen.', proposal: 'for a period not exceeding six months', source: 'cell' },
    { id: 'a1-2', row: 'r000100', comment: 'Frist von 24 Monaten ist ausreichend.', proposal: '', source: 'cell' },
  ], general: 'Keine weiteren Bemerkungen.', unmatched: [] },
  { id: 'a2', office: 'o2', file: { name: 'Antwort_fedpol.docx', sha256: null }, importedAt: AT, items: [
    { id: 'a2-1', row: 'r000030', comment: 'Vorbehalt: operative Folgen für die Grenzkontrolle klären.', proposal: '', source: 'word-comment', author: 'fedpol' },
  ], general: '', unmatched: ['Bemerkung ohne Zeilenbezug (Test).'] },
];
d = setDecision(d, 'k1', 'a1-1', { decision: 'accepted', reply: 'Übernommen.', at: AT });
d.updated = AT;
const v = validateDossier(d);
if (v.errors.length) throw new Error(v.errors.join('; '));
writeFileSync(join(DIR, 'neg-dossier.json'), JSON.stringify(d, null, 1));

// ------------------------------------------------------------------ Vier-Spalten-Tabelle (Word)
function fourCol(rev) {
  const head = ['', 'Commission Proposal', 'EP Mandate', 'Council Mandate', 'Draft Agreement'];
  const rows = [{ header: true, cells: head.map((h) => ({ content: para(run(h, { b: true })), fill: '303030' })) }];
  const add = (num, label, cells, fills = []) => {
    rows.push({ cells: [{ content: para(label), span: 5, fill: 'F4EBE1' }] });
    rows.push({ cells: [{ content: para(num) }, ...cells.map((c, i) => ({ content: para(c), fill: fills[i] }))] });
  };
  add('1', 'Formula', ['2099/0002 (COD)', '2099/0002 (COD)', '2099/0002 (COD)', '2099/0002 (COD)'], [null, null, null, 'EAF1DD']);
  add('2', 'Recital 1', ['(1) Visa-free travel benefits the Union.', '(1) Visa-free travel benefits the Union and its partners.', '(1) Visa-free travel benefits the Union.', rev ? '(1) Visa-free travel benefits the Union and its partners.' : ''], [null, null, null, rev ? 'EAF1DD' : null]);
  add('3', 'Recital 2', ['(2) The suspension mechanism should be reviewed.', '(2) The suspension mechanism should be strengthened.', '(2) The suspension mechanism should be reviewed and strengthened.', rev ? '(2) The suspension mechanism should be reviewed and strengthened.' : ''], [null, null, null, rev ? 'FFFF00' : null]);
  if (rev) add('3a', 'Recital 2a', ['', '', '', '(2a) The Commission should monitor visa-free regimes closely.'], [null, null, null, 'FFFF00']);
  add('4', 'Article 1, first paragraph', ['Regulation (EU) 2018/1806 is amended as follows:', 'Regulation (EU) 2018/1806 is amended as follows:', 'Regulation (EU) 2018/1806 is amended as follows:', 'Regulation (EU) 2018/1806 is amended as follows:'], [null, null, null, 'EAF1DD']);
  add('5', 'Article 1, point (1)', ['(1) Article 8 is replaced by the following:', '(1) Article 8 is replaced by the following:', '(1) Article 8 is amended as follows:', rev ? '(1) Article 8 is amended as follows:' : '']);
  add('6', 'Article 2', ['This Regulation shall enter into force on the twentieth day.', 'This Regulation shall enter into force on the twentieth day.', 'This Regulation shall enter into force on the twentieth day.', '']);
  const body = para('Brussels, ' + (rev ? '20 May 2099' : '5 March 2099')) + para(rev ? 'WK 2222/2099 INIT' : 'WK 1111/2099 INIT') + para('LIMITE') + para('Proposal for a REGULATION amending Regulation (EU) 2018/1806 – 2099/0002(COD)') + table(rows, { widths: [700, 3400, 3400, 3400, 3400] });
  return packageDocx({ body, landscape: true, footer: run('Four-column table 2099/0002(COD)'), zipTime: new Date('2099-01-01T00:00:00Z') });
}
writeFileSync(join(DIR, 'neg-fourcol.docx'), fourCol(false));
writeFileSync(join(DIR, 'neg-fourcol-2.docx'), fourCol(true));
console.log('neg-dossier.json, neg-fourcol.docx, neg-fourcol-2.docx geschrieben');
