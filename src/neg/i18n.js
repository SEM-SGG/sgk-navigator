// SGK-Navigator, Modul Verhandlung — Rahmentexte der erzeugten Word-Dokumente (Deutsch: Schweizer Hochdeutsch ohne "ß"; Französisch)
// Rechtstext bleibt Englisch.

export const DOC_TEXT = {
  de: {
    consultation: 'Ämterkonsultation',
    dossier: 'Dossier', procedure: 'Verfahren', round: 'Runde', basis: 'Grundlage', comparedTo: 'Änderungen markiert gegenüber',
    deadline: 'Frist', office: 'Stellungnehmende Stelle', officeFill: '(bitte eintragen)',
    howTo: 'Anleitung',
    howToText: [
      'Bitte die Spalten «Kommentar der Stelle» und «Textvorschlag der Stelle» ausfüllen. Die übrigen Spalten nicht ändern.',
      'Textvorschläge auf Englisch. Änderungen am englischen Text können auch mit «Änderungen nachverfolgen» oder als Word-Kommentar angebracht werden.',
      'Zeilen ohne Bemerkung leer lassen. Zeilen dürfen gelöscht oder umsortiert werden; die Kennung «Z-…» unter der Nummer nicht entfernen.',
      'Allgemeine Bemerkungen am Ende des Dokuments eintragen.',
    ],
    markLegend: 'Markierung im englischen Text: unterstrichen = neu eingefügt, durchgestrichen = gestrichen (gegenüber der Vorfassung).',
    colNum: 'Nr.', colLabel: 'Bestimmung', colText: 'Text (EN)', colPos: 'Position CH (Entwurf)', colComment: 'Kommentar der Stelle', colProposal: 'Textvorschlag der Stelle (EN)', colOther: 'Weitere Fassungen',
    general: 'Allgemeine Bemerkungen', generalHint: '(Bemerkungen, die keiner Zeile zugeordnet sind)',
    page: 'Seite', of: 'von',
    classification: { public: 'Öffentlich', limite: 'LIMITE – nur für den Dienstgebrauch, nicht weitergeben', restricted: 'RESTREINT UE/EU RESTRICTED – klassifiziert', internal: 'Intern – nicht weitergeben' },
    confidentialHint: 'Enthält Verhandlungsunterlagen und interne Positionen der Schweiz. Nur an die konsultierten Stellen.',
    stance: { support: 'Unterstützung', 'support-with-changes': 'Unterstützung mit Änderungen', scrutiny: 'Prüfvorbehalt', reservation: 'Vorbehalt', oppose: 'Ablehnung', none: 'keine Position' },
    priority: { redline: 'rote Linie', high: 'hoch', medium: 'mittel', low: 'tief' },
    decision: { accepted: 'angenommen', partly: 'teilweise angenommen', rejected: 'abgelehnt', noted: 'zur Kenntnis genommen', open: 'offen' },
    status: { agreed: 'vorläufig vereinbart', provisional: 'weitgehend vereinbart', open: 'offen', deleted: 'gestrichen' },
    briefing: 'Verhandlungsbriefing', full: 'Positionen der Schweiz', report: 'Konsultationsbericht',
    overview: 'Übersicht', keyPoints: 'Wichtigste Punkte', byStance: 'Nach Haltung', byPriority: 'Nach Priorität', count: 'Anzahl',
    currentText: 'Aktueller Text', position: 'Position CH', stanceL: 'Haltung', priorityL: 'Priorität', core: 'Kernaussage', proposal: 'Textvorschlag', fallback: 'Rückfallposition', owner: 'Zuständig', staleHint: 'Text seit Positionsbezug geändert',
    asOf: 'Stand', source: 'Quelle', noPositions: 'Keine Positionen erfasst.', none: '–',
    responses: 'Rückmeldungen', item: 'Rückmeldung', decisionL: 'Entscheid', reply: 'Antwort', noResponses: 'Keine Rückmeldungen eingegangen.', unmatched: 'Nicht zuordenbare Bemerkungen',
    demo: 'Beispiel – fiktive Inhalte zur Demonstration',
    track: { com: 'Kommission', ep: 'EP', council: 'Rat', agreement: 'Kompromiss' },
    // Etappe 3: Delegationen, Sitzungen, Bilanz (SPEC3 §3.7)
    delegation: 'Delegation', delegations: 'Delegationen', meeting: 'Sitzung', meetings: 'Sitzungen', body: 'Gremium', date: 'Datum', docs: 'Unterlagen', note: 'Bemerkung',
    delegKind: { ms: 'Staat', institution: 'Institution', other: 'Andere' },
    delegStance: { support: 'Unterstützung', oppose: 'Ablehnung', reservation: 'Vorbehalt', scrutiny: 'Prüfvorbehalt', proposal: 'Textvorschlag', neutral: 'neutral' },
    stancesL: 'Haltungen der Delegationen', stanceText: 'Äusserung', noStances: 'Keine Haltungen erfasst.',
    interventions: 'Interventionen der Schweiz', intervention: 'Intervention', result: 'Wirkung', noInterventions: 'Keine Interventionen erfasst.',
    interventionResult: { 'taken-up': 'aufgenommen', partly: 'teilweise aufgenommen', rejected: 'nicht aufgenommen', open: 'offen' },
    outcomeL: 'Ergebnis', outcome: { achieved: 'erreicht', partly: 'teilweise erreicht', not: 'nicht erreicht', open: 'offen', obsolete: 'gegenstandslos', unset: 'nicht beurteilt' },
    suggestion: 'Vorschlag (nicht bestätigt)', suggestionHint: 'Maschineller Vorschlag aus dem Vergleich mit dem jüngsten Kompromisstext; vor Verwendung prüfen.',
    balanceTitle: 'Bilanz der Anliegen der Schweiz', meetingReport: 'Sitzungsbericht', byOutcome: 'Nach Ergebnis', achievedShare: 'Anteil erreicht (teilweise zur Hälfte gezählt)',
    concerns: 'Anliegen', withoutRow: 'ohne Zeilenbezug', inMeeting: 'in Sitzung', referenceDoc: 'Bezugsdokument',
    fictitiousDeleg: 'Beispiel (fiktiv)',
  },
  fr: {
    consultation: 'Consultation des offices',
    dossier: 'Dossier', procedure: 'Procédure', round: 'Tour', basis: 'Base', comparedTo: 'Modifications indiquées par rapport à',
    deadline: 'Délai', office: 'Office consulté', officeFill: '(à compléter)',
    howTo: 'Mode d’emploi',
    howToText: [
      'Veuillez remplir les colonnes « Commentaire de l’office » et « Proposition de texte de l’office ». Ne pas modifier les autres colonnes.',
      'Propositions de texte en anglais. Les modifications du texte anglais peuvent aussi être apportées en mode « Suivi des modifications » ou par commentaire Word.',
      'Laisser vides les lignes sans remarque. Les lignes peuvent être supprimées ou déplacées ; ne pas effacer l’identifiant « Z-… » sous le numéro.',
      'Saisir les remarques générales à la fin du document.',
    ],
    markLegend: 'Marquage dans le texte anglais : souligné = inséré, barré = supprimé (par rapport à la version précédente).',
    colNum: 'N°', colLabel: 'Disposition', colText: 'Texte (EN)', colPos: 'Position CH (projet)', colComment: 'Commentaire de l’office', colProposal: 'Proposition de texte de l’office (EN)', colOther: 'Autres versions',
    general: 'Remarques générales', generalHint: '(remarques qui ne se rapportent à aucune ligne)',
    page: 'Page', of: 'sur',
    classification: { public: 'Public', limite: 'LIMITE – usage interne, ne pas diffuser', restricted: 'RESTREINT UE/EU RESTRICTED – classifié', internal: 'Interne – ne pas diffuser' },
    confidentialHint: 'Contient des documents de négociation et des positions internes de la Suisse. Réservé aux offices consultés.',
    stance: { support: 'Soutien', 'support-with-changes': 'Soutien avec modifications', scrutiny: 'Réserve d’examen', reservation: 'Réserve', oppose: 'Rejet', none: 'aucune position' },
    priority: { redline: 'ligne rouge', high: 'élevée', medium: 'moyenne', low: 'basse' },
    decision: { accepted: 'accepté', partly: 'partiellement accepté', rejected: 'rejeté', noted: 'pris acte', open: 'ouvert' },
    status: { agreed: 'accord provisoire', provisional: 'largement convenu', open: 'ouvert', deleted: 'supprimé' },
    briefing: 'Note de négociation', full: 'Positions de la Suisse', report: 'Rapport de consultation',
    overview: 'Vue d’ensemble', keyPoints: 'Points principaux', byStance: 'Par position', byPriority: 'Par priorité', count: 'Nombre',
    currentText: 'Texte actuel', position: 'Position CH', stanceL: 'Appréciation', priorityL: 'Priorité', core: 'Message clé', proposal: 'Proposition de texte', fallback: 'Position de repli', owner: 'Responsable', staleHint: 'Texte modifié depuis la prise de position',
    asOf: 'État', source: 'Source', noPositions: 'Aucune position saisie.', none: '–',
    responses: 'Réponses', item: 'Réponse', decisionL: 'Décision', reply: 'Réponse', noResponses: 'Aucune réponse reçue.', unmatched: 'Remarques non attribuables',
    demo: 'Exemple – contenus fictifs à titre de démonstration',
    track: { com: 'Commission', ep: 'PE', council: 'Conseil', agreement: 'Compromis' },
    // Étape 3 : délégations, séances, bilan (SPEC3 §3.7)
    delegation: 'Délégation', delegations: 'Délégations', meeting: 'Séance', meetings: 'Séances', body: 'Instance', date: 'Date', docs: 'Documents', note: 'Remarque',
    delegKind: { ms: 'État', institution: 'Institution', other: 'Autre' },
    delegStance: { support: 'soutien', oppose: 'opposition', reservation: 'réserve', scrutiny: 'réserve d’examen', proposal: 'proposition de texte', neutral: 'neutre' },
    stancesL: 'Positions des délégations', stanceText: 'Intervention', noStances: 'Aucune position saisie.',
    interventions: 'Interventions de la Suisse', intervention: 'Intervention', result: 'Effet', noInterventions: 'Aucune intervention saisie.',
    interventionResult: { 'taken-up': 'reprise', partly: 'partiellement reprise', rejected: 'non reprise', open: 'ouverte' },
    outcomeL: 'Résultat', outcome: { achieved: 'atteint', partly: 'partiellement atteint', not: 'non atteint', open: 'ouvert', obsolete: 'sans objet', unset: 'non évalué' },
    suggestion: 'Suggestion (non confirmée)', suggestionHint: 'Suggestion automatique fondée sur la comparaison avec le texte de compromis le plus récent ; à vérifier avant utilisation.',
    balanceTitle: 'Bilan des préoccupations de la Suisse', meetingReport: 'Rapport de séance', byOutcome: 'Par résultat', achievedShare: 'Part atteinte (partiellement atteint compté pour moitié)',
    concerns: 'Préoccupations', withoutRow: 'sans référence à une ligne', inMeeting: 'en séance', referenceDoc: 'Document de référence',
    fictitiousDeleg: 'Exemple (fictif)',
  },
};

export const T = (lang) => DOC_TEXT[lang === 'fr' ? 'fr' : 'de'];

/** Zeilen-Id "r000120" <-> sichtbare Kennung "Z-000120" */
export const visibleRowId = (rowId) => `Z-${String(rowId).replace(/^r/, '')}`;
export const rowIdFromVisible = (s) => { const m = /Z-(\d{6,})/.exec(String(s || '')); return m ? `r${m[1]}` : null; };

export function formatDate(iso, lang = 'de') {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${+m[3]}.${+m[2]}.${m[1]}`;
}
