import assert from 'node:assert/strict';
import test from 'node:test';
import { policyIdentity } from '../policy.mjs';

test('policyIdentity expone hash, motivo y comando recomendado de forma estable', () => {
  const valid = {
    status: 'policy',
    projectRoot: 'C:/repo',
    policyPath: 'C:/repo/sentinel.config.json',
    policyHash: 'abc123',
  };
  valid.policy = { mode: 'enforce' };
  const identity = policyIdentity(valid, '0.4.0');
  assert.deepEqual(identity, {
    projectRoot: 'C:/repo',
    policyPath: 'C:/repo/sentinel.config.json',
    policyHash: 'abc123',
    runtimeVersion: '0.4.0',
    decision: {
      status: 'policy',
      mode: 'enforce',
      action: 'enforce',
      blocked: false,
      reason: 'política v2 válida',
    },
    reason: 'política v2 válida',
    recommendedCommand: 'npm run task:check -- <task-id>',
  });
});

test('policyIdentity recomienda migración para legacy y gate para no-policy', () => {
  const legacy = policyIdentity({ status: 'legacy-v1', projectRoot: 'C:/repo', policyPath: 'C:/repo/sentinel.config.json', warning: 'legacy' });
  const noPolicy = policyIdentity({ status: 'no-policy', projectRoot: null, policyPath: null, policyHash: 'none' });
  assert.equal(legacy.decision.action, 'legacy-fallback');
  assert.equal(noPolicy.decision.action, 'pass-through');
  assert.equal(noPolicy.decision.mode, 'pass-through');
  assert.match(legacy.recommendedCommand, /quality:doctor/);
  assert.equal(noPolicy.recommendedCommand, 'sentinel check <task-id>');
});
