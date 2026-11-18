// Arbeitshilfe für Durchgang 2: je geänderte Bestimmung die Erwägungsgründe mit der grössten Wortüberschneidung (DE)
import { readFileSync } from 'node:fs';
import { getVersion } from '../../src/core/model.js';
import { readRecitals } from './extract.mjs';
const [celex, top = '4'] = process.argv.slice(2);
const ds = JSON.parse(readFileSync('data/dataset.json', 'utf8'));
const acts = JSON.parse(readFileSync('data/acts.json', 'utf8'));
const act = acts.find((a) => a.celex === celex);
const si = ds.stages.findIndex((s) => s.act === celex);
const stage = ds.stages[si].id, prev = ds.stages[si - 1].id;
const STOP = new Set('dieser diese dieses werden wurde sowie gemäß artikel absatz buchstabe verordnung mitgliedstaaten mitgliedstaat einer eines einem sollte sollten können durch nicht oder und der die das den dem des ist sind hat haben auch bei für von mit im in zu zur zum auf aus nach über unter wenn so dass als wie'.split(' '));
const words = (t) => new Set((t || '').replace(/<[^>]+>/g, ' ').toLowerCase().match(/[a-zäöüß-]{6,}/g)?.filter((w) => !STOP.has(w)) || []);
const recs = readRecitals('raw', celex, 'de').map((r) => ({ n: r.n, w: words(r.t) }));
const df = new Map(); for (const r of recs) for (const w of r.w) df.set(w, (df.get(w) || 0) + 1);
for (const c of act.changes) {
  let txt = '';
  for (const st of [stage, prev]) {
    const v = ds.units[c.unit] ? getVersion(ds, c.unit, 'de', st) : null;
    if (!v) continue;
    const bl = c.key ? v.blocks.filter((b) => b.k === c.key || b.k.startsWith(c.key + '.')) : v.blocks;
    txt += ' ' + (v.title || '') + ' ' + bl.map((b) => b.t).join(' ');
  }
  const w = words(txt);
  const sc = recs.map((r) => { let s = 0; for (const x of w) if (r.w.has(x)) s += Math.log(recs.length / df.get(x)); return [r.n, s]; }).sort((a, b) => b[1] - a[1]);
  console.log(`${c.unit} ${c.key || '*'} ${c.action}: ` + sc.slice(0, +top).map(([n, s]) => `(${n}) ${s.toFixed(1)}`).join('  '));
}
