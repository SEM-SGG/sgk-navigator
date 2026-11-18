# LegalText

Der Rechtstext wird in IBM Plex Serif gesetzt, mit Gliederungszeichen in einer eigenen Spalte und der Herkunft jedes Blocks am linken Rand.

**Der Konsument liefert:** die Blöcke mit Gliederungszeichen, Tiefe (`data-depth` 0 bis 3), Wortlaut und Herkunftsakt (`data-act`, schraffiert, wenn noch nicht anwendbar), dazu Verweise und Fussnoten als Inline-Elemente.

- Wortlaut in `legal-body` (17/29 px), Farbe `ink`, Zeilenlänge höchstens `size-measure`. Gliederungszeichen in `legal-num`, `ink-muted`.
- Einzug je Ebene 40 px. Abstand zwischen Blöcken 16 px.
- Herkunft am Rand: 3-px-Balken in der Aktfarbe direkt links des Blocks, Kurzname des Akts rechtsbündig im Rand (`size-margin-gutter`) in `label` und `ink-muted`. Die Aktfarbe steckt nur im Balken.
- Rechtstext nie verändern: «ß» und Anführungszeichen bleiben wie im Amtsblatt. Silbentrennung `hyphens: auto` mit `lang` der Rechtstextsprache.
- Verweise sind Links in `primary` ohne Unterstreichung, beim Hover unterstrichen; externe Verweise mit ↗.
- Änderungen gegenüber Vorstand: Diff-Auszeichnung aus `Diff` im Fliesstext.

## Im Tool

Ersetzt `.legal`, `.blk`, `.blk-head`, `.blk-flag`, `.fnref`, `.fns`. Schrift wechselt von Source Serif 4 zu IBM Plex Serif.
