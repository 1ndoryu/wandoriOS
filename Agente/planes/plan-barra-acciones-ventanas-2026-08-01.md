# Plan — Barra de acciones inferior de ventana (regla 018A-1)

- **Epic:** 297A-4 — OS persistente, cuentas, programas y comercio
- **Fecha:** 2026-08-01
- **Estado:** completado (fases 1-4 implementadas; verificación visual + gate al cierre)
- **Gate de tarea:** `npm run task:check -- 018A-1` (o el ID de cada fase)

## Objetivo

Toda ventana del OS coloca sus acciones primarias en una franja inferior fija
(`.desktop-window__actions`), parte del chrome — debajo del body padded, fuera
de su padding y de su scroll — con los botones alineados al final (derecha).
Regla aprobada visualmente por el usuario el 2026-08-01.

## Límites

- No aplicar la franja a páginas públicas (checkout, galería exterior).
- No duplicar la franja en el contenido: una ventana tiene UNA franja.
- El slot es opcional; una app sin acciones no cambia su comportamiento.
- El móvil necesita resolución explícita (Fase 1): hoy la franja es desktop-only
  y Admin móvil perdería su botón de alta si no se decide el mecanismo.

## Dependencias

- Bloquea: migración de editores (Fase 2), inventario de ventanas (Fase 3).
- Depende de: nada (slot `actions` ya implementado en el runtime chain).

## Fases

### Fase 0 — Base implementada (hecha, 018A-1)

- [x] Slot `actions` opcional en `MountedView`/`WindowContent` y cadena completa
      (window-manager → desktop-shell → createDesktopWindow → después del body).
- [x] CSS `.desktop-window__actions`: flex, `justify-content: flex-end`,
      `gap-md`, padding `sm/md`, `border-top`, `--sistema-superficie`,
      `[hidden] { display: none }`.
- [x] Admin: `createAdminWindowView()` rellena la franja por tab
      (articulos/proyectos/productos → "+ nuevo"; fuentes/sitio/estadisticas → oculta).
- [x] Listas con scroll propio (`.admin-lista` `overflow-y: auto`).
- [x] Manual identidad §9 y guía agregar-app actualizados (018A-2).
- [x] Verificación visual en navegador (geometría: franja debajo del body,
      botones a la derecha).

### Fase 1 — Resolver el alcance móvil del slot (decisión de diseño)

Problema: la presentación móvil (MobileAppStack) no renderiza `actions`, pero
Admin/otros con lista + alta perderían el botón de alta en móvil.

- [x] Decidir mecanismo: (a) MobileAppStack también coloca la franja debajo del
      contenido (mismo slot, sin duplicar lógica).
- [x] Implementar slot en mobile-shell (misma instancia `view.actions` debajo
      del contenido), `.movilApp` gana tercera fila `auto`, manual §9 (quitar
      "el móvil la ignora") y guía agregar-app actualizados. *(018A-4)*
- [ ] Validar en viewport 320/390 que la franja móvil no roba altura crítica
      (launcher a pantalla completa) y que el scroll del contenido sigue.

**Gate Fase 1:** type-check + gate + inspección móvil 320/390.

### Fase 2 — Migrar editores a la franja (article/project/product)

Hoy los editores tienen botones (guardar/publicar/cancelar) dentro del contenido.
Con contenido largo, deben quedar fijos en la franja.

- [x] Inventariar cómo abre cada editor: los tres son apps con ventana propia
      (lazy, padded) — devuelven `actions` en `MountedView`. *(018A-5)*
- [x] Los tres editores devuelven `actions` con fijar (solo artículo) + crear/
      guardar; el body absorbe su scroll y la franja queda fija.
- [x] La franja se crea síncrona (oculta), se rellena tras hydrate y se oculta
      en el catch de error (sin botones huérfanos).
- [ ] Confirmar que el foco/enter del formulario no colisiona con la franja.
- [ ] Verificar estados: nuevo vs edición, guardando (disabled), error visible.

**Gate Fase 2:** type-check + gate + flujo real crear/editar artículo.

### Fase 3 — Inventario de ventanas restantes y consistencia

Revisar cada app que abre ventana y decidir si aporta acciones:

- [x] Configuración: paneles de aplicación inmediata → sin franja (justificado).
- [x] Cuenta: login + logout inline → sin franja (justificado).
- [x] Biblioteca de media: `subir archivo` pasa a la franja (acciones por ítem
      quedan inline en cada tarjeta). *(018A-6)*
- [x] Trash: acciones vía comandos de toolbar → sin franja (justificado).
- [x] Finder/Galería/Proyectos: creación vía comandos de toolbar/contexto → sin
      franja (justificado). Perfil/About/Reader: solo lectura → sin franja.
- [x] Admin tab `sitio`: el botón `guardar` pasa a la franja (consistencia).
- [x] Registrar decisiones en el manual §9/§13 (qué apps usan franja y cuáles no).

**Gate Fase 3:** type-check + gate + barrido visual de ventanas.

### Fase 4 — Prevención automatizable

- [x] Evaluar regla Sentinel: NO viable — semántica (qué botón "debiera" estar
      en la franja) y alto ruido (acciones por ítem legítimas); cubierta por
      `css-especificacion-diseno-local` + contrato estructural.
- [x] Evaluar VarSense: receta muerta `barra-acciones` ya eliminada; la única
      receta es `.desktop-window__actions`, y una duplicación local la detecta
      el orphan/duplicate detection existente. No se añade regla.
- [x] Prevención implementada en su lugar: test de regresión del slot en
      `desktop-window.test.ts` (franja como última hija, después del body;
      sin actions no hay franja). *(018A-7)*

**Gate Fase 4:** fixture de regla nueva pasa + caso original detectado.

## Pruebas obligatorias (toda fase)

- `cd frontend && npx tsc --noEmit`
- `npm run task:check -- {ID}` desde la raíz
- Inspección en navegador de la ventana afectada (geometría de la franja:
  último hijo de `.desktop-window`, debajo del body, botones a la derecha)
- Viewports desktop 1440/1024 y móvil 390/320 cuando aplique

## Definition of Done

- [ ] Toda ventana con acciones primarias usa la franja (o justificación en manual).
- [ ] Móvil no pierde acciones (Fase 1 cerrada).
- [ ] Manual §9/§13 y guía agregar-app reflejan el estado final.
- [ ] Prevención evaluada (Fase 4), regla implementada si es viable.
- [ ] Gate PASS + type-check limpio.
