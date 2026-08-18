import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GameCharacterAdminService,
  isValidAdminId,
  isValidAdminLabel,
  isValidAdminEntry,
} from './game-character-admin.service';

function adminEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'forest-ranger',
    displayName: 'Guardabosques',
    bodyTone: 'ink',
    isActive: true,
    createdAt: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

describe('GameCharacterAdminService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the exact admin contract with state and creation date', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([adminEntry(), adminEntry({ id: 'hermit', isActive: false })]), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(GameCharacterAdminService.listAll()).resolves.toEqual([
      expect.objectContaining({ id: 'forest-ranger', isActive: true }),
      expect.objectContaining({ id: 'hermit', isActive: false }),
    ]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/admin/game/characters');
  });

  it('rejects malformed, extra-field, and wrong-tone admin entries', () => {
    expect(isValidAdminEntry(adminEntry())).toBe(true);
    expect(isValidAdminEntry(adminEntry({ script: 'alert(1)' }))).toBe(false);
    expect(isValidAdminEntry(adminEntry({ bodyTone: 'neon' }))).toBe(false);
    expect(isValidAdminEntry(adminEntry({ isActive: 'yes' }))).toBe(false);
    expect(isValidAdminEntry(adminEntry({ displayName: '  ' }))).toBe(false);
    expect(isValidAdminEntry(adminEntry({ id: 'Upper-Case' }))).toBe(false);
  });

  it('validates the admin id and label against the backend allowlist', () => {
    expect(isValidAdminId('forest-ranger')).toBe(true);
    expect(isValidAdminId('forest_ranger')).toBe(false);
    expect(isValidAdminId('A')).toBe(false);
    expect(isValidAdminId('x'.repeat(33))).toBe(false);
    expect(isValidAdminLabel('Guardabosques')).toBe(true);
    expect(isValidAdminLabel('linea\nnueva')).toBe(false);
    expect(isValidAdminLabel('x'.repeat(49))).toBe(false);
    expect(isValidAdminLabel('  ')).toBe(false);
  });

  it('creates via POST with the exact admin body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(adminEntry()), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await GameCharacterAdminService.create({
      id: 'forest-ranger',
      displayName: 'Guardabosques',
      bodyTone: 'middle',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/game/characters');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      id: 'forest-ranger',
      displayName: 'Guardabosques',
      bodyTone: 'middle',
    });
  });

  it('updates via PUT to the id path with state', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(adminEntry({ isActive: false })), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await GameCharacterAdminService.update('forest-ranger', {
      displayName: 'Retirado',
      bodyTone: 'paper',
      isActive: false,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/game/characters/forest-ranger');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({
      displayName: 'Retirado',
      bodyTone: 'paper',
      isActive: false,
    });
  });

  it('preserves the lifecycle abort signal on admin reads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await GameCharacterAdminService.listAll({ signal: controller.signal });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });
});
