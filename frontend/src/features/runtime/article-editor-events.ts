/* wandori.us — Article Editor Events
 * Canal mínimo de dominio para comunicar cambios editoriales entre apps.
 * No conoce ventanas, DOM ni Admin; cualquier consumidor puede suscribirse. */

export interface ArticleEditorSavedEvent {
  readonly articleId: string;
  readonly operation: 'created' | 'updated' | 'deleted';
}

type Listener = (event: ArticleEditorSavedEvent) => void;
const listeners = new Set<Listener>();

export function subscribeArticleEditorSaved(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function publishArticleEditorSaved(event: ArticleEditorSavedEvent): void {
  for (const listener of listeners) listener(event);
}
