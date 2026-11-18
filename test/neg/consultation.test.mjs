// Konsultations-Roundtrip (SPEC2 §5.2): exportieren -> ausfüllen -> einlesen -> identische Zuordnung
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { parseXml } from '../../src/neg/xml.js';
import { createDossier, setPosition, addConsultation, setDecision } from '../../src/neg/model.js';
import { planMerge, applyMerge } from '../../src/neg/merge.js';
import { buildConsultationDocx, parseConsultationDocx, importResponse, aggregateConsultation, consultationRows } from '../../src/neg/consultation.js';
import { buildPositionDocx } from '../../src/neg/outputs.js';
import { editDocx, fillCell, trackChange, addComment, deleteRow, moveRowToEnd, fillGeneral, hasSoffice, soffice, rowsWithId } from './helpers.mjs';

function parsedDoc(texts, meta) {
  return { meta: { kind: 'four-column', ref: meta.ref, date: meta.date, classification: 'limite' }, columns: [{ index: 0, header: 'Council Mandate', suggestedTrack: 'council' }, { index: 1, header: 'Draft Agreement', suggestedTrack: 'agreement' }],
    rows: texts.map(([num, label, a, b]) => ({ num, label, labelSource: 'table', path: { kind: 'other' }, cells: { 0: { html: a, text: a.replace(/<[^>]+>/g, ''), empty: !a }, 1: { html: b, text: b.replace(/<[^>]+>/g, ''), empty: !b } } })), warnings: [] };
}

function fixture() {
  let d = createDossier({ id: 'd-test', title: 'Testdossier', short: 'Test', procedure: '2099/0001(COD)', now: '2026-01-01T00:00:00Z' });
  const p1 = parsedDoc([
    ['1', 'Recital 1', '(1) The Union shall act.', ''],
    ['2', 'Article 1(1)', '1. Member States shall notify the Commission.', '1. Member States shall notify the Commission.'],
    ['3', 'Article 1(2)', '2. The Commission shall publish a <b>list</b>.', ''],
    ['4', 'Article 2', 'This Regulation shall enter into force.', 'This Regulation shall enter into force.'],
  ], { ref: 'WK 1/26', date: '2026-01-10' });
  d = applyMerge(d, planMerge(d, p1, { 0: 'council', 1: 'agreement' }), { now: '2026-01-10T00:00:00Z' }).dossier;
  const p2 = parsedDoc([
    ['1', 'Recital 1', '(1) The Union shall act.', '(1) The Union shall act swiftly.'],
    ['2', 'Article 1(1)', '1. Member States shall notify the Commission.', '1. Member States shall notify the Commission without delay.'],
    ['3', 'Article 1(2)', '2. The Commission shall publish a <b>list</b>.', '2. The Commission shall publish a list.'],
    ['4', 'Article 2', 'This Regulation shall enter into force.', 'This Regulation shall enter into force on the twentieth day.'],
  ], { ref: 'WK 2/26', date: '2026-02-10' });
  d = applyMerge(d, planMerge(d, p2, { 0: 'council', 1: 'agreement' }), { now: '2026-02-10T00:00:00Z' }).dossier;
  const ids = d.rows.map((r) => r.id);
  d = setPosition(d, ids[1], { stance: 'support-with-changes', priority: 'high', text: 'Frist präzisieren.', proposal: 'within five working days' }, { at: '2026-02-11T00:00:00Z' });
  const res = addConsultation(d, { id: 'k1', title: 'Runde 1', deadline: '2026-03-01', lang: 'de', basis: { track: 'agreement', doc: 'doc2', compareTo: 'doc1' }, scope: ids, offices: [{ id: 'o1', abbr: 'A', name: 'Amt A' }, { id: 'o2', abbr: 'B', name: 'Amt B' }], created: '2026-02-12T00:00:00Z' });
  return { d: res.dossier, ids };
}

test('Konsultationsdokument: ZIP, wohlgeformtes XML, Pflichtteile, Kennungen', () => {
  const { d, ids } = fixture();
  const bytes = buildConsultationDocx(d, 'k1', { office: 'o1', zipTime: '2026-01-01T00:00:00Z' });
  const files = unzipSync(bytes);
  for (const p of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels', 'word/footer1.xml', 'docProps/core.xml', 'docProps/custom.xml', 'word/settings.xml', 'docProps/app.xml']) {
    assert.ok(files[p], `Teil ${p} fehlt`);
    assert.doesNotThrow(() => parseXml(strFromU8(files[p])), `XML ${p}`);
  }
  const xml = strFromU8(files['word/document.xml']);
  assert.match(xml, /w:orient="landscape"/);
  assert.match(xml, /<w:tblHeader\/>/);
  assert.equal(rowsWithId(xml).length, ids.length);
  assert.match(xml, /sgk_r\d{6}/);
  assert.match(strFromU8(files['docProps/custom.xml']), /sgkConsultation[\s\S]*k1/);
  assert.match(strFromU8(files['word/footer1.xml']), /Runde k1/);
  assert.doesNotMatch(xml, /ß/);
  // Änderungsmarkierung gegenüber Vorfassung: eingefügtes "without delay" unterstrichen; ohne Vorfassung keine Markierung
  assert.match(xml, /<w:u w:val="single"\/>(<w:lang [^>]*>)?<\/w:rPr><w:t xml:space="preserve">without delay<\/w:t>/);
  assert.match(xml, /<w:t xml:space="preserve">\(1\) The Union shall act swiftly\.<\/w:t>/);
  // deterministisch
  assert.deepEqual(buildConsultationDocx(d, 'k1', { office: 'o1', zipTime: '2026-01-01T00:00:00Z' }), bytes);
});

test('Roundtrip: Zellen, Word-Kommentar, Änderungsverfolgung, gelöschte/umsortierte Zeilen, allgemeine Bemerkungen', () => {
  const { d, ids } = fixture();
  const bytes = buildConsultationDocx(d, 'k1', { office: 'o1' });
  const filled = editDocx(bytes, (ctx) => {
    let x = ctx.get('word/document.xml');
    x = fillCell(x, ids[1], 4, 'Frist fehlt.');
    x = fillCell(x, ids[1], 5, 'within five working days');
    x = fillCell(x, ids[3], 4, 'Inkrafttreten zu früh.');
    x = trackChange(x, ids[2], ' and update it annually');
    x = deleteRow(x, ids[0]);
    x = moveRowToEnd(x, ids[1]);
    x = fillGeneral(x, 'Gesamthaft einverstanden.');
    ctx.set('word/document.xml', x);
    addComment(ctx, ids[3], 'Bitte mit Art. 1 abstimmen.');
  });
  const p = parseConsultationDocx(filled);
  assert.equal(p.consultationId, 'k1');
  assert.equal(p.dossierId, 'd-test');
  const by = (src) => p.items.filter((i) => i.source === src);
  assert.deepEqual(by('cell').map((i) => [i.rowId, i.comment, i.proposal]).sort(), [[ids[1], 'Frist fehlt.', 'within five working days'], [ids[3], 'Inkrafttreten zu früh.', '']].sort());
  assert.equal(by('word-comment').length, 1);
  assert.equal(by('word-comment')[0].rowId, ids[3]);
  assert.equal(by('word-comment')[0].author, 'Prüferin');
  const tc = by('tracked-change');
  assert.equal(tc.length, 1);
  assert.equal(tc[0].rowId, ids[2]);
  assert.match(tc[0].proposal, /and update it annually$/);
  assert.doesNotMatch(tc[0].proposal, /^2\. The/);  // erstes Wort gelöscht
  assert.match(tc[0].proposalHtml, /<s>/);
  assert.equal(p.general, 'Gesamthaft einverstanden.');
  // Import und Aggregation
  let dd = importResponse(d, 'k1', p, { now: '2026-02-20T00:00:00Z' }).dossier;
  const agg = aggregateConsultation(dd, 'k1');
  assert.equal(agg.stats.items, 4);
  assert.equal(agg.stats.open, 4);
  assert.equal(agg.offices.find((o) => o.id === 'o1').items, 4);
  const itemId = agg.rows.find((r) => r.rowId === ids[1]).items[0].itemId;
  dd = setDecision(dd, 'k1', itemId, { decision: 'accepted', reply: 'Übernommen.', at: '2026-02-21T00:00:00Z' });
  const agg2 = aggregateConsultation(dd, 'k1');
  assert.equal(agg2.stats.decided, 1);
  assert.equal(agg2.rows.find((r) => r.rowId === ids[1]).items.find((i) => i.itemId === itemId).decision, 'accepted');
  assert.equal(d.consultations[0].responses.length, 0, 'Eingabe unverändert');
  // Bericht
  const rep = buildPositionDocx(dd, { variant: 'consultation-report', consultationId: 'k1' });
  assert.match(strFromU8(unzipSync(rep)['word/document.xml']), /Übernommen\./);
});

test('Zeilen in anderes Dokument kopiert (ohne Eigenschaften): Zuordnung über sichtbare Kennung', () => {
  const { d, ids } = fixture();
  const bytes = buildConsultationDocx(d, 'k1');
  const filled = editDocx(bytes, (ctx) => {
    ctx.set('word/document.xml', fillCell(ctx.get('word/document.xml'), ids[2], 4, 'Kopierte Zeile.'));
    ctx.set('docProps/custom.xml', '<?xml version="1.0"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties"/>');
  });
  const p = parseConsultationDocx(filled);
  assert.equal(p.consultationId, 'k1', 'aus Fusszeile');
  assert.deepEqual(p.items.map((i) => [i.rowId, i.comment]), [[ids[2], 'Kopierte Zeile.']]);
});

test('Französisch: Rahmentexte FR, Einlesen gleich', () => {
  const { d, ids } = fixture();
  const bytes = buildConsultationDocx(d, 'k1', { lang: 'fr' });
  const xml = strFromU8(unzipSync(bytes)['word/document.xml']);
  assert.match(xml, /Commentaire de l’office/);
  const filled = editDocx(bytes, (ctx) => ctx.set('word/document.xml', fillCell(ctx.get('word/document.xml'), ids[0], 4, 'Remarque.')));
  assert.deepEqual(parseConsultationDocx(filled).items.map((i) => [i.rowId, i.comment]), [[ids[0], 'Remarque.']]);
});

test('LibreOffice: neu gespeicherte Datei liefert identische Zuordnung', { skip: !hasSoffice && 'soffice fehlt', timeout: 240000 }, () => {
  const { d, ids } = fixture();
  const bytes = buildConsultationDocx(d, 'k1', { office: 'o2' });
  const filled = editDocx(bytes, (ctx) => {
    let x = ctx.get('word/document.xml');
    x = fillCell(x, ids[1], 4, 'Kommentar LO.');
    x = fillCell(x, ids[2], 5, 'publish a list annually');
    x = trackChange(x, ids[3], ' on the twentieth day following publication');
    x = fillGeneral(x, 'Allgemein LO.');
    ctx.set('word/document.xml', x);
    addComment(ctx, ids[0], 'Kommentar in Word.', 'Prüfer', 7);
  });
  const direct = parseConsultationDocx(filled);
  const lo = parseConsultationDocx(soffice(filled, 'docx', 'antwort.docx'));
  const norm = (p) => p.items.map((i) => [i.rowId, i.source, i.comment, i.proposal]).sort();
  assert.deepEqual(direct.items.map((i) => i.source).sort(), ['cell', 'cell', 'tracked-change', 'word-comment']);
  assert.deepEqual(norm(lo), norm(direct));
  assert.equal(lo.general, direct.general);
  assert.equal(lo.consultationId, 'k1');
  // PDF-Umwandlung des Exports gelingt (Datei ist für Office lesbar)
  const pdf = soffice(bytes, 'pdf', 'export.docx');
  assert.equal(String.fromCharCode(...pdf.slice(0, 4)), '%PDF');
});

test('consultationRows liefert Daten für Druckansicht', () => {
  const { d, ids } = fixture();
  const rows = consultationRows(d, 'k1', { otherTracks: ['council'] });
  assert.equal(rows.length, ids.length);
  assert.equal(rows[0].diffHtml, '(1) The Union shall act swiftly.');
  assert.match(rows[1].diffHtml, /<ins>without delay<\/ins>/);
  assert.equal(rows[1].position.stance, 'support-with-changes');
  assert.equal(rows[0].others[0].track, 'council');
});
