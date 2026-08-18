import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  buildFrontendDependencyGraph,
  isFrontendTestFile,
  selectImpactedTests,
} from './frontend-test-selection.mjs';

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const frontendRoot = path.join(projectRoot, 'frontend');
const vitestBin = path.join(frontendRoot, 'node_modules', 'vitest', 'vitest.mjs');
const fullMarkers = new Set([
  'frontend/package.json',
  'frontend/package-lock.json',
  'frontend/tsconfig.json',
  'frontend/vite.config.ts',
  'frontend/vitest.config.ts',
  'frontend/orval.config.ts',
]);

async function gitLines(args) {
  const { stdout } = await execFileAsync('git', args, { cwd: projectRoot, windowsHide: true });
  return stdout.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
}

async function gitChangedFiles() {
  const [tracked, untracked] = await Promise.all([
    gitLines(['diff', '--name-status', '--diff-filter=ACMRD', 'HEAD']),
    gitLines(['ls-files', '--others', '--exclude-standard']),
  ]);
  const trackedFiles = tracked.flatMap(line => {
    const parts = line.split(/\t+/);
    const status = parts[0] ?? '';
    /* Renames expose old and new paths. Treat them as full because references
     * to the old module can remain in the dependency graph. */
    return status.startsWith('R')
      ? parts.slice(1).map(file => ({ file, status }))
      : parts[1] ? [{ file: parts[1], status }] : [];
  });
  return [...trackedFiles, ...untracked.map(file => ({ file, status: '??' }))]
    .filter(item => item.file)
    .reduce((items, item) => {
      const file = item.file.replace(/\\/g, '/');
      if (!items.some(existing => existing.file === file)) items.push({ ...item, file });
      return items;
    }, [])
    .sort((left, right) => left.file.localeCompare(right.file));
}

/* [028A-8] Reutiliza el scope-manifest.json del gate: la selección de tests no
 * repite descubrimientos Git/glob. Los borrados se marcan con status 'D' para
 * conservar el criterio full del selector sin código duplicado. */
async function changedFilesFromManifest(manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.files)) {
    throw new Error(`scope-manifest inválido: ${manifestPath}`);
  }
  const deleted = new Set(manifest.deletedFiles ?? []);
  return [...new Set(manifest.files)]
    .map(file => ({ file, status: deleted.has(file) ? 'D' : 'M' }))
    .sort((left, right) => left.file.localeCompare(right.file));
}

function isFrontendSource(file) {
  return /^frontend\/src\/.*\.(?:ts|tsx|js|jsx)$/i.test(file);
}

function isFrontendTest(file) {
  return /^frontend\/src\/.*\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/i.test(file);
}

function runVitest(args) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [vitestBin, ...args], {
      cwd: frontendRoot,
      env: { ...process.env, VITEST_MAX_WORKERS: '1' },
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', error => {
      process.stderr.write(`[frontend-tests] No se pudo iniciar Vitest: ${error.message}\n`);
      resolve(2);
    });
    child.once('close', (code, signal) => resolve(signal ? 2 : code ?? 2));
  });
}

const argv = process.argv.slice(2);
const manifestIndex = argv.indexOf('--scope-manifest');
if (manifestIndex >= 0 && !argv[manifestIndex + 1]) {
  process.stderr.write('[frontend-tests] --scope-manifest requiere un path\n');
  process.exit(2);
}
const manifestPath = manifestIndex >= 0 ? argv[manifestIndex + 1] : null;
const flags = new Set(argv.filter((value, index) => value !== '--scope-manifest' && index !== manifestIndex + 1));
const files = manifestPath
  ? await changedFilesFromManifest(manifestPath)
  : await gitChangedFiles();
const frontendItems = files.filter(item => item.file.startsWith('frontend/'));
const forceFull = flags.has('--full')
  || files.some(item => fullMarkers.has(item.file))
  || frontendItems.some(item => item.status === 'D' || item.status.startsWith('R'));
const testFiles = frontendItems
  .filter(item => isFrontendTest(item.file))
  .map(item => item.file.replace(/^frontend\//, ''));
const hasFrontendSourceChange = frontendItems.some(item => isFrontendSource(item.file));
let selectedTests = testFiles;
if (!forceFull && hasFrontendSourceChange) {
  const graph = await buildFrontendDependencyGraph(frontendRoot);
  const changedSourceFiles = frontendItems
    .filter(item => isFrontendSource(item.file))
    .map(item => item.file.replace(/^frontend\//, ''));
  const allTestFiles = [...graph.keys()]
    .filter(isFrontendTestFile)
    .map(file => path.relative(frontendRoot, file).replace(/\\/g, '/'));
  selectedTests = selectImpactedTests({
    frontendRoot,
    changedFiles: changedSourceFiles,
    testFiles: allTestFiles,
    graph,
  });
  if (selectedTests.length === 0) {
    process.stdout.write('[frontend-tests] No hay tests dependientes del cambio; type-check sigue siendo obligatorio.\n');
    process.exit(0);
  }
}

if (flags.has('--dry-run')) {
  process.stdout.write(`${JSON.stringify({ mode: forceFull ? 'full' : 'selected', files: selectedTests }, null, 2)}\n`);
  process.exit(0);
}

if (!forceFull && selectedTests.length === 0) {
  process.stdout.write('[frontend-tests] Sin tests dependientes; type-check sigue siendo obligatorio.\n');
  process.exit(0);
}

/* [018A-37] Cambios de código seleccionan tests por grafo de imports local.
 * `--full`/test:full conserva la suite completa para CI o una revisión total;
 * untracked ya no dispara todos los workers solo por existir. */
const vitestArgs = forceFull
  ? ['run', '--maxWorkers=1', '--no-file-parallelism']
  : ['run', '--maxWorkers=1', '--no-file-parallelism', ...selectedTests];
process.exitCode = await runVitest(vitestArgs);
