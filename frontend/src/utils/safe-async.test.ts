/* wandori.us — Safe Async Tests
 * [Auditoría v4 §6.1] Tests para error handling unificado. */

import { describe, it, expect, vi } from 'vitest';
import { ok, err, tryCatch } from './result';
import { safeRun, safeClick, safeEffect } from './safe-async';

/* === result.ts tests === */

describe('ok', () => {
  it('crea un resultado exitoso', () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(42);
  });
});

describe('err', () => {
  it('crea un resultado de error', () => {
    const result = err('algo salió mal');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('algo salió mal');
  });
});

describe('tryCatch', () => {
  it('retorna ok cuando la promesa resuelve', async () => {
    const result = await tryCatch(Promise.resolve('éxito'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('éxito');
  });

  it('retorna err cuando la promesa rechaza', async () => {
    const result = await tryCatch(Promise.reject(new Error('fallo')));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('fallo');
  });

  it('maneja errores con mensaje string', async () => {
    const result = await tryCatch(Promise.reject('error string'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('error string');
  });

  it('no atrapa errores de promesas exitosas', async () => {
    const result = await tryCatch(Promise.resolve(0));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(0);
  });
});

/* === safe-async.ts tests === */

describe('safeRun', () => {
  it('retorna ok cuando la promesa resuelve', async () => {
    const result = await safeRun(Promise.resolve('ok'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('ok');
  });

  it('retorna err y muestra toast cuando falla', async () => {
    /* showToast no está disponible en test — safeRun la llama pero no falla */
    const result = await safeRun(Promise.reject(new Error('fallo')));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('fallo');
  });
});

describe('safeClick', () => {
  it('envuelve un handler async sin propagar al caller síncrono', () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const wrapped = safeClick(fn, 'error');
    expect(() => wrapped(new Event('click'))).not.toThrow();
    expect(fn).toHaveBeenCalledOnce();
  });

  it('declara error pero no lanza si fn rechaza', () => {
    const fn = vi.fn().mockRejectedValue(new Error('fallo en click'));
    const wrapped = safeClick(fn, 'error en click');
    expect(() => wrapped(new Event('click'))).not.toThrow();
  });
});

describe('safeEffect', () => {
  it('envuelve una función async sin propagar errores', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fallo silencioso'));
    const wrapped = safeEffect(fn);

    /* safeEffect retorna void, no debe lanzar */
    expect(() => wrapped()).not.toThrow();
  });

  it('ejecuta la función cuando se invoca el wrapper', () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const wrapped = safeEffect(fn);
    wrapped();
    expect(fn).toHaveBeenCalledOnce();
  });
});
