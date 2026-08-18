/* wandori.us — Project Editor Events
 * Canal de dominio entre project-editor y sus listados.
 * No conoce ventanas, modal, DOM ni Admin. */

export interface ProjectEditorSavedEvent {
  readonly projectId: string;
  readonly operation: 'created' | 'updated';
}

type Listener = (event: ProjectEditorSavedEvent) => void;
const listeners = new Set<Listener>();

export function subscribeProjectEditorSaved(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function publishProjectEditorSaved(event: ProjectEditorSavedEvent): void {
  for (const listener of listeners) listener(event);
}
