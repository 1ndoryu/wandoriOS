# Plan 018A-90 — Gestión de carpetas en el Finder (cortar, copiar, eliminar, renombrar, pegar en, abrir)

- **Tarea:** 018A-90 — menú contextual sobre carpetas dentro del Finder con acciones de gestión.
- **Fecha:** 2026-08-01
- **Estado:** completado (2026-08-01) — ver `Agente/completados/tareas-2026-08-01.md` entrada 018A-90
- **Epic:** 297A-4 — OS persistente, cuentas, programas y comercio.

## Objetivo

Que el clic derecho **sobre una carpeta dentro del Finder** ofrezca las acciones de gestión que hoy solo existen en el escritorio (contexto `'icon'`): **Abrir, Renombrar, Cortar, Copiar, Pegar en, Eliminar**. Además, eliminar carpetas debe ser seguro (confirmación + subárbol restaurable desde la papelera) y `Ctrl+V` debe pegar en la carpeta abierta del Finder, no en el escritorio.

## Diagnóstico (auditoría 2026-08-01)

El CommandRegistry y el overlay **ya soportan** cortar/copiar/borrar cualquier nodo (carpetas incluidas); el clipboard opera con `NodeId[]` y `workspace:trash` usa `tombstoneNode()`. El problema es de **exposición y semántica de contextos**:

1. Carpetas dentro del Finder → contexto `'folder'` (`finder-preview.ts:230`), pero `workspace:trash/copy/cut` solo están en `'icon'` (`workspace-commands.ts:38,158,182`). Escritorio/launcher mandan carpetas a `'icon'` → ahí sí funcionan.
2. Contexto `'folder'` quedó poblado con acciones de **creación** (que pertenecen al fondo `'finder'`) en vez de acciones **sobre la carpeta**.
3. Renombrar no existe como comando ni mutación, pese a que `fieldOverrides.label` ya lo soporta (`types.ts:76`).
4. `tombstoneNode` no tumba hijos ni pide confirmación; el merge elimina descendientes en cascada (`merge.ts:23-33`) y la papelera solo muestra la raíz → borrar una carpeta es irreversible desde la UI.
5. `Ctrl+V` sin `ctx` pega siempre en el escritorio (`keyboard-handler.ts`, `workspace-commands.ts:226-232`).
6. `finder:new-folder` y `workspace:create-folder` duplicados con contextos disjuntos.

## Decisiones de diseño (delegadas por el usuario: "planifica bien")

- **Menú sobre carpeta (`'folder'`) = solo acciones sobre la carpeta:** Abrir, Renombrar, Cortar, Copiar, Pegar en (si hay clipboard), Eliminar. Las acciones de creación quedan exclusivamente en el **fondo** (`'finder'`), que ya es su lugar semántico.
- **Borrado seguro:** `workspace:trash` sobre carpeta pide confirmación avisando que elimina su contenido y **tumba el subárbol de forma explícita** (tombstones recursivos) para que la papelera pueda restaurar cada nodo. `restoreNode` sobre una carpeta restaura su subárbol tumbado.
- **Consolidación:** un único `workspace:create-folder` con `contexts: ['desktop','icon','finder']`; `finder:new-folder` se retira o delega (evitar duplicado). (Se evaluará al tocar `toolbar-commands.ts`; si el desmontaje es invasivo, se deja el duplicado documentado como TODO — no bloquear el bloque.)
- **`Ctrl+V` con destino:** el keyboard handler construye `ctx` con el target de la carpeta abierta del Finder (ventana enfocada `appId:'finder'`, `folderId` expuesto por la app) y `workspace:paste` pega en ese destino; sin Finder enfocado, desktop (comportamiento actual).

## Fases

### Fase 1 — Exponer gestión de nodos en contexto `'folder'`
- [x] Ampliar `contexts` de `workspace:trash`, `workspace:copy`, `workspace:cut` a `['icon','folder']`.
- [x] Añadir comando `workspace:open-folder` (Abrir) para navegar a la carpeta dentro del Finder (o verificar si ya existe mecanismo vía `navigate`/dblclick y reutilizarlo).
- [x] Ajustar `workspace:paste` para que acepte target carpeta explícito y "Pegar en" funcione en el contexto `'folder'`.
- **Gate:** menú sobre carpeta muestra Abrir/Renombrar/Cortar/Copiar/Pegar en/Eliminar; crear permanece en el fondo. — CUMPLIDO (validado en navegador).

### Fase 2 — Renombrar
- [x] Añadir mutación `renameNode(nodeId, label)` en `overlay-mutations.ts` escribiendo `fieldOverrides[id].label`.
- [x] Añadir comando `workspace:rename` con `undoPolicy:'local'`, prompt de texto, `contexts:['icon','folder']`.
- **Gate:** renombrar carpeta y recurso/atajo persiste en overlay y sobrevive reload. — CUMPLIDO (showPrompt validado en navegador; rename visible tras recargar).

### Fase 3 — Borrado seguro de carpetas
- [x] `tombstoneNode` → variante recursiva (`tombstoneSubtree`) que tumba el subárbol en `overlay.tombstones` cuando el nodo es carpeta.
- [x] `workspace:trash` pide confirmación si el target es carpeta (aviso de contenido).
- [x] `restoreNode` restaura subárbol tumbado de la carpeta (recursivo sobre release tree).
- [x] Verificar papelera: muestra carpeta y (opcionalmente) descendientes; restaurar raíz devuelve el subárbol.
- **Gate:** borrar carpeta con hijos exige confirmación; restaurar desde papelera recupera el contenido; sin confirmación no se borra. — CUMPLIDO (validado en navegador: confirmación + restauración del subárbol).

### Fase 4 — `Ctrl+V` con destino (carpeta abierta del Finder)
- [x] Keyboard handler construye `ctx` con target de la carpeta abierta (ventana enfocada Finder → `folderId`).
- [x] `workspace:paste` usa ese target; sin Finder enfocado pega en desktop.
- **Gate:** `Ctrl+V` dentro de una carpeta abierta pega en ella; fuera del Finder pega en desktop. — CUMPLIDO (validado en navegador: copia en Documentos, Ctrl+V en Imágenes).

### Fase 5 — Validación y cierre
- [x] `get_errors` sobre archivos tocados.
- [x] Prueba en navegador (Finder → clic derecho carpeta: menú completo; borrar con confirmación; restaurar en papelera; Ctrl+V).
- [x] Quality gate `npm run task:check -- 018A-90`.
- [x] Archivar en `Agente/completados/`, actualizar roadmap, commit y push.

## Dependencias

- Ninguna bloqueante. La tarea toca solo frontend (`commands/*.ts`, `overlay-mutations.ts`, `keyboard-handler.ts`, `finder-preview.ts`, `trash-preview.ts`).
- **NO tocar `frontend/src/main.ts`** (cambios sin commitear de otro agente).

## Criterio de salida

El clic derecho sobre una carpeta dentro del Finder ofrece gestión completa (Abrir/Renombrar/Cortar/Copiar/Pegar en/Eliminar); borrar una carpeta con contenido pide confirmación y es restaurable desde la papelera; `Ctrl+V` pega en la carpeta abierta; el gate pasa; verificado en navegador.
