// Aktualisieren: alle Rechtsakte auf einmal prüfen und Dateien gemeinsam ablegen; je Werk prüfen (SPARQL per JSONP),
// Upload, Projektdatei.
import { html } from 'htm/preact';
import { useRef, useState } from 'preact/hooks';
import { Icon, Notice, HelpLink } from '../../ui/common.js';
import { checkUpdates, eurlexHtml } from '../../lib/sparql.js';
import { fmtDate, fmtTime, localIso } from '../../lib/format.js';
import { kindLabel } from '../../data.js';
import { uploadsStore, dataStore, toast } from '../../app.js';
import { works, workData, workById, workAbbr, useLibrary } from '../../library.js';
import { statusOf, rowsForWork, needsAttention, isPartial, countAttention } from './updatelogic.js';
import { handleFiles, removeUpload, exportProject, importProject } from '../../uploads.js';
import { createStore } from '../../state.js';
import { t, uiLang } from '../../lib/i18n.js';

// Ergebnisse der Prüfung je Werk ({ [workId]: { checked, consolidated, acts } }); Einzel- und gemeinsame Prüfung teilen sie.
const resultStore = createStore({});
// Gemeinsame Prüfung: Ablauf und Fehler je Werk
const allStore = createStore({ running: false, done: 0, total: 0, started: null, finished: null, errors: {}, works: [] });
const uploadsOf = (list, w) => list.filter((u) => (u.work || 'sgk') === w);

function LangLinks({ celex, langs, info }) {
  return html`<span class="links">${langs.map((l) => html`<a href=${eurlexHtml(celex, l)} target="_blank" rel="noopener noreferrer" title=${t(info ? 'update.openEurlexInfo' : 'update.openEurlex', { lang: t('lang.name.' + l) })} aria-label=${t(info ? 'update.openEurlexInfo' : 'update.openEurlex', { lang: t('lang.name.' + l) }) + ': ' + celex}>${l.toUpperCase()}<${Icon} name="external" /></a>`)}</span>`;
}

// ------------------------------------------------------------------ Alle Rechtsakte auf einmal
/** Prüft alle Werke der Bibliothek; Fortschritt und Fehler je Werk in allStore, Ergebnisse in resultStore. */
export async function checkAll() {
  if (allStore.get().running) return;
  const list = works();
  allStore.set({ running: true, done: 0, total: list.length, started: new Date().toISOString(), finished: null, errors: {}, works: list.map((w) => w.id) });
  await Promise.all(list.map(async (w) => {
    try {
      const r = await checkUpdates(w.celex);
      resultStore.set((m) => ({ ...m, [w.id]: { ...r, work: w.id } }));
    } catch (e) {
      resultStore.set((m) => { const n = { ...m }; delete n[w.id]; return n; });
      allStore.set((st) => ({ ...st, errors: { ...st.errors, [w.id]: e.message || String(e) } }));
    } finally {
      allStore.set((st) => ({ ...st, done: st.done + 1 }));
    }
  }));
  allStore.set((st) => ({ ...st, running: false, finished: new Date().toISOString() }));
}

function tagClass(st) {
  if (!st.known) return 'tag-new';
  if (isPartial(st)) return 'tag-partly';
  return st.irrelevant || st.unlisted ? 'tag-src' : 'tag-ok';
}

function AllRows({ w, res, err, running, showAll, uploads }) {
  const label = workAbbr(w, uiLang());
  const head = html`<td class="nw all-work">${label}</td>`;
  if (err) return html`<tr class="is-error" data-work=${w.id}>${head}<td colspan="5"><span class="tag tag-err">${t('update.check.failed')}</span> ${err}</td></tr>`;
  if (!res) return html`<tr data-work=${w.id}>${head}<td colspan="5" class="muted">${running ? t('update.all.pending') : t('update.check.notYet')}</td></tr>`;
  const data = workData(w.id);
  const rows = rowsForWork(res, data, uploads).filter((r) => showAll || needsAttention(r.st));
  if (!rows.length) return html`<tr class="is-none" data-work=${w.id}>${head}<td colspan="5" class="muted">${t('update.all.none')}</td></tr>`;
  return rows.map((r) => html`<tr class=${needsAttention(r.st) ? 'is-new' : (r.st.irrelevant || r.st.unlisted ? 'is-irrelevant' : '')} data-work=${w.id} data-celex=${r.celex}>
    ${head}
    <td>${kindLabel(r.kind)}${r.type === 'act' && r.item.langs3 ? html`<br /><span class="muted">${r.item.langs3.join(', ')}</span>` : null}</td>
    <td class="mono nw">${r.celex}</td>
    <td class="nw">${fmtDate(r.date)}</td>
    <td><span class=${'tag ' + tagClass(r.st)}>${r.st.label}</span></td>
    <td>${r.type === 'cons'
      ? (r.langs.length ? html`<${LangLinks} celex=${r.celex} langs=${r.langs} />` : r.st.irrelevant ? null : html`<span class="muted">${t('update.all.complete')}</span>`)
      : html`<${LangLinks} celex=${r.celex} langs=${r.langs} info=${true} />`}</td>
  </tr>`);
}

function AllSection() {
  const st = allStore.use();
  const results = resultStore.use();
  const uploads = uploadsStore.use();
  useLibrary(); dataStore.use(); // nach einem Upload neu berechnen
  const [showAll, setShowAll] = useState(false);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const inp = useRef();
  const list = works();
  const shown = st.works.length ? st.works.map((id) => workById(id)).filter(Boolean) : [];
  let attention = 0;
  if (!st.running && st.finished) {
    for (const w of shown) {
      const res = results[w.id];
      if (!res || st.errors[w.id]) continue;
      const n = countAttention(rowsForWork(res, workData(w.id), uploadsOf(uploads, w.id)));
      attention += n;
    }
  }
  const nErr = Object.keys(st.errors).length;
  const names = list.map((w) => workAbbr(w, uiLang()));
  const run = async (files) => {
    if (!files || !files.length) return;
    setBusy(true);
    try { const r = await handleFiles([...files], null); setLog((prev) => [...r, ...prev].slice(0, 20)); }
    finally { setBusy(false); }
  };
  const pct = st.total ? Math.round((st.done / st.total) * 100) : 0;
  return html`<section class="up-sec up-all" aria-labelledby="all-h">
    <div class="sec-head"><h2 id="all-h">${t('update.all.title')}</h2>
      <p class="sec-note">${t('update.all.note', { list: names.join(', ') })}</p>
    </div>
    <div class="row-tools">
      <button type="button" class="btn btn-primary" onClick=${checkAll} disabled=${st.running} id="btn-check-all"><${Icon} name="refresh" />${st.running ? t('update.check.busy') : t('update.all.button')}</button>
      ${st.works.length ? html`<label class="check"><input type="checkbox" id="all-show" checked=${showAll} onChange=${(e) => setShowAll(e.target.checked)} />${t('update.all.showAll')}</label>` : null}
    </div>
    <p class="muted all-progress" id="all-progress" role="status" aria-live="polite">${st.running
      ? t('update.all.progress', { done: st.done, total: st.total })
      : st.finished
        ? [t('update.check.result', { date: fmtDate(localIso(new Date(st.finished))), time: fmtTime(new Date(st.finished)) }), ' ',
          t('update.all.progress', { done: st.done - nErr, total: st.total }), ', ',
          attention ? t('update.check.newCount', { n: attention }) : t('update.check.nothing'),
          nErr ? ', ' + t('update.all.failedN', { n: nErr }) : '', '.'].join('')
        : t('update.check.notYet')}</p>
    ${st.running ? html`<div class="all-bar" aria-hidden="true"><span style=${'width:' + pct + '%'}></span></div>` : null}
    ${shown.length ? html`
      <div class="tbl-scroll"><table class="tbl-data" id="tbl-all">
        <caption class="sr">${t('update.all.caption')}</caption>
        <thead><tr><th scope="col">${t('update.col.work')}</th><th scope="col">${t('update.col.kind')}</th><th scope="col">CELEX</th><th scope="col">${t('common.date')}</th><th scope="col">${t('common.status')}</th><th scope="col">${t('update.col.download')}</th></tr></thead>
        <tbody>${shown.map((w) => html`<${AllRows} w=${w} res=${results[w.id]} err=${st.errors[w.id]} running=${st.running} showAll=${showAll} uploads=${uploadsOf(uploads, w.id)} />`)}</tbody>
      </table></div>
      <p class="muted small">${t('update.all.actsNote')}</p>` : null}
    <h3 class="sub-h" id="all-load-h">${t('update.all.loadTitle')}</h3>
    <p class="all-how" id="all-how">${t('update.all.how')}</p>
    <div class=${'drop' + (over ? ' is-over' : '') + (busy ? ' is-busy' : '')} id="dropzone-all" aria-describedby="all-how"
      onDragOver=${(e) => { e.preventDefault(); setOver(true); }} onDragLeave=${() => setOver(false)}
      onDrop=${(e) => { e.preventDefault(); setOver(false); run(e.dataTransfer.files); }}>
      <${Icon} name="upload" />
      <p><b>${busy ? t('update.upload.busy') : t('update.all.drop')}</b></p>
      <p><button type="button" class="btn btn-secondary" onClick=${() => inp.current.click()}><${Icon} name="file" />${t('update.all.choose')}</button></p>
      <p class="muted small">${t('update.all.which', { list: names.join(', ') })}</p>
      <input ref=${inp} type="file" accept=".html,.htm,.xhtml,text/html,application/xhtml+xml" multiple class="sr" id="file-input-all" aria-label=${t('update.all.choose')} onChange=${(e) => { run(e.target.files); e.target.value = ''; }} />
    </div>
    ${log.length ? html`<ul class="up-log" id="all-log" aria-live="polite">${log.map((l) => html`<li class=${l.ok ? 'ok' : l.duplicate ? 'dup' : 'err'} data-work=${l.work || ''}><${Icon} name=${l.ok ? 'check-circle' : 'warning'} /><span><b>${l.name}</b>: ${!l.ok && l.work ? workAbbr(workById(l.work), uiLang()) + ': ' : ''}${l.msg}</span></li>`)}</ul>` : null}
  </section>`;
}

function Check({ data }) {
  const res = resultStore.use()[data.workId] || null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [onlyNew, setOnlyNew] = useState(false);
  const run = async () => {
    setBusy(true); setErr(null);
    try { const r = await checkUpdates(data.work.celex); resultStore.set((m) => ({ ...m, [data.workId]: { ...r, work: data.workId } })); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const uploads = uploadsStore.use().filter((u) => (u.work || 'sgk') === data.workId);
  const cons = res ? res.consolidated.map((c) => ({ ...c, st: statusOf(data, c, 'cons', uploads) })).sort((x, y) => (y.date || '').localeCompare(x.date || '')) : [];
  const acts = res ? res.acts.map((c) => ({ ...c, st: statusOf(data, c, 'act', uploads) })).sort((x, y) => (y.date || '').localeCompare(x.date || '')) : [];
  const newCount = cons.filter((c) => !c.st.known || (c.st.missing && c.st.missing.length)).length + acts.filter((c) => !c.st.known).length;
  return html`<section class="up-sec" aria-labelledby="chk-h">
    <div class="sec-head"><h2 id="chk-h">${t('update.check.titleWork', { work: workAbbr(data.wk || workById(data.workId), uiLang()) })}</h2>
      <p class="sec-note">${t('update.check.note')}</p>
    </div>
    <div class="row-tools">
      <button type="button" class="btn btn-primary" onClick=${run} disabled=${busy} id="btn-check"><${Icon} name="refresh" />${busy ? t('update.check.busy') : t('update.check.button')}</button>
      ${res ? html`<span class="muted" id="chk-result" aria-live="polite">${t('update.check.result', { date: fmtDate(localIso(new Date(res.checked))), time: fmtTime(new Date(res.checked)) })} ${newCount ? t('update.check.newCount', { n: newCount }) : t('update.check.nothing')}</span>` : null}
      ${res ? html`<label class="check"><input type="checkbox" checked=${onlyNew} onChange=${(e) => setOnlyNew(e.target.checked)} />${t('update.check.onlyNew')}</label>` : null}
    </div>
    ${err ? html`<${Notice} kind="error" title=${t('update.check.failed')}>${err}</${Notice}>` : null}
    ${res ? html`
      <h3 class="sub-h">${t('update.cons.title')}</h3>
      <div class="tbl-scroll"><table class="tbl-data" id="tbl-cons"><thead><tr><th>CELEX</th><th>${t('common.date')}</th><th>${t('common.status')}</th><th>${t('update.col.html')}</th></tr></thead>
        <tbody>${cons.filter((c) => !onlyNew || !c.st.known || c.st.missing.length).map((c) => html`<tr class=${c.st.known && !c.st.missing.length ? (c.st.irrelevant ? 'is-irrelevant' : '') : 'is-new'}>
          <td class="mono nw">${c.celex}</td><td class="nw">${fmtDate(c.date)}</td>
          <td><span class=${'tag ' + (c.st.known && !c.st.missing.length ? (c.st.irrelevant ? 'tag-src' : 'tag-ok') : 'tag-new')}>${c.st.label}</span></td>
          <td><${LangLinks} celex=${c.celex} langs=${c.st.missing || data.langs} /></td></tr>`)}</tbody></table></div>
      <h3 class="sub-h">${t('update.acts.title', { celex: data.work.celex })}</h3>
      <div class="tbl-scroll"><table class="tbl-data" id="tbl-acts"><thead><tr><th>CELEX</th><th>${t('update.col.kind')}</th><th>${t('common.date')}</th><th>${t('update.col.title')}</th><th>${t('common.status')}</th><th>${t('update.col.html')}</th></tr></thead>
        <tbody>${acts.filter((c) => !onlyNew || !c.st.known).map((c) => {
          const known = data.act(c.celex);
          const title = (known && known.title && data.loc(known.title)) || (uiLang() === 'fr' && c.titleFr) || c.title || '';
          return html`<tr class=${c.st.known ? (c.st.irrelevant || c.st.unlisted ? 'is-irrelevant' : '') : 'is-new'}>
          <td class="mono nw">${c.celex}</td><td>${kindLabel(c.kind)}${c.langs3 ? html`<br /><span class="muted">${c.langs3.join(', ')}</span>` : null}</td><td class="nw">${fmtDate(c.date)}</td>
          <td class="t-title"><span class="clamp3" title=${title}>${title}</span></td>
          <td><span class=${'tag ' + (c.st.known ? (c.st.irrelevant || c.st.unlisted ? 'tag-src' : 'tag-ok') : 'tag-new')}>${c.st.label}</span></td>
          <td><${LangLinks} celex=${c.celex} langs=${c.langs ? c.langs.filter((l) => data.langs.includes(l)) : data.langs} /></td></tr>`;
        })}</tbody></table></div>
      <p class="muted small">${t('update.acts.note')}</p>
    ` : html`<p class="muted">${t('update.check.notYet')}</p>`}
  </section>`;
}

function Upload({ data }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const inp = useRef();
  const uploads = uploadsStore.use().filter((u) => (u.work || 'sgk') === data.workId);
  const run = async (files) => {
    if (!files || !files.length) return;
    setBusy(true);
    try { const r = await handleFiles([...files], data.workId); setLog((prev) => [...r, ...prev].slice(0, 12)); }
    finally { setBusy(false); }
  };
  return html`<section class="up-sec" aria-labelledby="up-h">
    <div class="sec-head"><h2 id="up-h">${t('update.upload.title')}</h2>
      <p class="sec-note">${t('update.upload.note')}</p>
    </div>
    <div class=${'drop' + (over ? ' is-over' : '') + (busy ? ' is-busy' : '')} id="dropzone"
      onDragOver=${(e) => { e.preventDefault(); setOver(true); }} onDragLeave=${() => setOver(false)}
      onDrop=${(e) => { e.preventDefault(); setOver(false); run(e.dataTransfer.files); }}>
      <${Icon} name="upload" />
      <p><b>${busy ? t('update.upload.busy') : t('update.upload.drop')}</b></p>
      <p><button type="button" class="btn btn-secondary" onClick=${() => inp.current.click()}><${Icon} name="file" />${t('update.upload.choose')}</button></p>
      <p class="muted small">${t('update.upload.which', { prefix: '0' + data.work.celex.slice(1) })}. ${t('update.upload.whichAuto')}</p>
      <input ref=${inp} type="file" accept=".html,.htm,text/html" multiple class="sr" id="file-input" onChange=${(e) => { run(e.target.files); e.target.value = ''; }} />
    </div>
    ${log.length ? html`<ul class="up-log" aria-live="polite">${log.map((l) => html`<li class=${l.ok ? 'ok' : l.duplicate ? 'dup' : 'err'}><${Icon} name=${l.ok ? 'check-circle' : 'warning'} /><span><b>${l.name}</b>: ${!l.ok && l.moved ? workAbbr(workById(l.work), uiLang()) + ': ' : ''}${l.msg}</span></li>`)}</ul>` : null}
    <h3 class="sub-h">${t('update.upload.list')}</h3>
    ${uploads.length ? html`<div class="tbl-scroll"><table class="tbl-data" id="tbl-uploads"><thead><tr><th>CELEX</th><th>${t('update.col.lang')}</th><th>${t('common.date')}</th><th>${t('update.col.file')}</th><th>${t('update.col.added')}</th><th><span class="sr">${t('update.col.actions')}</span></th></tr></thead><tbody>
      ${uploads.map((u) => html`<tr><td class="mono nw">${u.celex}</td><td>${u.lang.toUpperCase()}</td><td class="nw">${fmtDate(u.date)}</td><td>${u.name}</td><td class="nw">${fmtDate(localIso(new Date(u.addedAt)))}</td>
        <td><button type="button" class="btn btn-danger-ghost is-bare btn-sm" onClick=${async () => { await removeUpload(u.id); toast(t('update.upload.removed', { celex: u.celex, lang: u.lang.toUpperCase() }), 'info'); }}><${Icon} name="trash" />${t('update.upload.remove')}</button></td></tr>`)}
    </tbody></table></div>` : html`<p class="muted">${t('update.upload.none')}</p>`}
  </section>`;
}

function Project() {
  const inp = useRef();
  const [msg, setMsg] = useState(null);
  return html`<section class="up-sec" aria-labelledby="pj-h">
    <div class="sec-head"><h2 id="pj-h">${t('project.title')}</h2>
      <p class="sec-note">${t('project.note')}</p></div>
    <div class="row-tools">
      <button type="button" class="btn btn-secondary" id="btn-export-project" onClick=${async () => { await exportProject(); setMsg({ ok: true, t: t('project.exported') }); }}><${Icon} name="download" />${t('project.export')}</button>
      <button type="button" class="btn btn-tertiary" onClick=${() => inp.current.click()}><${Icon} name="upload" />${t('project.import')}</button>
      <input ref=${inp} type="file" accept=".json,application/json" class="sr" id="project-input" onChange=${async (e) => {
        const f = e.target.files[0]; e.target.value = '';
        if (!f) return;
        try { const r = await importProject(f); setMsg({ ok: true, t: t('project.imported', { what: [t('project.nVersions', { n: r.uploads }), t('project.nCards', { n: r.cards }), r.included ? t('project.nIncluded', { n: r.included }) : null].filter(Boolean).join(', ') }) }); }
        catch (err) { setMsg({ ok: false, t: err.message }); }
      }} />
    </div>
    ${msg ? html`<${Notice} kind=${msg.ok ? 'success' : 'error'}>${msg.t}</${Notice}>` : null}
  </section>`;
}

export function UpdateView({ data }) {
  return html`<div class="view view-update"><main class="wide narrow" id="main" tabindex="-1">
    <header class="unit-head page-head"><p class="unit-label">${t('nav.aktualisieren')}</p><h1 class="unit-title">${t('update.title')}: ${data.work.short ? data.work.short[uiLang()] || data.work.short.de : data.work.celex}</h1><${HelpLink} sec="aktualisieren" /></header>
    <${AllSection} />
    <${Check} data=${data} />
    <${Upload} data=${data} />
    <${Project} />
  </main></div>`;
}
