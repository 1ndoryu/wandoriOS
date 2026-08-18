/* GAME-01 — Servicio de perfil persistente del Bosque.
 * Solo transporta el contrato autenticado; no conoce la escena ni el loop de
 * render. Los invitados reciben 401 y el consumidor decide el fallback local. */

import { generatedFetcher, unwrapGeneratedResponse, type GeneratedResponse } from '../api/client';
import type { GameProfile } from '../api/types';

const MAX_DISPLAY_NAME_CHARS = 24;

export function isValidDisplayName(displayName: string): boolean {
  const trimmed = displayName.trim();
  if (trimmed !== displayName || trimmed.length === 0) return false;
  if (Array.from(trimmed).length > MAX_DISPLAY_NAME_CHARS) return false;
  return !Array.from(trimmed).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return /\p{Cc}/u.test(character)
      || (codePoint === 0x061c
        || (codePoint >= 0x200b && codePoint <= 0x200f)
        || (codePoint >= 0x202a && codePoint <= 0x202e)
        || (codePoint >= 0x2060 && codePoint <= 0x2064)
        || (codePoint >= 0x2066 && codePoint <= 0x206f)
        || codePoint === 0xfeff);
  });
}

function isValidGameProfile(value: unknown): value is GameProfile {
  if (typeof value !== 'object' || value === null) return false;
  const profile = value as Record<string, unknown>;
  const keys = Object.keys(profile).sort();
  if (keys.join(',') !== 'characterId,displayName,revision,updatedAt') return false;
  return typeof profile.displayName === 'string'
    && isValidDisplayName(profile.displayName)
    && typeof profile.characterId === 'string'
    && /^[a-z0-9-]{1,32}$/.test(profile.characterId)
    && typeof profile.revision === 'number'
    && Number.isInteger(profile.revision)
    && profile.revision >= 0
    && typeof profile.updatedAt === 'string';
}

export interface UpdateGameProfileInput {
  displayName: string;
  characterId: string;
  /** Revisión que el cliente leyó antes de editar (conflicto → 409). */
  expectedRevision: number;
}

export const GameProfileService = {
  async get(options?: { signal?: AbortSignal }): Promise<GameProfile> {
    const response = await generatedFetcher<GeneratedResponse<unknown>>(
      '/api/game/profile',
      { method: 'GET', signal: options?.signal },
    );
    const profile = unwrapGeneratedResponse<unknown>(response, [200]);
    if (!isValidGameProfile(profile)) {
      throw new Error('Respuesta de perfil de juego inválida');
    }
    return profile;
  },

  /* [297A-54] Guarda el personaje elegido y el nombre visible con revisión
   * optimista; solo cuentas autenticadas (el backend devuelve 401 al invitado
   * y la frontera CSRF la resuelve el transporte compartido). */
  async update(
    input: UpdateGameProfileInput,
    options?: { signal?: AbortSignal },
  ): Promise<GameProfile> {
    const response = await generatedFetcher<GeneratedResponse<unknown>>(
      '/api/game/profile',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: options?.signal,
      },
    );
    const profile = unwrapGeneratedResponse<unknown>(response, [200]);
    if (!isValidGameProfile(profile)) {
      throw new Error('Respuesta de perfil de juego inválida');
    }
    return profile;
  },
};

export { isValidGameProfile };
