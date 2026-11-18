# CompareTable

Die Vergleichstabelle stellt zwei Stände oder zwei Sprachfassungen Bestimmung für Bestimmung nebeneinander.

**Der Konsument liefert:** die Spaltenköpfe (Stand oder Sprache mit Farbfeld), je Zeile Zitierung, Änderungsart und die beiden Texte mit Diff-Auszeichnung; leere Seiten mit einem erklärenden Satz.

- Raster `--cols: 180px 1fr 1fr`. Kopf auf `surface-1` mit Unterkante `hairline-strong`, Zellen durch Haarlinien getrennt, Polster 16 px.
- Rechtstext in `legal-compact`. Zitierung in `body-emphasis` mit Tag darunter.
- Über der Tabelle: Zähler «2 geändert · 2 eingefügt · 0 gestrichen» als Tags und, falls nötig, die Warnung zum rekonstruierten Stand.
- Redline-Darstellung: eine Textspalte, Diff im Fliesstext.
- Unter 1056 px scrollt die Tabelle horizontal in ihrem Rahmen.

## Im Tool

Ersetzt `.cmp`, `.cmp-row`, `.cmp-headrow`, `.cmp-c`, `.cmp-k`, `.cmp-label`.
