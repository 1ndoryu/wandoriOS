/* wandori.us — Checkout Pages
 * Páginas de success/cancel para el flujo de Stripe checkout.
 * [Auditoría v4 §1.2] Migrado a createEl(). */

import { showProfile } from '../store';
import { updateMeta } from '../features/seo/meta';
import { createEl } from '../utils/dom';

/* === Checkout Success === */
export function renderCheckoutSuccess(): HTMLElement {
  showProfile.set(true);
  updateMeta({ title: 'compra exitosa', description: 'gracias por tu compra' });

  const icono = createEl('div', { className: 'checkout-icono', textContent: '✓' });
  const titulo = createEl('h1', { className: 'checkout-titulo', textContent: 'gracias por tu compra' });
  const mensaje = createEl('p', { className: 'checkout-mensaje', textContent: 'recibiras un correo con el enlace de descarga. si no lo ves en unos minutos, revisa tu carpeta de spam.' });
  const btnInicio = createEl('a', { className: 'boton', href: '/', textContent: 'volver al inicio' });

  return createEl('div', { className: 'checkout-resultado' }, icono, titulo, mensaje, btnInicio);
}

/* === Checkout Cancel === */
export function renderCheckoutCancel(): HTMLElement {
  showProfile.set(true);
  updateMeta({ title: 'pago cancelado', description: 'el pago fue cancelado' });

  const icono = createEl('div', { className: 'checkout-icono', textContent: '×' });
  const titulo = createEl('h1', { className: 'checkout-titulo', textContent: 'pago cancelado' });
  const mensaje = createEl('p', { className: 'checkout-mensaje', textContent: 'el pago no se completo. puedes intentar de nuevo cuando quieras.' });
  const btnInicio = createEl('a', { className: 'boton', href: '/', textContent: 'volver al inicio' });

  return createEl('div', { className: 'checkout-resultado' }, icono, titulo, mensaje, btnInicio);
}
