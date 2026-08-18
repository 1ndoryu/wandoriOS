/* GAME-01 — Administración de mapas del Bosque.
 * Carga el snapshot activo (`GET /api/game/maps/{mapId}`) y publica una nueva
 * versión inmutable (`POST /api/admin/game/maps`) con `expectedVersion`
 * (0 para la primera publicación; después debe coincidir con la activa).
 * [297A-71] El borrador editable (`game_map_drafts`) se lee y guarda con
 * revisión optimista: `GET/PUT /api/admin/game/maps/{mapId}/draft`; publicar
 * invalida el borrador en el servidor (la publicación pasa a ser la base).
 * [297A-64] El editor de mapa 2D consume este servicio: el envelope público se
 * valida estrictamente y el documento se revalida con el contrato puro de
 * `game-core` antes de editar o publicar. La frontera 401/403 la resuelve el
 * backend vía `AdminUser` + CSRF; 404 significa que aún no hay mapa publicado. */

import { generatedFetcher, unwrapGeneratedResponse, ApiError, type GeneratedResponse } from '../api/client';
import {
  validateMapVersion,
  MAP_VERSION_SCHEMA,
  type MapVersion,
  type MapValidationIssue,
} from '../features/game-core';

/** Id canónico del mapa del Bosque. Debe coincidir con `GAME_MAP_ID` en el
 * entorno del backend para que el runtime realtime sirva este mismo mapa. */
export const GAME_MAP_ID = 'bosque';

/** Envelope público del snapshot activo (Orval GameMapVersionPublic). */
export interface GameMapVersionPublic {
  mapId: string;
  version: number;
  schemaVersion: number;
  contentHash: string;
  publishedAt: string;
  document: unknown;
}

/** Mapa resuelto por el editor: el documento ya validado + la versión activa
 * que servirá como `expectedVersion` al publicar (0 sin publicaciones).
 * [297A-71] `draftRevision` presente cuando el borrador editable mandó sobre
 * la publicación: es el `expectedRevision` del próximo guardado. */
export interface LoadedGameMap {
  document: MapVersion;
  activeVersion: number;
  draftRevision?: number;
}

/** Envelope admin del borrador editable (Orval GameMapDraftPublic). */
export interface GameMapDraftPublic {
  mapId: string;
  revision: number;
  schemaVersion: number;
  contentHash: string;
  updatedAt: string;
  document: unknown;
}

/** Borrador cargado por el editor: documento validado + revisión optimista
 * para el siguiente guardado (0 si aún no existe borrador en el servidor). */
export interface LoadedGameMapDraft {
  document: MapVersion;
  revision: number;
}

export function isValidGameMapDraftPublic(value: unknown): value is GameMapDraftPublic {
  if (typeof value !== 'object' || value === null) return false;
  const envelope = value as Record<string, unknown>;
  const keys = Object.keys(envelope).sort();
  if (keys.join(',') !== 'contentHash,document,mapId,revision,schemaVersion,updatedAt') return false;
  return typeof envelope.mapId === 'string'
    && envelope.mapId.trim().length > 0
    && typeof envelope.revision === 'number' && Number.isInteger(envelope.revision) && envelope.revision > 0
    && envelope.schemaVersion === MAP_VERSION_SCHEMA
    && typeof envelope.contentHash === 'string' && envelope.contentHash.trim().length > 0
    && typeof envelope.updatedAt === 'string'
    && envelope.updatedAt.trim().length > 0;
}

/** Valida el envelope y el documento del borrador editable. */
export function parseDraftEnvelope(value: unknown): { envelope: GameMapDraftPublic; document: MapVersion; issues: readonly MapValidationIssue[] } | null {
  if (!isValidGameMapDraftPublic(value)) return null;
  const documentIssues = validateMapVersion(value.document);
  return { envelope: value, document: value.document as MapVersion, issues: documentIssues };
}

export function isValidGameMapVersionPublic(value: unknown): value is GameMapVersionPublic {
  if (typeof value !== 'object' || value === null) return false;
  const envelope = value as Record<string, unknown>;
  const keys = Object.keys(envelope).sort();
  if (keys.join(',') !== 'contentHash,document,mapId,publishedAt,schemaVersion,version') return false;
  return typeof envelope.mapId === 'string'
    && envelope.mapId.trim().length > 0
    && typeof envelope.version === 'number' && Number.isInteger(envelope.version) && envelope.version >= 0
    && envelope.schemaVersion === MAP_VERSION_SCHEMA
    && typeof envelope.contentHash === 'string' && envelope.contentHash.trim().length > 0
    && typeof envelope.publishedAt === 'string'
    && envelope.publishedAt.length > 0;
}

/** Valida el envelope y el documento del snapshot activo. */
export function parseActiveMapEnvelope(value: unknown): { envelope: GameMapVersionPublic; document: MapVersion; issues: readonly MapValidationIssue[] } | null {
  if (!isValidGameMapVersionPublic(value)) return null;
  const documentIssues = validateMapVersion(value.document);
  if (documentIssues.length > 0) return { envelope: value, document: value.document as MapVersion, issues: documentIssues };
  return { envelope: value, document: value.document as MapVersion, issues: [] };
}

export const GameMapAdminService = {
  /** Snapshot activo del mapa. `null` si no hay versión publicada (404). */
  async getActive(
    mapId: string,
    options?: { signal?: AbortSignal },
  ): Promise<LoadedGameMap | null> {
    const response = await generatedFetcher<GeneratedResponse<unknown>>(
      `/api/game/maps/${encodeURIComponent(mapId)}`,
      { method: 'GET', signal: options?.signal },
    );
    try {
      const payload = unwrapGeneratedResponse<unknown>(response, [200]);
      const parsed = parseActiveMapEnvelope(payload);
      if (!parsed) throw new Error('Envelope del mapa activo inválido');
      if (parsed.issues.length > 0) throw new Error(`Mapa activo inválido: ${parsed.issues[0].message}`);
      return { document: parsed.document, activeVersion: parsed.envelope.version };
    } catch (error) {
      /* 404 = todavía no hay publicación: el editor parte del fixture. */
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },

  /** Borrador editable del mapa. `null` si no hay borrador guardado (404). */
  async getDraft(
    mapId: string,
    options?: { signal?: AbortSignal },
  ): Promise<LoadedGameMapDraft | null> {
    const response = await generatedFetcher<GeneratedResponse<unknown>>(
      `/api/admin/game/maps/${encodeURIComponent(mapId)}/draft`,
      { method: 'GET', signal: options?.signal },
    );
    try {
      const payload = unwrapGeneratedResponse<unknown>(response, [200]);
      const parsed = parseDraftEnvelope(payload);
      if (!parsed) throw new Error('Envelope del borrador inválido');
      if (parsed.issues.length > 0) throw new Error(`Borrador inválido: ${parsed.issues[0].message}`);
      return { document: parsed.document, revision: parsed.envelope.revision };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },

  /** Guarda el borrador editable con revisión optimista. `expectedRevision`
   * debe coincidir con la revisión actual del servidor (0 para el primero);
   * 409 = otro editor guardó mientras tanto. */
  async saveDraft(
    document: MapVersion,
    expectedRevision: number,
    options?: { signal?: AbortSignal },
  ): Promise<GameMapDraftPublic> {
    const issues = validateMapVersion(document);
    if (issues.length > 0) {
      throw new Error(`MapVersion inválido: ${issues.map((issue) => `${issue.path} ${issue.message}`).join('; ')}`);
    }
    const response = await generatedFetcher<GeneratedResponse<unknown>>(
      `/api/admin/game/maps/${encodeURIComponent(document.id)}/draft`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision,
          mapId: document.id,
          document,
        }),
        signal: options?.signal,
      },
    );
    const payload = unwrapGeneratedResponse<unknown>(response, [200]);
    if (!isValidGameMapDraftPublic(payload)) {
      throw new Error('Respuesta de guardado de borrador inválida');
    }
    return payload;
  },

  /** Publica una nueva versión inmutable del mapa. `expectedVersion` debe
   * coincidir con la activa (0 para la primera publicación); 409 = conflicto. */
  async publish(
    document: MapVersion,
    expectedVersion: number,
    options?: { signal?: AbortSignal },
  ): Promise<GameMapVersionPublic> {
    const issues = validateMapVersion(document);
    if (issues.length > 0) {
      throw new Error(`MapVersion inválido: ${issues.map((issue) => `${issue.path} ${issue.message}`).join('; ')}`);
    }
    const response = await generatedFetcher<GeneratedResponse<unknown>>(
      '/api/admin/game/maps',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion,
          mapId: document.id,
          document,
        }),
        signal: options?.signal,
      },
    );
    const payload = unwrapGeneratedResponse<unknown>(response, [200]);
    if (!isValidGameMapVersionPublic(payload)) {
      throw new Error('Respuesta de publicación de mapa inválida');
    }
    return payload;
  },
};
