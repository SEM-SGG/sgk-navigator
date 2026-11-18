# STATUS UI-RECHTSAKTE (Etappe 3, Welle 2)

Stand: 2026-11-12, final.

## Fertig (committet, Branch ui-rechtsakte)
- A Werke: Modul «Rechtsakte», Werkleiste (Hash w), src/app/library.js (Werke gz64 eingebettet, bei Bedarf entpackt), Erwägungsgründe SGK (rct) eingehängt, «Fassung per Datum» für die weiteren Werke, Uploads und SPARQL je Werk, Info und Anleitung.
- B Verweise: Links im Text (intern, Bibliothek mit passendem Stand, extern EUR-Lex), Schalter «Verweise im Text», Bereich «Verweise», «mitbetroffen».
- C Begründung: aufklappbar je Schritt, Schalter «Begründung in Exportkarten» (Word, PDF, PNG).
- D Anwendbarkeit: composeAtDate, Kennzeichen am Block, gesammelte Hinweise, Übersicht (Tabelle, Zeitstrahl, Matrix), Chronologie.
- E Formulare: Bild | Text, sic, abgelöste Punkte, Formularvergleich, Suche.
- F Export: ExportMenu mit model; Word, Word mit Änderungsverfolgung, PDF mit Text (A4, 16:9), Zwischenablage; Sammelkorb Word/PDF mit Text.
- G Vorschau: Lesen, Vergleich (Basis/Vorschau, zwei Spuren), Chronologie, Deep Link pv/pv2.

## Tests
- npm run test:app: Einheitstests 11/11, Playwright 59/59 (davon 15 neu in test/app/e3.spec.mjs).
- node --test test/core/*.test.mjs 64/64, npm run test:neg 50/50.

## Offen
- siehe Abschlussbericht (bekannte Mängel).
