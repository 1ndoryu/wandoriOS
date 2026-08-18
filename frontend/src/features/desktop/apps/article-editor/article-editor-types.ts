/* wandori.us — Article Editor Types
 * Tipos estructurales del editor Tiptap usados por toolbar, UI y autosave.
 * [297A-14 F5] Extraídos de article-editor.ts para mantener SRP y el límite
 * de 300 líneas por componente. Son una sub-superficie del editor real:
 * solo exponen las cadenas que el programa necesita. */

export interface EditorChain {
  toggleBold: () => EditorChain;
  toggleItalic: () => EditorChain;
  toggleCode: () => EditorChain;
  toggleHeading: (options: { level: 2 | 3 }) => EditorChain;
  toggleBulletList: () => EditorChain;
  toggleOrderedList: () => EditorChain;
  toggleBlockquote: () => EditorChain;
  setHorizontalRule: () => EditorChain;
  setImage: (options: { src: string }) => EditorChain;
  insertContent: (content: string) => EditorChain;
  run: () => boolean;
}

export interface EditorInstance {
  getJSON: () => unknown;
  chain: () => {
    focus: () => EditorChain;
  };
  /** Registrar listener de eventos Tiptap ('update', ...). */
  on?: (event: string, callback: () => void) => unknown;
  /** Remover listener de eventos Tiptap. */
  off?: (event: string, callback: () => void) => unknown;
  destroy: () => void;
}
