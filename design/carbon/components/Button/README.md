# Button

Schaltflächen lösen eine Aktion aus; es gibt fünf Varianten mit fester Rangfolge.

**Der Konsument liefert:** Beschriftung (Verb zuerst, sentence case), optional ein 16-px-Icon links, die Variante und bei Icon-Schaltflächen ein `aria-label`.

## Varianten

| Variante | Klasse | Einsatz |
| --- | --- | --- |
| Primär | `ui-btn--primary` | Die eine Hauptaktion einer Ansicht: «Text lesen», «Exportieren», «Position speichern». Höchstens eine pro Steuerleiste. |
| Sekundär | `ui-btn--secondary` | Gleichrangige Nebenaktion: «Chronologie», «Vergleichen», «Projektdatei importieren». Charcoal `inverse-canvas`. |
| Tertiär | `ui-btn--tertiary` | Aktion mit Menü oder geringerem Gewicht: «Karte exportieren ▾», «Vorschau Vorschlag». Blauer 1-px-Rahmen. |
| Ghost | `ui-btn--ghost` | Werkzeuge in Kopfzeilen und Tabellen: «Anleitung», «Kürzel», Schliessen. |
| Gefahr | `ui-btn--danger` | Nur bei unwiderruflichem Löschen, immer in einem Bestätigungsdialog. |

## Regeln

- Ecken immer `radius-none`. Höhe `size-control-md` (40 px), in dichten Tabellen `ui-btn--sm` (32 px).
- Stehen eine Primär- und eine Sekundärschaltfläche nebeneinander, berühren sie sich ohne Abstand (`ui-btn-group`), die Primäre rechts.
- Textlinks (`ui-link`) für Navigation zu Info und Anleitung, nie für Aktionen.
- Deaktiviert: `surface-2` mit `ink-disabled`. Nicht verstecken, wenn der Grund erklärt werden kann.
- Fokus: 2 px `focus` innen, 1 px `canvas` dazwischen.

## Im Tool

`.btn-primary` → Primär, `.btn-secondary` (heute roter Rahmen) → Tertiär, `.btn-tertiary` → Sekundär oder Ghost je nach Gewicht, `.btn-icon` → `ui-btn--icon`, `.btn-danger` → Gefahr, `.btn-danger-quiet` → Ghost mit `error-text`. Die Rückmeldung «Button nicht erkennbar» (feedback/5) ist damit erledigt: jede Aktion hat eine gefüllte oder gerahmte Fläche.
