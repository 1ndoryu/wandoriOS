import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  cleanupTargets,
  markMaintenanceRun,
  shouldRunMaintenance,
} from '../target-maintenance.mjs';
import { runTargetMaintenanceBestEffort } from '../target-maintenance-stage.mjs';

/* [028A-6] assertSafeTargetRoot exige un padre literal `tmp` y sufijo
 * `glory-target`; los tests crean ese árbol aislado bajo el temp real.
 * Ruta única por test: node --test ejecuta los tests del archivo en paralelo
 * y una base compartida haría que un test borrara el árbol de otro. */
let testSerial = 0;
/* Las cuotas se prueban con relaciones entre tamaños, no con capacidad real
 * de disco. Mantener cada fixture en megabytes evita que los tests paralelos
 * consuman varios GB y conviertan ENOSPC en un falso fallo del gate. */
const MB = 1024 ** 2;

function makeTargetRoot() {
  testSerial += 1;
  const base = path.join(os.tmpdir(), `glory-target-test-${process.pid}-${testSerial}`);
  return { base, targetRoot: path.join(base, 'tmp', 'glory-target') };
}

async function seedCandidate(targetRoot, name, { sizeBytes = 0, ageMs = 0, now = Date.now() } = {}) {
  const dir = path.join(targetRoot, name);
  await mkdir(dir, { recursive: true });
  const payload = Buffer.alloc(Math.max(1, Math.floor(sizeBytes / 2)));
  await writeFile(path.join(dir, 'a.bin'), payload);
  await writeFile(path.join(dir, 'b.bin'), payload);
  const old = new Date(now - ageMs);
  await utimes(path.join(dir, 'a.bin'), old, old);
  await utimes(path.join(dir, 'b.bin'), old, old);
  await utimes(dir, old, old);
  return dir;
}

async function projectConfig(projectRoot) {
  await writeFile(path.join(projectRoot, 'quality.config.json'), JSON.stringify({
    heavyRun: { maxTargetGb: 0.01, maxTargetAgeDays: 30 },
  }), 'utf8');
}

test('poda por cuota los targets más viejos', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-target-quota-'));
  const { base, targetRoot } = makeTargetRoot();
  const now = Date.now();
  try {
    await projectConfig(projectRoot);
    /* [028A-6] a con 1 día (dentro de maxTargetAgeDays=30, poda por cuota),
     * b reciente: la cuota sigue pudiendo podar el más antiguo aunque ambos
     * hayan sido escritos recientemente, siempre que no estén activos. */
    await seedCandidate(targetRoot, 'a', { sizeBytes: 6 * MB, ageMs: 24 * 60 * 60 * 1000, now });
    await seedCandidate(targetRoot, 'b', { sizeBytes: 6 * MB, now });
    const result = await cleanupTargets({ projectRoot, targetRoot, now, dryRun: false, processPaths: new Set() });
    assert.equal(result.dryRun, false);
    assert.equal(result.quotaExceeded, false);
    assert.ok(result.removed.length >= 1, 'la cuota debe podar al menos un target');
    assert.equal(result.removed[0].reason, 'quota');
    const kept = result.removed[0].name === 'a' ? 'b' : 'a';
    assert.ok(await stat(path.join(targetRoot, kept)).catch(() => null), 'queda al menos un target');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(base, { recursive: true, force: true });
  }
});

test('protege el target del que corre un ejecutable vivo (sin marcador)', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-target-proc-'));
  const { base, targetRoot } = makeTargetRoot();
  const now = Date.now();
  try {
    await projectConfig(projectRoot);
    const runningDir = await seedCandidate(targetRoot, 'debug', { sizeBytes: 9 * MB, ageMs: 40 * 24 * 60 * 60 * 1000, now });
    await seedCandidate(targetRoot, 'old', { sizeBytes: 1 * MB, ageMs: 45 * 24 * 60 * 60 * 1000, now });
    /* [028A-6] Simula `glory-backend.exe` corriendo desde debug/: la ruta del
     * ejecutable es prefijo del target → nunca se poda por edad ni cuota. */
    const processPaths = new Set([`${path.join(runningDir, 'glory-backend.exe').replace(/\\/g, '/').toLowerCase()}`]);
    const result = await cleanupTargets({ projectRoot, targetRoot, now, dryRun: false, processPaths });
    assert.ok(await stat(runningDir), 'el target con proceso vivo se conserva');
    assert.ok(result.active.includes('debug'), 'debug queda listado como activo');
    assert.ok(result.removed.some(item => item.name === 'old'), 'el target viejo sin proceso se poda');
    assert.equal(result.quotaExceeded, false);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(base, { recursive: true, force: true });
  }
});

test('la cuota protege targets con escritura reciente mientras podrían estar compilándose', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-target-recent-'));
  const { base, targetRoot } = makeTargetRoot();
  const now = Date.now();
  try {
    await projectConfig(projectRoot);
    /* La escritura reciente los trata como activos durante la ventana de
     * seguridad; otro target viejo queda disponible para poda. */
    await seedCandidate(targetRoot, 'building', { sizeBytes: 9 * MB, now });
    await seedCandidate(targetRoot, 'old', { sizeBytes: 6 * MB, ageMs: 45 * 24 * 60 * 60 * 1000, now });
    const result = await cleanupTargets({ projectRoot, targetRoot, now, dryRun: false, processPaths: new Set() });
    assert.ok(await stat(path.join(targetRoot, 'building')), 'el target con escritura reciente se conserva');
    assert.ok(result.removed.some(item => item.name === 'old'), 'el target viejo se poda por edad');
    assert.equal(result.quotaExceeded, false);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(base, { recursive: true, force: true });
  }
});

test('dry-run informa sin borrar nada', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-target-dry-'));
  const { base, targetRoot } = makeTargetRoot();
  const now = Date.now();
  try {
    await projectConfig(projectRoot);
    await seedCandidate(targetRoot, 'a', { sizeBytes: 9 * MB, ageMs: 24 * 60 * 60 * 1000, now });
    await seedCandidate(targetRoot, 'b', { sizeBytes: 9 * MB, now });
    const result = await cleanupTargets({ projectRoot, targetRoot, now, dryRun: true, processPaths: new Set() });
    assert.equal(result.dryRun, true);
    assert.ok(result.removed.length >= 1);
    assert.ok(await stat(path.join(targetRoot, 'a')));
    assert.ok(await stat(path.join(targetRoot, 'b')));
    assert.equal(result.quotaExceeded, false);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(base, { recursive: true, force: true });
  }
});

test('la cuota se comprueba en cada gate y el fallo no rompe el best-effort', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-target-throttle-'));
  const { base, targetRoot } = makeTargetRoot();
  const now = Date.now();
  try {
    await projectConfig(projectRoot);
    await mkdir(targetRoot, { recursive: true });
    /* Sin marcador previo: el pase debe correr. */
    assert.equal(await shouldRunMaintenance({ targetRoot, now }), true);
    await markMaintenanceRun(targetRoot, now);
    /* Marcado: dentro de la ventana no vuelve a correr. */
    assert.equal(await shouldRunMaintenance({ targetRoot, now: now + 60_000 }), false);
    /* La cuota no respeta el throttle: se vuelve a revisar en cada gate. */
    const checked = await runTargetMaintenanceBestEffort({
      projectRoot,
      targetRoot,
      now: now + 60_000,
      intervalMs: 6 * 60 * 60 * 1000,
      cleanup: async () => ({ targetRoot, totalBytes: 0, removed: [], active: [], dryRun: false, truncated: false }),
    });
    assert.equal(checked.status, 'pass');
    assert.equal(checked.skipped, undefined);
    /* Un fallo de cleanup no rompe el best-effort. */
    const failed = await runTargetMaintenanceBestEffort({
      projectRoot,
      targetRoot,
      now: now + 8 * 60 * 60 * 1000,
      cleanup: async () => { throw new Error('filesystem ocupado'); },
    });
    assert.equal(failed.status, 'error');
    assert.equal(failed.message, 'filesystem ocupado');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(base, { recursive: true, force: true });
  }
});
