# Prüfbericht Datensatz SGK (Agent DATEN)

Erzeugt von `node scripts/validate.mjs` aus `data/dataset.json` (Stand 2026-11-11). Alle Zahlen in diesem Bericht stammen aus maschinellen Prüfungen, die bei jedem Lauf neu ausgeführt werden. Rohdaten der Prüfung: `data/validation-results.json`, Build-Protokoll: `data/build-log.json`.

## 1 Ergebnis in Kürze

- Wortlaut: Für alle 15 Quellfassungen (5 Fassungen × DE/FR/EN) gibt der Parser den Fliesstext des verfügenden Teils (ab Artikel 1, mit Anhängen) zu 100,00 % bis 100,00 % vollständig und in richtiger Reihenfolge wieder (0 fehlende, 0 zusätzliche Wörter).
- Datensatz: Die Stände s00, s01, s02 entsprechen ihrer Quelle zu 100 %. s07 und s08 entsprechen der jeweiligen EUR-Lex-Fassung plus genau dem ETIAS-Patch (Vergleich gegen Quelle + Patch: keine Abweichung).
- Akttext: 1153 von 1153 eingefügten oder ersetzten Blöcken stimmen mit dem Wortlaut im Änderungsakt bzw. in der Berichtigung überein; 0 Abweichungen. 27 Übereinstimmungen tragen einen Vermerk (nur Schlusszeichen oder Gross-/Kleinschreibung abweichend, Liste 6.2).
- Sprachkonsistenz: In 9 Ständen × 70 Einheiten sind die Schlüsselmengen in DE, FR und EN identisch.
- Rekonstruktion: Selbsttest (alle Akte nach 2017/458 zurücknehmen ergibt die konsolidierte Fassung 20170407): DE 0 abweichende Einheiten, FR 0 abweichende Einheiten, EN 0 abweichende Einheiten. Gemischte Bereiche: 0, Anomalien: 0.
- Tests: 64 bestanden, 0 fehlgeschlagen (`node --test test/core/*.test.mjs`).
- Abgleich mit data/acts.json (Agent RECHT): 104 bestaetigt, 1 Gliederung (nicht geprueft).

## 2 Stände und Herkunft

`source.kind`: `oj` = Amtsblattfassung von EUR-Lex; `consolidated` = konsolidierte Fassung von EUR-Lex unverändert; `reconstructed` = von uns rekonstruiert (keine EUR-Lex-Fassung); `patched` = EUR-Lex-Fassung oder Rekonstruktion, ergänzt um die ETIAS-Änderungen aus dem Akttext.

| Stand | Akt | source.kind | Grundlage | Sprachen mit Änderungen |
|---|---|---|---|---|
| s00 | 32016R0399 | oj | 32016R0399 | de, fr, en |
| s01 | 32016R1624 | consolidated | 02016R0399-20161006 | de, fr, en |
| s02 | 32017R0458 | consolidated | 02016R0399-20170407 | de, fr, en |
| s03 | 32017R2225 | reconstructed | 02016R0399-20240710 | de, fr, en |
| s04 | 32018R1240 | patched | 02018R1240-20260612 | de, fr, en |
| s05 | 32019R0817 | reconstructed | 02016R0399-20240710 | de, fr, en |
| s06 | 32021R1134 | reconstructed | 02016R0399-20240710 | de, fr, en |
| s07 | 32024R1717 | patched | 02016R0399-20240710 | de, fr, en |
| s08 | 32024R1717R(01) | patched | 02016R0399-20251012 | de |

Begründung der Verfeinerung gegenüber SPEC §4: s08 ist ein zusätzlicher Stand für die Berichtigung 32024R1717R(01) (nur DE; Art. 25 Abs. 1 Bst. a), Quelle konsolidierte Fassung 20251012. In FR und EN unterscheidet sich 20251012 nicht von 20240710 (geprüft), darum führt s08 nur "de". Die Berichtigung 32016R0399R(03) (nur DE) ändert ausschliesslich den Titel der Verordnung ("Gemeinschaftskodex" → "Unionskodex"), keinen Artikel oder Anhang; sie ist daher kein eigener Stand (der Werktitel in `work.title` ist die berichtigte Fassung). Alle übrigen Berichtigungen des SGK (R(01), R(02), R(04)–R(08)) betreffen laut Cellar (SPARQL, Sprachfassungen der Berichtigungen) nur andere Sprachen (FI, DA, ES, MT, HR) und sind nicht abgebildet.

Stand-Datum (`date`): bei EUR-Lex-Fassungen das Konsolidierungsdatum, bei rekonstruierten Ständen das Datum der Veröffentlichung des Änderungsakts im Amtsblatt. Anwendbarkeit ist bewusst nicht Teil der Stände (SPEC §4).

## 3 Parser

`src/core/parser.js` liest drei EUR-Lex-Formate in dieselbe Struktur (Einheiten → Blöcke):

- ABl.-Fassung (Klassen `oj-*`): Aufzählungen als zwei- oder dreispaltige Layout-Tabellen; echte Tabellen haben die Klasse `oj-table`. Der verborgene EUR-Lex-"Text von Bild" wird als Text des Bildblocks übernommen.
- Konsolidiert, altes Format (2016/2017): Aufzählungen als eingerückte `div`; nach Markern oft flach statt verschachtelt; keine Bilder (die Bildblöcke werden aus dem Vorstand übernommen, siehe 6.8).
- Konsolidiert, neues Format (2024/2025): `eli-subdivision`, `grid-container grid-list`, Absatznummern in `span.no-parag`; teilweise gemischt mit Elementen des alten Formats (eingerückte `div`, Layout-Tabellen in Anhang VI).

Marker (`p.modref`, `p.arrow`, Inline-Marker ►…◄) setzen die Herkunft (`o`) aller folgenden Blöcke; zugeordnet wird immer über die CELEX im Attribut `title` bzw. `href`, nie über die M-Nummer (Test vorhanden). Löschmarken (▼Mx —————) werden mit Position und Akt festgehalten. Fussnotenzeichen werden aus dem Text entfernt und als `fn` angehängt; die Klammern um entfernte Zeichen ebenfalls.

Gliederung: Die Hierarchie wird aus den Gliederungszeichen gebildet (Absatz, Ziffer, Buchstabe, römische Ziffer, Strich, Teil). Absatznummern sind sprachabhängig: DE "(1)", FR und EN "1."; Aufzählungsziffern DE "1.", FR "1)", EN "(1)". Mehrdeutige Zeichen (i, v, x als Buchstabe oder römische Ziffer; eingefügte Punkte wie "ia", "iiia", "b bis") werden aus dem Zusammenhang (offene Listen, Folgezeichen) entschieden.

Schlüssel: Pfad gemäss SPEC §5.2. Stabilität über Stände: Blöcke mit identischem Wortlaut (nach Normalisierung) übernehmen den Schlüssel der Vorfassung; die Zuordnung wird für alle drei Sprachen gemeinsam bestimmt. Für den Stand s02 (flaches altes Format) dient zusätzlich die Fassung 20240710 als Strukturvorlage. Konflikte zwischen den Sprachen bei dieser Zuordnung: 0.

Normalisierung für Vergleiche (nicht für die Anzeige): Leerraum und geschützte Leerzeichen, Anführungszeichen-Varianten, Gedankenstrich-Varianten, Leerzeichen um Satzzeichen (FR-Typografie), "n°/nº/n<sup>o</sup>"; bei Überschriften zusätzlich Gross-/Kleinschreibung (die ABl.-Fassung speichert Anhangüberschriften in Kleinschreibung, z. B. "Erfassung von informationen"). Fussnoten, Tiefe und die Schreibweise des Gliederungszeichens lösen keine neue Version aus. Unveränderte Blöcke übernehmen in der neuen Version exakt die Darstellung der Vorfassung.

## 4 Rekonstruktion der Zwischenstände (Methode)

EUR-Lex bietet zwischen dem 7.4.2017 und dem 10.7.2024 keine konsolidierte Fassung. Die Stände nach 2017/2225 (s03), 2019/817 (s05) und 2021/1134 (s06) werden darum wie folgt hergeleitet:

1. Ausgangspunkt ist die konsolidierte Fassung vom 10.7.2024. Ihre Marker zeigen für jeden Absatz, Buchstaben usw., von welchem Akt der heutige Wortlaut stammt und ob er eingefügt oder ersetzt wurde; Löschmarken zeigen, wo ein Akt Text gestrichen hat.
2. Zweite Quelle ist die konsolidierte Fassung vom 7.4.2017 (Stand nach 2017/458).
3. "Anker" sind Bestimmungen, deren Wortlaut seit 2017 unverändert ist: Sie stammen laut Marker vom Basisakt, von 2016/1624 oder 2017/458 und stehen in beiden Fassungen gleich. Zwischen zwei Ankern liegt jeweils ein Bereich, in dem sich etwas geändert hat.
4. Für den Stand nach Akt X wird jeder Bereich so behandelt: Bestimmungen, deren Wortlaut von X oder einem früheren Akt stammt, bleiben. Bestimmungen, die erst ein späterer Akt eingefügt hat, entfallen. Wo ein späterer Akt ersetzt oder gestrichen hat, wird der Wortlaut von 2017 an dieser Stelle wiederhergestellt.
5. Kommt in einem Bereich sowohl ein früherer als auch ein späterer Akt vor, wäre die Zuordnung nicht eindeutig. Solche Bereiche werden gemeldet: 0 Fälle.
6. Zeichensetzung: Fügt ein Akt nach einer Bestimmung einen neuen Punkt an, passt EUR-Lex das Schlusszeichen der vorangehenden Bestimmung an (z. B. "." → ";"), ohne Marker. Diese Anpassung wird dem Akt zugeordnet, der den folgenden Punkt eingefügt hat (Blockfeld `x: "punct"`). Liste in 6.4.
7. Kontrolle: (a) Selbsttest – mit demselben Verfahren alle Akte nach 2017/458 zurücknehmen muss die Fassung 20170407 ergeben; (b) jeder eingefügte oder ersetzte Block muss im Änderungsakt selbst stehen (6.2); (c) jede im Änderungsakt zitierte Neufassung muss im entsprechenden Stand stehen (6.3); (d) Abgleich mit den Änderungslisten in data/acts.json (6.7).

Grenzen der Methode: Hätte ein späterer Akt eine Bestimmung ersetzt, die ein Zwischenakt (2017/2225, 2019/817, 2021/1134) zuvor geändert hatte, wäre der Zwischenwortlaut weder in 2017 noch in 2024 enthalten. Die Umkehrprüfung (6.3) findet alle zitierten Neufassungen dieser Akte im jeweiligen Stand (Ausnahme: Formulare und Schilder, die nur als Bild vorliegen); ein solcher Fall tritt somit nicht auf.

## 5 ETIAS-Patch (Verordnung (EU) 2018/1240, Art. 80)

EUR-Lex hat Art. 80 der Verordnung (EU) 2018/1240 in keine konsolidierte Fassung des SGK eingearbeitet. Der Wortlaut wird darum 1:1 aus der konsolidierten Fassung der Verordnung (EU) 2018/1240 vom 12.6.2026 (raw/02018R1240-20260612_*.html) übernommen. Dort ist Art. 80 Nr. 2 Bst. a durch die Berichtigung 32018R1240R(03) (ABl. L 193 vom 17.6.2020, S. 16; alle Sprachen) korrigiert: Neu gefasst wird Art. 8 Abs. 3 Bst. a **Ziff. ii** (Visum/Reisegenehmigung/Aufenthaltstitel), nicht Ziff. i wie in der ABl.-Fassung. SPEC §5.4 nennt noch Ziff. i; massgeblich ist die berichtigte Fassung.

Patch-Punkte (gelten ab s04 und in allen späteren Ständen, sofern kein späterer Akt dieselbe Bestimmung ändert – das ist nicht der Fall): Art. 6 Abs. 1 Bst. b (neu gefasst), Art. 6 Abs. 1 Unterabsätze 2 und 3 (angefügt nach Bst. f, Schlüssel `p1.s2`, `p1.s3`), Art. 8 Abs. 3 Bst. a Ziff. ii (neu gefasst, Herkunft `32018R1240R(03)`), Art. 8 Abs. 3 Bst. ba (eingefügt), Anhang V Teil B Punkt C.

Anhang V Teil B: Das Standardformular ist in allen EUR-Lex-Fassungen nur als Bild enthalten. Der neue Wortlaut von Punkt C steht darum als eigener Textblock `ptB.c` unter dem Bild, mit Hinweis im Feld `nt`. Geprüft (Sichtprüfung des Bildes aus 20240710 DE): Das Bild enthält den von 2017/2225 eingefügten Punkt J, Punkt C lautet dort noch "ohne gültiges Visum oder gültigen Aufenthaltstitel".

Prüfung des Patch-Wortlauts gegen die konsolidierte Fassung 2018/1240 und gegen die ABl.-Fassung 32018R1240:

| Sprache | Schlüssel | Herkunft | konsolidiert 2018/1240 | ABl. 32018R1240 |
|---|---|---|---|---|
| de | p1.b | 32018R1240 | exakt | exakt |
| de | p1.s2 | 32018R1240 | exakt | exakt |
| de | p1.s3 | 32018R1240 | exakt | exakt |
| de | p3.a.ii | 32018R1240R(03) | exakt | Abweichung (Berichtigung R(03)) |
| de | p3.ba | 32018R1240 | exakt | exakt |
| de | ptB.c | 32018R1240 | exakt | exakt |
| fr | p1.b | 32018R1240 | exakt | exakt |
| fr | p1.s2 | 32018R1240 | exakt | exakt |
| fr | p1.s3 | 32018R1240 | exakt | exakt |
| fr | p3.a.ii | 32018R1240R(03) | exakt | Abweichung (Berichtigung R(03)) |
| fr | p3.ba | 32018R1240 | exakt | exakt |
| fr | ptB.c | 32018R1240 | exakt | exakt |
| en | p1.b | 32018R1240 | exakt | exakt |
| en | p1.s2 | 32018R1240 | exakt | exakt |
| en | p1.s3 | 32018R1240 | exakt | exakt |
| en | p3.a.ii | 32018R1240R(03) | exakt | Abweichung (Berichtigung R(03)) |
| en | p3.ba | 32018R1240 | exakt | exakt |
| en | ptB.c | 32018R1240 | exakt | exakt |

Die Abweichung zur ABl.-Fassung betrifft nur Ziff. ii und ist die Berichtigung R(03). Die Zuordnung der Patch-Punkte wird beim Build gegen den Wortlaut der Änderungsanweisungen in allen drei Sprachen geprüft (Abbruch bei Abweichung).

Geprüfte Berichtigungen der Änderungsakte (Cellar/SPARQL, Sprachfassungen DE/FR/EN, Inhalt gelesen): 32017R2225R(01) betrifft Art. 6a Abs. 3 Bst. f (in s03 enthalten, Herkunft `32017R2225R(01)`); 32018R1240R(03) betrifft Art. 80 (siehe oben); 32024R1717R(01) (nur DE) betrifft Art. 25 Abs. 1 Bst. a (Stand s08). Ohne Bezug zum SGK-Text: 32018R1240R(01) und R(06) (DE: Art. 9 und 45 ETIAS), 32019R0817R(01) und R(05) (Art. 62 und 18), 32021R1134R(01) und R(03) (Art. 1, VIS-Verordnung). Alle anderen Berichtigungen dieser Akte liegen nur in anderen Sprachen vor. 2016/1624 und 2017/458 haben keine Berichtigung in DE/FR/EN.

## 6 Prüfungen

### 6.1 Abdeckung des Wortlauts

Vergleich wortweise (Wörter und Satzzeichen nach Normalisierung, Myers-Diff). Quelle: sichtbarer Fliesstext ab Artikel 1 einschliesslich Anhänge, ohne Marker, Fussnotenzeichen, Fussnoten, Schlussformel und Bildtexte. Ausgabe: Gliederungsüberschriften, Artikel-/Anhangbezeichnung, Titel, Gliederungszeichen und Text aller Blöcke in Reihenfolge.

Parser gegen Quelle:

| Stand | Quelle | Sprache | Wörter Quelle | Abdeckung | fehlend | zusätzlich |
|---|---|---|---|---|---|---|
| s00 | 32016R0399 | de | 18'660 | 100,00 % | 0 | 0 |
| s00 | 32016R0399 | fr | 24'546 | 100,00 % | 0 | 0 |
| s00 | 32016R0399 | en | 21'578 | 100,00 % | 0 | 0 |
| s01 | 02016R0399-20161006 | de | 18'694 | 100,00 % | 0 | 0 |
| s01 | 02016R0399-20161006 | fr | 24'586 | 100,00 % | 0 | 0 |
| s01 | 02016R0399-20161006 | en | 21'620 | 100,00 % | 0 | 0 |
| s02 | 02016R0399-20170407 | de | 19'871 | 100,00 % | 0 | 0 |
| s02 | 02016R0399-20170407 | fr | 26'225 | 100,00 % | 0 | 0 |
| s02 | 02016R0399-20170407 | en | 22'982 | 100,00 % | 0 | 0 |
| s07 | 02016R0399-20240710 | de | 30'727 | 100,00 % | 0 | 0 |
| s07 | 02016R0399-20240710 | fr | 41'000 | 100,00 % | 0 | 0 |
| s07 | 02016R0399-20240710 | en | 35'097 | 100,00 % | 0 | 0 |
| s08 | 02016R0399-20251012 | de | 30'726 | 100,00 % | 0 | 0 |
| s08 | 02016R0399-20251012 | fr | 41'000 | 100,00 % | 0 | 0 |
| s08 | 02016R0399-20251012 | en | 35'097 | 100,00 % | 0 | 0 |

Datensatz (Version je Stand) gegen Quelle. Bei s07/s08 sind die zusätzlichen Wörter der ETIAS-Patch, die fehlenden die vom Patch ersetzten Wörter:

| Stand | Sprache | Abdeckung | fehlend | zusätzlich |
|---|---|---|---|---|
| s00 | de | 100,00 % | 0 | 0 |
| s00 | fr | 100,00 % | 0 | 0 |
| s00 | en | 100,00 % | 0 | 0 |
| s01 | de | 100,00 % | 0 | 0 |
| s01 | fr | 100,00 % | 0 | 0 |
| s01 | en | 100,00 % | 0 | 0 |
| s02 | de | 100,00 % | 0 | 0 |
| s02 | fr | 100,00 % | 0 | 0 |
| s02 | en | 100,00 % | 0 | 0 |
| s07 | de | 99,99 % | 3 | 399 |
| s07 | fr | 100,00 % | 1 | 618 |
| s07 | en | 100,00 % | 1 | 486 |
| s08 | de | 99,99 % | 3 | 399 |
| s08 | fr | 100,00 % | 1 | 618 |
| s08 | en | 100,00 % | 1 | 486 |

Datensatz s07/s08 gegen Quelle mit angewendetem Patch:

| Stand | Sprache | Abdeckung | fehlend | zusätzlich |
|---|---|---|---|---|
| s07 | de | 100,00 % | 0 | 0 |
| s07 | fr | 100,00 % | 0 | 0 |
| s07 | en | 100,00 % | 0 | 0 |
| s08 | de | 100,00 % | 0 | 0 |
| s08 | fr | 100,00 % | 0 | 0 |
| s08 | en | 100,00 % | 0 | 0 |

Lücken: keine.

### 6.2 Wortlaut gegen Änderungsakt (Pflichtprüfung SPEC §5.4)

Jeder Block, der in "seinem" Stand eingefügt oder ersetzt wurde (Herkunft = Akt dieses Stands), muss im Text des Änderungsakts (raw/<CELEX>_<LANG>.html) vorkommen. Bei Berichtigungen muss der berichtigte Wortlaut ("muss es heissen …") im Block stehen. Normalisierung zusätzlich: verschachtelte Anführungszeichen des Änderungsakts (‚…‘) gleich „…“, Fussnotenzeichen "(*1)" entfernt.

| Akt | Stand | Sprache | geprüft | übereinstimmend | abweichend | mit Vermerk |
|---|---|---|---|---|---|---|
| 32016R1624 | s01 | de | 1 | 1 | 0 | 0 |
| 32016R1624 | s01 | fr | 1 | 1 | 0 | 0 |
| 32016R1624 | s01 | en | 1 | 1 | 0 | 0 |
| 32017R0458 | s02 | de | 38 | 38 | 0 | 4 |
| 32017R0458 | s02 | fr | 38 | 38 | 0 | 3 |
| 32017R0458 | s02 | en | 38 | 38 | 0 | 5 |
| 32017R2225 | s03 | de | 167 | 167 | 0 | 5 |
| 32017R2225 | s03 | fr | 167 | 167 | 0 | 2 |
| 32017R2225 | s03 | en | 167 | 167 | 0 | 4 |
| 32019R0817 | s05 | de | 2 | 2 | 0 | 0 |
| 32019R0817 | s05 | fr | 2 | 2 | 0 | 0 |
| 32019R0817 | s05 | en | 2 | 2 | 0 | 0 |
| 32021R1134 | s06 | de | 9 | 9 | 0 | 1 |
| 32021R1134 | s06 | fr | 9 | 9 | 0 | 1 |
| 32021R1134 | s06 | en | 9 | 9 | 0 | 0 |
| 32024R1717 | s07 | de | 166 | 166 | 0 | 0 |
| 32024R1717 | s07 | fr | 166 | 166 | 0 | 0 |
| 32024R1717 | s07 | en | 166 | 166 | 0 | 2 |
| 32017R2225R(01) | s03 | de | 1 | 1 | 0 | 1 |
| 32017R2225R(01) | s03 | fr | 1 | 1 | 0 | 1 |
| 32017R2225R(01) | s03 | en | 1 | 1 | 0 | 1 |
| 32024R1717R(01) | s08 | de | 1 | 1 | 0 | 1 |

Abweichungen: keine.

Vermerke (Wortlaut identisch, aber Schlusszeichen oder Gross-/Kleinschreibung weichen vom Akt ab). Ursache ist jeweils die konsolidierte Fassung von EUR-Lex: Am Ende einer Neufassung steht im Akt "." und ein schliessendes Anführungszeichen, im konsolidierten Text ";" oder ",", weil ein weiterer Punkt folgt; bei 2017/2225 Art. 8 Abs. 3 Bst. a Ziff. iii (DE) schreibt EUR-Lex "Bei" statt "bei". Der Datensatz gibt in diesen Fällen den EUR-Lex-Text wieder.

- 32017R0458 DE art_8 p3.a.i.s2: ohne Schlusszeichen
- 32017R0458 DE art_8 p3.a.ii: ohne Schlusszeichen
- 32017R0458 DE art_8 p3.g.i.s2: ohne Schlusszeichen
- 32017R0458 DE art_8 p3.ia.s2: ohne Schlusszeichen
- 32017R0458 FR art_8 p3.a.ii: ohne Schlusszeichen
- 32017R0458 FR art_8 p3.a.vi: ohne Schlusszeichen
- 32017R0458 FR art_8 p3.g.ii: ohne Schlusszeichen
- 32017R0458 EN art_8 p3.a.i.s2: ohne Schlusszeichen
- 32017R0458 EN art_8 p3.a.ii: ohne Schlusszeichen
- 32017R0458 EN art_8 p3.a.vi: ohne Schlusszeichen
- 32017R0458 EN art_8 p3.g.i.s2: ohne Schlusszeichen
- 32017R0458 EN art_8 p3.g.ii: ohne Schlusszeichen
- 32017R2225 DE art_2 n26: ohne Schlusszeichen
- 32017R2225 DE art_8 p3.a.iii: Gross-/Kleinschreibung
- 32017R2225 DE art_8 p3.a.iiia: ohne Schlusszeichen
- 32017R2225 DE art_8 p3.g.iii: ohne Schlusszeichen
- 32017R2225 DE anx_VII n1.s1: ohne Schlusszeichen
- 32017R2225 FR art_2 n26: ohne Schlusszeichen
- 32017R2225 FR anx_VII n1.s1: Gross-/Kleinschreibung
- 32017R2225 EN art_2 n22: Gross-/Kleinschreibung
- 32017R2225 EN art_2 n26: ohne Schlusszeichen
- 32017R2225 EN art_8 p2.a.s2: ohne Schlusszeichen
- 32017R2225 EN anx_VII n1.s1: ohne Schlusszeichen
- 32021R1134 DE art_8 p3.bb.s2: ohne Schlusszeichen
- 32021R1134 FR art_8 p3.bb.s2: ohne Schlusszeichen
- 32024R1717 EN art_2 n27: ohne Schlusszeichen
- 32024R1717 EN art_21a p7: ohne Schlusszeichen

### 6.3 Umkehrprüfung: Neufassungen im Akt → Stand

Jede im Änderungsartikel zitierte Neufassung ("erhält folgende Fassung: „…“", "wird eingefügt: „…“") muss im Stand des Akts vorkommen.

| Akt | Sprache | zitierte Blöcke | gefunden | nicht gefunden | davon nur im Bildtext |
|---|---|---|---|---|---|
| 32016R1624 | de | 1 | 1 | 0 | 0 |
| 32016R1624 | fr | 1 | 1 | 0 | 0 |
| 32016R1624 | en | 1 | 1 | 0 | 0 |
| 32017R0458 | de | 38 | 38 | 0 | 0 |
| 32017R0458 | fr | 38 | 38 | 0 | 0 |
| 32017R0458 | en | 38 | 38 | 0 | 0 |
| 32017R2225 | de | 200 | 189 | 11 | 2 |
| 32017R2225 | fr | 198 | 190 | 8 | 1 |
| 32017R2225 | en | 198 | 191 | 7 | 1 |
| 32019R0817 | de | 2 | 2 | 0 | 0 |
| 32019R0817 | fr | 2 | 2 | 0 | 0 |
| 32019R0817 | en | 2 | 2 | 0 | 0 |
| 32021R1134 | de | 9 | 9 | 0 | 0 |
| 32021R1134 | fr | 9 | 9 | 0 | 0 |
| 32021R1134 | en | 9 | 9 | 0 | 0 |
| 32024R1717 | de | 161 | 161 | 0 | 0 |
| 32024R1717 | fr | 161 | 161 | 0 | 0 |
| 32024R1717 | en | 161 | 161 | 0 | 0 |

Nicht gefundene Stellen und Erklärung:

- 2016/1624 DE: Der Änderungsakt nummeriert den neu gefassten Absatz "1." statt "(1)" (DE-Schreibweise des SGK). Wortlaut identisch (6.2), nur Gliederungszeichen.
- 2017/2225, Anhang (Nr. 1 und Nr. 3): Texte der Schilder in Anhang III Teil D/E und Änderungen des Standardformulars in Anhang V Teil B (neuer Punkt J, Text unter "Bemerkungen"). Diese Inhalte sind in allen EUR-Lex-Fassungen nur als Bild wiedergegeben; als Text sind sie im Datensatz nicht vorhanden. Für Anhang V Teil B: Sichtprüfung des Bildes (DE) bestätigt Punkt J. Auffällig: Der verborgene EUR-Lex-"Text von Bild" der Fassung 20251012 zu Anhang V Teil B enthält Punkt J nicht (er gibt das Formular von 2016 wieder).
- 2017/2225 DE, Art. 1 Nr. 2 Bst. b: Anweisungssatz, der von der Erkennung als zitierter Text gelesen wird (kein Inhalt).

- 32017R2225 DE (art_1 n2.b): nicht gefunden — «Folgender Absatz wird eingefügt:»
- 32017R2225 DE (art_1 n3.q18): abweichend — «Staatsangehörige von Andorra, Monaco und San Marino sowie Inhaber eines durch den Staat Vatikanstadt ausgestel»
- 32017R2225 DE (art_1 n10): nicht gefunden — «Folgender Artikel wird eingefügt:»
- 32017R2225 DE (anx n1.q5): nicht gefunden, im Bildtext vorhanden — «EU / EWR / CH»
- 32017R2225 DE (anx n1.q11): nicht gefunden, im Bildtext vorhanden — «DRITTSTAATS-»
- 32017R2225 DE (anx n3.b.i.q1): nicht gefunden — «hat sich geweigert, seine biometrischen Daten bereitzustellen, falls dies erforderlich ist, um»
- 32017R2225 DE (anx n3.b.i.q2): nicht gefunden — «sein persönliches Dossier im Einreise-/Ausreisesystem anzulegen»
- 32017R2225 DE (anx n3.b.i.q3): nicht gefunden — «die Grenzübertrittskontrolle durchzuführen.»
- 32017R2225 DE (anx n3.b.ii.q1): nicht gefunden — «(vom Grenzschutzbeamten anzukreuzen, wenn die Daten im Einreise-/Ausreisesystem gespeichert werden)»
- 32017R2225 DE (anx n3.b.ii.q2): nicht gefunden — «Hiermit wird die betreffende Person darüber informiert, dass ihre persönlichen Daten sowie Informationen zu de»
- 32017R2225 DE (anx n3.b.ii.q3): nicht gefunden — «Gemäß Artikel 52 der Verordnung (EU) 2017/2226 hat die betreffende Person das Recht auf Auskunft über die im E»
- 32017R2225 FR (anx n1.q5): nicht gefunden, im Bildtext vorhanden — «UE / EEE / CH»
- 32017R2225 FR (anx n3.b.i.q1): nicht gefunden — «a refusé de fournir les données biométriques requises»
- 32017R2225 FR (anx n3.b.i.q2): abweichend — «pour créer le dossier individuel dans le système d'entrée/de sortie»
- 32017R2225 FR (anx n3.b.i.q3): abweichend — «pour effectuer les vérifications aux frontières.»
- 32017R2225 FR (anx n3.b.ii.q1): nicht gefunden — «(à cocher par le garde-frontière si des données sont stockées dans le système d'entrée/de sortie)»
- 32017R2225 FR (anx n3.b.ii.q2): abweichend — «La personne intéressée est informée que ses données à caractère personnel et les informations relatives au pré»
- 32017R2225 FR (anx n3.b.ii.q3): nicht gefunden — «Conformément à l'article 52 du règlement (UE) 2017/2226, la personne intéressée a le droit d'obtenir les donné»
- 32017R2225 FR (anx n4.q1): abweichend — «Chefs d'État, chefs de gouvernement et membres des gouvernements nationaux, ainsi que leurs conjoints qui les »
- 32017R2225 EN (anx n1.q5): nicht gefunden, im Bildtext vorhanden — «EU / EEA / CH»
- 32017R2225 EN (anx n3.b.i.q1): abweichend — «has refused to provide biometric data, if required»
- 32017R2225 EN (anx n3.b.i.q2): nicht gefunden — «for the creation of the individual file in the Entry/Exit System»
- 32017R2225 EN (anx n3.b.i.q3): nicht gefunden — «to carry out the border checks.»
- 32017R2225 EN (anx n3.b.ii.q1): nicht gefunden — «(to be marked by the border guard if data is stored in the Entry/Exit System)»
- 32017R2225 EN (anx n3.b.ii.q2): abweichend — «The person concerned is hereby informed that her/his personal data and information on this refusal of entry ar»
- 32017R2225 EN (anx n3.b.ii.q3): nicht gefunden — «In accordance with Article 52 of Regulation (EU) 2017/2226, the person concerned has the right to obtain the d»

### 6.4 Differenzen zwischen den Ständen

Jede Änderung eines Stands muss vom Akt dieses Stands stammen (Herkunft `o`), eine Löschung sein oder als Zeichensetzungs-Folgeanpassung (`punct`) bzw. redaktionelle Abweichung (`editorial`) ausgewiesen sein.

s00 → s01 (2016/1624, Art. 80 = Art. 29 Abs. 1 SGK):

- DE art_29 p1: replaced (Herkunft 32016R1624)
- FR art_29 p1: replaced (Herkunft 32016R1624)
- EN art_4 s1: editorial (Herkunft 32016R0399) [editorial]
- EN art_29 p1: replaced (Herkunft 32016R1624)

s01 → s02 (2017/458, Art. 1 = Art. 8 SGK):

- DE art_8 p2: replaced (Herkunft 32017R0458)
- DE art_8 p2.a: inserted (Herkunft 32017R0458)
- DE art_8 p2.a.n1: inserted (Herkunft 32017R0458)
- DE art_8 p2.a.n2: inserted (Herkunft 32017R0458)
- DE art_8 p2.a.n3: inserted (Herkunft 32017R0458)
- DE art_8 p2.a.s2: inserted (Herkunft 32017R0458)
- DE art_8 p2.b: inserted (Herkunft 32017R0458)
- DE art_8 p2.b.s2: inserted (Herkunft 32017R0458)
- DE art_8 p2a: inserted (Herkunft 32017R0458)
- DE art_8 p2a.s2: inserted (Herkunft 32017R0458)
- DE art_8 p2a.s3: inserted (Herkunft 32017R0458)
- DE art_8 p2a.s4: inserted (Herkunft 32017R0458)
- DE art_8 p2b: inserted (Herkunft 32017R0458)
- DE art_8 p2b.s2: inserted (Herkunft 32017R0458)
- DE art_8 p2c: inserted (Herkunft 32017R0458)
- DE art_8 p2d: inserted (Herkunft 32017R0458)
- DE art_8 p2d.s2: inserted (Herkunft 32017R0458)
- DE art_8 p2d.s3: inserted (Herkunft 32017R0458)
- DE art_8 p2d.s4: inserted (Herkunft 32017R0458)
- DE art_8 p2e: inserted (Herkunft 32017R0458)
- DE art_8 p2e.s2: inserted (Herkunft 32017R0458)
- DE art_8 p2f: inserted (Herkunft 32017R0458)
- DE art_8 p3.a.i: replaced (Herkunft 32017R0458)
- DE art_8 p3.a.i.n1: inserted (Herkunft 32017R0458)
- DE art_8 p3.a.i.n2: inserted (Herkunft 32017R0458)
- DE art_8 p3.a.i.n3: inserted (Herkunft 32017R0458)
- DE art_8 p3.a.i.s2: inserted (Herkunft 32017R0458)
- DE art_8 p3.a.ii: replaced (Herkunft 32017R0458)
- DE art_8 p3.a.vi: replaced (Herkunft 32017R0458)
- DE art_8 p3.g.i: replaced (Herkunft 32017R0458)
- DE art_8 p3.g.i.n1: inserted (Herkunft 32017R0458)
- DE art_8 p3.g.i.n2: inserted (Herkunft 32017R0458)
- DE art_8 p3.g.i.n3: inserted (Herkunft 32017R0458)
- DE art_8 p3.g.i.s2: inserted (Herkunft 32017R0458)
- DE art_8 p3.g.ii: replaced (Herkunft 32017R0458)
- DE art_8 p3.ia: inserted (Herkunft 32017R0458)
- DE art_8 p3.ia.s2: inserted (Herkunft 32017R0458)
- DE art_8 p3.ib: inserted (Herkunft 32017R0458)
- DE art_8 p2.s2: deleted
- DE art_8 p2.s3: deleted
- DE art_8 p2.s4: deleted
- DE art_8 p3.g.iii: deleted
- DE art_8 p3.h.iii: deleted
- FR art_8 p2: replaced (Herkunft 32017R0458)
- FR art_8 p2.a: inserted (Herkunft 32017R0458)
- FR art_8 p2.a.n1: inserted (Herkunft 32017R0458)
- FR art_8 p2.a.n2: inserted (Herkunft 32017R0458)
- FR art_8 p2.a.n3: inserted (Herkunft 32017R0458)
- FR art_8 p2.a.s2: inserted (Herkunft 32017R0458)
- FR art_8 p2.b: inserted (Herkunft 32017R0458)
- FR art_8 p2.b.s2: inserted (Herkunft 32017R0458)
- FR art_8 p2a: inserted (Herkunft 32017R0458)
- FR art_8 p2a.s2: inserted (Herkunft 32017R0458)
- FR art_8 p2a.s3: inserted (Herkunft 32017R0458)
- FR art_8 p2a.s4: inserted (Herkunft 32017R0458)
- FR art_8 p2b: inserted (Herkunft 32017R0458)
- FR art_8 p2b.s2: inserted (Herkunft 32017R0458)
- FR art_8 p2c: inserted (Herkunft 32017R0458)
- FR art_8 p2d: inserted (Herkunft 32017R0458)
- FR art_8 p2d.s2: inserted (Herkunft 32017R0458)
- FR art_8 p2d.s3: inserted (Herkunft 32017R0458)
- FR art_8 p2d.s4: inserted (Herkunft 32017R0458)
- FR art_8 p2e: inserted (Herkunft 32017R0458)
- FR art_8 p2e.s2: inserted (Herkunft 32017R0458)
- FR art_8 p2f: inserted (Herkunft 32017R0458)
- FR art_8 p3.a.i: replaced (Herkunft 32017R0458)
- FR art_8 p3.a.i.n1: inserted (Herkunft 32017R0458)
- FR art_8 p3.a.i.n2: inserted (Herkunft 32017R0458)
- FR art_8 p3.a.i.n3: inserted (Herkunft 32017R0458)
- FR art_8 p3.a.i.s2: inserted (Herkunft 32017R0458)
- FR art_8 p3.a.ii: replaced (Herkunft 32017R0458)
- FR art_8 p3.a.vi: replaced (Herkunft 32017R0458)
- FR art_8 p3.g.i: replaced (Herkunft 32017R0458)
- FR art_8 p3.g.i.n1: inserted (Herkunft 32017R0458)
- FR art_8 p3.g.i.n2: inserted (Herkunft 32017R0458)
- FR art_8 p3.g.i.n3: inserted (Herkunft 32017R0458)
- FR art_8 p3.g.i.s2: inserted (Herkunft 32017R0458)
- FR art_8 p3.g.ii: replaced (Herkunft 32017R0458)
- FR art_8 p3.i: punct (Herkunft 32016R0399) [punct]
- FR art_8 p3.ia: inserted (Herkunft 32017R0458)
- FR art_8 p3.ia.s2: inserted (Herkunft 32017R0458)
- FR art_8 p3.ib: inserted (Herkunft 32017R0458)
- FR art_8 p2.s2: deleted
- FR art_8 p2.s3: deleted
- FR art_8 p2.s4: deleted
- FR art_8 p3.g.iii: deleted
- FR art_8 p3.h.iii: deleted
- EN art_8 p2: replaced (Herkunft 32017R0458)
- EN art_8 p2.a: inserted (Herkunft 32017R0458)
- EN art_8 p2.a.n1: inserted (Herkunft 32017R0458)
- EN art_8 p2.a.n2: inserted (Herkunft 32017R0458)
- EN art_8 p2.a.n3: inserted (Herkunft 32017R0458)
- EN art_8 p2.a.s2: inserted (Herkunft 32017R0458)
- EN art_8 p2.b: inserted (Herkunft 32017R0458)
- EN art_8 p2.b.s2: inserted (Herkunft 32017R0458)
- EN art_8 p2a: inserted (Herkunft 32017R0458)
- EN art_8 p2a.s2: inserted (Herkunft 32017R0458)
- EN art_8 p2a.s3: inserted (Herkunft 32017R0458)
- EN art_8 p2a.s4: inserted (Herkunft 32017R0458)
- EN art_8 p2b: inserted (Herkunft 32017R0458)
- EN art_8 p2b.s2: inserted (Herkunft 32017R0458)
- EN art_8 p2c: inserted (Herkunft 32017R0458)
- EN art_8 p2d: inserted (Herkunft 32017R0458)
- EN art_8 p2d.s2: inserted (Herkunft 32017R0458)
- EN art_8 p2d.s3: inserted (Herkunft 32017R0458)
- EN art_8 p2d.s4: inserted (Herkunft 32017R0458)
- EN art_8 p2e: inserted (Herkunft 32017R0458)
- EN art_8 p2e.s2: inserted (Herkunft 32017R0458)
- EN art_8 p2f: inserted (Herkunft 32017R0458)
- EN art_8 p3.a.i: replaced (Herkunft 32017R0458)
- EN art_8 p3.a.i.n1: inserted (Herkunft 32017R0458)
- EN art_8 p3.a.i.n2: inserted (Herkunft 32017R0458)
- EN art_8 p3.a.i.n3: inserted (Herkunft 32017R0458)
- EN art_8 p3.a.i.s2: inserted (Herkunft 32017R0458)
- EN art_8 p3.a.ii: replaced (Herkunft 32017R0458)
- EN art_8 p3.a.vi: replaced (Herkunft 32017R0458)
- EN art_8 p3.g.i: replaced (Herkunft 32017R0458)
- EN art_8 p3.g.i.n1: inserted (Herkunft 32017R0458)
- EN art_8 p3.g.i.n2: inserted (Herkunft 32017R0458)
- EN art_8 p3.g.i.n3: inserted (Herkunft 32017R0458)
- EN art_8 p3.g.i.s2: inserted (Herkunft 32017R0458)
- EN art_8 p3.g.ii: replaced (Herkunft 32017R0458)
- EN art_8 p3.i: punct (Herkunft 32016R0399) [punct]
- EN art_8 p3.ia: inserted (Herkunft 32017R0458)
- EN art_8 p3.ia.s2: inserted (Herkunft 32017R0458)
- EN art_8 p3.ib: inserted (Herkunft 32017R0458)
- EN art_8 p2.s2: deleted
- EN art_8 p2.s3: deleted
- EN art_8 p2.s4: deleted
- EN art_8 p3.g.iii: deleted
- EN art_8 p3.h.iii: deleted

Nicht durch einen Akt erklärte Differenzen (alle Stände): 

- s01 EN art_4 s1: editorial, Herkunft 32016R0399
- s07 FR art_2 n16.b.ii: editorial, Herkunft 32016R0399

Zeichensetzungs-Folgeanpassungen (`punct`, dem Akt des Stands zugeordnet):

- s02 FR art_8 p3.i
- s02 EN art_8 p3.i
- s03 DE art_2 n21
- s03 FR art_2 n21
- s03 FR art_6 p1.e
- s03 EN art_2 n21
- s03 EN art_6 p1.e
- s07 DE art_39 p1.g
- s07 FR art_39 p1.g
- s07 EN art_39 p1.g

### 6.5 Sprachübergreifende Konsistenz (SPEC §5.3)

Schlüsselmengen und Reihenfolge je Einheit und Stand in DE, FR, EN: 0 Abweichungen. Zusätzlich je Quellfassung geprüft (Parser): identisch.

Änderungen, die nur in einzelnen Sprachen auftreten (erwartet, sprachspezifisch):

- s01 art_4:s1:editorial (en)
- s02 art_8:p3.i:punct (fr, en)
- s03 art_6:p1.e:punct (fr, en)
- s03 art_11:_title:replaced (en)
- s07 art_2:n16.b.ii:editorial (fr)
- s08 art_25:p1.a:replaced (de)

### 6.6 Selbsttest und Protokoll der Rekonstruktion

- DE: Rücknahme bis 2017/458 gegen 20170407: 0 abweichende Einheiten.
- FR: Rücknahme bis 2017/458 gegen 20170407: 0 abweichende Einheiten.
- EN: Rücknahme bis 2017/458 gegen 20170407: 0 abweichende Einheiten.
- Wiederhergestellte Bereiche (Wortlaut 2017 eingesetzt): 264 (über alle Stände und Sprachen); gemischte Bereiche: 0; unmarkierte Abweichungen innerhalb von Bereichen: 0; Anomalien: 0.
- Patch-Anwendung: 2225/de: 5/5, 2225/fr: 5/5, 2225/en: 5/5, 0817/de: 5/5, 0817/fr: 5/5, 0817/en: 5/5, 1134/de: 5/5, 1134/fr: 5/5, 1134/en: 5/5, 1717/de: 5/5, 1717/fr: 5/5, 1717/en: 5/5.

### 6.7 Abgleich mit data/acts.json (changes)

Ergebnis: 104 bestaetigt, 1 Gliederung (nicht geprueft).

- 32024R1717 tit_II.cpt_V heading (replaced): Gliederung (nicht geprueft)
- Hinweis an Agent RECHT: Die Gliederungs-Id für Kapitel V lautet im Datensatz `tit_II.cpt_V` (nicht `tit_II.cha_V`). Die geänderte Überschrift (2024/1717) erscheint im Datensatz ab s07.

### 6.8 Bilder (SPEC §5.6)

63 verwendete Bilder, dedupliziert über Hash der Originaldaten (cyrb53 über Base64). WebP, Qualität 80, Breite höchstens 1050 px. Grösse data/assets.json: 2,47 MB (Budget 2,5 MB). Um das Budget einzuhalten, wurde die Höchstbreite von 1200 px auf 1050 px reduziert.

Die alten konsolidierten Fassungen (20161006, 20170407) enthalten keine Bilder. Für s01 und s02 werden die Bildblöcke aus s00 (ABl.) übernommen. Bildblöcke lösen nur bei geänderter Herkunft eine neue Version aus (Bilddateien verschiedener Fassungen sind nicht bytegleich). Bildtext (`t`): EUR-Lex-"Text von Bild", sofern in der Quelle vorhanden (ABl.-Fassung); sonst leer.

### 6.9 Tests

- bestanden: changeApplicability: Akt-Datum, abweichendes Datum, hängig, Vorschlag, vor Annahme, verbraucht
- bestanden: findChange: exakter Schlüssel, Vorfahre, ganze Einheit
- bestanden: Eigenschaft: Datum nach allen Anwendungsdaten ohne hängige Akte = bisheriges Ergebnis (alle Einheiten, drei Sprachen)
- bestanden: Eigenschaft: ohne hängige Akte und nach allen Daten = jüngster Stand (synthetisch alle Akte anwendbar)
- bestanden: Eigenschaft: 15. Januar 2026 liefert Hinweise zu den ausgesetzten Bestimmungen
- bestanden: Hängige Änderungen erscheinen als Hinweis, nicht im Wortlaut (ETIAS, VIS-Revision, Interoperabilität)
- bestanden: Vor dem Basisakt und vor einem Änderungsakt
- bestanden: composeAt: blockweise Zusammensetzung gleich wie aktweise für alle Präfixe und Lücken
- bestanden: composeAt: bisherige Prädikate (celex) => boolean unverändert, erweiterte Form schliesst Einzelblöcke aus
- bestanden: derogations.json: Schema, Schlüssel existieren, dreisprachig
- bestanden: acts.json: applicableFrom nur bei Abweichung, gültiges Datum, nach Akt-Datum oder begründet
- bestanden: listWorks: Kopie der Liste, Reihenfolge bleibt
- bestanden: resolveCelex: Basisakt, konsolidierte Fassung, Berichtigung, fremd
- bestanden: stageAt: jüngster Stand mit date <= Datum
- bestanden: actsOfStage: stage.acts, Rückfall stage.act (SGK ohne acts), unbekannter Stand
- bestanden: echte Bibliothek: index.json, jedes Werk lösbar, stageAt/actsOfStage konsistent
- bestanden: composeAt: alle Akte bis und mit Stand N eingeschlossen ergibt exakt getVersion(N)
- bestanden: composeAt: ETIAS ausgeschlossen, spaetere Akte eingeschlossen (berechnete Sicht)
- bestanden: addSnapshot: Datensatz ohne 20251012 bauen, 20251012 per addSnapshot ergaenzen = Gesamtbuild
- bestanden: blockHistory: Art. 8 Abs. 3 Bst. a Ziff. ii
- bestanden: blockHistory: Art. 25 Abs. 1 Bst. a (DE-Berichtigung nur in DE)
- bestanden: Staende s00 -> s01 -> s02: nur Aenderungen der Akte 2016/1624 bzw. 2017/458 (oder ausgewiesene Zeichensetzung/redaktionelle Abweichung)
- bestanden: Schluessel sprachuebergreifend identisch in jedem Stand
- bestanden: ABl. 2008 (VIS): CELEX, Sprache, Datum in allen Sprachen; Abdeckung 100 %
- bestanden: Schlüssel je Einheit in DE, FR, EN gleich (VIS ABl. und jüngste Fassung)
- bestanden: Lateinische Suffixe ab undecies (VIS nach 2021/1134) ergeben dieselben Einheiten-Ids in allen Sprachen
- bestanden: Zitierte Neufassungen: gleiche Bereiche in ABl. und konsolidierter Fassung, auch ohne schliessendes Anführungszeichen (EES Art. 61)
- bestanden: Inline-Streichung «►M1 ————— ◄» erscheint nicht im Wortlaut (VIS Art. 19)
- bestanden: Titel mit Inline-Marker: Herkunft aus dem Marker (VIS Art. 9, 810/2009)
- bestanden: Fussnotenverweis ohne Fussnotentext (Cellar-ABl.): nicht im Wortlaut, als Fussnote mit missing
- bestanden: Erwägungsgründe: alle Basisakte, Abdeckung 100 %, Nummern und Schlüssel in DE/FR/EN gleich
- bestanden: classifyLabel
- bestanden: ABl.-Fassung: Struktur Art. 8 und Anzahl Einheiten
- bestanden: Marker: Herkunft ueber CELEX, nicht ueber M-Nummer
- bestanden: Inline-HTML: keine Marker, keine Links, nur erlaubte Tags
- bestanden: Minimal-HTML im neuen konsolidierten Format
- bestanden: forms: Schema (Felder, Schlüssel f…, erlaubte Tags, Ausfülllinien als …)
- bestanden: forms: Verweise auf existierende Assets, Einheiten, Schlüssel und Stände
- bestanden: forms: jeder Bild-Block jedes Stands und jeder Sprache hat genau eine Transkription
- bestanden: forms: Sprachkonsistenz der Schlüssel je Einheit, Bild und Stand
- bestanden: forms: data/forms.json ist aktuell (gleich dem Ergebnis von build.mjs)
- bestanden: forms: Anhang V Teil B, Fassung nach EES = Fassung 2016 + (J) und EES-Hinweise, Schlüssel stabil
- bestanden: forms: Gegenprüfung verborgener EUR-Lex-Bildtext (nur bekannte Abweichungen)
- bestanden: forms: Gegenprüfung Wortlaut VO (EU) 2017/2225 (Ergänzungen des Formulars) wortgleich
- bestanden: forms: Schildtexte Anhang III B1, B2, E gleich der Überschrift im Datensatz
- bestanden: forms: Stichproben Wortlaut und Kennzeichnungen
- bestanden: rationale: alle sieben Änderungsakte vorhanden, Schema
- bestanden: rationale: Wortlaut 100 % gleich der Quelle (unabhängige Regex-Extraktion)
- bestanden: rationale: Nummern in DE, FR, EN vorhanden und gleich viele
- bestanden: rationale: Zuordnungsziele existieren und werden vom Akt geändert
- bestanden: rationale: Akte mit anderem Hauptgegenstand nur mit SGK-bezogenen Erwägungsgründen
- bestanden: rationale: Änderungen ohne Erwägungsgrund entsprechen dem Bericht
- bestanden: rationale: Stichproben der juristischen Zuordnung
- bestanden: celexOf: Nummernformen
- bestanden: extractRefs DE: Muster der Spezifikation
- bestanden: extractRefs FR und EN: gleiche Ziele
- bestanden: extractRefs: Unsicheres wird gekennzeichnet, nie geraten
- bestanden: Pflichtprüfung: sprachübergreifende Übereinstimmung im jüngsten SGK-Stand
- bestanden: Pflichtprüfung: keine toten Ziele in allen Ständen und Sprachen
- bestanden: Index: Rückverweise, Fremdakte, Leistung (CPU-Zeit unter 300 ms)
- bestanden: linkifyHtml: Wortlaut unverändert, ein Anker je Fundstelle (alle Blöcke, drei Sprachen)
- bestanden: Bibliothek: synthetischer worksIndex löst Fremdverweise im Werk auf
- bestanden: Bibliothek: Datensätze weiterer Werke (sofern vorhanden)
- bestanden: amendedActOf: Einleitungssatz und Titel

## 7 Rechtlich relevante Auffälligkeiten

1. **ETIAS, Art. 80 Nr. 2 Bst. a der Verordnung (EU) 2018/1240**: Die ABl.-Fassung (ABl. L 236 vom 19.9.2018, S. 62) ersetzt Art. 8 Abs. 3 Bst. a Ziff. i SGK; die Berichtigung 32018R1240R(03) (ABl. L 193 vom 17.6.2020, S. 16) ändert die Anweisung auf Ziff. ii. Der Datensatz folgt der Berichtigung. SPEC §5.4 nennt noch Ziff. i.
2. **Art. 4 SGK, EN**: ABl.-Fassung "(‘the Charter)", konsolidierte Fassungen ab 6.10.2016 "(‘the Charter’)". Textunterschied ohne Änderungsakt und ohne Berichtigungsmarker; im Datensatz als `editorial` in s01 ausgewiesen.
3. **Art. 2 Nr. 16 Bst. b Ziff. ii SGK, FR**: Schlusszeichen ";" (20170407) wird in 20240710 zu "." ohne Marker. Kein Akt erkennbar; im Datensatz als `editorial` in s07 ausgewiesen (der tatsächliche Zeitpunkt zwischen 2017 und 2024 ist unbekannt).
4. **Art. 13 Abs. 1 SGK, DE (Fassung 2024/1717)**: "…aufzugreifen und Verfahren“ die mit der Richtlinie 2008/115/EG in Einklang stehen…" – das schliessende Anführungszeichen statt Komma steht bereits im Amtsblatt-Text der Verordnung (EU) 2024/1717 und wurde unverändert konsolidiert. Eine Berichtigung dazu ist nicht bekannt (die einzige DE-Berichtigung 32024R1717R(01) betrifft Art. 25).
5. **Anhang VII Nr. 1 SGK, FR (Fassung 2017/2225)**: Der Änderungsakt lautet "1. Chefs d’État, chefs de gouvernement et membres des gouvernements nationaux, …". Die konsolidierte Fassung 20240710 trennt nach "Chefs d’État" eine Überschrift ab und beginnt den folgenden Absatz mit "Chefs de gouvernement" (Komma entfällt, Grossschreibung). Der Datensatz gibt den EUR-Lex-Text wieder (Blöcke `n1` und `n1.s1`).
6. **Art. 8 Abs. 3 Bst. a Ziff. iii SGK, DE (Fassung 2017/2225)**: Akt "iii) bei Personen, … jener Verordnung.“", konsolidiert "Bei Personen, … jener Verordnung;". EUR-Lex-Eigenheit, Wortlaut sonst identisch.
7. **Art. 8 Abs. 3 Bst. ia und ib (2017/458)**: Diese Punkte sind Buchstaben nach Bst. i (Schlüssel `p3.ia`, `p3.ib`), keine Unterziffern.
8. **Berichtigung 32016R0399R(03), DE**: Erst die konsolidierte Fassung 20170407 (DE-Version 002.005, neu erstellt) enthält sie (Marker ▼C1), obwohl die Berichtigung am 31.10.2018 veröffentlicht wurde. Sie betrifft nur den Titel ("Unionskodex").
9. **EUR-Lex "Text von Bild", Anhang V Teil B, Fassung 20251012 (alle drei Sprachen)**: Der verborgene Bildtext gibt das Formular von 2016 wieder (ohne Punkt J aus 2017/2225), während das Bild selbst Punkt J enthält (Sichtprüfung DE). Der Datensatz verwendet diesen Bildtext nicht.
10. **Art. 11 SGK, EN**: Die Neufassung durch 2017/2225 ändert auch den Titel ("Stamping of the travel documents" → "Stamping of travel documents"); in DE und FR bleibt der Titel gleich.

## 8 Bekannte Lücken und Unsicherheiten

- Formulare und Schilder (Anhänge III, V Teil B, VIII) liegen nur als Bild vor; ihr Inhalt ist nicht textlich vergleichbar. Änderungen innerhalb eines Bildes zeigt der Datensatz nur als neue Bildversion (Herkunft des Akts), nicht als Wortdifferenz.
- Der ETIAS-Text in Anhang V Teil B ist ein vom Datensatz hinzugefügter Textblock (`ptB.c`) mit Hinweis; das Formularbild selbst zeigt den Wortlaut vor ETIAS.
- Änderungsart: Der Datensatz unterscheidet "ersetzt" und "eingefügt"/"gestrichen"; teilweise Änderungen innerhalb eines Blocks ("amended") werden als "ersetzt" geführt, weil die Marker diese Unterscheidung nicht liefern.
- Fussnoten (`fn`) werden aus der Quelle übernommen, aber nicht versioniert verglichen; Fussnotennummern unterscheiden sich zwischen den Fassungen.
- Die Herkunft von Gliederungsüberschriften (Titel, Kapitel) wird aus Markern abgeleitet; geprüft ist nur Kapitel V (Änderung durch 2024/1717).
- Die rekonstruierten Stände sind keine amtlichen Fassungen. Sie sind gegen die Akttexte geprüft (6.2, 6.3), beruhen aber auf den EUR-Lex-Markern der Fassung 20240710.
- Neue Fassungen per Upload (`addSnapshot`) übernehmen die ETIAS-Ergänzung automatisch, solange die Fassung 2018/1240 nicht als Änderungsakt aufführt oder ein späterer Akt dieselbe Bestimmung ändert.
- Sprachen: nur DE, FR, EN. Berichtigungen in anderen Sprachen sind nicht abgebildet.

