import { describe, expect, it } from 'vitest';
import { fbm2, hash2, valueNoise } from './noise';

describe('noise determinista (138A-1)', () => {
  it('hash2 devuelve valores en [0, 1) y difiere con el seed', () => {
    for (const [x, y, seed] of [[0, 0, 1], [3, -7, 42], [-11, 5, 1337], [12345, -9999, 7]]) {
      const v = hash2(x, y, seed);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(hash2(0, 0, 1)).not.toBe(hash2(0, 0, 2));
    expect(hash2(0, 0, 1)).not.toBe(hash2(1, 0, 1));
  });

  it('valueNoise y fbm2 son deterministas y acotan su rango', () => {
    const points = [[0, 0], [1.5, 2.5], [-3.2, 4.8], [12.7, -8.1]] as const;
    for (const [x, y] of points) {
      expect(valueNoise(x, y, 7)).toBe(valueNoise(x, y, 7));
      const v = valueNoise(x, y, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      for (const octaves of [1, 3, 8]) {
        const f = fbm2(x, y, 7, octaves);
        expect(f).toBe(fbm2(x, y, 7, octaves));
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(1);
      }
    }
  });

  it('rechaza octavas fuera de rango', () => {
    expect(() => fbm2(0, 0, 1, 0)).toThrow('octaves');
    expect(() => fbm2(0, 0, 1, 9)).toThrow('octaves');
    expect(() => fbm2(0, 0, 1, 1.5)).toThrow('octaves');
  });
});
