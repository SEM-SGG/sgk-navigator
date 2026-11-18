# SGK-Navigator — Spezifikation Etappe 3 (neun Erweiterungen)

Gilt zusätzlich zu SPEC.md (SGK-Modul) und SPEC2.md (Modul Verhandlung). Betriebsform unverändert: EINE selbsttragende HTML-Datei,
offline, file://. Auftraggeber: SEM, Sektion Grundlagen Grenze (SGG); Fachpersonen Schengen, keine Programmierer. Wortlauttreue ist oberstes Gebot.
Heutiges Datum: 2026-11-12.

## 1 Die neun Erweiterungen (vom Nutzer bestellt)

1. **Vorschau hängiger Vorschläge im SGK.** Aus einem Verhandlungsdossier (z. B. COM(2024) 670, ändert Art. 2, 8, 8a SGK) erzeugt das Tool je Spur
   einen hypothetischen Stand des SGK: so lautet Art. 8 nach Kommissionsvorschlag, Ratsmandat, Kompromiss.
2. **Export als Word-Baustein.** Chronologie oder Vergleich als Word-Dokument mit echter Redline; «als formatierten Text kopieren»; PDF mit durchsuchbarem Text.
3. **Weitere Rechtsakte.** EES-Verordnung (EU) 2017/2226, ETIAS (EU) 2018/1240, VIS (EG) Nr. 767/2008, Interoperabilität (EU) 2019/817, gleich aufbereitet wie der SGK;
   Verweise zwischen den Akten anklickbar.
4. **Begründung neben der Änderung.** Erwägungsgründe des Änderungsakts der Änderung zugeordnet und in der Chronologie gezeigt.
5. **Verweisnetz.** Je Bestimmung: worauf sie verweist und welche Bestimmungen auf sie verweisen.
6. **Delegationen und Sitzungen** im Verhandlungsmodul: je Zeile, welche Mitgliedstaaten was vertreten und was CH in welcher Sitzung eingebracht hat;
   am Ende eine Bilanz, welche CH-Anliegen im verabschiedeten Text stehen.
7. **Projektdateien zusammenführen** (Verhandlungsmodul): Abgleich zweier Projektdateien mit Anzeige der Konflikte.
8. **Anwendbarkeit je Einzeländerung** statt je Akt, inklusive der Abweichungen aus der schrittweisen EES-Inbetriebnahme (VO (EU) 2025/1534).
9. **Formulare der Anhänge III und V als Text** statt nur als Bild.

## 2 Ablauf und Zuständigkeiten

Welle 1 (parallel, gemeinsamer Arbeitsbaum, KEINE Änderungen an src/app, build.mjs, test/app, dist; keine App-Builds, kein `npm run test:app`):

| Agent | Erweiterungen | schreibt in |
|---|---|---|
| BIBLIOTHEK | 3 (Daten), Erwägungsgründe als Einheit | `scripts/` (ohne `scripts/neg`, `scripts/rationale`, `scripts/forms`), `src/core/parser.js`, `src/core/library.js` (neu), `data/works/`, `data/dataset.json` (nur ergänzt um Einheit Erwägungsgründe), `data/VALIDATION*.md`, `test/core/parser*.test.mjs`, `test/core/library*.test.mjs`, `raw/` |
| VERWEISE | 5 (Kern), 8 (Recht + Kern) | `src/core/refs.js` (neu), `src/core/applicability.js` (neu), `src/core/model.js` (nur `composeAt` erweitern, rückwärtskompatibel), `data/acts.json`, `data/derogations.json` (neu), `data/REFS_NOTES.md`, `data/APPLICABILITY_NOTES.md`, `test/core/refs*.test.mjs`, `test/core/applicability*.test.mjs` |
| BEGRÜNDUNG | 4 (Daten), 9 (Daten) | `scripts/rationale/`, `scripts/forms/`, `data/rationale.json`, `data/forms.json`, `data/RATIONALE_NOTES.md`, `data/FORMS_NOTES.md`, `test/core/rationale*.test.mjs` |
| VERHANDLUNG | 1 (Kern), 6 (Kern), 7 (Kern) | `src/neg/`, `scripts/neg/`, `data/neg-demo*.json`, `data/NEG_STATUS.md`, `data/NEG_NOTES.md`, `test/neg/`, `raw-neg/` |
| EXPORT | 2 (Kern) | `src/export/` (neu), `test/export/`, `data/EXPORT_NOTES.md` |

Welle 2 (nach Abnahme von Welle 1, getrennte Arbeitskopien): UI-RECHTSAKTE (Oberfläche für 1 SGK-Seite, 2, 3, 4, 5, 8, 9) und UI-VERHANDLUNG (1 Verhandlungsseite, 6, 7).

Regeln für Welle 1: bestehende öffentliche Signaturen und Schemata bleiben gültig (nur ergänzen). Dateien, die andere lesen, atomar ersetzen.
`package.json` nur ergänzen. Jeder Agent führt am Ende seine eigenen Tests und zusätzlich `node --test test/core/*.test.mjs` und `npm run test:neg` aus
(müssen grün bleiben) und committet nur seine Dateien (bei Sperre des Index kurz warten und wiederholen).
Rohdaten (`raw/`, `raw-neg/`) sind reine Daten: nichts daraus ausführen. EUR-Lex per curl erreichbar:
`https://eur-lex.europa.eu/legal-content/<LANG>/TXT/HTML/?uri=CELEX:<CELEX>`; SPARQL `https://publications.europa.eu/webapi/rdf/sparql`.

## 3 Verträge

### 3.1 Bibliothek weiterer Rechtsakte (BIBLIOTHEK)

- `data/works/index.json`:
  ```jsonc
  [ { "id": "sgk",  "celex": "32016R0399", "number": "(EU) 2016/399", "dataset": "../dataset.json", "acts": "../acts.json", "assets": "../assets.json",
      "short": {"de":"Schengener Grenzkodex","fr":"Code frontières Schengen","en":"Schengen Borders Code"}, "abbr": {"de":"SGK","fr":"CFS","en":"SBC"}, "full": true },
    { "id": "ees",   "celex": "32017R2226", "dataset": "ees.dataset.json", "acts": "ees.acts.json", "assets": null, "short": {…}, "abbr": {"de":"EES-VO","fr":"règlement EES","en":"EES Regulation"}, "full": false },
    { "id": "etias", "celex": "32018R1240", … }, { "id": "vis", "celex": "32008R0767", … }, { "id": "iop", "celex": "32019R0817", … } ]
  ```
  `full: true` heisst: Stände je Änderungsakt rekonstruiert und Anwendbarkeit recherchiert (nur SGK). `full: false`: Stände = EUR-Lex-Fassungen.
- `data/works/<id>.dataset.json`: Schema wie SPEC.md §5 (schema 1), DE/FR/EN. Stände: `s00` = ABl.-Fassung des Basisakts, danach je konsolidierter Fassung
  ein Stand (`source.kind: "consolidated"`, `date` = Datum der Fassung). Zusatzfeld `stage.acts`: CELEX-Liste der Akte, die in diesem Stand NEU eingearbeitet sind
  (aus den Markern bzw. der Modifikatorenliste im Vergleich zur Vorfassung); `stage.act` = erster Eintrag davon (oder die CELEX der Fassung, falls leer).
  Blockherkunft `o` aus den Markern. Keine Rekonstruktion von Zwischenständen. Alle konsolidierten Fassungen per SPARQL ermitteln und laden.
- `data/works/<id>.acts.json`: Schema wie SPEC.md §6, aber schlank: `celex, kind, number, topic{de,fr,en}, title{de,fr,en}, adopted?, published, oj{de,fr,en}?, inForce, application, changes` (auf Ebene Einheit aus den Markern),
  `eurlex`, `confidence`. `application.status` ist `"unknown"` mit `date: null`, sofern die Anwendbarkeit nicht an der Primärquelle geprüft ist; nichts raten.
  Amtliche Titel wörtlich aus den Sprachfassungen (SPARQL oder Aktkopf).
- Erwägungsgründe: je Werk (auch SGK) eine Einheit `rct` (`type: "recitals"`, Label «Erwägungsgründe» / «Considérants» / «Recitals») aus der ABl.-Fassung des Basisakts,
  Blöcke `r1 … rN` mit `l: "(1)"`. Eine Version (s00). Für den SGK `data/dataset.json` nur um diese Einheit und den toc-Eintrag ergänzen;
  maschinell nachweisen, dass sonst kein Byte der bestehenden Einheiten und Stände ändert.
- Bilder: für die weiteren Werke keine eingebetteten Bilder (Block `ty: "img"` mit `asset: null` und Alternativtext); die Oberfläche verlinkt auf EUR-Lex.
- `src/core/library.js`: `listWorks(index)`, `resolveCelex(index, celex) -> workId|null`, `stageAt(dataset, isoDate) -> stageId` (jüngster Stand mit `date ≤ Datum`),
  `actsOfStage(dataset, stageId) -> [celex]`.
- `scripts/build-work.mjs <id> <celex>`: baut ein Werk reproduzierbar aus raw/ (lädt fehlende Dateien). Dokumentiert, wie ein weiteres Werk hinzukommt.
- Validierung je Werk und Sprache wie in `data/VALIDATION.md`: Abdeckung Parser gegen Quelle (Ziel 100 %), Sprachkonsistenz der Schlüssel, keine Scheinänderungen
  zwischen Ständen (jede geänderte Einheit muss einen Marker eines neu eingearbeiteten Akts tragen oder erklärt sein). Bericht `data/VALIDATION_WORKS.md`.
  Der Parser muss auch das ABl.-Format von 2008 (VIS) und alle Formate der konsolidierten Fassungen dieser Akte lesen. Bestehende SGK-Tests bleiben grün,
  `node scripts/validate.mjs` bleibt bei 100 %.
- Grössenbudget: alle vier Datensätze zusammen ≤ 2,5 MB gzip.

### 3.2 Verweisnetz (VERWEISE)

`src/core/refs.js` (ESM, isomorph, ohne Abhängigkeit von src/app):

```js
extractRefs(text, lang, ctx) -> [ { start, end, text, target } ]
//   text: Klartext eines Blocks (Tags entfernt); ctx: { work: "32016R0399", unit: "art_8", key: "p3.a" }
//   target: { work: CELEX (eigenes Werk oder fremdes), unit: "art_8"|"anx_VII"|null, key: "p3.a.i"|null, kind: "internal"|"external", label }
buildRefIndex(dataset, lang, stageId, { worksIndex }) -> { out: { "<unit>#<key>": [ref…] }, in: { "<unit>#<key>" | "<unit>": [ { unit, key, text } ] }, external: { "<celex>": [ { unit, key, target } ] } }
linkifyHtml(blockHtml, refs) -> html      // setzt <a data-ref="…"> um die Fundstellen, ohne den Wortlaut zu ändern
```

- Erkennen in DE, FR, EN: «Artikel 8 Absatz 3 Buchstabe a», «Artikel 6 und 7», «Artikel 23 bis 28», «Absatz 2» / «dieses Artikels» (relativ zum Kontext auflösen),
  «Anhang VII Nummer 6», «Titel III», sowie Fremdverweise «Artikel 12 der Verordnung (EU) 2017/2226», «Richtlinie 2004/38/EG», «Verordnung (EG) Nr. 767/2008»
  (CELEX ableiten; Ziel im Werk nur, wenn der Akt in der Bibliothek ist, sonst nur CELEX).
- Verweise, die nicht sicher auflösbar sind, mit `target.unit: null` und `uncertain: true` zurückgeben, nie raten.
- Pflichtprüfung: sprachübergreifende Übereinstimmung. Für jeden Block des jüngsten SGK-Stands müssen DE, FR und EN dieselbe Menge an Zielen liefern;
  Quote und jede Abweichung in `data/REFS_NOTES.md`. Zusätzlich 60 zufällige Verweise von Hand am Text prüfen (je 20 pro Sprache). Ziele müssen existieren
  (Einheit und Schlüssel im Datensatz des Stands); tote Ziele ausweisen (können echte Fehler der Quelle oder aufgehobene Bestimmungen sein).
- Leistung: Index für einen Stand und eine Sprache in unter 300 ms.

### 3.3 Anwendbarkeit je Einzeländerung (VERWEISE)

- Recht: Für jede Änderung in `data/acts.json` (`changes[]`) klären, ab wann sie anwendbar ist; `applicableFrom` nur setzen, wenn abweichend vom Akt.
  Schwerpunkt VO (EU) 2017/2225 (EES) in Verbindung mit der schrittweisen Inbetriebnahme nach VO (EU) 2025/1534 und dem Durchführungsbeschluss (EU) 2025/1544:
  welche SGK-Bestimmungen waren im Zeitraum 12. Oktober 2025 bis 9. April 2026 ausgesetzt, abweichend oder nur an Grenzübergangsstellen mit EES anwendbar; Übergangsfrist nach Art. 12a SGK.
  Der bisherige Eintrag zu 32025R1534 ist als «check» markiert (Fristen selbst berechnet): an der Primärquelle (raw/32025R1534_*.html, ggf. Folgebeschlüsse) belegen oder als offen ausweisen.
  Ebenfalls prüfen: 2019/817 (Art. 8 Abs. 4a), 2021/1134, 2018/1240 mit Stand heute (Websuche, amtliche Quellen).
- `data/derogations.json`:
  ```jsonc
  [ { "celex": "32025R1534", "from": "2025-10-12", "until": "2026-04-09", "affects": [ { "unit": "art_8", "key": "p9"|null, "effect": "suspended|modified|conditional",
        "note": {"de":"…","fr":"…","en":"…"}, "basis": {"de":"Art. 5 Abs. … der VO (EU) 2025/1534", …} } ], "sources": ["…"], "confidence": "verified|check" } ]
  ```
- `src/core/applicability.js`:
  ```js
  changeApplicability(acts, celex, unit, key, isoDate) -> { applicable: boolean, from: iso|null, status, basis }
  composeAtDate(dataset, acts, derogations, unitId, lang, isoDate) -> { version, notices: [ { key|null, kind: "derogation|pending|future", celex, note, basis } ] }
  ```
  `composeAt` in `model.js` darf dafür ein Prädikat mit Signatur `(celex, block, unitId)` annehmen; der bisherige Aufruf `(celex) => boolean` muss unverändert funktionieren.
  Testeigenschaften: Datum nach allen Anwendungsdaten ohne hängige Akte = bisheriges Ergebnis; Datum 2026-01-15 liefert Hinweise zu den ausgesetzten Bestimmungen.
- `data/APPLICABILITY_NOTES.md`: Herleitung mit Fundstelle je Punkt, offene Zweifel ehrlich.

### 3.4 Begründung (BEGRÜNDUNG)

`data/rationale.json`:
```jsonc
{ "32024R1717": { "recitals": { "12": { "de": "…", "fr": "…", "en": "…" } },                 // Wortlaut aus raw/<CELEX>_<LANG>.html, unverändert
                  "map": [ { "unit": "art_25", "key": null, "recitals": ["35","36"], "strength": "direct" | "thematic", "why": "kurzer Vermerk" } ] } }
```
- Für alle sieben Änderungsakte des SGK. Bei Akten mit anderem Hauptgegenstand (2016/1624, 2018/1240, 2019/817, 2021/1134) nur die Erwägungsgründe aufnehmen, die die SGK-Änderung betreffen.
- `direct`: Der Erwägungsgrund behandelt erkennbar genau diese Änderung (nennt Bestimmung oder deren Regelungsgegenstand). `thematic`: allgemeiner Zusammenhang. Im Zweifel `thematic` oder gar nicht.
- Zuordnung in zwei unabhängigen Durchgängen erarbeiten und abgleichen; jede Einheit, die ein Akt ändert, bekommt mindestens einen Versuch; Einheiten ohne passenden Erwägungsgrund bleiben leer.
- Wortlaut maschinell gegen die Quelle prüfen (100 %). Sprachkonsistenz der Nummern.
- Die Oberfläche kennzeichnet die Zuordnung als redaktionell (nicht amtlich).

### 3.5 Formulare als Text (BEGRÜNDUNG)

`data/forms.json`:
```jsonc
[ { "unit": "anx_V", "key": "ptB.g1", "lang": "de", "asset": "<hash aus data/assets.json>", "stages": ["s00", "…"],
    "blocks": [ { "k": "f1", "l": "(A)", "t": "…" } ], "layoutNote": {"de":"Formular mit Ankreuzfeldern …"}, "method": "transcription", "checked": "double" } ]
```
- Alle nur als Bild vorliegenden Formulare und Schilder der Anhänge III und V (und weitere Bild-Blöcke mit Text) in DE, FR, EN, für jede Bildfassung (2016, nach EES usw.).
- Bilder aus `data/assets.json` dekodieren und lesen (Read-Tool). Zwei unabhängige Transkriptionen, Abgleich, Abweichungen am Bild klären.
  Gegenprüfung, wo möglich: verborgener EUR-Lex-Bildtext, Text derselben Stelle in anderen Sprachen (Struktur), Wortlaut in Änderungsakten.
- Unleserliches als `[unleserlich]` kennzeichnen, nie ergänzen. Kennzeichnung in der Oberfläche: «Transkription, nicht amtlich».
- Damit werden Formularfassungen als Text vergleichbar (Schlüssel `f…` stabil über die Fassungen, soweit derselbe Punkt).

### 3.6 Vorschau hängiger Vorschläge (VERHANDLUNG)

`src/neg/preview.js`:
```js
parseAmendingInstruction(text) -> { action: "replace|insert|add|delete|amend-intro|none", target: { art, par, pt[], sub, annex … }, position?: "after|before", container: boolean }
buildPreview(dossier, { track, doc? }, dataset, { lang: "en", baseStage? }) ->
  { base: stageId, units: { "<unitId>": { baseVersion, previewVersion, changes: [ { key, action, row, confidence } ] } },
    unresolved: [ { row, label, reason } ], stats: { rows, applied, unresolved } }
```
- Versionen im Blockschema des Datensatzes (SPEC.md §5.2), damit Diff- und Vergleichskomponenten der Oberfläche unverändert funktionieren.
  Herkunft der geänderten Blöcke: `o: "preview:<dossierId>:<track>"`.
- Nur englischer Text (Verhandlungssprache). Änderungsanweisungen der Unionsgesetzgebung erkennen («Article 8 is amended as follows», «paragraph 3 is replaced by the following»,
  «the following point (ba) is inserted», «point (c) is deleted», «in Article 2, the following points are added» …), Ziel im Datensatz auflösen, neuen Wortlaut aus den Folgezeilen übernehmen.
  Was nicht sicher auflösbar ist, landet in `unresolved` und wird NICHT angewandt.
- Pflichtprüfung am historischen Fall: Dossier SGK-Revision 2021/0428(COD). Den endgültigen Kompromisstext (ST 6331/24) auf den Stand vor 2024/1717 (EN, s06) anwenden und mit dem echten Stand s07 vergleichen.
  Trefferquote je Einheit und je Block ausweisen; Abweichungen einzeln erklären (redaktionelle Überarbeitung durch Rechts- und Sprachsachverständige ist zu erwarten und kein Fehler der Vorschau).
- Neues Beispiel-Dossier `data/neg-demo-dtc.json` zu 2024/0670(COD) (COM(2024) 670, Ratsmandat ST 15634/25, WK 3948/26, WK 4049/26; nur amtlich öffentliche Dokumente, `demo: true`, fiktive Teile gekennzeichnet),
  damit die Vorschau am geltenden SGK gezeigt werden kann.
- `rows[].amends` in allen drei Beispiel-Dossiers so weit wie belegbar füllen.

### 3.7 Delegationen, Sitzungen, Bilanz (VERHANDLUNG)

Schema-Ergänzungen im Dossier (Projektdateien ohne diese Felder bleiben gültig):
```jsonc
"delegations": [ { "id": "de", "kind": "ms|institution|other", "code": "DE", "name": {"de":"Deutschland","fr":"Allemagne"} } ],   // Voreinstellung: Schengen-Staaten, KOM, EP, Präsidentschaft, JD Rat
"meetings": [ { "id": "m1", "date": "2026-03-12", "body": "JHA Counsellors", "title": "…", "docs": ["doc3"], "note": "" } ],
"stances": { "<rowId>": [ { "id": "…", "deleg": "de", "stance": "support|oppose|reservation|scrutiny|proposal|neutral", "text": "…", "meeting": "m1"|null, "at": "…" } ] },
"interventions": [ { "id": "…", "meeting": "m1", "row": "<rowId>"|null, "text": "Was CH eingebracht hat", "result": "taken-up|partly|rejected|open", "note": "" } ],
"positions": { "<rowId>": { …, "outcome": { "status": "achieved|partly|not|open|obsolete", "note": "…", "doc": "doc7", "at": "…" } } }
```
Funktionen: anlegen/ändern/löschen für Delegationen, Sitzungen, Haltungen, Interventionen; `stanceMatrix(dossier, { rows?, meeting? })`;
`suggestOutcome(dossier, rowId)` (vergleicht CH-Textvorschlag bzw. Position mit dem jüngsten Kompromisstext; nur Vorschlag, mit Begründung); `balance(dossier)` (Statistik);
`buildPositionDocx` um Varianten `"balance"` (Bilanz) und `"meeting"` (Sitzungsbericht: Interventionen CH und Haltungen je Zeile) erweitern, DE und FR.
Begriffe in `src/neg/i18n.js` ergänzen (DE/FR).

### 3.8 Projektdateien zusammenführen (VERHANDLUNG)

```js
diffDossiers(a, b) -> { same: boolean, entries: [ { path, kind: "added|removed|changed", a, b } ] }
mergeDossiers(mine, theirs, { base?, resolutions? }) -> { merged, conflicts: [ { id, path, label, mine, theirs, kind } ], applied: { fromMine, fromTheirs, identical } }
```
- Typischer Fall: Eine Stammdatei wird verteilt; mehrere Personen ergänzen Positionen, Entscheide, Haltungen, Rückmeldungen, importieren teils dieselbe neue Fassung.
- Regeln: gleiche Ids und gleicher Inhalt = identisch; nur auf einer Seite geändert (anhand `updated`/`history`/`at`) = übernehmen; auf beiden Seiten unterschiedlich geändert = Konflikt
  (nicht automatisch entscheiden). Listen (Verlauf, Rückmeldungen, Haltungen) vereinigen ohne Dubletten. Unabhängig importierte gleiche Dokumente (gleicher `sha256`) samt Zeilen und Zellen
  aufeinander abbilden (Zeilennummer, Fundstelle, Text). `resolutions: { <conflictId>: "mine"|"theirs"|{value} }`.
- Verlaufseinträge erhalten optional `by` (Kürzel der bearbeitenden Person; die Oberfläche fragt es einmal ab).
- Tests mit realistischen Szenarien am Beispiel-Dossier, inklusive Idempotenz (`merge(a, a)` = a) und Symmetrie der Konflikte.

### 3.9 Word-, Text- und PDF-Export von Karten (EXPORT)

`src/export/` (ESM, isomorph). Kartenmodell (wird von der Oberfläche aus Chronologie, Vergleich, Synopse-Zeile, Vorschau gefüllt):
```jsonc
{ "kind": "chronology|comparison|row|preview", "title": "Art. 8 Abs. 3 Bst. a Ziff. i SGK", "subtitle": "Chronologie", "textLang": "de", "uiLang": "de",
  "sections": [ { "heading": "Stand nach VO (EU) 2017/458", "meta": ["anwendbar seit 7. April 2017"], "tag": "ersetzt",
                  "blocks": [ { "label": "i)", "depth": 2, "runs": [ { "t": "…", "op": "eq|ins|del", "b": false, "i": false, "sup": false } ] } ] } ],
  "columns": null | [ { "heading": "alt", "sectionIndexes": [0] }, { "heading": "neu", "sectionIndexes": [1] } ],     // nebeneinander
  "legend": [ { "op": "ins", "label": "eingefügt" }, { "op": "del", "label": "gestrichen" } ],
  "source": "Quelle: EUR-Lex …", "disclaimer": "…" }
```
```js
cardToDocx(card, { redline: "format" | "tracked", author?, date? }) -> Uint8Array
     // "format": eingefügt unterstrichen, gestrichen durchgestrichen (farbig); "tracked": echte Änderungsverfolgung (w:ins / w:del), in Word annehm- und ablehnbar
cardsToDocx(cards[], opts) -> Uint8Array          // Sammelkorb
cardToPdf(card, { format: "a4" | "16x9" }) -> Uint8Array   // echter, durchsuchbarer Text; Redline unterstrichen/durchgestrichen; Seitenumbruch sauber
cardsToPdf(cards[], opts) -> Uint8Array
cardToClipboard(card) -> { html, text }          // html mit Inline-Styles, sodass Einfügen in Word und Outlook die Redline-Formatierung behält
```
- DOCX: eigenes OOXML mit fflate (Hilfen in `src/neg/docx-write.js` dürfen importiert, nicht geändert werden). Formatvorlagen nüchtern (Arial/Liberation Sans 10 pt), als Baustein gedacht:
  ohne Kopf-/Fusszeilen-Ballast, Titel und Quelle als Absätze, sodass der Inhalt sich in eine Aktennotiz kopieren lässt. A4 hoch; Vergleich nebeneinander als zweispaltige Tabelle.
- PDF: pdf-lib (oder jsPDF) mit echtem Text. Schriftfrage klären und dokumentieren: eingebettete Schrift mit vollem Zeichenvorrat für DE/FR/EN-Rechtstext (z. B. «ß», «œ», «‑», «≥», geschützte Leerzeichen)
  oder Standardschrift mit sauberem Ersatz fehlender Zeichen. Schriften der App liegen unter `src/app/assets/`. Zusatzgrösse im Bundle messen und klein halten (Ziel < 400 KB).
- Prüfen: DOCX strukturell (ZIP, wohlgeformtes XML) und mit LibreOffice (`soffice --headless --convert-to pdf`) öffnen, Seite rendern und ansehen; «tracked» enthält `w:ins`/`w:del` und LibreOffice zeigt Änderungen;
  PDF: `pdftotext` liefert den vollständigen Kartentext in richtiger Reihenfolge (Abdeckung in Prozent), Seiten rendern und ansehen (A4 und 16:9, lange Karte über mehrere Seiten);
  Zwischenablage-HTML in LibreOffice Writer einfügen lässt sich nicht automatisieren: stattdessen HTML-Datei mit soffice nach DOCX wandeln und Formatierung prüfen.
- Texte der Karten kommen fertig übersetzt aus der Oberfläche; die Bibliothek enthält keine eigenen UI-Texte ausser Rückfallwerten.

## 4 Qualitätsmassstab für alle

- Nichts als geprüft melden, was nicht ausgeführt wurde. Zahlen statt Adjektive.
- Rechtstext nie verändern, glätten oder ergänzen. Auffälligkeiten der Quelle dokumentieren.
- Unsicheres kennzeichnen (`confidence`, `uncertain`, `unresolved`), nie raten.
- Deutsch in Berichten und Daten: Schweizer Hochdeutsch ohne «ß» (Rechtstext unverändert). Französisch: Verwaltungsfranzösisch der Schweiz. Stil knapp, ohne Füllwörter.

## 5 Welle 2: Oberfläche (zwei Agents in getrennten Arbeitskopien)

Beide Arbeitskopien starten vom selben Commit. Der Orchestrator führt sie zusammen. Damit das konfliktarm geht:

| Agent | Erweiterungen | darf ändern |
|---|---|---|
| UI-RECHTSAKTE | 1 (Seite Rechtsakte), 2, 3, 4, 5, 8, 9 | `src/app/**` AUSSER `src/app/modules/neg/**`; `build.mjs`; `test/app/**` ausser `test/app/neg*.spec.mjs`; `package.json` (nur ergänzen) |
| UI-VERHANDLUNG | 1 (Seite Verhandlung), 6, 7 | NUR `src/app/modules/neg/**` (inkl. eigener Stylesheets `src/app/modules/neg/*.css`, die der Build automatisch anhängt, und eigener Wörterbücher), `test/app/neg*.spec.mjs`, `test/app/fixtures/neg-*` |

Gemeinsame Verträge (beide halten sich daran, ohne die Datei des anderen zu ändern):

- **Kürzel der bearbeitenden Person:** `src/app/lib/user.js` (vorhanden): `getBy()`, `setBy(v)`, `onByChange(fn)`. UI-VERHANDLUNG baut die Abfrage und Anzeige des Kürzels in der Dossierleiste und gibt es als `by` an die Kernfunktionen. UI-RECHTSAKTE nutzt `getBy()` als Autor nachverfolgter Änderungen im Word-Export.
- **Kartenexport:** Die Komponente `ExportMenu` (src/app/ui, gehört UI-RECHTSAKTE) erhält die neue optionale Eigenschaft `model`: eine Funktion `() => card` bzw. `() => Promise<card>`, die ein Kartenmodell nach `src/export` (`validateCard`) liefert. Ist sie gesetzt, bietet das Menü zusätzlich an: Word (Redline als Formatierung), Word (Änderungsverfolgung), formatierten Text kopieren, PDF mit Text (A4, 16:9). Ohne `model` bleibt das Menü wie bisher.
  UI-VERHANDLUNG übergibt `model` für seine Karten (Zeile, Chronologie einer Spur, Vergleich zweier Zellen, «Was ist neu») und prüft seine Kartenmodelle mit `validateCard` in Tests; der Menüteil selbst ist in seiner Arbeitskopie noch nicht sichtbar.
- **Vorschau hängiger Vorschläge, Deep Link:** Parameter `pv=<dossierId>~<trackId>~<docId|latest>` in den Ansichten des Moduls Rechtsakte (`lesen`, `vergleich`, `chronologie`) schaltet die Vorschau ein. UI-RECHTSAKTE wertet ihn aus (liest das Dossier über den bestehenden Speicher des Verhandlungsmoduls `src/app/modules/neg/store.js`, nur lesend, und ruft `buildPreview` aus `src/neg`). UI-VERHANDLUNG erzeugt solche Links («Im SGK als Vorschau öffnen») und zeigt im Zeilendetail die Wirkung direkt (alt/neu der betroffenen Bestimmung über `buildPreview`).
- **Werke:** Das Modul «SGK» wird zum Modul «Rechtsakte» mit Werkwahl (SGK, EES-VO, ETIAS-VO, VIS-VO, IO-VO). Hash-Parameter `w=<workId>` (Standard `sgk`). Links aus dem Verhandlungsmodul auf eine Bestimmung: `#/lesen?w=<workId>&u=<unit>&k=<key>`; bestehende Links ohne `w` bleiben gültig.
- **Modulnamen:** DE «Rechtsakte» / FR «Actes juridiques»; «Verhandlung» / «Négociation» unverändert. Produktname bleibt «SGK-Navigator».
- Beide: i18n DE/FR vollständig, Abstands- und Schaltflächensystem, keine Clippings 1024–1920 px, Anleitung (DE/FR) um die neuen Funktionen ergänzen (jeder in seinem Modul), bestehende Tests grün.
