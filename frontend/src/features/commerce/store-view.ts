import { ShoppingBag, createElement } from 'lucide';
import { createEl } from '../../utils/dom';
import { createVacio } from '../../components/ui/empty-state';
import { ProductService } from '../../services/product.service';
import type { DownloadHistoryItem, OrderHistoryItem, Product } from '../../api/types';

function formatPrice(product: Product): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency', currency: product.currency,
  }).format(product.price_cents / 100);
}

function createProductCard(product: Product): HTMLElement {
  const email = createEl('input', {
    type: 'email', className: 'comercio__email', placeholder: 'tu@email.com',
    ariaLabel: `Correo para comprar ${product.name}`,
  });
  const status = createEl('p', { className: 'comercio__estado', role: 'status' });
  const buy = createEl('button', { type: 'button', className: 'boton comercio__comprar' },
    createElement(ShoppingBag), createEl('span', { textContent: 'Comprar' }));
  buy.addEventListener('click', () => {
    const address = email.value.trim();
    if (!address || !address.includes('@')) {
      status.textContent = 'Escribe un correo válido.';
      email.focus();
      return;
    }
    buy.disabled = true;
    status.textContent = 'Preparando pago…';
    void ProductService.createCheckout(product.id, address)
      .then(({ checkout_url }) => { window.location.assign(checkout_url); })
      .catch(() => {
        status.textContent = 'No se pudo iniciar el pago. Intenta de nuevo.';
        buy.disabled = false;
      });
  });
  return createEl('article', { className: 'comercio__producto' },
    createEl('h3', { className: 'comercio__productoTitulo', textContent: product.name }),
    createEl('p', { textContent: product.description || 'Producto digital.' }),
    createEl('strong', { textContent: formatPrice(product) }),
    email, buy, status);
}

export function createStoreView(signal?: AbortSignal): { element: HTMLElement; destroy: () => void } {
  const root = createEl('section', { className: 'comercio comercio--tienda', ariaLabel: 'Tienda' });
  root.append(createEl('h2', { className: 'comercio__titulo', textContent: 'Tienda' }));
  const list = createEl('div', { className: 'comercio__lista' });
  root.appendChild(list);
  let disposed = false;
  void ProductService.listPublic().then(products => {
    if (disposed || signal?.aborted) return;
    list.replaceChildren(...products.map(createProductCard));
    if (products.length === 0) list.appendChild(createVacio('No hay productos publicados.'));
  }).catch(() => {
    if (!disposed && !signal?.aborted) list.appendChild(createVacio('No se pudo cargar la tienda.'));
  });
  return { element: root, destroy: () => { disposed = true; } };
}

/* [297A-15] Historial server-side por cuenta: Pedidos y Descargas ya no son
 * estados vacíos fijos; cargan el contrato /api/me/orders y /api/me/downloads
 * (sesión). Nunca se renderiza el token de descarga. */

function formatEstado(status: string): string {
  const map: Record<string, string> = {
    pending: 'Pendiente', paid: 'Pagado', delivered: 'Entregado',
    failed: 'Fallido', refunded: 'Reembolsado', disputed: 'Disputado',
  };
  return map[status] ?? status;
}

function createOrderRow(order: OrderHistoryItem): HTMLElement {
  return createEl('li', { className: 'comercio__fila' },
    createEl('strong', { textContent: order.product_name }),
    createEl('span', { textContent: formatEstado(order.status) }),
    createEl('span', { textContent: new Intl.NumberFormat(undefined, {
      style: 'currency', currency: order.currency,
    }).format(order.price_cents / 100) }),
    createEl('time', { textContent: new Date(order.created_at).toLocaleDateString() }));
}

function createDownloadRow(grant: DownloadHistoryItem): HTMLElement {
  return createEl('li', { className: 'comercio__fila' },
    createEl('strong', { textContent: grant.product_name }),
    createEl('span', { textContent: formatEstado(grant.status) }),
    createEl('span', { textContent: `expira ${new Date(grant.expires_at).toLocaleDateString()}` }));
}

export function createOrdersView(signal?: AbortSignal): HTMLElement {
  const list = createEl('ul', { className: 'comercio__lista comercio__lista--filas' });
  const root = createEl('section', { className: 'comercio comercio--pedidos', ariaLabel: 'Pedidos' },
    createEl('h2', { className: 'comercio__titulo', textContent: 'Pedidos' }), list);
  let disposed = false;
  void ProductService.listMyOrders({ signal })
    .then(orders => {
      if (disposed || signal?.aborted) return;
      list.replaceChildren(...orders.map(createOrderRow));
      if (orders.length === 0) list.appendChild(createVacio('Todavía no hay compras en esta cuenta.'));
    })
    .catch(() => {
      if (!disposed && !signal?.aborted) {
        list.appendChild(createVacio('Inicia sesión para ver tus pedidos.'));
      }
    });
  return root;
}

export function createDownloadsView(signal?: AbortSignal): HTMLElement {
  const list = createEl('ul', { className: 'comercio__lista comercio__lista--filas' });
  const root = createEl('section', { className: 'comercio comercio--descargas', ariaLabel: 'Descargas' },
    createEl('h2', { className: 'comercio__titulo', textContent: 'Descargas' }), list);
  let disposed = false;
  void ProductService.listMyDownloads({ signal })
    .then(grants => {
      if (disposed || signal?.aborted) return;
      list.replaceChildren(...grants.map(createDownloadRow));
      if (grants.length === 0) list.appendChild(createVacio('Tus descargas aparecen aquí tras comprar.'));
    })
    .catch(() => {
      if (!disposed && !signal?.aborted) {
        list.appendChild(createVacio('Inicia sesión para ver tus descargas.'));
      }
    });
  return root;
}
