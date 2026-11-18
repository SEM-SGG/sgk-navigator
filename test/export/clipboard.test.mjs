// Zwischenablage: HTML mit Inline-Styles und reiner Text. Prüfung der Formatierung über LibreOffice (HTML -> DOCX).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { cardToClipboard, cardsToClipboard } from '../../src/export/index.js';
import { normalizeCard, runsText } from '../../src/export/model.js';
import { fixtures, docxParts, docxParagraphs, has, sofficeMany, OUT } from './lib.mjs';

const FX = fixtures();
const DIR = join(OUT, 'clipboard');
mkdirSync(DIR, { recursive: true });
const clip = FX.map(({ name, card }) => ({ name, card, ...cardToClipboard(card) }));
for (const c of clip) {
  writeFileSync(join(DIR, c.name + '.html'), `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>${c.name}</title></head><body>\n${c.html}\n</body></html>\n`);
  writeFileSync(join(DIR, c.name + '.txt'), c.text);
}

const redText = (card, op) => {
  const c = normalizeCard(card);
  const blocks = [...c.sections.flatMap((s) => s.blocks), ...(c.rows || []).flatMap((r) => r.cells.flatMap((x) => (x ? x.blocks : [])))];
  return blocks.flatMap((b) => (b.runs || []).filter((r) => r.op === op).map((r) => r.t)).join(' ');
};
const squash = (s) => s.replace(/[\s\u00A0]+/g, '');
const blockTexts = (card, which) => {
  const c = normalizeCard(card);
  return [...c.sections.flatMap((s) => s.blocks), ...(c.rows || []).flatMap((r) => r.cells.flatMap((x) => (x ? x.blocks : [])))].map((b) => runsText(b.runs || [], which));
};
/** jeder Block (Lesart which) steht zusammenhängend im Text (Leerraum ignoriert) */
const missingBlocks = (card, which, text) => { const t = squash(text); return blockTexts(card, which).filter((b) => !t.includes(squash(b))); };

test('Zwischenablage: nur Inline-Styles, keine Klassen, kein <style>, kein Skript', () => {
  for (const c of clip) {
    assert.ok(!/<style|<script|class=|<link/i.test(c.html), c.name);
    assert.ok(/<ins style="text-decoration:underline;/.test(c.html) || !redText(c.card, 'ins'), c.name);
    assert.ok(/<del style="text-decoration:line-through;/.test(c.html) || !redText(c.card, 'del'), c.name);
  }
});

test('Zwischenablage: reiner Text mit Redline-Marken, Lesarten neu/alt', () => {
  const c = FX.find((x) => x.name === 'chronology-art8-3a-ii-de').card;
  const marks = cardToClipboard(c).text;
  assert.match(marks, /\[-eingehende Prüfung, ob das Reisedokument Fälschungs- oder Verfälschungsmerkmale aufweist;-\]\{\+Überprüfung, ob dem Reisedokument/);
  assert.match(marks, /\{\+, die erforderliche Reisegenehmigung\+\}/);
  const neu = cardToClipboard(c, { textRedline: 'new' }).text;
  assert.ok(neu.includes('gegebenenfalls das erforderliche Visum, die erforderliche Reisegenehmigung oder der erforderliche Aufenthaltstitel beigefügt ist;'));
  assert.ok(!/\[-|\{\+/.test(neu));
  const alt = cardToClipboard(c, { textRedline: 'old' }).text;
  assert.ok(!alt.includes('Reisegenehmigung'));
  // Text enthält jeden Wortlaut der Karte
  for (const x of FX) assert.deepEqual(missingBlocks(x.card, 'new', cardToClipboard(x.card, { textRedline: 'new' }).text), [], x.name);
  for (const x of FX) assert.deepEqual(missingBlocks(x.card, 'old', cardToClipboard(x.card, { textRedline: 'old' }).text), [], x.name);
  const both = cardsToClipboard(FX.map((x) => x.card));
  assert.ok(both.html.length > clip.reduce((a, x) => a + x.html.length, 0));
});

test('Zwischenablage: LibreOffice übernimmt Unterstreichung und Durchstreichung (HTML -> DOCX)', { skip: !has('soffice') && 'soffice fehlt', timeout: 600000 }, () => {
  const files = clip.map((c) => join(DIR, c.name + '.html'));
  const out = sofficeMany(files, 'docx:MS Word 2007 XML', join(DIR, 'docx'), { infilter: 'HTML (StarWriter)' });
  const report = [];
  out.forEach((f, i) => {
    const c = clip[i];
    const paras = docxParagraphs(docxParts(new Uint8Array(readFileSync(f)))['word/document.xml']);
    const runs = paras.flatMap((p) => p.runs);
    const u = squash(runs.filter((r) => r.u).map((r) => r.t).join(''));
    const s = squash(runs.filter((r) => r.s).map((r) => r.t).join(''));
    const wantU = squash(redText(c.card, 'ins')), wantS = squash(redText(c.card, 'del'));
    // Legende «eingefügt»/«gestrichen» ist ebenfalls formatiert
    const legU = squash((c.card.legend || []).filter((l) => l.op === 'ins').map((l) => l.label).join(''));
    const legS = squash((c.card.legend || []).filter((l) => l.op === 'del').map((l) => l.label).join(''));
    report.push(`${c.name}: unterstrichen ${u.length} Zeichen (erwartet ${wantU.length + legU.length}), durchgestrichen ${s.length} (erwartet ${wantS.length + legS.length}), Absätze ${paras.length}`);
    assert.equal(u, wantU + legU, `${c.name}: Unterstreichung`);
    assert.equal(s, wantS + legS, `${c.name}: Durchstreichung`);
    // Gesamttext vorhanden
    const all = paras.map((p) => p.all).join('\n');
    assert.deepEqual(missingBlocks(c.card, 'all', all), [], `${c.name}: Text`);
  });
  writeFileSync(join(DIR, 'docx', 'report.txt'), report.join('\n') + '\n');
});
