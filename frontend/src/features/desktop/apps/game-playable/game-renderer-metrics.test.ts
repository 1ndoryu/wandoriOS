import { describe, expect, it } from 'vitest';
import { readRendererMetrics } from './game-renderer-metrics';

describe('readRendererMetrics', () => {
  it('normalizes renderer.info and optional heap values', () => {
    expect(readRendererMetrics({
      render: { calls: 7, triangles: 120, lines: 4, points: 2 },
      memory: { geometries: 9, textures: 3 },
    }, {
      usedJSHeapSize: 1024,
      jsHeapSizeLimit: 4096,
    })).toEqual({
      rendererInfoAvailable: true,
      rendererMemoryAvailable: true,
      drawCalls: 7,
      triangles: 120,
      lines: 4,
      points: 2,
      geometries: 9,
      textures: 3,
      jsHeapUsedBytes: 1024,
      jsHeapLimitBytes: 4096,
    });
  });

  it('uses safe zero defaults and omits invalid optional memory', () => {
    expect(readRendererMetrics({
      render: { calls: -1, triangles: Number.NaN },
      memory: { geometries: Number.POSITIVE_INFINITY },
    }, {
      usedJSHeapSize: -1,
      jsHeapSizeLimit: Number.NaN,
    })).toEqual({
      rendererInfoAvailable: true,
      rendererMemoryAvailable: true,
      drawCalls: 0,
      triangles: 0,
      lines: 0,
      points: 0,
      geometries: 0,
      textures: 0,
    });
  });

  it('keeps render metrics available when Three omits optional memory info', () => {
    expect(readRendererMetrics({
      render: { calls: 2, triangles: 20 },
    })).toMatchObject({
      rendererInfoAvailable: true,
      rendererMemoryAvailable: false,
      drawCalls: 2,
      triangles: 20,
    });
  });

  it('does not treat memory-only info as render metrics', () => {
    expect(readRendererMetrics({
      memory: { geometries: 2, textures: 1 },
    })).toMatchObject({
      rendererInfoAvailable: false,
      rendererMemoryAvailable: true,
    });
  });

  it('accepts an empty renderer info object', () => {
    expect(readRendererMetrics({})).toEqual({
      rendererInfoAvailable: false,
      rendererMemoryAvailable: false,
      drawCalls: 0,
      triangles: 0,
      lines: 0,
      points: 0,
      geometries: 0,
      textures: 0,
    });
  });
});
