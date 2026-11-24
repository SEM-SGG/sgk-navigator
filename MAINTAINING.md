# Pflegeanleitung

Diese Anleitung richtet sich an die Person, die den SGK-Navigator pflegt. Ausser dem Abschnitt «Lokal arbeiten» verlangt sie nur einen Browser und ein GitHub-Konto mit Schreibrecht im Repository `SEM-SGG/sgk-navigator`.

Was Programmcode oder Node.js verlangt, erledigt ein Agent (ein KI-Werkzeug wie Claude Code im Browser oder Codex mit angebundenem Repository). Du kopierst einen der Aufträge aus [`AGENTS.md`](AGENTS.md), Abschnitt «Abläufe», gibst ihn dem Agenten und prüfst danach seinen Pull Request (Änderungsvorschlag auf GitHub).

Inhalt: [Wie alles zusammenhängt](#wie-alles-zusammenhängt) · [Neue Version veröffentlichen](#neue-version-veröffentlichen) · [Prüfen, ob die Veröffentlichung geklappt hat](#prüfen-ob-die-veröffentlichung-geklappt-hat) · [Neue Fassung einbauen](#neue-fassung-einbauen) · [Akte und Vorschläge zur Kenntnis nehmen](#akte-und-vorschläge-zur-kenntnis-nehmen) · [Wenn ein Lauf rot ist](#wenn-ein-lauf-rot-ist) · [Pull Requests von Dependabot](#pull-requests-von-dependabot) · [BETA-Kennzeichnung entfernen](#beta-kennzeichnung-entfernen) · [Zeitgesteuerter Lauf](#zeitgesteuerter-lauf-übergabe-verspätung-start-von-hand) · [Einmalige Einrichtung](#einmalige-einrichtung) · [Lokal arbeiten](#lokal-arbeiten)

## Wie alles zusammenhängt

- Im Repository liegen nur der **Quellcode** und die **Daten** (`data/`). Die Datei `SGK-Navigator.html`, die Nutzende herunterladen, entsteht bei jeder Release (veröffentlichte Version unter **Releases**) automatisch daraus und liegt nur dort.
- Die **Version** steht im obersten Abschnitt von [`CHANGELOG.md`](CHANGELOG.md). Sie richtet sich nach dem Datum, zum Beispiel `2026.12.02`; eine zweite Version am selben Tag heisst `2026.12.02-2`.
- Die **Download-Seite** https://sem-sgg.github.io/sgk-navigator/ und die **Produktdokumentation** https://sem-sgg.github.io/sgk-navigator/dokumentation.html entstehen bei jeder Release neu. Die Seite enthält die Datei `version.json`; der Navigator liest sie höchstens einmal pro Tag und zeigt einen Hinweis, wenn es eine neuere Version gibt.
- Drei **Workflows** (automatische Abläufe unter GitHub **Actions**):
  - **CI** (kurz für Continuous Integration, automatische Prüfung) prüft jede Änderung: Changelog, Version in der Produktdokumentation, Tests und Bau der Datei. Ein grüner Haken heisst: in Ordnung.
  - **Release** veröffentlicht eine neue Version, sobald ein neuer oberster Abschnitt in `CHANGELOG.md` auf den Hauptzweig `main` zusammengeführt ist.
  - **Fassungen** prüft jeden Montag, ob es neue Fassungen gibt. Neue konsolidierte Fassungen (bereinigte Gesamttexte von EUR-Lex mit eingearbeiteten Änderungen) baut er selbst ein und eröffnet dazu einen Pull Request. Neue Akte und Vorschläge meldet er zur Information im Issue (Eintrag unter **Issues**) «Neue Fassungen auf EUR-Lex».

## Neue Version veröffentlichen

GitHub testet, baut und veröffentlicht den Navigator. Du änderst eine Datei. Die Version in der Produktdokumentation führt ein Agent nach (Schritt 6).

1. Öffne im Repository die Datei `CHANGELOG.md` und klicke auf den Stift (**Edit this file**).
2. Füge unter dem einleitenden Absatz, über dem bisher obersten Abschnitt, einen neuen Abschnitt ein. Die Überschrift hat die Form `## 2026.12.02 (2. Dezember 2026)`: zuerst das heutige Datum als Version, dahinter in Klammern ausgeschrieben. Darunter steht je Änderung eine Zeile, die mit `- ` beginnt. Der Abschnitt wird zum Text der Release.
3. Auf Wunsch fügst du darunter `### Français` und dieselben Zeilen auf Französisch ein. Sie erscheinen auf der Download-Seite im französischen Teil.
4. Wähle **Commit changes…**, dann **Create a new branch for this commit and start a pull request** und **Propose changes**, danach **Create pull request**.
5. Warte den Lauf des Workflows «CI» ab; er startet von selbst und prüft die Änderung. Ist der Schritt «Version und Changelog prüfen» rot, stimmt die Überschrift nicht; die Meldung im Schritt nennt die betroffene Zeile.
6. Der Schritt «Version in der Produktdokumentation prüfen» bleibt rot, solange `docs/sgk-navigator-dokumentation.html` die alte Version nennt. Die Datei ist zu gross für den Editor im Browser. Kopiere diesen Auftrag für einen Agenten und ersetze `…` durch die Nummer des Pull Requests:

   ```
   Führe in Pull Request #… im Repository SEM-SGG/sgk-navigator die Version in der Produktdokumentation nach. Halte dich an AGENTS.md.
   ```

   Der Agent passt die Datei auf dem Zweig des Pull Requests an. Danach läuft «CI» erneut und wird grün.
7. Sobald der Lauf «CI» grün ist, führe den Pull Request zusammen: Wähle **Merge pull request** und **Confirm merge**.

Der Workflow «Release» startet danach von selbst, legt die Release `v2026.12.02` an und aktualisiert Download-Seite und Produktdokumentation. Ab dann zeigen alle Navigatoren mit älterer Version den Hinweis auf die neue Datei. Ohne neuen Abschnitt im Changelog entsteht keine Release.

**Zusatzweg ohne Pull Request:** Steht der Abschnitt schon auf `main`, aber die Release fehlt (zum Beispiel nach einem abgebrochenen Lauf), öffne **Actions**, wähle links **Release** und rechts **Run workflow**. Lasse das Feld für die Version leer (dann gilt der oberste Abschnitt) und bestätige mit **Run workflow**. Gibst du eine Version ein, gelten auch `20261202` und `2026-12-02` als `2026.12.02`; für jede Version braucht es einen Abschnitt in `CHANGELOG.md`. Besteht die Release schon, baut der Lauf nur die Download-Seite neu und legt nichts doppelt an.

## Prüfen, ob die Veröffentlichung geklappt hat

1. Öffne im Repository **Actions**. Der oberste Lauf «Release» ist grün, mit den beiden Schritten «Bauen, testen, Release erstellen» und «Download-Seite veröffentlichen».
2. Öffne **Releases**. Die neue Version steht zuoberst und trägt die Datei `SGK-Navigator.html`.
3. Öffne die [Download-Seite](https://sem-sgg.github.io/sgk-navigator/). Sie nennt die neue Version und unter «Was ist neu» den Text aus dem Changelog.
4. Öffne die [Produktdokumentation](https://sem-sgg.github.io/sgk-navigator/dokumentation.html). Die Kopfzeile nennt dieselbe Version.

## Neue Fassung einbauen

Der Workflow «Fassungen» fragt jeden Montag das Amt für Veröffentlichungen der EU ab. Findet er eine neue konsolidierte Fassung eines der fünf Rechtsakte, nennt er sie im Issue «Neue Fassungen auf EUR-Lex» unter «Handlungsbedarf». Danach lädt er die Fassung von EUR-Lex bzw. Cellar (dem Datendienst des Amts für Veröffentlichungen), baut sie ein, erzeugt die Prüfberichte und lässt alle Tests laufen. Zum Schluss eröffnet er einen Pull Request, zum Beispiel «SGK-Navigator 2026.12.07: SGK-Fassung vom 1. Dezember 2026 nachgeführt». Die neue Version, den Abschnitt im Changelog und die Version in der Produktdokumentation legt der Workflow selbst an. Du prüfst den Pull Request und führst ihn zusammen; der Workflow «Release» veröffentlicht danach die neue Version.

Nutzende können neue Fassungen im Navigator selbst über **Aktualisieren** laden. Der feste Einbau erspart ihnen diesen Schritt.

### Pull Request prüfen und zusammenführen

1. Öffne im Repository **Pull requests** und darin den Pull Request des Workflows. Er stammt von `github-actions` und liegt auf dem Zweig `fassungen/einbau`.
2. Lies den Abschnitt «Befund». Er nennt die neuen Fassungen mit Links zu EUR-Lex.
3. Lies den Abschnitt «Was sich ändert». Er nennt je Rechtsakt den neuen Stand und je Sprache die geänderten Bestimmungen. Beim SGK stehen zusätzlich der Akt des Stands und die Herkunftsangabe, die der Navigator zeigt.
4. Prüfe die Abschnitte «Prüfberichte», «Übrige Stände» und «Tests». Woran du einen guten Pull Request erkennst, steht in der Liste unten.
5. Gib den Lauf «CI» frei: Unten im Pull Request steht «Some checks are waiting for approval». Wähle dort **Approve workflows to run**. Nach einigen Minuten zeigt der Pull Request «CI / Tests und Build» mit grünem Haken. GitHub verlangt diese Freigabe, weil der Pull Request von einem Workflow stammt. Die Freigabe wiederholt die bereits gelaufenen Tests aus dem Abschnitt «Tests» auf dem Stand des Pull Requests (ohne die Tests mit den Rohdaten von EUR-Lex). Fehlt **Approve workflows to run** und erscheint kein Lauf «CI», wähle unten **Close pull request** und danach **Reopen pull request**. Das startet «CI».
6. Lies den Abschnitt «Text im Changelog». Er wird zum Text der Release. Du darfst ihn vor dem Zusammenführen verbessern: Öffne **Files changed**, klicke bei `CHANGELOG.md` auf das Menü **…** und wähle **Edit file**. Speichere mit **Commit changes** im selben Zweig.
7. Wähle **Merge pull request** und **Confirm merge**. Nennt das Issue «Neue Fassungen auf EUR-Lex» keine Akte und Vorschläge zur Information mehr, schliesst der Pull Request es automatisch.
8. Prüfe die Veröffentlichung wie im Abschnitt «Prüfen, ob die Veröffentlichung geklappt hat».

Ein guter Pull Request erfüllt diese Punkte:

- Er ist kein Entwurf und beginnt nicht mit «Nicht zusammenführen».
- Die Version ist das Datum des Einbaus und neuer als die bisherige.
- «Was sich ändert» nennt nur die Rechtsakte und Fassungen aus dem Befund.
- Unter «Prüfberichte» zeigt jede Zeile «bestanden» oder «Hinweis». Ein Hinweis heisst: Eine Zahl ist gestiegen oder eine Prüfung ist für den neuen Akt noch nicht eingerichtet. Der genannte Bericht begründet jeden Fall; fehlt eine Prüfung, richtet ein Agent sie ein.
- Unter «Übrige Stände» steht «Alle bisherigen Stände aller Rechtsakte sind inhaltlich unverändert.»
- Unter «Tests» zeigt jede Zeile «bestanden».

### Wenn der Pull Request ein Entwurf ist

Scheitert der Einbau, eine Prüfung oder ein Test, eröffnet der Workflow den Pull Request als Entwurf. Der Text beginnt mit «Nicht zusammenführen» und nennt die Gründe. Der Lauf «Fassungen» ist rot.

1. Führe den Entwurf nicht zusammen.
2. Lies die Gründe am Anfang des Pull Requests. Bei einem fehlgeschlagenen Test stehen die letzten Zeilen der Ausgabe unter «Tests».
3. Liegt die Ursache bei EUR-Lex, Cellar oder im Netz (zum Beispiel `nicht ladbar`, `HTTP 503` oder eine Zeitüberschreitung), starte den Workflow «Fassungen» unter **Actions** über **Run workflow** neu. Er baut den Einbau neu und aktualisiert den Pull Request.
4. Bleibt der Fehler, kopiere diesen Auftrag für einen Agenten und ersetze `…` durch die Nummer des Pull Requests:

   ```
   Der Einbau der neuen Fassungen ist gescheitert. Pull Request #… im Repository SEM-SGG/sgk-navigator ist ein Entwurf: Bring ihn in Ordnung. Halte dich an AGENTS.md, Ablauf «Gescheiterter Einbau neuer Fassungen».
   ```

   Der Agent baut die Fassung ein, führt Prüfungen und Tests aus und eröffnet einen eigenen Pull Request. In dessen Beschreibung nennt er die Ursache und was du kontrollieren sollst. Prüfe diesen Pull Request und führe ihn zusammen. Schliesse danach den Entwurf mit **Close pull request**.

Ein offener Pull Request ohne Fehler und mit demselben Befund bleibt beim nächsten Lauf unverändert. Ein Entwurf nach einem Fehler wird bei jedem Lauf neu gebaut. Führt EUR-Lex inzwischen weitere Fassungen, baut der Lauf alle ein und überschreibt den Zweig.

Eröffnet der Workflow das Issue, aber keinen Pull Request, ist schon das Laden der Rohdaten gescheitert. Starte den Workflow später über **Run workflow** neu.

### Wenn Fachangaben fehlen

Eine neue Fassung des SGK bildet einen neuen Stand, der einem Änderungsakt zugeordnet ist. Der Workflow bestimmt den Akt aus der Liste der Änderungsakte von EUR-Lex. Kennt `data/acts.json` diesen Akt noch nicht, fehlen Angaben, die nur eine Fachperson machen kann: die Anwendbarkeit (ab wann die Änderungen gelten, mit Fundstelle) und eine Kurzbezeichnung in Deutsch, Französisch und Englisch. Der Pull Request ist dann ein Entwurf mit dem Hinweis «Nicht zusammenführen, bevor die Fachangaben ergänzt sind». Der Abschnitt «Von dir zu liefern» nennt, was fehlt, und enthält einen Auftrag zum Kopieren.

1. Kläre die Angaben fachlich, zum Beispiel anhand des Akts auf EUR-Lex.
2. Kopiere den Auftrag aus dem Pull Request, ersetze `…` durch deine Angaben und gib ihn einem Agenten. Er hat diese Form:

   ```
   Erfasse den Akt … in data/acts.json im Repository SEM-SGG/sgk-navigator. Die Anwendbarkeit lautet: … (ab wann, Fundstelle; abweichende Daten einzelner Bestimmungen). Die Kurzbezeichnung lautet: … (DE), … (FR), … (EN). Halte dich an AGENTS.md, Ablauf «Akt erfassen».
   ```
3. Prüfe den Pull Request des Agenten (er enthält eine Tabelle mit den neuen Angaben) und führe ihn zusammen (**Merge pull request**, **Confirm merge**).
4. Starte den Workflow «Fassungen» neu: Öffne **Actions**, wähle links **Fassungen**, klicke rechts auf **Run workflow** und bestätige mit **Run workflow**. Der Workflow baut den Entwurf mit den neuen Angaben neu. Ist der Pull Request kein Entwurf mehr, prüfe ihn und führe ihn zusammen wie oben beschrieben.

Für die EES-, ETIAS-, VIS- und Interoperabilitäts-Verordnung braucht der Einbau keine Fachangaben; die Anwendbarkeit ist dort nicht erhoben.

## Akte und Vorschläge zur Kenntnis nehmen

Das Issue «Neue Fassungen auf EUR-Lex» nennt unter «Zur Information» neue Änderungsakte, Berichtigungen, Abweichungen und Vorschläge. Hier besteht kein Handlungsbedarf: Den Wortlaut eines Änderungsakts übernimmt der Navigator mit der nächsten konsolidierten Fassung. Damit die Einträge nicht jede Woche wieder erscheinen und der Navigator sie unter **Aktualisieren** nicht als neu zählt, nimmst du sie zur Kenntnis:

1. Öffne im Issue den Link «data/zur-kenntnis.txt zum Bearbeiten». GitHub öffnet die Datei direkt im Bearbeitungsmodus.
2. Kopiere die Zeilen aus dem Kasten im Issue ans Ende der Datei. Lösche Zeilen, die du noch nicht zur Kenntnis nehmen willst. Jede Zeile beginnt mit der CELEX-Nummer (Kennnummer des EU-Rechtsakts); die Bemerkung dahinter darfst du ändern.
3. Wähle **Commit changes…**, dann **Create a new branch for this commit and start a pull request** und **Propose changes**, danach **Create pull request**.
4. Sobald der Lauf «CI» grün ist, führe den Pull Request zusammen (**Merge pull request**, **Confirm merge**).

Die nächste Prüfung schliesst das Issue, wenn nichts mehr offen ist. Im Navigator erscheinen die Einträge ab der nächsten Version als «zur Kenntnis genommen». Konsolidierte Fassungen lassen sich so nicht abstellen; sie baut der Workflow selbst ein.

Soll ein Akt im Navigator in der Liste der Akte erscheinen (mit Anwendbarkeit für die Schweiz), gib einem Agenten den Auftrag aus [`AGENTS.md`](AGENTS.md), Ablauf «Akt erfassen».

## Wenn ein Lauf rot ist

Ein rotes Kreuz bei einem Pull Request oder Lauf heisst: Eine Prüfung ist fehlgeschlagen. Für die Nutzenden ändert sich dadurch nichts; erst eine Release verteilt eine neue Datei.

1. Öffne unter **Actions** den roten Lauf und darin den roten Schritt. Die letzten Zeilen nennen den Fehler.
2. Häufige Ursachen:

| Meldung | Ursache | Behebung |
| --- | --- | --- |
| `CHANGELOG.md, Zeile …: Version … hat nicht die Form JJJJ.MM.TT` | Tippfehler in der Überschrift | Überschrift genau in der Form `## 2026.12.02 (2. Dezember 2026)` schreiben |
| `CHANGELOG.md, Zeile …: Version … muss neuer sein …` | Neuer Abschnitt nicht zuoberst oder Datum zu alt | Abschnitt zuoberst einfügen; bei zwei Versionen am selben Tag `-2` anhängen |
| `docs/sgk-navigator-dokumentation.html: Die Versionsangabe passt nicht …` | Die Produktdokumentation nennt eine andere Version | Die Meldung nennt jede betroffene Zeile. Gib einem Agenten den Auftrag aus Abschnitt «Neue Version veröffentlichen», Schritt 6 |
| `CHANGELOG.md hat keinen Abschnitt «## … (Datum)»` | Release von Hand mit einer Version ohne Abschnitt | Abschnitt im Changelog ergänzen oder das Feld für die Version leer lassen |
| Fehler im Schritt «Auf GitHub Pages veröffentlichen» | Download-Seite ist nicht eingerichtet | Abschnitt «Einmalige Einrichtung» |
| Ein Test schlägt fehl (`✘`, `not ok`) | Die Änderung hat ein Verhalten verändert | Änderung zurücknehmen oder berichtigen; bei Unklarheit ein Issue eröffnen und einem Agenten den Auftrag «Behebe den Fehler aus Issue #…» (`AGENTS.md`) geben |
| Lauf «Fassungen» rot, Pull Request ist ein Entwurf | Einbau, Prüfung oder Test gescheitert | Abschnitt «Wenn der Pull Request ein Entwurf ist» |
| Lauf «Fassungen» rot im Schritt «Mit EUR-Lex vergleichen und Issue nachführen»: `Kein Rechtsakt konnte geprüft werden` | Der Endpunkt des Amts für Veröffentlichungen war nicht erreichbar | Später über **Run workflow** neu starten oder die nächste Woche abwarten |
| `Rohdaten von EUR-Lex und Cellar nicht geladen` | EUR-Lex und Cellar waren nicht erreichbar | Workflow «Fassungen» später über **Run workflow** neu starten |
| `GitHub Actions is not permitted to create or approve pull requests` | Einstellung für Pull Requests fehlt | Abschnitt «Einmalige Einrichtung», Schritt 4 |
| Am Montag ist kein Lauf «Fassungen» erschienen | GitHub hat den zeitgesteuerten Lauf verzögert, ausgelassen oder abgeschaltet | Abschnitt «Zeitgesteuerter Lauf: Übergabe, Verspätung, Start von Hand» |

3. Bei fehlgeschlagenen Oberflächentests liegt unter **Summary** → **Artifacts** das Paket `playwright-ergebnisse` mit Bildschirmfotos.
4. Ist die Ursache unklar oder liegt sie ausserhalb des Repositorys (zum Beispiel ist GitHub gestört oder der Download von Chromium fehlgeschlagen), wähle oben rechts **Re-run jobs**. Bleibt der Lauf rot, eröffne ein Issue mit dem Link zum Lauf und gib einem Agenten den Auftrag «Behebe den Fehler aus Issue #…» (`AGENTS.md`).

## Pull Requests von Dependabot

Dependabot (der automatische Aktualisierungsdienst von GitHub) eröffnet einmal im Monat einen Pull Request, der alle neuen Versionen der verwendeten GitHub Actions zusammenfasst (Einstellung `.github/dependabot.yml`). Die Pakete von npm (JavaScript-Bibliotheken für Bau und Tests) aktualisiert er nicht, weil ein Update die gebaute Datei verändern kann.

1. Öffne unter **Pull requests** den Pull Request von Dependabot. Er stammt von `dependabot` und heisst zum Beispiel «GitHub Actions: Bump the github-actions group …».
2. Sind alle Prüfungen grün, wähle **Merge pull request** und **Confirm merge**. Eine neue Version braucht es dafür nicht.
3. Ist eine Prüfung rot oder bist du unsicher, kopiere diesen Auftrag für einen Agenten und ersetze `…` durch die Nummer des Pull Requests:

   ```
   Bearbeite den Pull Request von Dependabot #… im Repository SEM-SGG/sgk-navigator. Halte dich an AGENTS.md, Ablauf «Pull Request von Dependabot bearbeiten».
   ```

Die Workflows «Release» und «Fassungen» laufen erst nach dem nächsten Merge bzw. am nächsten Montag. Prüfe nach ihrem nächsten Lauf unter **Actions**, ob sie grün sind.

## BETA-Kennzeichnung entfernen

Während der Erprobung steht in der Kopfzeile des Navigators rechts neben dem Produktnamen das Etikett «BETA». Ist die Erprobung abgeschlossen, kopiere diesen Auftrag für einen Agenten:

```
Entferne die BETA-Kennzeichnung im Repository SEM-SGG/sgk-navigator. Halte dich an AGENTS.md, Ablauf «BETA-Kennzeichnung entfernen».
```

Der Agent stellt den Schalter um, passt Tests und Texte an und eröffnet einen Pull Request mit neuer Version. Das Käfersymbol für Rückmeldungen bleibt. Prüfe den Pull Request und führe ihn zusammen; der Workflow «Release» veröffentlicht danach die Version ohne Etikett.

## Zeitgesteuerter Lauf: Übergabe, Verspätung, Start von Hand

Der Workflow «Fassungen» startet von selbst am Montagmorgen. GitHub führt ihn auf das Konto der Person aus, die ihn zuletzt eingerichtet oder wieder eingeschaltet hat. Nur diese Person erhält die Fehlermail. Verlässt sie die Organisation, läuft der Workflow weiter, aber die Fehlermails gehen weiter an sie.

**Bei der Übergabe an eine Nachfolge** (am besten vor dem Austritt der bisherigen Person):

1. Die neue zuständige Person meldet sich mit ihrem eigenen Konto bei GitHub an. Sie braucht Schreibrecht auf das Repository `SEM-SGG/sgk-navigator`.
2. Unter ihrem Profilbild → **Settings** → **Notifications** → **GitHub Actions** schaltet sie **Email** ein und wählt **Only notify for failed workflows**.
3. Im Repository öffnet sie **Actions** und wählt links den Workflow «Fassungen». Sie klickt rechts auf **…** → **Disable workflow** und gleich danach auf **Enable workflow**. Ab jetzt erhält sie die Fehlermails.

**Wenn der Lauf ausbleibt:** GitHub startet zeitgesteuerte Läufe oft mehrere Stunden zu spät, an manchen Tagen auch gar nicht. Warte bis Dienstagmorgen. Fehlt der Lauf dann noch, starte ihn von Hand: **Actions** → Workflow «Fassungen» wählen → rechts **Run workflow** → Branch `main` lassen, Schalter **Probelauf** aus lassen → **Run workflow**. Ein Lauf von Hand eröffnet keine doppelten Issues oder Pull Requests: Er aktualisiert das offene Issue «Neue Fassungen auf EUR-Lex» oder schliesst es, wenn nichts mehr offen ist. Einen offenen Pull Request des Workflows mit demselben Befund lässt er stehen; nach einem Fehler oder mit neuem Befund baut er ihn neu, statt einen zweiten zu eröffnen.

**Wenn GitHub den Workflow abgeschaltet hat:** Bei öffentlichen Repositories schaltet GitHub zeitgesteuerte Workflows nach 60 Tagen ohne Aktivität im Repository ab. Zeigt **Actions** einen entsprechenden Hinweis, wähle den Workflow «Fassungen» und klicke **Enable workflow**. Wer das tut, erhält ab dann die Fehlermails.

**Probelauf:** Mit **Run workflow** und dem Schalter **Probelauf: nichts eröffnen und nichts ändern (kein Issue, kein Pull Request)** prüfst du den Ablauf, ohne etwas zu ändern: kein Issue, kein Push, kein Pull Request. Mit dem zusätzlichen Schalter **Nur im Probelauf: Rohdaten laden und alles neu bauen und testen, auch ohne neue Fassung** lädt der Lauf auch ohne neue Fassung alle Rohdaten von EUR-Lex und Cellar, baut alles und lässt alle Tests laufen. Den Text, den der Pull Request hätte, findest du in der Zusammenfassung des Laufs und im Artefakt «einbau» (`pr.md`). Ein Artefakt ist eine ZIP-Datei mit Ergebnissen des Laufs; du lädst sie auf der Seite des Laufs unten unter **Artifacts** herunter.

## Einmalige Einrichtung

Diese Einstellungen nimmt einmalig eine Person mit Administratorrecht im Repository bzw. in der Organisation vor:

1. **Download-Seite (Pages):** Öffne im Repository **Settings** → **Pages** und wähle unter **Build and deployment** bei **Source** den Eintrag **GitHub Actions**.
2. **Actions erlauben:** Öffne **Settings** → **Actions** → **General** und wähle «Allow all actions and reusable workflows» (oder mindestens Actions von GitHub, `actions/*`).
3. **Rechte der Workflows:** Unter **Workflow permissions** genügt «Read repository contents and packages permissions»; die Workflows fordern die nötigen Rechte selbst an.
4. **Pull Requests durch Workflows erlauben:** Setze im selben Abschnitt das Häkchen bei **Allow GitHub Actions to create and approve pull requests** und wähle **Save**. Ohne diese Einstellung eröffnet der Workflow «Fassungen» keinen Pull Request. Ist das Häkchen ausgegraut, sperrt die Organisation die Einstellung: Eine Person mit Admin-Recht in der Organisation setzt dasselbe Häkchen zuerst dort (Organisation **SEM-SGG** → **Settings** → **Actions** → **General** → **Workflow permissions**); danach lässt es sich im Repository setzen.
5. **Labels (optional):** Lege unter **Issues** → **Labels** die Labels `fehler`, `fassung` und `wunsch` an, damit die Vorlagen für Issues sie automatisch setzen können.

Wird das Repository umbenannt oder zieht es in eine andere Organisation um, passt ein Agent `src/app/config/update-source.js` (Owner, Repo) und die festen Adressen in `README.md`, `MAINTAINING.md`, `AGENTS.md`, der Produktdokumentation `docs/sgk-navigator-dokumentation.html`, der Anleitung im Werkzeug (`src/app/i18n/de-ra.js`, `fr-ra.js`), `.github/ISSUE_TEMPLATE/config.yml`, `site/`, `package.json` und `scripts/apply-fassungen.mjs` sowie `scripts/fassungen/einbau-lib.mjs` (Aufträge und Links im Pull Request des Workflows) an. Erst die danach gebauten Versionen finden die neue Adresse.

## Lokal arbeiten

Diesen Weg geht ein Agent oder eine Person mit Node.js auf ihrem Gerät. Einmalig: Node.js 22 installieren, das Repository klonen (`git clone https://github.com/SEM-SGG/sgk-navigator.git`) und im Ordner `npm ci` ausführen. Für die Oberflächentests zusätzlich `npx playwright install chromium` ausführen und die Umgebungsvariable `SGK_CHROME=bundled` setzen (oder Chrome unter `/usr/bin/google-chrome` nutzen). Hinter einem Proxy liest Node.js die Variable `HTTPS_PROXY` nur mit `NODE_USE_ENV_PROXY=1`.

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

**Testdateien ausserhalb des Repositorys** (nicht Teil des Einbaus): Für die Tests des Moduls Verhandlung lädt `node scripts/neg/fetch-raw.mjs` die öffentlichen Ratsdokumente nach `raw-neg/`. Für die Upload-Tests lädt `node test/app/tools/fetch-eurlex.mjs …` (Chrome, Netz) Dateien nach `test/app/fixtures-live/`. Ohne diese Ordner überspringen sich die betroffenen Tests.
