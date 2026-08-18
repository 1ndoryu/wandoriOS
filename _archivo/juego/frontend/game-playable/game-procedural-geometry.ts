/* GAME-01 — Helpers de geometría compartidos entre la isla curva (128A-1) y
 * el comparador procedural (138A-1/138A-3): datos puros del toolkit →
 * BufferGeometry de Three. Solo presentación; sin estado. */

import * as THREE from 'three';
import type { BlockMeshData } from './game-block-mesher';

export function toGeometry(data: BlockMeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
  return g;
}

export function toIndexedGeometry(data: {
  readonly positions: Float32Array | readonly number[];
  readonly normals: Float32Array | readonly number[];
  readonly colors: Float32Array | readonly number[];
  readonly indices: Uint32Array | readonly number[];
  readonly uvs?: Float32Array | readonly number[];
}): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
  if (data.uvs) g.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
  /* El toolkit suave entrega índices como number[] (datos puros); Three exige
   * TypedArray en BufferAttribute, así que se normalizan aquí en el adaptador. */
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(data.indices), 1));
  return g;
}
