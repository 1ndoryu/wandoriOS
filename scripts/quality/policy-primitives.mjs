export const MAX_STRING_LENGTH = 160;
export const NAME_PATTERN = /^[A-Za-z0-9:_*.-]+$/u;

export function fail(message) {
  throw new Error(`sentinel.config.json: ${message}`);
}

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateName(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_STRING_LENGTH || !NAME_PATTERN.test(value)) {
    fail(`${label}: nombre inválido`);
  }
}
