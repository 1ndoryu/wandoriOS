/* wandori.us — DOM Reconciler
 * Utility para actualizar hijos de un contenedor sin destruir el DOM completo.
 * Reusa nodos existentes por key, solo crea/elimina los que cambiaron.
 * Reemplaza el patrón innerHTML='' + rebuild que causa O(n²) reflows.
 * [Auditoría v3 §2.1] */

/**
 * Reconciliar hijos de un contenedor con una nueva lista de items.
 * Reusa nodos existentes por data-key, crea nuevos, elimina los obsoletos.
 *
 * @param container - Contenedor cuyos hijos se reconcilian
 * @param items - Nueva lista de items
 * @param getKey - Función que extrae la key única de cada item
 * @param createElement - Función que crea un nodo nuevo para un item
 * @param updateElement - Función opcional que actualiza un nodo existente (si el item cambió)
 */
export function reconcileChildren<T>(
  container: HTMLElement,
  items: readonly T[],
  getKey: (item: T) => string,
  createElement: (item: T) => HTMLElement,
  updateElement?: (el: HTMLElement, item: T) => void,
): void {
  /* Mapa de key → nodo existente */
  const existingNodes = new Map<string, HTMLElement>();
  for (const child of Array.from(container.children)) {
    const key = (child as HTMLElement).dataset.key;
    if (key) existingNodes.set(key, child as HTMLElement);
  }

  /* Construir nueva lista de nodos */
  const fragment = document.createDocumentFragment();
  const usedKeys = new Set<string>();

  for (const item of items) {
    const key = getKey(item);
    usedKeys.add(key);

    const existing = existingNodes.get(key);
    if (existing) {
      /* Reusar nodo existente — actualizar si es necesario */
      if (updateElement) updateElement(existing, item);
      fragment.appendChild(existing);
    } else {
      /* Crear nodo nuevo */
      const el = createElement(item);
      el.dataset.key = key;
      fragment.appendChild(el);
    }
  }

  /* Eliminar nodos obsoletos (keys que ya no están en la lista) */
  for (const [key, node] of existingNodes) {
    if (!usedKeys.has(key)) {
      node.remove();
    }
  }

  /* Reemplazar contenido del contenedor con la lista reconciliada */
  container.appendChild(fragment);
}
