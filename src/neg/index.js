// SGK-Navigator, Modul Verhandlung — zentraler Einstieg der Kernbibliothek (ESM, isomorph: Browser + Node)
//
// Was der Aufrufer bereitstellen muss:
//   - pdfjs     : Modulobjekt von pdfjs-dist (legacy build). Browser/Einzeldatei: siehe setupPdfjs() in ./pdfjs-setup.js
//                 (Worker als Blob aus inline eingebettetem Quelltext oder Hauptthread). Node: import * as pdfjs from
//                 'pdfjs-dist/legacy/build/pdf.mjs'. Benötigt von parseFourColumnPdf, parseTextPdf, extractPdfPages.
//   - DOMParser : nur für parseProposalHtml (EUR-Lex-HTML). Browser: window.DOMParser; Node: linkedom.
//   - Word lesen/schreiben braucht nichts: fflate ist gebündelt, XML liest ein eigener kleiner Parser (./xml.js).
// Alle Funktionen sind rein (keine globalen Zustände; Eingaben werden nicht verändert; Rückgabe neue Objekte),
// unerwartete Dokumente ergeben Warnungen ({ code, message }) statt Ausnahmen. Ausnahmen nur bei Programmierfehlern
// (z. B. unbekannte Konsultations-Id).
// Signaturen und Rückgabeformen: data/NEG_STATUS.md; Verfahren und Grenzen: data/NEG_NOTES.md.

// Modell und Projektdatei
export {
  SCHEMA, DEFAULT_TRACKS, STANCES, PRIORITIES, DECISIONS, DOC_KINDS, CLASSIFICATIONS,
  createDossier, exportDossier, importDossier, validateDossier, docsByDate, sortedRows, cellsOf, latestCell,
  setPosition, defaultBasis, addConsultation, findConsultation, setDecision,
} from './model.js';
// Import
export { detectDocument } from './detect.js';
export { parseFourColumnPdf, analyzeFourColumnPages, suggestTrack, colorStatus } from './pdf-fourcol.js';
export { parseTextPdf, analyzeTextPages } from './pdf-text.js';
export { extractPdfPages } from './pdf-extract.js';
export { parseFourColumnDocx, parseTextDocx } from './docx-parse.js';
export { parseProposalHtml } from './proposal-html.js';
export { setupPdfjs } from './pdfjs-setup.js';
// Zusammenführen
export { planMerge, applyMerge } from './merge.js';
// Auswerten
export { rowHistory, changesBetween, stalePositions, rowStatus } from './history.js';
export { compareCells } from './diff.js';
// Konsultation
export { consultationRows, buildConsultationDocx, parseConsultationDocx, importResponse, aggregateConsultation } from './consultation.js';
// Ausgaben
export { buildPositionDocx, positionRows, positionStats } from './outputs.js';
// Delegationen, Sitzungen, Bilanz (Etappe 3, SPEC3 §3.7)
export {
  DELEG_STANCES, INTERVENTION_RESULTS, OUTCOMES, DELEG_KINDS, defaultDelegations, ensureDelegations,
  addDelegation, updateDelegation, removeDelegation, addMeeting, updateMeeting, removeMeeting, meetingsByDate,
  setStance, removeStance, addIntervention, updateIntervention, removeIntervention, setOutcome,
  stanceMatrix, suggestOutcome, balance,
} from './delegations.js';
// Vorschau hängiger Vorschläge im SGK (Etappe 3, SPEC3 §3.6)
export { parseAmendingInstruction, buildPreview, annotateAmends, cellParagraphs } from './preview.js';
// Projektdateien vergleichen und zusammenführen (Etappe 3, SPEC3 §3.8)
export { diffDossiers, mergeDossiers } from './dossier-merge.js';
// Hilfen
export { parseLabel, labelFromPath, pathKey, groupOf, amendsOf } from './paths.js';
export { htmlToText, htmlToCleanText, sanitizeInline } from './util.js';
export { DOC_TEXT, visibleRowId, rowIdFromVisible } from './i18n.js';
