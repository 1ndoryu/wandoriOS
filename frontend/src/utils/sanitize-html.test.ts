/* Tests para utils/sanitize-html.ts — sanitizador XSS [Auditoría v4 §6.1] */
import { describe, it, expect } from 'vitest';
import { appendSanitizedHtml } from './sanitize-html';

function sanitize(html: string): string {
  const div = document.createElement('div');
  appendSanitizedHtml(div, html);
  return div.innerHTML;
}

describe('appendSanitizedHtml', () => {
  describe('tags permitidos', () => {
    it('permite tags de texto: p, strong, em, code', () => {
      const result = sanitize('<p>hola <strong>mundo</strong> <em>bonito</em> <code>fn()</code></p>');
      expect(result).toContain('<p>');
      expect(result).toContain('<strong>');
      expect(result).toContain('<em>');
      expect(result).toContain('<code>');
    });

    it('permite headings h1-h6', () => {
      for (let i = 1; i <= 6; i++) {
        const result = sanitize(`<h${i}>titulo</h${i}>`);
        expect(result).toContain(`<h${i}>`);
      }
    });

    it('permite listas ol, ul, li', () => {
      const result = sanitize('<ul><li>a</li><li>b</li></ul>');
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>');
    });

    it('permite blockquote, pre, br, hr', () => {
      const result = sanitize('<blockquote>cita</blockquote><pre>code</pre>linea<br><hr>');
      expect(result).toContain('<blockquote>');
      expect(result).toContain('<pre>');
      expect(result).toContain('<br>');
      expect(result).toContain('<hr>');
    });

    it('permite links con href seguro', () => {
      const result = sanitize('<a href="https://example.com">link</a>');
      expect(result).toContain('href="https://example.com"');
    });

    it('permite imagenes con src seguro', () => {
      const result = sanitize('<img src="https://example.com/img.jpg" alt="foto">');
      expect(result).toContain('src="https://example.com/img.jpg"');
      expect(result).toContain('alt="foto"');
      expect(result).toContain('loading="lazy"');
    });
  });

  describe('tags bloqueados', () => {
    it('elimina script tags pero conserva contenido textual hijo (recursión)', () => {
      const result = sanitize('<p>safe</p><script>alert("xss")</script>');
      expect(result).toContain('safe');
      expect(result).not.toContain('<script');
      /* El sanitizer recursa en hijos de tags bloqueados — el texto hijo se preserva,
       * pero el tag <script> en sí se elimina, así que no se ejecuta. */
      expect(result).not.toContain('</script>');
    });

    it('elimina iframe tags', () => {
      const result = sanitize('<iframe src="evil.com"></iframe>');
      expect(result).not.toContain('<iframe');
    });

    it('elimina style tags', () => {
      const result = sanitize('<style>body{display:none}</style>');
      expect(result).not.toContain('<style');
    });

    it('elimina form/input/button', () => {
      const result = sanitize('<form><input type="text"><button>click</button></form>');
      expect(result).not.toContain('<form');
      expect(result).not.toContain('<input');
      expect(result).not.toContain('<button');
    });

    it('conserva texto de tags bloqueados (recursión)', () => {
      const result = sanitize('<div><p>texto seguro</p></div>');
      expect(result).toContain('texto seguro');
    });
  });

  describe('atributos bloqueados', () => {
    it('elimina onclick y otros event handlers', () => {
      const result = sanitize('<p onclick="alert(1)">texto</p>');
      expect(result).not.toContain('onclick');
    });

    it('elimina style inline', () => {
      const result = sanitize('<p style="color:red">texto</p>');
      expect(result).not.toContain('style=');
    });

    it('elimina class attribute', () => {
      const result = sanitize('<p class="danger">texto</p>');
      expect(result).not.toContain('class=');
    });
  });

  describe('URLs peligrosas', () => {
    it('bloquea javascript: en href', () => {
      const result = sanitize('<a href="javascript:alert(1)">click</a>');
      expect(result).not.toContain('javascript:');
    });

    it('bloquea javascript: en src de imagen', () => {
      const result = sanitize('<img src="javascript:alert(1)">');
      expect(result).not.toContain('javascript:');
    });

    it('bloquea data: URLs en href', () => {
      const result = sanitize('<a href="data:text/html,<script>alert(1)</script>">click</a>');
      expect(result).not.toContain('data:');
    });

    it('permite mailto: en href', () => {
      const result = sanitize('<a href="mailto:test@example.com">email</a>');
      expect(result).toContain('mailto:');
    });
  });

  describe('target y rel', () => {
    it('añade rel="noopener noreferrer" a links con target=_blank', () => {
      const result = sanitize('<a href="https://example.com" target="_blank">link</a>');
      expect(result).toContain('rel="noopener noreferrer"');
      expect(result).toContain('target="_blank"');
    });

    it('bloquea target que no sea _blank', () => {
      const result = sanitize('<a href="https://example.com" target="_self">link</a>');
      expect(result).not.toContain('target=');
    });
  });

  describe('contenido mixto', () => {
    it('maneja HTML vacío', () => {
      expect(sanitize('')).toBe('');
    });

    it('maneja texto plano sin tags', () => {
      expect(sanitize('hola mundo')).toBe('hola mundo');
    });

    it('maneja tags anidados complejos', () => {
      const result = sanitize('<p><strong><em><a href="https://x.com">nested</a></em></strong></p>');
      expect(result).toContain('<p>');
      expect(result).toContain('<strong>');
      expect(result).toContain('<em>');
      expect(result).toContain('href="https://x.com"');
    });

    it('preserva title attribute global', () => {
      const result = sanitize('<p title="tooltip">texto</p>');
      expect(result).toContain('title="tooltip"');
    });
  });
});
