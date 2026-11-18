# SGK-Navigator — Spezifikation Etappe 2 (Modul Verhandlung)

Gilt zusätzlich zu SPEC.md (Betriebsform §2 bleibt: EINE selbsttragende HTML-Datei, offline, file://, keine Server).
Auftraggeber: SEM, Sektion Grundlagen Grenze (SGG). Die Sektion vertritt bzw. koordiniert die Schweizer Position (CH) in
Verhandlungen zu Schengen-Weiterentwicklungen (Ratsarbeitsgruppen, JHA Counsellors, Trilog-Begleitung).

## 1 Auftrag in den Worten des Nutzers (sinngemäss)

In den Verhandlungen zu einer neuen Verordnung werden die Arbeitsversionen der Kommission, der Ratspräsidentschaft und später
des Europäischen Parlaments unübersichtlich. Im Trilog gibt es das Vier-Spalten-Dokument, das die Versionen gegenüberstellt,
inklusive der Änderungsanträge des EP. Gewünscht:

1. Die jeweils aktuellste Version des Kompromissvorschlags oder später des Trilog-Dokuments hochladen; das Tool bildet die Änderungen ab
   (dieselben Stärken wie im SGK-Modul: Chronologie je Bestimmung, Vergleich alt/neu, Export).
2. Die Position der Schweiz (CH) zu Artikeln und Bestimmungen im Tool abbilden.
3. Die Gesamtsicht in einem Format bereitstellen, das konsultierte Stellen ohne Tool-Zugriff in der Ämterkonsultation kommentieren können.
   ENTSCHIEDEN: Word-Tabelle (.docx) mit einer Zeile pro Bestimmung und Kommentarspalte; die Stellen füllen sie aus, das Tool liest sie wieder ein.
   Zusätzlich eine Leseversion als PDF.
4. Die Kommentare der konsultierten Stellen hochladen; das Tool zeigt eine aggregierte Konsultationssicht.
5. Eingehende Kommentare verarbeiten: annehmen, ablehnen, mit oder ohne Kommentar dazu.
6. Die finale Position von CH als Output für die Verhandlungsteilnahme bereitstellen.

Sprachen: Verhandlungstexte sind Englisch (einzige Textsprache des Moduls). Oberfläche Deutsch oder Französisch (i18n aus Etappe 1b).
Konsultationsdokumente und Outputs wahlweise Deutsch oder Französisch (Rahmentexte), Rechtstext bleibt Englisch.

Vertraulichkeit: Ratsdokumente sind oft LIMITE, CH-Positionen sind intern. Alles bleibt lokal (IndexedDB + Projektdatei).
Kein Netzwerkzugriff des Moduls. Die Oberfläche weist darauf hin, dass Projektdateien vertrauliche Inhalte enthalten.

## 2 Reale Dokumente (Recherche des Orchestrators)

- Öffentliche Vier-Spalten-Tabellen liegen im Ratsregister als PDF (`https://data.consilium.europa.eu/doc/document/<ST|WK>-<nr>-<jahr>-INIT/en/pdf`,
  curl aus der Sandbox funktioniert; www.consilium.europa.eu und europarl.europa.eu/doceo liefern 403).
  Beispiele: ST 8413/23 (Screening), ST 16759/23, ST 16760/23, WK 16999/23, WK 2527/24, WK 1588/24, ST 10613/25, ST 7749/25, ST 9796/23, ST 8390/23.
  Zur SGK-Revision 2021/0428(COD) (wurde VO (EU) 2024/1717) existieren öffentliche Vier-Spalten-Tabellen
  ("Four-column table … amending Regulation (EU) 2016/399 …", z. B. Dokument vom Oktober 2023): mehrere aufeinanderfolgende Fassungen suchen.
- Aufbau der neueren Tabellen (Trilogue Table Editor): Kopfzeile "Commission Proposal | EP Mandate | Council Mandate | Draft Agreement"
  (teils weitere Spalten), davor eine schmale Spalte mit Zeilennummer und Statuskürzel (z. B. "G" = grün = vorläufig vereinbart; auch gelb/rot),
  Zwischenzeilen mit der Fundstelle ("Formula", "Recital 2", "Article 1, first paragraph, point (1)", …), Fusszeile mit Titel, Verfahrensnummer, Datum, Seite.
  Ältere Tabellen: ohne Zeilennummern, gleiche vier Spalten.
- Intern erhält die Sektion die Dokumente typischerweise als Word (.docx) und PDF. Öffentlich gibt es nur PDF.
  → BEIDE Formate müssen funktionieren. Für .docx gibt es keine öffentlichen Originale: Parser generisch bauen (Tabellen mit Spaltenzuordnung)
  und mit selbst erzeugten, strukturell realistischen .docx testen.
- Kommissionsvorschläge: EUR-Lex-HTML (z. B. raw: `…/legal-content/EN/TXT/HTML/?uri=CELEX:52024PC0670`, erreichbar).
- Hängig und für die Sektion aktuell: 2024/0670(COD) (EU Digital Travel application, ändert u. a. Art. 2, 8, 8a SGK). Öffentliche Dokumente dazu suchen
  (Vorschlag, Ratsmandat, ggf. Vier-Spalten-Tabelle; OEIL ist erreichbar: oeil.secure.europarl.europa.eu).
- Für mitgelieferte Beispieldaten NUR amtlich veröffentlichte Dokumente verwenden (Ratsregister öffentlich, EUR-Lex). Keine geleakten Dokumente
  (Statewatch u. ä.) einbetten. Quelle und Dokumentnummer immer mitführen.

## 3 Fachliches Modell

- **Dossier**: ein Gesetzgebungsverfahren (Titel, Verfahrensnummer, Sprache en).
- **Spur (track)**: Textstrang einer Institution: `com` (Kommissionsvorschlag), `ep` (EP-Mandat/Änderungsanträge), `council` (Ratsmandat bzw.
  Präsidentschaftskompromisse vor dem Trilog), `agreement` (Kompromiss/Draft Agreement im Trilog). Weitere Spuren möglich.
- **Dokument**: eine hochgeladene Fassung (Vier-Spalten-Tabelle vom Datum X, Kompromisstext REV 2, Vorschlag …) mit Metadaten
  (Nummer, Datum, Art, Einstufung, Dateiname, Hash). Ein Dokument liefert Zellen für eine oder mehrere Spuren.
- **Zeile (row)**: eine Bestimmung/Texteinheit (Erwägungsgrund, Artikel-Absatz, Buchstabe …) mit stabiler Id, Reihenfolge, Fundstellen-Label und,
  falls vorhanden, der Zeilennummer aus der Vier-Spalten-Tabelle. Zeilen sind das Raster für Vergleich, Position und Konsultation.
- **Zelle**: Text einer Zeile in einer Spur gemäss einem Dokument (mit Inline-Auszeichnung der Quelle und Status, z. B. vorläufig vereinbart).
  Die Folge der Zellen einer Zeile in einer Spur über die Dokumente ist deren Chronologie.
- **CH-Position** je Zeile: Haltung, Priorität, Begründung, Textvorschlag, Rückfallposition, zuständige Stelle, Bezug (auf welche Fassung bezogen), Verlauf.
- **Konsultationsrunde**: Bezug (Dokument/Spur), Umfang (Zeilen), Frist, konsultierte Stellen, exportierte Unterlagen, eingegangene Rückmeldungen,
  Entscheide zu jeder Rückmeldung.

## 4 Schema Dossier (JSON; Projektdatei und IndexedDB)

```jsonc
{
  "schema": 1, "kind": "neg-dossier",
  "id": "d-2021-0428", "title": "…", "short": "SBC revision", "procedure": "2021/0428(COD)", "lang": "en",
  "created": "…", "updated": "…",
  "tracks": [ { "id": "com", "kind": "commission", "label": {"de":"Kommission","fr":"Commission","en":"Commission"} },
              { "id": "ep", "kind": "parliament", … }, { "id": "council", "kind": "council", … }, { "id": "agreement", "kind": "agreement", … } ],
  "documents": [ { "id": "doc3", "kind": "four-column",        // four-column | proposal | compromise | mandate | ep-report | other
                   "ref": "ST 8413/23", "title": "…", "date": "2023-04-17", "classification": "public",   // public | limite | restricted | internal
                   "file": { "name": "…", "size": 0, "sha256": "…", "type": "pdf" }, "importedAt": "…",
                   "tracks": ["com","ep","council","agreement"], "stats": { "rows": 0, "pages": 0 }, "warnings": ["…"], "note": "" } ],
  "rows": [ { "id": "r000120", "order": 120, "num": "12",             // num = Zeilennummer der Tabelle, sonst null
              "label": "Article 1, first paragraph, point (1)",       // Fundstelle wie in der Quelle
              "path": { "kind": "article", "art": "1", "par": "1", "pt": ["1"] },   // normalisiert: recital | article | annex | title | formula | heading | other
              "group": "art_1",                                       // Gruppierung für Navigation (Artikel, Erwägungsgründe, Anhang …)
              "amends": null,                                         // bei Änderungsverordnungen: { "work": "sgk", "unit": "art_8", "key": "p3" } falls erkennbar
              "createdBy": "doc1" } ],
  "cells": { "r000120": { "council": [ { "doc": "doc3", "html": "…<b>…</b><s>…</s>", "text": "Klartext", "status": "agreed", "empty": false } ] } },
       // html: nur b i u s sup sub br; status: agreed | provisional | open | deleted | null; Reihenfolge = Dokumentdatum
  "positions": { "r000120": { "stance": "support",        // support | support-with-changes | scrutiny | reservation | oppose | none
                              "priority": "high",          // redline | high | medium | low
                              "text": "Position und Begründung", "proposal": "Textvorschlag (EN)", "fallback": "Rückfallposition",
                              "owner": "SEM/SGG", "basis": { "track": "agreement", "doc": "doc3" },
                              "updated": "…", "history": [ { "at": "…", "stance": "…", "text": "…", "source": "manual|consultation:<id>" } ] } },
  "consultations": [ { "id": "k1", "title": "Ämterkonsultation 1", "created": "…", "deadline": "…", "lang": "de",
                       "basis": { "track": "agreement", "doc": "doc3", "compareTo": "doc2" }, "scope": ["r000120", "…"],
                       "offices": [ { "id": "o1", "abbr": "BJ", "name": "Bundesamt für Justiz" } ],
                       "responses": [ { "id": "a1", "office": "o1", "file": { "name": "…", "sha256": "…" }, "importedAt": "…",
                                        "items": [ { "id": "a1-1", "row": "r000120", "comment": "…", "proposal": "…", "source": "cell|word-comment|tracked-change" } ],
                                        "general": "allgemeine Bemerkung", "unmatched": [ "…" ] } ],
                       "decisions": { "a1-1": { "decision": "accepted", "reply": "…", "at": "…", "applied": true } } } ]   // accepted | partly | rejected | noted | open
}
```

## 5 Kernbibliothek src/neg (ESM, isomorph: Browser + Node; DOM, pdf.js und zip werden injiziert oder gebündelt)

```js
// Import
detectDocument(file: {name, bytes}) -> { type:"docx|pdf|html|json", guess:{ kind, ref, date, title, procedure, classification }, confidence }
parseFourColumnPdf(bytes, { pdfjs }) -> ParsedDoc
parseFourColumnDocx(bytes, opts) -> ParsedDoc
parseTextDocx(bytes, opts) -> ParsedDoc        // fortlaufender Text (Kompromissvorschlag der Präsidentschaft, Mandat)
parseTextPdf(bytes, { pdfjs }) -> ParsedDoc
parseProposalHtml(htmlString, { DOMParser }) -> ParsedDoc   // EUR-Lex COM-Dokument
// ParsedDoc = { meta, columns:[{index, header, suggestedTrack}], rows:[{num, label, path, cells:{<colIndex>:{html,text,status}}}], warnings:[…] }
// Zusammenführen
planMerge(dossier, parsedDoc, mapping) -> MergePlan     // mapping: Spalte → Spur; Plan: je Zeile matched|new|ambiguous, je Zelle unchanged|changed|new|removed
applyMerge(dossier, plan, overrides) -> dossier         // overrides: manuelle Zuordnungen aus der Prüfmaske
// Auswerten
rowHistory(dossier, rowId, trackId) -> [ { doc, date, html, text, status, change } ]
compareCells(a, b) -> Wort-Diff-Segmente                 // gleiche Semantik wie Diff im SGK-Modul
changesBetween(dossier, docA, docB, trackId) -> [ { row, change:"changed|new|removed|status", … } ]   // "Was ist neu in dieser Fassung"
stalePositions(dossier) -> [ rowId ]                     // Text hat sich seit dem Bezug der Position geändert
// Konsultation
buildConsultationDocx(dossier, consultationId, { office?, lang }) -> Uint8Array
parseConsultationDocx(bytes) -> { consultationId?, office?, items:[{rowId, comment, proposal, source}], general, unmatched, warnings }
importResponse(dossier, consultationId, parsed, { office }) -> dossier
aggregateConsultation(dossier, consultationId) -> je Zeile: Kommentare aller Stellen, Entscheide, Statistik
// Outputs
buildPositionDocx(dossier, { rows?, filter, lang, variant:"briefing|full|consultation-report" }) -> Uint8Array
exportDossier(dossier) / importDossier(json)             // Projektdatei, mit Schema-Prüfung und Migration
```

### 5.1 Anforderungen an die Parser

- Vier-Spalten-PDF: Spalten über x-Koordinaten der Textobjekte bestimmen; Kopf- und Fusszeilen, Seitenzahlen, Deckblatt erkennen und entfernen;
  Zeilen über Zeilennummer/Fundstellen-Zwischenzeilen und vertikale Lücken bilden; Zellen über Seitenumbrüche zusammenführen; Fussnoten in Zellen behalten;
  fett/kursiv aus den Schriftnamen ableiten (b/i), soweit möglich; Durchstreichungen und Farben sind im PDF oft nicht verlässlich lesbar: als Warnung ausweisen.
  Statuskürzel (G/Y/R) der Zeilenspalte erfassen. Silbentrennung am Zeilenende NICHT blind auflösen (nur Zeilenumbrüche zu Leerzeichen).
- Vier-Spalten-DOCX: `word/document.xml` direkt lesen (fflate + XML), Tabellen erkennen, Zellen mit Lauf-Formatierung (b, i, u, strike, Hervorhebung,
  Schriftfarbe) und Änderungsverfolgung (`w:ins` übernehmen, `w:del` als gestrichen markieren oder weglassen: Option) lesen, verbundene Zellen behandeln,
  Zell-Schattierung als Status deuten (grün = agreed usw.). Generisch: jede Tabelle mit ≥ 2 Textspalten ist importierbar, die Spaltenzuordnung schlägt der
  Parser vor, die Oberfläche lässt sie korrigieren.
- Fortlaufende Texte (Kompromissvorschlag, Mandat): in Erwägungsgründe, Artikel, Absätze, Buchstaben gliedern (englische Konventionen: "Article 5",
  "1.", "(a)", "(i)"; "Recital (12)"), Pfade bilden, mit bestehenden Zeilen über Pfad und Textähnlichkeit abgleichen.
- Robustheit vor Vollautomatik: Jeder Import liefert Warnungen und eine Trefferquote; nichts wird ohne Prüfmaske übernommen (`planMerge` → Oberfläche → `applyMerge`).
- Zeilenabgleich zwischen Fassungen: zuerst Zeilennummer + Fundstelle, dann Pfad, dann Textähnlichkeit; neue Zwischenzeilen ("12a") korrekt einordnen;
  Mehrdeutiges als `ambiguous` an die Prüfmaske geben.

### 5.2 Konsultationsdokument (.docx)

- Selbst erzeugtes OOXML (fflate), A4 quer, saubere Formatvorlagen (Arial/Liberation Sans 9–10 pt), wiederholte Kopfzeile, Seitenzahlen.
- Kopf: Dossier, Verfahrensnummer, Runde, Grundlage (Dokument, Datum), Frist, Feld "Stellungnehmende Stelle", kurze Anleitung zum Ausfüllen,
  Vertraulichkeitsvermerk (übernommen aus der Einstufung des Grunddokuments).
- Tabelle: `Nr. | Bestimmung | Text (EN)` [mit Markierung der Änderungen gegenüber der Vorfassung: eingefügt unterstrichen, gestrichen durchgestrichen]
  `| Position CH (Entwurf) | Kommentar der Stelle | Textvorschlag der Stelle`. Die letzten zwei Spalten sind leer und zum Ausfüllen.
  Optional weitere Spalte mit den Texten anderer Spuren.
- Jede Zeile trägt die Zeilen-Id maschinenlesbar UND sichtbar (z. B. "Z-000120" klein unter der Nr.), zusätzlich Dossier-Id und Runden-Id im Dokument
  (benutzerdefinierte Eigenschaft und sichtbare Fusszeile), damit das Einlesen auch nach Umsortieren, Löschen von Zeilen oder Kopieren in ein anderes
  Dokument funktioniert.
- Einlesen muss tolerant sein: ausgefüllte Zellen, Word-Kommentare (`comments.xml`, der Zeile über den Anker zugeordnet), Änderungen mit Nachverfolgung
  im Text (als Textvorschlag der Stelle interpretieren), gelöschte/umsortierte Zeilen, zusätzliche Zeilen am Ende ("Allgemeine Bemerkungen"),
  in LibreOffice oder Word Online gespeicherte Dateien. Nicht Zuordenbares landet in `unmatched` und wird in der Oberfläche manuell zugeordnet.
- Roundtrip-Test: exportieren → programmatisch ausfüllen (auch via LibreOffice-Konvertierung, falls `soffice` vorhanden) → einlesen → identische Zuordnung.

### 5.3 Outputs

- Verhandlungsbriefing (.docx): je Zeile aktueller Text, CH-Position (Haltung, Priorität, Kernaussage, Textvorschlag, Rückfallposition), sortier- und filterbar
  (z. B. nur rote Linien, nur offene Zeilen). Vorangestellt eine Übersicht (Anzahl je Haltung/Priorität, wichtigste Punkte).
- Konsultationsbericht (.docx): je Rückmeldung der Entscheid mit Begründung (für die Rückmeldung an die Stellen).
- PDF: über Druckansichten der Oberfläche (durchsuchbarer Text). Die Kernbibliothek liefert dafür die aufbereiteten Datenstrukturen.

## 6 Oberfläche (Agent NEG-UI, startet NACH Abschluss der GUI-Korrekturen aus Etappe 1b)

Eigenes Modul "Verhandlung" in der Modul-Navigation neben "SGK". Nutzt i18n, Abstands- und Schaltflächensystem, Diff-, Chronologie-, Vergleichs- und
Export-Komponenten aus Etappe 1.

1. **Dossiers**: Liste, anlegen, Projektdatei importieren/exportieren, Beispiel-Dossier laden (klar als Beispiel gekennzeichnet).
2. **Synopse**: die bessere Vier-Spalten-Ansicht. Zeilen × Spuren, Spuren ein-/ausblendbar, Diff-Modus wählbar (gegen Kommissionsvorschlag, gegen Vorfassung
   derselben Spur, zwischen zwei Spuren), Statusfarben, Filter (geändert seit Fassung X, vorläufig vereinbart, offen, mit CH-Position, rote Linien, Stichwort),
   Navigation nach Erwägungsgründen/Artikeln, CH-Position als eigene Spalte ein-/ausblendbar.
3. **Zeile im Detail**: Chronologie je Spur, Vergleich, CH-Position bearbeiten (mit Verlauf), Kommentare der Stellen, Hinweis "Text seit Positionsbezug geändert".
4. **Import**: Datei ablegen → Erkennung → Spaltenzuordnung → Prüfmaske (neu/geändert/mehrdeutig) → übernehmen; danach "Was ist neu in dieser Fassung".
   Manuelles Erfassen und Korrigieren von Zeilen und Zellen als Rückfallweg.
5. **Position CH**: Tabelle/Board aller Positionen, Statistik, Massenbearbeitung, veraltete Positionen.
6. **Konsultation**: Runde anlegen (Umfang, Stellen, Frist, Sprache), Word-Dokument je Stelle oder neutral exportieren, Leseversion drucken (PDF),
   Rückmeldungen einlesen, aggregierte Sicht je Zeile (wer sagt was), Entscheid je Rückmeldung (annehmen, teilweise, ablehnen, zur Kenntnis; mit Antwort),
   angenommene Punkte in die CH-Position übernehmen, Fortschritt je Stelle.
7. **Ausgabe**: Verhandlungsbriefing und Konsultationsbericht als Word, Druckansicht/PDF, Karten-Export (PNG/PDF) einzelner Zeilen wie im SGK-Modul.
8. Verknüpfung zum SGK-Modul: Bei Zeilen mit `amends` Link "Im SGK öffnen" (aktueller Wortlaut der betroffenen Bestimmung).

## 7 Verzeichnisse

```
src/neg/            Kernbibliothek (Agent NEG-CORE)
scripts/neg/        Skripte: Dokumente laden, Beispiel-Dossier bauen, Validierung
raw-neg/            geladene öffentliche Dokumente (nur Daten; nicht im Git)
data/neg-demo.json  Beispiel-Dossier aus öffentlichen Dokumenten
data/NEG_NOTES.md   Bericht: Quellen, Trefferquoten, Grenzen
test/neg/           Tests
src/app/modules/neg/  Oberfläche (Agent NEG-UI, später)
```
