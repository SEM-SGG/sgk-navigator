# APPLICABILITY_NOTES – Anwendbarkeit je Einzeländerung (Agent VERWEISE, Etappe 3)

Stand: 12. November 2026. Dateien: `data/acts.json` (nachgeführt), `data/derogations.json` (neu), `src/core/applicability.js` (neu), `src/core/model.js` (`composeAt` erweitert).
Zitate wörtlich aus `raw/<CELEX>_<LANG>.html` (ABl.-Fassungen), gekürzt mit «…». Grundlage der bisherigen Herleitung je Akt: `data/ACTS_NOTES.md` (Agent RECHT).

## 1 Modell

- Eine Änderung (`changes[]`) erbt das Anwendungsdatum ihres Akts (`application.date`). `changes[].applicableFrom` steht nur, wenn das Recht für diese Änderung ein anderes Datum festlegt (Spezifikation SPEC3 §3.3).
- Neu (Schema ergänzt): `changes[].basis` (Fundstelle der Abweichung, dreisprachig) und `changes[].periods` (`[{ key, until, basis, computed }]`): zeitliche Begrenzung einzelner Blöcke. Nach `until` ist der Wortlaut verbraucht (`status: "expired"`), er bleibt im Text.
- Aussetzungen und Abweichungen ohne Textänderung stehen in `data/derogations.json`, nicht als `applicableFrom`. Grund: Der Wortlaut der Bestimmung ist ab dem Aktdatum Teil des geltenden SGK; eine Aussetzung hebt nur die Anwendung für eine Frist auf. `composeAtDate` zeigt dafür einen Hinweis (`kind: "derogation"`).
- `composeAtDate` liefert den Wortlaut mit allen am Datum anwendbaren Änderungen. Hängige Änderungen (Datum offen) und künftige (Datum bekannt, später) bleiben ausgeschlossen und erscheinen als Hinweis `pending` bzw. `future`; abgelaufene Blöcke als `expired` (Hinweisart ergänzt).
- Sicht mit heutigem Wissensstand: Für ein Datum in der Vergangenheit wird «future» auch dann gemeldet, wenn das Anwendungsdatum damals noch nicht bekannt war (z. B. 2017/2225 vor dem Beschluss 2025/1544).
- Vor der Veröffentlichung eines Akts liefert `changeApplicability` `status: "not-adopted"`; `composeAtDate` meldet dazu nichts.

## 2 VO (EU) 2017/2225 (EES-Änderung des SGK)

| Punkt | Fundstelle | Wortlaut (Auszug) | Ergebnis |
|---|---|---|---|
| Geltung des Akts | Art. 2 Abs. 2 VO 2017/2225 | «gilt ab dem Datum der Inbetriebnahme des EES» | 12.10.2025 (bisher, unverändert) |
| Datum | Art. 1 Durchführungsbeschluss (EU) 2025/1544 | «nimmt am 12. Oktober 2025 seinen Betrieb auf» | 12.10.2025 |
| Mitgliedstaaten nach Art. 66 Abs. 3 EES-VO ohne EES | Art. 2 Abs. 3 VO 2017/2225 | «ab dem Zeitpunkt ihrer Anbindung an das EES» | bisher in `application.details`; die Kommission nennt am 10.4.2026 Zypern und Irland als Ausnahmen («except for Cyprus and Ireland») |
| **Art. 12a SGK** | Art. 5 Abs. 13 VO 2025/1534 | «ab dem ersten Tag nach dem Abschluss der schrittweisen Inbetriebnahme des EES» | **`applicableFrom: 2026-04-10`** (neu) |
| Art. 12a Abs. 1 SGK, Dauer | Art. 12a Abs. 1 SGK | «Für einen Zeitraum von 180 Tagen nach Inbetriebnahme des EES» | `periods: p1 bis 2026-10-06` (berechnet, Tag 1 = 10.4.2026) |
| Art. 12a Abs. 2 SGK | Art. 12a Abs. 2 Satz 2 SGK (EN) | «shall not be limited to the 180-day period» | nicht befristet |

Art. 5 Abs. 13 nennt «Übergangszeitraum und Übergangsmaßnahmen» ohne Einschränkung; Art. 12a trägt diese Überschrift und umfasst Abs. 1 und 2. Deshalb gilt `applicableFrom` für die ganze Einheit. Die Geltung von Art. 5 Abs. 13 selbst endet nach Art. 8 Abs. 2 Bst. a VO 2025/1534 «fünf Jahre und 180 Tage» nach dem 12.10.2025 (berechnet 9.4.2031); für den SGK hat das keine weitere Wirkung, weil der Übergangszeitraum am 6.10.2026 endete.

## 3 VO (EU) 2025/1534 (schrittweise Inbetriebnahme) – bisheriger «check»-Eintrag

Belegt an DE, FR, EN (`raw/32025R1534_*.html`):

- Zeitraum: Art. 2 Nr. 1: «den Zeitraum von 180 Tagen ab dem … Zeitpunkt der Inbetriebnahme des EES». Mit Tag 1 = 12.10.2025 endet er am 9.4.2026. Die Kommission bestätigt diese Zählung: «fully operational as of 10 April 2026» (Mitteilung vom 10.4.2026, Quelle unten). Die Zählung nach Art. 3 Abs. 1 Unterabs. 2 VO (EWG, Euratom) Nr. 1182/71 (Tag des Ereignisses nicht mitgezählt) ergäbe den 10.4.2026 als letzten Tag; die Wendung «ab dem … Zeitpunkt» spricht für die Zählung der Kommission. In den Daten: `until: 2026-04-09`.
- Ende der Geltung: Art. 8 Abs. 2: «Die Geltung dieser Verordnung endet 180 Tage nach dem …» Zeitpunkt; Ausnahmen Bst. a–d. Mit derselben Zählung: Art. 7 Abs. 5 bis 9.5.2026 (210 Tage), Art. 7 Abs. 3 und 4 bis 6.9.2026 (330 Tage), Art. 6 Abs. 2 Unterabs. 2 bis 6.10.2026 (360 Tage), Art. 5 Abs. 13 und Art. 6 Abs. 1, 3, 4 bis 9.4.2031.
- Die Enddaten nach Art. 8 Abs. 2 hängen nicht davon ab, ob die Verlängerung nach Art. 7 Abs. 4 (+60 Tage) eintrat; die Obergrenze von 330 Tagen ist fest. Offen bleibt nur, ob das 60-Tage-Fenster innerhalb dieser Grenze genutzt werden durfte: Eine Mitteilung der Kommission nach Art. 7 Abs. 5 («informiert die Mitgliedstaaten über das Ergebnis») wurde nicht gefunden; Presseberichte (Fachmedien) widersprechen sich (6. bzw. 7.9.2026). Betrifft Art. 21 Abs. 1 EES-VO, nicht den SGK.
- Ergebnis: `confidence` von 32025R1534 auf `verified` gesetzt; `checkNote` neu gefasst; die beiden berechneten `details` tragen `confidence` (Art. 7 Abs. 3/4: `check`, Art. 5 Abs. 13: `verified`). Das bestehende Feld `affects` bleibt unverändert; massgebend für die Oberfläche ist `data/derogations.json`.

### Inhalt von data/derogations.json (ein Eintrag, 12.10.2025–9.4.2026, 33 Wirkungen)

| SGK | Wirkung | Fundstelle VO 2025/1534 | Wortlaut (Auszug) |
|---|---|---|---|
| Art. 8 Abs. 9 | suspended | Art. 5 Abs. 12 | «sowie die Anwendung von Artikel 8 Absatz 9 der Verordnung (EU) 2016/399 werden ausgesetzt» |
| Art. 9 Abs. 3 | suspended | Art. 5 Abs. 14 Unterabs. 4 | «wird die Anwendung von Artikel 9 Absatz 3 und Artikel 12 … ausgesetzt» |
| Art. 12 | suspended | Art. 5 Abs. 14 Unterabs. 4 | wie oben; Ersatz: eigene Vermutungsregel Art. 5 Abs. 4 |
| Art. 12a | suspended (Beginn verschoben) | Art. 5 Abs. 13 | siehe §2 |
| Art. 6 Abs. 1 Bst. f Ziff. i | conditional | Art. 5 Abs. 14 Unterabs. 3 | «an denen das EES ohne biometrische Funktionen eingesetzt wird» … «keine Anwendung» |
| Art. 6 Abs. 1 Bst. f Ziff. ii, Art. 8 Abs. 3 Bst. a und g | conditional (nur biometrische Überprüfung, nur für Zwecke des EES) | Art. 5 Abs. 14 Unterabs. 3 | «ausschließlich für die Zwecke des EES» |
| Art. 42a Abs. 1 Unterabs. 2, Abs. 2, 5, 6 | modified | Art. 5 Abs. 2 Unterabs. 2 | «gelten sinngemäß in den am Betrieb des EES beteiligten Mitgliedstaaten» |
| Art. 11 | modified (systematisches Abstempeln) | Art. 5 Abs. 2 Unterabs. 1 | «stempeln die Reisedokumente … bei der Ein- und Ausreise systematisch ab» |
| alle 20 durch 2017/2225 geänderten Einheiten | conditional | Art. 5 Abs. 14 Unterabs. 1 und 2 | «in der Fassung durchgeführt, die am Tag vor dem … Zeitpunkt … gilt» |

Nicht als SGK-Wirkung erfasst (betreffen die EES-VO oder Dritte): Art. 4 (Schwellenwerte), Art. 5 Abs. 3–11 und 15, Art. 6, Art. 7. Art. 5 Abs. 5 (direkter VIS-Zugang an Stellen ohne EES) berührt Art. 8 Abs. 3 Bst. b SGK nur mittelbar; nicht erfasst.

## 4 Hängige Akte, Stand 12. November 2026

| Akt | Fundstelle | Wortlaut (Auszug) | Stand heute |
|---|---|---|---|
| 2018/1240 (ETIAS), Art. 80 → SGK | Art. 96 Abs. 2 | «gilt diese Verordnung ab dem von der Kommission gemäß Artikel 88 bestimmten Zeitpunkt» | kein Beschluss nach Art. 88 (SPARQL); Kommission: «currently not in operation» |
| 2019/817 (IO), Art. 8 Abs. 4a SGK | Art. 8 Abs. 4a Unterabs. 2 SGK | «gilt dieser Absatz ab dem Zeitpunkt der Inbetriebnahme des Detektors für Mehrfachidentitäten» | kein MID-Beschluss; ESP und CIR seit 12.6.2026 in Betrieb (Durchführungsbeschlüsse (EU) 2026/1155 und 2026/1156, je Art. 1: «shall start on 12 June 2026») – für Art. 8 Abs. 4a nicht massgebend |
| 2021/1134 (VIS), Art. 3 → SGK | Art. 12 Abs. 2; Art. 11 Abs. 1 | «gilt ab dem von der Kommission gemäß Artikel 11 festgelegten Tag»; «bis zum 31. Dezember 2023» | kein Beschluss nach Art. 11; Frist verstrichen |

SPARQL-Abfrage (Cellar, 12.11.2026): alle Durchführungsbeschlüsse 2025–2026 mit «start of operations», «date from which», «ETIAS» oder «(VIS)» im englischen Titel. Treffer: 2025/1544 (EES), 2026/1155 (ESP), 2026/1156 (CIR), 2026/1970 (ETIAS-Daten, kein Startdatum), 2026/2284 (SIS) und zwei sachfremde. Kein Beschluss zu ETIAS-Start, MID oder revidiertem VIS. Die Datenbank reicht mindestens bis 15.10.2026. Ergänzt in `acts.json`: `application.checkedAt`, `application.checkedBy`; bei 2019/817 ein `details`-Eintrag zu ESP/CIR (`sgk: false`).
Korrektur zu ACTS_NOTES: Art. 11 Abs. 1 VO 2021/1134 lautet in DE «bis zum 31. Dezember 2023» (ACTS_NOTES zitiert «spätestens am»); inhaltlich gleich.

## 5 Übrige Akte (geprüft, keine abweichenden Einzeldaten)

- 2016/1624 (Art. 80 → Art. 29 SGK), 2017/0458, 2024/1717: Inkrafttretensklauseln ohne gestaffelte Geltung für die SGK-Änderungen (2017/458 Art. 2 und 2024/1717 Art. 2: «tritt am zwanzigsten Tag nach ihrer Veröffentlichung … in Kraft»); Fristen im SGK-Text selbst (Art. 8 Abs. 2d, Art. 23a Abs. 7, Art. 42b) sind Inhalt, keine Anwendbarkeitsabweichung.
- Berichtigungen erben die Anwendbarkeit der berichtigten Bestimmung (ACTS_NOTES).

## 6 Tabelle: Änderungen mit abweichendem Anwendungsdatum

| Akt | Einheit | Schlüssel | Akt-Datum | applicableFrom | befristet | Grundlage |
|---|---|---|---|---|---|---|
| 32017R2225 | art_12a | (ganze Einheit) | 2025-10-12 | 2026-04-10 | p1 bis 2026-10-06 | Art. 5 Abs. 13 VO 2025/1534; Art. 12a Abs. 1 SGK |

Weitere Abweichungen gibt es in den 24 Akten nicht. Aussetzungen siehe §3.

## 7 Offene Punkte («check»)

1. Tageszählung: Die Daten folgen der Zählung der Kommission (Tag 1 = Tag der Inbetriebnahme). Eine Zählung nach VO 1182/71 verschöbe alle Enddaten um einen Tag.
2. Art. 7 Abs. 4 VO 2025/1534 (+60 Tage): Eintritt nicht amtlich belegt; ohne Wirkung auf den SGK.
3. Ende Art. 12a Abs. 1 SGK am 6.10.2026: berechnet, nicht amtlich bestätigt.
4. Art. 2 Abs. 3 VO 2017/2225 (Zypern): Anbindung nicht geprüft; in `derogations.json` nicht abgebildet (Wirkung nur in einem Mitgliedstaat).

## 8 Prüfung

`node --test test/core/applicability.test.mjs` (11 Tests): Eigenschaft 1 (Datum 12.11.2026 = bisheriges Ergebnis von `composeAt` mit Akt-Prädikat, 70 Einheiten × 3 Sprachen), Eigenschaft 2 (synthetisch alle Akte anwendbar = jüngster Stand), Hinweise am 15.1.2026 (Art. 6, 8, 9, 12, 12a, 42a in DE/FR/EN), keine Abweichungshinweise ab 10.4.2026, hängige Änderungen nur als Hinweis, blockweise gleich aktweise (3780 Fälle), Schema von derogations.json und acts.json.

## Quellen

- EUR-Lex: CELEX 32025R1534, 32025D1544, 32017R2225, 32018R1240, 32019R0817, 32021R1134, 32026D1155, 32026D1156 (Volltexte DE/FR/EN in `raw/` bzw. per curl).
- SPARQL: https://publications.europa.eu/webapi/rdf/sparql (Abfrage §4).
- Kommission, Mitteilung vom 10.4.2026: https://commission.europa.eu/news-and-media/news/more-secure-efficient-and-convenient-way-travelling-non-eu-nationals-2026-04-10_en
- Kommission, ETIAS: https://home-affairs.ec.europa.eu/policies/schengen/smart-borders/european-travel-information-authorisation-system_en
- Fachpresse (nicht amtlich, nur zu §3 Art. 7): idtechwire.com, remoteworkeurope.eu, internationalairportreview.com.
