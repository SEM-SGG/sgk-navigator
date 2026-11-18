#!/usr/bin/env node
// SGK-Navigator — erzeugt data/dataset.json (und data/assets.json) aus den EUR-Lex-Dateien in raw/.
// Aufruf: node scripts/build-data.mjs [--snapshots-only] [--no-assets] [--recitals] [--without=02016R0399-20251012]
// raw/ wird nur gelesen und geparst, nie ausgefuehrt.

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMParser } from './lib-dom.mjs';
import { parseEurLex } from '../src/core/parser.js';
import { buildDataset, addSnapshot, applyPatches, actRanker } from '../src/core/model.js';
import { reconstructStages } from './reconstruct.mjs';
import { buildEtiasPatch } from './etias.mjs';
import { recitalsUnit, withRecitals } from './lib-works.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '..');
export const RAW = resolve(ROOT, 'raw');
export const DATA = resolve(ROOT, 'data');
export const LANGS = ['de', 'fr', 'en'];

const args = new Set(process.argv.slice(2));
const argVal = (name) => { const a = process.argv.slice(2).find((x) => x.startsWith(`--${name}=`)); return a ? a.split('=')[1] : null; };

const cache = new Map();
export function rawPath(celex, lang) { return resolve(RAW, `${celex}_${lang.toUpperCase()}.html`); }
export function readRaw(celex, lang) { return readFileSync(rawPath(celex, lang), 'utf8'); }
export function parseRaw(celex, lang) {
  const k = celex + '_' + lang;
  if (!cache.has(k)) {
    const p = parseEurLex(readRaw(celex, lang), { DOMParser });
    if (p.lang !== lang) throw new Error(`${celex}: Sprache ${p.lang} statt ${lang}`);
    cache.set(k, p);
  }
  return cache.get(k);
}

export function writeAtomic(file, content) {
  const tmp = file + '.tmp-' + process.pid;
  writeFileSync(tmp, content);
  renameSync(tmp, file);
}

// Amtliche Volltitel (geprueft gegen den Titel der juengsten konsolidierten Fassung, s. checkTitle)
export const WORK = {
  id: 'sgk', celex: '32016R0399', eli: 'http://data.europa.eu/eli/reg/2016/399',
  title: {
    de: 'Verordnung (EU) 2016/399 des Europäischen Parlaments und des Rates vom 9. März 2016 über einen Unionskodex für das Überschreiten der Grenzen durch Personen (Schengener Grenzkodex)',
    fr: 'Règlement (UE) 2016/399 du Parlement européen et du Conseil du 9 mars 2016 concernant un code de l’Union relatif au régime de franchissement des frontières par les personnes (code frontières Schengen)',
    en: 'Regulation (EU) 2016/399 of the European Parliament and of the Council of 9 March 2016 on a Union Code on the rules governing the movement of persons across borders (Schengen Borders Code)',
  },
  short: { de: 'Schengener Grenzkodex', fr: 'Code frontières Schengen', en: 'Schengen Borders Code' },
  abbr: { de: 'SGK', fr: 'CFS', en: 'SBC' },
};

function checkTitle(parsed, lang) {
  const norm = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').replace(/[^\p{L}\p{N} ()/']/gu, '').trim();
  const a = norm(parsed.workTitle || '');
  const b = norm(WORK.title[lang]);
  if (!a.startsWith(b.slice(0, 40)) || !a.includes(b.slice(-40))) {
    throw new Error(`Werktitel ${lang} weicht ab:\n  Quelle: ${parsed.workTitle}\n  WORK:   ${WORK.title[lang]}`);
  }
}

export const NOTE = {
  oj: { de: 'Amtsblattfassung (ABl. L 77 vom 23.3.2016, S. 1), direkt von EUR-Lex.', fr: 'Version publiée au JO (JO L 77 du 23.3.2016, p. 1), directement depuis EUR-Lex.', en: 'Official Journal version (OJ L 77, 23.3.2016, p. 1), directly from EUR-Lex.' },
  c20161006: { de: 'Konsolidierte Fassung vom 6.10.2016, direkt von EUR-Lex.', fr: 'Version consolidée du 6.10.2016, directement depuis EUR-Lex.', en: 'Consolidated version of 6.10.2016, directly from EUR-Lex.' },
  c20170407: { de: 'Konsolidierte Fassung vom 7.4.2017, direkt von EUR-Lex.', fr: 'Version consolidée du 7.4.2017, directement depuis EUR-Lex.', en: 'Consolidated version of 7.4.2017, directly from EUR-Lex.' },
  c20240710: { de: 'Konsolidierte Fassung vom 10.7.2024 von EUR-Lex; ergänzt um die Änderungen durch Art. 80 der Verordnung (EU) 2018/1240 (ETIAS), die EUR-Lex nicht konsolidiert hat.', fr: 'Version consolidée du 10.7.2024 (EUR-Lex), complétée par les modifications de l’article 80 du règlement (UE) 2018/1240 (ETIAS), non consolidées par EUR-Lex.', en: 'Consolidated version of 10.7.2024 (EUR-Lex), supplemented by the amendments made by Article 80 of Regulation (EU) 2018/1240 (ETIAS), which EUR-Lex has not consolidated.' },
  c20240710a: { de: 'Konsolidierte Fassung vom 10.7.2024, direkt von EUR-Lex (vorläufig ohne ETIAS-Ergänzung).', fr: 'Version consolidée du 10.7.2024, directement depuis EUR-Lex (provisoire, sans ETIAS).', en: 'Consolidated version of 10.7.2024, directly from EUR-Lex (provisional, without ETIAS).' },
  c20251012: { de: 'Konsolidierte Fassung vom 12.10.2025 von EUR-Lex (enthält die Berichtigung 32024R1717R(01), nur DE betroffen); ergänzt um Art. 80 der Verordnung (EU) 2018/1240.', fr: 'Version consolidée du 12.10.2025 (EUR-Lex), avec le rectificatif 32024R1717R(01) (seule la version allemande est concernée); complétée par l’article 80 du règlement (UE) 2018/1240.', en: 'Consolidated version of 12.10.2025 (EUR-Lex), including corrigendum 32024R1717R(01) (German only); supplemented by Article 80 of Regulation (EU) 2018/1240.' },
};

export function snapshotStages(opts = {}) {
  return [
    { stage: { id: 's00', act: '32016R0399', order: 0, date: '2016-03-23', source: { kind: 'oj', celex: '32016R0399', note: NOTE.oj } }, celex: '32016R0399' },
    { stage: { id: 's01', act: '32016R1624', order: 1, date: '2016-10-06', source: { kind: 'consolidated', celex: '02016R0399-20161006', note: NOTE.c20161006 } }, celex: '02016R0399-20161006' },
    { stage: { id: 's02', act: '32017R0458', order: 2, date: '2017-04-07', source: { kind: 'consolidated', celex: '02016R0399-20170407', note: NOTE.c20170407 } }, celex: '02016R0399-20170407' },
  ];
}

// Erzeugt den Datensatz im Speicher. without: CELEX einer Fassung, die ausgelassen wird (Test addSnapshot)
export function buildAll({ snapshotsOnly = false, without = null } = {}) {
  const log = [];
  const assets = {};
  for (const lang of LANGS) checkTitle(parseRaw('02016R0399-20251012', lang), lang);
  const snaps = snapshotStages();
  const input = [];
  for (const s of snaps) input.push({ stage: s.stage, byLang: Object.fromEntries(LANGS.map((l) => [l, parseRaw(s.celex, l)])) });
  let patches = [];
  let recon = null;
  if (snapshotsOnly) {
    input.push({ stage: { id: 's07', act: '32024R1717', order: 7, date: '2024-07-10', source: { kind: 'consolidated', celex: '02016R0399-20240710', note: NOTE.c20240710a } }, byLang: Object.fromEntries(LANGS.map((l) => [l, parseRaw('02016R0399-20240710', l)])) });
  } else {
    const etias = buildEtiasPatch({ parseRaw, readRaw, LANGS });
    patches = etias.patches;
    recon = reconstructStages({ parseRaw, readRaw, LANGS, patches, log });
    for (const st of recon.stages) input.push(st);
  }
  const guides = { s02: Object.fromEntries(LANGS.map((l) => [l, parseRaw('02016R0399-20240710', l)])) };
  const ds = buildDataset(input, null, { work: WORK, generated: '2026-11-11', assets, log, guides, patches });
  // 20251012 als weiterer Stand per addSnapshot (gleicher Weg wie Upload im Browser)
  if (without !== '02016R0399-20251012') {
    const order = ds.stages.map((s) => s.act);
    for (const lang of LANGS) {
      addSnapshot(ds, parseRaw('02016R0399-20251012', lang), {
        actCelex: '32024R1717R(01)', date: '2025-10-12', stageId: 's08', assets, log,
        note: NOTE.c20251012, actOrder: [...order, '32024R1717R(01)'],
      });
    }
    const s08 = ds.stages.find((s) => s.id === 's08');
    if (s08) { s08.source = { kind: snapshotsOnly ? 'consolidated' : 'patched', celex: '02016R0399-20251012', note: NOTE.c20251012 }; }
  }
  return { ds, log, assets, recon };
}

async function main() {
  const t0 = Date.now();
  const built = buildAll({ snapshotsOnly: args.has('--snapshots-only'), without: argVal('without') });
  const { log, assets, recon } = built;
  // Etappe 3: Einheit Erwägungsgründe (rct) aus der ABl.-Fassung, vorerst nur mit --recitals (s. data/VALIDATION_WORKS.md, Abschnitt SGK:
  // model.js addSnapshot würde rct beim nächsten Upload als aufgehoben kennzeichnen). Ändert keine andere Einheit (Nachweis: build-work.mjs sgk).
  const ds = args.has('--recitals') ? withRecitals(built.ds, recitalsUnit(RAW, '32016R0399', 's00')) : built.ds;
  if (!existsSync(DATA)) mkdirSync(DATA);
  writeAtomic(resolve(DATA, 'dataset.json'), JSON.stringify(ds));
  writeAtomic(resolve(ROOT, 'scripts/out/build-log.json'), JSON.stringify({ log, recon: recon ? recon.report : null }, null, 1));
  if (!args.has('--no-assets')) {
    const { writeAssets } = await import('./assets.mjs');
    const used = new Set();
    for (const u of Object.values(ds.units)) for (const vs of Object.values(u.versions)) for (const v of vs) for (const b of v.blocks) if (b.asset) used.add(b.asset);
    const rep = await writeAssets(assets, used, resolve(DATA, 'assets.json'));
    writeAtomic(resolve(ROOT, 'scripts/out/assets-report.json'), JSON.stringify(rep, null, 1));
  }
  const nVer = Object.values(ds.units).reduce((a, u) => a + Object.values(u.versions).reduce((b, v) => b + v.length, 0), 0);
  console.log(`dataset.json: ${ds.stages.length} Staende, ${Object.keys(ds.units).length} Einheiten, ${nVer} Versionen, ${(JSON.stringify(ds).length / 1e6).toFixed(2)} MB, ${Date.now() - t0} ms`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
