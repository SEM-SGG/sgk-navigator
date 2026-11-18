// Verweisnetz in der Oberfläche (Etappe 3, Erweiterung 5): Links im Rechtstext, Bereich «Verweise», Hinweis «mitbetroffen».
import { html } from 'htm/preact';
import { useState } from 'preact/hooks';
import { linkifyHtml } from '../../core/refs.js';
import { excerpt, inScope } from './refsgraph-model.js';
import { go, getState } from '../state.js';
import { workOfCelex, workData, workById, stageAt, workAbbr } from '../library.js';
import { cite } from '../lib/cite.js';
import { t, uiLang } from '../lib/i18n.js';
import { escapeHtml } from '../lib/format.js';
import { Icon } from './common.js';
import { toast } from '../app.js';

export const eurlexUrl = (celex, lang) => `https://eur-lex.europa.eu/legal-content/${String(lang || 'de').toUpperCase()}/TXT/?uri=CELEX:${encodeURIComponent(celex)}`;

/** Ziel eines Verweises aus refId: { kind: internal|library|external|none, work, unit, key, celex } */
export function parseRefId(data, id) {
  const s = String(id || '');
  if (!s || s === '?') return { kind: 'none' };
  const m = /^([^:#]+):(.+)$/.exec(s);
  if (!s.includes(':') && s.includes('#')) { const [unit, key] = s.split('#'); return { kind: 'internal', work: data.workId, unit, key: key || null }; }
  const celex = m ? m[1] : s;
  const local = m ? m[2] : '';
  const [unit, key] = local ? local.split('#') : [null, null];
  if (!/^[0-9]/.test(celex)) return { kind: 'none' };
  const w = workOfCelex(celex);
  if (w && w === data.workId && unit) return { kind: 'internal', work: w, unit, key: key || null };
  if (w && unit) return { kind: 'library', work: w, unit, key: key || null, celex };
  if (w) return { kind: 'library', work: w, unit: null, key: null, celex };
  return { kind: 'external', celex, unit: unit || null };
}

/** Wird ein Verweis verlinkt? Unsichere und Ziele ohne CELEX nicht. */
const linkable = (data, r) => !r.uncertain && r.target && parseRefId(data, refIdOf(r.target)).kind !== 'none';
function refIdOf(tg) {
  const local = tg.unit ? tg.unit + '#' + (tg.key || '') : '';
  return tg.kind === 'external' ? (tg.work || tg.instrument || '?') + (local ? ':' + local : '') : local;
}

/** Hash eines internen oder Bibliotheksziels */
export function hashFor(dst, route) {
  const p = new URLSearchParams();
  if (dst.work && dst.work !== 'sgk') p.set('w', dst.work);
  if (dst.unit) p.set('u', dst.unit);
  if (dst.key) p.set('k', dst.key);
  if (route.l && route.l !== 'de') p.set('l', route.l);
  if (dst.kind === 'internal' && route.s && route.m !== 'datum') p.set('s', route.s);
  p.set('ui', uiLang());
  return '#/lesen?' + p.toString();
}

/** Block-HTML mit Verweisen als Links (Wortlaut unverändert; nur Anker). */
export function linkBlockHtml(data, blockHtml, refs, lang) {
  const ok = (refs || []).filter((r) => linkable(data, r));
  if (!ok.length) return blockHtml;
  const route = getState();
  const out = linkifyHtml(blockHtml, ok);
  return out.replace(/<a data-ref="([^"]*)" data-ref-kind="([^"]*)"( data-uncertain="1")?>/g, (all, id) => {
    const rid = id.replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    const dst = parseRefId(data, rid);
    if (dst.kind === 'external') {
      const tip = t('refs.extTip', { celex: dst.celex });
      return `<a class="ref ref-ext" data-ref="${id}" href="${escapeHtml(eurlexUrl(dst.celex, lang))}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(tip)}">`;
    }
    if (dst.kind === 'library') {
      const w = workById(dst.work);
      const tip = t('refs.libTip', { work: workAbbr(w, uiLang()) });
      return `<a class="ref ref-lib" data-ref="${id}" data-work="${dst.work}" href="${escapeHtml(hashFor(dst, route))}" title="${escapeHtml(tip)}">`;
    }
    return `<a class="ref" data-ref="${id}" href="${escapeHtml(hashFor(dst, route))}" title="${escapeHtml(t('refs.intTip'))}">`;
  });
}

/** Navigiert zu einem Verweisziel (Klick oder Enter auf einem Link im Text). */
export function followRef(data, id, route, stageId) {
  const dst = parseRefId(data, id);
  if (dst.kind === 'internal') {
    go({ view: 'lesen', u: dst.unit, k: dst.key || null });
    return true;
  }
  if (dst.kind === 'library') {
    // Stand des Zielwerks passend zum Datum des aktuellen Stands
    const target = workData(dst.work);
    const date = data.stageDate(stageId || data.latest.id) || data.today;
    const s = target ? stageAt(target.ds, date) : null;
    const unit = dst.unit && target && target.unit(dst.unit) ? dst.unit : null;
    const key = unit && dst.key && target.version(unit, route.l, s || target.latest.id) && (target.version(unit, route.l, s || target.latest.id).blocks || []).some((b) => b.k === dst.key) ? dst.key : null;
    go({ view: 'lesen', w: dst.work, u: unit, k: key, s: s || null, m: 'stand', a: null, b: null, act: null, q: null, pv: null, pv2: null });
    // Ziel fehlt im Zielwerk (z. B. von EUR-Lex nicht konsolidierte Artikel der VIS-VO): nicht stillschweigend woanders landen.
    if (dst.unit && !unit) toast(t('refs.missingUnit', { work: workAbbr(workById(dst.work), uiLang()), unit: dst.unit.replace(/^art_/, 'Art. ').replace(/^anx_/, 'Anh. ') }), 'warn', 9000);
    return true;
  }
  return false;
}

/** Delegierter Klick in einem Textbereich: true, wenn ein Verweis behandelt wurde. */
export function onRefClick(e, data, route, stageId) {
  const a = e.target && e.target.closest ? e.target.closest('a[data-ref]') : null;
  if (!a) return false;
  e.stopPropagation();
  if (a.classList.contains('ref-ext')) return true; // neuer Tab (Standardverhalten)
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return true;
  e.preventDefault();
  followRef(data, a.getAttribute('data-ref'), route, stageId);
  return true;
}

// ------------------------------------------------------------------ Bereich «Verweise» und «mitbetroffen»

/** Rückverweise auf eine Bestimmung (key) bzw. Einheit (key null), ohne Verweise innerhalb derselben Bestimmung. */
export function incomingRefs(data, lang, stageId, unitId, key) {
  const idx = data.refIndex(lang, stageId);
  const list = [];
  const seen = new Set();
  const add = (e) => {
    if (e.unit === unitId && inScope(e.key, key)) return;
    const id = e.unit + '#' + e.key + '|' + e.text;
    if (seen.has(id)) return;
    seen.add(id);
    list.push(e);
  };
  for (const e of idx.in[unitId] || []) if (!key || inScope(e.targetKey || '', key) || (!e.targetKey && false)) add(e);
  return list;
}
/** Verweise eines Blocks */
export function outgoingRefs(data, lang, stageId, unitId, key) {
  const idx = data.refIndex(lang, stageId);
  return idx.out[unitId + '#' + key] || [];
}

// Auszug um eine Fundstelle: gemeinsame Funktion mit dem Verweisnetz (refsgraph-model.js)

function targetLabel(data, r) {
  const tg = r.target || {};
  const dst = parseRefId(data, refIdOf(tg));
  if (dst.kind === 'internal') return cite(data.unitMeta(dst.unit), dst.key, uiLang(), data.abbr);
  if (dst.kind === 'library') {
    const w = workById(dst.work);
    const d = workData(dst.work);
    return dst.unit && d ? cite(d.unitMeta(dst.unit), dst.key, uiLang(), w.abbr) : workAbbr(w, uiLang());
  }
  return r.text;
}

function RefItem({ data, lang, stageId, e, dir, route }) {
  const ex = excerpt(data, lang, stageId, e.unit, e.key, e.text);
  const label = cite(data.unitMeta(e.unit), e.key, uiLang(), data.abbr);
  const open = (ev) => { ev.preventDefault(); go({ view: 'lesen', u: e.unit, k: e.key }); };
  return html`<li class="ref-item">
    <a class="ref-cite" href=${'#/lesen?u=' + e.unit + '&k=' + e.key} onClick=${open}>${label}</a>
    ${ex ? html`<span class="ref-ex legal" lang=${lang}>${typeof ex === 'string' ? ex : html`${ex.pre}<mark>${ex.hit}</mark>${ex.post}`}</span>` : null}
  </li>`;
}

function OutItem({ data, lang, r, route, stageId }) {
  const tg = r.target || {};
  const dst = parseRefId(data, refIdOf(tg));
  const label = r.uncertain ? r.text : targetLabel(data, r);
  let link = null;
  if (r.uncertain) link = html`<span class="ref-cite is-uncertain" title=${t('refs.uncertainTip')}>${label}</span>`;
  else if (dst.kind === 'external') link = html`<a class="ref-cite ref-ext" href=${eurlexUrl(dst.celex, lang)} target="_blank" rel="noopener noreferrer" title=${t('refs.extTip', { celex: dst.celex })}>${tg.label || r.text}<span class="sr"> ${t('refs.newTab')}</span></a>`;
  else if (dst.kind === 'none') link = html`<span class="ref-cite">${tg.label || r.text}</span>`;
  else link = html`<a class="ref-cite" href="#" onClick=${(ev) => { ev.preventDefault(); followRef(data, refIdOf(tg), route, stageId); }}>${label}</a>`;
  return html`<li class="ref-item">
    ${link}
    <span class="ref-ex legal" lang=${lang}>«${r.text}»${r.uncertain ? html` <span class="tag tag-partly">${t('refs.uncertain')}</span>` : dst.kind === 'external' ? html` <span class="tag tag-src">${t('refs.external')}</span>` : dst.kind === 'library' ? html` <span class="tag tag-src">${workAbbr(workById(dst.work), uiLang())}</span>` : null}</span>
  </li>`;
}

/**
 * Bereich «Verweise» im Detail einer Bestimmung.
 * head: zusätzliche Bedienelemente unter dem Titel (Umschalter Liste | Netz); alt: Inhalt statt der Listen (Netz). Ohne beide wie bisher.
 */
export function RefsPanel({ data, unitId, k, lang, stageId, route, head, alt }) {
  if (alt) return html`<section class="refs-panel" aria-labelledby="refs-h">
    <h3 id="refs-h" class="refs-h">${t('refs.title')} <span class="muted small">${t('refs.scope', { stage: data.stageLabel(stageId, { short: true }), lang: lang.toUpperCase() })}</span></h3>
    ${head}${alt}</section>`;
  const out = k ? outgoingRefs(data, lang, stageId, unitId, k) : [];
  const inc = incomingRefs(data, lang, stageId, unitId, k);
  if (!out.length && !inc.length) return html`<section class="refs-panel" aria-labelledby="refs-h"><h3 id="refs-h" class="refs-h">${t('refs.title')}</h3>${head || null}<p class="muted small">${t('refs.none')}</p></section>`;
  return html`<section class="refs-panel" aria-labelledby="refs-h">
    <h3 id="refs-h" class="refs-h">${t('refs.title')} <span class="muted small">${t('refs.scope', { stage: data.stageLabel(stageId, { short: true }), lang: lang.toUpperCase() })}</span></h3>
    ${head || null}
    ${out.length ? html`<details open><summary>${t('refs.out', { n: out.length })}</summary><ul class="ref-list">${out.map((r) => html`<${OutItem} data=${data} lang=${lang} r=${r} route=${route} stageId=${stageId} />`)}</ul></details>` : null}
    ${inc.length ? html`<details open=${inc.length <= 8}><summary>${t('refs.in', { n: inc.length })}</summary><ul class="ref-list">${inc.map((e) => html`<${RefItem} data=${data} lang=${lang} stageId=${stageId} e=${e} route=${route} />`)}</ul></details>` : null}
  </section>`;
}

/** Hinweis in der Chronologie: wie viele Bestimmungen verweisen auf diese (mitbetroffen), aufklappbar. */
export function AffectedNote({ data, unitId, k, lang, route }) {
  const stageId = data.latest.id;
  const inc = incomingRefs(data, lang, stageId, unitId, k);
  const [open, setOpen] = useState(false);
  if (!inc.length) return null;
  return html`<div class="affected">
    <button type="button" class="btn btn-ghost is-bare btn-sm affected-btn" aria-label=${t('refs.affected', { n: inc.length })} aria-expanded=${open ? 'true' : 'false'} onClick=${() => setOpen(!open)}>
      <${Icon} name="link" /><span class="affected-l">${t('refs.affected', { n: inc.length })}</span><span class="affected-s" aria-hidden="true">${t('refs.affectedShort', { n: inc.length })}</span><${Icon} name=${open ? 'chevron-up' : 'chevron-down'} /></button>
    ${open ? html`<p class="muted small affected-note">${t('refs.affectedNote', { stage: data.stageLabel(stageId) })}</p>
      <ul class="ref-list">${inc.map((e) => html`<${RefItem} data=${data} lang=${lang} stageId=${stageId} e=${e} route=${route} />`)}</ul>` : null}
  </div>`;
}
