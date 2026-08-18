/* GAME-01 — Interacciones de puntero del editor de mapa del Bosque.
 * [297A-64] Tool select: clic selecciona la instancia/spawn más cercano y
 * arrastre mueve el objetivo; [297A-66] pincel de superficie pinta al
 * arrastrar; [297A-67] pincel de altura pinta vértices compartidos;
 * [297A-69] tool terreno crea chunks planos bajo el cursor (fail-closed).
 * Módulo extraído de la vista para mantenerla <300 líneas; no toca el DOM
 * más allá del canvas que recibe. */

import {
  addSpawnPoint,
  moveInstance,
  moveSpawnPoint,
  paintSurface,
  placeInstance,
  select,
  type MapEditorState,
} from './game-map-editor-core';
import { paintHeight } from './game-map-editor-height';
import { addTerrainChunk, terrainChunkAt } from './game-map-editor-terrain';
import { fitTransform, screenToWorld } from './game-map-editor-canvas';

/** Referencia mutable al estado del editor compartida con la vista. */
export interface MapEditorStateRef {
  current: MapEditorState | null;
}

export interface MapEditorPointerHandlers {
  readonly onPointerDown: (event: PointerEvent) => void;
  readonly onPointerMove: (event: PointerEvent) => void;
  readonly onPointerUp: () => void;
  readonly destroy: () => void;
}

/** Convierte un evento de puntero sobre el canvas en coordenadas de mundo. */
function eventToWorld(event: PointerEvent, canvas: HTMLCanvasElement, state: MapEditorState): { x: number; z: number } {
  const rect = canvas.getBoundingClientRect();
  const bounds = state.document.terrain.bounds;
  const transform = fitTransform(bounds, canvas.width, canvas.height);
  return screenToWorld(event.clientX - rect.left, event.clientY - rect.top, transform);
}

/** Resuelve el objetivo bajo el cursor para la tool select (instancia o
 * spawn más cercano dentro del umbral). */
function nearestTarget(state: MapEditorState, world: { x: number; z: number }, threshold: number): { id: string; distance: number } | null {
  let nearest: { id: string; distance: number } | null = null;
  for (const instance of state.document.instances) {
    const distance = Math.hypot(instance.position.x - world.x, instance.position.z - world.z);
    if (distance < threshold && (!nearest || distance < nearest.distance)) nearest = { id: instance.id, distance };
  }
  for (const spawn of state.document.spawnPoints) {
    const distance = Math.hypot(spawn.position.x - world.x, spawn.position.z - world.z);
    if (distance < threshold && (!nearest || distance < nearest.distance)) nearest = { id: spawn.id, distance };
  }
  return nearest;
}

/** Conecta los listeners de puntero al canvas y devuelve handlers + teardown.
 * La vista aporta `stateRef` (lectura/escritura del estado) y `onChanged`
 * (redibujado tras cada mutación). */
export function bindMapEditorPointer(
  canvas: HTMLCanvasElement,
  stateRef: MapEditorStateRef,
  onChanged: () => void,
): MapEditorPointerHandlers {
  let dragTargetId: string | null = null;

  const onPointerDown = (event: PointerEvent): void => {
    const state = stateRef.current;
    if (!state) return;
    const world = eventToWorld(event, canvas, state);

    if (state.tool === 'place') {
      stateRef.current = placeInstance(state, world);
      onChanged();
      return;
    }
    if (state.tool === 'spawn') {
      stateRef.current = addSpawnPoint(state, world);
      onChanged();
      return;
    }
    /* [297A-66] Pincel: pintar la superficie de la celda bajo el cursor. */
    if (state.tool === 'paint') {
      stateRef.current = paintSurface(state, world, state.activeSurface);
      onChanged();
      return;
    }
    /* [297A-67] Pincel de altura: pintar el vértice de la malla bajo el cursor. */
    if (state.tool === 'height') {
      stateRef.current = paintHeight(state, world, state.activeHeight);
      onChanged();
      return;
    }
    /* [297A-69] Terreno: crear un chunk plano bajo el cursor (fail-closed si
     * ya existe, la cuota está agotada o el chunk no es contiguo). */
    if (state.tool === 'terrain') {
      stateRef.current = addTerrainChunk(state, terrainChunkAt(state.document, world));
      onChanged();
      return;
    }

    /* Tool select: clic selecciona la instancia/spawn más cercano. */
    const nearest = nearestTarget(state, world, 14);
    stateRef.current = select(state, nearest?.id ?? null);
    dragTargetId = nearest?.id ?? null;
    onChanged();
  };

  const onPointerMove = (event: PointerEvent): void => {
    const state = stateRef.current;
    if (!state) return;
    const world = eventToWorld(event, canvas, state);
    /* [297A-66] El pincel pinta al arrastrar (cada celda distinta commitea). */
    if (state.tool === 'paint') {
      stateRef.current = paintSurface(state, world, state.activeSurface);
      onChanged();
      return;
    }
    /* [297A-67] La altura también pinta al arrastrar sobre vértices. */
    if (state.tool === 'height') {
      stateRef.current = paintHeight(state, world, state.activeHeight);
      onChanged();
      return;
    }
    if (!dragTargetId) return;
    const isSpawn = state.document.spawnPoints.some((s) => s.id === dragTargetId);
    stateRef.current = isSpawn
      ? moveSpawnPoint(state, dragTargetId, world)
      : moveInstance(state, dragTargetId, world);
    onChanged();
  };

  const onPointerUp = (): void => { dragTargetId = null; };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    destroy: () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
    },
  };
}
