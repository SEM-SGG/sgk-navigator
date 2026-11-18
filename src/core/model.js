// SGK-Navigator — Datenmodell (ESM, isomorph, keine Node-APIs)
//
// buildDataset(parsedSnapshots, acts, options) -> dataset
// addSnapshot(dataset, parsedSnapshot, { actCelex?, date, ... }) -> dataset
// getVersion(dataset, unitId, lang, stageId) -> version | null
// blockHistory(dataset, unitId, lang, key) -> [ { stage, act, change, block|null } ]
// composeAt(dataset, unitId, lang, isActIncluded) -> version   (isActIncluded(celex) oder (celex, block, unitId))
// changesOfStage(dataset, stageId, lang) -> [ { unit, key, change } ]
//
// parsedSnapshots: [ { stage:{ id, act, order, date?, source:{kind, celex, note?}, langs? }, byLang:{ de: parsed, fr: parsed, en: parsed } } ]
//   parsed: Ergebnis von parseEurLex (oder gleich aufgebaut: { units, toc, hasImages, modifiers })

import { normText, similarity, hashString } from './text.js';

const BLOCK_FIELDS = ['k', 'd', 'l', 't', 'o', 'fn', 'ty', 'html', 'asset', 'x', 'nt', 'ch'];

// ------------------------------------------------------------------ Hilfen

function stageOrder(ds, stageId) {
  const s = ds.stages.find((x) => x.id === stageId);
  return s ? s.order : -1;
}
function orderMap(ds) { return new Map(ds.stages.map((s) => [s.id, s.order])); }

function parentKey(k) { const i = k.lastIndexOf('.'); return i < 0 ? '' : k.slice(0, i); }
function lastSeg(k) { const i = k.lastIndexOf('.'); return i < 0 ? k : k.slice(i + 1); }

function cmpText(b) {
  if (b.ty === 'img') return 'IMG';
  const cf = true; // Gross-/Kleinschreibung: ABl.-Ueberschriften sind teils klein erfasst; Text ignoriert Fall nicht -> s. u.
  return b.ty === 'heading' ? normText(b.t, { caseFold: cf }) : normText(b.ty === 'table' ? (b.t || b.html) : b.t);
}
// Vergleichsschluessel eines Blocks (ohne Tiefe, Label-Schreibweise, Fussnoten, Typ heading/text)
function sameBlock(a, b) {
  if (!a || !b) return false;
  if ((a.ty === 'img') !== (b.ty === 'img')) return false;
  if (a.ty === 'img') return a.o === b.o;
  const heading = a.ty === 'heading' || b.ty === 'heading';
  const ta = normText(a.ty === 'table' ? a.t : a.t, { caseFold: heading });
  const tb = normText(b.ty === 'table' ? b.t : b.t, { caseFold: heading });
  return ta === tb && a.o === b.o;
}
function sameText(a, b) {
  if (!a || !b) return false;
  if ((a.ty === 'img') !== (b.ty === 'img')) return false;
  if (a.ty === 'img') return true;
  const heading = a.ty === 'heading' || b.ty === 'heading';
  return normText(a.t, { caseFold: heading }) === normText(b.t, { caseFold: heading });
}

export function cleanBlock(b) {
  const o = {};
  for (const f of BLOCK_FIELDS) if (b[f] !== undefined && b[f] !== null && !(f === 'fn' && !b.fn.length)) o[f] = b[f];
  if (o.l === undefined) o.l = '';
  return o;
}

function versionsEqual(a, b) {
  if (!a || !b) return false;
  if (!!a.repealed !== !!b.repealed) return false;
  if (normText(a.title || '', { caseFold: true }) !== normText(b.title || '', { caseFold: true })) return false;
  if (a.blocks.length !== b.blocks.length) return false;
  for (let i = 0; i < a.blocks.length; i++) {
    const x = a.blocks[i], y = b.blocks[i];
    if (x.k !== y.k || !sameBlock(x, y)) return false;
  }
  return true;
}

// ------------------------------------------------------------------ Schluesselabgleich zwischen Staenden

// Ordnet den Bloecken einer neuen Fassung (je Sprache) die Schluessel der Vorfassung zu, wenn der Text identisch ist.
// Die Zuordnung wird sprachuebergreifend bestimmt, damit die Schluessel in allen Sprachen gleich bleiben.
// prevBy: { lang: version|null }, nextBy: { lang: blocks[] } (Parser-Schluessel), guideBy: optional { lang: blocks[] }
// opts.exactFirst: zuerst alle Bloecke zuordnen, deren Parser-Schluessel in der Vorlage mit gleichem Text vorkommt; erst danach
// die uebrigen (sonst kann ein neuer Block mit gleichem Wortlaut einem spaeteren unveraenderten Block den Schluessel wegnehmen,
// z. B. IO-VO Art. 24 Abs. 2a Bst. b/c gegenueber Abs. 3 Bst. b/c bei einsprachigem addSnapshot). Nur addSnapshot mit
// opts.rekeyExactFirst nutzt es (Upload im Browser); buildDataset und andere Aufrufer bleiben unveraendert.
export function rekey(prevBy, nextBy, guideBy = null, log = null, unitId = '', opts = {}) {
  const langs = Object.keys(nextBy);
  const cand = {}; // parserKey -> { lang: stableKey }
  const decide = (sourceBy, isGuide) => {
    for (const lang of langs) {
      const src = sourceBy && sourceBy[lang];
      const srcBlocks = src ? (Array.isArray(src) ? src : src.blocks) : null;
      if (!srcBlocks) continue;
      const idx = new Map();
      for (const b of srcBlocks) {
        if (b.ty === 'img') continue;
        const t = cmpText(b);
        if (!t) continue;
        if (!idx.has(t)) idx.set(t, []);
        idx.get(t).push(b.k);
      }
      const used = new Set();
      const mapped = new Map();
      const exact = new Set();
      if (opts.exactFirst) {
        for (const b of nextBy[lang]) {
          if (b.ty === 'img') continue;
          if ((idx.get(cmpText(b)) || []).includes(b.k) && !used.has(b.k)) { used.add(b.k); exact.add(b); }
        }
        used.clear();
      }
      const reserved = new Set([...exact].map((b) => b.k));
      for (const b of nextBy[lang]) {
        if (b.ty === 'img') continue;
        const t = cmpText(b);
        const list = (idx.get(t) || []).filter((k) => !used.has(k) && (exact.has(b) ? k === b.k : !reserved.has(k)));
        if (!list.length) continue;
        let pick = null;
        if (list.includes(b.k)) pick = b.k;
        if (!pick) {
          const pk = parentKey(b.k);
          const pm = pk ? (mapped.get(pk) || pk) : '';
          pick = list.find((k) => parentKey(k) === pm && lastSeg(k) === lastSeg(b.k))
            || list.find((k) => parentKey(k) === pm)
            || list.find((k) => lastSeg(k) === lastSeg(b.k))
            || (list.length === 1 ? list[0] : null);
        }
        if (!pick) continue;
        used.add(pick);
        mapped.set(b.k, pick);
        if (!cand[b.k]) cand[b.k] = {};
        if (isGuide && cand[b.k][lang] !== undefined) continue;
        if (!isGuide || cand[b.k][lang] === undefined) cand[b.k][lang] = { key: pick, guide: isGuide };
      }
    }
  };
  decide(prevBy, false);
  if (guideBy) decide(guideBy, true);
  // Sprachuebergreifend entscheiden
  const map = new Map();
  for (const [pk, byLang] of Object.entries(cand)) {
    const vals = Object.values(byLang);
    const prevVals = vals.filter((v) => !v.guide);
    const use = prevVals.length ? prevVals : vals;
    const counts = new Map();
    for (const v of use) counts.set(v.key, (counts.get(v.key) || 0) + 1);
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    if (counts.size > 1 && log) log.push({ unit: unitId, parserKey: pk, candidates: Object.fromEntries(Object.entries(byLang).map(([l, v]) => [l, v.key])) });
    map.set(pk, best);
  }
  // Anwenden: in Dokumentreihenfolge; nicht zugeordnete Bloecke erben den Praefix des Elternteils
  const out = {};
  // gemeinsame Reihenfolge der Parser-Schluessel (aus der ersten Sprache)
  for (const lang of langs) {
    const assigned = new Map();
    const usedKeys = new Set();
    // zuerst alle direkt zugeordneten Schluessel reservieren
    for (const b of nextBy[lang]) if (map.has(b.k)) usedKeys.add(map.get(b.k));
    const res = [];
    for (const b of nextBy[lang]) {
      let nk;
      if (map.has(b.k)) nk = map.get(b.k);
      else {
        const pk = parentKey(b.k);
        const pnew = pk ? (assigned.get(pk) ?? map.get(pk) ?? pk) : '';
        let seg = lastSeg(b.k);
        nk = pnew ? pnew + '.' + seg : seg;
        if (usedKeys.has(nk) || res.some((x) => x.k === nk)) {
          let i = 0;
          const letters = 'abcdefghijklmnopqrstuvwxyz';
          while (usedKeys.has(nk + letters[i]) || res.some((x) => x.k === nk + letters[i])) i++;
          nk = nk + letters[i];
        }
      }
      assigned.set(b.k, nk);
      usedKeys.add(nk);
      res.push({ ...b, k: nk });
    }
    out[lang] = res;
  }
  return { byLang: out, map };
}

// Bilder aus der Vorfassung uebernehmen, wenn die Quelle keine Bilder enthaelt (alte konsolidierte Fassungen)
function carryImages(prevVersion, blocks) {
  if (!prevVersion) return blocks;
  const imgs = prevVersion.blocks.map((b, i) => ({ b, i })).filter((x) => x.b.ty === 'img');
  if (!imgs.length) return blocks;
  const res = blocks.slice();
  for (const { b, i } of imgs) {
    if (res.some((x) => x.k === b.k)) continue;
    // nach dem vorangehenden Block der Vorfassung einfuegen
    let pos = 0;
    for (let j = i - 1; j >= 0; j--) {
      const pk = prevVersion.blocks[j].k;
      const at = res.findIndex((x) => x.k === pk);
      if (at >= 0) { pos = at + 1; break; }
    }
    res.splice(pos, 0, { ...b, carried: true });
  }
  return res;
}

// ------------------------------------------------------------------ Aufbau

function emptyDataset(options) {
  return {
    schema: 1,
    generated: options.generated || new Date().toISOString().slice(0, 10),
    work: options.work || null,
    langs: options.langs || ['de', 'fr', 'en'],
    stages: [],
    toc: [],
    units: {},
  };
}

function lastVersion(ds, unitId, lang) {
  const u = ds.units[unitId];
  if (!u || !u.versions[lang] || !u.versions[lang].length) return null;
  return u.versions[lang][u.versions[lang].length - 1];
}

// Bloecke eines Parser-Ergebnisses fuer den Datensatz aufbereiten (Bilder -> asset-Hash)
function prepBlocks(unit, assets) {
  return unit.blocks.map((b) => {
    const c = { ...b };
    if (b.ty === 'img') {
      if (b.img && b.img.data) {
        const h = hashString(b.img.data);
        c.asset = h;
        if (assets && !assets[h]) assets[h] = { mime: b.img.mime, data: b.img.data };
      } else if (b.asset) c.asset = b.asset;
      delete c.img;
    }
    return c;
  });
}

// Einen Stand fuer alle mitgelieferten Sprachen einarbeiten
function ingest(ds, stage, byLang, ctx) {
  const langs = Object.keys(byLang);
  const ord = stage.order;
  const unitIds = [];
  const seen = new Set();
  for (const lang of langs) for (const u of byLang[lang].units) if (!seen.has(u.id)) { seen.add(u.id); unitIds.push(u.id); }
  const changedLangs = new Set();
  const stageLog = ctx.log || [];
  for (const uid of unitIds) {
    const prevBy = {}, nextBy = {}, meta = {};
    for (const lang of langs) {
      const u = byLang[lang].units.find((x) => x.id === uid);
      if (!u) continue;
      prevBy[lang] = lastVersion(ds, uid, lang);
      let blocks = prepBlocks(u, ctx.assets);
      if (byLang[lang].hasImages === false) blocks = carryImages(prevBy[lang], blocks);
      nextBy[lang] = blocks;
      meta[lang] = u;
    }
    const guideBy = ctx.guides ? Object.fromEntries(Object.entries(ctx.guides).map(([l, g]) => {
      const gu = g.units.find((x) => x.id === uid);
      return [l, gu ? gu.blocks : null];
    })) : null;
    // Vorhandene Schluesselzuordnung dieses Stands (andere Sprache, addSnapshot) wiederverwenden
    const { byLang: rek } = rekey(prevBy, nextBy, guideBy, stageLog, uid, { exactFirst: !!ctx.rekeyExactFirst });
    for (const lang of Object.keys(rek)) {
      const u = meta[lang];
      if (!ds.units[uid]) ds.units[uid] = { id: uid, type: u.type, num: u.num, versions: {} };
      const unit = ds.units[uid];
      if (!unit.versions[lang]) unit.versions[lang] = [];
      const v = {
        stage: stage.id,
        label: u.label,
        title: u.title || '',
        blocks: rek[lang].map((b) => {
          const c = cleanBlock(b);
          // redaktionelle Abweichung: Text geaendert, Herkunft aber nicht der Akt dieses Stands
          return c;
        }),
      };
      const prev = prevBy[lang];
      if (prev && !prev.repealed) {
        // Herkunft und redaktionelle Abweichungen kennzeichnen
        const pm = new Map(prev.blocks.map((b) => [b.k, b]));
        for (const b of v.blocks) {
          const p = pm.get(b.k);
          if (p && !sameText(p, b) && b.o === p.o && !b.x) {
            const strip = (t) => normText(t).replace(/[\s.,;:]+$/, '');
            b.x = strip(p.t) === strip(b.t) ? 'punct' : 'editorial';
            stageLog.push({ unit: uid, key: b.k, lang, stage: stage.id, kind: 'editorial', before: p.t, after: b.t });
          } else if (p && sameText(p, b) && b.o !== p.o && b.ty !== 'img') {
            // Gleicher Wortlaut, andere Herkunft: Akt hat Bestimmung mit unveraendertem Wortlaut neu gefasst
            stageLog.push({ unit: uid, key: b.k, lang, stage: stage.id, kind: 'same-text-new-origin', o: b.o, before: p.o });
          }
          if (p && sameText(p, b) && b.o === p.o) {
            // unveraenderter Block: Darstellung der Vorfassung behalten (Fussnoten, Label), Bild der Vorfassung
            if (p.ty === 'img' && b.ty === 'img' && b.carried) b.asset = p.asset;
          }
        }
      }
      if (!prev || !versionsEqual(prev, v)) {
        if (prev && !prev.repealed) {
          // unveraenderte Bloecke uebernehmen exakt die Vorfassung (keine Scheinaenderungen durch Formatdetails)
          const pm = new Map(prev.blocks.map((b) => [b.k, b]));
          v.blocks = v.blocks.map((b) => {
            const p = pm.get(b.k);
            if (p && sameBlock(p, b) && !b.x) { const { x, ch, ...rest } = p; return { ...rest, d: b.d }; }
            return b;
          });
          if (normText(prev.title || '', { caseFold: true }) === normText(v.title || '', { caseFold: true })) v.title = prev.title;
        }
        unit.versions[lang].push(v);
        changedLangs.add(lang);
      }
    }
  }
  // Aufgehobene Einheiten: in vorheriger Fassung vorhanden, im neuen Stand nicht
  if (!ctx.partial) {
    for (const lang of langs) {
      for (const [uid, unit] of Object.entries(ds.units)) {
        // Erwägungsgründe stehen nur in der ABl.-Fassung; konsolidierte Fassungen führen sie nie. Kein Aufhebungsvermerk.
        if (unit.type === 'recitals') continue;
        const lv = lastVersion(ds, uid, lang);
        if (!lv || lv.repealed) continue;
        if (!byLang[lang].units.some((x) => x.id === uid)) {
          unit.versions[lang].push({ stage: stage.id, label: lv.label, title: lv.title, repealed: true, blocks: [] });
          changedLangs.add(lang);
        }
      }
    }
  }
  // TOC
  mergeToc(ds, stage, byLang);
  return changedLangs;
}

function mergeToc(ds, stage, byLang) {
  const langs = Object.keys(byLang);
  const ref = byLang[langs.includes('de') ? 'de' : langs[0]];
  const present = new Set(ref.toc.map((t) => t.id));
  // Reihenfolge: bestehende Eintraege beibehalten, neue nach ihrem Vorgaenger einfuegen
  let prevId = null;
  for (const t of ref.toc) {
    let e = ds.toc.find((x) => x.id === t.id);
    if (!e) {
      e = { id: t.id, type: t.type, parent: t.parent, num: t.num };
      if (t.type === 'article' || t.type === 'annex') { e.from = stage.id; e.to = null; }
      else { e.heading = {}; e.from = stage.id; }
      const at = prevId ? ds.toc.findIndex((x) => x.id === prevId) + 1 : 0;
      ds.toc.splice(at, 0, e);
    } else if ((e.type === 'article' || e.type === 'annex') && e.to) {
      e.to = null; // wieder eingefuegt
    }
    if (e.type !== 'article' && e.type !== 'annex') {
      for (const lang of langs) {
        const lt = byLang[lang].toc.find((x) => x.id === t.id);
        if (!lt) continue;
        if (!e.heading[lang]) e.heading[lang] = [];
        const arr = e.heading[lang];
        const last = arr[arr.length - 1];
        if (!last || normText(last.text, { caseFold: true }) !== normText(lt.heading || '', { caseFold: true }) || normText(last.label, { caseFold: true }) !== normText(lt.label || '', { caseFold: true })) {
          arr.push({ from: stage.id, label: lt.label, text: lt.heading || '' });
        }
      }
    } else if (t.parent && e.parent !== t.parent) {
      e.parent = t.parent;
    }
    prevId = t.id;
  }
  if (!stage.partial) {
    for (const e of ds.toc) {
      if ((e.type === 'article' || e.type === 'annex') && !present.has(e.id) && !e.to) e.to = stage.id;
    }
  }
}

export function buildDataset(parsedSnapshots, acts = null, options = {}) {
  const ds = emptyDataset(options);
  const ctx = { assets: options.assets || null, log: options.log || [], guides: null };
  for (const snap of parsedSnapshots) {
    const st = { ...snap.stage };
    st.langs = st.langs || Object.keys(snap.byLang);
    ds.stages.push(st);
    ctx.guides = (options.guides && options.guides[st.id]) || null;
    ctx.partial = !!st.partial;
    const changed = ingest(ds, st, snap.byLang, ctx);
    if (st.langsFromChanges) st.langs = st.langs.filter((l) => changed.has(l));
    delete st.langsFromChanges;
    delete st.partial;
  }
  if (options.patches) ds.patches = options.patches;
  return ds;
}

// ------------------------------------------------------------------ Patches (z. B. ETIAS, in keiner konsolidierten Fassung)

// patch: { act, unit, op:'replace'|'insertAfter'|'appendChild', key, after?, blocks:{ lang:[block…] }, unlessLaterThan?:[celex…] }
export function applyPatches(parsed, patches, { lang, actRank }) {
  if (!patches || !patches.length) return { parsed, applied: [] };
  const units = parsed.units.map((u) => ({ ...u, blocks: u.blocks.slice() }));
  const applied = [];
  const included = new Set((parsed.modifiers || []).map((m) => m.celex));
  for (const p of patches) {
    if (included.has(p.act)) { applied.push({ ...p.ref, status: 'skip-included' }); continue; }
    const u = units.find((x) => x.id === p.unit);
    if (!u) { applied.push({ ...p.ref, status: 'unit-missing' }); continue; }
    const repl = (p.blocks && p.blocks[lang]) || [];
    if (p.op === 'replace') {
      const i = u.blocks.findIndex((b) => b.k === p.key);
      if (i < 0) { applied.push({ ...p.ref, status: 'key-missing' }); continue; }
      const cur = u.blocks[i];
      if (actRank && actRank(cur.o) > actRank(p.act)) { applied.push({ ...p.ref, status: 'superseded', by: cur.o }); continue; }
      u.blocks.splice(i, 1, ...repl.map((b) => ({ ...b, d: b.d ?? cur.d })));
      applied.push({ ...p.ref, status: 'applied' });
    } else if (p.op === 'insertAfter') {
      if (u.blocks.some((b) => b.k === repl[0].k)) {
        const ex = u.blocks.find((b) => b.k === repl[0].k);
        if (actRank && actRank(ex.o) > actRank(p.act)) { applied.push({ ...p.ref, status: 'superseded', by: ex.o }); continue; }
        applied.push({ ...p.ref, status: 'exists' }); continue;
      }
      // nach dem Block p.after und dessen Unterbloecken einfuegen
      let i = u.blocks.findIndex((b) => b.k === p.after);
      if (i < 0) { applied.push({ ...p.ref, status: 'anchor-missing' }); continue; }
      while (i + 1 < u.blocks.length && u.blocks[i + 1].k.startsWith(p.after + '.')) i++;
      u.blocks.splice(i + 1, 0, ...repl);
      applied.push({ ...p.ref, status: 'applied' });
    }
  }
  return { parsed: { ...parsed, units }, applied };
}

// ------------------------------------------------------------------ addSnapshot

export function addSnapshot(dataset, parsedSnapshot, opts = {}) {
  const ds = dataset;
  const lang = parsedSnapshot.lang;
  const date = opts.date || parsedSnapshot.date;
  const actCelex = opts.actCelex || null;
  let stage = ds.stages.find((s) => (opts.stageId ? s.id === opts.stageId : (s.source && s.source.celex === parsedSnapshot.celex) || (actCelex && s.act === actCelex && s.date === date)));
  if (!stage) {
    const order = Math.max(-1, ...ds.stages.map((s) => s.order)) + 1;
    stage = {
      id: opts.stageId || 's' + String(order).padStart(2, '0'),
      act: actCelex || parsedSnapshot.celex,
      order,
      date,
      source: { kind: (ds.patches && ds.patches.length) ? 'patched' : 'consolidated', celex: parsedSnapshot.celex, note: opts.note || null },
      langs: [],
    };
    ds.stages.push(stage);
  }
  // Patches anwenden, sofern die Fassung den Akt nicht schon enthaelt
  let parsed = parsedSnapshot;
  if (ds.patches && ds.patches.length) {
    const rank = actRanker(ds, opts.actOrder);
    parsed = applyPatches(parsedSnapshot, ds.patches, { lang, actRank: rank }).parsed;
  }
  const changed = ingest(ds, stage, { [lang]: parsed }, { assets: opts.assets || null, log: opts.log || [], partial: false, rekeyExactFirst: !!opts.rekeyExactFirst });
  if (changed.has(lang) && !stage.langs.includes(lang)) stage.langs.push(lang);
  stage.langs.sort((a, b) => ds.langs.indexOf(a) - ds.langs.indexOf(b));
  return ds;
}

// Rangfolge der Akte nach Stand (fuer "spaeter geaendert"-Pruefung)
export function actRanker(ds, explicitOrder) {
  const order = explicitOrder || ds.stages.map((s) => s.act);
  return (celex) => {
    if (!celex) return -1;
    let i = order.indexOf(celex);
    if (i < 0) i = order.indexOf(celex.replace(/R\(\d+\)$/, ''));
    return i < 0 ? -1 : i;
  };
}

// ------------------------------------------------------------------ Abfragen

export function getVersion(ds, unitId, lang, stageId) {
  const u = ds.units[unitId];
  if (!u || !u.versions[lang]) return null;
  const om = orderMap(ds);
  const target = om.get(stageId);
  if (target === undefined) return null;
  let best = null;
  for (const v of u.versions[lang]) if (om.get(v.stage) <= target) best = v;
  return best;
}

function changeKind(prev, cur, isFirstStage) {
  if (!prev && cur) return isFirstStage ? 'base' : 'inserted';
  if (prev && !cur) return 'deleted';
  if (cur.x === 'editorial') return 'editorial';
  if (cur.x === 'punct') return 'punct';
  if (cur.ch === 'amended') return 'amended';
  return 'replaced';
}

export function blockHistory(ds, unitId, lang, key) {
  const u = ds.units[unitId];
  if (!u || !u.versions[lang]) return [];
  const om = orderMap(ds);
  const first = Math.min(...ds.stages.map((s) => s.order));
  const res = [];
  let prev = null;
  for (const v of u.versions[lang]) {
    const b = v.repealed ? null : (v.blocks.find((x) => x.k === key) || null);
    const st = ds.stages.find((s) => s.id === v.stage);
    if (!prev && !b) continue;
    if (prev && b && sameBlock(prev, b)) { prev = b; continue; }
    const change = changeKind(prev, b, om.get(v.stage) === first);
    res.push({ stage: v.stage, act: change === 'deleted' ? st.act : (change === 'editorial' ? null : (change === 'punct' ? st.act : (b.o || st.act))), change, block: b });
    prev = b;
  }
  return res;
}

export function changesOfStage(ds, stageId, lang) {
  const res = [];
  const om = orderMap(ds);
  const ord = om.get(stageId);
  const first = Math.min(...ds.stages.map((s) => s.order));
  for (const e of ds.toc) {
    const u = ds.units[e.id];
    if (!u || !u.versions[lang]) continue;
    const vs = u.versions[lang];
    const i = vs.findIndex((v) => v.stage === stageId);
    if (i < 0) continue;
    const cur = vs[i];
    const prev = i > 0 ? vs[i - 1] : null;
    if (!prev) {
      if (ord === first) continue;
      for (const b of cur.blocks) res.push({ unit: e.id, key: b.k, change: 'inserted' });
      continue;
    }
    const pm = new Map((prev.repealed ? [] : prev.blocks).map((b) => [b.k, b]));
    const cm = new Map((cur.repealed ? [] : cur.blocks).map((b) => [b.k, b]));
    if (cur.repealed && !prev.repealed) { res.push({ unit: e.id, key: null, change: 'repealed' }); continue; }
    if (normText(prev.title || '', { caseFold: true }) !== normText(cur.title || '', { caseFold: true })) res.push({ unit: e.id, key: '_title', change: 'replaced' });
    for (const b of cur.blocks) {
      const p = pm.get(b.k);
      if (!p) res.push({ unit: e.id, key: b.k, change: 'inserted' });
      else if (!sameBlock(p, b)) res.push({ unit: e.id, key: b.k, change: changeKind(p, b, false) });
    }
    for (const b of prev.repealed ? [] : prev.blocks) if (!cm.has(b.k)) res.push({ unit: e.id, key: b.k, change: 'deleted' });
  }
  return res;
}

// Corrigenda eines Aenderungsakts gelten als Teil des Akts, sofern sie nicht selbst einen Stand bilden
function actOfBlock(ds, celex) {
  if (!celex) return celex;
  if (ds.stages.some((s) => s.act === celex)) return celex;
  const base = celex.replace(/R\(\d+\)$/, '');
  return base;
}

// Text einer Einheit nur mit den eingeschlossenen Akten
//
// isActIncluded(celex) -> boolean                      bisherige Form: ganze Akte ein- oder ausschliessen
// isActIncluded(celex, block, unitId) -> boolean       erweiterte Form (Anwendbarkeit je Einzelaenderung):
//   wird zusaetzlich je geaenderten Block eines eingeschlossenen Stands aufgerufen; block ist der neue Block
//   (bei Streichung { k, deleted: true, o: <Akt des Stands> }). false schliesst nur diese Aenderung aus.
//   Beim Aufruf auf Aktebene ist block undefined. Liefert das Praedikat fuer keinen Block false,
//   ist das Ergebnis identisch mit der bisherigen Form.
export function composeAt(ds, unitId, lang, isActIncluded) {
  const plain = composeAtActs(ds, unitId, lang, isActIncluded);
  if (!plain) return plain;
  if (!hasBlockExclusions(ds, unitId, lang, isActIncluded)) return plain;
  return composeBlockwise(ds, unitId, lang, isActIncluded);
}

// Gibt es in einem eingeschlossenen Stand eine einzelne Aenderung, die das Praedikat ausschliesst?
function hasBlockExclusions(ds, unitId, lang, pred) {
  const u = ds.units[unitId];
  if (!u || !u.versions[lang]) return false;
  const vs = u.versions[lang];
  const stageById = new Map(ds.stages.map((s) => [s.id, s]));
  for (let i = 0; i < vs.length; i++) {
    const v = vs[i];
    const s = stageById.get(v.stage);
    if (!s || !pred(s.act)) continue;
    const prev = i > 0 ? vs[i - 1] : null;
    if (v.repealed) { if (pred(s.act, { k: null, repealed: true, o: s.act }, unitId) === false) return true; continue; }
    const pm = new Map((prev && !prev.repealed ? prev.blocks : []).map((b) => [b.k, b]));
    for (const b of v.blocks) {
      const p = pm.get(b.k);
      if ((!p || !sameBlock(p, b)) && pred(s.act, b, unitId) === false) return true;
    }
    const cur = new Set(v.blocks.map((b) => b.k));
    for (const k of pm.keys()) if (!cur.has(k) && pred(s.act, { k, deleted: true, o: s.act }, unitId) === false) return true;
  }
  return false;
}

// Blockweise Zusammensetzung ueber alle Staende (nur wenn einzelne Aenderungen ausgeschlossen sind)
function composeBlockwise(ds, unitId, lang, pred) {
  const u = ds.units[unitId];
  if (!u || !u.versions[lang] || !u.versions[lang].length) return null;
  const vs = u.versions[lang];
  const sorted = ds.stages.slice().sort((a, b) => a.order - b.order);
  const keyOrder = [];
  const pushKeys = (blocks) => {
    let prevK = null;
    for (const b of blocks) {
      if (!keyOrder.includes(b.k)) {
        const at = prevK ? keyOrder.indexOf(prevK) + 1 : 0;
        keyOrder.splice(at, 0, b.k);
      }
      prevK = b.k;
    }
  };
  const state = new Map();
  let title = vs[0].title, label = vs[0].label, repealed = false, any = false;
  for (const s of sorted) {
    if (!pred(s.act)) continue;
    const vi = vs.findIndex((v) => v.stage === s.id);
    if (vi < 0) continue;
    const v = vs[vi];
    const prev = vi > 0 ? vs[vi - 1] : null;
    if (v.repealed) {
      if (pred(s.act, { k: null, repealed: true, o: s.act }, unitId) !== false) { repealed = true; state.clear(); }
      continue;
    }
    const pm = new Map((prev && !prev.repealed ? prev.blocks : []).map((b) => [b.k, b]));
    pushKeys(v.blocks);
    let changed = false;
    for (const b of v.blocks) {
      const p = pm.get(b.k);
      if (!p || !sameBlock(p, b)) {
        if (pred(s.act, b, unitId) !== false) { state.set(b.k, b); changed = true; }
      } else if (state.get(b.k) === p) state.set(b.k, b);
    }
    const cur = new Set(v.blocks.map((b) => b.k));
    for (const k of pm.keys()) {
      if (!cur.has(k) && state.has(k) && pred(s.act, { k, deleted: true, o: s.act }, unitId) !== false) { state.delete(k); changed = true; }
    }
    if (changed || !prev || prev.repealed) repealed = false;
    if (changed || !any) { if (!prev || normText(prev.title || '') !== normText(v.title || '')) title = v.title; label = v.label; }
    any = true;
  }
  const blocks = keyOrder.filter((k) => state.has(k)).map((k) => state.get(k));
  if (!any) return { stage: null, label: vs[0].label, title: vs[0].title, blocks: [], composed: true, empty: true };
  const res = { stage: null, label, title, repealed: repealed || undefined, blocks, composed: true, partial: true };
  if (!blocks.length && !repealed) res.empty = true;
  return res;
}
export { composeBlockwise as _composeBlockwise };

// Bisherige Zusammensetzung auf Aktebene
function composeAtActs(ds, unitId, lang, isActIncluded) {
  const u = ds.units[unitId];
  if (!u || !u.versions[lang] || !u.versions[lang].length) return null;
  const vs = u.versions[lang];
  const stageById = new Map(ds.stages.map((s) => [s.id, s]));
  const om = orderMap(ds);
  const sorted = ds.stages.slice().sort((a, b) => a.order - b.order);
  const incl = (s) => isActIncluded(s.act);
  // laengstes vollstaendig eingeschlossenes Praefix der Staende
  let baseStage = null;
  for (const s of sorted) { if (incl(s)) baseStage = s; else break; }
  const included = new Set(sorted.filter(incl).map((s) => s.id));
  // Basisversion
  let base = null;
  if (baseStage) base = getVersion(ds, unitId, lang, baseStage.id);
  // Spaetere eingeschlossene Staende ausserhalb des Praefixes: Bloecke einzeln nachfuehren
  const later = sorted.filter((s) => included.has(s.id) && baseStage && s.order > baseStage.order || (!baseStage && included.has(s.id)));
  if (!later.length) {
    if (!base) return { stage: null, label: vs[0].label, title: vs[0].title, blocks: [], composed: true, empty: true };
    return { ...base, composed: true };
  }
  // Blockweise: fuer jeden Schluessel die letzte eingeschlossene Aenderung
  const keyOrder = [];
  const pushKeys = (blocks) => {
    let prevK = null;
    for (const b of blocks) {
      if (!keyOrder.includes(b.k)) {
        const at = prevK ? keyOrder.indexOf(prevK) + 1 : 0;
        keyOrder.splice(at, 0, b.k);
      }
      prevK = b.k;
    }
  };
  if (base && !base.repealed) pushKeys(base.blocks);
  const state = new Map((base && !base.repealed ? base.blocks : []).map((b) => [b.k, b]));
  let title = base ? base.title : vs[0].title, label = base ? base.label : vs[0].label;
  let repealed = base ? !!base.repealed : false;
  for (const s of later) {
    const vi = vs.findIndex((v) => v.stage === s.id);
    if (vi < 0) continue;
    const v = vs[vi];
    const prev = vi > 0 ? vs[vi - 1] : null;
    if (v.repealed) { repealed = true; state.clear(); continue; }
    repealed = false;
    const pm = new Map((prev && !prev.repealed ? prev.blocks : []).map((b) => [b.k, b]));
    pushKeys(v.blocks);
    for (const b of v.blocks) {
      const p = pm.get(b.k);
      if (!p || !sameBlock(p, b)) state.set(b.k, b);
    }
    for (const k of pm.keys()) if (!v.blocks.some((b) => b.k === k)) state.delete(k);
    if (!prev || normText(prev.title || '') !== normText(v.title || '')) title = v.title;
    label = v.label;
  }
  const blocks = keyOrder.filter((k) => state.has(k)).map((k) => state.get(k));
  return { stage: null, label, title, repealed: repealed || undefined, blocks, composed: true };
}
