// Einheitstests (node --test): Etikett «BETA» und Rückmelde-Symbol in der Kopfzeile (src/app/ui/brandextras.js), auch mit
// ausgeschaltetem Schalter BETA (src/app/config/update-source.js) und ohne Adresse für neue Issues. Darstellung im Browser:
// test/app/ui.spec.mjs, «Kopfzeile: Etikett BETA und Rückmelde-Symbol».
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

const { document, window } = parseHTML('<!doctype html><html><body><div id="r"></div></body></html>');
globalThis.document = document;
globalThis.window = window;
// common.js lädt state.js, das beim Laden die Adresse liest
globalThis.location = { hash: '', href: 'file:///sgk-navigator.html' };
const { html } = await import('htm/preact');
const { render } = await import('preact');
const { registerStrings, setUiLang } = await import('../../src/app/lib/i18n.js');
const de = (await import('../../src/app/i18n/de.js')).default;
const fr = (await import('../../src/app/i18n/fr.js')).default;
const { BrandExtras } = await import('../../src/app/ui/brandextras.js');
const { BETA, PROJECT } = await import('../../src/app/config/update-source.js');
registerStrings('de', de);
registerStrings('fr', fr);

const draw = (props) => { const r = document.getElementById('r'); render(null, r); render(html`<${BrandExtras} ...${props} />`, r); return r; };

test('Schalter und Adresse stehen in src/app/config/update-source.js', () => {
  assert.equal(typeof BETA, 'boolean');
  assert.equal(PROJECT.issues, 'https://github.com/SEM-SGG/sgk-navigator/issues/new/choose');
});

test('Etikett BETA und Rückmelde-Symbol (DE)', () => {
  setUiLang('de', { persist: false });
  const r = draw({ beta: true, issues: PROJECT.issues });
  const tag = r.querySelector('#beta-tag');
  assert.ok(tag);
  assert.equal(tag.tagName, 'SPAN');
  assert.equal(tag.querySelector('[aria-hidden="true"]').textContent, 'BETA');
  assert.equal(tag.getAttribute('title'), 'Beta: Dieses Tool ist in Erprobung. Rückmeldungen sind willkommen.');
  assert.equal(tag.querySelector('.sr').textContent, tag.getAttribute('title'));
  assert.equal(tag.querySelector('a, button'), null);
  const a = r.querySelector('#lnk-feedback');
  assert.equal(a.getAttribute('href'), PROJECT.issues);
  assert.equal(a.getAttribute('target'), '_blank');
  assert.equal(a.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(a.getAttribute('aria-label'), 'Fehler melden oder Änderung vorschlagen');
  assert.equal(a.getAttribute('title'), 'Fehler melden oder Änderung vorschlagen. Öffnet GitHub in einem neuen Tab. Meldungen sind öffentlich: keine Inhalte mit dem Vermerk INTERN oder höher, keine Personendaten.');
  assert.equal(a.querySelector('use').getAttribute('href'), '#bug');
  // Reihenfolge: Etikett vor dem Symbol
  assert.ok(tag.compareDocumentPosition(a) & 4);
});

test('Etikett BÊTA und Texte (FR) mit geschütztem Leerzeichen vor dem Doppelpunkt', () => {
  setUiLang('fr', { persist: false });
  const r = draw({ beta: true, issues: PROJECT.issues });
  assert.equal(r.querySelector('#beta-tag [aria-hidden="true"]').textContent, 'BÊTA');
  assert.equal(r.querySelector('#beta-tag').getAttribute('title'), 'Bêta : cet outil est en phase d’essai. Vos retours sont les bienvenus.');
  assert.equal(r.querySelector('#lnk-feedback').getAttribute('aria-label'), 'Signaler une erreur ou proposer une modification');
  assert.match(r.querySelector('#lnk-feedback').getAttribute('title'), /^Signaler une erreur ou proposer une modification\. Ouvre GitHub dans un nouvel onglet\. /);
  setUiLang('de', { persist: false });
});

test('Schalter BETA aus: kein Etikett, Symbol bleibt', () => {
  const r = draw({ beta: false, issues: PROJECT.issues });
  assert.equal(r.querySelector('#beta-tag'), null);
  assert.ok(r.querySelector('#lnk-feedback'));
});

test('Ohne Adresse für neue Issues: kein Symbol, Etikett bleibt', () => {
  const r = draw({ beta: true, issues: '' });
  assert.equal(r.querySelector('#lnk-feedback'), null);
  assert.ok(r.querySelector('#beta-tag'));
});
