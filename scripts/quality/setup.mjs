import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectInstalledAnalyzers } from './lockfile.mjs';
import { resolveConfiguredSourcePath } from './source-path.mjs';
import { exists, npmCliPath, projectRoot, run } from './setup-run.mjs';
import { applyDeclaredPatch, ensureSourcePathReady, readManifest } from './setup-source.mjs';

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

/* Sin guardia, importar este módulo (p. ej. desde un test) ejecutaba la instalación completa. */
const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  main().catch(error => {
    process.stderr.write(`[quality:setup] ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
