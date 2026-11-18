// SGK-Navigator, Modul Verhandlung — Ausgaben: Verhandlungsbriefing, Positionsliste, Konsultationsbericht (ESM, isomorph, rein)
//
// positionRows(dossier, { rows?, filter?, variant? }) -> [{ rowId, num, label, text:{html, track, doc}, status, position, stale }]   (auch für Druckansicht)
// positionStats(rows) -> { byStance, byPriority, total, key:[…] }
// buildPositionDocx(dossier, { rows?, filter?, lang?, variant:"briefing"|"full"|"consultation-report"|"balance"|"meeting", consultationId?, meetingId?, zipTime? }) -> Uint8Array
//   "balance": Bilanz der CH-Anliegen (Ergebnis je Position, Vorschläge gekennzeichnet, Interventionen); "meeting": Sitzungsbericht
//   (Interventionen der Schweiz und Haltungen der Delegationen je Zeile in der Sitzung meetingId, Standard: jüngste Sitzung)
//   filter: { stance?:[…], priority?:[…], onlyOpen?:boolean (nicht vereinbarte Zeilen), withPosition?:boolean, stale?:boolean, group?:string }
//   sort: "order" (Standard) | "priority"

import { CARBON } from '../app/tokens.js';
/** Carbon-Farbe für Word (ohne '#'); Schrift bleibt Arial. */
const W = (k) => CARBON[k].slice(1).toUpperCase();
import { sortedRows, docsByDate, latestCell, PRIORITIES, STANCES } from './model.js';
import { stalePositions, rowStatus } from './history.js';
import { aggregateConsultation } from './consultation.js';
import { T, formatDate } from './i18n.js';
import { para, run, htmlRuns, table, field, packageDocx } from './docx-write.js';
import { balance, stanceMatrix, meetingsByDate, ensureDelegations, OUTCOMES } from './delegations.js';

const TRACK_PREF = ['agreement', 'council', 'ep', 'com'];

function currentText(dossier, rowId, pos) {
  const tracks = pos && pos.basis && pos.basis.track ? [pos.basis.track, ...TRACK_PREF] : TRACK_PREF;
  for (const t of tracks) { const c = latestCell(dossier, rowId, t); if (c && !c.empty) return { html: c.html, track: t, doc: c.doc }; }
  return { html: '', track: null, doc: null };
}

export function positionRows(dossier, { rows: only, filter = {}, variant = 'briefing', sort = 'order' } = {}) {
  const stale = new Set(stalePositions(dossier));
  const want = only ? new Set(only) : null;
  let out = [];
  for (const r of sortedRows(dossier)) {
    if (want && !want.has(r.id)) continue;
    const pos = dossier.positions[r.id] || null;
    if ((variant === 'briefing' || filter.withPosition) && (!pos || pos.stance === 'none' && !pos.text)) continue;
    if (filter.stance && filter.stance.length && (!pos || !filter.stance.includes(pos.stance))) continue;
    if (filter.priority && filter.priority.length && (!pos || !filter.priority.includes(pos.priority))) continue;
    const status = rowStatus(dossier, r.id);
    if (filter.onlyOpen && status === 'agreed') continue;
    if (filter.stale && !stale.has(r.id)) continue;
    if (filter.group && r.group !== filter.group) continue;
    out.push({ rowId: r.id, num: r.num, label: r.label, group: r.group, text: currentText(dossier, r.id, pos), status, position: pos, stale: stale.has(r.id) });
  }
  if (sort === 'priority') out = out.slice().sort((a, b) => PRIORITIES.indexOf(a.position?.priority) - PRIORITIES.indexOf(b.position?.priority));
  return out;
}

export function positionStats(rows) {
  const byStance = {}, byPriority = {};
  for (const r of rows) {
    if (!r.position) continue;
    byStance[r.position.stance] = (byStance[r.position.stance] || 0) + 1;
    byPriority[r.position.priority] = (byPriority[r.position.priority] || 0) + 1;
  }
  const key = rows.filter((r) => r.position && (r.position.priority === 'redline' || r.position.priority === 'high'))
    .sort((a, b) => PRIORITIES.indexOf(a.position.priority) - PRIORITIES.indexOf(b.position.priority));
  return { byStance, byPriority, total: rows.filter((r) => r.position).length, key };
}

function htmlParas(html, base = {}) {
  return String(html || '').split(/<br\s*\/?>/).map((h) => para(htmlRuns(h, { lang: 'en-GB', ...base }), { style: 'TableText' })).join('') || para('', { style: 'TableText' });
}

export function buildPositionDocx(dossier, opts = {}) {
  const lang = opts.lang || 'de';
  const L = T(lang);
  const variant = opts.variant || 'briefing';
  const B = [];
  const docs = docsByDate(dossier);
  const last = docs[docs.length - 1];
  const asOf = (opts.asOf || new Date().toISOString()).slice(0, 10);
  if (dossier.demo) B.push(para(run(L.demo, { b: true, color: W('error-text') }), { style: 'Notice' }));
  B.push(para(run(L.classification.internal, { b: true }), { style: 'Notice' }));
  const meeting = variant === 'meeting' ? ((dossier.meetings || []).find((m) => m.id === opts.meetingId) || meetingsByDate(dossier).slice(-1)[0] || null) : null;
  const title = variant === 'consultation-report' ? L.report : variant === 'full' ? L.full : variant === 'balance' ? L.balanceTitle : variant === 'meeting' ? L.meetingReport : L.briefing;
  const colon = lang === 'fr' ? ' : ' : ': ';
  B.push(para(`${title}${colon}${dossier.short || dossier.title}`, { style: 'Title' }));
  B.push(table([
    [L.dossier, dossier.title], [L.procedure, dossier.procedure || ''],
    [L.basis, last ? `${last.ref || last.id}${last.date ? `, ${formatDate(last.date, lang)}` : ''}` : ''], [L.asOf, formatDate(asOf, lang)],
  ].map(([a, b]) => ({ cells: [{ content: para(run(a, { b: true }), { style: 'TableText' }), fill: W('surface-1') }, { content: para(b, { style: 'TableText' }) }] })), { widths: [2600, 6900] }));

  if (variant === 'balance') B.push(...balanceBody(dossier, L, lang));
  else if (variant === 'meeting') B.push(...meetingBody(dossier, meeting, L, lang));
  else if (variant === 'consultation-report') {
    const agg = aggregateConsultation(dossier, opts.consultationId || (dossier.consultations[0] || {}).id);
    if (!agg) { B.push(para(L.noResponses)); }
    else {
      B.push(para(`${agg.consultation.title} [${agg.consultation.id}]`, { style: 'Heading1' }));
      B.push(table([
        { header: true, cells: [L.office, L.responses, L.decisionL].map((h) => ({ content: para(run(h, { b: true }), { style: 'TableHead' }), fill: W('surface-2') })) },
        ...agg.offices.map((o) => ({ cells: [{ content: para(`${o.name}${o.abbr && o.abbr !== o.name ? ` (${o.abbr})` : ''}`, { style: 'TableText' }) }, { content: para(String(o.items), { style: 'TableText' }) }, { content: para(`${o.decided}/${o.items}`, { style: 'TableText' }) }] })),
      ], { widths: [5000, 2000, 2500] }));
      const rowsWith = agg.rows.filter((r) => r.items.length);
      if (!rowsWith.length) B.push(para(L.noResponses));
      for (const r of rowsWith) {
        B.push(para(`${r.num ? r.num + ' – ' : ''}${r.label}`, { style: 'Heading2' }));
        B.push(table([
          { header: true, cells: [L.office, L.item, L.decisionL, L.reply].map((h) => ({ content: para(run(h, { b: true }), { style: 'TableHead' }), fill: W('surface-2') })) },
          ...r.items.map((it) => ({
            cells: [
              { content: para(it.office.abbr || it.office.name, { style: 'TableText' }) },
              { content: [it.comment ? para(it.comment, { style: 'TableText' }) : '', it.proposal ? para(run(it.proposal, { i: true, lang: 'en-GB' }), { style: 'TableText' }) : ''].join('') || para('', { style: 'TableText' }) },
              { content: para(run(L.decision[it.decision] || it.decision, { b: true }), { style: 'TableText' }) },
              { content: para(it.reply || '', { style: 'TableText' }) },
            ],
          })),
        ], { widths: [1900, 4100, 1500, 2000] }));
      }
      if (agg.general.length) {
        B.push(para(L.general, { style: 'Heading1' }));
        for (const g of agg.general) { const o = agg.offices.find((x) => x.id === g.office) || {}; B.push(para(run(`${o.abbr || o.name || ''}: `, { b: true }) + run(g.text))); }
      }
      if (agg.unmatched.length) {
        B.push(para(L.unmatched, { style: 'Heading1' }));
        for (const u of agg.unmatched) { const o = agg.offices.find((x) => x.id === u.office) || {}; B.push(para(run(`${o.abbr || ''}: `, { b: true }) + run(u.text))); }
      }
    }
  } else {
    const rows = positionRows(dossier, { rows: opts.rows, filter: opts.filter, variant, sort: opts.sort });
    const st = positionStats(rows);
    B.push(para(L.overview, { style: 'Heading1' }));
    const statRows = (obj, labels, order) => order.filter((k) => obj[k]).map((k) => ({ cells: [{ content: para(labels[k] || k, { style: 'TableText' }) }, { content: para(String(obj[k]), { style: 'TableText', align: 'right' }) }] }));
    B.push(table([
      { header: true, cells: [{ content: para(run(L.byStance, { b: true }), { style: 'TableHead' }), fill: W('surface-2') }, { content: para(run(L.count, { b: true }), { style: 'TableHead' }), fill: W('surface-2') }] },
      ...statRows(st.byStance, L.stance, STANCES),
      { header: false, cells: [{ content: para(run(L.byPriority, { b: true }), { style: 'TableHead' }), fill: W('surface-2') }, { content: para(run(L.count, { b: true }), { style: 'TableHead' }), fill: W('surface-2') }] },
      ...statRows(st.byPriority, L.priority, PRIORITIES),
    ], { widths: [4000, 1200] }));
    if (st.key.length) {
      B.push(para(L.keyPoints, { style: 'Heading2' }));
      for (const r of st.key) B.push(para(run(`${r.num ? r.num + ' ' : ''}${r.label}: `, { b: true }) + run(`${L.stance[r.position.stance] || r.position.stance} (${L.priority[r.position.priority] || r.position.priority})${r.position.text ? ' – ' + firstSentence(r.position.text) : ''}`)));
    }
    if (!rows.length) B.push(para(L.noPositions));
    B.push(para(variant === 'full' ? L.full : L.position, { style: 'Heading1', pageBreakBefore: rows.length > 0 }));
    const tRows = [{ header: true, cells: [L.colNum, L.colLabel, L.currentText, L.position].map((h) => ({ content: para(run(h, { b: true }), { style: 'TableHead' }), fill: W('surface-2') })) }];
    for (const r of rows) {
      const p = r.position;
      const posXml = p ? [
        para(run(`${L.stanceL}: `, { b: true }) + run(L.stance[p.stance] || p.stance) + run(` · ${L.priorityL}: `, { b: true }) + run(L.priority[p.priority] || p.priority || ''), { style: 'TableText' }),
        p.text ? para(run(`${L.core}: `, { b: true }) + run(p.text), { style: 'TableText' }) : '',
        p.proposal ? para(run(`${L.proposal}: `, { b: true }) + run(p.proposal, { i: true, lang: 'en-GB' }), { style: 'TableText' }) : '',
        p.fallback ? para(run(`${L.fallback}: `, { b: true }) + run(p.fallback), { style: 'TableText' }) : '',
        p.owner ? para(run(`${L.owner}: `, { b: true }) + run(p.owner), { style: 'TableText' }) : '',
        r.stale ? para(run(L.staleHint, { b: true, color: W('error-text') }), { style: 'TableText' }) : '',
      ].join('') : para(L.none, { style: 'TableText' });
      const fill = p && p.priority === 'redline' ? W('error-bg') : null;
      tRows.push({ cells: [
        { content: para(run(r.num || '', { b: true }), { style: 'TableText' }) },
        { content: para(r.label || '', { style: 'TableText' }) + (r.status ? para(run(L.status[r.status] || r.status, { i: true }), { style: 'Small' }) : '') + (r.text.track ? para(run(`${L.source}: ${L.track[r.text.track] || r.text.track}`, { i: true }), { style: 'Small' }) : '') },
        { content: htmlParas(r.text.html) },
        { content: posXml, fill },
      ] });
    }
    if (rows.length) B.push(table(tRows, { widths: [700, 1900, 6870, 5100] }));
  }
  const footer = run(`${dossier.procedure || ''} · ${title} · ${L.classification.internal.split(' – ')[0]}`, { sz: 14 }) + '<w:r><w:tab/></w:r>' + run(`${L.page} `, { sz: 14 }) + field('PAGE', { sz: 14 }) + run(` ${L.of} `, { sz: 14 }) + field('NUMPAGES', { sz: 14 });
  return packageDocx({ body: B.join(''), landscape: !['consultation-report', 'meeting'].includes(variant), footer, lang: lang === 'fr' ? 'fr-CH' : 'de-CH', title: `${title} – ${dossier.short || dossier.title}`, custom: { sgkKind: `neg-${variant}`, sgkDossier: dossier.id }, zipTime: opts.zipTime });
}

function firstSentence(t) { const m = /^(.{20,220}?[.!?])(\s|$)/.exec(String(t)); return m ? m[1] : String(t).slice(0, 220); }

// ------------------------------------------------------------------ Bilanz und Sitzungsbericht (SPEC3 §3.7)

const head = (labels, fill = W('surface-2')) => ({ header: true, cells: labels.map((h) => ({ content: para(run(h, { b: true }), { style: 'TableHead' }), fill })) });
const cellP = (t, fmt) => ({ content: para(fmt ? run(t, fmt) : t, { style: 'TableText' }) });
const delegName = (dg, lang) => (dg ? (dg.abbr && dg.abbr[lang]) || dg.code || (dg.name && dg.name[lang]) || dg.id : '');
const OUT_FILL = { achieved: W('success-bg'), partly: W('warning-bg'), not: W('error-bg'), open: null, obsolete: W('surface-1'), unset: null };

function balanceBody(dossier, L, lang) {
  const B = [];
  const bal = balance(dossier, { suggest: true });
  const meetings = new Map((dossier.meetings || []).map((m) => [m.id, m]));
  const docs = new Map(dossier.documents.map((x) => [x.id, x]));
  B.push(para(L.overview, { style: 'Heading1' }));
  const order = [...OUTCOMES, 'unset'];
  B.push(table([
    head([L.byOutcome, L.count]),
    ...order.filter((k) => bal.byOutcome[k]).map((k) => ({ cells: [cellP(L.outcome[k] || k), { content: para(String(bal.byOutcome[k]), { style: 'TableText', align: 'right' }) }] })),
    { cells: [cellP(L.concerns, { b: true }), { content: para(run(String(bal.total), { b: true }), { style: 'TableText', align: 'right' }) }] },
  ], { widths: [4200, 1200] }));
  if (bal.achievedShare !== null) B.push(para(`${L.achievedShare}${lang === 'fr' ? ' : ' : ': '}${Math.round(bal.achievedShare * 100)} %`));
  const prios = PRIORITIES.filter((p) => bal.byPriority[p]);
  if (prios.length) {
    B.push(para(L.byPriority, { style: 'Heading2' }));
    B.push(table([
      head([L.priorityL, ...order.map((k) => L.outcome[k])]),
      ...prios.map((p) => ({ cells: [cellP(L.priority[p] || p), ...order.map((k) => ({ content: para(String(bal.byPriority[p][k] || 0), { style: 'TableText', align: 'right' }) }))] })),
    ], { widths: [1800, ...order.map(() => 1250)] }));
  }
  if (bal.interventions.total) {
    B.push(para(`${L.interventions}${lang === 'fr' ? ' : ' : ': '}${bal.interventions.total} (${Object.entries(bal.interventions.byResult).map(([k, v]) => `${L.interventionResult[k] || k} ${v}`).join(', ')})`));
  }
  B.push(para(L.concerns, { style: 'Heading1', pageBreakBefore: bal.rows.length > 6 }));
  if (!bal.rows.length) { B.push(para(L.noPositions)); return B; }
  const rows = [head([L.colNum, L.colLabel, L.position, L.outcomeL, L.interventions])];
  for (const r of bal.rows) {
    const pos = [
      para(run(`${L.stanceL}: `, { b: true }) + run(L.stance[r.stance] || r.stance) + run(` · ${L.priorityL}: `, { b: true }) + run(L.priority[r.priority] || r.priority || ''), { style: 'TableText' }),
      r.text ? para(run(r.text), { style: 'TableText' }) : '',
      r.proposal ? para(run(`${L.proposal}: `, { b: true }) + run(r.proposal, { i: true, lang: 'en-GB' }), { style: 'TableText' }) : '',
    ].join('');
    let out, fill;
    if (r.outcome) {
      const ref = r.outcome.doc && docs.get(r.outcome.doc) ? docs.get(r.outcome.doc).ref || r.outcome.doc : null;
      out = para(run(L.outcome[r.outcome.status] || r.outcome.status, { b: true }), { style: 'TableText' })
        + (r.outcome.note ? para(r.outcome.note, { style: 'TableText' }) : '')
        + (ref ? para(run(`${L.referenceDoc}: ${ref}`, { i: true }), { style: 'Small' }) : '');
      fill = OUT_FILL[r.outcome.status];
    } else if (r.suggestion) {
      out = para(run(`${L.suggestion}: `, { i: true }) + run(L.outcome[r.suggestion.status] || r.suggestion.status, { b: true, i: true }), { style: 'TableText' })
        + para(run(r.suggestion.reason[lang === 'fr' ? 'fr' : 'de'], { i: true }), { style: 'Small' });
    } else out = para(L.outcome.unset, { style: 'TableText' });
    const iv = r.interventions.length ? r.interventions.map((x) => {
      const m = x.meeting ? meetings.get(x.meeting) : null;
      return para(`${m ? `${formatDate(m.date, lang)} ${m.body || ''}`.trim() : L.none}: ${L.interventionResult[x.result] || x.result}`, { style: 'TableText' });
    }).join('') : para(L.none, { style: 'TableText' });
    rows.push({ cells: [cellP(r.num || '', { b: true }), cellP(r.label || ''), { content: pos }, { content: out, fill }, { content: iv }] });
  }
  B.push(table(rows, { widths: [700, 2300, 5600, 3900, 2070] }));
  if (bal.rows.some((r) => !r.outcome && r.suggestion)) B.push(para(run(L.suggestionHint, { i: true }), { style: 'Small' }));
  return B;
}

function meetingBody(dossier, meeting, L, lang) {
  const B = [];
  if (!meeting) { B.push(para(L.noInterventions)); return B; }
  const docs = new Map(dossier.documents.map((x) => [x.id, x]));
  const rowsById = new Map(dossier.rows.map((r) => [r.id, r]));
  B.push(para(`${meeting.title || L.meeting}`, { style: 'Heading1' }));
  B.push(table([
    [L.date, formatDate(meeting.date, lang)], [L.body, meeting.body || ''],
    [L.docs, (meeting.docs || []).map((id) => (docs.get(id) || {}).ref || id).join(', ') || L.none],
    ...(meeting.note ? [[L.note, meeting.note]] : []),
  ].map(([a, b]) => ({ cells: [{ content: para(run(a, { b: true }), { style: 'TableText' }), fill: W('surface-1') }, { content: para(b, { style: 'TableText' }) }] })), { widths: [2200, 7300] }));
  // Interventionen der Schweiz
  B.push(para(L.interventions, { style: 'Heading1' }));
  const ivs = (dossier.interventions || []).filter((x) => x.meeting === meeting.id);
  const sortedIvs = ivs.slice().sort((a, b) => ((rowsById.get(a.row) || {}).order ?? 1e12) - ((rowsById.get(b.row) || {}).order ?? 1e12));
  if (!ivs.length) B.push(para(L.noInterventions));
  else {
    B.push(table([
      head([L.colLabel, L.intervention, L.result]),
      ...sortedIvs.map((x) => { const r = rowsById.get(x.row); return { cells: [
        cellP(r ? `${r.num ? r.num + ' – ' : ''}${r.label}` : L.withoutRow),
        { content: para(x.text || '', { style: 'TableText' }) + (x.note ? para(run(x.note, { i: true }), { style: 'Small' }) : '') },
        cellP(L.interventionResult[x.result] || x.result, { b: true }),
      ] }; }),
    ], { widths: [2600, 5000, 1900] }));
  }
  // Haltungen der Delegationen je Zeile
  B.push(para(L.stancesL, { style: 'Heading1' }));
  const dels = new Map(ensureDelegations(dossier).delegations.map((x) => [x.id, x]));
  const mx = stanceMatrix(dossier, { meeting: meeting.id });
  if (!mx.rows.length) B.push(para(L.noStances));
  for (const r of mx.rows) {
    B.push(para(`${r.num ? r.num + ' – ' : ''}${r.label}`, { style: 'Heading2' }));
    const cur = currentText(dossier, r.rowId, dossier.positions[r.rowId]);
    if (cur.html) B.push(para(run(`${L.currentText} (${L.track[cur.track] || cur.track}, ${(docs.get(cur.doc) || {}).ref || cur.doc})${lang === 'fr' ? ' : ' : ': '}`, { b: true, sz: 16 }) + run(htmlToShort(cur.html), { sz: 16, lang: 'en-GB' }), { style: 'Small' }));
    B.push(table([
      head([L.delegation, L.stanceL, L.stanceText]),
      ...Object.entries(r.cells).map(([dg, c]) => ({ cells: [cellP(delegName(dels.get(dg), lang)), cellP(L.delegStance[c.stance] || c.stance, { b: true }), cellP(c.text || '')] })),
    ], { widths: [1800, 2000, 5700] }));
  }
  return B;
}

function htmlToShort(html) {
  const t = String(html || '').replace(/<s>[\s\S]*?<\/s>/g, '').replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  return t.length > 400 ? `${t.slice(0, 400)} …` : t;
}
