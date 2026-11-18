// Bilanz der Anliegen der Schweiz (Etappe 3, SPEC3 §3.7): je Zeile mit CH-Position das Ergebnis; maschineller Vorschlag (suggestOutcome)
// immer als «Vorschlag (nicht bestätigt)» mit Begründung und Wort-Diff Textvorschlag ↔ jüngster Kompromisstext; Bestätigen/Ändern mit Notiz
// (setOutcome), Statistik (balance), Word (Variante "balance", DE/FR) und Druckansicht.
import { html } from 'htm/preact';
import { useMemo, useState } from 'preact/hooks';
import { t, uiLang } from '../../lib/i18n.js';
import { go } from '../../state.js';
import { Icon, Seg } from '../../ui/common.js';
import { toast } from '../../app.js';
import { escapeHtml, todayIso } from '../../lib/format.js';
import { OUTCOMES, PRIORITIES, INTERVENTION_RESULTS, balance, setOutcome, clearOutcome, latestCompromiseCell, compareCells, visibleRowId, buildPositionDocx, docMap, cellFor, hasPosition, sanitizeInline } from './core.js';
import { mutate } from './store.js';
import { StanceTag, PriorityTag, Figures, docLabel, fmtDateTime } from './ui.js';
import { ensureBy, ByTag } from './by.js';
import { IvTag } from './deleg.js';
import { openRow } from './detail.js';
import { downloadDocx } from './consultation.js';

const OUT_SYM = { achieved: '✓', partly: '±', not: '✕', open: '…', obsolete: '–', unset: '○' };
export function OutcomeTag({ status }) {
  const s = status || 'unset';
  return html`<span class=${'nout-t no-' + s}><span class="nout-sym" aria-hidden="true">${OUT_SYM[s]}</span>${t('neg.outcome.' + s)}</span>`;
}
const fileSafe = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
export function balanceWord(d, lang) {
  try { downloadDocx(buildPositionDocx(d, { variant: 'balance', lang }), `${t('neg.bal.file')}_${fileSafe(d.short || d.procedure || d.id)}_${todayIso()}.docx`); toast(t('neg.out.done'), 'success', 3000); }
  catch (e) { console.error(e); toast(t('neg.out.failed', { msg: e.message }), 'error'); }
}

export function Balance({ d }) {
  const b = useMemo(() => balance(d), [d]);
  const [filter, setFilter] = useState('all');
  const [lang, setLang] = useState(uiLang());
  const [limit, setLimit] = useState(100);
  const rows = b.rows.filter((r) => (filter === 'unset' ? !r.outcome : filter === 'confirmed' ? !!r.outcome : filter === 'suggested' ? !r.outcome && r.suggestion && r.suggestion.compared : true));
  const bo = b.byOutcome;
  const share = b.achievedShare === null ? '–' : `${Math.round(b.achievedShare * 100)} %`;
  return html`<div class="nbal">
    <${Figures} items=${[
      { v: b.total, label: t('neg.bal.fTotal'), sub: t('neg.bal.fTotalSub') },
      { v: bo.achieved + bo.partly, label: t('neg.bal.fAchieved'), sub: t('neg.bal.fAchievedSub', { a: bo.achieved, p: bo.partly }) },
      { v: bo.not, label: t('neg.outcome.not'), warn: bo.not > 0 },
      { v: share, label: t('neg.bal.fShare'), sub: t('neg.bal.fShareSub', { n: bo.unset }) },
    ]} />
    <div class="nbal-stats">
      <table class="tbl-data nbal-mini" id="bal-outcomes"><caption class="nd-h">${t('neg.bal.byOutcome')}</caption><tbody>
        ${[...OUTCOMES, 'unset'].map((s) => html`<tr><td><${OutcomeTag} status=${s} /></td><td class="num">${bo[s] || 0}</td></tr>`)}</tbody></table>
      <div class="tbl-scroll nbal-scroll"><table class="tbl-data nbal-mini"><caption class="nd-h">${t('neg.bal.byPriority')}</caption>
        <thead><tr><th>${t('neg.pos.priority')}</th>${['achieved', 'partly', 'not', 'unset'].map((s) => html`<th class="num" title=${t('neg.outcome.' + s)}><span aria-hidden="true">${OUT_SYM[s]}</span><span class="sr">${t('neg.outcome.' + s)}</span></th>`)}<th class="num">${t('neg.bal.other')}</th></tr></thead>
        <tbody>${PRIORITIES.filter((p) => b.byPriority[p]).map((p) => { const x = b.byPriority[p]; return html`<tr><td><${PriorityTag} priority=${p} /></td>${['achieved', 'partly', 'not', 'unset'].map((s) => html`<td class="num">${x[s] || 0}</td>`)}<td class="num">${(x.open || 0) + (x.obsolete || 0)}</td></tr>`; })}</tbody></table></div>
      <table class="tbl-data nbal-mini"><caption class="nd-h">${t('neg.bal.interventions', { n: b.interventions.total })}</caption><tbody>
        ${INTERVENTION_RESULTS.map((s) => html`<tr><td><${IvTag} result=${s} /></td><td class="num">${b.interventions.byResult[s] || 0}</td></tr>`)}</tbody></table>
    </div>
    <div class="toolbar is-sm nbal-tools">
      <div class="field"><span class="field-label" id="lbl-balf">${t('neg.bal.show')}</span><${Seg} labelledby="lbl-balf" size="sm" value=${filter} onChange=${setFilter} options=${[
        { value: 'all', label: t('neg.bal.fAll', { n: b.rows.length }) }, { value: 'unset', label: t('neg.bal.fUnset', { n: b.rows.filter((r) => !r.outcome).length }) },
        { value: 'confirmed', label: t('neg.bal.fConfirmed', { n: b.rows.filter((r) => r.outcome).length }) }]} /></div>
    </div>
    <p class="small muted nmax">${t('neg.bal.hint')}</p>
    ${rows.length ? html`<ol class="nbal-list" id="bal-list">${rows.slice(0, limit).map((r) => html`<${BalRow} key=${r.rowId} d=${d} r=${r} />`)}</ol>
      ${rows.length > limit ? html`<div class="syn-more"><button type="button" class="btn btn-tertiary" onClick=${() => setLimit(limit + 200)}>${t('neg.syn.more', { n: rows.length - limit })}</button></div>` : null}`
      : html`<div class="neg-empty"><p class="empty-title">${b.rows.length ? t('neg.bal.noneFiltered') : t('neg.bal.emptyTitle')}</p><p>${b.rows.length ? '' : t('neg.bal.emptyText')}</p></div>`}
    <section class="nsec nout" aria-labelledby="bal-out-h">
      <h2 class="nsec-h" id="bal-out-h">${t('neg.bal.outHead')}</h2>
      <p class="small muted nmax">${t('neg.bal.outText')}</p>
      <div class="toolbar is-sm"><div class="field"><span class="field-label" id="lbl-ball">${t('neg.out.lang')}</span><${Seg} labelledby="lbl-ball" value=${lang} onChange=${setLang} options=${[{ value: 'de', label: 'DE', title: t('lang.uiName.de') }, { value: 'fr', label: 'FR', title: t('lang.uiName.fr') }]} /></div></div>
      <div class="neg-actions"><button type="button" class="btn btn-primary" id="bal-word" onClick=${() => balanceWord(d, lang)}><${Icon} name="download" />${t('neg.out.word')}</button>
        <button type="button" class="btn btn-tertiary" id="bal-print" onClick=${() => go({ view: 'druck', pv: 'balance', po: lang })}><${Icon} name="print" />${t('neg.out.print')}</button></div>
    </section>
  </div>`;
}

function BalRow({ d, r }) {
  const [edit, setEdit] = useState(null);
  const p = d.positions[r.rowId] || {};
  const s = r.suggestion;
  const dm = docMap(d);
  const row = d.rows.find((x) => x.id === r.rowId);
  const vid = visibleRowId(r.rowId);
  const confirm = async (status, note, doc) => {
    await ensureBy();
    mutate((x) => setOutcome(x, r.rowId, { status, note: note || '', doc: doc || null }), t('neg.undo.outcome', { id: vid }));
    setEdit(null);
  };
  const comp = latestCompromiseCell(d, r.rowId);
  const lastDoc = (comp && comp.doc) || (s && s.compared && s.compared.doc) || null;
  const basisCell = p.basis ? cellFor(d, r.rowId, p.basis.track, p.basis.doc) : null;
  const diff = p.proposal && comp ? compareCells(escapeHtml(p.proposal), comp.html || '', { clean: true }) : null;
  const reason = s && s.reason ? (s.reason[uiLang()] || s.reason.de) : '';
  return html`<li class=${'nbal-row' + (r.outcome ? ' is-confirmed' : '')} id=${'bal-' + r.rowId}>
    <div class="nbal-head"><button type="button" class="link nbal-label" onClick=${() => openRow(r.rowId, 'position')}>${r.num ? r.num + ' | ' : ''}${r.label}</button><span class="rowid">${vid}</span>
      <span class="nd-tags"><${StanceTag} stance=${r.stance} />${hasPosition(p) ? html`<${PriorityTag} priority=${r.priority} />` : null}</span></div>
    ${r.text ? html`<p class="nbal-text uc clamp3" title=${r.text}>${r.text}</p>` : null}
    ${r.proposal ? html`<p class="nbal-prop small"><span class="field-label">${t('neg.pos.proposalShort')}</span> <span lang="en" class="legal">${r.proposal}</span></p>` : null}
    <div class="nbal-res">
      ${r.outcome ? html`<div class="nbal-conf"><span class="field-label">${t('neg.bal.outcome')}</span><${OutcomeTag} status=${r.outcome.status} />
          <span class="small muted">${fmtDateTime(r.outcome.at)}</span><${ByTag} by=${r.outcome.by} />${r.outcome.doc && dm.get(r.outcome.doc) ? html`<span class="small muted">${t('neg.bal.refDoc', { doc: docLabel(dm.get(r.outcome.doc), { date: false }) })}</span>` : null}
          ${r.outcome.note ? html`<p class="small uc nbal-note">${r.outcome.note}</p>` : null}</div>`
      : s ? html`<div class="nbal-sugg" role="note"><span class="nbal-sugg-l">${t('neg.suggestion')}</span><${OutcomeTag} status=${s.status} /><span class="small muted">${t('neg.bal.conf.' + s.confidence)}</span>
          <p class="small nbal-reason">${reason}</p></div>` : null}
      <div class="nbal-acts">
        ${!r.outcome && s && !edit ? html`<button type="button" class="btn btn-secondary btn-sm" id=${'bal-ok-' + r.rowId} onClick=${() => confirm(s.status, '', lastDoc)}><${Icon} name="check" />${t('neg.bal.confirm', { s: t('neg.outcome.' + s.status) })}</button>` : null}
        ${!edit ? html`<button type="button" class="btn btn-tertiary btn-sm" id=${'bal-edit-' + r.rowId} onClick=${() => setEdit({ status: (r.outcome && r.outcome.status) || (s && s.status) || 'open', note: (r.outcome && r.outcome.note) || '' })}><${Icon} name="edit" />${r.outcome ? t('neg.bal.change') : t('neg.bal.set')}</button>` : null}
        ${r.outcome && !edit ? html`<button type="button" class="btn btn-tertiary btn-sm" onClick=${() => mutate((x) => clearOutcome(x, r.rowId), t('neg.undo.outcome', { id: vid }))}><${Icon} name="undo" />${t('neg.bal.clear')}</button>` : null}
      </div>
    </div>
    ${edit ? html`<form class="nform nbal-edit" onSubmit=${(e) => { e.preventDefault(); confirm(edit.status, edit.note.trim(), lastDoc); }}>
      <div class="nform-row">
        <label class="field"><span class="field-label">${t('neg.bal.outcome')}</span><select id=${'bal-st-' + r.rowId} value=${edit.status} onChange=${(e) => setEdit({ ...edit, status: e.target.value })}>${OUTCOMES.map((x) => html`<option value=${x}>${t('neg.outcome.' + x)}</option>`)}</select></label>
        <label class="field nform-grow"><span class="field-label">${t('neg.bal.note')}</span><input type="text" id=${'bal-note-' + r.rowId} value=${edit.note} onInput=${(e) => setEdit({ ...edit, note: e.target.value })} placeholder=${t('neg.bal.notePh')} /></label>
      </div>
      <div class="nform-actions"><button type="submit" class="btn btn-primary btn-sm" id=${'bal-save-' + r.rowId}><${Icon} name="check" />${t('neg.bal.save')}</button><button type="button" class="btn btn-tertiary btn-sm" onClick=${() => setEdit(null)}>${t('neg.common.cancel')}</button></div>
    </form>` : null}
    ${diff || (comp && !p.proposal) ? html`<details class="nbal-cmp"><summary>${diff ? t('neg.bal.diffHead', { doc: docLabel(dm.get(comp.doc), { date: false }) }) : t('neg.bal.compHead', { doc: docLabel(dm.get(comp.doc), { date: false }) })}</summary>
      ${diff ? html`<p class="small muted">${t('neg.bal.diffLegend')}</p><div class="ncell legal nbal-diff" lang="en" dangerouslySetInnerHTML=${{ __html: diff.redline }}></div>`
        : html`${basisCell && !basisCell.empty ? html`<p class="small muted">${t('neg.bal.compLegend', { doc: docLabel(dm.get(basisCell.doc), { date: false }) })}</p><div class="ncell legal nbal-diff" lang="en" dangerouslySetInnerHTML=${{ __html: compareCells(basisCell.html, comp.html, { clean: true }).redline }}></div>` : html`<div class="ncell legal nbal-diff" lang="en" dangerouslySetInnerHTML=${{ __html: sanitizeInline(comp.html || '') }}></div>`}`}
    </details>` : null}
    ${r.interventions.length ? html`<p class="small nbal-iv">${t('neg.bal.ivN', { n: r.interventions.length })} ${r.interventions.map((x) => html`<${IvTag} result=${x.result} />`)}</p>` : null}
    ${row ? null : null}
  </li>`;
}
