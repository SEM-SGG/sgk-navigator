// Position CH: Kennzahlen, Tabelle aller Positionen (sortier- und filterbar), Massenbearbeitung.
import { html } from 'htm/preact';
import { useMemo, useState } from 'preact/hooks';
import { t } from '../../lib/i18n.js';
import { go } from '../../state.js';
import { Icon, HelpLink, Seg } from '../../ui/common.js';
import { Balance } from './balance.js';
import { toast } from '../../app.js';
import { fmtDate, fold } from '../../lib/format.js';
import { STANCES, PRIORITIES, sortedRows, hasPosition, setPositionsBulk, visibleRowId, docMap } from './core.js';
import { mutate, selStore } from './store.js';
import { useDossier, NoDossier, PageHead, StanceTag, PriorityTag, StatusBadge, trackName, docShort, Figures } from './ui.js';
import { staleSet, statusOf } from './rows.js';

const csv = (s) => (s ? String(s).split(',').filter(Boolean) : []);

export function PositionView({ route }) {
  const d = useDossier(route);
  if (!d) return html`<${NoDossier} route=${route} />`;
  if (route.nkt === 'bilanz') return html`<div class="view"><main class="wide" id="main" tabindex="-1">
    <${PageHead} compact kicker=${d.short || d.title} title=${t('neg.bal.title')} help=${html`<${HelpLink} view="n-anleitung" sec="bilanz" />`}>
      <p class="nhead-lead">${t('neg.bal.lead')}</p>
    </${PageHead}>
    <${PosTabs} route=${route} />
    <${Balance} d=${d} />
  </main></div>`;
  return html`<${Positions} d=${d} route=${route} />`;
}
/** Umschalter Positionen | Bilanz (nkt=bilanz). */
function PosTabs({ route }) {
  return html`<div class="ndl-sub"><${Seg} label=${t('neg.bal.tabs')} value=${route.nkt === 'bilanz' ? 'bilanz' : 'list'} onChange=${(v) => go({ nkt: v === 'bilanz' ? 'bilanz' : null, po: null }, { replace: true })}
    options=${[{ value: 'list', label: t('neg.bal.tabList') }, { value: 'bilanz', label: t('neg.bal.tabBalance') }]} /></div>`;
}

function Positions({ d, route }) {
  const sel = selStore.use();
  const [sort, setSort] = useState({ k: 'order', dir: 1 });
  const [limit, setLimit] = useState(200);
  const [bulk, setBulk] = useState({ stance: '', priority: '' });
  const all = useMemo(() => sortedRows(d), [d]);
  const stale = staleSet(d);
  const withPos = all.filter((r) => hasPosition(d.positions[r.id]));
  const scope = route.nfp === 'all' ? 'all' : route.nfp === 'without' ? 'without' : 'with';
  const fStance = csv(route.nfh), fPrio = csv(route.nfr), fStale = route.nfo === '1';
  const q = fold(route.nq || '');
  const set = (patch) => go(patch, { replace: true });
  let rows = (scope === 'with' ? withPos : scope === 'without' ? all.filter((r) => !hasPosition(d.positions[r.id])) : all).filter((r) => {
    const p = d.positions[r.id];
    if (fStance.length && !(p && fStance.includes(p.stance || 'none'))) return false;
    if (fPrio.length && !(p && hasPosition(p) && fPrio.includes(p.priority))) return false;
    if (fStale && !stale.has(r.id)) return false;
    if (q && !fold([r.label, r.num, p && p.text, p && p.proposal, p && p.owner].filter(Boolean).join(' ')).includes(q)) return false;
    return true;
  });
  const key = { order: (r) => r.order, stance: (r) => STANCES.indexOf((d.positions[r.id] || {}).stance || 'none'), priority: (r) => { const p = d.positions[r.id]; return p && hasPosition(p) ? PRIORITIES.indexOf(p.priority) : 9; }, updated: (r) => (d.positions[r.id] || {}).updated || '' }[sort.k];
  rows = rows.slice().sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : a.order - b.order) * sort.dir; });
  const byStance = {}, byPrio = {};
  for (const r of withPos) { const p = d.positions[r.id]; byStance[p.stance || 'none'] = (byStance[p.stance || 'none'] || 0) + 1; byPrio[p.priority] = (byPrio[p.priority] || 0) + 1; }
  const staleN = withPos.filter((r) => stale.has(r.id)).length;
  const selIds = rows.filter((r) => sel.has(r.id)).map((r) => r.id);
  const allSel = rows.length > 0 && rows.slice(0, limit).every((r) => sel.has(r.id));
  const toggle = (id) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); selStore.set(n); };
  const toggleAll = () => { const n = new Set(sel); if (allSel) rows.forEach((r) => n.delete(r.id)); else rows.slice(0, limit).forEach((r) => n.add(r.id)); selStore.set(n); };
  const applyBulk = () => {
    const patch = {};
    if (bulk.stance) patch.stance = bulk.stance;
    if (bulk.priority) patch.priority = bulk.priority;
    if (!selIds.length || !Object.keys(patch).length) return;
    mutate((x) => setPositionsBulk(x, selIds, patch), t('neg.undo.bulk', { n: selIds.length }));
    toast(t('neg.pos.bulkDone', { n: selIds.length }), 'success', 3500);
    setBulk({ stance: '', priority: '' });
  };
  const th = (k, label) => html`<th aria-sort=${sort.k === k ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined}><button type="button" class="th-sort" onClick=${() => setSort({ k, dir: sort.k === k ? -sort.dir : 1 })}>${label}<span aria-hidden="true" class="th-arrow">${sort.k === k ? (sort.dir > 0 ? '▲' : '▼') : '↕'}</span></button></th>`;
  const dm = docMap(d);
  const figClick = (patch) => () => set({ nfp: null, nfh: null, nfr: null, nfo: null, ...patch });
  return html`<div class="view"><main class="wide" id="main" tabindex="-1">
    <${PageHead} compact kicker=${d.short || d.title} title=${t('neg.nav.position')} help=${html`<${HelpLink} view="n-anleitung" sec="position" />`}>
      <p class="nhead-lead">${t('neg.pos.lead')}</p>
    </${PageHead}>
    <${PosTabs} route=${route} />
    <div class="nkpi" role="group" aria-label=${t('neg.pos.figures')}>
      <div class="nkpi-tiles">
        ${[
          { v: withPos.length, label: t('neg.pos.figWith'), sub: t('neg.pos.figOf', { n: all.length }), patch: {}, on: scope === 'with' && !fStance.length && !fPrio.length && !fStale },
          { v: all.length - withPos.length, label: t('neg.pos.figWithout'), patch: { nfp: 'without' }, on: scope === 'without' },
          { v: byPrio.redline || 0, label: t('neg.pos.figRedline'), patch: { nfr: 'redline' }, on: fPrio.includes('redline'), warn: !!byPrio.redline },
          { v: staleN, label: t('neg.pos.figStale'), patch: { nfo: '1' }, on: fStale, warn: !!staleN, tip: t('neg.pos.figStaleSub') },
        ].map((x) => html`<button type="button" class=${'nkpi-btn' + (x.warn ? ' is-warn' : '')} aria-pressed=${x.on ? 'true' : 'false'} title=${x.tip || x.label} onClick=${figClick(x.patch)}><span class="nkpi-v">${x.v}</span><span class="nkpi-l">${x.label}</span>${x.sub ? html`<span class="nkpi-s">${x.sub}</span>` : null}</button>`)}
      </div>
      <div class="nkpi-row">
        <span class="tool-label">${t('neg.pos.byStance')}</span>
        ${STANCES.map((s) => html`<button type="button" class="ndist-btn" aria-pressed=${fStance.includes(s) ? 'true' : 'false'} onClick=${() => set({ nfh: fStance.includes(s) ? null : s, nfp: null })}><${StanceTag} stance=${s} /><span class="ndist-n">${byStance[s] || 0}</span></button>`)}
      </div>
      <div class="nkpi-row">
        <span class="tool-label">${t('neg.pos.byPriority')}</span>
        ${PRIORITIES.map((s) => html`<button type="button" class="ndist-btn" aria-pressed=${fPrio.includes(s) ? 'true' : 'false'} onClick=${() => set({ nfr: fPrio.includes(s) ? null : s, nfp: null })}><${PriorityTag} priority=${s} /><span class="ndist-n">${byPrio[s] || 0}</span></button>`)}
      </div>
    </div>

    <div class="toolbar nd-toolbar is-sm">
      <label class="field syn-q"><span class="field-label">${t('neg.syn.search')}</span><span class="toc-search"><${Icon} name="search" /><input type="search" id="pos-q" value=${route.nq || ''} placeholder=${t('neg.syn.searchPh')} onInput=${(e) => set({ nq: e.target.value || null })} /></span></label>
      <label class="field"><span class="field-label">${t('neg.pos.scope')}</span><select id="pos-scope" value=${scope} onChange=${(e) => set({ nfp: e.target.value === 'with' ? null : e.target.value })}>
        <option value="with">${t('neg.pos.scopeWith')}</option><option value="without">${t('neg.pos.scopeWithout')}</option><option value="all">${t('neg.pos.scopeAll')}</option></select></label>
      <label class="field"><span class="field-label">${t('neg.pos.stance')}</span><select id="pos-fst" value=${fStance[0] || ''} onChange=${(e) => set({ nfh: e.target.value || null })}><option value="">${t('neg.syn.all')}</option>${STANCES.map((s) => html`<option value=${s}>${t('neg.stance.' + s)}</option>`)}</select></label>
      <label class="field"><span class="field-label">${t('neg.pos.priority')}</span><select id="pos-fpr" value=${fPrio[0] || ''} onChange=${(e) => set({ nfr: e.target.value || null })}><option value="">${t('neg.syn.all')}</option>${PRIORITIES.map((s) => html`<option value=${s}>${t('neg.priority.' + s)}</option>`)}</select></label>
      <label class="check tool-group"><input type="checkbox" checked=${fStale} onChange=${(e) => set({ nfo: e.target.checked ? '1' : null })} />${t('neg.pos.onlyStale')}</label>
    </div>

    <div class=${'nbulk' + (selIds.length ? ' is-on' : '')} role="region" aria-label=${t('neg.pos.bulk')}>
      <span class="nbulk-n">${selIds.length ? t('neg.pos.selected', { n: selIds.length }) : t('neg.pos.selectHint')}</span>
      ${selIds.length ? html`
      <label class="field field-row"><span class="field-label">${t('neg.pos.setStance')}</span><select id="bulk-stance" disabled=${!selIds.length} value=${bulk.stance} onChange=${(e) => setBulk({ ...bulk, stance: e.target.value })}><option value="">${t('neg.pos.unchanged')}</option>${STANCES.map((s) => html`<option value=${s}>${t('neg.stance.' + s)}</option>`)}</select></label>
      <label class="field field-row"><span class="field-label">${t('neg.pos.setPriority')}</span><select id="bulk-prio" disabled=${!selIds.length} value=${bulk.priority} onChange=${(e) => setBulk({ ...bulk, priority: e.target.value })}><option value="">${t('neg.pos.unchanged')}</option>${PRIORITIES.map((s) => html`<option value=${s}>${t('neg.priority.' + s)}</option>`)}</select></label>
      <button type="button" class="btn btn-primary btn-sm" id="bulk-apply" disabled=${!selIds.length || (!bulk.stance && !bulk.priority)} onClick=${applyBulk}><${Icon} name="check" />${t('neg.pos.applyBulk')}</button>
      <button type="button" class="btn btn-tertiary btn-sm" onClick=${() => selStore.set(new Set())}>${t('neg.pos.clearSel')}</button>` : null}
    </div>

    ${rows.length === 0 ? html`<div class="neg-empty"><p class="empty-title">${withPos.length ? t('neg.pos.noneFiltered') : t('neg.pos.noneTitle')}</p><p>${withPos.length ? '' : t('neg.pos.noneText')}</p>
      ${!withPos.length ? html`<div class="neg-actions"><a class="btn btn-secondary" href="#/synopse" onClick=${(e) => { e.preventDefault(); go({ view: 'synopse' }); }}><${Icon} name="columns" />${t('neg.pos.toSynopsis')}</a></div>` : null}</div>`
      : html`<div class="tbl-scroll"><table class="tbl-data npos">
      <thead><tr><th class="npos-cb"><label class="check"><input type="checkbox" checked=${allSel} onChange=${toggleAll} aria-label=${t('neg.pos.selectAll')} /></label></th>
        ${th('order', t('neg.syn.colRow'))}${th('stance', t('neg.pos.stance'))}${th('priority', t('neg.pos.priority'))}<th>${t('neg.pos.text')}</th><th>${t('neg.pos.owner')}</th><th>${t('neg.pos.basis')}</th>${th('updated', t('neg.pos.updated'))}</tr></thead>
      <tbody>${rows.slice(0, limit).map((r) => { const p = d.positions[r.id]; const has = hasPosition(p); return html`<tr class=${sel.has(r.id) ? 'is-sel' : ''}>
        <td class="npos-cb"><label class="check"><input type="checkbox" checked=${sel.has(r.id)} onChange=${() => toggle(r.id)} aria-label=${t('neg.pos.selectRow', { id: visibleRowId(r.id) })} /></label></td>
        <td class="npos-row"><button type="button" class="link" onClick=${() => go({ view: 'synopse', r: r.id })}>${r.num ? r.num + ' | ' : ''}${r.label}</button><span class="nlist-sub">${visibleRowId(r.id)}</span><${StatusBadge} status=${statusOf(d, r.id)} /></td>
        <td>${has ? html`<${StanceTag} stance=${p.stance} />` : html`<span class="muted">–</span>`}</td>
        <td>${has ? html`<${PriorityTag} priority=${p.priority} />` : null}</td>
        <td class="npos-text uc">${p && p.text ? html`<span class="clamp3" title=${p.text}>${p.text}</span>` : null}${p && p.proposal ? html`<span class="clamp3 npos-prop" lang="en" title=${p.proposal}>${p.proposal}</span>` : null}</td>
        <td class="uc">${p && p.owner}</td>
        <td class="small">${p && p.basis ? html`${trackName(d, p.basis.track)}, ${docShort(dm.get(p.basis.doc))}` : null}${stale.has(r.id) ? html`<span class="nstale"><${Icon} name="warning" />${t('neg.pos.staleShort')}</span>` : null}</td>
        <td class="nw small">${p && p.updated ? fmtDate(p.updated.slice(0, 10)) : ''}</td>
      </tr>`; })}</tbody></table></div>
      ${rows.length > limit ? html`<div class="syn-more"><button type="button" class="btn btn-tertiary" onClick=${() => setLimit(limit + 400)}>${t('neg.syn.more', { n: rows.length - limit })}</button></div>` : null}`}
  </main></div>`;
}
