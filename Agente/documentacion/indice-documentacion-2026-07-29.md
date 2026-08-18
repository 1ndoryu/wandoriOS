# Índice canónico de documentación de wandori.us

> **Fecha de actualización:** 2026-08-14
> **Objetivo:** indicar qué documento decide cada aspecto y evitar duplicación.

## Fuentes de verdad

| Pregunta                                                | Documento canónico                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| ¿Qué está pendiente y qué sigue ahora?                  | `roadmap.md`                                                                    |
| ¿En qué orden se implementa toda la iniciativa?         | `Agente/planes/plan-escritorio-persistente-cuentas-admin-apps-2026-07-29.md`    |
| ¿Cómo se separan módulos, datos, seguridad y contratos? | `Agente/documentacion/arquitectura/manual-arquitectura-wandorius-2026-07-29.md` |
| ¿Cómo debe verse y comportarse visualmente el OS?       | `Agente/documentacion/design-system/manual-identidad-visual-os-2026-07-29.md`   |
| ¿Cómo funciona el OS en teléfonos sin duplicar apps?    | `Agente/planes/plan-experiencia-movil-launcher-2026-07-29.md`                  |
| ¿Cómo funciona el quality gate?                        | `Agente/documentacion/herramientas/auditoria-sentinel-completa-2026-08-10.md` + `roadmap-sentinel.md` |
| ¿Cómo funcionan comandos, menús, drag y estadísticas?  | `Agente/planes/plan-contratos-interaccion-comandos-medicion-2026-07-29.md`      |
| ¿Qué reglas automáticas faltan?                         | `Agente/prevencion/prevencion-wandorius-sentinel-varsense-2026-07-29.md`        |
| ¿Cómo está la salud arquitectónica del frontend (v1)?   | `Agente/documentacion/arquitectura/auditoria-arquitectura-frontend-2026-07-30.md` |
| ¿Auditoría profunda post-refactorización (v2)?           | `Agente/documentacion/arquitectura/auditoria-arquitectura-frontend-v2-2026-07-30.md` |
| ¿Cómo se ejecuta la refactorización de módulos grandes? | `Agente/planes/plan-refactorizacion-arquitectura-2026-07-30.md`                    |
| ¿Cómo preparar y ejecutar el piloto DeepSWE?            | `Agente/documentacion/herramientas/deepswe-piloto-2026-07-31.md`                  |
| ¿Cómo se planifica el tema claro/oscuro del OS?         | `Agente/planes/plan-modo-oscuro-os-2026-07-31.md`                                  |
| ¿Cómo se revisan SOLID y escalabilidad por fase?        | `Agente/documentacion/arquitectura/checkpoints-solid-escalabilidad-2026-07-31.md` |
| ¿Cómo se agrega una nueva app al OS (receta canónica)?  | `Agente/documentacion/arquitectura/guia-agregar-app-2026-07-31.md`                 |
| ¿Cómo se cargan apps pesadas y cuál es su presupuesto?   | `Agente/documentacion/arquitectura/adr-carga-apps-pesadas-2026-07-31.md`           |
| ¿Cómo se planifica el bosque multijugador 3D? | `Agente/planes/plan-juego-bosque-multijugador-2026-08-01.md` |
| ¿Cómo se administran GLB y se edita terreno 3D desde una vista 2D? | `Agente/planes/plan-assets-terreno-bosque-3d-2026-08-01.md` |
| ¿Por qué Three.js, assets externos y terreno lógico 2D? | `Agente/documentacion/arquitectura/adr-bosque-3d-assets-terreno-2d-2026-08-01.md` |
| ¿Cómo se extrae el motor agnóstico para futuros juegos? | `Agente/planes/plan-glory-render-motor-juegos-2026-08-01.md` |
| ¿Cuál es la frontera del repositorio `glory-render`? | `Agente/documentacion/arquitectura/adr-glory-render-repositorio-agnostico-2026-08-01.md` |
| ¿Qué decisiones de producto faltan aprobar del Bosque? | `Agente/documentacion/producto/decisiones-pendientes-bosque-2026-08-05.md` |
| ¿Cómo migra el mundo del Bosque al publicar (decisión 8)? | `Agente/documentacion/arquitectura/adr-bosque-mundo-unico-reinicio-coordinado-2026-08-05.md` + `Agente/planes/plan-reinicio-coordinado-bosque-2026-08-05.md` |
| ¿Cuál es el inventario y frontera de `glory-render` (Fase 0)? | `Agente/documentacion/arquitectura/auditoria-glory-render-fase0-2026-08-05.md` |
| ¿Cómo se integra y versiona `glory-render` (submódulo, SemVer, CI)? | `Agente/documentacion/arquitectura/estrategia-integracion-glory-render-2026-08-05.md` |
| ¿Cómo se ejecuta la auditoría y corrección de Sentinel y el quality gate? | `Agente/documentacion/herramientas/auditoria-sentinel-completa-2026-08-10.md` (plan: `Agente/planes/plan-ejecucion-auditoria-sentinel-2026-08-10.md`) |
| ¿Qué decisión arquitectónica rige el producto único Sentinel? | `tools/sentinel/docs/adr/0001-producto-unico-sentinel.md` |
| ¿Cuáles son los conceptos, configuración y operación vigentes de Sentinel? | `tools/sentinel/docs/concepts.md`, `tools/sentinel/docs/configuration.md`, `tools/sentinel/docs/operations.md` |
| ¿Cómo se migra un gate legacy sin copiar carpetas ni conservar duplicados? | `tools/sentinel/docs/migration.md` + skill `quality-gate-setup` |
| ¿Cómo se hace bootstrap de un proyecto nuevo con Sentinel? | `sentinel init --preset <node|rust|python|mixed>` (docs en ADR 0001 y auditoría §14 F4) |
| ¿Cómo se migra o retira un gate legacy sin copiar scripts? | `C:\Users\Owner\.agents\skills\quality-gate-setup\SKILL.md` + auditoría §14.2 |
| ¿Cómo se diagnostican shims y ejecutables del guard? | `sentinel doctor --shims` (`src/core/shimDiagnostics.ts`) |
| ¿Cómo se paga la deuda SOLID del runtime de apps?       | `Agente/planes/plan-deuda-solid-runtime-2026-07-31.md`                             |
| ¿Cómo se arregla el grid/placeholder/debug de iconos del escritorio? | `Agente/planes/plan-iconos-escritorio-grid-2026-08-05.md` |
| ¿Por qué se cierran ventanas al abrir otra y cómo se resuelve? | `Agente/planes/plan-cierre-automatico-ventanas-2026-07-31.md`                |
| ¿Cómo se implementan los programas editoriales por vertical? | `Agente/planes/plan-programas-editoriales-2026-07-31.md`                       |
| ¿Cómo se protege el checkout, webhook y descarga digital? | `Agente/planes/plan-comercio-seguro-2026-08-01.md`                              |
| ¿Cómo se consienten, anonimizan y depuran las métricas? | `Agente/planes/plan-analytics-privacidad-2026-08-01.md` |
| ¿Cómo funciona el registro verificado y recovery?       | `Agente/planes/plan-auth-verificado-2026-08-01.md` |
| ¿Cuál es la paridad y el commit fijado de Sentinel/VarSense? | `Agente/documentacion/herramientas/matriz-paridad-sentinel-varsense-2026-08-01.md` |
| ¿Cómo se migra Sentinel a plano global sin romper el gate? | `Agente/planes/plan-global-quality-guard-agnostico-2026-08-02.md` + `Agente/documentacion/arquitectura/adr-sentinel-plano-global-028a6-2026-08-03.md` |
| ¿Cómo se actualiza, revierte y retira el runtime global de Sentinel? | `Agente/documentacion/herramientas/politica-actualizacion-rollback-sentinel-2026-08-04.md` |
| ¿Qué shells cubre el interceptor de Sentinel y cuál es su frontera? | `Agente/documentacion/herramientas/matriz-shells-sentinel-2026-08-04.md` |
| ¿Cómo se retiran los wrappers duplicados del repo tras dos releases? | `Agente/documentacion/herramientas/runbook-retirada-wrappers-sentinel-2026-08-05.md` |
| ¿Qué versiones, hashes, ramas y retención usa el gate actual? | `sentinel.lock.json` + `quality-tools.json` + `quality.config.json` + `Agente/documentacion/herramientas/matriz-paridad-sentinel-varsense-2026-08-01.md` |
| ¿Cómo se ejecuta backup, health y rollback sin SSH? | `Agente/documentacion/herramientas/runbook-coolify-backup-rollback-2026-08-01.md` |
| ¿Cómo replicar el estilo anime/cel de Sakura Crossing en el constructor? | `Agente/documentacion/estilo-sakura-crossing/00-indice-pipeline.md` (8 guías + replicación 138A-13) |

## Regla de autoridad

1. El roadmap solo contiene trabajo pendiente y enlaces.
2. El plan maestro solo contiene secuencia, checklists, dependencias y criterios de salida.
3. Arquitectura e identidad no se duplican dentro de planes.
4. Prevención contiene reglas automatizables pendientes, no decisiones de producto.
5. Los planes superados o completados se mueven a `Agente/planes/completados/`.
6. Una contradicción se resuelve en el documento canónico y luego se actualizan referencias.

## Estado de consolidación

- Manual de arquitectura: creado.
- Manual visual: creado a partir del concepto aprobado y la interfaz real.
- Plan maestro: activo; debe ejecutarse por checklist.
- Contratos de interacción y medición: activos; se cierran dentro de las tareas dueñas 297A-9–17.
- Quality gate Sentinel/VarSense: Sentinel 0.7.4/VarSense 2.2.1 publicados y adoptados; `gate:check` delega en `sentinel check`; rollback 0.7.1 ↔ 0.7.0 verificado; CI #45/#46 y matriz focal verdes; capa A (shims/guards duplicados) retirada tras verificar PATH, enforcement y rollback. La capa B espera SNT-10.
- Plan móvil: activo y bloqueado por runtime/workspace; tablet conserva desktop.
- Plan del bosque multijugador 3D: dirección Three.js aprobada; assets externos GLB y terreno finito editable en 2D quedan planificados, mientras gameplay/realtime siguen bloqueados por dependencias.
- Plan `glory-render`: propuesto para después de GAME-01/Fase 8; `frontend/src/features/game-core/` es candidato provisional y no se extrae sin segundo consumidor real. La Fase 0 quedó cerrada el 05-ago: auditoría (`auditoria-glory-render-fase0-2026-08-05.md` — 14 módulos CORE puros + `game-realtime` de frontera, sin dependencias de Three/DOM/red) y estrategia de integración/versionado (`estrategia-integracion-glory-render-2026-08-05.md` — submódulo fijado a etiqueta SemVer + dev local, política de licencias/CI/propietarios). Pendiente: aprobar la frontera con evidencia de segundo uso y abrir la Fase 1 (crear el repo).
- Plan visual antiguo: referencia histórica del concepto aprobado.
- Plan wandori.us original: superado; no es especificación activa.
- Plan Sentinel/VarSense editor-agnóstico: trabajo histórico documentado en tareas completadas.
- Estilo Sakura Crossing (138A-13): investigación documental del pipeline
  visual del juego de referencia (cel shading con tinte violeta, luces anime
  2+1, outlines ink+hull, color grading split-tone y cielo pintado) con
  código real y guía de replicación sobre el constructor actual; no cambia la
  decisión visual vigente "sin tinta" del Bosque hasta que el usuario la
  revierta.
- Matriz Sentinel/VarSense: actualizada con contrato de findings, comando combinado `all`, commits fijados, lockfile, branch-key y límites de runtime global.
- Migración global 028A-6/108A-6: Sentinel 0.7.4/VarSense 2.2.1, lock/doctor y gates de consumidores verificados; CI Ubuntu #45/#46 y matriz focal verdes; capa A retirada. Permanece el baseline de producto `broadcast-mutex-riesgo-rs` de glory-rs-rest (warning visible) y la evolución de capa B en SNT-10.
- Auditoría arquitectónica frontend v1: activa; plan de refactorización parcialmente ejecutado.
- Auditoría arquitectónica frontend v2: activa; 3 críticos, 5 altos, 8 medios identificados.
- Plan refactorización arquitectura: activo; runtime móvil 297A-12 implementado parcialmente con `mobile-shell.ts`/`mobile-stack.ts`; revisar gate de transición antes de avanzar.
