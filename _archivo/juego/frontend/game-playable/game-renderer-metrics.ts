/* GAME-01 — Métricas locales del adaptador Three.
 * No envía datos ni conoce analytics; normaliza renderer.info y memoria opcional
 * para que el controlador pueda exponer evidencia sin romper navegadores.
 */

export interface RendererInfoLike {
  readonly render?: {
    readonly calls?: number;
    readonly triangles?: number;
    readonly lines?: number;
    readonly points?: number;
  };
  readonly memory?: {
    readonly geometries?: number;
    readonly textures?: number;
  };
}

export interface JSHeapMemoryLike {
  readonly usedJSHeapSize?: number;
  readonly jsHeapSizeLimit?: number;
}

export interface GameRendererMetrics {
  /** True when renderer.info.render was available for this snapshot. */
  readonly rendererInfoAvailable: boolean;
  /** True when renderer.info.memory was available for this snapshot. */
  readonly rendererMemoryAvailable: boolean;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly lines: number;
  readonly points: number;
  readonly geometries: number;
  readonly textures: number;
  readonly jsHeapUsedBytes?: number;
  readonly jsHeapLimitBytes?: number;
}

export function readRendererMetrics(
  info: RendererInfoLike,
  memory?: JSHeapMemoryLike,
): GameRendererMetrics {
  const render = info.render ?? {};
  const rendererMemory = info.memory ?? {};
  const metrics: GameRendererMetrics = {
    rendererInfoAvailable: info.render !== undefined,
    rendererMemoryAvailable: info.memory !== undefined,
    drawCalls: nonNegative(render.calls),
    triangles: nonNegative(render.triangles),
    lines: nonNegative(render.lines),
    points: nonNegative(render.points),
    geometries: nonNegative(rendererMemory.geometries),
    textures: nonNegative(rendererMemory.textures),
  };
  const used = finiteNonNegative(memory?.usedJSHeapSize);
  const limit = finiteNonNegative(memory?.jsHeapSizeLimit);
  return {
    ...metrics,
    ...(used === undefined ? {} : { jsHeapUsedBytes: used }),
    ...(limit === undefined ? {} : { jsHeapLimitBytes: limit }),
  };
}

export function readAvailableHeapMemory(): JSHeapMemoryLike | undefined {
  if (typeof performance === 'undefined') return undefined;
  const candidate = performance as Performance & { readonly memory?: JSHeapMemoryLike };
  return candidate.memory;
}

function nonNegative(value: number | undefined): number {
  return finiteNonNegative(value) ?? 0;
}

function finiteNonNegative(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}
