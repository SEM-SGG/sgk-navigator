// Hinweise zur Anwendbarkeit je Einzeländerung (Etappe 3, Erweiterung 8): Kennzeichen am Block und gesammelte Liste über dem Text.
import { html } from 'htm/preact';
import { t, uiLang } from '../lib/i18n.js';
import { fmtDate } from '../lib/format.js';
import { cite } from '../lib/cite.js';
import { go } from '../state.js';

/** Kurzbezeichnung eines Hinweises: ausgesetzt, bedingt anwendbar, abweichend, hängig, künftig, abgelaufen */
export function noticeLabel(data, n, long = false) {
  const k = n.kind === 'derogation' ? (n.effect || 'modified') : n.kind;
  const base = t('notice.kind.' + k);
  if (!long) return base;
  if (n.kind === 'derogation' && (n.from || n.until)) return `${base} (${t('notice.period', { from: fmtDate(n.from), until: fmtDate(n.until) })})`;
  if (n.kind === 'future' && n.from) return `${base} (${t('notice.from', { date: fmtDate(n.from) })})`;
  if (n.kind === 'expired' && n.until) return `${base} (${t('notice.until', { date: fmtDate(n.until) })})`;
  return base;
}

const ORDER = { derogation: 0, expired: 1, future: 2, pending: 3 };

/** Nennt die Fundstelle den Akt bereits (z. B. «… der VO (EU) 2025/1534»)? Dann den Aktnamen nicht wiederholen. */
function actMentioned(basis, actName) {
  const num = (String(actName).match(/\d{4}\/\d+/) || [])[0];
  return !!num && String(basis).includes(num);
}

/** Gleichartige Hinweise zusammenfassen (gleiche Art, gleicher Akt, gleiche Erläuterung): eine Zeile mit mehreren Fundstellen. */
function groupNotices(list) {
  const m = new Map();
  for (const n of list) {
    const id = [n.kind, n.effect || '', n.celex, n.note || '', n.basis || '', n.from || '', n.until || ''].join('|');
    if (!m.has(id)) m.set(id, { ...n, keys: [] });
    m.get(id).keys.push(n.key);
  }
  return [...m.values()];
}

function Group({ data, unitId, g, onPick }) {
  const tail = noticeLabel(data, g, true).slice(noticeLabel(data, g).length).trim();
  return html`<li class=${'app-n kind-' + (g.effect || g.kind)}>
    <span class=${'blk-flag flag-' + (g.effect || g.kind)}>${noticeLabel(data, g)}</span>
    <span class="app-n-body">
      <span class="app-n-head">${g.keys.map((k, i) => html`${i ? ', ' : ''}${k ? html`<button type="button" class="link" onClick=${() => onPick && onPick(k)}>${cite(data.unitMeta(unitId), k, uiLang(), i ? null : data.abbr)}</button>` : html`<b>${cite(data.unitMeta(unitId), null, uiLang(), data.abbr)}</b>`}`)}
        ${tail ? html` <span class="muted">${tail}</span>` : null}
        ${g.confidence === 'check' ? html` <span class="tag tag-partly">${t('notice.check')}</span>` : null}
        ${g.computed ? html` <span class="tag tag-recon">${t('notice.computed')}</span>` : null}</span>
      ${g.note ? html`<span class="app-n-note">${g.note}</span>` : null}
      <span class="app-n-basis small">${g.basis ? t('notice.basis', { basis: g.basis }) : ''}${g.celex && !(g.basis && actMentioned(g.basis, data.actName(g.celex))) ? html`${g.basis ? ' | ' : ''}${data.actName(g.celex)}` : null}</span>
    </span>
  </li>`;
}

/** Gesammelte Hinweise über dem Text (mit Fundstelle): Abweichungen sichtbar, hängige und künftige Änderungen aufklappbar. */
export function NoticeList({ data, unitId, notices, onPick }) {
  if (!notices || !notices.length) return null;
  const sorted = [...notices].sort((a, b) => (ORDER[a.kind] ?? 9) - (ORDER[b.kind] ?? 9) || String(a.key || '').localeCompare(String(b.key || ''), 'de', { numeric: true }));
  const der = groupNotices(sorted.filter((n) => n.kind === 'derogation' || n.kind === 'expired'));
  const rest = groupNotices(sorted.filter((n) => n.kind !== 'derogation' && n.kind !== 'expired'));
  const nRest = sorted.length - sorted.filter((n) => n.kind === 'derogation' || n.kind === 'expired').length;
  return html`<div class="app-notices" role="note" aria-label=${t('notice.title')}>
    <p class="app-notices-h"><strong>${t('notice.title')}</strong> <span class="muted">${t('notice.count', { n: sorted.length })}</span></p>
    ${der.length ? html`<ul>${der.map((g) => html`<${Group} data=${data} unitId=${unitId} g=${g} onPick=${onPick} />`)}</ul>` : null}
    ${rest.length ? html`<details class="app-more" open=${!der.length}><summary>${t('notice.more', { n: nRest })}</summary><ul>${rest.map((g) => html`<${Group} data=${data} unitId=${unitId} g=${g} onPick=${onPick} />`)}</ul></details>` : null}
  </div>`;
}
