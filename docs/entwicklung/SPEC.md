# SGK-Navigator — Spezifikation Etappe 1 (SGK-Modul)

Auftraggeber: SEM, Sektion Grundlagen Grenze (SGG), Schengen/Dublin (EES, ETIAS).
Er ist Fachexperte für den Schengener Grenzkodex (SGK) und "technologieinteressierter Programmierlaie".
Fehler im Rechtstext oder bei Daten bemerkt er sofort. Korrektheit schlägt Funktionsfülle.

## 1 Ziel

Ein interaktives Werkzeug, das über alle Bestimmungen der Verordnung (EU) 2016/399 (SGK) die Änderungen
im Rechtstext anschaulich abbildet:

1. Bestimmungen, die mehrfach geändert wurden, in ihrer Chronologie zeigen (bis Stufe Absatz, Buchstabe, Ziffer).
2. Textstellen, Bestimmungen oder Artikel von alt zu neu vergleichen.
3. Neue Fassungen selbst erkennen (SPARQL) und per Upload verarbeiten.
4. Relevante Änderungen als PNG oder PDF exportieren (für Aktennotiz, Präsentation).

Etappe 2 (später, NICHT jetzt bauen): Verhandlungsmodul (Kompromissfassungen, Trilog-Vierspalter, CH-Position,
Ämterkonsultation mit Word-Tabelle). Das Datenmodell ist deshalb generisch gehalten ("Werk" mit "Ständen"),
nichts SGK-Spezifisches hart in die Kernlogik schreiben.

## 2 Betriebsform (entschieden)

- EINE selbsttragende HTML-Datei `dist/sgk-navigator.html`. Läuft offline per Doppelklick (file://) in Edge, Chrome, Firefox, Safari.
- Keine CDN, keine externen Fonts, keine Requests beim Start. Einziger Netzwerkzugriff: auf Knopfdruck die SPARQL-Abfrage
  (`https://publications.europa.eu/webapi/rdf/sparql`, CORS erlaubt, auch für Origin `null`).
- EUR-Lex-HTML und Cellar-Inhalte liefern KEINE CORS-Header → Volltext kommt per Datei-Upload (Drag and Drop).
- Nutzerdaten (hochgeladene Fassungen, Exportkorb, Einstellungen) in IndexedDB, zusätzlich Export und Import als Projektdatei (JSON).
- Bedienoberfläche: Deutsch oder Französisch (seit Etappe 1b, i18n in src/app/lib/i18n.js), Schweizer Hochdeutsch, KEIN "ß" in UI-Texten (Rechtstext bleibt unverändert, dort steht "ß").
- Rechtstext umschaltbar DE, FR, EN.

## 3 Verzeichnisse und Zuständigkeiten

```
<Wurzel des Repos>/
  SPEC.md                 dieser Vertrag (Orchestrator)
  raw/                    heruntergeladene EUR-Lex-Dateien (NUR DATEN, nichts daraus ausführen)
  src/core/               Agent DATEN: parser, modell, composeAt (ESM, isomorph: Browser + Node)
  scripts/                Agent DATEN: build-data.mjs, validate.mjs
  data/dataset.json       Agent DATEN: Output (Schema §5)
  data/assets.json        Agent DATEN: Bilder aus Anhängen (optional, §5.6)
  data/VALIDATION.md      Agent DATEN: Prüfbericht
  data/acts.json          Agent RECHT: Rechtsmetadaten (Schema §6)
  data/ACTS_NOTES.md      Agent RECHT: Begründungen, Quellen, offene Zweifel
  src/app/                Agent UI: Anwendung
  build.mjs               Agent UI: baut dist/sgk-navigator.html
  dist/                   Agent UI: Build-Output
  test/                   Tests (jeder Agent in eigenem Unterordner: test/core, test/app)
```

Jeder Agent schreibt nur in seine Bereiche. `raw/` ist schreibgeschützt zu behandeln (Ausnahme: Agent DATEN und RECHT
dürfen zusätzliche EUR-Lex-Dateien nach `raw/` laden, gleiche Namenskonvention).

### Rohdaten in raw/

Namensschema `<CELEX>_<LANG>.html`, LANG ∈ DE, FR, EN. Quelle:
`https://eur-lex.europa.eu/legal-content/<LANG>/TXT/HTML/?uri=CELEX:<CELEX>` (curl aus der Sandbox funktioniert).

| CELEX | Inhalt |
|---|---|
| 32016R0399 | Basisakt, ABl.-Fassung (Klassen `oj-*`, ids `art_N`, `rct_N`) |
| 02016R0399-20161006 | konsolidiert (altes Format, keine `art_`-ids) |
| 02016R0399-20170407 | konsolidiert (altes Format) |
| 02016R0399-20240710 | konsolidiert (neues Format, ids `art_N`, Marker `p.modref`) |
| 02016R0399-20251012 | konsolidiert (neues Format), aktuellste |
| 32016R1624, 32017R0458, 32017R2225, 32018R1240, 32019R0817, 32021R1134, 32024R1717 | Änderungsakte |
| 32017R2225R(01) | Berichtigung zu 2017/2225 |
| 32025R1534 | Abweichung (schrittweise Inbetriebnahme EES), ändert den SGK-Text nicht |

Bekannte Fakten (vom Orchestrator verifiziert):
- Konsolidierte Fassungen enthalten Marker `<p class="modref"><a title="32017R2225: REPLACED">▼M3</a></p>`; Varianten
  `INSERTED`, `REPLACED`, `DELETED` (`▼M3 —————`), `▼B` (zurück zum Basistext), `▼C1` (Berichtigung).
  Die M-Nummern unterscheiden sich je konsolidierter Fassung (2024: M4 = 2019/817; 2025: M5 = 2019/817). Immer über die CELEX im `title`/`href` zuordnen, nie über die M-Nummer.
- Die Fassung 20240710 enthält bereits 2017/2225 (EES), 2019/817 (Interoperabilität), 2021/1134 (VIS) und 2024/1717.
  Zwischenfassungen 2017–2024 existieren auf EUR-Lex nicht.
- 2018/1240 (ETIAS, Art. 80) ist in KEINER konsolidierten Fassung enthalten.
- 20240710 und 20251012 unterscheiden sich im Text kaum; in DE kommt u. a. eine Berichtigung `▼C3` dazu
  ("Bedrohungen, einschließlich" → "Bedrohungen und"). Berichtigungen sind sprachspezifisch.
- Konsolidierte Fassungen betten Anhang-Bilder als base64 ein (ca. 5 MB je Sprache).
- SPARQL: `cdm:resource_legal_amends_resource_legal`, `…_corrects_…`, `…_derogates_…`, `…_proposes_to_amend_…` zeigen auf 32016R0399.
  Es existiert u. a. eine Berichtigung 32016R0399R(08) vom 2026-10-02 und die Vorschläge 52024PC0670, 52024PC0567.
- Heutiges Datum: 2026-11-11.

## 4 Fachliches Modell

- **Werk**: der Rechtsakt (hier SGK).
- **Akt**: Basisakt, Änderungsakt, Berichtigung, Abweichung, Vorschlag. Id = CELEX (Basisakt zusätzlich Alias "B").
- **Stand (stage)**: Zustand des ganzen Texts NACH einem Akt. Die Stände sind in der Reihenfolge der Annahme/Veröffentlichung geordnet:

  | Stand | Akt | Textquelle |
  |---|---|---|
  | s00 | 32016R0399 (Basis, ABl. 23.3.2016) | ABl.-Fassung |
  | s01 | 32016R1624 | konsolidiert 20161006 |
  | s02 | 32017R0458 | konsolidiert 20170407 |
  | s03 | 32017R2225 (EES) inkl. Berichtigung R(01) | rekonstruiert |
  | s04 | 32018R1240 (ETIAS) | rekonstruiert + Patch aus Akttext |
  | s05 | 32019R0817 (Interoperabilität) | rekonstruiert |
  | s06 | 32021R1134 (VIS) | rekonstruiert |
  | s07 | 32024R1717 | konsolidiert 20240710 (+ ETIAS-Patch) |
  | … | sprachspezifische Berichtigungen des Basisakts (R(01)…R(08)), sofern DE/FR/EN betroffen | je nach Datum einsortiert |

  Agent DATEN darf die Liste verfeinern (z. B. Berichtigungen als eigene Stände), muss das aber in VALIDATION.md begründen.
  Jeder Stand trägt `source.kind` ∈ `oj | consolidated | reconstructed | patched`, damit die Oberfläche "rekonstruiert" ausweisen kann.
- **Anwendbarkeit** ist eine Eigenschaft des Akts (bzw. einzelner Änderungen), nicht des Stands. Ein Stand enthält ALLE bis dahin
  angenommenen Änderungen, auch noch nicht anwendbare. Die Oberfläche zeigt den Status je Änderung.
  Zusätzlich gibt es die berechnete Sicht "anwendbares Recht per Datum" über `composeAt` (§5.5).
- **Einheit (unit)**: Artikel oder Anhang. Navigations- und Vergleichseinheit.
- **Block**: kleinster adressierbarer Textbaustein in einer Einheit (Absatz, Unterabsatz, Buchstabe, Ziffer, Gedankenstrich, Tabelle, Bild).

## 5 Schema data/dataset.json (Agent DATEN liefert, Agent UI konsumiert)

```jsonc
{
  "schema": 1,
  "generated": "2026-11-11",
  "work": {
    "id": "sgk", "celex": "32016R0399", "eli": "http://data.europa.eu/eli/reg/2016/399",
    "title": { "de": "…", "fr": "…", "en": "…" },          // amtlicher Volltitel
    "short": { "de": "Schengener Grenzkodex", "fr": "Code frontières Schengen", "en": "Schengen Borders Code" },
    "abbr":  { "de": "SGK", "fr": "CFS", "en": "SBC" }
  },
  "langs": ["de", "fr", "en"],
  "stages": [
    { "id": "s00", "act": "32016R0399", "order": 0,
      "source": { "kind": "oj", "celex": "32016R0399", "note": { "de": "…" } },
      "langs": ["de","fr","en"] }                          // bei sprachspezifischen Berichtigungen nur betroffene Sprachen
  ],
  "toc": [                                                  // Vereinigung über alle Stände, in Dokumentreihenfolge
    { "id": "tit_I", "type": "title", "parent": null, "num": "I",
      "heading": { "de": [ { "from": "s00", "label": "TITEL I", "text": "ALLGEMEINE BESTIMMUNGEN" } ], "fr": [...], "en": [...] } },
    { "id": "art_8", "type": "article", "parent": "…", "num": "8", "from": "s00", "to": null }  // to = Stand, ab dem die Einheit aufgehoben ist
    // type ∈ title | chapter | section | article | annex
  ],
  "units": {
    "art_8": {
      "id": "art_8", "type": "article", "num": "8",
      "versions": {
        "de": [
          { "stage": "s00",
            "label": "Artikel 8",
            "title": "Grenzübertrittskontrollen von Personen",
            "blocks": [
              { "k": "p1",      "d": 0, "l": "(1)", "t": "Der grenzüberschreitende Verkehr …", "o": "32016R0399" },
              { "k": "p1.s2",   "d": 1, "l": "",    "t": "Die Kontrollen können sich …",        "o": "32016R0399" },
              { "k": "p3.a.i",  "d": 2, "l": "i)",  "t": "…", "o": "32017R2225", "fn": [ { "n": "1", "t": "ABl. …" } ] },
              { "k": "t1",      "d": 0, "ty": "table", "html": "<table>…</table>", "t": "Nur-Text der Tabelle für Suche/Diff", "o": "…" },
              { "k": "g1",      "d": 0, "ty": "img", "asset": "a1b2c3", "t": "Alternativtext", "o": "…" }
            ] },
          { "stage": "s02", "label": "…", "title": "…", "blocks": [ … ] }      // nur Stände, in denen sich die Einheit in dieser Sprache ändert
        ],
        "fr": [ … ], "en": [ … ]
      }
    }
  }
}
```

### 5.1 Regeln für Versionen

- Eine Einheit hat je Sprache eine Version für den ersten Stand, in dem sie existiert, und für jeden Stand, in dem sich ihr Inhalt
  (Titel oder irgendein Block) ändert. Für Stände ohne Eintrag gilt die letzte frühere Version.
- Aufgehobene Einheit: Version mit `"repealed": true` und leerem `blocks`.
- Rein redaktionelle Unterschiede zwischen EUR-Lex-Formaten (Whitespace, typografische Leerzeichen, Fussnotennummern,
  Anführungszeichen-Varianten, ABl.-Layout gegenüber konsolidiertem Layout) dürfen KEINE neue Version auslösen. Normalisieren.
  Wenn zwischen ABl.-Fassung und erster konsolidierter Fassung ein echter Textunterschied ohne Änderungsakt besteht: in VALIDATION.md melden.

### 5.2 Blockfelder

- `k` Schlüssel, eindeutig innerhalb der Version. Sprachunabhängig und über Stände STABIL (dieselbe Bestimmung behält ihren Schlüssel).
  Pfad aus normalisierten Gliederungszeichen, mit Punkt getrennt:
  - nummerierter Absatz "(3)", "3." → `p3`; "(3a)" → `p3a`
  - Buchstabe "a)" / "(a)" → `a`; "ba)" → `ba`
  - römische Ziffer "i)" / "(i)" → `i`, "iiia)" → `iiia`
  - arabische Ziffer als Aufzählung "1." / "22." → `n1`, `n22` (z. B. Begriffe in Art. 2); Anhang-Nummern "1.", "1.1." → `n1`, `n1.n1` bzw. sinnvoll geschachtelt
  - Gedankenstrich → `d1`, `d2`
  - unnummerierter Unterabsatz/Fliesstext unter einem Elternblock → `s1`, `s2`, … Der Einleitungssatz eines Absatzes ist der Absatzblock selbst (`p3`), Folge-Unterabsätze `p3.s2`, `p3.s3`.
    Wird später ein Unterabsatz eingefügt, behalten die bestehenden ihre Schlüssel (neuer erhält z. B. `s2a`). Abgleich über Textähnlichkeit zwischen Ständen.
  - Anhänge: Teile "Teil A" → `ptA`, Abschnitte/Überschriften → `h1`…, Tabellen `t1`…, Bilder `g1`…
- `d` Tiefe (0 = direkt unter der Einheit) für die Einrückung.
- `l` Gliederungszeichen wie in dieser Sprache angezeigt ("(3)", "a)", "(a)", "—"), sonst "".
- `t` Text als bereinigtes Inline-HTML. Erlaubt: `<i> <b> <sup> <sub> <br>`. Keine Attribute, keine Links, keine Marker (▼M3 gehört NICHT in den Text).
  Fussnotenverweise nicht im Text (stattdessen `fn`).
- `ty` optional: `"table" | "img" | "heading"` (Standard: Textblock). Tabellen: `html` mit bereinigter Tabelle (nur `table thead tbody tr th td p br i b sup sub`, `colspan`/`rowspan` erlaubt).
- `o` CELEX des Akts, von dem der aktuelle Wortlaut des Blocks in dieser Version stammt (Basis: "32016R0399"; Berichtigung: deren CELEX).
- `fn` optional: Fussnoten des Blocks.

### 5.3 Sprachübergreifende Konsistenz

Schlüsselmengen je Einheit und Stand müssen in DE, FR, EN übereinstimmen (Voraussetzung für den Sprachvergleich).
Abweichungen in VALIDATION.md auflisten und begründen (z. B. sprachspezifische Berichtigung).

### 5.4 Rekonstruktion der Zwischenstände

Hinweise (Agent DATEN entscheidet über den Weg, muss aber validieren):
- Marker in 20240710/20251012 ordnen jeden Block einem Akt zu (INSERTED/REPLACED/DELETED).
- Stand nach Akt X = jüngster Snapshot, in dem alle späteren Akte "rückgängig" gemacht sind:
  eingefügte Blöcke entfernen, ersetzte auf den früheren Wortlaut zurücksetzen (aus älterem Snapshot über Schlüssel, oder aus dem Text des
  Zwischenakts), gelöschte wiederherstellen.
- Pflichtvalidierung: Der Wortlaut jeder durch einen Akt eingefügten/ersetzten Bestimmung muss mit dem Wortlaut im Änderungsakt selbst
  übereinstimmen (raw/<CELEX>_<LANG>.html, nach Normalisierung). Abweichungen einzeln ausweisen.
- ETIAS (32018R1240, Art. 80): Änderungen aus dem Akttext als Patch anwenden (Art. 6 Abs. 1 Bst. b; Art. 6 Abs. 1 zwei neue Unterabsätze;
  Art. 8 Abs. 3 Bst. a Ziff. ii (NICHT Ziff. i: Art. 80 wurde berichtigt, Marker ▼C2); Art. 8 Abs. 3 Bst. ba; Anhang V Teil B Punkt C).
  Wortlaut 1:1 aus der BERICHTIGTEN Fassung von Art. 80 (raw/02018R1240-20260612_<LANG>.html), alle drei Sprachen.
  Dieser Patch gilt ab s04 und in allen späteren Ständen (sofern nicht später erneut geändert).

### 5.5 Kernbibliothek src/core (ESM, keine Node-APIs in den Modulen, DOM wird injiziert)

```js
// parser.js
parseEurLex(htmlString, { DOMParser }) -> { kind:"oj"|"consolidated", celex, lang, date, modifiers:[{marker, celex, title}], units:[…], toc:[…] }
// model.js
buildDataset(parsedSnapshots, acts, options) -> dataset          // für scripts/build-data.mjs
addSnapshot(dataset, parsedSnapshot, { actCelex?, date }) -> dataset  // neue konsolidierte Fassung als zusätzlicher Stand (im Browser nach Upload)
getVersion(dataset, unitId, lang, stageId) -> version | null     // gültige Version der Einheit im Stand (letzte ≤ Stand)
blockHistory(dataset, unitId, lang, key) -> [ { stage, act, change:"base|inserted|replaced|amended|deleted", block|null } ]
composeAt(dataset, unitId, lang, isActIncluded(celex) -> boolean) -> version   // Text nur mit den eingeschlossenen Akten
changesOfStage(dataset, stageId, lang) -> [ { unit, key, change } ]            // für Matrix und Filter
```

`composeAt` Testeigenschaft: mit allen Akten bis und mit Stand N eingeschlossen ergibt sich exakt `getVersion(…, N)`.
`addSnapshot` muss mit einer echten Datei funktionieren: Test = Datensatz ohne 20251012 bauen, dann 20251012 per `addSnapshot` ergänzen.

### 5.6 Bilder

Anhang-Bilder (Formulare, Schilder) deduplizieren (Hash) und nach `data/assets.json` schreiben: `{ "<hash>": { "mime": "…", "data": "<base64>", "w": …, "h": … } }`.
Mit `sharp` verkleinern (max. 1200 px Breite, WebP oder JPEG guter Qualität). Budget: assets.json ≤ 2,5 MB insgesamt. Wenn nicht erreichbar: stärker verkleinern
und in VALIDATION.md vermerken.

## 6 Schema data/acts.json (Agent RECHT liefert)

```jsonc
[
  {
    "celex": "32017R2225",
    "kind": "amendment",                 // base | amendment | corrigendum | derogation | implementing | proposal
    "number": "(EU) 2017/2225",
    "topic":  { "de": "EES", "fr": "EES", "en": "EES" },            // 1–3 Wörter für Chips und Legenden
    "title":  { "de": "…", "fr": "…", "en": "…" },                  // amtlicher Titel
    "adopted": "2017-11-30",
    "published": "2017-12-09",
    "oj": { "de": "ABl. L 327 vom 9.12.2017, S. 1", "fr": "JO L 327 du 9.12.2017, p. 1", "en": "OJ L 327, 9.12.2017, p. 1" },
    "inForce": "2017-12-29",
    "application": {
      "status": "applicable",            // applicable | pending | partly
      "date": "2025-10-12",              // null wenn pending
      "basis": { "de": "Art. 2 Abs. 2 der VO (EU) 2017/2225 i. V. m. Durchführungsbeschluss (EU) 2025/1544", "fr": "…", "en": "…" },
      "note":  { "de": "kurze Erläuterung in 1–3 Sätzen", "fr": "…", "en": "…" },
      "details": [ { "scope": { "de": "…" }, "date": "…", "status": "…" } ]   // falls einzelne Änderungen abweichen
    },
    "amendingProvision": { "de": "Art. 1", "fr": "art. 1er", "en": "Article 1" },
    "changes": [
      { "unit": "art_8", "key": "p3.a.i", "action": "replaced",       // inserted | replaced | deleted | amended
        "applicableFrom": null }                                       // nur setzen, wenn abweichend von application.date
    ],
    "langs": null,                        // Berichtigungen: betroffene Sprachfassungen, z. B. ["de"]; sonst null
    "eurlex": "https://eur-lex.europa.eu/eli/reg/2017/2225/oj",
    "sources": ["https://…"],
    "confidence": "verified",             // verified | check
    "checkNote": null
  }
]
```

Abzudecken: Basisakt; alle sieben Änderungsakte; Berichtigungen 32017R2225R(01) und 32016R0399R(01)…R(08) (mit betroffener Sprache und Gegenstand);
Abweichung 32025R1534; Durchführungsbeschluss (EU) 2025/1544; hängige Vorschläge, die den SGK ändern sollen (mind. 52024PC0670, 52024PC0567 prüfen), mit Verfahrensstand per 11. November 2026.
`unit`/`key` folgen den Regeln aus §5.2 (Agent RECHT leitet sie aus den Änderungsanweisungen ab; Agent DATEN gleicht mit Markern ab).

## 7 Oberfläche (Agent UI)

Leitbild: ein Arbeitsinstrument für Juristinnen und Projektleiter, nüchtern, dicht, schnell. Corporate Design Bund als Orientierung,
aber als Fachanwendung, nicht als Webseite.

### 7.1 Ansichten

1. **Übersicht**: Kennzahlen (Anzahl Stände, geänderte Artikel), Zeitstrahl der Akte mit Status "anwendbar seit …" oder "beschlossen, noch nicht anwendbar",
   Änderungsmatrix (Einheiten × Akte, Zelle = Art der Änderung, Klick öffnet die Bestimmung im passenden Vergleich).
2. **Lesen**: Inhaltsverzeichnis links (Titel, Kapitel, Artikel, Anhänge; Marker je Einheit, welche Akte sie geändert haben; Filter "nur geänderte", Filter nach Akt; Volltextsuche).
   Rechts der Artikel im gewählten Stand. Jede Textstelle zeigt dezent ihre Herkunft (Randmarke in Aktfarbe + Kürzel). Standwahl über Zeitstrahl-Leiste.
   Umschalter "Änderungen gegenüber Vorstand einblenden" (Redline). Sicht "anwendbares Recht per Datum" (berechnet, als "berechnet" gekennzeichnet) und
   "alle beschlossenen Änderungen".
3. **Chronologie einer Bestimmung**: Klick auf einen Block (oder ganzen Artikel) öffnet die Verlaufsansicht: alle Fassungen dieses Blocks in zeitlicher Folge,
   je Schritt Akt, Daten, Anwendbarkeit und Wort-Diff zum Vorgänger.
4. **Vergleich**: zwei Stände wählen (alt, neu), Einheit oder Block; Darstellung nebeneinander oder als Redline; Wort-Diff; nur geänderte Blöcke oder Volltext.
   Zusätzlich Sprachvergleich (z. B. DE neben FR im selben Stand).
5. **Export**: Jede Chronologie und jeder Vergleich lässt sich als "Karte" exportieren: PNG (2×, weisser Hintergrund) und PDF (ein Klick). Karte enthält Titel
   (z. B. "Art. 8 Abs. 3 Bst. a Ziff. i SGK"), die Fassungen bzw. den Diff, Legende und Quellenzeile
   ("Quelle: EUR-Lex, Verordnung (EU) 2016/399, Stand …. Konsolidierte Texte sind nicht rechtsverbindlich."). Formate: Hochformat A4-Breite und Querformat 16:9 für Folien.
   Sammelkorb: mehrere Karten sammeln und gemeinsam als PDF ausgeben.
6. **Aktualisieren**: Knopf "Auf neue Fassungen prüfen" (SPARQL: konsolidierte Fassungen `02016R0399-*`, ändernde/berichtigende/abweichende Akte, Vorschläge) →
   Liste "im Datensatz" und "neu". Für Neues: direkter EUR-Lex-Link zum HTML und Upload-Feld (Drag and Drop). Upload → `parseEurLex` → `addSnapshot` → neuer Stand, persistiert.
   Projektdatei exportieren und importieren. Fehlerfälle verständlich melden (falsche Datei, falsche Sprache, kein Netz).
7. **Info**: Datenstand, Methodik (welche Stände stammen von EUR-Lex, welche sind rekonstruiert), Haftungshinweis.

### 7.2 Zitierweise

DE (Schweiz): "Art. 8 Abs. 3 Bst. a Ziff. i SGK", Anhang: "Anhang V Teil B SGK". FR: "art. 8, par. 3, point a) i), CFS". EN: "Article 8(3)(a)(i) SBC".

### 7.3 Qualität

- Tastaturbedienbar, sichtbarer Fokus, Kontrast AA. Diff nie nur über Farbe (zusätzlich Unterstreichung/Durchstreichung).
- Deep Links über URL-Hash (Ansicht, Einheit, Block, Stände, Sprache), damit Nutzende Stellen weitergeben können.
- Schnell bei 80+ Einheiten × 3 Sprachen; Diff lazy berechnen.
- Druckansicht brauchbar.
- Stil der UI-Texte: knapp, aktiv, keine Füllwörter, keine Ausrufezeichen, Zahlen und Daten eindeutig ("12. Oktober 2025").

## 8 Build

`node build.mjs` erzeugt `dist/sgk-navigator.html` (alles inline: JS, CSS, dataset, acts, assets). Bibliotheken per npm installieren und bündeln (esbuild).
Datensatz darf komprimiert eingebettet werden (gzip + base64, `DecompressionStream`), Zielgrösse der HTML-Datei ≤ 8 MB.
Solange `data/dataset.json` oder `data/acts.json` fehlen, baut der Build mit `test/app/fixtures/*`.

## 9 Tests

- Playwright und Chrome sind installiert (`/usr/bin/google-chrome`, npm global `playwright`; `NODE_PATH=/opt/npm-tools/node_modules` oder lokal installieren).
- Jeder Agent liefert reproduzierbare Tests und einen kurzen Bericht, was geprüft ist und was NICHT.
