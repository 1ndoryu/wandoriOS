import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attachCameraModeShortcut,
  cycleCameraMode,
  isCameraCycleEvent,
  isCameraMode,
} from './game-camera-modes';

describe('modos de cámara del toolkit (138A-7)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('isCameraMode acepta solo los modos del contrato', () => {
    expect(isCameraMode('libre')).toBe(true);
    expect(isCameraMode('primera')).toBe(true);
    expect(isCameraMode('tercera')).toBe(true);
    expect(isCameraMode('orbit')).toBe(false);
    expect(isCameraMode(undefined)).toBe(false);
    expect(isCameraMode(null)).toBe(false);
  });

  it('cycleCameraMode recorre libre → primera → tercera → libre', () => {
    expect(cycleCameraMode('libre')).toBe('primera');
    expect(cycleCameraMode('primera')).toBe('tercera');
    expect(cycleCameraMode('tercera')).toBe('libre');
  });

  it('isCameraCycleEvent solo acepta la tecla C fuera de campos editables', () => {
    const keyEvent = (key: string): KeyboardEvent =>
      new KeyboardEvent('keydown', { key, bubbles: true });
    const captured = (element: EventTarget, event: KeyboardEvent): KeyboardEvent => {
      let result: KeyboardEvent | null = null;
      element.addEventListener('keydown', (e) => { result = e as KeyboardEvent; }, { once: true });
      element.dispatchEvent(event);
      return result as unknown as KeyboardEvent;
    };

    expect(isCameraCycleEvent(keyEvent('x'))).toBe(false);
    expect(isCameraCycleEvent(keyEvent('C'))).toBe(true);

    const input = document.createElement('input');
    expect(isCameraCycleEvent(captured(input, keyEvent('c')))).toBe(false);
    const textarea = document.createElement('textarea');
    expect(isCameraCycleEvent(captured(textarea, keyEvent('c')))).toBe(false);
    const select = document.createElement('select');
    expect(isCameraCycleEvent(captured(select, keyEvent('c')))).toBe(false);
    const editable = document.createElement('div');
    /* jsdom no refleja la propiedad contentEditable al atributo; el atributo
     * es el contrato real que el fallback de isCameraCycleEvent revisa. */
    editable.setAttribute('contenteditable', 'true');
    document.body.appendChild(editable);
    expect(isCameraCycleEvent(captured(editable, keyEvent('c')))).toBe(false);
    editable.remove();
    const button = document.createElement('button');
    expect(isCameraCycleEvent(captured(button, keyEvent('c')))).toBe(true);
  });

  it('attachCameraModeShortcut dispara el ciclo con el modo siguiente y se desmonta', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    let current: 'libre' | 'primera' | 'tercera' = 'libre';
    const onCycle = vi.fn<(next: 'libre' | 'primera' | 'tercera') => void>();

    const stop = attachCameraModeShortcut(() => current, onCycle);
    expect(addSpy.mock.calls.some(call => call[0] === 'keydown')).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }));
    expect(onCycle).toHaveBeenCalledWith('primera');
    current = onCycle.mock.calls[0][0];

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }));
    expect(onCycle).toHaveBeenLastCalledWith('tercera');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z' }));
    expect(onCycle).toHaveBeenCalledTimes(2);

    stop();
    expect(removeSpy.mock.calls.some(call => call[0] === 'keydown')).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }));
    expect(onCycle).toHaveBeenCalledTimes(2);
  });
});
