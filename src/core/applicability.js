// SGK-Navigator — Anwendbarkeit je Einzelaenderung (ESM, isomorph, ohne Abhaengigkeit von src/app)
//
// changeApplicability(acts, celex, unit, key, isoDate) -> { applicable, from, until, status, basis, change }
//   status: applicable | future | pending | proposal | expired | not-adopted | unknown
//   from:   Anwendungsdatum der Aenderung (applicableFrom der Aenderung, sonst application.date des Akts), null wenn offen
// composeAtDate(dataset, acts, derogations, unitId, lang, isoDate) -> { version, notices }
//   version: Wortlaut der Einheit mit allen am Datum anwendbaren Aenderungen (composeAt mit Blockpraedikat)
//   notices: [ { key|null, kind: "derogation"|"pending"|"future"|"expired", celex, note, basis, effect?, from?, until? } ]
// actApplicableAt(acts, celex, isoDate) -> boolean
// derogationsAt(derogations, unitId, isoDate) -> [ { entry, affect } ]
//
// Regeln
// - Ein Akt gilt am Datum, wenn application.date <= Datum. status "pending" (date null) gilt nie, Vorschlaege nie.
// - Eine Aenderung erbt das Datum des Akts; `changes[].applicableFrom` geht vor. `changes[].periods` begrenzen einzelne
//   Bloecke zeitlich ({ key, until }): nach `until` ist der Wortlaut verbraucht (status "expired"), bleibt aber im Text.
// - Zuordnung Block -> Aenderung: gleiche Einheit, laengster passender Schluessel (exakt, sonst Vorfahre; "" oder null = ganze Einheit).
// - Abweichungen (data/derogations.json) aendern den Wortlaut nicht; sie erscheinen als Hinweis (kind "derogation").
// - Vor der Veroeffentlichung eines Akts gibt es weder Wortlaut noch Hinweis (status "not-adopted").

import { composeAt } from './model.js';
import { normText } from './text.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function actIndex(acts) {
  if (!acts) return new Map();
  if (acts instanceof Map) return acts;
  if (acts.__idx) return acts.__idx;
  const m = new Map();
  for (const a of acts) {
    m.set(a.celex, a);
    if (a.alias) m.set(a.alias, a);
  }
  Object.defineProperty(acts, '__idx', { value: m, enumerable: false });
  return m;
}

function findAct(acts, celex) {
  const idx = actIndex(acts);
  if (idx.has(celex)) return idx.get(celex);
  return null;
}

function isPrefixKey(prefix, key) {
  if (prefix === '' || prefix === null || prefix === undefined) return true;
  if (!key) return false;
  return key === prefix || key.startsWith(prefix + '.');
}

// Aenderung eines Akts fuer (unit, key): exakt, sonst laengster Vorfahre, sonst Aenderung der ganzen Einheit
export function findChange(act, unit, key) {
  if (!act || !Array.isArray(act.changes)) return null;
  let best = null, bestLen = -1;
  for (const c of act.changes) {
    if (c.unit !== unit) continue;
    const ck = c.key === null || c.key === undefined ? '' : c.key;
    if (key === null || key === undefined || key === '') {
      if (ck === '' && bestLen < 0) { best = c; bestLen = 0; }
      continue;
    }
    if (isPrefixKey(ck, key)) {
      const len = ck === '' ? 0 : ck.split('.').length;
      if (len > bestLen) { best = c; bestLen = len; }
    }
  }
  return best;
}

function pick(obj, lang) {
  if (!obj) return null;
  if (typeof obj === 'string') return obj;
  return obj[lang] || obj.de || obj.en || obj.fr || null;
}

export function actApplicableAt(acts, celex, isoDate) {
  const act = findAct(acts, celex);
  if (!act) return false;
  if (act.kind === 'proposal') return false;
  const ap = act.application || {};
  return !!(ap.date && ap.date <= isoDate);
}

export function changeApplicability(acts, celex, unit, key, isoDate) {
  if (!ISO.test(String(isoDate || ''))) throw new Error('Datum im Format JJJJ-MM-TT erwartet: ' + isoDate);
  const act = findAct(acts, celex);
  if (!act) return { applicable: false, from: null, until: null, status: 'unknown', basis: null, change: null };
  const ap = act.application || {};
  const ch = unit ? findChange(act, unit, key) : null;
  const basis = (ch && ch.basis) || ap.basis || null;
  if (act.kind === 'proposal') return { applicable: false, from: null, until: null, status: 'proposal', basis, change: ch };
  if (act.published && isoDate < act.published) return { applicable: false, from: (ch && ch.applicableFrom) || ap.date || null, until: null, status: 'not-adopted', basis, change: ch };
  const from = (ch && ch.applicableFrom) || ap.date || null;
  // zeitliche Begrenzung einzelner Bloecke (z. B. Art. 12a Abs. 1 SGK: 180 Tage)
  let until = null, untilBasis = null;
  if (ch && Array.isArray(ch.periods) && key) {
    for (const p of ch.periods) if (isPrefixKey(p.key || '', key) && p.until) { until = p.until; untilBasis = p.basis || null; }
  }
  if (!from) return { applicable: false, from: null, until, status: 'pending', basis, change: ch };
  if (isoDate < from) return { applicable: false, from, until, status: 'future', basis, change: ch };
  if (until && isoDate > until) return { applicable: false, from, until, status: 'expired', basis: untilBasis || basis, change: ch };
  return { applicable: true, from, until, status: 'applicable', basis, change: ch };
}

export function derogationsAt(derogations, unitId, isoDate) {
  const out = [];
  for (const d of derogations || []) {
    if (d.from && isoDate < d.from) continue;
    if (d.until && isoDate > d.until) continue;
    for (const a of d.affects || []) if (a.unit === unitId) out.push({ entry: d, affect: a });
  }
  return out;
}

// Akt, dem ein geaenderter Block zuzurechnen ist: Herkunft des Blocks, wenn sie ein bekannter Akt ist (Berichtigungen,
// ETIAS-Patch), sonst der Akt des Stands
function blockAct(acts, stageAct, block) {
  if (block && block.o && !block.deleted && findAct(acts, block.o)) return block.o;
  return stageAct;
}

// Praedikat fuer composeAt (celex, block, unitId)
export function applicabilityPredicate(acts, isoDate) {
  const cache = new Map();
  const unitApplicable = (celex, unitId) => {
    const k = celex + '|' + unitId;
    if (!cache.has(k)) {
      const act = findAct(acts, celex);
      let ok = actApplicableAt(acts, celex, isoDate);
      if (!ok && act && Array.isArray(act.changes)) {
        // einzelne Aenderung dieser Einheit frueher anwendbar als der Akt
        ok = act.changes.some((c) => c.unit === unitId && c.applicableFrom && c.applicableFrom <= isoDate && !(act.published && isoDate < act.published));
      }
      if (!act) ok = false;
      cache.set(k, ok);
    }
    return cache.get(k);
  };
  return (celex, block, unitId) => {
    if (block === undefined) {
      // Aktebene: Akt gilt am Datum, oder es gibt fuer irgendeine Einheit eine frueher anwendbare Aenderung
      const act = findAct(acts, celex);
      if (!act) return false;
      if (actApplicableAt(acts, celex, isoDate)) return true;
      return (act.changes || []).some((c) => c.applicableFrom && c.applicableFrom <= isoDate && !(act.published && isoDate < act.published));
    }
    const c = blockAct(acts, celex, block);
    if (block.repealed || block.k === null) return unitApplicable(c, unitId);
    const r = changeApplicability(acts, c, unitId, block.k, isoDate);
    // abgelaufene Bloecke bleiben Teil des Wortlauts (Hinweis "expired")
    return r.applicable || r.status === 'expired';
  };
}

function sameBlockText(a, b) {
  if (!a || !b) return false;
  if ((a.ty === 'img') !== (b.ty === 'img')) return false;
  if (a.ty === 'img') return a.o === b.o;
  return normText(a.t || '') === normText(b.t || '') && a.o === b.o;
}

export function composeAtDate(dataset, acts, derogations, unitId, lang, isoDate) {
  if (!ISO.test(String(isoDate || ''))) throw new Error('Datum im Format JJJJ-MM-TT erwartet: ' + isoDate);
  const pred = applicabilityPredicate(acts, isoDate);
  const version = composeAt(dataset, unitId, lang, pred);
  const notices = [];
  const seen = new Set();
  const push = (n) => {
    const id = [n.kind, n.celex, n.key, n.effect || ''].join('|');
    if (seen.has(id)) return;
    seen.add(id);
    notices.push(n);
  };
  // 1. Abweichungen am Datum
  for (const { entry, affect } of derogationsAt(derogations, unitId, isoDate)) {
    push({
      key: affect.key || null, kind: 'derogation', celex: entry.celex, effect: affect.effect,
      note: pick(affect.note, lang), basis: pick(affect.basis, lang), from: entry.from || null, until: entry.until || null,
      confidence: entry.confidence || null,
    });
  }
  // 2. Beschlossene, am Datum nicht (oder nicht mehr) anwendbare Aenderungen dieser Einheit
  const u = dataset.units[unitId];
  if (u && u.versions[lang]) {
    const vs = u.versions[lang];
    const stageById = new Map(dataset.stages.map((s) => [s.id, s]));
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      const s = stageById.get(v.stage);
      if (!s) continue;
      const prev = i > 0 ? vs[i - 1] : null;
      const changed = [];
      if (v.repealed) changed.push({ k: null, repealed: true });
      else {
        const pm = new Map((prev && !prev.repealed ? prev.blocks : []).map((b) => [b.k, b]));
        for (const b of v.blocks) { const p = pm.get(b.k); if (!p || !sameBlockText(p, b)) changed.push(b); }
        const cur = new Set(v.blocks.map((b) => b.k));
        for (const k of pm.keys()) if (!cur.has(k)) changed.push({ k, deleted: true });
      }
      for (const b of changed) {
        const celex = blockAct(acts, s.act, b);
        const r = changeApplicability(acts, celex, unitId, b.k, isoDate);
        if (r.status === 'applicable' || r.status === 'not-adopted' || r.status === 'unknown') continue;
        const act = findAct(acts, celex);
        const kind = r.status === 'future' ? 'future' : r.status === 'expired' ? 'expired' : 'pending';
        const note = (r.change && pick(r.change.note, lang)) || (act && act.application && pick(act.application.note, lang)) || null;
        push({ key: b.k || null, kind, celex, note, basis: pick(r.basis, lang), from: r.from, until: r.until || null, change: b.deleted ? 'deleted' : b.repealed ? 'repealed' : 'changed' });
      }
    }
  }
  return { version, notices };
}
