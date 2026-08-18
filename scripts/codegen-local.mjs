/* [018A-17] Genera OpenAPI y Orval sin levantar servidor ni depender de BD.
 * El export temporal queda fuera del control de versiones; los clientes
 * permanecen regenerables desde el contrato Rust. */

import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cargo = process.platform === 'win32' ? 'cargo.exe' : 'cargo';
const baseEnv = { ...process.env };
const openApiPath = resolve(root, 'openapi.json');

try {
  const openApi = spawnSync(cargo, ['run', '--', '--emit-openapi', 'openapi.json'], {
    stdio: 'inherit',
    env: baseEnv,
    cwd: root,
  });

  if (openApi.error || openApi.status !== 0) {
    console.error(`[codegen-local] OpenAPI falló: ${openApi.error?.message ?? openApi.status}`);
    process.exit(openApi.status ?? 1);
  }

  const orvalCli = resolve(root, 'frontend', 'node_modules', 'orval', 'dist', 'bin', 'orval.mjs');
  const generation = spawnSync(process.execPath, [orvalCli], {
    stdio: 'inherit',
    env: { ...baseEnv, OPENAPI_INPUT: '../openapi.json' },
    cwd: resolve(root, 'frontend'),
  });

  if (generation.error || generation.status !== 0) {
    console.error(`[codegen-local] Orval falló: ${generation.error?.message ?? generation.status}`);
    process.exit(generation.status ?? 1);
  }
} finally {
  rmSync(openApiPath, { force: true });
}
