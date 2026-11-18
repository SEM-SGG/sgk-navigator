# ACTS_NOTES – Rechtsmetadaten zum SGK (Agent RECHT)

Stand: 11. November 2026. Datei: `data/acts.json` (24 Einträge). Generator und Prüfskript liegen ausserhalb des Projekts (`/tmp/recht/build_acts.py`, `/tmp/recht/validate.mjs`).

## Quellen und Methode

- Akttexte DE/FR/EN in `raw/` (ABl.-Fassungen), Schluss- und Übergangsbestimmungen direkt gelesen.
- Zusätzlich nach `raw/` geladen: `32025D1544_{DE,FR,EN}`, `32018R1240R(03)_*`, `32024R1717R(01)_*`, `32021R1134R(01)_*`, `32021R1134R(03)_*`, `02019R0817-20260612_*`, `02021R1134-20210713_*` (FR/EN-Dateien von Berichtigungen, die es nur in anderen Sprachen gibt, sind EUR-Lex-Fehlerseiten von 83 547 Byte; nicht verwenden).
- EUR-Lex-Metadatenseiten (`…/EN/ALL/?uri=CELEX:…`): Daten, Verfahrensnummern, Berichtigungen mit Sprachangabe, Beziehungen.
- SPARQL (Cellar): Beziehungen `amends`, `corrects`, `derogates`, `proposes_to_amend` auf 32016R0399; amtliche Titel (`expression_title`); Suche nach Durchführungsbeschlüssen zur Inbetriebnahme von ETIAS, MID und revidiertem VIS (Titel- und `based_on`-Abfrage, Ergebnis negativ).
- Aktueller Stand: Seiten der Kommission (DG HOME), eu-LISA, Legislative Observatory (OEIL).
- Abgleich `changes` gegen die Marker in `raw/02016R0399-20251012_{DE,FR,EN}.html` auf Ebene Einheit (siehe Validierung).

## Herleitung der Anwendbarkeit je Akt

**32016R0399 (Basisakt).** Art. 45: „Diese Verordnung tritt am zwanzigsten Tag nach ihrer Veröffentlichung … in Kraft.“ Veröffentlichung 23.3.2016, Inkrafttreten und Geltung 12.4.2016. Status applicable.

**32016R1624 (Frontex-VO), Art. 80 → Art. 29 Abs. 1 SGK.** Art. 83 Abs. 1: Inkrafttreten am zwanzigsten Tag (6.10.2016). Art. 83 Abs. 2 verschiebt nur Bestimmungen der VO selbst („Artikel 29, 30, 31 und 32 gelten ab 7. Januar 2017.“); Art. 80 ist nicht erfasst. Geltung der SGK-Änderung: 6.10.2016.

**32017R0458 (Systematische Abfragen), Art. 1 → Art. 8 SGK.** Art. 2: nur Inkrafttretensklausel („tritt am zwanzigsten Tag nach ihrer Veröffentlichung … in Kraft“). Geltung 7.4.2017. Der neue Art. 8 Abs. 2d SGK enthält selbst eine Übergangsfrist für Luftgrenzen (sechs Monate ab 7.4.2017, je Flughafen um höchstens 18 Monate verlängerbar).

**32017R2225 (EES).** Art. 2 Abs. 2: „Diese Verordnung gilt ab dem Datum der Inbetriebnahme des EES“. Durchführungsbeschluss (EU) 2025/1544, Art. 1: Das EES „nimmt am 12. Oktober 2025 seinen Betrieb auf“. Geltung 12.10.2025.
Schrittweise Inbetriebnahme nach VO (EU) 2025/1534 (180 Tage, 12.10.2025–9.4.2026): Art. 8 Abs. 9, Art. 9 Abs. 3 und Art. 12 SGK ausgesetzt (Art. 5 Abs. 12 und 14 Unterabs. 4); an Grenzübergangsstellen ohne EES galt der SGK „in der Fassung vom Tag vor“ der Inbetriebnahme (Art. 5 Abs. 14 Unterabs. 1); an Stellen mit EES ohne Biometrie gelten Art. 6 Abs. 1 Bst. f Ziff. i und die biometrische Verifizierung nach Art. 6 Abs. 1 Bst. f Ziff. ii und Art. 8 Abs. 3 Bst. a und g nicht; Stempelpflichten nach Art. 42a gelten sinngemäss (Art. 5 Abs. 2). Art. 12a SGK (Übergangszeitraum) beginnt nach Art. 5 Abs. 13 erst am ersten Tag nach Ende der schrittweisen Inbetriebnahme: berechnet 10.4.2026–6.10.2026. eu-LISA bestätigt die vollständige Einführung am 10.4.2026. Per heute ist der SGK in der Fassung 2017/2225 voll anwendbar. Art. 2 Abs. 3 (spätere Anbindung von Mitgliedstaaten nach Art. 66 Abs. 3 EES-VO) ist in `details` vermerkt.

**32018R1240 (ETIAS), Art. 80.** Art. 96 Abs. 2: „… gilt diese Verordnung ab dem von der Kommission gemäß Artikel 88 bestimmten Zeitpunkt.“ Art. 80 steht nicht in der Ausnahmeliste (ab 9.10.2018 geltend). Ein Beschluss nach Art. 88 existiert nicht (SPARQL-Suche negativ; die Seite der Kommission sagt, ETIAS sei „currently not in operation“; Mitteilung DG HOME vom 28.4.2026: Start „in the last quarter of 2026“, Datum werde „later this year“ mitgeteilt). Status pending. Nach Inbetriebnahme: Übergangszeitraum sechs Monate (Art. 83 Abs. 1, durch delegierten Rechtsakt um sechs Monate verlängerbar, einmal erneuerbar), danach Schonfrist sechs Monate (Art. 83 Abs. 3). Die Behauptung des Orchestrators, die Kommission habe per Anfang November 2026 kein Datum festgelegt, ist damit bestätigt; Presseberichte über eine Verschiebung auf 2027 sind nicht amtlich belegt.
Berichtigung: Art. 80 Nr. 2 Bst. a ersetzt gemäss 32018R1240R(03) (ABl. L 193 vom 17.6.2020, S. 16) **Art. 8 Abs. 3 Bst. a Ziff. ii**, nicht Ziff. i. Wörtlich DE: „Buchstabe a Ziffer ii erhält folgende Fassung“. In acts.json umgesetzt (`art_8 p3.a.ii replaced`).

**32019R0817 (Interoperabilität), Art. 59 → Art. 8 Abs. 4a SGK.** Der eingefügte Absatz enthält selbst die Geltungsregel (Unterabs. 2): „gilt dieser Absatz ab dem Zeitpunkt der Inbetriebnahme des Detektors für Mehrfachidentitäten“ (Art. 72 Abs. 4 VO 2019/817). Ein MID-Beschluss existiert nicht; Art. 72 Abs. 4 Bst. d verlangt die Mitteilung der ETIAS-Zentralstelle nach Art. 71 Abs. 3 (Abschluss des ETIAS-Übergangszeitraums nach Art. 69). Ohne ETIAS kein MID, ohne MID kein Art. 8 Abs. 4a. Status pending.
Die SPARQL-Daten `entry-into-force` 2019-06-11, 2025-05-19, 2026-06-12 bedeuten laut EUR-Lex-Metadaten: 11.6.2019 Inkrafttreten (und Geltung der in Art. 79 Abs. 8 genannten Artikel); 19.5.2025 Teilgeltung sBMS (Durchführungsbeschluss (EU) 2025/875); 12.6.2026 Teilgeltung ESP und CIR (Durchführungsbeschlüsse (EU) 2026/1155 und 2026/1156). Keines betrifft den SGK. EUR-Lex führt die SGK-Änderung mit „From 11/06/2019“; das ist das Inkrafttreten, nicht die Geltung.

**32021R1134 (VIS-Revision), Art. 3.** Art. 12 Abs. 2: „Diese Verordnung gilt ab dem von der Kommission gemäß Artikel 11 festgelegten Tag“. Art. 3 ist nicht unter den Ausnahmen (Teilgeltungen 2.8.2021, 3.8.2022, 3.8.2023 betreffen nur VIS-VO und EES-VO). Kein Beschluss nach Art. 11 (SPARQL negativ); die Frist von Art. 11 Abs. 1 („spätestens am 31. Dezember 2023“) ist verstrichen. eu-LISA Outlook 2026 (Februar 2026) nennt für das revidierte VIS weiterhin Entwicklung und Anbindungen. Status pending.

**32024R1717 (SGK-Revision 2024).** Art. 2: nur Inkrafttretensklausel; Geltung 10.7.2024 für alle Änderungen. Keine Bestimmung mit späterem Geltungsbeginn. Hinweise: Art. 42b setzt eine Frist (11.1.2025); Art. 5 Abs. 4 verweist auf Art. 1 Abs. 4 Bst. b der VO (EU) 2024/1359 (Krisen-VO), die erst ab 12.6.2026 gilt.

**32025R1534 (Abweichung).** Art. 8 Abs. 1: „Sie gilt ab dem … bestimmten Zeitpunkt der Inbetriebnahme des EES.“ (Art. 3 ab 26.7.2025). Art. 8 Abs. 2: „Die Geltung dieser Verordnung endet 180 Tage nach dem … Zeitpunkt“, mit Ausnahmen (Art. 5 Abs. 13 und Art. 6 Abs. 1, 3, 4: fünf Jahre und 180 Tage; Art. 6 Abs. 2 Unterabs. 2: 360 Tage; Art. 7 Abs. 3 und 4: 330 Tage; Art. 7 Abs. 5: 210 Tage). Status per heute partly. Ändert den SGK-Wortlaut nicht; erfasst in `affects` statt `changes`.

**32025D1544 (Durchführungsbeschluss).** Art. 2: Inkrafttreten am Tag der Veröffentlichung (31.7.2025); Art. 1 legt den 12.10.2025 fest.

## Berichtigungen

| CELEX | Sprache | Datum, ABl. | Gegenstand |
|---|---|---|---|
| 32016R0399R(01) | FI | 12.4.2017, L 99/31 | Anhang VIII (Formular) |
| 32016R0399R(02) | DA | 11.11.2017, L 294/42 | Art. 11 Abs. 3 Bst. c |
| **32016R0399R(03)** | **DE** | 31.10.2018, L 272/69 | Titel: „Unionskodex“ statt „Gemeinschaftskodex“ |
| 32016R0399R(04) | ES | 26.2.2019, L 57/29 | Art. 2 Nr. 14 |
| 32016R0399R(05) | MT | 30.7.2020, L 245/32 | Art. 2 Nr. 20 |
| 32016R0399R(06) | ES | 5.5.2022, L 131/14 | Anhang VII Nr. 1 |
| 32016R0399R(07) | HR | 3.7.2024, L 2024/90386 | Terminologie Einreiseverweigerung, ganze VO |
| 32016R0399R(08) | MT | 2.10.2026, L 2026/90835 | Art. 6 Abs. 5 Bst. a: Tippfehler „paragrfu“, überzähliges „li“ |
| **32017R2225R(01)** | alle | 7.12.2018, L 312/107 | Art. 6a Abs. 3 Bst. f: „oder vom Heiligen Stuhl“ |
| **32018R1240R(03)** | alle | 17.6.2020, L 193/16 | Art. 80 Nr. 2 Bst. a: Ziff. ii statt i |
| **32024R1717R(01)** | DE, SV | 16.10.2025, L 2025/90822 | Art. 25 Abs. 1 Bst. a SGK |

R(08) ist eine rein maltesische Schreibkorrektur ohne Bedeutung für DE/FR/EN. Weitere Berichtigungen der Änderungsakte in anderen Sprachen (2016/1624 CS/EL/IT/ES; 2018/1240 R(01), (02), (04)–(08); 2019/817 R(01)–(05); 2021/1134 R(01)–(04)) wurden geprüft: keine betrifft den SGK-Änderungsartikel. Ausnahme: 32017R0458R(01) (nur DA) berichtigt Art. 8 Abs. 2f SGK („indre landegrænser“); nicht in acts.json aufgenommen, da ohne Bedeutung für DE/FR/EN.
Berichtigungen haben kein eigenes Anwendungsdatum; in acts.json übernimmt `application` die Anwendbarkeit der berichtigten Bestimmung (Wirkung auf den ursprünglichen Text). Für Sprachen ohne Fassung der Berichtigung ist der Titel in der Originalsprache übernommen (`titleLang`) und die ABl.-Angabe mit „nur …-Ausgabe“ gekennzeichnet; diese Zitierform ist von mir gebildet.

## Vorschläge (SPARQL `proposes_to_amend` auf 32016R0399)

| Vorschlag | Verfahren | Ergebnis |
|---|---|---|
| 52016PC0196 | 2016/0105(COD) | VO (EU) 2017/2225 |
| 52016PC0731 | 2016/0357(COD) | VO (EU) 2018/1240 |
| 52017PC0571 | 2017/0245(COD) | zurückgezogen 14.12.2021, ersetzt durch COM(2021) 891 |
| 52017PC0793, 52018PC0478 (geändert) | 2017/0351(COD) | VO (EU) 2019/817 |
| 52018PC0302 | 2018/0152(COD) | VO (EU) 2021/1134 |
| 52021PC0891 | 2021/0428(COD) | VO (EU) 2024/1717 |
| 52024PC0567 | 2024/0315(COD) | VO (EU) 2025/1534 |
| **52024PC0670** | **2024/0670(COD)** | **hängig** |

52024PC0670 (EU Digital Travel application, DTC): Art. 13 des Vorschlags ändert Art. 2 (Nr. 31–34), Art. 8 (Abs. 2g, Abs. 3 Bst. j, Abs. 3a, Abs. 10), Art. 8a (Abs. 4a) und fügt Art. 8ba ein. Stand: OEIL „Awaiting Parliament's position in 1st reading“; LIBE-Bericht A10-0258/2025 (Abstimmung 3.12.2025), Verhandlungsmandat vom Plenum am 17.12.2025 bestätigt; Ratsmandat 19.11.2025 (Pressemitteilung, nicht abrufbar); zweiter Trilog 5.5.2026 (Agence Europe). Keine vorläufige Einigung gefunden. Ältere Vorschläge den Akten über das Feld `proposal` zugeordnet. 52015PC0670 (→ 2017/458) und 52015PC0671 (→ 2016/1624) richten sich formell noch an die VO (EG) Nr. 562/2006 und erscheinen deshalb nicht in der SPARQL-Liste.

## Offene Zweifel (`confidence: "check"`)

1. **32025R1534**: Die Fristen in `details` (Ende Art. 7 Abs. 3/4 am 6.9.2026, Art. 5 Abs. 13 am 9.4.2031, Art. 12a SGK 10.4.–6.10.2026) sind selbst gerechnet; ob die Verlängerung nach Art. 7 Abs. 4 (+60 Tage) eintrat, ist nicht belegt.
2. **52024PC0670**: Verfahrensstand nach Mai 2026 nicht amtlich belegt.
3. **32016R0399R(07)**: Generalklausel für die ganze HR-Fassung, changes nur grob. Ohne Bedeutung für DE/FR/EN.
4. Schlüssel (`key`) sind nach §5.2 aus den Änderungsanweisungen abgeleitet und nur auf Ebene Einheit gegen die Marker geprüft. Ein Abgleich auf Blockebene braucht `data/dataset.json` (lag beim Abschluss nicht vor). Unsichere Fälle: `art_24 s1` (erster, nicht nummerierter Absatz), `anx_V ptA.n1.s2`, `anx_V ptB` (Formular, als `amended` erfasst), `art_8 p3.a.i.s3` (zweiter Unterabsatz des Ersatztexts von 2017/2225), `tit_II.cha_V` (Kapitelüberschrift, Element des Inhaltsverzeichnisses, `toc: true`; die id-Konvention von Agent DATEN ist mir nicht bekannt).
5. Die Kapitelüberschrift V (Titel II) ist in DE „Bestimmte Maßnahmen …“, in FR/EN „Mesures spécifiques …“ / „Specific measures …“; leichte Abweichung der Sprachfassungen, keine Berichtigung.

## Auffälligkeiten für SGK-Fachleute

- **ETIAS nicht konsolidiert, EES schon.** EUR-Lex hat 2017/2225 (Geltung erst 2025), 2019/817 (Art. 8 Abs. 4a, noch nicht anwendbar) und 2021/1134 (noch nicht anwendbar) in die konsolidierten SGK-Fassungen eingearbeitet, Art. 80 ETIAS-VO aber in keiner Fassung. Ein dokumentierter Grund war nicht zu finden; die Praxis ist uneinheitlich. Das Werkzeug muss ETIAS deshalb aus dem Akttext patchen.
- **Berichtigung der ETIAS-Änderungsanweisung.** Ursprünglich sollte Art. 8 Abs. 3 Bst. a Ziff. i ersetzt werden; das hätte die Prüfung von SIS/SLTD (Fassung 2017/458) gestrichen. Die Berichtigung 2020 richtet die Änderung auf Ziff. ii (Visum, Reisegenehmigung, Aufenthaltstitel). Marker in 02018R1240-20260612: DE ▼C2, FR und EN ▼C1 (SPEC §5.4 nennt pauschal ▼C2; gilt nur für DE).
- **Art. 8 Abs. 4a SGK steht im Text, gilt aber nicht.** Die Geltungsregel ist als Unterabsatz in den SGK selbst eingefügt; sie hängt am MID, der wiederum ETIAS voraussetzt. EUR-Lex-Metadaten („From 11/06/2019“) können zu falschen Schlüssen führen.
- **2025/1544 als „M4“.** In der konsolidierten Fassung 20251012 führt EUR-Lex den Durchführungsbeschluss als eigenes Änderungselement (M4 unter M3 = 2017/2225); dadurch verschiebt sich die M-Nummer von 2019/817 von M4 (2024) zu M5 (2025).
- **Sprachspezifische Berichtigungen.** Für DE wirken zwei Berichtigungen, die FR und EN nicht kennen: 32016R0399R(03) (Titel „Unionskodex“) und 32024R1717R(01) (Art. 25 Abs. 1 Bst. a, ▼C3 in DE). Die SPARQL-Metadaten führen den DE-Titel des Basisakts weiterhin mit „Gemeinschaftskodex“.
- **R(08) vom 2.10.2026** ist rein maltesisch (Art. 6 Abs. 5 Bst. a, Tippfehler und Grammatik).
- **Umnummerierung durch 2017/458.** Nr. 4 ersetzt Art. 8 Abs. 3 Bst. g Ziff. i und ii durch eine einzige Ziff. i, Nr. 5 ersetzt Ziff. iii durch einen Text mit der Bezeichnung „ii)“. Die heutige Ziff. iii (EES) stammt aus 2017/2225. Für die Chronologie von `p3.g.ii` und `p3.g.iii` relevant.
- **Frist der VIS-Revision verstrichen.** Art. 11 Abs. 1 VO 2021/1134 verlangte den Beschluss über die Inbetriebnahme „spätestens am 31. Dezember 2023“; bis heute liegt keiner vor. Die Streichung von Art. 8 Abs. 3 Bst. c–f SGK (VIS-Abfrage nur mit Visummarkennummer) ist damit beschlossen, aber nicht anwendbar.
- **Verweis auf die aufgehobene Frontex-VO.** Art. 29 Abs. 1 SGK (Fassung 2016/1624) verweist auf Art. 19 Abs. 1 VO (EU) 2016/1624, die durch VO (EU) 2019/1896 aufgehoben ist. Die Lesart über die Entsprechungstabelle der VO 2019/1896 habe ich nicht geprüft.
- **Krisen-VO.** Art. 5 Abs. 4 SGK (2024) verweist auf die erst ab 12.6.2026 geltende VO (EU) 2024/1359.

## Validierung

`node /tmp/recht/validate.mjs`: 24 Akte, 0 Fehler. Geprüft: Pflichtfelder, Dreisprachigkeit, Datumsformat, Status-Datum-Konsistenz, Aktionen, Schlüsselsyntax, Existenz jeder `unit` (gegen die ids in `raw/02016R0399-20251012_DE.html`, 70 Einheiten), Abgleich der Einheiten je Akt mit den Markern in DE/FR/EN 20251012 (DOM-Zuordnung). Ergebnis: Alle Einheiten mit Markern sind in acts.json erfasst. Einheiten ohne eigenen Marker folgen unmittelbar auf eine Einheit desselben Akts (EUR-Lex setzt einen Marker für zusammenhängende Blöcke: Art. 8a–8d, Art. 12, Art. 27, Anhang XII). Der Marker vor Art. 21 (2024/1717) betrifft die Überschrift von Kapitel V. Warnungen: `tit_II.cha_V` ist keine Einheit; `art_8ba` existiert nur im Vorschlag.
Nicht geprüft: Schlüssel auf Blockebene (wartet auf dataset.json), ETIAS-Wortlaut gegen den Patch von Agent DATEN.
