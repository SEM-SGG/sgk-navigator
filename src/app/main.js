// Einstieg: Sprache der Oberfläche, Daten laden, gespeicherte Uploads anwenden, Oberfläche rendern.
import { html } from 'htm/preact';
import { render } from 'preact';
import { useEffect, useLayoutEffect, useState } from 'preact/hooks';
import { Data, loadEmbedded } from './data.js';
import { useRoute, go, getState, normalizeHash } from './state.js';
import { dataStore, toastStore, basketStore, panelStore, loadPersisted, persistBasket, toast, useData } from './app.js';
import { setBase, applyStoredUploads } from './uploads.js';
import { Icon, Seg } from './ui/common.js';
import { fmtDate } from './lib/format.js';
import { cardTitle, cardSubtitle, formatLabel } from './ui/card.js';
import { sgkModule } from './modules/sgk/index.js';
import { negModule } from './modules/neg/index.js';
import { registerStrings, setUiLang, initialUiLang, useUiLang, t, withUiLang, uiLang, keysOf, UI_LANGS } from './lib/i18n.js';
import de from './i18n/de.js';
import fr from './i18n/fr.js';
import deRa from './i18n/de-ra.js';
import frRa from './i18n/fr-ra.js';
import { workData, workById, setLibraryMeta, useLibrary, validWork, workShort, works, sgkExtras, formFor } from './library.js';
import { setLibraryContext } from './data.js';
import { dataFor } from './preview.js';
import { UpdateNotice, initUpdate } from './ui/updatenotice.js';
import { setAcknowledged } from './modules/sgk/updatelogic.js';

registerStrings('de', de);
registerStrings('fr', fr);
registerStrings('de', deRa);
registerStrings('fr', frRa);
setUiLang(initialUiLang(getState().ui), { persist: false });
document.documentElement.lang = uiLang() === 'fr' ? 'fr-CH' : 'de-CH';

const MODULES = [sgkModule, negModule];
/** Zuletzt besuchte Ansicht je Modul (Modulwechsel kehrt dorthin zurück). */
const lastView = {};

function Basket({ data }) {
  const items = basketStore.use();
  const { basket: open } = panelStore.use();
  const [busy, setBusy] = useState(false);
  // Fokus, Fokusfalle und Escape im selben Durchlauf wie das Öffnen (useLayoutEffect; useEffect liefe erst nach dem Zeichnen)
  useLayoutEffect(() => { if (open) { const b = document.querySelector('.drawer .btn-icon'); if (b) b.focus(); } }, [open]);
  // Fokusfalle, Escape schliesst immer; Höhe der Fusszeile für die Meldungen (liegen darüber)
  useLayoutEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      const dr = document.querySelector('.drawer');
      if (!dr) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      const f = [...dr.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')].filter((x) => x.getClientRects().length);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (!dr.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    const foot = () => { const f = document.querySelector('.drawer .panel-foot'); document.documentElement.style.setProperty('--drawer-foot', (f ? f.offsetHeight : 0) + 'px'); };
    foot();
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', foot);
    return () => { document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', foot); };
  }, [open, items.length]);
  if (!open) return null;
  function close() { panelStore.set({ basket: false }); const b = document.getElementById('btn-basket'); if (b) b.focus(); }
  const move = (i, d) => { const l = [...items]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x); basketStore.set(l); persistBasket(); };
  const remove = (i) => { basketStore.set(items.filter((_, j) => j !== i)); persistBasket(); };
  const pdf = async () => {
    setBusy(true);
    try { const ex = await import('./export.js'); await ex.exportPdf(data, items); toast(t('basket.pdfDone', { n: items.length }), 'success', 3000); }
    catch (e) { console.error(e); toast(t('basket.pdfFailed', { msg: e.message }), 'error'); }
    finally { setBusy(false); }
  };
  const textOut = (what) => async () => {
    setBusy(true);
    try {
      const ex = await import('./export.js');
      await ex.exportBasketText(items, what);
      toast(t('export.doneKind', { kind: t('export.kind.' + what) }), 'success', 3000);
    } catch (e) { console.error(e); toast(t('basket.pdfFailed', { msg: e.message }), 'error'); }
    finally { setBusy(false); }
  };
  const print = async () => { const ex = await import('./export.js'); await ex.printCards(data, items); };
  return html`<div class="drawer-scrim" onClick=${close}></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="bk-h" onKeyDown=${(e) => e.key === 'Escape' && close()}>
    <div class="panel-head"><h2 id="bk-h" class="panel-title">${t('basket.title')}</h2><button type="button" class="btn-icon is-bare" aria-label=${t('basket.close')} title=${t('basket.close')} onClick=${close}><${Icon} name="close" /></button></div>
    <div class="panel-body">
      ${items.length === 0 ? html`<p class="muted">${t('basket.empty', { menu: t('export.label'), item: t('export.basketA4') })}</p>` : html`<ol class="bk-list">
        ${items.map((it, i) => {
          let ti = '', s = '';
          try { const dd = it.pv ? workData('sgk') : workData(it.w); withUiLang(it.ui, () => { ti = cardTitle(dd, it); s = it.pv ? t('preview.cardSub') : cardSubtitle(dd, it); }); } catch { ti = it.unit; }
          return html`<li class="bk-item"><div class="bk-text"><b>${ti}</b><span>${s}</span><span class="muted">${formatLabel(it.format)}${it.ui ? ' | ' + t('basket.cardLang', { lang: it.ui.toUpperCase() }) : ''}</span></div>
            <div class="bk-tools">
              <button type="button" class="btn-icon" aria-label=${t('basket.up')} title=${t('basket.up')} disabled=${i === 0} onClick=${() => move(i, -1)}><${Icon} name="arrow-up" /></button>
              <button type="button" class="btn-icon" aria-label=${t('basket.down')} title=${t('basket.down')} disabled=${i === items.length - 1} onClick=${() => move(i, 1)}><${Icon} name="arrow-down" /></button>
              <button type="button" class="btn-icon is-bare btn-danger-ghost" aria-label=${t('basket.remove')} title=${t('basket.remove')} onClick=${() => remove(i)}><${Icon} name="trash" /></button>
            </div></li>`;
        })}
      </ol>`}
    </div>
    <div class="panel-foot">
      <button type="button" class="btn btn-primary" id="btn-basket-pdf" disabled=${!items.length || busy} onClick=${pdf}><${Icon} name="file-pdf" />${busy ? t('basket.pdfBusy') : t('basket.pdfAll')}</button>
      <button type="button" class="btn btn-secondary" id="btn-basket-docx" disabled=${!items.length || busy} onClick=${textOut('docx')}><${Icon} name="file" />${t('basket.docxAll')}</button>
      <button type="button" class="btn btn-secondary" id="btn-basket-pdftext" disabled=${!items.length || busy} onClick=${textOut('pdftext')}><${Icon} name="file-pdf" />${t('basket.pdfTextAll')}</button>
      <button type="button" class="btn btn-tertiary" disabled=${!items.length} onClick=${print}><${Icon} name="print" />${t('basket.print')}</button>
      <button type="button" class="btn btn-danger-ghost is-bare" disabled=${!items.length} onClick=${() => { basketStore.set([]); persistBasket(); }}><${Icon} name="trash" />${t('basket.clear')}</button>
    </div>
  </aside>`;
}

function Toasts() {
  const list = toastStore.use();
  return html`<div class="toasts" aria-live="polite" role="status">${list.map((x) => html`<div class=${'toast toast-' + x.kind}><${Icon} name=${x.kind === 'error' || x.kind === 'warning' ? 'warning' : x.kind === 'success' ? 'check-circle' : 'info'} /><span>${x.text}</span>
    <button type="button" class="btn-icon is-bare" aria-label=${t('common.closeMsg')} title=${t('common.closeMsg')} onClick=${() => toastStore.set((l) => l.filter((y) => y.id !== x.id))}><${Icon} name="close" /></button></div>`)}</div>`;
}

function UiLangSwitch({ id = 'lbl-ui' }) {
  const l = useUiLang();
  return html`<div class="tool-group head-lang">
    <span class="tool-label" id=${id}>${t('lang.ui')}</span>
    <${Seg} labelledby=${id} size="sm" value=${l} onChange=${(v) => { setUiLang(v); go({}, { replace: true }); }}
      options=${UI_LANGS.map((x) => ({ value: x, label: x.toUpperCase(), title: t('lang.uiName.' + x), aria: t('lang.uiName.' + x), lang: x }))} />
  </div>`;
}

const modTarget = (m) => lastView[m.id] || m.views[0].id;
const modLinks = (mod, onPick) => MODULES.map((m) => html`<a class=${'modbar-tab' + (m === mod ? ' is-current' : '')} href=${'#/' + modTarget(m)} aria-current=${m === mod ? 'page' : undefined}
  onClick=${(e) => { e.preventDefault(); if (onPick) onPick(); if (m !== mod) go({ view: modTarget(m), sec: null, r: null, pv: null }); }}>
  <span class="modbar-name">${t(m.id === 'sgk' ? 'nav.modSgk' : m.labelKey)}</span><span class="modbar-desc">${t(m.id === 'sgk' ? 'nav.modSgkDesc' : 'neg.moduleDesc')}</span></a>`);

/** Utility-Leiste (Carbon UiShell): Modulwechsel links, Datenstand und Oberflächensprache rechts. */
function ModBar({ mod, data }) {
  if (MODULES.length < 2) return null;
  const ds = data && data.ds && data.ds.generated;
  return html`<div class="modbar">
    <nav class="modbar-mods" aria-label=${t('nav.modules')}>${modLinks(mod)}</nav>
    <div class="modbar-meta">${ds ? html`<span class="modbar-asof">${t('ov.dataAsOf', { date: fmtDate(ds) })}</span>` : null}<${UiLangSwitch} /></div>
  </div>`;
}

/** Top-Navigation (Carbon UiShell): Wortmarke, Ansichten, Werkzeuge; unter 672 px Ansichten und Module im Menü. */
function Header({ route, mod }) {
  const items = basketStore.use();
  const [menu, setMenu] = useState(false);
  const views = mod.views.filter((v) => !v.hidden);
  const home = mod.views[0].id;
  useEffect(() => { setMenu(false); }, [route.view, mod.id]);
  useLayoutEffect(() => {
    if (!menu) return;
    const k = (e) => { if (e.key === 'Escape') { setMenu(false); const b = document.getElementById('btn-menu'); if (b) b.focus(); } };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [menu]);
  return html`<header class=${'app-head' + (menu ? ' is-menu' : '')}>
    <a class="skip" href="#main" onClick=${(e) => { e.preventDefault(); const m = document.getElementById('main'); if (m) m.focus(); }}>${t('common.skip')}</a>
    <button type="button" class="btn-icon is-bare head-menu" id="btn-menu" aria-expanded=${menu ? 'true' : 'false'} aria-controls="head-menu" aria-label=${t('nav.views')} title=${t('nav.views')} onClick=${() => setMenu(!menu)}><${Icon} name=${menu ? 'close' : 'menu'} /></button>
    <a class="brand" href=${'#/' + home} title=${mod.id === 'sgk' ? t('ra.brandSub') : t('neg.subtitle')} onClick=${(e) => { e.preventDefault(); go({ view: home }); }}>
      <span class="brand-name"><strong>SGK</strong> Navigator</span>
    </a>
    <nav class="views" id="head-menu" aria-label=${t('nav.views')}>
      ${views.map((v) => html`<a href=${'#/' + v.id} aria-current=${route.view === v.id ? 'page' : undefined} onClick=${(e) => { e.preventDefault(); setMenu(false); go({ view: v.id, sec: null }); }}>${t(v.labelKey)}</a>`)}
      ${menu ? html`<div class="views-mods" aria-label=${t('nav.modules')} role="group">${modLinks(mod, () => setMenu(false))}</div>
      <div class="views-lang"><${UiLangSwitch} id="lbl-ui-menu" /></div>` : null}
    </nav>
    <div class="head-tools">
      ${mod.id === 'sgk' ? html`<button type="button" class="btn-basket" id="btn-basket" onClick=${() => panelStore.set({ basket: true })}><${Icon} name="basket" /><span class="btn-basket-l">${t('basket.title')}</span>${items.length ? html`<span class="badge" aria-label=${t('basket.count', { n: items.length })}>${items.length}</span>` : null}</button>` : null}
    </div>
  </header>`;
}

function App() {
  const sgk = useData();
  const route = useRoute();
  const ui = useUiLang();
  useLibrary();
  const mod = MODULES.find((m) => m.views.some((v) => v.id === route.view)) || MODULES[0];
  const view = mod.views.find((v) => v.id === route.view) || mod.views[0];
  const wid = validWork(route.w);
  const data = sgk && mod.id === 'sgk' ? workData(wid) : sgk;
  useEffect(() => { document.title = `${t(view.labelKey)}${mod.id === 'sgk' && wid !== 'sgk' ? ' ' + workShort(workById(wid), uiLang()) : ''} | SGK-Navigator`; }, [view.id, ui, wid]);
  lastView[mod.id] = view.id === 'druck' ? lastView[mod.id] : view.id;
  // Sammelkorb schliesst beim Modulwechsel
  useEffect(() => { if (mod.id !== 'sgk' && panelStore.get().basket) panelStore.set({ basket: false }); }, [mod.id]);
  if (!data) return html`<p class="loading">${t('common.loading')}</p>`;
  const V = view.component;
  return html`<div class=${'app mod-' + mod.id} data-ui=${ui}>
    <${ModBar} mod=${mod} data=${sgk} />
    <${Header} route=${route} mod=${mod} />
    ${data.meta.fixtures && mod.id === 'sgk' ? html`<div class="fixture-bar" role="note">${t('app.fixtures')}</div>` : null}
    ${mod.Bar ? html`<${mod.Bar} route=${route} />` : null}
    <${UpdateNotice} />
    <${V} data=${data} route=${route} key=${mod.id + '|' + (mod.id === 'sgk' ? wid : '')} />
    <${Basket} data=${sgk} />
    ${mod.Host ? html`<${mod.Host} />` : null}
    <${Toasts} />
  </div>`;
}

async function boot() {
  const root = document.getElementById('app');
  normalizeHash();
  render(html`<${App} />`, root);
  try {
    const bundle = loadEmbedded();
    if (!bundle.dataset) throw new Error(t('app.noDataset'));
    setLibraryMeta(bundle.meta);
    setAcknowledged(bundle.meta.acknowledged);
    setLibraryContext({ worksIndex: works(), derogations: () => sgkExtras().derogations, formOf: formFor });
    const sgkBundle = { ...bundle, work: workById('sgk') };
    setBase(sgkBundle);
    dataStore.set(new Data(sgkBundle));
    await loadPersisted();
    await applyStoredUploads();
    for (const m of MODULES) if (m.init) await m.init();
    // Suche nach neuer Version: nach dem ersten Rendern, nicht blockierend (src/app/ui/updatenotice.js)
    initUpdate(bundle.meta).catch((e) => console.warn('Versionssuche', e));
    window.__sgk = { ready: true, data: () => dataStore.get(), work: (id) => workData(id), dataFor, i18n: { t, uiLang, keysOf }, neg: negModule.api };
  } catch (e) {
    console.error(e);
    root.innerHTML = '';
    const p = document.createElement('div');
    p.className = 'fatal';
    p.textContent = t('app.loadFailed', { msg: e.message });
    root.appendChild(p);
  }
}
boot();
