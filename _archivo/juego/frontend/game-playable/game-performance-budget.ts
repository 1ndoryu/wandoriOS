/* GAME-01 — Evaluación local del presupuesto del fixture.
 * Lee solo métricas ya normalizadas: no mide GPU física, no envía analytics y
 * conserva UNKNOWN cuando el navegador no ofrece heap o faltan muestras.
 */

import type { FramePerformanceSnapshot } from '../../../game-core';
import type { GameRendererMetrics } from './game-renderer-metrics';

export const GAME_PERFORMANCE_BUDGET = {
  frameP95Ms: 16.7,
  drawCalls: 40,
  triangles: 100_000,
  geometries: 80,
  textures: 32,
  jsHeapUsedBytes: 256 * 1024 * 1024,
  minimumFrameSamples: 30,
} as const;

export type PerformanceBudgetStatus = 'pass' | 'fail' | 'unknown';

export interface PerformanceBudgetMetric {
  readonly status: PerformanceBudgetStatus;
  readonly value?: number;
  readonly limit: number;
}

export interface GamePerformanceBudgetReport {
  readonly status: PerformanceBudgetStatus;
  readonly frame: PerformanceBudgetMetric;
  readonly drawCalls: PerformanceBudgetMetric;
  readonly triangles: PerformanceBudgetMetric;
  readonly geometries: PerformanceBudgetMetric;
  readonly textures: PerformanceBudgetMetric;
  readonly jsHeapUsedBytes: PerformanceBudgetMetric;
}

export function evaluateGamePerformanceBudget(
  frame: FramePerformanceSnapshot,
  renderer: GameRendererMetrics,
): GamePerformanceBudgetReport {
  const report = {
    frame: evaluateMetric(
      frame.sampleCount < GAME_PERFORMANCE_BUDGET.minimumFrameSamples ? undefined : frame.p95Ms,
      GAME_PERFORMANCE_BUDGET.frameP95Ms,
    ),
    drawCalls: evaluateMetric(
      renderer.rendererInfoAvailable ? renderer.drawCalls : undefined,
      GAME_PERFORMANCE_BUDGET.drawCalls,
    ),
    triangles: evaluateMetric(
      renderer.rendererInfoAvailable ? renderer.triangles : undefined,
      GAME_PERFORMANCE_BUDGET.triangles,
    ),
    geometries: evaluateMetric(
      renderer.rendererMemoryAvailable ? renderer.geometries : undefined,
      GAME_PERFORMANCE_BUDGET.geometries,
    ),
    textures: evaluateMetric(
      renderer.rendererMemoryAvailable ? renderer.textures : undefined,
      GAME_PERFORMANCE_BUDGET.textures,
    ),
    jsHeapUsedBytes: evaluateMetric(renderer.jsHeapUsedBytes, GAME_PERFORMANCE_BUDGET.jsHeapUsedBytes),
  } satisfies Omit<GamePerformanceBudgetReport, 'status'>;

  const statuses = Object.values(report).map(metric => metric.status);
  const status: PerformanceBudgetStatus = statuses.includes('fail')
    ? 'fail'
    : statuses.includes('unknown')
      ? 'unknown'
      : 'pass';
  return { status, ...report };
}

function evaluateMetric(value: number | undefined, limit: number): PerformanceBudgetMetric {
  if (value === undefined) return { status: 'unknown', limit };
  return { status: value <= limit ? 'pass' : 'fail', value, limit };
}
