// Delegationen und Sitzungen (Etappe 3, SPEC3 §3.7): Matrix der Haltungen (Zeilen × Delegationen), Sitzungen (vorbereiten, nachbereiten,
// Sitzungsbericht), Delegationen verwalten; Bausteine für das Zeilendetail (Reiter «Delegationen»).
// Zustand im Hash: nkt = Unteransicht (matrix | meetings | deleg); po = Filter der Matrix ("m:m1~s:support~g:de~p:1~v:text")
// bzw. gewählte Sitzung ("m1" oder "m1~post"). Eigene Schlüssel wären sauberer (Bedarf an state.js gemeldet).
import { html } from 'htm/preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { t, uiLang } from '../../lib/i18n.js';
import { go } from '../../state.js';
import { Icon, HelpLink, Seg } from '../../ui/common.js';
import { toast } from '../../app.js';
import { fmtDate, todayIso } from '../../lib/format.js';
import {
  DELEG_STANCES, INTERVENTION_RESULTS, DELEG_KINDS, delegationsOf, ensureDelegations, stanceMatrix, meetingsByDate, setStances, removeStance,
  addIntervention, updateIntervention, removeIntervention, addMeeting, updateMeeting, removeMeeting, addDelegation, updateDelegation, removeDelegation,
  chStanceOf, hasPosition, sortedRows, docsByDate, docMap, visibleRowId, changesBetween, buildPositionDocx,
} from './core.js';
import { mutate } from './store.js';
import { useDossier, NoDossier, PageHead, trackName, StanceTag, PriorityTag, StatusBadge, docLabel, fmtDateTime, confirmDialog, Figures } from './ui.js';
import { statusOf } from './rows.js';
import { ByTag } from './by.js';
import { openRow } from './detail.js';
import { downloadDocx } from './consultation.js';

// ------------------------------------------------------------------ Etiketten
const DS_SYM = { support: '✓', oppose: '✕', reservation: '!', scrutiny: '?', proposal: '✎', neutral: '○' };
export function DStanceTag({ stance, compact }) {
  return html`<span class=${'dst ds-' + stance + (compact ? ' is-compact' : '')}><span class="dst-sym" aria-hidden="true">${DS_SYM[stance] || '•'}</span>${compact ? html`<span class="sr">${t('neg.dstance.' + stance)}</span>` : t('neg.dstance.' + stance)}</span>`;
}
const IV_SYM = { 'taken-up': '✓', partly: '±', rejected: '✕', open: '…' };
export function IvTag({ result }) {
  const r = result || 'open';
  return html`<span class=${'niv niv-' + r}><span class="niv-sym" aria-hidden="true">${IV_SYM[r]}</span>${t('neg.ivres.' + r)}</span>`;
}
export const FictTag = () => html`<span class="tag tag-demo">${t('neg.fict')}</span>`;
export function delegName(g) {
  if (!g) return '';
  const n = g.name || {};
  return (typeof n === 'string' ? n : n[uiLang()] || n.de || n.en) || g.code;
}
export function delegShort(g) {
  if (!g) return '';
  const a = g.abbr && (g.abbr[uiLang()] || g.abbr.de);
  return a || g.code;
}
export function meetingLabel(m, { date = true } = {}) {
  if (!m) return '';
  return [date && m.date ? fmtDate(m.date) : '', m.title || m.body].filter(Boolean).join(', ');
}
const rowLabel = (r) => (r ? `${r.num ? r.num + ' | ' : ''}${r.label || visibleRowId(r.id)}` : '');
const latestMeeting = (d) => { const l = meetingsByDate(d); return l.length ? l[l.length - 1].id : ''; };
const isFict = (x) => !!(x && x.fictitious);

// ------------------------------------------------------------------ Ansicht
export function DelegationsView({ route }) {
  const d = useDossier(route);
  if (!d) return html`<${NoDossier} route=${route} />`;
  return html`<${Delegations} d=${d} route=${route} />`;
}
const SUBS = ['matrix', 'meetings', 'deleg'];
function Delegations({ d, route }) {
  const sub = SUBS.includes(route.nkt) ? route.nkt : 'matrix';
  const fict = delegationsOf(d).some(isFict) || (d.meetings || []).some(isFict) || (d.interventions || []).some(isFict);
  return html`<div class="view"><main class="wide" id="main" tabindex="-1">
    <${PageHead} compact kicker=${d.short || d.title} title=${t('neg.nav.delegationen')} help=${html`<${HelpLink} view="n-anleitung" sec=${sub === 'meetings' ? 'sitzung' : 'delegationen'} />`}>
      <p class="nhead-lead">${t('neg.dl.lead')}</p>
    </${PageHead}>
    ${fict ? html`<div class="notice notice-info ndl-fict" role="note"><${Icon} name="info" /><div>${t('neg.dl.fictNote')}</div></div>` : null}
    <div class="ndl-sub" role="group" aria-label=${t('neg.dl.subLabel')}>
      <${Seg} label=${t('neg.dl.subLabel')} value=${sub} onChange=${(v) => go({ nkt: v === 'matrix' ? null : v, po: null }, { replace: true })}
        options=${[{ value: 'matrix', label: t('neg.dl.sub.matrix') }, { value: 'meetings', label: t('neg.dl.sub.meetings', { n: (d.meetings || []).length }) }, { value: 'deleg', label: t('neg.dl.sub.deleg') }]} />
    </div>
    ${sub === 'matrix' ? html`<${Matrix} d=${d} route=${route} />` : sub === 'meetings' ? html`<${Meetings} d=${d} route=${route} />` : html`<${DelegAdmin} d=${d} />`}
  </main></div>`;
}

// ------------------------------------------------------------------ Matrix
export function parseOpts(po) {
  const o = {};
  for (const p of String(po || '').split('~')) { const m = /^([a-z]):(.*)$/.exec(p); if (m && m[2]) o[m[1]] = decodeURIComponent(m[2]); }
  return { meeting: o.m || '', stance: DELEG_STANCES.includes(o.s) ? o.s : '', deleg: o.g || '', withPos: o.p === '1', mode: o.v === 'text' ? 'text' : 'sym' };
}
export function encodeOpts(f) {
  const parts = [];
  if (f.meeting) parts.push('m:' + encodeURIComponent(f.meeting));
  if (f.stance) parts.push('s:' + f.stance);
  if (f.deleg) parts.push('g:' + encodeURIComponent(f.deleg));
  if (f.withPos) parts.push('p:1');
  if (f.mode === 'text') parts.push('v:text');
  return parts.join('~') || null;
}
const STEP = 80;
/** Daten der Matrix (rein, auch für Tests): sichtbare Delegationen, gefilterte Zeilen, Kennzahlen. */
export function matrixData(d, f) {
  const mx = stanceMatrix(d, f.meeting ? { meeting: f.meeting } : {});
  const all = delegationsOf(d);
  const hidden = new Set(all.filter((g) => g.hidden).map((g) => g.id));
  let cols = mx.delegations.filter((g) => !hidden.has(g.id) || g.id === f.deleg).map((g) => ({ ...(all.find((x) => x.id === g.id) || g) }));
  if (f.deleg) cols = cols.filter((g) => g.id === f.deleg);
  const colIds = new Set(cols.map((g) => g.id));
  const rows = mx.rows.filter((r) => {
    if (f.withPos && !hasPosition(d.positions[r.rowId])) return false;
    const cells = Object.entries(r.cells).filter(([k]) => colIds.has(k));
    if (!cells.length) return false;
    if (f.stance && !cells.some(([, c]) => c.stance === f.stance)) return false;
    return true;
  }).map((r) => {
    const ch = chStanceOf(d, r.rowId, r);
    const allies = ch ? Object.entries(r.cells).filter(([k, c]) => k !== 'ch' && c.stance === ch).map(([k]) => k) : [];
    return { ...r, ch, allies };
  });
  const byStance = {}, byDeleg = {}, allyCount = {};
  for (const r of rows) {
    for (const [k, c] of Object.entries(r.cells)) {
      if (!colIds.has(k)) continue;
      byStance[c.stance] = (byStance[c.stance] || 0) + 1;
      byDeleg[k] = byDeleg[k] || {};
      byDeleg[k][c.stance] = (byDeleg[k][c.stance] || 0) + 1;
    }
    for (const k of r.allies) if (colIds.has(k)) allyCount[k] = (allyCount[k] || 0) + 1;
  }
  const allies = Object.entries(allyCount).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { cols, rows, byStance, byDeleg, allies, total: mx.rows.length, withCh: rows.filter((r) => r.ch).length };
}

function Matrix({ d, route }) {
  const f = parseOpts(route.po);
  const setF = (patch) => go({ po: encodeOpts({ ...f, ...patch }) }, { replace: true });
  const data = useMemo(() => matrixData(d, f), [d, route.po]);
  const [limit, setLimit] = useState(STEP);
  useEffect(() => setLimit(STEP), [route.po, d.id]);
  const sentinel = useRef();
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setLimit((l) => l + STEP); }, { root: el.closest('.ndl-mx-wrap'), rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [data, limit]);
  const meetings = meetingsByDate(d);
  const dels = delegationsOf(d);
  const used = new Set(Object.values(d.stances || {}).flat().map((s) => s.deleg));
  const nStances = Object.values(d.stances || {}).reduce((n, l) => n + l.length, 0);
  const shown = data.rows.slice(0, limit);
  const cellTitle = (g, c) => [`${delegName(g)} (${g.code}): ${t('neg.dstance.' + c.stance)}`, c.text, c.meeting ? meetingLabel(meetings.find((m) => m.id === c.meeting)) : '', c.by ? t('neg.by.who', { by: c.by }) : '', c.earlier && c.earlier.length ? t('neg.dl.earlier', { list: c.earlier.map((e) => t('neg.dstance.' + e.stance)).join(', ') }) : ''].filter(Boolean).join(' | ');
  const anyFilter = f.meeting || f.stance || f.deleg || f.withPos;
  return html`<div class="ndl">
    <div class="toolbar is-sm ndl-filters">
      <label class="field"><span class="field-label">${t('neg.dl.fMeeting')}</span><select id="mx-meeting" value=${f.meeting} onChange=${(e) => setF({ meeting: e.target.value })}>
        <option value="">${t('neg.dl.allMeetings')}</option>${meetings.map((m) => html`<option value=${m.id}>${meetingLabel(m)}</option>`)}</select></label>
      <label class="field"><span class="field-label">${t('neg.dl.fStance')}</span><select id="mx-stance" value=${f.stance} onChange=${(e) => setF({ stance: e.target.value })}>
        <option value="">${t('neg.syn.all')}</option>${DELEG_STANCES.map((s) => html`<option value=${s}>${t('neg.dstance.' + s)}</option>`)}</select></label>
      <label class="field"><span class="field-label">${t('neg.dl.fDeleg')}</span><select id="mx-deleg" value=${f.deleg} onChange=${(e) => setF({ deleg: e.target.value })}>
        <option value="">${t('neg.syn.all')}</option>${dels.filter((g) => used.has(g.id)).map((g) => html`<option value=${g.id}>${g.code} – ${delegName(g)}</option>`)}</select></label>
      <label class="check tool-group"><input type="checkbox" id="mx-withpos" checked=${f.withPos} onChange=${(e) => setF({ withPos: e.target.checked })} />${t('neg.dl.fWithPos')}</label>
      <div class="field"><span class="field-label" id="lbl-mxv">${t('neg.dl.fMode')}</span><${Seg} labelledby="lbl-mxv" size="sm" value=${f.mode} onChange=${(v) => setF({ mode: v })} options=${[{ value: 'sym', label: t('neg.dl.modeSym') }, { value: 'text', label: t('neg.dl.modeText') }]} /></div>
      ${anyFilter ? html`<button type="button" class="btn btn-tertiary btn-sm" onClick=${() => go({ po: f.mode === 'text' ? 'v:text' : null }, { replace: true })}><${Icon} name="close" />${t('neg.dl.resetFilters')}</button>` : null}
    </div>
    ${!nStances ? html`<div class="neg-empty"><p class="empty-title">${t('neg.dl.emptyTitle')}</p><p>${t('neg.dl.emptyText')}</p>
        <div class="neg-actions"><a class="btn btn-secondary" href="#/synopse" onClick=${(e) => { e.preventDefault(); go({ view: 'synopse', po: null, nkt: null }); }}><${Icon} name="columns" />${t('neg.dl.toSynopsis')}</a>
        <button type="button" class="btn btn-tertiary" onClick=${() => go({ nkt: 'meetings', po: null }, { replace: true })}><${Icon} name="calendar" />${t('neg.dl.toMeetings')}</button></div></div>`
    : html`
    <div class="ndl-kpi">
      <div class="nfigs ndl-figs" id="mx-sum">
        <div class="nfig"><span class="nfig-v">${data.rows.length}</span><span class="nfig-l">${t('neg.dl.kRows')}</span>${data.rows.length !== data.total ? html`<span class="nfig-s">${t('neg.dl.kRowsOf', { n: data.total })}</span>` : null}</div>
        <div class="nfig"><span class="nfig-v">${data.cols.length}</span><span class="nfig-l">${t('neg.dl.kDelegs')}</span></div>
        <div class="nfig"><span class="nfig-v">${Object.values(data.byStance).reduce((a, b) => a + b, 0)}</span><span class="nfig-l">${t('neg.dl.kStances')}</span></div>
        <div class="nfig" title=${t('neg.dl.kWithChSub')}><span class="nfig-v">${data.withCh}</span><span class="nfig-l">${t('neg.dl.kWithCh')}</span><span class="nfig-s">${t('neg.dl.kWithChSub')}</span></div>
      </div>
      <div class="ndl-dist">
        <div class="ndl-dist-col"><h2 class="nd-h">${t('neg.dl.byStance')}</h2>
          <div class="nkpi-row">${DELEG_STANCES.map((s) => html`<button type="button" class="ndist-btn" aria-pressed=${f.stance === s ? 'true' : 'false'} onClick=${() => setF({ stance: f.stance === s ? '' : s })}><${DStanceTag} stance=${s} /><span class="ndist-n">${data.byStance[s] || 0}</span></button>`)}</div></div>
        <div class="ndl-dist-col"><h2 class="nd-h">${t('neg.dl.allies')}</h2>
          ${data.allies.length ? html`<ol class="ndl-allies" id="mx-allies">${data.allies.slice(0, 12).map(([k, n]) => { const g = dels.find((x) => x.id === k) || { code: k }; return html`<li><button type="button" class="ndist-btn" title=${delegName(g)} onClick=${() => setF({ deleg: f.deleg === k ? '' : k })}><b>${g.code}</b><span class="ndist-n">${t('neg.dl.alliesN', { n })}</span></button></li>`; })}</ol>
            <p class="small muted">${t('neg.dl.alliesNote')}</p>` : html`<p class="small muted">${t('neg.dl.noAllies')}</p>`}</div>
      </div>
    </div>
    ${data.rows.length ? html`<div class="tbl-scroll ndl-mx-wrap" id="mx-scroll"><table class=${'ndl-mx' + (f.mode === 'text' ? ' is-text' : '')} id="mx-table">
      <thead><tr><th class="ndl-c-row" scope="col">${t('neg.syn.colRow')}</th><th class="ndl-c-ch" scope="col"><span title=${t('neg.dl.chTip')}>${t('neg.dl.colCh')}</span></th>
        ${data.cols.map((g) => html`<th scope="col" class=${'ndl-c-d' + (g.id === 'ch' ? ' is-ch' : '')} title=${delegName(g) + (isFict(g) ? ' – ' + t('neg.fict') : '')}><span class="ndl-code">${g.code}</span>${isFict(g) ? html`<span class="ndl-fmark" aria-hidden="true">*</span>` : null}</th>`)}</tr></thead>
      <tbody>${shown.map((r) => { const row = d.rows.find((x) => x.id === r.rowId); const p = d.positions[r.rowId]; return html`<tr id=${'mx-' + r.rowId}>
        <th scope="row" class="ndl-c-row"><button type="button" class="link ndl-rowlink" title=${rowLabel(row)} onClick=${() => openRow(r.rowId, 'deleg')}>${rowLabel(row)}</button><span class="rowid">${visibleRowId(r.rowId)}</span></th>
        <td class="ndl-c-ch">${hasPosition(p) ? html`<${StanceTag} stance=${p.stance} />` : html`<span class="muted">–</span>`}${r.allies.length ? html`<span class="ndl-ally" title=${t('neg.dl.allyTip', { list: r.allies.map((k) => (dels.find((x) => x.id === k) || { code: k }).code).join(', ') })}>${t('neg.dl.allyN', { n: r.allies.length })}</span>` : null}</td>
        ${data.cols.map((g) => { const c = r.cells[g.id]; return html`<td class=${'ndl-c-d' + (c && r.ch && c.stance === r.ch ? ' is-ally' : '')}>${c ? html`<span class="ndl-cell" title=${cellTitle(g, c)}><${DStanceTag} stance=${c.stance} compact=${f.mode !== 'text'} />${c.text ? (f.mode === 'text' ? html`<span class="ndl-txt uc">${c.text}</span>` : html`<span class="ndl-has" aria-hidden="true">•</span>`) : null}</span>` : null}</td>`; })}
      </tr>`; })}</tbody>
      <tfoot><tr><th scope="row" class="ndl-c-row">${t('neg.dl.sum')}</th><td class="ndl-c-ch"></td>${data.cols.map((g) => html`<td class="ndl-c-d ndl-sum">${DELEG_STANCES.filter((s) => (data.byDeleg[g.id] || {})[s]).map((s) => html`<span class="ndl-sum-i" title=${`${g.code}: ${t('neg.dstance.' + s)}`}><span aria-hidden="true">${DS_SYM[s]}</span>${(data.byDeleg[g.id] || {})[s]}<span class="sr"> ${t('neg.dstance.' + s)}</span></span>`)}</td>`)}</tr></tfoot>
    </table>${data.rows.length > limit ? html`<div class="syn-more" ref=${sentinel}><button type="button" class="btn btn-tertiary" onClick=${() => setLimit(limit + STEP * 3)}>${t('neg.syn.more', { n: data.rows.length - limit })}</button></div>` : null}</div>
    <p class="small muted ndl-legend">${t('neg.dl.legend')} ${DELEG_STANCES.map((s) => html`<span class="ndl-legend-i"><${DStanceTag} stance=${s} /></span>`)} <span class="ndl-legend-i"><span class="ndl-has" aria-hidden="true">•</span> ${t('neg.dl.hasText')}</span></p>`
    : html`<p class="muted">${t('neg.dl.noneFiltered')}</p>`}`}
  </div>`;
}

// ------------------------------------------------------------------ Formular: Haltungen erfassen (eine oder mehrere Delegationen)
export function StanceForm({ d, rowId, rowChoices, meetingId, idp = 'sf' }) {
  const dels = delegationsOf(d).filter((g) => !g.hidden);
  const meetings = meetingsByDate(d);
  const [f, setF] = useState({ stance: 'support', sel: [], meeting: meetingId !== undefined ? meetingId : latestMeeting(d), text: '', row: rowId || '' });
  const toggle = (id) => setF({ ...f, sel: f.sel.includes(id) ? f.sel.filter((x) => x !== id) : [...f.sel, id] });
  const target = rowId || f.row;
  const ok = target && f.sel.length;
  const save = (e) => {
    e.preventDefault();
    if (!ok) return;
    const codes = f.sel.map((id) => (dels.find((g) => g.id === id) || { code: id }).code).join(', ');
    mutate((x) => setStances(x, target, f.sel, { stance: f.stance, text: f.text.trim(), meeting: f.meeting || null }).dossier, t('neg.undo.stances', { n: f.sel.length }));
    toast(t('neg.dl.stancesSaved', { stance: t('neg.dstance.' + f.stance), list: codes }), 'success', 3000);
    setF({ ...f, sel: [], text: '' });
  };
  const groups = [['ms', dels.filter((g) => g.kind === 'ms')], ['institution', dels.filter((g) => g.kind === 'institution')], ['other', dels.filter((g) => g.kind === 'other')]].filter(([, l]) => l.length);
  return html`<form class="nform ndl-form" onSubmit=${save} aria-labelledby=${idp + '-h'}>
    <h3 class="nd-h" id=${idp + '-h'}>${t('neg.dl.formTitle')}</h3>
    ${rowChoices ? html`<label class="field field-wide"><span class="field-label">${t('neg.dl.row')}</span><select id=${idp + '-row'} value=${f.row} onChange=${(e) => setF({ ...f, row: e.target.value })}>
      <option value="">${t('neg.dl.chooseRow')}</option>${rowChoices.map((r) => html`<option value=${r.id}>${rowLabel(r)}</option>`)}</select></label>` : null}
    <div class="nform-row">
      <label class="field"><span class="field-label">${t('neg.dl.stance')}</span><select id=${idp + '-stance'} value=${f.stance} onChange=${(e) => setF({ ...f, stance: e.target.value })}>${DELEG_STANCES.map((s) => html`<option value=${s}>${t('neg.dstance.' + s)}</option>`)}</select></label>
      <label class="field nform-grow"><span class="field-label">${t('neg.dl.meeting')}</span><select id=${idp + '-meeting'} value=${f.meeting} onChange=${(e) => setF({ ...f, meeting: e.target.value })}>
        <option value="">${t('neg.dl.noMeeting')}</option>${meetings.map((m) => html`<option value=${m.id}>${meetingLabel(m)}</option>`)}</select></label>
    </div>
    <fieldset class="ndl-pick"><legend class="field-label">${t('neg.dl.delegsPick', { n: f.sel.length })}</legend>
      ${groups.map(([k, l]) => html`<div class="ndl-pick-g"><span class="tool-label">${t('neg.delegKind.' + k)}</span><div class="ndl-chips">${l.map((g) => html`<button type="button" class="ndg-chip" aria-pressed=${f.sel.includes(g.id) ? 'true' : 'false'} title=${delegName(g) + (isFict(g) ? ' – ' + t('neg.fict') : '')} id=${idp + '-g-' + g.id} onClick=${() => toggle(g.id)}>${g.code}</button>`)}</div></div>`)}
      ${f.sel.length ? html`<button type="button" class="btn btn-tertiary btn-sm ndl-clear" onClick=${() => setF({ ...f, sel: [] })}>${t('neg.dl.clearSel')}</button>` : null}
    </fieldset>
    <label class="field field-wide"><span class="field-label">${t('neg.dl.text')}</span><input type="text" id=${idp + '-text'} value=${f.text} onInput=${(e) => setF({ ...f, text: e.target.value })} placeholder=${t('neg.dl.textPh')} /></label>
    <div class="nform-actions"><button type="submit" class="btn btn-primary btn-sm" id=${idp + '-save'} disabled=${!ok}><${Icon} name="plus" />${t('neg.dl.saveStances', { n: f.sel.length })}</button>
      ${!target ? html`<span class="small muted">${t('neg.dl.needRow')}</span>` : !f.sel.length ? html`<span class="small muted">${t('neg.dl.needDeleg')}</span>` : null}</div>
  </form>`;
}

// ------------------------------------------------------------------ Formular: Intervention der Schweiz
export function InterventionForm({ d, rowId, rowChoices, meetingId, idp = 'if' }) {
  const meetings = meetingsByDate(d);
  const [f, setF] = useState({ meeting: meetingId !== undefined ? meetingId : latestMeeting(d), text: '', result: 'open', note: '', row: rowId || '' });
  const save = (e) => {
    e.preventDefault();
    if (!f.text.trim()) return;
    mutate((x) => addIntervention(x, { meeting: f.meeting || null, row: (rowId || f.row) || null, text: f.text.trim(), result: f.result, note: f.note.trim() }).dossier, t('neg.undo.intervention'));
    setF({ ...f, text: '', note: '', result: 'open' });
  };
  return html`<form class="nform ndl-form" onSubmit=${save} aria-labelledby=${idp + '-h'}>
    <h3 class="nd-h" id=${idp + '-h'}>${t('neg.iv.formTitle')}</h3>
    ${rowChoices ? html`<label class="field field-wide"><span class="field-label">${t('neg.dl.row')}</span><select id=${idp + '-row'} value=${f.row} onChange=${(e) => setF({ ...f, row: e.target.value })}>
      <option value="">${t('neg.iv.noRow')}</option>${rowChoices.map((r) => html`<option value=${r.id}>${rowLabel(r)}</option>`)}</select></label>` : null}
    <div class="nform-row">
      <label class="field nform-grow"><span class="field-label">${t('neg.dl.meeting')}</span><select id=${idp + '-meeting'} value=${f.meeting} onChange=${(e) => setF({ ...f, meeting: e.target.value })}>
        <option value="">${t('neg.dl.noMeeting')}</option>${meetings.map((m) => html`<option value=${m.id}>${meetingLabel(m)}</option>`)}</select></label>
      <label class="field"><span class="field-label">${t('neg.iv.result')}</span><select id=${idp + '-result'} value=${f.result} onChange=${(e) => setF({ ...f, result: e.target.value })}>${INTERVENTION_RESULTS.map((s) => html`<option value=${s}>${t('neg.ivres.' + s)}</option>`)}</select></label>
    </div>
    <label class="field field-wide"><span class="field-label">${t('neg.iv.text')}</span><textarea id=${idp + '-text'} rows="2" value=${f.text} onInput=${(e) => setF({ ...f, text: e.target.value })} placeholder=${t('neg.iv.textPh')}></textarea></label>
    <label class="field field-wide"><span class="field-label">${t('neg.iv.note')}</span><input type="text" id=${idp + '-note'} value=${f.note} onInput=${(e) => setF({ ...f, note: e.target.value })} /></label>
    <div class="nform-actions"><button type="submit" class="btn btn-primary btn-sm" id=${idp + '-save'} disabled=${!f.text.trim()}><${Icon} name="plus" />${t('neg.iv.save')}</button></div>
  </form>`;
}

/** Liste von Interventionen mit Wirkung (änderbar), Kürzel, Löschen. */
export function InterventionList({ d, list, showRow, showMeeting }) {
  const meetings = d.meetings || [];
  if (!list.length) return html`<p class="muted small">${t('neg.iv.none')}</p>`;
  return html`<ul class="niv-list">${list.map((x) => { const row = x.row && d.rows.find((r) => r.id === x.row); const m = x.meeting && meetings.find((y) => y.id === x.meeting); return html`<li class="niv-item" id=${'iv-' + x.id}>
    <div class="niv-head">${showRow ? (row ? html`<button type="button" class="link" onClick=${() => openRow(row.id, 'deleg')}>${rowLabel(row)}</button>` : html`<span class="muted">${t('neg.iv.noRow')}</span>`) : null}
      ${showMeeting ? html`<span class="muted">${m ? meetingLabel(m) : t('neg.dl.noMeeting')}</span>` : null}
      ${isFict(x) ? html`<${FictTag} />` : null}<span class="spacer"></span><span class="small muted">${fmtDateTime(x.at)}</span><${ByTag} by=${x.by} /></div>
    <p class="niv-text uc">${x.text}</p>
    ${x.note ? html`<p class="small muted uc">${x.note}</p>` : null}
    <div class="niv-tools">
      <label class="field field-row"><span class="field-label">${t('neg.iv.result')}</span><select aria-label=${t('neg.iv.result')} value=${x.result} onChange=${(e) => mutate((y) => updateIntervention(y, x.id, { result: e.target.value }), t('neg.undo.intervention'))}>${INTERVENTION_RESULTS.map((s) => html`<option value=${s}>${t('neg.ivres.' + s)}</option>`)}</select></label>
      <span class="spacer"></span>
      <button type="button" class="btn btn-danger-ghost is-bare btn-sm" title=${t('neg.iv.delete')} onClick=${async () => { if (await confirmDialog({ title: t('neg.iv.deleteTitle'), text: t('neg.iv.deleteText'), ok: t('neg.iv.delete'), danger: true })) mutate((y) => removeIntervention(y, x.id), t('neg.undo.ivDelete')); }}><${Icon} name="trash" />${t('neg.iv.delete')}</button>
    </div>
  </li>`; })}</ul>`;
}

// ------------------------------------------------------------------ Zeilendetail: Reiter «Delegationen»
export function RowDelegations({ d, row }) {
  const mx = stanceMatrix(d, { rows: [row.id] });
  const r = mx.rows[0];
  const dels = delegationsOf(d);
  const meetings = d.meetings || [];
  const list = r ? Object.entries(r.cells).map(([k, c]) => ({ g: dels.find((x) => x.id === k) || { id: k, code: k.toUpperCase() }, c })) : [];
  const ch = chStanceOf(d, row.id, r);
  const ivs = (d.interventions || []).filter((x) => x.row === row.id);
  return html`<div class="nd-sec ndl-row">
    <section class="nd-group" aria-labelledby="rd-st-h"><h3 class="nd-h" id="rd-st-h">${t('neg.dl.stancesHead', { n: list.length })}</h3>
      ${list.length ? html`<ul class="ndl-stances">${list.map(({ g, c }) => html`<li class=${'ndl-st' + (ch && c.stance === ch && g.id !== 'ch' ? ' is-ally' : '')}>
        <div class="ndl-st-head"><b class="ndl-st-code" title=${delegName(g)}>${g.code}</b><span class="ndl-st-name">${delegName(g)}</span>${isFict(g) ? html`<${FictTag} />` : null}<${DStanceTag} stance=${c.stance} />
          ${ch && c.stance === ch && g.id !== 'ch' ? html`<span class="ndl-ally">${t('neg.dl.sameAsCh')}</span>` : null}<span class="spacer"></span>
          <button type="button" class="btn-icon btn-sm is-bare btn-danger-ghost" title=${t('neg.dl.removeStance', { code: g.code })} aria-label=${t('neg.dl.removeStance', { code: g.code })} onClick=${() => mutate((y) => removeStance(y, row.id, c.id), t('neg.undo.stanceDelete', { code: g.code }))}><${Icon} name="trash" /></button></div>
        ${c.text ? html`<p class="ndl-st-text uc">${c.text}</p>` : null}
        <p class="small muted">${c.meeting ? meetingLabel(meetings.find((m) => m.id === c.meeting)) : t('neg.dl.noMeeting')} | ${fmtDateTime(c.at)} <${ByTag} by=${c.by} /></p>
        ${c.earlier.length ? html`<details class="ndl-earlier"><summary>${t('neg.dl.history', { n: c.earlier.length })}</summary><ol>${c.earlier.slice().reverse().map((e) => html`<li><${DStanceTag} stance=${e.stance} /> <span class="small muted">${e.meeting ? meetingLabel(meetings.find((m) => m.id === e.meeting)) : t('neg.dl.noMeeting')}</span>${e.text ? html` <span class="uc">${e.text}</span>` : null}
          <button type="button" class="btn-icon btn-sm is-bare btn-danger-ghost" title=${t('neg.dl.removeEarlier')} aria-label=${t('neg.dl.removeEarlier')} onClick=${() => mutate((y) => removeStance(y, row.id, e.id), t('neg.undo.stanceDelete', { code: g.code }))}><${Icon} name="trash" /></button></li>`)}</ol></details>` : null}
      </li>`)}</ul>` : html`<p class="muted small">${t('neg.dl.noStancesRow')}</p>`}
      <${StanceForm} key=${row.id} d=${d} rowId=${row.id} idp="rd-sf" />
    </section>
    <section class="nd-group" aria-labelledby="rd-iv-h"><h3 class="nd-h" id="rd-iv-h">${t('neg.iv.head', { n: ivs.length })}</h3>
      <${InterventionList} d=${d} list=${ivs} showMeeting />
      <${InterventionForm} key=${row.id} d=${d} rowId=${row.id} idp="rd-if" />
    </section>
  </div>`;
}

// ------------------------------------------------------------------ Sitzungen
const BODIES = ['neg.mt.bodyWP', 'neg.mt.bodyJHA', 'neg.mt.bodyCoreper', 'neg.mt.bodyMixed', 'neg.mt.bodyTrilogue'];
function MeetingForm({ d, m, onDone }) {
  const docs = docsByDate(d);
  const [f, setF] = useState(() => ({ date: (m && m.date) || todayIso(), body: (m && m.body) || '', title: (m && m.title) || '', docs: (m && m.docs) || [], note: (m && m.note) || '' }));
  const save = (e) => {
    e.preventDefault();
    if (!f.date && !f.title.trim() && !f.body.trim()) return;
    const v = { date: f.date || null, body: f.body.trim(), title: f.title.trim(), docs: f.docs, note: f.note.trim() };
    let id = m && m.id;
    if (m) mutate((x) => updateMeeting(x, m.id, v), t('neg.undo.meeting'));
    else mutate((x) => { const r = addMeeting(x, v); id = r.id; return r.dossier; }, t('neg.undo.meetingNew'));
    onDone(id);
  };
  return html`<form class="nnew nform" onSubmit=${save} aria-labelledby="mt-form-h">
    <h2 class="nd-h" id="mt-form-h">${m ? t('neg.mt.editTitle') : t('neg.mt.newTitle')}</h2>
    <div class="nform-row">
      <label class="field"><span class="field-label">${t('neg.mt.date')}</span><input type="date" id="mt-date" value=${f.date} onInput=${(e) => setF({ ...f, date: e.target.value })} /></label>
      <label class="field nform-grow"><span class="field-label">${t('neg.mt.body')}</span><input type="text" id="mt-body" list="mt-bodies" value=${f.body} onInput=${(e) => setF({ ...f, body: e.target.value })} placeholder=${t('neg.mt.bodyPh')} />
        <datalist id="mt-bodies">${BODIES.map((k) => html`<option value=${t(k)} />`)}</datalist></label>
    </div>
    <label class="field field-wide"><span class="field-label">${t('neg.mt.title')}</span><input type="text" id="mt-title" value=${f.title} onInput=${(e) => setF({ ...f, title: e.target.value })} placeholder=${t('neg.mt.titlePh')} /></label>
    ${docs.length ? html`<fieldset class="nfs ndl-docs"><legend class="field-label">${t('neg.mt.docs')}</legend>
      ${docs.slice().reverse().map((x) => html`<label class="check"><input type="checkbox" checked=${f.docs.includes(x.id)} onChange=${(e) => setF({ ...f, docs: e.target.checked ? [...f.docs, x.id] : f.docs.filter((y) => y !== x.id) })} />${docLabel(x)}</label>`)}</fieldset>` : null}
    <label class="field field-wide"><span class="field-label">${t('neg.mt.note')}</span><textarea id="mt-note" rows="2" value=${f.note} onInput=${(e) => setF({ ...f, note: e.target.value })}></textarea></label>
    <div class="nform-actions"><button type="submit" class="btn btn-primary" id="mt-save"><${Icon} name="check" />${m ? t('neg.mt.saveEdit') : t('neg.mt.create')}</button><button type="button" class="btn btn-tertiary" onClick=${() => onDone(null)}>${t('neg.common.cancel')}</button></div>
  </form>`;
}

function Meetings({ d, route }) {
  const [mid, mode] = String(route.po || '').split('~');
  const m = (d.meetings || []).find((x) => x.id === mid);
  const [form, setForm] = useState(false);
  if (m) return html`<${MeetingDetail} d=${d} m=${m} mode=${mode === 'post' ? 'post' : 'prep'} />`;
  const list = meetingsByDate(d).slice().reverse();
  const stCount = (id) => Object.values(d.stances || {}).flat().filter((s) => s.meeting === id).length;
  const ivCount = (id) => (d.interventions || []).filter((x) => x.meeting === id).length;
  const dm = docMap(d);
  return html`<div class="ndl">
    <div class="toolbar nd-toolbar is-sm"><button type="button" class="btn btn-primary" id="mt-new" aria-expanded=${form ? 'true' : 'false'} onClick=${() => setForm(!form)}><${Icon} name="plus" />${t('neg.mt.new')}</button></div>
    ${form ? html`<${MeetingForm} d=${d} onDone=${(id) => { setForm(false); if (id) go({ po: id }, { replace: true }); }} />` : null}
    ${list.length ? html`<div class="tbl-scroll"><table class="tbl-data nmt-list" id="mt-table">
      <thead><tr><th>${t('neg.mt.date')}</th><th>${t('neg.mt.body')}</th><th>${t('neg.mt.title')}</th><th>${t('neg.mt.docs')}</th><th class="num">${t('neg.mt.nStances')}</th><th class="num">${t('neg.mt.nIv')}</th><th><span class="sr">${t('neg.dossiers.colActions')}</span></th></tr></thead>
      <tbody>${list.map((x) => html`<tr>
        <td class="nw">${x.date ? fmtDate(x.date) : '–'}</td><td class="uc">${x.body}</td>
        <td><button type="button" class="link uc" onClick=${() => go({ po: x.id }, { replace: true })}>${x.title || t('neg.mt.untitled')}</button>${isFict(x) ? html` <${FictTag} />` : null}</td>
        <td class="small">${(x.docs || []).map((id) => docLabel(dm.get(id), { date: false }) || id).join('; ') || '–'}</td>
        <td class="num">${stCount(x.id)}</td><td class="num">${ivCount(x.id)}</td>
        <td class="nlist-act"><button type="button" class="btn btn-secondary btn-sm" onClick=${() => go({ po: x.id }, { replace: true })}>${t('neg.mt.prepare')}</button>
          <button type="button" class="btn btn-tertiary btn-sm" onClick=${() => go({ po: x.id + '~post' }, { replace: true })}>${t('neg.mt.followUp')}</button></td>
      </tr>`)}</tbody></table></div>`
    : !form ? html`<div class="neg-empty"><p class="empty-title">${t('neg.mt.emptyTitle')}</p><p>${t('neg.mt.emptyText')}</p>
        <div class="neg-actions"><button type="button" class="btn btn-secondary" onClick=${() => setForm(true)}><${Icon} name="plus" />${t('neg.mt.new')}</button></div></div>` : null}
  </div>`;
}

/** Zeilen, die in einer Sitzung anstehen: Zeilen mit CH-Position oder geändert in den behandelten Fassungen. */
export function agendaRows(d, m) {
  const changed = new Map();
  const created = new Map(d.rows.map((r) => [r.id, r.createdBy]));
  for (const docId of m.docs || []) {
    const doc = d.documents.find((x) => x.id === docId);
    for (const tr of (doc && doc.tracks) || []) {
      let list = [];
      try { list = changesBetween(d, null, docId, tr, { clean: true }); } catch { list = []; }
      for (const c of list) if (c.change === 'changed' || (c.change === 'new' && created.get(c.row) !== docId)) changed.set(c.row, [...(changed.get(c.row) || []), tr]);
    }
  }
  const inMeeting = new Set();
  for (const [rid, l] of Object.entries(d.stances || {})) if (l.some((s) => s.meeting === m.id)) inMeeting.add(rid);
  for (const x of d.interventions || []) if (x.meeting === m.id && x.row) inMeeting.add(x.row);
  return sortedRows(d).filter((r) => hasPosition(d.positions[r.id]) || changed.has(r.id) || inMeeting.has(r.id)).map((r) => ({ row: r, pos: d.positions[r.id], changed: changed.get(r.id) || null, inMeeting: inMeeting.has(r.id) }));
}

function MeetingDetail({ d, m, mode }) {
  const [edit, setEdit] = useState(false);
  const [scope, setScope] = useState('pos');
  const [lang, setLang] = useState(uiLang());
  const agenda = useMemo(() => agendaRows(d, m), [d, m]);
  const shown = agenda.filter((x) => (scope === 'pos' ? hasPosition(x.pos) : scope === 'changed' ? !!x.changed : true));
  const dm = docMap(d);
  const ivs = (d.interventions || []).filter((x) => x.meeting === m.id);
  const stanceRows = Object.entries(d.stances || {}).map(([rid, l]) => ({ rid, l: l.filter((s) => s.meeting === m.id) })).filter((x) => x.l.length);
  const dels = delegationsOf(d);
  const choices = agenda.map((x) => x.row);
  const word = () => {
    try { downloadDocx(buildPositionDocx(d, { variant: 'meeting', lang, meetingId: m.id }), `${t('neg.mt.fileReport')}_${(d.short || d.id).replace(/[^A-Za-z0-9]+/g, '-')}_${m.date || todayIso()}.docx`); toast(t('neg.out.done'), 'success', 3000); }
    catch (e) { console.error(e); toast(t('neg.out.failed', { msg: e.message }), 'error'); }
  };
  const del = async () => {
    if (!(await confirmDialog({ title: t('neg.mt.deleteTitle'), text: t('neg.mt.deleteText', { name: meetingLabel(m) }), ok: t('neg.mt.delete'), danger: true }))) return;
    mutate((x) => removeMeeting(x, m.id), t('neg.undo.meetingDelete'));
    go({ po: null }, { replace: true });
  };
  return html`<div class="ndl nmt">
    <div class="nmt-head">
      <button type="button" class="btn btn-tertiary btn-sm" onClick=${() => go({ po: null }, { replace: true })}><${Icon} name="arrow-left" />${t('neg.mt.all')}</button>
      <div class="nmt-title"><p class="unit-label">${[m.date ? fmtDate(m.date) : '', m.body].filter(Boolean).join(' | ')}</p><h2 class="nsec-h uc" id="mt-h">${m.title || t('neg.mt.untitled')}${isFict(m) ? html`<${FictTag} />` : null}</h2>
        ${(m.docs || []).length ? html`<p class="small">${t('neg.mt.docs')}: ${(m.docs || []).map((id) => docLabel(dm.get(id)) || id).join('; ')}</p>` : null}
        ${m.note ? html`<p class="small muted uc">${m.note}</p>` : null}</div>
      <div class="nmt-tools"><button type="button" class="btn btn-tertiary btn-sm" id="mt-edit" aria-expanded=${edit ? 'true' : 'false'} onClick=${() => setEdit(!edit)}><${Icon} name="edit" />${t('neg.mt.edit')}</button>
        <button type="button" class="btn btn-danger-ghost is-bare btn-sm" onClick=${del}><${Icon} name="trash" />${t('neg.mt.delete')}</button></div>
    </div>
    ${edit ? html`<${MeetingForm} d=${d} m=${m} onDone=${() => setEdit(false)} />` : null}
    <div class="ndl-sub"><${Seg} label=${t('neg.mt.phase')} value=${mode} onChange=${(v) => go({ po: m.id + (v === 'post' ? '~post' : '') }, { replace: true })} options=${[{ value: 'prep', label: t('neg.mt.prep') }, { value: 'post', label: t('neg.mt.post', { n: ivs.length + stanceRows.reduce((n, x) => n + x.l.length, 0) }) }]} /></div>
    ${mode === 'prep' ? html`<section class="nmt-sec" aria-labelledby="mt-prep-h">
      <h3 class="nd-h" id="mt-prep-h">${t('neg.mt.agenda', { n: shown.length })}</h3>
      <p class="small muted nmax">${t('neg.mt.agendaText')}</p>
      <div class="toolbar is-sm"><div class="field"><span class="field-label" id="lbl-mts">${t('neg.mt.scope')}</span><${Seg} labelledby="lbl-mts" size="sm" value=${scope} onChange=${setScope} options=${[
        { value: 'pos', label: t('neg.mt.scopePos', { n: agenda.filter((x) => hasPosition(x.pos)).length }) }, { value: 'changed', label: t('neg.mt.scopeChanged', { n: agenda.filter((x) => x.changed).length }) }, { value: 'all', label: t('neg.mt.scopeAll', { n: agenda.length }) }]} /></div></div>
      ${shown.length ? html`<div class="tbl-scroll"><table class="tbl-data nmt-agenda" id="mt-agenda">
        <thead><tr><th>${t('neg.syn.colRow')}</th><th>${t('neg.mt.colChange')}</th><th>${t('neg.syn.colPos')}</th><th>${t('neg.mt.colStances')}</th></tr></thead>
        <tbody>${shown.slice(0, 200).map((x) => { const st = ((d.stances || {})[x.row.id] || []); return html`<tr>
          <td class="npos-row"><button type="button" class="link" onClick=${() => openRow(x.row.id, 'position')}>${rowLabel(x.row)}</button><span class="nlist-sub">${visibleRowId(x.row.id)}</span><${StatusBadge} status=${statusOf(d, x.row.id)} /></td>
          <td class="small">${x.changed ? html`<span class="chg nchg-changed">${t('neg.mt.changedIn', { list: [...new Set(x.changed)].map((tid) => trackName(d, tid)).join(', ') })}</span>` : html`<span class="muted">${t('neg.mt.unchanged')}</span>`}</td>
          <td class="npos-text">${hasPosition(x.pos) ? html`<div class="nd-tags"><${StanceTag} stance=${x.pos.stance} /><${PriorityTag} priority=${x.pos.priority} /></div>${x.pos.text ? html`<span class="clamp3 uc" title=${x.pos.text}>${x.pos.text}</span>` : null}` : html`<span class="muted">–</span>`}</td>
          <td class="small">${st.length ? html`<span class="ndl-mini">${st.slice(-6).map((s) => html`<span title=${(dels.find((g) => g.id === s.deleg) || { code: s.deleg }).code + ': ' + t('neg.dstance.' + s.stance)}><b>${(dels.find((g) => g.id === s.deleg) || { code: s.deleg }).code}</b> <${DStanceTag} stance=${s.stance} compact /></span>`)}</span>` : html`<span class="muted">–</span>`}</td>
        </tr>`; })}</tbody></table></div>` : html`<p class="muted">${t('neg.mt.agendaNone')}</p>`}
    </section>` : html`<section class="nmt-sec" aria-labelledby="mt-post-h">
      <h3 class="nd-h" id="mt-post-h">${t('neg.iv.head', { n: ivs.length })}</h3>
      <${InterventionList} d=${d} list=${ivs} showRow />
      <div class="nmt-forms">
        <${InterventionForm} key=${'iv' + m.id} d=${d} meetingId=${m.id} rowChoices=${choices} idp="mt-if" />
        <${StanceForm} key=${'st' + m.id} d=${d} meetingId=${m.id} rowChoices=${choices} idp="mt-sf" />
      </div>
      <h3 class="nd-h nmt-sth">${t('neg.mt.stancesIn', { n: stanceRows.reduce((n, x) => n + x.l.length, 0) })}</h3>
      ${stanceRows.length ? html`<ul class="nmt-stances">${stanceRows.map(({ rid, l }) => { const row = d.rows.find((r) => r.id === rid); return html`<li><button type="button" class="link" onClick=${() => openRow(rid, 'deleg')}>${rowLabel(row)}</button>
        <span class="ndl-mini">${l.map((s) => { const g = dels.find((x) => x.id === s.deleg) || { code: s.deleg }; return html`<span title=${delegName(g) + (s.text ? ': ' + s.text : '')}><b>${g.code}</b> <${DStanceTag} stance=${s.stance} /></span>`; })}</span></li>`; })}</ul>` : html`<p class="muted small">${t('neg.mt.noStancesIn')}</p>`}
    </section>`}
    <section class="nsec nout" aria-labelledby="mt-out-h">
      <h3 class="nd-h" id="mt-out-h">${t('neg.mt.report')}</h3>
      <p class="small muted nmax">${t('neg.mt.reportText')}</p>
      <div class="toolbar is-sm"><div class="field"><span class="field-label" id="lbl-mtl">${t('neg.out.lang')}</span><${Seg} labelledby="lbl-mtl" value=${lang} onChange=${setLang} options=${[{ value: 'de', label: 'DE', title: t('lang.uiName.de') }, { value: 'fr', label: 'FR', title: t('lang.uiName.fr') }]} /></div></div>
      <div class="neg-actions"><button type="button" class="btn btn-primary" id="mt-word" onClick=${word}><${Icon} name="download" />${t('neg.out.word')}</button>
        <button type="button" class="btn btn-tertiary" id="mt-print" onClick=${() => go({ view: 'druck', pv: 'meeting', po: [m.id, lang].join('~') })}><${Icon} name="print" />${t('neg.out.print')}</button></div>
    </section>
  </div>`;
}

// ------------------------------------------------------------------ Delegationen verwalten
function DelegAdmin({ d }) {
  const dels = delegationsOf(d);
  const [f, setF] = useState({ code: '', name: '', kind: 'other' });
  const count = (id) => Object.values(d.stances || {}).flat().filter((s) => s.deleg === id).length;
  const add = (e) => {
    e.preventDefault();
    const code = f.code.trim();
    if (!code) return;
    if (dels.some((g) => g.code.toLowerCase() === code.toLowerCase() || g.id === code.toLowerCase())) { toast(t('neg.deleg.exists', { code }), 'warning'); return; }
    mutate((x) => addDelegation(ensureDelegations(x), { kind: f.kind, code: code.toUpperCase(), name: f.name.trim() || code }).dossier, t('neg.undo.delegAdd', { code }));
    setF({ code: '', name: '', kind: 'other' });
  };
  const setHidden = (g, hidden) => mutate((x) => updateDelegation(ensureDelegations(x), g.id, { hidden }), t('neg.undo.delegHide', { code: g.code }));
  const remove = async (g) => {
    const n = count(g.id);
    if (!(await confirmDialog({ title: t('neg.deleg.removeTitle'), text: n ? t('neg.deleg.removeTextN', { code: g.code, n }) : t('neg.deleg.removeText', { code: g.code }), ok: t('neg.deleg.remove'), danger: true }))) return;
    mutate((x) => removeDelegation(ensureDelegations(x), g.id), t('neg.undo.delegRemove', { code: g.code }));
  };
  return html`<div class="ndl">
    <p class="small nmax">${t('neg.deleg.intro')}</p>
    ${!Array.isArray(d.delegations) ? html`<p class="small muted nmax">${t('neg.deleg.defaults')}</p>` : null}
    <form class="nnew nform ndl-add" onSubmit=${add} aria-labelledby="dg-add-h">
      <h2 class="nd-h" id="dg-add-h">${t('neg.deleg.addTitle')}</h2>
      <div class="nform-row">
        <label class="field"><span class="field-label">${t('neg.deleg.code')}</span><input type="text" id="dg-code" size="8" maxlength="12" value=${f.code} onInput=${(e) => setF({ ...f, code: e.target.value })} placeholder="CY" /></label>
        <label class="field nform-grow"><span class="field-label">${t('neg.deleg.name')}</span><input type="text" id="dg-name" value=${f.name} onInput=${(e) => setF({ ...f, name: e.target.value })} placeholder=${t('neg.deleg.namePh')} /></label>
        <label class="field"><span class="field-label">${t('neg.deleg.kind')}</span><select id="dg-kind" value=${f.kind} onChange=${(e) => setF({ ...f, kind: e.target.value })}>${DELEG_KINDS.map((k) => html`<option value=${k}>${t('neg.delegKind.' + k)}</option>`)}</select></label>
        <button type="submit" class="btn btn-primary nform-btn" id="dg-add" disabled=${!f.code.trim()}><${Icon} name="plus" />${t('neg.deleg.add')}</button>
      </div>
    </form>
    <div class="tbl-scroll"><table class="tbl-data ndl-admin" id="dg-table">
      <thead><tr><th>${t('neg.deleg.code')}</th><th>${t('neg.deleg.name')}</th><th>${t('neg.deleg.kind')}</th><th class="num">${t('neg.mt.nStances')}</th><th>${t('neg.deleg.visible')}</th><th><span class="sr">${t('neg.dossiers.colActions')}</span></th></tr></thead>
      <tbody>${dels.map((g) => html`<tr class=${g.hidden ? 'is-hidden' : ''}>
        <td><b>${g.code}</b></td><td>${delegName(g)}${isFict(g) ? html` <${FictTag} />` : null}</td><td>${t('neg.delegKind.' + g.kind)}</td><td class="num">${count(g.id)}</td>
        <td><label class="check"><input type="checkbox" checked=${!g.hidden} onChange=${(e) => setHidden(g, !e.target.checked)} aria-label=${t('neg.deleg.visibleOf', { code: g.code })} />${g.hidden ? t('neg.deleg.hidden') : t('neg.deleg.shown')}</label></td>
        <td class="nlist-act"><button type="button" class="btn-icon is-bare btn-danger-ghost" title=${t('neg.deleg.removeOf', { code: g.code })} aria-label=${t('neg.deleg.removeOf', { code: g.code })} onClick=${() => remove(g)}><${Icon} name="trash" /></button></td>
      </tr>`)}</tbody></table></div>
  </div>`;
}
