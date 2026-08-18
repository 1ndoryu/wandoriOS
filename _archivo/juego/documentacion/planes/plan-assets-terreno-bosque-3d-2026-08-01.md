# Plan — Assets 3D y terreno 2D del Bosque

> **Epic:** GAME-01
> **Estado:** planificado; bloqueado por cierre de 018A-91 y confirmación de decisiones abiertas.
> **Arquitectura:** `Agente/documentacion/arquitectura/adr-bosque-3d-assets-terreno-2d-2026-08-01.md`.
> **Objetivo:** administrar modelos externos y crear un mapa 3D finito desde herramientas 2D simples, versionables y eficientes.

## Alcance y límites

### Incluido

- Programa admin `Assets 3D`: importar GLB, validar, previsualizar, configurar metadata/proxy, versionar y publicar.
- Programa admin `Editor de mapa`: pintar terreno en vista 2D, colocar instancias y abrir preview 3D.
- Recursos tipados y referencias visibles desde Finder sin duplicar binarios.
- Mapa finito, chunked y publicable como snapshot inmutable.
- Props estáticos y un perfil separado para personaje animado.

### Excluido

- Modelado, esculpido, UV, texturizado, rigging o edición de animación dentro del OS.
- Cuevas, voladizos, CSG, físicas complejas, vegetación procedural o mundo infinito.
- Marketplace de assets, colaboración simultánea o plugins de scripts/shaders.
- Optimización automática destructiva de modelos fuente.

## Flujo del autor

```text
Blender/otro DCC
  -> exportar GLB con preset del proyecto
  -> Assets 3D: importar privado
  -> análisis + preview + escala/pivot/proxy/categoría
  -> publicar GameAssetVersion
  -> Editor de mapa 2D: pintar terreno y colocar instancias
  -> preview 3D con el renderer real
  -> validar y publicar MapVersion
  -> salas nuevas fijan esa versión
```

## Tipos y estados

- `GameAsset`: identidad estable, nombre, categoría, procedencia y lifecycle.
- `GameAssetVersion`: GLB por hash, análisis, bounds, pivot, escala, materiales, animaciones, proxy y LODs opcionales.
- `TerrainDocument`: schemaVersion, bounds, cellSize, chunkSize, alturas, superficies y flags.
- `AssetInstance`: ID estable, assetVersionId, posición X/Z, rotación Y, escala allowlisted y terrainAnchor.
- `MapDraft`: terrain + instances + spawn/zones + expectedRevision.
- `MapVersion`: snapshot inmutable con manifiesto exacto.

Estados independientes: editorial, visibilidad y lifecycle. Todo nace draft/privado; una versión referenciada no se borra físicamente.

## Fase A — Cerrar decisiones y presupuestos

- [ ] Confirmar relieve inicial: alturas discretas recomendadas; excluir cuevas y voladizos.
- [ ] Confirmar cámara jugable: órbita limitada recomendada.
- [ ] Confirmar monocromo estricto o paleta restringida.
- [ ] Confirmar si el primer personaje necesita rig `idle/walk` o será rígido.
- [ ] Elegir un preset GLB único: Y-up, unidad en metros, origen/pivot y nombres.
- [ ] Medir el prototipo actual y fijar presupuestos provisionales por perfil, escena visible, chunk y dispositivo.
- [ ] Revisar SOLID: renderer, contratos de mapa, importación, storage y UI dependen de interfaces separadas.

**Gate:** decisiones registradas, fixture de referencia definido y presupuesto aprobado antes de importar modelos finales.

**Auditoría de cierre — Fase A:**
- [ ] **SOLID/arquitectura:** renderer, catálogo, editor, storage y contratos tienen responsabilidades separadas y una extensión prevista por adaptador.
- [ ] **Rendimiento/escalabilidad:** presets, perfiles de dispositivo, límites de mapa/asset y métricas base están definidos como hipótesis medibles, no como optimizaciones especulativas.
- [ ] **Seguridad/observabilidad:** procedencia/licencia, estados, permisos, eventos mínimos y política de retención están documentados antes de aceptar archivos.

## Fase B — Contratos y fixtures puros

- [x] Definir schemas versionados para asset, versión, terreno, instancia, spawn y mapa publicado en `frontend/src/features/game-core/map-version.ts`; `MapDraft` y persistencia siguen pendientes.
- [ ] Definir migración/rechazo por `schemaVersion` y límites hard server-side; frontend ya rechaza versiones/cuotas, pero falta duplicar la autoridad en backend.
- [ ] Implementar sampler determinista de altura/superficie compartible entre backend y frontend.
- [x] Definir chunks con bordes compartidos y serialización compacta mediante arrays planos; falta generar/cargar chunks visibles en runtime.
- [ ] Crear fixtures pequeños con dos chunks y superficie renderizada; el fixture actual valida un chunk lógico y proxies X/Z.
- [x] Cubrir bounds, tamaños, índices, transforms y referencias rotas con tests deterministas; fuzz/property tests quedan pendientes.
- [ ] Revisar SOLID/OCP: añadir una superficie o categoría no modifica parser/render base mediante `if` dispersos.

**Evidencia parcial:** `map-version.ts`, `map-version.test.ts` y el fixture
`FIXTURE_MAP_VERSION`. Type-check y build PASS; 41 tests del bloque/regresiones
PASS; navegador del fixture PASS sin errores de consola.

**Gate:** contratos frontend puros cerrados; no se considera completada la fase
hasta compartir el validador con backend, añadir sampler/dos chunks y completar
fuzz/property tests.

**Auditoría de cierre — Fase B:**
- [ ] **SOLID/OCP:** schema, parser, sampler, validadores y serializador son módulos independientes; una nueva superficie no modifica el núcleo por condicionales dispersos.
- [ ] **Rendimiento/escalabilidad:** chunks, índices, límites de bytes/celdas y migraciones tienen coste acotado, serialización compacta y pruebas de fuzz sin JSON monolítico.
- [ ] **Seguridad/contratos:** referencias, schemaVersion, bounds y tipos inválidos fallan en el boundary y dejan diagnósticos reproducibles.

## Fase C — Programa `Assets 3D`

- [ ] Registrar app lazy admin y recurso `gameAsset3d`; Finder solo guarda referencias.
- [ ] Subir GLB inicialmente privado mediante storage seguro y resultado explícito.
- [ ] Validar magic bytes, estructura, extensiones, URIs, conteos, texturas, animaciones y presupuesto.
- [ ] Mostrar preview 3D aislado con grid, bounds, escala, pivot, animaciones detectadas y errores.
- [ ] Configurar categoría, tags, proxy simple, terrainAnchor, material profile y LODs opcionales.
- [ ] Mostrar “usado por” antes de archivar y crear nueva versión al reemplazar el archivo.
- [ ] Generar/guardar thumbnail y análisis; nunca aceptar metadata del cliente como autoridad.
- [ ] Publicar versión inmutable con capacidad admin, auditoría y rollback.
- [ ] Probar GLB corrupto, enorme, URI externa, textura excesiva, extensión desconocida y versión en uso.
- [ ] Revisar SRP: uploader, analyzer, viewer, metadata form y version service separados.

**Gate:** un GLB válido pasa de privado a publicado; uno inseguro/pesado no puede alcanzar un mapa público.

**Auditoría de cierre — Fase C:**
- [ ] **SOLID:** uploader, analyzer, viewer, metadata, versionado y publicación tienen servicios separados y resultados explícitos.
- [ ] **Rendimiento/escalabilidad:** análisis y thumbnails no bloquean el shell; se miden peso, triángulos, materiales, texturas, memoria y coste de preview con varios assets.
- [ ] **Seguridad/operación:** magic bytes, URIs, límites, almacenamiento privado, auditoría, rollback y garbage collection diferido cubren casos corruptos, enormes y en uso.

## Fase D — Prototipo del `Editor de mapa` 2D

- [ ] Registrar app lazy admin separada del juego y del gestor de assets.
- [ ] Crear mapa finito con ancho/alto explícitos; expansión posterior es una operación admin validada.
- [ ] Renderizar vista cenital con cuadrícula, alturas y superficies distinguibles sin depender solo del color.
- [ ] Herramientas: seleccionar, pintar superficie, elevar, bajar, alisar, rellenar, agua, camino y borrar.
- [ ] Colocar assets desde catálogo con snap opcional, rotación Y, escala acotada y duplicado.
- [ ] Editar spawn points, zonas bloqueadas y propiedades allowlisted.
- [ ] Command stack para undo/redo; guardar al finalizar operación, nunca por `pointermove`.
- [ ] Abrir preview 3D reutilizando renderer/asset cache; no duplicar una segunda escena específica del editor.
- [ ] Teclado, foco, zoom/pan y equivalentes accesibles para comandos esenciales.
- [ ] Revisar límites de componente y separar tool state, document commands, viewport y persistence.

**Gate:** el admin crea un terreno pequeño, coloca tres assets, deshace, guarda, recarga y obtiene el mismo preview 3D.

**Auditoría de cierre — Fase D:**
- [ ] **SOLID/UX:** tool state, comandos, viewport, persistencia y preview son componentes separados; el editor reutiliza el renderer y comandos compartidos.
- [ ] **Rendimiento/escalabilidad:** pintar agrupa operaciones y guarda al finalizar, nunca por `pointermove`; undo/redo, zoom/pan y mapas mayores conservan coste acotado.
- [ ] **Accesibilidad/seguridad:** teclado, foco, equivalentes sin color, límites de selección/transforms y permisos admin tienen pruebas negativas y feedback visible.

## Fase E — Generación y runtime 3D

- [ ] Generar geometría de terreno por chunk con costuras deterministas y normales estables.
- [ ] Resolver altura del asset desde terrainAnchor; rechazar instancias fuera de bounds.
- [ ] Agrupar props repetidos en `InstancedMesh` por assetVersion/material/LOD.
- [ ] Cargar manifest del mapa y solo chunks/assets próximos; caché con reference counting.
- [ ] Frustum culling y límites visibles antes de implementar occlusion/LOD avanzado.
- [ ] Pausar background/minimizado y liberar geometrías, materiales, texturas, loaders y contexto al cerrar.
- [ ] Probar pérdida/restauración de contexto WebGL y fallback informativo.
- [ ] Revisar DIP: gameplay consume `WorldQuery`; no importa Three.js para consultar altura o colisión.

**Gate:** mapa fixture abre/cierra repetidamente, no carga todo el catálogo y cumple presupuesto medido en desktop/móvil.

**Auditoría de cierre — Fase E:**
- [ ] **SOLID/DIP:** `WorldQuery`, cache, chunk loader y renderer son sustituibles; gameplay no importa Three.js para reglas de altura/colisión.
- [ ] **Rendimiento/escalabilidad:** frame p50/p95, draw calls, triángulos, memoria GPU, chunks visibles, instancing, culling y carga móvil se comparan con el presupuesto.
- [ ] **Lifecycle/robustez:** background, minimizado, pérdida de contexto, cierre repetido y reference counting liberan recursos sin errores silenciosos.

## Fase F — Guardado, preview y publicación

- [ ] Borrador con revisión optimista, autosave por comando y conflicto visible.
- [ ] Validación server-side de terreno, referencias, transforms, proxies, spawn y presupuesto agregado.
- [ ] Preview aislado del borrador; nunca altera salas públicas.
- [ ] Publicación transaccional de MapVersion + manifiesto de AssetVersion exacto.
- [ ] Salas nuevas fijan versión; salas activas no cambian silenciosamente.
- [ ] Papelera/archivo con dependency check, restauración y garbage collection diferido.
- [ ] Auditoría de importación, cambios sensibles, publicación y rollback separada de analytics.
- [ ] Revisar escalabilidad: no N+1 al resolver assets; manifiestos/chunks se consultan por lote.

**Gate:** publicar y hacer rollback es atómico, reproducible y no rompe una sala activa.

**Auditoría de cierre — Fase F:**
- [ ] **SOLID/contratos:** draft, preview, validación, publicación, rollback y papelera tienen servicios y transacciones separadas.
- [ ] **Rendimiento/escalabilidad:** manifests/chunks/assets se resuelven por lote, sin N+1; autosave, conflictos y publicación mantienen límites de payload y concurrencia.
- [ ] **Seguridad/observabilidad:** capacidades, estados privados, dependency checks, audit de cambios sensibles y métricas de publicación/rollback son verificables.

## Fase G — Rendimiento y hardening

- [ ] Medir chunk JS Three.js, tiempo de carga, frame p50/p95, draw calls, triángulos, texturas y memoria GPU aproximada.
- [ ] Probar perfiles 320/390px, tablet y desktop con hardware objetivo razonable.
- [ ] Solo si la medición lo exige: LOD, Meshopt/Draco, KTX2 o worker; cada uno con fallback y tooling reproducible.
- [ ] Soak abrir/cerrar, cambiar mapa, perder contexto, background/foreground y liberar caches.
- [ ] Límites negativos/fuzz de GLB, terrain documents, transforms y manifests.
- [ ] Sentinel: reglas para import pesado eager, teardown WebGL ausente, GLB sin límite y mapa sin bounds.
- [ ] Revisar SOLID y tamaño de módulos; documentar cualquier excepción antes del gate.

**Gate:** presupuesto y seguridad evidenciados; optimizaciones añadidas responden a una métrica, no a especulación.

**Auditoría de cierre — Fase G:**
- [ ] **SOLID:** módulos y CSS están dentro de límites o tienen ADR de excepción; no se agregan reglas duplicadas en el proyecto cuando corresponden a Sentinel/VarSense.
- [ ] **Rendimiento/escalabilidad:** carga, soak, 320/390/tablet/desktop, memoria, background, mapas mayores y assets múltiples muestran tendencia y criterio de regresión.
- [ ] **Seguridad/operación:** fuzz/negativos, teardown, alertas, reporte de métricas, rollback y runbook están completos antes de habilitar mapas públicos.

## Presupuestos candidatos para medir, no contrato final

- Fixture inicial recomendado: 64×64 celdas, celda de 2 m y chunks de 16×16.
- Props repetidos: perfil low-poly estricto; landmarks y personajes usan perfiles separados.
- Texturas pequeñas y compartidas; ninguna textura se acepta sin límite de dimensiones/bytes.
- Objetivo de render: p95 ≤16,7 ms desktop/tablet; móvil puede usar un perfil explícito aprobado.
- El mapa publicado tiene máximos de celdas, instancias, materiales y bytes visibles.

Estos valores se fijan únicamente después de importar un árbol, una roca y un personaje reales del usuario.

## Definition of Done

- El usuario crea geometría fuera del OS y nunca necesita un editor 3D interno.
- Assets 3D explica dónde está cada recurso, su versión, estado, procedencia, peso y mapas consumidores.
- Editor 2D produce un terreno 3D determinista y finito con preview real.
- Runtime y servidor comparten el contrato lógico sin depender ambos de Three.js.
- Versiones, permisos, seguridad, rendimiento, teardown, pruebas y rollback tienen evidencia.
