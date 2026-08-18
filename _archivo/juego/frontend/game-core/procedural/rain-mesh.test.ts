import { describe, expect, it } from 'vitest';
import { buildRainStreakData, RAIN_MESH_MAX_STREAKS } from './rain-mesh';

describe('buildRainStreakData (138A-3)', () => {
  it('es determinista con el mismo seed', () => {
    const opts = { count: 64, area: 26, span: 21, seed: 7 };
    const a = buildRainStreakData(opts);
    const b = buildRainStreakData(opts);
    expect(a.positions).toEqual(b.positions);
    expect(a.random).toEqual(b.random);
  });

  it('cambia la distribución con un seed distinto', () => {
    const base = { count: 64, area: 26, span: 21 };
    const a = buildRainStreakData({ ...base, seed: 1 });
    const b = buildRainStreakData({ ...base, seed: 2 });
    expect(a.random).not.toEqual(b.random);
  });

  it('emite pares de offsets verticales con la longitud pedida', () => {
    const m = buildRainStreakData({ count: 10, area: 26, span: 21, length: 0.55 });
    expect(m.positions.length).toBe(10 * 2 * 3);
    expect(m.random.length).toBe(10 * 2 * 3);
    for (let i = 0; i < 10; i += 1) {
      const start = i * 2 * 3;
      const end = start + 3;
      expect(m.positions[start]).toBe(0);
      expect(m.positions[start + 1]).toBe(0);
      expect(m.positions[start + 2]).toBe(0);
      expect(m.positions[end]).toBe(0);
      expect(m.positions[end + 1]).toBeCloseTo(-0.55);
      expect(m.positions[end + 2]).toBe(0);
    }
  });

  it('mantiene cada gota dentro del radio y el phase dentro del span', () => {
    const m = buildRainStreakData({ count: 256, area: 26, span: 21 });
    for (let i = 0; i < m.count; i += 1) {
      const o = i * 2 * 3;
      const cx = m.random[o];
      const phase = m.random[o + 1];
      const cz = m.random[o + 2];
      expect(Math.hypot(cx, cz)).toBeLessThanOrEqual(m.area);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(m.span);
      expect(m.random[o + 3]).toBe(cx);
      expect(m.random[o + 4]).toBe(phase);
      expect(m.random[o + 5]).toBe(cz);
    }
  });

  it('rechaza opciones inválidas', () => {
    expect(() => buildRainStreakData({ count: 0, area: 26, span: 21 })).toThrow('gotas');
    expect(() => buildRainStreakData({
      count: RAIN_MESH_MAX_STREAKS + 1, area: 26, span: 21,
    })).toThrow('gotas');
    expect(() => buildRainStreakData({ count: 4.5, area: 26, span: 21 })).toThrow('gotas');
    expect(() => buildRainStreakData({ count: 10, area: 0, span: 21 })).toThrow('parámetros');
    expect(() => buildRainStreakData({ count: 10, area: 26, span: -3 })).toThrow('parámetros');
    expect(() => buildRainStreakData({ count: 10, area: 26, span: 21, length: 0 })).toThrow('parámetros');
    expect(() => buildRainStreakData({ count: 10, area: 26, span: 21, speed: -1 })).toThrow('parámetros');
  });
});
