# Status Etappe 3 — BIBLIOTHEK

Stand: 2026-11-12.

## Fertig
- Vier Werke gebaut: data/works/{ees,etias,vis,iop}.dataset.json und .acts.json, data/works/index.json (`node scripts/build-work.mjs all`).
- Parser-Erweiterungen in src/core/parser.js (SGK-Datensatz bleibt byte-identisch, geprüft): ABl.-Kopf 2008 FR, Zitatbereiche mit
  Abschluss vor der nächsten Änderungsanweisung, Gliederungszeichen in Zitaten immer abgetrennt, «22 bis)», Inline-Streichungen «►M ————— ◄»,
  Titel mit Inline-Marker, Fussnotenverweise ohne Fussnotentext, recitalsSourceText korrigiert.
- src/core/library.js (listWorks, resolveCelex, stageAt, actsOfStage).
- Erwägungsgründe: Einheit rct in allen vier Werken; SGK als separate Datei data/works/sgk.recitals.json (Entscheid, Begründung in
  data/VALIDATION_WORKS.md Abschnitt 8), data/dataset.json unverändert.
- Validierung: scripts/validate-works.mjs -> data/VALIDATION_WORKS.md (Abdeckung 100 % je Fassung und Sprache, Datensatz 100 %,
  Erwägungsgründe 100 %; unerklärte Änderungen nur geprüfte Quellfehler).
- Hinweise des Orchestrators bearbeitet: fehlende VIS-Artikel (nicht konsolidiert, Art. 12 VO 2021/1134, Art. 8 VO 2023/2667),
  Schlüssel «~» (0 verbleibend), Angleichung nach Sprachmehrheit.
- Tests: test/core/library.test.mjs, test/core/parser-works.test.mjs.

## Nächste Schritte (ausserhalb BIBLIOTHEK)
- model.js: Einheiten type "recitals" bei addSnapshot nicht als aufgehoben kennzeichnen (Voraussetzung, um rct in dataset.json zu führen).

final
