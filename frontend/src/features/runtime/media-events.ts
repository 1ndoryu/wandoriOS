/* wandori.us — Media Changed Events
 * Canal de dominio mínimo para cambios de media en el cliente.
 * [018A-87] Mismo patrón que article-editor-events: Set de listeners y
 * publicación síncrona. Lo emiten la Biblioteca de media (subir/eliminar/
 * restaurar) y uploadFile (editor/portadas); lo consume media-gallery-sync
 * para aterrizar el archivo en su subcarpeta de Documentos. */

/** Tipo normalizado por el backend (image | audio | video). */
export type MediaChangedFileType = 'image' | 'audio' | 'video' | 'document';

export interface MediaChangedEvent {
  readonly mediaId: string;
  readonly operation: 'uploaded' | 'deleted' | 'restored';
  readonly fileType: MediaChangedFileType;
  readonly label: string;
}

type Listener = (event: MediaChangedEvent) => void;

const listeners = new Set<Listener>();

export function subscribeMediaChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishMediaChanged(event: MediaChangedEvent): void {
  for (const listener of listeners) listener(event);
}
