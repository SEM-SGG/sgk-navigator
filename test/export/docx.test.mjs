// Word-Baustein: Struktur, Formatierung, Änderungsverfolgung; LibreOffice: Öffnen, Seiten rendern, «alle annehmen/ablehnen».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { cardToDocx, cardsToDocx } from '../../src/export/index.js';
import { normalizeCard, runsText } from '../../src/export/model.js';
import { fixtures, docxParts, docxParagraphs, docxText, expectedBlockParas, LEGAL_STYLES, has, sofficeMany, xmlWellFormed, renderPages, pdftotext, coverage, cardText, OUT, ROOT } from './lib.mjs';

const FX = fixtures();
const OPTS = { date: '2026-11-12', author: 'SGK-Navigator Test' };
const DIR = join(OUT, 'docx');
mkdirSync(DIR, { recursive: true });
const files = {};
for (const { name, card } of FX) for (const mode of ['format', 'tracked']) {
  const bytes = cardToDocx(card, { ...OPTS, redline: mode });
  const f = join(DIR, `${name}.${mode}.docx`);
  writeFileSync(f, bytes);
  files[`${name}.${mode}`] = { f, bytes, card, mode, name };
}

const REQUIRED = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/_rels/document.xml.rels', 'word/styles.xml', 'word/settings.xml', 'docProps/core.xml', 'docProps/app.xml'];

test('DOCX: ZIP, Pflichtteile, wohlgeformtes XML, Beziehungen, keine Kopf-/Fusszeilen', () => {
  for (const [k, { bytes }] of Object.entries(files)) {
    assert.equal(bytes[0], 0x50); assert.equal(bytes[1], 0x4b);
    const parts = docxParts(bytes);
    for (const r of REQUIRED) assert.ok(parts[r], `${k}: ${r} fehlt`);
    for (const [n, x] of Object.entries(parts)) xmlWellFormed(`${k}/${n}`, x);
    // jede Override-Angabe zeigt auf einen vorhandenen Teil, jeder XML-Teil hat einen Inhaltstyp
    const ct = parts['[Content_Types].xml'];
    for (const m of ct.matchAll(/PartName="\/([^"]+)"/g)) assert.ok(parts[m[1]], `${k}: Content-Type für fehlenden Teil ${m[1]}`);
    for (const m of parts['word/_rels/document.xml.rels'].matchAll(/Target="([^"]+)"/g)) assert.ok(parts['word/' + m[1]], `${k}: Beziehung auf fehlenden Teil ${m[1]}`);
    assert.ok(!Object.keys(parts).some((p) => /header|footer|numbering/.test(p)), `${k}: Kopf-/Fusszeilen oder Nummerierung vorhanden`);
    assert.ok(!/headerReference|footerReference/.test(parts['word/document.xml']));
    // nur Arial (LibreOffice: Liberation Sans), A4 hoch
    const fonts = new Set([...Object.values(parts).join('').matchAll(/<w:rFonts ([^>]*)\/>/g)].flatMap((m) => [...m[1].matchAll(/="([^"]+)"/g)].map((x) => x[1])));
    assert.deepEqual([...fonts], ['Arial'], `${k}: Schriften ${[...fonts]}`);
    assert.match(parts['word/document.xml'], /<w:pgSz w:w="11906" w:h="16838"\/>/);
  }
});

test('DOCX: gleiche Eingabe, gleiche Bytes', () => {
  for (const { bytes, card, mode } of Object.values(files)) assert.deepEqual(cardToDocx(card, { ...OPTS, redline: mode }), bytes);
});

test('DOCX «format»: eingefügt unterstrichen, gestrichen durchgestrichen, Text vollständig', () => {
  for (const [k, { bytes, card, mode }] of Object.entries(files)) {
    if (mode !== 'format') continue;
    const paras = docxParagraphs(docxParts(bytes)['word/document.xml']);
    assert.ok(paras.every((p) => p.ins === 0 && p.del === 0), `${k}: Überarbeitungen im Modus format`);
    const legal = paras.filter((p) => LEGAL_STYLES.has(p.style)).map((p) => p.all);
    assert.deepEqual(legal, expectedBlockParas(card, 'all', 'format'), `${k}: Rechtstext-Absätze`);
    // Formatierung je Lauf: Text der unterstrichenen Läufe = eingefügter Text, durchgestrichen = gestrichen
    const c = normalizeCard(card);
    const blocks = [...c.sections.flatMap((s) => s.blocks), ...(c.rows || []).flatMap((r) => r.cells.flatMap((x) => (x ? x.blocks : [])))];
    const want = (op) => blocks.flatMap((b) => (b.runs || []).filter((r) => r.op === op).map((r) => r.t)).join('');
    const legalRuns = paras.filter((p) => LEGAL_STYLES.has(p.style)).flatMap((p) => p.runs);
    assert.equal(legalRuns.filter((r) => r.u).map((r) => r.t).join(''), want('ins').replace(/\n/g, ''), `${k}: unterstrichen ≠ eingefügt`);
    assert.equal(legalRuns.filter((r) => r.s).map((r) => r.t).join(''), want('del').replace(/\n/g, ''), `${k}: durchgestrichen ≠ gestrichen`);
  }
});

test('DOCX «tracked»: w:ins/w:del mit Autor und Datum; annehmen = neu, ablehnen = alt', () => {
  let nIns = 0, nDel = 0;
  for (const [k, { bytes, card, mode }] of Object.entries(files)) {
    if (mode !== 'tracked') continue;
    const xml = docxParts(bytes)['word/document.xml'];
    for (const m of xml.matchAll(/<w:(ins|del) ([^>]*)>/g)) {
      assert.match(m[2], /w:author="SGK-Navigator Test"/, k);
      assert.match(m[2], /w:date="2026-11-12T00:00:00Z"/, k);
      assert.match(m[2], /w:id="\d+"/, k);
      if (m[1] === 'ins') nIns++; else nDel++;
    }
    const ids = [...xml.matchAll(/<w:(?:ins|del) w:id="(\d+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length, `${k}: Revisions-IDs eindeutig`);
    assert.ok(!/<w:del [^>]*>(?:(?!<\/w:del>).)*<w:t[ >]/s.test(xml), `${k}: w:t in w:del (muss w:delText sein)`);
    const paras = docxParagraphs(xml);
    const legal = paras.filter((p) => LEGAL_STYLES.has(p.style));
    const isLegal = (p) => LEGAL_STYLES.has(p.style);
    const acc = docxText(paras, 'acc', { list: true, filter: isLegal });
    const rej = docxText(paras, 'rej', { list: true, filter: isLegal });
    assert.deepEqual(acc, expectedBlockParas(card, 'new', 'tracked'), `${k}: angenommen`);
    assert.deepEqual(rej, expectedBlockParas(card, 'old', 'tracked'), `${k}: abgelehnt`);
    // Redline nicht zusätzlich als Formatierung
    assert.ok(!legal.some((p) => p.runs.some((r) => r.u || r.s)), `${k}: Unterstreichung im Modus tracked`);
  }
  assert.ok(nIns > 50 && nDel > 20, `zu wenige Überarbeitungen (${nIns}/${nDel})`);
});

test('DOCX: Sammelkorb mit Seitenumbruch je Karte, IDs über Karten eindeutig', () => {
  const bytes = cardsToDocx(FX.map((x) => x.card), { ...OPTS, redline: 'tracked' });
  writeFileSync(join(DIR, 'sammelkorb.tracked.docx'), bytes);
  const xml = docxParts(bytes)['word/document.xml'];
  assert.equal((xml.match(/<w:pageBreakBefore\/>/g) || []).length, FX.length - 1);
  const ids = [...xml.matchAll(/<w:(?:ins|del) w:id="(\d+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('DOCX: ungültige Karte wird mit verständlicher Meldung abgewiesen', () => {
  assert.throws(() => cardToDocx({ kind: 'x', title: '', sections: [] }), /Ungültige Karte: kind: unbekannter Wert "x".*title: Pflichtfeld/);
});

const LO = has('soffice');

test('LibreOffice: alle DOCX öffnen und als PDF ausgeben, Seiten rendern, Text vorhanden', { skip: !LO && 'soffice fehlt', timeout: 600000 }, () => {
  const list = Object.values(files).map((x) => x.f);
  const pdfs = sofficeMany(list, 'pdf', join(DIR, 'lo'));
  const report = [];
  for (const [i, pdf] of pdfs.entries()) {
    const x = Object.values(files)[i];
    const info = execFileSync('pdfinfo', [pdf], { encoding: 'utf8' });
    const pages = +/Pages:\s+(\d+)/.exec(info)[1];
    assert.match(info, /Page size:\s+595\.\d+ x 841\.\d+/, `${x.name}: A4`);
    const pngs = renderPages(pdf, join(DIR, 'lo', `${x.name}.${x.mode}`), 60);
    assert.equal(pngs.length, pages);
    // Text: im Modus tracked zeigt LibreOffice Eingefügtes und Gestrichenes; Abdeckung über alle Wörter, Reihenfolge egal (Tabellen)
    // Modus tracked: Legende «eingefügt/gestrichen» entfällt (Word zeigt die Überarbeitungen selbst)
    const exp = x.mode === 'tracked' ? { ...x.card, legend: (x.card.legend || []).filter((l) => !l.op) } : x.card;
    const cov = coverage(cardText(exp, 'all', { target: 'docx' }), pdftotext(pdf));
    report.push(`${x.name}.${x.mode}: ${pages} S., Abdeckung ${(cov.anyOrder * 100).toFixed(1)} %`);
    assert.ok(cov.anyOrder >= 0.995, `${x.name}.${x.mode}: Abdeckung ${cov.anyOrder} fehlend: ${cov.missing.slice(0, 10).join(' ')}`);
  }
  writeFileSync(join(DIR, 'lo', 'report.txt'), report.join('\n') + '\n');
});

test('LibreOffice erkennt die Überarbeitungen; «alle annehmen» = neuer, «alle ablehnen» = alter Wortlaut', { skip: !LO && 'soffice fehlt', timeout: 600000 }, () => {
  const tracked = Object.values(files).filter((x) => x.mode === 'tracked');
  const out = execFileSync('/usr/bin/python3', ['-I', join(ROOT, 'test/export/tools/lo-revisions.py'), ...tracked.map((x) => x.f)], { encoding: 'utf8', timeout: 600000, maxBuffer: 1 << 26 });
  const res = JSON.parse(out);
  const report = [];
  for (const x of tracked) {
    const r = res[x.f.replace(/^.*\//, '')];
    const xml = docxParts(x.bytes)['word/document.xml'];
    const nRev = (xml.match(/<w:(?:ins|del) w:id=/g) || []).length;
    const nRuns = (xml.match(/<w:(?:ins|del) w:id="\d+" [^>]*[^/]>/g) || []).length;   // ohne Absatzmarken
    report.push(`${x.name}: Überarbeitungen im XML ${nRev} (davon Läufe ${nRuns}), LibreOffice ${r.redlines} ${JSON.stringify(r.types)}, Autor ${r.author}, Datum ${r.date}`);
    if (nRev === 0) { assert.equal(r.redlines, 0); continue; }
    assert.ok(r.redlines > 0, `${x.name}: LibreOffice erkennt keine Überarbeitungen`);
    assert.equal(r.author, 'SGK-Navigator Test');
    assert.equal(r.date, '2026-11-12');
    assert.equal(r.remaining_accept, false); assert.equal(r.remaining_reject, false);
    const paras = docxParagraphs(xml);
    const norm = (s) => s.replace(/\r/g, '').replace(/\n+/g, '\n').trim();
    assert.equal(norm(r.accepted), norm(docxText(paras, 'acc')), `${x.name}: LibreOffice «alle annehmen» weicht ab`);
    assert.equal(norm(r.rejected), norm(docxText(paras, 'rej')), `${x.name}: LibreOffice «alle ablehnen» weicht ab`);
    // Rechtstext nach Annehmen/Ablehnen enthält jeden neuen bzw. alten Absatz der Karte wörtlich
    for (const p of expectedBlockParas(x.card, 'new', 'tracked')) assert.ok(r.accepted.includes(p), `${x.name}: angenommen fehlt «${p.slice(0, 60)}»`);
    for (const p of expectedBlockParas(x.card, 'old', 'tracked')) assert.ok(r.rejected.includes(p), `${x.name}: abgelehnt fehlt «${p.slice(0, 60)}»`);
  }
  writeFileSync(join(DIR, 'lo', 'revisions.txt'), report.join('\n') + '\n');
});

test('LibreOffice: Rückwandlung nach ODT und DOCX behält die Überarbeitungen', { skip: !LO && 'soffice fehlt', timeout: 600000 }, () => {
  const x = files['comparison-art8-s00-s08.tracked'];
  const [odt] = sofficeMany([x.f], 'odt', join(DIR, 'roundtrip'));
  const content = strFromU8(unzipSync(new Uint8Array(execFileSync('cat', [odt])))['content.xml']);
  const regions = (content.match(/<text:changed-region /g) || []).length;
  const ins = (content.match(/<text:insertion>/g) || []).length, del = (content.match(/<text:deletion>/g) || []).length;
  assert.ok(regions > 0 && ins > 0 && del > 0, `ODT ohne Überarbeitungen (${regions}/${ins}/${del})`);
  const [docx2] = sofficeMany([odt], 'docx:MS Word 2007 XML', join(DIR, 'roundtrip', 'docx'));
  const xml2 = docxParts(new Uint8Array(execFileSync('cat', [docx2])))['word/document.xml'];
  const p1 = docxParagraphs(docxParts(x.bytes)['word/document.xml']), p2 = docxParagraphs(xml2);
  const norm = (s) => s.replace(/\n+/g, '\n').trim();
  assert.equal(norm(docxText(p2, 'acc')), norm(docxText(p1, 'acc')));
  assert.equal(norm(docxText(p2, 'rej')), norm(docxText(p1, 'rej')));
  writeFileSync(join(DIR, 'roundtrip', 'report.txt'), `ODT: ${regions} changed-regions (${ins} insertion, ${del} deletion); DOCX nach Rückwandlung: ${(xml2.match(/<w:ins /g) || []).length} w:ins, ${(xml2.match(/<w:del /g) || []).length} w:del\n`);
});
