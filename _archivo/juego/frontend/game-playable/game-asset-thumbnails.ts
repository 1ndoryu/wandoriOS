/* 138A-14 — Miniaturas 3D REALES del explorador de assets.
 * Renderiza el mismo mesher que pinta el documento (bloques: game-block-mesher;
 * suave: buildLowPolyVegetationMeshData) en un renderer offscreen compartido,
 * con cámara ortográfica isométrica, fondo transparente y SIN luces (los
 * meshers hornean vertex colors, así que MeshBasicMaterial basta). Lazy vía
 * requestIdleCallback para no tocar el frame loop del editor y caché por
 * asset+estilo+paleta. `disposeAssetThumbnails` libera renderer/cola/caché y
 * se invoca desde el destroy de la escena. Sin WebGL (jsdom/headless) el
 * panel conserva el glifo 2D de fallback. */

import * as THREE from 'three';
import {
  buildLowPolyVegetationMeshData,
  worldPaletteToVegetationPalette,
  type AssetCategory,
  type WorldPalette,
} from '../../../game-core';
import {
  buildBlockPropsMeshData,
  type BlockMeshData,
} from '../../../game-core/blocks/game-block-mesher';
import { toGeometry, toIndexedGeometry } from './game-procedural-geometry';

export interface AssetThumbnailRequest {
  readonly assetId: string;
  readonly category: AssetCategory;
  readonly style: 'bloques' | 'suave';
  readonly palette: WorldPalette;
}

/** Resultado de la miniatura: data URL PNG o null (sin WebGL / sin mesher). */
export type AssetThumbnailResult = string | null;

export type AssetThumbnailMeshData =
  | {
      readonly indexed: false;
      readonly positions: number[];
      readonly normals: number[];
      readonly colors: number[];
      readonly uvs?: number[];
    }
  | {
      readonly indexed: true;
      readonly positions: number[];
      readonly normals: number[];
      readonly colors: number[];
      readonly indices: number[];
    };

const THUMBNAIL_SIZE = 112; /* 2x de la miniatura CSS (56px) para nitidez. */
const THUMBNAIL_SEED = 7;
const CACHE_MAX_ENTRIES = 256;
/* [138A-14][revisor] Presupuesto de tiempo por idle callback: cada job
 * construye malla + render 112×112 y una cola grande no debe congelar el
 * frame loop del editor. Se procesa al menos un job por slice y se
 * reprograma el resto (vi.waitFor en tests tolera varias pasadas). */
const DRAIN_BUDGET_MS = 8;

/* [138A-14] Solo los assets con mesher real del documento tienen miniatura 3D:
 * árboles y rocas (bloques y suave). Agua/personajes/genéricos no se pintan
 * hoy en el documento (deuda documentada) y conservan el glifo 2D. */
export function hasRealAssetMesh(category: AssetCategory): boolean {
  return category === 'tree' || category === 'rock';
}

/** Clave de caché: asset + estilo + paleta completa (los colores horneados
 *  cambian la imagen aunque el asset y el estilo sean iguales). */
export function assetThumbnailKey(request: AssetThumbnailRequest): string {
  return `${request.assetId}|${request.style}|${JSON.stringify(request.palette)}`;
}

/** Datos puros de la malla del asset (misma gramática que el documento);
 *  null si el asset no tiene mesher real. Determinista por asset/estilo. */
export function buildAssetThumbnailMeshData(
  request: AssetThumbnailRequest,
): AssetThumbnailMeshData | null {
  if (!hasRealAssetMesh(request.category)) return null;
  const kind = request.category === 'tree' ? 'tree' : 'rock';
  if (request.style === 'bloques') {
    const data: BlockMeshData = buildBlockPropsMeshData(
      [{ kind, x: 0, z: 0, baseY: 0, seed: THUMBNAIL_SEED }],
      request.palette,
    );
    return {
      indexed: false,
      positions: data.positions,
      normals: data.normals,
      colors: data.colors,
      uvs: data.uvs,
    };
  }
  const data = buildLowPolyVegetationMeshData(
    [{ kind, x: 0, z: 0, y: 0, seed: THUMBNAIL_SEED, scale: 1 }],
    worldPaletteToVegetationPalette(request.palette),
  );
  return {
    indexed: true,
    positions: data.positions,
    normals: data.normals,
    colors: data.colors,
    indices: data.indices,
  };
}

interface ThumbnailJob {
  readonly request: AssetThumbnailRequest;
  readonly onReady: (result: AssetThumbnailResult) => void;
}

let thumbnailRenderer: THREE.WebGLRenderer | null = null;
let rendererFailed = false;
let thumbnailCache = new Map<string, string>();
let pendingJobs: ThumbnailJob[] = [];
let drainScheduled = false;
let drainHandle: number | null = null;
let disposed = false;

/** Pide la miniatura del asset; `onReady` recibe el data URL (caché: síncrono)
 *  o null si no hay WebGL/mesher. No bloquea el frame loop: la generación se
 *  encola y drena en un idle callback. */
export function requestAssetThumbnail(
  request: AssetThumbnailRequest,
  onReady: (result: AssetThumbnailResult) => void,
): void {
  if (disposed || !hasRealAssetMesh(request.category) || rendererFailed) {
    onReady(null);
    return;
  }
  const key = assetThumbnailKey(request);
  const cached = thumbnailCache.get(key);
  if (cached !== undefined) {
    onReady(cached);
    return;
  }
  pendingJobs.push({ request, onReady });
  scheduleDrain();
}

/** Teardown del servicio (escena destruida): libera el renderer y notifica a
 *  los pendientes con null. Reutilizable: un nuevo montaje vuelve a crear. */
export function disposeAssetThumbnails(): void {
  disposed = true;
  if (drainHandle !== null) {
    if (typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(drainHandle);
    } else {
      window.clearTimeout(drainHandle);
    }
    drainHandle = null;
  }
  drainScheduled = false;
  for (const job of pendingJobs) job.onReady(null);
  pendingJobs = [];
  thumbnailCache.clear();
  if (thumbnailRenderer) {
    thumbnailRenderer.dispose();
    thumbnailRenderer.forceContextLoss();
    thumbnailRenderer.domElement.remove();
    thumbnailRenderer = null;
  }
  rendererFailed = false;
  disposed = false;
}

function scheduleDrain(): void {
  if (drainScheduled || disposed) return;
  drainScheduled = true;
  const run = (): void => {
    drainScheduled = false;
    drainHandle = null;
    drainJobs();
  };
  if (typeof window.requestIdleCallback === 'function') {
    drainHandle = window.requestIdleCallback(run, { timeout: 1000 });
  } else {
    drainHandle = window.setTimeout(run, 0);
  }
}

function drainJobs(): void {
  if (pendingJobs.length === 0) return;
  const renderer = ensureThumbnailRenderer();
  if (disposed) {
    for (const job of pendingJobs) job.onReady(null);
    pendingJobs = [];
    return;
  }
  if (!renderer) {
    rendererFailed = true;
    for (const job of pendingJobs) job.onReady(null);
    pendingJobs = [];
    return;
  }
  const startedAt = performance.now();
  let processed = 0;
  while (pendingJobs.length > 0) {
    if (processed > 0 && performance.now() - startedAt >= DRAIN_BUDGET_MS) break;
    const job = pendingJobs.shift();
    if (!job) break;
    processed += 1;
    const dataUrl = renderAssetThumbnail(renderer, job.request);
    if (dataUrl === null) {
      job.onReady(null);
      continue;
    }
    const key = assetThumbnailKey(job.request);
    thumbnailCache.set(key, dataUrl);
    if (thumbnailCache.size > CACHE_MAX_ENTRIES) {
      /* Evicción FIFO simple: la paleta/estilo cambian poco y el límite solo
       * evita que una sesión larga con muchas paletas crezca sin cota. */
      const oldest = thumbnailCache.keys().next().value;
      if (oldest !== undefined) thumbnailCache.delete(oldest);
    }
    job.onReady(dataUrl);
  }
  if (pendingJobs.length > 0) scheduleDrain();
}

function ensureThumbnailRenderer(): THREE.WebGLRenderer | null {
  if (thumbnailRenderer) return thumbnailRenderer;
  if (rendererFailed) return null;
  try {
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, false);
    thumbnailRenderer = renderer;
    return renderer;
  } catch {
    /* Sin contexto WebGL (jsdom/headless/GPU bloqueada): fallback al glifo. */
    rendererFailed = true;
    return null;
  }
}

/** Renderiza UNA miniatura con escena efímera (cámara ortográfica isométrica,
 *  fondo transparente, sin luces) y devuelve el data URL PNG. */
function renderAssetThumbnail(
  renderer: THREE.WebGLRenderer,
  request: AssetThumbnailRequest,
): string | null {
  const data = buildAssetThumbnailMeshData(request);
  if (!data) return null;
  const geometry = data.indexed
    ? toIndexedGeometry(data)
    : toGeometry(data as BlockMeshData);
  const material = new THREE.MeshBasicMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geometry, material);
  const scene = new THREE.Scene();
  scene.add(mesh);

  const bounds = computeDataBounds(data);
  const size = new THREE.Vector3(
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  );
  const radius = Math.max(size.length() / 2, 0.01);
  const center = new THREE.Vector3(
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  );
  const distance = radius * 5;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, distance * 2 + 10);
  camera.position.copy(center).add(new THREE.Vector3(distance, distance, distance));
  camera.lookAt(center);
  /* Ajusta el zoom para que la esfera envolvente (y por tanto el modelo, en
   * cualquier orientación) quepa con margen en el frustum unitario. */
  camera.zoom = 1 / (radius * 1.6);
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL('image/png');
  geometry.dispose();
  material.dispose();
  return dataUrl.length > 0 ? dataUrl : null;
}

/** Caja envolvente de los datos puros (sin Three) para el encuadre isométrico. */
function computeDataBounds(data: AssetThumbnailMeshData): {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
} {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const positions = data.positions;
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[i + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  if (!Number.isFinite(min[0])) {
    return { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] };
  }
  return { min, max };
}
