// Tests an echten, amtlich veröffentlichten Dokumenten in raw-neg/ (werden übersprungen, wenn die Dateien fehlen;
// Download siehe scripts/neg/fetch-raw.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DOMParser } from 'linkedom';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseFourColumnPdf } from '../../src/neg/pdf-fourcol.js';
import { parseTextPdf } from '../../src/neg/pdf-text.js';
import { parseProposalHtml } from '../../src/neg/proposal-html.js';
import { detectDocument } from '../../src/neg/detect.js';
import { importDossier, validateDossier } from '../../src/neg/model.js';
import { RAW, rawExists } from './helpers.mjs';

const read = (f) => new Uint8Array(fs.readFileSync(path.join(RAW, f)));

test('Vier-Spalten-PDF, Layout Trilogue Table Editor (WK 4049/26)', { skip: !rawExists('WK-4049-2026.pdf') && 'Rohdaten fehlen' }, async () => {
  const p = await parseFourColumnPdf(read('WK-4049-2026.pdf'), { pdfjs });
  assert.equal(p.meta.layout, 'tte');
  assert.equal(p.meta.procedure, '2024/0670(COD)');
  assert.equal(p.rows.length, 46);   // Zeile 58y ist in der Quelle leer (Warnung empty-row)
  const r = p.rows.find((x) => x.num === '58p');
  assert.equal(r.label, 'Article 3, first paragraph, point (-p)');
  assert.equal(r.cells[3].status, 'agreed');
  assert.match(r.cells[3].html, /<s>Member States<\/s><u>European Union\./);
  assert.deepEqual(p.rows.find((x) => x.num === '58n').cells[3].tags, ['Integration with IT systems']);
});

test('Vier-Spalten-PDF, klassisches Layout mit Zellen über Seitenumbruch und Fussnoten (ST 14288/23)', { skip: !rawExists('ST-14288-2023.pdf') && 'Rohdaten fehlen' }, async () => {
  const p = await parseFourColumnPdf(read('ST-14288-2023.pdf'), { pdfjs });
  assert.equal(p.rows.length, 327);
  assert.equal(p.meta.ref, 'ST 14288/23');
  const r3 = p.rows.find((x) => x.num === '3');
  assert.equal(r3.cells[0].text, 'THE EUROPEAN PARLIAMENT AND THE COUNCIL OF THE EUROPEAN UNION,');
  assert.deepEqual(r3.pages, [2, 3]);
  const r10 = p.rows.find((x) => x.num === '10');
  assert.match(r10.cells[0].html, /<sup>1<\/sup>/);
  const r34a = p.rows.find((x) => x.num === '34a');
  assert.equal(r34a.cells[0].empty, true);
  assert.match(r34a.cells[1].html, /^<b><i><u>\(26a\)/);
});

test('Fortlaufender Text aus PDF (ST 6331/24): Gliederung, Streichungen, Fussnoten', { skip: !rawExists('ST-6331-2024.pdf') && 'Rohdaten fehlen' }, async () => {
  const p = await parseTextPdf(read('ST-6331-2024.pdf'), { pdfjs });
  assert.equal(p.columns[0].suggestedTrack, 'agreement');
  assert.equal(p.meta.classification, 'limite');
  const r = p.rows.find((x) => /^30\. ‘transport hubs’/.test(x.cells[0].text));
  assert.ok(r, 'Begriffsbestimmung 30 als eigene Zeile');
  assert.deepEqual(r.amends, { work: 'sgk', unit: 'art_2', key: 'p30' });
  assert.ok(p.rows.some((x) => /<s>/.test(x.cells[0].html)));
});

test('Kommissionsvorschlag aus EUR-Lex-HTML (52021PC0891)', { skip: !rawExists('52021PC0891_EN.html') && 'Rohdaten fehlen' }, () => {
  const p = parseProposalHtml(fs.readFileSync(path.join(RAW, '52021PC0891_EN.html'), 'utf8'), { DOMParser });
  assert.equal(p.meta.ref, 'COM(2021) 891');
  assert.equal(p.meta.date, '2021-12-14');
  assert.equal(p.rows[0].cells[0].text, '2021/0428 (COD)');
  assert.ok(p.rows.some((r) => r.label === 'Recital 56'));
  assert.ok(!p.rows.some((r) => /EXPLANATORY MEMORANDUM/.test(r.cells[0].text)));
  const r2 = p.rows.find((r) => r.label === 'Recital 2');
  assert.match(r2.cells[0].html, /<br><sup>\d+<\/sup> Regulation \(EU\) 2016\/399/);
});

test('detectDocument an echten Dateien', { skip: !rawExists('ST-14288-2023.pdf') && 'Rohdaten fehlen' }, () => {
  assert.equal(detectDocument({ name: 'ST-14288-2023.pdf', bytes: read('ST-14288-2023.pdf') }).type, 'pdf');
  if (rawExists('52024PC0670_EN.html')) {
    const h = detectDocument({ name: 'x.html', bytes: read('52024PC0670_EN.html') });
    assert.deepEqual([h.type, h.guess.kind, h.guess.ref], ['html', 'proposal', 'COM(2024) 670']);
  }
});

for (const f of ['neg-demo.json', 'neg-demo-screening.json', 'neg-demo-dtc.json']) {
  test(`Beispiel-Dossier data/${f}: schemakonform, keine Dubletten, keine Zeile ohne Text, fiktiver Teil gekennzeichnet`, async () => {
    const { checkDossier } = await import('../../scripts/neg/check-demo.mjs');
    const file = path.resolve(new URL(`../../data/${f}`, import.meta.url).pathname);
    const r = importDossier(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(r.errors, []);
    assert.equal(r.dossier.demo, true);
    assert.deepEqual(validateDossier(r.dossier).errors, []);
    assert.deepEqual(checkDossier(r.dossier), []);
    assert.ok(fs.statSync(file).size < 1.5e6, 'Datei klein');
    const k = r.dossier.consultations[0];
    assert.equal(k.fictitious, true);
    assert.deepEqual(k.offices.map((o) => o.name), ['Stelle A (Beispiel)', 'Stelle B (Beispiel)']);
    for (const resp of k.responses) for (const it of resp.items) assert.match(it.comment, /^Beispielkommentar/);
    for (const p of Object.values(r.dossier.positions)) assert.match(p.text, /fiktiv/);
    assert.match(r.dossier.note, /FIKTIV/);
    // Etappe 3: Haltungen nur fiktiver Delegationen, Sitzung und Interventionen gekennzeichnet, nur amtliche Quellen
    const d = r.dossier;
    const fict = new Set(d.delegations.filter((x) => x.fictitious).map((x) => x.id));
    assert.deepEqual([...fict].sort(), ['bsp-a', 'bsp-b', 'bsp-c']);
    for (const x of d.delegations.filter((y) => y.fictitious)) assert.match(x.name.de, /\(Beispiel\)$/);
    const stances = Object.values(d.stances).flat();
    assert.ok(stances.length >= 3);
    for (const st of stances) { assert.ok(fict.has(st.deleg), `Haltung ${st.id} einer realen Delegation`); assert.match(st.text, /fiktiv/); }
    assert.ok(d.meetings.every((m) => m.fictitious && /fiktiv/.test(m.title)));
    assert.ok(d.interventions.length >= 2 && d.interventions.every((x) => x.fictitious && /fiktiv/.test(x.text)));
    for (const p of Object.values(d.positions)) if (p.outcome) assert.match(p.outcome.note, /fiktiv/);
    for (const doc of d.documents) assert.match(doc.source || '', /^https:\/\/(data\.consilium\.europa\.eu|eur-lex\.europa\.eu)\//);
    assert.ok(d.rows.filter((x) => x.amends).every((x) => x.amends.source === 'preview'));
  });
}
