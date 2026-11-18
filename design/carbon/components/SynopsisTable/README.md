# SynopsisTable

Die Synopse stellt die Fassungen eines Gesetzgebungsverfahrens Zeile für Zeile nebeneinander, mit der Position der Schweiz in der letzten Spalte.

**Der Konsument liefert:** die sichtbaren Spuren (Kommission, Parlament, Rat, Kompromiss) mit gewählter Fassung, je Zeile Nummer, Zitierung, Zelltexte mit Auszeichnung der Quelle und die Position CH (Haltung, Priorität, Kurztext, zuständige Stelle) oder die Aktion «Position erfassen».

- Spaltenkopf je Spur mit 3-px-Oberkante in `track-*` und der Dokumentnummer in `caption`. Die Spurfarbe erscheint nur dort und im Spurschalter, nie im Text.
- Zellen in `legal-compact`, Polster 16 px (kompakt 8 × 10 px), Haarlinien als Raster.
- Spalte Position CH auf `surface-1`, Haltung als `Tag` (`ui-tag--support` … `--none`), Priorität als `ui-tag--outline`; «rote Linie» als `ui-tag--error`.
- Leere Zelle: «kein Text in dieser Fassung» in `ink-subtle`.
- Über der Tabelle: Spurschalter (Kontrollkästchen mit Farbfeld), Auswahl «Änderungen markieren», Suche, Filter, Ansicht und die Legende der Auszeichnung.
- Die Tabelle scrollt horizontal in ihrem Rahmen; Kopfzeile und Zeilenspalte sind fixiert.
- Vertraulichkeit: die Dossier-Leiste zeigt `LIMITE` als `ui-tag--error` mit Schloss.

## Im Tool

Ersetzt `.np-tbl`, `.np-syn`, `.np-head`, `.npos`, `.ns-*` sowie die Spurfarben in `neg3.css`.
