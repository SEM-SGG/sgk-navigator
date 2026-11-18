# Ansichten

Jede Ansicht folgt demselben Aufbau: `UiShell`, darunter eine Steuerleiste, dann der Inhalt mit Seitentitel in `display-md`. Die Referenz ist die Designstudie A (Canvas «SGK-Navigator – Designstudien», Zeile A).

## Übersicht

1. Kopfbereich: Kennung als Eyebrow in `body-sm`/`ink-muted` («Rechtsakt · SGK 2016/399»), Kurztitel in `display-md`, Langtitel in `body-lg`/`ink-muted` auf höchstens 760 px. Rechts «Text lesen» (Primär) und «Chronologie öffnen» (Sekundär) als Gruppe.
2. `KpiTile` mit vier Kennzahlen.
3. Abschnitt «Zeitstrahl der Akte» in `headline`, Erklärsatz in `body-sm`, rechts «Berichtigungen zeigen» und «Anleitung» (Ghost). Darunter `Timeline` und die Legende.
4. Tabelle «Abweichende Anwendung einzelner Änderungen» als `CompareTable`-Raster ohne Diff.
5. Abstand zwischen den Abschnitten `space-xxl`.

## Lesen

1. Links `Toc` (320 px, `surface-1`) mit Suche und Filter «nur geänderte Einheiten».
2. Rechts oben eine Steuerleiste auf `canvas` mit Haarlinie: Sicht (`SegmentedControl`), «Vorschau Vorschlag» (Tertiär), Rechtstext DE/FR/EN; darunter die Kontrollkästchen und die `StageBar`.
3. Artikel: Eyebrow «Artikel 8», Sachüberschrift in `display-md`, Standzeile in `body-sm`/`ink-muted` mit Quellen-Tag. Rechts «Chronologie» (Tertiär) und «Vergleichen» (Primär).
4. `Notice` für ergänzte oder rekonstruierte Stände, dann «Wortlaut geprägt durch» als Reihe von Akt-Chips mit Status-Tag.
5. `LegalText` mit Herkunft am Rand; der linke Rand (`size-margin-gutter`) hält die Akt-Kurznamen frei.
6. Klick auf einen Block öffnet die Chronologie dieser Bestimmung rechts als Schublade (440 px, `shadow-overlay`) oder wechselt in die Ansicht Chronologie.

## Chronologie

1. Steuerleiste: Einheit und Bestimmung (`Field` als Auswahl), rechts Rechtstext DE/FR/EN.
2. Links der Verlauf: Eyebrow «Chronologie», Zitierung in `display-md`, Kurzbeschrieb mit Zahl der Änderungen in `subhead`/`ink-muted`, dann die `ChronologyEntry`-Liste.
3. Rechts eine Seitenleiste (320 px) aus zwei Karten mit Haarlinienrahmen: «Karte exportieren» (Format, Begründung beilegen, «Exportieren» Primär, «In Sammelkorb» Ghost) und «Begründung» (Erwägungsgründe je Akt).
4. Hinweis «57 Bestimmungen verweisen hierauf» als aufklappbare Liste unter dem Titel.

## Vergleich

1. Steuerleiste als Band auf `surface-1`: Vergleichsart, Bestimmung, Alter Stand, Tauschen (Icon), Neuer Stand; zweite Zeile Darstellung, Umfang und rechts «Karte exportieren» (Tertiär).
2. Titel mit Eyebrow «Vergleich», rechts die Zähler-Tags.
3. `Notice` zum rekonstruierten Stand, wenn ein Stand rekonstruiert ist.
4. `CompareTable` oder, bei Redline, eine Spalte mit Diff im Fliesstext.

## Verhandlung: Dossiers und Synopse

1. Im Modul Verhandlung zeigt die Top-Navigation Dossiers, Synopse, Import, Position CH, Delegationen, Konsultation, Ausgabe, Anleitung.
2. Statt der Werk-Tabs steht die Dossier-Leiste: Ordner-Icon, Titel in `body-emphasis`, Verfahrensnummer in `code`, Tags «Beispiel» und «LIMITE», rechts «Gespeichert 00:04» mit Haken in `success-text` und die Werkzeuge (Kürzel Ghost, Zusammenführen und Projektdatei Sekundär).
3. Synopse: links Gliederung (`Toc`, schmal, mit Zählern), rechts Spurschalter, «Änderungen markieren», Filter, Ansicht, Legende und die `SynopsisTable`.
4. Dossierliste ohne Dossier: Titel «Dossiers» in `display-md`, Info-`Notice` «Vertraulich», drei Aktionen («Neues Dossier» Primär, «Projektdatei importieren» und «Beispiel-Dossier laden» Sekundär) und ein leerer Zustand mit Titel in `headline`.

## Exportkarten

- PNG und PDF (A4 hoch, 16:9 quer) verwenden dieselben Tokens: Plex Sans und Serif eingebettet, Kopf mit Wortmarke, Zitierung in `display-md` (16:9: `display-lg`), Diff-Farben, Farbfeld des Akts. Kein Blau ausser im Fokus der Oberfläche; die Karte selbst bleibt schwarz-weiss mit Diff- und Aktfarben.
