# Manual de identidad visual del OS de wandori.us

> **Fecha:** 2026-07-29  
> **Estado:** concepto visual aprobado; reglas canónicas para implementación  
> **Autoridad:** fuente única de decisiones estéticas del OS  
> **Referencia real:** interfaz local revisada el 2026-07-29

## 1. Alcance

Este manual gobierna el sistema operativo que ocupa la columna de contenido. La navegación lateral oscura pertenece al sitio exterior y no forma parte del OS. El OS nunca controla el ancho, comportamiento ni identidad de esa navegación; únicamente expone el botón `Nav` que solicita mostrarla u ocultarla.

La referencia conceptual es Macintosh 1984/Mac OS 9 reinterpretado de forma minimalista. No es una emulación histórica ni una interfaz pixel-art literal.

## 2. Principios visuales

1. Blanco y negro antes que decoración.
2. Estructura retro mediante bordes, rejilla, inversión y tramas; no mediante iconos dibujados a mano.
3. Una sola gramática para todas las ventanas y programas.
4. Densidad compacta sin sacrificar teclado, zoom o tacto.
5. Ninguna app crea su propia identidad visual local.
6. Los estados se entienden por forma/patrón más texto; nunca solo por color.
7. El contenido puede tener personalidad; el chrome del OS permanece estable.

## 3. Territorio visual

```text
Sitio exterior
├─ navegación lateral (fuera del OS)
└─ área disponible
   └─ OS
      ├─ barra superior
      ├─ escritorio
      │  ├─ iconos
      │  └─ ventanas
      └─ barra inferior
```

- El shell del OS llena el área disponible sin invadir la navegación.
- El propietario de `.columna-derecha` es el layout exterior; el shell consume su caja interna.
- No se duplican reglas de layout entre `layout.css` y estilos del desktop.

## 4. Paleta y patrones

### 4.1 Chrome del OS

Valores permitidos:

- Negro puro.
- Blanco puro.
- Transparente.
- `currentColor`.
- Tramas 1-bit aprobadas construidas con negro/blanco y transparencia técnica.

No se usan grises sólidos como decisiones de diseño. Antialiasing del navegador no cuenta como color de interfaz.

### 4.2 Excepciones controladas

- Fotografías, portadas, arte y previews de producto pueden conservar su color original dentro del contenido.
- El chrome alrededor de ese contenido sigue siendo monocromo.
- No se aplica `grayscale()` global a un entregable comercial o a una imagen abierta en tamaño completo.
- Una miniatura monocroma solo se usa si existe una decisión editorial explícita y reversible.

### 4.3 Migración de tokens actuales

Los tokens grises `#dcdcdc`, `#555`, `#999`, overlays RGBA y nombres engañosos se consideran deuda. Durante Foundation deben reemplazarse por roles canónicos o tramas aprobadas. Hasta entonces no se añaden nuevos grises.

## 5. Tokens canónicos

Las decisiones viven en `frontend/src/styles/variables.css`; los componentes solo consumen tokens.

Familias requeridas:

```text
--colorSistemaFondo
--colorSistemaTexto
--colorSistemaInversoFondo
--colorSistemaInversoTexto
--patronSistemaEscritorio
--patronSistemaMinimizado
--fuenteSistema
--tamanoTextoSistema*
--espacioSistema*
--bordeSistema
--tamanoIconoSistema*
--areaControlSistema*
--capaSistema*
```

- Renombrar `--fuente-sistema-pixel`: JetBrains Mono no es una fuente pixel.
- Renombrar `--sistema-borde-doble` si representa un solo borde.
- No crear tokens por app cuando el rol visual ya existe.
- CSS nuevo usa nombres de clase en español y `camelCase`; las clases legacy `desktop-*` se migran por componente, sin mezclar dos recetas permanentes.

### 5.1 Tema claro/oscuro (data-tema)

El OS soporta dos temas, `claro` (por defecto) y `oscuro`, más la resolución inicial `system` basada en `prefers-color-scheme`. El tema se aplica como atributo `data-tema="claro|oscuro"` en `documentElement`; desktop, tablet y launcher móvil comparten la misma implementación.

- Los tokens semánticos `--sistema-*` (fondo, texto, borde, inverso, secundario, deshabilitado, tramas, drop) se redefinen dentro de `[data-tema='oscuro']` en `variables.css`; ningún componente fija colores ni lee el tema directamente.
- El tema oscuro invierte el lenguaje 1-bit: fondo negro, texto blanco, bordes blancos y trama del escritorio en puntos blancos. No introduce grises decorativos, sombras, gradientes ni radios.
- Las superficies del OS (ventanas, menús, taskbar, launcher, apps) consumen los tokens redefinidos vía override scoped (`.desktop-window`, `.movilApp`, `.movilLauncher`). El contenido multimedia conserva su color (excepción §4.2).
- La navegación exterior y el contenido legacy fuera de esas superficies permanecen sin cambios; el override de tokens se limita al chrome del OS.
- Control único: botón de tema junto al reloj (barra superior) y en el launcher móvil, vía comando compartido `theme:toggle` (Meta+Shift+L); Configuración reutiliza ese comando.
- La preferencia se persiste en `localStorage` (`wandorius:tema`) y se resuelve antes de la primera pintura (script inline en `index.html`) para evitar flash. La sincronización con la cuenta usa el transporte remoto de 297A-13 con revisión optimista y conflicto explícito. Cuenta se presenta como app del OS con login/logout y estado visible; el E2E multi-dispositivo y registro avanzado quedan pendientes.

## 6. Tipografía

- Fuente canónica del OS: `JetBrains Mono`, con fallback monoespaciado del sistema.
- Aplica a barra superior, escritorio, labels, ventanas, menús, taskbar y programas internos.
- Números del reloj, precios y métricas usan cifras tabulares cuando la fuente lo permita.
- El menú contextual usa 2 px menos que el texto normal del sistema.
- Mayúsculas solo para etiquetas breves deliberadas; no se fuerza todo el OS a uppercase.
- [317A-4] Labels de formulario: primera letra en mayúscula (regla `::first-letter` de `.campo-etiqueta`). Nunca `text-transform: capitalize` completo, que subiría preposiciones ("Imagen De Portada"). El contenido del texto sigue en minúsculas en el código; la capitalización es presentacional.
- El contenido editorial puede definir una receta de lectura en el futuro, pero no altera el chrome ni crea una fuente por app. Hasta aprobar esa receta, Reader usa JetBrains Mono.

Jerarquía:

- Título de ventana: peso normal, centrado, una línea.
- Título editorial: mayor escala, sin bold decorativo innecesario.
- Label de icono: compacto, máximo definido y elipsis visual.
- Metadata/estado: escala secundaria, nunca ilegible.

## 7. Iconografía

- Única biblioteca: Lucide oficial.
- Grosor: `1px` para todos los iconos del sistema.
- No SVG manual, emoji, icon font ni mezcla con pixel art.
- El carácter retro proviene del layout y los estados, no de deformar Lucide.
- Tamaños se eligen desde tokens; el mismo significado usa el mismo icono.
- Todo icono accionable tiene nombre accesible.

Mapa mínimo:

| Significado | Icono |
|---|---|
| Carpeta | `Folder` |
| Artículo/documento | `FileText` |
| Proyecto/programa | `FolderCode` o icono registrado |
| Imagen/media | `Image` |
| Producto | `Package` |
| Papelera | `Trash2` |
| Configuración | `Settings` |
| Cuenta | `UserRound` |
| Cerrar | `X` |
| Minimizar | `Minus` |
| Borrador | `Pencil` |
| Privado | `Lock` |
| Público | `Globe` |
| Venta pausada | `CirclePause` |

## 8. Escritorio e iconos

### Anatomía

- Icono Lucide centrado.
- Label debajo, con ancho estable y truncado visual.
- Badge de estado en esquina fija.
- Área completa enfocabile/clicable; no solo el SVG.

### Estados

- Normal: negro sobre blanco/trama.
- Seleccionado: inversión negra con texto blanco.
- Foco por teclado: outline monocromo visible adicional a selección.
- Drag: feedback funcional, sin sombra ni escala decorativa.
- Deshabilitado: trama/forma y texto explicativo; no opacidad gris aislada.
- Máximo dos badges visibles; el menú contextual y texto accesible presentan el estado completo.

Visitantes no reciben ni ven badges de recursos privados. Admin sí ve borrador/privado durante organización y edición.

## 9. Ventana única

Todas las apps usan la misma receta `DesktopWindow`.

```text
┌─ X ───────── título ───────── − ┐
│                                  │
│          contenido app           │
│                                  │
├──────────────────────────────────┤
│                       [acciones] │
└──────────────────────────────────┘
```

- Borde negro de 1 px.
- Sin sombra, radio, blur ni overlay que opaque el escritorio.
- Titlebar lisa; no repetir líneas decorativas.
- `X` a la izquierda, título centrado, `Minus` a la derecha.
- Resize desde bordes/esquinas; nunca resize grip visible.
- Drag solo desde titlebar y conserva una parte recuperable en viewport.
- Una app no define z-index: WindowManager controla el apilado.

Estados obligatorios:

- Activa: distinción monocroma inequívoca en titlebar/borde, pendiente de receta final durante WindowManager.
- Inactiva: menor énfasis mediante patrón, no gris arbitrario.
- Minimizada: desaparece del canvas y permanece en taskbar.
- Loading: contenido estable con texto/indicador monocromo.
- Error: icono + mensaje + recuperación; nunca solo color.
- Maximizada/móvil dominante: usa área útil entre barras.

### Barra de acciones de la ventana (chrome inferior)

- [018A-1] La franja de acciones (`.desktop-window__actions`) es parte del chrome de la ventana: hija directa de `.desktop-window`, debajo del body padded — fuera de su padding y de su scroll.
- Lleva las acciones primarias del contexto activo de la app (p. ej. `+ nuevo artículo` en Admin). Los botones van **al final de la franja (derecha)** (`justify-content: flex-end`), con `gap-md` entre ellos.
- El contenido de la ventana absorbe su propio scroll (`.admin-lista` con `overflow-y: auto`) para que la franja permanezca fija con listas largas.
- Se oculta (`hidden`, sin espacio residual) cuando el contexto no tiene acciones.
- [018A-1 F1] **Misma franja en móvil:** el stack móvil coloca el mismo slot (`MountedView.actions`) debajo del contenido a pantalla completa (`.movilApp` gana una tercera fila `auto` solo cuando la app aporta acciones). No hay lógica duplicada por plataforma: la app rellena la franja una vez y ambas presentaciones la montan como barra inferior fija, fuera del scroll.
- [018A-1 F1] El botón dentro de la franja es compacto (receta `.boton` OS), no `boton-grande`: el tamaño lo gobierna el chrome, no el contenido.


## 10. Barra superior

Composición pública prevista:

```text
●  Archivo  Aplicaciones  Configuración  Cuenta      [tema]  reloj
```

Admin añade `Admin`; el logo es un círculo negro sin letra. No aparece `wandori.os`.

- Una sola fila en desktop.
- Los menús no se ocultan de forma que pierdan funcionalidad.
- En móvil, los elementos excedentes pasan a un menú compacto/overflow accesible.
- El botón de tema vive a la izquierda del reloj y usa el comando compartido `theme:toggle` (§5.1); el reloj es el elemento del extremo derecho.
- El reloj es informativo y no desplaza comandos críticos.

## 11. Menús superior y contextual

- Mismo componente y modelo de datos para Archivo, Aplicaciones, Configuración y clic derecho.
- Fondo blanco, texto negro, borde 1 px.
- Sin sombras, radios ni separadores internos.
- Tipografía 2 px menor que la base del OS.
- Submenús se reposicionan para no salir del viewport.
- Estados: normal, foco, seleccionado/abierto, disabled y submenu.
- Inversión monocroma para selección/foco; disabled conserva legibilidad.
- Teclado: flechas, Home/End, Enter/Espacio, Escape y retorno de foco.
- `role=menuitem` siempre es enfocable dentro del patrón roving tabindex.

## 12. Barra inferior

- No existe botón Inicio.
- Primer control: `Nav`, que abre/cierra la navegación exterior.
- Solo aparecen ventanas abiertas.
- Cada tarea muestra icono, título y `X` Lucide para cerrar.

Estados:

- Activa: inversión negro/blanco.
- Abierta inactiva: fondo blanco y borde negro.
- Minimizada: trama 1-bit aprobada.
- Atención/error: icono/patrón + texto accesible, nunca color.
- Cerrada: no aparece.

Cerrar desde taskbar no cambia el foco accidentalmente. Cuando no caben tareas se usa overflow o scroll controlado, no truncado que impida acceso.

## 13. Programas y contenido

### Finder/Galería/Tienda

- Comparten estructura de carpeta y grid/lista.
- Tipo y estado vienen del Resource/App registry.
- Tienda es una carpeta normal organizada por admin; no recibe una estética comercial separada.

### Reader/About

- Artículo con ritmo vertical claro, media integrada y metadata secundaria.
- About usa Reader con alias de sistema; no crea otra receta de ventana.

### Compra

- Formulario del proveedor vive dentro del contenido de la ventana, no altera chrome.
- Estados `pendiente`, `procesando`, `pagado`, `fallido` y `reembolsado` usan icono, título y texto.
- Precio y CTA son claros sin introducir color de marca dentro del chrome.
- Logos/elementos obligatorios del proveedor quedan confinados al área segura de pago.

### Configuración, Cuenta y programas admin

- Formularios consumen componentes UI compartidos.
- No modal de página completa ni overlay que oscurezca el OS.
- Tablas, vacíos, errores y confirmaciones reutilizan recetas, no clases locales equivalentes.

### Franja de acciones por programa

- [018A-1 F3] Inventario decidido de qué apps aportan `MountedView.actions` (franja inferior) y cuáles no:
  - **Con franja:** Admin (por tab: `+ nuevo artículo/proyecto/producto`, `guardar` en sitio), editores de artículo/proyecto/producto (`fijar` + `crear`/`guardar`), Biblioteca de media (`subir archivo`).
  - **Sin franja (justificado):** Finder/Galería (creación vía comandos de toolbar/contexto), Reader/About (solo lectura), Cuenta (formulario de login + logout inline), Configuración (paneles de aplicación inmediata), Acerca de (estático), Papelera (acciones vía comandos de toolbar), Proyectos (creación vía comando de toolbar).
- Las acciones por ítem (copiar/restaurar/eliminar en cada tarjeta de media) son de ámbito del ítem y siguen en el contenido; la franja es para acciones primarias del contexto de la ventana.
- Toda app nueva con acciones primarias de ventana debe aportar `actions`; prohibido dejar botones primarios sueltos en el body (prevención: test `createDesktopWindow (slot de acciones)`).

### Barra de pestañas (tabs)

- [317A-4] La barra de pestañas (`.barra-tabs`, componente universal `createTabs`) es navegación, no acción: aunque los tabs usen la clase `.boton`, NUNCA llevan el borde de botón OS (`border: none`, sin padding) dentro de las superficies.
- Disposición aprobada: vertical, alineada a la izquierda, en layout de dos columnas junto al contenido (columna de tabs + columna de contenido). El consumidor decide la separación con el contenido (gap del padre, p. ej. `gap-lg` en `.admin-pagina`); la barra no aporta márgenes propios.
- Estado activo: opacidad plena + peso medio (`.barra-tabs__tab--activa`). Inactivos: opacidad reducida (0.45) y peso normal.
- Mismo patrón `role=tablist`/`role=tab`/`aria-selected` en cualquier futura app que use pestañas; no se crean barras locales.

### Botones según superficie

- [317A-4] Los botones de texto (`.boton`) dentro de superficies del OS —ventanas desktop (`.desktop-window`), apps móviles (`.movilApp`), modales (`.modal-contenido`) y confirmaciones (`.confirm-contenido`)— llevan borde 1px sin redondear y padding pequeño (`--espacio-xs`/`--espacio-sm`), aspecto OS.
- Fuera de esas superficies (páginas públicas tipo checkout o galería exterior) `.boton` sigue siendo texto subrayado sin borde.
- Los botones de solo icono de toolbars (`.boton-icono`, ej. el editor de artículos) NO llevan borde; su separación se resuelve en el contenedor de la toolbar (`gap-md`). Esta separación es la única distinción de la toolbar respecto de los botones de acción enmarcados.
- Ningún botón usa radio, sombra ni color de fondo; el borde es siempre `--borde` (1px sólido).

### App toolbar de la ventana y controles de vista

- [018A-71] Los controles de vista/filtro de una app son un grupo de menú en el **app toolbar real de la ventana** (`desktop-app-toolbar`, chrome declarativo del shell), igual que "Ventana": la app declara su grupo en `AppDefinition.toolbar` (p. ej. "Ver") y los items son comandos del `CommandRegistry` con `contexts: ['toolbar']`.
- El item activo muestra **Check** (checkmark): el comando declara `isActive(ctx)` y `createAppToolbar` proyecta el icono `Check` sobre el activo — patrón de menú de OS. Los demás items muestran su icono de categoría. El checkmark se evalúa en cada apertura, por lo que refleja el estado al momento de abrir.
- Un menú con varias secciones (p. ej. filtro de tipo y vista biblioteca/papelera) usa un **separador** entre secciones (`'---'` en `AppToolbarGroup.items`; se renderiza como `.desktop-context-menu__separator`).
- PROHIBIDO: botones falsos de toolbar dentro del body de la app (clases `desktop-app-toolbar__*` o `.boton` con borde de superficie simulando toolbar), campos de formulario (`.campo`/`.campo-select`) y controles segmentados visibles en el contenido. El body solo contiene contenido; el chrome (toolbar y acciones) lo provee el shell.
- Las acciones directas dentro del body usan `.boton-icono` (solo icono) o `.boton-con-icono` (icono+texto), nunca `.boton` con borde. La acción primaria de creación (p. ej. subir archivo) vive en la franja inferior fija (`desktop-window__actions`), fuera del scroll.

## 14. Papelera y estados de archivo

- Papelera es una carpeta de sistema no eliminable.
- El visitante ve únicamente secciones autorizadas.
- Un recurso público en papelera puede mostrar metadata, pero no abrir contenido sensible, comprar ni descargar.
- `Eliminar permanentemente` requiere confirmación reforzada y, para admin, explicación de retención/dependencias.
- Los badges usan prioridad: Papelera > Privado > Borrador > Venta pausada > Público.
- Máximo dos indicadores; estado completo se ofrece como texto accesible y menú contextual.

## 15. Responsive

### ≥1024 px

- Navegación exterior y OS pueden convivir.
- Ventanas libres con bounds persistentes.
- Menús y taskbar completos.

### 768–1023 px

- Escritorio conserva ventanas reencuadradas.
- Taskbar admite overflow.
- Barra superior compacta sin eliminar funciones.

### 320–767 px

- Launcher de aplicaciones/carpetas inspirado en la organización de un teléfono.
- No se muestran ventanas, titlebar, barra superior desktop ni taskbar.
- Abrir una app ocupa toda el área disponible; la app conserva su contenido compartido.
- Persistir `mobilePosition` para la geometría del launcher y navegación recuperable; `mobileOrder` solo se acepta como fallback legacy, nunca como posición desktop.
- Back/Home/long press tienen contratos y alternativas accesibles aprobadas en el prototipo móvil.
- Safe areas y teclado virtual no ocultan acciones.

### Tablet desde 768 px

- Conserva escritorio, ventanas flotantes, barra superior y taskbar.
- No adopta el launcher móvil aunque esté en orientación vertical.
- Un cambio de teléfono a tablet transforma la presentación sin duplicar ni perder la app activa.

Matriz visual obligatoria: 1440×900, 1024×768, 390×844 y 320 px de ancho.

## 16. Accesibilidad

- Contraste blanco/negro conforme; patrones no sustituyen texto.
- Foco visible en todos los controles.
- Orden de tabulación coincide con orden visual/lógico.
- Control visible puede medir 18 px, pero su hit area mínimo es 24×24 CSS px; en móvil se busca 44×44 sin agrandar el pictograma.
- Nombres accesibles describen acción y objetivo: `Cerrar Perfil`, no solo `Cerrar`.
- Menús, ventanas y taskbar son operables con teclado.
- Zoom 200% no pierde contenido ni deja ventanas irrecuperables.
- `prefers-reduced-motion` elimina cualquier transición funcional no esencial.
- Multimedia exige alt/caption/transcript según tipo.

## 17. Movimiento e interacción

- Sin animación decorativa, bounce, blur o transición de color.
- Feedback inmediato para foco, selección, drag y resize.
- Persistencia/analytics se confirma al terminar el gesto, nunca por `pointermove`.
- Hover no es requisito para descubrir una acción; solo puede reforzar un estado funcional que también existe en foco.

## 18. Prohibiciones

- Sombras y drop shadows.
- Bordes mayores de 1 px.
- Radios, excepto el círculo negro de marca.
- Color en chrome, gradientes suaves o transparencias decorativas.
- Iconos no Lucide o Lucide con stroke distinto de 1 px.
- CSS inline para decisiones visuales.
- z-index definido por una app.
- Ventanas/chrome duplicados.
- Hover puramente decorativo.
- Menús sin teclado o funciones ocultas en móvil.
- Controles nativos sin receta visual compartida.

## 19. Deuda visual conocida

- Sustituir tokens grises y nombres legacy.
- Definir receta activa/inactiva antes de implementar foco real.
- Eliminar z-index por Finder/Reader/Settings.
- Resolver propiedad única de la columna derecha.
- Aumentar hit areas sin cambiar el tamaño óptico de controles.
- Reemplazar ocultación de menús responsive por overflow.
- Migrar nombres CSS desktop a la convención del proyecto por componente.

## 20. Proceso de cambio

Checklist obligatorio para cualquier cambio visual:

- [ ] Confirmar si la necesidad ya está resuelta por token/receta/componente.
- [ ] Proponer cambio en este manual si altera identidad o anatomía.
- [ ] Añadir/modificar primero token o componente compartido.
- [ ] Verificar matriz de cuatro viewports.
- [ ] Verificar teclado, foco, zoom 200% y reduced motion.
- [ ] Ejecutar VarSense/Sentinel y corregir inconsistencias.
- [ ] Obtener aprobación visual del usuario cuando el cambio sea material.
- [ ] Actualizar capturas/documentación y retirar receta anterior.

Una app no introduce colores, tipografía, iconos, titlebar, sombras, radios ni patrones propios. Si necesita una excepción funcional, se documenta aquí antes de implementarla.
