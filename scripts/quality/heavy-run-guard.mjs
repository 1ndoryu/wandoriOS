import { appendFile, lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { redact } from './redaction.mjs';

const DEFAULT_COOLDOWN_MS = 3 * 60 * 60 * 1000;
const DEFAULT_TARGET_BASE = process.platform === 'win32'
  ? 'C:\\tmp\\glory-target'
  : path.join(os.tmpdir(), 'glory-target');

function normalizeRoot(value) {
  return path.resolve(value).replace(/\\/g, '/').toLowerCase();
}

function projectKey(projectRoot) {
  return crypto.createHash('sha256').update(normalizeRoot(projectRoot)).digest('hex').slice(0, 16);
}

export function resolveTargetBase() {
  return path.resolve(process.env.CARGO_TARGET_DIR_BASE || DEFAULT_TARGET_BASE);
}

export function resolveGuardRoot(targetBase = resolveTargetBase()) {
  return path.join(path.dirname(path.resolve(targetBase)), 'glory-quality-guard');
}

function statePath(targetBase) {
  return path.join(resolveGuardRoot(targetBase), 'state.json');
}

function activePath(targetBase) {
  return path.join(resolveGuardRoot(targetBase), 'active.json');
}

async function readJson(filePath, fallback) {
  try { return JSON.parse(await readFile(filePath, 'utf8')); }
  catch { return fallback; }
}

async function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  try { await rename(temporary, filePath); }
  catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch { return false; }
}

function readCooldownMs(config = {}) {
  const minutes = Number(config.heavyRun?.cooldownMinutes);
  if (!Number.isFinite(minutes) || minutes < 0) return DEFAULT_COOLDOWN_MS;
  return minutes * 60 * 1000;
}

async function readProjectConfig(projectRoot) {
  return readJson(path.join(projectRoot, 'quality.config.json'), {});
}

export async function findQualityRoot(startPath = process.cwd()) {
  let candidate = path.resolve(startPath);
  try {
    candidate = await realpath(candidate);
  } catch (error) {
    if (error?.code === 'ENOENT') return path.resolve(startPath);
    throw error;
  }
  while (candidate) {
    const config = path.join(candidate, 'quality.config.json');
    const guard = path.join(candidate, 'scripts', 'quality', 'heavy-run-guard.mjs');
    try {
      const configMetadata = await lstat(config);
      const guardMetadata = await lstat(guard);
      if (!configMetadata.isFile() || !guardMetadata.isFile()) throw new Error('quality markers are not regular files');
      return candidate;
    } catch { /* Symlink/junction o marcador ausente: sube al padre. */ }
    const parent = path.dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }
  return path.resolve(startPath);
}

export function isHeavyCargoCommand(args) {
  const command = args.find(value => !String(value).startsWith('-'))?.toLowerCase();
  return command === 'test' || command === 'clippy' || command === 'bench';
}

/* [SNT-11] RE-ACTIVADO (2026-08-05, decisión explícita del usuario): la
 * excepción manual del guard vuelve a conceder saltos del cooldown de 180 min
 * usando `--allow-heavy --heavy-reason "<motivo>"` (o GLORY_HEAVY_RUN_TOKEN).
 * El cooldown NO se elimina: sigue bloqueando las ejecuciones pesadas normales
 * (sin excepción) y toda activación manual queda auditada en heavy-overrides.log
 * con granted:true/false, motivo, comando y PID. El motivo es requisito (un
 * intento sin motivo se rechaza). Únicamente CI (modo sancionado, no corre en
 * el equipo) sigue autorizado a full sin cooldown. */
export const HEAVY_MANUAL_OVERRIDE_ENABLED = true;

export function isHeavyOverride(options = {}) {
  if (options.ci) return true;
  if (!HEAVY_MANUAL_OVERRIDE_ENABLED) return false;
  return Boolean(
    options.allowHeavy
    || process.env.GLORY_QUALITY_ALLOW_HEAVY === '1'
    || process.env.GLORY_HEAVY_RUN_TOKEN,
  );
}

/* [028A-16] Fuente manual de la excepción del guard: flag, env o token. CI
 * es un modo sancionado (no una excepción manual) y no entra aquí. */
export function manualOverrideSource(options = {}) {
  if (options.allowHeavy) return 'flag';
  if (process.env.GLORY_QUALITY_ALLOW_HEAVY === '1') return 'env';
  if (process.env.GLORY_HEAVY_RUN_TOKEN) return 'token';
  return null;
}

/* [028A-16] El motivo de la excepción llega por flag o por env; si falta, la
 * excepción se rechaza y el intento queda registrado en el log de auditoría. */
export function overrideReason(options = {}) {
  const flag = typeof options.heavyReason === 'string' ? options.heavyReason.trim() : '';
  const env = typeof process.env.GLORY_HEAVY_RUN_REASON === 'string' ? process.env.GLORY_HEAVY_RUN_REASON.trim() : '';
  return flag || env;
}

/* [028A-16] Auditoría persistente de excepciones del guard: cada activación
 * de --allow-heavy / GLORY_QUALITY_ALLOW_HEAVY / GLORY_HEAVY_RUN_TOKEN queda
 * en .quality-reports/heavy-overrides.log con timestamp, source, comando,
 * cwd, PID y motivo. Nunca bloquea la decisión: un fallo de escritura solo se
 * reporta a stderr. */
export async function logHeavyOverride({ projectRoot, source, command, cwd, pid, reason, granted, taskId }) {
  try {
    const logDir = path.join(projectRoot, '.quality-reports');
    await mkdir(logDir, { recursive: true });
    /* [028A-16] El comando y el motivo se redactan igual que el resto del
     * pipeline: un comando con un secreto incrustado (p. ej. una URL con
     * credencial) no debe quedar en claro en el log de auditoría. */
    const entry = {
      version: 1,
      timestamp: new Date().toISOString(),
      source,
      command: redact(String(command ?? '')),
      cwd: cwd ?? process.cwd(),
      pid: pid ?? process.pid,
      reason: reason ? redact(String(reason)) : null,
      granted: Boolean(granted),
      taskId: taskId ?? null,
    };
    await appendFile(path.join(logDir, 'heavy-overrides.log'), `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (error) {
    process.stderr.write(`[glory-quality] No se pudo escribir heavy-overrides.log: ${error.message}\n`);
  }
}

export async function inspectHeavyRun({ projectRoot, targetBase = resolveTargetBase(), mode = 'full', allowHeavy = false, heavyReason, now = Date.now() }) {
  const config = await readProjectConfig(projectRoot);
  const cooldownMs = readCooldownMs(config);
  const state = await readJson(statePath(targetBase), { version: 1, projects: {} });
  const entry = state.projects?.[projectKey(projectRoot)];
  const lastHeavyAt = Number(entry?.lastHeavyAt || 0);
  const elapsed = lastHeavyAt > 0 ? now - lastHeavyAt : Number.POSITIVE_INFINITY;
  const remainingMs = Math.max(0, cooldownMs - elapsed);
  const manualSource = manualOverrideSource({ allowHeavy });
  const reason = overrideReason({ heavyReason });
  /* [028A-16] Una excepción manual sin motivo se rechaza antes de consultar el
   * cooldown: el motivo es requisito de la excepción, no del modo CI. */
  if (manualSource && !reason) {
    return {
      allowed: false,
      reason: 'heavy-reason-required',
      message: 'La excepción del guard requiere motivo: usa --heavy-reason "<motivo>" (o GLORY_HEAVY_RUN_REASON).',
      cooldownMs,
      remainingMs: 0,
      source: manualSource,
      override: true,
    };
  }
  const override = isHeavyOverride({ allowHeavy, ci: mode === 'ci' });
  if (!override && remainingMs > 0) {
    return {
      allowed: false,
      reason: 'cooldown',
      cooldownMs,
      remainingMs,
      nextAllowedAt: new Date(now + remainingMs).toISOString(),
      lastHeavyAt: new Date(lastHeavyAt).toISOString(),
    };
  }
  return { allowed: true, cooldownMs, remainingMs: 0, override, source: manualSource, reason };
}

async function clearStaleActiveLock(filePath, targetBase) {
  const active = await readJson(filePath, null);
  if (!active) return null;
  if (processAlive(Number(active.pid))) return active;
  await unlink(filePath).catch(() => {});
  return null;
}

export async function acquireHeavyRun({
  projectRoot,
  targetBase = resolveTargetBase(),
  mode = 'full',
  taskId = null,
  command = 'quality-full',
  allowHeavy = false,
  heavyReason,
}) {
  const decision = await inspectHeavyRun({ projectRoot, targetBase, mode, allowHeavy, heavyReason });
  /* [028A-16] Toda activación manual de la excepción queda en el log de
   * auditoría, concedida o rechazada; el propio acquire lo registra para que
   * el flag/env/token sea trazable aunque la entrada llegue por otro camino
   * (run-with-db, cargo.cmd). */
  const manualSource = manualOverrideSource({ allowHeavy });
  if (manualSource) {
    await logHeavyOverride({
      projectRoot,
      source: manualSource,
      command,
      reason: overrideReason({ heavyReason }),
      granted: decision.allowed,
      taskId,
    });
  }
  if (!decision.allowed) return decision;

  const guardRoot = resolveGuardRoot(targetBase);
  await mkdir(guardRoot, { recursive: true });
  const lockPath = activePath(targetBase);
  const token = crypto.randomUUID();
  const lock = {
    version: 1,
    token,
    pid: process.pid,
    projectRoot: normalizeRoot(projectRoot),
    taskId,
    command,
    startedAt: new Date().toISOString(),
  };
  const existing = await clearStaleActiveLock(lockPath, targetBase);
  if (existing) {
    return {
      allowed: false,
      reason: 'active',
      message: `Ya existe una ejecución pesada activa (PID ${existing.pid}).`,
    };
  }
  try { await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' }); }
  catch (error) {
    if (error.code === 'EEXIST') return { allowed: false, reason: 'active', message: 'Otra ejecución pesada tomó el guard.' };
    throw error;
  }

  let released = false;
  return {
    ...decision,
    allowed: true,
    token,
    async release({ status = 'completed' } = {}) {
      if (released) return;
      released = true;
      const stateFile = statePath(targetBase);
      const state = await readJson(stateFile, { version: 1, projects: {} });
      state.version = 1;
      state.projects ??= {};
      state.projects[projectKey(projectRoot)] = {
        projectRoot: normalizeRoot(projectRoot),
        lastHeavyAt: Date.now(),
        lastStatus: status,
        taskId,
        command,
      };
      await writeJsonAtomic(stateFile, state);
      const current = await readJson(lockPath, null);
      if (current?.token === token) await unlink(lockPath).catch(() => {});
    },
  };
}

export function formatHeavyGuardMessage(decision) {
  if (decision.reason === 'cooldown') {
    const minutes = Math.ceil(decision.remainingMs / 60_000);
    /* [SNT-11] La excepción manual está desactivada: ya no se sugiere
     * --allow-heavy; la única salida es esperar el cooldown (o CI). */
    return `Full diferido por cooldown: faltan aproximadamente ${minutes} min. Próxima ejecución: ${decision.nextAllowedAt}. La excepción manual está desactivada (SNT-11): espera al cooldown o usa CI.`;
  }
  return decision.message || 'Full diferido porque ya hay otra ejecución pesada activa.';
}

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
