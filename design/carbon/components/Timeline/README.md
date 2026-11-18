# Timeline

Der Zeitstrahl zeigt alle Akte eines Werks mit Annahme, Anwendbarkeit und heutigem Datum.

**Der Konsument liefert:** je Akt Schlüssel, Kurzname, Nummer, Art, Status-Tag, Datum der Annahme oder Vorlage, Beginn der Anwendbarkeit oder Ende (zurückgezogen) und das heutige Datum; dazu den Zeitraum der Achse.

- Raster: Spalten Akt (230 px), Anwendbarkeit (250 px), Achse (Rest). Zeilenhöhe 52 px, Haarlinien zwischen den Zeilen.
- Kreis = Annahme oder Vorlage. Gestrichelt = angenommen, noch nicht anwendbar mit bekanntem Datum. Voller 6-px-Balken = anwendbar. Schraffiert = beschlossen, Datum offen. Punktiert = Vorschlag.
- Heute: senkrechte gestrichelte Linie `primary` mit Beschriftung «heute».
- Jahreszahlen in `caption` und `ink-subtle`; jedes zweite Jahr genügt unter 1100 px.
- Eine Zeile ist ein Link: Klick zeigt die vom Akt geänderten Einheiten im Text.
- Berichtigungen und Abweichungen (`act-derogation`) sind zuschaltbar.

## Im Tool

Ersetzt `.lg-bar`, `.lg-dash`, `.lg-derog`, `.lg-today`, `.legend-line` in der Übersicht.
