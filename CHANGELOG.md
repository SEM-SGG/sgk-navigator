# Änderungen

Jede Version hat hier einen Abschnitt. Der oberste Abschnitt ist die aktuelle Version: Wird er auf `main` zusammengeführt, veröffentlicht der Workflow «Release» die Version. Ohne Abschnitt gibt es keine Release. Form der Überschrift: `## 2026.12.02 (2. Dezember 2026)`, darunter je Änderung eine Zeile `- `, verständlich für Nutzende. Ein Unterabschnitt `### Français` enthält auf Wunsch den französischen Text für die Download-Seite. Anleitung: [MAINTAINING.md](MAINTAINING.md#neue-version-veröffentlichen).

## 2026.11.24-2 (24. November 2026)

- Der Navigator ist in Erprobung: In der Kopfzeile steht rechts neben dem Produktnamen das Etikett «BETA».
- Rechts daneben öffnet ein Käfersymbol («Fehler melden oder Änderung vorschlagen») die Auswahl für neue Issues auf GitHub in einem neuen Tab. Neu gibt es dort neben «Fehler melden» das Formular «Wunsch oder Änderungsvorschlag». Meldungen auf GitHub sind öffentlich; ohne GitHub-Konto weiterhin an sektion-grenze@sem.admin.ch.
- In schmalen Fenstern (unter 480 px) zeigt der Sammelkorb in der Kopfzeile nur noch sein Symbol.

### Français

- Le SGK-Navigator est en phase d’essai : l’en-tête affiche l’étiquette « BÊTA » à droite du nom du produit.
- À sa droite, un symbole d’insecte (« Signaler une erreur ou proposer une modification ») ouvre dans un nouvel onglet la page de choix des issues sur GitHub, qui propose désormais aussi un formulaire pour les souhaits et propositions de modification. Les signalements sur GitHub sont publics ; sans compte GitHub, toujours à sektion-grenze@sem.admin.ch.
- Dans les fenêtres étroites (moins de 480 px), le panier de l’en-tête n’affiche plus que son symbole.

## 2026.11.24 (24. November 2026)

- Die Produktdokumentation liegt auf der Download-Seite unter `dokumentation.html`. Die Ansicht «Info» verlinkt sie und nennt die Adresse sektion-grenze@sem.admin.ch für Rückmeldungen ohne GitHub-Konto.
- «Aktualisieren» führt Akte und Vorschläge, welche die Pflegenden zur Kenntnis genommen haben, als «zur Kenntnis genommen» und zählt sie nicht mehr als neu.
- Pflege: Der Workflow «Fassungen» baut neue konsolidierte Fassungen selbst ein und eröffnet dazu einen Pull Request mit Befund, geänderten Bestimmungen, Prüfberichten und Tests. Nach dem Zusammenführen veröffentlicht der Workflow «Release» die neue Version von selbst. Arbeitsanleitung für Agenten in `AGENTS.md`.

### Français

- La documentation du produit se trouve sur la page de téléchargement (`dokumentation.html`). La vue « Info » y renvoie et indique l’adresse sektion-grenze@sem.admin.ch pour les retours sans compte GitHub.
- « Mise à jour » signale comme « noté » les actes et propositions dont l’équipe de maintenance a pris connaissance et ne les compte plus comme nouveaux.

## 2026.11.18 (18. November 2026)

- Erste Veröffentlichung im Repository `SEM-SGG/sgk-navigator`: Schengener Grenzkodex, EES-, ETIAS-, VIS- und Interoperabilitäts-Verordnung mit Datenstand 12. Oktober 2025 (SGK) bzw. 12. Juni 2026 (übrige), Modul Verhandlung, Download-Seite und Hinweis auf neue Versionen.
