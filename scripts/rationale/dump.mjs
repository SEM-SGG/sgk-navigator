// Arbeitshilfe: Erwägungsgründe eines Akts als Klartext ausgeben (zum Lesen)
import { readRecitals } from './extract.mjs';
const [celex, lang = 'de', max = '0', ...only] = process.argv.slice(2);
const list = readRecitals('raw', celex, lang);
for (const r of list) {
  if (only.length && !only.includes(r.n)) continue;
  let t = r.t.replace(/<br>/g, ' ¶ ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  if (+max && t.length > +max) t = t.slice(0, +max) + ' […]';
  console.log(`(${r.n}) ${t}\n`);
}
