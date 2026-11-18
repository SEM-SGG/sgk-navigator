// SGK-Navigator — ETIAS-Patch: Art. 80 der Verordnung (EU) 2018/1240 in der berichtigten Fassung
// (konsolidierte Fassung 02018R1240-20260612, Marker ▼C1/▼C2 = 32018R1240R(03) fuer Nr. 2 Bst. a).
// Der Wortlaut wird 1:1 aus der Quelle uebernommen; die Zuordnung zu den SGK-Bestimmungen ist hier festgelegt
// und wird beim Build gegen den Wortlaut der Aenderungsanweisungen geprueft (Fehler, wenn er nicht passt).

import { normText } from '../src/core/text.js';

const SRC = '02018R1240-20260612';
const QUOTE_OPEN = /^\s*[„«‘"“]\s*/;
const QUOTE_CLOSE = /\s*[“»’"”]\s*[.;,]*\s*$/;

function stripQuotes(t) { return t.replace(QUOTE_OPEN, '').replace(QUOTE_CLOSE, ''); }
function cleanLabel(l) { return l.replace(QUOTE_OPEN, '').trim(); }

// Erwartete Aenderungsanweisungen (zur Kontrolle der Zuordnung), je Sprache als Regex auf den Anweisungstext
const EXPECT = {
  'n1': { de: /Artikel 6 Absatz 1 wird wie folgt geändert/, fr: /article 6, le paragraphe 1 est modifié/, en: /Article 6\(1\) is amended/ },
  'n1.a': { de: /Buchstabe b erhält folgende Fassung/, fr: /le point b\) est remplacé/, en: /point \(b\) is replaced/ },
  'n1.b': { de: /Folgende Unterabsätze werden angefügt/, fr: /les alinéas suivants sont ajoutés/, en: /the following subparagraphs are added/ },
  'n2': { de: /Artikel 8 Absatz 3 wird wie folgt geändert/, fr: /article 8, le paragraphe 3 est modifié/, en: /Article 8\(3\) is amended/ },
  'n2.a': { de: /Buchstabe a Ziffer ii erhält folgende Fassung/, fr: /au point a\), le point ii\) est remplacé/, en: /in point \(a\), point \(ii\) is replaced/ },
  'n2.b': { de: /folgender Buchstabe wird eingefügt/, fr: /le point suivant est inséré/, en: /the following point is inserted/ },
  'n3': { de: /Anhang V Teil B erhält Punkt C/, fr: /annexe V, partie B.*point \(C\)/, en: /Annex V, Part B.*point \(C\)/ },
};

const FORM_NOTE = {
  de: 'Hinweis des Datensatzes: Das Standardformular in Teil B ist als Bild wiedergegeben (Fassung nach der Verordnung (EU) 2017/2225). Art. 80 Nr. 3 der Verordnung (EU) 2018/1240 fasst Punkt C der Liste der Ablehnungsgründe neu; dieser Wortlaut ist hier als Text ausgewiesen, das Bild zeigt den früheren Wortlaut.',
  fr: 'Note du jeu de données: le formulaire uniforme de la partie B est reproduit sous forme d’image (version issue du règlement (UE) 2017/2225). L’article 80, point 3, du règlement (UE) 2018/1240 remplace le point (C) de la liste des motifs de refus; ce texte figure ici, l’image montre l’ancien libellé.',
  en: 'Dataset note: the standard form in Part B is reproduced as an image (version resulting from Regulation (EU) 2017/2225). Article 80(3) of Regulation (EU) 2018/1240 replaces point (C) of the list of reasons for refusal; that wording is shown here as text, the image shows the previous wording.',
};

export function buildEtiasPatch({ parseRaw, LANGS }) {
  const patches = [];
  const blocksBy = {};
  const check = [];
  for (const lang of LANGS) {
    const p = parseRaw(SRC, lang);
    const art = p.units.find((u) => u.id === 'art_80');
    if (!art) throw new Error('ETIAS: Art. 80 fehlt in ' + SRC + ' ' + lang);
    const B = new Map(art.blocks.map((b) => [b.k, b]));
    for (const [k, re] of Object.entries(EXPECT)) {
      const b = B.get(k);
      const plain = b ? b.t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ') : '';
      if (!b || !re[lang].test(plain)) throw new Error(`ETIAS ${lang}: Anweisung ${k} passt nicht: ${b ? b.t : '(fehlt)'}`);
    }
    // Schluessel des zitierten Wortlauts: seit Etappe 3 fuehrt der Parser zitierte Neufassungen als q1, q2, … unter der Anweisung
    // (vorher x1 bzw. s2, s3); beide Formen werden akzeptiert.
    const get = (...ks) => { for (const k of ks) { const b = B.get(k); if (b) return b; } throw new Error(`ETIAS ${lang}: Block ${ks.join('/')} fehlt`); };
    const p1b = get('n1.a.q1', 'n1.a.x1');
    const sub2 = get('n1.b.q1', 'n1.b.s2');
    const sub3 = get('n1.b.q2', 'n1.b.s3');
    const ii = get('n2.a.q1', 'n2.a.x1');
    const ba = get('n2.b.q1', 'n2.b.x1');
    const c = get('n3.q1', 'n3.x1');
    const o = '32018R1240';
    blocksBy[lang] = {
      p1b: [{ k: 'p1.b', l: cleanLabel(p1b.l), t: stripQuotes(p1b.t), o, fn: p1b.fn, src: 'n1.a' }],
      sub: [
        { k: 'p1.s2', d: 1, l: '', t: stripQuotes(sub2.t), o, src: 'n1.b' },
        { k: 'p1.s3', d: 1, l: '', t: stripQuotes(sub3.t), o, src: 'n1.b' },
      ],
      ii: [{ k: 'p3.a.ii', l: cleanLabel(ii.l), t: stripQuotes(ii.t), o: '32018R1240R(03)', src: 'n2.a' }],
      ba: [{ k: 'p3.ba', d: 1, l: cleanLabel(ba.l), t: stripQuotes(ba.t), o, src: 'n2.b' }],
      c: [{ k: 'ptB.c', d: 1, l: cleanLabel(c.l), t: stripQuotes(c.t), o, nt: FORM_NOTE[lang], src: 'n3' }],
    };
    check.push({ lang, ii: ii.o, others: [p1b.o, sub2.o, ba.o, c.o] });
  }
  const per = (name) => Object.fromEntries(LANGS.map((l) => [l, blocksBy[l][name]]));
  patches.push({ act: '32018R1240', unit: 'art_6', op: 'replace', key: 'p1.b', blocks: per('p1b'), ref: { what: 'Art. 6 Abs. 1 Bst. b', src: 'Art. 80 Nr. 1 Bst. a' } });
  patches.push({ act: '32018R1240', unit: 'art_6', op: 'insertAfter', after: 'p1', blocks: per('sub'), ref: { what: 'Art. 6 Abs. 1 Unterabsätze 2 und 3 (neu)', src: 'Art. 80 Nr. 1 Bst. b' } });
  patches.push({ act: '32018R1240', unit: 'art_8', op: 'replace', key: 'p3.a.ii', blocks: per('ii'), ref: { what: 'Art. 8 Abs. 3 Bst. a Ziff. ii', src: 'Art. 80 Nr. 2 Bst. a (berichtigt durch 32018R1240R(03))' } });
  patches.push({ act: '32018R1240', unit: 'art_8', op: 'insertAfter', after: 'p3.b', blocks: per('ba'), ref: { what: 'Art. 8 Abs. 3 Bst. ba (neu)', src: 'Art. 80 Nr. 2 Bst. b' } });
  patches.push({ act: '32018R1240', unit: 'anx_V', op: 'insertAfter', after: 'ptB.g1', blocks: per('c'), ref: { what: 'Anhang V Teil B, Punkt C des Standardformulars', src: 'Art. 80 Nr. 3' } });
  return { patches, check };
}
