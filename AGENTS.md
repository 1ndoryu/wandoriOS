# WANDORIUS — instrucciones del proyecto

Especializa el `AGENTS.md` del área (`area-trabajo/AGENTS.md`): el protocolo común,
el gate (§5–§6) y el sistema documental (§7) valen aquí; abajo solo lo propio del proyecto.

OS web (wandori.us). Repo canónico `wandoriOS`. **Rama primaria y rama activa real `main`**
(declarada en `sentinel.config.json` como `project.primaryBranch`), sincronizada con
`legacy-wandorius/main`. La rama local `wandorius` es histórica/divergida, no operativa. Nunca asumir
`wandorius` como rama de trabajo.

- Gate unificado: `npm run gate:check -- <ID>`; `task:check` solo compat legacy. Orden del gate:
  preflight → Sentinel → VarSense → stack afectado → reporte en `.quality-reports/`.
  `local-light` normal; `--full`/`--ci` respetan cooldown 180 min.
- Stack: Rust/Axum/SQLx/PostgreSQL + Vanilla TypeScript/Vite. No React, Zustand ni CSS-in-JS.
  Backend: `handler → service/command → repository/adaptador`; SQL solo en repositories; inputs
  validados en el boundary; capacidades/autorización server-side.
- Frontend: `MountedView` con `AbortSignal`, `AppRegistry`, `WindowManager`/reducer,
  `MobileAppStack`; las apps devuelven contenido, solo el shell crea ventanas/chrome; móvil y
  desktop comparten apps/recursos/comandos/permisos/rutas.
- Identidad visual: Macintosh 1984/Mac OS 9 minimalista (no emulación literal); chrome monocromo
  blanco/negro, sin sombras/blur/gradientes/radios >1px; JetBrains Mono en todo; tokens en
  `variables.css`; validar 1440×900, 1024×768, 390×844, 320px, foco, teclado, zoom 200%.
- Coordinación: `npm run task:take -- --task <ID> --by <agente>` + `sentinel task claim`;
  worktrees en `<repo>/.sentinel/`; ciclo claim → start → heartbeat/gate → commit → integrate
  ff-only → cleanup → release; nunca force ni worktrees externos.
- Sentinel fijado en submódulo `tools/sentinel` (0.7.4, tag `v0.7.4`); VarSense en `tools/varsense`
  (2.2.1). Tras cambiar submódulo: publicar, actualizar gitlink, regenerar lock,
  `quality:lock -- --check`.
- Producción: solo `coolify-manager-rs` (nunca SSH/Docker/SCP/curl directo). Deploy sin autorización
  explícita está fuera de alcance.
- Seguridad: sesiones opacas revocables en cookie HttpOnly; CSRF/origin/rate limit; públicos nunca
  reciben drafts/privados/storage keys/DTOs internos; webhooks verificados e idempotentes; evitar
  N+1/roundtrips/estados redundantes/abstracciones sin segundo caso real.
- Documentación: `roadmap.md` (≤700 líneas), `Agente/documentacion/` por categoría, `Agente/planes/`,
  `Agente/prevencion/`. Fuentes canónicas: plan maestro 2026-07-29, manual de arquitectura e
  identidad visual, `roadmap-sentinel.md`.
