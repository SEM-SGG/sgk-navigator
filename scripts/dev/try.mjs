import { readFileSync } from 'node:fs';
import { DOMParser } from '../lib-dom.mjs';
import { parseEurLex } from '../../src/core/parser.js';
const [file, unit] = process.argv.slice(2);
const t0 = Date.now();
const r = parseEurLex(readFileSync(file, 'utf8'), { DOMParser });
console.error('ms', Date.now() - t0, r.kind, r.format, r.celex, r.lang, r.date, 'units', r.units.length, 'hasImages', r.hasImages);
if (!unit) { console.log(r.units.map((u) => `${u.id}(${u.blocks.length}${u.collisions ? ' COLL' + u.collisions : ''})`).join(' ')); console.log(JSON.stringify(r.modifiers)); console.log(r.toc.filter(x=>x.type!=='article'&&x.type!=='annex').map(x=>x.id+' '+x.label+' | '+x.heading).join('\n')); }
else {
  const u = r.units.find((x) => x.id === unit);
  console.log(u.label, '|', u.title, u.deletions.length ? JSON.stringify(u.deletions) : '');
  for (const b of u.blocks) console.log(`${'  '.repeat(b.d)}${b.k} [${b.l}] ${b.ty || ''} ${b.o}${b.act ? ':' + b.act : ''} ${b.t.slice(0, 90)}${b.fn ? ' FN' + b.fn.length : ''}`);
}
