# UiShell

Der Kopf jeder Ansicht in drei Ebenen: Utility-Leiste (Modul), Top-Navigation (Ansicht) und Werk-Tabs (Rechtsakt).

**Der Konsument liefert:** aktives Modul, Liste und aktive Ansicht, Zahl im Sammelkorb, Datenstand, Oberflächensprache und im Modul Rechtsakte die Werke.

## Aufbau

1. **Utility-Leiste** (`size-utility-bar`, `surface-1`, Schrift `label`): links der Modulwechsel Rechtsakte und Verhandlung mit Kurzbeschrieb, das aktive Modul auf `canvas` mit 2-px-Oberkante `primary`. Rechts Datenstand und Oberflächensprache DE/FR.
2. **Top-Navigation** (`size-top-nav`, `canvas`, Haarlinie unten): Wortmarke «**SGK** Navigator» in Plex Sans, die Ansichten als Links mit 2-px-Unterstrich `primary` für die aktive. Rechts Suche und Sammelkorb als 48-px-Werkzeuge mit Trennlinie.
3. **Werk-Tabs** (`Tabs`): nur im Modul Rechtsakte. Im Modul Verhandlung steht an ihrer Stelle die Dossier-Leiste (Titel, Verfahrensnummer, Tags, Speicherstatus, Werkzeuge).

- Der Kopf ist nicht fixiert, ausser die Top-Navigation in Lesen (sticky, damit die Standleiste darunter sichtbar bleibt).
- Kein Logo der Bundesverwaltung und kein IBM-Logo; die Wortmarke ist reiner Text.
- Unter 672 px: Ansichten in ein Menü, Utility-Leiste ausblenden, Modulwechsel ins Menü.

## Im Tool

Ersetzt `.modbar`, `.modbar-tab`, `.app-head`, `.brand`, `.head-tools`, `.btn-basket` und die Werkleiste. Die heutige dunkle Modulleiste mit rotem Akzent entfällt.
