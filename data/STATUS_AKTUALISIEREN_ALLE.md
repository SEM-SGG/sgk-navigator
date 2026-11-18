# Status Aktualisieren: alle Rechtsakte prüfen, gemeinsame Ablage

Stand: 18. November 2026.

## Ausgangslage

Die Prüfung «Auf neue Fassungen prüfen» schlug im Browser fehl. Der SPARQL-Endpunkt des Amts für Veröffentlichungen
(`https://publications.europa.eu/webapi/rdf/sparql`) sendet keinen Header `Access-Control-Allow-Origin`; ein `fetch()` aus einer
über file:// geöffneten Seite (Origin `null`) wird von Chrome und Edge blockiert. Der Kommentar in `src/app/lib/sparql.js`
(«CORS erlaubt») war falsch. EUR-Lex und Cellar senden ebenfalls keine CORS-Freigabe; EUR-Lex verlangt zudem eine
Browser-Prüfung (AWS WAF, Antwort 202 an curl). Die Anwendung kann Fassungen deshalb nicht selbst herunterladen.

## Geänderte und neue Dateien

| Datei | Änderung |
| --- | --- |
| `src/app/lib/sparql.js` | Transport auf JSONP umgestellt (`jsonp(url, timeoutMs)`), Parallelität begrenzt (`MAX_PARALLEL = 2`), Zeitlimit je Abfrage 45 s, Abfrage der konsolidierten Fassungen über den Basisakt (schneller), Sprachfassungen DE/FR/EN der konsolidierten Fassungen (neue Abfrage), Kommentar korrigiert |
| `build.mjs` | CSP `script-src 'unsafe-inline' https://publications.europa.eu/webapi/rdf/sparql`; `connect-src` unverändert |
| `src/app/modules/sgk/updatelogic.js` (neu) | reine Logik: `statusOf` (aus updateview.js verschoben, erweitert), `assignWork`, `rowsForWork`, `countAttention` |
| `src/app/modules/sgk/updateview.js` | neuer Abschnitt «Alle Rechtsakte prüfen» mit Tabelle, Fortschritt, gemeinsamer Ablage; `resultStore` je Werk; Titel der Einzelprüfung mit Rechtsakt |
| `src/app/lib/decode.js` (neu) | robuste Dekodierung gespeicherter HTML-Dateien (BOM, UTF-8, UTF-16, `<meta charset>`), Erkennung MHTML |
| `src/app/data.js` | `parseEurLexFile` (erste Stufe, ohne Werkbezug) abgetrennt; `parseUpload(html, data, uploads, { parsed })` wertet nicht doppelt aus |
| `src/app/uploads.js` | `handleFiles(files, home)`: Zuordnung jeder Datei über die CELEX-Nummer im Inhalt; `home = null` für die gemeinsame Ablage |
| `src/app/styles.css` | `.tag-err`, Fehlerzeile, Fortschrittsbalken, Anleitungstext (nur Tokens) |
| `src/app/i18n/de.js`, `fr.js` | Texte des neuen Abschnitts, Meldungen, ehrliche Aussage zum Netzzugriff; Anleitungsschritt «aktualisieren» nach de-ra.js/fr-ra.js verschoben |
| `src/app/i18n/de-ra.js`, `fr-ra.js` | Anleitung «Neue Fassungen prüfen und laden» (neu, ersetzt den bisherigen Schritt) |
| `test/app/update.test.mjs` (neu) | Einheitstests (in `npm run test:app:unit` aufgenommen) |
| `test/app/update.spec.mjs` (neu) | Playwright: gemeinsame Prüfung gemockt, CSP, FR, gemeinsame Ablage mit echten Dateien, Ablage je Werk, Live-Test |
| `test/app/helpers.mjs` | `fulfillSparql` (Antwort wie Virtuoso: `name(json)`, Content-Type `application/sparql-results+json`), `endpointReachable` |
| `test/app/app.spec.mjs`, `e3.spec.mjs` | Mocks auf JSONP umgestellt; `RAW()` greift auf `test/app/fixtures-live/` zurück, wenn `raw/` fehlt; Erwartungen an neue Meldungen angepasst |
| `test/app/playwright.config.mjs` | Proxy aus `HTTPS_PROXY` (falls gesetzt) |
| `test/app/global-setup.mjs` | Testvariante `test/app/out/sgk-navigator-upload-2.html` ohne letzte Fassung von SGK und EES-VO |
| `test/app/tools/fetch-eurlex.mjs` (neu) | lädt EUR-Lex-HTML mit Chrome (WAF) nach `test/app/fixtures-live/` (26 MB, in `.gitignore`, nicht im Build) |
| `package.json`, `.gitignore` | Testskript ergänzt; `test/app/fixtures-live/` ausgeschlossen |

Nicht geändert: `src/core/*`, `data/*` (ausser diesem Bericht), Verhandlungsmodul, Verweisnetz, Verweisstruktur, Projektdatei.

## Entscheide

1. **JSONP statt fetch.** `jsonp()` hängt ein `<script>` mit `&format=json&callback=__sgkJsonp_<zeit>_<zähler>` an. Je Aufruf ein
   eindeutiger globaler Callback. Nach Erfolg, Ladefehler oder Formatfehler werden Script-Element und Callback sofort entfernt.
   Nach einer Zeitüberschreitung wird das Script-Element entfernt und der Callback durch einen Platzhalter ersetzt, der eine
   verspätete Antwort ohne Wirkung schluckt und sich dabei selbst entfernt, sonst nach 120 s. Grund: Ein bereits angefordertes
   Skript läuft auch nach dem Entfernen des Elements noch; ohne Platzhalter entstünde ein Skriptfehler auf der Konsole.
   Antwortprüfung: `results.bindings` muss ein Array sein, sonst `update.err.format`. Lädt das Skript, ohne den Callback aufzurufen
   (z. B. Fehlerseite eines Proxys), ebenfalls `update.err.format`. Kein `eval`, kein `new Function`.
2. **Fehlermeldung bei Ladefehler.** Ein `<script>` unterscheidet nicht zwischen fehlendem Netz und HTTP-Fehler (400/500 des
   Endpunkts). `update.err.offline` lautet deshalb jetzt «Keine Verbindung zum Endpunkt … oder Fehler des Endpunkts».
3. **Parallelität.** Höchstens 2 Abfragen gleichzeitig, über Einzel- und Gesamtprüfung hinweg (Warteschlange in sparql.js).
   Gesamtprüfung live: 20 Abfragen (4 je Rechtsakt), rund 3 s.
3a. **Schnellere Abfrage der konsolidierten Fassungen.** Die bisherige Abfrage filterte alle CELEX-Nummern des Endpunkts mit
   `STRSTARTS` und brauchte live 5–30 s (EES-VO 30 s, VIS-VO 23 s). In einem vollen Testlauf lief die ETIAS-Abfrage einmal in
   die Zeitüberschreitung von 45 s (die Fehlerzeile je Rechtsakt hat dabei wie vorgesehen funktioniert). Neu geht die Abfrage
   über `cdm:act_consolidated_based_on_resource_legal` vom Basisakt aus (0,6–1,1 s); `STRSTARTS` bleibt als zusätzlicher Filter.
   Für alle fünf Werke liefern beide Abfragen am 18.11.2026 dieselben Fassungen. Ein automatischer zweiter Versuch nach
   Zeitüberschreitung ist nicht eingebaut.
4. **Sprachfassungen der konsolidierten Fassungen.** Live zeigte die Gesamtprüfung zuerst `02018R1240-20231231` (ETIAS) als «neu».
   Diese Fassung gibt es nur auf Spanisch (bekannt, data/VALIDATION_WORKS.md Z. 53). Neu fragt `checkUpdates` nach der Liste der
   konsolidierten Fassungen deren Sprachfassungen DE/FR/EN mit exakten CELEX ab (`VALUES`, rund 1 s; eine Erweiterung der
   STRSTARTS-Abfrage hätte sie verdoppelt). Fassungen ohne DE/FR/EN: «nicht in DE, FR, EN verfügbar», nicht neu, ohne Links.
   Fassungen mit nur einem Teil der Sprachen: «neu, nur DE», Links nur für vorhandene Sprachen. Schlägt diese Zusatzabfrage fehl,
   gilt die Angabe als unbekannt (wie bisher).
5. **Status je Werk.** `statusOf` läuft gegen `workData(work)` und die Uploads dieses Werks. Erweiterung: Ein Akt gilt als «im
   Datensatz», wenn er in `stage.act` oder in `stage.acts` steht (die weiteren Werke führen mehrere Akte je Stand; vorher
   erschienen z. B. Berichtigungen der EES-VO als «erfasst, ohne eigenen Stand»). Unvollständige Fassungen (hochgeladen, Sprachen
   fehlen) tragen in der Gesamttabelle das Etikett `tag-partly` statt `tag-new`; die Einzelprüfung bleibt optisch wie bisher.
6. **Ein Ergebnisspeicher je Werk.** `resultStore` ist ein Objekt `{ [werk]: Ergebnis }`; Gesamt- und Einzelprüfung schreiben
   hinein. Der Werk-Tab zeigt nach der Gesamtprüfung dasselbe Ergebnis ohne neue Abfrage. Schlägt ein Werk fehl, wird sein altes
   Ergebnis entfernt (kein veralteter Stand neben einer Fehlermeldung).
7. **Zuordnung beim Laden.** Jede Datei wird einmal ausgewertet (`parseEurLexFile`), die CELEX-Nummer mit `resolveCelex`
   (src/core/library.js) einem Werk zugeordnet und dann wie bisher über `parseUpload`/`applySnapshot` übernommen. Die Ablage je
   Werk weist Dateien eines anderen Werks nicht mehr ab, sondern ordnet sie zu: «Zugeordnet zu EES-VO statt SGK: …».
   Akte ausserhalb der Bibliothek: «Die Datei betrifft 32017R2225, keinen Rechtsakt der Bibliothek …».
8. **Gespeicherte Dateien.** Chrome speichert mit «Webseite, nur HTML» die Originalbytes (identisch mit dem Netzabruf). Geprüft
   wurden zusätzlich die serialisierte Seite («Webseite, komplett», `page.content()`) und eine Datei mit UTF-8-BOM und dem von
   Chrome vorgeschlagenen Dateinamen («Konsolidierter TEXT_ 32017R2226 — DE — 12.06.2026.html»); alle werden angenommen.
   «Webseite, eine Datei» (MHTML) wird mit einer verständlichen Meldung abgewiesen. Dekodierung: BOM, gültiges UTF-8,
   deklarierter Zeichensatz, sonst windows-1252.
9. **Spaltenbezeichnung.** Für Akte (nicht ladbar) stehen in «Herunterladen» die EUR-Lex-Links weiterhin zum Lesen
   (Tooltip «nur zur Information»); unter der Tabelle steht, dass nur konsolidierte Fassungen ladbar sind.
10. **Wortlaut der Leerzeile.** Statt «keine neuen Fassungen» steht «keine neuen Fassungen oder Akte», weil die Zeile nur erscheint,
    wenn weder eine neue Fassung noch ein neuer Akt vorliegt.

## Sicherheitsabwägung JSONP und CSP

- JSONP führt die Antwort des Endpunkts als Skript mit allen Rechten der Seite aus (Zugriff auf IndexedDB mit hochgeladenen
  Fassungen, Verhandlungsdaten im Speicher). Die Integrität der Anwendung hängt damit während der Prüfung von der Integrität
  des Endpunkts und der TLS-Verbindung ab. Ein Proxy mit TLS-Aufbruch (wie in der Bundesverwaltung üblich) liegt ebenfalls im
  Vertrauensbereich.
- Eingrenzung: `script-src` erlaubt nur den Pfad `https://publications.europa.eu/webapi/rdf/sparql`, nicht den ganzen Ursprung
  (Cellar-Dokumente unter `/resource/…` sind nicht als Skript ladbar; im Test geprüft). Nur HTTPS. Keine weiteren Hosts.
- Abfragen werden nur auf Knopfdruck gestellt. Der Inhalt der Abfragen ist fest im Code; eingesetzt werden nur CELEX-Nummern
  der Bibliothek und vom Endpunkt selbst gelieferte CELEX (auf `[0-9A-Z()-]` geprüft, bevor sie in die Sprachabfrage gehen).
  Der Callback-Name wird von der Anwendung erzeugt; Virtuoso gibt ihn unverändert zurück.
- Die Antwort ist JSON in einem Funktionsaufruf; die Anwendung prüft die Struktur, rendert Werte nur als Text (Preact, kein
  `innerHTML`).
- Kein `crossorigin`-Attribut (würde CORS verlangen), `referrerpolicy=no-referrer`.
- Restrisiko: Eine kompromittierte oder manipulierte Antwort des Endpunkts könnte beliebigen Code ausführen. Das Risiko wurde
  gegenüber der Alternative (keine Prüfung möglich) in Kauf genommen; es ist in der Anleitung offen beschrieben.
- Nicht genutzt: lokaler Server, Erweiterung, PowerShell (im Arbeitsumfeld nicht erlaubt).

## Live-Ergebnis (18. November 2026, gebaute Datei über file://, Chrome mit Proxy)

«Geprüft am 18. November 2026, 09:30 Uhr: 5 von 5 geprüft, 3 neu oder unvollständig.» Dauer rund 3 s (vor der
Umstellung der Abfrage rund 30 s).

| Rechtsakt | Neue konsolidierte Fassungen | Neue Akte (nicht in den Daten erfasst) |
| --- | --- | --- |
| SGK | keine (jüngste: 02016R0399-20251012, im Datensatz s08) | keine |
| EES-VO | keine (jüngste: 02017R2226-20260612, s04) | 32025R1534 (Abweichung, 18. Juli 2025: Verordnung (EU) 2025/1534, schrittweise Inbetriebnahme des EES; im SGK erfasst, in ees.acts.json nicht); 52024PC0567 (Vorschlag, 4. Dezember 2024, Vorschlag zu derselben Verordnung) |
| ETIAS-VO | keine (jüngste ladbare: 02018R1240-20260612, s05); 02018R1240-20231231 nur ES, als «nicht in DE, FR, EN verfügbar» ausgewiesen | keine |
| VIS-VO | keine (jüngste: 02008R0767-20260612, s10) | keine |
| IO-VO | keine (jüngste: 02019R0817-20260612, s05) | 52026PC1037 (Vorschlag, 27. Oktober 2026: Digitalisierung des Fallmanagements im Bereich Rückkehr, ändert u. a. (EU) 2019/817) |

Datenpflege: 32025R1534 und 52024PC0567 könnten in `data/works/ees.acts.json` erfasst werden; 52026PC1037 in `iop.acts.json`.

## Tests vorher / nachher

| Suite | vorher | nachher |
| --- | --- | --- |
| core (`node --test test/core/*.test.mjs`) | 43 bestanden, 7 fehlgeschlagen (raw/), 8 übersprungen | unverändert 43 / 7 / 8 |
| `npm run test:app:unit` | 25 / 25 | 35 / 35 (neu: test/app/update.test.mjs, 10 Tests) |
| `npm run test:neg` | 41 bestanden, 9 übersprungen | unverändert 41 / 9 |
| Playwright, alle Specs | 91 bestanden, 6 fehlgeschlagen (von 97) | 101 bestanden, 2 fehlgeschlagen (von 103) |

Playwright nachher (103 Tests, davon 6 neu in test/app/update.spec.mjs): 101 bestanden, 2 fehlgeschlagen. Der Live-Test
(«Live: alle Rechtsakte …») ist enthalten und wird ohne erreichbaren Endpunkt übersprungen.

Bisher wegen SPARQL fehlschlagend: «Ablauf 7b: SPARQL echt gegen den Endpunkt» besteht jetzt (mit Proxy aus `HTTPS_PROXY`).
Bisher wegen fehlendem `raw/` fehlschlagend und jetzt bestanden, weil `RAW()` auf `test/app/fixtures-live/` zurückgreift:
«Ablauf 7c: Upload, Fehlerfälle …», «Ablauf 7c: Upload einer echten konsolidierten Fassung …», «A: Upload einer konsolidierten
Fassung für die EES-VO …». Weiterhin fehlschlagend (Ordner `raw-neg/` fehlt, nicht Gegenstand dieses Auftrags): zwei Tests im
Modul Verhandlung (Import ST 8413/23, Screenshots Modul Verhandlung).

## Offene Punkte und Grenzen

- Das Speichern mit Ctrl+S selbst lässt sich in Playwright nicht auslösen. Geprüft sind die Originalbytes (= «nur HTML») und die
  serialisierte Seite (Näherung an «komplett»), nicht eine tatsächlich über den Dialog gespeicherte Datei in Chrome oder Edge unter
  Windows.
- Edge wurde nicht getestet (nur Chrome 153 der Sandbox; der Nutzer hat JSONP in Chrome 153 bestätigt).
- Bei Ladefehlern ist nicht unterscheidbar, ob das Netz fehlt oder der Endpunkt einen HTTP-Fehler meldet.
- Ein verspäteter Platzhalter-Callback bleibt nach Zeitüberschreitung bis zu 120 s als globale Funktion bestehen (bewusst, s. o.).
- Die Fixtures unter `test/app/fixtures-live/` (26 MB) sind nicht im Quellbaum-Paket; ohne sie werden die Ablage-Tests
  übersprungen. Neu laden: `node test/app/tools/fetch-eurlex.mjs DE:02016R0399-20240710 DE:02016R0399-20251012 FR:02016R0399-20251012
  DE:02017R2226-20260612:dom FR:02017R2226-20260612 DE:32017R2225 DE:32016R0399` (Chrome, Netz).
- Eine vorbestehende FR-Typografie-Abweichung in fr-ra.js (normales Leerzeichen vor «;» im Anleitungsschritt «begruendung»)
  ist nicht behoben; die bestehenden Tests prüfen fr-ra.js nicht.
