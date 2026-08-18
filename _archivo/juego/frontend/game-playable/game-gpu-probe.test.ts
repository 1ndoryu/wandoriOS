import { describe, expect, it } from 'vitest';
import {
  createGpuFrameProbe,
  estimateGpuMemory,
  GPU_PROBE_CONSTANTS,
  readGpuIdentity,
  type GpuProbeContext,
  type GpuTimerContext,
  type GpuTimerQueryLike,
} from './game-gpu-probe';

function fakeContext(overrides: Partial<GpuProbeContext> = {}): GpuProbeContext {
  const extensionMap = new Map<string, unknown>();
  return {
    getExtension(name) { return extensionMap.get(name) ?? null; },
    getParameter() { return null; },
    UNMASKED_VENDOR_WEBGL: 0x9246,
    UNMASKED_RENDERER_WEBGL: 0x9247,
    ...overrides,
    _extensions: extensionMap,
  } as GpuProbeContext & { _extensions: Map<string, unknown> };
}

function setExtension(context: GpuProbeContext, name: string, value: unknown): void {
  (context as GpuProbeContext & { _extensions: Map<string, unknown> })._extensions.set(name, value);
}

describe('readGpuIdentity', () => {
  it('reads vendor and renderer from WEBGL_debug_renderer_info', () => {
    const context = fakeContext({
      getParameter: (parameter) => {
        if (parameter === 0x9246) return 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)';
        if (parameter === 0x9247) return 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)';
        return null;
      },
    });
    setExtension(context, 'WEBGL_debug_renderer_info', {});

    expect(readGpuIdentity(context)).toEqual({
      vendor: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)',
      renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)',
    });
  });

  it('returns null when the extension or strings are unavailable', () => {
    expect(readGpuIdentity(fakeContext())).toBeNull();

    const noStrings = fakeContext({ getParameter: () => '' });
    setExtension(noStrings, 'WEBGL_debug_renderer_info', {});
    expect(readGpuIdentity(noStrings)).toBeNull();
  });
});

describe('estimateGpuMemory', () => {
  it('sums texture bytes and geometry bytes independently', () => {
    const estimate = estimateGpuMemory(
      [
        { width: 256, height: 256, bytesPerPixel: 4 },
        { width: 128, height: 128, bytesPerPixel: 4 },
      ],
      [
        { vertexCount: 1_024, bytesPerVertex: 32 },
        { vertexCount: 512, bytesPerVertex: 32 },
      ],
    );

    expect(estimate.textureBytes).toBe(256 * 256 * 4 + 128 * 128 * 4);
    expect(estimate.geometryBytes).toBe(1_024 * 32 + 512 * 32);
    expect(estimate.totalBytes).toBe(estimate.textureBytes + estimate.geometryBytes);
  });

  it('clamps invalid entries to zero but never to negative values', () => {
    const estimate = estimateGpuMemory(
      [{ width: -1, height: 0, bytesPerPixel: -2 }],
      [{ vertexCount: -5, bytesPerVertex: -1 }],
    );

    expect(estimate.textureBytes).toBe(0);
    expect(estimate.geometryBytes).toBe(0);
    expect(estimate.totalBytes).toBe(0);
  });
});

describe('createGpuFrameProbe', () => {
  function timerContext(
    parameters: Record<string, unknown>,
  ): { context: GpuTimerContext; extension: GpuTimerQueryLike } {
    const extension: GpuTimerQueryLike = {
      beginQuery: () => {},
      endQuery: () => {},
      getQueryParameter: (_query, parameter) => parameters[String(parameter)] ?? false,
      deleteQuery: () => {},
    };
    const context = fakeContext() as GpuTimerContext;
    (context as { timerExtension?: GpuTimerQueryLike }).timerExtension = extension;
    context.createQuery = () => ({});
    context.TIME_ELAPSED_EXT = 0x88bf;
    context.QUERY_RESULT_AVAILABLE_EXT = 0x8867;
    context.QUERY_RESULT_EXT = 0x8866;
    return { context, extension };
  }

  it('reports unavailable when the timer extension is missing', () => {
    const probe = createGpuFrameProbe(fakeContext() as GpuTimerContext);

    expect(probe.available).toBe(false);
    expect(probe.readFrameMs()).toBeNull();
    probe.dispose();
  });

  it('returns null until the query result is available', () => {
    const { context } = timerContext({});
    const probe = createGpuFrameProbe(context);

    probe.beginFrame();
    probe.endFrame();
    expect(probe.readFrameMs()).toBeNull();

    probe.dispose();
  });

  it('converts nanoseconds to milliseconds once available', () => {
    const { context } = timerContext({ 0x8867: true, 0x8866: 16_700_000 });
    const probe = createGpuFrameProbe(context);

    probe.beginFrame();
    probe.endFrame();
    expect(probe.readFrameMs()).toBeCloseTo(16.7);

    probe.dispose();
  });

  it('tracks the extension name constant for the WebGL2 timer query', () => {
    expect(GPU_PROBE_CONSTANTS.timerQueryExtension).toBe('EXT_disjoint_timer_query_webgl2');
  });
});
