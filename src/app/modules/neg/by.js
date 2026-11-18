// Kürzel der bearbeitenden Person (Verlaufseinträge `by`): Abfrage einmal (beim ersten Speichern einer Position oder beim Öffnen des
// Zusammenführens), Anzeige und Änderung in der Dossierleiste. Speicher: src/app/lib/user.js (gemeinsamer Vertrag SPEC3 §5).
import { html } from 'htm/preact';
import { useEffect, useState } from 'preact/hooks';
import { t } from '../../lib/i18n.js';
import { createStore } from '../../state.js';
import { Icon } from '../../ui/common.js';
import { getBy, setBy, onByChange } from '../../lib/user.js';
import { Modal } from './ui.js';

const askStore = createStore(null);
let skipped = false; // «ohne Kürzel weiter» gilt für die laufende Sitzung
let seq = 0;

/** Aktuelles Kürzel als Hook. */
export function useBy() {
  const [v, setV] = useState(getBy());
  useEffect(() => onByChange((x) => setV(x)), []);
  return v;
}

/**
 * Kürzel sicherstellen: liefert Promise<string> (leer, wenn die Person ohne Kürzel weiterarbeitet).
 * force: auch fragen, wenn schon ein Kürzel gesetzt ist (Ändern).
 */
export function ensureBy({ force = false, reason = 'save' } = {}) {
  const cur = getBy();
  if (!force && (cur || skipped)) return Promise.resolve(cur);
  return new Promise((resolve) => askStore.set({ resolve, reason, value: cur, seq: ++seq }));
}

/** Dialog zur Abfrage des Kürzels (im Host des Moduls eingehängt). */
export function ByHost() {
  const a = askStore.use();
  return a ? html`<${ByDialog} key=${a.seq} a=${a} />` : null;
}
function ByDialog({ a }) {
  const [v, setV] = useState(a.value || '');
  const done = (val, skip) => { askStore.set(null); if (skip) { skipped = true; a.resolve(getBy()); return; } a.resolve(setBy(val)); };
  const ok = (e) => { e && e.preventDefault(); if (v.trim()) done(v.trim()); };
  return html`<${Modal} title=${t('neg.by.title')} id="nby" onClose=${() => done('', true)} foot=${html`
    <button type="submit" form="nby-form" class="btn btn-primary" id="by-ok" disabled=${!v.trim()}><${Icon} name="check" />${t('neg.by.ok')}</button>
    <button type="button" class="btn btn-tertiary" id="by-skip" onClick=${() => done('', true)}>${a.value ? t('neg.common.cancel') : t('neg.by.skip')}</button>`}>
    <p class="modal-text">${t(a.reason === 'merge' ? 'neg.by.textMerge' : 'neg.by.text')}</p>
    <form id="nby-form" onSubmit=${ok}>
      <label class="field"><span class="field-label">${t('neg.by.label')}</span>
        <input type="text" id="by-input" size="12" maxlength="24" autocomplete="off" value=${v} onInput=${(e) => setV(e.target.value)} placeholder=${t('neg.by.ph')} autofocus /></label>
    </form>
    <p class="small muted nby-note">${t('neg.by.note')}</p>
  </${Modal}>`;
}

/** Anzeige in der Dossierleiste: Kürzel mit Schaltfläche zum Ändern. */
export function ByBadge() {
  const by = useBy();
  return html`<button type="button" class="btn btn-ghost is-bare btn-sm nby-btn" id="by-badge" onClick=${() => ensureBy({ force: true })}
    title=${by ? t('neg.by.changeTip', { by }) : t('neg.by.setTip')} aria-label=${by ? t('neg.by.changeTip', { by }) : t('neg.by.setTip')}>
    <${Icon} name="user" />${by ? html`<span class="nby-v">${by}</span>` : t('neg.by.none')}</button>`;
}

/** Kürzel im Verlauf (klein, hinter dem Zeitpunkt). */
export const ByTag = ({ by }) => (by ? html`<span class="nby-tag" title=${t('neg.by.who', { by })}>${by}</span>` : null);
