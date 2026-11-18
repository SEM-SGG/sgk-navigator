// Testhilfen: Word-Dateien programmatisch "ausfüllen" wie eine konsultierte Stelle (Zellen, Kommentare,
// Änderungsverfolgung, Zeilen löschen/umsortieren, allgemeine Bemerkungen), LibreOffice-Konvertierung.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

export function editDocx(bytes, fn) {
  const files = unzipSync(bytes);
  const ctx = { files, get: (n) => strFromU8(files[n]), set: (n, s) => { files[n] = strToU8(s); } };
  fn(ctx);
  return zipSync(files);
}

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** <w:tr>-Elemente der Haupttabelle mit Zeilenkennung "Z-…" */
export function rowsWithId(xml) {
  const out = [];
  const re = /<w:tr>(?:(?!<w:tr>)[\s\S])*?<\/w:tr>/g;
  let m;
  while ((m = re.exec(xml))) { const id = /Z-(\d{6})/.exec(m[0]); if (id) out.push({ id: 'r' + id[1], xml: m[0], index: m.index }); }
  return out;
}

function cells(trXml) { return trXml.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []; }

/** Text in Zelle k einer Zeile schreiben (ersetzt den ersten leeren Absatz) */
export function fillCell(xml, rowId, k, text) {
  const r = rowsWithId(xml).find((x) => x.id === rowId);
  if (!r) throw new Error('Zeile fehlt ' + rowId);
  const cs = cells(r.xml);
  const c2 = cs[k].replace(/<w:p>(<w:pPr>[\s\S]*?<\/w:pPr>)?<\/w:p>/, (m, ppr) => `<w:p>${ppr || ''}<w:r><w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r></w:p>`);
  return xml.replace(r.xml, r.xml.replace(cs[k], c2));
}

/** Änderungsverfolgung im Text (EN): Einfügung am Ende, erstes Wort gelöscht */
export function trackChange(xml, rowId, insText, author = 'Prüfer') {
  const r = rowsWithId(xml).find((x) => x.id === rowId);
  const cs = cells(r.xml);
  let c = cs[2];
  c = c.replace(/<w:r>(<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t xml:space="preserve">([^<\s]+)/, (m, rpr, w) => `<w:del w:id="9001" w:author="${author}" w:date="2026-11-20T10:00:00Z"><w:r>${rpr || ''}<w:delText xml:space="preserve">${w}</w:delText></w:r></w:del><w:r>${rpr || ''}<w:t xml:space="preserve">`);
  c = c.replace(/<\/w:p>(?![\s\S]*<\/w:p>)/, `<w:ins w:id="9002" w:author="${author}" w:date="2026-11-20T10:00:00Z"><w:r><w:t xml:space="preserve">${xmlEsc(insText)}</w:t></w:r></w:ins></w:p>`);
  return xml.replace(r.xml, r.xml.replace(cs[2], c));
}

/** Word-Kommentar an die Bestimmung (Zelle 1) einer Zeile hängen */
export function addComment(ctx, rowId, text, author = 'Prüferin', id = 1) {
  let xml = ctx.get('word/document.xml');
  const r = rowsWithId(xml).find((x) => x.id === rowId);
  const cs = cells(r.xml);
  const c = cs[1].replace(/(<w:p>(?:<w:pPr>[\s\S]*?<\/w:pPr>)?)([\s\S]*?)<\/w:p>/, (m, a, b) => `${a}<w:commentRangeStart w:id="${id}"/>${b}<w:commentRangeEnd w:id="${id}"/><w:r><w:commentReference w:id="${id}"/></w:r></w:p>`);
  xml = xml.replace(r.xml, r.xml.replace(cs[1], c));
  ctx.set('word/document.xml', xml);
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const prev = ctx.files['word/comments.xml'] ? ctx.get('word/comments.xml').replace('</w:comments>', '') : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments ${W}>`;
  ctx.set('word/comments.xml', `${prev}<w:comment w:id="${id}" w:author="${author}" w:date="2026-11-20T10:00:00Z" w:initials="P"><w:p><w:r><w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r></w:p></w:comment></w:comments>`);
  if (!/comments\.xml/.test(ctx.get('word/_rels/document.xml.rels'))) {
    ctx.set('word/_rels/document.xml.rels', ctx.get('word/_rels/document.xml.rels').replace('</Relationships>', '<Relationship Id="rIdComments" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/></Relationships>'));
    ctx.set('[Content_Types].xml', ctx.get('[Content_Types].xml').replace('</Types>', '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/></Types>'));
  }
}

export function deleteRow(xml, rowId) { const r = rowsWithId(xml).find((x) => x.id === rowId); return xml.replace(r.xml, ''); }
export function moveRowToEnd(xml, rowId) {
  const rows = rowsWithId(xml);
  const r = rows.find((x) => x.id === rowId);
  const last = rows[rows.length - 1];
  return xml.replace(r.xml, '').replace(last.xml, last.xml + r.xml);
}
/** Allgemeine Bemerkungen: letzte Tabelle, zweite Zeile */
export function fillGeneral(xml, text) {
  const tbls = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g);
  const t = tbls[tbls.length - 1];
  const t2 = t.replace(/(<w:tc><w:tcPr>[^]*?<\/w:tcPr>)<w:p>(<w:pPr>[\s\S]*?<\/w:pPr>)?<\/w:p>(?![\s\S]*<w:tc>)/, `$1<w:p><w:r><w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r></w:p>`);
  return xml.replace(t, t2);
}

export const hasSoffice = (() => { try { execFileSync('which', ['soffice'], { stdio: 'ignore' }); return true; } catch { return false; } })();

/** Datei mit LibreOffice in Format umwandeln (z. B. "docx", "pdf"); Rückgabe Bytes */
export function soffice(bytes, to, name = 'datei.docx') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neg-lo-'));
  const out = path.join(dir, 'out');
  fs.mkdirSync(out);
  const inFile = path.join(dir, name);
  fs.writeFileSync(inFile, bytes);
  execFileSync('soffice', ['--headless', `-env:UserInstallation=file://${dir}/profile`, '--convert-to', to, '--outdir', out, inFile], { stdio: 'ignore', timeout: 120000 });
  const f = fs.readdirSync(out)[0];
  return new Uint8Array(fs.readFileSync(path.join(out, f)));
}

export const RAW = path.resolve(new URL('../../raw-neg', import.meta.url).pathname);
export const rawExists = (f) => fs.existsSync(path.join(RAW, f));
