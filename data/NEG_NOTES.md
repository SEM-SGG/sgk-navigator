# NEG_NOTES — Modul Verhandlung: Quellen, Prüfergebnisse, Grenzen

Agent NEG-CORE (Etappe 2), nachgeführt von Agent VERHANDLUNG (Etappe 3, §9–§11), Stand 12.11.2026. Bibliothek `src/neg/` (Einstieg `src/neg/index.js`), Skripte `scripts/neg/`, Tests `test/neg/`.
Signaturen und Rückgabeformen: `data/NEG_STATUS.md`.

## 1 Quellen (nur amtlich veröffentlicht)

Alle Dateien liegen in `raw-neg/` (nicht im Git; neu laden mit `node scripts/neg/fetch-raw.mjs`). Ratsdokumente aus dem öffentlichen
Register `https://data.consilium.europa.eu/doc/document/<ST|WK>-<nr>-<jahr>-INIT/en/pdf`, Kommissionsvorschläge aus EUR-Lex
(`https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:<celex>`). Keine Dokumente von Statewatch o. ä. Gefunden über
Websuche und die EUR-Lex-Verfahrensseite `eur-lex.europa.eu/procedure/EN/2021_428` (Liste der Ratsdokumente). Einstufung «LIMITE»
steht auf dem Dokument; die Dateien sind trotzdem im öffentlichen Register abrufbar (freigegeben).

| Dokument | Titel (gekürzt) | Datum | Verfahren | Einstufung laut Dokument | Verwendung |
|---|---|---|---|---|---|
| COM(2021) 891 (CELEX 52021PC0891) | Proposal amending Reg. (EU) 2016/399 (SGK) | 14.12.2021 | 2021/0428(COD) | öffentlich | Beispiel-Dossier doc1 (Spur com); Test parseProposalHtml |
| ST 9377/22 | SGK: Preparation for a general approach | 30.5.2022 | 2021/0428(COD) | LIMITE | geladen, nicht verwendet |
| ST 9713/22 | SGK: Preparation for a general approach | 5.6.2022 | 2021/0428(COD) | LIMITE | geladen, nicht verwendet |
| ST 9937/22 | SGK: General approach (Vorlage) | 9.6.2022 | 2021/0428(COD) | – | Prüfung parseTextPdf |
| ST 10426/22 | SGK: General approach (Ratsmandat) | 13.6.2022 | 2021/0428(COD) | – | Beispiel-Dossier doc2 (Spur council); Prüfung parseTextPdf |
| ST 6222/22 | SGK: policy debate | 21.2.2022 | 2021/0428(COD) | LIMITE | geladen, nicht verwendet |
| **ST 14288/23** | SGK: **Four-column table** | 19.10.2023 | 2021/0428(COD) | – | Beispiel-Dossier doc3; Prüfung Vier-Spalten-PDF |
| ST 6331/24 | SGK: Analysis of the final compromise text | 13.2.2024 | 2021/0428(COD) | LIMITE | Beispiel-Dossier doc4 (Spur agreement); Prüfung parseTextPdf |
| ST 6568/24 | SGK: Letter to the Chair of LIBE (mit Kompromisstext) | 15.2.2024 | 2021/0428(COD) | – | geladen, nicht verwendet |
| ST 9156/24 | SGK: Outcome of the EP first reading | 29.4.2024 | 2021/0428(COD) | – | Vergleichsgrösse der Pflichtprüfung Vorschau (§9) |
| ST 8413/23 | Screening: Four-column table | 25.4.2023 | 2020/0278(COD) | – | Prüfung PDF, Zeilenabgleich (Serie 1/5) |
| ST 10863/23 | Screening: Four-column table | 20.6.2023 | 2020/0278(COD) | LIMITE | Prüfung PDF, Zeilenabgleich (2/5) |
| WK 13716/23 | Screening: Four-column table (TTE-Entwurf) | 3.11.2023 (Deckblatt am Ende) | 2020/0278(COD) | LIMITE | Prüfung PDF, Zeilenabgleich (3/5) |
| WK 16364/23 | Screening: Four-column table | 5.12.2023 | 2020/0278(COD) | LIMITE | Prüfung PDF, Zeilenabgleich (4/5) |
| WK 16999/23 | Screening: Four-column table | 16.12.2023 | 2020/0278(COD) | LIMITE | Prüfung PDF (eingerückte Zeilen), Zeilenabgleich (5/5) |
| ST 16759/23 | PNR/API (Strafverfolgung): 4-column | 13.12.2023 | 2022/0424(COD) | – | Prüfung PDF |
| ST 16760/23 | API (Grenzen): 4-column | 13.12.2023 | 2022/0425(COD) | – | Prüfung PDF, Zeilenabgleich |
| WK 2527/24 | API (Grenzen): 4-column + Spalte «CD3» | 15.2.2024 | 2022/0425(COD) | LIMITE | Prüfung PDF, Zeilenabgleich |
| WK 1588/24 | ECRIS-TCN/Screening: four-column (Seitenfussnoten) | 4.2.2024 | 2021/0046(COD) | LIMITE | Prüfung PDF |
| ST 10613/25 | Europol/Schleusung: 4-column | 20.6.2025 | 2023/0438(COD) | – | Prüfung PDF |
| ST 7749/25 | Visa-Aussetzungsmechanismus: four-column | 4.4.2025 | 2023/0371(COD) | – | Prüfung PDF |
| ST 8390/23 | Digitalisierung Visumverfahren: 4-column | 19.4.2023 | 2022/0132(COD) | – | Prüfung PDF, Zeilenabgleich |
| ST 9796/23 | Digitalisierung Visumverfahren: 4-column + «Auxiliary 1», zwei Tabellen (Anhang I/II) | 26.5.2023 | 2022/0132(COD) | LIMITE | Prüfung PDF, Zeilenabgleich, Leistung |
| COM(2024) 670 (CELEX 52024PC0670) | EU Digital Travel application | 8.10.2024 | 2024/0670(COD) | öffentlich | Beispiel-Dossier DTC doc1; Test parseProposalHtml / detectDocument |
| ST 15634/25 | Digital Travel app: Mandate for negotiations | 19.11.2025 | 2024/0670(COD) | – | Beispiel-Dossier DTC doc2; Prüfung parseTextPdf |
| WK 3948/26 | Digital Travel app: Three column table | 12.3.2026 | 2024/0670(COD) | LIMITE | Beispiel-Dossier DTC doc3 (Raster); Prüfung PDF (drei Spalten) |
| WK 4049/26 | Digital Travel app: State of play Art. 3a–3d, four column | 13.3.2026 | 2024/0670(COD) | LIMITE | Beispiel-Dossier DTC doc4; Prüfung PDF, Browser-Test |

Zur SGK-Revision 2021/0428(COD) war im öffentlichen Register nur **eine** Vier-Spalten-Tabelle auffindbar (ST 14288/23; Folgefassungen als
WK nicht öffentlich bzw. nicht gefunden: ST 14288/23 REV/COR existieren nicht). Die zeitliche Entwicklung im Beispiel-Dossier entsteht
deshalb aus Vorschlag → Ratsmandat → Vier-Spalten-Tabelle → endgültiger Kompromisstext. Aufeinanderfolgende Vier-Spalten-Fassungen
(für die Messung des Zeilenabgleichs) gibt es öffentlich zum Screening (5 Fassungen), zu API und zur Visa-Digitalisierung (je 2).
Für 2024/0670(COD) (Digital Travel app) liegen öffentlich vor: Vorschlag, Ratsmandat ST 15634/25, Drei-Spalten-Tabelle WK 3948/26 und der
Vier-Spalten-Auszug WK 4049/26 (Art. 3a–3d).

## 2 Layout der Vier-Spalten-Tabellen (beobachtet)

- Alle geprüften PDF stammen aus Word (Foxit-Rendition); Tabellenlinien sind als schmale gefüllte Rechtecke gezeichnet, Zellhintergründe als Flächen.
- Kopfzeile auf jeder Seite wiederholt (dunkle Fläche #303030, weisse fette Schrift): «Commission Proposal | EP Mandate | Council Mandate |
  Draft Agreement» (auch «Draft compromise»), teils weitere Spalten («Comments», «Auxiliary 1», «CD3»); im TTE-Layout kleine Umschalter
  «CLEAN», «VS.EC», «VS.CEU» im Kopf.
- Links schmale Spalte (beige #f4ebe1) mit Zeilennummer («12», «12a», «58p»). Alle 16 geprüften Tabellen haben Zeilennummern
  (eine Tabelle ohne Nummern wurde öffentlich nicht gefunden; der Parser behandelt den Fall trotzdem, siehe §4).
- **Trilogue Table Editor (TTE, «tte»)**: vor jeder Zeile eine über alle Spalten verbundene Fundstellen-Zeile («Recital 2»,
  «Article 3, first paragraph, point (-n)»). Statuskürzel «G»/«Y»/«R» winzig (5 pt) im linken und rechten Rand auf farbigem Balken (#33cc00 …).
  Grün hinterlegte Kompromisszelle (#eaf1dd) = vereinbart. Hinweise «Text Origin: EP Mandate» (Monospace), Themen-Etiketten auf violetter Fläche
  («Integration with IT systems»), Kommentare in kleiner Calibri («Moved reference text»). Wasserzeichen «PUBLIC»/«DRAFT» gedreht.
- **Klassisch («classic»)**: ohne Fundstellen-Zeilen; sonst gleich (ST 14288/23, 8413/23, 8390/23, 9796/23, 7749/25, WK 13716/23).
- Markierungen: EP-Text fett-kursiv-unterstrichen (blau), Streichungen durchgestrichen (rot), Ratstext fett; Unter-/Durchstreichungen sind
  als dünne Linien gezeichnet (nicht als Schriftattribut).
- Zellen laufen über Seitenumbrüche; auf der Folgeseite steht die Fortsetzung in einem Band ohne Nummer. Fussnoten stehen meist in der
  Zelle («_________ 1. Op. cit.»), in WK 1588/24 als Word-Seitenfussnoten unter der Tabelle.
- Sonderfälle: eingerückte Tabellenzeilen mit eigenen Spaltengrenzen (WK 16999/23 S. 102), zweite Tabelle mit anderen Spalten im selben
  Dokument (ST 9796/23 Anhang II), Seiten ohne wiederholte Kopfzeile (ST 10863/23), Deckblatt am Ende (WK 13716/23).

## 3 Verfahren parseFourColumnPdf

pdf.js liefert Textobjekte (Lage, Schrift) und die Operatorliste. Aus der Operatorliste werden achsenparallele Rechtecke und Linien mit
Farbe gelesen (eigene kleine Auswertung der Pfad- und Transformationsoperatoren). Spaltengrenzen = senkrechte dunkle Linien (je Band, damit
eingerückte Zeilen stimmen), Zeilenbänder = waagrechte Linien, deren Enden auf Spaltengrenzen liegen. Band ohne innere senkrechte Linien =
Fundstellen-Zeile. Kopfzeile = erstes Band mit ≥ 2 Spaltentiteln (fett oder auf dunkler Fläche); Zuordnung der Seitenspalten zum
Dokumentmodell über die Titel (andere Tabellen im selben Dokument werden richtig zugeordnet; Spalten ohne Gegenstück → Warnung).
Text je Zelle: Zeilen über Grundlinie, Hochstellung über kleinere Schrift und höhere Grundlinie (`<sup>`), Leerzeichen aus Abständen
(> 0,15 × Schriftgrösse), Absatzwechsel (`<br>`) bei Zeilenabstand > 1,38 × typischem Zeilenabstand des Dokuments. Zeilenende-Bindestrich:
kein Leerzeichen eingefügt, Bindestrich bleibt («third-» + «country» → «third-country»); weiche Trennung wird nicht aufgelöst (kommt in den
Ratsdokumenten nicht vor). Fett/kursiv aus dem Schriftnamen; unterstrichen/gestrichen aus dünnen Linien unter bzw. durch die Grundlinie
(Teilüberdeckung: Objekt wird an der nächsten Wortgrenze geteilt). Zellstatus aus Hintergrundfarbe (grün → agreed, gelb → provisional,
rot → open), Zeilenstatus aus Randkürzeln G/Y/R (auf die Kompromissspalte übertragen). «Text Origin», Monospace/Calibri-Hinweise in
kleinerer Fremdschrift → `cell.notes`; Text auf dunkler farbiger Fläche → `cell.tags`. Kopf-/Fusszeilen = alles ausserhalb der Tabelle;
Word-Seitenfussnoten unter der Tabelle (nicht auf vielen Seiten wiederkehrend) werden als `<br><sup>n</sup> Text` an die Zelle mit dem
passenden hochgestellten Verweis derselben Seite gehängt. Fundstelle: aus der Fundstellen-Zeile (`labelSource:"table"`), sonst aus dem Text
abgeleitet (`"derived"`, Strukturverfolgung inkl. Änderungsbefehlen «(3) Article 13 is replaced by the following:» und eingefügtem Wortlaut
in Anführungszeichen → `amends:{work:"sgk",unit:"art_13",key:"p1.a"}`), Zeilen ohne Nummer im TTE übernehmen die vorherige Fundstelle
(`"inherited"`).

### 3.1 Wortlauttreue (maschinell), alle 16 Tabellen

Referenz unabhängig von pdf.js: `pdftotext -bbox-layout` (Poppler) mit eigener, einfacher Spaltentrennung (Spaltenmitten aus den
Spaltentiteln jeder Seite, Grenze am tiefsten Punkt der Wortbelegung; Kopfzeile und wiederkehrende Fusszeile ausgeschlossen; über die
Nummernspalte hinauslaufende Zeilen = Fundstelle). Vergleich der Wortfolge je Spalte (Konkatenation aller Zellen) mit LCS.
Abdeckung = gemeinsame/Referenzwörter, Genauigkeit = gemeinsame/Parserwörter, Fehlzuordnung = Parserwörter, die in einer anderen
Referenzspalte fehlen. Skript `scripts/neg/validate-pdf.mjs`, Ergebnis `scripts/neg/out/validate-pdf.{txt,json}`.

| Dokument | Seiten | Zeilen | Layout | Abdeckung | Genauigkeit | Fehlzuordnung | Zeit (Node) |
|---|---|---|---|---|---|---|---|
| ST 14288/23 | 165 | 327 | classic | 99,99 % | 100,00 % | 0,00 % | 3,0 s |
| ST 8413/23 | 178 | 338 | classic | 100,00 % | 99,99 % | 0,00 % | 2,4 s |
| ST 10863/23 | 211 | 337 | classic | 99,52 % | 99,52 % | 0,48 % ¹ | 4,4 s |
| WK 13716/23 | 195 | 337 | classic | 100,00 % | 100,00 % | 0,00 % | 4,8 s |
| WK 16364/23 | 208 | 337 | tte | 100,00 % | 100,00 % | 0,00 % | 5,0 s |
| WK 16999/23 | 207 | 337 | tte | 99,96 % | 99,49 % | 0,50 % ² | 5,1 s |
| ST 16759/23 | 187 | 453 | tte | 100,00 % | 100,00 % | 0,00 % | 3,0 s |
| ST 16760/23 | 192 | 443 | tte | 100,00 % | 100,00 % | 0,00 % | 2,8 s |
| WK 2527/24 | 240 | 453 | tte | 99,93 % | 99,93 % | 0,00 % | 5,7 s |
| WK 1588/24 | 38 | 95 | tte | 99,98 % | 99,98 % | 0,02 % | 1,1 s |
| ST 10613/25 | 108 | 260 | tte | 99,98 % | 99,98 % | 0,00 % | 1,7 s |
| ST 7749/25 | 52 | 141 | classic | 100,00 % | 100,00 % | 0,00 % | 0,8 s |
| ST 9796/23 | 377 | 797 | classic | 99,92 % | 99,92 % | 0,00 % | 9,5 s |
| ST 8390/23 | 243 | 791 | classic | 99,99 % | 99,99 % | 0,01 % | 4,1 s |
| WK 3948/26 (3 Spalten) | 109 | 402 | tte | 99,97 % | 99,97 % | 0,02 % | 2,4 s |
| WK 4049/26 | 18 | 46 | tte | 100,00 % | 100,00 % | 0,00 % | 0,4 s |

Zeilenzahlen ohne Zeilen, die in der Quelle ganz leer sind (seit Nachtrag nicht mehr ausgegeben, Warnung `empty-row`: ST 10863/WK 13716/16364/16999 Nr. 221, WK 2527 Nr. 96h/96i, ST 9796 Nr. 28d/392j, WK 4049 Nr. 58y); die Abdeckungswerte wurden vor dieser Änderung gemessen, der Inhaltstext ist davon nicht betroffen. Nummern-/Fundstellenspalte: in 14 Dokumenten 100 %. Die verbleibenden Abweichungen wurden einzeln angesehen: ¹ Referenz erkennt die Spalte
«Comments» nicht (Kopfzeile nur auf einer Seite) und zählt sie zur Kompromissspalte; ² Referenz verwendet feste Spaltengrenzen und
ordnet Wörter der eingerückten Zeilen falsch zu; übrige Restabweichungen sind Reihenfolge-Unterschiede (Hinweis «Text Origin» steht beim
Parser am Zellende, Hochstellungen, Anführungszeichen-Trennung). Ein echter Textverlust des Parsers wurde in den Restabweichungen nicht gefunden.

### 3.2 Visuelle Stichproben (Seiten mit pdftoppm gerendert und mit den geparsten Zeilen verglichen)

| Seite | Inhalt | Ergebnis |
|---|---|---|
| ST 14288/23 S. 40 | Fortsetzung Zelle über Seitenumbruch (Nr. 34), Zeile 34a nur EP, leere Zellen, EP-Unterstreichung | stimmt (34 über S. 37–40, 34a nur EP fett-kursiv-unterstrichen) |
| ST 14288/23 S. 2–3 | Zeile 3 über Seitenumbruch («… COUNCIL OF THE» / «EUROPEAN UNION,») | stimmt (nach Korrektur der Kopfzeilenerkennung) |
| WK 4049/26 S. 3 und 12 | TTE-Fundstellenzeilen, Etiketten, grüne Kompromisszelle, Streichung, Zeile ohne Nummer | stimmt (Status agreed, `<s>Member States</s>`, Etikett als tags) |
| ST 9796/23 S. 12, 34, 356 | Statuskürzel G, «Text Origin», Spalte «Auxiliary 1», Wasserzeichen; Anhang II mit 4 Spalten | stimmt (nach Korrektur der Spaltenzuordnung für Anhang II) |
| WK 16999/23 S. 17 und 102 | Calibri-Text in Kompromissspalte, eingerückte Zeile 98d | stimmt (nach Einführung der Spaltengrenzen je Band; vorher ging Text verloren) |
| WK 1588/24 S. 6 | Word-Seitenfussnoten unter der Tabelle | Fussnoten werden angehängt; ihre Durchstreichung geht verloren |
| ST 6331/24 S. 30 (fortlaufender Text) | Erwägungsgründe mit Streichungen und fett-kursiven Einfügungen | stimmt |

### 3.3 Leistung und Bundle

- Browser (Chrome, Playwright, Einzeldatei unter file://, Worker als Blob): ST 9796/23 mit 377 Seiten (797 Zeilen) in **9,8 s** (Ziel < 30 s); WK 4049/26 in 0,8 s.
  Ohne Worker (Hauptthread) 0,7 s für WK 4049/26. Fortschritt über `onProgress` (Phasen read/analyze/rows).
- Grösse: Kernbibliothek `src/neg` gebündelt und verkleinert **142 KB** (53 KB gzip; enthält fflate und diff, die die App teils schon bündelt).
  pdf.js zusätzlich ca. **1,64 MB** (pdf.min.mjs 538 KB + Worker als IIFE ca. 1,1 MB). Minimalbeispiel als Einzeldatei: 1,79 MB.

## 4 Bekannte Grenzen (nach Wichtigkeit)

1. **Schriftfarben** werden nicht gelesen. Wo eine Quelle Änderungen nur farbig markiert (ohne Linie, fett/kursiv), geht die Markierung verloren
   (Warnung `colors-not-read`). Durchstreichungen werden nur erkannt, wenn sie als Linie gezeichnet sind (in allen geprüften Ratsdokumenten der Fall;
   Warnung `strike-detected` mit Anzahl zur Stichprobe).
2. Zeilenabgleich bei **fortlaufenden Texten** (Mandat, Kompromisstext) ohne Zeilennummern: nur über abgeleitete Fundstelle und Textähnlichkeit;
   beim Beispiel-Dossier 79 % (ST 10426/22) bzw. 80 % (ST 6331/24) eindeutig zugeordnet, Rest nicht zugeordnet/mehrdeutig → Prüfmaske nötig.
   Mehrdeutige Zeilen ohne Entscheid werden standardmässig übersprungen und gezählt (`ambiguous:"skip"`).
3. Abgeleitete Fundstellen (`labelSource:"derived"`) in Änderungsrechtsakten sind Näherungen («Article 1, point (3) › 2016/399 Article 13(1)»);
   tiefe Verschachtelungen (Unterabsätze, Spiegelstriche) werden nicht unterschieden.
4. Tabellen ohne Linien (gescannt oder reine Textausrichtung) werden nicht erkannt (Warnung `no-table`); Rückfall auf Abstände ist nicht umgesetzt.
   Gescannte PDF ohne Textebene: kein Ergebnis.
5. Word-Seitenfussnoten: Zuordnung über die Verweisnummer auf derselben Seite; Formatierung des Fussnotentexts (z. B. gestrichen) geht verloren.
6. Metadaten aus dem Deckblatt (Nummer, Datum, Einstufung) nur, wenn das Deckblatt Seite 1 ist (WK 13716/23 hat es am Ende).
7. parseFourColumnDocx/parseTextDocx: nur an selbst erzeugten und von LibreOffice neu gespeicherten Dateien geprüft (keine echten internen
   Word-Originale verfügbar). Automatische Word-Nummerierung wird nicht nachgebildet (Warnung `auto-numbering`). Farbiger Text → Warnung.
8. Wortlauttreue fortlaufender Texte (Poppler-Referenz, reihenfolgeunabhängig): Abdeckung 99,7–99,8 %, Genauigkeit 98,6–98,8 %
   (ST 6331/24, 10426/22, 15634/25, 9937/22; `scripts/neg/validate-text.mjs`). Die reihenfolgeabhängige Abdeckung (94,7–98,2 %) ist tiefer, weil
   Fussnoten beim Absatz statt am Seitenende stehen und Poppler Randnummern anders einreiht.

## 5 pdf.js offline in der einzelnen HTML-Datei

- Bibliothek bekommt `pdfjs` injiziert; keine Netzwerkzugriffe (`useSystemFonts:false`, `disableFontFace:true`, `useWorkerFetch:false`; für
  Textextraktion sind keine Schrift- oder CMap-Dateien nötig; geprüft: keine Requests ausser file:/blob:).
- **Befund**: Chrome lehnt **Modul**-Worker aus `blob:`-URLs unter `file://` (Ursprung «null») ab; **klassische** Blob-Worker laufen.
  Deshalb wird der pdf.js-Worker (`pdfjs-dist/legacy/build/pdf.worker.min.mjs`) beim Build mit esbuild als **IIFE** gebündelt und als
  Text eingebettet. Muster: `test/neg/browser/build.mjs` (esbuild-Plugin für Importe `"…pdf.worker.min.mjs?worker-classic"`) und
  `test/neg/browser/entry-blob.mjs`:
  ```js
  import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.min.mjs';
  import workerSource from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker-classic';   // Plugin liefert IIFE-Text
  import { setupPdfjs, parseFourColumnPdf } from './src/neg/index.js';
  const { pdfjs: ready, mode } = await setupPdfjs(pdfjs, { workerSource });             // mode "blob" (Worker) oder Rückfall "main"
  const parsed = await parseFourColumnPdf(bytes, { pdfjs: ready, onProgress });
  ```
  Rückfall ohne Worker: `import * as workerModule from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs'` und
  `setupPdfjs(pdfjs, { workerModule, mode: 'main' })` (setzt `globalThis.pdfjsWorker`; pdf.js arbeitet im Hauptthread). Beide Wege mit
  Chrome geprüft (`test/neg/pdfjs-browser.test.mjs`). Firefox/Safari/Edge nicht geprüft (kein Browser in der Umgebung).
- Empfehlung für build.mjs: pdf.js und Worker erst beim ersten PDF-Import laden (dynamischer Import im Bundle) oder, falls nur eine Datei
  ohne Nachladen möglich ist, Worker-Text als Zeichenkette einbetten (wie oben) – Grösse siehe §3.3.

## 6 Konsultationsdokument (.docx) — Format

- Eigenes OOXML, mit fflate gepackt; A4 quer, Arial 9 pt (Ersatz Liberation Sans), Formatvorlagen Title/Heading1/Heading2/TableHead/TableText/Small/Notice/Footer.
- Kopf: Einstufung (aus dem Grunddokument; «Beispiel» bei Demo-Dossier), Titel, Metadatentabelle (Dossier mit Id, Verfahren, Runde mit Id,
  Grundlage = Dokument/Datum/Spur, «Änderungen markiert gegenüber» = Vergleichsdokument/Spur, Frist, Stellungnehmende Stelle), Anleitung,
  Legende, Vertraulichkeitshinweis.
- Haupttabelle, Kopfzeile wiederholt: `Nr. | Bestimmung | Text (EN) | Position CH (Entwurf) | Kommentar der Stelle | Textvorschlag der Stelle (EN)`
  (optional Spalte «Weitere Fassungen»). Text (EN) mit Änderungen gegenüber der Vorfassung (eingefügt unterstrichen, gestrichen
  durchgestrichen); eigene Unter-/Durchstreichungen der Quelle werden dort weggelassen, damit die Markierung eindeutig ist. Ohne Vorfassung:
  Text ohne Markierung. Ausfüllspalten hellgelb.
- Kennungen: sichtbar «Z-000120» klein unter der Nummer, Textmarke `sgk_r000120`, benutzerdefinierte Eigenschaften `sgkKind`, `sgkDossier`,
  `sgkConsultation`, `sgkOffice`, `sgkLang`; Fusszeile «Verfahren · Dossier <id> · Runde <id> · Stelle · Einstufung · Seite x von y».
- Schluss: Abschnitt «Allgemeine Bemerkungen» mit Ausfülltabelle.
- Einlesen: Zeilen über die sichtbare Kennung (auch nach Löschen/Umsortieren/Kopieren), Spaltenrollen über die Kopfzeile (DE/FR, sonst Lage),
  Word-Kommentare über den Anker in der Zeile, Änderungsverfolgung in «Text (EN)» → Textvorschlag (`source:"tracked-change"`, `proposalHtml`
  mit Markierung), Runde/Dossier aus Eigenschaften oder Fusszeile; Kommentare ausserhalb, Zeilen ohne Kennung → `unmatched`.
- Prüfungen (alle ausgeführt, `node --test test/neg/consultation.test.mjs`): ZIP und wohlgeformtes XML aller Teile, Pflichtteile, deterministische
  Ausgabe; Roundtrip mit ausgefüllten Zellen, Word-Kommentar, Änderungsverfolgung, gelöschter und umsortierter Zeile, allgemeinen Bemerkungen;
  kopierte Zeilen ohne Eigenschaften; Französisch; **LibreOffice 24** (`soffice --headless --convert-to docx`) neu gespeicherte Datei liefert
  identische Zuordnung (inkl. Kommentar und Änderungsverfolgung); Umwandlung nach PDF gelingt, Seiten gerendert und angesehen
  (Konsultationsdokument, Briefing, Konsultationsbericht). Microsoft Word und Word Online standen nicht zur Verfügung.

## 7 Beispiel-Dossiers

`node scripts/neg/build-demo.mjs` (Protokoll `scripts/neg/out/build-demo.txt`). Gespeichert in verlustfreier Kurzform (`cellFormat:"compact-1"`,
beim Bau zurückgelesen und verglichen); laden mit `importDossier`. Nach dem Bau maschinelle Prüfung (`scripts/neg/check-demo.mjs`, auch als Test):
keine Zeile ohne Text, keine zwei Zeilen mit gleicher Fundstelle und gleichem Text in derselben Spur und demselben Dokument bzw. mit gleichem
jüngstem Text, Reihenfolge der Rasterzeilen = Rasterfassung. Ergebnis beider Dateien: **0 Verstösse**. Mehrfach vorkommende Fundstellen der
Quelle (z. B. mehrere «deleted»-Zeilen im selben Änderungspunkt, zwei «Formula»-Zeilen für die Unterschriften) tragen die Tabellennummer als
Zusatz («Article 4 [118]»).

**data/neg-demo.json – SGK-Revision 2021/0428(COD)** (707 KB): Raster = Vier-Spalten-Tabelle ST 14288/23 (327 Zeilen, Reihenfolge der Tabelle).
Aus den übrigen Fassungen nur eindeutig zugeordnete Absätze (`applyMerge` mit `ambiguous:"skip"`, `unmatched:"skip"`):

| Dokument | Absätze | zugeordnet | übersprungen (mehrdeutig / nicht zugeordnet) |
|---|---|---|---|
| COM(2021) 891 (14.12.2021) | 316 | 281 | 35 (0 / 35) |
| ST 10426/22 Ratsmandat (13.6.2022) | 345 | 272 | 73 (10 / 63) |
| ST 6331/24 Kompromisstext (13.2.2024) | 330 | 270 | 60 (13 / 47) |

(Etappe 3: Zahlen nach der Korrektur der Durchstreichungen in pdf-text.js, §9.3; vorher 271 bzw. 264.)

Übersprungene Absätze sind v. a. Fassungsteile, die es im Raster nicht gibt (Unterschriften, Begründungsteile, Zwischenüberschriften) oder die
ohne Nummer nicht sicher zuzuordnen sind. Stichprobe 30 Zeilen (jede 8. der 264 Zeilen mit Kompromisstext 2024), verglichen mit dem Text derselben
Zeile in ST 14288/23: in allen 30 Fällen Folgetext derselben Bestimmung (Erwägungsgründe, Begriffsbestimmungen Art. 2, Art. 13, 21a, 23, 23a, 25,
25a, 26, 27, 27a, 28, 33, 39, Anhänge XI/XII); Textähnlichkeit der bereinigten Texte meist 0,7–1,0; drei Zeilen tiefer (0,48; zweimal 0,00), weil die Bestimmung in einer der Fassungen ganz gestrichen ist (z. B. Nr. 206 im Kompromisstext vollständig durchgestrichen, Nr. 233 in der Ratsspalte) – Zuordnung trotzdem richtig.

**data/neg-demo-screening.json – Screening 2020/0278(COD)** (812 KB): fünf Vier-Spalten-Fassungen in zeitlicher Folge, 339 Zeilen:
ST 8413/23 (338 Zeilen) → ST 10863/23 (336 zugeordnet, 1 neu) → WK 13716/23 (337 zugeordnet; Nummer und Datum 3.11.2023 von Hand gesetzt, da das
Deckblatt am Dokumentende steht) → WK 16364/23 (337) → WK 16999/23 (337). 354 Textänderungen über EP-, Rats- und Kompromissspur, Status aus
Zellfarbe und Randkürzeln.

**data/neg-demo-dtc.json – EU Digital Travel application 2024/0670(COD)** (Etappe 3, 554 KB): Raster = Drei-Spalten-Tabelle WK 3948/26
(402 Zeilen; Spalten Kommission, EP-Mandat, Ratsmandat). Dazu eindeutig zugeordnet: COM(2024) 670 (206 von 227 Absätzen; 21 nicht
zugeordnet, v. a. Begründung und Finanzbogen ausserhalb des Rasters), Ratsmandat ST 15634/25 (320 von 328; 1 mehrdeutig, 7 nicht zugeordnet),
Vier-Spalten-Auszug WK 4049/26 (46 von 46 Zeilen, Art. 3a–3d, mit Spur «Kompromiss»). Prüfung: 0 Verstösse.

**Fiktiv** in allen drei Dateien (klar gekennzeichnet: `demo:true`, `note`, Konsultation `fictitious:true`): Positionen mit Platzhaltertext
(SGK 4, davon 2 als «Text seit Positionsbezug geändert» erkannt; Screening 3, davon 1; DTC 4), Runde `k1` mit «Stelle A (Beispiel)» und
«Stelle B (Beispiel)», 3 Rückmeldungen «Beispielkommentar: …», 2 Entscheide. Etappe 3: drei fiktive Delegationen «Delegation A/B/C (Beispiel)»
(`fictitious:true`) mit 6 Haltungen «Beispieläusserung (fiktiv) …», Sitzung `m1` «Beispielsitzung (fiktiv)» (Gremium «Ratsarbeitsgruppe (Beispiel)»),
3 Interventionen «Beispielintervention (fiktiv) …», 1 Ergebnis «Beispiel (fiktiv)». Realen Mitgliedstaaten, Institutionen und der Schweiz werden
keine Haltungen oder Äusserungen zugeschrieben (Test `real.test.mjs`). Keine realen Positionen der Schweiz, keine Aussagen realer Ämter.

## 8 Zeilenabgleich an echten Folgefassungen (scripts/neg/eval-merge.mjs)

| Serie | Fassung | Zeilen | zugeordnet | neu | mehrdeutig | Treffer mit gleicher Nr. | mit anderer Nr. |
|---|---|---|---|---|---|---|---|
| Screening | ST 10863/23 gegen 8413/23 | 337 | 336 (99,7 %) | 1 | 0 | 336 | 0 |
| | WK 13716/23 | 337 | 337 (100 %) | 0 | 0 | 337 | 0 |
| | WK 16364/23 | 337 | 337 (100 %) | 0 | 0 | 334 | 3 |
| | WK 16999/23 | 337 | 337 (100 %) | 0 | 0 | 336 | 0 (1 ohne Nr.) |
| API | WK 2527/24 gegen ST 16760/23 | 453 | 442 (97,6 %) | 11 | 0 | 385 | 57 |
| Visa-Digitalisierung | ST 9796/23 gegen 8390/23 | 797 | 789 (99,0 %) | 8 | 0 | 780 | 9 |

Treffer mit anderer Nummer sind Neunummerierungen des TTE bei Buchstabenzeilen (z. B. 96a → 96d); Stichprobe: alle mit identischem
Text (100 %). Treffer mit geringer Textähnlichkeit der Kommissionsspalte (< 50 %): 0. Deterministische Stichprobe (jede 50. Zeile) in
`scripts/neg/out/eval-merge.json` angesehen: Nummer, Fundstelle und Text passen. Doppelte Nummern in einem Dokument (ST 9796/23 Anhang I/II)
werden über die Reihenfolge richtig getrennt.

## 9 Vorschau hängiger Vorschläge im SGK (Etappe 3, `src/neg/preview.js`)

### 9.1 Verfahren

Je Spur (optional ein Dokument) werden die Zellen in Rasterreihenfolge gelesen; gestrichener Text (`<s>`) gehört nicht zum Wortlaut.
Jeder Absatz ist Änderungsanweisung (`parseAmendingInstruction`), neuer Wortlaut (Folgeabsätze einer Anweisung «… by the following:» /
«… is inserted:», bis zum schliessenden Anführungszeichen) oder Rahmentext. Behälteranweisungen («Article 8 is amended as follows:») bilden
den Kontext für Unteranweisungen («(a) paragraph 3 is replaced …»); Anweisungen an andere Rechtsakte (Kontext «Regulation (EC) No 2252/2004 is
amended as follows», Überschrift «Article 12 Amendments to …») werden erkannt und nicht angewandt. Der neue Wortlaut wird nach den
Schlüsselregeln von SPEC.md §5.2 gegliedert (Absatz `p3`, Punkt `a`, Ziffer `i`, Nummer `n31`, Gedankenstrich `d1`, Unterabsatz `s2`, Anhang
`ptA`, `h1`) und auf die englische Fassung des Basisstands angewandt. Nicht angewandt (→ `unresolved`) wird, was nicht sicher passt: Ziel fehlt
im Stand, Gliederungszeichen des Wortlauts passen nicht zur Anweisung, einzufügender Block besteht schon, Wortlaut fehlt, Umbenennung von
Kapitelüberschriften (nicht im Blockschema), Umnummerierung. Wortlaut wird nicht verändert (nur umschliessende Anführungszeichen,
Schlusszeichen der Anweisung und abgetrennte Gliederungszeichen; Fussnoten nach `fn`).

### 9.2 Pflichtprüfung am historischen Fall 2021/0428(COD) (`node scripts/neg/eval-preview.mjs`, Ergebnis `scripts/neg/out/eval-preview.{txt,json}`)

Endgültiger Kompromisstext ST 6331/24 (13.2.2024), Spur «Kompromiss», auf den SGK-Stand vor VO (EU) 2024/1717 (EN, s06) angewandt und mit dem
echten Stand s07 (ABl.-Fassung von 2024/1717) verglichen. Blöcke werden über den Schlüssel bzw. (bei Neunummerierung) über die Textähnlichkeit
zugeordnet (gierig, Schwelle 0,45; gleicher Schlüssel bevorzugt). Zwei Eingaben:

| | A: ST 6331/24 vollständig (330 Absätze, aus raw-neg/) | B: Beispiel-Dossier, doc4 (270 der 330 Absätze zugeordnet) | C (Vergleichsgrösse): Parlamentsstandpunkt ST 9156/24 |
|---|---|---|---|
| Anweisungen / angewandt / nicht aufgelöst | 25 / 22 / 1 | 21 / 15 / 4 | 22 / 19 / 1 |
| Einheiten (durch 2024/1717 geändert: 20) | 20 berührt, alle richtig, keine zusätzliche; 1 wortgleich (Art. 37a) | 15 berührt, keine zusätzliche | 17 (Anhänge XI, XII und Art. 24 nicht aufgelöst) |
| Blöcke des echten Stands (219): identisch | 79 (36 %) | 68 | 162 |
| gleicher Text, andere Nummer/Gliederungszeichen | 4 | 5 | 1 |
| Text abweichend | 121 | 76 | 20 |
| fehlt in der Vorschau | 15 | 70 | 36 |
| zusätzlich in der Vorschau | 3 | 4 | 2 |
| Wörter des echten Stands in gleicher Folge | 7070 von 8013 (88,2 %) | 5185 (64,7 %) | 7259 (90,6 %) |
| Laufzeit (Node) | 53 ms | – | – |

Einordnung der 148 Abweichungen von A (4 umnummeriert, 121 Text, 15 fehlend, 3 zusätzlich, 5 Titel), je Block einzeln in
`scripts/neg/eval-preview-notes.json` bzw. im Prüfbericht:
- **Redaktionelle Überarbeitung: 146.** Davon 98 maschinell belegt: der Wortlaut der Vorschau steht wörtlich im bereinigten Quelltext von ST 6331/24
  (Vorschau quellentreu) und der Parlamentsstandpunkt ST 9156/24 (nach der rechtlich-sprachlichen Überarbeitung, 24.4.2024) hat bereits den
  Wortlaut des ABl.; 48 von Hand am Wortdiff eingeordnet. Typen: Neunummerierung nach Streichungen (Art. 13 Abs. 7→5, Art. 21a Abs. 3a→4/5,
  Art. 23a Bst. c/d→a/b und Abs. 2a…4a→3…7, Art. 25a Abs. 6a→6, Art. 28 Abs. 5–7→4–6, Anhang XI Teil A i.–viii.→1.–8.), Platzhalter durch Daten
  bzw. Fundstellen ersetzt («[one year following the entry into force …]» → 11. Juli 2025; «Regulation xxx/xxx» → VO (EU) 2024/1348 und 2024/1347;
  «Crisis Regulation» → VO (EU) 2024/1359), Begriffe vereinheitlicht («border control» statt «border controls», «third-country», «travelling»),
  Satzbau und Satzzeichen, Aufteilung von Unterabsätzen und Punkten (Art. 26 Abs. 1 Bst. a: im Kompromisstext Ziff. i–iv im Fliesstext, im ABl. eigene
  Punkte; Gedankenstriche in Bst. b → Ziff. i, ii), Titel (Art. 21a, 23a, 27, 28, Anhang XI), Schreibfehler der Quelle («where» → «were», Anhang XII Nr. 4).
- **Lücke der Vorschau: 2** (+1 nicht aufgelöste Anweisung). Anhang XII Teil B: Formular im ABl. als Bild (Block `g1`), im Kompromisstext als Text
  (nicht vergleichbar). Nicht aufgelöst: «Chapter V is renamed as follows» (Kapitelüberschriften sind nicht Teil der Blöcke einer Einheit).
- **Zuordnungsfehler: 0 offen.** Während der Prüfung gefunden und behoben (je mit Ursache):
  1. pdf-text.js: Durchstreichungen über die ganze Satzspiegelbreite (418–432 pt bei 595 pt Seitenbreite; Grenze war 70 %) wurden nicht erkannt;
     ganz gestrichene Absätze (Art. 13 Abs. 5 und 6, S. 37) galten als geltender Wortlaut. Grenze jetzt 85 %.
  2. pdf-text.js: Formatierung der Seitenfussnoten ging verloren; gestrichene Fussnote 18 (Art. 13) galt als Wortlaut. Fussnotenzeilen werden jetzt wie der Rumpf auf Linien geprüft.
  3. preview.js: Fussnotentext am Seitenende trägt das schliessende Anführungszeichen des Zitats; dadurch endete der Wortlaut zu früh (Art. 5 Abs. 4
     Bst. c, Art. 13 Abs. 7 fehlten). Fussnoten schliessen das Zitat nicht mehr.
  4. preview.js: Absatz «4.» nach Buchstaben bzw. «3a» ohne Punkt (Quelle) wurde als Unterpunkt eingeordnet (Art. 21a, 25). In Artikeln mit
     Absatzzählung ist eine Ziffer mit Punkt immer ein Absatz.
  5. preview.js: Ganz gestrichener Absatz, dessen Gliederungszeichen ungestrichen blieb («a)», Art. 26 Abs. 2), ergab leere Blöcke; umgekehrt ging
     «2.» verloren, wenn nur der erste Unterabsatz gestrichen war (Anhang XII Nr. 2, S. 65). Jetzt: Zeichen gehört zum folgenden Absatz ohne Zeichen, sonst entfällt es.
  6. preview.js: Entfernen von gestrichenem Text verband Wörter («shallin», «thedata», «Commissionshall»); bei gestrichenem Wort mit Leerraum am Rand bleibt ein Leerzeichen.
- Sichtprüfung der Quelle (Seiten mit pdftoppm gerendert und angesehen): ST 6331/24 S. 33 (Art. 2 Nr. 12: «It shall also involve the carrying out of risk
  analyses» ungestrichen → Streichung im ABl. ist redaktionell), S. 37 (Art. 13 Abs. 5/6 ganz gestrichen), S. 47 (Art. 25 Abs. 3 «continues to persist»
  ungestrichen), S. 50 (Art. 26 Abs. 1 Bst. a mit Ziff. i–iv im Fliesstext), S. 65 (Anhang XII Nr. 2).
- B (Beispiel-Dossier) weicht von A nur dort ab, wo Absätze von ST 6331/24 im Beispiel nicht eindeutig einer Rasterzeile zugeordnet sind (64 Abweichungen
  «demo»; die übrigen 96 + 1 wie in A): Es fehlen u. a. die Anweisungszeilen zu Art. 2 Nr. 27a–30 und zu Art. 23a; die Vorschau wendet dann den
  folgenden Wortlaut nicht falsch an, sondern meldet ihn als nicht aufgelöst (4).

### 9.3 Beispiel 2024/0670(COD) am geltenden SGK (Stand s08)

| Spur (Zellen) | Anweisungen (davon andere Akte) | angewandt | nicht aufgelöst | Einheiten | Blockänderungen |
|---|---|---|---|---|---|
| Kommission (COM(2024) 670) | 22 (13) | 7 | 0 | Art. 2, 8, 8a, 8ba (neu) | 16 eingefügt |
| EP-Mandat (WK 3948/26) | 20 (12) | 6 | 0 | Art. 2, 8, 8ba | 12 eingefügt |
| Ratsmandat (ST 15634/25) | 29 (15) | 10 | 1 | Art. 2, 8, 8a, 8b, 8ba | 15 eingefügt, 1 ersetzt |
| Rat, jüngste Fassung (WK 3948/26) | 31 (15) | 11 | 2 | Art. 2, 8, 8a, 8b, 8ba | 14 eingefügt, 3 ersetzt, 3 gestrichen |

Nicht aufgelöst (beide Fälle in der Quelle uneindeutig, daher richtig nicht angewandt): «(3a) paragraph 7 is replaced …» nennt keinen Artikel
(Behälter fehlt); in WK 3948/26 trägt der Ratstext zu Art. 8 Abs. 3a die Nummer «3a» gestrichen und «1» eingefügt (in ST 15634/25: «3a») → «Block p1 besteht bereits».
Andere Akte: VO (EG) Nr. 2252/2004 (Art. 12) und VO (EU) 2018/1726 (Art. 14). Laufzeit 5–133 ms je Spur.

### 9.4 `rows[].amends`

Nur aus der Vorschau belegte Einträge (`source:"preview"`, Einheit und erster betroffener Block). Die bisherigen Näherungen aus der Fundstelle
(Parser) sind verworfen, weil sie in Stichproben falsch waren (z. B. «Chapter V is renamed» → Art. 13; Änderung der Rückführungsrichtlinie → Anhang XII;
Screening Art. 17 (EES) → VIS; Schlüssel «p27» statt «n27»). Ergebnis: SGK-Revision 219 Zeilen (12 Näherungen verworfen), DTC 40 (44 verworfen, davon
die Änderungen an VO 2252/2004 und 2018/1726 ohne Werk in der Bibliothek), Screening 12 (ees 2, etias 4, iop 6; Werke der Bibliothek im Stand zum
25.4.2023; 22 verworfen). Für Screening hängt die Zahl davon ab, welche Werke beim Bau in `data/works/` liegen (Agent BIBLIOTHEK arbeitet parallel).

### 9.5 Grenzen

- Nur Englisch und nur Anweisungen in der üblichen Form der Unionsgesetzgebung; Wortersetzungen («the words ‘x’ are replaced by ‘y’») nur bei
  wörtlichem Fund; «in accordance with the Annex to this Regulation» nicht aufgelöst.
- Kapitel-, Abschnitts- und Titelüberschriften (toc) werden nicht geändert. Neue Einheiten haben keinen toc-Eintrag.
- Absatzbildung der Quelle (PDF) begrenzt die Gliederung: Punkte im Fliesstext bleiben ein Block.

## 10 Delegationen, Sitzungen, Bilanz (Etappe 3, `src/neg/delegations.js`)

Geliefert: Schema-Ergänzungen (§ NEG_STATUS), Funktionen zum Anlegen/Ändern/Löschen, `stanceMatrix`, `suggestOutcome` (nur Vorschlag mit
Begründung DE/FR), `balance`, Varianten `balance` und `meeting` von `buildPositionDocx` (DE/FR), Begriffe in `i18n.js`, Validierung, verlustfreier
Export/Import (voll und Kurzform; Test), `by` in Verlaufseinträgen. Alte Projektdateien ohne die Felder bleiben gültig (Test mit den drei Beispielen ohne die Felder).
Voreinstellung der Delegationen: 25 EU-Schengen-Staaten (Ratskürzel, Griechenland «EL»), CH, IS, LI, NO, Kommission, EP, Vorsitz, Juristischer Dienst des Rates.
Zypern und Irland sind nicht enthalten (keine Schengen-Vollanwender), bei Bedarf ergänzen.

Dokumente angesehen (mit LibreOffice in PDF gewandelt, Seiten mit pdftoppm gerendert und angesehen): SGK-Beispiel Bilanz DE (A4 quer, S. 1–2) und
Sitzungsbericht FR (A4 hoch, S. 1); DTC-Beispiel Bilanz FR (S. 1) und Sitzungsbericht DE (S. 1). Inhalt: Kopf (Beispiel-/Einstufungsvermerk, Metadaten), Übersicht nach Ergebnis und Priorität, Tabelle der Anliegen mit
Vorschlag «Vorschlag (nicht bestätigt): …» kursiv und Begründung, Interventionen; Sitzungsbericht mit Sitzungsdaten, Interventionen der Schweiz,
Haltungen je Zeile. Französisch mit geschütztem Leerzeichen vor «:». Automatisiert: Test wandelt beide mit soffice in PDF und prüft den Text mit pdftotext.

## 11 Projektdateien zusammenführen (Etappe 3, `src/neg/dossier-merge.js`)

Tests `test/neg/dossier-merge.test.mjs` am Beispiel-Dossier Screening als Stammdatei (synthetische Folgefassung, keine Rohdaten nötig):
- Person A ändert eine bestehende Position, legt zwei neue an, importiert die Folgefassung (doc6), liest eine Rückmeldung ein (a3), entscheidet zwei
  Rückmeldungen, legt Sitzung m2 und eine Haltung an, löscht zwei Interventionen.
- Person B legt zwei neue Positionen an (eine auf derselben Zeile wie A, anderer Inhalt), importiert zuerst ein anderes Dokument (doc6 bei B!), dann
  dieselbe Folgefassung (doc7 bei B), liest eine andere Rückmeldung (a3 bei B) und dieselbe Datei wie A (a4 bei B) ein, entscheidet anders,
  legt eine andere Sitzung m2 an, ändert eine von A gelöschte Intervention, setzt ein Ergebnis.
Ergebnisse (mit Stammdatei als base): gleiche Folgefassung über sha256 abgebildet (B doc7 → doc6), anderes Dokument B doc6 → doc8; neue Zeile
«Recital 99z» einmal mit den Zellen beider Dokumente; Rückmeldung gleicher Datei abgebildet (B a4 → a3, Entscheid von B übernommen), andere
Rückmeldung B a3 → a5; Sitzung B m2 → m3 (Intervention zeigt auf m3); 5 Konflikte: Position (Haltung, Priorität, Text) auf derselben Zeile,
Entscheid a1-2, Intervention i2 (A gelöscht, B geändert: «delete-modify»); Löschung i3 (B unverändert) übernommen. Ohne base: 7 Konflikte (zusätzlich
Ergebnis und Text der von beiden geänderten Position; gelöschte Elemente bleiben erhalten). Eigenschaften geprüft: Idempotenz `merge(a,a)=a` (mit und ohne
base), Symmetrie (`merge(a,b)` und `merge(b,a)`: gleiche Konfliktpfade, Seiten vertauscht), kein Datenverlust (jedes Element beider Seiten im Ergebnis,
in einem Konflikt oder mit base gelöscht; alle Verlaufseinträge, Zellen, Haltungen, Interventionen, Sitzungen, Rückmeldungen von B abgebildet vorhanden),
`checkDossier` ohne Verstoss, `resolutions` («theirs», eigener Wert), erneutes Zusammenführen des Ergebnisses ohne Konflikt.
Grenzen: ohne base keine Erkennung von Löschungen; Elemente ohne Verlauf, die beide Seiten verschieden geändert haben, sind immer Konflikte;
gleiche Dokumente ohne sha256 nur über Nummer, Datum und Art abgebildet.
