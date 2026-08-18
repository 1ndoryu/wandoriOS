# Plan: Componentización UI — Frontend wandori.us

> **Epic:** 297A-11 (limpieza post-arquitectura)
> **Fecha:** 2026-07-30
> **Revisión:** v2 — corregido tras auditoría (v3 hallazgo 2.14+)
> **Estado:** ⏸️ Backlog diferido; no bloquea el roadmap principal (actualizado 018A-44)
> **Dependencias:** auditoría v3 completada (16/16 fixes), quality gate 297A-11 PASS
> **Bloquea:** 297A-14 (programas editoriales reutilizan componentes admin)
> **Source:** `frontend/src/components/ui/` (6 existentes) + auditoría de patrones DOM

> **Nota de alcance:** este plan conserva ideas históricas de componentización, pero sus fases sobre páginas legacy, `font-panel.ts` y mover settings no son un bloque habilitado. La app Configuración permanece en `features/settings/`; el alias `font-panel.ts` ya fue sustituido por `settings-panel.ts` en 018A-44. Reactivar este plan requiere una tarea explícita y revisar primero el roadmap principal.

---

## 1. Diagnóstico — Qué está pasando realmente

### 1.1 Estado actual de components/ui/

| Componente          | Archivo             | Líneas | Uso                        | Notas                             |
| ------------------- | ------------------- | ------ | -------------------------- | --------------------------------- |
| `createInput`       | `input.ts`          | 55     | ✅ login.ts, admin-\*.ts   | Bien diseñado, reutilizado        |
| `createModal`       | `modal.ts`          | 64     | ✅ gallery.ts, admin-\*.ts | Bien diseñado                     |
| `createSelect`      | `select.ts`         | 47     | ✅ (uso futuro)            | Bien diseñado                     |
| `createTextarea`    | `textarea.ts`       | 47     | ✅ admin-\*.ts             | Bien diseñado                     |
| `showConfirm`       | `confirm.ts`        | 60     | ✅ admin-\*.ts             | Bien diseñado                     |
| `showToast`         | `toast.ts`          | 29     | ✅ 5+ páginas              | Bien diseñado                     |
| **`createButton`**  | **❌ inexistente**  | —      | ⬜ 27 ocurrencias          | **La omisión principal**          |
| **`dropdown-menu`** | `features/desktop/` | 120    | ✅ desktop + toolbar       | **Mal ubicado**                   |
| **`async-content`** | **❌ inexistente**  | —      | ⬜ 7+ páginas              | **Patrón loading/error repetido** |

### 1.2 Distribución real de botones (27 className='boton')

| Grupo                                                         | Cantidad | Destino                           |
| ------------------------------------------------------------- | -------- | --------------------------------- |
| `pages/admin-*.ts` (artículos, proyectos, admin)              | 17       | **297A-16 → eliminar**            |
| `features/settings/` (font-panel, social-links, font-helpers) | 4        | Sobrevive, mover a admin/         |
| `components/ui/confirm.ts`                                    | 2        | **Debe usar createButton**        |
| `pages/` (login, gallery, article, checkout)                  | 4        | **297A-16 → eliminar**            |
| **Total en código vivo**                                      | **~6**   | Los 21 restantes serán eliminados |

### 1.3 El problema real — No son los botones legacy

Las 38 `createElement('button')` totales se distribuyen así:

- **22 en páginas legacy** (admin, login, checkout, gallery, article) → se eliminarán
- **16 en componentes del OS desktop** (reactive-taskbar, finder-preview, trash-preview, desktop-window, desktop-icon, desktop-menu-bar, dropdown-menu) → **estos viven**

El ROI de refactorizar los 22 legacy es **bajo** porque se eliminarán. El ROI de refactorizar los 16 del OS es **alto** porque:

1. Son componentes activos que seguirán evolucionando
2. Tienen estilos consistentes (clases `.desktop-taskbar__*`, `.desktop-window__control`)
3. El patrón createButton() unificaría la creación de botones del OS

---

## 2. Principios de diseño

### 2.1 Reglas para componentes nuevos

1. **Un componente encapsula creación DOM + listener cleanup.** No solo CSS.
2. **API mínima:** parámetros planos, sin configuración anidada.
3. **Cleanup:** todo componente acepta opcionalmente un `AbortSignal` para limpiar listeners.
4. **Sin dependencias circulares.** `confirm.ts` no importa `button.ts` ni viceversa. Si dos componentes se necesitan mutuamente, el tercero orquesta.
5. **CSS via tokens existentes.** No crear nuevas variables CSS. Usar `var(--sistema-*)` y `var(--color-*)`.
6. **Sin CSS inline en JS.** Usar clases CSS definidas en `components.css` o `desktop-*.css`.
7. **El componente no decide layout.** El contenedor posiciona. El componente solo existe y se estiliza a sí mismo.
8. **Límite 150 líneas por componente.** Si excede, dividir.

### 2.2 Naming

- **Archivos:** kebab-case (`dropdown-menu.ts`, `async-content.ts`)
- **Funciones:** `createButton()`, `createDropdownMenu()`
- **Tipos/interfaces:** `ButtonOptions`, `DropdownMenuOptions`
- **Clases CSS:** Español camelCase (consistente con proyecto): `enlace`, `enlace-quitar`, `campo-entrada`

### 2.3 Barrel export

`components/ui/index.ts` re-exporta todo:

```typescript
export {createInput} from './input';
export {createModal} from './modal';
export {createSelect} from './select';
export {createTextarea} from './textarea';
export {showConfirm} from './confirm';
export {showToast} from './toast';
export {createButton} from './button';
export {createDropdownMenu} from './dropdown-menu';
export {createAsyncContent} from './async-content';
```

Los consumidores importan desde `../../components/ui` — un solo path, sin saber qué archivos existen.

---

## 3. Fases (priorizadas por valor real)

### Fase 1: Mover `dropdown-menu.ts` a `components/ui/` (PRIORIDAD #1)

**Qué:** Mover `features/desktop/components/dropdown-menu.ts` → `components/ui/dropdown-menu.ts`.

**Por qué:** Es un componente de UI pura (open/close/escape/outside-click) usado por:

- `desktop-context-menu.ts` (context menu del escritorio)
- `desktop-menu-bar.ts` (barra de menú Archivo/Aplicaciones/Configuración)
- `desktop-window.ts` (toolbar de ventanas)

Está mal ubicado en `features/desktop/` cuando no tiene lógica de negocio del desktop.

- [ ] Mover `dropdown-menu.ts` a `components/ui/dropdown-menu.ts`
- [ ] Crear barrel `components/ui/index.ts` con todos los exports
- [ ] Actualizar imports en: `desktop-context-menu.ts`, `desktop-menu-bar.ts`, `desktop-window.ts`, `toolbar-commands.ts`
- [ ] Verificar que `dropdown-menu.ts` no importa nada de `features/desktop/` (debe ser puro UI)
- [ ] **Gate:** `npm run type-check` + menús contextual y barra funcionan correctamente
- [ ] **Esfuerzo:** 20 min

---

### Fase 2: Crear `createButton` (PRIORIDAD #2)

**Qué:** Crear `components/ui/button.ts` con `createButton()`.

**Por qué:** Es la omisión más obvia de `components/ui/`. 38 `createElement('button')` en todo el frontend — más que cualquier otro elemento. Ya existen createInput, createModal, createSelect, createTextarea — falta el botón.

**Alcance acotado:** Solo reemplazar en:

1. `components/ui/confirm.ts` (2 botones) — debe usar createButton
2. `features/settings/` (4 botones) — sobrevive a 297A-16
3. `pages/admin*.ts` (15 botones) — legacy, pero reemplazar ahora evita doble trabajo cuando se extraigan programas admin en 297A-14

NO reemplazar en componentes del OS desktop (taskbar, finder, ventanas) porque esos botones tienen estilos específicos con clases `.desktop-*`.

**API:**

```typescript
export type ButtonVariant = 'normal' | 'pequeno' | 'grande';

export interface ButtonOptions {
    label: string;
    variant?: ButtonVariant;
    disabled?: boolean;
    onClick?: () => void;
    className?: string;
    type?: 'button' | 'submit';
    /** Si se provee, los listeners se limpian al abortar */
    signal?: AbortSignal;
}
```

- [ ] Crear `frontend/src/components/ui/button.ts`
- [ ] Exportar desde `components/ui/index.ts`
- [ ] Reemplazar en `confirm.ts` (2 usos: btnSi, btnNo)
- [ ] Reemplazar en `features/settings/social-links.ts` (2 usos)
- [ ] Reemplazar en `features/settings/font-panel.ts` (2 usos)
- [ ] Reemplazar en `pages/admin-articles.ts` (7 usos)
- [ ] Reemplazar en `pages/admin-projects.ts` (3 usos)
- [ ] Reemplazar en `pages/admin.ts` (5 usos)
- [ ] Reemplazar en `pages/gallery.ts` (1 uso)
- [ ] Reemplazar en `pages/article.ts` (1 uso)
- [ ] Reemplazar en `pages/login.ts` (1 uso)
- [ ] Reemplazar en `pages/checkout.ts` (2 usos)
- [ ] **Gate:** `npm run type-check` + verificar visualmente: admin articles, admin projects, admin, settings, login, gallery, article, checkout
- [ ] **Gate:** Ejecutar `npm run task:check -- 297A-11` (verificar que no se rompió nada del OS)
- [ ] **Esfuerzo:** 1-2 horas

---

### Fase 3: Crear `createAsyncContent` (PRIORIDAD #3)

**Qué:** Crear `components/ui/async-content.ts` con `createAsyncContent()`.

**Por qué:** El patrón "crear p loading → fetch → reemplazar con contenido o error" se repite en 7+ páginas (home, article, gallery, projects, admin, admin-articles, admin-projects). Cada una tiene su propia implementación con `innerHTML` y estilos inline.

**API:**

```typescript
export interface AsyncContentOptions<T> {
    fetch: (signal: AbortSignal) => Promise<T>;
    renderSuccess: (data: T) => HTMLElement | HTMLElement[];
    renderError?: (error: Error) => HTMLElement;
    renderEmpty?: () => HTMLElement;
    /** Mensaje de loading personalizado */
    loadingMessage?: string;
}

export function createAsyncContent<T>(options: AsyncContentOptions<T>): HTMLElement;
```

Retorna un contenedor que automáticamente:

1. Renderiza estado "cargando..." con clase `async-loading`
2. Ejecuta fetch con AbortSignal
3. En caso de éxito: reemplaza con `renderSuccess(data)`
4. En caso de error: reemplaza con `renderError(error)` o estado por defecto
5. En caso de datos vacíos: reemplaza con `renderEmpty()` o "sin datos"
6. Si el signal se aborta: no renderiza nada (evita stale responses)

**Estados:** loading, success, error, empty, aborted.

- [ ] Crear `components/ui/async-content.ts`
- [ ] Exportar desde `components/ui/index.ts`
- [ ] Añadir clases CSS en `components.css`:
    - `.async-loading`, `.async-error`, `.async-empty` con tokens del sistema
- [ ] Reemplazar en `pages/home.ts`
- [ ] Reemplazar en `pages/article.ts`
- [ ] Reemplazar en `pages/gallery.ts`
- [ ] Reemplazar en `pages/projects.ts`
- [ ] Reemplazar en `pages/admin.ts` (stats + content)
- [ ] Reemplazar en `pages/admin-articles.ts`
- [ ] Reemplazar en `pages/admin-projects.ts`
- [ ] **Gate:** `npm run type-check` + verificar carga con/sin datos + error simulado
- [ ] **Gate:** Verificar que estados loading/empty/error usan tokens CSS, no inline styles
- [ ] **Esfuerzo:** 2-3 horas

---

### Fase 4: Crear `AdminList` (PRIORIDAD #4)

**Qué:** Crear `components/admin/admin-list.ts`.

**Por qué:** Los patrones de listas admin (items con acciones editar/eliminar, encabezados, botón nuevo) se repiten en admin-articles.ts, admin-projects.ts y admin.ts (top articles). No hay componente compartido.

**No hacer:** reemplazar en admin.ts — esa página será eliminada en 297A-16. Solo admin-articles y admin-projects.

```typescript
export interface AdminListItem {
    id: string;
    titulo: string;
    subtitulo?: string;
    onEdit?: () => void;
    onDelete?: () => void;
}

export function createAdminList(options: {items: AdminListItem[]; onNew?: () => void; newLabel?: string; title?: string}): HTMLElement;
```

- [ ] Crear `components/admin/admin-list.ts`
- [ ] Reemplazar en `pages/admin-articles.ts` (renderArticleList)
- [ ] Reemplazar en `pages/admin-projects.ts` (renderProjectList)
- [ ] **Gate:** `npm run type-check` + listas funcionales en admin-articles y admin-projects
- [ ] **Esfuerzo:** 1-2 horas

---

### Fase 5: Mover `features/settings/` a `components/admin/` (PRIORIDAD #5)

**Qué:** Reubicar componentes de settings que sobreviven al refactor.

**Contexto histórico:** el antiguo `font-panel.ts` se dividió en panel y repositorio. La responsabilidad actual vive en `settings-panel.ts` + `profile-settings.ts`; no mover estos módulos a `components/admin/` sin una decisión nueva de arquitectura.

- [x] Retirar el alias `features/settings/font-panel.ts`; `settings-panel.ts` es la entrada vigente (018A-44).
- [ ] Mover `features/settings/social-links.ts` → `components/admin/social-links.ts` *(diferido; requiere decisión de dominio)*
- [ ] Mover `features/settings/settings-repo.ts` → `utils/settings-repo.ts` *(diferido; revisar boundary de servicios primero)*
- [ ] Actualizar imports en `app-registration.ts` (lazy load), `main.ts`, y otros
- [ ] **Gate:** `npm run type-check` + panel configuración funciona, lazy load no se rompe
- [ ] **Esfuerzo:** 30 min

---

### Fase 6: Crear barril barrel `components/ui/index.ts` (transversal)

**Qué:** Crear el barrel export que unifica todos los componentes UI.

- [ ] Crear `components/ui/index.ts` con todos los exports
- [ ] **No** actualizar imports existentes (dejar para cuando se toque cada archivo)
- [ ] **Gate:** `npm run type-check`
- [ ] **Esfuerzo:** 10 min

---

## 4. Tabla resumen de fases

| #   | Fase                                 | Prioridad | Esfuerzo | Depende de                | Riesgo                    |
| --- | ------------------------------------ | --------- | -------- | ------------------------- | ------------------------- |
| 1   | Mover dropdown-menu a components/ui/ | 🔴 P0     | 20 min   | Nada                      | Bajo — solo mover archivo |
| 2   | createButton()                       | 🔴 P0     | 1-2h     | Fase 1 (barrel)           | Medio — 12 archivos tocar |
| 3   | createAsyncContent()                 | 🟡 P1     | 2-3h     | Fase 1 (barrel)           | Medio — 7 archivos        |
| 4   | AdminList                            | 🟡 P1     | 1-2h     | Fase 2 (usa createButton) | Medio — 2 archivos        |
| 5   | Mover settings/ a admin/             | 🟢 P2     | 30 min   | Fase 1, Fase 2            | Bajo — solo mover         |
| 6   | Barrel index.ts                      | 🟢 P2     | 10 min   | Fase 1                    | Bajo                      |

**No priorizadas** (bajo ROI o código pronto a eliminar):

- `ImageUploader` (solo 2 usos, uno en admin legacy)
- `EditorToolbar` (solo admin-articles, se eliminará)
- `StatsGrid` (solo admin.ts, se eliminará)
- `demo-data.ts` (5 páginas legacy, se eliminarán)

---

## 5. Lo que NO se toca

| No tocar                                                                                                                     | Razón                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Componentes desktop (`reactive-taskbar.ts`, `desktop-window.ts`, `desktop-icon.ts`, `finder-preview.ts`, `trash-preview.ts`) | Tienen estilos específicos `.desktop-*`. Su refactorización pertenece a 297A-14 (programas editoriales) cuando se estandaricen las app toolbars. |
| `pages/admin.ts`                                                                                                             | Será eliminada en 297A-16                                                                                                                        |
| `pages/checkout.ts`                                                                                                          | Será reemplazada por app Compra (297A-15)                                                                                                        |
| `glory-rs/frontend/componentes/ui/Boton.tsx`                                                                                 | Es framework React, no Vanilla TS                                                                                                                |
| `components/layout/sidebar.ts`, `profile.ts`                                                                                 | Ya refactorizados con reconcileChildren en auditoría v3                                                                                          |

---

## 6. Definition of Done del plan

- [ ] `dropdown-menu.ts` movido a `components/ui/` con barrel export
- [ ] `createButton()` creado y usado en confirm.ts + settings/ + admin pages
- [ ] `createAsyncContent()` creado y usado en 7 páginas
- [ ] `AdminList` creado y usado en admin-articles + admin-projects
- [ ] `features/settings/` movido a `components/admin/` + `utils/`
- [ ] `components/ui/index.ts` barrel export creado
- [ ] 0 imports circulares entre componentes UI
- [ ] `npm run type-check` pasa en cada fase
- [ ] `npm run task:check -- 297A-11` pasa tras cada fase
- [ ] Cada fase tiene su propio commit

---

## 7. Riesgos actualizados

| Riesgo                                                           | Probabilidad | Mitigación                                                                                             |
| ---------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------ |
| Import paths rotos al mover archivos                             | Media        | `npm run type-check` tras cada movimiento                                                              |
| font-panel lazy load se rompe al moverlo                         | Media        | Verificar `app-registration.ts` + lazy import path                                                     |
| createButton() no cubre variante 'pequeno' de admin-articles     | Baja         | Verificar CSS `.boton-pequeno` existe antes de mapear variantes                                        |
| createAsyncContent() duplica lógica de reconcileChildren         | Baja         | AsyncContent es para fetch API, no para lists reactivas                                                |
| Dependencia circular confirm.ts ↔ button.ts                      | Baja         | Prohibido explícitamente: confirm.ts no importa button.ts                                              |
| Mezclar vanilla DOM components con nuevas app toolbars (297A-14) | Media        | Estos componentes son transicionales; se migrarán a patrón de apps cuando 297A-14 estandarice toolbars |

---

## 8. Notas de arquitectura

### 8.1 Por qué no refactorizar los botones del desktop OS

Los botones del OS (taskbar, ventanas, finder) usan clases CSS `.desktop-taskbar__*`, `.desktop-window__control`. Son estilos altamente específicos que no se benefician de un `createButton()` genérico. Además, en 297A-14 se estandarizarán las app toolbars, lo que puede cambiar el patrón de botones del OS. Refactorizar ahora sería doble trabajo.

### 8.2 Los componentes UI son transicionales

Los componentes creados aquí (`createButton`, `createAsyncContent`, `AdminList`) sirven al sitio legacy durante su vida restante. Cuando 297A-16 elimine las páginas admin legacy, estos componentes pueden:

- Eliminarse si solo los usaba el admin legacy
- Migrarse a los nuevos programas admin (297A-14) si son necesarios

El diseño prioriza que funcionen hoy sin atar la arquitectura del futuro.

### 8.3 Por qué barrel exports ahora

El patrón `import { createInput } from '../components/ui/input'` fuerza a cada consumidor a conocer la estructura interna de `components/ui/`. Un barrel `index.ts` permite:

```typescript
// Antes (conocimiento interno)
import {showToast} from '../components/ui/toast';
import {createInput} from '../components/ui/input';

// Después (solo conoce la carpeta)
import {showToast, createInput} from '../components/ui';
```

Esto es especialmente valioso cuando se mueven archivos (Fase 1: dropdown-menu, Fase 5: settings). Si los consumidores importan desde el barrel, mover el archivo físico no rompe imports.

---

## 9. Referencias

- Auditoría v3 hallazgos: `Agente/documentacion/arquitectura/auditoria-arquitectura-v3-2026-07-30.md` (§2.10, §2.11)
- Calidad: `quality.config.json` + `npm run task:check -- 297A-11`
- Identidad OS: `Agente/documentacion/design-system/manual-identidad-visual-os-2026-07-29.md`
- Arquitectura: `Agente/documentacion/arquitectura/manual-arquitectura-wandorius-2026-07-29.md`
- Plan maestro: `Agente/planes/plan-escritorio-persistente-cuentas-admin-apps-2026-07-29.md`
