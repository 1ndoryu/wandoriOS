# Plan — Terreno por bloques (Minecraft) del Bosque

> **ID:** 128A-1
> **Estado:** cerrado como experimento del toolkit 138A-1 (13-ago)
> **Objetivo:** sustituir el terreno temporal "Curved Island" (terrazas suaves + overhang) por un terreno por bloques estilo Minecraft: alturas enteras por bloque, isla ovalada rodeada de agua, árboles/rocas construidos con bloques, personaje a escala y bloque seleccionable, con panel temporal de configuración como la referencia.
> **Referencia visual:** `Agente/usuario/referencia-visual-curved-island-2026-08-12.md` (el panel y la cámara orbital se conservan; el terreno pasa a bloques).
> **Base actual:** `frontend/src/features/desktop/apps/game-playable/game-curved-island.ts` (monolítico), `game-world-bend.ts` (bending, se conserva), `game-playable-scene.ts` (wiring).

## Contexto y problema

El porte actual replica el estudio "Curved Island" con terrazas continuas (`LEVEL_Y = [0, 0.90, 1.35, 2.25]`), acantilados con overhang y props stubby-toon. El usuario pide un lenguaje de **bloques unitarios**:

1. **Árboles más grandes**: 4–6 bloques de alto, hojas hechas de bloques.
2. **Alturas por bloques** (tipo Minecraft): cada celda es un bloque de 1×1 seleccionable.
3. **Agua como límite del mapa**: isla con costa redondeada/irregular, no un cuadrado.
4. **Árboles y rocas por bloques**.
5. **Personaje de 1,5 bloques**.
6. **Panel temporal** para configurar curva del mundo, lluvia, props y regenerar la isla (como el `#panel` de la referencia).

Además, el módulo actual mezcla generación, meshing, agua, lluvia y teardown en un solo archivo; conviene separarlo en **datos puros + adaptador Three** (mismo patrón que `game-core/terrain-mesh.ts` y `GamePlayableVisualCache`) para que la base quede testeable y fácil de extender.

## Convenciones de escala y look

- **1 bloque = 1 unidad de mundo = `TILE = 1`.** El mundo se mide en bloques enteros.
- **Alturas enteras:** `level ∈ { -1 (océano), 0 (playa/arena, nivel del mar), 1..4 (hierba) }`. `MAX_LEVEL = 4`.
- **Mar:** superficie de agua en `y = 0`; fondo del océano en `y = -1` (los acantilados costeros bajan hasta -1 y quedan bajo el agua).
- **Bloque:** cubo 1×1×1. Cara superior = hierba/arena; caras laterales = tierra (hierba) o arena (playa), con AO suave en la base y jitter por bloque para que se lea "por bloques".
- **Árbol:** 4–6 bloques de alto total. Tronco de 1 bloque de ancho (2–4 bloques) + copa de hojas en bloques (3×3×2 sobre el tronco).
- **Roca:** 1–2 bloques grises.
- **Personaje:** ~1,5 bloques de alto (ver Fase 4).
- **Isla:** óvalo alargado que cubre con margen los bounds jugables del fixture (`x ∈ [-10, 22]`, `z ∈ [-8, 8]`, centro `(6, 0)`, 32×16), con **océano visible alrededor** y costa irregular por ruido.

## Refactor de la base (por qué)

Se divide el monolito en módulos de responsabilidad única (regla SOLID: 1 componente = 1 responsabilidad; límite < 300 líneas/archivo):

| Módulo (nuevo) | Responsabilidad | Pureza |
|---|---|---|
| `game-block-heightmap.ts` | Generación determinista de alturas enteras, relajación de caminabilidad (diff ≤ 1) y poda de islotes; lookup `cellAt(x, z)` y `levelAt(i, j)`. | Puro (sin THREE) |
| `game-block-palette.ts` | Colores del mundo (hierba, tierra, arena, tronco, hojas, roca, agua) y helpers `tint`. | Puro |
| `game-block-mesher.ts` | Datos de malla de bloques: caras top/side por bloque con colores/AO; `buildBlockTerrainMeshData` + `buildBlockPropsMeshData`. | Puro (arrays tipados) |
| `game-curved-island.ts` | Adaptador THREE delgado: monta geometrías desde los datos puros, agua toon, lluvia, highlight de selección, picking y handle de controles. | THREE |
| `game-curved-island-panel.ts` | Panel temporal DOM (curva del mundo, lluvia, props, regenerar) conectado al handle. | DOM |
| `game-world-bend.ts` | Se conserva sin cambios (bending + uniforms compartidos). | — |

Esto permite conectar el terreno a `MapVersion` después sin tocar el mesher, y testear altura/malla sin montar WebGL.

## Fases verificables

### Fase 1 — Heightmap por bloques + isla ovalada
- `generateBlockHeightmap(seed, width, depth, maxLevel)` con:
  - rejilla rectangular `NX × NZ` normalizada (`nx = (i-cx)/(NX·0.5)`, `nz = (j-cz)/(NZ·0.5)`) para que `d = sqrt(nx² + nz²)` sea una elipse que siga el aspecto 32×16.
  - `warp` con fbm para costa irregular; banda de playa (level 0) cerca de la costa; interior hasta `MAX_LEVEL`.
  - relajación (ningún vecino difiere en más de 1) y poda de islotes solitarios.
- Tests puros: oceano en las esquinas, playa continua en la costa, alturas dentro de `0..MAX`, `diff ≤ 1`, y que los 4 corners del rect jugable caigan en tierra con el seed fijo.
- **Salida:** nivel `h` entero por celda.

### Fase 2 — Mesher de bloques + terreno visible
- `buildBlockTerrainMeshData(levels)` emite:
  - cara superior 1×1 en `y = h` (hierba `h ≥ 1`, arena `h = 0`).
  - caras laterales solo donde el vecino es más bajo u océano, subdivididas **por bloque** (de `nh` o `-1` hasta `h`), con jitter de brillo por bloque y AO en la base.
- El adaptador monta el terreno con `MeshToonMaterial` + `gradientMap` y `bend.apply`.
- **Salida:** terreno por bloques visible, con océano alrededor (el plano de agua se amplía y se asienta en `y=0`).

### Fase 3 — Props por bloques (árboles 4–6 y rocas)
- `placeBlockProps(levels, seed)`: coloca árboles/rocas en celdas de hierba (`h ≥ 2`) con separación y jitter determinista.
- Árbol: tronco 1×1 de 2–4 bloques + copa de hojas 3×3×2 (bloques); roca: 1–2 bloques.
- `buildBlockPropsMeshData(props)` emite los cubos con colores por cara.
- Se expone `setPropsVisible(bool)` en el handle.

### Fase 4 — Personaje a 1,5 bloques
- En `createCurvedFigure` (forest-models.ts) sustituir el `scale.setScalar(1.8)` por una constante `FIGURE_BLOCKS = 1.5` derivada de la altura real de la cápsula (~1.18 unidades → escala ≈ 1.27).
- Verificar que el personaje no queda enterrado: el asentado ya usa `groundHeightAt`.

### Fase 5 — Bloque seleccionable (picking + highlight)
- Raycast del terreno/props en `pointermove` (sin interferir con el arrastre de órbita).
- `cellAt(x, z)` + capa de bloque desde el punto de intersección → highlight de caja 1×1×1 (`LineSegments` de `EdgesGeometry`) sobre el bloque apuntado.
- HUD en el panel: `bloque i,j · nivel h`.

### Fase 6 — Panel temporal de configuración
- `game-curved-island-panel.ts` replica el `#panel` de la referencia (colapsable):
  - **Curva del mundo:** sliders `curve down` (0..0.03) y `horizon pull` (0..0.016) → `bend.setCurvature`, presets `flat`/`cozy`/`marble`.
  - **Isla:** slider de lluvia (0..100%), checkbox "árboles y rocas", checkbox "cámara sigue", botón "crecer nueva isla" (regenera con seed nuevo).
  - `#stats` con el bloque apuntado.
- Se monta dentro de `sceneHost` (no en el chrome del OS) y se destruye en `destroy()`.

### Fase 7 — Verificación y cierre
- `type-check`, build, tests dirigidos (heightmap, mesher, props) y navegador `/forest-playable` (render sin errores de shader, árboles 4–6 bloques, personaje 1,5, panel operativo, isla rodeada de agua).
- Limpieza: retirar el código de terrazas/overhang obsoleto de `game-curved-island.ts`.

## Fuera de alcance

- Conectar el terreno a `MapVersion`/editor (se deja como tarea posterior; el override visual sigue sin alimentar colisión/simulación).
- Colisión por bloques: el personaje sigue moviéndose con los colliders planos del fixture; `groundHeightAt` solo asienta visualmente.
- Assets GLB definitivos, agua física o sistema de edición de bloques.

## Gate de salida

- [x] Terreno por bloques (alturas enteras, isla ovalada con agua como límite) visible en `/forest-playable`.
- [x] Árboles 4–6 bloques con hojas en bloques y rocas por bloques.
- [x] Personaje ~1,5 bloques.
- [x] Bloque seleccionable con highlight + coordenadas en el panel.
- [x] Panel temporal: curva del mundo, lluvia, props y regenerar isla operativos.
- [x] type-check, build y tests dirigidos verdes; navegador sin errores de shader.
- [x] `roadmap.md` actualizado (retirar esta entrada al cerrar) y evidencia en `Agente/completados/`.

## Definition of Done

- La base queda separada en datos puros (altura, malla, props) + adaptador Three, testeable sin WebGL y lista para conectarse a `MapVersion`.
- Ningún archivo nuevo supera ~300 líneas; se reutilizan `game-world-bend`, `createToonRamp` y el teardown existente.
- El aspecto por bloques cumple los 6 puntos del usuario y queda documentado para que el usuario lo ajuste después.
