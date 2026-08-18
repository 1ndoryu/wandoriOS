/* wandori.us — Mobile Gestures
 * Gestos de presentación móvil, sin lógica de negocio ni comandos propios.
 * Un long press solo proyecta una acción externa; la superficie decide qué
 * comandos mostrar. [297A-12 §3] */

export interface LongPressOptions {
  readonly delayMs?: number;
  readonly movementThreshold?: number;
  readonly onLongPress: (event: PointerEvent) => void;
}

export interface LongPressBinding {
  readonly destroy: () => void;
}

export interface LongPressDragOptions {
  readonly delayMs?: number;
  readonly movementThreshold?: number;
  readonly onLongPress: (event: PointerEvent) => void;
  readonly onLongPressEnd: (event: PointerEvent) => void;
  readonly onDragStart: (event: PointerEvent) => void;
  readonly onDragMove: (event: PointerEvent) => void;
  readonly onDragEnd: (event: PointerEvent) => void;
}

/**
 * Long press con transición opcional a drag.
 * Un tap no intercepta el click del control; un long press sin movimiento
 * termina en menú; un movimiento posterior al umbral termina en drag.
 */
export function bindLongPressDrag(
  element: HTMLElement,
  options: LongPressDragOptions,
): LongPressBinding {
  const delayMs = options.delayMs ?? 500;
  const movementThreshold = options.movementThreshold ?? 10;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let activePointerId: number | undefined;
  let capturedPointerId: number | undefined;
  let longPressed = false;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let suppressNextClick = false;

  const releasePointer = (): void => {
    const pointerId = capturedPointerId;
    capturedPointerId = undefined;
    if (pointerId === undefined || !element.releasePointerCapture) return;
    try {
      if (!element.hasPointerCapture || element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
    } catch {
      /* La captura puede haberse liberado automáticamente. */
    }
  };

  const clear = (): void => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    activePointerId = undefined;
    longPressed = false;
    dragging = false;
    releasePointer();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    clear();
    suppressNextClick = false;
    activePointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    if (element.setPointerCapture) {
      try {
        element.setPointerCapture(event.pointerId);
        capturedPointerId = event.pointerId;
      } catch {
        /* El entorno puede no permitir captura durante un evento sintético. */
      }
    }
    timer = setTimeout(() => {
      timer = undefined;
      longPressed = true;
      suppressNextClick = true;
      options.onLongPress(event);
    }, delayMs);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== activePointerId) return;
    const moved = Math.hypot(event.clientX - startX, event.clientY - startY);
    if (!longPressed) {
      if (moved > movementThreshold) clear();
      return;
    }
    if (!dragging && moved > movementThreshold) {
      dragging = true;
      options.onDragStart(event);
    }
    if (dragging) {
      event.preventDefault();
      options.onDragMove(event);
    }
  };

  const onPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId !== activePointerId) return;
    if (dragging) options.onDragEnd(event);
    else if (longPressed) options.onLongPressEnd(event);
    clear();
  };

  const onClick = (event: MouseEvent): void => {
    if (!suppressNextClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressNextClick = false;
  };

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerEnd);
  element.addEventListener('pointercancel', onPointerEnd);
  element.addEventListener('lostpointercapture', onPointerEnd);
  element.addEventListener('click', onClick, true);

  return {
    destroy: (): void => {
      clear();
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerEnd);
      element.removeEventListener('pointercancel', onPointerEnd);
      element.removeEventListener('lostpointercapture', onPointerEnd);
      element.removeEventListener('click', onClick, true);
    },
  };
}

export function bindLongPress(
  element: HTMLElement,
  options: LongPressOptions,
): LongPressBinding {
  const delayMs = options.delayMs ?? 500;
  const movementThreshold = options.movementThreshold ?? 10;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let startX = 0;
  let startY = 0;
  let activePointerId: number | undefined;
  let capturedPointerId: number | undefined;
  let suppressNextClick = false;

  const releasePointer = (): void => {
    const pointerId = capturedPointerId;
    capturedPointerId = undefined;
    if (pointerId === undefined || !element.releasePointerCapture) return;
    try {
      if (!element.hasPointerCapture || element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
    } catch {
      /* La captura puede haberse liberado automáticamente por el navegador. */
    }
  };

  const clearPress = (): void => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    activePointerId = undefined;
    releasePointer();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    /* Un gesto nuevo siempre empieza sin la supresión del gesto anterior.
     * Esto evita bloquear un click legítimo si el navegador no emite el click
     * sintético después de un long press. */
    suppressNextClick = false;
    clearPress();
    activePointerId = event.pointerId;
    if (element.setPointerCapture) {
      try {
        element.setPointerCapture(event.pointerId);
        capturedPointerId = event.pointerId;
      } catch {
        /* El entorno puede no permitir captura durante un evento sintético. */
      }
    }
    startX = event.clientX;
    startY = event.clientY;
    timer = setTimeout(() => {
      timer = undefined;
      suppressNextClick = true;
      options.onLongPress(event);
    }, delayMs);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== activePointerId) return;
    const moved = Math.hypot(event.clientX - startX, event.clientY - startY);
    if (moved > movementThreshold) clearPress();
  };

  const onPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId !== activePointerId) return;
    clearPress();
  };

  const onClick = (event: MouseEvent): void => {
    if (!suppressNextClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressNextClick = false;
  };

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerEnd);
  element.addEventListener('pointercancel', onPointerEnd);
  element.addEventListener('lostpointercapture', onPointerEnd);
  element.addEventListener('click', onClick, true);

  return {
    destroy: (): void => {
      clearPress();
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerEnd);
      element.removeEventListener('pointercancel', onPointerEnd);
      element.removeEventListener('lostpointercapture', onPointerEnd);
      element.removeEventListener('click', onClick, true);
    },
  };
}
