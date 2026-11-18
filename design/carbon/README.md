Carbon ist das Design System des SGK-Navigators und folgt dem Carbon Design System von IBM: weisse Flächen, Charcoal-Typografie, IBM Blue als einziger Akzent, eckige Formen und IBM Plex in drei Schnitten. Es ersetzt die bisherige Gestaltung nach CD Bund (Noto Sans, Source Serif 4, Bundesrot). Lies dieses Dokument zuerst, dann «Ansichten» für die fünf Hauptansichten und «Umstellung» für den Auftrag am bestehenden Code.

## Grundsätze

- **Korrektheit vor Wirkung.** Das Tool zeigt Rechtstext. Gestaltung darf nie den Eindruck erwecken, ein berechneter oder rekonstruierter Stand sei amtlich. Jede Abweichung von der amtlichen Fassung bekommt eine `Notice` in `warning`.
- **Ein Akzent.** `primary` (#0f62fe) markiert, was man anklicken kann oder was gewählt ist: Primärschaltfläche, Link, aktiver Tab, Fokus. Alles andere ist Schwarz, Weiss und Grau.
- **Bedeutungsfarben sind Grafik.** Die Farben der Akte, der Spuren und der Diff-Auszeichnung stehen in Farbfeldern, Balken und Hintergründen. Text bleibt `ink` oder `ink-muted`; das Wort trägt die Bedeutung, die Farbe verstärkt sie.
- **Flach und eckig.** Hierarchie entsteht durch Flächenwechsel (`canvas` → `surface-1` → `surface-2`) und 1-px-Haarlinien. Schatten nur für Dialoge und Menüs.
- **Dicht, aber ruhig.** Fachleute wollen viel auf einer Seite sehen. Das 4-px-Raster und die leichten Display-Titel (Gewicht 300) halten die Dichte lesbar.

## Inhalt und Sprache

- Oberfläche in Schweizer Hochdeutsch und Französisch, nie «ß» in Oberflächentexten. Der Rechtstext bleibt unverändert, mit «ß», wie im Amtsblatt.
- Anweisungen stehen im Infinitiv: «Bestimmung anklicken, um ihre Chronologie zu sehen.» Wo ein ganzer Satz nötig ist, bleibt die Sie-Form wie bisher.
- Sentence case für Titel, Beschriftungen und Schaltflächen: «Karte exportieren», nicht «Karte Exportieren». Keine Grossbuchstaben-Eyebrows; nur `LIMITE` steht in Versalien, weil die Einstufung so heisst.
- Schaltflächen beginnen mit dem Verb: «Text lesen», «Position speichern», «Beispiel-Dossier laden».
- Zitierungen nach Schweizer Praxis: «Art. 8 Abs. 3 Bst. a Ziff. i», «Anhang V», «Unterabs. 2».
- Daten ausgeschrieben: «anwendbar seit 12. Oktober 2025». Kennungen in `code`: `32017R2225`, `2021/0428(COD)`.
- Statusbegriffe sind fest: «anwendbar», «beschlossen, noch nicht anwendbar», «Vorschlag, im Trilog», «zurückgezogen», «rekonstruiert», «konsolidiert, ergänzt». Keine Synonyme.
- Keine Emoji, keine Ausrufezeichen, keine Füllwörter wie «einfach» oder «schnell».

## Farbe

| Rolle | Token | Einsatz |
| --- | --- | --- |
| Akzent | `primary`, `primary-hover`, `primary-active`, `link-hover` | Primärschaltfläche, Link, aktiver Tab, Fokus |
| Grund | `canvas`, `surface-1`, `surface-2` | Seite und Karten; Steuerleisten, Seitenleisten, Felder; Auswahl |
| Invers | `inverse-canvas`, `inverse-surface-1` | Sekundärschaltfläche, gewählter Segment-Schalter |
| Text | `ink`, `ink-muted`, `ink-subtle`, `ink-disabled` | Haupttext, Sekundärtext, Hilfetext, nur deaktiviert |
| Linien | `hairline`, `border-strong`, `hairline-strong` | Raster und Kartenrahmen; Feldunterkanten und Kontrollrahmen; Tabellenkopf |
| Signal | `success*`, `warning*`, `error*`, `info-text`, `pending*` | Tags und Meldungen, immer als Paar `*-text` auf `*-bg` |
| Diff | `diff-ins-*`, `diff-del-*` | Eingefügt (unterstrichen), gestrichen (durchgestrichen) |
| Akte | `act-base` … `act-reform`, `act-proposal`, `act-derogation` | Farbfelder, Zeitstrahl, Herkunft am Rand, Chronologie-Knoten |
| Spuren | `track-com`, `track-ep`, `track-council`, `track-agreement` | Spaltenkopf und Spurschalter der Synopse |
| Haltung | `stance-*` | Tags der Position CH |

- Setze Text in `ink` auf `canvas`, `surface-1` und `surface-2`. Setze Sekundärtext in `ink-muted`, Hilfetext und Achsenbeschriftungen in `ink-subtle`.
- Verwende `primary` nie als Fläche einer Karte, eines Tags oder einer Spalte. Ausnahme: das CTA-Band einer Startseite, das das Tool nicht hat.
- Verwende Aktfarben nie als Textfarbe. Mehrere Aktfarben (`act-base`, `act-frontex`, `act-sys`) erreichen nur 3.3:1 und genügen für Grafik, nicht für Text.
- Kennzeichne «beschlossen, noch nicht anwendbar» immer zusätzlich durch Schraffur, nicht nur durch Farbe.
- Ein dunkles Thema ist nicht Teil dieser Version. Die Tokens sind so benannt, dass ein Thema `g100` später ergänzt werden kann.

## Typografie

- **IBM Plex Sans** für die ganze Oberfläche. Seitentitel in `display-md` mit Gewicht 300; Fliesstext 400; Hervorhebung 600. Nie 700.
- **IBM Plex Serif** nur für Rechtstext: `legal-body` (17/29 px) in Lesen und Chronologie, `legal-compact` (15 px) in Tabellen.
- **IBM Plex Mono** nur für technische Kennungen (`code`).
- Behalte `letter-spacing: 0.16px` auf `body`, `body-sm`, `button` und 0.32 px auf `label` und `caption`. Display-Grössen laufen leicht negativ.
- Die Schriften stehen unter der SIL Open Font License (`fonts/OFL.txt`). Das Tool bettet sie als woff2 ein (Teilmenge Latin). Für Namen mit Zeichen ausserhalb Latin-1 wie «Łódź» kommt die Teilmenge `latin-ext` von `@fontsource/ibm-plex-serif` dazu.

| Stil | Grösse | Gewicht | Einsatz |
| --- | --- | --- | --- |
| `display-md` | 42 px | 300 | Seitentitel jeder Ansicht |
| `headline` | 32 px | 400 | Abschnittstitel |
| `card-title` | 24 px | 400 | Akt in der Chronologie, Dialog |
| `subhead` | 20 px | 400 | Einleitung unter dem Seitentitel |
| `body` | 16 px | 400 | Meldungen, Kennzahlen |
| `body-sm` | 14 px | 400 | Standard der Oberfläche |
| `body-emphasis` | 14 px | 600 | Aktiver Tab, Zitierung |
| `label`, `caption` | 12 px | 400 | Feldbeschriftung, Fundstelle, Legende |
| `legal-body` | 17 px Serif | 400 | Rechtstext |
| `code` | 12 px Mono | 400 | CELEX, Verfahrensnummer |

## Raster, Abstände und Layout

- 4-px-Raster mit den Tokens `space-xxs` (4) bis `space-xxl` (48). Abstand zwischen Gruppen mindestens doppelt so gross wie innerhalb einer Gruppe: Beschriftung zu Feld 8 px, Feld zu Feld 24 px, Steuerleiste zu Inhalt 32 px.
- Seitenrand `space-xl` (32 px). Maximale Inhaltsbreite `size-content-max`.
- Feste Höhen: Utility-Leiste 32 px, Top-Navigation 48 px, Tabs 48 px, Schaltflächen und Felder 40 px (kompakt 32 px).
- Seitenleisten: Inhaltsverzeichnis `size-sidebar` (320 px) auf `surface-1` mit Haarlinie rechts; Gliederung der Synopse `size-sidebar-sm`.
- Steuerleisten (Sicht, Stand, Vergleichsart) liegen als Band auf `surface-1` oder auf `canvas` mit Haarlinie unten, nie als Karte mit Schatten.
- Breakpoints nach Carbon: 1584, 1312, 1056, 672 px. Unter 1056 px stapeln sich Seitenleisten über dem Inhalt, unter 672 px wird die Navigation zum Menü.

## Formen, Tiefe und Zustände

- Ecken `radius-none` für alles. `radius-xs` nur für Tags und Farbfelder, `radius-sm` nur für Menüs.
- Tiefe: Ebene 0 ohne Rahmen; Ebene 1 Haarlinie; Ebene 2 `surface-1`; schwebend `shadow-overlay`.
- Hover: eine Stufe dunkler (`canvas-hover`, `surface-hover`, `primary-hover`). Gedrückt: `primary-active`. Gewählt: `surface-2` oder `inverse-canvas` (Segment), immer mit Unterstrich oder Balken `primary`, wenn es Navigation ist.
- Fokus: 2-px-Rahmen `focus` innen mit 1 px `canvas` dazwischen, auf allen Flächen mindestens 4.5:1. Nie `outline: none` ohne Ersatz.
- Bewegung: Übergänge 110 ms für Hover und Fokus, 240 ms für Schubladen und Dialoge, Kurve `cubic-bezier(0.2, 0, 0.38, 0.9)`. Bei `prefers-reduced-motion` keine Übergänge.

## Ikonografie

- Das Tool behält sein Icon-Sprite `src/app/assets/icons.svg` (Strich-Icons). Stelle die Strichstärke auf 1.5 px ein, Grösse 16 px in Schaltflächen und Tags, 20 px in der Top-Navigation und in Meldungen.
- Icons übernehmen `currentColor`. Icon-Schaltflächen brauchen ein `aria-label`.
- Die Vorschauen dieses Systems zeichnen die Icons als Inline-SVG im gleichen Stil nach; sie sind Stellvertreter, die Vorlage ist das Sprite des Tools.
- Es gibt kein Logo. Die Wortmarke ist Text: «**SGK** Navigator» in Plex Sans 14 px, «SGK» in 600. Verwende weder das Bundeslogo noch ein IBM-Logo.

## Barrierefreiheit

- Text erreicht mindestens 4.5:1 auf seinem Grund; die Verhältnisse stehen in den Token-Notizen. `ink-subtle` auf `surface-1` liegt mit 4.6:1 knapp darüber: nicht auf `surface-2` verwenden.
- Bedeutung nie nur durch Farbe: Diff mit Unter- und Durchstreichung, Status mit Wort, «noch nicht anwendbar» mit Schraffur.
- Echte Elemente: `<button>`, `<a href>`, `<select>`, `<input>` mit `<label>`. Segment-Schalter mit `aria-pressed`, Tabs mit `role="tab"` und `aria-selected`, Meldungen mit `role="note"`, `"alert"` oder `"status"`.
- Touch-Ziele 40 px, in der Top-Navigation 48 px.
