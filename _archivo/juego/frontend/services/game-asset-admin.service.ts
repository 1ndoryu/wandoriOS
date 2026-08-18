/* GAME-01 — Gestión admin del catálogo de assets del Bosque.
 * Listado completo (activas e inactivas), alta y actualización de las
 * opciones allowlisted del catálogo de assets. Solo invocable con sesión
 * admin: la frontera 401/403 la resuelve el backend vía `AdminUser` + CSRF.
 * [297A-61] Replica el patrón de GameCharacterAdminService con el contrato
 * de 297A-60 (categorías del mapa, id máx 48, etiqueta máx 64). */

import { generatedFetcher, unwrapGeneratedResponse, type GeneratedResponse } from '../api/client';

/** Categorías del contrato del mapa (assetVersionId -> category). */
export const GAME_ASSET_CATEGORIES: ReadonlyArray<string> = [
  'terrain',
  'tree',
  'rock',
  'water',
  'character',
  'generic',
];

/** Entrada completa del catálogo, visible solo para admin: incluye el estado
 * (activa/inactiva) y la fecha de creación que el contrato público oculta. */
export interface GameAssetAdminEntry {
  id: string;
  displayName: string;
  category: string;
  isActive: boolean;
  createdAt: string;
}

export interface CreateAdminAssetInput {
  id: string;
  displayName: string;
  category: string;
}

export interface UpdateAdminAssetInput {
  displayName: string;
  category: string;
  isActive: boolean;
}

/* === Assets 3D — versiones ([297A-72]/[297A-73]) ===
 * Contratos admin de las versiones de un asset (GLB inmutable por hash).
 * El panel admin las importa, lista, edita metadata (no activas), activa y
 * descarga el binario para el preview 3D; el runtime solo consume el
 * contrato público de la versión activa. */

export interface GameAssetVersionProxy {
  kind: 'circle' | 'aabb';
  radius?: number;
  halfWidth?: number;
  halfDepth?: number;
}

export interface GameAssetVersionAdminEntry {
  assetId: string;
  version: number;
  contentHash: string;
  byteSize: number;
  kind: string;
  category: string;
  proxy: GameAssetVersionProxy | null;
  scale: number;
  isActive: boolean;
  createdAt: string;
}

export interface UpdateGameAssetVersionInput {
  proxy: GameAssetVersionProxy | null;
  scale: number;
}

export const GAME_ASSET_GLB_MAX_BYTES = 16 * 1024 * 1024;

export function isValidGameAssetVersionProxy(value: unknown): value is GameAssetVersionProxy {
  if (typeof value !== 'object' || value === null) return false;
  const proxy = value as Record<string, unknown>;
  if (proxy.kind !== 'circle' && proxy.kind !== 'aabb') return false;
  if (proxy.kind === 'circle') {
    if (Object.keys(proxy).sort().join(',') !== 'kind,radius') return false;
    return typeof proxy.radius === 'number' && Number.isFinite(proxy.radius) && proxy.radius > 0;
  }
  if (Object.keys(proxy).sort().join(',') !== 'halfDepth,halfWidth,kind') return false;
  return typeof proxy.halfWidth === 'number'
    && Number.isFinite(proxy.halfWidth)
    && proxy.halfWidth > 0
    && typeof proxy.halfDepth === 'number'
    && Number.isFinite(proxy.halfDepth)
    && proxy.halfDepth > 0;
}

export function isValidGameAssetVersionAdminEntry(
  value: unknown,
): value is GameAssetVersionAdminEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  const keys = Object.keys(entry).sort();
  if (
    keys.join(',') !== 'assetId,byteSize,category,contentHash,createdAt,isActive,kind,proxy,scale,version'
  ) {
    return false;
  }
  return typeof entry.assetId === 'string'
    && isValidAdminAssetId(entry.assetId)
    && typeof entry.version === 'number'
    && Number.isInteger(entry.version)
    && entry.version > 0
    && typeof entry.contentHash === 'string'
    && entry.contentHash.length > 0
    && typeof entry.byteSize === 'number'
    && Number.isInteger(entry.byteSize)
    && entry.byteSize > 0
    && typeof entry.kind === 'string'
    && typeof entry.category === 'string'
    && isValidAdminAssetCategory(entry.category)
    && (entry.proxy === null || isValidGameAssetVersionProxy(entry.proxy))
    && typeof entry.scale === 'number'
    && Number.isFinite(entry.scale)
    && typeof entry.isActive === 'boolean'
    && typeof entry.createdAt === 'string';
}

export function isValidUpdateGameAssetVersionInput(value: unknown): value is UpdateGameAssetVersionInput {
  if (typeof value !== 'object' || value === null) return false;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join(',') !== 'proxy,scale') return false;
  if (typeof input.scale !== 'number' || !Number.isFinite(input.scale)) return false;
  if (input.scale < 0.1 || input.scale > 4) return false;
  return input.proxy === null || isValidGameAssetVersionProxy(input.proxy);
}

const ID_PATTERN = /^[a-z0-9-]{1,48}$/;

const MAX_LABEL_CHARS = 64;

export function isValidAdminAssetId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/** Mismo contrato que el backend: 1–64 caracteres, sin controles. */
export function isValidAdminAssetLabel(label: string): boolean {
  const trimmed = label.trim();
  if (trimmed !== label || trimmed.length === 0) return false;
  if (Array.from(trimmed).length > MAX_LABEL_CHARS) return false;
  return !Array.from(trimmed).some((character) => /\p{Cc}/u.test(character));
}

export function isValidAdminAssetCategory(category: string): boolean {
  return GAME_ASSET_CATEGORIES.includes(category);
}

export function isValidAdminAssetEntry(value: unknown): value is GameAssetAdminEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  const keys = Object.keys(entry).sort();
  if (keys.join(',') !== 'category,createdAt,displayName,id,isActive') return false;
  return typeof entry.id === 'string'
    && ID_PATTERN.test(entry.id)
    && typeof entry.displayName === 'string'
    && isValidAdminAssetLabel(entry.displayName)
    && typeof entry.category === 'string'
    && isValidAdminAssetCategory(entry.category)
    && typeof entry.isActive === 'boolean'
    && typeof entry.createdAt === 'string';
}

export const GameAssetAdminService = {
  async listAll(options?: { signal?: AbortSignal }): Promise<GameAssetAdminEntry[]> {
    const response = await generatedFetcher<GeneratedResponse<unknown>>(
      '/api/admin/game/assets',
      { method: 'GET', signal: options?.signal },
    );
    const payload = unwrapGeneratedResponse<unknown>(response, [200]);
    if (!Array.isArray(payload) || !payload.every(isValidAdminAssetEntry)) {
      throw new Error('Catálogo admin de assets inválido');
    }
    return payload;
  },

  async create(
    input: CreateAdminAssetInput,
    options?: { signal?: AbortSignal },
  ): Promise<GameAssetAdminEntry> {
    const response = await generatedFetcher<GeneratedResponse<unknown>>(
      '/api/admin/game/assets',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: options?.signal,
      },
    );
    const payload = unwrapGeneratedResponse<unknown>(response, [200]);
    if (!isValidAdminAssetEntry(payload)) {
      throw new Error('Respuesta de creación inválida');
    }
    return payload;
  },

  async update(
    id: string,
    input: UpdateAdminAssetInput,
    options?: { signal?: AbortSignal },
  ): Promise<GameAssetAdminEntry> {
    const response = await generatedFetcher<GeneratedResponse<unknown>>(
      `/api/admin/game/assets/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: options?.signal,
      },
    );
    const payload = unwrapGeneratedResponse<unknown>(response, [200]);
    if (!isValidAdminAssetEntry(payload)) {
      throw new Error('Respuesta de actualización inválida');
    }
    return payload;
  },

  /* === Assets 3D — versiones === */

  async listVersions(
    id: string,
    options?: { signal?: AbortSignal },
  ): Promise<GameAssetVersionAdminEntry[]> {
    const response = await generatedFetcher<GeneratedResponse<unknown>>(
      `/api/admin/game/assets/${encodeURIComponent(id)}/versions`,
      { method: 'GET', signal: options?.signal },
    );
    const payload = unwrapGeneratedResponse<unknown>(response, [200]);
    if (!Array.isArray(payload) || !payload.every(isValidGameAssetVersionAdminEntry)) {
      throw new Error('Listado de versiones inválido');
    }
    return payload;
  },

  /** Importa un GLB como nueva versión (inactiva) vía multipart. */
  async importVersion(
    id: string,
    file: File | Blob,
    options?: { signal?: AbortSignal },
  ): Promise<GameAssetVersionAdminEntry> {
    const body = new FormData();
    body.append('file', file, 'asset.glb');
    const response = await generatedFetcher<GeneratedResponse<unknown>>(
      `/api/admin/game/assets/${encodeURIComponent(id)}/versions`,
      { method: 'POST', body, signal: options?.signal },
    );
    const payload = unwrapGeneratedResponse<unknown>(response, [200]);
    if (!isValidGameAssetVersionAdminEntry(payload)) {
      throw new Error('Respuesta de importación inválida');
    }
    return payload;
  },

  /** Actualiza proxy/scale de una versión AÚN NO ACTIVA (409 si está activa). */
  async updateVersionMetadata(
    id: string,
    version: number,
    input: UpdateGameAssetVersionInput,
    options?: { signal?: AbortSignal },
  ): Promise<GameAssetVersionAdminEntry> {
    if (!isValidUpdateGameAssetVersionInput(input)) {
      throw new Error('Metadata de versión inválida');
    }
    const response = await generatedFetcher<GeneratedResponse<unknown>>(
      `/api/admin/game/assets/${encodeURIComponent(id)}/versions/${version}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: options?.signal,
      },
    );
    const payload = unwrapGeneratedResponse<unknown>(response, [200]);
    if (!isValidGameAssetVersionAdminEntry(payload)) {
      throw new Error('Respuesta de metadata inválida');
    }
    return payload;
  },

  /** Activa una versión (desactiva las demás; queda inmutable). */
  async activateVersion(
    id: string,
    version: number,
    options?: { signal?: AbortSignal },
  ): Promise<GameAssetVersionAdminEntry> {
    const response = await generatedFetcher<GeneratedResponse<unknown>>(
      `/api/admin/game/assets/${encodeURIComponent(id)}/versions/${version}/activate`,
      { method: 'PUT', signal: options?.signal },
    );
    const payload = unwrapGeneratedResponse<unknown>(response, [200]);
    if (!isValidGameAssetVersionAdminEntry(payload)) {
      throw new Error('Respuesta de activación inválida');
    }
    return payload;
  },

  /** GLB binario de una versión para el preview 3D (solo admin).
   * [297A-73] Se lee con fetch directo (la frontera generada parsea texto/JSON
   * y corrompería el binario); GET no requiere CSRF, solo cookie de sesión. */
  async readVersionFile(
    id: string,
    version: number,
    options?: { signal?: AbortSignal },
  ): Promise<Blob> {
    const base = (import.meta.env.VITE_API_URL as string | undefined) || '';
    const response = await fetch(
      `${base}/api/admin/game/assets/${encodeURIComponent(id)}/versions/${version}/file`,
      { credentials: 'include', signal: options?.signal },
    );
    if (!response.ok) {
      throw new Error('No se pudo leer el GLB de la versión');
    }
    return response.blob();
  },
};
