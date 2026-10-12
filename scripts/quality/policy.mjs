import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { BLOCKED_CARGO_COMMANDS, BLOCKED_NPM_SCRIPTS, BLOCKED_TOOLS, DEFAULT_GATE_COMMAND } from './policy-defaults.mjs';
import { policyDecision } from './policy-decision.mjs';
import { validateLegacyContracts } from './policy-legacy.mjs';
import { MAX_STRING_LENGTH, fail, isRecord, validateName } from './policy-primitives.mjs';

const POLICY_FILE = 'sentinel.config.json';
const MODES = new Set(['enforce', 'observe', 'pass-through']);
const ROOT_KEYS = new Set(['schemaVersion', 'mode', 'project', 'budgets', 'gate', 'guard', 'runtime', 'analyzers']);
// [10AA-2] Sentinel 0.7.x acepta `budgets` como clave raíz; el validador del gate debe aceptarla igual o falla el setup.
const BUDGET_KEYS = new Set(['mode', 'limits']);
const BUDGET_MODES = new Set(['observe', 'enforce']);
const PROJECT_KEYS = new Set(['primaryBranch']);
const ANALYZER_KEYS = new Set(['enabled', 'profile', 'config']);
const RUNTIME_KEYS = new Set(['minimumVersion', 'protocolVersion', 'lockFile']);
const GATE_KEYS = new Set(['command', 'taskIdRequired']);
const GUARD_KEYS = new Set(['directCommands']);
const DIRECT_COMMAND_KEYS = new Set(['npmScripts', 'npxTools', 'cargoSubcommands', 'tools']);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length > 0) fail(`${label}: claves desconocidas: ${unknown.join(', ')}`);
}

function validateBudgets(value) {
  if (!isRecord(value)) fail('budgets debe ser un objeto');
  validateKeys(value, BUDGET_KEYS, 'budgets');
  if (value.mode !== undefined && !BUDGET_MODES.has(value.mode)) fail('budgets.mode inválido');
  if (value.limits !== undefined && !isRecord(value.limits)) fail('budgets.limits debe ser un objeto');
}

function validateStringList(value, label) {
  if (!Array.isArray(value) || value.length > 128) fail(`${label}: debe ser una lista de nombres`);
  for (const item of value) validateName(item, label);
}

function validateRelativePath(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_STRING_LENGTH || path.isAbsolute(value)) {
    fail(`${label}: debe ser una ruta relativa`);
  }
  const normalized = value.replace(/\\/g, '/');
  if (normalized.split('/').includes('..')) fail(`${label}: no puede salir del workspace`);
}

function validateProject(value) {
  if (!isRecord(value)) fail('project debe ser un objeto');
  validateKeys(value, PROJECT_KEYS, 'project');
  if (typeof value.primaryBranch !== 'string' || value.primaryBranch.length === 0 || value.primaryBranch.length > 127 || /[\u0000-\u001f\u007f\s]/u.test(value.primaryBranch)) {
    fail('project.primaryBranch: nombre inválido');
  }
  const branch = value.primaryBranch;
  const invalidBranch = branch.includes('..')
    || branch.includes('@{')
    || /[~^:?*\[\]\\]/u.test(branch)
    || branch.includes('//')
    || branch.endsWith('/')
    || branch.endsWith('.')
    || branch.split('/').some(component => component.length === 0 || component.startsWith('.') || component.endsWith('.') || component.toLowerCase().endsWith('.lock'));
  if (invalidBranch) fail('project.primaryBranch debe ser un nombre de rama Git válido');
}

function validateAnalyzer(value, label) {
  if (!isRecord(value)) fail(`${label}: debe ser un objeto`);
  validateKeys(value, ANALYZER_KEYS, label);
  if (typeof value.enabled !== 'boolean') fail(`${label}.enabled inválido`);
  if (value.profile !== undefined) validateName(value.profile, `${label}.profile`);
  if (value.config !== undefined) {
    if (typeof value.config === 'string') validateRelativePath(value.config, `${label}.config`);
    else if (!isRecord(value.config)) fail(`${label}.config inválido`);
  }
}

export function validatePolicy(policy) {
  if (!isRecord(policy)) fail('la raíz debe ser un objeto');
  validateKeys(policy, ROOT_KEYS, 'raíz');
  if (policy.schemaVersion !== 2) fail('schemaVersion debe ser 2');
  if (typeof policy.mode !== 'string' || !MODES.has(policy.mode)) fail('mode inválido');
  if (policy.project !== undefined) validateProject(policy.project);
  if (policy.budgets !== undefined) validateBudgets(policy.budgets);

  if (!isRecord(policy.gate)) fail('gate debe ser un objeto');
  validateKeys(policy.gate, GATE_KEYS, 'gate');
  if (!Array.isArray(policy.gate.command) || policy.gate.command.length < 2 || policy.gate.command.length > 8) {
    fail('gate.command inválido');
  }
  for (const item of policy.gate.command) validateName(item, 'gate.command');
  if (typeof policy.gate.taskIdRequired !== 'boolean') fail('gate.taskIdRequired inválido');

  if (!isRecord(policy.guard)) fail('guard debe ser un objeto');
  validateKeys(policy.guard, GUARD_KEYS, 'guard');
  if (!isRecord(policy.guard.directCommands)) fail('guard.directCommands debe ser un objeto');
  validateKeys(policy.guard.directCommands, DIRECT_COMMAND_KEYS, 'guard.directCommands');
  for (const key of DIRECT_COMMAND_KEYS) validateStringList(policy.guard.directCommands[key], `guard.directCommands.${key}`);

  if (!isRecord(policy.runtime)) fail('runtime debe ser un objeto');
  validateKeys(policy.runtime, RUNTIME_KEYS, 'runtime');
  validateName(policy.runtime.minimumVersion, 'runtime.minimumVersion');
  if (!Number.isInteger(policy.runtime.protocolVersion) || policy.runtime.protocolVersion < 1 || policy.runtime.protocolVersion > 100) {
    fail('runtime.protocolVersion inválido');
  }
  validateRelativePath(policy.runtime.lockFile, 'runtime.lockFile');

  if (!isRecord(policy.analyzers)) fail('analyzers debe ser un objeto');
  validateKeys(policy.analyzers, new Set(['sentinel', 'varsense']), 'analyzers');
  validateAnalyzer(policy.analyzers.sentinel, 'analyzers.sentinel');
  validateAnalyzer(policy.analyzers.varsense, 'analyzers.varsense');
  return policy;
}

export function defaultGuardPolicy() {
  return {
    npmScripts: [...BLOCKED_NPM_SCRIPTS],
    npxTools: [...BLOCKED_TOOLS],
    cargoSubcommands: [...BLOCKED_CARGO_COMMANDS],
    tools: ['rustfmt'],
  };
}

export function migrateLegacyConfig({ sentinelConfig, qualityConfig, varsenseConfig, toolManifest }) {
  if (!isRecord(sentinelConfig) || !isRecord(qualityConfig) || !isRecord(varsenseConfig) || !isRecord(toolManifest)) {
    throw new Error('No se puede migrar una configuración legacy incompleta');
  }
  validateLegacyContracts({ sentinelConfig, qualityConfig, varsenseConfig, toolManifest });
  const sentinelTool = toolManifest.tools?.sentinel;
  const protocolVersion = Number.isInteger(Number(sentinelTool?.outputSchemaVersion))
    ? Number(sentinelTool.outputSchemaVersion)
    : 1;
  const migrated = {
    schemaVersion: 2,
    mode: 'enforce',
    gate: { command: [...DEFAULT_GATE_COMMAND], taskIdRequired: true },
    guard: { directCommands: defaultGuardPolicy() },
    runtime: {
      minimumVersion: String(sentinelTool?.version ?? '0.4.0'),
      protocolVersion,
      lockFile: 'sentinel.lock.json',
    },
    analyzers: {
      sentinel: { enabled: true, profile: 'project-default', config: sentinelConfig },
      varsense: { enabled: true, profile: 'project-default', config: 'varsense.config.json' },
    },
  };
  validatePolicy(migrated);
  return {
    policy: migrated,
    mapped: {
      analyzers: {
        sentinel: { config: cloneJson(sentinelConfig) },
        varsense: { config: cloneJson(varsenseConfig) },
      },
      scheduler: {
        maxConcurrentStages: qualityConfig.maxConcurrentStages,
        timeoutsMs: cloneJson(qualityConfig.timeoutsMs ?? {}),
        heavyRun: cloneJson(qualityConfig.heavyRun ?? {}),
      },
      reporting: {
        maxFindings: qualityConfig.maxFindings,
        maxReminders: qualityConfig.maxReminders,
        maxTerminalLines: qualityConfig.maxTerminalLines,
        reportRetention: cloneJson(qualityConfig.reportRetention ?? {}),
      },
      scope: {
        fullPatterns: cloneJson(qualityConfig.fullPatterns ?? []),
        profiles: cloneJson(qualityConfig.profiles ?? {}),
      },
      tools: {
        schemaVersion: toolManifest.schemaVersion,
        installRoot: toolManifest.installRoot,
        tools: cloneJson(toolManifest.tools),
      },
    },
    legacy: {
      sentinelConfig: cloneJson(sentinelConfig),
      qualityConfig: cloneJson(qualityConfig),
      varsenseConfig: cloneJson(varsenseConfig),
      toolManifest: cloneJson(toolManifest),
    },
  };
}

function hashText(value) {
  return createHash('sha256').update(value).digest('hex');
}

function policyReason(discovered) {
  return discovered.status === 'policy'
    ? 'política v2 válida'
    : discovered.warning ?? discovered.error ?? discovered.status;
}

export function policyIdentity(discovered, runtimeVersion = null) {
  return {
    projectRoot: discovered.projectRoot,
    policyPath: discovered.policyPath,
    policyHash: discovered.policyHash ?? hashText(discovered.status),
    runtimeVersion,
    decision: policyDecision(discovered),
    reason: policyReason(discovered),
    recommendedCommand: discovered.status === 'legacy-v1'
      ? 'npm run quality:doctor -- --migrate --dry-run'
      : discovered.status === 'invalid-policy'
        ? 'npm run quality:doctor -- --json'
        : discovered.status === 'no-policy'
          ? 'sentinel check <task-id>'
          : 'npm run task:check -- <task-id>',
  };
}

export async function discoverPolicy(startPath) {
  let candidate = path.resolve(startPath);
  try {
    candidate = await realpath(candidate);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  while (true) {
    const policyPath = path.join(candidate, POLICY_FILE);
    const metadata = await lstat(policyPath).catch(error => {
      if (error?.code === 'ENOENT') return null;
      throw error;
    });
    if (metadata?.isSymbolicLink()) {
      return { projectRoot: candidate, policyPath, symlink: true };
    }
    if (metadata?.isFile()) return { projectRoot: candidate, policyPath };
    const parent = path.dirname(candidate);
    if (parent === candidate) return { projectRoot: null, policyPath: null };
    candidate = parent;
  }
}

export async function loadPolicy(startPath) {
  const discovered = await discoverPolicy(startPath);
  if (!discovered.policyPath) {
    return { status: 'no-policy', ...discovered, policyHash: hashText('no-policy') };
  }
  if (discovered.symlink) {
    return {
      status: 'invalid-policy',
      ...discovered,
      policyHash: hashText('symlink-policy'),
      error: 'sentinel.config.json no puede ser symlink o junction',
    };
  }
  const raw = await readFile(discovered.policyPath, 'utf8');
  const policyHash = hashText(raw);
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (error) {
    return { status: 'invalid-policy', ...discovered, policyHash, error: `JSON inválido: ${error.message}` };
  }
  if (parsed.schemaVersion === undefined) {
    return { status: 'legacy-v1', ...discovered, policyHash, warning: 'sentinel.config.json usa el formato de analizador v1; no se activa como política v2' };
  }
  try {
    validatePolicy(parsed);
    return { status: 'policy', ...discovered, policyHash, policy: parsed };
  } catch (error) {
    return { status: 'invalid-policy', ...discovered, policyHash, error: error.message };
  }
}
