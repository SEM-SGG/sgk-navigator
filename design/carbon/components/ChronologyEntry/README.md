# ChronologyEntry

Ein Eintrag der Chronologie zeigt, was ein Akt an der gewählten Bestimmung geändert hat.

**Der Konsument liefert:** Akt (Schlüssel, Kurzname, Nummer), Annahmedatum, Fundstelle im Amtsblatt, Status-Tag, Quelle (rekonstruiert oder ergänzt als `ui-tag--outline`) und die Änderungen als `Diff`-Blöcke; ohne Änderung einen Satz, was der Akt sonst ändert.

- Vertikale Zeitachse: 2-px-Linie `hairline`, 14-px-Knoten in der Aktfarbe, schraffiert für noch nicht anwendbare Akte.
- Kopf: Kurzname in `card-title` (Gewicht 400), Nummer in `ink-subtle`, Status-Tag rechts.
- Metazeile in `caption`/`ink-muted`, Fundstelle mit Mittelpunkt getrennt.
- Abstand zwischen Einträgen 32 px. Rechts daneben steht die Seitenleiste mit Export und Begründung (siehe Ansichten).

## Im Tool

Ersetzt `.chron`, `.cstep`, `.cstep-head`, `.cstep-meta`, `.cstep-text`, `.cstep-recon`.
