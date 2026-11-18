// Kartenmodell: Prüfung mit verständlichen Fehlern, Hilfen, Redline-Läufe gegen den ganzen Datensatz, Beispielkarten gegen die Quelle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { validateCard, assertCard, normalizeCard, htmlToRuns, htmlTableToBlock, redlineRuns, runsText, blockIndents, FALLBACK_LABELS } from '../../src/export/model.js';
import { diffText } from '../../src/app/lib/diff.js';
import { fixtures, ROOT, OUT } from './lib.mjs';

const FX = fixtures();
const ds = JSON.parse(readFileSync(join(ROOT, 'data', 'dataset.json'), 'utf8'));
const plain = (html) => runsText(htmlToRuns(html));

test('Beispielkarten sind gültig und decken die verlangten Fälle ab', () => {
  for (const { name, card } of FX) {
    const r = validateCard(card);
    assert.ok(r.ok, `${name}: ${r.errors.join('; ')}`);
    assert.deepEqual(r.warnings, [], name);
  }
  const names = FX.map((x) => x.name);
  for (const n of ['chronology-art8-3a-ii-de', 'chronology-art8-3a-ii-fr', 'chronology-art8-3a-ii-en', 'comparison-art8-s00-s08', 'languages-art8-2a-fr-en', 'long-art8-unit']) assert.ok(names.includes(n), n);
  const langs = new Set(FX.flatMap(({ card }) => [card.textLang, ...(card.columns || []).map((c) => c.lang)].filter(Boolean)));
  assert.deepEqual([...langs].sort(), ['de', 'en', 'fr']);
});

test('Prüfung: verständliche Meldungen mit Pfad', () => {
  const bad = {
    kind: 'chronik', title: ' ', textLang: 'deutsch', uiLang: 'de',
    sections: [{ heading: 'A', color: 'rot', flags: [{ kind: 'x', label: '' }], blocks: [{ depth: 12, runs: [{ t: 3, op: 'add' }, { t: 'x', sup: true, sub: true }] }, { type: 'table' }] }],
    columns: [{ heading: 'alt' }], rows: [{ cells: [null] }], legend: [{ op: 'mod', label: 'x' }],
  };
  const r = validateCard(bad);
  assert.equal(r.ok, false);
  const want = [
    /^kind: unbekannter Wert "chronik" \(erlaubt: chronology, comparison, row, preview\)$/,
    /^title: Pflichtfeld/,
    /^textLang: Pflichtfeld, Sprachcode wie "de" \(ist "deutsch"\)$/,
    /^sections\[0\]\.color: Farbe als "#RRGGBB" \(ist "rot"\)$/,
    /^sections\[0\]\.flags\[0\]\.kind: unbekannter Wert "x"/,
    /^sections\[0\]\.flags\[0\]\.label: Pflichtfeld/,
    /^sections\[0\]\.blocks\[0\]\.depth: ganze Zahl 0–8 \(ist 12\)$/,
    /^sections\[0\]\.blocks\[0\]\.runs\[0\]\.t: muss Text sein \(ist 3\)$/,
    /^sections\[0\]\.blocks\[0\]\.runs\[0\]\.op: unbekannter Wert "add"/,
    /^sections\[0\]\.blocks\[0\]\.runs\[1\]: sup und sub schliessen sich aus$/,
    /^sections\[0\]\.blocks\[1\]\.rows: Tabellen-Block braucht rows$/,
    /^columns: null oder genau zwei Spalten$/,
    /^rows: rows braucht columns mit zwei Spalten$/,
    /^rows\[0\]\.cells: genau zwei Zellen/,
    /^legend\[0\]\.op: nur "ins" oder "del"$/,
  ];
  for (const w of want) assert.ok(r.errors.some((e) => w.test(e)), `fehlt: ${w} in\n${r.errors.join('\n')}`);
  assert.equal(validateCard(null).errors[0], 'card: muss ein Objekt sein');
  assert.throws(() => assertCard(bad), (e) => /^Ungültige Karte: kind:/.test(e.message) && e.errors.length === r.errors.length && /\(\+\d+ weitere\)$/.test(e.message));
  // Warnungen: unbekannte Felder, leere Karte
  const w = validateCard({ kind: 'row', title: 'T', textLang: 'de', uiLang: 'fr', sections: [{ heading: '', blocks: [{ runs: [{ t: 'a', farbe: 'rot' }] }] }] });
  assert.ok(w.ok);
  assert.deepEqual(w.warnings, ['sections[0].blocks[0].runs[0]: unbekannte Felder ignoriert: farbe']);
  assert.deepEqual(validateCard({ kind: 'row', title: 'T', textLang: 'de', uiLang: 'de', sections: [] }).warnings, ['card: weder sections noch rows enthalten Inhalt']);
  // Steuerzeichen im Text
  assert.match(validateCard({ kind: 'row', title: 'T', textLang: 'de', uiLang: 'de', sections: [{ heading: '', blocks: [{ runs: [{ t: 'a\u0007' }] }] }] }).errors[0], /enthält Steuerzeichen/);
});

test('Normalisieren: Vertrag SPEC3 (columns.sectionIndexes) wird zu einer Zeile nebeneinander', () => {
  const card = { kind: 'comparison', title: 'T', textLang: 'de', uiLang: 'de',
    sections: [{ heading: 'alt', blocks: [{ label: 'a)', runs: [{ t: 'x ' }, { t: 'weg', op: 'del' }] }] }, { heading: 'neu', blocks: [{ label: 'a)', runs: [{ t: 'x ' }, { t: 'neu', op: 'ins' }] }] }],
    columns: [{ heading: 'alt', sectionIndexes: [0] }, { heading: 'neu', sectionIndexes: [1] }] };
  assert.ok(validateCard(card).ok);
  const n = normalizeCard(card);
  assert.equal(n.sections.length, 0);
  assert.equal(n.rows.length, 1);
  assert.equal(n.rows[0].cells[0].blocks[0].runs[1].op, 'del');
  assert.equal(n.rows[0].cells[1].blocks[0].runs[1].t, 'neu');
  assert.equal(validateCard({ ...card, columns: [{ heading: 'a', sectionIndexes: [5] }, { heading: 'b' }] }).errors[0], 'columns[0].sectionIndexes: Liste gültiger Abschnittsnummern');
  assert.equal(FALLBACK_LABELS.fr.page, 'Page {i} sur {n}');
});

test('htmlToRuns und htmlTableToBlock', () => {
  assert.deepEqual(htmlToRuns('a <b>fett</b> <i>k</i>x<sup>2</sup><br>&laquo;&nbsp;b&raquo; <ins>neu</ins><del>alt</del>'), [
    { t: 'a ' }, { t: 'fett', b: true }, { t: ' ' }, { t: 'k', i: true }, { t: 'x' }, { t: '2', sup: true }, { t: '\n«\u00A0b» ' }, { t: 'neu', op: 'ins' }, { t: 'alt', op: 'del' },
  ]);
  const tbl = ds.units.anx_IX.versions.de[0].blocks.find((b) => b.ty === 'table');
  const b = htmlTableToBlock(tbl.html, { key: tbl.k });
  assert.ok(validateCard({ kind: 'row', title: 'T', textLang: 'de', uiLang: 'de', sections: [{ heading: '', blocks: [b] }] }).ok);
  assert.equal(b.rows.length, 8);
  // Wortlaut der Tabelle vollständig (Leerraum ignoriert)
  const sq = (s) => s.replace(/\s+/g, '');
  assert.equal(sq(b.rows.map((r) => r.cells.map((c) => runsText(c.runs)).join('')).join('')), sq(tbl.t));
});

test('blockIndents: Zeichen hängend, Unterabsatz bündig mit dem Text der Elternstufe', () => {
  const m = { step: 10, hang: (l) => l.length * 4 };
  const r = blockIndents([{ label: '(1)', depth: 0 }, { label: '', depth: 0 }, { label: 'a)', depth: 1 }, { label: 'iii)', depth: 2 }, { label: '', depth: 1 }], m);
  assert.deepEqual(r, [{ left: 12, hang: 12 }, { left: 0, hang: 0 }, { left: 22, hang: 10 }, { left: 38, hang: 16 }, { left: 12, hang: 0 }]);
});

test('Redline-Läufe: für jede Änderung im Datensatz ergibt «annehmen» die neue und «ablehnen» die alte Fassung (zeichengenau)', () => {
  let pairs = 0, fallback = 0;
  const bad = [];
  for (const [uid, u] of Object.entries(ds.units)) {
    for (const [lang, vs] of Object.entries(u.versions)) {
      for (let i = 1; i < vs.length; i++) {
        const prev = new Map((vs[i - 1].blocks || []).map((b) => [b.k, b]));
        for (const b of vs[i].blocks || []) {
          const p = prev.get(b.k);
          if (!p || p.t === b.t || b.ty === 'table' || b.ty === 'img') continue;
          pairs++;
          const d = diffText(p.t, b.t);
          const runs = redlineRuns(d.oldHtml, d.newHtml, d.redline);
          const neu = runsText(runs, 'new'), alt = runsText(runs, 'old');
          if (neu !== plain(b.t) || alt !== plain(p.t)) { fallback++; if (bad.length < 5) bad.push(`${uid} ${lang} ${b.k}`); }
        }
      }
    }
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'redline-dataset.txt'), `Blockpaare mit geändertem Wortlaut (alle Einheiten, DE/FR/EN): ${pairs}; Abweichungen: ${fallback}${bad.length ? ' (' + bad.join(', ') + ')' : ''}\n`);
  assert.ok(pairs > 200, `nur ${pairs} Paare`);
  assert.equal(fallback, 0, bad.join(', '));
});

test('Beispielkarten: Wortlaut zeichengenau aus dem Datensatz', () => {
  const ver = (unit, lang, st) => { const ord = ds.stages.find((s) => s.id === st).order; return ds.units[unit].versions[lang].filter((v) => ds.stages.find((s) => s.id === v.stage).order <= ord).pop(); };
  // Vergleich ganzer Artikel: links = s00, rechts = s08, je Schlüssel
  const cmp = FX.find((x) => x.name === 'comparison-art8-s00-s08').card;
  const A = new Map(ver('art_8', 'de', 's00').blocks.map((b) => [b.k, b])), B = new Map(ver('art_8', 'de', 's08').blocks.map((b) => [b.k, b]));
  let n = 0;
  for (const r of cmp.rows) {
    const [L, R] = r.cells;
    const k = (L || R).blocks[0].key;
    if (L) { assert.equal(runsText(L.blocks[0].runs, 'old'), plain(A.get(k).t), `links ${k}`); n++; }
    if (R) { assert.equal(runsText(R.blocks[0].runs, 'new'), plain(B.get(k).t), `rechts ${k}`); n++; }
    assert.equal(!!L, A.has(k)); assert.equal(!!R, B.has(k));
  }
  assert.equal(cmp.rows.length, new Set([...A.keys(), ...B.keys()]).size);
  assert.ok(n > 100);
  // Chronologie Ziff. ii: Abschnitt k «annehmen» = Fassung k, «ablehnen» = Fassung k-1
  for (const l of ['de', 'fr', 'en']) {
    const card = FX.find((x) => x.name === `chronology-art8-3a-ii-${l}`).card;
    const hist = ds.units.art_8.versions[l].map((v) => v.blocks.find((b) => b.k === 'p3.a.ii')).filter(Boolean);
    const distinct = hist.filter((b, i) => !i || b.t !== hist[i - 1].t);
    assert.equal(card.sections.length, distinct.length, l);
    card.sections.forEach((s, i) => {
      assert.equal(runsText(s.blocks[0].runs, 'new'), plain(distinct[i].t), `${l} ${i} neu`);
      if (i) assert.equal(runsText(s.blocks[0].runs, 'old'), plain(distinct[i - 1].t), `${l} ${i} alt`);
    });
  }
});
