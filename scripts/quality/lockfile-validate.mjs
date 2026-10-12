import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { resolveConfiguredSourcePath, validateSourcePath } from './source-path.mjs';

const LOCK_SCHEMA_VERSION = 1;
const LOCK_FILE = 'sentinel.lock.json';
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const TOOL_NAMES = new Set(['sentinel', 'varsense']);
const RUNTIME_STATUSES = new Set(['not-installed', 'project-adapter', 'installed']);
const INSTALL_METADATA_PATH = '.quality-install.json';
const COMMIT_PATTERN = /^[a-f0-9]{40}$/u;
const RUNTIME_ARTIFACT_STATUSES = new Set(['installed']);

function fail(message) {
  throw new Error(`sentinel.lock.json: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length > 0) fail(`${label}: claves desconocidas: ${unknown.join(', ')}`);
}

function validateSha(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) fail(`${label}: SHA-256 inválido`);
}

function validateText(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 160) fail(`${label}: texto inválido`);
}

function validateCapabilities(value, label) {
  if (value === undefined) return;
  if (!isRecord(value)) fail(`${label}: debe ser un objeto`);
  validateKeys(value, new Set(['filesFrom', 'persistentIndex']), label);
  if (value.filesFrom !== undefined && typeof value.filesFrom !== 'boolean') {
    fail(`${label}.filesFrom debe ser booleano`);
  }
  if (value.persistentIndex !== undefined && typeof value.persistentIndex !== 'boolean') {
    fail(`${label}.persistentIndex debe ser booleano`);
  }
}

function validateCommit(value, label, allowAliases = false) {
  if (allowAliases && ['not-installed', 'repo-scripts'].includes(value)) return;
  if (typeof value !== 'string' || !COMMIT_PATTERN.test(value)) fail(`${label}: commit inválido`);
}

function validateInstallRoot(value) {
  if (typeof value !== 'string' || value.length === 0 || path.isAbsolute(value)) fail('installRoot debe ser una ruta relativa');
  if (value.replace(/\\/g, '/').split('/').includes('..')) fail('installRoot no puede salir del workspace');
}

export function validateLock(lock, manifest) {
  if (!isRecord(lock)) fail('la raíz debe ser un objeto');
  validateKeys(lock, new Set(['schemaVersion', 'generatedAt', 'runtime', 'analyzers']), 'raíz');
  if (lock.schemaVersion !== LOCK_SCHEMA_VERSION) fail(`schemaVersion debe ser ${LOCK_SCHEMA_VERSION}`);
  if (typeof lock.generatedAt !== 'string' || Number.isNaN(Date.parse(lock.generatedAt))) fail('generatedAt inválido');

  if (manifest?.installRoot !== undefined) validateInstallRoot(manifest.installRoot);
  if (!isRecord(lock.runtime)) fail('runtime debe ser un objeto');
  validateKeys(lock.runtime, new Set(['status', 'version', 'commit', 'identitySha256', 'artifactSha256']), 'runtime');
  if (!RUNTIME_STATUSES.has(lock.runtime.status)) fail('runtime.status inválido');
  validateText(lock.runtime.version, 'runtime.version');
  validateCommit(lock.runtime.commit, 'runtime.commit', true);
  validateSha(lock.runtime.identitySha256, 'runtime.identitySha256');
  if (!Object.hasOwn(lock.runtime, 'artifactSha256')) fail('runtime.artifactSha256 debe ser null o SHA-256');
  if (lock.runtime.artifactSha256 !== null) validateSha(lock.runtime.artifactSha256, 'runtime.artifactSha256');
  if (RUNTIME_ARTIFACT_STATUSES.has(lock.runtime.status) && !lock.runtime.artifactSha256) fail('runtime instalado debe declarar artifactSha256');
  if (lock.runtime.status === 'not-installed' && lock.runtime.commit !== 'not-installed') {
    fail('runtime not-installed debe declarar commit not-installed');
  }

  if (!isRecord(lock.analyzers)) fail('analyzers debe ser un objeto');
  const manifestTools = manifest?.tools;
  if (!isRecord(manifestTools)) fail('quality-tools.json.tools inválido');
  const lockNames = Object.keys(lock.analyzers);
  const manifestNames = Object.keys(manifestTools);
  if (lockNames.length !== manifestNames.length || lockNames.some(name => !manifestNames.includes(name))) {
    fail('analyzers no coincide con quality-tools.json.tools');
  }

  for (const name of manifestNames) {
    if (!TOOL_NAMES.has(name)) fail(`analyzer desconocido: ${name}`);
    const entry = lock.analyzers[name];
    const expected = manifestTools[name];
    if (!isRecord(entry)) fail(`analyzers.${name} debe ser un objeto`);
    validateKeys(entry, new Set(['version', 'protocolVersion', 'commit', 'sha256', 'patchSha256', 'capabilities', 'sourcePathEnv', 'sourcePathRealpath']), `analyzers.${name}`);
    validateText(entry.version, `analyzers.${name}.version`);
    if (expected.requiredCapabilities !== undefined) {
      if (!Array.isArray(expected.requiredCapabilities) || expected.requiredCapabilities.some(capability => typeof capability !== 'string' || capability.length === 0)) fail(`quality-tools.json.tools.${name}.requiredCapabilities inválido`);
    }
    if (expected.releaseRefs !== undefined) {
      if (!Array.isArray(expected.releaseRefs) || expected.releaseRefs.some(ref => typeof ref !== 'string' || ref.length === 0)) fail(`quality-tools.json.tools.${name}.releaseRefs inválido`);
    }
    validateCapabilities(expected.capabilities, `quality-tools.json.tools.${name}.capabilities`);
    validateCapabilities(entry.capabilities, `analyzers.${name}.capabilities`);
    const expectedSourcePathEnv = expected.sourcePathEnv;
    if (entry.sourcePathEnv !== expectedSourcePathEnv) fail(`analyzers.${name}.sourcePathEnv no coincide con quality-tools.json`);
    /* [028A-8] sourcePath interno no declara sourcePathEnv; el realpath del lock
     * (si existe) se valida igualmente como ruta absoluta. */
    if (entry.sourcePathRealpath !== undefined) validateSourcePath(entry.sourcePathRealpath, `analyzers.${name}.sourcePathRealpath`);
    const expectedCapabilities = expected.capabilities ?? undefined;
    const actualCapabilities = entry.capabilities ?? undefined;
    if (JSON.stringify(actualCapabilities) !== JSON.stringify(expectedCapabilities)) {
      fail(`analyzers.${name}.capabilities no coincide con quality-tools.json`);
    }
    if (entry.version !== expected.version) fail(`analyzers.${name}.version no coincide con quality-tools.json`);
    const protocolVersion = Number(expected.outputSchemaVersion);
    if (!Number.isInteger(entry.protocolVersion) || entry.protocolVersion !== protocolVersion) {
      fail(`analyzers.${name}.protocolVersion no coincide con quality-tools.json`);
    }
    validateCommit(entry.commit, `analyzers.${name}.commit`);
    if (entry.commit !== expected.commit) fail(`analyzers.${name}.commit no coincide con quality-tools.json`);
    validateSha(entry.sha256, `analyzers.${name}.sha256`);
    if (expected.patch !== undefined) {
      if (!isRecord(expected.patch)) fail(`quality-tools.${name}.patch inválido`);
      validateKeys(expected.patch, new Set(['path', 'sha256']), `quality-tools.${name}.patch`);
      if (typeof expected.patch.path !== 'string' || path.isAbsolute(expected.patch.path) || expected.patch.path.replace(/\\/g, '/').split('/').includes('..')) {
        fail(`quality-tools.${name}.patch.path inválido`);
      }
      validateSha(expected.patch.sha256, `quality-tools.${name}.patch.sha256`);
    }
    const expectedPatchSha = expected.patch?.sha256 ?? null;
    if (entry.patchSha256 !== expectedPatchSha) fail(`analyzers.${name}.patchSha256 no coincide con quality-tools.json`);
  }
  return lock;
}

async function validateResolvedSourcePaths(workspaceRoot, lock, manifest) {
  for (const [name, config] of Object.entries(manifest.tools)) {
    const configuredSourcePath = resolveConfiguredSourcePath(config, `quality-tools.json.tools.${name}`, { baseDir: workspaceRoot });
    if (configuredSourcePath === null) continue;
    const expectedRealpath = await realpath(configuredSourcePath).catch(() => null);
    if (!expectedRealpath) fail(`analyzers.${name}.sourcePath no existe o no es resoluble`);
    if (lock.analyzers[name].sourcePathRealpath !== undefined && lock.analyzers[name].sourcePathRealpath !== expectedRealpath) {
      fail(`analyzers.${name}.sourcePathRealpath no coincide con el checkout actual`);
    }
  }
}

export { fail, INSTALL_METADATA_PATH, LOCK_FILE, LOCK_SCHEMA_VERSION, validateInstallRoot, validateResolvedSourcePaths };
