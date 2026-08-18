/* GAME-01 — Catálogo activo de personajes del Bosque.
 * Solo devuelve opciones visuales allowlisted; la edición del catálogo es admin
 * y queda fuera de este bloque. */

import { generatedFetcher, unwrapGeneratedResponse, type GeneratedResponse } from '../api/client';
import type { GameCharacterDefinition } from '../api/types';

const validTones = new Set<GameCharacterDefinition['bodyTone']>(['ink', 'middle', 'paper']);

function isValidCharacter(value: unknown): value is GameCharacterDefinition {
  if (typeof value !== 'object' || value === null) return false;
  const character = value as Record<string, unknown>;
  const keys = Object.keys(character).sort();
  if (keys.join(',') !== 'bodyTone,displayName,id') return false;
  return typeof character.id === 'string'
    && /^[a-z0-9-]{1,32}$/.test(character.id)
    && typeof character.displayName === 'string'
    && character.displayName.trim() === character.displayName
    && character.displayName.length > 0
    && typeof character.bodyTone === 'string'
    && validTones.has(character.bodyTone as GameCharacterDefinition['bodyTone'])
    && typeof character.bodyTone === 'string';
}

export const GameCharacterService = {
  async list(options?: { signal?: AbortSignal }): Promise<GameCharacterDefinition[]> {
    const response = await generatedFetcher<GeneratedResponse<unknown>>(
      '/api/game/characters',
      { method: 'GET', signal: options?.signal },
    );
    const payload = unwrapGeneratedResponse<unknown>(response, [200]);
    if (!Array.isArray(payload) || payload.length === 0 || !payload.every(isValidCharacter)) {
      throw new Error('Catálogo de personajes inválido');
    }
    return payload;
  },
};

export { isValidCharacter };
