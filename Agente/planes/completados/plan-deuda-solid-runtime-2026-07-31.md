# Plan 297A-23 — Deuda SOLID del runtime de apps

> **Fecha:** 2026-07-31
> **Estado:** Fases 3–5 técnicas y documentales completadas; validación visual del runtime pendiente separada en 297A-24.
> **Evidencia F1:** la jerarquía estaba duplicada en registry, adapter, comandos, menú y merge; `authenticated` permanece como capacidad válida para Cuenta y futuras áreas protegidas.
> **Última actualización:** 2026-07-31.
> **Epic:** 297A-4 (OS persistente, cuentas, programas y comercio).
> **Origen:** revisión SOLID de la guía canónica `Agente/documentacion/arquitectura/guia-agregar-app-2026-07-31.md`; hallazgos verificados contra `route-app-adapter.ts`, `app-registry.ts` y `app-registration.ts`.

## Objetivo y límites

Reducir la deuda SOLID detectada antes de que crezcan los dominios de 297A-14 (editors) y 297A-15 (comercio), sin cambiar comportamiento visible del OS.

- **Dentro:** refactor de `route-app-adapter.ts`, centralización de capacidades, resolución de la rama `authenticated` y test anti-drift registry ↔ workspace.
- **Fuera:** hot registration/plugin system, inyección de dependencias, migración de `routePatterns` → `deepLink` (ya planificada en 297A-19) y cualquier cambio de contrato público de `AppDefinition`.

## Hipótesis (validar antes y durante cada fase)

**H1 — SRP del adapter.** *"Dividir `route-app-adapter.ts` en un coordinador delgado + módulos extraídos (validación de capacidad, dedup de instancia, delegación móvil) mejora la testabilidad sin regresiones ni cambio de contrato."*
- Falsación: la refactor introduce más superficie que lógica (el coordinador vuelve a coordinar todo) o algún flujo (interceptor, `openAppWindow`, móvil) cambia de comportamiento.

**H2 — Capacidades en un solo punto.** *"Centralizar la jerarquía `public < authenticated < admin` en un módulo único (`capability.ts`) consumido por `AppRegistry.getAvailable` y `route-app-adapter` elimina la duplicación OCP/DRY."*
- Falsación: los dos consumidores no pueden expresar su intención con el mismo contrato (p. ej. el adapter necesita orden + comparación y el registry solo filtro) sin añadir acoplamiento nuevo.

**H3 — Rama muerta `authenticated`.** *"Decidir el destino de `authenticated`: la app Cuenta (297A-13) la usará para estados intermedios, o se retira del tipo `Capability`."*
- Falsación: tras decidir, queda una tercera capacidad sin consumidor o se fuerza un uso artificial solo para justificar el tipo.

**H4 — Anti-drift registry ↔ workspace.** *"Un test que verifica que todo nodo `type:'app'` en `default-release.ts`/`ADMIN_NODES` tiene `AppRegistry.register` (y viceversa) previene el bug real ya sufrido (admin sin registro)."*
- Falsación: el test genera falsos positivos (p. ej. nodos de apps planificadas aún no registradas) que obligan a suppressions en lugar de detectar drift real.

## Fases

### Fase 1 — Validación de hipótesis (sin código)
- [x] Releer `route-app-adapter.ts` completo y listar cada responsabilidad con sus consumidores (interceptor, `openAppWindow`, móvil). *(adapter coordina rutas, autorización, dedup, lifecycle desktop y delegación móvil)*
- [x] Confirmar la duplicación de la jerarquía de capacidades en registry, adapter, comandos, menú y merge. *(búsqueda 2026-07-31)*
- [x] Decidir el destino de `authenticated`: permanece en el contrato para Cuenta y futuras superficies autenticadas; no se retira.
- [x] Mapear los nodos `type:'app'` actuales frente a registros para dimensionar el test anti-drift. *(5 referencias: about, admin, projects, settings, trash; account queda legítimamente fuera por no tener icono)*

**Gate F1:** H1 sigue abierta; H2 implementada en F2; H3 validada; H4 implementada y verificada en F4.

### Fase 2 — Centralizar capacidades (H2)
- [x] Crear `frontend/src/features/runtime/capability.ts` con el tipo `Capability`, el orden y helpers de comparación/filtro.
- [x] Consumirlo en `app-registry.ts`, `route-app-adapter.ts`, `app-commands.ts`, `desktop-menu-bar.ts`, `command-registry.ts`, `resource-type-registry.ts` y `workspace/merge.ts`.
- [x] Conservar `authenticated` en el contrato para Cuenta y futuras superficies autenticadas.
- [x] `npx tsc --noEmit` + tests de registry/adapter; sin cambios de contrato externo. *(typecheck PASS; Vitest 246/246)*

**Gate F2:** una sola fuente de verdad de capacidades; cero arreglos de jerarquía duplicados; `task:check` y `self-check` PASS.

### Fase 3 — SRP del adapter (H1)
- [x] Extraer validación de ruta/capacidad (`validateRouteAccess`) y autorización interna (`canOpenApp`) a helper puro con tests; los parámetros internos no se confunden con URLs públicas.
- [x] Extraer dedup de instancia (`findExistingWindow`) para non-singleton con params y singleton, con tests.
- [x] Extraer la delegación móvil y `clearRuntimeApps` a `runtime-presentation.ts`, con frontera desktop/mobile y teardown del handler.
- [x] Dejar `initRouteAppAdapter`/`openAppWindow` como coordinadores delgados que orquestan todos los helpers. *(122 líneas físicas; coordinación efectiva <120; el bloque Finder de título es un caso local de 7 líneas y no justifica ampliar AppDefinition)*

**Evidencia F3:** `app-instances.ts` no importa router, stores mutables, DOM ni presentación; `runtime-presentation.ts` concentra la frontera desktop/mobile. El adapter conserva únicamente router, autorización, dedup, montaje, historial y lifecycle. No se extrae el título Finder porque hacerlo añadiría un contrato global por un único caso sin beneficio proporcional.
- [x] Correr tests existentes del router/adapter + suite frontend; typecheck y 261 tests PASS. La validación visual real en navegador desktop/mobile permanece como evidencia pendiente controlada.

**Gate F3:** PASS técnico: coordinación efectiva <120 líneas, todos los helpers con test, rutas/lifecycle sin regresión en suite. La prueba visual en 2 resoluciones queda pendiente explícita y no bloquea la decisión estructural de no sobre-abstraer Finder.

### Fase 4 — Test anti-drift (H4)
- [x] Crear test que cruza `AppRegistry` registrado con nodos `type:'app'` de `default-release.ts` + `ADMIN_NODES` (refId ↔ id).
- [x] Resolver falsos positivos reales antes de añadir suppressions. *(solo se valida workspace → registry; apps internas sin icono no fallan)*
- [x] Verificar que detecta el caso histórico y un `app` sin `refId`.

**Gate F4:** PASS; detecta `unregistered-app` y `missing-refId`; excluye folders/shortcuts; cero suppressions injustificadas.

### Fase 5 — Cierre
- [x] Actualizar la guía `guia-agregar-app-2026-07-31.md`: capability única, deep links allowlisted, parámetros internos y contrato anti-drift quedan documentados.
- [x] Ejecutar `npm run task:check -- 297A-23` y registrar evidencia S1–S5 en el plan/completados. *(gate fresco y self-check PASS; 267 tests frontend PASS en la validación final)*
- [x] Archivar en `Agente/completados/tareas-2026-07-31.md` y actualizar roadmap. El commit queda a cargo del flujo Git explícito del repositorio.

**Gate F5:** PASS técnico y documental; guía sincronizada; sin cambios de comportamiento observables. La validación visual desktop/móvil permanece como evidencia controlada del bloque 297A-24, no como deuda SOLID del runtime.

## Pruebas obligatorias y Definition of Done

### Evidencia del tramo F2 — 2026-07-31

- `capability.ts` centraliza `Capability`, `capabilityLevel` y `hasCapability`.
- Consumidores migrados: AppRegistry, RouteAppAdapter, comandos, menú desktop, CommandRegistry, ResourceTypeRegistry, workspace merge/types/stores y AuthState.
- `hasCapability` falla cerrado ante capacidades desconocidas; merge tiene regresión para nodos corruptos.
- TypeScript PASS; Vitest **246/246 tests en 28 archivos PASS**.
- `npm run task:check -- 297A-23 --fresh`: PASS; `self-check -- -TareaId 297A-23`: PASS.
- Sentinel: 0 errores; VarSense: 0 errores; Rust: 4 comandos PASS; documentación coherente.
- Revisión code-reviewer-luna: PASS, sin bloqueantes.

- [x] Tests unitarios de los helpers extraídos (positivo, negativo y regresión). *(app-instances.test.ts + runtime-presentation.test.ts)*

### Evidencia F4 — 2026-07-31

- `workspace-app-contract.ts` extrae nodos `type:'app'` por `nodeId` y `refId`.
- El contrato real cruza `DEFAULT_RELEASE` + `ADMIN_NODES` contra `AppRegistry`; detecta `unregistered-app` y `missing-refId`.
- Folders y shortcuts quedan fuera; apps registradas sin icono no generan falsos positivos.
- TypeScript PASS; Vitest **261/261 tests en 31 archivos PASS** en el cierre F4 histórico.
- Validación final del contrato `publicLocator`: TypeScript PASS; Vitest **267/267 tests en 32 archivos PASS**; `task:check -- 297A-23 --fresh`: PASS; `self-check -- -TareaId 297A-23`: PASS.
- Sentinel: 0 errores; VarSense: 0 errores; Rust `fmt`/`check` PASS; 8 tests unitarios de `workspace_overlay` PASS.
- `npm test` ejecuta `cargo test` con `run-with-db`, migraciones/contexto por rama y confirmó **17/17 tests PASS**. Ejecutar `cargo test` directo sin `DATABASE_URL` y sin migraciones no es el flujo soportado. El split de modelos Rust del overlay quedó aplicado y validado con `cargo check`.
- Revisión arquitectónica: sin bloqueantes; Rust valida forma/seguridad y el frontend valida catálogo/deep-link allowlisted sin duplicar `AppRegistry`.


- [ ] Prueba visual en navegador: desktop ≥768px y móvil <768px; deep links, focus/restore, dedup, singleton y cambio de breakpoint. *(pendiente controlado del bloque visual 297A-24)*
- [x] Evidencia S1–S5 enlazada (checkpoints SOLID): S1 helpers separados; S2 app no modifica shell; S3 AppDefinition estable; S4 adapters sin SQL/DOM de shell; S5 tests/gate y límites documentados.
- [x] `npm run task:check -- 297A-23` PASS.
- [x] Documentación (guía, roadmap, completados) sincronizada.

### Decisión de frontera pública de recursos

- `resourceId`/`refId` del workspace son identificadores internos de instancia y no se serializan en URLs públicas.
- Un recurso solo obtiene un deep link cuando el contrato público del release/recurso entrega un `slug` o alias allowlisted; el frontend no resuelve UUIDs mediante endpoints administrativos.
- Si el release todavía no transporta esa referencia pública, la apertura muestra feedback seguro y no crea una ventana vacía. La ampliación del envelope público pertenece a 297A-10/297A-19, con DTO público, autorización y pruebas de no enumeración.
- `publicLocator` es propiedad semántica del release y se acepta solo en nodos `resource`/`shortcut` públicos. Un overlay personal puede conservarlo al copiar un nodo público; no puede usarlo para exponer un `refId` interno, token, grant o ruta privada. `requires` ausente equivale a `public`.
- El backend valida estructura, límites, capacidad pública y claves no sensibles; la existencia de `appId` y la compatibilidad de parámetros se valida en el resolver frontend contra `AppRegistry`/`deepLink`, evitando duplicar el catálogo de apps en Rust.

## Enlaces

- Guía canónica de apps: `Agente/documentacion/arquitectura/guia-agregar-app-2026-07-31.md`
- Checkpoints SOLID: `Agente/documentacion/arquitectura/checkpoints-solid-escalabilidad-2026-07-31.md`
- Manual de arquitectura: `Agente/documentacion/arquitectura/manual-arquitectura-wandorius-2026-07-29.md`
- Roadmap: `roadmap.md` (297A-23)
