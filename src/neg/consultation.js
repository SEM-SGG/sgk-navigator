// SGK-Navigator, Modul Verhandlung — Ämterkonsultation (ESM, isomorph, rein)
//
// consultationRows(dossier, consultationId) -> [{ rowId, num, label, html, diffHtml, status, position, others }]   (für Word und Druckansicht)
// buildConsultationDocx(dossier, consultationId, { office?, lang?, otherTracks?, zipTime? }) -> Uint8Array
// parseConsultationDocx(bytes) -> { consultationId, dossierId, office, items:[{rowId, comment, proposal, proposalHtml?, source, author?}], general, unmatched:[…], warnings }
// importResponse(dossier, consultationId, parsed, { office?, file?, now? }) -> { dossier, responseId, warnings }
// aggregateConsultation(dossier, consultationId) -> { consultation, rows:[…], offices:[…], stats, general:[…], unmatched:[…] }
//
// Dokumentformat (SPEC2 §5.2, Details in data/NEG_NOTES.md): A4 quer, Arial 9 pt; Kopfteil (Tabelle mit Metadaten),
// Anleitung, Vertraulichkeitsvermerk; Haupttabelle Nr. | Bestimmung | Text (EN) | Position CH (Entwurf) | Kommentar der Stelle |
// Textvorschlag der Stelle; Kopfzeile der Tabelle wiederholt; jede Zeile trägt sichtbar "Z-000120" (Zeilen-Id) und eine
// Textmarke "sgk_r000120"; Dossier-/Runden-Id als benutzerdefinierte Eigenschaften (sgkDossier, sgkConsultation, sgkOffice)
// und in der Fusszeile; am Schluss Tabelle "Allgemeine Bemerkungen".

import { CARBON } from '../app/tokens.js';
/** Carbon-Farbe für Word (ohne '#'); Schrift bleibt Arial. */
const W = (k) => CARBON[k].slice(1).toUpperCase();
import { findConsultation, sortedRows, docsByDate, latestCell } from './model.js';
import { compareCells } from './diff.js';
import { T, visibleRowId, rowIdFromVisible, formatDate } from './i18n.js';
import { para, run, htmlRuns, table, field, packageDocx } from './docx-write.js';
import { readDocx, flatParas, runsToSegments, blocksHtml } from './docx-read.js';
import { segmentsToHtml, htmlToText, htmlToCleanText, escapeHtml, clone, warn } from './util.js';

const nowIso = () => new Date().toISOString();

function cellIn(dossier, rowId, track, docId) {
  return ((dossier.cells[rowId] || {})[track] || []).find((c) => c.doc === docId) || null;
}

/** Aufbereitete Zeilen einer Runde (auch für die Druckansicht der Oberfläche) */
export function consultationRows(dossier, consultationId, { otherTracks = [] } = {}) {
  const k = findConsultation(dossier, consultationId);
  if (!k) return [];
  const basis = k.basis || {};
  const rows = sortedRows(dossier);
  const scope = k.scope && k.scope.length ? new Set(k.scope) : null;
  const out = [];
  for (const r of rows) {
    if (scope && !scope.has(r.id)) continue;
    const cur = basis.doc ? (cellIn(dossier, r.id, basis.track, basis.doc) || latestCell(dossier, r.id, basis.track, { upToDoc: basis.doc })) : latestCell(dossier, r.id, basis.track);
    const ctrack = basis.compareTrack || basis.track;
    const prev = basis.compareTo ? (cellIn(dossier, r.id, ctrack, basis.compareTo) || latestCell(dossier, r.id, ctrack, { upToDoc: basis.compareTo })) : null;
    const html = cur && !cur.empty ? cur.html : '';
    let diffHtml = html, marked = false;
    // Vergleich nur, wenn eine Vorfassung mit Text besteht; sonst Text ohne Markierung
    if (basis.compareTo && prev && !prev.empty && html) {
      const d = compareCells(prev.html, html, { clean: true });
      diffHtml = d.redline; marked = true;
    }
    const others = otherTracks.map((t) => { const c = latestCell(dossier, r.id, t, basis.doc ? { upToDoc: basis.doc } : {}); return { track: t, html: c && !c.empty ? c.html : '' }; });
    out.push({ rowId: r.id, num: r.num, label: r.label, html, diffHtml, marked, status: cur ? cur.status || null : null, position: dossier.positions[r.id] || null, others });
  }
  return out;
}

export function buildConsultationDocx(dossier, consultationId, opts = {}) {
  const k = findConsultation(dossier, consultationId);
  if (!k) throw new Error(`Konsultation ${consultationId} nicht gefunden`);
  const lang = opts.lang || k.lang || 'de';
  const L = T(lang);
  const office = opts.office ? (k.offices || []).find((o) => o.id === opts.office || o.abbr === opts.office) || { id: opts.office, abbr: opts.office, name: opts.office } : null;
  const docs = docsByDate(dossier);
  const bdoc = docs.find((d) => d.id === (k.basis || {}).doc);
  const cdoc = docs.find((d) => d.id === (k.basis || {}).compareTo);
  const classification = (bdoc && bdoc.classification) || 'internal';
  const otherTracks = opts.otherTracks || [];
  const rows = consultationRows(dossier, consultationId, { otherTracks });
  const B = [];
  // Kopf
  if (dossier.demo) B.push(para(run(L.demo, { b: true, color: W('error-text') }), { style: 'Notice' }));
  B.push(para(run(`${L.classification[classification] || classification}`, { b: true }), { style: 'Notice' }));
  B.push(para(`${L.consultation}: ${dossier.short || dossier.title}`, { style: 'Title' }));
  const meta = [
    [L.dossier, `${dossier.title}${dossier.id ? ` [${dossier.id}]` : ''}`],
    [L.procedure, dossier.procedure || ''],
    [L.round, `${k.title} [${k.id}]`],
    [L.basis, bdoc ? `${bdoc.ref || bdoc.id}${bdoc.date ? `, ${formatDate(bdoc.date, lang)}` : ''}${bdoc.title ? ` – ${bdoc.title}` : ''} (${L.track[(k.basis || {}).track] || (k.basis || {}).track || ''})` : ''],
    ...(cdoc ? [[L.comparedTo, `${cdoc.ref || cdoc.id}${cdoc.date ? `, ${formatDate(cdoc.date, lang)}` : ''} (${L.track[(k.basis || {}).compareTrack || (k.basis || {}).track] || ''})`]] : []),
    [L.deadline, k.deadline ? formatDate(k.deadline, lang) : ''],
    [L.office, office ? `${office.name || office.abbr}${office.abbr && office.name ? ` (${office.abbr})` : ''}` : L.officeFill],
  ];
  B.push(table(meta.map(([a, b], i) => ({ cells: [{ content: para(run(a, { b: true }), { style: 'TableText' }), fill: W('surface-1') }, { content: para(run(b, i === meta.length - 1 && !office ? { i: true, color: W('ink-subtle') } : {}), { style: 'TableText' }) }] })), { widths: [3200, 11370] }));
  B.push(para(run(L.howTo, { b: true }), { spacingBefore: 160 }));
  for (const t of L.howToText) B.push(para(`– ${t}`));
  if (cdoc) B.push(para(run(L.markLegend, { i: true })));
  B.push(para(run(L.confidentialHint, { i: true, color: W('ink-subtle') }), { spacingAfter: 160 }));
  // Haupttabelle
  const widths = otherTracks.length ? [900, 1500, 3700, 2300, 2400, 2400, 1370] : [900, 1700, 4400, 2470, 2550, 2550];
  const head = [L.colNum, L.colLabel, L.colText, L.colPos, L.colComment, L.colProposal, ...(otherTracks.length ? [L.colOther] : [])];
  const tRows = [{ header: true, cells: head.map((h) => ({ content: para(run(h, { b: true }), { style: 'TableHead' }), fill: W('surface-2') })) }];
  let bm = 1;
  for (const r of rows) {
    const pos = r.position;
    const posParts = [];
    if (pos && pos.stance && pos.stance !== 'none') posParts.push(para(run(`${L.stance[pos.stance] || pos.stance}${pos.priority ? ` · ${L.priority[pos.priority] || pos.priority}` : ''}`, { b: true }), { style: 'TableText' }));
    if (pos && pos.text) posParts.push(para(run(pos.text), { style: 'TableText' }));
    if (pos && pos.proposal) posParts.push(para(run(pos.proposal, { i: true, lang: 'en-GB' }), { style: 'TableText' }));
    const textParas = (r.diffHtml || '').split(/<br\s*\/?>/).map((h) => para(htmlRuns(h, { lang: 'en-GB' }, { dropSourceMarks: r.marked }), { style: 'TableText' })).join('') || para('', { style: 'TableText' });
    const cells = [
      { content: para(run(r.num || '', { b: true }), { style: 'TableText', bookmark: { id: bm, name: `sgk_${r.rowId}` } }) + para(visibleRowId(r.rowId), { style: 'Small' }) },
      { content: para(run(r.label || ''), { style: 'TableText' }) + (r.status ? para(run(L.status[r.status] || r.status, { i: true, sz: 14 }), { style: 'Small' }) : '') },
      { content: textParas },
      { content: posParts.join('') || para('', { style: 'TableText' }) },
      { content: para('', { style: 'TableText' }), fill: W('warning-bg') },
      { content: para('', { style: 'TableText' }), fill: W('warning-bg') },
    ];
    if (otherTracks.length) cells.push({ content: r.others.map((o) => para(run(`${L.track[o.track] || o.track}: `, { b: true, sz: 14 }) + htmlRuns(o.html, { sz: 14, lang: 'en-GB' }), { style: 'TableText' })).join('') });
    tRows.push({ cells, cantSplit: false });
    bm++;
  }
  B.push(table(tRows, { widths }));
  // Allgemeine Bemerkungen
  B.push(para(L.general, { style: 'Heading1' }));
  B.push(para(run(L.generalHint, { i: true, color: W('ink-subtle') })));
  B.push(table([{ cells: [{ content: para(run(L.general, { b: true }), { style: 'TableHead' }), fill: W('surface-2') }] }, { cells: [{ content: para('') + para('') + para(''), fill: W('warning-bg') }] }], { widths: [14570] }));
  const footer = run(`${dossier.procedure || ''} · ${L.dossier} ${dossier.id} · ${L.round} ${k.id}${office ? ` · ${office.abbr || office.name}` : ''} · ${L.classification[classification] ? L.classification[classification].split(' – ')[0] : classification}`, { sz: 14 }) + '<w:r><w:tab/></w:r>' + run(`${L.page} `, { sz: 14 }) + field('PAGE', { sz: 14 }) + run(` ${L.of} `, { sz: 14 }) + field('NUMPAGES', { sz: 14 });
  return packageDocx({
    body: B.join(''), landscape: true, footer, lang: lang === 'fr' ? 'fr-CH' : 'de-CH', title: `${L.consultation} ${k.title} – ${dossier.short || dossier.title}`,
    custom: { sgkKind: 'neg-consultation', sgkSchema: '1', sgkDossier: dossier.id, sgkConsultation: k.id, sgkOffice: office ? office.id : '', sgkLang: lang },
    zipTime: opts.zipTime,
  });
}

// ------------------------------------------------------------------ Einlesen

const HEAD_COMMENT = /kommentar|commentaire|comment/i;
const HEAD_PROPOSAL = /textvorschlag|proposition|proposal|vorschlag/i;
const HEAD_TEXT = /^text\b|texte\b|\(en\)$/i;
const HEAD_GENERAL = /^\s*(allgemeine bemerkungen|remarques générales|general remarks)\s*:?\s*$/i;

function cellPlain(cell, opts) { return htmlToText(blocksHtml(cell.blocks, opts)).trim(); }

/**
 * Rückmeldung einlesen. Tolerant gegenüber: ausgefüllten Zellen, Word-Kommentaren, Änderungsverfolgung im Text (EN),
 * gelöschten/umsortierten Zeilen, kopierten Zeilen in anderen Dokumenten, LibreOffice-/Word-Online-Dateien.
 */
export function parseConsultationDocx(bytes) {
  const d = readDocx(bytes);
  const warnings = [...d.warnings];
  const out = { consultationId: null, dossierId: null, office: null, items: [], general: '', unmatched: [], warnings };
  if (!d.ok) return out;
  out.consultationId = d.customProps.sgkConsultation || null;
  out.dossierId = d.customProps.sgkDossier || null;
  if (d.customProps.sgkOffice) out.office = { id: d.customProps.sgkOffice };
  const foot = (d.footers || []).join(' ');
  if (!out.consultationId) { const m = /(?:Runde|Tour)\s+(k\d+)/.exec(foot); if (m) out.consultationId = m[1]; }
  if (!out.dossierId) { const m = /Dossier\s+(\S+)/.exec(foot); if (m) out.dossierId = m[1]; }
  const tables = [];
  const collect = (blocks) => { for (const b of blocks) if (b.type === 'tbl') { tables.push(b); for (const r of b.rows) for (const c of r.cells) collect(c.blocks); } };
  collect(d.body);
  const usedComments = new Set();
  let generalNext = false;
  // Kopf: Stellungnehmende Stelle
  for (const t of tables) {
    for (const r of t.rows) {
      if (r.cells.length === 2 && /stellungnehmende stelle|office consulté/i.test(cellPlain(r.cells[0]))) {
        const v = cellPlain(r.cells[1], { deleted: 'drop' });
        if (v && !/bitte eintragen|à compléter/i.test(v)) out.office = { ...(out.office || {}), name: v };
      }
    }
  }
  // Abschnitt "Allgemeine Bemerkungen": Text nach der Überschrift (Tabelle oder Absätze)
  const body = d.body;
  for (let i = 0; i < body.length; i++) {
    const b = body[i];
    if (b.type === 'p' && HEAD_GENERAL.test(htmlToText(segmentsToHtml(runsToSegments(b.runs, { deleted: 'drop' }))))) { generalNext = i; break; }
  }
  if (generalNext !== false) {
    const parts = [];
    for (let i = generalNext + 1; i < body.length; i++) {
      const b = body[i];
      if (b.type === 'p') { const t = htmlToText(segmentsToHtml(runsToSegments(b.runs, { deleted: 'drop' }))); if (t && !/^\(.*\)$/.test(t)) parts.push(t); }
      else if (b.type === 'tbl') for (const r of b.rows) for (const c of r.cells) { const t = cellPlain(c, { deleted: 'drop' }); if (t && !HEAD_GENERAL.test(t)) parts.push(t); }
    }
    out.general = parts.join('\n').trim();
  }
  // Haupttabelle(n): jede Zeile mit Kennung Z-…
  const seen = new Set();
  for (const t of tables) {
    // Spaltenrollen aus Kopfzeile, sonst aus Position (letzte zwei Spalten ohne Weitere Fassungen)
    let roles = null;
    for (const r of t.rows.slice(0, 3)) {
      const heads = r.cells.map((c) => cellPlain(c));
      const ci = heads.findIndex((h) => HEAD_COMMENT.test(h) && h.length < 60);
      const pi = heads.findIndex((h) => HEAD_PROPOSAL.test(h) && h.length < 60);
      const ti = heads.findIndex((h) => HEAD_TEXT.test(h) && h.length < 40);
      if (ci >= 0 || pi >= 0) { roles = { comment: ci, proposal: pi, text: ti }; break; }
    }
    for (const r of t.rows) {
      let rowId = null;
      for (const c of r.cells.slice(0, 3)) { rowId = rowIdFromVisible(cellPlain(c)); if (rowId) break; }
      if (!rowId) {
        // Textmarke als Rückfall
        continue;
      }
      if (seen.has(rowId)) warnings.push(warn('duplicate-row', `Zeile ${visibleRowId(rowId)} kommt mehrfach vor`));
      seen.add(rowId);
      const n = r.cells.length;
      const rl = roles || { comment: n >= 6 ? 4 : n - 2, proposal: n >= 6 ? 5 : n - 1, text: n >= 6 ? 2 : -1 };
      if (!roles) warnings.push(warn('roles-guessed', `Spalten für Zeile ${visibleRowId(rowId)} nach Lage zugeordnet (keine Kopfzeile)`));
      const comment = rl.comment >= 0 && r.cells[rl.comment] ? cellPlain(r.cells[rl.comment], { deleted: 'drop' }) : '';
      const proposal = rl.proposal >= 0 && r.cells[rl.proposal] ? cellPlain(r.cells[rl.proposal], { deleted: 'drop' }) : '';
      if (comment || proposal) out.items.push({ rowId, comment, proposal, source: 'cell' });
      // Änderungsverfolgung im Text (EN): als Textvorschlag
      if (rl.text >= 0 && r.cells[rl.text]) {
        const paras = flatParas(r.cells[rl.text].blocks);
        const changed = paras.some((p) => p.runs.some((x) => x.ins || x.del));
        if (changed) {
          const marked = blocksHtml(r.cells[rl.text].blocks, { deleted: 'mark', inserted: 'mark' });
          const clean = htmlToText(blocksHtml(r.cells[rl.text].blocks, { deleted: 'drop' }));
          const authors = [...new Set(paras.flatMap((p) => p.runs.filter((x) => x.ins || x.del).map((x) => x.author)).filter(Boolean))];
          out.items.push({ rowId, comment: '', proposal: htmlToCleanText(clean), proposalHtml: marked, source: 'tracked-change', ...(authors.length ? { author: authors.join(', ') } : {}) });
        }
      }
      // Word-Kommentare in der Zeile
      const ids = new Set(r.cells.flatMap((c) => c.comments));
      for (const id of ids) {
        const c = d.comments.get(id);
        if (!c || usedComments.has(id)) continue;
        usedComments.add(id);
        out.items.push({ rowId, comment: c.text, proposal: '', source: 'word-comment', author: c.author });
      }
    }
    // Zeilen ohne Kennung mit Inhalt in den Kommentarspalten: nicht zuordenbar
    if (roles) {
      for (const r of t.rows) {
        if (r.cells.slice(0, 3).some((c) => rowIdFromVisible(cellPlain(c)))) continue;
        const heads = r.cells.map((c) => cellPlain(c));
        if (heads.some((h) => HEAD_COMMENT.test(h) && h.length < 60)) continue;
        const parts = [roles.comment, roles.proposal].filter((x) => x >= 0 && r.cells[x]).map((x) => cellPlain(r.cells[x], { deleted: 'drop' })).filter(Boolean);
        if (parts.length) out.unmatched.push({ text: parts.join('\n'), context: heads.slice(0, 2).join(' | ').slice(0, 120), source: 'cell' });
      }
    }
  }
  // Kommentare ausserhalb der Tabellenzeilen
  for (const [id, c] of d.comments) if (!usedComments.has(id) && c.text) out.unmatched.push({ text: c.text, author: c.author, source: 'word-comment' });
  if (!out.consultationId) warnings.push(warn('no-consultation-id', 'Runden-Kennung nicht gefunden (Eigenschaft sgkConsultation oder Fusszeile). Bitte Runde manuell wählen.'));
  if (!out.items.length && !out.general) warnings.push(warn('empty-response', 'Keine Bemerkungen gefunden.'));
  return out;
}

export function importResponse(dossier, consultationId, parsed, { office, file = null, now } = {}) {
  const warnings = [];
  const t = now || nowIso();
  const k = findConsultation(dossier, consultationId);
  if (!k) throw new Error(`Konsultation ${consultationId} nicht gefunden`);
  if (parsed.consultationId && parsed.consultationId !== consultationId) warnings.push(warn('round-mismatch', `Datei gehört zu Runde ${parsed.consultationId}, eingelesen in ${consultationId}`));
  if (parsed.dossierId && parsed.dossierId !== dossier.id) warnings.push(warn('dossier-mismatch', `Datei gehört zu Dossier ${parsed.dossierId}`));
  const kk = clone(k);
  // Stelle bestimmen
  let off = null;
  const want = office || (parsed.office && (parsed.office.id || parsed.office.name));
  if (want) off = kk.offices.find((o) => o.id === want || o.abbr === want || o.name === want) || null;
  if (!off && parsed.office && parsed.office.name) {
    off = { id: `o${kk.offices.length + 1}`, abbr: parsed.office.name.slice(0, 12), name: parsed.office.name };
    kk.offices.push(off);
    warnings.push(warn('office-added', `Stelle "${off.name}" neu angelegt`));
  }
  if (!off) { off = { id: `o${kk.offices.length + 1}`, abbr: '?', name: 'unbekannte Stelle' }; kk.offices.push(off); warnings.push(warn('office-unknown', 'Stelle nicht erkannt; bitte zuordnen')); }
  let n = kk.responses.length + 1;
  while (kk.responses.some((r) => r.id === `a${n}`)) n++;
  const aid = `a${n}`;
  const scope = new Set(kk.scope || []);
  const rowIds = new Set(dossier.rows.map((r) => r.id));
  const items = [];
  const unmatched = (parsed.unmatched || []).map((u) => (typeof u === 'string' ? u : u.text));
  parsed.items.forEach((it, i) => {
    if (!rowIds.has(it.rowId)) { unmatched.push(`[${visibleRowId(it.rowId)}] ${[it.comment, it.proposal].filter(Boolean).join(' / ')}`); return; }
    if (scope.size && !scope.has(it.rowId)) warnings.push(warn('row-out-of-scope', `Zeile ${visibleRowId(it.rowId)} gehört nicht zum Umfang der Runde`));
    items.push({ id: `${aid}-${items.length + 1}`, row: it.rowId, comment: it.comment || '', proposal: it.proposal || '', ...(it.proposalHtml ? { proposalHtml: it.proposalHtml } : {}), source: it.source || 'cell', ...(it.author ? { author: it.author } : {}) });
  });
  kk.responses.push({ id: aid, office: off.id, file, importedAt: t, items, general: parsed.general || '', unmatched });
  return { dossier: { ...dossier, updated: t, consultations: dossier.consultations.map((x) => (x.id === consultationId ? kk : x)) }, responseId: aid, warnings };
}

export function aggregateConsultation(dossier, consultationId) {
  const k = findConsultation(dossier, consultationId);
  if (!k) return null;
  const offices = new Map((k.offices || []).map((o) => [o.id, { ...o, responded: false, items: 0, decided: 0 }]));
  const byRow = new Map();
  const general = [], unmatched = [];
  const byDecision = {};
  let items = 0, decided = 0;
  for (const resp of k.responses || []) {
    const o = offices.get(resp.office) || { id: resp.office, abbr: resp.office, name: resp.office, responded: false, items: 0, decided: 0 };
    offices.set(o.id, o);
    o.responded = true;
    if (resp.general) general.push({ office: o.id, responseId: resp.id, text: resp.general });
    for (const u of resp.unmatched || []) unmatched.push({ office: o.id, responseId: resp.id, text: u });
    for (const it of resp.items) {
      const dec = (k.decisions || {})[it.id] || null;
      const decision = dec ? dec.decision : 'open';
      byDecision[decision] = (byDecision[decision] || 0) + 1;
      items++; o.items++;
      if (decision !== 'open') { decided++; o.decided++; }
      if (!byRow.has(it.row)) byRow.set(it.row, []);
      byRow.get(it.row).push({ responseId: resp.id, itemId: it.id, office: { id: o.id, abbr: o.abbr, name: o.name }, comment: it.comment, proposal: it.proposal, proposalHtml: it.proposalHtml || null, source: it.source, author: it.author || null, decision, reply: dec ? dec.reply || '' : '', applied: dec ? !!dec.applied : false });
    }
  }
  const rowsById = new Map(dossier.rows.map((r) => [r.id, r]));
  const rows = sortedRows(dossier).filter((r) => byRow.has(r.id) || (k.scope || []).includes(r.id)).map((r) => {
    const list = byRow.get(r.id) || [];
    const counts = { total: list.length };
    for (const x of list) counts[x.decision] = (counts[x.decision] || 0) + 1;
    return { rowId: r.id, num: r.num, label: r.label, items: list, counts, position: dossier.positions[r.id] || null };
  });
  for (const rid of byRow.keys()) if (!rowsById.has(rid)) unmatched.push({ office: null, text: `Unbekannte Zeile ${rid}` });
  return {
    consultation: { id: k.id, title: k.title, deadline: k.deadline, lang: k.lang, basis: k.basis, scope: (k.scope || []).length },
    rows, offices: [...offices.values()],
    stats: { responses: (k.responses || []).length, offices: offices.size, officesResponded: [...offices.values()].filter((o) => o.responded).length, items, decided, open: items - decided, byDecision, rowsWithItems: byRow.size },
    general, unmatched,
  };
}
