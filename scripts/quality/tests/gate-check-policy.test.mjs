import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPolicyIdentity, needsPolicyIdentity, renderPolicyIdentity } from '../gate-check.mjs';

const identity = {
  projectRoot: 'C:/repo',
  policyPath: 'C:/repo/sentinel.config.json',
  policyHash: 'abc123',
  runtimeVersion: '0.7.0',
  decision: { status: 'policy', mode: 'enforce', action: 'enforce', blocked: false, reason: 'política v2 válida' },
  reason: 'política v2 válida',
  recommendedCommand: 'npm run task:check -- TEST-01',
};

test('gate report policy normalizer replaces unavailable identity', () => {
  const report = { decision: { label: 'PASS' }, policy: { policyHash: 'unavailable', decision: { action: 'error' } } };
  assert.equal(needsPolicyIdentity(report), true);
  const normalized = applyPolicyIdentity(report, identity);
  assert.equal(normalized.changed, true);
  assert.equal(normalized.report.policy.policyHash, 'abc123');
});

test('gate report policy normalizer preserves a valid identity', () => {
  const report = { policy: identity };
  assert.equal(needsPolicyIdentity(report), false);
  assert.equal(applyPolicyIdentity(report, identity).changed, false);
});

test('gate report policy normalizer replaces an omitted policy object', () => {
  const normalized = applyPolicyIdentity({ decision: { label: 'PASS', exitCode: 0 } }, identity);
  assert.equal(normalized.changed, true);
  assert.equal(normalized.report.policy.policyHash, 'abc123');
});

test('gate markdown exposes the canonical policy identity', () => {
  const markdown = '# Quality report\n\n- Política: unavailable · error · identidad de política no disponible\n';
  assert.match(renderPolicyIdentity(markdown, identity), /Política: abc123 · enforce · política v2 válida/u);
});

test('gate policy error converts an otherwise PASS report to setup error', () => {
  const report = { decision: { label: 'PASS', exitCode: 0 }, policy: { policyHash: 'unavailable' } };
  const invalid = { ...identity, decision: { ...identity.decision, status: 'invalid-policy', action: 'error', reason: 'política inválida' }, reason: 'política inválida' };
  const normalized = applyPolicyIdentity(report, invalid);
  assert.equal(normalized.report.decision.label, 'SETUP ERROR');
  assert.equal(normalized.report.decision.exitCode, 2);
});
