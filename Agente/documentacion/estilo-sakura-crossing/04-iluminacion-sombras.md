# Iluminación anime 2+1 y sombras

> Código fuente: `C:\tmp\sakura-crossing\src\main.js:25-78` (renderer y luces)
> y `main.js:143-168` (luces que siguen al jugador).

## 1. Configuración del renderer

```js
// main.js:25-41
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setClearColor(new THREE.Color(PAL.fog), 1);
```

Decisiones:

- **`antialias: false`**: el AA se hace después con FXAA en el postprocesado,
  no en el rasterizador. Renderizar sin AA a pantalla completa es más barato y
  le da al pipeline el control total de la imagen.
- **`NoToneMapping`**: el tono y el paso a sRGB los hace el shader `grade`
  manualmente, con el split-tone incluido. Si se dejara `ACESFilmicToneMapping`
  o la conversión automática de three, el color grading pelearía contra el
  look anime.
- **`setPixelRatio(1)`**: la resolución la decide el `Pipeline.setSize`
  (escala 1.5-2× con presupuesto de píxeles), no el DPR del sistema. Esto
  permite "supersamplear" para líneas limpias sin depender del monitor.
- **`PCFShadowMap`**: sombras suaves con coste moderado, sin look de sombra
  dura PCF básica.
- **Clear color = `PAL.fog`**: los huecos del mundo son niebla, no negro.

## 2. Las cuatro luces (2+1 + hemisfera)

```js
// main.js:45-78
const sun = new THREE.DirectionalLight(PAL.sun, 2.25);
sun.position.set(-52, 62, 56);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -34;
sun.shadow.camera.right = 34;
sun.shadow.camera.top = 34;
sun.shadow.camera.bottom = -34;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 200;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.035;
scene.add(sun);
scene.add(sun.target);

// Cool bounce from the opposite quarter. This carries most of the shadow
// side of every surface, so it is deliberately strong.
const fill = new THREE.DirectionalLight(PAL.fill, 1.08);
fill.position.set(48, 26, -44);
scene.add(fill);
scene.add(fill.target);

// a second, weaker bounce from below-front stops undersides going flat black
const bounce = new THREE.DirectionalLight(0xd8cbe8, 0.34);
bounce.position.set(10, -18, 40);
scene.add(bounce);
scene.add(bounce.target);

const hemi = new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, 1.12);
scene.add(hemi);
```

### Por qué "2+1"

| Luz | Color | Intensidad | Dirección | Papel |
| --- | ----- | ---------- | --------- | ----- |
| `sun` | `0xfff1d8` (cálido) | **2.25** | (-52, 62, 56) | Key: define bandas cel, proyecta sombras |
| `fill` | `0xa9bdf5` (frío) | **1.08** | (48, 26, -44), opuesto al sol | Llena el lado sombra con color |
| `bounce` | `0xd8cbe8` (violeta) | **0.34** | (10, -18, 40), desde abajo | Evita caras inferiores negras |
| `hemi` | `0xdcecff` / `0xb6a6c6` | 1.12 | — | Ambiental: cielo frío, suelo violeta |

La combinación con el parche `uShadowTint` del material es la clave: la banda
oscura del toon ya se tiñe de violeta en el material (`mix(uShadowTint,
vec3(1.0), celBand)`), y la hemisfera con `hemiGround 0xb6a6c6` refuerza ese
mismo violeta en la parte ambiental. **La sombra anime no es ausencia de luz:
es luz fría/violeta.**

Las intensidades son **altas** (2.25 de key): el `NoToneMapping` no comprime,
así que las luces deben ser >1 para que las bandas claras se llenen; con
intensidad 1.0 y NoToneMapping la escena queda apagada.

### Configuración de sombra del sol

- `mapSize 2048×2048`: nitidez suficiente para el alcance ±34.
- Cámara ortográfica ±34 con near 1 / far 200: solo lo que está cerca del
  jugador recibe sombra; el mundo lejano no paga el coste.
- **`bias = -0.0004`**: empuja las muestras para evitar *shadow acne* en
  superficies casi paralelas al sol.
- **`normalBias = 0.035`**: desplaza la muestra según la normal; es la
  herramienta principal contra el acne en geometría faceteada (low poly con
  `flatShading`), que es justo la que usa el estilo.

## 3. La cámara de sombra sigue al jugador (sin parpadeo)

El mundo es un planeta y las luces son direccionales "fijas en el frame local"
del jugador. `seatLight` reubica luz y target cada frame usando la base local
del terreno:

```js
// main.js:143-168 (extracto)
const SUN_LOCAL = new THREE.Vector3(-52, 62, 56);
const FILL_LOCAL = new THREE.Vector3(48, 26, -44);
const BOUNCE_LOCAL = new THREE.Vector3(10, -18, 40);

function seatLight(light, local, basis, origin) {
  sunOffset.set(0, 0, 0)
    .addScaledVector(basis.east, local.x)
    .addScaledVector(basis.up, local.y)
    .addScaledVector(basis.north, local.z);
  light.target.position.copy(origin);
  light.position.copy(origin).add(sunOffset);
}
```

Y en el loop:

```js
// main.js:212-227 (extracto del frame())
const b = basisAt(player.pos.x, player.pos.z);
positionAt(player.pos.x, 0, player.pos.z, shadowTarget);
seatLight(sun, SUN_LOCAL, b, shadowTarget);
seatLight(fill, FILL_LOCAL, b, shadowTarget);
seatLight(bounce, BOUNCE_LOCAL, b, shadowTarget);
hemi.position.copy(b.up);
```

Beneficios para un constructor de mundos:

- La dirección del sol es **constante desde el punto de vista del jugador**:
  el "hora del día" del estilo no cambia al caminar.
- La cámara de sombra se mueve con el jugador, así que las sombras cercanas
  siempre tienen la resolución completa de los 2048 px y no parpadean (el
  típico shimmer de shadow maps estáticos con cámara que se mueve).
- La escena no necesita un sol global; es coherente para un mundo que se
  construye y explora en cualquier dirección.

## 4. Receta directa para WANDORIUS

Estado actual en `game-playable-scene.ts`:

```ts
// game-playable-scene.ts (actual)
scene.add(new THREE.HemisphereLight(0xdcefe8, 0xffcf8a, 1.0));
const sun = new THREE.DirectionalLight(0xfff6e6, 1.2);
sun.position.set(6, 10, 4);
scene.add(sun);
const rim = new THREE.DirectionalLight(0xcfe6ff, 0.4);
rim.position.set(-6, 4, -5);
scene.add(rim);
```

Sin `shadowMap.enabled`, sin `castShadow`, sin fill violeta y con el sol
caliente pero bajo (1.2). La receta Sakura sería:

```ts
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const sun = new THREE.DirectionalLight(0xfff1d8, 2.25);
sun.position.set(-52, 62, 56);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -34;  /* ajustar al radio de streaming */
sun.shadow.camera.right = 34;
sun.shadow.camera.top = 34;
sun.shadow.camera.bottom = -34;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 200;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.035;

const fill = new THREE.DirectionalLight(0xa9bdf5, 1.08);
fill.position.set(48, 26, -44);

const bounce = new THREE.DirectionalLight(0xd8cbe8, 0.34);
bounce.position.set(10, -18, 40);

const hemi = new THREE.HemisphereLight(0xdcecff, 0xb6a6c6, 1.12);
```

Además:

- En el constructor orbital, la cámara de sombra debe seguir al personaje
  (no al centro del mapa) para que las sombras no parpadeen; y el terreno
  reconstruido al regenerar debe marcar `castShadow/receiveShadow` en sus
  mallas.
- Los materiales lit deben recibir el tinte violeta (paso 1 de
  [02-materiales-toon-cel.md](02-materiales-toon-cel.md)); sin el tinte, la
  iluminación 2+1 por sí sola no produce el look Sakura.

