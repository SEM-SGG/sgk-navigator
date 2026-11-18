# Dialog

Dialoge und Menüs sind die einzigen schwebenden Ebenen und die einzigen Elemente mit Schatten.

**Der Konsument liefert:** Titel, Inhalt, die Aktionen (eine Primäre, eine Sekundäre «Abbrechen») und die Schliessen-Aktion; für Menüs die Einträge mit optionalem Hinweis rechts.

- Dialog: `canvas`, `shadow-overlay`, eckig, Titel in `subhead`. Die Fusszeile besteht aus zwei vollbreiten 64-px-Schaltflächen ohne Abstand (Carbon-Modal), Primär rechts.
- Hintergrund `overlay`. Fokus springt in den Dialog und bleibt dort; Escape schliesst.
- Menü: `radius-sm`, Einträge 40 px hoch, Trenner `hairline`, Hinweise wie «2-fach» in `caption`/`ink-subtle`.
- Gefährliche Bestätigung: Primäre wird `ui-btn--danger`.

## Im Tool

Ersetzt `.modal`, `.modal-scrim`, `.modal-body`, `.menu`, `.menu-pop`, `.menu-item`, `.export-menu`, `.drawer`.
