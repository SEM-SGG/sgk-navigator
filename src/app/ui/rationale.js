// Begründung neben der Änderung (Etappe 3, Erweiterung 4): Erwägungsgründe des Änderungsakts, redaktionell zugeordnet.
import { html } from 'htm/preact';
import { sgkExtras } from '../library.js';
import { safeInline } from '../lib/sanitize.js';
import { t, uiLang } from '../lib/i18n.js';

const match = (eKey, key) => !key || eKey == null || eKey === key || key.startsWith(eKey + '.') || eKey.startsWith(key + '.');

/** Zugeordnete Erwägungsgründe eines Akts für eine Einheit bzw. Bestimmung: [{ n, text, strength, why, fn }] */
export function rationaleFor(data, celex, unitId, key, lang) {
  if (!data || data.workId !== 'sgk' || !celex) return [];
  const r = sgkExtras().rationale[String(celex).replace(/R\(\d+\)$/, '')];
  if (!r || !Array.isArray(r.map)) return [];
  const best = new Map();
  for (const e of r.map) {
    if (e.unit !== unitId || !match(e.key, key)) continue;
    for (const n of e.recitals || []) {
      const prev = best.get(n);
      if (!prev || (prev.strength !== 'direct' && e.strength === 'direct')) best.set(n, { n, strength: e.strength, why: e.why || '' });
    }
  }
  return [...best.values()].sort((a, b) => parseInt(a.n, 10) - parseInt(b.n, 10)).map((x) => {
    const txt = (r.recitals[x.n] || {})[lang] || (r.recitals[x.n] || {}).en || '';
    return { ...x, text: txt };
  });
}

/** Aufklappbarer Bereich je Schritt der Chronologie. */
export function RationaleBox({ data, celex, unitId, k, lang }) {
  const list = rationaleFor(data, celex, unitId, k, lang);
  if (!list.length) return null;
  const nd = list.filter((x) => x.strength === 'direct').length;
  return html`<details class="rat">
    <summary><span class="rat-sum">${t('rat.title')}</span> <span class="muted small">${t('rat.count', { n: list.length, d: nd })}</span></summary>
    <p class="rat-note small"><span class="tag tag-recon">${t('rat.editorial')}</span> ${t('rat.note', { act: data.actName(celex) })}</p>
    <ol class="rat-list">
      ${list.map((x) => html`<li class=${'rat-item is-' + x.strength}>
        <div class="rat-head"><b>${t('rat.recital', { n: x.n })}</b> <span class=${'tag ' + (x.strength === 'direct' ? 'tag-ok' : 'tag-src')} title=${t('rat.' + x.strength + 'Tip')}>${t('rat.' + x.strength)}</span>
          ${x.why && uiLang() === 'de' ? html`<span class="muted small rat-why">${x.why}</span>` : null}</div>
        <div class="rat-text legal" lang=${lang} dangerouslySetInnerHTML=${{ __html: safeInline(x.text) }}></div>
      </li>`)}
    </ol>
  </details>`;
}
