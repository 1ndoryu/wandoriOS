import assert from 'node:assert/strict';
import test from 'node:test';
import { decisionForGuard, policyDecision } from '../policy-decision.mjs';

test('expone pass-through para no-policy sin bloquear', () => {
  const decision = policyDecision({ status: 'no-policy' });
  assert.deepEqual(decision, {
    status: 'no-policy',
    mode: 'pass-through',
    action: 'pass-through',
    blocked: false,
    reason: 'no-policy',
  });
  assert.equal(decisionForGuard({ status: 'no-policy' }, 'npx vitest').blocked, false);
});

test('mantiene fallback legacy y lo puede marcar como bloqueo de comando directo', () => {
  const decision = policyDecision({ status: 'legacy-v1', warning: 'legacy' });
  assert.equal(decision.action, 'legacy-fallback');
  assert.equal(decisionForGuard({ status: 'legacy-v1' }, 'npm test').blocked, true);
});

test('distingue observe, enforce y pass-through de política v2', () => {
  for (const [mode, action, blocked, observed] of [
    ['observe', 'observe', false, true],
    ['enforce', 'enforce', true, false],
    ['pass-through', 'pass-through', false, false],
  ]) {
    const discovered = { status: 'policy', policy: { mode } };
    const decision = decisionForGuard(discovered, 'cargo test');
    assert.equal(decision.action, action);
    assert.equal(decision.blocked, blocked);
    assert.equal(decision.observed, observed ? 'cargo test' : false);
  }
});

test('invalid-policy es observable como error pero nunca bloquea comandos desconocidos', () => {
  const decision = policyDecision({ status: 'invalid-policy', error: 'JSON inválido' });
  assert.equal(decision.action, 'error');
  assert.equal(decision.blocked, false);
  assert.equal(decisionForGuard({ status: 'invalid-policy' }, 'comando desconocido').blocked, false);
});
