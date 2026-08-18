import { describe, expect, it, vi } from 'vitest';
import { detectWebGL } from './game-webgl-capabilities';

describe('detectWebGL', () => {
  it('prefers WebGL2 and releases the temporary probe context', () => {
    const loseContext = vi.fn();
    const getExtension = vi.fn(() => ({ loseContext }));
    const getContext = vi.fn(() => ({ getExtension }));

    const result = detectWebGL(() => ({ getContext }));

    expect(result).toEqual({ available: true, kind: 'webgl2' });
    expect(getContext).toHaveBeenCalledWith('webgl2');
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(getExtension).toHaveBeenCalledWith('WEBGL_lose_context');
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it('falls back to WebGL when WebGL2 is unavailable', () => {
    const getContext = vi.fn((kind: 'webgl2' | 'webgl') => (
      kind === 'webgl2' ? null : { getExtension: () => null }
    ));

    const result = detectWebGL(() => ({ getContext }));

    expect(result).toEqual({ available: true, kind: 'webgl' });
    expect(getContext).toHaveBeenNthCalledWith(1, 'webgl2');
    expect(getContext).toHaveBeenNthCalledWith(2, 'webgl');
  });

  it('returns an accessible reason when no context is available', () => {
    const result = detectWebGL(() => ({ getContext: () => null }));

    expect(result.available).toBe(false);
    expect(result.reason).toContain('no expone');
  });

  it('fails closed when canvas creation or probing throws', () => {
    const result = detectWebGL(() => {
      throw new Error('blocked');
    });

    expect(result).toEqual({
      available: false,
      reason: 'el contexto WebGL fue rechazado por el navegador o el dispositivo',
    });
  });
});
