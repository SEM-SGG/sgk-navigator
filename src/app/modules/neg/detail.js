// Zeile im Detail (Seitenpanel über der Synopse): CH-Position, Chronologie je Spur, Vergleich zweier Zellen,
// Rückmeldungen der Stellen, manuelle Korrektur (Rückfallweg, wenn ein Parser scheitert).
import { html } from 'htm/preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { t } from '../../lib/i18n.js';
import { go } from '../../state.js';
import { Icon, Seg, HelpLink } from '../../ui/common.js';
import { escapeHtml } from '../../lib/format.js';
import {
  STANCES, PRIORITIES, STATUSES, docMap, docsByDate, rowHistory, compareCells, cellFor, setPosition, refreshBasis, hasPosition,
  visibleRowId, htmlToText, setCell, updateRow, addRow, mergeRows, splitRow, moveRow, deleteRow, sortedRows,
} from './core.js';
import { mutate } from './store.js';
import { StatusBadge, StanceTag, PriorityTag, DecisionTag, trackName, trackColor, docLabel, fmtDateTime, confirmDialog, Modal, Notice } from './ui.js';
import { staleSet, statusOf } from './rows.js';
import { CardMenu, chronCard, compareCard } from './card.js';
import { chronModel, compareModel, rowModel } from './cardmodel.js';
import { createStore } from '../../state.js';
import { RowDelegations } from './deleg.js';
import { RowImpact } from './impact.js';
import { ensureBy, ByTag } from './by.js';

const latestCellOf = (d, r, tr) => cellFor(d, r, tr, null);
const TABS = ['position', 'chron', 'compare', 'feedback', 'deleg', 'impact', 'edit'];
/** Reiter, mit dem das Zeilendetail beim nächsten Öffnen beginnt (z. B. aus der Matrix der Delegationen). */
export const detailTabStore = createStore('position');
/** Zeile in der Synopse öffnen, optional mit Reiter. */
export function openRow(rowId, tab) {
  if (tab) detailTabStore.set(tab);
  go({ view: 'synopse', r: rowId, nkt: null, po: null });
}

export function RowDetail({ d, route, rows }) {
  const row = d.rows.find((r) => r.id === route.r);
  const want = detailTabStore.use();
  const [tab, setTabState] = useState(want || 'position');
  const setTab = (x) => { setTabState(x); detailTabStore.set(x); };
  useEffect(() => { if (want && want !== tab) setTabState(want); }, [want]);
  useEffect(() => () => detailTabStore.set('position'), []);
  const ref = useRef();
  useEffect(() => { if (ref.current) { const b = ref.current.querySelector('.panel-body'); if (b) b.scrollTop = 0; } }, [route.r, tab]);
  useEffect(() => { const h = ref.current && ref.current.querySelector('.panel-title'); if (h) h.focus({ preventScroll: true }); }, [route.r]);
  if (!row) return html`<aside class="panel npanel" ref=${ref}><div class="panel-head"><h2 class="panel-title" tabindex="-1">${t('neg.detail.missing')}</h2><button type="button" class="btn-icon is-bare" aria-label=${t('neg.common.close')} title=${t('neg.common.close')} onClick=${() => go({ r: null })}><${Icon} name="close" /></button></div></aside>`;
  const i = rows.findIndex((x) => x.id === row.id);
  const prev = i > 0 ? rows[i - 1] : null;
  const next = i >= 0 && i < rows.length - 1 ? rows[i + 1] : null;
  const close = () => { go({ r: null }); const el = document.getElementById('syn-' + row.id); if (el) { const b = el.querySelector('.syn-open'); if (b) b.focus(); } };
  const nFb = feedbackOf(d, row.id).length;
  const nDl = Object.keys(((d.stances || {})[row.id] || []).reduce((o, x) => ({ ...o, [x.deleg]: 1 }), {})).length + (d.interventions || []).filter((x) => x.row === row.id).length;
  const tabs = TABS.filter((x) => x !== 'impact' || (row.amends && row.amends.unit));
  const cur = tabs.includes(tab) ? tab : 'position';
  const st = statusOf(d, row.id);
  const stale = staleSet(d).has(row.id);
  return html`<aside class="panel npanel" ref=${ref} aria-labelledby="nd-title" onKeyDown=${(e) => { if (e.key === 'Escape' && !e.target.closest('textarea, input, select')) close(); }}>
    <div class="panel-head">
      <div>
        <p class="panel-kicker">${t('neg.detail.kicker', { id: visibleRowId(row.id), num: row.num || '–' })}</p>
        <h2 class="panel-title" id="nd-title" tabindex="-1">${row.label || t('neg.syn.noLabel')}</h2>
        <div class="nd-tags"><${StatusBadge} status=${st} />${stale ? html`<span class="nstale"><${Icon} name="warning" />${t('neg.pos.staleShort')}</span>` : null}</div>
      </div>
      <button type="button" class="btn-icon is-bare" aria-label=${t('neg.common.close')} title=${t('neg.common.close')} onClick=${close}><${Icon} name="close" /></button>
    </div>
    <div class="panel-tools">
      <button type="button" class="btn btn-tertiary btn-sm" disabled=${!prev} onClick=${() => go({ r: prev.id }, { replace: true })} title=${t('neg.detail.prevTip')}><${Icon} name="arrow-up" />${t('neg.detail.prev')}</button>
      <button type="button" class="btn btn-tertiary btn-sm" disabled=${!next} onClick=${() => go({ r: next.id }, { replace: true })} title=${t('neg.detail.nextTip')}><${Icon} name="arrow-down" />${t('neg.detail.next')}</button>
      ${row.amends && row.amends.work === 'sgk' && row.amends.unit ? html`<a class="btn btn-tertiary btn-sm" href=${'#/lesen?u=' + row.amends.unit + (row.amends.key ? '&k=' + row.amends.key : '')} title=${t('neg.detail.sgkTip')}><${Icon} name="book" />${t('neg.detail.sgk')}</a>` : null}
      <span class="spacer"></span>
      <${CardMenu} small model=${() => rowModel(d, row)} name=${`${visibleRowId(row.id)}_${t('neg.cm.fileRow')}`} title=${row.label} label=${t('neg.cm.rowLabel')} />
      <${HelpLink} view="n-anleitung" sec="zeile" />
    </div>
    <div class="nd-tabs" role="tablist" aria-label=${t('neg.detail.tabs')}>
      ${tabs.map((x) => html`<button type="button" role="tab" id=${'ndt-' + x} aria-selected=${cur === x ? 'true' : 'false'} aria-controls="nd-panel" class="nd-tab" onClick=${() => setTab(x)}>${t('neg.detail.tab.' + x)}${x === 'feedback' && nFb ? html` <span class="nd-count">${nFb}</span>` : null}${x === 'deleg' && nDl ? html` <span class="nd-count">${nDl}</span>` : null}</button>`)}
    </div>
    <div class="panel-body" id="nd-panel" role="tabpanel" aria-labelledby=${'ndt-' + cur}>
      ${cur === 'position' ? html`<${PositionEditor} key=${row.id} d=${d} row=${row} stale=${stale} />` : null}
      ${cur === 'chron' ? html`<${Chronology} key=${row.id} d=${d} row=${row} />` : null}
      ${cur === 'compare' ? html`<${CellCompare} key=${row.id} d=${d} row=${row} />` : null}
      ${cur === 'feedback' ? html`<${Feedback} d=${d} row=${row} />` : null}
      ${cur === 'deleg' ? html`<${RowDelegations} d=${d} row=${row} />` : null}
      ${cur === 'impact' ? html`<${RowImpact} key=${row.id} d=${d} row=${row} />` : null}
      ${cur === 'edit' ? html`<${RowEditor} key=${row.id} d=${d} row=${row} />` : null}
    </div>
  </aside>`;
}

// ------------------------------------------------------------------ CH-Position
const initPos = (d, p) => ({
  stance: (p && p.stance) || 'none', priority: (p && p.priority) || 'medium', text: (p && p.text) || '', proposal: (p && p.proposal) || '',
  fallback: (p && p.fallback) || '', owner: (p && p.owner) || '', basis: p && p.basis ? `${p.basis.track}:${p.basis.doc}` : '',
});
function basisOptions(d, row) {
  const dm = docMap(d);
  const out = [];
  for (const [tid, list] of Object.entries(d.cells[row.id] || {})) for (const c of list) if (!c.empty) out.push({ value: `${tid}:${c.doc}`, label: `${trackName(d, tid)}: ${docLabel(dm.get(c.doc))}`, order: docsByDate(d).findIndex((x) => x.id === c.doc) });
  out.sort((a, b) => a.order - b.order);
  const p = d.positions[row.id];
  if (p && p.basis && !out.some((o) => o.value === `${p.basis.track}:${p.basis.doc}`)) out.unshift({ value: `${p.basis.track}:${p.basis.doc}`, label: `${trackName(d, p.basis.track)}: ${docLabel(dm.get(p.basis.doc))} (${t('neg.pos.basisNoText')})`, order: -1 });
  return out;
}
function PositionEditor({ d, row, stale }) {
  const p = d.positions[row.id];
  const base = initPos(d, p);
  const [f, setF] = useState(base);
  useEffect(() => setF(initPos(d, d.positions[row.id])), [p]);
  const dirty = JSON.stringify(f) !== JSON.stringify(base);
  const upd = (k) => (e) => setF({ ...f, [k]: e && e.target ? e.target.value : e });
  const opts = basisOptions(d, row);
  const save = async () => {
    const [track, doc] = (f.basis || '').split(':');
    const patch = { stance: f.stance, priority: f.priority, text: f.text.trim(), proposal: f.proposal.trim(), fallback: f.fallback.trim(), owner: f.owner.trim() };
    if (track && doc) patch.basis = { track, doc };
    await ensureBy();
    mutate((x) => setPosition(x, row.id, patch), t('neg.undo.position', { id: visibleRowId(row.id) }));
  };
  const dm = docMap(d);
  let staleDiff = null;
  if (stale && p && p.basis) {
    const a = cellFor(d, row.id, p.basis.track, p.basis.doc);
    const b = latestCellOf(d, row.id, p.basis.track);
    staleDiff = { res: compareCells(a && !a.empty ? a.html : '', b && !b.empty ? b.html : '', { clean: true }), from: dm.get(p.basis.doc), to: b && dm.get(b.doc), track: p.basis.track };
  }
  return html`<div class="nd-sec">
    ${staleDiff ? html`<div class="notice notice-warning nd-stale" role="note"><${Icon} name="warning" /><div>
      <strong>${t('neg.pos.staleTitle')}</strong> ${t('neg.pos.staleText', { track: trackName(d, staleDiff.track), from: docLabel(staleDiff.from), to: docLabel(staleDiff.to) })}
      <div class="ncell legal nd-stale-diff" lang="en" dangerouslySetInnerHTML=${{ __html: staleDiff.res.redline }}></div>
      <button type="button" class="btn btn-secondary btn-sm" onClick=${() => mutate((x) => refreshBasis(x, row.id), t('neg.undo.basis', { id: visibleRowId(row.id) }))}><${Icon} name="refresh" />${t('neg.pos.refreshBasis')}</button>
    </div></div>` : null}
    <form class="nform" onSubmit=${(e) => { e.preventDefault(); save(); }}>
      <div class="nform-row">
        <label class="field"><span class="field-label">${t('neg.pos.stance')}</span>
          <select id="pos-stance" value=${f.stance} onChange=${upd('stance')}>${STANCES.map((s) => html`<option value=${s}>${t('neg.stance.' + s)}</option>`)}</select></label>
        <div class="field"><span class="field-label" id="lbl-prio">${t('neg.pos.priority')}</span>
          <${Seg} labelledby="lbl-prio" value=${f.priority} onChange=${(v) => setF({ ...f, priority: v })} options=${PRIORITIES.map((x) => ({ value: x, label: t('neg.priority.' + x) }))} /></div>
      </div>
      <label class="field field-wide"><span class="field-label">${t('neg.pos.text')}</span><textarea id="pos-text" rows="4" value=${f.text} onInput=${upd('text')}></textarea></label>
      <label class="field field-wide"><span class="field-label">${t('neg.pos.proposal')}</span><textarea id="pos-proposal" rows="3" lang="en" class="legal-input" value=${f.proposal} onInput=${upd('proposal')}></textarea></label>
      <label class="field field-wide"><span class="field-label">${t('neg.pos.fallback')}</span><textarea id="pos-fallback" rows="2" value=${f.fallback} onInput=${upd('fallback')}></textarea></label>
      <div class="nform-row">
        <label class="field"><span class="field-label">${t('neg.pos.owner')}</span><input type="text" id="pos-owner" value=${f.owner} onInput=${upd('owner')} placeholder=${t('neg.pos.ownerPh')} /></label>
        <label class="field nform-grow"><span class="field-label">${t('neg.pos.basis')}</span>
          <select id="pos-basis" value=${f.basis} onChange=${upd('basis')}>${!f.basis ? html`<option value="">${t('neg.pos.basisAuto')}</option>` : null}${opts.map((o) => html`<option value=${o.value}>${o.label}</option>`)}</select></label>
      </div>
      <div class="nform-actions">
        <button type="submit" class="btn btn-primary" id="pos-save" disabled=${!dirty}><${Icon} name="check" />${t('neg.pos.save')}</button>
        <button type="button" class="btn btn-tertiary" disabled=${!dirty} onClick=${() => setF(base)}>${t('neg.pos.discard')}</button>
        ${dirty ? html`<span class="small warn-text">${t('neg.pos.unsaved')}</span>` : null}
      </div>
    </form>
    ${p && p.history && p.history.length ? html`<details class="nd-hist"><summary>${t('neg.pos.history', { n: p.history.length })}</summary>
      <ol class="nd-hist-list">${p.history.slice().reverse().map((h) => html`<li>
        <div class="nd-hist-head"><span>${fmtDateTime(h.at)}</span><${ByTag} by=${h.by} /><span class="muted">${sourceLabel(d, h.source)}</span></div>
        <div class="nd-hist-tags">${h.source === 'outcome' ? html`<span class="nd-hist-out">${t('neg.bal.outcome')}: <b>${h.outcome ? t('neg.outcome.' + h.outcome) : t('neg.bal.cleared')}</b></span>` : html`<${StanceTag} stance=${h.stance} />${h.priority ? html`<${PriorityTag} priority=${h.priority} />` : null}`}</div>
        ${h.text && h.source !== 'outcome' ? html`<p class="nd-hist-text uc">${h.text}</p>` : null}
        ${h.proposal && h.source !== 'outcome' ? html`<p class="nd-hist-text" lang="en"><i>${h.proposal}</i></p>` : null}
      </li>`)}</ol></details>` : null}
  </div>`;
}
export function sourceLabel(d, src) {
  if (!src || src === 'manual') return t('neg.pos.src.manual');
  if (src === 'bulk') return t('neg.pos.src.bulk');
  if (src === 'basis') return t('neg.pos.src.basis');
  if (src === 'outcome') return t('neg.pos.src.outcome');
  const m = /^consultation:(.+)$/.exec(src);
  if (m) { const k = d.consultations.find((x) => x.id === m[1]); return t('neg.pos.src.consultation', { title: k ? k.title : m[1] }); }
  return src;
}

// ------------------------------------------------------------------ Chronologie
function Chronology({ d, row }) {
  const tracks = d.tracks.filter((x) => (d.cells[row.id] || {})[x.id]);
  // Start mit der Spur, in der sich am meisten tut (bei Gleichstand: Kompromiss vor Rat vor EP vor Kommission).
  const [tr, setTr] = useState(() => {
    const pref = ['agreement', 'council', 'ep', 'com'];
    const score = (x) => rowHistory(d, row.id, x.id).filter((s) => !s.empty && (s.change === 'changed' || s.change === 'new')).length;
    const ranked = tracks.map((x) => ({ x, n: score(x) })).sort((a, b) => b.n - a.n || pref.indexOf(a.x.id) - pref.indexOf(b.x.id));
    return (ranked[0] ? ranked[0].x : {}).id;
  });
  const [mode, setMode] = useState('diff');
  const dm = docMap(d);
  const steps = useMemo(() => {
    if (!tr) return [];
    const h = rowHistory(d, row.id, tr);
    return h.map((s, i) => {
      const prev = i > 0 ? h[i - 1] : null;
      let diffHtml = s.html;
      let diff = false;
      if (prev && !s.empty && !prev.empty && s.change === 'changed') { diffHtml = compareCells(prev.html, s.html, { clean: true }).redline; diff = true; }
      return { ...s, diffHtml, diff };
    });
  }, [d, row.id, tr]);
  // Aufeinanderfolgende unveränderte Fassungen zu einem Schritt zusammenfassen.
  const groups = useMemo(() => {
    const out = [];
    steps.forEach((s, i) => {
      const prev = i > 0 ? steps[i - 1] : null;
      const same = prev && out.length && ((s.empty && prev.empty) || (!s.empty && !prev.empty && s.change === 'unchanged' && s.status === prev.status));
      if (same) out[out.length - 1].sameIn.push(s.doc);
      else out.push({ ...s, sameIn: [] });
    });
    return out;
  }, [steps]);
  if (!tracks.length) return html`<p class="muted">${t('neg.detail.noCells')}</p>`;
  return html`<div class="nd-sec">
    <div class="nd-bar">
      <div class="field"><span class="field-label" id="lbl-ctr">${t('neg.detail.track')}</span>
        <${Seg} labelledby="lbl-ctr" size="sm" value=${tr} onChange=${setTr} options=${tracks.map((x) => ({ value: x.id, label: trackName(d, x.id) }))} /></div>
      <div class="field"><span class="field-label" id="lbl-cm">${t('neg.detail.show')}</span>
        <${Seg} labelledby="lbl-cm" size="sm" value=${mode} onChange=${setMode} options=${[{ value: 'diff', label: t('neg.detail.showDiff') }, { value: 'text', label: t('neg.detail.showText') }]} /></div>
      <span class="spacer"></span>
      <${CardMenu} small draw=${chronCard(d, row, tr, groups.map((s) => (mode === 'diff' ? s : { ...s, diffHtml: s.html, diff: false })), dm)} model=${() => chronModel(d, row, tr, groups.map((s) => (mode === 'diff' ? s : { ...s, diffHtml: s.html, diff: false })))} name=${`${visibleRowId(row.id)}_${t('neg.card.fileChron')}_${trackName(d, tr)}`} title=${row.label} />
    </div>
    <ol class="chron nchron">${groups.map((s) => html`<li class="step" style=${{ '--act': trackColor(d, tr) }}>
      <div class="step-head"><b class="nchron-doc">${docLabel(dm.get(s.doc))}</b><span class=${'chg nchg-' + s.change}>${t('neg.chg.' + s.change)}</span><${StatusBadge} status=${s.status} /></div>
      ${s.empty ? html`<p class="step-meta">${t('neg.syn.cellEmpty')}</p>` : html`<div class=${'step-text ncell legal' + (s.change === 'unchanged' ? ' is-same' : '')} lang="en" dangerouslySetInnerHTML=${{ __html: mode === 'diff' ? s.diffHtml : s.html }}></div>`}
    ${s.sameIn.length ? html`<p class="step-meta nchron-same">${t('neg.detail.sameIn', { docs: s.sameIn.map((x) => docLabel(dm.get(x))).join('; ') })}</p>` : null}
    </li>`)}</ol>
  </div>`;
}

// ------------------------------------------------------------------ Vergleich zweier Zellen
function allCells(d, row) {
  const dm = docMap(d);
  const out = [];
  const order = new Map(docsByDate(d).map((x, i) => [x.id, i]));
  for (const tr of d.tracks) for (const c of (d.cells[row.id] || {})[tr.id] || []) if (!c.empty) out.push({ key: `${tr.id}:${c.doc}`, cell: c, track: tr.id, title: `${trackName(d, tr.id)}, ${docLabel(dm.get(c.doc), { date: false })}`, o: order.get(c.doc) ?? 0 });
  return out.sort((a, b) => a.o - b.o);
}
function CellCompare({ d, row }) {
  const cells = allCells(d, row);
  const [a, setA] = useState(() => (cells.find((x) => x.track === 'com') || cells[0] || {}).key);
  const [b, setB] = useState(() => (cells[cells.length - 1] || {}).key);
  const [lay, setLay] = useState('side');
  if (cells.length < 2) return html`<p class="muted">${t('neg.detail.compareTooFew')}</p>`;
  const A = cells.find((x) => x.key === a) || cells[0];
  const B = cells.find((x) => x.key === b) || cells[cells.length - 1];
  const res = compareCells(A.cell.html, B.cell.html, { clean: true });
  return html`<div class="nd-sec">
    <div class="nd-bar">
      <label class="field"><span class="field-label">${t('neg.detail.cmpA')}</span><select id="cmp-a" value=${A.key} onChange=${(e) => setA(e.target.value)}>${cells.map((c) => html`<option value=${c.key}>${c.title}</option>`)}</select></label>
      <button type="button" class="btn-icon btn-swap" title=${t('neg.detail.swap')} aria-label=${t('neg.detail.swap')} onClick=${() => { setA(B.key); setB(A.key); }}><${Icon} name="swap" /></button>
      <label class="field"><span class="field-label">${t('neg.detail.cmpB')}</span><select id="cmp-b" value=${B.key} onChange=${(e) => setB(e.target.value)}>${cells.map((c) => html`<option value=${c.key}>${c.title}</option>`)}</select></label>
    </div>
    <div class="nd-bar">
      <${Seg} label=${t('neg.detail.layout')} size="sm" value=${lay} onChange=${setLay} options=${[{ value: 'side', label: t('neg.detail.side') }, { value: 'redline', label: t('neg.detail.redline') }]} />
      <span class="muted small">${res.changed ? t('neg.detail.words', { i: res.ins, d: res.del }) : t('neg.detail.identical')}</span>
      <span class="spacer"></span>
      <${CardMenu} small draw=${compareCard(d, row, A, B, res, lay)} model=${() => compareModel(d, row, A, B, res, lay)} name=${`${visibleRowId(row.id)}_${t('neg.card.fileCompare')}`} title=${row.label} />
    </div>
    ${lay === 'redline' ? html`<div class="ncell legal nd-cmp-red" lang="en" dangerouslySetInnerHTML=${{ __html: res.redline }}></div>`
      : html`<div class="nd-cmp"><div><p class="nd-cmp-h">${A.title}</p><div class="ncell legal" lang="en" dangerouslySetInnerHTML=${{ __html: res.oldHtml }}></div></div><div><p class="nd-cmp-h">${B.title}</p><div class="ncell legal" lang="en" dangerouslySetInnerHTML=${{ __html: res.newHtml }}></div></div></div>`}
  </div>`;
}

// ------------------------------------------------------------------ Rückmeldungen
export function feedbackOf(d, rowId) {
  const out = [];
  for (const k of d.consultations || []) for (const r of k.responses || []) {
    const off = (k.offices || []).find((o) => o.id === r.office) || { abbr: '?', name: '?' };
    for (const it of r.items) if (it.row === rowId) out.push({ k, off, it, dec: (k.decisions || {})[it.id] || null });
  }
  return out;
}
function Feedback({ d, row }) {
  const list = feedbackOf(d, row.id);
  if (!list.length) return html`<p class="muted">${t('neg.detail.noFeedback')}</p>`;
  return html`<ul class="nfb">${list.map(({ k, off, it, dec }) => html`<li class="nfb-item">
    <div class="nfb-head"><b class="uc" title=${off.name}>${off.abbr || off.name}</b><span class="muted uc">${k.title}</span><${DecisionTag} decision=${dec ? dec.decision : 'open'} /></div>
    ${it.comment ? html`<p class="nfb-text uc">${it.comment}</p>` : null}
    ${it.proposal ? html`<p class="nfb-prop"><span class="field-label">${t('neg.cons.proposal')}</span><span lang="en" class="legal">${it.proposal}</span></p>` : null}
    ${dec && dec.reply ? html`<p class="nfb-reply"><span class="field-label">${t('neg.cons.reply')}</span><span class="uc">${dec.reply}</span></p>` : null}
    <a class="btn btn-tertiary btn-sm" href="#/konsultation" onClick=${(e) => { e.preventDefault(); go({ view: 'konsultation', nk: k.id, nkt: 'agg', r: null, nkf: null }); }}><${Icon} name="message" />${t('neg.detail.toConsultation')}</a>
  </li>`)}</ul>`;
}

// ------------------------------------------------------------------ Manuelle Korrektur
const toPlain = (h) => htmlToText(String(h || '').replace(/<br\s*\/?>/gi, '\n'));
const plainToHtml = (s) => escapeHtml(s).replace(/\r?\n/g, '<br>');
function RowEditor({ d, row }) {
  const docs = docsByDate(d);
  const [label, setLabel] = useState(row.label || '');
  const [num, setNum] = useState(row.num || '');
  const [docId, setDocId] = useState((docs[docs.length - 1] || {}).id);
  const [trackId, setTrackId] = useState(() => { const doc = docs[docs.length - 1]; return (doc && doc.tracks && doc.tracks[0]) || d.tracks[0].id; });
  const cell = ((d.cells[row.id] || {})[trackId] || []).find((c) => c.doc === docId) || null;
  const [txt, setTxt] = useState(cell ? toPlain(cell.html) : '');
  const [stat, setStat] = useState(cell ? cell.status || '' : '');
  const [split, setSplit] = useState(null);
  useEffect(() => { setTxt(cell ? toPlain(cell.html) : ''); setStat(cell ? cell.status || '' : ''); }, [docId, trackId, cell]);
  const vid = visibleRowId(row.id);
  const all = sortedRows(d);
  const idx = all.findIndex((r) => r.id === row.id);
  const nextRow = all[idx + 1];
  const saveCell = () => mutate((x) => setCell(x, row.id, trackId, docId, { html: cell && toPlain(cell.html) === txt ? cell.html : plainToHtml(txt), status: stat || null }), t('neg.undo.cell', { id: vid }));
  return html`<div class="nd-sec">
    <p class="small muted">${t('neg.edit.intro')}</p>
    <section class="nd-group" aria-labelledby="ed-h1"><h3 class="nd-h" id="ed-h1">${t('neg.edit.rowHead')}</h3>
    <div class="nform-row">
      <label class="field"><span class="field-label">${t('neg.edit.num')}</span><input type="text" id="ed-num" size="6" value=${num} onInput=${(e) => setNum(e.target.value)} /></label>
      <label class="field nform-grow"><span class="field-label">${t('neg.edit.label')}</span><input type="text" id="ed-label" lang="en" value=${label} onInput=${(e) => setLabel(e.target.value)} /></label>
    </div>
    <div class="nform-actions"><button type="button" class="btn btn-secondary btn-sm" disabled=${label === (row.label || '') && num === (row.num || '')} onClick=${() => mutate((x) => updateRow(x, row.id, { label, num: num || null }), t('neg.undo.row', { id: vid }))}><${Icon} name="check" />${t('neg.edit.saveRow')}</button></div>
    </section>
    <section class="nd-group" aria-labelledby="ed-h2"><h3 class="nd-h" id="ed-h2">${t('neg.edit.cellHead')}</h3>
    <div class="nform-row">
      <label class="field nform-grow"><span class="field-label">${t('neg.edit.doc')}</span><select id="ed-doc" value=${docId} onChange=${(e) => setDocId(e.target.value)}>${docs.map((x) => html`<option value=${x.id}>${docLabel(x)}</option>`)}</select></label>
      <label class="field"><span class="field-label">${t('neg.detail.track')}</span><select id="ed-track" value=${trackId} onChange=${(e) => setTrackId(e.target.value)}>${d.tracks.map((x) => html`<option value=${x.id}>${trackName(d, x.id)}</option>`)}</select></label>
      <label class="field"><span class="field-label">${t('neg.syn.status')}</span><select id="ed-status" value=${stat} onChange=${(e) => setStat(e.target.value)}><option value="">${t('neg.status.none')}</option>${STATUSES.map((s) => html`<option value=${s}>${t('neg.status.' + s)}</option>`)}</select></label>
    </div>
    <label class="field field-wide"><span class="field-label">${t('neg.edit.text')}</span><textarea id="ed-text" rows="6" lang="en" class="legal-input" value=${txt} onInput=${(e) => setTxt(e.target.value)} placeholder=${t('neg.edit.textPh')}></textarea></label>
    ${cell && /<[bius]>/.test(cell.html) ? html`<p class="small muted">${t('neg.edit.formatHint')}</p>` : null}
    <div class="nform-actions"><button type="button" class="btn btn-secondary btn-sm" id="ed-save-cell" onClick=${saveCell}><${Icon} name="check" />${cell ? t('neg.edit.saveCell') : t('neg.edit.addCell')}</button></div>
    </section>
    <section class="nd-group" aria-labelledby="ed-h3"><h3 class="nd-h" id="ed-h3">${t('neg.edit.structHead')}</h3>
    <div class="nd-actions">
      <button type="button" class="btn btn-tertiary btn-sm" onClick=${() => { let nid; mutate((x) => { const r = addRow(x, { afterId: row.id, label: '', docId }); nid = r.rowId; return r.dossier; }, t('neg.undo.addRow')); if (nid) go({ r: nid }, { replace: true }); }}><${Icon} name="plus" />${t('neg.edit.addBelow')}</button>
      <button type="button" class="btn btn-tertiary btn-sm" disabled=${!nextRow} onClick=${async () => { if (await confirmDialog({ title: t('neg.edit.mergeTitle'), text: t('neg.edit.mergeText', { a: vid, b: visibleRowId(nextRow.id) }), ok: t('neg.edit.merge') })) mutate((x) => mergeRows(x, row.id, nextRow.id), t('neg.undo.merge', { id: vid })); }}><${Icon} name="merge" />${t('neg.edit.mergeNext')}</button>
      <button type="button" class="btn btn-tertiary btn-sm" onClick=${() => setSplit(docId)}><${Icon} name="split" />${t('neg.edit.split')}</button>
      <button type="button" class="btn btn-tertiary btn-sm" disabled=${idx <= 0} onClick=${() => mutate((x) => moveRow(x, row.id, -1), t('neg.undo.move', { id: vid }))}><${Icon} name="arrow-up" />${t('neg.edit.up')}</button>
      <button type="button" class="btn btn-tertiary btn-sm" disabled=${!nextRow} onClick=${() => mutate((x) => moveRow(x, row.id, 1), t('neg.undo.move', { id: vid }))}><${Icon} name="arrow-down" />${t('neg.edit.down')}</button>
      <button type="button" class="btn btn-danger-ghost is-bare btn-sm" onClick=${async () => { if (await confirmDialog({ title: t('neg.edit.deleteTitle'), text: t('neg.edit.deleteText', { id: vid }), ok: t('neg.edit.delete'), danger: true })) { mutate((x) => deleteRow(x, row.id), t('neg.undo.deleteRow', { id: vid })); go({ r: null }); } }}><${Icon} name="trash" />${t('neg.edit.delete')}</button>
    </div>
    </section>
    ${split ? html`<${SplitDialog} d=${d} row=${row} docId=${split} onClose=${() => setSplit(null)} />` : null}
  </div>`;
}

function SplitDialog({ d, row, docId, onClose }) {
  const dm = docMap(d);
  const tracks = d.tracks.filter((x) => ((d.cells[row.id] || {})[x.id] || []).some((c) => c.doc === docId));
  const [parts, setParts] = useState(() => Object.fromEntries(tracks.map((x) => { const c = d.cells[row.id][x.id].find((y) => y.doc === docId); return [x.id, { first: toPlain(c.html), second: '' }]; })));
  const [label2, setLabel2] = useState(row.label || '');
  const ok = () => {
    let nid;
    mutate((x) => { const r = splitRow(x, row.id, { label2, parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, { doc: docId, first: plainToHtml(v.first), second: plainToHtml(v.second) }])) }); nid = r.rowId; return r.dossier; }, t('neg.undo.split', { id: visibleRowId(row.id) }));
    onClose();
    if (nid) go({ r: nid }, { replace: true });
  };
  return html`<${Modal} title=${t('neg.edit.splitTitle')} wide onClose=${onClose} foot=${html`<button type="button" class="btn btn-primary" onClick=${ok}><${Icon} name="split" />${t('neg.edit.split')}</button><button type="button" class="btn btn-tertiary" onClick=${onClose}>${t('neg.common.cancel')}</button>`}>
    <p class="modal-text">${t('neg.edit.splitText', { doc: docLabel(dm.get(docId)) })}</p>
    <label class="field field-wide"><span class="field-label">${t('neg.edit.label2')}</span><input type="text" lang="en" value=${label2} onInput=${(e) => setLabel2(e.target.value)} /></label>
    ${tracks.length ? tracks.map((x) => html`<div class="nsplit"><h3 class="nd-h">${trackName(d, x.id)}</h3><div class="nsplit-grid">
      <label class="field field-wide"><span class="field-label">${t('neg.edit.part1')}</span><textarea rows="6" lang="en" class="legal-input" value=${parts[x.id].first} onInput=${(e) => setParts({ ...parts, [x.id]: { ...parts[x.id], first: e.target.value } })}></textarea></label>
      <label class="field field-wide"><span class="field-label">${t('neg.edit.part2')}</span><textarea rows="6" lang="en" class="legal-input" value=${parts[x.id].second} onInput=${(e) => setParts({ ...parts, [x.id]: { ...parts[x.id], second: e.target.value } })}></textarea></label>
    </div></div>`) : html`<${Notice} kind="warning">${t('neg.edit.splitNone')}</${Notice}>`}
  </${Modal}>`;
}
export { hasPosition };
