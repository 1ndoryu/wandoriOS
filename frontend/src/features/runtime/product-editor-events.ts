/* wandori.us — Product Editor Events
 * Canal de dominio entre product-editor y sus listados.
 * No conoce ventanas, modal, DOM ni Admin. */

export interface ProductEditorSavedEvent {
  readonly productId: string;
  readonly operation: 'created' | 'updated';
}

type Listener = (event: ProductEditorSavedEvent) => void;
const listeners = new Set<Listener>();

export function subscribeProductEditorSaved(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function publishProductEditorSaved(event: ProductEditorSavedEvent): void {
  for (const listener of listeners) listener(event);
}
