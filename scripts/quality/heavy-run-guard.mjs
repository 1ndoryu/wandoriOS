import { spawn } from 'node:child_process';
import path from 'node:path';
import {
  acquireHeavyRun,
  activePath,
  findQualityRoot,
  formatHeavyGuardMessage,
  isHeavyCargoCommand,
  readJson,
  resolveTargetBase,
  statePath,
} from './heavy-run-guard-core.mjs';

/* Fachada del guard: la lógica vive en heavy-run-guard-core.mjs. Este archivo
 * conserva la ruta pública (runners, task-check, target-maintenance y el marcador
 * de raíz de findQualityRoot) y el CLI (--status, --execute-cargo). */
export * from './heavy-run-guard-core.mjs';

async function executeCargo(argv) {
  const separator = argv.indexOf('--');
  const options = argv.slice(0, separator === -1 ? argv.length : separator);
  const cargoArgs = separator === -1 ? [] : argv.slice(separator + 1);
  const projectIndex = options.indexOf('--project-root');
  const cargoIndex = options.indexOf('--cargo-path');
  const reasonIndex = options.indexOf('--heavy-reason');
  const requestedRoot = projectIndex >= 0 ? path.resolve(options[projectIndex + 1]) : process.cwd();
  const projectRoot = await findQualityRoot(requestedRoot);
  const cargoPath = cargoIndex >= 0 ? options[cargoIndex + 1] : (process.platform === 'win32' ? 'cargo.exe' : 'cargo');
  const heavyReason = reasonIndex >= 0 ? options[reasonIndex + 1] : undefined;
  if (!isHeavyCargoCommand(cargoArgs)) {
    const light = spawn(cargoPath, cargoArgs, { cwd: projectRoot, env: process.env, stdio: 'inherit', shell: false, windowsHide: true });
    light.on('error', error => {
      console.error(`[glory-quality] Cargo no pudo iniciar: ${error.message}`);
      process.exitCode = 2;
    });
    light.on('exit', (code, signal) => { process.exitCode = signal ? 2 : code ?? 2; });
    return;
  }
  const lease = await acquireHeavyRun({
    projectRoot,
    mode: 'raw-cargo',
    command: `cargo ${cargoArgs.join(' ')}`,
    allowHeavy: options.includes('--allow-heavy'),
    heavyReason,
  });
  if (!lease.allowed) {
    console.error(`[glory-quality] BLOQUEADO: ${formatHeavyGuardMessage(lease)}`);
    process.exitCode = 75;
    return;
  }
  const child = spawn(cargoPath, cargoArgs, { cwd: projectRoot, env: process.env, stdio: 'inherit', shell: false, windowsHide: true });
  child.on('error', async error => {
    await lease.release({ status: 'error' });
    console.error(`[glory-quality] Cargo no pudo iniciar: ${error.message}`);
    process.exitCode = 2;
  });
  child.on('exit', async (code, signal) => {
    await lease.release({ status: signal ? 'signal' : code === 0 ? 'pass' : 'fail' });
    process.exitCode = signal ? 2 : code ?? 2;
  });
}

const argv = process.argv.slice(2);
if (argv.includes('--execute-cargo')) await executeCargo(argv);
else if (argv.includes('--status')) {
  const targetBase = resolveTargetBase();
  const state = await readJson(statePath(targetBase), { version: 1, projects: {} });
  const active = await readJson(activePath(targetBase), null);
  console.log(JSON.stringify({ targetBase, state, active }, null, 2));
}
