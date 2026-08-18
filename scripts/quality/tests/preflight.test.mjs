import assert from 'node:assert/strict';
import test from 'node:test';
import { validateQualityConfig } from '../preflight.mjs';

const valid = {
  schemaVersion: 1, maxFindings: 3, maxReminders: 4, maxTerminalLines: 20,
  lockWaitMs: 0, maxConcurrentStages: 1,
  timeoutsMs: { sentinel: 1000 }, fullPatterns: ['frontend/'], profiles: { frontend: ['frontend/'] },
  performanceBudgets: { entryJsGzipBytes: 1, entryCssGzipBytes: 1, largestChunkGzipBytes: 1 },
  heavyRun: { cooldownMinutes: 180, maxTargetGb: 15, maxTargetAgeDays: 7, maxConcurrent: 1 },
};

test('preflight rechaza claves desconocidas y límites inválidos', () => {
  assert.doesNotThrow(() => validateQualityConfig(valid));
  assert.throws(() => validateQualityConfig({ ...valid, unknown: true }), /claves desconocidas/);
  assert.throws(() => validateQualityConfig({ ...valid, maxConcurrentStages: 0 }), /maxConcurrentStages/);
  assert.throws(() => validateQualityConfig({ ...valid, timeoutsMs: { sentinel: 0 } }), /timeoutsMs/);
});
