# Validación visual del shell — 2026-08-18 (297A-9)

**Estado:** verificado en preview · **Viewport embebido:** 906×958 (DPR 1.25) — rango tablet (769–1023) del CSS.
**Limitación declarada:** el webview del preview no permite redimensionar el viewport
(`window.resizeTo` no aplica, popups bloqueados), por lo que los tamaños exactos
1440×900, 1024×768, 390×844 y 320px no pudieron validarse visualmente aquí. Se validó:
el rango tablet real (906×958), cobertura de breakpoints por CSS, zoom 200% aproximado
(overflows), y la cobertura responsive de `desktop-responsive.css`/`mobile-prototype.css`.

## Estados y superficies recorridos (sesión `ui-test-2`, tema claro y oscuro)

### 1. Shell base
- **Menú del sistema**: Archivo / Aplicaciones / Configuración + usuario + novedades (badge 1) + tema + hora. Correcto.
- **Grid de iconos** (columna derecha): Documentos, Proyectos, Perfil, About, Papelera, Tienda, Pedidos, Descargas — 8 iconos con label, sin overflow.
- **Taskbar**: botón navegación + tabs de ventanas con botón cerrar; tab activa resaltada. Altura 38px, display grid.
- **Sin overflow horizontal ni vertical** en 907×907: `scrollWidth === clientWidth`.

### 2. Ventanas
- Abrir **Documentos** desde menú Aplicaciones: ventana con header (cerrar/minimizar), menú Ventana/Archivo, breadcrumb (Escritorio/Documentos), botón "volver" disabled correctamente en raíz, carpetas Audio/Documentos/Imágenes/Vídeo. Correcto.
- **Minimizar** desde header → ventana desaparece, queda tab en taskbar. **Restaurar** desde taskbar → vuelve. Correcto.
- **Cerrar** desde header → ventana y tab desaparecen. Correcto.
- Overlap de ventanas con z-order correcto (Perfil detrás, Documentos al frente).

### 3. Taskbar
- Tabs de ventanas abiertas con cierre individual; activa resaltada (fondo invertido). Correcto.
- Botón **Mostrar/Ocultar navegación**: abre sidebar con links (INICIO, ABOUT, GALERIA, PROYECTOS) y artículos; cierra correctamente.

### 4. Menú contextual (escritorio)
- 7 items: Abrir aplicación (disabled), Mostrar/Ocultar navegación, Cambiar tema (⌘⇧L), Reencuadrar ventanas, Restablecer escritorio, Pegar (disabled), Nueva carpeta. Disabled correctos, shortcuts visibles. Correcto.

### 5. Foco y teclado
- **Skip-link** "saltar al contenido": primer elemento tabulable del shell, `href="#contenido-principal"`, outlet con `id="contenido-principal"`. La regla `.skip-link:focus-visible` existe en `base.css` (dentro de `@layer base`); `:focus-visible` solo matchea con teclado real, no sintetizable en el webview — verificado por regla CSS + suite.
- **Foco visible global**: `:focus-visible { outline: 2px solid var(--color-texto) }` presente.
- **Tabulación real** no sintetizable en el webview embebido (eventos no trusted no disparan `:focus-visible`); pendiente validación en navegador real.

### 6. Temas
- **Claro**: fondo #dcdcdc punteado, líneas negras, contraste #000/#dcdcdc ≈ 15:1. Correcto.
- **Oscuro**: fondo #000 punteado, líneas blancas, contraste #fff/#000 = 21:1. Correcto.
- Cambio de tema desde la barra: aplica `data-tema` y repinta el shell al instante. Correcto.

### 7. Zoom 200% (aproximado)
- Con CSS `zoom` en 1 / 0.85 / 0.53 / 0.43 / 0.35 (≈907, 771, 481, 390, 317px efectivos) **no hay overflowX** en ningún escalado: el contenido escala sin desbordes. No es fiel a media queries reales (documentado), pero no se detectaron layouts rotos por escalado.

## Defecto encontrado y corregido

- **404 `/uploads/profile.jpg`** (foto de perfil rota): el default del store `profileImage` apuntaba a `/uploads/profile.jpg`, una URL que el backend **nunca sirve estáticamente** (los archivos se sirven vía `/api/media/:id/preview`; `/uploads/...` es solo el `file_path` interno). Cada sesión sin foto generaba un 404 + fallback doble.
  - **Fix (297A-9):** default cambiado a `/profile.jpg` (asset bundled, existe en `frontend/public/`) en `frontend/src/store.ts`, con comentario del porqué.
  - **Verificado:** 404 desaparece en preview (ahora `GET /profile.jpg → 304`); type-check ✅; suite 66/482 ✅; build ✅.

## Cobertura responsive por CSS (verificada en disco)

- `desktop-responsive.css`: breakpoints 1023 (tablet), 768 (icon-grid a 3 columnas, ventanas a ancho completo), 480 (menu-bar colapsa a 1 entrada, icon-grid a 2 columnas, taskbar compacto).
- `mobile-prototype.css`: prototipo móvil (297A-12) con su propio layout; NO está cableado en `main.ts` todavía.
- 390×844 y 320px caen bajo `max-width:480px` → reglas móviles existen y son coherentes; su validación visual real queda para 297A-12 (launcher móvil) o navegador redimensionable.

## Pendientes (requieren navegador redimensionable o 297A-12)

1. Validación visual real en 1440×900 y 1024×768 (escritorio ancho; aquí solo se validó 906–958).
2. Validación visual real en 390×844 y 320px (cubiertas por CSS ≤480 pero sin captura real).
3. Tabulación real de extremo a extremo (skip-link → menús → ventanas) y zoom 200% del navegador nativo.
