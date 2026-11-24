// Gemeinsame Bausteine des Moduls Verhandlung: Etiketten (Status, Haltung, Priorität, Spur), Zellen, Dossierleiste, Dialoge.
import { CARBON, ACT_SPARE } from '../../tokens.js';
import { html } from 'htm/preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { t, uiLang } from '../../lib/i18n.js';
import { go, getState, createStore } from '../../state.js';
import { Icon, Notice, Modal as BaseModal } from '../../ui/common.js';
import { fmtDate, fmtTime } from '../../lib/format.js';
import { dossierStore, saveStore, undoStore, undo, listStore, exportProjectFile, syncFromRoute } from './store.js';
import { sanitizeInline, topClassification, visibleRowId } from './core.js';
import { ByBadge } from './by.js';

// Spurfarben aus dem Design System Carbon (track-*-Tokens); weitere Spuren aus der Carbon-Palette
export const TRACK_COLORS = { com: CARBON['track-com'], ep: CARBON['track-ep'], council: CARBON['track-council'], agreement: CARBON['track-agreement'] };
const EXTRA = [CARBON['ink-muted'], ...ACT_SPARE];
export function trackColor(d, id) {
  if (TRACK_COLORS[id]) return TRACK_COLORS[id];
  const i = d ? d.tracks.findIndex((x) => x.id === id) : 0;
  return EXTRA[Math.max(0, i) % EXTRA.length];
}
export function trackName(d, id) {
  const tr = d && d.tracks.find((x) => x.id === id);
  if (!tr) return id;
  const l = tr.label || {};
  return l[uiLang()] || l.de || l.en || id;
}
export function TrackLabel({ d, id }) {
  return html`<span class="trk" style=${{ '--trk': trackColor(d, id) }}><span class="trk-sw" aria-hidden="true"></span>${trackName(d, id)}</span>`;
}

// ------------------------------------------------------------------ Etiketten
const STATUS_SYM = { agreed: '✓', provisional: '≈', open: '○', deleted: '–' };
export function StatusBadge({ status, compact }) {
  if (!status) return null;
  return html`<span class=${'nst nst-' + status + (compact ? ' is-compact' : '')} title=${compact ? t('neg.status.' + status) : undefined}><span class="nst-sym" aria-hidden="true">${STATUS_SYM[status] || '•'}</span><span class=${compact ? 'sr' : ''}>${t('neg.status.' + status)}</span></span>`;
}
const STANCE_SYM = { support: '✓', 'support-with-changes': '≈', scrutiny: '?', reservation: '!', oppose: '✕', none: '–' };
export function StanceTag({ stance }) {
  const s = stance || 'none';
  return html`<span class=${'nstance ns-' + s}><span class="nstance-sym" aria-hidden="true">${STANCE_SYM[s]}</span>${t('neg.stance.' + s)}</span>`;
}
export function PriorityTag({ priority }) {
  if (!priority) return null;
  return html`<span class=${'nprio np-' + priority}>${priority === 'redline' ? html`<${Icon} name="flag" />` : null}${t('neg.priority.' + priority)}</span>`;
}
const DEC_SYM = { accepted: '✓', partly: '±', rejected: '✕', noted: 'i', open: '…' };
export function DecisionTag({ decision }) {
  const d = decision || 'open';
  return html`<span class=${'ndec nd-' + d}><span class="ndec-sym" aria-hidden="true">${DEC_SYM[d]}</span>${t('neg.decision.' + d)}</span>`;
}
export function ClassTag({ c }) {
  if (!c) return null;
  return html`<span class=${'nclass nc-' + c}>${c !== 'public' ? html`<${Icon} name="lock" />` : null}${t('neg.class.' + c)}</span>`;
}
export const RowId = ({ id }) => html`<span class="rowid">${visibleRowId(id)}</span>`;

/** Rechtstext einer Zelle (Englisch), Auszeichnung der Quelle bleibt erhalten (b i u s sup sub br). */
export function CellHtml({ h, className = '', diff }) {
  return html`<div class=${'ncell legal ' + className} lang="en" dangerouslySetInnerHTML=${{ __html: diff ? h : sanitizeInline(h || '') }}></div>`;
}

// ------------------------------------------------------------------ Dokumente
export function docShort(doc) {
  if (!doc) return '';
  return doc.ref || t('neg.docKind.' + (doc.kind || 'other'));
}
export function docLabel(doc, { date = true } = {}) {
  if (!doc) return '';
  const k = t('neg.docKind.' + (doc.kind || 'other'));
  const ref = doc.ref ? `${doc.ref}` : k;
  return `${ref}${date && doc.date ? ` (${fmtDate(doc.date)})` : ''}${doc.ref ? `, ${k}` : ''}`;
}

// ------------------------------------------------------------------ Dossier-Kontext
/** Aktives Dossier aus dem Hash; lädt nach. */
export function useDossier(route) {
  const d = dossierStore.use();
  useEffect(() => { if (route.ds && (!d || d.id !== route.ds)) syncFromRoute(); }, [route.ds]);
  return d && route.ds && d.id === route.ds ? d : null;
}

/** Leerer Zustand, wenn kein Dossier gewählt ist. */
export function NoDossier({ route }) {
  const list = listStore.use();
  const loading = route.ds && !dossierStore.get();
  return html`<div class="view"><main class="wide narrow" id="main" tabindex="-1">
    ${loading ? html`<p class="muted">${t('common.loading')}</p>` : html`<div class="neg-empty">
      <h1 class="neg-empty-title">${t('neg.noDossier.title')}</h1>
      <p>${list.items.length ? t('neg.noDossier.textList') : t('neg.noDossier.textNone')}</p>
      <div class="neg-actions"><a class="btn btn-primary" href="#/dossiers" onClick=${(e) => { e.preventDefault(); go({ view: 'dossiers', ds: null, r: null }); }}><${Icon} name="folder" />${t('neg.noDossier.go')}</a></div>
    </div>`}
  </main></div>`;
}

function SaveState() {
  const s = saveStore.use();
  const dbOk = listStore.use().dbOk;
  if (!dbOk || s.state === 'error') return html`<span class="nsave is-error" role="status" title=${t('neg.save.errorTip')}><${Icon} name="warning" />${t('neg.save.error')}</span>`;
  if (s.state === 'dirty' || s.state === 'saving') return html`<span class="nsave" role="status"><span class="nsave-dot is-busy" aria-hidden="true"></span>${t('neg.save.saving')}</span>`;
  if (s.state === 'saved') return html`<span class="nsave is-ok" role="status"><${Icon} name="check" />${t('neg.save.saved', { time: fmtTime(s.at) })}</span>`;
  return html`<span class="nsave is-ok" role="status"><${Icon} name="check" />${t('neg.save.stored')}</span>`;
}

/** Leiste unter dem Kopf: aktives Dossier, Einstufung, Speicherstatus, Rückgängig, Projektdatei. */
export function DossierBar({ route }) {
  const d = dossierStore.use();
  const u = undoStore.use();
  if (!d || route.ds !== d.id || route.view === 'dossiers' || route.view === 'n-anleitung') return null;
  const cls = topClassification(d);
  const last = u[u.length - 1];
  return html`<div class="dbar" role="region" aria-label=${t('neg.bar.label')}>
    <div class="dbar-id">
      <a class="dbar-back" href="#/dossiers" onClick=${(e) => { e.preventDefault(); go({ view: 'dossiers', r: null }); }} title=${t('neg.bar.all')} aria-label=${t('neg.bar.all')}><${Icon} name="folder" /></a>
      <span class="dbar-title uc" title=${d.title}>${d.short || d.title || d.id}</span>
      ${d.procedure ? html`<span class="dbar-proc">${d.procedure}</span>` : null}
      ${d.demo ? html`<span class="tag tag-demo">${t('neg.demo.tag')}</span>` : null}
      <${ClassTag} c=${cls} />
    </div>
    <div class="dbar-tools">
      <${SaveState} />
      <${ByBadge} />
      <button type="button" class="btn btn-tertiary btn-sm" disabled=${!last} title=${last ? t('neg.undo.tip', { what: last.label }) : t('neg.undo.none')} onClick=${undo}><${Icon} name="undo" />${t('neg.undo.label')}</button>
      <button type="button" class="btn btn-tertiary btn-sm" id="dbar-merge" aria-current=${route.view === 'zusammenfuehren' ? 'page' : undefined} onClick=${() => go({ view: 'zusammenfuehren', r: null })} title=${t('neg.merge.tip')}><${Icon} name="merge" />${t('neg.merge.short')}</button>
      <button type="button" class="btn btn-tertiary btn-sm" onClick=${() => exportProjectFile(d)} title=${t('neg.project.exportTip')}><${Icon} name="save" />${t('neg.project.export')}</button>
    </div>
  </div>`;
}

// ------------------------------------------------------------------ Dialoge
/** Modaler Dialog mit Fokusführung; Esc schliesst. Gemeinsamer Baustein in ui/common.js (Modal), hier mit dem Schliessen-Text des Moduls. */
export function Modal(props) {
  return html`<${BaseModal} ...${props} closeLabel=${t('neg.common.close')} />`;
}

const confirmStore = createStore(null);
/** Rückfrage; liefert Promise<boolean>. */
export function confirmDialog({ title, text, ok, danger }) {
  return new Promise((resolve) => confirmStore.set({ title, text, ok, danger, resolve }));
}
export function ConfirmHost() {
  const c = confirmStore.use();
  if (!c) return null;
  const done = (v) => { confirmStore.set(null); c.resolve(v); };
  return html`<${Modal} title=${c.title} id="nconfirm" onClose=${() => done(false)} foot=${html`
    <button type="button" class=${'btn ' + (c.danger ? 'btn-danger' : 'btn-primary')} onClick=${() => done(true)} autofocus>${c.ok || t('neg.common.ok')}</button>
    <button type="button" class="btn btn-tertiary" onClick=${() => done(false)}>${t('neg.common.cancel')}</button>`}>
    <p class="modal-text">${c.text}</p>
  </${Modal}>`;
}

// ------------------------------------------------------------------ Kleinteile
export function PageHead({ kicker, title, children, help, compact }) {
  return html`<header class=${'nhead' + (compact ? ' is-compact' : '')}>
    <div class="nhead-text">${kicker ? html`<p class="unit-label uc">${kicker}</p>` : null}<h1 class="nhead-title">${title}</h1>${children}</div>
    ${help ? html`<div class="nhead-help">${help}</div>` : null}
  </header>`;
}
export function Figures({ items }) {
  return html`<div class="nfigs">${items.map((x) => html`<div class=${'nfig' + (x.warn ? ' is-warn' : '')}>
    ${x.onClick ? html`<button type="button" class="nfig-btn" onClick=${x.onClick} title=${x.tip || x.label}><span class="nfig-v">${x.v}</span><span class="nfig-l">${x.label}</span></button>`
      : html`<span class="nfig-v">${x.v}</span><span class="nfig-l">${x.label}</span>`}
    ${x.sub ? html`<span class="nfig-s">${x.sub}</span>` : null}
  </div>`)}</div>`;
}
/** Datei-Ablage (Drag and Drop oder Auswahl). */
export function DropZone({ accept, multiple, onFiles, label, hint, busy, id }) {
  const [over, setOver] = useState(false);
  const inp = useRef();
  return html`<div class=${'drop' + (over ? ' is-over' : '') + (busy ? ' is-busy' : '')} onDragOver=${(e) => { e.preventDefault(); setOver(true); }} onDragLeave=${() => setOver(false)}
    onDrop=${(e) => { e.preventDefault(); setOver(false); if (!busy && e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]); }}>
    <${Icon} name="upload" />
    <p>${label}</p>
    ${hint ? html`<p class="small muted">${hint}</p>` : null}
    <input type="file" class="sr" id=${id} ref=${inp} accept=${accept} multiple=${multiple} disabled=${busy} onChange=${(e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) onFiles(f); }} />
    <button type="button" class="btn btn-secondary" disabled=${busy} onClick=${() => inp.current.click()}><${Icon} name="file" />${t('neg.common.chooseFile')}</button>
  </div>`;
}
export const fmtDateTime = (iso) => (iso ? `${fmtDate(iso.slice(0, 10))}, ${fmtTime(new Date(iso))}` : '');
export const routeGo = (patch, opts) => go(patch, opts);
export { Notice, getState };

/** Aufklappbereich hinter einer Schaltfläche (z. B. Anzeigeoptionen); schliesst bei Klick ausserhalb und mit Esc. */
export function Popover({ label, icon, id, children, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  // useLayoutEffect: Escape und Klick daneben wirken, sobald der Bereich im DOM ist
  useLayoutEffect(() => {
    if (!open) return undefined;
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = (e) => { if (e.key === 'Escape') { setOpen(false); const b = ref.current && ref.current.querySelector('button'); if (b) b.focus(); } };
    document.addEventListener('mousedown', f);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', f); document.removeEventListener('keydown', k); };
  }, [open]);
  return html`<div class="menu npop" ref=${ref}>
    <button type="button" class="btn btn-tertiary btn-sm" id=${id} aria-expanded=${open ? 'true' : 'false'} aria-controls=${id + '-pop'} onClick=${() => setOpen(!open)}>${icon ? html`<${Icon} name=${icon} />` : null}${label}<${Icon} name="chevron-down" /></button>
    ${open ? html`<div class="menu-pop npop-pop menu-${align}" id=${id + '-pop'}>${children}</div>` : null}
  </div>`;
}
