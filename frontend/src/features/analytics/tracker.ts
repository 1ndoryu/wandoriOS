/* wandori.us — Event Tracker
 * Mide cada interacción del usuario: pageviews, clicks, copias, descargas.
 * Envía eventos al backend de forma asíncrona sin bloquear la UI. */

import { tryCatch } from '../../utils/result';
import { AnalyticsService } from '../../services';
import type { AnalyticsEvent } from '../../api/types';
import { canTrackAnalytics } from './consent-store';

const BATCH_SIZE = 10;
const FLUSH_INTERVAL = 5000; /* 5 segundos */

let eventQueue: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight: Promise<void> | null = null;

/* Registrar un evento */
export function track(event: AnalyticsEvent): void {
  if (!canTrackAnalytics()) return;

  eventQueue.push({
    ...event,
    event_id: crypto.randomUUID(),
    metadata: {
      ...event.metadata,
      timestamp: Date.now(),
      path: window.location.pathname,
    },
  });

  /* Flush si acumula suficientes eventos */
  if (eventQueue.length >= BATCH_SIZE) {
    flush();
  }

  /* Programar flush por tiempo */
  if (!flushTimer) {
    flushTimer = setTimeout(flush, FLUSH_INTERVAL);
  }
}

/* Enviar eventos acumulados al backend */
async function flush(): Promise<void> {
  if (flushInFlight) return flushInFlight;
  flushInFlight = flushBatch();
  try {
    await flushInFlight;
  } finally {
    flushInFlight = null;
  }
}

async function flushBatch(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (eventQueue.length === 0) return;

  const events = [...eventQueue];
  eventQueue = [];

  const result = await tryCatch(AnalyticsService.trackEvents(events));
    if (!result.ok) {
      /* Analytics nunca bloquea la UI, pero el fallo queda observable y el
       * lote vuelve a la cola para un reintento acotado. */
      console.warn('[analytics] batch failed', result.error);
      eventQueue = [...events, ...eventQueue];
    }
}

/* === Helpers de tracking === */

/* Page view — target_id es UUID, no path. El path va en metadata. */
export function trackPageView(page: string): void {
  track({ event_type: 'page_view', target_type: 'page', metadata: { page } });
}

/* Click en artículo */
export function trackArticleClick(articleId: string): void {
  track({ event_type: 'click', target_type: 'article', target_id: articleId });
}

/* Click en link externo */
export function trackLinkClick(url: string): void {
  track({ event_type: 'click', target_type: 'link', metadata: { url } });
}

/* Copia de texto */
export function trackCopy(context: string): void {
  track({ event_type: 'copy', target_type: 'text', metadata: { context } });
}

/* Descarga de imagen */
export function trackImageDownload(imagePath: string): void {
  track({ event_type: 'download', target_type: 'image', metadata: { path: imagePath } });
}

/* Compra */
export function trackPurchase(productId: string): void {
  track({ event_type: 'purchase', target_type: 'product', target_id: productId });
}

/* [297A-16] Errores globales sanitizados: se mide la categoría, nunca el
 * mensaje/stack (pueden contener rutas, URLs o datos del usuario). */
function onGlobalError(): void {
  track({ event_type: 'error', target_type: 'runtime', metadata: { kind: 'uncaught' } });
}
function onUnhandledRejection(): void {
  track({ event_type: 'error', target_type: 'runtime', metadata: { kind: 'rejection' } });
}

/* Inicializar tracking automático de page views. Retorna cleanup function.
 * [Auditoría v4 §4.3] Eventos globales ahora removibles. */
export function initTracking(): () => void {
  function onCopy(): void { trackCopy(window.location.pathname); }
  function onExternalClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (anchor && anchor.origin !== window.location.origin) {
      trackLinkClick(anchor.href);
    }
  }
  function onBeforeUnload(): void { flush(); }

  document.addEventListener('copy', onCopy);
  document.addEventListener('click', onExternalClick);
  window.addEventListener('error', onGlobalError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  window.addEventListener('beforeunload', onBeforeUnload);

  return () => {
    document.removeEventListener('copy', onCopy);
    document.removeEventListener('click', onExternalClick);
    window.removeEventListener('error', onGlobalError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
    window.removeEventListener('beforeunload', onBeforeUnload);
  };
}
