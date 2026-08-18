import assert from 'node:assert/strict';
import test from 'node:test';
import { selectReminders } from '../reminders.mjs';

test('recordatorios nunca exceden el límite y son contextuales', () => {
  const scope = { profiles: new Set(['css', 'auth', 'commerce', 'docs', 'rust']) };
  const reminders = selectReminders(scope, [{ status: 'fail' }], 4);
  assert.equal(reminders.length, 4);
  assert.match(reminders[0], /repite exactamente/);
  assert.ok(reminders.some(item => item.startsWith('UI:')));
});

test('el cierre distingue commit opcional de trabajo entregable', () => {
  const reminders = selectReminders({ profiles: new Set() }, [{ status: 'pass' }], 4);
  assert.match(reminders[0], /si el bloque es entregable/);
  assert.match(reminders[0], /no fuerces commit/);
});

test('local-light recuerda ejecutar la suite completa antes de cerrar una fase', () => {
  const reminders = selectReminders(
    { profiles: new Set(['rust']) },
    [{ stage: 'rust', status: 'pass', validationMode: 'local-light' }],
    4,
  );
  assert.ok(reminders.some(item => item.includes('--full')));
});

test('full diferido deja visible el cooldown y el override manual', () => {
  const reminders = selectReminders(
    { profiles: new Set() },
    [{ status: 'pass' }],
    4,
    { heavyDeferred: { reason: 'cooldown' } },
  );
  assert.ok(reminders.some(item => item.includes('cooldown')));
  assert.ok(reminders.some(item => item.includes('--allow-heavy')));
});
