import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  applyShadowTint,
  createShadowTintUniform,
  gradientMap,
  isCachedRamp,
  tintToonMaterials,
} from './game-sakura-toon';

describe('toon cel con tinte violeta (138A-15)', () => {
  it('gradientMap devuelve la misma textura cachead por clave', () => {
    const a = gradientMap(4);
    const b = gradientMap(4);
    expect(a).toBe(b);
    expect(gradientMap('soft')).not.toBe(a);
    expect(a.minFilter).toBe(THREE.NearestFilter);
    expect(a.magFilter).toBe(THREE.NearestFilter);
    expect(a.generateMipmaps).toBe(false);
    expect(a.colorSpace).toBe(THREE.NoColorSpace);
    expect(isCachedRamp(a)).toBe(true);
  });

  it('applyShadowTint es idempotente y envuelve onBeforeCompile previo', () => {
    const uniform = createShadowTintUniform(0x6c5f8c);
    const material = new THREE.MeshToonMaterial();
    const previous = vi.fn((shader: { fragmentShader: string }) => {
      shader.fragmentShader = shader.fragmentShader.replace('gl_FragColor', 'gl_FragColor');
    });
    material.onBeforeCompile = previous;
    material.customProgramCacheKey = () => 'bend-v1';

    applyShadowTint(material, uniform);
    applyShadowTint(material, uniform);

    expect(material.customProgramCacheKey!()).toBe('bend-v1|celTint_shared');
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      fragmentShader: '#include <lights_toon_pars_fragment>\ngl_FragColor = vec4(1.0);',
      vertexShader: '',
    };
    material.onBeforeCompile!(
      shader as Parameters<NonNullable<typeof material.onBeforeCompile>>[0],
      {} as THREE.WebGLRenderer,
    );
    expect(previous).toHaveBeenCalledTimes(1);
    expect(shader.uniforms.uShadowTint).toBe(uniform);
    expect(shader.fragmentShader).toContain('uniform vec3 uShadowTint');
    expect(shader.fragmentShader).toContain('mix( uShadowTint, vec3( 1.0 ), celBand )');
  });

  it('el uniform compartido se muta en runtime sin recompilar', () => {
    const uniform = createShadowTintUniform(0xffffff);
    expect(uniform.value.getHex()).toBe(0xffffff);
    uniform.value.setHex(0x6c5f8c);
    expect(uniform.value.getHex()).toBe(0x6c5f8c);
  });

  it('tintToonMaterials recorre la escena y colecciones extra', () => {
    const uniform = createShadowTintUniform(0x6c5f8c);
    const scene = new THREE.Scene();
    const a = new THREE.MeshToonMaterial();
    const b = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), a);
    mesh.add(new THREE.Mesh(new THREE.BoxGeometry(), b));
    scene.add(mesh);
    const extra = new THREE.MeshToonMaterial();
    tintToonMaterials(scene, uniform, [extra]);
    expect((a as THREE.MeshToonMaterial & { __shadowTintPatched?: boolean }).__shadowTintPatched)
      .toBe(true);
    expect((extra as THREE.MeshToonMaterial & { __shadowTintPatched?: boolean }).__shadowTintPatched)
      .toBe(true);
    expect((b as THREE.MeshBasicMaterial & { __shadowTintPatched?: boolean }).__shadowTintPatched)
      .toBeUndefined();
  });
});
