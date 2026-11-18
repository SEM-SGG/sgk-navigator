// Tests data/forms.json (Agent BEGRÜNDUNG, SPEC3 §3.5): node --test test/core/rationale-forms.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify } from '../../scripts/forms/verify.mjs';
import { build } from '../../scripts/forms/build.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const F = JSON.parse(readFileSync(resolve(here, '../../data/forms.json'), 'utf8'));
const res = verify();
// Gegenprüfung mit den Quelldateien in raw/ (Datenpflege, nicht im Repo)
const NEED_RAW = { skip: !['32016R0399', '02016R0399-20240710', '32017R2225'].every((c) => existsSync(resolve(here, `../../raw/${c}_DE.html`))) && 'raw/ fehlt (Datenpflege, siehe MAINTAINING.md)' };

test('forms: Schema (Felder, Schlüssel f…, erlaubte Tags, Ausfülllinien als …)', () => {
  assert.ok(F.length >= 60, `Einträge: ${F.length}`);
  assert.deepEqual(res.schema, []);
});

test('forms: Verweise auf existierende Assets, Einheiten, Schlüssel und Stände', () => {
  assert.deepEqual(res.dataset, []);
});

test('forms: jeder Bild-Block jedes Stands und jeder Sprache hat genau eine Transkription', () => {
  assert.deepEqual(res.coverage, []);
});

test('forms: Sprachkonsistenz der Schlüssel je Einheit, Bild und Stand', () => {
  assert.deepEqual(res.langKeys, []);
});

test('forms: data/forms.json ist aktuell (gleich dem Ergebnis von build.mjs)', () => {
  assert.deepEqual(build(), F);
});

test('forms: Anhang V Teil B, Fassung nach EES = Fassung 2016 + (J) und EES-Hinweise, Schlüssel stabil', () => {
  for (const l of ['de', 'fr', 'en']) {
    const v = res.versions[`anx_V|ptB.g1|${l} s00→s03`];
    assert.ok(v, l);
    assert.deepEqual(v.changed, []); assert.deepEqual(v.removed, []);
    assert.deepEqual(v.added, ['fJ', 'fJ.n1', 'fJ.n2', 'f20.n1', 'f20.s1', 'f20.s2']);
  }
});

test('forms: Gegenprüfung verborgener EUR-Lex-Bildtext (nur bekannte Abweichungen)', NEED_RAW, () => {
  assert.ok(res.hidden.length >= 20);
  // erlaubt: zusammengezogene Wörter an Ausfülllinien im Bildtext, «I’Union» (Fehler im Bildtext),
  // fehlende EES-Ergänzungen im Bildtext der Fassung nach EES (Bildtext zeigt noch das Formular von 2016)
  for (const h of res.hidden) {
    const isEes = ['fb750e52db7119e8', '3e0813af8e8324b5', '1498afb43939b68f'].includes(h.asset);
    const hid = h.onlyHidden.map((w) => w.replace('I’Union', 'l’Union')).join('');
    const mine = h.onlyMine.join('');
    if (isEes) assert.ok(mine.includes(hid), `${h.asset}: nur Bildtext «${h.onlyHidden.join(' ')}»`);
    // Wortgrenzen weichen nur an Ausfülllinien ab (Bildtext zieht Wörter zusammen): gleiche Zeichen ohne Leerzeichen
    else assert.equal([...hid].sort().join(''), [...mine].sort().join(''), `${h.asset}: Abweichung über Leerzeichen hinaus`);
  }
});

test('forms: Gegenprüfung Wortlaut VO (EU) 2017/2225 (Ergänzungen des Formulars) wortgleich', NEED_RAW, () => {
  assert.equal(res.amending.length, 6);
  for (const a of res.amending) {
    assert.ok(a.found, `${a.lang} ${a.part}`);
    assert.deepEqual(a.onlyMine, [], `${a.lang} ${a.part}`); assert.deepEqual(a.onlyAct, [], `${a.lang} ${a.part}`);
  }
});

test('forms: Schildtexte Anhang III B1, B2, E gleich der Überschrift im Datensatz', () => {
  assert.equal(res.headings.length, 9);
  for (const h of res.headings) assert.ok(h.ok, `${h.key} ${h.lang}`);
});

test('forms: Stichproben Wortlaut und Kennzeichnungen', () => {
  const get = (unit, key, lang, stage, k) => F.find((e) => e.unit === unit && e.key === key && e.lang === lang && e.stages.includes(stage)).blocks.find((b) => b.k === k)?.t;
  assert.equal(get('anx_III', 'ptA.g1', 'de', 's00', 'f1'), 'EU<br>EWR<br>CH');
  assert.equal(get('anx_V', 'ptB.g1', 'fr', 's03', 'fF').slice(0, 6), 'à déjà');
  assert.equal(get('anx_V', 'ptB.g1', 'de', 's08', 'fJ'), 'hat sich geweigert, seine biometrischen Daten bereitzustellen, falls dies erforderlich ist, um');
  assert.equal(get('anx_XII', 'ptB.g1', 'en', 's07', 'f17.n1'), 'The person concerned declined to sign the form.');
  const ees = F.filter((e) => e.unit === 'anx_V' && e.stages.includes('s04'));
  for (const e of ees) assert.deepEqual(e.superseded?.map((s) => s.k), ['fC']);
  assert.equal(F.filter((e) => e.noText).length, 9);
  assert.equal(res.illegible, 0);
});
