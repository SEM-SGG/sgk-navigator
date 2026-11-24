# Arbeitsanleitung für Agenten

Diese Datei gilt für Codex, Claude Code und andere Agenten, die im Repository `SEM-SGG/sgk-navigator` arbeiten.

Der SGK-Navigator zeigt Änderungen am Schengener Grenzkodex (SGK) und an der EES-, ETIAS-, VIS- und Interoperabilitäts-Verordnung je Bestimmung. Er ist eine einzelne HTML-Datei zum Herunterladen; die Daten stammen von EUR-Lex und vom Amt für Veröffentlichungen der EU (Cellar). Nutzende und Pflegende sind Fachpersonen der Sektion Grundlagen Grenze (SGG) im Staatssekretariat für Migration (SEM). Sie arbeiten nur im Browser, ohne Kommandozeile und ohne lokale Installation. Sie geben dir einen der Aufträge aus dem Abschnitt «Abläufe» und prüfen danach deinen Pull Request. Schreibe deshalb jede Beschreibung so, dass eine Person ohne GitHub-Erfahrung sie versteht.

Weitere Quellen: [`README.md`](README.md) (Aufbau, Befehle, Datenregel), [`MAINTAINING.md`](MAINTAINING.md) (Weg der Fachperson im Browser), [`CHANGELOG.md`](CHANGELOG.md), [`docs/entwicklung/`](docs/entwicklung/) (Spezifikationen und Entscheide), [`data/APPLICABILITY_NOTES.md`](data/APPLICABILITY_NOTES.md) und [`data/ACTS_NOTES.md`](data/ACTS_NOTES.md) (Herleitung der Anwendbarkeit), [`THIRD_PARTY.md`](THIRD_PARTY.md).

## Grundregeln

- **Sprache:** Schweizer Hochdeutsch ohne «ß», mit echten Umlauten, in Code-Kommentaren, Commits, Pull Requests und Dokumentation. Die Oberfläche gibt es in Deutsch und Französisch: Jeder Text in `src/app/i18n/de.js` hat denselben Schlüssel in `fr.js` (ein Test prüft das). Die Download-Seite ist zweisprachig (DE, FR), die Produktdokumentation dreisprachig (DE, FR, IT). Die Sektion heisst «Sektion Grundlagen Grenze (SGG)», «Section Base Frontières», «Sezione Basi Frontiera».
- **Zweig:** Lege jeden Zweig ab `origin/main` an (`git fetch origin` und `git switch -c <zweig> origin/main`). Prüfe vorher mit `git status`, dass nichts Fremdes im Arbeitsbereich liegt.
- **Pull Request:** Eröffne einen Pull Request gegen `main`. Pushe nie direkt auf `main`, nutze nie `--force`, führe nie selbst zusammen. Eröffne keinen Pull Request auf einem anderen Pull Request; die Basis ist immer `main`.
- **Zweig des Workflows:** Den Zweig `fassungen/einbau` schreibt der Workflow «Fassungen» und überschreibt ihn bei jedem neuen Einbau. Pushe nicht darauf.
- **Keine Personendaten:** keine Personennamen, keine privaten E-Mail-Adressen, keine lokalen Pfade in Dateien, Commits oder Pull Requests. Die Funktionsadresse `sektion-grenze@sem.admin.ch` ist erlaubt.
- **Auftrag:** Ändere nur, was der Auftrag verlangt. Was dir sonst auffällt, nennst du im Pull Request unter «Von der prüfenden Person zu kontrollieren» oder als offene Frage.
- **Wortlaut von Rechtsakten:** Er stammt ausschliesslich von EUR-Lex bzw. Cellar, geladen und verarbeitet über die Skripte (`scripts/fetch-raw-sgk.mjs`, `scripts/build-data.mjs`, `scripts/build-work.mjs`, `scripts/apply-fassungen.mjs`). Bearbeite `data/dataset.json`, `data/works/*.dataset.json`, `data/assets.json`, `raw/` und Wortlaut nie von Hand. Schwäche keine Prüfung ab, damit sie besteht.
- **Fachangaben:** Angaben zur Anwendbarkeit (ab wann eine Änderung gilt, auch für die Schweiz), Kurzbezeichnungen und Bewertungen in `data/acts.json` und `data/derogations.json` entscheidest du nie selbst. Fehlen sie im Auftrag, frage die Fachperson oder nenne sie im Pull Request als offen. Titel, Nummern, Amtsblatt-Fundstellen und Daten übernimmst du wörtlich von EUR-Lex.
- **Datenregel:** Issues und Pull Requests sind öffentlich. Übernimm keine Inhalte mit dem Vermerk INTERN, VERTRAULICH oder GEHEIM, keine besonders schützenswerten Personendaten und keine Falldaten aus Verfahren in Dateien, Commits oder Pull Requests (README, Abschnitt «Datenregel»). Enthält ein Issue solche Inhalte, zitiere sie nicht und weise im Pull Request darauf hin.
- **Netzzugriff des Navigators:** Der Navigator ruft nur den SPARQL-Endpunkt `publications.europa.eu` (Prüfung auf neue Fassungen, nur auf Knopfdruck) und die Versionsangabe auf `sem-sgg.github.io` (ersatzweise `api.github.com`) ab; die Content-Security-Policy in `build.mjs` lässt nichts anderes zu. Füge keine Abrufe hinzu. Ein Link, den die Person anklickt, ist kein Abruf und ist erlaubt.
- **Produktdokumentation:** Jede Änderung an Funktion, Oberfläche oder Bedienweg zieht die Produktdokumentation `docs/sgk-navigator-dokumentation.html` in allen drei Sprachen nach, dazu je nach Änderung die Anleitung im Werkzeug (`guide.*` in `src/app/i18n/`), `README.md`, die Download-Seite (`site/index.html`) und `MAINTAINING.md`. Die Dokumentation erscheint auf der Download-Seite unter `https://sem-sgg.github.io/sgk-navigator/dokumentation.html`. Sie ist zu gross für den Editor von GitHub im Browser; Änderungen daran macht immer ein Agent.
- **Version und Changelog:** Die Version steht im obersten Abschnitt von `CHANGELOG.md`. Ein Merge auf `main` mit einem neuen obersten Abschnitt veröffentlicht automatisch eine Release und die Download-Seite (Workflow «Release»). Lege einen neuen Abschnitt an, sobald sich der Navigator, die Download-Seite oder die eingebetteten Daten ändern. Die Version hat die Form `JJJJ.MM.TT` (Datum, an dem du den Pull Request vorbereitest), bei einer zweiten Version am selben Tag `JJJJ.MM.TT-2`. Sie muss neuer sein als die Version darunter. Bereits verteilte Kopien des Navigators lesen nur diese Form; ändere das Schema nicht.

  So legst du die Version an:

  1. Füge zuoberst in `CHANGELOG.md` (unter dem einleitenden Absatz) einen Abschnitt `## <version> (<Tag>. <Monat> <Jahr>)` ein, zum Beispiel `## 2026.12.02 (2. Dezember 2026)`, mit je einer Zeile `- ` pro Änderung, verständlich für Nutzende. Auf Wunsch folgt ein Unterabschnitt `### Français` mit dem französischen Text für die Download-Seite. Der Abschnitt wird zum Text der Release.
  2. Setze die Version in der Produktdokumentation: `node scripts/check-dokumentation.mjs --fix`.

  Lautet der Auftrag, in einem bestehenden Pull Request die Version in der Produktdokumentation nachzuführen (`MAINTAINING.md`, «Neue Version veröffentlichen», Schritt 6), führst du auf dessen Zweig `node scripts/check-dokumentation.mjs --fix` aus, committest und pushst ohne `--force`. Änderungen nur an `MAINTAINING.md`, `AGENTS.md`, Tests, Skripten der Pflege oder Workflows brauchen keine neue Version. Eine Änderung an `docs/sgk-navigator-dokumentation.html` oder `site/` ohne neue Version stellt die Download-Seite nach dem Merge neu bereit.

## Prüfbefehle

Diese Befehle laufen vor jedem Pull Request, in dieser Reihenfolge, im Wurzelverzeichnis. Sie entsprechen dem Workflow «CI» (`.github/workflows/ci.yml`). Vorausgesetzt ist Node.js 22.

| Befehl | Erwartetes Ergebnis |
| --- | --- |
| `node scripts/release-info.mjs` | `Version <x>: Abschnitt in CHANGELOG.md vorhanden, Datei SGK-Navigator.html.` |
| `node scripts/check-dokumentation.mjs` | `docs/sgk-navigator-dokumentation.html: Version <x> an allen 19 Stellen.` |
| `npm ci` | endet ohne Fehler |
| `npm run test:core` | `fail 0`; ohne Ordner `raw/` 18 übersprungen |
| `npm run test:app:unit` | `fail 0`; ohne Ordner `test/app/fixtures-live/` 9 übersprungen |
| `npm run test:neg` | `fail 0`; ohne Ordner `raw-neg/` 9 übersprungen |
| `node build.mjs --version <x> --out dist/SGK-Navigator.html` | `dist/SGK-Navigator.html: … MB \| Daten: data/ …`, ohne `WARNUNG` |
| `node scripts/build-site.mjs --version <x> --file dist/SGK-Navigator.html --out dist/site` | `Download-Seite dist/site: Version <x> …, Produktdokumentation dokumentation.html` |
| `npm run test:app:ci` | `105 passed` (oder mehr, wenn du Tests ergänzt hast), kein `failed` |

Die Oberflächentests erwarten Google Chrome unter `/usr/bin/google-chrome` oder das Chromium von Playwright (`npx playwright install chromium` und `SGK_CHROME=bundled`). Fehlt beides, schreibe das im Pull Request unter «Testing»; der Lauf «CI» führt sie aus.

Wenn du Daten oder Code in `src/core/` oder `scripts/` der Datenpipeline änderst, lädst du zusätzlich die Rohdaten und führst die Datentests aus:

```
node scripts/fetch-raw-sgk.mjs
node scripts/build-work.mjs all
node scripts/forms/extract-images.mjs
npm run test:core
```

Erwartet: `fail 0`, `skipped 0`. `git status` zeigt danach keine Änderung an `data/dataset.json` und `data/works/`, ausser du hast die Daten absichtlich neu gebaut. Ist `eur-lex.europa.eu` oder `publications.europa.eu` aus deiner Umgebung nicht erreichbar, schreibe das im Pull Request.

Nach dem Eröffnen wartest du den Lauf «CI / Tests und Build» im Pull Request ab und behebst, was rot ist.

## Abläufe

Jeder Ablauf beginnt mit dem Auftrag, den eine Fachperson kopiert und dir gibt. Dabei ersetzt sie `…` durch die Nummer des Pull Requests oder des Issues, das Datum oder die geforderten Fachangaben.

### Gescheiterter Einbau neuer Fassungen

```
Der Einbau der neuen Fassungen ist gescheitert. Pull Request #… im Repository SEM-SGG/sgk-navigator ist ein Entwurf: Bring ihn in Ordnung. Halte dich an AGENTS.md, Ablauf «Gescheiterter Einbau neuer Fassungen».
```

Hintergrund: Der Workflow «Fassungen» (`.github/workflows/fassungen.yml`) prüft jeden Montag mit `scripts/check-fassungen.mjs`, führt das Issue «Neue Fassungen auf EUR-Lex» nach, baut neue konsolidierte Fassungen mit `scripts/apply-fassungen.mjs` ein und eröffnet mit `scripts/fassungen-pr.mjs` einen Pull Request auf dem Zweig `fassungen/einbau`. Scheitert der Einbau, eine Prüfung oder ein Test, ist der Pull Request ein Entwurf mit dem Vermerk «Nicht zusammenführen».

1. Lies den Entwurf: die Gründe im Kasten am Anfang, dann «Befund», «Was sich ändert», «Prüfberichte», «Übrige Stände» und «Tests». Lies den roten Lauf «Fassungen» (`gh run list --workflow fassungen.yml`, `gh run view <lauf> --log-failed`) und das Artefakt «einbau» des Laufs mit `einbau.json`, `tests.json` und `pr.md` (`gh run download <lauf> -n einbau`).
2. Liegt die Ursache bei EUR-Lex, Cellar oder im Netz (zum Beispiel `nicht ladbar`, `HTTP 503`, Zeitüberschreitung), änderst du nichts. Antworte der Fachperson, dass sie den Workflow unter **Actions** über **Run workflow** neu startet (`MAINTAINING.md`, Abschnitt «Wenn der Pull Request ein Entwurf ist», Schritt 3).
3. Sonst legst du einen Zweig ab `origin/main` an, zum Beispiel `agent/fassungen-2026-12-07`.
4. Lade den Befund (`befund.json` steht nicht im Artefakt; erzeuge ihn mit `node scripts/check-fassungen.mjs --dry-run --out befund.json`) und führe `npm ci` und `node scripts/apply-fassungen.mjs --befund befund.json --out <ordner>` aus. Das Skript lädt die Rohdaten, baut alle Datensätze, erzeugt die Prüfberichte, legt die Version und den Abschnitt in `CHANGELOG.md` an und setzt die Version in der Produktdokumentation. Das Ergebnis steht in `<ordner>/einbau.json`.
5. Scheitert ein Schritt, eine Prüfung (`validation.passed` ist `false`) oder meldet `foreign` eine inhaltliche Änderung an einem bestehenden Stand, suche die Ursache im Code: Parser `src/core/parser.js`, Datenmodell `src/core/model.js`, Bau `scripts/build-data.mjs` (SGK, Stände ab s08 aus `data/sgk-fassungen.json`), `scripts/build-work.mjs` (weitere Rechtsakte), Prüfskripte `scripts/validate.mjs` und `scripts/validate-works.mjs`. Behebe sie dort und belege die Korrektur mit einem Test in `test/core/` oder `test/app/`. Setze vor einem zweiten Lauf `CHANGELOG.md`, `docs/sgk-navigator-dokumentation.html`, `data/` und `scripts/out/works/` auf den Stand von `origin/main` zurück (`git checkout origin/main -- <dateien>`), sonst steigt die Version zweimal.
6. Schlagen Tests fehl, die eine feste Zahl von Ständen oder die bisher jüngste Fassung erwarten (zum Beispiel `02016R0399-20251012` in `test/app/`), passe sie an die neue Fassung an und begründe jede Anpassung im Pull Request. Schwäche keine Prüfung ab.
7. Lies `data/VALIDATION.md` und `data/VALIDATION_WORKS.md`. Jede gestiegene Zahl braucht dort eine Begründung.
8. Führe die Prüfbefehle aus, dazu die Datentests mit Rohdaten.
9. Committe die Dateien aus `COMMIT_FILES` in `scripts/fassungen-pr.mjs`, dazu deine Korrekturen und Tests. `raw/` ist von Git ausgeschlossen.
10. Eröffne den Pull Request gegen `main`. Titel wie der Workflow (Feld `subject` in `einbau.json`), zum Beispiel «SGK-Navigator 2026.12.07: SGK-Fassung vom 1. Dezember 2026 nachgeführt». In der Beschreibung nennt «Ausgangslage» den Entwurf und den Grund, «Von der prüfenden Person zu kontrollieren» übernimmt «Befund», «Was sich ändert», «Prüfberichte» aus `pr.md` und den Text im Changelog. Schreibe dazu: «Nach dem Zusammenführen den Entwurf #… mit **Close pull request** schliessen.» Schliesse mit `Closes #<nummer>` für das Issue «Neue Fassungen auf EUR-Lex», ausser es nennt noch Akte zur Information.

### Neue Fassung des SGK einbauen

```
Baue die neue Fassung des SGK vom … ein. Halte dich an AGENTS.md, Ablauf «Neue Fassung des SGK einbauen».
```

Den Normalfall erledigt der Workflow «Fassungen» selbst: Er trägt die Fassung als weiteren Stand in `data/sgk-fassungen.json` ein (Stand, CELEX, Datum, Akt aus der Liste der Änderungsakte von EUR-Lex, Herkunftsangabe DE, FR, EN) und baut sie mit `scripts/build-data.mjs` ein. Diesen Auftrag gibt die Fachperson, wenn der Workflow das nicht kann, zum Beispiel weil eine Fassung mehrere Änderungsakte zusammenfasst und je Akt ein eigener Stand nötig ist, oder ohne Workflow.

1. Lege einen Zweig ab `origin/main` an. Bestimme die CELEX-Nummer der Fassung, Form `02016R0399-JJJJMMTT`, und prüfe auf EUR-Lex, dass sie in Deutsch, Französisch und Englisch vorliegt.
2. Einfacher Fall (ein neuer Akt): `node scripts/check-fassungen.mjs --dry-run --out befund.json` und `node scripts/apply-fassungen.mjs --befund befund.json --out <ordner>`. Das Skript trägt den Stand ein und baut alles. Lies `<ordner>/einbau.json`, besonders `fachangaben`.
3. Fasst die Fassung mehrere Akte zusammen und verlangt die Fachperson einen Stand je Akt, folgt die Rekonstruktion dem Muster der Stände s03 bis s06 in `scripts/reconstruct.mjs`. Das ist ein Umbau; beschreibe Vorgehen und Prüfung im Pull Request ausführlich.
4. Fehlt der Akt des neuen Stands in `data/acts.json`, erfasst du ihn nach dem Ablauf «Akt erfassen». Die Anwendbarkeit muss die Fachperson liefern.
5. Ergänze in `scripts/validate.mjs` bei `AMEND` die ändernden Bestimmungen des neuen Akts (zum Beispiel `['art_1', 'anx']`), damit die Umkehrprüfung auch ihn prüft.
6. Führe die Prüfbefehle und die Datentests mit Rohdaten aus. Lies `data/VALIDATION.md`.
7. Eröffne den Pull Request. Unter «Von der prüfenden Person zu kontrollieren» nennst du Stand, Fassung, Akt, die geänderten Bestimmungen je Sprache und die Herkunftsangabe, die der Navigator zeigt.

### Akt erfassen

```
Erfasse den Akt … in data/acts.json im Repository SEM-SGG/sgk-navigator. Die Anwendbarkeit lautet: … (ab wann, Fundstelle; abweichende Daten einzelner Bestimmungen). Die Kurzbezeichnung lautet: … (DE), … (FR), … (EN). Halte dich an AGENTS.md, Ablauf «Akt erfassen».
```

Ein Akt in `data/acts.json` (SGK) erscheint im Navigator in der Liste der Akte mit Anwendbarkeit. Die weiteren Rechtsakte haben eigene Listen `data/works/<werk>.acts.json`, die `scripts/build-work.mjs` aus EUR-Lex erzeugt (Anwendbarkeit dort «nicht erhoben»); erfasse dort nur, wenn der Auftrag es ausdrücklich verlangt.

1. Lege einen Zweig ab `origin/main` an.
2. Lies zwei vorhandene Einträge derselben Art (`kind`: `amendment`, `corrigendum`, `derogation`, `implementing`, `proposal`) und `data/ACTS_NOTES.md`. Lege den neuen Eintrag nach diesem Muster an.
3. Übernimm wörtlich von EUR-Lex (SPARQL oder Seite des Akts): `celex`, `number`, `title` in DE, FR, EN, `adopted`, `published`, `oj`, `inForce`, `eurlex`, `sources`. Für `changes` nutzt du die Marker der konsolidierten Fassung, wie bei den vorhandenen Einträgen.
4. Übernimm aus dem Auftrag, ohne etwas zu ergänzen: `application` (Status, Datum, Fundstelle `basis` und Hinweis `note` in DE, FR, EN) und `topic` (Kurzbezeichnung in DE, FR, EN). Fehlt eine dieser Angaben oder ist sie mehrdeutig, frag nach, bevor du den Pull Request eröffnest. Übersetzungen ins Französische und Englische legst du im Pull Request zur Prüfung vor.
5. Setze `confidence` auf `check` und schreibe in `checkNote`, welche Angaben die Fachperson geliefert hat.
6. Lege eine neue Version an (Abschnitt «Grundregeln», «Version und Changelog»).
7. Führe die Prüfbefehle aus. Mit Rohdaten zeigt `node scripts/validate.mjs` im Abschnitt «Abgleich mit data/acts.json» den neuen Akt.
8. Eröffne den Pull Request. Unter «Von der prüfenden Person zu kontrollieren» zeigst du den neuen Eintrag als Tabelle (Feld, Wert, Quelle: EUR-Lex oder Auftrag). Kommt der Auftrag aus einem Entwurf des Workflows «Fassungen», schreibe: «Nach dem Zusammenführen unter **Actions** → **Fassungen** → **Run workflow** den Workflow neu starten; er baut den Entwurf #… mit dem neuen Eintrag neu.»

### Fehler aus einem Issue beheben

```
Behebe den Fehler aus Issue #… im Repository SEM-SGG/sgk-navigator. Halte dich an AGENTS.md, Ablauf «Fehler aus einem Issue beheben».
```

1. Lies das Issue mit allen Kommentaren (`gh issue view <nummer> --comments`). Beachte die Datenregel: Enthält das Issue klassifizierte Inhalte oder Personendaten, zitiere sie nicht und weise im Pull Request darauf hin.
2. Lege einen Zweig ab `origin/main` an.
3. Stelle den Fehler nach: Version, Browser, Rechtsakt, Bestimmung und Sprache stehen im Issue. Baue mit `npm run build` und öffne `dist/sgk-navigator.html` mit der Adresse aus dem Issue (der Teil ab `#/`).
4. Betrifft der Fehler den Wortlaut, vergleiche mit der Datei von EUR-Lex in `raw/`. Steht der Fehler schon bei EUR-Lex, änderst du keinen Wortlaut; erkläre das im Pull Request oder in deiner Antwort an die Fachperson.
5. Schreibe zuerst einen Test, der den Fehler zeigt: `test/core/` für Parser, Modell und Verweise, `test/app/unit.test.mjs` für reine Funktionen der Oberfläche, `test/app/*.spec.mjs` für das Verhalten im Browser, `test/neg/` für das Modul Verhandlung. Behebe dann den Fehler.
6. Ändert sich ein Text der Oberfläche, änderst du ihn in Deutsch und Französisch. Ändert sich ein Bedienweg, ziehst du die Produktdokumentation und die Anleitung nach.
7. Lege eine neue Version an.
8. Führe die Prüfbefehle aus und eröffne den Pull Request mit `Closes #<nummer>`.

### Pull Request von Dependabot bearbeiten

```
Bearbeite den Pull Request von Dependabot #… im Repository SEM-SGG/sgk-navigator. Halte dich an AGENTS.md, Ablauf «Pull Request von Dependabot bearbeiten».
```

Dependabot schlägt einmal im Monat neue Versionen der GitHub Actions vor, gruppiert in einem Pull Request (`.github/dependabot.yml`). npm-Pakete aktualisiert er nicht, weil ein Update die gebaute Datei verändern kann. Die Fachperson führt einen grünen Pull Request selbst zusammen; diesen Auftrag gibt sie, wenn ein Lauf rot ist oder sie unsicher ist.

1. Lies den Pull Request und die Versionshinweise der aktualisierten Actions (Links im Text von Dependabot). Achte auf geänderte Eingaben, entfallene Optionen und eine neue Mindestversion von Node.js.
2. Ist «CI» rot, lies den Lauf (`gh pr checks <nummer>`, `gh run view <lauf> --log-failed`). Liegt die Ursache in der Änderung, lege einen Zweig ab `origin/main` an, übernimm die Versionen aus dem Pull Request, passe die Workflows an und eröffne einen eigenen Pull Request. Schreibe: «Ersetzt #…; nach dem Zusammenführen #… mit **Close pull request** schliessen.»
3. Betrifft das Update `actions/upload-pages-artifact` oder `actions/deploy-pages`, prüfe es auch im Workflow «Release», der nur nach einem Merge läuft: Schreibe unter «Von der prüfenden Person zu kontrollieren», dass nach dem nächsten Merge mit neuer Version der Lauf «Release» und die Download-Seite zu prüfen sind (`MAINTAINING.md`, Abschnitt «Prüfen, ob die Veröffentlichung geklappt hat»).
4. Ist alles grün und unbedenklich, antworte der Fachperson, dass sie den Pull Request zusammenführen kann, mit einem Satz zum Inhalt.

### BETA-Kennzeichnung entfernen

```
Entferne die BETA-Kennzeichnung im Repository SEM-SGG/sgk-navigator. Halte dich an AGENTS.md, Ablauf «BETA-Kennzeichnung entfernen».
```

Während der Erprobung zeigt die Kopfzeile rechts neben dem Produktnamen das Etikett «BETA» (`src/app/ui/brandextras.js`). Das Käfersymbol «Fehler melden oder Änderung vorschlagen» daneben bleibt; es hängt an `PROJECT.issues`, nicht am Schalter.

1. Lege einen Zweig ab `origin/main` an.
2. Setze in `src/app/config/update-source.js` die Konstante `BETA` auf `false`. Ändere sonst nichts am Code.
3. Passe den Oberflächentest «Kopfzeile: Etikett BETA und Rückmelde-Symbol …» in `test/app/ui.spec.mjs` an: Er erwartet danach kein Etikett (`#beta-tag` fehlt) und weiterhin das Symbol `#lnk-feedback` mit Ziel, `rel` und zugänglichem Namen. Die Einheitstests in `test/app/brandextras.test.mjs` bleiben unverändert.
4. Entferne in der Produktdokumentation (DE, FR, IT, Abschnitt «Kontakt und Fehlermeldung») und in `README.md` (Abschnitt «Kontakt») die Hinweise auf die Erprobung und das Etikett; den Hinweis auf das Käfersymbol behältst du.
5. Lege eine neue Version an (Abschnitt «Grundregeln», «Version und Changelog»), zum Beispiel «Das Etikett BETA in der Kopfzeile entfällt; die Erprobung ist abgeschlossen.»
6. Führe die Prüfbefehle aus und eröffne den Pull Request.

## Beschreibung des Pull Requests

Die prüfende Person ist eine Fachperson ohne GitHub-Erfahrung. Sie liest die Beschreibung im Browser und entscheidet danach über das Zusammenführen. Die Vorlage `.github/pull_request_template.md` gibt die Abschnitte vor:

1. **Ausgangslage:** Welches Problem gab es, für wen, und wer hat den Auftrag gegeben (Issue, Entwurf)? Ohne Fachjargon.
2. **Änderungen:** Was sich für Nutzende und für die pflegende Person ändert, in ganzen Sätzen. Nenne Dateinamen nur, wo sie beim Prüfen helfen.
3. **Von der prüfenden Person zu kontrollieren:** Was die Person im Browser ansehen oder entscheiden soll, als nummerierte Schritte mit den Namen der Knöpfe, zum Beispiel «Öffne **Files changed** und lies `CHANGELOG.md`». Nenne ausserdem, was nach dem Zusammenführen geschieht (zum Beispiel neue Release, Aktualisierung der Download-Seite).
4. **Testing:** Welche Prüfbefehle mit welchem Ergebnis gelaufen sind und was du nicht prüfen konntest (zum Beispiel Edge, die Download-Seite auf GitHub Pages).
5. **Risiko:** Was schlimmstenfalls passiert und woran die Person es merkt.
6. **Rückgängig machen:** Wie sich die Änderung zurücknehmen lässt, meist: den zusammengeführten Pull Request auf GitHub über **Revert** rückgängig machen und danach eine neue Version veröffentlichen.

Am Ende steht genau eine dieser Zeilen:

- `Produktdokumentation: nachgeführt`
- `Produktdokumentation: nicht betroffen, weil …` (mit Grund, zum Beispiel «nur Tests geändert»)
