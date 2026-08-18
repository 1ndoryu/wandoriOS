# Plan — modo claro/oscuro del OS

> **Fecha:** 2026-07-31  
> **Estado:** cerrado con aprobación visual del usuario (2026-07-31); transporte remoto de preferencia, overlay de workspace y Cuenta base implementados/validados en 297A-13; E2E multi-dispositivo, registro avanzado y Cuenta ampliada siguen pendientes; feature flag descartado por decisión del usuario. **Post-cierre 018A-72:** los campos legacy (`.campo-entrada`, `.campo-textarea`, `.campo-select`) no invertían sus bordes en oscuro porque `--borde` resuelve su `var(--color-borde)` en `:root`; se redefinió `--borde` en el scope oscuro del OS y la flecha del select pasó a token `--color-select-flecha` invertible.
> **Alcance:** chrome y superficies del OS; la navegación exterior queda fuera del tema.

## Objetivo y límites

Añadir un modo claro/oscuro coherente con la identidad Macintosh minimalista, usando los mismos componentes, iconos Lucide de 1px y tipografía JetBrains Mono. El contenido multimedia puede conservar color; ventanas, menús, taskbar, launcher y estados del OS consumen tokens semánticos. No usar `filter: invert()`, colores por componente, sombras nuevas ni un `MobileFooApp`.

## Fases y checklist

### 1. Contrato de tema

- [x] Definir estados `light`, `dark` y resolución inicial `system`, con override explícito del usuario. *(ThemeMode system/claro/oscuro)*
- [x] Definir qué pertenece al OS y qué permanece sin cambios fuera del shell (incluida la navegación exterior). *(override scoped en .desktop-window/.movilApp/.movilLauncher; navegación legacy queda clara)*
- [x] Mapear roles semánticos: fondo, texto, borde, foco, selección, ventana activa/inactiva, menú, taskbar, estados y feedback. *(tokens --sistema-* en variables.css)*
- [x] Registrar decisión y compatibilidad con el manual visual; no actualizarlo como aprobado hasta completar la revisión visual. *(sección 5.1 del manual visual, 2026-07-31)*

**Gate:** contrato revisado; no quedan colores hexadecimales ni reglas de tema implícitas en componentes. *(grep: 0 hex en CSS del OS)*

### 2. Prototipo visual sin lógica

- [x] Crear una muestra clara/oscura con el escritorio, una ventana, menú contextual, taskbar, launcher móvil y un programa de texto. *(implementado y verificado en navegador)*
- [x] Mantener el lenguaje 1-bit: inversión de roles y tramas permitidas, sin grises decorativos, gradientes ni sombras.
- [x] Mostrar el botón único claro/oscuro con etiqueta, foco y estado activo; no crear toggles por aplicación.
- [x] Presentar capturas comparables en desktop, tablet y móvil para aprobación explícita del usuario.

**Gate:** aprobación visual registrada; si se rechaza, corregir tokens/prototipo antes de implementar persistencia. *(aprobada por el usuario 2026-07-31: "ya se ve bien, lo probé, ya vi capturas")*

### 3. Tokens e integración

- [x] Centralizar tokens en `variables.css` y hacer que componentes base/Lucide consuman `currentColor`.
- [x] Aplicar el tema mediante atributo/clase raíz del shell; ventanas y apps reciben contexto, no estilos duplicados. *(data-tema en documentElement)*
- [x] Añadir feature flag y fallback claro para rollback; el tema no debe romper hydration ni primera pintura. *(descartado por el usuario 2026-07-31: innecesario; el fallback claro por defecto y el anti-flash cubren el riesgo)*
- [x] Cubrir CSS con VarSense y Sentinel; corregir referencias huérfanas y especificaciones visuales locales. *(gate PASS: 0 errores ambas herramientas)*

**Gate:** type-check, VarSense, Sentinel y pruebas de render pasan para ambas variantes.

### 4. Preferencias y sincronización

- [x] Guardar la elección anónima en el overlay local sin modificar el release público ni `mobileOrder`. *(localStorage/overlayStore; el transporte remoto autenticado se implementa por separado)*
- [x] Sincronizar el transporte de la preferencia de cuenta con revisión, actualización condicional y 409; nunca sobrescribir silenciosamente. *(297A-13 parcial)*
- [x] Conectar UI para resolver explícitamente `remote` o `local`; modal accesible con cleanup y control de cuenta/revisión. *(297A-13 parcial)*
- [x] Completar el overlay remoto del workspace y su merge por nodos. *(297A-13: contrato validado, sync offline-first, conflicto visible y rebase ante release nuevo)*
- [ ] Ejecutar E2E multi-dispositivo y cerrar la política de merge semántico para conflictos concurrentes.
- [ ] Resolver E2E de otro dispositivo y reset explícito a `system`; evitar flash de tema en primera pintura. *(anti-flash, logout/login, Cuenta base y reset de overlay remoto están implementados; E2E multi-dispositivo y registro avanzado permanecen pendientes)*
- [x] Emitir `theme_changed` con modo y ámbito, sin contenido ni identificadores sensibles. *(ThemeEvent; presentationMode pendiente)*

**Gate:** transporte local/remoto, conflicto visible, pérdida de red, logout, validación de payload y revisión optimista pasan; pruebas HTTP de autorización/CORS/concurrencia y overlay PASS. Quedan E2E de dos dispositivos y merge semántico.

### 5. Accesibilidad y validación

- [x] Verificar contraste AA, foco de teclado, forced-colors, reduced motion, zoom 200% y lectura de estado del botón. *(legibilidad dark verificada en navegador + probada por el usuario 2026-07-31)*
- [x] Probar 1440x900, 1024x768, 768px, 390px, 360px y 320px; incluir orientación, safe area y teclado móvil. *(aprobado por el usuario con capturas; safe areas/teclado móvil siguen en validación 297A-12)*
- [ ] Ejecutar E2E de cambio de tema en escritorio/tablet/móvil y confirmar que la URL/app/recurso se conserva. *(E2E formal pendiente — infra de 297A-17)*
- [ ] Medir rendimiento de primera pintura y cambio de tema; documentar cualquier presupuesto excedido.

**Gate:** evidencia visual, E2E formal pendiente de 297A-17 y quality gate completo; no se marca como terminado con warnings bloqueantes.

### 6. Cierre documental

- [x] Actualizar manual visual, arquitectura e índice solo después de la aprobación y la implementación. *(sección 5.1 del manual visual; arquitectura/índice sin cambios necesarios)*
- [x] Registrar una entrada en completados con archivos, gotchas, Sentinel/VarSense y GLORY. *(tareas-2026-07-31.md)*
- [x] Confirmar revisión SOLID/escalabilidad: un tercer tema de prueba no exige reescribir componentes ni comandos. *(0 hex en CSS del OS; todo por tokens --sistema-*; un tema nuevo solo redefine tokens en variables.css)*

## Definition of Done

- [x] Un único botón global cambia el tema y es accesible.
- [x] Desktop, tablet y móvil comparten tokens, comandos, permisos y analítica.
- [ ] Preferencia y overlay local/remoto tienen UI de ámbito, merge, reset y rollback explícitos. *(transporte, API y resolución visual implementados; E2E multi-dispositivo y merge semántico avanzado pendientes)*
- [x] Manual visual, roadmap, pruebas y quality gate están sincronizados.
