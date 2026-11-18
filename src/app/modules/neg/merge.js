// Projektdatei zusammenführen (Etappe 3, SPEC3 §3.8): Datei einer Kollegin wählen (optional Stammdatei als Basis), Übersicht, Konflikte
// einzeln entscheiden, Sicherung, übernehmen, Zusammenfassung mit «Rückgängig». Der Import mit Überschreiben bleibt in «Dossiers».
import { html } from 'htm/preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { t, uiLang } from '../../lib/i18n.js';
import { go, createStore } from '../../state.js';
import { Icon, HelpLink, Seg } from '../../ui/common.js';
import { toast } from '../../app.js';
import { escapeHtml, fmtDate } from '../../lib/format.js';
import { mergeOverview, compareCells, htmlToText, visibleRowId, delegationsOf } from './core.js';
import { mutate, undo, undoStore, readProjectFile, exportProjectFile } from './store.js';
import { useDossier, NoDossier, PageHead, trackName, docLabel, fmtDateTime, Figures } from './ui.js';
import { ensureBy } from './by.js';

/** Zustand des Zusammenführens (nicht im Hash; Dateien bleiben im Speicher dieser Sitzung). */
export const mergeStore = createStore(null);

export function MergeView({ route }) {
  const d = useDossier(route);
  if (!d) return html`<${NoDossier} route=${route} />`;
  return html`<${Merge} d=${d} />`;
}

const TEXT_FIELDS = new Set(['text', 'proposal', 'fallback', 'owner', 'note', 'title', 'body', 'reply', 'comment', 'general', 'short', 'procedure']);
const seg = (p) => String(p).split('/');
const rowName = (d, other, rid) => {
  const r = d.rows.find((x) => x.id === rid) || ((other && other.rows) || []).find((x) => x.id === rid);
  return r ? `${r.num ? r.num + ' | ' : ''}${r.label || visibleRowId(r.id)}` : visibleRowId(rid);
};
const delegCode = (d, other, id) => {
  const g = delegationsOf(d).find((x) => x.id === id) || ((other && other.delegations) || []).find((x) => x.id === id);
  return g ? g.code : id;
};
const meetingName = (d, other, id) => {
  const m = (d.meetings || []).find((x) => x.id === id) || ((other && other.meetings) || []).find((x) => x.id === id);
  return m ? [m.date ? fmtDate(m.date) : '', m.title || m.body].filter(Boolean).join(', ') : id;
};
const docName = (d, other, id) => {
  const x = d.documents.find((y) => y.id === id) || ((other && other.documents) || []).find((y) => y.id === id);
  return x ? docLabel(x, { date: false }) : id;
};
const kName = (d, other, id) => {
  const k = (d.consultations || []).find((x) => x.id === id) || ((other && other.consultations) || []).find((x) => x.id === id);
  return k ? k.title : id;
};
const FIELD_KEYS = { stance: 'neg.pos.stance', priority: 'neg.pos.priority', text: 'neg.pos.text', proposal: 'neg.pos.proposal', fallback: 'neg.pos.fallback', owner: 'neg.pos.owner', basis: 'neg.pos.basis', outcome: 'neg.bal.outcome', history: 'neg.merge.field.history', updated: 'neg.merge.field.updated' };
const fieldName = (f) => (FIELD_KEYS[f] ? t(FIELD_KEYS[f]) : f);

/** Anzeigename eines Pfads (Konflikt-Id) in der Oberflächensprache. */
export function pathLabel(path, d, other) {
  const s = seg(path);
  switch (s[0]) {
    case 'positions': return s[2] ? t('neg.merge.p.positionField', { row: rowName(d, other, s[1]), field: fieldName(s[2]) }) : t('neg.merge.p.position', { row: rowName(d, other, s[1]) });
    case 'cells': return t('neg.merge.p.cell', { row: rowName(d, other, s[1]), track: trackName(d, s[2]), doc: docName(d, other, s[3]) });
    case 'rows': return t('neg.merge.p.row', { row: rowName(d, other, s[1]) });
    case 'stances': {
      const st = (((d.stances || {})[s[1]] || []).find((x) => x.id === s[2])) || ((((other && other.stances) || {})[s[1]] || []).find((x) => x.id === s[2]));
      return t('neg.merge.p.stance', { deleg: st ? delegCode(d, other, st.deleg) : s[2], row: rowName(d, other, s[1]) });
    }
    case 'interventions': {
      const x = (d.interventions || []).find((y) => y.id === s[1]) || ((other && other.interventions) || []).find((y) => y.id === s[1]);
      return t('neg.merge.p.intervention', { text: x ? clip(x.text, 50) : s[1] });
    }
    case 'meetings': return t('neg.merge.p.meeting', { name: meetingName(d, other, s[1]) });
    case 'delegations': return t('neg.merge.p.delegation', { code: delegCode(d, other, s[1]) });
    case 'documents': return t('neg.merge.p.document', { doc: docName(d, other, s[1]) });
    case 'tracks': return t('neg.merge.p.track', { track: trackName(d, s[1]) });
    case 'consultations': {
      const k = kName(d, other, s[1]);
      if (!s[2]) return t('neg.merge.p.round', { k });
      if (s[2] === 'decisions') return t('neg.merge.p.decision', { k, item: s[3] });
      if (s[2] === 'responses') return t('neg.merge.p.response', { k, id: s[3] });
      if (s[2] === 'offices') return t('neg.merge.p.office', { k, id: s[3] });
      return t('neg.merge.p.scope', { k });
    }
    case 'meta': return t('neg.merge.p.meta', { field: s[1] });
    default: return path;
  }
}
const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

/** Wert als lesbarer Text (für Anzeige und Wort-Diff). */
export function valueText(path, v, d, other) {
  if (v === undefined || v === null) return '';
  const s = seg(path);
  if (typeof v === 'string') {
    if (s[0] === 'positions' && s[2] === 'stance') return t('neg.stance.' + v);
    if (s[0] === 'positions' && s[2] === 'priority') return t('neg.priority.' + v);
    return v;
  }
  if (typeof v !== 'object') return String(v);
  if (s[0] === 'positions') {
    if (s[2] === 'basis') return v.track ? `${trackName(d, v.track)}: ${docName(d, other, v.doc)}` : '';
    if (s[2] === 'outcome') return [t('neg.outcome.' + v.status), v.note].filter(Boolean).join(' – ');
    if (s[2] === 'history') return t('neg.merge.histN', { n: Array.isArray(v) ? v.length : 0 });
    return [v.stance ? t('neg.stance.' + v.stance) : '', v.priority ? t('neg.priority.' + v.priority) : '', v.text, v.proposal].filter(Boolean).join(' | ');
  }
  if (s[0] === 'cells') return [v.empty ? t('neg.syn.cellEmpty') : (v.text || htmlToText(v.html || '')), v.status ? t('neg.status.' + v.status) : ''].filter(Boolean).join(' | ');
  if (s[0] === 'stances') return [`${delegCode(d, other, v.deleg)}: ${t('neg.dstance.' + v.stance)}`, v.text, v.meeting ? meetingName(d, other, v.meeting) : ''].filter(Boolean).join(' | ');
  if (s[0] === 'interventions') return [v.text, v.result ? t('neg.ivres.' + v.result) : '', v.note].filter(Boolean).join(' | ');
  if (s[0] === 'meetings') return [v.date ? fmtDate(v.date) : '', v.body, v.title, v.note].filter(Boolean).join(' | ');
  if (s[0] === 'delegations') return [v.code, (v.name && (v.name[uiLang()] || v.name.de)) || '', v.hidden ? t('neg.deleg.hidden') : ''].filter(Boolean).join(' | ');
  if (s[0] === 'documents') return [docLabel(v), v.note].filter(Boolean).join(' | ');
  if (s[0] === 'rows') return [v.num, v.label].filter(Boolean).join(' | ');
  if (s[0] === 'consultations' && s[2] === 'decisions') return [v.decision ? t('neg.decision.' + v.decision) : '', v.reply].filter(Boolean).join(' | ');
  if (s[0] === 'consultations' && !s[2]) return [v.title, v.deadline ? fmtDate(v.deadline) : ''].filter(Boolean).join(' | ');
  if (Array.isArray(v)) return t('neg.merge.listN', { n: v.length });
  try { return JSON.stringify(v); } catch { return String(v); }
}
const textual = (c) => (typeof c.mine === 'string' || c.mine === undefined) && (typeof c.theirs === 'string' || c.theirs === undefined) && TEXT_FIELDS.has(seg(c.path).slice(-1)[0]) && (c.mine || c.theirs);
const isoOr = (x) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(x) ? x : null);
const whenOf = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? isoOr(v.updated) || isoOr(v.at) : null);
const byOf = (v) => { if (!v || typeof v !== 'object' || Array.isArray(v)) return null; const b = v.by || (Array.isArray(v.history) && v.history.length ? v.history[v.history.length - 1].by : null); return typeof b === 'string' ? b : null; };

function Merge({ d }) {
  const st = mergeStore.use();
  const s = st && st.dossierId === d.id ? st : null;
  const set = (patch) => mergeStore.set({ ...(s || { dossierId: d.id, choice: {}, texts: {} }), ...patch });
  useEffect(() => { ensureBy({ reason: 'merge' }); }, []);
  const [busy, setBusy] = useState(false);
  const read = (which) => async (file) => {
    setBusy(true);
    try {
      const r = await readProjectFile(file);
      set({ [which]: r.dossier, [which + 'Name']: file.name, [which + 'Warn']: (r.warnings || []).length, choice: {}, texts: {}, done: null });
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };
  if (s && s.done) return html`<${MergeDone} d=${d} s=${s} reset=${() => mergeStore.set(null)} />`;
  return html`<div class="view"><main class="wide" id="main" tabindex="-1">
    <${PageHead} compact kicker=${d.short || d.title} title=${t('neg.merge.title')} help=${html`<${HelpLink} view="n-anleitung" sec="team" />`}>
      <p class="nhead-lead">${t('neg.merge.lead')}</p>
    </${PageHead}>
    <div class="nmerge-files">
      <${FilePick} id="merge-theirs" step="1" title=${t('neg.merge.theirsHead')} text=${t('neg.merge.theirsText')} name=${s && s.theirsName} dossier=${s && s.theirs} busy=${busy} onFile=${read('theirs')} onClear=${s && s.theirs ? () => set({ theirs: null, theirsName: null, choice: {}, texts: {} }) : null} />
      <${FilePick} id="merge-base" step="2" optional title=${t('neg.merge.baseHead')} text=${t('neg.merge.baseText')} name=${s && s.baseName} dossier=${s && s.base} busy=${busy} onFile=${read('base')} onClear=${s && s.base ? () => set({ base: null, baseName: null, choice: {}, texts: {} }) : null} />
    </div>
    <p class="small muted nmax nmerge-other">${t('neg.merge.otherAction')} <a href="#/dossiers" class="link" onClick=${(e) => { e.preventDefault(); go({ view: 'dossiers' }); }}>${t('neg.nav.dossiers')}</a></p>
    ${s && s.theirs ? html`<${MergeResult} d=${d} s=${s} set=${set} />` : null}
  </main></div>`;
}

function FilePick({ id, step, title, text, name, dossier, busy, onFile, onClear, optional }) {
  return html`<section class="nmerge-pick" aria-labelledby=${id + '-h'}>
    <h2 class="nsec-h" id=${id + '-h'}><span class="nsec-n">${step}</span>${title}${optional ? html`<span class="tag nmerge-opt">${t('neg.merge.optional')}</span>` : null}</h2>
    <p class="small nmax">${text}</p>
    ${dossier ? html`<div class="nmerge-file"><${Icon} name="file" /><div class="nmerge-file-t"><b class="uc">${name}</b>
        <span class="small muted">${dossier.short || dossier.title} | ${t('neg.merge.fileFacts', { docs: dossier.documents.length, pos: Object.keys(dossier.positions || {}).length, date: fmtDateTime(dossier.updated) })}</span></div>
        <button type="button" class="btn btn-tertiary btn-sm" onClick=${onClear}><${Icon} name="close" />${t('neg.merge.remove')}</button></div>`
      : html`<div class="neg-actions"><button type="button" class="btn btn-secondary nmerge-choose" id=${id + '-btn'} disabled=${busy} onClick=${() => document.getElementById(id).click()}><${Icon} name="upload" />${t('neg.merge.choose')}</button>
        <input type="file" class="sr" id=${id} accept=".json,application/json" disabled=${busy} onChange=${(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) onFile(f); }} /></div>`}
  </section>`;
}

function MergeResult({ d, s, set }) {
  const res = useMemo(() => {
    try { return mergeOverview(d, s.theirs, { base: s.base || null }); } catch (e) { console.error(e); return { error: e.message }; }
  }, [d, s.theirs, s.base]);
  const [limit, setLimit] = useState(40);
  const [backup, setBackup] = useState(true);
  if (res.error) return html`<div class="notice notice-error" role="alert"><${Icon} name="warning" /><div>${t('neg.merge.failed', { msg: res.error })}</div></div>`;
  const conflicts = res.conflicts;
  const choice = s.choice || {};
  const texts = s.texts || {};
  const decided = conflicts.filter((c) => choice[c.id]).length;
  const open = conflicts.length - decided;
  const setChoice = (id, v) => {
    const c = conflicts.find((x) => x.id === id);
    const nt = { ...texts };
    if (v === 'both' && nt[id] == null) nt[id] = [c.mine || '', c.theirs || ''].filter(Boolean).join('\n\n');
    set({ choice: { ...choice, [id]: v }, texts: nt });
  };
  const all = (v) => { const n = { ...choice }; for (const c of conflicts) if (!n[c.id]) n[c.id] = v; set({ choice: n }); };
  const warns = warningsOf(d, s, res);
  const L = res.lists;
  const same = !conflicts.length && !L.fromTheirs.length && !L.combined.length && !L.removed.length;
  const apply = async () => {
    if (open) return;
    if (backup) exportProjectFile(d);
    const resolutions = {};
    for (const c of conflicts) {
      const v = choice[c.id];
      resolutions[c.id] = v === 'both' ? { value: texts[c.id] || '' } : v;
    }
    let r;
    try { r = mergeOverview(d, s.theirs, { base: s.base || null, resolutions }); } catch (e) { toast(t('neg.merge.failed', { msg: e.message }), 'error'); return; }
    const merged = { ...r.merged, updated: new Date().toISOString() };
    mutate(() => merged, t('neg.undo.merge3', { file: s.theirsName }));
    set({ done: { at: new Date().toISOString(), counts: { theirs: L.fromTheirs.length, combined: L.combined.length, removed: L.removed.length, conflicts: conflicts.length, mine: L.fromMine.length, identical: r.applied.identical }, backup } });
    toast(t('neg.merge.applied'), 'success', 4000);
  };
  return html`
    ${warns.length ? html`<div class="nmerge-warn">${warns.map((w) => html`<div class=${'notice notice-' + w.kind} role="note"><${Icon} name=${w.kind === 'info' ? 'info' : 'warning'} /><div>${w.text}</div></div>`)}</div>` : null}
    <section class="nsec" aria-labelledby="mg-over-h">
      <h2 class="nsec-h" id="mg-over-h"><span class="nsec-n">3</span>${t('neg.merge.overview')}</h2>
      ${same ? html`<p class="nmax">${t('neg.merge.same')}</p>` : null}
      <${Figures} items=${[
        { v: L.fromTheirs.length, label: t('neg.merge.sum.theirs'), sub: t('neg.merge.sum.theirsSub') },
        { v: L.combined.length, label: t('neg.merge.sum.combined'), sub: t('neg.merge.sum.combinedSub') },
        { v: L.fromMine.length, label: t('neg.merge.sum.mine'), sub: t('neg.merge.sum.mineSub', { n: res.applied.identical }) },
        { v: conflicts.length, label: t('neg.merge.sum.conflicts'), sub: conflicts.length ? t('neg.merge.sum.open', { n: open }) : t('neg.merge.sum.none'), warn: open > 0 },
      ]} />
      <div class="nmerge-lists">
        <${PathList} id="mg-l-theirs" title=${t('neg.merge.list.theirs', { n: L.fromTheirs.length })} entries=${L.fromTheirs} d=${d} other=${s.theirs} />
        <${PathList} id="mg-l-comb" title=${t('neg.merge.list.combined', { n: L.combined.length })} entries=${L.combined} d=${d} other=${s.theirs} />
        <${PathList} id="mg-l-mine" title=${t('neg.merge.list.mine', { n: L.fromMine.length })} entries=${L.fromMine} d=${d} other=${s.theirs} />
        <${PathList} id="mg-l-rem" title=${t('neg.merge.list.removed', { n: L.removed.length })} entries=${L.removed} d=${d} other=${s.theirs} removed />
      </div>
    </section>
    <section class="nsec" aria-labelledby="mg-conf-h">
      <h2 class="nsec-h" id="mg-conf-h"><span class="nsec-n">4</span>${t('neg.merge.conflicts', { n: conflicts.length })}</h2>
      ${conflicts.length ? html`
        <p class="small nmax">${t('neg.merge.conflictsText')}</p>
        <div class="toolbar is-sm nmerge-bulk">
          <span class="tool-label" id="mg-prog">${t('neg.merge.progress', { n: decided, total: conflicts.length })}</span>
          <button type="button" class="btn btn-secondary btn-sm" id="mg-all-mine" disabled=${!open} onClick=${() => all('mine')}>${t('neg.merge.allMine')}</button>
          <button type="button" class="btn btn-secondary btn-sm" id="mg-all-theirs" disabled=${!open} onClick=${() => all('theirs')}>${t('neg.merge.allTheirs')}</button>
          <button type="button" class="btn btn-tertiary btn-sm" disabled=${!decided} onClick=${() => set({ choice: {}, texts: {} })}>${t('neg.merge.reset')}</button>
        </div>
        <ol class="nmc-list">${conflicts.slice(0, limit).map((c, i) => html`<${Conflict} key=${c.id} i=${i} c=${c} d=${d} s=${s} choice=${choice[c.id]} text=${texts[c.id]} setChoice=${setChoice} setText=${(v) => set({ texts: { ...texts, [c.id]: v } })} />`)}</ol>
        ${conflicts.length > limit ? html`<div class="syn-more"><button type="button" class="btn btn-tertiary" onClick=${() => setLimit(limit + 100)}>${t('neg.syn.more', { n: conflicts.length - limit })}</button></div>` : null}`
      : html`<p class="nmax">${t('neg.merge.noConflicts')}</p>`}
    </section>
    <section class="nsec" aria-labelledby="mg-apply-h">
      <h2 class="nsec-h" id="mg-apply-h"><span class="nsec-n">5</span>${t('neg.merge.applyHead')}</h2>
      <label class="check"><input type="checkbox" id="mg-backup" checked=${backup} onChange=${(e) => setBackup(e.target.checked)} />${t('neg.merge.backup')}</label>
      <div class="neg-actions">
        <button type="button" class="btn btn-primary" id="mg-apply" disabled=${!!open || same} onClick=${apply}><${Icon} name="merge" />${t('neg.merge.apply')}</button>
        ${open ? html`<span class="small warn-text">${t('neg.merge.openLeft', { n: open })}</span>` : null}
      </div>
    </section>`;
}

function warningsOf(d, s, res) {
  const out = [];
  for (const w of res.warnings || []) {
    if (w.code === 'dossier-id-differs') out.push({ kind: 'warning', text: t('neg.merge.warn.idDiffers', { a: d.short || d.id, b: s.theirs.short || s.theirs.id }) });
    else out.push({ kind: 'warning', text: t('neg.merge.warn.other', { code: w.code }) });
  }
  if (s.base && s.base.id !== d.id) out.push({ kind: 'warning', text: t('neg.merge.warn.baseId') });
  if (s.base && ((s.base.updated || '') > (d.updated || '') || (s.base.updated || '') > (s.theirs.updated || ''))) out.push({ kind: 'warning', text: t('neg.merge.warn.baseNewer') });
  if (!s.base) out.push({ kind: 'info', text: t('neg.merge.warn.noBase') });
  const mapped = Object.entries((res.mapping && res.mapping.docs) || {}).filter(([a, b]) => a !== b);
  if (mapped.length) out.push({ kind: 'info', text: t('neg.merge.warn.docsMapped', { list: mapped.map(([a, b]) => `${docName(s.theirs, null, a)} → ${b}`).join('; ') }) });
  const renamed = ['meetings', 'interventions', 'stances'].reduce((n, k) => n + Object.entries((res.mapping && res.mapping[k]) || {}).filter(([a, b]) => a !== b).length, 0);
  if (renamed) out.push({ kind: 'info', text: t('neg.merge.warn.renamed', { n: renamed }) });
  if (s.theirsWarn) out.push({ kind: 'info', text: t('neg.merge.warn.fileHints', { n: s.theirsWarn }) });
  return out;
}

function PathList({ id, title, entries, d, other, removed }) {
  if (!entries.length) return html`<p class="nmerge-l-empty small muted" id=${id}>${title}</p>`;
  return html`<details class="nmerge-l" id=${id}><summary>${title}</summary>
    <ul>${entries.slice(0, 300).map((e) => html`<li>${pathLabel(e.path, d, other)}${removed ? html` <span class="muted small">(${t(e.by === 'theirs' ? 'neg.merge.removedTheirs' : 'neg.merge.removedMine')})</span>` : e.kind === 'added' ? html` <span class="muted small">(${t('neg.merge.added')})</span>` : null}</li>`)}
    ${entries.length > 300 ? html`<li class="muted">${t('neg.merge.moreN', { n: entries.length - 300 })}</li>` : null}</ul></details>`;
}

function Conflict({ i, c, d, s, choice, text, setChoice, setText }) {
  const other = s.theirs;
  const mt = valueText(c.path, c.mine, d, other), tt = valueText(c.path, c.theirs, d, other), bt = c.base !== undefined ? valueText(c.path, c.base, d, other) : null;
  const diff = compareCells(escapeHtml(mt), escapeHtml(tt));
  const canBoth = textual(c);
  const opts = [{ value: 'mine', label: t('neg.merge.chooseMine') }, { value: 'theirs', label: t('neg.merge.chooseTheirs') }, ...(canBoth ? [{ value: 'both', label: t('neg.merge.chooseBoth') }] : [])];
  const legal = seg(c.path)[0] === 'cells' || /\/proposal$/.test(c.path);
  const side = (label, txt, v, cls) => html`<div class=${'nmc-side ' + cls}><p class="nmc-h">${label}${whenOf(v) ? html` <span class="muted">${fmtDateTime(whenOf(v))}</span>` : null}${byOf(v) ? html` <span class="nby-tag">${byOf(v)}</span>` : null}</p>
    ${v === undefined ? html`<p class="muted nmc-del">${t('neg.merge.deleted')}</p>` : html`<p class="nmc-v uc" lang=${legal ? 'en' : undefined}>${txt || html`<span class="muted">${t('neg.merge.emptyValue')}</span>`}</p>`}</div>`;
  return html`<li class=${'nmc' + (choice ? ' is-decided' : '')} id=${'mc-' + i}>
    <div class="nmc-head"><b class="nmc-label uc">${pathLabel(c.path, d, other)}</b><span class=${'tag nmc-kind is-' + c.kind}>${t('neg.merge.kind.' + c.kind)}</span>${choice ? html`<span class="nmc-ok"><${Icon} name="check" />${t('neg.merge.decided')}</span>` : null}</div>
    <div class=${'nmc-grid' + (bt !== null ? ' has-base' : '')}>
      ${bt !== null ? side(t('neg.merge.base'), bt, c.base, 'is-base') : null}
      ${side(t('neg.merge.mine'), mt, c.mine, 'is-mine')}
      ${side(t('neg.merge.theirs'), tt, c.theirs, 'is-theirs')}
    </div>
    ${mt && tt && diff.changed ? html`<div class="nmc-diff"><p class="nmc-h">${t('neg.merge.diff')}</p><div class="ncell nmc-diff-t uc" lang=${legal ? 'en' : undefined} dangerouslySetInnerHTML=${{ __html: diff.redline }}></div></div>` : null}
    <div class="nmc-choose"><span class="field-label" id=${'mcl-' + i}>${t('neg.merge.decision')}</span>
      <${Seg} labelledby=${'mcl-' + i} size="sm" value=${choice || ''} onChange=${(v) => setChoice(c.id, v)} options=${opts} /></div>
    ${choice === 'both' ? html`<label class="field field-wide nmc-edit"><span class="field-label">${t('neg.merge.editBoth')}</span><textarea rows="5" id=${'mc-text-' + i} lang=${legal ? 'en' : undefined} value=${text || ''} onInput=${(e) => setText(e.target.value)}></textarea></label>` : null}
  </li>`;
}

function MergeDone({ d, s, reset }) {
  const u = undoStore.use();
  const canUndo = u.length && u[u.length - 1].label === t('neg.undo.merge3', { file: s.theirsName });
  const c = s.done.counts;
  return html`<div class="view"><main class="wide" id="main" tabindex="-1">
    <${PageHead} compact kicker=${d.short || d.title} title=${t('neg.merge.doneTitle')} help=${html`<${HelpLink} view="n-anleitung" sec="team" />`}>
      <p class="nhead-lead">${t('neg.merge.doneLead', { file: s.theirsName, time: fmtDateTime(s.done.at) })}</p>
    </${PageHead}>
    <${Figures} items=${[
      { v: c.theirs, label: t('neg.merge.sum.theirs') }, { v: c.combined, label: t('neg.merge.sum.combined') },
      { v: c.conflicts, label: t('neg.merge.sum.decided') }, { v: c.removed, label: t('neg.merge.sum.removed') },
    ]} />
    ${s.done.backup ? html`<p class="small muted nmax">${t('neg.merge.backupDone')}</p>` : null}
    <div class="neg-actions">
      <a class="btn btn-primary" href="#/synopse" onClick=${(e) => { e.preventDefault(); reset(); go({ view: 'synopse', r: null }); }}><${Icon} name="columns" />${t('neg.merge.toSynopsis')}</a>
      <button type="button" class="btn btn-secondary" id="mg-undo" disabled=${!canUndo} onClick=${() => { undo(); reset(); }}><${Icon} name="undo" />${t('neg.merge.undo')}</button>
      <button type="button" class="btn btn-tertiary" onClick=${reset}><${Icon} name="merge" />${t('neg.merge.again')}</button>
    </div>
  </main></div>`;
}
