/* wandori.us — DOM createExternalLink Tests
 * [Auditoría v4 §6.1] createExternalLink extraído de dom.test.ts para
 * respetar el limite de lineas por archivo (150). */

import { describe, it, expect } from "vitest";
import { createExternalLink } from "./dom";

describe('createExternalLink', () => {
  it('crea un anchor externo con target _blank y rel noopener', () => {
    const el = createExternalLink('https://ejemplo.com', 'Ejemplo');
    expect(el.tagName).toBe('A');
    expect(el.getAttribute('href')).toBe('https://ejemplo.com');
    expect(el.getAttribute('target')).toBe('_blank');
    expect(el.getAttribute('rel')).toBe('noopener noreferrer');
    expect(el.getAttribute('data-external')).toBe('true');
    expect(el.textContent).toBe('Ejemplo');
  });

  it('acepta className opcional', () => {
    const el = createExternalLink('https://test.com', 'Test', 'link-externo');
    expect(el.className).toBe('link-externo');
  });

  /* [018A-84] Sin esquema la URL sería relativa y el click no navegaba. */
  it('normaliza URL sin esquema anteponiendo https://', () => {
    const el = createExternalLink('nakomi.studio', 'ver');
    expect(el.getAttribute('href')).toBe('https://nakomi.studio');
  });

  it('conserva URLs con esquema (http, mailto, ftp...)', () => {
    expect(createExternalLink('http://ejemplo.com', 'x').getAttribute('href')).toBe('http://ejemplo.com');
    expect(createExternalLink('https://ejemplo.com', 'x').getAttribute('href')).toBe('https://ejemplo.com');
    expect(createExternalLink('mailto:a@b.com', 'x').getAttribute('href')).toBe('mailto:a@b.com');
  });
});
