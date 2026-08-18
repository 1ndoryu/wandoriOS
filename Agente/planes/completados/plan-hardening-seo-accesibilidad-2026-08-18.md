# Plan — 297A-17: Hardening, SEO y accesibilidad (2026-08-18)

## Objetivo

Cerrar la parte de 297A-17 sin dependencias externas:
1. **SEO**: metadatos estáticos (og/twitter/canonical) en `index.html` y títulos/meta
   dinámicos por ruta pública (login, verify-email, escritorio, 404) reutilizando
   `features/seo/meta.ts` (ya existe para article/about/gallery/projects/checkout).
2. **Accesibilidad**: foco visible global (teclado), `prefers-reduced-motion`,
   skip-link del shell.
3. **Threat review breve** de sesión/CSRF/rate limits, documentado.

## Alcance / no alcance

- **No se repite MFA**: TOTP ya está cerrado en 297A-13 (decisiones registradas).
- **No** se toca backend salvo revisión documental; sin migraciones nuevas.
- **No** se cambia el manual visual ni se rediseña: solo foco visible y reduced-motion.

## Pasos

1. `index.html`: añadir og:title/description/type/url/image, twitter:card, canonical
   y locale estáticos (fallback; el runtime los actualiza al navegar).
2. `features/seo/page-meta.ts`: suscriptor de rutas que llama a `updateMeta` con el
   título/descripción por ruta pública:
   - `/login` → "cuenta · inicia sesión"
   - `/verify-email` → "verificar correo"
   - `/` (escritorio/home) → "escritorio"
   - 404 → "página no encontrada"
   Se conecta en `main.ts` (o desde `router.onNavigate`).
3. Accesibilidad:
   - `base.css`: `:focus-visible` global con outline visible (respetando el token
     de borde/foco del tema); revisar que `reset.css` no lo elimine.
   - `prefers-reduced-motion`: media query global que reduzca transiciones/animaciones.
   - Skip-link: enlace "saltar al contenido" al inicio del shell (desktop + móvil).
4. Threat review: documento breve en `Agente/documentacion/seguridad/` o completada,
   revisando sesión (TTL, HttpOnly/SameSite), CSRF (doble cookie/header) y rate
   limits (login/auth-action) con casos negativos. Se enlaza desde el roadmap.
5. Tests: unit del `page-meta` (rutas→meta esperada), type-check, build, suite
   frontend completa, preview.
6. Commit local sin push.

## Definition of Done

- `index.html` con og/twitter/canonical estáticos.
- Título/meta correctos en login, verify-email, escritorio y 404 (verificado en
  navegador o test DOM).
- Foco visible al navegar con teclado; reduced-motion respetado; skip-link presente.
- Threat review documentado y enlazado desde el roadmap.
- Tests + type-check + build verdes; commit local sin push.
