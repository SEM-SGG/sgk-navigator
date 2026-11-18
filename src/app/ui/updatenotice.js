// Hinweis auf neue Versionen des SGK-Navigators: Zustand, Abfrage (automatisch höchstens einmal pro Tag, manuell in «Info»),
// Meldung oben im Inhaltsbereich und Abschnitt «Version» in «Info». Logik: src/app/lib/updatecheck.js; Quelle:
// src/app/config/update-source.js. Ohne konfigurierte Quelle: keine Abfrage, kein Bedienelement (nur die Versionsangabe in «Info»).
import { html } from 'htm/preact';
import { createStore } from '../state.js';
import { kvGet, kvSet } from '../lib/store.js';
import { t, uiLang } from '../lib/i18n.js';
import { fmtDate, localIso } from '../lib/format.js';
import { Icon } from './common.js';
import { UPDATE_SOURCE, PROJECT } from '../config/update-source.js';
import { sourceInfo, fetchLatest, autoCheckDue, shouldShow, remindLater, parseVersion, isNewer } from '../lib/updatecheck.js';

const KEY = 'update';
const info = sourceInfo(UPDATE_SOURCE);
export const updateEnabled = () => !!info;

// state (gespeichert): { auto, lastCheck, result: { version, date, url, notes }, remind }
// session: { checking, message: { kind, text } | null, closed: version | null }
export const updateStore = createStore({ state: { auto: true }, checking: false, message: null, closed: null, ready: false });
let current = null; // { version, built }

function patch(p) { updateStore.set({ ...updateStore.get(), ...p }); }
async function saveState(state) { patch({ state }); try { await kvSet(KEY, state); } catch { /* Speicher nicht verfügbar */ } }

/** Beim Start nach dem ersten Rendern: Zustand laden, gegebenenfalls automatisch prüfen (nicht blockierend). */
export async function initUpdate(meta) {
  current = { version: (meta && meta.version) || null, built: (meta && meta.built) || null };
  const state = { auto: true, ...((await kvGet(KEY, null)) || {}) };
  patch({ state, ready: true });
  if (info && current.version && autoCheckDue(state)) setTimeout(() => { runCheck({ manual: false }); }, 0);
}

export const currentVersion = () => current;

/** Prüfung. manual: Meldung bei Erfolg und Fehler; automatisch: Fehler still. */
export async function runCheck({ manual = false, fetchFn = (...a) => fetch(...a) } = {}) {
  if (!info || updateStore.get().checking) return null;
  patch({ checking: true, message: manual ? null : updateStore.get().message });
  const st = updateStore.get().state;
  let result = null, message = null;
  try {
    result = await fetchLatest(info, { fetchFn });
    await saveState({ ...st, lastCheck: new Date().toISOString(), result });
    if (manual) {
      const newer = current && current.version && isNewer(result.version, current.version);
      message = newer ? { kind: 'info', text: t('update.v.found', { date: fmtDate(result.date) }) } : { kind: 'success', text: t('update.v.latest', { version: current && current.version ? current.version : '?' }) };
    }
    // eine manuelle Prüfung hebt «Später erinnern» und «Schliessen» auf
    if (manual) { const s2 = { ...updateStore.get().state }; delete s2.remind; await saveState(s2); patch({ closed: null }); }
  } catch (e) {
    await saveState({ ...st, lastCheck: new Date().toISOString() });
    if (manual) message = { kind: 'error', text: t('update.v.err.' + (['offline', 'notfound', 'ratelimit', 'format'].includes(e.code) ? e.code : 'status'), { status: e.status || '' }) };
  }
  patch({ checking: false, message });
  return result;
}

export async function setAutoCheck(on) { await saveState({ ...updateStore.get().state, auto: !!on }); }

/** Meldung oben im Inhaltsbereich. */
export function UpdateNotice() {
  const s = updateStore.use();
  uiLang();
  if (!info || !s.ready || !current || !current.version) return null;
  const r = s.state.result;
  if (!shouldShow(r, current.version, s.state) || s.closed === r.version) return null;
  const notes = r.notes && (r.notes[uiLang()] || r.notes.de);
  return html`<div class="update-bar">
    <div class="notice notice-info update-notice" role="status" id="update-notice" aria-labelledby="update-notice-t">
      <${Icon} name="info" />
      <div class="update-body">
        <p id="update-notice-t"><strong>${t('update.v.notice', { date: fmtDate(r.date) })}</strong></p>
        <p>${t('update.v.how')}</p>
        ${notes ? html`<p class="small">${notes}</p>` : null}
        <div class="update-actions">
          <a class="btn btn-primary btn-sm" id="update-download" href=${r.url} target="_blank" rel="noopener noreferrer"><${Icon} name="download" />${t('update.v.download')}</a>
          ${r.page ? html`<a class="btn btn-ghost btn-sm" id="update-whatsnew" href=${r.page} target="_blank" rel="noopener noreferrer">${t('update.v.whatsNew')}</a>` : null}
          <button type="button" class="btn btn-ghost btn-sm" id="update-later" onClick=${() => saveState(remindLater(s.state, r.version))}>${t('update.v.later')}</button>
        </div>
      </div>
      <button type="button" class="btn-icon is-bare update-close" id="update-close" aria-label=${t('update.v.close')} title=${t('update.v.close')} onClick=${() => patch({ closed: r.version })}><${Icon} name="close" /></button>
    </div>
  </div>`;
}

/** Abschnitt «Version» in «Info». */
export function UpdateInfo() {
  const s = updateStore.use();
  const v = current && current.version ? parseVersion(current.version) : null;
  const r = s.state.result;
  return html`<section class="info-sec" aria-labelledby="ver-h" id="info-version">
    <h2 id="ver-h">${t('update.v.title')}</h2>
    <dl class="facts">
      <dt>${t('update.v.version')}</dt><dd><span class="mono" id="app-version">${current && current.version ? current.version : t('update.v.unknown')}</span>${v ? ` (${t('update.v.ofDate', { date: fmtDate(v.date) })})` : ''}</dd>
      ${info && s.state.lastCheck ? html`<dt>${t('update.v.lastCheck')}</dt><dd>${fmtDate(localIso(new Date(s.state.lastCheck)))}${r ? ' · ' + t('update.v.published', { version: r.version }) : ''}</dd>` : null}
    </dl>
    ${info ? html`
      <p>${t(info.fallback ? 'update.v.netFallback' : 'update.v.net', { host: new URL(info.endpoint).host, fallback: info.fallback ? new URL(info.fallback.endpoint).host : '' })}</p>
      <div class="row-tools">
        <button type="button" class="btn btn-secondary" id="btn-update-check" disabled=${s.checking} onClick=${() => runCheck({ manual: true })}><${Icon} name="refresh" />${s.checking ? t('update.v.checking') : t('update.v.check')}</button>
        <label class="check"><input type="checkbox" id="chk-update-auto" checked=${s.state.auto !== false} onChange=${(e) => setAutoCheck(e.target.checked)} />${t('update.v.auto')}</label>
      </div>
      <div role="status" aria-live="polite" id="update-msg">${s.message ? html`<div class=${'notice notice-' + s.message.kind}><${Icon} name=${s.message.kind === 'error' ? 'warning' : s.message.kind === 'success' ? 'check-circle' : 'info'} /><div>${s.message.text}${s.message.kind === 'info' && r ? html` <a href=${r.url} target="_blank" rel="noopener noreferrer">${t('update.v.download')}</a>${r.page ? html` · <a href=${r.page} target="_blank" rel="noopener noreferrer">${t('update.v.whatsNew')}</a>` : null}` : null}</div></div>` : null}</div>
    ` : html`<p class="small muted">${t('update.v.off')}</p>`}
    <${ProjectLinks} />
  </section>`;
}

/** Links des Projekts (Download-Seite, Quellcode, Fehler melden) in «Info» → «Version». Nur Links, keine Anfrage des Tools. */
export function ProjectLinks() {
  uiLang();
  const ext = { target: '_blank', rel: 'noopener noreferrer' };
  return html`<div class="project-links" id="info-project">
    <h3 class="info-sub">${t('update.v.project.title')}</h3>
    <ul class="info-list">
      <li><a id="lnk-project" href=${PROJECT.page} ...${ext}>${t('update.v.project.page')}</a><span class="muted"> · ${t('update.v.project.pageNote')}</span></li>
      <li><a id="lnk-source" href=${PROJECT.source} ...${ext}>${t('update.v.project.source')}</a></li>
      <li><a id="lnk-issues" href=${PROJECT.issues} ...${ext}>${t('update.v.project.issues')}</a><span class="muted"> · ${t('update.v.project.issuesNote')}</span></li>
    </ul>
  </div>`;
}
