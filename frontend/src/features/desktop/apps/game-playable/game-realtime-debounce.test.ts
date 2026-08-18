import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { terrainOptionsPreset } from '../../../game-core';
import { createDebouncedRegenerator } from './game-realtime-debounce';

describe('debounce de regeneración del constructor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('agrupa N cambios rápidos en una sola regeneración con la última opción', () => {
    const regenerate = vi.fn();
    const debounced = createDebouncedRegenerator(200, regenerate);
    const first = terrainOptionsPreset('isla');
    const middle = { ...first, seed: 111 };
    const last = { ...middle, seed: 999 };

    debounced.schedule(first);
    vi.advanceTimersByTime(50);
    debounced.schedule(middle);
    vi.advanceTimersByTime(50);
    debounced.schedule(last);
    vi.advanceTimersByTime(199);
    expect(regenerate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(regenerate).toHaveBeenCalledWith(last);
  });

  it('cancel elimina la regeneración pendiente sin disparar el callback', () => {
    const regenerate = vi.fn();
    const debounced = createDebouncedRegenerator(200, regenerate);

    debounced.schedule(terrainOptionsPreset('valle'));
    debounced.cancel();
    vi.advanceTimersByTime(500);
    expect(regenerate).not.toHaveBeenCalled();
  });

  it('dispose cancela y deja de aceptar nuevas programaciones', () => {
    const regenerate = vi.fn();
    const debounced = createDebouncedRegenerator(200, regenerate);

    debounced.schedule(terrainOptionsPreset('continente'));
    debounced.dispose();
    debounced.schedule(terrainOptionsPreset('isla'));
    vi.advanceTimersByTime(500);
    expect(regenerate).not.toHaveBeenCalled();
  });

  it('una regeneración completada permite programar la siguiente', () => {
    const regenerate = vi.fn();
    const debounced = createDebouncedRegenerator(100, regenerate);
    const a = terrainOptionsPreset('isla');
    const b = { ...a, seed: 42 };

    debounced.schedule(a);
    vi.advanceTimersByTime(100);
    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(regenerate).toHaveBeenCalledWith(a);

    debounced.schedule(b);
    vi.advanceTimersByTime(100);
    expect(regenerate).toHaveBeenCalledTimes(2);
    expect(regenerate).toHaveBeenLastCalledWith(b);
  });
});
