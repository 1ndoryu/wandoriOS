/* GAME-01 — Actividad auditada del catálogo del Bosque.
 * Transporta el listado admin de eventos sensibles (solo AdminUser en el
 * backend); el panel Admin lo muestra en el tab "juego". El contrato no
 * expone identidades: actor_kind, acción, entidad, payload visual y fecha.
 * [297A-59] El mismo DTO sirve para el catálogo (character.*) y para las
 * publicaciones de mapas (map.published), con pares acción-entidad estrictos.
 * [297A-61] El catálogo de assets (asset.created/asset.updated) usa el mismo
 * contrato y el mismo helper con un tercer endpoint real. */

import { generatedFetcher, unwrapGeneratedResponse, type GeneratedResponse } from '../api/client';

export interface GameAuditEventEntry {
  id: number;
  actorKind: string;
  action: string;
  entityKind: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

const ACTOR_KINDS_ALLOWLIST = new Set(['admin', 'account', 'system']);

/* Pares (acción, entidad) válidos: el backend fija ambos; exigir la pareja
 * evita aceptar combinaciones imposibles aunque cada valor pase por separado. */
const ACTION_ENTITY_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['character.created', 'character'],
  ['character.updated', 'character'],
  ['map.published', 'map'],
  ['asset.created', 'asset'],
  ['asset.updated', 'asset'],
];

export function isValidAuditEvent(value: unknown): value is GameAuditEventEntry {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  const keys = Object.keys(event).sort();
  if (keys.join(',') !== 'action,actorKind,createdAt,entityId,entityKind,id,payload') return false;
  if (typeof event.action !== 'string' || typeof event.entityKind !== 'string') return false;
  return typeof event.id === 'number'
    && Number.isInteger(event.id)
    && typeof event.actorKind === 'string'
    && ACTOR_KINDS_ALLOWLIST.has(event.actorKind)
    && ACTION_ENTITY_PAIRS.some(([action, kind]) => action === event.action && kind === event.entityKind)
    && typeof event.entityId === 'string'
    && typeof event.payload === 'object'
    && event.payload !== null
    && !Array.isArray(event.payload)
    && typeof event.createdAt === 'string';
}

export interface ListAuditEventsOptions {
  entityId?: string;
  limit?: number;
  signal?: AbortSignal;
}

/* [297A-59] Segundo consumidor del mismo DTO: el helper comparte fetch,
 * query params y validación entre catálogo y mapas (dos casos reales). */
async function listAuditEvents(
  endpoint:
    | '/api/admin/game/audit/characters'
    | '/api/admin/game/audit/maps'
    | '/api/admin/game/audit/assets',
  options?: ListAuditEventsOptions,
): Promise<GameAuditEventEntry[]> {
  const params = new URLSearchParams();
  if (options?.entityId) params.set('entityId', options.entityId);
  if (options?.limit !== undefined) params.set('limit', String(options.limit));
  const query = params.toString();
  const response = await generatedFetcher<GeneratedResponse<unknown>>(
    `${endpoint}${query ? `?${query}` : ''}`,
    { method: 'GET', signal: options?.signal },
  );
  const payload = unwrapGeneratedResponse<unknown>(response, [200]);
  if (!Array.isArray(payload) || !payload.every(isValidAuditEvent)) {
    throw new Error('Respuesta de auditoría inválida');
  }
  return payload;
}

export const GameAuditService = {
  listCharacterEvents(options?: ListAuditEventsOptions): Promise<GameAuditEventEntry[]> {
    return listAuditEvents('/api/admin/game/audit/characters', options);
  },
  listMapEvents(options?: ListAuditEventsOptions): Promise<GameAuditEventEntry[]> {
    return listAuditEvents('/api/admin/game/audit/maps', options);
  },
  listAssetEvents(options?: ListAuditEventsOptions): Promise<GameAuditEventEntry[]> {
    return listAuditEvents('/api/admin/game/audit/assets', options);
  },
};
