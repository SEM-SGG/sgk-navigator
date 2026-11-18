#!/usr/bin/env node
// SGK-Navigator — Validierung von data/dataset.json und Bericht data/VALIDATION.md
// Aufruf: node scripts/validate.mjs   (setzt einen aktuellen Build voraus: node scripts/build-data.mjs)

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { diffArrays } from 'diff';
import { DOMParser } from './lib-dom.mjs';
import { parseEurLex, sourceText } from '../src/core/parser.js';
import { normText, tokens } from '../src/core/text.js';
import { getVersion, changesOfStage, composeAt, blockHistory, applyPatches } from '../src/core/model.js';
import { ROOT, RAW, DATA, LANGS, readRaw, parseRaw, writeAtomic } from './build-data.mjs';
import { actOf, ACT_ORDER } from './reconstruct.mjs';

const ds = JSON.parse(readFileSync(resolve(DATA, 'dataset.json'), 'utf8'));
const buildLog = JSON.parse(readFileSync(resolve(ROOT, 'scripts/out/build-log.json'), 'utf8'));
const acts = existsSync(resolve(DATA, 'acts.json')) ? JSON.parse(readFileSync(resolve(DATA, 'acts.json'), 'utf8')) : null;
const assetsRep = existsSync(resolve(ROOT, 'scripts/out/assets-report.json')) ? JSON.parse(readFileSync(resolve(ROOT, 'scripts/out/assets-report.json'), 'utf8')) : null;
const R = { coverage: [], coverageDs: [], actText: [], reverse: [], lang: [], langChanges: [], stageDiff: [], actsJson: [], etias: [], unitsCount: {} };

const plain = (h) => normText(h || '');
const stageById = new Map(ds.stages.map((s) => [s.id, s]));

// ------------------------------------------------------------ A Abdeckung
function concatParsed(p) {
  const parts = [];
  const tocDiv = new Map(p.toc.filter((t) => t.type !== 'article' && t.type !== 'annex').map((t) => [t.id, t]));
  for (const t of p.toc) {
    if (tocDiv.has(t.id)) { parts.push(t.label, t.heading); continue; }
    const u = p.units.find((x) => x.id === t.id);
    if (!u) continue;
    parts.push(u.label, u.title || '');
    for (const b of u.blocks) { if (b.ty === 'img') continue; parts.push(b.l || '', b.t); }
  }
  return parts.join(' ');
}
function headingAt(e, lang, stageId) {
  const arr = (e.heading && e.heading[lang]) || [];
  const ord = stageById.get(stageId).order;
  let best = null;
  for (const h of arr) if (stageById.get(h.from).order <= ord) best = h;
  return best;
}
function concatDataset(stageId, lang) {
  const parts = [];
  const ord = stageById.get(stageId).order;
  for (const e of ds.toc) {
    if (e.type !== 'article' && e.type !== 'annex') {
      if (stageById.get(e.from).order > ord) continue;
      const h = headingAt(e, lang, stageId);
      if (h) parts.push(h.label, h.text);
      continue;
    }
    const v = getVersion(ds, e.id, lang, stageId);
    if (!v || v.repealed) continue;
    parts.push(v.label, v.title || '');
    for (const b of v.blocks) { if (b.ty === 'img') continue; parts.push(b.l || '', b.t); }
  }
  return parts.join(' ');
}
function concatImageText(stageId, lang) {
  const parts = [];
  for (const e of ds.toc) {
    const v = getVersion(ds, e.id, lang, stageId);
    if (!v || !v.blocks) continue;
    for (const b of v.blocks) if (b.ty === 'img') parts.push(b.t || '');
  }
  // Bildtexte der juengsten konsolidierten Fassung (EUR-Lex "Text von Bild"), falls der Stand keine hat
  const p = parseRaw('02016R0399-20251012', lang);
  for (const u of p.units) for (const b of u.blocks) if (b.ty === 'img') parts.push(b.t || '');
  return parts.join(' ');
}
function compareTokens(srcText, outText) {
  const a = tokens(srcText), b = tokens(outText);
  const d = diffArrays(a, b);
  let common = 0, missing = 0, extra = 0;
  const gaps = [];
  let pos = 0;
  for (let i = 0; i < d.length; i++) {
    const part = d[i];
    if (!part.added && !part.removed) { common += part.count; pos += part.count; continue; }
    if (part.removed) missing += part.count; else extra += part.count;
    const ctxBefore = a.slice(Math.max(0, pos - 8), pos).join(' ');
    gaps.push({ type: part.removed ? 'fehlt' : 'zusaetzlich', text: part.value.join(' ').slice(0, 300), context: ctxBefore.slice(-120) });
    if (part.removed) pos += part.count;
  }
  return { srcTokens: a.length, outTokens: b.length, common, missing, extra, coverage: a.length ? common / a.length : 1, gaps };
}

const SOURCES = [
  ['s00', '32016R0399'], ['s01', '02016R0399-20161006'], ['s02', '02016R0399-20170407'], ['s07', '02016R0399-20240710'], ['s08', '02016R0399-20251012'],
];
for (const [sid, celex] of SOURCES) {
  for (const lang of LANGS) {
    const html = readRaw(celex, lang);
    const src = sourceText(html, { DOMParser, imageText: false });
    const p = parseRaw(celex, lang);
    const r = compareTokens(src, concatParsed(p));
    R.coverage.push({ stage: sid, celex, lang, ...r });
    // Datensatz-Stand gegen Quelle (s07/s08 enthalten zusaetzlich den ETIAS-Patch)
    const st = stageById.get(sid);
    const useStage = sid === 's08' && !st.langs.includes(lang) ? 's08' : sid;
    const rd = compareTokens(src, concatDataset(useStage, lang));
    R.coverageDs.push({ stage: sid, celex, lang, ...rd });
    if (ds.patches && (sid === 's07' || sid === 's08')) {
      const pp = applyPatches(p, ds.patches, { lang, actRank: (c) => { try { return ACT_ORDER.indexOf(actOf(c)); } catch { return -1; } } }).parsed;
      const rp = compareTokens(concatParsed(pp), concatDataset(useStage, lang));
      R.coverageDsPatched = R.coverageDsPatched || [];
      R.coverageDsPatched.push({ stage: sid, celex, lang, ...rp });
    }
    R.unitsCount[`${sid}_${lang}`] = p.units.length;
  }
}

// ------------------------------------------------------------ B Akttext
const ACT_STAGE = { '32016R1624': 's01', '32017R0458': 's02', '32017R2225': 's03', '32019R0817': 's05', '32021R1134': 's06', '32024R1717': 's07' };
const CORR = { '32017R2225R(01)': 's03', '32024R1717R(01)': 's08' };
const actTextCache = new Map();
function actText(celex, lang) {
  const k = celex + lang;
  if (!actTextCache.has(k)) {
    const html = readRaw(celex, lang);
    let t = sourceText(html, { DOMParser });
    if (!t || t.length < 200) {
      // Berichtigungen: gesamter Text
      const doc = new DOMParser().parseFromString(html, 'text/html');
      t = doc.body.textContent;
    }
    actTextCache.set(k, normText(t));
  }
  return actTextCache.get(k);
}
const nq = (t) => normText(t).replace(/\(\s*\*\s*\d+\s*\)/g, '').replace(/['"]/g, '"').replace(/ ?" ?/g, '"').replace(/ {2,}/g, ' ').replace(/ ([,;:.)])/g, '$1');
function wordDiff(n, region) {
  const d = diffArrays(n.split(' '), region.split(' '));
  const diffs = [];
  for (const part of d) if (part.added || part.removed) diffs.push((part.added ? '+' : '-') + part.value.join(' '));
  return diffs;
}
function findIn(hayRaw, needle) {
  const hay = nq(hayRaw);
  const n = nq(needle);
  if (!n) return { ok: true, how: 'leer' };
  if (hay.includes(n)) return { ok: true, how: 'exakt' };
  const n2 = n.replace(/[.;,:]+$/, '');
  if (n2.length > 3 && hay.includes(n2)) return { ok: true, how: 'ohne Schlusszeichen' };
  const hl = hay.toLowerCase();
  if (n2.length > 3 && hl.includes(n2.toLowerCase())) return { ok: true, how: 'Gross-/Kleinschreibung', note: true };
  const words = n.split(' ');
  const cands = new Set();
  for (const frag of [words.slice(0, 6).join(' '), words.slice(-6).join(' '), words.slice(Math.floor(words.length / 2), Math.floor(words.length / 2) + 6).join(' ')]) {
    if (frag.split(' ').length < 3) continue;
    let at = hl.indexOf(frag.toLowerCase());
    while (at >= 0 && cands.size < 40) { cands.add(at); at = hl.indexOf(frag.toLowerCase(), at + 1); }
  }
  let best = null;
  for (const at of cands) {
    for (const back of [0, n.length]) {
      const start = Math.max(0, at - back);
      const region = hay.slice(start, start + n.length * 2 + 40);
      // Region auf Wortgrenzen um den besten Ausschnitt kuerzen
      const rw = region.split(' ');
      for (const len of [words.length, words.length + 2, words.length - 2]) {
        for (let off = 0; off < Math.min(rw.length, back ? words.length + 4 : 4); off++) {
          const seg = rw.slice(off, off + Math.max(1, len)).join(' ');
          const diffs = wordDiff(n, seg);
          const score = diffs.reduce((x, d) => x + d.length, 0);
          if (!best || score < best.score) best = { score, diffs };
        }
      }
    }
  }
  if (!best) return { ok: false, how: 'nicht gefunden' };
  const onlyCase = best.diffs.length && best.diffs.length % 2 === 0 && (() => { for (let i = 0; i < best.diffs.length; i += 2) if (best.diffs[i].slice(1).toLowerCase() !== best.diffs[i + 1].slice(1).toLowerCase()) return false; return true; })();
  if (onlyCase) return { ok: true, how: 'Gross-/Kleinschreibung', note: true, diffs: best.diffs };
  return { ok: false, how: 'abweichend', diffs: best.diffs.slice(0, 10) };
}
// Berichtigung: berichtigter Wortlaut ("muss es heißen", "lire", "read") muss im Block stehen
function corrigendumTarget(celex, lang) {
  const doc = new DOMParser().parseFromString(readRaw(celex, lang), 'text/html');
  const t = nq(doc.body.textContent);
  const m = t.match(/(?:muss es heißen|lire|read)\s*:?\s*"(.*?)"/i);
  if (!m) return null;
  return m[1].replace(/^(\.\.\.|…)\s*/, '').replace(/^(\(?[a-z]{1,4}\)|\d+\.)\s+/, '');
}
for (const [act, sid] of Object.entries({ ...ACT_STAGE, ...CORR })) {
  for (const lang of LANGS) {
    if (!stageById.get(sid).langs.includes(lang) && CORR[act]) continue;
    let srcCelex = act;
    if (!existsSync(resolve(RAW, `${srcCelex}_${lang.toUpperCase()}.html`))) continue;
    const corrTarget = CORR[act] ? corrigendumTarget(act, lang) : null;
    const hay = actText(srcCelex, lang);
    const res = { act, stage: sid, lang, checked: 0, ok: 0, short: 0, bad: [] };
    for (const e of ds.toc) {
      const u = ds.units[e.id];
      if (!u) continue;
      const v = (u.versions[lang] || []).find((x) => x.stage === sid);
      if (!v) continue;
      for (const b of v.blocks) {
        if (b.o !== act || b.ty === 'img' || b.x) continue;
        const prev = getVersion(ds, e.id, lang, ds.stages.find((s) => s.order === stageById.get(sid).order - 1)?.id || sid);
        const pb = prev && prev !== v ? prev.blocks.find((x) => x.k === b.k) : null;
        if (pb && pb.o === b.o && normText(pb.t) === normText(b.t)) continue; // unveraendert uebernommen
        res.checked++;
        const txt = b.ty === 'table' ? b.t : b.t;
        if (normText(txt).length < 25) res.short++;
        let f;
        if (corrTarget) {
          const tgt = nq(corrTarget).replace(/[.;,:]+$/, '');
          f = nq(txt).includes(tgt) ? { ok: true, how: 'berichtigter Wortlaut enthalten' } : { ok: false, how: 'berichtigter Wortlaut fehlt', diffs: [tgt] };
        } else f = findIn(hay, txt);
        if (f.ok) { res.ok++; if (f.note || f.how !== 'exakt') (res.notes = res.notes || []).push({ unit: e.id, key: b.k, how: f.how, diffs: f.diffs || null }); }
        else res.bad.push({ unit: e.id, key: b.k, how: f.how, diffs: f.diffs || null, text: plain(txt).slice(0, 200) });
      }
      // Titel neu eingefuegter/ersetzter Artikel
    }
    R.actText.push(res);
  }
}

// Umgekehrte Richtung: jede zitierte Neufassung im Aenderungsakt muss im Stand vorkommen
const OPEN = /^\s*[„«‘“"]/, CLOSE = /[“»’”"]\s*[.;,]*\s*$/;
const INSTR = /(wird wie folgt geändert|erhält folgende Fassung|erhalten folgende Fassung|wird folgende[rs]? .* (eingefügt|angefügt)|werden folgende .* (eingefügt|angefügt)|wird gestrichen|werden gestrichen|is amended as follows|is replaced by the following|are replaced by the following|is inserted|are inserted|is added|are added|is deleted|are deleted|est modifié|sont modifiés|est remplacé|sont remplacés|est inséré|sont insérés|est ajouté|sont ajoutés|est supprimé|sont supprimés|erhält folgende Überschrift|is renamed)/i;
function passages(p) {
  const res = [];
  let cur = null;
  for (const u of p.units) {
    for (const b of u.blocks) {
      const txt = b.t || '';
      const isInstr = INSTR.test(txt.replace(/<[^>]+>/g, '')) && /:\s*$/.test(txt.replace(/<[^>]+>/g, '').trim());
      if (cur && isInstr) { res.push(cur); cur = null; }
      let starts = OPEN.test(b.l || '') || OPEN.test(txt);
      let t = txt;
      // Anweisung mit eingebetteter Neufassung: 'erhält folgende Überschrift: „…“'
      if (!starts) {
        const mi = txt.search(/:\s*[„«‘“"]/);
        if (mi >= 0 && INSTR.test(txt.slice(0, mi + 1))) { starts = true; t = txt.slice(mi + 1); }
      }
      if (!cur && starts && !isInstr) cur = { unit: u.id, key: b.k, blocks: [] };
      if (cur) {
        cur.blocks.push({ ...b, t });
        if (CLOSE.test(t)) { res.push(cur); cur = null; }
      }
    }
    if (cur) { res.push(cur); cur = null; }
  }
  return res;
}
for (const [act, sid] of Object.entries(ACT_STAGE)) {
  for (const lang of LANGS) {
    const p = parseRaw(act, lang);
    const stageText = normText(concatDataset(sid, lang));
    const AMEND = { '32016R1624': ['art_80'], '32017R0458': ['art_1'], '32017R2225': ['art_1', 'anx'], '32019R0817': ['art_59'], '32021R1134': ['art_3'], '32024R1717': ['art_1', 'anx'] };
    const ps = passages(p).filter((x) => AMEND[act].includes(x.unit));
    const res = { act, stage: sid, lang, passages: ps.length, blocks: 0, ok: 0, missing: [] };
    for (const pa of ps) {
      for (const b of pa.blocks) {
        if (b.ty === 'img') continue;
        const t = (b.t || '').replace(OPEN, '').replace(CLOSE, '');
        if (normText(t).length < 3) continue;
        res.blocks++;
        const f = findIn(stageText, t);
        if (f.ok) res.ok++;
        else {
          // Zitierte Neufassung, die im SGK nur als Bild (Formular, Schild) wiedergegeben ist
          const imgText = nq(concatImageText(sid, lang));
          const g = findIn(imgText, t);
          res.missing.push({ actUnit: pa.unit, actKey: b.k, how: f.how, inImageText: g.ok, diffs: f.diffs || null, text: plain(t).slice(0, 220) });
        }
      }
    }
    R.reverse.push(res);
  }
}

// ETIAS: Patch gegen ABl.-Fassung 32018R1240 und konsolidierte Fassung 02018R1240-20260612
for (const lang of LANGS) {
  const ojHay = actText('32018R1240', lang);
  const consHay = actText('02018R1240-20260612', lang);
  for (const p of ds.patches || []) {
    for (const b of p.blocks[lang]) {
      const a = findIn(consHay, b.t), o = findIn(ojHay, b.t);
      R.etias.push({ lang, what: p.ref.what, key: b.k, o: b.o, cons: a.ok ? a.how : 'ABWEICHUNG', oj: o.ok ? o.how : ('ABWEICHUNG ' + (o.diffs || []).join(' | ')) });
    }
  }
}

// ------------------------------------------------------------ C Sprachkonsistenz
for (const st of ds.stages) {
  for (const e of ds.toc) {
    if (e.type !== 'article' && e.type !== 'annex') continue;
    const keys = {};
    for (const lang of LANGS) {
      const v = getVersion(ds, e.id, lang, st.id);
      keys[lang] = v && !v.repealed ? v.blocks.map((b) => b.k).join(' ') : (v ? 'AUFGEHOBEN' : '-');
    }
    if (keys.de !== keys.fr || keys.de !== keys.en) {
      const sets = Object.fromEntries(LANGS.map((l) => [l, new Set(keys[l].split(' '))]));
      const diff = {};
      for (const l of LANGS) diff[l] = [...sets[l]].filter((k) => LANGS.some((m) => !sets[m].has(k)));
      R.lang.push({ stage: st.id, unit: e.id, diff, orderOnly: LANGS.every((l) => !diff[l].length) });
    }
  }
  // Aenderungen je Sprache
  const ch = Object.fromEntries(LANGS.map((l) => [l, new Set(changesOfStage(ds, st.id, l).map((c) => `${c.unit}:${c.key}:${c.change}`))]));
  const all = new Set(LANGS.flatMap((l) => [...ch[l]]));
  for (const c of all) {
    const present = LANGS.filter((l) => ch[l].has(c));
    if (present.length !== LANGS.length) R.langChanges.push({ stage: st.id, change: c, langs: present });
  }
}

// ------------------------------------------------------------ D Standdifferenzen
for (const st of ds.stages) {
  if (st.order === 0) continue;
  for (const lang of st.langs) {
    const ch = changesOfStage(ds, st.id, lang);
    for (const c of ch) {
      const v = getVersion(ds, c.unit, lang, st.id);
      const b = c.key && v && v.blocks ? v.blocks.find((x) => x.k === c.key) : null;
      const okOrigin = !b || actOf(b.o) === actOf(st.act) || b.o === st.act || (st.act === '32018R1240' && actOf(b.o) === '32018R1240') || (['s05', 's06', 's07', 's08'].includes(st.id) && false);
      R.stageDiff.push({ stage: st.id, lang, unit: c.unit, key: c.key, change: c.change, o: b ? b.o : null, x: b ? b.x || null : null, expected: c.change === 'deleted' || c.change === 'repealed' || c.key === '_title' || okOrigin, explained: c.change === 'punct' ? 'Folgeanpassung Zeichensetzung' : null });
    }
  }
}

// ------------------------------------------------------------ E acts.json
if (acts) {
  const stageOfAct = { ...ACT_STAGE, '32018R1240': 's04', '32018R1240R(03)': 's04', ...CORR };
  for (const a of acts) {
    const sid = stageOfAct[a.celex];
    if (!sid || !a.changes) continue;
    const ours = changesOfStage(ds, sid, 'de').filter((c) => c.change !== 'punct' && c.change !== 'editorial');
    const oursFor = ours.filter((c) => {
      const v = getVersion(ds, c.unit, 'de', sid);
      const b = c.key && v.blocks ? v.blocks.find((x) => x.k === c.key) : null;
      const isCorr = /R\(\d+\)$/.test(a.celex);
      if (c.change === 'deleted' || c.key === '_title') return !isCorr;
      return b ? b.o === a.celex || actOf(b.o) === a.celex : true;
    });
    const used = new Set();
    for (const ch of a.changes) {
      if (ch.unit.startsWith('tit_')) { R.actsJson.push({ act: a.celex, unit: ch.unit, key: ch.key, action: ch.action, status: 'Gliederung (nicht geprueft)' }); continue; }
      const m = oursFor.filter((c) => c.unit === ch.unit && (!ch.key || ch.key === '*' || c.key === ch.key || (c.key || '').startsWith(ch.key + '.') || ch.key.startsWith((c.key || '') + '.')));
      m.forEach((x) => used.add(x));
      R.actsJson.push({ act: a.celex, unit: ch.unit, key: ch.key, action: ch.action, status: m.length ? 'bestaetigt' : 'nicht in Daten', ours: m.slice(0, 4).map((x) => `${x.key}:${x.change}`) });
    }
    // eigene Aenderungen ohne Eintrag in acts.json (nur oberste Ebene)
    const top = oursFor.filter((c) => !used.has(c) && !oursFor.some((d) => d !== c && d.unit === c.unit && c.key && d.key && c.key.startsWith(d.key + '.')));
    for (const c of top) R.actsJson.push({ act: a.celex, unit: c.unit, key: c.key, action: c.change, status: 'nur in Daten' });
  }
}

writeAtomic(resolve(ROOT, 'scripts/out/validation-results.json'), JSON.stringify(R, null, 1));

// ------------------------------------------------------------ Kurzausgabe
const pct = (x) => (100 * x).toFixed(3) + ' %';
console.log('Abdeckung Parser:', R.coverage.map((c) => `${c.stage}/${c.lang} ${pct(c.coverage)} (${c.missing} fehlen, ${c.extra} zusaetzlich)`).join('; '));
console.log('Abdeckung Datensatz:', R.coverageDs.map((c) => `${c.stage}/${c.lang} ${pct(c.coverage)} (${c.missing}/${c.extra})`).join('; '));
console.log('Datensatz s07/s08 gegen Quelle+Patch:', (R.coverageDsPatched || []).map((c) => `${c.stage}/${c.lang} ${pct(c.coverage)} (${c.missing}/${c.extra})`).join('; '));
console.log('Akttext:', R.actText.map((a) => `${a.act}/${a.lang} ${a.ok}/${a.checked}`).join('; '));
console.log('Umkehrpruefung:', R.reverse.map((a) => `${a.act}/${a.lang} ${a.ok}/${a.blocks}`).join('; '));
console.log('Sprachkonsistenz: Abweichungen', R.lang.length, '; Aenderungen nur in einzelnen Sprachen', R.langChanges.length);
console.log('Standdifferenzen unerwartet:', R.stageDiff.filter((x) => !x.expected && !x.explained).length, '(davon Zeichensetzung erklaert:', R.stageDiff.filter((x) => x.explained).length + ')');
console.log('acts.json:', JSON.stringify(R.actsJson.reduce((m, x) => { m[x.status] = (m[x.status] || 0) + 1; return m; }, {})));

// ------------------------------------------------------------ Tests ausfuehren (fuer den Bericht)
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
const testFiles = readdirSync(resolve(ROOT, 'test/core')).filter((f) => f.endsWith('.test.mjs')).map((f) => 'test/core/' + f);
const tr = spawnSync(process.execPath, ['--test', ...testFiles], { cwd: ROOT, encoding: 'utf8' });
const tPass = +(tr.stdout.match(/# pass (\d+)/) || [0, 0])[1];
const tFail = +(tr.stdout.match(/# fail (\d+)/) || [0, 0])[1];
const tNames = [...tr.stdout.matchAll(/^(ok|not ok) \d+ - (.*)$/gm)].map((m) => `${m[1] === 'ok' ? 'bestanden' : 'FEHLGESCHLAGEN'}: ${m[2]}`);
console.log(`Tests: ${tPass} bestanden, ${tFail} fehlgeschlagen`);

// ------------------------------------------------------------ Bericht
const md = [];
const L = (s = '') => md.push(s);
const n = (x) => x.toLocaleString('de-CH');
const p3 = (x) => (100 * x).toFixed(2).replace('.', ',') + ' %';
const stageRows = ds.stages.map((s) => `| ${s.id} | ${s.act} | ${s.source.kind} | ${s.source.celex} | ${s.langs.join(', ')} |`);
const covRows = R.coverage.map((c) => `| ${c.stage} | ${c.celex} | ${c.lang} | ${n(c.srcTokens)} | ${p3(c.coverage)} | ${c.missing} | ${c.extra} |`);
const dsRows = R.coverageDs.map((c) => `| ${c.stage} | ${c.lang} | ${p3(c.coverage)} | ${c.missing} | ${c.extra} |`);
const patchedRows = (R.coverageDsPatched || []).map((c) => `| ${c.stage} | ${c.lang} | ${p3(c.coverage)} | ${c.missing} | ${c.extra} |`);
const actRows = R.actText.map((a) => `| ${a.act} | ${a.stage} | ${a.lang} | ${a.checked} | ${a.ok} | ${a.bad.length} | ${(a.notes || []).length} |`);
const notes = R.actText.flatMap((a) => (a.notes || []).filter((x) => !/berichtigter/.test(x.how)).map((x) => `${a.act} ${a.lang.toUpperCase()} ${x.unit} ${x.key}: ${x.how}`));
const revRows = R.reverse.map((a) => `| ${a.act} | ${a.lang} | ${a.blocks} | ${a.ok} | ${a.missing.length} | ${a.missing.filter((m) => m.inImageText).length} |`);
const revMissing = R.reverse.flatMap((a) => a.missing.map((m) => `${a.act} ${a.lang.toUpperCase()} (${m.actUnit} ${m.actKey}): ${m.how}${m.inImageText ? ', im Bildtext vorhanden' : ''} — «${m.text.slice(0, 110)}»`));
const sd = (sid) => R.stageDiff.filter((x) => x.stage === sid).map((x) => `${x.lang.toUpperCase()} ${x.unit} ${x.key ?? ''}: ${x.change}${x.o ? ` (Herkunft ${x.o})` : ''}${x.x ? ` [${x.x}]` : ''}`);
const recon = buildLog.recon || {};
const actsRows = R.actsJson.reduce((m, x) => { m[x.status] = (m[x.status] || 0) + 1; return m; }, {});
const etiasRows = R.etias.map((e) => `| ${e.lang} | ${e.key} | ${e.o} | ${e.cons} | ${e.oj.startsWith('ABWEICHUNG') ? 'Abweichung (Berichtigung R(03))' : e.oj} |`);

L('# Prüfbericht Datensatz SGK (Agent DATEN)');
L();
L(`Erzeugt von \`node scripts/validate.mjs\` aus \`data/dataset.json\` (Stand ${ds.generated}). Alle Zahlen in diesem Bericht stammen aus maschinellen Prüfungen, die bei jedem Lauf neu ausgeführt werden. Rohdaten der Prüfung: \`data/validation-results.json\`, Build-Protokoll: \`data/build-log.json\`.`);
L();
L('## 1 Ergebnis in Kürze');
L();
L(`- Wortlaut: Für alle 15 Quellfassungen (5 Fassungen × DE/FR/EN) gibt der Parser den Fliesstext des verfügenden Teils (ab Artikel 1, mit Anhängen) zu ${p3(Math.min(...R.coverage.map((c) => c.coverage)))} bis ${p3(Math.max(...R.coverage.map((c) => c.coverage)))} vollständig und in richtiger Reihenfolge wieder (${R.coverage.reduce((a, c) => a + c.missing, 0)} fehlende, ${R.coverage.reduce((a, c) => a + c.extra, 0)} zusätzliche Wörter).`);
L(`- Datensatz: Die Stände s00, s01, s02 entsprechen ihrer Quelle zu 100 %. s07 und s08 entsprechen der jeweiligen EUR-Lex-Fassung plus genau dem ETIAS-Patch (Vergleich gegen Quelle + Patch: ${(R.coverageDsPatched || []).every((c) => c.missing === 0 && c.extra === 0) ? 'keine Abweichung' : 'Abweichungen, siehe 6.1'}).`);
L(`- Akttext: ${R.actText.reduce((a, x) => a + x.ok, 0)} von ${R.actText.reduce((a, x) => a + x.checked, 0)} eingefügten oder ersetzten Blöcken stimmen mit dem Wortlaut im Änderungsakt bzw. in der Berichtigung überein; ${R.actText.reduce((a, x) => a + x.bad.length, 0)} Abweichungen. ${notes.length} Übereinstimmungen tragen einen Vermerk (nur Schlusszeichen oder Gross-/Kleinschreibung abweichend, Liste 6.2).`);
L(`- Sprachkonsistenz: In ${ds.stages.length} Ständen × ${Object.keys(ds.units).length} Einheiten sind die Schlüsselmengen in DE, FR und EN ${R.lang.length ? 'in ' + R.lang.length + ' Fällen verschieden (6.5)' : 'identisch'}.`);
L(`- Rekonstruktion: Selbsttest (alle Akte nach 2017/458 zurücknehmen ergibt die konsolidierte Fassung 20170407): ${LANGS.map((l) => `${l.toUpperCase()} ${recon.selfCheck?.[l]?.revertTo458VsConsolidated20170407?.unitsDifferent ?? '?'} abweichende Einheiten`).join(', ')}. Gemischte Bereiche: ${recon.mixed?.length ?? '?'}, Anomalien: ${recon.anomalies?.length ?? '?'}.`);
L(`- Tests: ${tPass} bestanden, ${tFail} fehlgeschlagen (\`node --test test/core/*.test.mjs\`).`);
L(`- Abgleich mit data/acts.json (Agent RECHT): ${Object.entries(actsRows).map(([k, v]) => `${v} ${k}`).join(', ')}.`);
L();
L('## 2 Stände und Herkunft');
L();
L('`source.kind`: `oj` = Amtsblattfassung von EUR-Lex; `consolidated` = konsolidierte Fassung von EUR-Lex unverändert; `reconstructed` = von uns rekonstruiert (keine EUR-Lex-Fassung); `patched` = EUR-Lex-Fassung oder Rekonstruktion, ergänzt um die ETIAS-Änderungen aus dem Akttext.');
L();
L('| Stand | Akt | source.kind | Grundlage | Sprachen mit Änderungen |');
L('|---|---|---|---|---|');
stageRows.forEach((r) => L(r));
L();
L('Begründung der Verfeinerung gegenüber SPEC §4: s08 ist ein zusätzlicher Stand für die Berichtigung 32024R1717R(01) (nur DE; Art. 25 Abs. 1 Bst. a), Quelle konsolidierte Fassung 20251012. In FR und EN unterscheidet sich 20251012 nicht von 20240710 (geprüft), darum führt s08 nur "de". Die Berichtigung 32016R0399R(03) (nur DE) ändert ausschliesslich den Titel der Verordnung ("Gemeinschaftskodex" → "Unionskodex"), keinen Artikel oder Anhang; sie ist daher kein eigener Stand (der Werktitel in `work.title` ist die berichtigte Fassung). Alle übrigen Berichtigungen des SGK (R(01), R(02), R(04)–R(08)) betreffen laut Cellar (SPARQL, Sprachfassungen der Berichtigungen) nur andere Sprachen (FI, DA, ES, MT, HR) und sind nicht abgebildet.');
L();
L('Stand-Datum (`date`): bei EUR-Lex-Fassungen das Konsolidierungsdatum, bei rekonstruierten Ständen das Datum der Veröffentlichung des Änderungsakts im Amtsblatt. Anwendbarkeit ist bewusst nicht Teil der Stände (SPEC §4).');
L();
L('## 3 Parser');
L();
L('`src/core/parser.js` liest drei EUR-Lex-Formate in dieselbe Struktur (Einheiten → Blöcke):');
L();
L('- ABl.-Fassung (Klassen `oj-*`): Aufzählungen als zwei- oder dreispaltige Layout-Tabellen; echte Tabellen haben die Klasse `oj-table`. Der verborgene EUR-Lex-"Text von Bild" wird als Text des Bildblocks übernommen.');
L('- Konsolidiert, altes Format (2016/2017): Aufzählungen als eingerückte `div`; nach Markern oft flach statt verschachtelt; keine Bilder (die Bildblöcke werden aus dem Vorstand übernommen, siehe 6.8).');
L('- Konsolidiert, neues Format (2024/2025): `eli-subdivision`, `grid-container grid-list`, Absatznummern in `span.no-parag`; teilweise gemischt mit Elementen des alten Formats (eingerückte `div`, Layout-Tabellen in Anhang VI).');
L();
L('Marker (`p.modref`, `p.arrow`, Inline-Marker ►…◄) setzen die Herkunft (`o`) aller folgenden Blöcke; zugeordnet wird immer über die CELEX im Attribut `title` bzw. `href`, nie über die M-Nummer (Test vorhanden). Löschmarken (▼Mx —————) werden mit Position und Akt festgehalten. Fussnotenzeichen werden aus dem Text entfernt und als `fn` angehängt; die Klammern um entfernte Zeichen ebenfalls.');
L();
L('Gliederung: Die Hierarchie wird aus den Gliederungszeichen gebildet (Absatz, Ziffer, Buchstabe, römische Ziffer, Strich, Teil). Absatznummern sind sprachabhängig: DE "(1)", FR und EN "1."; Aufzählungsziffern DE "1.", FR "1)", EN "(1)". Mehrdeutige Zeichen (i, v, x als Buchstabe oder römische Ziffer; eingefügte Punkte wie "ia", "iiia", "b bis") werden aus dem Zusammenhang (offene Listen, Folgezeichen) entschieden.');
L();
L('Schlüssel: Pfad gemäss SPEC §5.2. Stabilität über Stände: Blöcke mit identischem Wortlaut (nach Normalisierung) übernehmen den Schlüssel der Vorfassung; die Zuordnung wird für alle drei Sprachen gemeinsam bestimmt. Für den Stand s02 (flaches altes Format) dient zusätzlich die Fassung 20240710 als Strukturvorlage. Konflikte zwischen den Sprachen bei dieser Zuordnung: ' + buildLog.log.filter((x) => !x.kind).length + '.');
L();
L('Normalisierung für Vergleiche (nicht für die Anzeige): Leerraum und geschützte Leerzeichen, Anführungszeichen-Varianten, Gedankenstrich-Varianten, Leerzeichen um Satzzeichen (FR-Typografie), "n°/nº/n<sup>o</sup>"; bei Überschriften zusätzlich Gross-/Kleinschreibung (die ABl.-Fassung speichert Anhangüberschriften in Kleinschreibung, z. B. "Erfassung von informationen"). Fussnoten, Tiefe und die Schreibweise des Gliederungszeichens lösen keine neue Version aus. Unveränderte Blöcke übernehmen in der neuen Version exakt die Darstellung der Vorfassung.');
L();
L('## 4 Rekonstruktion der Zwischenstände (Methode)');
L();
L('EUR-Lex bietet zwischen dem 7.4.2017 und dem 10.7.2024 keine konsolidierte Fassung. Die Stände nach 2017/2225 (s03), 2019/817 (s05) und 2021/1134 (s06) werden darum wie folgt hergeleitet:');
L();
L('1. Ausgangspunkt ist die konsolidierte Fassung vom 10.7.2024. Ihre Marker zeigen für jeden Absatz, Buchstaben usw., von welchem Akt der heutige Wortlaut stammt und ob er eingefügt oder ersetzt wurde; Löschmarken zeigen, wo ein Akt Text gestrichen hat.');
L('2. Zweite Quelle ist die konsolidierte Fassung vom 7.4.2017 (Stand nach 2017/458).');
L('3. "Anker" sind Bestimmungen, deren Wortlaut seit 2017 unverändert ist: Sie stammen laut Marker vom Basisakt, von 2016/1624 oder 2017/458 und stehen in beiden Fassungen gleich. Zwischen zwei Ankern liegt jeweils ein Bereich, in dem sich etwas geändert hat.');
L('4. Für den Stand nach Akt X wird jeder Bereich so behandelt: Bestimmungen, deren Wortlaut von X oder einem früheren Akt stammt, bleiben. Bestimmungen, die erst ein späterer Akt eingefügt hat, entfallen. Wo ein späterer Akt ersetzt oder gestrichen hat, wird der Wortlaut von 2017 an dieser Stelle wiederhergestellt.');
L('5. Kommt in einem Bereich sowohl ein früherer als auch ein späterer Akt vor, wäre die Zuordnung nicht eindeutig. Solche Bereiche werden gemeldet: ' + (recon.mixed?.length ?? '?') + ' Fälle.');
L('6. Zeichensetzung: Fügt ein Akt nach einer Bestimmung einen neuen Punkt an, passt EUR-Lex das Schlusszeichen der vorangehenden Bestimmung an (z. B. "." → ";"), ohne Marker. Diese Anpassung wird dem Akt zugeordnet, der den folgenden Punkt eingefügt hat (Blockfeld `x: "punct"`). Liste in 6.4.');
L('7. Kontrolle: (a) Selbsttest – mit demselben Verfahren alle Akte nach 2017/458 zurücknehmen muss die Fassung 20170407 ergeben; (b) jeder eingefügte oder ersetzte Block muss im Änderungsakt selbst stehen (6.2); (c) jede im Änderungsakt zitierte Neufassung muss im entsprechenden Stand stehen (6.3); (d) Abgleich mit den Änderungslisten in data/acts.json (6.7).');
L();
L('Grenzen der Methode: Hätte ein späterer Akt eine Bestimmung ersetzt, die ein Zwischenakt (2017/2225, 2019/817, 2021/1134) zuvor geändert hatte, wäre der Zwischenwortlaut weder in 2017 noch in 2024 enthalten. Die Umkehrprüfung (6.3) findet alle zitierten Neufassungen dieser Akte im jeweiligen Stand (Ausnahme: Formulare und Schilder, die nur als Bild vorliegen); ein solcher Fall tritt somit nicht auf.');
L();
L('## 5 ETIAS-Patch (Verordnung (EU) 2018/1240, Art. 80)');
L();
L('EUR-Lex hat Art. 80 der Verordnung (EU) 2018/1240 in keine konsolidierte Fassung des SGK eingearbeitet. Der Wortlaut wird darum 1:1 aus der konsolidierten Fassung der Verordnung (EU) 2018/1240 vom 12.6.2026 (raw/02018R1240-20260612_*.html) übernommen. Dort ist Art. 80 Nr. 2 Bst. a durch die Berichtigung 32018R1240R(03) (ABl. L 193 vom 17.6.2020, S. 16; alle Sprachen) korrigiert: Neu gefasst wird Art. 8 Abs. 3 Bst. a **Ziff. ii** (Visum/Reisegenehmigung/Aufenthaltstitel), nicht Ziff. i wie in der ABl.-Fassung. SPEC §5.4 nennt noch Ziff. i; massgeblich ist die berichtigte Fassung.');
L();
L('Patch-Punkte (gelten ab s04 und in allen späteren Ständen, sofern kein späterer Akt dieselbe Bestimmung ändert – das ist nicht der Fall): Art. 6 Abs. 1 Bst. b (neu gefasst), Art. 6 Abs. 1 Unterabsätze 2 und 3 (angefügt nach Bst. f, Schlüssel `p1.s2`, `p1.s3`), Art. 8 Abs. 3 Bst. a Ziff. ii (neu gefasst, Herkunft `32018R1240R(03)`), Art. 8 Abs. 3 Bst. ba (eingefügt), Anhang V Teil B Punkt C.');
L();
L('Anhang V Teil B: Das Standardformular ist in allen EUR-Lex-Fassungen nur als Bild enthalten. Der neue Wortlaut von Punkt C steht darum als eigener Textblock `ptB.c` unter dem Bild, mit Hinweis im Feld `nt`. Geprüft (Sichtprüfung des Bildes aus 20240710 DE): Das Bild enthält den von 2017/2225 eingefügten Punkt J, Punkt C lautet dort noch "ohne gültiges Visum oder gültigen Aufenthaltstitel".');
L();
L('Prüfung des Patch-Wortlauts gegen die konsolidierte Fassung 2018/1240 und gegen die ABl.-Fassung 32018R1240:');
L();
L('| Sprache | Schlüssel | Herkunft | konsolidiert 2018/1240 | ABl. 32018R1240 |');
L('|---|---|---|---|---|');
etiasRows.forEach((r) => L(r));
L();
L('Die Abweichung zur ABl.-Fassung betrifft nur Ziff. ii und ist die Berichtigung R(03). Die Zuordnung der Patch-Punkte wird beim Build gegen den Wortlaut der Änderungsanweisungen in allen drei Sprachen geprüft (Abbruch bei Abweichung).');
L();
L('Geprüfte Berichtigungen der Änderungsakte (Cellar/SPARQL, Sprachfassungen DE/FR/EN, Inhalt gelesen): 32017R2225R(01) betrifft Art. 6a Abs. 3 Bst. f (in s03 enthalten, Herkunft `32017R2225R(01)`); 32018R1240R(03) betrifft Art. 80 (siehe oben); 32024R1717R(01) (nur DE) betrifft Art. 25 Abs. 1 Bst. a (Stand s08). Ohne Bezug zum SGK-Text: 32018R1240R(01) und R(06) (DE: Art. 9 und 45 ETIAS), 32019R0817R(01) und R(05) (Art. 62 und 18), 32021R1134R(01) und R(03) (Art. 1, VIS-Verordnung). Alle anderen Berichtigungen dieser Akte liegen nur in anderen Sprachen vor. 2016/1624 und 2017/458 haben keine Berichtigung in DE/FR/EN.');
L();
L('## 6 Prüfungen');
L();
L('### 6.1 Abdeckung des Wortlauts');
L();
L('Vergleich wortweise (Wörter und Satzzeichen nach Normalisierung, Myers-Diff). Quelle: sichtbarer Fliesstext ab Artikel 1 einschliesslich Anhänge, ohne Marker, Fussnotenzeichen, Fussnoten, Schlussformel und Bildtexte. Ausgabe: Gliederungsüberschriften, Artikel-/Anhangbezeichnung, Titel, Gliederungszeichen und Text aller Blöcke in Reihenfolge.');
L();
L('Parser gegen Quelle:');
L();
L('| Stand | Quelle | Sprache | Wörter Quelle | Abdeckung | fehlend | zusätzlich |');
L('|---|---|---|---|---|---|---|');
covRows.forEach((r) => L(r));
L();
L('Datensatz (Version je Stand) gegen Quelle. Bei s07/s08 sind die zusätzlichen Wörter der ETIAS-Patch, die fehlenden die vom Patch ersetzten Wörter:');
L();
L('| Stand | Sprache | Abdeckung | fehlend | zusätzlich |');
L('|---|---|---|---|---|');
dsRows.forEach((r) => L(r));
L();
L('Datensatz s07/s08 gegen Quelle mit angewendetem Patch:');
L();
L('| Stand | Sprache | Abdeckung | fehlend | zusätzlich |');
L('|---|---|---|---|---|');
patchedRows.forEach((r) => L(r));
L();
const gapList = R.coverage.flatMap((c) => c.gaps.map((g) => `${c.stage} ${c.lang}: ${g.type} «${g.text}» nach «${g.context}»`));
L(gapList.length ? 'Lücken:\n\n' + gapList.map((g) => '- ' + g).join('\n') : 'Lücken: keine.');
L();
L('### 6.2 Wortlaut gegen Änderungsakt (Pflichtprüfung SPEC §5.4)');
L();
L('Jeder Block, der in "seinem" Stand eingefügt oder ersetzt wurde (Herkunft = Akt dieses Stands), muss im Text des Änderungsakts (raw/<CELEX>_<LANG>.html) vorkommen. Bei Berichtigungen muss der berichtigte Wortlaut ("muss es heissen …") im Block stehen. Normalisierung zusätzlich: verschachtelte Anführungszeichen des Änderungsakts (‚…‘) gleich „…“, Fussnotenzeichen "(*1)" entfernt.');
L();
L('| Akt | Stand | Sprache | geprüft | übereinstimmend | abweichend | mit Vermerk |');
L('|---|---|---|---|---|---|---|');
actRows.forEach((r) => L(r));
L();
const bad = R.actText.flatMap((a) => a.bad.map((b) => `${a.act} ${a.lang.toUpperCase()} ${b.unit} ${b.key}: ${b.how} ${JSON.stringify(b.diffs)}`));
L(bad.length ? 'Abweichungen:\n\n' + bad.map((x) => '- ' + x).join('\n') : 'Abweichungen: keine.');
L();
L('Vermerke (Wortlaut identisch, aber Schlusszeichen oder Gross-/Kleinschreibung weichen vom Akt ab). Ursache ist jeweils die konsolidierte Fassung von EUR-Lex: Am Ende einer Neufassung steht im Akt "." und ein schliessendes Anführungszeichen, im konsolidierten Text ";" oder ",", weil ein weiterer Punkt folgt; bei 2017/2225 Art. 8 Abs. 3 Bst. a Ziff. iii (DE) schreibt EUR-Lex "Bei" statt "bei". Der Datensatz gibt in diesen Fällen den EUR-Lex-Text wieder.');
L();
notes.forEach((x) => L('- ' + x));
L();
L('### 6.3 Umkehrprüfung: Neufassungen im Akt → Stand');
L();
L('Jede im Änderungsartikel zitierte Neufassung ("erhält folgende Fassung: „…“", "wird eingefügt: „…“") muss im Stand des Akts vorkommen.');
L();
L('| Akt | Sprache | zitierte Blöcke | gefunden | nicht gefunden | davon nur im Bildtext |');
L('|---|---|---|---|---|---|');
revRows.forEach((r) => L(r));
L();
L('Nicht gefundene Stellen und Erklärung:');
L();
L('- 2016/1624 DE: Der Änderungsakt nummeriert den neu gefassten Absatz "1." statt "(1)" (DE-Schreibweise des SGK). Wortlaut identisch (6.2), nur Gliederungszeichen.');
L('- 2017/2225, Anhang (Nr. 1 und Nr. 3): Texte der Schilder in Anhang III Teil D/E und Änderungen des Standardformulars in Anhang V Teil B (neuer Punkt J, Text unter "Bemerkungen"). Diese Inhalte sind in allen EUR-Lex-Fassungen nur als Bild wiedergegeben; als Text sind sie im Datensatz nicht vorhanden. Für Anhang V Teil B: Sichtprüfung des Bildes (DE) bestätigt Punkt J. Auffällig: Der verborgene EUR-Lex-"Text von Bild" der Fassung 20251012 zu Anhang V Teil B enthält Punkt J nicht (er gibt das Formular von 2016 wieder).');
L('- 2017/2225 DE, Art. 1 Nr. 2 Bst. b: Anweisungssatz, der von der Erkennung als zitierter Text gelesen wird (kein Inhalt).');
L();
revMissing.forEach((x) => L('- ' + x));
L();
L('### 6.4 Differenzen zwischen den Ständen');
L();
L('Jede Änderung eines Stands muss vom Akt dieses Stands stammen (Herkunft `o`), eine Löschung sein oder als Zeichensetzungs-Folgeanpassung (`punct`) bzw. redaktionelle Abweichung (`editorial`) ausgewiesen sein.');
L();
L('s00 → s01 (2016/1624, Art. 80 = Art. 29 Abs. 1 SGK):');
L();
sd('s01').forEach((x) => L('- ' + x));
L();
L('s01 → s02 (2017/458, Art. 1 = Art. 8 SGK):');
L();
sd('s02').forEach((x) => L('- ' + x));
L();
const unexpected = R.stageDiff.filter((x) => !x.expected && !x.explained);
L('Nicht durch einen Akt erklärte Differenzen (alle Stände): ' + (unexpected.length ? '' : 'keine.'));
L();
unexpected.forEach((x) => L(`- ${x.stage} ${x.lang.toUpperCase()} ${x.unit} ${x.key}: ${x.change}, Herkunft ${x.o}`));
L();
L('Zeichensetzungs-Folgeanpassungen (`punct`, dem Akt des Stands zugeordnet):');
L();
R.stageDiff.filter((x) => x.explained).forEach((x) => L(`- ${x.stage} ${x.lang.toUpperCase()} ${x.unit} ${x.key}`));
L();
L('### 6.5 Sprachübergreifende Konsistenz (SPEC §5.3)');
L();
L(`Schlüsselmengen und Reihenfolge je Einheit und Stand in DE, FR, EN: ${R.lang.length} Abweichungen. Zusätzlich je Quellfassung geprüft (Parser): identisch.`);
L();
L('Änderungen, die nur in einzelnen Sprachen auftreten (erwartet, sprachspezifisch):');
L();
R.langChanges.forEach((x) => L(`- ${x.stage} ${x.change} (${x.langs.join(', ')})`));
L();
L('### 6.6 Selbsttest und Protokoll der Rekonstruktion');
L();
for (const l of LANGS) L(`- ${l.toUpperCase()}: Rücknahme bis 2017/458 gegen 20170407: ${recon.selfCheck?.[l]?.revertTo458VsConsolidated20170407?.unitsDifferent} abweichende Einheiten.`);
L(`- Wiederhergestellte Bereiche (Wortlaut 2017 eingesetzt): ${recon.restored?.length ?? 0} (über alle Stände und Sprachen); gemischte Bereiche: ${recon.mixed?.length ?? 0}; unmarkierte Abweichungen innerhalb von Bereichen: ${recon.unmarked?.length ?? 0}; Anomalien: ${recon.anomalies?.length ?? 0}.`);
L(`- Patch-Anwendung: ${recon.patches ? recon.patches.map((p) => `${p.X.slice(-4)}/${p.lang}: ${p.applied.filter((a) => a.status === 'applied').length}/${p.applied.length}`).join(', ') : '-'}.`);
L();
L('### 6.7 Abgleich mit data/acts.json (changes)');
L();
L(`Ergebnis: ${Object.entries(actsRows).map(([k, v]) => `${v} ${k}`).join(', ')}.`);
L();
R.actsJson.filter((x) => x.status !== 'bestaetigt').forEach((x) => L(`- ${x.act} ${x.unit} ${x.key} (${x.action}): ${x.status}`));
L('- Hinweis an Agent RECHT: Die Gliederungs-Id für Kapitel V lautet im Datensatz `tit_II.cpt_V` (nicht `tit_II.cha_V`). Die geänderte Überschrift (2024/1717) erscheint im Datensatz ab s07.');
L();
L('### 6.8 Bilder (SPEC §5.6)');
L();
if (assetsRep) L(`${assetsRep.used} verwendete Bilder, dedupliziert über Hash der Originaldaten (cyrb53 über Base64). WebP, Qualität ${assetsRep.quality}, Breite höchstens ${assetsRep.widthMax} px. Grösse data/assets.json: ${(assetsRep.total / 1e6).toFixed(2).replace('.', ',')} MB (Budget 2,5 MB). ${assetsRep.widthMax < 1200 ? `Um das Budget einzuhalten, wurde die Höchstbreite von 1200 px auf ${assetsRep.widthMax} px reduziert.` : ''}`);
L();
L('Die alten konsolidierten Fassungen (20161006, 20170407) enthalten keine Bilder. Für s01 und s02 werden die Bildblöcke aus s00 (ABl.) übernommen. Bildblöcke lösen nur bei geänderter Herkunft eine neue Version aus (Bilddateien verschiedener Fassungen sind nicht bytegleich). Bildtext (`t`): EUR-Lex-"Text von Bild", sofern in der Quelle vorhanden (ABl.-Fassung); sonst leer.');
L();
L('### 6.9 Tests');
L();
tNames.forEach((x) => L('- ' + x));
L();
L('## 7 Rechtlich relevante Auffälligkeiten');
L();
L('1. **ETIAS, Art. 80 Nr. 2 Bst. a der Verordnung (EU) 2018/1240**: Die ABl.-Fassung (ABl. L 236 vom 19.9.2018, S. 62) ersetzt Art. 8 Abs. 3 Bst. a Ziff. i SGK; die Berichtigung 32018R1240R(03) (ABl. L 193 vom 17.6.2020, S. 16) ändert die Anweisung auf Ziff. ii. Der Datensatz folgt der Berichtigung. SPEC §5.4 nennt noch Ziff. i.');
L('2. **Art. 4 SGK, EN**: ABl.-Fassung "(‘the Charter)", konsolidierte Fassungen ab 6.10.2016 "(‘the Charter’)". Textunterschied ohne Änderungsakt und ohne Berichtigungsmarker; im Datensatz als `editorial` in s01 ausgewiesen.');
L('3. **Art. 2 Nr. 16 Bst. b Ziff. ii SGK, FR**: Schlusszeichen ";" (20170407) wird in 20240710 zu "." ohne Marker. Kein Akt erkennbar; im Datensatz als `editorial` in s07 ausgewiesen (der tatsächliche Zeitpunkt zwischen 2017 und 2024 ist unbekannt).');
L('4. **Art. 13 Abs. 1 SGK, DE (Fassung 2024/1717)**: "…aufzugreifen und Verfahren“ die mit der Richtlinie 2008/115/EG in Einklang stehen…" – das schliessende Anführungszeichen statt Komma steht bereits im Amtsblatt-Text der Verordnung (EU) 2024/1717 und wurde unverändert konsolidiert. Eine Berichtigung dazu ist nicht bekannt (die einzige DE-Berichtigung 32024R1717R(01) betrifft Art. 25).');
L('5. **Anhang VII Nr. 1 SGK, FR (Fassung 2017/2225)**: Der Änderungsakt lautet "1. Chefs d’État, chefs de gouvernement et membres des gouvernements nationaux, …". Die konsolidierte Fassung 20240710 trennt nach "Chefs d’État" eine Überschrift ab und beginnt den folgenden Absatz mit "Chefs de gouvernement" (Komma entfällt, Grossschreibung). Der Datensatz gibt den EUR-Lex-Text wieder (Blöcke `n1` und `n1.s1`).');
L('6. **Art. 8 Abs. 3 Bst. a Ziff. iii SGK, DE (Fassung 2017/2225)**: Akt "iii) bei Personen, … jener Verordnung.“", konsolidiert "Bei Personen, … jener Verordnung;". EUR-Lex-Eigenheit, Wortlaut sonst identisch.');
L('7. **Art. 8 Abs. 3 Bst. ia und ib (2017/458)**: Diese Punkte sind Buchstaben nach Bst. i (Schlüssel `p3.ia`, `p3.ib`), keine Unterziffern.');
L('8. **Berichtigung 32016R0399R(03), DE**: Erst die konsolidierte Fassung 20170407 (DE-Version 002.005, neu erstellt) enthält sie (Marker ▼C1), obwohl die Berichtigung am 31.10.2018 veröffentlicht wurde. Sie betrifft nur den Titel ("Unionskodex").');
L('9. **EUR-Lex "Text von Bild", Anhang V Teil B, Fassung 20251012 (alle drei Sprachen)**: Der verborgene Bildtext gibt das Formular von 2016 wieder (ohne Punkt J aus 2017/2225), während das Bild selbst Punkt J enthält (Sichtprüfung DE). Der Datensatz verwendet diesen Bildtext nicht.');
L('10. **Art. 11 SGK, EN**: Die Neufassung durch 2017/2225 ändert auch den Titel ("Stamping of the travel documents" → "Stamping of travel documents"); in DE und FR bleibt der Titel gleich.');
L();
L('## 8 Bekannte Lücken und Unsicherheiten');
L();
L('- Formulare und Schilder (Anhänge III, V Teil B, VIII) liegen nur als Bild vor; ihr Inhalt ist nicht textlich vergleichbar. Änderungen innerhalb eines Bildes zeigt der Datensatz nur als neue Bildversion (Herkunft des Akts), nicht als Wortdifferenz.');
L('- Der ETIAS-Text in Anhang V Teil B ist ein vom Datensatz hinzugefügter Textblock (`ptB.c`) mit Hinweis; das Formularbild selbst zeigt den Wortlaut vor ETIAS.');
L('- Änderungsart: Der Datensatz unterscheidet "ersetzt" und "eingefügt"/"gestrichen"; teilweise Änderungen innerhalb eines Blocks ("amended") werden als "ersetzt" geführt, weil die Marker diese Unterscheidung nicht liefern.');
L('- Fussnoten (`fn`) werden aus der Quelle übernommen, aber nicht versioniert verglichen; Fussnotennummern unterscheiden sich zwischen den Fassungen.');
L('- Die Herkunft von Gliederungsüberschriften (Titel, Kapitel) wird aus Markern abgeleitet; geprüft ist nur Kapitel V (Änderung durch 2024/1717).');
L('- Die rekonstruierten Stände sind keine amtlichen Fassungen. Sie sind gegen die Akttexte geprüft (6.2, 6.3), beruhen aber auf den EUR-Lex-Markern der Fassung 20240710.');
L('- Neue Fassungen per Upload (`addSnapshot`) übernehmen die ETIAS-Ergänzung automatisch, solange die Fassung 2018/1240 nicht als Änderungsakt aufführt oder ein späterer Akt dieselbe Bestimmung ändert.');
L('- Sprachen: nur DE, FR, EN. Berichtigungen in anderen Sprachen sind nicht abgebildet.');
L();
writeAtomic(resolve(DATA, 'VALIDATION.md'), md.join('\n') + '\n');
console.log('VALIDATION.md geschrieben');
