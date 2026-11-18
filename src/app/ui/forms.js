// Formulare und Schilder der Anhänge als Text (Etappe 3, Erweiterung 9): Umschalter Bild | Text, Transkription, Formularvergleich.
import { html } from 'htm/preact';
import { useState } from 'preact/hooks';
import { formFor } from '../library.js';
import { safeInline } from '../lib/sanitize.js';
import { diffText, markAll } from '../lib/diff.js';
import { escapeHtml } from '../lib/format.js';
import { cite } from '../lib/cite.js';
import { go } from '../state.js';
import { t, uiLang } from '../lib/i18n.js';
import { settingsStore, persistSettings } from '../app.js';
import { Icon } from './common.js';
import { alignBlocks } from './compare.js';

/** Text eines Formularblocks mit gekennzeichneten sic-Stellen */
function sicHtml(f, b) {
  let h = safeInline(b.t || '');
  for (const s of (f.sic || []).filter((x) => x.k === b.k)) {
    const e = escapeHtml(s.text);
    const i = h.indexOf(e);
    if (i >= 0) h = h.slice(0, i) + `<span class="sic" title="${escapeHtml(t('forms.sicTip'))}">${e}</span><span class="sic-mark">[sic]</span>` + h.slice(i + e.length);
  }
  return h;
}

/** Abgelöste Formularpunkte (z. B. Grund (C) ab ETIAS) im gewählten Stand */
export function supersededAt(data, f, stageId) {
  if (!f || !Array.isArray(f.superseded)) return [];
  const si = data.stageIndex(stageId || data.latest.id);
  return f.superseded.filter((x) => !x.from || data.stageIndex(x.from) <= si);
}

export function FormText({ data, f, stageId, lang }) {
  const sup = supersededAt(data, f, stageId);
  const supK = new Set(sup.map((x) => x.k));
  const note = f.layoutNote && (f.layoutNote[uiLang()] || f.layoutNote.de);
  return html`<div class="form-text">
    <p class="form-meta"><span class="tag tag-recon">${t('forms.transcription')}</span>${f.checked === 'double' ? html`<span class="muted small">${t('forms.checked')}</span>` : null}</p>
    ${f.noText ? html`<p class="muted small">${t('forms.noText')}</p>` : html`<ol class="form-blocks legal" lang=${lang}>
      ${f.blocks.map((b) => html`<li class=${'form-blk' + (supK.has(b.k) ? ' is-superseded' : '') + (/\.(n|s)\d/.test(b.k) ? ' is-sub' : '')}>
        ${b.l ? html`<span class="form-l">${b.l}</span>` : null}<span class="form-t" dangerouslySetInnerHTML=${{ __html: sicHtml(f, b) }}></span>
        ${supK.has(b.k) ? html`<span class="tag tag-partly">${t('forms.supersededTag')}</span>` : null}
      </li>`)}
    </ol>`}
    ${sup.map((x) => html`<p class="form-sup small"><${Icon} name="warning" /><span>${t('forms.superseded', { k: (f.blocks.find((b) => b.k === x.k) || {}).l || x.k, act: data.actName(x.celex) })}
      <a href=${'#/lesen?u=' + x.by.unit + '&k=' + x.by.key} onClick=${(e) => { e.preventDefault(); e.stopPropagation(); go({ view: 'lesen', u: x.by.unit, k: x.by.key }); }}>${cite(data.unitMeta(x.by.unit), x.by.key, uiLang(), data.abbr)}</a></span></p>`)}
    ${note ? html`<p class="form-note small"><b>${t('forms.layout')}</b> ${note}</p>` : null}
  </div>`;
}

/** Bild-Block mit Umschalter Bild | Text, falls eine Transkription vorliegt. */
export function FormFigure({ data, unitId, b, lang, stageId, img }) {
  const f = formFor(data, unitId, b, lang);
  const settings = settingsStore.use();
  const [local, setLocal] = useState(null);
  if (!f) return img;
  const mode = local || (settings.formText ? 'text' : 'img');
  const stop = (e) => e.stopPropagation();
  const set = (m) => { setLocal(m); settingsStore.set({ ...settingsStore.get(), formText: m === 'text' }); persistSettings(); };
  return html`<div class="form-fig" onClick=${stop} onKeyDown=${stop}>
    <div class="seg seg-sm form-switch" role="group" aria-label=${t('forms.view')}>
      <button type="button" aria-pressed=${mode === 'img' ? 'true' : 'false'} onClick=${() => set('img')}><${Icon} name="image" />${t('forms.img')}</button>
      <button type="button" aria-pressed=${mode === 'text' ? 'true' : 'false'} onClick=${() => set('text')}><${Icon} name="text" />${t('forms.text')}</button>
    </div>
    ${mode === 'text' ? html`<${FormText} data=${data} f=${f} stageId=${stageId} lang=${lang} />` : img}
  </div>`;
}

/** Vergleich zweier Formularfassungen als Text (Blöcke f… nach Schlüssel). null, wenn keine Transkription vorliegt. */
export function formCompareRows(data, unitId, oldB, newB, langA, langB = langA) {
  const fa = oldB ? formFor(data, unitId, oldB, langA) : null;
  const fb = newB ? formFor(data, unitId, newB, langB) : null;
  if (!fa && !fb) return null;
  const rows = alignBlocks(fa ? fa.blocks : [], fb ? fb.blocks : []);
  for (const r of rows) r.status = !r.left ? 'ins' : !r.right ? 'del' : (r.left.t || '') === (r.right.t || '') ? 'same' : 'changed';
  return { fa, fb, rows };
}

export function FormCompare({ data, unitId, oldB, newB, lang, onlyChanges = false }) {
  const res = formCompareRows(data, unitId, oldB, newB, lang);
  if (!res) return null;
  const vis = onlyChanges ? res.rows.filter((r) => r.status !== 'same') : res.rows;
  const n = res.rows.filter((r) => r.status !== 'same').length;
  return html`<div class="form-cmp">
    <p class="form-meta"><span class="tag tag-recon">${t('forms.transcription')}</span><span class="muted small">${t('forms.cmpStats', { n })}</span></p>
    <ol class="form-blocks legal" lang=${lang}>
      ${vis.map((r) => {
        const b = r.right || r.left;
        const h = r.status === 'changed' ? diffText(safeInline(r.left.t), safeInline(r.right.t)).redline
          : r.status === 'ins' ? markAll(safeInline(b.t), 'ins') : r.status === 'del' ? markAll(safeInline(b.t), 'del') : safeInline(b.t);
        return html`<li class=${'form-blk st-' + r.status + (/\.(n|s)\d/.test(b.k) ? ' is-sub' : '')}>${b.l ? html`<span class="form-l">${b.l}</span>` : null}<span class="form-t" dangerouslySetInnerHTML=${{ __html: h }}></span></li>`;
      })}
    </ol>
  </div>`;
}
