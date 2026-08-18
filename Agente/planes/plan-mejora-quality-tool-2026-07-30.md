# Plan: Mejora de calidad automática — Sentinel y VarSense

> **Epic:** 297A-11
> **Fecha:** 2026-07-30
> **Estado:** ✅ Lote VarSense reproducible implementado; deuda Sentinel documentada y diferida por decisión de alcance (018A-43)
> **Auditoría fuente:** `auditoria-arquitectura-v4-2026-07-30.md`
> **Objetivo:** Convertir el quality gate en un guardián arquitectónico con cobertura medible y creciente sobre los patrones problemáticos identificados en 4 auditorías; la cobertura se reporta por versión y alcance, no como una cifra fija global.

> **Nota operativa:** este documento conserva el inventario histórico y sus checklists técnicos, pero ya no es un bloque habilitado. El mínimo desbloqueante vive en `roadmap-sentinel.md`; ningún agente debe comenzar una regla nueva, benchmark, empaquetado o migración upstream desde este plan sin una tarea explícita.

---

## 0. Estado actual (actualizado 2026-07-30)

| Capa | Reglas | Cobertura |
|---|---|---|
| Sentinel CLI (v0.4.0) | 7 built-in | Seguridad + sintaxis |
| Sentinel config | 7 reglas (excluye dom.ts, frontend dir) | innerhtml, catch-vacio, hardcoded-secret |
| **Custom scripts (standalone)** | **13 reglas P0/P1/P2** | **Arquitectura profunda** |
| VarSense | 4 detectores + extractor vanilla ampliado | CSS tokens + clases |
| **Total** | **24 reglas activas** | **~65% de hallazgos detectables** |

**Implementadas como scripts standalone (check-sentinel-extended.sh):**
- P0: archivo-max-lineas
- P1: any-type-prohibido, export-default-prohibido, console-log-produccion, subscribe-sin-cleanup, api-call-en-logica, import-store-directo, store-mutation-in-view
- P2: interface-grande, catch-silencioso, modulo-rexport-mutations, export-no-usado
- Custom: DOM abstraction check, singleton-state check, window-refs check

**Pendientes (requieren AST o CLI update):** stale-closure-read, tipo-duplicado, keybinding-duplicado, app-registry-side-effects, modulo-responsabilidades, css-layer-faltante, css-vars-para-posicion, calse-css-sin-token, innerhtml-variable (mejora), barras-decorativas (mejora)

---

**Diagnóstico original de Sentinel (7 reglas):**

| Regla | Tipo | Severidad | Efectividad |
|---|---|---|---|
| barras-decorativas | Regex línea | warning | 🟢 Buena |
| catch-vacio | Regex bloque | error | 🟢 Buena |
| hardcoded-secret | Regex línea | error | 🟢 Buena |
| innerhtml-variable | Regex línea | error | 🟡 Demasiado genérica |
| unwrap-produccion-rs | Regex línea | error | 🟢 Buena (Rust) |
| panic-produccion-rs | Regex línea | error | 🟢 Buena (Rust) |
| git-add-all | Regex línea | error | 🟢 Buena |
| css-especificacion-diseno-local | Regex línea | information | 🟡 Falsos positivos |

**Estado actual de VarSense (4 detectores):**

| Detector | Tipo | Severidad | Efectividad |
|---|---|---|---|
| variableNoDefinida | AST CSS | error | 🟢 Buena |
| hardcoded CSS | Regex | warning | 🟢 Buena |
| inline CSS | Regex | information | 🟢 Buena |
| orphanClass | AST + grep + atributos `className`/`class` en TS/JS | information | 🟢 Buena |

**Corrección 2026-07-31:** el indexador de clases de VarSense reconoce contratos vanilla estáticos usados por el frontend: `createEl({ className/class })`, `createContainer()`, `createExternalLink()`, `classList.add()`, declaraciones `className/contentClass`, templates/ternarios con literales estáticos y multilinea. Ignora comentarios, cadenas no ejecutables, interpolaciones dinámicas e identificadores arbitrarios; las clases realmente huérfanas siguen reportándose. El patch reproducible está en `scripts/quality/patches/varsense-class-index.patch`, fijado por SHA-256 `a93b8bf0640d52684268f7ed3c00a9598b13fcb7d7936802948b88fa231fe4bf` en `quality-tools.json`. `npm run quality:setup` valida hash, commit, diff exacto, compila y ejecuta los **43 tests** de VarSense de forma idempotente.

**Anomalía:** Sentinel detecta errores de seguridad y sintaxis, pero **nada de arquitectura**. Cero reglas sobre: tamaño de archivos, responsabilidades, cleanup, imports, tipos duplicados, etc.

---

## 0.1 Estado verificable del lote 2026-07-31

- VarSense: **0 errores, 1 aviso informativo no bloqueante** en `npm run task:check -- 297A-12 --fresh`; las informaciones continúan visibles en el reporte.
- Sentinel: **0 errores, 75 warnings** heredados; predominan `sqlx-query(-as)-sin-macro` y dos avisos de directorios sobre el límite. No se suprimen aquí: requieren migración SQLx o una decisión explícita en el núcleo de Sentinel.
- Setup: `quality-tools.json` fija `varsense` en commit `b299040d2daa4b4dd3c3aeb4cca7dd5998b29901`, patch hashado y `testScript: test`; la instalación falla ante hash, commit o diff divergentes.
- Validación: **43/43 tests VarSense**, **160/160 tests frontend en 12 suites**, TypeScript sin errores, `task:check` y `self-check` PASS.

## 1. Nuevas reglas Sentinel (17 reglas)

### 1.1 🔴 P0 — `export-no-usado`

**Qué detecta:** Funciones/variables exportadas que no son importadas por ningún otro archivo.

**Por qué:** `desktop-concept.ts` (160 líneas) existió por semanas sin que nadie notara que era código muerto. `desktop-taskbar.ts` igual.

**Detección:**
```regex
# Archivo A: export function foo
^export (function|const|let|class) (\w+)

# Archivo B: import { foo }
import \{[^}]*\b\2\b[^}]*\}
```

Si `export function foo` existe pero ningún otro archivo tiene `import { foo }`, warning.

**Config:**
```json
"export-no-usado": {
  "severidad": "warning",
  "excludePatterns": ["**/index.ts", "**/lib.rs", "**/mod.rs"]
}
```

**Falsos positivos:** Barrel exports (`index.ts`, `mod.rs`). Por eso se excluyen.

**Esfuerzo:** 1h — recorrer exports, buscar imports inversos.

---

### 1.2 🔴 P0 — `subscribe-sin-cleanup`

**Qué detecta:** Llamadas a `.subscribe()` cuyo resultado (función unsubscribe) no se almacena ni se invoca en un cleanup.

**Por qué:** `finder-preview.ts`, `sidebar.ts`, y otros componentes se suscriben a stores pero nunca llaman al unsubscribe retornado. Si el componente se monta/desmonta repetidamente, los listeners se acumulan y causan memory leaks + renders fantasmas.

**Detección:**
```regex
# Buscar .subscribe() sin asignación
(?<!\w+\s*=\s*)\.subscribe\(
```

Si encuentra `.subscribe(` y la línea no tiene `const\s+\w+\s*=` o `this\.\w+\s*=` antes, warning.

**Excepción:** `store.subscribe(() => { ... })` en el módulo raíz (stores.ts, main.ts) no necesita cleanup porque viven toda la sesión.

**Config:**
```json
"subscribe-sin-cleanup": {
  "severidad": "error",
  "excludePatterns": ["**/stores.ts", "**/main.ts"]
}
```

**Falsos positivos:** Subscriptions globales que deben vivir toda la sesión. Se excluyen los archivos conocidos.

**Esfuerzo:** 30 min — regex de patrón de asignación + excepciones.

---

### 1.3 🟡 P1 — `archivo-max-lineas`

**Qué detecta:** Archivos que exceden el límite de 300 líneas (estándar del proyecto, AGENTS.md §8).

**Por qué:** Las 3 auditorías encontraron archivos de 725, 430, 419, 314, 304 líneas. Esto debería ser detectado automáticamente, no en auditorías manuales.

**Detección:** Contar líneas del archivo. Si > 300, error.

**Config:**
```json
"archivo-max-lineas": {
  "severidad": "warning",
  "maxLineas": 300,
  "excludePatterns": ["**/package.json", "**/Cargo.toml", "**/*.json", "**/*.sql"]
}
```

**Esfuerzo:** 10 min — `wc -l` + comparación.

---

### 1.4 🟡 P1 — `modulo-responsabilidades`

**Qué detecta:** Funciones exportadas que hacen más de 2 tipos de operaciones distintas (creación DOM + subscribe + API calls + re-exports).

**Por qué:** `desktop-shell.ts` (3 responsabilidades), `window-manager.ts` (lógica + re-exports).

**Detección:** Dentro de una función exportada, contar:
- `document.createElement` o `.className =` → DOM
- `.subscribe(` o `addEventListener(` → eventos
- `api.get(` o `api.post(` → API
- `export {.*} from` → re-export

Si 3+ categorías en la misma función, warning.

**Config:**
```json
"modulo-responsabilidades": {
  "severidad": "warning"
}
```

**Falsos positivos:** Funciones de setup que legítimamente hacen varias cosas. Se mitiga con severity warning, no error.

**Esfuerzo:** 2h — requiere análisis semántico básico (categorizar líneas).

---

### 1.5 🟡 P1 — `tipo-duplicado`

**Qué detecta:** Interfaces o types idénticos definidos en archivos distintos.

**Por qué:** `WorkspaceResourceKind` y `ResourceKind` son idénticos pero están definidos en `types.ts` y `resource-type-registry.ts`.

**Detección:** Para cada `type X = 'a' | 'b' | 'c'`, generar el set de valores. Si dos archivos tienen el mismo type con exactamente los mismos valores, warning.

**Config:**
```json
"tipo-duplicado": {
  "severidad": "warning"
}
```

**Falsos positivos:** Tipos que coinciden por casualidad (ej: `type Status = 'active' | 'inactive'`). Poco probable pero posible.

**Esfuerzo:** 2h — parsear definiciones de type, comparar sets.

---

### 1.6 🟡 P1 — `api-call-en-logica`

**Qué detecta:** Llamadas a `api.get()`/`api.post()` fuera del módulo `api/client.ts` o de servicios dedicados.

**Por qué:** `publishWorkspace()` en `workspace-store.ts` llama directamente a `api.post()`. La lógica de publicación no debería conocer el transporte HTTP.

**Detección:** `api\.(get|post|put|delete)\(` en archivos que no están en `api/`.

**Config:**
```json
"api-call-en-logica": {
  "severidad": "warning",
  "excludePatterns": ["**/api/client.ts", "**/api/*.ts"]
}
```

**Esfuerzo:** 10 min — regex simple.

---

### 1.7 🟡 P1 — `import-store-directo`

**Qué detecta:** Imports de `stores.ts` o `store.ts` desde módulos de lógica de negocio (mutaciones, services, commands).

**Por qué:** `overlay-mutations.ts` importa `overlayStore`, `workspaceStore`, etc. directamente desde `./stores`. Esto acopla las mutaciones a la implementación concreta del store.

**Detección:**
```regex
import.*from.*['"].*stores?\.ts['"]
```

En archivos que no son el store mismo ni el barrel index.

**Config:**
```json
"import-store-directo": {
  "severidad": "warning",
  "excludePatterns": ["**/stores.ts", "**/index.ts"]
}
```

**Esfuerzo:** 10 min — regex simple.

---

### 1.8 🔵 P2 (post-MVP) — `stale-closure-read`

**Qué detecta:** Lecturas de store (`store.get()`) que ocurren FUERA de un event listener, cuando la misma función también define event listeners.

Cuando una función captura `store.get()` en su scope y luego define `addEventListener`, los handlers dentro del listener no verán cambios del store.

**Detección:**
```regex
# Buscar patrones como:
const x = store.get();   # ← lectura fuera
element.addEventListener('click', () => {
  # usar x aquí es stale
});
```

Si una función tiene `const.*=.*store\.get()` seguido de `addEventListener` sin otra `store.get()` dentro del listener, warning.

**Config:**
```json
"stale-closure-read": {
  "severidad": "error"
}
```

**Falsos positivos:** Si la intención es capturar el valor en el momento de creación (deliberadamente stale). Es raro pero posible.

**Esfuerzo:** 3h — requiere análisis de ámbito (scope analysis), no solo regex.

**Nota:** Esta regla requiere análisis de ámbito (scope analysis) que Sentinel basado en regex no puede implementar correctamente. Se pospone a post-MVP cuando Sentinel pueda usar AST. Mientras tanto, se recomienda code review humano para este patrón.

---

### 1.9 🟡 P1 — `interface-grande`

**Qué detecta:** Interfaces con más de 10 campos.

**Por qué:** `FontConfig` tiene 22 campos. Una interfaz con tantos campos probablemente viola ISP y debería dividirse en sub-interfaces.

**Detección:** Contar campos en `interface X { ... }`.

```regex
# Encontrar interfaces
interface (\w+) \{
# Contar lines con ; o , dentro
```

**Config:**
```json
"interface-grande": {
  "severidad": "warning",
  "maxCampos": 10
}
```

**Falsos positivos:** Interfaces de configuración que naturalmente tienen muchos campos (ej: `ViteConfig`). Severity warning permite ignorar si es intencional.

**Esfuerzo:** 30 min — contar fields en bloques `interface {}`.

---

### 1.10 🔵 P2 — `keybinding-duplicado`

**Qué detecta:** Dos comandos registrados con la misma combinación de teclas.

**Por qué:** Con 30+ comandos registrados, es fácil que dos comandos usen `Ctrl+S` sin que nadie lo note.

**Detección:** Extraer `keys:` de todos los `CommandRegistry.register(...)` y detectar valores duplicados.

**Config:**
```json
"keybinding-duplicado": {
  "severidad": "warning"
}
```

**Falsos positivos:** Si dos comandos comparten deliberadamente el mismo atajo pero se ejecutan en contextos distintos (ej: `Ctrl+S` en editor vs `Ctrl+S` en Finder). Raro pero posible.

**Esfuerzo:** 1h — parsear registros de comandos, extraer keys, detectar duplicados.

---

### 1.11 🔵 P2 — `modulo-rexport-mutations`

**Qué detecta:** Archivos que mezclan `export function` (lógica activa) con `export { X } from '...'` (re-exports).

**Por qué:** `window-manager.ts` re-exporta símbolos de `window-store.ts` mientras define sus propias funciones. Esto es un code smell de SRP: el archivo debería O re-exportar O definir lógica, no ambas.

**Detección:** Si un archivo tiene ambas:
- `export function` o `export const` (define lógica)
- `export {.*} from` (re-exporta)

Warning.

**Config:**
```json
"modulo-rexport-mutations": {
  "severidad": "information"
}
```

**Esfuerzo:** 10 min — dos regex en el mismo archivo.

---

### 1.12 🔵 P2 — `app-registry-side-effects`

**Qué detecta:** `AppRegistry.register({ render: ... })` que contiene `dispatchEvent`, `api.`, o efectos secundarios dentro del render.

**Por qué:** El `render` debería ser una función pura que devuelve DOM. `dispatchEvent` en el render mezcla responsabilidades (creación + notificación).

**Detección:** Dentro de `register({ ... render: (ctx) => { ... } })`, detectar `dispatchEvent(` o `api.` anidado.

**Config:**
```json
"app-registry-side-effects": {
  "severidad": "information"
}
```

**Esfuerzo:** 1h — requiere detectar contexto de register + render anidado.

---

### 1.13 🟡 P1 — `store-mutation-in-view`

**Qué detecta:** Módulos de vista/página (pages/, features/*/components/) que mutan stores directamente (`store.set()`, `store.update()`).

**Por qué:** `article.ts` hace `showProfile.set(false)`, `settings-repo.ts` hace `fontStore.set(config)`. Las vistas no deberían mutar stores directamente — deberían delegar en servicios o commands. Esto viola el flujo unidireccional (Unidirectional Data Flow).

**Detección:** En archivos dentro de `pages/` o `features/*/components/`, buscar patrones:
```regex
\w+Store\.set\(|\w+Store\.update\(|\w+\.set\([^)]
```

**Excepciones:** `stores.ts`, `store.ts`, hooks/effects que responden a eventos del OS (teclado, resize) pueden mutar stores legítimamente.

**Config:**
```json
"store-mutation-in-view": {
  "severidad": "warning",
  "excludePatterns": ["**/stores.ts", "**/store.ts", "**/runtime/**", "**/hooks/**"]
}
```

**Esfuerzo:** 30 min — regex de patrón + exclusión de archivos runtime.

---

### 1.14 🟡 P1 — `catch-silencioso`

**Qué detecta:** Bloques `catch` que solo contienen comentarios o ignoran el error explícitamente (`catch { /* ignorar */ }`, `catch { /* noop */ }`).

**Por qué:** La regla `catch-vacio` solo detecta `catch {}` literal (sin nada dentro). Pero `catch { /* ignorar */ }` es igual de peligroso y aparece en `admin.ts:32`, `article.ts:194`, etc. Un catch que no registra, notifica ni propaga el error oculta fallos.

**Detección:**
```regex
catch\s*\{[^}]*ignorar[^}]*\}|catch\s*\{[^}]*noop[^}]*\}|catch\s*\{\s*\/\*\s*\}
```

También detectar catch con solo comentarios:
```regex
catch\s*\([^)]*\)\s*\{[\s\n]*\/\/[^}]*\}
```

**Config:**
```json
"catch-silencioso": {
  "severidad": "error"
}
```

**Falsos positivos:** Catch intencionalmente silencioso cuando el error no es manejable (ej: analytics tracking). Poco común.

**Esfuerzo:** 30 min — ampliar regex de catch-vacio.

---

### 1.15 🔵 P2 — `console-log-produccion`

**Qué detecta:** `console.log()`, `console.error()`, `console.warn()` en archivos que no son de scripting/CLI.

**Por qué:** La auditoría v4 encontró `console.error('Error guardando settings:', err)` en `settings-repo.ts`. En producción, los errores deberían mostrarse al usuario via `showToast()` o registrarse via servicio de logging, no en la consola del desarrollador.

**Detección:**
```regex
console\.(log|error|warn|debug)\(
```

**Config:**
```json
"console-log-produccion": {
  "severidad": "warning",
  "excludePatterns": ["**/scripts/**", "**/*.mjs", "**/vite.config.ts", "**/dev.mjs"]
}
```

**Falsos positivos:** Scripts de build/dev que legítimamente usan console para output.

**Esfuerzo:** 10 min — regex simple.

---

### 1.16 🔵 P2 — `export-default-prohibido`

**Qué detecta:** Exportaciones default (`export default function`, `export default class`, `export default {`).

**Por qué:** AGENTS.md §8 especifica: "TypeScript: camelCase/PascalCase" y la convención del proyecto es usar named exports siempre. Default exports dificultan refactors y tree-shaking.

**Detección:**
```regex
^export default 
```

**Config:**
```json
"export-default-prohibido": {
  "severidad": "error"
}
```

**Falsos positivos:** Ninguno — named exports son siempre preferibles.

**Esfuerzo:** 10 min — regex simple.

---

### 1.17 🔵 P2 — `any-type-prohibido`

**Qué detecta:** `as any`, `@ts-ignore`, `@ts-expect-error`, `: any` (type annotation).

**Por qué:** El tipado estricto es pilar del proyecto. `(data: any)` apareció en `desktop-menu-bar.ts`, `@ts-ignore` y `@ts-expect-error` en varias migraciones. Cada uso de `any` desactiva el type checker y permite bugs silenciosos.

**Detección:**
```regex
as any\b|@ts-ignore|@ts-expect-error|: any\b|\.any\(
```

**Config:**
```json
"any-type-prohibido": {
  "severidad": "error"
}
```

**Falsos positivos:** `Promise.any()`, `Array.any()` — se excluyen con `\.any\(` en el regex.

**Esfuerzo:** 10 min — regex con exclusión de método .any().

---

## 2. Nuevas reglas VarSense (3 reglas)

### 2.1 🔵 P2 — `css-layer-faltante`

**Qué detecta:** Archivos CSS que no declaran `@layer` al inicio.

**Por qué:** La auditoría v3 encontró que los CSS legacy (`components.css`, `pages.css`, `layout.css`) estaban sin `@layer`, lo que les daba la máxima specificity por defecto.

**Detección:** Para cada archivo `.css`, verificar que comience con `@layer` o que esté precedido por un comentario de capa.

**Config:**
```json
"css-layer-faltante": {
  "severidad": "warning"
}
```

**Falsos positivos:** CSS que deliberadamente debe ser unlayered para ganar specificity (ej: overrides de emergencia). Se mitiga con severity warning.

**Esfuerzo:** 30 min — verificar primera línea de cada .css.

---

### 2.2 🔵 P2 — `css-vars-para-posicion`

**Qué detecta:** Archivos CSS de componentes que usan `el.style.left/top/width/height` en JS para posicionamiento, cuando deberían usar CSS custom properties.

**Por qué:** La auditoría v2 encontró que las ventanas se posicionan con estilos inline (`el.style.left = \`${x}px\``) en vez de CSS variables (`el.style.setProperty('--win-x', x)`). Las variables CSS permiten que los estilos se apliquen correctamente incluso con ResizeObserver y media queries.

**Detección:** `\.style\.(left|top|width|height) =` en archivos `.ts`.

**Config:**
```json
"css-vars-para-posicion": {
  "severidad": "warning"
}
```

**Esfuerzo:** 10 min — regex simple.

---

### 2.3 🔵 P2 — `calse-css-sin-token`

**Qué detecta:** Clases CSS que hardcodean valores de color/font/borde en vez de usar variables del sistema (`var(--sistema-*)`).

**Por qué:** El manual de identidad visual exige que todo el chrome del OS use tokens de `variables.css`. Clases que hardcodean `color: #000` en vez de `color: var(--sistema-texto)` son inconsistentes.

**Detección:** En archivos `.css`, detectar propiedades que deberían usar var() pero tienen valores literales:
- `color: #` (excepto en contenido multimedia)
- `font-family:` sin `var(--`
- `border: 1px solid #` (excepto `var(--borde)`)

**Config:**
```json
"calse-css-sin-token": {
  "severidad": "warning",
  "excludePatterns": ["**/pages.css", "**/components.css"]
}
```

**Falsos positivos:** CSS de contenido multimedia (artículos, galería) que usa colores para diferenciar contenido. Se excluye legacy CSS.

**Esfuerzo:** 30 min — regex de propiedades sin var().

---

## 3. Mejoras a reglas existentes

### 3.1 `innerhtml-variable` — Refinar para ignorar strings literales seguros

**Problema actual:** La regla marca TODO `innerHTML` como error, incluso cuando el valor es un string literal seguro:
```typescript
container.innerHTML = '<p class="cargando">cargando...</p>';  // Falso positivo
```

**Mejora:** Ignorar `innerHTML` cuando el valor asignado es un string literal (entre comillas simples o dobles, sin variables concatenadas). Solo marcar cuando hay interpolación de variables:
```typescript
container.innerHTML = data.userContent;  // ✅ Esto sí es peligroso
container.innerHTML = '<p>' + name + '</p>';  // ✅ Esto sí
```

**Config:**
```json
"innerhtml-variable": {
  "severidad": "error",
  "ignorarLiterales": true  // Nueva opción
}
```

**Esfuerzo:** 30 min — distinguir string literal vs variable en la asignación.

---

### 3.2 `barras-decorativas` — Extender a detectar bloques de comentarios decorativos

**Problema actual:** Solo detecta líneas de `---` o `===`. No detecta bloques de comentarios como:
```typescript
/* === Store === */
/* === Recompute con debounce === */
```

Estos son patrones válidos de organización, pero si hay más de 10 en un archivo, es síntoma de que debería dividirse.

**Mejora:** Contar bloques de comentarios decorativos (`/* ===...=== */` o `// ---`) por archivo. Si hay más de 5, warning de "demasiadas secciones — considerar dividir archivo".

**Esfuerzo:** 30 min — contar bloques decorativos.

---

## 4. Tabla resumen de todas las reglas propuestas

### Sentinel (17 nuevas + 2 mejoradas)

| # | Regla | Severidad | Esfuerzo | Preventivo de |
|---|---|---|---|---|
| 1 | `export-no-usado` | warning | 1h | Código muerto (v2 #1, #25) |
| 2 | `subscribe-sin-cleanup` | error | 30 min | Memory leaks (v4 #6.3) |
| 3 | `archivo-max-lineas` | warning | 10 min | Archivos >300 líneas (v1 #2) |
| 4 | `modulo-responsabilidades` | warning | 2h | Violaciones SRP (v4 #1) |
| 5 | `tipo-duplicado` | warning | 2h | Types duplicados (v2 #8) |
| 6 | `api-call-en-logica` | warning | 10 min | Lógica + HTTP acoplados (v4 #4.2) |
| 7 | `import-store-directo` | warning | 10 min | DIP violations (v4 #4.1) |
| 8 | `stale-closure-read` | error (post-MVP) | 3h | Stale data en eventos (v4 #4.3) |
| 9 | `interface-grande` | warning | 30 min | ISP violations (v4 #3.1) |
| 10 | `keybinding-duplicado` | warning | 1h | Atajos de teclado conflictivos |
| 11 | `modulo-rexport-mutations` | info | 10 min | SRP violations (v4 #1.2) |
| 12 | `app-registry-side-effects` | info | 1h | Render impuro (v4 #1.3) |
| **13** | **`store-mutation-in-view`** | **warning** | **30 min** | **UDF violations (v4 §2.1)** |
| **14** | **`catch-silencioso`** | **error** | **30 min** | **Catch que oculta errores (v1-4)** |
| **15** | **`console-log-produccion`** | **warning** | **10 min** | **Console en producción (v4 §6.2)** |
| **16** | **`export-default-prohibido`** | **error** | **10 min** | **Default exports (AGENTS.md §8)** |
| **17** | **`any-type-prohibido`** | **error** | **10 min** | **Tipado inseguro (v4 §5.2)** |
| 18 | `innerhtml-variable` (mejora) | error | 30 min | Falsos positivos (v3 #2.1) |
| 19 | `barras-decorativas` (mejora) | warning | 30 min | Archivos con demasiadas secciones |

### VarSense (3 nuevas + 1 mejora)

| # | Regla | Severidad | Esfuerzo | Preventivo de |
|---|---|---|---|---|
| 1 | `css-layer-faltante` | warning | 30 min | Specificity caótica (v3 #2.4) |
| 2 | `css-vars-para-posicion` | warning | 10 min | Inline styles bypass CSS (v2 #30) |
| 3 | `calse-css-sin-token` | warning | 30 min | Inconsistencias visuales (v2 #17) |

---

## 5. Prioridad de implementación

### Sprint 1 (reglas P0 — 30 min total)
1. `export-no-usado` — detecta código muerto inmediato
2. `subscribe-sin-cleanup` — previene memory leaks
3. `archivo-max-lineas` — evita que vuelvan a crecer archivos gigantes

### Sprint 2 (reglas P1 — 6h total)
4. `api-call-en-logica` — 10 min
5. `import-store-directo` — 10 min
6. `interface-grande` — 30 min
7. `store-mutation-in-view` — **30 min (nueva)**
8. `catch-silencioso` — **30 min (nueva)**
9. `innerhtml-variable` (mejora) — 30 min
10. `css-layer-faltante` — 30 min
11. `css-vars-para-posicion` — 10 min
12. `keybinding-duplicado` — 1h
13. `modulo-responsabilidades` — 2h

### Sprint 3 (reglas P2 — 4h 40min + 3h post-MVP)
14. `console-log-produccion` — **10 min (nueva)**
15. `export-default-prohibido` — **10 min (nueva)**
16. `any-type-prohibido` — **10 min (nueva)**
17. `tipo-duplicado` — 2h
18. `modulo-rexport-mutations` — 10 min
19. `app-registry-side-effects` — 1h
20. `calse-css-sin-token` — 30 min
21. `barras-decorativas` (mejora) — 30 min
22. `stale-closure-read` — 3h (post-MVP, requiere AST)

**Total: ~17h de implementación** para 22 mejoras (17 Sentinel + 3 VarSense + 2 mejoras).

---

## 6. Cobertura esperada tras implementación

| Categoría | Antes | Después |
|---|---|---|
| Reglas Sentinel | 7 | **22 (+15)** |
| Detectores VarSense | 4 | **7 (+3)** |
| Hallazgos detectables automáticamente (proyección tras implementar todas las reglas propuestas) | 25 (38%) | **53 (80%)** |
| Hallazgos no detectables sin AST | 11 (17%) | **10 (15%)** |
| Hallazgos ya corregidos | 6 (9%) | 6 (9%) |

**Proyección, no estado actual:** si se implementan todas las reglas propuestas, la cobertura del inventario de ese plan subiría de 38% a 80%. El estado operativo actual es el ~65% indicado en §0; la auditoría v4 usa otro inventario y reporta 57/78 (73%). Solo 15% de los hallazgos del inventario del plan requerirían análisis AST/profiling que no justifica implementar. Las 5 reglas añadidas en la revisión (store-mutation-in-view, catch-silencioso, console-log-produccion, export-default-prohibido, any-type-prohibido) capturan 4 hallazgos adicionales que antes no eran detectables.

---

## 7. Windows compatibility

> **Problema:** El CLI de Sentinel está diseñado para entornos Unix/Linux con `grep`, `wc`, `find`, etc. En Windows (Git Bash/MSYS2) estos comandos existen pero tienen comportamientos ligeramente distintos. Reglas como `export-no-usado` (grep inverso de imports) y `archivo-max-lineas` (`wc -l`) necesitan adaptación.

### Reglas afectadas

| Regla | Comando Unix | Equivalente Windows Git Bash | Riesgo |
|---|---|---|---|
| `export-no-usado` | `grep -r "import.*\\bFoo\\b"` | `grep -r "import.*Foo"` | `findstr` no soporta lookaheads; grep de Git Bash funciona pero es más lento |
| `archivo-max-lineas` | `wc -l < file` | `wc -l < file` | Funciona igual en Git Bash |
| `modulo-responsabilidades` | `grep -c "pattern"` | `grep -c "pattern"` | Funciona igual |
| `subscribe-sin-cleanup` | `grep -P` (Perl regex) | `grep -P` NO disponible en Git Bash por defecto | Usar `grep -E` (ERE) en vez de `-P` |

### Estrategia

1. **No usar `-P` (Perl regex)** en ninguna regla. Usar solo `-E` (ERE extendido) que funciona en GNU grep y Git Bash.
2. **No usar lookaheads/lookbehinds** (`(?=...)`, `(?<=...)`). No son ERE. Usar captura con grupo.
3. **Rutas con espacios:** Escapar rutas con comillas dobles. `sentinel.config.json` debe usar `"**/*.ts"` (glob) que el CLI resuelve, no rutas literales con espacios.
4. **Prohibido pipes de PowerShell** (`| Select-String`, `ForEach-Object`). Solo comandos POSIX.
5. **Test obligatorio en Windows CI** antes de dar una regla por implementada.

## 8. Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Falsos positivos en `export-no-usado` (barrel exports) | Alta | Excluir index.ts, mod.rs, lib.rs |
| Falsos positivos en `subscribe-sin-cleanup` (stores globales) | Media | Excluir stores.ts, main.ts |
| `modulo-responsabilidades` demasiado ruidoso | Media | Severity warning, revisar tras primera ejecución |
| `stale-closure-read` falso positivo por closures deliberadas | Baja | Usar severity error pero con ability to suppress |
| Reglas lentas (recorrer exports/imports) | Baja | Cache de resultados, ejecutar solo en diff |
| **Reglas nuevas (P1/P2) con Windows Git Bash** | **Media** | **No usar -P ni lookaheads; testear en Windows CI** |

---

## 9. Definition of Done

- [ ] 17 nuevas reglas Sentinel implementadas y probadas
- [ ] 2 reglas Sentinel existentes mejoradas
- [ ] 3 nuevas reglas VarSense implementadas y probadas
- [ ] `sentinel.config.json` actualizado con las nuevas reglas
- [ ] `varsense.config.json` actualizado con las nuevas reglas
- [ ] `npm run task:check -- 297A-11` pasa sin errores después de las reglas nuevas
- [ ] No hay falsos positivos en el código actual (baseline en cero)
- [ ] Documentación de cada regla en el repo de Sentinel/VarSense
- [ ] Verificar compatibilidad Windows (sin -P, sin lookaheads) en cada regla
- [ ] Test de integración en Windows CI antes de dar regla por implementada

---

## 10. Referencias

- Auditoría v4 (este análisis): `auditoria-arquitectura-v4-2026-07-30.md`
- Sentinel config: `sentinel.config.json`
- VarSense config: `varsense.config.json`
- Quality config: `quality.config.json`
- AGENTS.md §6: Flujo obligatorio por tarea
- AGENTS.md §7: Quality gate por tarea
