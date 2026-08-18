# Política de actualización, rollback y migración — Sentinel global (028A-6)

> **Fecha:** 2026-08-04
> **Estado:** contrato documental aprobado dentro del bloque local de Fase 0. No se ejecuta hasta disponer del runtime global versionado y sus fixtures; la instalación de shims y la modificación de perfiles permanecen bloqueadas por dependencia externa.
> **Fuente canónica del plan:** `Agente/planes/plan-global-quality-guard-agnostico-2026-08-02.md` (Fase 1, Fase 5 y Definition of Done).
> **ADR:** `Agente/documentacion/arquitectura/adr-sentinel-plano-global-028a6-2026-08-03.md`.

## 1. Objetivo y límites

Definir cómo se instala, actualiza, revierte y migra el runtime global de Sentinel **sin** romper ninguna rama activa ni el gate actual (`npm run task:check`). Este documento es el contrato que la implementación del runtime global deberá cumplir; no autoriza ejecutar instalaciones hoy.

- **Siempre explícito:** actualizar o instalar es una operación voluntaria (`sentinel install`, `sentinel update`, `sentinel rollback`). Nunca automática, nunca al abrir el editor.
- **Reversible:** toda operación deja la versión anterior disponible y probada antes de declararse exitosa.
- **No destructivo:** ninguna actualización borra versiones, perfiles ni backups sin confirmación explícita y verificación de ruta absoluta.
- **Ajeno preservado:** solo se modifican entradas administradas por Sentinel; nunca se tocan perfiles ni PATH de otros proyectos.

## 2. Modelo de versionado global

- Runtime versionado: `%LOCALAPPDATA%\GlorySentinel\versions\<version>\`.
- Alias activo: `%LOCALAPPDATA%\GlorySentinel\current\` → apunta a una versión concreta (copia o junction administrada, nunca ruta del repositorio).
- Shims `npm.cmd`, `npx.cmd`, `cargo.cmd`, `rustfmt` y CLI: `%LOCALAPPDATA%\GlorySentinel\bin\`.
- Perfiles: solo cargan `%LOCALAPPDATA%\GlorySentinel\current\profile.ps1` / `profile.sh`. Ningún perfil referencia una ruta dentro de un checkout.
- Lock y hashes: `sentinel.lock.json` declara la versión y el `artifactSha256` real exigido para runtime global (el adaptador local usa `project-adapter` con `artifactSha256: null` hasta entonces).

Cada versión debe poder identificarse por su commit y hash de artefacto verificable; nunca se ejecuta un binario arbitrario sin hash fijado en el lock.

## 3. Flujo de instalación y actualización

1. **Verificar precondiciones:** `sentinel doctor` confirma que no hay locks activos ni un proceso de actualización en curso; se registra la versión actual.
2. **Descargar a directorio temporal** (fuera del runtime, p. ej. `%LOCALAPPDATA%\GlorySentinel\.tmp\<version>`).
3. **Verificar integridad:** hash/commit del artefacto contra `sentinel.lock.json` antes de cualquier rename.
4. **Backup previo:** conservar la versión activa anterior (no se borra; `versions/<version-anterior>` permanece hasta dos releases).
5. **Instalar la nueva versión** en `versions\<version>\` y cambiar `current` de forma atómica (rename/switch, no borrado intermedio).
6. **Dot-source de perfiles:** solo si el perfil ya está autorizado, se añade/actualiza la carga de `profile.ps1`/`profile.sh`; siempre con backup previo del perfil y sin reescribir configuraciones ajenas.
7. **Verificación post-instalación:** `sentinel doctor` y `sentinel check <task>` de humo sobre un proyecto con política; si fallan, ejecutar rollback automáticamente (ver §4).

Nunca se usa `git add .` ni borrado recursivo: cada operación lista rutas exactas y verifica path absoluto antes de tocar nada fuera de `%LOCALAPPDATA%\GlorySentinel`.

## 4. Flujo de rollback

1. `sentinel rollback` selecciona la versión anterior conservada (criterio: última instalada antes de la actual, o versión explícita).
2. Restaura `current` de forma atómica apuntando a la versión anterior.
3. Restaura los backups de perfiles creados en el paso 6 del flujo anterior, si hubo cambios.
4. Verifica con `sentinel doctor` y un `sentinel check` de humo.
5. Registra el evento (versión anterior/nueva, motivo, timestamp) sin exponer secretos.

**Gate de rollback:** debe probarse sobre una copia de perfil antes de considerarse válido; ninguna rama activa pierde la capacidad de ejecutar su gate durante el proceso.

## 5. Migración desde el guard actual

- `npm run task:check -- <task-id>` conserva un **alias temporal** que delega en `sentinel check` durante la migración; el gate canónico pasa a ser `sentinel check <task-id>`.
- `quality-command-guard.mjs`, `global-cargo-guard.ps1`, `npm.cmd`, `npx.cmd` y `cargo.cmd` se migran al runtime global **sin duplicar reglas**: el catálogo de comandos protegidos vive una sola vez en la política.
- `quality.config.json` queda solo para la transición de tiempos, alcance y cachés; la política de comandos y analizadores vive en `sentinel.config.json` v2.
- VarSense se integra como analyzer versionado invocado por Sentinel; nunca cierra la tarea por separado ni mantiene un scheduler propio.
- Se ejecuta primero en modo `observe` comparando reportes normalizados; `enforce` solo se activa tras resolver diferencias, errores de herramienta y falsos positivos, con cinco tareas reales dentro del presupuesto.

## 6. Retirada del acoplamiento actual

- **PATH de `scripts/quality`:** se retira solo después de verificar el PATH global y de que la matriz multi-shell pase dos releases consecutivos.
- **Shims duplicados del repositorio:** se eliminan cuando dos versiones consecutivas del runtime hayan pasado la matriz (`roadmap-sentinel.md` SNT-08/SNT-10).
- **Guard actual:** se marca como legacy con un periodo de compatibilidad para ramas antiguas; el período no bloquea a una rama antigua.
- **Compatibilidad legacy de reportes:** la lectura de `.quality-reports/<task-id>/` se retira después de dos versiones de runtime (contrato `legacy-read-only`, `retireAfterCompatibilityVersion: 3`).
- **Desinstalación:** comando que quita únicamente entradas administradas por Sentinel (shims, `current`, versiones marcadas, líneas de perfil añadidas por él), nunca entradas ajenas.

## 7. Criterios de salida (Definition of Done)

- [ ] Existe rollback probado sobre una copia de perfil.
- [ ] Ninguna rama activa pierde la capacidad de ejecutar su gate durante actualización, rollback o retirada.
- [ ] No quedan rutas hardcodeadas a `C:\Users\...\glory-rust-template` en perfiles globales.
- [ ] El runtime global no depende de una rama ni de archivos del repositorio actual.
- [ ] La migración v1→v2 de configuración y `quality.config.json`/`quality-tools.json` tiene dry-run, backup, rollback y compatibilidad temporal.
- [ ] `sentinel doctor`, CI y shims muestran decisiones coherentes en la matriz de shells (ver documento hermano `matriz-shells-sentinel-2026-08-04.md`).

## 8. Reglas de seguridad aplicables

- Nunca ejecutar comandos definidos por JSON; el JSON solo selecciona clases y un gate allowlisted.
- Nunca instalar/actualizar/rollback sin verificación de hash contra `sentinel.lock.json`.
- Nunca modificar perfiles sin backup previo y autorización explícita.
- Actualizaciones usan directorio temporal, hash/verificación y rename atómico; rollback conserva la versión anterior.
- Si el runtime global está ausente o corrupto, `doctor` falla y los proyectos sin política pasan; no bloquear todo el sistema.
