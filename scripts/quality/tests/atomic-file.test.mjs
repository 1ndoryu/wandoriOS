import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { writeAtomic } from '../atomic-file.mjs';

test('writeAtomic tolera escritores concurrentes sin dejar JSON parcial', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-atomic-'));
  const target = path.join(root, 'report.json');
  try {
    await Promise.all(Array.from({ length: 8 }, (_, index) =>
      writeAtomic(target, JSON.stringify({ writer: index, findings: [index] }))));
    const parsed = JSON.parse(await readFile(target, 'utf8'));
    assert.ok(Number.isInteger(parsed.writer));
    assert.deepEqual(parsed.findings, [parsed.writer]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
