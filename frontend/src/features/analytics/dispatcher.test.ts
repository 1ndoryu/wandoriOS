/* [297A-16] El catálogo tipado del dispatcher se conecta al tracker real.
 * Verifica el mapping allowlisted y las reglas de privacidad: nunca se envía
 * orderId, mensajes de error crudos ni identificadores de cliente. */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./tracker', () => ({
  track: vi.fn(),
  trackPageView: vi.fn(),
}));

import { dispatchEvent } from './dispatcher';
import { track, trackPageView } from './tracker';

const trackMock = vi.mocked(track);
const trackPageViewMock = vi.mocked(trackPageView);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('dispatcher → tracker', () => {
  it('delega page_view al tracker de páginas', () => {
    dispatchEvent({ type: 'page_view', path: '/escritorio' });
    expect(trackPageViewMock).toHaveBeenCalledWith('/escritorio');
  });

  it('mapea app_opened/app_closed a eventos de app con el slug', () => {
    dispatchEvent({ type: 'app_opened', appId: 'store' });
    expect(trackMock).toHaveBeenCalledWith({
      event_type: 'app', target_type: 'app', target_id: 'store',
    });
  });

  it('mapea eventos de ventana sin contenido interno', () => {
    dispatchEvent({ type: 'window_focus_changed', appId: 'reader', previousAppId: 'finder' });
    expect(trackMock).toHaveBeenCalledWith({
      event_type: 'window', target_type: 'window', target_id: 'reader',
    });
  });

  it('nunca envía el texto de error en app_failed', () => {
    dispatchEvent({ type: 'app_failed', appId: 'media-library', error: 'url secreta?token=abc' });
    const payload = trackMock.mock.calls[0][0];
    expect(payload.event_type).toBe('error');
    expect(payload.target_id).toBe('media-library');
    expect(JSON.stringify(payload)).not.toContain('token=abc');
    expect(JSON.stringify(payload)).not.toContain('url secreta');
  });

  it('operation_failed envía solo la operación, nunca el detalle', () => {
    dispatchEvent({
      type: 'operation_failed',
      operation: 'overlay-sync',
      error: 'INSERT INTO ... user@email.com ...',
    });
    const payload = trackMock.mock.calls[0][0];
    expect(payload).toEqual({
      event_type: 'error', target_type: 'operation', metadata: { operation: 'overlay-sync' },
    });
    expect(JSON.stringify(payload)).not.toContain('email.com');
  });

  it('los eventos de comercio con orderId se silencian (identificador interno)', () => {
    dispatchEvent({ type: 'order_paid', orderId: '11111111-1111-1111-1111-111111111111' });
    dispatchEvent({ type: 'delivery_granted', orderId: '11111111-1111-1111-1111-111111111111' });
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('theme_changed mide solo la preferencia resuelta', () => {
    dispatchEvent({ type: 'theme_changed', mode: 'oscuro', resolved: 'oscuro', scope: 'local' });
    expect(trackMock).toHaveBeenCalledWith({
      event_type: 'theme', target_type: 'preference',
      metadata: { mode: 'oscuro', resolved: 'oscuro' },
    });
  });

  it('consent_updated y sesión no generan métricas (privacidad del propio consentimiento)', () => {
    dispatchEvent({ type: 'consent_updated', consent: true });
    dispatchEvent({ type: 'session_started', userId: 'user-123' });
    expect(trackMock).not.toHaveBeenCalled();
    expect(trackPageViewMock).not.toHaveBeenCalled();
  });
});
