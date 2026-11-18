// Misst den Zeilenabgleich (planMerge) an echten aufeinanderfolgenden Vier-Spalten-Tabellen.
// Je Serie: erste Fassung -> leeres Dossier, jede weitere Fassung gegen den bisherigen Stand.
// Prüfung: Anteil matched/new/ambiguous; Plausibilität der Treffer (gleiche Zeilennummer, Textähnlichkeit);
// Stichprobe verdächtiger Zuordnungen (Nummer verschieden oder geringe Ähnlichkeit) wird ausgegeben.
//
// Aufruf: node scripts/neg/eval-merge.mjs   (schreibt scripts/neg/out/eval-merge.json)

import fs from 'node:fs';
import path from 'node:path';
import { parsePdfCached, defaultMapping, RAW } from './lib-node.mjs';
import { createDossier } from '../../src/neg/model.js';
import { planMerge, applyMerge } from '../../src/neg/merge.js';
import { similarity, htmlToCleanText } from '../../src/neg/util.js';

const SERIES = {
  'Screening 2020/0278(COD)': ['ST-8413-2023', 'ST-10863-2023', 'WK-13716-2023', 'WK-16364-2023', 'WK-16999-2023'],
  'API 2022/0425(COD)': ['ST-16760-2023', 'WK-2527-2024'],
  'VIS-Digitalisierung 2022/0132(COD)': ['ST-8390-2023', 'ST-9796-2023'],
};

const results = [];
for (const [name, files] of Object.entries(SERIES)) {
  let d = createDossier({ title: name, procedure: name.split(' ').pop() });
  console.log(`\n== ${name}`);
  for (let k = 0; k < files.length; k++) {
    const parsed = await parsePdfCached(path.join(RAW, files[k] + '.pdf'));
    const mapping = defaultMapping(parsed);
    const plan = planMerge(d, parsed, mapping, { docMeta: { kind: 'four-column' } });
    // Plausibilität der Treffer
    let numSame = 0, numDiff = 0, numNA = 0, lowSim = 0, labelSame = 0, labelDiff = 0;
    const sample = [];
    const suspicious = [];
    for (const pr of plan.rows.filter((r) => r.match === 'matched')) {
      const row = d.rows.find((r) => r.id === pr.rowId);
      if (pr.num && row.num) { if (String(pr.num) === String(row.num)) numSame++; else numDiff++; } else numNA++;
      if (pr.label && row.label) { if (pr.label === row.label) labelSame++; else labelDiff++; }
      // deterministische Stichprobe: jede 50. Zuordnung
      if (pr.idx % 50 === 7) {
        const t = (cells) => { for (const tr of ['com', 'council', 'ep', 'agreement']) { const c = cells[tr]; const x = Array.isArray(c) ? c[c.length - 1] : c; if (x && x.text) return x.text.slice(0, 70); } return ''; };
        sample.push({ newNum: pr.num, oldNum: row.num, newLabel: pr.label, oldLabel: row.label, newText: t(pr.cells), oldText: t(d.cells[pr.rowId] || {}) });
      }
      // Ähnlichkeit über die Kommissionsspalte (ändert sich zwischen Fassungen kaum)
      const prev = (d.cells[pr.rowId] || {}).com;
      const pc = pr.cells.com;
      if (prev && prev.length && pc && pc.text && !prev[prev.length - 1].empty) {
        const s = similarity(htmlToCleanText(prev[prev.length - 1].html), htmlToCleanText(pc.html));
        if (s < 0.5) { lowSim++; suspicious.push({ num: pr.num, oldNum: row.num, label: pr.label, sim: +s.toFixed(2), reason: pr.reason, new: pc.text.slice(0, 80), old: prev[prev.length - 1].text.slice(0, 80) }); }
      }
      if (pr.num && row.num && String(pr.num) !== String(row.num)) suspicious.push({ num: pr.num, oldNum: row.num, label: pr.label, reason: pr.reason, new: Object.values(pr.cells).map((c) => c.text).find(Boolean)?.slice(0, 80) });
    }
    const r = { series: name, doc: files[k], rows: plan.stats.rows, matched: plan.stats.matched, new: plan.stats.new, ambiguous: plan.stats.ambiguous, missing: plan.stats.missing, numSame, numDiff, numNA, lowSim, labelSame, labelDiff, sample, cells: plan.stats.cells, suspicious: suspicious.slice(0, 12) };
    results.push(r);
    const pct = (n) => (plan.stats.rows ? (100 * n / plan.stats.rows).toFixed(1) : '0') + ' %';
    console.log(`${files[k]}: ${plan.stats.rows} Zeilen — matched ${plan.stats.matched} (${pct(plan.stats.matched)}), new ${plan.stats.new} (${pct(plan.stats.new)}), ambiguous ${plan.stats.ambiguous}, fehlend ${plan.stats.missing}; Treffer mit gleicher Nr. ${numSame}, anderer Nr. ${numDiff}, ohne Nr. ${numNA}; geringe Ähnlichkeit (COM) ${lowSim}; Fundstelle gleich ${labelSame}, verschieden ${labelDiff}`);
    if (process.env.SAMPLE) for (const x of sample) console.log('   s ', JSON.stringify(x));
    console.log(`   Zellen: ${JSON.stringify(plan.stats.cells)}`);
    for (const s of suspicious.slice(0, 6)) console.log('   ? ', JSON.stringify(s));
    for (const pr of plan.rows.filter((x) => x.match === 'ambiguous').slice(0, 4)) console.log('   ~ ', pr.num, pr.label, JSON.stringify(pr.candidates.slice(0, 2)));
    d = applyMerge(d, plan).dossier;
  }
}
fs.mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./out/eval-merge.json', import.meta.url), JSON.stringify(results, null, 1));
