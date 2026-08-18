import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { BLOCKED_CARGO_COMMANDS, BLOCKED_NPM_SCRIPTS, BLOCKED_TOOLS, DEFAULT_GATE_COMMAND } from './policy-defaults.mjs';
import { policyDecision } from './policy-decision.mjs';
import { validateSourcePathEnv } from './source-path.mjs';

const POLICY_FILE = 'sentinel.config.json';
const MAX_STRING_LENGTH = 160;
const NAME_PATTERN = /^[A-Za-z0-9:_*.-]+$/u;
const MODES = new Set(['enforce', 'observe', 'pass-through']);
const ROOT_KEYS = new Set(['schemaVersion', 'mode', 'project', 'gate', 'guard', 'runtime', 'analyzers']);
const PROJECT_KEYS = new Set(['primaryBranch']);
const ANALYZER_KEYS = new Set(['enabled', 'profile', 'config']);
const RUNTIME_KEYS = new Set(['minimumVersion', 'protocolVersion', 'lockFile']);
const GATE_KEYS = new Set(['command', 'taskIdRequired']);
const GUARD_KEYS = new Set(['directCommands']);
const DIRECT_COMMAND_KEYS = new Set(['npmScripts', 'npxTools', 'cargoSubcommands', 'tools']);
const LEGACY_SENTINEL_KEYS = new Set(['includePatterns', 'excludePatterns', 'directoryExceptions', 'portableBoundaries', 'rules']);
const LEGACY_QUALITY_KEYS = new Set(['schemaVersion', 'maxFindings', 'maxReminders', 'maxTerminalLines', 'lockWaitMs', 'maxConcurrentStages', 'timeoutsMs', 'performanceBudgets', 'heavyRun', 'reportRetention', 'fullPatterns', 'profiles', 'stageTimeBudgets', 'indexRetention', 'roadmapMaxLines']);
const LEGACY_VARSENSE_KEYS = new Set(['variableFiles', 'includePatterns', 'excludePatterns', 'scanAllFiles', 'hardcodedDetection', 'inlineDetection', 'tokenDetection', 'bannedProperties', 'orphanClassDetection']);
const LEGACY_TOOL_MANIFEST_KEYS = new Set(['schemaVersion', 'installRoot', 'tools']);
const LEGACY_TOOL_KEYS = new Set(['repository', 'commit', 'version', 'outputSchemaVersion', 'buildScript', 'cli', 'testScript', 'patch', 'capabilities', 'requiredCapabilities', 'releaseRefs', 'sourcePath', 'sourcePathEnv']);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateLegacyKeys(value, allowed, label) {
  if (!isRecord(value)) throw new Error(`${label}: debe ser un objeto`);
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`${label}: claves desconocidas: ${unknown.join(', ')}`);
}

function validateLegacyPatternList(value, label) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 256) throw new Error(`${label}: debe ser una lista de patrones`);
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0 || item.length > MAX_STRING_LENGTH || /[\u0000-\u001f\u007f]/u.test(item)) {
      throw new Error(`${label}: patrón inválido`);
    }
    const normalized = item.replace(/\\/g, '/');
    if (path.isAbsolute(item) || normalized.startsWith('/') || normalized.split('/').includes('..')) {
      throw new Error(`${label}: patrón fuera del workspace`);
    }
  }
}

function validateLegacyContracts({ sentinelConfig, qualityConfig, varsenseConfig, toolManifest }) {
  validateLegacyKeys(sentinelConfig, LEGACY_SENTINEL_KEYS, 'sentinel.config.json v1');
  validateLegacyPatternList(sentinelConfig.includePatterns, 'sentinel.config.json v1.includePatterns');
  validateLegacyPatternList(sentinelConfig.excludePatterns, 'sentinel.config.json v1.excludePatterns');
  validateLegacyPatternList(sentinelConfig.directoryExceptions, 'sentinel.config.json v1.directoryExceptions');
  if (sentinelConfig.portableBoundaries !== undefined && !isRecord(sentinelConfig.portableBoundaries)) {
    throw new Error('sentinel.config.json v1.portableBoundaries: debe ser un objeto');
  }
  if (sentinelConfig.rules !== undefined && !isRecord(sentinelConfig.rules)) {
    throw new Error('sentinel.config.json v1.rules: debe ser un objeto');
  }

  validateLegacyKeys(qualityConfig, LEGACY_QUALITY_KEYS, 'quality.config.json');
  for (const key of ['maxFindings', 'maxReminders', 'maxTerminalLines', 'lockWaitMs', 'maxConcurrentStages']) {
    if (qualityConfig[key] !== undefined && (!Number.isInteger(qualityConfig[key]) || qualityConfig[key] < 0)) {
      throw new Error(`quality.config.json.${key}: debe ser un entero no negativo`);
    }
  }
  for (const key of ['timeoutsMs', 'performanceBudgets', 'heavyRun', 'reportRetention', 'profiles', 'stageTimeBudgets', 'indexRetention']) {
    if (qualityConfig[key] !== undefined && !isRecord(qualityConfig[key])) {
      throw new Error(`quality.config.json.${key}: debe ser un objeto`);
    }
  }
  if (qualityConfig.indexRetention !== undefined) {
    for (const key of ['maxAgeDays', 'maxMiB', 'throttleHours']) {
      if (qualityConfig.indexRetention[key] !== undefined && !Number.isInteger(qualityConfig.indexRetention[key])) {
        throw new Error(`quality.config.json.indexRetention.${key}: debe ser un entero`);
      }
    }
  }
  if (qualityConfig.stageTimeBudgets !== undefined) {
    for (const [stage, budgetMs] of Object.entries(qualityConfig.stageTimeBudgets)) {
      validateName(stage, 'quality.config.json.stageTimeBudgets');
      if (!Number.isInteger(budgetMs) || budgetMs < 1) {
        throw new Error(`quality.config.json.stageTimeBudgets.${stage}: debe ser un entero positivo (ms)`);
      }
    }
  }
  if (qualityConfig.profiles !== undefined) {
    for (const [profile, patterns] of Object.entries(qualityConfig.profiles)) {
      validateName(profile, 'quality.config.json.profiles');
      validateLegacyPatternList(patterns, `quality.config.json.profiles.${profile}`);
    }
  }
  validateLegacyPatternList(qualityConfig.fullPatterns, 'quality.config.json.fullPatterns');

  validateLegacyKeys(varsenseConfig, LEGACY_VARSENSE_KEYS, 'varsense.config.json');
  validateLegacyPatternList(varsenseConfig.variableFiles, 'varsense.config.json.variableFiles');
  validateLegacyPatternList(varsenseConfig.includePatterns, 'varsense.config.json.includePatterns');
  validateLegacyPatternList(varsenseConfig.excludePatterns, 'varsense.config.json.excludePatterns');
  if (varsenseConfig.scanAllFiles !== undefined && typeof varsenseConfig.scanAllFiles !== 'boolean') {
    throw new Error('varsense.config.json.scanAllFiles: debe ser booleano');
  }
  for (const key of ['hardcodedDetection', 'inlineDetection', 'tokenDetection', 'bannedProperties', 'orphanClassDetection']) {
    if (varsenseConfig[key] !== undefined && !isRecord(varsenseConfig[key])) {
      throw new Error(`varsense.config.json.${key}: debe ser un objeto`);
    }
  }

  validateLegacyKeys(toolManifest, LEGACY_TOOL_MANIFEST_KEYS, 'quality-tools.json');
  if (toolManifest.schemaVersion !== 1) throw new Error('quality-tools.json.schemaVersion debe ser 1');
  if (typeof toolManifest.installRoot !== 'string') throw new Error('quality-tools.json.installRoot inválido');
  if (!isRecord(toolManifest.tools)) throw new Error('quality-tools.json.tools: debe ser un objeto');
  const expectedTools = new Set(['sentinel', 'varsense']);
  const actualTools = new Set(Object.keys(toolManifest.tools));
  if (actualTools.size !== expectedTools.size || [...expectedTools].some(name => !actualTools.has(name))) {
    throw new Error('quality-tools.json.tools debe contener exactamente sentinel y varsense');
  }
  for (const [name, tool] of Object.entries(toolManifest.tools)) {
    const label = `quality-tools.json.tools.${name}`;
    validateLegacyKeys(tool, LEGACY_TOOL_KEYS, label);
    for (const key of ['repository', 'commit', 'version', 'outputSchemaVersion', 'buildScript', 'cli', 'testScript']) {
      if (tool[key] !== undefined && typeof tool[key] !== 'string') throw new Error(`${label}.${key}: debe ser string`);
    }
    if (typeof tool.version !== 'string' || typeof tool.commit !== 'string') {
      throw new Error(`${label}: version y commit son obligatorios`);
    }
    if (tool.sourcePath !== undefined && tool.sourcePathEnv !== undefined) {
      throw new Error(`${label}: sourcePath y sourcePathEnv son mutuamente excluyentes`);
    }
    if (tool.sourcePathEnv !== undefined) validateSourcePathEnv(tool.sourcePathEnv, `${label}.sourcePathEnv`);
    if (tool.requiredCapabilities !== undefined) {
      if (!Array.isArray(tool.requiredCapabilities) || tool.requiredCapabilities.some(capability => typeof capability !== 'string' || capability.length === 0)) {
        throw new Error(`${label}.requiredCapabilities: debe ser una lista de nombres`);
      }
    }
    if (tool.releaseRefs !== undefined) {
      if (!Array.isArray(tool.releaseRefs) || tool.releaseRefs.some(ref => typeof ref !== 'string' || ref.length === 0 || ref.length > MAX_STRING_LENGTH)) {
        throw new Error(`${label}.releaseRefs: debe ser una lista de refs`);
      }
    }
    if (tool.capabilities !== undefined) {
      validateLegacyKeys(tool.capabilities, new Set(['filesFrom', 'persistentIndex']), `${label}.capabilities`);
      if (tool.capabilities.filesFrom !== undefined && typeof tool.capabilities.filesFrom !== 'boolean') {
        throw new Error(`${label}.capabilities.filesFrom: debe ser booleano`);
      }
      if (tool.capabilities.persistentIndex !== undefined && typeof tool.capabilities.persistentIndex !== 'boolean') {
        throw new Error(`${label}.capabilities.persistentIndex: debe ser booleano`);
      }
    }
    if (tool.patch !== undefined) {
      if (!isRecord(tool.patch) || typeof tool.patch.path !== 'string' || typeof tool.patch.sha256 !== 'string') {
        throw new Error(`${label}.patch: debe contener path y sha256`);
      }
      const patchPath = tool.patch.path.replace(/\\/g, '/');
      if (path.isAbsolute(tool.patch.path) || patchPath.startsWith('/') || patchPath.split('/').includes('..')) {
        throw new Error(`${label}.patch.path: debe ser una ruta relativa dentro del workspace`);
      }
      if (!/^[a-f0-9]{64}$/u.test(tool.patch.sha256)) {
        throw new Error(`${label}.patch.sha256: debe ser SHA-256 hexadecimal`);
      }
    }
  }
}

function fail(message) {
  throw new Error(`sentinel.config.json: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length > 0) fail(`${label}: claves desconocidas: ${unknown.join(', ')}`);
}

function validateName(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_STRING_LENGTH || !NAME_PATTERN.test(value)) {
    fail(`${label}: nombre inválido`);
  }
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
