#!/usr/bin/env node

/* Helper reutilizable: deriva DATABASE_URL y CARGO_TARGET_DIR desde Cargo.toml
 * y la rama git actual. main/master usan el nombre base del paquete; el resto
 * usa {pkg}_{branch}. Tambien crea la BD local si no existe. Con testDb, la BD
 * lleva sufijo _test: `cargo test` no toca la BD de desarrollo. */

import { execSync, execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

export function readPackageName() {
  const cargoToml = path.join(projectRoot, 'Cargo.toml');
  if (!existsSync(cargoToml)) return 'glory';
  const toml = readFileSync(cargoToml, 'utf8');
  const match = toml.match(/^name\s*=\s*"([^"]+)"/m);
  return (match ? match[1] : 'glory').replace(/-/g, '_');
}

export function detectBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return 'main';
  }
}

export function slugifyBranchName(branch) {
  const slug = branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'local';
}

function parseEnvFile(content) {
  const vars = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) vars[match[1]] = match[2].trim();
  }
  return vars;
}

export function findPsql() {
  const fromPath = spawnSync(process.platform === 'win32' ? 'psql.exe' : 'psql', ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (fromPath.status === 0) {
    return process.platform === 'win32' ? 'psql.exe' : 'psql';
  }

  if (process.platform !== 'win32') {
    return null;
  }

  const pgRoot = 'C:\\Program Files\\PostgreSQL';
  if (!existsSync(pgRoot)) {
    return null;
  }

  const versions = readdirSync(pgRoot)
    .filter((value) => /^\d+$/.test(value))
    .sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
  for (const version of versions) {
    const candidate = path.join(pgRoot, version, 'bin', 'psql.exe');
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function quoteSqlIdentifier(value) {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    throw new Error(`Nombre de BD inseguro: ${value}`);
  }
  return `"${value.replaceAll('"', '""')}"`;
}

export function getBranchDbContext({ verbose = true, ensureExists = true, testDb = false } = {}) {
  const branch = detectBranch();
  const branchSlug = slugifyBranchName(branch);
  const pkgName = readPackageName();
  const isDefaultBranch = branch === 'main' || branch === 'master';
  const baseDbName = isDefaultBranch ? pkgName : `${pkgName}_${branchSlug}`;
  // [test] BD aislada para los tests: nunca la BD de desarrollo de la rama.
  const dbName = testDb ? `${baseDbName}_test` : baseDbName;

  const envPath = path.join(projectRoot, '.env');
  const envVars = existsSync(envPath) ? parseEnvFile(readFileSync(envPath, 'utf8')) : {};
  const baseDbUrl = process.env.DATABASE_URL || envVars.DATABASE_URL;
  if (!baseDbUrl) {
    throw new Error('DATABASE_URL no encontrado en .env');
  }

  /* [por que] La 89 conecta por socket Unix sin contraseña (`postgres://dev@%2Fvar%2Frun%2Fpostgresql/bd`):
   * la URL admite usuario sin clave, puerto opcional y host codificado como ruta de socket. */
  const match = baseDbUrl.match(/^postgres(?:ql)?:\/\/([^:@/]+)(?::([^@]*))?@([^:/]+)(?::(\d+))?\/(.+)$/);
  if (!match) {
    throw new Error(`No se pudo parsear DATABASE_URL: ${baseDbUrl}`);
  }
  const [, dbUser, dbPass = '', dbHost, dbPort] = match;
  const dbUrl = `postgres://${dbUser}${dbPass ? `:${dbPass}` : ''}@${dbHost}${dbPort ? `:${dbPort}` : ''}/${dbName}`;

  const cargoTargetBase =
    process.env.CARGO_TARGET_DIR_BASE ||
    (process.platform === 'win32' ? 'C:\\tmp\\glory-target\\WANDORIUS' : path.join(tmpdir(), 'glory-target'));
  const cargoTargetDir =
    process.env.GLORY_CARGO_TARGET_DIR ||
    path.join(cargoTargetBase, `${pkgName}_${branchSlug}`);

  if (verbose) {
    console.log(`\x1b[36m[db] Rama:          \x1b[0m ${branch}`);
    console.log(`\x1b[36m[db] Base de datos: \x1b[0m ${dbName}`);
    console.log(`\x1b[36m[db] Cargo target:  \x1b[0m ${cargoTargetDir}`);
  }

  if (ensureExists) {
    const psqlBin = findPsql();
    if (!psqlBin) {
      if (verbose) {
        console.warn('[db] psql no esta disponible; si la BD no existe, el backend fallara al conectar.');
      }
    } else {
      const psqlEnv = { ...process.env, PGPASSWORD: dbPass };
      const psql = (sql, db = 'postgres') => execFileSync(
        psqlBin,
        ['-U', dbUser, '-h', decodeURIComponent(dbHost), ...(dbPort ? ['-p', dbPort] : []), '-d', db, '-t', '-A', '-c', sql],
        { env: psqlEnv, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
      );

      const exists = psql(`SELECT 1 FROM pg_database WHERE datname = '${dbName}'`).trim();
      if (exists === '1') {
        if (verbose) console.log(`\x1b[32m[db] BD existente: ${dbName}\x1b[0m`);
      } else {
        psql(`CREATE DATABASE ${quoteSqlIdentifier(dbName)}`);
        if (verbose) console.log(`\x1b[32m[db] BD creada: ${dbName}\x1b[0m`);
      }
    }
  }

  return { branch, branchSlug, pkgName, dbName, dbUrl, dbPass, cargoTargetBase, cargoTargetDir };
}

/* [test] Aplica las migraciones pendientes con sqlx-cli. Es idempotente (registra
 * _sqlx_migrations, igual que sqlx::migrate!() al arrancar el backend), así que
 * se ejecuta en cada `test` y recoge migraciones nuevas. La contraseña se
 * redacta de la salida de error: nunca se imprime ni va en argv. */
export function applySqlxMigrations({ dbUrl, dbPass }) {
  const sqlxBin = process.platform === 'win32' ? 'sqlx.exe' : 'sqlx';
  const result = spawnSync(sqlxBin, ['migrate', 'run', '--source', path.join(projectRoot, 'migrations')], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: dbUrl },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 300_000,
    shell: false,
  });
  if (result.error) {
    throw new Error(`No se pudo ejecutar sqlx (${result.error.code ?? result.error.message}). Instala sqlx-cli 0.8.2.`);
  }
  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const redacted = dbPass ? output.split(dbPass).join('***') : output;
    throw new Error(`sqlx migrate run falló (exit ${result.status}):\n${redacted}`);
  }
}

export function getBranchDbUrl(options = {}) {
  return getBranchDbContext(options);
}
