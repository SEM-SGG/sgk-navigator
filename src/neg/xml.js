// SGK-Navigator, Modul Verhandlung — kleiner XML-Parser für OOXML (ESM, isomorph, ohne Abhängigkeiten)
//
// parseXml(string) -> Element { name, attrs, children:[Element|{text}] }
//   Namenspräfixe werden über die Namensraum-URI auf feste Präfixe normalisiert (w, r, wp, a, mc, w14, cp, dc, vt, …),
//   damit Dateien aus Word, Word Online und LibreOffice gleich gelesen werden.
// Hilfen: child(el, name), children(el, name), descendants(el, name), textOf(el), attr(el, name)
// esc(text) für das Schreiben.
//
// Ein injizierter DOMParser ist nicht nötig: OOXML ist wohlgeformt, der eigene Parser ist klein, schnell und in Browser
// und Node gleich (Abweichung von SPEC2 §5 "XML-Parser injizierbar", Begründung in data/NEG_NOTES.md).

const NS = {
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main': 'w',
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships': 'r',
  'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing': 'wp',
  'http://schemas.openxmlformats.org/drawingml/2006/main': 'a',
  'http://schemas.openxmlformats.org/markup-compatibility/2006': 'mc',
  'http://schemas.microsoft.com/office/word/2010/wordml': 'w14',
  'http://schemas.microsoft.com/office/word/2012/wordml': 'w15',
  'http://schemas.openxmlformats.org/package/2006/metadata/core-properties': 'cp',
  'http://purl.org/dc/elements/1.1/': 'dc',
  'http://purl.org/dc/terms/': 'dcterms',
  'http://schemas.openxmlformats.org/officeDocument/2006/custom-properties': 'cust',
  'http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes': 'vt',
  'http://schemas.openxmlformats.org/package/2006/relationships': 'rel',
  'http://schemas.openxmlformats.org/package/2006/content-types': 'ct',
  'http://www.w3.org/XML/1998/namespace': 'xml',
  'http://purl.oclc.org/ooxml/wordprocessingml/main': 'w',          // Strict-OOXML
  'http://purl.oclc.org/ooxml/officeDocument/relationships': 'r',
};

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function unescapeXml(s) {
  return s.indexOf('&') < 0 ? s : s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e];
  });
}
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  // in XML 1.0 unzulässige Steuerzeichen entfernen
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');

/** XML-Text parsen. Wirft bei grob fehlerhaftem XML einen Error mit Position. */
export function parseXml(src) {
  const s = String(src || '');
  let i = 0;
  const root = { name: '#document', attrs: {}, children: [] };
  const stack = [root];
  const nsStack = [{}];
  const n = s.length;
  const mapName = (qn, scope, isAttr) => {
    const k = qn.indexOf(':');
    if (k < 0) {
      if (isAttr) return qn;
      const uri = scope[''];
      const pre = uri && NS[uri];
      return pre ? `${pre}:${qn}` : qn;
    }
    const pre = qn.slice(0, k), local = qn.slice(k + 1);
    if (pre === 'xmlns') return qn;
    if (pre === 'xml') return qn;
    const uri = scope[pre];
    const canon = uri && NS[uri];
    return `${canon || pre}:${local}`;
  };
  while (i < n) {
    const lt = s.indexOf('<', i);
    if (lt < 0) { pushText(s.slice(i)); break; }
    if (lt > i) pushText(s.slice(i, lt));
    if (s.startsWith('<!--', lt)) { const e = s.indexOf('-->', lt + 4); i = e < 0 ? n : e + 3; continue; }
    if (s.startsWith('<![CDATA[', lt)) { const e = s.indexOf(']]>', lt + 9); const t = s.slice(lt + 9, e < 0 ? n : e); top().children.push({ text: t }); i = e < 0 ? n : e + 3; continue; }
    if (s.startsWith('<?', lt)) { const e = s.indexOf('?>', lt + 2); i = e < 0 ? n : e + 2; continue; }
    if (s.startsWith('<!', lt)) { const e = s.indexOf('>', lt + 2); i = e < 0 ? n : e + 1; continue; }
    if (s[lt + 1] === '/') {
      const e = s.indexOf('>', lt + 2);
      if (e < 0) throw new Error(`XML: offenes Endtag bei ${lt}`);
      if (stack.length > 1) { stack.pop(); nsStack.pop(); }
      i = e + 1;
      continue;
    }
    // Starttag
    let j = lt + 1;
    while (j < n && !/[\s/>]/.test(s[j])) j++;
    const qn = s.slice(lt + 1, j);
    const rawAttrs = [];
    let selfClose = false;
    while (j < n) {
      while (j < n && /\s/.test(s[j])) j++;
      if (s[j] === '/') { selfClose = true; j++; continue; }
      if (s[j] === '>') { j++; break; }
      let k = j;
      while (k < n && !/[\s=/>]/.test(s[k])) k++;
      const an = s.slice(j, k);
      while (k < n && /\s/.test(s[k])) k++;
      let val = '';
      if (s[k] === '=') {
        k++;
        while (k < n && /\s/.test(s[k])) k++;
        const q = s[k];
        if (q === '"' || q === "'") { const e = s.indexOf(q, k + 1); val = s.slice(k + 1, e < 0 ? n : e); k = e < 0 ? n : e + 1; }
        else { let e = k; while (e < n && !/[\s>]/.test(s[e])) e++; val = s.slice(k, e); k = e; }
      }
      rawAttrs.push([an, unescapeXml(val)]);
      j = k;
    }
    const scope = Object.create(nsStack[nsStack.length - 1]);
    for (const [an, v] of rawAttrs) {
      if (an === 'xmlns') scope[''] = v;
      else if (an.startsWith('xmlns:')) scope[an.slice(6)] = v;
    }
    const attrs = {};
    for (const [an, v] of rawAttrs) if (an !== 'xmlns' && !an.startsWith('xmlns:')) attrs[mapName(an, scope, true)] = v;
    const el = { name: mapName(qn, scope, false), attrs, children: [] };
    top().children.push(el);
    if (!selfClose) { stack.push(el); nsStack.push(scope); }
    i = j;
  }
  return root.children.find((c) => c.name) || root;
  function top() { return stack[stack.length - 1]; }
  function pushText(t) { if (t) top().children.push({ text: unescapeXml(t) }); }
}

export const child = (el, name) => (el && el.children ? el.children.find((c) => c.name === name) : null) || null;
export const children = (el, name) => (el && el.children ? el.children.filter((c) => c.name === name) : []);
export function descendants(el, name, out = []) {
  if (!el || !el.children) return out;
  for (const c of el.children) {
    if (!c.name) continue;
    if (c.name === name) out.push(c);
    descendants(c, name, out);
  }
  return out;
}
export const attr = (el, name) => (el && el.attrs ? (el.attrs[name] ?? null) : null);
export function textOf(el) {
  if (!el) return '';
  if (el.text !== undefined) return el.text;
  return (el.children || []).map(textOf).join('');
}
