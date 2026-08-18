import { createHash } from 'node:crypto';
import { access, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { runProcess } from './runner.mjs';
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

export async function resolveToolRoot(workspaceRoot, name, config, manifest) {
  const configuredSourcePath = resolveConfiguredSourcePath(config, `quality-tools.json.tools.${name}`, { baseDir: workspaceRoot });
  if (configuredSourcePath !== null) {
    try {
      return await realpath(configuredSourcePath);
    } catch {
      fail(`quality-tools.json.tools.${name}.sourcePath externo no existe o no es resoluble`);
    }
  }
  validateInstallRoot(manifest.installRoot);
  const installRoot = await assertInsideWorkspace(
    workspaceRoot,
    path.resolve(workspaceRoot, manifest.installRoot),
    'quality-tools.installRoot',
  );
  return assertInsideWorkspace(workspaceRoot, path.join(installRoot, name), `quality-tools.${name}`);
}

export async function assertInsideWorkspace(workspaceRoot, target, label, { allowMissing = false } = {}) {
  let rootReal;
  let targetReal;
  try {
    rootReal = await realpath(workspaceRoot);
    targetReal = await realpath(target);
  } catch (error) {
    if (!allowMissing || error?.code !== 'ENOENT') fail(`${label}: ruta inexistente o no resoluble`);
    const parentReal = await realpath(path.dirname(target)).catch(() => null);
    if (!parentReal) fail(`${label}: ruta inexistente o no resoluble`);
    targetReal = path.join(parentReal, path.basename(target));
  }
  const relative = path.relative(rootReal, targetReal);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail(`${label}: ruta fuera del workspace`);
  }
  return targetReal;
}

export function untrustedCheckoutChanges(statusOutput) {
  const records = String(statusOutput).includes('\0')
    ? String(statusOutput).split('\0')
    : String(statusOutput).split(/\r?\n/);
  return records
    .map(line => line.trimEnd())
    .filter(Boolean)
    .filter(line => {
      const pathName = line.slice(3).replace(/\\/g, '/');
      return pathName !== INSTALL_METADATA_PATH;
    });
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

export async function readLock(workspaceRoot, manifest, lockFile = LOCK_FILE) {
  if (typeof lockFile !== 'string' || path.isAbsolute(lockFile) || lockFile.replace(/\\/g, '/').split('/').includes('..')) {
    fail('runtime.lockFile debe ser una ruta relativa dentro del workspace');
  }
  const lockPath = path.join(workspaceRoot, lockFile);
  try {
    await assertInsideWorkspace(workspaceRoot, lockPath, 'runtime.lockFile');
    const lock = JSON.parse(await readFile(lockPath, 'utf8'));
    validateLock(lock, manifest);
    await validateResolvedSourcePaths(workspaceRoot, lock, manifest);
    return { lock, lockPath };
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`Falta ${lockFile}; ejecuta el generador/verificador de lock antes del gate`);
    throw error;
  }
}

export function runtimeLockHash(status, version, commit) {
  return createHash('sha256').update(`sentinel-runtime:${status}:${version}:${commit}`).digest('hex');
}

export function assertRuntimeLockHash(runtime) {
  const expected = runtimeLockHash(runtime.status, runtime.version, runtime.commit);
  if (runtime.identitySha256 !== expected) fail('runtime.identitySha256 no coincide con su identidad');
  if (runtime.status === 'installed' && !runtime.artifactSha256) fail('runtime instalado requiere artifactSha256');
}

export async function gitArchiveSha256(toolRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', toolRoot, 'archive', '--format=tar', 'HEAD'], {
      cwd: toolRoot,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const hash = createHash('sha256');
    let stderr = '';
    const timeout = setTimeout(() => {
      if (process.platform === 'win32' && child.pid) {
        spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { shell: false, stdio: 'ignore', windowsHide: true });
      } else child.kill('SIGTERM');
      reject(new Error('git archive excedió el timeout'));
    }, 30_000);
    child.stdout.on('data', chunk => hash.update(chunk));
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      if (signal || code !== 0) reject(new Error(`git archive falló (${signal ?? code}): ${stderr.trim()}`));
      else resolve(hash.digest('hex'));
    });
  });
}

async function gitStatusPorcelain(toolRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', toolRoot, 'status', '--porcelain=v1', '-z', '--untracked-files=all'], {
      cwd: toolRoot,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks = [];
    let stderr = '';
    const timeout = setTimeout(() => {
      if (process.platform === 'win32' && child.pid) {
        spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { shell: false, stdio: 'ignore', windowsHide: true });
      } else child.kill('SIGTERM');
      reject(new Error('git status excedió el timeout'));
    }, 30_000);
    child.stdout.on('data', chunk => chunks.push(Buffer.from(chunk)));
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      if (signal || code !== 0) reject(new Error(`git status falló (${signal ?? code}): ${stderr.trim()}`));
      else resolve({ text: Buffer.concat(chunks).toString('utf8') });
    });
  });
}

async function parentGitlinkCommit(workspaceRoot, configuredSourcePath) {
  const rootReal = await realpath(workspaceRoot);
  const sourceReal = await realpath(configuredSourcePath);
  const relative = path.relative(rootReal, sourceReal).replace(/\\/g, '/');
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) return null;
  const result = await runProcess('git', ['-C', rootReal, 'ls-tree', 'HEAD', '--', relative], { cwd: rootReal, timeoutMs: 10_000 });
  if (result.code !== 0) throw new Error(`no se pudo leer el gitlink de ${relative}`);
  const match = /^160000\s+commit\s+([a-f0-9]{40})\s+/mu.exec(result.stdout);
  return match?.[1] ?? null;
}

async function patchFileSha256(workspaceRoot, patchPath) {
  if (typeof patchPath !== 'string' || path.isAbsolute(patchPath) || patchPath.replace(/\\/g, '/').split('/').includes('..')) {
    throw new Error('quality-tools.patch.path debe ser una ruta relativa dentro del workspace');
  }
  const patchAbsolute = path.join(workspaceRoot, patchPath);
  await assertInsideWorkspace(workspaceRoot, patchAbsolute, 'quality-tools.patch.path');
  return createHash('sha256').update(await readFile(patchAbsolute)).digest('hex');
}

async function gitDiffSha256(toolRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', toolRoot, 'diff', '--binary', '--no-ext-diff'], {
      cwd: toolRoot,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const hash = createHash('sha256');
    let stderr = '';
    const timeout = setTimeout(() => {
      if (process.platform === 'win32' && child.pid) {
        spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { shell: false, stdio: 'ignore', windowsHide: true });
      } else child.kill('SIGTERM');
      reject(new Error('git diff excedió el timeout'));
    }, 30_000);
    child.stdout.on('data', chunk => hash.update(chunk));
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      if (signal || code !== 0) reject(new Error(`git diff falló (${signal ?? code}): ${stderr.trim()}`));
      else resolve(hash.digest('hex'));
    });
  });
}

export async function inspectInstalledAnalyzers(workspaceRoot, manifest) {
  const results = {};
  if (manifest.installRoot !== undefined) validateInstallRoot(manifest.installRoot);
  for (const [name, config] of Object.entries(manifest.tools)) {
    const toolRoot = await resolveToolRoot(workspaceRoot, name, config, manifest);
    const cliPath = path.join(toolRoot, config.cli);
    try {
      await access(cliPath);
    } catch {
      throw new Error(`Falta el CLI instalado de ${name}; ejecuta npm run quality:setup`);
    }
    const status = await gitStatusPorcelain(toolRoot);
    const untrustedChanges = untrustedCheckoutChanges(status.text);
    const configuredSourcePath = resolveConfiguredSourcePath(config, `quality-tools.json.tools.${name}`, { baseDir: workspaceRoot });
    if (configuredSourcePath !== null && config.patch !== undefined) {
      throw new Error(`${name}: sourcePath no puede combinarse con patch local`);
    }
    const patchSha256 = config.patch?.sha256 ?? null;
    if (patchSha256 !== null) {
      const declaredSha = await patchFileSha256(workspaceRoot, config.patch.path);
      if (declaredSha !== patchSha256) throw new Error(`${name}: SHA-256 del patch declarado no coincide con quality-tools.json`);
    }
    let actualPatchSha = createHash('sha256').digest('hex');
    if (untrustedChanges.length > 0) {
      actualPatchSha = await gitDiffSha256(toolRoot);
      const patchPaths = patchSha256 ? await declaredPatchPaths(workspaceRoot, config.patch.path) : new Set();
      const changedPaths = checkoutPaths(status.text);
      const onlyDeclaredPatch = patchSha256 !== null
        && actualPatchSha === patchSha256
        && [...changedPaths].every(file => patchPaths.has(file));
      if (!onlyDeclaredPatch) throw new Error(`${name}: checkout modificado; no se puede confiar en sentinel.lock.json (${untrustedChanges.join(', ')})`);
    }
    if (patchSha256 === null && actualPatchSha !== createHash('sha256').digest('hex')) {
      throw new Error(`${name}: checkout modificado sin patch declarado`);
    }
    const version = await runProcess(process.execPath, [cliPath, '--version'], { cwd: workspaceRoot, timeoutMs: 10_000 });
    if (version.code !== 0) throw new Error(`${name}: no se pudo leer la versión instalada`);
    const revision = await runProcess('git', ['-C', toolRoot, 'rev-parse', 'HEAD'], { cwd: workspaceRoot, timeoutMs: 10_000 });
    if (revision.code !== 0) throw new Error(`${name}: no se pudo leer el commit instalado`);
    const sha256 = await gitArchiveSha256(toolRoot);
    if (patchSha256 !== null && actualPatchSha !== patchSha256) {
      throw new Error(`${name}: patch aplicado no coincide con quality-tools.json`);
    }
    if (configuredSourcePath !== null && revision.stdout.trim() !== config.commit) {
      throw new Error(`${name}: sourcePath externo no coincide con el commit fijado`);
    }
    if (configuredSourcePath !== null) {
      const gitlink = await parentGitlinkCommit(workspaceRoot, configuredSourcePath);
      if (!gitlink) throw new Error(`${name}: sourcePath interno no está representado por un gitlink inicializado`);
      if (gitlink !== revision.stdout.trim()) throw new Error(`${name}: gitlink del workspace no coincide con el checkout instalado`);
      if (gitlink !== config.commit) throw new Error(`${name}: gitlink no coincide con quality-tools.json`);
    }
    results[name] = {
      version: version.stdout.trim(),
      protocolVersion: Number(config.outputSchemaVersion),
      commit: revision.stdout.trim(),
      sha256,
      patchSha256,
      ...(config.capabilities === undefined ? {} : { capabilities: config.capabilities }),
      ...(config.sourcePathEnv === undefined ? {} : { sourcePathEnv: config.sourcePathEnv, sourcePathRealpath: toolRoot }),
      cliPath,
    };
  }
  return results;
}

function checkoutPaths(statusOutput) {
  return new Set(untrustedCheckoutChanges(statusOutput).map(line => line.slice(3).replace(/\\/g, '/')));
}

async function declaredPatchPaths(workspaceRoot, patchPath) {
  if (typeof patchPath !== 'string' || path.isAbsolute(patchPath) || patchPath.replace(/\\/g, '/').split('/').includes('..')) {
    throw new Error('quality-tools.patch.path debe ser una ruta relativa dentro del workspace');
  }
  const patch = await readFile(path.join(workspaceRoot, patchPath), 'utf8');
  const paths = new Set();
  for (const line of patch.split('\n')) {
    const match = /^diff --git a\/(.+) b\/(.+)$/u.exec(line);
    if (match) {
      paths.add(match[1]);
      paths.add(match[2]);
    }
  }
  if (paths.size === 0) throw new Error('quality-tools.patch no contiene rutas diff válidas');
  return paths;
}

export async function verifyInstalledAnalyzers(workspaceRoot, manifest, lock) {
  const inspected = await inspectInstalledAnalyzers(workspaceRoot, manifest);
  const results = {};
  for (const [name, installed] of Object.entries(inspected)) {
    const expected = lock.analyzers[name];
    if (!expected || installed.version !== expected.version) {
      throw new Error(`${name}: versión instalada no coincide con sentinel.lock.json`);
    }
    if (installed.commit !== expected.commit) {
      throw new Error(`${name}: commit instalado no coincide con sentinel.lock.json`);
    }
    if (installed.sha256 !== expected.sha256) {
      throw new Error(`${name}: SHA-256 del árbol instalado no coincide con sentinel.lock.json`);
    }
    if (installed.patchSha256 !== (expected.patchSha256 ?? null)) {
      throw new Error(`${name}: SHA-256 del patch instalado no coincide con sentinel.lock.json`);
    }
    if (installed.sourcePathEnv !== expected.sourcePathEnv) {
      throw new Error(`${name}: sourcePath externo instalado no coincide con sentinel.lock.json`);
    }
    if (expected.sourcePathRealpath !== undefined && installed.sourcePathRealpath !== expected.sourcePathRealpath) {
      throw new Error(`${name}: sourcePathRealpath instalado no coincide con sentinel.lock.json`);
    }
    results[name] = installed;
  }
  return results;
}

export { LOCK_FILE, LOCK_SCHEMA_VERSION, validateInstallRoot };
