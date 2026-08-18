/* GAME-01 — Input del fixture offline.
 * Convierte teclado y un D-pad táctil en la misma intención X/Z. No conoce
 * Three.js ni la simulación; el controlador decide cuándo leerla. */

import { createEl } from '../../../../utils/dom';
import type { Vector2 } from '../../../game-core';

const KEY_DIRECTIONS: Readonly<Record<string, Vector2>> = {
  ArrowUp: { x: 0, z: -1 },
  w: { x: 0, z: -1 },
  W: { x: 0, z: -1 },
  ArrowDown: { x: 0, z: 1 },
  s: { x: 0, z: 1 },
  S: { x: 0, z: 1 },
  ArrowLeft: { x: -1, z: 0 },
  a: { x: -1, z: 0 },
  A: { x: -1, z: 0 },
  ArrowRight: { x: 1, z: 0 },
  d: { x: 1, z: 0 },
  D: { x: 1, z: 0 },
};

export interface GameInputHandle {
  readonly controls: HTMLElement;
  readonly getDirection: () => Vector2;
  readonly destroy: () => void;
}

interface DirectionButton {
  readonly key: string;
  readonly direction: Vector2;
}

const BUTTONS: readonly DirectionButton[] = [
  { key: 'up', direction: { x: 0, z: -1 } },
  { key: 'left', direction: { x: -1, z: 0 } },
  { key: 'down', direction: { x: 0, z: 1 } },
  { key: 'right', direction: { x: 1, z: 0 } },
];

export function createGameInput(): GameInputHandle {
  const controls = createEl('div', { className: 'juegoFixture__controles', ariaLabel: 'Controles de movimiento' });
  const pressedKeys = new Set<string>();
  const pressedButtons = new Set<string>();
  const buttonHandlers: Array<{
    element: HTMLElement;
    start: (event: PointerEvent) => void;
    end: (event: PointerEvent) => void;
  }> = [];

  const getDirection = (): Vector2 => {
    let x = 0;
    let z = 0;
    for (const key of pressedKeys) {
      const direction = KEY_DIRECTIONS[key];
      if (direction) { x += direction.x; z += direction.z; }
    }
    for (const key of pressedButtons) {
      const direction = BUTTONS.find(button => button.key === key)?.direction;
      if (direction) { x += direction.x; z += direction.z; }
    }
    return { x, z };
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!KEY_DIRECTIONS[event.key]) return;
    event.preventDefault();
    pressedKeys.add(event.key);
  };
  const onKeyUp = (event: KeyboardEvent): void => { pressedKeys.delete(event.key); };
  const onBlur = (): void => { pressedKeys.clear(); pressedButtons.clear(); };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  const up = createEl('button', {
    type: 'button', className: 'juegoFixture__control juegoFixture__control--up',
    ariaLabel: 'Mover arriba', textContent: '↑',
  });
  const left = createEl('button', {
    type: 'button', className: 'juegoFixture__control juegoFixture__control--left',
    ariaLabel: 'Mover a la izquierda', textContent: '←',
  });
  const down = createEl('button', {
    type: 'button', className: 'juegoFixture__control juegoFixture__control--down',
    ariaLabel: 'Mover abajo', textContent: '↓',
  });
  const right = createEl('button', {
    type: 'button', className: 'juegoFixture__control juegoFixture__control--right',
    ariaLabel: 'Mover a la derecha', textContent: '→',
  });
  controls.append(up, left, down, right);

  for (const [index, button] of [up, left, down, right].entries()) {
    const key = BUTTONS[index].key;
    const onStart = (event: PointerEvent): void => {
      event.preventDefault();
      pressedButtons.add(key);
      button.setPointerCapture?.(event.pointerId);
    };
    const end = (event: PointerEvent): void => {
      event.preventDefault();
      pressedButtons.delete(key);
    };
    button.addEventListener('pointerdown', onStart);
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end);
    button.addEventListener('pointerleave', end);
    buttonHandlers.push({ element: button, start: onStart, end });
  }

  return {
    controls,
    getDirection,
    destroy: () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      for (const { element, start, end } of buttonHandlers) {
        element.removeEventListener('pointerdown', start);
        element.removeEventListener('pointerup', end);
        element.removeEventListener('pointercancel', end);
        element.removeEventListener('pointerleave', end);
      }
      pressedKeys.clear();
      pressedButtons.clear();
      controls.remove();
    },
  };
}
