# Formulare und Schilder als Text (data/forms.json)

Agent BEGRÜNDUNG, Etappe 3, Erweiterung 9. Stand 2026-11-12. Transkription, nicht amtlich.

## Ergebnis in Zahlen

- 69 Einträge (Einheit × Bild-Schlüssel × Sprache × Bildfassung), 63 verschiedene Bilder aus `data/assets.json`, 399 Textblöcke.
- Abgedeckt: alle Bild-Blöcke des Datensatzes in allen Ständen und Sprachen (maschinell geprüft: jeder Bild-Block jedes Stands hat genau einen Eintrag).
  Das sind Anhang III (Schilder Teil A, B1, B2, C1–C9, D1–D3, E), Anhang V Teil B (Einreiseverweigerung, Fassung 2016 und Fassung nach EES),
  Anhang VIII (Bestätigung bei fehlendem Stempel) und Anhang XII Teil B (Überstellung, seit 2024/1717). Weitere Bild-Blöcke gibt es im Datensatz nicht.
- 9 Einträge ohne Schrift (`noText: true`): Piktogramme Anhang III Teil D1–D3 (g1), je DE/FR/EN dasselbe Bild.
- `[unleserlich]`: 0. Alle Bilder waren in Originalauflösung lesbar.

## Methode

1. Bilder: `scripts/forms/extract-images.mjs` dekodiert die Assets und extrahiert die Originale in voller Auflösung aus `raw/32016R0399_*.html`
   und `raw/02016R0399-20240710_*.html` und `raw/02016R0399-20251012_*.html` (Anhang V EES: 2843 px breit statt 1050 px im Asset), dazu den verborgenen EUR-Lex-Bildtext.
   Zuordnung Bild → Einheit, Schlüssel, Sprache, Stände aus `data/dataset.json` (`getVersion` je Stand), nicht von Hand.
2. Lesen: Originale in Streifen bzw. Ausschnitten (`scripts/forms/sheet.mjs`, sharp) mit dem Read-Werkzeug gelesen; Kleinschrift, Akzente,
   Apostrophe und Kursivsatz in Ausschnitten bis 6-fach vergrössert. Ausschnitte mit voller Zeilenbreite werden vom Werkzeug verkleinert;
   Akzente wurden deshalb an engen Ausschnitten geprüft (Beispiel: «l'État» in Anhang VIII FR erschien in einem breiten Ausschnitt als «Etat»).
3. Zwei unabhängige Lesungen: Lesung 1 (`scripts/forms/pass1.json`, Vorgänger vor dem Unterbruch) und Lesung 2 (`scripts/forms/pass2.json`,
   nach Wiederaufnahme frisch gelesen, ohne Einsicht in Lesung 1). Abgleich `scripts/forms/compare.mjs` über die Blockfolge (Ausrichtung nach Textähnlichkeit,
   weil die Lesungen verschieden nummerieren) → `scripts/forms/work/compare.json`. Entscheide am Bild: `scripts/forms/decisions.json`.
4. Aufbau: `scripts/forms/build.mjs` (Lesung 2 + Korrekturen + Gestaltungshinweise) → `data/forms.json` (atomar ersetzt).
5. Prüfung: `scripts/forms/verify.mjs`, Tests `test/core/rationale-forms.test.mjs`.

## Darstellungsregeln

- Schlüssel `f…` stabil über Sprachen und Fassungen: Formularzeilen `f1`, `f2` …, Gründe `fA` … `fJ` (Buchstabe des Formulars), Unterpunkte `fH.n1`, `fJ.n1`,
  Unterabsätze `fE.s1`, `f20.s1`, Fussnote `fn1`. Schilder: `f1` (Kürzel bzw. linker Teil), `f2` (Bezeichnung bzw. rechter Teil).
- `l`: Ankreuzfeld als «☐», Buchstabe wie im Bild («☐ (A)»); Fussnotenzeichen «(<sup>1</sup>)».
- Ausfülllinien und Punktlinien als «…» mit Leerzeichen; Länge und Lage der Linien sind nicht wiedergegeben.
- Schilder: Zeilenumbrüche als `<br>`, Silbentrennung wie im Bild («VISUMPFLICH-<br>TIG»). Fliesstext der Formulare: Zeilenumbrüche nicht wiedergegeben,
  Trennstriche am Zeilenende aufgelöst («KURZFRISTI-/GEN» → «KURZFRISTIGEN», «l’efface-/ment» → «l’effacement»); echte Bindestriche bleiben («Herkunfts- oder», «-bedingungen»).
- Kursiv `<i>` nur, wo im Bild kursiv gesetzt. Apostrophe wie im Bild (’ und ' kommen gemischt vor). «ß» wie im Bild (Rechtstext).
- Änderungsmarker der konsolidierten Fassung im Bild (▶(1) … ◀, ▶(2) … ◀) sind nicht im Text; sie sind im Gestaltungshinweis beschrieben.
- Auffälligkeiten der Quelle unverändert, je Eintrag unter `sic` ausgewiesen (siehe unten). Keine Ergänzung, keine Übersetzung aus anderer Sprache.

## Fassungen und Vergleich

- Anhang V Teil B: Bild 2016 (s00–s02) und Bild nach VO (EU) 2017/2225 (ab s03; DE bis s08, FR/EN bis s07). Vergleich maschinell je Sprache:
  30 Blöcke unverändert, 0 geändert, 0 entfallen, neu `fJ`, `fJ.n1`, `fJ.n2` (Grund J, biometrische Daten) und `f20.n1`, `f20.s1`, `f20.s2` (EES-Hinweise unter «Bemerkungen»).
- Ab Stand s04 ersetzt Art. 80 Nr. 3 der VO (EU) 2018/1240 den Grund (C). EUR-Lex hat das Bild nicht angepasst; der Datensatz führt den neuen Wortlaut als Textblock `anx_V ptB.c`.
  In `data/forms.json` steht dazu `superseded: [{ k: "fC", by: { unit: "anx_V", key: "ptB.c" }, from: "s04", celex: "32018R1240" }]`.
- Anhang VIII: ein Bild über alle Stände. Die Fassung vom 12.10.2025 auf EUR-Lex enthält eine neu gerasterte Datei in doppelter Auflösung (Hashes 8c9b4d64…, 01ec6377…, 83ec4e60…,
  nicht in `assets.json`); mittlere Grauwertabweichung zum Bild 2016 1,3–1,5 von 255, Titel FR, Zeile «remise â» FR und Absatz EN in der neuen Datei gelesen: gleicher Wortlaut.
- Anhang III: je Schild eine Fassung (Teil A–C seit 2016, Teil D und E seit 2017/2225).

## Abgleich der zwei Lesungen

`node scripts/forms/compare.mjs`: Blöcke Lesung 1: 405, Lesung 2: 399. Text gleich: 382 Paare (davon 372 auch in der Auszeichnung gleich).

| Abweichung | Anzahl | Klärung |
|---|---|---|
| FR Anhang V, Grund (F): Lesung 1 «à déjà», Lesung 2 «a déjà» | 2 (2016 und EES) | Bild 4-fach vergrössert: «à déjà» (Fehler der Quelle). Lesung 1 richtig; korrigiert über `decisions.json`; als `sic` ausgewiesen. Bestätigt durch verborgenen Bildtext. |
| Fussnotenzeichen (1): eigener Block (Lesung 1) oder am Ende von f2 (Lesung 2) | 9 Text + 9 nur Lesung 1 | Gliederungsfrage, kein Wortlaut. Lesung 2 (Zeichen gehört zum Emblem). |
| Anhang III Teil D1 g2: ein Block mit Umbruch (Lesung 1) oder zwei Blöcke (Lesung 2) | 3 Text + 3 nur Lesung 2 | Gliederung wie Teil A übernommen (Lesung 2). |
| Kursivumfang EN Anhang V f13 («force),») und f21 («(each … appeal).») | 4 | Bild vergrössert: Komma nach «force)» kursiv; in f21 öffnende Klammer gerade, schliessende kursiv. Lesung 2. |
| Leerzeichen an Ausfülllinien (FR «… ,», EN Anhang XII «Code)…», «Surname…») | 6 | Darstellungsregel (« … »), kein Wortlaut. |

Damit wich Lesung 2 an 1 Stelle (in 2 Bildfassungen) im Wortlaut vom Bild ab, Lesung 1 an keiner Stelle; in der Auszeichnung (Kursivumfang) wich Lesung 1 an 4 Stellen ab.

## Gegenprüfungen (ausgeführt mit `node scripts/forms/verify.mjs`)

1. Verborgener EUR-Lex-Bildtext (24 Bilder mit Bildtext in `raw/`, davon 21 verschiedene in `data/forms.json` verglichen, wortweise):
   - Anhang V 2016 DE/FR/EN, Anhang VIII DE/FR/EN, Anhang III D1–D3 (g2) und E (je DE/FR/EN): keine Abweichung im Wortlaut. Unterschiede nur
     (a) zusammengezogene Wörter an Ausfülllinien im Bildtext («Arterteilt», «typeissued», «àSexe»), (b) «I’Union» im Bildtext FR (grosses I statt l; Bild zeigt «l’Union»).
     Apostrophformen (’ / ') in FR Anhang V und VIII: gleich wie im Bildtext.
   - Anhang V nach EES (DE/FR/EN): der Bildtext enthält weder Grund (J) noch die EES-Hinweise, d. h. er gibt das Formular von 2016 wieder (bestätigt den Befund der früheren Prüfung).
     Alle übrigen Wörter gleich.
2. Wortlaut des Änderungsakts VO (EU) 2017/2225 (Art. 1 Nr. 3 Bst. b, Text statt Bild, `raw/32017R2225_*.html`): Grund (J) mit Unterpunkten und die drei EES-Hinweise
   in DE, FR, EN wortgleich mit der Transkription (21/21, 81/81, 24/24, 96/96, 25/25, 96/96 Wörter). Die Kästchen erscheinen im Akt als Zeichen U+F106.
3. Bilder der Amtsblattfassung der Änderungsakte: Schilder Anhang III D1–D3 und E aus `raw/32017R2225_*.html` gelesen: gleicher Text wie die konsolidierten Bilder.
   Anhang XII Teil B aus `raw/32024R1717_*.html`: dasselbe Bild in halber Auflösung (zeilenweise mittlere Abweichung höchstens 2,9 von 255).
4. Schildtext gegen Überschrift im Datensatz (Anhang III Teil B1, B2, E; DE/FR/EN): 9 von 9 gleich.
5. Sprachkonsistenz: Schlüsselmengen je Einheit, Bild-Schlüssel und Stand in allen Sprachen des Stands gleich (0 Abweichungen). Parallelstruktur DE/FR/EN je Formular: gleiche Blockfolge.
6. Für Anhang III Teil A–C und Anhang XII gibt es keinen verborgenen Bildtext; dort beruht die Transkription auf den zwei Lesungen und der Parallelstruktur.

## Auffälligkeiten der Quelle (wörtlich übernommen, `sic`)

- Anhang V Teil B EN (2016 und EES): «documentaion» (fE), «colud» (fE.s1).
- Anhang V Teil B FR (2016 und EES): «à déjà séjourné» (fF).
- Anhang VIII FR: «LADURÉE» (f3), «remise â l’intéressé(e)» (f14). Anhang VIII EN: «he/she) has provided, he/she) is considered» (f12).
- Ohne `sic`-Vermerk, aber bemerkenswert: Anhang III C4 FR «VOITURE» (Einzahl; C1 und C7 «VOITURES»); Anhang III D1 DE «Bürger» in gemischter Schreibung
  (FR/EN in Grossbuchstaben; ebenso im Amtsblatt 2017/2225); Anhang XII EN «Person Concerned»; Anhang XII EN «have before us» ohne Doppelpunkt; Anhang VIII EN «Tel» ohne Punkt.

## Was unsicher bleibt

- Apostrophformen und Leerzeichen vor Satzzeichen in Anhang XII (kein Bildtext zum Vergleich): nur visuell geprüft.
- Kursivsatz ist eine Leseentscheidung (in Anhang V EN f13 das Komma nach der Klammer).
- Gestaltung (Linienlängen, Abstände, Lage des Emblems) ist nur beschrieben, nicht wiedergegeben.

## Inventar

| Einheit | Bild-Schlüssel | Sprache | Asset | Stände | Textblöcke |
|---|---|---|---|---|---|
| anx_III | ptA.g1 | de | 5cd48ff41e48bbff | s00–s08 | 2 |
| anx_III | ptB1.g1 | de | b534829cb83bd3e2 | s00–s08 | 1 |
| anx_III | ptB2.g1 | de | 408d834f9d9c4f22 | s00–s08 | 1 |
| anx_III | ptC.g1 | de | ff8fb0d4e50eb7eb | s00–s08 | 2 |
| anx_III | ptC.g2 | de | 168dbba703dc447e | s00–s08 | 2 |
| anx_III | ptC.g3 | de | dc95497d317d3b08 | s00–s08 | 2 |
| anx_III | ptC.g4 | de | cf95043b12fa1186 | s00–s08 | 2 |
| anx_III | ptC.g5 | de | eb0b124000de7ca6 | s00–s08 | 2 |
| anx_III | ptC.g6 | de | 1acc80d51227b6be | s00–s08 | 2 |
| anx_III | ptC.g7 | de | 1828cfcb21f2dd7a | s00–s08 | 2 |
| anx_III | ptC.g8 | de | d63f661929f41cad | s00–s08 | 2 |
| anx_III | ptC.g9 | de | ad883f3b2a16d926 | s00–s08 | 2 |
| anx_III | ptD.ptD1.g1 | de | 7264ef5ef36dfec5 | s03–s08 | 0 (ohne Text) |
| anx_III | ptD.ptD1.g2 | de | 3636ee9cf4f75df2 | s03–s08 | 2 |
| anx_III | ptD.ptD2.g1 | de | b145889f8bbb7f10 | s03–s08 | 0 (ohne Text) |
| anx_III | ptD.ptD2.g2 | de | f6d9e85b6934e941 | s03–s08 | 1 |
| anx_III | ptD.ptD3.g1 | de | 90f3332aa5ae3fab | s03–s08 | 0 (ohne Text) |
| anx_III | ptD.ptD3.g2 | de | b086e25b34ff9daa | s03–s08 | 1 |
| anx_III | ptE.g1 | de | 178bf3a31f6a9951 | s03–s08 | 1 |
| anx_III | ptA.g1 | fr | 182393e02e8cf0f0 | s00–s07 | 2 |
| anx_III | ptB1.g1 | fr | d41a31c10470e381 | s00–s07 | 1 |
| anx_III | ptB2.g1 | fr | 9b8930cca1a89981 | s00–s07 | 1 |
| anx_III | ptC.g1 | fr | 7462e242b83bdb49 | s00–s07 | 2 |
| anx_III | ptC.g2 | fr | 4f51ae9eea7daf1d | s00–s07 | 2 |
| anx_III | ptC.g3 | fr | 443d26f114259886 | s00–s07 | 2 |
| anx_III | ptC.g4 | fr | 1a5f7a56eeac32a0 | s00–s07 | 2 |
| anx_III | ptC.g5 | fr | 7fcc4dc65a7d4aa4 | s00–s07 | 2 |
| anx_III | ptC.g6 | fr | 6b884205f0ddbf5a | s00–s07 | 2 |
| anx_III | ptC.g7 | fr | 5664284f79b3047a | s00–s07 | 2 |
| anx_III | ptC.g8 | fr | 50eb31ee40c861dd | s00–s07 | 2 |
| anx_III | ptC.g9 | fr | 56a70140963b0114 | s00–s07 | 2 |
| anx_III | ptD.ptD1.g1 | fr | 7264ef5ef36dfec5 | s03–s07 | 0 (ohne Text) |
| anx_III | ptD.ptD1.g2 | fr | 3a8092fcfd6d0782 | s03–s07 | 2 |
| anx_III | ptD.ptD2.g1 | fr | b145889f8bbb7f10 | s03–s07 | 0 (ohne Text) |
| anx_III | ptD.ptD2.g2 | fr | d3ed7a1e2bdfb240 | s03–s07 | 1 |
| anx_III | ptD.ptD3.g1 | fr | 90f3332aa5ae3fab | s03–s07 | 0 (ohne Text) |
| anx_III | ptD.ptD3.g2 | fr | 9702ef0bf424667a | s03–s07 | 1 |
| anx_III | ptE.g1 | fr | b2babf785cb46240 | s03–s07 | 1 |
| anx_III | ptA.g1 | en | 05f5b24e38d77724 | s00–s07 | 2 |
| anx_III | ptB1.g1 | en | 69ead3154b5b5724 | s00–s07 | 1 |
| anx_III | ptB2.g1 | en | 0397ebeac71d44c7 | s00–s07 | 1 |
| anx_III | ptC.g1 | en | 578dc71f0715b54c | s00–s07 | 2 |
| anx_III | ptC.g2 | en | 3ce1f007caf9ff43 | s00–s07 | 2 |
| anx_III | ptC.g3 | en | d06c8e03969d0ebe | s00–s07 | 2 |
| anx_III | ptC.g4 | en | 010e35f1341ff563 | s00–s07 | 2 |
| anx_III | ptC.g5 | en | 67dcd25d6087e679 | s00–s07 | 2 |
| anx_III | ptC.g6 | en | 15b06bdd3ca1fcea | s00–s07 | 2 |
| anx_III | ptC.g7 | en | 28ed06361141dc8d | s00–s07 | 2 |
| anx_III | ptC.g8 | en | 4deccacef98a8b60 | s00–s07 | 2 |
| anx_III | ptC.g9 | en | b78062308af65e76 | s00–s07 | 2 |
| anx_III | ptD.ptD1.g1 | en | 7264ef5ef36dfec5 | s03–s07 | 0 (ohne Text) |
| anx_III | ptD.ptD1.g2 | en | b0d4aecea165ef09 | s03–s07 | 2 |
| anx_III | ptD.ptD2.g1 | en | b145889f8bbb7f10 | s03–s07 | 0 (ohne Text) |
| anx_III | ptD.ptD2.g2 | en | 513e51ea15ab5abd | s03–s07 | 1 |
| anx_III | ptD.ptD3.g1 | en | 90f3332aa5ae3fab | s03–s07 | 0 (ohne Text) |
| anx_III | ptD.ptD3.g2 | en | 64593db2105e4a3e | s03–s07 | 1 |
| anx_III | ptE.g1 | en | 0a77b682f40e5901 | s03–s07 | 1 |
| anx_V | ptB.g1 | de | 620ddf9db6ceee5d | s00–s02 | 30 |
| anx_V | ptB.g1 | de | fb750e52db7119e8 | s03–s08 | 36 |
| anx_V | ptB.g1 | fr | 4fe081b8a4db27cc | s00–s02 | 30 |
| anx_V | ptB.g1 | fr | 3e0813af8e8324b5 | s03–s07 | 36 |
| anx_V | ptB.g1 | en | d91a0d752a6f6743 | s00–s02 | 30 |
| anx_V | ptB.g1 | en | 1498afb43939b68f | s03–s07 | 36 |
| anx_VIII | g1 | de | f26c73a070ca7c36 | s00–s08 | 20 |
| anx_VIII | g1 | fr | 2a3c6e55d18d6f7d | s00–s07 | 20 |
| anx_VIII | g1 | en | 847372fb34db23a2 | s00–s07 | 20 |
| anx_XII | ptB.g1 | de | 0f085ae791f83c2e | s07–s08 | 20 |
| anx_XII | ptB.g1 | fr | 7c4ab6a9b28172c2 | s07–s07 | 20 |
| anx_XII | ptB.g1 | en | 9c30f9123a79d571 | s07–s07 | 20 |
