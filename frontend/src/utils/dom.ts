/* wandori.us — DOM Helper
 * Abstracción ligera sobre document.createElement para reducir las 215+ llamadas
 * directas esparcidas por el código.
 * [Auditoría v4 §1.2/§2.1] Primer paso hacia una capa de abstracción DOM. */

/** Atributos comunes a todos los elementos. */
export interface CoreAttrs {
  className?: string;
  id?: string;
  textContent?: string;
  innerHTML?: string;
  title?: string;
  role?: string;
}

/** Atributos de enlaces. */
export interface LinkAttrs {
  href?: string;
  target?: string;
  rel?: string;
  download?: string;
}

/** Atributos de formularios. */
export interface FormAttrs {
  type?: string;
  placeholder?: string;
  value?: string;
  name?: string;
  min?: string;
  max?: string;
  step?: string;
  rows?: string;
  accept?: string;
  disabled?: string;
}

/** Atributos de multimedia. */
export interface MediaAttrs {
  alt?: string;
  src?: string;
  loading?: string;
}

/** Atributos ARIA para accesibilidad. */
export interface AriaAttrs {
  'aria-label'?: string;
  ariaLabel?: string;
  'aria-haspopup'?: string;
  ariaHaspopup?: string;
  'aria-expanded'?: string;
  ariaExpanded?: string;
  'aria-pressed'?: string;
  ariaPressed?: string;
  'aria-hidden'?: string;
  ariaHidden?: string;
  'aria-modal'?: string;
  ariaModal?: string;
  'aria-labelledby'?: string;
  ariaLabelledby?: string;
}

/** Atributos data-* dinámicos. */
export interface DataAttrs {
  'data-external'?: string;
  [key: `data-${string}`]: string | undefined;
}

/** Atributos planos (solo strings) para createEl.
 *  Intersección de todas las sub-interfaces. Event listeners y estilos
 *  se asignan post-creación. */
export type DomAttrs = CoreAttrs & LinkAttrs & FormAttrs & MediaAttrs & AriaAttrs & DataAttrs;

/** Crear un elemento HTML con atributos e hijos.
 *  @param tag - Tag del elemento (ej: 'div', 'span', 'h1')
 *  @param attrs - Atributos opcionales (solo strings)
 *  @param children - Hijos (HTMLElement o string) opcionales
 *
 *  @example
 *  createEl('div', { className: 'container' },
 *    createEl('h1', { textContent: 'Título' }),
 *    'texto directo',
 *  ) */
/** Atajo para setear atributo si existe, chequeando kebab y camelCase. */
function setAttr(el: HTMLElement, key: string, value: string | undefined): void {
  if (value !== undefined) el.setAttribute(key, value);
}

export function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: DomAttrs,
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);

  if (attrs) {
    if (attrs.className) el.className = attrs.className;
    if (attrs.id) el.id = attrs.id;
    if (attrs.textContent !== undefined) el.textContent = attrs.textContent;
    if (attrs.innerHTML) el.innerHTML = attrs.innerHTML;
    if (attrs.href) el.setAttribute('href', attrs.href);
    if (attrs.target) el.setAttribute('target', attrs.target);
    if (attrs.rel) el.setAttribute('rel', attrs.rel);
    if (attrs.type) el.setAttribute('type', attrs.type);
    if (attrs.placeholder) el.setAttribute('placeholder', attrs.placeholder);
    if (attrs.alt) el.setAttribute('alt', attrs.alt);
    if (attrs.src) el.setAttribute('src', attrs.src);
    if (attrs.loading) el.setAttribute('loading', attrs.loading);
    /* [018A-81] `setAttribute('value', ...)` no rellena <textarea>: su
     * contenido vive en la propiedad .value, no en un atributo (por eso el
     * extracto del artículo se abría vacío aunque estuviera guardado). Se
     * asigna la propiedad para input/textarea/select y el atributo para el
     * resto (option, li, etc.). */
    if (attrs.value) {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        el.value = attrs.value;
      } else {
        el.setAttribute('value', attrs.value);
      }
    }
    if (attrs.name) el.setAttribute('name', attrs.name);
    if (attrs.disabled) el.setAttribute('disabled', attrs.disabled);
    if (attrs.download) el.setAttribute('download', attrs.download);
    /* [297A-29] min/max/step/rows/accept estaban declarados en FormAttrs pero
     * nunca se aplicaban: los sliders quedaban clampados a 0–100 (el perfil
     * y la nueva escala del panel de control). */
    if (attrs.min !== undefined) el.setAttribute('min', attrs.min);
    if (attrs.max !== undefined) el.setAttribute('max', attrs.max);
    if (attrs.step !== undefined) el.setAttribute('step', attrs.step);
    if (attrs.rows !== undefined) el.setAttribute('rows', attrs.rows);
    if (attrs.accept !== undefined) el.setAttribute('accept', attrs.accept);

    /* Soportar kebab-case y camelCase para aria-* */
    setAttr(el, 'aria-label', attrs['aria-label'] ?? attrs.ariaLabel);
    setAttr(el, 'aria-haspopup', attrs['aria-haspopup'] ?? attrs.ariaHaspopup);
    setAttr(el, 'aria-expanded', attrs['aria-expanded'] ?? attrs.ariaExpanded);
    setAttr(el, 'aria-pressed', attrs['aria-pressed'] ?? attrs.ariaPressed);
    setAttr(el, 'aria-hidden', attrs['aria-hidden'] ?? attrs.ariaHidden);
    setAttr(el, 'aria-modal', attrs['aria-modal'] ?? attrs.ariaModal);
    setAttr(el, 'aria-labelledby', attrs['aria-labelledby'] ?? attrs.ariaLabelledby);

    if (attrs['role']) el.setAttribute('role', attrs['role']);
    if (attrs['title']) el.setAttribute('title', attrs['title']);
    if (attrs['data-external']) el.setAttribute('data-external', attrs['data-external']);

    /* Atributos data-* dinámicos */
    for (const key of Object.keys(attrs)) {
      if (key.startsWith('data-') && key !== 'data-external') {
        const val = (attrs as Record<string, string | undefined>)[key];
        if (val !== undefined) {
          el.setAttribute(key, val);
        }
      }
    }
  }

  for (const child of children) {
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else {
      el.appendChild(child);
    }
  }

  return el;
}

/** Crear un contenedor con clase. Atajo para casos simples. */
export function createContainer(className: string, ...children: (HTMLElement | string)[]): HTMLDivElement {
  return createEl('div', { className }, ...children);
}

/** Crear un párrafo de texto. */
export function createText(text: string, className?: string): HTMLParagraphElement {
  return createEl('p', { className, textContent: text });
}

/** Normalizar una URL externa para navegación.
 * [018A-84] Un href sin esquema ("nakomi.studio") se interpreta como ruta
 * relativa del sitio y "ver" no navegaba. Si no hay esquema (scheme://), se
 * antepone https://. Cubre cualquier superficie que use enlaces externos. */
export function normalizeExternalUrl(href: string): string {
  const trimmed = href.trim();
  if (!trimmed) return trimmed;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** Crear un enlace externo. */
export function createExternalLink(href: string, text: string, className?: string): HTMLAnchorElement {
  return createEl('a', {
    href: normalizeExternalUrl(href),
    textContent: text,
    className,
    target: '_blank',
    rel: 'noopener noreferrer',
    'data-external': 'true',
  });
}
