/* GAME-01 — Tests de la fuente de mapa jugable (297A-65).
 * El resolver decide entre publicación activa y fixture offline, siempre
 * fail-closed: ni la red ni un 404 pueden bloquear la app. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE_MAP, FIXTURE_MAP_VERSION } from './game-fixture-map';

const mocks = vi.hoisted(() => ({ getActive: vi.fn() }));

vi.mock('../../../../services/game-map-admin.service', () => ({
  GAME_MAP_ID: 'bosque',
  GameMapAdminService: { getActive: mocks.getActive },
}));

import { resolvePlayableMap } from './game-map-source';

describe('resolvePlayableMap (fuente de mapa jugable)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('usa el fixture offline sin aviso cuando no hay publicación (404 → null)', async () => {
    mocks.getActive.mockResolvedValue(null);

    const resolution = await resolvePlayableMap();

    expect(mocks.getActive).toHaveBeenCalledWith('bosque', { signal: undefined });
    expect(resolution.warning).toBe(false);
    expect(resolution.map.fromFixture).toBe(true);
    expect(resolution.map.document).toBe(FIXTURE_MAP_VERSION);
    expect(resolution.map.world).toBe(FIXTURE_MAP);
    expect(resolution.map.label).toBe('fixture');
    expect(resolution.map.version).toBe(0);
  });

  it('usa la publicación activa y expone su versión', async () => {
    const published = { ...FIXTURE_MAP_VERSION, id: 'bosque' };
    mocks.getActive.mockResolvedValue({ document: published, activeVersion: 2 });

    const resolution = await resolvePlayableMap();

    expect(resolution.warning).toBe(false);
    expect(resolution.map.fromFixture).toBe(false);
    expect(resolution.map.document).toBe(published);
    expect(resolution.map.label).toBe('v2');
    expect(resolution.map.version).toBe(2);
  });

  it('cae al fixture con aviso ante un fallo de red (fail-closed)', async () => {
    mocks.getActive.mockRejectedValue(new Error('network down'));

    const resolution = await resolvePlayableMap();

    expect(resolution.warning).toBe(true);
    expect(resolution.map.fromFixture).toBe(true);
    expect(resolution.map.document).toBe(FIXTURE_MAP_VERSION);
  });

  it('propaga la señal de aborto al servicio', async () => {
    const controller = new AbortController();
    mocks.getActive.mockResolvedValue(null);

    await resolvePlayableMap({ signal: controller.signal });

    expect(mocks.getActive).toHaveBeenCalledWith('bosque', { signal: controller.signal });
  });
});
