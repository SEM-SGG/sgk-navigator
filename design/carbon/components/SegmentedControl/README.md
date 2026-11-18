# SegmentedControl

Der Segment-Schalter wählt genau eine von zwei bis vier gleichrangigen Optionen, die sofort wirken.

**Der Konsument liefert:** eine Beschriftung (`ui-label` darüber), die Optionen als `<button aria-pressed>` und den gewählten Wert.

- Gewählt: `inverse-canvas` mit `on-primary`. Nicht gewählt: `canvas` mit 1-px-Rahmen `border-strong`.
- Ecken `radius-none`, Segmente teilen sich den Rahmen (−1 px Überlappung).
- Einsatz: Sicht, Rechtstext DE/FR/EN, Oberfläche DE/FR, Vergleichsart, Darstellung, Umfang.
- Mehr als vier Optionen oder Optionen mit langen Texten: `Select` verwenden.

## Im Tool

Ersetzt `.seg`. Die Logik bleibt, nur die Gestaltung wechselt.
