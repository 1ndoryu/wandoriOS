# Guía canónica: cómo agregar una nueva app al OS

> **Fecha:** 2026-07-31
> **Fuente:** contratos reales verificados en `frontend/src/features/runtime/` (app-registry.ts, app-registration.ts, lifecycle.ts, route-app-adapter.ts, deep-links.ts, command-registry.ts) y `workspace/default-release.ts`.
> **Enlace:** índice en `Agente/documentacion/indice-documentacion-2026-07-29.md`.
> Esta guía es la referencia operativa; el manual de arquitectura (§5) explica el porqué, los checkpoints SOLID el gate por fase.

## Objetivo y alcance

Definir la receta única y verificada para añadir un programa al OS **sin modificar el shell** (evidencia 297A-9): la app solo devuelve contenido (`MountedView`); el shell crea ventana, chrome, taskbar, toolbar y ruta. Si al implementar aparece un `if` por app/plataforma, detenerse y rediseñar (S2).

Aplica a: apps de escritorio y móvil (mismo AppRegistry para ambas presentaciones). No aplica a: `registerShellWindow` (windows de shell, ej. `shell-profile`), que no son apps del registry.

## 1. Contratos base (no cambiar)

```ts
// frontend/src/core/lifecycle.ts
interface RenderContext {
    readonly signal: AbortSignal;
    readonly params?: Readonly<Record<string, string>>;
}
interface MountedView {
    readonly element: HTMLElement;
    readonly actions?: HTMLElement; // [018A-1] franja de acciones inferior (chrome; la monta desktop y móvil)
    destroy?: () => void;
}
type AppRenderFn = (ctx: RenderContext) => MountedView | Promise<MountedView>;
```

```ts
// frontend/src/features/runtime/app-registry.ts
// frontend/src/features/runtime/capability.ts
type Capability = 'public' | 'authenticated' | 'admin';

interface AppDefinition {
    readonly id: string;
    readonly title: string;
    readonly icon: IconNode; // Lucide oficial, stroke 1px
    readonly iconType?: 'folder' | 'document' | 'application';
    readonly singleton: boolean;
    readonly requires: Capability;
    readonly routePatterns?: string[]; // legacy, migrar a deepLink
    readonly deepLink?: AppDeepLink; // contrato canónico de ruta pública
    readonly layout?: 'padded' | 'full-bleed';
    readonly toolbar?: AppToolbarGroup[]; // items = IDs de comandos
    readonly render: AppRenderFn;
}

interface LazyAppDefinition extends Omit<AppDefinition, 'render'> {
    readonly load: () => Promise<{render: AppRenderFn}>;
}
```

Reglas del contrato:

- `render` recibe `ctx.signal` (abort) y `ctx.params` (parámetros de instancia). Usar `ctx.signal.aborted` antes de manipular DOM asíncrono (patrón Admin).
- `destroy()` se invoca en `closeWindow` junto con `controller.abort()`; limpiar listeners/analytics (`app_closed`).
- La app **nunca** crea su ventana, z-index, chrome ni toolbar.
- [018A-1] Si la app tiene acciones primarias, puede devolver `actions` en `MountedView`: el shell la coloca como franja inferior fija — en desktop debajo del body padded (fuera de su scroll) y en móvil debajo del contenido a pantalla completa (`.movilApp` gana una tercera fila). La app la rellena y la oculta (`hidden`) según su estado; la misma instancia sirve a ambas presentaciones. Si la app no aporta `actions`, no hay franja.
- `findByRoute` usa `deepLink?.patterns ?? routePatterns` — el `deepLink` gana. Las apps locales (sin ruta) se abren solo por comando/icono.

## 2. Receta paso a paso (app nueva)

Costo típico: 2 archivos nuevos + 2 editados (~30 min), igual para desktop y móvil.

### Paso 1 — Contenido de la app

Crear `frontend/src/features/desktop/apps/<app>/<app>-preview.ts` exportando una factory `create<App>Preview(options)` que devuelve `HTMLElement` con clase raíz `desktop-<app>` (convención BEM en la práctica del OS). Solo contenido; sin CSS inline.

### Paso 2 — Registrar en el AppRegistry

Editar `frontend/src/features/runtime/app-registration.ts`:

```ts
/* App local o con ruta pública, carga eager o lazy según tamaño. */
AppRegistry.register({
  id: 'miApp',
  title: 'Mi App',
  icon: MiIcono,                 // import de 'lucide'
  iconType: 'application',
  singleton: true,
  requires: 'public',            // 'public' | 'authenticated' | 'admin'
  layout: 'padded',              // o 'full-bleed'
  toolbar: [{ label: 'Archivo', items: ['miApp:accion'] }],
  render: (ctx: RenderContext): MountedView => {
    dispatchEvent({ type: 'app_opened', appId: 'miApp' });
    const content = createMiAppPreview({ ... });
    return { element: content, destroy: () => { dispatchEvent({ type: 'app_closed', appId: 'miApp' }); } };
  },
});
```

- **Eager vs lazy:** apps pequeñas y ligeras → `register`; apps grandes o bajo demanda → `registerLazy({ ..., load: () => import('...').then(m => ({ render: ... })) })`. Apps editoriales complejas, WASM, WebGL, media avanzada o con dependencias pesadas deben ser lazy. No importar una dependencia pesada estáticamente desde `app-registration.ts`.
- **Preload:** no existe un `preload` global todavía; la carga por defecto ocurre al abrir. No añadir listeners de hover/idle por app. Solo introducir una política de precarga mediante ADR y medición de Network.
- **Heavy/GPU:** no existe aún un flag `heavy` global. Una app WebGL futura debe liberar loop, workers, timers, object URLs, audio y GPU en `destroy()`/abort; la exclusividad de recursos se decide con el primer caso real.
- **Parámetros de instancia:** `ctx.params`; dedup por `_paramKey` lo hace `route-app-adapter` automáticamente con `stableParamsKey`. Los parámetros internos del workspace (`folderId`, `resourceId`) no son URLs públicas y nunca deben convertirse implícitamente en slug.
- **Recursos públicos:** un nodo `resource` puede declarar `publicLocator: { appId, params }`; el resolver central valida que la app exista, sea pública y acepte esos parámetros mediante su `deepLink`. `refId` sigue siendo interno. Sin locator válido, la UI informa que el recurso no está disponible públicamente y no abre una ventana vacía.

### Paso 3 — Ruta pública canónica (solo si aplica)

Si la app tiene URL pública:

```ts
routePatterns: ['/mi-ruta/:slug'],
deepLink: createPathDeepLink('/mi-ruta/:slug', ['slug']),
```

`createPathDeepLink(pattern, parameterNames)` (de `./deep-links`) genera `patterns/parse/stringify`; `parse` valida allowlist de parámetros y `isSafeSegment` (rechaza `.`, `..`, `/`, `\`, control chars, >200 chars). Si algo falla → `null`.

### Paso 4 — Nodo en el workspace (solo si aparece en escritorio/launcher)

En `frontend/src/features/runtime/workspace/default-release.ts` (release público) o en `ADMIN_NODES` (en `stores.ts`, solo capability admin):

```ts
miApp: {
  id: 'miApp', parentId: 'desktop', type: 'app', label: 'Mi App', refId: 'miApp',
  position: { col: 0, row: 6 }, mobileOrder: 6, requires: 'public',
},
```

- `refId` = `appId` del registro. Los nodos admin **no** van en `DEFAULT_RELEASE`.
- La posición inicial es por celda (grid); el usuario la puede mover y persiste en overlay.

### Paso 5 — Comandos del toolbar (si aplica)

En `frontend/src/features/runtime/commands/toolbar-commands.ts` (o archivo del dominio):

```ts
CommandRegistry.register({
  id: 'miApp:accion',
  label: 'Hacer algo',
  icon: MiIcono,
  order: 52,
  contexts: ['toolbar'],
  undoPolicy: 'none',            // 'local' | 'compensating' si muta estado
  analyticsEvent: 'miApp.accion',
  isAvailable: () => ({ state: 'enabled' }),
  execute: async (): Promise<CommandResult> => { ...; return { status: 'success' }; },
});
```

El toolbar de la ventana resuelve los items por `CommandRegistry.get(ref)`. Registro duplicado → `console.warn`.

### Paso 6 — CSS con tokens del sistema

- Editar `frontend/src/styles/desktop/` (p. ej. `desktop-apps.css`) o crear `desktop-<app>.css` e importarlo.
- **Prohibido** hex/colores/fuentes/tamaños inline: usar `--sistema-*`, `--espacio-*`, `--fuente-sistema` de `variables.css`. Clases raíz `desktop-<app>` + modificadores BEM (`desktop-<app>__x`, `--mod`).
- El padding automático del contenido lo da `desktop-window__body--padded` cuando `layout !== 'full-bleed'` — no duplicarlo.
- Sin `@media` propios si no es necesario: el mismo contenido debe funcionar en móvil (MobileAppStack) con el mismo CSS.

### Paso 7 — Validar

```text
npm run task:check -- {ID}      // quality gate completo (Sentinel + VarSense + stack)
npx tsc --noEmit                // type-check frontend
```

Prueba visual real en navegador: desktop (≥768px) y móvil (<768px), estados vacíos, teardown, foco y teclado.

## 3. Casos de uso

| Caso                                      | Registro                                     | Ruta                 | Nodo                                               |
| ----------------------------------------- | -------------------------------------------- | -------------------- | -------------------------------------------------- |
| App local (ej. settings, trash)           | `register`/`registerLazy` sin ruta           | —                    | admin → `ADMIN_NODES`; pública → `DEFAULT_RELEASE` |
| App pública con URL (ej. about, projects) | `register` + `deepLink`                      | `createPathDeepLink` | `DEFAULT_RELEASE`                                  |
| App admin (ej. admin)                     | `registerLazy` + `requires:'admin'`          | opcional (`/admin`)  | `ADMIN_NODES` (stores.ts)                          |
| App con parámetros (ej. reader)           | `register` + `deepLink` con `parameterNames` | `/article/:slug`     | `DEFAULT_RELEASE`                                  |

Capacidades: `getAvailable(currentCapability)` y `route-app-adapter` consumen `hasCapability` desde `runtime/capability.ts`, con jerarquía `public < authenticated < admin`. La misma política se reutiliza en comandos, resource registry y workspace merge; no copiar arreglos de niveles en consumidores.

## 4. Gate SOLID (evidencia para la tarea)

- **S1** — Un archivo = una responsabilidad: contenido (`*-preview.ts`) ≠ registro (`app-registration.ts`) ≠ comandos (`toolbar-commands.ts`) ≠ CSS.
- **S2** — La app nueva se registra sin tocar el shell: ni `desktop-shell`, ni `window-manager`, ni `window-store`, ni `mobile-shell`. Si hay que modificarlos, es una señal de diseño roto.
- **S3** — `AppDefinition` expone solo lo que el shell necesita; la app no conoce chrome.
- **S4** — La app depende de `MountedView`/`RenderContext` y de servicios (p. ej. `workspaceStore`), nunca del DOM del shell ni de SQL.
- **S5** — Límites: `*-preview.ts` ≤ 300 líneas; sin N+1, sin listeners sin teardown, sin `unwrap` sobre input externo. Segundo caso real: la app funciona en desktop y móvil con el mismo código.
- **S6 — Carga:** una app pesada usa `registerLazy`, aporta medición de bundle y no descarga su chunk antes de abrirse salvo precarga aprobada. `destroy()` debe liberar recursos externos.

Definition of Done: evidencia S1–S6 en el plan, prueba positiva + negativa + regresión, teardown verificado, carga lazy medida cuando corresponda, `task:check` PASS y documentación/roadmap sincronizados.

## 5. Gotchas conocidos

- `registerLazy` **no** usa `render` — usa `load`; no mezclar ambos.
- El presupuesto actual de referencia está en `Agente/documentacion/arquitectura/adr-carga-apps-pesadas-2026-07-31.md`: bundle principal ~46 KB gzip y Tiptap ~87 KB gzip separado. Repetir la medición antes/después de agregar una dependencia pesada.
- Clases CSS sin regla = hallazgo de VarSense: verificar que toda clase nueva tenga su regla (contraejemplo real: `.desktop-about` en `app-registration.ts` sin CSS; el contenido real usa `.about-contenido` en `pages.css`).
- Apps sin `deepLink` no hacen `pushPath` (`getCanonicalAppPath` → `null`): no intentar URL canónica en apps locales.
- `dispatchEvent({ type: 'app_opened' })` dentro de `render` y `app_closed` en `destroy` — patrón consistente del OS (analítica).
- `publicLocator` pertenece semánticamente al nodo/release. Un overlay puede conservarlo al copiar un `resource`/`shortcut` público, pero no puede usarlo para exponer `refId`, rutas privadas, tokens o grants; el backend valida la forma pública y el resolver frontend valida la app/deep-link. `requires` ausente equivale a `public`.
- No borrar `routePatterns` legacy de apps existentes hasta migrar a `deepLink` (Reader ya migrado; Finder/About/Projects tienen ambos).

## 6. Referencias

- Manual de arquitectura: `Agente/documentacion/arquitectura/manual-arquitectura-wandorius-2026-07-29.md` (§5).
- Checkpoints SOLID: `Agente/documentacion/arquitectura/checkpoints-solid-escalabilidad-2026-07-31.md`.
- Identidad visual: `Agente/documentacion/design-system/manual-identidad-visual-os-2026-07-29.md`.
- Contratos interacción/comandos: `Agente/planes/plan-contratos-interaccion-comandos-medicion-2026-07-29.md`.
- Ejemplos reales: `frontend/src/features/runtime/app-registration.ts`, `frontend/src/features/desktop/apps/`.
