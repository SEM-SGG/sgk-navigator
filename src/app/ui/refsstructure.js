// Verweisstruktur eines ganzen Werks (Übersicht, Abschnitt nach dem Zeitstrahl): Bogendiagramm entlang der Gliederung,
// darunter je weiteres Werk der Bibliothek und für Fremdakte eine Zeile mit Zellen; Tabelle als Textalternative; PNG-Export.
// Datenmodell: refsstructure-model.js (structureModel). Zeichnung: SVG ohne Bibliothek; Farben nur über CSS-Variablen (styles.css, .rs-*).
// Leistung: Das Modell wird erst berechnet, wenn der Abschnitt in die Nähe des sichtbaren Bereichs kommt (IntersectionObserver),
// in Schritten (eigener Verweisindex, je weiteres Werk, Modell) über requestIdleCallback; Ergebnis in data.memo.
import { html } from 'htm/preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { go } from '../state.js';
import { useLibrary, works } from '../library.js';
import { t, uiLang } from '../lib/i18n.js';
import { fmtDate, fmtNum, todayIso, plain } from '../lib/format.js';
import { Icon, Seg, HelpLink, LegalLangSwitch, TitleText } from './common.js';
import { structureModel, levelOf, strongest } from './refsstructure-model.js';
import { RefsGraphDialog, InlineSvgStyles, libFor } from './refsgraph.js';
import { settingsStore, persistSettings, toast } from '../app.js';

// ------------------------------------------------------------------ Masse
const G = { labelW: 224, padX: 8, bandH: 26, arcH: 176, rowH: 22, rowsTop: 8, bottom: 8, fs: 12, minCol: 14, maxCol: 32 };
const ARC_CAP = G.arcH - 14;
/** Deckkraft der Zellen je Stufe (als Attribut, damit die Exportkarte sie übernimmt) */
const LEVEL_OPACITY = [0, 0.22, 0.45, 0.7, 1];
const strokeW = (n) => 0.6 + Math.sqrt(n) * 0.7;
/** Höhe eines Bogens: wächst mit dem Abstand (Wurzel, damit lange Bögen nicht alle an der Obergrenze liegen), höchstens Halbkreis */
const arcRy = (rx, span) => Math.min(rx, ARC_CAP * Math.sqrt((2 * rx) / span));

let mctx = null;
function textW(s, px = G.fs, weight = 400) {
  if (typeof document === 'undefined') return String(s).length * px * 0.56;
  if (!mctx) mctx = document.createElement('canvas').getContext('2d');
  if (!mctx) return String(s).length * px * 0.56;
  mctx.font = `${weight} ${px}px "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif`;
  return mctx.measureText(String(s)).width * 1.03;
}
function fit(s, maxW, px = G.fs, weight = 400) {
  s = String(s || '');
  if (maxW <= 0) return '';
  if (textW(s, px, weight) <= maxW) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (textW(s.slice(0, m) + '…', px, weight) <= maxW) lo = m; else hi = m - 1; }
  return lo ? s.slice(0, lo).replace(/\s+$/, '') + '…' : '';
}

/** Geometrie aus den Spaltenbeschriftungen und der verfügbaren Breite (auch für den Platzhalter, ohne Modell). */
export function geometry(nums, nRows, W, colW0) {
  const N = Math.max(1, nums.length);
  const avail = Math.max(0, W - G.labelW - 2 * G.padX);
  const colW = colW0 || Math.min(G.maxCol, Math.max(G.minCol, Math.floor((avail / N) * 10) / 10));
  const plotW = Math.ceil(N * colW + 2 * G.padX);
  const maxLab = Math.max(0, ...nums.map((s) => textW(s)));
  const rotate = maxLab + 4 > colW;
  const labH = rotate ? Math.ceil(maxLab) + 12 : 22;
  const yAxis = G.bandH + G.arcH;
  const yRows = yAxis + labH + G.rowsTop;
  const H = yRows + nRows * G.rowH + G.bottom;
  return { N, colW, plotW, rotate, labH, yAxis, yRows, H, scroll: plotW + G.labelW > W + 0.5, x: (i) => G.padX + (i + 0.5) * colW, x0: (i) => G.padX + i * colW };
}

// ------------------------------------------------------------------ Modell vorbereiten (verzögert, in Schritten)
const idle = (f) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(f, { timeout: 250 }) : setTimeout(f, 16));
const cancelIdle = (h) => (typeof cancelIdleCallback === 'function' ? cancelIdleCallback(h) : clearTimeout(h));
const keyOf = (lang, stageId, ui, libV) => `rs|${lang}|${stageId}|${ui}|${libV}`;
const ready = (data, key) => data._cache && data._cache.has(key);

/** Rechnet das Modell in Schritten; ruft done(model) auf. Liefert eine Abbruchfunktion. Messwerte als performance.measure «sgk:rs:<werk>». */
function prepare(data, lang, stageId, ui, libV, done) {
  const key = keyOf(lang, stageId, ui, libV);
  if (ready(data, key)) { done(data.memo(key, () => null)); return () => {}; }
  const lib = libFor(data, stageId);
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const steps = [
    () => data.refIndex(lang, stageId),
    ...lib.order.filter((w) => w !== data.workId).map((w) => () => { const s = lib.source(w); if (s && s.data) s.data.refIndex(lang, s.stageId); }),
    () => data.memo(key, () => structureModel(data, lang, stageId, { ui, lib })),
  ];
  let i = 0, h = null, stop = false, busy = 0, longest = 0;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);
  const run = () => {
    if (stop) return;
    const step = steps[i++];
    let res;
    const s0 = now();
    try { res = step(); } catch (e) { console.error(e); }
    const d = now() - s0;
    busy += d; longest = Math.max(longest, d);
    if (i < steps.length) { h = idle(run); return; }
    try { if (typeof performance !== 'undefined' && performance.measure) performance.measure('sgk:rs:' + data.workId, { start: t0, end: now(), detail: { busy: Math.round(busy), longest: Math.round(longest), steps: steps.length } }); } catch { /* ältere Browser */ }
    done(res);
  };
  h = idle(run);
  return () => { stop = true; if (h != null) cancelIdle(h); };
}

/** Modell, sobald der Platzhalter (ref) in die Nähe des sichtbaren Bereichs kommt. */
function useLazyModel(ref, data, lang, stageId) {
  const ui = uiLang();
  const libV = useLibrary();
  const key = keyOf(lang, stageId, ui, libV);
  const [, force] = useState(0);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') { const h = setTimeout(() => setNear(true), 300); return () => clearTimeout(h); }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { root: el.closest('.view') || null, rootMargin: '600px 0px 600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  const has = ready(data, key);
  useEffect(() => {
    if (!near || has) return undefined;
    return prepare(data, lang, stageId, ui, libV, () => force((n) => n + 1));
  }, [near, has, data, key]);
  return has ? data.memo(key, () => null) : null;
}

/** Spaltenbeschriftungen ohne Modell (Platzhalter mit derselben Höhe) */
function liteNums(data, stageId, ui) {
  return data.memo(`rsn|${stageId}|${ui}`, () => data.unitOrder.filter((id) => {
    const m = data.unitMeta(id);
    if (m.type === 'recitals') return false;
    const te = data.tocById.get(id);
    return !te || data.tocAlive(te, stageId);
  }).map((id) => {
    const m = data.unitMeta(id);
    const c = m.type === 'annex' ? colNum('annex', m.num) : ui === 'fr' && /^\d+[a-i]$/.test(m.num) ? m.num.replace(/([a-i])$/, (x) => ' ' + ({ a: 'bis', b: 'ter', c: 'quater', d: 'quinquies', e: 'sexies', f: 'septies', g: 'octies', h: 'nonies', i: 'decies' })[x]) : m.num;
    return c;
  }));
}

function useWidth(ref) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setW(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return w;
}

// ------------------------------------------------------------------ Texte
/** Spaltenbeschriftung; Anhang ohne Nummer (VIS-VO «anx») als «Anh.» */
const colNum = (type, num) => (type === 'annex' && !/^[0-9IVXLCDM]+[a-z]*$/i.test(num || '') ? t('ov.rs.annexNoNum') : num);
const hits = (n) => t('refs.graph.hits', { n });
const unitsN = (n) => t('refs.graph.units', { n });
const targetsN = (n) => t('refs.graph.targets', { n });
const rowLabel = (r) => (r.kind === 'foreign' ? t('ov.rs.foreign') : r.label);
/** «Art. 23, 13, 27» statt «Art. 23, Art. 13, Art. 27» */
function compactList(labels) {
  let prev = null;
  return labels.map((s) => {
    const m = /^(\S+\.?)\s+(.*)$/.exec(s);
    if (m && prev === m[1] && !/\d{4}/.test(s)) return m[2];
    prev = m ? m[1] : null;
    return s;
  }).join(', ');
}
function cellText(model, rowId, i) {
  const c = model.cells[rowId][i];
  const u = model.units[i];
  const row = model.rows.find((r) => r.id === rowId);
  const MAX = 6;
  const labs = c.targets.slice(0, MAX).map((x) => x.label + (x.missing ? ' (' + t('refs.graph.missing') + ')' : ''));
  const more = c.targets.length > MAX ? ' ' + t('ov.rs.andMore', { n: c.targets.length - MAX }) : '';
  return t('ov.rs.cellTip', { from: u.label, to: rowLabel(row), hits: hits(c.n), list: compactList(labs) + more });
}
const LEVEL_KEYS = ['', 'ov.rs.level1', 'ov.rs.level2', 'ov.rs.level3', 'ov.rs.level4'];
const lvlText = (n) => t(LEVEL_KEYS[levelOf(n)]);
function arcLines(model, arc, only) {
  const A = model.units[arc.a], B = model.units[arc.b];
  const out = [];
  if (arc.ab && only !== 'ba') out.push(t('ov.rs.arcTip', { from: A.label, to: B.label, hits: hits(arc.ab) }));
  if (arc.ba && only !== 'ab') out.push(t('ov.rs.arcTip', { from: B.label, to: A.label, hits: hits(arc.ba) }));
  return out;
}
function unitAria(model, i) {
  const p = model.per[i];
  const u = model.units[i];
  const parts = model.rows.map((r) => (model.cells[r.id][i] ? `${rowLabel(r)} ${fmtNum(model.cells[r.id][i].n)}` : null)).filter(Boolean);
  return t('ov.rs.ariaUnit', { unit: u.label, inUnits: unitsN(p.inUnits), inHits: hits(p.inRefs), outTargets: targetsN(p.outTargets), outHits: hits(p.outRefs) })
    + (parts.length ? ', ' + t('ov.rs.ariaRows', { list: parts.join(', ') }) : '');
}

// ------------------------------------------------------------------ Diagramm
/**
 * Bogendiagramm mit Zeilen. sel: Index der gewählten Einheit oder -1. static: ohne Interaktion (Exportkarte).
 * onSelect(i) wählt bzw. hebt die Auswahl auf.
 */
function StructureChart({ model, data, lang, stageId, width, colW, sel = -1, onSelect, static: stat = false, idp = 'rs' }) {
  const ui = uiLang();
  const nums = model.units.map((u) => colNum(u.type, u.num));
  const geo = geometry(nums, model.rows.length, width, colW);
  const { colW: cw, plotW, H, yAxis, yRows, x, x0, rotate } = geo;
  const wrap = useRef();
  const scroller = useRef();
  const tipRef = useRef();
  const [hot, setHot] = useState(null);       // { kind: 'arc'|'cell'|'col', id, i, row, dir, px, py }
  const [focusI, setFocusI] = useState(sel >= 0 ? sel : 0);
  const [kb, setKb] = useState(-1);           // Index in den Verbindungen der fokussierten Einheit (Pfeil hoch/runter)
  const tipId = idp + '-tip';
  const N = model.units.length;
  const selU = sel >= 0 ? model.units[sel] : null;

  // Tooltip im sichtbaren Bereich halten
  useLayoutEffect(() => {
    const tip = tipRef.current, el = wrap.current;
    if (!tip || !el || !hot) return;
    const Wd = el.clientWidth;
    let left = hot.px + 14, top = hot.py + 14;
    if (left + tip.offsetWidth > Wd) left = Math.max(0, hot.px - tip.offsetWidth - 14);
    if (top + tip.offsetHeight > el.clientHeight + 40 && hot.py - tip.offsetHeight - 10 >= 0) top = hot.py - tip.offsetHeight - 10;
    tip.style.left = Math.max(0, Math.min(left, Wd - tip.offsetWidth)) + 'px';
    tip.style.top = top + 'px';
  });

  // Bögen: Ruhezustand ein Bogen je Paar; mit Auswahl je Richtung getrennt (ausgehend durchgezogen, eingehend gestrichelt)
  const arcs = [];
  const span = Math.max(1, (N - 1) * cw);
  for (const a of model.arcs) {
    const xa = x(a.a), xb = x(a.b);
    const rx = (xb - xa) / 2;
    const ry = arcRy(rx, span);
    if (sel >= 0 && (a.a === sel || a.b === sel)) {
      const outN = a.a === sel ? a.ab : a.ba, inN = a.a === sel ? a.ba : a.ab;
      const dOut = a.a === sel ? 'ab' : 'ba', dIn = a.a === sel ? 'ba' : 'ab';
      if (outN) arcs.push({ key: a.id + ':o', arc: a, n: outN, cls: 'is-out', only: dOut, d: `M${xa},${yAxis} A${rx},${ry} 0 0 1 ${xb},${yAxis}`, apex: [(xa + xb) / 2, yAxis - ry] });
      if (inN) { const r2 = outN ? Math.max(2, ry * 0.8) : ry; arcs.push({ key: a.id + ':i', arc: a, n: inN, cls: 'is-in', only: dIn, d: `M${xa},${yAxis} A${rx},${r2} 0 0 1 ${xb},${yAxis}`, apex: [(xa + xb) / 2, yAxis - r2] }); }
    } else {
      arcs.push({ key: a.id, arc: a, n: a.n, cls: sel >= 0 ? 'is-dim' : '', only: null, d: `M${xa},${yAxis} A${rx},${ry} 0 0 1 ${xb},${yAxis}`, apex: [(xa + xb) / 2, yAxis - ry] });
    }
  }
  // hervorgehobene zuletzt zeichnen
  arcs.sort((p, q) => (p.cls === 'is-dim' || !p.cls ? 0 : 1) - (q.cls === 'is-dim' || !q.cls ? 0 : 1) || q.n - p.n);

  // Verbindungen einer Einheit für die Tastatur (Pfeil hoch/runter): Bögen je Richtung, dann Zellen
  const linksOf = (i) => {
    const L = [];
    for (const a of model.arcs) {
      if (a.a !== i && a.b !== i) continue;
      const outD = a.a === i ? 'ab' : 'ba', inD = a.a === i ? 'ba' : 'ab';
      if (a[outD]) L.push({ kind: 'arc', arc: a, only: outD, n: a[outD], dir: 'out' });
      if (a[inD]) L.push({ kind: 'arc', arc: a, only: inD, n: a[inD], dir: 'in' });
    }
    L.sort((p, q) => q.n - p.n);
    for (const r of model.rows) if (model.cells[r.id][i]) L.push({ kind: 'cell', row: r.id, i, n: model.cells[r.id][i].n });
    return L;
  };
  // Position im Wrapper aus SVG-Koordinaten
  const toWrap = (sx, sy) => {
    const svg = wrap.current && wrap.current.querySelector('svg.rs-svg');
    const wr = wrap.current && wrap.current.getBoundingClientRect();
    if (!svg || !wr) return [sx, sy];
    const r = svg.getBoundingClientRect();
    return [r.left - wr.left + sx, r.top - wr.top + sy];
  };
  const fromEvent = (e) => { const wr = wrap.current.getBoundingClientRect(); return [e.clientX - wr.left, e.clientY - wr.top]; };
  const showLink = (lk) => {
    if (!lk) { setHot(null); return; }
    if (lk.kind === 'arc') {
      const xa = x(lk.arc.a), xb = x(lk.arc.b);
      const [px, py] = toWrap((xa + xb) / 2, yAxis - arcRy((xb - xa) / 2, Math.max(1, (N - 1) * cw)));
      setHot({ kind: 'arc', id: lk.arc.id, arc: lk.arc, only: lk.only, px, py });
    } else {
      const k = model.rows.findIndex((r) => r.id === lk.row);
      const [px, py] = toWrap(x(lk.i), yRows + k * G.rowH + G.rowH / 2);
      setHot({ kind: 'cell', id: lk.row + ':' + lk.i, row: lk.row, i: lk.i, px, py });
    }
  };

  // Fokus und Roving-Tabindex
  const optId = (i) => `${idp}-u-${i}`;
  const focusCol = (i) => {
    const el = wrap.current && wrap.current.querySelector('#' + optId(i));
    setFocusI(i);
    setKb(-1);
    if (!el) return;
    el.focus({ preventScroll: true });
    // sichtbar machen (die linke Beschriftungsspalte bleibt stehen)
    const sc = scroller.current;
    if (sc) {
      const left = G.labelW + x0(i), right = left + cw;
      if (left - G.labelW < sc.scrollLeft) sc.scrollLeft = Math.max(0, left - G.labelW - cw);
      else if (right > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = right - sc.clientWidth + cw;
    }
  };
  const colTip = (i) => {
    const [px, py] = toWrap(x(i), yAxis + 4);
    setHot({ kind: 'col', id: 'col:' + i, i, px, py });
  };
  const onKey = (e) => {
    const i = focusI;
    let n = null;
    if (e.key === 'ArrowRight') n = Math.min(N - 1, i + 1);
    else if (e.key === 'ArrowLeft') n = Math.max(0, i - 1);
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = N - 1;
    if (n != null) { e.preventDefault(); focusCol(n); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(i); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const L = linksOf(i);
      if (!L.length) return;
      const k = kb < 0 ? (e.key === 'ArrowDown' ? 0 : L.length - 1) : (kb + (e.key === 'ArrowDown' ? 1 : -1) + L.length) % L.length;
      setKb(k);
      showLink(L[k]);
      return;
    }
    if (e.key === 'Escape') {
      if (hot) { e.preventDefault(); setHot(null); setKb(-1); } else if (sel >= 0) { e.preventDefault(); onSelect(sel); }
    }
  };
  // Klick: Spalte unter dem Zeiger (auch auf Bögen und Zellen)
  const onClick = (e) => {
    if (stat) return;
    const svg = e.currentTarget;
    const r = svg.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left - G.padX) / cw);
    if (i < 0 || i >= N) return;
    focusCol(i);
    onSelect(i);
  };

  // Tooltip-Inhalt
  const tipOf = (h) => {
    if (!h) return null;
    if (h.kind === 'arc') return html`${arcLines(model, h.arc, h.only).map((s, j) => html`<p class=${j ? 'rg-tip-h' : 'rg-tip-h'}>${s}</p>`)}`;
    if (h.kind === 'cell') {
      const c = model.cells[h.row][h.i];
      return html`<p class="rg-tip-h">${cellText(model, h.row, h.i)}</p><p class="rg-tip-n">${lvlText(c.n)}</p>`;
    }
    const p = model.per[h.i], u = model.units[h.i];
    const ti = data.unitTitle(u.id, lang, stageId);
    return html`<p class="rg-tip-h">${u.label}${ti.text || ti.derived ? html` <span class="rs-tip-title" lang=${lang}>${ti.text || ti.derived}</span>` : null}</p>
      <p class="rg-tip-n">${t('ov.rs.tipIn', { units: unitsN(p.inUnits), hits: hits(p.inRefs) })}</p>
      <p class="rg-tip-n">${t('ov.rs.tipOut', { targets: targetsN(p.outTargets), hits: hits(p.outRefs) })}</p>
      <p class="rg-tip-n">${sel === h.i ? t('ov.rs.tipKeysSel') : t('ov.rs.tipKeys')}</p>`;
  };

  const hotArcId = hot && hot.kind === 'arc' ? hot.id : null;
  const hotOnly = hot && hot.kind === 'arc' ? hot.only : null;
  const summary = t('ov.rs.summary', { abbr: (data.abbr && data.abbr[ui]) || '', pairs: fmtNum(model.totals.pairs), hits: hits(model.totals.ownRefs) });

  const bandY = 0;
  const groupBands = model.groups.map((g, gi) => {
    const gx = x0(g.from), gw = (g.to - g.from + 1) * cw;
    const short = g.type === 'none' ? '' : t('ov.rs.group.' + (g.type === 'annexes' ? 'annexes' : g.type === 'title' ? 'title' : 'chapter'), { num: g.num || '' });
    const te = g.toc ? data.tocById.get(g.toc) : null;
    const hd = te ? data.heading(te, lang, stageId) : null;
    const full = hd ? plain(`${hd.label || ''} ${hd.text || ''}`).trim() : short;
    // kurze Beschriftung, sonst nur die Nummer, sonst keine (voller Titel im Tooltip)
    const room = gw - 8;
    const label = [short, g.num || ''].find((c) => c && textW(c) <= room) || '';
    return { g, gi, gx, gw, short, full, label };
  });

  const svg = html`<svg class=${'rs-svg' + (sel >= 0 ? ' has-sel' : '') + (hot ? ' has-hot' : '')} width=${plotW} height=${H} viewBox=${`0 0 ${plotW} ${H}`}
      role="group" aria-label=${summary} onClick=${stat ? undefined : onClick}>
    <g class="rs-bands" aria-hidden="true">
      ${groupBands.map((b) => html`<g class=${'rs-band' + (b.gi % 2 ? ' is-alt' : '')} lang=${lang}>
        <title>${b.full}</title>
        <rect x=${b.gx} y=${bandY} width=${b.gw} height=${G.bandH - 4} />
        ${b.label ? html`<text class="rs-band-t" x=${b.gx + 4} y=${bandY + 15} lang=${ui}>${b.label}</text>` : null}
      </g>`)}
      ${groupBands.slice(1).map((b) => html`<line class="rs-sep" x1=${b.gx} x2=${b.gx} y1=${G.bandH} y2=${H - G.bottom} />`)}
    </g>
    ${selU ? html`<rect class="rs-selband" aria-hidden="true" x=${x0(sel)} y=${G.bandH} width=${cw} height=${H - G.bandH - G.bottom} />` : null}
    <g class="rs-cols" role=${stat ? undefined : 'listbox'} aria-orientation=${stat ? undefined : 'horizontal'} aria-label=${stat ? undefined : t('ov.rs.listLabel', { abbr: (data.abbr && data.abbr[ui]) || '' })} aria-hidden=${stat ? 'true' : undefined} onKeyDown=${stat ? undefined : onKey}>
      ${model.units.map((u, i) => html`<g class=${'rs-col' + (i === sel ? ' is-sel' : '')} id=${stat ? undefined : optId(i)} role=${stat ? undefined : 'option'} aria-selected=${stat ? undefined : i === sel ? 'true' : 'false'}
          tabindex=${stat ? undefined : i === focusI ? '0' : '-1'} aria-label=${stat ? undefined : unitAria(model, i)} aria-describedby=${!stat && hot && (hot.kind === 'col' || kb >= 0) && focusI === i ? tipId : undefined}
          onFocus=${stat ? undefined : (e) => { setFocusI(i); let kbd = true; try { kbd = e.currentTarget.matches(':focus-visible'); } catch { /* ältere Browser */ } if (kbd) colTip(i); }} onBlur=${stat ? undefined : () => setHot((h) => (h && (h.kind === 'col' || kb >= 0) ? null : h))}>
        <rect class="rs-col-hit" x=${x0(i)} y=${G.bandH} width=${cw} height=${H - G.bandH - G.bottom} />
        <rect class="rs-focus" x=${x0(i) + 1} y=${G.bandH + 1} width=${cw - 2} height=${H - G.bandH - G.bottom - 2} />
        <rect class="rs-focus-in" x=${x0(i) + 3} y=${G.bandH + 3} width=${Math.max(0, cw - 6)} height=${H - G.bandH - G.bottom - 6} />
      </g>`)}
    </g>
    <g class="rs-arcs" aria-hidden="true">
      ${arcs.map((a) => html`<path class=${'rs-arc ' + a.cls + (hotArcId === a.arc.id && (!hotOnly || !a.only || hotOnly === a.only) ? ' is-hot' : '')} d=${a.d} style=${{ strokeWidth: strokeW(a.n) }} />`)}
    </g>
    ${stat ? null : html`<g class="rs-arc-hits" aria-hidden="true">${arcs.map((a) => html`<path class="rs-arc-hit" d=${a.d} style=${{ strokeWidth: Math.max(8, strokeW(a.n) + 6) }}
        onMouseMove=${(e) => { const [px, py] = fromEvent(e); setHot({ kind: 'arc', id: a.arc.id, arc: a.arc, only: a.only, px, py }); }}
        onMouseLeave=${() => setHot((h) => (h && h.kind === 'arc' && h.id === a.arc.id ? null : h))} />`)}</g>`}
    <g class="rs-axis" aria-hidden="true">
      <line class="rs-axis-l" x1=${G.padX} x2=${plotW - G.padX} y1=${yAxis} y2=${yAxis} />
      ${model.units.map((u, i) => html`<circle class=${'rs-dot' + (i === sel ? ' is-sel' : '')} cx=${x(i)} cy=${yAxis} r=${i === sel ? 4 : 2} />`)}
      ${model.units.map((u, i) => (rotate
        ? html`<text class=${'rs-num' + (i === sel ? ' is-sel' : '')} x=${x(i) + G.fs * 0.36} y=${yAxis + 8} text-anchor="end" transform=${`rotate(-90 ${x(i) + G.fs * 0.36} ${yAxis + 8})`}>${nums[i]}</text>`
        : html`<text class=${'rs-num' + (i === sel ? ' is-sel' : '')} x=${x(i)} y=${yAxis + 17} text-anchor="middle">${nums[i]}</text>`))}
    </g>
    <g class="rs-rows" aria-hidden="true">
      ${model.rows.map((r, k) => {
        const y = yRows + k * G.rowH;
        const st = r.color ? { '--rs-c': `var(--${r.color})` } : undefined;
        return html`<g class=${'rs-row' + (r.kind === 'foreign' ? ' is-foreign' : '')} style=${st}>
          <line class="rs-row-l" x1=${G.padX} x2=${plotW - G.padX} y1=${y + G.rowH} y2=${y + G.rowH} />
          ${model.cells[r.id].map((c, i) => (c ? html`<rect class=${'rs-cell lv' + levelOf(c.n) + (hot && hot.kind === 'cell' && hot.row === r.id && hot.i === i ? ' is-hot' : '')}
              x=${x0(i) + 1.5} y=${y + 4} width=${Math.max(2, cw - 3)} height=${G.rowH - 8} fill-opacity=${LEVEL_OPACITY[levelOf(c.n)]}
              onMouseMove=${stat ? undefined : (e) => { const [px, py] = fromEvent(e); setHot({ kind: 'cell', id: r.id + ':' + i, row: r.id, i, px, py }); }}
              onMouseLeave=${stat ? undefined : () => setHot((h) => (h && h.kind === 'cell' && h.row === r.id && h.i === i ? null : h))} />` : null))}
        </g>`;
      })}
    </g>
  </svg>`;

  // Linke Beschriftungsspalte (bleibt beim horizontalen Scrollen stehen)
  const labels = html`<div class="rs-labels" style=${{ width: G.labelW + 'px', height: H + 'px' }} aria-hidden=${stat ? undefined : 'true'}>
    <span class="rs-lab rs-lab-cap" style=${{ top: '4px' }}>${t('ov.rs.labStructure')}</span>
    <span class="rs-lab rs-lab-own" style=${{ top: G.bandH + 8 + 'px' }}><svg width="12" height="12" aria-hidden="true"><circle class="rs-sw-own" cx="6" cy="6" r="5" /></svg>
      <span><span class="rs-lab-name">${t('ov.rs.labOwn', { abbr: (data.abbr && data.abbr[ui]) || '' })}</span><span class="rs-lab-sub">${t('ov.rs.labOwnSub', { pairs: fmtNum(model.totals.pairs), hits: hits(model.totals.ownRefs) })}</span></span></span>
    <span class="rs-lab rs-lab-cap" style=${{ top: yAxis + (rotate ? 8 : 6) + 'px' }}>${t('ov.rs.labUnit')}</span>
    ${model.rows.map((r, k) => html`<span class="rs-lab rs-lab-row" style=${{ top: yRows + k * G.rowH + 'px', height: G.rowH + 'px' }}>
      <span class=${'rs-sw' + (r.kind === 'foreign' ? ' is-foreign' : '')} style=${r.color ? { '--rs-c': `var(--${r.color})` } : undefined}></span>
      <span class="rs-lab-name">${rowLabel(r)}</span><span class="rs-lab-n">${fmtNum(r.refs)}</span></span>`)}
  </div>`;

  if (stat) return html`<div class="rs-wrap is-static"><div class="rs-grid" style=${{ width: G.labelW + plotW + 'px' }}>${labels}${svg}</div></div>`;
  return html`<div class="rs-wrap" ref=${wrap} onMouseLeave=${() => setHot((h) => (h && h.kind !== 'col' ? null : h))}>
    <div class=${'rs-scroll' + (geo.scroll ? ' is-scroll' : '')} ref=${scroller} tabindex="0" role="region" aria-label=${t('ov.rs.region', { abbr: (data.abbr && data.abbr[ui]) || '' })}>
      <div class="rs-grid" style=${{ width: G.labelW + plotW + 'px' }}>${labels}${svg}</div>
    </div>
    ${hot ? html`<div class="rg-tip rs-tip" role="tooltip" id=${tipId} ref=${tipRef} style=${{ left: hot.px + 14 + 'px', top: hot.py + 14 + 'px' }}>${tipOf(hot)}</div>` : null}
  </div>`;
}

// ------------------------------------------------------------------ Leiste der gewählten Einheit
function SelBar({ model, data, lang, stageId, sel, onNet }) {
  if (sel < 0) return html`<p class="rs-hint">${t('ov.rs.hintSelect')}</p>`;
  const u = model.units[sel], p = model.per[sel];
  const ti = data.unitTitle(u.id, lang, stageId);
  const top = strongest(model, sel, 3);
  const linkText = (x) => (x.dir === 'in' ? t('ov.rs.link', { from: x.label, to: u.label, hits: hits(x.n) }) : t('ov.rs.link', { from: u.label, to: x.label, hits: hits(x.n) }));
  return html`<div class="rs-bar" aria-live="polite">
    <div class="rs-bar-main">
      <p class="rs-bar-sel"><span class="rs-bar-k">${t('ov.rs.selected')}</span> <b>${u.label}</b> ${ti.repealed ? null : html`<${TitleText} ti=${ti} lang=${lang} className="rs-bar-title" />`}</p>
      <dl class="rs-figs">
        <div><dt>${t('refs.graph.inHead')}</dt><dd>${unitsN(p.inUnits)} · ${hits(p.inRefs)}</dd></div>
        <div><dt>${t('refs.graph.outHead')}</dt><dd>${targetsN(p.outTargets)} · ${hits(p.outRefs)}</dd></div>
        ${top.length ? html`<div class="rs-fig-top"><dt>${t('ov.rs.strongest')}</dt><dd><ol class="rs-top">${top.map((x) => html`<li>${linkText(x)}</li>`)}</ol></dd></div>` : null}
      </dl>
      ${p.selfCount || p.uncertainCount ? html`<p class="rs-bar-note">${[p.selfCount ? t('refs.graph.self', { n: p.selfCount, unit: u.label }) : '', p.uncertainCount ? t('refs.graph.uncertain', { n: p.uncertainCount }) : ''].filter(Boolean).join(' ')}</p>` : null}
    </div>
    <div class="rs-bar-actions btn-group">
      <button type="button" class="btn btn-primary btn-sm" id="rs-read" onClick=${() => go({ view: 'lesen', u: u.id, k: null })}><${Icon} name="book" />${t('ov.readText')}</button>
      <button type="button" class="btn btn-tertiary btn-sm" id="rs-chron" onClick=${() => go({ view: 'chronik', u: u.id, k: null })}><${Icon} name="clock" />${t('ov.openChron')}</button>
      <button type="button" class="btn btn-secondary btn-sm" id="rs-net" onClick=${onNet}><${Icon} name="maximize" />${t('ov.rs.showNet')}</button>
    </div>
  </div>`;
}

// ------------------------------------------------------------------ Legende und Hinweise
const LgLine = ({ cls }) => html`<svg class="rs-lg-sw" width="26" height="12" viewBox="0 0 26 12" aria-hidden="true"><path class=${'rs-arc ' + cls} d="M2,11 A11,9 0 0 1 24,11" style=${{ strokeWidth: 1.6 }} /></svg>`;
function Legend({ model }) {
  return html`<p class="legend-line rs-legend">
    <span class="lg"><${LgLine} cls="is-out" />${t('ov.rs.lgOut')}</span>
    <span class="lg"><${LgLine} cls="is-in" />${t('ov.rs.lgIn')}</span>
    <span class="lg"><${LgLine} cls="" />${t('ov.rs.lgOther')}</span>
    <span class="lg"><svg class="rs-lg-sw" width="26" height="12" viewBox="0 0 26 12" aria-hidden="true"><path class="rs-arc" d="M1,4 L25,4" style=${{ strokeWidth: 0.6 + 0.7 }} /><path class="rs-arc" d="M1,9 L25,9" style=${{ strokeWidth: 0.6 + Math.sqrt(16) * 0.7 }} /></svg>${t('ov.rs.lgWidth')}</span>
    <span class="lg rs-lg-levels"><span class="rs-lg-cells" aria-hidden="true">${[1, 2, 3, 4].map((l) => html`<span class="rs-lg-cell" style=${{ opacity: LEVEL_OPACITY[l] }}></span>`)}</span>${t('ov.rs.lgLevels')}</span>
  </p>
  <p class="rs-note">${model && (model.totals.selfCount || model.totals.uncertainCount || model.totals.offAxis) ? t('ov.rs.notShown', {
    self: fmtNum(model.totals.selfCount), uncertain: fmtNum(model.totals.uncertainCount), off: fmtNum(model.totals.offAxis) }) : ''}</p>`;
}

// ------------------------------------------------------------------ Tabelle (Textalternative)
function StructureTable({ model, data, lang, stageId, all }) {
  const rows = model.units.map((u, i) => ({ u, i, p: model.per[i] })).filter((x) => all || x.p.inRefs + x.p.outRefs > 0);
  const ownOut = (i) => model.per[i].outOwn.reduce((s, x) => s + x.n, 0);
  const num = (n) => (n ? fmtNum(n) : html`<span class="muted" aria-hidden="true">–</span><span class="sr">0</span>`);
  return html`<div class="tbl-scroll rs-tbl-wrap" tabindex="0" role="region" aria-label=${t('ov.rs.tableTitle')}>
    <table class="tbl-data rs-tbl" id="tbl-refs-structure">
      <caption class="sr">${t('ov.rs.tableCaption', { abbr: (data.abbr && data.abbr[uiLang()]) || '' })}</caption>
      <thead><tr>
        <th scope="col">${t('common.unit')}</th>
        <th scope="col" class="num">${t('ov.rs.colOut')}</th>
        <th scope="col" class="num">${t('ov.rs.colIn')}</th>
        ${model.rows.map((r) => html`<th scope="col" class="num"><span class=${'rs-sw' + (r.kind === 'foreign' ? ' is-foreign' : '')} style=${r.color ? { '--rs-c': `var(--${r.color})` } : undefined} aria-hidden="true"></span>${rowLabel(r)}</th>`)}
      </tr></thead>
      <tbody>${rows.map(({ u, i, p }) => {
        const ti = data.unitTitle(u.id, lang, stageId);
        return html`<tr>
          <th scope="row" class="rs-tbl-u"><button type="button" class="link" onClick=${() => go({ view: 'chronik', u: u.id, k: null })}>${u.label}</button> <${TitleText} ti=${ti} lang=${lang} className="rs-tbl-t" /></th>
          <td class="num">${num(ownOut(i))}</td>
          <td class="num">${num(p.inRefs)}</td>
          ${model.rows.map((r) => html`<td class="num">${num(model.cells[r.id][i] ? model.cells[r.id][i].n : 0)}</td>`)}
        </tr>`;
      })}</tbody>
    </table>
  </div>`;
}

// ------------------------------------------------------------------ PNG-Export
function exportPng({ model, data, lang, stageId, sel }) {
  return async () => {
    try {
      const ui = uiLang();
      const N = model.units.length;
      const colW = Math.max(G.minCol, Math.min(24, Math.floor(((1136 - G.labelW - 2 * G.padX) / N) * 10) / 10));
      const geo = geometry(model.units.map((u) => colNum(u.type, u.num)), model.rows.length, 0, colW);
      const W = G.labelW + geo.plotW;
      const abbr = (data.abbr && data.abbr[ui]) || '';
      const u = sel >= 0 ? model.units[sel] : null;
      const title = t('ov.rs.cardTitle', { abbr }) + (u ? ' · ' + u.label : '');
      const draw = () => html`<article class="card card-a4 rs-card" lang=${ui} style=${{ width: Math.max(W, 900) + 96 + 'px', '--fs': '16px' }}>
        <header class="card-head cbrk">
          <div class="card-brand"><span><b>SGK</b> Navigator</span><span>${data.stageLabel(stageId, { short: true })}, ${lang.toUpperCase()}</span></div>
          <h1 class="card-title">${title}</h1>
          <p class="card-sub">${t('ov.rs.stand', { stage: data.stageLabel(stageId), lang: lang.toUpperCase() })}</p>
        </header>
        <div class="card-body"><${InlineSvgStyles}>
          <${StructureChart} model=${model} data=${data} lang=${lang} stageId=${stageId} width=${W} colW=${colW} sel=${sel} static idp="rsx" />
        </${InlineSvgStyles}>
          ${u ? html`<p class="rs-card-sel">${t('ov.rs.cardSel', { unit: u.full, inUnits: unitsN(model.per[sel].inUnits), inHits: hits(model.per[sel].inRefs), outTargets: targetsN(model.per[sel].outTargets), outHits: hits(model.per[sel].outRefs) })}</p>` : null}
          <${InlineSvgStyles}><${Legend} model=${model} /></${InlineSvgStyles}>
        </div>
        <footer class="card-foot cbrk"><p class="card-source">${t('refs.graph.cardSource', { stage: data.stageLabel(stageId), lang: lang.toUpperCase(), date: fmtDate(todayIso()) })}</p></footer>
      </article>`;
      const safe = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const name = `${t('ov.rs.exportName')}_${safe(abbr)}${u ? '_' + safe(u.label) : ''}_${stageId}_${lang.toUpperCase()}`;
      const ex = await import('../export.js');
      await ex.exportCustom({ draw, format: 'a4', name, title, ui }, 'png');
      toast(t('export.done', { kind: 'PNG' }), 'success', 3000);
    } catch (e) { console.error(e); toast(t('export.failed', { msg: e.message || String(e) }), 'error'); }
  };
}

// ------------------------------------------------------------------ Abschnitt
/** Abschnitt «Verweisstruktur» der Übersicht. */
export function RefsStructure({ data, route }) {
  const st = settingsStore.use();
  const view = st.rsView === 'table' ? 'table' : 'chart';
  const setView = (v) => { settingsStore.set({ ...settingsStore.get(), rsView: v }); persistSettings(); };
  const stage = data.latest;
  const stageId = stage.id;
  const lang = !stage.langs || stage.langs.includes(route.l) ? route.l : stage.langs[0];
  const ui = uiLang();
  const box = useRef();
  const width = useWidth(box);
  const model = useLazyModel(box, data, lang, stageId);
  const [selId, setSelId] = useState(null);
  const [all, setAll] = useState(false);
  const [net, setNet] = useState(false);
  const [busy, setBusy] = useState(false);
  const sel = model && selId ? model.units.findIndex((u) => u.id === selId) : -1;
  const onSelect = (i) => setSelId((cur) => (model.units[i].id === cur ? null : model.units[i].id));
  // Platzhalter: gleiche Höhe wie das Diagramm (ohne Modell aus den Spaltenbeschriftungen berechnet)
  const nRows = Math.max(1, works().filter((w) => w.id !== data.workId).length + 1);
  const phH = useMemo(() => (width ? geometry(liteNums(data, stageId, ui), nRows, width).H : 300), [data, stageId, ui, width]);
  const png = model ? exportPng({ model, data, lang, stageId, sel }) : null;
  const abbr = (data.abbr && data.abbr[ui]) || '';
  return html`<section class="ov-sec rs-sec" aria-labelledby="rs-h">
    <div class="sec-head"><h2 id="rs-h">${t('ov.rs.title')}</h2>
      <p class="sec-note">${t('ov.rs.note')}</p>
      <${LegalLangSwitch} data=${data} route=${route} id="lbl-legal-rs" />
      <${Seg} label=${t('ov.rs.view')} value=${view} onChange=${setView} options=${[{ value: 'chart', label: t('ov.rs.chart') }, { value: 'table', label: t('ov.rs.table') }]} />
      <button type="button" class="btn btn-tertiary" id="rs-png" disabled=${!model || busy} onClick=${async () => { setBusy(true); await png(); setBusy(false); }}><${Icon} name="download" />${t('refs.graph.exportPng')}</button>
      <${HelpLink} sec="uebersicht" />
    </div>
    <p class="rs-stand">${t('ov.rs.stand', { stage: data.stageLabel(stageId), lang: lang.toUpperCase() })}</p>
    <div class="rs-box" ref=${box}>
      ${!model || !width ? html`<div class="rs-ph" style=${{ height: (view === 'table' ? 360 : phH + 2) + 'px' }} aria-busy="true"><p class="muted small">${t('ov.rs.loading')}</p></div>
          ${view === 'table' ? null : html`<p class="rs-hint">${t('ov.rs.hintSelect')}</p><${Legend} model=${null} />`}`
        : model.empty ? html`<p class="muted small">${t('ov.rs.empty', { abbr })}</p>`
        : view === 'table' ? html`
          <label class="check rs-all"><input type="checkbox" checked=${all} onChange=${(e) => setAll(e.target.checked)} />${t('ov.rs.showAll')}</label>
          <${StructureTable} model=${model} data=${data} lang=${lang} stageId=${stageId} all=${all} />`
        : html`<${StructureChart} model=${model} data=${data} lang=${lang} stageId=${stageId} width=${width} sel=${sel} onSelect=${onSelect} />
          <${SelBar} model=${model} data=${data} lang=${lang} stageId=${stageId} sel=${sel} onNet=${() => setNet(true)} />
          <${Legend} model=${model} />`}
    </div>
    ${net && sel >= 0 ? html`<${RefsGraphDialog} data=${data} unitId=${model.units[sel].id} k=${null} lang=${lang} stageId=${stageId} route=${route} scope="unit" setScope=${() => {}} onClose=${() => setNet(false)} />` : null}
  </section>`;
}
