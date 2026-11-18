// Modul "Verhandlung" (Etappe 2): Dossiers, Synopse, Import, Position CH, Konsultation, Ausgabe, Anleitung.
// Registrierung wie das SGK-Modul: { id, labelKey, views }; zusätzlich Bar (Dossierleiste) und Host (Dialoge).
import { registerStrings } from '../../lib/i18n.js';
import de from './i18n/de.js';
import fr from './i18n/fr.js';
import { DossiersView } from './dossiers.js';
import { SynopsisView } from './synopsis.js';
import { ImportView } from './importview.js';
import { PositionView } from './positions.js';
import { ConsultationView } from './consultation.js';
import { OutputView } from './output.js';
import { PrintView } from './print.js';
import { NegGuideView } from './guide.js';
import { html } from 'htm/preact';
import { DossierBar, ConfirmHost } from './ui.js';
import { ByHost } from './by.js';
import { MergeView } from './merge.js';
import { DelegationsView } from './deleg.js';
import { ImpactView } from './impact.js';
import { loadList, dossierStore, listStore } from './store.js';
import * as negCore from './core.js';
import { cardsForRow } from './testapi.js';

registerStrings('de', de);
registerStrings('fr', fr);

export const negModule = {
  id: 'neg',
  labelKey: 'neg.module',
  needsDossier: true,
  views: [
    { id: 'dossiers', labelKey: 'neg.nav.dossiers', component: DossiersView },
    { id: 'synopse', labelKey: 'neg.nav.synopse', component: SynopsisView },
    { id: 'import', labelKey: 'neg.nav.import', component: ImportView },
    { id: 'position', labelKey: 'neg.nav.position', component: PositionView },
    { id: 'delegationen', labelKey: 'neg.nav.delegationen', component: DelegationsView },
    { id: 'konsultation', labelKey: 'neg.nav.konsultation', component: ConsultationView },
    { id: 'ausgabe', labelKey: 'neg.nav.ausgabe', component: OutputView },
    { id: 'n-anleitung', labelKey: 'nav.anleitung', component: NegGuideView },
    { id: 'druck', labelKey: 'neg.nav.druck', component: PrintView, hidden: true },
    { id: 'zusammenfuehren', labelKey: 'neg.nav.zusammenfuehren', component: MergeView, hidden: true },
    { id: 'wirkung', labelKey: 'neg.nav.wirkung', component: ImpactView, hidden: true },
  ],
  Bar: DossierBar,
  Host: () => html`<${ConfirmHost} /><${ByHost} />`,
  init: loadList,
  /** Testzugang (window.__sgk.neg) */
  api: { core: negCore, dossier: () => dossierStore.get(), list: () => listStore.get(), cards: (rowId) => cardsForRow(dossierStore.get(), rowId) },
};
