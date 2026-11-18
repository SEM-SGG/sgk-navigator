# ActSwatch

Das Farbfeld kennzeichnet einen Rechtsakt überall gleich: Standleiste, Zeitstrahl, Inhaltsverzeichnis, Herkunft am Rand, Chronologie.

**Der Konsument liefert:** den Akt-Schlüssel als `data-act` (`base`, `frontex`, `sys`, `ees`, `etias`, `interop`, `vis`, `reform`, `derogation`, `proposal`) und ob der Akt noch nicht anwendbar ist (`ui-swatch--pending`).

- 10 × 10 px, eckig. In dichten Listen 7 px.
- Noch nicht anwendbar: schraffiert mit 1-px-Kontur in derselben Farbe.
- Die Aktfarben sind Grafikfarben (≥ 3:1 auf Weiss). Text daneben bleibt `ink` oder `ink-muted`.
- Neue Akte erhalten die nächste freie Farbe aus der Carbon-Datenvisualisierungs-Palette und einen Token `act-<schlüssel>`.
- Gleiche Farbe wie heute in den Exportkarten verwenden, damit PNG und PDF zur Oberfläche passen.

## Im Tool

Ersetzt die Farbdefinitionen der Akte (Legende `.act-legend`, `.mx-sw`, `.lg-dot`).
