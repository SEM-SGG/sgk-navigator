# STATUS Etappe 3 — Agent VERHANDLUNG

Stand: 12.11.2026, final.

## Fertig (committet)
- Vorschau `src/neg/preview.js`: `parseAmendingInstruction`, `buildPreview`, `annotateAmends`, `cellParagraphs` (Vorgängerstand geprüft,
  übernommen und korrigiert; Korrekturen in NEG_NOTES §9.2).
- `src/neg/pdf-text.js`: Durchstreichungen über volle Satzbreite und in Seitenfussnoten. `src/neg/paths.js`: Werk-Ids der Bibliothek.
- Pflichtprüfung `scripts/neg/eval-preview.mjs` + `scripts/neg/eval-preview-notes.json` → `scripts/neg/out/eval-preview.{txt,json}`:
  A (ST 6331/24 auf s06 gegen s07): 20/20 Einheiten, 79 von 219 Blöcken identisch, 148 Abweichungen eingeordnet (146 redaktionell, 2 Lücke, 0 Zuordnungsfehler).
- `data/neg-demo-dtc.json` (2024/0670(COD)); alle drei Beispiel-Dossiers neu gebaut (amends belegt, fiktive Delegationen/Sitzung/Interventionen),
  `node scripts/neg/check-demo.mjs`: 0 Verstösse.
- `src/neg/delegations.js` (Delegationen, Sitzungen, Haltungen, Interventionen, Ergebnis, stanceMatrix, suggestOutcome, balance),
  Varianten `balance`/`meeting` in `buildPositionDocx` (DE/FR), Begriffe in `i18n.js`, Validierung der neuen Felder, `by` im Verlauf.
- `src/neg/dossier-merge.js` (diffDossiers, mergeDossiers) mit Szenario-Tests.
- Tests: `test/neg/preview.test.mjs`, `delegations.test.mjs`, `dossier-merge.test.mjs`, `real.test.mjs` (drei Beispiele).
  `npm run test:neg` 50/50 grün; `node --test test/core/*.test.mjs` 51/51 grün.
- `data/NEG_STATUS.md`, `data/NEG_NOTES.md` (§9–§11) nachgeführt.

## Offen / Hinweise
- `suggestOutcome` ist eine Heuristik (vorläufig); Oberfläche muss Vorschläge als solche kennzeichnen.
- amends im Screening-Beispiel hängen von den beim Bau vorhandenen Werken in `data/works/` ab (Agent BIBLIOTHEK arbeitet parallel); nach Abschluss
  der Bibliothek `node scripts/neg/build-demo.mjs` erneut laufen lassen.

final
