import path from 'node:path';
import { MAX_STRING_LENGTH, isRecord, validateName } from './policy-primitives.mjs';
import { validateSourcePathEnv } from './source-path.mjs';

// [10AA-2] Validación del formato v1 (sentinel.config.json, quality.config.json, varsense.config.json, quality-tools.json).
// Vive aparte de policy.mjs para mantener cada archivo bajo el límite de 300 líneas de Sentinel.
const LEGACY_SENTINEL_KEYS = new Set(['includePatterns', 'excludePatterns', 'directoryExceptions', 'portableBoundaries', 'rules']);
const LEGACY_QUALITY_KEYS = new Set(['schemaVersion', 'maxFindings', 'maxReminders', 'maxTerminalLines', 'lockWaitMs', 'maxConcurrentStages', 'timeoutsMs', 'performanceBudgets', 'heavyRun', 'reportRetention', 'fullPatterns', 'profiles', 'stageTimeBudgets', 'indexRetention', 'roadmapMaxLines']);
const LEGACY_VARSENSE_KEYS = new Set(['variableFiles', 'includePatterns', 'excludePatterns', 'scanAllFiles', 'hardcodedDetection', 'inlineDetection', 'tokenDetection', 'bannedProperties', 'orphanClassDetection']);
const LEGACY_TOOL_MANIFEST_KEYS = new Set(['schemaVersion', 'installRoot', 'tools']);
const LEGACY_TOOL_KEYS = new Set(['repository', 'commit', 'version', 'outputSchemaVersion', 'buildScript', 'cli', 'testScript', 'patch', 'capabilities', 'requiredCapabilities', 'releaseRefs', 'sourcePath', 'sourcePathEnv']);

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

export function validateLegacyContracts({ sentinelConfig, qualityConfig, varsenseConfig, toolManifest }) {
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
