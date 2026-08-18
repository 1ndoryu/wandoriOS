import { spawn } from 'node:child_process';
import { truncate } from './redaction.mjs';

export const DEFAULT_ENV_ALLOWLIST = Object.freeze([
  'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP',
  'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)',
  'NUMBER_OF_PROCESSORS', 'CI', 'NO_COLOR', 'TERM', 'npm_execpath',
  /* [108A-1 Fase 0] Los tokens de sanción del gate NO van en el allowlist:
   * adapter-manifest rechaza nombres tipo TOKEN/KEY/SECRET por redacción.
   * Se heredan por el árbol de procesos en safeEnvironment (ver abajo). */
]);

/* [108A-1 Fase 0] Tokens de sanción del gate que el runner hereda SIEMPRE a
 * los procesos hijos cuando existen en process.env, aunque no estén en el
 * allowlist: GLORY_QUALITY_GATE_TOKEN (task-check.mjs lo genera al arrancar) y
 * GLORY_HEAVY_RUN_TOKEN (al adquirir el lease pesado). El contrato del guard
 * del runtime dice que el token "se hereda únicamente por su árbol de procesos;
 * fuera de él, el token no existe". Sin esta herencia, los shims
 * globales bloqueaban las validaciones internas del gate (cargo fmt) y
 * run-with-db chocaba con el lease pesado del propio gate (clippy/test). Estos
 * marcadores no contienen secretos: solo identifican una ejecución sancionada
 * por el gate; si el proceso padre no es el gate, no existen. */
const GATE_SANCTION_ENV = Object.freeze(['GLORY_QUALITY_GATE_TOKEN', 'GLORY_HEAVY_RUN_TOKEN']);
const MAX_CAPTURE_BYTES = 64 * 1024;
const activeChildren = new Set();

function appendOutput(current, chunk) {
  const value = String(chunk);
  if (current.text.length >= MAX_CAPTURE_BYTES) { current.truncated = true; return current; }
  const remaining = MAX_CAPTURE_BYTES - current.text.length;
  current.text += value.slice(0, remaining);
  current.truncated ||= value.length > remaining;
  return current;
}
function outputText(capture) { return capture.truncated ? `${capture.text}\n...[quality output truncated at ${MAX_CAPTURE_BYTES} bytes]` : capture.text; }

export function safeEnvironment(extra = {}, allowlist = DEFAULT_ENV_ALLOWLIST) {
  const permitted = new Set(allowlist ?? DEFAULT_ENV_ALLOWLIST);
  /* [108A-1 Fase 0] Heredar los tokens de sanción del gate (ver arriba). */
  for (const key of GATE_SANCTION_ENV) if (process.env[key] !== undefined) permitted.add(key);
  const env = {};
  for (const key of permitted) if (process.env[key] !== undefined) env[key] = process.env[key];
  for (const [key, value] of Object.entries(extra ?? {})) if (permitted.has(key) && value !== undefined) env[key] = value;
  return env;
}

function terminateTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { shell: false, stdio: 'ignore', windowsHide: true });
  else child.kill('SIGTERM');
}
export function cancelAll() { for (const child of activeChildren) terminateTree(child); }

export function runProcess(executable, args, options = {}) {
  return new Promise(resolve => {
    const startedAt = Date.now();
    if (options.isCancelled?.()) { resolve({ code: 130, signal: null, timedOut: false, cancelled: true, durationMs: 0, stdout: '', stderr: '' }); return; }
    const isWindowsShim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(executable);
    let spawnTarget = executable;
    let spawnArgs = args;
    if (isWindowsShim) {
      spawnTarget = [executable, ...args].map(part => /\s|"/.test(part) ? `"${part.replace(/"/g, '""')}"` : part).join(' ');
      spawnArgs = [];
    }
    const child = spawn(spawnTarget, spawnArgs, { cwd: options.cwd, env: safeEnvironment(options.env, options.envAllowlist), shell: isWindowsShim, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    activeChildren.add(child);
    const stdout = { text: '', truncated: false };
    const stderr = { text: '', truncated: false };
    let timedOut = false;
    let cancellationObserved = false;
    const timer = setTimeout(() => { timedOut = true; terminateTree(child); }, options.timeoutMs ?? 120_000);
    const cancellationTimer = setInterval(() => { if (!timedOut && !cancellationObserved && options.isCancelled?.()) { cancellationObserved = true; terminateTree(child); } }, 10);
    child.stdout.on('data', chunk => appendOutput(stdout, chunk));
    child.stderr.on('data', chunk => appendOutput(stderr, chunk));
    child.on('error', error => {
      clearTimeout(timer); clearInterval(cancellationTimer); activeChildren.delete(child);
      resolve({ code: 2, signal: null, timedOut: false, cancelled: cancellationObserved, durationMs: Date.now() - startedAt, stdout: '', stderr: error.message });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer); clearInterval(cancellationTimer); activeChildren.delete(child);
      const cancelled = !timedOut && cancellationObserved;
      resolve({ code: timedOut ? 2 : cancelled ? 130 : code ?? 2, signal, timedOut, cancelled, durationMs: Date.now() - startedAt, stdout: truncate(outputText(stdout)), stderr: truncate(outputText(stderr)) });
    });
  });
}
