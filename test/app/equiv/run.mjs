// Upload wie handleFiles (src/app/uploads.js) in Node: parseEurLexFile -> parseUpload -> applySnapshot, Datei für Datei.
import './env.mjs';
import { readFileSync } from 'node:fs';
import { loadWork, variantOf, targetStage, fixtureFile, worksIndex, LANGS, compareStage, compareLangStructure, compareStageMeta } from './lib.mjs';
const { registerStrings } = await import('../../../src/app/lib/i18n.js');
registerStrings('de', (await import('../../../src/app/i18n/de.js')).default);
const D = await import('../../../src/app/data.js');
const ui = { ...(await import('../../../src/app/ui/compare.js')), ...(await import('../../../src/app/ui/chronology.js')), ...(await import('../../../src/app/lib/diff.js')), ...(await import('../../../src/app/lib/sanitize.js')) };
D.setLibraryContext({ worksIndex: worksIndex(), derogations: [] });

export async function uploadAll(id, { langs = LANGS, readHtml = (f) => readFileSync(f, 'utf8') } = {}) {
  const full = loadWork(id);
  const target = targetStage(id, full.dataset);
  let cur = variantOf(id, full.dataset);
  const uploads = [];
  const log = [];
  for (const lang of langs) {
    const text = readHtml(fixtureFile(target.source.celex, lang));
    const pre = D.parseEurLexFile(text);
    const data = new D.Data({ dataset: cur, acts: full.acts, work: full.work });
    const r = D.parseUpload(text, data, uploads, { parsed: pre });
    cur = D.applySnapshot(data.ds, r.parsed, { date: r.date, full: data.full });
    uploads.push({ celex: r.celex, lang: r.lang, date: r.date });
    log.push(r);
  }
  const A = new D.Data({ dataset: full.dataset, acts: full.acts, work: full.work });
  const B = new D.Data({ dataset: cur, acts: full.acts, work: full.work });
  const sb = B.stages.find((s) => s.source && s.source.celex === target.source.celex && !A.stage(s.id) ? true : s.source && s.source.celex === target.source.celex && s.order === Math.max(...B.stages.map((x) => x.order)));
  return { A, B, sa: target.id, sb: sb && sb.id, target, log };
}

export function diffAll(r) {
  const res = {};
  for (const lang of LANGS) res[lang] = compareStage(r.A, r.B, r.sa, r.sb, lang, ui);
  res.langs = compareLangStructure(r.A, r.B, r.sa, r.sb);
  res.meta = compareStageMeta(r.A.stage(r.sa), r.B.stage(r.sb));
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const id of process.argv.slice(2)) {
    const t0 = Date.now();
    const r = await uploadAll(id);
    const d = diffAll(r);
    console.log(`== ${id} ${r.target.source.celex} central ${r.sa} upload ${r.sb} (${Date.now() - t0} ms)`);
    console.log(' meta', JSON.stringify(d.meta));
    for (const k of [...LANGS, 'langs']) {
      const by = {};
      for (const x of d[k]) (by[x.cat] = by[x.cat] || []).push(x);
      console.log(` ${k}: ${d[k].length}`, Object.entries(by).map(([c, l]) => `${c}=${l.length}`).join(' '));
      for (const [c, l] of Object.entries(by)) for (const x of l.slice(0, 6)) console.log(`   ${c} ${x.unit}${x.key ? '#' + x.key : ''}: ${x.detail}`);
    }
  }
}
