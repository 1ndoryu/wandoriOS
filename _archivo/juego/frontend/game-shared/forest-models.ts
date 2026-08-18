/* GAME-01 — Primitivas visuales compartidas por previews y fixture.
 * No contienen estado, input ni lógica de juego; solo construyen geometría
 * temporal de la dirección artística aprobada. */

import * as THREE from 'three';

export interface ForestMaterials {
  readonly ink: THREE.Material;
  readonly paper: THREE.Material;
  readonly pale: THREE.Material;
  readonly middle: THREE.Material;
  readonly water: THREE.Material;
  readonly lines: THREE.LineBasicMaterial;
}

function outlined(geometry: THREE.BufferGeometry, material: THREE.Material, lines: THREE.LineBasicMaterial): THREE.Group {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh, new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 18), lines));
  return group;
}

export function createConifer(materials: ForestMaterials, scale = 1): THREE.Group {
  const tree = new THREE.Group();
  const trunk = outlined(new THREE.CylinderGeometry(0.16, 0.24, 2.1, 5), materials.ink, materials.lines);
  trunk.position.y = 1.05;
  const lower = outlined(new THREE.ConeGeometry(1.25, 2.8, 7), materials.middle, materials.lines);
  lower.position.y = 2.4;
  const upper = outlined(new THREE.ConeGeometry(0.9, 2.4, 7), materials.paper, materials.lines);
  upper.position.y = 3.55;
  tree.add(trunk, lower, upper);
  tree.scale.setScalar(scale);
  return tree;
}

export function createBroadleaf(materials: ForestMaterials, scale = 1): THREE.Group {
  const tree = new THREE.Group();
  const trunk = outlined(new THREE.CylinderGeometry(0.2, 0.3, 2.3, 6), materials.ink, materials.lines);
  trunk.position.y = 1.15;
  const crown = outlined(new THREE.IcosahedronGeometry(1.25, 1), materials.paper, materials.lines);
  crown.position.y = 2.85;
  crown.scale.set(1, 1.25, 1);
  tree.add(trunk, crown);
  tree.scale.setScalar(scale);
  return tree;
}

export function createRock(materials: ForestMaterials, scale = 1): THREE.Group {
  const rock = outlined(new THREE.IcosahedronGeometry(0.65, 0), materials.middle, materials.lines);
  rock.scale.set(1.25 * scale, 0.65 * scale, scale);
  rock.position.y = 0.42 * scale;
  rock.rotation.y = scale * 0.8;
  return rock;
}

/* [297A-77] El tono del catálogo (ink/middle/paper) mapea directo a un
 * material compartido del escenario: cada jugador se ve con su personaje. Si
 * no hay tono, el remoto usa middle y el local ink (comportamiento previo). */
export function createFigure(
  materials: ForestMaterials,
  remote = false,
  tone?: string,
): THREE.Group {
  const figure = new THREE.Group();
  const toneKey = tone === 'ink' || tone === 'middle' || tone === 'paper' ? tone : null;
  const material = toneKey ? materials[toneKey] : remote ? materials.middle : materials.ink;
  const body = outlined(new THREE.CylinderGeometry(0.28, 0.38, 1.2, 6), material, materials.lines);
  body.position.y = 0.9;
  const head = outlined(new THREE.IcosahedronGeometry(0.34, 1), material, materials.lines);
  head.position.y = 1.72;
  figure.add(body, head);
  return figure;
}

export function createPond(materials: ForestMaterials, width: number, depth: number): THREE.Group {
  const pond = outlined(new THREE.CircleGeometry(1, 18), materials.water, materials.lines);
  pond.rotation.x = -Math.PI / 2;
  pond.scale.set(width, depth, 1);
  pond.position.y = 0.34;
  return pond;
}

/* ------------------------------------------------------------------
 * Estilo "Curved Island" (referencia: Agente/usuario/referencia-visual-
 * curved-island-2026-08-12.md). Replica el personaje cápsula y los props
 * stubby-toon del estudio. No reutilizan `outlined`: el look de la
 * referencia es toon suave sin contornos.
 * ------------------------------------------------------------------ */

export interface CurvedFigureMaterials {
  readonly body: THREE.Material;
  readonly bodyDark: THREE.Material;
  readonly belly: THREE.Material;
  readonly eye: THREE.Material;
  readonly cheek: THREE.Material;
}

export function createCurvedFigureMaterials(): CurvedFigureMaterials {
  return {
    body: new THREE.MeshToonMaterial({ color: 0x59c2e8, side: THREE.DoubleSide }),
    bodyDark: new THREE.MeshToonMaterial({ color: 0x3aa6cf, side: THREE.DoubleSide }),
    belly: new THREE.MeshToonMaterial({ color: 0xfff6e2, side: THREE.DoubleSide }),
    eye: new THREE.MeshToonMaterial({ color: 0x35434a }),
    cheek: new THREE.MeshToonMaterial({ color: 0xffb2a4, transparent: true, opacity: 0.85 }),
  };
}

/* Cápsula por LatheGeometry, igual que la referencia (r128) pero con el
 * constructor moderno de three. */
function capsuleGeometry(r: number, h: number, seg = 26): THREE.LatheGeometry {
  const points: THREE.Vector2[] = [];
  const cap = 8;
  for (let i = 0; i <= cap; i += 1) {
    const a = -Math.PI / 2 + (i / cap) * (Math.PI / 2);
    points.push(new THREE.Vector2(Math.cos(a) * r, -h / 2 + Math.sin(a) * r));
  }
  for (let i = 0; i <= cap; i += 1) {
    const a = (i / cap) * (Math.PI / 2);
    points.push(new THREE.Vector2(Math.cos(a) * r, h / 2 + Math.sin(a) * r));
  }
  return new THREE.LatheGeometry(points, seg);
}

/* [297A-77] Se conserva el contrato local/remote: el local lleva el cuerpo
 * celeste y el remoto el tono oscuro, para que ambos se distingan en el
 * snapshot. El mapeo fino de tonos del catálogo queda pendiente del ajuste
 * visual posterior del usuario. */
export function createCurvedFigure(
  figure: CurvedFigureMaterials,
  remote = false,
  _tone?: string,
): THREE.Group {
  const R_BODY = 0.30;
  const H_BODY = 0.52;
  const root = new THREE.Group();
  const body = new THREE.Group();

  const bodyMesh = new THREE.Mesh(capsuleGeometry(R_BODY, H_BODY), remote ? figure.bodyDark : figure.body);
  body.add(bodyMesh);

  const belly = new THREE.Mesh(
    new THREE.CylinderGeometry(R_BODY * 1.012, R_BODY * 1.012, 0.24, 26, 1, true),
    figure.belly,
  );
  belly.position.y = -0.06;
  body.add(belly);

  const eyeGeo = new THREE.SphereGeometry(0.052, 12, 10);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, figure.eye);
    eye.position.set(sx * 0.105, 0.20, 0.262);
    body.add(eye);
  }

  const cheekGeo = new THREE.CircleGeometry(0.05, 14);
  for (const sx of [-1, 1]) {
    const cheek = new THREE.Mesh(cheekGeo, figure.cheek);
    const a = sx * 0.56;
    cheek.position.set(Math.sin(a) * R_BODY * 1.02, 0.10, Math.cos(a) * R_BODY * 1.02);
    cheek.rotation.y = a;
    body.add(cheek);
  }

  const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 8), figure.bodyDark);
  tuft.position.set(0, R_BODY + H_BODY / 2 - 0.02, 0);
  tuft.rotation.z = 0.2;
  body.add(tuft);

  /* Pies en el origen del grupo; la escena lo eleva a su altura de piso. */
  body.position.y = R_BODY + H_BODY / 2;
  root.add(body);
  /* [128A-1] 1 bloque = 1 unidad: el personaje mide ~1,5 bloques. La cápsula
   * mide ~1,18 unidades (H_BODY + 2·R_BODY + penacho), así que 1,5/1,18 ≈ 1,27. */
  root.scale.setScalar(1.27);
  return root;
}

export function createCurvedTree(materials: ForestMaterials): THREE.Group {
  const tree = new THREE.Group();
  const s = 1.0;
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.20 * s, 0.62 * s, 0.20 * s), materials.ink);
  trunk.position.y = 0.31 * s;
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.95 * s, 0.44 * s, 0.95 * s), materials.paper);
  leaf.position.y = 0.72 * s;
  const crown = new THREE.Mesh(new THREE.BoxGeometry(0.66 * s, 0.38 * s, 0.66 * s), materials.paper);
  crown.position.y = 1.07 * s;
  tree.add(trunk, leaf, crown);
  return tree;
}

export function createCurvedRock(materials: ForestMaterials): THREE.Group {
  const rock = new THREE.Group();
  const s = 0.9;
  const main = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.75, s * 0.9), materials.middle);
  main.position.y = (s * 0.75) / 2;
  const side = new THREE.Mesh(new THREE.BoxGeometry(s * 0.5, s * 0.4, s * 0.5), materials.middle);
  side.position.set(s * 0.4, s * 0.2, -s * 0.2);
  rock.add(main, side);
  return rock;
}

export function createCurvedPond(materials: ForestMaterials): THREE.Group {
  const pond = new THREE.Group();
  const disk = new THREE.Mesh(new THREE.CircleGeometry(1, 18), materials.water);
  disk.rotation.x = -Math.PI / 2;
  disk.position.y = 0.02;
  pond.add(disk);
  return pond;
}
