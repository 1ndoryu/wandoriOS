/* [Decisión 8] Aviso de reinicio coordinado del mundo (05-ago): banner
 * monocromo (chrome del OS) con el motivo y una cuenta atrás que el servidor
 * difunde vía `server_restart`. Este módulo no conoce Three.js, WebSocket ni
 * el realtime: el runtime recibe `onServerRestart` y llama `show`; al
 * reconectar (estado `connected`) llama `hide`; el teardown llama `destroy`.
 * La cuenta atrás expira por sí sola a 0:00 si el servidor no cierra el
 * socket a tiempo. */

export const GAME_RESTART_NOTICE_MAX_SECONDS = 3_600;
const GAME_RESTART_NOTICE_TICK_MS = 500;

/** Formatea segundos como mm:ss, clamp a 0 (útil para tests y ARIA). */
export function formatGameRestartCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export interface GameRestartNoticePayload {
  readonly reason: string;
  readonly restartInSeconds: number;
}

export interface GameRestartNoticeHandle {
  readonly show: (payload: GameRestartNoticePayload) => void;
  readonly hide: () => void;
  readonly destroy: () => void;
}

export function createGameRestartNotice(host: HTMLElement): GameRestartNoticeHandle {
  let banner: HTMLElement | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let deadlineAt = 0;

  const clearTimer = (): void => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const removeBanner = (): void => {
    if (banner !== null && banner.parentNode === host) host.removeChild(banner);
    banner = null;
  };

  const render = (): void => {
    if (!banner) return;
    const countdown = banner.querySelector('[data-role="countdown"]');
    if (countdown) {
      const remaining = Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1_000));
      countdown.textContent = formatGameRestartCountdown(remaining);
    }
  };

  const tick = (): void => {
    render();
    if (deadlineAt - Date.now() <= 0) {
      /* El servidor cierra el socket al migrar; si no llega a tiempo, la
       * cuenta queda en 0:00 y el banner se retira al reconectar. */
      banner?.setAttribute('data-state', 'expired');
      clearTimer();
    }
  };

  return {
    show(payload) {
      const reason = payload.reason.trim();
      const seconds = Math.min(
        Math.max(1, Math.floor(payload.restartInSeconds)),
        GAME_RESTART_NOTICE_MAX_SECONDS,
      );
      clearTimer();
      removeBanner();
      banner = document.createElement('div');
      banner.className = 'juegoFixture__reinicio';
      banner.setAttribute('aria-live', 'polite');
      const title = document.createElement('p');
      title.className = 'juegoFixture__reinicio-titulo';
      title.textContent = 'El mundo se reiniciará';
      const detail = document.createElement('p');
      detail.className = 'juegoFixture__reinicio-detalle';
      detail.textContent = reason || 'el servidor publicó una versión nueva';
      const countdown = document.createElement('p');
      countdown.className = 'juegoFixture__reinicio-cuenta';
      countdown.dataset.role = 'countdown';
      countdown.textContent = formatGameRestartCountdown(seconds);
      banner.append(title, detail, countdown);
      host.appendChild(banner);
      deadlineAt = Date.now() + seconds * 1_000;
      timer = setInterval(tick, GAME_RESTART_NOTICE_TICK_MS);
    },
    hide() {
      clearTimer();
      removeBanner();
    },
    destroy() {
      clearTimer();
      removeBanner();
    },
  };
}
