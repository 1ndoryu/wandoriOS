import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateBudgets } from '../performance-budget.mjs';

const budgets = { entryJsGzipBytes: 100, entryCssGzipBytes: 50, largestChunkGzipBytes: 150 };

test('performance budget acepta entrypoints y chunks bajo el límite', () => {
  const result = evaluateBudgets([
    { name: 'index-abc.js', gzipBytes: 90 },
    { name: 'index-abc.css', gzipBytes: 40 },
    { name: 'feature.js', gzipBytes: 140 },
  ], budgets);

  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.measurements, {
    entryJsGzipBytes: 90,
    entryCssGzipBytes: 40,
    largestChunkGzipBytes: 140,
  });
});

test('performance budget reporta excedentes y assets faltantes', () => {
  const result = evaluateBudgets([{ name: 'feature.js', gzipBytes: 151 }], budgets);

  assert.deepEqual(result.violations, [
    'entryJsGzipBytes: asset requerido ausente o budget inválido',
    'entryCssGzipBytes: asset requerido ausente o budget inválido',
    'largestChunkGzipBytes: 151 B > 150 B',
  ]);
});
