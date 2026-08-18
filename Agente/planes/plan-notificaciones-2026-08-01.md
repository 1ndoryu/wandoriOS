# Plan de notificaciones — 2026-08-01

> Estado: entrega server-side y endpoints admin completados; UI admin avanzada y E2E quedan diferidos.

## Objetivo y límites

Avisar de releases públicos sin duplicar el catálogo de workspace ni inventar un canal de publicación paralelo. La primera fase usa el release público como fuente canónica y conserva el estado leído en el navegador.

## Fases

### Fase 1 — Fuente y política local (completada)

- [x] Una notificación estable por `workspace-release:{version}`.
- [x] Solo releases públicos; no exponer drafts, overlays privados ni contenido editorial.
- [x] Estado leído idempotente y acotado a 100 IDs en `localStorage`.
- [x] Error de red visible en la app, sin convertirlo en lista vacía silenciosa.

**Gate:** type-check y suite frontend pasan; no hay endpoint nuevo ni migración que duplicar.

### Fase 2 — Presentación del OS (completada)

- [x] App pública `notifications` con URL `/notifications`.
- [x] Campana Lucide de 1px en barra desktop y launcher móvil.
- [x] Contador de no leídas y apertura de la misma app desde ambos shells.
- [x] Vista accesible con foco, Enter/Espacio y botón de recarga.

**Gate:** app registrada por `AppRegistry`; chrome no conoce la fuente de datos.

### Fase 3 — Cuenta y administración (backend completado)

- [x] Endpoint público y endpoint de lectura por usuario; `notification_reads` sincroniza el estado entre dispositivos.
- [x] Endpoints admin para crear, publicar, archivar y listar avisos; los releases crean el aviso en la misma transacción.
- [x] Política anti-spam por release mediante índice único server-side y límite de lectura pública.
- [x] Panel visual admin dentro de la app Novedades para crear, publicar y archivar avisos sin API manual.
- [ ] Casos E2E: overlay personalizado, logout/login, dos dispositivos y permisos.

**Diferido:** panel visual y E2E; no bloquean continuar con comercio ni el resto del runtime.

## Definition of Done de la fase autónoma

- [x] `npm run task:check -- 297A-21` pasa para el alcance frontend.
- [x] La fuente no crea un segundo estado de publicación.
- [x] El backend no expone drafts y crea avisos de release de forma atómica.
- [x] El roadmap deja explícitos los pendientes que requieren decisión/credenciales.
