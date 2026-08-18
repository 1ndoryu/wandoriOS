import assert from 'node:assert/strict';
import test from 'node:test';
import { branchReportRoot, createBranchKey, resolveBranchIdentity } from '../branch-identity.mjs';

test('branch-key-v1 es determinista, acotada y segura para refs complejas', () => {
  const key = createBranchKey('feature/árbol con espacios');
  assert.match(key, /^[A-Za-z0-9._-]+$/u);
  assert.ok(key.length <= 96);
  assert.equal(key, createBranchKey('feature/árbol con espacios'));
  assert.notEqual(key, createBranchKey('feature/arbol con espacios'));
  assert.match(createBranchKey('../escape'), /^[A-Za-z0-9._-]+$/u);
});

test('branch identity prioriza ref CI y conserva metadata de commit', async () => {
  const calls = [];
  const runGit = async (args) => {
    calls.push(args);
    if (args[0] === 'rev-parse') return { code: 0, stdout: '0123456789abcdef0123456789abcdef01234567\n' };
    return { code: 0, stdout: 'local\n' };
  };
  const identity = await resolveBranchIdentity('C:/repo', {
    env: { CI: 'true', GITHUB_REF_NAME: 'ci/release' },
    runGit,
  });
  assert.equal(identity.source, 'ci');
  assert.equal(identity.canonicalRef, 'ci/release');
  assert.equal(identity.shortCommit, '0123456789ab');
  assert.equal(calls.some(args => args[0] === 'symbolic-ref'), false);
  assert.match(branchReportRoot('C:/repo', identity), /\.quality-reports[\\/]branches[\\/]ci_2Frelease--/u);
});

test('branch identity usa detached:<sha> sin ref confiable', async () => {
  const runGit = async (args) => {
    if (args[0] === 'rev-parse') return { code: 0, stdout: 'fedcba9876543210fedcba9876543210fedcba9\n' };
    return { code: 1, stdout: '' };
  };
  const identity = await resolveBranchIdentity('C:/repo', { env: {}, runGit });
  assert.equal(identity.source, 'detached');
  assert.equal(identity.canonicalRef, 'detached:fedcba9876543210fedcba9876543210fedcba9');
});
