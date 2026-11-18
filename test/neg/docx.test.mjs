// Vier-Spalten-DOCX und fortlaufender Text aus Word: selbst erzeugte, strukturell realistische Dateien
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { para, run, table, packageDocx } from '../../src/neg/docx-write.js';
import { parseFourColumnDocx, parseTextDocx } from '../../src/neg/docx-parse.js';
import { detectDocument } from '../../src/neg/detect.js';
import { hasSoffice, soffice } from './helpers.mjs';

const INS = (t) => `<w:ins w:id="77" w:author="Presidency" w:date="2026-01-01T00:00:00Z"><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${t}</w:t></w:r></w:ins>`;
const DEL = (t) => `<w:del w:id="78" w:author="Presidency" w:date="2026-01-01T00:00:00Z"><w:r><w:delText xml:space="preserve">${t}</w:delText></w:r></w:del>`;

/** Vier-Spalten-Tabelle wie aus dem Trilogue Table Editor (mit Fundstellen-Zwischenzeilen) */
function fourColumnDocx({ labels = true } = {}) {
  const head = ['', 'Commission Proposal', 'EP Mandate', 'Council Mandate', 'Draft Agreement'];
  const rows = [{ header: true, cells: head.map((h) => ({ content: para(run(h, { b: true })), fill: '303030' })) }];
  const add = (num, label, cells, fills = []) => {
    if (labels && label) rows.push({ cells: [{ content: para(label), span: 5, fill: 'F4EBE1' }] });
    rows.push({ cells: [{ content: para(num) }, ...cells.map((c, i) => ({ content: c, fill: fills[i] }))] });
  };
  add('1', 'Formula', [para('2099/0001 (COD)'), para('2099/0001 (COD)'), para('2099/0001 (COD)'), para('')]);
  add('8', 'Recital 1', [para('(1) The area without internal border control is an achievement.'), para(run('(1) The area ') + run('without', { b: true, i: true, u: true }) + run(' internal border control is an achievement.')), para('(1) The area without internal border control is an achievement.'), para('(1) The area without internal border control is a major achievement.')], [null, null, null, 'EAF1DD']);
  add('8a', 'Recital 1a', [para(''), para(run('(1a) Member States should cooperate closely.', { b: true, i: true, u: true })), para(''), para('')]);
  add('20', 'Article 1, first paragraph, point (1)', [para('(1) Article 2 is amended as follows:'), para('(1) Article 2 is amended as follows:'), `<w:p><w:r><w:t xml:space="preserve">(1) Article 2 is </w:t></w:r>${DEL('modified')}${INS('amended')}<w:r><w:t xml:space="preserve"> as follows:</w:t></w:r></w:p>`, para('')], [null, null, null, 'FFFF00']);
  add('21', 'Article 1, first paragraph, point (1)(a)', [para('‘27. ‘instrumentalisation’ means a situation;’') + para(run('Footnote-like second paragraph', { i: true })), para('deleted'), para(run('‘27. ‘instrumentalisation’ means a ') + run('specific', { s: true }) + run(' situation;’')), para('')]);
  const body = para('Brussels, 5 March 2026') + para('WK 1234/2026 INIT') + para('LIMITE') + para('Proposal for a REGULATION amending Regulation (EU) 2016/399 – 2099/0001(COD)') + table(rows, { widths: [700, 3400, 3400, 3400, 3400] });
  return packageDocx({ body, landscape: true, footer: run('Four-column table 2099/0001(COD)') });
}

test('parseFourColumnDocx: Spalten, Nummern, Fundstellen, Formatierung, Status, Änderungsverfolgung', () => {
  const bytes = fourColumnDocx();
  const p = parseFourColumnDocx(bytes);
  assert.deepEqual(p.columns.map((c) => [c.header, c.suggestedTrack]), [['Commission Proposal', 'com'], ['EP Mandate', 'ep'], ['Council Mandate', 'council'], ['Draft Agreement', 'agreement']]);
  assert.deepEqual(p.rows.map((r) => r.num), ['1', '8', '8a', '20', '21']);
  assert.deepEqual(p.rows.map((r) => r.labelSource), ['table', 'table', 'table', 'table', 'table']);
  assert.equal(p.rows[1].label, 'Recital 1');
  assert.deepEqual(p.rows[1].path, { kind: 'recital', no: '1' });
  assert.equal(p.rows[1].cells[1].html, '(1) The area <b><i><u>without</u></i></b> internal border control is an achievement.');
  assert.equal(p.rows[1].cells[3].status, 'agreed');
  assert.equal(p.rows[3].cells[3].status, 'provisional');  // gelb (FFFF00) = weitgehend vereinbart
  assert.equal(p.rows[3].cells[2].html, '(1) Article 2 is <s>modified</s><b>amended</b> as follows:');
  assert.equal(p.rows[4].cells[0].html, '‘27. ‘instrumentalisation’ means a situation;’<br><i>Footnote-like second paragraph</i>');
  assert.equal(p.rows[4].cells[2].html, '‘27. ‘instrumentalisation’ means a <s>specific</s> situation;’');
  assert.equal(p.rows[2].cells[0].empty, true);
  assert.equal(p.meta.ref, 'WK 1234/26');
  assert.equal(p.meta.date, '2026-03-05');
  assert.equal(p.meta.classification, 'limite');
  assert.ok(p.warnings.some((w) => w.code === 'tracked-changes'));
  const drop = parseFourColumnDocx(bytes, { deleted: 'drop' });
  assert.equal(drop.rows[3].cells[2].html, '(1) Article 2 is <b>amended</b> as follows:');
  assert.equal(detectDocument({ name: 'x.docx', bytes }).guess.kind, 'four-column');
});

test('parseFourColumnDocx ohne Fundstellen-Zwischenzeilen: Fundstellen abgeleitet', () => {
  const p = parseFourColumnDocx(fourColumnDocx({ labels: false }));
  assert.equal(p.rows.length, 5);
  assert.deepEqual(p.rows.map((r) => r.labelSource), ['derived', 'derived', 'derived', 'derived', 'derived']);
  assert.deepEqual(p.rows[1].path, { kind: 'recital', no: '1' });
  assert.equal(new Set(p.rows.map((r) => r.label)).size, p.rows.length, 'Fundstellen eindeutig (Zeilennummer angehängt)');
});

test('parseFourColumnDocx: von LibreOffice neu gespeicherte Datei liefert dieselben Zeilen', { skip: !hasSoffice && 'soffice fehlt', timeout: 180000 }, () => {
  const bytes = fourColumnDocx();
  const a = parseFourColumnDocx(bytes);
  const b = parseFourColumnDocx(soffice(bytes, 'docx', 'vierspalten.docx'));
  assert.deepEqual(b.rows.map((r) => [r.num, r.label, Object.values(r.cells).map((c) => c.text)]), a.rows.map((r) => [r.num, r.label, Object.values(r.cells).map((c) => c.text)]));
});

test('parseFourColumnDocx: keine Tabelle -> Warnung statt Ausnahme', () => {
  const p = parseFourColumnDocx(packageDocx({ body: para('Nur Text') }));
  assert.equal(p.rows.length, 0);
  assert.ok(p.warnings.some((w) => w.code === 'no-table'));
  const bad = parseFourColumnDocx(new Uint8Array([1, 2, 3]));
  assert.ok(bad.warnings.some((w) => w.code === 'zip-invalid'));
});

test('parseTextDocx: Kompromisstext gliedern (Erwägungsgründe, Artikel, Änderungsbefehle)', () => {
  const ps = [
    'Brussels, 1 April 2026', 'Subject: Proposal for a Regulation amending Regulation (EU) 2016/399 - Presidency compromise text', 'ANNEX',
    'Proposal for a REGULATION', 'THE EUROPEAN PARLIAMENT AND THE COUNCIL OF THE EUROPEAN UNION,', 'Having regard to the Treaty,', 'Whereas:',
    '(1) The area without internal border control is an achievement.', '(2) Member States should cooperate.', 'HAVE ADOPTED THIS REGULATION:', 'Article 1',
    'Regulation (EU) 2016/399 is amended as follows:', '(1) Article 2 is amended as follows:', 'a) point 12 is replaced by the following:', '‘12. ‘border surveillance’ means surveillance;’',
    'Article 2', 'This Regulation shall enter into force on the twentieth day.',
  ].map((t) => para(t)).join('') + `<w:p><w:r><w:t xml:space="preserve">Inserted by tracked change: </w:t></w:r>${INS('new text')}</w:p>`;
  const p = parseTextDocx(packageDocx({ body: ps }));
  const labels = p.rows.map((r) => r.label);
  assert.equal(p.columns[0].suggestedTrack, 'council');
  assert.ok(labels.includes('Recital 2'));
  assert.ok(labels.includes('Article 1, point (1), point (a) › 2016/399 Article 2(12)'));
  const r = p.rows.find((x) => x.label.endsWith('Article 2(12)') && /border surveillance/.test(x.cells[0].text));
  assert.deepEqual(r.amends, { work: 'sgk', unit: 'art_2', key: 'p12' });
  assert.match(p.rows[p.rows.length - 1].cells[0].html, /<b>new text<\/b>$/);
});
