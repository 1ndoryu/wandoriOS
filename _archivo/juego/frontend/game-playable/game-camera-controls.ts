/* [138A-9] Control de cámara extraído de la escena jugable: vuelo libre
 * (WASD/arrows + Space/Shift), mirada de primera persona, rotación por
 * arrastre y límites del mundo. Son funciones puras sobre el estado que la
 * escena conserva (órbita, follow, niebla), así el refactor no cambia el
 * comportamiento ni el contrato de la escena.
 */
import * as THREE from 'three';

export interface FreeFlyKeys {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
}

export interface CameraLook {
  yaw: number;
  pitch: number;
}

export interface CameraBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/* [138A-7] Primera persona: altura de ojos y límites de inclinación. */
export const CAMERA_EYE_HEIGHT = 1.6;
export const CAMERA_PITCH_MIN = -1.2;
export const CAMERA_PITCH_MAX = 1.2;
/* [138A-7] Despeje mínimo del suelo para la 3ª persona. */
export const CAMERA_GROUND_CLEARANCE = 1.1;
/* [138A-9] Velocidad del vuelo libre (unidades/s). */
export const FREE_FLY_SPEED = 16;

export function createFreeFlyKeys(): FreeFlyKeys {
  return {
    forward: false,
    back: false,
    left: false,
    right: false,
    up: false,
    down: false,
  };
}

export function resetFreeFlyKeys(keys: FreeFlyKeys): void {
  keys.forward = false;
  keys.back = false;
  keys.left = false;
  keys.right = false;
  keys.up = false;
  keys.down = false;
}

/* [138A-9] Dirección de la mirada (yaw/pitch) compartida por primera persona
 * y vuelo libre: W aleja de la cámara en el plano X/Z. */
export function cameraDirection(look: CameraLook): THREE.Vector3 {
  return new THREE.Vector3(
    -Math.sin(look.yaw) * Math.cos(look.pitch),
    Math.sin(look.pitch),
    -Math.cos(look.yaw) * Math.cos(look.pitch),
  );
}

/* Acota un punto a los bounds del mundo dejando un margen para no pegarse al
 * borde visible del terreno. */
export function clampCameraTarget(
  target: THREE.Vector3,
  bounds: CameraBounds,
  margin = 4,
): THREE.Vector3 {
  return new THREE.Vector3(
    THREE.MathUtils.clamp(target.x, bounds.minX + margin, bounds.maxX - margin),
    target.y,
    THREE.MathUtils.clamp(target.z, bounds.minZ + margin, bounds.maxZ - margin),
  );
}

/* [138A-7][138A-9] Arrastre de mirada: en primera persona y vuelo libre el
 * puntero gira yaw/pitch en lugar de orbitar. */
export function rotateCameraLook(look: CameraLook, dx: number, dy: number): void {
  look.yaw -= dx * 0.008;
  look.pitch = THREE.MathUtils.clamp(look.pitch + dy * 0.008, CAMERA_PITCH_MIN, CAMERA_PITCH_MAX);
}

/* No disparar el vuelo libre cuando el foco está en controles del panel. */
export function isEditableTarget(event: KeyboardEvent): boolean {
  const target = event.target;
  if (target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement) {
    return true;
  }
  if (target instanceof HTMLElement) {
    const editableAttribute = target.getAttribute('contenteditable');
    return target.isContentEditable
      || (editableAttribute !== null && editableAttribute.toLowerCase() !== 'false');
  }
  return false;
}

/* Tecla de vuelo libre al presionar: devuelve true si la consumió para que el
 * llamador haga preventDefault (Space/arrows no deben hacer scroll). */
export function applyFreeFlyKeyDown(keys: FreeFlyKeys, event: KeyboardEvent): boolean {
  switch (event.code) {
    case 'KeyW':
    case 'ArrowUp':
      keys.forward = true;
      return true;
    case 'KeyS':
    case 'ArrowDown':
      keys.back = true;
      return true;
    case 'KeyA':
    case 'ArrowLeft':
      keys.left = true;
      return true;
    case 'KeyD':
    case 'ArrowRight':
      keys.right = true;
      return true;
    case 'Space':
      keys.up = true;
      return true;
    case 'ShiftLeft':
    case 'ShiftRight':
      keys.down = true;
      return true;
    default:
      return false;
  }
}

export function applyFreeFlyKeyUp(keys: FreeFlyKeys, event: KeyboardEvent): boolean {
  switch (event.code) {
    case 'KeyW':
    case 'ArrowUp':
      keys.forward = false;
      break;
    case 'KeyS':
    case 'ArrowDown':
      keys.back = false;
      break;
    case 'KeyA':
    case 'ArrowLeft':
      keys.left = false;
      break;
    case 'KeyD':
    case 'ArrowRight':
      keys.right = false;
      break;
    case 'Space':
      keys.up = false;
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      keys.down = false;
      break;
    default:
      return false;
  }
  return true;
}

/* [138A-9] Movimiento del vuelo libre: WASD/arrows en el plano horizontal de
 * la mirada, Space/Shift en vertical, y el resultado acotado a los bounds del
 * mundo. La cámara es su propio foco (no el jugador). */
export function updateFreeFlyCamera(
  keys: FreeFlyKeys,
  look: CameraLook,
  camera: THREE.PerspectiveCamera,
  cameraTarget: THREE.Vector3,
  dt: number,
  bounds: CameraBounds,
  speed = FREE_FLY_SPEED,
): void {
  const step = speed * dt;
  const forward = { x: -Math.sin(look.yaw), z: -Math.cos(look.yaw) };
  const right = { x: -forward.z, z: forward.x };
  let moveX = 0;
  let moveZ = 0;
  let moveY = 0;
  if (keys.forward) { moveX += forward.x; moveZ += forward.z; }
  if (keys.back) { moveX -= forward.x; moveZ -= forward.z; }
  if (keys.right) { moveX += right.x; moveZ += right.z; }
  if (keys.left) { moveX -= right.x; moveZ -= right.z; }
  if (keys.up) moveY += 1;
  if (keys.down) moveY -= 1;
  if (moveX !== 0 || moveZ !== 0) {
    const length = Math.hypot(moveX, moveZ);
    camera.position.x += (moveX / length) * step;
    camera.position.z += (moveZ / length) * step;
  }
  camera.position.y += moveY * step;
  camera.position.copy(clampCameraTarget(camera.position, bounds));
  cameraTarget.copy(camera.position).add(cameraDirection(look));
  camera.lookAt(cameraTarget);
}

/* [138A-7] Primera persona: la cámara se coloca en los ojos del personaje y
 * mira en la dirección de `look` (sin visualizar la figura). */
export function positionFirstPersonCamera(
  look: CameraLook,
  camera: THREE.PerspectiveCamera,
  position: { readonly x: number; readonly y: number; readonly z: number },
  eyeHeight = CAMERA_EYE_HEIGHT,
): void {
  const eye = new THREE.Vector3(position.x, position.y + eyeHeight, position.z);
  const dir = cameraDirection(look);
  camera.position.copy(eye);
  camera.lookAt(eye.add(dir));
}

/* [138A-11] Colisión de 3ª persona por segmento: en vez de muestrear solo el
 * punto de la cámara (que se hundía en colinas intermedias), se eleva la
 * cámara al máximo `suelo + despeje` del tramo jugador→cámara. Función pura:
 * el llamador inyecta `groundHeightAt` para que sea testeable sin escena. */
export function resolveThirdPersonCollision(
  camera: THREE.PerspectiveCamera,
  cameraTarget: THREE.Vector3,
  groundHeightAt: (x: number, z: number) => number,
  clearance = CAMERA_GROUND_CLEARANCE,
  samples = 8,
): void {
  let maxGround = -Infinity;
  for (let k = 0; k <= samples; k += 1) {
    const t = k / samples;
    const x = THREE.MathUtils.lerp(cameraTarget.x, camera.position.x, t);
    const z = THREE.MathUtils.lerp(cameraTarget.z, camera.position.z, t);
    maxGround = Math.max(maxGround, groundHeightAt(x, z));
  }
  camera.position.y = Math.max(camera.position.y, maxGround + clearance);
}
