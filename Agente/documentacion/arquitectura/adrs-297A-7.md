# ADRs — 297A-7 Decisiones bloqueantes

> **Fecha:** 2026-07-29
> **Epic:** 297A-7 — ADRs y seguridad inmediata
> **Estado:** aprobadas

## ADR-001: Estrategia de SEO e indexabilidad

**Contexto:** wandori.us es un SPA Vanilla TypeScript + Vite con backend Axum. Las rutas públicas (artículos, proyectos, about) deben ser indexables por buscadores. La arquitectura exige que "una SPA cliente por sí sola no cierra SEO".

**Opciones evaluadas:**
- a) SSR completo con framework (Next.js, etc.) — rompe el stack Vanilla TS.
- b) Prerender estático en build — no escala con contenido dinámico.
- c) **Backend sirve HTML semántico para rutas públicas; OS como mejora progresiva.**

**Decisión:** Opción c — Hybrid server-rendered shell.

- El backend Axum sirve HTML semántico con `<title>`, canonical, Open Graph y Schema.org para `/`, `/article/{slug}`, `/about`, `/projects`.
- El frontend OS se carga como mejora progresiva sobre ese HTML.
- `GET /api/bootstrap` devuelve datos; el HTML inicial no depende de JS para ser legible.
- Sitemap generado server-side (ya existe `/api/sitemap.xml`).

**Consecuencias:**
- El handler de rutas públicas debe distinguir request HTML (navegador) de API (fetch).
- Se necesita un template mínimo de HTML en el backend o un motor ligero.
- El contenido del OS reemplaza el HTML progresivamente al cargar JS.
- Rollback: eliminar el render server-side y volver a SPA pura.

**Tareas afectadas:** 297A-9 (runtime), 297A-17 (SEO final).

---

## ADR-002: Storage privado y serving autorizado

**Contexto:** Actualmente `/uploads` se sirve estáticamente sin autenticación. Los productos tienen `download_path` que expone rutas directas. Los entregables de pago nunca deben vivir en almacenamiento público.

**Opciones evaluadas:**
- a) S3/R2 con presigned URLs — requiere proveedor externo, más complejidad.
- b) **Storage local privado con endpoint de serving autorizado.**
- c) Proxy Nginx con auth subrequest — requiere config de infraestructura.

**Decisión:** Opción b — Local private storage.

- Eliminar `ServeDir` público de `/uploads`.
- Crear `GET /api/media/{id}/serve` que valida auth/ownership antes de servir.
- `download_path` en products almacena ruta interna, nunca se expone en DTO público.
- Endpoint de descarga de productos valida entitlement + grant antes de servir.
- Para previews públicas (imágenes de artículos publicados), servir a través del mismo endpoint con predicado de visibilidad.

**Consecuencias:**
- Las URLs de imágenes en artículos públicos cambian de `/uploads/filename` a `/api/media/{id}/serve`.
- Se necesita migrar `file_path` existente a rutas internas.
- Los grants de descarga se implementan en297A-15.
- Rollback: reactivar `ServeDir` público.

**Tareas afectadas:** 297A-7.6 (quitar uploads público), 297A-10 (recursos), 297A-15 (comercio).

---

## ADR-003: Modalidad de pago Stripe

**Contexto:** El proyecto vende productos digitales de bajo volumen. Ya existe implementación de Stripe Checkout Sessions con redirect. La arquitectura sugiere Payment Element integrado como preferencia, con redirect como fallback.

**Opciones evaluadas:**
- a) Payment Element embebido — más complejo, requiere Stripe.js en el frontend.
- b) **Stripe Checkout redirect — simple, seguro, ya implementado.**
- c) Payment Element con Checkout como fallback — sobredimensionado para el volumen.

**Decisión:** Opción b — Mantener Stripe Checkout redirect.

- Checkout Session ya está implementada y verificada.
- El redirect a Stripe maneja toda la complejidad de pago (3DS, métodos, etc.).
- El success/cancel URL redirige al OS.
- Payment Element se reconsidera si el volumen justifica UX integrada.

**Consecuencias:**
- No se necesita Stripe.js en el frontend.
- El flujo es: producto → backend crea sesión → redirect a Stripe → redirect back → webhook confirma.
- Rollback: N/A, ya es el comportamiento actual.

**Tareas afectadas:** 297A-7.8 (checkout seguro), 297A-15 (comercio completo).

---

## ADR-004: Retención y purga de recursos

**Contexto:** El sistema maneja artículos, productos, órdenes y assets. Se necesita política de retención para borrados, órdenes antiguos y assets comprados.

**Opciones evaluadas:**
- a) Hard-delete inmediato — pierde auditoría y rompe referencias.
- b) Soft-delete universal con purge periódico — complejidad innecesaria para bajo volumen.
- c) **Soft-delete para recursos editoriales, órdenes inmutables, retención configurable.**

**Decisión:** Opción c — Soft-delete selectivo.

- Recursos editoriales (artículos, proyectos, productos): soft-delete con campo `deleted_at`. Restauración posible dentro de ventana de retención.
- Órdenes: inmutables una vez creadas. Estado cambia solo por transiciones válidas (pending → paid → delivered → refunded).
- Assets descargados: entitlement persistente; el comprador siempre puede re-descargar la versión adquirida.
- Purge de soft-deleted: configurable, default 90 días. Solo admin con capacidad explícita.
- Audit log: inmutable, nunca se purga.

**Consecuencias:**
- Se necesita columna `deleted_at` en articles, projects, products (futuro: 297A-10).
- Los endpoints públicos deben filtrar `deleted_at IS NULL`.
- Las órdenes no se borran, solo cambian de estado.
- Rollback: eliminar `deleted_at` y volver a hard-delete.

**Tareas afectadas:** 297A-10 (recursos), 297A-15 (comercio), 297A-16 (retiro legado).
