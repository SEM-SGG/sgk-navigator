// Anleitung zum Modul Verhandlung (DE/FR): Zweck, Begriffe, Schritt-für-Schritt, Hinweise für konsultierte Stellen, Grenzen.
// Namen von Bedienelementen über [[schlüssel]] aus denselben i18n-Schlüsseln wie die Oberfläche (rich() aus dem SGK-Modul).
import { html } from 'htm/preact';
import { useEffect, useRef } from 'preact/hooks';
import { t, tx } from '../../lib/i18n.js';
import { go } from '../../state.js';
import { Icon } from '../../ui/common.js';
import { rich } from '../sgk/guide.js';
import { StanceTag, PriorityTag, StatusBadge, DecisionTag } from './ui.js';
import { STANCES, PRIORITIES, DECISIONS, STATUSES, DELEG_STANCES, INTERVENTION_RESULTS, OUTCOMES } from './core.js';
import { DStanceTag, IvTag } from './deleg.js';
import { OutcomeTag } from './balance.js';

const list = (key) => { const v = tx(key); return Array.isArray(v) ? v : []; };
export const NEG_TASKS = ['dossier', 'import', 'neu', 'synopse', 'zeile', 'position', 'konsultation', 'briefing', 'delegationen', 'sitzung', 'bilanz', 'vorschau', 'team'];
const SECTIONS = ['zweck', 'begriffe', 'aufgaben', 'speichern', 'teamarbeit', 'stellen', 'legende', 'grenzen'];

function Task({ id }) {
  const intro = tx(`neg.guide.task.${id}.intro`);
  const after = tx(`neg.guide.task.${id}.after`);
  return html`<section class="g-task" id=${'g-' + id} tabindex="-1" aria-labelledby=${'gh-' + id}>
    <h3 id=${'gh-' + id}>${t(`neg.guide.task.${id}.title`)}</h3>
    ${intro ? html`<p>${rich(intro)}</p>` : null}
    <ol class="g-steps">${list(`neg.guide.task.${id}.steps`).map((s) => html`<li>${rich(s)}</li>`)}</ol>
    ${after ? html`<p class="g-after">${rich(after)}</p>` : null}
  </section>`;
}

export function NegGuideView({ route }) {
  const ref = useRef();
  useEffect(() => {
    const el = route.sec && document.getElementById('g-' + route.sec);
    if (el && el.scrollIntoView) { el.scrollIntoView({ block: 'start' }); el.focus({ preventScroll: true }); }
    else if (ref.current) ref.current.scrollTop = 0;
  }, [route.sec]);
  const jump = (sec) => (e) => { e.preventDefault(); go({ sec }, { replace: true }); const el = document.getElementById('g-' + sec); if (el) { el.scrollIntoView({ block: 'start' }); el.focus({ preventScroll: true }); } };
  return html`<div class="view view-guide" ref=${ref}><main class="wide narrow guide" id="main" tabindex="-1">
    <header class="unit-head"><p class="unit-label">${t('neg.module')}</p><h1 class="unit-title">${t('nav.anleitung')}</h1><p class="ov-lead">${t('neg.guide.lead')}</p></header>
    <nav class="g-toc" aria-label=${t('guide.toc')}>
      <h2 class="g-toc-title">${t('guide.toc')}</h2>
      <ol>${SECTIONS.map((s) => html`<li><a href=${'#/n-anleitung?sec=' + s} onClick=${jump(s)}>${t('neg.guide.sec.' + s)}</a>
        ${s === 'aufgaben' ? html`<ol>${NEG_TASKS.map((x) => html`<li><a href=${'#/n-anleitung?sec=' + x} onClick=${jump(x)}>${t(`neg.guide.task.${x}.title`)}</a></li>`)}</ol>` : null}</li>`)}</ol>
    </nav>

    <section class="g-sec" id="g-zweck" tabindex="-1" aria-labelledby="gs-zweck">
      <h2 id="gs-zweck">${t('neg.guide.sec.zweck')}</h2>
      ${list('neg.guide.zweck').map((p) => html`<p>${rich(p)}</p>`)}
      <div class="notice notice-info" role="note"><${Icon} name="lock" /><div><strong>${t('neg.conf.title')}</strong> ${t('neg.conf.text')}</div></div>
    </section>

    <section class="g-sec" id="g-begriffe" tabindex="-1" aria-labelledby="gs-begriffe">
      <h2 id="gs-begriffe">${t('neg.guide.sec.begriffe')}</h2>
      <dl class="g-terms">${[...list('neg.guide.terms'), ...list('neg.guide.terms3')].map(([term, def]) => html`<dt>${term}</dt><dd>${rich(def)}</dd>`)}</dl>
    </section>

    <section class="g-sec" id="g-aufgaben" tabindex="-1" aria-labelledby="gs-aufgaben">
      <h2 id="gs-aufgaben">${t('neg.guide.sec.aufgaben')}</h2>
      ${NEG_TASKS.map((id) => html`<${Task} id=${id} />`)}
    </section>

    <section class="g-sec" id="g-speichern" tabindex="-1" aria-labelledby="gs-speichern">
      <h2 id="gs-speichern">${t('neg.guide.sec.speichern')}</h2>
      <p>${rich(t('neg.guide.saveIntro'))}</p>
      <h3>${t('neg.guide.saveCondHead')}</h3>
      <ul class="g-list">${list('neg.guide.saveConds').map((s) => html`<li>${rich(s)}</li>`)}</ul>
      <h3>${t('neg.guide.saveAdviceHead')}</h3>
      <ul class="g-list">${list('neg.guide.saveAdvice').map((s) => html`<li>${rich(s)}</li>`)}</ul>
    </section>

    <section class="g-sec" id="g-teamarbeit" tabindex="-1" aria-labelledby="gs-teamarbeit">
      <h2 id="gs-teamarbeit">${t('neg.guide.sec.teamarbeit')}</h2>
      <p>${rich(t('neg.guide.teamIntro'))}</p>
      <ol class="g-steps">${list('neg.guide.teamSteps').map((s) => html`<li>${rich(s)}</li>`)}</ol>
    </section>

    <section class="g-sec" id="g-stellen" tabindex="-1" aria-labelledby="gs-stellen">
      <h2 id="gs-stellen">${t('neg.guide.sec.stellen')}</h2>
      <p>${rich(t('neg.guide.officesIntro'))}</p>
      <ol class="g-steps">${list('neg.guide.offices').map((s) => html`<li>${rich(s)}</li>`)}</ol>
    </section>

    <section class="g-sec" id="g-legende" tabindex="-1" aria-labelledby="gs-legende">
      <h2 id="gs-legende">${t('neg.guide.sec.legende')}</h2>
      <h3 class="g-sub">${t('neg.pos.stance')}</h3>
      <dl class="g-defs">${STANCES.map((s) => html`<dt><${StanceTag} stance=${s} /></dt><dd>${t('neg.guide.stance.' + s)}</dd>`)}</dl>
      <h3 class="g-sub">${t('neg.pos.priority')}</h3>
      <dl class="g-defs">${PRIORITIES.map((s) => html`<dt><${PriorityTag} priority=${s} /></dt><dd>${t('neg.guide.priority.' + s)}</dd>`)}</dl>
      <h3 class="g-sub">${t('neg.syn.status')}</h3>
      <dl class="g-defs">${STATUSES.map((s) => html`<dt><${StatusBadge} status=${s} /></dt><dd>${t('neg.guide.status.' + s)}</dd>`)}</dl>
      <h3 class="g-sub">${t('neg.cons.decision')}</h3>
      <dl class="g-defs">${DECISIONS.map((s) => html`<dt><${DecisionTag} decision=${s} /></dt><dd>${t('neg.guide.decision.' + s)}</dd>`)}</dl>
      <h3 class="g-sub">${t('neg.guide.legend3.dstance')}</h3>
      <dl class="g-defs g-defs-inline">${DELEG_STANCES.map((s) => html`<dt><${DStanceTag} stance=${s} /></dt><dd></dd>`)}</dl>
      <h3 class="g-sub">${t('neg.guide.legend3.ivres')}</h3>
      <dl class="g-defs g-defs-inline">${INTERVENTION_RESULTS.map((s) => html`<dt><${IvTag} result=${s} /></dt><dd></dd>`)}</dl>
      <h3 class="g-sub">${t('neg.guide.legend3.outcome')}</h3>
      <dl class="g-defs g-defs-inline">${[...OUTCOMES, 'unset'].map((s) => html`<dt><${OutcomeTag} status=${s} /></dt><dd></dd>`)}</dl>
      <h3 class="g-sub">${t('neg.guide.marks')}</h3>
      <dl class="g-defs">
        <dt><span class="legal"><ins>${t('neg.legend.ins')}</ins></span></dt><dd>${t('neg.guide.insText')}</dd>
        <dt><span class="legal"><del>${t('neg.legend.del')}</del></span></dt><dd>${t('neg.guide.delText')}</dd>
        <dt><span class="ncell legal" lang="en"><b>bold</b> <u>underlined</u> <s>struck</s></span></dt><dd>${t('neg.guide.srcText')}</dd>
      </dl>
    </section>

    <section class="g-sec" id="g-grenzen" tabindex="-1" aria-labelledby="gs-grenzen">
      <h2 id="gs-grenzen">${t('neg.guide.sec.grenzen')}</h2>
      <ul class="g-list">${[...list('neg.guide.limits'), ...list('neg.guide.limits3')].map((p) => html`<li>${rich(p)}</li>`)}</ul>
    </section>
  </main></div>`;
}
