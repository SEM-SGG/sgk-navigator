// Verweisstruktur eines ganzen Werks entlang seiner Gliederung (Übersicht, Abschnitt «Verweisstruktur»).
// Reines Datenmodell ohne DOM und ohne Oberflächentexte (ausser Zitierungen über cite, wie egoGraph).
//
// structureModel(data, lang, stageId, opts) -> {
//   units:  [{ id, i, type, num, label, full, group }]           Artikel und Anhänge des Stands in Gliederungsreihenfolge (ohne Erwägungsgründe)
//   groups: [{ id, type: 'title'|'chapter'|'annexes'|'none', num, toc, from, to }]   oberste Gliederungsebene, zusammenhängend
//   arcs:   [{ id, a, b, ab, ba, n }]                            Paare verknüpfter Einheiten desselben Werks (a < b, Indizes in units);
//                                                                 ab = Fundstellen a→b, ba = b→a, n = ab + ba
//   rows:   [{ id, kind: 'library'|'foreign', work, label, color, refs, units }]   je weiteres Werk der Bibliothek (Reihenfolge Werk-Tabs) und Fremdakte
//   cells:  { [rowId]: Array(units.length) of null | { n, targets: [{ id, label, full, n, unit, missing }] } }   ausgehend je Einheit
//   per:    Array(units.length) of { inUnits, inRefs, inOwn: {units, refs}, outTargets, outRefs, selfCount, uncertainCount,
//                                   inSources: [{ id, kind, work, unit, label, full, n }], outOwn: [{ id, unit, label, full, n }],
//                                   offAxisIn, offAxisOut }
//   totals: { pairs, ownRefs, selfCount, uncertainCount, offAxis, byRow: { [rowId]: refs } }
// }
// opts: { ui: 'de'|'fr', lib } mit lib wie bei egoGraph (refsgraph-model.js): { workOfCelex, workData, order, abbr, source }
//
// Zählregeln wie egoGraph (data/STATUS_VERWEISNETZ_GRAFIK.md): jede Fundstelle einzeln, je Ziel einmal; unsichere Verweise und
// Verweise innerhalb derselben Einheit sind keine Kante (gezählt in uncertainCount bzw. selfCount); eingehende Verweise aus den
// weiteren Werken der Bibliothek über lib.source(w) (Stand passend zum Datum, wie followRef). Für jede Einheit liefert per[i]
// dieselben Summen wie egoGraph(data, lang, stageId, unit, null, { lib }) (incoming.units/refs/own, outgoing.targets/refs, selfCount, uncertainCount).
import { cite } from '../lib/cite.js';
import { workColor, shortActLabel, actDesignation } from './refsgraph-model.js';

const NO_LIB = { workOfCelex: () => null, workData: () => null, order: [], abbr: (id) => id };

/** Spaltenbeschriftung: Nummer der Einheit in der Zitierweise der Oberfläche ("8a", "8 bis", "VI") */
export function unitNumLabel(meta, ui) {
  return cite(meta, null, ui, null).replace(/^(Art\.|art\.|Article|Anhang|annexe|Annex)\s+/, '');
}

/** Oberste Gliederungsebene einer Einheit (Titel oder Kapitel; Anhänge als eigene Gruppe). */
function topGroup(data, id, meta) {
  if (meta.type === 'annex') return { id: 'annexes', type: 'annexes', num: null, toc: null };
  let e = data.tocById.get(id);
  let top = null;
  const seen = new Set();
  while (e && e.parent && !seen.has(e.parent)) {
    seen.add(e.parent);
    const p = data.tocById.get(e.parent);
    if (!p) break;
    top = p;
    e = p;
  }
  if (!top || (top.type !== 'title' && top.type !== 'chapter' && top.type !== 'part' && top.type !== 'section')) return { id: 'none', type: 'none', num: null, toc: null };
  return { id: top.id, type: top.type, num: top.num || null, toc: top.id };
}

export function structureModel(data, lang, stageId, opts = {}) {
  const lib = { ...NO_LIB, ...(opts.lib || {}) };
  const ui = opts.ui || 'de';
  const own = data.workId;
  const ownCelex = data.ds && data.ds.work ? data.ds.work.celex : null;

  // ---------------------------------------------------------------- Achse: Artikel und Anhänge des Stands
  const units = [];
  const index = new Map();
  for (const id of data.unitOrder) {
    const meta = data.unitMeta(id);
    if (meta.type === 'recitals') continue;
    const v = data.version(id, lang, stageId);
    if (!v || v.repealed) continue;
    const g = topGroup(data, id, meta);
    const u = { id, i: units.length, type: meta.type, num: unitNumLabel(meta, ui), label: cite(meta, null, ui, null), full: cite(meta, null, ui, data.abbr), group: g.id, g };
    index.set(id, u.i);
    units.push(u);
  }
  // Gruppen: zusammenhängende Läufe derselben obersten Gliederungseinheit
  const groups = [];
  for (const u of units) {
    const last = groups[groups.length - 1];
    if (last && last.id === u.g.id && last.to === u.i - 1) { last.to = u.i; continue; }
    groups.push({ id: u.g.id, key: u.g.id + ':' + u.i, type: u.g.type, num: u.g.num, toc: u.g.toc, from: u.i, to: u.i });
  }
  for (const u of units) delete u.g;

  const N = units.length;
  const per = units.map(() => ({
    inSourcesMap: new Map(), outMap: new Map(), selfCount: 0, uncertainCount: 0, offAxisIn: 0, offAxisOut: 0,
  }));
  const pairs = new Map(); // "a|b" -> arc
  const arcOf = (x, y) => {
    const a = Math.min(x, y), b = Math.max(x, y);
    const k = a + '|' + b;
    if (!pairs.has(k)) pairs.set(k, { id: 'arc:' + units[a].id + ':' + units[b].id, a, b, ab: 0, ba: 0, n: 0 });
    return pairs.get(k);
  };
  const metaLabel = (d, u, abbr) => cite(d.unitMeta(u), null, ui, abbr);
  // Ausserhalb der Achse liegende Einheiten (z. B. Erwägungsgründe) werden gezählt, aber nicht gezeichnet
  const inAdd = (ti, sid, init) => {
    const m = per[ti].inSourcesMap;
    if (!m.has(sid)) m.set(sid, { ...init, id: sid, n: 0 });
    m.get(sid).n++;
  };

  // ---------------------------------------------------------------- eigenes Werk: ein Durchgang über alle Fundstellen
  const idx = data.refIndex(lang, stageId) || { out: {} };
  const out = idx.out || {};
  const pos = (w) => lib.order.indexOf(w);
  for (const src of Object.keys(out)) {
    const cut = src.indexOf('#');
    const su = src.slice(0, cut);
    const si = index.has(su) ? index.get(su) : -1;
    for (const r of out[src]) {
      if (r.uncertain) { if (si >= 0) per[si].uncertainCount++; continue; }
      const tgs = (r.targets || [r.target]).filter(Boolean);
      // eingehend (wie egoGraph.toHere): jede Zieleinheit einmal je Fundstelle
      const hereUnits = new Set();
      for (const tg of tgs) {
        if (!tg.unit) continue;
        if (tg.kind === 'internal' || (tg.kind === 'external' && !!tg.work && lib.workOfCelex(tg.work) === own)) hereUnits.add(tg.unit);
      }
      for (const tu of hereUnits) {
        if (tu === su) continue;
        if (!index.has(tu)) continue; // Ziel ausserhalb der Achse: gezählt beim ausgehenden Teil (offAxisOut)
        const ti = index.get(tu);
        inAdd(ti, 'in:' + own + ':' + su, { kind: 'own', work: own, unit: su, label: metaLabel(data, su, null), full: metaLabel(data, su, data.abbr), order: data.unitIndex.has(su) ? data.unitIndex.get(su) : 1e6 });
        if (si < 0) per[ti].offAxisIn++;
      }
      // ausgehend (wie egoGraph): Zeilen je Ziel, jede Fundstelle je Ziel einmal
      if (si < 0) continue;
      const P = per[si];
      const seen = new Set();
      let self = false;
      for (const tg of tgs) {
        const w = tg.kind === 'internal' ? own : tg.work ? lib.workOfCelex(tg.work) : null;
        if (w && w === own && (tg.kind === 'internal' || tg.unit)) {
          if (tg.unit === su) { self = true; continue; }
          if (!tg.unit) continue;
          const rid = 'out:' + w + ':' + tg.unit;
          if (seen.has(rid)) continue;
          seen.add(rid);
          if (!P.outMap.has(rid)) {
            P.outMap.set(rid, { id: rid, row: 'own', work: own, unit: tg.unit, label: metaLabel(data, tg.unit, null), full: metaLabel(data, tg.unit, data.abbr), n: 0, order: data.unitIndex.has(tg.unit) ? data.unitIndex.get(tg.unit) : 1e6 });
          }
          P.outMap.get(rid).n++;
          if (index.has(tg.unit)) {
            const arc = arcOf(si, index.get(tg.unit));
            if (si < index.get(tg.unit)) arc.ab++; else arc.ba++;
            arc.n++;
          } else P.offAxisOut++;
        } else if (w) {
          const rid = 'out:' + w + ':' + (tg.unit || '*');
          if (seen.has(rid)) continue;
          seen.add(rid);
          if (!P.outMap.has(rid)) {
            const wd = lib.workData(w);
            const exists = !!(tg.unit && wd && wd.unit(tg.unit));
            const meta = tg.unit ? (exists ? wd.unitMeta(tg.unit) : metaOfId(tg.unit)) : null;
            const abbr = wd && wd.abbr ? wd.abbr : null;
            // Verweis auf das eigene Werk ohne Einheit (theoretisch möglich): eigene Zeile «own», keine Kante
            P.outMap.set(rid, {
              id: rid, row: w === own ? 'own' : w, work: w, unit: tg.unit || null,
              label: meta ? cite(meta, null, ui, null) : lib.abbr(w, ui), full: meta ? cite(meta, null, ui, abbr) : lib.abbr(w, ui),
              missing: !!tg.unit && !exists, n: 0,
              order: tg.unit ? (exists && wd.unitIndex && wd.unitIndex.has(tg.unit) ? wd.unitIndex.get(tg.unit) : 1e5) : -1,
            });
            if (w === own) P.offAxisOut++;
          }
          P.outMap.get(rid).n++;
        } else {
          const id = tg.work || tg.instrument || '?';
          const rid = 'out:ext:' + id;
          if (seen.has(rid)) continue;
          seen.add(rid);
          if (!P.outMap.has(rid)) P.outMap.set(rid, {
            id: rid, row: 'ext', work: null, celex: tg.work && /^[0-9]/.test(tg.work) ? tg.work : null, instrument: tg.instrument || null,
            label: tg.work ? shortActLabel(tg.work, tg.label || r.text, ui) : (tg.label || r.text), full: actDesignation(tg.label || r.text), fullLang: lang,
            n: 0, order: P.outMap.size,
          });
          P.outMap.get(rid).n++;
        }
      }
      if (self) P.selfCount++;
    }
  }

  // ---------------------------------------------------------------- eingehend aus den weiteren Werken der Bibliothek
  if (lib.source) {
    for (const w of lib.order) {
      if (w === own) continue;
      const s = lib.source(w);
      if (!s || !s.data) continue;
      const sIdx = s.data.refIndex(lang, s.stageId);
      const sOut = (sIdx && sIdx.out) || {};
      const sd = s.data;
      const p = pos(w);
      for (const src of Object.keys(sOut)) {
        const cut = src.indexOf('#');
        const su = src.slice(0, cut);
        for (const r of sOut[src]) {
          if (r.uncertain) continue;
          const here = new Set();
          for (const tg of r.targets || [r.target]) {
            if (tg && tg.unit && tg.kind === 'external' && !!tg.work && lib.workOfCelex(tg.work) === own) here.add(tg.unit);
          }
          for (const tu of here) {
            if (!index.has(tu)) continue;
            inAdd(index.get(tu), 'in:' + w + ':' + su, {
              kind: 'library', work: w, unit: su, label: cite(sd.unitMeta(su), null, ui, sd.abbr), full: cite(sd.unitMeta(su), null, ui, sd.abbr),
              order: (p + 1) * 1e6 + (sd.unitIndex && sd.unitIndex.has(su) ? sd.unitIndex.get(su) : 1e6),
            });
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- Zeilen unter der Achse und Zellen
  const rowIds = lib.order.filter((w) => w !== own);
  const rows = rowIds.map((w) => ({ id: w, kind: 'library', work: w, label: lib.abbr(w, ui), color: workColor(w), refs: 0, units: 0 }));
  rows.push({ id: 'ext', kind: 'foreign', work: null, label: null, color: null, refs: 0, units: 0 });
  const cells = Object.fromEntries(rows.map((r) => [r.id, new Array(N).fill(null)]));
  const byCount = (a, b) => b.n - a.n || a.order - b.order;
  let selfAll = 0, uncAll = 0, offAll = 0;
  const perOut = per.map((P, i) => {
    const list = [...P.outMap.values()];
    const outOwn = list.filter((x) => x.row === 'own' && x.unit && x.work === own).sort(byCount);
    for (const x of list) {
      if (x.row === 'own') continue;
      const rid = x.row;
      if (!cells[rid]) continue;
      const c = cells[rid][i] || (cells[rid][i] = { n: 0, targets: [] });
      c.n += x.n;
      c.targets.push(x);
    }
    const inSources = [...P.inSourcesMap.values()].sort(byCount);
    selfAll += P.selfCount; uncAll += P.uncertainCount; offAll += P.offAxisIn + P.offAxisOut;
    return {
      inUnits: inSources.length, inRefs: inSources.reduce((s, x) => s + x.n, 0),
      inOwn: { units: inSources.filter((x) => x.kind === 'own').length, refs: inSources.filter((x) => x.kind === 'own').reduce((s, x) => s + x.n, 0) },
      outTargets: list.length, outRefs: list.reduce((s, x) => s + x.n, 0),
      selfCount: P.selfCount, uncertainCount: P.uncertainCount, offAxisIn: P.offAxisIn, offAxisOut: P.offAxisOut,
      inSources, outOwn, outOther: list.filter((x) => !(x.row === 'own' && x.unit && x.work === own)),
    };
  });
  for (const r of rows) {
    const cs = cells[r.id];
    for (const c of cs) {
      if (!c) continue;
      c.targets.sort(byCount);
      r.refs += c.n;
      r.units++;
    }
  }
  const arcs = [...pairs.values()].sort((x, y) => x.a - y.a || x.b - y.b);
  return {
    workId: own, celex: ownCelex, lang, stageId, ui,
    units, groups, arcs, rows, cells, per: perOut,
    totals: {
      pairs: arcs.length, ownRefs: arcs.reduce((s, a) => s + a.n, 0), selfCount: selfAll, uncertainCount: uncAll, offAxis: offAll,
      byRow: Object.fromEntries(rows.map((r) => [r.id, r.refs])),
    },
    empty: !arcs.length && rows.every((r) => !r.refs) && perOut.every((p) => !p.inRefs),
  };
}

/** Einheit aus der Kennung, wenn sie im Datensatz fehlt ("art_22g" -> Artikel 22g); wie in refsgraph-model.js. */
function metaOfId(id) {
  let m = /^art_(.+)$/.exec(id || '');
  if (m) return { id, type: 'article', num: m[1] };
  m = /^anx_(.+)$/.exec(id || '');
  if (m) return { id, type: 'annex', num: m[1] };
  return { id, type: 'article', num: id };
}

/** Stufe der Deckkraft nach Zahl der Fundstellen: 1 · 2–3 · 4–7 · 8 und mehr -> 1..4 (0 = keine) */
export const levelOf = (n) => (n >= 8 ? 4 : n >= 4 ? 3 : n >= 2 ? 2 : n >= 1 ? 1 : 0);

/** Stärkste Verbindungen einer Einheit (eingehend und ausgehend, je Einheit bzw. Fremdakt), höchstens max */
export function strongest(model, i, max = 3) {
  const p = model.per[i];
  const list = [
    ...p.inSources.map((x) => ({ dir: 'in', id: x.id, label: x.kind === 'own' ? x.label : x.full, short: x.label, kind: x.kind, work: x.work, unit: x.unit, n: x.n, order: x.order })),
    ...p.outOwn.map((x) => ({ dir: 'out', id: x.id, label: x.label, short: x.label, kind: 'own', work: x.work, unit: x.unit, n: x.n, order: 2e9 + x.order })),
    ...p.outOther.map((x, j) => ({ dir: 'out', id: x.id, label: x.row === 'ext' ? x.label : x.full, short: x.label, kind: x.row === 'ext' ? 'foreign' : 'library', work: x.work, unit: x.unit, celex: x.celex, fullLang: x.fullLang, n: x.n, order: 3e9 + j })),
  ];
  return list.sort((a, b) => b.n - a.n || a.order - b.order).slice(0, max);
}
