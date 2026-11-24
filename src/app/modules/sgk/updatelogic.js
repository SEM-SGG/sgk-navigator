// Aktualisieren: reine Logik ohne Oberfläche (Status je Eintrag, Zuordnung CELEX -> Werk, Zeilen der gemeinsamen Prüfung).
// Ohne Preact und ohne Browser-APIs, damit die Einheitstests sie direkt laden können.
import { t } from '../../lib/i18n.js';
import { resolveCelex } from '../../../core/library.js';

// Akte und Vorschläge, welche die Pflegenden als «zur Kenntnis genommen» führen (data/zur-kenntnis.txt, beim Build
// eingebettet). Sie gelten als bekannt und zählen nicht als neu, solange sie nicht erfasst sind.
let acknowledged = new Set();
export function setAcknowledged(list) { acknowledged = new Set((list || []).map((x) => (typeof x === 'string' ? x : x && x.celex)).filter(Boolean)); }
export const isAcknowledged = (celex) => acknowledged.has(celex);

/** Stand, in dem ein Akt eingearbeitet ist: stage.act (SGK) oder stage.acts (weitere Werke). */
export function stageOfActIn(data, celex) {
  const s = data.stageOfAct && data.stageOfAct.get(celex);
  if (s) return s;
  const st = (data.stages || []).find((x) => Array.isArray(x.acts) && x.acts.includes(celex));
  return st ? st.id : null;
}

/**
 * Status eines Eintrags der Prüfung gegen die Daten eines Werks (Data-Instanz oder gleich gebautes Objekt:
 * actList, stages, langs, act(), stageOfAct) und die Uploads dieses Werks.
 * kind: 'cons' (konsolidierte Fassung) oder 'act' (ändernder, berichtigender, abweichender Akt, Vorschlag).
 * Ergebnis: { known, label, missing?, irrelevant?, unlisted? }
 */
export function statusOf(data, item, kind, uploads = []) {
  // "neu": jünger als der jüngste erfasste Akt; ältere, nicht erfasste Akte (z. B. frühere Vorschläge) nur als "nicht erfasst"
  const since = data.actList.reduce((m, a) => { const d = a.published || a.adopted || ''; return d > m ? d : m; }, '0000');
  if (kind === 'cons') {
    const st = data.stages.filter((s) => s.source && s.source.celex === item.celex);
    const up = uploads.filter((u) => u.celex === item.celex);
    // verfügbare Sprachfassungen (item.langs aus der Prüfung; fehlt die Angabe, gelten alle Sprachen des Werks)
    const avail = Array.isArray(item.langs) ? data.langs.filter((l) => item.langs.includes(l)) : data.langs;
    if (st.length && !up.length) return { known: true, label: t('update.st.inData', { stages: st.map((s) => s.id).join(', ') }), missing: [] };
    if (!st.length && !up.length && !avail.length) return { known: true, irrelevant: true, label: t('update.st.noLangs', { langs: data.langs.map((l) => l.toUpperCase()).join(', ') }), missing: [] };
    if (up.length) {
      const missing = avail.filter((l) => !up.some((u) => u.lang === l));
      return { known: true, label: t('update.st.uploaded', { stages: st.map((s) => s.id).join(', ') || '?' }) + (missing.length ? ', ' + t('update.st.missing', { langs: missing.map((l) => l.toUpperCase()).join(', ') }) : ''), missing };
    }
    return { known: false, label: avail.length < data.langs.length ? t('update.st.newOnly', { langs: avail.map((l) => l.toUpperCase()).join(', ') }) : t('update.st.new'), missing: avail };
  }
  const a = data.act(item.celex);
  const stage = stageOfActIn(data, item.celex);
  if (item.kind === 'corrigendum' && item.langs && !item.langs.some((l) => data.langs.includes(l))) {
    return { known: true, irrelevant: true, label: t('update.st.onlyLangs', { langs: (item.langs3 || []).join(', ') }) + (a ? ', ' + t('update.st.listed') : '') };
  }
  if (stage) return { known: true, label: t('update.st.inData', { stages: stage }) };
  if (a) return { known: true, label: a.kind === 'proposal' ? t('update.st.listedProposal') : t('update.st.listedNoStage') };
  if (acknowledged.has(item.celex)) return { known: true, acknowledged: true, label: t('update.st.acknowledged') };
  if (item.date && item.date > since) return { known: false, label: t('update.st.new') };
  return { known: true, unlisted: true, label: t('update.st.unlisted') };
}

/** Eintrag neu (nicht erfasst) bzw. unvollständig (konsolidierte Fassung, Sprachen fehlen)? */
export const isNew = (st) => !st.known;
export const isPartial = (st) => !!(st.known && st.missing && st.missing.length);
export const needsAttention = (st) => isNew(st) || isPartial(st);

/** CELEX aus einer Datei -> Werk der Bibliothek (Basisakt, konsolidierte Fassung, Berichtigung) oder null. */
export function assignWork(index, celex) {
  if (!celex) return null;
  return resolveCelex(index, celex);
}

/**
 * Zeilen der gemeinsamen Tabelle für ein Werk.
 * res: Ergebnis von checkUpdates; data: Daten des Werks; uploads: Uploads des Werks.
 * Liefert [{ type: 'cons'|'act', celex, kind, date, st, langs, item }] nach Datum absteigend (bei gleichem Datum
 * konsolidierte Fassungen zuerst). langs: Sprachen für die Links (konsolidiert: nur fehlende).
 */
export function rowsForWork(res, data, uploads = []) {
  const rows = [];
  for (const c of res.consolidated || []) {
    const st = statusOf(data, c, 'cons', uploads);
    rows.push({ type: 'cons', celex: c.celex, kind: 'consolidated', date: c.date, st, langs: st.missing || [], item: c });
  }
  for (const c of res.acts || []) {
    const st = statusOf(data, c, 'act', uploads);
    rows.push({ type: 'act', celex: c.celex, kind: c.kind, date: c.date, st, langs: c.langs ? c.langs.filter((l) => data.langs.includes(l)) : data.langs, item: c });
  }
  rows.sort((x, y) => (y.date || '').localeCompare(x.date || '') || (x.type === y.type ? x.celex.localeCompare(y.celex) : x.type === 'cons' ? -1 : 1));
  return rows;
}

/** Anzahl neuer oder unvollständiger Einträge (gleiche Zählung wie die Einzelprüfung). */
export const countAttention = (rows) => rows.filter((r) => (r.type === 'cons' ? needsAttention(r.st) : isNew(r.st))).length;
