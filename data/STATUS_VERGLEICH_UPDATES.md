# Status: Upload ↔ zentraler Build, doppelte Stände, Hinweis auf neue Versionen

Stand: 18. November 2026.

## 1 Äquivalenztest Upload ↔ zentraler Build

### Vorgehen

- Jüngste konsolidierte Fassung je Werk, geprüft per SPARQL am 18.11.2026 (Abfrage über `cdm:act_consolidated_based_on_resource_legal`,
  Sprachfassungen DE/FR/EN): SGK `02016R0399-20251012`, EES-VO `02017R2226-20260612`, ETIAS-VO `02018R1240-20260612`,
  VIS-VO `02008R0767-20260612`, IO-VO `02019R0817-20260612`. Alle fünf gibt es in DE, FR und EN; alle 15 Dateien wurden mit
  `test/app/tools/fetch-eurlex.mjs` nach `test/app/fixtures-live/` geladen (neu: 11 Dateien).
- Testvariante je Werk ohne diese Fassung: gemeinsame Funktion `scripts/lib-variant.mjs` (`lastStage`, `lastConsolidatedStage`,
  `dropStage`), genutzt von `build.mjs` (`--drop-stage`, `--drop-work-stage`, jetzt auch mehrere Werke: `ees:last,vis:last`) und
  vom Node-Test.
- Upload wie `handleFiles`: `parseEurLexFile` → `parseUpload` → `applySnapshot`, Datei für Datei (DE, FR, EN).
- Zwei Tests:
  - `test/app/equiv.test.mjs` (Node, linkedom wie der zentrale Build, rund 9 s; in `npm run test:app:unit`). Lädt `src/app/data.js`,
    `ui/compare.js`, `ui/chronology.js` über einen Ladehaken (`test/app/equiv/register.mjs`, bildet `sgk-core/*` auf `src/core` ab).
  - `test/app/equiv.spec.mjs` (Playwright, Parser von Chrome): Variante `sgk-navigator-upload-all.html` ohne jüngste Fassung aller
    fünf Werke, Upload der 15 Dateien über die gemeinsame Ablage, Vergleich mit `dist/` im Browser.
- Verglichen je Werk und Sprache: (a) Einheiten, Blockschlüssel und -reihenfolge, Typ, normalisierter Text, Gliederungszeichen,
  Herkunft, Tiefe, Kennzeichen (`x`), Hinweistext, Bild; (b) Verweisindex des Stands (`Data.refIndex`): ausgehende Verweise je Block
  mit Zielen, eingehende je Einheit und je Block; (c) Vergleich/Redline gegen den Vorgänger (`compareRows`, `diffText`), Statuszeilen
  und Redline-Text; (d) Chronologie: geänderte Einheiten und Blöcke des Stands (`changesOfStage`) und Schritte je Einheit (`unitSteps`);
  (e) Sprachvergleich: gleiche Blockstruktur über DE/FR/EN. Zusätzlich: Reihenfolge der Sprachen beim Upload (EN, FR, DE) ohne Einfluss.
- Word-Export mit Änderungsverfolgung wurde nicht eigens verglichen (er speist sich aus denselben Versionen; nicht geprüft).

### Ergebnis (nach den Korrekturen in Abschnitt 1.1)

| Werk | Fassung | DE | FR | EN | Sprachvergleich | Stand-Metadaten |
| --- | --- | --- | --- | --- | --- | --- |
| SGK | 02016R0399-20251012 | gleich | gleich | gleich | gleich | erklärbar: act |
| EES-VO | 02017R2226-20260612 | gleich | gleich | gleich | gleich | erklärbar: act, acts |
| ETIAS-VO | 02018R1240-20260612 | gleich | gleich | gleich | gleich | erklärbar: act, acts |
| VIS-VO | 02008R0767-20260612 | gleich | gleich | gleich | gleich | erklärbar: act, acts |
| IO-VO | 02019R0817-20260612 | gleich ausser Art. 24 | gleich ausser Art. 24 | gleich ausser Art. 24 | gleich | erklärbar: act, acts |

«gleich» = (a) bis (d) ohne Abweichung. Browser (Chrome) und Node (linkedom) liefern dasselbe Ergebnis; Browser: SGK 2499, EES-VO 2611,
ETIAS-VO 3573, VIS-VO 1602, IO-VO 2589 Blöcke (DE+FR+EN) ohne Abweichung. IO-VO Art. 24: Fehler im **zentralen** Datensatz (1.2).

Vor den Korrekturen (Node, gleiche Dateien): SGK ohne Abweichung; EES-VO FR Art. 9 (Schlüssel `p2a~2` statt `p2b`, dadurch
Sprachvergleich, Verweis und Chronologie betroffen); ETIAS-VO 34/36/44 Abweichungen (DE/FR/EN), VIS-VO 2/36/36, IO-VO 26/15/15 (Herkunft
von Blöcken mit unverändertem Wortlaut, dadurch Scheinänderungen in der Chronologie und leere Änderungsschritte; IO-VO DE Art. 17
Schlüssel `p3.n4` statt `p4`; IO-VO FR/EN Art. 24 falsche Schlüssel und falsches Gliederungszeichen «a)» bei Abs. 3 Bst. c).

### 1.1 Gefundene Fehler in der Upload-Verarbeitung und Korrekturen

Ursache: Der zentrale Build der vier weiteren Werke (`scripts/build-work.mjs`) bearbeitet die Stände nach `buildDataset` nach; der
Upload tat das nicht. Der SGK-Stand s08 entsteht zentral mit `addSnapshot`, also auf demselben Weg wie ein Upload (keine Abweichung).

1. **Herkunft bei unverändertem Wortlaut** (ETIAS-VO, VIS-VO, IO-VO). Zentral behält ein Block mit gleichem Wortlaut die Herkunft
   der Vorfassung (`keepOriginWithoutTextChange`); der Upload übernahm die Marker der konsolidierten Fassung. Folge: Chronologie und
   «Was ist neu» zeigten Änderungen ohne Textänderung (z. B. ETIAS-VO Art. 20 Abs. 2 Bst. a–f, VIS-VO Art. 5, 18, 21).
2. **Schlüssel nach Sprachmehrheit** (EES-VO FR Art. 9 «2 bis.» doppelt; IO-VO DE Art. 17 «4.» statt «(4)»). Zentral gleicht
   `alignKeysToMajority` an; der Upload nicht. Folge: Sprachvergleich und Verweise auf diese Absätze stimmten nicht.
3. **Schlüsselabgleich bei einsprachigem Einarbeiten** (IO-VO FR/EN Art. 24). `rekey` ordnete neue Blöcke mit gleichem Wortlaut
   (Abs. 2a Bst. b, c) den unveränderten Bst. b, c von Abs. 3 zu; diese erhielten Ersatzschlüssel (`p3.ba`), Bst. c bekam den Schlüssel
   und das Gliederungszeichen «a)» von Abs. 4. Folge: falsches Gliederungszeichen im Text, falsche Zitierung.
4. **Eingebetteter Datensatz wurde verändert.** `applySnapshot` arbeitete auf `data.ds`, dessen Einheiten und Gliederung die
   Data-Instanz mit dem eingebetteten Datensatz teilt. Ein späteres erneutes Anwenden (Entfernen eines Uploads, Projektimport)
   ging von einem bereits veränderten Stand aus.

Korrekturen:

- `src/app/lib/uploadnorm.js` (neu): `addUploadedSnapshot` arbeitet für die weiteren Werke (`full: false`) dieselben Schritte wie
  `build-work.mjs` für den hochgeladenen Stand ein: Gliederungszeichen als Teil des Vergleichs (`withLabelInText`; in den geprüften
  Fassungen ohne messbare Wirkung, aus Gründen der Gleichheit übernommen), Bilder ohne eingebettete Daten (`asset: null`),
  `stage.langs` = eingelesene Sprachen, Schlüssel nach Sprachmehrheit (sobald alle drei Sprachen eingelesen sind), Herkunft ohne
  Textänderung. Für den SGK (`full`) unverändert `addSnapshot`. Die Regeln sind aus `build-work.mjs` portiert (dort unverändert).
- `src/app/data.js` `applySnapshot(dataset, parsed, { full, … })`: arbeitet auf `structuredClone(dataset)`; ruft `addUploadedSnapshot`
  mit `rekeyExactFirst: true`. `src/app/uploads.js` übergibt `full` (Werk).
- `src/core/model.js` (zwingend, dokumentiert): `rekey(…, opts)` mit `exactFirst`: zuerst werden alle Blöcke zugeordnet, deren
  Parser-Schlüssel in der Vorfassung mit gleichem Text vorkommt; erst danach die übrigen. Nur `addSnapshot` mit
  `opts.rekeyExactFirst` nutzt es. Ohne Option ist das Verhalten unverändert (Einheitstest); `buildDataset`, der zentrale Build und
  die Vorschau des Verhandlungsmoduls (`src/neg/preview.js`) sind nicht betroffen. Grund für den Eingriff im Kern: Die Zuordnung
  geschieht in `ingest`/`rekey` und lässt sich von aussen nicht beeinflussen.

### 1.2 Fehler im zentralen Datensatz (nicht behoben, Daten unverändert)

- IO-VO, Stand s05, Art. 24, DE/FR/EN: doppelte Schlüssel `p3.b` und `p3.c` (einmal in Abs. 2a, einmal in Abs. 3). Ursache wie 1.1
  Nr. 3 in `buildDataset` (gemeinsamer Abgleich aller Sprachen). Der Upload führt korrekt `p2a.b`, `p2a.c`. Suche über alle fünf
  Datensätze: keine weiteren doppelten Schlüssel. Empfehlung für den nächsten Neubau: `exactFirst` auch in `buildDataset`
  verwenden und den Datensatz mit `scripts/validate-works.mjs` prüfen (dafür wird `raw/` gebraucht).
- Im Test gezielt ausgenommen: nur Einheit `art_24` der IO-VO in Stand s05 (`test/app/equiv/expected.mjs`, `KNOWN_CENTRAL`); der
  Test schlägt fehl, sobald die Abweichung nicht mehr auftritt (Ausnahme dann entfernen).

### 1.3 Erklärbare, gewollte Unterschiede (im Test gezielt ausgenommen)

| Feld | zentraler Build | Upload | Grund |
| --- | --- | --- | --- |
| `stage.act` | Änderungsakt bzw. Berichtigung (SGK s08: `32024R1717R(01)`; Werke: erster neu gelisteter Akt) | CELEX der Fassung | Zuordnung aus Zusatzwissen bzw. Modifikatorenliste und Markern über alle Fassungen |
| `stage.acts` | neu eingearbeitete Akte | fehlt | wie oben; Oberfläche zeigt beim Upload «Konsolidierte Fassung vom …» ohne Aktliste |
| `stage.source.note` | Erläuterung DE/FR/EN | fehlt | redaktionell |
| Anwendbarkeit, Begründung, Formulare, Abweichungen | SGK: in `acts.json`, `rationale.json`, `forms.json`, `derogations.json` | nicht berührt | ein Upload ändert nur den Text; die Zusatzdaten beziehen sich auf Akte, nicht auf Fassungen |
| `stage.id`, `order`, `date`, `source.kind`, `langs` | – | gleich | (im Test geprüft, keine Ausnahme) |

## 2 Keine doppelten Stände beim Wiedereinspielen gespeicherter Uploads

### Reproduktion (bisheriges Verhalten)

`applyStoredUploads` spielte jeden gespeicherten Upload erneut ein. Test «Doppelte Stände reproduziert» (`equiv.test.mjs`), alle 15
Uploads in die vollständige Version: Es entsteht **kein** zusätzlicher Stand, weil `addSnapshot` den Stand über `source.celex` findet.
Aber: zusätzliche Versionen im selben Stand (VIS-VO Art. 6: 2, IO-VO Art. 24: 3), die den zentralen Text überdecken; die Uploads
bleiben gespeichert, stehen in der Liste «Hochgeladene Fassungen» und gelten in der Prüfung als «hochgeladen» statt «im Datensatz».
Liefert eine Fassung mehrere Stände (SGK `02016R0399-20240710`: s03, s05, s06, s07), hätte `addSnapshot` in den ersten (s03)
eingearbeitet.

### Verhalten neu

- `src/app/lib/storedplan.js` (rein): `planStored(eingebetteter Datensatz, Upload)`:
  - Fassung (CELEX) nicht enthalten → einarbeiten wie bisher;
  - Fassung und Sprache enthalten (`stage.langs`, jüngster Stand mit dieser Quelle) → überspringen, aus dem Speicher entfernen;
  - Fassung enthalten, Sprache nicht in `stage.langs`, Stand ist der jüngste → einarbeiten (`addSnapshot` ergänzt eine Sprache im
    bestehenden Stand); ändert das nichts (`hadEffect`), gilt der Upload als enthalten und wird entfernt. Fall SGK s08: `stage.langs`
    nennt nur DE (nur DE geändert); FR/EN der Fassung ändern nichts und werden entfernt (Test);
  - Fassung enthalten, Sprache fehlt, spätere Stände folgen → nicht einarbeiten (würde die Chronologie verfälschen), im Speicher
    behalten, Warnung. In den aktuellen Daten nur ETIAS s01 (FR/EN gibt es bei EUR-Lex nicht), praktisch nicht erreichbar.
- `applyStoredUploads` entfernt überflüssige Uploads aus `uploadsStore` und IndexedDB und zeigt einmal eine Meldung (bleibt stehen,
  bis sie geschlossen wird): «2 hochgeladene Fassungen sind jetzt im Tool enthalten und wurden aus dem lokalen Speicher entfernt.»
  FR: «2 versions importées sont désormais intégrées à l’outil et ont été supprimées de la mémoire locale.» (Einzahl je eigene Form.)
- `importProject`: enthaltene Fassungen werden nicht angelegt; Ergebnis «Importiert: 0 Fassungen, 0 Karten, 5 Fassungen bereits im
  Tool enthalten, nicht übernommen.»
- Tests: `test/app/stored.spec.mjs` (Upload von SGK DE/FR/EN und EES-VO DE/FR in der Variante ohne beide Fassungen; dieselbe
  Speicherumgebung, Variante mit SGK s08 → 3 entfernt, EES wirksam; vollständige Version → 2 entfernt, Stände = vollständige Version,
  Speicher leer, Meldung nur einmal; Projektimport; FR-Meldung); Einheitstests in `test/app/updatecheck.test.mjs` und `equiv.test.mjs`.
- Nicht behandelt: ein gespeicherter Upload, der älter ist als der jüngste Stand der neuen Version, aber nicht in ihr enthalten ist,
  wird wie bisher als jüngster Stand angehängt (Chronologie dann nicht in Datumsfolge).

## 3 Hinweis auf neue Versionen

### Konfiguration

- `src/app/config/update-source.js`: ursprünglich `github-release` (Releases-API); seit der Veröffentlichung im Repo `SEM-SGG/sgk-navigator`
  Manifest `version.json` auf GitHub Pages mit Releases-API als Ersatz (siehe `data/STATUS_GITHUB.md`). Leer (`kind: ''` oder owner/repo leer) =
  Funktion aus: keine Abfrage, kein Bedienelement, keine Ergänzung der CSP.
- Beim Build überschreibbar: `node build.mjs --update-source github-release:<owner>/<repo>[/<asset>]`, `--update-source
  manifest:https://…/version.json`, `--update-source none`; gleichwertig Umgebungsvariable `SGK_UPDATE_SOURCE`.
- `github-release`: `GET https://api.github.com/repos/{owner}/{repo}/releases/latest` (GitHub sendet `Access-Control-Allow-Origin: *`;
  nach einer Übertragung des Repos leitet GitHub um, gleicher Ursprung). Link = `browser_download_url` des Assets, sonst Release-Seite.
- `manifest`: JSON `{ "version": "2026.12.12", "date": "2026-12-12", "url": "https://…/SGK-Navigator.html", "notes": { "de": "…", "fr": "…" } }`,
  nur https.
- CSP (`build.mjs`): `connect-src` nur bei eingerichteter Quelle um deren Ursprung ergänzt (`https://api.github.com` bzw. Ursprung des
  Manifests); `script-src` unverändert. Der Download ist ein Link (Navigation im Browser), keine Anfrage des Tools.

### Versionsschema

- `JJJJ.MM.TT[-n]`: Datum des Builds in Europe/Zurich, `-n` für einen weiteren Build am selben Tag (`SGK_BUILD_N=2`). Fest setzbar mit
  `--version` bzw. `SGK_VERSION`. Eingebettet in `sgk-meta` (`version`), angezeigt in «Info» → «Version».
- Git-Tag des Releases: `v` + Version, z. B. `v2026.12.12` (ohne `v` geht auch). Vergleich numerisch je Teil; nicht lesbare Angaben,
  Entwürfe und Vorabversionen gelten nie als neuer. semver aus `package.json` (0.1.0) wird nicht verwendet: das Datum sagt Nutzern mehr.

### Verhalten

- Automatisch höchstens einmal pro Kalendertag, nach dem ersten Rendern, nicht blockierend (Zeitlimit 10 s), nur wenn «Beim Start nach
  neuer Version suchen» eingeschaltet ist (Standard an, gespeichert in IndexedDB, Schlüssel `update`, nicht Teil der Projektdatei).
  Fehler (offline, 404, 403/429, Format) beim automatischen Suchen: still.
- «Info» → «Version»: Version, letzte Suche, Schaltfläche «Jetzt nach neuer Version suchen» mit Meldung (Erfolg, neue Version mit Link,
  verständliche Fehlermeldungen je Fall), Einstellung, Text zum Netzzugriff.
- Hinweis oben im Inhaltsbereich (Carbon Inline-Notification Info, `role="status"`): «Eine neue Version des SGK-Navigators ist verfügbar
  (Stand 12. Dezember 2026).», Kurzanleitung, «Neue Version herunterladen» (öffnet den Download in neuem Tab), «Später erinnern» (diese
  Version 7 Tage ausgeblendet; eine noch neuere erscheint sofort), Schliessen (nur für die Sitzung; das letzte Ergebnis wird
  gespeichert, der Hinweis erscheint beim nächsten Start ohne neue Abfrage wieder). Gleiche oder ältere Version: kein Hinweis.
- Texte DE/FR in `de.js`/`fr.js` (`update.v`), Anleitung «Neue Version des Tools erhalten» in `de-ra.js`/`fr-ra.js`, Netzzugriff
  ehrlich beschrieben (auch: der Dienst erhält die üblichen Angaben jeder Webanfrage, etwa IP-Adresse). Texte «Zweck» und
  «Auf neue Fassungen prüfen» angepasst (bisher «sonst kein Netzzugriff»).
- Prüfung axe-core (WCAG 2.1 AA) für Hinweis und Abschnitt «Version», DE und FR: keine Verstösse.

### Geteilter Browser-Speicher zwischen Dateipfaden

Geprüft mit Playwright und Chrome 153 (`stored.spec.mjs`, zusätzlich ein persistentes Profil mit Neustart): Alle über file://
geöffneten Seiten haben den Ursprung `file://` und teilen IndexedDB und localStorage, unabhängig von Ordner und Dateiname
(`…/a/sgk-navigator.html` und `…/Downloads/SGK-Navigator (1).html`). Uploads, Sammelkorb, Einstellungen (DB `sgk-navigator`) und die
Daten des Moduls Verhandlung (DB `sgk-navigator-neg`) bleiben deshalb beim Öffnen der neuen Datei im selben Browser und Profil
erhalten. Nicht geprüft: Edge (gleiche Chromium-Grundlage, Verhalten erwartet gleich), Richtlinien, die den Speicher für lokale Dateien
sperren oder beim Schliessen löschen. In einem anderen Browser oder Profil sind die Daten nicht vorhanden. Der Hinweis lautet daher
«Heruntergeladene Datei im selben Browser öffnen; Ihre Uploads, Notizen und Positionen bleiben im Browser erhalten.»; die Anleitung
empfiehlt zusätzlich, vorher eine Projektdatei und die Dossiers zu exportieren.

### Grenzen

- GitHub-API ohne Anmeldung: 60 Anfragen pro Stunde und IP-Adresse. Hinter einem gemeinsamen Proxy (eine IP für viele Nutzende)
  kann das Limit erreicht werden; dann bleibt die automatische Suche still, die manuelle meldet «nimmt im Moment keine weiteren
  Anfragen an». Abhilfe bei vielen Nutzenden: Manifest auf `raw.githubusercontent.com` oder GitHub Pages (`--update-source manifest:…`).
- Ein Proxy, der api.github.com sperrt, verhindert die Suche (still).
- Auslieferungsbuild live geprüft (18.11.2026, Repo existiert noch nicht): automatische Suche erhält 404, kein Hinweis, keine Meldung;
  manuelle Suche meldet «Es ist noch keine Version veröffentlicht.». Chrome schreibt bei jedem HTTP-Fehler eine Zeile «Failed to load
  resource: 404» in die Entwicklerkonsole (Browserverhalten, für Nutzende unsichtbar).

### Verteil-Repo und Releases

Abgelöst: Repo `SEM-SGG/sgk-navigator`, Releases per Workflow aus dem Quellcode, Download-Seite auf GitHub Pages. Siehe
`data/STATUS_GITHUB.md` und `MAINTAINING.md`.

### Was öffentlich würde

Die Datei enthält: alle Datensätze (Texte von EUR-Lex, Akt-Metadaten, Validierungsnotizen, Erwägungsgründe), Zusatzdaten des SGK
(Anwendbarkeit, Begründung, Formulartranskriptionen, Abweichungen), Bilder aus EUR-Lex, den Programmcode, und die drei
Beispiel-Dossiers des Moduls Verhandlung (`data/neg-demo*.json`). Diese bestehen aus Kommissionsvorschlägen (öffentlich) und
Ratsdokumenten aus dem öffentlichen Register, darunter Dokumente mit der Einstufung **LIMITE** (ST 6331/24, WK 3948/26, WK 4049/26,
ST 10863/23, WK 13716/23, WK 16364/23, WK 16999/23; laut data/NEG_NOTES.md im öffentlichen Register abrufbar, Einstufung steht auf dem
Dokument), sowie klar als fiktiv gekennzeichnete Positionen, Delegationshaltungen und Konsultationen («Stelle A (Beispiel)»). In der
Oberfläche steht als Beispiel «z. B. SEM/SGG» (Platzhalter der zuständigen Stelle). Keine Namen von Personen; keine internen Pfade. Empfehlung: vor der ersten Veröffentlichung entscheiden, ob der Text der
LIMITE-gekennzeichneten (aber freigegebenen) Ratsdokumente öffentlich weiterverbreitet werden soll; sonst Beispiel-Dossiers nur aus
öffentlichen Dokumenten bauen (eine Build-Option dafür gibt es noch nicht).

## 4 Geänderte und neue Dateien

| Datei | Änderung |
| --- | --- |
| `src/app/lib/uploadnorm.js` (neu) | Aufbereitung des Uploads wie zentraler Build (1.1) |
| `src/app/lib/storedplan.js` (neu) | Entscheid gespeicherter Uploads (2) |
| `src/app/lib/updatecheck.js` (neu) | Version, Quelle, Abfrage, Taktung, «Später erinnern» (3) |
| `src/app/config/update-source.js` (neu) | Quelle für neue Versionen |
| `src/app/ui/updatenotice.js` (neu) | Hinweis, Abschnitt «Version» in Info |
| `src/app/data.js` | `applySnapshot` auf Kopie, Aufbereitung, `rekeyExactFirst` |
| `src/app/uploads.js` | `applyStoredUploads` mit Prüfung, Entfernen, Meldung; `importProject` ohne enthaltene Fassungen |
| `src/core/model.js` | `rekey` Option `exactFirst`, `addSnapshot` Option `rekeyExactFirst` (ohne Option unverändert) |
| `src/app/main.js`, `modules/sgk/info.js`, `modules/sgk/guide.js`, `modules/sgk/updateview.js`, `styles.css` | Einbindung, Anleitungsschritt, Importmeldung, Stile (nur Tokens) |
| `src/app/i18n/de.js`, `fr.js`, `de-ra.js`, `fr-ra.js` | Texte |
| `build.mjs`, `scripts/lib-variant.mjs` (neu) | Version, Quelle, CSP; Testvarianten gemeinsam, mehrere Werke |
| `test/app/equiv.test.mjs`, `equiv/*.mjs`, `equiv.spec.mjs`, `stored.spec.mjs`, `version.spec.mjs`, `updatecheck.test.mjs` (neu) | Tests |
| `test/app/global-setup.mjs` | Varianten `upload-all`, `update`, `update-manifest`; bestehende Varianten mit `--update-source none` (bestehende Tests verlangen «keine Netzanfragen») |
| `test/app/ui.spec.mjs` | Anleitung: 18 statt 17 Aufgaben |
| `test/app/tools/fetch-eurlex.mjs`, `package.json` | Liste der Dateien; neue Einheitstests in `test:app:unit` |

Nicht geändert: `data/*` (ausser diesem Bericht), Verweisnetz, Verweisstruktur, Aktualisieren (ausser den beschriebenen Punkten),
Verhandlungsmodul.

## 5 Tests vorher / nachher

| Suite | vorher | nachher |
| --- | --- | --- |
| core (`node --test test/core/*.test.mjs`) | 43 bestanden, 7 fehlgeschlagen (raw/), 8 übersprungen | 43 / 7 / 8 |
| `npm run test:app:unit` | 35 / 35 | 54 / 54 (neu: equiv.test.mjs 10, updatecheck.test.mjs 9) |
| `npm run test:neg` | 41 bestanden, 9 übersprungen | 41 / 9 |
| Playwright, alle Specs | 101 bestanden, 2 fehlgeschlagen (von 103) | 110 bestanden, 2 fehlgeschlagen (von 112; neu: equiv.spec 1, stored.spec 3, version.spec 5) |

Weiterhin fehlschlagend (Ordner `raw-neg/` fehlt, nicht Gegenstand): zwei Tests im Modul Verhandlung (Import ST 8413/23, Screenshots).

Screenshots: Ausgabeordner `shots-v/` (nicht im Repo) (neue-version-de/fr, info-version-de/fr, info-version-fehler-de,
doppelte-uploads-bereinigt-de/fr).
