import { describe, expect, it } from 'vitest';
import { generateBlockHeightmap } from './game-block-heightmap';
import {
  buildBlockPropsMeshData,
  buildBlockTerrainMeshData,
  placeBlockProps,
} from './game-block-mesher';

const WIDTH = 48;
const DEPTH = 32;
const MAX_LEVEL = 4;
const SEED = 1337;

describe('buildBlockTerrainMeshData (bloques)', () => {
  it('emite arrays coherentes con caras superiores y laterales', () => {
    const h = generateBlockHeightmap(SEED, WIDTH, DEPTH, MAX_LEVEL);
    const mesh = buildBlockTerrainMeshData(h, SEED);

    expect(mesh.positions.length).toBeGreaterThan(0);
    expect(mesh.positions.length % 9).toBe(0); // 3 vértices × 3 componentes
    expect(mesh.normals.length).toBe(mesh.positions.length);
    expect(mesh.colors.length).toBe(mesh.positions.length);
    expect(mesh.uvs.length).toBe((mesh.positions.length / 3) * 2);

    let hasTop = false;
    let hasSide = false;
    for (let i = 0; i < mesh.normals.length; i += 3) {
      const nx = mesh.normals[i], ny = mesh.normals[i + 1], nz = mesh.normals[i + 2];
      if (nx === 0 && ny === 1 && nz === 0) hasTop = true;
      if (ny === 0 && (nx !== 0 || nz !== 0)) hasSide = true;
    }
    expect(hasTop).toBe(true);
    expect(hasSide).toBe(true);
  });
});

describe('placeBlockProps / buildBlockPropsMeshData (bloques)', () => {
  it('coloca props solo sobre hierba alta y emite cubos', () => {
    const h = generateBlockHeightmap(SEED, WIDTH, DEPTH, MAX_LEVEL);
    const props = placeBlockProps(h, SEED, 60);

    expect(props.length).toBeGreaterThan(0);
    for (const prop of props) {
      const i = Math.floor(prop.x + WIDTH / 2);
      const j = Math.floor(prop.z + DEPTH / 2);
      expect(h.levels[j * WIDTH + i]).toBeGreaterThanOrEqual(2);
    }

    const mesh = buildBlockPropsMeshData(props);
    expect(mesh.positions.length).toBeGreaterThan(0);
    expect(mesh.positions.length % 9).toBe(0);
    expect(mesh.normals.length).toBe(mesh.positions.length);
  });
});
