/* 138A-12 — Skydome procedural: ciclo de vida y presupuestos. Pruebas del
 * adaptador Three con jsdom (sin WebGL): montaje crea 1 mesh + 2 luces,
 * update sincroniza uniforms y luces sin duplicar recursos, y dispose
 * libera material/geometría y limpia la escena. */

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SKY_DEFAULTS, sunDirectionFromOptions } from '../../../game-core';
import { mountSkyDome, SKY_DOME_RADIUS } from './game-sky';
import { readRendererMetrics } from './game-renderer-metrics';

describe('skydome procedural (138A-12)', () => {
  it('monta 1 mesh + 2 luces sincronizadas y no duplica recursos al actualizar', () => {
    const scene = new THREE.Scene();
    const sky = mountSkyDome(scene, { ...SKY_DEFAULTS, sunEl: 38, sunAz: 150 });

    const meshes = scene.children.filter(child => child instanceof THREE.Mesh);
    const lights = scene.children.filter(child => child instanceof THREE.Light);
    expect(meshes).toHaveLength(1);
    expect(lights).toHaveLength(2);
    expect(meshes[0].geometry.boundingSphere?.radius ?? 0).toBeLessThanOrEqual(SKY_DOME_RADIUS);
    expect(meshes[0].frustumCulled).toBe(false);

    const material = meshes[0].material as THREE.ShaderMaterial;
    const uniforms = material.uniforms;
    expect(uniforms.uCoverage.value).toBe(SKY_DEFAULTS.coverage);
    expect((uniforms.uZenith.value as THREE.Color).getHex()).toBe(SKY_DEFAULTS.zenith);
    expect(uniforms.uL2On.value).toBe(1);

    /* La luz direccional apunta al vector solar y la hemisférica usa la
     * paleta del preset (mid/deep). */
    const direction = sunDirectionFromOptions(38, 150);
    expect(sky.sun.color.getHex()).toBe(SKY_DEFAULTS.sun);
    expect(sky.sun.position.x).toBeCloseTo(direction[0] * 160, 5);
    expect(sky.sun.position.y).toBeCloseTo(direction[1] * 160, 5);
    expect(sky.sun.position.z).toBeCloseTo(direction[2] * 160, 5);
    expect(sky.hemi.color.getHex()).toBe(SKY_DEFAULTS.mid);
    expect(sky.hemi.groundColor.getHex()).toBe(SKY_DEFAULTS.deep);

    /* Múltiples updates no añaden mesh/luces ni recrean material/geometría. */
    for (let i = 0; i < 5; i += 1) {
      sky.update({ ...SKY_DEFAULTS, preset: i % 2 === 0 ? 'day' : 'dusk', coverage: 0.2 + i * 0.1 });
    }
    expect(scene.children.filter(child => child instanceof THREE.Mesh)).toHaveLength(1);
    expect(scene.children.filter(child => child instanceof THREE.Light)).toHaveLength(2);
    expect(uniforms.uCoverage.value).toBeCloseTo(0.6, 5);
    expect((uniforms.uCMid.value as THREE.Color).getHex()).toBe(SKY_DEFAULTS.mid);

    /* Las métricas del renderer (info fake) reflejan la cúpula sin lanzar. */
    const metrics = readRendererMetrics({
      render: { calls: 4, triangles: 3_000 },
      memory: { geometries: 2, textures: 1 },
    });
    expect(metrics.rendererInfoAvailable).toBe(true);
    expect(metrics.drawCalls).toBe(4);

    sky.dispose();
    expect(scene.children.filter(child => child instanceof THREE.Mesh)).toHaveLength(0);
    expect(scene.children.filter(child => child instanceof THREE.Light)).toHaveLength(0);
    sky.dispose();
  });

  it('updateTime y followCamera mantienen la cúpula sobre la cámara', () => {
    const scene = new THREE.Scene();
    const cameraPosition = new THREE.Vector3(12, 5, -8);
    const sky = mountSkyDome(scene, SKY_DEFAULTS);

    sky.updateTime(2.5);
    const material = sky.mesh.material as THREE.ShaderMaterial;
    expect(material.uniforms.uTime.value).toBe(2.5);

    sky.followCamera(cameraPosition);
    expect(sky.mesh.position.equals(cameraPosition)).toBe(true);

    sky.dispose();
  });

  it('liberar el material y la geometría en dispose evita fugas GPU', () => {
    const scene = new THREE.Scene();
    const sky = mountSkyDome(scene, SKY_DEFAULTS);
    const material = sky.mesh.material as THREE.ShaderMaterial;
    const geometry = sky.mesh.geometry;
    const materialSpy = vi.spyOn(material, 'dispose');
    const geometrySpy = vi.spyOn(geometry, 'dispose');

    sky.dispose();
    expect(materialSpy).toHaveBeenCalledTimes(1);
    expect(geometrySpy).toHaveBeenCalledTimes(1);
    expect(scene.children).not.toContain(sky.mesh);
  });
});
