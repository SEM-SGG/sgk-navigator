// Vorschau hängiger Vorschläge (Erweiterung 1): Auswahl Dossier, Spur, Fassung; Kennzahlen, betroffene Einheiten, nicht angewandte Anweisungen.
import { html } from 'htm/preact';
import { useEffect, useState } from 'preact/hooks';
import { go } from '../../state.js';
import { Icon, Notice } from '../../ui/common.js';
import { dataFor, parsePv, parsePv2, makePv, listDossiers, getDossier, tracksOf, demoDossier, hasDemo, DEMO_KEY } from '../../preview.js';
import { cite } from '../../lib/cite.js';
import { fmtDate } from '../../lib/format.js';
import { t, uiLang } from '../../lib/i18n.js';

/** Lädt die Vorschau-Daten zu route.pv (und route.pv2 im Vergleich). */
export function usePreviewData(base, route, { two = false } = {}) {
  const pv = route.pv && parsePv(route.pv) ? route.pv : null;
  const pv2 = two && route.pv2 ? route.pv2 : null;
  const key = pv && base ? [base.workId, base.stages.length, base.latest.id, pv, pv2 || ''].join('|') : null;
  const [st, setSt] = useState({ key: null, pd: null, err: null });
  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    dataFor({ w: base.workId, pv, pv2 }).then((pd) => { if (alive) setSt({ key, pd, err: null }); })
      .catch((e) => { console.warn(e); if (alive) setSt({ key, pd: null, err: e.message || String(e) }); });
    return () => { alive = false; };
  }, [key]);
  if (!key) return { pd: null, err: null, busy: false };
  return st.key === key ? { ...st, busy: false } : { pd: null, err: null, busy: true };
}

const L = (o) => (o && typeof o === 'object' ? o[uiLang()] || o.de || o.en : o) || '';
const docLabel = (x) => `${x.ref || x.title || x.id}${x.date ? ' (' + fmtDate(x.date) + ')' : ''}`;

/** Auswahl und Kennzahlen; view: 'lesen' | 'vergleich' */
export function PreviewBar({ base, route, pd, err, busy, view }) {
  const sel = parsePv(route.pv);
  const sel2 = parsePv2(route.pv2);
  const [list, setList] = useState(null);
  const [dossier, setDossier] = useState(null);
  useEffect(() => { let a = true; listDossiers().then((l) => a && setList(l)); return () => { a = false; }; }, [route.pv]);
  useEffect(() => { let a = true; if (sel) getDossier(sel.dossier).then((d) => a && setDossier(d)); else setDossier(null); return () => { a = false; }; }, [sel && sel.dossier]);
  const tracks = dossier ? tracksOf(dossier) : [];
  const useDemo = () => {
    const d = demoDossier(DEMO_KEY);
    if (!d) return;
    const tr = tracksOf(d);
    const first = tr.find((x) => x.id === 'council') || tr[0];
    go({ pv: makePv(d.id, first.id, null), l: 'en', red: '1' }, { replace: true });
  };
  const pickDossier = async (id) => {
    if (!id) { go({ pv: null, pv2: null }, { replace: true }); return; }
    const d = await getDossier(id);
    const tr = d ? tracksOf(d) : [];
    if (tr.length) go({ pv: makePv(id, tr[0].id, null), pv2: null, l: 'en' }, { replace: true });
  };
  const noDossier = list && !list.length;
  const run = pd && pd.preview ? pd.preview.runs : [];
  const r0 = run[0] && run[0].res;
  const unresolved = run.flatMap((r, i) => r.res.unresolved.map((u) => ({ ...u, run: i })));
  const units = pd && pd.preview ? pd.preview.touched.slice().sort((a, b) => (pd.unitIndex.get(a) ?? 1e9) - (pd.unitIndex.get(b) ?? 1e9)) : [];
  return html`<section class="pv-bar" aria-labelledby="pv-h">
    <${Notice} kind="computed" title=${t('preview.noticeTitle')}>${t('preview.noticeText')}</${Notice}>
    <h2 class="sr" id="pv-h">${t('preview.title')}</h2>
    ${noDossier && !sel ? html`<div class="pv-empty">
        <p>${t('preview.noDossier')}</p>
        ${hasDemo(DEMO_KEY) ? html`<button type="button" class="btn btn-secondary" id="pv-demo" onClick=${useDemo}><${Icon} name="folder" />${t('preview.loadDemo')}</button>` : null}
      </div>` : html`<div class="toolbar pv-tools">
        <label class="field"><span class="field-label">${t('preview.dossier')}</span>
          <select id="pv-dossier" value=${sel ? sel.dossier : ''} onChange=${(e) => pickDossier(e.target.value)}>
            <option value="">${t('preview.chooseDossier')}</option>
            ${(list || []).map((x) => html`<option value=${x.id} title=${[x.title, x.procedure].filter(Boolean).join(', ')}>${x.title || x.id}</option>`)}
            ${sel && list && !list.some((x) => x.id === sel.dossier) ? html`<option value=${sel.dossier}>${dossier ? dossier.short || dossier.title : sel.dossier}</option>` : null}
          </select></label>
        ${dossier ? html`<label class="field"><span class="field-label">${t('preview.track')}</span>
          <select id="pv-track" value=${sel.track} onChange=${(e) => go({ pv: makePv(sel.dossier, e.target.value, null) }, { replace: true })}>
            ${tracks.map((x) => html`<option value=${x.id}>${L(x.label)}</option>`)}</select></label>
          <label class="field"><span class="field-label">${t('preview.version')}</span>
          <select id="pv-doc" value=${sel.doc || 'latest'} onChange=${(e) => go({ pv: makePv(sel.dossier, sel.track, e.target.value === 'latest' ? null : e.target.value) }, { replace: true })}>
            <option value="latest">${t('preview.latest')}</option>
            ${((tracks.find((x) => x.id === sel.track) || {}).docs || []).map((x) => html`<option value=${x.id}>${docLabel(x)}</option>`)}</select></label>` : null}
        ${dossier && view === 'vergleich' ? html`<label class="field"><span class="field-label">${t('preview.track2')}</span>
          <select id="pv-track2" value=${sel2 ? sel2.track : ''} onChange=${(e) => go({ pv2: e.target.value ? e.target.value + '~latest' : null }, { replace: true })}>
            <option value="">${t('preview.vsBase')}</option>
            ${tracks.filter((x) => x.id !== sel.track).map((x) => html`<option value=${x.id}>${L(x.label)} (${t('preview.latest')})</option>`)}</select></label>` : null}
        ${hasDemo(DEMO_KEY) && !(dossier && dossier.demoKey === DEMO_KEY) ? html`<button type="button" class="btn btn-tertiary pv-demo-btn" onClick=${useDemo}><${Icon} name="folder" />${t('preview.useDemo')}</button>` : null}
      </div>`}
    ${err ? html`<${Notice} kind="error" title=${t('preview.failed')}>${err}</${Notice}>` : null}
    ${busy ? html`<p class="muted small">${t('preview.busy')}</p>` : null}
    ${r0 ? html`<div class="pv-sum">
      <p class="pv-stats">${run.map((r, i) => html`${i ? html`<br />` : null}<b>${L(pd.preview.trackLabel(r.track))}${r.doc ? ', ' + docLabel(pd.preview.docOf(r.doc) || { id: r.doc }) : ', ' + t('preview.latest')}:</b> ${t('preview.stats', { units: Object.keys(r.res.units).length, applied: r.res.stats.applied, unresolved: r.res.stats.unresolved })}`)}
        <span class="muted"> | ${t('preview.base', { stage: base.stageLabel(pd.preview.base) })}</span></p>
      ${units.length ? html`<div class="pv-units"><span class="field-label">${t('preview.affected')}</span>
        <ul class="pv-chips">${units.map((u) => html`<li><a class=${'chip chip-btn' + (route.u === u ? ' is-active' : '')} href=${'#/' + view + '?u=' + u} onClick=${(e) => { e.preventDefault(); go({ u, k: null }); }}>${cite(pd.unitMeta(u), null, uiLang(), null)}${!base.unit(u) ? html` <span class="chip-num">${t('preview.newUnit')}</span>` : null}</a></li>`)}</ul></div>` : null}
      ${unresolved.length ? html`<details class="pv-unres"><summary>${t('preview.unresolved', { n: unresolved.length })}</summary>
        <p class="muted small">${t('preview.unresolvedNote')}</p>
        <ul>${unresolved.map((u) => html`<li><b>${u.label || u.row}</b>${run.length > 1 ? html` <span class="muted">(${L(pd.preview.trackLabel(run[u.run].track))})</span>` : null}: <span lang="de">${u.reason}</span>${u.text ? html`<br /><span class="muted small legal" lang="en">${u.text.slice(0, 220)}${u.text.length > 220 ? ' …' : ''}</span>` : null}</li>`)}</ul>
      </details>` : null}
    </div>` : null}
  </section>`;
}
