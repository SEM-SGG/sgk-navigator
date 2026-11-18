# Status Etappe 3, Agent BEGRÜNDUNG

Stand: 2026-11-12, final

## Fertig
- Begründung (SPEC3 §3.4): data/rationale.json, scripts/rationale/*, test/core/rationale.test.mjs (Commit e63a857);
  data/RATIONALE_NOTES.md mit Zahlen je Akt, erneut ausgeführter Wortlautprüfung (375/375) und Stichprobe 15 direct-Zuordnungen (15 bestätigt, scripts/rationale/sample.mjs).
- Formulare als Text (SPEC3 §3.5): data/forms.json (69 Einträge, 63 Bilder, 399 Textblöcke), Lesung 2 (scripts/forms/pass2.json), Abgleich mit Lesung 1
  (scripts/forms/compare.mjs, decisions.json), Aufbau (build.mjs), Prüfung (verify.mjs), Tests test/core/rationale-forms.test.mjs, Bericht data/FORMS_NOTES.md.

## Tests
- node --test test/core/rationale.test.mjs (7/7), node --test test/core/rationale-forms.test.mjs (10/10), node --test test/core/*.test.mjs, npm run test:neg.

## Offen
- keine; Unsicherheiten in data/FORMS_NOTES.md («Was unsicher bleibt»).
