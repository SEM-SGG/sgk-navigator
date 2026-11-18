// Druckansichten Etappe 3: Bilanz der Anliegen der Schweiz und Sitzungsbericht (PDF über den Browserdruck, durchsuchbarer Text).
import { html } from 'htm/preact';
import { t, uiLang } from '../../lib/i18n.js';
import { fmtDate } from '../../lib/format.js';
import { OUTCOMES, PRIORITIES, INTERVENTION_RESULTS, balance, meetingsByDate, delegationsOf, stanceMatrix, visibleRowId, docMap, hasPosition } from './core.js';
import { StanceTag, PriorityTag, docLabel, fmtDateTime } from './ui.js';
import { OutcomeTag } from './balance.js';
import { DStanceTag, IvTag, delegName, meetingLabel } from './deleg.js';

export function BalanceSheet({ d, cls, Head, PosCell }) {
  const b = balance(d);
  const bo = b.byOutcome;
  return html`<article class="np">
    <${Head} d=${d} cls=${cls} title=${t('neg.bal.printTitle', { title: d.short || d.title })} meta=${[[t('neg.bal.fTotal'), String(b.total)], [t('neg.bal.fShare'), b.achievedShare === null ? '–' : `${Math.round(b.achievedShare * 100)} %`]]} />
    <section class="np-sec np-over"><h2>${t('neg.print.overview')}</h2>
      <div class="np-stats">
        <table class="np-mini"><caption>${t('neg.bal.byOutcome')}</caption><tbody>${[...OUTCOMES, 'unset'].map((s) => html`<tr><td><${OutcomeTag} status=${s} /></td><td class="num">${bo[s] || 0}</td></tr>`)}</tbody></table>
        <table class="np-mini"><caption>${t('neg.bal.byPriority')}</caption><tbody>${PRIORITIES.filter((p) => b.byPriority[p]).map((p) => html`<tr><td><${PriorityTag} priority=${p} /></td><td>${OUTCOMES.concat('unset').filter((s) => b.byPriority[p][s]).map((s) => `${t('neg.outcome.' + s)} ${b.byPriority[p][s]}`).join(', ')}</td></tr>`)}</tbody></table>
        <table class="np-mini"><caption>${t('neg.bal.interventions', { n: b.interventions.total })}</caption><tbody>${INTERVENTION_RESULTS.map((s) => html`<tr><td><${IvTag} result=${s} /></td><td class="num">${b.interventions.byResult[s] || 0}</td></tr>`)}</tbody></table>
      </div>
      <p class="np-legend">${t('neg.bal.printNote')}</p>
    </section>
    <section class="np-sec"><h2>${t('neg.bal.printRows', { n: b.rows.length })}</h2>
      ${b.rows.length ? html`<table class="np-tbl"><thead><tr><th class="np-c-lab">${t('neg.print.colLabel')}</th><th class="np-c-pos">${t('neg.print.colPos')}</th><th>${t('neg.bal.outcome')}</th></tr></thead>
        <tbody>${b.rows.map((r) => html`<tr><td class="np-c-lab">${r.num ? r.num + ' | ' : ''}${r.label}<span class="rowid">${visibleRowId(r.rowId)}</span></td>
          <td class="np-c-pos"><${PosCell} p=${d.positions[r.rowId]} /></td>
          <td>${r.outcome ? html`<div><${OutcomeTag} status=${r.outcome.status} />${r.outcome.by ? html` <span class="np-sub">(${r.outcome.by})</span>` : null}</div>${r.outcome.note ? html`<p>${r.outcome.note}</p>` : null}`
            : r.suggestion ? html`<div class="np-sugg"><i>${t('neg.suggestion')}:</i> <${OutcomeTag} status=${r.suggestion.status} /><p class="np-sub"><i>${r.suggestion.reason[uiLang()] || r.suggestion.reason.de}</i></p></div>` : html`<${OutcomeTag} status="unset" />`}
            ${r.interventions.length ? html`<p class="np-sub">${t('neg.bal.ivN', { n: r.interventions.length })} ${r.interventions.map((x) => t('neg.ivres.' + x.result)).join(', ')}</p>` : null}</td></tr>`)}</tbody></table>` : html`<p>${t('neg.bal.emptyTitle')}</p>`}
    </section>
  </article>`;
}

export function MeetingSheet({ d, cls, meetingId, Head }) {
  const ms = meetingsByDate(d);
  const m = ms.find((x) => x.id === meetingId) || ms[ms.length - 1];
  if (!m) return html`<p>${t('neg.print.missing')}</p>`;
  const dm = docMap(d);
  const dels = delegationsOf(d);
  const ivs = (d.interventions || []).filter((x) => x.meeting === m.id);
  const mx = stanceMatrix(d, { meeting: m.id });
  const rowOf = (id) => d.rows.find((r) => r.id === id);
  const lab = (r) => (r ? `${r.num ? r.num + ' | ' : ''}${r.label}` : t('neg.iv.noRow'));
  return html`<article class="np">
    <${Head} d=${d} cls=${cls} title=${t('neg.mt.printTitle', { name: meetingLabel(m) })} meta=${[[t('neg.mt.body'), m.body || '–'], [t('neg.mt.date'), m.date ? fmtDate(m.date) : '–'], [t('neg.mt.docs'), (m.docs || []).map((id) => docLabel(dm.get(id), { date: false }) || id).join('; ') || '–']]} />
    ${m.fictitious ? html`<p class="np-demo">${t('neg.fict')}</p>` : null}
    ${m.note ? html`<p>${m.note}</p>` : null}
    <section class="np-sec"><h2>${t('neg.iv.head', { n: ivs.length })}</h2>
      ${ivs.length ? html`<table class="np-tbl"><thead><tr><th class="np-c-lab">${t('neg.print.colLabel')}</th><th>${t('neg.iv.text')}</th><th class="np-c-dec">${t('neg.iv.result')}</th></tr></thead>
        <tbody>${ivs.map((x) => html`<tr><td class="np-c-lab">${lab(rowOf(x.row))}</td><td>${x.text}${x.note ? html`<p class="np-sub">${x.note}</p>` : null}${x.by ? html`<p class="np-sub">${t('neg.by.who', { by: x.by })}</p>` : null}</td><td class="np-c-dec"><${IvTag} result=${x.result} /></td></tr>`)}</tbody></table>` : html`<p>${t('neg.iv.none')}</p>`}
    </section>
    <section class="np-sec"><h2>${t('neg.mt.stancesIn', { n: mx.rows.reduce((n, r) => n + Object.keys(r.cells).length, 0) })}</h2>
      ${mx.rows.length ? html`<table class="np-tbl"><thead><tr><th class="np-c-lab">${t('neg.print.colLabel')}</th><th class="np-c-pos">${t('neg.print.colPos')}</th><th>${t('neg.mt.colStances')}</th></tr></thead>
        <tbody>${mx.rows.map((r) => { const p = d.positions[r.rowId]; return html`<tr><td class="np-c-lab">${lab(rowOf(r.rowId))}<span class="rowid">${visibleRowId(r.rowId)}</span></td>
          <td class="np-c-pos">${hasPosition(p) ? html`<${StanceTag} stance=${p.stance} /> <${PriorityTag} priority=${p.priority} />` : '–'}</td>
          <td>${Object.entries(r.cells).map(([k, c]) => { const g = dels.find((x) => x.id === k) || { code: k }; return html`<p class="np-st"><b>${g.code}</b> (${delegName(g)}): <${DStanceTag} stance=${c.stance} />${c.text ? html` – ${c.text}` : null}</p>`; })}</td></tr>`; })}</tbody></table>` : html`<p>${t('neg.mt.noStancesIn')}</p>`}
    </section>
  </article>`;
}
export { fmtDateTime };
