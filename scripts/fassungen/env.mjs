// Minimale Umgebung, damit src/app/data.js und src/app/modules/sgk/updatelogic.js in Node laufen (ohne Rendern).
import { register } from 'node:module';
import { DOMParser } from '../lib-dom.mjs';
register('./hooks.mjs', import.meta.url);
globalThis.DOMParser = globalThis.DOMParser || DOMParser;
if (typeof globalThis.location === 'undefined') globalThis.location = { hash: '', href: 'file:///check.html', protocol: 'file:' };
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
globalThis.addEventListener = globalThis.addEventListener || (() => {});
globalThis.removeEventListener = globalThis.removeEventListener || (() => {});
if (typeof globalThis.history === 'undefined') globalThis.history = { replaceState() {}, pushState() {} };
