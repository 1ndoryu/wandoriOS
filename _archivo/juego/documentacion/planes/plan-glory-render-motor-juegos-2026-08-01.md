# Plan — `glory-render`: motor agnóstico para futuros juegos

> **Fecha:** 2026-08-01
> **ID:** 018A-96 / GAME-02
> **Estado:** planificado; comienza después de estabilizar GAME-01/Fase 8.
> **Ubicación:** `glory-rust-template/glory-render/` con repositorio Git propio.
> **ADR:** `Agente/documentacion/arquitectura/adr-glory-render-repositorio-agnostico-2026-08-01.md`.

## Objetivo

Extraer la lógica realmente reutilizable del primer juego a `glory-render`, integrarla de vuelta en Bosque sin copias y demostrar portabilidad con un segundo juego pequeño. El motor no será un repositorio de cuentas, salas, editor de mapas, comercio ni componentes del OS.

## Dependencias y límites

- GAME-01 debe tener estable el vertical slice y sus contratos de mapa, input, lifecycle y rendimiento.
- La extracción no bloquea el boceto ni el juego inicial; se hace después de la Fase 8, cuando haya evidencia de qué se repite.
- `frontend/src/features/game-core/` es una implementación provisional candidata, no el contrato definitivo.
- No crear todavía una carpeta/repo ni mover código hasta aprobar el ADR, el inventario y la estrategia de integración.

## Fase 0 — Inventario y frontera

- [x] Auditar `frontend/src/features/game-core/` y clasificar cada módulo: core agnóstico, adaptador Three, integración OS, dominio Bosque o backend — `Agente/documentacion/arquitectura/auditoria-glory-render-fase0-2026-08-05.md` (05-ago): 14 módulos CORE puros, `game-realtime.ts` como CORE de frontera (sin transporte), 0 dependencias de Three/DOM/red/backend en el paquete, sin ciclos de dependencias.
- [x] Registrar API pública actual, invariantes, errores, límites y dependencias transitivas — inventario completo en la auditoría (re-exports de `index.ts`, cuotas, invariantes fail-closed, grafo de dependencias).
- [x] Identificar duplicación probable en un segundo juego sin extraer abstracciones sin caso real — simulación/colisión/interpolación/streaming/presupuestos; criterio de no extracción sin segundo consumidor.
- [x] Elegir integración inicial: submódulo fijado por commit + dependencia local para desarrollo — `Agente/documentacion/arquitectura/estrategia-integracion-glory-render-2026-08-05.md` (05-ago): submódulo anclado a etiqueta SemVer en CI/producción, `file:`/workspace en desarrollo, carga lazy, procedimiento de actualización/rollback.
- [x] Definir política de licencias, versionado SemVer, changelog, CI, quality gate y propietarios — misma estrategia (05-ago): `0.x` hasta dos consumidores, bump MAJOR/MINOR/PATCH por contrato, changelog + matriz de compatibilidad, gate propio del motor y propietario = quien ejecute GAME-02.

**Auditoría de cierre — Fase 0:** SOLID verifica dependencias dirigidas y SRP; rendimiento mide el coste de la API; escalabilidad prueba un segundo caso hipotético; seguridad confirma que no hay identidad/secretos; observabilidad define métricas del motor y no eventos de wandori.us. Todo queda en el ADR/inventario.

**Gate:** frontera aprobada y lista de piezas extraíbles con evidencia de segundo uso.

## Fase 1 — Crear el repositorio `glory-render`

- [ ] Crear `glory-rust-template/glory-render/` con `.git` propio, README, licencia, `package.json`, `tsconfig`, tests y quality gate independiente.
- [ ] Definir exports públicos por paquete (`core`, `contracts`, `three`) y prohibir imports profundos.
- [ ] Crear fixtures deterministas y vectores de contrato que no dependan de DOM, Vite, Three ni red.
- [ ] Configurar CI local/CI para type-check, tests, lint, Sentinel y budgets sin instalar dependencias mutables en runtime.
- [ ] Decidir cómo el repo principal fija el commit (submódulo o artefacto) y documentar actualización/rollback.

**Auditoría de cierre — Fase 1:** SOLID revisa ISP/DIP de exports; rendimiento mide instalación, tree-shaking y coste de importar solo `core`; escalabilidad prueba dos consumidores; seguridad revisa supply chain y scripts; observabilidad documenta versiones y tiempos del gate.

**Gate:** repositorio reproducible, aislado y consumible desde el proyecto principal sin copiar fuentes.

## Fase 2 — Extraer el núcleo puro

- [ ] Mover por módulos, preservando primero contratos y vectores: vectores/bounds, límites, colisión, spatial hash, simulación, snapshots e interpolación.
- [ ] Sustituir nombres/comentarios de GAME-01 por conceptos genéricos; cualquier semántica Bosque vuelve a un adaptador.
- [ ] Mantener errores explícitos, límites configurables y serialización estable; no depender de excepciones silenciosas ni globals.
- [ ] Mantener una capa de compatibilidad temporal en wandori.us solo durante la migración, con fecha de retiro.
- [ ] Publicar una primera versión `0.x` fijada por commit y migrar Bosque a los exports públicos.

**Auditoría de cierre — Fase 2:** SOLID confirma que el core no conoce OS/Three/backend; rendimiento compara benchmarks antes/después y coste por entidad; escalabilidad prueba mapa pequeño/mediano y 1/4/8 entidades; seguridad valida inputs fail-closed; observabilidad exige errores y métricas sin PII.

**Gate:** Bosque compila usando `glory-render/core` sin duplicar la implementación provisional y todos los vectores siguen pasando.

## Fase 3 — Adaptadores de renderer y lifecycle

- [ ] Extraer contratos de renderer, cámara, input, reloj, ciclo de vida y consulta de mundo.
- [ ] Mover el adaptador Three.js a `packages/three`; el core no importa Three.
- [ ] Definir `dispose()` idempotente, pausa background/minimizado, resize, pérdida de contexto y ownership de recursos.
- [ ] Integrar con `MountedView` mediante un adaptador del proyecto, no desde el motor.
- [ ] Mantener una implementación fake/headless para tests y CI sin GPU.

**Auditoría de cierre — Fase 3:** SOLID verifica DIP entre core/renderer; rendimiento mide frame p50/p95, memoria y draw calls con el mismo fixture; escalabilidad prueba otro renderer fake o backend; seguridad evita ejecución de shaders/scripts externos; observabilidad registra lifecycle y fallos de contexto.

**Gate:** Bosque abre/cierra con Three y un test headless valida el mismo contrato sin navegador/GPU.

## Fase 4 — Migración y prueba con un segundo juego

- [ ] Eliminar imports directos a `frontend/src/features/game-core/` desde Bosque; solo usar la API pública fijada.
- [ ] Crear un juego mínimo de conformidad (por ejemplo, arena 2D o recolector) dentro de `examples/`, sin assets ni identidad de wandori.us.
- [ ] Ejecutar los mismos fixtures, simulación, límites, lifecycle y renderer fake en ambos consumidores.
- [ ] Registrar qué no se comparte y evitar agregar abstracciones por una sola diferencia superficial.
- [ ] Comparar bundle, tiempos de carga, memoria y cantidad de código duplicado antes/después.

**Auditoría de cierre — Fase 4:** SOLID confirma que agregar el segundo juego no toca el core; rendimiento compara ambos perfiles y teardown; escalabilidad prueba evolución independiente de mapas/assets; seguridad revisa que ningún ejemplo dependa de secretos; observabilidad separa métricas por consumidor.

**Gate:** dos juegos consumen el mismo motor por contrato público y uno puede cambiar sin romper al otro.

## Fase 5 — Estabilización, versionado y adopción futura

- [ ] Publicar `1.0` solo cuando API, límites, errores y ciclo de vida sean compatibles y existan dos consumidores reales.
- [ ] Documentar matriz de compatibilidad, migraciones, deprecaciones, changelog y rollback de versión.
- [ ] Añadir plantilla para futuros juegos: app adapter, renderer, input, fixtures, quality gate y teardown.
- [ ] Definir cuándo una utilidad agnóstica nueva entra al motor y cuándo permanece en el juego.
- [ ] Revisar si alguna parte merece implementación Rust/wasm solo con benchmark y segundo caso; no duplicar por anticipación.

**Auditoría de cierre — Fase 5:** SOLID revisa estabilidad de interfaces y ausencia de mega-engine; rendimiento/escala usa regresiones de CI y budgets; seguridad revisa releases y dependencias; observabilidad valida changelog, métricas y alertas; documentación confirma el procedimiento de actualización.

**Gate:** `glory-render` tiene dos consumidores, release reproducible, rollback probado y ninguna dependencia específica de wandori.us/Bosque.

## Definition of Done

- [ ] `glory-render/` existe dentro de `glory-rust-template` con Git/CI/versionado propios.
- [ ] El core no importa OS, DOM, Three, backend, cuenta, red ni dominio de un juego.
- [ ] Bosque consume el motor por exports públicos, sin copia paralela.
- [ ] Un segundo juego demuestra portabilidad con fixtures compartidos.
- [ ] Adaptador Three, renderer fake y lifecycle tienen teardown verificable.
- [ ] API, límites, errores, métricas, seguridad y migraciones están documentados.
- [ ] Sentinel/VarSense/quality gate propios y del consumidor pasan.

## Criterio de no extracción

Una pieza se queda en wandori.us si depende del OS, cuenta, permisos, analytics, editor, publicación, assets concretos, sala o reglas de Bosque; no se abstrae solo porque “podría servir” algún día.
