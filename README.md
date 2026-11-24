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

Die **[Produktdokumentation](https://sem-sgg.github.io/sgk-navigator/dokumentation.html)** beschreibt den SGK-Navigator in Deutsch, Französisch und Italienisch: Funktionen, Bedienung, Netzzugriffe und Datenregel. Sie liegt auf der Download-Seite und erscheint mit jeder Release neu. Ihre Quelle ist `docs/sgk-navigator-dokumentation.html`.

### Datenstand

Der Datenstand je Rechtsakt steht im Tool unter «Info» und auf der [Download-Seite](https://sem-sgg.github.io/sgk-navigator/).
Grundlage sind die Amtsblattfassungen und die konsolidierten Fassungen von EUR-Lex. Neuere konsolidierte Fassungen lassen sich im
Tool unter «Aktualisieren» selbst laden; eine wöchentliche Prüfung in diesem Repository baut sie zudem ein und schlägt sie mit
einer neuen Version zur Veröffentlichung vor.

### Neue Versionen

Ist eine neue Version erschienen, zeigt das Tool oben einen Hinweis mit den Links «Neue Version herunterladen» und «Was ist neu».
Dafür fragt es höchstens einmal pro Tag die Datei `version.json` der Download-Seite ab (GitHub Pages), ersatzweise die
Release-Angabe bei GitHub. Aus dem Tool werden dabei keine Daten übertragen. Die Suche lässt sich unter «Info» abschalten.

### Keine amtliche Veröffentlichung

Das Tool ist keine amtliche Veröffentlichung. Massgebend ist allein das Amtsblatt der Europäischen Union. Berechnete und
rekonstruierte Stände sind im Tool als solche gekennzeichnet.

### Kontakt

Sektion Grundlagen Grenze (SGG), Staatssekretariat für Migration SEM.

Fehler, fehlende Fassungen und Änderungswünsche lassen sich unter [Issues](https://github.com/SEM-SGG/sgk-navigator/issues/new/choose) melden.
Dafür ist ein GitHub-Konto nötig. Issues sind öffentlich: Es gilt die [Datenregel](#datenregel). Im Navigator führt das
Käfersymbol rechts neben dem Produktnamen und dem Etikett «BETA» (während der Erprobung) direkt dorthin.
Ohne GitHub-Konto: [sektion-grenze@sem.admin.ch](mailto:sektion-grenze@sem.admin.ch).

### Datenregel

> **Datenregel der SGG**
>
> 1. **Lokal ist jede Klassifizierungsstufe erlaubt.** Was ein Werkzeug ausschliesslich auf deinem Gerät oder lokal im Browser verarbeitet und nicht ins Internet sendet, darfst du unabhängig von der Klassifizierungsstufe bearbeiten.
> 2. **INTERN oder höher geht nicht ins Internet.** Dokumente und Inhalte mit dem Vermerk INTERN, VERTRAULICH oder GEHEIM lädst du nicht ins Internet und teilst oder verarbeitest sie nicht über externe Cloud-Dienste. Dazu gehören KI-Dienste (zum Beispiel Claude und ChatGPT), GitHub (Repositories, Issues, Pull Requests) und Online-Speicher ausserhalb der Arbeitsumgebung des Bundes.
> 3. **Personendaten.** Unabhängig von der Klassifizierung gehören keine besonders schützenswerten Personendaten und keine Falldaten zu Personen aus Verfahren ins Internet oder in externe Cloud-Dienste.
> 4. **Arbeitsumgebung des Bundes.** Für die vom Bund bereitgestellten Dienste (zum Beispiel Teams, Outlook, SharePoint) gelten die Weisungen des SEM.
>
> Als klassifiziert gilt, was einen Klassifizierungsvermerk trägt. Die Regel ergänzt die Weisungen des SEM und ersetzt sie nicht.

Für den SGK-Navigator heisst das: Die Rechtstexte sind öffentlich. Eigene Inhalte – besonders Positionen, Konsultationen und
Notizen im Modul Verhandlung, die dort eingelesenen Rückmeldungen zur Konsultation (Word-Dateien), hochgeladene Fassungen und
der Sammelkorb – liest und speichert der Navigator nur im Speicher deines Browsers; sie fallen unter Punkt 1. Die Suche nach
neuen Versionen ruft nur die Versionsangabe `version.json` auf GitHub Pages ab, ersatzweise die Angabe zur neuesten Release
bei `api.github.com`; dabei überträgt sie keine Inhalte aus dem Navigator. «Aktualisieren» sendet nur CELEX-Nummern der
Rechtsakte an den Abfragedienst (SPARQL-Endpunkt) des Amts für Veröffentlichungen der EU. Exportierte Projektdateien, Word-
und PDF-Dateien mit dem Vermerk INTERN oder höher gibst du nur in der Arbeitsumgebung des Bundes weiter (Punkt 4). Issues und
Pull Requests sind öffentlich (Punkt 2); besonders schützenswerte Personendaten und Falldaten zu Personen aus Verfahren gehören
auch dann nicht hinein, wenn sie keinen Klassifizierungsvermerk tragen (Punkt 3).

### En bref (français)

Le SGK-Navigator suit les modifications du code frontières Schengen et d’autres règlements relatifs aux frontières et aux visas
(EES, ETIAS, VIS, interopérabilité). Il s’agit d’un seul fichier HTML qui s’ouvre dans Chrome ou Edge, sans installation.
[Page de téléchargement](https://sem-sgg.github.io/sgk-navigator/) · [Télécharger directement](https://github.com/SEM-SGG/sgk-navigator/releases/latest/download/SGK-Navigator.html)
(aucun compte GitHub nécessaire). Ouvrir les nouvelles versions dans le même navigateur afin de conserver les données. Pas une
publication officielle : seul le Journal officiel de l’Union européenne fait foi. Contact : Section Base Frontières,
Secrétariat d’État aux migrations SEM, [sektion-grenze@sem.admin.ch](mailto:sektion-grenze@sem.admin.ch).
[Documentation du produit](https://sem-sgg.github.io/sgk-navigator/dokumentation.html) (allemand, français, italien).

---

## Für Pflegende

Die Pflege geht im Browser: **[MAINTAINING.md](MAINTAINING.md)** beschreibt Schritt für Schritt, wie du eine neue Version
veröffentlichst, wie du einen Pull Request (Änderungsvorschlag auf GitHub) des Workflows «Fassungen» prüfst und was bei
einem fehlgeschlagenen Lauf zu tun ist. Was Programmcode verlangt, erledigt ein Agent (ein KI-Werkzeug wie Claude Code im
Browser oder Codex mit angebundenem Repository) nach **[AGENTS.md](AGENTS.md)** (mit kopierbaren Aufträgen). Änderungen je
Version stehen in [CHANGELOG.md](CHANGELOG.md). Es folgt die Übersicht für die Arbeit mit Node.js.

### Aufbau

| Ordner / Datei | Inhalt |
| --- | --- |
| `src/app/` | Oberfläche (Preact/htm), Texte DE/FR in `src/app/i18n/`, Quelle für neue Versionen in `src/app/config/update-source.js` |
| `src/core/` | Kern: Parser für EUR-Lex-HTML, Datenmodell, Verweise, Anwendbarkeit (Browser und Node) |
| `src/neg/`, `src/export/` | Modul Verhandlung; Export nach Word und PDF |
| `data/` | Datensätze (`dataset.json` SGK, Stände ab s08 in `sgk-fassungen.json`, `works/` weitere Rechtsakte, `acts.json`, `zur-kenntnis.txt`, Zusatzdaten), Prüfberichte und Notizen |
| `scripts/` | Datenpipeline (`build-data.mjs` SGK, `build-work.mjs` weitere Werke, `validate*.mjs`), Download-Seite, Fassungsprüfung und Einbau (`check-fassungen.mjs`, `apply-fassungen.mjs`, `fassungen-pr.mjs`), Version und Changelog (`release-info.mjs`, `check-dokumentation.mjs`) |
| `site/` | Vorlage der Download-Seite (GitHub Pages) |
| `test/` | Tests: `core` und `neg` (Node), `app` (Node und Playwright) |
| `design/carbon/` | Design System (Carbon, IBM Plex) |
| `docs/` | Produktdokumentation als eigenständige HTML-Datei (DE, FR, IT), auf der Download-Seite unter `dokumentation.html` |
| `docs/entwicklung/` | Spezifikationen und Statusberichte aus der Entwicklung |
| `build.mjs` | baut die eine HTML-Datei (JS, CSS, Schriften, Daten eingebettet) |
| `.github/workflows/` | CI, Release, Fassungen (wöchentliche Prüfung und Einbau) |

### Lokale Entwicklung

Voraussetzung: Node.js 22 oder neuer, für die Oberflächentests Chrome oder das Chromium von Playwright.

```sh
npm ci
npm run build                       # dist/sgk-navigator.html (Version = heutiges Datum)
node build.mjs --version 2026.12.12 --out dist/SGK-Navigator.html   # mit fester Version
node scripts/build-site.mjs --version 2026.12.12 --file dist/SGK-Navigator.html   # Download-Seite nach dist/site/
node scripts/release-info.mjs       # CHANGELOG.md prüfen, Version des obersten Abschnitts
node scripts/check-dokumentation.mjs [--fix]   # Version in der Produktdokumentation prüfen bzw. setzen
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

### Release

Eine Release entsteht von selbst, wenn auf `main` ein neuer oberster Abschnitt in `CHANGELOG.md` zusammengeführt ist (Workflow
«Release», `.github/workflows/release.yml`). Die Version richtet sich nach dem Datum (`JJJJ.MM.TT`, zweite am selben Tag
`JJJJ.MM.TT-2`); verteilte Kopien lesen nur diese Form. Vor der Veröffentlichung prüft der Lauf den Changelog, die Version in der
Produktdokumentation und die Tests. Er legt die Release mit `SGK-Navigator.html` an und stellt Download-Seite, `version.json`
und `dokumentation.html` auf GitHub Pages bereit. Die gebaute Datei wird nie ins Repository committet. Zusatzweg: **Actions** →
**Release** → **Run workflow** (Feld für die Version leer = oberster Abschnitt). Einzelheiten in [MAINTAINING.md](MAINTAINING.md#neue-version-veröffentlichen).

### Fassungen: Prüfung und Einbau

Der Workflow «Fassungen» (`.github/workflows/fassungen.yml`) läuft jeden Montag früh und auf Knopfdruck. Er fragt für alle
fünf Rechtsakte beim SPARQL-Endpunkt des Amts für Veröffentlichungen nach neuen konsolidierten Fassungen und Akten (dieselben
Abfragen und dieselbe Logik wie «Aktualisieren» im Tool) und führt das Issue «Neue Fassungen auf EUR-Lex». Neue konsolidierte
Fassungen baut er mit `scripts/apply-fassungen.mjs` ein und eröffnet mit `scripts/fassungen-pr.mjs` einen Pull Request mit
Befund, geänderten Bestimmungen je Sprache, Prüfberichten und Tests. Neue Akte und Vorschläge erscheinen zur Information; was in
`data/zur-kenntnis.txt` steht, gilt als zur Kenntnis genommen. Lokal ohne Wirkung:
`node scripts/check-fassungen.mjs --dry-run --out befund.json` (hinter einem Proxy mit `NODE_USE_ENV_PROXY=1`), danach
`node scripts/apply-fassungen.mjs --befund befund.json --out <ordner>`.

### Neue Fassungen von Hand pflegen

Die Quelldateien von EUR-Lex liegen in `raw/` (nicht im Repo, rund 100 MB, jederzeit neu ladbar):

- weitere Rechtsakte (EES, ETIAS, VIS, IO): `node scripts/build-work.mjs all` lädt fehlende Fassungen selbst und baut
  `data/works/*`; prüfen mit `node scripts/validate-works.mjs`.
- SGK: `node scripts/fetch-raw-sgk.mjs` lädt die Dateien, `node scripts/build-data.mjs` baut `data/dataset.json` (Bilder
  mit dem Paket `sharp`), `node scripts/validate.mjs` prüft. Eine neue konsolidierte Fassung des SGK ist ein weiterer Eintrag in
  `data/sgk-fassungen.json`.
- Datentests mit `raw/`: zuerst `node scripts/forms/extract-images.mjs`, dann `npm run test:core`.
- Modul Verhandlung: `node scripts/neg/fetch-raw.mjs` lädt die öffentlichen Ratsdokumente nach `raw-neg/`.
- Testdateien für die Upload-Tests: `node test/app/tools/fetch-eurlex.mjs …` (Chrome, Netz) nach `test/app/fixtures-live/`.

### Lizenz und Rechtstexte

- **Code:** Für den Programmcode ist noch keine Lizenz festgelegt. Ohne Lizenz gelten die üblichen Urheberrechte; der Code ist
  einsehbar, aber nicht zur Weiterverwendung freigegeben.
- **Schriften:** IBM Plex unter der SIL Open Font License 1.1 (`src/export/fonts/OFL.txt`). Weitere Drittkomponenten:
  [THIRD_PARTY.md](THIRD_PARTY.md).
- **EU-Rechtstexte:** © Europäische Union, EUR-Lex. Wiederverwendung nach dem Beschluss 2011/833/EU der Kommission. Nur die im
  Amtsblatt der Europäischen Union veröffentlichten Rechtstexte sind verbindlich.
