import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_ENV_ALLOWLIST, runProcess, safeEnvironment } from '../runner.mjs';

test('runner distingue éxito y timeout', async () => {
  const success = await runProcess(process.execPath, ['-e', 'process.stdout.write("ok")'], { timeoutMs: 2_000 });
  assert.equal(success.code, 0);
  assert.equal(success.stdout, 'ok');

  const timeout = await runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 100 });
  assert.equal(timeout.code, 2);
  assert.equal(timeout.timedOut, true);
});

test('runner conserva el estado cancelled solo ante transición durante la ejecución', async () => {
  const notCancelled = await runProcess(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 50)'], { timeoutMs: 2_000, isCancelled: () => false });
  assert.equal(notCancelled.code, 0);
  assert.equal(notCancelled.cancelled, false);

  let cancelled = false;
  setTimeout(() => { cancelled = true; }, 30);
  const cancelledResult = await runProcess(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 200)'], { timeoutMs: 2_000, isCancelled: () => cancelled });
  assert.equal(cancelledResult.cancelled, true);
  assert.equal(cancelledResult.code, 130);

  const alreadyCancelled = await runProcess(process.execPath, ['-e', 'process.exit(0)'], { timeoutMs: 2_000, isCancelled: () => true });
  assert.equal(alreadyCancelled.cancelled, true);
  assert.equal(alreadyCancelled.code, 130);
});

test('runner limita la captura de salida ruidosa', async () => {
  const noisy = await runProcess(process.execPath, ['-e', 'process.stdout.write("x".repeat(100000))'], { timeoutMs: 2_000 });
  assert.equal(noisy.code, 0);
  assert.match(noisy.stdout, /quality output truncated at 65536 bytes/);
  assert.ok(noisy.stdout.length < 70_000);
});

test('safeEnvironment no permite extras fuera del allowlist efectivo', () => {
  const env = safeEnvironment({ ALLOWED: 'yes', SECRET_SHOULD_NOT_PASS: 'no' }, ['ALLOWED']);
  assert.equal(env.ALLOWED, 'yes');
  assert.equal(Object.hasOwn(env, 'SECRET_SHOULD_NOT_PASS'), false);
});

test('safeEnvironment hereda los tokens de sanción del gate desde process.env (108A-1 Fase 0)', () => {
  /* Regresión 108A-1: safeEnvironment eliminaba GLORY_QUALITY_GATE_TOKEN y
   * GLORY_HEAVY_RUN_TOKEN del entorno de las etapas hijas, así que los shims
   * globales bloqueaban cargo fmt y run-with-db chocaba con el lease pesado
   * del propio gate. El contrato del guard del runtime dice que el token se
   * hereda por el árbol de procesos del gate; safeEnvironment debe propagarlo
   * desde process.env, sin incluirlo en el allowlist (que rechaza nombres
   * tipo TOKEN por redacción). Fuera del gate no existe y no se propaga. */
  const previousGate = process.env.GLORY_QUALITY_GATE_TOKEN;
  const previousHeavy = process.env.GLORY_HEAVY_RUN_TOKEN;
  process.env.GLORY_QUALITY_GATE_TOKEN = 'tok-gate';
  process.env.GLORY_HEAVY_RUN_TOKEN = 'tok-heavy';
  try {
    const env = safeEnvironment({});
    assert.equal(env.GLORY_QUALITY_GATE_TOKEN, 'tok-gate');
    assert.equal(env.GLORY_HEAVY_RUN_TOKEN, 'tok-heavy');
    assert.equal(DEFAULT_ENV_ALLOWLIST.includes('GLORY_QUALITY_GATE_TOKEN'), false, 'el allowlist no debe listar tokens (redacción)');
  } finally {
    if (previousGate === undefined) delete process.env.GLORY_QUALITY_GATE_TOKEN;
    else process.env.GLORY_QUALITY_GATE_TOKEN = previousGate;
    if (previousHeavy === undefined) delete process.env.GLORY_HEAVY_RUN_TOKEN;
    else process.env.GLORY_HEAVY_RUN_TOKEN = previousHeavy;
  }
});
