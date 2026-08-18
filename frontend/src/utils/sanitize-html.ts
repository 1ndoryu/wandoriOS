/* [297A-6] Renderiza HTML editable con una allowlist pequena. DOMParser mantiene
 * el contenido fuera del DOM activo hasta que cada nodo y atributo fue validado. */
const allowedTags = new Set([
  'a', 'blockquote', 'br', 'code', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'img', 'li', 'ol', 'p', 'pre', 'strong', 'ul',
]);

const globalAttributes = new Set(['title']);
const attributesByTag: Record<string, Set<string>> = {
  a: new Set(['href', 'target']),
  img: new Set(['alt', 'height', 'loading', 'src', 'width']),
};

function safeUrl(value: string, attribute: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return attribute === 'href' ? '#' : null;
  try {
    const parsed = new URL(trimmed, window.location.origin);
    const allowedProtocols = attribute === 'href'
      ? new Set(['http:', 'https:', 'mailto:'])
      : new Set(['http:', 'https:']);
    return allowedProtocols.has(parsed.protocol) ? trimmed : null;
  } catch {
    return null;
  }
}

function appendSafeNode(source: Node, target: Node): void {
  if (source.nodeType === Node.TEXT_NODE) {
    target.appendChild(document.createTextNode(source.textContent ?? ''));
    return;
  }
  if (!(source instanceof Element)) return;

  const tag = source.tagName.toLowerCase();
  if (!allowedTags.has(tag)) {
    source.childNodes.forEach(child => appendSafeNode(child, target));
    return;
  }

  const clean = document.createElement(tag);
  const tagAttributes = attributesByTag[tag] ?? new Set<string>();
  for (const { name, value } of Array.from(source.attributes)) {
    const attribute = name.toLowerCase();
    if (!globalAttributes.has(attribute) && !tagAttributes.has(attribute)) continue;
    if (attribute === 'href' || attribute === 'src') {
      const url = safeUrl(value, attribute);
      if (url) clean.setAttribute(attribute, url);
    } else if (attribute === 'target' && value === '_blank') {
      clean.setAttribute(attribute, value);
    } else if (attribute !== 'target') {
      clean.setAttribute(attribute, value);
    }
  }
  if (tag === 'a' && clean.getAttribute('target') === '_blank') {
    clean.setAttribute('rel', 'noopener noreferrer');
  }
  if (tag === 'img') clean.setAttribute('loading', 'lazy');
  source.childNodes.forEach(child => appendSafeNode(child, clean));
  target.appendChild(clean);
}

export function appendSanitizedHtml(target: HTMLElement, html: string): void {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.body.childNodes.forEach(node => appendSafeNode(node, target));
}
