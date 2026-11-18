// Testzugang (window.__sgk.neg.cards): alle Kartenmodelle einer Zeile mit echten Daten, wie die Oberfläche sie erzeugt.
import { rowHistory, compareCells, docMap, docsByDate, defaultBaseStage, previewFor, reasonText, visibleRowId } from './core.js';
import { rowModel, chronModel, compareModel, changesModel, impactModel } from './cardmodel.js';
import { changesOf } from './importview.js';
import { impactBlocks, unitCite } from './impact.js';
import { trackName, docLabel } from './ui.js';
import { dataStore } from '../../app.js';
import { uiLang } from '../../lib/i18n.js';

export function cardsForRow(d, rowId) {
  const row = d.rows.find((r) => r.id === rowId);
  const out = { row: rowModel(d, row) };
  const tr = d.tracks.map((x) => x.id).find((id) => ((d.cells[rowId] || {})[id] || []).some((c) => !c.empty));
  if (tr) {
    const h = rowHistory(d, rowId, tr).map((s, i, a) => { const prev = i ? a[i - 1] : null; const diff = !!(prev && !s.empty && !prev.empty && s.change === 'changed'); return { ...s, diffHtml: diff ? compareCells(prev.html, s.html, { clean: true }).redline : s.html, diff, sameIn: [] }; });
    out.chron = chronModel(d, row, tr, h);
  }
  const dm = docMap(d);
  const cells = [];
  for (const x of d.tracks) for (const c of (d.cells[rowId] || {})[x.id] || []) if (!c.empty) cells.push({ key: `${x.id}:${c.doc}`, cell: c, track: x.id, title: `${trackName(d, x.id)}, ${docLabel(dm.get(c.doc), { date: false })}` });
  if (cells.length >= 2) {
    const A = cells[0], B = cells[cells.length - 1];
    const res = compareCells(A.cell.html, B.cell.html, { clean: true });
    out.compareSide = compareModel(d, row, A, B, res, 'side');
    out.compareRedline = compareModel(d, row, A, B, res, 'redline');
  }
  const last = docsByDate(d).slice(-1)[0];
  if (last) out.changes = changesModel(d, last.id, changesOf(d, last.id));
  const data = dataStore.get();
  if (row.amends && row.amends.unit && data && data.ds) {
    const base = defaultBaseStage(d, data.ds);
    for (const x of ['agreement', 'council', 'ep', 'com']) {
      const p = previewFor(d, data.ds, { track: x, baseStage: base });
      const u = !p.error && p.units[row.amends.unit];
      if (!u) continue;
      const unres = p.unresolved.filter((z) => (z.rows || [z.row]).includes(rowId)).map((z) => reasonText(z.reason, uiLang()));
      out.impact = impactModel(d, row, { cite: unitCite(data, row.amends.unit, ''), trackLabel: trackName(d, x), baseLabel: data.stageOption(p.base), blocks: impactBlocks(u), unresolved: unres });
      break;
    }
  }
  return out;
}
export { visibleRowId };
