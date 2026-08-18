/* GAME-01 — Helpers geométricos del cache visual del fixture (constructor).
 * SRP: transformaciones de contornos, índice de material por superficie y
 * dispose recursivo de geometrías; sin estado ni ciclo de vida. */

import * as THREE from 'three';
import type { AssetInstance } from '../../../game-core';
import type { FixtureProp } from './game-fixture-map';

export function applyOutlineTransform(
  outline: THREE.Group,
  prop: FixtureProp,
  instance: AssetInstance,
): void {
  outline.position.set(
    instance.position.x,
    prop.kind === 'pond' ? 0 : 0.15,
    instance.position.z,
  );
  outline.rotation.y = instance.rotationY
    + (prop.kind === 'rock' ? (instance.scale - 1) * 0.8 : 0);
  const scale = instance.scale;
  outline.scale.set(
    prop.kind === 'pond' ? (prop.width ?? 1) * scale : scale,
    prop.kind === 'pond' ? (prop.depth ?? 1) * scale : scale,
    prop.kind === 'pond' ? 1 : scale,
  );
}

export function surfaceMaterialIndex(surface: number): number {
  return surface === 1 ? 1 : surface === 2 ? 2 : 0;
}

export function disposeObjectGeometries(object: THREE.Object3D): void {
  const disposed = new Set<THREE.BufferGeometry>();
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      if (disposed.has(child.geometry)) return;
      disposed.add(child.geometry);
      child.geometry.dispose();
    }
  });
}
