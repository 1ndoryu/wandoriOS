# Plan 138A-5..12 — Constructor de mundo v2: toolkit de edición (2026-08-14)

> **Estado:** ACTIVO — 138A-12 completado (gate PASS); 138A-13 (investigación
> del pipeline anime/cel de Sakura Crossing) cerrado como documental;
> **138A-14 (fix de assets) cerrado** (gate PASS, validación visual pendiente)
> y **138A-15 (estilo Sakura Crossing) cerrado** (plan propio archivado en
> `Agente/planes/completados/`). Próximos bloques del toolkit según
> `roadmap.md`.
> **Rama:** `wandorius` · **Gates:** `npm run gate:check -- 138A-5` …
> `npm run gate:check -- 138A-12`
> **Fuente de contexto:** decisiones de producto 2026-08-13/14 (motor propio,
> estilo Genshin-like low poly, sin indicadores, mundo único cap 32), cierre
> 138A-4 (constructor completo) y veredictos de cierre: supervisor_reviewer
> **APROBADO CON RESERVAS** (fuga de material del agua corregida en `bcc6648c`;
> observaciones menores: `cellSize` sin propagar al preview, campo `style` sin
> consumir, import sin validación cruzada opciones↔mapa, error de lectura de
> import silencioso) y sentinel_inspector **OK CON OBSERVACIONES, ACCION:
> ninguna**. Referencias de diseño incorporadas el 14-ago:
> `Agente/documentacion/design-system/referencia-contour-terrain-editor-2026-08-14.md`
> (artefacto Claude; su modelo de capas moldea 138A-9/138A-10) y
> `Agente/documentacion/design-system/referencia-skydome-clouds-2026-08-14.md`
> (artefacto Claude; su skydome/nubes por capas moldea 138A-12). Referencia de
> estilo opcional (14-ago): `Agente/documentacion/estilo-sakura-crossing/`
> (investigación 138A-13 sobre el pipeline anime/cel de Sakura Crossing, por
> si el usuario decide probar ese look sobre el constructor; no cambia la
> decisión "sin tinta" vigente).

## 1. Contexto y decisión del usuario (2026-08-14)

El usuario pidió *"planifica todo esto a continuacion"* con la siguiente lista
(se conserva el orden original):

1. Cuando se cambie un valor, se cambie en tiempo real.
2. Dividir el panel de terreno en paneles pequeños, agrupados en un panel
   lateral con iconos (tipo Blender): al hacer clic en un icono salen las
   opciones.
3. Auditar principios SOLID y arquitectura a todo lo relacionado con el juego.
4. Eliminar los árboles del modo suave.
5. Dejar 2 estilos: bloque y suave.
6. Poder cambiar el tamaño de los bloques.
7. Auditar solo el rendimiento.
8. Que los valores no se pierdan al recargar.
9. Poder añadir bloques y sus variantes, quitar árboles y añadir rocas.
10. "Las cosas van más pequeñas".
11. Poder elegir entre 3 modos de cámara: primera persona, libre y 3ª persona.
12. Poder cambiar todos los colores en un panel especializado.
13. Panel para cambiar las texturas o agregarlas.
14. Panel para manejar todos los assets.

### Ajustes del usuario (14-ago, tarde)

Al ver la base 138A-5/6 el usuario precisó y amplió el alcance (se integran
al plan; "no sé si ya están pero es para asegurarnos y agregar lo que falte"):

1. **`juegoConstructor` es una ventana dentro del juego:** panel lateral
   completo (alto total), **sin título**, ocultable hacia los lados y con
   **ancho redimensionable**; cuando está oculto, su cabecera
   (`juegoConstructor__cabecera`) va en vertical.
2. **No se editan modelos en el constructor** (eso es trabajo de Blender);
   lo que sí se controla es su **posición/movimiento** (transform). Cambiar
   texturas es deseable **si es viable técnicamente**; si no, queda
   documentado como deuda.
3. **Manejo de assets:** arrastrar, quitar, etc. (no solo inventario pasivo).
4. **Editor de mapa por estilo:** como hay 2 estilos, cada uno tiene un
   editor distinto. En **suave**: pintar caminos, dibujar dónde hay arena,
   dónde hay agua, subir/bajar terreno, etc. En **bloques**: colocar/quitar
   bloques y variantes.
5. **Generador de pasto:** el pasto se genera donde corresponde al generar un
   mundo aleatorio (lo más óptimo posible), con densidad, tamaño y color
   elegibles, y se puede pintar dónde quitarlo y dónde ponerlo.

### Referencia de diseño: Contour Terrain Editor (14-ago, tarde)

Se incorpora `Agente/documentacion/design-system/
referencia-contour-terrain-editor-2026-08-14.md` (artefacto público de
Claude, con URL y código completo). Su lección principal: **las
modificaciones al terreno son capas** — un stack de formas evaluadas de
arriba abajo ("later shapes win") donde cada forma pregunta a cada vértice
"¿a qué distancia estoy de ti?" (SDF) y convierte esa distancia en un peso
que decae con un **falloff** (curva elegible y bias) y tira del vértice hacia
una altura (`y = mix(y, height, w)`), con **blend** `set/add/max/min`,
**taper** para ríos que bajan/ensanchan, alturas por punto y gizmo de
transformación. Se adapta al plan:

- **138A-9 pasa de "pinceles sueltos" a un stack de capas serializable**
  (caminos, arena, agua, elevación) con orden, visibilidad, blend y
  reordenamiento; los pinceles de la presentación crean/editan capas, no
  mutan el heightfield directo.
- **138A-10 reutiliza el modelo de capas** para la máscara de pasto
  (poner/quitar = capa de vegetación con blend y cuota).
- **138A-8 hereda del artefacto** el patrón de panel lateral compacto con
  slider + readout sincronizado y secciones pequeñas (ya previsto en 138A-5).

### Referencia de diseño: Skydome Procedural Painted Clouds (14-ago, noche)

Se incorpora `Agente/documentacion/design-system/
referencia-skydome-clouds-2026-08-14.md` (artefacto público de Claude, con
URL y código completo). Su lección principal: **el cielo es un shader a
pantalla completa (skydome), no una esfera texturizada** — nubes "pintadas"
proceduralmente con una rampa posterizada + lookup de paleta
(`deep/shadow/mid/light/high`, estilo óleo), dos capas de nubes (cerca/lejos
con cobertura, octavas, escala y deriva), self-shadow barato muestreando
hacia el sol, *silver lining* en bordes finos y disco/glow solar. Las luces
reales (`DirectionalLight` + `HemisphereLight`) se mueven con el mismo vector
solar, de modo que los controles del panel cambian cielo y sombras a la vez;
el panel lateral compacto usa secciones colapsables con slider + readout en
vivo y presets de paleta (cada preset con su elevación/azimut de sol). Se
adapta al plan:

- **Nuevo bloque 138A-12 — Cielo y ambiente:** skydome procedural en la capa
  de presentación con paleta serializable, dos capas de nubes con
  cobertura/deriva/octavas, luz direccional + ambiental sincronizadas al
  mismo vector solar, presets y panel compacto de ajustes en vivo.
- **138A-8 hereda del artefacto** el patrón de panel lateral colapsable con
  slider + readout en vivo (mismo patrón que ya aporta el artefacto Contour).

### Referencia de diseño: GrassSystemThreeJS / Soil Studio (14-ago, noche)

Se incorpora `https://github.com/achrefelouafi/GrassSystemThreeJS` (repositorio
MIT del "Soil Studio": terreno procedural + pasto en Three.js) como **referencia
para el generador de pasto de 138A-10**. Su lección principal: **el pasto es
GPU-instanced** — un solo `InstancedMesh` (una draw call) donde cada hoja se
coloca, se curva con el terreno y se anima con viento en el vertex shader,
pegada al mismo heightfield para que siga las montañas y los huecos en vivo;
el campo de viento es coherente en world-space (dirección, fuerza, velocidad y
tamaño de ráfaga) con flutter por hoja. El usuario avisa que **no está bien
optimizado**, así que la adaptación al plan debe ser estrictamente orientada a
rendimiento:

- **138A-10 adopta** el patrón GPU-instanced de una draw call con curva/animación
  en el vertex shader y altura muestreada del heightfield, **pero** con los
  presupuestos del proyecto (chunks ≤1024, instancias ≤10000), merged geometry
  por chunk, regeneración solo de la zona afectada al pintar y teardown sin
  fugas (geometrías/materiales liberados); la versión del repo (mesh único
  global, sin chunking ni presupuestos) queda como referencia de técnica, no
  como código a copiar.
- Densidad/tamaño/color y pincel poner/quitar siguen como capa de vegetación
  del stack de 138A-9 (cuotas fail-closed).

### Correcciones del usuario al ver el constructor (14-ago, noche)

Al probar el constructor el usuario detectó dos problemas de diseño y un bug
y pidió ajustar el plan antes de seguir:

1. **El panel de Assets debe ser un EXPLORADOR en cuadrícula con miniatura**
   de cada asset que realmente existe en el manifiesto (gestor de assets:
   ver, arrastrar al mundo, quitar, limpiar), no una lista de instancias
   actuales. La vista es **cuadrícula + miniatura por asset**, con su nombre
   y recuento; el inventario de instancias (qué hay colocado y dónde) no se
   mezcla en esa vista.
2. **Los assets se adaptan al modo activo:** en el estilo `bloques` los
   árboles/rocas del terreno son **bloques del mesher**, no assets low-poly;
   en `suave` son props low-poly. El explorador muestra **assets de bloque y
   assets suaves** según el modo, y el render del documento NO debe pintar
   props low-poly encima de bloques ni duplicar vegetación al recargar.
  3. **Bug de recarga:** al reiniciar se regeneraban árboles/rocas que "se ven
     mal" y tapaban/borraban los buenos: la reconstrucción del documento
     (`rebuildDocumentProps`) pintaba props low-poly sobre los bloques del
     mesher y competía con la vegetación generada. La causa raíz es la
     duplicación de fuentes (generada vs documento) y la falta de adaptación
     por estilo. El arreglo aterriza en 138A-9 (render por estilo y una sola
     fuente de props) y el visor de capas de 138A-9 es **solo el stack de
     terreno**, no una colocación de assets sobre el mapa.
4. **Cámara libre y primera persona (14-ago, noche):** al probar los modos,
   "libre" no se comporta como cámara libre: la órbita sigue pegada al
   personaje (se siente como una 3ª persona estática). Se corrige en 138A-9:
   **libre = vuelo libre** (desacoplada del personaje, WASD + mouse look con
   límites del mundo), **primera = ojos del personaje ocultando la figura
   local** (el cuerpo del personaje no debe verse desde sus propios ojos), y
   **3ª persona = órbita siguiendo al personaje** (comportamiento actual).
   El visor/personaje local se oculta por modo, no por propiedad global.
5. **Límite de movimiento "como encerrado en un chunk" (14-ago, noche):** con
   el constructor activo no se puede recorrer todo el terreno: la simulación
   y el clamp de cámara usan los bounds del **fixture** (mapa pequeño del
   runtime), mientras el terreno del constructor (MapVersion) se extiende
   mucho más; se queda uno "encerrado" dentro del área del fixture. Se
   corrige en 138A-9: cuando `showConstructorWorld` está activo, el clamp de
   cámara (libre/primera/tercera) y la simulación del jugador usan los
   **bounds del MapVersion del constructor** (centrados en la misma isla),
   no los del fixture; al salir del constructor se vuelve a los bounds
   originales. Test: recorrer hasta los bordes del constructor y no quedar
   atascado antes.

El editor de mapa de 138A-9 queda definido como un **visor de capas tipo
Blender**: lista del stack (orden, ojo de visibilidad, duplicar/eliminar,
reordenar) y pinceles que crean/editan capas; **nunca** se muestran "todos
los assets en el mapa" desde ese panel. El manejador de assets es un panel
separado (138A-8) con su cuadrícula y su drag al mundo.

### Correcciones del usuario al probar el constructor (14-ago, noche) — assets

Al probar el explorador de assets el usuario detectó un bug de recarga y una
mejora de previsualización, y pidió anotarlas en el plan (se implementan en
138A-14):

6. **Bug: `inst-0 · asset-rock` reaparece al recargar.** Al quitar una
   instancia de un asset (p. ej. `inst-0` de `asset-rock`) y recargar la
   página, la instancia se vuelve a poner. Hipótesis de causa raíz: la
   restauración del documento vuelve a materializar la instancia 0 de cada
   asset, o el remove no queda serializado en la fuente única de props de
   138A-8/138A-9 (se persiste la generación, no el estado editado). Fix
   esperado: el remove debe persistir en el documento/JSON y la restauración
   NO debe regenerar instancias eliminadas. Test: quitar instancia →
   recargar (y export/import) → la instancia NO reaparece y el resto del
   documento se conserva.
7. **La previsualización debe mostrar el modelo 3D real del asset.** En el
   explorador de assets (cuadrícula con miniatura de 138A-8), la miniatura
   actual no muestra el modelo real (placeholder/icono). Debe renderizar el
   prefab/mesher real del asset (cámara isométrica por asset, fondo
   transparente, sin luces extra del mundo), con miniaturas lazy/cacheadas
   para no afectar el frame loop del editor y teardown limpio.

## 2. Objetivo

Convertir el constructor de mundo (138A-4) en un **toolkit de edición tipo
estudio**: ventana lateral completa (colapsable a los lados, sin título y con
ancho redimensionable) con subpaneles por iconos, regeneración en vivo,
persistencia local, dos estilos (`bloques`/`suave`) con editor de mapa propio
para cada uno, generador de pasto optimizado y pintado, transform de objetos
(sin edición de modelos), paneles de colores/texturas/assets con arrastrar y
quitar, tres modos de cámara y dos auditorías (SOLID/arquitectura y
rendimiento) con evidencia. Se mantiene el flujo canónico
`TerrainOptions → buildMapVersionFromOptions → MapVersion` y `game-core` puro
(sin Three/DOM/red).

## 3. Bloques y alcance

### 138A-5 — UI tipo Blender + tiempo real + persistencia

- **Panel lateral por iconos:** barra vertical de iconos (tipo Blender); cada
  icono abre/cierra un subpanel pequeño con opciones agrupadas (Terreno,
  Mundo/Estilo, Cámara, Objetos, Color, Textura, Assets). Reemplaza la sección
  única "Constructor" del panel actual (`game-world-constructor.ts`), sin
  romper el contrato de `WorldConstructorControls` (los callbacks se
  conservan).
- **Tiempo real:** cada cambio de valor regenera el mundo con debounce
  (~200 ms), cancelando regeneraciones en vuelo (última gana); stats y
  documento actualizados sin perder el estado del panel. Sliders/inputs emiten
  `input`, no `change` a la espera.
- **Persistencia:** las opciones, estilo, cámara y paleta se guardan en
  `localStorage` (clave versionada `wandorius:constructor:v1`) y se restauran
  al recargar; export/import JSON sigue siendo la fuente portable. Sin backend.

**Checklist:**
- [x] `game-world-constructor.ts` se divide en subpaneles por tema sin duplicar
      lógica de controles (helper compartido de campo/slider/select).
- [x] Iconos con accesibilidad (tooltip + teclado) y tokens del OS; un solo
      subpanel abierto a la vez.
- [x] Debounce de regeneración con cancelación; test DOM (N cambios rápidos →
      1 regeneración) y teardown de timers.
- [x] Persistencia `localStorage` versionada con restauración fail-closed y
      limpieza en teardown.
- [x] Gate 138A-5 PASS (pendiente la validación visual del usuario en
      `/forest-playable`, que se hace al probar el bloque).
- [x] Corrección por feedback del usuario (14-ago): el rail de iconos es el
      panel **exterior** (cabecera colapsable "Constructor") y los controles
      del terreno clásico son secciones suyas ("Isla" y "Estilos"), no al
      revés. `mountWorldConstructor` acepta `extraPanels`/`title`; el panel
      clásico queda solo para el modo legacy sin constructor.

### 138A-6 — Dos estilos, sin árboles en suave, cellSize real, escala menor

- **2 estilos:** `bloques` y `suave`; se retira `actual` del contrato
  `TerrainOptions.style` y del comparador. La isla curva queda solo como
  referencia histórica/experimento (sin selector en el constructor).
- **Sin árboles en suave:** el modo suave deja de colocar árboles
  (`maxTrees=0` o retirada del presupuesto); conserva césped y rocas.
- **Tamaño de bloques:** `cellSize` se propaga al preview (bloques y suave),
  agua, ground y pick del comparador (corrige el hallazgo menor del revisor);
  cambiar "Celda" regenera el mundo en tiempo real y el documento escala igual.
- **Escala menor:** escala base de vegetación/props reducida (~0.5× por
  defecto) para que las cosas "vayan más pequeñas"; la interpretación exacta
  se ajusta probando en navegador (decisión abierta documentada en §7).

**Checklist:**
- [x] `TerrainOptions.style` restringido a `'bloques'|'suave'`; consumidores y
      tests actualizados (comparador, panel, serialización).
- [x] Sin árboles en suave (tests de presupuesto/instancias).
- [x] `cellSize` consumido por meshers, agua y pick; test de paridad preview↔
      documento con `cellSize=2`.
- [x] Escala base menor parametrizada (constante en game-core, no mágica en el
      adaptador) con tests de presupuesto.
- [x] Gate 138A-6 PASS + validación visual del usuario en `/forest-playable`.

### 138A-7 — Tres modos de cámara

- **Libre (orbital):** comportamiento actual (arrastre + rueda).
- **Primera persona:** WASD + mouse look desde el punto de vista del jugador,
  con límites del mundo y colisión básica de suelo existente.
- **3ª persona:** cámara que sigue al personaje (distancia/ángulo
  configurables) con colisión contra el terreno.
- Selector en el panel de Cámara y atajo de teclado; el modo se persiste
  (138A-5) y se restaura al recargar; teardown limpio de listeners/RAF.

**Checklist:**
- [x] `CameraMode` tipado y controlador por modo en la capa de presentación
      (sin lógica de cámara en `game-core`; solo contratos).
- [x] Tests DOM de cambio de modo y restauración; teardown sin RAF/listeners
      colgados.
- [x] (corrección 14-ago, noche) Libre = vuelo libre desacoplado del
      personaje; primera persona oculta la figura local (ojos del personaje);
      3ª persona conserva la órbita; bounds de movimiento/cámara = MapVersion
      del constructor cuando está activo (no los del fixture). Tests de modo
      con figura visible/oculta y de recorrido hasta los bordes del mundo.
- [x] Gate 138A-7 PASS + validación visual del usuario (los 3 modos).

### 138A-8 — Panel-ventana, transform de objetos y paneles de Color, Textura y Assets

- **Panel-ventana:** `juegoConstructor` pasa a ser una ventana lateral
  completa (alto total del viewport del juego) **sin título**, colapsable
  hacia los lados (izquierda/derecha) y con **ancho redimensionable** por
  arrastre del borde (mín/máx sensatos); al ocultarse, la cabecera
  `juegoConstructor__cabecera` se muestra **vertical** (rail plegado con
  iconos y handle para desplegar). Estado colapsado/ancho persistidos con
  138A-5. Sin perder el rail de iconos existente.
- **Transform de objetos (no edición de modelos):** controlar **posición y
  movimiento** de bloques, variantes, árboles, rocas y césped sobre las
  instancias del `MapVersion` (selección + mover/colocar); **sin** editar
  geometría/modelos (eso es Blender). Las ediciones son capa posterior a la
  generación y se exportan en el JSON (los pinceles del editor 2D
  297A-64..71 son referencia de operaciones).
- **Panel de Color:** paleta unificada del mundo (terreno, agua, vegetación,
  rocas, bloques y variantes) centralizada en `game-core` (tokens/paleta
  serializable), persistente y aplicable en tiempo real.
- **Panel de Textura:** cambiar o agregar texturas/rampas por material
  (carga local con file input o URL; sin subida a servidor); validación de
  imagen y teardown de object URLs. **Viabilidad técnica a evaluar al inicio
  del bloque:** si el cambio de texturas por material no es viable con el
  mesher actual, se documenta como deuda con alternativa (color/rampas) en
  vez de bloquear el bloque.
- **Panel de Assets (corregido 14-ago, noche):** **explorador en cuadrícula
  con miniatura por asset** de los assets que realmente existen en el
  manifiesto, adaptado al modo activo (`bloques` → prefabs de bloque del
  mesher; `suave` → props low-poly). Acciones: arrastrar al mundo (colocar),
  quitar por asset, limpiar categoría y **visibilidad por asset**; el recuento
  por asset acompaña a su miniatura. Sin import de modelos externos en este
  bloque. **Fix de recarga:** una sola fuente de props (documento) que
  renderiza según estilo y no duplica vegetación generada ni pinta low-poly
  sobre bloques. **Corrección pendiente (138A-14, feedback 14-ago noche):**
  el remove de instancias (`inst-0 · asset-rock`) debe persistir al recargar
  y las miniaturas deben mostrar el modelo 3D real del asset, no un
  placeholder/icono.

**Checklist:**
- [x] Panel-ventana: alto total, sin título, colapsable a los lados, ancho
      redimensionable y cabecera vertical al ocultar; estado persistido.
- [x] Operaciones de transform puras en `game-core`
      (`editMapVersionObjects`: mover/colocar/quitar/setScale) con cuotas
      fail-closed y tests; sin edición de geometría/modelos.
- [x] Paneles Color/Textura/Assets con tokens del OS, ≤300 líneas cada uno y
      tests DOM; persisten con 138A-5.
- [x] Texturas/rampas sin fugas de materiales (`applyToonRamp` libera la
      textura anterior; la carga usa data URL local, sin object URLs que
      revocar — deuda de textura por material documentada).
- [x] Gate 138A-8 PASS + pendiente validación visual del usuario en
      `/forest-playable`.

### 138A-9 — Editor de mapa por estilo con capas (suave y bloques)

- **Modelo de capas (lección del Contour Terrain Editor):** las
  modificaciones del terreno son un **stack de capas** evaluadas de arriba
  abajo ("later layers win"), no mutaciones destructivas del heightfield.
  Cada capa es un objeto puro serializable:
  - **Tipo de contenido:** camino (color/desgaste de ruta), arena, agua
    (máscara de bioma/costa) o elevación (subir/bajar).
  - **Forma/alcance:** círculo (pincel), curva Bézier, polígono o máscara
    pintada; la distancia con signo (SDF) a la forma se convierte en un peso
    que decae con **falloff** (distancia + curva elegible: linear, smooth,
    gauss, dome, spike, hard) y **bias** (`y = mix(y, height, w)`).
  - **Elevación y blend:** la capa pide una altura/elevación (absoluta o
    delta) y se mezcla con `blend ∈ set | add | max | min`; **taper**
    interpola altura/falloff a lo largo de una curva (ríos que bajan y se
    ensanchan).
  - **Orden/visibilidad:** cada capa tiene `enabled` y posición en el stack;
    se reordena, duplica, oculta y elimina desde el panel (referencia del
    artefacto).
- **Editor por estilo:** cada uno opera sobre su propio mesh/instancias del
  `MapVersion`:
  - **Suave:** los pinceles **pintan capas** (caminos, arena, agua,
    subir/bajar con falloff de pincel); la regeneración aplica el stack
    sobre la base generada con deltas acotados y solo sobre la zona
    afectada, sin full-rebuild innecesario.
  - **Bloques:** **colocar/quitar bloques y variantes** (prefabs del
    toolkit) sobre la malla de celdas, con validación de cuotas y
    regeneración local de la celda afectada.
- Las capas viven en **`game-core`** (aplicador de stack puro con
  SDF/falloff/blend, cuotas fail-closed y tests de presupuesto); los
  pinceles viven en la capa de presentación (pointer → celda/mundo, mismo
  `pick` del comparador). El stack completo se **serializa en el JSON del
  mundo** y se restaura al recargar (138A-5).

- **El panel es un VISOR DE CAPAS tipo Blender (corrección 14-ago, noche):**
  lista del stack con **ojo de visibilidad**, orden, duplicar/eliminar y
  reordenar; el pincel activo crea/edita una capa, y el panel **nunca**
  coloca "todos los assets sobre el mapa" (eso es el manejador de assets de
  138A-8). Una capa pintada y una capa círculo son ambas formas del mismo
  stack; la vista muestra el contenido de cada capa (camino/arena/agua/
  elevación) con su miniatura de forma.

**Checklist:**
- [x] Módulo de capas puro en `game-core` (SDF + falloff + blend
      `set/add/max/min` + taper) con cuotas, tests de presupuesto y paridad
      preview↔documento.
- [x] Visor de capas tipo Blender (orden, ojo de visibilidad, duplicar/
      eliminar) + pinceles suave (caminos/arena/agua/subir-bajar) y bloques
      (colocar/quitar variantes) en la presentación con teardown; sin colocar
      assets sobre el mapa desde este panel.
- [x] (corrección 14-ago, noche) Assets como explorador en cuadrícula con
      miniatura + adaptación por estilo (bloques/suave) + fix de recarga sin
      duplicar props (una sola fuente por estilo).
- [x] Stack serializado/exportado en el JSON y restaurado al recargar.
- [ ] Gate 138A-9 PASS + validación visual del usuario en `/forest-playable`
      (pendiente el veredicto de cierre y la prueba del usuario).

### 138A-10 — Generador de pasto optimizado y pintado

- **Generación procedural:** el pasto se genera **donde corresponde** al
  generar un mundo aleatorio (zonas de suelo/altura/vegetación según
  presupuestos existentes), **lo más óptimo posible**: instancing/merged
  geometry por chunk, sin objetos por hoja, presupuesto máximo configurable y
  regeneración solo de la zona afectada al pintar. Referencia de técnica:
  `GrassSystemThreeJS` (GPU-instanced, una draw call, curva/viento en el vertex
  shader pegada al heightfield); adaptación orientada a rendimiento (chunking,
  presupuestos y teardown; no copiar el mesh global sin límites del repo).
- **Parámetros elegibles:** **densidad**, **tamaño** y **color** desde el
  panel (persisten con 138A-5 y se regeneran en tiempo real con debounce).
- **Pintado:** pincel para **poner y quitar** pasto sobre el mundo (máscara
  de vegetación por instancia), con cuota fail-closed y teardown limpio; la
  máscara se modela como **capa de vegetación** del mismo stack de 138A-9
  (reutiliza orden/blend/cuotas del aplicador de capas).

**Checklist:**
- [x] Generador de pasto por chunks con instancing y presupuesto (test de
      draw calls/instancias y de regeneración de zona).
- [x] Densidad/tamaño/color configurables, persistidos y en tiempo real.
- [x] Pincel poner/quitar pasto con cuotas y teardown; export/import JSON.
- [ ] Gate 138A-10 PASS + validación visual del usuario en `/forest-playable`
      (pendiente el veredicto de cierre y la prueba del usuario).

### 138A-11 — Auditorías SOLID/arquitectura y rendimiento

- **Auditoría SOLID/arquitectura** de todo lo relacionado con el juego
  (`game-core`, comparador, paneles, escena, renderer metrics, realtime):
  SRP/OCP/DIP/ISP/LSP, límites de líneas (componentes/CSS ≤300, hooks ≤120,
  utils ≤150), contratos, teardown y deuda acumulada (campo `style` muerto,
  validación cruzada del import, error silencioso de lectura, escena a 624
  líneas efectivas —extraer un controlador de cámara por modo desde 138A-7:
  `updateCamera` + handlers en `game-camera-controls.ts`— y colisión de 3ª
  persona de punto único —muestrear el segmento jugador→cámara—). Documentar
  hallazgos y corregir los materiales.
- **Auditoría de rendimiento dedicada:** benchmark reproducible (generar N
  mundos, medir ms por generación, draw calls, instancias, geometrías/
  materiales vivos antes/después de N regeneraciones y tras `dispose`),
  revisión de presupuestos (chunks ≤1024, instancias ≤10000, octaves, pasto
  instanciado), memory/GPU con las métricas existentes (`readRendererMetrics`
  + GPU probe) y corrección de hallazgos con tests.

**Checklist:**
- [x] Informe de auditoría SOLID con hallazgos por módulo y fixes aplicados
      (o deuda documentada con ticket).
- [x] Informe de auditoría de rendimiento con números y presupuestos
      verificables; sin fugas de material/geometría tras regeneración (test de
      ciclo de vida ampliado a geometrías).
- [ ] Gate 138A-11 PASS (14-ago, evidencia en `.quality-reports/check/138A-11/`)
      + validación visual del usuario en `/forest-playable` (pendiente).

### 138A-12 — Cielo procedural (skydome) y ambiente

- **Skydome shader procedural** (adaptación de
  `referencia-skydome-clouds-2026-08-14.md`): cielo a pantalla completa con
  rampa posterizada + paleta `deep/shadow/mid/light/high` estilo óleo; sin
  esfera texturizada. Paleta serializable y persistente (se integra al panel
  de Color de 138A-8).
- **Nubes pintadas por capas:** dos capas (cerca/lejos) con cobertura,
  octavas, escala y deriva; self-shadow barato hacia el sol, *silver lining*
  y disco/glow solar; presupuestos de instrucciones/temps verificables.
- **Luces sincronizadas:** `DirectionalLight` + `HemisphereLight` movidas por
  el mismo vector solar del shader; los controles cambian cielo y sombras a
  la vez. Presets de paleta con elevación/azimut del sol.
- **Panel compacto de ambiente:** secciones colapsables con slider + readout
  en vivo (cobertura, octavas, deriva, influencia solar, tamaño/glow del sol,
  presets) dentro del rail de iconos de 138A-5; persistencia y teardown.

**Checklist:**
- [x] Shader de skydome en la capa de presentación con paleta y parámetros
      serializables (sin fugas de programa/material; teardown limpio).
- [x] Dos capas de nubes + self-shadow + sol (disco/glow) con presupuesto y
      tests de renderer metrics.
- [x] Luces reales sincronizadas al vector solar + presets + panel compacto
      en vivo con persistencia (138A-5).
- [x] Gate 138A-12 PASS (14-ago, evidencia en `.quality-reports/check/138A-12/`)
      + validación visual del usuario en `/forest-playable` (pendiente).

**Deuda ticketizada (138A-12):**
- `sky-options.ts` (303 líneas efectivas) supera el límite de 300: dividir
  presets/límites en un archivo propio en un próximo bloque.
- Sombras reales de terreno (`renderer.shadowMap`) NO habilitadas a propósito:
  el sol direccional ya ilumina el terreno y el shader hace su propio
  self-shadow de nubes; si se quieren sombras proyectadas de props/terreno,
  abrir bloque propio con presupuesto y cámara de sombra que siga la zona
  jugable (el `castShadow` muerto se retiró tras revisión).
- Coste GPU del fragment shader a pantalla completa pendiente de medir en
  `/forest-playable` con `gpuFrameProbe` (validación visual del usuario).

### 138A-14 — Fix de assets: remove persistente de instancias y miniaturas 3D reales (cerrado)

Feedback del usuario al probar el explorador de assets (14-ago, noche; anotado
en "Correcciones del usuario al probar el constructor — assets"):

- **Remove persistente de instancias:** `inst-0 · asset-rock` (y cualquier
  instancia eliminada) NO debe reaparecer al recargar ni al export/import.
  El documento/JSON debe serializar las instancias eliminadas (o el estado
  editado del documento como fuente única, 138A-8/138A-9) y la restauración
  no debe regenerarlas desde el manifiesto/vegetación.
- **Miniaturas con el modelo 3D real:** el explorador de assets renderiza el
  prefab/mesher real por asset (cámara isométrica por asset, fondo
  transparente, sin luces del mundo), lazy/caché para no afectar el frame
  loop del editor y teardown de renderers/temporales.

**Checklist:**
- [x] Test de persistencia: quitar instancia → recargar/export-import → no
      reaparece; el resto del documento se conserva.
- [x] Regeneración en vivo (seed/densidad) no reaparece la instancia quitada
      ni pierde el id vivo (revisor H-1).
- [x] Miniaturas 3D reales por asset (render offscreen/isométrico, caché y
      teardown) sin impacto medible en el frame loop del editor.
- [x] Gate 138A-14 PASS (13 archivos, solo warnings de deuda conocida).
- [ ] Validación visual del usuario en `/forest-playable`.

## 4. Fuera de alcance

- Backend, realtime, identidad, colisión avanzada, simulación y multijugador
  (cap 32) — siguen pendientes en GAME-01.
- Extraer `glory-render` a repo separado (018A-96 sigue condicionado a un
  segundo consumidor real).
- Importar el pack Synty (Polygon Meadow Forest) como dependencia: queda como
  referencia visual; el motor/toolkit propio se mantiene.
- **Edición de modelos/geometría en el constructor:** fuera de alcance por
  decisión del usuario (14-ago); los modelos se hacen en Blender y el
  constructor solo los posiciona/transforma.
- Subida de texturas/assets a servidor (solo local en este plan).
- Migrar `game-core` a otro framework o renderer.

## 5. Dependencias

- 138A-4 cerrado (cumplido, ver fuente de contexto).
- 138A-5 precede a 138A-6/7/8 (persistencia y UI por iconos son la base).
- 138A-8 reutiliza contratos de `MapVersion` y, como referencia de
  operaciones, el editor 2D de mapa (297A-64..71).
- 138A-9 se apoya en el heightfield/máscaras existentes del comparador y en
  el editor 2D (297A-64..71) como referencia de pinceles; su modelo de capas
  (stack + SDF + falloff + blend) se adapta de
  `Agente/documentacion/design-system/referencia-contour-terrain-editor-2026-08-14.md`.
- 138A-10 se apoya en el presupuesto de vegetación (138A-6) y en las
  métricas de renderer para el pasto instanciado.
- 138A-11 se apoya en métricas existentes (`readRendererMetrics`, GPU probe) y
  en el test de ciclo de vida del agua (`game-procedural-comparator.test.ts`).
- 138A-12 se apoya en el patrón de materiales únicos y teardown del
  comparador (`game-toon-water.ts`, `game-procedural-comparator.ts`) y en la
  referencia
  `Agente/documentacion/design-system/referencia-skydome-clouds-2026-08-14.md`.

## 6. Definition of Done (por bloque)

- Gate `npm run gate:check -- <ID>` PASS con su propio ID.
- `npx tsc --noEmit` limpio y suite frontend completa PASS (`npm run test:full`).
- Auditorías (SOLID o rendimiento) con evidencia cuando aplique el bloque.
- Validación real del usuario en navegador `/forest-playable` para cambios
  visuales materiales.
- Roadmap/plan/completada actualizados solo con evidencia; sin locks,
  procesos, worktrees ni temporales de la tarea.
- Commit explícito por bloque; push solo con autorización.

## 7. Decisión abierta (asunción del plan)

- **"Las cosas van más pequeñas":** se planifica como escala base de
  vegetación/props reducida (~0.5×) + `cellSize` visible en el preview. Si el
  usuario se refiere a otra cosa (p. ej. tamaño del mundo, cámara o bloques),
  se ajusta la constante antes de implementar 138A-6.
- **Persistencia:** `localStorage` del navegador (herramienta local, sin
  backend). Si se quiere persistencia por cuenta/workspace, es un cambio de
  alcance que se planifica aparte.
- **Retirada de `actual`:** el estilo histórico queda fuera del constructor;
  si el usuario quiere conservarlo como tercer estilo "referencia", se reduce
  el alcance de 138A-6.
- **Texturas por material:** la viabilidad se evalúa al arrancar 138A-8; si
  el mesher actual no permite texturas por material, se documenta la deuda y
  se prioriza color/rampas en su lugar.
