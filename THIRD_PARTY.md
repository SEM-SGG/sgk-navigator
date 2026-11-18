# Drittkomponenten

Die gebaute Datei `SGK-Navigator.html` enthält die folgenden Komponenten Dritter (beim Build aus `node_modules` eingebettet).
Die Lizenztexte stehen im jeweiligen Paket (`node_modules/<paket>/LICENSE`) und für die Schriften unter
[`src/export/fonts/OFL.txt`](src/export/fonts/OFL.txt).

| Komponente | Version | Lizenz | Verwendung |
| --- | --- | --- | --- |
| Preact | 11.2.0 | MIT | Oberfläche |
| htm | 3.1.1 | Apache-2.0 | Oberfläche (Vorlagen) |
| diff (jsdiff) | 9.0.0 | BSD-3-Clause | Wortvergleich |
| fflate | 0.8.3 | MIT | Komprimierung der eingebetteten Daten, Word-Export |
| jsPDF | 4.2.1 | MIT | PDF-Export |
| html-to-image | 1.11.13 | MIT | Bild-Export der Karten |
| pdf.js (pdfjs-dist) | 6.5.438 | Apache-2.0 | Import von PDF im Modul Verhandlung |
| IBM Plex Sans, Serif, Mono (@fontsource) | 5.3.0 | SIL Open Font License 1.1 | Schriften der Oberfläche, des Rechtstexts und der Download-Seite |
| «SGKN Zeichen» (Teilmenge von IBM Plex Sans) | – | SIL Open Font License 1.1 | einzelne Zeichen (✓ ≈ →); umbenannt nach OFL Ziff. 3 |
| «SGKN Symbole» (Teilmenge von DejaVu Sans) | – | Bitstream-Vera-Lizenz mit DejaVu-Änderungen (gemeinfrei) | einzelne Symbole (○ ● ■ ✕ ✎); umbenannt, Copyright im Namensteil der Schrift |

Versionen gemäss `package-lock.json` zum Zeitpunkt der Veröffentlichung. Die Erzeugung der beiden Zeichenschriften beschreibt
`test/app/tools/make-ui-symbols.py`.

## Rechtstexte der Europäischen Union

Die Datensätze unter `data/` enthalten Texte aus EUR-Lex (Amtsblatt der Europäischen Union, konsolidierte Fassungen) und Metadaten
aus dem SPARQL-Endpunkt des Amts für Veröffentlichungen. © Europäische Union, https://eur-lex.europa.eu. Die Wiederverwendung
richtet sich nach dem Beschluss 2011/833/EU der Kommission über die Weiterverwendung von Kommissionsdokumenten. Nur die im Amtsblatt
der Europäischen Union veröffentlichten Rechtstexte sind verbindlich.

Die Beispiel-Dossiers des Moduls Verhandlung (`data/neg-demo*.json`) enthalten Auszüge aus Kommissionsvorschlägen (EUR-Lex) und
aus Dokumenten des öffentlichen Registers des Rates der EU; Fundstellen in `data/NEG_NOTES.md`.
