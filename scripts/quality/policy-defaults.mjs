export const BLOCKED_NPM_SCRIPTS = Object.freeze([
  '__sentinel_guard_probe__',
  'test',
  'test:changed',
  'test:full',
  'test:file',
  'test:watch',
  'type-check',
  'lint',
  'check',
  'check:back',
  'check:front',
  'fmt',
  'fmt:check',
  'build',
]);

export const BLOCKED_TOOLS = Object.freeze([
  'vitest',
  'tsc',
  'eslint',
  'prettier',
  'rustfmt',
]);

export const BLOCKED_CARGO_COMMANDS = Object.freeze([
  'check',
  'clippy',
  'test',
  'bench',
  'fmt',
]);

export const DEFAULT_GATE_COMMAND = Object.freeze(['npm', 'run', 'task:check', '--']);
