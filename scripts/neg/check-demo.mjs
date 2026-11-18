// Maschinelle Prüfung eines Beispiel-Dossiers (von build-demo.mjs und test/neg/real.test.mjs verwendet).
// checkDossier(d, { gridDoc?, gridNums? }) -> [Verstoss]
//   - jede Zeile hat in mindestens einer Spur Text
//   - keine zwei Zeilen mit gleicher Fundstelle und gleichem Text in derselben Spur und demselben Dokument
//   - keine zwei Zeilen mit gleicher Fundstelle und gleichem jüngstem Text in derselben Spur
//   - Zeilen der Rasterfassung (createdBy = gridDoc) in deren Reihenfolge (Zeilennummern wie gridNums)
import { sortedRows, latestCell } from '../../src/neg/model.js';

export function checkDossier(d, { gridDoc, gridNums } = {}) {
  const errs = [];
  for (const r of d.rows) {
    const any = Object.values(d.cells[r.id] || {}).some((list) => list.some((c) => !c.empty));
    if (!any) errs.push(`Zeile ${r.id} (${r.label}) ohne Text`);
  }
  const seen = new Map();
  for (const r of d.rows) for (const [t, list] of Object.entries(d.cells[r.id] || {})) for (const c of list) {
    if (c.empty) continue;
    const k = `${c.doc}|${t}|${r.label}|${c.text}`;
    if (seen.has(k)) errs.push(`Dublette ${seen.get(k)}/${r.id}: ${r.label} [${t}, ${c.doc}] "${c.text.slice(0, 50)}"`);
    else seen.set(k, r.id);
  }
  const lab = new Map();
  for (const r of sortedRows(d)) for (const t of Object.keys(d.cells[r.id] || {})) {
    const c = latestCell(d, r.id, t);
    if (!c || c.empty) continue;
    const k = `${t}|${r.label}|${c.text}`;
    if (lab.has(k)) errs.push(`gleiche Fundstelle und gleicher aktueller Text: ${lab.get(k)}/${r.id} ${r.label} [${t}]`);
    else lab.set(k, r.id);
  }
  if (gridDoc && gridNums) {
    const order = sortedRows(d).filter((r) => r.createdBy === gridDoc).map((r) => (r.numHistory && r.numHistory.length ? r.numHistory[0].num : r.num));
    if (JSON.stringify(order) !== JSON.stringify(gridNums)) errs.push('Reihenfolge der Rasterzeilen weicht von der Rasterfassung ab');
  }
  return errs;
}

// Aufruf als Skript: node scripts/neg/check-demo.mjs  → prüft alle Beispiel-Dossiers in data/ (Verstösse je Datei, Exit-Code 1 bei Verstoss)
if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { importDossier, validateDossier } = await import('../../src/neg/model.js');
  const dir = path.resolve(new URL('../../data', import.meta.url).pathname);
  let total = 0;
  for (const f of fs.readdirSync(dir).filter((x) => /^neg-demo.*\.json$/.test(x)).sort()) {
    const r = importDossier(fs.readFileSync(path.join(dir, f), 'utf8'));
    const errs = r.dossier ? [...validateDossier(r.dossier).errors, ...checkDossier(r.dossier)] : r.errors;
    total += errs.length;
    console.log(`${f}: ${errs.length} Verstösse${errs.length ? '\n  ' + errs.join('\n  ') : ''}`);
  }
  process.exitCode = total ? 1 : 0;
}
