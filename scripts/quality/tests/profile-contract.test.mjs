import assert from 'node:assert/strict';
import test from 'node:test';
import { EXECUTABLE_PROFILES, isFullExecution, PROFILE_STAGE_RULES, validateExecutableProfiles } from '../profile-contract.mjs';

test('el contrato expone solo perfiles con etapas ejecutables', () => {
  assert.deepEqual([...EXECUTABLE_PROFILES], ['css', 'frontend', 'rust', 'docs']);
  assert.deepEqual(PROFILE_STAGE_RULES.frontend, ['varsense', 'frontend']);
  assert.doesNotThrow(() => validateExecutableProfiles(['docs', 'frontend']));
  assert.throws(() => validateExecutableProfiles(['workspace']), /Perfil sin etapa ejecutable/);
});

test('full de fingerprint no implica ejecución full con un perfil explícito', () => {
  assert.equal(isFullExecution({ full: true, executionFull: false, profileOverride: true }), false);
  assert.equal(isFullExecution({ full: true, executionFull: true, profileOverride: false }), true);
});
