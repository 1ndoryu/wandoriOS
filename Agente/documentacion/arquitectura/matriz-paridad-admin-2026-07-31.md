# Matriz de paridad — Admin legacy → Programas del OS

> **Fecha:** 2026-07-31
> **Epic:** 297A-14 — Programas editoriales (Fase 5: Paridad y cierre)
> **Objetivo:** congelar la matriz ANTES de retirar cada superficie legacy; ningún
> retiro ocurre sin paridad verificada y rollback documentado (manual §10, roadmap §297A-16).
> **Plan:** `Agente/planes/plan-programas-editoriales-2026-07-31.md`

## 1. Superficies del Admin legacy vs programas

| Superficie legacy | Archivo | Programa del OS | Estado |
|---|---|---|---|
| Tabs/orquestación | `pages/admin.ts` | App `admin` (registro lazy) | ✅ Migrado (solo orquesta; no crea ventanas/editor) |
| Editor de artículos (Tiptap) | `pages/admin-articles.ts` (legacy) | App `article-editor` | ✅ Migrado F1 |
| Listado de artículos | `pages/admin-articles.ts` | Orquestación en `admin` (tab articulos) | ✅ Migrado F1 |
| Editor de proyectos | `pages/admin-projects.ts` (modal legacy) | App `project-editor` | ✅ Migrado F2 |
| Listado de proyectos | `pages/admin-projects.ts` | Orquestación en `admin` (tab proyectos) | ✅ Migrado F2 |
| Editor de productos | `pages/admin-products.ts` (modal legacy) | App `product-editor` | ✅ Migrado F3 |
| Listado de productos | `pages/admin-products.ts` | Orquestación en `admin` (tab productos) | ✅ Migrado F3 |
| Biblioteca de media | (no existía en Admin legacy) | App `media-library` | ✅ Migrado F4 |
| Fuentes/tamaños | `admin.ts` tab fuentes + `settings-panel.ts` | Estáticos (297A-29) + app `settings` | ✅ Migrado F1/F29; alias `font-panel.ts` retirado en 018A-44 |
| About content | `admin.ts` tab sitio | App `about` + `article-editor` (alias) | ✅ Migrado F1 |
| Estadísticas | `admin.ts` tab estadisticas | App `analytics` | ✅ Migrado 297A-16 |
| Login legacy | `pages/login.ts` + wrapper | App `account` (login en ventana) | ✅ Migrado 297A-13 |

## 2. Acciones por tipo de recurso (declaradas vs ejecutables)

`resource-type-registry.ts` declara las acciones por `ResourceKind`; el menú contextual
proyecta CommandRegistry. La paridad exige que toda acción declarada tenga un comando
que la ejecute con capacidades server-side.

| Acción | Artículo/About | Proyecto | Producto | Media (image/audio/video) | Comando |
|---|---|---|---|---|---|
| open | ✅ | ✅ | ✅ | ✅ | dblclick → `openAppWindow` (public locator) |
| preview | ✅ | ✅ | ✅ | ✅ | Reader/Finder (canPreview) |
| edit | ✅ | ✅ | ✅ | ⛔ (sin editor) | **`resource:edit` (F5)** |
| publish | ✅ | ✅ | ✅ | ⛔ | **`resource:publish` (F5)** |
| unpublish | ✅ | ✅ | ✅ | ⛔ | **`resource:unpublish` (F5)** |
| trash | ✅ | ✅ | ✅ | ✅ | `workspace:trash` (papelera del workspace) |
| restore | ✅ | ✅ | ✅ | ✅ | `workspace:restore` |
| download | ⛔ | ⛔ | ✅ (F3 declarado) | ✅ | Finder (grant futuro 297A-15) |
| properties | ✅ | ✅ | ✅ | ✅ | `resource:properties` → App `properties` (018A-39) |

## 3. Estados editoriales por recurso

| Recurso | draft/private/public | publish (editorial) | preview | rollback | autosave | papelera |
|---|---|---|---|---|---|---|
| Artículo | `status` draft/published + envelope | `article-editor` botón | Reader | — (workspace) | **✅ F5 autosave borrador** | `workspace:trash` + delete |
| About | alias público | `article-editor` | Reader | — | **✅ F5** | protegido (sin trash) |
| Proyecto | `is_visible` + envelope | `project-editor` | Projects | — | ⏳ (manual save; autosave opcional) | `workspace:trash` + delete |
| Producto | `is_active` + envelope active/public | `product-editor` | Finder tienda | — | ⏳ (manual save) | `workspace:trash` + delete |
| Media | asset_state (processing/clean/rejected) | — | thumbnails | — | — | `media-library` papelera soft delete + restore |

## 4. Retiro gradual (reglas)

1. No retirar `/admin` legacy, rutas JWT, uploads ni CSS legacy hasta verificar paridad y rollback (297A-16).
2. Cada retiro se hace por superficie, con evidencia de que el programa del OS cubre
   el flujo completo (crear, editar, publicar, papelera, error).
3. El menú Admin por capacidades (297A-14 roadmap) sustituirá las tabs de `admin.ts`
   sin ampliarlo; las apps viven en AppRegistry.
4. La app Configuración se conserva (297A-29); no se retira.

## 5. Pendientes de Fase 5 (checklist vivo)

- [x] Congelar esta matriz (este documento).
- [x] Comandos `resource:edit/publish/unpublish` (materializan acciones declaradas).
- [x] Comando `resource:properties` y programa reutilizable de metadatos locales (018A-39).
- [x] Autosave de borrador en `article-editor` (create→update idempotente, teardown).
- [ ] E2E visual desktop/tablet/móvil (apertura, foco, minimizar, cierre, error, transición).
- [ ] Retirar superficies legacy SOLO tras paridad + rollback verificados (297A-16).
