/* GAME-01 — Probe físico de GPU y memoria para el fixture del Bosque.
 * Lee identidad de GPU (WEBGL_debug_renderer_info), tiempo de frame GPU
 * (EXT_disjoint_timer_query) y bytes estimados de texturas/geometrías desde
 * el contexto WebGL real. El contexto se inyecta para poder probarlo con fakes.
 * No envía datos: solo expone evidencia local como datasets del fixture.
 */

export interface GpuProbeContext {
  getExtension(name: string): unknown | null;
  getParameter(parameter: number): unknown;
  UNMASKED_VENDOR_WEBGL: number;
  UNMASKED_RENDERER_WEBGL: number;
}

export interface GpuIdentity {
  readonly vendor: string;
  readonly renderer: string;
}

export interface GpuTextureEntry {
  readonly width: number;
  readonly height: number;
  readonly bytesPerPixel: number;
}

export interface GpuGeometryEntry {
  readonly vertexCount: number;
  readonly bytesPerVertex: number;
}

export interface GpuMemoryEstimate {
  readonly textureBytes: number;
  readonly geometryBytes: number;
  readonly totalBytes: number;
}

export interface GpuFrameProbe {
  readonly available: boolean;
  beginFrame(): void;
  endFrame(): void;
  /** Tiempo de frame GPU en ms cuando la query ya está disponible; si no, null. */
  readFrameMs(): number | null;
  dispose(): void;
}

export const GPU_PROBE_CONSTANTS = {
  bytesPerPixelRGBA: 4,
  timerQueryExtension: 'EXT_disjoint_timer_query_webgl2',
} as const;

export function readGpuIdentity(context: GpuProbeContext): GpuIdentity | null {
  const extension = context.getExtension('WEBGL_debug_renderer_info');
  if (!extension) return null;
  const vendor = context.getParameter(context.UNMASKED_VENDOR_WEBGL);
  const renderer = context.getParameter(context.UNMASKED_RENDERER_WEBGL);
  if (typeof vendor !== 'string' || vendor.length === 0
    || typeof renderer !== 'string' || renderer.length === 0) {
    return null;
  }
  return { vendor, renderer };
}

export function estimateGpuMemory(
  textures: readonly GpuTextureEntry[],
  geometries: readonly GpuGeometryEntry[],
): GpuMemoryEstimate {
  const textureBytes = textures.reduce((total, texture) => {
    if (!finitePositive(texture.width) || !finitePositive(texture.height)
      || !finitePositive(texture.bytesPerPixel)) {
      return total;
    }
    return total + texture.width * texture.height * texture.bytesPerPixel;
  }, 0);
  const geometryBytes = geometries.reduce((total, geometry) => {
    if (!finiteNonNegative(geometry.vertexCount) || !finitePositive(geometry.bytesPerVertex)) {
      return total;
    }
    return total + geometry.vertexCount * geometry.bytesPerVertex;
  }, 0);
  return {
    textureBytes,
    geometryBytes,
    totalBytes: textureBytes + geometryBytes,
  };
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function finiteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function resolveTimerExtension(context: GpuTimerContext): GpuTimerQueryLike | null {
  if (context.timerExtension) return context.timerExtension;
  const candidate = context.getExtension(GPU_PROBE_CONSTANTS.timerQueryExtension);
  if (!candidate || typeof candidate !== 'object') return null;
  const extension = candidate as Partial<GpuTimerQueryLike>;
  if (typeof extension.beginQuery !== 'function'
    || typeof extension.endQuery !== 'function'
    || typeof extension.getQueryParameter !== 'function'
    || typeof extension.deleteQuery !== 'function') {
    return null;
  }
  return extension as GpuTimerQueryLike;
}

export interface GpuTimerQueryLike {
  beginQuery(target: number, query: object): void;
  endQuery(target: number): void;
  getQueryParameter(query: object, parameter: number): unknown;
  deleteQuery(query: object): void;
}

export interface GpuTimerContext extends GpuProbeContext {
  createQuery(): object;
  TIME_ELAPSED_EXT: number;
  QUERY_RESULT_AVAILABLE_EXT: number;
  QUERY_RESULT_EXT: number;
  readonly timerExtension?: GpuTimerQueryLike;
}

/** Medición física del tiempo de frame en GPU con EXT_disjoint_timer_query.
 * El navegador la entrega de forma asíncrona: tras endFrame(), la query está
 * disponible un frame después; readFrameMs() devuelve null mientras no lo esté. */
export function createGpuFrameProbe(context: GpuTimerContext): GpuFrameProbe {
  const extension = resolveTimerExtension(context);
  if (!extension || typeof context.createQuery !== 'function') {
    return { available: false, beginFrame() {}, endFrame() {}, readFrameMs: () => null, dispose() {} };
  }
  const query = context.createQuery();
  let active = false;
  return {
    available: true,
    beginFrame() {
      extension.beginQuery(context.TIME_ELAPSED_EXT, query);
      active = true;
    },
    endFrame() {
      if (!active) return;
      extension.endQuery(context.TIME_ELAPSED_EXT);
      active = false;
    },
    readFrameMs() {
      const available = extension.getQueryParameter(
        query,
        context.QUERY_RESULT_AVAILABLE_EXT,
      );
      if (available !== true) return null;
      const nanoseconds = extension.getQueryParameter(query, context.QUERY_RESULT_EXT);
      if (typeof nanoseconds !== 'number' || !Number.isFinite(nanoseconds) || nanoseconds < 0) {
        return null;
      }
      return nanoseconds / 1_000_000;
    },
    dispose() {
      if (active) extension.endQuery(context.TIME_ELAPSED_EXT);
      active = false;
      extension.deleteQuery(query);
    },
  };
}
