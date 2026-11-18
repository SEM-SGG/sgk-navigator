// Vergleich: zwei Stände (nebeneinander oder Redline) oder zwei Sprachen im selben Stand.
import { html } from 'htm/preact';
import { go } from '../../state.js';
import { Seg, Notice, Icon, HelpLink, LegalLangSwitch } from '../../ui/common.js';
import { compareRows, CompareTable, compareStats } from '../../ui/compare.js';
import { ExportMenu, specModel } from '../../ui/exportmenu.js';
import { currentUnit, uiCite, UnitSelect, KeySelect } from './read.js';
import { t, uiLang } from '../../lib/i18n.js';
import { PreviewBar, usePreviewData } from './previewbar.js';
import { parsePv } from '../../preview.js';
import { useEffect } from 'preact/hooks';

function StageSelect({ data, value, onChange, id, unitId, lang }) {
  const changed = new Set(data.versions(unitId, lang).map((v) => v.stage));
  return html`<select id=${id} value=${value} onChange=${(e) => onChange(e.target.value)}>
    ${data.stages.map((s, i) => html`<option value=${s.id} title=${data.stageLabel(s.id)}>${changed.has(s.id) && i > 0 ? '● ' : ''}${data.stageOption(s.id)}</option>`)}
  </select>`;
}

export function defaultPair(data, unitId, lang) {
  const vs = data.versions(unitId, lang);
  if (vs.length >= 2) { const b = vs[vs.length - 1].stage; return { a: data.prevStage(b).id, b }; }
  return { a: data.stages[0].id, b: data.latest.id };
}

export function CompareView({ data: base, route }) {
  const isPv = route.cm === 'vorschau' || (!!route.pv && !!parsePv(route.pv));
  const pv = usePreviewData(base, route, { two: true });
  const data = isPv && pv.pd ? pv.pd : base;
  useEffect(() => { if (isPv && route.pv && route.l !== 'en') go({ l: 'en' }, { replace: true }); }, [isPv, route.pv, route.l]);
  const lang = route.l;
  const unitId = currentUnit(data, route);
  const mode = route.cm === 'sprache' && !isPv ? 'sprache' : 'stand';
  const def = defaultPair(data, unitId, lang);
  const runs = data.preview ? data.preview.runs : null;
  const a = runs ? (runs.length > 1 ? runs[0].stage : data.preview.base) : route.a && data.stage(route.a) ? route.a : def.a;
  const b = runs ? runs[runs.length - 1].stage : route.b && data.stage(route.b) ? route.b : def.b;
  const la = lang;
  const lb = route.l2 && route.l2 !== la ? route.l2 : data.langs.find((x) => x !== la);
  const key = route.k && route.k !== '*' ? route.k : null;
  const stA = mode === 'sprache' ? (route.b && data.stage(route.b) ? route.b : data.latest.id) : a;
  const opts = mode === 'sprache' ? { a: stA, b: stA, la, lb, key, mode } : { a, b, la: lang, lb: lang, key, mode };
  const res = compareRows(data, unitId, opts);
  const st = compareStats(res.rows);
  const spec = mode === 'sprache'
    ? { kind: 'compare', cm: 'sprache', unit: unitId, key, a: stA, la, lb, lay: 'side', sc: 'full' }
    : { kind: 'compare', cm: 'stand', unit: unitId, key, a, b, lang, lay: route.lay, sc: route.sc };
  spec.w = base.workId;
  if (data.preview) { spec.pv = route.pv; spec.pv2 = route.pv2 || null; }
  const swapped = mode === 'stand' && data.stageIndex(a) > data.stageIndex(b);
  const recon = (mode === 'sprache' ? [stA] : [a, b]).filter((s) => data.isReconstructed(s));
  const langName = (l) => `${t('lang.name.' + l)} (${l.toUpperCase()})`;
  let headA = mode === 'sprache' ? langName(la) : t('compare.headOld', { name: data.stageName(a, { short: true }) });
  let headB = mode === 'sprache' ? langName(lb) : t('compare.headNew', { name: data.stageName(b, { short: true }) });
  const trL = (r) => { const l = data.preview.trackLabel(r.track); return (l && (l[uiLang()] || l.de)) || r.track; };
  if (runs) {
    headA = runs.length > 1 ? t('preview.headTrack', { track: trL(runs[0]) }) : t('compare.headOld', { name: base.stageName(a, { short: true }) });
    headB = t('preview.headTrack', { track: trL(runs[runs.length - 1]) });
  }
  return html`<div class="view view-compare">
    <main class="wide" id="main" tabindex="-1">
      <div class="view-tools">
        <div class="toolbar cmp-tools">
          <div class="field cmp-kind"><span class="field-label" id="lbl-cm">${t('compare.kind')}</span>
            <${Seg} labelledby="lbl-cm" value=${isPv ? 'vorschau' : mode} onChange=${(v) => go({ cm: v, ...(v !== 'vorschau' ? { pv: null, pv2: null } : { l: 'en' }) }, { replace: true })} options=${[{ value: 'stand', label: t('compare.byStage') }, { value: 'sprache', label: t('compare.byLang') }, { value: 'vorschau', label: t('preview.mode'), title: t('preview.modeTip') }]} /></div>
          <div class="tool-cluster cmp-where">
            <label class="field"><span class="field-label">${t('common.unit')}</span>
              <${UnitSelect} data=${data} value=${unitId} lang=${lang} onChange=${(u) => { const d = defaultPair(data, u, lang); go({ u, k: null, a: d.a, b: d.b }, { replace: true }); }} /></label>
            <label class="field"><span class="field-label">${t('common.provision')}</span>
              <${KeySelect} data=${data} unitId=${unitId} lang=${lang} value=${key || '*'} onChange=${(v) => go({ k: v === '*' ? null : v }, { replace: true })} /></label>
          </div>
          ${isPv ? null : mode === 'stand' ? html`
            <div class="tool-cluster cmp-stages">
            <label class="field"><span class="field-label">${t('compare.oldStage')}</span><${StageSelect} id="cmp-a" data=${data} value=${a} unitId=${unitId} lang=${lang} onChange=${(v) => go({ a: v }, { replace: true })} /></label>
            <button type="button" class="btn-icon btn-swap" aria-label=${t('compare.swap')} title=${t('compare.swap')} onClick=${() => go({ a: b, b: a }, { replace: true })}><${Icon} name="swap" /></button>
            <label class="field"><span class="field-label">${t('compare.newStage')}</span><${StageSelect} id="cmp-b" data=${data} value=${b} unitId=${unitId} lang=${lang} onChange=${(v) => go({ b: v }, { replace: true })} /></label>
            </div>
          ` : html`
            <div class="tool-cluster cmp-stages">
            <label class="field"><span class="field-label">${t('common.stage')}</span><${StageSelect} id="cmp-s" data=${data} value=${stA} unitId=${unitId} lang=${lang} onChange=${(v) => go({ b: v }, { replace: true })} /></label>
            <label class="field"><span class="field-label">${t('compare.left')}</span><select value=${la} onChange=${(e) => go({ l: e.target.value }, { replace: true })}>${data.langs.map((l) => html`<option value=${l}>${t('lang.name.' + l)}</option>`)}</select></label>
            <label class="field"><span class="field-label">${t('compare.right')}</span><select value=${lb} onChange=${(e) => go({ l2: e.target.value }, { replace: true })}>${data.langs.filter((l) => l !== la).map((l) => html`<option value=${l}>${t('lang.name.' + l)}</option>`)}</select></label>
            </div>
          `}
          <span class="cmp-break" aria-hidden="true"></span>
          ${mode === 'stand' ? html`
            <div class="field cmp-lay"><span class="field-label" id="lbl-lay">${t('compare.layout')}</span><${Seg} labelledby="lbl-lay" value=${route.lay} onChange=${(v) => go({ lay: v }, { replace: true })} options=${[{ value: 'side', label: t('compare.sideBySide') }, { value: 'redline', label: t('compare.redline') }]} /></div>
            <div class="field cmp-sc"><span class="field-label" id="lbl-sc">${t('compare.scope')}</span><${Seg} labelledby="lbl-sc" value=${route.sc} onChange=${(v) => go({ sc: v }, { replace: true })} options=${[{ value: 'changed', label: t('compare.onlyChanges') }, { value: 'full', label: t('compare.fullText') }]} /></div>
            <${LegalLangSwitch} data=${data} route=${route} field />
          ` : null}
          <${HelpLink} sec=${mode === 'sprache' ? 'sprachvergleich' : 'vergleich'} />
          <span class="spacer"></span>
          <${ExportMenu} data=${data} spec=${spec} model=${specModel(spec)} />
        </div>
        ${isPv ? html`<${PreviewBar} base=${base} route=${route} pd=${pv.pd} err=${pv.err} busy=${pv.busy} view="vergleich" />` : null}
      </div>

      <header class="unit-head cmp-head">
        <div class="cmp-head-text">
          <p class="unit-label">${mode === 'sprache' ? t('compare.langTitle') : t('compare.heading')}</p>
          <h1 class="unit-title">${uiCite(data, unitId, key)}</h1>
          ${mode === 'sprache' ? html`<p class="unit-meta"><span>${data.stageLabel(stA)}</span><span>${la.toUpperCase()} | ${lb.toUpperCase()}</span></p>` : null}
        </div>
        ${mode === 'sprache' ? null : html`<p class="cmp-counts" aria-label=${t('compare.statLabel')}>
          <span class="tag tag-chg">${t('compare.statChanged', { n: st.changed })}</span><span class="tag tag-ins">${t('compare.statIns', { n: st.ins })}</span><span class="tag tag-del">${t('compare.statDel', { n: st.del })}</span>${res.titleChanged ? html`<span class="tag tag-src">${t('compare.titleChanged')}</span>` : null}
        </p>`}
      </header>
      <div class="unit-notes">
        ${swapped ? html`<${Notice} kind="warning">${t('compare.swapped')}</${Notice}>` : null}
        ${recon.length ? html`<${Notice} kind="warning" title=${t('compare.reconTitle', { n: recon.length })}>${recon.map((s, i) => html`${i ? '; ' : ''}${t('compare.reconItem', { stage: data.stageLabel(s), source: data.sourceLabel(s) })}`)}. ${t('compare.detailsIn')} <a href="#/info">${t('nav.info')}</a>.</${Notice}>` : null}
        ${mode === 'sprache' && res.rows.some((r) => r.status === 'missing') ? html`<${Notice} kind="warning">${t('compare.structureDiffers')}</${Notice}>` : null}
      </div>
      <${CompareTable} data=${data} unitId=${unitId} result=${res} layout=${route.lay} scope=${route.sc} mode=${mode} headA=${headA} headB=${headB} langA=${mode === 'sprache' ? la : lang} langB=${mode === 'sprache' ? lb : lang} stageA=${mode === 'sprache' ? stA : a} stageB=${mode === 'sprache' ? stA : b}
        onPick=${(k) => go({ view: 'lesen', u: unitId, k, s: mode === 'sprache' ? stA : b, m: 'stand' })} />
    </main>
  </div>`;
}
