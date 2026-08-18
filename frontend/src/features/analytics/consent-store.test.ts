import { beforeEach, describe, expect, it } from 'vitest';
import {
  analyticsConsentStore,
  canTrackAnalytics,
  setAnalyticsConsent,
} from './consent-store';
import { createAnalyticsConsentBanner } from './consent-banner';

beforeEach(() => {
  localStorage.clear();
  analyticsConsentStore.set('unknown', 'init');
  document.body.replaceChildren();
});

describe('analytics consent', () => {
  it('starts unknown and blocks optional tracking', () => {
    expect(analyticsConsentStore.get()).toBe('unknown');
    expect(canTrackAnalytics()).toBe(false);
  });

  it('persists an explicit decision', () => {
    setAnalyticsConsent('granted');
    expect(canTrackAnalytics()).toBe(true);
    expect(localStorage.getItem('wandorius:analytics-consent')).toBe('granted');
    setAnalyticsConsent('denied');
    expect(canTrackAnalytics()).toBe(false);
  });

  it('shows the banner only until the user chooses', () => {
    const banner = createAnalyticsConsentBanner();
    document.body.appendChild(banner.element);
    expect(banner.element.hidden).toBe(false);
    const allow = banner.element.querySelector('button');
    allow?.click();
    expect(banner.element.hidden).toBe(true);
    banner.destroy();
  });
});
