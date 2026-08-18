/* wandori.us — Banner de consentimiento
 * Vive fuera de las apps: la decisión es transversal y se aplica antes de
 * que tracker.ts pueda encolar una métrica opcional. */

import { dispatchEvent } from './dispatcher';
import { createEl } from '../../utils/dom';
import {
  analyticsConsentStore,
  setAnalyticsConsent,
  type AnalyticsConsent,
} from './consent-store';

export interface AnalyticsConsentBanner {
  readonly element: HTMLElement;
  readonly destroy: () => void;
}

export function createAnalyticsConsentBanner(): AnalyticsConsentBanner {
  const element = createEl('aside', {
    className: 'analyticsConsent',
    role: 'dialog',
    ariaLabel: 'Consentimiento de métricas',
  });
  const title = createEl('strong', { className: 'analyticsConsent__titulo', textContent: 'Métricas opcionales' });
  const message = createEl('p', {
    className: 'analyticsConsent__texto',
    textContent: 'Podemos medir navegación y uso del OS de forma anónima para mejorarlo. No es necesario para usar el sitio.',
  });
  const actions = createEl('div', { className: 'analyticsConsent__acciones' });
  const allow = createEl('button', { type: 'button', className: 'boton', textContent: 'Permitir' });
  const deny = createEl('button', { type: 'button', className: 'boton', textContent: 'Rechazar' });
  actions.append(allow, deny);
  element.append(title, message, actions);

  const render = (consent: AnalyticsConsent): void => {
    element.hidden = consent !== 'unknown';
  };
  const choose = (consent: 'granted' | 'denied'): void => {
    setAnalyticsConsent(consent);
    dispatchEvent({ type: 'consent_updated', consent: consent === 'granted' });
  };
  allow.addEventListener('click', () => choose('granted'));
  deny.addEventListener('click', () => choose('denied'));
  const stop = analyticsConsentStore.subscribeSimple(render);
  return { element, destroy: () => { stop(); element.remove(); } };
}
