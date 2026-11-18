# Notice

Inline-Meldungen erklären den Zustand der angezeigten Daten oder das Ergebnis einer Aktion.

**Der Konsument liefert:** Art (Warnung, Info, Fehler, Erfolg), einen fetten Titelsatz und den Erklärtext; optional einen Link.

- Linker 3-px-Balken in der Signalfarbe (`warning`, `primary`, `error`, `success`), Fläche und Text aus der passenden `*-bg`/`*-text`-Kombination, Icon 20 px.
- Titel in `body-emphasis` als vollständiger Satz mit Punkt; danach der Text im selben Absatz.
- Warnung: berechnete, rekonstruierte oder ergänzte Stände. Info: Vertraulichkeit, Hinweise zur Sicht. Fehler: fehlgeschlagene Aktion, `role="alert"`. Erfolg: abgeschlossener Export, `role="status"`.
- Keine abgerundeten Ecken, kein Schatten.

## Im Tool

Ersetzt `.notice`, `.notice-warning`, `.notice-computed`, `.notice-error`, `.notice-success`.
