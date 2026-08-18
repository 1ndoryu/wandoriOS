import path from 'node:path';

const SOURCE_ENV_PATTERN = /^GLORY_[A-Z0-9_]+$/u;

function hasControlCharacters(value) {
  return [...value].some(character => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
}

function validateSourcePathRaw(value, label) {
  if (typeof value !== 'string' || value.length === 0 || hasControlCharacters(value)) {
    throw new Error(`${label} debe ser una ruta válida`);
  }
  return value;
}

export function validateSourcePath(value, label) {
  validateSourcePathRaw(value, label);
  if (!path.isAbsolute(value) && !path.win32.isAbsolute(value)) {
    throw new Error(`${label} debe ser una ruta absoluta válida`);
  }
  return value;
}

export function validateSourcePathEnv(value, label) {
  if (typeof value !== 'string' || !SOURCE_ENV_PATTERN.test(value)) {
    throw new Error(`${label} debe ser un nombre de variable GLORY_* válido`);
  }
  return value;
}

export function resolveConfiguredSourcePath(config, label, options = {}) {
  if (config.sourcePath !== undefined && config.sourcePathEnv !== undefined) {
    throw new Error(`${label}: sourcePath y sourcePathEnv son mutuamente excluyentes`);
  }
  if (config.sourcePath !== undefined) {
    validateSourcePathRaw(config.sourcePath, `${label}.sourcePath`);
    if (path.isAbsolute(config.sourcePath) || path.win32.isAbsolute(config.sourcePath)) {
      return config.sourcePath;
    }
    /* [028A-8] sourcePath interno (submódulo dentro del workspace): se resuelve
     * contra baseDir para que el manifest sea portable entre máquinas. */
    if (typeof options.baseDir !== 'string' || options.baseDir.length === 0) {
      throw new Error(`${label}.sourcePath: ruta relativa requiere baseDir`);
    }
    return path.resolve(options.baseDir, config.sourcePath);
  }
  if (config.sourcePathEnv === undefined) return null;
  const envName = validateSourcePathEnv(config.sourcePathEnv, `${label}.sourcePathEnv`);
  const value = process.env[envName];
  if (value === undefined || value.length === 0) {
    throw new Error(`${label}.${envName}: variable no configurada; define la ruta al checkout main externo`);
  }
  return validateSourcePath(value, `${label}.${envName}`);
}
