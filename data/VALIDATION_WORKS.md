# Prüfbericht weitere Rechtsakte (Agent BIBLIOTHEK, Etappe 3)

Erzeugt von `node scripts/validate-works.mjs` aus `data/works/` (Build `node scripts/build-work.mjs all`). Alle Zahlen stammen aus maschinellen Prüfungen dieses Laufs (19 s). Rohdaten: `scripts/out/works/<id>.sources.json` (Fassungen, Verfügbarkeit, Zuordnung jeder Änderung, Protokoll).

## 1 Ergebnis in Kürze

| Werk | CELEX | Stände | Einheiten | Akte | Abdeckung Parser (min) | Abdeckung Datensatz (min) | Erwägungsgründe (min) | Schlüssel DE/FR/EN abweichend | Änderungen | davon unerklärt | davon ohne Quellbefund |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ees | 32017R2226 | 5 | 83 | 8 | 100,000 % | 100,000 % | 100,000 % | 5 von 393 | 241 | 1 | 0 |
| etias | 32018R1240 | 6 | 102 | 9 | 100,000 % | 100,000 % | 100,000 % | 0 von 598 | 640 | 17 | 0 |
| vis | 32008R0767 | 11 | 72 | 13 | 100,000 % | 100,000 % | 100,000 % | 0 von 698 | 930 | 9 | 0 |
| iop | 32019R0817 | 6 | 81 | 8 | 100,000 % | 100,000 % | 100,000 % | 0 von 481 | 116 | 0 | 0 |

- Grösse der vier Datensätze: 5,12 MB roh, 0,84 MB gzip (Budget 2,5 MB gzip: eingehalten).
- Reproduzierbarkeit: Hash der Ausgabe gleich dem beim Build protokollierten Hash: ees ja, etias ja, vis ja, iop ja. (Zweiter Build mit identischem Ergebnis: siehe Abschnitt 9.)
- Tests `test/core/parser-works.test.mjs`, `test/core/library.test.mjs`: 13 bestanden, 0 fehlgeschlagen.
- SGK: Einheit Erwägungsgründe als separate Datei `data/works/sgk.recitals.json` (Abschnitt 8); `data/dataset.json` unverändert.
- Anwendbarkeit: in allen Akt-Dateien `application.status: "unknown"`, `date: null` (nicht an der Primärquelle geprüft).

## 2 Methode

- Stände: `s00` = ABl.-Fassung des Basisakts; danach je konsolidierte EUR-Lex-Fassung ein Stand, nach Datum geordnet. Fassungen per SPARQL ermittelt (alle CELEX `0<jjjj>R<nnnn>-*`), keine Rekonstruktion von Zwischenständen. `stage.acts`: Akte, die gegenüber der Vorfassung neu in der Modifikatorenliste stehen, ergänzt um Akte, deren Marker in dieser Fassung erstmals Änderungen tragen (gestaffelte Konsolidierung, z. B. 2021/1134 im VIS 2022 und 2023). `stage.act` = erster Eintrag, sonst CELEX der Fassung.
- Herkunft `o` je Block aus den Markern (▼B, ▼Mn, ▼Cn, Inline ►…◄). Regel: Bleibt der Wortlaut eines Blocks gegenüber der Vorfassung gleich, behält er die Herkunft der Vorfassung (o = Akt der letzten Wortlautänderung). Grund: Marker sind nicht immer genau; ohne die Regel entstünden Scheinänderungen. Jeder Fall ist gezählt (Abschnitt 5).
- Abdeckung: Wortfolge des verfügenden Teils (ab erster Gliederungseinheit bzw. Artikel 1, mit Anhängen) der Quelldatei gegen die Ausgabe (Myers-Diff über normalisierte Wörter, wie `data/VALIDATION.md`). A = Parser gegen Quelle je Datei; B = Datensatz-Stand gegen Quelle (prüft zusätzlich Schlüsselabgleich und Übernahme unveränderter Blöcke).
- Scheinänderungen: Jede Änderung zwischen zwei Ständen (`changesOfStage`, je Sprache) wird einem Akt zugeordnet: Marker eines neu gelisteten Akts, Marker eines bereits gelisteten Akts (erst jetzt konsolidiert), DELETED-Marker, Wegfall bei Neufassung des übergeordneten oder benachbarten Blocks, Folgeanpassung von Zeichensetzung oder Konjunktion bei eingefügtem Nachbarpunkt, Rücknahme eines Akts, der aus der Modifikatorenliste fällt. Was so nicht erklärt ist, steht einzeln in Abschnitt 5 und wurde am Rohtext nachgesehen.
- Bilder: keine der Quelldateien der vier Werke enthält Bilder (`<img>`: 0); Blöcke `ty: "img"` kommen nicht vor.

## 3 Stände je Werk

### ees ((EU) 2017/2226)

| Stand | Datum | Quelle | Sprachen | stage.acts |
|---|---|---|---|---|
| s00 | 2017-12-09 | 32017R2226 | de, fr, en | 32017R2226 |
| s01 | 2018-10-09 | 02017R2226-20181009 | de, fr, en | 32018R1240, 32017R2226R(01), 32017R2226R(03) |
| s02 | 2019-06-11 | 02017R2226-20190611 | de, fr, en | 32019R0817 |
| s03 | 2021-08-03 | 02017R2226-20210803 | de, fr, en | 32021R1134, 32021R1152 |
| s04 | 2026-06-12 | 02017R2226-20260612 | de, fr, en | 32024R1356 |

Aus der Modifikatorenliste gefallen: s04: 32021R1134.

### etias ((EU) 2018/1240)

| Stand | Datum | Quelle | Sprachen | stage.acts |
|---|---|---|---|---|
| s00 | 2018-09-19 | 32018R1240 | de, fr, en | 32018R1240 |
| s01 | 2018-09-19 | 02018R1240-20180919 | de | 32018R1240R(01) |
| s02 | 2019-06-11 | 02018R1240-20190611 | de, fr, en | 32019R0817, 32018R1240R(03) |
| s03 | 2021-08-03 | 02018R1240-20210803 | de, fr, en | 32021R1152, 32018R1240R(06) |
| s04 | 2025-11-18 | 02018R1240-20251118 | de, fr, en | 32025R1411 |
| s05 | 2026-06-12 | 02018R1240-20260612 | de, fr, en | 32024R1356, 32024R1358 |

Ausgelassen: 02018R1240-20231231 (keine Sprachfassung DE, FR oder EN ladbar).

### vis ((EG) Nr. 767/2008)

| Stand | Datum | Quelle | Sprachen | stage.acts |
|---|---|---|---|---|
| s00 | 2008-08-13 | 32008R0767 | de, fr, en | 32008R0767 |
| s01 | 2010-04-05 | 02008R0767-20100405 | de, fr, en | 32009R0810 |
| s02 | 2013-10-18 | 02008R0767-20131018 | de, fr, en | 32013R0610 |
| s03 | 2017-12-29 | 02008R0767-20171229 | de, fr, en | 32017R2226, 32008R0767R(05) |
| s04 | 2019-06-11 | 02008R0767-20190611 | de, fr, en | 32019R0817, 32017R2226R(01), 32017R2226R(03) |
| s05 | 2021-08-03 | 02008R0767-20210803 | de, fr, en | 32021R1134, 32021R1152 |
| s06 | 2022-08-03 | 02008R0767-20220803 | de, fr, en | 32021R1134 |
| s07 | 2023-08-03 | 02008R0767-20230803 | de, fr, en | 32021R1134 |
| s08 | 2023-12-27 | 02008R0767-20231227 | de, fr, en | 32023R2667 |
| s09 | 2025-10-12 | 02008R0767-20251012 | de, fr, en | — (stage.act = CELEX der Fassung) |
| s10 | 2026-06-12 | 02008R0767-20260612 | de, fr, en | 32024R1356, 32024R1356R(01) |

### iop ((EU) 2019/817)

| Stand | Datum | Quelle | Sprachen | stage.acts |
|---|---|---|---|---|
| s00 | 2019-05-22 | 32019R0817 | de, fr, en | 32019R0817 |
| s01 | 2019-05-22 | 02019R0817-20190522 | de, fr, en | 32019R0817R(01) |
| s02 | 2021-08-03 | 02019R0817-20210803 | de, fr, en | 32021R1152 |
| s03 | 2024-04-25 | 02019R0817-20240425 | de, fr, en | 32021R1134, 32024R0982 |
| s04 | 2025-01-28 | 02019R0817-20250128 | de, fr, en | 32025R0012, 32019R0817R(05) |
| s05 | 2026-06-12 | 02019R0817-20260612 | de, fr, en | 32024R1356 |

Aus der Modifikatorenliste gefallen: s04: 32021R1134; s05: 32021R1134.

## 4 Abdeckung je Fassung und Sprache

| Werk | Stand | Quelle | Sprache | Wörter Quelle | A Parser | fehlend | zusätzlich | B Datensatz | fehlend | zusätzlich |
|---|---|---|---|---|---|---|---|---|---|---|
| ees | s00 | 32017R2226 | de | 30'175 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| ees | s00 | 32017R2226 | fr | 41'159 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| ees | s00 | 32017R2226 | en | 34'478 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| ees | s01 | 02017R2226-20181009 | de | 30'226 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| ees | s01 | 02017R2226-20181009 | fr | 41'243 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| ees | s01 | 02017R2226-20181009 | en | 34'558 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| ees | s02 | 02017R2226-20190611 | de | 30'669 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| ees | s02 | 02017R2226-20190611 | fr | 41'741 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| ees | s02 | 02017R2226-20190611 | en | 35'061 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| ees | s03 | 02017R2226-20210803 | de | 32'083 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| ees | s03 | 02017R2226-20210803 | fr | 43'768 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| ees | s03 | 02017R2226-20210803 | en | 36'801 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| ees | s04 | 02017R2226-20260612 | de | 32'312 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| ees | s04 | 02017R2226-20260612 | fr | 44'040 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| ees | s04 | 02017R2226-20260612 | en | 37'064 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| etias | s00 | 32018R1240 | de | 35'359 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| etias | s00 | 32018R1240 | fr | 47'814 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| etias | s00 | 32018R1240 | en | 40'687 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| etias | s01 | 02018R1240-20180919 | de | 35'359 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| etias | s02 | 02018R1240-20190611 | de | 35'903 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| etias | s02 | 02018R1240-20190611 | fr | 48'502 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| etias | s02 | 02018R1240-20190611 | en | 41'319 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| etias | s03 | 02018R1240-20210803 | de | 39'309 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| etias | s03 | 02018R1240-20210803 | fr | 53'212 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| etias | s03 | 02018R1240-20210803 | en | 45'462 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| etias | s04 | 02018R1240-20251118 | de | 39'311 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| etias | s04 | 02018R1240-20251118 | fr | 53'209 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| etias | s04 | 02018R1240-20251118 | en | 45'462 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| etias | s05 | 02018R1240-20260612 | de | 39'996 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| etias | s05 | 02018R1240-20260612 | fr | 54'100 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| etias | s05 | 02018R1240-20260612 | en | 46'242 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s00 | 32008R0767 | de | 11'324 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s00 | 32008R0767 | fr | 14'583 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s00 | 32008R0767 | en | 12'825 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s01 | 02008R0767-20100405 | de | 11'301 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s01 | 02008R0767-20100405 | fr | 14'596 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s01 | 02008R0767-20100405 | en | 12'835 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s02 | 02008R0767-20131018 | de | 11'304 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s02 | 02008R0767-20131018 | fr | 14'596 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s02 | 02008R0767-20131018 | en | 12'835 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s03 | 02008R0767-20171229 | de | 13'707 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s03 | 02008R0767-20171229 | fr | 17'776 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s03 | 02008R0767-20171229 | en | 15'589 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s04 | 02008R0767-20190611 | de | 13'965 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s04 | 02008R0767-20190611 | fr | 18'112 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s04 | 02008R0767-20190611 | en | 15'882 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s05 | 02008R0767-20210803 | de | 15'969 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s05 | 02008R0767-20210803 | fr | 20'882 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s05 | 02008R0767-20210803 | en | 18'203 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s06 | 02008R0767-20220803 | de | 16'859 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s06 | 02008R0767-20220803 | fr | 22'039 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s06 | 02008R0767-20220803 | en | 19'129 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s07 | 02008R0767-20230803 | de | 17'741 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s07 | 02008R0767-20230803 | fr | 23'250 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s07 | 02008R0767-20230803 | en | 20'132 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s08 | 02008R0767-20231227 | de | 18'257 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s08 | 02008R0767-20231227 | fr | 24'023 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s08 | 02008R0767-20231227 | en | 20'717 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s09 | 02008R0767-20251012 | de | 18'257 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s09 | 02008R0767-20251012 | fr | 24'023 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s09 | 02008R0767-20251012 | en | 20'717 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s10 | 02008R0767-20260612 | de | 18'423 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s10 | 02008R0767-20260612 | fr | 24'256 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| vis | s10 | 02008R0767-20260612 | en | 20'921 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| iop | s00 | 32019R0817 | de | 27'585 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| iop | s00 | 32019R0817 | fr | 36'486 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| iop | s00 | 32019R0817 | en | 30'907 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| iop | s01 | 02019R0817-20190522 | de | 27'585 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| iop | s01 | 02019R0817-20190522 | fr | 36'486 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| iop | s01 | 02019R0817-20190522 | en | 30'907 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| iop | s02 | 02019R0817-20210803 | de | 27'655 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| iop | s02 | 02019R0817-20210803 | fr | 36'590 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| iop | s02 | 02019R0817-20210803 | en | 30'989 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| iop | s03 | 02019R0817-20240425 | de | 27'949 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| iop | s03 | 02019R0817-20240425 | fr | 36'964 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| iop | s03 | 02019R0817-20240425 | en | 31'318 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| iop | s04 | 02019R0817-20250128 | de | 27'737 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| iop | s04 | 02019R0817-20250128 | fr | 36'687 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| iop | s04 | 02019R0817-20250128 | en | 31'082 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| iop | s05 | 02019R0817-20260612 | de | 27'970 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| iop | s05 | 02019R0817-20260612 | fr | 37'012 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |
| iop | s05 | 02019R0817-20260612 | en | 31'356 | 100,000 % | 0 | 0 | 100,000 % | 0 | 0 |

Lücken: keine.

## 5 Änderungen zwischen Ständen (Scheinänderungen)

### ees

- Änderungen (Einheit × Schlüssel × Sprache × Stand): 241; erklärt 240; unerklärt 1, davon ohne geprüften Quellbefund 0.
- Herkunft der Vorfassung beibehalten (Wortlaut unverändert, Marker abweichend): 149 Blöcke — s01 DE: 32017R2226R(01) → 32017R2226 (149).

| Stand | Sprache | Einheit | Schlüssel | Art | Herkunft | Befund |
|---|---|---|---|---|---|---|
| s04 | fr | art_23 | p4.s2 | editorial [editorial] | 32017R2226 | Wortlaut in 02017R2226-20260612 FR verstümmelt: «ent paragraphe, les disposiOutre l’identification visée au premier alinéa du préstions suivantes s’appliquent:» (Vorfassung: «Outre l’identification visée au premier alinéa du présent paragraphe, les dispositions suivantes s’appliquent:»). So in der Quelldatei. |

### etias

- Änderungen (Einheit × Schlüssel × Sprache × Stand): 640; erklärt 623; unerklärt 17, davon ohne geprüften Quellbefund 0.
- Herkunft der Vorfassung beibehalten (Wortlaut unverändert, Marker abweichend): 53 Blöcke — s03 DE: 32021R1152 → 32018R1240 (15); s03 FR: 32021R1152 → 32018R1240 (16); s03 EN: 32021R1152 → 32018R1240 (17); s02 EN: 32019R0817 → 32018R1240 (3); s03 EN: 32019R0817 → 32018R1240 (2).

| Stand | Sprache | Einheit | Schlüssel | Art | Herkunft | Befund |
|---|---|---|---|---|---|---|
| s04 | de | art_8 | p2.g | editorial [editorial] | 32018R1240 | 02018R1240-20251118: letztes Zeichen abgeschnitten («aufzuhebe.» / «articles 40 et 4.» / «Articles 40 and 4.»); in 20260612 wieder vollständig (dort als Zeichensetzungsänderung erkannt). |
| s04 | de | art_69 | p1.f | editorial [editorial] | 32018R1240 | 02018R1240-20251118: «Artikel 22 und» wird «Artikel 2, und» (DE), entsprechend FR und EN («Article 2; and»); Konsolidierungsfehler im Zuge der Einarbeitung von 2025/1411. |
| s04 | de | art_69 | p1.g | editorial [editorial] | 32018R1240 | 02018R1240-20251118: Folgeänderung derselben Konsolidierung (Konjunktion/Schlusszeichen) ohne Marker. |
| s04 | de | art_75 | p1.b | editorial [editorial] | 32018R1240 | 02018R1240-20251118: «Antragsbearbeitung und» wird «Antragsbearbeitun, und» (DE), «processing of applications; and» wird «processing of application; and» (EN). |
| s04 | de | art_75 | p1.c | editorial [editorial] | 32018R1240 | 02018R1240-20251118: Folgeänderung derselben Konsolidierung ohne Marker. |
| s04 | fr | art_8 | p2.g | editorial [editorial] | 32018R1240 | 02018R1240-20251118: letztes Zeichen abgeschnitten («aufzuhebe.» / «articles 40 et 4.» / «Articles 40 and 4.»); in 20260612 wieder vollständig (dort als Zeichensetzungsänderung erkannt). |
| s04 | fr | art_47 | p2.a | editorial [editorial] | 32021R1152 | 02018R1240-20210803 FR enthält vor «a)» ein von EUR-Lex stehen gelassenes Anführungszeichen «; 20251118 ohne. Kein Rechtstext. |
| s04 | fr | art_69 | p1.f | editorial [editorial] | 32018R1240 | 02018R1240-20251118: «Artikel 22 und» wird «Artikel 2, und» (DE), entsprechend FR und EN («Article 2; and»); Konsolidierungsfehler im Zuge der Einarbeitung von 2025/1411. |
| s04 | fr | art_69 | p1.g | editorial [editorial] | 32018R1240 | 02018R1240-20251118: Folgeänderung derselben Konsolidierung (Konjunktion/Schlusszeichen) ohne Marker. |
| s04 | en | art_8 | p2.g | editorial [editorial] | 32018R1240 | 02018R1240-20251118: letztes Zeichen abgeschnitten («aufzuhebe.» / «articles 40 et 4.» / «Articles 40 and 4.»); in 20260612 wieder vollständig (dort als Zeichensetzungsänderung erkannt). |
| s04 | en | art_69 | p1.f | editorial [editorial] | 32018R1240 | 02018R1240-20251118: «Artikel 22 und» wird «Artikel 2, und» (DE), entsprechend FR und EN («Article 2; and»); Konsolidierungsfehler im Zuge der Einarbeitung von 2025/1411. |
| s04 | en | art_69 | p1.g | editorial [editorial] | 32018R1240 | 02018R1240-20251118: Folgeänderung derselben Konsolidierung (Konjunktion/Schlusszeichen) ohne Marker. |
| s04 | en | art_75 | p1.b | editorial [editorial] | 32018R1240 | 02018R1240-20251118: «Antragsbearbeitung und» wird «Antragsbearbeitun, und» (DE), «processing of applications; and» wird «processing of application; and» (EN). |
| s04 | en | art_75 | p1.c | editorial [editorial] | 32018R1240 | 02018R1240-20251118: Folgeänderung derselben Konsolidierung ohne Marker. |
| s05 | de | art_8 | p2.g | punct [punct] | 32018R1240 | 02018R1240-20260612: Rückkehr zum vollständigen Wortlaut nach dem Fehler in 20251118. |
| s05 | fr | art_8 | p2.g | punct [punct] | 32018R1240 | 02018R1240-20260612: Rückkehr zum vollständigen Wortlaut nach dem Fehler in 20251118. |
| s05 | en | art_8 | p2.g | punct [punct] | 32018R1240 | 02018R1240-20260612: Rückkehr zum vollständigen Wortlaut nach dem Fehler in 20251118. |

### vis

- Änderungen (Einheit × Schlüssel × Sprache × Stand): 930; erklärt 921; unerklärt 9, davon ohne geprüften Quellbefund 0.
- Herkunft der Vorfassung beibehalten (Wortlaut unverändert, Marker abweichend): 49 Blöcke — s03 FR: 32008R0767R(05) → 32008R0767 (16); s04 FR: 32008R0767R(05) → 32008R0767 (2); s03 EN: 32008R0767R(05) → 32008R0767 (17); s04 EN: 32008R0767R(05) → 32008R0767 (2); s10 DE: 32024R1356 → 32021R1152 (1); s10 FR: 32024R1356 → 32021R1152 (1); s03 FR: 32017R2226 → 32008R0767 (1); s03 EN: 32017R2226 → 32008R0767 (2); s04 EN: 32017R2226 → 32008R0767 (1); s06 FR: 32008R0767R(05) → 32008R0767 (3); s06 EN: 32008R0767R(05) → 32008R0767 (3).

| Stand | Sprache | Einheit | Schlüssel | Art | Herkunft | Befund |
|---|---|---|---|---|---|---|
| s03 | fr | art_23 | p1.d | editorial [editorial] | 32009R0810 | 02008R0767-20171229 FR: «d’annulation [Streichung] de retrait» wird «d’annulation [Streichung] ou de retrait»; kein Marker. |
| s07 | en | art_19 | p2.c | editorial [editorial] | 32009R0810 | 02008R0767-20230803 EN: die durch 810/2009 gestrichenen Worte «or shortened» bzw. «, shortened» stehen in Art. 19 Abs. 2 Bst. c, 20 Abs. 2 Bst. d, 22 Abs. 2 Bst. d und 23 Abs. 1 Bst. d wieder im Text (ohne Marker); 20231227 streicht sie erneut. |
| s07 | en | art_20 | p2.d | editorial [editorial] | 32009R0810 | 02008R0767-20230803 EN: die durch 810/2009 gestrichenen Worte «or shortened» bzw. «, shortened» stehen in Art. 19 Abs. 2 Bst. c, 20 Abs. 2 Bst. d, 22 Abs. 2 Bst. d und 23 Abs. 1 Bst. d wieder im Text (ohne Marker); 20231227 streicht sie erneut. |
| s07 | en | art_22 | p2.d | editorial [editorial] | 32009R0810 | 02008R0767-20230803 EN: die durch 810/2009 gestrichenen Worte «or shortened» bzw. «, shortened» stehen in Art. 19 Abs. 2 Bst. c, 20 Abs. 2 Bst. d, 22 Abs. 2 Bst. d und 23 Abs. 1 Bst. d wieder im Text (ohne Marker); 20231227 streicht sie erneut. |
| s07 | en | art_23 | p1.d | editorial [editorial] | 32009R0810 | 02008R0767-20230803 EN: die durch 810/2009 gestrichenen Worte «or shortened» bzw. «, shortened» stehen in Art. 19 Abs. 2 Bst. c, 20 Abs. 2 Bst. d, 22 Abs. 2 Bst. d und 23 Abs. 1 Bst. d wieder im Text (ohne Marker); 20231227 streicht sie erneut. |
| s08 | en | art_19 | p2.c | editorial [editorial] | 32009R0810 | 02008R0767-20231227 EN: erneute Streichung von «or shortened» (s. s07). |
| s08 | en | art_20 | p2.d | editorial [editorial] | 32009R0810 | 02008R0767-20231227 EN: erneute Streichung von «or shortened» (s. s07). |
| s08 | en | art_22 | p2.d | editorial [editorial] | 32009R0810 | 02008R0767-20231227 EN: erneute Streichung von «or shortened» (s. s07). |
| s08 | en | art_23 | p1.d | editorial [editorial] | 32009R0810 | 02008R0767-20231227 EN: erneute Streichung von «or shortened» (s. s07). |

### iop

- Änderungen (Einheit × Schlüssel × Sprache × Stand): 116; erklärt 116; unerklärt 0, davon ohne geprüften Quellbefund 0.
- Herkunft der Vorfassung beibehalten (Wortlaut unverändert, Marker abweichend): 7 Blöcke — s05 FR: 32024R1356 → 32019R0817 (2); s05 EN: 32024R1356 → 32019R0817 (2); s01 DE: 32019R0817R(01) → 32019R0817 (1); s01 FR: 32019R0817R(01) → 32019R0817 (1); s01 EN: 32019R0817R(01) → 32019R0817 (1).

## 6 Sprachkonsistenz der Schlüssel

- ees: 5 Abweichungen bei 393 Paaren Einheit × Stand.
  - s00 art_17: DE p4.s3; FR –; EN –
  - s01 art_17: DE p4.s3; FR –; EN –
  - s02 art_17: DE p4.s3; FR –; EN –
  - s03 art_17: DE p4.s3; FR –; EN –
  - s04 art_17: DE p4.s3; FR –; EN –
- etias: 0 Abweichungen bei 598 Paaren Einheit × Stand.
- vis: 0 Abweichungen bei 698 Paaren Einheit × Stand.
- iop: 0 Abweichungen bei 481 Paaren Einheit × Stand.


Befund EES Art. 17 Abs. 4 (DE `p4.s3`): Die deutsche Sprachfassung (ABl. und alle Fassungen) gliedert den Satz «Die Mitgliedstaaten gewährleisten angemessene Verfahren …» als eigenen Unterabsatz; FR und EN führen ihn als letzten Satz des zweiten Unterabsatzes. Echte Abweichung der Sprachfassungen, nicht angeglichen.

## 7 Erwägungsgründe (Einheit `rct`)

Quelle: ABl.-Fassung des Basisakts (`div id="rct_N"`). Blöcke `r1 … rN` mit `l: "(N)"`; weitere Absätze oder Aufzählungen eines Erwägungsgrunds als `rN.s2` bzw. `rN.a`. Eine Version (s00).

| Werk | Sprache | Erwägungsgründe | Blöcke | Wörter Quelle | Abdeckung | fehlend | zusätzlich | Label = Nummer |
|---|---|---|---|---|---|---|---|---|
| ees | de | 60 | 64 | 6'492 | 100,000 % | 0 | 0 | ja |
| ees | fr | 60 | 64 | 8'519 | 100,000 % | 0 | 0 | ja |
| ees | en | 60 | 64 | 6'950 | 100,000 % | 0 | 0 | ja |
| etias | de | 77 | 112 | 7'942 | 100,000 % | 0 | 0 | ja |
| etias | fr | 77 | 112 | 10'564 | 100,000 % | 0 | 0 | ja |
| etias | en | 77 | 112 | 8'348 | 100,000 % | 0 | 0 | ja |
| vis | de | 33 | 34 | 2'155 | 100,000 % | 0 | 0 | ja |
| vis | fr | 33 | 34 | 2'758 | 100,000 % | 0 | 0 | ja |
| vis | en | 33 | 34 | 2'382 | 100,000 % | 0 | 0 | ja |
| iop | de | 84 | 90 | 7'980 | 100,000 % | 0 | 0 | ja |
| iop | fr | 84 | 90 | 10'445 | 100,000 % | 0 | 0 | ja |
| iop | en | 84 | 90 | 8'113 | 100,000 % | 0 | 0 | ja |
| sgk | de | 44 | 44 | 3'360 | 100,000 % | 0 | 0 | ja |
| sgk | fr | 44 | 44 | 4'417 | 100,000 % | 0 | 0 | ja |
| sgk | en | 44 | 44 | 3'629 | 100,000 % | 0 | 0 | ja |

## 8 SGK: Ergänzung um die Einheit Erwägungsgründe

- Nachweis (`node scripts/build-work.mjs sgk --dry-run`, Trockenlauf): `data/dataset.json` mit `rct` → `rct` und toc-Eintrag entfernt → JSON byte-identisch mit dem Ausgangsstand: ja. SHA-256 Ausgangsstand ce504492e7fc1693147391a845be1afad511866bf1d5f9c7e5aba799edc72742, nach Ergänzung ohne rct ce504492e7fc1693147391a845be1afad511866bf1d5f9c7e5aba799edc72742; Grösse 1'551'555 → 1'640'421 Bytes.
- Aktueller Stand `data/dataset.json`: rct nicht vorhanden; SHA-256 ohne rct ce504492e7fc1693147391a845be1afad511866bf1d5f9c7e5aba799edc72742; letzter Commit der Datei f319353 mit SHA-256 ce504492e7fc1693147391a845be1afad511866bf1d5f9c7e5aba799edc72742 → identisch.
- **Entscheid: separate Datei.** Einheit und toc-Eintrag liegen in `data/works/sgk.recitals.json` (`{ toc, unit }`, im Index beim SGK als `recitals`). Die Oberfläche hängt sie beim Laden ein: `toc` an erster Stelle, `units.rct = unit` (Hilfsfunktion `withRecitals` in scripts/lib-works.mjs zeigt das Vorgehen). `data/dataset.json` bleibt unverändert.
- Grund: Mit `rct` in `data/dataset.json` scheitert `test/core/model.test.mjs` «addSnapshot … = Gesamtbuild» (ausgeführt, danach rückgängig gemacht). `addSnapshot` (src/core/model.js, `ingest`) kennzeichnet jede Einheit, die in der neuen Fassung fehlt, als aufgehoben; konsolidierte Fassungen enthalten keine Erwägungsgründe. `rct` würde also beim nächsten Upload einer SGK-Fassung im Browser als aufgehoben geführt. Dasselbe gilt für die Einheit `rct` in den vier weiteren Datensätzen, falls dort je ein Upload vorgesehen wird; Abhilfe in model.js (nicht im Schreibbereich BIBLIOTHEK): Einheiten mit `type: "recitals"` in der Schleife «Aufgehobene Einheiten» überspringen.
- Alternative bleibt verfügbar: `node scripts/build-work.mjs sgk` fügt `rct` in `data/dataset.json` ein (Nachweis wie oben), `node scripts/build-data.mjs --recitals` beim Neubau.

## 8a Von Änderungsakten eingefügte oder neu gefasste Artikel im jüngsten Stand

Prüfung: In den EN-Texten der Änderungsakte (raw/<CELEX>_EN.html) werden die zitierten Artikelüberschriften («‘Article 22g») der Änderungsbestimmung zum Werk gesucht und gegen den jüngsten Stand des Datensatzes geprüft.

- ees 32018R1240: 0 zitierte Artikel (art_82), im jüngsten Stand fehlend: keine
- ees 32019R0817: 0 zitierte Artikel (art_60), im jüngsten Stand fehlend: keine
- ees 32021R1134: 0 zitierte Artikel (art_4), im jüngsten Stand fehlend: keine
- ees 32021R1152: 6 zitierte Artikel (art_3), im jüngsten Stand fehlend: keine
- ees 32024R1356: 1 zitierte Artikel (art_21), im jüngsten Stand fehlend: keine
- etias 32019R0817: 0 zitierte Artikel (art_61), im jüngsten Stand fehlend: keine
- etias 32021R1152: 5 zitierte Artikel (art_1), im jüngsten Stand fehlend: keine
- etias 32024R1356: 1 zitierte Artikel (art_22), im jüngsten Stand fehlend: keine
- etias 32024R1358: 0 zitierte Artikel (art_53), im jüngsten Stand fehlend: keine
- etias 32025R1411: 0 zitierte Artikel (keine Änderungsbestimmung erkannt), im jüngsten Stand fehlend: keine
- vis 32009R0810: 1 zitierte Artikel (art_54), im jüngsten Stand fehlend: keine
- vis 32013R0610: 0 zitierte Artikel (art_5), im jüngsten Stand fehlend: keine
- vis 32017R2226: 4 zitierte Artikel (art_61), im jüngsten Stand fehlend: keine
- vis 32019R0817: 0 zitierte Artikel (art_58), im jüngsten Stand fehlend: keine
- vis 32021R1134: 68 zitierte Artikel (art_1), im jüngsten Stand fehlend: 2a, 9a, 9b, 9c, 9d, 9e, 9f, 9g, 9i, 9k, 9l, 22a, 22c, 22d, 22e, 22f, 22g, 22h, 22i, 22j, 22k, 22l, 22m, 22n, 22o, 22p, 22q, 22r, 22s, 22t, 27a, 32a, 45a, 45b, 49a
- vis 32021R1152: 4 zitierte Artikel (art_2), im jüngsten Stand fehlend: keine
- vis 32023R2667: 12 zitierte Artikel (art_2), im jüngsten Stand fehlend: 7a, 7b, 7c, 7d, 7e, 7f, 7g, 7h, 7i, 7j, 12a, 18e
- vis 32024R1356: 0 zitierte Artikel (art_20), im jüngsten Stand fehlend: keine
- iop 32021R1134: 0 zitierte Artikel (art_8), im jüngsten Stand fehlend: keine
- iop 32021R1152: 0 zitierte Artikel (art_6), im jüngsten Stand fehlend: keine
- iop 32024R0982: 0 zitierte Artikel (art_70), im jüngsten Stand fehlend: keine
- iop 32024R1356: 1 zitierte Artikel (art_23), im jüngsten Stand fehlend: keine
- iop 32025R0012: 0 zitierte Artikel (art_42), im jüngsten Stand fehlend: keine

Befund VIS: Die fehlenden Artikel stammen aus 2021/1134 (u. a. Art. 2a, 9a–9g, 9i, 9k, 9l, 22a, 22c–22t, 27a, 32a, 45a, 45b, 49a) und 2023/2667 (Art. 7a–7j, 12a, 18e). Sie stehen in keiner der zehn konsolidierten EUR-Lex-Fassungen (geprüft am Rohtext aller Fassungen). Grund an der Primärquelle: Art. 12 Abs. 2 der VO (EU) 2021/1134 («shall apply from the date set by the Commission in accordance with Article 11», mit Ausnahmen ab 2.8.2021, 3.8.2022 und 3.8.2023) und Art. 8 Abs. 2 und 3 der VO (EU) 2023/2667 (Anwendung ab einem von der Kommission festgelegten Datum; Ausnahmen ab 28.6.2024 bzw. 27.12.2023). EUR-Lex konsolidiert Änderungen erst ab ihrer Anwendbarkeit; die vorgezogen anwendbaren Teile sind in s05 (2021), s06 (2022), s07 (2023) und s08 (27.12.2023) enthalten. Keine Rekonstruktion (Vorgabe SPEC3 §3.1); Verweise auf diese Artikel bleiben bis zu einer neuen Fassung tot. Bei EES, ETIAS und IO fehlt kein zitierter Artikel.

## 8b Schlüssel mit Notsuffix «~» und Angleichung nach Sprachmehrheit

- ees: 0 Schlüssel mit «~»; nach Sprachmehrheit angeglichen: art_9 s04 FR p2a~2 → p2b (Gliederungszeichen in der Quelle «2 bis.»)
- etias: 0 Schlüssel mit «~»; nach Sprachmehrheit angeglichen: keine
- vis: 0 Schlüssel mit «~»; nach Sprachmehrheit angeglichen: keine
- iop: 0 Schlüssel mit «~»; nach Sprachmehrheit angeglichen: art_16 s00 DE n1 → p1, n1.a → p1.a, n1.b → p1.b, n1.c → p1.c, n1.d → p1.d, n1.e → p1.e, n1.f → p1.f (Gliederungszeichen in der Quelle «1. a) b) c) d) e) f)»); art_17 s05 DE p3.n4 → p4 (Gliederungszeichen in der Quelle «4.»); art_74 s00 DE n1 → p1, n2 → p2, s1 → p2.s2 (Gliederungszeichen in der Quelle «1. 2. »)
- Ursache EES: 02017R2226-20260612 FR führt in Art. 9 zweimal «2 bis.» (DE «(2a)», «(2b)»); der zweite Absatz (eingefügt durch 2024/1356) erhält den Schlüssel der anderen Sprachen (p2b). IO-VO DE (ABl. und alle Fassungen): Art. 16 und 74 mit Absatznummern «1.» statt «(1)», Schlüssel nach FR/EN (p1 …). Gliederungszeichen bleiben wie in der Quelle. Regel im Kopf von `alignKeysToMajority` (scripts/build-work.mjs).

## 9 Akt-Metadaten (`data/works/<id>.acts.json`)

Titel wörtlich aus Cellar (`cdm:expression_title`, nur Leerraum vereinheitlicht); Fundstellen aus der Modifikatorentabelle der konsolidierten Fassungen (Berichtigungen wörtlich wie dort, Amtsblatt als Einzelakte ab 1.10.2023 als «ABl. L, 2024/1356, 22.5.2024»); `adopted` = `cdm:work_date_document`, `inForce` = frühestes `cdm:resource_legal_date_entry-into-force` (beides nicht für Berichtigungen); `changes` je Einheit aus den Markern mit den betroffenen Schlüsseln (`keys`) und dem Stand. `confidence: "check"`.

| Werk | CELEX | Art | Einheiten geändert | Titel | Fundstelle | Befund |
|---|---|---|---|---|---|---|
| ees | 32017R2226 | base | 0 | de,fr,en | de,fr,en | ok |
| ees | 32018R1240 | amendment | 1 | de,fr,en | de,fr,en | ok |
| ees | 32017R2226R(01) | corrigendum | 10 | de,fr,en | de,fr,en | ok |
| ees | 32017R2226R(03) | corrigendum | 1 | en | en | ok |
| ees | 32019R0817 | amendment | 15 | de,fr,en | de,fr,en | ok |
| ees | 32021R1134 | amendment | 1 | de,fr,en | de,fr,en | ok |
| ees | 32021R1152 | amendment | 12 | de,fr,en | de,fr,en | ok |
| ees | 32024R1356 | amendment | 4 | de,fr,en | de,fr,en | ok |
| etias | 32018R1240 | base | 0 | de,fr,en | de,fr,en | ok |
| etias | 32018R1240R(01) | corrigendum | 1 | de | de | ok |
| etias | 32019R0817 | amendment | 16 | de,fr,en | de,fr,en | ok |
| etias | 32018R1240R(03) | corrigendum | 1 | de,fr,en | de,fr,en | ok |
| etias | 32021R1152 | amendment | 26 | de,fr,en | de,fr,en | ok |
| etias | 32018R1240R(06) | corrigendum | 1 | de | de | ok |
| etias | 32024R1356 | amendment | 5 | de,fr,en | de,fr,en | ok |
| etias | 32024R1358 | amendment | 3 | de,fr,en | de,fr,en | ok |
| etias | 32025R1411 | amendment | 1 | de,fr,en | de,fr,en | ok |
| vis | 32008R0767 | base | 0 | de,fr,en | de,fr,en | ok |
| vis | 32009R0810 | amendment | 15 | de,fr,en | de,fr,en | ok |
| vis | 32013R0610 | amendment | 1 | de,fr,en | de,fr,en | ok |
| vis | 32017R2226 | amendment | 11 | de,fr,en | de,fr,en | ok |
| vis | 32017R2226R(01) | corrigendum | 1 | de,fr,en | de | ok |
| vis | 32008R0767R(05) | corrigendum | 9 | fr,en | fr,en | ok |
| vis | 32017R2226R(03) | corrigendum | 2 | en | en | ok |
| vis | 32019R0817 | amendment | 5 | de,fr,en | de,fr,en | ok |
| vis | 32021R1134 | amendment | 25 | de,fr,en | de,fr,en | ok |
| vis | 32021R1152 | amendment | 6 | de,fr,en | de,fr,en | ok |
| vis | 32023R2667 | amendment | 2 | de,fr,en | de,fr,en | ok |
| vis | 32024R1356 | amendment | 1 | de,fr,en | de,fr,en | ok |
| vis | 32024R1356R(01) | corrigendum | 1 | de,fr,en | de,fr,en | ok |
| iop | 32019R0817 | base | 0 | de,fr,en | de,fr,en | ok |
| iop | 32019R0817R(01) | corrigendum | 1 | de,fr,en | de,fr,en | ok |
| iop | 32021R1134 | amendment | 8 | de,fr,en | de,fr,en | ok |
| iop | 32021R1152 | amendment | 1 | de,fr,en | de,fr,en | ok |
| iop | 32024R0982 | amendment | 1 | de,fr,en | de,fr,en | ok |
| iop | 32024R1356 | amendment | 5 | de,fr,en | de,fr,en | ok |
| iop | 32025R0012 | amendment | 1 | de,fr,en | de,fr,en | ok |
| iop | 32019R0817R(05) | corrigendum | 1 | de,fr,en | de,fr,en | ok |

Berichtigungen tragen Titel und Fundstelle nur in den Sprachen, in denen Cellar bzw. EUR-Lex sie führen (sprachspezifische Berichtigungen).

## 10 Grössen

| Datei | roh | gzip | SHA-256 |
|---|---|---|---|
| ees.dataset.json | 1380 KB | 228 KB | e7dd08ef5f30d9db… |
| ees.acts.json | 24 KB | 4 KB | 7b92f18e8cf3f390… |
| etias.dataset.json | 1826 KB | 291 KB | 199ae56d8510b997… |
| etias.acts.json | 28 KB | 4 KB | 9eccaf454b1b0330… |
| vis.dataset.json | 861 KB | 140 KB | 2ef1b36c87ced2c3… |
| vis.acts.json | 41 KB | 5 KB | 8853e85fae8af3e6… |
| iop.dataset.json | 1178 KB | 203 KB | d9f1709569d34f9a… |
| iop.acts.json | 20 KB | 3 KB | 95a27d8797530ec9… |
| Summe Datensätze | 5,12 MB | 0,84 MB | |

## 11 library.js am echten Datensatz

- ees: resolveBase ok, resolveConsolidated ok, stageAtEachDate ok, beforeFirst ok, actsOfStage ok
- etias: resolveBase ok, resolveConsolidated ok, stageAtEachDate ok, beforeFirst ok, actsOfStage ok
- vis: resolveBase ok, resolveConsolidated ok, stageAtEachDate ok, beforeFirst ok, actsOfStage ok
- iop: resolveBase ok, resolveConsolidated ok, stageAtEachDate ok, beforeFirst ok, actsOfStage ok

## 12 Auffälligkeiten der Quellen

- Cellar führt 02018R1240-20180919 nur in DE (sowie ET, SV, ES) und 02018R1240-20231231 nur in ES. Stand etias s01 enthält daher nur DE; 20231231 entfällt.
- EUR-Lex lieferte die Dateien teils nur über Cellar (XHTML, `scripts/out/fetch-log.json`). ABl.-Dateien aus Cellar enthalten in zitierten Neufassungen Fussnotenverweise («*1») ohne Fussnotentext; der Parser führt sie als Fussnote mit leerem Text (`missing: true`), nicht im Wortlaut.
- 02017R2226-20181009 DE: nach ▼C1 in Art. 61 Nr. 1 Bst. b fehlt der Rückwechsel ▼B (Herkunft daher nach der Regel in Abschnitt 2 korrigiert, 149 Blöcke); zudem fehlen in mehreren konsolidierten Fassungen schliessende Anführungszeichen zitierter Neufassungen (Parser schliesst den Zitatbereich vor der nächsten Änderungsanweisung).
- 2021/1134 fällt in EES 20260612 und IO 20250128 aus der Modifikatorenliste; die zuvor konsolidierten Änderungen verschwinden ohne Marker (als «Rücknahme» erklärt, z. B. EES Art. 9 Abs. 2 UAbs. 2; IO Art. 4 Nr. 20, 13, 18, 26, 27, 29, 72).
- EES ABl. FR Art. 61 Nr. 1: Anweisung endet mit «… est modifié comme suit: mars» (Wort «mars» so in der Quelle, auch in den konsolidierten Fassungen).
- Neue Amtsblatt-Nummerierung bei Berichtigungen: EUR-Lex führt z. B. «ABl. L 90927 vom 25.11.2025, S. 1» (32024R1356R(01)) bzw. «L 90960» (32019R0817R(05)); unverändert übernommen.
- Weitere Einzelbefunde: Tabelle in Abschnitt 5.

## 13 Nicht geprüft

- Anwendbarkeit der Akte und Einzeländerungen (bewusst `unknown`).
- Wortlaut der Änderungsakte selbst gegen die konsolidierten Fassungen (für den SGK in VALIDATION.md, Abschnitt Akttext; hier nicht wiederholt).
- Darstellung in der Oberfläche (Welle 2).

