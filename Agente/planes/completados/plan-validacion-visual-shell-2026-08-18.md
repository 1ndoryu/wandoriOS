# Plan 297A-9 — Validación visual completa del shell

**Fecha:** 2026-08-18 · **Estado:** activo · **ID roadmap:** 297A-9

## Objetivo
Recorrer el chrome base del shell (ventanas, taskbar, menú contextual, foco,
estados) en los viewports y modos definidos, capturar y documentar los
resultados, arreglar defectos de arreglo claro y dejar documentados los que
requieran decisión.

## Alcance
- Viewports: 1440×900, 1024×768, 390×844, 320px.
- Modos: claro/oscuro, zoom 200%, navegación por teclado.
- Superficies: shell/escritorio, ventanas (abrir/mover/redimensionar/enfocar),
  taskbar, menú contextual, foco visible, estados hover/active/disabled.

## No alcance
- Cambios de diseño/rediseño (solo fixes de regresión clara).
- Móvil tipo launcher (297A-12, aparte).
- Accesibilidad profunda (297A-17 ya dio base CSS; aquí solo validación visual).

## Fases verificables
1. Sesión y shell base OK (login, escritorio sin errores de consola).
2. 1440×900: captura shell, ventana, taskbar, menú contextual, foco.
3. 1024×768 + claro/oscuro: mismas superficies.
4. 390×844 y 320px: responsive, overflows, taskbar compacto.
5. Zoom 200% + teclado: foco visible, skip-link, tabulación.
6. Fixes de defectos claros (test si aplica) + type-check/tests/build.
7. Documentación final con capturas → `Agente/documentacion/visual-shell/`.

## DoD
- Capturas y observaciones documentadas por viewport/modo.
- Sin regresiones del chrome base: tests frontend, type-check y build OK.
- Defectos con decisión pendiente listados en el documento y en roadmap.

## Evidencia
- Capturas: `Agente/documentacion/visual-shell/capturas/`.
- Observaciones: `Agente/documentacion/visual-shell/validacion-2026-08-18.md`.
