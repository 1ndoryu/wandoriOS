const DECISION_STATUSES = new Set(['no-policy', 'legacy-v1', 'policy', 'invalid-policy']);
const MODES = new Set(['enforce', 'observe', 'pass-through']);

export function policyDecision(discovered) {
  const status = discovered?.status;
  if (!DECISION_STATUSES.has(status)) throw new Error(`Estado de política desconocido: ${status}`);
  if (status !== 'policy') {
    return {
      status,
      mode: status === 'no-policy' ? 'pass-through' : 'observe',
      action: status === 'legacy-v1' ? 'legacy-fallback' : status === 'invalid-policy' ? 'error' : 'pass-through',
      blocked: false,
      reason: discovered.warning ?? discovered.error ?? status,
    };
  }
  const mode = discovered.policy?.mode;
  if (!MODES.has(mode)) throw new Error(`Modo de política desconocido: ${mode}`);
  return {
    status,
    mode,
    action: mode === 'enforce' ? 'enforce' : mode,
    blocked: false,
    reason: 'política v2 válida',
  };
}

export function decisionForGuard(discovered, reason = null) {
  const decision = policyDecision(discovered);
  if (!reason) return decision;
  if (decision.status === 'legacy-v1') return { ...decision, blocked: true, observed: false };
  if (decision.status !== 'policy') return { ...decision, observed: false };
  if (decision.mode === 'enforce') return { ...decision, blocked: true, observed: false, reason };
  if (decision.mode === 'observe') return { ...decision, blocked: false, observed: reason, reason };
  return { ...decision, blocked: false, observed: false, reason };
}

export { DECISION_STATUSES, MODES };
