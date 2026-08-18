/* wandori.us — Admin Products
 * Listado/orquestador de productos; el editor vive en la app lazy `product-editor`.
 * [297A-14] No crea modales ni contiene el formulario editorial. */

import { safeRun, safeClick } from '../utils/safe-async';
import { tryCatch } from '../utils/result';
import { createEl } from '../utils/dom';
import { createVacio } from '../components/ui/empty-state';
import { ProductService } from '../services';
import { showToast } from '../components/ui/toast';
import { showConfirm } from '../components/ui/confirm';
import { subscribeProductEditorSaved } from '../features/runtime/product-editor-events';
import type { Product } from '../api/types';

const productListCleanups = new WeakMap<HTMLElement, () => void>();
const productListGenerations = new WeakMap<HTMLElement, number>();

export function disposeProductList(container: HTMLElement): void {
  productListCleanups.get(container)?.();
  productListCleanups.delete(container);
  productListGenerations.delete(container);
}

export function disposeAdminProductLists(page: HTMLElement): void {
  page.querySelectorAll<HTMLElement>('.admin-productos-lista').forEach(disposeProductList);
}

function ensureProductListSubscription(container: HTMLElement): void {
  if (productListCleanups.has(container)) return;
  const cleanup = subscribeProductEditorSaved(() => {
    if (!container.isConnected) {
      disposeProductList(container);
      return;
    }
    void renderProductList(container);
  });
  productListCleanups.set(container, cleanup);
}

export function openProductEditor(product?: Product): void {
  void import('../features/runtime/route-app-adapter')
    .then(({ openAppWindow }) => {
      const params = product ? { productId: product.id } : undefined;
      return openAppWindow('product-editor', params);
    })
    .catch(() => {
      showToast('no se pudo abrir el editor de productos');
    });
}

function formatPrice(product: Product): string {
  const value = (product.price_cents / 100).toFixed(2);
  return `$${value} ${product.currency}`;
}

export async function renderProductList(container: HTMLElement): Promise<void> {
  ensureProductListSubscription(container);
  const generation = (productListGenerations.get(container) ?? 0) + 1;
  productListGenerations.set(container, generation);
  container.className = 'admin-lista admin-productos-lista';
  container.textContent = '';
  container.appendChild(createEl('p', { className: 'cargando', textContent: 'cargando...' }));

  const listResult = await tryCatch(ProductService.listAll());
  if (productListGenerations.get(container) !== generation) return;
  if (!listResult.ok) {
    container.textContent = '';
    container.appendChild(createVacio('error al cargar productos'));
    return;
  }

  container.textContent = '';
  for (const product of listResult.value) {
    const editButton = createEl('button', {
      type: 'button',
      className: 'boton boton-pequeno',
      textContent: 'editar',
    });
    editButton.addEventListener('click', () => openProductEditor(product));

    const deleteButton = createEl('button', {
      type: 'button',
      className: 'boton boton-pequeno',
      textContent: 'eliminar',
    });
    deleteButton.addEventListener('click', safeClick(async () => {
      const confirmed = await showConfirm(`eliminar "${product.name}"?`);
      if (!confirmed) return;
      const result = await safeRun(ProductService.delete(product.id), 'error al eliminar');
      if (!result.ok) return;
      showToast('producto eliminado');
      await renderProductList(container);
    }));

    const state = product.is_active ? '' : ' (inactivo)';
    const info = createEl('span', {
      textContent: `${product.name}${state} — ${formatPrice(product)}`,
    });
    const actions = createEl('div', { className: 'admin-acciones' }, editButton, deleteButton);
    container.appendChild(createEl('div', { className: 'admin-item' }, info, actions));
  }

  /* [018A-1] El botón "+ nuevo producto" vive en la barra de acciones
   * inferior que orquesta admin.ts; la lista ya no lo crea. */
  if (listResult.value.length === 0) {
    container.appendChild(createVacio('no hay productos'));
  }
}
