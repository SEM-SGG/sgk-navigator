# STATUS UI-VERHANDLUNG (Etappe 3, Welle 2)

Stand: 12.11.2026, final.

## Fertig (committet auf Branch ui-verhandlung)
- Kürzel (`by.js`): Abfrage beim ersten Speichern einer Position, beim Bestätigen eines Ergebnisses und beim Öffnen des Zusammenführens;
  Anzeige und Änderung in der Dossierleiste; `by` über `core.js` (`withBy`) an setPosition (auch Massenbearbeitung, Bezug, Übernahme aus
  Konsultation), setDecision, setStance, addIntervention, updateIntervention, setOutcome. Verlauf der Position, Haltungen, Interventionen,
  Ergebnisse und Entscheide zeigen das Kürzel.
- Zusammenführen (`merge.js`, versteckte Ansicht `zusammenfuehren`, Schaltfläche in der Dossierleiste und Symbol in der Dossierliste):
  Datei + optionale Stammdatei (mit Erklärung), Warnungen DE/FR, Übersicht (aus der anderen Datei, kombiniert, nur bei mir, gelöscht;
  aufklappbar), Konflikte mit Stammdatei/mein/andere und Wort-Diff, Entscheid mein/andere/beide (Textfeld), Sammelaktionen, Übernahme erst
  nach Entscheid aller Konflikte, Sicherung als Projektdatei, Zusammenfassung mit Rückgängig. Import mit Überschreiben bleibt in «Dossiers».
- Delegationen (`deleg.js`, Ansicht `delegationen` mit Unteransichten Haltungen | Sitzungen | Delegationen verwalten): Matrix mit Filtern,
  Kennzahlen, gleiche Haltung wie CH, fixierte Kopfzeile/Zeilenspalte, seitenweises Rendern; Sitzungen anlegen/bearbeiten/löschen,
  vorbereiten (anstehende Zeilen), nachbereiten (Interventionen, Haltungen), Sitzungsbericht Word DE/FR und Druck; Zeilendetail Reiter
  «Delegationen» (Mehrfachauswahl, Verlauf, Interventionen).
- Bilanz (`balance.js`, Position CH › Bilanz; Abschnitt in Ausgabe): Vorschlag gekennzeichnet mit Begründung und Diff, bestätigen/ändern/
  zurücksetzen, Statistik, Word DE/FR, Druckansicht (`print3.js`).
- Vorschau (`impact.js`): Zeilendetail Reiter «Wirkung» (Diff je Spur, Ausgangsstand wählbar), Übersicht `wirkung`, Links `#/lesen?u=…&pv=…`.
- Kartenmodelle (`cardmodel.js`), CardMenu mit `model` (Word mit Redline, Word mit Änderungsverfolgung, PDF mit Text A4/16:9, Kopieren).
- DTC-Beispiel mit Kurzbeschrieb; fiktive Teile gekennzeichnet.
- Anleitung DE/FR: 5 neue Aufgaben, Abschnitt «Arbeit im Team», 10 Begriffe, 4 Grenzen, Legende; Kontext-Hilfe aus allen neuen Ansichten.
- Tests: `test/app/neg3.spec.mjs` (21 Tests), `test/app/neg.spec.mjs` angepasst (Kürzel voreingestellt, Zahl der Anleitungsabschnitte).

## Offen / Hinweise
- siehe Abschlussbericht an den Orchestrator (Schlüssel in state.js, ExportMenu, Flake app.spec «Ablauf 5»).
