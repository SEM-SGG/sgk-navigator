// Stichprobe von Zuordnungen mit strength "direct" zur Kontrolle von Hand (Wiederaufnahme Etappe 3).
// Aufruf: node scripts/rationale/sample.mjs [anzahl=15] [seed=20261112] [lang=en]
import { readFileSync } from 'node:fs';
import { getVersion } from '../../src/core/model.js';
const ROOT = new URL('../../', import.meta.url).pathname;
const [N = 15, SEED = 20261112, LANG = 'en'] = process.argv.slice(2).map((x, i) => (i < 2 ? +x : x));
const R = JSON.parse(readFileSync(ROOT + 'data/rationale.json', 'utf8'));
const ds = JSON.parse(readFileSync(ROOT + 'data/dataset.json', 'utf8'));
let s = SEED >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const all = [];
for (const [c, A] of Object.entries(R)) A.map.forEach((m, i) => m.strength === 'direct' && all.push({ c, i, m }));
for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
const strip = (h) => h.replace(/<[^>]+>/g, '');
for (const { c, i, m } of all.slice(0, N)) {
  const st = ds.stages.find((x) => x.act === c).id;
  const v = getVersion(ds, m.unit, LANG, st);
  const blocks = (v?.blocks || []).filter((b) => m.key == null || b.k === m.key || b.k.startsWith(m.key + '.'));
  console.log(`\n=== ${c} #${i} ${m.unit} ${m.key ?? '*'} rec ${m.recitals.join(',')} — ${m.why}`);
  console.log(`--- Bestimmung (${st}, ${LANG}): ${v?.label} ${v?.title || ''}`);
  console.log(strip(blocks.map((b) => `[${b.k}] ${b.l} ${b.t}`).join('\n')).slice(0, m.key == null ? 1500 : 1200));
  for (const n of m.recitals) console.log(`--- (${n}) ${strip(R[c].recitals[n][LANG])}`);
}
console.log(`\n${all.length} direct-Zuordnungen insgesamt, Stichprobe ${Math.min(N, all.length)}`);
