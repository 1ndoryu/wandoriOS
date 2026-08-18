import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameMapEditor } from './game-map-editor';
import { GameMapAdminService } from '../../../../services/game-map-admin.service';
import { GameAssetAdminService } from '../../../../services/game-asset-admin.service';
import { FIXTURE_MAP_VERSION } from './game-fixture-map';

/* [Decisión 8] La publicación migra el mundo: se mockea la confirmación para
 * controlar las dos etapas (confirmar publicación + confirmar reinicio). */
vi.mock('../../../../components/ui/confirm', () => ({
  showConfirm: vi.fn().mockResolvedValue(true),
}));
import { showConfirm } from '../../../../components/ui/confirm';

function activeCatalog(): unknown[] {
  return [
    { id: 'tree', displayName: 'Árbol', category: 'tree', isActive: true, createdAt: '2026-08-02T00:00:00Z' },
    { id: 'rock', displayName: 'Roca', category: 'rock', isActive: true, createdAt: '2026-08-02T00:00:00Z' },
  ];
}

function mockCanvas(): void {
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    disconnect(): void {}
    unobserve(): void {}
  });
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    arc: vi.fn(),
    strokeRect: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
  })) as never;
}

describe('createGameMapEditor (297A-64)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockCanvas();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.textContent = '';
  });

  it('monta el toolbar, el canvas y el footer', async () => {
    vi.spyOn(GameAssetAdminService, 'listAll').mockResolvedValue(activeCatalog() as never);
    vi.spyOn(GameMapAdminService, 'getActive').mockResolvedValue({
      document: FIXTURE_MAP_VERSION,
      activeVersion: 3,
    } as never);
    vi.spyOn(GameMapAdminService, 'getDraft').mockResolvedValue(null);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = createGameMapEditor(host);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(host.querySelector('canvas')).not.toBeNull();
    expect(host.textContent).toContain('seleccionar');
    expect(host.textContent).toContain('colocar');
    expect(host.textContent).toContain('spawn');
    expect(host.textContent).toContain('pintar');
    expect(host.textContent).toContain('altura');
    expect(host.textContent).toContain('terreno');
    expect(host.textContent).toContain('preview 3D');
    /* [297A-71] El toolbar expone el guardado del borrador. */
    expect(host.textContent).toContain('guardar borrador');
    expect(host.textContent).toContain('publicar mapa');
    /* La paleta se puebla con assets activos. */
    expect(host.textContent).toContain('Árbol');
    expect(host.textContent).toContain('Roca');
    /* [297A-66] El pincel expone el selector de superficies suelo/agua. */
    expect(host.querySelector('select[aria-label="superficie del pincel"]')).not.toBeNull();
    /* [297A-67] El pincel de altura expone su selector de nivel. */
    expect(host.querySelector('select[aria-label="nivel de altura del pincel"]')).not.toBeNull();
    handle.destroy();
  });

  it('usa el fixture como base cuando no hay mapa publicado ni borrador', async () => {
    vi.spyOn(GameAssetAdminService, 'listAll').mockResolvedValue(activeCatalog() as never);
    vi.spyOn(GameMapAdminService, 'getActive').mockResolvedValue(null);
    vi.spyOn(GameMapAdminService, 'getDraft').mockResolvedValue(null);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = createGameMapEditor(host);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(host.textContent).toContain('sin publicar');
    expect(host.textContent).toContain(`${FIXTURE_MAP_VERSION.instances.length} instancias`);
    handle.destroy();
  });

  /* [297A-71] El borrador editable manda sobre la publicación al abrir. */
  it('continúa desde el borrador guardado cuando existe', async () => {
    vi.spyOn(GameAssetAdminService, 'listAll').mockResolvedValue(activeCatalog() as never);
    vi.spyOn(GameMapAdminService, 'getActive').mockResolvedValue({
      document: FIXTURE_MAP_VERSION,
      activeVersion: 2,
    } as never);
    const draftDocument = {
      ...FIXTURE_MAP_VERSION,
      spawnPoints: [{ id: 'spawn-edited', position: { x: 1, z: 1 }, radius: 0.5 }],
    };
    vi.spyOn(GameMapAdminService, 'getDraft').mockResolvedValue({
      document: draftDocument,
      revision: 4,
    } as never);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = createGameMapEditor(host);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(host.textContent).toContain('borrador v4');
    expect(host.textContent).toContain('v2');
    handle.destroy();
  });

  it('no monta la paleta si el catálogo falla pero mantiene el editor', async () => {
    vi.spyOn(GameAssetAdminService, 'listAll').mockRejectedValue(new Error('catalog down'));
    vi.spyOn(GameMapAdminService, 'getActive').mockResolvedValue(null);
    vi.spyOn(GameMapAdminService, 'getDraft').mockResolvedValue(null);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = createGameMapEditor(host);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(host.querySelector('canvas')).not.toBeNull();
    expect(host.textContent).toContain('mapa cargado sin catálogo');
    handle.destroy();
  });

  /* [Decisión 8] Publicar avisa que el mundo se reiniciará en 5 minutos y
   * confirma la migración antes de llamar al servicio. */
  it('confirma la migración coordinada antes de publicar', async () => {
    vi.spyOn(GameAssetAdminService, 'listAll').mockResolvedValue(activeCatalog() as never);
    /* Carga inicial v3, recarga tras publicar v4 (una sola cadena de spy). */
    vi.spyOn(GameMapAdminService, 'getActive')
      .mockResolvedValueOnce({ document: FIXTURE_MAP_VERSION, activeVersion: 3 } as never)
      .mockResolvedValue({
        document: FIXTURE_MAP_VERSION,
        activeVersion: 4,
      } as never);
    vi.spyOn(GameMapAdminService, 'getDraft').mockResolvedValue(null);
    const publish = vi
      .spyOn(GameMapAdminService, 'publish')
      .mockResolvedValue({ version: 4 } as never);
    const confirm = vi.mocked(showConfirm);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = createGameMapEditor(host);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const btnPublish = Array.from(host.querySelectorAll('button'))
      .find((btn) => btn.textContent?.includes('publicar mapa'));
    expect(btnPublish).toBeDefined();
    btnPublish!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    /* Dos confirmaciones: la versión inmutable y la migración del mundo. */
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(confirm.mock.calls[1]?.[0]).toContain('reiniciará el mundo en 5 minutos');
    expect(publish).toHaveBeenCalledTimes(1);
    handle.destroy();
  });

  it('destroy retira el editor del DOM', async () => {
    vi.spyOn(GameAssetAdminService, 'listAll').mockResolvedValue(activeCatalog() as never);
    vi.spyOn(GameMapAdminService, 'getActive').mockResolvedValue(null);
    vi.spyOn(GameMapAdminService, 'getDraft').mockResolvedValue(null);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = createGameMapEditor(host);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(host.children.length).toBeGreaterThan(0);
    handle.destroy();
    expect(host.children.length).toBe(0);
  });
});
