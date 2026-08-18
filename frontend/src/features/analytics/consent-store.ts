/* wandori.us — Analytics consent
 * La métrica es opcional. El servidor también exige el header de consentimiento;
 * esta guardia evita llenar la cola o iniciar requests antes de la decisión. */

import { createStore, type Store } from '../../store';

export type AnalyticsConsent = 'unknown' | 'granted' | 'denied';

const CONSENT_KEY = 'wandorius:analytics-consent';

function readConsent(): AnalyticsConsent {
  const value = localStorage.getItem(CONSENT_KEY);
  return value === 'granted' || value === 'denied' ? value : 'unknown';
}

export const analyticsConsentStore: Store<AnalyticsConsent> = createStore(readConsent());

export function setAnalyticsConsent(consent: Exclude<AnalyticsConsent, 'unknown'>): void {
  localStorage.setItem(CONSENT_KEY, consent);
  analyticsConsentStore.set(consent, 'user');
}

export function canTrackAnalytics(): boolean {
  return analyticsConsentStore.get() === 'granted';
}
