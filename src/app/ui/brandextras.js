// Kopfzeile rechts neben dem Produktnamen: Etikett «BETA» (Schalter BETA) und Symbol «Fehler melden oder Änderung
// vorschlagen» (Auswahlseite für neue Issues, PROJECT.issues), beide in src/app/config/update-source.js.
// Beide liegen ausserhalb des Links .brand (keine verschachtelten interaktiven Elemente). Im Druck blendet styles.css die
// ganze Kopfzeile aus; Exporte (Karten, PDF, Word, Druckansichten des Moduls Verhandlung) enthalten sie nicht.
import { html } from 'htm/preact';
import { t } from '../lib/i18n.js';
import { Icon } from './common.js';
import { BETA, PROJECT } from '../config/update-source.js';

/** Etikett und Rückmelde-Symbol; beta und issues sind für Tests überschreibbar. */
export function BrandExtras({ beta = BETA, issues = PROJECT.issues } = {}) {
  const tip = t('app.beta.tip');
  const label = t('app.feedback.label');
  return html`${beta ? html`<span class="tag tag-beta" id="beta-tag" title=${tip}><span aria-hidden="true">${t('app.beta.label')}</span><span class="sr">${tip}</span></span>` : null}${issues ? html`<a class="btn-icon is-bare head-feedback" id="lnk-feedback" href=${issues} target="_blank" rel="noopener noreferrer" aria-label=${label} title=${`${label}. ${t('app.feedback.tip')}`}><${Icon} name="bug" /></a>` : null}`;
}
