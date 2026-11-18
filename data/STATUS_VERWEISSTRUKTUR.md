# STATUS – Verweisstruktur in der Übersicht (Variante C)

Stand: 18. November 2026. Build: `dist/sgk-navigator.html` (7,05 MB).

## 1 Dateien

Neu:

- `src/app/ui/refsstructure-model.js`: reines Datenmodell `structureModel(data, lang, stageId, { ui, lib })` ohne DOM, dazu `levelOf` (Deckkraftstufe), `strongest` (stärkste Verbindungen), `unitNumLabel`.
- `src/app/ui/refsstructure.js`: Abschnitt `RefsStructure` (Kopf, Bogendiagramm, Leiste der Auswahl, Legende, Tabelle, PNG-Export), verzögerte Berechnung.
- `test/app/refsstructure.test.mjs`: 5 Unit-Tests mit echten Datensätzen.
- `test/app/refsstructure.spec.mjs`: 5 Playwright-Tests.

Geändert:

- `src/app/modules/sgk/overview.js`: Abschnitt nach «Zeitstrahl der Akte», vor «Abweichende Anwendung» und Matrix (eine Zeile und ein Import).
- `src/app/ui/refsgraph.js`: `libFor` und `InlineSvgStyles` werden exportiert (unverändert im Verhalten).
- `src/app/ui/common.js`: `LegalLangSwitch` mit optionaler Prop `id` (Standard wie bisher `lbl-legal`), damit zwei Umschalter auf derselben Seite keine doppelte ID erzeugen. Zugänglicher Name der Sprachknöpfe jetzt «DE, Deutsch» statt «Deutsch» (axe-Regel label-content-name-mismatch; betrifft alle Ansichten mit dem Umschalter, sichtbar unverändert).
- `src/app/styles.css`: Block «Verweisstruktur» (`.rs-*`).
- `src/app/i18n/de.js`, `fr.js`: `ov.rs.*`. `de-ra.js`, `fr-ra.js`: `guide.task.uebersicht.after` (zwei Sätze zu Verweisstruktur, Tabelle und Export).
- `package.json`: `test:app:unit` und `test:app` führen auch `test/app/refsstructure.test.mjs` aus.

Nicht verändert: `src/core/*`, `data/*` (ausser diesem Bericht), Datensätze, bestehende Abschnitte der Übersicht, Netz in der Schublade, Exporte, Verhandlungsmodul.

## 2 Entscheide

- **Achse:** Artikel und Anhänge des jüngsten Stands (`data.latest`) in der Reihenfolge von `data.unitOrder`, ohne Erwägungsgründe, ohne im Stand aufgehobene oder noch nicht eingefügte Einheiten (SGK s08: 70, EES 82, ETIAS 101, VIS 70, IO 80). Spaltenbeschriftung in der Zitierweise der Oberfläche («8a», FR «8 bis»; Anhänge römisch). Der VIS-Anhang ohne Nummer (Kennung `anx`) heisst «Anh.» bzw. «ann.».
- **Gruppen:** oberste Gliederungsebene aus der TOC (SGK Titel I–IV, übrige Werke Kapitel), Anhänge als eigene Gruppe. Kurzbeschriftung «Titel II»; passt sie nicht ins Band, nur die Nummer («II»), sonst keine. Voller Titel in der Sprache des Rechtstexts als SVG-`<title>` (Maus).
- **Bögen:** ein Halbbogen je Paar verknüpfter Einheiten (elliptisch). Höhe wächst mit dem Abstand, aber mit der Wurzel und gedeckelt (162 px), höchstens Halbkreis. Mit der Obergrenze allein lagen alle langen Bögen als dickes Band oben. Strichstärke 0.6 + √n · 0.7. Ruhezustand `border-strong` mit Deckkraft 0,55. Bei Auswahl werden die Bögen der gewählten Einheit nach Richtung getrennt: ausgehend `ink` durchgezogen, eingehend `ink` gestrichelt. Gibt es beide Richtungen (Art. 8 ↔ Art. 6), liegt der eingehende Bogen bei 80 % Höhe darunter. Alle übrigen Bögen sind abgeschwächt (0,16). Ein Bogen unter Maus oder Tastatur erscheint in `primary`.
- **Zellen** zeigen die ausgehenden Fundstellen der Einheit je weiterem Werk bzw. Fremdakte. Deckkraft in vier Stufen (0,22 · 0,45 · 0,7 · 1) als Attribut `fill-opacity`, damit die Exportkarte sie übernimmt. Die Stufe steht im Tooltip («Deckkraftstufe 4 von 4 (8 und mehr Fundstellen)»), die Zahl je Werk im `aria-label` der Spalte. Eingehende Verweise aus den weiteren Werken erscheinen nicht als Zelle, sondern in den Kennzahlen der Leiste und in der Tabelle («Verweise hierauf»), wie bei egoGraph.
- **Zählregeln** wie egoGraph. Selbstverweise und unsichere Verweise sind keine Kanten. Verweise von oder auf Einheiten ausserhalb der Achse (Erwägungsgründe; im VIS-Datensatz fehlende Artikel wie 7a–7h) sind keine Bögen, werden aber gezählt. Eine Hinweiszeile unter der Legende nennt die Summen (SGK: 164 innerhalb derselben Einheit, 3 unsicher, 3 ausserhalb der Achse). In der Leiste stehen die Werte der gewählten Einheit (Art. 8: 21 innerhalb).
- **Bedienung:** Die Spalten sind eine `listbox` (horizontal) mit `option`-Elementen, `aria-selected` und Roving-Tabindex. Bedienung mit Pfeil links/rechts, Pos1/Ende; Enter oder Leertaste wählt bzw. hebt die Auswahl auf. Pfeil auf/ab geht die Verbindungen der fokussierten Einheit durch (Bögen nach Stärke, dann Zellen) und zeigt jeweils den Tooltip. Esc schliesst erst den Tooltip, dann die Auswahl. Rollen `button` wurden bewusst nicht verwendet, weil 14 px breite Spalten die Mindestgrösse für Schaltflächen (Test «Schaltflächen erkennbar») nicht erfüllen. Ein Klick auf eine Spalte, einen Bogen oder eine Zelle wählt die Spalte unter dem Zeiger. Die Auswahl ist lokaler Zustand ohne Routenänderung. Bei Tastaturfokus zeigt ein Tooltip die Kennzahlen der Spalte (`aria-describedby`), bei Mausklick nicht.
- **Breite:** Spaltenbreite = (verfügbare Breite − 224 px − Rand) / Zahl der Einheiten, 14 bis 32 px. Reicht das nicht (ETIAS bei 1440 px, SGK bei 1100 px), scrollt der Diagrammbereich horizontal in `div.rs-scroll` (`role="region"`, `tabindex="0"`, `aria-label`). Die linke Beschriftungsspalte (HTML) bleibt dank `position: sticky` stehen. Fokus auf eine verdeckte Spalte scrollt sie rechts neben die Beschriftungsspalte. Spaltenbeschriftungen werden um 90° gedreht, sobald eine Beschriftung breiter als die Spalte ist (praktisch immer).
- **Verzögerte Berechnung:** Bis das Modell vorliegt, steht ein Platzhalter mit derselben Höhe da (aus Spaltenbeschriftungen und Breite berechnet, ohne Modell; Hinweiszeile und Legende werden schon gezeichnet). Gemessen: kein Layoutsprung, die Lage von «Änderungsmatrix» bleibt in SGK, EES, ETIAS, VIS, IO, DE und FR, bei 1100 bis 1920 px auf den Pixel gleich. Der Auslöser ist ein IntersectionObserver mit `root` = Scrollbehälter `.view` und `rootMargin` 600 px; ohne IntersectionObserver nach 300 ms. Die Berechnung läuft in Schritten über `requestIdleCallback` (Ersatz `setTimeout`): eigener Verweisindex, je weiteres Werk Entpacken und Verweisindex, dann das Modell. Das Ergebnis liegt in `data.memo` (Schlüssel Sprache, Stand, Oberfläche, Bibliotheksversion). Messwerte als `performance.measure('sgk:rs:<werk>')` mit `detail { busy, longest }`.
- **Tabelle** `tbl-data` in einer fokussierbaren Scroll-Region. Spalten: Einheit (Link zur Chronologie und Titel in der Sprache des Rechtstexts), «verweist auf (Einheiten im Rechtsakt)», «Verweise hierauf» (inklusive weiterer Werke, wie egoGraph), je Bibliothekswerk, Fremdakte. Standard: nur Einheiten mit mindestens einer Fundstelle (ein- oder ausgehend); «alle Einheiten zeigen» zeigt alle. Die Wahl «Diagramm | Tabelle» steht in `settingsStore.rsView`.
- **Leiste:** «Text lesen» (primary), «Chronologie öffnen» (Sekundär) und «Verweisnetz zeigen» (Tertiär). Die letzte öffnet den bestehenden `RefsGraphDialog` für die ganze Einheit (Umfang `unit`). Der Fokus kehrt nach Esc auf die Schaltfläche zurück.
- **PNG-Export** über `exportCustom`. Die Exportkarte enthält Titel («Verweisstruktur SGK · Art. 8»), Stand, Sprache, das Diagramm (statisch, Spalten 14 bis 24 px), die Kennzahlen der Auswahl, Legende, Hinweis und Quellenzeile. Dateiname: `Verweisstruktur_SGK_Art-8_s08_DE.png`.
- **Farben:** Die Aktfarben der Zeilen kommen aus `workColor` als CSS-Variablen, Fremdakte in `ink-subtle`. Im JS stehen keine Hex-Werte, Aktfarben werden nie als Textfarbe verwendet. Bewegung nur über CSS-Übergänge, `prefers-reduced-motion` schaltet sie global aus.

## 3 Gegenprobe (SGK, Stand s08, DE, Art. 8)

| | Vorgabe | structureModel |
|---|---|---|
| eingehend aus dem SGK | 14 Einheiten / 62 Fundstellen (Art. 8b 17, Anh. VI 14, Art. 8d 9, Anh. VII 9) | 14 / 62, dieselben vier |
| eingehend mit Bibliothek (Kennzahl wie egoGraph) | – | 16 / 64 (+ Art. 11 EES-VO, Art. 80 ETIAS-VO) |
| ausgehend | 22 Ziele / 41 Fundstellen | 22 / 41 |
| SGK (Bögen) | 4 Einheiten | Art. 6a 5, Art. 6 3, Art. 5 2, Anhang II 1 |
| EES-VO | 11 Fundstellen in Art. 23, 13, 27 | 11 (Art. 23, 13, 27) |
| ETIAS / VIS / IO / Fremdakte | 4 / 4 / 5 / 6 | 4 / 4 / 5 / 6 |
| Bögen an Art. 8 | – | 17 Paare: 4 ausgehend, 14 eingehend (Art. 6 in beide Richtungen), also 18 hervorgehobene Bögen |

Gleichheit mit `egoGraph(…, unit, null)` für jede Einheit: eingehend Einheiten/Fundstellen (gesamt und eigenes Werk), ausgehend Ziele/Fundstellen, Selbstverweise, unsichere Verweise, Zellen je Werk (Summe und Zahl der Ziele), Bögen ausgehend. Geprüft im Unit-Test für SGK (mit Erwägungsgründen wie in der App, 70 Einheiten), EES-VO (82), VIS-VO (70), dazu Art. 8 in FR. In einem Durchlauf ausserhalb der Suite stimmten zusätzlich ETIAS und IO über alle Einheiten (0 Abweichungen).

Summen je Werk (jüngster Stand, DE): SGK 221 Paare / 413 Fundstellen im Werk; EES 277 / 481; ETIAS 351 / 704; VIS 205 / 308; IO 211 / 335.

## 4 Messwerte Ladezeit (Chrome headless, 1440 × 900, file://, je 5 Läufe, Median)

| | ohne Abschnitt (Vergleichsbuild) | mit Abschnitt |
|---|---|---|
| SGK: bis `__sgk.ready` / First Contentful Paint | 411 / 304 ms | 384 / 268 ms |
| VIS-VO: bis `__sgk.ready` / FCP | 389 / 272 ms | 380 / 252 ms |

Kein messbarer Unterschied (die Streuung ist grösser als die Differenz). Beim Start steht der Platzhalter.

Verzögerte Berechnung (`performance.measure`, Kaltstart, zwei Läufe):

| | Wandzeit gesamt | davon Rechenzeit | längster Einzelschritt |
|---|---|---|---|
| SGK | 229–244 ms | 147–163 ms | 37–39 ms |
| VIS-VO | 230–247 ms | 173–184 ms | 46 ms |

Die Rechenzeit enthält das Entpacken der weiteren Werke und ihre Verweisindizes, die später auch das Netz in der Schublade nutzt. Erneutes Zeichnen aus dem Zwischenspeicher (Werk verlassen und zurück): 32–36 ms bis zum Diagramm.

## 5 Tests (vorher / nachher)

| Suite | vorher | nachher |
|---|---|---|
| `node --test test/core/*.test.mjs` | 43 bestanden / 7 fehlgeschlagen / 8 übersprungen | unverändert 43 / 7 / 8 (Ordner `raw/` fehlt) |
| `npm run test:app:unit` | 20 / 20 | 25 / 25 (+5 structureModel) |
| `npm run test:neg` | 41 bestanden / 9 übersprungen | unverändert |
| Playwright, alle Specs | 86 bestanden / 6 fehlgeschlagen | 91 bestanden (+5 neu) / dieselben 6 fehlgeschlagen |

Die 6 Fehlschläge gab es schon vorher: app 7b (SPARQL ohne Netz), app 7c ×2 (`raw/`), e3 A-Upload EES, neg PDF-Import (`raw-neg/`), neg Screenshots.

Die Playwright-Tests prüfen:

- Reihenfolge der Abschnitte; Platzhalter gleich hoch wie das Diagramm; 70 Spalten, Gruppen, Zeilen.
- Klick auf Art. 8: 4 ausgehende, 14 eingehende und 204 abgeschwächte Bögen; Leiste mit Kennzahlen und den drei stärksten Verbindungen.
- Tooltip auf einer Zelle («Art. 8 → EES-VO: 11 Fundstellen in Art. 23, 13, 27») und auf einem Bogen («Art. 8b → Art. 8 · 17 Fundstellen»); erneuter Klick hebt die Auswahl auf.
- Tastatur: Pos1, Ende, Pfeile, Roving-Tabindex, `aria-describedby`, Enter, Leertaste, Pfeil runter, Esc; sichtbarer Fokus.
- «Text lesen»; «Verweisnetz zeigen» mit Dialog (16 / 64, 22 / 41), Esc und Fokus zurück; «Chronologie öffnen».
- Tabelle mit den Werten von Art. 8 (11 · 64 · 11 · 4 · 4 · 5 · 6); «alle Einheiten zeigen» (70 Zeilen); gespeichert nach Reload; Link zur Chronologie.
- PNG-Export (Dateiname, Grösse); EES-VO Art. 23 (15 / 46, 7 / 19); FR-Oberfläche.
- 1100 px: kein Seitenüberlauf, Scroll-Region, keine Überlappung der Beschriftungen, Beschriftungsspalte bleibt stehen, fokussierte Spalte wird sichtbar.
- axe ohne Befund für den Abschnitt (SGK mit Auswahl, Tabelle, EES, FR); keine Konsolenfehler, keine Netzanfragen.

## 6 Screenshots

Ausgabeordner `shots-c/` (nicht im Repo):

- `a-uebersicht-sgk-1440.png`
- `b-art8-gewaehlt.png`
- `c-tooltip-bogen.png`
- `c2-tastatur-fokus.png`
- `c3-tastatur-verbindung.png`
- `d-tabelle.png`
- `e-ees-art23.png`
- `f-vis.png`
- `f2-etias-101-einheiten.png`
- `g-1100.png`
- `g2-1100-gescrollt.png`
- `h-fr.png`
- `i-export.png` (exportiertes PNG)

## 7 Offene Punkte und Grenzen

- Bögen sind nicht einzeln fokussierbar. Mit der Tastatur erreicht man sie über die Spalte (Pfeil auf/ab). Auch abgeschwächte Bögen reagieren auf die Maus.
- Der volle Titel einer Gliederungsgruppe steht nur im SVG-`<title>` (Maus). Schmale Gruppen (z. B. ETIAS Kapitel IX mit einer Einheit) haben keine Beschriftung.
- Bei 14 px Spaltenbreite berühren sich die Schriftboxen der gedrehten Beschriftungen fast (Abstand der Grundlinien 14 px bei 12 px Schrift). Sichtbar überlappen sie nicht.
- Die Zeile «SGK» in den weiteren Werken (`act-base`, Grau) und die Zeile «Fremdakte» (`ink-subtle`, Grau) sind farblich ähnlich; unterschieden werden sie durch Beschriftung und Reihenfolge.
- Der Abschnitt zeigt nur den jüngsten Stand. Ein Stand-Wähler ist nicht vorgesehen.
- In der Tabellenansicht hat der Platzhalter eine feste Höhe (360 px). Dort kann sich das Layout beim Ersetzen verschieben, im Diagramm nicht.
- Die Änderung am Namen der Sprachknöpfe («DE, Deutsch») gilt für alle Ansichten mit `LegalLangSwitch`.
