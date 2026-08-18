/* Tests para utils/viewport.ts — abstracción de window.* [Auditoría v4 §4.2/§6.1] */
import { describe, it, expect, afterEach } from 'vitest';
import { getViewport, getPresentationMode, getCurrentPathname, getCurrentOrigin } from './viewport';

describe('getViewport', () => {
  const origInnerWidth = window.innerWidth;
  const origInnerHeight = window.innerHeight;

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: origInnerWidth, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: origInnerHeight, writable: true, configurable: true });
  });

  it('devuelve dimensiones actuales del viewport', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
    expect(getViewport()).toEqual({ width: 1440, height: 900 });
  });

  it('refleja cambios en tiempo real', () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 812, configurable: true });
    expect(getViewport()).toEqual({ width: 375, height: 812 });
  });
});

describe('getPresentationMode', () => {
  const origInnerWidth = window.innerWidth;

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: origInnerWidth, writable: true, configurable: true });
  });

  it('devuelve mobile para width < 768', () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
    expect(getPresentationMode()).toBe('mobile');
  });

  it('devuelve tablet para 768 <= width < 1024', () => {
    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true });
    expect(getPresentationMode()).toBe('tablet');
  });

  it('devuelve desktop para width >= 1024', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
    expect(getPresentationMode()).toBe('desktop');
  });

  it('devuelve desktop en el límite exacto (1024)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    expect(getPresentationMode()).toBe('desktop');
  });

  it('devuelve mobile en el límite exacto (767)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 767, configurable: true });
    expect(getPresentationMode()).toBe('mobile');
  });
});

describe('getCurrentPathname', () => {
  it('devuelve el pathname actual', () => {
    expect(getCurrentPathname()).toBe(window.location.pathname);
  });
});

describe('getCurrentOrigin', () => {
  it('devuelve el origin actual', () => {
    expect(getCurrentOrigin()).toBe(window.location.origin);
  });
});
