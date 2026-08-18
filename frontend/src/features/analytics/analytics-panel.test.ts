import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from '../../services';
import { createAnalyticsPanel } from './analytics-panel';

const stats = {
  total_page_views: 12,
  total_clicks: 4,
  total_downloads: 2,
  total_purchases: 1,
  top_articles: [{ id: 'a', title: 'Artículo', views: 8 }],
  recent_events: [{ event_type: 'app_opened', target_type: 'app', created_at: '2026-08-01T00:00:00Z' }],
};

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('analytics panel', () => {
  it('carga Overview y permite cambiar de dimensión', async () => {
    vi.spyOn(AnalyticsService, 'getStats').mockResolvedValue(stats);
    const view = createAnalyticsPanel();
    document.body.appendChild(view.element);
    await Promise.resolve();
    expect(view.element.textContent).toContain('page views');

    const contentTab = view.element.querySelector<HTMLButtonElement>('[role="tab"]');
    expect(contentTab).not.toBeNull();
    const tabs = view.element.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs[1]?.click();
    expect(view.element.textContent).toContain('Artículos más vistos');
    view.destroy();
  });

  it('muestra estado vacío en Reliability sin inventar datos', async () => {
    vi.spyOn(AnalyticsService, 'getStats').mockResolvedValue(stats);
    const view = createAnalyticsPanel();
    document.body.appendChild(view.element);
    await Promise.resolve();
    const tabs = view.element.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs[4]?.click();
    expect(view.element.textContent).toContain('No hay datos de fiabilidad');
    view.destroy();
  });
});
