import { readFileSync } from 'node:fs';
import { getVersion } from '../../src/core/model.js';
const ds = JSON.parse(readFileSync(new URL('../../data/dataset.json', import.meta.url)));
const [unit, lang, stage, filter] = process.argv.slice(2);
const v = getVersion(ds, unit, lang, stage);
console.log(v.stage, v.label, '|', v.title, v.repealed ? 'REPEALED' : '');
for (const b of v.blocks) if (!filter || b.k.startsWith(filter)) console.log(`${'  '.repeat(b.d)}${b.k} [${b.l}] ${b.ty || ''} ${b.o}${b.x ? ' x=' + b.x : ''} ${b.t.slice(0, 140)}${b.nt ? ' NOTE' : ''}`);
