// Minimale Ersatzimplementierung der Modellfunktionen aus SPEC §5.5.
import { t } from './lib/i18n.js';
// Wird nur verwendet, solange src/core/model.js fehlt oder eine Funktion nicht exportiert.
// Generisch: kennt nur Werk, Stände, Einheiten, Blöcke.

const ordCache = new WeakMap();
function orders(ds) {
  let m = ordCache.get(ds);
  if (!m) {
    m = new Map();
    for (const s of ds.stages) m.set(s.id, s.order);
    ordCache.set(ds, m);
  }
  return m;
}
const ord = (ds, id) => orders(ds).get(id) ?? -1;
const sortedVersions = (ds, unitId, lang) => {
  const u = ds.units[unitId];
  if (!u || !u.versions || !u.versions[lang]) return [];
  return [...u.versions[lang]].sort((a, b) => ord(ds, a.stage) - ord(ds, b.stage));
};
export const blockSig = (b) => b ? `${b.t || ''}\u0001${b.html || ''}\u0001${b.asset || ''}` : null;

export function getVersion(ds, unitId, lang, stageId) {
  const target = ord(ds, stageId);
  let best = null;
  for (const v of sortedVersions(ds, unitId, lang)) if (ord(ds, v.stage) <= target) best = v;
  return best;
}

export function blockHistory(ds, unitId, lang, key) {
  const out = [];
  const stageAct = (id) => (ds.stages.find((s) => s.id === id) || {}).act || null;
  let prev; // undefined = noch keine Version gesehen
  const first = ds.stages[0] && ds.stages[0].id;
  for (const v of sortedVersions(ds, unitId, lang)) {
    const b = v.repealed ? null : (v.blocks || []).find((x) => x.k === key) || null;
    if (prev === undefined) {
      if (b) out.push({ stage: v.stage, act: b.o || stageAct(v.stage), change: v.stage === first ? 'base' : 'inserted', block: b });
      prev = b;
      continue;
    }
    if (!b && prev) out.push({ stage: v.stage, act: stageAct(v.stage), change: 'deleted', block: null });
    else if (b && !prev) out.push({ stage: v.stage, act: b.o || stageAct(v.stage), change: 'inserted', block: b });
    else if (b && prev && blockSig(b) !== blockSig(prev)) out.push({ stage: v.stage, act: b.o || stageAct(v.stage), change: 'replaced', block: b });
    prev = b;
  }
  return out;
}

export function composeAt(ds, unitId, lang, isActIncluded) {
  const vs = sortedVersions(ds, unitId, lang);
  const stageAct = (id) => (ds.stages.find((s) => s.id === id) || {}).act;
  let cur = null; // { label, title, blocks:[...], repealed }
  let prev = null;
  for (const v of vs) {
    const included = isActIncluded(stageAct(v.stage));
    if (!prev) {
      if (included) cur = { ...v, blocks: [...(v.blocks || [])] };
      prev = v;
      continue;
    }
    if (included) {
      if (!cur) cur = { ...v, blocks: [...(v.blocks || [])] };
      else {
        if (v.repealed) cur = { ...cur, repealed: true, blocks: [] };
        else {
          if (cur.repealed) cur = { ...cur, repealed: false };
          const pm = new Map((prev.blocks || []).map((b) => [b.k, b]));
          const nm = new Map((v.blocks || []).map((b) => [b.k, b]));
          let blocks = cur.blocks.filter((b) => !(pm.has(b.k) && !nm.has(b.k)));
          const idx = new Map(blocks.map((b, i) => [b.k, i]));
          blocks = blocks.map((b) => (nm.has(b.k) && pm.has(b.k) && blockSig(nm.get(b.k)) !== blockSig(pm.get(b.k)) ? nm.get(b.k) : b));
          // eingefügte Blöcke hinter ihrem Vorgänger aus der neuen Version einsetzen
          const list = v.blocks || [];
          for (let i = 0; i < list.length; i++) {
            const b = list[i];
            if (pm.has(b.k) || blocks.some((x) => x.k === b.k)) continue;
            let pos = 0;
            for (let j = i - 1; j >= 0; j--) {
              const at = blocks.findIndex((x) => x.k === list[j].k);
              if (at >= 0) { pos = at + 1; break; }
            }
            blocks.splice(pos, 0, b);
          }
          void idx;
          cur = { ...cur, label: v.label, title: v.title !== prev.title ? v.title : cur.title, blocks };
        }
      }
    }
    prev = v;
  }
  if (!cur) return null;
  return { ...cur, stage: null, computed: true };
}

export function changesOfStage(ds, stageId, lang) {
  const out = [];
  const o = ord(ds, stageId);
  for (const unitId of Object.keys(ds.units)) {
    const vs = sortedVersions(ds, unitId, lang);
    const i = vs.findIndex((v) => v.stage === stageId);
    if (i < 0) continue;
    const v = vs[i];
    const p = vs.slice(0, i).filter((x) => ord(ds, x.stage) < o).pop();
    if (!p) { if (i === 0 && ds.stages[0].id !== stageId) out.push({ unit: unitId, key: null, change: 'inserted' }); continue; }
    if (v.repealed && !p.repealed) { out.push({ unit: unitId, key: null, change: 'deleted' }); continue; }
    if (!v.repealed && p.repealed) { out.push({ unit: unitId, key: null, change: 'inserted' }); continue; }
    const pm = new Map((p.blocks || []).map((b) => [b.k, b]));
    const nm = new Map((v.blocks || []).map((b) => [b.k, b]));
    for (const b of v.blocks || []) {
      if (!pm.has(b.k)) out.push({ unit: unitId, key: b.k, change: 'inserted' });
      else if (blockSig(pm.get(b.k)) !== blockSig(b)) out.push({ unit: unitId, key: b.k, change: 'replaced' });
    }
    for (const b of p.blocks || []) if (!nm.has(b.k)) out.push({ unit: unitId, key: b.k, change: 'deleted' });
    if ((v.title || '') !== (p.title || '') && !out.some((c) => c.unit === unitId)) out.push({ unit: unitId, key: null, change: 'amended' });
  }
  return out;
}

export function addSnapshot() {
  throw new Error(t('upload.err.noCore'));
}
export function parseEurLex() {
  throw new Error(t('upload.err.noParser'));
}
