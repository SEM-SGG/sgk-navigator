// Äquivalenz Upload ↔ zentraler Build (test/app/equiv.test.mjs, test/app/equiv.spec.mjs).
// Vergleicht für einen Stand und eine Sprache zwei Datensätze desselben Werks: den zentral gebauten (data/…) und den
// Datensatz einer Testvariante ohne diesen Stand, in die die EUR-Lex-Dateien der Fassung hochgeladen wurden.
// Geprüft wird mit den Funktionen der Anwendung (Data, compareRows, unitSteps, refIndex/buildRefIndex).
// Ergebnis: Liste von Abweichungen { cat, unit, key?, lang, detail }; erklärbare Abweichungen markiert explain() mit Grund.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { normText } from '../../../src/core/text.js';
import { lastStage, lastConsolidatedStage, dropStage } from '../../../scripts/lib-variant.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (p) => JSON.parse(readFileSync(ROOT + p, 'utf8'));
export const LANGS = ['de', 'fr', 'en'];
export const LIVE = ROOT + 'test/app/fixtures-live/';

/** Werkindex wie im Build (sgk-works). */
export function worksIndex() {
  return read('data/works/index.json').map((w) => ({ id: w.id, celex: w.celex, number: w.number, short: w.short, abbr: w.abbr, full: !!w.full, assets: !!w.assets }));
}

/** Datensatz und Akte eines Werks wie im Build eingebettet (SGK mit Einheit Erwägungsgründe). */
export function loadWork(id) {
  const idx = read('data/works/index.json');
  const w = idx.find((x) => x.id === id);
  if (id === 'sgk') {
    let ds = read('data/dataset.json');
    const r = w.recitals && existsSync(ROOT + 'data/works/' + w.recitals) ? read('data/works/' + w.recitals) : null;
    if (r && r.unit && !ds.units[r.unit.id]) ds = { ...ds, units: { [r.unit.id]: r.unit, ...ds.units }, toc: [r.toc, ...ds.toc] };
    return { dataset: ds, acts: read('data/acts.json'), work: worksIndex().find((x) => x.id === id) };
  }
  return { dataset: read('data/works/' + w.dataset), acts: w.acts ? read('data/works/' + w.acts) : [], work: worksIndex().find((x) => x.id === id) };
}

/** Jüngster Stand, den die Testvariante entfernt (wie build.mjs --drop-stage last-consolidated bzw. --drop-work-stage <id>:last). */
export function targetStage(id, ds) { return id === 'sgk' ? lastConsolidatedStage(ds) : lastStage(ds); }

/** Testvariante: Kopie ohne den jüngsten Stand. */
export function variantOf(id, ds) {
  const c = structuredClone(ds);
  return dropStage(c, targetStage(id, c));
}

export const fixtureFile = (celex, lang) => `${LIVE}${celex}_${lang.toUpperCase()}.html`;
export const haveFixtures = (celex) => LANGS.every((l) => existsSync(fixtureFile(celex, l)));

// ------------------------------------------------------------------ Vergleich
const nt = (b) => (b.ty === 'img' ? 'IMG' : normText(b.t || b.html || '', { caseFold: b.ty === 'heading' }));
const nl = (l) => normText(l || '').replace(/\s+/g, '');

/**
 * Vergleicht Stand sa (Datensatz A = zentral) mit sb (B = Upload) in einer Sprache.
 * A, B: Data-Instanzen; ui: { compareRows, unitSteps }; worksIdx für refIndex.
 */
export function compareStage(A, B, sa, sb, lang, ui) {
  const out = [];
  const push = (cat, unit, key, detail) => out.push({ cat, unit, key: key ?? null, lang, detail });
  const units = [...new Set([...A.unitOrder, ...B.unitOrder])];
  const alive = (D, u, s) => { const v = D.version(u, lang, s); return v && !v.repealed ? v : null; };
  const pa = A.prevStage(sa), pb = B.prevStage(sb);
  // (a) Einheiten, Blöcke, Schlüssel, Text
  for (const u of units) {
    const va = alive(A, u, sa), vb = alive(B, u, sb);
    if (!va && !vb) continue;
    if (!va || !vb) { push('a.unit', u, null, `${va ? 'nur zentral' : 'nur Upload'}`); continue; }
    if (normText(va.title || '', { caseFold: true }) !== normText(vb.title || '', { caseFold: true })) push('a.title', u, null, `${va.title} | ${vb.title}`);
    const ka = va.blocks.map((b) => b.k), kb = vb.blocks.map((b) => b.k);
    if (ka.join('|') !== kb.join('|')) {
      const sA = new Set(ka), sB = new Set(kb);
      push('a.keys', u, null, `nur zentral: ${ka.filter((k) => !sB.has(k)).join(', ') || '-'}; nur Upload: ${kb.filter((k) => !sA.has(k)).join(', ') || '-'}${ka.filter((k) => sB.has(k)).join('|') !== kb.filter((k) => sA.has(k)).join('|') ? '; Reihenfolge' : ''}`);
    }
    const bm = new Map(vb.blocks.map((b) => [b.k, b]));
    for (const a of va.blocks) {
      const b = bm.get(a.k);
      if (!b) continue;
      if (a.ty !== b.ty) push('a.type', u, a.k, `${a.ty} | ${b.ty}`);
      if (nt(a) !== nt(b)) push('a.text', u, a.k, `${nt(a).slice(0, 120)} | ${nt(b).slice(0, 120)}`);
      if (nl(a.l) !== nl(b.l)) push('a.label', u, a.k, `${a.l} | ${b.l}`);
      if ((a.o || '') !== (b.o || '')) push('a.origin', u, a.k, `${a.o} | ${b.o}`);
      if ((a.d ?? 0) !== (b.d ?? 0)) push('a.depth', u, a.k, `${a.d} | ${b.d}`);
      if ((a.x || '') !== (b.x || '')) push('a.flag', u, a.k, `${a.x || '-'} | ${b.x || '-'}`);
      if ((a.nt || '') !== (b.nt || '')) push('a.note', u, a.k, 'Hinweistext');
      if (a.ty === 'img' && (a.asset || null) !== (b.asset || null)) push('a.asset', u, a.k, `${a.asset} | ${b.asset}`);
    }
  }
  // (b) Verweisindex des Stands
  const ra = A.refIndex(lang, sa), rb = B.refIndex(lang, sb);
  const refSig = (l) => JSON.stringify((l || []).map((r) => ({ text: r.text, t: (r.targets || [r.target]).map((x) => ({ kind: x.kind, unit: x.unit, key: x.key, celex: x.celex, work: x.work })) })));
  for (const src of new Set([...Object.keys(ra.out), ...Object.keys(rb.out)])) {
    if (refSig(ra.out[src]) !== refSig(rb.out[src])) push('b.out', src.split('#')[0], src.split('#')[1], `${refSig(ra.out[src]).slice(0, 160)} | ${refSig(rb.out[src]).slice(0, 160)}`);
  }
  const inSig = (l) => JSON.stringify((l || []).map((e) => `${e.unit}#${e.key}>${e.targetKey}:${e.text}`).sort());
  for (const k of new Set([...Object.keys(ra.in), ...Object.keys(rb.in)])) {
    if (inSig(ra.in[k]) !== inSig(rb.in[k])) push('b.in', k.split('#')[0], k.split('#')[1], `${(ra.in[k] || []).length} | ${(rb.in[k] || []).length}`);
  }
  // (c) Vergleich/Redline gegen den Vorgänger (compareRows wie die Ansicht «Vergleich»)
  for (const u of units) {
    if (!alive(A, u, sa) && !alive(B, u, sb) && !alive(A, u, pa.id) && !alive(B, u, pb.id)) continue;
    const ca = ui.compareRows(A, u, { a: pa.id, b: sa, la: lang, lb: lang, key: null, mode: 'stand' });
    const cb = ui.compareRows(B, u, { a: pb.id, b: sb, la: lang, lb: lang, key: null, mode: 'stand' });
    const sig = (c) => c.rows.filter((r) => r.status !== 'same').map((r) => `${r.k}:${r.status}`).join(' ');
    if (sig(ca) !== sig(cb)) push('c.diff', u, null, `${sig(ca) || '-'} | ${sig(cb) || '-'}`);
    if (!!ca.titleChanged !== !!cb.titleChanged) push('c.title', u, null, `${ca.titleChanged} | ${cb.titleChanged}`);
    // Redline-Text der geänderten Blöcke
    const rl = (c) => new Map(c.rows.filter((r) => r.status === 'changed' && r.left && r.right && r.right.ty !== 'img' && r.right.ty !== 'table').map((r) => [r.k, ui.diffText(ui.safeInline(r.left.t), ui.safeInline(r.right.t)).redline]));
    const xa = rl(ca), xb = rl(cb);
    for (const [k, h] of xa) if (xb.has(k) && normText(h) !== normText(xb.get(k))) push('c.redline', u, k, 'Redline weicht ab');
  }
  // (d) Chronologie: geänderte Einheiten des Stands (changesOfStage) und Schritte je Einheit (unitSteps)
  const chA = new Set(A.changes(sa, lang).map((c) => c.unit)), chB = new Set(B.changes(sb, lang).map((c) => c.unit));
  for (const u of new Set([...chA, ...chB])) if (chA.has(u) !== chB.has(u)) push('d.changed', u, null, chA.has(u) ? 'nur zentral geändert' : 'nur Upload geändert');
  const chKeys = (D, s) => new Map(D.changes(s, lang).map((c) => [`${c.unit}#${c.key}`, c.change]));
  const kA = chKeys(A, sa), kB = chKeys(B, sb);
  for (const k of new Set([...kA.keys(), ...kB.keys()])) if (kA.get(k) !== kB.get(k)) push('d.change', k.split('#')[0], k.split('#')[1], `${kA.get(k) || '-'} | ${kB.get(k) || '-'}`);
  for (const u of new Set([...chA, ...chB])) {
    const st = (D, s) => { const x = ui.unitSteps(D, u, lang).find((y) => y.stage === s); return x ? x.items.map((i) => `${i.key}:${i.change}`).join(' ') : '-'; };
    if (st(A, sa) !== st(B, sb)) push('d.steps', u, null, `${st(A, sa)} | ${st(B, sb)}`);
  }
  return out;
}

/** (e) Sprachvergleich: gleiche Blockstruktur über die Sprachen (Schlüsselliste je Einheit) – Abweichungen zentral vs. Upload. */
export function compareLangStructure(A, B, sa, sb) {
  const out = [];
  const units = [...new Set([...A.unitOrder, ...B.unitOrder])];
  const keys = (D, u, l, s) => { const v = D.version(u, l, s); return v && !v.repealed ? v.blocks.map((b) => b.k).join('|') : '-'; };
  for (const u of units) {
    const same = (D, s) => { const k = LANGS.map((l) => keys(D, u, l, s)); return k.every((x) => x === k[0]); };
    const a = same(A, sa), b = same(B, sb);
    if (a !== b) out.push({ cat: 'e.langs', unit: u, key: null, lang: '*', detail: `zentral ${a ? 'gleich' : 'verschieden'}, Upload ${b ? 'gleich' : 'verschieden'}` });
  }
  return out;
}

/** Stand-Metadaten (erklärbare Unterschiede): act, acts, source.kind, langs, date, note */
export function compareStageMeta(sA, sB) {
  const out = [];
  for (const f of ['act', 'date', 'order', 'id']) if (JSON.stringify(sA[f]) !== JSON.stringify(sB[f])) out.push({ field: f, central: sA[f], upload: sB[f] });
  if (JSON.stringify(sA.acts || null) !== JSON.stringify(sB.acts || null)) out.push({ field: 'acts', central: sA.acts, upload: sB.acts });
  if (JSON.stringify(sA.langs) !== JSON.stringify(sB.langs)) out.push({ field: 'langs', central: sA.langs, upload: sB.langs });
  if ((sA.source || {}).kind !== (sB.source || {}).kind) out.push({ field: 'source.kind', central: sA.source.kind, upload: sB.source.kind });
  if (!!(sA.source || {}).note !== !!(sB.source || {}).note) out.push({ field: 'source.note', central: !!sA.source.note, upload: !!sB.source.note });
  return out;
}
