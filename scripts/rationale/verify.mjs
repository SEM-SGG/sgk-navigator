// Maschinelle Prüfung von data/rationale.json. Unabhängig vom Extraktor: Wortlaut per Regex direkt aus dem Roh-HTML.
// Aufruf: node scripts/rationale/verify.mjs [--json]
import { readFileSync } from 'node:fs';
import { getVersion } from '../../src/core/model.js';

const ROOT = new URL('../../', import.meta.url).pathname;
const LANGS = ['de', 'fr', 'en'];
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e] ?? m));
const norm = (s) => s.replace(/[\s  -   　]+/g, ' ').trim();

// Klartext eines Erwägungsgrunds direkt aus dem HTML (ohne DOM): Fussnotenanker entfernen, Tags entfernen
export function rawRecitalTexts(html) {
  const out = new Map();
  const re = /<div class="eli-subdivision" id="rct_(\d+)">/g;
  const starts = [...html.matchAll(re)].map((m) => [m[1], m.index]);
  for (let i = 0; i < starts.length; i++) {
    const [n, at] = starts[i];
    let end = i + 1 < starts.length ? starts[i + 1][1] : html.indexOf('</table>', at) + 8;
    let seg = html.slice(at, end);
    seg = seg.replace(/<a [^>]*href="#ntr[^"]*"[^>]*>[\s\S]*?<\/a>/g, ' ');
    seg = seg.replace(/<[^>]+>/g, ' ');
    let t = norm(decode(seg));
    t = t.replace(/^\(\d+\)\s*/, '');
    out.set(n, t);
  }
  return out;
}
const ourText = (h) => norm(decode(h.replace(/<br>/g, ' ').replace(/<[^>]+>/g, ' ')));
// Satzzeichen nach entferntem Fussnotenanker: Regex-Variante lässt ein Leerzeichen stehen ("Rates , ")
const squash = (s) => s.replace(/ ([,.;:)])/g, '$1').replace(/\( /g, '(');

export function verify() {
  const R = JSON.parse(readFileSync(ROOT + 'data/rationale.json', 'utf8'));
  const ds = JSON.parse(readFileSync(ROOT + 'data/dataset.json', 'utf8'));
  const acts = JSON.parse(readFileSync(ROOT + 'data/acts.json', 'utf8'));
  const res = { wording: { checked: 0, equal: 0, diffs: [] }, numbers: { problems: [] }, targets: { checked: 0, problems: [] }, coverage: {} };
  for (const [celex, A] of Object.entries(R)) {
    const raw = Object.fromEntries(LANGS.map((l) => [l, rawRecitalTexts(readFileSync(`${ROOT}raw/${celex}_${l.toUpperCase()}.html`, 'utf8'))]));
    // Nummern: Gesamtzahl je Sprache gleich, jede aufgenommene Nummer in allen Sprachen
    const counts = LANGS.map((l) => raw[l].size);
    if (new Set(counts).size !== 1 || counts[0] !== A.total) res.numbers.problems.push(`${celex}: Anzahl ${counts.join('/')} vs total ${A.total}`);
    for (const [n, byL] of Object.entries(A.recitals)) {
      for (const l of LANGS) {
        if (typeof byL[l] !== 'string' || !byL[l]) { res.numbers.problems.push(`${celex} (${n}) ${l} fehlt`); continue; }
        if (!raw[l].has(n)) { res.numbers.problems.push(`${celex} (${n}) ${l} nicht in Quelle`); continue; }
        res.wording.checked++;
        const x0 = ourText(byL[l]), y0 = raw[l].get(n);
        if (x0 === y0) res.wording.exact = (res.wording.exact || 0) + 1;
        const x = squash(x0), y = squash(y0);
        if (x === y) res.wording.equal++;
        else { let i = 0; while (x[i] === y[i]) i++; res.wording.diffs.push(`${celex} (${n}) ${l} @${i}: «${x.slice(Math.max(0, i - 30), i + 40)}» / «${y.slice(Math.max(0, i - 30), i + 40)}»`); }
      }
    }
    // Ziele
    const act = acts.find((a) => a.celex === celex);
    const si = ds.stages.findIndex((s) => s.act === celex);
    const stage = ds.stages[si].id, prev = ds.stages[si - 1].id;
    const changes = act.changes.map((c) => ({ ...c, key: c.key || null }));
    const keyExists = (unit, key) => {
      if (unit.startsWith('tit_')) return key === 'heading' && ds.toc.some((t) => t.id === unit);
      if (!ds.units[unit]) return false;
      if (key == null) return true;
      return LANGS.every((l) => [stage, prev].some((st) => { const v = getVersion(ds, unit, l, st); return v && v.blocks.some((b) => b.k === key); }));
    };
    const coveredBy = (c, m) => m.unit === c.unit && (m.key == null || c.key == null || m.key === c.key || m.key.startsWith(c.key + '.') || c.key.startsWith(m.key + '.'));
    for (const m of A.map) {
      res.targets.checked++;
      if (!keyExists(m.unit, m.key)) res.targets.problems.push(`${celex} ${m.unit} ${m.key}: nicht im Datensatz`);
      const ok = changes.some((c) => c.unit === m.unit && (c.key == null || m.key === c.key || (m.key && m.key.startsWith(c.key + '.')) || (m.key == null)));
      if (!ok) res.targets.problems.push(`${celex} ${m.unit} ${m.key}: laut acts.json nicht von diesem Akt geändert`);
      for (const n of m.recitals) if (!A.recitals[n]) res.targets.problems.push(`${celex} ${m.unit} ${m.key}: (${n}) nicht aufgenommen`);
      if (!['direct', 'thematic'].includes(m.strength) || !m.why) res.targets.problems.push(`${celex} ${m.unit} ${m.key}: strength/why`);
    }
    const unmapped = changes.filter((c) => !A.map.some((m) => coveredBy(c, m)));
    // nur über eine Zuordnung zur ganzen Einheit (key null) erfasst, obwohl die Änderung einen Schlüssel hat
    const onlyUnitLevel = changes.filter((c) => c.key && !unmapped.includes(c) && !A.map.some((m) => m.key && coveredBy(c, m)));
    const units = [...new Set(changes.map((c) => c.unit))];
    res.coverage[celex] = {
      changes: changes.length, changesMapped: changes.length - unmapped.length,
      unmappedChanges: unmapped.map((c) => `${c.unit} ${c.key ?? '*'} (${c.action})`),
      onlyUnitLevel: onlyUnitLevel.map((c) => `${c.unit} ${c.key} (${c.action})`),
      units: units.length, unmappedUnits: units.filter((u) => !A.map.some((m) => m.unit === u)),
    };
  }
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = verify();
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 1));
  else {
    console.log(`Wortlaut: ${r.wording.equal}/${r.wording.checked} gleich (davon ${r.wording.exact} ohne jede Leerzeichen-Angleichung)`); r.wording.diffs.forEach((d) => console.log('  ' + d));
    console.log(`Nummern: ${r.numbers.problems.length} Probleme`); r.numbers.problems.forEach((d) => console.log('  ' + d));
    console.log(`Ziele: ${r.targets.checked} geprüft, ${r.targets.problems.length} Probleme`); r.targets.problems.forEach((d) => console.log('  ' + d));
    for (const [c, v] of Object.entries(r.coverage)) console.log(`${c}: Änderungen ${v.changesMapped}/${v.changes} zugeordnet; Einheiten ohne Zuordnung: ${v.unmappedUnits.join(', ') || '–'}; Änderungen ohne Zuordnung: ${v.unmappedChanges.join('; ') || '–'}; nur über Einheit (thematisch): ${v.onlyUnitLevel.join('; ') || '–'}`);
  }
}
