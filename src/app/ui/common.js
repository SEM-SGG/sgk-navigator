// Generische Bausteine der Oberfläche.
//
// Schaltflächen-System nach Carbon (styles.css, design/carbon/components/Button):
//   .btn.btn-primary    Primär (IBM Blue), höchstens eine je Bereich
//   .btn.btn-tertiary   Carbon Sekundär (Charcoal), Nebenaktion
//   .btn.btn-secondary  Carbon Tertiär (blauer Rahmen)
//   .btn.btn-ghost      Ghost (Primärblau ohne Rahmen), nur mit Icon und Text; .is-bare markiert bewusst rahmenlose Schaltflächen
//   .btn-danger, .btn-danger-ghost  Löschen (gefüllt bzw. Ghost in error-text)
//   .btn-sm / Standard / .btn-lg   32 / 40 / 48 px hoch
//   .btn-icon           Icon mit blauem Rahmen; .btn-icon.is-bare Ghost-Icon (z. B. Schliessen)
//   .link               Textlink im Fliesstext (unterstrichen)
//   Seg                 SegmentedControl (aria-pressed)
//   .chip, .tag         nicht interaktive Kennzeichnungen (Akt, Status); button.chip ist interaktiv
import { html } from 'htm/preact';
import { render } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { t, uiLang } from '../lib/i18n.js';
import { go } from '../state.js';
import { safeInline, titleInline } from '../lib/sanitize.js';

export const Icon = ({ name, label }) => html`<svg class="ico" aria-hidden=${label ? undefined : 'true'} role=${label ? 'img' : undefined} aria-label=${label}><use href=${'#' + name}></use></svg>`;

/** Farbfeld eines Akts; schraffiert, wenn noch nicht anwendbar. */
export function Swatch({ data, celex, pending }) {
  const p = pending ?? data.isPending(celex);
  return html`<span class=${'sw' + (p ? ' sw-pending' : '')} style=${{ '--act': data.color(celex) }} aria-hidden="true"></span>`;
}

/** Aktkürzel mit Farbe; optional mit Nummer. */
export function ActChip({ data, celex, number = false, title, onClick, active, small }) {
  const a = data.act(celex);
  const pending = data.isPending(celex);
  const label = data.actCode(celex);
  const topic = a && a.topic ? data.loc(a.topic) : '';
  const tip = title || `${data.actName(celex)}${topic && topic !== label ? ' (' + topic + ')' : ''}${pending ? ', ' + data.status(celex).label : ''}`;
  const num = data.actNum(celex);
  const inner = html`<${Swatch} data=${data} celex=${celex} pending=${pending} /><span class="chip-code">${label}</span>${number && a && a.kind !== 'base' && a.kind !== 'consolidated' && num && label !== num ? html`<span class="chip-num">${num}</span>` : null}`;
  const cls = 'chip' + (pending ? ' chip-pending' : '') + (active ? ' is-active' : '') + (small ? ' chip-sm' : '');
  return onClick
    ? html`<button type="button" class=${cls + ' chip-btn'} title=${tip} aria-pressed=${active ? 'true' : 'false'} onClick=${onClick}>${inner}</button>`
    : html`<span class=${cls} title=${tip}>${inner}</span>`;
}

export function StatusTag({ data, celex }) {
  const st = data.status(celex);
  if (!st.label) return null;
  const cls = st.kind === 'applicable' ? 'tag tag-ok' : st.kind === 'partly' ? 'tag tag-partly' : st.kind === 'proposal' ? 'tag tag-proposal' : 'tag tag-pending';
  return html`<span class=${cls}>${st.label}</span>`;
}

/** Segmentierter Umschalter */
export function Seg({ value, options, onChange, label, labelledby, size }) {
  return html`<div class=${'seg' + (size === 'sm' ? ' seg-sm' : '')} role="group" aria-label=${labelledby ? undefined : label} aria-labelledby=${labelledby}>
    ${options.map((o) => html`<button type="button" aria-pressed=${value === o.value ? 'true' : 'false'} disabled=${o.disabled} title=${o.title} aria-label=${o.aria} lang=${o.lang} onClick=${() => onChange(o.value)}>${o.label}</button>`)}
  </div>`;
}

export function Field({ label, children, wide }) {
  return html`<label class=${'field' + (wide ? ' field-wide' : '')}><span class="field-label">${label}</span>${children}</label>`;
}

export function Notice({ kind = 'info', title, children, icon }) {
  return html`<div class=${'notice notice-' + kind} role=${kind === 'error' ? 'alert' : 'note'}>
    <${Icon} name=${icon || (kind === 'warning' || kind === 'computed' ? 'warning' : kind === 'error' ? 'warning' : kind === 'success' ? 'check-circle' : 'info')} />
    <div>${title ? html`<strong>${title}</strong> ` : null}${children}</div>
  </div>`;
}

/** Aufklappmenü (Exportformate) */
export function Menu({ label, icon, items, align = 'left', className = '', variant = 'secondary', small }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = (e) => { if (e.key === 'Escape') { setOpen(false); const b = ref.current && ref.current.querySelector('button'); if (b) b.focus(); } };
    document.addEventListener('mousedown', f);
    document.addEventListener('keydown', k);
    const first = ref.current && ref.current.querySelector('[role="menuitem"]');
    if (first) first.focus();
    return () => { document.removeEventListener('mousedown', f); document.removeEventListener('keydown', k); };
  }, [open]);
  const onKey = (e) => {
    // Escape schliesst nur das Menü (nicht ein umgebendes Panel)
    if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); const b = ref.current && ref.current.querySelector('button'); if (b) b.focus(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const list = [...ref.current.querySelectorAll('[role="menuitem"]')];
    const i = list.indexOf(document.activeElement);
    const n = list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length];
    if (n) { e.preventDefault(); n.focus(); }
  };
  return html`<div class=${'menu ' + className} ref=${ref} onKeyDown=${onKey}>
    <button type="button" class=${'btn btn-' + variant + (small ? ' btn-sm' : '')} aria-haspopup="true" aria-expanded=${open ? 'true' : 'false'} onClick=${() => setOpen(!open)}>
      ${icon ? html`<${Icon} name=${icon} />` : null}${label}<${Icon} name="chevron-down" />
    </button>
    ${open && html`<div class=${'menu-pop menu-' + align} role="menu">
      ${items.map((it) => it.sep ? html`<div class="menu-sep" role="separator">${it.label || ''}</div>` : html`<button type="button" role="menuitem" class="menu-item" id=${it.id} onClick=${() => { setOpen(false); it.onClick(); }}>${it.label}${it.hint ? html`<span class="menu-hint">${it.hint}</span>` : null}</button>`)}
    </div>`}
  </div>`;
}

export function Empty({ title, children }) {
  return html`<div class="empty"><p class="empty-title">${title}</p>${children ? html`<div class="empty-body">${children}</div>` : null}</div>`;
}

/** HTML aus bereinigtem Datensatztext */
export const Raw = ({ h, tag = 'span', className }) => {
  const T = tag;
  return html`<${T} class=${className} dangerouslySetInnerHTML=${{ __html: h }} />`;
};

/** Titel einer Einheit als Überschrift: Auszeichnung gerendert (ohne doppelte Fettung), abgeleiteter Beschrieb gedämpft. */
export function UnitTitle({ ti, lang, tag = 'h1' }) {
  const T = tag;
  if (ti.html) return html`<${T} class="unit-title" lang=${lang} dangerouslySetInnerHTML=${{ __html: titleInline(ti.html) }} />`;
  if (ti.derived) return html`<${T} class="unit-title is-derived"><span class="derived-label">${t('read.noTitle')}</span> ${ti.derivedPrefix ? ti.derivedPrefix + ' ' : ''}<span lang=${lang}>${ti.derived}</span></${T}>`;
  return html`<${T} class="unit-title"></${T}>`;
}
export { safeInline };

/** Titel als Text (Inhaltsverzeichnis, Listen): amtlicher Titel oder abgeleiteter Kurzbeschrieb (gedämpft) in der Sprache des Rechtstexts. */
export function TitleText({ ti, lang, className = '' }) {
  if (ti.text) return html`<span class=${className} lang=${lang} title=${ti.text}>${ti.text}</span>`;
  if (ti.derived) return html`<span class=${className + ' is-derived'} lang=${lang} title=${ti.derived}><span class="derived-pfx" lang=${uiLang()}>${ti.derivedPrefix || t('read.derivedShort')}</span> ${ti.derived}</span>`;
  return null;
}

/** Kontextbezogener Einstieg in die Anleitung */
export function HelpLink({ sec, label, view = 'anleitung' }) {
  const text = label || t('help.open');
  return html`<a class="btn-icon help-link" href=${'#/' + view + '?sec=' + sec} title=${text} aria-label=${text}
    onClick=${(e) => { e.preventDefault(); go({ view, sec }); }}><${Icon} name="help" /></a>`;
}

/** Umschalter Sprache des Rechtstexts (unabhängig von der Oberflächensprache) */
export function LegalLangSwitch({ data, route, field, id = 'lbl-legal' }) {
  const opts = data.langs.map((l) => ({ value: l, label: l.toUpperCase(), title: t('lang.name.' + l), aria: `${l.toUpperCase()}, ${t('lang.name.' + l)}` }));
  const onChange = (l) => go({ l, l2: route.l2 === l ? data.langs.find((x) => x !== l) : route.l2 }, { replace: true });
  return html`<div class=${field ? 'field' : 'tool-group'}>
    <span class=${field ? 'field-label' : 'tool-label'} id=${id}>${t('lang.legal')}</span>
    <${Seg} labelledby=${id} value=${route.l} onChange=${onChange} options=${opts} />
  </div>`;
}

export const curLang = uiLang;

// ------------------------------------------------------------------ Dialoge
/** Rendert children in einen eigenen Knoten am Ende von body (über allen Stapelkontexten, z. B. der fixierten Schublade). */
export function Portal({ children }) {
  const host = useMemo(() => (typeof document !== 'undefined' ? document.createElement('div') : null), []);
  useLayoutEffect(() => {
    document.body.appendChild(host);
    return () => { render(null, host); host.remove(); };
  }, []);
  useLayoutEffect(() => { render(children, host); });
  return null;
}

/**
 * Modaler Dialog (Carbon Dialog) mit Fokusführung: Fokus beim Öffnen in den Dialog, Fokusfalle mit Tab,
 * Esc schliesst (ohne dass umgebende Bereiche wie die Schublade das Esc ebenfalls erhalten), Fokus kehrt zurück.
 * Aus dem Modul Verhandlung übernommen (dort weiterhin mit denselben Klassen und demselben Verhalten verwendet).
 * sub: Unterzeile unter dem Titel; className: zusätzliche Klasse; lockScroll: Seite dahinter scrollt nicht.
 */
export function Modal({ title, sub, onClose, children, foot, wide, id = 'nmodal', closeLabel, className = '', lockScroll = false }) {
  const ref = useRef();
  useEffect(() => {
    const prev = document.activeElement;
    const el = ref.current && (ref.current.querySelector('[autofocus], input, select, textarea, button.btn-primary') || ref.current);
    if (el) el.focus();
    return () => { if (prev && prev.focus && prev.isConnected !== false) prev.focus(); };
  }, []);
  useEffect(() => {
    if (!lockScroll) return undefined;
    const de = document.documentElement, b = document.body;
    const old = [de.style.overflow, b.style.overflow];
    de.style.overflow = 'hidden'; b.style.overflow = 'hidden';
    return () => { de.style.overflow = old[0]; b.style.overflow = old[1]; };
  }, [lockScroll]);
  // Esc schliesst auch, wenn der Fokus (noch) nicht im Dialog liegt
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const k = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, []);
  const onKey = (e) => {
    if (e.key === 'Tab') {
      // sichtbare fokussierbare Elemente; SVG-Elemente (Knoten einer Grafik) haben kein offsetParent
      const f = [...ref.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter((x) => !x.disabled && (x.offsetParent || (typeof SVGElement !== 'undefined' && x instanceof SVGElement && x.getClientRects().length > 0)));
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  };
  const cl = closeLabel || t('common.close');
  return html`<div class="modal-scrim" onClick=${onClose}></div>
  <div class=${'modal' + (wide ? ' modal-wide' : '') + (className ? ' ' + className : '')} role="dialog" aria-modal="true" aria-labelledby=${id + '-h'} ref=${ref} tabindex="-1" onKeyDown=${onKey}>
    <div class="panel-head">${sub ? html`<div class="modal-titles"><h2 id=${id + '-h'} class="panel-title">${title}</h2><p class="modal-sub">${sub}</p></div>` : html`<h2 id=${id + '-h'} class="panel-title">${title}</h2>`}<button type="button" class="btn-icon is-bare" aria-label=${cl} title=${cl} onClick=${onClose}><${Icon} name="close" /></button></div>
    <div class="modal-body">${children}</div>
    ${foot ? html`<div class="panel-foot">${foot}</div>` : null}
  </div>`;
}
