# SGK-Navigator

Der SGK-Navigator zeigt, wie sich der Schengener Grenzkodex (SGK) und weitere Verordnungen zu Grenze und Visa (EES, ETIAS, VIS,
Interoperabilität) seit ihrem Erlass verändert haben: welcher Rechtsakt welche Bestimmung geändert hat, wie der Wortlaut vorher
und nachher lautete und ab wann eine Änderung gilt. Vergleich zweier Stände, Chronologie je Bestimmung, Export nach Word und PDF,
dazu ein Modul zur Begleitung von Verhandlungen. Texte auf Deutsch, Französisch und Englisch.

Das Tool ist eine einzige HTML-Datei. Sie läuft ohne Installation im Browser (Chrome oder Edge) und auch ohne Internetverbindung.

## Für Nutzende

### Herunterladen

**[Zur Download-Seite](https://sem-sgg.github.io/sgk-navigator/)** · direkt:
**[SGK-Navigator.html herunterladen](https://github.com/SEM-SGG/sgk-navigator/releases/latest/download/SGK-Navigator.html)**

Für den Download ist kein GitHub-Konto nötig. Der Link führt immer zur neuesten Version; frühere Versionen stehen unter
[Releases](https://github.com/SEM-SGG/sgk-navigator/releases).

### Öffnen

1. «SGK-Navigator herunterladen» wählen. Der Browser speichert die Datei `SGK-Navigator.html`, meist im Ordner «Downloads».
2. Die Datei doppelklicken. Sie öffnet sich in Chrome oder Edge.
3. Neue Versionen immer im **selben Browser** öffnen. Hochgeladene Fassungen, Notizen, Sammelkorb und die Daten des Moduls
   Verhandlung speichert der Browser, nicht die Datei; im selben Browser stehen sie in der neuen Version wieder zur Verfügung.
   Zur Sicherheit vor dem Wechsel im Tool unter «Aktualisieren» eine Projektdatei exportieren.

### Produktdokumentation

Die [Produktdokumentation](docs/sgk-navigator-dokumentation.html) beschreibt den SGK-Navigator in Deutsch, Französisch und Italienisch. Sie ist eine eigenständige HTML-Datei mit Sprachumschalter und lässt sich offline lesen. GitHub zeigt HTML-Dateien als Quelltext an und eine Datei dieser Grösse gar nicht:
«Download raw file» auf der Dateiseite wählen und die heruntergeladene Datei im Browser öffnen.

### Datenstand

Der Datenstand je Rechtsakt steht im Tool unter «Info» und auf der [Download-Seite](https://sem-sgg.github.io/sgk-navigator/).
Grundlage sind die Amtsblattfassungen und die konsolidierten Fassungen von EUR-Lex. Neuere konsolidierte Fassungen lassen sich im
Tool unter «Aktualisieren» selbst laden; eine wöchentliche Prüfung in diesem Repo meldet sie zudem den Pflegenden.

### Neue Versionen

Ist eine neue Version erschienen, zeigt das Tool oben einen Hinweis mit den Links «Neue Version herunterladen» und «Was ist neu».
Dafür fragt es höchstens einmal pro Tag die Datei `version.json` der Download-Seite ab (GitHub Pages), ersatzweise die
Release-Angabe bei GitHub. Aus dem Tool werden dabei keine Daten übertragen. Die Suche lässt sich unter «Info» abschalten.

### Keine amtliche Veröffentlichung

Das Tool ist keine amtliche Veröffentlichung. Massgebend ist allein das Amtsblatt der Europäischen Union. Berechnete und
rekonstruierte Stände sind im Tool als solche gekennzeichnet.

### Kontakt

Sektion Grundlagen Grenze (SGG), Staatssekretariat für Migration SEM.

Fehler und fehlende Fassungen lassen sich unter [Issues](https://github.com/SEM-SGG/sgk-navigator/issues/new/choose) melden.
Dafür ist ein GitHub-Konto nötig. Issues sind öffentlich: keine vertraulichen, klassifizierten oder internen Inhalte eintragen.
Ohne Konto bitte an die Sektion wenden.

### En bref (français)

Le SGK-Navigator suit les modifications du code frontières Schengen et d’autres règlements relatifs aux frontières et aux visas
(EES, ETIAS, VIS, interopérabilité). Il s’agit d’un seul fichier HTML qui s’ouvre dans Chrome ou Edge, sans installation.
[Page de téléchargement](https://sem-sgg.github.io/sgk-navigator/) · [Télécharger directement](https://github.com/SEM-SGG/sgk-navigator/releases/latest/download/SGK-Navigator.html)
(aucun compte GitHub nécessaire). Ouvrir les nouvelles versions dans le même navigateur afin de conserver les données. Pas une
publication officielle : seul le Journal officiel de l’Union européenne fait foi. Contact : Section Base Frontières,
Secrétariat d’État aux migrations SEM.

---

## Für Pflegende

Eine Anleitung in einfachen Schritten steht in **[MAINTAINING.md](MAINTAINING.md)** (neue Fassung einbauen, Release erstellen,
was tun bei roter CI). Hier die Übersicht.

### Aufbau

| Ordner / Datei | Inhalt |
| --- | --- |
| `src/app/` | Oberfläche (Preact/htm), Texte DE/FR in `src/app/i18n/`, Quelle für neue Versionen in `src/app/config/update-source.js` |
| `src/core/` | Kern: Parser für EUR-Lex-HTML, Datenmodell, Verweise, Anwendbarkeit (Browser und Node) |
| `src/neg/`, `src/export/` | Modul Verhandlung; Export nach Word und PDF |
| `data/` | Datensätze (`dataset.json` SGK, `works/` weitere Rechtsakte, `acts.json`, Zusatzdaten), Prüfberichte und Notizen |
| `scripts/` | Datenpipeline (`build-data.mjs` SGK, `build-work.mjs` weitere Werke, `validate*.mjs`), Download-Seite, Fassungsprüfung |
| `site/` | Vorlage der Download-Seite (GitHub Pages) |
| `test/` | Tests: `core` und `neg` (Node), `app` (Node und Playwright) |
| `design/carbon/` | Design System (Carbon, IBM Plex) |
| `docs/` | Produktdokumentation als eigenständige HTML-Datei (DE, FR, IT) |
| `docs/entwicklung/` | Spezifikationen und Statusberichte aus der Entwicklung |
| `build.mjs` | baut die eine HTML-Datei (JS, CSS, Schriften, Daten eingebettet) |
| `.github/workflows/` | CI, Release, wöchentliche Fassungsprüfung |

### Lokale Entwicklung

Voraussetzung: Node.js 22 oder neuer, für die Oberflächentests Chrome oder das Chromium von Playwright.

```sh
npm ci
npm run build                       # dist/sgk-navigator.html (Version = heutiges Datum)
node build.mjs --version 2026.12.12 --out dist/SGK-Navigator.html   # mit fester Version
node scripts/build-site.mjs --version 2026.12.12 --file dist/SGK-Navigator.html   # Download-Seite nach dist/site/
```

Build-Optionen (Kopf von `build.mjs`): `--update-source none|default|manifest:<URL>[+github-release:<owner>/<repo>]|github-release:<owner>/<repo>`,
`--version JJJJ.MM.TT[-n]`, `--out <pfad>`, Testvarianten `--drop-stage`, `--drop-work-stage`.

### Tests

```sh
npm run test:unit        # Kern, Anwendung (Node), Modul Verhandlung
npm run test:app:ci      # Oberflächentests wie in der CI (ohne Netz, ohne Dateien ausserhalb des Repos)
npm run test:app         # alle Oberflächentests, auch @netz (Live-Abfragen) und @daten (raw/, raw-neg/, test/app/fixtures-live/)
```

Ohne `/usr/bin/google-chrome`: `npx playwright install chromium` und `SGK_CHROME=bundled` setzen. Tests, die Dateien aus `raw/`,
`raw-neg/` oder `test/app/fixtures-live/` brauchen, überspringen sich ohne diese Dateien.

### Release erstellen

Kurz: GitHub → «Actions» → «Release» → «Run workflow», Version (leer = heutiges Datum, sonst z. B. `2026.12.12`) und optional «Was ist neu» eintragen. Der
Workflow baut die Datei aus dem Quellcode, testet, legt das Release mit `SGK-Navigator.html` an und aktualisiert die Download-Seite
samt `version.json`. Die gebaute Datei wird nie ins Repo committet. Einzelheiten in [MAINTAINING.md](MAINTAINING.md#release-erstellen).

### Wöchentliche Fassungsprüfung

Der Workflow «Fassungen prüfen» (`.github/workflows/fassungen.yml`) läuft jeden Montag früh und auf Knopfdruck. Er fragt für alle
fünf Rechtsakte beim SPARQL-Endpunkt des Amts für Veröffentlichungen nach neuen konsolidierten Fassungen und Akten (dieselben
Abfragen und dieselbe Logik wie «Aktualisieren» im Tool) und eröffnet bzw. aktualisiert das Issue «Neue Fassungen verfügbar».
Lokal: `node scripts/check-fassungen.mjs --dry-run` (hinter einem Proxy mit `NODE_USE_ENV_PROXY=1`).

### Neue Fassungen pflegen

Die Quelldateien von EUR-Lex liegen in `raw/` (nicht im Repo, rund 100 MB, jederzeit neu ladbar):

- weitere Rechtsakte (EES, ETIAS, VIS, IO): `node scripts/build-work.mjs all` lädt fehlende Fassungen selbst und baut
  `data/works/*`; prüfen mit `node scripts/validate-works.mjs`.
- SGK: `node scripts/fetch-raw-sgk.mjs` lädt die Dateien, `node scripts/build-data.mjs` baut `data/dataset.json`, `node scripts/validate.mjs` prüft.
  Eine neue konsolidierte Fassung des SGK wird in `scripts/build-data.mjs` (`buildAll`) als weiterer Stand eingetragen.
- Modul Verhandlung: `node scripts/neg/fetch-raw.mjs` lädt die öffentlichen Ratsdokumente nach `raw-neg/`.
- Testdateien für die Upload-Tests: `node test/app/tools/fetch-eurlex.mjs …` (Chrome, Netz) nach `test/app/fixtures-live/`.

Schritt für Schritt: [MAINTAINING.md, «Neue Fassung einbauen»](MAINTAINING.md#neue-fassung-einbauen).

### Lizenz und Rechtstexte

- **Code:** Für den Programmcode ist noch keine Lizenz festgelegt. Ohne Lizenz gelten die üblichen Urheberrechte; der Code ist
  einsehbar, aber nicht zur Weiterverwendung freigegeben.
- **Schriften:** IBM Plex unter der SIL Open Font License 1.1 (`src/export/fonts/OFL.txt`). Weitere Drittkomponenten:
  [THIRD_PARTY.md](THIRD_PARTY.md).
- **EU-Rechtstexte:** © Europäische Union, EUR-Lex. Wiederverwendung nach dem Beschluss 2011/833/EU der Kommission. Nur die im
  Amtsblatt der Europäischen Union veröffentlichten Rechtstexte sind verbindlich.
