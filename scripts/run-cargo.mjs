#!/usr/bin/env node

/* Compila y prueba en la VPS 89 (taller remoto). Este wrapper ya no compila en
 * el portátil: no hay toolchain de Rust desde el 2026-10-16 (AGENTS §1).
 * El sync y el target remoto los lleva rcargo.mjs bajo cm-heavy. */

import { spawnSync } from 'node:child_process';
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

/* [16AA-10] El portátil se quedó sin toolchain de Rust el 2026-10-16 (`rustup
 * self uninstall`, 8,7 GB): no queda ningún `cargo.exe` ni `rustup`, así que el
 * modo local ya no existe. Se sale en claro en vez de fallar con un ENOENT. */
console.error('[run-cargo] El portátil no compila Rust: la toolchain se retiró el 2026-10-16.');
console.error('[run-cargo] Quita --local y TALLER_MODO=local: compila en la VPS 89.');
process.exit(1);
