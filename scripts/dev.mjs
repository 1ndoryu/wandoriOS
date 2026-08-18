#!/usr/bin/env node
/* [085A-2] Compatibilidad para ramas que aun invocan scripts/dev.mjs.
 * La logica real vive en glory-rs/scripts/dev.mjs para que el launcher sea compartido. */

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const sharedLauncher = resolve(projectRoot, 'glory-rs', 'scripts', 'dev.mjs');

const child = spawn(process.execPath, [sharedLauncher, ...process.argv.slice(2)], {
    cwd: projectRoot,
    stdio: 'inherit',
});

child.on('error', (error) => {
    console.error(`[glory-dev] No se pudo ejecutar el launcher compartido: ${error.message}`);
    process.exit(1);
});

child.on('exit', (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }

    process.exit(code ?? 1);
});