# KpiTile

Kennzahlen fassen den Datensatz oder ein Dossier in vier Zahlen zusammen.

**Der Konsument liefert:** Zahl, Beschriftung und eine erklärende Unterzeile je Kachel.

- Vier Kacheln in einem Raster mit gemeinsamem Haarlinienrahmen und Trennlinien, kein Schatten.
- Zahl in `display-md` (42 px, Gewicht 300), Beschriftung in `body`, Unterzeile in `body-sm`/`ink-muted`.
- Ist eine Kachel klickbar (Filter setzen), wird sie zur Schaltfläche mit Hover `canvas-hover`.
- Unter 1056 px zwei pro Zeile, unter 672 px eine.

## Im Tool

Ersetzt `.facts` in der Übersicht und `.nkpi`, `.ndl-kpi` in der Verhandlung.
