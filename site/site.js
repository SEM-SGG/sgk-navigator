// Download-Seite: Sprachwahl DE/FR (ohne JavaScript stehen beide Sprachen untereinander) und Abgleich mit version.json
// (Version, Datum, Link, Kurztext; die Werte stehen beim Build schon in der Seite, version.json ist dieselbe Quelle).
(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('js');
  var KEY = 'sgk-site-lang';
  var LANGS = { de: 'de-CH', fr: 'fr-CH' };
  function pick() {
    var m = /[?&#]lang=(de|fr)\b/.exec(location.search + location.hash);
    if (m) return m[1];
    try { var s = localStorage.getItem(KEY); if (s === 'de' || s === 'fr') return s; } catch (e) { /* Speicher gesperrt */ }
    if (location.hash === '#nouveau') return 'fr';
    var n = (navigator.languages && navigator.languages[0]) || navigator.language || '';
    return /^fr\b/i.test(n) ? 'fr' : 'de';
  }
  function apply(l, focus) {
    root.lang = LANGS[l];
    var els = document.querySelectorAll('[data-l]');
    for (var i = 0; i < els.length; i++) els[i].hidden = els[i].getAttribute('data-l') !== l;
    var bs = document.querySelectorAll('[data-set-lang]');
    for (var j = 0; j < bs.length; j++) bs[j].setAttribute('aria-pressed', String(bs[j].getAttribute('data-set-lang') === l));
    document.title = l === 'fr' ? 'Télécharger le SGK-Navigator' : 'SGK-Navigator herunterladen';
    try { localStorage.setItem(KEY, l); } catch (e) { /* Speicher gesperrt */ }
    if (focus) { var h = document.getElementById(l + '-h1'); if (h) { h.setAttribute('tabindex', '-1'); h.focus(); } }
  }
  var sw = document.querySelector('.lang-switch');
  if (sw) {
    sw.hidden = false;
    sw.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-set-lang]') : null;
      if (b) apply(b.getAttribute('data-set-lang'), true);
    });
  }
  apply(pick(), false);
  if (location.hash === '#neu' || location.hash === '#nouveau') {
    var t = document.getElementById(root.lang === 'fr-CH' ? 'nouveau' : 'neu');
    if (t) t.scrollIntoView();
  }

  // version.json: gleiche Werte wie beim Build; nur wenn eine neuere Datei vorliegt (Zwischenspeicher), Seite anpassen.
  if (!window.fetch) return;
  fetch('version.json', { cache: 'no-store', credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (v) {
    if (!v || typeof v.version !== 'string' || !/^https:\/\//.test(v.url || '')) return;
    var set = function (k, val) { var els = document.querySelectorAll('[data-v="' + k + '"]'); for (var i = 0; i < els.length; i++) { if (k === 'url') els[i].href = val; else els[i].textContent = val; } };
    set('version', v.version);
    set('url', v.url);
    if (v.dateText) { if (v.dateText.de) set('date-de', v.dateText.de); if (v.dateText.fr) set('date-fr', v.dateText.fr); }
    if (v.notes) { if (v.notes.de) set('notes-de', v.notes.de); if (v.notes.fr) set('notes-fr', v.notes.fr); }
  }).catch(function () { /* offline: Werte der Seite bleiben */ });
})();
