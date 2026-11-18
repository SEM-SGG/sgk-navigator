# NEG_STATUS — Stand der Kernbibliothek src/neg (für Agent NEG-UI)

Einstieg: `import * as neg from '../../neg/index.js'` (alle öffentlichen Funktionen). Injektion: `pdfjs` (PDF), `DOMParser` (nur EUR-Lex-HTML).
Alle Funktionen rein; Eingaben werden nicht verändert. Warnungen immer als `{ code, message, page?, … }`.

Stand: Etappe 3 (12.11.2026). Tests: `npm run test:neg` (50 Tests, alle grün). Etappe 3 ergänzt: Vorschau hängiger Vorschläge im SGK,
Delegationen/Sitzungen/Bilanz, Zusammenführen von Projektdateien, drittes Beispiel-Dossier (2024/0670), `rows[].amends` belegt (Abschnitte
«Etappe 3» unten). Bestehende Signaturen unverändert (nur Optionen ergänzt). Legende: **stabil** = Signatur fest, getestet; **vorläufig** = Signatur fest, Feinschliff offen.

## Import

| Funktion | Datei | Status | Rückgabe |
|---|---|---|---|
| `detectDocument({ name, bytes })` | detect.js | stabil | `{ type:"pdf"\|"docx"\|"html"\|"json"\|"unknown", guess:{ kind, ref, date, title, procedure, classification }, confidence, hints }`; `kind` u. a. `four-column`, `proposal`, `mandate`, `compromise`, `consultation-response`, `dossier` |
| `await parseFourColumnPdf(bytes, { pdfjs, onProgress?, pages? })` | pdf-fourcol.js | stabil | ParsedDoc (unten) + `footnotes:[{page,n,text,row,col}]` |
| `await parseTextPdf(bytes, { pdfjs, onProgress?, startAtAnnex?=true })` | pdf-text.js | vorläufig | ParsedDoc mit einer Spalte (Index 0) |
| `parseFourColumnDocx(bytes, { deleted?:"mark"\|"drop", inserted?:"plain"\|"mark" })` | docx-parse.js | vorläufig | ParsedDoc |
| `parseTextDocx(bytes, opts)` | docx-parse.js | vorläufig | ParsedDoc (eine Spalte) |
| `parseProposalHtml(html, { DOMParser })` | proposal-html.js | stabil | ParsedDoc (eine Spalte, Spur `com`) |
| `await setupPdfjs(pdfjs, { workerSource?, workerModule?, mode? })` | pdfjs-setup.js | stabil | `{ mode:"blob"\|"main", pdfjs }` (siehe Anleitung in NEG_NOTES.md §pdf.js) |

`onProgress({ phase:"read"|"analyze"|"rows"|"paragraphs", done, total })`.

ParsedDoc:
```js
{ meta: { kind, ref:"ST 14288/23", date:"2023-10-19", procedure:"2021/0428(COD)", title, classification:"public"|"limite"|…, layout:"tte"|"classic", pages, source:"pdf"|"docx"|"html" },
  columns: [ { index:0, header:"Commission Proposal", suggestedTrack:"com" }, … ],       // suggestedTrack: com|ep|council|agreement|null
  rows: [ { num:"34a"|null, label:"Recital 26a", labelSource:"table"|"derived"|"inherited", path:{kind:"recital",no:"26a"}, group:"recitals",
            amends:{work:"sgk",unit:"art_13",key:"p1"}|null, status:"agreed"|…|null, pages:[40,41],
            cells: { 0:{ html:"(26a) <b><i><u>It should…</u></i></b>", text:"(26a) It should…", status:null, empty:false, notes?:["Text Origin: EP Mandate"], tags?:["Integration with IT systems"] }, … } } ],
  warnings: [ { code:"strike-detected", message:"…" } ], stats: { pages, rows, cells, … } }
```
`labelSource`: `table` = Fundstellen-Zwischenzeile der Quelle; `derived` = aus dem Text abgeleitet (bitte als «abgeleitet» kennzeichnen); `inherited` = Zeile ohne eigene Fundstelle (übernimmt die vorherige).

## Zusammenführen

| Funktion | Status | Rückgabe |
|---|---|---|
| `planMerge(dossier, parsed, mapping, { docMeta? })` | stabil | `{ doc, mapping, rows:[PlanRow], missing:[rowId], stats:{rows,matched,new,ambiguous,missing,cells:{changed:n,…}}, warnings }` |
| `applyMerge(dossier, plan, { rows?:{ <idx>:{ rowId?:id\|"new", skip? } }, doc?:{…}, ambiguous?:"skip"\|"new", unmatched?:"new"\|"skip", now? })` | stabil | `{ dossier, docId, rowIds:{<idx>:rowId}, skipped:{ambiguous,new,manual}, warnings }`; `doc.skipped` im Dokument |

`mapping = { 0:"com", 1:"ep", 2:"council", 3:"agreement", 4:null }`. PlanRow: `{ idx, num, label, path, labelSource, amends, match:"matched"|"new"|"ambiguous", rowId, score (0..1), reason:"num+label"|"Text 87 %, Reihenfolge"…, candidates:[{rowId,score,reason}], after, cells:{ <track>:{ change:"unchanged"|"changed"|"new"|"removed"|"empty"|"status", html, text, status, prev:{doc,html,text,status}|null } } }`.
**Mehrdeutige Zeilen ohne Entscheid werden übersprungen** (Standard `ambiguous:"skip"`, gezählt in `skipped.ambiguous`, Warnung `ambiguous-skipped`);
mit `ambiguous:"new"` als neue Zeile (Warnung `ambiguous-as-new`). `unmatched:"skip"` legt keine neuen Zeilen an (nur Zuordnung in bestehendes Raster).
Die Prüfmaske sollte für jede mehrdeutige Zeile einen Entscheid (`rows[idx].rowId` oder `"new"`) liefern.

## Auswerten

| Funktion | Status | Rückgabe |
|---|---|---|
| `rowHistory(dossier, rowId, trackId)` | stabil | `[{ doc, ref, date, kind, html, text, status, empty, change:"new"\|"changed"\|"unchanged"\|"status"\|"removed"\|"empty" }]` |
| `changesBetween(dossier, docA\|null, docB, trackId, { clean? })` | stabil | `[{ row, num, label, change:"changed"\|"new"\|"removed"\|"status", a, b, diff? }]` (docA null = jeweils letzte frühere Fassung der Spur) |
| `stalePositions(dossier)` | stabil | `[rowId]` |
| `rowStatus(dossier, rowId)` | stabil | `"agreed"\|"provisional"\|"open"\|null` |
| `compareCells(a, b, { clean? })` | stabil | `{ changed, oldHtml, newHtml, redline, ins, del, segments:[{op:"eq"\|"ins"\|"del", html}] }` (Markierung `<ins>`/`<del>`; gleiche Semantik wie diffText im SGK-Modul; `clean` entfernt `<s>`-Text der Quelle) |

## Modell, Positionen, Konsultation, Ausgaben

| Funktion | Status |
|---|---|
| `createDossier({ id?, title, short?, procedure?, tracks? })`, `exportDossier(d, { compact? }) -> string`, `importDossier(json\|obj\|bytes) -> { dossier\|null, errors, warnings, migrated }`, `validateDossier(d)` | stabil |
| `docsByDate`, `sortedRows`, `cellsOf(d,rowId,track)`, `latestCell(d,rowId,track,{upToDoc?})` | stabil |
| `setPosition(d, rowId, patch, { source?, at? }) -> d` (Verlauf in `history`) | stabil |
| `addConsultation(d, { id?, title, deadline, lang, basis:{track,doc,compareTo?}, scope:[rowId], offices:[{id,abbr,name}] }) -> { dossier, id }` | stabil |
| `setDecision(d, kId, itemId, { decision, reply, applied }) -> d` | stabil |
| `consultationRows(d, kId, { otherTracks? })` (Daten für Druck-/Leseversion) | stabil |
| `buildConsultationDocx(d, kId, { office?, lang?, otherTracks? }) -> Uint8Array` | stabil |
| `parseConsultationDocx(bytes) -> { consultationId, dossierId, office, items:[{rowId,comment,proposal,proposalHtml?,source,author?}], general, unmatched:[{text,…}], warnings }` | stabil |
| `importResponse(d, kId, parsed, { office?, file?, now? }) -> { dossier, responseId, warnings }` | stabil |
| `aggregateConsultation(d, kId) -> { consultation, rows:[{rowId,num,label,items:[{responseId,itemId,office,comment,proposal,source,decision,reply,applied}],counts,position}], offices:[{id,abbr,name,responded,items,decided}], stats, general, unmatched }` | stabil |
| `buildPositionDocx(d, { variant:"briefing"\|"full"\|"consultation-report", lang?, rows?, filter?:{stance?,priority?,onlyOpen?,stale?,withPosition?,group?}, sort?, consultationId? }) -> Uint8Array` | stabil |
| `positionRows(d, opts)`, `positionStats(rows)` (Daten für Druckansicht) | stabil |

## Abweichungen und Ergänzungen zum Schema §4

- Dossier: zusätzliche Felder `demo` (Beispiel), `note`, `workRef:{act,work}`, `buildLog` (nur Beispiel). Werden von `validateDossier` toleriert.
- Zeile: zusätzlich `numHistory:[{doc,num}]` (frühere Zeilennummer bei Neunummerierung im TTE), `path.target:{act,art,par?,pt?,annex?}` bei Änderungsrechtsakten.
- Zelle: zusätzlich `clean` (Text ohne gestrichene Teile, nur wenn `<s>` vorkommt), `notes`, `tags`. Leere Zelle ohne `html`/`text`.
- Zeile: zusätzlich `sourceLabel` (Fundstelle der Quelle, wenn sie wegen Mehrfachvorkommen um `[Nr.]` ergänzt wurde).
- Dokument: zusätzlich `skipped:{ambiguous,new,manual}`.
- Parser: Zeilen der Quelle ganz ohne Text werden nicht ausgegeben (Warnung `empty-row`). Inline-HTML wie Schema (b i u s sup sub br).
- Dokument: zusätzlich `source` (URL) im Beispiel.
- Konsultation: zusätzlich `exports:[]`, `fictitious` (Beispiel); Rückmeldung-Item optional `proposalHtml`, `author`.
- Zeilen-Ids: `r` + 6 Ziffern (z. B. `r001450`), nicht fortlaufend; `order` in Zehnerschritten, wird bei Einfügungen neu vergeben (Ids bleiben).

## Etappe 3: Vorschau hängiger Vorschläge im SGK (preview.js, SPEC3 §3.6)

| Funktion | Status | Rückgabe |
|---|---|---|
| `parseAmendingInstruction(text)` | stabil | `{ action:"replace"\|"insert"\|"add"\|"delete"\|"amend-intro"\|"rename"\|"renumber"\|"substitute"\|"none", target:{ act?, art?, annex?, part?, par?, parOrd?, sub?, pt?:[…], indent?, intro?, title?, what:"article"\|"annex"\|"paragraph"\|"subparagraph"\|"point"\|"indent"\|"title"\|"intro"\|"act"…, num?, list?, range?, isNew? }, container, position?:"after"\|"before", anchor?, cmd?:{label,kind}, inline?, words?, strong }` |
| `buildPreview(dossier, { track, doc? }, dataset, { lang?:"en", baseStage?, act?:"2016/399" })` | stabil | siehe unten; wirft nur bei fehlender Spur oder unbekanntem Stand |
| `annotateAmends(dossier, dataset\|null, { work?:"sgk", act?, baseStage?, tracks?, works?:[{work,act,dataset,baseStage?}] })` | stabil | `{ dossier, stats:{ preview, dropped, rows, byWork } }` |
| `cellParagraphs(html)` | stabil | `[{ html, plain, refs, fnText?, labelOnly? }]` (Absätze ohne gestrichenen Text; intern, für Prüfungen exportiert) |

```js
buildPreview(d, { track: "council", doc: "doc2" }, dataset, { lang: "en" }) ->
{ base: "s08", track: "council", doc: "doc2",
  units: { "art_8": { baseVersion: <Version des Datensatzes im Stand base | null bei neuer Einheit>,
                      previewVersion: { stage: "preview:d-2024-0670:council", label, title, blocks: [ { k, d, l, t, o, fn?, ty?, row? } ], repealed?, preview: { dossier, track, doc, base } },
                      changes: [ { key: "p2g"|null, action: "insert"|"replace"|"delete", row: "r003020", rows: [...], confidence: "high"|"medium" } ] } },
  unresolved: [ { row, rows, label, reason: "art_8: Block p1 besteht im Stand s08 bereits (einfügen)", text } ],
  roles: { <rowId>: { role: "instruction"|"wording"|"frame"|"other-act", unit?, key?, act?, unresolved? } },
  stats: { rows, paragraphs, instructions, applied, unresolved, wording, frame, otherAct } }
```
- `doc` angegeben: nur Zellen dieses Dokuments; sonst je Zeile die jüngste Zelle der Spur. Basis: `baseStage` oder jüngster Stand.
- Geänderte Blöcke: `o: "preview:<dossierId>:<track>"`, zusätzlich `row` (Zeile der Quelle); unveränderte Blöcke behalten `o` des Datensatzes.
  Damit funktionieren Diff/Vergleich der Oberfläche: `baseVersion` gegen `previewVersion` (gleiche Schlüssel = gleiche Bestimmung).
  Neue Einheit (neuer Artikel): `baseVersion: null`. Aufgehobene Einheit: `previewVersion.repealed: true`, `blocks: []`.
- Nur Englisch. Nur sicher Auflösbares wird angewandt; alles andere steht in `unresolved` mit Grund (DE) und Text (Anfang).
  Anweisungen an andere Rechtsakte (z. B. VO 2252/2004, 2018/1726) zählen in `stats.otherAct` und werden nicht angewandt.
- Datensatz wird nicht verändert; zusätzliche Einheiten (z. B. `rct`) stören nicht.
- `amends`-Einträge: `{ work:"sgk"|"ees"|"etias"|"vis"|"iop", unit, key?, source:"preview" }`. Nur aus der Vorschau belegte Einträge;
  frühere Näherungen aus der Fundstelle werden verworfen. Werk-Ids des Parsers (paths.js `workOf`) folgen jetzt der Bibliothek
  (`2017/2226`→`ees`, `2018/1240`→`etias`, `767/2008`→`vis`, `2019/817`→`iop`).
- Leistung (Node): ganzes Dossier je Spur 5–130 ms.

## Etappe 3: Delegationen, Sitzungen, Bilanz (delegations.js, SPEC3 §3.7)

Schema-Ergänzungen (optional; ohne diese Felder bleibt jede Projektdatei gültig, `validateDossier` prüft sie, wenn vorhanden):
```jsonc
"delegations": [ { "id": "de", "kind": "ms"|"institution"|"other", "code": "DE", "name": {"de","fr","en"}, "abbr"?: {"de":"KOM",…}, "schengen"?: true, "associated"?: true, "fictitious"?: true } ],
"meetings": [ { "id": "m1", "date": "2026-03-12", "body": "…", "title": "…", "docs": ["doc3"], "note": "", "fictitious"?: true } ],
"stances": { "<rowId>": [ { "id": "h1", "deleg": "de", "stance": "support|oppose|reservation|scrutiny|proposal|neutral", "text": "", "meeting": "m1"|null, "at": "…", "by"?: "NB" } ] },
"interventions": [ { "id": "i1", "meeting": "m1"|null, "row": "<rowId>"|null, "text": "", "result": "taken-up|partly|rejected|open", "note": "", "at": "…", "by"?: "NB" } ],
"positions": { "<rowId>": { …, "outcome": { "status": "achieved|partly|not|open|obsolete", "note": "", "doc": "doc4"|null, "at": "…", "by"? } } }
```
Ids: Haltungen `h<n>` dossierweit eindeutig, Sitzungen `m<n>`, Interventionen `i<n>`, Delegationen = Kürzel klein (`de`, `ch`, `com`, `ep`, `pres`, `cls`).
Verlaufseinträge (`positions[].history[]`, `decisions[]`, Haltungen, Interventionen, Ergebnis) tragen optional `by` (Kürzel der bearbeitenden Person):
`setPosition(d, rowId, patch, { source?, at?, by? })`, `setDecision(d, kId, itemId, { decision, reply, applied, at?, by? })`.

| Funktion | Status | Rückgabe |
|---|---|---|
| `defaultDelegations()` | stabil | 25 EU-Schengen-Staaten (Ratskürzel, `EL` = Griechenland) + CH, IS, LI, NO + `com`, `ep`, `pres` (Vorsitz), `cls` (JD Rat); CY, IE nicht enthalten |
| `ensureDelegations(d)` | stabil | d mit Voreinstellung, falls `delegations` fehlt |
| `addDelegation(d, { id?, kind, code, name, abbr? })` / `updateDelegation(d, id, patch)` / `removeDelegation(d, id)` | stabil | `{dossier, id}` / d / d (entfernt auch deren Haltungen) |
| `addMeeting(d, { id?, date, body, title, docs?, note? })` / `updateMeeting` / `removeMeeting(d, id)` | stabil | `{dossier, id}` / d / d (Haltungen und Interventionen bleiben, `meeting:null`) |
| `meetingsByDate(d)` | stabil | Sitzungen nach Datum |
| `setStance(d, rowId, { id?, deleg, stance, text?, meeting?, at?, by? })` / `removeStance(d, rowId, id)` | stabil | `{dossier, id}` (mit id: ändern) / d |
| `addIntervention(d, { id?, meeting, row?, text, result?, note?, at?, by? })` / `updateIntervention(d, id, patch, {at?, by?})` / `removeIntervention(d, id)` | stabil | `{dossier, id}` / d / d |
| `setOutcome(d, rowId, { status, note?, doc?, at?, by? })` | stabil | d (Ergebnis in `positions[rowId].outcome`, Verlaufseintrag `source:"outcome"`); wirft ohne Position |
| `stanceMatrix(d, { rows?, meeting? })` | stabil | `{ delegations:[{id,code,name,kind,abbr?}], rows:[{ rowId, num, label, cells:{ <deleg>:{ id, stance, text, meeting, at, by?, earlier:[…] } } }], counts:{ byStance, byDelegation } }` (jüngste Haltung je Delegation; Reihenfolge Sitzungsdatum, dann `at`) |
| `suggestOutcome(d, rowId)` | vorläufig | `{ status, confidence:"medium"\|"low", reason:{de,fr}, basis, compared:{track,doc}\|null, measure:{…} }` — nur Vorschlag |
| `balance(d, { suggest?:true })` | stabil | `{ total, byOutcome:{achieved,partly,not,open,obsolete,unset}, byPriority:{<prio>:{…}}, achievedShare, rows:[{ rowId, num, label, stance, priority, text, proposal, outcome, suggestion, interventions }], interventions:{ total, byResult, byMeeting, withoutRow }, meetings:[…], lastDoc }` |
| `buildPositionDocx(d, { variant:"balance"\|"meeting", lang:"de"\|"fr", meetingId?, asOf?, zipTime? })` | stabil | Bilanz (A4 quer) bzw. Sitzungsbericht (A4 hoch; Standard: jüngste Sitzung) |

`suggestOutcome`: vergleicht mit der jüngsten nicht leeren Zelle der Spur `agreement` (leere Kompromisszelle = noch kein Kompromiss).
Mit Textvorschlag: Wörter, die der Vorschlag gegenüber dem Bezugstext (`position.basis`) einfügt bzw. streicht, und Anteil davon, der im
Kompromiss umgesetzt ist (≥ 0,8 `achieved`, ≥ 0,35 `partly`, sonst `not`); ohne Bezugstext Ähnlichkeit. Ohne Textvorschlag: Unterstützung →
unverändert `achieved`, gestrichen `not`, geändert `partly` (prüfen); Ablehnung/Vorbehalt → gestrichen `achieved`, unverändert `not`;
Prüfvorbehalt u. a. → `open`. Die Oberfläche muss Vorschläge als solche kennzeichnen («Vorschlag (nicht bestätigt)», i18n `suggestion`).
`achievedShare` = (erreicht + ½ teilweise) / (beurteilt ohne offen/gegenstandslos).

Begriffe (i18n.js, DE/FR): `delegation(s)`, `meeting(s)`, `body`, `date`, `docs`, `note`, `delegKind`, `delegStance`, `stancesL`, `stanceText`, `noStances`,
`interventions`, `intervention`, `result`, `interventionResult`, `noInterventions`, `outcomeL`, `outcome` (inkl. `unset`), `suggestion`, `suggestionHint`,
`balanceTitle`, `meetingReport`, `byOutcome`, `achievedShare`, `concerns`, `withoutRow`, `inMeeting`, `referenceDoc`, `fictitiousDeleg`.

## Etappe 3: Projektdateien vergleichen und zusammenführen (dossier-merge.js, SPEC3 §3.8)

| Funktion | Status | Rückgabe |
|---|---|---|
| `diffDossiers(a, b)` | stabil | `{ same, entries:[{ path, kind:"added"\|"removed"\|"changed", a, b, fields? }] }` |
| `mergeDossiers(mine, theirs, { base?, resolutions?, now? })` | stabil | `{ merged, conflicts:[{ id, path, label, mine, theirs, base?, kind:"both-changed"\|"delete-modify" }], applied:{ fromMine, fromTheirs, identical, combined }, removed:[{path, by}], mapping:{ docs, rows, consultations, offices, responses, items, meetings, interventions, stances }, warnings }` |

Pfade (= Konflikt-Ids): `meta/<feld>`, `tracks/<id>`, `documents/<id>`, `rows/<id>`, `cells/<rowId>/<spur>/<docId>`, `positions/<rowId>` bzw.
`positions/<rowId>/<feld>` (Positionen werden feldweise zusammengeführt), `stances/<rowId>/<id>`, `delegations/<id>`, `meetings/<id>`,
`interventions/<id>`, `consultations/<id>`, `consultations/<id>/offices|responses|decisions/<id>`, `consultations/<id>/scope`.
Nicht als Inhalt verglichen: `updated` des Dossiers (Ergebnis: jüngeres), `importedAt` von Dokumenten und Rückmeldungen (Ergebnis: früheres),
`order` der Zeilen (Reihenfolge: die von mine, neue Zeilen von theirs nach ihrem Vorgänger; nur dann neu nummeriert).
`resolutions: { <conflictId>: "mine" | "theirs" | { value } }`; ohne Entscheid steht im Ergebnis der Wert von mine (Konflikt bleibt gemeldet).
Ids in `conflicts` und `merged` sind die von mine; Elemente von theirs mit kollidierender Id (anderer Gegenstand) erhalten neue Ids (`mapping`).
Ablauf in der Oberfläche: Datei wählen → `mergeDossiers(aktuell, Datei, { base? })` → Konflikte anzeigen (mine/theirs/base) → mit `resolutions` erneut aufrufen → übernehmen.
Wird die verteilte Stammdatei als `base` mitgegeben, werden einseitige Änderungen und Löschungen sicher erkannt; ohne `base` bleiben gelöschte Elemente erhalten
und Unterschiede ohne Verlauf sind Konflikte.

## Beispieldateien (immer über `importDossier` laden)

Gespeichert in der verlustfreien Kurzform `cellFormat:"compact-1"` (`exportDossier(d,{compact:true})`): unveränderte Folgezelle einer Spur =
`{doc, same:1}`, `text` fehlt wenn = `htmlToText(html)`, kein `clean`, leere Zelle `{doc, empty:true}`. **`importDossier` stellt das volle Schema
wieder her**; das Roh-JSON nicht direkt verwenden. Leere Zellen haben im vollen Schema `{doc, empty:true, status:null}` (ohne html/text).
Fundstellen, die in einem Dokument mehrfach vorkommen, tragen die Tabellennummer als Zusatz (`"Article 4 [118]"`; Fundstelle der Quelle in `sourceLabel`).
Reihenfolge der Dokumente im Array ist die Importreihenfolge; zeitlich sortieren mit `docsByDate`.

- `data/neg-demo.json` (SGK-Revision, 707 KB): 327 Zeilen = Raster der Vier-Spalten-Tabelle ST 14288/23 (doc3); dazu nur eindeutig zugeordnete
  Absätze aus doc1 COM(2021) 891 (281 von 316), doc2 ST 10426/22 (272 von 345), doc4 ST 6331/24 (270 von 330); übersprungen in `note` und `buildLog`.
- `data/neg-demo-screening.json` (Screening 2020/0278(COD), 812 KB): 339 Zeilen, fünf Vier-Spalten-Fassungen doc1 ST 8413/23 → doc2 ST 10863/23 →
  doc3 WK 13716/23 → doc4 WK 16364/23 → doc5 WK 16999/23.
- `data/neg-demo-dtc.json` (EU Digital Travel application 2024/0670(COD), 554 KB): 402 Zeilen = Raster der Drei-Spalten-Tabelle WK 3948/26 (doc3,
  Spuren com/ep/council); doc1 COM(2024) 670 (206 von 227 Absätzen), doc2 Ratsmandat ST 15634/25 (320 von 328), doc4 WK 4049/26 (Art. 3a–3d, 46 von 46).
- Alle drei: `demo:true`, fiktive Positionen (Text «Beispieltext (fiktiv) …»), Runde `k1` (`fictitious:true`) mit «Stelle A (Beispiel)», «Stelle B (Beispiel)»;
  Etappe 3: Delegationen (Voreinstellung + `bsp-a`, `bsp-b`, `bsp-c` «Delegation A/B/C (Beispiel)», `fictitious:true`), Sitzung `m1` «Beispielsitzung (fiktiv)»,
  6 Haltungen (nur der fiktiven Delegationen), 3 Interventionen «Beispielintervention (fiktiv) …» (eine ohne Zeilenbezug), 1 fiktives Ergebnis (`partly`).
  `rows[].amends` belegt aus der Vorschau: SGK-Revision 219 Zeilen (Stand s06), DTC 40 (geltender SGK), Screening 12 (ees 2, etias 4, iop 6; Werke der Bibliothek, soweit beim Bau vorhanden).
- Prüfung: `node scripts/neg/check-demo.mjs` (alle drei Dateien: 0 Verstösse), auch im Test.
- Geprüft mit `scripts/neg/check-demo.mjs` (auch im Test): keine Zeile ohne Text, keine zwei Zeilen mit gleicher Fundstelle und gleichem Text in
  derselben Spur, Reihenfolge = Rasterfassung.

## Hinweise für die Oberfläche
- Etappe 3, Vorschau: SGK-Seite zeigt je Spur (und optional Dokument) `previewVersion` mit den Diff-Komponenten gegen `baseVersion`;
  `unresolved` gut sichtbar auflisten («nicht angewandt»); Kennzeichnung «Vorschau, nicht amtlich» und Spur/Dokument/Stand (`previewVersion.preview`).
  Blöcke mit `o` beginnend «preview:» sind geändert. Neue Einheiten (`baseVersion:null`) haben keinen Eintrag im toc des Datensatzes.
- Etappe 3, Bilanz: Vorschläge (`suggestion`) nie als Ergebnis darstellen, sondern mit «Vorschlag (nicht bestätigt)» und Begründung; Bestätigen = `setOutcome`.
- Etappe 3, Zusammenführen: Konfliktliste mit `label`, `mine`, `theirs` (und `base`), Auswahl je Konflikt; Kürzel für `by` einmal abfragen und bei allen
  ändernden Aufrufen mitgeben.

- pdf.js: `setupPdfjs` einmal beim ersten PDF-Import aufrufen; Build-Muster (Worker als IIFE-Text) in `test/neg/browser/build.mjs` und NEG_NOTES §5.
  Nicht `type:"module"`-Worker verwenden (Chrome unter file:// lehnt ab).
- Prüfmaske: `plan.rows` mit `match` ≠ "matched" zeigen (Kandidaten mit `score`/`reason`), ausserdem `labelSource:"derived"` kennzeichnen,
  `plan.missing` (Zeilen, die in der neuen Fassung fehlen) anzeigen, `plan.doc.warnings` oben ausgeben.
- Typische Warnungscodes: `strike-detected`, `colors-not-read`, `no-table`, `no-header`, `row-without-number`, `column-unknown`, `footnote-unattached`,
  `tracked-changes`, `colored-text`, `auto-numbering`, `ambiguous-as-new`, `round-mismatch`, `dossier-mismatch`, `office-added`, `roles-guessed`.
- Status `agreed|provisional|open` je Zelle (Farbe) und je Zeile (`rowStatus`).
- Leseversion (PDF) der Konsultation: Daten aus `consultationRows`; Briefing-Druck aus `positionRows`/`positionStats`.

## Fehlt oder nur teilweise

- Vier-Spalten-PDF ohne Tabellenlinien (Rückfall auf Abstände) nicht umgesetzt.
- Fortlaufende Texte: Zeilenabgleich ohne Nummern nur über Text (im Beispiel 79–86 % eindeutig zugeordnet); Rest über Prüfmaske.
- DOCX-Parser nur an selbst erzeugten und LibreOffice-Dateien geprüft; Word/Word Online nicht verfügbar.
- Firefox/Safari/Edge für pdf.js nicht geprüft (nur Chrome).

final
