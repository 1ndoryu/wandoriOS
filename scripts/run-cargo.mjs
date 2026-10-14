#!/usr/bin/env node

/* Ejecuta cargo con el rustc de la toolchain de rustup que fija rust-toolchain.toml.
 * [por que] En este equipo el `rustc` que cargo encuentra por PATH no es el de rustup:
 * `cargo check --tests` fallaba con `Unrecognized option: 'check-cfg'` en atoi, dashmap
 * y axum-macros. Fijar RUSTC a `rustup which rustc` lo evita. El target lo fija
 * .cargo/config.toml (C:/tmp, AGENTS §0.2); este wrapper no lo toca. */

import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Taller remoto VPS 89: remoto por defecto (Agente/planes/plan-taller-remoto-vps89-2026-10-14.md)
const RCARGO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'workspace-manager', 'scripts', 'remoto');
const taller = await import(pathToFileURL(path.join(RCARGO_DIR, 'rcargo.mjs')).href);
const argvCargo = process.argv.slice(2);
const config = taller.cargarConfig(path.join(RCARGO_DIR, 'taller.json'));
const proyecto = taller.detectarProyecto(process.cwd());
if (taller.modoEfectivo(argvCargo, config, proyecto) === 'remoto') {
  const r = spawnSync(process.execPath, [path.join(RCARGO_DIR, 'rcargo.mjs'), ...argvCargo], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
// [por que] --dry-run solo lo interpreta rcargo; si se quitara sin más, en local compilaría de verdad.
if (argvCargo.includes('--dry-run')) {
  console.log(`[dry-run local] cargo ${taller.quitarFlagsTaller(argvCargo).join(' ')}`);
  process.exit(0);
}

const cargoArgs = taller.quitarFlagsTaller(argvCargo);
if (cargoArgs.length === 0) {
  console.error('Uso: node scripts/run-cargo.mjs <subcomando cargo> [...args]');
  process.exit(1);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const binDir = path.join(os.homedir(), '.cargo', 'bin');
const ext = process.platform === 'win32' ? '.exe' : '';
const cargoBin = process.env.GLORY_REAL_CARGO || path.join(binDir, `cargo${ext}`);
const rustupBin = path.join(binDir, `rustup${ext}`);

function rustcDeRustup() {
  if (process.env.RUSTC) return process.env.RUSTC;
  // `rustup which` respeta rust-toolchain.toml porque se ejecuta desde la raíz del repo.
  const res = spawnSync(rustupBin, ['which', 'rustc'], { cwd: repoRoot, encoding: 'utf8' });
  if (res.status !== 0 || !res.stdout.trim()) {
    console.error(`[run-cargo] No pude resolver rustc con rustup (${res.stderr?.trim() || 'sin salida'}).`);
    process.exit(1);
  }
  return res.stdout.trim();
}

const child = spawn(cargoBin, cargoArgs, {
  stdio: 'inherit',
  cwd: repoRoot,
  env: { ...process.env, RUSTC: rustcDeRustup() },
});

child.on('error', (error) => {
  console.error(`[run-cargo] Error al ejecutar cargo: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
