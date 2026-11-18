// Verweisnetz als Ego-Netz einer Bestimmung oder Einheit (Datenmodell, ohne DOM und ohne Oberflächentexte).
//
// egoGraph(data, lang, stageId, unitId, key, opts) -> Modell für die Darstellung (src/app/ui/refsgraph.js)
//   data: Data-Instanz (src/app/data.js) oder gleichwertig: { workId, abbr, refIndex(lang, stageId), version(unit, lang, stageId),
//         unitMeta(unit), unit(unit), unitIndex?: Map }
//   opts: { scope: 'provision'|'unit', maxIncoming, maxPerGroup, ui: 'de'|'fr', lib }
//   lib:  { workOfCelex(celex) -> Werk-Id|null, workData(id) -> Data|null, order: [Werk-Ids wie Werk-Tabs], abbr(id, ui) -> Kürzel }
//
// Zählregeln (data/STATUS_VERWEISNETZ_GRAFIK.md):
//   - Fundstelle = ein erkannter Verweis im Text (eine Fundstelle mit Bereich «Artikel 7 bis 14» zählt bei jedem Ziel einmal).
//   - Verweise innerhalb derselben Einheit sind keine Kanten (selfCount).
//   - Unsichere Verweise sind keine Kanten (uncertainCount, nur ausgehend bestimmbar).
//   - Umfang 'provision': Block key und seine Unterblöcke (key + '.'); 'unit': alle Blöcke der Einheit.
import { cite } from '../lib/cite.js';
import { plainText } from '../../core/refs.js';

export const inScope = (k, key) => !key || k === key || (!!k && k.startsWith(key + '.'));

/** Aktfarbe (Token-Name) eines Werks der Bibliothek */
export const WORK_COLOR = { sgk: 'act-base', ees: 'act-ees', etias: 'act-etias', vis: 'act-vis', iop: 'act-interop' };
export const workColor = (id) => WORK_COLOR[id] || 'act-base';

const NO_LIB = { workOfCelex: () => null, workData: () => null, order: [], abbr: (id) => id };

/** Auszug um eine Fundstelle (Klartext des Blocks); { pre, hit, post } oder Zeichenkette ohne Treffer. */
export function excerpt(data, lang, stageId, unitId, key, text, span = 70) {
  const v = data.version(unitId, lang, stageId);
  const b = v && (v.blocks || []).find((x) => x.k === key);
  if (!b) return '';
  const p = plainText(b.t || '');
  const i = text ? p.indexOf(text) : -1;
  if (i < 0) return p.length > 160 ? p.slice(0, 158) + ' …' : p;
  const from = Math.max(0, i - span), to = Math.min(p.length, i + text.length + span);
  return { pre: (from > 0 ? '… ' : '') + p.slice(from, i), hit: p.slice(i, i + text.length), post: p.slice(i + text.length, to) + (to < p.length ? ' …' : '') };
}

/** Einheit aus der Kennung, wenn sie im Datensatz fehlt ("art_22g" -> Artikel 22g). */
function metaOfId(id) {
  let m = /^art_(.+)$/.exec(id || '');
  if (m) return { id, type: 'article', num: m[1] };
  m = /^anx_(.+)$/.exec(id || '');
  if (m) return { id, type: 'annex', num: m[1] };
  return { id, type: 'article', num: id };
}

// Kurzbezeichnung eines Fremdakts in der Oberflächensprache: Aktart aus der CELEX, Nummer aus der Fundstelle.
const ACT_WORD = {
  de: { R: 'VO', L: 'RL', D: 'Beschluss' },
  fr: { R: 'règl.', L: 'dir.', D: 'décision' },
  en: { R: 'Reg.', L: 'Dir.', D: 'Decision' },
};
const SUFFIX = { de: { CE: 'EG', UE: 'EU', CEE: 'EWG', EC: 'EG', EU: 'EU', EEC: 'EWG' }, fr: { EG: 'CE', EU: 'UE', EWG: 'CEE', EC: 'CE', EEC: 'CEE' } };
const DESIGNATION = /(?:Durchführungs|Delegierte[nr]?\s)?(?:Verordnung|Richtlinie|Beschlu(?:ss|ß)|Rahmenbeschlu(?:ss|ß)|Entscheidung|Übereinkommen|Abkommen|règlement|directive|décision|convention|accord|Regulation|Directive|Decision|Convention|Agreement)\b.*$/i;

/** Bezeichnung des Akts aus der Beschriftung des Ziels ("Art. 3 Verordnung (EU) 2016/1624" -> "Verordnung (EU) 2016/1624"). */
export function actDesignation(label) {
  const s = String(label || '');
  const m = DESIGNATION.exec(s);
  return m ? m[0] : s;
}
export function shortActLabel(celex, label, ui = 'de') {
  const d = actDesignation(label);
  const m = /^\d(\d{4})([RLD])\d{4}/.exec(celex || '');
  const n = /(\d{1,4})\/(\d{1,4})(?:\/([A-Z]+))?/.exec(d);
  if (!m || !n) return d;
  const suf = n[3] ? ((SUFFIX[ui] && SUFFIX[ui][n[3]]) || n[3]) : '';
  return `${ACT_WORD[ui] ? ACT_WORD[ui][m[2]] : ACT_WORD.de[m[2]]} ${n[1]}/${n[2]}${suf ? '/' + suf : ''}`;
}

/** Zitierung der zentralen Bestimmung: { label, unit, rest, abbr } */
export function centerLabel(data, unitId, key, ui) {
  const meta = data.unitMeta(unitId);
  const unit = cite(meta, null, ui, null);
  const full = cite(meta, key, ui, null);
  const rest = key && full.startsWith(unit) ? full.slice(unit.length).replace(/^[,\s]+/, '') : '';
  return { label: cite(meta, key, ui, data.abbr), unit, rest, abbr: (data.abbr && data.abbr[ui]) || '', key: key || null };
}

const byCountThenOrder = (a, b) => b.n - a.n || a.order - b.order;

/**
 * Ego-Netz einer Bestimmung (key) bzw. Einheit (key null).
 * Liefert { center, incoming: { groups, units, refs }, outgoing: { groups, targets, refs }, uncertainCount, selfCount, empty }.
 */
export function egoGraph(data, lang, stageId, unitId, key, opts = {}) {
  const lib = { ...NO_LIB, ...(opts.lib || {}) };
  const ui = opts.ui || 'de';
  const scope = key && opts.scope !== 'unit' ? 'provision' : 'unit';
  const k = scope === 'provision' ? key : null;
  const idx = data.refIndex(lang, stageId) || { out: {} };
  const out = idx.out || {};
  const orderOf = (d, u) => (d && d.unitIndex && d.unitIndex.has(u) ? d.unitIndex.get(u) : 1e6);
  let selfCount = 0, uncertainCount = 0;

  // ---------------------------------------------------------------- eingehend: alle Fundstellen mit Ziel in der Einheit (im Umfang)
  // aus dem eigenen Werk und, mit lib.source(w), aus den weiteren Werken der Bibliothek (Stand passend zum Datum, wie followRef)
  const inMap = new Map();
  const toHere = (tg, own) => tg && tg.unit === unitId && (!k || inScope(tg.key || '', k))
    && (own && tg.kind === 'internal' || tg.kind === 'external' && !!tg.work && lib.workOfCelex(tg.work) === data.workId);
  const scanIn = (sd, sOut, w, own, sStage) => {
    const pos = own ? -1 : lib.order.indexOf(w);
    for (const src of Object.keys(sOut)) {
      const cut = src.indexOf('#');
      const su = src.slice(0, cut), sk = src.slice(cut + 1);
      for (const r of sOut[src]) {
        if (r.uncertain) continue;
        if (!(r.targets || [r.target]).some((tg) => toHere(tg, own))) continue;
        // innerhalb derselben Einheit: keine Kante; Quellen im Umfang zählt der ausgehende Teil (jede Fundstelle einmal)
        if (own && su === unitId) { if (k && !inScope(sk, k)) selfCount++; continue; }
        const id = 'in:' + w + ':' + su;
        if (!inMap.has(id)) {
          const meta = sd.unitMeta(su);
          inMap.set(id, {
            id, kind: own ? 'own' : 'library', work: w, color: workColor(w), unit: su,
            label: own ? cite(meta, null, ui, null) : cite(meta, null, ui, sd.abbr), full: cite(meta, null, ui, sd.abbr),
            n: 0, items: [], order: (pos + 1) * 1e6 + orderOf(sd, su),
            ref: own ? su + '#' : ((sd.ds && sd.ds.work && sd.ds.work.celex) || w) + ':' + su + '#',
          });
        }
        const g = inMap.get(id);
        g.n++;
        g.items.push(own ? { unit: su, key: sk, text: r.text } : { unit: su, key: sk, text: r.text, data: sd, stageId: sStage });
      }
    }
  };
  scanIn(data, out, data.workId, true, stageId);
  const ownIn = { units: inMap.size, refs: [...inMap.values()].reduce((s, g) => s + g.n, 0) };
  if (lib.source) {
    for (const w of lib.order) {
      if (w === data.workId) continue;
      const s = lib.source(w);
      if (!s || !s.data) continue;
      const sIdx = s.data.refIndex(lang, s.stageId);
      if (sIdx && sIdx.out) scanIn(s.data, sIdx.out, w, false, s.stageId);
    }
  }
  let inGroups = [...inMap.values()].sort(byCountThenOrder);
  const inUnits = inGroups.length, inRefs = inGroups.reduce((s, g) => s + g.n, 0);
  const maxIn = opts.maxIncoming || 0;
  if (maxIn && inGroups.length > maxIn) {
    const rest = inGroups.slice(maxIn - 1);
    inGroups = inGroups.slice(0, maxIn - 1);
    inGroups.push({ id: 'in:more', more: true, units: rest.length, n: rest.reduce((s, g) => s + g.n, 0), items: rest.flatMap((g) => g.items), labels: rest.map((g) => g.label), order: 1e9 });
  }

  // ---------------------------------------------------------------- ausgehend: Fundstellen der Blöcke im Umfang, gruppiert nach Werk
  const ownCelex = data.ds && data.ds.work ? data.ds.work.celex : null;
  const groups = new Map();
  const groupOf = (gid, init) => { if (!groups.has(gid)) groups.set(gid, { ...init, rows: new Map() }); return groups.get(gid); };
  const add = (g, rid, init, item) => {
    if (!g.rows.has(rid)) g.rows.set(rid, { ...init, id: rid, n: 0, items: [] });
    const row = g.rows.get(rid);
    row.n++;
    row.items.push(item);
  };
  for (const src of Object.keys(out)) {
    const cut = src.indexOf('#');
    if (src.slice(0, cut) !== unitId) continue;
    const sk = src.slice(cut + 1);
    if (!inScope(sk, k)) continue;
    for (const r of out[src]) {
      if (r.uncertain) { uncertainCount++; continue; }
      const item = { unit: unitId, key: sk, text: r.text };
      const seen = new Set();
      let self = false;
      for (const tg of r.targets || [r.target]) {
        if (!tg) continue;
        const w = tg.kind === 'internal' ? data.workId : tg.work ? lib.workOfCelex(tg.work) : null;
        if (w && w === data.workId && (tg.kind === 'internal' || tg.unit)) {
          if (tg.unit === unitId) { self = true; continue; }
          if (!tg.unit) continue;
          const rid = 'out:' + w + ':' + tg.unit;
          if (seen.has(rid)) continue;
          seen.add(rid);
          const meta = data.unitMeta(tg.unit);
          const g = groupOf(w, { id: w, kind: 'own', work: w, label: lib.abbr(w, ui) || (data.abbr && data.abbr[ui]) || w, color: 'act-base', order: -1 });
          add(g, rid, { kind: 'own', work: w, unit: tg.unit, label: cite(meta, null, ui, null), full: cite(meta, null, ui, data.abbr), order: orderOf(data, tg.unit), ref: tg.unit + '#' }, item);
        } else if (w) {
          const wd = lib.workData(w);
          const exists = !!(tg.unit && wd && wd.unit(tg.unit));
          const meta = tg.unit ? (exists ? wd.unitMeta(tg.unit) : metaOfId(tg.unit)) : null;
          const abbr = wd && wd.abbr ? wd.abbr : null;
          const rid = 'out:' + w + ':' + (tg.unit || '*');
          if (seen.has(rid)) continue;
          seen.add(rid);
          const pos = lib.order.indexOf(w);
          const g = groupOf(w, { id: w, kind: 'library', work: w, label: lib.abbr(w, ui), color: workColor(w), order: pos < 0 ? 99 : pos });
          add(g, rid, {
            kind: 'library', work: w, unit: tg.unit || null, celex: tg.work,
            label: meta ? cite(meta, null, ui, null) : lib.abbr(w, ui),
            full: meta ? cite(meta, null, ui, abbr) : lib.abbr(w, ui),
            missing: !!tg.unit && !exists,
            order: tg.unit ? (exists ? orderOf(wd, tg.unit) : 1e5) : -1,
            ref: tg.work + (tg.unit ? ':' + tg.unit + '#' : ''),
          }, item);
        } else {
          const id = tg.work || tg.instrument || '?';
          const rid = 'out:ext:' + id;
          if (seen.has(rid)) continue;
          seen.add(rid);
          const g = groupOf('ext', { id: 'ext', kind: 'foreign', work: null, label: '', color: null, order: 1000 });
          const linkable = !!tg.work && /^[0-9]/.test(tg.work);
          add(g, rid, {
            kind: 'foreign', celex: linkable ? tg.work : null, instrument: tg.instrument || null,
            label: tg.work ? shortActLabel(tg.work, tg.label || r.text, ui) : (tg.label || r.text),
            full: actDesignation(tg.label || r.text), fullLang: lang,
            order: g.rows.size,
          }, item);
        }
      }
      if (self) selfCount++;
    }
  }
  const maxPer = opts.maxPerGroup || 0;
  let targets = 0, outRefs = 0;
  const outGroups = [...groups.values()].sort((a, b) => a.order - b.order).map((g) => {
    let rows = [...g.rows.values()].sort(byCountThenOrder);
    targets += rows.length;
    const refs = rows.reduce((s, x) => s + x.n, 0);
    outRefs += refs;
    let hidden = null;
    if (maxPer && rows.length > maxPer) {
      const rest = rows.slice(maxPer - 1);
      rows = rows.slice(0, maxPer - 1);
      hidden = { id: 'out:more:' + g.id, more: true, rows: rest.length, n: rest.reduce((s, x) => s + x.n, 0), items: rest.flatMap((x) => x.items), labels: rest.map((x) => x.label) };
    }
    return { id: g.id, kind: g.kind, work: g.work, label: g.label, color: g.color, refs, total: g.rows.size, rows, hidden };
  });

  return {
    center: { ...centerLabel(data, unitId, k, ui), scope, unitId, unitType: data.unitMeta(unitId).type },
    incoming: { groups: inGroups, units: inUnits, refs: inRefs, own: ownIn },
    outgoing: { groups: outGroups, targets, refs: outRefs },
    uncertainCount, selfCount,
    empty: !inUnits && !targets,
  };
}
