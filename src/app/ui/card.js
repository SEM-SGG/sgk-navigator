// Exportkarte: Titel in Zitierweise, Inhalt (Chronologie oder Vergleich), Legende, Quellenzeile.
// Sprache der Karte = Oberflächensprache bei der Erstellung (spec.ui); export.js rendert sie mit withUiLang.
import { CARBON } from '../tokens.js';
import { html } from 'htm/preact';
import { cite } from '../lib/cite.js';
import { fmtDate, todayIso, LANG_CODES, plain } from '../lib/format.js';
import { t, uiLang } from '../lib/i18n.js';
import { blockSteps, unitSteps, actMetaLine, unitStepLabel } from './chronology.js';
import { compareRows, CompareTable, compareStats } from './compare.js';
import { changeLabel } from '../data.js';
import { BlockBody } from './blocks.js';
import { rationaleFor } from './rationale.js';
import { settingsStore } from '../app.js';
import { safeInline } from '../lib/sanitize.js';

/** Begründung in der Bildkarte (Einstellung «Begründung in Exportkarten») */
function CardRat({ data, celex, unitId, k, lang }) {
  if (!settingsStore.get().ratExport) return null;
  const list = rationaleFor(data, celex, unitId, k, lang);
  if (!list.length) return null;
  return html`<div class="card-rat cbrk"><div class="card-rat-h">${t('rat.title')} <span>(${t('rat.editorial')})</span></div>
    ${list.map((x) => html`<div class="card-rat-i"><b>(${x.n})</b> <span class="card-rat-s">${t('rat.' + x.strength)}</span> <span class="legal" lang=${lang} dangerouslySetInnerHTML=${{ __html: safeInline(x.text) }}></span></div>`)}</div>`;
}

export const FORMATS = {
  a4: { w: 794, labelKey: 'export.fmt.a4' },
  169: { w: 1280, h: 720, labelKey: 'export.fmt.169' },
};
export const formatLabel = (f) => t((FORMATS[f] || FORMATS.a4).labelKey);

export function cardTitle(data, spec) {
  return cite(data.unitMeta(spec.unit), spec.key || null, uiLang(), data.abbr);
}
export function cardSubtitle(data, spec) {
  const legal = spec.kind === 'compare' && spec.cm === 'sprache' ? null : spec.lang;
  const ll = legal && legal !== uiLang() ? ` (${t('card.legalText', { lang: LANG_CODES[legal] })})` : '';
  if (spec.kind === 'block' || spec.kind === 'unit') return t('card.subChron') + ll;
  if (spec.cm === 'sprache') return t('card.subLang', { a: LANG_CODES[spec.la], b: LANG_CODES[spec.lb], stage: data.stageLabel(spec.a) });
  return t('card.subCompare', { a: data.stageLabel(spec.a), b: data.stageLabel(spec.b) }) + ll;
}

/** Quellenzeile und Hinweis einer Karte (auch für Word, PDF mit Text, Zwischenablage). */
export function sourceParts(data, spec, stagesUsed) {
  const recon = stagesUsed.filter((s) => data.isReconstructed(s));
  const real = stagesUsed.filter((s) => { const st = data.stage(s); return !(st && st.source && st.source.kind === 'preview'); });
  const latest = real.length ? real.reduce((a, b) => (data.stageIndex(b) > data.stageIndex(a) ? b : a)) : data.preview ? data.preview.base : data.latest.id;
  const l = uiLang();
  const workNo = data.work.celex === '32016R0399' ? t('card.workName') : data.actName(data.work.celex);
  const stDate = data.stageDate(latest);
  let source = t('card.source', { work: workNo, abbr: data.abbr[l] || data.abbr.de, stage: data.stageLabel(latest), date: stDate && !data.isConsStage(latest) ? ' (' + fmtDate(stDate) + ')' : '' });
  if (recon.length) source += ' ' + t('card.reconStages', { list: recon.map((r) => data.stageName(r, { short: true })).join(', ') });
  if (data.preview) source += ' ' + t('preview.cardSource', { dossier: data.preview.dossier.short || data.preview.dossier.title || data.preview.dossier.id });
  if (!data.full) source += ' ' + t('card.consNote');
  const disclaimer = (data.preview ? t('preview.cardDisclaimer') + ' ' : '') + t('card.disclaimer') + ' ' + t('card.created', { date: fmtDate(todayIso()) });
  return { source, disclaimer };
}
function sourceLine(data, spec, stagesUsed) {
  const p = sourceParts(data, spec, stagesUsed);
  return p.source + ' ' + p.disclaimer;
}

function Legend({ data, acts, diff, pending }) {
  return html`<div class="card-legend">
    ${acts.map((c) => html`<span class="lg-item"><span class=${'sw' + (data.isPending(c) ? ' sw-pending' : '')} style=${{ '--act': data.color(c) }}></span><b>${data.actCode(c)}</b> ${data.actName(c)}${data.isPending(c) ? ', ' + data.status(c).label : ''}</span>`)}
    ${diff ? html`<span class="lg-item"><ins>${t('change.inserted')}</ins></span><span class="lg-item"><del>${t('change.deleted')}</del></span>` : null}
    ${pending ? html`<span class="lg-item"><span class="sw sw-pending" style=${{ '--act': CARBON['ink-muted'] }}></span>${t('card.lgPending')}</span>` : null}
  </div>`;
}

function CardBlockChron({ data, spec, collect }) {
  const steps = blockSteps(data, spec.unit, spec.lang, spec.key);
  return html`<ol class="card-chron">${steps.map((s) => {
    collect.acts.add(s.origin); collect.stages.add(s.stage);
    if (data.isPending(s.origin)) collect.pending = true;
    if (s.change !== 'base') collect.diff = true;
    return html`<li class=${'cstep cbrk' + (data.isPending(s.origin) ? ' is-pending' : '')} style=${{ '--act': data.color(s.origin) }}>
      <div class="cstep-head"><b>${data.actCode(s.origin)}</b><span>${data.actName(s.origin)}</span><span class="cstep-chg">${changeLabel(s.change)}</span>${data.isReconstructed(s.stage) ? html`<span class="cstep-recon">${data.sourceLabel(s.stage)}</span>` : null}</div>
      <div class="cstep-meta">${[actMetaLine(data, s.origin), data.status(s.origin).label].filter(Boolean).join(' | ')}</div>
      <div class="cstep-text legal" lang=${spec.lang}>${s.block && s.block.l ? html`<span class="lbl-inline">${s.block.l}</span>` : null}${s.block && (s.block.ty === 'table' || s.block.ty === 'img') ? html`<${BlockBody} data=${data} b=${s.block} />` : html`<span dangerouslySetInnerHTML=${{ __html: s.textHtml || '' }}></span>`}</div>
      ${s.change !== 'base' ? html`<${CardRat} data=${data} celex=${s.origin} unitId=${spec.unit} k=${spec.key} lang=${spec.lang} />` : null}
    </li>`;
  })}</ol>`;
}

function CardUnitChron({ data, spec, collect }) {
  const steps = unitSteps(data, spec.unit, spec.lang);
  const meta = data.unitMeta(spec.unit);
  return html`<ol class="card-chron">${steps.map((s) => {
    collect.acts.add(s.act); collect.stages.add(s.stage);
    if (data.isPending(s.act)) collect.pending = true;
    if (s.items.length) collect.diff = true;
    return html`<li class=${'cstep cbrk' + (data.isPending(s.act) ? ' is-pending' : '')} style=${{ '--act': data.color(s.act) }}>
      <div class="cstep-head"><b>${data.actCode(s.act)}</b><span>${data.actName(s.act)}</span><span class="cstep-chg">${unitStepLabel(data, s)}</span>${data.isReconstructed(s.stage) ? html`<span class="cstep-recon">${data.sourceLabel(s.stage)}</span>` : null}</div>
      <div class="cstep-meta">${[actMetaLine(data, s.act), data.status(s.act).label].filter(Boolean).join(' | ')}</div>
      ${!s.first ? html`<${CardRat} data=${data} celex=${s.act} unitId=${spec.unit} k=${null} lang=${spec.lang} />` : null}
      ${s.items.map((it) => html`<div class="citem cbrk"><div class="citem-k">${it.key ? cite(meta, it.key, uiLang(), null) : it.title ? t('chron.heading') : t('common.wholeUnit')} <span>${changeLabel(it.change)}</span></div>${it.html != null ? html`<div class="legal" lang=${spec.lang} dangerouslySetInnerHTML=${{ __html: it.html }}></div>` : null}</div>`)}
    </li>`;
  })}</ol>`;
}

function CardCompare({ data, spec, collect }) {
  const mode = spec.cm || 'stand';
  const opts = mode === 'sprache'
    ? { a: spec.a, b: spec.a, la: spec.la, lb: spec.lb, key: spec.key, mode }
    : { a: spec.a, b: spec.b, la: spec.lang, lb: spec.lang, key: spec.key, mode };
  const res = compareRows(data, spec.unit, opts);
  collect.stages.add(spec.a); if (mode !== 'sprache') collect.stages.add(spec.b);
  for (const r of res.rows) {
    if (r.right && r.right.o && r.right.o !== data.work.celex && (spec.sc === 'full' || r.status !== 'same')) collect.acts.add(r.right.o);
    if (r.status !== 'same') collect.diff = mode !== 'sprache';
  }
  for (const c of collect.acts) if (data.isPending(c)) collect.pending = true;
  const st = compareStats(res.rows);
  const headA = mode === 'sprache' ? LANG_CODES[spec.la] : data.stageLabel(spec.a, { short: true });
  const headB = mode === 'sprache' ? LANG_CODES[spec.lb] : data.stageLabel(spec.b, { short: true });
  return html`<div>
    ${mode !== 'sprache' ? html`<p class="card-stats">${t('card.stats', { c: st.changed, i: st.ins, d: st.del })}</p>` : null}
    <${CompareTable} data=${data} unitId=${spec.unit} result=${res} layout=${spec.lay || 'side'} scope=${spec.sc || 'changed'} mode=${mode} headA=${headA} headB=${headB} showOrigin=${mode !== 'sprache'} langA=${mode === 'sprache' ? spec.la : spec.lang} langB=${mode === 'sprache' ? spec.lb : spec.lang} />
  </div>`;
}

export function Card({ data, spec, fs = 16 }) {
  const f = FORMATS[spec.format] || FORMATS.a4;
  const collect = { acts: new Set(), stages: new Set(), diff: false, pending: false };
  const body = spec.kind === 'block' ? html`<${CardBlockChron} data=${data} spec=${spec} collect=${collect} />`
    : spec.kind === 'unit' ? html`<${CardUnitChron} data=${data} spec=${spec} collect=${collect} />`
    : html`<${CardCompare} data=${data} spec=${spec} collect=${collect} />`;
  // body muss vor Legende/Quelle ausgewertet werden: htm erzeugt VNodes lazily, deshalb hier vorab rendern
  return html`<${CardFrame} data=${data} spec=${spec} f=${f} fs=${fs} body=${body} collect=${collect} />`;
}

function CardFrame({ data, spec, f, fs, body, collect }) {
  const meta = data.unitMeta(spec.unit);
  const l = spec.lang || spec.la || 'de';
  const ti = data.unitTitle(spec.unit, l, spec.b || spec.a || data.latest.id);
  const unitTitle = ti.label;
  const ui = uiLang();
  return html`<article class=${'card card-' + spec.format} lang=${ui} style=${{ width: f.w + 'px', minHeight: f.h ? f.h + 'px' : undefined, '--fs': fs + 'px' }}>
    <header class="card-head cbrk">
      <div class="card-brand"><span><b>SGK</b> Navigator</span><span>${data.work.short ? data.work.short[ui] || data.work.short.de : ''}</span></div>
      <h1 class="card-title">${cardTitle(data, spec)}</h1>
      <p class="card-sub">${cardSubtitle(data, spec)}</p>
      ${unitTitle ? html`<p class="card-unit">${cite(meta, null, ui, null)}: <span lang=${ti.text ? l : undefined}>${plain(unitTitle)}</span></p>` : null}
    </header>
    <div class="card-body">${body}</div>
    <${CardFoot} data=${data} spec=${spec} collect=${collect} />
  </article>`;
}

function CardFoot({ data, spec, collect }) {
  return html`<footer class="card-foot cbrk">
    <${Legend} data=${data} acts=${[...collect.acts].filter((c) => c && c !== data.work.celex)} diff=${collect.diff} pending=${collect.pending} />
    <p class="card-source">${sourceLine(data, spec, [...collect.stages].filter(Boolean))}</p>
  </footer>`;
}
