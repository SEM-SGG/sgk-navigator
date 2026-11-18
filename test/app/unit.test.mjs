// Einheitstests (node --test): Zitierweise, Wort-Diff, Suche, Ersatzmodell.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cite } from '../../src/app/lib/cite.js';
import { diffText } from '../../src/app/lib/diff.js';
import { parseRef } from '../../src/app/lib/search.js';
import { fmtDate } from '../../src/app/lib/format.js';
import { safeInline } from '../../src/app/lib/sanitize.js';
import * as fb from '../../src/app/fallback-model.js';
import { readFileSync } from 'node:fs';

const art8 = { type: 'article', num: '8' };
test('Zitierweise SPEC §7.2', () => {
  assert.equal(cite(art8, 'p3.a.i', 'de'), 'Art. 8 Abs. 3 Bst. a Ziff. i SGK');
  assert.equal(cite(art8, 'p3.a.i', 'fr'), 'art. 8, par. 3, point a) i), CFS');
  assert.equal(cite(art8, 'p3.a.i', 'en'), 'Article 8(3)(a)(i) SBC');
  assert.equal(cite({ type: 'annex', num: 'V' }, 'ptB', 'de'), 'Anhang V Teil B SGK');
  assert.equal(cite({ type: 'annex', num: 'V' }, 'ptB', 'en'), 'Annex V, Part B, SBC');
  assert.equal(cite({ type: 'article', num: '8a' }, null, 'fr'), 'art. 8 bis, CFS');
  assert.equal(cite(art8, 'p3.ba', 'fr'), 'art. 8, par. 3, point b bis), CFS');
  assert.equal(cite({ type: 'article', num: '6' }, 'p1.s2', 'de'), 'Art. 6 Abs. 1 Unterabs. 2 SGK');
  assert.equal(cite({ type: 'article', num: '6' }, 'p1.s2', 'en'), 'Article 6(1), second subparagraph, SBC');
  assert.equal(cite({ type: 'article', num: '2' }, 'n12', 'de'), 'Art. 2 Ziff. 12 SGK');
  assert.equal(cite(art8, 'p2.v', 'de'), 'Art. 8 Abs. 2 Bst. v SGK'); // Buchstabe v, nicht römisch
  assert.equal(cite(art8, 'p2.a.v', 'de'), 'Art. 8 Abs. 2 Bst. a Ziff. v SGK');
  assert.equal(cite(art8, 'p3.a.i.n1', 'de'), 'Art. 8 Abs. 3 Bst. a Ziff. i Nr. 1 SGK');
  assert.equal(cite(art8, 'p3.a.i.n1', 'en'), 'Article 8(3)(a)(i)(1) SBC');
});
test('Wort-Diff: Einfügung und Streichung, Tags bleiben erhalten', () => {
  const d = diffText('das erforderliche Visum oder der <i>Titel</i>', 'das erforderliche Visum, die Reisegenehmigung oder der <i>Titel</i>');
  assert.ok(d.changed);
  assert.match(d.newHtml, /<ins>, die Reisegenehmigung<\/ins>/);
  assert.match(d.redline, /<i>Titel<\/i>/);
  assert.ok(!/<del>/.test(d.redline));
  const e = diffText('Überprüfung, ob', 'Feststellung, ob');
  assert.match(e.redline, /<del>Überprüfung<\/del><ins>Feststellung<\/ins>, ob/);
  const g = diffText('eins zwei drei vier fünf sechs sieben', 'alpha beta gamma delta zwei epsilon zeta');
  assert.equal(g.redline, '<del>eins zwei drei vier fünf sechs sieben</del><ins>alpha beta gamma delta zwei epsilon zeta</ins>');
  assert.equal(diffText('a &amp; b', 'a &amp; b').changed, false);
});
test('Suche: Verweise', () => {
  assert.deepEqual(parseRef('8'), { type: 'article', num: '8', par: null });
  assert.deepEqual(parseRef('Art. 8a'), { type: 'article', num: '8a', par: null });
  assert.deepEqual(parseRef('art. 8 bis'), { type: 'article', num: '8a', par: null });
  assert.deepEqual(parseRef('Anhang V'), { type: 'annex', num: 'V' });
  assert.deepEqual(parseRef('Art. 8 Abs. 3'), { type: 'article', num: '8', par: '3' });
  assert.equal(parseRef('Reisegenehmigung'), null);
});
test('Daten ausgeschrieben, Bereinigung', () => {
  assert.equal(fmtDate('2025-10-12'), '12. Oktober 2025');
  assert.equal(safeInline('<a href="x">A</a><i class="y">B</i><script>x</script>'), 'A<i>B</i>');
});
test('Ersatzmodell: composeAt mit allen Akten = getVersion (Fixtures)', () => {
  const ds = JSON.parse(readFileSync(new URL('./fixtures/dataset.json', import.meta.url)));
  for (const s of ds.stages) {
    const acts = new Set(ds.stages.filter((x) => x.order <= s.order).map((x) => x.act));
    for (const u of Object.keys(ds.units)) for (const l of ds.langs) {
      const v = fb.getVersion(ds, u, l, s.id);
      const c = fb.composeAt(ds, u, l, (a) => acts.has(a));
      if (!v) { assert.equal(c, null, `${u} ${l} ${s.id}`); continue; }
      assert.deepEqual((c.blocks || []).map((b) => b.k + b.t), (v.blocks || []).map((b) => b.k + b.t), `${u} ${l} ${s.id}`);
    }
  }
  const h = fb.blockHistory(ds, 'art_8', 'de', 'p3.a.i');
  assert.deepEqual(h.map((x) => x.change), ['base', 'replaced', 'replaced']);
});

// ------------------------------------------------------------------ Oberflächensprache (i18n)
import { registerStrings, keysOf, t as tr, withUiLang } from '../../src/app/lib/i18n.js';
import de from '../../src/app/i18n/de.js';
import fr from '../../src/app/i18n/fr.js';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import negDe from '../../src/app/modules/neg/i18n/de.js';
import negFr from '../../src/app/modules/neg/i18n/fr.js';
registerStrings('de', de);
registerStrings('fr', fr);
registerStrings('de', negDe);
registerStrings('fr', negFr);
import deRa from '../../src/app/i18n/de-ra.js';
import frRa from '../../src/app/i18n/fr-ra.js';
registerStrings('de', deRa);
registerStrings('fr', frRa);

function srcFiles(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...srcFiles(p));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}
const SRC = new URL('../../src/app/', import.meta.url).pathname;

test('i18n: DE und FR haben dieselben Schlüssel, Werte nicht leer, gleiche Pluralstruktur', () => {
  const D = keysOf('de'), F = new Set(keysOf('fr'));
  assert.ok(D.length > 300);
  assert.deepEqual(D.filter((k) => !F.has(k)), [], 'fehlt in fr.js');
  assert.deepEqual([...F].filter((k) => !D.includes(k)), [], 'fehlt in de.js');
  for (const k of D) {
    for (const [l, d] of [['de', de], ['fr', fr]]) {
      const v = withUiLang(l, () => tr(k, { n: 2 }));
      assert.ok(v !== '' && v != null, `${l}:${k} leer`);
    }
  }
});

test('i18n: jeder im Code verwendete Schlüssel existiert (statisch und [[…]] in der Anleitung)', () => {
  const keys = new Set(keysOf('de'));
  const used = new Set();
  for (const f of srcFiles(SRC)) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/\bt\(['`]([a-zA-Z0-9_.]+)['`]/g)) used.add(m[1]);
    for (const m of s.matchAll(/labelKey: '([^']+)'/g)) used.add(m[1]);
  }
  const missing = [...used].filter((k) => !k.endsWith('.') && !keys.has(k));
  assert.deepEqual(missing, []);
  // Dynamische Schlüssel
  const dyn = ['kind.base', 'kind.amendment', 'kind.corrigendum', 'kind.derogation', 'kind.implementing', 'kind.proposal', 'kind.consolidated',
    'change.base', 'change.inserted', 'change.replaced', 'change.amended', 'change.deleted', 'change.repealed',
    'source.oj', 'source.consolidated', 'source.reconstructed', 'source.patched', 'source.uploaded',
    'lang.name.de', 'lang.name.fr', 'lang.name.en', 'lang.uiName.de', 'lang.uiName.fr', 'ov.status.final', 'ov.status.prelim',
    'act.type.regulation', 'act.type.decision', 'act.type.implDecision', 'act.type.directive', 'export.file.chron', 'export.file.compare', 'export.file.lang',
    'guide.legend.statusKind.applicable', 'guide.legend.statusKind.partly', 'guide.legend.statusKind.pending', 'guide.legend.statusKind.future', 'guide.legend.statusKind.proposal',
    'guide.legend.source.oj', 'guide.legend.source.consolidated', 'guide.legend.source.reconstructed', 'guide.legend.source.patched', 'guide.legend.source.patchedConsolidated', 'guide.legend.source.uploaded',
    ...['zweck', 'grundbegriffe', 'aufgaben', 'legende', 'zitierweise', 'tastatur', 'grenzen'].map((x) => 'guide.sec.' + x),
    ...['lesen', 'chronologie', 'vergleich', 'sprachvergleich', 'sichten', 'export', 'aktualisieren', 'projekt', 'links', 'uebersicht'].flatMap((x) => ['guide.task.' + x + '.title', 'guide.task.' + x + '.steps']),
    // Etappe 3, Modul Rechtsakte
    ...['werke', 'verweise', 'anwendbarkeit', 'begruendung', 'formulare', 'textexport', 'vorschau'].flatMap((x) => ['guide.task.' + x + '.title', 'guide.task.' + x + '.steps']),
    ...['suspended', 'conditional', 'modified', 'pending', 'future', 'expired'].map((x) => 'notice.kind.' + x),
    ...['docx', 'docxTracked', 'pdftext', 'pdftext169', 'clip'].map((x) => 'export.kind.' + x),
    'rat.direct', 'rat.thematic', 'rat.directTip', 'rat.thematicTip', 'export.file.preview', 'export.file.tracked', 'guide.limits2', 'info.works.text', 'info.extra.text',
  ];
  assert.deepEqual(dyn.filter((k) => !keys.has(k)), []);
  // Modul Verhandlung: dynamische Schlüssel
  const negDyn = [
    ...['agreed', 'provisional', 'open', 'deleted', 'none'].map((x) => 'neg.status.' + x),
    ...['support', 'support-with-changes', 'scrutiny', 'reservation', 'oppose', 'none'].flatMap((x) => ['neg.stance.' + x, 'neg.guide.stance.' + x]),
    ...['redline', 'high', 'medium', 'low'].flatMap((x) => ['neg.priority.' + x, 'neg.guide.priority.' + x]),
    ...['accepted', 'partly', 'rejected', 'noted', 'open'].flatMap((x) => ['neg.decision.' + x, 'neg.guide.decision.' + x]),
    ...['public', 'limite', 'restricted', 'internal'].flatMap((x) => ['neg.class.' + x, 'neg.class.' + x + 'Long']),
    ...['four-column', 'proposal', 'compromise', 'mandate', 'ep-report', 'other'].map((x) => 'neg.docKind.' + x),
    ...['new', 'changed', 'unchanged', 'status', 'removed', 'empty'].flatMap((x) => ['neg.chg.' + x, 'neg.imp.cell.' + x]),
    ...['all', 'changed', 'new', 'removed', 'status'].map((x) => 'neg.imp.chg.' + x),
    ...['attention', 'changed', 'new', 'ambiguous', 'all'].map((x) => 'neg.imp.show.' + x),
    ...['unchanged', 'changed', 'new', 'missing', 'ambiguous'].map((x) => 'neg.imp.sum.' + x),
    ...['file', 'map', 'check', 'done'].map((x) => 'neg.imp.step.' + x),
    ...['four-column', 'text', 'proposal'].map((x) => 'neg.imp.parser.' + x),
    ...['none', 'com', 'prev', 'tracks'].map((x) => 'neg.syn.diffMode.' + x),
    ...['position', 'chron', 'compare', 'feedback', 'edit'].map((x) => 'neg.detail.tab.' + x),
    ...['redline', 'open', 'all', 'full'].map((x) => 'neg.out.scopeOpt.' + x),
    ...['all', 'filtered', 'withPos', 'selected'].map((x) => 'neg.cons.scopeOpt.' + x),
    ...['cell', 'word-comment', 'tracked-change', 'manual'].flatMap((x) => ['neg.cons.src.' + x, 'neg.cons.srcShort.' + x]),
    ...['preamble', 'recitals', 'article', 'annex', 'title', 'final', 'other'].map((x) => 'neg.group.' + x),
    ...['zweck', 'begriffe', 'aufgaben', 'stellen', 'legende', 'grenzen'].map((x) => 'neg.guide.sec.' + x),
    ...['dossier', 'import', 'neu', 'synopse', 'zeile', 'position', 'konsultation', 'briefing'].flatMap((x) => ['neg.guide.task.' + x + '.title', 'neg.guide.task.' + x + '.steps']),
  ];
  assert.deepEqual(negDyn.filter((k) => !keys.has(k)), []);
  // [[schlüssel]] in Anleitungstexten
  for (const [l, d] of [['de', de], ['fr', fr], ['de', negDe], ['fr', negFr]]) {
    const refs = JSON.stringify(d).match(/\[\[([\w.]+)\]\]/g) || [];
    assert.ok(refs.length > 40, `${l}: zu wenige Verweise`);
    for (const r of refs) assert.ok(keys.has(r.slice(2, -2)), `${l}: ${r}`);
  }
});

test('i18n: Stil (kein ß in DE, keine Ausrufezeichen, keine Füllwörter, FR-Typografie)', () => {
  const flat = (o) => JSON.stringify(o);
  const sde = flat(de) + flat(negDe), sfr = flat(fr) + flat(negFr);
  assert.ok(!sde.includes('ß'), 'ß in de.js');
  assert.ok(!/!/.test(sde.replace(/\[\[|\]\]/g, '')), 'Ausrufezeichen in de.js');
  assert.ok(!/\b(einfach|nur noch|bitte)\b/i.test(sde), 'Füllwort in de.js');
  assert.ok(!/\b(simplement|veuillez)\b/i.test(sfr), 'Füllwort in fr.js');
  for (const v of Object.values(Object.fromEntries(keysOf('fr').map((k) => [k, withUiLang('fr', () => tr(k, { n: 2 }))])))) {
    if (typeof v !== 'string') continue;
    assert.ok(!/ [:;?!]/.test(v), `FR: normales Leerzeichen vor Satzzeichen: ${v}`);
    assert.ok(!/"/.test(v), `FR: gerade Anführungszeichen: ${v}`);
  }
});

test('Datumsformat und Zitierweise je Oberflächensprache', () => {
  assert.equal(fmtDate('2025-10-12', 'fr'), '12 octobre 2025');
  assert.equal(fmtDate('2025-10-01', 'fr'), '1er octobre 2025');
  assert.equal(withUiLang('fr', () => fmtDate('2024-07-10')), '10 juillet 2024');
  assert.equal(withUiLang('fr', () => tr('status.applicableSince', { date: fmtDate('2025-10-12') })), 'applicable depuis le 12 octobre 2025');
  assert.equal(withUiLang('de', () => tr('status.applicableSince', { date: fmtDate('2025-10-12') })), 'anwendbar seit 12. Oktober 2025');
  assert.equal(withUiLang('fr', () => tr('read.search.units', { n: 1 })), '1 unité');
  assert.equal(withUiLang('de', () => tr('read.search.units', { n: 3 })), '3 Einheiten');
  assert.equal(cite(art8, 'p3.a.i.n1', 'de'), 'Art. 8 Abs. 3 Bst. a Ziff. i Nr. 1 SGK');
  assert.equal(cite({ type: 'article', num: '8' }, 'p2.b.d1', 'de'), 'Art. 8 Abs. 2 Bst. b Strich 1 SGK');
});

test('Titel aus Daten: Tags entfernt, Entities dekodiert, Fettung in Überschriften entfernt', async () => {
  const { plain } = await import('../../src/app/lib/format.js');
  const { titleInline } = await import('../../src/app/lib/sanitize.js');
  assert.equal(plain('<b>Sonderbestimmungen für bestimmte Personengruppen</b>'), 'Sonderbestimmungen für bestimmte Personengruppen');
  assert.equal(plain('Art &amp; Weise<br>neu'), 'Art & Weise neu');
  assert.equal(titleInline('<b>Titel mit <i>Kursiv</i></b>'), 'Titel mit <i>Kursiv</i>');
  assert.equal(plain('<b>Erfassung von informationen</b>'), 'Erfassung von informationen'); // Kleinschreibung bleibt (Amtsblatt)
});

test('Modul Verhandlung: Begriffe der Oberfläche = Begriffe der Word-Ausgaben (src/neg/i18n.js)', async () => {
  const { DOC_TEXT } = await import('../../src/neg/i18n.js');
  for (const [l, d] of [['de', negDe], ['fr', negFr]]) {
    for (const g of ['stance', 'priority', 'decision']) assert.deepEqual(d.neg[g], DOC_TEXT[l][g], `${l}: ${g}`);
    for (const k of Object.keys(DOC_TEXT[l].status)) assert.equal(d.neg.status[k], DOC_TEXT[l].status[k], `${l}: status.${k}`);
    assert.equal(d.neg.pos.stance, DOC_TEXT[l].stanceL, `${l}: Bezeichnung Haltung`);
    assert.equal(d.neg.pos.priority, DOC_TEXT[l].priorityL, `${l}: Bezeichnung Priorität`);
  }
});
