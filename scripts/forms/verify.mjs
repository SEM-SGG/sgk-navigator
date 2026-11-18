// Prüfung von data/forms.json: Schema, Bezug zum Datensatz, Sprachkonsistenz der Schlüssel, Fassungsvergleich,
// Gegenprüfung mit dem verborgenen EUR-Lex-Bildtext und mit dem Wortlaut des Änderungsakts 2017/2225.
// Aufruf: node scripts/forms/verify.mjs [--json]
import { readFileSync, existsSync } from 'node:fs';
import { getVersion } from '../../src/core/model.js';

const ROOT = new URL('../../', import.meta.url).pathname;
const LANGS = ['de', 'fr', 'en'];
const ALLOWED = /<(?!\/?(i|b|sup|sub|br)>)/;
export const canon = (t) => t.replace(/<br>/g, ' ').replace(/<[^>]+>/g, '').replace(/[☐□\uE000-\uF8FF]/g, '').replace(/…/g, ' ').replace(/[’']/g, '’')
  .replace(/\s+([,.:;)])/g, '$1').replace(/\s+/g, ' ').trim();
const words = (t) => canon(t).split(' ').filter(Boolean);

function lcsDiff(a, b) { // Wortfolgen-Diff: Wörter nur in a, nur in b
  const n = a.length, m = b.length, D = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) D[i][j] = a[i] === b[j] ? D[i + 1][j + 1] + 1 : Math.max(D[i + 1][j], D[i][j + 1]);
  const onlyA = [], onlyB = []; let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { i++; j++; } else if (j < m && (i === n || D[i][j + 1] >= D[i + 1][j])) onlyB.push(b[j++]); else onlyA.push(a[i++]);
  }
  return { common: D[0][0], onlyA, onlyB };
}

export function verify() {
  const F = JSON.parse(readFileSync(ROOT + 'data/forms.json', 'utf8'));
  const ds = JSON.parse(readFileSync(ROOT + 'data/dataset.json', 'utf8'));
  const assets = JSON.parse(readFileSync(ROOT + 'data/assets.json', 'utf8'));
  const res = { entries: F.length, blocks: 0, illegible: 0, schema: [], dataset: [], coverage: [], langKeys: [], versions: {}, hidden: [], amending: [] };
  const stageIds = ds.stages.map((s) => s.id);
  // Schema und Bezug
  for (const e of F) {
    const id = `${e.unit} ${e.key} ${e.lang} ${e.asset}`;
    if (!LANGS.includes(e.lang) || typeof e.unit !== 'string' || typeof e.key !== 'string' || !Array.isArray(e.stages) || !e.stages.length || !Array.isArray(e.blocks)) res.schema.push(`${id}: Grundfelder`);
    if (e.method !== 'transcription' || e.checked !== 'double') res.schema.push(`${id}: method/checked`);
    if (!e.layoutNote || LANGS.some((l) => typeof e.layoutNote[l] !== 'string' || !e.layoutNote[l])) res.schema.push(`${id}: layoutNote`);
    if (!e.noText && !e.blocks.length) res.schema.push(`${id}: keine Blöcke ohne noText`);
    if (e.noText && e.blocks.length) res.schema.push(`${id}: noText mit Blöcken`);
    const keys = new Set();
    for (const b of e.blocks) {
      res.blocks++;
      if (!/^f[A-Za-z0-9]+(\.[a-z]+\d+)*$/.test(b.k)) res.schema.push(`${id}: Schlüssel ${b.k}`);
      if (keys.has(b.k)) res.schema.push(`${id}: Schlüssel doppelt ${b.k}`); keys.add(b.k);
      if (typeof b.l !== 'string' || typeof b.t !== 'string' || !b.t) res.schema.push(`${id} ${b.k}: l/t`);
      if (ALLOWED.test(b.t) || ALLOWED.test(b.l)) res.schema.push(`${id} ${b.k}: unerlaubtes Tag`);
      if (/[_]{2,}|\.{4,}/.test(b.t)) res.schema.push(`${id} ${b.k}: Ausfülllinie nicht als …`);
      res.illegible += (b.t.match(/\[unleserlich\]/g) || []).length;
    }
    if (!assets[e.asset]) res.dataset.push(`${id}: Asset fehlt in assets.json`);
    for (const st of e.stages) {
      if (!stageIds.includes(st)) { res.dataset.push(`${id}: Stand ${st} unbekannt`); continue; }
      const v = getVersion(ds, e.unit, e.lang, st);
      if (!v || !v.blocks.some((b) => b.ty === 'img' && b.k === e.key && b.asset === e.asset)) res.dataset.push(`${id}: im Stand ${st} kein solcher Bild-Block`);
    }
  }
  // Vollständigkeit: jeder Bild-Block jedes Stands hat genau einen Eintrag
  for (const uid of Object.keys(ds.units)) for (const lang of LANGS) for (const st of ds.stages) {
    if (!st.langs.includes(lang)) continue;
    const v = getVersion(ds, uid, lang, st.id); if (!v) continue;
    for (const b of v.blocks) if (b.ty === 'img') {
      const n = F.filter((e) => e.unit === uid && e.key === b.k && e.lang === lang && e.asset === b.asset && e.stages.includes(st.id)).length;
      if (n !== 1) res.coverage.push(`${uid} ${b.k} ${lang} ${st.id}: ${n} Einträge`);
    }
  }
  // Sprachkonsistenz der Schlüssel je Einheit/Bild-Schlüssel/Stand (nur Sprachen des Stands)
  for (const st of ds.stages) {
    const byKey = new Map();
    for (const e of F.filter((x) => x.stages.includes(st.id))) {
      const g = `${e.unit}|${e.key}`; if (!byKey.has(g)) byKey.set(g, {}); byKey.get(g)[e.lang] = e.blocks.map((b) => b.k).join(',');
    }
    for (const [g, m] of byKey) {
      const ls = st.langs.filter((l) => m[l] !== undefined);
      if (ls.length !== st.langs.length) res.langKeys.push(`${st.id} ${g}: Sprachen ${ls.join(',')}`);
      if (new Set(ls.map((l) => m[l])).size > 1) res.langKeys.push(`${st.id} ${g}: Schlüsselmengen verschieden`);
    }
  }
  // Fassungsvergleich (gleiche Einheit/Schlüssel/Sprache, verschiedene Bilder)
  const groups = new Map();
  for (const e of F) { const g = `${e.unit}|${e.key}|${e.lang}`; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(e); }
  for (const [g, list] of groups) if (list.length > 1) for (let i = 1; i < list.length; i++) {
    const a = list[i - 1], b = list[i];
    const ka = new Map(a.blocks.map((x) => [x.k, x.t])), kb = new Map(b.blocks.map((x) => [x.k, x.t]));
    res.versions[`${g} ${a.stages[0]}→${b.stages[0]}`] = {
      same: [...ka.keys()].filter((k) => kb.get(k) === ka.get(k)).length,
      changed: [...ka.keys()].filter((k) => kb.has(k) && kb.get(k) !== ka.get(k)),
      added: [...kb.keys()].filter((k) => !ka.has(k)), removed: [...ka.keys()].filter((k) => !kb.has(k)),
    };
  }
  // Gegenprüfung 1: verborgener EUR-Lex-Bildtext (scripts/forms/work/images.json, von extract-images.mjs)
  const imgFile = ROOT + 'scripts/forms/work/images.json';
  if (existsSync(imgFile)) {
    const raw = JSON.parse(readFileSync(imgFile, 'utf8')).raw;
    const seen = new Set();
    for (const r of raw) {
      if (!r.hidden || seen.has(r.hash)) continue;
      const e = F.find((x) => x.asset === r.hash); if (!e) continue;
      seen.add(r.hash);
      const mine = words(e.blocks.map((b) => (b.l || '') + ' ' + b.t).join(' ')), hid = words(r.hidden.join(' '));
      const d = lcsDiff(mine, hid);
      res.hidden.push({ asset: r.hash, unit: e.unit, key: e.key, lang: e.lang, source: r.file, wordsMine: mine.length, wordsHidden: hid.length, common: d.common, onlyMine: d.onlyA, onlyHidden: d.onlyB });
    }
  }
  // Gegenprüfung 2: Wortlaut der Ergänzungen in VO (EU) 2017/2225 (Text, nicht Bild)
  const AMEND = {
    de: [['hat sich geweigert', 'durchzuführen.', ['fJ', 'fJ.n1', 'fJ.n2']], ['(vom Grenzschutzbeamten', 'gelöscht werden.', ['f20.n1', 'f20.s1', 'f20.s2']]],
    fr: [['a refusé de fournir', 'aux frontières.', ['fJ', 'fJ.n1', 'fJ.n2']], ['(à cocher', 'de façon illicite.', ['f20.n1', 'f20.s1', 'f20.s2']]],
    en: [['has refused to provide', 'border checks.', ['fJ', 'fJ.n1', 'fJ.n2']], ['(to be marked', 'be erased.', ['f20.n1', 'f20.s1', 'f20.s2']]],
  };
  for (const l of LANGS) {
    const f = `${ROOT}raw/32017R2225_${l.toUpperCase()}.html`; if (!existsSync(f)) { res.amending.push({ lang: l, missing: true }); continue; }
    const s = readFileSync(f, 'utf8').replace(/<\/p>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
    const e = F.find((x) => x.unit === 'anx_V' && x.lang === l && x.stages.includes('s03'));
    for (const [a, z, ks] of AMEND[l]) {
      const i = s.indexOf(a), j = s.indexOf(z, i) + z.length;
      const src = words(s.slice(i, j));
      const mine = words(e.blocks.filter((b) => ks.includes(b.k)).map((b) => b.t).join(' '));
      const d = lcsDiff(mine, src);
      res.amending.push({ lang: l, part: ks[0], found: i >= 0, wordsMine: mine.length, wordsAct: src.length, common: d.common, onlyMine: d.onlyA, onlyAct: d.onlyB });
    }
  }
  // Gegenprüfung 3: Schildtext gegen die Überschrift im Datensatz (Anhang III Teil B1, B2, E; Gross-/Kleinschreibung und Zeilenumbruch ignoriert)
  res.headings = [];
  const low = (t) => canon(t).toLowerCase().replace(/[„“”‘’«»;.]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [img, head] of [['ptB1.g1', 'ptB1'], ['ptB2.g1', 'ptB2'], ['ptE.g1', 'ptE']]) for (const e of F.filter((x) => x.unit === 'anx_III' && x.key === img)) {
    const v = getVersion(ds, 'anx_III', e.lang, e.stages[e.stages.length - 1]);
    const h = v.blocks.find((b) => b.k === head)?.t || '';
    const sign = low(e.blocks.map((b) => b.t).join(' '));
    res.headings.push({ key: img, lang: e.lang, sign, heading: low(h), ok: low(h).includes(sign) });
  }
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = verify();
  if (process.argv.includes('--json')) { console.log(JSON.stringify(r, null, 1)); process.exit(0); }
  console.log(`Einträge ${r.entries}, Textblöcke ${r.blocks}, [unleserlich] ${r.illegible}`);
  for (const k of ['schema', 'dataset', 'coverage', 'langKeys']) { console.log(`${k}: ${r[k].length} Probleme`); r[k].forEach((x) => console.log('  ' + x)); }
  console.log('Fassungsvergleich:'); for (const [g, v] of Object.entries(r.versions)) console.log(`  ${g}: gleich ${v.same}, geändert ${v.changed.join(',') || '–'}, neu ${v.added.join(',') || '–'}, entfallen ${v.removed.join(',') || '–'}`);
  console.log('Verborgener Bildtext:'); for (const h of r.hidden) console.log(`  ${h.unit} ${h.key} ${h.lang} ${h.asset} (${h.source}): Wörter ${h.wordsMine}/${h.wordsHidden}, gemeinsam ${h.common}; nur Transkription: ${h.onlyMine.join(' ') || '–'} | nur Bildtext: ${h.onlyHidden.join(' ') || '–'}`);
  console.log('Schild/Überschrift:'); for (const h of r.headings) console.log(`  ${h.key} ${h.lang}: ${h.ok ? 'gleich' : 'ABWEICHUNG'} («${h.sign}» in «${h.heading}»)`);
  console.log('Änderungsakt 2017/2225:'); for (const a of r.amending) console.log(`  ${a.lang} ${a.part}: Wörter ${a.wordsMine}, gemeinsam ${a.common}; nur Transkription: ${a.onlyMine?.join(' ') || '–'} | nur Akt: ${a.onlyAct?.join(' ') || '–'}`);
}
