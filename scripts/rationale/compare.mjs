// Abgleich der zwei Durchgänge. Ausgabe: übereinstimmend / nur Durchgang 1 / nur Durchgang 2 / Stärke abweichend
import { readFileSync, writeFileSync } from 'node:fs';
const p1 = JSON.parse(readFileSync(new URL('./pass1.json', import.meta.url)));
const p2 = JSON.parse(readFileSync(new URL('./pass2.json', import.meta.url)));
export function normalize() {
  const a = new Map(), b = new Map();
  for (const [celex, act] of Object.entries(p1)) {
    if (celex.startsWith('_')) continue;
    for (const [n, list] of Object.entries(act.r)) for (const [unit, key, s, why] of list) a.set(`${celex}|${unit}|${key ?? '*'}|${n}`, { s, why });
  }
  for (const [celex, act] of Object.entries(p2)) {
    if (celex.startsWith('_')) continue;
    for (const [uk, list] of Object.entries(act)) for (const [n, s, why] of list) b.set(`${celex}|${uk}|${n}`, { s, why });
  }
  return { a, b };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const { a, b } = normalize();
  const res = { agree: [], strength: [], only1: [], only2: [] };
  for (const [k, v] of a) { if (!b.has(k)) res.only1.push(k); else if (b.get(k).s !== v.s) res.strength.push(`${k} p1=${v.s} p2=${b.get(k).s}`); else res.agree.push(k); }
  for (const k of b.keys()) if (!a.has(k)) res.only2.push(k);
  const per = {};
  for (const [cat, list] of Object.entries(res)) for (const k of list) { const c = k.split('|')[0]; (per[c] = per[c] || { agree: 0, strength: 0, only1: 0, only2: 0 })[cat]++; }
  console.log(JSON.stringify(per, null, 1));
  for (const cat of ['strength', 'only1', 'only2']) { console.log(`\n## ${cat} (${res[cat].length})`); for (const k of res[cat]) console.log(k); }
  writeFileSync(new URL('./work/compare.json', import.meta.url), JSON.stringify(res, null, 1));
}
