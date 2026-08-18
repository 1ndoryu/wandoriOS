/* wandori.us — DOM Helper Tests
 * [Auditoría v4 §6.1] Tests unitarios para la capa de abstracción DOM. */

import { describe, it, expect } from 'vitest';
import { createEl, createContainer, createText, createExternalLink } from './dom';

describe('createEl', () => {
  it('crea un elemento del tag correcto', () => {
    const el = createEl('div');
    expect(el.tagName).toBe('DIV');
  });

  it('crea un anchor con el tag A', () => {
    const el = createEl('a', { href: 'https://ejemplo.com' });
    expect(el.tagName).toBe('A');
    expect(el.getAttribute('href')).toBe('https://ejemplo.com');
  });

  it('asigna className', () => {
    const el = createEl('div', { className: 'container' });
    expect(el.className).toBe('container');
  });

  it('asigna id', () => {
    const el = createEl('div', { id: 'main' });
    expect(el.id).toBe('main');
  });

  it('asigna textContent', () => {
    const el = createEl('p', { textContent: 'hola mundo' });
    expect(el.textContent).toBe('hola mundo');
  });

  it('asigna innerHTML', () => {
    const el = createEl('div', { innerHTML: '<span>texto</span>' });
    expect(el.innerHTML).toBe('<span>texto</span>');
  });

  it('asigna atributos aria', () => {
    const el = createEl('button', {
      'aria-label': 'Cerrar',
      'aria-expanded': 'false',
    });
    expect(el.getAttribute('aria-label')).toBe('Cerrar');
    expect(el.getAttribute('aria-expanded')).toBe('false');
  });

  it('asigna atributos data-*', () => {
    const el = createEl('div', { 'data-node-id': '123' });
    expect(el.getAttribute('data-node-id')).toBe('123');
  });

  it('asigna target y rel', () => {
    const el = createEl('a', {
      href: 'https://ejemplo.com',
      target: '_blank',
      rel: 'noopener',
    });
    expect(el.getAttribute('target')).toBe('_blank');
    expect(el.getAttribute('rel')).toBe('noopener');
  });

  it('asigna type a input', () => {
    const el = createEl('input', { type: 'email', placeholder: 'tu@email.com' });
    expect(el.getAttribute('type')).toBe('email');
    expect(el.getAttribute('placeholder')).toBe('tu@email.com');
  });

  it('asigna atributos de imagen', () => {
    const el = createEl('img', {
      src: '/foto.jpg',
      alt: 'foto',
      loading: 'lazy',
    });
    expect(el.getAttribute('src')).toBe('/foto.jpg');
    expect(el.getAttribute('alt')).toBe('foto');
    expect(el.getAttribute('loading')).toBe('lazy');
  });

  it('añade hijos texto como text nodes', () => {
    const el = createEl('p', {}, 'texto directo');
    expect(el.childNodes.length).toBe(1);
    expect(el.childNodes[0].nodeType).toBe(Node.TEXT_NODE);
    expect(el.textContent).toBe('texto directo');
  });

  it('añade hijos elemento', () => {
    const child = createEl('span', { textContent: 'hijo' });
    const parent = createEl('div', {}, child);
    expect(parent.children.length).toBe(1);
    expect(parent.children[0].tagName).toBe('SPAN');
    expect(parent.textContent).toBe('hijo');
  });

  it('soporta multiples hijos', () => {
    const el = createEl('div', {},
      createEl('h1', { textContent: 'Título' }),
      createEl('p', { textContent: 'Párrafo' }),
    );
    expect(el.children.length).toBe(2);
    expect(el.children[0].tagName).toBe('H1');
    expect(el.children[1].tagName).toBe('P');
  });

  it('funciona sin attrs ni children', () => {
    const el = createEl('hr');
    expect(el.tagName).toBe('HR');
    expect(el.outerHTML).toBe('<hr>');
  });

  it('sin attrs ni children con cualquier tag', () => {
    const el = createEl('br');
    expect(el.tagName).toBe('BR');
  });

  /* [018A-81] Regresión: `setAttribute('value', ...)` no rellena <textarea>
   * (su contenido vive en la propiedad .value), por eso el extracto de un
   * artículo se abría vacío aunque estuviera guardado. El fix asigna la
   * propiedad para input/textarea/select y conserva el atributo para el resto. */
  it('asigna value a textarea por propiedad (no atributo)', () => {
    const el = createEl('textarea', { value: 'extracto guardado' });
    expect(el.value).toBe('extracto guardado');
    expect(el.getAttribute('value')).toBeNull();
  });

  it('asigna value a input por propiedad', () => {
    const el = createEl('input', { value: 'titulo' });
    expect(el.value).toBe('titulo');
  });

  it('conserva value como atributo en option', () => {
    const el = createEl('option', { value: 'draft', textContent: 'borrador' });
    expect(el.getAttribute('value')).toBe('draft');
    expect((el as HTMLOptionElement).value).toBe('draft');
  });
});

describe('createContainer', () => {
  it('crea un div con clase', () => {
    const el = createContainer('flex-center');
    expect(el.tagName).toBe('DIV');
    expect(el.className).toBe('flex-center');
  });

  it('acepta hijos', () => {
    const el = createContainer('wrapper', createEl('span', { textContent: 'dentro' }));
    expect(el.children.length).toBe(1);
  });
});

describe('createText', () => {
  it('crea un parrafo con texto y clase opcional', () => {
    const el = createText('cargando...', 'cargando');
    expect(el.tagName).toBe('P');
    expect(el.textContent).toBe('cargando...');
    expect(el.className).toBe('cargando');
  });

  it('crea un parrafo sin clase', () => {
    const el = createText('simple');
    expect(el.className).toBe('');
  });
});

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
