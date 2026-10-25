import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { runProcess } from './runner.mjs';
import { fail, INSTALL_METADATA_PATH } from './lockfile-validate.mjs';

export async function assertInsideWorkspace(workspaceRoot, target, label, { allowMissing = false } = {}) {
  let rootReal;
  let targetReal;
  try {
    rootReal = await realpath(workspaceRoot);
    targetReal = await realpath(target);
  } catch (error) {
    if (!allowMissing || error?.code !== 'ENOENT') fail(`${label}: ruta inexistente o no resoluble`);
    const parentReal = await realpath(path.dirname(target)).catch(() => null);
    if (!parentReal) fail(`${label}: ruta inexistente o no resoluble`);
    targetReal = path.join(parentReal, path.basename(target));
  }
  const relative = path.relative(rootReal, targetReal);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail(`${label}: ruta fuera del workspace`);
  }
  return targetReal;
}

export function untrustedCheckoutChanges(statusOutput) {
  const records = String(statusOutput).includes('\0')
    ? String(statusOutput).split('\0')
    : String(statusOutput).split(/\r?\n/);
  return records
    .map(line => line.trimEnd())
    .filter(Boolean)
    .filter(line => {
      const pathName = line.slice(3).replace(/\\/g, '/');
      return pathName !== INSTALL_METADATA_PATH;
    });
}

export async function gitArchiveSha256(toolRoot) {
  return new Promise((resolve, reject) => {
    // core.autocrlf=false: el hash debe depender solo del contenido del commit, no de la config del equipo (con true cambia los bytes del tar)
    const child = spawn('git', ['-c', 'core.autocrlf=false', '-C', toolRoot, 'archive', '--format=tar', 'HEAD'], {
      cwd: toolRoot,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const hash = createHash('sha256');
    let stderr = '';
    const timeout = setTimeout(() => {
      if (process.platform === 'win32' && child.pid) {
        spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { shell: false, stdio: 'ignore', windowsHide: true });
      } else child.kill('SIGTERM');
      reject(new Error('git archive excedió el timeout'));
    }, 30_000);
    child.stdout.on('data', chunk => hash.update(chunk));
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      if (signal || code !== 0) reject(new Error(`git archive falló (${signal ?? code}): ${stderr.trim()}`));
      else resolve(hash.digest('hex'));
    });
  });
}

async function gitStatusPorcelain(toolRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', toolRoot, 'status', '--porcelain=v1', '-z', '--untracked-files=all'], {
      cwd: toolRoot,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks = [];
    let stderr = '';
    const timeout = setTimeout(() => {
      if (process.platform === 'win32' && child.pid) {
        spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { shell: false, stdio: 'ignore', windowsHide: true });
      } else child.kill('SIGTERM');
      reject(new Error('git status excedió el timeout'));
    }, 30_000);
    child.stdout.on('data', chunk => chunks.push(Buffer.from(chunk)));
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      if (signal || code !== 0) reject(new Error(`git status falló (${signal ?? code}): ${stderr.trim()}`));
      else resolve({ text: Buffer.concat(chunks).toString('utf8') });
    });
  });
}

async function isInsideWorkspace(workspaceRoot, configuredSourcePath) {
  const rootReal = await realpath(workspaceRoot);
  const sourceReal = await realpath(configuredSourcePath);
  const relative = path.relative(rootReal, sourceReal).replace(/\\/g, '/');
  return relative !== '' && relative !== '..' && !relative.startsWith('../') && !path.isAbsolute(relative);
}

async function parentGitlinkCommit(workspaceRoot, configuredSourcePath) {
  const rootReal = await realpath(workspaceRoot);
  const sourceReal = await realpath(configuredSourcePath);
  const relative = path.relative(rootReal, sourceReal).replace(/\\/g, '/');
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) return null;
  const result = await runProcess('git', ['-C', rootReal, 'ls-tree', 'HEAD', '--', relative], { cwd: rootReal, timeoutMs: 10_000 });
  if (result.code !== 0) throw new Error(`no se pudo leer el gitlink de ${relative}`);
  const match = /^160000\s+commit\s+([a-f0-9]{40})\s+/mu.exec(result.stdout);
  return match?.[1] ?? null;
}

async function patchFileSha256(workspaceRoot, patchPath) {
  if (typeof patchPath !== 'string' || path.isAbsolute(patchPath) || patchPath.replace(/\\/g, '/').split('/').includes('..')) {
    throw new Error('quality-tools.patch.path debe ser una ruta relativa dentro del workspace');
  }
  const patchAbsolute = path.join(workspaceRoot, patchPath);
  await assertInsideWorkspace(workspaceRoot, patchAbsolute, 'quality-tools.patch.path');
  return createHash('sha256').update(await readFile(patchAbsolute)).digest('hex');
}

async function gitDiffSha256(toolRoot) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', toolRoot, 'diff', '--binary', '--no-ext-diff'], {
      cwd: toolRoot,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const hash = createHash('sha256');
    let stderr = '';
    const timeout = setTimeout(() => {
      if (process.platform === 'win32' && child.pid) {
        spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { shell: false, stdio: 'ignore', windowsHide: true });
      } else child.kill('SIGTERM');
      reject(new Error('git diff excedió el timeout'));
    }, 30_000);
    child.stdout.on('data', chunk => hash.update(chunk));
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      if (signal || code !== 0) reject(new Error(`git diff falló (${signal ?? code}): ${stderr.trim()}`));
      else resolve(hash.digest('hex'));
    });
  });
}

export { gitDiffSha256, gitStatusPorcelain, isInsideWorkspace, parentGitlinkCommit, patchFileSha256 };
