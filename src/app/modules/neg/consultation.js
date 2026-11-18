// Ämterkonsultation: Runde anlegen, Word-Dokument exportieren (neutral oder je Stelle), Leseversion drucken,
// Rückmeldungen einlesen (mehrere Dateien), nicht Zuordenbares zuordnen, aggregierte Sicht mit Entscheiden, in Position übernehmen.
import { html } from 'htm/preact';
import { useMemo, useState } from 'preact/hooks';
import { t, uiLang } from '../../lib/i18n.js';
import { go } from '../../state.js';
import { Icon, HelpLink, Notice, Seg, Menu } from '../../ui/common.js';
import { toast } from '../../app.js';
import { fmtDate, todayIso } from '../../lib/format.js';
import {
  DECISIONS, sortedRows, docsOfTrack, addConsultation, buildConsultationDocx, parseConsultationDocx, importResponse, aggregateConsultation,
  setDecision, updateConsultation, deleteConsultation, removeResponse, assignUnmatched, setResponseOffice, applyToPosition, hasPosition, visibleRowId, cellFor, sanitizeInline, sha256, docMap,
} from './core.js';
import { mutate, selStore } from './store.js';
import { ByTag } from './by.js';
import { useDossier, NoDossier, PageHead, DropZone, DecisionTag, StanceTag, PriorityTag, trackName, docLabel, confirmDialog, fmtDateTime, Modal } from './ui.js';
import { filtersOf, filterRows, activeFilterCount } from './rows.js';
import { download } from './store.js';

export function ConsultationView({ route }) {
  const d = useDossier(route);
  if (!d) return html`<${NoDossier} route=${route} />`;
  return html`<${Consultations} d=${d} route=${route} />`;
}

const fileSafe = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

function Consultations({ d, route }) {
  const [creating, setCreating] = useState(false);
  const list = d.consultations || [];
  const k = list.find((x) => x.id === route.nk) || (route.nk ? null : list[list.length - 1]) || null;
  const tab = route.nkt === 'agg' ? 'agg' : 'round';
  return html`<div class="view"><main class="wide" id="main" tabindex="-1">
    <${PageHead} compact kicker=${d.short || d.title} title=${t('neg.nav.konsultation')} help=${html`<${HelpLink} view="n-anleitung" sec="konsultation" />`}>
      <p class="nhead-lead">${t('neg.cons.lead')}</p>
    </${PageHead}>
    ${list.length ? html`<div class="toolbar nd-toolbar">
      <label class="field"><span class="field-label">${t('neg.cons.round')}</span><select id="cons-round" value=${k ? k.id : ''} onChange=${(e) => go({ nk: e.target.value, nkt: null, nkf: null }, { replace: true })}>${list.map((x) => html`<option value=${x.id}>${x.title}${x.closed ? ' (' + t('neg.cons.closedShort') + ')' : ''}</option>`)}</select></label>
      ${k ? html`<${Seg} label=${t('neg.cons.tabs')} value=${tab} onChange=${(v) => go({ nkt: v === 'agg' ? 'agg' : null, nk: k.id }, { replace: true })} options=${[{ value: 'round', label: t('neg.cons.tabRound') }, { value: 'agg', label: t('neg.cons.tabAgg') }]} />` : null}
      <span class="spacer"></span>
      <button type="button" class="btn btn-secondary" id="cons-new" onClick=${() => setCreating(true)}><${Icon} name="plus" />${t('neg.cons.new')}</button>
    </div>` : html`<div class="neg-empty"><h2 class="neg-empty-title">${t('neg.cons.emptyTitle')}</h2><p>${t('neg.cons.emptyText')}</p>
      <div class="neg-actions"><button type="button" class="btn btn-primary" id="cons-new" onClick=${() => setCreating(true)} disabled=${!d.documents.length}><${Icon} name="plus" />${t('neg.cons.new')}</button></div>
      ${!d.documents.length ? html`<p class="small muted">${t('neg.cons.needDoc')}</p>` : null}</div>`}
    ${creating ? html`<${NewRound} d=${d} route=${route} onClose=${() => setCreating(false)} />` : null}
    ${k && tab === 'round' ? html`<${Round} d=${d} k=${k} />` : null}
    ${k && tab === 'agg' ? html`<${Aggregate} d=${d} k=${k} route=${route} />` : null}
  </main></div>`;
}

// ------------------------------------------------------------------ Runde anlegen
function NewRound({ d, route, onClose }) {
  const sel = selStore.get();
  const all = sortedRows(d);
  const f = filtersOf(route);
  const filtered = activeFilterCount(f) ? filterRows(d, all, f) : null;
  const withPos = all.filter((r) => hasPosition(d.positions[r.id]));
  const selected = all.filter((r) => sel.has(r.id));
  const tracks = d.tracks.filter((x) => docsOfTrack(d, x.id).length);
  const defTrack = (tracks.find((x) => x.id === 'agreement') || tracks.find((x) => x.id === 'council') || tracks[0] || {}).id;
  const tdocs = (tr) => docsOfTrack(d, tr);
  const [m, setM] = useState(() => {
    const ds = tdocs(defTrack);
    return { title: t('neg.cons.defaultTitle', { n: (d.consultations || []).length + 1 }), track: defTrack, doc: (ds[ds.length - 1] || {}).id || '', compareTo: (ds[ds.length - 2] || {}).id || '', scope: selected.length ? 'selected' : filtered ? 'filtered' : 'all', deadline: '', lang: uiLang(), offices: [{ abbr: '', name: '' }] };
  });
  const set = (k) => (e) => setM({ ...m, [k]: e.target.value });
  const scopeRows = m.scope === 'filtered' && filtered ? filtered : m.scope === 'withPos' ? withPos : m.scope === 'selected' ? selected : all;
  const ds = tdocs(m.track);
  const offices = m.offices.filter((o) => o.abbr.trim() || o.name.trim());
  const ok = () => {
    let id;
    mutate((x) => {
      const r = addConsultation(x, { title: m.title.trim() || t('neg.cons.defaultTitle', { n: 1 }), deadline: m.deadline || null, lang: m.lang, basis: { track: m.track, doc: m.doc, compareTo: m.compareTo || null }, scope: m.scope === 'all' ? scopeRows.map((y) => y.id) : scopeRows.map((y) => y.id), offices: offices.map((o, i) => ({ id: `o${i + 1}`, abbr: o.abbr.trim() || o.name.trim().slice(0, 12), name: o.name.trim() || o.abbr.trim() })) });
      id = r.id; return r.dossier;
    }, t('neg.undo.newRound'));
    onClose();
    go({ nk: id, nkt: null }, { replace: true });
    toast(t('neg.cons.created'), 'success', 3000);
  };
  const setOff = (i, k, v) => setM({ ...m, offices: m.offices.map((o, j) => (j === i ? { ...o, [k]: v } : o)) });
  return html`<${Modal} title=${t('neg.cons.newTitle')} wide onClose=${onClose} id="nround" foot=${html`
    <button type="button" class="btn btn-primary" id="round-create" disabled=${!m.doc || !scopeRows.length} onClick=${ok}><${Icon} name="check" />${t('neg.cons.create')}</button>
    <button type="button" class="btn btn-tertiary" onClick=${onClose}>${t('neg.common.cancel')}</button>`}>
    <label class="field field-wide"><span class="field-label">${t('neg.cons.fTitle')}</span><input type="text" id="round-title" value=${m.title} onInput=${set('title')} /></label>
    <div class="nform-row">
      <label class="field"><span class="field-label">${t('neg.cons.basisTrack')}</span><select id="round-track" value=${m.track} onChange=${(e) => { const l = tdocs(e.target.value); setM({ ...m, track: e.target.value, doc: (l[l.length - 1] || {}).id || '', compareTo: (l[l.length - 2] || {}).id || '' }); }}>${tracks.map((x) => html`<option value=${x.id}>${trackName(d, x.id)}</option>`)}</select></label>
      <label class="field nform-grow"><span class="field-label">${t('neg.cons.basisDoc')}</span><select id="round-doc" value=${m.doc} onChange=${set('doc')}>${ds.map((x) => html`<option value=${x.id}>${docLabel(x)}</option>`)}</select></label>
    </div>
    <div class="nform-row">
      <label class="field nform-grow"><span class="field-label">${t('neg.cons.compareTo')}</span><select id="round-cmp" value=${m.compareTo} onChange=${set('compareTo')}><option value="">${t('neg.cons.noCompare')}</option>${ds.filter((x) => x.id !== m.doc).map((x) => html`<option value=${x.id}>${docLabel(x)}</option>`)}</select></label>
      <label class="field"><span class="field-label">${t('neg.cons.deadline')}</span><input type="date" id="round-deadline" value=${m.deadline} min=${todayIso()} onInput=${set('deadline')} /></label>
      <div class="field"><span class="field-label" id="lbl-rl">${t('neg.cons.lang')}</span><${Seg} labelledby="lbl-rl" value=${m.lang} onChange=${(v) => setM({ ...m, lang: v })} options=${[{ value: 'de', label: 'DE', title: t('lang.uiName.de') }, { value: 'fr', label: 'FR', title: t('lang.uiName.fr') }]} /></div>
    </div>
    <fieldset class="nfs"><legend class="field-label">${t('neg.cons.scope')}</legend>
      ${[['all', all.length], ['filtered', filtered ? filtered.length : null], ['withPos', withPos.length], ['selected', selected.length]].map(([k, n]) => html`<label class="check"><input type="radio" name="round-scope" value=${k} checked=${m.scope === k} disabled=${n == null || n === 0} onChange=${() => setM({ ...m, scope: k })} />${t('neg.cons.scopeOpt.' + k, { n: n || 0 })}</label>`)}
      ${!filtered ? html`<p class="small muted">${t('neg.cons.scopeFilterHint')}</p>` : null}
    </fieldset>
    <fieldset class="nfs"><legend class="field-label">${t('neg.cons.offices')}</legend>
      <div class="noff">${m.offices.map((o, i) => html`<div class="noff-row">
        <input type="text" aria-label=${t('neg.cons.officeAbbr')} placeholder=${t('neg.cons.officeAbbr')} class="noff-abbr" id=${'off-abbr-' + i} value=${o.abbr} onInput=${(e) => setOff(i, 'abbr', e.target.value)} />
        <input type="text" aria-label=${t('neg.cons.officeName')} placeholder=${t('neg.cons.officeName')} class="noff-name" id=${'off-name-' + i} value=${o.name} onInput=${(e) => setOff(i, 'name', e.target.value)} />
        <button type="button" class="btn-icon is-bare btn-danger-ghost" aria-label=${t('neg.cons.officeRemove')} title=${t('neg.cons.officeRemove')} disabled=${m.offices.length === 1} onClick=${() => setM({ ...m, offices: m.offices.filter((_, j) => j !== i) })}><${Icon} name="trash" /></button>
      </div>`)}</div>
      <button type="button" class="btn btn-tertiary btn-sm" id="off-add" onClick=${() => setM({ ...m, offices: [...m.offices, { abbr: '', name: '' }] })}><${Icon} name="plus" />${t('neg.cons.officeAdd')}</button>
    </fieldset>
  </${Modal}>`;
}

// ------------------------------------------------------------------ Runde
export function downloadDocx(bytes, name) { download(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), name); }

function Round({ d, k }) {
  const [pending, setPending] = useState([]); // [{ name, parsed, office, file }]
  const [busy, setBusy] = useState(false);
  const agg = useMemo(() => aggregateConsultation(d, k.id), [d, k.id]);
  const dm = docMap(d);
  const off = (id) => (k.offices || []).find((o) => o.id === id) || { abbr: '?', name: '?' };
  const exportWord = (office) => {
    try {
      const bytes = buildConsultationDocx(d, k.id, { office: office ? office.id : undefined, lang: k.lang });
      const date = todayIso();
      downloadDocx(bytes, `${t('neg.cons.fileName')}_${fileSafe(d.short || d.procedure || d.id)}_${fileSafe(k.title)}_${office ? fileSafe(office.abbr) : t('neg.cons.neutral')}_${date}.docx`);
      mutate((x) => updateConsultation(x, k.id, { exports: [...(x.consultations.find((y) => y.id === k.id).exports || []), { at: new Date().toISOString(), office: office ? office.id : null }] }), null);
      toast(t('neg.cons.exported'), 'success', 3000);
    } catch (e) { console.error(e); toast(t('neg.cons.exportFailed', { msg: e.message }), 'error'); }
  };
  const doImport = (items) => {
    let warns = [];
    let n = 0;
    mutate((x) => {
      let y = x;
      for (const it of items) {
        const r = importResponse(y, k.id, it.parsed, { office: it.office, file: it.file });
        y = r.dossier; warns = warns.concat(r.warnings || []); n++;
      }
      return y;
    }, t('neg.undo.responses', { n: items.length }));
    toast(t('neg.cons.importedN', { n }) + (warns.length ? ' ' + t('neg.cons.importWarn', { n: warns.length }) : ''), warns.length ? 'warning' : 'success', 6000);
    if (warns.length) console.info(warns);
  };
  const onFiles = async (files) => {
    setBusy(true);
    const ready = [], ask = [];
    for (const f of files) {
      if (!/\.docx$/i.test(f.name)) { toast(t('neg.cons.err.type', { name: f.name }), 'error'); continue; }
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const parsed = parseConsultationDocx(bytes);
        const file = { name: f.name, size: f.size, sha256: await sha256(bytes) };
        if ((k.responses || []).some((r) => r.file && r.file.sha256 && r.file.sha256 === file.sha256)) { toast(t('neg.cons.dup', { name: f.name }), 'warning', 6000); continue; }
        if (parsed.consultationId && parsed.consultationId !== k.id) toast(t('neg.cons.otherRound', { name: f.name }), 'warning', 6000);
        const oid = parsed.office && parsed.office.id && (k.offices || []).some((o) => o.id === parsed.office.id) ? parsed.office.id
          : parsed.office && parsed.office.name ? ((k.offices || []).find((o) => o.name === parsed.office.name || o.abbr === parsed.office.name) || {}).id : null;
        const entry = { name: f.name, parsed, file, office: oid || '', warnings: parsed.warnings || [] };
        if (oid) ready.push(entry); else ask.push(entry);
      } catch (e) { toast(t('neg.cons.err.parse', { name: f.name, msg: e.message }), 'error'); }
    }
    if (ready.length) doImport(ready);
    if (ask.length) setPending((p) => [...p, ...ask]);
    setBusy(false);
  };
  return html`<div class="nround">
    <section class="nround-head">
      <dl class="facts">
        <dt>${t('neg.cons.basis')}</dt><dd>${trackName(d, k.basis && k.basis.track)}: ${docLabel(dm.get(k.basis && k.basis.doc))}${k.basis && k.basis.compareTo ? html`<br /><span class="muted">${t('neg.cons.comparedTo', { doc: docLabel(dm.get(k.basis.compareTo)) })}</span>` : null}</dd>
        <dt>${t('neg.cons.scope')}</dt><dd>${t('neg.cons.nRows', { n: (k.scope || []).length })}</dd>
        <dt>${t('neg.cons.deadline')}</dt><dd>${k.deadline ? fmtDate(k.deadline) : '–'}</dd>
        <dt>${t('neg.cons.lang')}</dt><dd>${(k.lang || 'de').toUpperCase()}</dd>
        <dt>${t('neg.cons.status')}</dt><dd>${k.closed ? t('neg.cons.closedOn', { date: fmtDate(k.closed.slice(0, 10)) }) : t('neg.cons.open')}</dd>
      </dl>
      <div class="nround-acts">
        <button type="button" class="btn btn-tertiary btn-sm" onClick=${() => mutate((x) => updateConsultation(x, k.id, { closed: k.closed ? null : new Date().toISOString() }), k.closed ? t('neg.undo.reopen') : t('neg.undo.close'))}><${Icon} name=${k.closed ? 'refresh' : 'check-circle'} />${k.closed ? t('neg.cons.reopen') : t('neg.cons.close')}</button>
        <button type="button" class="btn btn-danger-ghost is-bare btn-sm" onClick=${async () => { if (await confirmDialog({ title: t('neg.cons.deleteTitle'), text: t('neg.cons.deleteText', { title: k.title }), ok: t('neg.cons.delete'), danger: true })) { mutate((x) => deleteConsultation(x, k.id), t('neg.undo.deleteRound')); go({ nk: null }, { replace: true }); } }}><${Icon} name="trash" />${t('neg.cons.delete')}</button>
      </div>
    </section>

    <section class="nsec" aria-labelledby="cons-docs-h">
      <h2 class="nsec-h" id="cons-docs-h"><span class="nsec-n">1</span>${t('neg.cons.docsHead')}</h2>
      <p class="small muted nmax">${t('neg.cons.docsText')}</p>
      <div class="neg-actions">
        <button type="button" class="btn btn-primary" id="cons-word" onClick=${() => exportWord(null)}><${Icon} name="download" />${t('neg.cons.wordNeutral')}</button>
        ${(k.offices || []).length ? html`<${Menu} label=${t('neg.cons.wordPerOffice')} icon="download" variant="secondary" items=${k.offices.map((o) => ({ label: `${o.abbr}${o.name && o.name !== o.abbr ? ' – ' + o.name : ''}`, onClick: () => exportWord(o) }))} />` : null}
        <button type="button" class="btn btn-tertiary" id="cons-print" onClick=${() => go({ view: 'druck', pv: 'consultation', po: k.id })}><${Icon} name="print" />${t('neg.cons.readVersion')}</button>
      </div>
      ${(k.exports || []).length ? html`<p class="small muted">${t('neg.cons.lastExport', { date: fmtDateTime(k.exports[k.exports.length - 1].at), n: k.exports.length })}</p>` : null}
    </section>

    <section class="nsec" aria-labelledby="cons-in-h">
      <h2 class="nsec-h" id="cons-in-h"><span class="nsec-n">2</span>${t('neg.cons.inHead')}</h2>
      <${DropZone} id="cons-response-files" accept=".docx" multiple=${true} busy=${busy} onFiles=${onFiles} label=${t('neg.cons.drop')} hint=${t('neg.cons.dropHint')} />
      ${pending.length ? html`<div class="npend"><${Notice} kind="warning" title=${t('neg.cons.pendingTitle')}>${t('neg.cons.pendingText')}</${Notice}>
        <ul class="npend-list">${pending.map((p, i) => html`<li>
          <span class="npend-name">${p.name}</span><span class="muted small">${t('neg.cons.nItems', { n: p.parsed.items.length })}</span>
          <select aria-label=${t('neg.cons.chooseOffice')} id=${'pend-off-' + i} value=${p.office} onChange=${(e) => setPending(pending.map((x, j) => (j === i ? { ...x, office: e.target.value } : x)))}><option value="">${t('neg.cons.chooseOffice')}</option>${(k.offices || []).map((o) => html`<option value=${o.id}>${o.abbr}${o.name !== o.abbr ? ' – ' + o.name : ''}</option>`)}</select>
          <button type="button" class="btn btn-secondary btn-sm" disabled=${!p.office} onClick=${() => { doImport([p]); setPending(pending.filter((_, j) => j !== i)); }}>${t('neg.cons.importOne')}</button>
          <button type="button" class="btn-icon" aria-label=${t('neg.common.cancel')} title=${t('neg.common.cancel')} onClick=${() => setPending(pending.filter((_, j) => j !== i))}><${Icon} name="close" /></button>
        </li>`)}</ul></div>` : null}
    </section>

    <section class="nsec" aria-labelledby="cons-prog-h">
      <h2 class="nsec-h" id="cons-prog-h"><span class="nsec-n">3</span>${t('neg.cons.progHead')}</h2>
      <div class="tbl-scroll"><table class="tbl-data nprogt">
        <thead><tr><th>${t('neg.cons.office')}</th><th>${t('neg.cons.received')}</th><th class="num">${t('neg.cons.items')}</th><th>${t('neg.cons.decided')}</th><th><span class="sr">${t('neg.dossiers.colActions')}</span></th></tr></thead>
        <tbody>${agg.offices.map((o) => { const resps = (k.responses || []).filter((r) => r.office === o.id); return html`<tr>
          <td class="uc"><b>${o.abbr}</b>${o.name && o.name !== o.abbr ? html`<span class="nlist-sub">${o.name}</span>` : null}</td>
          <td>${resps.length ? resps.map((r) => html`<span class="nrecv"><span class="nst nst-agreed"><span class="nst-sym" aria-hidden="true">✓</span>${fmtDateTime(r.importedAt)}</span><span class="small muted">${r.file ? r.file.name : ''}</span></span>`) : html`<span class="nst nst-open"><span class="nst-sym" aria-hidden="true">○</span>${t('neg.cons.notReceived')}</span>`}</td>
          <td class="num">${o.items}</td>
          <td><span class="nmeter" aria-hidden="true"><span style=${{ width: (o.items ? Math.round((o.decided / o.items) * 100) : 0) + '%' }}></span></span> ${o.decided}/${o.items}</td>
          <td class="nlist-act">${resps.map((r) => html`
            <select aria-label=${t('neg.cons.reassign')} title=${t('neg.cons.reassign')} class="nsel-sm" value=${r.office} onChange=${(e) => mutate((x) => setResponseOffice(x, k.id, r.id, e.target.value), t('neg.undo.reassign'))}>${(k.offices || []).map((x) => html`<option value=${x.id}>${x.abbr}</option>`)}</select>
            <button type="button" class="btn-icon is-bare btn-danger-ghost" aria-label=${t('neg.cons.removeResponse', { name: r.file ? r.file.name : r.id })} title=${t('neg.cons.removeResponse', { name: r.file ? r.file.name : r.id })} onClick=${async () => { if (await confirmDialog({ title: t('neg.cons.removeTitle'), text: t('neg.cons.removeText'), ok: t('neg.cons.removeOk'), danger: true })) mutate((x) => removeResponse(x, k.id, r.id), t('neg.undo.removeResponse')); }}><${Icon} name="trash" /></button>`)}</td>
        </tr>`; })}</tbody>
      </table></div>
      <p class="nround-sum">${t('neg.cons.summary', { r: agg.stats.officesResponded, o: agg.stats.offices, i: agg.stats.items, dd: agg.stats.decided })}
        ${agg.stats.items ? html` <button type="button" class="btn btn-secondary btn-sm" onClick=${() => go({ nkt: 'agg', nk: k.id }, { replace: true })}><${Icon} name="arrow-right" />${t('neg.cons.toAgg')}</button>` : null}</p>
    </section>

    ${agg.unmatched.length ? html`<section class="nsec" aria-labelledby="cons-un-h">
      <h2 class="nsec-h" id="cons-un-h">${t('neg.cons.unmatchedHead', { n: agg.unmatched.length })}</h2>
      <p class="small muted nmax">${t('neg.cons.unmatchedText')}</p>
      <ul class="nun">${(k.responses || []).flatMap((r) => (r.unmatched || []).map((u, i) => html`<${Unmatched} d=${d} k=${k} r=${r} u=${u} i=${i} off=${off(r.office)} />`))}</ul>
    </section>` : null}

    ${agg.general.length ? html`<section class="nsec" aria-labelledby="cons-gen-h">
      <h2 class="nsec-h" id="cons-gen-h">${t('neg.cons.generalHead')}</h2>
      <ul class="nfb">${agg.general.map((g) => html`<li class="nfb-item uc"><div class="nfb-head"><b>${off(g.office).abbr}</b></div><p class="nfb-text">${g.text}</p></li>`)}</ul>
    </section>` : null}
  </div>`;
}

function Unmatched({ d, k, r, u, i, off }) {
  const [row, setRow] = useState('');
  const scope = new Set(k.scope || []);
  const rows = sortedRows(d).filter((x) => !scope.size || scope.has(x.id));
  const text = typeof u === 'string' ? u : u.text;
  return html`<li class="nun-item">
    <div class="nfb-head uc"><b>${off.abbr}</b></div>
    <p class="nfb-text uc">${text}</p>
    <div class="nform-row">
      <label class="field nform-grow"><span class="field-label">${t('neg.cons.assignRow')}</span><select value=${row} onChange=${(e) => setRow(e.target.value)}><option value="">${t('neg.cons.chooseRow')}</option>${rows.map((x) => html`<option value=${x.id}>${visibleRowId(x.id)} ${x.num ? x.num + ' | ' : ''}${(x.label || '').slice(0, 80)}</option>`)}</select></label>
      <button type="button" class="btn btn-secondary nform-btn" disabled=${!row} onClick=${() => mutate((x) => assignUnmatched(x, k.id, r.id, i, row), t('neg.undo.assign'))}>${t('neg.cons.assign')}</button>
    </div>
  </li>`;
}

// ------------------------------------------------------------------ Aggregierte Sicht
function Aggregate({ d, k, route }) {
  const agg = useMemo(() => aggregateConsultation(d, k.id), [d, k.id]);
  const [sel, setSel] = useState(new Set());
  const [bulk, setBulk] = useState({ decision: 'accepted', reply: '' });
  const [showText, setShowText] = useState(true);
  const fl = route.nkf || '';
  const match = (it) => !fl || (fl === 'open' && it.decision === 'open') || (fl.startsWith('office:') && it.office.id === fl.slice(7)) || (fl.startsWith('decision:') && it.decision === fl.slice(9));
  const rows = agg.rows.map((r) => ({ ...r, shown: r.items.filter(match) })).filter((r) => r.shown.length);
  const shownIds = rows.flatMap((r) => r.shown.map((x) => x.itemId));
  const selIds = shownIds.filter((x) => sel.has(x));
  const toggle = (id) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setSel(n); };
  const decide = (itemId, patch) => mutate((x) => {
    const kk = x.consultations.find((y) => y.id === k.id);
    const cur = (kk.decisions || {})[itemId] || { decision: 'open', reply: '', applied: false };
    return setDecision(x, k.id, itemId, { decision: cur.decision, reply: cur.reply || '', applied: !!cur.applied, ...patch });
  }, t('neg.undo.decision'));
  const applyBulk = () => {
    mutate((x) => {
      let y = x;
      const kk = x.consultations.find((z) => z.id === k.id);
      for (const id of selIds) { const cur = (kk.decisions || {})[id] || {}; y = setDecision(y, k.id, id, { decision: bulk.decision, reply: bulk.reply || cur.reply || '', applied: !!cur.applied }); }
      return y;
    }, t('neg.undo.decisionBulk', { n: selIds.length }));
    toast(t('neg.cons.bulkDone', { n: selIds.length }), 'success', 3000);
    setSel(new Set());
  };
  const take = (it, what) => mutate((x) => applyToPosition(x, k.id, it.itemId, what, { officeLabel: it.office.abbr }), t('neg.undo.take', { id: visibleRowId(rows.find((r) => r.items.includes(it)) ? rows.find((r) => r.items.includes(it)).rowId : '') }));
  const st = agg.stats;
  return html`<div class="nagg">
    <div class="nagg-prog">${agg.offices.map((o) => html`<button type="button" class="nagg-off" aria-pressed=${fl === 'office:' + o.id ? 'true' : 'false'} onClick=${() => go({ nkf: fl === 'office:' + o.id ? null : 'office:' + o.id }, { replace: true })} title=${o.name}>
      <b class="uc">${o.abbr}</b><span class="small">${o.responded ? t('neg.cons.offItems', { n: o.items, dd: o.decided }) : t('neg.cons.notReceived')}</span>
      <span class="nmeter" aria-hidden="true"><span style=${{ width: (o.items ? Math.round((o.decided / o.items) * 100) : 0) + '%' }}></span></span>
    </button>`)}</div>
    <div class="toolbar nd-toolbar is-sm">
      <label class="field"><span class="field-label">${t('neg.cons.filter')}</span><select id="agg-filter" value=${fl} onChange=${(e) => go({ nkf: e.target.value || null }, { replace: true })}>
        <option value="">${t('neg.cons.fAll', { n: st.items })}</option>
        <option value="open">${t('neg.cons.fOpen', { n: st.open })}</option>
        <optgroup label=${t('neg.cons.fByOffice')}>${agg.offices.map((o) => html`<option value=${'office:' + o.id}>${o.abbr}</option>`)}</optgroup>
        <optgroup label=${t('neg.cons.fByDecision')}>${DECISIONS.map((x) => html`<option value=${'decision:' + x}>${t('neg.decision.' + x)}</option>`)}</optgroup>
      </select></label>
      <label class="check tool-group"><input type="checkbox" checked=${showText} onChange=${(e) => setShowText(e.target.checked)} />${t('neg.cons.showText')}</label>
      <span class="spacer"></span>
      <button type="button" class="btn btn-tertiary" onClick=${() => go({ view: 'ausgabe' })}><${Icon} name="file" />${t('neg.cons.toReport')}</button>
    </div>
    <div class=${'nbulk' + (selIds.length ? ' is-on' : '')} role="region" aria-label=${t('neg.cons.bulk')}>
      <label class="check"><input type="checkbox" checked=${selIds.length > 0 && selIds.length === shownIds.length} onChange=${(e) => setSel(e.target.checked ? new Set(shownIds) : new Set())} />${selIds.length ? t('neg.pos.selected', { n: selIds.length }) : t('neg.cons.selectAll', { n: shownIds.length })}</label>
      <label class="field field-row"><span class="field-label">${t('neg.cons.decision')}</span><select id="agg-bulk-dec" disabled=${!selIds.length} value=${bulk.decision} onChange=${(e) => setBulk({ ...bulk, decision: e.target.value })}>${DECISIONS.map((x) => html`<option value=${x}>${t('neg.decision.' + x)}</option>`)}</select></label>
      <input type="text" class="nbulk-reply" aria-label=${t('neg.cons.reply')} placeholder=${t('neg.cons.replyOpt')} disabled=${!selIds.length} value=${bulk.reply} onInput=${(e) => setBulk({ ...bulk, reply: e.target.value })} />
      <button type="button" class="btn btn-primary btn-sm" id="agg-bulk-apply" disabled=${!selIds.length} onClick=${applyBulk}><${Icon} name="check" />${t('neg.cons.applyBulk')}</button>
    </div>
    ${rows.length === 0 ? html`<div class="neg-empty"><p class="empty-title">${st.items ? t('neg.cons.noneFiltered') : t('neg.cons.noResponses')}</p><p>${st.items ? '' : t('neg.cons.noResponsesText')}</p></div>` : html`<ol class="nagg-rows">${rows.map((r) => {
      const row = d.rows.find((x) => x.id === r.rowId) || {};
      const cell = k.basis ? cellFor(d, r.rowId, k.basis.track, k.basis.doc) : null;
      const p = r.position;
      return html`<li class="nagg-row" id=${'agg-' + r.rowId}>
        <div class="nagg-rhead">
          <button type="button" class="link nagg-label" onClick=${() => go({ view: 'synopse', r: r.rowId })}>${r.num ? r.num + ' | ' : ''}${r.label}</button>
          <span class="rowid">${visibleRowId(r.rowId)}</span>
          ${p && hasPosition(p) ? html`<span class="nagg-pos"><${StanceTag} stance=${p.stance} /><${PriorityTag} priority=${p.priority} /></span>` : html`<span class="muted small">${t('neg.syn.noPos')}</span>`}
        </div>
        ${showText && cell && !cell.empty ? html`<div class="ncell legal nagg-text" lang="en" dangerouslySetInnerHTML=${{ __html: sanitizeInline(cell.html) }}></div>` : null}
        ${p && p.text ? html`<p class="nagg-ptext uc"><span class="field-label">${t('neg.cons.posDraft')}</span>${p.text}</p>` : null}
        <div class="nagg-items">${r.shown.map((it) => html`<${Item} it=${it} dec=${(k.decisions || {})[it.itemId] || null} sel=${sel.has(it.itemId)} onSel=${() => toggle(it.itemId)} onDecide=${(patch) => decide(it.itemId, patch)} onTake=${(what) => take(it, what)} />`)}</div>
      </li>`;
    })}</ol>`}
  </div>`;
}

function Item({ it, dec, sel, onSel, onDecide, onTake }) {
  const [reply, setReply] = useState(it.reply || '');
  return html`<article class=${'nitem ni-' + it.decision + (sel ? ' is-sel' : '')} aria-label=${t('neg.cons.itemOf', { office: it.office.abbr })}>
    <div class="nitem-head">
      <label class="check"><input type="checkbox" checked=${sel} onChange=${onSel} aria-label=${t('neg.cons.selectItem', { office: it.office.abbr })} /><b class="uc" title=${it.office.name}>${it.office.abbr}</b></label>
      ${it.source && it.source !== 'cell' ? html`<span class="tag tag-src" title=${t('neg.cons.src.' + it.source)}>${t('neg.cons.srcShort.' + it.source)}</span>` : null}
      <span class="spacer"></span>${dec && dec.at && it.decision !== 'open' ? html`<span class="small muted" title=${t('neg.by.decidedAt')}>${fmtDateTime(dec.at)}</span>` : null}<${ByTag} by=${dec && dec.by} /><${DecisionTag} decision=${it.decision} />
    </div>
    ${it.comment ? html`<p class="nitem-text uc">${it.comment}</p>` : null}
    ${it.proposal ? html`<div class="nitem-prop"><span class="field-label">${t('neg.cons.proposal')}</span><p class="legal" lang="en">${it.proposal}</p></div>` : null}
    <div class="nitem-dec">
      <select aria-label=${t('neg.cons.decision')} class="nitem-sel" value=${it.decision} onChange=${(e) => onDecide({ decision: e.target.value })}>${DECISIONS.map((x) => html`<option value=${x}>${t('neg.decision.' + x)}</option>`)}</select>
      <textarea rows="2" aria-label=${t('neg.cons.reply')} placeholder=${t('neg.cons.replyOpt')} value=${reply} onInput=${(e) => setReply(e.target.value)} onBlur=${() => { if (reply !== (it.reply || '')) onDecide({ reply }); }}></textarea>
    </div>
    <div class="nitem-acts">
      ${it.comment ? html`<button type="button" class="btn btn-tertiary btn-sm" onClick=${() => onTake('comment')} title=${t('neg.cons.takeCommentTip')}><${Icon} name="arrow-right" />${t('neg.cons.takeComment')}</button>` : null}
      ${it.proposal ? html`<button type="button" class="btn btn-tertiary btn-sm" onClick=${() => onTake('proposal')} title=${t('neg.cons.takeProposalTip')}><${Icon} name="arrow-right" />${t('neg.cons.takeProposal')}</button>` : null}
      ${it.applied ? html`<span class="small nitem-applied"><${Icon} name="check" />${t('neg.cons.applied')}</span>` : null}
    </div>
  </article>`;
}
