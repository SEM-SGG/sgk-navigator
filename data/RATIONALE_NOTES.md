# Begründung: Erwägungsgründe der Änderungsakte (data/rationale.json)

Agent BEGRÜNDUNG, Etappe 3, Erweiterung 4. Stand 2026-11-12. Die Zuordnung ist redaktionell, nicht amtlich.

## Methode

1. **Wortlaut.** `scripts/rationale/extract.mjs` liest die Erwägungsgründe (`rct_N`) aus der ABl.-Fassung `raw/<CELEX>_<LANG>.html` je Sprache DE, FR, EN.
   Regeln wie im Datensatz (SPEC §5.2): erlaubte Tags `<i> <b> <sup> <sub> <br>`, Fussnotenverweise nicht im Text, sondern in `fn`; mehrere Absätze
   bzw. Listenpunkte eines Erwägungsgrunds durch `<br>` getrennt. Rechtstext unverändert (auch «ß»).
2. **Auswahl.** 2017/458, 2017/2225 und 2024/1717 ändern nur den SGK: alle Erwägungsgründe aufgenommen (`selection: "all"`).
   2016/1624, 2018/1240, 2019/817 und 2021/1134 haben einen anderen Hauptgegenstand: nur Erwägungsgründe mit Bezug zur SGK-Änderung (`selection: "sbc-related"`).
3. **Zuordnung in zwei unabhängigen Durchgängen.**
   - Durchgang 1 (`scripts/rationale/pass1.json`): von jedem Erwägungsgrund zu den geänderten Bestimmungen.
   - Durchgang 2 (`scripts/rationale/pass2.json`): von jeder laut `data/acts.json` geänderten Bestimmung zu den Erwägungsgründen
     (Arbeitshilfe `retrieve.mjs`: Wortüberschneidung als Lesehilfe, Entscheid von Hand). Jede geänderte Einheit hat einen Eintrag; leere Liste = geprüft, kein passender Erwägungsgrund.
   - Abgleich `scripts/rationale/compare.mjs` → `scripts/rationale/work/compare.json`: 145 Paare (Einheit/Schlüssel/Erwägungsgrund) übereinstimmend,
     0 mit abweichender Stärke, 5 nur in Durchgang 1, 9 nur in Durchgang 2. Alle 14 Abweichungen einzeln entschieden in `scripts/rationale/decisions.json`
     (10 übernommen, 4 verworfen; Begründung je Eintrag). `build.mjs` bricht ab, wenn eine Abweichung ohne Entscheid bleibt.
4. **Stärke.** `direct`: der Erwägungsgrund behandelt erkennbar genau diese Änderung (nennt die Bestimmung oder ihren Regelungsgegenstand).
   `thematic`: allgemeiner Zusammenhang. Im Zweifel `thematic` oder keine Zuordnung.
5. **Maschinelle Prüfung** `scripts/rationale/verify.mjs` (unabhängig vom Extraktor, Regex direkt auf dem Roh-HTML) und `test/core/rationale.test.mjs`.

## Zahlen je Akt

| Akt | Erwägungsgründe (Akt) | aufgenommen | davon zugeordnet | Zuordnungen (direct / thematic) | Paare Zuordnung×EG (davon direct) | geänderte Einheiten | Einheiten ohne Zuordnung | Änderungen (acts.json) ohne Zuordnung |
|---|---|---|---|---|---|---|---|---|
| (EU) 2016/1624 | 72 | 1 | 1 | 1 (1 / 0) | 1 (1) | 1 | – | 0 von 1 |
| (EU) 2017/458 | 26 | 26 | 13 | 16 (10 / 6) | 24 (13) | 1 | – | 0 von 16 |
| (EU) 2017/2225 | 22 | 22 | 11 | 38 (15 / 23) | 44 (18) | 20 | art_20, anx_VII | 11 von 46 |
| (EU) 2018/1240 | 77 | 5 | 4 | 8 (4 / 4) | 9 (4) | 3 | – | 0 von 6 |
| (EU) 2019/817 | 84 | 5 | 3 | 2 (1 / 1) | 3 (1) | 1 | – | 0 von 1 |
| (EU) 2021/1134 | 67 | 4 | 3 | 2 (0 / 2) | 3 (0) | 2 | – | 4 von 6 |
| (EU) 2024/1717 | 62 | 62 | 47 | 47 (28 / 19) | 71 (45) | 21 | – | 0 von 26 |
| **Total** | 410 | 125 | 82 | 114 (59 / 55) | 155 (82) | 49 | 2 | 15 von 102 |

Änderungen ohne passenden Erwägungsgrund (geprüft, bewusst leer):
- 2017/2225: Art. 2 Nr. 26 (eingefügt), Art. 8 Abs. 2 Bst. a Unterabs. 2, Abs. 3 Bst. a Ziff. i Unterabs. 2 und 3, Abs. 3 Bst. g Ziff. i, Art. 9 Abs. 3a,
  Art. 14 Abs. 3 Unterabs. 3, Art. 20 Abs. 1 Bst. a, Anhang IV Nr. 1a, Anhang V Teil A Nr. 1 Unterabs. 2, Anhang VII Nr. 1.
  Die Erwägungsgründe von 2017/2225 behandeln das EES allgemein; Folgeänderungen (Verweise, Begriffe, Stempelgestaltung) nennt keiner.
- 2021/1134: Streichung von Art. 8 Abs. 3 Bst. c bis f (Visumkontrollen, in die VIS-Verordnung überführt). Kein Erwägungsgrund nennt die Streichung im SGK ausdrücklich.
- Nur über eine Zuordnung zur ganzen Einheit erfasst (ohne eigenen Schlüssel): 2017/458 Art. 8 Abs. 2c und Abs. 3 Bst. a Ziff. ii.

## Ergebnis der Wortlautprüfung (ausgeführt 2026-11-12, Wiederaufnahme)

`node scripts/rationale/verify.mjs`:
- Wortlaut: 375 von 375 Texten (125 Erwägungsgründe × 3 Sprachen) gleich der Quelle; 312 davon ohne jede Leerzeichen-Angleichung gleich,
  63 nach Angleichung von Leerzeichen vor Satzzeichen (Artefakt der Regex-Gegenextraktion an entfernten Fussnotenankern, nicht des Datensatzes).
- Nummern: 0 Probleme (Gesamtzahl der Erwägungsgründe je Akt in DE, FR, EN gleich und gleich `total`; jede aufgenommene Nummer in allen drei Sprachen).
- Ziele: 114 Zuordnungen geprüft, 0 Probleme (Einheit und Schlüssel existieren im Stand des Akts oder im Vorstand; laut `acts.json` vom Akt geändert; alle genannten Erwägungsgründe aufgenommen).
- `node --test test/core/rationale.test.mjs`: 7 von 7 Tests bestanden.

## Stichprobe der Zuordnungen `direct` (Wiederaufnahme)

15 von 59 `direct`-Zuordnungen zufällig gezogen (`node scripts/rationale/sample.mjs 15 20261112 en`, reproduzierbar), Erwägungsgrund und geänderte Bestimmung
(EN, Stand des Akts) nebeneinander gelesen. Ergebnis: 15 von 15 bestätigt, keine Korrektur, keine Rückstufung.

| Akt | Einheit / Schlüssel | EG | Befund |
|---|---|---|---|
| 2017/2225 | Art. 8 Abs. 3 Bst. a Ziff. iiia | 3 | bestätigt: Höchstdauer und Zahl der Einreisen über das EES |
| 2017/458 | Art. 8 Abs. 3 Bst. g Ziff. i | 4 | bestätigt: systematische Abfragen auch bei der Ausreise |
| 2017/2225 | Art. 11 | 6 | bestätigt: Abschaffung des Abstempelns, Ersatz durch EES-Erfassung |
| 2024/1717 | Art. 21a | 7–11 | bestätigt: Mechanismus für Reisebeschränkungen bei gesundheitlicher Notlage |
| 2024/1717 | Art. 28 | 36, 37, 39 | bestätigt: Mechanismus, Durchführungsbeschluss des Rates, sechs Monate |
| 2024/1717 | Art. 25 Abs. 1 | 34 | bestätigt: Beispiele ernsthafter Bedrohungen (Bst. a, b, d) |
| 2024/1717 | Art. 2 Nr. 27 | 7 | bestätigt: von der Kommission auf Unionsebene anerkannte Notlage |
| 2017/458 | Art. 8 Abs. 3 Bst. g Ziff. ii | 4 | bestätigt |
| 2018/1240 | Art. 8 Abs. 3 Bst. ba | 37 | bestätigt: Prüfung der Reisegenehmigung durch ETIAS-Abfrage |
| 2024/1717 | Anhang XII | 26, 28 | bestätigt: Überstellungsverfahren, schriftliche Entscheidung, Rechtsbehelf |
| 2024/1717 | Art. 25 | 33 | bestätigt: «letztes Mittel», festgelegte Zeiträume (Abs. 2) |
| 2024/1717 | Anhang XI | 9 | bestätigt: nennt «Annex XI, part B» |
| 2019/817 | Art. 8 Abs. 4a | 65 | bestätigt: gelbe/rote Verknüpfung, Abfrage CIR oder SIS |
| 2017/458 | Art. 8 Abs. 2d | 11 | bestätigt: Übergangszeit nur an Luftgrenzen |
| 2024/1717 | Art. 36 Abs. 2 | 17 | bestätigt: delegierte Rechtsakte zu Anhang XI Teil B |

## Grenzen

- Die Zuordnung ist eine fachliche Lesart; die Oberfläche kennzeichnet sie als redaktionell.
- `thematic`-Zuordnungen wurden in der Stichprobe nicht geprüft.
- Die Auswahl SGK-bezogener Erwägungsgründe bei 2016/1624, 2018/1240, 2019/817 und 2021/1134 beruht auf Lektüre aller Erwägungsgründe in Durchgang 1; nicht doppelt erhoben.
