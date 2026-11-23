// SGK-Navigator, Modul Verhandlung — Word-Dateien schreiben (ESM, isomorph; eigenes OOXML + fflate)
//
// Bausteine: para(runs|string, opts), run(text, fmt), htmlRuns(html, baseFmt), table(rows, opts), packageDocx({...}) -> Uint8Array
// Seiten: A4 hoch oder quer, Arial (Ersatz: Liberation Sans), 9–10 pt, wiederholte Tabellenkopfzeile, Seitenzahlen im Fuss.

import { CARBON } from '../app/tokens.js';
/** Carbon-Farbe für Word (ohne '#'); Schrift bleibt Arial. */
const W = (k) => CARBON[k].slice(1).toUpperCase();
import { zipSync, strToU8 } from 'fflate';
import { esc } from './xml.js';
import { decodeEntities } from './util.js';

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

/** Lauf (w:r). fmt: { b, i, u, s, sup, sub, sz (Halbpunkte), color, shade, caps, noProof } */
export function run(text, fmt = {}) {
  if (text === '' || text === null || text === undefined) return '';
  const rpr = [];
  if (fmt.style) rpr.push(`<w:rStyle w:val="${esc(fmt.style)}"/>`);
  if (fmt.b) rpr.push('<w:b/>');
  if (fmt.i) rpr.push('<w:i/>');
  if (fmt.caps) rpr.push('<w:caps/>');
  if (fmt.s) rpr.push('<w:strike/>');
  if (fmt.color) rpr.push(`<w:color w:val="${fmt.color.replace('#', '')}"/>`);
  if (fmt.sz) rpr.push(`<w:sz w:val="${fmt.sz}"/><w:szCs w:val="${fmt.sz}"/>`);
  if (fmt.highlight) rpr.push(`<w:highlight w:val="${fmt.highlight}"/>`);
  if (fmt.u) rpr.push(`<w:u w:val="${fmt.u === 'double' ? 'double' : 'single'}"/>`);
  if (fmt.shade) rpr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${fmt.shade.replace('#', '')}"/>`);
  if (fmt.sup) rpr.push('<w:vertAlign w:val="superscript"/>');
  else if (fmt.sub) rpr.push('<w:vertAlign w:val="subscript"/>');
  if (fmt.lang) rpr.push(`<w:lang w:val="${fmt.lang}"/>`);
  const pr = rpr.length ? `<w:rPr>${rpr.join('')}</w:rPr>` : '';
  const parts = String(text ?? '').split('\n');
  return parts.map((t, k) => `<w:r>${pr}${k ? '<w:br/>' : ''}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`).join('');
}

/** Feld (PAGE, NUMPAGES) */
export function field(instr, fmt = {}) {
  const pr = fmt.sz ? `<w:rPr><w:sz w:val="${fmt.sz}"/></w:rPr>` : '';
  return `<w:r>${pr}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${pr}<w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r><w:r>${pr}<w:fldChar w:fldCharType="separate"/></w:r><w:r>${pr}<w:t>1</w:t></w:r><w:r>${pr}<w:fldChar w:fldCharType="end"/></w:r>`;
}

/**
 * Inline-HTML (b i u s sup sub br, ins/del aus Diff) in Läufe umsetzen.
 * <ins> -> unterstrichen (eingefügt), <del> -> durchgestrichen (gestrichen).
 */
export function htmlRuns(html, base = {}, { dropSourceMarks = false } = {}) {
  const out = [];
  const stack = [];
  const fmt = () => {
    const f = { ...base };
    for (const t of stack) {
      if (t === 'b' || t === 'strong') f.b = true;
      else if (t === 'i' || t === 'em') f.i = true;
      else if (t === 'ins' || (t === 'u' && !dropSourceMarks)) f.u = true;
      else if (t === 'del' || (t === 's' && !dropSourceMarks)) f.s = true;
      else if (t === 'sup') f.sup = true;
      else if (t === 'sub') f.sub = true;
    }
    return f;
  };
  const parts = String(html || '').split(/(<[^>]+>)/);
  for (const p of parts) {
    if (!p) continue;
    if (p[0] === '<') {
      const m = /^<\s*(\/?)\s*([a-z0-9]+)/i.exec(p);
      if (!m) continue;
      const name = m[2].toLowerCase();
      if (name === 'br') { out.push('<w:r><w:br/></w:r>'); continue; }
      if (m[1]) { const k = stack.lastIndexOf(name); if (k >= 0) stack.splice(k, 1); }
      else stack.push(name);
      continue;
    }
    out.push(run(decodeEntities(p), fmt()));
  }
  return out.join('');
}

/** Absatz. content: Läufe-XML oder Klartext. opts: { style, align, keepNext, spacingAfter, spacingBefore, bookmark, sz, b, pageBreakBefore } */
export function para(content, opts = {}) {
  const ppr = [];
  if (opts.style) ppr.push(`<w:pStyle w:val="${opts.style}"/>`);
  if (opts.keepNext) ppr.push('<w:keepNext/>');
  if (opts.pageBreakBefore) ppr.push('<w:pageBreakBefore/>');
  if (opts.spacingAfter !== undefined || opts.spacingBefore !== undefined) ppr.push(`<w:spacing${opts.spacingBefore !== undefined ? ` w:before="${opts.spacingBefore}"` : ''}${opts.spacingAfter !== undefined ? ` w:after="${opts.spacingAfter}"` : ''}/>`);
  if (opts.align) ppr.push(`<w:jc w:val="${opts.align}"/>`);
  const runs = typeof content === 'string' && !content.startsWith('<w:') ? run(content, { b: opts.b, i: opts.i, sz: opts.sz, color: opts.color }) : (content || '');
  let inner = runs;
  if (opts.bookmark) inner = `<w:bookmarkStart w:id="${opts.bookmark.id}" w:name="${esc(opts.bookmark.name)}"/>${runs}<w:bookmarkEnd w:id="${opts.bookmark.id}"/>`;
  return `<w:p>${ppr.length ? `<w:pPr>${ppr.join('')}</w:pPr>` : ''}${inner}</w:p>`;
}

/**
 * Tabelle. rows: [{ cells:[{ content (Absatz-XML), width?, fill?, span? }], header?:boolean, cantSplit?:boolean }]
 * opts: { widths:[twips], borders:true, layoutFixed:true }
 */
export function table(rows, opts = {}) {
  const widths = opts.widths || [];
  const total = widths.reduce((a, b) => a + b, 0);
  const borders = opts.borders === false ? '' : `<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="${W('border-strong')}"/><w:left w:val="single" w:sz="4" w:space="0" w:color="${W('border-strong')}"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="${W('border-strong')}"/><w:right w:val="single" w:sz="4" w:space="0" w:color="${W('border-strong')}"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="${W('border-strong')}"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="${W('border-strong')}"/></w:tblBorders>`;
  const tblPr = `<w:tblPr><w:tblW w:w="${total || 5000}" w:type="${total ? 'dxa' : 'pct'}"/>${borders}${opts.layoutFixed !== false ? '<w:tblLayout w:type="fixed"/>' : ''}<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="70" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>`;
  const grid = widths.length ? `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>` : '';
  const trs = rows.map((r) => {
    const trPr = [];
    if (r.header) trPr.push('<w:tblHeader/>');
    if (r.cantSplit) trPr.push('<w:cantSplit/>');
    let col = 0;
    const tcs = r.cells.map((c) => {
      const span = c.span || 1;
      const w = c.width || widths.slice(col, col + span).reduce((a, b) => a + b, 0) || 1000;
      col += span;
      const tcPr = [`<w:tcW w:w="${w}" w:type="dxa"/>`];
      if (span > 1) tcPr.push(`<w:gridSpan w:val="${span}"/>`);
      if (c.fill) tcPr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${c.fill.replace('#', '')}"/>`);
      const content = c.content && /<w:p[ >]/.test(c.content) ? c.content : para(c.content || '');
      return `<w:tc><w:tcPr>${tcPr.join('')}</w:tcPr>${content}</w:tc>`;
    }).join('');
    return `<w:tr>${trPr.length ? `<w:trPr>${trPr.join('')}</w:trPr>` : ''}${tcs}</w:tr>`;
  }).join('');
  return `<w:tbl>${tblPr}${grid}${trs}</w:tbl>`;
}

function stylesXml({ font = 'Arial', size = 18 } = {}) {
  // size in Halbpunkten (18 = 9 pt)
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W_NS}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:eastAsia="${font}" w:cs="${font}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:lang w:val="de-CH" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="60"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Small"><w:name w:val="Klein"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:color w:val="${W('ink-muted')}"/><w:sz w:val="14"/><w:szCs w:val="14"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TableHead"><w:name w:val="Tabellenkopf"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:after="0"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Tabellentext"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="40"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Notice"><w:name w:val="Vermerk"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr><w:b/><w:caps/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="right" w:pos="14570"/></w:tabs><w:spacing w:after="0"/></w:pPr><w:rPr><w:sz w:val="14"/><w:szCs w:val="14"/></w:rPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>
</w:styles>`;
}

/**
 * Dokument verpacken.
 * @param {{ body:string, landscape?:boolean, footer?:string (Läufe-XML), title?:string, author?:string, custom?:Record<string,string>, lang?:string, created?:string }} o
 */
export function packageDocx(o) {
  const landscape = !!o.landscape;
  const pg = landscape ? '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>' : '<w:pgSz w:w="11906" w:h="16838"/>';
  const mar = '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/>';
  const sect = `<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter1"/>${pg}${mar}<w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${W_NS}><w:body>${o.body}${sect}</w:body></w:document>`;
  const tabPos = landscape ? 14570 : 9638;   // rechter Rand des Satzspiegels
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:ftr ${W_NS}><w:p><w:pPr><w:pStyle w:val="Footer"/><w:tabs><w:clear w:val="right" w:pos="14570"/><w:tab w:val="right" w:pos="${tabPos}"/></w:tabs></w:pPr>${o.footer || ''}</w:p></w:ftr>`;
  const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:settings ${W_NS}><w:defaultTabStop w:val="708"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/><Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/></Relationships>`;
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`;
  // Erstelldatum: angegeben, sonst die feste Zeit des ZIP (zipTime, für reproduzierbare Dateien), sonst jetzt. Ohne diese
  // Regel trug eine Datei mit fester zipTime trotzdem die aktuelle Sekunde und war zwischen zwei Builds nicht gleich.
  const created = o.created || new Date(o.zipTime || Date.now()).toISOString().replace(/\.\d+Z$/, 'Z');
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(o.title || '')}</dc:title><dc:creator>${esc(o.author || 'SGK-Navigator')}</dc:creator><dc:language>${esc(o.lang || 'de-CH')}</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified></cp:coreProperties>`;
  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>SGK-Navigator</Application></Properties>`;
  const props = Object.entries(o.custom || {}).map(([k, v], i) => `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${i + 2}" name="${esc(k)}"><vt:lpwstr>${esc(v)}</vt:lpwstr></property>`).join('');
  const custom = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">${props}</Properties>`;
  const files = {
    '[Content_Types].xml': strToU8(ct),
    '_rels/.rels': strToU8(rels),
    'word/document.xml': strToU8(document),
    'word/_rels/document.xml.rels': strToU8(docRels),
    'word/styles.xml': strToU8(stylesXml({ size: o.fontSize || 18 })),
    'word/settings.xml': strToU8(settings),
    'word/footer1.xml': strToU8(footer),
    'docProps/core.xml': strToU8(core),
    'docProps/app.xml': strToU8(app),
    'docProps/custom.xml': strToU8(custom),
  };
  // feste Zeitstempel im ZIP, damit gleiche Eingaben gleiche Dateien ergeben
  const mtime = new Date(o.zipTime || '2026-01-01T00:00:00Z');
  const zf = {};
  for (const [k, v] of Object.entries(files)) zf[k] = [v, { level: 6, mtime }];
  return zipSync(zf);
}
