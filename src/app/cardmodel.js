// Kartenmodelle für den Text-Export (Etappe 3, Erweiterung 2): Word, Word mit Änderungsverfolgung, PDF mit Text, Zwischenablage.
// Gleicher Inhalt wie die Bildkarte (ui/card.js): Titel in Zitierweise, Abschnitte je Fassung bzw. Zeilen je Bestimmung, Legende, Quelle.
// Texte kommen fertig übersetzt aus der Oberfläche (Sprache der Karte = spec.ui).
import { CARBON } from './tokens.js';
import { htmlToRuns, redlineRuns, htmlTableToBlock, validateCard } from '../export/index.js';
import { blockSteps, unitSteps, actMetaLine, unitStepLabel, changeAppFor } from './ui/chronology.js';
import { compareRows, compareStats, shortCite } from './ui/compare.js';
import { cardTitle, cardSubtitle, sourceParts } from './ui/card.js';
import { formFor, sgkExtras } from './library.js';
import { rationaleFor } from './ui/rationale.js';
import { formCompareRows } from './ui/forms.js';
import { safeInline } from './lib/sanitize.js';
import { diffText } from './lib/diff.js';
import { cite } from './lib/cite.js';
import { fmtDate, plain, LANG_CODES } from './lib/format.js';
import { changeLabel } from './data.js';
import { t, uiLang, withUiLang } from './lib/i18n.js';
import { settingsStore } from './app.js';
import { blockSig } from './fallback-model.js';

const HEX = /^#[0-9a-f]{6}$/i;
const col = (data, c) => { const x = data.color(c); return HEX.test(x) ? x : CARBON['act-proposal']; };
const runsOf = (h) => { const r = htmlToRuns(h || ''); return r.length ? r : [{ t: '' }]; };
/** Redline zweier Blocktexte als Läufe (zeichengenau wie die Oberfläche) */
function red(oldT, newT) {
  if (oldT == null) return runsOf(safeInline(newT)).map((r) => ({ ...r, op: 'ins' }));
  if (newT == null) return runsOf(safeInline(oldT)).map((r) => ({ ...r, op: 'del' }));
  const a = safeInline(oldT), b = safeInline(newT);
  if (a === b) return runsOf(b);
  const d = diffText(a, b);
  return redlineRuns(d.oldHtml, d.newHtml, d.redline);
}

/** Datensatzblock als Kartenblock; prev = Vorfassung für Redline (undefined: ohne Redline) */
function cardBlock(data, unitId, b, lang, prev, depth = b.d || 0) {
  const base = { key: b.k, label: b.ty === 'heading' ? '' : b.l || '', depth: Math.min(8, depth) };
  if (b.ty === 'table') {
    try { return htmlTableToBlock(b.html || '', base); } catch { return { ...base, runs: runsOf(safeInline(b.t)) }; }
  }
  if (b.ty === 'heading') return { ...base, type: 'heading', runs: prev !== undefined ? red(prev ? prev.t : null, b.t) : runsOf(safeInline(b.t)) };
  if (b.ty === 'img') return { ...base, type: 'img', runs: [{ t: `[${t('blocks.figure')}] ${plain(b.t || '')}`.trim() }] };
  return { ...base, runs: prev !== undefined ? red(prev ? prev.t : null, b.t) : runsOf(safeInline(b.t)) };
}

/** Formular als Textblöcke (Transkription), optional mit Redline gegen die Vorfassung */
function formBlocks(data, unitId, b, prevB, lang, depth = 0) {
  const f = formFor(data, unitId, b, lang);
  if (!f || f.noText) return null;
  const head = { type: 'heading', depth, runs: [{ t: t('forms.cardHead'), i: true }] };
  if (prevB && prevB.ty === 'img') {
    const res = formCompareRows(data, unitId, prevB, b, lang);
    if (res) return [head, ...res.rows.map((r) => ({ key: (r.right || r.left).k, label: (r.right || r.left).l || '', depth, ...(r.status === 'ins' ? { op: 'ins' } : r.status === 'del' ? { op: 'del' } : {}), runs: red(r.left ? r.left.t : null, r.right ? r.right.t : null) }))];
  }
  return [head, ...f.blocks.map((x) => ({ key: x.k, label: x.l || '', depth, runs: runsOf(safeInline(x.t)) }))];
}

function flagsOf(data, stageId, celex) {
  const f = [];
  if (data.isReconstructed(stageId)) f.push({ kind: 'reconstructed', label: data.sourceLabel(stageId) });
  const st = data.stage(stageId);
  if (st && st.source && st.source.kind === 'preview') f.push({ kind: 'preview', label: t('preview.tag') });
  else if (data.isPending(celex)) f.push({ kind: 'not-applicable', label: data.status(celex).label || t('status.pending') });
  return f;
}
function appMeta(data, celex, unitId, key) {
  const r = changeAppFor(data, celex, unitId, key);
  if (!r) return [];
  const out = [];
  if (r.from) out.push(t('chron.thisChangeFrom', { date: fmtDate(r.from) }));
  if (r.until) out.push(t('chron.limitedUntil', { date: fmtDate(r.until), cite: r.untilKey ? cite(data.unitMeta(unitId), r.untilKey, uiLang(), null) : '' }) + (r.computed ? ` (${t('notice.computed')})` : ''));
  return out;
}
/** Begründung (optional, Einstellung «Begründung in Exportkarten») */
function ratBlocks(data, celex, unitId, key, lang) {
  if (!settingsStore.get().ratExport) return [];
  const list = rationaleFor(data, celex, unitId, key, lang);
  if (!list.length) return [];
  return [{ type: 'heading', depth: 0, runs: [{ t: `${t('rat.title')} (${t('rat.editorial')})`, i: true }] },
    ...list.map((x) => ({ label: `(${x.n})`, depth: 0, lang, runs: [{ t: `[${t('rat.' + x.strength)}] `, i: true, lang: uiLang() }, ...runsOf(safeInline(x.text))] }))];
}

function legendOf(data, acts, diff) {
  const out = [...new Set(acts)].filter((c) => c && c !== data.work.celex && data.act(c)).map((c) => ({ code: data.actCode(c), label: data.actName(c) + (data.isPending(c) ? ', ' + data.status(c).label : ''), color: col(data, c) }));
  if (diff) out.push({ op: 'ins', label: t('change.inserted') }, { op: 'del', label: t('change.deleted') });
  return out;
}

function head(data, spec) {
  const l = spec.lang || spec.la || 'de';
  const meta = data.unitMeta(spec.unit);
  const ti = data.unitTitle(spec.unit, l, spec.b || spec.a || data.latest.id);
  const ui = uiLang();
  return {
    title: cardTitle(data, spec),
    subtitle: data.preview ? `${t('preview.cardSub')}: ${data.stageLabel(data.preview.runs[data.preview.runs.length - 1].stage)}` : cardSubtitle(data, spec),
    unitLine: ti.label ? `${cite(meta, null, ui, null)}: ${plain(ti.label)}` : undefined,
    brand: 'SGK Navigator', work: data.work.short ? data.work.short[ui] || data.work.short.de : undefined,
    textLang: l, uiLang: ui,
    labels: { page: t('export.page', { i: '{i}', n: '{n}' }), tracked: t('export.trackedNote') },
  };
}

function chronologyCard(data, spec) {
  const lang = spec.lang;
  const sections = [];
  const acts = [];
  const stages = [];
  let diff = false;
  if (spec.kind === 'block') {
    const steps = blockSteps(data, spec.unit, lang, spec.key);
    steps.forEach((s, i) => {
      acts.push(s.origin); stages.push(s.stage);
      if (s.change !== 'base') diff = true;
      const b = s.block || s.prev;
      let blocks;
      if (b && b.ty === 'img') blocks = formBlocks(data, spec.unit, b, i > 0 ? s.prev : null, lang) || [cardBlock(data, spec.unit, b, lang, undefined, 0)];
      else if (b) blocks = [s.block ? cardBlock(data, spec.unit, s.block, lang, i === 0 ? undefined : s.prev || null, 0) : { ...cardBlock(data, spec.unit, s.prev, lang, undefined, 0), op: 'del', runs: red(s.prev.t, null) }];
      else blocks = [];
      sections.push({ heading: data.actName(s.origin), code: data.actCode(s.origin), tag: changeLabel(s.change), color: col(data, s.origin),
        meta: [actMetaLine(data, s.origin), data.status(s.origin).label, data.full ? '' : data.stageLabel(s.stage), ...appMeta(data, s.origin, spec.unit, spec.key)].filter(Boolean),
        flags: flagsOf(data, s.stage, s.origin), blocks: [...blocks, ...(s.change !== 'base' ? ratBlocks(data, s.origin, spec.unit, spec.key, lang) : [])] });
    });
  } else {
    const steps = unitSteps(data, spec.unit, lang);
    const meta = data.unitMeta(spec.unit);
    for (const s of steps) {
      acts.push(s.act); stages.push(s.stage);
      const blocks = [];
      if (s.first) for (const b of (s.version && s.version.blocks) || []) blocks.push(cardBlock(data, spec.unit, b, lang, undefined));
      for (const it of s.items) {
        diff = true;
        const lbl = it.key ? cite(meta, it.key, uiLang(), null) : it.title ? t('chron.heading') : t('common.wholeUnit');
        blocks.push({ type: 'heading', depth: 0, runs: [{ t: `${lbl}: ${changeLabel(it.change)}`, b: true, lang: uiLang() }] });
        if (it.b && it.b.ty === 'img') blocks.push(...(formBlocks(data, spec.unit, it.b, it.prev, lang) || [cardBlock(data, spec.unit, it.b, lang, undefined, 0)]));
        else if (it.b) blocks.push({ ...cardBlock(data, spec.unit, it.b, lang, it.change === 'deleted' ? undefined : it.prev || null, it.b.d || 0), ...(it.change === 'deleted' ? { op: 'del', runs: red(it.b.t, null) } : it.change === 'inserted' ? { op: 'ins' } : {}) });
        else if (it.title && it.html) blocks.push({ depth: 0, runs: runsOf(it.html) });
      }
      if (!s.first) blocks.push(...ratBlocks(data, s.act, spec.unit, null, lang));
      sections.push({ heading: data.actName(s.act), code: data.actCode(s.act), tag: unitStepLabel(data, s), color: col(data, s.act),
        meta: [actMetaLine(data, s.act), data.status(s.act).label, data.full ? '' : data.stageLabel(s.stage)].filter(Boolean), flags: flagsOf(data, s.stage, s.act), blocks: blocks.length ? blocks : [{ runs: [{ t: '—' }] }] });
    }
  }
  return { kind: 'chronology', sections, columns: null, legend: legendOf(data, acts, diff), stagesUsed: stages };
}

function compareCard(data, spec) {
  const mode = spec.cm || 'stand';
  const opts = mode === 'sprache' ? { a: spec.a, b: spec.a, la: spec.la, lb: spec.lb, key: spec.key, mode } : { a: spec.a, b: spec.b, la: spec.lang, lb: spec.lang, key: spec.key, mode };
  const res = compareRows(data, spec.unit, opts);
  const full = spec.sc === 'full' || mode === 'sprache';
  const vis = full ? res.rows : res.rows.filter((r) => r.status !== 'same');
  const STATUS = { same: 'same', changed: 'changed', ins: 'inserted', del: 'deleted', missing: 'changed' };
  const TAG = { changed: t('change.amended'), ins: t('change.inserted'), del: t('change.deleted'), missing: t('compare.missingLang') };
  const acts = [];
  const rows = [];
  const la = mode === 'sprache' ? spec.la : spec.lang, lb = mode === 'sprache' ? spec.lb : spec.lang;
  const mark = (blk, st) => (mode !== 'sprache' && blk && blk.o && blk.o !== data.work.celex && st !== 'same' ? (acts.push(blk.o), [{ label: data.actCode(blk.o), color: col(data, blk.o) }]) : []);
  if (res.titleChanged || (full && (res.va || res.vb))) {
    const ta = res.va && !res.va.repealed ? res.va.title || '' : '', tb = res.vb && !res.vb.repealed ? res.vb.title || '' : '';
    if (ta || tb) {
      const rr = mode === 'sprache' ? null : red(ta, tb);
      rows.push({ label: t('compare.titleRow'), status: res.titleChanged ? 'changed' : 'same', tag: res.titleChanged ? t('change.amended') : undefined,
        cells: [ta ? { blocks: [{ depth: 0, lang: la, runs: rr ? rr.filter((r) => r.op !== 'ins') : runsOf(safeInline(ta)) }] } : null, tb ? { blocks: [{ depth: 0, lang: lb, runs: rr ? rr.filter((r) => r.op !== 'del') : runsOf(safeInline(tb)) }] } : null] });
    }
  }
  for (const r of vis) {
    const label = shortCite(data, spec.unit, r.k, uiLang());
    // Formulare: Bildzeile in Zeilen je Formularpunkt auflösen (Formularvergleich)
    const fr = r.left && r.right && r.left.ty === 'img' && r.right.ty === 'img' ? formCompareRows(data, spec.unit, r.left, r.right, la, lb) : null;
    if (fr && fr.fa && fr.fb) {
      for (const x of fr.rows.filter((y) => full || y.status !== 'same' || mode === 'sprache')) {
        const st = mode === 'sprache' ? 'same' : x.status;
        const rr = mode === 'sprache' || st === 'same' ? null : red(x.left ? x.left.t : null, x.right ? x.right.t : null);
        rows.push({ label: `${label}, ${t('forms.short')} ${(x.right || x.left).l || (x.right || x.left).k}`, status: STATUS[st], tag: TAG[st],
          cells: [x.left ? { blocks: [{ label: x.left.l || '', depth: 0, lang: la, runs: rr ? rr.filter((q) => q.op !== 'ins') : runsOf(safeInline(x.left.t)) }] } : null,
            x.right ? { blocks: [{ label: x.right.l || '', depth: 0, lang: lb, runs: rr ? rr.filter((q) => q.op !== 'del') : runsOf(safeInline(x.right.t)) }] } : null] });
      }
      continue;
    }
    const rr = mode !== 'sprache' && r.status === 'changed' && r.left.ty !== 'table' && r.right.ty !== 'table' && r.left.ty !== 'img' ? red(r.left.t, r.right.t) : null;
    const cell = (blk, side) => {
      if (!blk) return null;
      let b = cardBlock(data, spec.unit, blk, side === 0 ? la : lb, undefined, 0);
      if (rr) b = { ...b, runs: rr.filter((q) => q.op !== (side === 0 ? 'ins' : 'del')) };
      else if (mode !== 'sprache' && r.status === 'ins' && b.runs) b = { ...b, runs: b.runs.map((q) => ({ ...q, op: 'ins' })) };
      else if (mode !== 'sprache' && r.status === 'del' && b.runs) b = { ...b, runs: b.runs.map((q) => ({ ...q, op: 'del' })) };
      return { blocks: [{ ...b, lang: side === 0 ? la : lb }], marks: side === 1 ? mark(blk, r.status) : [] };
    };
    rows.push({ label, status: STATUS[r.status] || 'same', tag: TAG[r.status], cells: [cell(r.left, 0), cell(r.right, 1)] });
  }
  if (!rows.length) rows.push({ label: '', status: 'same', cells: [{ blocks: [{ runs: [{ t: mode === 'sprache' ? t('compare.noBlocks') : t('compare.noDiff') }] }] }, null] });
  const trL = (r) => { const l = data.preview.trackLabel(r.track); return (l && (l[uiLang()] || l.de)) || r.track; };
  let hA = mode === 'sprache' ? `${t('lang.name.' + la)} (${LANG_CODES[la]})` : t('compare.headOld', { name: data.stageName(spec.a, { short: true }) });
  let hB = mode === 'sprache' ? `${t('lang.name.' + lb)} (${LANG_CODES[lb]})` : t('compare.headNew', { name: data.stageName(spec.b, { short: true }) });
  if (data.preview) {
    const runs = data.preview.runs;
    hA = runs.length > 1 ? t('preview.headTrack', { track: trL(runs[0]) }) : t('compare.headOld', { name: data.stageName(spec.a, { short: true }) });
    hB = t('preview.headTrack', { track: trL(runs[runs.length - 1]) });
  }
  const st = compareStats(res.rows);
  const card = {
    kind: data.preview ? 'preview' : 'comparison', sections: [], labelHeading: t('common.provision'),
    columns: [{ heading: hA, lang: la }, { heading: hB, lang: lb }], rows,
    stats: mode !== 'sprache' ? t('card.stats', { c: st.changed, i: st.ins, d: st.del }) : undefined,
    legend: legendOf(data, acts, mode !== 'sprache'), stagesUsed: mode === 'sprache' ? [spec.a] : [spec.a, spec.b],
  };
  // Redline (eine Spalte): Gegenüberstellung bleibt zweispaltig; Word mit Änderungsverfolgung zeigt die rechte Spalte als Überarbeitung.
  return card;
}

/** Kartenmodell zu einer Exportspezifikation (data passend zu spec: Werk bzw. Vorschau). */
export function cardModel(data, spec) {
  return withUiLang(spec.ui || uiLang(), () => {
    const body = spec.kind === 'compare' ? compareCard(data, spec) : chronologyCard(data, spec);
    const { stagesUsed, ...rest } = body;
    const src = sourceParts(data, spec, stagesUsed.filter(Boolean));
    const card = { ...head(data, spec), ...rest, source: src.source, disclaimer: src.disclaimer };
    if (!data.full) card.footnotes = [{ mark: '*', text: t('card.consFoot') }];
    for (const k of Object.keys(card)) if (card[k] === undefined) delete card[k];
    const v = validateCard(card);
    if (!v.ok) { console.warn('Kartenmodell ungültig', v.errors); throw new Error(t('export.invalidCard', { msg: v.errors.slice(0, 3).join('; ') })); }
    return card;
  });
}
export { sgkExtras };
