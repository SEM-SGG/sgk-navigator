// Info: Datenstand, Methodik, Haftungshinweis.
import { html } from 'htm/preact';
import { ActChip, StatusTag, Notice, HelpLink } from '../../ui/common.js';
import { fmtDate, localIso } from '../../lib/format.js';
import { kindLabel } from '../../data.js';
import { go } from '../../state.js';
import { t, uiLang, tx } from '../../lib/i18n.js';
import { works, workData, workAbbr } from '../../library.js';
import { workNum } from './workbar.js';
import { UpdateInfo } from '../../ui/updatenotice.js';

function WorksTable() {
  const l = uiLang();
  return html`<div class="tbl-scroll"><table class="tbl-data" id="tbl-works"><thead><tr><th>${t('info.works.colWork')}</th><th>${t('info.works.colStages')}</th><th>${t('info.works.colFrom')}</th><th>${t('info.works.colTo')}</th><th>${t('info.works.colUnits')}</th><th>${t('info.works.colMode')}</th></tr></thead><tbody>
    ${works().map((w) => {
      const d = workData(w.id);
      return html`<tr><td><a href=${'#/info?w=' + w.id} onClick=${(e) => { e.preventDefault(); go({ view: 'info', w: w.id }); }}><b>${workAbbr(w, l)}</b></a> <span class="muted">${workNum(w)}</span></td>
        <td>${d.stages.length}</td><td class="nw">${fmtDate(d.stageDate(d.stages[0].id))}</td><td class="nw">${fmtDate(d.stageDate(d.latest.id))}</td>
        <td>${d.unitOrder.length}</td><td class="small">${w.full ? t('info.works.modeFull') : t('info.works.modeCons')}</td></tr>`;
    })}
  </tbody></table></div>`;
}

export function InfoView({ data }) {
  const m = data.meta || {};
  const l = uiLang();
  return html`<div class="view view-info"><main class="wide narrow" id="main" tabindex="-1">
    <header class="unit-head page-head"><p class="unit-label">${t('nav.info')}</p><h1 class="unit-title">${t('info.title')}</h1><${HelpLink} sec="grundbegriffe" /></header>

    <section class="info-sec" aria-labelledby="hf-h">
      <h2 id="hf-h">${t('info.liability.title')}</h2>
      <${Notice} kind="warning" title=${t('info.liability.lead')}>${t('info.liability.text', { mode: t('read.mode.datum') })}</${Notice}>
    </section>

    <section class="info-sec" aria-labelledby="ds-h">
      <h2 id="ds-h">${t('info.data.title')}</h2>
      <dl class="facts">
        <dt>${t('info.data.work')}</dt><dd>${data.work.title ? data.work.title[l] || data.work.title.de : data.work.celex}</dd>
        <dt>${t('info.data.ids')}</dt><dd>${data.work.celex}, <a href=${data.work.eli} target="_blank" rel="noopener noreferrer">${data.work.eli}</a></dd>
        <dt>${t('info.data.generated')}</dt><dd>${fmtDate(data.ds.generated)}${m.status ? ` (${t('info.data.status', { status: t('ov.status.' + (m.status === 'final' ? 'final' : 'prelim')) })})` : ''}</dd>
        <dt>${t('info.data.built')}</dt><dd>${m.built ? fmtDate(localIso(new Date(m.built))) : ''}</dd>
        <dt>${t('info.data.source')}</dt><dd>${m.fixtures ? t('info.data.sourceFixtures') : t('info.data.sourceReal')}</dd>
        <dt>${t('info.data.langs')}</dt><dd>${data.langs.map((x) => x.toUpperCase()).join(', ')}</dd>
        <dt>${t('info.data.units')}</dt><dd>${data.unitOrder.length}</dd>
      </dl>
      ${data.notes.length ? html`<details class="info-notes"><summary>${t('info.data.notes', { n: data.notes.length })}</summary><ul>${data.notes.map((n) => html`<li>${typeof n === 'string' ? n : t(n.k, n.v)}</li>`)}</ul></details>` : null}
    </section>

    <${UpdateInfo} />

    <section class="info-sec" aria-labelledby="st-h">
      <h2 id="st-h">${t('info.stages.title')}</h2>
      <p>${data.full ? t('info.stages.text') : tx('info.works.text')[1]}</p>
      <div class="tbl-scroll"><table class="tbl-data"><thead><tr><th>${t('common.stage')}</th><th>${t('info.col.act')}</th><th>${t('info.col.source')}</th><th>${t('info.col.langs')}</th><th>${t('info.col.note')}</th></tr></thead><tbody>
        ${data.stages.map((s) => html`<tr>
          <td class="mono"><a href=${`#/lesen?s=${s.id}`} title=${data.stageLabel(s.id)} onClick=${(e) => { e.preventDefault(); go({ view: 'lesen', s: s.id, m: 'stand' }); }}>${s.id}</a></td>
          <td><${ActChip} data=${data} celex=${s.act} number /></td>
          <td><span class=${'tag ' + (data.isReconstructed(s.id) ? 'tag-recon' : 'tag-src')}>${data.sourceLabel(s.id)}</span>${s.source && s.source.celex ? html`<br /><span class="mono small">${s.source.celex}</span>` : null}${!data.full && s.date ? html`<br /><span class="small">${fmtDate(s.date)}</span>` : null}</td>
          <td class="nw">${(s.langs || data.langs).map((x) => x.toUpperCase()).join(', ')}</td>
          <td class="small">${data.sourceNote(s.id)}</td></tr>`)}
      </tbody></table></div>
    </section>

    <section class="info-sec" aria-labelledby="ac-h">
      <h2 id="ac-h">${t('info.acts.title')}</h2>
      ${!data.full ? html`<p class="small muted info-lead">${t('ra.work.consTip')}</p>` : null}
      <div class="tbl-scroll"><table class="tbl-data"><thead><tr><th>${t('info.col.act')}</th><th>${t('info.col.kind')}</th><th>${t('info.col.adopted')}</th><th>${t('info.col.applicability')}</th><th>${t('info.col.basis')}</th></tr></thead><tbody>
        ${data.actList.map((a) => html`<tr>
          <td><${ActChip} data=${data} celex=${a.celex} number /><br /><span class="mono small">${a.celex}</span></td>
          <td>${kindLabel(a.kind)}${a.langs ? html`<br /><span class="small">${t('info.onlyLangs', { langs: a.langs.map((x) => x.toUpperCase()).join(', ') })}</span>` : null}</td>
          <td class="nw">${fmtDate(a.adopted || a.published)}</td>
          <td>${a.application && a.application.status === 'unknown' ? html`<span class="tag tag-src">${t('info.unknownApp')}</span>` : html`<${StatusTag} data=${data} celex=${a.celex} />`}${data.full && a.application && a.application.note ? html`<p class="small">${data.loc(a.application.note)}</p>` : null}${a.confidence === 'check' && data.full ? html`<p class="small warn-text">${t('info.toCheck')} ${a.checkNote || ''}</p>` : null}</td>
          <td class="small">${a.application && a.application.basis ? data.loc(a.application.basis) : ''}</td></tr>`)}
      </tbody></table></div>
    </section>

    <section class="info-sec" aria-labelledby="wk-h">
      <h2 id="wk-h">${t('info.works.title')}</h2>
      ${(tx('info.works.text') || []).map((p) => html`<p>${p}</p>`)}
      <${WorksTable} />
    </section>

    <section class="info-sec" aria-labelledby="ex-h">
      <h2 id="ex-h">${t('info.extra.title')}</h2>
      <ul class="info-list">${(tx('info.extra.text') || []).map((p) => html`<li>${p}</li>`)}</ul>
    </section>

    <section class="info-sec" aria-labelledby="mt-h">
      <h2 id="mt-h">${t('info.method.title')}</h2>
      <p>${t('info.method.text')}</p>
      <p><a href="#/anleitung" onClick=${(e) => { e.preventDefault(); go({ view: 'anleitung', sec: null }); }}>${t('info.method.guideLink')}</a></p>
    </section>
  </main></div>`;
}
