// Synopse: Zeilen × Spuren mit Fassungswahl je Spur, Diff-Modi, Status, CH-Position, Filtern und Gliederung.
// Seitenweises Rendern: zuerst 60 Zeilen, weitere beim Scrollen (IntersectionObserver); Sprünge erweitern den Bereich.
import { html } from 'htm/preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { t, uiLang, has } from '../../lib/i18n.js';
import { go } from '../../state.js';
import { Icon, HelpLink } from '../../ui/common.js';
import { fmtDate, fmtDateShort } from '../../lib/format.js';
import { sortedRows, docsOfTrack, docMap, hasPosition, groupLabel, subgroupLabel, STANCES, PRIORITIES, STATUSES, docsByDate } from './core.js';
import { useDossier, NoDossier, trackName, trackColor, Popover, StatusBadge, StanceTag, PriorityTag, docLabel, docShort, RowId } from './ui.js';
import { filtersOf, filterRows, outline, cellView, staleSet, statusOf, activeFilterCount } from './rows.js';
import { RowDetail } from './detail.js';

const STEP = 60;
const csv = (s) => (s ? String(s).split(',').filter(Boolean) : []);
export function docsChoice(route) {
  const out = {};
  for (const p of csv(route.nv)) { const [k, v] = p.split(':'); if (k && v) out[k] = v; }
  return out;
}
const encDocs = (o) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}:${v}`).join(',') || null;

export function SynopsisView({ route }) {
  const d = useDossier(route);
  if (!d) return html`<${NoDossier} route=${route} />`;
  if (!d.documents.length) return html`<${EmptyDossier} d=${d} />`;
  return html`<${Synopsis} d=${d} route=${route} />`;
}

function EmptyDossier({ d }) {
  return html`<div class="view"><main class="wide narrow" id="main" tabindex="-1"><div class="neg-empty">
    <p class="unit-label">${d.short || d.title}</p>
    <h1 class="neg-empty-title">${t('neg.syn.emptyTitle')}</h1>
    <p>${t('neg.syn.emptyText')}</p>
    <div class="neg-actions">
      <a class="btn btn-primary" href="#/import" onClick=${(e) => { e.preventDefault(); go({ view: 'import' }); }}><${Icon} name="upload" />${t('neg.syn.importFirst')}</a>
      <a class="btn btn-tertiary" href="#/import" onClick=${(e) => { e.preventDefault(); go({ view: 'import', nkt: 'manual' }); }}><${Icon} name="edit" />${t('neg.imp.manualDoc')}</a>
    </div>
  </div></main></div>`;
}

function Synopsis({ d, route }) {
  const hidden = new Set(csv(route.nh));
  const tracks = d.tracks.filter((x) => Object.values(d.cells).some((c) => c[x.id]) || d.documents.some((doc) => (doc.tracks || []).includes(x.id)));
  const shown = tracks.filter((x) => !hidden.has(x.id));
  const docs = docsChoice(route);
  const mode = route.nd || 'none';
  const showPos = route.np !== '0';
  const f = filtersOf(route);
  const all = useMemo(() => sortedRows(d), [d]);
  const vis = useMemo(() => filterRows(d, all, f), [d, all, route.nq, route.nfc, route.nfs, route.nfp, route.nfh, route.nfr, route.nfo]);
  const groups = useMemo(() => outline(all, vis), [all, vis]);
  const [limit, setLimit] = useState(STEP);
  // Ab 1312 px steht die Gliederung als Spalte links; darunter ist sie beim Öffnen der Ansicht geschlossen
  // und liegt offen als Overlay über der Tabelle (schliesst bei Wahl eines Eintrags und mit Escape).
  const [narrow, setNarrow] = useState(narrowNav);
  const [navOpen, setNavOpen] = useState(() => !narrowNav());
  useEffect(() => {
    const mq = window.matchMedia(NARROW_NAV);
    const on = () => { setNarrow(mq.matches); setNavOpen(!mq.matches); };
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const navRef = useRef();
  const closeNav = (focusBtn) => { setNavOpen(false); if (focusBtn) requestAnimationFrame(() => { const b = document.getElementById('syn-outline-btn'); if (b) b.focus(); }); };
  // Fokus und Listener im selben Durchlauf wie das Overlay (useLayoutEffect): useEffect liefe erst nach dem Zeichnen, und
  // bis dahin stünde das Overlay ohne Fokus und ohne Escape und Klick daneben da.
  useLayoutEffect(() => {
    if (!navOpen || !narrow) return undefined;
    const first = navRef.current && navRef.current.querySelector('.syn-g:not(:disabled), button');
    if (first) first.focus();
    const onKey = (e) => { if (e.key === 'Escape' && narrowNav()) { e.preventDefault(); e.stopImmediatePropagation(); closeNav(true); } };
    const onDown = (e) => { if (narrowNav() && navRef.current && !navRef.current.contains(e.target) && !e.target.closest('#syn-outline-btn')) setNavOpen(false); };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    return () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onDown, true); };
  }, [navOpen, narrow]);
  const pick = (id) => { if (narrowNav()) setNavOpen(false); jump(id); };
  const [filtersOpen, setFiltersOpen] = useState(false);
  const scroller = useRef();
  const sentinel = useRef();
  const pendingJump = useRef(null);
  useEffect(() => { setLimit(STEP); }, [vis]);
  // Breite des sichtbaren Bereichs für die mitlaufende Steuerleiste (Tabelle kann breiter sein und horizontal scrollen)
  useEffect(() => {
    const sc = scroller.current;
    if (!sc || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => sc.style.setProperty('--syn-vw', sc.clientWidth + 'px'));
    ro.observe(sc);
    return () => ro.disconnect();
  }, []);
  // Weitere Zeilen beim Scrollen
  useEffect(() => {
    if (!sentinel.current || !scroller.current) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setLimit((l) => Math.min(vis.length, l + STEP)); }, { root: scroller.current, rootMargin: '1200px 0px' });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [vis, limit]);
  // Sprung zu einer Zeile (Gliederung, Detail)
  const jump = (rowId) => {
    const i = vis.findIndex((r) => r.id === rowId);
    if (i < 0) return;
    if (i >= limit) setLimit(Math.min(vis.length, i + STEP));
    pendingJump.current = rowId;
    requestAnimationFrame(() => requestAnimationFrame(doJump));
  };
  const doJump = () => {
    const id = pendingJump.current;
    if (!id) return;
    const el = document.getElementById('syn-' + id);
    const sc = scroller.current; if (el && sc) { pendingJump.current = null; const head = sc.querySelector('.syn-headrow'); sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - (head ? head.offsetHeight : 0) - 4; }
  };
  useEffect(doJump);
  // Geöffnete Zeile in den sichtbaren Bereich holen (Deep Link, Blättern im Detail)
  useEffect(() => {
    if (!route.r) return;
    const el = document.getElementById('syn-' + route.r);
    const sc = scroller.current;
    if (el && sc) { const r = el.getBoundingClientRect(), s = sc.getBoundingClientRect(); if (r.top >= s.top + 60 && r.top < s.bottom - 80) return; }
    jump(route.r);
  }, [route.r]);

  const opt = { markup: route.nm !== '0', mode, docs, a: route.na || (tracks[0] && tracks[0].id), b: route.nb || (tracks[tracks.length - 1] && tracks[tracks.length - 1].id) };
  // Bei vier und mehr Spuren schmalere Mindestbreite, damit die Synopse bei 1440 px ohne horizontales Scrollen Platz hat.
  const colMin = shown.length >= 4 ? 196 : 240;
  const cols = `minmax(140px, 168px) repeat(${shown.length}, minmax(${colMin}px, 1fr))${showPos ? ' minmax(176px, 210px)' : ''}`;
  const minW = 150 + shown.length * colMin + (showPos ? 176 : 0);
  const set = (patch) => go(patch, { replace: true });
  const toggleTrack = (id) => { const h = new Set(hidden); if (h.has(id)) h.delete(id); else if (shown.length > 1) h.add(id); set({ nh: [...h].join(',') || null }); };
  const stale = staleSet(d);
  const nf = activeFilterCount(f);
  const docsAll = docsByDate(d);
  const dm = docMap(d);
  const chips = [];
  if (f.q) chips.push({ label: `${t('neg.syn.search')}: ${f.q}`, clear: { nq: null } });
  if (f.since && dm.get(f.since)) chips.push({ label: `${t('neg.syn.since')} ${docShort(dm.get(f.since))}`, clear: { nfc: null } });
  if (f.status.length) chips.push({ label: `${t('neg.syn.status')}: ${f.status.map((x) => t('neg.status.' + x)).join(', ')}`, clear: { nfs: null } });
  if (f.pos) chips.push({ label: f.pos === 'with' ? t('neg.syn.posWith') : t('neg.syn.posWithout'), clear: { nfp: null } });
  if (f.stale) chips.push({ label: t('neg.syn.posStale'), clear: { nfo: null } });
  if (f.stance.length) chips.push({ label: `${t('neg.pos.stance')}: ${f.stance.map((x) => t('neg.stance.' + x)).join(', ')}`, clear: { nfh: null } });
  if (f.prio.length) chips.push({ label: `${t('neg.pos.priority')}: ${f.prio.map((x) => t('neg.priority.' + x)).join(', ')}`, clear: { nfr: null } });

  return html`<div class=${'view-syn' + (navOpen ? ' has-nav' : '') + (navOpen && narrow ? ' is-overlay' : '')}>
    ${navOpen ? html`<nav class="syn-nav" id="syn-nav" ref=${navRef} aria-label=${t('neg.syn.outline')}>
      <div class="syn-nav-head"><h2 class="syn-nav-title">${t('neg.syn.outline')}</h2><button type="button" class="btn-icon is-bare" aria-label=${t('neg.syn.outlineHide')} title=${t('neg.syn.outlineHide')} onClick=${() => closeNav(true)}><${Icon} name="chevron-left" /></button></div>
      <ul class="syn-groups">${groups.map((g) => html`<li>
        <button type="button" class="syn-g" disabled=${!g.shown} onClick=${() => pick(g.first)}><span class="syn-g-l">${groupLabel(g.id, t)}</span><span class="syn-g-n" aria-label=${t('neg.syn.countOf', { n: g.shown, total: g.total })} title=${t('neg.syn.countOf', { n: g.shown, total: g.total })}>${g.shown === g.total ? g.total : `${g.shown}/${g.total}`}</span></button>
        ${g.subs.length ? html`<ul>${g.subs.map((s) => html`<li><button type="button" class="syn-g syn-sub" disabled=${!s.shown} onClick=${() => pick(s.first)}><span class="syn-g-l">${subgroupLabel(s.id, t)}</span><span class="syn-g-n">${s.shown === s.total ? s.total : `${s.shown}/${s.total}`}</span></button></li>`)}</ul>` : null}
      </li>`)}</ul>
    </nav>` : null}
    <div class="syn-main view" ref=${scroller} id="syn-scroll">
      <main id="main" tabindex="-1" style=${{ minWidth: `calc(${minW}px + 2 * var(--page-x))` }}>
      <h1 class="sr">${t('neg.nav.synopse')}: ${d.short || d.title}</h1>
      <div class="syn-tools">
        <div class="syn-bar" role="toolbar" aria-label=${t('neg.syn.toolbar')}>
          ${!navOpen || narrow ? html`<button type="button" class="btn btn-tertiary btn-sm syn-outline-btn" id="syn-outline-btn" aria-expanded=${navOpen ? 'true' : 'false'} aria-controls="syn-nav" onClick=${() => setNavOpen(!navOpen)}><${Icon} name="view-list" />${t('neg.syn.outline')}</button>` : null}
          <div class="tool-group"><span class="tool-label" id="lbl-trk">${t('neg.syn.tracks')}</span>
            <div class="trk-toggles" role="group" aria-labelledby="lbl-trk">${tracks.map((x) => html`<button type="button" class="trk-btn" aria-pressed=${hidden.has(x.id) ? 'false' : 'true'} style=${{ '--trk': trackColor(d, x.id) }} onClick=${() => toggleTrack(x.id)} title=${(hidden.has(x.id) ? t('neg.syn.showTrack') : t('neg.syn.hideTrack')) + ': ' + trackLabelText(d, x.id)}><span class="trk-check" aria-hidden="true">${hidden.has(x.id) ? '' : '✓'}</span>${trackShort(d, x.id)}</button>`)}</div>
          </div>
          <label class="tool-group"><span class="tool-label">${t('neg.syn.diff')}</span>
            <select id="syn-diff" value=${mode} onChange=${(e) => set({ nd: e.target.value })}>
              ${['none', 'com', 'prev', 'tracks'].map((m) => html`<option value=${m}>${t('neg.syn.diffMode.' + m)}</option>`)}
            </select></label>
          ${mode === 'tracks' ? html`<span class="tool-group"><select id="syn-da" aria-label=${t('neg.syn.diffFrom')} title=${t('neg.syn.diffFrom')} value=${opt.a} onChange=${(e) => set({ na: e.target.value })}>${tracks.map((x) => html`<option value=${x.id}>${trackShort(d, x.id)}</option>`)}</select>
            <span aria-hidden="true">→</span>
            <select id="syn-db" aria-label=${t('neg.syn.diffTo')} title=${t('neg.syn.diffTo')} value=${opt.b} onChange=${(e) => set({ nb: e.target.value })}>${tracks.map((x) => html`<option value=${x.id}>${trackShort(d, x.id)}</option>`)}</select></span>` : null}
          <span class="toc-search syn-q" role="search"><${Icon} name="search" /><input type="search" id="syn-q" aria-label=${t('neg.syn.search')} placeholder=${t('neg.syn.searchPh')} value=${route.nq || ''} onInput=${(e) => set({ nq: e.target.value || null })} /></span>
          <button type="button" class=${'btn btn-sm btn-tertiary'} id="syn-filter-btn" aria-expanded=${filtersOpen ? 'true' : 'false'} aria-controls="syn-filters" onClick=${() => setFiltersOpen(!filtersOpen)}><${Icon} name="filter" />${t('neg.syn.filter')}${nf ? html`<span class="badge">${nf}</span>` : null}<${Icon} name=${filtersOpen ? 'chevron-up' : 'chevron-down'} /></button>
          <span class="spacer"></span>
          <span class="syn-end">
          <${Popover} label=${t('neg.syn.view')} icon="columns" id="syn-view">
            <label class="check"><input type="checkbox" id="syn-markup" checked=${opt.markup} onChange=${(e) => set({ nm: e.target.checked ? null : '0' })} />${t('neg.syn.markup')}</label>
            <label class="check"><input type="checkbox" id="syn-pos" checked=${showPos} onChange=${(e) => set({ np: e.target.checked ? null : '0' })} />${t('neg.syn.posColumn')}</label>
          </${Popover}>
          ${d.rows.some((r) => r.amends) ? html`<button type="button" class="btn-icon" id="syn-impact" title=${t('neg.pv.overTip')} aria-label=${t('neg.pv.overTip')} onClick=${() => go({ view: 'wirkung', r: null })}><${Icon} name="layers" /></button>` : null}
          <button type="button" class="btn-icon" title=${t('neg.syn.print')} aria-label=${t('neg.syn.print')} onClick=${() => go({ view: 'druck', pv: 'synopse' })}><${Icon} name="print" /></button>
          <${HelpLink} view="n-anleitung" sec="synopse" />
          </span>
        </div>
        ${filtersOpen ? html`<div class="syn-filters" id="syn-filters" role="group" aria-label=${t('neg.syn.filter')}>
          <label class="field"><span class="field-label">${t('neg.syn.since')}</span>
            <select id="syn-since" value=${route.nfc || ''} onChange=${(e) => set({ nfc: e.target.value || null })}><option value="">${t('neg.syn.sinceAny')}</option>${docsAll.slice(0, -1).map((x) => html`<option value=${x.id}>${docShort(x)}${x.date ? ', ' + fmtDateShort(x.date) : ''}</option>`)}</select></label>
          <label class="field"><span class="field-label">${t('neg.syn.status')}</span>
            <select id="syn-status" value=${f.status[0] || ''} onChange=${(e) => set({ nfs: e.target.value || null })}><option value="">${t('neg.syn.all')}</option>${[...STATUSES, 'none'].map((x) => html`<option value=${x}>${t('neg.status.' + x)}</option>`)}</select></label>
          <label class="field"><span class="field-label">${t('neg.syn.posFilter')}</span>
            <select id="syn-fpos" value=${f.stale ? 'stale' : f.pos || ''} onChange=${(e) => { const v = e.target.value; set({ nfp: v === 'with' || v === 'without' ? v : null, nfo: v === 'stale' ? '1' : null }); }}>
              <option value="">${t('neg.syn.all')}</option><option value="with">${t('neg.syn.posWith')}</option><option value="without">${t('neg.syn.posWithout')}</option><option value="stale">${t('neg.syn.posStale')}</option></select></label>
          <label class="field"><span class="field-label">${t('neg.pos.stance')}</span>
            <select id="syn-stance" value=${f.stance[0] || ''} onChange=${(e) => set({ nfh: e.target.value || null })}><option value="">${t('neg.syn.all')}</option>${STANCES.map((x) => html`<option value=${x}>${t('neg.stance.' + x)}</option>`)}</select></label>
          <label class="field"><span class="field-label">${t('neg.pos.priority')}</span>
            <select id="syn-prio" value=${f.prio[0] || ''} onChange=${(e) => set({ nfr: e.target.value || null })}><option value="">${t('neg.syn.all')}</option>${PRIORITIES.map((x) => html`<option value=${x}>${t('neg.priority.' + x)}</option>`)}</select></label>
        </div>` : null}
        <div class="syn-status">
          <span class="syn-count-n" role="status">${nf ? t('neg.syn.countFiltered', { n: vis.length, total: all.length }) : t('neg.syn.count', { n: all.length })}</span>
          ${chips.length ? html`<ul class="syn-chips" aria-label=${t('neg.syn.activeFilters')}>${chips.map((c) => html`<li><button type="button" class="fchip" onClick=${() => set(c.clear)} title=${t('neg.syn.removeFilter', { f: c.label })} aria-label=${t('neg.syn.removeFilter', { f: c.label })}>${c.label}<${Icon} name="close" /></button></li>`)}
            ${chips.length > 1 ? html`<li><button type="button" class="link syn-reset" onClick=${() => set({ nq: null, nfc: null, nfs: null, nfp: null, nfh: null, nfr: null, nfo: null })}>${t('neg.syn.reset')}</button></li>` : null}</ul>` : null}
          <span class="spacer"></span>
          ${mode !== 'none' ? html`<span class="syn-legend"><span class="syn-legend-l">${t('neg.legend.diff')}</span> <span class="legal"><ins>${t('neg.legend.ins')}</ins> <del>${t('neg.legend.del')}</del></span></span>` : null}
          ${opt.markup ? html`<span class="syn-legend ncell" title=${t('neg.legend.srcNote')}><span class="syn-legend-l">${t('neg.legend.source')}</span> <b>${t('neg.legend.srcBold')}</b> <s>${t('neg.legend.srcStruck')}</s></span>` : null}
        </div>
      </div>
      <div class="syn-table" role="table" aria-label=${t('neg.syn.tableLabel')} aria-rowcount=${vis.length + 1} style=${{ '--syn-cols': cols }}>
        <div class="syn-row syn-headrow" role="row">
          <div class="syn-k" role="columnheader">${t('neg.syn.colRow')}</div>
          ${shown.map((x) => html`<div class="syn-c syn-hc" role="columnheader" style=${{ '--trk': trackColor(d, x.id) }}>
            <span class="syn-hc-name">${trackLabelText(d, x.id)}${mode === 'tracks' && x.id === opt.b && opt.a !== opt.b ? html` <span class="syn-hc-diff">${t('neg.syn.diffAgainst', { track: trackLabelText(d, opt.a) })}</span>` : null}</span>
            <span class="syn-hc-doc">${docs[x.id] && dm.get(docs[x.id]) ? html`${docShort(dm.get(docs[x.id]))}${dm.get(docs[x.id]).date ? ', ' + fmtDateShort(dm.get(docs[x.id]).date) : ''}` : t('neg.syn.latestShort')}</span>
            ${docsOfTrack(d, x.id).length > 1 ? html`<select class="syn-docsel" aria-label=${t('neg.syn.docFor', { track: trackLabelText(d, x.id) })} title=${t('neg.syn.docFor', { track: trackLabelText(d, x.id) })} value="" onChange=${(e) => { const v = e.target.value; e.target.value = ''; if (v) set({ nv: encDocs({ ...docs, [x.id]: v === '_latest' ? null : v }) }); }}>
              <option value="">${t('neg.syn.choose')}</option>
              <option value="_latest">${t('neg.syn.latest')}</option>
              ${docsOfTrack(d, x.id).map((doc) => html`<option value=${doc.id}>${docShort(doc)}${doc.date ? ', ' + fmtDateShort(doc.date) : ''}</option>`)}
            </select>` : null}
          </div>`)}
          ${showPos ? html`<div class="syn-c syn-hc syn-hpos" role="columnheader"><span class="syn-hc-name">${t('neg.syn.colPos')}</span></div>` : null}
        </div>
        ${vis.length === 0 ? html`<div class="syn-none"><p class="empty-title">${t('neg.syn.noneTitle')}</p><p>${t('neg.syn.noneText')}</p></div>` : null}
        ${vis.slice(0, limit).map((r) => html`<${SynRow} key=${r.id} d=${d} r=${r} shown=${shown} opt=${opt} showPos=${showPos} active=${route.r === r.id} stale=${stale.has(r.id)} dm=${dm} />`)}
        ${limit < vis.length ? html`<div class="syn-more" ref=${sentinel}><button type="button" class="btn btn-tertiary" onClick=${() => setLimit((l) => Math.min(vis.length, l + STEP * 4))}>${t('neg.syn.more', { n: vis.length - limit })}</button></div>` : null}
      </div>
      </main>
    </div>
    ${route.r ? html`<${RowDetail} d=${d} route=${route} rows=${vis.some((x) => x.id === route.r) ? vis : all} />` : null}
  </div>`;
}

export const trackLabelText = trackName;
/** Unter 1312 px liegt die Gliederung als Overlay (siehe styles.css, Breakpoint 1311). */
const NARROW_NAV = '(max-width: 1311px)';
const narrowNav = () => typeof window !== 'undefined' && window.matchMedia(NARROW_NAV).matches;
/** Kurzname der Spur für enge Stellen (Steuerleiste); voller Name im Tooltip und im Tabellenkopf. */
export const trackShort = (d, id) => (has('neg.trackShort.' + id) ? t('neg.trackShort.' + id) : trackName(d, id));

function SynRow({ d, r, shown, opt, showPos, active, stale }) {
  const p = d.positions[r.id];
  const st = statusOf(d, r.id);
  const open = () => go({ r: r.id });
  return html`<div class=${'syn-row' + (active ? ' is-active' : '') + (st ? ' st-' + st : '')} role="row" id=${'syn-' + r.id} onClick=${(e) => { if (!e.target.closest('a, button, select') && !window.getSelection().toString()) open(); }}>
    <div class="syn-k" role="rowheader">
      <button type="button" class="syn-open" onClick=${open} title=${t('neg.syn.openRow')}>
        ${r.num ? html`<span class="syn-num">${r.num}</span>` : null}<span class="syn-label">${r.label || t('neg.syn.noLabel')}</span>
      </button>
      <div class="syn-meta"><${StatusBadge} status=${st} />${stale ? html`<span class="nstale" title=${t('neg.pos.staleTip')}><${Icon} name="warning" />${t('neg.pos.staleShort')}</span>` : null}${r.manual ? html`<span class="tag tag-src">${t('neg.syn.manual')}</span>` : null}</div>
    </div>
    ${shown.map((x) => { const v = cellView(d, r.id, x.id, opt); return html`<div class=${'syn-c' + (v.diff ? ' is-diff' : '')} role="cell">
      ${v.cell && !v.cell.empty ? html`<div class="ncell legal" lang="en" dangerouslySetInnerHTML=${{ __html: v.html }}></div>` : html`<span class="syn-nocell">${v.note === 'empty' ? t('neg.syn.cellEmpty') : '—'}</span>`}
      ${v.note === 'nobase' ? html`<span class="syn-note">${t('neg.syn.noteNoBase')}</span>` : v.note === 'first' && opt.mode === 'prev' ? html`<span class="syn-note">${t('neg.syn.noteFirst')}</span>` : null}
      ${v.cell && v.cell.status && v.cell.status !== st ? html`<${StatusBadge} status=${v.cell.status} compact />` : null}
    </div>`; })}
    ${showPos ? html`<div class="syn-c syn-pos" role="cell">${p && hasPosition(p) ? html`<div class="syn-pos-tags"><${StanceTag} stance=${p.stance} /><${PriorityTag} priority=${p.priority} /></div>${p.text ? html`<p class="syn-pos-text uc" title=${p.text}>${p.text}</p>` : null}` : html`<span class="syn-nocell">${t('neg.syn.noPos')}</span>`}</div>` : null}
  </div>`;
}
