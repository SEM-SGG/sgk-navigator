# STATUS Carbon-Umstellung

Auftrag: `design/carbon/umstellung.md` (Design System «Carbon», Referenz unter `design/carbon/`).

## Fertig
- Schritt 0: Design System unter `design/carbon/` abgelegt (37 Dateien, Hashes gleich wie im Artefakt).
- Etappe 1 Schriften: IBM Plex Sans 300/400/400i/600, Serif 400/400i (latin + latin-ext), Mono 400/500 eingebettet (build.mjs, package.json). Alle Suiten grün (core 64, export 30, neg 50, app 11 + 80).

- Etappe 2 Tokens: `:root` in styles.css durch tokens.css ersetzt, alte Namen als Aliase. Test angepasst: ui.spec.mjs «Schaltflächen … Fokusring» (Tag-Form: Carbon-Tag radius-xs statt Pille). Alle Suiten grün (79 + 1 angepasst).

- Etappe 3 Komponenten: Button, SegmentedControl, Field, Checkbox, Tag, Notice, Tabs, Dialog/Menü, ActSwatch, StageBar, Diff, LegalText, Toc, Timeline, KpiTile, ChronologyEntry, CompareTable, SynopsisTable in styles.css und neg3.css; Aktfarben und Spurfarben aus src/app/tokens.js. Kopf bereits nach UiShell umgebaut (Teil von Etappe 4). Tests angepasst: helpers.mjs (Auswahl-Prüfung ohne nativen Pfeil bei appearance: none), ui.spec.mjs (Schaltfläche «Im Text zeigen» gefüllt statt Schatten-Rahmen), neg3.spec.mjs (Wettlauf: Umstellung auf EN abwarten).

- Etappe 4 Shell und Ansichten: Utility-Leiste (Modul, Datenstand, Oberflächensprache), Top-Navigation mit Wortmarke «SGK Navigator» und Sammelkorb als 48-px-Werkzeug, Werk-Tabs, Dossier-Leiste; Breakpoints 1312/1056/672 (Seitenleisten gestapelt unter 1056, Menü unter 672); Steuerleisten Vergleich/Chronologie als Band auf surface-1; Varianten nach ansichten.md (Vergleichen primär, Vorschau Vorschlag tertiär); Aliase entfernt; Texte mit Farbnamen angepasst (Standleiste blau, Bibliotheksverweise blau punktiert); Prüfskript test/app/carbon-audit.mjs ohne Befunde; Screenshot-Skript test/app/carbon-shots.mjs (mit --check, --axe).

- Etappe 5 Exportkarten und Druck: Karten (PNG/PDF als Bild) in Plex Sans/Serif, Wortmarke, Zitierung display-md (16:9 grösser), schwarz-weiss mit Diff- und Aktfarben; PDF mit Text: «SGKN Sans»/«SGKN Serif» aus IBM Plex (make-fonts.py, fonts-data.js, OFL.txt), Farben aus tokens.js; Word-Baustein, Zwischenablage, Konsultation/Briefing (src/neg) mit Carbon-Farben, Schrift Arial bleibt; Druckansichten beider Module (Utility-Leiste und Werk-Tabs im Druck ausgeblendet). Beispielexporte: test/app/carbon-exports.mjs. Test angepasst: pdf.test.mjs (Meldetext «SGKN Sans» statt «Noto Sans», Prüfung unverändert).

- Schlussprüfung: alle Suiten grün (core 64, export 30, neg 50, app 11 + 80 Playwright); test/app/carbon-audit.mjs ohne Befunde; axe-core (color-contrast, link-in-text-block) 0 Befunde über alle Ansichten DE bei 1440 und 375 px; offline ohne Requests und ohne Konsolenfehler; Plex Sans/Serif/Mono geladen; dist/sgk-navigator.html 6,9 MB.

- Nacharbeit Liste 1 (Orchestrator): Synopse-Gliederung unter 1312 px geschlossen, Overlay mit Schaltfläche «Gliederung» (Escape, Wahl, Klick daneben schliessen; Test neg.spec.mjs 375/1024/1280/1440); Übersicht mit Kennung und Aktionen «Text lesen»/«Chronologie öffnen»; Chronologie mit Seitenleiste (Karte exportieren, Begründung); Vergleich in zwei Zeilen; Inhaltsverzeichnis unter 1056 px einklappbar; Ghost-Schaltflächen (Kürzel, In Sammelkorb, Verweise), Filter einheitlich; Werk-Tabs mit role=tab/aria-selected und Pfeiltasten; Druck-Synopse mit festen Spalten; FR-Screenshots Zusammenführen 1024/1920.
- Nacharbeit Liste 2 (Prüfer): Menü über Overlays, Lesen-Schublade unter dem Kopf, Dossiertitel mit Vorrang, Chronologie-Einträge nach ChronologyEntry mit Zahl der Änderungsschritte, Vergleich-Zähler als Tags, Steuerleisten 24 px, Seitentitel display-md (Synopse mit h1), Kennzahlen als Kacheln ohne Rot, Löschen als Danger-Ghost, 375-px-Korrekturen (Bilanz, Werk-Tabs, einzeilige Schaltflächen), Fokus innen, Zeilendetail-Tabs einzeilig, Zeitstrahl nach Timeline, Synopse-Steuerleiste, Meldungen unten Mitte bzw. über der Sammelkorb-Fusszeile (Test), Legende im Raster, Exporte (SGK Navigator, Beispiel ohne Versalien, Zeichenschriften SGKN Zeichen/Symbole, Plex Serif 600), Reste, Sammelkorb mit Fokusfalle (Test).

## Offen
- siehe Schlussbericht der Nacharbeit (Abweichungen: Vergleichsart steht in der zweiten Zeile der Vergleich-Steuerleiste; Word-Ausgaben in Arial).

Status: final

