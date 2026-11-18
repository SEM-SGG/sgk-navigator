# Umstellung

Dieser Abschnitt ist der Auftrag an einen Agenten, der den SGK-Navigator auf dieses Design System umstellt. Er setzt das Repository `sgk/` voraus (Build `build.mjs`, Stylesheet `src/app/styles.css`, Modul-CSS `src/app/modules/neg/neg3.css`).

## Ziel und Grenzen

- Ziel: Das Tool sieht aus wie die Designstudie A und hält alle Regeln aus «README», «Ansichten» und den Komponenten-Richtlinien ein.
- Unverändert bleiben Datenmodell, Parser, Berechnungen, Exportlogik, i18n-Schlüssel, Routen und das Verhalten jeder Funktion. Ändere Markup nur dort, wo eine Komponente ein anderes Element verlangt (zum Beispiel `<button>` statt `<span>`).
- Behalte bestehende Klassennamen und `data-*`-Attribute, weil die Playwright-Tests sie verwenden. Die `ui-*`-Klassen in `components/bundle.css` sind die Referenz für die Regeln, nicht für die Namen.
- Betriebsform bleibt: eine selbsttragende HTML-Datei, offline lauffähig, keine CDN, keine externen Schriften, Content-Security-Policy mit `font-src data:`.

## Zuordnung der bisherigen Variablen

| Bisher (`styles.css`) | Neu (Token) | Hinweis |
| --- | --- | --- |
| `--red` | `--primary` | Akzent wechselt von Bundesrot zu IBM Blue |
| `--red-dark` | `--primary-active` | |
| `--red-50` | `--highlight` | |
| `--ink`, `--ink-2` | `--ink` | |
| `--muted`, `--slate-400`, `--slate-500` | `--ink-muted` | |
| `--slate-300` | `--ink-subtle` | |
| `--paper` | `--canvas` | |
| `--panel`, `--slate-50` | `--surface-1` | |
| `--slate-100`, `--line` | `--hairline` | |
| `--line-2`, `--slate-200` | `--border-strong` | |
| `--slate-800`, `--slate-900` | `--inverse-canvas` | |
| `--focus` (Violett) | `--focus` (Blau) | Fokus neu nach Carbon: innen, 2 px |
| `--ins-bg`, `--ins-ink`, `--ins-line` | `--diff-ins-bg`, `--diff-ins-text` | Linie entfällt, Unterstreichung bleibt |
| `--del-bg`, `--del-ink`, `--del-line` | `--diff-del-bg`, `--diff-del-text` | |
| `--ui` | `--font-sans` | IBM Plex Sans |
| `--serif` | `--font-serif` | IBM Plex Serif |
| `--sp-1` … `--sp-16` | `--space-xxs` … `--space-section` | `--sp-5` (20 px) und `--sp-10` (40 px) gibt es nicht mehr: auf 24 oder 16 und 48 oder 32 runden |
| `--fs-*` | Typostile (`body-sm`, `body`, `subhead`, `display-md`) | Titel `--fs-2xl`/`--fs-3xl` werden `display-md` mit Gewicht 300 |
| `--ctl-h-sm`, `--ctl-h`, `--ctl-h-lg` | `--size-control-sm` (32), `--size-control-md` (40), `--size-control-lg` (48) | Standardhöhe steigt von 36 auf 40 px |
| `--head-h` | `--size-utility-bar` + `--size-top-nav` | Kopf neu dreiteilig |
| `--toc-w` | `--size-sidebar` | |
| `--r-ctl`, `--r-card`, `--r-note` | `--radius-none` | |
| `--r-tag` (12 px) | `--radius-xs` (2 px) | Tags werden eckig |
| `--shadow-card` | entfällt | Karten ohne Schatten, mit Haarlinie |
| `--shadow-pop` | `--shadow-overlay` | |

## Vorgehen

Arbeite in fünf Etappen. Nach jeder Etappe laufen alle Tests, und es entsteht ein Commit.

1. **Schriften.** Ersetze in `package.json` `@fontsource/noto-sans` und `@fontsource/source-serif-4` durch `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-serif` und `@fontsource/ibm-plex-mono`. Passe `faces` in `build.mjs` an: Sans 300, 400, 400 italic, 600; Serif 400, 400 italic; Mono 400, 500 (Teilmenge `latin`, für Serif zusätzlich `latin-ext`). Die Exportschriften folgen in Etappe 5. `test/export/size.test.mjs` zeigt, ob die Dateigrösse im Rahmen bleibt.
2. **Tokens.** Ersetze den `:root`-Block in `styles.css` durch die Variablen aus `tokens.css` dieses Systems. Lege die alten Namen vorübergehend als Aliase an (`--red: var(--primary);`), damit nichts bricht. Entferne die Aliase am Ende von Etappe 4.
3. **Komponenten.** Stelle die Bausteine in dieser Reihenfolge um, jeweils nach der Komponenten-Richtlinie und `bundle.css`: Button, SegmentedControl, Field, Checkbox, Tag, Notice, Tabs, Dialog und Menü, ActSwatch, StageBar, Diff, LegalText, Toc, Timeline, KpiTile, ChronologyEntry, CompareTable, SynopsisTable. Der Abschnitt «Im Tool» jeder Richtlinie nennt die betroffenen Klassen.
4. **Shell und Ansichten.** Baue den Kopf nach `UiShell` um (Utility-Leiste, Top-Navigation, Werk-Tabs, Dossier-Leiste) und ordne jede Ansicht nach «Ansichten». Ersetze danach jede verbliebene Farbe, jeden Radius und jeden Schatten, der nicht aus einem Token kommt. Suche dazu in den CSS-Dateien nach `#`, `rgb`, `px` in Radien und `box-shadow`.
5. **Exportkarten und Druck.** Stelle `.card-*`, Druckansicht und Word-Ausgabe auf die neuen Schriften und Farben um. Die Karten bleiben schwarz-weiss mit Diff- und Aktfarben. Für den PDF-Export erzeugt `test/export/tools/make-fonts.py` Teilmengen in `src/export/fonts-data.js`: stelle die Quellen auf IBM Plex Sans und Serif um (TTF, zum Beispiel aus `@expo-google-fonts/ibm-plex-sans` und `@expo-google-fonts/ibm-plex-serif`) und behalte die Umbenennung in «SGKN Sans» und «SGKN Serif» bei. IBMs Originallizenz reserviert den Namen «Plex» für unveränderte Fassungen; eine Teilmenge darf ihn nicht tragen.

## Abnahme

- `npm test` und die Playwright-Suiten in `test/app/` laufen grün. Wo ein Test an Gestaltung hängt (Farbe, Pixelmass), passe den Test an und nenne ihn im Commit.
- Jede Ansicht gleicht der Designstudie A: Übersicht, Lesen (Art. 8), Chronologie (Art. 8 Abs. 3 Bst. a Ziff. i), Vergleich (Art. 8 Abs. 3 Bst. a), Synopse (Beispiel-Dossier SGK-Revision). Lege von jeder Ansicht einen Screenshot bei 1440 px und bei 375 px ab (`test/app/shot.mjs`).
- In `styles.css` und `neg3.css` steht keine Farbe, kein Radius und kein Schatten mehr ausserhalb des `:root`-Blocks.
- Kein Text unterschreitet 4.5:1, kein Bedienrahmen und kein Fokusrahmen 3:1. Prüfe mit axe oder einem eigenen Kontrastskript über die gerenderten Seiten.
- Die Rückmeldungen in `feedback/` sind gelöst: Standleiste ohne Abschneiden (1), Zeitstrahl-Beschriftungen ohne Überlappung (2), keine sichtbaren `<b>`-Tags in Inhaltsverzeichnis und Anhangtiteln (3, 4), Schaltflächen als Schaltflächen erkennbar (5).
- Die Datei läuft per Doppelklick offline in Edge, Chrome, Firefox und Safari; die Konsole zeigt keine CSP-Fehler.

## Offene Entscheide

Lege diese Punkte vor der Umsetzung dem Auftraggeber (SGG) vor, statt sie selbst zu entscheiden:

- Exportkarten: Bleibt das Kopfelement ohne Logo, oder braucht es für den Versand ausserhalb des Amts einen Absender?
- Dunkles Thema: nicht Teil dieser Version.
- Schublade für die Chronologie in Lesen (440 px rechts) oder Wechsel in die Ansicht Chronologie.
