// Kartenmodelle nach src/export (Vertrag SPEC3 §3.9, §5) für die Karten des Moduls Verhandlung:
// Zeile, Chronologie einer Spur, Vergleich zweier Zellen, «Was ist neu», Wirkung im geltenden Recht (Vorschau).
// Alle Texte fertig übersetzt in der Oberflächensprache; Rechtstext Englisch (textLang "en").
import { t, uiLang } from '../../lib/i18n.js';
import { fmtDate, todayIso } from '../../lib/format.js';
import { htmlToRuns, redlineRuns } from '../../../export/model.js';
import { visibleRowId, topClassification, sanitizeInline, hasPosition } from './core.js';
import { trackName, docLabel } from './ui.js';
import { stripSource } from './rows.js';

const strip = (h) => stripSource(sanitizeInline(h || ''));
/** Inline-HTML einer Zelle (Quelle) in Läufe: gestrichener Quelltext entfällt, Diff-Markierung (ins/del) bleibt. */
export const cellRuns = (h) => { const r = htmlToRuns(String(h || '').replace(/<s>[\s\S]*?<\/s>/gi, '').replace(/<\/?u>/gi, '')); return r.length ? r : [{ t: '' }]; };
const plainRuns = (s) => [{ t: String(s || '') }];

function head(d, row, extra = {}) {
  const cls = topClassification(d);
  return {
    textLang: 'en', uiLang: uiLang(),
    brand: `SGK Navigator | ${t('neg.module')}`,
    work: cls && cls !== 'public' ? t('neg.class.' + cls + 'Long') : (d.procedure || d.short || ''),
    title: row ? (row.label || visibleRowId(row.id)) : (d.short || d.title),
    unitLine: `${d.short || d.title}${d.procedure ? ', ' + d.procedure : ''}${row ? ' | ' + t('neg.card.row', { id: visibleRowId(row.id), num: row.num || '–' }) : ''}`,
    legend: [{ op: 'ins', label: t('neg.legend.ins') }, { op: 'del', label: t('neg.legend.del') }],
    labels: { page: t('neg.cm.page'), pageOf: t('neg.cm.page'), empty: '—', tracked: t('neg.cm.tracked'), continued: t('neg.cm.continued') },
    ...extra,
  };
}
const sourceLine = (d, list) => `${t('neg.card.source', { list: list.filter(Boolean).join('; ') })} ${d.demo ? t('neg.card.demo') + ' ' : ''}${t('neg.card.created', { date: fmtDate(todayIso()) })}`.trim();

/** Karte «Zeile»: jüngste Fassung je Spur und CH-Position. */
export function rowModel(d, row) {
  const dm = new Map(d.documents.map((x) => [x.id, x]));
  const sections = [];
  const src = [];
  for (const tr of d.tracks) {
    const list = (d.cells[row.id] || {})[tr.id] || [];
    const c = list[list.length - 1];
    if (!c) continue;
    const doc = dm.get(c.doc);
    src.push(docLabel(doc));
    sections.push({ heading: trackName(d, tr.id), meta: [docLabel(doc), ...(c.status ? [t('neg.status.' + c.status)] : [])], blocks: [{ runs: c.empty ? plainRuns(t('neg.syn.cellEmpty')) : cellRuns(strip(c.html)) }] });
  }
  const p = d.positions[row.id];
  if (hasPosition(p)) {
    const blocks = [{ runs: [{ t: `${t('neg.pos.stance')}: ${t('neg.stance.' + (p.stance || 'none'))} | ${t('neg.pos.priority')}: ${t('neg.priority.' + p.priority)}`, b: true }], lang: uiLang() }];
    if (p.text) blocks.push({ runs: plainRuns(p.text), lang: uiLang() });
    if (p.proposal) blocks.push({ label: `${t('neg.pos.proposalShort')}:`, runs: plainRuns(p.proposal), lang: 'en' });
    if (p.fallback) blocks.push({ label: `${t('neg.pos.fallback')}:`, runs: plainRuns(p.fallback), lang: uiLang() });
    sections.push({ heading: t('neg.syn.colPos'), lang: uiLang(), blocks });
  }
  return { ...head(d, row), kind: 'row', subtitle: t('neg.cm.subRow'), sections, legend: [], source: sourceLine(d, src) };
}

/** Karte «Chronologie einer Spur»: Schritte aus der Chronologie (diffHtml, Fassung, Änderung, Status). */
export function chronModel(d, row, track, steps) {
  const dm = new Map(d.documents.map((x) => [x.id, x]));
  return {
    ...head(d, row), kind: 'chronology', subtitle: t('neg.card.subChron', { track: trackName(d, track) }),
    sections: steps.map((s) => ({
      heading: docLabel(dm.get(s.doc)), tag: t('neg.chg.' + s.change),
      meta: [...(s.status ? [t('neg.status.' + s.status)] : []), ...((s.sameIn || []).length ? [t('neg.detail.sameIn', { docs: s.sameIn.map((x) => docLabel(dm.get(x))).join('; ') })] : [])],
      blocks: [{ runs: s.empty ? plainRuns(t('neg.syn.cellEmpty')) : cellRuns(s.diffHtml || s.html) }],
    })),
    legend: steps.some((s) => s.diff) ? head(d).legend : [],
    source: sourceLine(d, steps.map((s) => docLabel(dm.get(s.doc)))),
  };
}

/** Karte «Vergleich zweier Zellen» (nebeneinander oder als Redline). res = compareCells(a, b). */
export function compareModel(d, row, A, B, res, layout) {
  const base = { ...head(d, row), kind: 'comparison', subtitle: t('neg.card.subCompare', { a: A.title, b: B.title }), source: sourceLine(d, [A.title, B.title]) };
  if (layout === 'redline') return { ...base, sections: [{ heading: `${A.title} → ${B.title}`, blocks: [{ runs: redlineRuns(strip(res.oldHtml), strip(res.newHtml), strip(res.redline)) }] }] };
  return {
    ...base,
    sections: [{ heading: A.title, blocks: [{ runs: cellRuns(strip(res.oldHtml)) }] }, { heading: B.title, blocks: [{ runs: cellRuns(strip(res.newHtml)) }] }],
    columns: [{ heading: A.title, sectionIndexes: [0] }, { heading: B.title, sectionIndexes: [1] }],
  };
}

/** Karte «Was ist neu in dieser Fassung»: je Spur die geänderten, neuen und entfallenen Zeilen. groups = changesOf(d, docId). */
export function changesModel(d, docId, groups, only = 'all') {
  const doc = d.documents.find((x) => x.id === docId);
  const html = (x) => (x.change === 'changed' ? x.diff.redline : x.change === 'new' ? '<ins>' + strip(x.b.html) + '</ins>' : x.change === 'removed' ? '<del>' + strip(x.a.html) + '</del>' : strip((x.b || x.a).html));
  const sections = groups.map((g) => {
    const items = g.items.filter((x) => only === 'all' || x.change === only);
    return { heading: trackName(d, g.track), meta: [t('neg.imp.nChanges', { n: items.length })], blocks: items.length ? items.flatMap((x) => [
      { type: 'heading', runs: plainRuns(`${x.num ? x.num + ' | ' : ''}${x.label} (${t('neg.imp.chg.' + x.change)})`), lang: uiLang() },
      { runs: cellRuns(html(x)) },
    ]) : [{ runs: plainRuns(t('neg.imp.noChanges')), lang: uiLang() }] };
  });
  return { ...head(d, null), kind: 'comparison', title: t('neg.cm.titleChanges', { doc: docLabel(doc) }), subtitle: t('neg.imp.whatsNew'), sections, source: sourceLine(d, [docLabel(doc)]) };
}

/**
 * Karte «Wirkung im geltenden Recht» (Vorschau): Bestimmung heute und nach dem Vorschlag als Redline.
 * blocks: [{ label, depth, html (Redline), op }] aus der Ansicht; meta: { cite, track, doc, base }.
 */
export function impactModel(d, row, { cite, trackLabel, baseLabel, blocks, unresolved = [] }) {
  const flags = [{ kind: 'preview', label: t('neg.pv.flag') }];
  const sec = {
    heading: cite, meta: [t('neg.pv.metaTrack', { track: trackLabel }), t('neg.pv.metaBase', { base: baseLabel })], flags,
    blocks: blocks.length ? blocks.map((b) => ({ label: b.label || undefined, depth: Math.min(8, Math.max(0, b.depth || 0)), runs: cellRuns(b.html), ...(b.op ? { op: b.op } : {}), key: b.key })) : [{ runs: plainRuns(t('neg.pv.noChange')), lang: uiLang() }],
  };
  const sections = [sec];
  if (unresolved.length) sections.push({ heading: t('neg.pv.unresolvedHead', { n: unresolved.length }), lang: uiLang(), blocks: unresolved.map((u) => ({ runs: plainRuns(u.text), lang: u.lang })) });
  return { ...head(d, row), kind: 'preview', subtitle: t('neg.pv.cardSub'), sections, disclaimer: t('neg.pv.disclaimer'), source: sourceLine(d, [trackLabel]) };
}
