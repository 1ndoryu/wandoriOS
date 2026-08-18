/* wandori.us — Analytics Dispatcher
 * Catálogo tipado de eventos del OS.
 * [Plan §9.1/9.2] Envelope con eventId, schemaVersion, session ID,
 * presentationMode. Wrapper sobre el tracker existente.
 * No emite por cada pointermove; eventos críticos reservados al backend. */

import { trackPageView } from './tracker';
import { getPresentationMode } from '../../utils/viewport';

/* === Schema version del catálogo de eventos === */
const SCHEMA_VERSION = 1;

/* === Session ID rotatorio === */
let sessionId = crypto.randomUUID();

/** Rotar session ID (llamar en login/logout). */
export function rotateSessionId(): void {
  sessionId = crypto.randomUUID();
  actorCategory = 'anonymous';
}

/** Obtener session ID actual. */
export function getSessionId(): string {
  return sessionId;
}

/* === Catálogo completo de eventos (Plan §9.2) === */

/** Eventos de sesión. */
type SessionEvent =
  | { type: 'session_started'; userId: string | null }
  | { type: 'session_ended' }
  | { type: 'consent_updated'; consent: boolean };

/** Eventos de navegación. */
type NavigationEvent =
  | { type: 'page_view'; path: string }
  | { type: 'route_viewed'; path: string }
  | { type: 'external_nav_toggled'; expanded: boolean }
  | { type: 'deep_link_opened'; routeName: string; appId: string }
  | {
      type: 'share_url_copied';
      success: boolean;
      routeName: string;
      appId: string;
      presentationMode: 'desktop' | 'tablet' | 'mobile';
    };

/** Eventos de apps. */
type AppEvent =
  | { type: 'app_opened'; appId: string }
  | { type: 'app_closed'; appId: string }
  | { type: 'app_failed'; appId: string; error?: string };

/** Eventos de ventanas. */
type WindowEvent =
  | { type: 'window_focus_changed'; appId: string; previousAppId?: string }
  | { type: 'window_minimized'; appId: string }
  | { type: 'window_restored'; appId: string }
  | { type: 'window_maximized'; appId: string; maximized: boolean }
  | { type: 'windows_reframed'; count: number }
  | { type: 'window_moved'; appId: string }
  | { type: 'window_resized'; appId: string }
  | { type: 'window_closed'; appId: string };

/** Eventos de contenido. */
type ContentEvent =
  | { type: 'resource_opened'; resourceKind: string; resourceId?: string }
  | { type: 'image_viewed'; imageId?: string }
  | { type: 'project_launched'; projectId?: string };

/** Eventos de workspace. */
type WorkspaceEvent =
  | { type: 'workspace_command_completed'; commandId: string; outcome: string }
  | { type: 'workspace_conflict'; commandId: string }
  | { type: 'workspace_reset' };

/** Eventos de publicación (intención; backend confirma). */
type PublicationEvent =
  | { type: 'resource_published'; resourceKind: string }
  | { type: 'resource_privated'; resourceKind: string }
  | { type: 'resource_trashed'; resourceKind: string }
  | { type: 'resource_restored'; resourceKind: string };

/** Eventos de comercio (intención; backend confirma). */
type CommerceEvent =
  | { type: 'product_viewed'; productId: string }
  | { type: 'checkout_started'; productId: string }
  | { type: 'order_paid'; orderId: string }
  | { type: 'delivery_granted'; orderId: string }
  | { type: 'refund_completed'; orderId: string };

/** Eventos de fiabilidad. */
type ReliabilityEvent =
  | { type: 'operation_failed'; operation: string; error?: string }
  | { type: 'retry_outcome'; operation: string; success: boolean };

/* [297A-18] Eventos de preferencias del OS (tema).
 * mode = preferencia del usuario; resolved = tema efectivamente aplicado;
 * scope = 'local' hasta que 297A-13 sincronice la preferencia de cuenta. */
type ThemeEvent =
  | { type: 'theme_changed'; mode: 'system' | 'claro' | 'oscuro'; resolved: 'claro' | 'oscuro'; scope: 'local' | 'account' };

/** Unión de todos los eventos tipados. */
export type TrackEvent =
  | SessionEvent
  | NavigationEvent
  | AppEvent
  | WindowEvent
  | ContentEvent
  | WorkspaceEvent
  | PublicationEvent
  | CommerceEvent
  | ReliabilityEvent
  | ThemeEvent;

/** Envelope completo del evento (Plan §9.1). */
export interface AnalyticsEnvelope {
  readonly eventId: string;
  readonly schemaVersion: number;
  readonly eventName: string;
  readonly timestampClient: number;
  readonly sessionId: string;
  readonly presentationMode: 'desktop' | 'tablet' | 'mobile';
  readonly actorCategory: 'anonymous' | 'authenticated' | 'admin';
  readonly properties: Record<string, unknown>;
}

/** Cola interna para batching futuro. */
const queue: AnalyticsEnvelope[] = [];
const MAX_QUEUE_SIZE = 50;

/* getPresentationMode() movida a utils/viewport.ts — importada arriba */

/**
 * Despacha un evento tipado al sistema de analytics.
 * [Plan §9.1] Crea envelope completo con eventId, schemaVersion, sessionId.
 * Por ahora delega al tracker existente; en 297A-16 se conectará al pipeline batch.
 */
export function dispatchEvent(event: TrackEvent): void {
  /* Evitar cola infinita */
  if (queue.length >= MAX_QUEUE_SIZE) {
    queue.splice(0, queue.length - MAX_QUEUE_SIZE + 1);
  }

  /* Crear envelope */
  const envelope: AnalyticsEnvelope = {
    eventId: crypto.randomUUID(),
    schemaVersion: SCHEMA_VERSION,
    eventName: event.type,
    timestampClient: Date.now(),
    sessionId,
    presentationMode: getPresentationMode(),
    actorCategory,
    properties: extractProperties(event),
  };

  queue.push(envelope);

  /* Delegar al tracker existente según tipo */
  switch (event.type) {
    case 'page_view':
      trackPageView(event.path);
      break;
    default:
      /* Placeholder: en 297A-16 se conectará al pipeline batch.
       * Por ahora solo acumula en cola para no perder eventos. */
      break;
  }
}

/** Extraer propiedades allowlisted del evento (sin datos sensibles). */
function extractProperties(event: TrackEvent): Record<string, unknown> {
  const { type, ...rest } = event;
  return rest as Record<string, unknown>;
}

/** Obtener eventos acumulados (para debug/testing). */
export function getQueuedEvents(): readonly AnalyticsEnvelope[] {
  return queue;
}

/** Limpiar cola (para testing). */
export function clearQueue(): void {
  queue.length = 0;
}

/** Establecer categoría de actor (llamar al cambiar auth state). */
let actorCategory: 'anonymous' | 'authenticated' | 'admin' = 'anonymous';

/** Establecer categoría de actor (llamar al cambiar auth state). */
export function setActorCategory(category: 'anonymous' | 'authenticated' | 'admin'): void {
  actorCategory = category;
}
