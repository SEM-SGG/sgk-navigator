// Minimale Browser-Umgebung für Node: DOMParser aus linkedom (wie scripts/), Stubs für location/window/history,
// damit Oberflächenmodule mit reinen Funktionen (compare.js, chronology.js) geladen werden können. Kein Rendern.
import './register.mjs';
import { DOMParser } from '../../../scripts/lib-dom.mjs';
globalThis.DOMParser = DOMParser;
if (typeof globalThis.location === 'undefined') globalThis.location = { hash: '', href: 'file:///test.html', protocol: 'file:' };
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
globalThis.addEventListener = globalThis.addEventListener || (() => {});
globalThis.removeEventListener = globalThis.removeEventListener || (() => {});
if (typeof globalThis.history === 'undefined') globalThis.history = { replaceState() {}, pushState() {} };
