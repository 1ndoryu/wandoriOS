---
applyTo: '**'
---

# AGENTS — wandori.us

> **Capa:** contrato específico de este repositorio y de la rama operativa. Las reglas universales de
> seguridad, disciplina de herramientas, coordinación Sentinel, validación y automejora viven en la skill
> global `conducta-global`. Cargarla antes de trabajar; no usar `C:\Users\Owner\.copilot\instructions\conducta.instructions.md`
> como fuente de autoridad para este agente.

## 1. Prioridad del proyecto

1. Leer `roadmap.md` completo y revisar los planes activos de `Agente/planes/`; ejecutar solo el siguiente bloque habilitado.
2. Usar el gate unificado antes de cerrar cualquier tarea: `npm run gate:check -- <ID>`; `task:check` solo
   permanece como compatibilidad legacy.
3. No iniciar seguridad, runtime, workspace, móvil, programas, juegos o comercio si su dependencia documental/técnica está abierta.
4. Cambios visuales materiales requieren actualizar el manual aplicable y validación real en navegador.
5. Deploy está fuera de alcance salvo instrucción explícita del usuario; producción usa exclusivamente Coolify Manager.

## 2. Fuentes canónicas

- Pendientes y orden: `roadmap.md`.
- Plan maestro: `Agente/planes/plan-escritorio-persistente-cuentas-admin-apps-2026-07-29.md`.
- Arquitectura: `Agente/documentacion/arquitectura/manual-arquitectura-wandorius-2026-07-29.md`.
- Identidad visual: `Agente/documentacion/design-system/manual-identidad-visual-os-2026-07-29.md`.
- Móvil: `Agente/planes/plan-experiencia-movil-launcher-2026-07-29.md`.
- Quality gate: `Agente/planes/completados/plan-escalabilidad-sentinel-wandorius-2026-07-29.md`.
- Interacción/comandos/medición: `Agente/planes/plan-contratos-interaccion-comandos-medicion-2026-07-29.md`.
- Prevención: `Agente/prevencion/prevencion-wandorius-sentinel-varsense-2026-07-29.md`.
- Sentinel/VarSense: `roadmap-sentinel.md`, `Agente/planes/plan-global-quality-guard-agnostico-2026-08-02.md`, `Agente/planes/plan-optimizacion-sentinel-varsense-2026-08-02.md`.
- Migración de scripts/adapters: `Agente/planes/plan-migracion-scripts-adapters-sentinel-2026-08-06.md`.
- Inventario de scripts/adapters: `Agente/documentacion/herramientas/inventario-scripts-adapters-sentinel-2026-08-06.md`.
- Índice documental: `Agente/documentacion/indice-documentacion-2026-07-29.md`.

No dupliques decisiones: modifica primero la fuente canónica y enlaza desde el resto.

## 3. Identidad técnica y arquitectura

**Stack:** Rust/Axum/SQLx/PostgreSQL + Vanilla TypeScript/Vite. No React, Zustand ni CSS-in-JS.

**Backend:** dominios `identity`, `workspace`, `content`, `media`, `commerce`, `analytics` y `audit`.
El flujo obligatorio es `handler → service/command → repository/adaptador`; SQL solo en repositories,
y transacciones/outbox en services. Inputs se validan en el boundary; capacidades y autorización son
server-side.

**Frontend:**

- `MountedView` con `AbortSignal` y teardown.
- `AppRegistry` y capacidades locales.
- `WindowManager`/reducer para desktop/tablet.
- `MobileAppStack`/launcher como presentación móvil del mismo runtime.
- `CommandRegistry`, `RouteAppAdapter` y `AnalyticsDispatcher` tipado.
- Las apps devuelven contenido; solo el shell crea ventanas y chrome.
- No duplicar lógica con `MobileFooApp`; móvil y desktop comparten apps, recursos, comandos, permisos y rutas.

**Datos:** workspace guarda nodos/referencias; contenido vive en recursos tipados. Release público es
inmutable y se combina con overlay personal y estado de sesión. Editorial, visibilidad, lifecycle y
comercio son estados independientes. Todo recurso nace `draft + private + active`; productos además
inactivos.

**Juegos:** `frontend/src/features/game-core/` es provisional. La lógica agnóstica futura va a
`glory-render/` con Git/CI/versionado propios; no incluirá identidad, OS, backend, salas ni reglas del Bosque.

## 4. Identidad visual del OS

- Macintosh 1984/Mac OS 9 minimalista, no emulación literal.
- Chrome monocromo blanco/negro; sin sombras, blur, gradientes suaves, radios ni bordes mayores de 1px.
- JetBrains Mono en todo el OS; iconos Lucide oficial a 1px, salvo el círculo negro de marca.
- Una sola `DesktopWindow`: X izquierda, título centrado, Minus derecha y resize por bordes.
- Menús compactos sin separadores; teclado completo.
- Taskbar sin Inicio: navegación, ventanas abiertas, estado y cierre.
- Tokens centralizados en `variables.css`; sin CSS inline ni recetas visuales locales por app.
- Multimedia puede conservar color; el chrome permanece monocromo.
- Validar 1440×900, 1024×768, 390×844 y 320px, incluyendo foco, teclado y zoom 200%.

## 5. Ramas y presentación

La rama primaria de este consumidor es `wandorius`; no asumir `main`. Está declarada en
`sentinel.config.json` como `project.primaryBranch`. `main` contiene el template vacío.

- Desktop/tablet (`>=768px`): escritorio, ventanas, barra superior y taskbar.
- Móvil (`<768px`): launcher tipo teléfono y apps a pantalla completa; sin ventanas, barra superior ni taskbar.
- Al cambiar breakpoint se conserva la app/recurso activo y se transforma solo la presentación.

## 6. Gate del proyecto

El único cierre normal es `gate:check`, que genera el manifest declarativo y delega la decisión en
`sentinel check`:

```text
npm run gate:check -- <ID>
```

Orden del gate: preflight → Sentinel → VarSense → stack afectado → reporte Markdown/JSON. El detalle
vive en `.quality-reports/`; los errores de herramienta, findings bloqueantes y tests fallidos producen
exit code no cero. `local-light` es el modo normal; `--full`/`--ci` se reservan para fase/CI y respetan
el cooldown de 180 minutos. Las excepciones `--allow-heavy` requieren motivo y quedan auditadas.

Comandos del consumidor:

```text
npm run gate:check -- <ID>
npm run task:check -- <ID>       # compatibilidad temporal; no añadir lógica nueva aquí
npm run quality:test
npm run quality:doctor
npm run quality:lock -- --check
npm run quality:reports:cleanup:dry
npm run quality:cleanup:dry
```

`npm run self-check -- -TareaId <ID>` es alias de compatibilidad y usa el mismo core; no duplica la suite.
Los comandos directos pesados no sustituyen el gate.

## 7. Contratos de calidad versionados

- `sentinel.config.json`: política v2 del proyecto, guard, gate, analyzers y rama primaria.
- `varsense.config.json`: tokens, hardcodes, clases y exclusiones CSS del proyecto.
- `quality.config.json`: alcance, perfiles, tiempos, cachés, retención y guard de transición.
- `quality-tools.json`: repositorios, commits, versiones, capacidades, CLIs y source paths.
- `sentinel.lock.json`: commits, hashes, protocolos y capacidades realmente instalados.
- `scripts/quality/`: solo adapter/orquestador de transición (capa B); los shims/guards duplicados de la capa A fueron retirados. No se debe ampliar como segundo core ni copiar a otro proyecto. La migración y clasificación canónica viven en `Agente/documentacion/herramientas/auditoria-sentinel-completa-2026-08-10.md` §14 y en la skill `quality-gate-setup`.
- Los agentes no crean carpetas personales, analyzers ni reglas de quality sin declaración project-owned,
  fixtures, presupuesto, owner único y sunset. Una finalidad desconocida bloquea la migración; no se borra
  por el nombre de la carpeta.

Sentinel está fijado en el submódulo `tools/sentinel`, release publicada `0.7.4` (tag `v0.7.4` en
`0349485c121784513c7ecef8a8de1535e841a5ae`), disponible en `origin/main`.
VarSense está fijado en `tools/varsense`, versión `2.2.1`, commit
`88f281f94e6febd02a386b7ed03d30d285eb82e1`, tag `v2.2.1`. `quality-tools.json` y
`sentinel.lock.json` deben coincidir con los gitlinks. Tras cambiar un submódulo: publicar primero,
actualizar el gitlink, regenerar el lock y ejecutar `quality:lock -- --check`.

El runtime global no forma parte del checkout; el lock local declara `project-adapter` con
`artifactSha256: null`. No afirmar capacidades globales por un README: comprobar el commit, `--help`,
`doctor` y el artefacto instalado.

## 8. Coordinación específica del consumidor

La skill `conducta-global` define el ciclo Sentinel obligatorio y sus invariantes. Este proyecto añade
un lock de takeover para coordinar agentes sobre el checkout compartido:

```text
npm run task:take -- --task <ID> --by <agente>
sentinel task claim <ID> --project-root <repo> --agent <agente>
```

Ambos son complementarios: `task:take` coordina el consumidor y `sentinel task` aísla Git en el
worktree. El gate reconoce la toma propia solo si `GLORY_AGENT_ID` coincide con `--by`.

El ciclo completo es:

```text
claim → start → heartbeat/gate → commit → integrate --ff-only → cleanup → release
```

Los worktrees y metadata de Sentinel viven dentro de `<repo>/.sentinel/`; `.sentinel/` está ignorado.
No usar worktrees externos, no integrar en otro target y no liberar una tarea con rama, worktree o
metadata pendiente. Si hay conflicto, resolverlo en el worktree de la tarea, repetir gate y reintentar
`--ff-only`; nunca usar force ni borrar recursos ajenos.

## 9. Seguridad y límites del dominio

- Capacidades, precio, pago, entrega y permisos siempre se verifican server-side.
- Sesiones opacas revocables en cookie HttpOnly; CSRF, origin y rate limit; auditoría separada sin secretos.
- Públicos nunca reciben drafts, assets privados, storage keys ni DTOs internos.
- Webhooks verificados e idempotentes; descargables privados mediante entitlement y grant corto.
- Evitar N+1, roundtrips innecesarios, estados redundantes y abstracciones sin segundo caso real.
- No `eval`, HTML no sanitizado, SQL interpolado, `unwrap` sobre input externo, catch vacío ni I/O silencioso.

## 10. Organización documental del proyecto

```text
roadmap.md                         ← solo pendientes y siguiente bloque
Agente/
  completados/tareas-YYYY-MM-DD.md
  documentacion/{categoria}/       ← decisiones y manuales canónicos
  lecciones/lecciones-aprendidas.md
  planes/plan-tema-YYYY-MM-DD.md   ← activos
  planes/completados/              ← históricos
  prevencion/                      ← reglas automatizables pendientes
```

`roadmap.md` no supera 700 líneas, no acumula completadas y lista los planes activos con estado. Todo
plan activo declara objetivo, límites, dependencias, fases verificables, gate y Definition of Done.
Una completada registra Qué/Archivos/Gotchas/Sentinel/GLORY. Una prevención que se implementa se
archiva y se refleja en la fuente canónica.

## 11. Herramientas del proyecto

### Coolify Manager

Toda operación de producción usa `coolify-manager-rs`; nunca SSH, Docker, SCP ni curl directo al servidor.
Binario:

```text
C:\Users\Owner\OneDrive\Documentos\WP\app\public\wp-content\themes\glorytemplate\.agent\coolify-manager-rs\target\release\coolify-manager.exe
```

Flujo: verificar binario → `deploy --name <sitio> --update` → `health` → si falla `redeploy`/restore.
No desplegar sin autorización explícita.

### Sentinel y VarSense

- Editar reglas agnósticas en sus repositorios upstream, con fixtures positivas/negativas y paridad CLI/LSP/editor.
- Publicar el commit antes de fijarlo en el consumidor; un detached worktree no es una release.
- VarSense es analyzer especializado; nunca crea gate, cooldown o reporte de cierre paralelo.
- Las reglas, clases, rutas y excepciones de wandori.us permanecen en configuración/adapters del consumidor.

## 12. Definition of Done

Antes de declarar una tarea terminada:

- gate y pruebas apropiadas PASS;
- diff revisado y cambios ajenos separados;
- roadmap/plan/completado actualizados solo con evidencia;
- no quedan locks, procesos, worktrees, ramas ni temporales de la tarea;
- commit explícito creado; push solo con autorización;
- claims/takeover liberados después de integrar y limpiar;
- cualquier mejora de Sentinel/VarSense queda reproducida, testeada, publicada, fijada y documentada.

La skill global pregunta explícitamente si cada fallo o fricción debe convertirse en regla, fixture o mejora
de herramienta. En este repositorio, registrar la decisión en `Agente/prevencion/`, el plan canónico o
`Agente/lecciones/`, según corresponda.
