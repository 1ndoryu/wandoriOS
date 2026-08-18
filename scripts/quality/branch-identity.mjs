import { createHash } from 'node:crypto';
import path from 'node:path';
import { runProcess } from './runner.mjs';

export const BRANCH_KEY_VERSION = 1;
const SAFE_BRANCH_KEY = /^[A-Za-z0-9._-]+$/u;
const MAX_REF_LENGTH = 512;
const MAX_PREFIX_LENGTH = 64;
const HASH_LENGTH = 16;

function validCandidate(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= MAX_REF_LENGTH
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function canonicalizeRef(value) {
  if (!validCandidate(value)) return null;
  const normalized = value.normalize('NFC');
  return validCandidate(normalized) ? normalized : null;
}

function encodeRef(ref) {
  return [...Buffer.from(ref, 'utf8')]
    .map(byte => (byte >= 0x30 && byte <= 0x39)
      || (byte >= 0x41 && byte <= 0x5a)
      || (byte >= 0x61 && byte <= 0x7a)
      || byte === 0x2e || byte === 0x5f || byte === 0x2d
      ? String.fromCharCode(byte)
      : `_${byte.toString(16).toUpperCase().padStart(2, '0')}`)
    .join('');
}

export function createBranchKey(canonicalRef) {
  const ref = canonicalizeRef(canonicalRef);
  if (!ref) throw new Error('branch ref inválida para branch-key-v1');
  const hash = createHash('sha256').update(Buffer.from(ref, 'utf8')).digest('hex');
  const encoded = encodeRef(ref).slice(0, MAX_PREFIX_LENGTH) || 'root';
  const branchKey = `${encoded}--${hash.slice(0, HASH_LENGTH)}`;
  if (!SAFE_BRANCH_KEY.test(branchKey) || branchKey.length > 96) {
    throw new Error('branch-key-v1 produjo una clave insegura');
  }
  return branchKey;
}

async function gitText(projectRoot, args, runGit) {
  const result = await runGit(args, projectRoot);
  if (result.code !== 0) return null;
  const value = result.stdout.trim();
  return value.length > 0 ? value : null;
}

async function defaultGit(args, cwd) {
  return runProcess('git', args, { cwd, timeoutMs: 10_000 });
}

function isCiEnvironment(env) {
  return env.CI === 'true'
    || env.GITHUB_ACTIONS === 'true'
    || typeof env.GITHUB_REF_NAME === 'string'
    || typeof env.CI_COMMIT_REF_NAME === 'string';
}

export async function resolveBranchIdentity(projectRoot, {
  env = process.env,
  branchRef,
  runGit = defaultGit,
} = {}) {
  const commit = await gitText(projectRoot, ['rev-parse', 'HEAD'], runGit);
  if (!commit || !/^[a-f0-9]{7,64}$/u.test(commit)) {
    throw new Error('No se pudo resolver el commit actual para quality branch identity');
  }

  let canonicalRef = canonicalizeRef(branchRef);
  let source = canonicalRef ? 'adapter' : null;
  if (!canonicalRef && isCiEnvironment(env)) {
    const ciCandidates = [env.GITHUB_HEAD_REF, env.GITHUB_REF_NAME, env.CI_COMMIT_REF_NAME];
    canonicalRef = ciCandidates.map(canonicalizeRef).find(Boolean) ?? null;
    if (canonicalRef) source = 'ci';
  }
  if (!canonicalRef) {
    const gitRef = await gitText(projectRoot, ['symbolic-ref', '--short', 'HEAD'], runGit);
    canonicalRef = canonicalizeRef(gitRef);
    if (canonicalRef) source = 'git';
  }
  if (!canonicalRef) {
    canonicalRef = `detached:${commit}`;
    source = 'detached';
  }

  return {
    branchKeyVersion: BRANCH_KEY_VERSION,
    canonicalRef,
    branchKey: createBranchKey(canonicalRef),
    commit,
    shortCommit: commit.slice(0, 12),
    source,
  };
}

export function branchReportRoot(projectRoot, identity) {
  if (!identity || identity.branchKeyVersion !== BRANCH_KEY_VERSION || !SAFE_BRANCH_KEY.test(identity.branchKey)) {
    throw new Error('Identidad de rama inválida para crear reportRoot');
  }
  return path.join(projectRoot, '.quality-reports', 'branches', identity.branchKey);
}
