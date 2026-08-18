import { describe, expect, it } from 'vitest';
import { rotateInputToWorld } from './camera-frame';

describe('rotateInputToWorld', () => {
  it('keeps forward as -Z when the camera looks from +Z (azimuth 0)', () => {
    const forward = rotateInputToWorld({ x: 0, z: -1 }, 0);
    expect(forward.x).toBeCloseTo(0);
    expect(forward.z).toBeCloseTo(-1);
    const right = rotateInputToWorld({ x: 1, z: 0 }, 0);
    expect(right.x).toBeCloseTo(1);
    expect(right.z).toBeCloseTo(0);
  });

  it('rotates forward away from the camera when it orbits 90° (azimuth = π/2)', () => {
    const forward = rotateInputToWorld({ x: 0, z: -1 }, Math.PI / 2);
    expect(forward.x).toBeCloseTo(-1);
    expect(forward.z).toBeCloseTo(0);
    const right = rotateInputToWorld({ x: 1, z: 0 }, Math.PI / 2);
    expect(right.x).toBeCloseTo(0);
    expect(right.z).toBeCloseTo(-1);
  });

  it('flips to +Z after a 180° orbit', () => {
    const forward = rotateInputToWorld({ x: 0, z: -1 }, Math.PI);
    expect(forward.x).toBeCloseTo(0);
    expect(forward.z).toBeCloseTo(1);
  });

  it('is length-preserving (normalizes nothing, rotates only)', () => {
    const diagonal = rotateInputToWorld({ x: 1, z: 1 }, 0.7);
    const length = Math.hypot(diagonal.x, diagonal.z);
    expect(length).toBeCloseTo(Math.hypot(1, 1));
  });

  it('sanitizes non-finite input to idle', () => {
    expect(rotateInputToWorld({ x: Number.NaN, z: 0 }, 1)).toEqual({ x: 0, z: 0 });
    expect(rotateInputToWorld({ x: 1, z: Number.POSITIVE_INFINITY }, 1)).toEqual({ x: 0, z: 0 });
  });

  it('treats a non-finite azimuth as an unrotated camera (fail-closed)', () => {
    expect(rotateInputToWorld({ x: 0, z: -1 }, Number.NaN)).toEqual({ x: 0, z: -1 });
  });
});
