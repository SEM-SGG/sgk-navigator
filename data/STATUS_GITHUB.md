# Status: Veröffentlichung im öffentlichen Repo SEM-SGG/sgk-navigator

Stand: 18. November 2026.

## 1 Ergebnis

- Öffentliches Repo `SEM-SGG/sgk-navigator` (Organisation der Sektion Grundlagen Grenze). Initial-Commit auf `main`, noch nicht
  gepusht. Quellcode, Daten, Tests, Workflows, Download-Seite (Vorlage), Anleitungen.
- Grösse des Arbeitsbaums rund 17 MB (372 Dateien), grösste Datei `data/assets.json` 2,5 MB. Keine gebaute HTML-Datei im Repo.
- Das private Repo `sgg-toolkit` ist nicht berührt.

## 2 Update-Quelle (Hinweis auf neue Versionen im Tool)

Konfiguration: `src/app/config/update-source.js` (Owner `SEM-SGG`, Repo `sgk-navigator`; daraus alle Links).

| Reihenfolge | Quelle | Adresse |
| --- | --- | --- |
| 1 | Manifest auf GitHub Pages | `https://sem-sgg.github.io/sgk-navigator/version.json` |
| 2 (nur wenn 1 scheitert) | Releases-API | `https://api.github.com/repos/SEM-SGG/sgk-navigator/releases/latest` |

- Manifest: `{ version, date, url, page, release, notes: { de, fr }, dateText, data }`; das Tool liest `version`, `date`, `url`,
  `page`, `notes`. `url` = Release-Asset der Version (`…/releases/download/v<Version>/SGK-Navigator.html`), `page` = Download-Seite.
- Begründung: Pages sendet `Access-Control-Allow-Origin: *` (geprüft) und kennt kein Limit von 60 Anfragen pro Stunde und
  IP-Adresse wie die API ohne Anmeldung (am SEM teilen sich viele Nutzende eine IP-Adresse hinter dem Proxy). Die API bleibt als
  Ersatz, falls Pages gesperrt oder noch nicht eingerichtet ist; der Mehraufwand ist klein (ein zweiter Versuch in `fetchLatest`).
- Download über das Release-Asset statt über eine Kopie auf Pages: GitHub liefert Release-Assets als Download (Content-Disposition
  attachment) ohne Anmeldung. Eine Kopie auf Pages würde der Browser als Webseite unter `https://sem-sgg.github.io` öffnen statt
  herunterladen; das Tool liefe dann mit einem anderen Browser-Speicher als die lokale Datei (Uploads und Notizen wären nicht da).
- Fehlerwahl, wenn beide Quellen scheitern: Fehler der API, wenn das Manifest nicht erreichbar war oder fehlte (offline, 404),
  sonst Fehler des Manifests. Automatische Suche: still; manuelle Suche: Meldung wie bisher.
- CSP `connect-src`: `https://publications.europa.eu https://sem-sgg.github.io https://api.github.com data: blob:`; `script-src`
  unverändert. Build-Option: `--update-source manifest:<URL>[+github-release:<owner>/<repo>]`, `default`, `none`.
- Oberfläche: Hinweis mit «Neue Version herunterladen» (Release-Asset) und «Was ist neu» (Download-Seite bzw. Release-Seite);
  «Info» → «Version» mit Abschnitt «Projekt»: «Projektseite und Download», «Quellcode auf GitHub», «Fehler melden» (Hinweis auf
  nötiges Konto, keine vertraulichen Inhalte, ohne Konto an die SGG). Anleitung «Neue Version des Tools erhalten» (DE/FR) angepasst.

## 3 Download-Seite (GitHub Pages)

- Vorlage `site/` (HTML, CSS, JS ohne externe Quellen; IBM Plex Sans/Mono als woff2 von Pages selbst, sonst Systemschrift),
  Build `scripts/build-site.mjs` → `dist/site/` mit `index.html`, `version.json`, `fonts/` (mit `OFL.txt`), `.nojekyll`.
- Inhalt DE/FR (Umschalter, Wahl gespeichert, Browsersprache als Vorgabe; ohne JavaScript beide Sprachen untereinander): Zweck,
  Schaltfläche «SGK-Navigator herunterladen», Version und Datum, drei Schritte, «Was ist neu» mit Datenstand je Rechtsakt,
  Hinweis «keine amtliche Veröffentlichung», Kontakt SGG ohne Personennamen, Links Fehler melden und Quellcode, EU-Rechtshinweis.
- Werte stehen beim Build in der Seite; `site.js` gleicht sie mit `version.json` ab. CSP der Seite nur `'self'`.
- Prüfung (`test/app/site.spec.mjs`): Inhalt DE/FR, Link, Tastatur, schmale Breite, keine externen Anfragen, axe-core WCAG 2.1 AA
  ohne Verstösse.

## 4 Workflows (`.github/workflows/`)

| Datei | Auslöser | Rechte | Inhalt |
| --- | --- | --- | --- |
| `ci.yml` | Push (alle Branches), Pull Request, manuell | `contents: read` | `npm ci`, Einheitstests (core, app:unit, neg), Build und Download-Seite, Chromium von Playwright, Oberflächentests ohne `@netz` und `@daten` |
| `release.yml` | Tag `v*` oder manuell mit Version und Kurztext DE/FR | Job 1 `contents: write`, Job 2 `pages: write`, `id-token: write` | Version prüfen (Schema, nicht vorhanden, nur `main`), Einheitstests, Build mit `--version`, Kurzprüfung Oberfläche, Download-Seite, Release mit Asset `SGK-Navigator.html` und Notizen, danach Pages |
| `fassungen.yml` | Montag 04:17 UTC, manuell (mit Trockenlauf) | `contents: read`, `issues: write` | `scripts/check-fassungen.mjs`: gleiche SPARQL-Abfragen (`src/app/lib/sparql.js`, `checkUpdates` mit fetch statt JSONP) und Statuslogik (`updatelogic.js`) wie im Tool, gegen die Daten im Repo; Issue «Neue Fassungen verfügbar» eröffnen oder aktualisieren (Marker im Text, Kommentar bei neuen Einträgen), kein Issue ohne Neues |

- Actions in Major-Versionen gepinnt: `actions/checkout@v6`, `actions/setup-node@v6`, `actions/upload-artifact@v6`,
  `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`. Die Major-Nummern wurden nicht direkt bei GitHub geprüft (kein
  Zugriff aus der Arbeitsumgebung), sondern über Fremdquellen; `dependabot.yml` hält sie monatlich aktuell.
- `actionlint` 1.7.12 mit `shellcheck` 0.11.0: keine Befunde.
- Testauswahl: Tag `@netz` (Live-Abfragen) und `@daten` (Dateien aus `raw/`, `raw-neg/`, `test/app/fixtures-live/`) in den
  Playwright-Tests; ohne die Dateien überspringen sich die Tests auch selbst. Playwright nutzt `/usr/bin/google-chrome`, falls
  vorhanden, sonst (oder mit `SGK_CHROME=bundled`) das Chromium von Playwright; Proxy nur, wenn `HTTPS_PROXY` gesetzt ist.
- Fassungsprüfung live am 18.11.2026 (Trockenlauf): SGK, ETIAS-VO, VIS-VO nichts Neues; EES-VO `32025R1534`, `52024PC0567`;
  IO-VO `52026PC1037` (wie die Prüfung im Tool). Ablauf mit `gh` simuliert (Eröffnen, Aktualisieren mit Kommentar).

## 5 Repo-Inhalt

Aufgenommen: `src/`, `data/` (Datensätze, Prüfberichte, Notizen), `design/`, `docs/entwicklung/` (Spezifikationen und
Statusberichte, aus dem Wurzelverzeichnis verschoben), `scripts/` (ohne Ausgaben; `scripts/out/works/` als Zwischenspeicher für
`build-work.mjs --offline`), `site/`, `test/` (mit kleinen Fixtures), `build.mjs`, `package.json`, `package-lock.json`,
`README.md`, `MAINTAINING.md`, `THIRD_PARTY.md`, `.github/` (Workflows, Vorlagen für Issues, Dependabot).

Nicht aufgenommen (`.gitignore` bzw. beim Kopieren ausgelassen): `node_modules/`, `dist/`, `raw/`, `raw-neg/`,
`test/app/fixtures-live/` (36 MB, per `test/app/tools/fetch-eurlex.mjs` ladbar), `test/app/out/`, `test/app/tmp/`,
`test/app/screenshots/`, `test-results/`, `test/neg/out/`, `scripts/neg/out/` (47 MB Zwischenspeicher), `scripts/out/*.json`
(Protokolle), `scripts/neg/dev/` (Entwicklungsskizzen mit festen lokalen Pfaden), `scripts/package.json` und
`scripts/package-lock.json` (unbenutzt; die Skripte nutzen die Abhängigkeiten der Wurzel), `feedback/` (Bildschirmfotos aus der
Entwicklung), `*.zip`.

Bereinigt: Personennamen in `docs/entwicklung/SPEC*.md`, `design/carbon/design-system.json`, `design/carbon/umstellung.md`;
lokale Pfade und das frühere Konto in `data/STATUS_*.md`; feste Ausgabepfade der Tests (`test/app/version.spec.mjs`,
`stored.spec.mjs`) auf `test/app/screenshots/` bzw. Umgebungsvariable.

Neu: `scripts/fetch-raw-sgk.mjs` (Quelldateien des SGK nach `raw/` laden), `scripts/check-fassungen.mjs` und
`scripts/fassungen/`, `scripts/build-site.mjs`, `test/app/fassungen.test.mjs`, `test/app/site.spec.mjs`.

## 6 Prüfungen

- Geheimnisse: `detect-secrets` (alle Dateien) meldet nur Zeichenfolgen hoher Entropie in eingebetteten Bildern, Schriften und
  Prüfsummen (Asset-Kennungen); gezielte Suche nach Tokens (GitHub, AWS, Slack, Google, private Schlüssel, Passwort-Zuweisungen):
  keine Funde.
- Persönliche Angaben: Suche nach Personennamen, E-Mail-Adressen, Telefonnummern, lokalen Pfaden, Kontonamen: keine Funde. Die
  Beispiel-Dossiers enthalten nur Platzhalter («Stelle A (Beispiel)», Kürzel «BSP») und Auszüge aus öffentlichen
  Dokumenten, darunter LIMITE-gekennzeichnete Ratsdokumente aus dem öffentlichen Register (Entscheid des Auftraggebers: freigegeben).

## 7 Tests vorher / nachher

| Suite | vorher | nachher |
| --- | --- | --- |
| core (`npm run test:core`) | 43 bestanden, 7 fehlgeschlagen (raw/), 8 übersprungen (58) | 46 bestanden, 0 fehlgeschlagen, 18 übersprungen (64) |
| `npm run test:app:unit` | 54 / 54 | 59 / 59 (neu: fassungen.test.mjs 4, updatecheck.test.mjs +1) |
| `npm run test:neg` | 41 bestanden, 9 übersprungen | 41 / 9 |
| Playwright, alle Specs (Chrome 153, Proxy) | 110 bestanden, 2 fehlgeschlagen (112) | 114 bestanden, 2 übersprungen (116) |
| Playwright, CI-Auswahl (`npm run test:app:ci`, ohne Proxy, Chromium von Playwright) | – | 104 bestanden (104) |

Core: Die 7 Fehlschläge ohne `raw/` sind jetzt Überspringungen; `rationale.test.mjs` brach vorher als Ganzes ab (1 Fehlschlag)
und zeigt jetzt 7 Einzeltests (3 laufen, 4 brauchen `raw/`). Playwright: die 2 Tests mit `raw-neg/` überspringen sich jetzt;
neu `site.spec.mjs` (3) und ein Test für die Vorgabe-Quelle in `version.spec.mjs`.

## 8 Einmalig auf GitHub einzurichten

1. «Settings» → «Pages» → «Source»: «GitHub Actions».
2. «Settings» → «Actions» → «General»: Actions erlauben (mindestens `actions/*`); falls die Organisation Actions einschränkt,
   dort freigeben.
3. Für Releases per Tag: Umgebung `github-pages` → Regel für Tags `v*` (der Weg über «Run workflow» auf `main` braucht das nicht).
4. Optional Labels `fehler` und `fassung`.
5. Erstes Release über «Actions» → «Release» → «Run workflow» (z. B. Version `2026.11.18`). Vorher liefern Manifest und API 404;
   das Tool bleibt dann still bzw. meldet manuell «Es ist noch keine Version veröffentlicht.».

## 9 Offene Punkte und Grenzen

- **Lizenz des Codes:** nicht festgelegt (ohne Lizenz: einsehbar, aber nicht zur Weiterverwendung freigegeben). Optionen: MIT oder
  Apache-2.0 (freizügig), EUPL-1.2 (Copyleft, in der Bundesverwaltung und EU verbreitet), oder bewusst keine Lizenz.
- Französischer Name der Sektion: auf der Download-Seite und im Tool steht «Sektion Grundlagen Grenze (SGG)» auch im FR-Text,
  weil die amtliche französische Bezeichnung nicht bekannt war.
- Edge nicht geprüft (nur Chrome 153 und Chromium von Playwright).
- Workflows nicht auf GitHub ausgeführt (kein Push aus der Arbeitsumgebung); geprüft mit actionlint, lokal nachgestellt
  (Testauswahl ohne Proxy, `gh` simuliert). Auf dem Runner fehlt LibreOffice; die entsprechenden Tests überspringen sich.
- Ob das SEM-Netz `sem-sgg.github.io`, `api.github.com` und die Download-Server von GitHub (`objects.githubusercontent.com` bzw.
  `release-assets.githubusercontent.com`) durchlässt, ist nicht geprüft.
- Geplante Workflows werden bei öffentlichen Repos nach 60 Tagen ohne Aktivität deaktiviert.
- `scripts/build-data.mjs` (Neubau SGK) braucht für Bilder das nicht deklarierte Paket `sharp`; der Neubau des SGK für eine neue
  Fassung verlangt eine Änderung im Programm (Stand in `buildAll`), siehe `MAINTAINING.md`.
- `test/export/*` hat kein npm-Skript und ist nicht Teil der CI (wie bisher).
