#!/usr/bin/env node
/* [028A-6 Fase 3] Instalación global del runtime de Sentinel: reemplaza al
 * instalador legacy (install-global-guard.ps1) que copiaba los wrappers del
 * repositorio (npm.cmd/npx.cmd/cargo.cmd + guards) al PATH y perfiles. El
 * runtime agnóstico es ahora la única fuente de shims/guards:
 *   - instala la versión en <LOCALAPPDATA>\\GlorySentinel (versionado),
 *   - genera los shims interceptores y los expone en el PATH de usuario,
 *   - dot-sourcea el guard en los perfiles PowerShell/bash con backup previo,
 *   - retira la entrada legacy <repo>/scripts/quality del PATH de usuario.
 * Sin flags hardcodea la ruta del repositorio desde su propia ubicación
 * (import.meta.url); solo conoce su propia ruta legacy a retirar.
 *
 * Uso:
 *   node scripts/quality/install-global-runtime.mjs [--dry-run]
 *   node scripts/quality/install-global-runtime.mjs --uninstall [--dry-run]
 */
import { execFile } from 'node:child_process';
import os from 'node:os';
import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const parsed = { uninstall: false, dryRun: false, targetRoot: null };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--uninstall') parsed.uninstall = true;
    else if (arg === '--dry-run') parsed.dryRun = true;
    else if (arg === '--target-root') parsed.targetRoot = argv[++index] ?? null;
    else if (arg === '--help' || arg === '-h') parsed.help = true;
    else throw new Error(`Opción no reconocida: ${arg}`);
  }
  return parsed;
}

function resolveTargetRoot(explicit) {
  return path.resolve(explicit ?? (process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'GlorySentinel')
    : path.join(os.homedir(), '.glory-sentinel')));
}

async function userPathRead() {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', "[Environment]::GetEnvironmentVariable('Path','User')"],
    { windowsHide: true, timeout: 10_000 },
  );
  return String(stdout).trim();
}

async function userPathWrite(value) {
  const safe = value.replace(/'/gu, "''");
  await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', `[Environment]::SetEnvironmentVariable('Path', '${safe}', 'User')`],
    { windowsHide: true, timeout: 10_000 },
  );
}

/* [028A-6] Retira la entrada legacy <repo>/scripts/quality del PATH de
 * usuario (la que instalaba install-global-guard.ps1). Es la única ruta del
 * repositorio que este script conoce: la deriva de su propia ubicación. */
async function removeLegacyPathEntry(repoRoot, dryRun) {
  const legacy = path.join(repoRoot, 'scripts', 'quality');
  let current;
  try {
    current = await userPathRead();
  } catch {
    return { action: 'unsupported', legacy };
  }
  const compare = (value) => value.replace(/\\/gu, '/').replace(/\/$/u, '').toLowerCase() === legacy.replace(/\\/gu, '/').replace(/\/$/u, '').toLowerCase();
  const next = current.split(';').map(value => value.trim()).filter(Boolean).filter(value => !compare(value)).join(';');
  if (next === current) return { action: 'unchanged', legacy };
  if (dryRun) return { action: 'removed', legacy, next };
  await userPathWrite(next);
  return { action: 'removed', legacy };
}

/* [028A-6] Backup explícito previo a la migración de perfiles: el runtime
 * respalda solo perfiles sin marcadores, y los perfiles actuales tienen el
 * marcador legacy. Se copian antes de que el runtime los reescriba para que
 * la restauración manual sea trivial. */
async function backupProfiles(shimDir) {
  const backupDir = path.join(shimDir, 'profile-backups');
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const candidates = [
    path.join(os.homedir(), '.bashrc'),
    path.join(os.homedir(), '.bash_profile'),
    path.join(process.env.USERPROFILE ?? os.homedir(), 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
    path.join(process.env.USERPROFILE ?? os.homedir(), 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
  ];
  const written = [];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const target = path.join(backupDir, `migration-${stamp}-${path.basename(candidate)}`);
    await copyFile(candidate, target);
    written.push(target);
  }
  return written;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write([
      'Uso:',
      '  node scripts/quality/install-global-runtime.mjs [--dry-run] [--target-root <dir>]',
      '  node scripts/quality/install-global-runtime.mjs --uninstall [--dry-run]',
      '',
      'Instala el runtime de Sentinel globalmente (LOCALAPPDATA\\GlorySentinel):',
      'shims en PATH de usuario, guard dot-sourceado en perfiles con backup,',
      'y retira la entrada legacy scripts/quality del PATH.',
      '',
    ].join('\n'));
    return;
  }

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const targetRoot = resolveTargetRoot(args.targetRoot);
  const sentinelCli = path.join(repoRoot, 'tools', 'sentinel', 'out', 'cli', 'index.js');
  const shimDir = path.join(targetRoot, 'shims');
  if (!existsSync(sentinelCli)) {
    throw new Error(`CLI de Sentinel no compilado: ${sentinelCli}. Ejecuta primero: cd tools/sentinel && npm run compile`);
  }

  if (args.uninstall) {
    /* [028A-6 Fase 5] Retirada de la integración global delegando en el
     * comando del runtime `sentinel uninstall`: retira SOLO entradas
     * administradas (PATH shims+bin, marcadores de perfiles nuevos/legacy y
     * directorio de shims). Con --keep-runtime se conserva el runtime
     * versionado (versions/current/bin) para reinstalar rápido; para
     * retirar TODO lo administrado usar: sentinel uninstall --target-root
     * <dir> (sin --keep-runtime). Exit != 0 si un paso falla. */
    const { runCli } = await import(pathToFileURL(sentinelCli));
    const exitCode = await runCli([
      'uninstall',
      '--target-root', targetRoot,
      '--keep-runtime',
      ...(args.dryRun ? ['--dry-run'] : []),
      ...(args.dryRun ? ['--json'] : []),
    ]);
    if (exitCode !== 0) {
      throw new Error(`sentinel uninstall falló (exit ${exitCode}); la retirada quedó incompleta. Revisa la salida anterior.`);
    }
    process.stdout.write(`[install-global-runtime] Retirada de la integración completa (runtime conservado).\n`);
    process.stdout.write(`[install-global-runtime] Para retirar también el runtime: sentinel uninstall --target-root ${targetRoot}\n`);
    return;
  }

  const { runCli } = await import(pathToFileURL(sentinelCli));
  const cliArgs = [
    'install',
    '--target-root', targetRoot,
    '--source-root', path.join(repoRoot, 'tools', 'sentinel'),
    '--with-shims', '--with-profiles', '--with-path',
    ...(args.dryRun ? ['--dry-run'] : []),
  ];

  if (!args.dryRun) {
    const backups = await backupProfiles(shimDir);
    process.stdout.write(`[install-global-runtime] Backup de perfiles previo a migración: ${backups.length} archivo(s) en ${shimDir}\\profile-backups\n`);
  } else {
    process.stdout.write('[install-global-runtime] DRY-RUN: no se escribe nada.\n');
  }

  process.stdout.write(`[install-global-runtime] ${args.dryRun ? 'Simulando' : 'Ejecutando'} sentinel ${cliArgs.slice(0, 6).join(' ')} ...\n`);
  /* [028A-6] El runtime devuelve exit != 0 si algún paso (perfiles, PATH)
   * falla con 'error'; el instalador debe abortar en ese caso y NO declarar
   * "migración completa" ni retirar el PATH legacy (la integración nueva no
   * está lista). La versión instalada queda conservada para reintento. */
  const exitCode = await runCli(cliArgs);
  if (exitCode !== 0) {
    throw new Error(`sentinel install falló (exit ${exitCode}); no se declara migración completa. Revisa la salida anterior.`);
  }

  const legacy = await removeLegacyPathEntry(repoRoot, args.dryRun);
  process.stdout.write(`[install-global-runtime] PATH legacy: ${JSON.stringify(legacy)}\n`);

  if (!args.dryRun) {
    process.stdout.write([
      '',
      '[install-global-runtime] Migración completa. Reabre tus terminales para que el PATH nuevo aplique.',
      `  Runtime: ${targetRoot}`,
      '  Verifica con: sentinel status   (o node tools/sentinel/out/cli/index.js status)',
      '  Rollback de perfiles: los backups previos a la migración están en ' + `${shimDir}\\profile-backups`,
      '',
    ].join('\n'));
  }
}

await main();
