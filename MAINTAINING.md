# Pflegeanleitung

Diese Anleitung ist für die Person, die den SGK-Navigator betreut. Sie setzt keine Programmierkenntnisse voraus, wohl aber ein
GitHub-Konto mit Schreibrechten im Repo `SEM-SGG/sgk-navigator`. Für die Schritte «Neue Fassung einbauen» braucht es zusätzlich
einen Computer mit Node.js 22 und Internetzugang (ausserhalb des SEM-Netzes oder mit Proxy), weil EUR-Lex-Dateien geladen werden.

Inhalt: [Wie alles zusammenhängt](#wie-alles-zusammenhängt) · [Release erstellen](#release-erstellen) ·
[Neue Fassung einbauen](#neue-fassung-einbauen) · [Wenn die CI rot ist](#wenn-die-ci-rot-ist) ·
[Einmalige Einstellungen auf GitHub](#einmalige-einstellungen-auf-github) · [Lokal arbeiten](#lokal-arbeiten)

## Wie alles zusammenhängt

- Im Repo liegt nur der **Quellcode** und die **Daten** (`data/`). Die Datei `SGK-Navigator.html`, die Nutzende herunterladen,
  entsteht bei jedem Release automatisch daraus und liegt nur im Release, nie im Repo.
- Die **Download-Seite** https://sem-sgg.github.io/sgk-navigator/ wird bei jedem Release neu erzeugt. Sie enthält die Datei
  `version.json`; das Tool liest sie einmal pro Tag und zeigt einen Hinweis, wenn es eine neuere Version gibt.
- Drei automatische Abläufe (GitHub «Actions»):
  - **CI** prüft jede Änderung (Tests und Build). Grün = in Ordnung.
  - **Release** erstellt eine neue Version (nur auf Knopfdruck).
  - **Fassungen prüfen** schaut jeden Montag, ob es neue Fassungen gibt, und meldet sie im Issue «Neue Fassungen verfügbar».
- Versionen heissen nach dem Datum: `2026.12.12`. Gibt es am selben Tag eine zweite Version: `2026.12.12-2`.

## Release erstellen

Ein Release lohnt sich, wenn neue Daten oder Korrekturen im Branch `main` sind und die CI dort grün ist.

1. Auf github.com das Repo `SEM-SGG/sgk-navigator` öffnen.
2. Oben «Actions» wählen, links «Release», rechts «Run workflow».
3. «Use workflow from»: `main` lassen.
4. «Version» leer lassen: Dann gilt das heutige Datum. Wer sie einträgt, schreibt das Datum, z. B. `2026.12.12`; `20261212` und `2026-12-12` gehen auch.
5. Optional «Was ist neu» auf Deutsch und Französisch in einem bis zwei Sätzen, z. B. «Neu: VIS-VO in der Fassung vom
   1. Dezember 2026.» Leer lassen ergibt einen Standardtext; der Datenstand je Rechtsakt steht ohnehin auf der Download-Seite.
6. «Run workflow» wählen. Nach rund 10 bis 15 Minuten sind beide Schritte grün («Bauen, testen, Release erstellen» und
   «Download-Seite veröffentlichen»).
7. Prüfen: die Download-Seite zeigt die neue Version; unter «Releases» steht das neue Release mit der Datei
   `SGK-Navigator.html`. Wer das Tool öffnet, sieht spätestens am nächsten Tag den Hinweis auf die neue Version.

Bricht der Ablauf ab, steht der Grund in roter Schrift im Protokoll. Häufig: Version nicht im Schema, Version gibt es schon
(dann `-2` anhängen), Tests rot (siehe unten). Ein abgebrochener Ablauf ändert nichts für die Nutzenden.

Alternative für Technikaffine: Tag `v2026.12.12` auf `main` pushen. Dafür muss die Umgebung `github-pages` Tags erlauben (siehe
[Einmalige Einstellungen](#einmalige-einstellungen-auf-github)).

## Neue Fassung einbauen

Das Issue «Neue Fassungen verfügbar» listet, was neu ist. Zwei Fälle:

**Neuer Akt** (Änderungsakt, Berichtigung, Abweichung, Vorschlag): Der Wortlaut kommt erst mit der nächsten konsolidierten
Fassung ins Tool. Soll der Akt vorher in der Liste der Akte erscheinen, ihn in `data/works/<werk>.acts.json` (EES, ETIAS, VIS, IO)
bzw. `data/acts.json` (SGK) erfassen, nach dem Muster der vorhandenen Einträge. Sonst das Issue mit einem kurzen Kommentar
schliessen («wird mit der nächsten Fassung übernommen»); die wöchentliche Prüfung meldet ihn dann wieder, bis er erfasst ist.

**Neue konsolidierte Fassung:** Bis zum nächsten Release können Nutzende sie im Tool selbst laden («Aktualisieren»). Zentral
einbauen:

1. Repo auf den eigenen Computer holen und einrichten (einmalig, siehe [Lokal arbeiten](#lokal-arbeiten)).
2. **EES-, ETIAS-, VIS- oder IO-Verordnung:** im Ordner des Repos ausführen:
   ```sh
   node scripts/build-work.mjs all
   node scripts/validate-works.mjs
   ```
   Der erste Befehl fragt EUR-Lex nach allen konsolidierten Fassungen, lädt fehlende Dateien nach `raw/` und baut die Daten neu
   (`data/works/…`). Der zweite prüft sie und schreibt den Bericht `data/VALIDATION_WORKS.md`.
3. **Schengener Grenzkodex:** Die Stände des SGK sind von Hand festgelegt (`scripts/build-data.mjs`, Funktion `buildAll`). Eine
   neue Fassung kommt als weiterer Stand dazu, nach dem Muster von `s08` (Aufruf `addSnapshot` mit Fassung, Änderungsakt, Datum
   und Stand `s09`). Der Änderungsakt braucht einen Eintrag in `data/acts.json` mit Anwendbarkeit. Danach:
   ```sh
   node scripts/fetch-raw-sgk.mjs --only 02016R0399-JJJJMMTT   # neue Fassung laden (DE, FR, EN)
   node scripts/fetch-raw-sgk.mjs                              # übrige Quelldateien, falls raw/ leer ist
   node scripts/build-data.mjs
   node scripts/validate.mjs
   ```
   Diese Änderung am Programm am besten mit einer technisch versierten Person oder einem KI-Assistenten vornehmen und die Tests
   laufen lassen. Für Bilder braucht `build-data.mjs` zusätzlich das Paket `sharp` (`npm install --no-save sharp`).
4. Tests: `npm run test:unit` und `npm run test:app:ci`. Mit `raw/` laufen zusätzlich die Datentests, die sonst übersprungen werden.
5. Änderungen committen und auf `main` pushen (oder als Pull Request). Wenn die CI grün ist: [Release erstellen](#release-erstellen).
6. Das Issue «Neue Fassungen verfügbar» schliessen.

## Wenn die CI rot ist

Ein rotes Kreuz bei einem Commit oder Pull Request heisst: Ein Test ist fehlgeschlagen oder der Build ging nicht. Für die
Nutzenden ändert sich dadurch nichts; erst ein Release verteilt eine neue Datei.

1. Auf das rote Kreuz und dann «Details» klicken. Der rote Schritt zeigt, was nicht ging (z. B. «Einheitstests Anwendung»).
2. Im Protokoll nach `not ok`, `✘` oder `Error` suchen; die Zeile nennt den Test und die Abweichung.
3. Bei Oberflächentests liegt unter «Summary» → «Artifacts» das Paket `playwright-ergebnisse` mit Bildschirmfotos.
4. Kommt der Fehler von der eigenen Änderung (z. B. Tippfehler in einem Text, neue Daten): korrigieren und erneut pushen.
5. Ist die Ursache unklar oder ausserhalb des Repos (GitHub gestört, Download von Chromium fehlgeschlagen): oben rechts
   «Re-run jobs» wählen. Bleibt es rot, kein Release erstellen und eine technisch versierte Person beiziehen.

Die wöchentliche Fassungsprüfung ist rot, wenn der Endpunkt des Amts für Veröffentlichungen für alle Rechtsakte nicht
erreichbar war. Meist genügt es, die nächste Woche abzuwarten oder den Ablauf später erneut zu starten.

## Einmalige Einstellungen auf GitHub

Nach dem ersten Push durch eine Person mit Administratorrechten im Repo bzw. in der Organisation:

1. **Pages:** «Settings» → «Pages» → «Build and deployment» → «Source»: **GitHub Actions**.
2. **Actions erlauben:** «Settings» → «Actions» → «General»: «Allow all actions and reusable workflows» (oder mindestens Actions
   von GitHub erlauben: `actions/*`). Unter «Workflow permissions» genügt «Read repository contents and packages permissions»;
   die Workflows fordern die nötigen Rechte selbst an (Release: Inhalte schreiben; Fassungsprüfung: Issues schreiben).
   Falls die Organisation Actions sperrt, muss sie diese Einstellungen für das Repo freigeben.
3. **Umgebung github-pages:** entsteht beim ersten Release. Für Releases per Tag (statt per «Run workflow») unter «Settings» →
   «Environments» → `github-pages` → «Deployment branches and tags» eine Regel für Tags `v*` ergänzen.
4. **Labels** (optional): `fehler` und `fassung` anlegen, damit die Vorlagen für Issues sie setzen können.
5. **Erstes Release** erstellen (siehe oben). Erst danach gibt es die Download-Seite und `version.json`.
6. Geplante Abläufe deaktiviert GitHub bei öffentlichen Repos nach 60 Tagen ohne Aktivität im Repo. Erscheint ein Hinweis, unter
   «Actions» → «Fassungen prüfen» → «Enable workflow» wählen.

## Lokal arbeiten

Einmalig: Node.js 22 installieren, das Repo klonen (`git clone https://github.com/SEM-SGG/sgk-navigator.git`), im Ordner
`npm ci` ausführen. Für die Oberflächentests zusätzlich `npx playwright install chromium` und die Umgebungsvariable
`SGK_CHROME=bundled` (oder Chrome unter `/usr/bin/google-chrome`).

| Aufgabe | Befehl |
| --- | --- |
| Tool bauen | `npm run build` (Ergebnis `dist/sgk-navigator.html`) |
| Einheitstests | `npm run test:unit` |
| Oberflächentests wie in der CI | `npm run test:app:ci` |
| Fassungen prüfen ohne Issue | `node scripts/check-fassungen.mjs --dry-run` |
| Download-Seite ansehen | `node scripts/build-site.mjs --version 2026.12.12`, dann `dist/site/index.html` |

Hinter einem Proxy liest Node.js die Variable `HTTPS_PROXY` nur mit `NODE_USE_ENV_PROXY=1`.

Wird das Repo umbenannt oder zieht es in eine andere Organisation um: `src/app/config/update-source.js` (Owner, Repo) und die Links
in `README.md`, `.github/ISSUE_TEMPLATE/config.yml` und `package.json` anpassen; erst die danach gebauten Versionen finden die neue
Adresse.
