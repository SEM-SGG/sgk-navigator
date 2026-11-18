# Diff

Die Diff-Auszeichnung zeigt eingefügte und gestrichene Textstellen; sie wird im Text, in der Chronologie, im Vergleich und in der Synopse gleich verwendet.

**Der Konsument liefert:** den Text mit markierten Spannen (`<ins class="ui-ins">`, `<del class="ui-del">`) und für einen Änderungsblock Zitierung, Änderungsart und Akt.

- Eingefügt: `diff-ins-text` auf `diff-ins-bg`, immer unterstrichen. Gestrichen: `diff-del-text` auf `diff-del-bg`, immer durchgestrichen. Unterstreichung und Durchstreichung tragen die Bedeutung auch ohne Farbe.
- Änderungsblock (`ui-change`): Zitierung als Link, Tag der Änderungsart (eingefügt `ui-tag--ins`, ersetzt oder geändert `ui-tag--info`, gestrichen `ui-tag--del`), darunter der Text auf `surface-1` mit 3-px-Balken in der Aktfarbe.
- Gestrichene Stelle vor der eingefügten, ohne Leerzeichen dazwischen.
- In der Synopse gilt die Auszeichnung der Quelle (neu fett, gestrichen durchgestrichen); die Legende steht über der Tabelle.

## Im Tool

Ersetzt `.chg`, `--ins-*`, `--del-*`, `.cmp-redline`, `.np-redline`, `.nchg-*`.
