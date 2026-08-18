import { describe, expect, it } from 'vitest';
import { createGameInput } from './game-playable-input';
import { createGamePlayableView, renderGamePlayable } from './game-playable';

describe('Bosque playable offline fixture', () => {
  it('builds the accessible shell without mounting Three.js eagerly', () => {
    const view = createGamePlayableView();

    expect(view.element.classList.contains('juegoFixture')).toBe(true);
    expect(view.sceneHost.getAttribute('aria-label')).toBe('Escena jugable offline del Bosque');
    expect(view.element.querySelector('canvas')).toBeNull();
    expect(view.element.querySelector('[aria-label="Controles de movimiento"]')).toBeNull();
  });

  it('does not mount resources when the lifecycle signal is already aborted', () => {
    const controller = new AbortController();
    controller.abort();

    const view = renderGamePlayable({ signal: controller.signal });

    expect(view.element.querySelector('[aria-label="Controles de movimiento"]')).toBeNull();
    expect(view.element.querySelector('canvas')).toBeNull();
    view.destroy?.();
  });

  it('combines keyboard and touch intentions and clears them on destroy', () => {
    const input = createGameInput();
    document.body.appendChild(input.controls);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
    expect(input.getDirection()).toEqual({ x: 1, z: 0 });

    const right = input.controls.querySelector<HTMLButtonElement>('[aria-label="Mover a la derecha"]');
    expect(right).not.toBeNull();
    right!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    expect(input.getDirection()).toEqual({ x: 2, z: 0 });

    input.destroy();
    expect(input.controls.isConnected).toBe(false);
    expect(input.getDirection()).toEqual({ x: 0, z: 0 });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(input.getDirection()).toEqual({ x: 0, z: 0 });
  });
});
