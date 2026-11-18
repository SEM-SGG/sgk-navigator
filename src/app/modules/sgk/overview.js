// Übersicht: Kennzahlen, Zeitstrahl der Akte, Verweisstruktur, Änderungsmatrix.
import { html } from 'htm/preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { go } from '../../state.js';
import { ActChip, HelpLink, LegalLangSwitch, Icon, TitleText } from '../../ui/common.js';
import { fmtDate, fmtNum } from '../../lib/format.js';
import { cite } from '../../lib/cite.js';
import { kindLabel } from '../../data.js';
import { t, uiLang } from '../../lib/i18n.js';
import { sgkExtras } from '../../library.js';
import { Notice } from '../../ui/common.js';
import { RefsStructure } from '../../ui/refsstructure.js';

/** Änderungen mit eigenem Anwendungsdatum oder Frist (nur Werke mit geprüfter Anwendbarkeit) */
function ownDates(data) {
  if (!data.full) return [];
  const out = [];
  for (const a of data.actList) {
    const actDate = a.application && a.application.date;
    for (const c of a.changes || []) {
      const from = c.applicableFrom && c.applicableFrom !== actDate ? c.applicableFrom : null;
      const per = (c.periods || []).filter((p) => p.until);
      if (!from && !per.length) continue;
      out.push({ celex: a.celex, unit: c.unit, key: c.key || null, from, periods: per, basis: c.basis, confidence: a.confidence });
    }
  }
  return out;
}
const derogs = (data) => (data.workId === 'sgk' ? sgkExtras().derogations || [] : []);

function Figures({ data }) {
  const nArt = data.unitOrder.filter((id) => data.unitMeta(id).type === 'article').length;
  const nAnx = data.unitOrder.filter((id) => data.unitMeta(id).type === 'annex').length;
  const changed = data.unitOrder.filter((id) => data.unitActs(id).length > 0);
  const changedArt = changed.filter((id) => data.unitMeta(id).type === 'article').length;
  const stageActs = [...new Set(data.stages.map((s) => s.act).filter((c) => c && !/^0/.test(c)))];
  const pending = data.actList.filter((a) => a.kind !== 'proposal' && data.isPending(a.celex) && data.stageOfAct.has(a.celex));
  const nRecon = data.stages.filter((s) => data.isReconstructed(s.id)).length;
  const nProp = data.actList.filter((a) => a.kind === 'proposal' && !data.status(a.celex).closed).length;
  const fig = (v, l, sub) => html`<div class="fig-item"><div class="fig-v">${fmtNum(v)}</div><div class="fig-l">${l}</div>${sub ? html`<div class="fig-s">${sub}</div>` : null}</div>`;
  return html`<div class="figs">
    ${fig(data.stages.length, t('ov.fig.stages', { n: data.stages.length }), data.full ? t('ov.fig.stagesSub', { n: nRecon }) : t('ov.cons.stagesSub'))}
    ${fig(changedArt, t('ov.fig.changedArt', { n: changedArt }), t('ov.fig.changedArtSub', { art: nArt, anx: changed.length - changedArt, anxTotal: nAnx }))}
    ${fig(stageActs.length - 1, t('ov.fig.acts', { n: stageActs.length - 1 }), !data.full ? t('ov.cons.actsSub') : pending.length ? t('ov.fig.actsPending', { n: pending.length }) : t('ov.fig.actsAllApplicable'))}
    ${fig(nProp, t('ov.fig.proposals', { n: nProp }), t('ov.fig.proposalsSub'))}
  </div>`;
}

const toNum = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? Number(m[1]) + (Number(m[2]) - 1) / 12 + (Number(m[3]) - 1) / 365 : null; };

/** Breite eines Elements (für Achsenbeschriftungen ohne Überlappung). */
function useWidth(ref) {
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const el = ref.current;
    setW(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return w;
}

let measureCtx = null;
/** Textbreite in px (Canvas), Ersatz: Schätzung über die Zeichenzahl. */
function textWidth(s, font) {
  try {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = font;
    return Math.ceil(measureCtx.measureText(s).width);
  } catch { return s.length * 7; }
}

/**
 * Achse: Jahreszahlen und "heute" ohne Überlappung und ohne Überstand an den Rändern.
 * "heute" hat Vorrang; Jahreszahlen, die mit einer bereits gesetzten Beschriftung kollidieren, entfallen.
 */
export function axisLabels(w, t0, t1, now, todayLabel, measure) {
  const GAP = 8;
  const px = (v) => ((v - t0) / (t1 - t0)) * w;
  const box = (x, width) => {
    let l = x - width / 2;
    l = Math.max(0, Math.min(w - width, l));
    return { l, r: l + width };
  };
  const out = [];
  const tw = measure(todayLabel, true);
  const tb = box(px(now), tw);
  out.push({ text: todayLabel, today: true, ...tb });
  for (let y = t0; y <= t1; y++) {
    const b = box(px(y), measure(String(y), false));
    if (out.some((o) => b.l < o.r + GAP && b.r > o.l - GAP)) continue;
    out.push({ text: String(y), ...b });
  }
  return out;
}

function Axis({ t0, t1, now }) {
  const ref = useRef();
  const w = useWidth(ref);
  const [, setFontsReady] = useState(false);
  useEffect(() => { if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => setFontsReady(true)); }, []);
  const labels = w ? axisLabels(w, t0, t1, now, t('ov.tl.today'), (s, bold) => textWidth(s, `${bold ? 600 : 400} 12px "IBM Plex Sans"`) + 2) : [];
  return html`<div class="tl-track tl-axis-track" ref=${ref}>
    ${labels.map((o) => html`<span class=${o.today ? 'tl-today' : 'tl-year'} style=${{ left: `${o.l}px` }}>${o.text}</span>`)}
  </div>`;
}

function Timeline({ data }) {
  const acts = data.actList.slice().sort((a, b) => (a.adopted || a.published || '').localeCompare(b.adopted || b.published || ''));
  const years0 = acts.map((a) => toNum(a.adopted || a.published)).filter((v) => v != null);
  const t0 = Math.min(2016, Math.floor(Math.min(...years0, 2016))), now = toNum(data.today);
  const own = ownDates(data);
  const dg = derogs(data);
  const t1 = Math.ceil(Math.max(now + 0.6, ...acts.map((a) => toNum(a.application && a.application.date) || 0)) + 0.2);
  const x = (v) => `${((v - t0) / (t1 - t0)) * 100}%`;
  const years = [];
  for (let y = t0; y <= t1; y++) years.push(y);
  const [showCorr, setShowCorr] = useState(false);
  const corr = acts.filter((a) => a.kind === 'corrigendum');
  const rows = acts.filter((a) => a.kind !== 'corrigendum' || showCorr);
  const firstUnit = (celex) => data.unitOrder.find((u) => data.unitActs(u).includes(celex));
  return html`<section class="ov-sec" aria-labelledby="tl-h">
    <div class="sec-head"><h2 id="tl-h">${t('ov.tl.title')}</h2>
      <p class="sec-note">${t('ov.tl.note')}</p>
      <label class="check"><input type="checkbox" checked=${showCorr} onChange=${(e) => setShowCorr(e.target.checked)} />${t('ov.tl.showCorr', { n: corr.length })}</label>
      <${HelpLink} sec="uebersicht" />
    </div>
    <div class="tl" role="table" aria-label=${t('ov.tl.title')}>
      <div class="tl-row tl-axis" role="row">
        <div class="tl-label tl-colhead" role="columnheader">${t('ov.tl.colAct')}</div>
        <div class="tl-status tl-colhead" role="columnheader">${t('ov.tl.colStatus')}</div>
        <div class="tl-colhead" role="columnheader"><span class="sr">${t('ov.tl.colTime')}</span><${Axis} t0=${t0} t1=${t1} now=${now} /></div>
      </div>
      ${rows.map((a) => {
        const st = data.status(a.celex);
        const p = toNum(a.adopted || a.published);
        const ap = toNum(a.application && a.application.date);
        const inData = data.stageOfAct.has(a.celex);
        const fu = firstUnit(a.celex);
        const tip = [data.actName(a.celex), a.adopted || a.published ? (a.kind === 'proposal' ? t('ov.tl.presentedOn', { date: fmtDate(a.adopted || a.published) }) : t('chron.adoptedOn', { date: fmtDate(a.adopted || a.published) })) : '', st.label].filter(Boolean).join(' | ');
        const kindLine = `${kindLabel(a.kind)}${inData || a.kind === 'proposal' || a.kind === 'derogation' || a.kind === 'implementing' ? '' : ', ' + t('ov.tl.noStage')}`;
        const actCell = fu
          ? html`<button type="button" class="tl-act" title=${t('ov.tl.openTip', { name: data.actName(a.celex) })} onClick=${() => go({ view: 'lesen', u: fu, k: null, act: a.celex, ch: '0', q: null })}>
              <${ActChip} data=${data} celex=${a.celex} number /><span class="tl-kind">${kindLine}</span><${Icon} name="chevron-right" /></button>`
          : html`<div class="tl-act is-static" title=${tip}><${ActChip} data=${data} celex=${a.celex} number /><span class="tl-kind">${kindLine}</span></div>`;
        return html`<div class=${'tl-row' + (st.pending ? ' is-pending' : '') + (a.kind === 'proposal' ? ' is-proposal' : '')} role="row" style=${{ '--act': data.color(a.celex) }}>
          <div class="tl-label" role="cell">${actCell}</div>
          <div class=${'tl-status st-' + st.kind} role="cell">${st.unknown ? html`<span class="muted">${t('info.unknownApp')}</span>` : st.kind === 'pending' || st.kind === 'future' || st.kind === 'partly' ? html`<span class=${'tag ' + (st.kind === 'partly' ? 'tag-partly' : 'tag-pending')}>${st.label}</span>` : st.label}</div>
          <div class="tl-track" role="cell" title=${tip}>
            ${years.map((y) => html`<span class="tl-grid" style=${{ left: x(y) }}></span>`)}
            <span class="tl-today-line" style=${{ left: x(now) }}></span>
            ${p != null && a.kind !== 'proposal' && !st.unknown ? html`<span class="tl-wait" style=${{ left: x(p), width: `calc(${ap != null ? x(Math.min(ap, t1)) : x(now)} - ${x(p)})` }}></span>` : null}
            ${p != null && a.kind === 'proposal' ? html`<span class="tl-wait tl-prop" style=${{ left: x(p), width: `calc(${x(st.end ? Math.max(toNum(st.end), p) : now)} - ${x(p)})` }}></span>` : null}
            ${ap != null && !st.pending ? html`<span class="tl-apply" style=${{ left: x(ap), width: `calc(100% - ${x(ap)})` }}></span>` : null}
            ${ap != null && st.kind === 'future' ? html`<span class="tl-apply tl-future" style=${{ left: x(ap), width: `calc(100% - ${x(ap)})` }}></span>` : null}
            ${p != null ? html`<span class="tl-adopt" style=${{ left: x(p) }}></span>` : null}
            ${dg.filter((d) => d.celex === a.celex && d.from && d.until).map((d) => html`<span class="tl-derog" style=${{ left: x(toNum(d.from)), width: `calc(${x(toNum(d.until) + 1 / 365)} - ${x(toNum(d.from))})` }} title=${t('ov.tl.derogTip', { name: data.actName(a.celex), from: fmtDate(d.from), until: fmtDate(d.until) })}></span>`)}
            ${own.filter((o) => o.celex === a.celex && o.from).map((o) => html`<span class="tl-own" style=${{ left: x(toNum(o.from)) }} title=${t('ov.tl.changeTip', { cite: cite(data.unitMeta(o.unit), o.key, uiLang(), data.abbr), date: fmtDate(o.from) })}></span>`)}
          </div>
        </div>`;
      })}
    </div>
    <p class="legend-line"><span class="lg"><span class="lg-dot"></span>${t('ov.tl.lgAdopted')}</span><span class="lg"><span class="lg-dash"></span>${t('legend.pending')}</span><span class="lg"><span class="lg-dot-line"></span>${t('ov.tl.lgProposal')}</span><span class="lg"><span class="lg-bar"></span>${t('ov.tl.lgApplicable')}</span>${dg.length ? html`<span class="lg"><span class="lg-derog"></span>${t('ov.tl.lgDerog')}</span>` : null}${own.length ? html`<span class="lg"><span class="lg-own"></span>${t('ov.tl.lgChange')}</span>` : null}<span class="lg"><span class="lg-today"></span>${t('ov.tl.today')}</span></p>
  </section>`;
}

/** Abweichende Anwendung einzelner Änderungen und Abweichungen ohne Textänderung (Erweiterung 8) */
function OwnDates({ data }) {
  const own = ownDates(data);
  const dg = derogs(data);
  if (!own.length && !dg.length) return null;
  const confTag = (c, computed) => html`${c === 'check' ? html`<span class="tag tag-partly">${t('notice.check')}</span>` : html`<span class="tag tag-ok">${t('ov.app.verified')}</span>`}${computed ? html` <span class="tag tag-recon">${t('notice.computed')}</span>` : null}`;
  return html`<section class="ov-sec" aria-labelledby="app-h">
    <div class="sec-head"><h2 id="app-h">${t('ov.app.title')}</h2><p class="sec-note">${t('ov.app.note')}</p><${HelpLink} sec="anwendbarkeit" /></div>
    <div class="tbl-scroll"><table class="tbl-data" id="tbl-owndates"><thead><tr><th>${t('ov.app.colAct')}</th><th>${t('ov.app.colWhat')}</th><th>${t('ov.app.colWhen')}</th><th>${t('ov.app.colBasis')}</th><th>${t('ov.app.colConf')}</th></tr></thead><tbody>
      ${own.map((o) => html`<tr>
        <td><${ActChip} data=${data} celex=${o.celex} number /></td>
        <td><button type="button" class="link" onClick=${() => go({ view: 'chronik', u: o.unit, k: o.key || null })}>${cite(data.unitMeta(o.unit), o.key, uiLang(), data.abbr)}</button></td>
        <td>${o.from ? html`<span class="nw">${t('ov.app.fromDate', { date: fmtDate(o.from) })}</span>` : null}${o.periods.map((p) => html`<br /><span class="nw">${t('ov.app.limited', { date: fmtDate(p.until) })}</span> ${p.key ? cite(data.unitMeta(o.unit), p.key, uiLang(), null) : ''}`)}</td>
        <td class="small">${data.loc(o.basis)}</td>
        <td>${confTag(o.confidence, o.periods.some((p) => p.computed))}</td></tr>`)}
      ${dg.map((d) => html`<tr>
        <td><${ActChip} data=${data} celex=${d.celex} number /></td>
        <td><details><summary>${t('ov.app.derog', { n: d.affects.length })}</summary><ul class="small own-list">${d.affects.map((a) => html`<li><button type="button" class="link" onClick=${() => go({ view: 'lesen', u: a.unit, k: a.key || null, m: 'datum', d: d.from })}>${cite(data.unitMeta(a.unit), a.key || null, uiLang(), null)}</button>: ${t('notice.kind.' + a.effect)}</li>`)}</ul></details></td>
        <td class="nw">${t('notice.period', { from: fmtDate(d.from), until: fmtDate(d.until) })}</td>
        <td class="small">${data.loc((d.affects[0] || {}).basis)}${d.affects.length > 1 ? ' …' : ''}</td>
        <td>${confTag(d.confidence)}</td></tr>`)}
    </tbody></table></div>
  </section>`;
}

function Matrix({ data, lang, route }) {
  const [all, setAll] = useState(false);
  const cols = data.stages.slice(1);
  const grid = useMemo(() => {
    const m = new Map();
    for (const s of cols) {
      const l = !s.langs || s.langs.includes(lang) ? lang : s.langs[0];
      for (const c of data.changes(s.id, l)) {
        const key = c.unit;
        if (!m.has(key)) m.set(key, new Map());
        const row = m.get(key);
        const cell = row.get(s.id) || { ins: 0, rep: 0, del: 0, unit: null, lang: l };
        if (!c.key) cell.unit = c.change;
        else if (c.change === 'inserted') cell.ins++;
        else if (c.change === 'deleted') cell.del++;
        else cell.rep++;
        row.set(s.id, cell);
      }
    }
    return m;
  }, [data, lang]);
  const units = data.unitOrder.filter((id) => (all || grid.has(id)) && data.unitMeta(id).type !== 'recitals');
  const own = ownDates(data);
  const open = (u, s) => go({ view: 'vergleich', u, k: null, a: data.prevStage(s).id, b: s, cm: 'stand', sc: 'changed' });
  return html`<section class="ov-sec" aria-labelledby="mx-h">
    <div class="sec-head"><h2 id="mx-h">${t('ov.mx.title')}</h2>
      <p class="sec-note">${t('ov.mx.note')}</p>
      <label class="check"><input type="checkbox" checked=${all} onChange=${(e) => setAll(e.target.checked)} />${t('ov.mx.showAll')}</label>
      <${LegalLangSwitch} data=${data} route=${route} />
    </div>
    <div class="mx-wrap" tabindex="0" role="region" aria-label=${t('ov.mx.title')}>
      <table class="mx">
        <thead><tr><th class="mx-u" scope="col">${t('common.unit')}</th>${cols.map((s) => html`<th scope="col" class=${data.isPending(s.act) ? 'is-pending' : ''} style=${{ '--act': data.color(s.act) }} title=${data.actName(s.act) + (data.status(s.act).label ? ', ' + data.status(s.act).label : '')}>
          <span class="mx-sw"></span><span class="mx-code">${data.actCode(s.act)}</span><span class="mx-num">${data.actNum(s.act)}</span>${s.langs && s.langs.length < data.langs.length ? html`<span class="mx-num">${t('stage.onlyLangs', { langs: s.langs.map((x) => x.toUpperCase()).join(', ') })}</span>` : null}</th>`)}</tr></thead>
        <tbody>${units.map((u) => {
          const row = grid.get(u) || new Map();
          const meta = data.unitMeta(u);
          const ti = data.unitTitle(u, lang, data.latest.id);

          return html`<tr>
            <th scope="row" class="mx-u"><button type="button" class="link" onClick=${() => go({ view: 'lesen', u, k: null })}>${cite(meta, null, uiLang(), null)}</button> ${ti.repealed ? html`<span class="mx-t">${t('read.toc.repealed')}</span>` : html`<${TitleText} ti=${ti} lang=${lang} className="mx-t" />`}</th>
            ${cols.map((s) => {
              const c = row.get(s.id);
              if (!c) return html`<td class="mx-empty"></td>`;
              const sym = c.unit === 'inserted' ? '+' : c.unit === 'deleted' ? '−' : c.del && !c.ins && !c.rep ? '−' : c.ins && !c.rep && !c.del ? '+' : '±';
              const n = c.ins + c.rep + c.del;
              const what = c.unit === 'inserted' ? t('ov.mx.unitInserted') : c.unit === 'deleted' ? t('ov.mx.unitRepealed') : t('ov.mx.counts', { rep: c.rep, ins: c.ins, del: c.del });
              const ow = own.filter((o) => o.unit === u && o.celex === s.act && o.from);
              const label2 = `${cite(meta, null, uiLang(), data.abbr)}, ${data.actName(s.act)}: ${what}.${ow.length ? ' ' + ow.map((o) => t('ov.tl.changeTip', { cite: cite(meta, o.key, uiLang(), null), date: fmtDate(o.from) })).join('; ') + '.' : ''} ${t('ov.mx.clickTip')}`;
              return html`<td class=${'mx-cell' + (data.isPending(s.act) ? ' is-pending' : '') + (ow.length ? ' has-own' : '')} style=${{ '--act': data.color(s.act) }}>
                <button type="button" title=${label2} aria-label=${label2} onClick=${() => open(u, s.id)}><span class="mx-sym">${sym}</span>${n > 1 ? html`<span class="mx-n">${n}</span>` : null}</button></td>`;
            })}
          </tr>`;
        })}</tbody>
      </table>
    </div>
    <p class="legend-line"><span class="lg"><b class="mx-sym">+</b> ${t('ov.mx.lgIns')}</span><span class="lg"><b class="mx-sym">±</b> ${t('ov.mx.lgRep')}</span><span class="lg"><b class="mx-sym">−</b> ${t('ov.mx.lgDel')}</span><span class="lg">${t('ov.mx.lgNum')}</span><span class="lg"><span class="sw sw-pending" style=${{ '--act': 'var(--ink-muted)' }}></span>${t('ov.mx.lgPending')}</span>${own.length ? html`<span class="lg"><span class="mx-own-sample"></span>${t('ov.tl.lgChange')}</span>` : null}</p>
  </section>`;
}

/** Nummer des Werks für die Kennung: «2016/399» (aus dem Akt oder der CELEX-Nummer) */
const workNum = (data) => {
  const n = data.actNum(data.work.celex);
  if (n) return n;
  const m = /^3(\d{4})[RLD]0*(\d+)$/.exec(data.work.celex || '');
  return m ? `${m[1]}/${m[2]}` : '';
};

export function Overview({ data, route }) {
  const l = uiLang();
  return html`<div class="view view-overview">
    <div class="ov-inner">
      <div class="ov-top">
      <div class="ov-head">
        <p class="ov-eyebrow">${t('ov.eyebrow', { abbr: data.abbr[l] || data.abbr.de, num: workNum(data) })}</p>
        <h1>${data.work.short ? data.work.short[l] || data.work.short.de : ''}</h1>
        <p class="ov-lead">${data.work.title ? data.work.title[l] || data.work.title.de : ''}</p>
        <p class="ov-meta">${t('ov.dataAsOf', { date: fmtDate(data.ds.generated) })}${data.meta.status ? ' | ' + t('ov.dataStatus', { status: t('ov.status.' + (data.meta.status === 'final' ? 'final' : 'prelim')) }) : ''}${data.meta.fixtures ? ' | ' + t('ov.fixtures') : ''} | <a href="#/info">${t('ov.methodLink')}</a> | <a href="#/anleitung">${t('nav.anleitung')}</a></p>
      </div>
      <div class="ov-actions btn-group">
        <button type="button" class="btn btn-primary" id="ov-read" onClick=${() => go({ view: 'lesen' })}><${Icon} name="book" />${t('ov.readText')}</button>
        <button type="button" class="btn btn-tertiary" id="ov-chron" onClick=${() => go({ view: 'chronik', k: null })}><${Icon} name="clock" />${t('ov.openChron')}</button>
      </div>
      </div>
      <${Figures} data=${data} />
      ${!data.full ? html`<div class="ov-cons"><${Notice} kind="info">${t('ov.cons.note')}</${Notice}></div>` : null}
      <${Timeline} data=${data} />
      <${RefsStructure} data=${data} route=${route} />
      <${OwnDates} data=${data} />
      <${Matrix} data=${data} lang=${route.l} route=${route} />
    </div>
  </div>`;
}
