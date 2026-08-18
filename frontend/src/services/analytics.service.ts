/* wandori.us — Analytics Service
 * Capa de servicio para analytics y estadísticas.
 * [Auditoría v4 §4.1] — Rompe acoplamiento a api.post en tracker.ts.
 * [018A-34] Analytics comparte el contrato generado y mantiene el consentimiento. */

import { unwrapGeneratedResponse } from '../api/client';
import {
  getAnalyticsStats,
  purgeAnalytics,
  trackEvents,
} from '../api/generated/settings-handler/settings-handler';
import type { AnalyticsStats } from '../api/types';

export const AnalyticsService = {
  /** Enviar eventos de analytics (batch). */
  async trackEvents(events: Array<{
    event_id?: string;
    event_type: string;
    target_type?: string;
    target_id?: string;
    metadata?: Record<string, unknown>;
  }>): Promise<void> {
    const response = await trackEvents(
      {
        events: events.map((event) => ({
          ...event,
          metadata: event.metadata ?? {},
        })),
      },
      { headers: { 'X-Analytics-Consent': 'granted' } },
    );
    unwrapGeneratedResponse<void>(response, [204]);
  },

  /** Purga eventos antiguos según la política administrativa (30–730 días). */
  async purge(maxAgeDays: number): Promise<{ deleted: number; cutoff: string }> {
    const response = await purgeAnalytics({ max_age_days: maxAgeDays });
    return unwrapGeneratedResponse<{ deleted: number; cutoff: string }>(response, [200]);
  },

  /** Obtener estadísticas (admin). */
  async getStats(): Promise<AnalyticsStats> {
    const response = await getAnalyticsStats();
    return unwrapGeneratedResponse<AnalyticsStats>(response, [200]);
  },
};
