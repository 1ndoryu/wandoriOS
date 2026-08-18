/* GAME-01 — Diagnóstico de capacidades WebGL.
 * El probe es pequeño y aislado del renderer Three. Usa una fábrica inyectable
 * para poder probar fallback y liberar el contexto temporal sin WebGL real.
 */

export type WebGLContextKind = 'webgl2' | 'webgl';

export interface WebGLCapabilities {
  readonly available: boolean;
  readonly kind?: WebGLContextKind;
  readonly reason?: string;
}

interface ProbeContext {
  getExtension?: (name: string) => { loseContext?: () => void } | null;
}

interface ProbeCanvas {
  getContext: (kind: WebGLContextKind) => ProbeContext | null;
}

export type WebGLCanvasFactory = () => ProbeCanvas;

export function detectWebGL(canvasFactory: WebGLCanvasFactory = createBrowserCanvas): WebGLCapabilities {
  let canvas: ProbeCanvas | undefined;
  try {
    canvas = canvasFactory();
    for (const kind of ['webgl2', 'webgl'] as const) {
      const context = canvas.getContext(kind);
      if (!context) continue;
      releaseProbeContext(context);
      return { available: true, kind };
    }
    return { available: false, reason: 'el navegador no expone un contexto WebGL compatible' };
  } catch {
    return { available: false, reason: 'el contexto WebGL fue rechazado por el navegador o el dispositivo' };
  } finally {
    canvas = undefined;
  }
}

function createBrowserCanvas(): ProbeCanvas {
  if (typeof document === 'undefined') {
    throw new Error('document no disponible');
  }
  return document.createElement('canvas') as unknown as ProbeCanvas;
}

function releaseProbeContext(context: ProbeContext): void {
  context.getExtension?.('WEBGL_lose_context')?.loseContext?.();
}
