// Parser an den weiteren Werken (Etappe 3): ABl.-Format 2008, konsolidierte Formate, Zitatbereiche, Inline-Streichungen,
// Erwägungsgründe. Setzt die Rohdateien in raw/ voraus (node scripts/build-work.mjs all lädt sie).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from '../../scripts/lib-dom.mjs';
import { parseEurLex, parseRecitals, recitalsSourceText, sourceText } from '../../src/core/parser.js';
import { concatParsed, compareTokens } from '../../scripts/lib-cover.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const RAW = resolve(here, '../../raw');
const file = (c, l) => resolve(RAW, `${c}_${l.toUpperCase()}.html`);
const have = (...cs) => cs.every((c) => ['de', 'fr', 'en'].every((l) => existsSync(file(c, l))));
const parse = (c, l) => parseEurLex(readFileSync(file(c, l), 'utf8'), { DOMParser });
const LANGS = ['de', 'fr', 'en'];

test('ABl. 2008 (VIS): CELEX, Sprache, Datum in allen Sprachen; Abdeckung 100 %', { skip: !have('32008R0767') }, () => {
  for (const l of LANGS) {
    const html = readFileSync(file('32008R0767', l), 'utf8');
    const p = parseEurLex(html, { DOMParser });
    assert.equal(p.kind, 'oj');
    assert.equal(p.celex, '32008R0767', `CELEX ${l} (FR-Kopf «N<sup>o</sup> 767/2008»)`);
    assert.equal(p.lang, l);
    assert.equal(p.date, '2008-08-13');
    assert.equal(p.units.length, 52);
    const r = compareTokens(sourceText(html, { DOMParser, imageText: false }), concatParsed(p));
    assert.equal(r.missing + r.extra, 0, `Abdeckung ${l}: ${JSON.stringify(r.gaps.slice(0, 3))}`);
  }
});

test('Schlüssel je Einheit in DE, FR, EN gleich (VIS ABl. und jüngste Fassung)', { skip: !have('32008R0767', '02008R0767-20260612') }, () => {
  for (const c of ['32008R0767', '02008R0767-20260612']) {
    const by = Object.fromEntries(LANGS.map((l) => [l, parse(c, l)]));
    for (const u of by.de.units) {
      const k = (l) => (by[l].units.find((x) => x.id === u.id) || { blocks: [] }).blocks.map((b) => b.k).join(' ');
      assert.equal(k('fr'), k('de'), `${c} ${u.id} FR`);
      assert.equal(k('en'), k('de'), `${c} ${u.id} EN`);
    }
  }
});

test('Lateinische Suffixe ab undecies (VIS nach 2021/1134) ergeben dieselben Einheiten-Ids in allen Sprachen', { skip: !have('02008R0767-20260612') }, () => {
  const ids = Object.fromEntries(LANGS.map((l) => [l, parse('02008R0767-20260612', l).units.map((u) => u.id).join(' ')]));
  assert.equal(ids.fr, ids.de);
  assert.equal(ids.en, ids.de);
  assert.ok(ids.de.split(' ').includes('art_9j'), 'Art. 9 undecies (FR) = Art. 9j (DE/EN)');
});

test('Zitierte Neufassungen: gleiche Bereiche in ABl. und konsolidierter Fassung, auch ohne schliessendes Anführungszeichen (EES Art. 61)', { skip: !have('32017R2226', '02017R2226-20181009') }, () => {
  for (const l of LANGS) {
    const oj = parse('32017R2226', l).units.find((u) => u.id === 'art_61');
    const co = parse('02017R2226-20181009', l).units.find((u) => u.id === 'art_61');
    assert.equal(co.quotes.regions, oj.quotes.regions, `Zahl der Zitatbereiche ${l}`);
    assert.ok(co.blocks.some((b) => b.k === 'n2' && /^\(?2/.test(b.l)), `Nr. 2 bleibt eigener Punkt ${l}`);
    assert.ok(!co.blocks.some((b) => /^n1\.b\.q[2-9]/.test(b.k)), `Zitat in Nr. 1 Bst. b endet vor Nr. 2 (${l})`);
  }
});

test('Inline-Streichung «►M1 ————— ◄» erscheint nicht im Wortlaut (VIS Art. 19)', { skip: !have('02008R0767-20260612') }, () => {
  for (const l of LANGS) {
    const p = parse('02008R0767-20260612', l);
    for (const u of p.units) for (const b of u.blocks) assert.ok(!/—{3,}|\u0002/.test(b.t), `${l} ${u.id} ${b.k}: ${b.t.slice(0, 80)}`);
  }
  const en = parse('02008R0767-20260612', 'en').units.find((u) => u.id === 'art_19');
  assert.ok(en.blocks.some((b) => /validity is extended, referred to in Articles 10, 13 and 14/.test(b.t)));
});

test('Titel mit Inline-Marker: Herkunft aus dem Marker (VIS Art. 9, 810/2009)', { skip: !have('02008R0767-20100405') }, () => {
  for (const l of LANGS) assert.equal(parse('02008R0767-20100405', l).units.find((u) => u.id === 'art_9').titleOrigin, '32009R0810', l);
});

test('Fussnotenverweis ohne Fussnotentext (Cellar-ABl.): nicht im Wortlaut, als Fussnote mit missing', { skip: !have('32018R1240') }, () => {
  const u = parse('32018R1240', 'de').units.find((x) => x.id === 'art_78');
  const b = u.blocks.find((x) => /Artikel 73 der Verordnung \(EU\) 2018\/1240/.test(x.t));
  assert.ok(b && !/\*1/.test(b.t), b && b.t);
  assert.ok(b.fn && b.fn.some((f) => f.n === '*1' && f.missing === true));
});

test('Erwägungsgründe: alle Basisakte, Abdeckung 100 %, Nummern und Schlüssel in DE/FR/EN gleich', { skip: !have('32016R0399', '32017R2226', '32018R1240', '32008R0767', '32019R0817') }, () => {
  const expect = { '32016R0399': 44, '32017R2226': 60, '32018R1240': 77, '32008R0767': 33, '32019R0817': 84 };
  for (const [c, nRec] of Object.entries(expect)) {
    const keys = {};
    for (const l of LANGS) {
      const html = readFileSync(file(c, l), 'utf8');
      const r = parseRecitals(html, { DOMParser });
      assert.equal(r.recitals.length, nRec, `${c} ${l}`);
      r.recitals.forEach((x, i) => { assert.equal(x.n, i + 1); assert.equal(x.l, `(${i + 1})`); });
      const txt = r.recitals.map((x) => [x.l, x.t, ...x.sub.map((s) => s.l + ' ' + s.t)].join(' ')).join(' ');
      const cmp = compareTokens(recitalsSourceText(html, { DOMParser }), txt);
      assert.equal(cmp.missing + cmp.extra, 0, `${c} ${l}: ${JSON.stringify(cmp.gaps.slice(0, 3))}`);
      keys[l] = r.recitals.map((x) => [x.k, ...x.sub.map((s) => s.k)].join(',')).join(' ');
    }
    assert.equal(keys.fr, keys.de, c);
    assert.equal(keys.en, keys.de, c);
  }
});
