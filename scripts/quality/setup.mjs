import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectInstalledAnalyzers } from './lockfile.mjs';
import { resolveConfiguredSourcePath } from './source-path.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = path.join(projectRoot, 'quality-tools.json');
const realNodeDir = path.dirname(process.execPath);
const npmCliPath = path.join(realNodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');

function isolatedNpmEnvironment() {
  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
  const currentPath = process.env[pathKey] ?? process.env.PATH ?? '';
  const safePath = currentPath
    .split(path.delimiter)
    .filter(entry => !/[\\/]Owner[\\/]bin(?:[\\/]|$)/iu.test(entry))
    .filter(entry => !/[\\/]GlorySentinel[\\/](?:shims|bin)(?:[\\/]|$)/iu.test(entry))
    .filter(entry => !/[\\/]scripts[\\/]quality(?:[\\/]|$)/iu.test(entry));
  const safePathValue = [realNodeDir, ...safePath].join(path.delimiter);
  const environment = {
    ...process.env,
    npm_execpath: npmCliPath,
    npm_config_script_shell: process.platform === 'win32' ? 'C:\\Windows\\System32\\cmd.exe' : '/bin/sh',
    PATH: safePathValue,
    ...(process.platform === 'win32' ? { Path: safePathValue } : {}),
  };
  for (const key of Object.keys(environment)) {
    if (/^GLORY_(?:REAL_|GUARD_|QUALITY_)/u.test(key)) delete environment[key];
  }
  delete environment.npm_config_userconfig;
  delete environment.NPM_CONFIG_USERCONFIG;
  delete environment.BASH_ENV;
  delete environment.ENV;
  return environment;
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd ?? projectRoot,
      shell: false,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: true,
      ...(options.env ? { env: options.env } : {}),
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32' && child.pid) {
        spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
          shell: false,
          stdio: 'ignore',
          windowsHide: true,
        });
      } else {
        child.kill('SIGTERM');
      }
    }, options.timeoutMs ?? 300_000);
    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.stderr?.on('data', chunk => { stderr += chunk; });
    child.on('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`${executable} excedió el timeout`));
        return;
      }
      if (signal || code !== 0) {
        if (options.allowFailure) {
          resolve({ code: code ?? 1, signal, stdout: stdout.trim(), stderr: stderr.trim() });
          return;
        }
        reject(new Error(`${executable} ${args.join(' ')} falló (${signal ?? code})\n${stderr.trim()}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function captureBinary(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd ?? projectRoot,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      ...(options.env ? { env: options.env } : {}),
    });
    const stdout = [];
    let stderr = '';
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32' && child.pid) {
        spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
          shell: false,
          stdio: 'ignore',
          windowsHide: true,
        });
      } else {
        child.kill('SIGTERM');
      }
    }, options.timeoutMs ?? 300_000);
    child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`${executable} excedió el timeout`));
        return;
      }
      if (signal || code !== 0) {
        reject(new Error(`${executable} ${args.join(' ')} falló (${signal ?? code})\\n${stderr.trim()}`));
        return;
      }
      resolve(Buffer.concat(stdout));
    });
  });
}

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
    await run(process.execPath, [npmCliPath, 'ci', '--ignore-scripts'], { cwd: stagingRoot, env });
    await run(process.execPath, [npmCliPath, 'run', config.buildScript], { cwd: stagingRoot, env });
    if (config.testScript) {
      const testArgs = [npmCliPath, 'run', config.testScript];
      await run(process.execPath, testArgs, { cwd: stagingRoot, env });
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

async function installTool(name, config, installRoot) {
  const configuredSourcePath = resolveConfiguredSourcePath(config, `quality-tools.json.tools.${name}`, { baseDir: projectRoot });
  if (configuredSourcePath !== null) {
    if (config.patch) throw new Error(`${name}: sourcePath no puede combinarse con patch local`);
    const { currentCommit, installedVersion } = await ensureSourcePathReady(name, config);
    process.stdout.write(`[quality:setup] ${name}: sourcePath verificado, no se modifica .quality-tools\\n`);
    return {
      commit: currentCommit,
      version: installedVersion,
      patchSha256: null,
      sourcePathEnv: config.sourcePathEnv,
      cli: config.cli,
    };
  }
  const toolRoot = path.join(installRoot, name);
  const gitRoot = path.join(toolRoot, '.git');
  const markerPath = path.join(toolRoot, '.quality-install.json');
  process.stdout.write(`[quality:setup] ${name}: preparando ${config.version}\n`);

  if (!await exists(toolRoot)) {
    await run('git', ['clone', '--filter=blob:none', '--no-checkout', config.repository, toolRoot]);
    await run('git', ['checkout', '--detach', config.commit], { cwd: toolRoot });
  } else {
    if (!await exists(gitRoot)) {
      throw new Error(`${toolRoot} existe pero no es un checkout administrado; muévelo y repite quality:setup`);
    }
    const currentCommit = await run('git', ['rev-parse', 'HEAD'], { cwd: toolRoot, capture: true });
    if (currentCommit !== config.commit) {
      throw new Error(`${name} está en ${currentCommit}; se esperaba ${config.commit}. Reinstala .quality-tools/${name}`);
    }
  }

  const patchSha256 = await applyDeclaredPatch(name, config, toolRoot);
  const cliPath = path.join(toolRoot, config.cli);
  if (await exists(markerPath) && await exists(cliPath)) {
    const marker = JSON.parse(await readFile(markerPath, 'utf8'));
    const installedVersion = await run(process.execPath, [cliPath, '--version'], { capture: true });
    if (
      marker.commit === config.commit
      && marker.patchSha256 === patchSha256
      && marker.testScript === (config.testScript ?? null)
      && installedVersion === config.version
    ) {
      process.stdout.write(`[quality:setup] ${name}: PASS (cache)\n`);
      return {
        commit: config.commit,
        version: installedVersion,
        patchSha256,
        cli: path.relative(projectRoot, cliPath),
      };
    }
  }

  await run(process.execPath, [npmCliPath, 'ci', '--ignore-scripts'], { cwd: toolRoot });
  await run(process.execPath, [npmCliPath, 'run', config.buildScript], { cwd: toolRoot });
  if (config.testScript) {
    await run(process.execPath, [npmCliPath, 'run', config.testScript], { cwd: toolRoot });
  }
  const installedVersion = await run(process.execPath, [cliPath, '--version'], { capture: true });
  if (installedVersion !== config.version) {
    throw new Error(`${name} reporta ${installedVersion}; se esperaba ${config.version}`);
  }
  const markerTemporaryPath = `${markerPath}.tmp`;
  await writeFile(
    markerTemporaryPath,
    `${JSON.stringify({
      commit: config.commit,
      version: installedVersion,
      patchSha256,
      testScript: config.testScript ?? null,
    })}\n`,
    'utf8',
  );
  await rename(markerTemporaryPath, markerPath);
  process.stdout.write(`[quality:setup] ${name}: PASS\n`);
  return {
    commit: config.commit,
    version: installedVersion,
    patchSha256,
    cli: path.relative(projectRoot, cliPath),
  };
}

async function main() {
  const manifest = await readManifest();
  const externalOnly = Object.values(manifest.tools).every(config => resolveConfiguredSourcePath(config, 'quality-tools.json.tools', { baseDir: projectRoot }) !== null);
  if (externalOnly) {
    /* [028A-8] Un sourcePath interno (submódulo) debe estar inicializado y
     * compilado antes de inspeccionar, para que un clon limpio sea reproducible. */
    for (const [name, config] of Object.entries(manifest.tools)) {
      if (resolveConfiguredSourcePath(config, `quality-tools.json.tools.${name}`, { baseDir: projectRoot }) === null) continue;
      await ensureSourcePathReady(name, config);
    }
    const inspected = await inspectInstalledAnalyzers(projectRoot, manifest);
    for (const [name, tool] of Object.entries(inspected)) {
      process.stdout.write(`[quality:setup] ${name}: sourcePath verificado (${tool.commit}), no se modifica .quality-tools\\n`);
    }
    process.stdout.write('[quality:setup] Checkouts listos. Próximo: npm run task:check -- <ID>\\n');
    return;
  }

  const installRoot = path.resolve(projectRoot, manifest.installRoot);
  await mkdir(installRoot, { recursive: true });
  const installed = {};

  for (const [name, config] of Object.entries(manifest.tools)) {
    installed[name] = await installTool(name, config, installRoot);
  }

  const statePath = path.join(installRoot, 'install-state.json');
  const temporaryPath = `${statePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify({ schemaVersion: 1, installed }, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, statePath);
  process.stdout.write('[quality:setup] Herramientas listas. Próximo: npm run task:check -- <ID>\n');
}

main().catch(error => {
  process.stderr.write(`[quality:setup] ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
