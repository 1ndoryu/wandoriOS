import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameAuditService, isValidAuditEvent } from './game-audit.service';

function auditEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 7,
    actorKind: 'admin',
    action: 'character.created',
    entityKind: 'character',
    entityId: 'forest-ranger',
    payload: { displayName: 'Guardabosques', bodyTone: 'middle', isActive: true },
    createdAt: '2026-08-02T00:00:00Z',
    ...overrides,
  };
}

/* [297A-59] Evento de publicación de mapa (payload acotado del backend). */
function mapAuditEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 9,
    actorKind: 'admin',
    action: 'map.published',
    entityKind: 'map',
    entityId: 'bosque',
    payload: { schemaVersion: 3, contentHash: 'abc' },
    createdAt: '2026-08-02T10:00:00Z',
    ...overrides,
  };
}

/* [297A-61] Evento de catálogo de assets (payload con displayName/category). */
function assetAuditEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 11,
    actorKind: 'admin',
    action: 'asset.created',
    entityKind: 'asset',
    entityId: 'oak',
    payload: { displayName: 'Roble', category: 'tree', isActive: true },
    createdAt: '2026-08-02T12:00:00Z',
    ...overrides,
  };
}

describe('GameAuditService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the exact admin audit contract with query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([auditEvent(), auditEvent({ action: 'character.updated', id: 8 })]), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(GameAuditService.listCharacterEvents({ entityId: 'forest-ranger', limit: 10 })).resolves.toEqual([
      expect.objectContaining({ id: 7, action: 'character.created' }),
      expect.objectContaining({ id: 8, action: 'character.updated' }),
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/game/audit/characters?entityId=forest-ranger&limit=10');
    expect(init.method).toBe('GET');
  });

  it('builds the URL without query when no filters are given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await GameAuditService.listCharacterEvents();
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/game/audit/characters');
  });

  it('rejects unknown actions, extra fields and malformed payloads', () => {
    expect(isValidAuditEvent(auditEvent())).toBe(true);
    expect(isValidAuditEvent(auditEvent({ action: 'character.deleted' }))).toBe(false);
    expect(isValidAuditEvent(auditEvent({ actorKind: 'root' }))).toBe(false);
    expect(isValidAuditEvent(auditEvent({ script: 'alert(1)' }))).toBe(false);
    expect(isValidAuditEvent(auditEvent({ payload: 'x' }))).toBe(false);
    expect(isValidAuditEvent(auditEvent({ id: '7' }))).toBe(false);
  });

  it('preserves the lifecycle abort signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await GameAuditService.listCharacterEvents({ signal: controller.signal });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });

  it('loads map publish events from the maps audit endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([mapAuditEvent(), mapAuditEvent({ id: 10 })]), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(GameAuditService.listMapEvents({ limit: 10 })).resolves.toEqual([
      expect.objectContaining({ id: 9, action: 'map.published', entityKind: 'map' }),
      expect.objectContaining({ id: 10 }),
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/game/audit/maps?limit=10');
    expect(init.method).toBe('GET');
  });

  it('keeps map events in the shared validator and rejects mismatched pairs', () => {
    expect(isValidAuditEvent(mapAuditEvent())).toBe(true);
    expect(isValidAuditEvent(mapAuditEvent({ action: 'map.deleted' }))).toBe(false);
    expect(isValidAuditEvent(mapAuditEvent({ entityKind: 'character' }))).toBe(false);
    expect(isValidAuditEvent(auditEvent({ action: 'map.published' }))).toBe(false);
  });

  it('preserves the abort signal on map events too', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await GameAuditService.listMapEvents({ signal: controller.signal });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });

  it('loads asset catalog events from the assets audit endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([assetAuditEvent(), assetAuditEvent({ action: 'asset.updated', id: 12 })]), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(GameAuditService.listAssetEvents({ entityId: 'oak', limit: 10 })).resolves.toEqual([
      expect.objectContaining({ id: 11, action: 'asset.created', entityKind: 'asset' }),
      expect.objectContaining({ id: 12, action: 'asset.updated' }),
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/game/audit/assets?entityId=oak&limit=10');
    expect(init.method).toBe('GET');
  });

  it('keeps asset events in the shared validator and rejects mismatched pairs', () => {
    expect(isValidAuditEvent(assetAuditEvent())).toBe(true);
    expect(isValidAuditEvent(assetAuditEvent({ action: 'asset.deleted' }))).toBe(false);
    expect(isValidAuditEvent(assetAuditEvent({ entityKind: 'character' }))).toBe(false);
    expect(isValidAuditEvent(auditEvent({ action: 'asset.created' }))).toBe(false);
  });

  it('preserves the abort signal on asset events too', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await GameAuditService.listAssetEvents({ signal: controller.signal });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });
});
