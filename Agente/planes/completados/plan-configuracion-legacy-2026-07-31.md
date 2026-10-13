# Plan: app Configuración legacy (conservada) — fuentes/tamaños estáticos + Perfil configurable por admin

> **Epic:** 297A-4 (OS persistente) · **Tarea:** 297A-29 (pendiente de roadmap)
> **Fecha:** 2026-07-31 (renombrado el 2026-07-31: ya NO es "retiro")
> **Estado:** Fases 1-3 completadas (commits 297A-29 F1/F2/F3); Fase 4 redefinida por decisión del usuario
> **Próximo paso:** Fase 4 = conservar la app Configuración y dejarla pendiente de escalar a otra cosa en el futuro (ver §4). El alias legacy `font-panel.ts` fue retirado en 018A-44.
> **Archivo de completados:** `Agente/completados/tareas-2026-07-31.md`
>
> **Cambio de alcance (2026-07-31, usuario):** "no eliminemos la app de configuración, dejemos pendiente escalarla a otra cosa después". La app Configuración NO se borra; queda como está y su evolución (panel de ajustes del sistema u otra cosa) se decide en el futuro. Este archivo antes se llamaba `plan-retiro-configuracion-legacy-2026-07-31.md`.

---

## 1. Objetivo y límites

**Objetivo:** dejar fijas las fuentes/tamaños (el OS queda con **JetBrains Mono en todo y tamaños fijos** en `variables.css`) y mover la configuración de **Perfil** (foto, tamaños del avatar, borde, enlaces sociales, layout de redes) a la ventana Perfil con un **botón en el toolbar visible solo para admins**. La app "Configuración" **se conserva** tal cual (registro `settings`, nodo admin, botón de menú y tab `'fuentes'` de Admin); su escalado futuro a otra cosa (p. ej. panel de ajustes del sistema) queda pendiente y se decide más adelante.

**Límites explícitos:**
- NO se implementa todavía el panel de control del usuario para cambiar fuentes. Se deja nota como trabajo futuro (fase 5) para cuando exista un panel de control de usuario con buena arquitectura.
- NO se tocan: `about_content`, `show_entries_on_home`, `social_links`, `redes_layout`, `profile_image`, `registration_enabled` (siguen vivos en Admin/Perfil/backend).
- NO se toca el backend de settings: `GET /api/settings` y `POST /api/admin/settings` se conservan (los consume Perfil para persistir foto/enlaces/borde).
- NO se borra la columna de settings de BD; los tokens huérfanos de fuentes/tamaños quedan inertes (se documenta; limpieza opcional futura).
- NO se tocan cambios ajenos en working tree (297A-14 editor de proyectos: backend projects + API client/types). Se commitearán por separado si el usuario lo autoriza.
- Deploy sigue fuera de alcance.

## 2. Contexto verificado (evidencia 2026-07-31)

- La app `settings` se registra en `frontend/src/features/runtime/app-registration.ts:117-132` (`registerLazy`, `requires: 'admin'`, sin deep link). Se abre por menú (`desktop-menu-bar.ts:224-229`), icono admin del escritorio (`default-release.ts:39-43` `ADMIN_NODES.settings`) y tab `'fuentes'` de `pages/admin.ts:63`.
- Componentes en `frontend/src/features/settings/`: `settings-panel.ts` (entrada conservada de la app Configuración), `profile-settings.ts`, `settings-repo.ts` (persistencia debounced), `social-links.ts` (editor de enlaces) y el primitive compartido `components/ui/slider.ts`.
- **Perfil es una shell window** (`registerShellWindow`, `instanceId 'shell-profile'`, `desktop-shell.ts:40-54`), NO una app del registry. Comparte el mismo elemento en desktop y móvil (`main.ts:143`). Consume `profileImage`, `socialLinksStore`, `redesLayoutStore`.
- **Toolbar con gating por capacidad YA EXISTE**: `createAppToolbar` (`desktop-window.ts:110-149`) construye `CommandContext { capability: authStore.get().capability }` y omite comandos cuyo `isAvailable(ctx)` devuelve `{state:'hidden'}`. Ningún comando usa todavía `ctx.capability`. **Hueco:** la capability se captura UNA vez al crear la ventana; no reacciona a login/logout en vivo.
- **Bug borde confirmado:** `.desktop-profile-window .profile-foto { border: var(--sistema-borde) }` (`desktop-window.css:104-106`) sobreescribe `--profile-border` que el checkbox escribe; mayor especificidad que `layout.css:118`. El checkbox solo funcionaría en el layout legacy en desuso.
- **Bug nav width:** el valor quedó estático en `variables.css` (`--nav-width: 360px`); ya no existe slider de fuentes/tamaños que pueda sobrescribirlo.
- El OS ya usa `--fuente-sistema` (JetBrains Mono) en todo el chrome; lo configurable solo afecta al **layout legacy** (sidebar/nav, profile, entradas). El `fontStore` (`store.ts:107-159`) sobreescribe tokens en runtime desde BD (`main.ts:107` llama `await loadSavedFonts()`).
- `prerendered/` es código muerto de Nakomi Studio, no se relaciona.

## 3. Dependencias

- Fase 2 (toolbar reactivo) **antes** de fase 3 (botón admin en Perfil): el botón necesita el mecanismo de toolbar solo-admin.
- Fase 3 (mover perfil) completa; ya no condiciona ninguna eliminación porque la Fase 4 dejó de ser un borrado (2026-07-31): la app Configuración se conserva.
- Fase 1 (estático) puede ejecutarse primero o en paralelo con 3; no depende de 2/3.
- La 297A-28 (ruta `POST /api/admin/settings` ya corregida en `settings.service.ts`) es prerequisito funcional: el guardado de Perfil depende de ella.

## 4. Fases

### Fase 1 — Fuentes/tamaños estáticos (JetBrains en todo)

- [x] Neutralizar `fontStore`: el store solo conserva configuración de perfil/redes; ningún suscriptor inyecta tokens de fuentes o tamaños.
- [x] Dejar de llamar `loadSavedFonts()` en `main.ts`: el arranque carga únicamente `loadProfileSettings()`.
- [x] Fijar tokens en `variables.css`: JetBrains Mono, tamaños estáticos y `--nav-width: 360px`.
- [x] Migrar consumidores legacy de tokens configurables a los tokens estáticos; los alias conservados son inertes y no reciben configuración de BD.
- [x] Eliminar `font-constants.ts`/`font-helpers.ts` y retirar la lógica de Fuentes/Tamaños; el acceso visible conservado delega al panel de settings sin selector de fuentes.
- [x] Mantener `settings-repo.ts` únicamente para perfil, redes, imagen y preferencias de inicio.
- **Gate F1:** type-check, Vitest (ajustar tests que dependan de fontStore dinámico), `task:check`; visual: el OS y las páginas renderizan con JetBrains Mono y tamaños fijos sin regresión.

### Fase 2 — Toolbar reactivo a capacidad + comando admin-only genérico

- [x] `createAppToolbar` reacciona a cambios de `authStore` y reconstruye el toolbar cuando cambia `capability`.
- [x] El comando admin-only genérico usa `CommandContext.capability` y no una rama hardcodeada del shell.
- [x] Test de toolbar: una ventana abierta actualiza la acción al pasar de invitado a admin y de vuelta.
- **Gate F2:** type-check, Vitest, `task:check`; visual: abrir ventana como invitado (sin item) y como admin (item visible) sin recargar.

### Fase 3 — Perfil configurable desde la ventana Perfil (solo admin)

- [x] Extraer controles del Perfil a `frontend/src/features/settings/profile-settings.ts` (foto, tamaños avatar 40–600, borde, enlaces sociales, layout redes).
- [x] Añadir toolbar a la shell window `shell-profile` con el comando admin-only de fase 2.
- [x] Montar `profile-settings` dentro de la ventana Perfil, reutilizando las recetas compartidas y sin modal global.
- [x] **Fix borde:** `.desktop-profile-window .profile-foto` respeta `--profile-border`.
- [x] Conservar guardado de `profile_image`, `social_links`, `redes_layout`, tamaños avatar y borde vía `SettingsService.save`.
- **Gate F3:** type-check, Vitest (tests del nuevo panel + regresión del fix borde), `task:check`; visual: admin ve botón "Configurar" en toolbar de Perfil, abre el panel, cambia foto/borde/enlaces y persiste tras reload; invitado no ve el botón.

### Fase 4 — (PENDIENTE, NO eliminar) Escalar la app Configuración a otra cosa

**Decisión del usuario (2026-07-31):** la app Configuración NO se elimina. Se conserva tal cual: registro `settings` en `app-registration.ts`, nodo `ADMIN_NODES.settings`, botón de menú y tab `'fuentes'` de Admin. **No ejecutar ninguna acción de borrado.**

- [ ] (FUTURO, sin fecha) Decidir el destino de la app Configuración: convertirla en panel de ajustes del sistema, integrarla en otra app, o mantenerla como está. La decisión la toma el usuario; no inventar alcance.
- [ ] Cuando se decida el destino, actualizar este plan con fases concretas y gate por fase.
- [ ] Mientras tanto: solo mantenimiento reactivo (no agregar lógica nueva al panel conservado; `settings-panel.ts` delega a `profile-settings`).
- **Gate F4:** no aplica hasta que el usuario defina el destino. Estado: pendiente de decisión.

### Fase 5 — (FUTURO, fuera de alcance) Escalar Configuración + panel de fuentes de usuario

- [ ] NOTA: cuando exista un panel de control de usuario con buena arquitectura (posiblemente la propia app Configuración escalada), re-introducir selector de fuente con persistencia de cuenta (reutilizando el transporte de preferencias/overlay de 297A-13). No implementar ahora.

## 5. Gate/criterio de salida por fase

- Cada fase cierra con: `npx tsc --noEmit` limpio (en `frontend/`), `npx vitest run` PASS, `npm run task:check -- 297A-29 --fresh` PASS, y validación visual real en navegador (al menos desktop 1440×900 y móvil 390×844; foco/teclado).
- La tarea NO se archiva hasta que el síntoma reportado se verifique resuelto: sin icono/menú de Configuración, Perfil configurable solo-admin, borde funcional, nav fijo ≥360px, JetBrains en todo.
- Ninguna casilla se marca por intención; solo con evidencia.

## 6. Definition of Done

- [ ] `Configuración` conservada en AppRegistry, escritorio, menú y Admin (NO eliminada); su escalado futuro queda pendiente de decisión del usuario.
- [x] Fuentes/tamaños 100% estáticos (JetBrains Mono + tokens fijos en `variables.css`); sin `fontStore` inyectando variables dinámicas.
- [x] Perfil configurable desde su toolbar con botón admin-only; foto/borde/tamaños/enlaces persisten en BD.
- [x] Toolbar de ventanas reacciona a cambio de capacidad en vivo (mecanismo genérico, no hardcodeado a Perfil).
- [x] Bug borde resuelto; nav width fijo ≥360px.
- [ ] Roadmap actualizado, archivado en completados, commit `297A-29: ...` + push.

## 7. Notas de arquitectura (decisiones)

- **2026-07-31:** la app Configuración se conserva por decisión explícita del usuario ("dejemos pendiente escalarla a otra cosa después"). No hay eliminación ni reescritura; el plan original de retiro queda anulado en su Fase 4.
- El toolbar solo-admin se resuelve con el mecanismo existente de `Command.isAvailable` + `CommandContext.capability`, sin introducir `if (isAdmin)` en el shell (OCP: se extiende por comandos).
- El panel de Perfil reutiliza recetas compartidas del sistema de diseño; no crea recetas visuales locales (regla 9.1).
- La persistencia de perfil conserva `SettingsService.save` (ya corregido a `POST /api/admin/settings` en 297A-28) y `SettingsService.getAll` público para carga.
- Los settings de fuentes/tamaños huérfanos en BD quedan inertes; no se migra ni borra (riesgo bajo, documentado).

## 8. Enlaces

- Guía de apps: `Agente/documentacion/arquitectura/guia-agregar-app-2026-07-31.md`
- Manual de arquitectura: `Agente/documentacion/arquitectura/manual-arquitectura-wandorius-2026-07-29.md`
- Identidad visual (JetBrains Mono): `Agente/documentacion/design-system/manual-identidad-visual-os-2026-07-29.md`
- Plan maestro: `Agente/planes/plan-escritorio-persistente-cuentas-admin-apps-2026-07-29.md`
