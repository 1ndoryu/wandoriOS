export const REPORT_RETENTION_DEFAULTS = Object.freeze({
  maxAgeDays: 7,
  maxWorkspaceMiB: 512,
  maxBranchMiB: 128,
});
const ACTIVE_LOCK_TTL_MS = 10 * 60 * 1000;
const MIN_QUOTA_AGE_MS = 60 * 60 * 1000;
const TEMP_PATTERN = /^(?:\.tmp-|.*\.tmp)$/u;

function bytesFromMiB(value, label) {
  if (!Number.isFinite(value) || value < 1 || value > 1024 * 1024) {
    throw new Error(`reportRetention.${label} inválido`);
  }
  return Math.floor(value * 1024 * 1024);
}

export function normalizeReportRetention(config = {}) {
  const values = { ...REPORT_RETENTION_DEFAULTS, ...config };
  if (!Number.isFinite(values.maxAgeDays) || values.maxAgeDays < 1 || values.maxAgeDays > 365) {
    throw new Error('reportRetention.maxAgeDays inválido');
  }
  return {
    maxAgeMs: values.maxAgeDays * 24 * 60 * 60 * 1000,
    maxWorkspaceBytes: bytesFromMiB(values.maxWorkspaceMiB, 'maxWorkspaceMiB'),
    maxBranchBytes: bytesFromMiB(values.maxBranchMiB, 'maxBranchMiB'),
  };
}

export { ACTIVE_LOCK_TTL_MS, MIN_QUOTA_AGE_MS, TEMP_PATTERN };
