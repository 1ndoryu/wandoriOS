import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GAME_RESTART_NOTICE_MAX_SECONDS,
  createGameRestartNotice,
  formatGameRestartCountdown,
} from './game-restart-notice';

describe('formato de la cuenta atrás', () => {
  it('formatea segundos como mm:ss con clamp a 0', () => {
    expect(formatGameRestartCountdown(0)).toBe('00:00');
    expect(formatGameRestartCountdown(59)).toBe('00:59');
    expect(formatGameRestartCountdown(60)).toBe('01:00');
    expect(formatGameRestartCountdown(300)).toBe('05:00');
    expect(formatGameRestartCountdown(3_599)).toBe('59:59');
    expect(formatGameRestartCountdown(-5)).toBe('00:00');
    expect(formatGameRestartCountdown(1.9)).toBe('00:01');
  });
});

describe('banner de reinicio coordinado', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('section');
    document.body.appendChild(host);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    host.remove();
  });

  it('muestra motivo y cuenta atrás y la decrementa', () => {
    const notice = createGameRestartNotice(host);
    notice.show({ reason: 'publicación de versión nueva', restartInSeconds: 300 });

    const banner = host.querySelector<HTMLElement>('.juegoFixture__reinicio');
    expect(banner).not.toBeNull();
    expect(banner?.getAttribute('aria-live')).toBe('polite');
    expect(banner?.textContent).toContain('publicación de versión nueva');
    expect(banner?.textContent).toContain('05:00');

    vi.advanceTimersByTime(2_000);
    expect(host.querySelector('[data-role="countdown"]')?.textContent).toBe('04:58');
    notice.destroy();
  });

  it('usa un texto por defecto cuando el motivo está vacío', () => {
    const notice = createGameRestartNotice(host);
    notice.show({ reason: '   ', restartInSeconds: 60 });
    expect(host.querySelector('.juegoFixture__reinicio')?.textContent)
      .toContain('el servidor publicó una versión nueva');
    notice.destroy();
  });

  it('acota la cuenta atrás al máximo del contrato y a un mínimo de 1 s', () => {
    const notice = createGameRestartNotice(host);
    notice.show({ reason: 'x', restartInSeconds: GAME_RESTART_NOTICE_MAX_SECONDS + 10 });
    expect(host.querySelector('[data-role="countdown"]')?.textContent)
      .toBe('60:00');
    notice.destroy();

    const second = createGameRestartNotice(host);
    second.show({ reason: 'x', restartInSeconds: 0 });
    expect(host.querySelector('[data-role="countdown"]')?.textContent).toBe('00:01');
    second.destroy();
  });

  it('expira a 0:00 y marca el estado expired sin seguir consumiendo timer', () => {
    const notice = createGameRestartNotice(host);
    notice.show({ reason: 'x', restartInSeconds: 2 });
    vi.advanceTimersByTime(2_100);
    expect(host.querySelector('[data-role="countdown"]')?.textContent).toBe('00:00');
    expect(host.querySelector('.juegoFixture__reinicio')?.getAttribute('data-state'))
      .toBe('expired');
    expect(vi.getTimerCount()).toBe(0);
    notice.destroy();
  });

  it('hide retira el banner y detiene el timer; destroy no deja fugas', () => {
    const notice = createGameRestartNotice(host);
    notice.show({ reason: 'x', restartInSeconds: 300 });
    expect(vi.getTimerCount()).toBe(1);
    notice.hide();
    expect(host.querySelector('.juegoFixture__reinicio')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    /* destroy es idempotente y seguro sin banner activo. */
    notice.destroy();
    notice.destroy();
  });
});
