// Druckansichten (PDF über den Browserdruck, durchsuchbarer Text, A4 quer): Verhandlungsbriefing, Konsultationsbericht,
// Leseversion der Konsultation, Gesamtsicht Synopse, "Was ist neu". Kopf mit Dossier und Einstufung auf jeder Ansicht.
import { CARBON } from '../../tokens.js';
import { html } from 'htm/preact';
import { render } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { t, uiLang, withUiLang } from '../../lib/i18n.js';
import { go } from '../../state.js';
import { Icon } from '../../ui/common.js';
import { fmtDate, todayIso } from '../../lib/format.js';
import {
  positionRows, positionStats, aggregateConsultation, consultationRows, sortedRows, docMap, docsByDate, topClassification, visibleRowId, sanitizeInline, STANCES, PRIORITIES, hasPosition,
} from './core.js';
import { useDossier, NoDossier, trackName, docLabel, StanceTag, PriorityTag, StatusBadge, DecisionTag } from './ui.js';
import { briefingOpts, forOffice } from './output.js';
import { filtersOf, filterRows, cellView, statusOf } from './rows.js';
import { docsChoice } from './synopsis.js';
import { changesOf } from './importview.js';
import { BalanceSheet, MeetingSheet } from './print3.js';

const parts = (s) => String(s || '').split('~');

export function PrintView({ route }) {
  const d = useDossier(route);
  if (!d) return html`<${NoDossier} route=${route} />`;
  return html`<${Print} d=${d} route=${route} />`;
}

function langOf(route) {
  if (route.pv === 'briefing') return parts(route.po)[2] || uiLang();
  if (route.pv === 'report') return parts(route.po)[2] || uiLang();
  if (route.pv === 'balance') return ['de', 'fr'].includes(route.po) ? route.po : uiLang();
  if (route.pv === 'meeting') return parts(route.po)[1] || uiLang();
  return uiLang();
}

function Print({ d, route }) {
  const host = useRef();
  const lang = route.pv === 'consultation' ? ((d.consultations.find((k) => k.id === route.po) || {}).lang || uiLang()) : langOf(route);
  const cls = route.pv === 'consultation' ? (d.documents.find((x) => x.id === ((d.consultations.find((k) => k.id === route.po) || {}).basis || {}).doc) || {}).classification || 'internal' : topClassification(d) || 'internal';
  useEffect(() => {
    document.body.classList.add('neg-printing');
    const st = document.createElement('style');
    st.id = 'neg-page';
    const head = withUiLang(lang, () => (cls && cls !== 'public' ? t('neg.class.' + cls) : '') + (d.demo ? ' | ' + t('neg.demo.tag') : ''));
    st.textContent = `@page { size: A4 landscape; margin: 14mm 12mm 16mm; @bottom-right { content: counter(page) " / " counter(pages); font: 8pt "IBM Plex Sans", Arial, sans-serif; color: ${CARBON['ink-muted']}; } @top-right { content: ${JSON.stringify(head)}; font: 600 8pt "IBM Plex Sans", Arial, sans-serif; color: ${CARBON['error-text']}; } @bottom-left { content: ${JSON.stringify((d.procedure || '') + ' ' + (d.short || d.title || ''))}; font: 8pt "IBM Plex Sans", Arial, sans-serif; color: ${CARBON['ink-muted']}; } }`;
    document.head.appendChild(st);
    return () => { document.body.classList.remove('neg-printing'); st.remove(); };
  }, [d.id, lang, cls]);
  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    withUiLang(lang, () => render(html`<${Sheet} d=${d} route=${route} cls=${cls} />`, el));
    return () => render(null, el);
  }, [d, route.pv, route.po, route.nh, route.nv, route.nd, route.na, route.nb, route.np, route.nm, route.nq, route.nfc, route.nfs, route.nfp, route.nfh, route.nfr, route.nfo, lang]);
  const back = () => history.length > 1 ? history.back() : go({ view: route.pv === 'meeting' ? 'delegationen' : route.pv === 'balance' ? 'position' : 'ausgabe', pv: null, po: null });
  return html`<div class="view view-print">
    <div class="nprint-bar" role="region" aria-label=${t('neg.print.bar')}>
      <button type="button" class="btn btn-tertiary" onClick=${back}><${Icon} name="arrow-left" />${t('neg.print.back')}</button>
      <button type="button" class="btn btn-primary" id="np-print" onClick=${() => window.print()}><${Icon} name="print" />${t('neg.print.print')}</button>
      <p class="small muted">${t('neg.print.hint')}</p>
    </div>
    <div class="nprint-host" id="main" tabindex="-1" ref=${host} lang=${lang === 'fr' ? 'fr-CH' : 'de-CH'}></div>
  </div>`;
}

function Head({ d, cls, title, meta }) {
  return html`<header class="np-head">
    <div class="np-top"><span class="np-brand">SGK Navigator | ${t('neg.module')}</span><span class=${'np-class nc-' + cls}>${t('neg.class.' + cls + 'Long')}</span></div>
    ${d.demo ? html`<p class="np-demo">${t('neg.print.demo')}</p>` : null}
    <h1 class="np-title">${title}</h1>
    <dl class="np-meta">
      <div><dt>${t('neg.print.dossier')}</dt><dd lang="en">${d.title || d.short}</dd></div>
      ${d.procedure ? html`<div><dt>${t('neg.print.procedure')}</dt><dd>${d.procedure}</dd></div>` : null}
      ${meta.map(([a, b]) => html`<div><dt>${a}</dt><dd>${b}</dd></div>`)}
      <div><dt>${t('neg.print.asOf')}</dt><dd>${fmtDate(todayIso())}</dd></div>
    </dl>
  </header>`;
}

function PosCell({ p, stale }) {
  if (!p || !hasPosition(p)) return html`<span class="muted">–</span>`;
  return html`<div class="np-pos"><div class="np-tags"><${StanceTag} stance=${p.stance} /><${PriorityTag} priority=${p.priority} /></div>
    ${p.text ? html`<p>${p.text}</p>` : null}
    ${p.proposal ? html`<p class="np-sub"><b>${t('neg.pos.proposalShort')}:</b> <span lang="en">${p.proposal}</span></p>` : null}
    ${p.fallback ? html`<p class="np-sub"><b>${t('neg.pos.fallback')}:</b> ${p.fallback}</p>` : null}
    ${p.owner ? html`<p class="np-sub"><b>${t('neg.pos.owner')}:</b> ${p.owner}</p>` : null}
    ${stale ? html`<p class="np-stale">${t('neg.pos.staleTitle')}</p>` : null}</div>`;
}

function Sheet({ d, route, cls }) {
  const dm = docMap(d);
  const last = docsByDate(d).slice(-1)[0];
  if (route.pv === 'balance') return html`<${BalanceSheet} d=${d} cls=${cls} Head=${Head} PosCell=${PosCell} />`;
  if (route.pv === 'meeting') return html`<${MeetingSheet} d=${d} cls=${cls} meetingId=${parts(route.po)[0]} Head=${Head} />`;
  if (route.pv === 'briefing') {
    const [scope = 'all', sort = 'order'] = parts(route.po);
    const rows = positionRows(d, briefingOpts(scope, sort));
    const st = positionStats(rows);
    return html`<article class="np">
      <${Head} d=${d} cls=${cls} title=${t('neg.print.briefing', { title: d.short || d.title })} meta=${[[t('neg.print.basis'), docLabel(last)], [t('neg.out.scope'), t('neg.out.scopeOpt.' + scope)]]} />
      <section class="np-sec np-over"><h2>${t('neg.print.overview')}</h2>
        <div class="np-stats">
          <table class="np-mini"><caption>${t('neg.pos.byStance')}</caption><tbody>${STANCES.filter((s) => st.byStance[s]).map((s) => html`<tr><td><${StanceTag} stance=${s} /></td><td class="num">${st.byStance[s]}</td></tr>`)}</tbody></table>
          <table class="np-mini"><caption>${t('neg.pos.byPriority')}</caption><tbody>${PRIORITIES.filter((s) => st.byPriority[s]).map((s) => html`<tr><td><${PriorityTag} priority=${s} /></td><td class="num">${st.byPriority[s]}</td></tr>`)}</tbody></table>
        </div>
        ${st.key.length ? html`<h3>${t('neg.print.keyPoints')}</h3><ul class="np-key">${st.key.map((r) => html`<li><b>${r.num ? r.num + ' | ' : ''}${r.label}</b> <${PriorityTag} priority=${r.position.priority} /> <${StanceTag} stance=${r.position.stance} />${r.position.text ? html`<span> ${r.position.text}</span>` : null}</li>`)}</ul>` : null}
      </section>
      <section class="np-sec"><h2>${t('neg.print.positions', { n: rows.length })}</h2>
        ${rows.length ? html`<table class="np-tbl"><thead><tr><th class="np-c-num">${t('neg.print.colNum')}</th><th class="np-c-lab">${t('neg.print.colLabel')}</th><th>${t('neg.print.colText')}</th><th class="np-c-pos">${t('neg.print.colPos')}</th></tr></thead>
          <tbody>${rows.map((r) => html`<tr><td class="np-c-num">${r.num || ''}<span class="rowid">${visibleRowId(r.rowId)}</span></td><td class="np-c-lab">${r.label}<${StatusBadge} status=${r.status} /></td>
            <td><div class="legal ncell" lang="en" dangerouslySetInnerHTML=${{ __html: sanitizeInline(r.text.html) }}></div>${r.text.track ? html`<p class="np-src">${trackName(d, r.text.track)}, ${docLabel(dm.get(r.text.doc), { date: false })}</p>` : null}</td>
            <td class="np-c-pos"><${PosCell} p=${r.position} stale=${r.stale} /></td></tr>`)}</tbody></table>` : html`<p>${t('neg.print.noPositions')}</p>`}
      </section>
    </article>`;
  }
  if (route.pv === 'report') {
    const [kId, officeId] = parts(route.po);
    const dd = forOffice(d, kId, officeId);
    const agg = aggregateConsultation(dd, kId);
    if (!agg) return html`<p>${t('neg.print.missing')}</p>`;
    const off = (id) => agg.offices.find((o) => o.id === id) || { abbr: '?' };
    return html`<article class="np">
      <${Head} d=${d} cls=${cls} title=${t('neg.print.report', { title: agg.consultation.title })} meta=${[[t('neg.cons.office'), officeId ? off(officeId).name || off(officeId).abbr : t('neg.out.allOffices')], [t('neg.cons.deadline'), agg.consultation.deadline ? fmtDate(agg.consultation.deadline) : '–']]} />
      <section class="np-sec"><h2>${t('neg.print.offices')}</h2>
        <table class="np-tbl np-narrow"><thead><tr><th>${t('neg.cons.office')}</th><th class="num">${t('neg.cons.items')}</th><th class="num">${t('neg.cons.decided')}</th></tr></thead>
          <tbody>${agg.offices.map((o) => html`<tr><td>${o.name}${o.abbr && o.abbr !== o.name ? ` (${o.abbr})` : ''}${o.responded ? '' : html` <span class="muted">${t('neg.cons.notReceived')}</span>`}</td><td class="num">${o.items}</td><td class="num">${o.decided}/${o.items}</td></tr>`)}</tbody></table>
      </section>
      <section class="np-sec"><h2>${t('neg.print.decisions')}</h2>
        ${agg.rows.some((r) => r.items.length) ? html`<table class="np-tbl"><thead><tr><th class="np-c-lab">${t('neg.print.colLabel')}</th><th class="np-c-off">${t('neg.cons.office')}</th><th>${t('neg.print.colItem')}</th><th class="np-c-dec">${t('neg.cons.decision')}</th><th>${t('neg.cons.reply')}</th></tr></thead>
          <tbody>${agg.rows.filter((r) => r.items.length).flatMap((r) => r.items.map((it, i) => html`<tr class=${i ? 'np-cont' : ''}>
            <td class="np-c-lab">${i === 0 ? html`${r.num ? r.num + ' | ' : ''}${r.label}<span class="rowid">${visibleRowId(r.rowId)}</span>` : null}</td>
            <td class="np-c-off">${it.office.abbr}</td>
            <td>${it.comment}${it.proposal ? html`<p class="np-sub"><b>${t('neg.cons.proposal')}:</b> <span lang="en">${it.proposal}</span></p>` : null}</td>
            <td class="np-c-dec"><${DecisionTag} decision=${it.decision} /></td><td>${it.reply}</td></tr>`))}</tbody></table>` : html`<p>${t('neg.cons.noResponses')}</p>`}
      </section>
      ${agg.general.length ? html`<section class="np-sec"><h2>${t('neg.cons.generalHead')}</h2><ul class="np-key">${agg.general.map((g) => html`<li><b>${off(g.office).abbr}:</b> ${g.text}</li>`)}</ul></section>` : null}
      ${agg.unmatched.length ? html`<section class="np-sec"><h2>${t('neg.cons.unmatchedHead', { n: agg.unmatched.length })}</h2><ul class="np-key">${agg.unmatched.map((g) => html`<li><b>${off(g.office).abbr}:</b> ${g.text}</li>`)}</ul></section>` : null}
    </article>`;
  }
  if (route.pv === 'consultation') {
    const k = d.consultations.find((x) => x.id === route.po);
    if (!k) return html`<p>${t('neg.print.missing')}</p>`;
    const rows = consultationRows(d, k.id);
    return html`<article class="np">
      <${Head} d=${d} cls=${cls} title=${t('neg.print.consultation', { title: k.title })} meta=${[[t('neg.cons.basis'), `${trackName(d, k.basis.track)}: ${docLabel(dm.get(k.basis.doc))}`], ...(k.basis.compareTo ? [[t('neg.print.compared'), docLabel(dm.get(k.basis.compareTo))]] : []), [t('neg.cons.deadline'), k.deadline ? fmtDate(k.deadline) : '–']]} />
      ${k.basis.compareTo ? html`<p class="np-legend">${t('neg.print.markLegend')} <ins>${t('neg.legend.ins')}</ins> <del>${t('neg.legend.del')}</del></p>` : null}
      <table class="np-tbl"><thead><tr><th class="np-c-num">${t('neg.print.colNum')}</th><th class="np-c-lab">${t('neg.print.colLabel')}</th><th>${t('neg.print.colText')}</th><th class="np-c-pos">${t('neg.print.colPosDraft')}</th></tr></thead>
        <tbody>${rows.map((r) => html`<tr><td class="np-c-num">${r.num || ''}<span class="rowid">${visibleRowId(r.rowId)}</span></td><td class="np-c-lab">${r.label}<${StatusBadge} status=${r.status} /></td>
          <td><div class="legal ncell" lang="en" dangerouslySetInnerHTML=${{ __html: r.diffHtml || '' }}></div></td><td class="np-c-pos"><${PosCell} p=${r.position} /></td></tr>`)}</tbody></table>
    </article>`;
  }
  if (route.pv === 'changes') {
    const doc = dm.get(route.po);
    const groups = changesOf(d, route.po);
    return html`<article class="np">
      <${Head} d=${d} cls=${cls} title=${t('neg.print.changes', { doc: docLabel(doc) })} meta=${[]} />
      <p class="np-legend"><ins>${t('neg.legend.ins')}</ins> <del>${t('neg.legend.del')}</del></p>
      ${groups.map((g) => html`<section class="np-sec"><h2>${trackName(d, g.track)} (${g.items.length})</h2>
        <table class="np-tbl"><tbody>${g.items.map((x) => html`<tr><td class="np-c-lab">${x.num ? x.num + ' | ' : ''}${x.label}<span class="np-sub">${t('neg.imp.chg.' + x.change)}</span></td>
          <td><div class="legal ncell" lang="en" dangerouslySetInnerHTML=${{ __html: x.change === 'changed' ? x.diff.redline : x.change === 'new' ? '<ins>' + sanitizeInline(x.b.html) + '</ins>' : x.change === 'removed' ? '<del>' + sanitizeInline(x.a.html) + '</del>' : sanitizeInline((x.b || x.a).html) }}></div></td></tr>`)}</tbody></table>
      </section>`)}
    </article>`;
  }
  // Synopse (Einstellungen und Filter aus der Synopse)
  const hidden = new Set(String(route.nh || '').split(',').filter(Boolean));
  const tracks = d.tracks.filter((x) => !hidden.has(x.id) && d.documents.some((doc) => (doc.tracks || []).includes(x.id)));
  const docs = docsChoice(route);
  const opt = { markup: route.nm !== '0', mode: route.nd || 'none', docs, a: route.na || (tracks[0] || {}).id, b: route.nb || (tracks[tracks.length - 1] || {}).id };
  const rows = filterRows(d, sortedRows(d), filtersOf(route));
  const showPos = route.np !== '0';
  return html`<article class="np">
    <${Head} d=${d} cls=${cls} title=${t('neg.print.synopsis', { title: d.short || d.title })} meta=${[[t('neg.print.rows'), t('neg.syn.countFiltered', { n: rows.length, total: d.rows.length })], [t('neg.syn.diff'), t('neg.syn.diffMode.' + opt.mode)]]} />
    ${opt.mode !== 'none' ? html`<p class="np-legend"><ins>${t('neg.legend.ins')}</ins> <del>${t('neg.legend.del')}</del></p>` : null}
    <table class="np-tbl np-syn"><thead><tr><th class="np-c-lab">${t('neg.print.colLabel')}</th>${tracks.map((x) => html`<th>${trackName(d, x.id)}${docs[x.id] ? html`<span class="np-sub">${docLabel(dm.get(docs[x.id]), { date: false })}</span>` : null}</th>`)}${showPos ? html`<th class="np-c-pos">${t('neg.syn.colPos')}</th>` : null}</tr></thead>
      <tbody>${rows.map((r) => html`<tr><td class="np-c-lab">${r.num ? html`<b>${r.num}</b> ` : null}${r.label}<${StatusBadge} status=${statusOf(d, r.id)} /></td>
        ${tracks.map((x) => { const v = cellView(d, r.id, x.id, opt); return html`<td>${v.cell && !v.cell.empty ? html`<div class="legal ncell" lang="en" dangerouslySetInnerHTML=${{ __html: v.html }}></div>` : '–'}</td>`; })}
        ${showPos ? html`<td class="np-c-pos"><${PosCell} p=${d.positions[r.id]} /></td>` : null}</tr>`)}</tbody></table>
  </article>`;
}
