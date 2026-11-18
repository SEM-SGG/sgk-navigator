// Adapter-Schicht zwischen Oberfläche und Kernbibliothek (SPEC §5.5).
// Die Kernfunktionen kommen aus src/core/* (virtuelle Module, im Build aufgelöst);
// fehlt eine Funktion, greift die Ersatzimplementierung aus fallback-model.js.
import { CARBON, ACT_SPARE } from './tokens.js';
import * as coreModel from 'sgk-core/model';
import * as coreParser from 'sgk-core/parser';
import * as fb from './fallback-model.js';
import { gunzipSync, strFromU8 } from 'fflate';
import { fmtDate, fmtDateShort, todayIso, stripTags, fold, plain } from './lib/format.js';
import { t, uiLang } from './lib/i18n.js';
import { isMhtml } from './lib/decode.js';
import { addUploadedSnapshot } from './lib/uploadnorm.js';
import { buildRefIndex } from '../core/refs.js';
import { composeAtDate as coreComposeAtDate, changeApplicability, findChange } from '../core/applicability.js';

// Kontext der Bibliothek (Etappe 3): Werkindex für das Verweisnetz, Abweichungen (nur SGK)
const ctx = { worksIndex: null, derogations: [] };
export function setLibraryContext(c) { Object.assign(ctx, c); }

const fn = (mod, name) => (mod && typeof mod[name] === 'function' ? mod[name] : null);
export const core = {
  getVersion: fn(coreModel, 'getVersion') || fb.getVersion,
  blockHistory: fn(coreModel, 'blockHistory') || fb.blockHistory,
  composeAt: fn(coreModel, 'composeAt') || fb.composeAt,
  changesOfStage: fn(coreModel, 'changesOfStage') || fb.changesOfStage,
  addSnapshot: fn(coreModel, 'addSnapshot') || fb.addSnapshot,
  parseEurLex: fn(coreParser, 'parseEurLex') || fb.parseEurLex,
};
export const coreSource = {
  model: ['getVersion', 'blockHistory', 'composeAt', 'changesOfStage', 'addSnapshot'].map((n) => [n, !!fn(coreModel, n)]),
  parser: !!fn(coreParser, 'parseEurLex'),
};

// ---------------------------------------------------------------- Einbettung
function readEmbedded(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const txt = el.textContent.trim();
  if (!txt) return null;
  if (el.dataset.enc === 'gz64') {
    const bin = atob(txt);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return JSON.parse(strFromU8(gunzipSync(u8)));
  }
  return JSON.parse(txt);
}
export function loadEmbedded() {
  return {
    dataset: readEmbedded('sgk-dataset'),
    acts: readEmbedded('sgk-acts') || [],
    assets: readEmbedded('sgk-assets') || {},
    meta: readEmbedded('sgk-meta') || {},
  };
}

// ---------------------------------------------------------------- Farben und Kürzel
// Aktfarben aus dem Design System Carbon (act-*-Tokens, src/app/tokens.js), immer zusammen mit Textkürzel.
const FIXED_COLORS = {
  '32016R0399': CARBON['act-base'],
  '32016R1624': CARBON['act-frontex'],
  '32017R0458': CARBON['act-sys'],
  '32017R2225': CARBON['act-ees'],
  '32018R1240': CARBON['act-etias'],
  '32019R0817': CARBON['act-interop'],
  '32021R1134': CARBON['act-vis'],
  '32024R1717': CARBON['act-reform'],
  '32025R1534': CARBON['act-derogation'],
  '32025D1544': CARBON['act-derogation'],
};
// Kurzkürzel für Chips, Randmarken und Inhaltsverzeichnis je Oberflächensprache (sonst Thema aus acts.json oder Nummer)
const CODE_OVERRIDE = {
  de: { '32016R1624': 'Frontex', '32017R0458': 'Syst. Abfr.', '32019R0817': 'Interop.', '32021R1134': 'VIS', '32024R1717': 'Reform 2024', '32025R1534': 'EES-Start', '32025D1544': 'EES-Datum' },
  fr: { '32016R1624': 'Frontex', '32017R0458': 'Vérif. syst.', '32019R0817': 'Interop.', '32021R1134': 'VIS', '32024R1717': 'Réforme 2024', '32025R1534': 'Début EES', '32025D1544': 'Date EES' },
};
const SPARE = ACT_SPARE;
const CORRIGENDUM_COLOR = CARBON['act-base'];
const PREVIEW_COLOR = CARBON['act-proposal'];

/** Bezeichnungen in der Oberflächensprache */
export const kindLabel = (k) => (k ? t('kind.' + k) : '');
export const changeLabel = (c) => (c ? t('change.' + c) : '');
export const sourceKindLabel = (k) => (k ? t('source.' + k) : '');
const ucfirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const lcfirst = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
/** "(EU) 2017/2225" in der Oberflächensprache (FR: "(UE)"), ohne Zusätze wie ", Berichtigung". */
function localNumber(num) {
  let n = String(num || '').replace(/,\s*(Berichtigung|rectificatif|corrigendum).*$/i, '');
  if (uiLang() === 'fr') n = n.replace(/\(EU\)/g, '(UE)').replace(/\(EG\)/g, '(CE)').replace(/^Nr\.\s*/, 'nº ');
  return n;
}

function guessNumber(celex) {
  let m = /^3(\d{4})([RLD])(\d{4})(?:R\((\d+)\))?$/.exec(celex || '');
  if (m) {
    const base = `(EU) ${m[1]}/${Number(m[3])}`;
    return m[4] ? t('act.corrOf', { r: m[4], name: localNumber(base) }) : localNumber(base);
  }
  m = /^5(\d{4})PC(\d{4})$/.exec(celex || '');
  if (m) return `COM(${m[1]}) ${Number(m[2])}`;
  m = /^0(\d{4})R(\d{4})-(\d{4})(\d{2})(\d{2})$/.exec(celex || '');
  if (m) return t('act.consolidatedOf', { date: fmtDate(`${m[3]}-${m[4]}-${m[5]}`) });
  return celex || '';
}

// ---------------------------------------------------------------- Datenobjekt
export class Data {
  constructor({ dataset, acts, assets, meta, work }) {
    this.notes = []; // Abweichungen Schema / Daten (für Info-Ansicht und Bericht)
    // Werk der Bibliothek (Etappe 3): full = Stände je Änderungsakt und geprüfte Anwendbarkeit (nur SGK)
    this.wk = work || null;
    this.workId = (work && work.id) || (dataset && dataset.work && dataset.work.id) || 'sgk';
    this.full = work ? work.full !== false : true;
    this.ds = dataset;
    this.assets = assets || {};
    this.meta = meta || {};
    this.today = todayIso();
    const stages = [...(dataset.stages || [])].map((s, i) => ({ ...s, order: typeof s.order === 'number' ? s.order : i }));
    stages.sort((a, b) => a.order - b.order);
    if (stages.some((s, i) => dataset.stages[i] !== undefined && typeof dataset.stages[i].order !== 'number')) this.notes.push({ k: 'notes.noOrder' });
    this.ds = { ...dataset, stages };
    this.stages = stages;
    this.stageById = new Map(stages.map((s) => [s.id, s]));
    this.langs = dataset.langs || ['de', 'fr', 'en'];
    this.work = dataset.work || {};
    this.abbr = this.work.abbr || { de: 'SGK', fr: 'CFS', en: 'SBC' };

    // Akte
    this.actList = Array.isArray(acts) ? acts : (acts && acts.acts) || [];
    if (!Array.isArray(acts) && acts) this.notes.push({ k: 'notes.actsNotArray' });
    this.acts = new Map(this.actList.map((a) => [a.celex, a]));
    let spare = 0;
    this.colors = new Map();
    const colorFor = (celex, kind) => {
      if (kind === 'base') return FIXED_COLORS['32016R0399'];
      if (String(celex).startsWith('preview:')) return PREVIEW_COLOR;
      if (FIXED_COLORS[celex]) return FIXED_COLORS[celex];
      if (kind === 'corrigendum' || /R\(\d+\)$/.test(celex)) {
        const parent = celex.replace(/R\(\d+\)$/, '');
        return parent !== this.work.celex && FIXED_COLORS[parent] ? FIXED_COLORS[parent] : CORRIGENDUM_COLOR;
      }
      return SPARE[spare++ % SPARE.length];
    };
    for (const s of stages) {
      if (s.act && !this.acts.has(s.act)) {
        this.acts.set(s.act, this.synthAct(s.act, s));
        if (!/^0/.test(s.act)) this.notes.push({ k: 'notes.actMissing', v: { act: s.act, stage: s.id } });
      }
    }
    for (const a of this.acts.values()) this.colors.set(a.celex, colorFor(a.celex, a.kind));
    this.stageOfAct = new Map();
    for (const s of stages) if (s.act && !this.stageOfAct.has(s.act)) this.stageOfAct.set(s.act, s.id);

    // Einheiten in Dokumentreihenfolge
    this.toc = dataset.toc || [];
    const tocUnits = this.toc.filter((t) => t.type === 'article' || t.type === 'annex' || t.type === 'recitals').map((t) => t.id);
    const rest = Object.keys(dataset.units || {}).filter((id) => !tocUnits.includes(id));
    if (rest.length) this.notes.push({ k: 'notes.unitsNoToc', v: { n: rest.length, list: rest.slice(0, 5).join(', ') } });
    this.unitOrder = [...tocUnits.filter((id) => dataset.units && dataset.units[id]), ...rest];
    this.unitIndex = new Map(this.unitOrder.map((id, i) => [id, i]));
    this.tocById = new Map(this.toc.map((t) => [t.id, t]));
    this._cache = new Map();
  }

  synthAct(celex, stage) {
    const kind = /^0/.test(celex) ? 'consolidated' : /R\(\d+\)$/.test(celex) ? 'corrigendum' : celex === this.work.celex ? 'base' : 'amendment';
    return {
      celex, kind, number: guessNumber(celex), topic: null, title: null, synthetic: true,
      published: (stage && stage.date) || null, application: { status: 'applicable', date: (stage && stage.date) || null },
      langs: stage && stage.langs && stage.langs.length < this.langs.length ? stage.langs : null,
    };
  }

  memo(key, f) {
    if (this._cache.has(key)) return this._cache.get(key);
    const v = f();
    this._cache.set(key, v);
    return v;
  }

  // -------------------------------------------------- Stände
  stage(id) { return this.stageById.get(id) || null; }
  get latest() { return this.stages[this.stages.length - 1]; }
  stageIndex(id) { return this.stages.findIndex((s) => s.id === id); }
  prevStage(id) { const i = this.stageIndex(id); return i > 0 ? this.stages[i - 1] : null; }
  stageAct(id) { const s = this.stage(id); return s ? this.act(s.act) : null; }
  stageDate(id) {
    const s = this.stage(id);
    if (!s) return null;
    const a = this.act(s.act);
    return s.date || (a && (a.published || a.adopted)) || null;
  }
  /** Stand = konsolidierte EUR-Lex-Fassung (weitere Werke, full: false) */
  isConsStage(id) { const s = this.stage(id); return !this.full && !!s && !!s.source && s.source.kind !== 'oj' && s.source.kind !== 'preview'; }
  /** Akte, die im Stand neu eingearbeitet sind (stage.acts; SGK: stage.act) */
  stageActs(id) {
    const s = this.stage(id);
    if (!s) return [];
    const l = Array.isArray(s.acts) && s.acts.length ? s.acts : s.act ? [s.act] : [];
    return l.filter((c) => !/^0/.test(c));
  }
  stageName(id, { short = false } = {}) {
    const s = this.stage(id);
    if (!s) return '';
    if (s.source && s.source.kind === 'preview') return short ? (s.trackLabel ? t('preview.headTrack', { track: s.trackLabel[uiLang()] || s.trackLabel.de }) : t('preview.code')) : t('preview.stageName', { name: this.actName(s.act) });
    if (this.isConsStage(id)) return short ? t('stage.consShort', { date: fmtDateShort(this.stageDate(id)) }) : t('stage.cons', { date: fmtDate(this.stageDate(id)) });
    const a = this.act(s.act);
    if (!a) return s.id;
    if (a.kind === 'base') return short ? t('stage.base') : t('stage.baseLong', { name: lcfirstFr(this.actName(a.celex)) });
    if (a.kind === 'consolidated') return lcfirstFr(this.actName(a.celex));
    return short ? t('stage.afterShort', { code: this.actCode(a.celex) }) : t('stage.after', { name: uiLang() === 'fr' ? lcfirst(this.actName(a.celex)) : this.actName(a.celex) });
  }
  /** "Stand nach VO (EU) 2017/2225" bzw. "état après le règlement (UE) 2017/2225" */
  stageLabel(id, opts = {}) {
    const s0 = this.stage(id);
    if (s0 && s0.source && s0.source.kind === 'preview') return this.stageName(id, opts);
    if (this.isConsStage(id)) return opts.short ? t('stage.consShort', { date: fmtDateShort(this.stageDate(id)) }) : t('stage.consLabel', { date: fmtDate(this.stageDate(id)) });
    const a = this.stageAct(id);
    if (a && a.kind === 'base') return opts.short ? t('stage.baseShortLabel') : t('stage.baseLabel', { name: lcfirstFr(this.actName(a.celex)) });
    return t('stage.of', { name: this.stageName(id, opts) });
  }
  /** Kurzer Eintrag für Auswahllisten: "EES 2017/2225 (2017), rekonstruiert" */
  stageOption(id) {
    const s = this.stage(id);
    if (!s) return id;
    if (s.source && s.source.kind === 'preview') return this.stageName(id) + ' (EN)';
    if (this.isConsStage(id)) {
      const codes = this.stageActs(id).filter((c) => !/R\(\d+\)$/.test(c)).map((c) => this.actCode(c));
      return `${fmtDateShort(this.stageDate(id))}${codes.length ? ': ' + codes.join(', ') : ''}`;
    }
    const a = this.act(s.act);
    const num = a && a.kind !== 'base' && a.kind !== 'consolidated' ? this.actNum(a.celex) : '';
    const code = this.actCode(s.act);
    const parts = [a && a.kind === 'base' ? t('stage.base') : `${code}${num && num !== code ? ' ' + num : ''}`];
    const d = this.stageDate(id);
    let out = parts[0] + (d ? ` (${d.slice(0, 4)})` : '');
    if (this.isReconstructed(id)) out += ', ' + (this.isConsolidatedBase(s) ? t('source.short.supplemented') : t('source.short.reconstructed'));
    if (s.langs && s.langs.length < this.langs.length) out += ', ' + t('stage.onlyLangs', { langs: s.langs.map((x) => x.toUpperCase()).join('/') });
    if (this.isPending(s.act)) out += ', ' + t('status.short.pending');
    return out;
  }
  /** Bezeichnung der Textquelle eines Stands. */
  sourceLabel(stageId) {
    const s = this.stage(stageId);
    if (!s || !s.source) return '';
    const k = s.source.kind;
    if (k === 'patched' && this.isConsolidatedBase(s)) return t('source.patchedConsolidated');
    return sourceKindLabel(k);
  }
  /** Erläuterung zur Textquelle in der Oberflächensprache (Daten teils nur DE). */
  sourceNote(stageId) {
    const s = this.stage(stageId);
    const n = s && s.source && s.source.note;
    if (!n) return '';
    return n[uiLang()] || n.de || n.en || '';
  }
  isConsolidatedBase(s) {
    return !!(s && s.source && s.source.celex && s.source.celex.startsWith('0' + String(this.work.celex || '').slice(1)));
  }
  isReconstructed(stageId) {
    const s = this.stage(stageId);
    return !!s && s.source && (s.source.kind === 'reconstructed' || s.source.kind === 'patched');
  }

  // -------------------------------------------------- Akte
  act(celex) {
    if (!celex) return null;
    if (celex === 'B') celex = this.work.celex;
    return this.acts.get(celex) || null;
  }
  color(celex) { return this.colors.get(celex) || CARBON['act-proposal']; }
  actCode(celex) {
    const a = this.act(celex);
    if (!a) return celex || '';
    const l = uiLang();
    if (a.kind === 'base') return t('act.baseCode');
    if (a.kind === 'consolidated') return t('act.consCode');
    if (a.preview) return t('preview.code');
    if (CODE_OVERRIDE[l][a.celex]) return CODE_OVERRIDE[l][a.celex];
    const tp = a.topic && (a.topic[l] || a.topic.de || a.topic.en);
    const num = this.actNum(celex);
    if (a.kind === 'corrigendum') {
      const m = /^(.*)R\((\d+)\)$/.exec(a.celex);
      if (m && m[1] !== this.work.celex && this.acts.has(m[1])) return t('act.corrCode', { code: this.actCode(m[1]) });
      return m ? t('act.corrCodeR', { r: m[2] }) : t('act.corrCodeBare');
    }
    if (tp && tp.length <= 12) return tp;
    return num || a.celex;
  }
  /** Nummer ohne Präfix: "2017/2225" */
  actNum(celex) {
    const a = this.act(celex);
    if (!a) return '';
    return (a.number || '').replace(/^\(E[UG]\)\s*/, '').replace(/^Nr\.\s*/, '').replace(/,.*$/, '');
  }
  /** Bezeichnung mit Typ: "VO (EU) 2017/2225" bzw. "Règlement (UE) 2017/2225" */
  actName(celex) {
    const a = this.act(celex);
    if (!a) return celex || '';
    if (a.preview) return uiLang() === 'fr' ? a.numberFr || a.number : a.number;
    const num = localNumber(a.number) || guessNumber(a.celex);
    if (a.kind === 'proposal') return num;
    if (a.kind === 'corrigendum') {
      const m = /^(.*)R\((\d+)\)$/.exec(a.celex);
      const parent = m && this.act(m[1]);
      if (parent) return t('act.corrOf', { r: m[2], name: lcfirstFr(this.actName(m[1])) });
      return guessNumber(a.celex);
    }
    if (a.kind === 'consolidated') return guessNumber(a.celex);
    if (!/^\(E[UG]\)/.test(a.number || '')) return num;
    const type = /^3\d{4}D/.test(a.celex) ? (a.kind === 'implementing' ? 'implDecision' : 'decision') : /^3\d{4}L/.test(a.celex) ? 'directive' : 'regulation';
    return t('act.type.' + type, { num });
  }
  /** Amtsblattfundstelle in der Oberflächensprache */
  actOj(celex) {
    const a = this.act(celex);
    return (a && a.oj && (a.oj[uiLang()] || a.oj.de)) || '';
  }
  /** Mehrsprachiges Feld aus acts.json in der Oberflächensprache */
  loc(obj) {
    if (!obj) return '';
    if (typeof obj === 'string') return obj;
    return obj[uiLang()] || obj.de || obj.en || '';
  }
  /** Status der Anwendbarkeit eines Akts per heute. */
  status(celex, at = this.today) {
    const a = this.act(celex);
    if (!a) return { kind: 'none', label: '' };
    const ap = a.application || {};
    if (a.preview) return { kind: 'proposal', label: t('preview.status'), pending: true };
    if (a.kind === 'proposal') {
      const pr = a.procedure || {};
      if (pr.stage === 'adopted') {
        const as = pr.adoptedAs && this.act(pr.adoptedAs);
        return { kind: 'proposal', label: as ? t('status.proposalAdoptedAs', { name: lcfirstFr(this.actName(as.celex)) }) : t('status.proposalAdopted'), pending: true, closed: true, end: pr.endDate || (as && as.adopted) || null };
      }
      if (pr.stage === 'withdrawn') return { kind: 'proposal', label: pr.endDate ? t('status.proposalWithdrawnOn', { date: fmtDate(pr.endDate) }) : t('status.proposalWithdrawn'), pending: true, closed: true, end: pr.endDate || null };
      return { kind: 'proposal', label: pr.stage === 'trilogue' ? t('status.proposalTrilogue') : t('status.proposalOpen'), pending: true };
    }
    if (a.kind === 'consolidated') return { kind: 'applicable', label: '' };
    if (a.preview) return { kind: 'proposal', label: t('preview.status'), pending: true };
    if (ap.status === 'unknown') return { kind: 'unknown', label: '', unknown: true };
    if (a.kind === 'derogation' && ap.status !== 'pending') {
      return { kind: 'applicable', label: ap.date ? t('status.applicableSince', { date: fmtDate(ap.date) }) : t('status.applicable'), date: ap.date };
    }
    if (ap.status === 'pending' || (!ap.date && ap.status !== 'applicable')) return { kind: 'pending', label: t('status.pending'), pending: true };
    if (ap.date && ap.date > at) return { kind: 'future', label: t('status.future', { date: fmtDate(ap.date) }), pending: true, date: ap.date };
    if (ap.status === 'partly') return { kind: 'partly', label: ap.date ? t('status.partlySince', { date: fmtDate(ap.date) }) : t('status.partly'), partly: true, date: ap.date };
    const d = ap.date || a.inForce || a.published;
    return { kind: 'applicable', label: d ? t('status.applicableSince', { date: fmtDate(d) }) : t('status.applicable'), date: d };
  }
  isPending(celex, at = this.today) { return !!this.status(celex, at).pending; }
  /** Ist der Akt am Stichtag anwendbar? Grundlage für composeAt. */
  includedAt(celex, at) {
    const a = this.act(celex);
    if (!a) return true;
    if (a.kind === 'base') return true;
    if (a.kind === 'proposal') return false;
    if (a.kind === 'corrigendum') {
      const d = (a.application && a.application.date) || a.published;
      return !d || d <= at;
    }
    if (a.kind === 'consolidated') return true;
    if (a.preview) return false;
    const ap = a.application || {};
    if (ap.status === 'pending') return false;
    const d = ap.date || a.inForce || a.published;
    return !d || d <= at;
  }

  // -------------------------------------------------- Einheiten
  unit(id) { return (this.ds.units || {})[id] || null; }
  unitMeta(id) {
    const u = this.unit(id);
    const t = this.tocById.get(id);
    return { id, type: (u && u.type) || (t && t.type) || (String(id).startsWith('anx') ? 'annex' : 'article'), num: (u && u.num) || (t && t.num) || id };
  }
  version(unitId, lang, stageId) {
    return this.memo(`v|${unitId}|${lang}|${stageId}`, () => {
      try { return core.getVersion(this.ds, unitId, lang, stageId); } catch (e) { this.coreError('getVersion', e); return fb.getVersion(this.ds, unitId, lang, stageId); }
    });
  }
  /** Existiert die Einheit im Stand (nicht aufgehoben, nicht später eingefügt)? */
  exists(unitId, lang, stageId) {
    const v = this.version(unitId, lang, stageId);
    return !!v && !v.repealed;
  }
  versions(unitId, lang) {
    const u = this.unit(unitId);
    const list = (u && u.versions && u.versions[lang]) || [];
    return [...list].sort((a, b) => this.stageIndex(a.stage) - this.stageIndex(b.stage));
  }
  /** Akte, die die Einheit nach dem Basistext geändert haben (Reihenfolge der Stände). */
  unitActs(unitId, lang = 'de') {
    return this.memo(`ua|${unitId}|${lang}`, () => {
      // Akte der Stände, in denen sich die Einheit ändert, und Herkunft der Blöcke (o)
      const vs = this.versions(unitId, lang);
      const set = new Set();
      vs.forEach((v, i) => {
        const s = this.stage(v.stage);
        if (!s) return;
        if (!(i === 0 && s.id === this.stages[0].id) && s.act) set.add(s.act);
        for (const b of v.blocks || []) if (b.o && b.o !== this.work.celex) set.add(b.o);
      });
      const key = (c) => { const a = this.act(c); return (a && (a.adopted || a.published)) || '9999'; };
      return [...set].filter((c) => this.act(c) && this.act(c).kind !== 'consolidated').sort((x, y) => key(x).localeCompare(key(y)));
    });
  }
  history(unitId, lang, key) {
    return this.memo(`h|${unitId}|${lang}|${key}`, () => {
      let h;
      try { h = core.blockHistory(this.ds, unitId, lang, key); } catch (e) { this.coreError('blockHistory', e); h = fb.blockHistory(this.ds, unitId, lang, key); }
      return (h || []).map((x) => ({ stage: x.stage, act: x.act || (this.stage(x.stage) || {}).act, change: x.change || 'replaced', block: x.block || null }));
    });
  }
  changes(stageId, lang) {
    return this.memo(`c|${stageId}|${lang}`, () => {
      try { return core.changesOfStage(this.ds, stageId, lang) || []; } catch (e) { this.coreError('changesOfStage', e); return fb.changesOfStage(this.ds, stageId, lang); }
    });
  }
  composeAt(unitId, lang, date) {
    return this.memo(`ca|${unitId}|${lang}|${date}`, () => {
      const inc = (celex) => this.includedAt(celex, date);
      try { return core.composeAt(this.ds, unitId, lang, inc); } catch (e) { this.coreError('composeAt', e); return fb.composeAt(this.ds, unitId, lang, inc); }
    });
  }
  /** Anwendbares Recht am Datum je Einzeländerung, mit Hinweisen (Erweiterung 8; nur Werke mit geprüfter Anwendbarkeit). */
  composeAtDate(unitId, lang, date) {
    return this.memo(`cad|${unitId}|${lang}|${date}|${uiLang()}`, () => {
      try {
        const derogs = this.workId === 'sgk' ? (typeof ctx.derogations === 'function' ? ctx.derogations() : ctx.derogations) : [];
        const r = coreComposeAtDate(this.ds, this.actList, derogs, unitId, lang, date);
        r.notices = r.notices.map((n0) => {
          const n = { ...n0 };
          const a = this.act(n.celex);
          const ch = a ? findChange(a, unitId, n.key) : null;
          // berechnete Fristen kennzeichnen (changes[].periods[].computed)
          if (ch && Array.isArray(ch.periods) && ch.periods.some((p) => p.computed)) n.computed = true;
          // Erläuterung und Fundstelle in der Oberflächensprache (der Kern wählt die Sprache des Rechtstexts)
          if (n.kind === 'derogation') {
            const e = derogs.find((d) => d.celex === n.celex);
            const af = e && (e.affects || []).find((x) => x.unit === unitId && (x.key || null) === (n.key || null) && x.effect === n.effect);
            if (af) { n.note = this.loc(af.note) || n.note; n.basis = this.loc(af.basis) || n.basis; }
          } else if (a) {
            n.note = this.loc(ch && ch.note) || this.loc(a.application && a.application.note) || n.note;
            const ap = this.changeApp(n.celex, unitId, n.key, date);
            if (ap && ap.basis) n.basis = this.loc(ap.basis);
          }
          return n;
        });
        return r;
      } catch (e) {
        this.coreError('composeAtDate', e);
        return { version: this.composeAt(unitId, lang, date), notices: [] };
      }
    });
  }
  /** Anwendbarkeit einer einzelnen Änderung (Chronologie). */
  changeApp(celex, unitId, key, date = this.today) {
    try { return changeApplicability(this.actList, celex, unitId, key, date); } catch { return null; }
  }
  /** Verweisnetz eines Stands und einer Sprache (Erweiterung 5). */
  refIndex(lang, stageId) {
    return this.memo(`ri|${lang}|${stageId}`, () => {
      try { return buildRefIndex(this.ds, lang, stageId, { worksIndex: ctx.worksIndex }); }
      catch (e) { this.coreError('buildRefIndex', e); return { out: {}, in: {}, external: {}, stats: {} }; }
    });
  }
  /** Akte mit Stand, die am Stichtag nicht berücksichtigt sind. */
  excludedAt(date) {
    return this.stages.map((s) => s.act).filter((c, i, arr) => c && arr.indexOf(c) === i && !this.includedAt(c, date));
  }
  coreError(name, e) {
    const msg = `${name}: ${e && e.message}`;
    if (!this.notes.some((n) => n.v && n.v.msg === msg)) { this.notes.push({ k: 'notes.coreError', v: { msg } }); console.warn('Kernfunktion fehlgeschlagen', msg); }
  }

  /** Überschrift eines Gliederungseintrags im Stand. */
  heading(tocEntry, lang, stageId) {
    const h = tocEntry && tocEntry.heading && (tocEntry.heading[lang] || tocEntry.heading.de);
    if (!Array.isArray(h) || !h.length) return null;
    const idx = this.stageIndex(stageId);
    let best = h[0];
    for (const x of h) if (this.stageIndex(x.from) <= idx) best = x;
    return best;
  }
  /** Existiert ein Gliederungseintrag im Stand? */
  tocAlive(t, stageId) {
    const i = this.stageIndex(stageId);
    if (t.from && this.stageIndex(t.from) > i) return false;
    if (t.to && this.stageIndex(t.to) <= i) return false;
    return true;
  }

  asset(id) { return this.assets[id] || null; }

  /**
   * Titel einer Einheit. html: bereinigtes Inline-HTML (ohne Fettung, die Überschrift ist bereits fett), text: reiner Text.
   * Fehlt ein amtlicher Titel (z. B. Anhänge V, VIII, XII), liefert derived einen abgeleiteten Kurzbeschrieb.
   */
  unitTitle(unitId, lang, stageId) {
    const v = this.version(unitId, lang, stageId || this.latest.id) || this.versions(unitId, lang).slice(-1)[0];
    if (this.unitMeta(unitId).type === 'recitals') return { html: '', text: '', derived: '', label: '', recitals: true, missing: !v };
    if (!v || v.repealed) return { html: '', text: '', derived: '', label: '', repealed: !!(v && v.repealed), missing: !v };
    const text = plain(v.title || '');
    if (text) return { html: v.title, text, derived: '', label: text };
    const d = this.memo(`dt|${unitId}|${lang}|${v.stage}`, () => deriveTitle(v.blocks || []));
    return { html: '', text: '', derived: d.text, derivedPrefix: d.figure ? t('derived.figure') : '', label: (d.figure ? t('derived.figure') + ' ' : '') + d.text };
  }

  // -------------------------------------------------- Suche
  searchIndex(lang, stageId) {
    return this.memo(`si|${lang}|${stageId}`, () => {
      const out = [];
      for (const id of this.unitOrder) {
        const v = this.version(id, lang, stageId);
        if (!v || v.repealed) continue;
        out.push({ unit: id, key: null, text: fold(`${v.label || ''} ${plain(v.title || '')}`), raw: plain(v.title || '') });
        for (const b of v.blocks || []) {
          let raw = stripTags(b.t || '');
          // Formulare als Text (Erweiterung 9): Transkription durchsuchbar
          const f = b.ty === 'img' && ctx.formOf ? ctx.formOf(this, id, b, lang) : null;
          if (f && f.blocks && f.blocks.length) raw = f.blocks.map((x) => stripTags(x.t || '')).join(' ');
          out.push({ unit: id, key: b.k, text: fold(raw), raw, form: !!f });
        }
      }
      return out;
    });
  }
}

// ---------------------------------------------------------------- Upload-Pipeline
/** Erste Stufe: HTML einer EUR-Lex-Datei prüfen und auswerten (ohne Bezug zu einem Werk). Wirft verständliche Fehler. */
export function parseEurLexFile(html) {
  if (isMhtml(html)) throw new Error(t('upload.err.mhtml'));
  if (!/<html|<body|<div|<p/i.test(html)) throw new Error(t('upload.err.notHtml'));
  if (!/eur-lex|celex|EUR-Lex|oj-|modref|ti-art/i.test(html)) throw new Error(t('upload.err.notEurlex'));
  let parsed;
  try {
    parsed = core.parseEurLex(html, { DOMParser });
  } catch (e) {
    throw new Error(t('upload.err.parse', { msg: e.message }));
  }
  if (!parsed || !Array.isArray(parsed.units) || !parsed.units.length) throw new Error(t('upload.err.noArticles'));
  return parsed;
}

/** Verarbeitet eine hochgeladene EUR-Lex-Datei für ein Werk. opts.parsed: Ergebnis von parseEurLexFile (nicht erneut auswerten). */
export function parseUpload(html, data, uploads = [], opts = {}) {
  const parsed = opts.parsed || parseEurLexFile(html);
  const lang = String(parsed.lang || '').toLowerCase();
  if (!data.langs.includes(lang)) throw new Error(t('upload.err.lang', { lang: parsed.lang || '?', langs: data.langs.map((l) => l.toUpperCase()).join(', ') }));
  const wc = data.work.celex || '32016R0399';
  const celex = parsed.celex || '';
  const workNum = wc.slice(1); // 2016R0399
  if (!celex.includes(workNum)) throw new Error(celex ? t('upload.err.otherAct', { celex, work: data.work.celex }) : t('upload.err.otherActUnknown', { work: data.work.celex }));
  if (parsed.kind !== 'consolidated') throw new Error(t('upload.err.notConsolidated', { prefix: '0' + workNum }));
  // Duplikat: dieselbe Fassung in derselben Sprache bereits hochgeladen, oder im eingebetteten Datensatz enthalten
  const uploadedCelex = new Set(uploads.map((u) => u.celex));
  const dupUpload = uploads.find((u) => u.celex === celex && u.lang === lang);
  const dup = dupUpload ? data.stages.find((s) => s.source && s.source.celex === celex) || { id: '?' }
    : data.stages.find((s) => s.source && s.source.celex === celex && (!uploadedCelex.has(celex) || (s.langs || data.langs).includes(lang)));
  if (dup) {
    const err = new Error(t('upload.err.duplicate', { celex, lang: lang.toUpperCase(), stage: dup.id }));
    err.duplicate = true;
    throw err;
  }
  return { parsed, lang, celex, date: parsed.date || null };
}

/**
 * Arbeitet eine hochgeladene Fassung (eine Sprache) ein. Arbeitet auf einer Kopie: der übergebene Datensatz (oft der eingebettete
 * Basisdatensatz, dessen Einheiten die Data-Instanz teilt) bleibt unverändert, damit ein erneutes Anwenden der gespeicherten
 * Uploads (Entfernen, Projektimport) vom unveränderten Stand ausgeht.
 * opts.full: Werk mit Ständen je Änderungsakt (SGK, Standard) oder weiteres Werk (Aufbereitung wie scripts/build-work.mjs,
 * src/app/lib/uploadnorm.js). Schlüsselabgleich mit Vorrang für unveränderte Blöcke (rekeyExactFirst, src/core/model.js).
 */
export function applySnapshot(dataset, parsed, opts = {}) {
  const { full = true, ...rest } = opts;
  const ds = structuredClone(dataset);
  return addUploadedSnapshot(core.addSnapshot, ds, parsed, { ...rest, rekeyExactFirst: true }, { full });
}

export { stripTags };

const lcfirstFr = (s) => (uiLang() === 'fr' ? lcfirst(s) : s);
export { ucfirst };

/** Abgeleiteter Kurzbeschrieb einer Einheit ohne amtlichen Titel. */
function deriveTitle(blocks) {
  const parts = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.ty === 'heading' && /^pt[A-Z0-9]+$/.test(b.k)) {
      const sub = blocks.find((x) => x.ty === 'heading' && x.k === b.k + '.h1');
      parts.push(sub ? `${plain(b.t)}: ${plain(sub.t)}` : plain(b.t));
    }
  }
  if (parts.length) return { text: parts.join('; ') };
  const h = blocks.find((b) => b.ty === 'heading');
  if (h) return { text: plain(h.t) };
  const img = blocks.find((b) => b.ty === 'img');
  if (img) {
    const lines = String(img.t || '').split(/<br\s*\/?>/i).map(plain).filter(Boolean);
    const cap = lines.find((x) => x.split(' ').length >= 4 && x === x.toUpperCase());
    return { text: cap || lines[0] || '', figure: true };
  }
  const first = blocks.find((b) => b.t);
  const s = first ? plain(first.t) : '';
  return { text: s.length > 90 ? s.slice(0, 88) + ' …' : s };
}
