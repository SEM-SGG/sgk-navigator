// SGK-Navigator, Modul Verhandlung — Dateierkennung (ESM, isomorph, synchron, ohne pdf.js)
//
// detectDocument({ name, bytes }) -> { type:"docx"|"pdf"|"html"|"json"|"unknown", guess:{ kind, ref, date, title, procedure, classification }, confidence, hints:[] }
//   PDF: nur Dateiname und unkomprimierte Metadaten (Titel) werden betrachtet; die eigentliche Unterscheidung
//   Vier-Spalten-Tabelle / fortlaufender Text liefert erst der Parser (Warnung "no-table"). DOCX: Tabellen und Kopfzeilen.

import { unzipSync, strFromU8 } from 'fflate';
import { parseDocRef, parseDateEn, parseProcedure, parseClassification } from './util.js';

const head = (b, n) => strFromU8(b.subarray(0, Math.min(n, b.length)), true);

export function detectDocument(file) {
  const name = String(file && file.name || '');
  const bytes = file && file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file && file.bytes || []);
  const hints = [];
  const guess = { kind: 'other', ref: parseDocRef(name.replace(/[-_]/g, ' ').replace(/(ST|WK) (\d+) (\d{4})/i, (m, a, n, y) => `${a.toUpperCase() === 'WK' ? 'WK ' : ''}${n}/${a.toUpperCase() === 'WK' ? y : y.slice(2)}`)), date: null, title: null, procedure: parseProcedure(name), classification: null };
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    const h = head(bytes, 4096);
    const t = /\/Title\s*\(([^)]{3,300})\)/.exec(h);
    if (t) guess.title = t[1];
    if (/four[- ]column|4[- ]column|three[- ]column/i.test(name + ' ' + (guess.title || ''))) guess.kind = 'four-column';
    else hints.push('PDF: Art (Vier-Spalten-Tabelle oder fortlaufender Text) erst nach dem Einlesen sicher.');
    return { type: 'pdf', guess, confidence: guess.kind === 'four-column' ? 0.8 : 0.5, hints };
  }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    let files;
    try { files = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' || f.name === 'docProps/custom.xml' || f.name === 'docProps/core.xml' }); } catch { return { type: 'unknown', guess, confidence: 0, hints: ['ZIP nicht lesbar'] }; }
    if (!files['word/document.xml']) return { type: 'unknown', guess, confidence: 0.1, hints: ['ZIP ohne word/document.xml'] };
    const xml = strFromU8(files['word/document.xml']);
    const custom = files['docProps/custom.xml'] ? strFromU8(files['docProps/custom.xml']) : '';
    const text = xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (p) => p.replace(/<[^>]+>/g, '') + '\n').replace(/<[^>]+>/g, '').slice(0, 20000);
    guess.ref = guess.ref || parseDocRef(text.slice(0, 2000));
    guess.date = parseDateEn(text.slice(0, 2000));
    guess.procedure = guess.procedure || parseProcedure(text);
    guess.classification = parseClassification(text.slice(0, 3000));
    const tables = (xml.match(/<w:tbl>/g) || []).length;
    if (/neg-consultation/.test(custom) || /Z-\d{6}/.test(text)) { guess.kind = 'consultation-response'; return { type: 'docx', guess, confidence: 0.95, hints }; }
    const headerHits = (text.match(/Commission Proposal|EP Mandate|Council Mandate|Draft Agreement|Draft compromise/gi) || []).length;
    if (tables && headerHits >= 2) guess.kind = 'four-column';
    else if (/general approach|mandate for negotiations/i.test(text)) guess.kind = 'mandate';
    else guess.kind = 'compromise';
    return { type: 'docx', guess, confidence: guess.kind === 'four-column' ? 0.85 : 0.6, hints };
  }
  const txt = head(bytes, 200000);
  if (/^\s*[{[]/.test(txt)) {
    const isDossier = /"kind"\s*:\s*"neg-dossier"/.test(txt);
    guess.kind = isDossier ? 'dossier' : 'other';
    return { type: 'json', guess, confidence: isDossier ? 0.95 : 0.3, hints };
  }
  if (/<html|<!DOCTYPE html/i.test(txt)) {
    const m = /COM\s*\((\d{4})\)\s*(\d+)/.exec(txt);
    if (m) { guess.ref = `COM(${m[1]}) ${m[2]}`; guess.kind = 'proposal'; }
    guess.procedure = parseProcedure(txt);
    guess.classification = 'public';
    return { type: 'html', guess, confidence: m ? 0.9 : 0.5, hints };
  }
  return { type: 'unknown', guess, confidence: 0, hints: ['Format nicht erkannt'] };
}
