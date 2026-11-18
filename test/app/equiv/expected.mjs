// Erklärbare, gewollte Unterschiede zwischen Upload und zentralem Build (Begründung: data/STATUS_VERGLEICH_UPDATES.md).

// Stand-Metadaten, die der zentrale Build aus Zusatzwissen setzt und ein Upload nicht kennt:
//   act    zentral: Änderungsakt bzw. Berichtigung des Stands (SGK s08: 32024R1717R(01); Werke: erster neu gelisteter Akt);
//          Upload: CELEX der konsolidierten Fassung (Oberfläche: «Konsolidierte Fassung vom …», keine neuen Akte genannt)
//   acts   zentral: neu eingearbeitete Akte (Modifikatorenliste und Marker); Upload: keine
//   source.note  zentral: Erläuterung der Quelle (DE/FR/EN); Upload: keine
export const EXPLAINED_META = ['act', 'acts', 'source.note'];

// Bekannte Fehler im zentralen Datensatz (nicht im Upload): bleiben ausgenommen, bis der Datensatz neu gebaut ist.
//   IO-VO s05 Art. 24: doppelte Schlüssel p3.b, p3.c in Abs. 2a (DE, FR, EN; Schlüsselabgleich von buildDataset ordnet die neuen
//   Bst. b und c von Abs. 2a den unveränderten Bst. b und c von Abs. 3 zu). Der Upload führt korrekt p2a.b, p2a.c.
export const KNOWN_CENTRAL = [
  { work: 'iop', stage: 's05', unit: 'art_24', why: 'doppelte Schlüssel p3.b/p3.c im zentralen Datensatz' },
];

export const isKnown = (work, stage, x) => KNOWN_CENTRAL.some((k) => k.work === work && k.stage === stage && k.unit === x.unit);
