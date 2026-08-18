/* GAME-01 — Dibujo del Editor de mapa 2D (canvas).
 * [297A-64] Transformaciones mundo↔pantalla y render top-down del borrador:
 * grid de terreno por cellSize, instancias como símbolos por categoría y
 * spawns con selección. [297A-66] Superficies pintadas: las celdas con valor
 * > 0 (agua) se sombrean bajo el grid para que el pincel sea visible.
 * Separado de la vista para mantener <300 líneas por módulo. */

import type { AssetCategory, Vector2 } from '../../../game-core';
import {
  TERRAIN_HEIGHT_MAX,
  type MapEditorState,
} from './game-map-editor-core';

export const CATEGORY_SYMBOL: Record<AssetCategory, string> = {
  terrain: '□',
  tree: '▲',
  rock: '●',
  water: '≈',
  character: '◍',
  generic: '◇',
};

export const CATEGORY_LABEL: Record<AssetCategory, string> = {
  terrain: 'terreno',
  tree: 'árbol',
  rock: 'roca',
  water: 'agua',
  character: 'personaje',
  generic: 'genérico',
};

export interface FitTransform {
  readonly scale: number;
  readonly originX: number;
  readonly originY: number;
}

/** Transform mundo → pantalla ajustado a bounds con margen y aspecto. */
export function fitTransform(
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  width: number,
  height: number,
): FitTransform {
  const margin = 24;
  const worldWidth = Math.max(bounds.maxX - bounds.minX, 1);
  const worldDepth = Math.max(bounds.maxZ - bounds.minZ, 1);
  const scale = Math.min((width - margin * 2) / worldWidth, (height - margin * 2) / worldDepth);
  const originX = (width - worldWidth * scale) / 2 - bounds.minX * scale;
  const originY = (height - worldDepth * scale) / 2 + bounds.maxZ * scale;
  return { scale, originX, originY };
}

export function worldToScreen(
  position: Vector2,
  transform: FitTransform,
): { x: number; y: number } {
  return { x: transform.originX + position.x * transform.scale, y: transform.originY - position.z * transform.scale };
}

export function screenToWorld(
  x: number,
  y: number,
  transform: FitTransform,
): Vector2 {
  return { x: (x - transform.originX) / transform.scale, z: (transform.originY - y) / transform.scale };
}

function isAllowedCategory(category: string): category is AssetCategory {
  return category === 'terrain' || category === 'tree' || category === 'rock'
    || category === 'water' || category === 'character' || category === 'generic';
}

export function categoryOf(assetId: string, state: MapEditorState): AssetCategory {
  const asset = state.document.assetManifest[assetId];
  return asset && isAllowedCategory(asset.category) ? asset.category : 'generic';
}

/** Render top-down del borrador sobre el canvas (DPR ya aplicado en tamaño). */
export function drawMap(canvas: HTMLCanvasElement, state: MapEditorState): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);

  const bounds = state.document.terrain.bounds;
  const transform = fitTransform(bounds, width, height);
  const cellSize = state.document.terrain.cellSize;
  const chunkSize = state.document.terrain.chunkSize;

  /* [297A-67] Altura pintada: sombreado gris por celda proporcional al
   * promedio de sus cuatro vértices, visible solo con la herramienta altura.
   * Se dibuja antes del grid para que el pincel se lea bajo la rejilla. */
  if (state.tool === 'height') {
    const vertexSide = chunkSize + 1;
    for (const chunk of state.document.terrain.chunks) {
      for (let cellIndex = 0; cellIndex < chunk.surfaces.length; cellIndex += 1) {
        const localX = cellIndex % chunkSize;
        const localZ = Math.floor(cellIndex / chunkSize);
        const topLeft = localZ * vertexSide + localX;
        const average = (
          chunk.heights[topLeft]
          + chunk.heights[topLeft + 1]
          + chunk.heights[topLeft + vertexSide]
          + chunk.heights[topLeft + vertexSide + 1]
        ) / 4;
        const shade = Math.round(255 - Math.min(1, average / TERRAIN_HEIGHT_MAX) * 90);
        const worldX = bounds.minX + (chunk.x * chunkSize + localX) * cellSize;
        const worldZ = bounds.minZ + (chunk.z * chunkSize + localZ) * cellSize;
        const topLeftScreen = worldToScreen({ x: worldX, z: worldZ + cellSize }, transform);
        const bottomRightScreen = worldToScreen({ x: worldX + cellSize, z: worldZ }, transform);
        context.fillStyle = `rgb(${shade},${shade},${shade})`;
        context.fillRect(topLeftScreen.x, topLeftScreen.y, bottomRightScreen.x - topLeftScreen.x, bottomRightScreen.y - topLeftScreen.y);
      }
    }
  }

  /* [297A-66] Superficies pintadas: por cada chunk, celdas con valor > 0 se
   * rellenan (agua ≈ sombreado) antes del grid para que el pincel sea visible
   * sin tapar instancias ni spawns. */
  for (const chunk of state.document.terrain.chunks) {
    for (let cellIndex = 0; cellIndex < chunk.surfaces.length; cellIndex += 1) {
      const surface = chunk.surfaces[cellIndex];
      if (surface <= 0) continue;
      const localX = cellIndex % chunkSize;
      const localZ = Math.floor(cellIndex / chunkSize);
      const worldX = bounds.minX + (chunk.x * chunkSize + localX) * cellSize;
      const worldZ = bounds.minZ + (chunk.z * chunkSize + localZ) * cellSize;
      const topLeft = worldToScreen({ x: worldX, z: worldZ + cellSize }, transform);
      const bottomRight = worldToScreen({ x: worldX + cellSize, z: worldZ }, transform);
      /* [297A-68] Camino (2) con tono propio: el runtime usa el material
       * medio para esa superficie, el editor lo refleja más oscuro. */
      context.fillStyle = surface === 1 ? '#d7d7d1' : surface === 2 ? '#c9c9c2' : '#e4e4df';
      context.fillRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    }
  }

  /* [297A-69] Celdas vacías (sin chunk) con la tool terreno: se sombrean
   * para mostrar dónde puede crearse un chunk contiguo sin reindexar. */
  if (state.tool === 'terrain') {
    const cellsX = Math.round((bounds.maxX - bounds.minX) / cellSize);
    const cellsZ = Math.round((bounds.maxZ - bounds.minZ) / cellSize);
    const hasChunk = (cx: number, cz: number): boolean => state.document.terrain.chunks
      .some((c) => c.x === cx && c.z === cz);
    for (let cz = 0; cz < cellsZ / chunkSize; cz += 1) {
      for (let cx = 0; cx < cellsX / chunkSize; cx += 1) {
        if (hasChunk(cx, cz)) continue;
        const worldX = bounds.minX + cx * chunkSize * cellSize;
        const worldZ = bounds.minZ + cz * chunkSize * cellSize;
        const topLeft = worldToScreen({ x: worldX, z: worldZ + chunkSize * cellSize }, transform);
        const bottomRight = worldToScreen({ x: worldX + chunkSize * cellSize, z: worldZ }, transform);
        context.fillStyle = 'rgba(0,0,0,0.06)';
        context.fillRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
      }
    }
  }

  /* Grid de terreno: celdas por cellSize con grilla fina. */
  context.strokeStyle = '#000000';
  context.lineWidth = 1;
  const startX = Math.floor(bounds.minX / cellSize) * cellSize;
  const startZ = Math.floor(bounds.minZ / cellSize) * cellSize;
  for (let x = startX; x <= bounds.maxX + cellSize; x += cellSize) {
    const top = worldToScreen({ x, z: bounds.maxZ }, transform);
    const bottom = worldToScreen({ x, z: bounds.minZ }, transform);
    context.beginPath();
    context.moveTo(top.x, top.y);
    context.lineTo(bottom.x, bottom.y);
    context.stroke();
  }
  for (let z = startZ; z <= bounds.maxZ + cellSize; z += cellSize) {
    const left = worldToScreen({ x: bounds.minX, z }, transform);
    const right = worldToScreen({ x: bounds.maxX, z }, transform);
    context.beginPath();
    context.moveTo(left.x, left.y);
    context.lineTo(right.x, right.y);
    context.stroke();
  }

  /* [297A-67] Puntos de vértice: con la herramienta altura se marcan los
   * vértices de la malla (los que pinta el pincel) para que la rejilla de
   * alturas sea visible aunque la celda sea plana. */
  if (state.tool === 'height') {
    const vertexSide = chunkSize + 1;
    context.fillStyle = '#000000';
    for (const chunk of state.document.terrain.chunks) {
      for (let localZ = 0; localZ < vertexSide; localZ += 1) {
        for (let localX = 0; localX < vertexSide; localX += 1) {
          const worldX = bounds.minX + (chunk.x * chunkSize + localX) * cellSize;
          const worldZ = bounds.minZ + (chunk.z * chunkSize + localZ) * cellSize;
          const screen = worldToScreen({ x: worldX, z: worldZ }, transform);
          context.fillRect(screen.x - 1, screen.y - 1, 2, 2);
        }
      }
    }
  }

  /* Borde del mundo. */
  const topLeft = worldToScreen({ x: bounds.minX, z: bounds.maxZ }, transform);
  const bottomRight = worldToScreen({ x: bounds.maxX, z: bounds.minZ }, transform);
  context.strokeStyle = '#000000';
  context.lineWidth = 2;
  context.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);

  /* Instancias: símbolo por categoría. */
  for (const instance of state.document.instances) {
    const screen = worldToScreen(instance.position, transform);
    const radius = Math.max(6, 14 * instance.scale);
    const selected = state.selectedId === instance.id;
    context.fillStyle = '#000000';
    context.font = `${radius}px 'JetBrains Mono', monospace`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(CATEGORY_SYMBOL[categoryOf(instance.assetVersionId, state)], screen.x, screen.y);
    if (selected) {
      context.strokeStyle = '#000000';
      context.lineWidth = 2;
      context.strokeRect(screen.x - radius - 4, screen.y - radius - 4, (radius + 4) * 2, (radius + 4) * 2);
    }
  }

  /* Spawns: círculo + cruz. */
  for (const spawn of state.document.spawnPoints) {
    const screen = worldToScreen(spawn.position, transform);
    const radius = Math.max(6, 14 * spawn.radius);
    const selected = state.selectedId === spawn.id;
    context.strokeStyle = '#000000';
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(screen.x - radius, screen.y);
    context.lineTo(screen.x + radius, screen.y);
    context.moveTo(screen.x, screen.y - radius);
    context.lineTo(screen.x, screen.y + radius);
    context.stroke();
    if (selected) {
      context.strokeStyle = '#000000';
      context.lineWidth = 2;
      context.strokeRect(screen.x - radius - 5, screen.y - radius - 5, (radius + 5) * 2, (radius + 5) * 2);
    }
  }
}

/** Ajusta el canvas al tamaño real del contenedor (DPR-aware). */
export function resizeCanvas(canvas: HTMLCanvasElement, host: HTMLElement): void {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(host.clientWidth, 1);
  const height = Math.max(host.clientHeight, 1);
  if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
  }
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
}
