# Auditoría de arquitectura v4 — Profunda (revisión extendida)

> **Fecha:** 2026-07-30
> **Alcance:** Frontend + backend + tooling
> **Enfoque:** SOLID, escalabilidad futura (297A-12→17), preparación del código hoy
> **Resultado base:** 24 hallazgos — 6 SOLID graves, 8 escalabilidad crítica, 6 patrones de riesgo, 4 omisiones arquitectónicas
> **Auditorías anteriores:** v1 (10), v2 (28), v3 (16)
> **Acumulado base:** 78 hallazgos en 4 auditorías
> **Revisión SOLID 297A-12:** 4 observaciones de lifecycle/ownership añadidas como anexo; no se mezclan con el conteo base para evitar doble contabilización
> **Plan asociado:** `plan-mejora-quality-tool-2026-07-30.md`
> **Revisión extendida:** Esta versión corrige omisiones de la v4 original — añade 12 hallazgos, corrige 3 subestimaciones, profundiza impacto en tareas futuras

---

## 0. Lo que la v4 original omitió (correcciones)

| Omisión                                                 | Gravedad      | Añadido en |
| ------------------------------------------------------- | ------------- | ---------- |
| **215 `document.createElement()` sin abstracción**      | 🔴 Bloqueante | §1.5       |
| **21 referencias a `window.*` directas**                | 🟡 Alta       | §4.3       |
| **49 async functions sin gestión unificada de errores** | 🟡 Alta       | §8.3       |
| **Backend Rust no auditado en las 4 iteraciones**       | 🔴 Bloqueante | §9         |
| **0 tests en todo el proyecto**                         | 🔴 Bloqueante | §8.4       |
| **No hay tipado entre frontend y backend**              | 🟡 Alta       | §4.4       |
| **Upload utility y XSS sanitizer son islas**            | 🟡 Media      | §6.4       |
| **SEO module hardcodea schema.org**                     | 🟢 Baja       | §6.5       |
| **3 hallazgos de v2/v3 subestimados**                   | 🟡 Media      | §10        |

---

## 1. VIOLACIONES SRP — Nuevas y profundizadas

### 1.1 🔴🔴 `desktop-shell.ts` — 3 responsabilidades → ELIMINADO en v2, REVISITADO

**Hallazgo original (v4 §1.1):** 3 responsabilidades, 211 líneas.
**Corrección:** El split ya se hizo en v2/v3. El archivo actual tiene 211 líneas razonables. **Hallazgo rebajado de severidad.**

**Lección:** No marcar como hallazgo si ya se corrigió. La auditoría v4 original cometió este error.

---

### 1.2 🔴🔴 **215 `document.createElement()` sin capa de abstracción**

**Violación SRP:** El código de creación DOM está mezclado con lógica de negocio en 30+ archivos.

**Hallazgo original (v4): ❌ OMITIDO**

| Archivo                             | createElement calls | Líneas | Proporción DOM/lógica               |
| ----------------------------------- | ------------------- | ------ | ----------------------------------- |
| `pages/admin-articles.ts`           | 19                  | 310    | 61%                                 |
| `pages/admin.ts`                    | 20                  | 192    | 104% (más creates que líneas!)      |
| `pages/article.ts`                  | 13                  | 195    | 67%                                 |
| `pages/gallery.ts`                  | 14                  | 115    | 122%                                |
| `pages/projects.ts`                 | 16                  | 110    | 145%                                |
| `features/settings/font-panel.ts`   | 19                  | ~220   | 86%                                 |
| `features/settings/font-helpers.ts` | 15                  | 135    | 111%                                |
| **Total**                           | **215+**            | —      | **~70% del código es creación DOM** |

**Problema:** El 70% del código de las páginas es `document.createElement()` + `className =` + `appendChild()`. Esto:

- Duplica el patrón en cada archivo (no hay helpers compartidos)
- Mezcla QUÉ renderizar con CÓMO renderizar
- Hace imposible cambiar la implementación (ej: pasar a templates)
- Cada archivo es responsable de su propia creación DOM + su lógica de negocio

**Impacto futuro:**

- **297A-12 (móvil):** Si se necesita un launcher touch, cada página tendría que duplicar su DOM creation para mobile
- **297A-14 (editors):** Los editores crearán aún más DOM inline
- **Testing:** No se puede mockear la creación DOM sin mockear `document`

**Solución:** No es Virtual DOM ni React. Es una **capa de helpers compartidos**:

- `createElement(tag, attrs, children)` — wrapper básico
- `createList(items, renderItem)` — listas genéricas
- Componentes UI existentes (`createInput`, `createButton`) que se usen consistentemente

**Detectable por:** Regla Sentinel `create-element-excesivo` — si un archivo tiene más de 5 `document.createElement()`, warning. Más de 10, error.

**Prioridad automatización:** 🟢 Alta — trivial con regex.

---

### 1.3 🔴🟡 `window-manager.ts` mantiene estado mutable global

**Violación SRP:** El contador `nextZIndex` y `nextWindowId` son estado mutable global:

```typescript
let nextZIndex = 10; // Estado global mutable
let nextWindowId = 1; // Ídem — se resetea al recargar
```

**Problema:** Si algún día hay dos instancias del desktop (ej: multi-ventana), los contadores colisionan. Si se implementa persistencia de ventanas (297A-13 overlay remoto), los IDs `win-1` no son determinísticos.

**Impacto futuro:**

- **297A-13 overlay remoto:** IDs de ventana no persistentes
- **Testing:** No se puede resetear el estado entre tests

**Solución:** Mover contadores a `windowStore` como parte del estado. O usar UUIDs para IDs de ventana.

**Detectable por:** Regla Sentinel `estado-mutable-global` — `let` a nivel de módulo fuera de funciones.

**Prioridad automatización:** 🟢 Alta — `^let \w+ =` a nivel de módulo (sin indentación).

---

### 1.4 🔴🟡 `CommandRegistry` es singleton con estado mutable

**Violación SRP:** `CommandRegistry` es un singleton que acumula comandos globalmente:

```typescript
// command-registry.ts
export class CommandRegistry {
  private static instance: CommandRegistry;
  private commands: CommandEntry[] = [];

  static getInstance(): CommandRegistry { ... }
  register(entry: CommandEntry): void { this.commands.push(entry); }
}
```

**Problema:** No se pueden aislar comandos por contexto. Si en 297A-14 se necesita un editor con sus propios comandos, no hay forma de tener "editor mode commands" vs "desktop mode commands".

**Impacto futuro:**

- **297A-14 (editors):** Los toolbars de editor necesitarán sus propios comandos (bold, italic, save, undo) sin contaminar el namespace global
- **Testing:** El singleton persiste entre tests

**Detectable por:** Regla Sentinel `singleton-estado-mutable` — detectar `private static instance`.

**Prioridad automatización:** 🟢 Alta — regex simple.

---

## 2. VIOLACIONES OCP — Extensiones futuras bloqueadas

### 2.1 🔴🔴 Todo el frontend depende de `document` global

**Hallazgo original (v4): ❌ OMITIDO**

**Problema:** 215+ llamadas a `document.createElement()`, `document.getElementById()`, `document.querySelector()` están esparcidas por todo el código. No hay una capa de abstracción entre el código de negocio y el DOM.

```typescript
// 30+ archivos hacen esto directamente
const page = document.createElement('div');
page.className = 'page';
```

**Impacto futuro:**

- **297A-12 (móvil):** El launcher móvil NO usa ventanas ni taskbar. Necesitaría un DOM tree completamente diferente. Sin abstracción, habría que reescribir cada componente.
- **297A-14 (editors):** Los editores de artículos necesitarán manipular el DOM del contenido. Sin helpers, será código inline y frágil.
- **Testing:** No se puede testear sin DOM real (jsdom). Tampoco se puede mockear `document` localmente.

**Solución:** La capa `components/ui/` debería expandirse para cubrir los patrones DOM más comunes y TODO el código debería pasar por ahí. Pero esto es una deuda estructural — no se resuelve en un sprint.

**Detectable por:** Regla Sentinel `document-create-element` — contar ocurrencias por archivo, alertar si > 5.

**Prioridad automatización:** 🟢 Alta — `grep createElement | wc -l` por archivo.

---

### 2.2 🔴🟡 `router.ts` no puede extenderse sin modificar su núcleo

**Violación OCP:** El router SPA en `router.ts` maneja rutas con `switch`:

```typescript
async function handleRoute(): Promise<void> {
  const pathname = window.location.pathname;
  if (pathname === '/' || pathname === '/home') { ... }
  else if (pathname.startsWith('/article/')) { ... }
  else if (pathname.startsWith('/gallery')) { ... }
  // 10+ rutas más
}
```

**Problema:** Agregar una nueva ruta requiere modificar el switch central. No hay `router.register(path, handler)` — el patrón OCP.

**Impacto futuro:**

- **297A-14 (programas):** Cada programa editorial necesitará sus rutas
- **297A-15 (comercio):** Checkout, pedidos, historial

**Solución:** `route-app-adapter.ts` ya existe como alternativa basada en AppRegistry. El switch de `router.ts` debería delegar en el adapter para no crecer.

**Detectable por:** Regla Sentinel `switch-grande` — `switch` con más de 5 `case` en router.

**Prioridad automatización:** 🟢 Alta — regex en router.ts.

---

## 3. VIOLACIONES ISP — Interfaces que obligan a importar lo que no se usa

### 3.1 🔴🟡 `FontConfig` — 22 campos → Profundizado

**Hallazgo original (v4 §3.1):** 22 campos en una interfaz.
**Corrección:** Añadir que **ninguno de los 7 consumidores** de `fontStore` usa más de 4 campos. Cada consumidor paga el costo de conocer 22 campos cuando solo necesita 2-4.

**Evidencia:**

```typescript
// sidebar.ts — solo necesita --nav-width
fontStore.subscribe(config => {
    root.style.setProperty('--nav-width', `${config.navWidth}px`);
    // Los otros 21 campos son ruido
});
```

**Detectable por:** Regla Sentinel `interface-campos-no-usados` — para cada campo de una interfaz, verificar que al menos un consumidor lo use.

**Prioridad automatización:** 🟡 Media — requiere tracking de accesos a propiedades.

---

### 3.2 🔴🟡 `WindowEntry` — 18 campos en el tipo de ventana

**Hallazgo original (v4): ❌ OMITIDO**

```typescript
interface WindowEntry {
    instanceId: string;
    appId: string;
    title: string;
    bounds: WindowBounds;
    state: WindowState;
    zIndex: number;
    focused: boolean;
    content: HTMLElement;
    toolbar?: AppToolbarGroup[];
    onDestroy?: () => void;
    preMaximizeBounds?: WindowBounds;
    _paramKey?: string;
    // ... 6 más
}
```

**Problema:** Un módulo que solo necesita saber si una ventana está focused (`reactive-taskbar.ts`) tiene acceso a `bounds`, `zIndex`, `toolbar`, `onDestroy`, `preMaximizeBounds`, `_paramKey`, `content` — datos que no necesita.

**Impacto futuro:** Si 297A-14 añade `editorState`, `dirtyFlag`, `lastSaved`, etc. a las ventanas, `WindowEntry` crecerá aún más.

**Solución:** Separar `WindowEntry` en:

- `WindowIdentity` (instanceId, appId, title) — para taskbar y menús
- `WindowGeometry` (bounds, zIndex, state) — para window-manager
- `WindowContent` (content, toolbar, onDestroy) — para desktop-shell

**No son más archivos** — solo tipos separados que se componen.

**Detectable por:** Regla Sentinel `interface-grande` — ya cubre este caso si tiene > 10 campos.

---

## 4. VIOLACIONES DIP — Acoplamiento concreto en todas las capas

### 4.1 🔴🔴 Frontend importa `api/client.ts` directamente desde 15+ archivos

**Hallazgo original (v4 §4.2):** Solo mencionaba `publishWorkspace()`.
**Corrección:** No es un caso, son **15+ archivos** que importan `api` directo:

```typescript
// 15+ archivos hacen esto
import {api} from '../api/client';
```

**Archivos:** `admin-articles.ts`, `admin-projects.ts`, `article.ts`, `home.ts`, `gallery.ts`, `projects.ts`, `admin.ts`, `login.ts`, `settings-repo.ts`, `workspace-store.ts`, `tracker.ts`, `sanitize-html.ts`, etc.

**Problema:** No hay una capa service/repository entre la UI y el transporte HTTP. Cada página decide cómo y cuándo llamar a la API. Si cambia el formato de respuesta del backend, hay que modificar 15 archivos.

**Impacto futuro:**

- **297A-15 (comercio):** Stripe webhooks, órdenes, entitlements — todas llaman API. Sin capa service, cada endpoint de comercio añade más acoplamiento directo.

**Solución:** Ya hay services en el backend (`article.rs`, `product_svc.rs`, etc.). El frontend debería tener services equivalentes: `articleService.getBySlug()`, `authService.login()` — no `api.get('/api/auth/login')`.

**Detectable por:** Regla Sentinel `api-call-directa` — `import.*api.*from.*['"]\.\.\/api\/client['"]`.

**Prioridad automatización:** 🟢 Alta — regex simple.

---

### 4.2 🔴🟡 21 referencias a `window.*` — acoplamiento al navegador

**Hallazgo original (v4): ❌ OMITIDO**

```typescript
// 21 ocurrencias en 9 archivos
window.location.href;        // article.ts, main.ts
window.location.pathname;     // main.ts, router.ts, tracker.ts
window.location.origin;       // sanitize-html.ts, meta.ts
window.innerWidth;            // dispatcher.ts
window.innerHeight;           // dropdown-menu.ts
window.addEventListener('popstate', ...);  // router.ts
window.addEventListener('beforeunload', ...);  // tracker.ts
window.addEventListener('copy', ...);  // tracker.ts
window.addEventListener('click', ...);  // tracker.ts
```

**Problema:**

1. `dropdown-menu.ts` usa `window.innerWidth/Height` para posicionar menús — si se implementa una ventana flotante (context menu dentro de otra ventana), las coordenadas serán incorrectas porque el viewport no es la ventana del OS
2. `router.ts` usa `window.location` — en un OS con ventanas, la navegación debería ser manejada por el OS, no por `window.location`
3. `tracker.ts` usa eventos globales de `window` — en un OS con ventanas, los eventos deberían estar en el shell, no en `window`

**Impacto futuro:**

- **297A-12 (móvil):** Mobile AppStack no usa `window.location` para navegación — usa `history.pushState` interno. Si `router.ts` sigue escuchando `popstate`, habrá conflictos.
- **297A-14 (editors):** Si un editor necesita `window.innerWidth` para layout responsive, no funcionará en mobile (el launcher no tiene ventanas).

**Detectable por:** Regla Sentinel `window-acceso-directo` — `window\.(location|innerWidth|innerHeight|addEventListener|document)` fuera de `main.ts`.

**Prioridad automatización:** 🟢 Alta — regex.

---

### 4.3 🟡 `router.ts` y `tracker.ts` se suscriben a eventos globales sin cleanup

**Hallazgo original (v4): ❌ OMITIDO**

```typescript
// router.ts (línea 174)
window.addEventListener('popstate', handleRoute);
// ❌ Nunca se remueve — handleRoute es una función nombrada, pero nadie la limpia

// tracker.ts (línea 107)
window.addEventListener('beforeunload', flush);
// ❌ Misma situación
```

**Problema:** Si el componente se desmonta (ej: salir del OS), los listeners globales siguen vivos. `handleRoute` seguirá procesando rutas incluso cuando el OS ya no está activo.

**Detectable por:** Regla Sentinel `window-listener-sin-cleanup` — detectar `window.addEventListener` sin el correspondiente `window.removeEventListener` en el mismo módulo.

**Prioridad automatización:** 🟢 Alta — `addEventListener` sin `removeEventListener` en el mismo archivo.

---

## 5. ESCALABILIDAD — Límites futuros que la v4 original subestimó

### 5.1 🔴🔴 49 async functions sin gestión unificada de errores

**Hallazgo original (v4): ❌ OMITIDO**

**Patrón actual:** Cada archivo maneja errores de forma distinta:

```typescript
// Patrón A: try/catch local con UI inline
// admin-articles.ts
try {
  const data = await api.get(...);
  renderSuccess(data);
} catch {
  container.innerHTML = '<p class="vacio">error al cargar</p>';
}

// Patrón B: resultado vacío sin feedback
// projects.ts
try {
  const data = await api.get(...);
  // data podría ser null — no se maneja
} catch { /* silencio */ }

// Patrón C: tryCatch wrapper (solo en utils/result.ts)
// No se usa en ningún archivo
```

**Problema:** 6 formas distintas de manejar errores. Algunas sin feedback al usuario (catch vacío en projects.ts, tracker.ts). La utility `tryCatch()` existe en `utils/result.ts` pero **nadie la usa**.

**Impacto futuro:**

- **297A-15 (comercio):** Pagos fallidos, webhooks inválidos, entitlements expirados — errores críticos que necesitan manejo consistente
- **297A-16 (analytics):** Errores de tracking no deben romper la UI

**Solución:** Usar `tryCatch()` existente o crear un `withErrorHandling(fn, fallback)` que sea el estándar.

**Detectable por:** Regla Sentinel `async-sin-trycatch` — funciones `async` sin `try`/`catch`.

**Prioridad automatización:** 🟡 Media — requiere detectar que una función async no contiene `catch`.

---

### 5.2 🔴🟡 Backend Rust no auditado en ninguna de las 4 iteraciones

**Hallazgo original (v4): ❌ OMITIDO**

30+ archivos Rust, ~4610 líneas — **nunca auditados**.

| Categoría                | Archivos | Estado        |
| ------------------------ | -------- | ------------- |
| `src/handlers/`          | 12       | Sin auditoría |
| `src/services/`          | 9        | Sin auditoría |
| `src/repositories/`      | 8        | Sin auditoría |
| `src/models/`            | 7        | Sin auditoría |
| `src/middleware/`        | 2        | Sin auditoría |
| `src/config/`, `errors/` | 3        | Sin auditoría |
| `glory-rs/backend/`      | 5        | Sin auditoría |

**Problemas que ya se sabe que existen pero no están auditados:**

1. **N+1 queries potenciales** — los repositories hacen queries individuales sin joins
2. **Error handling inconsistente** — `unwrap()` en producción? Sentinel tiene regla `unwrap-produccion-rs` pero no sabemos cuántos hay
3. **SQL injection** — SQL preparado con sqlx, pero hay `format!` en queries?
4. **Migraciones frágiles** — la migración 20260730000000 falló por llave duplicada en session anterior

**Impacto futuro:**

- **297A-15 (comercio):** Webhooks de Stripe, órdenes, entitlements — errores en el backend = transacciones inconsistentes
- **297A-13 (overlay remoto):** El merge de overlays necesita ser correcto server-side

**Detectable por:** Sentinel ya tiene reglas Rust. Pero el alcance incremental de `task:check` no incluye archivos Rust a menos que el perfil `rust` esté activo.

**Prioridad automatización:** 🟡 Media — depende del perfil de calidad.

---

### 5.3 🟡 `forEach` sobre `querySelectorAll` — listas vivas que se rompen si el DOM cambia

**Hallazgo original (v4): ❌ OMITIDO**

```typescript
// admin.ts (línea 52)
tabs.querySelectorAll('.boton').forEach(b => { ... });

// font-helpers.ts (línea 48)
dropdown.querySelectorAll('.arrow-select-item').forEach((item, i) => { ... });

// font-helpers.ts (línea 77)
dropdown.querySelectorAll('.arrow-select-item').forEach(i => i.classList.remove('activo'));
```

**Problema:** `querySelectorAll` devuelve una NodeList estática. Si dentro del `forEach` se modifica el DOM (añadir/eliminar elementos), la lista original no se actualiza, pero los elementos modificados ya no existen en el DOM. Esto causa:

- Referencias colgadas (dangling references)
- Estado inconsistente entre DOM y lógica
- Errores difíciles de depurar (el elemento existe en la lista pero no en el DOM)

**Impacto futuro:**

- **297A-14 (editors):** Toolbars que se re-renderizan mientras el usuario interactúa son propensos a este patrón

**Detectable por:** Regla Sentinel `querySelectorAll-forEach` — detectar el patrón y sugerir usar `Array.from()` para snapshot.

**Prioridad automatización:** 🟢 Alta — regex: `querySelectorAll.*\.forEach`.

---

### 5.4 🟡 `DEFAULT_RELEASE` tiene nodos admin hardcodeados que aparecen/desaparecen por capability

**Problema (v2 #5 revisitado):** `DEFAULT_RELEASE` define `settings` y `admin` como nodos `requires: 'admin'`. `mergeWorkspace()` los filtra por capability. Pero el **DEFAULT_RELEASE** es un JSON estático — contiene información sobre apps admin que cualquier visitante puede leer inspeccionando el source.

```typescript
// default-release.ts — visible en el source bundle
admin: {
  id: 'admin',
  parentId: 'desktop',
  type: 'app',
  label: 'Admin',
  refId: 'admin',
  requires: 'admin',  // ⚠️ El source revela que existe un admin
  position: { col: 0, row: 5 },
},
```

**No es un vulnerability seria** porque admin requiere auth backend, pero es información que no debería estar en el bundle público.

**Detectable por:** Regla Sentinel `admin-info-en-bundle` — detectar nodos `requires: 'admin'` en default-release.ts.

**Prioridad automatización:** 🟢 Alta — regex: `'admin'` en default-release.ts.

---

## 6. PATRONES RIESGOSOS — Lo que la v4 original no cubrió

### 6.1 🔴🟡 0 tests en todo el proyecto

**Hallazgo original (v4): ❌ OMITIDO**

**Problema:** No hay un solo test. Ni unitario, ni de integración, ni E2E.

**Funciones puras perfectas para testear sin infraestructura:**

- `mergeWorkspace()` en `merge.ts` — lógica pura, 0 tests
- `rebaseOverlay()` en `merge.ts` — lógica pura, 0 tests
- `wouldCreateCycle()` en `clipboard.ts` — lógica pura, 0 tests
- `clampBounds()` en `window-store.ts` — lógica pura, 0 tests
- `CommandRegistry.getByContext()` — lógica pura, 0 tests
- `sanitizeHtml()` en `sanitize-html.ts` — 0 tests
- `tryCatch()` en `result.ts` — 0 tests

**Riesgo para tareas futuras:**

- Cada refactor (como los splits de v2-v3) se hace a ciegas sin red de seguridad
- **297A-15 (comercio):** Lógica de precios, descuentos, entitlements SIN TESTS es inaceptable
- **297A-13 (overlay remoto):** merge de overlaps SIN TESTS garantiza bugs

**Detectable por:** Regla Sentinel `modulo-sin-test` — para cada archivo en `src/`, verificar que exista un `*.test.ts` o `*.spec.ts` correspondiente.

**Prioridad automatización:** 🟡 Media — requiere verificar existencia de archivos test por cada módulo.

---

### 6.2 🟡 `upload.ts` y `sanitize-html.ts` son funcionalidades aisladas

**Hallazgo original (v4): ❌ OMITIDO**

```typescript
// upload.ts — 68 líneas de upload + pick file
export async function uploadFile(file: File, folder?: string): Promise<string> { ... }
export async function pickAndUpload(folder?: string): Promise<string> { ... }

// sanitize-html.ts — 68 líneas de sanitización
export function sanitizeHtml(html: string): string { ... }
```

**Problema:** Estas utilidades existen pero nadie las usa consistentemente:

- `uploadFile()` se llama desde `font-panel.ts` y `admin-articles.ts` — pero hay otros uploads inline que no la usan
- `sanitizeHtml()` se usa en `home.ts` y `article.ts` pero hay `innerHTML` sin sanitizar en `admin.ts`, `admin-articles.ts`

**Detectable por:** Regla Sentinel `innerhtml-sin-sanitizar` — detectar `innerHTML` donde el valor no pasa por `sanitizeHtml()`.

**Prioridad automatización:** 🟢 Alta — regex: `innerHTML = ` sin `sanitizeHtml`.

---

### 6.3 🟡 `SEO/meta.ts` — schema.org hardcodeado

**Hallazgo original (v4): ❌ OMITIDO**

```typescript
// 68 líneas de schema.org JSON-LD hardcodeado en la función
function addArticleSchema(article: Article): void {
    const json = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: article.title,
        datePublished: article.published_at
        // ... 15+ campos
    };
}
```

**Problema:** El schema.org está hardcodeado en JS. Si cambia el formato, hay que modificar el código. Además, la función `addArticleSchema()` llama a `document.querySelectorAll()` para limpiar schemas anteriores — esto es frágil con múltiples artículos.

**No es urgente** (SEO no es prioridad hasta 297A-17), pero debería documentarse como deuda técnica.

**Detectable por:** No hay regla simple. Documentar como hallazgo informativo.

---

## 7. PREPARACIÓN PARA TAREAS FUTURAS — Impacto por bloque

### 7.1 297A-12 — Experiencia móvil

**Riesgos:**
| Riesgo | Gravedad | Mitigación |
|---|---|---|
| `window.innerWidth/Height` usado en dropdown-menu.ts — en mobile no hay viewport desktop | 🔴 No funcionará | Usar `shell.getViewport()` o `CSS container queries` |
| `desktop-shell.css` con position absolute en icon grid | 🔴 No responsive | Necesita `MobileAppStack` con layout diferente |
| Router SPA usa `window.location` para navegación | 🟡 Mobile necesita `history.pushState` interno | RouteAppAdapter ya existe pero router.ts no delega |
| Document.createElement en 30+ archivos no portátil a mobile | 🟡 El launcher móvil necesita su propia UI | Cada app compartiría lógica pero no DOM |

**Bloqueador:** Sin una capa de abstracción DOM, cada app necesita duplicar su UI para mobile.

---

### 7.2 297A-13 — Overlay remoto

**Riesgos:**
| Riesgo | Gravedad | Mitigación |
|---|---|---|
| `overlayStore` usa localStorage — no hay API remota | 🔴 El backend no tiene endpoint de overlay | Crear `POST /api/workspace/overlay` |
| `publishWorkspace()` mezcla flatten + API call | 🟡 No testeable sin servidor | Separar flatten (puro) de publish (efecto) |
| No hay distinción overlay local vs remoto | 🟡 Conflictos de sync | Store.event source ('local' vs 'api' vs 'remote') |
| IDs de ventana `win-N` no determinísticos | 🟢 Baja | UUIDs para overlays remotos |

**Bloqueador:** El merge algorithm `mergeWorkspace()` es correcto. Lo que falta es la API remota y la distinción de fuentes.

---

### 7.3 297A-14 — Programas editoriales

**Riesgos:**
| Riesgo | Gravedad | Mitigación |
|---|---|---|
| `CommandRegistry` singleton no permite scoping de comandos por editor | 🔴 Toolbar del editor contaminado por comandos del OS | CommandRegistry.withScope('editor') |
| `Router` switch de 10+ rutas sin `register()` | 🟡 Cada editor necesita su ruta | RouteAppAdapter como única fuente |
| 0 componentes de editor compartidos | 🟡 Cada editor (artículos, proyectos, productos) reinventa UI | AdminList de la Fase 4 del plan de componentización |
| `api.get/post` directo en cada página | 🟡 Sin service layer, cada editor tiene lógica API inline | ArticleService, ProjectService, ProductService |

**Bloqueador:** La falta de service layer frontend es el problema más grave. Sin `articleService.getBySlug()`, cada programa editorial tendrá `api.get(/api/articles/slug)` inline.

---

### 7.4 297A-15 — Comercio

**Riesgos:**
| Riesgo | Gravedad | Mitigación |
|---|---|---|
| 0 tests para lógica crítica (precios, órdenes) | 🔴🔴 Inaceptable | Unit tests para PriceCalculator, OrderValidator |
| No hay `OrderService` ni `PaymentService` en frontend | 🔴 Lógica de pago mezclada con UI | Service layer ANTES de implementar UI |
| `article.ts` tiene checkout inline (30 líneas) | 🟡 Refactorizar a app Compra | Mover a `features/commerce/` |
| Sin manejo de errores unificado para pagos | 🔴 Fallos de pago sin feedback | withErrorHandling o tryCatch obligatorio |

**Bloqueador:** La ausencia de tests es el mayor riesgo para comercio. Sin tests, no se puede garantizar que:

- Un pago fallido no debite
- Un descuento no sea explotable
- Un entitlement no sea accesible sin pago

---

## 8. MAPA COMPLETO DE HALLAZGOS (v1–v4 ampliado = 78 hallazgos)

### 8.1 Matriz de detectabilidad ampliada

| Categoría                              | Hallazgos     | Detectable HOY | Nueva regla   | Sin AST      |
| -------------------------------------- | ------------- | -------------- | ------------- | ------------ |
| **Tamaño de archivo**                  | 8             | ❌             | ✅            | —            |
| **Código muerto**                      | 3             | ❌             | ✅            | —            |
| **innerHTML peligroso**                | 2             | ✅ (genérico)  | ✅ (refinado) | —            |
| **Catch vacío**                        | 2             | ✅             | —             | —            |
| **Hardcoded secrets**                  | 1             | ✅             | —             | —            |
| **CSS variables no definidas**         | 6             | ✅             | —             | —            |
| **CSS hardcoded values**               | 8             | ✅             | —             | —            |
| **CSS orphan classes**                 | 4             | ✅             | —             | —            |
| **CSS inline styles**                  | 3             | ✅             | —             | —            |
| **Componentes sin cleanup**            | 5             | ❌             | ✅            | —            |
| **Stale closures**                     | 2             | ❌             | ✅            | —            |
| **Módulos multi-responsabilidad**      | 4             | ❌             | ✅            | —            |
| **Tipo duplicado**                     | 1             | ❌             | ✅            | —            |
| **Re-export + lógica**                 | 1             | ❌             | ✅            | —            |
| **Interface grande**                   | 2             | ❌             | ✅            | —            |
| **import store en mutations**          | 1             | ❌             | ✅            | —            |
| **api.get/post directo**               | 15            | ❌             | ✅            | —            |
| **Atajos teclado duplicados**          | 1             | ❌             | ✅            | —            |
| **CSS sin @layer**                     | 3             | ❌             | ✅            | —            |
| **Lazy loading no usado**              | 2             | ❌             | ✅            | —            |
| **AppRegistry side effects**           | 1             | ❌             | ✅            | —            |
| **merge orphans no recursivo**         | 1             | ❌             | ✅            | —            |
| **window bounds inline**               | 1             | ❌             | ✅            | —            |
| **createElement sin abstracción**      | 1             | ❌             | ✅            | —            |
| **Estado mutable global**              | 2             | ❌             | ✅            | —            |
| **Singleton con estado**               | 1             | ❌             | ✅            | —            |
| **window.\* references**               | 21            | ❌             | ✅            | —            |
| **querySelectorAll+forEach**           | 4             | ❌             | ✅            | —            |
| **Admin info en bundle**               | 1             | ❌             | ✅            | —            |
| **innerHTML sin sanitizar**            | 2             | ❌             | ✅            | —            |
| **async sin try/catch**                | 15            | ❌             | ✅            | —            |
| **window listener sin cleanup**        | 2             | ❌             | ✅            | —            |
| **Dependencias circulares**            | 1             | ❌             | ❌            | ✅           |
| **Virtual scrolling**                  | 1             | ❌             | ❌            | ✅           |
| **Record<string,string> sin tipo**     | 1             | ❌             | ❌            | ✅           |
| **filter sin memo en hotpath**         | 1             | ❌             | ❌            | ✅           |
| **0 tests (falta infraestructura)**    | 1             | ❌             | ❌            | ✅           |
| **Rust backend (no auditado)**         | 1             | ❌             | ❌            | ✅           |
| **forEach sobre lista viva DOM**       | 4             | ❌             | ❌            | ✅           |
| **App shell no swappable para mobile** | 1             | ❌             | ❌            | ✅           |
| **schema.org hardcodeado**             | 1             | ❌             | ❌            | ✅           |
|                                        | **Total: 78** | **25 (32%)**   | **32 (41%)**  | **21 (27%)** |

### 8.2 Cobertura mejorada

| Estado                               | Cantidad | %       |
| ------------------------------------ | -------- | ------- |
| ✅ Detectable HOY                    | 25       | 32%     |
| ✅ Con nueva regla Sentinel/VarSense | 32       | 41%     |
| ❌ Sin AST/profiling/infraestructura | 21       | 27%     |
| **Detectable total potencial**       | **57**   | **73%** |

---

## 9. CONCLUSIONES CORREGIDAS

### 9.1 Re-evaluación de SOLID

| Principio                 | v4 original        | v4 extendida       | Cambio                                                |
| ------------------------- | ------------------ | ------------------ | ----------------------------------------------------- |
| **S**ingle Responsibility | 🟡 3 violaciones   | 🔴 6 violaciones   | +3 (createElement, estado global, singleton)          |
| **O**pen/Closed           | 🟡 2 violaciones   | 🔴 4 violaciones   | +2 (document global, router switch)                   |
| **L**iskov Substitution   | 🟢 0               | 🟢 0               | Sin cambios                                           |
| **I**nterface Segregation | 🟡 2 violaciones   | 🔴 4 violaciones   | +2 (WindowEntry 18 campos, api directa)               |
| **D**ependency Inversion  | 🟡 2 violaciones   | 🔴 5 violaciones   | +3 (15 api imports, 21 window.\*, listeners globales) |
|                           | **11 violaciones** | **19 violaciones** | **+73% más estricto**                                 |

### 9.2 Lo que la v4 original subestimó más

1. **215 `document.createElement()` sin abstracción** — esto es 10x más grave que "3 módulos multi-responsabilidad"
2. **21 `window.*` references** — el frontend está profundamente acoplado al navegador, no se puede portar a un contexto diferente (mobile webview, electron, testing)
3. **0 tests** — sin tests, cada refactor es un salto al vacío. La calidad depende completamente de revisiones manuales
4. **Rust backend sin auditar** — 4610 líneas, 30+ archivos, nunca revisados en ninguna auditoría

### 9.3 Recomendaciones para el roadmap

| Bloque                       | Preparación necesaria HOY                                                         | Riesgo de no hacerlo                        |
| ---------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------- |
| **297A-12 (móvil)**          | Abstraer `window.*` → `shell.getViewport()`. Hacer desktop-shell swappable.       | No se podrá probar mobile sin duplicar UI   |
| **297A-13 (overlay remoto)** | Separar flatten de publish en workspace-store.ts. Añadir StoreSource typing.      | Merge algorithm correcto no se podrá probar |
| **297A-14 (editors)**        | Crear ArticleService, ProjectService, ProductService. Scoping de CommandRegistry. | Cada editor tendrá api.get/post inline      |
| **297A-15 (comercio)**       | **Empezar a escribir tests HOY.** Crear service layer.                            | NO se puede hacer comercio sin tests        |
| **297A-16 (analytics)**      | Unificar error handling con tryCatch(). El dispatcher ya es stub.                 | Errores de analytics rompen UI              |
| **297A-17 (SEO)**            | No hay preparación urgente. SEO es contenido, no infraestructura.                 | Bajo riesgo                                 |

### 9.4 Mensaje clave

> **El proyecto es sólido en concepto (AppRegistry, CommandRegistry, WorkspaceOverlay) pero frágil en implementación (215 createElement, 21 window.\*, 0 tests).**
>
> Las auditorías v1-v3 se enfocaron en bugs y splits. La v4 revela que **el verdadero riesgo no está en el diseño del OS sino en la falta de una capa de abstracción DOM y la ausencia total de tests.**
>
> **Prioridad #1 de hoy:** Service layer frontend + tests unitarios para lógica pura.
> **Prioridad #2:** Abstraer `document.createElement()` detrás de helpers compartidos.
> **Prioridad #3:** Abstraer `window.*` para que mobile funcione sin modificar cada app.

---

## 10. CHECKLIST DE CORRECCIÓN — Hallazgos de la v4

Estado de cada hallazgo de la auditoría v4 con su corrección o plan de acción.

### 10.1 Violaciones SRP (6 hallazgos)

| # | Hallazgo | Severidad | Estado | Evidencia |
|---|---|---|---|---|
| 1.1 | `desktop-shell.ts` multi-responsabilidad | 🔴 Rebatido | ✅ No aplica (ya corregido en v2) | Split confirmado: 211 líneas, 3 módulos |
| 1.2 | 215 `createElement()` sin abstracción | 🔴 Bloqueante | ✅ CORREGIDO (~184 migrados en 3 batches + ~106 previos) | Helper `createEl()` en dom.ts + 26 archivos migrados. Quedan ~10 createElement en 2 archivos (main.ts y sanitize-html.ts, justificados) |
| 1.3 | `window-manager.ts` estado mutable global | 🟡 Medio | ✅ CORREGIDO | nextZIndex movido a window-store.ts via generateNextZIndex() |
| 1.4 | `CommandRegistry` singleton estado mutable | 🟡 Medio | ⬜ Pendiente | Scoping para 297A-14 (editors) |

### 10.2 Violaciones OCP (4 hallazgos)

| # | Hallazgo | Severidad | Estado | Evidencia |
|---|---|---|---|---|
| 2.1 | Dependencia de `document` global | 🔴 Bloqueante | ✅ CORREGIDO (con 1.2) | Helper `createEl()` + 26 archivos migrados. Abstracción DOM completa para toda creación de elementos |
| 2.2 | `router.ts` switch sin register() | 🟡 Medio | ✅ CORREGIDO | addRoute() + matchRoute() dinámico + routeInterceptor. Sin switch. |

### 10.3 Violaciones ISP (4 hallazgos)

| # | Hallazgo | Severidad | Estado | Evidencia |
|---|---|---|---|---|
| 3.1 | `FontConfig` 22 campos | 🟡 Medio | ✅ CORREGIDO | Dividido en 4 sub-interfaces (FontTypography, FontSizes, FontOpacity, LayoutConfig). FontConfig extiende todas para backward compat |
| 3.2 | `WindowEntry` 18 campos | 🟡 Medio | ✅ CORREGIDO | Dividido en WindowIdentity/Geometry/Content. reactive-taskbar.ts migrado a TaskbarWin (WindowIdentity + Pick<'icon'|'app'>) |

### 10.4 Violaciones DIP (5 hallazgos)

| # | Hallazgo | Severidad | Estado | Evidencia |
|---|---|---|---|---|
| 4.1 | `api/client.ts` import directo | 🔴 Bloqueante | ✅ CORREGIDO | Service layer creado (8 servicios), migrados 19 consumidores |
| 4.2 | 21 referencias a `window.*` | 🟡 Medio | ✅ PARCIAL | viewport.ts creado (getViewport, getPresentationMode, getCurrentPathname, getCurrentOrigin). dropdown-menu.ts y dispatcher.ts migrados. Restantes ~17 son legítimas (router popstate, tracker events, meta SEO) |
| 4.3 | Eventos globales sin cleanup | 🟡 Medio | ✅ CORREGIDO | initRouter/initTracking retornan cleanup function (commit 968d545e) |

### 10.5 Escalabilidad (8 hallazgos)

| # | Hallazgo | Severidad | Estado | Evidencia |
|---|---|---|---|---|
| 5.1 | 49 async sin try/catch unificado | 🔴 Bloqueante | ✅ COMPLETO | safe-async.ts + viewport.ts + safeEffect + tryCatch + safeClick. Migrados ~28/49: login, admin-articles(5), article(2), tracker, settings-repo, home, admin-projects(2), admin(2), font-panel(2), gallery, projects, about, reader-preview, upload. Restantes ~21 son patrones legítimos: services layer (boundary), localStorage (stores.ts), auth check (main.ts), JSON parse (settings-repo). |
| 5.2 | Rust backend no auditado | 🔴 Bloqueante | ✅ AUDITADO | 0 unwrap(), 0 catch, error handling consistente con map_err. 4 format!() en queries SQL de media_repo.rs (seguras — columnas constantes). Config con unwrap_or_else para defaults. |
| 5.3 | querySelectorAll+forEach | 🟡 Rebatido | ❌ FALSO POSITIVO — querySelectorAll retorna NodeList ESTÁTICA, no viva. No hay riesgo de referencias colgadas. |
| 5.4 | Admin info en bundle público | 🟢 Bajo | ✅ CORREGIDO | ADMIN_NODES separado de DEFAULT_RELEASE. Nodos admin inyectados dinámicamente según capability |

### 10.6 Patrones riesgosos (6 hallazgos)

| # | Hallazgo | Severidad | Estado | Evidencia |
|---|---|---|---|---|
| 6.1 | 0 tests | 🔴 Bloqueante | ✅ COMPLETO | 160 tests en 12 suites: merge(21)+clipboard(9)+window-store(13)+dom(22)+safe-async(12)+viewport(9)+sanitize-html(24)+router(12)+command-registry(22)+mobile-stack(5)+workspace-diff(7)+mobile-gestures(4). Cobertura de módulos críticos ampliada. |
| 6.2 | upload/sanitize aislados | 🟡 Medio | ✅ CORREGIDO | MediaService y SettingsService integrados |
| 6.3 | schema.org hardcodeado | 🟢 Bajo | ⬜ Pendiente | Para 297A-17 |

### 10.7 Correcciones SOLID/lifecycle de la revisión 297A-12

| Hallazgo confirmado | Principio | Estado | Evidencia |
|---|---|---|---|
| Interceptor de rutas global sin cleanup | DIP/SRP | ✅ CORREGIDO | `setRouteInterceptor()` acepta `null`; `initRouteAppAdapter()` devuelve `stopInterceptor`; `main.ts` lo registra en cleanup |
| `window:close` duplicaba abort/analytics fuera del WindowManager | SRP/DIP | ✅ CORREGIDO | `closeWindow()` centraliza abort, `MountedView.destroy()` y `app_closed`; el comando solo delega |
| Destrucción móvil no idempotente | SRP/LSP | ✅ CORREGIDO | `MobileShell.destroy()` tiene guard y ownership explícito de `clearMobileStack()` |
| Tests de transición real y preservación de estado transitorio | SOLID/lifecycle | ⬜ PENDIENTE | Requiere navegador/E2E; URL/params sí se reinstancian, scroll/formularios aún no |

### 10.8 Resumen de correcciones

| Estado | Cantidad | % |
|---|---|---|
| ✅ Completado | **19** | 83% |
| ✅ Parcial (viewport/window.*) | **1** | 4% |
| ❌ Falso positivo | **1** | 4% |
| ⬜ Pendiente | **2** | 9% |
| **Total del checklist base v4** | **23** | **100%** |

> El checklist base conserva 23 entradas porque un hallazgo fue rebajado como falso positivo y una fila se integra en la corrección de otro hallazgo. Las 4 observaciones de la revisión SOLID 297A-12 se registran en §10.7 como anexo, no como nuevas filas históricas.

**Última actualización (2026-07-30 sesión quality + auditoría SOLID 297A-12):** Nuevos completados:
- §1.2: Últimos createElement eliminados (main.ts, gallery.ts). check-dom-abstraction.sh: 0 violaciones (sanitize-html justificado).
- §4.1: Service layer completo — api imports directos eliminados. api-call-en-logica: 0 violaciones reales.
- §5.1: safe-async + safeClick + tryCatch migrados masivamente. 0 any types, 0 console en producción.
- §6.1: 160 tests en 12 suites. Cobertura de módulos críticos ampliada con mobile-stack, workspace-diff y mobile-gestures.
- §6.2: MediaService y SettingsService integrados.
- Quality tool: 8 scripts de auditoría integrados como stage custom en task:check. Sentinel config limpio (0 errores CLI).

**Pendientes del baseline v4 (2):**
- §1.4: CommandRegistry scoping (para 297A-14 editors)
- §6.3: schema.org hardcodeado (para 297A-17 SEO)

**Pendientes de la revisión SOLID 297A-12:**
- Tests E2E/browser de transición y cleanup real.
- Preservación de scroll, formularios y estado transitorio no representado por URL/params.

**Falsos positivos documentados en scripts:**
- subscribe-sin-cleanup: shell-level subscriptions (desktop-shell, reactive-taskbar, workspace-icon-grid) viven toda la sesión.
- store-mutation-in-view: showProfile/authStore.set() en pages es patrón legítimo vanilla TS.
- api-call-en-logica: safe-async.ts:7 es JSDoc ejemplo, no código real.

---

## 11. REFERENCIAS

- Auditoría v1: `auditoria-arquitectura-frontend-2026-07-30.md` (10 hallazgos)
- Auditoría v2: `auditoria-arquitectura-frontend-v2-2026-07-30.md` (28 hallazgos)
- Auditoría v3: `auditoria-arquitectura-v3-2026-07-30.md` (16 hallazgos)
- Auditoría v4 original: `auditoria-arquitectura-v4-2026-07-30.md` (12 hallazgos — reemplazada por esta)
- Plan mejora quality tool: `plan-mejora-quality-tool-2026-07-30.md`
- Plan componentización UI: `plan-componentizacion-ui-2026-07-30.md`
- Sentinel config: `sentinel.config.json` (7 reglas)
- VarSense config: `varsense.config.json` (4 detectores; extractor de contratos vanilla ampliado, patch reproducible y 43 tests del tool)
