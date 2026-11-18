// Baut data/rationale.json aus raw/<CELEX>_<LANG>.html (Wortlaut) und den Zuordnungen (pass1, pass2, decisions).
// Aufruf: node scripts/rationale/build.mjs
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { readRecitals } from './extract.mjs';
import { normalize } from './compare.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const LANGS = ['de', 'fr', 'en'];
const p1 = JSON.parse(readFileSync(new URL('./pass1.json', import.meta.url)));
const decisions = JSON.parse(readFileSync(new URL('./decisions.json', import.meta.url)));
const ACTS = Object.keys(p1).filter((k) => !k.startsWith('_'));

// 1. Endgültige Zuordnungen: Übereinstimmungen beider Durchgänge + Entscheide
const { a, b } = normalize();
const final = new Map();
const open = [];
for (const k of new Set([...a.keys(), ...b.keys()])) {
  const x = a.get(k), y = b.get(k);
  if (x && y && x.s === y.s) { final.set(k, { s: x.s, why: x.why }); continue; }
  const d = decisions[k];
  if (!d) { open.push(k); continue; }
  if (d.decision === 'keep') final.set(k, { s: (x || y).s, why: (x || y).why });
}
if (open.length) { console.error('Abweichungen ohne Entscheid:', open); process.exit(1); }

const out = {};
for (const celex of ACTS) {
  const byLang = Object.fromEntries(LANGS.map((l) => [l, readRecitals(ROOT + 'raw', celex, l)]));
  const nums = byLang.de.map((r) => r.n);
  const entries = [...final.entries()].filter(([k]) => k.startsWith(celex + '|'));
  const used = new Set(entries.map(([k]) => k.split('|')[3]));
  let include = p1[celex].include === 'all' ? nums : [...new Set([...p1[celex].include, ...used])];
  include = include.sort((x, y) => +x - +y);
  for (const n of used) if (!include.includes(n)) throw new Error(`${celex}: (${n}) zugeordnet, aber nicht aufgenommen`);
  const recitals = {}, fn = {};
  for (const n of include) {
    recitals[n] = {};
    for (const l of LANGS) {
      const r = byLang[l].find((x) => x.n === n);
      if (!r) throw new Error(`${celex} ${l}: Erwägungsgrund (${n}) fehlt`);
      recitals[n][l] = r.t;
      if (r.fn) (fn[n] = fn[n] || {})[l] = r.fn;
    }
  }
  // Gruppieren nach unit|key|strength
  const groups = new Map();
  for (const [k, v] of entries) {
    const [, unit, key, n] = k.split('|');
    const g = `${unit}|${key}|${v.s}`;
    if (!groups.has(g)) groups.set(g, { unit, key: key === '*' ? null : key, recitals: [], strength: v.s === 'd' ? 'direct' : 'thematic', whys: [] });
    const G = groups.get(g); G.recitals.push(n); G.whys.push([n, v.why]);
  }
  const map = [...groups.values()].map((G) => {
    const order = G.recitals.map((n, i) => [n, G.whys[i][1]]).sort((x, y) => +x[0] - +y[0]);
    return { unit: G.unit, key: G.key, recitals: order.map((o) => o[0]), strength: G.strength,
      why: order.length === 1 ? order[0][1] : order.map(([n, w]) => `(${n}) ${w}`).join('; ') };
  });
  map.sort((x, y) => (x.unit + '|' + (x.key || '')).localeCompare(y.unit + '|' + (y.key || ''), 'en', { numeric: true }) || (x.strength === 'direct' ? -1 : 1));
  out[celex] = {
    selection: p1[celex].include === 'all' ? 'all' : 'sbc-related',
    total: nums.length,
    recitals,
    ...(Object.keys(fn).length ? { fn } : {}),
    map,
    editorial: true,
  };
}
const file = ROOT + 'data/rationale.json';
writeFileSync(file + '.tmp', JSON.stringify(out, null, 1) + '\n');
renameSync(file + '.tmp', file);
for (const [c, v] of Object.entries(out)) console.log(c, 'total', v.total, 'aufgenommen', Object.keys(v.recitals).length, 'map', v.map.length, 'direct', v.map.filter((m) => m.strength === 'direct').length, 'thematic', v.map.filter((m) => m.strength === 'thematic').length);
