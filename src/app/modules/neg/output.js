// Ausgabe: Verhandlungsbriefing (Word, Druckansicht), Konsultationsbericht (Word, Druckansicht; gesamt oder je Stelle),
// Gesamtsicht Synopse (Druckansicht), Projektdatei.
import { html } from 'htm/preact';
import { useState } from 'preact/hooks';
import { t, uiLang } from '../../lib/i18n.js';
import { go } from '../../state.js';
import { Icon, HelpLink, Seg } from '../../ui/common.js';
import { toast } from '../../app.js';
import { todayIso } from '../../lib/format.js';
import { buildPositionDocx, positionRows } from './core.js';
import { exportProjectFile } from './store.js';
import { useDossier, NoDossier, PageHead } from './ui.js';
import { downloadDocx } from './consultation.js';
import { balance, meetingsByDate } from './core.js';
import { meetingLabel } from './deleg.js';

const fileSafe = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
export const SCOPES = ['redline', 'open', 'all', 'full'];
export function briefingOpts(scope, sort) {
  if (scope === 'full') return { variant: 'full', filter: {}, sort };
  if (scope === 'redline') return { variant: 'briefing', filter: { priority: ['redline'] }, sort };
  if (scope === 'open') return { variant: 'briefing', filter: { onlyOpen: true }, sort };
  return { variant: 'briefing', filter: {}, sort };
}
/** Brücke: Konsultationsbericht für eine einzelne Stelle (Dossierkopie mit nur deren Rückmeldungen). */
export function forOffice(d, kId, officeId) {
  if (!officeId) return d;
  return { ...d, consultations: d.consultations.map((k) => (k.id !== kId ? k : { ...k, offices: k.offices.filter((o) => o.id === officeId), responses: k.responses.filter((r) => r.office === officeId) })) };
}

export function OutputView({ route }) {
  const d = useDossier(route);
  if (!d) return html`<${NoDossier} route=${route} />`;
  return html`<${Outputs} d=${d} />`;
}

function Outputs({ d }) {
  const [b, setB] = useState({ scope: 'all', sort: 'order', lang: uiLang() });
  const ks = d.consultations || [];
  const [r, setR] = useState({ k: (ks[ks.length - 1] || {}).id || '', office: '', lang: uiLang() });
  const k = ks.find((x) => x.id === r.k);
  const opts = briefingOpts(b.scope, b.sort);
  const n = positionRows(d, opts).length;
  const word = (fn, name) => { try { downloadDocx(fn(), name); toast(t('neg.out.done'), 'success', 3000); } catch (e) { console.error(e); toast(t('neg.out.failed', { msg: e.message }), 'error'); } };
  const base = fileSafe(d.short || d.procedure || d.id);
  return html`<div class="view"><main class="wide" id="main" tabindex="-1">
    <${PageHead} compact kicker=${d.short || d.title} title=${t('neg.nav.ausgabe')} help=${html`<${HelpLink} view="n-anleitung" sec="briefing" />`}>
      <p class="nhead-lead">${t('neg.out.lead')}</p>
    </${PageHead}>
    <section class="nsec nout" aria-labelledby="out-b-h">
      <h2 class="nsec-h" id="out-b-h">${t('neg.out.briefing')}</h2>
      <p class="small muted nmax">${t('neg.out.briefingText')}</p>
      <div class="toolbar">
        <div class="field"><span class="field-label" id="lbl-bs">${t('neg.out.scope')}</span><${Seg} labelledby="lbl-bs" value=${b.scope} onChange=${(v) => setB({ ...b, scope: v })} options=${SCOPES.map((x) => ({ value: x, label: t('neg.out.scopeOpt.' + x) }))} /></div>
        <div class="field"><span class="field-label" id="lbl-bo">${t('neg.out.sort')}</span><${Seg} labelledby="lbl-bo" value=${b.sort} onChange=${(v) => setB({ ...b, sort: v })} options=${[{ value: 'order', label: t('neg.out.sortOrder') }, { value: 'priority', label: t('neg.out.sortPriority') }]} /></div>
        <div class="field"><span class="field-label" id="lbl-bl">${t('neg.out.lang')}</span><${Seg} labelledby="lbl-bl" value=${b.lang} onChange=${(v) => setB({ ...b, lang: v })} options=${[{ value: 'de', label: 'DE', title: t('lang.uiName.de') }, { value: 'fr', label: 'FR', title: t('lang.uiName.fr') }]} /></div>
      </div>
      <p class="nout-n">${t('neg.out.nRows', { n })}</p>
      <div class="neg-actions">
        <button type="button" class="btn btn-primary" id="out-briefing-word" disabled=${!n && b.scope !== 'full'} onClick=${() => word(() => buildPositionDocx(d, { ...opts, lang: b.lang }), `${t('neg.out.fileBriefing')}_${base}_${t('neg.out.scopeOpt.' + b.scope)}_${todayIso()}.docx`.replace(/\s+/g, '-'))}><${Icon} name="download" />${t('neg.out.word')}</button>
        <button type="button" class="btn btn-tertiary" id="out-briefing-print" onClick=${() => go({ view: 'druck', pv: 'briefing', po: [b.scope, b.sort, b.lang].join('~') })}><${Icon} name="print" />${t('neg.out.print')}</button>
      </div>
    </section>

    <section class="nsec nout" aria-labelledby="out-r-h">
      <h2 class="nsec-h" id="out-r-h">${t('neg.out.report')}</h2>
      <p class="small muted nmax">${t('neg.out.reportText')}</p>
      ${ks.length ? html`<div class="toolbar">
        <label class="field"><span class="field-label">${t('neg.cons.round')}</span><select id="out-round" value=${r.k} onChange=${(e) => setR({ ...r, k: e.target.value, office: '' })}>${ks.map((x) => html`<option value=${x.id}>${x.title}</option>`)}</select></label>
        <label class="field"><span class="field-label">${t('neg.cons.office')}</span><select id="out-office" value=${r.office} onChange=${(e) => setR({ ...r, office: e.target.value })}><option value="">${t('neg.out.allOffices')}</option>${(k ? k.offices : []).map((o) => html`<option value=${o.id}>${o.abbr}${o.name !== o.abbr ? ' – ' + o.name : ''}</option>`)}</select></label>
        <div class="field"><span class="field-label" id="lbl-rl2">${t('neg.out.lang')}</span><${Seg} labelledby="lbl-rl2" value=${r.lang} onChange=${(v) => setR({ ...r, lang: v })} options=${[{ value: 'de', label: 'DE', title: t('lang.uiName.de') }, { value: 'fr', label: 'FR', title: t('lang.uiName.fr') }]} /></div>
      </div>
      <div class="neg-actions">
        <button type="button" class="btn btn-secondary" id="out-report-word" onClick=${() => { const off = k && k.offices.find((o) => o.id === r.office); word(() => buildPositionDocx(forOffice(d, r.k, r.office), { variant: 'consultation-report', consultationId: r.k, lang: r.lang }), `${t('neg.out.fileReport')}_${base}_${fileSafe(k ? k.title : '')}${off ? '_' + fileSafe(off.abbr) : ''}_${todayIso()}.docx`); }}><${Icon} name="download" />${t('neg.out.word')}</button>
        <button type="button" class="btn btn-tertiary" id="out-report-print" onClick=${() => go({ view: 'druck', pv: 'report', po: [r.k, r.office, r.lang].join('~') })}><${Icon} name="print" />${t('neg.out.print')}</button>
      </div>` : html`<p class="muted">${t('neg.out.noRounds')}</p>`}
    </section>

    <${Outputs3} d=${d} base=${base} word=${word} />

    <section class="nsec nout" aria-labelledby="out-s-h">
      <h2 class="nsec-h" id="out-s-h">${t('neg.out.synopsis')}</h2>
      <p class="small muted nmax">${t('neg.out.synopsisText')}</p>
      <div class="neg-actions"><button type="button" class="btn btn-tertiary" id="out-syn-print" onClick=${() => go({ view: 'druck', pv: 'synopse' })}><${Icon} name="print" />${t('neg.out.print')}</button></div>
    </section>

    <section class="nsec nout" aria-labelledby="out-p-h">
      <h2 class="nsec-h" id="out-p-h">${t('neg.project.head')}</h2>
      <p class="small muted nmax">${t('neg.project.text')}</p>
      <div class="neg-actions"><button type="button" class="btn btn-tertiary" onClick=${() => exportProjectFile(d)}><${Icon} name="save" />${t('neg.project.export')}</button></div>
    </section>
  </main></div>`;
}

/** Abschnitte Etappe 3: Bilanz und Sitzungsbericht (Word, Druckansicht). */
function Outputs3({ d, base, word }) {
  const [bl, setBl] = useState(uiLang());
  const ms = meetingsByDate(d);
  const [m, setM] = useState({ id: (ms[ms.length - 1] || {}).id || '', lang: uiLang() });
  const b = balance(d, { suggest: false });
  const mt = ms.find((x) => x.id === m.id);
  return html`
    <section class="nsec nout" aria-labelledby="out-bal-h">
      <h2 class="nsec-h" id="out-bal-h">${t('neg.bal.outHead')}</h2>
      <p class="small muted nmax">${t('neg.bal.outText')}</p>
      <p class="nout-n3">${t('neg.bal.outN', { n: b.total, c: b.total - b.byOutcome.unset })}</p>
      <div class="toolbar"><div class="field"><span class="field-label" id="lbl-obl">${t('neg.out.lang')}</span><${Seg} labelledby="lbl-obl" value=${bl} onChange=${setBl} options=${[{ value: 'de', label: 'DE', title: t('lang.uiName.de') }, { value: 'fr', label: 'FR', title: t('lang.uiName.fr') }]} /></div></div>
      <div class="neg-actions">
        <button type="button" class="btn btn-secondary" id="out-balance-word" disabled=${!b.total} onClick=${() => word(() => buildPositionDocx(d, { variant: 'balance', lang: bl }), `${t('neg.bal.file')}_${base}_${todayIso()}.docx`)}><${Icon} name="download" />${t('neg.out.word')}</button>
        <button type="button" class="btn btn-tertiary" id="out-balance-print" disabled=${!b.total} onClick=${() => go({ view: 'druck', pv: 'balance', po: bl })}><${Icon} name="print" />${t('neg.out.print')}</button>
        <button type="button" class="btn btn-tertiary" onClick=${() => go({ view: 'position', nkt: 'bilanz', po: null })}><${Icon} name="edit" />${t('neg.bal.toBalance')}</button>
      </div>
    </section>
    <section class="nsec nout" aria-labelledby="out-mt-h">
      <h2 class="nsec-h" id="out-mt-h">${t('neg.mt.report')}</h2>
      <p class="small muted nmax">${t('neg.mt.reportText')}</p>
      ${ms.length ? html`<div class="toolbar">
        <label class="field"><span class="field-label">${t('neg.dl.meeting')}</span><select id="out-meeting" value=${m.id} onChange=${(e) => setM({ ...m, id: e.target.value })}>${ms.slice().reverse().map((x) => html`<option value=${x.id}>${meetingLabel(x)}</option>`)}</select></label>
        <div class="field"><span class="field-label" id="lbl-oml">${t('neg.out.lang')}</span><${Seg} labelledby="lbl-oml" value=${m.lang} onChange=${(v) => setM({ ...m, lang: v })} options=${[{ value: 'de', label: 'DE', title: t('lang.uiName.de') }, { value: 'fr', label: 'FR', title: t('lang.uiName.fr') }]} /></div>
      </div>
      <div class="neg-actions">
        <button type="button" class="btn btn-secondary" id="out-meeting-word" onClick=${() => word(() => buildPositionDocx(d, { variant: 'meeting', lang: m.lang, meetingId: m.id }), `${t('neg.mt.fileReport')}_${base}_${(mt && mt.date) || todayIso()}.docx`)}><${Icon} name="download" />${t('neg.out.word')}</button>
        <button type="button" class="btn btn-tertiary" id="out-meeting-print" onClick=${() => go({ view: 'druck', pv: 'meeting', po: [m.id, m.lang].join('~') })}><${Icon} name="print" />${t('neg.out.print')}</button>
      </div>` : html`<p class="muted">${t('neg.mt.noneOut')} <button type="button" class="link" onClick=${() => go({ view: 'delegationen', nkt: 'meetings', po: null })}>${t('neg.mt.toMeetings')}</button></p>`}
    </section>`;
}
