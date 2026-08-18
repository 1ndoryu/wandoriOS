# Paleta de materiales y texturas procedurales

> Código fuente: `C:\tmp\sakura-crossing\src\core\palette.js` y
> `C:\tmp\sakura-crossing\src\core\textures.js`.

## 1. La paleta: una sola fuente de verdad

`PAL` (`palette.js:7`) es un objeto enorme con **cada color de la escena**. No
es una lista de colores al azar: el comentario de cabecera define la estrategia
con precisión:

> *"The palette is deliberately narrow: warm off-whites, a gray-purple road,
> teal-leaning greens, pale pinks, and four saturated accents (red / yellow /
> blue / teal) reserved for focal objects."*

Traducción operativa: **blancos cálidos, carretera gris-violeta, verdes con
sesgo teal, rosas pálidos y solo 4 acentos saturados para objetos focales.**

### Colores clave (los que definen el look)

| Grupo | Colores | Hex | Uso |
| ----- | ------- | --- | --- |
| Luz | `sun` / `fill` | `0xfff1d8` / `0xa9bdf5` | Sol cálido y fill frío |
| Hemisfera | `hemiSky` / `hemiGround` | `0xdcecff` / `0xb6a6c6` | Cielo frío arriba, **violeta** abajo |
| Tinta | `ink` / `inkSoft` | `0x39324f` / `0x4a4468` | Líneas y contornos (violeta-negro) |
| Cielo | `skyTop` / `skyMid` / `skyHaze` | `0x8fbdea` / `0xd4e8fa` / `0xfbe7e9` | Degradado 3 tonos con haze rosa |
| Niebla | `fog` | `0xe6ecf7` | Clear color + fog |
| Sakura | `blossom` / `blossomLight` / `blossomWarm` / `blossomDeep` | `0xfbc6d8` / `0xfff0f4` / `0xfedde2` / `0xf0a3c0` | Masa de flor (rampa soft) |
| Vegetación | `grass` / `leaf` / `leafDeep` / `leafPale` | `0x86ab84` / `0x5aa578` / `0x3f7f60` / `0x84bd97` | Verdes teal |
| Agua | `water` / `waterDeep` / `waterSky` | `0x93b8ce` / `0x6d90ad` / `0xcadff0` | Cuerpo de agua, profundidad, reflejo |
| Carretera | `road` / `roadWorn` / `roadDark` | `0x8e8a9c` / `0x9a95a6` / `0x7b7689` | Gris-violeta |
| Acentos | `red` / `yellow` / `blue` / `teal` | `0xe0453f` / `0xf4c033` / `0x3d6ec4` / `0x2f9c9a` | Solo objetos focales |
| Muros | `wallWhite` / `wallCream` / `wallBlue` / `wallTea` / `wallSage` | `0xfaf6ef` / `0xf2e7d3` / `0xd6e3ee` / `0xdccdb6` / `0xdde2d6` | Blancos cálidos y pasteles |

### Reglas de diseño que impone la paleta

1. **Luminancia relativa, no hue al azar.** El repo comenta valores medidos
   (0.2126R + 0.7152G + 0.0722B). Ejemplo: la ladera usa una escalera de 5
   tonos (`hillGrassSun 0.754` → `hillGrassDeep 0.574`) porque la rampa cel
   **no puede** dar forma a pendientes suaves con luz; la forma la da el valor
   de los materiales. El tono del sol bajó de `0xc2d69b` (luminancia 0.806) a
   `0xb4c98e` (0.754) porque el primero salía "blanqueado" en pantalla.
2. **Un solo color cálido por zona.** `clay` y `hillEarth` se "contienen"
   deliberadamente: a saturación completa, una gran área de tierra cálida se
   convierte en lo más ruidoso del frame. Los colores de tierra son beiges
   apagados.
3. **Masas verdes con sesgo teal**, nunca verde saturado de césped de
   videojuego. La paleta actual del constructor de WANDORIUS
   (`BLOCK_COLORS`, p. ej. `grass 0x86c65c`) es más saturada y amarilla; la
   tabla de equivalencias está en [08-replicacion-constructor-wandorius.md](08-replicacion-constructor-wandorius.md).
4. **Saturación concentrada en objetos focales**: toriis rojos, máquinas
   expendedoras, tranvía. El resto del mundo es pastel.

## 2. Texturas procedurales con Canvas2D

El repo **no tiene ningún asset binario visual** (solo audio `.mp3` y JPGs de
documentación; cero imágenes/modelos externos). Todo signo, póster, persiana,
superficie táctil, pétalo y nube se dibuja en un `<canvas>` al arranque:

```js
// textures.js:16-40
function make(w, h, draw, { srgb = true, repeat = null, aniso = 4 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = true;
  draw(c, w, h);
  const tex = new THREE.CanvasTexture(cv);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  tex.needsUpdate = true;
  return tex;
}

function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}
```

El patrón es simple y replicable:

- `make(w, h, draw)`: crea canvas, ejecuta `draw(ctx, w, h)`, devuelve
  `CanvasTexture` con `SRGBColorSpace` y anisotropía.
- `cached(key, fn)`: memoiza por clave para que cada textura se dibuje una
  sola vez aunque cientos de mallas la usen.

### Ejemplo 1: nubes (`cloudTex`)

```js
// textures.js:461 (resumido)
export const cloudTex = () =>
  cached('cloudTex', () =>
    make(256, 128, (c, w, h) => {
      // puffs suaves blancos/rosados sobre transparente
      // ... arcos superpuestos con alpha ...
    })
  );
```

Las nubes del cielo (`sky.js:58-93`) son **22 billboards** que usan este
canvas con `depthWrite: false` y dos materiales (blanco `0xfdfaf8` al 0.62 y
sombra `0xe6e6f2` al 0.34).

### Ejemplo 2: pétalos (`petalTex`)

```js
// textures.js:442 (resumido)
export const petalTex = () =>
  cached('petalTex', () =>
    make(64, 64, (c, w, h) => {
      // forma de pétalo con gradiente rosa pálido, alpha suave
    })
  );
```

Se usa en `src/world/petals.js` para la lluvia de pétalos, un elemento de
atmósfera que no requiere ningún sprite descargado.

### Ejemplo 3: cartel con texto japonés (`poster`)

```js
// textures.js:118-146
export const poster = (variant = 0) =>
  cached('poster' + variant, () =>
    make(320, 448, (c, w, h) => {
      const sets = [
        { bg: '#fdf7e8', bar: PAL.red, t: 'さくら祭', s: '四月五日' },
        { bg: '#eef6fd', bar: PAL.blue, t: '町内会', s: 'そうじ当番' },
        { bg: '#fdeef1', bar: PAL.purple, t: '春の便り', s: 'ひばり台' },
        { bg: '#f4fbef', bar: PAL.leafDeep, t: '野菜市', s: '毎週日曜' },
      ];
      const st = sets[variant % sets.length];
      c.fillStyle = st.bg;
      c.fillRect(0, 0, w, h);
      c.fillStyle = hex(st.bar);
      c.fillRect(0, 0, w, 26);
      c.fillRect(0, h - 20, w, 20);
      centered(c, st.t, w / 2, 120, w - 40, 96, hex(st.bar), 'bold', 6);
      centered(c, st.s, w / 2, 222, w - 60, 52, '#4b4757');
      // bloque de ilustración plana + 5 círculos de flor
    })
  );
```

Detalles de los helpers de texto (`textures.js:44-79`):

- `fitText` reduce el tamaño de fuente hasta que el texto cabe en `maxW`.
- `centered` centra texto, con opción de `spacing` (kerning manual por
  carácter) para títulos japoneses.
- `vertical` escribe caracteres en columna (letreros verticales).

### Regla de oro de las texturas procedurales

> *"Everything is kept flat and low-frequency on purpose — crisp shapes and
> type, never photographic noise."*

Formas nítidas y de baja frecuencia, sin ruido fotográfico. Esto es lo que
hace que las texturas se integren con el cel shading: un material toon con
una textura de fotografía (ruido de alta frecuencia, normal maps) se ve mal,
porque la rampa cuantiza la luz pero el detalle de la textura sigue siendo
fotográfico.

## 3. Qué significa para el constructor de WANDORIUS

El constructor actual dibuja los colores de bloque desde
`WORLD_PALETTE_DEFAULTS` (re-exportado como `BLOCK_COLORS` en
`game-block-palette.ts`) y no tiene texturas procedurales. El plan de
replicación propone:

1. Un `PAL` propio del constructor (o la tabla de equivalencias directa sobre
   `BLOCK_COLORS`), con los tonos Sakura: verdes teal, arena apagada, agua
   azul-gris, rosas para flora.
2. Un módulo `game-canvas-textures.ts` con el patrón `make`/`cached` para
   nubes, pétalos, carteles y texturas de detalle (si 138A-8 lo requiere),
   todo memoizado y con `dispose()`.

Ver tabla de equivalencias y pasos en
[08-replicacion-constructor-wandorius.md](08-replicacion-constructor-wandorius.md).
