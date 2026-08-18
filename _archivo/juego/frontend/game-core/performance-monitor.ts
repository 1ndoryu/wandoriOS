/* GAME-01 — Métricas locales de frame.
 * No envía analytics ni conoce DOM: solo ofrece una ventana acotada de muestras
 * para validar p50/p95 y frames que superan el presupuesto.
 */

export interface FramePerformanceSnapshot {
  readonly sampleCount: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly overBudgetFrames: number;
}

export interface FramePerformanceOptions {
  readonly budgetMs?: number;
  readonly maxSamples?: number;
}

const DEFAULT_BUDGET_MS = 16.7;
const DEFAULT_MAX_SAMPLES = 120;

export class FramePerformanceMonitor {
  private readonly samples: number[] = [];
  private readonly budgetMs: number;
  private readonly maxSamples: number;
  private overBudgetFrames = 0;

  public constructor(options: FramePerformanceOptions = {}) {
    this.budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
    this.maxSamples = options.maxSamples ?? DEFAULT_MAX_SAMPLES;
    if (!Number.isFinite(this.budgetMs) || this.budgetMs <= 0) {
      throw new Error('budgetMs inválido');
    }
    if (!Number.isSafeInteger(this.maxSamples) || this.maxSamples < 2) {
      throw new Error('maxSamples inválido');
    }
  }

  public record(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new Error('duración de frame inválida');
    }
    this.samples.push(durationMs);
    if (durationMs > this.budgetMs) this.overBudgetFrames += 1;
    if (this.samples.length > this.maxSamples) {
      const removed = this.samples.shift();
      if (removed !== undefined && removed > this.budgetMs) this.overBudgetFrames -= 1;
    }
  }

  public snapshot(): FramePerformanceSnapshot {
    const sorted = [...this.samples].sort((a, b) => a - b);
    return {
      sampleCount: sorted.length,
      p50Ms: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
      maxMs: sorted.at(-1) ?? 0,
      overBudgetFrames: this.overBudgetFrames,
    };
  }

  public reset(): void {
    this.samples.length = 0;
    this.overBudgetFrames = 0;
  }
}

function percentile(sorted: readonly number[], rank: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * rank) - 1);
  return sorted[index];
}
