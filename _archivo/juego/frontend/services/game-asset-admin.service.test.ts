import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GameAssetAdminService,
  isValidAdminAssetId,
  isValidAdminAssetLabel,
  isValidAdminAssetCategory,
  isValidAdminAssetEntry,
  isValidGameAssetVersionAdminEntry,
  isValidGameAssetVersionProxy,
  isValidUpdateGameAssetVersionInput,
  GAME_ASSET_CATEGORIES,
} from './game-asset-admin.service';

function assetEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'oak',
    displayName: 'Roble',
    category: 'tree',
    isActive: true,
    createdAt: '2026-08-02T00:00:00Z',
    ...overrides,
  };
}

describe('GameAssetAdminService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the exact admin contract with state and creation date', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([assetEntry(), assetEntry({ id: 'pond', category: 'water', isActive: false })]), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(GameAssetAdminService.listAll()).resolves.toEqual([
      expect.objectContaining({ id: 'oak', isActive: true }),
      expect.objectContaining({ id: 'pond', category: 'water', isActive: false }),
    ]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/admin/game/assets');
  });

  it('rejects malformed, extra-field, and wrong-category admin entries', () => {
    expect(isValidAdminAssetEntry(assetEntry())).toBe(true);
    expect(isValidAdminAssetEntry(assetEntry({ script: 'alert(1)' }))).toBe(false);
    expect(isValidAdminAssetEntry(assetEntry({ category: 'bridge' }))).toBe(false);
    expect(isValidAdminAssetEntry(assetEntry({ isActive: 'yes' }))).toBe(false);
    expect(isValidAdminAssetEntry(assetEntry({ displayName: '  ' }))).toBe(false);
    expect(isValidAdminAssetEntry(assetEntry({ id: 'Upper-Case' }))).toBe(false);
  });

  it('validates id, label and category against the backend allowlist', () => {
    expect(isValidAdminAssetId('oak')).toBe(true);
    expect(isValidAdminAssetId('oak_tree')).toBe(false);
    expect(isValidAdminAssetId('A')).toBe(false);
    expect(isValidAdminAssetId('x'.repeat(49))).toBe(false);
    expect(isValidAdminAssetLabel('Roble')).toBe(true);
    expect(isValidAdminAssetLabel('linea\nnueva')).toBe(false);
    expect(isValidAdminAssetLabel('x'.repeat(65))).toBe(false);
    expect(isValidAdminAssetLabel('  ')).toBe(false);
    expect(isValidAdminAssetCategory('terrain')).toBe(true);
    expect(isValidAdminAssetCategory('tree')).toBe(true);
    expect(isValidAdminAssetCategory('rock')).toBe(true);
    expect(isValidAdminAssetCategory('water')).toBe(true);
    expect(isValidAdminAssetCategory('character')).toBe(true);
    expect(isValidAdminAssetCategory('generic')).toBe(true);
    expect(isValidAdminAssetCategory('sky')).toBe(false);
    expect(GAME_ASSET_CATEGORIES).toEqual(['terrain', 'tree', 'rock', 'water', 'character', 'generic']);
  });

  it('creates via POST with the exact admin body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(assetEntry()), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await GameAssetAdminService.create({
      id: 'oak',
      displayName: 'Roble',
      category: 'tree',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/game/assets');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      id: 'oak',
      displayName: 'Roble',
      category: 'tree',
    });
  });

  it('updates via PUT to the id path with state', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(assetEntry({ isActive: false })), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await GameAssetAdminService.update('oak', {
      displayName: 'Roble seco',
      category: 'tree',
      isActive: false,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/game/assets/oak');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({
      displayName: 'Roble seco',
      category: 'tree',
      isActive: false,
    });
  });

  it('preserves the lifecycle abort signal on admin reads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await GameAssetAdminService.listAll({ signal: controller.signal });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });

  /* === Assets 3D — versiones === */

  it('validates version entries, proxies and metadata input', () => {
    expect(isValidGameAssetVersionProxy({ kind: 'circle', radius: 0.5 })).toBe(true);
    expect(isValidGameAssetVersionProxy({ kind: 'aabb', halfWidth: 1, halfDepth: 2 })).toBe(true);
    expect(isValidGameAssetVersionProxy({ kind: 'circle' })).toBe(false);
    expect(isValidGameAssetVersionProxy({ kind: 'aabb', halfWidth: 1 })).toBe(false);
    expect(isValidGameAssetVersionProxy({ kind: 'casa', radius: 1 })).toBe(false);
    expect(isValidGameAssetVersionProxy({ kind: 'circle', radius: -1 })).toBe(false);
    expect(isValidGameAssetVersionProxy({ kind: 'circle', radius: 0.5, extra: true })).toBe(false);
    expect(
      isValidUpdateGameAssetVersionInput({ proxy: { kind: 'circle', radius: 0.5 }, scale: 1.5 }),
    ).toBe(true);
    expect(isValidUpdateGameAssetVersionInput({ proxy: null, scale: 1 })).toBe(true);
    expect(isValidUpdateGameAssetVersionInput({ proxy: null, scale: 5 })).toBe(false);
    expect(isValidUpdateGameAssetVersionInput({ proxy: { kind: 'casa' }, scale: 1 })).toBe(false);
    expect(isValidUpdateGameAssetVersionInput({ scale: 1 })).toBe(false);
  });

  it('rejects malformed version admin entries', () => {
    const base = {
      assetId: 'oak',
      version: 1,
      contentHash: 'abc',
      byteSize: 12,
      kind: 'glb',
      category: 'tree',
      proxy: null,
      scale: 1,
      isActive: false,
      createdAt: '2026-08-02T00:00:00Z',
    };
    expect(isValidGameAssetVersionAdminEntry(base)).toBe(true);
    expect(isValidGameAssetVersionAdminEntry({ ...base, storagePath: 'assets/x.glb' })).toBe(false);
    expect(isValidGameAssetVersionAdminEntry({ ...base, version: 0 })).toBe(false);
    expect(isValidGameAssetVersionAdminEntry({ ...base, category: 'sky' })).toBe(false);
    expect(isValidGameAssetVersionAdminEntry({ ...base, proxy: { kind: 'casa' } })).toBe(false);
    expect(isValidGameAssetVersionAdminEntry({ ...base, byteSize: -3 })).toBe(false);
  });

  it('lists versions from the admin endpoint', async () => {
    const version = {
      assetId: 'oak',
      version: 2,
      contentHash: 'hash-2',
      byteSize: 24,
      kind: 'glb',
      category: 'tree',
      proxy: null,
      scale: 1.25,
      isActive: true,
      createdAt: '2026-08-02T00:00:00Z',
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([version]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(GameAssetAdminService.listVersions('oak')).resolves.toEqual([
      expect.objectContaining({ version: 2, isActive: true }),
    ]);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('/api/admin/game/assets/oak/versions');
  });

  function fullVersion(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      assetId: 'oak',
      version: 1,
      contentHash: 'hash-1',
      byteSize: 12,
      kind: 'glb',
      category: 'tree',
      proxy: null,
      scale: 1,
      isActive: false,
      createdAt: '2026-08-02T00:00:00Z',
      ...overrides,
    };
  }

  it('imports a GLB via multipart FormData', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(fullVersion()), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const glb = new Blob([new Uint8Array([0x67, 0x6c, 0x54, 0x46])], { type: 'model/gltf-binary' });
    await GameAssetAdminService.importVersion('oak', glb);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('updates metadata and activates versions via PUT', async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify(fullVersion()), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await GameAssetAdminService.updateVersionMetadata('oak', 1, {
      proxy: { kind: 'circle', radius: 0.5 },
      scale: 1.5,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/game/assets/oak/versions/1');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({
      proxy: { kind: 'circle', radius: 0.5 },
      scale: 1.5,
    });

    await GameAssetAdminService.activateVersion('oak', 1);
    const [activateUrl, activateInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(activateUrl).toBe('/api/admin/game/assets/oak/versions/1/activate');
    expect(activateInit.method).toBe('PUT');
  });

  it('reads the GLB binary via direct fetch (no JSON envelope)', async () => {
    const bytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(bytes.buffer as ArrayBuffer, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await GameAssetAdminService.readVersionFile('oak', 1);
    expect(result.size).toBeGreaterThan(0);
    const header = new Uint8Array(await result.arrayBuffer());
    expect([...header.slice(0, 4)]).toEqual([0x67, 0x6c, 0x54, 0x46]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/game/assets/oak/versions/1/file');
    expect(init.credentials).toBe('include');
  });
});
