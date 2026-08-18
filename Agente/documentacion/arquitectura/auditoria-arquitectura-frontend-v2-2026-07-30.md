# Auditoría de arquitectura frontend — Segunda iteración

> **Fecha:** 2026-07-30
> **Alcance:** frontend TypeScript/Vite del OS desktop (runtime, desktop, store, estilos)
> **Resultado:** 4 problemas críticos, 3 altos, 12 medios, 5 bajos, 5 informativos
> **Revisión:** Corregida el 2026-07-30 — 3 hallazgos rebajados de severidad, 7 omisiones añadidas, 2 soluciones corregidas
> **Auditoría anterior:** `auditoria-arquitectura-frontend-2026-07-30.md` (primera iteración)
> **Plan asociado:** `plan-refactorizacion-arquitectura-2026-07-30.md` (completado parcialmente)

---

## Resumen ejecutivo

La primera auditoría encontró que Finder era un app hardcodeado y no un file browser real. Eso se corrigió (297A-11). Esta segunda iteración revisa **todo** el frontend con el nuevo modelo de workspace implementado.

**Lo que funciona bien (no romper):**
- Workspace overlay model: release + overlay + merge puro es correcto y escalable
- CommandRegistry como fuente única de comandos: bien diseñado
- ResourceTypeRegistry: separación correcta de implementación vs tipos
- Store pub/sub simple: sin dependencias, predecible
- Split de archivos en módulos: todos bajo los límites de líneas
- Menu bar "Aplicaciones" derivando de workspaceStore: principio de fuente única aplicado
- Drag/resize con pointer events: patrón estándar correcto

---

## 1. CRÍTICO — desktop-concept.ts es código muerto activo

**Severidad:** CRÍTICO
**Archivo:** `frontend/src/features/desktop/desktop-concept.ts`
**Líneas:** ~160

`desktop-concept.ts` es la versión original del desktop (297A-2) con datos hardcodeados. Sigue existiendo como archivo completo con imports de componentes que ya no se usan. No se importa desde ningún sitio activo (main.ts usa `desktop-shell.ts`), pero:

1. **Confunde a cualquier agente/humano** que lea el código — parece que hay DOS sistemas de escritorio paralelos
2. **Los imports de componentes** (`createFinderPreview`, `createReaderPreview`, `createFontPanel`) están cableados directamente a implementaciones, rompiendo el patrón AppRegistry
3. **Los tipos están desalineados** — usa `'folder' | 'document' | 'application'` hardcodeado en vez del modelo de workspace

**Fix:** Eliminar el archivo. Es código muerto de la fase de concepto. Todo lo que hace ya lo hace `desktop-shell.ts` + `app-registration.ts`.

---

## 2. CRÍTICO — Finder non-singleton crea ventanas duplicadas al navegar entre carpetas

**Severidad:** CRÍTICO
**Archivos:** `route-app-adapter.ts`, `finder-preview.ts`

Cuando el usuario hace doble clic en una carpeta dentro de Finder, se llama `onOpenApp('finder', { folderId: childId })`. Esto pasa por `openAppWindow` que crea una **nueva ventana Finder** para cada carpeta. El usuario espera que la ventana existente **navegue** a la carpeta (como Windows Explorer), no que se abra una ventana nueva por cada subcarpeta.

El dedup de `_paramKey` previene duplicados del **mismo** folderId, pero no evita abrir 5 ventanas para 5 carpetas distintas.

**Impacto:** Si el usuario navega Galería → julio 2026 → fotos, tiene 3 ventanas Finder abiertas. Esto no es un file browser real — es un launcher de carpetas.

**Fix propuesto:** Finder debería **reutilizar la ventana existente** cuando navega entre carpetas (cambiar el folderId del contenido), no crear nuevas ventanas. Solo abrir ventana nueva si el Finder se abre desde el icon grid o el menu bar.

Opciones:
1. Finder mantiene un `currentFolderId` interno y re-renderiza al navegar (preferred)
2. `openAppWindow` para Finder cierra la ventana anterior antes de abrir la nueva
3. Agregar un parámetro `navigate: true` que indique "reutilizar ventana existente"

---

## 3. CRÍTICO — No hay modelo para "archivos" en el workspace

**Severidad:** CRÍTICO
**Archivos:** `workspace/types.ts`, `workspace/default-release.ts`, `workspace-icon-grid.ts`

El workspace model tiene `type: 'resource'` para artículos, imágenes, etc. Pero **no hay ningún nodo resource en el DEFAULT_RELEASE** y ningún flujo crea recursos automáticamente desde el backend.

Los artículos del blog se cargan desde la API en el menu bar "Archivo", pero **no existen como nodos del workspace**. No se pueden arrastrar al escritorio, no aparecen en Finder, no se pueden mover a carpetas.

El flujo completo sería:
1. Backend tiene artículos/productos/media
2. El workspace release debería tener nodos `type: 'resource'` para cada uno
3. Finder los renderiza cuando navegas a la carpeta que los contiene
4. ResourceTypeRegistry determina qué app abre cada recurso

Pero esto no existe. El workspace actual solo tiene folders y app shortcuts. Los recursos son un concepto declarado pero no implementado.

**Fix:** Implementar el flujo de recursos en el workspace — al menos para artículos. El workspace release del backend debería incluir nodos resource referenciando los artículos publicados.

---

## 4. ~~ALTO~~ → BAJO — `_paramKey` es frágil para dedup de ventanas

**Severidad:** ~~ALTO~~ → BAJO (corregido en revisión)
**Archivo:** `route-app-adapter.ts`

```typescript
const paramKey = Object.values(params).join(':');
```

~~Problemas:~~
~~1. `Object.values` no garantiza orden~~ **CORRECCIÓN:** `Object.values()` SÍ garantiza orden de inserción para claves string desde ES2015+. Esto no es un problema real.
2. Si un valor contiene `:`, dos parámetros distintos pueden colisionar: `{ a: 'x:y' }` vs `{ a: 'x', b: 'y' }` — válido pero improbable con el uso actual (un solo parámetro `folderId` o `resourceId`).

**Fix (opcional, bajo riesgo):** Usar `Object.entries(params).sort().map(([k,v]) => `${k}=${v}`).join('&')` para una key determinística. Solo necesario si se añaden más parámetros.

---

## 5. ~~ALTO~~ → BAJO — windowStore subscribe actualiza estilos inline en cada cambio

**Severidad:** ~~ALTO~~ → BAJO (corregido en revisión)
**Archivo:** `desktop-shell.ts` (líneas ~100-140)

~~El subscribe recrea DOM en cada cambio — O(n) por cada pixel de drag/resize.~~

**CORRECCIÓN:** Esto es **incorrecto**. Análisis del código real:
1. `enableDragResize` actualiza el DOM directamente durante el arrastre (pointermove → `windowEl.style.left/top/width/height`)
2. Solo en `pointerup` se llama `commitBounds()` → `updateWindowBounds()` → `windowStore.set()`
3. El subscribe se dispara UNA VEZ por release, no por pixel
4. El subscribe NO recrea DOM — solo crea para ventanas nuevas y actualiza inline styles para existentes
5. El loop de actualización hace `el.style.left/top/width/height/display/zIndex/classList` —7 operaciones por ventana, O(n) pero con n<20 es negligible

La redundancia existe (bounds se escriben dos veces: una en DOM durante drag, otra en subscribe después del commit) pero no es un problema de performance. Es un patrón estándar de stores reactivos.

---

## 6. ALTO — workspaceStore.get() snapshot en menú "Aplicaciones" es estático

**Severidad:** ALTO
**Archivo:** `desktop-menu-bar.ts`

`createApplicationsMenu()` hace `workspaceStore.get()` una sola vez cuando se abre el menú por primera vez. Si el usuario crea una carpeta nueva y luego abre el menú, la carpeta no aparece hasta que el menu bar se re-renderice (que no lo hace — es estático).

Igual que el menú "Archivo" que hace `api.get()` una vez, el menú "Aplicaciones" es un snapshot. Esto es aceptable para artículos (cargan al abrir el menú) pero no para el workspace que cambia durante la sesión.

**Fix:** El menú debería re-consultar workspaceStore cada vez que se abre (en `toggleEntry`), o suscribirse a cambios y re-renderizar.

---

## 7. MEDIO — Shell windows (Perfil) tienen path especial con campos opcionales

**Severidad:** ~~ALTO~~ → MEDIO (corregido en revisión)
**Archivos:** `window-manager.ts`, `desktop-shell.ts`, `reactive-taskbar.ts`

Perfil es una `registerShellWindow()` — un path especial que bypassa AppRegistry.

~~Fix: Registrar Perfil como app en AppRegistry. Eliminar `registerShellWindow`.~~

**CORRECCIÓN:** Este fix es **incorrecto**. Perfil NO puede ser una AppRegistry app porque:
1. Su contenido (`profile`) se crea en `main.ts` y se pasa como elemento existente — no se genera en un `render()` function
2. AppRegistry apps aparecerían en el menú "Aplicaciones" — Perfil no debería aparecer ahí (ya está como icono en el desktop)
3. Perfil no tiene ruta, toolbar, ni comportamiento de app
4. `registerShellWindow` es la abstracción correcta para contenido creado por el shell

**Fix real (bajo riesgo):** Limpiar el API — hacer `icon` y `cssClass` requeridos en la interface de shell windows, eliminar la necesidad de campos opcionales confusos. No eliminar el concepto.

---

## 8. MEDIO — `WorkspaceResourceKind` vs `ResourceKind` son tipos duplicados

**Severidad:** ~~ALTO~~ → MEDIO (corregido en revisión)
**Archivos:** `workspace/types.ts`, `resource-type-registry.ts`

```typescript
// workspace/types.ts
type WorkspaceResourceKind = 'article' | 'about' | 'project' | ... | 'generic'; // 9 valores

// resource-type-registry.ts  
type ResourceKind = 'article' | 'about' | 'project' | ... | 'folder' | 'shortcut' | 'generic'; // 11 valores
```

~~El cast `as ResourceKind` es inseguro.~~

**CORRECCIÓN:** El cast es **siempre seguro**. `WorkspaceResourceKind` es un SUBSET de `ResourceKind` — todo valor de `WorkspaceResourceKind` es un valor válido de `ResourceKind`. El `as ResourceKind` no puede fallar en runtime.

El problema real es **duplicación de tipos** — dos definiciones que deberían ser una. `ResourceKind` debería importarse desde `types.ts` y reutilizarse en `resource-type-registry.ts`, o `WorkspaceResourceKind` debería declararse como `type WorkspaceResourceKind = Exclude<ResourceKind, 'folder' | 'shortcut'>`.

---

## 9. MEDIO — Reader está hardcodeado, no carga contenido real

**Severidad:** MEDIO
**Archivo:** `reader-preview.ts`

Reader muestra contenido hardcodeado (un artículo de ejemplo). No usa `ctx.params` para cargar el artículo real. El `RenderContext` tiene `params.resourceId` pero Reader lo ignora.

Esto bloquea: abrir artículos desde Finder, desde el menu "Archivo", desde el workspace.

**Fix:** Reader debería hacer fetch de `/api/articles/{slug}` usando el resourceId/slug de params.

---

## 10. MEDIO — `about` app hace import dinámico de página legacy

**Severidad:** MEDIO
**Archivo:** `app-registration.ts` (About render)

```typescript
render: (ctx: RenderContext): MountedView => {
  const container = document.createElement('div');
  void import('../../pages/about').then(async m => {
    if (ctx.signal.aborted) return;
    container.appendChild(await m.renderAbout());
  });
  return { element: container, destroy: ... };
}
```

About importa `pages/about.ts` que es una página legacy con su propio fetch y rendering. Esto es un puente temporal — About debería ser una app que renderice contenido del workspace (nodo `about` de tipo resource), no una página SPA legacy.

**Fix:** About como app que lee contenido del workspace/backend a través del modelo de recursos.

---

## 11. MEDIO — Overlay mutations importan de workspace-store (circular)

**Severidad:** MEDIO
**Archivos:** `overlay-mutations.ts`, `workspace-store.ts`

```
workspace-store.ts → re-exports from → overlay-mutations.ts
overlay-mutations.ts → imports from → workspace-store.ts (overlayStore, workspaceStore, releaseStore, EMPTY_OVERLAY)
```

Esto es un **ciclo de importación**. TypeScript lo resuelve en tiempo de compilación porque los módulos usan referencias lazy (los stores son objetos, no valores que se evalúan al importar). Pero es un patrón fragil que puede romper con cambios menores.

**Fix:** Extraer los stores (`overlayStore`, `workspaceStore`, `releaseStore`) a un archivo `stores.ts` separado que ambos importen. O mover `EMPTY_OVERLAY` a `types.ts`.

---

## 12. MEDIO — mergeWorkspace hace delete sobre objeto mutado

**Severidad:** MEDIO
**Archivo:** `merge.ts`

```typescript
for (const tombId of tombstoneSet) {
  delete result[tombId];
}
// ... luego
for (const [id, node] of Object.entries(result)) {
  if (node.parentId === id) {
    tombstoneSet.add(node.id);
    delete result[node.id]; // Mutando mientras iteramos
  }
}
```

Eliminar keys de un objeto mientras se itera con `Object.entries()` es seguro en JS (entries se capturan al inicio), pero es confuso y propenso a bugs si alguien refactoriza.

**Fix:** Recolectar IDs a eliminar en un array separado, luego eliminar todos al final.

---

## 13. MEDIO — desktop-context-menu y desktop-app-toolbar__dropdown son menús paralelos

**Severidad:** MEDIO
**Archivos:** `desktop-context-menu.ts`, `desktop-window.ts`

Hay DOS implementaciones de menú:
1. `desktop-context-menu` — clic derecho, position fixed en body, z-index 9999
2. `desktop-app-toolbar__dropdown` — toolbar de app, position absolute, z-index 9999

Ambos renderizan items de CommandRegistry pero con lógica de apertura/cierre, keyboard handling y positioning duplicada.

El manual dice "superficies proyectan CommandRegistry" — correcto. Pero no dice que deben duplicar la implementación de menú.

**Fix:** Extraer un componente `createDropdownMenu(items[], options)` compartido que ambos usen. La diferencia es solo positioning (fixed vs absolute) y fuente de datos (filterByContext vs resolveByIds).

---

## 14. MEDIO — grid del desktop usa position absolute (no CSS grid real)

**Severidad:** MEDIO
**Archivo:** `desktop-shell.css`

```css
.desktop-icon-grid {
  position: absolute;
  top: var(--espacio-xl);
  right: var(--espacio-lg);
  display: grid;
  grid-template-columns: repeat(2, var(--sistema-icono-celda));
}
```

El grid está positioned absolutamente en la esquina superior derecha con solo 2 columnas. Esto no escala:
- Con 8+ iconos, se desborda verticalmente
- No se adapta al tamaño de la pantalla
- En mobile necesitará un layout completamente diferente

El manual dice "Desktop/tablet (>=768): escritorio" y "Móvil (<768): launcher". El grid actual no soporta tablet (podría necesitar 3-4 columnas).

**Fix:** Hacer el grid responsive con CSS grid auto-fill o un layout basado en el tamaño del workspace. Posicionar con `margin-left: auto` en vez de `position: absolute`.

---

## 15. MEDIO — window-manager no soporta maximize/fullscreen

**Severidad:** MEDIO
**Archivo:** `window-manager.ts`

`WindowState = 'open' | 'minimized' | 'maximized'` — el tipo existe pero no hay función `maximizeWindow()`. El estado `'maximized'` nunca se usa. No hay forma de que el usuario maximice una ventana (dobleclic en titlebar, botón, o teclado).

**Fix:** Implementar `maximizeWindow()` que guarda bounds anteriores y expande al workspace completo. Doble-clic en titlebar para toggle.

---

## 16. MEDIO — Sin Ctrl+C/X/V para clipboard del workspace

**Severidad:** MEDIO
**Archivos:** `clipboard.ts`, `commands/workspace-commands.ts`, `keyboard-handler.ts`

El clipboard del workspace existe (`setClipboard`, `pasteFromClipboard`) pero los atajos de teclado Ctrl+C/X/V no están conectados al clipboard del workspace. Solo hay comandos declarados pero la ejecución no filtra por selección actual.

**Fix:** Los comandos `workspace:copy`, `workspace:cut`, `workspace:paste` deberían leer `selectionStore.getSelectedIds()` y operar sobre esos nodos.

---

## 17. MEDIO — CSS variables mezclan español e inglés

**Severidad:** MEDIO
**Archivo:** `variables.css`

```css
--color-fondo: #dcdcdc;        /* español */
--color-texto: #000000;         /* español */
--sistema-fondo: #ffffff;       /* español */
--sistema-superficie: #ffffff;  /* español */
--espacio-xs: 4px;              /* español */
--borde: 1px solid var(--color-borde);  /* español */
```

El manual dice "CSS del proyecto: clases en español camelCase, tokens centralizados". Los tokens están en español — esto es consistente con el manual. Pero hay tokens legacy del sitio original (`--fuente-menu`, `--entrada-size`) que coexisten con tokens del OS (`--sistema-fondo`, `--sistema-texto`).

No es un problema funcional, pero la dualidad dificulta encontrar el token correcto.

**Fix (bajo riesgo):** Consolidar todos los tokens bajo prefijos consistentes: `--app-*` para el sitio legacy, `--os-*` para el OS.

---

## 18. MEDIO — Sin feedback visual al crear carpetas

**Severidad:** MEDIO
**Archivo:** `overlay-mutations.ts` (createFolder)

`createFolder()` crea el nodo en el overlay y devuelve el ID. Pero no hay UI para renombrar la carpeta recién creada (label por defecto: "Nueva carpeta"). El usuario tiene que hacer clic derecho → Renombrar.

**Fix:** Después de crear, entrar en modo inline-edit del label. Esto requiere que Finder/desktop-icon soporte editing inline.

---

## 19. BAJO — `generateWindowId()` usa contador global no persistente

**Severidad:** BAJO
**Archivo:** `window-manager.ts`

`let nextWindowId = 1` se resetea al recargar la página. Los IDs son `win-1`, `win-2`, etc. Esto no causa bugs porque los IDs son solo para la sesión, pero es una limitación si se quiere persistir estado de ventanas.

---

## 20. BAJO — `closeWindow` muta el array original

**Severidad:** BAJO
**Archivo:** `window-manager.ts`

```typescript
const topWindow = remaining.reduce((a, b) => (a.zIndex > b.zIndex ? a : b));
topWindow.focused = true; // Mutando un objeto del array
```

`remaining` contiene referencias a los objetos originalos del array. Mutar `topWindow.focused` directamente funciona porque luego se hace `windowStore.set(remaining)`, pero es confuso — parece que se olvidó de crear una copia.

---

## 21. BAJO — Sin protección contra XSS en labels del workspace

**Severidad:** BAJO
**Archivos:** `finder-preview.ts`, `desktop-icon.ts`, `reactive-taskbar.ts`

Los labels del workspace se insertan con `textContent` (seguro) en la mayoría de sitios. Pero si algún futuro render usa `innerHTML` para labels con formato, sería XSS.

Confirmado: todos los usos actuales usan `textContent` → seguro. Solo documentar como regla.

---

## 22. BAJO — `desktop-concept.ts` tiene imports no usados

**Severidad:** BAJO
**Archivo:** `desktop-concept.ts`

Imports de `createDesktopTaskbar`, `createFinderPreview`, `createReaderPreview`, `createFontPanel` que solo se usan dentro de este archivo muerto. Al eliminar el archivo, estos imports desaparecen.

---

## 23. BAJO — Finder no soporta selección múltiple

**Severidad:** BAJO
**Archivo:** `finder-preview.ts`

Finder usa `selectSingle()` en mousedown pero no implementa Ctrl+clic (`toggleSelect`) ni Shift+clic (`extendSelect`). Las funciones existen en `selection-store.ts` pero no se conectan.

**Fix:** Detectar Ctrl/Shift en el event handler de Finder items.

---

## 24. CRÍTICO — `MountedView.destroy()` nunca se ejecuta

**Severidad:** CRÍTICO (añadido en revisión)
**Archivos:** `window-manager.ts`, `core/lifecycle.ts`

```typescript
// lifecycle.ts — el contrato
closeWindow(instanceId) {
  target.controller?.abort();  // ✅ Esto funciona
  target.content.dispatchEvent(new CustomEvent('view:destroy')); // ❌ Nadie escucha esto
  // ❌ target.app?.destroy() NO se llama — WindowEntry no almacena el MountedView
}
```

`MountedView` tiene un campo `destroy?: () => void` que cada app puede definir. Pero `openWindow()` recibe `MountedView` y extrae solo `view.element` para almacenarlo en `WindowEntry.content`. El callback `destroy` se descarta. Cuando `closeWindow()` se ejecuta:
1. `controller.abort()` funciona — la AbortSignal se dispara
2. `CustomEvent('view:destroy')` se despacha pero ninguna app lo escucha
3. `MountedView.destroy()` nunca se invoca — no hay referencia a él en WindowEntry

Las apps que definen `destroy` (Finder, Reader, Settings, About, Trash, Projects) creen que su cleanup se ejecuta, pero no es así. Actualmente todas solo llaman `dispatchEvent({ type: 'app_closed' })` en destroy, así que el impacto actual es bajo (analytics no se registra al cerrar). Pero si alguna app almacena recursos que necesitan cleanup manual, se filtrarán.

**Fix:** Almacenar `view` (o al menos `view.destroy`) en `WindowEntry`, e invocarlo en `closeWindow()` antes del abort. — Analytics dispatcher no tiene backend

**Severidad:** INFO
**Archivo:** `analytics/dispatcher.ts`

El dispatcher de eventos (`app_opened`, `app_closed`, `window_focused`) registra eventos pero no envía a ningún backend. Es un stub.

---

## 25. MEDIO — desktop-taskbar.ts es código muerto (hermano de desktop-concept.ts)

**Severidad:** MEDIO (añadido en revisión)
**Archivo:** `frontend/src/features/desktop/components/desktop-taskbar.ts`

`desktop-taskbar.ts` solo se importa desde `desktop-concept.ts`. Es la versión estática/legacy de la taskbar (297A-2). La versión activa es `reactive-taskbar.ts`. Debe eliminarse junto con `desktop-concept.ts`.

---

## 26. MEDIO — Admin bypassa AppRegistry con hardcoded navigate()

**Severidad:** MEDIO (añadido en revisión)
**Archivos:** `workspace-icon-grid.ts`, `default-release.ts`

`default-release.ts` declara `admin` como `type: 'app', refId: 'admin'`, pero NO hay `AppRegistry.register({ id: 'admin' })` en `app-registration.ts`. En `workspace-icon-grid.ts` hay un caso especial hardcodeado:
```typescript
if (node.id === 'admin') { navigate('/admin'); return; }
```

Esto bypassa todo el sistema de ventanas del OS — Admin se abre como navegación de página SPA, no como ventana. Es inconsistente con el resto de apps que abren ventanas.

**Fix:** Registrar Admin como AppRegistry app que renderiza el contenido de `pages/admin.ts` dentro de una ventana, igual que About y Projects. Eliminar el hardcoded `navigate('/admin')`.

---

## 27. MEDIO — Snake no tiene implementación — workspace node muerto

**Severidad:** MEDIO (añadido en revisión)
**Archivo:** `default-release.ts`

`default-release.ts` declara `snake` como `type: 'app', refId: 'snake'`, pero no hay AppRegistry registration para 'snake'. Cuando el usuario hace clic en el icono de Snake, `openAppWindow('snake')` devuelve silenciosamente sin hacer nada. El icono aparece en el escritorio pero no funciona.

**Fix:** O registrar Snake como app (si hay plan para implementarlo), o eliminar el nodo del DEFAULT_RELEASE.

---

## 28. MEDIO — merge.ts detecta huérfanos solo 1 nivel profundo

**Severidad:** MEDIO (añadido en revisión)
**Archivo:** `workspace/merge.ts`

```typescript
for (const id of tombstoneSet) {
  for (const node of Object.values(result)) {
    if (node.parentId === id) {
      tombstoneSet.add(node.id);
      delete result[node.id];
    }
  }
}
```

El loop itera sobre `Object.values(result)` una sola vez. Si una carpeta tombstoneada contiene una subcarpeta que a su vez contiene items, los items de la subcarpeta sobreviven como huérfanos (parentId apunta a un nodo que ya no existe). En el workspace actual (1 nivel de carpetas) esto no ocurre, pero romperá cuando haya carpetas anidadas.

**Fix:** Repetir el loop hasta que no se eliminen más nodos (punto fijo), o usar BFS/DFS recursivo.

---

## 29. MEDIO — Sistemas de drag incompatibles entre Finder y desktop

**Severidad:** MEDIO (añadido en revisión)
**Archivos:** `finder-preview.ts`, `utils/icon-drag.ts`

Finder usa **HTML5 Drag and Drop API** (`draggable`, `dragstart`, `dragover`, `drop`). El desktop icon grid usa **Pointer Events** (`pointerdown`, `pointermove`, `pointerup` con ghost element). Son sistemas incompatibles — no se puede arrastrar un archivo desde Finder al escritorio ni viceversa.

**Fix:** Unificar en un solo sistema de drag. Pointer Events es más flexible y funciona en táctil. Migrar Finder a Pointer Events, o crear un módulo de drag compartido.

---

## 30. MEDIO — Estilos inline de ventanas impiden diseño responsive

**Severidad:** MEDIO (añadido en revisión)
**Archivo:** `desktop-shell.ts`

El subscribe de ventanas posiciona con estilos inline:
```typescript
el.style.left = `${win.bounds.x}px`;
el.style.top = `${win.bounds.y}px`;
el.style.width = `${win.bounds.w}px`;
el.style.height = `${win.bounds.h}px`;
```

Esto bypassa CSS completamente. No se pueden usar media queries para ajustar ventanas en tablet/mobile. Las ventanas desktop necesitan CSS custom properties (`--win-x`, `--win-y`, `--win-w`, `--win-h`) que CSS pueda referenciar.

---

## 31. MEDIO — contentWindow (outlet legacy) coexiste con sistema de ventanas

**Severidad:** MEDIO (añadido en revisión)
**Archivos:** `desktop-shell.ts`, `main.ts`

`desktop-shell.ts` exporta un `contentWindow` — el outlet legacy del router SPA. `main.ts` hace toggle de su visibilidad cuando la ruta es manejada por una app del runtime. Esto crea DOS superficies de rendering: el outlet legacy (para páginas que no son apps) y el sistema de ventanas. Es un artefacto transitorio que debería documentarse para eliminación cuando todas las páginas tengan app equivalente.

---

## 32. INFORMATIVO — Triple recompute de workspaceStore al iniciar

**Severidad:** INFORMATIVO (añadido en revisión)
**Archivo:** `workspace-store.ts`

`workspace-store.ts` se suscribe a `releaseStore`, `overlayStore` y `authStore`, todos llaman `recompute()`. Al inicio, los tres stores emiten su valor inicial, causando que `mergeWorkspace()` se ejecute 3 veces. No es un problema de performance (merge es rápido), pero es innecesario.

---

## 33. INFORMATIVO

**Severidad:** INFO

No hay ningún test para el frontend. `merge.ts` es una función pura perfecta para testing. `CommandRegistry`, `AppRegistry`, `selectionStore` también.

---

## 26. INFORMATIVO — initApp() en main.ts es secuencial y lento

**Severidad:** INFO
**Archivo:** `main.ts`

```typescript
await api.get('/api/auth/me');     // ~200ms
await loadSavedFonts();             // ~50ms  
await fetchWorkspaceRelease();      // ~200ms
// ... crear DOM
```

Tres awaits secuenciales antes de renderizar. `auth/me` y `fetchWorkspaceRelease` podrían ejecutarse en paralelo.

---

## 27. INFORMATIVO — route-app-adapter importa workspace-store dinámicamente solo para Finder title

**Severidad:** INFO
**Archivo:** `route-app-adapter.ts`

```typescript
if (appId === 'finder' && params?.folderId) {
  const { workspaceStore } = await import('./workspace/workspace-store');
  // ...
}
```

El import dinámico está bien para evitar circular deps, pero es un code smell que `route-app-adapter` necesite saber sobre workspaceStore solo para resolver un título. El título debería venir del caller o del AppDefinition.

---

## 28. INFORMATIVO — Sin error boundary

**Severidad:** INFO

Si una app throw en su `render()`, el error no se captura. No hay try/catch en `AppRegistry.instantiate()`. Un error en Finder bloquea todo el OS.

**Fix:** Wrap `app.render(ctx)` en try/catch en `openAppWindow()` y mostrar ventana de error.

---

## Prioridad de fixes (corregida en revisión)

| # | Severidad | Fix | Esfuerzo |
|---|---|---|---|
| 1 | CRÍTICO | Eliminar desktop-concept.ts + desktop-taskbar.ts | 5 min |
| 2 | CRÍTICO | Finder navega en ventana existente (no abre nueva) | 2h |
| 3 | CRÍTICO | Implementar flujo de recursos en workspace | 1 día |
| 3b | CRÍTICO | Almacenar MountedView.destroy en WindowEntry e invocarlo en closeWindow | 30 min |
| 4 | MEDIO | Unificar WorkspaceResourceKind → ResourceKind en types.ts | 30 min |
| 5 | MEDIO | Admin como AppRegistry app (eliminar navigate hardcoded) | 1h |
| 6 | MEDIO | Snake: registrar app o eliminar nodo muerto | 15 min |
| 7 | MEDIO | merge.ts: orphans recursivos (loop hasta punto fijo) | 30 min |
| 8 | MEDIO | Menú Aplicaciones reactivo (re-consultar al abrir) | 30 min |
| 9 | MEDIO | Unificar sistemas de drag (Finder HTML5 → Pointer Events) | 3h |
| 10 | MEDIO | Window bounds via CSS custom properties (no inline) | 2h |
| 11 | MEDIO | Reader carga contenido real desde API | 3h |
| 12 | MEDIO | Romper ciclo overlay-mutations ↔ workspace-store | 1h |
| 13 | MEDIO | Unificar menú dropdown (3 implementaciones → 1 componente) | 3h |
| 14 | MEDIO | Grid responsive | 2h |
| 15 | MEDIO | Implementar maximizeWindow | 1h |
| 16 | MEDIO | Conectar Ctrl+C/X/V al workspace clipboard | 1h |
| 17 | MEDIO | Inline rename al crear carpeta | 2h |
| 18 | MEDIO | Documentar contentWindow legacy para eliminación | 5 min |
| 19 | BAJO | _paramKey determinístico (solo si se añaden más params) | 15 min |
| 20 | BAJO | Shell window API cleanup (campos requeridos) | 30 min |
| 21 | MEDIO | Consolidar CSS tokens legacy vs OS | 2h |

---

## Checklist de escalabilidad: ¿Cuánto cuesta agregar una nueva app?

### Ejemplo: Agregar una Calculadora

1. Crear `apps/calculator/calculator-preview.ts` — render function
2. Registrar en `app-registration.ts` — AppRegistry.register con id, title, icon, render
3. Agregar nodo en `default-release.ts` — workspace node con type:'app', refId:'calculator'
4. Agregar ruta opcional en routePatterns
5. Agregar toolbar opcional con command IDs
6. CSS opcional

**Total: 2 archivos nuevos, 2 archivos editados, ~30 minutos.** Esto es **escalable y correcto**.

### Ejemplo: Agregar un nuevo tipo de recurso (ej: "video channel")

1. Agregar a `WorkspaceResourceKind` en types.ts
2. Agregar a `ResourceKind` en resource-type-registry.ts  
3. Registrar en `initResourceTypeRegistry()` con appId y actions
4. Implementar render en la app correspondiente

**Total: 2 archivos editados, 1 registro, ~20 minutos.** Escalable.

### Ejemplo: Soporte móvil (<768px)

1. Crear `mobile/launcher.ts` — launcher grid de apps
2. Crear `mobile/mobile-shell.ts` — shell sin ventanas/taskbar
3. Crear breakpoint detector que alterna desktop/mobile shell
4. Mismas apps, solo cambia la presentación

**Bloqueadores actuales:**
- `desktop-shell.ts` tiene window rendering hardcodeado (no swappable)
- No hay `MobileAppStack` ni launcher
- CSS del desktop no tiene media queries responsive
- El icon grid está absolute-positioned (no adaptable)

---

## Conclusión (revisada)

La arquitectura base es **sólida y escalable** para el caso de escritorio. Los principios de fuente única (workspaceStore, AppRegistry, CommandRegistry) están bien implementados después de las correcciones de 297A-11.

### Correcciones de la revisión

3 hallazgos fueron **rebajados de severidad** tras verificar contra el código real:
- `_paramKey` (ALTO→BAJO): `Object.values()` sí garantiza orden para claves string desde ES2015+
- `windowStore subscribe` (ALTO→BAJO): NO recrea DOM por pixel — `enableDragResize` actualiza DOM directo y solo commitea al store en pointerup
- `registerShellWindow` (ALTO→MEDIO): El concepto es correcto, Perfil no puede ser AppRegistry app porque su contenido se pre-crea en main.ts
- `WorkspaceResourceKind vs ResourceKind` (ALTO→MEDIO): El cast `as ResourceKind` es siempre seguro porque WorkspaceResourceKind es subset de ResourceKind

7 hallazgos fueron **añadidos** que la primera revisión omitió:
- `MountedView.destroy()` nunca se ejecuta (CRÍTICO)
- `desktop-taskbar.ts` es código muerto hermano de desktop-concept.ts
- Admin bypassa AppRegistry con `navigate('/admin')` hardcodeado
- Snake tiene workspace node pero ninguna implementación
- `merge.ts` detecta huérfanos solo 1 nivel profundo
- Sistemas de drag incompatibles (HTML5 vs Pointer Events)
- Estilos inline de ventanas impiden diseño responsive
- Triple recompute de workspaceStore al iniciar

### Problemas críticos (revisados)

1. **Código muerto** (desktop-concept.ts + desktop-taskbar.ts) — limpieza trivial, 5 min
2. **Finder abre ventana nueva por carpeta** — rompe metáfora de file browser, 2h
3. **Sin flujo de recursos** — workspace solo tiene shortcuts, no archivos reales, 1 día
4. **MountedView.destroy() nunca se ejecuta** — cleanup de apps roto, 30 min

### Escalabilidad confirmada

Agregar una nueva app sigue costando ~30 minutos (2 archivos nuevos, 2 editados). El modelo de workspace overlay es correcto. Los problemas son de completitud (features no implementadas) no de diseño.
