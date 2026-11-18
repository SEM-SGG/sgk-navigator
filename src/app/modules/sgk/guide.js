// Anleitung (DE/FR): Zweck, Grundbegriffe, Schritt-für-Schritt-Anleitungen, Legende mit echten Beispielen, Zitierweise, Tastatur, Grenzen.
// Texte stammen aus den Wörterbüchern (guide.*). Namen von Bedienelementen werden mit [[schlüssel]] aus denselben
// i18n-Schlüsseln eingesetzt wie in der Oberfläche, damit Anleitung und Oberfläche nie auseinanderlaufen.
import { CARBON } from '../../tokens.js';
import { html } from 'htm/preact';
import { useEffect, useRef } from 'preact/hooks';
import { go } from '../../state.js';
import { ActChip, StatusTag, Icon, TitleText } from '../../ui/common.js';
import { BlockList } from '../../ui/blocks.js';
import { cite } from '../../lib/cite.js';
import { t, tx, uiLang } from '../../lib/i18n.js';

/** Mini-Auszeichnung: [[schlüssel]] → Name des Bedienelements fett; **text** → fett; {de|text} → Text in anderer Sprache (lang). */
export function rich(str) {
  const out = [];
  const re = /\[\[([\w.]+)\]\]|\*\*([^*]+)\*\*|\{(de|fr|en)\|([^}]+)\}/g;
  let last = 0, m;
  const s = String(str ?? '');
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(m[1] ? html`<b class="ui-ref">${t(m[1])}</b>` : m[2] ? html`<b>${m[2]}</b>` : html`<span lang=${m[3]}>${m[4]}</span>`);
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
const list = (key) => { const v = tx(key); return Array.isArray(v) ? v : []; };

const TASKS = ['werke', 'lesen', 'chronologie', 'verweise', 'vergleich', 'sprachvergleich', 'sichten', 'anwendbarkeit', 'begruendung', 'formulare', 'vorschau', 'export', 'textexport', 'aktualisieren', 'projekt', 'version', 'links', 'uebersicht'];
const SECTIONS = ['zweck', 'grundbegriffe', 'aufgaben', 'legende', 'zitierweise', 'tastatur', 'grenzen'];

function Steps({ id }) {
  const intro = tx(`guide.task.${id}.intro`);
  const after = tx(`guide.task.${id}.after`);
  return html`<section class="g-task" id=${'g-' + id} tabindex="-1" aria-labelledby=${'gh-' + id}>
    <h3 id=${'gh-' + id}>${t(`guide.task.${id}.title`)}</h3>
    ${intro ? html`<p>${rich(intro)}</p>` : null}
    <ol class="g-steps">${list(`guide.task.${id}.steps`).map((s) => html`<li>${rich(s)}</li>`)}</ol>
    ${after ? html`<p class="g-after">${rich(after)}</p>` : null}
  </section>`;
}

/** Echte Blöcke aus dem Datensatz als Beispiel für Randmarken (Basistext, anwendbar, schraffiert). */
function sampleBlocks(data, lang) {
  const pick = { base: null, applied: null, pending: null };
  const short = (b) => b.ty !== 'table' && b.ty !== 'img' && b.ty !== 'heading' && b.t && b.t.length >= 70 && b.t.length < 240;
  const score = (b) => Math.abs(b.t.length - 150);
  for (const id of data.unitOrder) {
    const v = data.version(id, lang, data.latest.id);
    if (!v || v.repealed) continue;
    for (const b of v.blocks || []) {
      if (!short(b)) continue;
      const o = b.o || data.work.celex;
      const slot = o === data.work.celex ? 'base' : data.isPending(o) ? 'pending' : 'applied';
      if (!pick[slot] || score(b) < score(pick[slot].b)) pick[slot] = { unit: id, b: { ...b, d: 0 } };
    }
  }
  return pick;
}

function Legend({ data, lang }) {
  const pick = sampleBlocks(data, lang);
  const stageActs = [...new Set(data.stages.map((s) => s.act))];
  const statusSamples = [];
  const seen = new Set();
  for (const a of data.actList) {
    const st = data.status(a.celex);
    if (st.label && !seen.has(st.kind)) { seen.add(st.kind); statusSamples.push(a.celex); }
  }
  const srcSamples = [];
  const seenSrc = new Set();
  for (const s of data.stages) { const l = data.sourceLabel(s.id); if (l && !seenSrc.has(l)) { seenSrc.add(l); srcSamples.push(s.id); } }
  const blocks = ['base', 'applied', 'pending'].map((k) => pick[k]).filter(Boolean);
  const derivedId = data.unitOrder.find((u) => data.unitTitle(u, lang).derived);
  const derived = derivedId ? data.unitTitle(derivedId, lang) : null;
  return html`<div class="g-legend">
    <h3>${t('guide.legend.marks')}</h3>
    <p>${rich(t('guide.legend.marksText'))}</p>
    ${blocks.map((p) => html`<div class="g-sample">
      <p class="g-sample-cap">${cite(data.unitMeta(p.unit), p.b.k, uiLang(), data.abbr)}</p>
      <div class="legal legal-read" lang=${lang}><${BlockList} data=${data} unitId=${p.unit} version=${{ blocks: [p.b] }} lang=${lang} originMarks=${true} /></div>
    </div>`)}

    <h3>${t('guide.legend.colors')}</h3>
    <p>${rich(t('guide.legend.colorsText'))}</p>
    <ul class="g-chips">${stageActs.map((c) => html`<li><${ActChip} data=${data} celex=${c} number /><span>${data.actName(c)}</span></li>`)}</ul>

    <h3>${t('guide.legend.status')}</h3>
    <dl class="g-defs">
      ${statusSamples.map((c) => html`<dt><${StatusTag} data=${data} celex=${c} /></dt><dd>${t('guide.legend.statusKind.' + data.status(c).kind)}</dd>`)}
      <dt><span class="chip chip-pending"><span class="sw sw-pending" style=${{ '--act': 'var(--ink-muted)' }}></span>${t('guide.legend.hatched')}</span></dt><dd>${t('legend.pending')}</dd>
    </dl>

    <h3>${t('guide.legend.sources')}</h3>
    <dl class="g-defs">
      ${srcSamples.map((s) => html`<dt><span class=${'tag ' + (data.isReconstructed(s) ? 'tag-recon' : 'tag-src')}>${data.sourceLabel(s)}</span></dt><dd>${t('guide.legend.source.' + ((data.stage(s).source || {}).kind === 'patched' && data.isConsolidatedBase(data.stage(s)) ? 'patchedConsolidated' : (data.stage(s).source || {}).kind))}</dd>`)}
      <dt><span class="tag tag-src">${t('chron.editorial')}</span></dt><dd>${t('chron.editorialTip')}</dd>
      ${derived ? html`<dt class="g-derived"><${TitleText} ti=${derived} lang=${lang} /></dt><dd>${t('read.derivedTip')}</dd>` : null}
    </dl>

    <h3>${t('guide.legend.diff')}</h3>
    <dl class="g-defs">
      <dt><span class="legal"><ins>${t('change.inserted')}</ins></span></dt><dd>${t('guide.legend.ins')}</dd>
      <dt><span class="legal"><del>${t('change.deleted')}</del></span></dt><dd>${t('guide.legend.del')}</dd>
      <dt><span class="state-tag st-changed">${t('change.amended')}</span> <span class="state-tag st-ins">${t('change.inserted')}</span> <span class="state-tag">${t('change.deleted')}</span></dt><dd>${t('guide.legend.stateTags')}</dd>
    </dl>

    <h3>${t('guide.legend.bar')}</h3>
    <dl class="g-defs">
      <dt><span class="stg-dot" aria-hidden="true"></span></dt><dd>${t('read.stagebar.legendChanged')}</dd>
      <dt><b>*</b></dt><dd>${t('read.stagebar.legendRecon')}</dd>
    </dl>

    <h3>${t('guide.legend.matrix')}</h3>
    <dl class="g-defs">
      <dt><span class="mx-sample" style=${{ '--act': data.color(stageActs[3] || stageActs[1]) }}><b>+</b></span></dt><dd>${t('ov.mx.lgIns')}</dd>
      <dt><span class="mx-sample" style=${{ '--act': data.color(stageActs[3] || stageActs[1]) }}><b>±</b> <small>3</small></span></dt><dd>${t('ov.mx.lgRep')}; ${t('ov.mx.lgNum')}</dd>
      <dt><span class="mx-sample" style=${{ '--act': data.color(stageActs[3] || stageActs[1]) }}><b>−</b></span></dt><dd>${t('ov.mx.lgDel')}</dd>
      <dt><span class="mx-sample is-pending" style=${{ '--act': data.color(stageActs[4] || stageActs[1]) }}><b>±</b></span></dt><dd>${t('ov.mx.lgPending')}</dd>
    </dl>

    <h3>${t('guide.legend.e3')}</h3>
    <dl class="g-defs">
      <dt><span class="legal"><a class="ref" href="#" onClick=${(e) => e.preventDefault()}>Artikel 8</a></span></dt><dd>${t('guide.legend.refInt')}</dd>
      <dt><span class="legal"><a class="ref ref-lib" href="#" onClick=${(e) => e.preventDefault()}>Verordnung (EU) 2017/2226</a></span></dt><dd>${t('guide.legend.refLib')}</dd>
      <dt><span class="legal"><a class="ref ref-ext" href="#" onClick=${(e) => e.preventDefault()}>Richtlinie 2004/38/EG</a></span></dt><dd>${t('guide.legend.refExt')}</dd>
      <dt>${['suspended', 'conditional', 'modified', 'future', 'expired'].map((k) => html`<span class=${'blk-flag flag-' + k}>${t('notice.kind.' + k)}</span> `)}</dt><dd>${t('guide.legend.flagText')}</dd>
      <dt><span class="tag tag-recon">${t('notice.computed')}</span> <span class="tag tag-partly">${t('notice.check')}</span></dt><dd>${rich(t('guide.task.anwendbarkeit.after'))}</dd>
      <dt><span class="tag tag-ok">${t('rat.direct')}</span> <span class="tag tag-src">${t('rat.thematic')}</span></dt><dd>${t('guide.legend.ratText')}</dd>
      <dt><span class="tag tag-recon">${t('forms.transcription')}</span> <span class="sic">à déjà</span><span class="sic-mark">[sic]</span></dt><dd>${t('guide.legend.formText')}</dd>
      <dt><span class="chip"><span class="sw sw-pending" style=${{ '--act': CARBON['act-proposal'] }}></span><span class="chip-code">${t('preview.code')}</span></span></dt><dd>${t('guide.legend.pvText')}</dd>
    </dl>

    <h3>${t('guide.legend.timeline')}</h3>
    <p class="legend-line"><span class="lg"><span class="lg-dot"></span>${t('ov.tl.lgAdopted')}</span><span class="lg"><span class="lg-dash"></span>${t('legend.pending')}</span><span class="lg"><span class="lg-dot-line"></span>${t('ov.tl.lgProposal')}</span><span class="lg"><span class="lg-bar"></span>${t('ov.tl.lgApplicable')}</span><span class="lg"><span class="lg-derog"></span>${t('ov.tl.lgDerog')}</span><span class="lg"><span class="lg-own"></span>${t('ov.tl.lgChange')}</span><span class="lg"><span class="lg-today"></span>${t('ov.tl.today')}</span></p>
  </div>`;
}

function Citation({ data }) {
  const art8 = { type: 'article', num: '8' };
  const ex = [
    [art8, 'p3.a.i'], [{ type: 'article', num: '6' }, 'p1.s2'], [{ type: 'article', num: '8a' }, null], [art8, 'p3.ba'],
    [{ type: 'article', num: '2' }, 'n12'], [{ type: 'annex', num: 'V' }, 'ptB'], [{ type: 'article', num: '8' }, 'p2.b.d1'],
  ];
  return html`<div class="tbl-scroll"><table class="tbl-data g-cite"><thead><tr><th>${t('guide.cite.colDe')}</th><th>${t('guide.cite.colFr')}</th></tr></thead><tbody>
    ${ex.map(([u, k]) => html`<tr><td lang="de">${cite(u, k, 'de', data.abbr)}</td><td lang="fr">${cite(u, k, 'fr', data.abbr)}</td></tr>`)}
  </tbody></table></div>`;
}

export function GuideView({ data, route }) {
  const ref = useRef();
  useEffect(() => {
    const id = route.sec ? 'g-' + route.sec : null;
    const el = id && document.getElementById(id);
    if (el && el.scrollIntoView) { el.scrollIntoView({ block: 'start' }); el.focus({ preventScroll: true }); }
    else if (ref.current) ref.current.scrollTop = 0;
  }, [route.sec]);
  const jump = (sec) => (e) => { e.preventDefault(); go({ sec }, { replace: true }); const el = document.getElementById('g-' + sec); if (el) { el.scrollIntoView({ block: 'start' }); el.focus({ preventScroll: true }); } };
  const lang = route.l;
  return html`<div class="view view-guide" ref=${ref}><main class="wide narrow guide" id="main" tabindex="-1">
    <header class="unit-head"><p class="unit-label">SGK Navigator</p><h1 class="unit-title">${t('nav.anleitung')}</h1><p class="ov-lead">${t('guide.lead')}</p>
      <p class="g-negref"><${Icon} name="book" /><span>${t('guide.negRef')} <a href="#/n-anleitung" onClick=${(e) => { e.preventDefault(); go({ view: 'n-anleitung', sec: null }); }}>${t('guide.negRefLink')}</a></span></p></header>

    <nav class="g-toc" aria-label=${t('guide.toc')}>
      <h2 class="g-toc-title">${t('guide.toc')}</h2>
      <ol>
        ${SECTIONS.map((s) => html`<li><a href=${'#/anleitung?sec=' + s} onClick=${jump(s)}>${t('guide.sec.' + s)}</a>
          ${s === 'aufgaben' ? html`<ol>${TASKS.map((x) => html`<li><a href=${'#/anleitung?sec=' + x} onClick=${jump(x)}>${t(`guide.task.${x}.title`)}</a></li>`)}</ol>` : null}</li>`)}
      </ol>
    </nav>

    <section class="g-sec" id="g-zweck" tabindex="-1" aria-labelledby="gs-zweck">
      <h2 id="gs-zweck">${t('guide.sec.zweck')}</h2>
      ${list('guide.zweck.text').map((p) => html`<p>${rich(p)}</p>`)}
      <div class="notice notice-warning" role="note"><${Icon} name="warning" /><div><strong>${t('info.liability.lead')}</strong> ${t('info.liability.text', { mode: t('read.mode.datum') })}</div></div>
    </section>

    <section class="g-sec" id="g-grundbegriffe" tabindex="-1" aria-labelledby="gs-grundbegriffe">
      <h2 id="gs-grundbegriffe">${t('guide.sec.grundbegriffe')}</h2>
      <dl class="g-terms">${list('guide.terms').map(([term, def]) => html`<dt>${term}</dt><dd>${rich(def)}</dd>`)}</dl>
    </section>

    <section class="g-sec" id="g-aufgaben" tabindex="-1" aria-labelledby="gs-aufgaben">
      <h2 id="gs-aufgaben">${t('guide.sec.aufgaben')}</h2>
      ${TASKS.map((id) => html`<${Steps} id=${id} />`)}
    </section>

    <section class="g-sec" id="g-legende" tabindex="-1" aria-labelledby="gs-legende">
      <h2 id="gs-legende">${t('guide.sec.legende')}</h2>
      <p>${t('guide.legend.intro')}</p>
      <${Legend} data=${data} lang=${lang} />
    </section>

    <section class="g-sec" id="g-zitierweise" tabindex="-1" aria-labelledby="gs-zitierweise">
      <h2 id="gs-zitierweise">${t('guide.sec.zitierweise')}</h2>
      ${list('guide.cite.text').map((p) => html`<p>${rich(p)}</p>`)}
      <${Citation} data=${data} />
    </section>

    <section class="g-sec" id="g-tastatur" tabindex="-1" aria-labelledby="gs-tastatur">
      <h2 id="gs-tastatur">${t('guide.sec.tastatur')}</h2>
      <dl class="g-keys">${list('guide.keys').map(([k, d]) => html`<dt>${k.split('+').map((x, i) => html`${i ? ' + ' : ''}<kbd>${x}</kbd>`)}</dt><dd>${rich(d)}</dd>`)}</dl>
    </section>

    <section class="g-sec" id="g-grenzen" tabindex="-1" aria-labelledby="gs-grenzen">
      <h2 id="gs-grenzen">${t('guide.sec.grenzen')}</h2>
      <ul class="g-list">${[...list('guide.limits'), ...list('guide.limits2')].map((p) => html`<li>${rich(p)}</li>`)}</ul>
    </section>
  </main></div>`;
}
