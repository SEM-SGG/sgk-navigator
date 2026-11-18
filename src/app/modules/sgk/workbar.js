// Werkwahl des Moduls Rechtsakte (Etappe 3, Erweiterung 3): Leiste unter dem Kopf, wie die Dossierleiste im Modul Verhandlung.
import { html } from 'htm/preact';
import { go } from '../../state.js';
import { works, validWork, workAbbr, workShort } from '../../library.js';
import { t, uiLang } from '../../lib/i18n.js';

/** Nummer ohne Präfix in der Oberflächensprache: "2017/2226", "767/2008" */
export const workNum = (w) => String((w && w.number) || '').replace(/^\((?:EU|EG|UE|CE)\)\s*/, '').replace(/^(?:Nr\.|No)\s*/, '');

export function WorkBar({ route }) {
  const list = works();
  if (list.length < 2) return null;
  const cur = validWork(route.w);
  const w = list.find((x) => x.id === cur);
  const l = uiLang();
  const pick = (id) => {
    if (id === cur) return;
    const view = route.view === 'chronik' ? 'lesen' : route.view;
    go({ w: id, view, u: null, k: null, s: null, a: null, b: null, act: null, q: null, d: null, pv: null, pv2: null, cm: route.cm === 'vorschau' ? 'stand' : route.cm, m: route.m === 'vorschau' ? 'stand' : route.m });
  };
  // Tabs nach Carbon: Pfeiltasten (und Pos1/Ende) wechseln das Werk
  const onKey = (e) => {
    const i = list.findIndex((x) => x.id === cur);
    const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : null;
    if (n == null) return;
    e.preventDefault();
    const next = list[(n + list.length) % list.length];
    pick(next.id);
    requestAnimationFrame(() => { const b = document.querySelector(`.workbar-tab[data-work="${next.id}"]`); if (b) b.focus(); });
  };
  return html`<div class="workbar" role="navigation" aria-label=${t('ra.work.label')}>
    <span class="workbar-label" id="lbl-work">${t('ra.work.label')}</span>
    <div class="workbar-tabs" role="tablist" aria-labelledby="lbl-work" onKeyDown=${onKey}>
      ${list.map((x) => html`<button type="button" role="tab" class="workbar-tab" aria-selected=${x.id === cur ? 'true' : 'false'} tabindex=${x.id === cur ? '0' : '-1'} data-work=${x.id}
        title=${workShort(x, l) + ', ' + t('ra.work.reg', { num: workNum(x) })} onClick=${() => pick(x.id)}>
        <span class="workbar-abbr">${workAbbr(x, l)}</span><span class="workbar-num">${workNum(x)}</span></button>`)}
    </div>
    <span class="workbar-note"><a class=${'tag workbar-info ' + (w && !w.full ? 'tag-src' : 'tag-ok')} href="#/anleitung?sec=werke" title=${w && !w.full ? t('ra.work.consTip') : t('ra.work.fullTip')}
      onClick=${(e) => { e.preventDefault(); go({ view: 'anleitung', sec: 'werke' }); }}><svg class="ico" aria-hidden="true"><use href="#info"></use></svg>${w && !w.full ? t('ra.work.consTag') : t('ra.work.fullTag')}</a></span>
  </div>`;
}
