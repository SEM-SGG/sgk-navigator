# Status Etappe 3 – Agent VERWEISE

Stand: 2026-11-12 – **final**

## Fertig
- `src/core/refs.js`: Verweisnetz DE/FR/EN (extractRefs, buildRefIndex, linkifyHtml, plainText, unlinkHtml, refId, celexOf, amendedActOf). Sprachabgleich s08 762/765 (99,6 %), 0 tote Ziele in allen Ständen, 60/60 Handprüfungen richtig. Bericht `data/REFS_NOTES.md`.
- `src/core/model.js`: `composeAt` nimmt zusätzlich ein Prädikat `(celex, block, unitId)` an; bisherige Aufrufe unverändert (blockweise gegen aktweise: 3780 Fälle gleich).
- `src/core/applicability.js`: changeApplicability, composeAtDate, actApplicableAt, derogationsAt, findChange, applicabilityPredicate.
- `data/derogations.json` (VO (EU) 2025/1534, 12.10.2025–9.4.2026, 33 Wirkungen), `data/acts.json` nachgeführt, Bericht `data/APPLICABILITY_NOTES.md`.
- Tests: `test/core/refs.test.mjs` (11), `test/core/applicability.test.mjs` (11); `node --test test/core/*.test.mjs` 51/51, `npm run test:neg` grün.

## Offen
- Siehe APPLICABILITY_NOTES §7 (Tageszählung, Art. 7 Abs. 4 VO 2025/1534, Ende Art. 12a Abs. 1, Zypern).
- Weitere Werke: Abweichungen im Sprachabgleich (94,9–96,6 %) nicht einzeln geklärt; VIS-Datensatz mit fehlenden Einheiten (REFS_NOTES §6).
