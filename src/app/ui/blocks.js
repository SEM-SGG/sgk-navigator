// Darstellung des Rechtstexts: Blöcke mit hängenden Gliederungszeichen und Herkunftsrand.
import { html } from 'htm/preact';
import { safeInline, safeTable } from '../lib/sanitize.js';
import { diffText, markAll } from '../lib/diff.js';
import { cite } from '../lib/cite.js';
import { t, uiLang } from '../lib/i18n.js';
import { plain } from '../lib/format.js';
import { blockSig } from '../fallback-model.js';
import { FormFigure } from './forms.js';
import { linkBlockHtml, onRefClick } from './refs.js';
import { eurlexHtml } from '../lib/sparql.js';
import { noticeLabel } from './notices.js';

export function assetSrc(data, id) {
  const a = data.asset(id);
  return a ? `data:${a.mime || 'image/png'};base64,${a.data}` : null;
}

/** Inhalt eines Blocks (ohne Rand und Gliederungszeichen). textHtml überschreibt den Text (Diff). */
export function BlockBody({ data, b, textHtml, compareTo, unitId, lang, stageId, refs }) {
  if (b.ty === 'table') {
    return html`<div class="tbl-wrap"><div class="tbl" dangerouslySetInnerHTML=${{ __html: safeTable(b.html || '') }}></div>
      ${compareTo !== undefined && (compareTo === null || blockSig(compareTo) !== blockSig(b)) ? html`<p class="tbl-note">${compareTo === null ? t('blocks.tableInserted') : t('blocks.tableChanged')}</p>` : null}
      ${compareTo && blockSig(compareTo) !== blockSig(b) ? html`<p class="tbl-diff" dangerouslySetInnerHTML=${{ __html: diffText(safeInline(compareTo.t), safeInline(b.t)).redline }}></p>` : null}
    </div>`;
  }
  if (b.ty === 'img') {
    const src = assetSrc(data, b.asset);
    if (!src && !data.full) {
      // weitere Werke: Bilder nicht eingebettet, Verweis auf EUR-Lex (Fassung des Stands)
      const st = data.stage(stageId || data.latest.id);
      const celex = (st && st.source && st.source.celex) || data.work.celex;
      return html`<p class="fig-missing fig-ext"><${FigIcon} /><span>${t('blocks.figureNotEmbedded')}${b.t ? html`: <span lang=${lang}>${plain(b.t)}</span>` : ''} <a href=${eurlexHtml(celex, lang || 'de')} target="_blank" rel="noopener noreferrer" onClick=${(e) => e.stopPropagation()}>${t('blocks.figureEurlex')}<span class="sr"> ${t('refs.newTab')}</span></a></span></p>`;
    }
    const img = src
      ? html`<figure class="fig"><img src=${src} alt=${plain(b.t) || t('blocks.figure')} loading="lazy" /></figure>`
      : html`<p class="fig-missing">${t('blocks.figureMissing')}${b.t ? ': ' + plain(b.t) : ''}</p>`;
    return unitId ? html`<${FormFigure} data=${data} unitId=${unitId} b=${b} lang=${lang} stageId=${stageId} img=${img} />` : img;
  }
  if (textHtml == null && refs && refs.length) return html`<span class="bt" dangerouslySetInnerHTML=${{ __html: linkBlockHtml(data, safeInline(b.t), refs, lang) }}></span>`;
  return html`<span class="bt" dangerouslySetInnerHTML=${{ __html: textHtml ?? safeInline(b.t) }}></span>`;
}

/**
 * Liste der Blöcke einer Version.
 * prev: Vorgängerversion für Redline (oder null). originMarks: Herkunftsrand ein/aus.
 */
const FigIcon = () => html`<svg class="ico" aria-hidden="true"><use href="#image"></use></svg>`;

/** Hinweise (Anwendbarkeit) eines Blocks: Schlüssel gleich oder Vorfahre. */
const noticesOf = (notices, k) => (notices || []).filter((n) => n.key && (k === n.key || k.startsWith(n.key + '.')));

/**
 * refs: Verweisindex (out) des Stands für Links im Text oder null; stageId: Stand (Verweise, Bilder, Formulare);
 * notices: Hinweise zur Anwendbarkeit (composeAtDate) für Kennzeichen am Block.
 */
export function BlockList({ data, unitId, version, lang, prev, redline, selectedKey, onSelect, originMarks = true, fnStart = 1, refs = null, stageId = null, notices = null, route = null }) {
  if (!version) return null;
  const meta = data.unitMeta(unitId);
  const base = data.work.celex;
  const blocks = version.blocks || [];
  const prevMap = redline && prev ? new Map((prev.blocks || []).map((b) => [b.k, b])) : null;
  const curKeys = new Set(blocks.map((b) => b.k));
  // Reihenfolge inkl. gestrichener Blöcke aus der Vorgängerversion
  const rows = [];
  if (prevMap) {
    const pb = prev.blocks || [];
    const removedAfter = new Map();
    let lastKept = null;
    for (const b of pb) {
      if (curKeys.has(b.k)) lastKept = b.k;
      else { const arr = removedAfter.get(lastKept) || []; arr.push(b); removedAfter.set(lastKept, arr); }
    }
    for (const b of removedAfter.get(null) || []) rows.push({ b, removed: true });
    for (const b of blocks) {
      rows.push({ b });
      for (const r of removedAfter.get(b.k) || []) rows.push({ b: r, removed: true });
    }
  } else for (const b of blocks) rows.push({ b });

  let lastOrigin = null;
  let fn = fnStart;
  const notes = [];
  const out = rows.map(({ b, removed }) => {
    const o = removed ? null : b.o || base;
    const isBase = o === base;
    const pending = o && !isBase && data.isPending(o);
    const showCode = originMarks && o && !isBase && o !== lastOrigin;
    lastOrigin = removed ? lastOrigin : o;
    let textHtml;
    let state = '';
    if (prevMap && !removed && b.ty !== 'table' && b.ty !== 'img') {
      const p = prevMap.get(b.k);
      if (!p) { textHtml = markAll(safeInline(b.t), 'ins'); state = 'ins'; }
      else if (blockSig(p) !== blockSig(b)) { textHtml = diffText(safeInline(p.t), safeInline(b.t)).redline; state = 'chg'; }
    }
    if (removed) { textHtml = markAll(safeInline(b.t), 'del'); state = 'del'; }
    const fnRefs = [];
    if (!removed && Array.isArray(b.fn)) for (const f of b.fn) { fnRefs.push(fn); notes.push({ n: fn, t: f.t }); fn++; }
    const sel = selectedKey === b.k && !removed;
    const label = cite(meta, b.k, uiLang(), data.abbr);
    const clickable = onSelect && !removed;
    const cls = ['blk', `d${Math.min(b.d || 0, 5)}`, b.ty ? 'ty-' + b.ty : '', sel ? 'is-sel' : '', removed ? 'is-removed' : '', state ? 'st-' + state : '', pending ? 'is-pending' : ''].join(' ');
    const onKey = (e) => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect && onSelect(b.k); } };
    const onClick = (e) => { if (e.target.closest && e.target.closest('a, button, .form-fig')) return; onSelect(b.k); };
    const bRefs = refs && !removed && !textHtml ? refs[unitId + '#' + b.k] : null;
    const flags = !removed ? noticesOf(notices, b.k) : [];
    return html`<div class=${cls} data-k=${b.k} style=${{ '--d': b.d || 0 }}
        role=${onSelect && !removed ? 'button' : undefined} tabindex=${onSelect && !removed ? 0 : undefined}
        aria-label=${clickable ? t('blocks.openChron', { cite: label }) : undefined}
        aria-pressed=${onSelect && !removed ? (sel ? 'true' : 'false') : undefined}
        onClick=${onSelect && !removed ? onClick : undefined} onKeyDown=${onSelect && !removed ? onKey : undefined}>
      <span class="mark" lang=${uiLang()} aria-hidden=${showCode ? undefined : 'true'} style=${o && !isBase && originMarks ? { '--act': data.color(o) } : undefined}>
        ${showCode ? html`<span class="mark-code" title=${data.actName(o) + (pending ? ', ' + data.status(o).label : '')}>${data.actCode(o)}${pending ? html`<span class="mark-pend">${t('blocks.notApplicable')}</span>` : null}</span>` : null}
      </span>
      ${b.ty === 'heading'
        ? html`<div class="blk-head">${b.l ? html`<span class="hl">${b.l}</span>` : null}<${BlockBody} data=${data} b=${b} textHtml=${textHtml} refs=${bRefs} lang=${lang} /></div>`
        : html`<span class="lbl">${b.l || ''}</span><div class="txt"><${BlockBody} data=${data} b=${b} textHtml=${textHtml} unitId=${unitId} lang=${lang} stageId=${stageId} refs=${bRefs} compareTo=${prevMap && !removed && b.ty === 'table' ? prevMap.get(b.k) || null : undefined} />${fnRefs.map((n) => html`<sup class="fnref">${n}</sup>`)}${state === 'del' ? html`<span class="state-tag" lang=${uiLang()}>${t('change.deleted')}</span>` : state === 'ins' ? html`<span class="state-tag state-ins" lang=${uiLang()}>${t('change.inserted')}</span>` : null}${flags.map((n) => html`<span class=${'blk-flag flag-' + (n.effect || n.kind)} lang=${uiLang()} title=${[noticeLabel(data, n, true), n.note, n.basis].filter(Boolean).join(' | ')}>${noticeLabel(data, n)}</span>`)}</div>`}
      ${clickable ? html`<span class="blk-go" aria-hidden="true"><svg class="ico"><use href="#clock"></use></svg></span>` : null}
    </div>`;
  });
  const onBlocksClick = refs ? (e) => onRefClick(e, data, route || {}, stageId) : undefined;
  return html`<div class="blocks" onClick=${onBlocksClick}>${out}</div>
    ${notes.length ? html`<ol class="fns" aria-label=${t('blocks.footnotes')}>${notes.map((n) => html`<li value=${n.n} dangerouslySetInnerHTML=${{ __html: safeInline(n.t) }}></li>`)}</ol>` : null}`;
}
