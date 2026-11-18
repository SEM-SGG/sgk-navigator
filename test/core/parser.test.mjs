import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '../../scripts/lib-dom.mjs';
import { parseEurLex, classifyLabel } from '../../src/core/parser.js';
import { existsSync } from 'node:fs';
import { parseRaw, LANGS, rawPath } from '../../scripts/build-data.mjs';

// Tests mit den Quelldateien in raw/ (Datenpflege, nicht im Repo); ohne raw/ übersprungen.
const needRaw = (...celex) => ({ skip: !celex.every((c) => LANGS.every((l) => existsSync(rawPath(c, l)))) && 'raw/ fehlt (Datenpflege, siehe MAINTAINING.md)' });

test('classifyLabel', () => {
  assert.equal(classifyLabel('(3)').seg, 'n3');
  assert.equal(classifyLabel('b bis)').seg, 'ba');
  assert.equal(classifyLabel('iiia)').fam, 'R');
  assert.equal(classifyLabel('—').fam, 'D');
  assert.equal(classifyLabel('1.1.2.').seg, 'n1.n1.n2');
});

test('ABl.-Fassung: Struktur Art. 8 und Anzahl Einheiten', needRaw('32016R0399'), () => {
  for (const lang of LANGS) {
    const p = parseRaw('32016R0399', lang);
    assert.equal(p.kind, 'oj');
    assert.equal(p.units.filter((u) => u.type === 'article').length, 45, lang);
    assert.equal(p.units.filter((u) => u.type === 'annex').length, 10, lang);
    const keys = p.units.find((u) => u.id === 'art_8').blocks.map((b) => b.k);
    for (const k of ['p1', 'p1.s2', 'p2.s4', 'p3.a.i', 'p3.a.vi', 'p3.c.s3', 'p3.h.iii', 'p3.i', 'p8']) assert.ok(keys.includes(k), `${lang} ${k}`);
  }
});

test('Marker: Herkunft ueber CELEX, nicht ueber M-Nummer', needRaw('02016R0399-20240710'), () => {
  const a = parseRaw('02016R0399-20240710', 'de');
  const b = parseRaw('02016R0399-20251012', 'de');
  const m817a = a.modifiers.find((m) => m.celex === '32019R0817').marker;
  const m817b = b.modifiers.find((m) => m.celex === '32019R0817').marker;
  assert.notEqual(m817a, m817b, 'M-Nummern unterscheiden sich zwischen den Fassungen');
  for (const p of [a, b]) assert.equal(p.units.find((u) => u.id === 'art_8').blocks.find((x) => x.k === 'p4a').o, '32019R0817');
});

test('Inline-HTML: keine Marker, keine Links, nur erlaubte Tags', needRaw('02016R0399-20240710'), () => {
  const p = parseRaw('02016R0399-20240710', 'fr');
  for (const u of p.units) for (const b of u.blocks) {
    if (b.ty === 'table') continue;
    assert.ok(!/[▼►◄]/.test(b.t), `${u.id} ${b.k} Marker im Text`);
    const tags = (b.t.match(/<\/?([a-z0-9]+)/g) || []).map((x) => x.replace(/[<\/]/g, ''));
    for (const t of tags) assert.ok(['i', 'b', 'sup', 'sub', 'br'].includes(t), `${u.id} ${b.k} Tag ${t}`);
  }
});

test('Minimal-HTML im neuen konsolidierten Format', () => {
  const html = `<html><body><p class="reference">02016R0399 — DE — 01.01.2030 — 099.001</p>
  <div class="eli-subdivision" id="art_9"><p class="title-article-norm">Artikel 9</p><div class="eli-title"><p class="stitle-article-norm">Test</p></div>
  <p class="modref"><a title="32099R0001: REPLACED" href="x">▼M9</a></p>
  <div class="norm"><span class="no-parag">(1)  </span><div class="norm inline-element"><p class="norm inline-element">Einleitung:</p>
  <div class="grid-container grid-list"><div class="list grid-list-column-1"><span>a) </span></div><div class="grid-list-column-2"><p class="norm">erster Punkt;</p></div></div>
  <div class="grid-container grid-list"><div class="list grid-list-column-1"><span>b) </span></div><div class="grid-list-column-2"><p class="norm">zweiter Punkt.</p></div></div></div></div>
  <p class="norm">Unterabsatz.</p></div></body></html>`;
  const p = parseEurLex(html, { DOMParser });
  assert.equal(p.celex, '02016R0399-20300101');
  const u = p.units[0];
  assert.equal(u.id, 'art_9');
  assert.deepEqual(u.blocks.map((b) => [b.k, b.o]), [['p1', '32099R0001'], ['p1.a', '32099R0001'], ['p1.b', '32099R0001'], ['p1.s2', '32099R0001']]);
});
