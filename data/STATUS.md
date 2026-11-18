# Status Agent DATEN

- vorläufig (2026-11-11, Schritt A): Snapshot-Stände s00, s01, s02, s07 (ohne ETIAS), s08. Überholt durch "final".
- final (2026-11-12, Schritte B und C): data/dataset.json mit 9 Ständen s00–s08 in DE/FR/EN (70 Einheiten, 311 Versionen, 1,55 MB), data/assets.json (63 Bilder, WebP, 2,47 MB), data/VALIDATION.md (Prüfbericht, erzeugt von scripts/validate.mjs).
  - Stände: s00 ABl. (oj), s01 20161006 (consolidated), s02 20170407 (consolidated), s03 nach 2017/2225 (reconstructed), s04 nach 2018/1240 (patched, ETIAS in der berichtigten Fassung R(03): Art. 8 Abs. 3 Bst. a Ziff. ii), s05 nach 2019/817 (reconstructed), s06 nach 2021/1134 (reconstructed), s07 20240710 + ETIAS (patched), s08 20251012 + ETIAS (patched, nur DE geändert: 32024R1717R(01)).
  - Hinweise für Agent UI (Erweiterungen gegenüber SPEC §5, alle optional):
    - Block `x`: "punct" = Schlusszeichen-Folgeanpassung (wegen eines vom Akt des Stands angefügten Punkts); "editorial" = Textunterschied ohne Änderungsakt (2 Fälle, s. VALIDATION.md Kap. 7). blockHistory/changesOfStage liefern dafür change "punct" bzw. "editorial".
    - Block `nt`: Hinweistext des Datensatzes (nur Anhang V Teil B, Block `ptB.c`, ETIAS-Punkt C zum Formularbild).
    - Block `o` kann eine Berichtigung sein: 32017R2225R(01), 32018R1240R(03), 32024R1717R(01) (alle in acts.json vorhanden).
    - `stages[].date` (Konsolidierungs- bzw. Veröffentlichungsdatum); top-level `patches` (ETIAS, von addSnapshot beim Upload neuer Fassungen automatisch angewendet).
    - addSnapshot(dataset, parsed, { actCelex, date, actOrder?, assets? }) einmal je Sprache aufrufen; `stage.langs` enthält danach nur Sprachen mit Änderungen.
  - Hinweis für Agent RECHT: Gliederungs-Id Kapitel V = `tit_II.cpt_V` (acts.json: `tit_II.cha_V`). Alle 104 übrigen `changes` stimmen mit den Daten überein.
  - Neu bauen: `node scripts/build-data.mjs` (ca. 20 s), prüfen: `node scripts/validate.mjs`, Tests: `node --test test/core/*.test.mjs`.
