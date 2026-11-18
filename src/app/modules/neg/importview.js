// Import einer Fassung: Datei → Erkennung (Metadaten) → Spaltenzuordnung → Prüfmaske (planMerge) → Übernahme (applyMerge)
// → "Was ist neu in dieser Fassung". Daneben: Fassungen des Dossiers (Import rückgängig), Fassung manuell anlegen.
import { html } from 'htm/preact';
import { CardMenu } from './card.js';
import { changesModel } from './cardmodel.js';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { t, has } from '../../lib/i18n.js';
import { go } from '../../state.js';
import { Icon, HelpLink, Notice, Seg } from '../../ui/common.js';
import { toast } from '../../app.js';
import { fmtDate, fmtNum } from '../../lib/format.js';
import { DOC_KINDS, CLASSIFICATIONS, detectDocument, parseFile, planMerge, applyMerge, sha256, removeDocument, addManualDocument, docsByDate, changesBetween, visibleRowId, sanitizeInline, sortedRows } from './core.js';
import { mutate, dossierStore } from './store.js';
import { useDossier, NoDossier, PageHead, DropZone, docLabel, trackName, trackColor, ClassTag, confirmDialog, StatusBadge } from './ui.js';

const MAX = 60 * 1024 * 1024;
let lastImport = null; // Ergebnis der letzten Übernahme (übersprungene Zeilen) für "Was ist neu"
const extType = (name) => (/\.pdf$/i.test(name) ? 'pdf' : /\.docx$/i.test(name) ? 'docx' : /\.html?$/i.test(name) ? 'html' : null);

export function ImportView({ route }) {
  const d = useDossier(route);
  if (!d) return html`<${NoDossier} route=${route} />`;
  if (route.nkt === 'changes' && route.po) return html`<${ChangesView} d=${d} docId=${route.po} />`;
  return html`<${Importer} d=${d} route=${route} />`;
}

const STEPS = ['file', 'map', 'check', 'done'];
function Stepper({ step }) {
  const i = STEPS.indexOf(step);
  return html`<ol class="nstepper" aria-label=${t('neg.imp.steps')}>${STEPS.map((s, j) => html`<li class=${j < i ? 'is-done' : j === i ? 'is-current' : ''} aria-current=${j === i ? 'step' : undefined}><span class="nstep-n">${j + 1}</span>${t('neg.imp.step.' + s)}</li>`)}</ol>`;
}

function Importer({ d, route }) {
  const [st, setSt] = useState({ step: 'file' });
  useEffect(() => { const el = document.querySelector('.nstepper'); const v = el && el.closest('.view'); if (v && st.step !== 'file') v.scrollTop += el.getBoundingClientRect().top - v.getBoundingClientRect().top - 16; }, [st.step]);
  const [busy, setBusy] = useState(null); // { phase, done, total }
  const reset = () => { setSt({ step: 'file' }); setBusy(null); };

  const onFiles = async (files) => {
    const file = files[0];
    const type = extType(file.name);
    if (!type) { toast(t('neg.imp.err.type', { name: file.name }), 'error'); return; }
    if (file.size > MAX) { toast(t('neg.imp.err.size'), 'error'); return; }
    setBusy({ phase: 'read', done: 0, total: 0 });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const det = detectDocument({ name: file.name, bytes });
      if (det.guess && det.guess.kind === 'consultation-response') { setBusy(null); toast(t('neg.imp.err.response'), 'warning', 8000); return; }
      const hash = await sha256(bytes);
      const dup = d.documents.find((x) => x.file && x.file.sha256 && x.file.sha256 === hash);
      if (dup && !(await confirmDialog({ title: t('neg.imp.dupTitle'), text: t('neg.imp.dupText', { doc: docLabel(dup) }), ok: t('neg.imp.dupOk') }))) { setBusy(null); return; }
      let parser = type === 'html' ? 'proposal' : det.guess && /^(compromise|mandate)$/.test(det.guess.kind) ? 'text' : 'four-column';
      const onProgress = (p) => setBusy({ phase: p.phase || 'pages', done: p.done || 0, total: p.total || 0 });
      let parsed = await parseFile({ bytes, type, parser, onProgress });
      // Kein Tabellenraster gefunden: als fortlaufenden Text lesen
      if (parser === 'four-column' && (!parsed.rows || parsed.rows.length === 0 || (parsed.columns || []).length < 2)) {
        parser = 'text';
        const p2 = await parseFile({ bytes, type, parser, onProgress });
        if (p2.rows && p2.rows.length) parsed = { ...p2, warnings: [...(p2.warnings || []), { code: 'fallback-text', message: t('neg.imp.fallbackText') }] };
      }
      const g = det.guess || {};
      const pm = parsed.meta || {};
      const meta = {
        kind: pm.kind || (g.kind !== 'other' ? g.kind : null) || (parser === 'text' ? 'compromise' : parser === 'proposal' ? 'proposal' : 'four-column'),
        ref: pm.ref || g.ref || '', date: pm.date || g.date || '', title: pm.title || g.title || '', classification: pm.classification || g.classification || (type === 'docx' ? 'internal' : 'public'), note: '',
      };
      if (!DOC_KINDS.includes(meta.kind)) meta.kind = 'other';
      if (!CLASSIFICATIONS.includes(meta.classification)) meta.classification = 'internal';
      const mapping = {};
      for (const c of parsed.columns || []) mapping[c.index] = c.suggestedTrack || null;
      setSt({ step: 'map', file: { name: file.name, size: file.size, sha256: hash, type }, det, parsed, parser, meta, mapping, bytes });
    } catch (e) {
      console.error(e);
      toast(t('neg.imp.err.parse', { msg: e.message || String(e) }), 'error', 10000);
    } finally { setBusy(null); }
  };

  const toCheck = () => {
    const mapping = Object.fromEntries(Object.entries(st.mapping).filter(([, v]) => v));
    if (!Object.keys(mapping).length) { toast(t('neg.imp.err.noMapping'), 'warning'); return; }
    const plan = planMerge(d, st.parsed, mapping, { docMeta: { ...st.meta, file: st.file }, ambiguous: 'skip' });
    setSt({ ...st, step: 'check', plan, over: {} });
  };
  const apply = () => {
    const overrides = { rows: st.over, doc: { ...st.meta, file: st.file }, ambiguous: 'skip' };
    let res = null;
    mutate((x) => { res = applyMerge(x, st.plan, overrides); return res.dossier; }, t('neg.undo.import', { doc: st.meta.ref || st.file.name }));
    if (res) {
      const sk = res.skipped || {};
      const nSkip = (sk.ambiguous || 0) + (sk.new || 0) + (sk.manual || 0);
      lastImport = { docId: res.docId, skipped: nSkip, ambiguous: sk.ambiguous || 0 };
      toast(t('neg.imp.applied', { doc: st.meta.ref || st.file.name }) + (nSkip ? ' ' + t('neg.imp.skippedN', { n: nSkip }) : ''), 'success', 5000);
      go({ view: 'import', nkt: 'changes', po: res.docId });
      setSt({ step: 'file' });
    }
  };

  return html`<div class="view"><main class="wide" id="main" tabindex="-1">
    <${PageHead} compact kicker=${d.short || d.title} title=${t('neg.nav.import')} help=${html`<${HelpLink} view="n-anleitung" sec="import" />`}>
      <p class="nhead-lead">${t('neg.imp.lead')}</p>
    </${PageHead}>
    <${Seg} label=${t('neg.imp.mode')} value=${route.nkt === 'manual' ? 'manual' : 'file'} onChange=${(v) => go({ nkt: v === 'manual' ? 'manual' : null }, { replace: true })} options=${[{ value: 'file', label: t('neg.imp.modeFile') }, { value: 'manual', label: t('neg.imp.modeManual') }]} />
    ${route.nkt === 'manual' ? html`<${ManualDoc} d=${d} />` : html`
      <${Stepper} step=${st.step} />
      ${st.step === 'file' ? html`<div class="nimp-sec">
        <${DropZone} id="neg-import-file" accept=".pdf,.docx,.html,.htm" onFiles=${onFiles} busy=${!!busy} label=${t('neg.imp.drop')} hint=${t('neg.imp.dropHint')} />
        ${busy ? html`<${Progress} p=${busy} />` : null}
      </div>` : null}
      ${st.step === 'map' ? html`<${MapStep} d=${d} st=${st} setSt=${setSt} onNext=${toCheck} onCancel=${reset} />` : null}
      ${st.step === 'check' ? html`<${CheckStep} d=${d} st=${st} setSt=${setSt} onApply=${apply} onBack=${() => setSt({ ...st, step: 'map' })} onCancel=${reset} />` : null}
    `}
    <${DocList} d=${d} />
  </main></div>`;
}

function Progress({ p }) {
  const pct = p.total ? Math.round((p.done / p.total) * 100) : null;
  return html`<div class="nprog" role="status" aria-live="polite">
    <p>${p.total ? t('neg.imp.progress', { done: p.done, total: p.total }) : t('neg.imp.reading')}</p>
    <div class="nprog-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${pct ?? undefined}><span style=${{ width: (pct ?? 15) + '%' }} class=${pct == null ? 'is-indet' : ''}></span></div>
  </div>`;
}

function MapStep({ d, st, setSt, onNext, onCancel }) {
  const m = st.meta;
  const set = (k) => (e) => setSt({ ...st, meta: { ...m, [k]: e.target.value } });
  const cols = st.parsed.columns || [];
  const preview = (st.parsed.rows || []).filter((r) => Object.values(r.cells || {}).some((c) => c && c.text)).slice(0, 3);
  const warns = st.parsed.warnings || [];
  return html`<div class="nimp-sec">
    <section aria-labelledby="imp-meta-h">
      <h2 class="nd-h" id="imp-meta-h">${t('neg.imp.metaHead')}</h2>
      <p class="small muted">${t('neg.imp.detected', { name: st.file.name, type: st.file.type.toUpperCase(), parser: t('neg.imp.parser.' + st.parser), rows: fmtNum((st.parsed.rows || []).length), pages: st.parsed.stats && st.parsed.stats.pages ? ', ' + t('neg.imp.pages', { n: st.parsed.stats.pages }) : '' })}</p>
      <div class="nform-row">
        <label class="field"><span class="field-label">${t('neg.imp.kind')}</span><select id="imp-kind" value=${m.kind} onChange=${set('kind')}>${DOC_KINDS.map((k) => html`<option value=${k}>${t('neg.docKind.' + k)}</option>`)}</select></label>
        <label class="field"><span class="field-label">${t('neg.imp.ref')}</span><input type="text" id="imp-ref" value=${m.ref} onInput=${set('ref')} placeholder="ST 8413/23" /></label>
        <label class="field"><span class="field-label">${t('neg.imp.date')}</span><input type="date" id="imp-date" value=${m.date || ''} onInput=${set('date')} /></label>
        <label class="field"><span class="field-label">${t('neg.imp.class')}</span><select id="imp-class" value=${m.classification} onChange=${set('classification')}>${CLASSIFICATIONS.map((k) => html`<option value=${k}>${t('neg.class.' + k)}</option>`)}</select></label>
      </div>
      <label class="field field-wide"><span class="field-label">${t('neg.imp.title')}</span><input type="text" id="imp-title" lang="en" value=${m.title} onInput=${set('title')} /></label>
      ${!m.date ? html`<p class="small warn-text">${t('neg.imp.noDate')}</p>` : null}
    </section>
    ${warns.length ? html`<${Warnings} list=${warns} />` : null}
    <section aria-labelledby="imp-map-h">
      <h2 class="nd-h" id="imp-map-h">${t('neg.imp.mapHead')}</h2>
      <p class="small muted">${t('neg.imp.mapText')}</p>
      ${cols.length ? html`<div class="tbl-scroll"><table class="tbl-data nmap">
        <thead><tr>${cols.map((c) => html`<th>
          <span class="nmap-h" lang="en">${c.header || t('neg.imp.colN', { n: c.index + 1 })}</span>
          <select class="nmap-sel" id=${'imp-col-' + c.index} aria-label=${t('neg.imp.colTrack', { col: c.header || c.index + 1 })} value=${st.mapping[c.index] || ''} onChange=${(e) => setSt({ ...st, mapping: { ...st.mapping, [c.index]: e.target.value || null } })}>
            <option value="">${t('neg.imp.skip')}</option>${d.tracks.map((x) => html`<option value=${x.id}>${trackName(d, x.id)}</option>`)}
          </select></th>`)}</tr></thead>
        <tbody>${preview.map((r) => html`<tr>${cols.map((c, j) => html`<td class=${st.mapping[c.index] ? '' : 'is-skip'}>${j === 0 && r.label ? html`<span class="nmap-lab">${r.num ? r.num + ' | ' : ''}${r.label}</span>` : null}<div class="ncell legal nmap-cell" lang="en" dangerouslySetInnerHTML=${{ __html: sanitizeInline(((r.cells || {})[c.index] || {}).html || '') }}></div></td>`)}</tr>`)}</tbody>
      </table></div>` : html`<${Notice} kind="warning">${t('neg.imp.noColumns')}</${Notice}>`}
    </section>
    <div class="nform-actions">
      <button type="button" class="btn btn-primary" id="imp-next" onClick=${onNext} disabled=${!cols.length}><${Icon} name="arrow-right" />${t('neg.imp.toCheck')}</button>
      <button type="button" class="btn btn-tertiary" onClick=${onCancel}>${t('neg.common.cancel')}</button>
    </div>
  </div>`;
}

/** Warnung des Parsers in verständlichem Text (DE/FR); unbekannte Codes mit Originalmeldung. */
function warnTextObj(w) {
  const n = (/(\d[\d'’ ]*)/.exec(w.message || '') || [])[1];
  const key = 'neg.warn.' + String(w.code || '').replace(/-/g, '_');
  if (w.code && has(key)) return t(key, { n: n ? n.replace(/\D/g, '') : '', page: w.page || '' }) + (w.page ? ' ' + t('neg.warn.onPage', { page: w.page }) : '');
  return guessWarn(w.message) || w.message || w.code;
}
/** Gespeicherte Warnungen sind Texte der Kernbibliothek (DE): bekannte Muster übersetzen. */
const WARN_PATTERNS = [[/durchgestrichen/i, 'strike_detected'], [/Schriftfarben/i, 'colors_not_read'], [/Tabellenraster|no-table/i, 'no_table'], [/nachverfolgt|Änderungsverfolgung/i, 'tracked_changes'], [/Kopfzeile/i, 'no_header'], [/Fussnote/i, 'footnote_unattached'], [/[Mm]ehrdeutig/, 'ambiguous_skipped']];
function guessWarn(msg) {
  const m = WARN_PATTERNS.find(([re]) => re.test(String(msg || '')));
  if (!m || !has('neg.warn.' + m[1])) return null;
  const n = (/(\d[\d'’ ]*)/.exec(msg) || [])[1];
  return t('neg.warn.' + m[1], { n: n ? n.replace(/\D/g, '') : '' });
}
export function warnText(w) { return typeof w === 'string' ? (guessWarn(w) || w) : warnTextObj(w); }
function Warnings({ list }) {
  const msgs = [...new Set(list.map(warnText))];
  return html`<details class="nwarn" open=${msgs.length <= 4}><summary><${Icon} name="warning" />${t('neg.imp.warnings', { n: msgs.length })}</summary>
    <ul>${msgs.map((m) => html`<li>${m}</li>`)}</ul></details>`;
}

function rowKind(pr) {
  if (pr.match === 'new') return 'new';
  if (pr.match === 'ambiguous') return 'ambiguous';
  return Object.values(pr.cells).some((c) => c.change === 'changed' || c.change === 'new' || c.change === 'removed' || c.change === 'status') ? 'changed' : 'unchanged';
}

function CheckStep({ d, st, setSt, onApply, onBack, onCancel }) {
  const plan = st.plan;
  const [show, setShow] = useState('attention');
  const kinds = useMemo(() => plan.rows.map(rowKind), [plan]);
  const cnt = { unchanged: 0, changed: 0, new: 0, ambiguous: 0 };
  kinds.forEach((k) => { cnt[k]++; });
  const rowsById = new Map(d.rows.map((r) => [r.id, r]));
  const opts = sortedRows(d);
  const setOver = (idx, v) => setSt({ ...st, over: { ...st.over, [idx]: v } });
  const first = d.rows.length === 0;
  const list = plan.rows.map((pr, i) => ({ pr, k: kinds[i] })).filter(({ k }) => (show === 'attention' ? (k === 'new' && !first) || k === 'ambiguous' : show === 'all' ? true : k === show));
  const ambRows = plan.rows.filter((pr) => pr.match === 'ambiguous');
  const undecided = ambRows.filter((pr) => !(st.over[pr.idx] && (st.over[pr.idx].rowId || st.over[pr.idx].skip))).length;
  const bulkAmb = (v) => { const over = { ...st.over }; for (const pr of ambRows) if (!(over[pr.idx] && (over[pr.idx].rowId || over[pr.idx].skip))) over[pr.idx] = v; setSt({ ...st, over }); };
  const fig = (k, v, warn) => html`<button type="button" class=${'nsum-item' + (show === k ? ' is-on' : '') + (warn && v ? ' is-warn' : '')} aria-pressed=${show === k ? 'true' : 'false'} onClick=${() => setShow(k)}><span class="nsum-v">${fmtNum(v)}</span><span class="nsum-l">${t('neg.imp.sum.' + k)}</span></button>`;
  return html`<div class="nimp-sec">
    <h2 class="nd-h">${t('neg.imp.checkHead', { doc: st.meta.ref || st.file.name })}</h2>
    <div class="nsum" role="group" aria-label=${t('neg.imp.checkHead', { doc: '' })}>
      ${fig('unchanged', cnt.unchanged)}${fig('changed', cnt.changed)}${fig('new', cnt.new)}
      <div class="nsum-item is-static"><span class="nsum-v">${fmtNum(plan.missing.length)}</span><span class="nsum-l">${t('neg.imp.sum.missing')}</span></div>
      ${fig('ambiguous', cnt.ambiguous, true)}
    </div>
    ${[...(plan.warnings || [])].length ? html`<${Warnings} list=${plan.warnings} />` : null}
    <div class="nd-bar">
      <${Seg} label=${t('neg.imp.showLabel')} size="sm" value=${show} onChange=${setShow} options=${['attention', 'changed', 'new', 'ambiguous', 'all'].map((x) => ({ value: x, label: t('neg.imp.show.' + x) }))} />
    </div>
    ${first ? html`<p class="small muted">${t('neg.imp.firstImport', { n: plan.rows.length })}</p>` : null}
    ${list.length === 0 ? html`<p class="muted nchk-empty">${t('neg.imp.nothingToCheck')}</p>` : html`<ol class="nchk">${list.slice(0, 300).map(({ pr, k }) => {
      const o = st.over[pr.idx] || {};
      const target = o.rowId && o.rowId !== 'new' ? rowsById.get(o.rowId) : pr.rowId ? rowsById.get(pr.rowId) : null;
      return html`<li class=${'nchk-item k-' + k + (o.skip ? ' is-skip' : '')}>
        <div class="nchk-head">
          <span class=${'nchk-kind k-' + k}>${t('neg.imp.sum.' + k)}</span>
          <b>${pr.num ? pr.num + ' | ' : ''}${pr.label || t('neg.syn.noLabel')}</b>
          ${pr.labelSource === 'derived' ? html`<span class="tag tag-src" title=${t('neg.imp.derivedTip')}>${t('neg.imp.derived')}</span>` : null}
          ${k === 'ambiguous' && pr.candidates[0] ? html`<span class="small muted">${t('neg.imp.bestScore', { score: Math.round(pr.candidates[0].score * 100) })}</span>` : null}
          ${target && k !== 'new' ? html`<span class="muted small">→ ${visibleRowId(target.id)} ${target.label}</span>` : null}
        </div>
        <div class="nchk-cells">${Object.entries(pr.cells).filter(([, c]) => c.text || c.prev).map(([tid, c]) => html`<div class="nchk-cell" style=${{ '--trk': trackColor(d, tid) }}>
          <span class="nchk-trk">${trackName(d, tid)} <span class="muted">${t('neg.imp.cell.' + c.change)}</span></span>
          <div class="ncell legal" lang="en" dangerouslySetInnerHTML=${{ __html: sanitizeInline(c.html || '') }}></div>
        </div>`)}</div>
        ${k === 'ambiguous' || k === 'new' ? html`<div class="nchk-act">
          <label class="field"><span class="field-label">${t('neg.imp.assign')}</span>
            <select id=${'imp-assign-' + pr.idx} value=${o.skip ? 'skip' : o.rowId || (k === 'new' ? 'new' : '')} onChange=${(e) => { const v = e.target.value; setOver(pr.idx, v === 'skip' ? { skip: true } : v ? { rowId: v } : {}); }}>
              ${k === 'ambiguous' ? html`<option value="">${t('neg.imp.chooseCandidate')}</option>` : null}
              ${(pr.candidates || []).map((c) => { const r = rowsById.get(c.rowId); return html`<option value=${c.rowId}>${t('neg.imp.candidate', { id: visibleRowId(c.rowId), label: r ? r.label : '', score: Math.round(c.score * 100) })}</option>`; })}
              <option value="new">${t('neg.imp.asNew')}</option>
              <option value="skip">${t('neg.imp.skipRow')}</option>
              <optgroup label=${t('neg.imp.otherRow')}>${opts.slice(0, 2000).map((r) => html`<option value=${r.id}>${visibleRowId(r.id)} ${r.num ? r.num + ' | ' : ''}${(r.label || '').slice(0, 70)}</option>`)}</optgroup>
            </select></label>
        </div>` : null}
      </li>`;
    })}</ol>`}
    ${list.length > 300 ? html`<p class="small muted">${t('neg.imp.truncated', { n: list.length - 300 })}</p>` : null}
    ${ambRows.length ? html`<div class="namb" role="group" aria-label=${t('neg.imp.ambBulk')}>
      ${undecided ? html`<${Notice} kind="warning">${t('neg.imp.undecided', { n: undecided })}</${Notice}>` : html`<${Notice} kind="success">${t('neg.imp.allDecided', { n: ambRows.length })}</${Notice}>`}
      <div class="neg-actions">
        <button type="button" class="btn btn-tertiary btn-sm" id="imp-amb-skip" disabled=${!undecided} onClick=${() => bulkAmb({ skip: true })}>${t('neg.imp.ambSkipAll')}</button>
        <button type="button" class="btn btn-tertiary btn-sm" id="imp-amb-new" disabled=${!undecided} onClick=${() => bulkAmb({ rowId: 'new' })}>${t('neg.imp.ambNewAll')}</button>
        <button type="button" class="btn btn-tertiary btn-sm" id="imp-amb-best" disabled=${!undecided} onClick=${() => { const over = { ...st.over }; for (const pr of ambRows) if (!(over[pr.idx] && (over[pr.idx].rowId || over[pr.idx].skip)) && pr.candidates[0]) over[pr.idx] = { rowId: pr.candidates[0].rowId }; setSt({ ...st, over }); }}>${t('neg.imp.ambBestAll')}</button>
      </div>
    </div>` : null}
    <div class="nform-actions">
      <button type="button" class="btn btn-primary" id="imp-apply" disabled=${undecided > 0} title=${undecided ? t('neg.imp.applyBlocked') : undefined} onClick=${onApply}><${Icon} name="check" />${t('neg.imp.apply')}</button>
      <button type="button" class="btn btn-tertiary" onClick=${onBack}><${Icon} name="arrow-left" />${t('neg.imp.back')}</button>
      <button type="button" class="btn btn-tertiary" onClick=${onCancel}>${t('neg.common.cancel')}</button>
    </div>
  </div>`;
}

function ManualDoc({ d }) {
  const [m, setM] = useState({ kind: 'compromise', ref: '', date: '', title: '', classification: 'internal', tracks: ['council'] });
  const set = (k) => (e) => setM({ ...m, [k]: e.target.value });
  const create = () => {
    let id = null;
    mutate((x) => { const r = addManualDocument(x, m); id = r.docId; return r.dossier; }, t('neg.undo.manualDoc'));
    toast(t('neg.imp.manualCreated'), 'success', 5000);
    go({ view: 'synopse', nkt: null });
  };
  return html`<div class="nimp-sec">
    <p class="small muted nmax">${t('neg.imp.manualText')}</p>
    <div class="nform-row">
      <label class="field"><span class="field-label">${t('neg.imp.kind')}</span><select value=${m.kind} onChange=${set('kind')}>${DOC_KINDS.map((k) => html`<option value=${k}>${t('neg.docKind.' + k)}</option>`)}</select></label>
      <label class="field"><span class="field-label">${t('neg.imp.ref')}</span><input type="text" value=${m.ref} onInput=${set('ref')} /></label>
      <label class="field"><span class="field-label">${t('neg.imp.date')}</span><input type="date" value=${m.date} onInput=${set('date')} /></label>
      <label class="field"><span class="field-label">${t('neg.imp.class')}</span><select value=${m.classification} onChange=${set('classification')}>${CLASSIFICATIONS.map((k) => html`<option value=${k}>${t('neg.class.' + k)}</option>`)}</select></label>
    </div>
    <div class="field"><span class="field-label" id="lbl-mtr">${t('neg.imp.manualTracks')}</span>
      <div class="trk-toggles" role="group" aria-labelledby="lbl-mtr">${d.tracks.map((x) => { const on = m.tracks.includes(x.id); return html`<button type="button" class="trk-btn" aria-pressed=${on ? 'true' : 'false'} style=${{ '--trk': trackColor(d, x.id) }} onClick=${() => setM({ ...m, tracks: on ? m.tracks.filter((y) => y !== x.id) : [...m.tracks, x.id] })}><span class="trk-check" aria-hidden="true">${on ? '✓' : ''}</span>${trackName(d, x.id)}</button>`; })}</div></div>
    <div class="nform-actions"><button type="button" class="btn btn-primary" disabled=${!m.tracks.length} onClick=${create}><${Icon} name="plus" />${t('neg.imp.manualCreate')}</button></div>
  </div>`;
}

function DocList({ d }) {
  const docs = docsByDate(d).slice().reverse();
  if (!docs.length) return null;
  const remove = async (doc) => {
    const ok = await confirmDialog({ title: t('neg.imp.removeTitle'), text: t('neg.imp.removeText', { doc: docLabel(doc) }), ok: t('neg.imp.remove'), danger: true });
    if (ok) mutate((x) => removeDocument(x, doc.id), t('neg.undo.removeDoc', { doc: doc.ref || doc.id }));
  };
  return html`<section class="ndocs" aria-labelledby="ndocs-h">
    <h2 class="nsec-h" id="ndocs-h">${t('neg.imp.docsHead', { n: docs.length })}</h2>
    <div class="tbl-scroll"><table class="tbl-data">
      <thead><tr><th>${t('neg.imp.ref')}</th><th>${t('neg.imp.kind')}</th><th>${t('neg.imp.date')}</th><th>${t('neg.syn.tracks')}</th><th class="num">${t('neg.dossiers.colRows')}</th><th>${t('neg.imp.class')}</th><th>${t('neg.imp.file')}</th><th><span class="sr">${t('neg.dossiers.colActions')}</span></th></tr></thead>
      <tbody>${docs.map((doc) => html`<tr>
        <td><b>${doc.ref || '–'}</b>${doc.title ? html`<span class="nlist-sub" lang="en" title=${doc.title}>${doc.title.length > 90 ? doc.title.slice(0, 88) + ' …' : doc.title}</span>` : null}${doc.warnings && doc.warnings.length ? html`<span class="nlist-sub warn-text" title=${doc.warnings.map(warnText).join('\n')}>${t('neg.imp.warnCount', { n: doc.warnings.length })}</span>` : null}</td>
        <td>${t('neg.docKind.' + (doc.kind || 'other'))}${doc.manual ? html` <span class="tag tag-src">${t('neg.syn.manual')}</span>` : null}</td>
        <td class="nw">${doc.date ? fmtDate(doc.date) : '–'}</td>
        <td><span class="ntrk-list">${(doc.tracks || []).map((x) => html`<span class="trk" style=${{ '--trk': trackColor(d, x) }}><span class="trk-sw" aria-hidden="true"></span>${trackName(d, x)}</span>`)}</span></td>
        <td class="num">${doc.stats && doc.stats.rows != null ? fmtNum(doc.stats.rows) : '–'}</td>
        <td><${ClassTag} c=${doc.classification} /></td>
        <td class="small">${doc.file ? doc.file.name : '–'}</td>
        <td class="nlist-act">
          <button type="button" class="btn btn-tertiary btn-sm" onClick=${() => go({ view: 'import', nkt: 'changes', po: doc.id })}>${t('neg.imp.whatsNew')}</button>
          <button type="button" class="btn-icon is-bare btn-danger-ghost" title=${t('neg.imp.removeOf', { doc: doc.ref || doc.id })} aria-label=${t('neg.imp.removeOf', { doc: doc.ref || doc.id })} onClick=${() => remove(doc)}><${Icon} name="trash" /></button>
        </td>
      </tr>`)}</tbody>
    </table></div>
  </section>`;
}

/** "Was ist neu in dieser Fassung": Änderungen je Spur gegenüber der jeweils letzten früheren Fassung. */
export function changesOf(d, docId) {
  const doc = d.documents.find((x) => x.id === docId);
  if (!doc) return [];
  return (doc.tracks || []).map((tid) => ({ track: tid, items: changesBetween(d, null, docId, tid, { clean: true }) }));
}
function ChangesView({ d, docId }) {
  const doc = d.documents.find((x) => x.id === docId);
  const groups = useMemo(() => changesOf(d, docId), [d, docId]);
  const [only, setOnly] = useState('all');
  if (!doc) return html`<div class="view"><main class="wide" id="main"><p>${t('neg.imp.docMissing')}</p></main></div>`;
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return html`<div class="view"><main class="wide" id="main" tabindex="-1">
    <${PageHead} compact kicker=${t('neg.imp.whatsNew')} title=${docLabel(doc)} help=${html`<${HelpLink} view="n-anleitung" sec="neu" />`}>
      <p class="nhead-lead">${t('neg.imp.changesLead', { n: total })}</p>
    </${PageHead}>
    ${lastImport && lastImport.docId === docId && lastImport.skipped ? html`<div class="nconf"><${Notice} kind="info">${t('neg.imp.skippedInfo', { n: lastImport.skipped })}</${Notice}></div>` : null}
    <div class="toolbar nd-toolbar">
      <${Seg} label=${t('neg.imp.showLabel')} value=${only} onChange=${setOnly} options=${['all', 'changed', 'new', 'removed', 'status'].map((x) => ({ value: x, label: t('neg.imp.chg.' + x) }))} />
      <span class="spacer"></span>
      <${CardMenu} model=${() => changesModel(d, docId, groups, only)} name=${`${t('neg.cm.fileChanges')}_${doc.ref || docId}`} title=${docLabel(doc)} />
      <button type="button" class="btn btn-tertiary" onClick=${() => go({ view: 'druck', pv: 'changes', po: docId })}><${Icon} name="print" />${t('neg.imp.printChanges')}</button>
      <button type="button" class="btn btn-secondary" onClick=${() => go({ view: 'synopse', nfc: prevDocOf(d, docId), nkt: null, po: null, nd: 'prev' })}><${Icon} name="columns" />${t('neg.imp.toSynopsis')}</button>
    </div>
    ${groups.map((g) => { const items = g.items.filter((x) => only === 'all' || x.change === only); return html`<section class="nchg-sec" aria-label=${trackName(d, g.track)}>
      <h2 class="nsec-h"><span class="trk" style=${{ '--trk': trackColor(d, g.track) }}><span class="trk-sw" aria-hidden="true"></span>${trackName(d, g.track)}</span> <span class="muted nsec-n">${t('neg.imp.nChanges', { n: items.length })}</span></h2>
      ${items.length ? html`<ol class="nchg">${items.map((x) => html`<li class="nchg-item">
        <div class="nchg-head"><button type="button" class="link" onClick=${() => go({ view: 'synopse', r: x.row, nkt: null, po: null })}>${x.num ? x.num + ' | ' : ''}${x.label}</button><span class=${'nchk-kind k-' + (x.change === 'removed' ? 'ambiguous' : x.change)}>${t('neg.imp.chg.' + x.change)}</span>${x.change === 'status' ? html`<${StatusBadge} status=${x.b && x.b.status} />` : null}</div>
        <div class="ncell legal" lang="en" dangerouslySetInnerHTML=${{ __html: x.change === 'changed' ? x.diff.redline : x.change === 'new' ? '<ins>' + sanitizeInline(x.b.html) + '</ins>' : x.change === 'removed' ? '<del>' + sanitizeInline(x.a.html) + '</del>' : sanitizeInline((x.b || x.a).html) }}></div>
      </li>`)}</ol>` : html`<p class="muted">${t('neg.imp.noChanges')}</p>`}
    </section>`; })}
  </main></div>`;
}
function prevDocOf(d, docId) {
  const l = docsByDate(d);
  const i = l.findIndex((x) => x.id === docId);
  return i > 0 ? l[i - 1].id : null;
}
export { dossierStore };
