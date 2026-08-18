#!/usr/bin/env node

/* Ejecuta cualquier comando de cargo con DATABASE_URL y CARGO_TARGET_DIR
 * alineados a la rama/proyecto actual. */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBranchDbContext } from './branch-db.mjs';
import { acquireHeavyRun, formatHeavyGuardMessage, isHeavyCargoCommand, isHeavyOverride } from './quality/heavy-run-guard.mjs';
import { cleanupTargets } from './quality/target-maintenance.mjs';
import { defaultAgent, listActiveForeignTakeovers } from './quality/task-takeover.mjs';

function cargoCommand() {
  return process.platform === 'win32' ? 'cargo.exe' : 'cargo';
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const cargoArgs = process.argv.slice(2);
if (cargoArgs.length === 0) {
  console.error('Uso: node scripts/run-with-db.mjs <subcomando cargo> [...args]');
  process.exit(1);
}

/* [028A-17 Fase 2] Visibilidad temprana: si OTRO agente tiene tomas activas,
 * se muestran antes de ejecutar el comando de cargo. El agente que trabaja su
 * propia tarea debe saber que hay trabajo en paralelo sobre el mismo checkout
 * aunque la suya no sea la tarea tomada. Nunca bloquea: es solo aviso. */
try {
  const foreignActive = await listActiveForeignTakeovers(projectRoot, defaultAgent());
  for (const item of foreignActive) {
    console.error(`[task-takeover] EN CURSO por ${item.entry.takenBy}: ${item.taskId} (${item.entry.id}) hasta ${item.entry.expiresAt}. No la trabajes en paralelo sin coordinar (npm run task:status).`);
  }
} catch {
  /* Degrada a “sin información”: el banner nunca bloquea el comando. */
}

console.log('');
let heavyLease = null;
if (isHeavyCargoCommand(cargoArgs) && !process.env.GLORY_HEAVY_RUN_TOKEN) {
  heavyLease = await acquireHeavyRun({
    projectRoot,
    mode: 'raw-cargo',
    command: `run-with-db ${cargoArgs.join(' ')}`,
    allowHeavy: isHeavyOverride(),
  });
  if (!heavyLease.allowed) {
    console.error(`[run-with-db] BLOQUEADO: ${formatHeavyGuardMessage(heavyLease)}`);
    process.exitCode = 75;
    process.exit();
  }
}

let dbContext;
try { dbContext = getBranchDbContext(); }
catch (error) {
  if (heavyLease?.allowed) await heavyLease.release({ status: 'setup-error' });
  throw error;
}
const { dbUrl, cargoTargetDir } = dbContext;
if (isHeavyCargoCommand(cargoArgs)) {
  const maintenance = await cleanupTargets({ projectRoot, dryRun: false, budgetMs: 60_000 });
  if (maintenance.quotaExceeded || maintenance.failed?.length) {
    if (heavyLease?.allowed) await heavyLease.release({ status: 'target-quota-exceeded' });
    console.error('[run-with-db] BLOQUEADO: C:\\tmp\\glory-target sigue sobre la cuota; detén o coordina los procesos activos antes de compilar.');
    process.exitCode = 75;
    process.exit();
  }
}
console.log('');

const activityMarker = path.join(cargoTargetDir, `.glory-cargo-active-${process.pid}.json`);
try {
  mkdirSync(cargoTargetDir, { recursive: true });
  writeFileSync(activityMarker, JSON.stringify({
    pid: process.pid,
    command: cargoArgs,
    createdAt: new Date().toISOString(),
  }, null, 2));
} catch (error) {
  console.error(`[run-with-db] No se pudo crear el marcador de actividad: ${error.message}`);
  process.exit(1);
}

function cleanupMarker() {
  if (!existsSync(activityMarker)) return;
  try {
    unlinkSync(activityMarker);
  } catch (error) {
    console.warn(`[run-with-db] No se pudo retirar el marcador: ${error.message}`);
  }
}

process.once('SIGINT', cleanupMarker);
process.once('SIGTERM', cleanupMarker);
process.once('exit', cleanupMarker);

const child = spawn(cargoCommand(), cargoArgs, {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: dbUrl, CARGO_TARGET_DIR: cargoTargetDir },
  shell: false,
});

child.on('error', (err) => {
  cleanupMarker();
  if (heavyLease?.allowed) void heavyLease.release({ status: 'error' });
  console.error('[run-with-db] Error:', err.message);
  process.exit(1);
});
child.on('exit', async (code, signal) => {
  cleanupMarker();
  if (heavyLease?.allowed) await heavyLease.release({ status: signal ? 'signal' : code === 0 ? 'pass' : 'fail' });
  if (signal || code === null) {
    console.error(`[run-with-db] Cargo terminó sin exit code (${signal ?? 'unknown signal'}).`);
    process.exit(2);
  }
  process.exit(code);
});
