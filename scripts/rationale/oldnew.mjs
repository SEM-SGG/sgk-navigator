// Arbeitshilfe: Wortlaut eines Blocks vor und nach einem Akt
import { readFileSync } from 'node:fs';
import { getVersion } from '../../src/core/model.js';
const [celex, unit, prefix, lang = 'de'] = process.argv.slice(2);
const ds = JSON.parse(readFileSync('data/dataset.json', 'utf8'));
const i = ds.stages.findIndex((s) => s.act === celex);
const strip = (t) => (t || '').replace(/<[^>]+>/g, '');
for (const [lab, st] of [['ALT', ds.stages[i - 1].id], ['NEU', ds.stages[i].id]]) {
  const v = getVersion(ds, unit, lang, st);
  console.log(`--- ${lab} ${st}`);
  if (!v) { console.log('(keine)'); continue; }
  for (const b of v.blocks) if (!prefix || prefix === '*' || b.k === prefix || b.k.startsWith(prefix + '.')) console.log(`${b.k} ${b.l} ${strip(b.t)}`);
}
