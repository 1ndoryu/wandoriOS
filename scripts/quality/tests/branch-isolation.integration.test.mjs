import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { branchReportRoot, createBranchKey, resolveBranchIdentity } from '../branch-identity.mjs';
import { fingerprint, readCachedPass, writeCachedPass } from '../cache.mjs';
import { acquireTaskLock } from '../lock.mjs';
import { createReport } from '../reporter.mjs';

const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const TASK_ID = '028A-6';

function branchContext(projectRoot, branch) {
  const branchRoot = branchReportRoot(projectRoot, branch);
  return {
    projectRoot,
    reportRoot: path.join(branchRoot, TASK_ID),
    cacheRoot: path.join(branchRoot, 'cache'),
    locksRoot: path.join(branchRoot, 'locks'),
    qualityConfig: { maxFindings: 3 },
    tools: {},
    policyIdentity: {
      projectRoot,
      policyPath: null,
      policyHash: 'integration-policy',
      runtimeVersion: 'test',
      decision: { status: 'policy', mode: 'enforce', action: 'enforce', blocked: false, reason: 'fixture' },
      reason: 'fixture',
      recommendedCommand: `npm run task:check -- ${TASK_ID}`,
    },
    branch,
  };
}

function stage() {
  return [{ stage: 'fixture', status: 'pass', durationMs: 1, findings: [], summary: 'fixture pass' }];
}

async function identityFor(projectRoot, branchRef, env = {}) {
  return resolveBranchIdentity(projectRoot, {
    env,
    branchRef,
    runGit: async args => (args[0] === 'rev-parse'
      ? { code: 0, stdout: `${COMMIT}\n` }
      : { code: 1, stdout: '' }),
  });
}

test('la matriz aísla reporte, cache y lock entre dos ramas', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-branch-isolation-'));
  try {
    await mkdir(projectRoot, { recursive: true });
    const main = await identityFor(projectRoot, 'main');
    const feature = await identityFor(projectRoot, 'feature/maps');
    const mainContext = branchContext(projectRoot, main);
    const featureContext = branchContext(projectRoot, feature);
    await mkdir(mainContext.reportRoot, { recursive: true });
    await mkdir(featureContext.reportRoot, { recursive: true });

    assert.notEqual(main.branchKey, feature.branchKey);
    assert.notEqual(mainContext.reportRoot, featureContext.reportRoot);
    assert.notEqual(mainContext.cacheRoot, featureContext.cacheRoot);
    assert.notEqual(mainContext.locksRoot, featureContext.locksRoot);

    await createReport(mainContext, { taskId: TASK_ID, ci: false, full: false }, { base: 'HEAD', full: false, files: [], profiles: [] }, stage(), [], Date.now());
    await createReport(featureContext, { taskId: TASK_ID, ci: false, full: false }, { base: 'HEAD', full: false, files: [], profiles: [] }, stage(), [], Date.now());

    const mainReport = JSON.parse(await readFile(path.join(mainContext.reportRoot, 'latest.json'), 'utf8'));
    const featureReport = JSON.parse(await readFile(path.join(featureContext.reportRoot, 'latest.json'), 'utf8'));
    assert.equal(mainReport.branch.canonicalRef, 'main');
    assert.equal(featureReport.branch.canonicalRef, 'feature/maps');

    const scope = { files: [], fingerprintFiles: [] };
    const base = { projectRoot, qualityConfig: { schemaVersion: 1 }, toolManifest: { schemaVersion: 1 }, policy: { policyHash: 'p' }, lock: { schemaVersion: 1 } };
    const mainFingerprint = await fingerprint({ ...base, cacheRoot: mainContext.cacheRoot }, scope, 'fixture');
    const featureFingerprint = await fingerprint({ ...base, cacheRoot: featureContext.cacheRoot }, scope, 'fixture');
    assert.equal(mainFingerprint, featureFingerprint, 'la identidad de rama vive en el namespace, no en el contenido del stage');
    await writeCachedPass(mainContext, 'fixture', mainFingerprint, { status: 'pass', summary: 'main' });
    assert.equal(await readCachedPass(featureContext, 'fixture', featureFingerprint), null);

    const releaseMain = await acquireTaskLock(mainContext, TASK_ID, 100);
    const releaseFeature = await acquireTaskLock(featureContext, TASK_ID, 100);
    await releaseFeature();
    await releaseMain();
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('cambiar de rama en el mismo proceso recalcula identidad y permite locks concurrentes', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-branch-switch-'));
  try {
    const main = await identityFor(projectRoot, 'main');
    const feature = await identityFor(projectRoot, 'feature/maps');
    const backToMain = await identityFor(projectRoot, 'main');
    assert.equal(backToMain.branchKey, main.branchKey);
    assert.notEqual(main.branchKey, feature.branchKey);
    assert.notEqual(branchReportRoot(projectRoot, main), branchReportRoot(projectRoot, feature));

    const mainContext = branchContext(projectRoot, main);
    const featureContext = branchContext(projectRoot, feature);
    const [releaseMain, releaseFeature] = await Promise.all([
      acquireTaskLock(mainContext, TASK_ID, 100),
      acquireTaskLock(featureContext, TASK_ID, 100),
    ]);
    await Promise.all([releaseMain(), releaseFeature()]);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('refs largas y peligrosas producen claves acotadas sin traversal', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-branch-safe-'));
  try {
    const identity = await identityFor(projectRoot, `../${'x'.repeat(508)}`);
    assert.match(identity.branchKey, /^[A-Za-z0-9._-]+$/u);
    assert.ok(identity.branchKey.length <= 96);
    assert.equal(identity.branchKey, createBranchKey(identity.canonicalRef));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('CI y detached mantienen namespaces distintos aunque compartan commit', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-branch-identities-'));
  try {
    const ci = await identityFor(projectRoot, undefined, { CI: 'true', GITHUB_REF_NAME: 'release/2026' });
    const reusedRunner = await identityFor(projectRoot, undefined, { CI: 'true', GITHUB_REF_NAME: 'feature/2026' });
    const detached = await resolveBranchIdentity(projectRoot, {
      env: {},
      runGit: async args => (args[0] === 'rev-parse'
        ? { code: 0, stdout: `${COMMIT}\n` }
        : { code: 1, stdout: '' }),
    });
    assert.equal(ci.source, 'ci');
    assert.equal(reusedRunner.source, 'ci');
    assert.equal(detached.source, 'detached');
    assert.notEqual(ci.canonicalRef, reusedRunner.canonicalRef);
    assert.notEqual(ci.canonicalRef, detached.canonicalRef);
    assert.notEqual(ci.branchKey, reusedRunner.branchKey);
    assert.notEqual(ci.branchKey, detached.branchKey);
    assert.match(ci.branchKey, /^[A-Za-z0-9._-]+$/u);
    assert.match(reusedRunner.branchKey, /^[A-Za-z0-9._-]+$/u);
    assert.match(detached.branchKey, /^[A-Za-z0-9._-]+$/u);
    assert.equal(createBranchKey(ci.canonicalRef), ci.branchKey);
    assert.equal(createBranchKey(reusedRunner.canonicalRef), reusedRunner.branchKey);
    assert.equal(createBranchKey(detached.canonicalRef), detached.branchKey);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
