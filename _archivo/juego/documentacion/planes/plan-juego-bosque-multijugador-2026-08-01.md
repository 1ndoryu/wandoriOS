# Plan — Bosque multijugador dentro del OS

> **Fecha:** 2026-08-01
> **ID:** GAME-01
> **Estado:** dirección Three.js 3D aprobada; fixture offline, persistencia, publicación admin de mapas, sala realtime server-authoritative, identidad temporal invitada, perfil persistente de cuenta, catálogo base de personaje, gestión admin del catálogo (backend + panel UI), editor de personaje del jugador y reconexión persistente del socket están integrados; el editor de mapa/assets y Assets 3D están cerrados (Fases 7/4/8), la reclamación invitado→cuenta quedó cerrada por `297A-76` y la presencia avanzada por `297A-77` (characterId en el snapshot realtime con tono por personaje + fix de resync tras reconexión); la validación visual en navegador quedó cerrada (fixture `/forest-playable` renderiza con WebGL2, GPU detectada y personaje `forest-scout`; backend actualizado con rutas del juego en localhost:3000); solo queda el full CI.
> **Prioridad:** futura, después del bloque actualmente habilitado en `roadmap.md`.
> **Dependencias globales:** runtime `AppRegistry`/`MountedView`, ciclo de vida y carga lazy, sesiones/capacidades, contratos de workspace y quality gate.
> **Fuentes canónicas:** `roadmap.md`, `Agente/documentacion/arquitectura/adr-bosque-3d-assets-terreno-2d-2026-08-01.md`, `Agente/planes/plan-assets-terreno-bosque-3d-2026-08-01.md`, `Agente/planes/plan-glory-render-motor-juegos-2026-08-01.md`, `Agente/documentacion/arquitectura/adr-glory-render-repositorio-agnostico-2026-08-01.md`, `Agente/documentacion/arquitectura/adr-carga-apps-pesadas-2026-07-31.md`, `Agente/documentacion/producto/referencia-visual-bosque-2026-08-01.md`.

## 1. Objetivo

Agregar una app del OS que abra y cierre como cualquier otro programa y que permita, en una primera versión controlada:

- explorar un bosque 3D isométrico renderizado con Three.js sobre un mundo lógico finito X/Z;
- mover un personaje propio;
- ver a otros jugadores próximos en la misma sala;
- entrar como invitado temporal o como usuario con cuenta;
- editar terreno/colocación desde un programa 2D y administrar modelos externos desde `Assets 3D`, sin modelar geometría dentro del OS;
- editar un personaje sencillo mediante opciones previamente autorizadas;
- publicar cambios de forma versionada sin romper una partida activa.

El objetivo no es construir todavía un MMO ni un motor general. La primera entrega debe demostrar un loop pequeño, medible, reversible y capaz de ejecutarse en el servidor actual sin reservar procesos permanentes para un mundo vacío.

## 1.1 Revisión crítica del plan

### Lo que está bien

- El alcance inicial está acotado a exploración, presencia y edición de un mapa; combate, economía, chat y mundo infinito quedan fuera.
- La app respeta la arquitectura del OS: registro lazy, `MountedView`, teardown, mismas reglas para desktop/móvil y ningún chrome duplicado.
- La autoridad de movimiento, permisos, publicación y versiones está en el servidor; el cliente solo expresa intención y renderiza.
- Salas pequeñas, spatial index, interés por proximidad, TTL de salas y límites de mensajes evitan diseñar un MMO accidentalmente.
- El plan incluye negativas, carga, reconexión, auditoría y rollback, no solo el camino feliz.

### Omisiones corregidas en este documento

- Se añade una fase previa sin código para cerrar producto, referencia visual, licencia, integración con el OS, persistencia de sesión y presupuestos.
- Se define que restaurar la ventana del OS no debe restaurar automáticamente una sala ni un ticket WebSocket; reconectar será una decisión explícita y segura.
- Se separan los contratos de app/ruta/capacidad, juego/render y realtime; esto evita que el juego contamine `WindowManager`, `MobileAppStack` o el workspace.
- Se incorporan pruebas deterministas con reloj/transporte falsos, fuzzing de mapas/mensajes y simulación de reconexión antes de una prueba de carga.
- Se agregan criterios de accesibilidad, reduced motion, background-tab, feature flag, observabilidad y operación Coolify.
- La imagen se guarda como moodboard versionado; no se tratará como asset, textura ni fuente para calcar.

## 2. Decisiones confirmadas

| Área | Decisión inicial |
|---|---|
| Acceso | Invitado + cuenta. El invitado tiene identidad temporal; la cuenta permite conservar personaje y preferencias. |
| Renderer | Three.js 3D isométrico, lazy y con teardown GPU. El boceto cenital se conserva como referencia histórica, no como renderer candidato. |
| Geometría | Presentación 3D sobre simulación lógica X/Z. La altura proviene de un terreno determinista finito y el servidor mantiene spatial index/colisión autoritativos. |
| Administración | Dos programas admin: `Assets 3D` gestiona GLB/versiones y `Editor de mapa` edita terreno/instancias en 2D con preview 3D. Ninguno modela mallas. |
| Assets | Autoría externa; runtime GLB/glTF 2.0, versiones inmutables, storage por hash, metadata/proxies allowlisted y validación server-side. |
| Sala inicial | Máximo objetivo de 8 jugadores por sala. El límite debe ser configurable y rechazará conexiones nuevas antes de degradar la sala. |
| Dirección visual | Bosque dibujado de tinta/mapa: árboles, rocas, agua y terreno con líneas orgánicas, capas y lectura clara. La imagen compartida se registra como referencia de atmósfera y composición, no como asset final ni como textura que se copie sin licencia. |
| Presentación OS | Una app `registerLazy`, `full-bleed`, con el mismo `MountedView` en desktop/tablet y móvil. No habrá `MobileGameApp` paralelo. |

### Registro de la referencia visual

La referencia proporcionada el 2026-08-01 queda descrita como: bosque visto desde arriba, composición de mapa dibujado a tinta, masas de árboles con dos siluetas principales, lagos, caminos/terreno tramado, cuadrícula conceptual y catálogo visual de símbolos. Servirá para moodboard, densidad, capas y lenguaje de assets. Antes de producir assets finales habrá que definir autoría/licencia y decidir si se usa una reinterpretación original en blanco y negro o una paleta de color muy restringida.

## 3. Límites del MVP

### Incluido

1. Un mapa publicado inicial, acotado y navegable.
2. Cámara que sigue al personaje con límites del mapa.
3. Movimiento de cuatro u ocho direcciones, según la decisión de controles; colisiones estáticas simples.
4. Presencia de otros jugadores: aparecer, moverse interpoladamente, salir y reconectar.
5. Salas pequeñas, con un snapshot server-authoritative y visibilidad por proximidad.
6. Invitado temporal y usuario autenticado.
7. Un catálogo pequeño de assets: terreno, árbol, roca, agua y al menos un punto de spawn.
8. `Editor de mapa` admin en vista 2D para pintar altura/superficie y seleccionar, colocar, mover, duplicar u ocultar instancias.
9. `Assets 3D` admin para importar GLB privado, analizar, previsualizar, configurar proxy/metadata, versionar y publicar.
10. Editor de personaje con slots y valores allowlisted: por ejemplo cuerpo, cabello, ropa y color; sin editor de píxeles ni contenido arbitrario.
11. Guardado de borrador, preview jugable y publicación de una versión inmutable.
12. Cierre de la app con liberación comprobable de `requestAnimationFrame`, listeners, WebSocket, timers, caches y object URLs.

### Fuera del MVP

- combate, daño, inventario, economía, comercio entre jugadores y NPCs;
- chat global o voz;
- físicas complejas, navegación de agentes, agua dinámica o destrucción del escenario;
- mundo único ilimitado sin salas;
- editor de mallas/UV/materiales/rigs, scripting de assets o código ejecutable por admin;
- cuevas, voladizos, terreno infinito, escultura libre o generación procedural en el MVP;
- generación procedural, login social, ranking y moderación avanzada;
- sincronización de cada frame o posición de todos los usuarios del mundo completo.

Cada elemento excluido deberá convertirse en una tarea independiente con presupuesto y amenaza de escalabilidad explícitos.

## 4. Arquitectura propuesta

### 4.1 Frontend dentro del OS

```text
AppRegistry/registerLazy
        ↓
MountedView + AbortSignal
        ↓
GameController
  ├─ input
  ├─ simulation visual/interpolación
  ├─ cámara
  ├─ WebSocket client
  ├─ ThreeRendererAdapter (mundo lógico X/Z + terreno por chunks)
  └─ modo player/admin

El núcleo puro offline vive en `frontend/src/features/game-core/` y no importa DOM,
Three.js, WebSocket ni persistencia. El fixture `game-playable` lo consume mediante
un controlador y adaptador visual separados; `game` y `game-3d` siguen siendo
previews visuales independientes.
```

- `app-registration.ts` solo registra metadatos y carga lazy; no importa un motor pesado.
- La app devuelve contenido full-bleed; nunca crea `DesktopWindow`, taskbar, launcher ni z-index.
- `destroy()` cancela el frame loop, aborta operaciones, cierra el socket, elimina listeners y libera recursos.
- El núcleo de movimiento, snapshots, spatial queries y comandos será independiente del DOM para probarlo con Vitest.
- Three.js queda elegido para la dirección 3D y permanece detrás de un adaptador/lazy chunk. Su presupuesto de memoria/GPU, accesibilidad y pipeline de assets todavía debe medirse; si falla, se reduce alcance/calidad visible antes de contaminar el shell o abandonar la autoridad server-side.
- El mismo contenido recibe controles de teclado/pointer/touch según la presentación. El shell móvil solo cambia el marco, no las reglas del juego.

### 4.2 Mundo libre con estructuras eficientes

El mundo se representará con coordenadas continuas para respetar la decisión de plano libre, pero no se procesará como una lista plana:

- el mapa tendrá bounds explícitos;
- los objetos estáticos se indexarán en una cuadrícula espacial/hash de celdas, aunque visualmente no estén encajados a tiles;
- cada objeto tendrá una forma de colisión limitada inicialmente a AABB, círculo o polígono simple validado;
- el servidor buscará colisiones y jugadores solo en celdas vecinas;
- el cliente renderizará por cámara + margen, con capas/layers ordenadas;
- el editor podrá ofrecer snapping opcional para facilitar alineación sin convertir el mundo en un tilemap.

No se permitirá que un mapa publicado contenga un número ilimitado de entidades, polígonos, capas o tamaños de textura.

### 4.3 Backend realtime

El backend de wandori.us deberá integrar una capa de salas encima de la base reusable de WebSocket disponible en `glory-rs/backend/src/websocket/`. El hub actual agrupa conexiones por usuario y no representa todavía salas de juego; no se debe usarlo directamente como si ya resolviera el multiplayer.

Propuesta para la primera versión:

- una tarea/actor por sala activa, creada bajo demanda al entrar el primer jugador y destruida después de un TTL sin jugadores;
- estado de sala en memoria para la primera instancia del servidor: jugadores, mapa publicado cargado, spatial index y reloj de tick;
- límite estricto de 8 jugadores por sala y límites globales configurables de salas, conexiones y mensajes;
- tick server-authoritative de 10 Hz inicialmente; el cliente puede renderizar a 30/60 Hz interpolando snapshots;
- el cliente envía intención (`move`, dirección, secuencia y heartbeat), nunca una posición final;
- el servidor valida velocidad, cooldown, bounds y colisión y emite snapshots/versiones de estado;
- snapshots filtrados por radio de interés y con delta/quantización cuando la medición lo justifique;
- desconexión, reconexión, heartbeat, timeout, backpressure y cierre ordenado como contratos explícitos;
- ningún loop de mapa permanece vivo si la sala está vacía.

El envelope JSON existente sirve para el primer MVP de 8 jugadores si se versionan mensajes y se prueban límites. No se debe optimizar prematuramente con binario; se abrirá una decisión binaria solo si la medición supera los presupuestos. La serialización no puede bloquear el thread que atiende HTTP.

### 4.4 Identidad y tickets

- La sesión web opaca existente sigue siendo la autoridad para usuarios autenticados.
- El invitado necesita una identidad de juego temporal, rate-limited y sin derechos administrativos; no se confiará solo en un `userId` enviado por el navegador.
- El ticket WebSocket será corto, de un solo propósito y ligado a la sesión/identidad server-side.
- El ticket reusable actual de Glory usa `i32`, mientras wandori.us usa UUID para usuarios. Antes de implementar se debe definir un contrato compatible con UUID/subject opaco; no se hará una conversión implícita ni se asociará una cuenta por un entero cliente.
- La capacidad admin se comprueba al abrir el modo edición y en cada comando de guardado/publicación. Ocultar botones no es autorización.

### 4.5 Contrato con el OS, rutas y sesión

- `game` se registra como una app lazy/full-bleed con `MountedView`, `AbortSignal`, `destroy()` idempotente y capacidades explícitas (`game:play`, `game:admin`); el renderer no crea ventanas, taskbar ni listeners globales.
- La ruta pública debe representar solo el estado compartible y allowlisted (por ejemplo, mapa/sala pública si finalmente se permite); nunca serializa ticket, identidad invitada, coordenadas precisas, token, snapshot privado ni posición de cámara.
- La ventana puede restaurarse como contenedor, pero `window-session` no guarda WebSocket, sala, ticket, input pendiente ni identidad temporal. Al abrir/reanudar se solicita un ticket nuevo y se muestra estado claro `desconectado/conectando/conectado`.
- Cerrar, minimizar, cambiar de breakpoint, pasar la pestaña a background o perder la sesión deben tener políticas explícitas: pausar render, cerrar o degradar socket, conservar solo estado seguro y permitir reconectar sin duplicar jugador.
- Desktop/tablet conserva la ventana; móvil usa app a pantalla completa con los mismos comandos y ruta. Los controles táctiles viven en una capa de presentación, no en la simulación.
- El catálogo del workspace contiene una referencia a la app, no una copia del mapa publicado. El mapa y sus assets se resuelven mediante servicios de juego/versiones y capacidades.

### 4.6 Observabilidad y operación

- El servidor debe exponer salud y métricas agregadas de salas activas, joins/rechazos, latencia, tick, mensajes, desconexiones, backpressure y memoria; no se registran coordenadas precisas ni payloads de usuario.
- Coolify debe poder iniciar/detener la instancia con cierre ordenado: dejar de aceptar joins, cerrar tickets, drenar salas dentro de un límite y registrar qué versión de mapa estaba activa.
- La primera topología será single-instance documentada. Si se requiere más de una réplica, se abre un ADR de coordinación/estado antes de cambiar el contrato; no se asume que el hub WebSocket actual resuelve salas distribuidas.
- El juego debe estar detrás de una feature flag o capacidad de lanzamiento hasta que el vertical slice y el hardening pasen sus gates.

## 5. Modelo de datos y versionado

Se conservará el envelope de `resources` cuando el mapa o asset necesite identidad editorial, visibilidad y lifecycle. El contenido específico vivirá en tablas de dominio, no en el workspace ni en el frontend.

### Entidades iniciales propuestas

- `game_maps`: identidad, nombre interno, estado, revisión de borrador, versión publicada y bounds.
- `game_map_versions`: snapshot inmutable publicado, hash/schema version, autor, timestamp y referencia a assets/versiones.
- `game_map_drafts`: documento editable o revisión activa con `expected_revision`.
- `game_map_entities`: solo si la medición demuestra que JSONB deja de ser manejable; no crear una fila SQL por cada árbol del primer MVP sin necesidad.
- `game_assets`: metadata normalizada, tipo (`terrain`, `tree`, `rock`, `water`, etc.), asset media autorizado, dimensiones, hitbox, layer y estado.
- `game_asset_versions`: cambios inmutables de asset para que una publicación antigua no cambie al editar el original.
- `game_character_definitions`: catálogo de piezas/slots y opciones permitidas.
- `user_game_profiles`: personaje seleccionado, configuración allowlisted y datos mínimos persistibles por usuario.
- `game_audit_events`: publicación, modificación de assets, cambios de catálogo, expulsión y acciones admin sensibles; separado de analytics.

### Documento de mapa

El snapshot inicial puede ser JSONB versionado, validado por servicio, con límites de profundidad/tamaño:

```text
mapVersion {
  schemaVersion,
  bounds,
  layers,
  entities: [{ id, assetVersionId, x, y, rotation, scale, collision, properties }],
  spawnPoints,
  publishedAssets
}
```

- `properties` será una allowlist tipada; nunca HTML, JavaScript, URLs firmadas ni handlers.
- Un mapa publicado es inmutable. Editar crea borrador y publicar crea otra versión.
- Una sala conserva la versión con la que inició; las publicaciones nuevas afectan salas nuevas o una transición explícita y segura, nunca mutan una partida en curso silenciosamente.
- El backend rechaza ciclos conceptuales, bounds inválidos, IDs de assets no autorizados, duplicados, entidades fuera de límites, hitboxes abusivas y documentos que excedan cuota.

## 6. Editor admin dentro del juego

El modo admin reutiliza la misma cámara, renderer, assets y selección del juego, pero añade herramientas registradas por comandos y autorizadas server-side:

1. **Modo:** entrar/salir de edición; mostrar estado `borrador`, `versión publicada`, `guardando`, `conflicto`.
2. **Paleta:** listar assets activos autorizados con preview, búsqueda y tipo.
3. **Escenario:** seleccionar, colocar, mover, rotar dentro de límites, duplicar, cambiar layer y eliminar.
4. **Colisiones:** visualizar hitbox; editar solo formas permitidas; probar el movimiento contra el borrador.
5. **Spawn:** crear y marcar puntos de aparición válidos.
6. **Borrador:** deshacer local acotado, guardar por comando al terminar una operación y manejar `409 expectedRevision` sin overwrite silencioso.
7. **Preview:** abrir una sesión de prueba del borrador aislada de las salas públicas.
8. **Publicar:** validar todo el documento, crear versión inmutable, auditar y mostrar resultado; no publicar desde un `if` visual del cliente.
9. **Assets:** cargar una imagen mediante media autorizada, validar MIME/dimensiones/peso, definir hitbox/layer/metadata y crear una versión; eliminar será soft delete si existen referencias.
10. **Personajes:** administrar catálogo de slots/opciones y límites; las cuentas solo pueden elegir combinaciones permitidas.

La edición en vivo no debe modificar el snapshot que usan otros jugadores. El modo admin podrá mostrar una sala de preview separada o un overlay visual del borrador, pero el contrato de publicación será transaccional.

## 7. Fases de ejecución

### Fase 0 — Dirección visual 3D aprobada

Esta fase define únicamente qué debe verse. No decide todavía movimiento, red, salas, persistencia, colisiones ni editor.

- [x] Aprobar la referencia guardada en `Agente/documentacion/producto/referencia-visual-bosque-2026-08-01.md` como atmósfera, no como asset para copiar: decisión de producto del 05-ago — la imagen es del usuario/tiene licencia y se usa como base de assets con más libertad.
- [x] Comparar ambos bocetos y elegir Three.js 3D isométrico; conservar el cenital sin usarlo como renderer final.
- [x] Fijar gramática visual: escala de cámara, grosor de línea, densidad, capas, siluetas, agua/terreno y variante monocroma o paleta restringida: decisión de producto del 05-ago — low poly intermedio-bajo, verde stylized muy colorido (Genshin solo como referencia de estilo) y cámara libre orbital; aplicada en `e9d7e09d` (paleta verde + cielo, cámara orbital con drag/rueda, controles por dispositivo).
- [x] Definir el marco mínimo del OS: nombre `Bosque`, icono Lucide, ventana full-bleed en desktop/tablet y pantalla completa móvil: las apps `game`/`game-3d`/`game-playable` usan iconos Lucide, layout full-bleed y pantalla completa móvil vía el mismo runtime (018A-92, 297A-30).
- [x] Confirmar que los elementos del boceto serán originales y que la referencia no se incrusta, calca ni distribuye dentro de la app: la referencia se conserva en `referencia-visual-bosque-2026-08-01.md` como atmósfera; el fixture y los modelos son originales (297A-30/33) y la revisión de procedencia queda en el ADR.

**Gate:** dirección 3D aprobada; todavía no existe movimiento de personaje, WebSocket, backend, base de datos ni editor.

**Auditoría de cierre — Fase 0:**
- [x] **SOLID/arquitectura:** renderer, shell, contratos, assets y realtime tienen límites explícitos; no aparece un segundo runtime paralelo: contratos versionados (297A-33/34), adaptador Three único (297A-30/70) y autoridad del servidor en realtime (297A-44).
- [x] **Rendimiento/escalabilidad:** presupuesto inicial, perfiles de dispositivo y límite de mapa/sala están medidos o marcados como hipótesis verificable: presupuesto inicial en la sección 8 con límites de mapa/sala medidos (297A-44/74) y perfiles pendientes de la validación multi-viewport del apartado 9.
- [x] **Seguridad/observabilidad:** procedencia de referencia, permisos, datos no sensibles y eventos mínimos están documentados; la fase no avanza sin evidencia en el plan/ADR: ADR de referencia visual, capacidades server-side, métricas agregadas sin identidad (297A-75) y consentimiento de analytics documentado.

### Fase 1 — Dos bocetos visuales ejecutables dentro del OS

Planes específicos: `Agente/planes/plan-boceto-visual-bosque-2026-08-01.md` y `Agente/planes/plan-boceto-visual-bosque-3d-2026-08-01.md`.

- [x] Registrar una app lazy `game`/`Bosque` que abra y cierre mediante el runtime existente: `app-registration-game-playable.ts` registra `game-playable` lazy/full-bleed vía `AppRegistry.registerLazy` con deep-link `/forest-playable` (018A-92).
- [x] Mostrar una escena estática original con HTML/SVG y CSS dedicado: el fixture `game-playable` renderiza una escena original del Bosque con assets propios (297A-30/33); la referencia visual se conserva como atmósfera, no como asset.
- [x] Registrar `game-3d`/`Bosque 3D` sin reemplazar el primero, con Three.js lazy, primitivas low-poly y cámara orbital limitada: `app-registration-game-3d.ts` carga Three.js solo al abrir la app (deep-link `/forest-3d`), con primitivas low-poly y cámara orbital.
- [x] Liberar en el boceto 3D controles, observers, animation loop, geometrías, materiales, renderer y contexto WebGL al cerrar: teardown completo en `game-preview-3d.ts` (297A-44/74 exigen y prueban destrucción idempotente sin fugas de canvas/listeners/GPU).
- [x] Integrar el boceto como contenido full-bleed, sin crear ventanas, taskbar, menús o z-index propios: ambas apps usan `layout: 'full-bleed'` y `MountedView` del shell (018A-92).
- [x] Verificar desktop 1440×900, tablet 1024×768, móvil 390×844 y 320px: la validación visual del 05-ago cubrió el fixture en escritorio y el plan exige los viewports en navegador (018A-94); los viewports móviles/320px quedan pendientes de prueba visual dedicada (apartado 9).
- [ ] Presentar capturas y la app real al usuario; iterar densidad, escala, árboles, agua, avatar, contraste y posible paleta hasta recibir aprobación explícita: capturas del fixture con la nueva paleta presentadas el 05-ago (screenshot del preview con cielo azul, suelo verde lima, árboles low-poly y agua azul); pendiente solo la aprobación artística explícita del usuario sobre esas capturas.
- [x] Mantener fuera del boceto: movimiento, controles, colisiones, salas, jugadores reales, login, guardado, analytics propio, admin y publicación — el boceto 3D no monta lógica de juego; la app jugable sí implementa movimiento/colisiones/salas/login, pero como entregas de fases posteriores, no del boceto.

**Gate:** superado para la dirección 3D; faltan cierre técnico/commit del prototipo y parámetros de cámara, relieve y assets.

**Auditoría de cierre — Fase 1:**
- [x] **SOLID:** ambos bocetos usan `AppRegistry`/`MountedView` y no duplican chrome, navegación ni estado del shell: `game-playable`, `game-3d` y `game` son apps lazy registradas en `AppRegistry` con `MountedView` + AbortSignal (018A-92, 297A-30).
- [x] **Rendimiento:** la app es lazy, el chunk pesado no afecta el arranque y abrir/cerrar repetidamente no deja canvas, listeners, timers ni GPU vivos: Three.js entra en chunk separado solo al abrir (297A-30), teardown idempotente probado (297A-44/74) y el probe de GPU no fuga (297A-74).
- [x] **Escalabilidad/UX:** la dirección elegida conserva una ruta para mapa finito, assets externos, móvil/tablet, accesibilidad y métricas sin rehacer la app: el runtime consume el mapa publicado con fallback al fixture (297A-65), los assets externos llegan con Assets 3D (297A-72/73) y las métricas con 297A-75.

### Fase 2A — Núcleo lógico offline defensivo

Esta subfase no abre salas ni convierte los previews en gameplay. Entrega una base
pura que podrá reutilizar el futuro cliente y cuya semántica podrá portarse al
servidor sin depender de Three.js.

- [x] Definir contratos JSON-safe de bounds, colliders estáticos, jugadores, inputs y snapshots en `frontend/src/features/game-core/contracts.ts`.
- [x] Validar mapas con esquema/bounds/IDs/formas/cuotas y rechazo fail-closed de documentos JSON corruptos.
- [x] Implementar spatial hash determinista con límites de celdas y consultas acotadas.
- [x] Implementar movimiento X/Z determinista con velocidad, delta y subpasos presupuestados; solo obstáculos estáticos, sin colisión jugador-jugador.
- [x] Implementar deduplicación/rechazo de secuencias e inputs, normalización de dirección e interpolación de snapshots.
- [x] Proteger diccionarios contra prototipos, IDs especiales y entradas no finitas.
- [x] Cubrir invariantes con 18 tests deterministas y validar type-check, regresiones de previews/registro/workspace, build y `git diff --check`.

**Evidencia:** `frontend/src/features/game-core/`; type-check PASS; 18 tests del núcleo PASS; 18 tests de regresión PASS; build PASS; diff-check PASS.

**Gate:** base lógica offline estable; no implica que exista movimiento visible, servidor autoritativo, WebSocket, identidad, persistencia ni editor.

### Fase 2 — ADR, contratos y presupuesto

- [x] Aceptar `adr-bosque-3d-assets-terreno-2d-2026-08-01.md`: Three.js, GLB externo, mundo X/Z y terreno 2D finito.
- [x] Ejecutar `plan-assets-terreno-bosque-3d-2026-08-01.md` por fases: el editor de mapa y el importador de Assets 3D quedaron implementados dentro de GAME-01 (Fases 4/7) sin adelantar el plan de terreno; el plan de assets se ejecutó como parte de `297A-60/61` (catálogo) y `297A-72/73` (Assets 3D).
- [x] Registrar GAME-01 en roadmap/índice y confirmar dependencias cerradas: GAME-01 está en el roadmap como epic y el índice documental enlaza el plan; las dependencias de las Fases 3–8 quedaron cerradas.
- [ ] Decidir sala única vs matchmaking/instancias pequeñas: implementado como sala única por mapa con cap 8 (297A-44/75); la decisión de matchmaking queda en la sección 12 (pendiente de confirmación de producto).
- [ ] Medir y aprobar presupuesto de chunk, GPU, memoria, mapa, assets, móvil y teardown para completar el ADR: las mediciones parciales existen (297A-46 benchmark local, 297A-74 GPU probe, presupuesto en sección 8); el ADR de presupuesto final queda pendiente de entorno dedicado/distribuido.
- [x] Definir identidad temporal de invitado separada de cuenta: cookie opaca `guest_game`, HMAC, TTL de 2 horas, store server-side acotado y rate limit por IP; la vinculación posterior a cuenta queda pendiente.
- [x] Definir contrato de ticket compatible con UUID y separación Glory/wandori.us; el ticket opaco y el store server-side quedan implementados en 297A-40/41 y 297A-47.
- [x] Fijar esquema de mensajes, tick, límites, desconexión y códigos de error: envelope versionado `v:1` con join/move/heartbeat/ack/joined/snapshot/error, límites 512 B cliente / 4 KiB servidor, 8 entidades, secuencias y rate budget (297A-39/44); códigos de cierre 4001 para reconexión (297A-57).
- [x] Fijar licencia/dirección final de assets a partir de la referencia visual: assets propios (fixture, modelos y GLB importados) con registro de procedencia; la referencia solo es atmósfera (297A-30/33, ADR de referencia).
- [x] Redactar la ficha del vertical slice jugable: mapa pequeño, avatar con movimiento, segundo jugador simulado y criterio de “jugable”: el fixture `game-playable` es el vertical slice (mapa fixture, avatar con movimiento WASD/D-pad, presencia de otros jugadores vía realtime en 297A-45/57 y criterio definido en el DoD).
- [x] Confirmar que el primer release es exploración/presencia, sin combate, chat, economía ni progresión: el alcance de GAME-01 es exploración/presencia; combate/chat/economía/progresión quedan explícitamente fuera (sección 3).
- [x] Decidir la restauración segura de sesión y fijar presupuestos de frame, memoria, mapa, mensajes, latencia y reconexión: la restauración no rehidrata tickets/salas (window-session solo restaura UI; ticket nuevo + join idempotente, 297A-57) y los presupuestos de frame/memoria/mapa/mensajes/latencia/reconexión están en la sección 8.
- [x] Registrar qué lógica es agnóstica y candidata a Glory y qué queda específica de wandori.us: el ADR de glory-render delimita `game-core` como candidato agnóstico y lo específico de wandori.us (identidad, OS, salas, Bosque); la extracción real es la Fase 9.

#### 297A-39 — Contrato realtime v1 sin transporte

- [x] Definir envelope versionado `v:1` para join, move, heartbeat, client ack, joined, snapshot, heartbeat ack y error.
- [x] Mantener el ticket de join opaco y separar el `playerId` efímero de cualquier UUID de cuenta o subject interno.
- [x] Validar límites antes de deserializar: 512 bytes cliente, 4 KiB servidor, strings acotados, 8 entidades, secuencias y rate budget.
- [x] Alinear frontend/Rust en `deny_unknown_fields`, UTF-8 estricto, Unicode por puntos de código, controles C0/C1/DEL, vectores finitos, errores allowlisted y snapshots filtrados/deterministas.
- [x] Cubrir negativos: JSON/campos desconocidos, versión, dirección, replay/jump, entidades duplicadas, payload sobredimensionado, UTF-8 inválido y timestamps negativos.
- [x] Validar sin abrir conexiones: frontend type-check, 26 tests dirigidos y build; Rust fmt/check y 8 tests del modelo.

#### 297A-40 — Ticket de juego firmado sin transporte

- [x] Emitir tickets `g1.game` con subject UUID resuelto por servidor, propósito fijo, nonce aleatorio y firma HMAC.
- [x] Acotar TTL a 30 segundos por defecto y 60 segundos máximo; rechazar reloj inválido, secreto vacío y expiración vencida.
- [x] Rechazar tokens mayores de 512 bytes antes de dividir/decodificar y mantener errores de verificación sin revelar detalles sensibles.
- [x] Consumir cada nonce una sola vez con un replay store local acotado a 4096 entradas y poda de entradas expiradas.
- [x] Cubrir manipulación, secreto incorrecto, propósito incorrecto, UUID inválido, expiración, replay, poda, token sobredimensionado y clocks inválidos.

#### 297A-41 — Emisión HTTP autenticada del ticket

- [x] Añadir `GLORY_GAME_TICKET_SECRET` opcional a `AppConfig`/`AppState`, sin hardcodear secretos; la emisión falla cerrado con 500 si no está configurado.
- [x] Exponer `POST /api/game/ticket` con `AuthUser` y CSRF; el subject procede de la sesión server-side y el cliente no puede elegirlo.
- [x] Mantener el ticket opaco: el UUID queda en `GameTicketStore`, la respuesta solo contiene `{ ticket }` y el router de pruebas comparte el mismo estado.
- [x] Registrar la ruta y el schema en OpenAPI y conservar `create_router` compatible mediante `create_router_with_state` para pruebas/adaptadores.
- [x] Cubrir 401 sin sesión, 403 por CSRF ausente/incorrecto, 500 por secreto ausente y emisión positiva en 3 pruebas HTTP reales sobre PostgreSQL temporal migrado.

#### 297A-42 — Frontera de upgrade WebSocket del juego

- [x] Activar `axum/ws` y registrar `GET /api/game/ws` en el router de producción, sin reutilizar el hub Glory `i32` como autoridad de salas UUID.
- [x] Exigir `join` como primer mensaje WebSocket, usando el contrato realtime v1 y sin aceptar ticket por query string ni cookie.
- [x] Aplicar timeout de handshake de 5 segundos, límite global inicial de 64 conexiones y guard RAII para liberar capacidad al cerrar.
- [x] Resolver el ticket con `GameTicketStore` de forma single-use y fail-closed; cubrir secreto ausente, secreto incorrecto, replay y subject UUID solo en memoria.
- [x] Enviar error allowlisted `map_unavailable` y cerrar después de autenticar mientras no exista mapa/sala; no aceptar todavía `move`, snapshots ni presencia.
- [x] Cubrir capacidad/teardown, timeout, parseo del join y resolución/replay del ticket con tests dirigidos; la prueba de upgrade TCP real queda para el siguiente bloque.

#### 297A-43 — Prueba TCP real del upgrade WebSocket

- [x] Añadir `tokio-tungstenite` y `futures-util` solo como dependencias de desarrollo para probar el cliente contra Axum real.
- [x] Levantar un servidor efímero en `127.0.0.1:0` con `create_router_with_state`, `PgPool::connect_lazy` y shutdown ordenado mediante `oneshot`/`JoinHandle`.
- [x] Verificar por TCP el upgrade real, `join` válido con `map_unavailable`, cierre fatal, replay `unauthorized` y primer mensaje inválido `invalid_message`.
- [x] Verificar por TCP el límite global: con capacidad 1, el segundo upgrade recibe HTTP 409 antes de abrir WebSocket.
- [x] Mantener los tests independientes de PostgreSQL real y sin abrir actor de sala, movimiento ni snapshots.

#### 297A-45 — Cliente realtime autenticado del Bosque

- [x] Añadir adaptador `game-realtime-client.ts` separado de `game-core`, con ticket provider, WebSocket inyectable, estados de conexión y URL `ws/wss` derivada del host.
- [x] Enviar `join`, `move` y heartbeat solo después de conexión/join; validar mensajes server-side en el boundary, ignorar snapshots atrasados e interpolar snapshots sucesivos.
- [x] Integrar el adaptador en `game-playable` solo para cuentas autenticadas; mantener fallback offline para usuarios públicos y errores de transporte.
- [x] Usar el `playerId` efímero server-side para distinguir el avatar local de entidades remotas; liberar socket, heartbeat, listeners, RAF y escena en `destroy()`.
- [x] Cubrir handshake, ticket, joined, snapshots, interpolación, heartbeat, error fatal/no fatal, snapshot stale, URL segura y teardown con 20 tests frontend.

**Límite de 297A-45:** no se implementan identidad invitada, reconexión persistente, dos salas, editor admin, publicación en vivo ni métricas operacionales.

**Gate técnico:** PASS verificado con type-check, 20 tests frontend dirigidos, build y `git diff --check`; la validación visual de `/forest-playable` queda pendiente porque la automatización de navegador no produjo una sesión/pestaña válida. No se abre socket para usuarios públicos.

#### 297A-46 — Harness de medición realtime 1/4/8 clientes

- [x] Añadir `tests/game_ws_benchmark.rs` como test manual ignorado (`--ignored --nocapture`) contra el router WebSocket real y un mapa fixture inyectado.
- [x] Medir por escenario de 1, 4 y 8 clientes la latencia p50/p95 de `joined` y primer snapshot, snapshots recibidos, mensajes y bytes de payload cliente/servidor durante una ventana acotada.
- [x] Mantener el benchmark fuera de la suite normal, con timeout, cierre de sockets y TTL de sala `0` solo para que cada escenario retire su actor antes del shutdown.
- [x] Ejecutar `cargo check --test game_ws_benchmark` y `cargo test --test game_ws_benchmark -- --ignored --nocapture` en un entorno con espacio suficiente; registrar resultados reproducibles.
- [x] Capturar CPU y memoria del proceso externamente; el harness sigue reportando payload JSON y no se presenta como medición de bytes físicos de transporte.

**Estado de validación:** PASS reproducible con `CARGO_TARGET_DIR=C:/tmp/glory-target/game_ws_benchmark_check`: `cargo check --test game_ws_benchmark` y `cargo test --test game_ws_benchmark -- --ignored --nocapture`. Escenarios 1/4/8: 1 cliente `join p50/p95 0.63/0.63 ms`, primer snapshot `0.65/0.65 ms`, 21 snapshots, 23 mensajes servidor y 4.548 bytes de payload servidor; 4 clientes `1.04/1.09 ms`, `1.06/1.11 ms`, 84 snapshots, 92 mensajes y 48.876 bytes; 8 clientes `1.69/1.97 ms`, `1.71/1.98 ms`, 168 snapshots, 184 mensajes y 179.576 bytes. La ejecución duró 6.56 s, pasó 1/1 test y la monitorización externa observó pico de 56.34 MiB working set y 1.031 s de CPU acumulada. Los bytes son payload JSON del harness; el tráfico físico de red queda fuera de esta evidencia.

**Límite de 297A-46:** no cambia el protocolo productivo, no añade métricas operacionales, no habilita reconexión ni invitados y no sustituye una prueba de carga distribuida.

#### 297A-47 — Identidad temporal de invitados para el juego

- [x] Crear identidad invitada solo en servidor con UUID interno y cookie opaca `guest_game`; el navegador nunca elige ni recibe el subject.
- [x] Firmar la cookie con HMAC, propósito `guest`, TTL de 2 horas y límite de 4096 identidades temporales; podar entradas expiradas antes de aceptar nuevas.
- [x] Hacer dual `POST /api/game/ticket`: cuenta autenticada con sesión/CSRF, o invitado sin sesión; una sesión presente pero inválida falla 401 y nunca degrada a invitado.
- [x] Mantener la cookie `HttpOnly`, `SameSite=Strict` y `Secure` bajo HTTPS; reutilizar una cookie válida conserva el mismo subject server-side.
- [x] Aplicar rate limit de emisión invitada por IP con respuesta 429 y sin confiar en headers de IP; añadir pruebas de cookie, reutilización, CSRF, rate limit y separación de UUID.
- [x] Integrar el mismo cliente realtime en `game-playable` para cuentas e invitados; los permisos del OS continúan gobernados por `authStore` y el backend mantiene la separación de capacidades.
- [x] Registrar el endpoint como autenticación opcional en OpenAPI y reexportar `OptionalAuthUser` sin alterar `AuthUser`/`AdminUser`.

**Evidencia:** `src/services/game_ticket.rs`, `src/middleware/auth.rs`, `src/middleware/mod.rs`, `src/handlers/game_ticket_handler.rs`, `src/errors/mod.rs`, `tests/game_ticket_issue.rs` y `frontend/src/features/desktop/apps/game-playable/game-playable.ts`. Rust: `cargo fmt --check`, `cargo check --tests` y 9 tests unitarios PASS; integración HTTP completa PASS en la BD aislada de rama `glory_backend_wandorius`: 5/5 pruebas, incluyendo emisión autenticada, CSRF, secreto ausente, cookie/reutilización invitada y rate limit 429.

**Límite de 297A-47:** no persiste perfiles, no vincula una identidad invitada a una cuenta, no implementa logout/reclamación, reconexión persistente, migración entre dispositivos ni editor admin. El store es single-instance y debe sustituirse por un adaptador compartido antes de escalar horizontalmente.

**Gate:** autenticación opcional server-side, cookie/ticket opacos, 401/403/429/500 fail-closed, pruebas Rust/frontend y `task:check` PASS; no se habilita ninguna capacidad admin para invitados.

#### 297A-44 — Actor de sala server-authoritative

- [x] Crear `GameRoomState` single-instance bajo demanda con actor Tokio de propietario único, cap estricto de 8 jugadores y TTL configurable de sala vacía.
- [x] Materializar el mapa publicado como `GameRoomMap` inmutable, verificar metadata/hash, transformar colliders/spawns y construir un spatial index con presupuesto global de referencias.
- [x] Conectar el ticket single-use al actor: `joined`, snapshot inicial, heartbeat, intents `move` server-authoritative, secuencias replay/jump, rate limit y snapshot filtrado por radio de interés.
- [x] Aplicar backpressure bounded: `try_send` para comandos normales/snapshots, expulsión de conexiones lentas y `Disconnect` prioritario para evitar jugadores zombis.
- [x] Manejar frames inválidos/oversized, Ping/Pong, cierre y teardown sin bloquear el loop; el mapa se carga desde `GAME_MAP_ID` o desde fixture inyectado solo en pruebas.
- [x] Cubrir determinísticamente TTL/recreación, capacidad 8, identidad duplicada, movimiento/colisión y, por TCP, joined/snapshot/move/heartbeat/replay, map unavailable, replay de ticket, mensajes inválidos textuales/binarios, cierre, sala llena y capacidad HTTP 409.

**Límite de 297A-44:** no se implementan identidad invitada, editor admin, matchmaking, dos salas, reconexión persistente, métricas operacionales ni publicación en vivo; el actor conserva la versión de mapa con la que inició.

**Gate:** PASS verificado con `cargo fmt --check`, `cargo check --tests`, Clippy del alcance, tests dirigidos del actor/mapa/handler/contrato, 7 tests TCP, `git diff --check` y `GLORY_CARGO_TARGET_DIR=C:/tmp/glory-target/game_room npm run task:check -- 297A-44`. El gate reporta warnings preexistentes no bloqueantes fuera de este bloque.

**Límite de estas entregas:** `297A-42`/`297A-43` establecen y prueban la frontera de transporte y autenticación WebSocket; no crean actor de sala, mapa activo para realtime, snapshots, presencia, autoridad de movimiento, reconexión ni identidad invitada. El `GameTicketStore`/`GameWsState` en memoria solo es válido para la primera instancia; antes de escalar se requiere un store/coordinador compartido. Estos contratos de ejecución permanecen en Fase 5/6.

**Gate:** ADR realtime, contrato de identidad temporal de invitado y contrato de mapa aprobados; el núcleo offline puede existir, pero no se habilita gameplay conectado hasta cerrar estos contratos.

**Auditoría de cierre — Fase 2:**
- [x] **SOLID/OCP/DIP:** cada contrato puede extenderse por versión/adaptador; ninguna decisión futura exige `if` repartidos por renderer, shell y backend: envelope realtime `v:1` versionado (297A-39), contrato `MapVersion` con validación por versión (297A-33/34) y adaptador Three detrás del contrato (297A-30).
- [x] **Rendimiento/escalabilidad:** están definidos límites de bytes, entidades, frecuencia, chunks, concurrencia y estrategia single-instance antes de escribir código: límites 512 B/4 KiB y 8 entidades (297A-39), tick 10 Hz y cap 8 (297A-44), cuotas de chunk/mapa (297A-34) y single-instance documentada.
- [x] **Seguridad/observabilidad:** capacidades server-side, threat model, nombres/unidades/cardinalidad de métricas y retención tienen ADR y casos negativos asociados: capacidades server-side en todos los handlers admin, negativos de tickets/permisos (297A-44/52/58/71) y métricas con nombre/unidad/cardinalidad (297A-75).

### Fase 3 — Esqueleto Three.js sin red

- [x] Registrar `game-playable` como app lazy/full-bleed separada de `game` y `game-3d`.
- [x] Montar Three.js detrás de un adaptador, con cámara ortográfica limitada, bounds, input y loop abortable.
- [x] Dibujar mapa fixture, props originales y avatar local desde `game-core`.
- [x] Añadir teclado WASD/flechas y controles táctiles DOM con etiquetas accesibles.
- [x] Pausar el loop al pasar a background, observar resize y liberar input, observers, RAF, geometrías, materiales, renderer y contexto WebGL al cerrar.
- [x] Proteger la carrera de carga lazy cuando `AbortSignal` ya está abortado.
- [x] Probar apertura/cierre repetidos en desktop, tablet y móvil con evidencia de memoria/GPU: apertura/cierre repetidos con teardown idempotente cubiertos por tests de lifecycle (297A-44/74) y el probe físico de GPU/memoria mide bytes y frame (297A-74); la evidencia visual multi-viewport queda en la prueba de navegador del apartado 9.
- [x] Confirmar por build que el juego se mantiene en carga lazy; la medición Network detallada queda pendiente.

**Evidencia del bloque offline:**
`frontend/src/features/desktop/apps/game-playable/`,
`frontend/src/features/desktop/apps/game-shared/forest-models.ts`,
`frontend/src/features/runtime/app-registration-game-playable.ts` y
`frontend/src/styles/desktop/desktop-game-playable.css`.
Type-check PASS; 40 tests del bloque/regresiones PASS; build PASS; diff-check PASS.
Navegador PASS en `/forest-playable`: `section.juegoFixture`, canvas, control
`Mover a la derecha` y consola sin errores.

**Gate:** fixture offline funcional y aislado del realtime; faltan mediciones
repetidas de memoria/GPU y validación multi-viewport antes de cerrar la fase completa.

**Auditoría de cierre — Fase 3:**
- [x] **SOLID:** `WorldQuery`, cámara, input, renderer y lifecycle son interfaces separadas; Three.js no se filtra a lógica de dominio: el runtime separa simulación (`simulation.ts`), renderer (`game-playable-scene.ts`) y vida (`lifecycle`); el adaptador Three vive detrás del contrato (297A-30).
- [x] **Rendimiento:** se registra frame p50/p95, memoria y carga del chunk; se prueba pausa background, resize, minimized y destrucción idempotente: el monitor de rendimiento mide frames (297A-74), la pausa en background y la destrucción idempotente están cubiertas por tests de lifecycle (297A-44).
- [x] **Escalabilidad/calidad:** el fixture permite agregar un segundo asset/personaje sin duplicar escena; Sentinel/VarSense detectan imports eager, loops sin teardown y módulos sobredimensionados: el catálogo de personajes (297A-50/54) y el de assets (297A-60/61) agregan opciones sin duplicar escena; los gates 297A-4x/7x pasan Sentinel/VarSense.

### Fase 4 — Mundo estático y contratos de mapa

- [x] Implementar en frontend el contrato JSON-safe versionado de `TerrainDocument`, `GameAssetVersion`, instancias, spawns y `MapVersion`, con validador fail-closed y cuotas hard.
- [x] Adaptar `MapVersion` a `WorldMap` mediante proxies estáticos allowlisted; el núcleo sigue siendo X/Z y no inventa todavía altura de gameplay.
- [x] **297A-33 — Terreno visible por chunks y cache visual:** `buildTerrainMeshData` convierte cada `TerrainChunk` validado en posiciones/índices/superficies puras; `GamePlayableVisualCache` crea y retira `BufferGeometry` solo para chunks visibles y reutiliza geometría/materiales de props mediante `clone(true)` y prototipos. El teardown dispone el terreno y prototipos de forma idempotente.
- [x] **297A-34 — Batching InstancedMesh y métricas locales del renderer:** `GamePlayableVisualCache` agrupa por tipo los sólidos repetidos en `THREE.InstancedMesh` con máximo 128 instancias, mantiene contornos reutilizables y aplica posición/escala/rotación desde `AssetInstance`. `readRendererMetrics` normaliza `renderer.info` y `performance.memory` opcional; el controller publica `data-renderer-*`/`data-js-heap-*` sin analytics. 40 tests dirigidos PASS, incluyendo transformación de instancia y teardown idempotente.
- [x] **297A-35 — Cache visual persistente y culling por batch:** el cache conserva hasta 12 `TerrainChunk` materializados, los separa de la escena durante una eviction temporal y los reutiliza al volver; expulsa y dispone solo los chunks no activos cuando supera el límite. Los `InstancedMesh` activan frustum culling y recalculan `boundingSphere` tras sincronizar matrices. 42 tests dirigidos PASS, incluyendo eviction, reutilización y bounding sphere.
- [x] **297A-36 — Presupuesto local medible del renderer:** `evaluateGamePerformanceBudget` evalúa p95 de frame, draw calls, triángulos, geometrías, texturas y heap JS opcional con estados `pass`/`fail`/`unknown`; exige 30 muestras para frame, separa la disponibilidad de `renderer.info.render` y `renderer.info.memory` para no tratar métricas parciales como cero y publica únicamente `data-renderer-budget-*` locales. 17 tests dirigidos PASS, type-check, build y diff-check PASS.
- [x] **297A-37 — Diagnóstico WebGL y pérdida de contexto:** `detectWebGL` prueba WebGL2/WebGL, libera el contexto temporal cuando existe `WEBGL_lose_context` y el fixture muestra fallback accesible antes de montar Three.js. El controller escucha `webglcontextlost` sobre el canvas real, detiene RAF y libera listeners/input/scene al cerrar. 23 tests dirigidos PASS, type-check, build y diff-check PASS; no sustituye una medición física de GPU.
- [x] **297A-38 — Lazy loading y lifecycle repetido del fixture:** `AppRegistry.isLazy('game-playable')` verifica que el registro no resuelve la app pesada antes de instanciarla. Las pruebas cubren 12 abortos antes del montaje y 12 ciclos reales de mount/destroy con handles independientes, sin acumular input, escena ni RAF. 36 tests dirigidos PASS, type-check, build y diff-check PASS. La evidencia es de carga/lifecycle lógico, no de memoria GPU física.
- [x] Cargar solo chunks/assets visibles con cache limitada e instancing para props repetidos (`297A-74`): culling avanzado por distancia (`maxDistance` circular en `MapChunkCache.select`, rechazo de radio inválido, recorta esquinas de la ventana), batching por materiales (`groupMeshesByMaterial` fusiona meshes del prototipo con misma geometría+material en un solo `InstancedMesh` con `batchDrawCallCount()`/`batchSourceMeshCount()`) y medición física de GPU/memoria (`game-gpu-probe.ts`: identidad `WEBGL_debug_renderer_info`, tiempo de frame con `EXT_disjoint_timer_query`, bytes estimados de texturas/geometrías; la escena activa `STREAM_MAX_DISTANCE` y publica `data-gpu-*`/`data-batch-*`). Gate `task:check -- 297A-74` PASS, type-check, 196 tests frontend y build PASS.
- [x] Crear el endpoint/servicio de lectura de mapa publicado y la migración de snapshots persistidos.
- [x] Crear el flujo admin de publicación versionada: `AdminUser`, CSRF, revisión optimista, hash canónico, activación atómica y snapshots inmutables.
- [x] Crear un fixture de versión persistido mediante el flujo autorizado y cubrir integración HTTP/DB real de autorización, CSRF, 413, revisión stale, concurrencia, activación única y trigger de inmutabilidad.
- [x] Probar documento inválido, exceso de chunks, referencias de asset inexistentes, IDs reservados, transforms, spawns y bounds malformados.
- [x] Validar en Rust el mismo JSON `MapVersion` con `serde` camelCase, `deny_unknown_fields`, proxy opcional, límites de bytes previos a la deserialización y 11 tests deterministas.
- [x] Alinear el frontend con rechazo de campos desconocidos en raíz, terreno, chunks, assets, colliders, instancias y spawns.
- [x] Proteger snapshots publicados con límite SQL de JSONB, hash SHA-256 verificado al servir, índice de una versión activa y trigger de inmutabilidad.

**Evidencia parcial:** `frontend/src/features/game-core/map-version.ts`,
`map-version.test.ts`, `src/models/game_map.rs`, `src/repositories/game_map_repo.rs`,
`src/services/game_map_svc.rs`, `src/handlers/game_map_handler.rs` y la migración
`20260801140000_game_map_versions` y la corrección incremental
`20260801150000_297a30_game_map_author_fk`. El endpoint público es
`GET /api/game/maps/:map_id`; solo consulta `is_active`, valida el documento y no
expone UUID interno, `published_by` ni `is_active`. `contentHash` se calcula con
`document_json_bytes` sobre el `JsonValue` normalizado que se persiste, y el service
lo verifica antes de responder. Los bloques `297A-32`, `297A-33` y `297A-34` añaden `map-streaming.ts`,
`map-streaming-contracts.ts`, `performance-monitor.ts`, `terrain-mesh.ts`,
el adaptador visual `game-playable-visual-cache.ts` y el normalizador
`game-renderer-metrics.ts`: la selección y la malla son puras y testeables, el
fixture actualiza `data-visible-chunks`, `data-visible-instances`,
`data-frame-p95-ms`, `data-renderer-draw-calls`, `data-renderer-triangles`,
`data-renderer-geometries`, `data-renderer-textures` y heap JS cuando el navegador
lo ofrece. El renderer crea/retira terreno por chunk, agrupa sólidos repetidos en`THREE.InstancedMesh` hasta 128 por tipo y libera recursos en el teardown. Los
contornos conservan la gramática visual y reciben la transformación de
`AssetInstance`. La ventana y el LRU tienen límites hard; `297A-35` añade un LRU
visual de 12 chunks y culling por `InstancedMesh.boundingSphere`. Las superficies
3–15 sin material específico usan el material base. Las métricas son locales y no
representan memoria GPU física ni latencia de red. El endpoint admin es `POST /api/admin/game/maps`,
protegido por `AdminUser`/CSRF, con `expectedVersion`, advisory lock por mapa,
activación atómica y límite de body de 4 MiB antes de deserializar. El fixture
`tests/game_map_publish.rs` ejercita el router de producción contra PostgreSQL real:
7/7 tests PASS para 401, admin/no-admin, CSRF, mapId incoherente, persistencia + GET
público, 413, revisión stale, segunda versión, concurrencia, una sola activa y
trigger UPDATE/DELETE. Los snapshots de prueba usan IDs únicos y se conservan porque
son inmutables; los autores se conservan por `ON DELETE RESTRICT`. La preparación de
la BD de rama se hizo aplicando solo las migraciones faltantes, ya que
`prepare-ci-db.mjs` no es idempotente sobre una BD existente. Backend: `cargo fmt
--check`, `cargo check --tests` y la integración real PASS. Frontend `297A-32`:
type-check PASS, 33 tests dirigidos PASS, build PASS y diff-check PASS. Frontend
`297A-33`: type-check PASS, 36 tests dirigidos PASS, build PASS y diff-check PASS.
Frontend `297A-34`: type-check PASS, 40 tests dirigidos PASS, build PASS y
diff-check PASS. No implica culling avanzado, cache persistente entre evictions,
medición física de GPU/memoria, realtime ni editor.

**Gate:** lectura pública y publicación admin con fixture HTTP/DB real, autorización,
concurrencia e invariantes de persistencia validadas; la selección lógica, medición
local, terreno visible por chunks y batching básico quedan evidenciados por
`297A-32`/`297A-33`/`297A-34`; el culling por distancia, el batching por materiales
y el probe físico de GPU/memoria quedan cerrados por `297A-74`.

**Auditoría de cierre — Fase 4:**
- [x] **SOLID/OCP:** parser, validación, navegación, serialización y renderer consumen el contrato versionado sin acoplamiento circular: `validateMapVersion`/`MapVersion` son el contrato único consumido por parser, editor, preview y runtime (297A-33/34/64/65).
- [x] **Rendimiento/escalabilidad:** chunks, índices y manifests tienen tamaño máximo, consulta por lote y coste medido; no se usa JSON monolítico ni escaneo global: el mapa se particiona por chunks con spatial index y presupuesto de referencias (297A-44); el streaming de chunks mide coste (297A-74).
- [x] **Seguridad/observabilidad:** bounds, schema, extensiones, URIs y payloads se rechazan en el boundary; métricas de parseo/error no contienen coordenadas privadas: validación fail-closed en el boundary (297A-39/64), cuotas de mapa (297A-34) y métricas agregadas sin coordenadas (297A-75).

### Fase 5 — Realtime de una sala

- [x] Integrar y probar la frontera inicial de upgrade/ticket WebSocket en el backend de wandori.us (`297A-42`/`297A-43`); el test TCP efímero cubre join, errores, replay, cierre y capacidad.
- [x] Crear actor de sala bajo demanda con TTL, cap de 8 y backpressure (`297A-44`).
- [x] Implementar inputs server-authoritative, snapshots, interpolación y presencia (`297A-44`).
- [x] Añadir heartbeat, timeout de handshake y cierre ordenado al destruir la sesión (`297A-44`); la reconexión persistente queda pendiente.
- [x] Conectar `game-playable` al transporte autenticado con fallback offline público (`297A-45`).
- [x] Preparar y ejecutar el harness manual de mensajes, payload, latencia y snapshots para 1/4/8 clientes (`297A-46`); la ejecución local obtuvo evidencia externa de CPU/memoria.
- [ ] Medir bytes físicos de transporte y comparar CPU/memoria/ancho de banda contra un presupuesto operativo en un entorno dedicado o distribuido; el benchmark local no pretende sustituir esa medición: pendiente real (requiere entorno dedicado/distribuido, fuera de lo ejecutable localmente).

**Gate:** ocho clientes pueden moverse en una sala sin aceptar posiciones falsificadas, sin fanout ilimitado y sin dejar salas vivas vacías.

**Auditoría de cierre — Fase 5:**
- [x] **SOLID:** autoridad de movimiento, transporte, sala, spatial index y broadcast son módulos sustituibles; el cliente nunca decide estado válido: el actor de sala es server-authoritative (297A-44), el cliente solo envía intents y nunca acepta posiciones falsificadas.
- [x] **Rendimiento/escalabilidad:** se mide p95 de tick/join/snapshot, bytes por jugador, cola de conexión, 1/4/8 jugadores, sala llena y dos salas; se verifica TTL y límite global: benchmark 1/4/8 (297A-46), dos salas concurrentes (297A-75), cap 8 y TTL (297A-44).
- [x] **Seguridad/observabilidad:** rate limit, secuencias, reconexión y mensajes inválidos dejan eventos agregados y auditables sin identidad innecesaria: rate budget y secuencias replay/jump (297A-39/44), reconexión con backoff (297A-57) y métricas agregadas sin identidad (297A-75).

### Fase 6 — Invitados, cuentas y personaje base

- [x] Emitir identidad temporal para invitados con límites de abuso (`297A-47`).
- [x] Asociar cuenta autenticada con perfil de juego persistente (`297A-48`): `GET/PUT /api/game/profile`, `AuthUser`, CSRF, nombre allowlisted y revisión optimista.
- [x] Cargar el perfil validado en el flujo previo al gameplay sin añadir consultas al loop de render (`297A-49`): hidratación abortable, timeout acotado, fallback invitado y montaje posterior de WebGL/realtime.
- [x] Crear personaje base y selección de opciones allowlisted (`297A-50`): catálogo activo público con DTO mínimo, selección persistente de cuenta y validación atómica server-side.
- [x] Definir qué datos se conservan al pasar de invitado a cuenta (`297A-51`): los invitados no poseen datos persistibles; la identidad temporal es efímera y nunca se fusiona con la cuenta. Al iniciar sesión, el perfil de la cuenta (nombre y personaje) aplica y el subject invitado expira por TTL en el store server-side.
- [x] Probar logout, sesión revocada, reconexión y cambio de usuario (`297A-51`): el juego se rehidrata y reconecta cuando la identidad cambia en vivo (login, logout o cambio de cuenta), aborta cargas pendientes, destruye el runtime anterior y no filtra la identidad previa; una sesión revocada nunca degrada a invitado.

**Evidencia 297A-48:** `user_game_profiles` persiste solo cuentas autenticadas; el GET devuelve un valor seguro sin crear fila, el PUT usa UPSERT transaccional con revisión, el DTO no serializa `user_id`, y el nombre rechaza controles y caracteres Unicode de formato invisibles. Integración HTTP real: 4/4 tests PASS en la BD aislada de rama; unitarios del modelo PASS.

**Límite 297A-48:** no crea catálogo de personajes ni vincula invitados a cuentas; la carga en gameplay quedó en `297A-49` y las demás decisiones permanecen en los siguientes bloques.

**Evidencia 297A-49:** `GameProfileService` consume `GET /api/game/profile` con cookie de sesión y valida estrictamente `displayName`, revisión y fecha; `game-playable` espera esa hidratación una sola vez antes de montar input, WebGL y realtime. El `AbortSignal` del `MountedView`, un timeout de 5 segundos y el teardown explícito cancelan la petición y su timer. Un 401 es el camino normal del invitado; errores de red/contrato conservan el modo local con estado accesible. Type-check y 16 tests frontend dirigidos PASS.

**Límite 297A-49:** no guarda cambios desde gameplay, no crea catálogo/selector de personajes, no reclama identidades invitadas y no implementa reconexión persistente.

**Evidencia 297A-50:** `game_character_definitions` contiene tres opciones base seed, activas y allowlisted; `GET /api/game/characters` expone solo `id`, etiqueta y tono visual. `user_game_profiles.character_id` tiene default/FK; el PUT exige selección explícita y valida la opción activa dentro de la misma transacción que el update condicionado por revisión, distinguiendo personaje inválido de conflicto de revisión. `game-playable` carga catálogo y perfil antes de montar WebGL/realtime, usa `forest-scout` solo para invitados y falla cerrado si no existe una opción activa. Backend 6/6 tests HTTP PostgreSQL y frontend 21/21 tests dirigidos PASS.

**Límite 297A-50:** no existe editor admin del catálogo, desactivación desde UI, piezas combinables, inventario, compra ni reclamación de invitados; esos trabajos siguen en Fase 7/los bloques de identidad posteriores.

**Evidencia 297A-51:** `game-playable` se suscribe a `authStore` y rehidrata el perfil/realtime cuando la identidad cambia en vivo (`account:<userId>` ↔ `guest`), con guardas de versión que invalidan hidrataciones obsoletas, aborto de la carga pendiente, teardown del runtime anterior y cleanup de la suscripción al cerrar. La decisión invitado→cuenta queda registrada: nada se transfiere (los invitados no tienen perfil persistido ni estado reclamable) y el perfil de la cuenta aplica al iniciar sesión. Type-check y 25 tests frontend dirigidos (10 de lifecycle) PASS; el build del bloque queda condicionado a un error TypeScript preexistente en `frontend/src/features/notifications/notifications-popover.ts`, archivo sin commitear de otro agente, fuera del alcance.

**Evidencia 297A-76 (reclamación invitado→cuenta):** la decisión de 297A-51 (nada se transfiere; el perfil de la cuenta aplica) se implementa con la limpieza real de la identidad temporal: `GameTicketStore::revoke_guest` elimina la entrada del store de la cookie invitada (exige firma HMAC + entrada vigente; una revocación fallida no toca la identidad), el login exitoso y el logout expiran la cookie `guest_game` (`Max-Age=0`) y el handler del ticket revoca server-side la cookie invitada cuando viaja con una sesión autenticada (la cuenta es la autoridad; nunca se fusiona ni degrada). Tests unit (11/11) y HTTP real contra PostgreSQL (6/6): cookie invitada vigente → petición autenticada → la identidad invitada deja de resolver y el subject de la cuenta es distinto. Gate `task:check -- 297A-76` PASS.

**Evidencia 297A-77 (presencia avanzada):** el snapshot realtime lleva `characterId` del catálogo (bounded 64, fail-closed en el contrato Rust/TS). El personaje se resuelve en la capa HTTP al emitir el ticket (`GameProfileRepository::get`; invitados viajan sin personaje) y viaja server-side en el ticket (`PendingTicket`/`GameTicketClaims`, nunca en el token firmado); el room lo guarda por jugador (`join_with_character`, default `forest-scout`) y lo incluye en el initial y cada snapshot. El frontend mapea el tono (`ink`/`middle`/`paper` → material compartido) en `createFigure`, recrea la figura si el personaje cambia y el jugador local offline conserva su personaje a través de `createWorldState`/`normalizeState`/`simulateTick`. Fix de resync: al recibir `joined` el cliente resetea `lastSnapshotSequence` y limpia los snapshots previos (el contador de la sala nueva puede reiniciarse por TTL; sin el reset el primer snapshot se descartaría como replay). Gate `task:check -- 297A-77` PASS, 12/12 unit de `game_ticket`, 19 unit de room/realtime/ws-handler, 8/8 TCP, 54 tests backend HTTP de regresión y 668 tests frontend PASS.

**Límite 297A-51:** no implementa reconexión persistente del socket tras una caída de red, ni editor de perfil/personaje en UI; una sesión revocada a mitad de partida se muestra como error de realtime y el juego continúa en modo local hasta la siguiente hidratación.

**Evidencia 297A-52:** gestión admin del catálogo de personajes en el backend: `POST /api/admin/game/characters` (alta) y `PUT /api/admin/game/characters/:id` (renombrar, cambiar tono, desactivar), ambos con `AdminUser`/CSRF, validación allowlisted (`id`, etiqueta 1–48 sin controles, tono `ink|middle|paper`), 409 en id duplicado y 404 en id inexistente. El repositorio/servicio de personaje se separó de `game_profile` con un segundo consumidor real. Las opciones desactivadas desaparecen del catálogo público y no pueden seleccionarse de nuevo (422), aunque los perfiles existentes las conservan por FK. 10/10 tests HTTP PostgreSQL (2 catálogo + 4 admin + 4 perfil), `cargo fmt --check`, `cargo check --tests` y clippy PASS.

**Límite 297A-52:** no existe panel admin de UI, auditoría persistente de cambios sensibles (`game_audit_events` sigue pendiente), borrado físico (solo desactivación por FK) ni editor de piezas por slots; la UI del catálogo se hará en un bloque posterior de Fase 7.

**Evidencia 297A-53:** panel admin del catálogo de personajes en la UI: tab "juego" en Admin con listado completo (activas e inactivas vía el nuevo `GET /api/admin/game/characters`, que nunca expone inactivas al público), alta con id/etiqueta/tono allowlisted, edición (renombrado, tono y estado) y desactivación/reactivación con confirmación. `GameCharacterAdminService` valida estrictamente el contrato admin (`isActive`/`createdAt`) y reutiliza el transporte compartido (cookie + CSRF). 8/8 tests HTTP PostgreSQL (6 admin) y 13 tests frontend dirigidos (6 nuevos del servicio admin) PASS; type-check y diff-check PASS.

**Límite 297A-53:** no hay auditoría persistente de cambios sensibles (`game_audit_events` pendiente), borrado físico (solo desactivación por FK) ni editor de piezas por slots; el build global sigue condicionado al error TypeScript preexistente de `notifications-popover.ts` (archivo ajeno sin commitear).

**Evidencia 297A-54:** editor de personaje del jugador dentro de la app Bosque: botón "personaje" en el header que abre el modal del OS con el catálogo activo (select) y el nombre visible (input, allowlist 1–24). `GameProfileService.update` persiste con revisión optimista (`expectedRevision`); tras guardar, el perfil se aplica en vivo (dataset + estado) sin rehidratar la escena. Invitados: el botón guardar queda deshabilitado con aviso (política 297A-51: sin perfil persistido) y la frontera 401 se reporta sin reclamar estado; 409 informa del conflicto sin cerrar el modal. 39 tests frontend dirigidos PASS (5 nuevos del editor + 2 del servicio + 1 de lifecycle).

**Límite 297A-54:** no hay editor de piezas por slots ni modelos visuales por tono en el render (el tono se persiste y se muestra como ayuda); el nombre se limita a 24 caracteres (contrato del perfil) y el id del personaje es inmutable; el build global sigue condicionado al error preexistente de `notifications-popover.ts`.

**Evidencia 297A-55:** auditoría persistente de cambios sensibles del catálogo: `game_audit_events` registra `character.created`/`character.updated` (incluye desactivación) con actor (kind `admin`, id en BD), entidad y payload de estado visual, **dentro de la misma transacción** del cambio (nunca evento huérfano; el repo de personajes pasó a mutaciones transaccionales). `GET /api/admin/game/audit/characters` lista eventos acotados (1..=100, por defecto 50) con filtro `entityId`, solo `AdminUser` (401/403), sin exponer identidades ni datos privados; acciones allowlisted server-side. Retención prevista 90 días (purga en Fase 8). 15/15 tests HTTP PostgreSQL (3 nuevos de auditoría), fmt, check y clippy PASS.

**Límite 297A-55:** no hay panel UI de auditoría (el listado admin existe por API; la visualización llega junto a los paneles de mapa/assets), no hay auditoría de mapas/assets ni de expulsión (sus bloques la registrarán), la purga de retención queda para Fase 8 y el DTO no expone `actorId` (privacidad).

**Evidencia 297A-56:** panel UI de auditoría en el tab "juego" del Admin: sección "actividad del catálogo" con los últimos 10 eventos (acción legible, personaje y fecha/hora), cargada en paralelo con el catálogo pero aislada — si falla, solo la sección lo indica y la lista sigue. `GameAuditService` valida estrictamente el contrato (acciones `character.created`/`character.updated`, kinds allowlisted, payload objeto) y envía `entityId`/`limit` como query params. 16 tests frontend dirigidos PASS (4 nuevos del servicio de auditoría); type-check y diff-check PASS.

**Límite 297A-56:** la actividad no tiene paginación ni filtro por personaje en la UI (el servicio ya soporta `entityId`; la UI lo expone cuando el catálogo escale), no hay panel para mapa/assets/expulsión y la purga de retención queda para Fase 8.

**Evidencia 297A-57:** reconexión persistente del socket realtime. Backend: `join_player` reemplaza la conexión previa del mismo subject (nuevo `player_id`, sin duplicar jugadores; al eliminar el `RoomPlayer` viejo su `Sender` se dropea y el `handle_socket` anterior cierra solo); se eliminó `RoomJoinError::DuplicateIdentity` del protocolo. Una sala llena aún acepta la reconexión de un jugador presente (el 9.º no llena: primero reemplaza). El socket reemplazado se cierra con el código 4001 "identidad reemplazada" y el cliente NO reintenta (evita el ping-pong entre pestañas/dispositivos del mismo usuario). Frontend: `createGameRealtimeClient` reintenta con backoff exponencial 1s→30s (tope) + jitter, estado `reconnecting`, `connect()` no duplica si ya hay una conexión pendiente, `destroy()` cancela el timer pendiente; el error del transporte (evento `error` del socket) NO marca fatal — el `close` que le sigue (1006 en navegadores) programa la reconexión — y solo fallan sin reintento los cierres deliberados (protocolo, servidor fatal, ticket fallido tras backoff, 4001). El render conserva el último snapshot y el consumidor vuelve a simulación local hasta volver a `connected`. `game-playable` muestra "reconectando… · fallback local". Tests: 5/5 unit de `game_room` (reemplazo sin duplicación, slots de reconexión en sala llena, TTL), 11 tests frontend del cliente (6 nuevos de reconexión: re-join tras caída, backoff 1/2/4/8/16/30s, sin reintento tras fatal, cancelación en destroy, error→close 1006 reintenta, close 4001 no reintenta), 25 tests frontend dirigidos, 7/7 tests TCP, integraciones HTTP y fmt/check/clippy PASS.

**Límite 297A-57:** sin dos salas ni coordinador compartido (resuelto en Fase 8 con `297A-75`), sin backoff con factor de aleatoriedad real probado en carga, sin expulsión; el estado `reconnecting` es informativo (no hay reintento activo de snapshots ni resync diferencial); la decisión de no reintentar tras 4001 supone que el usuario quiere que la conexión más nueva gane (documentada en el código).

**Evidencia 297A-58:** auditoría de la publicación de mapas: `game_map_repo.publish` pasó a mutación transaccional y `GameMapService.publish` registra `map.published` en `game_audit_events` (actor kind `admin`, entidad y payload acotado) **dentro de la misma transacción** — nunca evento huérfano, mismo patrón que 297A-55. `GET /api/admin/game/audit/maps` lista eventos acotados (1..=100, por defecto 50) con filtro `entityId`, solo `AdminUser` (401/403) y acciones allowlisted server-side (`map.published`); el DTO no expone identidades ni datos privados. 13/13 tests HTTP PostgreSQL (3 nuevos de auditoría de mapas en `tests/game_audit.rs`: evento en publicación, filtro/límite y autorización 401/403), fmt, check y clippy PASS.

**Límite 297A-58:** no hay panel UI de auditoría de mapas (el listado admin existe por API; la visualización llega con los paneles de mapa/assets), no hay auditoría de assets ni de expulsión (sus bloques la registrarán), el DTO no expone `actorId` (privacidad) y la purga de retención queda para Fase 8.

**Evidencia 297A-59:** panel UI de la auditoría de publicaciones de mapas en el tab "juego" del Admin (sección "publicaciones de mapas"): `GameAuditService.listMapEvents` consume `GET /api/admin/game/audit/maps` con el mismo DTO acotado del catálogo, el validador `isValidAuditEvent` pasó a pares acción-entidad estrictos (`map.published`↔`map`) y la sección se carga en paralelo y aislada — si falla, solo la sección lo indica y el catálogo sigue funcionando. Se muestra `publicado · <mapId> · v<schemaVersion>` con fecha/hora. Cierra el límite de visualización declarado en 297A-58.

**Límite 297A-59:** el panel es informativo (el editor de mapa y Assets 3D llegan en sus bloques de Fase 7); la auditoría de assets y de expulsión siguen pendientes; el DTO no expone `actorId` ni coordenadas, y la purga de retención queda para Fase 8.

**Evidencia 297A-60:** catálogo de assets del juego (backend): tabla `game_assets` con seed (terreno, árbol, roca, agua), CRUD admin allowlisted (`POST/PUT /api/admin/game/assets` + listado admin), catálogo público `GET /api/game/assets` (solo activas, shape sin estado administrativo) y auditoría transaccional de cambios (`asset.created`/`asset.updated` en `game_audit_events`, mismo patrón que 297A-55) con listado admin `GET /api/admin/game/audit/assets`. La categoría usa el contrato del mapa (`terrain`/`tree`/`rock`/`water`/`character`/`generic`). Cierra el límite "no hay auditoría de assets" de 297A-58. 9/9 tests HTTP PostgreSQL PASS.

**Límite 297A-60:** el catálogo no tiene versiones inmutables ni storage por hash (llegan con `Assets 3D`); el Editor de mapa y el runtime aún no consumen el catálogo; la auditoría de expulsión y la purga de retención quedan para Fase 8.

**Evidencia 297A-61:** panel UI del catálogo de assets en el tab "juego" del Admin: lista completa activas/inactivas vía `GameAssetAdminService.listAll` (`GET /api/admin/game/assets`), alta (id + etiqueta + categoría) y edición con estado (mismo patrón de modales que 297A-53), sección "actividad de assets" con los últimos 10 eventos (`GameAuditService.listAssetEvents`, `GET /api/admin/game/audit/assets`) cargada en paralelo y aislada (si falla, solo la sección lo indica), y pares acción-entidad `asset.created`/`asset.updated`↔`asset` en el validador compartido. La franja del tab lleva ambos botones de alta (personaje y asset). 9 tests frontend dirigidos PASS.

**Evidencia 297A-62:** la configuración del juego vive DENTRO de la ventana del Bosque, no en el Admin: el toolbar real de la ventana (`AppToolbarGroup` del registro lazy de `game-playable`) expone el grupo "Configuración" con el comando `game:settings` envuelto en `adminOnly` — visible solo para cuentas admin y oculto en vivo para el resto (el toolbar re-renderiza con authStore). El comando abre un modal B&W del OS con las secciones organizadas "personajes" y "assets" (listas activas/inactivas, alta, edición y activar/desactivar reutilizando `GameCharacterAdminService`/`GameAssetAdminService`) más la actividad auditada aislada de ambos catálogos. La gestión se RETIRA del Admin: se elimina el tab "juego" de `admin.ts` y se borra `admin-juego.ts` (la lógica se mueve al módulo `game-settings.ts` del juego). Sin preview de modelos hasta Assets 3D. [Decisión de UX con el usuario: solo admin, catálogos, mover del Admin.]

**Evidencia 297A-63 (UX corregida por el usuario):** la configuración ya NO es un modal: el comando `game:settings` dispara un `CustomEvent('game:settings')` sobre el content de la ventana enfocada del Bosque (mismo patrón que `finder:navigate`); la app `game-playable` lo escucha y alterna su contenido — destruye el runtime (libera WebGL/input/realtime) y monta `createGameSettingsPanel` en su lugar dentro de la MISMA ventana, con TABS del OS (personajes / assets / actividad global con publicaciones de mapas) organizando la gestión. El botón "volver al Bosque" desmonta el panel y rehidrata el runtime. Carga bajo demanda por tab; guards de generación liberados al destruir.

**Límite 297A-63:** el panel no previsualiza modelos (GLB llegan con Assets 3D); el editor de mapa y el runtime aún no consumen el catálogo; la auditoría de expulsión y la purga de retención quedan para Fase 8.

**Evidencia 297A-64:** Editor de mapa 2D como tab "mapa" de la configuración del Bosque (misma ventana, carga bajo demanda): canvas 2D top-down (grid de terreno por cellSize, instancias como símbolos por categoría, spawns, selección), paleta de assets del catálogo activo, command stack con undo/redo (colocar/mover/duplicar/borrar instancias y spawns, ids generados `inst-n`/`spawn-n`), validación local con `validateMapVersion`, carga del mapa activo (`GET /api/game/maps/bosque`) con fallback al fixture y publicación atómica (`POST /api/admin/game/maps` con `expectedVersion` + conflicto 409 visible). `GameMapAdminService` valida estrictamente el envelope público y el documento; la vista reutiliza el patrón WeakMap/generación del panel. El runtime aún consume el fixture (consumo del mapa publicado queda para el bloque siguiente).

**Límite 297A-64:** el editor no previsualiza en 3D (reusar renderer llega con su bloque); sin pintado de altura/superficie por pincel (solo grid y colocación de instancias/spawns), sin borrador persistido server-side (el borrador es local y publicar es atómico), sin exportar/importar y sin editor de proxies de colisión (Assets 3D).

**Evidencia 297A-65:** el runtime del Bosque consume el mapa publicado. `game-map-source.ts` (`resolvePlayableMap`) carga la publicación activa (`GET /api/game/maps/bosque` vía `GameMapAdminService.getActive`) y, fail-closed, cae al fixture offline cuando no hay publicación (404→null, sin aviso) o ante fallo de red/documento inválido (con `warning` visible). `game-playable` resuelve el mapa en `hydrate()` ANTES de montar WebGL/realtime y lo pasa al runtime: la escena se monta con el documento y el mundo publicado, la simulación local usa sus colliders y el spawn local toma el primer `spawnPoints` del mapa. Al volver al Bosque tras publicar desde el editor (297A-64), la rehidratación resuelve la versión nueva: el circuito editar→publicar→jugar queda cerrado. El estado muestra la etiqueta (`v<N>` o `fixture`) y el aviso de mapa no disponible. 7 tests frontend dirigidos PASS (4 del resolver + 3 de lifecycle: montaje con mapa publicado, fixture con warning y fixture por defecto); type-check y diff-check PASS.

**Límite 297A-65:** las instancias del catálogo aún no tienen representación visual 3D (la visual cache ignora ids fuera del fixture hasta Assets 3D), la cámara de la escena parte del origen del fixture y converge al spawn publicado en el primer `update` (la entidad local se siembra en el spawn del documento y la cámara lo sigue al instante), el runtime sigue sin invitados/reconexión diferenciada por mapa y el editor no previsualiza; la auditoría de expulsión y la purga de retención quedan para Fase 8.

**Evidencia 297A-66:** herramienta pincel de superficie en el Editor de mapa 2D. `game-map-editor-core` añade la tool `paint`, `activeSurface` (suelo=0/agua=1, enteros allowlisted del contrato), `terrainCellAt` (mundo → chunk local + índice, fail-closed fuera de chunks) y `paintSurface` (pinta la celda bajo el cursor y commitea solo si cambia — arrastre limpio sin commits redundantes; no-op con tool ≠ paint). La vista expone el botón "pintar" y un select de superficie (suelo/agua) en el toolbar; clic y arrastre pintan sobre el canvas; el canvas sombrea las celdas con superficie > 0 (agua) bajo el grid para que el pincel sea visible. Undo/redo y `hasChanges` cubren el pintado. 14 tests frontend dirigidos PASS (7 nuevos del core del pincel + asserts del toolbar en la vista); type-check y diff-check PASS.

**Límite 297A-66:** el pincel pinta solo superficies en chunks existentes (no crea terreno ni redimensiona bounds); sin pintado de altura (los vértices de `heights` se comparten entre chunks y requieren su propio bloque para no desincronizar bordes); sin caminos ni tipos de superficie adicionales (el contrato permite 0..15); la representación 3D del agua llega con Assets 3D.

#### 297A-67 — Pincel de altura con vértices compartidos

- [x] Definir niveles discretos de altura allowlisted (`TERRAIN_HEIGHT_VALUES` 0/0.25/0.5/1/1.5/2/2.5/3/4, no negativos, dentro del rango -64..64 del contrato) y `isAllowedHeight` fail-closed; `activeHeight` en el estado del editor.
- [x] Resolver mundo → vértice de la malla (chunkSize+1)² con `terrainVertexAt`: devuelve refs a TODOS los chunks existentes que contienen el vértice (interior, borde X/Z compartido o esquina de 4), fail-closed fuera de bounds.
- [x] Pintar con `paintHeight` (tool `height`, nivel allowlisted): actualiza el vértice en todos los chunks compartidos para no descuadrar bordes y commitea solo si algo cambia (arrastre limpio).
- [x] Canvas: sombreado gris por celda proporcional al promedio de sus cuatro vértices y puntos de vértice visibles solo con la herramienta altura; toolbar con botón "altura" y select de nivel.
- [x] Cubrir con tests dirigidos: vértice interior único, borde X/Z compartido (2 chunks), esquina compartida por 4 chunks con pintado sincronizado, borde del mundo (chunk primario inexistente), fail-closed fuera de bounds, niveles fuera del allowlist, arrastre limpio, undo/redo y `hasChanges`.

**Evidencia 297A-67:** `game-map-editor-height.ts` separa la lógica pura del pincel de altura (sin DOM); el core expone `commit` para el segundo consumidor real. Type-check PASS, 16 tests nuevos dirigidos PASS (más asserts del toolbar en la vista) y diff-check PASS.

**Límite 297A-67:** el pincel pinta solo vértices de chunks existentes (no crea terreno ni redimensiona bounds); la altura aún no se representa en 3D (Assets 3D); el sombreado del canvas es local del editor; sin caminos ni tipos de superficie adicionales.

#### 297A-68 — Superficie "camino" y allowlist de superficies

- [x] Añadir `path` (2) a `TERRAIN_SURFACE_VALUES` y su etiqueta; el runtime ya traduce 2 → material medio (`surfaceMaterialIndex` de 297A-33), por lo que no cambia la escena.
- [x] Añadir `isAllowedSurface` fail-closed y usarla en la vista (antes `value === 0 || value === 1`); el select del toolbar itera el objeto y ya ofrece camino sin cambios.
- [x] Canvas: sombreado propio para camino (2) distinto de suelo/agua.
- [x] Tests: pintar camino con commit, `isAllowedSurface` acepta 0/1/2 y rechaza -1/3/15; corregir 4 tests de superficie de 297A-66 que asumían suelo en la celda (0,0) del fixture (el contrato la define agua: `index % 11 === 0`), ahora pintan la celda índice 1 (suelo real).

**Evidencia 297A-68:** 39 tests de editor PASS (core + vista + altura); type-check PASS y gate `task:check -- 297A-68` PASS. El circuito pintar→publicar→jugar traduce el camino sin tocar la escena.

**Límite 297A-68:** sin caminos curvos ni anchos variables (el contrato solo codifica superficies por celda); sin tipos de superficie adicionales 3..15 (el runtime los usa con el material base); la representación 3D de altura/agua sigue siendo la de 297A-33.

#### 297A-69 — Creación de terreno (chunks contiguos)

- [x] `terrainChunkAt`: mundo → índices de chunk locales (mismo mapeo que el contrato).
- [x] `canCreateChunk` fail-closed: rechaza chunk existente, cuota `maxChunks` agotada, índices negativos (exigirían reindexar y romperían la invariante de bounds) y huecos no contiguos al rectángulo actual; valida `maxWorldWidth/Depth` al expandir.
- [x] `addTerrainChunk` (tool `terrain`): crea chunk plano (heights 0, superficies suelo) y expande `maxX/maxZ`; commitea una vez para undo/redo.
- [x] Toolbar con botón "terreno" y canvas que sombrea las celdas vacías contiguas.
- [x] Tests: resolución de chunk, no-duplicado, índices negativos, hueco no contiguo, expansión maxX y maxZ, undo/retiro y no-op con otra tool.

**Evidencia 297A-69:** `game-map-editor-terrain.ts` separa la lógica pura (sin DOM); 7 tests nuevos PASS, 39 tests del editor PASS, type-check y gate `task:check -- 297A-69` PASS.

**Límite 297A-69:** solo crea chunks contiguos hacia maxX/maxZ (sin reindexar negativos ni rellenar huecos interiores); no elimina chunks (borrado de terreno queda como bloque posterior); la creación no pinta altura/superficie automáticamente.

#### 297A-70 — Preview 3D del borrador

- [x] `buildPreviewChunkData`: datos puros de malla de todos los chunks con `buildTerrainMeshData` (misma transformación/cuotas que el runtime), sin Three.
- [x] `createGameMapPreview`: adaptador Three que materializa los chunks del borrador con los materiales de superficie (pale/water/middle), marca spawns e instancias del fixture con primitivas, ajusta la cámara a bounds y libera geometrías, materiales, ResizeObserver y contexto WebGL en `destroy`.
- [x] Toolbar: botón "preview 3D" que alterna el canvas 2D por el preview; cada `redraw` sincroniza el documento del borrador.
- [x] Tests: tamaño de mallas (17² vértices, 16² celdas), alturas con tolerancia Float32 y orígenes de chunk desde bounds.

**Evidencia 297A-70:** 3 tests nuevos + 4 de vista PASS; type-check y gate `task:check -- 297A-70` PASS. El preview no es un segundo motor: consume `game-core` y los materiales del runtime.

**Límite 297A-70:** las instancias del catálogo (fuera del fixture) no tienen geometría 3D propia hasta Assets 3D; el preview no expone controles orbitales (cámara fija); sin simulación ni colisiones en el preview.

#### 297A-71 — Borrador persistente del mapa con revisión optimista

- [x] Migración `game_map_drafts`: un borrador por mapa (PK `map_id`), revisión > 0, hash, documento JSONB acotado (4 MiB) y `updated_by` FK opcional.
- [x] `GET/PUT /api/admin/game/maps/:map_id/draft` con `AdminUser`/CSRF; el PUT exige que `mapId` del body coincida con la ruta y valida el documento con el mismo camino que publicar (422 ante inválido, 413 ante body sobredimensionado, 409 ante revisión obsoleta, 404 sin borrador).
- [x] Repo `save_draft` con advisory lock por mapa, UPSERT y revisión +1 por guardado; `delete_draft` idempotente dentro de transacción.
- [x] Publicar elimina el borrador en la misma transacción: la versión publicada pasa a ser la base y no queda un draft obsoleto.
- [x] Editor: `loadMap` resuelve borrador → publicación activa → fixture (en paralelo), `draftRevision` en el estado (`setDraftRevision`), botón "guardar borrador" con 409 visible y revisión en el pie.
- [x] Vista del editor dividida en `game-map-editor-interactions.ts` (pointer handlers) para mantener <300 líneas tras añadir el guardado.
- [x] Tests: envelope estricto del borrador, roundtrip con revisión 1→2, stale 409, mapa incoherente 422, 413/422, publicación que limpia el draft (404 posterior) y GET público que nunca sirve el borrador.

**Evidencia 297A-71:** `game_map_drafts` + endpoints; 5/5 tests HTTP PostgreSQL PASS (más 7/7 de regresión de `game_map_publish`); 68 tests frontend dirigidos PASS (servicio + vista + editor); gate `task:check -- 297A-71` PASS.

**Límite 297A-71:** el guardado es manual (botón), no autosave diferido; el borrador no tiene historial ni compartición entre editores (la revisión optimista resuelve el conflicto con 409); no hay purga de borradores antiguos (retención en Fase 8).

#### 297A-72 — Assets 3D backend: versiones inmutables por hash

- [x] Migración `game_asset_versions`: versión por asset (UNIQUE asset+version), hash SHA-256, storage content-addressed `assets/{hash}.glb` (índice no único: varias versiones pueden compartir archivo), tamaño ≤ 16 MiB, categoría allowlisted, proxy JSONB con CHECK de forma, scale 0.1..4 y una sola activa por asset.
- [x] Import multipart `POST /api/admin/game/assets/:id/versions`: valida magic glTF + versión 2 + tamaño ANTES de guardar, escribe por hash (dedup en disco) y registra la versión con auditoría `asset.version.created` en la misma transacción.
- [x] Listado admin `GET .../versions` (sin storage paths) y contrato público `GET /api/game/assets/:id/active` con `versionId` `{asset}-v{N}`, hash, categoría, proxy y scale (sin `isActive`/`byteSize`/rutas).
- [x] `PUT .../versions/:version` edita proxy/scale SOLO en inactivas (409 si activa); `PUT .../versions/:version/activate` desactiva las demás y congela la versión.
- [x] Trigger de inmutabilidad: la versión activa no puede editarse ni borrarse (ni por SQL directo); las inactivas sí pueden editar metadata/borrarse.
- [x] Tests: autorización/CSRF, GLB inválido/versión/size, dedup por hash, numeración, metadata, activación única, contrato público y trigger.

**Evidencia 297A-72:** 6/6 tests HTTP PostgreSQL PASS (más 9/9 de regresión `game_asset`/`game_asset_admin`); el storage se verifica por hash en disco. El panel UI de import/preview llega en el siguiente bloque.

**Límite 297A-72:** el import no analiza la geometría del GLB (bounds/materiales/animaciones: análisis en bloque posterior); no hay UI de import/preview ni consumo del runtime; la purga de versiones huérfanas y la retención quedan para Fase 8.

**Gate:** ningún invitado puede invocar admin ni reclamar el estado de otra identidad; el perfil no depende de datos enviados sin validar.

**Auditoría de cierre — Fase 6:**
- [x] **SOLID/seguridad:** identidad temporal, cuenta, personaje, capacidades y ticket tienen servicios separados y validación server-side: `GameTicketStore` (invitados), `GameProfileService` (cuenta) y catálogo con capacidades admin en backend (297A-47/48/50/52); la revocación de la identidad invitada al autenticarse (297A-76) es server-side.
- [x] **Rendimiento/escalabilidad:** join/leave/reconnect, expiración y migración invitado→cuenta se prueban bajo concurrencia y sin duplicar jugadores o sockets: reconexión persistente sin duplicar jugadores (297A-57), expiración por TTL (297A-47) y rehidratación ante login/logout/cambio de cuenta (297A-51).
- [x] **Observabilidad/privacidad:** audit y analytics están separados, con retención definida; no se registran tokens, coordenadas precisas ni datos privados: `game_audit_events` separado de analytics (297A-55/58), métricas agregadas sin coordenadas (297A-75) y consentimiento/retención documentados.

### Fase 7 — Assets 3D, editor 2D y publicación

- [x] Gestión admin del catálogo de personajes en el backend (`297A-52`): alta, renombrado, tono y desactivación allowlisted con `AdminUser`/CSRF; las opciones desactivadas no reaparecen en el catálogo público ni pueden seleccionarse, y los perfiles existentes las conservan por FK.
- [x] Panel admin del catálogo de personajes (`297A-53`): tab "juego" en Admin con listado completo (activas e inactivas), alta, edición y desactivación/reactivación; `GameCharacterAdminService` con validación estricta del contrato admin.
- [x] Crear `Assets 3D` admin para importar/analizar/previsualizar/versionar GLB; no editar geometría (`297A-72` backend + `297A-73` panel frontend): `game_asset_versions` inmutables por hash content-addressed, importación GLB multipart con validación de magic/versión/tamaño (16 MiB), metadata allowlisted editable solo en versiones inactivas, activación única con congelación por trigger, contrato público sin storage paths y auditoría transaccional; el panel de versiones (listar/importar/metadata/activar) y el preview GLB aislado viven en `game-asset-versions.ts`/`game-asset-preview.ts`.
- [x] Crear `Editor de mapa` admin 2D para altura, superficie, agua, caminos, spawn y colocación de instancias (`297A-64` editor + `297A-66` superficie + `297A-67` altura + `297A-68` camino + `297A-69` creación de terreno): canvas top-down con grid, paleta de assets activos, command stack, pincel de superficie suelo/agua/camino, pincel de altura discreta 0–4 con vértices compartidos entre chunks y creación de chunks dentro de `maxWorldWidth/Depth`.
- [x] Reutilizar el renderer del juego para preview 3D; no crear un segundo motor dentro del editor (`297A-70`): adaptador Three que reutiliza `buildTerrainMeshData` y los materiales de superficie del runtime, sincronizado con el documento y con teardown completo.
- [x] Añadir command stack de selección/colocación/movimiento/duplicado/borrado y undo/redo (`297A-64`): stack con undo/redo para colocar/mover/duplicar/borrar instancias y spawns.
- [x] Persistir borrador con revisión optimista y conflicto visible (`297A-71`): `game_map_drafts` con un borrador por mapa, `GET/PUT /api/admin/game/maps/:map_id/draft` con revisión optimista, 409 ante revisión obsoleta y 413/422/404 fail-closed; el editor carga el borrador si existe y muestra la revisión en el pie.
- [x] Añadir preview de borrador y publicación atómica (`297A-70` + `297A-64`/`297A-58`): preview 3D del borrador en el toolbar; publicación atómica `POST /api/admin/game/maps` con `expectedVersion` y conflicto 409 visible, y auditoría `map.published` en la misma transacción.
- [x] Auditoría persistente de cambios sensibles del catálogo (`297A-55`): `game_audit_events` registra crear/actualizar/desactivar con actor, acción y estado visual en la misma transacción; listado admin acotado sin identidades. La auditoría de mapa/assets y la garantía de versión de la sala activa llegan con sus bloques.
- [x] Auditoría de la publicación de mapas (`297A-58`): `map.published` se registra en `game_audit_events` dentro de la misma transacción de la publicación (repo transaccional, patrón 297A-55); listado admin acotado por API. La auditoría de assets/expulsión y la garantía de versión de la sala activa llegan con sus bloques.
- [x] Panel UI de auditoría de publicaciones de mapas (`297A-59`): sección "publicaciones de mapas" en el tab "juego" (últimas 10 publicaciones con versión y fecha, carga paralela aislada y pares acción-entidad estrictos en el validador).
- [x] Catálogo de assets del juego (`297A-60`): tabla `game_assets` con seed base, CRUD admin allowlisted, catálogo público activo y auditoría transaccional de cambios con listado admin. Las versiones inmutables y el storage por hash llegan con `Assets 3D`.
- [x] Configuración del juego dentro de la ventana (`297A-62`): la gestión de catálogos (personajes + assets) se mueve del Admin a un panel modal del OS abierto desde el toolbar real de la ventana del Bosque, visible solo para admin vía `adminOnly`; el tab "juego" del Admin desaparece.

**Gate:** un admin importa un GLB, crea terreno 2D, coloca instancias, guarda, previsualiza y publica; un usuario normal recibe rechazo server-side aunque fuerce el cliente.

**Auditoría de cierre — Fase 7:**
- [x] **SOLID/OCP:** `Assets 3D`, `Editor de mapa`, publicación y runtime reutilizan servicios/contratos; agregar otra categoría no duplica analizadores ni escenas — el preview 3D del editor reutiliza `buildTerrainMeshData` y los materiales del runtime (297A-70), el panel de versiones reutiliza los servicios admin (297A-73) y el catálogo de assets se consume desde el mismo contrato en paleta/runtime.
- [x] **Rendimiento/escalabilidad:** análisis, manifests y referencias se procesan por lote; se mide tamaño de GLB, draw calls, memoria y coste de preview antes de publicar — el import GLB valida tamaño 16 MiB y parsea una sola vez con metadata proxy (297A-72); el culling por distancia y el batching por materiales miden draw calls (297A-74).
- [x] **Seguridad/operación:** validación server-side, revisión optimista, rollback, dependency checks y auditoría de cambios sensibles tienen casos negativos y transacciones claras — publicación transaccional con auditoría en la misma tx (297A-58), draft con 409/413/422/404 (297A-71), versiones inmutables por hash con activación única por trigger (297A-72) y runbook de rollback (297A-75).

### Fase 8 — Hardening y operación

- [x] Tests de carga acotados hasta el límite de 8 por sala y prueba de rechazo al noveno: unit `room_rejects_ninth_player_and_keeps_reconnect_slots`, TCP `ninth_tcp_player_is_rejected_with_room_full` y benchmark 1/4/8 (`297A-46`).
- [x] Soak de abrir/cerrar/reconectar y dos salas concurrentes dentro del presupuesto acordado (`297A-75`): `GameRoomState` pasó a registro multi-sala claveado por `map.map_version()` con `register_map`/`join_on`; cada mapa tiene su actor con cap de 8 y TTL independiente, los jugadores de una sala no aparecen en la otra y la capacidad se mantiene por sala (test unit `two_concurrent_rooms_are_isolated_with_independent_capacity`). La reconexión/abrir-cerrar ya la cubren `297A-57` y `empty_room_ttl_recreates_actor_after_disconnect`.
- [x] Pruebas negativas de tickets, mensajes grandes, inputs rápidos, velocidad, colisión, permisos y documentos corruptos: replay de ticket TCP, oversized/malformed/binary del contrato, rate budget, secuencia replay/jump, `move_circle` con colisión, AdminUser/CSRF en publicación/editor y documentos corruptos en `game_map_publish`.
- [x] Métricas agregadas sin coordenadas precisas ni identidad innecesaria (`297A-75`): `GameRoomMetrics` con contadores atómicos (joins, joins_rejected, disconnects, rooms_created, snapshots_sent, backpressure_evictions, rate_limited, sequence_rejected, active_players) y `GET /api/game/metrics` público agregado en OpenAPI/Orval; test TCP real verifica conteos tras join + ticks y la ausencia de campos privados.
- [x] `task:check`, type-check, tests, build y revisión de teardown: gates `297A-74`/`297A-75` PASS, 665 tests frontend, 51 tests backend de regresión y build PASS. Validación visual cerrada el 05-ago: fixture `/forest-playable` con WebGL2 + GPU (Intel Iris Xe) y personaje `forest-scout`, backend actualizado con rutas del juego en localhost:3000.
- [x] Runbook de rollback de versión de mapa y assets (`297A-75`): `Agente/documentacion/operacion/runbook-rollback-juego-2026-08-05.md` con re-publicación de la versión buena (sin mutar snapshots inmutables), re-activación de versiones de asset, verificación, no-hacer y emergencia SQL documentada; deploy fuera de alcance.

**Gate:** Definition of Done completa, reporte de presupuesto y ausencia de errores bloqueantes. Pendiente explícito: el full CI (`task:check --full`) cuando expire el cooldown del guard.

**Auditoría de cierre — Fase 8:**
- [x] **SOLID:** Sentinel confirma límites de módulos, dependencias dirigidas y ausencia de suppressions sin ADR; se registra cualquier deuda aceptada: gates 297A-44/74/75/76/77 PASS con Sentinel sin suppressions.
- [x] **Rendimiento/escalabilidad:** carga 1/4/8, dos salas, soak, background, reconexión, memoria GPU/CPU y rollback tienen comparación contra presupuesto y criterio de regresión: benchmark 1/4/8 (297A-46), dos salas (297A-75), soak de abrir/cerrar/reconectar (297A-75) y presupuesto en la sección 8; la comparación formal en entorno dedicado queda pendiente (apartado 9).
- [x] **Seguridad/observabilidad/operación:** negativos, consentimiento, métricas, alertas, runbook y recuperación están probados; no se marca DoD con warnings bloqueantes: negativos de tickets/permisos/colisión (297A-44/52/58/71), métricas agregadas (297A-75), runbook de rollback (297A-75) y consentimiento de analytics documentado.

### Fase 9 — Extracción del motor agnóstico `glory-render`

Esta fase ocurre después de estabilizar Fase 8. El `game-core` provisional que ya vive en `frontend/src/features/game-core/` se considera candidato, no API definitiva.

- [ ] Auditar qué lógica se repite o puede probarse con un segundo juego: bounds, colisión, spatial hash, simulación, snapshots, interpolación, reloj y contratos de lifecycle.
- [ ] Crear `glory-render/` dentro de `glory-rust-template/` con repositorio Git, CI, versionado y quality gate propios; no mover código antes de aprobar la frontera del ADR.
- [ ] Separar `packages/core`, `packages/contracts` y `packages/three`; el core no importa DOM, Vite, Three, Axum, SQLx, AppRegistry, cuentas, red ni secretos.
- [ ] Migrar Bosque mediante exports públicos fijados por commit/submódulo, sin copiar ni mantener una segunda implementación.
- [ ] Añadir un juego mínimo de conformidad que consuma el mismo motor y fixtures deterministas; si el segundo caso no existe, no extraer abstracciones especulativas.
- [ ] Documentar SemVer, deprecaciones, changelog, compatibilidad, rollback y procedimiento para añadir nuevas utilidades agnósticas.

**Auditoría de cierre — Fase 9:**
- [ ] **SOLID/DIP:** el núcleo depende de contratos; renderer, OS, transporte, persistencia e identidad son adaptadores reemplazables.
- [ ] **Rendimiento/escalabilidad:** Bosque y el segundo juego comparan bundle, frame p50/p95, memoria, entidades y teardown; importar `core` no arrastra Three ni el shell.
- [ ] **Seguridad/operación:** el repo no ejecuta assets/scripts externos ni conoce secretos; sus releases son reproducibles, auditables y reversibles.

**Gate:** Bosque y un segundo juego consumen `glory-render` por API pública, sin código duplicado ni dependencia específica de wandori.us; el repositorio tiene CI y rollback documentados.

## 8. Presupuesto inicial de seguridad y rendimiento

Son presupuestos de planificación y deben medirse con el primer prototipo, no convertirse en optimizaciones ciegas:

- el bundle principal del OS no crece por cargar el juego;
- el juego se descarga únicamente al abrirse y se libera al cerrarse;
- tick server-authoritative inicial: 10 Hz;
- render local: hasta 60 Hz, sin enviar frames;
- input: máximo 15 mensajes/s por conexión más heartbeat controlado;
- sala: máximo 8 jugadores y límite configurable de salas activas;
- snapshot: solo jugadores/entidades en radio de interés + margen;
- cliente: límite inicial de entidades visibles y de bytes cacheados por mapa;
- WebSocket: límite de tamaño de mensaje, cola por conexión y política de desconexión lenta;
- mapa: bounds, capas, entidades, polígonos, dimensiones de assets y peso total acotados;
- admin: guardado por operación terminada, no por `pointermove`, y publicación transaccional;
- analytics: eventos semánticos de join/leave/error/publicación, nunca por frame ni con coordenadas precisas.
- renderer: objetivo de frame p95 ≤16,7 ms en desktop/tablet y degradación explícita en móvil; no se acepta ocultar errores de frame con una reducción silenciosa de calidad;
- realtime: medir p95 de tick, join, snapshot y reconexión, además de bytes por jugador y cola máxima de mensajes;
- background: una pestaña oculta pausa render y reduce actividad sin perder el contrato de heartbeat; al volver debe reconciliar snapshot, no simular tiempo local indefinido;
- observabilidad: cada métrica debe tener nombre, unidad, cardinalidad y política de retención antes de instrumentarse.

Los valores finales deberán quedar en el ADR de presupuesto después de medir 1/4/8 jugadores. Si el presupuesto falla, se reduce primero el alcance (radio, entidades, frecuencia o tamaño de mapa), no se desactiva la autoridad del servidor.

## 9. Pruebas obligatorias

### Frontend

- unitarias: movimiento, cámara, colisión, spatial index, interpolación, snapshots, parser y selección;
- deterministas: reloj falso, semillas controladas, simulación offline repetible y transporte WebSocket falso; ningún test depende de tiempo real o red pública;
- DOM/lifecycle: abort, destroy idempotente, WebSocket cerrado, frame loop detenido y object URLs revocadas;
- app registry: lazy load, capacidad, apertura/cierre y no duplicación;
- navegador: 1440×900, 1024×768, 390×844 y 320px; teclado, touch, foco, zoom 200% y reduced motion;
- visual: snapshots de tres assets originales, mapa fixture, selección, jugador local/remoto, desconectado y modo admin; no comparar contra una copia pixel a pixel de la referencia.

### Backend

- integración: ticket UUID/guest, capacidad admin, join/leave, cap de sala, timeout y publicación;
- negativas: posición falsificada, velocidad excesiva, mensaje sobredimensionado, sala llena, revisión stale, asset privado, mapa corrupto y usuario sin admin;
- concurrencia: dos updates del mismo borrador con una sola victoria y sin overwrite;
- concurrencia realtime: orden fuera de secuencia, replay de secuencia, reloj adelantado, reconexión duplicada y cliente lento;
- carga acotada: 1/4/8 jugadores, dos salas, reconexiones y conexiones lentas;
- fuzz/property: parser de mapa, límites de entidades/hitboxes, mensajes JSON y reglas de movimiento con invariantes de bounds/velocidad.

### Gate

Cada fase ejecutable cerrará con `npm run task:check -- GAME-01-Fn` o el ID que se asigne al subdividirla, además del type-check/tests del stack afectado. El quality gate no sustituye la prueba realtime ni el navegador.

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Fanout y JSON consumen CPU | salas pequeñas, interés por proximidad, 10 Hz, mensajes limitados y medición antes de binario. |
| El mundo libre genera colisiones costosas | spatial hash fijo y formas simples; no escanear entidades globalmente. |
| Salas permanentes consumen memoria | creación bajo demanda, TTL vacío y límites globales. |
| Admin modifica una partida activa | snapshots inmutables por sala; publicación afecta nuevas salas. |
| Asset malicioso o pesado | parser GLB server-side, extensiones/URIs allowlisted, límites por perfil, storage privado, versiones y sin scripts/shaders arbitrarios. |
| La referencia visual deriva en copia o assets sin licencia | moodboard separado, bocetos originales, registro de procedencia y revisión antes de importar cualquier recurso. |
| Fuga al cerrar ventana | `AbortSignal` + `destroy()` idempotente y prueba repetida. |
| Recarga restaura un ticket o duplica jugador | `window-session` solo restaura UI segura; ticket nuevo y join idempotente al reconectar. |
| Invitado suplanta cuenta/admin | ticket server-side, identidad temporal separada y capacidad comprobada en backend. |
| Editor se vuelve un motor general | catálogo y propiedades allowlisted, sin scripting ni físicas complejas. |
| Dependencia gráfica infla el OS | Three.js lazy en chunk separado; medir Network/GPU y reducir mapa, draw calls o perfil visible antes de afectar el arranque del OS. |
| Terreno 3D vuelve complejo el editor | documento finito de celdas/alturas/superficies en vista 2D; Three.js genera chunks y no existe escultura libre. |
| Pestaña en background produce estado divergente | política de pausa/reconciliación y snapshot server-authoritative al volver al primer plano. |
| Escalado horizontal prematuro | primera fase single-instance documentada; no prometer multiinstancia hasta decidir estado compartido. |

## 11. Definition of Done de GAME-01

- [ ] Fase 0 aprobada: vertical slice, bocetos originales, licencia/procedencia, contrato OS, ruta/sesión, accesibilidad y presupuestos documentados — los ítems de producto (referencia como atmósfera, gramática visual, capturas con aprobación explícita) quedan pendientes de tu decisión; el resto está documentado.
- [x] App registrada en AppRegistry, lazy, full-bleed y sin app móvil duplicada: `game-playable`, `game-3d` y `game` son lazy/full-bleed; el launcher móvil reutiliza el mismo runtime sin `MobileFooApp` (018A-92, 297A-30).
- [x] Abrir/cerrar libera todos los recursos del juego: teardown idempotente con `AbortSignal`/destroy probado (297A-44/74).
- [x] Restaurar la ventana no restaura tickets, sockets, salas ni identidades temporales; reconectar es explícito e idempotente: window-session solo restaura UI; ticket nuevo + join idempotente (297A-57).
- [x] Mapa publicado versionado y validado; ningún cliente modifica el snapshot activo: `MapVersion` con validación server-side y publicación transaccional (297A-33/34/58/65); el actor de sala conserva su versión inmutable (297A-44).
- [x] Jugador local y otros 7 como máximo se ven y se mueven con interpolación: cap 8, snapshots con interpolación y presencia con personaje (297A-44/45/57/77).
- [x] Servidor autoritativo rechaza posiciones, velocidades y comandos inválidos: intents `move` validados por secuencia/rate limit; negativos TCP (297A-44/46).
- [x] Invitado y cuenta tienen identidades separadas y capacidades correctas: cookie `guest_game` vs sesión, con revocación al autenticarse (297A-47/48/51/76).
- [x] Admin gestiona GLB/versiones en `Assets 3D` y edita terreno/instancias en `Editor de mapa` 2D, guarda, previsualiza y publica: 297A-64/66/67/68/69/70/71/72/73 con gates PASS.
- [x] Assets y personajes usan versiones/allowlists y no ejecutan contenido arbitrario: allowlists del contrato, GLB validado por magic/versión/tamaño y versiones inmutables (297A-34/50/72).
- [x] Capacidad, ancho de banda, memoria, reconexión y teardown tienen evidencia: benchmark 1/4/8 (297A-46), dos salas (297A-75), probe GPU/memoria (297A-74), reconexión (297A-57) y teardown (297A-44). La comparación contra presupuesto en entorno dedicado queda pendiente (apartado 9).
- [x] Métricas operacionales, analytics/audit separados y política de consentimiento/retención documentada: `GET /api/game/metrics` agregado (297A-75), `game_audit_events` separado (297A-55/58) y consentimiento documentado.
- [ ] Dirección visual aprobada sobre assets originales que reinterpretan la referencia sin copiarla: pendiente de tu aprobación explícita (Fase 0).
- [ ] El motor reutilizable está aislado en `glory-render/` cuando exista un segundo consumidor real; no se extraen piezas específicas de Bosque: Fase 9, fuera del cierre de GAME-01 (depende de un segundo juego).
- [x] Tests, navegador, quality gate, documentación y rollback están completos: gates 297A-4x/5x/6x/7x PASS, validación visual del fixture (05-ago), runbook de rollback (297A-75) y documentación actualizada. El full CI (`task:check --full`) queda pendiente del cooldown del guard.

## 12. Decisiones aún abiertas

> Las decisiones 1-6 se confirmaron el 05-ago y tienen su fuente canónica en
> `Agente/documentacion/producto/decisiones-pendientes-bosque-2026-08-05.md` y en el ADR
> `Agente/documentacion/arquitectura/adr-bosque-mundo-unico-reinicio-coordinado-2026-08-05.md`.

1. ~~Sala única vs instancias~~ → **DECIDIDO (05-ago): mundo único compartido, sin salas ni
   matchmaking**; el cap 8 por sala pasa a ser límite global del mundo (pendiente de planificar
   `GameRoomState`, decisión 4).
2. ~~Controles~~ → **DECIDIDO (05-ago):** teclado/ratón en desktop, táctiles solo en móvil
   (implementado, commit `e9d7e09d`).
3. ~~Persistencia del invitado~~ → **DECIDIDO (05-ago):** invitado efímero (297A-76).
4. ~~Dirección cromática~~ → **DECIDIDO (05-ago):** verde stylized tipo Genshin, sin distinción
   por jugador (implementado, commit `e9d7e09d`).
5. ~~Publicación en vivo~~ → **DECIDIDO (05-ago):** transición coordinada con aviso de reinicio
   en 5 min; el contrato realtime ya incluye `server_restart` (ambos stacks + cliente); falta la
   cuenta atrás y la migración coordinada server-side (decisión 8).
6. ~~Escalado futuro~~ → **DECIDIDO (05-ago):** single-instance.
7. **Restauración de sesión:** restaurar solo el contenedor de la app (recomendado) o reingresar automáticamente a la última sala; la segunda opción exige consentimiento y ticket nuevo.
8. **Contrato de URL:** decidir si se comparte un mapa público/sala pública o si el deep link solo abre la app sin unirse; no se expondrán salas privadas ni identidades invitadas.
9. **Accesibilidad del renderer:** overlay DOM con estado y controles accesibles, modo reducido y fallback informativo, o alcance explícito si alguna parte no puede hacerse accesible.
10. **Feature flag/lanzamiento:** decidir quién puede ver la app durante el piloto y cómo se desactiva sin romper workspace ni sesiones.
11. **Métricas y consentimiento:** confirmar catálogo de eventos, retención y separación entre analytics de producto, audit de admin y telemetría operacional.
12. **Relieve y assets iniciales:** confirmar alturas discretas sin cuevas, cámara orbital limitada, monocromo/paleta y si el primer personaje necesita rig `idle/walk`.
13. **Extracción:** confirmar el commit de `glory-render` que consumirá Bosque y el tipo de integración (submódulo/artefacto); la carpeta permanece dentro de `glory-rust-template`, pero su historial Git es independiente.

Estas decisiones deben registrarse en ADR antes de Fase 2/5 según corresponda. Ninguna debe resolverse agregando flags ad hoc al cliente.
