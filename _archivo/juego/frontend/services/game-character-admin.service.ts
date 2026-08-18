/* GAME-01 — Gestión admin del catálogo de personajes del Bosque.
 * Listado completo (activas e inactivas), alta y actualización de las
 * opciones allowlisted. Solo invocable con sesión admin: la frontera 401/403
 * la resuelve el backend vía `AdminUser` + CSRF (el transporte compartido
 * adjunta la cookie y el header en mutaciones). El catálogo público sigue
 * viviendo en GameCharacterService. */

import { generatedFetcher, unwrapGeneratedResponse, type GeneratedResponse } from '../api/client';
import type { GameCharacterDefinition } from '../api/types';

/** Entrada completa del catálogo, visible solo para admin: incluye el estado
 * (activa/inactiva) y la fecha de creación que el contrato público oculta. */
export interface GameCharacterAdminEntry extends GameCharacterDefinition {
  isActive: boolean;
  createdAt: string;
}

export interface CreateAdminCharacterInput {
  id: string;
  displayName: string;
  bodyTone: GameCharacterDefinition['bodyTone'];
}

export interface UpdateAdminCharacterInput {
  displayName: string;
  bodyTone: GameCharacterDefinition['bodyTone'];
  isActive: boolean;
}

const validTones = new Set<GameCharacterDefinition['bodyTone']>(['ink', 'middle', 'paper']);

const ID_PATTERN = /^[a-z0-9-]{1,32}$/;

const MAX_LABEL_CHARS = 48;

export function isValidAdminId(id: string): boolean {
  return ID_PATTERN.test(id);
}

/** Mismo contrato que el backend: 1–48 caracteres, sin controles. */
export function isValidAdminLabel(label: string): boolean {
  const trimmed = label.trim();
  if (trimmed !== label || trimmed.length === 0) return false;
  if (Array.from(trimmed).length > MAX_LABEL_CHARS) return false;
  return !Array.from(trimmed).some((character) => /\p{Cc}/u.test(character));
}

export function isValidAdminEntry(value: unknown): value is GameCharacterAdminEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  const keys = Object.keys(entry).sort();
  if (keys.join(',') !== 'bodyTone,createdAt,displayName,id,isActive') return false;
  return typeof entry.id === 'string'
    && ID_PATTERN.test(entry.id)
    && typeof entry.displayName === 'string'
    && isValidAdminLabel(entry.displayName)
    && typeof entry.bodyTone === 'string'
    && validTones.has(entry.bodyTone as GameCharacterDefinition['bodyTone'])
    && typeof entry.isActive === 'boolean'
    && typeof entry.createdAt === 'string';
}

export const GameCharacterAdminService = {
  async listAll(options?: { signal?: AbortSignal }): Promise<GameCharacterAdminEntry[]> {
    const response = await generatedFetcher<GeneratedResponse<unknown>>(
      '/api/admin/game/characters',
      { method: 'GET', signal: options?.signal },
    );
    const payload = unwrapGeneratedResponse<unknown>(response, [200]);
    if (!Array.isArray(payload) || !payload.every(isValidAdminEntry)) {
      throw new Error('Catálogo admin inválido');
    }
    return payload;
  },

  async create(
    input: CreateAdminCharacterInput,
    options?: { signal?: AbortSignal },
  ): Promise<GameCharacterAdminEntry> {
    const response = await generatedFetcher<GeneratedResponse<unknown>>(
      '/api/admin/game/characters',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: options?.signal,
      },
    );
    const payload = unwrapGeneratedResponse<unknown>(response, [200]);
    if (!isValidAdminEntry(payload)) {
      throw new Error('Respuesta de creación inválida');
    }
    return payload;
  },

  async update(
    id: string,
    input: UpdateAdminCharacterInput,
    options?: { signal?: AbortSignal },
  ): Promise<GameCharacterAdminEntry> {
    const response = await generatedFetcher<GeneratedResponse<unknown>>(
      `/api/admin/game/characters/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: options?.signal,
      },
    );
    const payload = unwrapGeneratedResponse<unknown>(response, [200]);
    if (!isValidAdminEntry(payload)) {
      throw new Error('Respuesta de actualización inválida');
    }
    return payload;
  },
};
