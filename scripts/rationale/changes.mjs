// Arbeitshilfe: von einem Akt geänderte Blöcke (laut acts.json) mit Wortlaut im Stand des Akts ausgeben
import { readFileSync } from 'node:fs';
import { getVersion } from '../../src/core/model.js';
const [celex, lang = 'de', max = '400'] = process.argv.slice(2);
const ds = JSON.parse(readFileSync('data/dataset.json', 'utf8'));
const acts = JSON.parse(readFileSync('data/acts.json', 'utf8'));
const act = acts.find((a) => a.celex === celex);
const stage = ds.stages.find((s) => s.act === celex).id;
const strip = (t) => (t || '').replace(/<[^>]+>/g, '').slice(0, +max);
for (const c of act.changes) {
  const v = ds.units[c.unit] ? getVersion(ds, c.unit, lang, stage) : null;
  if (!v) { console.log(`## ${c.unit} ${c.key} ${c.action} [keine Einheit]`); continue; }
  const bl = c.key ? v.blocks.filter((b) => b.k === c.key || b.k.startsWith(c.key + '.')) : v.blocks;
  console.log(`## ${c.unit} ${c.key || '*'} ${c.action} — ${v.label} ${v.title || ''}`);
  for (const b of (c.key ? bl : bl.slice(0, 6))) console.log(`   ${b.k} ${b.l} ${strip(b.t)}`);
  if (!c.key && bl.length > 6) console.log(`   … (${bl.length} Blöcke)`);
}
