// SGK-Navigator — Verzeichnis der weiteren Werke (Etappe 3) und redaktionelle Kurzbezeichnungen der Akte.
// Ein weiteres Werk kommt hinzu, indem hier ein Eintrag ergaenzt und `node scripts/build-work.mjs <id> <celex>` ausgefuehrt wird
// (Einzelheiten im Kopf von scripts/build-work.mjs). Amtliche Titel kommen NICHT von hier, sondern aus Cellar (SPARQL, wörtlich).

export const LANGS = ['de', 'fr', 'en'];

// Reihenfolge = Reihenfolge in data/works/index.json (nach dem SGK)
export const WORKS = {
  ees: {
    celex: '32017R2226', number: '(EU) 2017/2226',
    short: { de: 'Einreise-/Ausreisesystem (EES)', fr: 'Système d’entrée/de sortie (EES)', en: 'Entry/Exit System (EES)' },
    abbr: { de: 'EES-VO', fr: 'règlement EES', en: 'EES Regulation' },
  },
  etias: {
    celex: '32018R1240', number: '(EU) 2018/1240',
    short: { de: 'Europäisches Reiseinformations- und -genehmigungssystem (ETIAS)', fr: 'Système européen d’information et d’autorisation concernant les voyages (ETIAS)', en: 'European Travel Information and Authorisation System (ETIAS)' },
    abbr: { de: 'ETIAS-VO', fr: 'règlement ETIAS', en: 'ETIAS Regulation' },
  },
  vis: {
    celex: '32008R0767', number: '(EG) Nr. 767/2008',
    short: { de: 'Visa-Informationssystem (VIS)', fr: 'Système d’information sur les visas (VIS)', en: 'Visa Information System (VIS)' },
    abbr: { de: 'VIS-VO', fr: 'règlement VIS', en: 'VIS Regulation' },
  },
  iop: {
    celex: '32019R0817', number: '(EU) 2019/817',
    short: { de: 'Interoperabilität (Grenzen und Visa)', fr: 'Interopérabilité (frontières et visas)', en: 'Interoperability (borders and visa)' },
    abbr: { de: 'IO-VO', fr: 'règlement IO', en: 'IO Regulation' },
  },
};

// Kurzbezeichnung (1–3 Wörter) fuer Chips und Legenden; redaktionell, aus dem amtlichen Titel abgeleitet.
// Berichtigungen erhalten "Berichtigung <Thema des berichtigten Akts>".
export const TOPICS = {
  '32008R0767': { de: 'VIS', fr: 'VIS', en: 'VIS' },
  '32009R0810': { de: 'Visakodex', fr: 'code des visas', en: 'Visa Code' },
  '32013R0610': { de: 'Schengen-Anpassungen 2013', fr: 'adaptations Schengen 2013', en: 'Schengen adjustments 2013' },
  '32017R2226': { de: 'EES', fr: 'EES', en: 'EES' },
  '32018R1240': { de: 'ETIAS', fr: 'ETIAS', en: 'ETIAS' },
  '32019R0817': { de: 'Interoperabilität', fr: 'interopérabilité', en: 'interoperability' },
  '32021R1134': { de: 'VIS-Revision', fr: 'Révision du VIS', en: 'VIS revision' },
  '32021R1152': { de: 'ETIAS-Zugang', fr: 'accès ETIAS', en: 'ETIAS access' },
  '32023R2667': { de: 'Digitalisierung Visa', fr: 'numérisation visas', en: 'visa digitalisation' },
  '32024R0982': { de: 'Prüm II', fr: 'Prüm II', en: 'Prüm II' },
  '32024R1356': { de: 'Überprüfung', fr: 'filtrage', en: 'screening' },
  '32024R1358': { de: 'Eurodac', fr: 'Eurodac', en: 'Eurodac' },
  '32025R0012': { de: 'API-Daten', fr: 'données API', en: 'API data' },
  '32025R1411': { de: 'ETIAS-Gebühr', fr: 'droits ETIAS', en: 'ETIAS fee' },
};

export const CORR_WORD = { de: 'Berichtigung', fr: 'Rectificatif', en: 'Corrigendum' };
