import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GameMapAdminService,
  GAME_MAP_ID,
  isValidGameMapDraftPublic,
  isValidGameMapVersionPublic,
  parseActiveMapEnvelope,
} from './game-map-admin.service';
import { FIXTURE_MAP_VERSION } from '../features/desktop/apps/game-playable/game-fixture-map';

function envelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    mapId: 'bosque',
    version: 3,
    schemaVersion: 1,
    contentHash: 'sha256:abc',
    publishedAt: '2026-08-02T00:00:00Z',
    document: FIXTURE_MAP_VERSION,
    ...overrides,
  };
}

describe('GameMapAdminService (297A-64)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('usa el id canónico del mapa del Bosque', () => {
    expect(GAME_MAP_ID).toBe('bosque');
  });

  it('valida el envelope público estricto (sin campos extra)', () => {
    expect(isValidGameMapVersionPublic(envelope())).toBe(true);
    expect(isValidGameMapVersionPublic(envelope({ secret: 1 }))).toBe(false);
    expect(isValidGameMapVersionPublic(envelope({ version: -1 }))).toBe(false);
    expect(isValidGameMapVersionPublic(envelope({ schemaVersion: 2 }))).toBe(false);
    expect(isValidGameMapVersionPublic(envelope({ contentHash: '  ' }))).toBe(false);
  });

  it('parsea el envelope y el documento validado del snapshot activo', () => {
    const parsed = parseActiveMapEnvelope(envelope());
    expect(parsed).not.toBeNull();
    expect(parsed?.envelope.version).toBe(3);
    expect(parsed?.document.id).toBe('fixture-bosque-v1');
    expect(parsed?.issues).toEqual([]);
  });

  it('rechaza un documento del snapshot que no pasa el contrato', () => {
    const broken = envelope({ document: { ...FIXTURE_MAP_VERSION, schemaVersion: 99 } });
    const parsed = parseActiveMapEnvelope(broken);
    expect(parsed?.issues.length).toBeGreaterThan(0);
  });

  it('devuelve null ante 404 (aún no hay mapa publicado)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'not_found' }), { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(GameMapAdminService.getActive('bosque')).resolves.toBeNull();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/game/maps/bosque');
    expect(init.method).toBe('GET');
  });

  it('carga el snapshot activo validando el documento', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(envelope({ version: 5 })), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const loaded = await GameMapAdminService.getActive('bosque');
    expect(loaded?.activeVersion).toBe(5);
    expect(loaded?.document.id).toBe('fixture-bosque-v1');
  });

  it('publica con expectedVersion y document exactos', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(envelope({ version: 4 })), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await GameMapAdminService.publish(FIXTURE_MAP_VERSION, 3);
    expect(result.version).toBe(4);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/game/maps');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.expectedVersion).toBe(3);
    expect((body.document as Record<string, unknown>).id).toBe('fixture-bosque-v1');
  });

  it('rechaza publicar un documento inválido sin llamar a la red', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const broken = { ...FIXTURE_MAP_VERSION, schemaVersion: 99 as never };
    await expect(GameMapAdminService.publish(broken, 0)).rejects.toThrow(/inválido/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserva el abort signal en lecturas', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(envelope()), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await GameMapAdminService.getActive('bosque', { signal: controller.signal });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });
});

describe('GameMapAdminService draft (297A-71)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function draftEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      mapId: 'bosque',
      revision: 4,
      schemaVersion: 1,
      contentHash: 'sha256:abc',
      updatedAt: '2026-08-03T00:00:00Z',
      document: FIXTURE_MAP_VERSION,
      ...overrides,
    };
  }

  it('valida el envelope del borrador estricto (sin campos extra)', () => {
    expect(isValidGameMapDraftPublic(draftEnvelope())).toBe(true);
    expect(isValidGameMapDraftPublic(draftEnvelope({ secret: 1 }))).toBe(false);
    expect(isValidGameMapDraftPublic(draftEnvelope({ revision: 0 }))).toBe(false);
    expect(isValidGameMapDraftPublic(draftEnvelope({ revision: -1 }))).toBe(false);
    expect(isValidGameMapDraftPublic(draftEnvelope({ updatedAt: '  ' }))).toBe(false);
  });

  it('carga el borrador validando el documento', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(draftEnvelope()), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const loaded = await GameMapAdminService.getDraft('bosque');
    expect(loaded?.revision).toBe(4);
    expect(loaded?.document.id).toBe('fixture-bosque-v1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/game/maps/bosque/draft');
    expect(init.method).toBe('GET');
  });

  it('devuelve null ante 404 (no hay borrador todavía)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'not_found' }), { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(GameMapAdminService.getDraft('bosque')).resolves.toBeNull();
  });

  it('guarda el borrador con expectedRevision y document exactos', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(draftEnvelope({ revision: 5 })), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await GameMapAdminService.saveDraft(FIXTURE_MAP_VERSION, 4);
    expect(result.revision).toBe(5);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/game/maps/fixture-bosque-v1/draft');
    expect(init.method).toBe('PUT');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.expectedRevision).toBe(4);
    expect(body.mapId).toBe('fixture-bosque-v1');
  });

  it('rechaza guardar un documento inválido sin llamar a la red', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const broken = { ...FIXTURE_MAP_VERSION, schemaVersion: 99 as never };
    await expect(GameMapAdminService.saveDraft(broken, 0)).rejects.toThrow(/inválido/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
