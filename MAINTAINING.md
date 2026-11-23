# Pflegeanleitung

Diese Anleitung richtet sich an die Person, die den SGK-Navigator pflegt. Ausser dem Abschnitt «Lokal arbeiten» verlangt sie nur einen Browser und ein GitHub-Konto mit Schreibrecht im Repository `SEM-SGG/sgk-navigator`.

Was Code oder Node.js verlangt, erledigt ein Agent, zum Beispiel Claude Code im Browser oder Codex mit angebundenem Repository. Du gibst ihm einen der kopierbaren Aufträge aus [`AGENTS.md`](AGENTS.md), Abschnitt «Abläufe», und prüfst danach seinen Pull Request.

Inhalt: [Wie alles zusammenhängt](#wie-alles-zusammenhängt) · [Neue Version veröffentlichen](#neue-version-veröffentlichen) · [Prüfen, ob die Veröffentlichung geklappt hat](#prüfen-ob-die-veröffentlichung-geklappt-hat) · [Neue Fassung einbauen](#neue-fassung-einbauen) · [Akte und Vorschläge zur Kenntnis nehmen](#akte-und-vorschläge-zur-kenntnis-nehmen) · [Wenn ein Lauf rot ist](#wenn-ein-lauf-rot-ist) · [Pull Requests von Dependabot](#pull-requests-von-dependabot) · [Zeitgesteuerter Lauf](#zeitgesteuerter-lauf-übergabe-verspätung-start-von-hand) · [Einmalige Einrichtung](#einmalige-einrichtung) · [Lokal arbeiten](#lokal-arbeiten)

## Wie alles zusammenhängt

- Im Repository liegen nur der **Quellcode** und die **Daten** (`data/`). Die Datei `SGK-Navigator.html`, die Nutzende herunterladen, entsteht bei jeder Release automatisch daraus und liegt nur in der Release.
- Die **Version** steht im obersten Abschnitt von [`CHANGELOG.md`](CHANGELOG.md). Sie heisst nach dem Datum, zum Beispiel `2026.12.02`; eine zweite Version am selben Tag heisst `2026.12.02-2`.
- Die **Download-Seite** https://sem-sgg.github.io/sgk-navigator/ und die **Produktdokumentation** https://sem-sgg.github.io/sgk-navigator/dokumentation.html entstehen bei jeder Release neu. Die Seite enthält die Datei `version.json`; der Navigator liest sie höchstens einmal pro Tag und zeigt einen Hinweis, wenn es eine neuere Version gibt.
- Drei Workflows (GitHub **Actions**):
  - **CI** prüft jede Änderung (Changelog, Version in der Produktdokumentation, Tests und Build). Grün heisst: in Ordnung.
  - **Release** veröffentlicht eine neue Version, sobald ein neuer oberster Abschnitt in `CHANGELOG.md` auf `main` zusammengeführt ist.
  - **Fassungen** prüft jeden Montag, ob es neue Fassungen gibt. Neue konsolidierte Fassungen baut er selbst ein und eröffnet dazu einen Pull Request. Neue Akte und Vorschläge meldet er zur Information im Issue «Neue Fassungen auf EUR-Lex».

## Neue Version veröffentlichen

GitHub testet, baut und veröffentlicht den Navigator. Du änderst eine Datei. Die Version in der Produktdokumentation setzt ein Agent nach (Schritt 6).

1. Öffne im Repository die Datei `CHANGELOG.md` und klicke auf den Stift (**Edit this file**).
2. Füge unter dem einleitenden Absatz, über dem bisher obersten Abschnitt, einen neuen Abschnitt ein. Die Überschrift hat die Form `## 2026.12.02 (2. Dezember 2026)`: zuerst das heutige Datum als Version, dahinter in Klammern ausgeschrieben. Darunter steht je Änderung eine Zeile, die mit `- ` beginnt. Der Abschnitt wird zum Text der Release.
3. Auf Wunsch fügst du darunter `### Français` und dieselben Zeilen auf Französisch ein. Sie erscheinen auf der Download-Seite im französischen Teil.
4. Wähle **Commit changes…**, dann **Create a new branch for this commit and start a pull request** und **Propose changes**, danach **Create pull request**.
5. Der Workflow «CI» prüft die Änderung. Der Schritt «Version und Changelog prüfen» ist rot, wenn die Überschrift nicht stimmt; die Meldung nennt die Zeile.
6. Der Schritt «Version in der Produktdokumentation prüfen» ist rot, solange `docs/sgk-navigator-dokumentation.html` die alte Version nennt. Die Datei ist zu gross für den Editor im Browser. Gib einem Agenten diesen Auftrag:

   ```
   Setze in Pull Request #… im Repository SEM-SGG/sgk-navigator die Version in der Produktdokumentation nach. Halte dich an AGENTS.md.
   ```
7. Führe den Pull Request zusammen, sobald der Lauf grün ist: **Merge pull request**, **Confirm merge**.

Der Workflow «Release» legt danach die Release `v2026.12.02` an und aktualisiert Download-Seite und Produktdokumentation. Ab dann zeigen alle Navigatoren mit älterer Version den Hinweis auf die neue Datei. Ohne neuen Abschnitt im Changelog entsteht keine Release.

**Zusatzweg ohne Pull Request:** Steht der Abschnitt schon auf `main`, aber die Release fehlt (zum Beispiel nach einem abgebrochenen Lauf), wähle **Actions** → **Release** → **Run workflow**. Das Feld «Version» lässt du leer; dann gilt der oberste Abschnitt. `20261202` und `2026-12-02` gelten als `2026.12.02`. Für jede Version braucht es einen Abschnitt in `CHANGELOG.md`. Besteht die Release schon, baut der Lauf nur die Download-Seite neu und legt nichts doppelt an.

## Prüfen, ob die Veröffentlichung geklappt hat

1. Öffne im Repository **Actions**. Der Lauf «Release» ist grün, mit den Schritten «Bauen, testen, Release erstellen» und «Download-Seite veröffentlichen».
2. Öffne **Releases**. Die neue Version steht zuoberst und trägt die Datei `SGK-Navigator.html`.
3. Öffne die [Download-Seite](https://sem-sgg.github.io/sgk-navigator/). Sie nennt die neue Version und unter «Was ist neu» den Text aus dem Changelog.
4. Öffne die [Produktdokumentation](https://sem-sgg.github.io/sgk-navigator/dokumentation.html). Die Kopfzeile nennt dieselbe Version.

## Neue Fassung einbauen

Der Workflow «Fassungen» fragt das Amt für Veröffentlichungen der EU jeden Montag ab. Findet er eine neue konsolidierte Fassung eines der fünf Rechtsakte, nennt er sie im Issue «Neue Fassungen auf EUR-Lex» unter «Handlungsbedarf». Danach lädt er die Fassung von EUR-Lex bzw. Cellar, baut sie ein, erzeugt die Prüfberichte, lässt alle Tests laufen und eröffnet einen Pull Request, zum Beispiel «SGK-Navigator 2026.12.07: SGK-Fassung vom 1. Dezember 2026 nachgeführt». Der Pull Request legt die neue Version samt Abschnitt im Changelog und Version in der Produktdokumentation selbst an. Du prüfst ihn und führst ihn zusammen. Der Workflow «Release» veröffentlicht danach die neue Version.

Nutzende können neue Fassungen im Navigator selbst über **Aktualisieren** laden. Der feste Einbau erspart ihnen diesen Schritt.

### Pull Request prüfen und zusammenführen

1. Öffne im Repository **Pull requests** und darin den Pull Request des Workflows. Er stammt von `github-actions` und liegt auf dem Zweig `fassungen/einbau`.
2. Lies den Abschnitt «Befund». Er nennt die neuen Fassungen mit Links zu EUR-Lex.
3. Lies «Was sich ändert». Dort steht je Rechtsakt der neue Stand und je Sprache die geänderten Bestimmungen, beim SGK auch der Akt des Stands und die Herkunftsangabe, die der Navigator zeigt.
4. Prüfe «Prüfberichte», «Übrige Stände» und «Tests». Woran du einen guten Pull Request erkennst, steht unten.
5. Gib den Lauf «CI» frei: Unten im Pull Request steht «Some checks are waiting for approval». Wähle dort **Approve workflows to run**. GitHub verlangt diese Freigabe, weil der Pull Request von einem Workflow stammt. Die Tests sind beim Einbau schon gelaufen (Abschnitt «Tests»); «CI» wiederholt sie auf dem Stand des Pull Requests, ohne die Tests mit den Rohdaten von EUR-Lex. Fehlt **Approve workflows to run** und erscheint kein Lauf «CI», wähle unten **Close pull request** und danach **Reopen pull request**. Das startet «CI».
6. Lies «Text im Changelog». Er wird zum Text der Release. Du darfst ihn verbessern: Öffne **Files changed**, bei `CHANGELOG.md` das Menü **…** und **Edit file**. Speichere mit **Commit changes** im selben Zweig.
7. Wähle **Merge pull request** und **Confirm merge**. Nennt das Issue keine Akte zur Information mehr, schliesst der Pull Request es.
8. Prüfe die Veröffentlichung wie im Abschnitt «Prüfen, ob die Veröffentlichung geklappt hat».

Ein guter Pull Request erfüllt diese Punkte:

- Er ist kein Entwurf und beginnt nicht mit «Nicht zusammenführen».
- Die Version ist das Datum des Einbaus und neuer als die bisherige.
- «Was sich ändert» nennt nur die Rechtsakte und Fassungen aus dem Befund.
- Unter «Prüfberichte» zeigt jede Zeile «bestanden» oder «Hinweis». Ein Hinweis heisst: Eine Zahl ist gestiegen oder eine Prüfung ist für den neuen Akt nicht eingerichtet. Der genannte Bericht begründet jeden Fall; ein Agent richtet die fehlende Prüfung ein.
- Unter «Übrige Stände» steht «Alle bisherigen Stände aller Rechtsakte sind inhaltlich unverändert.»
- Unter «Tests» zeigt jede Zeile «bestanden».

### Wenn der Pull Request ein Entwurf ist

Scheitert der Einbau, eine Prüfung oder ein Test, eröffnet der Workflow den Pull Request als Entwurf. Der Text beginnt mit «Nicht zusammenführen» und nennt die Gründe. Der Lauf «Fassungen» ist rot.

1. Führe den Entwurf nicht zusammen.
2. Lies die Gründe am Anfang des Pull Requests. Bei einem fehlgeschlagenen Test stehen die letzten Zeilen der Ausgabe unter «Tests».
3. Liegt die Ursache bei EUR-Lex, Cellar oder im Netz, zum Beispiel `nicht ladbar`, `HTTP 503` oder eine Zeitüberschreitung, starte den Workflow «Fassungen» unter **Actions** über **Run workflow** neu. Er baut den Einbau neu und aktualisiert den Pull Request.
4. Bleibt der Fehler, gib einem Agenten diesen Auftrag. Setze die Nummer des Pull Requests ein:

   ```
   Der Einbau ist gescheitert, Pull Request #… im Repository SEM-SGG/sgk-navigator ist ein Entwurf: Bring ihn in Ordnung. Halte dich an AGENTS.md, Ablauf «Gescheiterter Einbau neuer Fassungen».
   ```

   Der Agent baut die Fassung ein, lässt Prüfungen und Tests laufen und eröffnet einen eigenen Pull Request, den du prüfst und zusammenführst. Er nennt in der Beschreibung den Grund und was du kontrollieren sollst. Den Entwurf schliesst du nach dem Zusammenführen.

Ein Entwurf nach einem Fehler wird bei jedem Lauf neu gebaut. Ein offener Pull Request ohne Fehler und mit demselben Befund bleibt beim nächsten Lauf unverändert. Führt EUR-Lex inzwischen weitere Fassungen, baut der Lauf alle ein und überschreibt den Zweig.

Eröffnet der Workflow das Issue, aber keinen Pull Request, ist schon das Laden der Rohdaten gescheitert. Starte den Workflow später über **Run workflow** neu.

### Wenn Fachangaben fehlen

Eine neue Fassung des SGK bildet einen neuen Stand, der einem Änderungsakt zugeordnet ist. Der Workflow bestimmt den Akt aus der Liste der Änderungsakte von EUR-Lex. Kennt `data/acts.json` diesen Akt noch nicht, fehlen Angaben, die nur eine Fachperson machen kann: die Anwendbarkeit (ab wann die Änderungen gelten, mit Fundstelle) und eine Kurzbezeichnung in Deutsch, Französisch und Englisch. Der Pull Request ist dann ein Entwurf mit dem Hinweis «Nicht zusammenführen, bevor die Fachangaben ergänzt sind». Der Abschnitt «Von dir zu liefern» sagt, was fehlt, und enthält einen Auftrag zum Kopieren.

1. Kläre die Angaben fachlich, zum Beispiel anhand des Akts auf EUR-Lex.
2. Kopiere den Auftrag aus dem Pull Request, ersetze die Pünktchen durch deine Angaben und gib ihn einem Agenten. Er hat diese Form:

   ```
   Erfasse den Akt … in acts.json im Repository SEM-SGG/sgk-navigator; die Anwendbarkeit lautet …. Halte dich an AGENTS.md, Ablauf «Akt erfassen».
   ```
3. Prüfe den Pull Request des Agenten (Tabelle mit den neuen Angaben) und führe ihn zusammen.
4. Starte den Workflow «Fassungen» über **Actions** → **Fassungen** → **Run workflow**. Er baut den Entwurf mit den neuen Angaben neu. Ist er kein Entwurf mehr, prüfst du ihn wie oben.

Für die EES-, ETIAS-, VIS- und Interoperabilitäts-Verordnung braucht der Einbau keine Fachangaben; die Anwendbarkeit ist dort nicht erhoben.

## Akte und Vorschläge zur Kenntnis nehmen

Das Issue «Neue Fassungen auf EUR-Lex» nennt unter «Zur Information» neue Änderungsakte, Berichtigungen, Abweichungen und Vorschläge. Hier besteht kein Handlungsbedarf: Den Wortlaut eines Änderungsakts übernimmt der Navigator mit der nächsten konsolidierten Fassung. Damit die Einträge nicht jede Woche wieder erscheinen und der Navigator unter **Aktualisieren** sie nicht als neu zählt, nimmst du sie zur Kenntnis:

1. Öffne im Issue den Link «data/zur-kenntnis.txt zum Bearbeiten».
2. Kopiere die Zeilen aus dem Kasten im Issue ans Ende der Datei. Jede Zeile beginnt mit der CELEX-Nummer; die Bemerkung dahinter darfst du ändern.
3. Wähle **Commit changes…**, dann **Create a new branch for this commit and start a pull request** und **Propose changes**, danach **Create pull request**.
4. Führe den Pull Request zusammen, sobald der Lauf «CI» grün ist.

Die nächste Prüfung schliesst das Issue, wenn nichts mehr offen ist. Im Navigator erscheinen die Einträge ab der nächsten Version als «zur Kenntnis genommen». Konsolidierte Fassungen lassen sich so nicht abstellen; sie baut der Workflow ein.

Soll ein Akt im Navigator in der Liste der Akte erscheinen, mit Anwendbarkeit, gib einem Agenten den Auftrag aus [`AGENTS.md`](AGENTS.md), Ablauf «Akt erfassen».

## Wenn ein Lauf rot ist

Ein rotes Kreuz bei einem Pull Request oder Lauf heisst: Eine Prüfung ist fehlgeschlagen. Für die Nutzenden ändert sich dadurch nichts; erst eine Release verteilt eine neue Datei.

1. Öffne unter **Actions** den roten Lauf und darin den roten Schritt. Die letzten Zeilen nennen den Fehler.
2. Häufige Ursachen:

| Meldung | Ursache | Behebung |
| --- | --- | --- |
| `CHANGELOG.md, Zeile …: Version … hat nicht die Form JJJJ.MM.TT` | Tippfehler in der Überschrift | Überschrift genau in der Form `## 2026.12.02 (2. Dezember 2026)` |
| `CHANGELOG.md, Zeile …: Version … muss neuer sein …` | Neuer Abschnitt nicht zuoberst oder Datum zu alt | Abschnitt zuoberst einfügen; bei zwei Versionen am selben Tag `-2` anhängen |
| `docs/sgk-navigator-dokumentation.html: Die Versionsangabe passt nicht …` | Die Produktdokumentation nennt eine andere Version | Die Meldung nennt jede Zeile. Auftrag an einen Agenten (Abschnitt «Neue Version veröffentlichen», Schritt 6) |
| `CHANGELOG.md hat keinen Abschnitt «## … (Datum)»` | Release von Hand mit einer Version ohne Abschnitt | Abschnitt im Changelog ergänzen oder das Feld «Version» leer lassen |
| Fehler im Schritt «Auf GitHub Pages veröffentlichen» | Download-Seite ist nicht eingerichtet | Abschnitt «Einmalige Einrichtung» |
| Ein Test schlägt fehl (`✘`, `not ok`) | Die Änderung hat ein Verhalten verändert | Änderung zurücknehmen oder berichtigen; bei Unklarheit Auftrag «Behebe den Fehler …» an einen Agenten |
| Lauf «Fassungen» rot, Pull Request ist ein Entwurf | Einbau, Prüfung oder Test gescheitert | Abschnitt «Wenn der Pull Request ein Entwurf ist» |
| Lauf «Fassungen» rot im Schritt «Mit EUR-Lex vergleichen»: `Kein Rechtsakt konnte geprüft werden` | Der Endpunkt des Amts für Veröffentlichungen war nicht erreichbar | Später über **Run workflow** neu starten oder die nächste Woche abwarten |
| `Rohdaten von EUR-Lex und Cellar nicht geladen` | EUR-Lex und Cellar waren nicht erreichbar | Workflow «Fassungen» später über **Run workflow** neu starten |
| `GitHub Actions is not permitted to create or approve pull requests` | Einstellung für Pull Requests fehlt | Abschnitt «Einmalige Einrichtung», Schritt 4 |
| Am Montag ist kein Lauf «Fassungen» erschienen | GitHub hat den zeitgesteuerten Lauf verspätet, ausgelassen oder abgeschaltet | Abschnitt «Zeitgesteuerter Lauf» |

3. Bei Oberflächentests liegt unter **Summary** → **Artifacts** das Paket `playwright-ergebnisse` mit Bildschirmfotos.
4. Ist die Ursache unklar oder ausserhalb des Repositorys (GitHub gestört, Download von Chromium fehlgeschlagen): oben rechts **Re-run jobs** wählen. Bleibt es rot, gib einem Agenten den Auftrag «Behebe den Fehler …» mit dem Link zum Lauf, nachdem du dazu ein Issue eröffnet hast.

## Pull Requests von Dependabot

Dependabot eröffnet einmal im Monat einen Pull Request, der alle neuen Versionen der GitHub Actions zusammenfasst (Einstellung `.github/dependabot.yml`). Die Pakete von npm aktualisiert er nicht, weil ein Update die gebaute Datei verändern kann.

1. Öffne den Pull Request. Er stammt von `dependabot` und heisst zum Beispiel «GitHub Actions: Bump the github-actions group …».
2. Sind alle Prüfungen grün, wähle **Merge pull request** und **Confirm merge**. Eine neue Version braucht es dafür nicht.
3. Ist eine Prüfung rot oder bist du unsicher, gib einem Agenten diesen Auftrag:

   ```
   Bearbeite den Pull Request von Dependabot #… im Repository SEM-SGG/sgk-navigator. Halte dich an AGENTS.md, Ablauf «Pull Request von Dependabot bearbeiten».
   ```

Die Workflows «Release» und «Fassungen» laufen nur nach einem Merge bzw. am Montag. Prüfe nach dem nächsten Lauf, ob sie grün sind.

## Zeitgesteuerter Lauf: Übergabe, Verspätung, Start von Hand

Der Workflow «Fassungen» startet von selbst am Montagmorgen. GitHub führt ihn auf das Konto der Person aus, die ihn zuletzt eingerichtet oder wieder eingeschaltet hat. Nur diese Person erhält die Fehlermail. Verlässt sie die Organisation, läuft der Workflow weiter, aber die Fehlermails gehen weiter an sie.

**Bei der Übergabe an eine Nachfolge** (am besten vor dem Austritt der bisherigen Person):

1. Die neue zuständige Person meldet sich mit ihrem eigenen Konto bei GitHub an. Sie braucht Schreibrecht auf das Repository `SEM-SGG/sgk-navigator`.
2. Unter ihrem Profilbild → **Settings** → **Notifications** → **GitHub Actions** schaltet sie **Email** ein und wählt **Only notify for failed workflows**.
3. Im Repository öffnet sie **Actions** und wählt links den Workflow «Fassungen». Sie klickt rechts auf **…** → **Disable workflow** und gleich danach auf **Enable workflow**. Ab jetzt erhält sie die Fehlermails.

**Wenn der Lauf ausbleibt:** GitHub startet zeitgesteuerte Läufe oft mehrere Stunden zu spät, an manchen Tagen auch gar nicht. Warte bis Dienstagmorgen. Fehlt der Lauf dann noch, starte ihn von Hand: **Actions** → Workflow «Fassungen» wählen → rechts **Run workflow** → Branch `main` lassen, Schalter **Probelauf** aus lassen → **Run workflow**. Ein Lauf von Hand eröffnet keine doppelten Issues oder Pull Requests: Er aktualisiert das offene Issue «Neue Fassungen auf EUR-Lex» oder schliesst es, wenn nichts mehr offen ist. Einen offenen Pull Request des Workflows mit demselben Befund lässt er stehen; nach einem Fehler oder mit neuem Befund baut er ihn neu, statt einen zweiten zu eröffnen.

**Wenn GitHub den Workflow abgeschaltet hat:** Bei öffentlichen Repositories schaltet GitHub zeitgesteuerte Workflows nach 60 Tagen ohne Aktivität im Repository ab. Zeigt **Actions** einen entsprechenden Hinweis, wähle den Workflow «Fassungen» und klicke **Enable workflow**. Wer das tut, erhält ab dann die Fehlermails.

**Probelauf:** Mit **Run workflow** und dem Schalter **Probelauf** prüfst du den Ablauf, ohne etwas zu ändern: kein Issue, kein Push, kein Pull Request. Mit dem zusätzlichen Schalter **Nur im Probelauf: Rohdaten laden und alles neu bauen und testen** lädt der Lauf auch ohne neue Fassung alle Rohdaten von EUR-Lex und Cellar, baut alles und lässt alle Tests laufen. Den Text, den der Pull Request hätte, findest du in der Zusammenfassung des Laufs und im Artefakt «einbau» (`pr.md`).

## Einmalige Einrichtung

Eine Person mit Administratorrecht im Repository bzw. in der Organisation:

1. **Pages:** **Settings** → **Pages** → **Build and deployment** → **Source**: **GitHub Actions**.
2. **Actions erlauben:** **Settings** → **Actions** → **General**: «Allow all actions and reusable workflows» (oder mindestens Actions von GitHub, `actions/*`).
3. Unter **Workflow permissions** genügt «Read repository contents and packages permissions»; die Workflows fordern die nötigen Rechte selbst an.
4. Ebenda das Häkchen bei **Allow GitHub Actions to create and approve pull requests** setzen und **Save** wählen. Ohne diese Einstellung eröffnet der Workflow «Fassungen» keinen Pull Request. Ist das Häkchen ausgegraut, setzt eine Person mit Admin-Recht in der Organisation es zuerst dort: Organisation **SEM-SGG** → **Settings** → **Actions** → **General** → **Workflow permissions**.
5. **Labels** (optional): `fehler` und `fassung` anlegen, damit die Vorlagen für Issues sie setzen können.

Wird das Repository umbenannt oder zieht es in eine andere Organisation um, passt ein Agent `src/app/config/update-source.js` (Owner, Repo) und die Links in `README.md`, `.github/ISSUE_TEMPLATE/config.yml`, `site/` und `package.json` an. Erst die danach gebauten Versionen finden die neue Adresse.

## Lokal arbeiten

Diesen Weg geht ein Agent oder eine Person mit Node.js auf ihrem Gerät. Einmalig: Node.js 22 installieren, das Repository klonen (`git clone https://github.com/SEM-SGG/sgk-navigator.git`), im Ordner `npm ci` ausführen. Für die Oberflächentests zusätzlich `npx playwright install chromium` und die Umgebungsvariable `SGK_CHROME=bundled` (oder Chrome unter `/usr/bin/google-chrome`). Hinter einem Proxy liest Node.js die Variable `HTTPS_PROXY` nur mit `NODE_USE_ENV_PROXY=1`.

| Aufgabe | Befehl |
| --- | --- |
| Navigator bauen | `npm run build` (Ergebnis `dist/sgk-navigator.html`) |
| Einheitstests | `npm run test:unit` |
| Oberflächentests wie in der CI | `npm run test:app:ci` |
| Changelog und Version in der Produktdokumentation prüfen | `node scripts/release-info.mjs`, `node scripts/check-dokumentation.mjs` (`--fix` setzt die Version) |
| Fassungen prüfen ohne Wirkung | `node scripts/check-fassungen.mjs --dry-run --out befund.json` |
| Einbau wie der Workflow | `node scripts/apply-fassungen.mjs --befund befund.json --out <ordner>` |
| Download-Seite ansehen | `node scripts/build-site.mjs --version 2026.12.02`, dann `dist/site/index.html` |

**Einbau von Hand**, Einzelschritte von `scripts/apply-fassungen.mjs`:

1. Rohdaten laden: `node scripts/fetch-raw-sgk.mjs` (SGK; Quelle EUR-Lex, sonst Cellar). Die weiteren Rechtsakte lädt der nächste Schritt selbst.
2. Weitere Rechtsakte (EES, ETIAS, VIS, IO): `node scripts/build-work.mjs all` fragt alle konsolidierten Fassungen ab, lädt fehlende Dateien nach `raw/` und baut `data/works/…`; `node scripts/validate-works.mjs` schreibt den Bericht `data/VALIDATION_WORKS.md`.
3. SGK: Eine neue Fassung kommt als weiterer Eintrag in `data/sgk-fassungen.json` dazu (Stand, CELEX, Datum, Akt, Herkunftsangabe DE, FR, EN). `node scripts/fetch-raw-sgk.mjs` lädt sie, `node scripts/build-data.mjs` baut `data/dataset.json`, `node scripts/validate.mjs` schreibt `data/VALIDATION.md`. Der Akt braucht einen Eintrag in `data/acts.json` mit Anwendbarkeit (Fachangabe).
4. Für die Datentests: `node scripts/forms/extract-images.mjs`, danach `npm run test:core` (mit `raw/` ohne übersprungene Tests).
5. Neue Version im Changelog anlegen, `node scripts/check-dokumentation.mjs --fix`, Pull Request eröffnen.
6. Modul Verhandlung: `node scripts/neg/fetch-raw.mjs` lädt die öffentlichen Ratsdokumente nach `raw-neg/`. Testdateien für die Upload-Tests: `node test/app/tools/fetch-eurlex.mjs …` (Chrome, Netz) nach `test/app/fixtures-live/`.
