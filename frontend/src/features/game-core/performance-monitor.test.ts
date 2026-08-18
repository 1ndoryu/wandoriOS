import { describe, expect, it } from 'vitest';
import { FramePerformanceMonitor } from './performance-monitor';

describe('FramePerformanceMonitor', () => {
  it('reports p50, p95, max and over-budget frames', () => {
    const monitor = new FramePerformanceMonitor({ budgetMs: 16.7, maxSamples: 5 });
    [8, 12, 16, 20, 24].forEach(value => monitor.record(value));

    expect(monitor.snapshot()).toEqual({
      sampleCount: 5,
      p50Ms: 16,
      p95Ms: 24,
      maxMs: 24,
      overBudgetFrames: 2,
    });
  });

  it('keeps only the configured recent window and can reset', () => {
    const monitor = new FramePerformanceMonitor({ budgetMs: 10, maxSamples: 3 });
    [12, 4, 6, 8].forEach(value => monitor.record(value));

    expect(monitor.snapshot()).toEqual({
      sampleCount: 3,
      p50Ms: 6,
      p95Ms: 8,
      maxMs: 8,
      overBudgetFrames: 0,
    });
    monitor.reset();
    expect(monitor.snapshot().sampleCount).toBe(0);
  });

  it('rejects invalid configuration and samples', () => {
    expect(() => new FramePerformanceMonitor({ budgetMs: 0 })).toThrow('budgetMs');
    expect(() => new FramePerformanceMonitor({ maxSamples: 1 })).toThrow('maxSamples');
    const monitor = new FramePerformanceMonitor();
    expect(() => monitor.record(-1)).toThrow('duración');
  });
});
