#!/usr/bin/env node

/* [297A-6] Prepara la BD efimera de CI con el mismo nombre derivado que usa
 * run-with-db. Mantiene credenciales fuera de stdout y aplica migraciones en orden. */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { findPsql, getBranchDbContext } from './branch-db.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const context = getBranchDbContext({ verbose: true, ensureExists: true });
const psql = findPsql();
if (!psql) throw new Error('psql es obligatorio para preparar la BD de CI');

const database = new URL(context.dbUrl);
const connectionArgs = [
  '-U', decodeURIComponent(database.username),
  '-h', database.hostname,
  '-p', database.port || '5432',
  '-d', database.pathname.slice(1),
  '-v', 'ON_ERROR_STOP=1',
];
const migrationDir = path.join(projectRoot, 'migrations');
const migrations = readdirSync(migrationDir)
  .filter(file => file.endsWith('.up.sql'))
  .sort();

for (const migration of migrations) {
  process.stdout.write(`[quality:ci] migration ${migration}\n`);
  const result = spawnSync(psql, [...connectionArgs, '-f', path.join(migrationDir, migration)], {
    cwd: projectRoot,
    env: { ...process.env, PGPASSWORD: decodeURIComponent(database.password) },
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 2);
}
