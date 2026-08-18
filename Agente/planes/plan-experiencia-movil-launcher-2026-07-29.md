# Plan especializado: experiencia móvil tipo launcher

> **Tarea:** 297A-12  
> **Fecha:** 2026-07-29  
> **Estado:** Bloques 2 y 3 de interacción parcialmente implementados y validados por quality gate; validación visual real y pruebas E2E de transición pendientes
> **Alcance:** teléfonos `<768px`; tablet conserva experiencia desktop

## 1. Resultado

En teléfono, wandori.us se percibe como un móvil minimalista con el mismo lenguaje visual del OS:

- Launcher con aplicaciones/carpetas ordenables como una pantalla de inicio.
- Sin ventanas flotantes, titlebars, barra superior desktop ni taskbar.
- Abrir una app la muestra a pantalla completa.
- Navegar atrás vuelve al estado anterior o al launcher.
- Mismas apps, datos, permisos, rutas, comandos y analytics del desktop.
- Tablet (`>=768px`) conserva escritorio, ventanas y barras.

## 2. Invariantes para no reinventar

- [x] AppRegistry es único para desktop/tablet/móvil.
- [x] Una app devuelve el mismo `MountedView`; no existe `MobileReader`, `MobileStore`, etc.
- [x] MobileAppStack es una proyección del mismo estado/comandos, no otro store de negocio.
- [x] CommandRegistry resuelve acciones; clic derecho desktop se adapta a long press/menú móvil.
- [x] RouteAppAdapter conserva deep links y params; Back del stack está implementado.
- [x] Workspace overlay usa los mismos nodos; `mobilePosition` representa la geometría canónica móvil de 3 columnas y se proyecta a 2 columnas; `mobileOrder` solo sirve como fallback legacy.
- [x] Seguridad, estados, papelera, pagos y analytics no dependen del viewport.

## 3. Contrato de presentación

```ts
type OsPresentationMode = 'mobile' | 'desktop';

interface MobileNavigationState {
  stack: Array<{
    appId: string;
    resourceId?: string;
    instanceId: string;
  }>;
}
```

- `mobile` aplica por capacidad/layout `<768px`; `desktop` aplica desde tablet.
- El breakpoint se decide en un adaptador de presentación, no dentro de cada app.
- Cambiar orientación/breakpoint preserva app y recurso activo.
- Bounds/z-order/minimized no se usan en móvil; se conservan para volver a desktop.
- Mobile stack no se persiste como historial infinito; solo estado recuperable definido.

## 4. Bloque 1 — Prototipo visual sin lógica final

- [x] Crear boceto real del launcher con grid, carpetas y Papelera; badges quedan para el estado real.
- [x] Mostrar una app pública a pantalla completa.
- [x] Mostrar Finder/carpeta móvil.
- [x] Mostrar Reader móvil con artículo/media.
- [x] Mostrar Tienda/Compra móvil sin integrar pago.
- [x] Definir navegación Back/Home sin barras desktop.
- [x] Revisar 390×844, 360×800 y 320px; confirmar escritorio en tablet 768px.
- [x] Obtener aprobación explícita del usuario antes de implementar runtime móvil. *(2026-07-30)*

**Implementación de revisión:** `frontend/src/features/mobile/mobile-prototype.ts` y
`frontend/src/styles/mobile/mobile-prototype.css`. Los datos son demostrativos y el
módulo no implementa persistencia, pagos, drag, long press ni el stack definitivo.

**Gate:** aspecto y navegación base aprobados.

## 5. Bloque 2 — Shell móvil compartido

- [x] Añadir `getPresentationMode()` central y `presentationMode` en analytics/commands.
- [x] Crear `MobileLauncher` que consume nodos/registry/workspace existentes.
- [x] Crear `MobileAppStack` que monta `MountedView` existente.
- [x] Ocultar/no montar DesktopWindow, top menu y taskbar en móvil.
- [x] Integrar safe areas, viewport dinámico y teclado virtual en el chrome móvil.
- [x] Mantener navegación exterior accesible mediante control visible de launcher.
- [x] Evitar listeners/media queries duplicados por app: el shell decide la presentación.
- [x] Liberar listeners del toggle de tema y gestos del launcher al cambiar de vista o destruir el shell.
- [x] Capturar/liberar el puntero del long press cuando el navegador lo permite, con fallback seguro para DOM parcial.
- [x] Hacer reactiva la transición móvil↔tablet sin recarga mediante reinstanciación segura por URL/params.
- [x] Desmontar el interceptor de rutas, el shell móvil y los listeners asociados con cleanup idempotente.
- [x] Preservar estados transitorios de formularios/scroll durante la transición mediante snapshot efímero en memoria, opt-in `data-transient="true"` y `data-transient-scroll`; excluye secretos, archivos, campos ocultos y metadata sensible. Legacy outlet y Perfil shell usan claves/rutas separadas; snapshots se limpian en cancelación, error y teardown.

**Implementación:** `frontend/src/features/mobile/mobile-shell.ts`,
`frontend/src/features/mobile/mobile-launcher.ts` y `frontend/src/features/mobile/mobile-stack.ts`.
El shell coordina rutas/stack/lifecycle; `MobileLauncher` renderiza el launcher y sus gestos.
El adapter de rutas conserva params y deriva la misma app al stack móvil; no existen componentes `MobileFoo`.

**Gate parcial:** Perfil/Finder/Reader se montan en el shell full-screen con `MountedView`,
Back/Home destruyen o desapilan vistas y tablet conserva el shell desktop. El interceptor de rutas,
los listeners y la pila móvil tienen cleanup idempotente. La validación visual real por viewport
sigue pendiente y no se considera cubierta por el quality gate.
La transición dinámica por URL/params y lifecycle ya está implementada; el gate restante es
la validación visual real y la prueba E2E de resize/orientación sin perder estado representable.

**Gate:** Perfil/Finder/Reader abren full-screen sin chrome desktop ni duplicación de contenido.

## 6. Bloque 3 — Launcher, carpetas y organización

- [x] Grid compacto reordenable por drag con `mobilePosition`; `mobileOrder` queda como fallback de datos antiguos y los comandos `workspace:move-up/down` son alternativa accesible móvil.
- [x] Carpetas abren vista full-screen y permiten navegación jerárquica.
- [x] Reorder con alternativa accesible por comandos que opera sobre celdas; no depende del gesto táctil.
- [x] Long press abre el CommandRegistry móvil mediante el mismo menú contextual.
- [x] Crear carpeta, copiar, cortar, pegar y mover usan comandos existentes.
- [ ] Papelera muestra solo capas autorizadas.
- [ ] Badges/estados siguen el manual visual.
- [ ] Overlay local/remoto sincroniza orden y additions/tombstones.

**Gate:** reorganización móvil sobrevive reload/sync sin alterar layout desktop ni release público.

## 7. Bloque 4 — Navegación y cambio de modo

- [x] Back desapila la vista superior y ejecuta teardown.
- [x] Home vuelve al launcher y libera la pila explícitamente.
- [x] Deep link entrega params al mismo AppRegistry/MountedView full-screen.
- [x] Back de un deep link delega a History API; Home vuelve a `/` y limpia el stack.
- [x] Refresh reconstruye el estado seguro del stack desde la sesión versionada antes del router; la URL sigue enfocando la app superior sin duplicarla. *(317A-5, verificado en 390×844)*
- [x] Rutas legacy no gestionadas por AppRegistry se muestran en el outlet móvil; el launcher permanece en `/`.
- [x] Pasar móvil→tablet transforma la app activa en una ventana recuperable mediante reinstanciación.
- [x] Pasar tablet→móvil selecciona la ventana activa como app full-screen mediante reinstanciación.
- [x] Callbacks del shell móvil quedan inertes después de `destroy()`; no reabren vistas desde eventos tardíos.
- [x] Conservar estados transitorios no representados por URL/params mediante snapshot efímero opt-in; la integración visual/E2E de transición sigue pendiente.
- [ ] Ventanas secundarias se conservan sin mostrarse o siguen política explícita probada.
- [ ] Foco se restaura al icono/elemento correcto.

**Gate:** resize/orientación/deep links no pierden app, recurso ni navegación.

## 8. Bloque 5 — Apps críticas

- [ ] Cuenta/login/registro full-screen y teclado usable.
- [ ] Editor admin full-screen con toolbar adaptada.
- [ ] Store/Product/Checkout respeta viewport y proveedor.
- [ ] Recibo/descarga accesibles sin popups ocultos.
- [ ] Reader conserva legibilidad, media y progreso.
- [ ] Navegador retro/proyectos respeta sandbox y Back.
- [ ] Configuración y Estadísticas usan componentes compartidos responsive.

**Gate:** cada app crítica pasa prueba funcional móvil sin versión paralela.

## 9. Accesibilidad y visual

- [ ] JetBrains Mono y Lucide 1px permanecen.
- [ ] Chrome móvil monocromo, sin sombras/radios/colores.
- [ ] Área táctil mínima 44×44 cuando sea viable; icono óptico no se engrosa.
- [ ] Foco visible para teclado/switch y orden lógico.
- [ ] Zoom 200% y texto grande no bloquean navegación.
- [x] No depender solo de long press; mover arriba/abajo está disponible como comando accesible.
- [ ] Reduced motion y sin gestos obligatorios sin alternativa.
- [ ] Contenido no queda bajo notch/safe area/teclado.

## 10. Analytics y rendimiento

- [ ] Eventos usan mismos nombres/appId/resourceId y agregan `presentationMode=mobile` permitido.
- [ ] No medir touchmove/drag por pixel.
- [ ] Lazy-load solo apps pesadas medido, no otro bundle móvil.
- [ ] Launcher inicia con bootstrap único y sin N+1 de iconos/estados.
- [x] Memoria se libera al desapilar/destruir apps según lifecycle; launcher gestures y theme toggle también tienen teardown explícito.
- [ ] Definir budgets de arranque, interacción y media móvil.

## 11. Pruebas obligatorias

- [ ] 320px, 360×800, 390×844 y orientación horizontal.
- [ ] Tablet 768×1024 conserva escritorio/ventanas.
- [ ] Abrir/cerrar/Back/Home y deep link.
- [ ] Cambio móvil↔tablet con app activa.
- [x] Reordenar, carpeta y long press tienen cobertura unitaria de stack/gesto; papelera y reset quedan para prueba funcional visual.
- [ ] Cuenta, Reader, Finder, Editor, Compra y descarga.
- [ ] Teclado virtual, safe area, zoom y foco.
- [x] Visitante no accede a comandos/recursos admin; la capacidad se confirma desde `/auth/me` y se aplica en router, apertura programática, menús y merge.
- [ ] No se crean componentes o stores móviles duplicados.

## 12. Criterio final de cierre

**Estado del gate actual:** El runtime móvil, `MobileLauncher` y el snapshot transitorio opt-in pasan type-check, **278 tests en 34 suites**, `task:check -- 297A-22 --fresh` y `self-check`. La transición dinámica por URL/params, el long press, el menú compartido, el reorder accesible, la autorización por capability y la preservación segura de formularios/scroll están implementados. La inspección de navegador confirmó tablet `768×1024` con escritorio, taskbar y sin overflow horizontal; la sesión móvil táctil no produjo evidencia automatizada estable, por lo que la validación visual/E2E móvil, safe areas, foco, teclado y apps críticas siguen abiertas.

- [ ] Teléfono usa launcher y apps full-screen sin barras/ventanas desktop.
- [ ] Tablet conserva comportamiento desktop.
- [ ] Apps y lógica son idénticas entre presentaciones.
- [ ] Organización móvil persiste sin contaminar bounds desktop.
- [ ] Navegación, accesibilidad y rutas funcionan en los tamaños mínimos.
- [ ] Manual visual, arquitectura, roadmap y Sentinel reflejan la variante móvil.
