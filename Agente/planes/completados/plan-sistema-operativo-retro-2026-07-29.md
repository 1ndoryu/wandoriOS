# Plan histórico completado: escritorio Macintosh minimalista para wandori.us

> **Tarea:** 297A-2
> **Fecha:** 2026-07-29
> **Estado:** concepto visual aprobado y cerrado; fases difíciles replanificadas en 297A-4
> **Alcance actual autorizado:** conservar la identidad y seguir `plan-escritorio-persistente-cuentas-admin-apps-2026-07-29.md`.
> **Manual vigente:** `Agente/documentacion/design-system/manual-identidad-visual-os-2026-07-29.md`.
> **Uso:** razonamiento histórico; no es especificación ni checklist activo.

### Resultado de fase 1 — 2026-07-29

- Nav preservado como superficie exterior.
- `wandori.os` integrado exclusivamente en la columna derecha.
- Barra global, ventana de perfil, objetos del escritorio y estados de selección representados.
- Layout revisado a 1024×768, 390×844 y ancho mínimo de 320 px.
- Sin gestor de ventanas, drag, resize, apertura de objetos ni aplicaciones funcionales.
- Feedback aplicado: títulos lisos, marca circular, sin contador ni nombre del sistema.
- Configuración y Admin integrados como aplicaciones; Configuración usa una ventana interna sin overlay.
- Tipografía del sistema cambiada a JetBrains Mono para evaluación visual.
- Iconos del escritorio unificados con la familia Lucide tras aprobar la prueba de Galería.
- Barra de tareas inferior añadida como concepto estático: control del nav, Perfil activo y Configuración minimizada.
- Controles de ventana unificados con Lucide: cerrar a la izquierda y minimizar a la derecha; sin resize grip.
- Barra superior reducida a Archivo, Aplicaciones y Configuración; Archivo muestra la jerarquía mensual estática.
- Las tareas inferiores incorporan una `X` propia para representar el cierre directo de ventanas.
- Menú Archivo oculto nuevamente para revisar el escritorio sin obstrucciones.
- Slice de evaluación Finder → Reader añadido con imágenes locales, documentos y artículo compuesto; sin gestor ni API.
- Identidad visual aprobada por el usuario; el modelo de producto/persistencia pasa al plan prioritario 297A-4.

## 1. Visión

La columna derecha de `wandori.us` se convertirá en un escritorio inspirado en el Macintosh de 1984 y en la jerarquía visual Platinum de Mac OS 9, reinterpretado como una interfaz contemporánea, mínima y exclusivamente en blanco y negro.

El objetivo no es emular un Macintosh de forma literal ni construir una parodia pixelada. Debe sentirse como un sistema operativo real y coherente, pero más limpio:

- Modelo espacial: carpetas, documentos, aplicaciones y ventanas.
- Barra global del sistema dentro del escritorio.
- Ventanas rectangulares con jerarquía inequívoca.
- Iconografía de mapa de bits reinterpretada con pocos píxeles.
- Mucho espacio vacío y pocos controles visibles.
- Sin colores, sombras, transparencias decorativas ni bordes redondeados.
- Escala moderna y legible; la referencia retro se comunica por estructura, patrones e iconos, no por texto diminuto.

## 2. Límite fundamental: nav externo y sistema operativo

El nav actual **no forma parte del sistema operativo**.

```text
┌─────────────────┬───────────────────────────────────────────┐
│ NAV DEL SITIO   │ WANDORI.OS                                │
│                 │                                           │
│ inicio          │ barra global                              │
│ about           │ escritorio + ventanas + iconos            │
│ galería         │                                           │
│ proyectos       │                                           │
│ artículos       │                                           │
└─────────────────┴───────────────────────────────────────────┘
```

Reglas del límite:

1. El nav conserva navegación editorial, lista de artículos y estado de ruta.
2. El escritorio ocupa únicamente la columna derecha mientras el nav está abierto.
3. El control para ocultar o mostrar el nav pertenece al layout exterior, colocado sobre la unión entre ambas áreas; visualmente no se confunde con un menú de `wandori.os`.
4. Al cerrar el nav, el escritorio usa todo el ancho disponible.
5. Ocultar el nav no cierra ventanas, no reinicia aplicaciones y no modifica la ruta.
6. En móvil, el nav será una superficie exterior plegable; nunca una ventana ni una aplicación del escritorio.

## 3. Dirección visual

### 3.1 Referencias que sí se conservan

Del Macintosh de 1984:

- Escritorio espacial y objetos directos.
- Barra de menú global y compacta.
- Ventanas con borde negro, título centrado y controles mínimos.
- Iconos reconocibles por silueta.
- Patrones de 1 bit para distinguir superficies sin introducir color.

De Mac OS 9 / Platinum:

- Mejor separación entre ventana activa e inactiva.
- Controles consistentes y más fáciles de identificar.
- Distribución más cómoda para pantallas modernas.
- Ventanas capaces de convivir, moverse y cambiar de tamaño.

### 3.2 Elementos que se eliminan o simplifican

- Nada de copiar el relieve gris tridimensional completo de Platinum.
- Nada de franjas, biseles y botones repetidos en cada superficie.
- Nada de iconos multicolor o ilustraciones skeuomórficas detalladas.
- Nada de tipografía artificialmente diminuta para parecer antigua.
- Nada de barra Dock, widgets, notificaciones o elementos modernos que no tengan una función inicial.
- Nada de animaciones decorativas, rebotes, transparencias o desenfoques.

### 3.3 Paleta y textura

- Fondo principal: blanco.
- Texto, iconos y bordes: negro.
- Superficies secundarias: blanco.
- Los grises aparentes se forman con tramas de 1 bit o líneas alternadas, no con una paleta cromática adicional.
- Ventanas activas e inactivas: títulos blancos con un único borde simple; el foco se resolverá sin tramas repetitivas.
- Selección: inversión estricta, fondo negro y texto blanco.

### 3.4 Tipografía

- La interfaz del sistema usará una familia bitmap o neo-grotesca que recuerde Geneva/Chicago, pero con métricas modernas y buena lectura.
- Los contenidos editoriales conservarán las fuentes configurables del sitio.
- La tipografía del sistema y la tipografía del contenido son capas diferentes.
- Mayúsculas solo para nombres cortos de objetos o aplicaciones; no se forzarán en párrafos.

### 3.5 Iconografía

- Familia Lucide oficial con trazo monocromo fino y escala común.
- Siluetas negras, sin rellenos decorativos y con un único nivel de detalle.
- Cada tipo tiene una gramática estable:
  - Carpeta: `Folder` para galería y `FolderCode` para proyectos.
  - Documento: `FileUser` para about y `FileText` para artículos.
  - Aplicación: `Gamepad2`, `Settings` y `ShieldUser` según su función.
  - Volumen o disco: acceso raíz del portfolio si llega a ser necesario.
- El texto bajo el icono forma parte del objeto y debe seguir siendo legible a 320 px.

## 4. Composición inicial de la página de inicio

### 4.1 Escritorio

- Ocupa el alto disponible de la columna derecha.
- Barra global de aproximadamente una línea de texto en la parte superior.
- Fondo blanco con una trama mínima opcional, suficientemente tenue para no competir con el contenido.
- Iconos alineados a una rejilla con espacio generoso; no se llenará el escritorio por decoración.

### 4.2 Barra global interna

Propuesta aprobada para la fase visual:

```text
[ ● ]  Archivo  Aplicaciones  Configuración                      11:42
```

- El círculo negro sustituye tanto la marca Apple como la anterior letra `W`.
- `Edición`, `Ver` y `Ventana` se eliminan porque no tienen una función transversal inicial.
- Archivo se muestra abierto estáticamente en fase 1 para revisar dos niveles de navegación.
- No se muestra un nombre decorativo del sistema en el centro.
- La hora será texto fijo en la fase 1 y dinámica en la fase 2.

### 4.2.1 Contrato futuro de los menús superiores

La fase 1 solo representa estos menús; no registra clics ni consulta contenido.

**Archivo**

1. El primer nivel muestra únicamente meses que contienen artículos publicados, ordenados del más reciente al más antiguo.
2. Cada mes abre un segundo menú con los artículos publicados durante ese periodo, también en orden descendente.
3. Seleccionar un artículo abre la aplicación Lector, sincroniza su URL pública y cierra toda la cadena de menús.
4. Los borradores y artículos programados no aparecen para visitantes. El modo admin podrá incluirlos con un estado explícito.
5. La agrupación usa la zona horaria configurada por el sitio para evitar que un artículo cambie de mes entre frontend y backend.
6. Las listas largas tendrán alto máximo y scroll interno; nunca ampliarán el escritorio fuera del viewport.

**Aplicaciones**

1. Se alimenta del registro central `DesktopAppDefinition`; no mantendrá una segunda lista manual.
2. Mostrará las aplicaciones públicas instaladas: Galería, Proyectos, Lector, Navegador y Snake.
3. Las aplicaciones administrativas solo se incorporan cuando la sesión está autenticada y autorizada.
4. Seleccionar una aplicación enfoca su ventana existente si es singleton o crea una nueva instancia si su definición lo permite.

**Configuración**

1. Abre accesos directos a pestañas concretas dentro de una única aplicación Configuración.
2. La sección pública contiene personalización visible para cualquier visitante: tipografía de menú, títulos y texto, además de preferencias visuales permitidas.
3. La sección base de administración contiene ajustes editoriales y del sitio; solo existe para usuarios autenticados con capacidad suficiente.
4. Ocultar entradas administrativas en el menú no reemplaza la autorización del backend: cada operación vuelve a validar permisos.
5. Si Configuración ya está abierta o minimizada, el acceso la restaura, enfoca y selecciona la pestaña solicitada.

**Comportamiento compartido de menús**

- Un solo menú superior puede estar abierto a la vez.
- Clic exterior, `Escape`, cambio de ruta o apertura de una aplicación cierran toda la cadena.
- Flechas, `Enter` y `Escape` permiten recorrer ambos niveles sin ratón.
- Los submenús se reposicionan para no salir del área útil, especialmente en móvil.

### 4.3 Ventana de perfil inicial

- Se abre visualmente por defecto en la fase conceptual.
- Título propuesto: `Perfil` en lugar de `PROFILE.EXE`; esto reduce la caricatura retro.
- Contenido: fotografía real, `wandorius`, descripción breve y enlaces sociales.
- La fotografía puede mantener su proporción configurable, pero se enmarca dentro del lenguaje de ventana.
- Enlaces sociales sobrios, con separación clara y sin transformarlos en iconos de colores.
- Posición inicial: tercio izquierdo/central del escritorio, dejando visibles los objetos principales a la derecha.

### 4.4 Objetos visibles en el escritorio

Primera colección, sin lógica en fase 1:

- `Galería` — carpeta.
- `Proyectos` — carpeta.
- `About` — documento de texto.
- Dos artículos de ejemplo — documentos de texto.
- `Snake` — aplicación/juego de muestra.
- `Configuración` y `Admin` — aplicaciones visibles exclusivamente para usuarios autenticados.
- Papelera: se omite inicialmente porque no existe una acción real de borrar desde el escritorio público.

### 4.5 Ventanas

Receta visual compartida:

- Borde exterior negro.
- Barra de título compacta.
- Cierre con `X` de Lucide a la izquierda.
- Minimizar con `Minus` de Lucide a la derecha.
- Área de contenido blanca y sin paneles anidados innecesarios.
- El resize futuro se activa desde los bordes de la ventana, sin asa visible.
- Sin sombra; la profundidad se comunica mediante solape, foco y orden.

### 4.6 Barra de tareas inferior

- El primer control muestra u oculta el nav exterior sin reiniciar el escritorio.
- Cada ventana abierta ocupa una tarea con icono, título y una `X` de cierre independiente.
- La tarea activa usa inversión negro/blanco; una ventana minimizada usa una franja de trama de 1 bit.
- Pulsar el cuerpo de una tarea enfoca o restaura la ventana; pulsar su `X` la cierra sin cambiar el foco por accidente.
- Las ventanas cerradas desaparecen de la barra. Las aplicaciones singleton pueden volver a abrirse desde el escritorio o Aplicaciones.
- En fase 1 todos estos estados son estáticos y los botones permanecen sin comportamiento.

## 5. Estados visuales que debe cubrir el concepto

La fase visual no tendrá lógica, pero debe representar de forma estática todos los estados necesarios para evitar inventar el diseño durante la programación:

1. Nav abierto + escritorio normal.
2. Nav cerrado + escritorio a ancho completo.
3. Ventana de perfil activa.
4. Ventana inactiva detrás de otra.
5. Carpeta seleccionada.
6. Documento seleccionado.
7. Ventana de carpeta con rejilla de imágenes.
8. Ventana de lector con un artículo.
9. Ventana de navegador de proyectos.
10. Escritorio móvil con una sola ventana dominante.

## 6. Diseño responsive

### Desktop, 1024 px o más

- Nav externo fijo en su columna.
- Escritorio ocupa el resto.
- Varias ventanas pueden permanecer visibles y solapadas.
- Iconos ordenados en una columna o rejilla lateral.

### Tablet, 768–1023 px

- Nav exterior más estrecho o plegado.
- Ventanas limitadas al área útil y con posiciones iniciales adaptativas.
- No se pierde la barra global.

### Mobile, 320–767 px

- Nav exterior cerrado inicialmente y accesible mediante su control de layout.
- Escritorio a ancho completo.
- Una ventana principal visible; las demás quedan minimizadas o detrás.
- Las ventanas se ajustan a un margen seguro, sin depender de coordenadas de desktop.
- Los iconos usan una rejilla táctil, pero conservan la estética monocroma.
- El drag puede existir en fase 2, pero nunca será necesario para acceder al contenido.

## 7. Arquitectura prevista

La fase visual debe producir componentes finales, no un mockup desechable. En las fases posteriores se les añadirá comportamiento sin reescribir su estructura.

```text
frontend/src/features/desktop/
  desktop-shell.ts
  desktop-types.ts
  app-registry.ts
  components/
    desktop-menu-bar.ts
    desktop-icon.ts
    desktop-window.ts
    nav-visibility-control.ts
  windowing/
    window-manager.ts
    window-geometry.ts
    window-interactions.ts
  apps/
    profile/
      profile-app.ts
    finder/
      finder-app.ts
    reader/
      reader-app.ts
    browser/
      browser-app.ts
    snake/
      snake-app.ts

frontend/src/styles/desktop/
  desktop-tokens.css
  desktop-shell.css
  desktop-window.css
  desktop-icons.css
  desktop-responsive.css
```

Contratos previstos:

```ts
interface DesktopAppDefinition {
  id: string;
  title: string;
  icon: DesktopIconDefinition;
  singleton: boolean;
  defaultBounds: WindowBounds;
  render(context: DesktopAppContext): HTMLElement;
}

interface DesktopWindowState {
  id: string;
  appId: string;
  title: string;
  bounds: WindowBounds;
  state: 'normal' | 'minimized' | 'maximized';
  zIndex: number;
  focused: boolean;
}
```

La API no se implementará en la fase 1; se documenta ahora para que el DOM y el CSS estáticos ya respeten los límites correctos.

## 8. Plan de ejecución en tres fases

## Fase 1 — Concepto visual real, sin lógica

### Objetivo

Ver exactamente cómo se integrará el sistema en la página antes de invertir en interactividad.

### Trabajo

1. Crear tokens visuales del escritorio usando las variables B&W existentes.
2. Construir la estructura final del shell, barra global, iconos y ventanas.
3. Integrarla únicamente en el área derecha; el nav actual queda fuera.
4. Crear la ventana de perfil estática con los datos visuales actuales.
5. Dibujar estados estáticos de carpeta, lector y navegador para validar el sistema completo.
6. Preparar vistas desktop, tablet y mobile.
7. No registrar listeners de drag, resize, focus, apertura o cierre.
8. No conectar API, router, stores, persistencia, analítica ni backend.

### Entregables

- Concepto ejecutándose en la aplicación local.
- Capturas comparables en 1440×900, 1024×768 y 390×844.
- Inventario final de tokens, ventanas e iconos.
- Lista explícita de diferencias solicitadas por el usuario.

### Puerta de aprobación

No se inicia la fase 2 hasta que el usuario apruebe:

- Separación nav/escritorio.
- Densidad visual.
- Barra global.
- Estilo de ventanas.
- Tipografía del sistema.
- Iconos.
- Posición y tamaño del perfil.
- Composición desktop y mobile.

## Fase 2 — Shell interactivo y gestor de ventanas

### Objetivo

Convertir el concepto aprobado en un sistema operativo navegable y extensible sin implementar aún todas las aplicaciones finales.

### Trabajo

1. Registro central de aplicaciones basado en `DesktopAppDefinition`.
2. Gestor de ventanas con foco, z-index, apertura, cierre, minimizar y maximizar.
3. Drag con Pointer Events, captura de puntero y límites del escritorio.
4. Resize con geometría segura, tamaños mínimos y límites responsive.
5. Activación de objetos por doble clic, teclado y alternativa táctil accesible.
6. Control exterior para abrir/cerrar el nav sin alterar el estado del escritorio.
7. Ventana de perfil conectada a `profileImage`, redes y configuración actual.
8. Persistencia opcional de posición/tamaño en almacenamiento local, versionada y recuperable.
9. Manejo de errores visible; ninguna aplicación puede dejar una ventana vacía silenciosamente.
10. Pruebas unitarias para geometría, foco y registro de aplicaciones.

### Criterios de aceptación

- Las ventanas nunca quedan fuera del área recuperable.
- El foco se ve sin depender de color.
- El nav se pliega de forma independiente.
- Ratón, táctil y teclado permiten acceder a las funciones esenciales.
- Añadir una aplicación nueva no exige modificar el gestor de ventanas.

## Fase 3 — Aplicaciones y contenido

### Objetivo

Convertir las páginas y contenidos existentes en aplicaciones coherentes del escritorio.

### Aplicaciones

1. **Finder / Galería:** carpeta, miniaturas, visor de imagen y navegación interna.
2. **Finder / Proyectos:** lista de proyectos como aplicaciones o accesos ejecutables.
3. **Navegador:** marco retro para proyectos; contenido same-origin puede integrarse. URLs externas usan apertura segura porque muchos sitios bloquean `iframe` mediante CSP/X-Frame-Options.
4. **Lector:** about y artículos como documentos, preservando URLs, SEO y navegación profunda.
5. **Snake:** juego pequeño sin dependencias, con teclado y controles táctiles.
6. **Perfil:** comportamiento final y enlaces reales.

### Integraciones

- El router conserva URLs públicas indexables.
- Abrir un documento sincroniza la ruta; cerrar vuelve al escritorio sin destruir el historial.
- Las aperturas, lecturas, imágenes y proyectos continúan alimentando analítica.
- Ningún HTML de artículos se inserta sin la sanitización existente o una política equivalente.
- Las aplicaciones cargan bajo demanda para no penalizar el inicio.

## 9. Riesgos y decisiones anticipadas

### SEO frente a interfaz de escritorio

El escritorio no puede convertir todo el sitio en estado opaco dentro de una sola URL. About, artículos, galería y proyectos conservarán rutas reales y contenido accesible; el sistema operativo será la presentación, no el contrato de navegación.

### Navegador embebido

No se prometerá que cualquier proyecto externo pueda mostrarse en un `iframe`. El navegador retro tendrá adaptadores:

- `same-origin`: render embebido.
- `external-embeddable`: `iframe` con sandbox y permisos mínimos.
- `external-blocked`: ficha del proyecto y botón para abrir de forma segura en otra pestaña.

### Drag y responsive

Las coordenadas absolutas de desktop no se reutilizan directamente en móvil. El gestor trabajará con un área útil calculada y presets por breakpoint.

### Rendimiento

- Un único listener de movimiento activo durante drag/resize.
- Actualización visual con `requestAnimationFrame`.
- Posición por `transform` durante el gesto y commit de geometría al terminar.
- Registro y carga diferida de aplicaciones.

### Accesibilidad

- Orden de foco independiente del z-index visual.
- Controles con nombres accesibles.
- Alternativa a doble clic.
- El contenido sigue disponible sin arrastrar ventanas.
- Respeto de `prefers-reduced-motion`.

## 10. Qué no se hará antes de aprobar la fase visual

- Gestor de ventanas.
- Drag o resize.
- Registro de aplicaciones.
- Conversión de rutas.
- Galería funcional.
- Navegador funcional.
- Lector funcional.
- Juego.
- Cambios de backend o base de datos.

### Excepción de evaluación aprobada

Para poder evaluar los estados 7 y 8 antes de la fase difícil se permite un slice local y reemplazable:

- Galería abre una ventana Finder singleton con tres imágenes locales y dos documentos.
- Un documento abre una ventana Reader con texto e imágenes.
- Finder y Reader entregan solo contenido y reutilizan `createDesktopWindow()`.
- La apertura/cierre usa referencias locales; no implementa foco, drag, resize, rutas, API, store ni taskbar dinámica.
- Este slice se sustituirá por el registro/store de las fases 2 y 3 sin conservar lógica paralela.

## 11. Secuencia inmediata

1. Usuario revisa y aprueba este plan o solicita cambios.
2. Se crea la fase 1 en el proyecto como concepto visual real y estático.
3. Se muestran desktop, tablet y mobile.
4. Se incorporan correcciones visuales.
5. El usuario aprueba formalmente el concepto.
6. Solo entonces comienza la fase 2.

## 12. Referencias

- Macintosh in 1984: http://toastytech.com/guis/macos1.html
- Galería Mac OS 9 / Platinum: https://guidebookgallery.org/guis/macos/macos90
- Apple Mac OS 8 Human Interface Guidelines — Appearance Manager: https://dev.os9.ca/techpubs/mac/HIGOS8Guide/thig-7.html
