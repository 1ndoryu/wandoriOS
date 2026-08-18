import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArgs } from '../args.mjs';

test('parseArgs exige un task ID válido', () => {
  assert.equal(parseArgs(['297A-6']).taskId, '297A-6');
  assert.throws(() => parseArgs([]), /Uso:/);
  assert.throws(() => parseArgs(['tarea']), /Uso:/);
});

test('parseArgs acepta flags internos conocidos', () => {
  const args = parseArgs(['297A-6', '--fresh', '--allow-heavy', '--base', 'HEAD~1']);
  assert.equal(args.fresh, true);
  assert.equal(args.allowHeavy, true);
  assert.equal(args.base, 'HEAD~1');
});

test('parseArgs extrae perfiles repetidos y exige su valor', () => {
  const args = parseArgs(['297A-6', '--profile', 'docs', '--profile', 'rust']);
  assert.deepEqual(args.profiles, ['docs', 'rust']);
  assert.throws(() => parseArgs(['297A-6', '--profile']), /Falta valor para --profile/);
  assert.throws(() => parseArgs(['297A-6', '--profile', '--full']), /Falta valor para --profile/);
});

test('parseArgs acepta --heavy-reason y exige su valor (028A-16)', () => {
  const args = parseArgs(['297A-6', '--allow-heavy', '--heavy-reason', 'validar clippy de fase']);
  assert.equal(args.allowHeavy, true);
  assert.equal(args.heavyReason, 'validar clippy de fase');
  assert.throws(() => parseArgs(['297A-6', '--heavy-reason']), /Falta valor para --heavy-reason/);
  assert.throws(() => parseArgs(['297A-6', '--heavy-reason', '--full']), /Falta valor para --heavy-reason/);
});

test('parseArgs acepta --scope-manifest para fixtures del benchmark (028A-8)', () => {
  const args = parseArgs(['297A-6', '--scope-manifest', 'fixtures/small.json']);
  assert.equal(args.scopeManifest, 'fixtures/small.json');
  assert.equal(args.scopeManifest !== null, true);
  assert.throws(() => parseArgs(['297A-6', '--scope-manifest']), /Falta valor para --scope-manifest/);
  assert.throws(() => parseArgs(['297A-6', '--scope-manifest', '--fresh']), /Falta valor para --scope-manifest/);
});
