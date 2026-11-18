// Abgleich der zwei unabhängigen Lesungen (pass1.json, pass2.json) je Asset.
// Vergleich über die Blockfolge (Ausrichtung nach Textähnlichkeit), nicht über die Schlüssel (die Durchgänge nummerieren verschieden).
// Ausgabe: scripts/forms/work/compare.json und Zusammenfassung auf stdout.
// Aufruf: node scripts/forms/compare.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const ROOT = new URL('../../', import.meta.url).pathname;
const p1 = JSON.parse(readFileSync(ROOT + 'scripts/forms/pass1.json', 'utf8'));
const p2 = JSON.parse(readFileSync(ROOT + 'scripts/forms/pass2.json', 'utf8'));

export function expand1(h) {
  const v = p1[h]; if (!v) return null;
  let blocks = v.base ? expand1(v.base).map((b) => ({ ...b })) : (v.blocks || []).map(([k, l, t, o]) => ({ k, l, t, ...(o || {}) }));
  if (v.insertAfter) for (const [after, add] of Object.entries(v.insertAfter)) {
    const i = blocks.findIndex((b) => b.k === after);
    if (i < 0) throw new Error(`${h}: insertAfter ${after} fehlt`);
    blocks.splice(i + 1, 0, ...add.map(([k, l, t, o]) => ({ k, l, t, ...(o || {}) })));
  }
  if (v.blocks && v.base) throw new Error('base und blocks');
  return blocks;
}
// Vergleichsform: Tags weg, Leerzeichen vereinheitlicht, Ausfülllinien als …, Kästchen weg
export const canon = (t) => t.replace(/<br>/g, ' ').replace(/<[^>]+>/g, '').replace(/[☐□]/g, '').replace(/_{2,}/g, '…').replace(/\.{4,}/g, '…')
  .replace(/\s*…\s*/g, ' … ').replace(/\s+/g, ' ').trim();
const sim = (a, b) => { // Bigramm-Dice
  const g = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const x = s.slice(i, i + 2); m.set(x, (m.get(x) || 0) + 1); } return m; };
  if (a === b) return 1; if (a.length < 2 || b.length < 2) return 0;
  const A = g(a), B = g(b); let n = 0; for (const [x, c] of A) n += Math.min(c, B.get(x) || 0);
  return 2 * n / (a.length + b.length - 2);
};
function align(a, b) { // Needleman-Wunsch auf Blockebene
  const n = a.length, m = b.length, S = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0)), T = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(''));
  for (let i = 1; i <= n; i++) { S[i][0] = -0.5 * i; T[i][0] = 'u'; } for (let j = 1; j <= m; j++) { S[0][j] = -0.5 * j; T[0][j] = 'l'; }
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const s = sim(a[i - 1].c, b[j - 1].c); const d = S[i - 1][j - 1] + (s > 0.5 ? s : -1), u = S[i - 1][j] - 0.5, l = S[i][j - 1] - 0.5;
    if (d >= u && d >= l) { S[i][j] = d; T[i][j] = 'd'; } else if (u >= l) { S[i][j] = u; T[i][j] = 'u'; } else { S[i][j] = l; T[i][j] = 'l'; }
  }
  const out = []; let i = n, j = m;
  while (i > 0 || j > 0) { const t = T[i][j]; if (t === 'd') { out.push([a[i - 1], b[j - 1]]); i--; j--; } else if (t === 'u') { out.push([a[i - 1], null]); i--; } else { out.push([null, b[j - 1]]); j--; } }
  return out.reverse();
}
export function compare() {
  const res = { assets: 0, blocks1: 0, blocks2: 0, equal: 0, equalExact: 0, diffs: [], only1: [], only2: [], missing: [] };
  for (const h of Object.keys(p2)) {
    if (h === '_doc') continue;
    res.assets++;
    const b1 = expand1(h); if (!b1) { res.missing.push(h); continue; }
    const A = b1.map((b) => ({ ...b, c: canon(b.t) })), B = p2[h].blocks.map((b) => ({ ...b, c: canon(b.t) }));
    res.blocks1 += A.length; res.blocks2 += B.length;
    for (const [x, y] of align(A, B)) {
      if (x && y) {
        if (x.c === y.c) { res.equal++; if (x.t.replace(/<br>/g, ' ') === y.t.replace(/<br>/g, ' ')) res.equalExact++; else res.diffs.push({ h, kind: 'markup', k1: x.k, k2: y.k, t1: x.t, t2: y.t }); }
        else res.diffs.push({ h, kind: 'text', k1: x.k, k2: y.k, t1: x.t, t2: y.t });
      } else if (x) res.only1.push({ h, k: x.k, t: x.t }); else res.only2.push({ h, k: y.k, t: y.t });
    }
  }
  for (const h of Object.keys(p1)) if (h !== '_doc' && !p2[h]) res.missing.push('nur pass1: ' + h);
  return res;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = compare();
  writeFileSync(ROOT + 'scripts/forms/work/compare.json', JSON.stringify(r, null, 1));
  console.log(`Assets ${r.assets}; Blöcke pass1 ${r.blocks1}, pass2 ${r.blocks2}; Text gleich ${r.equal} (davon auch Auszeichnung gleich ${r.equalExact}); Textabweichungen ${r.diffs.filter((d) => d.kind === 'text').length}; nur Auszeichnung ${r.diffs.filter((d) => d.kind === 'markup').length}; nur pass1 ${r.only1.length}; nur pass2 ${r.only2.length}; fehlend ${r.missing.length}`);
}
