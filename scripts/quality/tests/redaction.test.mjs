import assert from 'node:assert/strict';
import test from 'node:test';
import { redact, sanitize } from '../redaction.mjs';

test('redact elimina secretos de texto y objetos', () => {
  assert.equal(redact('TOKEN=abc123456789'), 'TOKEN=[REDACTED]');
  assert.equal(redact('Bearer abcdefghijklmnop'), 'Bearer [REDACTED]');
  assert.deepEqual(sanitize({ password: 'visible', safe: 'ok' }), { password: '[REDACTED]', safe: 'ok' });
});
