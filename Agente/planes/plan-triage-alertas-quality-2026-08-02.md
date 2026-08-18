# Plan 028A-1 — Triage de alertas de calidad

> **Fecha:** 2026-08-02  
> **Estado:** activo; inventario inicial verificado con `.quality-reports/297A-48/`.  
> **Dueño:** `roadmap.md`; las correcciones de código se ejecutan en el bloque que asigne cada regla.  
> **Fuentes:** `roadmap-sentinel.md`, `Agente/prevencion/prevencion-wandorius-sentinel-varsense-2026-07-29.md`.

## Objetivo y límites

Evitar que un agente interprete `PASS` del quality gate como permiso para ignorar warnings. Este plan clasifica la deuda, asigna prioridad y exige evidencia para corregirla, justificar una excepción o archivarla como ruido. No cambia reglas de Sentinel/VarSense ni corrige código en este bloque; esas acciones se ejecutan en tareas dueñas posteriores.

## Evidencia del último reporte

`297A-48` terminó técnicamente en `PASS`, pero registró:

- Sentinel: **250 warnings**, 13 informaciones.
- VarSense: **77 warnings**, 75 informaciones.
- reglas custom: **40 warnings**.
- Tendencia: el full scan pasó de 216 warnings Sentinel en `018A-92` a 250 en `297A-48`; la deuda no está bajando.
- El reporte fue `scope: full` aunque solo cambió un subconjunto de archivos; esos conteos son baseline global, no 455 regresiones nuevas. El gate debe mostrar delta por archivo/regla además del total.
- Delta real de `297A-48` contra los archivos cambiados: **19 hallazgos**. No se deben perder: `game_profile_repo.rs` tiene 3 consultas productivas sin macro; `main.ts` tiene 4 suscripciones, 2 referencias `window`, 1 acceso DOM y 1 `console`; los 5 SQL de `tests/game_profile.rs` son helpers de prueba; las 3 informaciones restantes son CSS inline de bootstrap.

Un warning repetido cuenta como deuda hasta que tenga resolución, excepción por archivo/regla o ticket con dueño y fecha de retirada. La severidad del gate no se cambia para maquillar el baseline.

## Alertas que no deben ignorarse

| Prioridad | Regla y volumen observado | Evidencia representativa | Tratamiento obligatorio |
| --- | --- | --- | --- |
| P0 | `subscription-without-dispose` — 40 | `features/runtime/window-session.ts`, `window-url-sync.ts`, `workspace/overlay-sync.ts`, `main.ts`, `mobile-shell.ts` | Verificar `unsubscribe`/teardown en cada suscripción; corregir fugas y probar mount/destroy repetido. Solo una suscripción de proceso con ciclo de vida explícitamente infinito puede documentarse como excepción. |
| P0 | `sqlx-query-sin-macro` + `sqlx-query-as-sin-macro` — 148 | producción en handlers/repositories y helpers bajo `#[cfg(test)]` | Migrar la producción a macros/query builders tipados. Los helpers de tests no se silencian: Sentinel debe distinguir `cfg(test)` y reportarlos como excepción de alcance o finding separado. |
| P0 | `handler-accede-bd-rs` — 12 | producción y helpers `#[cfg(test)]` de `media_handler.rs`, `preferences_handler.rs`, `workspace_overlay_handler.rs` | Restituir `handler → service/command → repository` en producción. Mejorar Sentinel para no exigir esa capa a fixtures/helpers de test; nunca ocultar consultas productivas. |
| P1 | `window-reference-outside-platform` — 39 y `dom-access-outside-platform` — 22 | `analytics/tracker.ts`, `features/seo/meta.ts`, `router.ts`, `viewport.ts`, `components/ui/modal.ts`, `confirm.ts` | Migrar accesos a adapters/boundaries permitidos. Modal, confirm y WebGL solo se exceptúan con contrato de plataforma, archivo, motivo y fecha de revisión; analytics/router/meta/viewport no se consideran excepción automática. |
| P1 | `console-production` — 7 | `analytics/tracker.ts`, `main.ts`, `command-registry.ts`, `game-playable.ts` | Usar logger/feedback estructurado. Los logs de un prototipo solo pueden quedar como excepción temporal con alcance explícito. |
| P1 | `api-call-outside-service` — 1 | `frontend/src/utils/safe-async.ts` (ejemplo dentro de JSDoc) | Corregir el analyzer para ignorar comentarios; después verificar que las llamadas ejecutables sí estén en services/adapters. No mover un ejemplo documental a producción. |
| P1 | `mixed-barrel-logic` — 6 | `features/desktop/apps/article-editor/article-editor-ui.ts` y similares | Separar re-export de lógica ejecutable; cubrir import público y ciclo de vida. |
| P1 | `limite-lineas` — 5 | `game-core/map-version.ts`, `models/game_map.rs`, `components.css` y tests | Dividir por responsabilidad antes de añadir más funcionalidad; una excepción Sentinel debe indicar por qué y cuándo retirarla. |
| P2 | `token-duplicate` — 59 | `frontend/src/styles/variables.css` | Son mayormente aliases 1-bit (mismo negro/blanco por tema): cambiar esos casos a `information`/allowlist por scope y corregir duplicados accidentales. No borrar tokens semánticos a ciegas. |
| P2 | `claseHuerfana` — 17 y `css-elemento-html-directo` — 7 | `components.css`, `desktop-apps.css` | Mejorar el índice para `classList.toggle`, factories, `account-view`, launcher de tema y clases externas; eliminar o migrar las clases realmente huérfanas (por ejemplo `account-app__secondary/error` y badges rechazado/procesando de media). |
| P2 | `directorio-abarrotado` — 3 | `src/models`, `src/repositories` y servicios | Reorganizar por dominio o añadir una excepción temporal con motivo; no esconder el warning globalmente. |
| P2 | `valorHardcoded` — 1 | `desktop/desktop-shell.css` (`rgba(255, 0, 0, 0.9)`) | Sustituir por token del sistema visual o justificar que es estado funcional, no decoración. |

## Hallazgos informativos, no bloqueantes

`cssInlineScript` (75) y `css-especificacion-diseno-local` (12) son informaciones de VarSense/Sentinel. No se deben convertir en errores automáticamente: el agente debe revisarlos cuando toque el archivo y reutilizar recetas/tokens si existe una alternativa. Una información no se borra del reporte ni se presenta como warning resuelto.

## Falsos positivos que requieren corrección del analizador

Estos casos no se deben “ignorar” ni arreglar con una suppression global. Se corrige la regla/fixture para que el próximo reporte exprese el alcance real:

- `handler-accede-bd-rs` y `sqlx-query-*` dentro de helpers `#[cfg(test)]`: distinguir código de prueba de handlers productivos.
- `api-call-outside-service` en el comentario JSDoc de `safe-async.ts`: ignorar comentarios y cadenas no ejecutables.
- `subscription-without-dispose` para suscripciones de lifetime de proceso y callbacks que ya retornan cleanup: analizar el valor de retorno y el ciclo `MountedView` antes de emitir finding.
- `claseHuerfana` para `classList.toggle`, factories, `account-view`, launcher de tema y clases generadas por TipTap/ProseMirror: ampliar el índice dinámico y conservar solo las clases realmente sin consumidores.
- `dom/window` de `meta.ts` (SEO), `viewport.ts` (wrapper central), UI modal/confirm y WebGL: declarar adapters/boundaries por configuración o mover el wrapper; `tracker.ts` sigue requiriendo adapter/logger.

## Fases y checklist

### Fase 0.75 — Protección contra ejecuciones pesadas repetidas (028A-3)

- [x] Aplicar cooldown de 180 minutos y concurrencia máxima de una ejecución pesada por proyecto.
- [x] Interceptar `cargo test 2>&1` como el mismo comando pesado; la redirección no evita el guard.
- [x] Añadir cuota/retención para `C:\tmp\glory-target` y preservar targets con proceso activo.
- [x] Degradar full bloqueado a `local-light` con razón, hora y override explícito en el reporte.
- [ ] Revisar y activar el perfil PowerShell con backup y autorización explícita; el shim PATH queda activo sin reescribir perfiles.

**Gate:** un agente que ignore el Markdown no puede iniciar repetidamente el full desde los wrappers disponibles; `--allow-heavy` es una excepción visible y manual.

### Fase 0.5 — Rendimiento del quality gate (028A-2)

La ejecución `297A-49` demostró que el problema principal no era Sentinel/VarSense: Rust consumió 90,5 % del tiempo y expiró en `cargo test` sobre un target frío. Esta fase reduce el coste de feedback sin convertir los pasos omitidos en un PASS engañoso.

- [x] Evitar que un cambio de manifiesto frontend (`package.json`/lock) fuerce por sí solo el full Rust.
- [x] Hacer que Rust local ejecute `fmt/check`; reservar clippy/tests para `--full` y `--ci`.
- [x] Mantener `test:changed` como selector por defecto y `test:full` como suite explícita.
- [x] Separar la caché por modo (`local-light`, `full`, `ci`) y recordar el comando completo en el reporte.
- [ ] Establecer benchmark cold/warm en CI/nocturno y presupuesto operativo para no volver a bloquear la máquina.

**Gate:** una tarea local no lanza la suite Rust completa salvo que se pida; el reporte identifica el modo y entrega el comando exacto para obtener cobertura completa. Antes de cerrar una fase o publicar debe pasar `npm run task:check -- <ID> --full` (o `--ci`).

### Fase 0 — Inventario y clasificación (este bloque)

- [x] Capturar el reporte full `297A-48` y separar Sentinel, VarSense y custom.
- [x] Agrupar por regla, volumen, archivo y tendencia histórica.
- [x] Registrar excepciones legítimas conocidas sin convertirlas en suppressions globales.
- [x] Separar findings productivos de helpers/tests y documentar falsos positivos reproducibles.
- [ ] Confirmar que cada alerta tiene una fila en este plan o un enlace a la tarea dueña.
- [ ] Registrar baseline por regla/archivo y calcular `new`, `recurrent` y `resolved`; el agente no debe tratar un warning recurrente como hallazgo nuevo.
- [ ] Archivar/mover los planes históricos o completados (`refactorizacion`, `persistencia-sesion`, `mejora-quality-tool`, `componentizacion-ui`, boceto visual) y cerrar/subdividir `barra-acciones` antes de abrir otro frente.

### Fase 1 — Lifecycle y boundaries (P0/P1)

- [ ] Auditar las 40 suscripciones con pruebas de montaje/desmontaje repetido.
- [ ] Hacer que el analyzer reconozca callbacks que devuelven cleanup y suscripciones de lifetime explícito.
- [ ] Corregir primero `window-session`, `window-url-sync`, `overlay-sync`, `main` y `mobile-shell`.
- [ ] Migrar `tracker`, `meta`, `router` y `viewport` a adapters; documentar únicamente los accesos de UI/WebGL que sean inevitables.
- [ ] Eliminar `console` de producción o reemplazarla por logger/feedback con redacción de secretos.

### Fase 2 — SQL y límites de capas (P0)

- [ ] Inventariar las 148 consultas sin macro y agruparlas por dominio.
- [ ] Mover las consultas productivas de handlers a repositories mediante services/commands.
- [ ] Añadir fixtures Sentinel para `#[cfg(test)]` y evitar falsos positivos de helpers.
- [ ] Añadir tests de compilación, autorización, parámetros y errores para cada grupo migrado.
- [ ] Registrar cualquier consulta que no pueda usar macro por SQL dinámico con motivo, alcance y fecha de retiro.

### Fase 3 — Estructura y deuda de mantenimiento (P1/P2)

- [ ] Separar barrels con lógica, dividir archivos que superan límites y revisar la interfaz grande como señal ISP.
- [ ] Resolver API fuera de service y directorios abarrotados por dominio, no mediante excepciones amplias.
- [ ] Revisar tokens duplicados, clases huérfanas, selectores HTML y valores hardcoded con VarSense y prueba visual.

### Fase 4 — Política y cierre

- [ ] Cada excepción queda registrada por regla, archivo, tarea, motivo, alcance y fecha de retirada.
- [ ] Ningún warning nuevo en un archivo tocado se etiqueta como “preexistente” sin comparación contra el reporte base.
- [ ] El reporte final publica conteo antes/después, warnings aceptados con owner y siguiente comando reproducible.
- [ ] La salida resumida muestra siempre `new/blocking/recurrent` y enlaza el detalle completo; limitar stdout a tres hallazgos no puede ocultar cuántos P0 existen.
- [ ] Ejecutar `npm run task:check -- 028A-1` y `npm run self-check -- -TareaId 028A-1`; el gate no se cierra por el mero estado `PASS` si quedan P0 sin dueño.

## Regla operativa para todos los agentes

Al cerrar cualquier tarea: leer el reporte completo en `.quality-reports/`, atender los warnings del archivo tocado, clasificar los demás como `fix-now`, `fix-before-phase-gate`, `documented-false-positive` o `accepted-noise`, y enlazar la clasificación a `roadmap.md`. “Preexistente” describe el origen, no autoriza a ignorarlo.

**Gate de salida:** no quedan P0 sin tarea dueña; toda excepción es acotada y fechada; la tendencia de warnings no aumenta sin explicación; el plan y el roadmap apuntan al mismo siguiente bloque.
