# Export von Karten (Etappe 3, Erweiterung 2): Word-Baustein, Zwischenablage, PDF

Stand 12. November 2026. Bibliothek `src/export/` (ESM, isomorph: Browser und Node, keine Abhängigkeit von `src/app`).
Die Oberfläche füllt ein Kartenmodell (fertig übersetzt) und ruft die Ausgabefunktionen auf. Die Bibliothek enthält keine
UI-Texte ausser Rückfallwerten (`FALLBACK_LABELS`: Seitenzahl, leere Zelle, Hinweis Änderungsverfolgung).

## 1 Schnittstelle

```js
import { validateCard, assertCard, normalizeCard, htmlToRuns, htmlTableToBlock, redlineRuns, mergeRedline, runsText, blockText,
         cardToDocx, cardsToDocx, cardToPdf, cardsToPdf, PDF_FORMATS, cardToClipboard, cardsToClipboard, FALLBACK_LABELS, FONT_META } from './src/export/index.js';

validateCard(card) -> { ok, errors: string[], warnings: string[] }      // wirft nie; Meldungen mit Pfad, z. B. 'sections[0].blocks[2].runs[1].op: unbekannter Wert "add" (erlaubt: eq, ins, del)'
assertCard(card) -> { ok, errors, warnings }                            // wirft Error «Ungültige Karte: …» (e.errors = alle Meldungen)
cardToDocx(card, { redline: "format" | "tracked", author?, date?, colors? }) -> Uint8Array
cardsToDocx(cards[], opts) -> Uint8Array                                 // Sammelkorb; jede weitere Karte auf neuer Seite (pageBreaks: false schaltet ab)
cardToPdf(card, { format: "a4" | "16x9", date?, onWarning?, fit?, minScale? }) -> Uint8Array
cardsToPdf(cards[], opts) -> Uint8Array                                  // Sammelkorb; Seitenzahlen fortlaufend
cardToClipboard(card, { colors?, textRedline?: "marks" | "new" | "old" }) -> { html, text }
cardsToClipboard(cards[], opts) -> { html, text }
// Hilfen für die Oberfläche
htmlToRuns(inlineHtml) -> Run[]                       // <ins> <del> <b> <i> <sup> <sub> <br>, Entitäten dekodiert
redlineRuns(oldHtml, newHtml, redlineHtml?) -> Run[]  // aus diffText() der Oberfläche (src/app/lib/diff.js): zeichengenaue Redline
htmlTableToBlock(tableHtml, { label?, depth?, key? }) -> Block   // Datensatz-Block ty "table" (Feld html) als Tabellen-Block
```

- `date` (ISO): Datum der Überarbeitungen (DOCX) bzw. Erstellungsdatum und Datei-ID (PDF). Mit gesetztem `date` ist die
  Ausgabe reproduzierbar (gleiche Eingabe, gleiche Bytes; in Node und Chrome geprüft). Ohne `date`: aktuelles Datum.
- `author` (DOCX tracked): Autor der Überarbeitungen, Standard «SGK-Navigator». Die Oberfläche kann das Kürzel der Person übergeben.
- `colors: false`: Redline ohne Farbe (nur Unterstreichung/Durchstreichung), z. B. für Schwarzweissdruck.
- `onWarning(msg)` (PDF): Meldung, wenn ein Zeichen in keiner eingebetteten Schrift vorkommt und ersetzt wird (bei allen Datensätzen: nie).
- `fit` (PDF, Standard bei 16:9): Schrift bis `minScale` (Standard 0,72, d. h. Rechtstext 10,8 pt) verkleinern, bis die Karte auf eine
  Folie passt, wie die Oberfläche beim PNG-Export. Passt sie auch dann nicht, bleibt die Grundgrösse und die Karte läuft über mehrere Folien.

## 2 Kartenmodell

Vertrag SPEC3 §3.9 unverändert gültig; ergänzt (nur zusätzliche, optionale Felder), damit Word, PDF und Zwischenablage
dasselbe zeigen wie die PNG-Karten der Oberfläche (Kopfzeile, Kürzel und Farbe des Akts, Etiketten, Herkunftsmarke je Zelle).
Vollständige Typbeschreibung mit JSDoc in `src/export/model.js`.

```jsonc
{ "kind": "chronology|comparison|row|preview", "title": "Art. 8 Abs. 3 Bst. a Ziff. ii SGK", "subtitle": "Chronologie der Fassungen",
  "unitLine": "Art. 8: Grenzübertrittskontrollen von Personen",      // ergänzt: dritte Kopfzeile
  "brand": "SGK-Navigator", "work": "Schengener Grenzkodex",           // ergänzt: Kopfzeile links/rechts (nur PDF)
  "textLang": "de", "uiLang": "de", "textLocale": "de-DE"?, "uiLocale": "de-CH"?,   // Gebietsschema für Word (Rechtschreibprüfung)
  "stats": "9 geändert, 43 eingefügt, 15 gestrichen"?,               // ergänzt
  "sections": [ { "heading": "VO (EU) 2017/458", "code": "Syst. Abfr."?, "tag": "ersetzt"?, "color": "#E69F00"?,
                  "meta": ["angenommen am 15. März 2017", "ABl. L 74 vom 18.3.2017, S. 1"], "flags": [ { "kind": "reconstructed", "label": "rekonstruiert" } ]?,
                  "lang": "fr"?,
                  "blocks": [ { "label": "ii)", "depth": 0, "type": "p|heading|table|img"?, "op": "ins|del"?, "lang"?, "key"?,
                                "runs": [ { "t": "…", "op": "eq|ins|del", "b"?, "i"?, "sup"?, "sub"?, "lang"? } ],
                                "rows": [ { "header"?: true, "cells": [ { "runs": [...], "span"?: 2 } ] } ]   // nur type "table"
                              } ] } ],
  "columns": null | [ { "heading": "Stand Basistext", "lang"?: "fr", "sectionIndexes"?: [0] }, { "heading": "…", "sectionIndexes"?: [1] } ],
  "rows": [ { "label": "Abs. 2 Bst. a", "tag": "eingefügt", "status": "same|changed|inserted|deleted",      // ergänzt: zeilenweise Gegenüberstellung
              "cells": [ null | { "blocks": [Block], "marks": [ { "label": "Syst. Abfr.", "color": "#E69F00" } ] }, … ] } ],
  "labelHeading": "Bestimmung"?,                                        // ergänzt: Kopf der Fundstellenspalte
  "legend": [ { "op": "ins", "label": "eingefügt" }, { "op": "del", "label": "gestrichen" }, { "code": "EES", "label": "VO (EU) 2017/2225", "color": "#009E73" } ],
  "footnotes": [ { "mark": "1", "text": "…" } ]?, "source": "Quelle: EUR-Lex …", "disclaimer": "Massgebend ist allein …",
  "labels": { "page": "Seite {i} von {n}", "empty": "—", "tracked": "…" }? }  // ergänzt: Beschriftungen der Bibliothek überschreiben
```

Begründung der Ergänzungen:
- `rows` statt nur `columns.sectionIndexes`: Ein Vergleich ganzer Artikel muss Bestimmung für Bestimmung nebeneinander stehen
  (alte und neue Fassung derselben Fundstelle auf gleicher Höhe), sonst laufen die Spalten über mehrere Seiten auseinander.
  `columns.sectionIndexes` nach SPEC3 funktioniert weiterhin (`normalizeCard` macht daraus eine einzige Zeile).
- `code`, `color`, `flags`, `marks`, `brand`, `work`, `unitLine`, `stats`: gleiche Information wie in der Karte der Oberfläche
  (Screenshots `test/app/screenshots/export-*.png`); Farbe nie allein bedeutungstragend (immer mit Kürzel/Text).
- `type: "table"` und `htmlTableToBlock`: Anhänge IX und X enthalten Tabellen; ohne eigenen Blocktyp ginge die Struktur verloren.
- `lang` je Abschnitt/Spalte/Block/Lauf: Sprachvergleich (FR | EN) und Rechtstext in anderer Sprache als die Oberfläche.

Redline-Semantik: Läufe mit `op` = `eq` (unverändert), `ins` (eingefügt), `del` (gestrichen). Gestrichenes steht vor Eingefügtem.
Damit gilt für jeden Block: «alle annehmen» = `runsText(runs, "new")`, «alle ablehnen» = `runsText(runs, "old")`.
`redlineRuns()` setzt die beiden Seiten von `diffText()` der Oberfläche zeichengenau zusammen (Leerraum, den der Diff nur auf
einer Seite führt, wird als gestrichen bzw. eingefügt geführt). Geprüft an allen 225 Blockpaaren mit geändertem Wortlaut
im SGK-Datensatz (alle Einheiten, DE/FR/EN, aufeinanderfolgende Fassungen): 0 Abweichungen.

## 3 Word-Baustein (DOCX)

- Eigenes OOXML mit fflate (`src/neg/docx-write.js` nicht verwendet: dort fest eingebaute Fusszeile mit Seitenzahl und
  Formatvorlagen ohne Präfix, beides für einen einfügbaren Baustein unerwünscht).
- A4 hoch, Ränder 2 cm, Arial 10 pt (LibreOffice ersetzt durch Liberation Sans), keine Kopf-/Fusszeilen, keine Nummerierungsdefinitionen,
  keine Felder. Titel, Untertitel, Quelle und Hinweis sind gewöhnliche Absätze.
- Formatvorlagen mit Präfix «SGK» (z. B. «SGK Rechtstext», «SGK Abschnitt», «SGK Quelle»), vollständig definiert (nicht auf «Standard»
  aufbauend): Beim Kopieren in eine Aktennotiz behält der Inhalt sein Aussehen und kollidiert nicht mit den Vorlagen der Notiz.
- Gliederungszeichen hängend (Tabulator nach dem Zeichen, hängender Einzug je Stufe 0,75 cm; Unterabsatz bündig mit dem Text der Elternstufe).
- Gegenüberstellung als Tabelle (Fundstelle 2,75 cm, zwei gleich breite Spalten), Kopfzeile auf jeder Seite wiederholt.
- `redline: "format"`: eingefügt unterstrichen (grün), gestrichen durchgestrichen (rot). Legende mit denselben Auszeichnungen.
- `redline: "tracked"`: echte Änderungsverfolgung, `w:ins`/`w:del` mit `w:id`, `w:author`, `w:date`; gestrichener Text in `w:delText`.
  - Ganz eingefügte bzw. gestrichene Blöcke: auch die Absatzmarke ist als Überarbeitung markiert, damit nach «alle ablehnen» bzw.
    «alle annehmen» keine leeren Absätze bleiben.
  - Folgen eingefügter Absätze: wie Word beim Tippen («Eingabe» am Ende des Vorgängers) gilt die Marke des Vorgängers als eingefügt.
    Grund: Mit der anderen, ebenfalls zulässigen Form verschmilzt LibreOffice 24.2 beim Ablehnen einen eingefügten Lauf am
    Absatzende mit dem folgenden eingefügten Absatz und entfernt dabei den Absatzumbruch des Vorgängers (an einer Minimalkarte nachgewiesen).
  - Gegenüberstellung: linke Spalte alte Fassung ohne Marken, rechte Spalte vollständige Redline als Überarbeitung
    (annehmen = neue Fassung). Im Sprachvergleich (Spalten mit verschiedener Sprache) keine Änderungsverfolgung.
  - Die Legende «eingefügt/gestrichen» entfällt; stattdessen der Hinweis `labels.tracked`.

## 4 PDF

- jsPDF (in der App schon für den PNG/PDF-Export vorhanden) mit eingebetteten Teilmengen-Schriften; echter Text, durchsuchbar,
  ToUnicode-Tabelle je Glyphe. Eigener Satz: Zeilenumbruch nur an U+0020 (geschützte Leerzeichen und geschützte Bindestriche
  trennen nie), keine Silbentrennung, Flattersatz, Gliederungszeichen hängend; Seitenumbruch nur zwischen Zeilen, Überschrift und
  Metazeile bleiben mit den ersten Zeilen zusammen, keine einzelne erste oder letzte Absatzzeile, Fuss (Legende, Quelle, Hinweis) beisammen.
- Gegenüberstellung: Tabelle mit wiederholtem Kopf; Zeilen über 40 % der Seitenhöhe werden zwischen Textzeilen geteilt (je Spalte
  mindestens zwei Textzeilen auf der Folgeseite, sofern vorn drei bleiben), kleinere Zeilen wandern ganz auf die nächste Seite.
- Redline: eingefügt grün hinterlegt und unterstrichen, gestrichen rot hinterlegt und durchgestrichen (Linien als Vektorgrafik, also auch
  im Schwarzweissdruck sichtbar). Gestrichenes direkt vor Eingefügtem ohne Leerzeichen erhält einen kleinen Abstand (kein Zeichen).
- Formate: A4 hoch (Rechtstext 10 pt) und 16:9 (960 × 540 pt, Rechtstext 15 pt, bei Bedarf bis 10,8 pt verkleinert, siehe `fit`).
  Kopfzeile (brand/work) nur auf der ersten Seite einer Karte, Seitenfuss (Titel, «Seite i von n») nur bei mehreren Seiten.

### Schriftentscheid

Gewählt: eingebettete Teilmengen von Source Serif 4 (Rechtstext, Regular/Italic/Bold) und Noto Sans (Beschriftungen, Regular/SemiBold),
also dieselben Schriften wie die Oberfläche und die PNG-Karten.

Abgewogen:
- Standardschriften (Helvetica/Times, WinAnsi) kosten 0 KB, kennen aber U+2011 (geschützter Bindestrich), U+2265/U+2264 (≥ ≤),
  U+202F (schmales geschütztes Leerzeichen) und alle hochgestellten Ziffern ausser ¹²³ nicht; jsPDF kann sie nur über WinAnsi ausgeben.
  Ersatz (z. B. «‑» → «-», «≥» → «>=») veränderte den Rechtstext in der Kopie aus dem PDF, das widerspricht der Wortlauttreue.
- Die Dateien der App (`@fontsource`, WOFF2, Teilmenge «latin») kann jsPDF nicht einbetten (nur TrueType) und ihnen fehlen ≥ ≤.
- Volle TTF (Source Serif 4: rund 330 KB je Schnitt) sprengten das Budget.

Teilmengen (`test/export/tools/make-fonts.py`, fontTools, aus den TTF des Pakets `@expo-google-fonts`, devDependency):
Latein Basis und Erweiterung A, Satzzeichen U+2002–U+2027, Hoch-/Tiefstellung U+2070–U+208E, €, №, ™, Pfeile, ≈ ≠ ≤ ≥ ∞, ■;
ohne OpenType-Layout (jsPDF wertet GSUB/GPOS nicht aus) und ohne Hinting. Jeder Codepunkt erhält eine eigene Glyphe
(Source Serif teilt sich u. a. U+0020/U+00A0, U+2019/U+02BC, U+2009/U+202F; jsPDF schreibt die ToUnicode-Tabelle je Glyphe, sonst
kämen beim Kopieren falsche Zeichen). U+2011 fehlt in Source Serif und wird als Kopie des Bindestrichs ergänzt. Fehlt ein Zeichen in
der Serifenschrift, nimmt der Satz Noto Sans (und umgekehrt); erst wenn beide fehlen, wird ersetzt und `onWarning` gemeldet.
Umbenennung in «SGKN Serif» und «SGKN Sans», weil Source Serif den reservierten Namen «Source» trägt (OFL Ziff. 3);
Copyright- und Lizenzeinträge bleiben in den Schriften, Lizenztext `src/export/fonts/OFL.txt`.

Grösse (esbuild, minifiziert, gzip; Externals wie `build.mjs`), gemessen mit `test/export/size.test.mjs`:

| | minifiziert | gzip |
|---|---|---|
| Bibliothek samt jsPDF und fflate | 588,6 KB | 249,5 KB |
| jsPDF + fflate (in der App schon vorhanden) | 427,7 KB | 139,4 KB |
| **Zuwachs für die App** | **160,9 KB** | **110,1 KB** |
| davon Schriften (`fonts-data.js`, 5 Schnitte, zlib + base64) | 131,2 KB | |

Das Ziel < 400 KB ist eingehalten. Weitere Einsparung wäre möglich (Serif kursiv weglassen: −29 KB; dann würde Kursivschrift im
Rechtstext aufrecht gesetzt), wird nicht empfohlen.

## 5 Zwischenablage

`cardToClipboard` liefert HTML nur mit Inline-Styles (keine Klassen, kein `<style>`), Absätze `<p>` mit `margin-left`/`text-indent`
für hängende Gliederungszeichen (Tabulator als `mso-tab-count` für Word), `<ins style="text-decoration:underline">` und
`<del style="text-decoration:line-through">` (zusätzlich farbig), Gegenüberstellung als `<table>` mit `valign`/`cellpadding`.
Reiner Text: Redline als `[-gestrichen-]{+eingefügt+}` (Standard) oder nur neue bzw. alte Fassung (`textRedline`).
Einbindung: `navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })])`.
Unter file:// ist die Seite in Chrome ein sicherer Kontext (`isSecureContext` true); `navigator.clipboard.write` mit `text/html` und
`text/plain` in Chrome headless geprüft (Schreiben, Zurücklesen, Auszeichnung erhalten; Aufruf aus einem Klick). Edge (Chromium) sollte
sich gleich verhalten, nicht geprüft. Rückfall: `document.execCommand('copy')` mit einem unsichtbaren `contenteditable`-Element, das `html` enthält.

## 6 Prüfungen (alle ausgeführt, `node --test test/export/*.test.mjs`, 30 Tests, rund 25 s)

Beispielkarten (`test/export/fixtures/`, erzeugt mit `node test/export/tools/make-fixtures.mjs` aus `data/dataset.json` mit
`blockHistory()` und `diffText()`; Wortlaut im Test zeichengenau gegen den Datensatz geprüft):

| Datei | Inhalt | Sprache |
|---|---|---|
| chronology-art8-3a-ii-de | Art. 8 Abs. 3 Bst. a Ziff. ii, Basistext, VO (EU) 2017/458 (ersetzt), Berichtigung R(03) zu VO (EU) 2018/1240 (ersetzt) | DE |
| chronology-art8-3a-ii-fr | dieselbe Chronologie, Oberfläche und Rechtstext FR | FR |
| chronology-art8-3a-ii-en | dieselbe Chronologie, Rechtstext EN, Oberfläche DE | EN |
| comparison-art8-s00-s08 | ganzer Art. 8, Basistext gegen Stand nach R(01) zu VO (EU) 2024/1717, nebeneinander, 83 Zeilen | DE |
| languages-art8-2a-fr-en | Sprachvergleich Art. 8 Abs. 2a–2d, FR \| EN, Oberfläche FR | FR, EN |
| long-art8-unit | Chronologie ganzer Art. 8, alle Änderungsschritte, 114 Blöcke | DE |

DOCX (`test/export/docx.test.mjs`):
- Alle 12 Dateien (6 Karten × format/tracked) und Sammelkorb: ZIP, 8 Pflichtteile, jedes XML wohlgeformt (xmllint), Inhaltstypen und
  Beziehungen vollständig, keine Kopf-/Fusszeilen- oder Nummerierungsteile, nur Arial, A4; reproduzierbar (gleiche Bytes).
- format: unterstrichener Text = eingefügter Text, durchgestrichener = gestrichener Text (zeichengenau, je Karte).
- tracked: jede Überarbeitung mit Autor, Datum, eindeutiger ID; Rechtstext-Absätze nach «annehmen»/«ablehnen» (aus dem XML nach
  WordprocessingML-Semantik abgeleitet) = neue/alte Fassung der Karte.
- LibreOffice 24.2: alle 12 Dateien nach PDF gewandelt (A4; Seiten 1/1/1/16/3/9), Textabdeckung 99,6–100 % (Rest: von LibreOffice
  am Bindestrich getrennte Wörter, z. B. «Schengen-|Bewertungsverfahren»).
- LibreOffice per UNO (`test/export/tools/lo-revisions.py`): erkennt die Überarbeitungen (z. B. Vergleich Art. 8: 76 Redlines, 53 Einfügungen,
  23 Löschungen; LibreOffice fasst benachbarte Überarbeitungen gleichen Autors zusammen; Autor und Datum gelesen), führt
  «Alle annehmen» und «Alle ablehnen» aus (Dispatch `.uno:AcceptAllTrackedChanges`/`.uno:RejectAllTrackedChanges`);
  Ergebnis für alle 6 Karten identisch mit der Ableitung aus dem XML, jeder neue bzw. alte Absatz wörtlich enthalten.
- Rückwandlung DOCX → ODT (76 `text:changed-region`) → DOCX (146 `w:ins`, 41 `w:del`): Text nach Annehmen/Ablehnen unverändert.

PDF (`test/export/pdf.test.mjs`), je Karte A4 und 16:9:
- Textabdeckung (pdftotext, Wörter): 100,00 % für alle 12 PDF (DE, FR, EN); Reihenfolge je Absatz/Zelle 100 %; Gesamtreihenfolge
  100 % bei Chronologien, 94,98–100 % bei Gegenüberstellungen (eine über den Seitenumbruch geteilte Zeile setzt links und rechts
  auf der Folgeseite fort; das ist im zweispaltigen Satz so gewollt).
- Seiten: A4 1/1/1/19/3/10, 16:9 1/1/1/31/6/21 (Chronologien Ziff. ii passen verkleinert auf eine Folie). «Seite n von n» bei mehrseitigen Karten.
- Geometrie (pdftotext -bbox): kein Wort ausserhalb der Seite (Rand 12 pt), keine zwei Wörter mit mehr als 25 % Überdeckung (0 Fälle bei rund 24 000 Wörtern).
- Sonderzeichen: Prüfkarte mit 42 Nicht-ASCII-Zeichen (ß œ Œ é „ “ ‚ ‘ « » ’ – — ‑ U+00A0 U+202F ≥ ≤ ½ ¹²³⁴ × € § ° … Æ ø £ ® ™ u. a.),
  DE/FR/EN, A4 und 16:9: alle in der ToUnicode-Tabelle; alle ausser den Leerräumen auch in der pdftotext-Ausgabe (Poppler gibt U+00A0
  als Leerzeichen aus und lässt U+202F weg, das ist Poppler-Normalisierung; die Abbildung im PDF ist korrekt). Hoch- und Tiefstellung
  in richtiger Reihenfolge.
- Zeichenvorrat: alle 33 Nicht-ASCII-Zeichen der Datensätze `data/dataset.json` und `data/works/*.dataset.json` (Stand heute: EES)
  sind in allen drei Serif-Schnitten vorhanden.
- Schriften eingebettet (pdffonts: CID TrueType, Identity-H, emb yes, ToUnicode yes); reproduzierbar mit `date`.

Zwischenablage (`test/export/clipboard.test.mjs`): HTML-Dateien mit LibreOffice (Filter «HTML (StarWriter)») nach DOCX gewandelt:
unterstrichene bzw. durchgestrichene Zeichen = eingefügte bzw. gestrichene Zeichen der Karte, für alle 6 Karten zeichengenau
(z. B. Vergleich Art. 8: 14 688 bzw. 4 311 Zeichen). Jeder Block steht vollständig im Text.

Browser (`test/export/browser.test.mjs`): esbuild-Bündel (IIFE, Externals wie `build.mjs`) in einer HTML-Seite mit CSP
`default-src 'none'`, Chrome headless über Playwright, `file://`, Kontext offline, jede Nicht-file-Anfrage abgebrochen und gezählt:
0 Anfragen, 0 Konsolenfehler; DOCX (format, tracked), PDF (A4, 16:9), Zwischenablage und beide Sammelkörbe byte-gleich mit Node.
Zweiter Browsertest: Zwischenablage über `ClipboardItem` geschrieben und zurückgelesen (Text gleich, `<ins>`/`<del>` mit Stil erhalten).

Leistung (Karte mit 300 Blöcken aus dem Datensatz, Redline Basistext gegen jüngsten Stand), Chrome headless:
erster Aufruf (Schriften werden dekodiert) DOCX 34 ms (format) / 19 ms (tracked), PDF A4 244 ms, PDF 16:9 221 ms, Zwischenablage 6 ms;
wiederholt DOCX 6–9 ms, PDF 134–151 ms. Node: DOCX 34 ms, PDF 380 ms. Ziel (2 s / 5 s) deutlich eingehalten.

Ausgaben zur Durchsicht unter `test/export/out/` (nicht versioniert): `docx/*.docx`, `docx/lo/*.png` (von LibreOffice gesetzte Seiten),
`pdf/*.pdf`, `pdf/png/*.png`, `clipboard/*.html`, Berichte `*.txt`.

## 7 Offen und unsicher

- Nicht in Microsoft Word, Outlook oder Acrobat geprüft (keine Installation). Die DOCX-Struktur folgt ECMA-376; die Darstellung der
  Absatzmarken bei eingefügten Absätzen entspricht Word beim Tippen. Einfügen der Zwischenablage in Word/Outlook nur mittelbar über
  den HTML-Import von LibreOffice geprüft; dieser ignoriert teils `text-indent` in Tabellenzellen (hängende Einzüge in Zellen in LibreOffice
  nicht immer sichtbar), Word wertet die Inline-Styles erfahrungsgemäss vollständig aus.
- Einzüge im DOCX für Gliederungszeichen über 0,75 cm werden aus einer Zeichenbreitenschätzung (Arial) berechnet; bei ungewöhnlich
  langen Zeichen (z. B. «iiia)») kann der Text eine Tabulatorposition weiter beginnen.
- PDF: keine Silbentrennung, daher bei sehr langen Wörtern in schmalen Spalten (16:9-Vergleich) gelegentlich grosse Lücken; Wörter
  länger als die Zeile werden zeichenweise umbrochen (in den Daten nicht vorgekommen).
- PDF: Legenden-Einträge können am Zeilenende umbrechen (Kürzel und Aktname auf zwei Zeilen).
- PDF/UA (Tagged PDF) ist nicht umgesetzt; jsPDF erzeugt keine Struktur-Tags. Lesereihenfolge ist durch die Zeichenreihenfolge gegeben.
- Der Test «Zeichenvorrat» liest `data/works/*.dataset.json`; kommen dort neue Zeichen hinzu, die keine der Schriften kennt, schlägt er
  an (dann `RANGES` in `make-fonts.py` erweitern und `python3 -I test/export/tools/make-fonts.py` ausführen).

## 8 Hinweise für die Einbindung in die Oberfläche (Welle 2)

- Karte aus denselben Daten füllen, die `src/app/ui/card.js` darstellt: Abschnitte je Chronologieschritt (Kürzel, Farbe, Etikett
  «ersetzt/geändert», Metazeile, Kennzeichen «rekonstruiert», «noch nicht anwendbar»), Läufe mit `redlineRuns(d.oldHtml, d.newHtml, d.redline)`
  aus `diffText()`; Gegenüberstellung über `rows` (Fundstelle, Etikett, Herkunftsmarke). Beschriftungen aus `src/app/i18n/*.js`
  (u. a. `card.subChron`, `card.source`, `card.disclaimer`, `card.stats`), Seitenbeschriftung über `labels.page` (z. B. `export.page`).
- Vor dem Export `validateCard` aufrufen; bei Fehlern Meldung anzeigen (Texte sind für Entwickler, nicht für Nutzer gedacht).
- Herunterladen: `new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })` bzw. `application/pdf`.
- Im Menü zwei Word-Varianten anbieten: «Word (Redline als Formatierung)» und «Word (Änderungsverfolgung)»; Autor = Kürzel der Person,
  falls bekannt (wie `by` im Verhandlungsmodul).
- Die Bibliothek ist schnell genug für den Hauptthread (300 Blöcke unter 0,3 s); kein Worker nötig.
- Bundle: Die App bündelt jsPDF und fflate bereits; Zuwachs 161 KB (minifiziert). Die Schriften werden erst beim ersten PDF dekodiert.

## 9 Befehle

```sh
node --test test/export/*.test.mjs                 # alle Prüfungen (braucht soffice, poppler-utils, qpdf, xmllint, /usr/bin/python3 mit uno, Playwright + Chrome; fehlende Werkzeuge: Test übersprungen)
node test/export/tools/make-fixtures.mjs           # Beispielkarten neu erzeugen
python3 -I test/export/tools/make-fonts.py         # Schriften neu erzeugen (fontTools)
```
