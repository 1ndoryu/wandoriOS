# Matriz de compatibilidad de shells — Sentinel global (028A-6)

> **Fecha:** 2026-08-04
> **Estado:** contrato documental aprobado dentro del bloque local de Fase 0. La ejecución de la matriz contra shells reales y CI permanece bloqueada hasta disponer del runtime global versionado y sus fixtures (Fase 4).
> **Plan canónico:** `Agente/planes/plan-global-quality-guard-agnostico-2026-08-02.md` (Fase 0, Fase 4) y `roadmap-sentinel.md` (SNT-08, SNT-10).

## 1. Objetivo

Definir el comportamiento esperado del interceptor de Sentinel en cada shell soportado, sin depender de variables específicas de VS Code. Este contrato fija qué se cubre, qué se observa y qué requiere el launcher del agente/CI; nunca presenta bypasses como cobertura completa.

## 2. Shells en alcance

| Shell | Plataforma | Carga del perfil | Mecanismo de intercepción |
| --- | --- | --- | --- |
| Windows PowerShell 5.1 | Windows | `$PROFILE` (`profile.ps1` global estable) | dot-source de `profile.ps1` + shims en `bin` |
| PowerShell Core 7+ | Windows/Linux/macOS | `$PROFILE` (`profile.ps1`) | dot-source de `profile.ps1` + shims en `bin` |
| CMD | Windows | Sin perfil persistente seguro | solo shims en `bin` (PATH administrado); la intercepción de línea de comandos interactiva queda registrada como límite |
| Bash / Git Bash | Windows/Linux/macOS | `~/.bashrc` / `BASH_ENV` (interactivo y no interactivo) | dot-source de `profile.sh` + shims en `bin` |
| CI (Linux runners) | Linux | Sin perfil de desarrollador | política del proyecto + runtime fijado; el runner invoca `sentinel guard`/`sentinel check` explícitamente |

## 3. Contrato de shims

- Se invoca con `shell: false` / argumentos separados al ejecutar Node; nunca comandos concatenados.
- Preservan argumentos, códigos de salida y redirecciones (`2>&1`, pipes, `>`), en PowerShell, CMD y Bash.
- Resuelven el ejecutable real sin recursión (un shim no invoca a otro shim infinitamente).
- No imprimen tokens, variables de entorno, argumentos completos ni rutas sensibles en mensajes de bloqueo.

## 4. Frontera de enforcement

- **Cobertura normal:** shells interactivos que cargan el perfil dot-sourceado y comandos que resuelven shims desde `bin`.
- **Bypass no interceptable por scripts del repositorio:** rutas absolutas de binarios y shells lanzados con `--noprofile --norc`. Estos casos se registran como bypass en `doctor`/reportes; no se presentan como cobertura completa.
- **Launcher del agente/CI:** debe invocar `sentinel guard` antes de ejecutar procesos para cubrir los casos que un script de proyecto no puede interceptar. Sin launcher, la cobertura global no se declara cerrada.

## 5. Comportamiento esperado por shell

- PowerShell 5.1 y Core 7: `$LASTEXITCODE` preservado; `$ErrorActionPreference` no alterado por Sentinel; profile dot-sourceado con backup previo.
- CMD: `%ERRORLEVEL%` preservado; shims `.cmd` en `bin` antepuesto en PATH administrado; sin reescritura de `AutoRun` (se documenta como límite).
- Bash/Git Bash: `$?` preservado; `BASH_ENV` soporta shells no interactivos; sin variables de VS Code.
- CI: usa la política del proyecto y el runtime fijado por `sentinel.lock.json`; nunca el perfil del desarrollador. Refs CI allowlisted (`GITHUB_HEAD_REF`/`GITHUB_REF_NAME`/`CI_COMMIT_REF_NAME`) para identidad de rama.

## 6. Matriz de validación (Fase 4, pendiente del runtime)

- Fixtures de proyectos Node, Rust, Python y un proyecto sin política.
- Comandos a probar en cada shell: `npm`, `npx`, `cargo`, `rustfmt`, comandos directos, `2>&1`, pipes y códigos de salida.
- Rutas anidadas, junctions/symlinks permitidos, repositorio movido y checkout de ramas con/sin política.
- Agentes con PowerShell/Bash/CMD: procesos hijos, pipes, `2>&1`, shell sin perfil y rutas absolutas; cada caso clasifica **bloquea**, **observa** o **requiere enforcement del launcher**.
- Gate: 100% de fixtures con decisión esperada, sin bloqueo cruzado entre proyectos y sin proceso huérfano.

## 7. Criterios de salida

- [ ] `sentinel doctor`, CI y los shims muestran decisiones coherentes en PowerShell 5/7, CMD y Bash/Git Bash.
- [ ] Windows/Linux/macOS y CI producen reportes equivalentes.
- [ ] La matriz multi-shell pasa durante dos releases consecutivos antes de retirar shims duplicados del repositorio (política de retirada en `politica-actualizacion-rollback-sentinel-2026-08-04.md`).
- [ ] Ningún comando legítimo queda bloqueado en un proyecto sin política; el enforcement de proyectos con política falla cerrado ante runtime/analyzer ausente o divergente.
