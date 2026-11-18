// Lesen: Inhaltsverzeichnis, Artikel im gewählten Stand, Herkunft, Redline, Sicht per Datum, Chronologie-Panel.
import { html } from 'htm/preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { go } from '../../state.js';
import { ActChip, Icon, Notice, Seg, StatusTag, Empty, HelpLink, LegalLangSwitch, UnitTitle, TitleText } from '../../ui/common.js';
import { BlockList } from '../../ui/blocks.js';
import { BlockChronology, UnitChronology, rationaleSteps, blockSteps, unitSteps } from '../../ui/chronology.js';
import { RationaleBox, rationaleFor } from '../../ui/rationale.js';
import { ExportMenu, ExportCard, specModel } from '../../ui/exportmenu.js';
import { cite } from '../../lib/cite.js';
import { search } from '../../lib/search.js';
import { fmtDate } from '../../lib/format.js';
import { t, uiLang } from '../../lib/i18n.js';
import { settingsStore, persistSettings } from '../../app.js';
import { stageAt } from '../../library.js';
import { RefsSection } from '../../ui/refsgraph.js';
import { NoticeList } from '../../ui/notices.js';
import { PreviewBar, usePreviewData } from './previewbar.js';
import { parsePv } from '../../preview.js';

export function currentStage(data, route) {
  if (data.preview) return data.preview.runs[0].stage;
  if (route.m === 'alle') return data.latest.id;
  if (route.m === 'datum' && !data.full) return stageAt(data.ds, route.d || data.today) || data.stages[0].id;
  return route.s && data.stage(route.s) ? route.s : data.latest.id;
}
/** Lesemodus: stand | datum | alle | vorschau (pv im Hash schaltet die Vorschau ein) */
/** Schalter «Begründung in Exportkarten» (nur Werke mit Begründung) */
export function RatExportToggle({ data }) {
  const st = settingsStore.use();
  if (data.workId !== 'sgk') return null;
  return html`<label class="check check-sm"><input type="checkbox" id="chk-ratexport" checked=${!!st.ratExport} onChange=${(e) => { settingsStore.set({ ...st, ratExport: e.target.checked }); persistSettings(); }} />${t('rat.exportToggle')}</label>`;
}
export const readMode = (data, route) => (route.pv && parsePv(route.pv) ? 'vorschau' : route.m === 'vorschau' ? 'vorschau' : route.m === 'alle' && !data.full ? 'stand' : route.m);
export function currentUnit(data, route) {
  return route.u && data.unit(route.u) ? route.u : data.unitOrder[0];
}
/** Zitat in der Zitierweise der Oberflächensprache */
export const uiCite = (data, unitId, key, withAbbr = true) => cite(data.unitMeta(unitId), key || null, uiLang(), withAbbr ? data.abbr : null);

// ------------------------------------------------------------ Inhaltsverzeichnis
function buildTree(data) {
  const kids = new Map();
  for (const tt of data.toc) {
    const p = tt.parent || null;
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p).push(tt);
  }
  return kids;
}

function TocUnit({ data, entry, route, stageId, lang, activeUnit }) {
  const meta = data.unitMeta(entry.id);
  const v = data.version(entry.id, lang, stageId);
  const alive = v && !v.repealed && data.tocAlive(entry, stageId);
  const acts = data.unitActs(entry.id, lang);
  const cur = entry.id === activeUnit;
  const ti = data.unitTitle(entry.id, lang, stageId);
  const status = !v ? t('read.toc.notYet') : v.repealed ? t('read.toc.repealed') : '';
  return html`<li class=${'toc-unit' + (cur ? ' is-current' : '') + (alive ? '' : ' is-dead') + (meta.type === 'annex' ? ' is-annex' : '')}>
    <a href=${`#/lesen?u=${entry.id}`} aria-current=${cur ? 'page' : undefined}
      onClick=${(e) => { e.preventDefault(); go({ view: 'lesen', u: entry.id, k: null }); }}>
      <span class="toc-num">${cite(meta, null, uiLang(), null)}</span>
      ${status ? html`<span class="toc-title" title=${status}>${status}</span>` : html`<${TitleText} ti=${ti} lang=${lang} className="toc-title" />`}
      ${acts.length ? html`<span class="toc-acts" aria-label=${t('read.toc.changedBy', { list: acts.map((c) => data.actCode(c)).join(', ') })}>${acts.map((c) => html`<span class=${'toc-act' + (data.isPending(c) ? ' is-pending' : '') + (route.act === c ? ' is-hit' : '')} style=${{ '--act': data.color(c) }}>${data.actCode(c)}</span>`)}</span>` : null}
    </a>
  </li>`;
}

function TocNode({ data, entry, kids, route, stageId, lang, activeUnit, filter }) {
  const ch = (kids.get(entry.id) || []).filter((c) => filter(c));
  if (!ch.length) return null;
  const h = data.heading(entry, lang, stageId);
  return html`<li class=${'toc-group toc-g-' + entry.type}>
    <details open>
      <summary lang=${lang}><span class="toc-glabel">${h ? h.label : entry.num}</span> <span class="toc-gtext">${h ? h.text : ''}</span></summary>
      <ul>${ch.map((c) => c.type === 'article' || c.type === 'annex'
        ? html`<${TocUnit} data=${data} entry=${c} route=${route} stageId=${stageId} lang=${lang} activeUnit=${activeUnit} />`
        : html`<${TocNode} data=${data} entry=${c} kids=${kids} route=${route} stageId=${stageId} lang=${lang} activeUnit=${activeUnit} filter=${filter} />`)}</ul>
    </details>
  </li>`;
}

function Toc({ data, route, stageId, lang, activeUnit }) {
  const kids = useMemo(() => buildTree(data), [data]);
  const [q, setQ] = useState(route.q || '');
  useEffect(() => { setQ(route.q || ''); }, [route.q]);
  const onlyChanged = route.ch === '1';
  const actF = route.act;
  const unitOk = (id) => (!onlyChanged || data.unitActs(id, lang).length > 0) && (!actF || data.unitActs(id, lang).includes(actF));
  const memo = new Map();
  const filter = (e) => {
    if (e.type === 'article' || e.type === 'annex' || e.type === 'recitals') return unitOk(e.id);
    if (memo.has(e.id)) return memo.get(e.id);
    const r = (kids.get(e.id) || []).some(filter);
    memo.set(e.id, r);
    return r;
  };
  const res = useMemo(() => (route.q ? search(data, route.q, lang, stageId) : null), [data, route.q, lang, stageId]);
  const roots = kids.get(null) || [];
  // Unter 1056 px steht das Inhaltsverzeichnis über dem Artikel und ist einklappbar: geschlossen, sobald eine Einheit gewählt ist.
  const [open, setOpen] = useState(() => !route.u || !!route.q);
  useEffect(() => { if (route.u && !route.q) setOpen(false); }, [route.u]);
  useEffect(() => { if (route.q) setOpen(true); }, [route.q]);
  const scrollRef = useRef();
  useEffect(() => {
    const el = scrollRef.current && scrollRef.current.querySelector('.toc-unit.is-current');
    if (!el) return;
    const box = scrollRef.current.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (r.top < box.top || r.bottom > box.bottom) scrollRef.current.scrollTop += r.top - box.top - box.height / 3;
  }, [activeUnit, !!res]);
  const stageActs = useMemo(() => {
    const set = new Set(data.unitOrder.flatMap((id) => data.unitActs(id, lang)));
    const key = (c) => { const a = data.act(c); return (a && (a.adopted || a.published)) || '9999'; };
    return [...set].sort((x, y) => key(x).localeCompare(key(y)));
  }, [data, lang]);
  const submit = (e) => {
    e.preventDefault();
    const r = search(data, q, lang, stageId);
    if (r.refs.length === 1 && !r.hits.length) go({ view: 'lesen', u: r.refs[0].unit, k: r.refs[0].key, q: null });
    else go({ q: q || null });
  };
  const summary = res ? [
    res.refs.length ? t('read.search.units', { n: res.refs.length }) : '',
    res.total ? t('read.search.hits', { n: res.total }) : '',
  ].filter(Boolean).join(', ') + (res.total > res.hits.length ? ' ' + t('read.search.first', { n: res.hits.length }) : '') : '';
  return html`<aside class=${'toc' + (open ? ' is-open' : ' is-collapsed')} aria-label=${t('read.toc.label')}>
    <button type="button" class="toc-toggle" id="toc-toggle" aria-expanded=${open ? 'true' : 'false'} aria-controls="toc-body" title=${open ? t('read.toc.toggleHide') : t('read.toc.toggleShow')} onClick=${() => setOpen(!open)}>
      <${Icon} name="view-list" /><span class="toc-toggle-l">${t('read.toc.toggle')}</span>
      <span class="toc-toggle-cur">${uiCite(data, activeUnit, null, false)}</span>
      <${Icon} name=${open ? 'chevron-up' : 'chevron-down'} />
    </button>
    <div class="toc-body" id="toc-body">
    <div class="toc-head">
      <form class="toc-search" role="search" onSubmit=${submit}>
        <label class="sr" for="toc-q">${t('read.search.label')}</label>
        <${Icon} name="search" />
        <input id="toc-q" type="search" placeholder=${t('read.search.placeholder')} title=${t('read.search.placeholder')} value=${q} onInput=${(e) => setQ(e.target.value)} />
        ${route.q ? html`<button type="button" class="btn-icon is-bare" aria-label=${t('read.search.reset')} title=${t('read.search.reset')} onClick=${() => { setQ(''); go({ q: null }); }}><${Icon} name="close" /></button>` : null}
      </form>
      <div class="toc-filters">
        <label class="check"><input type="checkbox" checked=${onlyChanged} onChange=${(e) => go({ ch: e.target.checked ? '1' : '0' }, { replace: true })} />${t('read.toc.onlyChanged')}</label>
        <label class="field field-row"><span class="field-label">${t('read.toc.actFilter')}</span>
          <select id="toc-act" value=${actF || ''} onChange=${(e) => go({ act: e.target.value || null }, { replace: true })}>
            <option value="">${t('read.toc.allActs')}</option>
            ${stageActs.map((c) => html`<option value=${c} title=${data.actName(c)}>${data.actCode(c)}${data.actNum(c) && data.actNum(c) !== data.actCode(c) ? ' ' + data.actNum(c) : ''}</option>`)}
          </select></label>
      </div>
    </div>
    <div class="toc-scroll" ref=${scrollRef}>
      ${res ? html`<div class="search-res" aria-live="polite">
          <p class="search-sum">${summary || t('read.search.none')}</p>
          <ul>
            ${res.refs.map((r) => { const ti = data.unitTitle(r.unit, lang, stageId); return html`<li><a href="#" class="sr-unit" onClick=${(e) => { e.preventDefault(); go({ view: 'lesen', u: r.unit, k: r.key }); }}><b>${uiCite(data, r.unit, r.key, false)}</b> <${TitleText} ti=${ti} lang=${lang} /></a></li>`; })}
            ${res.hits.map((h) => html`<li><a href="#" onClick=${(e) => { e.preventDefault(); go({ view: 'lesen', u: h.unit, k: h.key }); }}><b>${uiCite(data, h.unit, h.key, false)}</b><span class="sr-snip" lang=${lang} dangerouslySetInnerHTML=${{ __html: h.html }}></span></a></li>`)}
          </ul>
        </div>`
      : html`<nav aria-label=${t('read.toc.outline')}><ul class="toc-tree">${roots.filter(filter).map((e) => e.type === 'article' || e.type === 'annex' || e.type === 'recitals'
          ? html`<${TocUnit} data=${data} entry=${e} route=${route} stageId=${stageId} lang=${lang} activeUnit=${activeUnit} />`
          : html`<${TocNode} data=${data} entry=${e} kids=${kids} route=${route} stageId=${stageId} lang=${lang} activeUnit=${activeUnit} filter=${filter} />`)}</ul>
        ${roots.filter(filter).length === 0 ? html`<p class="muted pad">${t('read.toc.noMatch')}</p>` : null}</nav>`}
    </div>
    </div>
  </aside>`;
}

// ------------------------------------------------------------ Standleiste
export function StageBar({ data, unitId, lang, value, onPick, label }) {
  const changedAt = new Set(data.versions(unitId, lang).map((v) => v.stage));
  const ref = useRef();
  useEffect(() => {
    // gewählten Stand sichtbar halten (falls die Leiste in einem schmalen Bereich doch scrollt)
    const el = ref.current && ref.current.querySelector('[aria-pressed="true"]');
    if (el && el.scrollIntoView && ref.current.scrollWidth > ref.current.clientWidth) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [value]);
  const anyRecon = data.stages.some((s) => data.isReconstructed(s.id));
  const anyPending = data.stages.some((s) => data.isPending(s.act));
  return html`<div class="stagebar-wrap">
    <div class="stagebar" role="group" aria-label=${label || t('read.stagebar.label')} ref=${ref}>
      ${data.stages.map((s, i) => {
        const a = data.act(s.act);
        const ch = changedAt.has(s.id) && i > 0;
        const exists = data.exists(unitId, lang, s.id);
        const pend = data.isPending(s.act);
        const onlyLangs = s.langs && s.langs.length < data.langs.length ? s.langs : null;
        const tip = [
          data.stageLabel(s.id),
          onlyLangs ? t('stage.onlyLangsLong', { langs: onlyLangs.map((x) => x.toUpperCase()).join(', ') }) : '',
          a && a.published ? t('stage.publishedOn', { date: fmtDate(a.published) }) : '',
          pend ? data.status(s.act).label : '',
          data.isReconstructed(s.id) ? data.sourceLabel(s.id) : '',
          ch ? t('read.stagebar.changesUnit') : '',
          !exists ? t('read.stagebar.absent') : '',
        ].filter(Boolean).join(', ');
        return html`<button type="button" class=${'stg' + (ch ? ' is-changed' : '') + (exists ? '' : ' is-absent') + (pend ? ' is-pending' : '')} aria-pressed=${value === s.id ? 'true' : 'false'} title=${tip} aria-label=${tip} style=${{ '--act': data.color(s.act) }} onClick=${() => onPick(s.id)}>
          <span class="stg-sw" aria-hidden="true"></span>
          <span class="stg-code">${data.actCode(s.act)}</span>
          <span class="stg-year">${(data.stageDate(s.id) || '').slice(0, 4)}${data.isReconstructed(s.id) ? '*' : ''}${onlyLangs ? ' ' + onlyLangs.map((x) => x.toUpperCase()).join('/') : ''}${ch ? html`<span class="stg-dot" aria-hidden="true"></span>` : null}</span>
        </button>`;
      })}
    </div>
    <p class="stagebar-legend"><span class="lg"><span class="stg-dot" aria-hidden="true"></span>${t('read.stagebar.legendChanged')}</span>${anyRecon ? html`<span class="lg"><b aria-hidden="true">*</b> ${t('read.stagebar.legendRecon')}</span>` : null}${anyPending ? html`<span class="lg"><span class="sw sw-pending" style=${{ '--act': 'var(--ink-muted)' }} aria-hidden="true"></span>${t('legend.pending')}</span>` : null}</p>
  </div>`;
}

// ------------------------------------------------------------ Panel
function ChronPanel({ data, unitId, k, lang, onClose, onPick, route, stageId }) {
  const [diff, setDiff] = useState(true);
  const settings = settingsStore.use();
  // Bereich «Verweise» wie bisher unter der Chronologie; Wahl «Verweise» im Schalter zeigt nur ihn (Zustand nur in der Schublade)
  const refsOk = !data.preview && !!route.l && settings.refs !== false;
  const [refsOnlyRaw, setRefsOnly] = useState(false);
  const refsOnly = refsOk && refsOnlyRaw;
  const unitLevel = k === '*';
  const spec = { ...(unitLevel ? { kind: 'unit', unit: unitId, key: null, lang } : { kind: 'block', unit: unitId, key: k, lang }), w: data.workId, pv: data.preview ? route.pv : null };
  // Unter 1312 px liegt die Schublade fixiert über dem Text; sie beginnt unter Kopf und Werkleiste, damit diese bedienbar bleiben.
  const ref = useRef();
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const place = () => {
      const v = el.closest('.view-read');
      el.style.top = window.matchMedia('(max-width: 1311px)').matches && v ? Math.max(0, v.getBoundingClientRect().top) + 'px' : '';
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, []);
  return html`<aside class="panel" ref=${ref} aria-label=${t('chron.title')} onKeyDown=${(e) => { if (e.key === 'Escape') onClose(); }}>
    <div class="panel-head">
      <div>
        <p class="panel-kicker">${t('chron.title')}</p>
        <h2 class="panel-title">${uiCite(data, unitId, unitLevel ? null : k)}</h2>
      </div>
      <button type="button" class="btn-icon is-bare" aria-label=${t('chron.close')} title=${t('chron.close')} onClick=${onClose}><${Icon} name="close" /></button>
    </div>
    <div class="panel-tools">
      ${!unitLevel ? html`<${Seg} size="sm" label=${t('chron.display')} value=${refsOnly ? 'r' : diff ? 'd' : 't'} onChange=${(v) => { setRefsOnly(v === 'r'); if (v !== 'r') setDiff(v === 'd'); }} options=${[{ value: 'd', label: t('chron.showChanges') }, { value: 't', label: t('chron.showText') }, ...(refsOk ? [{ value: 'r', label: t('refs.graph.panelOnly') }] : [])]} />`
        : refsOk ? html`<${Seg} size="sm" label=${t('chron.display')} value=${refsOnly ? 'r' : 'c'} onChange=${(v) => setRefsOnly(v === 'r')} options=${[{ value: 'c', label: t('chron.title') }, { value: 'r', label: t('refs.graph.panelOnly') }]} />` : null}
      <span class="spacer"></span>
      <${ExportMenu} data=${data} spec=${spec} model=${specModel(spec)} label=${t('export.short')} small />
      <button type="button" class="btn btn-tertiary btn-sm" onClick=${() => go({ view: 'chronik', u: unitId, k })}><${Icon} name="maximize" />${t('chron.wide')}</button>
      <div class="panel-tools-row"><${RatExportToggle} data=${data} /></div>
    </div>
    <div class="panel-body">
      ${refsOnly ? null : unitLevel ? html`<${UnitChronology} data=${data} unitId=${unitId} lang=${lang} onPick=${onPick} route=${route} />` : html`<${BlockChronology} data=${data} unitId=${unitId} k=${k} lang=${lang} showDiff=${diff} compact route=${route} />`}
      ${refsOk ? html`<${RefsSection} data=${data} unitId=${unitId} k=${unitLevel ? null : k} lang=${lang} stageId=${stageId} route=${route} />` : null}
    </div>
  </aside>`;
}

// ------------------------------------------------------------ Artikel
function UnitHeader({ data, unitId, version, lang, stageId, route, mode }) {
  const meta = data.unitMeta(unitId);
  const st = data.stage(stageId);
  const recon = data.isReconstructed(stageId);
  const computed = mode === 'datum' && data.full;
  const ti = data.unitTitle(unitId, lang, computed ? data.latest.id : stageId);
  return html`<header class="unit-head">
    <p class="unit-label" lang=${lang}>${version && version.label ? version.label : cite(meta, null, lang, null)}</p>
    <${UnitTitle} ti=${version && !version.repealed ? ti : { html: '', text: '', derived: '' }} lang=${lang} />
    <p class="unit-meta">
      <span>${uiCite(data, unitId, null)}</span>
      ${computed ? html`<span>${t('read.computedAt', { date: fmtDate(route.d || data.today) })}</span>` : html`<span>${data.stageLabel(stageId)}${data.stageDate(stageId) && !data.isConsStage(stageId) && mode !== 'vorschau' ? ' (' + fmtDate(data.stageDate(stageId)) + ')' : ''}</span>`}
      ${!computed && st && st.source ? html`<span class=${'tag ' + (recon ? 'tag-recon' : st.source.kind === 'preview' ? 'tag-pending' : 'tag-src')} title=${data.sourceNote(stageId)}>${st.source.kind === 'preview' ? t('preview.tag') : data.sourceLabel(stageId)}</span>` : null}
    </p>
  </header>`;
}

function ActLegend({ data, version }) {
  if (!version || !version.blocks) return null;
  const acts = [...new Set(version.blocks.map((b) => b.o).filter((o) => o && o !== data.work.celex))];
  if (!acts.length) return null;
  return html`<div class="act-legend">
    <h2 class="act-legend-title">${t('read.originBy')}</h2>
    <ul class="act-legend-list">
      ${acts.map((c) => html`<li class="act-legend-item"><${ActChip} data=${data} celex=${c} number /><${StatusTag} data=${data} celex=${c} /></li>`)}
    </ul>
  </div>`;
}

export function Read({ data: base, route }) {
  const mode = readMode(base, route);
  const pv = usePreviewData(base, route);
  const data = mode === 'vorschau' && pv.pd ? pv.pd : base;
  const lang = route.l;
  useEffect(() => { if (mode === 'vorschau' && route.pv && route.l !== 'en') go({ l: 'en' }, { replace: true }); }, [mode, route.pv, route.l]);
  const unitId = currentUnit(data, route);
  const stageId = currentStage(data, route);
  const settings = settingsStore.use();
  const date = route.d || data.today;
  const computed = mode === 'datum' && data.full;
  const redline = route.red === '1' && !computed;
  const mainRef = useRef();

  let version, notices = [];
  if (computed && data.workId === 'sgk') { const r = data.composeAtDate(unitId, lang, date); version = r.version; notices = r.notices; }
  else if (computed) version = data.composeAt(unitId, lang, date);
  else version = data.version(unitId, lang, stageId);
  const setMode = (m) => go({ m, red: m === 'datum' ? '0' : m === 'vorschau' ? '1' : route.red, pv: m === 'vorschau' ? route.pv : null, pv2: null, ...(m === 'vorschau' ? { l: 'en' } : {}) }, { replace: true });
  const refIdx = settings.refs !== false && !redline && !data.preview ? data.refIndex(lang, computed ? data.latest.id : stageId).out : null;
  const prevStage = data.prevStage(stageId);
  const prev = redline && prevStage ? data.version(unitId, lang, prevStage.id) : null;
  const changedHere = data.versions(unitId, lang).some((v) => v.stage === stageId);
  const lastChange = [...data.versions(unitId, lang)].filter((v) => data.stageIndex(v.stage) <= data.stageIndex(stageId)).pop();

  useEffect(() => { if (mainRef.current) mainRef.current.scrollTop = 0; }, [unitId]);
  useEffect(() => {
    if (!route.k || route.k === '*' || !mainRef.current) return;
    const el = mainRef.current.querySelector(`[data-k="${CSS.escape(route.k)}"]`);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [route.k, unitId]);

  const idx = data.unitOrder.indexOf(unitId);
  const prevU = idx > 0 ? data.unitOrder[idx - 1] : null;
  const nextU = idx < data.unitOrder.length - 1 ? data.unitOrder[idx + 1] : null;
  const pendingActs = mode === 'alle' && version && version.blocks ? [...new Set(version.blocks.map((b) => b.o).filter((o) => o && data.isPending(o)))] : [];
  const excluded = computed ? data.excludedAt(date) : [];
  const panelOpen = !!route.k;
  const st = data.stage(stageId);
  const actList = (list) => list.map((c, i) => html`${i ? ', ' : ''}<b>${data.actCode(c)}</b>`);

  return html`<div class=${'view view-read' + (panelOpen ? ' has-panel' : '')}>
    <${Toc} data=${data} route=${route} stageId=${stageId} lang=${lang} activeUnit=${unitId} />
    <main class="reader" ref=${mainRef} id="main" tabindex="-1">
      <div class="reader-tools">
        <div class="toolbar">
          <div class="tool-group">
            <span class="tool-label" id="lbl-mode">${t('read.mode.label')}</span>
            <${Seg} labelledby="lbl-mode" value=${mode} onChange=${setMode} options=${[
              { value: 'stand', label: t('read.mode.stand') },
              { value: 'datum', label: data.full ? t('read.mode.datum') : t('read.mode.fassung'), title: data.full ? undefined : t('read.mode.fassungTip') },
              ...(base.full ? [{ value: 'alle', label: t('read.mode.alle') }] : []),
            ]} />
          </div>
          <button type="button" class=${'btn btn-secondary pv-toggle' + (mode === 'vorschau' ? ' is-on' : '')} id="btn-preview" aria-pressed=${mode === 'vorschau' ? 'true' : 'false'} title=${t('preview.modeTip')} onClick=${() => setMode(mode === 'vorschau' ? 'stand' : 'vorschau')}><${Icon} name="eye" />${t('preview.mode')}</button>
          ${mode === 'datum' ? html`<label class="tool-group"><span class="tool-label">${t('read.date')}</span><input type="date" id="read-date" value=${date} onChange=${(e) => go({ d: e.target.value || null }, { replace: true })} /></label>` : null}
          <span class="spacer"></span>
          <div class="tool-cluster"><${LegalLangSwitch} data=${data} route=${route} /><${HelpLink} sec="lesen" /></div>
        </div>
        <div class="toolbar toolbar-checks">
          ${!computed ? html`<label class="check"><input type="checkbox" checked=${redline} onChange=${(e) => go({ red: e.target.checked ? '1' : '0' }, { replace: true })} />${mode === 'vorschau' ? t('preview.redline') : t('read.redline')}</label>` : null}
          <label class="check"><input type="checkbox" checked=${settings.origin} onChange=${(e) => { settingsStore.set({ ...settings, origin: e.target.checked }); persistSettings(); }} />${t('read.originMarks')}</label>
          ${mode !== 'vorschau' ? html`<label class="check" title=${t('refs.toggleTip')}><input type="checkbox" id="chk-refs" checked=${settings.refs !== false} onChange=${(e) => { settingsStore.set({ ...settings, refs: e.target.checked }); persistSettings(); }} />${t('refs.toggle')}</label>` : null}
        </div>
        ${mode === 'stand' ? html`<${StageBar} data=${data} unitId=${unitId} lang=${lang} value=${stageId} onPick=${(s) => go({ s }, { replace: true })} />` : null}
        ${mode === 'vorschau' ? html`<${PreviewBar} base=${base} route=${route} pd=${pv.pd} err=${pv.err} busy=${pv.busy} view="lesen" />` : null}
      </div>

      <article class="unit">
        <${UnitHeader} data=${data} unitId=${unitId} version=${version} lang=${lang} stageId=${stageId} route=${route} mode=${mode} />
        <div class="unit-notes">
          ${computed ? html`<${Notice} kind="computed" title=${t('read.notice.computedTitle')}>
              ${t(data.workId === 'sgk' ? 'read.notice.computedTextChanges' : 'read.notice.computedText', { date: fmtDate(date) })}
              ${excluded.length ? html`<br />${t('read.notice.excluded')} ${excluded.map((c, i) => html`${i ? ', ' : ''}<b>${data.actCode(c)}</b> (${data.status(c, date).label || t('status.notApplicable')})`)}.` : null}
            </${Notice}>` : null}
          ${computed && notices.length ? html`<${NoticeList} data=${data} unitId=${unitId} notices=${notices} onPick=${(k) => go({ k })} />` : null}
          ${mode === 'datum' && !data.full ? html`<${Notice} kind="info" title=${t('read.notice.fassungTitle')}>${t('read.notice.fassungText', { date: fmtDate(date), stage: data.stageLabel(stageId) })}</${Notice}>` : null}
          ${mode === 'vorschau' && pv.pd && route.l !== 'en' ? html`<${Notice} kind="info">${t('preview.onlyEn')}</${Notice}>` : null}
          ${mode === 'alle' ? html`<${Notice} kind="info" title=${t('read.notice.allTitle')}>
              ${t('read.notice.allText', { stage: data.stageName(stageId) })}${pendingActs.length ? html` ${t('read.notice.allPending')} ${actList(pendingActs)}.` : ' ' + t('read.notice.allNonePending')}
            </${Notice}>` : null}
          ${!computed && data.isReconstructed(stageId) ? html`<${Notice} kind="warning" title=${data.isConsolidatedBase(st) ? t('read.notice.supplementedTitle') : t('read.notice.reconTitle')}>
              ${data.sourceNote(stageId) || t('read.notice.reconText')}
            </${Notice}>` : null}
          ${redline && !changedHere ? html`<${Notice} kind="info">${t('read.notice.notChanged')} ${lastChange && lastChange.stage !== data.stages[0].id ? html`${t('read.notice.lastChange')} <button type="button" class="link" onClick=${() => go({ s: lastChange.stage }, { replace: true })}>${data.stageLabel(lastChange.stage)}</button>.` : t('read.notice.unchangedSinceBase')}</${Notice}>` : null}
        </div>
        ${!version ? html`<${Empty} title=${t('read.empty.notYet')}>${data.versions(unitId, lang)[0] ? html`${t('read.empty.insertedWith')} <button type="button" class="link" onClick=${() => go({ s: data.versions(unitId, lang)[0].stage, m: 'stand' })}>${data.stageLabel(data.versions(unitId, lang)[0].stage)}</button>.` : null}</${Empty}>`
          : version.repealed ? html`<${Empty} title=${t('read.empty.repealed')}>${t('read.empty.repealedText', { stage: data.stageLabel(version.stage) })}</${Empty}>`
          : html`
            <div class="unit-bar">
              <${ActLegend} data=${data} version=${version} />
              <div class="unit-actions">
                <button type="button" class="btn btn-secondary" onClick=${() => go({ k: '*' })}><${Icon} name="clock" />${t('read.unitChron')}</button>
                <button type="button" class="btn btn-primary" onClick=${() => go(mode === 'vorschau' ? { view: 'vergleich', u: unitId, k: null, cm: 'vorschau', a: null, b: null } : { view: 'vergleich', u: unitId, k: null, a: prevStage ? (lastChange && lastChange.stage === stageId ? prevStage.id : data.stages[0].id) : data.stages[0].id, b: stageId })}><${Icon} name="columns" />${t('read.compare')}</button>
              </div>
            </div>
            <p class="hint"><${Icon} name="clock" />${t('read.hint')}</p>
            <div class="legal legal-read" lang=${lang}>
              <${BlockList} data=${data} unitId=${unitId} version=${version} lang=${lang} prev=${prev} redline=${redline} selectedKey=${route.k}
                originMarks=${settings.origin} onSelect=${(k) => go({ k: route.k === k ? null : k })} refs=${refIdx} stageId=${computed ? data.latest.id : stageId} notices=${notices} route=${route} />
            </div>`}
        <nav class="unit-nav" aria-label=${t('read.pager')}>
          ${prevU ? html`<button type="button" class="btn btn-tertiary" onClick=${() => go({ u: prevU, k: null })}><${Icon} name="arrow-left" />${uiCite(data, prevU, null, false)}</button>` : html`<span></span>`}
          ${nextU ? html`<button type="button" class="btn btn-tertiary" onClick=${() => go({ u: nextU, k: null })}>${uiCite(data, nextU, null, false)}<${Icon} name="arrow-right" /></button>` : null}
        </nav>
      </article>
    </main>
    ${panelOpen ? html`<${ChronPanel} data=${data} unitId=${unitId} k=${route.k} lang=${lang} onClose=${() => go({ k: null })} onPick=${(k) => go({ k })} route=${route} stageId=${computed ? data.latest.id : stageId} />` : null}
  </div>`;
}

// ------------------------------------------------------------ Chronologie breit
export function UnitSelect({ data, value, lang, onChange, id }) {
  return html`<select id=${id} value=${value} onChange=${(e) => onChange(e.target.value)}>${data.unitOrder.map((uid) => {
    const ti = data.unitTitle(uid, lang, data.latest.id);
    const txt = ti.label || (ti.repealed ? t('read.toc.repealed') : '');
    const short = txt.length > 54 ? txt.slice(0, 52).replace(/\s+\S*$/, '') + ' …' : txt;
    return html`<option value=${uid} title=${txt} lang=${ti.text || ti.derived ? lang : undefined}>${uiCite(data, uid, null, false)}${short ? ': ' + short : ''}</option>`;
  })}</select>`;
}

export function KeySelect({ data, unitId, lang, value, onChange, id }) {
  const keys = new Map();
  for (const v of data.versions(unitId, lang)) for (const b of v.blocks || []) if (!keys.has(b.k)) keys.set(b.k, b);
  return html`<select id=${id} value=${value} onChange=${(e) => onChange(e.target.value)}>
    <option value="*">${t('common.wholeUnit')}</option>
    ${[...keys.values()].map((b) => html`<option value=${b.k}>${uiCite(data, unitId, b.k, false)}</option>`)}
  </select>`;
}

export function ChronikView({ data: base, route }) {
  const pv = usePreviewData(base, route);
  const data = pv.pd || base;
  const lang = route.l;
  const unitId = currentUnit(data, route);
  const k = route.k && route.k !== '*' ? route.k : null;
  const ti = data.unitTitle(unitId, lang, data.latest.id);
  const [diff, setDiff] = useState(true);
  const spec = { ...(k ? { kind: 'block', unit: unitId, key: k, lang } : { kind: 'unit', unit: unitId, key: null, lang }), w: data.workId, pv: data.preview ? route.pv : null };
  const nChanges = k ? blockSteps(data, unitId, lang, k).filter((x) => x.change !== 'base').length : unitSteps(data, unitId, lang).filter((x) => !x.first).length;
  return html`<div class="view view-chronik">
    <main class="wide" id="main" tabindex="-1">
      <div class="view-tools">
        <div class="toolbar">
          <label class="field"><span class="field-label">${t('common.unit')}</span>
            <${UnitSelect} data=${data} value=${unitId} lang=${lang} onChange=${(u) => go({ u, k: null })} /></label>
          <label class="field"><span class="field-label">${t('common.provision')}</span>
            <${KeySelect} data=${data} unitId=${unitId} lang=${lang} value=${k || '*'} onChange=${(v) => go({ k: v })} /></label>
          ${k ? html`<div class="field"><span class="field-label" id="lbl-disp">${t('chron.display')}</span><${Seg} labelledby="lbl-disp" value=${diff ? 'd' : 't'} onChange=${(v) => setDiff(v === 'd')} options=${[{ value: 'd', label: t('chron.showChanges') }, { value: 't', label: t('chron.showText') }]} /></div>` : null}
          <span class="spacer"></span>
          <div class="tool-cluster"><${LegalLangSwitch} data=${data} route=${route} field /><${HelpLink} sec="chronologie" /></div>
        </div>
      </div>
      <div class="chron-layout">
        <div class="chron-main">
          <header class="unit-head chron-head">
            <div class="chron-head-text">
              <p class="unit-label">${t('chron.title')}</p>
              <h1 class="unit-title">${uiCite(data, unitId, k)}</h1>
              <p class="unit-meta chron-sub"><${TitleText} ti=${ti} lang=${lang} /><span class="chron-count">${t('chron.countLine', { n: nChanges })}</span></p>
            </div>
            <div class="unit-actions"><button type="button" class="btn btn-tertiary" onClick=${() => go({ view: 'lesen', u: unitId, k: route.k })}><${Icon} name="book" />${t('chron.showInText')}</button></div>
          </header>
          <div class="chron-wide">
            ${data.preview ? html`<${Notice} kind="computed" title=${t('preview.noticeTitle')}>${t('preview.chronNote', { stage: data.stageLabel(data.preview.runs[0].stage) })} <button type="button" class="link" onClick=${() => go({ pv: null, pv2: null })}>${t('preview.leave')}</button></${Notice}>` : null}
            ${k ? html`<${BlockChronology} data=${data} unitId=${unitId} k=${k} lang=${lang} showDiff=${diff} route=${route} rationale=${false} />` : html`<${UnitChronology} data=${data} unitId=${unitId} lang=${lang} onPick=${(kk) => go({ k: kk })} route=${route} rationale=${false} />`}
          </div>
        </div>
        <aside class="chron-side" aria-label=${t('chron.sideLabel')}>
          <${ExportCard} data=${data} spec=${spec} model=${specModel(spec)} extra=${html`<${RatExportToggle} data=${data} />`} />
          <${RationaleCard} data=${data} unitId=${unitId} k=${k} lang=${lang} />
        </aside>
      </div>
    </main>
  </div>`;
}

/** Karte «Begründung» der Seitenleiste: Erwägungsgründe je Akt (bestehende Darstellung RationaleBox). */
function RationaleCard({ data, unitId, k, lang }) {
  if (data.workId !== 'sgk' || data.preview) return null;
  const steps = rationaleSteps(data, unitId, lang, k).filter((x) => rationaleFor(data, x.celex, unitId, k, lang).length);
  return html`<section class="side-card ratcard" aria-labelledby="ratcard-h">
    <h2 class="side-card-title" id="ratcard-h">${t('rat.cardTitle')}</h2>
    ${steps.length ? steps.map((x) => html`<div class="ratcard-act">
      <div class="ratcard-head"><${ActChip} data=${data} celex=${x.celex} number /></div>
      <${RationaleBox} data=${data} celex=${x.celex} unitId=${unitId} k=${k} lang=${lang} />
    </div>`) : html`<p class="side-card-hint">${t('rat.cardNone')}</p>`}
  </section>`;
}
