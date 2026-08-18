import { lstatSync, realpathSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const ADAPTER_MANIFEST_FILE = 'quality-adapter.json';
export const REQUIRED_STAGE_NAMES = Object.freeze(['sentinel']);
export const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const PLACEHOLDERS = new Set(['{stage}', '{reportPath}', '{taskId}']);
const SENSITIVE_ENV_NAMES = /(?:TOKEN|KEY|SECRET|PASSWORD|PASSWD|AUTHORIZATION|DATABASE_URL|PGPASSWORD)/u;
const ADAPTER_KEYS = new Set(['id', 'version', 'protocolVersion', 'capabilities', 'environment', 'output']);
const ENVIRONMENT_KEYS = new Set(['mode', 'allowlisted']);
const OUTPUT_KEYS = new Set(['schemaVersion', 'exitCodes']);
const EXIT_CODE_KEYS = new Set(['pass', 'findings', 'toolError', 'cancelled']);
const TRANSPORT_KEYS = new Set(['executable', 'entrypoint', 'arguments']);
const STAGE_KEYS = new Set(['timeoutMs']);

function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function assertKeys(value, allowed, label) { const unknown = Object.keys(value).filter(key => !allowed.has(key)); if (unknown.length > 0) throw new Error(`${label}: claves desconocidas: ${unknown.join(', ')}`); }
function assertName(value, label) { if (typeof value !== 'string' || value.length === 0 || value.length > 128 || !/^[A-Za-z0-9:_*.-]+$/u.test(value)) throw new Error(`${label}: nombre inválido`); }
export function assertTaskId(value, label = 'task-id') { if (typeof value !== 'string' || !TASK_ID_PATTERN.test(value)) throw new Error(`${label}: identificador inválido`); return value; }
function isWithin(root, candidate) { const relative = path.relative(root, candidate); return !relative.startsWith('..') && !path.isAbsolute(relative); }

function rejectSymlinkAncestors(root, target, label) {
  let realRoot = null;
  try { realRoot = realpathSync(root); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  let current = target;
  while (isWithin(root, current)) {
    try {
      const stats = lstatSync(current);
      if (stats.isSymbolicLink()) throw new Error(`${label}: no puede atravesar symlink/junction`);
      if (realRoot) {
        const realCurrent = realpathSync(current);
        if (!isWithin(realRoot, realCurrent)) throw new Error(`${label}: ruta real fuera del workspace`);
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (current === root) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export function resolveWorkspacePath(projectRoot, candidate, label, { allowReportRoot = false } = {}) {
  if (typeof candidate !== 'string' || candidate.length === 0 || candidate.includes('\0')) throw new Error(`${label}: ruta inválida`);
  const workspace = path.resolve(projectRoot);
  const resolved = path.resolve(workspace, candidate);
  if (!isWithin(workspace, resolved)) throw new Error(`${label}: ruta fuera del workspace`);
  const relative = path.relative(workspace, resolved);
  if (allowReportRoot && !relative.startsWith(`.quality-reports${path.sep}`) && relative !== '.quality-reports') throw new Error(`${label}: debe permanecer bajo .quality-reports`);
  rejectSymlinkAncestors(workspace, resolved, label);
  return resolved;
}

function assertRelativePath(value, label) { if (typeof value !== 'string' || value.length === 0 || path.isAbsolute(value)) throw new Error(`${label}: debe ser una ruta relativa`); if (value.replace(/\\/g, '/').split('/').includes('..')) throw new Error(`${label}: no puede salir del workspace`); }
function assertStageList(value, label, declaredStages) { if (!Array.isArray(value) || value.length === 0) throw new Error(`${label}: debe ser una lista no vacía`); for (const stage of value) { assertName(stage, label); if (!declaredStages.has(stage)) throw new Error(`${label}: etapa desconocida ${stage}`); } }
function declaredStageNames(manifest) { if (!isRecord(manifest?.stages) || Object.keys(manifest.stages).length === 0) throw new Error('quality-adapter.json.stages: debe ser un objeto no vacío'); return Object.keys(manifest.stages); }
function assertEnvironmentNames(names, label) {
  if (!Array.isArray(names) || !names.every(item => typeof item === 'string' && /^[A-Za-z_][A-Za-z0-9_]*(?:\(X86\))?$/u.test(item))) throw new Error(`${label}: debe contener nombres de entorno allowlisted`);
  const sensitive = names.filter(name => SENSITIVE_ENV_NAMES.test(name.toUpperCase()));
  if (sensitive.length > 0) throw new Error(`${label}: variables sensibles no permitidas (${sensitive.join(', ')})`);
  return names;
}
function normalizeEnvironmentNames(names, label) {
  const valid = assertEnvironmentNames(names, label);
  const seen = new Set();
  return valid.filter(name => {
    const key = name.toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function manifestStageNames(manifest) { validateAdapterManifest(manifest); return declaredStageNames(manifest); }

export function validateAdapterManifest(manifest) {
  if (!isRecord(manifest)) throw new Error('quality-adapter.json: la raíz debe ser un objeto');
  if (manifest.schemaVersion !== 1) throw new Error('quality-adapter.json: schemaVersion debe ser 1');
  assertKeys(manifest, new Set(['schemaVersion', 'adapter', 'transport', 'stages', 'profiles']), 'quality-adapter.json');
  if (!isRecord(manifest.adapter)) throw new Error('quality-adapter.json.adapter: debe ser un objeto');
  assertKeys(manifest.adapter, ADAPTER_KEYS, 'quality-adapter.json.adapter');
  assertName(manifest.adapter.id, 'quality-adapter.json.adapter.id');
  assertName(manifest.adapter.version, 'quality-adapter.json.adapter.version');
  if (!Number.isInteger(manifest.adapter.protocolVersion) || manifest.adapter.protocolVersion < 1) throw new Error('quality-adapter.json.adapter.protocolVersion: inválido');
  if (!Array.isArray(manifest.adapter.capabilities) || !manifest.adapter.capabilities.every(item => typeof item === 'string')) throw new Error('quality-adapter.json.adapter.capabilities: debe ser una lista de strings');
  if (!isRecord(manifest.adapter.environment)) throw new Error('quality-adapter.json.adapter.environment: inválido');
  assertKeys(manifest.adapter.environment, ENVIRONMENT_KEYS, 'quality-adapter.json.adapter.environment');
  if (manifest.adapter.environment.mode !== 'runner-default') throw new Error('quality-adapter.json.adapter.environment.mode: debe ser runner-default');
  assertEnvironmentNames(manifest.adapter.environment.allowlisted, 'quality-adapter.json.adapter.environment.allowlisted');
  if (!isRecord(manifest.adapter.output)) throw new Error('quality-adapter.json.adapter.output: inválido');
  assertKeys(manifest.adapter.output, OUTPUT_KEYS, 'quality-adapter.json.adapter.output');
  if (String(manifest.adapter.output.schemaVersion) !== '1') throw new Error('quality-adapter.json.adapter.output.schemaVersion: debe ser 1');
  if (!isRecord(manifest.adapter.output.exitCodes)) throw new Error('quality-adapter.json.adapter.output.exitCodes: inválido');
  assertKeys(manifest.adapter.output.exitCodes, EXIT_CODE_KEYS, 'quality-adapter.json.adapter.output.exitCodes');
  for (const [name, expected] of Object.entries({ pass: 0, findings: 1, toolError: 2, cancelled: 130 })) if (manifest.adapter.output.exitCodes[name] !== expected) throw new Error(`quality-adapter.json.adapter.output.exitCodes.${name}: debe ser ${expected}`);
  if (!isRecord(manifest.transport)) throw new Error('quality-adapter.json.transport: inválido');
  assertKeys(manifest.transport, TRANSPORT_KEYS, 'quality-adapter.json.transport');
  if (manifest.transport.executable !== 'node') throw new Error('quality-adapter.json.transport.executable: solo se admite node');
  assertRelativePath(manifest.transport.entrypoint, 'quality-adapter.json.transport.entrypoint');
  if (!Array.isArray(manifest.transport.arguments) || manifest.transport.arguments.length === 0) throw new Error('quality-adapter.json.transport.arguments: debe ser una lista no vacía');
  for (const argument of manifest.transport.arguments) if (typeof argument !== 'string' || (!PLACEHOLDERS.has(argument) && argument.includes('{'))) throw new Error('quality-adapter.json.transport.arguments: placeholder no permitido');
  for (const required of PLACEHOLDERS) if (!manifest.transport.arguments.includes(required)) throw new Error(`quality-adapter.json.transport.arguments: falta ${required}`);
  const declaredStages = new Set(declaredStageNames(manifest));
  for (const stage of REQUIRED_STAGE_NAMES) if (!declaredStages.has(stage)) throw new Error(`quality-adapter.json.stages: falta etapa obligatoria ${stage}`);
  for (const [stage, definition] of Object.entries(manifest.stages)) {
    assertName(stage, `quality-adapter.json.stages.${stage}`);
    if (!isRecord(definition)) throw new Error(`quality-adapter.json.stages.${stage}: debe ser un objeto`);
    assertKeys(definition, STAGE_KEYS, `quality-adapter.json.stages.${stage}`);
    if (!Number.isInteger(definition.timeoutMs) || definition.timeoutMs < 1 || definition.timeoutMs > 30 * 60 * 1000) throw new Error(`quality-adapter.json.stages.${stage}.timeoutMs: inválido`);
  }
  if (!isRecord(manifest.profiles)) throw new Error('quality-adapter.json.profiles: debe ser un objeto');
  for (const [profile, stages] of Object.entries(manifest.profiles)) { assertName(profile, `quality-adapter.json.profiles.${profile}`); assertStageList(stages, `quality-adapter.json.profiles.${profile}`, declaredStages); }
  return manifest;
}

export async function readAdapterManifest(projectRoot) {
  const manifestPath = resolveWorkspacePath(projectRoot, ADAPTER_MANIFEST_FILE, ADAPTER_MANIFEST_FILE);
  try { if (!statSync(manifestPath).isFile()) throw new Error('no es un archivo regular'); }
  catch (error) { throw new Error(`${ADAPTER_MANIFEST_FILE}: archivo inexistente o inválido (${error.message})`); }
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); }
  catch (error) { throw new Error(`No se pudo leer ${ADAPTER_MANIFEST_FILE}: ${error.message}`); }
  const entrypoint = manifest?.transport?.entrypoint;
  if (typeof entrypoint !== 'string') throw new Error('quality-adapter.json.transport.entrypoint: debe ser string');
  const entrypointPath = resolveWorkspacePath(projectRoot, entrypoint, 'quality-adapter.json.transport.entrypoint');
  try { if (!statSync(entrypointPath).isFile()) throw new Error('no es un archivo regular'); }
  catch (error) { throw new Error(`quality-adapter.json.transport.entrypoint: archivo inexistente o inválido (${error.message})`); }
  return validateAdapterManifest(manifest);
}

export function adapterStageNames(manifest, profiles, full) { validateAdapterManifest(manifest); const declared = declaredStageNames(manifest); if (full) return declared; const selected = new Set(REQUIRED_STAGE_NAMES); for (const profile of profiles) { if (!Object.hasOwn(manifest.profiles, profile)) throw new Error(`Perfil de adapter desconocido: ${profile}`); for (const stage of manifest.profiles[profile]) selected.add(stage); } return declared.filter(stage => selected.has(stage)); }
export function assertImplementedStages(manifest, selectedStages, implementedStages) { validateAdapterManifest(manifest); const implemented = new Set(implementedStages); for (const stage of selectedStages) if (!implemented.has(stage)) throw new Error(`Etapa declarada por el adapter sin implementación: ${stage}`); return manifest; }
export function assertStageParity(selectedStages, implementedStages) { const selected = [...new Set(selectedStages)]; const implemented = [...new Set(implementedStages)]; if (selected.length !== implemented.length || selected.some((stage, index) => stage !== implemented[index])) throw new Error(`Deriva de etapas entre manifest y adapter: manifest=${selected.join(',')} implementation=${implemented.join(',')}`); return true; }
export function materializeTransportArguments(manifest, values) { const replacements = { '{stage}': values.stage, '{reportPath}': values.reportPath, '{taskId}': values.taskId }; return manifest.transport.arguments.map(argument => { if (!PLACEHOLDERS.has(argument)) return argument; const value = replacements[argument]; if (typeof value !== 'string' || value.length === 0) throw new Error(`Falta valor para ${argument}`); return value; }); }
export function adapterEnvironmentAllowlist(manifest, defaultAllowlist = []) { validateAdapterManifest(manifest); return normalizeEnvironmentNames([...(defaultAllowlist ?? []), ...manifest.adapter.environment.allowlisted], 'allowlist efectiva'); }
