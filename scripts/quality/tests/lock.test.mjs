import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { acquireTaskLock } from '../lock.mjs';

test('rechaza task IDs inseguros antes de crear un lock', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-lock-'));
  try {
    await assert.rejects(
      acquireTaskLock({ projectRoot }, '../escape', 20),
      /taskId inválido para quality lock/,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('el lock por tarea excluye una segunda ejecución y se libera', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-lock-'));
  const context = { projectRoot };
  try {
    const release = await acquireTaskLock(context, '297A-12', 100);
    await assert.rejects(
      acquireTaskLock(context, '297A-12', 20),
      /quality gate ocupado para 297A-12/,
    );
    await release();
    const releaseSecond = await acquireTaskLock(context, '297A-12', 100);
    await releaseSecond();
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('el gate público falla rápido cuando ya existe una ejecución', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-lock-'));
  const context = { projectRoot };
  try {
    const release = await acquireTaskLock(context, '297A-12', 0);
    await assert.rejects(
      acquireTaskLock(context, '297A-12', 0),
      /quality gate ocupado para 297A-12/,
    );
    await release();
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('locks de tareas diferentes no se bloquean entre sí', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-lock-'));
  const context = { projectRoot };
  try {
    const releaseFirst = await acquireTaskLock(context, '297A-12', 100);
    const releaseSecond = await acquireTaskLock(context, '297A-13', 100);
    await releaseSecond();
    await releaseFirst();
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('la espera del lock puede cancelarse cooperativamente', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-lock-'));
  const context = { projectRoot };
  try {
    const release = await acquireTaskLock(context, '297A-12', 100);
    await assert.rejects(
      acquireTaskLock(context, '297A-12', 1000, { isCancelled: () => true }),
      /cancelado mientras esperaba el lock/,
    );
    await release();
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('un lock expirado de un proceso muerto se recupera', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-lock-'));
  const context = { projectRoot };
  const lock = path.join(projectRoot, '.quality-reports', 'locks', '297A-12.lock');
  try {
    await mkdir(lock, { recursive: true });
    await writeFile(path.join(lock, 'owner.json'), JSON.stringify({ pid: 99999999, token: 'dead', startedAt: new Date(0).toISOString() }));
    const old = new Date(0);
    await utimes(lock, old, old);
    const release = await acquireTaskLock(context, '297A-12', 500);
    await release();
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('un owner con fecha futura no se recupera antes del TTL', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-lock-'));
  const context = { projectRoot };
  const lock = path.join(projectRoot, '.quality-reports', 'locks', '297A-12.lock');
  try {
    await mkdir(lock, { recursive: true });
    await writeFile(path.join(lock, 'owner.json'), JSON.stringify({ pid: 99999999, token: 'future', startedAt: new Date(Date.now() + 86_400_000).toISOString() }));
    await assert.rejects(
      acquireTaskLock(context, '297A-12', 20),
      /quality gate ocupado para 297A-12/,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('un owner corrupto reciente no se recupera antes del TTL', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-lock-'));
  const context = { projectRoot };
  const lock = path.join(projectRoot, '.quality-reports', 'locks', '297A-12.lock');
  try {
    await mkdir(lock, { recursive: true });
    await writeFile(path.join(lock, 'owner.json'), '{not-json');
    await assert.rejects(
      acquireTaskLock(context, '297A-12', 20),
      /quality gate ocupado para 297A-12/,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
