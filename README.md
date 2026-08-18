# Glory RS / wandori.us

Template y aplicación web con **Rust (Axum) + PostgreSQL + Vanilla TypeScript/Vite + OpenAPI** en un solo repositorio.

Pensado para velocidad de desarrollo, seguridad por defecto y calidad reproducible. Sentinel es el plano universal de coordinación y calidad. Este checkout conserva `scripts/quality` únicamente como adapter/orquestador de transición (capa B); los shims y guards duplicados del repositorio ya fueron retirados y el runtime global de Sentinel es la única fuente de interceptores. VarSense es un analizador especializado invocado por Sentinel. No se deben copiar estos scripts a otros proyectos: los proyectos nuevos usan `sentinel init` y los proyectos legacy pasan por inventario y clasificación.

## Stack

| Capa                 | Herramienta                  | Para qué                                |
| -------------------- | ---------------------------- | --------------------------------------- |
| Framework web        | Axum                         | HTTP, routing, middleware               |
| OpenAPI              | utoipa + utoipa-swagger-ui   | Genera schema OpenAPI desde código      |
| Serialización        | serde                        | JSON ↔ Structs                          |
| Base de datos        | SQLx (PostgreSQL)            | Queries SQL con verificación            |
| Migraciones          | SQLx migrate                 | Control de schema DB                    |
| Validación           | validator                    | Validar inputs del usuario              |
| Variables de entorno | dotenvy                      | Cargar .env                             |
| Logging              | tracing + tracing-subscriber | Logs estructurados                      |
| Errores              | thiserror                    | Errores tipados                         |
| Auth (sesión opaca)  | cookie HttpOnly + CSRF       | Sesiones revocables                      |
| Hashing              | argon2                       | Hashing seguro de contraseñas           |
| CORS                 | tower-http                   | Middleware CORS                         |
| Linter               | clippy (paranoia)            | Código limpio                           |
| Frontend             | Vanilla TypeScript + Vite   | UI del OS retro y apps                 |
| Estado               | Stores/adapters propios      | Estado runtime, sesión y workspace     |
| Codegen              | Orval                        | Genera cliente TypeScript desde OpenAPI |

## Requisitos

- Rust (stable, 1.75+)
- Node.js (18+) y npm
- PostgreSQL corriendo localmente

## Inicio rápido

```bash
# 1. Clonar el template con el framework fijado
git clone --recurse-submodules --branch main https://github.com/1ndoryu/glory-rs-template.git nuevo-proyecto
cd nuevo-proyecto
git submodule update --init --recursive
cp .env.example .env
# Editar .env con tus credenciales de PostgreSQL

# 2. Crear la base de datos
psql -U postgres -c "CREATE DATABASE glory_db;"

# 3. Backend
cargo run
# El servidor inicia en http://localhost:3000
# Swagger UI en http://localhost:3000/swagger-ui/

# 4. Frontend (en otra terminal)
cd frontend
npm install
npm run dev
# Frontend en http://localhost:5173

# 5. Generar cliente API (con backend corriendo)
npm run codegen
```

## Estructura del proyecto

```
├── Cargo.toml              # Dependencias del backend
├── src/
│   ├── main.rs             # Entry point del servidor
│   ├── lib.rs              # Re-exports y AppState
│   ├── config/             # Configuración desde env vars
│   ├── errors/             # Tipos de error → HTTP status codes
│   ├── handlers/           # Capa HTTP (routing, request/response)
│   ├── middleware/          # Auth middleware (sesion opaca HttpOnly)
│   ├── models/             # Structs de dominio y DTOs
│   ├── repositories/       # Capa de base de datos (queries)
│   └── services/           # Lógica de negocio
├── migrations/             # Migraciones SQL (SQLx)
├── frontend/
│   ├── src/
│   │   ├── api/            # Cliente API generado por Orval
│   │   ├── components/     # UI compartida
│   │   ├── features/       # Runtime del OS y apps
│   │   ├── pages/          # Vistas y adaptadores de ruta
│   │   └── main.ts         # Entry point Vanilla TypeScript
│   ├── orval.config.ts     # Configuración de codegen
│   └── vite.config.ts      # Configuración de Vite + proxy
├── .env.example            # Variables de entorno de ejemplo
└── .gitignore
```

## Arquitectura

El backend sigue separación en capas:

- **handlers/** → Reciben HTTP requests, extraen datos, llaman services, retornan responses
- **services/** → Lógica de negocio, orquestan repositories
- **repositories/** → Queries a PostgreSQL via SQLx
- **models/** → Structs de dominio, DTOs de request/response, schemas OpenAPI
- **errors/** → Enum de errores que mapean a HTTP status codes
- **middleware/** → Extractores de Axum (sesion opaca HttpOnly y CSRF)

## API de ejemplo

El template incluye un CRUD de notas con autenticación:

| Método | Ruta               | Descripción             | Auth |
| ------ | ------------------ | ----------------------- | ---- |
| POST   | /api/auth/register | Registrar usuario       | No   |
| POST   | /api/auth/login    | Iniciar sesión          | No   |
| GET    | /api/health        | Health check            | No   |
| POST   | /api/notes         | Crear nota              | Sí   |
| GET    | /api/notes         | Listar notas (paginado) | Sí   |
| GET    | /api/notes/:id     | Obtener nota            | Sí   |
| PUT    | /api/notes/:id     | Actualizar nota         | Sí   |
| DELETE | /api/notes/:id     | Eliminar nota           | Sí   |

## Ramas por sitio

Este template está diseñado para usar **una rama principal por sitio/proyecto**. La rama puede tener
cualquier nombre y se declara en `sentinel.config.json` como `project.primaryBranch`; no se debe asumir
que sea `main`. En este checkout el proyecto es `wandorius`, por eso la rama operativa es `wandorius`;
`main` contiene únicamente el template vacío.

```json
{
  "project": {
    "primaryBranch": "wandorius"
  }
}
```

Las tareas paralelas usan ramas `task/<project-identity>/<id>` y worktrees aislados dentro de
`<repo>/.sentinel/worktrees/`; nunca salen de `glory-rust-template` ni de la raíz del repositorio
consumidor. Resuelven sus conflictos contra la rama principal declarada y, antes de cerrarse, integran
obligatoriamente en esa rama. Después eliminan el worktree, la rama de tarea y la metadata de coordinación
que vive en `<repo>/.sentinel/coordination/`.

```bash
git switch wandorius
# Desarrollar en la rama del sitio
# Cambiar a otro sitio:
git switch otro-sitio
```

La estructura es idéntica en cada rama. Solo cambia el contenido específico del sitio.

## Calidad y comandos de desarrollo

El comando público de validación es el gate único. Decide el alcance por los
archivos modificados, conserva los resultados por rama y escribe el detalle en
`.quality-reports/branches/<branch-key>/<task-id>/`.

```bash
# Gate local incremental canónico; el ID debe existir en roadmap/planes/completados
npm run gate:check -- 028A-6

# Gate completo para cierre de fase o CI (no repetir durante el cooldown)
npm run gate:check -- 028A-6 --full
npm run gate:check -- 028A-6 --ci

# Compatibilidad temporal del adapter (capa B); no es la autoridad de decisión
npm run task:check -- 028A-6

# Contratos y diagnóstico del stack de calidad
npm run quality:test
npm run quality:doctor
npm run quality:lock -- --check
npm run quality:reports:cleanup:dry
```

`sentinel.lock.json` fija las versiones, commits, capacidades, protocolos y
hashes de los analizadores. El gate canónico `gate:check` genera el manifest declarativo y delega la decisión
en `sentinel check`; `task:check` queda como alias de compatibilidad temporal. El gate consume los checkouts
internos fijados en `quality-tools.json` mediante sus `sourcePath` relativos. Sentinel está fijado al commit
coordinador publicado en `origin/main` (release `0.7.4`, tag `v0.7.4` en `0349485c121784513c7ecef8a8de1535e841a5ae`). VarSense está fijado a la release `2.2.1` (`88f281f94e6febd02a386b7ed03d30d285eb82e1`); `sentinel.lock.json` repite esos commits y hashes. Las releases anteriores quedan disponibles como rollback. `quality:setup`
puede inicializar los submódulos y compilar sus CLIs en un clon limpio; cuando falta un CLI,
`npm ci` y la suite de la herramienta se ejecutan en un staging temporal fuera del checkout
Git y solo se copian artefactos generados/ignorados (`node_modules`/`out`) al submódulo. Si el
checkout contiene `package-lock.json` o archivos internos modificados, el doctor falla cerrado;
no se deben instalar dependencias manualmente dentro del submódulo versionado. No se requieren
rutas absolutas ni variables `GLORY_*_SOURCE_PATH` para este consumidor.
`quality:lock --check` verifica que configuración, gitlink y lock coincidan, y rechaza un sourcePath interno sin gitlink o con gitlink divergente. `quality:setup` deja evidencia local de compile + suite en staging ligada al commit; esa evidencia no convierte por sí sola un commit local en release estable. Si el
commit fijado de un submódulo no está disponible en el remoto configurado, el clon
debe corregir primero el remoto/fork o publicar ese objeto; no se sustituye por un
checkout local distinto ni se continúa con una copia modificada.

`npm run quality:doctor` delega al doctor del CLI fijado y muestra el readiness real del proyecto
(`ready`, `readyForAnalyze`, `readyForGate`, lock, gitlinks, capabilities y release evidence). Los modos
`npm run quality:doctor -- --migrate --dry-run` y `npm run quality:doctor -- --lock` siguen siendo
diagnósticos de compatibilidad del consumidor; no sustituyen al doctor canónico.

El runtime del gate se mantiene como `project-adapter` y
`artifactSha256: null`; el análisis se ejecuta desde el submódulo fijado y no
se ejecuta código arbitrario desde la política del proyecto. El runtime global
coordinado se instala aparte desde un artefacto publicado y verificable.

Los wrappers de desarrollo (`npm run check:back`, `npm run check:front`,
`npm run fmt:check` y `npm test`) siguen disponibles para trabajo específico,
pero no sustituyen el reporte ni el control del gate. Para una validación que
pueda cerrar una tarea, usa `gate:check` desde la raíz del repositorio. `task:check`
se conserva como compatibilidad temporal. Los
scripts de `scripts/quality` no son una API para copiar: los adapters de este
proyecto solo transportan stages y adapters específicos de este consumidor; las capacidades universales y
la decisión de cierre viven en Sentinel Core.

### Bootstrap y migración de proyectos

Un proyecto nuevo debe usar el binario fijado de Sentinel 0.7.4 o una release posterior que exponga las
capacidades requeridas:

```bash
sentinel --help
sentinel init --preset mixed --project-root . --primary-branch <rama-real>
sentinel doctor --json --workspace .
npm run gate:check -- BOOTSTRAP-01
```

`init` es idempotente y no copia `scripts/quality`. Para un proyecto antiguo, ejecutar primero
`sentinel migrate --project-root . --json` solo si `sentinel --help` ofrece ese comando; de lo contrario,
seguir el inventario read-only de `quality-gate-setup`. Clasificar cada regla como Core, plugin,
configuración, adapter específico, test, duplicado u origen desconocido antes de borrar o mover cualquier
carpeta. Un origen desconocido bloquea la migración.

La instalación global activa puede ser anterior al pin del consumidor. Si `sentinel --help` no muestra
`init`, `migrate`, `check` o `task`, no se debe interpretar `doctor` como gate listo: actualizar el runtime
desde un artefacto publicado, regenerar shims y repetir `--version`, `--help` y `doctor --json`.

### Desarrollo

```bash
npm run dev                  # Backend + contexto de desarrollo por rama
npm run dev:front            # Frontend con HMR
npm run codegen              # Regenerar cliente API desde OpenAPI
cd frontend && npm run build # Build frontend explícito
```

## Clippy nivel paranoia

El proyecto tiene configurado clippy en modo estricto (`[lints.clippy]` en Cargo.toml):

- `clippy::all` → **deny** (error en cualquier warning estándar)
- `clippy::pedantic` → **warn** (warnings extra para código idiomático)

Antes de cerrar una tarea: `npm run gate:check -- <ID>`; para una fase o publicación, repetir con `--full` o `--ci`. El gate deriva la base de datos/contexto por rama cuando una etapa Rust lo necesita.
