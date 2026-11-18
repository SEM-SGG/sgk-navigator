# StageBar

Die Standleiste wählt den Stand des Rechtstexts; jeder Stand entspricht einem Änderungsakt.

**Der Konsument liefert:** die Stände in zeitlicher Reihenfolge mit Akt-Schlüssel (`data-act`), Kurzname, Jahr, Kennzeichen «rekonstruiert» (*), «ändert diese Einheit» (Punkt) und «noch nicht anwendbar» (Schraffur) sowie den gewählten Stand.

- Jeder Stand ist eine Schaltfläche (`aria-pressed`). Nicht gewählt: `surface-1` mit Haarlinie. Gewählt: `canvas`, Rahmen `ink`, 2-px-Unterkante `primary`, Name in `body-emphasis`.
- Das Farbfeld (`ActSwatch`) steht vor dem Namen; Text bleibt immer `ink`, nie in der Aktfarbe.
- Unter der Leiste steht die Legende in `caption`.
- Die Leiste bricht um; sie scrollt nicht horizontal.

## Im Tool

Ersetzt die Standleiste in Lesen (`.lg-*`, `.mark`, `.mark-pend`). Die Rückmeldung «Standleiste abgeschnitten» (feedback/1) ist durch den Umbruch gelöst.
