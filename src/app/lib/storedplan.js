// Gespeicherte Uploads gegen den eingebetteten Datensatz prüfen (Start, Projektimport). Rein, ohne Browser-APIs.
//
// Fall: Eine Nutzerin hat eine Fassung hochgeladen (IndexedDB); später öffnet sie eine neue zentrale Version des Tools, die diese
// Fassung schon enthält. Ohne Prüfung würde der Upload ein zweites Mal eingearbeitet.
//
// planStored(base, upload) -> { action, stage? }
//   'apply'     Fassung nicht im eingebetteten Datensatz: wie bisher einarbeiten
//   'contained' Fassung und Sprache im eingebetteten Datensatz: überspringen, aus dem Speicher entfernen
//   'tryLang'   Fassung im Datensatz (jüngster Stand), Sprache nicht in stage.langs: einarbeiten; ändert das nichts
//               (SGK: stage.langs nennt nur Sprachen mit Änderungen), gilt der Upload als enthalten (hadEffect = false)
//   'blocked'   Fassung im Datensatz, Sprache fehlt, aber spätere Stände folgen: nicht einarbeiten (addSnapshot vergleicht mit
//               der letzten Version und würde die Chronologie verfälschen), im Speicher behalten und melden
// base: eingebetteter Datensatz des Werks ({ stages, langs }), upload: { celex, lang }.

/** Jüngster Stand des Datensatzes, dessen Quelle die Fassung celex ist (SGK: 02016R0399-20240710 speist mehrere Stände). */
export function stageOfFassung(base, celex) {
  const l = (base.stages || []).filter((s) => s.source && s.source.celex === celex);
  return l.length ? l.reduce((a, b) => (b.order > a.order ? b : a)) : null;
}

export function planStored(base, upload) {
  const st = stageOfFassung(base, upload.celex);
  if (!st) return { action: 'apply' };
  const langs = st.langs || base.langs || [];
  if (langs.includes(upload.lang)) return { action: 'contained', stage: st.id };
  const last = (base.stages || []).reduce((a, b) => (b.order > a.order ? b : a));
  if (last.id !== st.id) return { action: 'blocked', stage: st.id };
  return { action: 'tryLang', stage: st.id };
}

/** Hat das Einarbeiten (before -> after, Datensätze) im Stand stageId und der Sprache lang etwas verändert? */
export function hadEffect(before, after, stageId, lang) {
  const sig = (ds) => {
    const st = ds.stages.find((s) => s.id === stageId);
    const parts = [JSON.stringify(st ? st.langs || [] : null)];
    for (const [id, u] of Object.entries(ds.units)) {
      const vs = (u.versions[lang] || []).filter((v) => v.stage === stageId);
      if (vs.length) parts.push(id + ':' + JSON.stringify(vs));
    }
    return parts.join('\n');
  };
  return sig(before) !== sig(after);
}
