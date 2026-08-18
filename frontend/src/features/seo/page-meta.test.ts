import { describe, expect, it } from 'vitest';
import { metaForPath } from './page-meta';

describe('page-meta rutas públicas [297A-17]', () => {
  it('mapea el escritorio (root) con título propio', () => {
    expect(metaForPath('/')?.title).toBe('escritorio');
    expect(metaForPath('')?.title).toBe('escritorio');
  });

  it('mapea login y verify-email', () => {
    expect(metaForPath('/login')?.title).toContain('cuenta');
    expect(metaForPath('/verify-email')?.title).toBe('verificar correo');
  });

  it('mapea checkout success/cancel', () => {
    expect(metaForPath('/checkout/success')?.title).toBe('pedido realizado');
    expect(metaForPath('/checkout/cancel')?.title).toBe('pedido cancelado');
  });

  it('deja las rutas de contenido sin meta propia (las cubren sus páginas)', () => {
    expect(metaForPath('/article/mi-post')).toBeNull();
    expect(metaForPath('/about')).toBeNull();
    expect(metaForPath('/gallery')).toBeNull();
    expect(metaForPath('/projects')).toBeNull();
  });
});
