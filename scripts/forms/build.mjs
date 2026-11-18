// Baut data/forms.json (SPEC3 §3.5) aus der Lesung 2 (pass2.json) und den Entscheiden des Abgleichs (decisions.json).
// Zuordnung Bild → Einheit/Schlüssel/Sprache/Stände direkt aus data/dataset.json (getVersion je Stand).
// Aufruf: node scripts/forms/build.mjs
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { getVersion } from '../../src/core/model.js';

const ROOT = new URL('../../', import.meta.url).pathname;
const LANGS = ['de', 'fr', 'en'];
const ds = JSON.parse(readFileSync(ROOT + 'data/dataset.json', 'utf8'));
const assets = JSON.parse(readFileSync(ROOT + 'data/assets.json', 'utf8'));
const p2 = JSON.parse(readFileSync(ROOT + 'scripts/forms/pass2.json', 'utf8'));
const dec = JSON.parse(readFileSync(ROOT + 'scripts/forms/decisions.json', 'utf8'));

// 1. Bild-Blöcke je Einheit/Schlüssel/Sprache/Asset mit den Ständen, in denen sie gelten
export function imageOccurrences() {
  const occ = new Map();
  for (const uid of Object.keys(ds.units)) for (const lang of LANGS) for (const st of ds.stages) {
    if (!st.langs.includes(lang)) continue;
    const v = getVersion(ds, uid, lang, st.id);
    if (!v || v.repealed) continue;
    for (const b of v.blocks) if (b.ty === 'img') {
      const id = `${uid}|${b.k}|${lang}|${b.asset}`;
      if (!occ.has(id)) occ.set(id, { unit: uid, key: b.k, lang, asset: b.asset, stages: [] });
      occ.get(id).stages.push(st.id);
    }
  }
  return [...occ.values()];
}

// 2. Gestaltungshinweise (nicht amtlich, beschreibend)
const L3 = (de, fr, en) => ({ de, fr, en });
function layoutNote(o) {
  const { unit, key } = o;
  if (unit === 'anx_III') {
    if (key === 'ptA.g1') return L3('Schild: weisse Schrift auf dunklem Grund; im Sternenkreis die Kürzel (f1), darunter die Bezeichnung (f2).',
      'Panneau: texte blanc sur fond sombre; dans le cercle d’étoiles les sigles (f1), au-dessous la désignation (f2).',
      'Sign: white lettering on a dark background; abbreviations inside the circle of stars (f1), designation below (f2).');
    if (key === 'ptB1.g1' || key === 'ptB2.g1') return L3('Schild: weisse Schrift auf dunklem Grund' + (key === 'ptB1.g1' ? '; zweiter Teil kursiv.' : '.'),
      'Panneau: texte blanc sur fond sombre' + (key === 'ptB1.g1' ? '; seconde partie en italique.' : '.'),
      'Sign: white lettering on a dark background' + (key === 'ptB1.g1' ? '; second part in italics.' : '.'));
    if (key.startsWith('ptC.')) {
      const n = +key.slice(5);
      const left = n <= 3 ? ['Sternenkreis mit den Kürzeln', 'cercle d’étoiles avec les sigles', 'circle of stars with the abbreviations'] : ['Text auf dunklem Grund', 'texte sur fond sombre', 'text on a dark background'];
      return L3(`Zweiteiliges Schild: links ${left[0]} (f1), rechts Fahrzeugpiktogramm mit Bezeichnung (f2).`,
        `Panneau en deux parties: à gauche ${left[1]} (f1), à droite pictogramme du véhicule avec la désignation (f2).`,
        `Two-part sign: on the left ${left[2]} (f1), on the right vehicle pictogram with designation (f2).`);
    }
    if (/^ptD\.ptD\d\.g1$/.test(key)) {
      const stars = key === 'ptD.ptD1.g1';
      return L3(`Piktogramm ohne Schrift${stars ? ', mit Sternenkreis' : ''}.`, `Pictogramme sans texte${stars ? ', avec cercle d’étoiles' : ''}.`, `Pictogram without lettering${stars ? ', with circle of stars' : ''}.`);
    }
    if (/^ptD\.ptD\d\.g2$/.test(key) || key === 'ptE.g1') return L3('Schild: weisse Schrift auf dunklem Grund' + (key === 'ptE.g1' ? ', farbiger Rahmen.' : '.'),
      'Panneau: texte blanc sur fond sombre' + (key === 'ptE.g1' ? ', cadre de couleur.' : '.'), 'Sign: white lettering on a dark background' + (key === 'ptE.g1' ? ', coloured frame.' : '.'));
  }
  const blanks = ['Ausfülllinien als «…».', 'lignes à remplir rendues par «…».', 'blank lines rendered as “…”.'];
  if (unit === 'anx_V' && key === 'ptB.g1') {
    const ees = o.stages.includes('s03');
    const base = L3(`Formular mit Rahmen; Ankreuzfelder (☐) bei den Gründen (A) bis (${ees ? 'J' : 'I'}); ${blanks[0]} Unterschriftsfelder f22 und f23; Fussnote (1).`,
      `Formulaire encadré; cases à cocher (☐) pour les motifs (A) à (${ees ? 'J' : 'I'}); ${blanks[1]} Cases de signature f22 et f23; note (1).`,
      `Framed form; tick boxes (☐) for grounds (A) to (${ees ? 'J' : 'I'}); ${blanks[2]} Signature boxes f22 and f23; footnote (1).`);
    if (ees) {
      base.de += ' Im Bild stehen die Änderungsmarker ▶(1) … ◀ (Buchstabe J) und ▶(2) … ◀ (Hinweise zum EES) der konsolidierten Fassung; nicht in den Text übernommen.'
        + ' Ab Stand s04 ist Grund (C) durch Art. 80 Nr. 3 der Verordnung (EU) 2018/1240 ersetzt; das Bild zeigt den früheren Wortlaut, massgebend ist Block ptB.c.';
      base.fr += ' L’image contient les marqueurs de modification ▶(1) … ◀ (lettre J) et ▶(2) … ◀ (mentions relatives à l’EES) de la version consolidée; non repris dans le texte.'
        + ' À partir de l’état s04, le motif (C) est remplacé par l’art. 80, point 3, du règlement (UE) 2018/1240; l’image montre l’ancien libellé, le bloc ptB.c fait foi.';
      base.en += ' The image contains the consolidation markers ▶(1) … ◀ (letter J) and ▶(2) … ◀ (EES notices); not carried into the text.'
        + ' From stage s04, ground (C) is replaced by Article 80(3) of Regulation (EU) 2018/1240; the image shows the former wording, block ptB.c prevails.';
    }
    return base;
  }
  if (unit === 'anx_VIII') return L3(`Formular mit Rahmen; ${blanks[0]} Unterschriftsfelder f15 und f16; Fussnote (1).`, `Formulaire encadré; ${blanks[1]} Cases de signature f15 et f16; note (1).`, `Framed form; ${blanks[2]} Signature boxes f15 and f16; footnote (1).`);
  if (unit === 'anx_XII') return L3(`Formular; Emblem links neben f1; ${blanks[0]} Ankreuzfeld f17.n1; Unterschriftslinien in f18.`, `Formulaire; emblème à gauche de f1; ${blanks[1]} Case à cocher f17.n1; lignes de signature en f18.`, `Form; emblem to the left of f1; ${blanks[2]} Tick box f17.n1; signature lines in f18.`);
  throw new Error(`kein Gestaltungshinweis für ${unit} ${key}`);
}

// 3. Wörtlich übernommene Auffälligkeiten der Quelle (sic)
const SIC = [
  ['d91a0d752a6f6743', 'fE', 'documentaion'], ['d91a0d752a6f6743', 'fE.s1', 'colud'], ['1498afb43939b68f', 'fE', 'documentaion'], ['1498afb43939b68f', 'fE.s1', 'colud'],
  ['4fe081b8a4db27cc', 'fF', 'à déjà'], ['3e0813af8e8324b5', 'fF', 'à déjà'],
  ['2a3c6e55d18d6f7d', 'f3', 'LADURÉE'], ['2a3c6e55d18d6f7d', 'f14', 'remise â'], ['847372fb34db23a2', 'f12', 'he/she) has provided, he/she)'],
];
const SUPERSEDED = { 'anx_V|ptB.g1': [{ k: 'fC', by: { unit: 'anx_V', key: 'ptB.c' }, from: 's04', celex: '32018R1240' }] };

export function build() {
  const fixed = JSON.parse(JSON.stringify(p2));
  for (const c of dec.corrections) {
    const b = fixed[c.asset].blocks.find((x) => x.k === c.k);
    if (!b || !b.t.includes(c.from)) throw new Error(`Korrektur nicht anwendbar: ${c.asset} ${c.k}`);
    b.t = b.t.replace(c.from, c.to);
  }
  const out = [];
  for (const o of imageOccurrences()) {
    if (!assets[o.asset]) throw new Error(`Asset fehlt: ${o.asset}`);
    const r = fixed[o.asset];
    if (!r) throw new Error(`keine Transkription für ${o.unit} ${o.key} ${o.lang} ${o.asset}`);
    const e = { unit: o.unit, key: o.key, lang: o.lang, asset: o.asset, stages: o.stages, blocks: r.blocks.map((b) => ({ k: b.k, l: b.l, t: b.t })),
      layoutNote: layoutNote(o), method: 'transcription', checked: 'double' };
    if (r.noText) e.noText = true;
    const sic = SIC.filter(([h]) => h === o.asset).map(([, k, text]) => {
      if (!e.blocks.find((b) => b.k === k)?.t.includes(text)) throw new Error(`sic nicht gefunden: ${o.asset} ${k} ${text}`);
      return { k, text };
    });
    if (sic.length) e.sic = sic;
    const sup = (SUPERSEDED[`${o.unit}|${o.key}`] || []).filter((s) => o.stages.includes(s.from));
    if (sup.length) e.superseded = sup;
    out.push(e);
  }
  const order = (x) => Object.keys(ds.units).indexOf(x.unit) * 1e6 + LANGS.indexOf(x.lang) * 1e4 + ds.stages.findIndex((s) => s.id === x.stages[0]);
  out.sort((a, b) => order(a) - order(b) || a.key.localeCompare(b.key, 'en', { numeric: true }));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = build();
  const tmp = ROOT + 'data/forms.json.tmp';
  writeFileSync(tmp, JSON.stringify(out, null, 1) + '\n');
  renameSync(tmp, ROOT + 'data/forms.json');
  console.log(`data/forms.json: ${out.length} Einträge, ${new Set(out.map((x) => x.asset)).size} Bilder, ${out.reduce((s, x) => s + x.blocks.length, 0)} Textblöcke, ohne Text ${out.filter((x) => x.noText).length}`);
}
