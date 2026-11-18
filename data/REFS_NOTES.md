# REFS_NOTES – Verweisnetz (Agent VERWEISE, Etappe 3)

Stand: 12. November 2026. Modul: `src/core/refs.js`. Tests: `test/core/refs.test.mjs` (11 Tests).
Übernommen vom unterbrochenen Vorgänger (Commit «WIP Etappe 3», 1100 Zeilen, ungetestet); geprüft, korrigiert und ergänzt.

## 1 Schnittstelle (tatsächliche Signaturen)

```js
extractRefs(text, lang, ctx) -> [ { start, end, text, target, targets?, uncertain?, why?, inferred?, rangeApprox?, range? } ]
  // ctx: { work, unit, key, unitType?, keysOf?(unit)->Set, toc?, tocIds?, unitExists?(unit), inLibrary?(celex), keysOfWork?(celex, unit), quoted?, amends? }
  // target: { work, unit, key, kind: "internal"|"external", label, provision?: {unit,key}, instrument?, rest?, via? }
buildRefIndex(dataset, lang, stageId, { worksIndex, datasets? }) -> { out, in, external, stats }
  // stats: { blocks, refs, internal, external, uncertain, dead[], deadExternal[], inLibrary, amending? }
linkifyHtml(blockHtml, refs) -> html        // <a data-ref="…" data-ref-kind="…" [data-uncertain="1"]>
plainText(html), unlinkHtml(html), refId(target), celexOf(kind, a, b, hasNo), amendedActOf(version, lang, work)
```

- `start`/`end` beziehen sich auf `plainText(b.t)`. `targets` nur bei Bereichen («Artikel 23 bis 28»), aufgelöst gegen die Einheiten des Stands.
- Fremdakt ausserhalb der Bibliothek: `target.unit = null`, Bestimmung in `target.provision`. In der Bibliothek (`worksIndex`): `target.unit`/`key` gesetzt; mit `datasets` (Schlüssel CELEX oder Werk-Id) zusätzlich Schlüsselprüfung (`stats.deadExternal`) und Ausweichlesart Absatz/Nummer.
- `rest`: Unterabsatz, Satz, Kennbuchstabe (Formular Anhang V Teil B) verfeinern die Fundstelle, ändern den Schlüssel nicht.
- `in`: Rückverweise je Einheit und je `unit#key`.

## 2 Korrekturen am Stand des Vorgängers

| Fehler | Wirkung | Korrektur |
|---|---|---|
| `${SP}?` (faul statt optional) in den Aktmustern | FR «règlement (CE) no 1987/2006» nicht erkannt → Artikel des Fremdakts als SGK-Artikel ausgegeben | `(?:${SP})?` |
| Trennwörter als Werte («a oder b» → «er») | Scheinziele `p2.er`, `p3.nd` | Liste nach Struktur zerlegen (Wert, Trenner, Wert) |
| Artikel-Leim vor Rückbezug («der genannten Verordnung») | DE Fremdartikel als intern | Rückbezug vor dem Leim prüfen |
| «Council Directive …» als Beschluss (D) | falsche CELEX 32003D0109 | Aktart nach letztem Wort |
| Präfix nach Komma nur ohne Genitiv | FR «partie A, point 4, de l’annexe XII» unsicher; FR «…, à l’article 23» fälschlich als Präfix | Präfix nur mit Genitiv (de/du/des, der/des, of/to) |
| Bereich über die Vereinigung aller Stände | tote Ziele je Sprache: 57 in s00–s02, 2 in s03–s06 (Art. 8a–8d, 12a, 25a, 27a) | nur Einheiten des Stands |
| kein Schutz vor unbekannten Akten | «Article 26 of the Schengen Convention», «Article 3(2) of the 2003 Act of Accession», NATO-Truppenstatut als SGK-Artikel | Vorausschau auf Aktbezeichnung → `uncertain: unknown-act`; römische Artikelnummern nur extern |

Ergänzt: Einschübe in Anführungszeichen («Teil B1 („Visum nicht erforderlich“) und Teil B2»), «thereto/thereof», «deren/dessen», «son/sa/ses», «respectively/respectivement», Dezimalnummern («Absätzen 6.1, 6.2 und 6.3», «points 6.1., 6.2.»), Bereich auf Dezimalstufe («points 2.1 to 2.2»), «paragraph (4)(a)», «paragraph 1 (c)», Teile mit Ziffer (B1, D2), Kleinschreibung «part» (EN), FR «Partie», «convention de Schengen»/«Schengen Convention», Mehrdeutigkeit Buchstabe/Ziffer in Aufzählungen (Lesart der eindeutigen Geschwister, `inferred: "list"`), Teilüberschriften («Teil E: …») nicht als Verweis, fehlerhafte Ketten («Absatz 27a Absatz 3») als unsicher, Kapitel ohne Titelgliederung (`cpt_I` in den weiteren Werken), Änderungsartikel und zitierter Text in den weiteren Werken (§6).

## 3 Zahlen, jüngster SGK-Stand (s08), ohne Bibliothek

| | DE | FR | EN |
|---|---|---|---|
| Textblöcke | 765 | 765 | 765 |
| Verweise (Fundstellen) | 616 | 614 | 612 |
| Ziele intern | 590 | 592 | 591 |
| Ziele extern | 182 | 180 | 181 |
| unsichere Verweise | 3 | 1 | 1 |
| tote Ziele | 0 | 0 | 0 |
| Fremdakte (35 CELEX, AEUV, Charta, 1 unbekannt) | 38 | 38 | 38 |

Mit `data/works/index.json` und den Datensätzen EES, ETIAS, VIS, IO: 94 Ziele je Sprache im Werk aufgelöst; 1 totes Fremdziel je Sprache (Art. 8 Abs. 3 Bst. bb SGK → Art. 22g VIS-VO fehlt im VIS-Datensatz, siehe §6).

Tote Ziele über alle Stände: s00–s08 × DE/FR/EN = 0 (Test «keine toten Ziele»).

### Unsichere Verweise (vollständig)

| Sprache | Block | Fundstelle | Grund |
|---|---|---|---|
| DE | art_25a#p6 | «Absatz 27a» / «Absatz 3» | Quellfehler DE: «gemäß Absatz 27a Absatz 3» statt «Artikel 27a Absatz 3» (FR «article 27 bis, paragraphe 3», EN «Article 27a(3)») |
| DE, FR, EN | anx_VII#n4.n4.d5 | «Artikel III Absatz 2» | Abkommen über die Rechtsstellung der NATO-Truppen: Akt ohne Bibliothekseintrag, römischer Artikel |

## 4 Pflichtprüfung: sprachübergreifende Übereinstimmung

Vergleich der Zielmengen je Block (intern `unit#key`, extern CELEX und Bestimmung, unsicher als «?»).

| Stand | Blöcke | gleich | Quote |
|---|---|---|---|
| s00 | 500 | 498 | 99,6 % |
| s03 | 649 | 646 | 99,5 % |
| s05 | 655 | 652 | 99,5 % |
| s07 | 765 | 762 | 99,6 % |
| s08 | 765 | 762 | 99,6 % (mit Bibliothek 763, 99,7 %) |

Abweichungen in s08, Ursache am Text geklärt, alle echte Abweichungen der Sprachfassungen (keine Parserlücke):

1. **art_8d#p3.s2** – DE «Artikel 4 Absatz 3 der Verordnung (EG) Nr. 767/2008», FR «article 4, point 3)», EN «point 3 of Article 4». Art. 4 VIS-VO gliedert Begriffsbestimmungen in Nummern; DE nennt sie «Absatz». Mit VIS-Datensatz löst die Ausweichlesart Absatz→Nummer DE auf `art_4#n3` auf (dann gleich).
2. **art_25a#p6** – DE «gemäß Absatz 27a Absatz 3» (Quellfehler, unsicher), FR/EN Art. 27a Abs. 3.
3. **art_38#p3** – DE «Artikel 8 der Verordnung (EU) Nr. 182/2011 in Verbindung mit deren Artikel 5», EN «Article 5 thereof», FR «l’article 8 du règlement (UE) no 182/2011, en liaison avec l’article 5» ohne Rückbezug: FR liefert Art. 5 SGK. Wortlaut FR mehrdeutig; das Werkzeug folgt dem Text.

Erwägungsgründe (Einheit `rct`, von Agent BIBLIOTHEK während meiner Arbeit in `data/dataset.json` ergänzt und wieder entfernt): Mit einem Datensatz samt `rct` (aus `scripts/lib-works.mjs`, nur gelesen, in /tmp gebaut) stimmen alle 44 Erwägungsgründe in DE, FR, EN überein (s08: 806/809 = 99,6 %), 0 tote Ziele in allen Ständen. Dafür ergänzt: EUV/TEU ausgeschrieben, «Vertrag»/«traité» als Kettenbeginn, Rückbezug auf Protokolle («des genannten Protokolls», «dudit protocole», «that Protocol»: eigener Sektor, nie auf einen anderen Akt abgebildet), DE «Buchstabe A», DE-Partizipialgenitiv («des dem Vertrag … beigefügten Protokolls»: unsicher statt EUV), Abkürzung in Klammern («(AEUV)») kein eigener Verweis, EN «the first paragraph of Article 1», DE «Artikel 1 Absatz 1» bei Artikeln ohne nummerierte Absätze = erster Absatz. Unsicher in `rct` je Sprache 6 (Protokoll Nr. 22, Beitrittsakten). Die Tests laufen mit und ohne `rct` (`SGK_DATASET=<Datei> node --test test/core/refs.test.mjs`).

Zusätzlich in älteren Ständen: **art_27#p3** (s00–s06) DE «gemäß Unterabsatz 1», FR/EN «paragraphe 1»/«paragraph 1» (DE-Fassung des Art. 27 Abs. 3 vor 2024/1717; echte Abweichung); **art_12#p2.b** (s00) korrekt in allen drei Sprachen unsicher (Beitrittsakte).

## 5 Pflichtprüfung: 60 Verweise von Hand am Text

Zufallsstichprobe (fester Startwert 20261112, gleichverteilt über alle Fundstellen in s08 ohne Bibliothek, 20 je Sprache). Jede Fundstelle am Wortlaut des Blocks gelesen und mit Ziel verglichen. Ergebnis: **60 von 60 richtig**, 0 falsch, 0 unsicher. Die Stichprobe enthält 16 Fremdverweise, 2 Bereiche, 2 Verweise mit Unterabsatz/Satz.

| Nr. | Block | Fundstelle | Ziel | Textstelle | Befund |
|---|---|---|---|---|---|
| DE-01 | art_5#p4 | «Artikel 1 Absatz 4 Buchstabe b Satz 1 der Verordnung (EU) 2024/1359» | 32024R1359 [art_1#p4.b] {sen:1} | …ere im Falle einer Instrumentalisierung von Migranten gemäß Artikel 1 Absatz 4 Buchstabe b Satz 1 der Verordnung (EU) 2024/1359 des Europäischen Parlaments und des Rates, bestimmte gemäß … | richtig |
| DE-02 | art_6#p4.s2 | «Artikel 39» | art_39# | …aaten festgesetzte Richtbeträge werden der Kommission gemäß Artikel 39 übermittelt.… | richtig |
| DE-03 | art_6a#p3.c | «Buchstaben a» | art_6a#p3.a | …thaltstitels gemäß Artikel 2 Nummer 16, die nicht unter die Buchstaben a und b dieses Absatzes fallen;… | richtig |
| DE-04 | art_6a#p3.g.viii | «3.2.5» | anx_VI#n3.n2.n5 | …von Vergnügungsschiffen, die gemäß Anhang VI Nummern 3.2.4, 3.2.5 und 3.2.6 keinen Grenzübertrittskontrollen unterliegen;… | richtig |
| DE-05 | art_8#p3.ia | «Buchstabe a Ziffern i» | art_8#p3.a.i | …Die Abfrage der Datenbanken nach Buchstabe a Ziffern i und vi und Buchstabe g können im Voraus auf der Grundlage v… | richtig |
| DE-06 | art_8a#p1 | «Absatz 4 Buchstabe a dieses Artikels» | art_8a#p4.a | …, dürfen Self-Service-Systeme verwenden, um die Daten gemäß Absatz 4 Buchstabe a dieses Artikels vorab in das EES einzugeben, sofern alle der folgenden Bedi… | richtig |
| DE-07 | art_8a#p4.b.iii | «Artikel 16 Absatz 2 Buchstaben a» | 32017R2226 [art_16#p2.a] | …tabe a dieses Absatzes genannten Daten bestätigt und die in Artikel 16 Absatz 2 Buchstaben a und b und in Artikel 18 Absatz 6 Buchstaben a, b, c und d d… | richtig |
| DE-08 | art_8d#p10 | «Artikel 43 der Verordnung (EU) 2017/2226» | 32017R2226 [art_43#] | …leisten, dass ihr System zur Umsetzung des Programms den in Artikel 43 der Verordnung (EU) 2017/2226 festgelegten Datensicherheitsstandards entspricht. Die Mitg… | richtig |
| DE-09 | art_9#p3a.i | «Artikels 7 jener Verordnung» | 32017R2226 [art_7#] | … in der einheitlichen nationalen Schnittstelle im Sinne des Artikels 7 jener Verordnung gespeichert. Ist dies nicht möglich, so werden die Daten vo… | richtig |
| DE-10 | art_12#p4 | «Richtlinie 2008/115/EG» | 32008L0115 | …sich im Hoheitsgebiet des Mitgliedstaats aufhält, gemäß der Richtlinie 2008/115/EG des Europäischen Parlaments und des Rates rückgeführt werde… | richtig |
| DE-11 | art_23#d | «Schengener Durchführungsübereinkommen» | 42000A0922(02) | …au der Kontrollen an den gemeinsamen Grenzen (im Folgenden „Schengener Durchführungsübereinkommen“) zu melden, sowie die Verpflichtung für die Leiter von Beh… | richtig |
| DE-12 | art_26#p1.a.ii | «Artikel 23a» | art_23a# | …die Nutzung des in Artikel 23a festgelegten Verfahrens,… | richtig |
| DE-13 | art_28#p3 | «Absatz 1» | art_28#p1 | …aufgrund der gesundheitlichen Notlagen großen Ausmaßes nach Absatz 1 Grenzkontrollen ein bzw. verlängert diese, so unterliegen d… | richtig |
| DE-14 | art_30#p1.b | «Verordnung (EU) Nr. 1053/2013» | 32013R1053 | …Kontrollen an den Außengrenzen, die im Rahmen der gemäß der Verordnung (EU) Nr. 1053/2013 vorgenommenen Evaluierungen festgestellt wurden und dem Aus… | richtig |
| DE-15 | art_30#p2 | «Artikel 29 Absatz 2» | art_29#p2 | …mission einen Vorschlag für eine Empfehlung des Rates gemäß Artikel 29 Absatz 2 annimmt, kann sie… | richtig |
| DE-16 | art_42a#p2 | «f» | art_6a#p3.f | …sedokumenten der in Artikel 6a Absatz 3 Buchstaben a, b und f sowie Artikel 6a Absatz 3 Buchstabe g Ziffern i, ii, iii un… | richtig |
| DE-17 | art_43#p2 | «Verordnung (EU) Nr. 1053/2013» | 32013R1053 | … Evaluierungsmechanismus geltenden Vorschriften sind in der Verordnung (EU) Nr. 1053/2013 festgelegt. Gemäß diesem Evaluierungsmechanismus nehmen die… | richtig |
| DE-18 | anx_VI#n3.n1.n4.s3 | «Artikeln 5» | art_5# | …Abweichend von den Artikeln 5 und 8 werden Personen an Bord keinen systematischen Grenzko… | richtig |
| DE-19 | anx_VII#n4.n3 | «Artikel 14» | art_14# | …eisen. Des Weiteren dürfen Grenzschutzbeamte abweichend von Artikel 14 Inhaber von Diplomaten-, Amts- oder Dienstpässen nicht die … | richtig |
| DE-20 | anx_XII#ptA.n6 | «Artikel 23a Absatz 1 Buchstabe a» | art_23a#p1.a | …rgangen ist, im Rahmen der bilateralen Zusammenarbeit gemäß Artikel 23a Absatz 1 Buchstabe a an die zuständigen Behörden des übernehmenden Mitgliedstaat… | richtig |
| FR-01 | art_6#p1.b | «règlement (UE) 2018/1240» | 32018R1240 | …ge en cours de validité si celle-ci est requise en vertu du règlement (UE) 2018/1240 du Parlement européen et du Conseil, sauf s’ils sont titula… | richtig |
| FR-02 | art_6a#p3.g.viii | «3.2.5» | anx_VI#n3.n2.n5 | …ns aux frontières conformément à l’annexe VI, points 3.2.4, 3.2.5 et 3.2.6;… | richtig |
| FR-03 | art_8#p3.h.i | «article 18 du règlement (CE) no 767/2008» | 32008R0767 [art_18#] | …ion peut comprendre la consultation du VIS conformément à l’article 18 du règlement (CE) no 767/2008;… | richtig |
| FR-04 | art_8a#p2 | «article 23, paragraphe 2, du règlement (UE) 2017/2226» | 32017R2226 [art_23#p2] | …l’identité du ressortissant de pays tiers, conformément à l’article 23, paragraphe 2, du règlement (UE) 2017/2226.… | richtig |
| FR-05 | art_8a#p4 | «paragraphes 2» | art_8a#p2 | …nt article ne sont pas enregistrées dans l’EES en vertu des paragraphes 2 et 3:… | richtig |
| FR-06 | art_8d#p8 | «paragraphe 3» | art_8d#p3 | …Lors de la vérification, conformément au paragraphe 3, du respect par le demandeur des conditions énoncées au par… | richtig |
| FR-07 | art_18#p2 | «paragraphe 1» | art_18#p1 | …nt la Commission de tout arrangement conclu conformément au paragraphe 1.… | richtig |
| FR-08 | art_19#s1 | «annexe VI» | anx_VI# | …Les modalités spécifiques de vérification décrites à l’annexe VI s’appliquent aux vérifications faites aux différents types … | richtig |
| FR-09 | art_21a#p6 | «paragraphe 2» | art_21a#p2 | …Le règlement d’exécution visé au paragraphe 2 doit, selon le cas:… | richtig |
| FR-10 | art_23a#p1 | «article 23» | art_23# | …ays tiers appréhendé dans les zones frontalières visées à l’article 23, dans les cas où les conditions suivantes sont remplies:… | richtig |
| FR-11 | art_27a#p4 | «paragraphe 2» | art_27a#p2 | …Lorsqu’un avis visé au paragraphe 2 ou 3 est rendu, la Commission met en place un processus de … | richtig |
| FR-12 | art_28#p2 | «paragraphe 4» | art_28#p4 | …ande ampleur persiste, en tenant compte de l’examen visé au paragraphe 4.… | richtig |
| FR-13 | art_30#p1.a | «décision 2009/371/JAI» | 32009D0371 | …seil, ou l’Office européen de police (Europol), créé par la décision 2009/371/JAI, et la mesure dans laquelle de telles mesures sont suscepti… | richtig |
| FR-14 | art_42a#p2 | «paragraphe 1 du présent article» | art_42a#p1 | …Par dérogation au paragraphe 1 du présent article, aucun cachet n’est apposé sur les documents de voyage des … | richtig |
| FR-15 | art_42a#p2 | «g) ii)» | art_6a#p3.g.ii | …, b), et f), à l’article 6 bis, paragraphe 3, points g) i), g) ii), g) iii), et g) vii), et à l’article 6 bis, paragraphe 3, p… | richtig |
| FR-16 | anx_V#ptA.n2.a | «directive 2001/51/CE» | 32001L0051 | …e 26 de la convention de Schengen et aux dispositions de la directive 2001/51/CE du Conseil;… | richtig |
| FR-17 | anx_VI#n2.n3.n3 | «2.2» | anx_VI#n2.n2 | …ifications sur les personnes conformément aux points 2.1 et 2.2.… | richtig |
| FR-18 | anx_VI#n4.n3 | «3.2» | anx_VI#n3.n2 | …Les dispositions pertinentes des points 3.1 et 3.2 s’appliquent mutatis mutandis aux vérifications dans le cad… | richtig |
| FR-19 | anx_VII#n2.n2 | «articles 7 à 14» | art_7# ; art_8# ; art_8a# ; art_8b# ; art_8c# ; art_8d# ; art_9# ; art_10# ; art_11# ; art_12# ; art_12a# ; art_13# ; art_14# | …Les articles 7 à 14 s’appliquent aux vérifications sur les équipages d’aéronefs… | richtig |
| FR-20 | anx_VII#n5.n1 | «articles 8» | art_8# | …nérales relatives au contrôle aux frontières, notamment les articles 8 et 14.… | richtig |
| EN-01 | art_6#p5.a | «paragraph 1» | art_6#p1 | …nationals who do not fulfil all the conditions laid down in paragraph 1 but who hold a residence permit or a long-stay visa shall b… | richtig |
| EN-02 | art_6a#p3.b.ii | «Directive 2004/38/EC» | 32004L0038 | …e third-country nationals hold a residence card pursuant to Directive 2004/38/EC or a residence permit pursuant to Regulation (EC) No 1030/2… | richtig |
| EN-03 | art_6a#p3.g.i | «point 1 of Annex VII» | anx_VII#n1 | … other senior members of a royal family, in accordance with point 1 of Annex VII;… | richtig |
| EN-04 | art_6a#p3.g.iv | «point 5 of Annex VII» | anx_VII#n5 | …cross-border workers in accordance with point 5 of Annex VII;… | richtig |
| EN-05 | art_6a#p3.g.viii | «3.2.5» | anx_VI#n3.n2.n5 | …t subject to border checks in accordance with points 3.2.4, 3.2.5 and 3.2.6 of Annex VI;… | richtig |
| EN-06 | art_8#p2d | «2b» | art_8#p2b | …With regard to air borders, paragraphs 2a and 2b shall apply for a maximum transitional period of six months… | richtig |
| EN-07 | art_8a#p6 | «paragraph 1» | art_8a#p1 | …ed to in paragraph 5 reveals that the person referred to in paragraph 1 has an individual file registered in the EES but that his o… | richtig |
| EN-08 | art_8a#p6.b | «Article 14(2) of Regulation (EU) 2017/2226» | 32017R2226 [art_14#p2] | …s been taken, update the individual file in accordance with Article 14(2) of Regulation (EU) 2017/2226.… | richtig |
| EN-09 | art_8d#p6.s2 | «Articles 8(3)(a)» | art_8#p3.a | …om the national facilitation programme on entry pursuant to Articles 8(3)(a) and (b) and on exit pursuant to Article 8(3)(g) without com… | richtig |
| EN-10 | art_12a#p2 | «paragraph 1» | art_12a#p1 | …riod after the EES has started operations as referred to in paragraph 1. In the case of a discrepancy between the date of the entry… | richtig |
| EN-11 | art_25a#p6.s3 | «second» | art_25a#p6 {sub:2} | …ths, in line with the risk assessment as referred to in the second subparagraph. Where a Member State decides to do so, it sha… | richtig |
| EN-12 | art_27a#p3 | «Article 25a(4)» | art_25a#p4 | …prolongation of border control at the internal border under Article 25a(4) which leads to the continuation of border control at intern… | richtig |
| EN-13 | art_33#p4 | «Article 38(2)» | art_38#p2 | …in accordance with the examination procedure referred to in Article 38(2).… | richtig |
| EN-14 | art_37#p5 | «Article 13(5)» | art_13#p5 | …A delegated act adopted pursuant to Article 13(5) and Article 36 shall enter into force only if no objection … | richtig |
| EN-15 | art_39#p1.a | «Article 2(16)(b)» | art_2#n16.b | …ween those covered by Article 2(16)(a) and those covered by Article 2(16)(b) and accompanied by a specimen for permits covered by Articl… | richtig |
| EN-16 | art_43#p5 | «Regulation (EU) No 1053/2013» | 32013R1053 | … any proposal to amend or to replace the rules laid down in Regulation (EU) No 1053/2013.… | richtig |
| EN-17 | anx_VI#n3.n2.n2 | «Articles 5» | art_5# | …e territory of the Member States, by way of derogation from Articles 5 and 8, no border checks shall be carried out and the cruise… | richtig |
| EN-18 | anx_VII#n1.s2 | «Articles 8 to 14» | art_8# ; art_8a# ; art_8b# ; art_8c# ; art_8d# ; art_9# ; art_10# ; art_11# ; art_12# ; art_12a# ; art_13# ; art_14# | …By way of derogation from Article 6 and Articles 8 to 14, Heads of State, Heads of Government and members of nationa… | richtig |
| EN-19 | anx_VII#n5.n1 | «14» | art_14# | …neral rules on border control, in particular Articles 8 and 14.… | richtig |
| EN-20 | anx_XII#ptA.n1 | «Part B of this Annex» | anx_XII#ptB | … shall be issued by means of a standard form, as set out in Part B of this Annex, completed by the competent national authority. They shall … | richtig |

Ergänzend (gezielt, nicht Teil der Stichprobe) geprüft: alle 5 unsicheren Verweise (§3), die drei Abweichungen (§4), die Bereiche «Artikel 7 bis 14» in s00 (nur Art. 7–14 ohne die später eingefügten 8a–8d, 12a).

Hinweis zur Lesart von Bereichen: «Artikel 25 bis 30» umfasst im Stand s08 auch die später eingefügten Art. 25a und 27a (übliche Auslegung bei eingeschobenen Artikeln).

## 6 Weitere Werke (data/works, Agent BIBLIOTHEK)

Index je Werk für den jüngsten Stand, mit `worksIndex` und allen Datensätzen:

| Werk | Stand | Blöcke | Verweise DE/FR/EN | unsicher DE/FR/EN | tot DE/FR/EN | Sprachabgleich |
|---|---|---|---|---|---|---|
| EES (2017/2226) | s04 | 869 | 961/960/959 | 61/57/56 | 2/1/0 | 840/869 = 96,7 % |
| ETIAS (2018/1240) | s05 | 1191 | 1100/1094/1100 | 17/17/17 | 0/3/1 | 1154/1191 = 96,9 % |
| VIS (767/2008) | s10 | 533 | 526/529/528 | 12/10/13 | 41/42/44 | 508/533 = 95,3 % |
| IO (2019/817) | s05 | 863 | 935/944/948 | 61/67/59 | 3/5/5 | 822/863 = 95,2 % |

- Änderungsartikel (z. B. Art. 58 IO-VO «Regulation (EC) No 767/2008 is amended as follows»): Verweise ohne Aktangabe beziehen sich auf den geänderten Akt (`target.via: "amended-act"`); im zitierten neuen Wortlaut (Schlüssel mit `q…`) auch «this Regulation». Relative Verweise in Änderungsartikeln sind unsicher (`relative-in-amendment`). Ohne diese Regel hatte die IO-VO 70 tote Ziele (DE), mit ihr 3.
- VIS: Die toten Ziele zeigen auf Einheiten, die im VIS-Datensatz fehlen (u. a. Art. 7a–7h, 9a, 22a, 22g, 22l, 45a; eingefügt durch VO (EU) 2021/1134). Vermutlich Lücke des Datensatzes oder der konsolidierten Fassung; an Agent BIBLIOTHEK gemeldet (Bericht), nicht von mir geprüft.
- EES: Schlüssel `art_9#p2a~2` (doppelte Nummer in der Quelle?) führt zu einem toten FR-Ziel «paragraphe 2 ter»; Sache des Datensatzes.
- Die Abweichungen in den weiteren Werken sind nicht einzeln geklärt (nicht Pflichtprüfung); Schwerpunkte: Erwägungsgründe (relative Verweise ohne Einheit), unterschiedliche Gliederungswörter.

## 7 Leistung

`buildRefIndex` für s08, eine Sprache, ohne Bibliothek, 10 Läufe (Rechner mit 2 Kernen, Last 3 durch parallele Agents):

| | Wandzeit erster Lauf | Wandzeit Median | CPU-Zeit max. |
|---|---|---|---|
| DE | 52–70 ms | 16–30 ms | 78 ms |
| FR | 45–58 ms | 18–20 ms | 97 ms |
| EN | 28–100 ms | 12–22 ms | 79 ms |

(zwei Messreihen am Schluss). Unter starker Last wurden einzelne Wandzeiten bis 396 ms gemessen (CPU-Zeit dabei unter 100 ms); der Test prüft die CPU-Zeit (Median von 3 Läufen < 300 ms).

## 8 Grenzen

- Mehrdeutige Kurzverweise ohne Einheit in Erwägungsgründen und Änderungsartikeln bleiben unsicher.
- Benannte Instrumente ohne CELEX (AEUV, EUV, Charta) haben `work: null` und `instrument`.
- Die Zuordnung «Artikel N» zum eigenen Werk setzt voraus, dass kein Aktname folgt; unbekannte Aktnamen werden über eine Vorausschau erkannt (Verordnung, Richtlinie, Beschluss, Übereinkommen, Abkommen, Vertrag, Protokoll, Akte, Kodex usw.). Ein Aktname ohne diese Wörter würde übersehen.
