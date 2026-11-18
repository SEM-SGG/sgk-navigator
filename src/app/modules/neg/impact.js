// Vorschau hängiger Vorschläge, Seite Verhandlung (Etappe 3, SPEC3 §3.6, §5): Wirkung einer Zeile im geltenden Recht (Zeilendetail)
// und Übersicht «Wirkung im SGK» je Spur. Daten: buildPreview (src/neg) mit dem eingebetteten SGK-Datensatz (nur lesend, nur Englisch).
// Kennzeichnung immer: hypothetisch, nicht amtlich, automatisch abgeleitet.
import { html } from 'htm/preact';
import { useMemo, useState } from 'preact/hooks';
import { t, uiLang } from '../../lib/i18n.js';
import { go } from '../../state.js';
import { Icon, HelpLink, Seg } from '../../ui/common.js';
import { useData } from '../../app.js';
import { diffText } from '../../lib/diff.js';
import { cite } from '../../lib/cite.js';
import { enStages, defaultBaseStage, previewFor, previewTracks, previewLink, reasonText, visibleRowId, sortedRows } from './core.js';
import { useDossier, NoDossier, PageHead, trackName, docLabel, Figures } from './ui.js';
import { CardMenu } from './card.js';
import { impactModel } from './cardmodel.js';
import { openRow } from './detail.js';

const WORK_LABEL = { sgk: 'SGK', ees: 'EES', etias: 'ETIAS', vis: 'VIS', iop: 'IO' };
/** Einheit des Datensatzes oder (neue Einheit) aus der Id abgeleitet. */
function unitObj(ds, unitId) {
  const u = ds && ds.units && ds.units[unitId];
  if (u) return u;
  const m = /^(art|anx)_(.+)$/.exec(unitId || '');
  return m ? { id: unitId, type: m[1] === 'art' ? 'article' : 'annex', num: m[2] } : { id: unitId, type: 'article', num: unitId };
}
export function unitCite(data, unitId, key, workId = 'sgk') {
  const abbr = workId === 'sgk' ? (data && data.abbr) || { de: 'SGK', fr: 'CFS', en: 'SBC' } : { de: WORK_LABEL[workId] || workId.toUpperCase(), fr: WORK_LABEL[workId] || workId.toUpperCase(), en: WORK_LABEL[workId] || workId.toUpperCase() };
  return cite(unitObj(data && data.ds, unitId), key || '', uiLang(), abbr);
}
const stageName = (data, id) => { try { return data.stageOption(id); } catch { return id; } };
const blockText = (b) => (b.ty === 'img' ? `[${t('neg.pv.image')}]` : b.t || '');

/** Blöcke der Bestimmung heute und nach dem Vorschlag, zusammengeführt in Lesereihenfolge (mit Redline). */
export function impactBlocks(unit) {
  const pb = (unit.previewVersion && unit.previewVersion.blocks) || [];
  const bb = (unit.baseVersion && unit.baseVersion.blocks) || [];
  const pkeys = new Set(pb.map((b) => b.k));
  const byKey = new Map(bb.map((b) => [b.k, b]));
  const delAfter = new Map();
  let last = null;
  for (const b of bb) { if (!pkeys.has(b.k)) { const l = delAfter.get(last) || []; l.push(b); delAfter.set(last, l); } else last = b.k; }
  const out = [];
  const del = (b) => ({ key: b.k, label: b.l || '', depth: b.d || 0, op: 'del', html: `<del>${blockText(b)}</del>`, changed: true });
  for (const b of delAfter.get(null) || []) out.push(del(b));
  for (const p of pb) {
    const o = byKey.get(p.k);
    const prev = String(p.o || '').startsWith('preview:');
    if (!o) out.push({ key: p.k, label: p.l || '', depth: p.d || 0, op: 'ins', html: `<ins>${blockText(p)}</ins>`, changed: true, row: p.row });
    else if (blockText(o) !== blockText(p) || (o.l || '') !== (p.l || '')) {
      const r = diffText(blockText(o), blockText(p));
      out.push({ key: p.k, label: (o.l || '') !== (p.l || '') ? `${p.l || ''}` : p.l || '', depth: p.d || 0, html: r.redline, changed: true, row: p.row });
    } else out.push({ key: p.k, label: p.l || '', depth: p.d || 0, html: blockText(p), changed: prev, row: p.row });
    for (const b of delAfter.get(p.k) || []) out.push(del(b));
  }
  if (unit.previewVersion && unit.previewVersion.repealed) for (const b of bb) if (!out.some((x) => x.key === b.k)) out.push(del(b));
  return out;
}

function Hypo() {
  return html`<div class="notice notice-warning npv-hypo" role="note"><${Icon} name="warning" /><div><strong>${t('neg.pv.hypoTitle')}</strong> ${t('neg.pv.hypoText')}</div></div>`;
}

// ------------------------------------------------------------------ Zeilendetail: Reiter «Wirkung»
export function RowImpact({ d, row }) {
  const data = useData();
  const ds = data && data.ds;
  const am = row.amends;
  const work = am.work || 'sgk';
  const own = (data && data.work && data.work.id) || 'sgk';
  const [base, setBase] = useState(() => defaultBaseStage(d, ds));
  const [scope, setScope] = useState('row');
  const tracks = useMemo(() => (ds && work === own ? d.tracks.filter((x) => {
    const p = previewFor(d, ds, { track: x.id, baseStage: base });
    if (p.error) return false;
    const u = p.units[am.unit];
    return (u && u.changes.some((c) => (c.rows || [c.row]).includes(row.id))) || p.unresolved.some((z) => (z.rows || [z.row]).includes(row.id)) || (((d.cells[row.id] || {})[x.id] || []).some((c) => !c.empty) && !!u);
  }) : []), [d, ds, base, row.id]);
  const pref = ['agreement', 'council', 'ep', 'com'];
  const [trSel, setTr] = useState(null);
  const tr = tracks.find((x) => x.id === trSel) ? trSel : (tracks.slice().sort((a, b) => pref.indexOf(a.id) - pref.indexOf(b.id))[0] || {}).id;
  const c0 = unitCite(data, am.unit, am.key, work);
  if (work !== own || !ds) {
    return html`<div class="nd-sec npv">
      <p class="nd-h">${t('neg.pv.rowHead')}: ${c0}</p>
      <p class="small nmax">${t('neg.pv.otherWork', { work: WORK_LABEL[work] || work })}</p>
      <div class="neg-actions"><a class="btn btn-tertiary btn-sm" href=${`#/lesen?w=${encodeURIComponent(work)}&u=${encodeURIComponent(am.unit)}${am.key ? '&k=' + encodeURIComponent(am.key) : ''}`}><${Icon} name="book" />${t('neg.pv.openWork')}</a></div>
    </div>`;
  }
  if (!tracks.length) return html`<div class="nd-sec npv"><${Hypo} /><p class="nd-h">${t('neg.pv.rowHead')}: ${c0}</p><p class="muted">${t('neg.pv.noTrack')}</p></div>`;
  const p = previewFor(d, ds, { track: tr, baseStage: base });
  const unit = p.units[am.unit];
  const mine = unit ? unit.changes.filter((c) => (c.rows || [c.row]).includes(row.id)) : [];
  const keys = mine.map((c) => c.key).filter(Boolean);
  const all = unit ? impactBlocks(unit) : [];
  const hit = (k) => keys.some((x) => k === x || String(k).startsWith(x + '.'));
  const blocks = scope === 'row' && keys.length ? all.filter((b) => hit(b.key)) : all;
  const unres = p.unresolved.filter((z) => (z.rows || [z.row]).includes(row.id)).map((z) => ({ ...reasonText(z.reason, uiLang()), row: z.row }));
  const title = unitCite(data, am.unit, '', work);
  const link = previewLink(d, am.unit, tr, null, keys[0] || am.key);
  const shownLabel = (b) => b.label;
  return html`<div class="nd-sec npv">
    <${Hypo} />
    <div class="nd-bar">
      <div class="field"><span class="field-label" id="lbl-pvt">${t('neg.detail.track')}</span>
        <${Seg} labelledby="lbl-pvt" size="sm" value=${tr} onChange=${setTr} options=${tracks.map((x) => ({ value: x.id, label: trackName(d, x.id) }))} /></div>
      <label class="field"><span class="field-label">${t('neg.pv.base')}</span><select id="pv-base" value=${base} onChange=${(e) => setBase(e.target.value)}>${enStages(ds).map((s) => html`<option value=${s.id}>${stageName(data, s.id)}</option>`)}</select></label>
    </div>
    <div class="nd-bar">
      <div class="field"><span class="field-label" id="lbl-pvs">${t('neg.detail.show')}</span>
        <${Seg} labelledby="lbl-pvs" size="sm" value=${keys.length ? scope : 'all'} onChange=${setScope} options=${[{ value: 'row', label: t('neg.pv.scopeRow') }, { value: 'all', label: t('neg.pv.scopeAll') }]} /></div>
      <span class="spacer"></span>
      <${CardMenu} small model=${() => impactModel(d, row, { cite: title, trackLabel: trackName(d, tr), baseLabel: stageName(data, p.base), blocks, unresolved: unres })} name=${`${visibleRowId(row.id)}_${t('neg.pv.file')}_${trackName(d, tr)}`} title=${title} />
    </div>
    <h3 class="nd-h npv-title">${title}${unit && unit.previewVersion && unit.previewVersion.title ? html` <span class="npv-utitle" lang="en">${unit.previewVersion.title}</span>` : null}</h3>
    <p class="small muted">${t('neg.pv.meta', { track: trackName(d, tr), base: stageName(data, p.base) })}${unit && !unit.baseVersion ? ' ' + t('neg.pv.newUnit') : ''}</p>
    ${mine.length ? html`<p class="small">${t('neg.pv.changesRow', { n: mine.length, list: mine.map((c) => `${c.key ? unitCite(data, am.unit, c.key, work) : title} (${t('neg.pv.action.' + c.action)})`).join('; ') })}</p>`
      : html`<p class="small muted">${t('neg.pv.noChangeRow')}</p>`}
    ${unit ? html`<ol class="npv-blocks" id="pv-blocks">${blocks.map((b) => html`<li class=${'npv-b' + (b.changed ? ' is-changed' : '') + (hit(b.key) ? ' is-row' : '')} style=${{ '--dep': b.depth }}>
      ${b.label ? html`<span class="npv-l">${shownLabel(b)}</span>` : null}<div class="ncell legal npv-t" lang="en" dangerouslySetInnerHTML=${{ __html: b.html }}></div></li>`)}</ol>
      <p class="np-legend small"><ins>${t('neg.legend.ins')}</ins> <del>${t('neg.legend.del')}</del></p>` : null}
    ${unres.length ? html`<div class="npv-unres"><p class="nd-h">${t('neg.pv.unresolvedHead', { n: unres.length })}</p><ul>${unres.map((u) => html`<li lang=${u.lang}>${u.text}</li>`)}</ul><p class="small muted">${t('neg.pv.unresolvedNote')}</p></div>` : null}
    <div class="neg-actions">
      <a class="btn btn-secondary btn-sm" id="pv-open-sgk" href=${link}><${Icon} name="book" />${t('neg.pv.openSgk')}</a>
      <button type="button" class="btn btn-tertiary btn-sm" onClick=${() => go({ view: 'wirkung', r: null })}><${Icon} name="layers" />${t('neg.pv.toOverview')}</button>
    </div>
  </div>`;
}

// ------------------------------------------------------------------ Übersicht «Wirkung im SGK»
export function ImpactView({ route }) {
  const d = useDossier(route);
  if (!d) return html`<${NoDossier} route=${route} />`;
  return html`<${Impact} d=${d} />`;
}
function Impact({ d }) {
  const data = useData();
  const ds = data && data.ds;
  const [base, setBase] = useState(() => defaultBaseStage(d, ds));
  const list = useMemo(() => (ds ? previewTracks(d, ds, base) : []), [d, ds, base]);
  const other = d.rows.filter((r) => r.amends && r.amends.work && r.amends.work !== ((data && data.work && data.work.id) || 'sgk'));
  const rowsById = new Map(d.rows.map((r) => [r.id, r]));
  const rowName = (rid) => { const r = rowsById.get(rid); return r ? `${r.num ? r.num + ' | ' : ''}${r.label}` : visibleRowId(rid); };
  const nAm = d.rows.filter((r) => r.amends).length;
  return html`<div class="view"><main class="wide" id="main" tabindex="-1">
    <${PageHead} compact kicker=${d.short || d.title} title=${t('neg.pv.overTitle')} help=${html`<${HelpLink} view="n-anleitung" sec="vorschau" />`}>
      <p class="nhead-lead">${t('neg.pv.overLead')}</p>
    </${PageHead}>
    <${Hypo} />
    ${ds ? html`<div class="toolbar is-sm nd-toolbar"><label class="field"><span class="field-label">${t('neg.pv.base')}</span><select id="pvo-base" value=${base} onChange=${(e) => setBase(e.target.value)}>${enStages(ds).map((s) => html`<option value=${s.id}>${stageName(data, s.id)}</option>`)}</select></label>
      <p class="small muted nmax npv-basenote">${t('neg.pv.baseNote')}</p></div>` : null}
    ${!list.length ? html`<div class="neg-empty"><p class="empty-title">${t('neg.pv.overEmpty')}</p><p>${t('neg.pv.overEmptyText', { n: nAm })}</p></div>`
    : list.map(({ id, p }) => {
      const units = Object.entries(p.units);
      return html`<section class="nsec npv-track" aria-labelledby=${'pvo-' + id}>
        <h2 class="nsec-h" id=${'pvo-' + id}>${trackName(d, id)}</h2>
        <${Figures} items=${[
          { v: units.length, label: t('neg.pv.fUnits') },
          { v: p.stats.applied, label: t('neg.pv.fApplied'), sub: t('neg.pv.fOf', { n: p.stats.instructions }) },
          { v: p.stats.unresolved, label: t('neg.pv.fUnresolved'), warn: p.stats.unresolved > 0 },
          { v: p.stats.otherAct, label: t('neg.pv.fOtherAct') },
        ]} />
        ${units.length ? html`<div class="tbl-scroll"><table class="tbl-data npv-units"><thead><tr><th>${t('neg.pv.colUnit')}</th><th>${t('neg.pv.colChanges')}</th><th>${t('neg.pv.colRows')}</th><th><span class="sr">${t('neg.dossiers.colActions')}</span></th></tr></thead>
          <tbody>${units.map(([uid, u]) => { const acts = {}; for (const c of u.changes) acts[c.action] = (acts[c.action] || 0) + 1; const rows = [...new Set(u.changes.map((c) => c.row))]; return html`<tr>
            <td><b>${unitCite(data, uid, '')}</b>${!u.baseVersion ? html` <span class="tag tag-new">${t('neg.pv.newUnitShort')}</span>` : null}${u.previewVersion && u.previewVersion.title ? html`<span class="nlist-sub" lang="en">${u.previewVersion.title}</span>` : null}</td>
            <td class="small">${Object.entries(acts).map(([a, n]) => `${n} ${t('neg.pv.action.' + a)}`).join(', ')}</td>
            <td class="small">${rows.slice(0, 4).map((rid) => html`<button type="button" class="link npv-rowlink" title=${rowName(rid)} onClick=${() => openRow(rid, 'impact')}>${rowsById.get(rid) && rowsById.get(rid).num ? rowsById.get(rid).num : visibleRowId(rid)}</button>`)}${rows.length > 4 ? html` <span class="muted">+${rows.length - 4}</span>` : null}</td>
            <td class="nlist-act"><a class="btn btn-secondary btn-sm" href=${previewLink(d, uid, id, null)} id=${`pvo-link-${id}-${uid}`}><${Icon} name="book" />${t('neg.pv.openSgkShort')}</a></td>
          </tr>`; })}</tbody></table></div>` : null}
        ${p.unresolved.length ? html`<details class="npv-unres-d"><summary>${t('neg.pv.unresolvedHead', { n: p.unresolved.length })}</summary><ul class="npv-unres-l">${p.unresolved.map((u) => { const r = reasonText(u.reason, uiLang()); return html`<li><button type="button" class="link" onClick=${() => openRow(u.row, (rowsById.get(u.row) || {}).amends ? 'impact' : 'chron')}>${rowName(u.row)}</button>: <span lang=${r.lang}>${r.text}</span></li>`; })}</ul></details>` : null}
      </section>`; })}
    ${other.length ? html`<section class="nsec" aria-labelledby="pvo-other"><h2 class="nsec-h" id="pvo-other">${t('neg.pv.otherHead', { n: other.length })}</h2>
      <p class="small nmax">${t('neg.pv.otherText')}</p>
      <ul class="npv-other">${other.slice(0, 50).map((r) => html`<li><button type="button" class="link" onClick=${() => openRow(r.id, 'impact')}>${rowName(r.id)}</button> → ${unitCite(data, r.amends.unit, r.amends.key, r.amends.work)}</li>`)}</ul></section>` : null}
    <p class="small muted nmax npv-foot">${t('neg.pv.foot')}</p>
  </main></div>`;
}
export { sortedRows, docLabel };
