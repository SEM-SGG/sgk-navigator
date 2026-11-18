// Chronologie einer Bestimmung bzw. einer ganzen Einheit über alle Akte.
import { html } from 'htm/preact';
import { StatusTag, Swatch } from './common.js';
import { BlockBody } from './blocks.js';
import { diffText, markAll } from '../lib/diff.js';
import { safeInline } from '../lib/sanitize.js';
import { cite } from '../lib/cite.js';
import { fmtDate } from '../lib/format.js';
import { changeLabel, kindLabel } from '../data.js';
import { t, uiLang } from '../lib/i18n.js';
import { blockSig } from '../fallback-model.js';
import { RationaleBox } from './rationale.js';
import { AffectedNote } from './refs.js';
import { FormCompare, formCompareRows } from './forms.js';

/** Metaangaben eines Akts: Art (ausser Änderungsakt), Annahme, Fundstelle bzw. Veröffentlichung */
export function actMetaParts(data, celex) {
  const a = data.act(celex);
  if (!a) return [];
  const parts = [];
  if (a.kind && a.kind !== 'amendment') parts.push(kindLabel(a.kind));
  if (a.adopted) parts.push(t('chron.adoptedOn', { date: fmtDate(a.adopted) }));
  if (data.actOj(celex)) parts.push(data.actOj(celex));
  else if (a.published) parts.push(t('chron.publishedOn', { date: fmtDate(a.published) }));
  return parts;
}
/** Metazeile für Exportkarten (Trennzeichen « | ») */
export function actMetaLine(data, celex) {
  return actMetaParts(data, celex).join(' | ');
}

/** Kopf eines Eintrags nach ChronologyEntry: Farbfeld und Kurzname (card-title), Bezeichnung klein, Status rechts; Metazeile mit Mittelpunkt. */
function StepTitle({ data, celex, unitId, k }) {
  const pending = data.isPending(celex);
  return html`<div class="step-title">
      <h3 class="step-act" title=${data.actName(celex)}><span class=${'chip chip-title' + (pending ? ' chip-pending' : '')}><${Swatch} data=${data} celex=${celex} pending=${pending} /><span class="chip-code">${data.actCode(celex)}</span></span><small>${data.actName(celex)}</small></h3>
      <span class="step-tags"><${StatusTag} data=${data} celex=${celex} /><${ChangeAppTags} data=${data} celex=${celex} unitId=${unitId} k=${k} /></span>
    </div>
    ${actMetaParts(data, celex).length ? html`<p class="step-meta">${actMetaParts(data, celex).join(' · ')}</p>` : null}`;
}
const uc = (data, unitId, key, abbr = true) => cite(data.unitMeta(unitId), key, uiLang(), abbr ? data.abbr : null);

/** Abweichende Anwendbarkeit einer Einzeländerung (Erweiterung 8): { from, until, computed, basis } oder null */
export function changeAppFor(data, celex, unitId, key) {
  if (!data.full) return null;
  const a = data.act(celex);
  if (!a || !Array.isArray(a.changes)) return null;
  const r = data.changeApp(celex, unitId, key || null);
  if (!r || !r.change) return null;
  const actDate = a.application && a.application.date;
  const per = (r.change.periods || []).find((p) => !p.key || !key || key === p.key || key.startsWith(p.key + '.') || (p.key || '').startsWith(key + '.'));
  const from = r.change.applicableFrom && r.change.applicableFrom !== actDate ? r.change.applicableFrom : null;
  if (!from && !per) return null;
  return { from, until: per ? per.until : null, untilKey: per ? per.key : null, computed: !!(per && per.computed), basis: data.loc(r.change.basis) || '' };
}
function applicableFromFor(data, celex, unitId, key) {
  const r = changeAppFor(data, celex, unitId, key);
  return r && r.from ? r.from : null;
}

/** Kennzeichen: diese Änderung anwendbar ab …, befristet bis … (berechnet) */
export function ChangeAppTags({ data, celex, unitId, k }) {
  const r = changeAppFor(data, celex, unitId, k);
  if (!r) return null;
  return html`${r.from ? html` <span class="tag tag-partly" title=${r.basis}>${t('chron.thisChangeFrom', { date: fmtDate(r.from) })}</span>` : null}${r.until ? html` <span class="tag tag-partly" title=${r.basis}>${t('chron.limitedUntil', { date: fmtDate(r.until), cite: r.untilKey ? uc(data, unitId, r.untilKey, false) : '' })}</span>${r.computed ? html` <span class="tag tag-recon">${t('notice.computed')}</span>` : null}` : null}`;
}

/** Fassung (weitere Werke): «Konsolidierte Fassung vom …» und neu eingearbeitete Akte */
function ConsLine({ data, stageId }) {
  if (data.full) return null;
  const acts = data.stageActs(stageId);
  return html`<div class="step-meta">${data.stageLabel(stageId)}${acts.length ? ' · ' + t('chron.newActs', { list: acts.map((c) => data.actName(c)).join(', ') }) : ''}</div>`;
}

/** Schritte der Chronologie eines Blocks (für Anzeige und Export). */
export function blockSteps(data, unitId, lang, key) {
  const hist = data.history(unitId, lang, key);
  return hist.map((h, i) => {
    const prev = i > 0 ? hist[i - 1].block : null;
    const b = h.block;
    let textHtml = null;
    if (b && b.ty !== 'table' && b.ty !== 'img') {
      if (!prev) textHtml = i === 0 ? safeInline(b.t) : markAll(safeInline(b.t), 'ins');
      else textHtml = diffText(safeInline(prev.t), safeInline(b.t)).redline;
    } else if (!b && prev) textHtml = markAll(safeInline(prev.t), 'del');
    const origin = (b && b.o) || h.act;
    return { ...h, prev, textHtml, plainHtml: b ? safeInline(b.t) : '', origin, applicableFrom: applicableFromFor(data, h.act, unitId, key) };
  });
}

function SourceTag({ data, stageId }) {
  const s = data.stage(stageId);
  if (!s || !s.source) return null;
  const k = s.source.kind;
  if (k === 'reconstructed' || k === 'patched' || k === 'uploaded') return html`<span class="tag tag-recon" title=${data.sourceNote(stageId)}>${data.sourceLabel(stageId)}</span>`;
  return null;
}

export function BlockChronology({ data, unitId, k, lang, showDiff = true, compact = false, route = null, rationale = true }) {
  const steps = blockSteps(data, unitId, lang, k);
  if (!steps.length) return html`<p class="muted">${t('chron.noVersion', { cite: uc(data, unitId, k) })}</p>`;
  return html`${!data.preview ? html`<${AffectedNote} data=${data} unitId=${unitId} k=${k} lang=${lang} route=${route} />` : null}<ol class=${'chron' + (compact ? ' chron-compact' : '')}>
    ${steps.map((s, i) => html`<li class=${'step' + (data.isPending(s.act) ? ' is-pending' : '')} style=${{ '--act': data.color(s.origin) }}>
      <${StepTitle} data=${data} celex=${s.origin} unitId=${unitId} k=${k} />
      ${data.full && s.origin !== s.act ? html`<div class="step-meta">${data.stageLabel(s.stage)}</div>` : null}
      <${ConsLine} data=${data} stageId=${s.stage} />
      <div class="step-head">
        <span class=${'chg chg-' + s.change}>${changeLabel(s.change)}</span>
        <${SourceTag} data=${data} stageId=${s.stage} />
        ${s.block && s.block.x === 'editorial' ? html`<span class="tag tag-src" title=${t('chron.editorialTip')}>${t('chron.editorial')}</span>` : null}
      </div>
      <div class="step-text legal" lang=${lang}>
        ${s.block ? html`<span class="lbl-inline">${s.block.l || ''}</span>` : null}
        ${s.block && (s.block.ty === 'table' || s.block.ty === 'img')
          ? html`<${BlockBody} data=${data} b=${s.block} compareTo=${i > 0 ? s.prev : undefined} unitId=${unitId} lang=${lang} stageId=${s.stage} />`
          : html`<span dangerouslySetInnerHTML=${{ __html: showDiff ? s.textHtml || '' : s.plainHtml || (s.prev ? safeInline(s.prev.t) : '') }}></span>`}
        ${!s.block ? html` <span class="state-tag" lang=${uiLang()}>${changeLabel('deleted')}</span>` : null}
      </div>
      ${s.block && s.block.ty === 'img' && i > 0 && s.prev && s.prev.ty === 'img' && formCompareRows(data, unitId, s.prev, s.block, lang) ? html`<details class="form-cmp-box" open><summary>${t('forms.cmpTitle')}</summary><${FormCompare} data=${data} unitId=${unitId} oldB=${s.prev} newB=${s.block} lang=${lang} /></details>` : null}
      ${rationale && s.change !== 'base' ? html`<${RationaleBox} data=${data} celex=${s.origin} unitId=${unitId} k=${k} lang=${lang} />` : null}
    </li>`)}
  </ol>`;
}

/** Änderungsschritte mit Begründung (für die Seitenleiste der Chronologie): [{ celex, stage }] je Akt, ohne Basistext. */
export function rationaleSteps(data, unitId, lang, k) {
  const out = [];
  if (k) { for (const s of blockSteps(data, unitId, lang, k)) if (s.change !== 'base') out.push({ celex: s.origin, stage: s.stage }); }
  else for (const s of unitSteps(data, unitId, lang)) if (!s.first) out.push({ celex: s.act, stage: s.stage });
  const seen = new Set();
  return out.filter((x) => (seen.has(x.celex) ? false : seen.add(x.celex)));
}

/** Änderungsschritte einer ganzen Einheit. */
export function unitSteps(data, unitId, lang) {
  const vs = data.versions(unitId, lang);
  return vs.map((v, i) => {
    const p = i > 0 ? vs[i - 1] : null;
    const s = data.stage(v.stage);
    const items = [];
    if (p) {
      if (v.repealed && !p.repealed) items.push({ key: null, change: 'repealed' });
      else if (!v.repealed) {
        const pm = new Map((p.blocks || []).map((b) => [b.k, b]));
        const nm = new Map((v.blocks || []).map((b) => [b.k, b]));
        if ((v.title || '') !== (p.title || '')) items.push({ key: null, change: 'amended', title: true, html: diffText(p.title || '', v.title || '').redline });
        for (const b of v.blocks || []) {
          const o = pm.get(b.k);
          if (!o) items.push({ key: b.k, change: 'inserted', b, html: b.ty === 'table' || b.ty === 'img' ? null : markAll(safeInline(b.t), 'ins') });
          else if (blockSig(o) !== blockSig(b)) items.push({ key: b.k, change: 'replaced', b, prev: o, html: b.ty === 'table' || b.ty === 'img' ? null : diffText(safeInline(o.t), safeInline(b.t)).redline });
        }
        for (const b of p.blocks || []) if (!nm.has(b.k)) items.push({ key: b.k, change: 'deleted', b, html: markAll(safeInline(b.t), 'del') });
      }
    }
    return { stage: v.stage, act: s && s.act, first: i === 0, version: v, items };
  });
}

/** Kopfzeile eines Einheiten-Schritts: "Basistext", "eingefügt" oder "3 Änderungen" */
export function unitStepLabel(data, s) {
  return s.first ? (s.stage === data.stages[0].id ? t('change.base') : t('change.inserted')) : t('chron.nChanges', { n: s.items.length });
}

export function UnitChronology({ data, unitId, lang, onPick, route = null, rationale = true }) {
  const steps = unitSteps(data, unitId, lang);
  return html`${!data.preview ? html`<${AffectedNote} data=${data} unitId=${unitId} k=${null} lang=${lang} route=${route} />` : null}<ol class="chron">
    ${steps.map((s) => html`<li class=${'step' + (data.isPending(s.act) ? ' is-pending' : '')} style=${{ '--act': data.color(s.act) }}>
      <${StepTitle} data=${data} celex=${s.act} unitId=${unitId} k=${null} />
      <${ConsLine} data=${data} stageId=${s.stage} />
      <div class="step-head">
        <span class="chg">${unitStepLabel(data, s)}</span>
        <${SourceTag} data=${data} stageId=${s.stage} />
      </div>
      ${s.items.length ? html`<ul class="step-items">
        ${s.items.map((it) => html`<li>
          <div class="item-head">
            ${it.key && onPick ? html`<button type="button" class="link" onClick=${() => onPick(it.key)} title=${t('chron.openProvision')}>${uc(data, unitId, it.key)}</button>` : html`<span class="item-cite">${it.key ? uc(data, unitId, it.key) : it.title ? t('chron.heading') : uc(data, unitId, null)}</span>`}
            <span class=${'chg chg-' + it.change}>${changeLabel(it.change)}</span>
            ${it.key ? html`<${ChangeAppTags} data=${data} celex=${s.act} unitId=${unitId} k=${it.key} />` : null}
          </div>
          ${it.html != null ? html`<div class="legal item-text" lang=${lang}>${it.b && it.b.l ? html`<span class="lbl-inline">${it.b.l}</span>` : null}<span dangerouslySetInnerHTML=${{ __html: it.html }}></span></div>` : it.b ? html`<div class="legal item-text" lang=${lang}><${BlockBody} data=${data} b=${it.b} compareTo=${it.prev} unitId=${unitId} lang=${lang} stageId=${s.stage} /></div>` : null}
          ${it.b && it.b.ty === 'img' && it.prev && formCompareRows(data, unitId, it.prev, it.b, lang) ? html`<details class="form-cmp-box"><summary>${t('forms.cmpTitle')}</summary><${FormCompare} data=${data} unitId=${unitId} oldB=${it.prev} newB=${it.b} lang=${lang} /></details>` : null}
        </li>`)}
      </ul>` : null}
      ${rationale && !s.first ? html`<${RationaleBox} data=${data} celex=${s.act} unitId=${unitId} k=${null} lang=${lang} />` : null}
    </li>`)}
  </ol>`;
}
