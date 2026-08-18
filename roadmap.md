# wandori.us — Roadmap

> **Producto:** blog, portfolio y tienda digital dentro de un OS retro minimalista.
> **Stack:** Rust/Axum + PostgreSQL + Vanilla TypeScript/Vite.
> **Deploy:** fuera de alcance hasta instrucción explícita; producción solo con Coolify Manager.
> **Epic:** 297A-4 — OS persistente, cuentas, programas y comercio.
> **Visual:** desktop/tablet y prototipo móvil aprobados; el chrome sigue monocromo, minimalista y con JetBrains Mono.

## Fuentes canónicas

- Índice: `Agente/documentacion/indice-documentacion-2026-07-29.md`
- Arquitectura: `Agente/documentacion/arquitectura/manual-arquitectura-wandorius-2026-07-29.md`
- Identidad: `Agente/documentacion/design-system/manual-identidad-visual-os-2026-07-29.md`
- Plan maestro: `Agente/planes/plan-escritorio-persistente-cuentas-admin-apps-2026-07-29.md`
- Plan móvil: `Agente/planes/plan-experiencia-movil-launcher-2026-07-29.md`
- Referencia visual del Bosque (Curved Island): `Agente/usuario/referencia-visual-curved-island-2026-08-12.md`
- Terreno por bloques (Minecraft) del Bosque: `Agente/planes/completados/plan-terreno-bloques-bosque-minecraft-2026-08-12.md`
- Toolkit de agua y lluvia del Bosque: `Agente/planes/completados/plan-toolkit-agua-lluvia-2026-08-13.md`
- Constructor de mundo del Bosque: `Agente/planes/completados/plan-constructor-mundo-2026-08-14.md`
- Constructor de mundo v2 (plan activo): `Agente/planes/plan-constructor-mundo-v2-toolkit-edicion-2026-08-14.md`
- Estilo Sakura Crossing en el constructor (cerrado): `Agente/planes/completados/plan-estilo-sakura-constructor-2026-08-14.md`
- Tema claro/oscuro: `Agente/planes/plan-modo-oscuro-os-2026-07-31.md`
- Juego bosque multijugador 3D: `Agente/planes/plan-juego-bosque-multijugador-2026-08-01.md`
- Assets y terreno del bosque 3D: `Agente/planes/plan-assets-terreno-bosque-3d-2026-08-01.md`
- ADR de renderer, assets y terreno: `Agente/documentacion/arquitectura/adr-bosque-3d-assets-terreno-2d-2026-08-01.md`
- Motor agnóstico para futuros juegos: `Agente/planes/plan-glory-render-motor-juegos-2026-08-01.md`
- ADR del repositorio `glory-render`: `Agente/documentacion/arquitectura/adr-glory-render-repositorio-agnostico-2026-08-01.md`
- Deep links: `Agente/planes/plan-deep-links-ventanas-2026-07-31.md`
- Apps editoriales: `Agente/planes/plan-programas-editoriales-2026-07-31.md`
- Interacción y medición: `Agente/planes/plan-contratos-interaccion-comandos-medicion-2026-07-29.md`

## Cómo leer este archivo

- Esta lista contiene únicamente trabajo pendiente. Las casillas no se duplican en otro bloque.
- El estado base implementado se resume abajo para conservar contexto sin convertir el roadmap en un historial.
- El detalle de cada entrega terminada vive en `Agente/completados/` y en los planes archivados.
- Una tarea solo se marca cuando tiene evidencia de código, pruebas, quality gate y, si es UI, navegador.
- El cierre normal usa `npm run gate:check -- {ID}`; `task:check` y `self-check` son compatibilidad temporal.

## Estado base implementado (resumen operativo)

- **Runtime y shell:** `MountedView` con `AbortSignal`/teardown, `AppRegistry`, `WindowManager`, `CommandRegistry`, `RouteAppAdapter`, taskbar reactivo, foco/z-index, drag y resize por bordes, atajos, analytics tipado y toolbar común. Las apps devuelven contenido; el shell crea el chrome.
- **Workspace:** release público inmutable + overlay personal, merge por ID/campo, tombstones, clipboard, undo, papelera, carpetas, Finder real, drag/drop, menús unificados, referencias por `resourceKind`, publicar/preview/rollback y organizador público aislado del workspace admin.
- **Recursos y programas:** envelope de recursos con estados editorial/visibilidad/lifecycle/comercio independientes, DTOs público/admin/upload, About como recurso, versiones de producto, biblioteca de media con soft delete/restore y editores lazy de artículos, proyectos y productos con autosave compartido.
- **Comercio:** Tienda, Checkout, Pedidos y Descargas son programas del OS; idempotencia de órdenes, webhook firmado, outbox deduplicado, entitlements y grants temporales. Precio, pago, entrega y autorización permanecen server-side.
- **Cuenta y preferencias:** sesión opaca en cookie HttpOnly, login dentro de Cuenta, recuperación hashada, rate limits, auditoría sin secretos, Cuenta como app singleton, preferencias/overlay remotos con revisión optimista y conflicto `local/remote` embebido en Cuenta. Admin no usa overlay personal.
- **Presentaciones:** desktop/tablet usa ventanas; móvil usa launcher y apps a pantalla completa con las mismas apps, comandos, permisos, rutas y analítica. La transición móvil↔tablet reinstancia de forma segura y conserva el recurso enfocado.
- **Tema e identidad:** modo claro/oscuro con tokens semánticos, botón único, persistencia local/remota, prevención de flash y evento `theme_changed`; Lucide oficial a 1px; botones, tabs, estados vacíos, labels, toolbar TipTap y franja inferior de acciones siguen recetas compartidas.
- **Persistencia y URLs:** sesión versionada de ventanas con restauración fail-closed, debounce/flush y stack móvil; deep links allowlisted, foco representado por la URL, `Copiar URL`, History API y eventos de navegación/foco. La restauración reconstruye acciones desde `MountedView`, nunca persiste DOM.
- **Layout de iconos:** escritorio usa `position` snap-grid; móvil usa `mobilePosition` con fallback `mobileOrder`; colisiones, reflow y Finder están separados por presentación. El grid del escritorio distribuye el espacio libre con `space-between`/center y el snap-grid replica esa distribución (`rowGapEffective`); al redimensionar, los iconos se recolocan a la última columna visible en vez de quedar cortados por `overflow: hidden`, y el highlight del drag queda alineado con la celda real (058A-1, 058A-2). El shell oculta cualquier nodo del workspace sin apertura posible: sin URL pública válida (`resolvePublicResourceTarget`), sin visor de imagen local fuera del Finder ni app con `refId` no aparecen en Finder, escritorio ni launcher móvil (`canOpenNodeFromShell`, 058A-3). La selección múltiple con el mouse es estilo Windows en escritorio y Finder: Ctrl/Cmd+clic alterna, Shift+clic extiende rango, banda de selección desde el fondo con feedback provisional (aditiva con Ctrl), drag de grupo con offset relativo, menú contextual y comandos multi (trash borra todos los targets; open/rename solo con selección simple); la banda se recorta al contenedor y previene el scroll durante el gesto (058A-4).
- **Contratos y seguridad:** OpenAPI `tags-split`, mutator compartido, clientes Orval por dominio y retiro del cliente manual; sin Bearer/JWT público, sin serving estático de uploads, sin DTOs internos ni storage keys en respuestas públicas.
- **Calidad y arquitectura:** quality gate incremental local/full CI con Sentinel + VarSense, cachés separadas, `test:changed`, suite frontend completa en CI, builds/budgets gzip, runbook Coolify y checkpoints SOLID/OCP/DIP/SRP documentados. El mínimo desbloqueante está cerrado: `quality:test` 31/31 y 24 reglas activas.
- **Correcciones recientes relevantes:** se resolvieron la ruta legacy `/admin`, visibilidad editorial de proyectos (018A-83), contratos de URL/autosave, select nativo, `createEl` para `textarea`, Reader TipTap, sincronización del Finder, iconos por registro único, rejilla compacta y bordes/flechas del tema oscuro. La carpeta vacía "Galería" se sustituyó por "Documentos" con subcarpetas por tipo y sync de media al workspace (018A-87): los archivos subidos aparecen en el Finder, se abren con visor, se retiran al moverlos a la papelera y se restauran. El menú contextual ahora funciona dentro de las carpetas con acciones de creación (nuevo artículo/proyecto/producto, subir archivo, nueva carpeta, pegar) y el clic en ítems del Finder y del escritorio muestra selección visual con los tokens del OS (018A-88). El clic derecho dentro de las carpetas responde en todo el alto del panel del Finder, no solo sobre los ítems (018A-89). El menú sobre una carpeta dentro del Finder ofrece gestión completa — Abrir, Renombrar, Cortar, Copiar, Pegar en y Eliminar con borrado seguro (confirmación + subárbol restaurable) y `Ctrl+V` con destino (018A-90); el crear permanece en el fondo. La restauración de sesión conserva el chrome inferior de las apps (`MountedView.actions`) validado visualmente en desktop y tablet sin duplicar ventanas ni alterar geometría/taskbar/URL (018A-69). El fallback local del prototipo Bosque/Bosque 3D evita que un release local anterior al registro oculte los accesos durante desarrollo, sin sobrescribir la organización del release ni activar apps en producción (018A-92); el 05-ago se retiraron los bocetos Bosque (game) y Bosque 3D (game-3d) del registro, del release y del código (dirección visual decidida) y solo queda la app jugable `game-playable` (GAME-01). Una carpeta vacía del Finder ya no muestra texto (el grid queda en blanco y el clic derecho sigue abriendo el menú) y la barra de ruta tiene botón "volver a la carpeta anterior" con historial de navegación, deshabilitado en la raíz (018A-91). El grid del Finder alinea sus iconos al inicio, igual que el grid del escritorio, en vez de centrarlos (018A-93). La selección del Finder ya no se refleja en el escritorio (y viceversa): el `selectionStore` se escala por superficie (`desktop`/`finder`) y cada una solo refleja su propia selección, sin romper copiar/cortar (018A-95). Los planes GAME-01 y de assets/terreno ahora exigen auditoría de SOLID, rendimiento, escalabilidad, seguridad, observabilidad y accesibilidad al cierre de cada fase, con evidencia antes de avanzar (018A-94). GAME-01 añadió el fixture `game-playable` lazy/full-bleed: movimiento offline con `game-core`, cámara limitada, teclado/D-pad, pausa background y teardown WebGL; type-check, 40 tests, build, diff-check y navegador en `/forest-playable` pasan. Después se añadió el contrato puro `MapVersion` con terreno por chunks, manifiesto de assets, instancias, spawns, cuotas fail-closed, adaptación a colliders X/Z y 41 tests; build/diff-check y navegador siguen verdes. Endpoint, validación server-side, persistencia, realtime, identidad, editor y mediciones repetidas de GPU/memoria siguen pendientes. Gobernanza del escritorio (038A-2): la Papelera y los nodos de sistema (`trash`, `admin`, `settings`, `profile`, `about`) no pueden eliminarse (guard backend en `validate_release_tree` + guards frontend `tombstoneNode`/`tombstoneSubtree`/`workspace:trash`), y el contenido publicado (artículos/medios ready/public/active) SIEMPRE se materializa en la release efectiva server-side (`find_public_content` + `materialize_content_nodes`, sin mutar la release) bajo Notas/Documentos, para cualquier versión activa y cualquier cliente — solo desaparece con eliminación real en BD; `ArticleService::update` sincroniza el envelope al publicar/despublicar, y el borrado de artículos es soft delete transaccional con papelera y restore (028A-12). Validado por stack (`cargo build`/`--tests` EXIT 0, frontend sin errores TS); gate diferido por submódulo `tools/sentinel` sucio del hilo 028A-6. Los detalles y gotchas permanecen archivados.

## Sentinel/quality — CANCELADO (2026-08-12)

> **Decisión del usuario:** no se continúa con el backlog de Sentinel/quality gate.
> Los 11 planes (`plan-*-sentinel*`, `plan-heavy-run-guard`, `plan-triage-alertas-quality`,
> `plan-mejora-quality-tool`, `plan-calidad-tooling`, `plan-ejecucion-auditoria-sentinel`,
> `plan-agilizar-ceremonia-cierre-calidad`, `plan-global-quality-guard-agnostico`) fueron marcados
> CANCELADOS y archivados en `Agente/planes/completados/`. `roadmap-sentinel.md` queda como historia cancelada.
> El gate ya implementado (`npm run gate:check`, `quality:test`, etc.) no se toca: sigue funcionando,
> simplemente deja de tener backlog pendiente.

## Decisiones de producto (2026-08-12)

- **Registro (297A-13):** registro público habilitado con verificación por email (Resend) + token de un solo uso.
- **Conflictos preferencias/overlay (297A-13):** merge por campo + LWW por campo en colisión real, con aviso no bloqueante.
- **MFA (297A-13/297A-17):** TOTP (códigos 6 dígitos, RFC 6238); passkey/WebAuthn queda como mejora posterior.
- **Correo transaccional (297A-13):** Resend real solo en producción; en local se mockea (token en log/almacén de dev).
- **Configuración (297A-29 Fase 4):** la app Configuración se convierte en el **panel de control**: fondo de pantalla, fuentes y escala (todo con default y restauración), config por usuario con la del admin como default, y ajustes de cuenta (nombre, foto de perfil, preferencias). Abierto a más ideas.
- **GAME-02 / 018A-96:** no hace falta segundo motor ni consumidor de conformidad; se hace un `game-core` limpio y agnóstico, bien planificado (sin repo separado/SemVer). El plan `plan-glory-render-motor-juegos-2026-08-01.md` queda simplificado por esta decisión.
- **GAME-01 visual:** réplica del aspecto "Curved Island" (estudio Three.js estilo New Horizons): mundo, personaje, agua, bending, lluvia y fog. Referencia exacta: `Agente/usuario/referencia-visual-curved-island-2026-08-12.md`. El usuario adaptará después los detalles.

## Decisiones de producto (2026-08-13)

- **Nuevo enfoque del Bosque (138A-1/138A-2):** construir primero
  **herramientas/motor propio** para iterar rápido en lugar de pulir el terreno
  por bloques como destino. El usuario decidirá low poly suave vs bloques
  **probando** con el toolkit, no por hipótesis. 128A-1 queda como
  **experimento reutilizable** dentro del toolkit; 138A-2 amplió el toolkit con
  árboles low-poly y césped por matas en el comparador.
- **Estilo visual:** Genshin-like, low poly verde stylized, cámara orbital
  libre; sin tinta como destino.
- **Sin distinción por color entre jugadores** y **sin indicadores** de estado
  (selección/colisión): nada extra en pantalla.
- **Mundo único compartido** con **cap 32 jugadores** (reafirma decisión "A").

## Pendientes ordenados

### 128A-1 — Terreno por bloques (Minecraft) del Bosque (cerrado como experimento, 13-ago)

**Fuente canónica:** `Agente/planes/completados/plan-terreno-bloques-bosque-minecraft-2026-08-12.md`.
Cerrado como experimento reutilizable dentro del toolkit 138A-1: su mesher/panel
se reutilizan como modo `bloques` del comparador; el estilo final lo decide el
usuario probando. Validado en navegador real (`/forest-playable`) tras corregir
la normalización de índices de la vegetación low-poly (TypedArray).

### 138A-3 — Toolkit de agua y lluvia + split de la isla curva (cerrado, 13-ago)

**Fuente canónica:** `Agente/planes/completados/plan-toolkit-agua-lluvia-2026-08-13.md`.
Amplió el toolkit procedural (138A-1/138A-2) con generadores puros de agua
(mesh indexado con phase de onda determinista) y lluvia (streaks deterministas
con presupuesto), saldó la deuda declarada por el revisor del cierre 128A-1
(dividir `game-curved-island.ts` de 399 líneas en `game-curved-water.ts` +
`game-curved-rain.ts`) y conectó el MISMO agua real (costa/espuma/niebla) a
ambos modos del comparador para probar el estilo 1:1 con la referencia Curved
Island. Gate `npm run gate:check -- 138A-3` PASS; type-check limpio y vitest
109 archivos / 780 tests como evidencia complementaria. Sin cambios de
backend/realtime/colisión.

**Corrección 13-ago (feedback del usuario):** tras probar en el navegador, el
shader de costa con olas y espuma se veía como una capa de triángulos encima
del agua, tanto en el comparador como en el modo "Actual" (isla curva). Los
tres modos (`Actual`/`Bloques`/`Suave`) quedaron con el MISMO agua toon plana
estática (`MeshToonMaterial` con rampa compartida). Corrección final en
`8684af12`: el plano se subdividió 32×32 y usa `polygonOffset` (−1,−1) +
`renderOrder=1`, porque con 1×1 el bend de mundo (dist²×down) solo doblaba las
4 esquinas y el interior interpolado quedaba decenas de unidades bajo el fondo
marino del modo Suave (agua invisible solo ahí). El plano toon es UN único
helper compartido (`game-toon-water.ts`) entre el comparador y la isla curva,
para que la configuración no vuelva a divergir; commits `3abb13c6`
(comparador), `0a5170f2` (isla/adaptador) y `8684af12` (subdivisión final). El
generador puro `buildWaterMeshData` sigue en `game-core` para futuras variantes
de oleaje.

### 138A-4 — Constructor de mundo del Bosque (cerrado, 14-ago)

**Fuente canónica:** `Agente/planes/completados/plan-constructor-mundo-2026-08-14.md`.
Primer constructor completo del Bosque: contrato puro `TerrainOptions`
(forma isla/continente/archipiélago/valle, seed, tamaño 16..128, altura, agua,
costa, warp, octaves, celda y densidad de vegetación), pipeline
`buildMapVersionFromOptions` → `MapVersion` válido (manifest, instancias,
spawns, fail-closed), export/import JSON, y sección "Constructor" en el panel
de `/forest-playable` que regenera el comparador (bloques/suave) sobre la
misma base. Gate `npm run gate:check -- 138A-4` PASS; type-check limpio y
vitest 30 archivos / 230 tests. Fase 4 (retoque fino con editor 2D) queda
como siguiente bloque. Sin backend/realtime/colisión.

### 138A-5..12 — Constructor de mundo v2: toolkit de edición (en curso, 14-ago)

**Fuente canónica:** `Agente/planes/plan-constructor-mundo-v2-toolkit-edicion-2026-08-14.md`
(activo, pendiente de aprobación). Planifica la lista completa del usuario
(tiempo real, panel lateral con iconos tipo Blender, 2 estilos, sin árboles en
suave, tamaño de bloques, persistencia, ventana lateral colapsable, transform
de objetos, 3 cámaras, editor de mapa por estilo, generador de pasto, paneles
de color/textura/assets, cielo procedural y dos auditorías) en 8 bloques con
gate propio:

- [x] **138A-5 — UI por iconos + tiempo real + persistencia local** (`localStorage`).
      Rail lateral tipo Blender (iconos Lucide con aria), subpanel único a la
      vez, regeneración con debounce de 200 ms que conserva el modo visible y
      restauración de opciones/modo desde `wandorius:constructor:v1`.
- [x] **138A-6 — Dos estilos (`bloques`/`suave`, se retira `actual`), sin árboles
      en suave, `cellSize` real en el preview y escala base menor (~0.5×).**
- [x] **138A-7 — Tres modos de cámara:** libre (orbital), primera persona
      (WASD + mouse look desde el jugador) y 3ª persona (sigue al personaje
      con colisión contra el terreno); selector en el panel y tecla `C`,
      persistido al recargar.
- [x] **138A-8 — Panel-ventana lateral** (alto total, sin título, colapsable a
      los lados, ancho redimensionable, cabecera vertical al ocultar) **+
      transform de objetos** (mover/colocar; sin editar modelos, eso es
      Blender) **+ paneles de Color, Textura y Assets** (con arrastrar/quitar).
- [x] **138A-9 — Editor de mapa por estilo:** suave (pinceles de pintar
      caminos, arena, agua y subir/bajar terreno) y bloques (colocar/quitar
      bloques y variantes); stack de capas serializable con visor tipo Blender
      (orden/ojo/duplicar/eliminar), cámara libre desacoplada, primera persona
      sin figura local y límites del MapVersion del constructor.
- [x] **138A-10 — Generador de pasto optimizado** (densidad/tamaño/color) con
      pincel de poner/quitar pasto. Pipeline puro por chunks
      (`grass-field.ts`, adaptación de GrassSystemThreeJS orientada a
      rendimiento: presupuestos ≤1024 chunks/≤10000 briznas fail-closed,
      máscara de vegetación add/remove como capa del stack, regeneración solo
      de la zona afectada, InstancedMesh por chunk en el comparador, panel
      Pasto y persistencia); teardown sin fugas y verificación visual del
      usuario pendiente.
- [x] **138A-11 — Auditorías SOLID/arquitectura y rendimiento con evidencia.**
      Informes en `Agente/documentacion/arquitectura/auditoria-solid-constructor-mundo-2026-08-14.md`
      y `auditoria-rendimiento-constructor-mundo-2026-08-14.md`. Fixes
      materiales: doble rebuild del pasto (una regeneración), cuota global de
      briznas por pasada filtrada, colisión de 3ª persona por segmento
      (jugador→cámara) y validación cruzada opciones↔mapa en el import.
      Benchmark reproducible: 25 mundos (48..256) a 15.8 ms de media; ciclo
      de vida GPU sin fugas (geometrías/materiales estables tras 8
      regeneraciones y escena vacía tras dispose). Deuda documentada
      (líneas de escena/paneles y límite de utils) queda ticketizada en el
      plan.
- [x] **138A-12 — Cielo procedural (skydome) y ambiente:** shader a pantalla
      completa con nubes pintadas por capas (cerca/lejos, cobertura, deriva),
      self-shadow y sol con glow, luces reales sincronizadas al vector solar
      y panel compacto de ajustes en vivo con presets (referencia de diseño
      incorporada). Contrato puro `SkyOptions` (30+ campos, límites,
      presets y validación fail-closed), `mountSkyDome` con teardown limpio,
      panel Cielo en el rail (presets, sol, nubes, movimiento/calima),
      persistencia `sky` y `camera.far` 120→500. Gate
      `npm run gate:check -- 138A-12` PASS (19 archivos; sentinel/varsense/
      frontend/docs verdes); suite 132 archivos / 975 tests; validación
      visual del usuario en `/forest-playable` pendiente.
- [x] **138A-14 — Fix de assets: remove persistente de instancias y
      miniaturas 3D reales.** Feedback del usuario (14-ago, noche) al probar
      el explorador: `inst-0 · asset-rock` reaparece al recargar (el remove
      debe persistir en el documento/JSON y la restauración no debe regenerar
      instancias eliminadas) y la previsualización debe mostrar el modelo 3D
      real del asset (render isométrico por asset, lazy/caché y teardown).
      Anotado en el plan v2 del constructor (§3, bloque 138A-14) e
      implementado: `RemovedInstancesStore` persiste los ids quitados y los
      reaplica sobre el mundo regenerado al recargar (descarta ids muertos)
      y miniaturas 3D reales offscreen con caché en `game-asset-thumbnails`.
      Auditoría
      completa del constructor en `Agente/documentacion/arquitectura/auditoria-constructor-completa-2026-08-14.md` (deuda
      ticketizada en §5). Gate `npm run gate:check -- 138A-14` PASS (13
      archivos alcance incremental; sentinel/varsense/frontend/docs verdes,
      solo 5 warnings sentinel de deuda conocida); suite 139 archivos / 1026
      tests; validación visual del usuario en `/forest-playable` pendiente.

**Gate/salida:** cada bloque con `npm run gate:check -- <ID>` PASS, type-check y
suite completa, validación visual del usuario en `/forest-playable` y
roadmap/completada actualizados; push con autorización.

### 138A-13 — Guía del estilo Sakura Crossing (cerrado, 14-ago)

**Fuente canónica:** `Agente/documentacion/estilo-sakura-crossing/` (carpeta
nueva, 9 MD). Investigación autorizada por el usuario ("necesito entender a la
perfección todo, con ejemplos código") sobre cómo el juego de referencia
[Kenton-GMI/sakura-crossing](https://github.com/Kenton-GMI/sakura-crossing)
logra su estilo anime/cel, para forzarlo sobre los assets existentes del
constructor de mundos JS (`/forest-playable`). Repo clonado de solo lectura en
`C:\tmp\sakura-crossing` (fuera del repo, no se commitea).

- [x] Análisis del pipeline visual real del clon (cel shading con tinte
      violeta, luces anime 2+1, outlines ink+hull, color grading split-tone,
      cielo pintado) con rutas y líneas exactas.
- [x] Guías con código real (GLSL/JS) por capa: materiales toon, paleta y
      texturas procedurales, iluminación y sombras, outlines, postprocesado y
      cielo.
- [x] Guía de replicación sobre el constructor actual de WANDORIUS: gap
      analysis (sin shadow map, sin postprocesado, sin tinte violeta), pasos
      concretos con archivos, presupuestos y tests/teardown a respetar.
- [x] Índice documental, completada y enlace desde el plan v2 actualizados.

**Nota de tensión:** el roadmap 13-ago decidió "Genshin-like low poly verde
stylized, **sin tinta como destino**" para el Bosque. Esta carpeta es
referencia/investigación: documenta cómo lograr el estilo tipo Sakura Crossing
por si el usuario decide probarlo, pero no cambia la decisión visual vigente
hasta que el usuario la revierta. Cierre: `npm run gate:check -- 138A-13
--profile docs` **PASS** (stack documental; sentinel PASS y docs PASS, 36
archivos). El gate incremental completo falla en la etapa `frontend` por 4
errores TS en código ajeno sin commitear de 138A-8..12 (constructor en
curso), documentados en la completada y en `.quality-reports/check/138A-13/`;
no se silencian ni se arreglan dentro de este bloque. `sentinel_inspector`:
**OK** (gate usado correctamente, fallo ajeno documentado sin tapar).
`supervisor_reviewer`: **APROBADO CON RESERVAS MENORES** (corregidas: cita
de `EffectComposer`/`PCFSoftShadowMap` → `FullScreenQuad`/`PCFShadowMap`, y
acotado "cero assets binarios visuales"). Commit explícito documental sin
push.

### 138A-15 — Estilo Sakura Crossing aplicado al constructor (cerrado, 14-ago)

**Fuente canónica:** `Agente/planes/completados/plan-estilo-sakura-constructor-2026-08-14.md`
(archivado) sobre la guía técnica 138A-13 (`08-replicacion-constructor-wandorius.md`).
El usuario pidió replicar en el constructor de mundos JS (`/forest-playable`)
el look anime/cel del juego de referencia. Se implementa como **preset
conmutable y reversible** en el panel (subpanel "Estilo", icono Sparkles):
`bosque` (default, comportamiento actual) ↔ `sakura` (tinte violeta en la
rampa toon, luces 2+1 con sombras PCF 2048 que siguen al jugador, color
grading split-tone, paleta pastel y cielo pastel; **tinta off por defecto**
con toggle, respetando la decisión "sin tinta" del 13-ago). Gate
`npm run gate:check -- 138A-15` PASS (corrida principal incremental 61
archivos y corrida final del fix P2 14 archivos; sentinel/varsense/
frontend/docs verdes, solo warnings de deuda conocida) y suite completa
**139 archivos / 1025 tests PASS** (verificada con 138A-14 ya integrado).
Incluye el fix del bug reportado por el usuario al probar el preset ("solo
colores, sin mundo"): los RT del pipeline nacían en 2×2 y nadie llamaba
`pipeline.setSize` al entrar en sakura, así que el quad fullscreen estiraba
un texel por toda la pantalla; `apply()` ahora dimensiona el pipeline con el
viewport real + DPR (cubierto con test). Revisión de cierre:
`supervisor_reviewer` **APROBADO** (P2 de estilos inline del canvas al
saldar sakura corregido en `e7f2818d`) y `sentinel_inspector` **OK**.
Validación visual del usuario en `/forest-playable` pendiente.

- [x] **138A-15.1 — Datos puros:** `WORLD_PALETTE_SAKURA` en game-core y
      `game-sakura-preset.ts` (`VisualStyleSettings`, normalización
      fail-closed y `SAKURA_SKY`).
- [x] **138A-15.2 — Rampa con caché + tinte compartido:** `game-sakura-toon.ts`
      (`gradientMap` con caché módulo-nivel, `applyShadowTint` que envuelve
      `onBeforeCompile`/cacheKey previos, uniform único por escena).
- [x] **138A-15.3 — Pipeline propio:** `game-sakura-pipeline.ts`
      (ink → grade → fxaa con FullScreenQuad casero, presupuesto 4.6 Mpx,
      sin GL en constructor, dispose idempotente).
- [x] **138A-15.4 — Sombras y luces:** comparador con `setShadowCasting`
      (agua `noShadow`), sol PCF 2048 que sigue al jugador + fill/bounce +
      overrides de hemi reaplicados tras cada `skyDome.update`.
- [x] **138A-15.5 — Paleta/cielo/persistencia:** snapshot reversible
      bosque↔sakura y campo opcional `style` en `ConstructorPersistedState`
      (fail-closed).
- [x] **138A-15.6 — UI y cableado:** `onStyleChange`/ctx/`applyStyle` en el
      constructor, subpanel "Estilo" condicional en el panel (protege test de
      labels) e integración en `game-playable-scene.ts`.

**Gate/salida:** preset conmutable/reversible con recarga persistente, type-
check y suite verdes, roadmap/completada actualizados y plan archivado;
validación visual del usuario en `/forest-playable` pendiente.

### 138A-16 — Coordinación entre agentes: auditar MD del área de trabajo y conducta-global (pendiente)

**Pendiente de investigación (no iniciar ahora):** auditar todos los MD del
área de trabajo (AGENTS.md de cada proyecto, skill `conducta-global` y demás
docs de coordinación) para corregir que los agentes trabajen de forma
correcta y coordinada — flujo `sentinel task claim/start/integrate/cleanup/
release` con worktree por tarea aplicado de forma consistente, sin pisarse en
el checkout compartido (incidente del 14-ago entre 138A-14 y 138A-15 en
`roadmap.md`/`Agente/completados/tareas-2026-08-14.md`).

- [ ] Auditar los MD del área de trabajo y `conducta-global`.
- [ ] Definir y automatizar la coordinación entre agentes (worktree + lock por tarea).

### 028A-5 — Novedades: popover de campana + admin "novedades" con borrado

**Depende de:** 297A-21 (notificaciones) y las recetas de popover/modal del OS.

- [x] La app `notifications` deja de ser una ventana: la campana (desktop y launcher móvil) abre un popover compacto de ~300px anclado, con lista de hasta ~40 avisos, scroll de ~260px, recargar, marcar todas y cierre por clic fuera/Escape.
- [x] El admin de novedades vive en la app Admin como tab "novedades": listado de avisos, modal "+ nuevo aviso" y cambio de estado con `createSelect`.
- [x] Borrado de avisos (incluidos los publicados) con confirmación; las lecturas se limpian en cascada (`ON DELETE CASCADE`).
- [x] El tag de estado muestra etiqueta en español (borrador/publicado/archivado) en una línea (`white-space: nowrap`).
- [x] Retiro del código legacy (`notifications-view.ts`, `notifications-admin.ts`) y de los estilos `.notificaciones`/`.notificacionesAdmin`.

**Gate/salida:** popover y tab "novedades" validados en navegador (crear, cambiar estado y borrar un aviso publicado); type-check, clippy y suite frontend verdes.

### Plan de gobernanza del workspace (028A-10..14)

**Fuente canónica:** `Agente/planes/plan-gobernanza-workspace-2026-08-02.md` (aprobado). Objetivo: dar al admin control real del escritorio desde la app Admin (release activo, validación, publicación) y garantizar coherencia para que nada borrado o en draft aparezca en la siguiente release.

- [x] **028A-10 — Release v3 con árbol canónico:** la migración `20260802010000_028a10_release_v3` publica v3 con `documentos` + 4 subcarpetas, `projects`, `profile`, `about`, `settings`, `admin`, `trash` (Papelera), `store`, `orders` y `downloads`; excluye `snake` (nodo fantasma) y `game/game3d/gamePlayable` (prototipos GAME-01 ocultados). Gate PASS: `task:check -- 028A-10` (sentinel/varsense/rust/frontend/custom), `GET /api/workspace/release` = v3 con 14 nodos, navegador desktop + launcher móvil muestran Papelera/Tienda/Pedidos/Descargas y la app Papelera renderiza vacía.
- [x] **028A-15 — Ejecutar los tests de integración del guard de publish (028A-11):** `cargo test --test workspace_publish` confirmado contra BD de rama: 4/4 PASS. Requirió corregir el fixture del test de summary (`publish_accepts_valid_tree_and_computes_summary`): [038A-2] exige el id canónico `about` del guard de sistema, pero el test pasaba `about-{uniq}` (el guard rechazaba el release con "El release debe contener el nodo de sistema 'about'"); `about` ya existe en la v1 sembrada, así que no entra en `added` y `nodeCount` es 7 (5 nodos de sistema + folder + recurso). El gate `task:check -- 028A-11` no pudo ejecutarse por el submódulo `tools/sentinel` sucio (otro hilo), mismo falso positivo conocido; la evidencia queda en los 4/4 tests HTTP contra PostgreSQL.
- [x] **028A-12 — Unificar el borrado de artículos (eliminar nodo fantasma):** soft delete transaccional (`trashed` + `deleted_at`, migración `20260805000000_028a12_article_soft_delete`), `GET /api/admin/articles/trashed` + `POST /api/admin/articles/{id}/restore`, sync del envelope `resources` (en `update_resource_metadata` con COALESCE y `soft_delete_kind_tx`/`restore_kind_tx`), evento `ArticleEditorSavedEvent.operation='deleted'` publicado al borrar desde el admin y tombstone del nodo (`removeArticleNode`) en `article-notas-sync.ts` + retiro directo del nodo al recibir el evento `deleted`. Test integral `tests/article_soft_delete.rs` (crear→borrar→papelera→envelope trashed→restore→active). Validado por stack (`cargo build`/`--tests` EXIT 0, frontend sin errores TS); gate diferido por submódulo `tools/sentinel` sucio (hilo 028A-6).
- [x] **028A-13 — Backend de gobernanza:** `GET /api/admin/workspace/control`, `POST /api/admin/workspace/releases/{version}/validate` (dry-run), `POST /api/admin/workspace/releases/{version}/activate`, DTO ligero de `list_releases`; OpenAPI/Orval + tests de permisos (AdminUser/CSRF). Migración `20260803000000_028a13_release_activation` (columna `is_active` + índice único parcial `idx_workspace_releases_active`). DTOs con `rename_all="camelCase"` (bug snake_case detectado y corregido al probar en vivo). Gate PASS `task:check -- 028A-13`. Verificado: validate/activate/control responden 200, activar v3 restaura la Papelera (14 nodos).
- [x] **028A-14 — Panel "Escritorio" en la app Admin:** estado actual (control), historial de versiones con badge activa/nodos/fecha, validar (dry-run con issues/brokenRefs en detalle), activar (con confirmación y guard de validez) y publicar (`publishWorkspace`); tab `escritorio` primero en la app Admin. Directory `frontend/src/pages/admin-workspace.ts` con patrón WeakMap + guard de generación. RESUELTO incidente observable: el panel detectó "sin versión activa" (mutación externa dejó v1..v5 inactivas), validó y activó v3 → `GET /api/workspace/release` volvió a servir v3 con 14 nodos incl. `trash`. Gate PASS: `task:check -- 028A-14` (30 archivos).

### GAME-01 — Bosque multijugador 3D dentro del OS (planificado, bloqueado)

**Depende de:** cerrar el bloque habilitado actual y sus gates de runtime, sesiones/capacidades, workspace, carga lazy y validación visual. Plan canónico: `Agente/planes/plan-juego-bosque-multijugador-2026-08-01.md`.

- [ ] Aprobar ADRs de identidad temporal, salas, contrato realtime, presupuesto y mapa versionado; el renderer Three.js, los assets GLB externos y el terreno lógico 2D ya tienen ADR aprobado.
- [ ] Implementar por fases: app lazy/Three.js, mapa finito por chunks, sala server-authoritative, presencia, personaje, `Assets 3D`, editor admin 2D y publicación.
- [ ] Mantener el objetivo de **un solo mundo/mapa compartido** (decisión del 05-ago; sustituye las salas de 8 y las salas bajo demanda): presupuesto de snapshot/fanout global, interés por proximidad y transición coordinada con aviso de reinicio al publicar (decisión 8).
- [ ] Validar teardown al cerrar, límites de mensajes/mapa/assets, permisos server-side, reconexión y rollback de versiones.
- [x] **297A-26 — Contrato frontend de MapVersion y fixture offline:** `game-core/map-version.ts` valida terreno por chunks, manifiesto de assets, instancias, spawns, bounds, transforms, referencias e IDs reservados; `game-playable` consume el adaptador `MapVersion → WorldMap`. Gate PASS: Sentinel/VarSense, type-check, 41 tests, build, diff-check y navegador `/forest-playable`. Backend, persistencia, endpoint, realtime, identidad, editor y mediciones GPU/memoria siguen pendientes.
- [x] **297A-27 — Contrato MapVersion compartido frontend/backend:** Rust añade `models::game_map::MapVersion` con JSON camelCase, `deny_unknown_fields`, proxy opcional, validación fail-closed de cuotas/bounds/chunks/referencias/transform/spawns y parseo acotado por bytes; frontend rechaza campos desconocidos en los mismos niveles. Gate PASS: `cargo fmt --check`, `cargo check`, 9 tests Rust, type-check, 23 tests frontend, build y diff-check PASS. No incluye endpoint, persistencia, publicación, realtime, identidad, editor ni límite de profundidad HTTP.
- [x] **297A-28 — Lectura pública persistida de MapVersion:** migración `game_map_versions`, snapshot JSONB inmutable con límite de tamaño, hash SHA-256, índice de una versión activa, repository/service/handler `GET /api/game/maps/:map_id` y envelope público sin campos administrativos. Gate PASS: Sentinel/VarSense, `cargo check`, 11 tests `models::game_map`, type-check, 23 tests frontend, build y diff-check.
- [x] **297A-30 — Publicación admin versionada de MapVersion:** `POST /api/admin/game/maps` con `AdminUser`/CSRF, `expectedVersion`, canonicalización/hash, advisory lock, activación atómica, límite de body de 4 MiB y request OpenAPI. Implementación cerrada y validada; sin realtime, identidad invitada ni editor.
- [x] **297A-31 — Fixture e integración real de publicación MapVersion:** `tests/game_map_publish.rs` cubre 401, admin/no-admin, CSRF, `mapId` incoherente, persistencia + GET público, 413, stale revision, segunda versión, concurrencia, una sola activa y trigger UPDATE/DELETE; migración incremental fija `published_by` como autoría inmutable con `ON DELETE RESTRICT`. Gate parcial: 7/7 tests PostgreSQL reales PASS, `cargo check --tests`, formato y diff-check PASS. Los snapshots de test quedan con IDs únicos por diseño inmutable; sin chunks visibles, realtime, identidad invitada ni editor.
- [x] **297A-32 — Selección visible y medición local del fixture:** `MapChunkCache` indexa instancias por chunk, calcula la ventana con bounds relativos, limita chunks/instancias/assets y aplica eviction LRU; `FramePerformanceMonitor` reporta p50/p95/max y frames sobre presupuesto. El renderer carga/retira props del fixture y libera geometrías al retirar objetos. Gate frontend PASS: type-check, 33 tests dirigidos, build y diff-check.
- [x] **297A-33 — Terreno visible por chunks y cache visual:** `buildTerrainMeshData` genera posiciones/índices/superficies puros y `GamePlayableVisualCache` materializa `BufferGeometry` solo para chunks visibles. Props repetidos reutilizan geometría/materiales mediante prototipos y `clone(true)`; teardown idempotente libera terreno y prototipos. Gate frontend PASS: type-check, 36 tests dirigidos, build y diff-check.
- [x] **297A-34 — Batching InstancedMesh y métricas locales del renderer:** props sólidos repetidos se agrupan por tipo en `THREE.InstancedMesh` con límite de 128 instancias, los contornos conservan la gramática visual y aplican la transformación real de `AssetInstance`. El fixture expone draw calls, triángulos, geometrías, texturas y heap JS opcional mediante `data-*`; 40 tests, type-check, build y diff-check PASS.
- [x] **297A-35 — Cache visual persistente y culling por batch:** el terreno visible se mantiene en un LRU visual de hasta 12 chunks, se retira de la escena sin destruirse durante evictions temporales y solo libera geometría al superar el límite; los `InstancedMesh` activan `frustumCulled` y actualizan `boundingSphere` tras cambiar matrices. 42 tests, type-check, build y diff-check PASS.
- [x] **297A-36 — Presupuesto local medible del renderer:** `evaluateGamePerformanceBudget` evalúa p95 de frame, draw calls, triángulos, geometrías, texturas y heap JS opcional con estados `pass`/`fail`/`unknown`; exige 30 muestras para frame, no trata `renderer.info` ausente como cero y publica únicamente `data-renderer-budget-*` locales. 17 tests dirigidos, type-check, build y diff-check PASS. No representa memoria GPU física ni abre realtime.
- [x] **297A-37 — Diagnóstico WebGL y pérdida de contexto:** `detectWebGL` prueba WebGL2/WebGL, libera el contexto temporal cuando existe `WEBGL_lose_context` y el fixture muestra fallback accesible antes de montar Three.js. El controller escucha `webglcontextlost` sobre el canvas real, detiene RAF y libera listeners/input/scene al cerrar. 23 tests dirigidos, type-check, build y diff-check PASS; no sustituye una medición física de GPU.
- [x] **297A-38 — Lazy loading y lifecycle repetido del fixture:** `AppRegistry.isLazy('game-playable')` verifica que el registro no resuelve la app pesada antes de instanciarla. Las pruebas cubren 12 abortos antes del montaje y 12 ciclos reales de mount/destroy con handles independientes, sin acumular input, escena ni RAF. 36 tests dirigidos, type-check, build y diff-check PASS. La evidencia es de carga/lifecycle lógico, no de memoria GPU física.- [x] **297A-39 — Contrato realtime v1 sin transporte:** `game-realtime.ts` y `models/game_realtime.rs` alinean envelope versionado, join con ticket opaco, intents por secuencia, heartbeat/ack, snapshots filtrados, errores allowlisted, límites de bytes/frecuencia y validación fail-closed. Se cubren campos desconocidos, UTF-8 inválido, Unicode por puntos de código, controles C0/C1/DEL, secuencias replay/jump, timestamps negativos, entidades duplicadas y posiciones finitas. Frontend: type-check, 26 tests dirigidos y build PASS; Rust: fmt, check y 8 tests PASS; no incluye upgrade WebSocket, identidad invitada, salas ni autoridad de movimiento.
- [x] **297A-40 — Ticket de juego firmado sin transporte:** `services/game_ticket.rs` emite y consume tickets `g1.game` ligados a UUID server-side, con HMAC, TTL por defecto de 30 s, máximo de 60 s, límite de 512 bytes, nonce y consumo single-use acotado a 4096 entradas. Tests cubren manipulación, secreto incorrecto, propósito, UUID, expiración, reloj inválido, replay, poda y token sobredimensionado. Rust: fmt/check y 7 tests del servicio PASS; no incluye endpoint HTTP, upgrade WebSocket, hub Glory, identidad invitada ni salas.
- [x] **297A-41 — Emisión HTTP autenticada del ticket:** `POST /api/game/ticket` usa `AuthUser` y CSRF, resuelve el subject UUID server-side mediante `GameTicketStore`, responde solo `{ ticket }`, mantiene el UUID fuera del token y falla cerrado si falta `GLORY_GAME_TICKET_SECRET`. Incluye configuración, OpenAPI, router con estado compartible y 3 pruebas HTTP reales en PostgreSQL temporal migrado; fmt/check, tests unitarios, integración HTTP, export OpenAPI y diff-check PASS. No incluye upgrade WebSocket, hub Glory, identidad invitada, salas ni autoridad de movimiento.
- [x] **297A-42 — Frontera de upgrade WebSocket del juego:** `/api/game/ws` acepta el upgrade sin ticket en query/cookie, exige `join` como primer mensaje, aplica límite global de conexiones, timeout de handshake de 5 s, validación del envelope realtime, consumo single-use del ticket opaco y cierre fail-closed. Una conexión autenticada aún recibe `map_unavailable` porque no existe actor/sala; no se reutiliza el hub Glory `i32`. Rust: fmt/check y tests dirigidos PASS; el handshake TCP real, actor de sala, snapshots y movimiento quedan pendientes.
- [x] **297A-43 — Prueba TCP real del upgrade WebSocket:** servidor Axum efímero en `127.0.0.1:0` y cliente `tokio-tungstenite` verifican upgrade real, `join` válido con `map_unavailable`, replay `unauthorized`, primer mensaje inválido `invalid_message`, cierre y capacidad global HTTP 409. Los recursos del servidor de test se apagan con graceful shutdown y `JoinHandle`; fmt/check, 4 tests TCP, tests dirigidos y diff-check PASS. No incluye actor de sala ni movimiento.
- [x] **297A-44 — Actor de sala server-authoritative:** `GameRoomState` crea una sala single-instance bajo demanda con cap 8, TTL configurable de sala vacía, actor Tokio de propietario único, backpressure bounded, teardown prioritario, mapa inmutable con hash verificado y spatial index con presupuesto de referencias. El handler enlaza tickets single-use con `joined`, snapshots filtrados por interés, heartbeat, intents `move` validados por secuencia/rate limit y cierre seguro; `GAME_MAP_ID` carga el snapshot publicado y los tests pueden inyectar un fixture válido. Gate técnico PASS: fmt/check, actor, handler, contrato realtime, 7 tests TCP, TTL/recreación, capacidad, colisión y diff-check.
- [x] **297A-45 — Cliente realtime autenticado del Bosque:** `game-playable` conserva fallback offline público y, para cuentas autenticadas, solicita ticket server-side, conecta `/api/game/ws`, envía intents/heartbeat, valida snapshots, interpola entidades, usa el `playerId` efímero del servidor para el avatar local y libera socket/timers/listeners al destruir la vista. Gate técnico PASS: type-check, 20 tests frontend, build y diff-check; la validación visual de navegador queda pendiente porque la automatización no produjo una sesión/pestaña válida. No incluye invitados ni reconexión persistente.
- [x] **297A-46 — Harness de medición realtime 1/4/8 clientes:** `tests/game_ws_benchmark.rs` levanta el router WebSocket real con fixture de mapa y reporta p50/p95 de `joined`/primer snapshot, snapshots, mensajes y bytes de payload por escenario. Gate PASS: con `CARGO_TARGET_DIR=C:/tmp/glory-target/game_ws_benchmark_check`, `cargo check --test game_ws_benchmark` y `cargo test --test game_ws_benchmark -- --ignored --nocapture` pasan; 1/4/8 clientes completan 1/1 test en 6.56 s. La monitorización externa observó pico de 56.34 MiB working set y 1.031 s de CPU acumulada; los bytes siguen siendo payload JSON, no tráfico físico. El harness continúa fuera de la suite normal y no sustituye una prueba distribuida.
- [x] **297A-47 — Identidad temporal de invitados:** `POST /api/game/ticket` acepta cuenta autenticada con sesión/CSRF o invitado temporal server-side. La cookie `guest_game` es opaca, HMAC, `HttpOnly`, `SameSite=Strict`, TTL 2 h y store acotado a 4096 identidades; el rate limit por IP devuelve 429 y una sesión inválida nunca degrada a invitado. El cliente `game-playable` usa el mismo realtime para cuenta/invitado. Gate técnico: `cargo fmt --check`, `cargo check --tests`, 9 tests unitarios, type-check y 8 tests frontend PASS; 2 pruebas HTTP de invitado PASS. La integración de cuenta queda pendiente de ejecutar contra BD de pruebas migrada.
- [x] **297A-48 — Perfil persistente de cuenta del juego:** `user_game_profiles` guarda únicamente el nombre visible allowlisted de cuentas autenticadas. `GET/PUT /api/game/profile` usa `AuthUser`, CSRF, JSON estricto, revisión optimista y UPSERT transaccional; invitados reciben 401 y el DTO no expone `user_id`. Gate técnico: `cargo fmt --check`, `cargo check --tests`, 4 tests HTTP PostgreSQL, 2 unitarios y `git diff --check` PASS; la integración dentro de `game-playable` y el catálogo de personajes quedan para el siguiente bloque.

- [ ] GAME-01 restante: (a) full CI `task:check --full` tras el cooldown del guard; (b) decisiones de producto del Bosque recopiladas en `Agente/documentacion/producto/decisiones-pendientes-bosque-2026-08-05.md` — las 9 decisiones quedaron confirmadas el 05-ago y la **dirección visual se implementó** (commit `e9d7e09d`): paleta verde stylized tipo Genshin + cielo en runtime y preview del editor, cámara orbital libre (drag + rueda/pinch) con niebla y radio de streaming adaptativos, controles táctiles solo en móvil y fix `100dvh` móvil; gate 297A-77 PASS, 688/688 tests frontend y validación en navegador (píxeles verdes, drag gira la cámara, D-pad solo <768px); falta solo la aprobación artística final del usuario; (c) ADR de presupuesto con medición en entorno dedicado/distribuido y validación multi-viewport/320px — la validación visual del fixture quedó cerrada el 05-ago (backend actualizado en localhost:3000, `/forest-playable` con WebGL2, GPU detectada y personaje `forest-scout`); los checklists del plan y el DoD quedaron actualizados con evidencia (18 casillas restantes, todas decisión/entorno externo o Fase 9). La presencia avanzada queda cerrada por `297A-77` (fix de resync tras reconexión y `characterId` en el snapshot realtime con tono por personaje en remotos y local). Las Fases 4 y 8 quedan cerradas por `297A-74` (culling avanzado por distancia, batching por materiales y probe físico de GPU/memoria) y `297A-75` (dos salas concurrentes, métricas agregadas `GET /api/game/metrics` y runbook de rollback). La reclamación invitado→cuenta queda cerrada por `297A-76` (revocación server-side de la identidad temporal + limpieza de la cookie `guest_game` en login/logout; nada se transfiere, el perfil de la cuenta aplica). `297A-72` añade Assets 3D (backend): `game_asset_versions` inmutables por hash (content-addressed bajo `upload_dir/assets/{hash}.glb`), importación de GLB vía multipart con validación de magic/versión/tamaño (16 MiB), numeración secuencial, metadata allowlisted (proxy circle/aabb + scale 0.1..4) editable solo en versiones inactivas, activación única (desactiva las demás y congela la versión por trigger), contrato público de la versión activa (`{assetId}-v{version}` sin storage paths) y auditoría `asset.version.created/updated/activated` transaccional; 6/6 tests HTTP PostgreSQL PASS (más 9/9 de regresión de catálogo admin/público). `297A-71` persiste el borrador del mapa: tabla `game_map_drafts` (un borrador por mapa con revisión optimista), `GET/PUT /api/admin/game/maps/:map_id/draft` con `AdminUser`/CSRF, validación completa del documento (mismo camino que publicar), 409 ante revisión obsoleta, 413/422/404 fail-closed y publicación que elimina el borrador en la misma transacción (la versión publicada pasa a ser la base); el editor carga el borrador si existe (si no, publicación activa → fixture), expone el botón "guardar borrador" y muestra la revisión en el pie; 5/5 tests HTTP PostgreSQL (draft) + 7/7 publish de regresión y 68 tests frontend dirigidos PASS. La vista del editor se dividió además en `game-map-editor-interactions.ts` para mantenerla <300 líneas (gate 297A-70 PASS tras el refactor). `297A-70` añade el preview 3D del borrador al editor: botón "preview 3D" en el toolbar que alterna el canvas 2D por un adaptador Three que reutiliza `buildTerrainMeshData` y los materiales de superficie del runtime (sin segundo motor), sincronizado con el documento en cada cambio y con teardown completo (geometrías, materiales, observer, renderer y contexto WebGL); `buildPreviewChunkData` expone los datos de malla puros y testeables. 3 tests nuevos + asserts del toolbar PASS. `297A-69` añade la creación de terreno al editor: tool `terrain` con `terrainChunkAt` (mundo → chunk local), `canCreateChunk` (fail-closed: chunk existente, cuota maxChunks, índices negativos que exigirían reindexar y huecos no contiguos) y `addTerrainChunk` que crea un chunk plano y expande `maxX/maxZ` dentro de `maxWorldWidth/Depth`; el canvas sombrea las celdas vacías contiguas. 7 tests nuevos + asserts del toolbar PASS. `297A-68` añade la superficie "camino" (2) al pincel: `TERRAIN_SURFACE_VALUES.path`, `isAllowedSurface` fail-closed para la vista, sombreado propio en el canvas y tests del camino; el runtime ya mapeaba 2→material medio (297A-33), así que el circuito pintar→publicar→jugar traduce el camino sin cambios en la escena. Se corrigieron además 4 tests de superficie de 297A-66 que asumían suelo en la celda (0,0) del fixture, que el contrato define como agua. `297A-67` añade el pincel de altura al editor: `TERRAIN_HEIGHT_VALUES` discretos allowlisted (0–4), tool `height`, `terrainVertexAt` (mundo → vértice de la malla (chunkSize+1)², fail-closed fuera de bounds) y `paintHeight` que pinta el vértice compartido en TODOS los chunks que lo contienen (bordes y esquinas sincronizados) con commit solo al cambiar (arrastre limpio); el canvas sombrea las celdas por altura y marca los vértices, y el toolbar expone botón "altura" + select de nivel. El pincel no crea terreno ni redimensiona bounds; sin caminos ni tipos de superficie adicionales; la representación 3D del relieve llega con Assets 3D. `297A-49` carga el perfil antes de WebGL/realtime y `297A-50` añade catálogo base/selección allowlisted sin consultas en el loop de render. `297A-51` cierra Fase 6: decisión invitado→cuenta documentada (nada se transfiere; el perfil de la cuenta aplica) y rehidratación del juego ante login/logout/cambio de cuenta, con 25 tests frontend dirigidos. El build del bloque queda condicionado a un error TypeScript preexistente en `notifications-popover.ts` (archivo sin commitear de otro agente). `297A-52` añade la gestión admin del catálogo de personajes en el backend: `POST/PUT /api/admin/game/characters` con `AdminUser`/CSRF, validación allowlisted, 409/404 y desactivación que bloquea nuevas selecciones; 10/10 tests HTTP PostgreSQL PASS. `297A-53` añade el panel admin de UI (tab "juego"): listado completo activas/inactivas vía `GET /api/admin/game/characters`, alta, edición y desactivación/reactivación; 8/8 tests HTTP y 13 tests frontend dirigidos PASS. `297A-54` añade el editor de personaje del jugador en la app Bosque (botón "personaje" → modal con catálogo activo y nombre visible; guardado con revisión optimista; invitados sin persistencia): 39 tests frontend dirigidos PASS. `297A-55` añade la auditoría persistente de cambios sensibles del catálogo: `game_audit_events` registra crear/actualizar/desactivar en la misma transacción y `GET /api/admin/game/audit/characters` los lista acotados con `AdminUser`; 15/15 tests HTTP PostgreSQL PASS. `297A-56` añade el panel UI de auditoría: sección "actividad del catálogo" en el tab "juego" del Admin con los últimos 10 eventos, aislada de la lista si falla; 16 tests frontend dirigidos PASS. `297A-57` cierra la reconexión persistente: `join_player` reemplaza la conexión previa del mismo subject (sin duplicar jugadores; la vieja se cierra sola con el código 4001 y el cliente no reintenta para evitar ping-pong) y el cliente reintenta con backoff 1s→30s + jitter con estado `reconnecting`, cancelación al destruir y error de transporte no fatal (error→close 1006 reintenta); 5/5 unit de `game_room`, 7/7 tests TCP, 25 tests frontend dirigidos, fmt/check/clippy y diff-check PASS. `297A-58` audita la publicación de mapas: `game_map_repo.publish` pasa a transacción y `map.published` se registra en `game_audit_events` en la misma transacción (nunca evento huérfano), con `GET /api/admin/game/audit/maps` acotado (1..=100, filtro `entityId`) y `AdminUser`/CSRF; 13/13 tests HTTP PostgreSQL PASS. `297A-60` añade el catálogo de assets del juego (backend): `game_assets` con seed (terreno/árbol/roca/agua), CRUD admin allowlisted y catálogo público activo, con auditoría transaccional de cambios (`asset.created`/`asset.updated`) y listado admin acotado; 9/9 tests HTTP PostgreSQL PASS. `297A-61` añade el panel UI del catálogo de assets: lista completa activas/inactivas, alta/edición con categoría del contrato del mapa, sección "actividad de assets" aislada y pares acción-entidad de assets en el validador; 9 tests frontend dirigidos PASS. `297A-62` mueve la configuración del Bosque DENTRO de la ventana del juego: toolbar real de `game-playable` con el comando `game:settings` (adminOnly, oculto en vivo para no-admin) que abre un modal B&W con las secciones organizadas "personajes" y "assets" (alta/edición/activar-desactivar + actividad aislada); el tab "juego" del Admin desaparece y `admin-juego.ts` se elimina (la lógica vive en `game-settings.ts`); sin preview de modelos hasta Assets 3D. `297A-63` corrige la UX: la configuración ya no es un modal — `game:settings` dispara un evento sobre la ventana enfocada del Bosque y la app alterna su contenido (destruye el runtime y monta `createGameSettingsPanel` con TABS personajes/assets/actividad en la misma ventana; "volver al Bosque" rehidrata); carga bajo demanda por tab. `297A-64` añade el tab "mapa" con el Editor de mapa 2D dentro de la misma ventana: canvas top-down (grid por cellSize, instancias por categoría, spawns, selección), paleta de assets activos del catálogo, command stack con undo/redo (colocar/mover/duplicar/borrar instancias y spawns con ids generados), validación local con `validateMapVersion` y publicación atómica (`POST /api/admin/game/maps` con `expectedVersion` + conflicto 409 visible); `GameMapAdminService` valida estrictamente el envelope y el documento; el runtime aún consume el fixture. `297A-65` conecta el runtime al mapa publicado: `resolvePlayableMap` carga la publicación activa con fallback fail-closed al fixture (404 sin aviso; fallo de red con aviso) y `game-playable` resuelve el mapa en `hydrate()` antes de montar WebGL/realtime (la escena usa documento/mundo publicado, la simulación sus colliders y el spawn el primero de la publicación); al volver al Bosque tras publicar, el circuito editar→publicar→jugar queda cerrado; 7 tests frontend dirigidos PASS. El runtime aún no da representación visual 3D a instancias del catálogo (Assets 3D). `297A-66` añade el pincel de superficie al editor: tool `paint` con suelo/agua (enteros allowlisted del contrato), `terrainCellAt` (mundo → chunk local + índice, fail-closed fuera de chunks) y `paintSurface` con commit solo al cambiar (arrastre limpio); botón "pintar" + select de superficie en el toolbar y sombreado de celdas > 0 en el canvas; 7 tests nuevos del core + asserts de toolbar PASS. Sin altura (vértices compartidos entre chunks) ni creación de terreno. Decisión 8 (05-ago): el contrato realtime v1 añade el evento `server_restart` (motivo bounded + cuenta atrás 1..=3600 s) con validación en ambos stacks y callback `onServerRestart` en el cliente; la cuenta atrás de 5 min y la migración coordinada del servidor quedan planificadas como `297A-78` en `Agente/planes/plan-reinicio-coordinado-bosque-2026-08-05.md` (Fases 1-3: broadcast, trigger+drenaje, verificación); la UX del aviso en el cliente (banner de cuenta atrás `game-restart-notice.ts`, 6 tests, cableado a `onServerRestart` con retirada al reconectar) y el runbook de rollback actualizado a la política de migración coordinada quedaron cerrados el 05-ago. Fases 1 y 2 de `297A-78` cerradas el mismo día: broadcast (`RoomCommand::Broadcast` + `announce_restart` en room/ws state) y migración coordinada (`publish_map` → `schedule_restart` con cuenta atrás fija de 300 s: difunde el aviso, invalida el mapa cacheado y drena las salas; cierre con código **4002 "mundo reiniciado"** — distinto del 4001 de identidad reemplazada — para que el cliente reintente con backoff y recargue la versión nueva; `restart_pending` anti-acumulación con Drop guard; la primera publicación gana). Validado: lib 98/98 (con BD de rama), `game_ws_tcp` 9/9 (aviso → cierre 4002 → rejoin), cliente realtime 13/13 frontend, type-check y gate 297A-78 PASS local-light. Queda la Fase 3: full CI tras cooldown y verificación en navegador del flujo real (publicar → banner → cierre → reconexión → mundo nuevo).
- [x] **297A-73 — Panel de versiones de Assets 3D (frontend):** servicio admin (`listVersions`/`import`/`updateMetadata`/`activate` + lectura binaria del GLB vía fetch directo), preview 3D aislado con GLTFLoader (`game-asset-preview.ts`), panel de versiones en `game-settings` (listado, importar GLB, metadata, activar, preview) y endpoint backend `GET /api/admin/game/assets/:asset_id/versions/:version/file` para servir el GLB a admin. Gate `task:check -- 297A-73` PASS, type-check, 142 tests frontend (juego completo) y build PASS.
- [x] **297A-74 — Cierre Fase 4: culling avanzado, batching por materiales y medición física de GPU/memoria:** (a) `MapChunkCache.select` acepta `maxDistance` (radio circular de visibilidad en unidades de mundo) que recorta chunks/instancias fuera del radio aunque caigan dentro de la ventana rectangular, con rechazo de radio inválido; (b) `GamePlayableVisualCache` fusiona en un solo `InstancedMesh` los meshes del prototipo que comparten geometría+material (`groupMeshesByMaterial` pura y exportada, `count = instancias × meshes fusionados`, matrices locales por bloque) y expone `batchDrawCallCount()`/`batchSourceMeshCount()` para medir el ahorro; (c) `game-gpu-probe.ts` lee identidad de GPU (`WEBGL_debug_renderer_info`), mide tiempo de frame GPU con `EXT_disjoint_timer_query` (nanosegundos → ms, asíncrono con `readFrameMs()`) y estima bytes de texturas/geometrías de la escena, con contexto inyectable y teardown; la escena activa el culling por distancia (`STREAM_MAX_DISTANCE`) y publica `data-gpu-*`, `data-batch-*` y `data-gpu-frame-ms`. Gate `task:check -- 297A-74` PASS, type-check, 196 tests frontend del juego y build PASS. La validación visual quedó cerrada el 05-ago: fixture `/forest-playable` con WebGL2, GPU Intel Iris Xe detectada y personaje `forest-scout`; backend actualizado con rutas del juego en localhost:3000.
- [x] **297A-75 — Fase 8: dos salas concurrentes, métricas agregadas y runbook de rollback:** (a) `GameRoomState` pasa a registro multi-sala claveado por `map.map_version()` con `register_map`/`join_on`: cada mapa tiene su propio actor con cap de 8 y TTL independiente, los jugadores de una sala no aparecen en la otra y la capacidad se mantiene por sala (tests unit: dos salas aisladas con snapshots de una sola entidad cada una y rechazo del 9.º solo en la sala llena); (b) métricas agregadas del realtime en `GameRoomMetrics` (joins, joins_rejected, disconnects, rooms_created, snapshots_sent, backpressure_evictions, rate_limited, sequence_rejected, active_players) contadas por el actor con contadores atómicos y expuestas en `GET /api/game/metrics` (público agregado, sin identidades ni coordenadas, en OpenAPI/Orval); test TCP real verifica conteos tras join + ticks y la ausencia de campos privados; (c) runbook `Agente/documentacion/operacion/runbook-rollback-juego-2026-08-05.md` con rollback de mapa (re-publicación de la versión buena, sin mutar snapshots inmutables) y de asset (re-activación de versión anterior), verificación, no-hacer y emergencia SQL documentada. Gate `task:check -- 297A-75` PASS (incremental local-light; full diferido por cooldown), 9/9 unit de `game_room`, 8/8 TCP, 51 tests backend de regresión y 665 tests frontend PASS.
- [x] **297A-76 — Reclamación invitado→cuenta (limpieza de identidad temporal):** `GameTicketStore::revoke_guest` elimina la entrada del store de la cookie invitada (firma + entrada vigente requeridas; revocación fallida no toca la identidad), el login exitoso expira la cookie `guest_game` (Max-Age=0) y el logout también; el handler del ticket revoca server-side la cookie invitada cuando viaja con una sesión autenticada (la cuenta es la autoridad; nunca se fusiona ni degrada). Tests unit (revocar cookie válida la invalida, revocar inválida/secret incorrecto fail-closed) y HTTP (cookie invitada vigente → login → deja de resolver; subject de cuenta distinto del invitado). Gate `task:check -- 297A-76` PASS, 11/11 unit de `game_ticket`, 6/6 HTTP de tickets y 8/8 TCP de regresión PASS.
- [x] **297A-77 — Presencia avanzada: personaje visible en remotos y resync tras reconexión:** el snapshot realtime lleva `characterId` del catálogo (bounded a 64 y validado fail-closed en el contrato Rust/TS). El personaje se resuelve en la capa HTTP al emitir el ticket (`GameProfileRepository::get` contra el perfil de la cuenta; invitados sin perfil viajan sin personaje) y viaja server-side en el ticket (`PendingTicket`/`GameTicketClaims`; el token firmado nunca lo expone); el room lo almacena por jugador (`join_with_character`, default `forest-scout` si no hay perfil o el id es inválido) y lo incluye en el initial y en cada snapshot. El frontend aplica el tono (`ink`/`middle`/`paper` → material compartido) en `createFigure`, recrea la figura si el personaje cambia, y el jugador local offline conserva su personaje a través de `createWorldState`/`normalizeState`/`simulateTick` (default `forest-scout` en fixtures sintéticos). Fix de resync: al recibir `joined` el cliente resetea `lastSnapshotSequence` y limpia los snapshots previos para que el primer snapshot de la sala nueva (cuyo contador puede reiniciarse por TTL) no se descarte como replay. Gate `task:check -- 297A-77` PASS, 12/12 unit de `game_ticket` (+carácter), 19 unit de room/realtime/ws-handler, 8/8 TCP, 54 tests backend HTTP de regresión, 668 tests frontend y type-check PASS.

**Gate/salida:** el plan GAME-01 queda aprobado y cada fase tiene su propio ID, gate `task:check`, auditoría SOLID/rendimiento/escalabilidad/seguridad/observabilidad, pruebas de navegador y evidencia de carga antes de iniciar la siguiente.

### 018A-96 — GAME-02: Extraer `glory-render` como motor reutilizable (planificado)

**Depende de:** GAME-01/Fase 8 estabilizada y de un segundo caso real que justifique cada abstracción. Plan: `Agente/planes/plan-glory-render-motor-juegos-2026-08-01.md`.

- [x] Auditar `frontend/src/features/game-core/` y clasificar qué pertenece al motor agnóstico, al adaptador Three, al OS, al backend o a Bosque — cerrada el 05-ago en `Agente/documentacion/arquitectura/auditoria-glory-render-fase0-2026-08-05.md`: 14 módulos CORE puros + `game-realtime` de frontera (sin transporte), 0 dependencias de Three/DOM/red/backend en el paquete y sin ciclos; la extracción espera un segundo consumidor real (criterio del plan).
- [ ] Crear `glory-render/` dentro de este workspace como repositorio Git independiente, con `core`, contratos, adaptador Three, fixtures, CI, SemVer y quality gate propios — la Fase 0 quedó cerrada el 05-ago (auditoría `auditoria-glory-render-fase0-2026-08-05.md` + estrategia de integración/versionado `estrategia-integracion-glory-render-2026-08-05.md`: submódulo fijado a etiqueta SemVer + dev local, política de licencias/CI/propietarios); falta aprobar la frontera con evidencia de segundo uso.
- [ ] Migrar Bosque a exports públicos sin copiar lógica; fijar integración por submódulo/commit o artefacto reproducible.
- [ ] Crear un segundo juego mínimo de conformidad que pruebe fixtures, lifecycle, renderer fake, límites y compatibilidad sin depender de wandori.us.
- [ ] Publicar una versión estable solo después de comparar rendimiento, bundle, memoria, teardown, seguridad y rollback en ambos consumidores.

**Gate/salida:** dos juegos consumen `glory-render` sin imports específicos de wandori.us/Bosque; el repositorio anidado tiene CI, documentación, release reproducible y rollback.

### 018A-66 — Separar overlay personal de la sesión admin

**Depende de:** 297A-13 y capacidades server-side. El contrato automatizado ya confirma que admin no solicita overlay remoto ni abre `workspace actualizado`.

- [ ] Validar en navegador login, logout y recarga con usuario admin; no debe aparecer el modal de conflicto ni el aviso `workspace actualizado`.
- [ ] Validar con una cuenta no-admin que el conflicto siga apareciendo únicamente cuando existan revisiones local/remota incompatibles.

**Gate/salida:** admin publica el release global; solo cuentas personales resuelven overlay remoto.

### 018A-73 — Refactor de deuda CSS en `components.css`

**Depende de:** revisión visual de páginas públicas y del sistema de recetas.

- [x] Dividir `components.css` (910 → índice de 21 líneas) en 8 módulos por dominio en
  `frontend/src/styles/components/` (Button/Form/Modal/Overlay/Commerce/Notifications/Analytics/Misc),
  cada uno con su propio `@layer components`; 146 clases originales = 146 en módulos (verificado),
  módulos máximos 175 líneas (<300). Gate `task:check -- 018A-73` PASS (local-light), suite 724/724
  y `vite build` OK.
- [x] Botones a `Button.css` (`.boton`, superficie OS, `.boton-con-icono`, `.boton-icono`, tabs).
- [x] `.notificaciones__item`/`.notificacionesAdmin__item` ya no existen en ningún CSS (renombradas
  a `notificacionesPopover__item` en 028A-5): el ítem quedó satisfecho de facto, sin border/padding
  locales pendientes.
- [x] `.comercio__producto h3` → clase `comercio__productoTitulo` (store-view.ts + Commerce.css).
  **Desviación documentada:** se eligió clase propia y no `modalTitulo` porque esta última impone
  fuente/tamaño/peso de modal y cambiaría la tipografía de la tarjeta; el contrato original solo
  reseteaba `margin`.
- [x] VarSense/Sentinel PASS: sin clases huérfanas NUEVAS (los 6 `claseHuerfana` de clases usadas
  dinámicamente en TS son preexistentes: 028A-17 ya reportaba 50 con el archivo único) ni
  duplicadas (146=146).

**Gate/salida:** `components.css` queda bajo el límite acordado o dividido por responsabilidad, sin lints bloqueantes.

### 297A-17 — Hardening, identidad, accesibilidad y SEO

**Depende de:** 297A-6–16 y de la revisión CSS anterior.

- [ ] Completar MFA/passkey, recuperación avanzada y threat review con casos negativos de sesión, CSRF, capacidades, pagos, grants y webhooks.
- [ ] Auditar SEO final: HTML público, sitemap, robots, canonical, metadata, Open Graph/Twitter y JSON-LD sin drafts ni rutas privadas.
- [ ] Verificar el manual visual en desktop, tablet y móvil, incluyendo claro/oscuro y los tamaños aprobados.
- [ ] Verificar teclado, foco, live regions, zoom 200%, reduced motion, alto contraste y multimedia accesible.
- [ ] Ejecutar E2E críticos, observabilidad real y el runbook de operación; deploy sigue fuera de alcance y no se usa SSH.

**Gate/salida:** checklist de hardening y accesibilidad evidenciado en navegador, tests y quality gate.

### 297A-9 — Validación visual completa del shell

**Depende de:** runtime y recetas visuales implementadas.

- [ ] Revisar shell, ventanas, taskbar, menú contextual, foco y estados en 1440×900, 1024×768, 390×844 y 320px.
- [ ] Repetir con zoom 200%, teclado y claro/oscuro; registrar cualquier overflow, foco perdido o contraste incorrecto.

**Gate/salida:** capturas y observaciones documentadas; no quedan regresiones visuales del chrome base.

### 297A-12 — Experiencia móvil tipo launcher

**Depende de:** 297A-9/11. Tablet conserva el escritorio.

- [ ] Ejecutar E2E visual/táctil en 320/360/390px y tablet 768px.
- [ ] Verificar long press/drag estable, orientación, safe areas, teclado virtual, foco, scroll y apps críticas.
- [ ] Confirmar refresh, transición móvil↔tablet y sincronización de URL sin duplicar el stack.

**Gate/salida:** launcher móvil funciona a los viewports definidos y conserva estado sin crear lógica paralela.

### 297A-19 — URLs canónicas, deep links y ventana enfocada

**Depende de:** 297A-9/11/12/13.

- [ ] Probar Back/Forward, `popstate`, refresh y transición desktop/tablet/móvil; la URL debe enfocar solo la ventana activa.
- [ ] Probar sesión limpia, varias ventanas, permisos, rutas inválidas, parámetros inseguros, scroll/formulario y deduplicación.
- [ ] Verificar `pushPath` solo en aperturas explícitas, `replacePath` en foco y eventos allowlisted sin datos privados.

**Gate/salida:** E2E de History API y deep links compartibles sin serializar IDs internos, tokens, posiciones ni overlays.

### 297A-22 — Reordenamiento por arrastre con grid

**Depende de:** 297A-12 y overlay.

- [ ] Validar visual/E2E 320/360/390/768+, foco y teclado.
- [ ] Confirmar long press, colisiones, reload/sync, persistencia de `mobilePosition` y transición móvil↔tablet.
- [ ] Verificar que Finder no herede el orden móvil y que move prev/next siga siendo alternativa accesible.

**Gate/salida:** orden móvil compacto y persistente, sin contaminar `position` desktop.

### 018A-97 — Grid de iconos del escritorio coherente (placeholder + debug)

**Motivo (05-ago, usuario):** el grid de iconos "está mal", hay fallas y el placeholder de
arrastre junto con las rejillas rojas de debug (Ctrl+Shift+G) no son coherentes con las celdas
reales. Además "los iconos interactúan extraños cuando los juntas": se altera todo en vez de
alterarse 1 solo (drag de grupo decidido por la selección del drop, sin colisiones ni clamp, y
reflow que reempaqueta todo el grid). **Causa raíz identificada en plan
`Agente/planes/plan-iconos-escritorio-grid-2026-08-05.md`:**
`justify-content: space-between` horizontal reparte el sobrante pero ningún cálculo lo replica
(falta `columnGapEffective`; solo existe `rowGapEffective`); el grid `direction: rtl` tiene tres
fórmulas paralelas de geometría (getCellAt / positionCellHighlight / debugGridOverlay) que ya
divergieron; `cellWidth` se mide del primer item, no del track; y la rejilla roja es depuración
temporal (297A-20) que quedó en producción.

- [x] Unificar la geometría de celdas: `columnGapEffective` + `cellOriginAt(col,row,metrics)` único
  (LTR/RTL) usado por getCellAt, highlight y debug; tests DOM sobre grid real con `space-between`+RTL
  (F1 cerrada 05-ago: suite 713/713, `icon-grid-dom.test.ts`).
- [x] Placeholder de arrastre — tests DOM del highlight (`positionCellHighlight` sobre el track real
  con sobrante, LTR/RTL en `icon-grid-dom.test.ts`); **verificación en navegador pendiente**
  (celda destino real en desktop ≥769/tablet y ajuste de transición).
- [x] Drag de grupo predecible: el grupo se captura en pointerdown (`getGroupIds` → `onPlaceCell`,
  solo superficie escritorio) y `shouldGroupDrag` aplica la regla Windows; `buildGroupPlacementMoves`
  clampa a bounds y desplaza ocupantes no seleccionados (`icon-group-drag.test.ts`, 11 tests);
  `reflowPositions` solo toca nodos que cambian. Gate `task:check -- 018A-97` PASS (local-light).
- [x] Rejilla de debug retirada: `debug-grid-overlay.ts` fuera (F1), atajo Ctrl+Shift+G eliminado y
  CSS `--depurar`/`__debug*` retirado en este bloque; VarSense sin huérfanas.
- [x] **Enforcement de tomas de tarea (05-ago, commit `ea675ffd`):** `task:check -- {ID}` BLOQUEA
  (exit 78) el cierre de una tarea tomada por otro agente activo salvo `--allow-foreign` explícito;
  la toma propia se renueva en cada gate (heartbeat con compare-and-write para no pisar un re-toma
  ajeno); cualquier `task:check`, `run-with-db` o `glory-dev` muestra un banner `EN CURSO` por cada
  toma ajena activa, no solo la tarea objetivo. `AGENTS.md` §6 y `roadmap-sentinel.md`
  actualizados; 3 tests nuevos (8/8) y suite quality 210/210. Cierre documental 06-ago.
- [x] **Verificación final: el usuario probó el 05-ago y SIGUE MAL; causa raíz encontrada y
  corregida el 06-ago (F6).** El desfase real era el eje VERTICAL: `align-content: space-between`
  reparte el sobrante entre las filas que el CONTENIDO materializa (2 filas → fila 2 en top 772px)
  mientras la geometría JS asumía las 9 filas que caben por altura (fila 2 en 96.5px) — desfase
  ~675px que hacía aterrizar el icono lejos del highlight (y al caer sobre ocupantes, desplazar
  varios). Fix: `align-content: start` (filas deterministas desde arriba, mismo criterio que el
  Finder 018A-93), verificado en navegador real a 1440px con reflow forzado (26 items → filas 0/96,
  no 0/772). Validación visual final confirmada por el usuario (12-ago): resuelto.

**Gate/salida:** un único helper de geometría alimenta todo; el placeholder coincide con la celda
real (verificado por el usuario — acta de 05-ago: falla); el drag de grupo no altera iconos no
implicados (ni se superpone ni sale del grid); sin rejillas rojas en producción; tests
DOM fijan la geometría frente a `space-between`+RTL. **Estado 12-ago: cerrado (user confirmó resuelto).**

### 297A-21 — Notificaciones de novedades

**Depende de:** 297A-13 y releases versionados.

- [ ] E2E con overlay personalizado, deduplicación anti-spam, marcar leída, logout/login y dos dispositivos.
- [ ] Confirmar que campana, contador y panel admin respeten capacidades y no filtren eventos privados.

**Gate/salida:** una release pública produce una notificación idempotente y la lectura queda aislada por cuenta.

### 297A-13 — Registro, Cuenta y overlay remoto

**Depende de:** 297A-9/11/18.

- [ ] Ejecutar E2E real en dos pestañas/dispositivos y decidir/documentar merge semántico para cambios concurrentes no resolubles por local/remoto.
- [ ] Completar correo real, UI de verificación/token y habilitación controlada de registro; mantener tokens opacos, expirables y de un solo uso.
- [ ] Definir MFA/passkey de Cuenta y rate limit distribuido cuando exista infraestructura autorizada.
- [ ] Verificar logout/login, resolución de conflictos, reset, tombstones y corrupción persistida en todos los modos de presentación.

**Gate/salida:** Cuenta, preferencias y overlay sobreviven concurrencia y recargas sin filtrar secretos ni pisar cambios silenciosamente.

### 297A-14 — Programas editoriales

**Depende de:** 297A-9/10/11. Plan: `Agente/planes/plan-programas-editoriales-2026-07-31.md`.

- [ ] Ejecutar E2E visual desktop/tablet/móvil del vertical editorial completo: artículos/About, proyectos, productos, media, papelera, publicación, rollback y autosave.
- [ ] Cubrir permisos admin, estados draft/private/public, errores de red, teardown de apps lazy y acciones de toolbar.

**Gate/salida:** editores reutilizables y programas de contenido funcionan en las tres presentaciones sin carreras ni referencias rotas.

### 297A-15 — Comercio seguro

**Depende de:** 297A-7/10/14.

- [ ] Implementar y probar reembolsos y chargeback con autoridad server-side e idempotencia.
- [ ] Integrar scheduler/proveedor real y confirmar el worker de outbox con backoff, observabilidad y recuperación.
- [ ] Ejecutar E2E con Stripe/Resend o proveedores autorizados: checkout invitado, pago, webhook, entitlement, grant y descarga privada.

**Gate/salida:** el comprador recibe solo la versión adquirida; fallos de pago/webhook no conceden acceso ni duplican órdenes.

### 297A-16 — Analytics, estadísticas y retiro legado

**Depende de:** 297A-9/11–15.

- [ ] Completar revisión legal y E2E de consentimiento, retención, anonimización, purga y derechos operativos.
- [ ] Retirar CSS/clases legacy restantes con VarSense después de revisión visual; no eliminar clases dinámicas válidas.
- [ ] Verificar métricas de acciones, apps, ventanas, artículos, imágenes, compras, errores y releases sin `user_id` ni datos privados.

**Gate/salida:** eventos críticos son medibles, deduplicados y auditables; el panel no expone datos fuera de capacidad.

### 297A-24 — Cierre automático de ventanas

**Depende de:** 297A-19. La causa raíz y las regresiones automatizadas ya están corregidas.

- [ ] Prueba visual desktop/móvil para apertura canónica/no canónica, Perfil, refresh, Back/Home y varias ventanas.
- [ ] Confirmar que abrir una app nunca cierre otras y que solo una navegación real fuera del runtime permita cerrar el conjunto.

**Gate/salida:** no hay cierre destructivo por reconciliación de URL; taskbar, foco y ventanas permanecen coherentes.

### 297A-25 — Política de carga de apps pesadas

**Depende de:** 297A-9/11/12. ADR: `Agente/documentacion/arquitectura/adr-carga-apps-pesadas-2026-07-31.md`.

- [x] Primera app WebGL validada (el juego `game-playable`): teardown verificado con test
  automatizado `game-playable-teardown.test.ts` (5 tests: destroy idempotente + DOM limpio,
  cancelación de RAF sin re-agenda, remoción de listeners window/document, desconexión de
  ResizeObserver + cierre de socket, fail-closed con signal abortado); registro lazy confirmado
  (chunk propio, sin `three` estático en el shell); sin workers ni audio; object URL revocado;
  timers de perfil limpiados; GPU liberado (geometrías/materiales/renderer + `forceContextLoss`).
  ADR actualizado con el checklist de la primera app pesada (2026-08-06). Gate `task:check --
  297A-25` PASS (local-light), 5/5 tests, type-check limpio.
- [ ] Medir si hace falta `preload`/`heavy`; no activar flags sin una app real, métrica y ADR:
  sigue sin activarse — el juego carga lazy al abrir y el teardown ya libera; la verificación
  de Network (chunk no descargado antes de abrir) queda pendiente de sesión de navegador real.

**Gate/salida:** la app pesada se carga lazy, libera recursos al cerrar y no degrada el arranque ni el resto del OS.

### 297A-29 — Escalar la app Configuración sin eliminarla

**Depende de:** 297A-27, 297A-28, 297A-13 y 297A-19. Las fases de fuentes estáticas, toolbar por capacidad y Perfil admin ya están implementadas.

- [ ] Fase 4: decidir si Configuración se convierte en panel de ajustes del sistema o se integra en otra app; conservar registro `settings`, nodo admin, menú y compatibilidad actual mientras se decide.
- [ ] Fase 5: diseñar, aprobar y solo entonces implementar un panel escalable; cualquier selector de fuente futuro debe usar tokens, persistencia y una receta compartida, sin reintroducir estado global duplicado.

**Gate/salida:** Configuración sigue funcionando durante la migración y una nueva acción admin se agrega por comando/capacidad, no mediante `if/else` en el shell.

## Revisión SOLID y escalabilidad obligatoria

Cada bloque pendiente debe evidenciar antes de cerrarse:

- **SRP/ISP:** chrome, contenido, persistencia, permisos y analítica permanecen separados; interfaces exponen solo lo necesario.
- **OCP/DIP:** nuevas apps, recursos, comandos, temas y breakpoints se agregan por registros/adaptadores, sin duplicar shell ni listeners.
- **Límites:** componentes/CSS ≤300 líneas, lifecycle/store/hook ≤120 y utils ≤150; una excepción requiere justificación en Sentinel.
- **Contratos y seguridad:** tipos, DTOs, errores, capacidades, eventos y resultados son explícitos; sin HTML inseguro, I/O silencioso, N+1, secretos o estado privado en URL.
- **Escalabilidad:** probar un segundo caso real, revisar índices/paginación/cache, teardown, migración y rollback.
- **Calidad:** Sentinel/VarSense, type-check, tests, navegador y `task:check` pasan; los fallos preexistentes se documentan y no se silencian.

## Reglas operativas no negociables

- Un bloque entregable usa commit explícito con ID; un diagnóstico/prototipo compartido no se fuerza a commit, pero el reporte debe recordar revisar `git status`.
- Todo deploy, restart, logs, backup, restore, health o exec de producción pasa por `coolify-manager-rs`; nunca SSH/docker/scp/curl directo.
- Comandos largos tienen timeout y señal de readiness; no se espera indefinidamente ni se reintenta a ciegas.
- Tras cada commit y antes de cerrar una sesión se relee este roadmap completo.
