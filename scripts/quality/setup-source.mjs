import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveConfiguredSourcePath } from './source-path.mjs';
import { captureBinary, exists, isolatedNpmEnvironment, manifestPath, npmCliPath, projectRoot, run, STAGE_TIMEOUT_MS } from './setup-run.mjs';

async function assertAppliedPatch(name, toolRoot, expectedSha256) {
  const currentPatch = await captureBinary('git', ['diff', '--binary', '--no-ext-diff'], {
    cwd: toolRoot,
  });
  const currentSha256 = createHash('sha256').update(currentPatch).digest('hex');
  if (currentSha256 !== expectedSha256) {
    throw new Error(
      `${name}: el árbol parcheado difiere del patch declarado; revisa cambios locales antes de continuar`,
    );
  }
}

async function readManifest() {
  const parsed = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (parsed.schemaVersion !== 1 || !parsed.installRoot || !parsed.tools) {
    throw new Error('quality-tools.json no cumple schemaVersion 1');
  }
  return parsed;
}

async function applyDeclaredPatch(name, config, toolRoot) {
  if (!config.patch) return null;

  const patchPath = path.resolve(projectRoot, config.patch.path);
  const relativePatchPath = path.relative(projectRoot, patchPath);
  if (relativePatchPath.startsWith('..') || path.isAbsolute(relativePatchPath)) {
    throw new Error(`${name}: la ruta del patch debe permanecer dentro del workspace`);
  }
  if (!/^[a-f0-9]{64}$/i.test(config.patch.sha256)) {
    throw new Error(`${name}: el manifest contiene un SHA-256 inválido`);
  }
  const patchBytes = await readFile(patchPath);
  const patchSha256 = createHash('sha256').update(patchBytes).digest('hex');
  if (patchSha256 !== config.patch.sha256) {
    throw new Error(`${name}: SHA-256 del patch no coincide; revisa el patch y actualiza el manifest`);
  }

  const check = await run('git', ['apply', '--check', patchPath], {
    cwd: toolRoot,
    capture: true,
    allowFailure: true,
  });
  if (typeof check === 'string' || check.code === 0) {
    await run('git', ['apply', patchPath], { cwd: toolRoot });
    await assertAppliedPatch(name, toolRoot, patchSha256);
    process.stdout.write(`[quality:setup] ${name}: patch aplicado (${patchSha256.slice(0, 12)})\n`);
    return patchSha256;
  }

  const reverseCheck = await run('git', ['apply', '--reverse', '--check', patchPath], {
    cwd: toolRoot,
    capture: true,
    allowFailure: true,
  });
  if (typeof reverseCheck === 'string' || reverseCheck.code === 0) {
    await assertAppliedPatch(name, toolRoot, patchSha256);
    process.stdout.write(`[quality:setup] ${name}: patch ya aplicado (${patchSha256.slice(0, 12)})\n`);
    return patchSha256;
  }

  throw new Error(
    `${name}: no se pudo aplicar ni reconocer el patch ${config.patch.path}\n${check.stderr || reverseCheck.stderr}`,
  );
}

async function writeReleaseEvidence(name, config, commit) {
  const evidenceRoot = path.join(projectRoot, '.sentinel', 'release-evidence');
  await mkdir(evidenceRoot, { recursive: true });
  await writeFile(path.join(evidenceRoot, `${name}.json`), `${JSON.stringify({
    schemaVersion: 1,
    tool: name,
    commit,
    compile: 'passed',
    suite: config.testScript ? 'passed' : 'not-configured',
    cleanStaging: true,
    at: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8');
}

async function stageSourcePathBuild(name, config, toolRoot) {
  const currentCommit = await run('git', ['rev-parse', 'HEAD'], { cwd: toolRoot, capture: true });
  if (currentCommit !== config.commit) {
    throw new Error(`${name}: sourcePath está en ${currentCommit}; se esperaba ${config.commit}`);
  }
  const beforeStatus = await run('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: toolRoot, capture: true });
  const stagingRoot = await mkdtemp(path.join(os.tmpdir(), `glory-quality-${name}-`));
  const treeArchive = path.join(os.tmpdir(), `glory-quality-${name}-${process.pid}.tar`);
  try {
    /* [SNT-16f] El staging se materializa desde `git archive HEAD`: solo el
     * árbol commiteado (sin cambios sin commitear ni artefactos locales), de
     * modo que compile + suite certifican exactamente el commit fijado. */
    await writeFile(treeArchive, await captureBinary('git', ['archive', '--format=tar', 'HEAD'], { cwd: toolRoot }));
    /* [318A-4] GNU tar (Git for Windows) interpreta `C:/...` como host remoto
     * (`Cannot connect to C:`) y bsdtar no acepta `--force-local`. La ruta
     * relativa desde el cwd del staging elimina la ambigüedad para ambos: el
     * archive y el staging viven juntos en el tmpdir (padre-hijo), así que
     * `../<basename>` es suficiente. */
    await run('tar', ['-xf', `..${path.sep}${path.basename(treeArchive)}`], { cwd: stagingRoot });
    const env = isolatedNpmEnvironment();
    env.GLORY_QUALITY_SETUP = '1';
    await run(process.execPath, [npmCliPath, 'ci', '--ignore-scripts'], { cwd: stagingRoot, env, timeoutMs: STAGE_TIMEOUT_MS });
    await run(process.execPath, [npmCliPath, 'run', config.buildScript], { cwd: stagingRoot, env, timeoutMs: STAGE_TIMEOUT_MS });
    if (config.testScript) {
      const testArgs = [npmCliPath, 'run', config.testScript];
      await run(process.execPath, testArgs, { cwd: stagingRoot, env, timeoutMs: STAGE_TIMEOUT_MS });
    }

    /* Solo se materializan artefactos generados/ignorados. La instalación y
     * compilación nunca ejecutan npm dentro del checkout versionado. */
    await rm(path.join(toolRoot, 'node_modules'), { recursive: true, force: true });
    await cp(path.join(stagingRoot, 'node_modules'), path.join(toolRoot, 'node_modules'), { recursive: true });
    const artifactRoot = String(config.cli).split(/[\\/]/u)[0];
    await rm(path.join(toolRoot, artifactRoot), { recursive: true, force: true });
    await cp(path.join(stagingRoot, artifactRoot), path.join(toolRoot, artifactRoot), { recursive: true });
    const afterStatus = await run('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: toolRoot, capture: true });
    if (afterStatus !== beforeStatus) {
      throw new Error(`${name}: el provisioning aislado modificó archivos versionados del submódulo`);
    }
    const commit = await run('git', ['rev-parse', 'HEAD'], { cwd: toolRoot, capture: true });
    await writeReleaseEvidence(name, config, commit);
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
    await rm(treeArchive, { force: true }).catch(() => undefined);
  }
}

async function ensureSourcePathReady(name, config) {
  const configuredSourcePath = resolveConfiguredSourcePath(config, `quality-tools.json.tools.${name}`, { baseDir: projectRoot });
  const toolRoot = path.resolve(configuredSourcePath);
  const relativeFromRoot = path.relative(projectRoot, toolRoot);
  const isInsideWorkspace = relativeFromRoot !== ''
    && !relativeFromRoot.startsWith('..')
    && !path.isAbsolute(relativeFromRoot);
  if (!await exists(path.join(toolRoot, '.git'))) {
    if (!isInsideWorkspace) throw new Error(`${name}: sourcePath no contiene un checkout Git válido`);
    /* [028A-8] Clon limpio: el submódulo interno puede no estar inicializado. */
    process.stdout.write(`[quality:setup] ${name}: inicializando submódulo ${relativeFromRoot}\n`);
    await run('git', ['submodule', 'update', '--init', '--', relativeFromRoot.replace(/\\/g, '/')], { cwd: projectRoot });
  }
  if (isInsideWorkspace) {

    /* [SNT-16f] Cada setup interno recompila y prueba en staging aislado. */
    process.stdout.write(`[quality:setup] ${name}: compile + suite en staging aislado ${relativeFromRoot}\n`);
    await stageSourcePathBuild(name, config, toolRoot);
  } else if (!await exists(path.join(toolRoot, config.cli))) {
    throw new Error(`${name}: sourcePath no contiene un CLI válido; compílalo manualmente en ${toolRoot}`);
  }
  const currentCommit = await run('git', ['rev-parse', 'HEAD'], { cwd: toolRoot, capture: true });
  if (currentCommit !== config.commit) {
    throw new Error(`${name}: sourcePath está en ${currentCommit}; se esperaba ${config.commit}`);
  }
  const installedVersion = await run(process.execPath, [path.join(toolRoot, config.cli), '--version'], { capture: true });
  if (installedVersion !== config.version) {
    throw new Error(`${name}: sourcePath reporta ${installedVersion}; se esperaba ${config.version}`);
  }
  return { toolRoot, currentCommit, installedVersion };
}

export { applyDeclaredPatch, ensureSourcePathReady, readManifest };
