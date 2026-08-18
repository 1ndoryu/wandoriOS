import { describe, expect, it } from 'vitest';
import { adminOnlyAvailability, capabilityLevel, hasCapability } from './capability';

describe('capability policy', () => {
  it('ordena public, authenticated y admin', () => {
    expect(capabilityLevel('public')).toBe(0);
    expect(capabilityLevel('authenticated')).toBe(1);
    expect(capabilityLevel('admin')).toBe(2);
  });

  it('permite la capacidad requerida y niveles superiores', () => {
    expect(hasCapability('public', 'public')).toBe(true);
    expect(hasCapability('authenticated', 'public')).toBe(true);
    expect(hasCapability('authenticated', 'authenticated')).toBe(true);
    expect(hasCapability('admin', 'authenticated')).toBe(true);
    expect(hasCapability('admin')).toBe(true);
  });

  it('rechaza niveles insuficientes', () => {
    expect(hasCapability('public', 'authenticated')).toBe(false);
    expect(hasCapability('authenticated', 'admin')).toBe(false);
  });

  it('falla cerrado ante valores desconocidos', () => {
    expect(capabilityLevel('super-admin')).toBe(-1);
    expect(hasCapability('unknown' as 'public', 'public')).toBe(false);
    expect(hasCapability('admin', 'super-admin' as 'public')).toBe(false);
  });
});

/* [297A-29 F2] Disponibilidad admin-only genérica para comandos */
describe('adminOnlyAvailability', () => {
  it('habilita solo para admin', () => {
    expect(adminOnlyAvailability('admin')).toEqual({ state: 'enabled' });
    expect(adminOnlyAvailability('authenticated')).toEqual({ state: 'hidden' });
    expect(adminOnlyAvailability('public')).toEqual({ state: 'hidden' });
  });

  it('falla cerrado ante capacidad ausente o corrupta', () => {
    expect(adminOnlyAvailability(undefined)).toEqual({ state: 'hidden' });
    expect(adminOnlyAvailability('super-admin' as 'admin')).toEqual({ state: 'hidden' });
  });
});
