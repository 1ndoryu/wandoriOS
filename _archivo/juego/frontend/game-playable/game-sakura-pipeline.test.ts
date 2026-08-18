import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createSakuraPipeline } from './game-sakura-pipeline';

function createFakeRenderer() {
  const targets: (THREE.RenderTarget | null)[] = [];
  const renders: string[] = [];
  return {
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    setRenderTarget: vi.fn((target: THREE.RenderTarget | null) => targets.push(target)),
    clear: vi.fn(),
    render: vi.fn(() => {
      renders.push(`render(${targets.length})`);
    }),
    targets,
    renders,
  };
}

describe('pipeline Sakura ink → grade → fxaa (138A-15)', () => {
  it('construye sin GL y arranca desactivado cuando ink y fxaa están off', () => {
    const renderer = createFakeRenderer();
    const pipeline = createSakuraPipeline(
      renderer,
      new THREE.Scene(),
      new THREE.PerspectiveCamera(60, 1, 0.25, 600),
    );
    pipeline.setEnabled({ ink: false, fxaa: false });
    expect(pipeline.active()).toBe(false);
    pipeline.render();
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('activo con fxaa: escena → rtScene → grade → fxaa → pantalla', () => {
    const renderer = createFakeRenderer();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.25, 600);
    const pipeline = createSakuraPipeline(renderer, scene, camera);
    pipeline.setEnabled({ ink: false, fxaa: true });
    expect(pipeline.active()).toBe(true);

    pipeline.render();
    /* setRenderTarget: rtScene → rtB (grade) → null (fxaa) → null (reset). */
    expect(renderer.setRenderTarget).toHaveBeenCalledTimes(4);
    expect(renderer.clear).toHaveBeenCalledTimes(1);
    expect(renderer.render).toHaveBeenCalledTimes(3);
  });

  it('con ink activa la cadena completa: escena → ink → grade → fxaa', () => {
    const renderer = createFakeRenderer();
    const pipeline = createSakuraPipeline(
      renderer,
      new THREE.Scene(),
      new THREE.PerspectiveCamera(60, 1, 0.25, 600),
    );
    pipeline.setEnabled({ ink: true, fxaa: true });
    pipeline.render();
    expect(renderer.render).toHaveBeenCalledTimes(4);
    /* rtScene, rtA (ink), rtB (grade), null (fxaa), null (reset). */
    expect(renderer.setRenderTarget).toHaveBeenCalledTimes(5);
  });

  it('setSize respeta el presupuesto de píxeles y fija pixelRatio 1', () => {
    const renderer = createFakeRenderer();
    const pipeline = createSakuraPipeline(
      renderer,
      new THREE.Scene(),
      new THREE.PerspectiveCamera(60, 1, 0.25, 600),
    );
    pipeline.setEnabled({ ink: true, fxaa: true });
    /* 1920×1080 a dpr 2 superaría 4.6 Mpx → escala ≈ sqrt(4.6e6/2.0736e6) ≈ 1.49. */
    pipeline.setSize(1920, 1080, 2);
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(1);
    expect(renderer.setSize).toHaveBeenCalledWith(1920, 1080, true);
  });

  it('dispose es idempotente y apaga el pipeline', () => {
    const renderer = createFakeRenderer();
    const pipeline = createSakuraPipeline(
      renderer,
      new THREE.Scene(),
      new THREE.PerspectiveCamera(60, 1, 0.25, 600),
    );
    pipeline.setEnabled({ ink: true, fxaa: true });
    expect(() => {
      pipeline.dispose();
      pipeline.dispose();
    }).not.toThrow();
    expect(pipeline.active()).toBe(false);
    pipeline.setSize(800, 600);
    pipeline.render();
    expect(renderer.render).not.toHaveBeenCalled();
  });
});
