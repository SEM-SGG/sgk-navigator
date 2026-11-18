// Vergleicht zwei Parse-Ergebnisse je Einheit: Schluessel und normalisierter Text
import { readFileSync } from 'node:fs';
import { DOMParser } from '../lib-dom.mjs';
import { parseEurLex } from '../../src/core/parser.js';
import { normText } from '../../src/core/text.js';
const [a, b, only] = process.argv.slice(2);
const A = parseEurLex(readFileSync(a, 'utf8'), { DOMParser });
const B = parseEurLex(readFileSync(b, 'utf8'), { DOMParser });
const ua = new Map(A.units.map((u) => [u.id, u])), ub = new Map(B.units.map((u) => [u.id, u]));
let diffs = 0;
for (const id of new Set([...ua.keys(), ...ub.keys()])) {
  if (only && id !== only) continue;
  const x = ua.get(id), y = ub.get(id);
  if (!x || !y) { console.log('UNIT only in', x ? 'A' : 'B', id); continue; }
  if (normText(x.title, {caseFold:true}) !== normText(y.title, {caseFold:true})) console.log(id, 'TITLE', x.title, '|', y.title);
  const mx = new Map(x.blocks.map((q) => [q.k, q])), my = new Map(y.blocks.map((q) => [q.k, q]));
  for (const k of new Set([...mx.keys(), ...my.keys()])) {
    const p = mx.get(k), q = my.get(k);
    if (!p || !q) { console.log(id, k, 'only in', p ? 'A' : 'B', (p || q).ty || '', (p || q).t.slice(0, 100)); diffs++; continue; }
    if (p.ty === 'img' || q.ty === 'img') continue;
    const cf = p.ty === 'heading';
    if (normText(p.t, {caseFold:cf}) !== normText(q.t, {caseFold:cf}) || (p.ty||'') !== (q.ty||'')) { diffs++; console.log(id, k, 'TEXT\n   A:', normText(p.t).slice(0, 300), '\n   B:', normText(q.t).slice(0, 300)); }
  }
}
console.log('diffs', diffs);
