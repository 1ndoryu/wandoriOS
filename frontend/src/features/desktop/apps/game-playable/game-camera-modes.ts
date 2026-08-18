/* 138A-7 — Modos de cámara del toolkit (libre/primera/3ª persona).
 * Solo contratos y helpers puros (sin Three.js ni DOM): el posicionado y el
 * input de cámara viven en la escena. El atajo de teclado se registra con
 * `attachCameraModeShortcut` para poder desmontarse sin fugas. */

export type CameraMode = 'libre' | 'primera' | 'tercera';

export const CAMERA_MODES: readonly { readonly key: CameraMode; readonly label: string }[] = [
  { key: 'libre', label: 'Libre' },
  { key: 'primera', label: 'Primera' },
  { key: 'tercera', label: '3ª persona' },
];

export const DEFAULT_CAMERA_MODE: CameraMode = 'libre';

/** Tecla del atajo para alternar el modo (C no colisiona con WASD/arrows). */
export const CAMERA_CYCLE_KEY = 'c';

export function isCameraMode(value: unknown): value is CameraMode {
  return typeof value === 'string' && CAMERA_MODES.some(mode => mode.key === value);
}

/** Siguiente modo del ciclo: libre → primera → tercera → libre. */
export function cycleCameraMode(current: CameraMode): CameraMode {
  const index = CAMERA_MODES.findIndex(mode => mode.key === current);
  return CAMERA_MODES[(index + 1) % CAMERA_MODES.length].key;
}

/** El atajo solo dispara con la tecla correcta y cuando el foco no está en un
 *  campo editable (inputs/selects/textarea/contenteditable del panel). */
export function isCameraCycleEvent(event: KeyboardEvent): boolean {
  if (event.key.toLowerCase() !== CAMERA_CYCLE_KEY) return false;
  const target = event.target;
  if (target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement) {
    return false;
  }
  if (target instanceof HTMLElement) {
    /* `isContentEditable` cubre el hosting editable en navegadores reales
     * (incluidos ancestros); el atributo es el respaldo que jsdom sí expone
     * en los tests DOM. */
    const editableAttribute = target.getAttribute('contenteditable');
    const editableByAttribute = editableAttribute !== null
      && editableAttribute.toLowerCase() !== 'false';
    if (target.isContentEditable || editableByAttribute) return false;
  }
  return true;
}

/** Registra el atajo en `target` y devuelve el teardown; el ciclo calcula el
 *  modo siguiente a partir del actual en el momento de la tecla. */
export function attachCameraModeShortcut(
  getCurrent: () => CameraMode,
  onCycle: (next: CameraMode) => void,
  target: Window = window,
): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!isCameraCycleEvent(event)) return;
    event.preventDefault();
    onCycle(cycleCameraMode(getCurrent()));
  };
  target.addEventListener('keydown', onKeyDown);
  return () => target.removeEventListener('keydown', onKeyDown);
}
