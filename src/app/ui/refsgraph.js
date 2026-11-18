// Verweisnetz als Grafik (Ego-Netz) im Bereich «Verweise» der Chronologie-Schublade und als vergrösserte Ansicht (Dialog).
// Datenmodell: refsgraph-model.js (egoGraph). Zeichnung: SVG, ohne Bibliothek; Farben nur über CSS-Variablen (styles.css, .rg-*).
import { html } from 'htm/preact';
import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { go } from '../state.js';
import { works, workOfCelex, workData, workAbbr, stageAt, useLibrary } from '../library.js';
import { t, uiLang } from '../lib/i18n.js';
import { fmtDate, todayIso } from '../lib/format.js';
import { Icon, Seg, Modal, Portal } from './common.js';
import { RefsPanel, followRef, parseRefId, hashFor, eurlexUrl } from './refs.js';
import { egoGraph, excerpt, centerLabel } from './refsgraph-model.js';
import { settingsStore, persistSettings, toast } from '../app.js';

// ------------------------------------------------------------------ Modell mit Bibliothek
/** Bibliothek für egoGraph: Werkfolge wie Werk-Tabs, Stand der weiteren Werke passend zum Datum des aktuellen Stands (wie followRef). */
export function libFor(data, stageId) {
  const date = data.stageDate(stageId || data.latest.id) || data.today;
  return {
    workOfCelex, order: works().map((w) => w.id),
    workData: (id) => { const d = workData(id); return d && d.workId === id ? d : null; },
    abbr: (id, ui) => workAbbr(works().find((w) => w.id === id), ui),
    source: (id) => {
      const d = workData(id);
      if (!d || d.workId !== id) return null;
      return { data: d, stageId: stageAt(d.ds, date) || d.latest.id };
    },
  };
}
/** Modell nur berechnen, wenn das Netz angezeigt wird (memoisiert je Werk, Stand, Sprache, Einheit, Umfang, Oberflächensprache). */
export function useEgoGraph(data, lang, stageId, unitId, k, scope, mode) {
  const libV = useLibrary();
  const ui = uiLang();
  return useMemo(() => egoGraph(data, lang, stageId, unitId, k, {
    scope, ui, lib: libFor(data, stageId),
    ...(mode === 'drawer' ? { maxIncoming: 7, maxPerGroup: 4 } : {}),
  }), [data, lang, stageId, unitId, k, scope, ui, mode, libV]);
}

// ------------------------------------------------------------------ Textmasse
let mctx = null;
function textW(s, px, weight = 400) {
  if (typeof document === 'undefined') return String(s).length * px * 0.56;
  if (!mctx) mctx = document.createElement('canvas').getContext('2d');
  if (!mctx) return String(s).length * px * 0.56;
  mctx.font = `${weight} ${px}px "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif`;
  return mctx.measureText(String(s)).width * 1.03;
}
/** Kürzt mit Ellipse auf maxW Pixel */
function fit(s, maxW, px, weight) {
  s = String(s || '');
  if (textW(s, px, weight) <= maxW) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (textW(s.slice(0, m) + '…', px, weight) <= maxW) lo = m; else hi = m - 1; }
  return s.slice(0, lo).replace(/\s+$/, '') + '…';
}
const strokeW = (n) => 1 + Math.sqrt(n) * 1.1;
const curve = (x0, y0, x1, y1) => { const dx = (x1 - x0) * 0.5; return `M${x0},${y0} C${x0 + dx},${y0} ${x1 - dx},${y1} ${x1},${y1}`; };

// ------------------------------------------------------------------ Geometrie
const DIM = {
  drawer: { fs: 12, small: 11, rowIn: 32, rowOut: 22, rowMissing: 34, head: 24, gap: 6, r: 5, pad: 4 },
  dialog: { fs: 14, small: 12, rowIn: 40, rowOut: 28, rowMissing: 44, head: 32, gap: 10, r: 6, pad: 4 },
};

function layout(model, W, mode, center2) {
  const D = DIM[mode] || DIM.drawer;
  const inG = model.incoming.groups;
  const outG = model.outgoing.groups;
  const moreLabel = (n) => t('refs.graph.more', { n });
  const inLabel = (g) => (g.more ? moreLabel(g.units) : g.label);
  const outLabel = (r) => (r.more ? moreLabel(r.rows) : r.label);
  const cnt = (n) => t('refs.graph.times', { n });
  // Spaltenbreiten aus den Beschriftungen; reicht die Breite nicht, werden die Spalten anteilig begrenzt (Ellipse, voller Text im Tooltip)
  const rows = outG.flatMap((g) => [...g.rows, ...(g.hidden ? [g.hidden] : [])]);
  const leftNat = Math.max(36, ...inG.map((g) => textW(inLabel(g), D.fs)), ...inG.map((g) => textW(cnt(g.n), D.small)));
  const rightNat = Math.max(60, ...outG.map((g) => textW(g.label || t('refs.graph.foreign'), D.fs, 600) + 16),
    ...rows.map((r) => textW(outLabel(r), D.fs) + 8 + textW(cnt(r.n), D.small)), ...(rows.some((r) => r.missing) ? [textW(t('refs.graph.missing'), D.small)] : []));
  const centerNat = Math.max(textW(center2.title, D.fs, 600), center2.sub ? textW(center2.sub, D.fs) : 0) + 22;
  const edgeMin = mode === 'dialog' ? Math.min(160, W * 0.12) : Math.min(30, W * 0.08);
  const avail = W - 2 * D.pad - 24 - 2 * edgeMin;
  const leftCap = mode === 'dialog' ? 260 : W * 0.22, rightCap = mode === 'dialog' ? 380 : W * 0.32;
  const leftW = Math.min(leftNat, Math.max(leftCap, avail - Math.min(rightNat, rightCap) - centerNat));
  const rightW = Math.min(rightNat, Math.max(rightCap, avail - leftW - Math.min(centerNat, 84)));
  const xL = D.pad + leftW + 12;
  const xR = W - D.pad - rightW - 12;
  // Mittelknoten so breit wie sein Text, aber mit Platz für die Kanten links und rechts; lange Bestimmung auf zwei Zeilen
  const span = xR - xL;
  const minEdge = mode === 'dialog' ? Math.min(160, span * 0.3) : Math.min(30, span * 0.2);
  const cwMax = span - 2 * minEdge;
  const lines = [center2.title];
  if (center2.sub) {
    const sub = center2.sub;
    if (textW(sub, D.fs) + 22 > cwMax) {
      const half = sub.length / 2;
      const cuts = [...sub.matchAll(/,? /g)].map((m) => m.index + m[0].length);
      const cut = cuts.length ? cuts.reduce((best, c) => (Math.abs(c - half) < Math.abs(best - half) ? c : best), cuts[0]) : 0;
      if (cut) lines.push(sub.slice(0, cut).trim(), sub.slice(cut).trim()); else lines.push(sub);
    } else lines.push(sub);
  }
  const cwText = Math.max(...lines.map((x, i) => textW(x, D.fs, i ? 400 : 600)));
  const cw = Math.max(Math.min(cwText + 22, cwMax), Math.min(76, span * 0.5));
  const mid = (xL + xR) / 2;
  const cx0 = mid - cw / 2, cx1 = mid + cw / 2;
  const ch = Math.max(lines.length * D.fs * 1.4 + 22, mode === 'dialog' ? 64 : 52);
  // Höhen
  const leftH = inG.length * D.rowIn;
  let rightH = 0;
  for (const g of outG) {
    rightH += D.head;
    for (const r of g.rows) rightH += r.missing ? D.rowMissing : D.rowOut;
    if (g.hidden) rightH += D.rowOut;
    rightH += D.gap;
  }
  if (outG.length) rightH -= D.gap;
  const top = 8;
  const contentH = Math.max(leftH, rightH, ch + 16);
  const H = contentH + top * 2;
  // Schublade: Spalten oben bündig, Mittelknoten auf Höhe der linken Spalte (das Wesentliche ohne Scrollen sichtbar); Dialog: zentriert
  const topAlign = mode === 'drawer';
  const cy = topAlign ? top + Math.max(leftH, ch + 16, Math.min(rightH, 160)) / 2 : top + contentH / 2;
  const cTop = cy - ch / 2;
  // linke Spalte
  const left = [];
  let y = topAlign ? cy - leftH / 2 : top + (contentH - leftH) / 2;
  for (const g of inG) { left.push({ g, y, ny: y + D.rowIn / 2 - 3, label: fit(inLabel(g), leftW, D.fs), count: cnt(g.n) }); y += D.rowIn; }
  // rechte Spalte
  const right = [];
  y = topAlign ? top : top + (contentH - rightH) / 2;
  for (const g of outG) {
    right.push({ type: 'head', g, y, label: fit(g.label || t('refs.graph.foreign'), rightW + 6, D.fs, 600) });
    y += D.head;
    for (const r of [...g.rows, ...(g.hidden ? [g.hidden] : [])]) {
      const h = r.missing ? D.rowMissing : D.rowOut;
      const c = cnt(r.n);
      right.push({ type: 'row', g, r, y, h, ny: y + D.rowOut / 2, label: fit(outLabel(r), rightW - textW(c, D.small) - 8, D.fs), count: c });
      y += h;
    }
    y += D.gap;
  }
  // Kanten: Endpunkte am Mittelknoten über dessen Höhe verteilt
  const spread = (i, n) => (n <= 1 ? cy : cTop + 10 + (ch - 20) * (i / (n - 1)));
  const edges = [];
  left.forEach((L, i) => edges.push({ id: L.g.id, side: 'in', n: L.g.n, kind: L.g.more ? 'more' : 'in', d: curve(xL + D.r + 1, L.ny, cx0, spread(i, left.length)) }));
  const rr = right.filter((x) => x.type === 'row');
  rr.forEach((R, i) => edges.push({ id: R.r.id, side: 'out', n: R.r.n, kind: R.r.more ? 'more' : R.g.kind, color: R.g.color, missing: !!R.r.missing, d: curve(cx1, spread(i, rr.length), xR - D.r - 1, R.ny) }));
  return { D, W, H, xL, xR, cx0, cx1, cy, cTop, cw, ch, lines, left, right, edges, leftW, rightW };
}

// ------------------------------------------------------------------ Grafik
/** Formen der Knoten (Bedeutung nie nur über Farbe) */
function Shape({ kind, x, y, r, color, missing }) {
  const st = color ? { '--rg-c': `var(--${color})` } : undefined;
  if (kind === 'more') return html`<g class="rg-shape rg-more-ico"><rect x=${x - r - 1} y=${y - r - 1} width=${2 * r + 2} height=${2 * r + 2} /><path d=${`M${x - r + 2},${y} H${x + r - 2} M${x},${y - r + 2} V${y + r - 2}`} /></g>`;
  if (kind === 'library') return missing
    ? html`<rect class="rg-shape rg-sq is-missing" style=${st} x=${x - r} y=${y - r} width=${2 * r} height=${2 * r} />`
    : html`<rect class="rg-shape rg-sq" style=${st} x=${x - r} y=${y - r} width=${2 * r} height=${2 * r} />`;
  if (kind === 'foreign') return html`<circle class="rg-shape rg-ext" cx=${x} cy=${y} r=${r - 0.5} />`;
  return html`<circle class="rg-shape rg-own" cx=${x} cy=${y} r=${r} />`;
}

/**
 * Ego-Netz als SVG. mode 'drawer' (Schublade, Breite des Containers) oder 'dialog' (grösser, ohne Zusammenfassung);
 * static: ohne Interaktion (Exportkarte). navigate(fn): führt die Navigation aus (im Dialog: erst schliessen).
 */
export function RefsGraph({ model, mode = 'drawer', width, data, lang, stageId, route, navigate = (f) => f(), onMore, scopeNote, static: stat = false }) {
  const wrap = useRef();
  const tipRef = useRef();
  const [w, setW] = useState(width || 0);
  const [hot, setHot] = useState(null);
  useLayoutEffect(() => {
    if (width) { setW(width); return undefined; }
    const el = wrap.current;
    if (!el) return undefined;
    const upd = () => { const cw = Math.floor(el.clientWidth); if (cw > 0) setW(mode === 'dialog' ? Math.min(cw, 1100) : cw); };
    upd();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, mode]);
  // Tooltip im sichtbaren Bereich halten
  useLayoutEffect(() => {
    const tip = tipRef.current, el = wrap.current;
    if (!tip || !el || !hot) return;
    const H = el.clientHeight, Wd = el.clientWidth;
    let x = hot.x, y = hot.y;
    if (hot.side === 'out') x = hot.x - tip.offsetWidth;
    x = Math.max(0, Math.min(x, Wd - tip.offsetWidth));
    // unten nicht abschneiden: im Netz oder im sichtbaren Teil des Scrollbereichs (Schublade, Dialog) kein Platz -> über dem Knoten
    const sc = el.closest('.panel-body, .modal-body');
    const visBottom = sc ? sc.getBoundingClientRect().bottom - el.getBoundingClientRect().top : H;
    if ((y + tip.offsetHeight > Math.min(H, visBottom)) && hot.y0 - tip.offsetHeight - 4 >= 0) y = hot.y0 - tip.offsetHeight - 4;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  });
  const center = model.center;
  const center2 = {
    title: center.unit + (center.abbr ? ' ' + center.abbr : ''),
    sub: center.rest || scopeNote || '',
  };
  const ui = uiLang();
  if (!w) return html`<div class=${'rg-wrap rg-' + mode} ref=${wrap}></div>`;
  const L = layout(model, w, mode, center2);
  const { D } = L;
  const centerCite = center.unit + (center.rest ? ' ' + center.rest : '');
  const hits = (n) => t('refs.graph.hits', { n });
  const summary = t('refs.graph.summary', {
    cite: center.label + (center.scope === 'unit' && scopeNote ? ' (' + scopeNote + ')' : ''),
    inUnits: t('refs.graph.units', { n: model.incoming.units }), inHits: hits(model.incoming.refs),
    outTargets: t('refs.graph.targets', { n: model.outgoing.targets }), outHits: hits(model.outgoing.refs),
  });
  const tipId = 'rg-tip-' + mode;

  // Ziel eines Knotens: { href, ext, go }
  const linkOf = (node) => {
    if (node.more) return { more: true };
    if (node.kind === 'foreign') return node.celex ? { href: eurlexUrl(node.celex, lang), ext: true } : { none: true };
    const ref = node.ref;
    const dst = parseRefId(data, ref);
    if (dst.kind === 'none') return { none: true };
    return { href: hashFor(dst, route), go: () => followRef(data, ref, route, stageId) };
  };
  const enter = (info) => () => setHot(info);
  const leave = (id) => () => setHot((h) => (h && h.id === id ? null : h));
  const onAct = (lk) => (e) => {
    if (lk.more) { e.preventDefault(); if (onMore) onMore(); return; }
    if (lk.ext || lk.none) return; // EUR-Lex im neuen Tab (Standardverhalten)
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    navigate(lk.go);
  };
  const keyAct = (lk) => (e) => { if ((e.key === 'Enter' || e.key === ' ') && (lk.more || lk.none)) { e.preventDefault(); if (lk.more && onMore) onMore(); } };

  // Inhalt des Tooltips
  const tipOf = (h) => {
    if (!h) return null;
    const node = h.node;
    if (node.more) {
      return html`<p class="rg-tip-h">${h.side === 'in' ? t('refs.graph.inHead') : t('refs.graph.outHead')}</p>
        <p class="rg-tip-n">${(node.labels || []).join(', ')}</p><p class="rg-tip-n">${hits(node.n)}</p>
        ${onMore ? html`<p class="rg-tip-n">${t('refs.graph.moreTip')}</p>` : null}`;
    }
    const from = h.side === 'in' ? node.label : centerCite;
    const to = h.side === 'in' ? centerCite : node.full;
    const items = node.items || [];
    const nEx = mode === 'dialog' ? 2 : 1;
    const exs = items.slice(0, nEx).map((it) => excerpt(it.data || data, lang, it.stageId || stageId, it.unit, it.key, it.text, mode === 'dialog' ? 90 : 60)).filter(Boolean);
    return html`<p class="rg-tip-h">${from} → ${to}</p>
      <p class="rg-tip-n">${hits(node.n)}${node.missing ? ' · ' + t('refs.graph.missing') : ''}${node.kind === 'foreign' ? ' · ' + (node.celex ? t('refs.graph.extTab') : t('refs.graph.noLink')) : ''}</p>
      ${node.kind === 'foreign' && node.full ? html`<p class="rg-tip-n" lang=${node.fullLang}>${node.full}${node.celex ? html` <span class="rg-tip-code">${node.celex}</span>` : null}</p>` : null}
      ${exs.map((ex) => html`<p class="rg-tip-ex legal" lang=${lang}>${typeof ex === 'string' ? ex : html`${ex.pre}<mark>${ex.hit}</mark>${ex.post}`}</p>`)}
      ${items.length > nEx ? html`<p class="rg-tip-n">${t('refs.graph.tipMoreHits', { n: items.length - nEx })}</p>` : null}`;
  };

  const hotId = hot && hot.id;
  const ariaIn = (g) => (g.more ? t('refs.graph.ariaMore', { more: t('refs.graph.more', { n: g.units }), units: t('refs.graph.units', { n: g.units }), hits: hits(g.n) }) : t('refs.graph.ariaIn', { from: g.full, hits: hits(g.n), to: centerCite }));
  const ariaOut = (r) => (r.more ? t('refs.graph.ariaMoreOut', { more: t('refs.graph.more', { n: r.rows }), targets: t('refs.graph.targets', { n: r.rows }), hits: hits(r.n) })
    : t('refs.graph.ariaOut', { to: r.full, hits: hits(r.n), from: centerCite }) + (r.missing ? ', ' + t('refs.graph.missing') : '') + (r.kind === 'foreign' ? ', ' + (r.celex ? t('refs.graph.extTab') : t('refs.graph.noLink')) : ''));

  // keine Komponente (sonst bei jedem Hover neu eingehängt und der Fokus ginge verloren), sondern eine Funktion
  const nodeLink = ({ node, side, x0, x1, y0, h, nx, children, aria }) => {
    const lk = stat ? { none: true } : linkOf(node);
    const info = { id: node.id, node, side, x: side === 'in' ? nx + 12 : nx - 12, y: y0 + h + 2, y0 };
    const common = {
      class: 'rg-node' + (hotId === node.id ? ' is-hot' : '') + (node.more ? ' is-more' : ''),
      'aria-label': aria, 'aria-describedby': hotId === node.id ? tipId : undefined,
      onMouseEnter: stat ? undefined : enter(info), onMouseLeave: stat ? undefined : leave(node.id),
      onFocus: stat ? undefined : enter(info), onBlur: stat ? undefined : leave(node.id),
    };
    const body = html`<rect class="rg-hit" x=${x0} y=${y0 + 1} width=${x1 - x0} height=${h - 2} />
      <rect class="rg-focus" x=${x0 + 1} y=${y0 + 1} width=${x1 - x0 - 2} height=${h - 2} /><rect class="rg-focus-in" x=${x0 + 3} y=${y0 + 3} width=${x1 - x0 - 6} height=${h - 6} />
      ${children}`;
    if (stat) return html`<g class="rg-node">${children}</g>`;
    if (lk.href) return html`<a ...${common} href=${lk.href} target=${lk.ext ? '_blank' : undefined} rel=${lk.ext ? 'noopener noreferrer' : undefined} onClick=${onAct(lk)}>${body}</a>`;
    return html`<g ...${common} tabindex="0" role=${lk.more ? 'button' : 'img'} onClick=${onAct(lk)} onKeyDown=${keyAct(lk)}>${body}</g>`;
  };

  return html`<div class=${'rg-wrap rg-' + mode} ref=${wrap} onMouseLeave=${stat ? undefined : () => setHot(null)}>
    <svg class=${'rg' + (hotId ? ' has-hot' : '')} width=${L.W} height=${L.H} viewBox=${`0 0 ${L.W} ${L.H}`} role="group" aria-label=${summary} style=${{ '--rg-fs': D.fs + 'px', '--rg-small': D.small + 'px' }}>
      <g class="rg-edges" aria-hidden="true">
        ${L.edges.map((e) => html`<path class=${'rg-edge k-' + e.kind + (e.missing ? ' is-missing' : '') + (hotId === e.id ? ' is-hot' : '')} d=${e.d} style=${{ strokeWidth: strokeW(e.n), ...(e.color && e.kind === 'library' ? { '--rg-c': `var(--${e.color})` } : {}) }} />`)}
      </g>
      ${stat ? null : html`<g class="rg-edge-hits" aria-hidden="true">${L.edges.map((e) => {
        const node = e.side === 'in' ? L.left.find((x) => x.g.id === e.id) : L.right.find((x) => x.type === 'row' && x.r.id === e.id);
        if (!node) return null;
        const n = e.side === 'in' ? node.g : node.r;
        const info = { id: e.id, node: n, side: e.side, x: e.side === 'in' ? L.xL + 12 : L.xR - 12, y: node.y + (e.side === 'in' ? D.rowIn : node.h) + 2, y0: node.y };
        return html`<path class="rg-edge-hit" d=${e.d} onMouseEnter=${enter(info)} onMouseLeave=${leave(e.id)} />`;
      })}</g>`}
      <g class="rg-center" aria-hidden="true">
        <rect class="rg-center-box" x=${L.cx0} y=${L.cTop} width=${L.cw} height=${L.ch} />
        ${L.lines.map((s, i) => html`<text class=${'rg-center-t' + (i ? ' is-sub' : '')} x=${(L.cx0 + L.cx1) / 2} y=${L.cy + (i - (L.lines.length - 1) / 2) * D.fs * 1.4 + D.fs * 0.35} text-anchor="middle">${fit(s, L.cw - 14, D.fs, i ? 400 : 600)}</text>`)}
      </g>
      <g class="rg-in">
        ${L.left.map((x) => nodeLink({ node: x.g, side: 'in', x0: D.pad, x1: L.xL + D.r + 4, y0: x.y, h: D.rowIn, nx: L.xL, aria: ariaIn(x.g), children: html`
          <text class=${'rg-label' + (x.g.more ? ' is-more' : '')} x=${L.xL - D.r - 7} y=${x.ny + D.fs * 0.35} text-anchor="end">${x.label}</text>
          <${Shape} kind=${x.g.more ? 'more' : x.g.kind === 'library' ? 'library' : 'own'} x=${L.xL} y=${x.ny} r=${D.r} color=${x.g.kind === 'library' ? x.g.color : null} />` }))}
      </g>
      <g class="rg-out">
        ${L.right.map((x) => x.type === 'head'
          ? html`<g class="rg-head" aria-hidden="true">${x.g.kind === 'own' ? html`<circle class="rg-shape rg-own" cx=${L.xR} cy=${x.y + D.head / 2} r=${D.r} />` : x.g.kind !== 'foreign' ? html`<rect class="rg-head-sw" style=${{ '--rg-c': `var(--${x.g.color})` }} x=${L.xR - D.r} y=${x.y + D.head / 2 - 5} width="10" height="10" />` : html`<circle class="rg-shape rg-ext" cx=${L.xR} cy=${x.y + D.head / 2} r=${D.r - 0.5} />`}
              <text class="rg-head-t" x=${L.xR + D.r + 8} y=${x.y + D.head / 2 + D.fs * 0.35}>${x.label}</text></g>`
          : nodeLink({ node: x.r, side: 'out', x0: L.xR - D.r - 4, x1: L.W - D.pad, y0: x.y, h: x.h, nx: L.xR, aria: ariaOut(x.r), children: html`
              <${Shape} kind=${x.r.more ? 'more' : x.r.kind === 'own' ? 'own' : x.r.kind} x=${L.xR} y=${x.ny} r=${D.r} color=${x.g.color} missing=${x.r.missing} />
              <text class=${'rg-label' + (x.r.more ? ' is-more' : '')} x=${L.xR + D.r + 8} y=${x.ny + D.fs * 0.35}>${x.label}</text>` }))}
      </g>
      <g class="rg-counts" aria-hidden="true">
        ${L.left.map((x) => html`<text class="rg-count" x=${L.xL - D.r - 7} y=${x.ny + D.fs * 0.35 + D.small + 3} text-anchor="end">${x.count}</text>`)}
        ${L.right.filter((x) => x.type === 'row').map((x) => html`<text class="rg-count" x=${L.xR + D.r + 8 + textW(x.label, D.fs) + 6} y=${x.ny + D.fs * 0.35}>${x.count}</text>
          ${x.r.missing ? html`<text class="rg-count rg-missing-t" x=${L.xR + D.r + 8} y=${x.ny + D.fs * 0.35 + D.small + 4}>${t('refs.graph.missing')}</text>` : null}`)}
      </g>
    </svg>
    ${!stat && hot ? html`<div class="rg-tip" role="tooltip" id=${tipId} ref=${tipRef} style=${{ left: hot.x + 'px', top: hot.y + 'px' }}>${tipOf(hot)}</div>` : null}
  </div>`;
}

// ------------------------------------------------------------------ Zähler, Legende, Hinweise
function Counters({ model }) {
  const hits = (n) => t('refs.graph.hits', { n });
  return html`<div class="rg-counters">
    <p class="rg-counter"><span class="rg-counter-h">${t('refs.graph.inHead')}</span><span>${t('refs.graph.units', { n: model.incoming.units })} · ${hits(model.incoming.refs)}</span></p>
    <p class="rg-counter is-right"><span class="rg-counter-h">${t('refs.graph.outHead')}</span><span>${t('refs.graph.targets', { n: model.outgoing.targets })} · ${hits(model.outgoing.refs)}</span></p>
  </div>`;
}
const LegendSw = ({ kind, color, missing }) => html`<svg class="rg-lg-sw" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
  ${kind === 'library' ? html`<rect class=${'rg-shape rg-sq' + (missing ? ' is-missing' : '')} style=${color ? { '--rg-c': `var(--${color})` } : undefined} x="2" y="2" width="10" height="10" />`
    : kind === 'foreign' ? html`<circle class="rg-shape rg-ext" cx="7" cy="7" r="4.5" />`
    : kind === 'width' ? html`<path class="rg-lg-line" d="M1,10 L13,10" style=${{ strokeWidth: 1 }} /><path class="rg-lg-line" d="M1,5 L13,5" style=${{ strokeWidth: 4 }} />`
    : html`<circle class="rg-shape rg-own" cx="7" cy="7" r="5" />`}</svg>`;
function Legend({ model, data }) {
  const libs = [...new Set([...model.outgoing.groups.filter((g) => g.kind === 'library').map((g) => g.color), ...model.incoming.groups.filter((g) => g.kind === 'library').map((g) => g.color)])];
  const anyExt = model.outgoing.groups.some((g) => g.kind === 'foreign');
  const anyMissing = model.outgoing.groups.some((g) => g.rows.some((r) => r.missing));
  return html`<ul class="rg-legend">
    <li><${LegendSw} kind="own" />${t('refs.graph.legendOwn', { abbr: (data.abbr && data.abbr[uiLang()]) || '' })}</li>
    ${libs.length ? html`<li><span class="rg-lg-multi">${libs.map((c) => html`<${LegendSw} kind="library" color=${c} />`)}</span>${t('refs.graph.legendLib')}</li>` : null}
    ${anyExt ? html`<li><${LegendSw} kind="foreign" />${t('refs.graph.legendExt')}</li>` : null}
    ${anyMissing ? html`<li><${LegendSw} kind="library" color="act-vis" missing />${t('refs.graph.legendMissing')}</li>` : null}
    <li><${LegendSw} kind="width" />${t('refs.graph.legendWidth')}</li>
  </ul>`;
}
function Notes({ model, interactive = true }) {
  const unit = model.center.unit;
  return html`<div class="rg-notes">
    ${model.uncertainCount ? html`<p class="rg-note">${t('refs.graph.uncertain', { n: model.uncertainCount })}</p>` : null}
    ${model.selfCount ? html`<p class="rg-note">${t('refs.graph.self', { n: model.selfCount, unit })}</p>` : null}
    ${interactive ? html`<p class="rg-note">${t('refs.graph.hint')}</p>` : null}
  </div>`;
}

const wholeLabel = (type) => t(type === 'annex' ? 'refs.graph.wholeAnnex' : type === 'article' ? 'refs.graph.wholeArticle' : 'refs.graph.wholeUnit');

/** Netz mit Zählern, Legende und Hinweisen (Schublade oder Dialog) */
function RefsNet({ data, unitId, k, lang, stageId, route, scope, mode, navigate, onMore }) {
  const model = useEgoGraph(data, lang, stageId, unitId, k, scope, mode);
  if (model.empty) return html`<p class="muted small">${t('refs.none')}</p>`;
  const scopeNote = k && model.center.scope === 'unit' ? wholeLabel(model.center.unitType) : '';
  return html`<div class=${'rg-net rg-net-' + mode}>
    <${Counters} model=${model} />
    <${RefsGraph} model=${model} mode=${mode} data=${data} lang=${lang} stageId=${stageId} route=${route} navigate=${navigate} onMore=${onMore} scopeNote=${scopeNote} />
    <${Legend} model=${model} data=${data} />
    <${Notes} model=${model} />
  </div>`;
}

function ScopeSeg({ data, unitId, k, scope, setScope, id }) {
  if (!k) return null;
  const c = egoCenterLabel(data, unitId, k);
  return html`<${Seg} size="sm" label=${t('refs.graph.scope')} value=${scope} onChange=${setScope} options=${[
    { value: 'provision', label: c.rest || c.full, title: c.full },
    { value: 'unit', label: wholeLabel(data.unitMeta(unitId).type) },
  ]} />`;
}
function egoCenterLabel(data, unitId, k) {
  const c = centerLabel(data, unitId, k, uiLang());
  return { rest: c.rest, full: c.label };
}

// ------------------------------------------------------------------ Dialog
/** Exportkarte: berechnete Stile der SVG-Elemente als Attribute festschreiben (html-to-image übernimmt Klassenstile in SVG nicht). */
export function InlineSvgStyles({ children }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'font-size', 'font-weight', 'font-family', 'letter-spacing'];
    for (const el of ref.current ? ref.current.querySelectorAll('svg *') : []) {
      const cs = getComputedStyle(el);
      for (const pr of PROPS) { const v = cs.getPropertyValue(pr); if (v) el.setAttribute(pr, v); }
    }
  });
  return html`<div ref=${ref}>${children}</div>`;
}
function exportNetPng({ data, unitId, k, lang, stageId, route, scope }) {
  return async () => {
    try {
      const ui = uiLang();
      const model = egoGraph(data, lang, stageId, unitId, k, { scope, ui, lib: libFor(data, stageId) });
      const W = 1040;
      const scopeNote = k && model.center.scope === 'unit' ? wholeLabel(model.center.unitType) : '';
      const title = t('refs.graph.dialogTitle', { cite: model.center.label }) + (scopeNote ? ' (' + scopeNote + ')' : '');
      const draw = () => html`<article class="card card-a4 rg-card" lang=${ui} style=${{ width: W + 96 + 'px', '--fs': '16px' }}>
        <header class="card-head cbrk">
          <div class="card-brand"><span><b>SGK</b> Navigator</span><span>${data.stageLabel(stageId, { short: true })}, ${lang.toUpperCase()}</span></div>
          <h1 class="card-title">${title}</h1>
        </header>
        <div class="card-body"><${InlineSvgStyles}><div class="rg-net rg-net-dialog">
          <${Counters} model=${model} />
          <${RefsGraph} model=${model} mode="dialog" width=${W} data=${data} lang=${lang} stageId=${stageId} route=${route} scopeNote=${scopeNote} static />
          <${Legend} model=${model} data=${data} />
          <${Notes} model=${model} interactive=${false} />
        </div></${InlineSvgStyles}></div>
        <footer class="card-foot cbrk"><p class="card-source">${t('refs.graph.cardSource', { stage: data.stageLabel(stageId), lang: lang.toUpperCase(), date: fmtDate(todayIso()) })}</p></footer>
      </article>`;
      const safe = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const name = `${t('refs.graph.exportName')}_${safe(model.center.label)}${scopeNote ? '_' + safe(scopeNote) : ''}_${stageId}_${lang.toUpperCase()}`;
      const ex = await import('../export.js');
      await ex.exportCustom({ draw, format: 'a4', name, title, ui }, 'png');
      toast(t('export.done', { kind: 'PNG' }), 'success', 3000);
    } catch (e) { console.error(e); toast(t('export.failed', { msg: e.message || String(e) }), 'error'); }
  };
}

export function RefsGraphDialog({ data, unitId, k, lang, stageId, route, scope, setScope, onClose }) {
  const [busy, setBusy] = useState(false);
  const cite = k && scope === 'provision' ? egoCenterLabel(data, unitId, k).full : egoCenterLabel(data, unitId, null).full;
  // Klick auf einen Knoten: Dialog schliessen, dann navigieren (Hash ändert sich erst mit der Navigation)
  const navigate = (fn) => { onClose(); setTimeout(fn, 0); };
  const png = exportNetPng({ data, unitId, k, lang, stageId, route, scope });
  return html`<${Portal}><${Modal} id="rgdlg" className="modal-graph" lockScroll
      title=${t('refs.graph.dialogTitle', { cite })} sub=${t('refs.graph.sub', { stage: data.stageLabel(stageId), lang: lang.toUpperCase() })}
      closeLabel=${t('refs.graph.close')} onClose=${onClose}>
    <div class="rg-dlg-tools">
      <${ScopeSeg} data=${data} unitId=${unitId} k=${k} scope=${scope} setScope=${setScope} />
      <span class="spacer"></span>
      <button type="button" class="btn btn-tertiary btn-sm" id="rg-png" disabled=${busy} onClick=${async () => { setBusy(true); await png(); setBusy(false); }}><${Icon} name="download" />${t('refs.graph.exportPng')}</button>
    </div>
    <${RefsNet} data=${data} unitId=${unitId} k=${k} lang=${lang} stageId=${stageId} route=${route} scope=${scope} mode="dialog" navigate=${navigate} />
  </${Modal}></${Portal}>`;
}

// ------------------------------------------------------------------ Bereich «Verweise» mit Umschalter Liste | Netz
/** Ersetzt in der Schublade den Bereich «Verweise»: Liste (wie bisher) oder Netz, Umfang, Vergrössern. */
export function RefsSection({ data, unitId, k, lang, stageId, route }) {
  const st = settingsStore.use();
  const view = st.refsView === 'net' ? 'net' : 'list';
  const [scope, setScope] = useState('provision');
  const [open, setOpen] = useState(false);
  const expandRef = useRef();
  const setView = (v) => { settingsStore.set({ ...settingsStore.get(), refsView: v }); persistSettings(); };
  const close = () => { setOpen(false); };
  const head = html`<div class="refs-tools">
    <${Seg} size="sm" label=${t('refs.graph.view')} value=${view} onChange=${setView} options=${[{ value: 'list', label: t('refs.graph.list') }, { value: 'net', label: t('refs.graph.net') }]} />
    ${view === 'net' ? html`<${ScopeSeg} data=${data} unitId=${unitId} k=${k} scope=${scope} setScope=${setScope} />` : null}
    ${view === 'net' ? html`<button type="button" class="btn btn-ghost btn-sm rg-expand" id="rg-expand" ref=${expandRef} title=${t('refs.graph.expandTip')} onClick=${() => setOpen(true)}><${Icon} name="maximize" />${t('refs.graph.expand')}</button>` : null}
  </div>`;
  const alt = view === 'net'
    ? html`<${RefsNet} data=${data} unitId=${unitId} k=${k} lang=${lang} stageId=${stageId} route=${route} scope=${scope} mode="drawer" onMore=${() => setOpen(true)} />`
    : null;
  return html`<${RefsPanel} data=${data} unitId=${unitId} k=${k} lang=${lang} stageId=${stageId} route=${route} head=${head} alt=${alt} />
    ${open ? html`<${RefsGraphDialog} data=${data} unitId=${unitId} k=${k} lang=${lang} stageId=${stageId} route=${route} scope=${scope} setScope=${setScope} onClose=${close} />` : null}`;
}
