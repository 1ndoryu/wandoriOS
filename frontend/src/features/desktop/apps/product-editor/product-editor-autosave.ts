/* wandori.us — Product Editor Autosave
 * Adaptador de autosave del editor de productos.
 * [297A-14 F5] Reutiliza el saver genérico (utils/autosave.ts) con payload y
 * persistencia propios vía ProductService. Autosave solo guarda contenido
 * (nombre/descripción/precio/moneda); `is_active` (venta) solo cambia con
 * el guardado manual explícito. La validación de precio la confirma el
 * backend; el cliente solo exige nombre no vacío para autosave. */

import { safeRun } from '../../../../utils/safe-async';
import { showToast } from '../../../../components/ui/toast';
import { ProductService } from '../../../../services';
import { createDebouncedSaver } from '../../../../utils/autosave';
import { publishProductEditorSaved } from '../../../runtime/product-editor-events';
import type { CreateProductRequest, UpdateProductRequest } from '../../../../api/types';

/** Payload del borrador de producto (sin estado de venta). */
export interface ProductDraftPayload {
  name: string;
  description: string;
  priceCents: number;
  currency: string;
}

interface AutosaveDeps {
  /** Devuelve el ID actual; undefined = aún no creado. */
  getProductId: () => string | undefined;
  /** Actualizar el ID tras el primer create (idempotencia create→update). */
  setProductId: (id: string) => void;
  /** Devuelve el payload actual del formulario. */
  getPayload: () => ProductDraftPayload;
  /** Guarda true si el editor sigue activo (no abortado/desmontado). */
  isActive: () => boolean;
}

export interface ProductAutosave {
  schedule: () => void;
  cancel: () => void;
  destroy: () => void;
}

/** Debounce del autosave de productos. */
export const PRODUCT_AUTOSAVE_DELAY_MS = 2500;

/** Guardar el borrador (crear o actualizar) y anunciar solo CREATES. */
async function saveDraft(
  deps: AutosaveDeps,
): Promise<{ ok: boolean; created?: boolean }> {
  if (!deps.isActive()) return { ok: false };
  const payload = deps.getPayload();
  if (!payload.name.trim()) return { ok: false };
  /* [297A-14 F5] Espejo de la validación del guardado manual: sin precio
   * válido no autosave, para no rechazar en el backend ni spamear el toast
   * de error cada 2.5s mientras se escribe el nombre sin precio. */
  if (!Number.isFinite(payload.priceCents) || payload.priceCents <= 0) return { ok: false };

  const productId = deps.getProductId();
  const base: UpdateProductRequest = {
    name: payload.name,
    description: payload.description,
    price_cents: payload.priceCents,
    currency: payload.currency || 'USD',
  };

  /* Autosave nunca activa la venta: nace inactivo/private y activar es
   * explícito (backend es la autoridad de validación de precio/moneda). */
  const request = productId
    ? ProductService.update(productId, base)
    : ProductService.create({ ...(base as CreateProductRequest), is_active: false });

  const result = await safeRun(request, 'error al autoguardar producto');
  if (!deps.isActive() || !result.ok) return { ok: false };

  const created = !productId;
  deps.setProductId(result.value.id);
  if (created) {
    publishProductEditorSaved({ productId: result.value.id, operation: 'created' });
  }
  return { ok: true, created };
}

/** Crear el autosave del editor de productos (delega en el saver genérico). */
export function createProductAutosave(deps: AutosaveDeps): ProductAutosave {
  return createDebouncedSaver({
    delayMs: PRODUCT_AUTOSAVE_DELAY_MS,
    isActive: deps.isActive,
    save: () => saveDraft(deps),
    onCreated: () => showToast('borrador de producto creado'),
  });
}
