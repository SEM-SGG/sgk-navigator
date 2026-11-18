// Erzeugt einen kleinen, schema-konformen Beispieldatensatz (SPEC §5, §6) für die UI-Tests.
// Texte sind gekürzt bzw. sinngemäss und dienen nur als Testmaterial.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));

const B = '32016R0399', M1 = '32016R1624', EES = '32017R2225', ETIAS = '32018R1240', R1717 = '32024R1717';
const L = ['de', 'fr', 'en'];
const tri = (de, fr, en) => ({ de, fr, en });

const stages = [
  { id: 's00', act: B, order: 0, source: { kind: 'oj', celex: B, note: tri('ABl.-Fassung', 'Version JO', 'OJ version') }, langs: L },
  { id: 's01', act: M1, order: 1, source: { kind: 'consolidated', celex: '02016R0399-20161006', note: tri('Konsolidierte Fassung vom 6.10.2016', '', '') }, langs: L },
  { id: 's03', act: EES, order: 3, source: { kind: 'reconstructed', celex: null, note: tri('Rekonstruiert aus der konsolidierten Fassung 20240710', '', '') }, langs: L },
  { id: 's04', act: ETIAS, order: 4, source: { kind: 'patched', celex: null, note: tri('Rekonstruiert, ETIAS-Änderungen aus dem Akttext eingefügt', '', '') }, langs: L },
  { id: 's07', act: R1717, order: 7, source: { kind: 'consolidated', celex: '02016R0399-20240710', note: tri('Konsolidierte Fassung vom 10.7.2024 mit ETIAS-Patch', '', '') }, langs: L },
];

const blk = (k, d, l, t, o, extra = {}) => ({ k, d, l, t, o, ...extra });

// Art. 6
function art6(lang, st) {
  const T = {
    de: {
      label: 'Artikel 6', title: 'Einreisevoraussetzungen für Drittstaatsangehörige',
      p1: 'Für einen geplanten Aufenthalt im Hoheitsgebiet der Mitgliedstaaten von bis zu 90 Tagen je Zeitraum von 180 Tagen gelten für einen Drittstaatsangehörigen folgende Einreisevoraussetzungen:',
      a: 'Er muss im Besitz eines gültigen Reisedokuments sein, das seinen Inhaber zum Überschreiten der Grenze berechtigt;',
      b0: 'er muss im Besitz eines gültigen Visums sein, falls dies nach der Verordnung (EG) Nr. 539/2001 des Rates vorgeschrieben ist, außer wenn er Inhaber eines gültigen Aufenthaltstitels oder eines gültigen Visums für den längerfristigen Aufenthalt ist;',
      b1: 'er muss im Besitz eines gültigen Visums sein, falls dies nach der Verordnung (EG) Nr. 539/2001 des Rates vorgeschrieben ist, oder im Besitz einer gültigen Reisegenehmigung, falls dies nach der Verordnung (EU) 2018/1240 vorgeschrieben ist, außer wenn er Inhaber eines gültigen Aufenthaltstitels ist;',
      c: 'er muss den Zweck und die Umstände des beabsichtigten Aufenthalts belegen;',
      s2: 'Bei der Berechnung des Zeitraums von 90 Tagen je Zeitraum von 180 Tagen wird jeder Tag einbezogen.',
    },
    fr: {
      label: 'Article 6', title: 'Conditions d\'entrée pour les ressortissants de pays tiers',
      p1: 'Pour un séjour prévu sur le territoire des États membres d\'une durée n\'excédant pas 90 jours sur toute période de 180 jours, les conditions d\'entrée pour les ressortissants de pays tiers sont les suivantes:',
      a: 'être en possession d\'un document de voyage en cours de validité autorisant son titulaire à franchir la frontière;',
      b0: 'être en possession d\'un visa en cours de validité si celui-ci est requis en vertu du règlement (CE) no 539/2001 du Conseil, sauf s\'ils sont titulaires d\'un titre de séjour en cours de validité;',
      b1: 'être en possession d\'un visa en cours de validité si celui-ci est requis en vertu du règlement (CE) no 539/2001 du Conseil, ou d\'une autorisation de voyage en cours de validité si celle-ci est requise en vertu du règlement (UE) 2018/1240, sauf s\'ils sont titulaires d\'un titre de séjour en cours de validité;',
      c: 'justifier l\'objet et les conditions du séjour envisagé;',
      s2: 'Pour le calcul de la période de 90 jours sur toute période de 180 jours, chaque jour est pris en compte.',
    },
    en: {
      label: 'Article 6', title: 'Entry conditions for third-country nationals',
      p1: 'For intended stays on the territory of the Member States of a duration of no more than 90 days in any 180-day period, the entry conditions for third-country nationals shall be the following:',
      a: 'they are in possession of a valid travel document entitling the holder to cross the border;',
      b0: 'they are in possession of a valid visa, if required pursuant to Council Regulation (EC) No 539/2001, except where they hold a valid residence permit;',
      b1: 'they are in possession of a valid visa, if required pursuant to Council Regulation (EC) No 539/2001, or of a valid travel authorisation if required pursuant to Regulation (EU) 2018/1240, except where they hold a valid residence permit;',
      c: 'they justify the purpose and conditions of the intended stay;',
      s2: 'For the purposes of calculating the 90-day period in any 180-day period, each day shall be counted.',
    },
  }[lang];
  const L1 = lang === 'de' ? ['(1)', 'a)', 'b)', 'c)'] : ['1.', '(a)', '(b)', '(c)'];
  if (lang === 'fr') L1.splice(1, 3, 'a)', 'b)', 'c)');
  const blocks = [
    blk('p1', 0, L1[0], T.p1, B),
    blk('p1.a', 1, L1[1], T.a, B),
    blk('p1.b', 1, L1[2], st >= 4 ? T.b1 : T.b0, st >= 4 ? ETIAS : B),
    blk('p1.c', 1, L1[3], T.c, B),
    blk('p1.s2', 1, '', T.s2, B),
  ];
  return { stage: st >= 4 ? 's04' : 's00', label: T.label, title: T.title, blocks };
}

// Art. 8 (Auszug)
function art8(lang, st) {
  const T = {
    de: {
      label: 'Artikel 8', title: 'Grenzübertrittskontrollen von Personen',
      p1: 'Der grenzüberschreitende Verkehr an den Außengrenzen unterliegt den Kontrollen durch die Grenzschutzbeamten. Die Kontrollen erfolgen nach Maßgabe dieses Kapitels.',
      p3: 'Bei der Einreise und Ausreise werden Drittstaatsangehörige eingehenden Kontrollen unterzogen.',
      p3a: 'Die eingehende Kontrolle bei der Einreise umfasst die Überprüfung der in Artikel 6 Absatz 1 festgelegten Einreisevoraussetzungen sowie gegebenenfalls der für den Aufenthalt und die Ausübung einer Erwerbstätigkeit erforderlichen Dokumente. Hierzu gehört eine umfassende Prüfung der folgenden Elemente:',
      i0: 'Überprüfung, ob der Drittstaatsangehörige über ein für den Grenzübertritt gültiges und nicht abgelaufenes Dokument verfügt und ob dem Dokument das gegebenenfalls erforderliche Visum oder der gegebenenfalls erforderliche Aufenthaltstitel beigefügt ist;',
      i1: 'Überprüfung, ob der Drittstaatsangehörige über ein für den Grenzübertritt gültiges und nicht abgelaufenes Dokument verfügt und ob dem Dokument das gegebenenfalls erforderliche Visum, die gegebenenfalls erforderliche Reisegenehmigung oder der gegebenenfalls erforderliche Aufenthaltstitel beigefügt ist;',
      i2: 'Feststellung, ob der Drittstaatsangehörige über ein für den Grenzübertritt gültiges und nicht abgelaufenes Dokument verfügt und ob dem Dokument das gegebenenfalls erforderliche Visum, die gegebenenfalls erforderliche Reisegenehmigung oder der gegebenenfalls erforderliche Aufenthaltstitel beigefügt ist;',
      ii0: 'eingehende Prüfung, ob das Reisedokument Anzeichen einer Fälschung oder Verfälschung aufweist;',
      ba: 'ist der Drittstaatsangehörige im Besitz einer Reisegenehmigung nach Artikel 6 Absatz 1 Buchstabe b, so umfasst die eingehende Kontrolle bei der Einreise auch die Überprüfung der Echtheit, Gültigkeit und des Status der Reisegenehmigung;',
      p3s2: 'Bei der Einreise werden die Daten im EES erfasst.',
    },
    fr: {
      label: 'Article 8', title: 'Vérifications aux frontières portant sur les personnes',
      p1: 'Les mouvements transfrontaliers aux frontières extérieures font l\'objet de vérifications de la part des garde-frontières. Les vérifications sont effectuées conformément au présent chapitre.',
      p3: 'À l\'entrée et à la sortie, les ressortissants de pays tiers sont soumis à des vérifications approfondies.',
      p3a: 'Les vérifications approfondies à l\'entrée comportent la vérification des conditions d\'entrée fixées à l\'article 6, paragraphe 1. Elles comprennent un examen détaillé des éléments suivants:',
      i0: 'la vérification que le ressortissant de pays tiers est en possession d\'un document valable et non expiré pour le franchissement de la frontière, et que ce document est accompagné, le cas échéant, du visa ou du permis de séjour requis;',
      i1: 'la vérification que le ressortissant de pays tiers est en possession d\'un document valable et non expiré pour le franchissement de la frontière, et que ce document est accompagné, le cas échéant, du visa, de l\'autorisation de voyage ou du permis de séjour requis;',
      i2: 'la vérification que le ressortissant de pays tiers est en possession d\'un document valable et non expiré pour le franchissement de la frontière, et que ce document est accompagné, le cas échéant, du visa, de l\'autorisation de voyage ou du permis de séjour requis;',
      ii0: 'l\'examen approfondi du document de voyage, à la recherche d\'indices de falsification ou de contrefaçon;',
      ba: 'si le ressortissant de pays tiers est titulaire d\'une autorisation de voyage visée à l\'article 6, paragraphe 1, point b), les vérifications approfondies à l\'entrée comportent également la vérification de l\'authenticité, de la validité et du statut de l\'autorisation de voyage;',
      p3s2: 'À l\'entrée, les données sont enregistrées dans l\'EES.',
    },
    en: {
      label: 'Article 8', title: 'Border checks on persons',
      p1: 'Cross-border movement at external borders shall be subject to checks by border guards. Checks shall be carried out in accordance with this Chapter.',
      p3: 'On entry and exit, third-country nationals shall be subject to thorough checks.',
      p3a: 'Thorough checks on entry shall comprise verification of the conditions governing entry laid down in Article 6(1). They shall include a thorough examination of the following elements:',
      i0: 'verification that the third-country national is in possession of a document which is valid for crossing the border and which has not expired, and that the document is accompanied, where applicable, by the requisite visa or residence permit;',
      i1: 'verification that the third-country national is in possession of a document which is valid for crossing the border and which has not expired, and that the document is accompanied, where applicable, by the requisite visa, travel authorisation or residence permit;',
      i2: 'verification that the third-country national is in possession of a valid, non-expired document for crossing the border, and that the document is accompanied, where applicable, by the requisite visa, travel authorisation or residence permit;',
      ii0: 'a thorough scrutiny of the travel document for signs of falsification or counterfeiting;',
      ba: 'if the third-country national holds a travel authorisation referred to in point (b) of Article 6(1), the thorough checks on entry shall also comprise the verification of the authenticity, validity and status of the travel authorisation;',
      p3s2: 'On entry, the data shall be recorded in the EES.',
    },
  }[lang];
  const lab = lang === 'de' ? { p1: '(1)', p3: '(3)', a: 'a)', ba: 'ba)', i: 'i)', ii: 'ii)' }
    : lang === 'fr' ? { p1: '1.', p3: '3.', a: 'a)', ba: 'b bis)', i: 'i)', ii: 'ii)' }
    : { p1: '1.', p3: '3.', a: '(a)', ba: '(ba)', i: '(i)', ii: '(ii)' };
  const iText = st >= 7 ? T.i2 : st >= 4 ? T.i1 : T.i0;
  const iOrig = st >= 7 ? R1717 : st >= 4 ? ETIAS : B;
  const blocks = [
    blk('p1', 0, lab.p1, T.p1, B),
    blk('p3', 0, lab.p3, T.p3, B),
    blk('p3.a', 1, lab.a, T.p3a, B),
    blk('p3.a.i', 2, lab.i, iText, iOrig, iOrig === ETIAS ? { fn: [{ n: '1', t: lang === 'de' ? 'Verordnung (EU) 2018/1240 (ABl. L 236 vom 19.9.2018, S. 1).' : lang === 'fr' ? 'Règlement (UE) 2018/1240 (JO L 236 du 19.9.2018, p. 1).' : 'Regulation (EU) 2018/1240 (OJ L 236, 19.9.2018, p. 1).' }] } : {}),
    blk('p3.a.ii', 2, lab.ii, T.ii0, B),
  ];
  if (st >= 4) blocks.push(blk('p3.ba', 1, lab.ba, T.ba, ETIAS));
  if (st >= 3) blocks.push(blk('p3.s2', 1, '', T.p3s2, EES));
  const stage = st >= 7 ? 's07' : st >= 4 ? 's04' : st >= 3 ? 's03' : 's00';
  return { stage, label: T.label, title: T.title, blocks };
}

// Art. 8a (eingefügt durch EES)
function art8a(lang) {
  const T = {
    de: ['Artikel 8a', 'Automatisierte Grenzkontrollsysteme', 'Self-Service-Systeme können für Personen verwendet werden, deren Grenzübertritt im EES zu erfassen ist.'],
    fr: ['Article 8 bis', 'Systèmes de contrôle automatisé aux frontières', 'Les systèmes en libre-service peuvent être utilisés pour les personnes dont le franchissement de la frontière doit être enregistré dans l\'EES.'],
    en: ['Article 8a', 'Automated border control systems', 'Self-service systems may be used for persons whose border crossing is to be registered in the EES.'],
  }[lang];
  return { stage: 's03', label: T[0], title: T[1], blocks: [blk('p1', 0, lang === 'de' ? '(1)' : '1.', T[2], EES)] };
}

// Art. 9: ab s01 geändert, ab s07 aufgehoben (fiktiv, für Tests)
function art9(lang, st) {
  if (st >= 7) return { stage: 's07', label: lang === 'de' ? 'Artikel 9' : lang === 'fr' ? 'Article 9' : 'Article 9', title: '', repealed: true, blocks: [] };
  const T = {
    de: ['Artikel 9', 'Lockerung der Grenzübertrittskontrollen', 'Die Grenzübertrittskontrollen an den Außengrenzen können infolge außergewöhnlicher und unvorhersehbarer Umstände gelockert werden.', 'Die Grenzübertrittskontrollen an den Außengrenzen können infolge außergewöhnlicher und unvorhersehbarer Umstände gelockert werden; die Agentur wird unterrichtet.'],
    fr: ['Article 9', 'Assouplissement des vérifications aux frontières', 'Les vérifications aux frontières extérieures peuvent faire l\'objet d\'un assouplissement en raison de circonstances exceptionnelles et imprévues.', 'Les vérifications aux frontières extérieures peuvent faire l\'objet d\'un assouplissement en raison de circonstances exceptionnelles et imprévues; l\'Agence en est informée.'],
    en: ['Article 9', 'Relaxation of border checks', 'Border checks at external borders may be relaxed as a result of exceptional and unforeseen circumstances.', 'Border checks at external borders may be relaxed as a result of exceptional and unforeseen circumstances; the Agency shall be informed.'],
  }[lang];
  return { stage: st >= 1 ? 's01' : 's00', label: T[0], title: T[1], blocks: [blk('p1', 0, lang === 'de' ? '(1)' : '1.', st >= 1 ? T[3] : T[2], st >= 1 ? M1 : B)] };
}

// Anhang V mit Tabelle
function anx5(lang, st) {
  const T = {
    de: ['ANHANG V', '', 'TEIL A', 'Verfahren für die Einreiseverweigerung an der Grenze', 'TEIL B', 'Standardformular für die Einreiseverweigerung an der Grenze', ['Grund', 'Kürzel'], [['kein gültiges Reisedokument', 'A'], ['kein gültiges Visum', 'C'], ['keine gültige Reisegenehmigung', 'C']]],
    fr: ['ANNEXE V', '', 'PARTIE A', 'Modalités de refus d\'entrée à la frontière', 'PARTIE B', 'Formulaire uniforme de refus d\'entrée à la frontière', ['Motif', 'Code'], [['pas de document de voyage valable', 'A'], ['pas de visa valable', 'C'], ['pas d\'autorisation de voyage valable', 'C']]],
    en: ['ANNEX V', '', 'PART A', 'Procedures for refusing entry at the border', 'PART B', 'Standard form for refusal of entry at the border', ['Reason', 'Code'], [['no valid travel document', 'A'], ['no valid visa', 'C'], ['no valid travel authorisation', 'C']]],
  }[lang];
  const rows = st >= 4 ? T[7] : T[7].slice(0, 2);
  const html = `<table><thead><tr><th>${T[6][0]}</th><th>${T[6][1]}</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</tbody></table>`;
  const tt = rows.map(r => r.join(' ')).join(' | ');
  return {
    stage: st >= 4 ? 's04' : 's00', label: T[0], title: '',
    blocks: [
      blk('ptA', 0, T[2], T[3], B, { ty: 'heading' }),
      blk('ptA.n1', 1, '1.', lang === 'de' ? 'Bei der Einreiseverweigerung füllt der zuständige Grenzschutzbeamte das Standardformular aus.' : lang === 'fr' ? 'En cas de refus d\'entrée, le garde-frontière compétent remplit le formulaire uniforme.' : 'In the event of refusal of entry, the competent border guard shall fill in the standard form.', B),
      blk('ptB', 0, T[4], T[5], B, { ty: 'heading' }),
      blk('ptB.t1', 1, '', tt, st >= 4 ? ETIAS : B, { ty: 'table', html }),
      blk('ptB.g1', 1, '', lang === 'de' ? 'Formular (Abbildung)' : lang === 'fr' ? 'Formulaire (image)' : 'Form (image)', B, { ty: 'img', asset: 'fx01' }),
    ],
  };
}

const units = {};
function addUnit(id, type, num, fn, stagesFor) {
  const versions = {};
  for (const lang of L) {
    const list = [];
    let prev = null;
    for (const st of stagesFor) {
      const v = fn(lang, st);
      const sig = JSON.stringify({ ...v, stage: 0 });
      if (sig !== prev) { list.push(v); prev = sig; }
    }
    versions[lang] = list;
  }
  units[id] = { id, type, num, versions };
}
const ALL = [0, 1, 3, 4, 7];
addUnit('art_6', 'article', '6', art6, ALL);
addUnit('art_8', 'article', '8', art8, ALL);
addUnit('art_8a', 'article', '8a', art8a, [3, 4, 7]);
addUnit('art_9', 'article', '9', art9, ALL);
addUnit('anx_V', 'annex', 'V', anx5, ALL);

const H = (id, type, parent, num, de, fr, en) => ({ id, type, parent, num, heading: { de: [{ from: 's00', ...de }], fr: [{ from: 's00', ...fr }], en: [{ from: 's00', ...en }] } });
const toc = [
  H('tit_II', 'title', null, 'II', { label: 'TITEL II', text: 'AUSSENGRENZEN' }, { label: 'TITRE II', text: 'FRONTIÈRES EXTÉRIEURES' }, { label: 'TITLE II', text: 'EXTERNAL BORDERS' }),
  H('tit_II.cha_I', 'chapter', 'tit_II', 'I', { label: 'KAPITEL I', text: 'Überschreiten der Außengrenzen und Einreisevoraussetzungen' }, { label: 'CHAPITRE I', text: 'Franchissement des frontières extérieures et conditions d\'entrée' }, { label: 'CHAPTER I', text: 'Crossing of external borders and conditions for entry' }),
  { id: 'art_6', type: 'article', parent: 'tit_II.cha_I', num: '6', from: 's00', to: null },
  H('tit_II.cha_II', 'chapter', 'tit_II', 'II', { label: 'KAPITEL II', text: 'Kontrolle der Außengrenzen und Einreiseverweigerung' }, { label: 'CHAPITRE II', text: 'Contrôle aux frontières extérieures et refus d\'entrée' }, { label: 'CHAPTER II', text: 'Control of external borders and refusal of entry' }),
  { id: 'art_8', type: 'article', parent: 'tit_II.cha_II', num: '8', from: 's00', to: null },
  { id: 'art_8a', type: 'article', parent: 'tit_II.cha_II', num: '8a', from: 's03', to: null },
  { id: 'art_9', type: 'article', parent: 'tit_II.cha_II', num: '9', from: 's00', to: 's07' },
  { id: 'anx_V', type: 'annex', parent: null, num: 'V', from: 's00', to: null },
];

const dataset = {
  schema: 1, generated: '2026-11-11', fixture: true,
  work: {
    id: 'sgk', celex: B, eli: 'http://data.europa.eu/eli/reg/2016/399',
    title: tri('Verordnung (EU) 2016/399 des Europäischen Parlaments und des Rates vom 9. März 2016 über einen Gemeinschaftskodex für das Überschreiten der Grenzen durch Personen (Schengener Grenzkodex)', 'Règlement (UE) 2016/399 du Parlement européen et du Conseil du 9 mars 2016 concernant un code de l\'Union relatif au régime de franchissement des frontières par les personnes (code frontières Schengen)', 'Regulation (EU) 2016/399 of the European Parliament and of the Council of 9 March 2016 on a Union Code on the rules governing the movement of persons across borders (Schengen Borders Code)'),
    short: tri('Schengener Grenzkodex', 'Code frontières Schengen', 'Schengen Borders Code'),
    abbr: tri('SGK', 'CFS', 'SBC'),
  },
  langs: L, stages, toc, units,
};

const act = (o) => ({ langs: null, confidence: 'verified', checkNote: null, sources: [], changes: [], ...o });
const acts = [
  act({ celex: B, kind: 'base', number: '(EU) 2016/399', topic: tri('Basis', 'Base', 'Base'), title: dataset.work.title, adopted: '2016-03-09', published: '2016-03-23', oj: tri('ABl. L 77 vom 23.3.2016, S. 1', 'JO L 77 du 23.3.2016, p. 1', 'OJ L 77, 23.3.2016, p. 1'), inForce: '2016-04-12', application: { status: 'applicable', date: '2016-04-12', basis: tri('Art. 46', 'art. 46', 'Article 46'), note: null, details: [] }, eurlex: 'https://eur-lex.europa.eu/eli/reg/2016/399/oj' }),
  act({ celex: M1, kind: 'amendment', number: '(EU) 2016/1624', topic: tri('Frontex', 'Frontex', 'Frontex'), title: tri('Verordnung (EU) 2016/1624 über die Europäische Grenz- und Küstenwache', 'Règlement (UE) 2016/1624 relatif au corps européen de garde-frontières et de garde-côtes', 'Regulation (EU) 2016/1624 on the European Border and Coast Guard'), adopted: '2016-09-14', published: '2016-09-16', oj: tri('ABl. L 251 vom 16.9.2016, S. 1', 'JO L 251 du 16.9.2016, p. 1', 'OJ L 251, 16.9.2016, p. 1'), inForce: '2016-10-06', application: { status: 'applicable', date: '2016-10-06', basis: tri('Art. 82', 'art. 82', 'Article 82'), note: null, details: [] }, changes: [{ unit: 'art_9', key: 'p1', action: 'replaced', applicableFrom: null }] }),
  act({ celex: EES, kind: 'amendment', number: '(EU) 2017/2225', topic: tri('EES', 'EES', 'EES'), title: tri('Verordnung (EU) 2017/2225 zur Änderung der Verordnung (EU) 2016/399 in Bezug auf die Nutzung des Einreise-/Ausreisesystems', 'Règlement (UE) 2017/2225 modifiant le règlement (UE) 2016/399 en ce qui concerne l\'utilisation du système d\'entrée/de sortie', 'Regulation (EU) 2017/2225 amending Regulation (EU) 2016/399 as regards the use of the Entry/Exit System'), adopted: '2017-11-30', published: '2017-12-09', oj: tri('ABl. L 327 vom 9.12.2017, S. 1', 'JO L 327 du 9.12.2017, p. 1', 'OJ L 327, 9.12.2017, p. 1'), inForce: '2017-12-29', application: { status: 'applicable', date: '2025-10-12', basis: tri('Art. 2 Abs. 2 der VO (EU) 2017/2225 i. V. m. Durchführungsbeschluss (EU) 2025/1544', '', ''), note: tri('Anwendbar ab Inbetriebnahme des EES.', '', ''), details: [] }, changes: [{ unit: 'art_8', key: 'p3.s2', action: 'inserted', applicableFrom: null }, { unit: 'art_8a', key: null, action: 'inserted', applicableFrom: null }] }),
  act({ celex: ETIAS, kind: 'amendment', number: '(EU) 2018/1240', topic: tri('ETIAS', 'ETIAS', 'ETIAS'), title: tri('Verordnung (EU) 2018/1240 über die Einrichtung eines Europäischen Reiseinformations- und -genehmigungssystems (ETIAS)', 'Règlement (UE) 2018/1240 portant création d\'un système européen d\'information et d\'autorisation concernant les voyages (ETIAS)', 'Regulation (EU) 2018/1240 establishing a European Travel Information and Authorisation System (ETIAS)'), adopted: '2018-09-12', published: '2018-09-19', oj: tri('ABl. L 236 vom 19.9.2018, S. 1', 'JO L 236 du 19.9.2018, p. 1', 'OJ L 236, 19.9.2018, p. 1'), inForce: '2018-10-09', application: { status: 'pending', date: null, basis: tri('Art. 88 der VO (EU) 2018/1240', '', ''), note: tri('Anwendbar ab einem von der Kommission festgelegten Datum.', '', ''), details: [] }, amendingProvision: tri('Art. 80', 'art. 80', 'Article 80'), changes: [{ unit: 'art_6', key: 'p1.b', action: 'replaced' }, { unit: 'art_8', key: 'p3.a.i', action: 'replaced' }, { unit: 'art_8', key: 'p3.ba', action: 'inserted' }, { unit: 'anx_V', key: 'ptB', action: 'amended' }] }),
  act({ celex: R1717, kind: 'amendment', number: '(EU) 2024/1717', topic: tri('Reform', 'Réforme', 'Reform'), title: tri('Verordnung (EU) 2024/1717 zur Änderung der Verordnung (EU) 2016/399', 'Règlement (UE) 2024/1717 modifiant le règlement (UE) 2016/399', 'Regulation (EU) 2024/1717 amending Regulation (EU) 2016/399'), adopted: '2024-06-13', published: '2024-06-20', oj: tri('ABl. L, 2024/1717, 20.6.2024', 'JO L, 2024/1717, 20.6.2024', 'OJ L, 2024/1717, 20.6.2024'), inForce: '2024-07-10', application: { status: 'applicable', date: '2024-07-10', basis: tri('Art. 3', 'art. 3', 'Article 3'), note: null, details: [] }, changes: [{ unit: 'art_8', key: 'p3.a.i', action: 'replaced' }, { unit: 'art_9', key: null, action: 'deleted' }] }),
  act({ celex: '32025R1534', kind: 'derogation', number: '(EU) 2025/1534', topic: tri('EES-Start', 'EES début', 'EES start'), title: tri('Verordnung (EU) 2025/1534 über vorübergehende Abweichungen (schrittweise Inbetriebnahme EES)', '', ''), adopted: '2025-07-18', published: '2025-07-25', oj: tri('ABl. L, 2025/1534', '', ''), inForce: '2025-07-26', application: { status: 'applicable', date: '2025-10-12', basis: null, note: tri('Ändert den Text des SGK nicht.', '', ''), details: [] } }),
  act({ celex: '52024PC0670', kind: 'proposal', number: 'COM(2024) 670', topic: tri('Digitalisierung', 'Numérisation', 'Digitalisation'), title: tri('Vorschlag zur Digitalisierung von Reisedokumenten', 'Proposition relative à la numérisation des documents de voyage', 'Proposal on the digitalisation of travel documents'), adopted: null, published: '2024-10-08', oj: null, inForce: null, application: { status: 'pending', date: null, basis: null, note: tri('Im Gesetzgebungsverfahren.', '', ''), details: [] } }),
];

// Kleines PNG als Beispielbild
const png = 'iVBORw0KGgoAAAANSUhEUgAAAPAAAAB4CAYAAADMtn8nAAAACXBIWXMAAAsTAAALEwEAmpwYAAALfklEQVR4nO1b+VtURxbN/zSTmckkM5NEo0YTjVFQUIkibqgIERUVcUNRcTdK3JWIC+64Ro1GXGIkkZgMxiXEfcWFikzqx5rvXHnt60eDSANd/dX54XwfXf36Lefec27VrccbqRm5ZunqEoIcMAdWxxcH0O4b+EPVaYIcMAfq4osDaJcCtiAQBDlQFDCTgEagneKAFdiCIBDkQFHATAIagXaOA1ZgC4JAkANFATMJaATaOQ5YgS0IAkEOFAXMJKARaOc4YAW2IAgEOVAUMJOARqCd44AV2IIgEORAUcBMAhqBdo4DVmALgkCQA0UBMwloBNo5DliBLQgCQQ4UBcwkoBFo5zhgBbYgCAQ5UBQwk4BGoJ3jgBXYgiAQ5EBRwEwCGoF2jgNWYAuCQJADRQEzCWgE2jkOWIEtCAJBDhQFzCSgEWjnOGAFtiAIBDlQFDCTgEagneOAFdiCIBDkQFHATAIagXaOA1ZgC4JAkANFATMJaATaOQ5YgS0IAkEOFAXMJKARaOc4YAW2IAgEOVAUMJOARqCd44AV2IIgEORAUcBMAhqBdo4DVmALgkCQA0UBMwloBNo5DliBLQgCQQ4UBcwkoBFo5zhgBbYgCAQ5UBQwk4BGoJ3jgBXYgiAQ5EBRwEwCGoF2jgNWYAuCQJADRQEzCWgE2jkOWIEtCAJBDhQFzCSgEWjnOGAFjgOUlh0xI7JnmAc1T2N+L4R2Q8A1z/4wdx48aRSPnqiYP3w0z/Xs+Z/tcj3w1Kl3msmcPCc09rj2ebO4rX3+pyku3We+OXU+5ry1BFt2HzY9+o0y1TfuxvxelGsC3ritzPzl/d6Noi2u2R5Yt2WP3H/Vtevtcr3tZUfleifOVITGtu090iS385atk+Mqq67K546fprbIqCp++tXcuPMwZlzfvPvIvNUlycxcsDLmcVeuCnju0rWmZMfBBkByxPrh40HAoybMMu92/8w8VXUNBIzEjsTtdz/8IsdhloD7PXzi7Gtf9/JvN+Uaa0p2x5Tv7KnzzTvdBsTtjE3Fu4DLz12I+UPGq4BRBd/qnGQmTF8YNu4JuCXCjDcB7z38rdzHgWOnYx57ZSGsEDCmSrMWrTYfJaeb93oMNAPSc6RxEzxuePYMueF9R0+ZXgMzzX8+TjG37tXId5m5c82cJWvMqfM/mT5pY80/P0w2qRlTzLXrd2RdOHnWEjk3kDt7qYx557378LFJGpot1St4zZwZi+S3TQkY1WHJqk2m96As8273FNOj/yizoGhjg6ZTSnqOWb1pl9mx75j5ZMBouX9/ZQ3ifGWVXGtjaVmLBQwOFq38Sv5+UltnRufMloYYzOHl/deaIVnTzNi8Qqnay9ZskWfBNTonDhVuMJXHsZu275fP9wPPduGXyzJ+rPz70NjoibPN/BUb5D4TUj+X5/XWs8/++J9wiVghJsnDxgmHNU9f3hcADt/smGimzlsec7EoCxFzAd++X2O69xspgptSsEySZ+DISaHpt/9YNHNeiLOfCDZv7vJQIvVMyTDJw8bLuRYWFctvMfVCYqZm5JohWVPNinXbTFbuXDn3uGkLQueFCTS2LkdiwVAaEzAE2H/EBEmy7LxCU7S+1OQWLDN/+6CPCMV/LqzncL63u/YTseB5kciNcVOy44Bc62z9lLglAoZoYELe56Mnz5m/dkgQsXhjBUvWmDc7JIj54fO+I+Vm6rwVco20zDxTuHyDKT9XKd8tXrVJxv0GCJypuCjjuw8eD43BkBMHj5XnzZxcIPHyDDdn5iI5fuSEfOH98ynz5L4Gj8lrwAnMpO+Q7JiLRbkoYAQU0zE/rv5+O3QcEgWBO11xMTSGAGLaiPHvL1SFCfgfnfpKZQpeDwLGdPPStRuhsZ0HvpF7gHj9x46ZVCDnQUWKVsBXqm9L8m3d83XY7wq/WC/H+Z8VAn6na3/z8+XqZgZns5wj2IX1BLx516EG3OJ+mhIwACHh+fEMlf+9IuYDETdnCv26AoaR+WPrmQiOXVm8M2x8fT23iJt/fGL+YvP3Tn2aNDvlKGLShf6g12A5BgH590cpDSoVgKRFVcDU2i9gOHSk63kV2D9WdfX6i0TZuD1s/MsN22X8SvWtqAXc6POXvnh+r6p5AkYlai6H+QtXyTkwxfWPN9WFhkG8SsCYlnZLGi7VD8sSTOeDTaLWErCfOw/jpy+QznhwKw758K9uA8QQ/eOYhuPcXvUmdPsJGOcu+/pkGA4dPyPHYH2KY/zTOT+6JA6VKZxfwJg6NyZgTJf9Y6jGOP/azXvCxld9tVPGvWodrYCR/HsOnTAz56+Ue+iWNELMB8ed/O7HMAHnzfmi2RxiGYBz3Hv0JKKAkdhBbvcfPf1KAQNY2mCGg+obnKK3poDTx+c3OHdi2ov1MLgKAsueoBGvLN7Rrp1/FUeI6Rr41/okwbox0vdoBg0aNdlqAaOKo9EDwaakT5QlwdqS3Wb52q1RCxi8+O+zNdbAHtDVxTkwlUYDqj0F3OuzMTILQ2MqErB0CCYpzv3bzXsxE4qyFDEVMCoXEghrnOB3Dx/XyprW/11bCRhTSnzGujV4Xkw1mxJwweLVDabK/vV3NAKGQHEOVNbWFDC6/h17pkp3PXV0rkkYlBXWlW5KwJ4xBcV0sN4QmiPgEeNmms6905rNA9bsMMjgPRI69l1oBBhd5WCjBtst+P3+I+VtLmCgQ89B0k3G64fe2PnKSzLNbErASC500IMNFnS5oxUwhBbsA7SGgPFaJtbK1bfuy9taaDR5b2958JY3mL76x3cdOB6x0eR1lZsjYLzeGWlvF0sFLENQzf3j2HmAyVCw2j4BX/j5iiQ2Kh2Cj+Bh3xKJi+rgF0ZbChhbPxhDkwlJisT9ODndfJqS0aSAvRcNMFNAt/X46QqpbHh7KloBA9gC65IwJKzhE42AsQeN327Yujc0hj1r8O1tFQHgHb/FehXr6ouXrsn49dsPZFsIzUdM8cEVzAocNVfAmHlBkDBubBsiR7C3L9txHRLCOMPyBgYzvbCIAq6zUMAAEt97cQDAlgEEEXxZoC0FjGuhiuDa+A6G8u3ZH+VFiFc1sRZ+WSzTfe/+sW2FF/FbQ8Bb689z4swPUQsYsxx8Rl/Bbwh4eQL8de07PKxhhmnx+58MlGtNyn/5Mgtiiv4ExiE47H+/zhrYm11gTx5NNI83GGawCefthfvNhdBtL+CWAHuYqMjBrmt7AnvDLXmBHwaAZhCmnq15P1j3fdhnmLxBFQs+sKQAH5H2YO88eNxgi+t1gbfgEHPwFuk/vGCeeDnHv7QhtJ0CJiJzgEo7rbAoarHEG7C9heob6bVaQlPATAK7hYDlB5qZfAOrcY5YgS1IVIIcqBZyQAEzeWggdfHLAQVsQRAIcqAoYCYBjUA7xwErsAVBIMiBooCZBDQC7RwHrMAWBIEgB4oCZhLQCLRzHLACWxAEghwoCphJQCPQznHACmxBEAhyoChgJgGNQDvHASuwBUEgyIGigJkENALtHAeswBYEgSAHigJmEtAItHMcsAJbEASCHCgKmElAI9DOccAKbEEQCHKgKGAmAY1AO8cBK7AFQSDIgaKAmQQ0Au0cB6zAFgSBIAeKAmYS0Ai0cxywAlsQBIIcKAqYSUAj0M5xwApsQRAIcqAoYCYBjUA7xwErsAVBIMiBooCZBDQC7RwHrMAWBIEgB4oCZhLQCLRzHLACWxAEghwoCphJQCPQznHACmxBEAhyoChgJgGNQDvHASuwBUEgyIGigJkENALtHAeswBYEgSAHigJmEtAItHMcsAJbEASCHCgKmElAI9DOccAKbEEQCHKgKGAmAY1AO8cBK7AFQSDIgaKAmQQ0Au0cB6zAFgSBIAeKAmYS0Ai0cxywAlsQBIIcKAqYSUAj0M5xwApsQRAIcqCiEXBqRq78QZAD5kBJXHEA7f4fKMSEZRYqXlIAAAAASUVORK5CYII=';
const assets = { fx01: { mime: 'image/png', data: png, w: 240, h: 120 } };

writeFileSync(join(here, 'dataset.json'), JSON.stringify(dataset, null, 1));
writeFileSync(join(here, 'acts.json'), JSON.stringify(acts, null, 1));
writeFileSync(join(here, 'assets.json'), JSON.stringify(assets));
console.log('Fixtures geschrieben:', Object.keys(units).length, 'Einheiten');
