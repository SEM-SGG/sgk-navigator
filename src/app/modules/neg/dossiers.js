// Dossiers: Liste, anlegen, Projektdatei importieren/exportieren, Beispiel-Dossier, löschen.
import { html } from 'htm/preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { t, has } from '../../lib/i18n.js';
import { go } from '../../state.js';
import { Icon, HelpLink, Notice } from '../../ui/common.js';
import { toast } from '../../app.js';
import { fmtDate } from '../../lib/format.js';
import { listStore, loadList, addDossier, deleteDossier, loadDemo, readDossier, readProjectFile, exportProjectFile, openDossier, dossierStore } from './store.js';
import { newDossier, hasEmbeddedDemo, demoList } from './core.js';
import { ClassTag, confirmDialog, PageHead, Modal } from './ui.js';

export function DossiersView({ route }) {
  const list = listStore.use();
  const cur = dossierStore.use();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();
  useEffect(() => { if (!list.loaded) loadList(); }, []);
  const items = list.items.slice().sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
  const open = (it) => go({ view: it.docs ? 'synopse' : 'import', ds: it.id, r: null, nq: null, nfc: null, nfs: null, nfp: null, nfh: null, nfr: null, nfo: null, nv: null, nh: null, nk: null });
  const create = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    const d = newDossier({ title: form.title.trim(), short: form.short.trim(), procedure: form.procedure.trim() });
    addDossier(d).then(() => { setForm(null); toast(t('neg.dossiers.created'), 'success', 3000); go({ view: 'import', ds: d.id, r: null }); });
  };
  const [picker, setPicker] = useState(false);
  const demo = async (key) => {
    const ex = list.items.find((x) => x.demo && (x.demoKey || 'demo') === key);
    if (ex && !(await confirmDialog({ title: t('neg.dossiers.demoAgainTitle'), text: t('neg.dossiers.demoAgainText'), ok: t('neg.dossiers.demoAgainOk') }))) return;
    setPicker(false);
    setBusy(true);
    try {
      if (ex) await deleteDossier(ex.id);
      const d = await loadDemo(key);
      toast(t('neg.dossiers.demoLoaded'), 'success', 2500);
      go({ view: 'synopse', ds: d.id, r: null });
    } catch (e) { toast(t('neg.dossiers.demoFailed', { msg: e.message }), 'error'); }
    finally { setBusy(false); }
  };
  const importFile = async (file) => {
    setBusy(true);
    try {
      const { dossier, warnings } = await readProjectFile(file);
      const exists = list.items.find((x) => x.id === dossier.id);
      if (exists) {
        const ok = await confirmDialog({ title: t('neg.dossiers.overwriteTitle'), text: t('neg.dossiers.overwriteText', { title: exists.short || exists.title, date: fmtDate((exists.updated || '').slice(0, 10)), newDate: fmtDate((dossier.updated || '').slice(0, 10)) }), ok: t('neg.dossiers.overwriteOk'), danger: true });
        if (!ok) return;
        if (cur && cur.id === dossier.id) dossierStore.set(null);
      }
      await addDossier(dossier);
      toast(t('neg.dossiers.imported', { title: dossier.short || dossier.title }) + (warnings && warnings.length ? ' ' + t('neg.dossiers.importWarn', { n: warnings.length }) : ''), warnings && warnings.length ? 'warning' : 'success', 5000);
      go({ view: 'synopse', ds: dossier.id, r: null });
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  const exportOne = async (it) => {
    const d = cur && cur.id === it.id ? cur : await readDossier(it.id).catch(() => null);
    if (d) exportProjectFile(d); else toast(t('neg.dossiers.notFound'), 'error');
  };
  const remove = async (it) => {
    const ok = await confirmDialog({ title: t('neg.dossiers.deleteTitle'), text: t(it.demo ? 'neg.dossiers.deleteDemoText' : 'neg.dossiers.deleteText', { title: it.short || it.title }), ok: t('neg.dossiers.deleteOk'), danger: true });
    if (!ok) return;
    await deleteDossier(it.id);
    toast(t('neg.dossiers.deleted'), 'success', 3000);
    if (route.ds === it.id) go({ ds: null, r: null }, { replace: true });
  };
  return html`<div class="view"><main class="wide" id="main" tabindex="-1">
    <${PageHead} kicker=${t('neg.module')} title=${t('neg.nav.dossiers')} help=${html`<${HelpLink} view="n-anleitung" sec="dossier" />`}>
      <p class="ov-lead">${t('neg.dossiers.lead')}</p>
    </${PageHead}>
    <div class="notice notice-info nconf" role="note"><${Icon} name="lock" /><div><strong>${t('neg.conf.title')}</strong> ${t('neg.conf.text')}</div></div>
    ${!list.dbOk ? html`<div class="nconf"><${Notice} kind="warning" title=${t('neg.dossiers.noDbTitle')}>${t('neg.dossiers.noDbText')}</${Notice}></div>` : null}

    <div class="toolbar nd-toolbar">
      <button type="button" class="btn btn-primary" id="btn-new-dossier" onClick=${() => setForm({ title: '', short: '', procedure: '' })} aria-expanded=${form ? 'true' : 'false'}><${Icon} name="plus" />${t('neg.dossiers.new')}</button>
      <button type="button" class="btn btn-tertiary" disabled=${busy} title=${t('neg.project.importTip')} onClick=${() => fileRef.current.click()}><${Icon} name="upload" />${t('neg.project.import')}</button>
      <input type="file" class="sr" id="neg-project-file" accept=".json,application/json" ref=${fileRef} onChange=${(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); }} />
      ${hasEmbeddedDemo() ? html`<button type="button" class="btn btn-tertiary" id="btn-demo" disabled=${busy} onClick=${() => setPicker(true)}><${Icon} name="book" />${t('neg.dossiers.demo')}</button>` : null}
    </div>

    ${form ? html`<form class="nnew" onSubmit=${create} aria-labelledby="nnew-h">
      <h2 class="nd-h" id="nnew-h">${t('neg.dossiers.newTitle')}</h2>
      <div class="nform-row">
        <label class="field nform-grow"><span class="field-label">${t('neg.dossiers.fTitle')}</span><input type="text" id="nd-title-in" required value=${form.title} onInput=${(e) => setForm({ ...form, title: e.target.value })} placeholder=${t('neg.dossiers.fTitlePh')} autofocus /></label>
      </div>
      <div class="nform-row">
        <label class="field"><span class="field-label">${t('neg.dossiers.fShort')}</span><input type="text" id="nd-short-in" value=${form.short} onInput=${(e) => setForm({ ...form, short: e.target.value })} placeholder=${t('neg.dossiers.fShortPh')} /></label>
        <label class="field"><span class="field-label">${t('neg.dossiers.fProc')}</span><input type="text" id="nd-proc-in" value=${form.procedure} onInput=${(e) => setForm({ ...form, procedure: e.target.value })} placeholder="2024/0670(COD)" /></label>
      </div>
      <div class="nform-actions"><button type="submit" class="btn btn-primary" disabled=${!form.title.trim()}><${Icon} name="check" />${t('neg.dossiers.create')}</button><button type="button" class="btn btn-tertiary" onClick=${() => setForm(null)}>${t('neg.common.cancel')}</button></div>
    </form>` : null}

    ${!list.loaded ? html`<p class="muted">${t('common.loading')}</p>` : items.length === 0 ? html`<div class="neg-empty nlist-empty">
      <h2 class="neg-empty-title">${t('neg.dossiers.emptyTitle')}</h2>
      <p>${t('neg.dossiers.emptyText')}</p>
    </div>` : html`<div class="tbl-scroll"><table class="tbl-data nlist">
      <thead><tr><th>${t('neg.dossiers.colTitle')}</th><th>${t('neg.dossiers.colProc')}</th><th class="num">${t('neg.dossiers.colDocs')}</th><th class="num">${t('neg.dossiers.colRows')}</th><th class="num">${t('neg.dossiers.colPos')}</th><th>${t('neg.dossiers.colClass')}</th><th>${t('neg.dossiers.colUpdated')}</th><th><span class="sr">${t('neg.dossiers.colActions')}</span></th></tr></thead>
      <tbody>${items.map((it) => html`<tr class=${cur && cur.id === it.id ? 'is-current' : ''}>
        <td><a href=${'#/synopse?ds=' + it.id} class="nlist-title uc" onClick=${(e) => { e.preventDefault(); open(it); }}>${it.short || it.title}</a>
          ${it.short && it.title ? html`<span class="nlist-sub uc">${it.title}</span>` : null}
          ${it.demo ? html`<span class="tag tag-demo">${t('neg.demo.tagLong')}</span>` : null}</td>
        <td class="nw">${it.procedure || '–'}</td>
        <td class="num">${it.docs}</td><td class="num">${it.rows}</td><td class="num">${it.positions}</td>
        <td><${ClassTag} c=${it.classification} /></td>
        <td class="nw">${it.updated ? fmtDate(it.updated.slice(0, 10)) : ''}</td>
        <td class="nlist-act">
          <button type="button" class="btn btn-secondary btn-sm" onClick=${() => open(it)}>${t('neg.dossiers.open')}</button>
          <button type="button" class="btn-icon" title=${t('neg.merge.of', { title: it.short || it.title })} aria-label=${t('neg.merge.of', { title: it.short || it.title })} onClick=${() => go({ view: 'zusammenfuehren', ds: it.id, r: null })}><${Icon} name="merge" /></button>
          <button type="button" class="btn-icon" title=${t('neg.project.exportOf', { title: it.short || it.title })} aria-label=${t('neg.project.exportOf', { title: it.short || it.title })} onClick=${() => exportOne(it)}><${Icon} name="save" /></button>
          <button type="button" class="btn-icon is-bare btn-danger-ghost" title=${t('neg.dossiers.deleteOf', { title: it.short || it.title })} aria-label=${t('neg.dossiers.deleteOf', { title: it.short || it.title })} onClick=${() => remove(it)}><${Icon} name="trash" /></button>
        </td>
      </tr>`)}</tbody>
    </table></div>`}
    ${list.items.length ? html`<p class="small muted ndemo-note">${t('neg.project.importVsMerge')}</p>` : null}
    ${hasEmbeddedDemo() ? html`<p class="small muted ndemo-note">${t('neg.dossiers.demoNote')}</p>` : null}
    ${picker ? html`<${Modal} title=${t('neg.dossiers.demoTitle')} id="ndemo" onClose=${() => setPicker(false)} foot=${html`<button type="button" class="btn btn-tertiary" onClick=${() => setPicker(false)}>${t('neg.common.cancel')}</button>`}>
      <p class="modal-text">${t('neg.dossiers.demoIntro')}</p>
      <ul class="ndemo-list">${demoList().map((x) => html`<li class="ndemo-item">
        <div class="ndemo-text"><b class="uc">${x.title}</b>${x.procedure ? html` <span class="muted">${x.procedure}</span>` : null}
          <p class="small">${has('neg.demo.desc.' + x.key.replace(/-/g, '_')) ? t('neg.demo.desc.' + x.key.replace(/-/g, '_')) : ''} ${t('neg.demo.facts', { docs: x.docs, rows: x.rows, from: x.from ? fmtDate(x.from) : '–', to: x.to ? fmtDate(x.to) : '–' })}</p></div>
        <button type="button" class="btn btn-secondary btn-sm" id=${'demo-load-' + x.key} disabled=${busy} onClick=${() => demo(x.key)}>${t('neg.dossiers.demoLoad')}</button>
      </li>`)}</ul>
      <p class="small muted">${t('neg.dossiers.demoNote')}</p>
    </${Modal}>` : null}
  </main></div>`;
}
export { openDossier };
