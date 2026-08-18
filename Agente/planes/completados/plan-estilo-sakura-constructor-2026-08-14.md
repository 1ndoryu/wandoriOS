# Plan 138A-15 — Estilo Sakura Crossing aplicado al constructor (2026-08-14)

> **Estado:** COMPLETADO — 138A-15 cerrado el 14-ago (gate `npm run
> gate:check -- 138A-15` PASS, 61 archivos; `npx tsc --noEmit` limpio y
> suite game-playable 43 archivos / 306 tests PASS; suite completa con WIP
> ajeno 139/1025 → 1021 PASS, 4 fallos en tests ajenos 138A-14 fuera del
> commit; veredictos de `supervisor_reviewer` y `sentinel_inspector` en la
> completada del día). Validación visual del usuario en `/forest-playable`
> pendiente. Dependió del cierre documental 138A-13 (carpeta
> `Agente/documentacion/estilo-sakura-crossing/`, 9 MD) y del constructor
> actual (138A-4..14, rama `wandorius`).
> **Rama:** `wandorius` · **Gate:** `npm run gate:check -- 138A-15`
> **Fuente canónica de la técnica:** `Agente/documentacion/estilo-sakura-crossing/08-replicacion-constructor-wandorius.md`
> (gap analysis y pasos 1-6 con presupuestos). Código de referencia de solo
> lectura en `C:\tmp\sakura-crossing\src\core\` (`toon.js`, `post.js`,
> `outline.js`, `main.js`), clonado durante 138A-13 y fuera del repo.

## 1. Contexto y decisión del usuario (2026-08-14, noche)

El usuario probó que los assets actuales del constructor (`/forest-playable`)
no tienen el estilo anime/cel del juego de referencia
[Kenton-GMI/sakura-crossing](https://github.com/Kenton-GMI/sakura-crossing) y
pidió: *"necesito ver si puedo lograr forzar el estilo de ese juego y ver cómo
lo logra para replicarlo en un constructor de terrenos o mundos en JS"*.
138A-13 documentó el pipeline visual real del clon; este plan lo aplica.

**Decisión de producto (no revierte el roadmap 13-ago):** el Bosque mantiene
"Genshin-like low poly verde, sin tinta como destino". El estilo Sakura
Crossing se implementa como **preset conmutable y reversible** en el panel del
constructor (subpanel "Estilo"): `bosque` (default, comportamiento actual) ↔
`sakura`. Dentro de `sakura` la **tinta está apagada por defecto** (decisión
"sin tinta" vigente) y hay un toggle para activarla; las luces, sombras
teñidas, paleta pastel y color grading se aplican juntos.

## 2. Objetivo

El constructor de mundos JS de WANDORIUS aplica, sobre los assets existentes
sin rehacerlos, el look tipo Sakura Crossing: toon con tinte violeta en las
bandas oscuras, iluminación cálida/fría 2+1 con sombras PCF 2048 que siguen
al jugador, color grading split-tone (lineal→sRGB), paleta pastel y
outlines/tinta opcional. Todo conmutable en tiempo real, persistente,
reversible a `bosque` y dentro de los presupuestos de GPU del proyecto
(pipeline ≤4.6 Mpx, shadow map 2048, materiales compartidos por montaje,
teardown estricto).

## 3. Bloques y alcance

### 138A-15.1 — Datos puros del preset (sin Three/DOM)

- `frontend/src/features/game-core/world-palette.ts`: `WORLD_PALETTE_SAKURA`
  (13 claves, pastel teal/violeta según la tabla del doc 08).
- `frontend/src/features/desktop/apps/game-playable/game-sakura-preset.ts`:
  `VisualStyleKey ('bosque'|'sakura')`, `VISUAL_STYLES`,
  `isVisualStyleKey`/`normalizeVisualStyleKey` (fail-closed → `bosque`),
  `VisualStyleSettings {key, ink}`, `DEFAULT_VISUAL_STYLE`,
  `isVisualStyleSettings`/`normalizeVisualStyle`, `SAKURA_STYLE` (tinte
  `0x6c5f8c`, luces fill/bounce/hemi, rampa 4 bandas, ink default `false`,
  sombras) y `SAKURA_SKY` (SkyOptions pastel basado en `skyPresetOptions`).

### 138A-15.2 — Rampa con caché + tinte violeta compartido

- `game-sakura-toon.ts`: `gradientMap(bands)` con caché módulo-nivel
  (DataTexture RGBA, `NearestFilter`, `NoColorSpace`, sin mipmaps),
  `isCachedRamp(tex)`, `applyShadowTint(mat, uniform)` que **envuelve**
  el `onBeforeCompile` previo (bend) y compone su `customProgramCacheKey`,
  idempotente y con fallback seguro si three cambia el chunk; UN uniform
  compartido por escena (`0xffffff` bosque / `0x6c5f8c` sakura) que se muta
  en runtime sin recompilar.

### 138A-15.3 — Pipeline propio ink → grade → fxaa

- `game-sakura-pipeline.ts`: clase `SakuraPipeline` con `FullScreenQuad`
  casero (sin `three/addons`), RTs `rtScene` (HalfFloat + depthTexture),
  `rtA` (HalfFloat) y `rtB` (UnsignedByte), shaders INK/GRADE/FXAA del clon,
  `setSize` con presupuesto 4.6 Mpx, `setEnabled({ink, fxaa})`, `render()`,
  `dispose()` idempotente y constructor sin llamadas GL (jsdom seguro).
  Grade siempre activo mientras el pipeline existe (hace linear→sRGB);
  si `ink && fxaa` están apagados la escena renderiza directo.

### 138A-15.4 — Sombras y luces anime 2+1

- Comparador: `water.userData.noShadow = true`, método
  `setShadowCasting(enabled)` reaplicado tras cada rebuild (terreno cast+
  receive, props cast, pasto/agua sin sombras).
- Escena: sombras PCF 2048 sobre `skyDome.sun` (sigue al jugador en
  `render()`), luces `fill` (fría) y `bounce` (violeta) creadas `visible=false`
  siempre y encendidas solo en sakura; overrides de hemi (color/groundColor/
  intensity) reaplicados después de cada `skyDome.update` (skyDebounced y
  restore). Al revertir a bosque: `skyDome.update(bosque)` restaura,
  ocultar fill/bounce, `sun.castShadow=false`, `shadowMap.enabled=false`.

### 138A-15.5 — Paleta y cielo del preset

- Al activar `sakura`: paleta `WORLD_PALETTE_SAKURA`, cielo `SAKURA_SKY`,
  rampa `gradientMap(4)`, tinte `0x6c5f8c`, sombras+luces+hemi, y pipeline
  con `ink` según el toggle (default off).
- Al volver a `bosque`: restaurar paleta/cielo/rampa/tinte guardados
  (snapshot tomado al entrar en sakura), apagar sombras/pipeline.
- Persistencia: campo opcional `style?: VisualStyleSettings` en
  `ConstructorPersistedState` (fail-closed → bosque), validado con
  `isVisualStyleSettings`/`normalizeVisualStyle` en `loadConstructorState`.

### 138A-15.6 — UI y cableado

- `game-world-constructor.ts`: `onStyleChange` en controles, `style`/
  `commitStyle`/`syncStyle` en ctx (array `styleSyncers` independiente que
  sobrevive a `openPanel`) y `applyStyle` en la sección.
- `game-constructor-style.ts`: `buildStylePanel` (segment Bosque/Sakura con
  `createSegmentControl`, checkbox "Tinta" con clase `juegoPanelTerreno__check`
  y línea de estado).
- `game-curved-island-panel.ts`: registro condicional del subpanel `estilo`
  (icono Sparkles) solo si `controls.worldConstructor.onStyleChange` existe
  (protege el test de labels exactas) + `setConstructorStyle(style)`.
- `game-playable-scene.ts`: integración completa (uniform compartido,
  `applyVisualStyle`, restore, skyDebounced, resize/render/destroy,
  ownership de rampas cacheadas, sombras de figuras/entidades).

## Checklist

- [x] 138A-15.1 — `WORLD_PALETTE_SAKURA` + `game-sakura-preset.ts` (datos
      puros, fail-closed, `SAKURA_STYLE`/`SAKURA_SKY`).
- [x] 138A-15.2 — `game-sakura-toon.ts` (rampa con caché + tinte compartido).
- [x] 138A-15.3 — `game-sakura-pipeline.ts` (ink → grade → fxaa, ≤4.6 Mpx).
- [x] 138A-15.4 — `game-sakura-scene-effects.ts` (luces 2+1, sombras PCF
      2048 que siguen al jugador, revert a Bosque con snapshot).
- [x] 138A-15.5 — Paleta/cielo pastel aplicados en `apply()` y persistidos.
- [x] 138A-15.6 — Cableado en scene/panel: conmutable, reversible, tinta off
      por defecto y estilo restaurado al recargar.
- [x] Refactor de línea: helpers de pick/stats/rampa extraídos a módulos
      (`game-constructor-picking.ts`, `game-constructor-stats.ts`,
      `game-toon-ramp-loader.ts`) para mantener `game-playable-scene.ts` ≤900
      líneas efectivas (gate `limite-lineas-nivel-3`).
- [x] `npx tsc --noEmit` limpio y suite `game-playable` verde (43 archivos,
      306 tests).
- [ ] Gate `npm run gate:check -- 138A-15` PASS.
- [ ] Veredicto de `supervisor_reviewer` y `sentinel_inspector` registrado.
- [ ] Completada en `Agente/completados/tareas-2026-08-14.md` + roadmap con
      evidencia; commit selectivo por hunk (138A-14 ajeno sin tocar).
- [ ] Validación visual del usuario en `/forest-playable` (no abrir la app).

## 4. Presupuestos a mantener

- Pipeline: `pixelBudget` 4.6 Mpx con escala `max(1, sqrt(budget/(w*h)))`;
  `setPixelRatio(1)` solo con pipeline activo y restauración al salir.
- Shadow map: 2048 PCF (nunca 4096 sin medir con `game-renderer-metrics`).
- Materiales: compartidos por montaje (rampa caché módulo-nivel; las
  cacheadas NO se disponen; `applyToonRamp` respeta ownership).
- Draw calls/pases: 3 quads fullscreen como máximo, coste bajo.
- Teardown: `pipeline.dispose()` antes de `renderer.dispose()`/
  `forceContextLoss()`; destroy idempotente (tests de teardown existentes).

## 5. Fronteras y tests a respetar

- `game-core` sigue puro: solo la paleta (datos) entra en game-core; todo el
  estilo vive en `game-playable/`. No importar Three en game-core.
- `game-curved-island-panel.test.ts` espera labels exactas
  `['Terreno','Mundo/Estilo','Isla','Estilos']` con controles sin
  `onStyleChange` → registro condicional.
- `game-constructor-persistence.test.ts` (ajeno 138A-14) usa `toEqual`
  exacto y no pasa `style` → el campo solo aparece si es válido y guardado.
- `game-procedural-comparator.test.ts` fija `buildToonWaterPlane` 1× por
  montaje y `countLiving` estable tras regenerar → sombras solo por flags,
  nunca materiales por clic/regeneración.
- Teardown/lifecycle: pipeline sin GL en constructor y `dispose()` sin
  lanzar en jsdom (`game-sky.test.ts` ya ejercita Three sin WebGL).
- Tests nuevos: `game-sakura-preset.test.ts` (incluye persistencia del campo
  style con save/load `toEqual` exacto), `game-sakura-toon.test.ts`,
  `game-sakura-pipeline.test.ts` (fake renderer + stub `devicePixelRatio`).

## 6. Definition of Done

- Gate `npm run gate:check -- 138A-15` PASS (o fallo incremental documentado
  en `.quality-reports/` sin tapar, como hizo 138A-13).
- `npx tsc --noEmit` desde `frontend/` limpio y suite `game-playable` verde.
- Cambios ajenos 138A-14 preservados (commit selectivo por hunk contra
  `C:\tmp\ajeno-snap\`); nunca `git add .`.
- Preset conmutable/reversible en `/forest-playable`: sakura enciende
  tinte+luces+sombras+paleta+cielo+grade y bosque restaura; tinta off por
  defecto; recarga persiste el estilo.
- Roadmap/completada actualizados con evidencia; commit explícito; push solo
  con autorización; validación visual del usuario en `/forest-playable`
  (compilar y pedir que pruebe, no abrir la app).
- Veredictos de `supervisor_reviewer` y `sentinel_inspector` registrados.

## 7. Fuera de alcance

- No rehacer/retocar assets (la tesis del clon: el estilo vive en el
  pipeline; assets fotográficos quedan como nota de deuda).
- No hull outlines por objeto (paso 4 del doc 08) salvo decisión explícita
  del usuario de adoptar la tinta como dirección.
- No subir el shadow map a 4096, no multi-sampling extra ni cambios de
  `antialias` del renderer (no reconfigurable en runtime; FXAA lo cubre).
- No tocar `game-core` con Three/DOM/red.
