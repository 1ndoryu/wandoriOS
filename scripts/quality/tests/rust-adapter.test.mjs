import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldRunExtendedChecks } from '../adapters/rust.mjs';

test('Rust local-light no ejecuta clippy/tests', () => {
  assert.equal(shouldRunExtendedChecks({ ci: false, full: false }), false);
});

test('Rust full y CI sí ejecutan clippy/tests', () => {
  assert.equal(shouldRunExtendedChecks({ ci: false, full: true }), true);
  assert.equal(shouldRunExtendedChecks({ ci: true, full: false }), true);
});

test('Rust respeta el alcance efectivo del guard (028A-8)', () => {
  /* AutomaticFull permitido: context.full=false pero effectiveFull=true. */
  assert.equal(shouldRunExtendedChecks({ ci: false, full: false }, { effectiveFull: true }), true);
  /* Full diferido: requestedFull=true pero effectiveFull=false. */
  assert.equal(shouldRunExtendedChecks({ ci: false, full: false }, { effectiveFull: false, executionFull: false, full: true }), false);
  /* Sin alcance explícito conserva el contrato anterior. */
  assert.equal(shouldRunExtendedChecks({ ci: false, full: true }), true);
});
