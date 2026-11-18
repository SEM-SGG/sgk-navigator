// Tests Verweisnetz (node --test test/core)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractRefs, buildRefIndex, linkifyHtml, unlinkHtml, plainText, refId, celexOf, amendedActOf } from '../../src/core/refs.js';
import { getVersion } from '../../src/core/model.js';

const here = dirname(fileURLToPath(import.meta.url));
const data = (f) => resolve(here, '../../data', f);
const ds = JSON.parse(readFileSync(process.env.SGK_DATASET || data('dataset.json'), 'utf8'));
const LANGS = ['de', 'fr', 'en'];
const SGK = '32016R0399';
const LAST = ds.stages.slice().sort((a, b) => a.order - b.order).pop().id;

// Kontext wie in buildRefIndex
function ctxFor(unit, key, lang, stage = LAST, extra = {}) {
  const keysOf = (u) => { const v = getVersion(ds, u, lang, stage); return new Set(v && !v.repealed ? v.blocks.map((b) => b.k) : []); };
  return { work: SGK, unit, key, unitType: ds.units[unit] ? ds.units[unit].type : 'article', keysOf, toc: ds.toc, tocIds: new Set(ds.toc.map((e) => e.id)), ...extra };
}
const T = (refs) => refs.map((r) => (r.uncertain ? '?' : '') + (r.targets || [r.target]).map((t) => refId(t) + (t.provision ? ':' + t.provision.unit + '#' + (t.provision.key || '') : '')).join('+'));

test('celexOf: Nummernformen', () => {
  assert.equal(celexOf('R', '2017', '2226', false), '32017R2226');
  assert.equal(celexOf('R', '767', '2008', true), '32008R0767');
  assert.equal(celexOf('R', '1683', '95', true), '31995R1683');
  assert.equal(celexOf('L', '2004', '38', false), '32004L0038');
});

test('extractRefs DE: Muster der Spezifikation', () => {
  const c = ctxFor('art_6', 'p1.f.ii', 'de');
  assert.deepEqual(T(extractRefs('gemäß Artikel 8 Absatz 3 Buchstabe a', 'de', c)), ['art_8#p3.a']);
  assert.deepEqual(T(extractRefs('nach den Artikeln 6 und 7', 'de', c)), ['art_6#', 'art_7#']);
  assert.deepEqual(T(extractRefs('die Artikel 23 bis 28', 'de', c)), ['art_23#+art_23a#+art_24#+art_25#+art_25a#+art_26#+art_27#+art_27a#+art_28#']);
  assert.deepEqual(T(extractRefs('Absatz 2 dieses Artikels', 'de', ctxFor('art_8', 'p4', 'de'))), ['art_8#p2']);
  assert.deepEqual(T(extractRefs('gemäß Anhang VII Nummer 6', 'de', c)), ['anx_VII#n6']);
  assert.deepEqual(T(extractRefs('nach Titel III', 'de', c)), ['tit_III#']);
  assert.deepEqual(T(extractRefs('Artikel 12 der Verordnung (EU) 2017/2226', 'de', c)), ['32017R2226:art_12#']);
  assert.deepEqual(T(extractRefs('im Sinne der Richtlinie 2004/38/EG', 'de', c)), ['32004L0038']);
  assert.deepEqual(T(extractRefs('Verordnung (EG) Nr. 767/2008', 'de', c)), ['32008R0767']);
  // Rückbezug «der genannten Verordnung»
  assert.deepEqual(T(extractRefs('nach Artikel 69 Absatz 1 der Verordnung (EU) 2019/817 … nach Artikel 72 Absatz 4 der genannten Verordnung', 'de', c)),
    ['32019R0817:art_69#p1', '32019R0817:art_72#p4']);
  // Funktionswort «in» ist kein Buchstabe
  assert.deepEqual(T(extractRefs('in Artikel 16 Absatz 2 Buchstaben a und b und in Artikel 18 Absatz 6 Buchstabe d der Verordnung (EU) 2017/2226', 'de', c)),
    ['32017R2226:art_16#p2.a', '32017R2226:art_16#p2.b', '32017R2226:art_18#p6.d']);
});

test('extractRefs FR und EN: gleiche Ziele', () => {
  const fr = ctxFor('art_6', 'p1.f.ii', 'fr'), en = ctxFor('art_6', 'p1.f.ii', 'en');
  assert.deepEqual(T(extractRefs('à l’article 8, paragraphe 3, points a) i) et g) i), du présent règlement', 'fr', fr)), ['art_8#p3.a.i', 'art_8#p3.g.i']);
  assert.deepEqual(T(extractRefs('Article 8(3)(a)(i) and (g)(i) of this Regulation', 'en', en)), ['art_8#p3.a.i', 'art_8#p3.g.i']);
  assert.deepEqual(T(extractRefs('articles 24 et 26 du règlement (CE) no 1987/2006', 'fr', fr)), ['32006R1987:art_24#', '32006R1987:art_26#']);
  assert.deepEqual(T(extractRefs('Article 46 of Regulation (EC) No 810/2009 and Annex XII thereto', 'en', en)), ['32009R0810:art_46#', '32009R0810:anx_XII#']);
  assert.deepEqual(T(extractRefs('à l’article 46 du règlement (CE) no 810/2009 et à son annexe XII', 'fr', fr)), ['32009R0810:art_46#', '32009R0810:anx_XII#']);
  assert.deepEqual(T(extractRefs('in Part A (‘EU, EEA, CH’) of Annex III', 'en', en)), ['anx_III#ptA']);
  assert.deepEqual(T(extractRefs('dans la partie A, point 4, de l’annexe XII', 'fr', fr)), ['anx_XII#ptA.n4']);
  assert.deepEqual(T(extractRefs('points 2.1 to 2.2', 'en', ctxFor('anx_VI', 'n2.n3.n3', 'en'))), ['anx_VI#n2.n1+anx_VI#n2.n2']);
  assert.deepEqual(T(extractRefs('Council Directive 2003/109/EC', 'en', en)), ['32003L0109']);
});

test('extractRefs: Unsicheres wird gekennzeichnet, nie geraten', () => {
  const de = ctxFor('art_25a', 'p6', 'de');
  // Quellfehler der DE-Fassung: «Absatz 27a Absatz 3» statt «Artikel 27a Absatz 3»
  const r = extractRefs('unter Berücksichtigung der gemäß Absatz 27a Absatz 3 abgegebenen Stellungnahme', 'de', de);
  assert.ok(r.length >= 1 && r.every((x) => x.uncertain && x.target.unit === null), JSON.stringify(r));
  // unbekannter Akt
  const u = extractRefs('conformément à l’article 3, paragraphe 2, de l’acte d’adhésion de 2003', 'fr', ctxFor('art_12', 'p2.b', 'fr', 's00'));
  assert.equal(u[0].uncertain, true); assert.deepEqual(u[0].why, ['unknown-act']);
  const n = extractRefs('pursuant to paragraph 2 of Article III of the Agreement between the Parties to the North Atlantic Treaty', 'en', ctxFor('anx_VII', 'n4.n4.d5', 'en'));
  assert.ok(n.every((x) => x.uncertain && x.target.unit === null));
  // Selbstbezug ohne weitere Angabe ist kein Verweis
  assert.equal(extractRefs('Diese Verordnung gilt ab …', 'de', de).length, 0);
});

// Mengen der Ziele je Block und Sprache
function targetSets(idx, src) {
  const s = new Set();
  for (const r of idx.out[src] || []) for (const t of r.targets || [r.target]) s.add((r.uncertain ? '?' : '') + refId(t) + (t.provision ? ':' + t.provision.unit + '#' + (t.provision.key || '') : ''));
  return [...s].sort().join('|');
}

test('Pflichtprüfung: sprachübergreifende Übereinstimmung im jüngsten SGK-Stand', () => {
  const idx = Object.fromEntries(LANGS.map((l) => [l, buildRefIndex(ds, l, LAST, { worksIndex: [] })]));
  let blocks = 0, same = 0;
  const diffs = [];
  for (const e of ds.toc) {
    const v = ds.units[e.id] && getVersion(ds, e.id, 'en', LAST);
    if (!v || v.repealed) continue;
    for (const b of v.blocks) {
      if (b.ty === 'table' || b.ty === 'img') continue;
      blocks++;
      const src = e.id + '#' + b.k;
      const [a, f, g] = LANGS.map((l) => targetSets(idx[l], src));
      if (a === f && f === g) same++; else diffs.push(src);
    }
  }
  // dokumentiert in data/REFS_NOTES.md (echte Abweichungen der Sprachfassungen, keine Parserlücken);
  // Erwägungsgründe (Einheit rct, sofern im Datensatz) stimmen in allen drei Sprachen überein
  assert.deepEqual(diffs, ['art_8d#p3.s2', 'art_25a#p6', 'art_38#p3']);
  assert.ok(same / blocks >= 0.995, `${same}/${blocks}`);
});

test('Pflichtprüfung: keine toten Ziele in allen Ständen und Sprachen', () => {
  for (const st of ds.stages) for (const l of LANGS) {
    if (!st.langs.includes(l) && st.id !== LAST) continue;
    const i = buildRefIndex(ds, l, st.id, {});
    assert.deepEqual(i.stats.dead, [], `${st.id}/${l}`);
  }
});

test('Index: Rückverweise, Fremdakte, Leistung (CPU-Zeit unter 300 ms)', () => {
  for (const l of LANGS) {
    buildRefIndex(ds, l, LAST, {});
    const times = [];
    let idx;
    for (let i = 0; i < 3; i++) { const c0 = process.cpuUsage(); idx = buildRefIndex(ds, l, LAST, {}); const c = process.cpuUsage(c0); times.push((c.user + c.system) / 1000); }
    times.sort((a, b) => a - b);
    assert.ok(times[1] < 300, `${l}: ${times[1]} ms`);
    assert.ok(idx.in['art_8#p3.a'].some((x) => x.unit === 'art_8d'));
    assert.ok(idx.in['art_6'].some((x) => x.unit === 'art_8'));
    assert.ok(idx.external['32017R2226'].length >= 60);
    assert.ok(idx.external['32008R0767'].length >= 10);
    const unsure = Object.entries(idx.out).filter(([src]) => !src.startsWith('rct#')).flatMap(([, rs]) => rs).filter((r) => r.uncertain).length;
    assert.ok(unsure <= 3, `${l}: ${unsure} unsichere Verweise ausserhalb der Erwägungsgründe`);
  }
});

test('linkifyHtml: Wortlaut unverändert, ein Anker je Fundstelle (alle Blöcke, drei Sprachen)', () => {
  let anchors = 0;
  for (const l of LANGS) {
    const idx = buildRefIndex(ds, l, LAST, {});
    for (const [src, refs] of Object.entries(idx.out)) {
      const [u, k] = src.split('#');
      const b = getVersion(ds, u, l, LAST).blocks.find((x) => x.k === k);
      const html = linkifyHtml(b.t, refs);
      assert.equal(unlinkHtml(html), b.t, src);
      assert.equal(plainText(html), plainText(b.t), src);
      const n = (html.match(/<a data-ref=/g) || []).length;
      assert.ok(n >= refs.length, src);
      anchors += n;
    }
  }
  assert.ok(anchors > 1800);
  const h = linkifyHtml('nach <i>Artikel 8</i> Absatz 3', extractRefs('nach Artikel 8 Absatz 3', 'de', ctxFor('art_6', 'p1', 'de')));
  assert.equal(unlinkHtml(h), 'nach <i>Artikel 8</i> Absatz 3');
  assert.match(h, /data-ref="art_8#p3"/);
});

test('Bibliothek: synthetischer worksIndex löst Fremdverweise im Werk auf', () => {
  const W = [{ id: 'sgk', celex: SGK }, { id: 'ees', celex: '32017R2226' }];
  const without = buildRefIndex(ds, 'de', LAST, {});
  const withLib = buildRefIndex(ds, 'de', LAST, { worksIndex: W });
  const t0 = without.external['32017R2226'].find((x) => x.unit === 'art_42a' && x.key === 'p6').target;
  const t1 = withLib.external['32017R2226'].find((x) => x.unit === 'art_42a' && x.key === 'p6').target;
  assert.equal(t0.unit, null); assert.deepEqual(t0.provision, { unit: 'art_66', key: 'p3' });
  assert.equal(t1.unit, 'art_66'); assert.equal(t1.key, 'p3');
  // Synthetischer Fremddatensatz: Schlüsselprüfung, tote Fremdziele
  const fake = { work: { celex: '32017R2226' }, stages: [{ id: 's00', order: 0 }], toc: [], units: { art_66: { versions: { de: [{ stage: 's00', blocks: [{ k: 'p1' }] }] } } } };
  const chk = buildRefIndex(ds, 'de', LAST, { worksIndex: W, datasets: { ees: fake } });
  assert.ok(chk.stats.deadExternal.some((d) => d.unit === 'art_66' && d.key === 'p3'));
});

test('Bibliothek: Datensätze weiterer Werke (sofern vorhanden)', { skip: !existsSync(data('works/index.json')) }, () => {
  const W = JSON.parse(readFileSync(data('works/index.json'), 'utf8'));
  const sets = {};
  for (const w of W) { const f = resolve(data('works'), w.dataset); if (w.id !== 'sgk' && existsSync(f)) sets[w.id] = JSON.parse(readFileSync(f, 'utf8')); }
  for (const [id, d] of Object.entries(sets)) {
    const st = d.stages.slice().sort((a, b) => a.order - b.order).pop().id;
    const idx = Object.fromEntries(LANGS.map((l) => [l, buildRefIndex(d, l, st, { worksIndex: W, datasets: sets })]));
    let n = 0, same = 0;
    for (const e of d.toc) {
      const v = d.units[e.id] && getVersion(d, e.id, 'en', st);
      if (!v || v.repealed) continue;
      for (const b of v.blocks) { if (b.ty === 'table' || b.ty === 'img') continue; n++; const s = e.id + '#' + b.k; const [a, f, g] = LANGS.map((l) => targetSets(idx[l], s)); if (a === f && f === g) same++; }
    }
    assert.ok(n > 300, id);
    assert.ok(same / n >= 0.9, `${id}: ${same}/${n}`);
    // Aenderungsartikel erkannt (EES, ETIAS und IO-VO aendern andere Verordnungen)
    if (['ees', 'etias', 'iop'].includes(id)) assert.ok((idx.en.stats.amending || []).length >= 1, id);
  }
});

test('amendedActOf: Einleitungssatz und Titel', () => {
  const v = { title: 'Amendments to Regulation (EC) No 767/2008', blocks: [{ k: 's1', t: 'Regulation (EC) No 767/2008 is amended as follows:' }] };
  assert.equal(amendedActOf(v, 'en', '32019R0817').celex, '32008R0767');
  const w = { title: 'Änderung der Verordnung (EU) 2016/399', blocks: [{ k: 's1', t: 'Die Verordnung (EU) 2016/399 wird wie folgt geändert:' }] };
  assert.equal(amendedActOf(w, 'de', '32017R2226').celex, SGK);
  assert.equal(amendedActOf({ title: 'Definitions', blocks: [{ k: 'p1', t: 'For the purposes of this Regulation' }] }, 'en', SGK), null);
});
