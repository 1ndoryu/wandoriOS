import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bindLongPress, bindLongPressDrag } from './mobile-gestures';

function pointerEvent(
  type: string,
  pointerId: number,
  x: number,
  y: number,
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: 0 },
    clientX: { value: x },
    clientY: { value: y },
    pointerId: { value: pointerId },
  });
  return event;
}

describe('bindLongPress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('ejecuta una sola vez después del umbral y bloquea el click sintético', () => {
    const element = document.createElement('button');
    const onLongPress = vi.fn();
    const click = vi.fn();
    element.addEventListener('click', click);
    const binding = bindLongPress(element, { onLongPress });

    element.dispatchEvent(pointerEvent('pointerdown', 1, 10, 10));
    vi.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledTimes(1);

    element.dispatchEvent(pointerEvent('pointerup', 1, 10, 10));
    const syntheticClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    expect(element.dispatchEvent(syntheticClick)).toBe(false);
    expect(click).not.toHaveBeenCalled();

    binding.destroy();
  });

  it('cancela el gesto si el puntero se mueve más del umbral', () => {
    const element = document.createElement('button');
    const onLongPress = vi.fn();
    const binding = bindLongPress(element, { onLongPress });

    element.dispatchEvent(pointerEvent('pointerdown', 2, 10, 10));
    element.dispatchEvent(pointerEvent('pointermove', 2, 25, 10));
    vi.advanceTimersByTime(500);

    expect(onLongPress).not.toHaveBeenCalled();
    binding.destroy();
  });

  it('permite el siguiente click si no hubo click sintético tras el long press', () => {
    const element = document.createElement('button');
    const onLongPress = vi.fn();
    const click = vi.fn();
    element.addEventListener('click', click);
    const binding = bindLongPress(element, { onLongPress });

    element.dispatchEvent(pointerEvent('pointerdown', 4, 10, 10));
    vi.advanceTimersByTime(500);
    element.dispatchEvent(pointerEvent('pointerup', 4, 10, 10));
    element.dispatchEvent(pointerEvent('pointerdown', 5, 10, 10));
    element.dispatchEvent(pointerEvent('pointerup', 5, 10, 10));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(click).toHaveBeenCalledTimes(1);
    binding.destroy();
  });

  it('distingue long press con menú de transición a drag', () => {
    const element = document.createElement('button');
    const onLongPress = vi.fn();
    const onLongPressEnd = vi.fn();
    const onDragStart = vi.fn();
    const onDragMove = vi.fn();
    const onDragEnd = vi.fn();
    const binding = bindLongPressDrag(element, {
      onLongPress,
      onLongPressEnd,
      onDragStart,
      onDragMove,
      onDragEnd,
    });

    element.dispatchEvent(pointerEvent('pointerdown', 6, 10, 10));
    vi.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    element.dispatchEvent(pointerEvent('pointerup', 6, 10, 10));
    expect(onLongPressEnd).toHaveBeenCalledTimes(1);
    expect(onDragStart).not.toHaveBeenCalled();

    element.dispatchEvent(pointerEvent('pointerdown', 7, 10, 10));
    vi.advanceTimersByTime(500);
    element.dispatchEvent(pointerEvent('pointermove', 7, 25, 10));
    element.dispatchEvent(pointerEvent('pointermove', 7, 30, 12));
    element.dispatchEvent(pointerEvent('pointerup', 7, 30, 12));
    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onDragMove).toHaveBeenCalledTimes(2);
    expect(onDragEnd).toHaveBeenCalledTimes(1);
    expect(onLongPressEnd).toHaveBeenCalledTimes(1);

    binding.destroy();
  });

  it('limpia el drag pendiente y no emite callbacks después de destroy', () => {
    const element = document.createElement('button');
    const callbacks = {
      onLongPress: vi.fn(),
      onLongPressEnd: vi.fn(),
      onDragStart: vi.fn(),
      onDragMove: vi.fn(),
      onDragEnd: vi.fn(),
    };
    const binding = bindLongPressDrag(element, callbacks);

    element.dispatchEvent(pointerEvent('pointerdown', 8, 10, 10));
    vi.advanceTimersByTime(500);
    element.dispatchEvent(pointerEvent('pointermove', 8, 30, 10));
    binding.destroy();
    element.dispatchEvent(pointerEvent('pointermove', 8, 40, 10));
    element.dispatchEvent(pointerEvent('pointerup', 8, 40, 10));

    expect(callbacks.onDragStart).toHaveBeenCalledTimes(1);
    expect(callbacks.onDragEnd).not.toHaveBeenCalled();
    expect(callbacks.onDragMove).toHaveBeenCalledTimes(1);
  });

  it('cancela el timer y listeners al destruirse', () => {
    const element = document.createElement('button');
    const onLongPress = vi.fn();
    const binding = bindLongPress(element, { onLongPress });

    element.dispatchEvent(pointerEvent('pointerdown', 3, 10, 10));
    binding.destroy();
    vi.advanceTimersByTime(500);

    expect(onLongPress).not.toHaveBeenCalled();
  });
});
