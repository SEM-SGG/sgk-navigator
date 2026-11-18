# Field

Eingabefelder und Auswahllisten im Carbon-Stil: graue Fläche, Unterkante als Linie, kein Rahmen ringsum.

**Der Konsument liefert:** eine sichtbare Beschriftung (`ui-label`, nie nur Platzhalter), den Wert, optional Hilfetext (`ui-helper`) und den Fehlerzustand (`is-error`).

- Fläche `surface-1`, Unterkante 1 px `border-strong`, Höhe `size-control-md`, Polster 16 px.
- Fokus: 2-px-Rahmen `focus` innen. Fehler: 2-px-Rahmen `error`, Hilfetext in `error-text`.
- Platzhalter in `ink-subtle`. Er zeigt ein Beispiel, er ersetzt keine Beschriftung.
- Auswahllisten nutzen das native `<select>` mit eigenem Chevron rechts.
- Liegen Felder auf `surface-1` (Steuerleiste), wechselt das Feld auf `canvas`.

## Im Tool

Ersetzt `.field`, `.field-label`, `.legal-input` und die Suchfelder in Lesen und Synopse.
