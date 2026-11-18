# STATUS – Verweisnetz als Grafik (Ego-Netz, Variante A)

Stand: 16. November 2026. Build: `dist/sgk-navigator.html` (7,01 MB).

## 1 Dateien

Neu:

- `src/app/ui/refsgraph-model.js`: reines Datenmodell `egoGraph()` ohne DOM und ohne Oberflächentexte; dazu `excerpt`, `inScope`, `centerLabel`, `shortActLabel`, `WORK_COLOR`.
- `src/app/ui/refsgraph.js`: `RefsGraph` (SVG), `RefsSection` (Bereich «Verweise» mit Umschaltern), `RefsGraphDialog` (vergrösserte Ansicht), PNG-Export.
- `test/app/refsgraph.test.mjs`: 9 Unit-Tests mit echten Datensätzen und echter Datenschicht (`src/app/data.js`, im Test mit esbuild gebündelt).
- `test/app/refsgraph.spec.mjs`: 4 Playwright-Tests.

Geändert:

- `src/app/modules/sgk/read.js` (ChronPanel): Segment «Änderungen | Wortlaut | Verweise» bzw. «Chronologie | Verweise»; statt `RefsPanel` jetzt `RefsSection`.
- `src/app/ui/refs.js`: `RefsPanel` mit den optionalen Props `head` und `alt`; ohne sie ist die Ausgabe gleich wie vorher. `hashFor` wird exportiert. `excerpt` und `inScope` kommen jetzt aus `refsgraph-model.js` (gleicher Code).
- `src/app/ui/common.js`: neu `Modal` (aus `neg/ui.js` übernommen, ergänzt um `sub`, `className`, `closeLabel`, `lockScroll`) und `Portal`.
- `src/app/modules/neg/ui.js`: `Modal` ist jetzt eine Hülle um das gemeinsame Modal, mit dem bisherigen Schliessen-Text. Gleiche Klassen und gleiches Markup (ohne `sub`), gleiche Fokusführung. Einziger Unterschied: Die Fokusfalle berücksichtigt zusätzlich sichtbare SVG-Elemente. Im Verhandlungsmodul kommen solche Elemente nicht vor.
- `src/app/styles.css`: Block «Verweisnetz» (`.rg-*`, `.refs-tools`, `.modal-graph`, `.modal-sub`).
- `src/app/i18n/de.js`, `fr.js`: `common.close`. `de-ra.js`, `fr-ra.js`: `refs.graph.*` sowie ein zusätzlicher Schritt in der Anleitung «Verweisen folgen».
- `package.json`: `test:app:unit` und `test:app` führen auch `test/app/refsgraph.test.mjs` aus.

Nicht verändert: `src/core/*`, `data/*` (ausser diesem Bericht), Datensätze, Exporte, Links im Text, AffectedNote, Verhandlungsmodul (ausser der Modal-Hülle).

## 2 Entscheide

- **Umfangsschalter nur für das Netz.** Die Liste bleibt genau wie bisher. Sie ist die Textalternative mit Auszügen zur gewählten Bestimmung, und für «ganzer Artikel» hätte man die ausgehende Liste neu aufbauen müssen. Das Netz ist selbst zugänglich: Jeder Knoten ist ein Link mit vollständigem `aria-label`, und das SVG hat eine Zusammenfassung. Der Umfangsschalter erscheint nur im Modus «Netz» und nur, wenn eine Bestimmung gewählt ist. Er ist lokal und steht beim Öffnen der Schublade auf «Bestimmung». Der Dialog übernimmt den Wert und schreibt Änderungen zurück.
- **Liste | Netz** wird in `settingsStore.refsView` gespeichert (Standard «Liste»). Die Wahl «Verweise» im Segment der Schublade ist lokaler Zustand (Standard wie bisher).
- **Eingehende Verweise aus den weiteren Werken der Bibliothek** werden mitgezählt. Sie werden als Quadrat in der Aktfarbe des Quellwerks dargestellt und tragen das Werkkürzel im Label («Art. 8 SGK»). Dafür wird der Verweisindex der weiteren Werke im Stand passend zum Datum gebaut (wie bei `followRef`), aber nur, wenn das Netz angezeigt wird. Das kostet beim ersten Mal etwa 150 bis 250 ms, danach ist es zwischengespeichert. Grund: Die Vorgabe verlangt «EES-VO Art. 23 eingehend aus SGK». Folge: Beim SGK Art. 8 zeigt der Zähler 16 Einheiten und 64 Fundstellen statt 14 und 62 (siehe §3).
- **Zählregel «Fundstelle»:** Jeder erkannte Verweis im Text zählt einmal. Dieselbe Fundstelle zweimal im selben Block zählt zweimal (z. B. Art. 8b Abs. 7). Die Liste fasst dagegen wie bisher nach Block und Text zusammen (Art. 8b dort 12 statt 17 Einträge).
- **Verweise innerhalb derselben Einheit** sind keine Kanten, auch beim Umfang «Bestimmung» nicht (also auch nicht von einem anderen Absatz desselben Artikels). Sie werden gezählt und als Hinweis gezeigt («21 Verweise innerhalb von Art. 8 nicht dargestellt»). **Unsichere Verweise** sind keine Kanten. Sie lassen sich nur ausgehend zuordnen und erscheinen als Hinweis.
- **Kürzen in der Schublade:** links höchstens 7 Zeilen, wobei die 7. Zeile «n weitere» ist; rechts je Werk höchstens 4 Zeilen, wobei die 4. Zeile «n weitere» ist. «n weitere» öffnet den Dialog. Im Dialog wird nichts gekürzt.
- **Anordnung:** In der Schublade stehen die Spalten oben bündig und der Mittelknoten auf Höhe der linken Spalte, damit das Wesentliche ohne Scrollen sichtbar ist. Im Dialog ist alles vertikal zentriert.
- **Fremdakte:** Das Kurzlabel nimmt die Aktart aus der CELEX (VO, RL, Beschluss bzw. règl., dir., décision) und die Nummer aus der Fundstelle; die Endung EG/CE wird in die Oberflächensprache übertragen. Im Tooltip stehen die volle Bezeichnung in der Sprache des Rechtstexts und die CELEX. AEUV und Charta haben keine CELEX: Ihre Knoten sind fokussierbar (Tooltip), aber nicht verlinkt.
- **Farben:** Die Zuordnung Werk zu Aktfarbe gab es in `library.js` nicht. Sie steht jetzt als `WORK_COLOR` im Modell (`sgk→act-base`, `ees→act-ees`, `etias→act-etias`, `vis→act-vis`, `iop→act-interop`). Im JS stehen nur Token-Namen, die Werte kommen über CSS-Variablen. Aktfarben werden nie als Textfarbe verwendet. Der Gruppenkopf des eigenen Werks ist ein Kreis in act-base.
- **PNG-Export im Dialog** verwendet die vorhandene Funktion `exportCustom` (Exportkarte mit Wortmarke, Titel, Netz, Legende und Quellenzeile, Breite 1136 px). html-to-image übernimmt Klassenstile in SVG nicht. Deshalb schreibt die Karte vor der Aufnahme die berechneten Stile als SVG-Attribute fest (`InlineSvgStyles`, ohne Hex-Werte im JS).
- **Dialog:** gemeinsames `Modal` in einem `Portal` am Ende von `body`, damit er über der fixierten Schublade liegt (eigener Stapelkontext). Esc wird in der Capture-Phase abgefangen, damit die Schublade es nicht zusätzlich erhält. Die Seite dahinter ist gesperrt (`overflow: hidden`). Hash und Route bleiben unverändert. Klick auf einen Knoten schliesst zuerst den Dialog und navigiert dann.

## 3 Gegenprobe (SGK, Stand s08, DE, ganzer Art. 8)

| | Vorgabe | Ergebnis |
|---|---|---|
| eingehend aus dem SGK | 14 Einheiten / 62 Fundstellen | **14 / 62** (Art. 8b 17, Anhang VI 14, Art. 8d 9, Anhang VII 9, Art. 6 2, Art. 9 2, Art. 42a 2, Art. 10, 15, 16, 17, 18, 19, 20 je 1) |
| eingehend aus der Bibliothek | – | + Art. 11 EES-VO (1), Art. 80 ETIAS-VO (1); Zähler in der Oberfläche **16 / 64** |
| ausgehend | 22 Ziele | **22 Ziele / 41 Fundstellen** |
| SGK | Art. 6a, 6, 5, Anh. II | Art. 6a 5, Art. 6 3, Art. 5 2, Anhang II 1 |
| EES-VO | Art. 23 (8), 13, 27 | Art. 23 8, Art. 13 2, Art. 27 1 |
| ETIAS-VO | Art. 47, 48 | Art. 47 3, Art. 48 1 |
| VIS-VO | Art. 18, 20, 22g (fehlt) | Art. 18 2, Art. 20 1, Art. 22g 1 (`missing`) |
| IO-VO | Art. 6, 17, 25, 69, 72 | je 1 |
| Fremdakte | RL 2004/82/EG (2), VO 2252/2004, VO 539/2001, VO 2016/1624, RL 2004/38/EG | RL 2004/82/EG 2, VO 2252/2004, VO 2016/1624, VO 539/2001, RL 2004/38/EG je 1 |

Abweichungen: (1) die eingehenden Verweise aus der Bibliothek (Entscheid oben); (2) Fremdakte mit gleicher Zahl erscheinen in der Reihenfolge der ersten Fundstelle im Text, deshalb steht VO 2016/1624 (Abs. 2a) vor VO 539/2001 (Abs. 3 Bst. h).

Weitere Werte: Art. 8 Abs. 3 Bst. a (Umfang Bestimmung): eingehend 5 Einheiten / 13 Fundstellen, ausgehend 3 Ziele / 6 Fundstellen. EES-VO Art. 23: eingehend 15 / 46 (davon 8 / 21 aus der EES-VO, Art. 8 SGK 8, Art. 8a SGK 3, Art. 6 SGK 2, dazu VIS-VO und IO-VO), ausgehend 7 / 19, 1 unsicherer Verweis.

## 4 Tests (vorher / nachher)

| Suite | vorher | nachher |
|---|---|---|
| `node --test test/core/*.test.mjs` | 58 Tests: 43 bestanden, 7 fehlgeschlagen, 8 übersprungen | unverändert 43 / 7 / 8 (die 7 Fehlschläge kommen vom fehlenden Ordner `raw/`) |
| `npm run test:app:unit` | 11 / 11 | 20 / 20 (+9 egoGraph) |
| `npm run test:neg` | 50 Tests: 41 bestanden, 9 übersprungen, 0 fehlgeschlagen | unverändert |
| Playwright, alle Specs | 82 bestanden, 6 fehlgeschlagen | 86 bestanden (+4 neu), dieselben 6 fehlgeschlagen |

Die 6 Playwright-Fehlschläge gab es schon vorher, keiner davon ist neu: Es fehlen `raw/` und `raw-neg/`, und der echte SPARQL-Endpunkt ist ohne Netz nicht erreichbar (app 7b, 7c ×2, e3 A-Upload EES, neg PDF-Import, neg Screenshots). Nach der letzten Änderung am Layout (Spalten in der Schublade oben bündig) liefen `e3`, `ui` und `refsgraph` erneut: 33 bestanden, 1 fehlgeschlagen (derselbe Upload-Test wie vorher).

Die Playwright-Tests prüfen unter anderem: Standard «Liste» und Chronologie wie bisher; das Segment «Verweise»; das Netz; die Zähler; Tooltip bei Fokus (`aria-describedby`, hervorgehobene Kante); Fremdakt mit `target=_blank`; Klick auf Art. 8b navigiert zu Art. 8b; im Dialog Fokus, `aria-labelledby`, unveränderter Hash, Scroll-Sperre, 16 + 22 Knoten ohne Zusammenfassung, Fokusfalle über 45 Tab-Schritte, axe ohne Befund, Esc schliesst nur den Dialog, Fokus zurück auf «Vergrössern», Schliessen-Schaltfläche, Knoten-Klick im Dialog; Breite 1100 px mit fixierter Schublade, kein horizontaler Überlauf, «n weitere» öffnet den Dialog; EES-VO Art. 23 nach Art. 8 SGK; ETIAS, VIS, IO; FR-Oberfläche; keine Konsolenfehler, keine Netzanfragen. Eine axe-Prüfung der Schublade mit Netz ergab ebenfalls keinen Befund (Skript, nicht in der Suite).

## 5 Screenshots

Ausgabeordner `shots/` (nicht im Repo): `a-schublade-netz-1440.png`, `b-tooltip.png`, `c-dialog.png`, `c2-dialog-hover.png`, `d-schublade-fixiert-1100.png`, `e-fr-netz.png`, `f-ees-art23.png`, `f2-ees-art23-dialog.png`, `g-export-png-art8-abs3-bsta.png` (exportiertes PNG).

## 6 Offene Punkte und Grenzen

- In der 392 px schmalen Schublade werden lange Labels gekürzt (FR z. B. «art. 8 quinqui…», lange Fremdaktnamen), der volle Text steht im Tooltip und im `aria-label`. Ein gekürztes Label stimmt dann nicht mehr wörtlich mit dem zugänglichen Namen überein (axe-Regel label-content-name-mismatch). Im Dialog kommt das praktisch nicht vor.
- Der Tooltip in der Schublade deckt den Mittelknoten zeitweise ab (er ist bis 320 px breit).
- Kanten sind nur mit der Maus hervorhebbar. Mit der Tastatur werden die Knoten fokussiert, was ihre Kante ebenfalls hervorhebt.
- Eingehende Verweise aus anderen Werken bauen beim ersten Anzeigen des Netzes deren Verweisindex auf (etwa 150 bis 250 ms je Sprache und Stand).
- Die Textmessung für Ellipsen nutzt Canvas mit IBM Plex Sans. Sind die Schriften beim ersten Zeichnen noch nicht geladen, kann eine Kürzung leicht abweichen. Beim nächsten Rendern wird sie korrigiert.
- Die Zählweise der Liste (zusammengefasst nach Block und Text) unterscheidet sich von der des Netzes (jede Fundstelle). Das ist beabsichtigt, weil die Liste unverändert bleiben sollte.
