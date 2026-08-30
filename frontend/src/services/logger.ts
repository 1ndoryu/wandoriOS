/* wandori.us — Logger canónico
 * Único módulo autorizado para salida a consola en producción (la regla
 * console-production exime `loggerModules` declarados en sentinel.config.json).
 * [por que] Centraliza el prefijo del producto y da un punto único para
 * enviar los mensajes a un transporte futuro sin tocar los call sites. */

const PREFIJO = '[wandori.us]';

function prefijar(args: unknown[]): unknown[] {
  return [PREFIJO, ...args];
}

export const logger = {
  log: (...args: unknown[]) => console.log(...prefijar(args)),
  info: (...args: unknown[]) => console.info(...prefijar(args)),
  warn: (...args: unknown[]) => console.warn(...prefijar(args)),
  error: (...args: unknown[]) => console.error(...prefijar(args)),
  debug: (...args: unknown[]) => console.debug(...prefijar(args)),
};
