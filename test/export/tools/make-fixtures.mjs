// Erzeugt die Beispielkarten test/export/fixtures/*.json aus data/dataset.json und data/acts.json.
// Wortlaut unverändert aus dem Datensatz; Chronologie mit blockHistory() aus src/core/model.js, Wort-Diff mit derselben
// Funktion wie die Oberfläche (src/app/lib/diff.js, nur gelesen), Redline-Läufe mit redlineRuns() aus src/export/model.js.
// Beschriftungen wie die Oberfläche (src/app/i18n/de.js, fr.js), hier fest eingetragen.
// Aufruf: node test/export/tools/make-fixtures.mjs
import { readFileSync, writeFileSync, mkdirSync, renameSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffText } from '../../../src/app/lib/diff.js';
import { blockHistory } from '../../../src/core/model.js';
import { redlineRuns, htmlToRuns, validateCard } from '../../../src/export/model.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT = join(ROOT, 'test', 'export', 'fixtures');
const ds = JSON.parse(readFileSync(join(ROOT, 'data', 'dataset.json'), 'utf8'));
const acts = new Map(JSON.parse(readFileSync(join(ROOT, 'data', 'acts.json'), 'utf8')).map((a) => [a.celex, a]));
const stage = new Map(ds.stages.map((s) => [s.id, s]));

// Farben und Kürzel wie die Oberfläche (src/app/data.js)
const COLORS = { '32016R0399': '#848E99', '32016R1624': '#0072B2', '32017R0458': '#E69F00', '32017R2225': '#009E73', '32018R1240': '#CC79A7', '32019R0817': '#56B4E9', '32021R1134': '#999933', '32024R1717': '#332288' };
const CODES = {
  de: { '32016R0399': 'Basis', '32016R1624': 'Frontex', '32017R0458': 'Syst. Abfr.', '32017R2225': 'EES', '32018R1240': 'ETIAS', '32019R0817': 'Interop.', '32021R1134': 'VIS', '32024R1717': 'Reform 2024' },
  fr: { '32016R0399': 'Base', '32016R1624': 'Frontex', '32017R0458': 'Vérif. syst.', '32017R2225': 'EES', '32018R1240': 'ETIAS', '32019R0817': 'Interop.', '32021R1134': 'VIS', '32024R1717': 'Réforme 2024' },
};
const T = {
  de: {
    base: 'Basistext', inserted: 'eingefügt', replaced: 'ersetzt', amended: 'geändert', deleted: 'gestrichen', same: 'unverändert', punct: 'geändert', editorial: 'redaktionell',
    reg: (n) => `VO ${n}`, corr: (r, name) => `Berichtigung R(${r}) zu ${name}`, baseAct: 'Basisakt', adopted: (d) => `angenommen am ${d}`, applicable: (d) => `anwendbar seit ${d}`,
    pending: 'noch nicht anwendbar', recon: 'rekonstruiert', subChron: 'Chronologie der Fassungen', legalText: (l) => ` (Rechtstext ${l.toUpperCase()})`,
    disclaimer: 'Massgebend ist allein das Amtsblatt der EU; konsolidierte und rekonstruierte Fassungen sind nicht rechtsverbindlich. Erstellt am 12. November 2026 mit SGK-Navigator.',
    work: 'Schengener Grenzkodex', abbr: 'SGK', provision: 'Bestimmung',
  },
  fr: {
    base: 'texte de base', inserted: 'inséré', replaced: 'remplacé', amended: 'modifié', deleted: 'supprimé', same: 'inchangé', punct: 'modifié', editorial: 'rédactionnel',
    reg: (n) => `règlement ${n.replace('(EU)', '(UE)')}`, corr: (r, name) => `Rectificatif R(${r}) au ${name}`, baseAct: 'Acte de base', adopted: (d) => `adopté le ${d}`, applicable: (d) => `applicable depuis le ${d}`,
    pending: 'pas encore applicable', recon: 'reconstitué', subChron: 'Chronologie des versions', legalText: (l) => ` (texte juridique ${l.toUpperCase()})`,
    disclaimer: 'Seule la publication au Journal officiel de l’UE fait foi; les versions consolidées et reconstituées n’ont pas de valeur juridique. Établi le 12 novembre 2026 avec SGK-Navigator.',
    work: 'Code frontières Schengen', abbr: 'CFS', provision: 'Disposition',
  },
};
const baseCelex = (c) => c.replace(/R\(\d+\)$/, '');
const corrNo = (c) => (/R\((\d+)\)$/.exec(c) || [])[1];
const color = (c) => COLORS[baseCelex(c)] || '#882255';
const MONTHS = { de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'], fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'] };
const fmtDate = (iso, l = 'de') => { const [y, m, d] = iso.split('-').map(Number); return l === 'fr' ? `${d === 1 ? '1er' : d} ${MONTHS.fr[m - 1]} ${y}` : `${d}. ${MONTHS.de[m - 1]} ${y}`; };
const actName = (c, l = 'de') => { const b = baseCelex(c); const n = T[l].reg(acts.get(b).number); return corrNo(c) ? T[l].corr(corrNo(c), n) : n; };
const RECON = new Set(ds.stages.filter((s) => s.source.kind !== 'oj' && s.source.kind !== 'consolidated').map((s) => s.id));

function metaLine(celex, l = 'de') {
  const a = acts.get(celex) || acts.get(baseCelex(celex));
  const out = [];
  if (baseCelex(celex) === '32016R0399') out.push(T[l].baseAct);
  if (a.adopted) out.push(T[l].adopted(fmtDate(a.adopted, l)));
  if (a.oj) out.push(a.oj[l] || a.oj.de || a.oj);
  if (a.application && a.application.status === 'applicable' && a.application.date) out.push(T[l].applicable(fmtDate(a.application.date, l)));
  return out;
}

const version = (unit, lang, st) => {
  const ord = stage.get(st).order;
  return [...ds.units[unit].versions[lang]].filter((v) => stage.get(v.stage).order <= ord).pop();
};
const RUN = (html) => htmlToRuns(html || '');
const typeOf = (b) => (b.ty === 'heading' ? { type: 'heading' } : b.ty === 'img' ? { type: 'img' } : {});

/** Redline zwischen zwei Fassungen eines Blocks */
function redline(ob, nb) {
  if (!ob) return RUN(nb.t).map((r) => ({ ...r, op: 'ins' }));
  if (!nb) return RUN(ob.t).map((r) => ({ ...r, op: 'del' }));
  if (ob.t === nb.t) return RUN(nb.t);
  const d = diffText(ob.t, nb.t);
  return redlineRuns(d.oldHtml, d.newHtml, d.redline);
}

function section(st, act, change, blocks, l) {
  const base = baseCelex(act);
  const a = acts.get(base);
  const flags = [];
  if (RECON.has(st)) flags.push({ kind: 'reconstructed', label: T[l].recon });
  if (a.application && a.application.status === 'pending') flags.push({ kind: 'not-applicable', label: T[l].pending });
  return { heading: actName(act, l), code: CODES[l][base] || '', tag: T[l][change] || change, color: color(act), meta: metaLine(act, l), flags, blocks };
}

const written = new Set();
function write(name, card) {
  const v = validateCard(card);
  if (!v.ok) throw new Error(name + ': ' + v.errors.join('; '));
  mkdirSync(OUT, { recursive: true });
  const f = join(OUT, name + '.json');
  writeFileSync(f + '.tmp', JSON.stringify(card, null, 1) + '\n');
  renameSync(f + '.tmp', f);
  written.add(name + '.json');
  const n = card.sections.reduce((a, s) => a + s.blocks.length, 0) + (card.rows || []).length;
  console.log(`${name}: ${n} Blöcke/Zeilen, ${JSON.stringify(card).length} Zeichen JSON`);
}

const legendActs = (celexes, l = 'de') => [...new Set(celexes.map(baseCelex))].filter((c) => c !== '32016R0399').map((c) => ({ code: CODES[l][c], label: actName(c, l), color: COLORS[c] }));
const legDiff = (l) => [{ op: 'ins', label: T[l].inserted }, { op: 'del', label: T[l].deleted }];

// Fundstelle aus dem Schlüssel (für Zeilen der Gegenüberstellung)
const ROMAN = /^(i|ii|iii|iiia|iv|v|vi|vii|viii|ix|x|xi|xii)$/;
function cite(key, l = 'de') {
  const out = [];
  for (const [n, part] of key.split('.').entries()) {
    let m;
    if ((m = /^p(\d+)([a-z]*)$/.exec(part))) out.push(l === 'fr' ? `par. ${m[1]}${m[2] ? ' ' + ({ a: 'bis', b: 'ter', c: 'quater', d: 'quinquies' }[m[2]] || m[2]) : ''}` : `Abs. ${m[1]}${m[2]}`);
    else if ((m = /^s(\d+)$/.exec(part))) out.push(l === 'fr' ? `al. ${m[1]}` : `Unterabs. ${m[1]}`);
    else if ((m = /^n(\d+)$/.exec(part))) out.push(l === 'fr' ? `no ${m[1]}` : `Nr. ${m[1]}`);
    else if ((m = /^h(\d+)$/.exec(part))) out.push(l === 'fr' ? `titre ${m[1]}` : `Titel ${m[1]}`);
    else if (n >= 2 && ROMAN.test(part)) out.push(l === 'fr' ? `${part})` : `Ziff. ${part}`);
    else out.push(l === 'fr' ? `point ${part})` : `Bst. ${part}`);
  }
  return l === 'fr' ? out.join(', ') : out.join(' ');
}

// ------------------------------------------------------------------ 1–3 Chronologie Art. 8 Abs. 3 Bst. a Ziff. ii (DE, FR, EN)
function chronology(textLang, uiLang, name) {
  const key = 'p3.a.ii';
  const hist = blockHistory(ds, 'art_8', textLang, key);
  const sections = [];
  let prev = null;
  for (const h of hist) {
    const b = h.block;
    const blk = { key, label: (b || prev).l || '', depth: 0, ...typeOf(b || prev), runs: h.change === 'base' ? RUN(b.t) : redline(prev, b) };
    sections.push(section(h.stage, h.act || stage.get(h.stage).act, h.change, [blk], uiLang));
    prev = b;
  }
  const l = uiLang;
  const latest = hist[hist.length - 1];
  const unitTitle = version('art_8', uiLang, 's08').title;
  const title = l === 'fr' ? 'Art. 8, par. 3, point a), ii), CFS' : 'Art. 8 Abs. 3 Bst. a Ziff. ii SGK';
  write(name, {
    kind: 'chronology', title, subtitle: T[l].subChron + (textLang !== uiLang ? T[l].legalText(textLang) : ''),
    unitLine: `Art. 8: ${unitTitle}`, brand: 'SGK-Navigator', work: T[l].work, textLang, uiLang, sections, columns: null,
    legend: [...legendActs(hist.filter((h) => h.change !== 'base').map((h) => h.act), l), ...legDiff(l)],
    source: l === 'fr'
      ? `Source: EUR-Lex, règlement (UE) 2016/399 (CFS), état après le ${actName(latest.act, 'fr')} (${fmtDate(stage.get(latest.stage).date, 'fr')}).`
      : `Quelle: EUR-Lex, Verordnung (EU) 2016/399 (SGK), Stand nach ${actName(latest.act)} (${fmtDate(stage.get(latest.stage).date)}).`,
    disclaimer: T[l].disclaimer,
  });
}
chronology('de', 'de', 'chronology-art8-3a-ii-de');
chronology('fr', 'fr', 'chronology-art8-3a-ii-fr');
chronology('en', 'de', 'chronology-art8-3a-ii-en');

// ------------------------------------------------------------------ 4 Vergleich nebeneinander: ganzer Art. 8, Basistext (s00) gegen jüngsten Stand (s08)
{
  const A = version('art_8', 'de', 's00').blocks;
  const B = version('art_8', 'de', 's08').blocks;
  const oldMap = new Map(A.map((b) => [b.k, b]));
  const newMap = new Map(B.map((b) => [b.k, b]));
  // Reihenfolge: neue Fassung, gestrichene Blöcke an ihrer alten Stelle
  const keys = [];
  let oi = 0;
  for (const nb of B) {
    while (oi < A.length && !newMap.has(A[oi].k)) keys.push(A[oi++].k);
    if (oi < A.length && A[oi].k === nb.k) oi++;
    keys.push(nb.k);
  }
  while (oi < A.length) { if (!newMap.has(A[oi].k)) keys.push(A[oi].k); oi++; }
  const st = { changed: 0, ins: 0, del: 0 };
  const origins = [];
  const rows = keys.map((k) => {
    const ob = oldMap.get(k), nb = newMap.get(k);
    const status = !ob ? 'inserted' : !nb ? 'deleted' : ob.t === nb.t ? 'same' : 'changed';
    if (status === 'changed') st.changed++; else if (status === 'inserted') st.ins++; else if (status === 'deleted') st.del++;
    const red = redline(ob, nb);
    const left = ob ? { blocks: [{ key: k, label: ob.l || '', depth: 0, ...typeOf(ob), runs: red.filter((r) => r.op !== 'ins') }] } : null;
    const right = nb ? { blocks: [{ key: k, label: nb.l || '', depth: 0, ...typeOf(nb), runs: red.filter((r) => r.op !== 'del') }], marks: nb.o && baseCelex(nb.o) !== '32016R0399' && status !== 'same' ? [{ label: CODES.de[baseCelex(nb.o)] || nb.o, color: color(nb.o) }] : [] } : null;
    if (nb && nb.o && baseCelex(nb.o) !== '32016R0399' && status !== 'same') origins.push(nb.o);
    return { label: cite(k), tag: T.de[{ same: 'same', changed: 'amended', inserted: 'inserted', deleted: 'deleted' }[status]], status, cells: [left, right] };
  });
  write('comparison-art8-s00-s08', {
    kind: 'comparison', title: 'Art. 8 SGK', subtitle: 'Vergleich: Stand Basistext VO (EU) 2016/399 und Stand nach Berichtigung R(01) zu VO (EU) 2024/1717',
    unitLine: 'Art. 8: Grenzübertrittskontrollen von Personen', brand: 'SGK-Navigator', work: 'Schengener Grenzkodex', textLang: 'de', uiLang: 'de',
    stats: `${st.changed} geändert, ${st.ins} eingefügt, ${st.del} gestrichen`,
    sections: [], columns: [{ heading: 'Stand Basistext' }, { heading: 'Stand nach Reform 2024 Ber.' }], labelHeading: 'Bestimmung', rows,
    legend: [...legendActs(origins), ...legDiff('de')],
    source: 'Quelle: EUR-Lex, Verordnung (EU) 2016/399 (SGK), Stand nach Berichtigung R(01) zu VO (EU) 2024/1717 (12. Oktober 2025). Rekonstruierte oder ergänzte Stände: nach EES, nach ETIAS, nach Interop., nach VIS, nach Reform 2024, nach Reform 2024 Ber.',
    disclaimer: T.de.disclaimer,
  });
}

// ------------------------------------------------------------------ 5 Lange Chronologie: ganzer Art. 8, Basistext und alle Änderungsschritte (nur geänderte Blöcke)
{
  const vs = ds.units.art_8.versions.de;
  const sections = [];
  let prev = null;
  const origins = [];
  for (const v of vs) {
    const blocks = v.blocks;
    const act = stage.get(v.stage).act;
    if (!prev) sections.push(section(v.stage, act, 'base', blocks.map((b) => ({ key: b.k, label: b.l || '', depth: b.d, ...typeOf(b), runs: RUN(b.t) })), 'de'));
    else {
      const pm = new Map(prev.map((b) => [b.k, b])), nm = new Map(blocks.map((b) => [b.k, b]));
      const out = [];
      let oi = 0;
      for (const nb of blocks) {
        while (oi < prev.length && !nm.has(prev[oi].k)) { const ob = prev[oi++]; out.push({ key: ob.k, label: ob.l || '', depth: ob.d, op: 'del', ...typeOf(ob), runs: redline(ob, null) }); }
        if (oi < prev.length && prev[oi].k === nb.k) oi++;
        const ob = pm.get(nb.k);
        if (ob && ob.t === nb.t && ob.l === nb.l) continue;
        out.push({ key: nb.k, label: nb.l || '', depth: nb.d, ...(ob ? {} : { op: 'ins' }), ...typeOf(nb), runs: redline(ob, nb) });
      }
      while (oi < prev.length) { const ob = prev[oi++]; if (!nm.has(ob.k)) out.push({ key: ob.k, label: ob.l || '', depth: ob.d, op: 'del', ...typeOf(ob), runs: redline(ob, null) }); }
      if (out.length) { sections.push(section(v.stage, act, 'amended', out, 'de')); origins.push(act); }
    }
    prev = blocks;
  }
  write('long-art8-unit', {
    kind: 'chronology', title: 'Art. 8 SGK', subtitle: 'Chronologie der Fassungen (ganze Einheit, nur geänderte Blöcke)', unitLine: 'Art. 8: Grenzübertrittskontrollen von Personen',
    brand: 'SGK-Navigator', work: 'Schengener Grenzkodex', textLang: 'de', uiLang: 'de', sections, columns: null,
    legend: [...legendActs(origins), ...legDiff('de')],
    footnotes: [{ mark: '1', text: 'Stände nach VO (EU) 2017/2225, 2019/817 und 2021/1134 sind aus den Änderungsakten rekonstruiert.' }],
    source: 'Quelle: EUR-Lex, Verordnung (EU) 2016/399 (SGK), alle Stände bis Berichtigung R(01) zu VO (EU) 2024/1717 (12. Oktober 2025).',
    disclaimer: T.de.disclaimer,
  });
}

// ------------------------------------------------------------------ 6 Sprachvergleich FR | EN, Art. 8 Abs. 2a–2d, Oberfläche französisch
{
  const F = version('art_8', 'fr', 's08').blocks.filter((b) => /^p2[a-d](\.|$)/.test(b.k));
  const E = new Map(version('art_8', 'en', 's08').blocks.filter((b) => /^p2[a-d](\.|$)/.test(b.k)).map((b) => [b.k, b]));
  const rows = F.map((fb) => {
    const eb = E.get(fb.k);
    return {
      label: cite(fb.k, 'fr'), cells: [
        { blocks: [{ key: fb.k, label: fb.l || '', depth: 0, lang: 'fr', ...typeOf(fb), runs: RUN(fb.t) }] },
        eb ? { blocks: [{ key: eb.k, label: eb.l || '', depth: 0, lang: 'en', ...typeOf(eb), runs: RUN(eb.t) }] } : null,
      ],
    };
  });
  write('languages-art8-2a-fr-en', {
    kind: 'comparison', title: 'Art. 8, par. 2 bis à 2 quinquies, CFS', subtitle: 'Comparaison linguistique FR et EN, après le rectificatif R(01) au règlement (UE) 2024/1717',
    unitLine: 'Art. 8: Vérifications aux frontières portant sur les personnes', brand: 'SGK-Navigator', work: 'Code frontières Schengen', textLang: 'fr', uiLang: 'fr',
    sections: [], columns: [{ heading: 'Français (FR)', lang: 'fr' }, { heading: 'Anglais (EN)', lang: 'en' }], labelHeading: 'Disposition', rows,
    legend: [], source: 'Source: EUR-Lex, règlement (UE) 2016/399 (CFS), état après le rectificatif R(01) au règlement (UE) 2024/1717 (12 octobre 2025).',
    disclaimer: T.fr.disclaimer,
  });
}

// alte Beispielkarten entfernen
for (const f of readdirSync(OUT)) if (f.endsWith('.json') && !written.has(f)) { unlinkSync(join(OUT, f)); console.log('entfernt:', f); }
