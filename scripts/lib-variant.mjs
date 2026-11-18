// Testvarianten der Datensätze: einen Stand entfernen (gemeinsam für build.mjs und test/app/equiv.test.mjs).
// Der Datensatz wird verändert und zurückgegeben (Aufrufer übergibt bei Bedarf eine Kopie).

/** Jüngster Stand eines Datensatzes (nach order). */
export function lastStage(ds) {
  return [...ds.stages].sort((a, b) => b.order - a.order)[0] || null;
}

/** Jüngster Stand aus einer konsolidierten Fassung des Basisakts (SGK: --drop-stage last-consolidated). */
export function lastConsolidatedStage(ds) {
  return [...ds.stages].sort((a, b) => b.order - a.order)
    .find((s) => s.source && String(s.source.celex || '').startsWith('0' + ds.work.celex.slice(1)) && /consolidated|patched/.test(s.source.kind)) || null;
}

/** Entfernt den Stand st (Objekt) mit allen Versionen und Gliederungseinträgen, die er eingeführt hat. */
export function dropStage(ds, st) {
  ds.stages = ds.stages.filter((s) => s.id !== st.id);
  for (const u of Object.values(ds.units)) for (const l of Object.keys(u.versions)) u.versions[l] = u.versions[l].filter((v) => v.stage !== st.id);
  for (const id of Object.keys(ds.units)) if (Object.values(ds.units[id].versions).every((l) => !l.length)) delete ds.units[id];
  ds.toc = ds.toc.filter((t) => t.from !== st.id);
  for (const t of ds.toc) {
    if (t.to === st.id) t.to = null;
    if (t.heading) for (const l of Object.keys(t.heading)) t.heading[l] = t.heading[l].filter((h) => h.from !== st.id);
  }
  return ds;
}
