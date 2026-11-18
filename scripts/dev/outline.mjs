// Dev-Hilfe: Gliederung eines EUR-Lex-HTML ausgeben (nur lesen, nichts ausfuehren)
import { readFileSync } from 'node:fs';
import { DOMParser } from 'linkedom';
const [file, maxDepth = '6', start = '', len = '400'] = process.argv.slice(2);
let html = readFileSync(file, 'utf8').replace(/data:image\/[^"']+/g, 'DATA');
const doc = new DOMParser().parseFromString(html, 'text/html');
const out = [];
function walk(el, depth) {
  if (depth > +maxDepth) return;
  for (const c of el.children) {
    const cls = c.getAttribute('class') || '';
    const id = c.getAttribute('id') || '';
    let txt = '';
    if (['P', 'SPAN', 'TD', 'A'].includes(c.tagName)) txt = c.textContent.replace(/\s+/g, ' ').trim().slice(0, 70);
    out.push(`${'  '.repeat(depth)}${c.tagName.toLowerCase()}${cls ? '.' + cls.replace(/ /g, '.') : ''}${id ? '#' + id : ''} ${txt}`);
    if (!['P'].includes(c.tagName)) walk(c, depth + 1);
  }
}
walk(doc.body, 0);
const s = out.join('\n');
const i = start ? s.indexOf(start) : 0;
console.log(s.slice(Math.max(0, i), Math.max(0, i) + +len * 80));
