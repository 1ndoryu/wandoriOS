import { describe, expect, it } from 'vitest';
import {
  evaluateGamePerformanceBudget,
  GAME_PERFORMANCE_BUDGET,
} from './game-performance-budget';
import type { GameRendererMetrics } from './game-renderer-metrics';
import type { FramePerformanceSnapshot } from '../../../game-core';

const frame = (sampleCount: number, p95Ms: number): FramePerformanceSnapshot => ({
  sampleCount,
  p50Ms: p95Ms,
  p95Ms,
  maxMs: p95Ms,
  overBudgetFrames: 0,
});

const renderer = (overrides: Partial<GameRendererMetrics> = {}): GameRendererMetrics => ({
  rendererInfoAvailable: true,
  rendererMemoryAvailable: true,
  drawCalls: 8,
  triangles: 12_000,
  lines: 0,
  points: 0,
  geometries: 12,
  textures: 4,
  ...overrides,
});

describe('evaluateGamePerformanceBudget', () => {
  it('passes when all observed values are within the local budget', () => {
    const report = evaluateGamePerformanceBudget(frame(30, 12), renderer({
      jsHeapUsedBytes: 32 * 1024 * 1024,
    }));

    expect(report.status).toBe('pass');
    expect(report.frame.status).toBe('pass');
    expect(report.jsHeapUsedBytes.status).toBe('pass');
  });

  it('fails when a required renderer or frame metric exceeds its limit', () => {
    const report = evaluateGamePerformanceBudget(frame(30, GAME_PERFORMANCE_BUDGET.frameP95Ms + 1), renderer({
      drawCalls: GAME_PERFORMANCE_BUDGET.drawCalls + 1,
    }));

    expect(report.status).toBe('fail');
    expect(report.frame.status).toBe('fail');
    expect(report.drawCalls.status).toBe('fail');
  });

  it('keeps the result unknown until enough samples and heap data exist', () => {
    const report = evaluateGamePerformanceBudget(frame(1, 1), renderer());

    expect(report.status).toBe('unknown');
    expect(report.frame.status).toBe('unknown');
    expect(report.jsHeapUsedBytes.status).toBe('unknown');
  });

  it('does not hide a failed metric behind an unavailable optional heap metric', () => {
    const report = evaluateGamePerformanceBudget(frame(30, 12), renderer({
      triangles: GAME_PERFORMANCE_BUDGET.triangles + 1,
    }));

    expect(report.status).toBe('fail');
    expect(report.triangles.status).toBe('fail');
    expect(report.jsHeapUsedBytes.status).toBe('unknown');
  });

  it('keeps memory metrics unknown when renderer.info.memory is unavailable', () => {
    const report = evaluateGamePerformanceBudget(frame(30, 12), renderer({
      rendererMemoryAvailable: false,
    }));

    expect(report.status).toBe('unknown');
    expect(report.drawCalls.status).toBe('pass');
    expect(report.geometries.status).toBe('unknown');
    expect(report.textures.status).toBe('unknown');
  });

  it('keeps render metrics unknown when renderer.info.render is unavailable', () => {
    const report = evaluateGamePerformanceBudget(frame(30, 12), renderer({
      rendererInfoAvailable: false,
    }));

    expect(report.status).toBe('unknown');
    expect(report.drawCalls.status).toBe('unknown');
    expect(report.triangles.status).toBe('unknown');
    expect(report.geometries.status).toBe('pass');
  });
});
