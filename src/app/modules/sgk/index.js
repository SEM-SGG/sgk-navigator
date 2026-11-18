// Modul "Rechtsakte" (Etappe 1, Werkwahl seit Etappe 3). Weitere Module registrieren sich mit derselben Form:
// { id, labelKey, views: [{ id, labelKey, component }] }; Texte über registerStrings (lib/i18n.js).
import { Overview } from './overview.js';
import { Read, ChronikView } from './read.js';
import { CompareView } from './compareview.js';
import { UpdateView } from './updateview.js';
import { InfoView } from './info.js';
import { GuideView } from './guide.js';
import { WorkBar } from './workbar.js';

export const sgkModule = {
  id: 'sgk',
  labelKey: 'nav.module',
  views: [
    { id: 'uebersicht', labelKey: 'nav.uebersicht', component: Overview },
    { id: 'lesen', labelKey: 'nav.lesen', component: Read },
    { id: 'chronik', labelKey: 'nav.chronik', component: ChronikView },
    { id: 'vergleich', labelKey: 'nav.vergleich', component: CompareView },
    { id: 'aktualisieren', labelKey: 'nav.aktualisieren', component: UpdateView },
    { id: 'anleitung', labelKey: 'nav.anleitung', component: GuideView },
    { id: 'info', labelKey: 'nav.info', component: InfoView },
  ],
  Bar: WorkBar,
};
