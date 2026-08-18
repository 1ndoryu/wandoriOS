/* Tests del autosave del editor de productos [297A-14 F5]:
 * - Debounce: no guarda inmediatamente; tras el delay crea con is_active=false.
 * - Idempotencia create→update: conserva el ID; el segundo guardado actualiza.
 * - Sin nombre no guarda; cancel()/destroy() limpian timers.
 * - El evento de dominio solo se emite en 'created'. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createProductAutosave, PRODUCT_AUTOSAVE_DELAY_MS, type ProductDraftPayload } from './product-editor-autosave';
import { subscribeProductEditorSaved } from '../../../runtime/product-editor-events';
import { ProductService } from '../../../../services';

vi.mock('../../../../services', () => ({
  ProductService: {
    update: vi.fn(),
    create: vi.fn(),
    getById: vi.fn(),
    getByArticleId: vi.fn(),
    listAll: vi.fn(),
    delete: vi.fn(),
    createCheckout: vi.fn(),
  },
  ArticleService: {},
  ProjectService: {},
  MediaService: {},
  SettingsService: {},
}));

function makeDeps() {
  let productId: string | undefined;
  const payload: ProductDraftPayload = {
    name: 'mi producto', description: 'desc', priceCents: 500, currency: 'USD',
  };
  return {
    deps: {
      getProductId: () => productId,
      setProductId: (id: string) => { productId = id; },
      getPayload: () => payload,
      isActive: () => true,
    },
    getProductId: () => productId,
  };
}

describe('product-editor autosave [297A-14 F5]', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('crea tras el debounce con is_active=false (no activa la venta automáticamente)', async () => {
    vi.mocked(ProductService.create).mockResolvedValue({ id: 'prod-1' } as never);
    const { deps } = makeDeps();
    const autosave = createProductAutosave(deps);
    autosave.schedule();

    expect(ProductService.create).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(PRODUCT_AUTOSAVE_DELAY_MS + 100);

    expect(ProductService.create).toHaveBeenCalledTimes(1);
    expect(ProductService.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'mi producto', price_cents: 500, is_active: false }),
    );
    autosave.destroy();
  });

  it('conserva el ID: el segundo guardado actualiza con el mismo producto', async () => {
    vi.mocked(ProductService.create).mockResolvedValue({ id: 'prod-1' } as never);
    vi.mocked(ProductService.update).mockResolvedValue({ id: 'prod-1' } as never);
    const { deps } = makeDeps();
    const autosave = createProductAutosave(deps);

    autosave.schedule();
    await vi.advanceTimersByTimeAsync(PRODUCT_AUTOSAVE_DELAY_MS + 100);
    expect(ProductService.create).toHaveBeenCalledTimes(1);

    autosave.schedule();
    await vi.advanceTimersByTimeAsync(PRODUCT_AUTOSAVE_DELAY_MS + 100);

    expect(ProductService.update).toHaveBeenCalledTimes(1);
    expect(ProductService.update).toHaveBeenCalledWith('prod-1', expect.objectContaining({
      name: 'mi producto',
    }));
    autosave.destroy();
  });

  it('no guarda sin nombre (guardia en saveDraft)', async () => {
    const payload: ProductDraftPayload = { name: '   ', description: '', priceCents: 0, currency: 'USD' };
    const { deps } = makeDeps();
    const autosave = createProductAutosave({
      ...deps,
      getPayload: () => payload,
    });

    autosave.schedule();
    await vi.advanceTimersByTimeAsync(PRODUCT_AUTOSAVE_DELAY_MS + 100);

    expect(ProductService.create).not.toHaveBeenCalled();
    expect(ProductService.update).not.toHaveBeenCalled();
    autosave.destroy();
  });

  it.each([
    { label: 'precio cero', priceCents: 0 },
    { label: 'precio no numérico', priceCents: Number.NaN },
  ])('no guarda con $label (guardia de precio espejo del manual)', async ({ priceCents }) => {
    const payload: ProductDraftPayload = { name: 'mi producto', description: '', priceCents, currency: 'USD' };
    const { deps } = makeDeps();
    const autosave = createProductAutosave({
      ...deps,
      getPayload: () => payload,
    });

    autosave.schedule();
    await vi.advanceTimersByTimeAsync(PRODUCT_AUTOSAVE_DELAY_MS + 100);

    expect(ProductService.create).not.toHaveBeenCalled();
    expect(ProductService.update).not.toHaveBeenCalled();
    autosave.destroy();
  });

  it('cancel() cancela el timer y destroy() limpia sin doble guardado', async () => {
    vi.mocked(ProductService.create).mockResolvedValue({ id: 'prod-1' } as never);
    const { deps } = makeDeps();
    const autosave = createProductAutosave(deps);

    autosave.schedule();
    autosave.cancel();
    await vi.advanceTimersByTimeAsync(PRODUCT_AUTOSAVE_DELAY_MS + 100);
    expect(ProductService.create).not.toHaveBeenCalled();

    autosave.schedule();
    autosave.destroy();
    autosave.destroy(); /* idempotente */
    await vi.advanceTimersByTimeAsync(PRODUCT_AUTOSAVE_DELAY_MS + 100);
    expect(ProductService.create).not.toHaveBeenCalled();
  });

  it('emite el evento de dominio solo al crear, no en updates de autosave', async () => {
    vi.mocked(ProductService.create).mockResolvedValue({ id: 'prod-1' } as never);
    vi.mocked(ProductService.update).mockResolvedValue({ id: 'prod-1' } as never);
    const events: string[] = [];
    const unsubscribe = subscribeProductEditorSaved((e) => { events.push(e.operation); });
    const { deps } = makeDeps();
    const autosave = createProductAutosave(deps);

    autosave.schedule();
    await vi.advanceTimersByTimeAsync(PRODUCT_AUTOSAVE_DELAY_MS + 100);
    autosave.schedule();
    await vi.advanceTimersByTimeAsync(PRODUCT_AUTOSAVE_DELAY_MS + 100);

    expect(events).toEqual(['created']);
    expect(ProductService.update).toHaveBeenCalledTimes(1);
    autosave.destroy();
    unsubscribe();
  });
});
