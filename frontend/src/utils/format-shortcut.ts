/* wandori.us — Formateador de atajos de teclado
 * [297A-20] Prueba de usuario: los atajos se muestran como glifos de tecla
 * estilo macOS (Meta+Shift+l -> ⌘⇧L) en lugar de texto plano, coherente con
 * la identidad minimalista del OS. Lucide no ofrece iconos para todas las
 * teclas (no hay Shift ni Ctrl), por eso se usan glifos unicode.
 * Para revertir: dejar de usar formatShortcut en los componentes de menú. */

const GLYPH_MAP: Record<string, string> = {
  meta: '⌘',
  cmd: '⌘',
  command: '⌘',
  shift: '⇧',
  alt: '⌥',
  option: '⌥',
  opt: '⌥',
  ctrl: '⌃',
  control: '⌃',
  escape: 'esc',
  esc: 'esc',
  enter: '⏎',
  return: '⏎',
  space: 'espacio',
  backspace: '⌫',
  delete: '⌦',
  tab: '⇥',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  pageup: 'PgUp',
  pagedown: 'PgDn',
  home: 'inicio',
  end: 'fin',
};

/**
 * Convierte un shortcut del CommandRegistry ("Meta+Shift+l", "ctrl+c",
 * "Ctrl+ArrowUp") en glifos de tecla estilo macOS ("⌘⇧L", "⌃C", "⌃↑").
 * Tokens no conocidos se conservan tal cual (primera letra en mayúscula).
 */
export function formatShortcut(shortcut: string): string {
  return shortcut
    .split('+')
    .map((part) => {
      const key = part.trim().toLowerCase();
      const glyph = GLYPH_MAP[key];
      if (glyph) return glyph;
      // Letra o número suelto: mayúscula (Meta+Shift+l -> L).
      if (/^[a-z0-9]$/i.test(part)) return part.toUpperCase();
      return part;
    })
    .join('');
}
