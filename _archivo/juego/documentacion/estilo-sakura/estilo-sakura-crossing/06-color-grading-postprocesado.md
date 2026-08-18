# Postprocesado: pipeline ink → grade → FXAA

> Código fuente: `C:\tmp\sakura-crossing\src\core\post.js:100-306`
> (GRADE_SHADER, FXAA_SHADER y la clase `Pipeline`).

## 1. El pipeline completo

```js
// post.js:203-241 (constructor, resumido)
export class Pipeline {
  constructor(renderer, scene, camera, { pixelBudget = 4.6e6 } = {}) {
    ...
    const opts = {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      colorSpace: THREE.NoColorSpace,
    };
    this.rtScene = new THREE.WebGLRenderTarget(2, 2, opts);
    this.rtScene.depthTexture = new THREE.DepthTexture(2, 2);
    this.rtScene.depthTexture.format = THREE.DepthFormat;
    this.rtScene.depthTexture.type = THREE.UnsignedIntType;
    this.rtScene.depthTexture.minFilter = THREE.NearestFilter;
    this.rtScene.depthTexture.magFilter = THREE.NearestFilter;

    this.rtA = new THREE.WebGLRenderTarget(2, 2, { ...opts, depthBuffer: false });
    this.rtB = new THREE.WebGLRenderTarget(2, 2, {
      ...opts, type: THREE.UnsignedByteType, depthBuffer: false,
    });

    const ink = makeQuad(INK_SHADER);
    const grade = makeQuad(GRADE_SHADER);
    const fxaa = makeQuad(FXAA_SHADER);
    ...
    ink.mat.uniforms.tDepth.value = this.rtScene.depthTexture;
    this.enabled = { ink: true, grade: true, fxaa: true };
  }
```

### Por qué tres render targets y HalfFloat

| RT | Tipo | Profundidad | Contenido |
| -- | ---- | ----------- | --------- |
| `rtScene` | `HalfFloat` | DepthTexture UnsignedInt | La escena 3D (color + depth) |
| `rtA` | `HalfFloat` | no | Salida del ink |
| `rtB` | `UnsignedByte` | no | Salida del grade, entrada del FXAA |

- **HalfFloat en rtScene**: el color grading opera en espacio lineal con luces
  >1 (sol 2.25); un RT de 8 bits aplastaría las bandas claras y la saturación
  antes del grade.
- **`colorSpace: NoColorSpace`**: la conversión a sRGB se hace explícitamente
  al final del shader `grade` (`linearToSRGB`). Si three la hiciera
  automáticamente, el split-tone se aplicaría sobre valores ya transformados
  y el resultado sería otro.
- **`rtB` en UnsignedByte**: el último pase antes de pantalla no necesita
  precisión HDR.

`makeQuad` (`post.js:192-201`) crea un `FullScreenQuad` con
`depthTest/depthWrite: false`, la base estándar de pasos de postprocesado.

## 2. La resolución: supersample con presupuesto de píxeles

```js
// post.js:243-268
setSize(w, h) {
  const dpr = window.devicePixelRatio || 1;
  let scale = this.forceScale || (dpr < 1.5 ? 1.5 : Math.min(dpr, 2));
  if (w * h * scale * scale > this.pixelBudget) {
    scale = Math.max(1, Math.sqrt(this.pixelBudget / (w * h)));
  }
  this.scale = scale;
  const rw = Math.max(2, Math.floor(w * scale));
  const rh = Math.max(2, Math.floor(h * scale));
  this.size.set(rw, rh);

  this.renderer.setPixelRatio(1);
  this.renderer.setSize(w, h, true);

  this.rtScene.setSize(rw, rh);
  this.rtA.setSize(rw, rh);
  this.rtB.setSize(rw, rh);

  const texel = new THREE.Vector2(1 / rw, 1 / rh);
  this.ink.mat.uniforms.uTexel.value.copy(texel);
  this.fxaa.mat.uniforms.uTexel.value.copy(texel);
  this.ink.mat.uniforms.uNear.value = this.camera.near;
  this.ink.mat.uniforms.uFar.value = this.camera.far;
  // scale ink weight with resolution so lines stay ~2 device px
  this.ink.mat.uniforms.uThickness.value = 1.05 + 0.55 * scale;
}
```

Decisiones clave:

- **Escala 1.5-2×**: en monitores de DPI bajo se "supersamplea" (renderiza la
  escena a 1.5× y se baja con FXAA) para que las líneas de tinta salgan
  limpias; en DPI ≥1.5 se renderiza a la resolución nativa (escala = dpr) sin
  pasarse de 2×.
- **`pixelBudget = 4.6e6`**: si `w·h·scale²` supera el presupuesto (p. ej.
  4K), la escala baja para no fundir la GPU. Es la válvula de rendimiento que
  un constructor de mundos necesita para garantías de frame rate.
- **`setPixelRatio(1)` + `setSize(w, h, true)`**: el canvas de pantalla queda
  a tamaño CSS exacto; la resolución real vive en los RT.
- **`uThickness = 1.05 + 0.55·scale`**: las líneas de tinta crecen con la
  resolución para mantener ~2 px físicos, no 2 px de RT.

## 3. El render

```js
// post.js:270-288
render() {
  const r = this.renderer;
  r.setRenderTarget(this.rtScene);
  r.clear();
  r.render(this.scene, this.camera);

  let src = this.rtScene.texture;

  if (this.enabled.ink) {
    this.ink.mat.uniforms.tDiffuse.value = src;
    r.setRenderTarget(this.rtA);
    this.ink.quad.render(r);
    src = this.rtA.texture;
  }

  const last = this.enabled.fxaa ? this.rtB : null;
  this.grade.mat.uniforms.tDiffuse.value = src;
  r.setRenderTarget(last);
  this.grade.quad.render(r);

  if (this.enabled.fxaa) {
    this.fxaa.mat.uniforms.tDiffuse.value = this.rtB.texture;
    r.setRenderTarget(null);
    this.fxaa.quad.render(r);
  }
  r.setRenderTarget(null);
}
```

El orden importa: el ink trabaja sobre el color de la escena **antes** del
grade, para que la línea se mezcle con el color real y luego el grade
unifique todo; el FXAA va el último para limpiar tanto la geometría como las
propias líneas de tinta.

En `main.js` el bucle es un solo `pipeline.render()` por frame (en vez de
`renderer.render`), y las teclas `O`/`G` alternan `enabled.ink`/`enabled.grade`
en caliente (`main.js:185-187`), muy útil para demostrar cuánto aporta cada
pase.

## 4. El color grading anime (GRADE_SHADER)

```glsl
// post.js:100-145 (GRADE_SHADER, fragmentShader completo)
uniform sampler2D tDiffuse;
uniform vec3 uShadowTint, uLightTint;
uniform float uSaturation, uLift, uVignette, uWarmth;
varying vec2 vUv;

vec3 linearToSRGB( vec3 c ) {
  return mix( c * 12.92, 1.055 * pow( max( c, vec3( 0.0031308 ) ), vec3( 1.0 / 2.4 ) ) - 0.055,
              step( 0.0031308, c ) );
}

void main() {
  vec3 c = texture2D( tDiffuse, vUv ).rgb;
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );

  // split-tone: cool violet in the darks, warm paper white in the lights
  float k = smoothstep( 0.02, 0.55, l );
  c *= mix( uShadowTint, uLightTint, k );

  // gentle overall warmth, like late afternoon light through blossom
  c += vec3( uWarmth, uWarmth * 0.45, 0.0 ) * l * 0.35;

  // keep shadows readable -- never crushed to black
  c = c + uLift * ( 1.0 - k );

  c = mix( vec3( l ), c, uSaturation );

  float r = length( vUv - 0.5 ) * 1.42;
  c *= 1.0 - uVignette * pow( clamp( r, 0.0, 1.0 ), 2.6 );

  gl_FragColor = vec4( linearToSRGB( max( c, vec3( 0.0 ) ) ), 1.0 );
}
```

### Qué hace cada línea

1. **Split-tone** (`k = smoothstep(0.02, 0.55, l)`): en darks (`k≈0`) el color
   se multiplica por `uShadowTint 0xada8d0` (violeta); en lights (`k≈1`) por
   `uLightTint 0xfff7e8` (papel cálido). Es la segunda capa del tinte violeta:
   la primera es el material (`uShadowTint` del toon), la segunda es global
   en post.
2. **Warmth**: `+ (0.05, 0.0225, 0) · l · 0.35` — un velo amarillo/naranja que
   escala con la luminancia, "tarde a través de la flor".
3. **Lift**: `+ 0.032·(1−k)` — las sombras nunca se aplastan a negro (el
   comentario del shader: *"keep shadows readable -- never crushed to black"*).
4. **Saturación 1.12**: mezcla hacia el croma a partir de la luminancia.
5. **Vignette 0.15**: `r = length(uv − 0.5)·1.42`, `pow(r, 2.6)` — oscurece
   suavemente los bordes (1.42 estira la elipse al aspect ratio).
6. **`linearToSRGB` manual**: la única conversión de color del pipeline.

Valores por defecto: `uShadowTint 0xada8d0`, `uLightTint 0xfff7e8`,
`uSaturation 1.12`, `uLift 0.032`, `uVignette 0.15`, `uWarmth 0.05`.

## 5. FXAA

```glsl
// post.js:146-191 (FXAA_SHADER, núcleo)
float luma( vec3 c ) { return dot( c, vec3( 0.299, 0.587, 0.114 ) ); }
void main() {
  vec3 cM = texture2D( tDiffuse, vUv ).rgb;
  vec3 cNW = texture2D( tDiffuse, vUv + vec2( -uTexel.x, -uTexel.y ) ).rgb;
  vec3 cNE = texture2D( tDiffuse, vUv + vec2(  uTexel.x, -uTexel.y ) ).rgb;
  vec3 cSW = texture2D( tDiffuse, vUv + vec2( -uTexel.x,  uTexel.y ) ).rgb;
  vec3 cSE = texture2D( tDiffuse, vUv + vec2(  uTexel.x,  uTexel.y ) ).rgb;

  float lM = luma( cM ), lNW = luma( cNW ), lNE = luma( cNE ),
        lSW = luma( cSW ), lSE = luma( cSE );
  float lMin = min( lM, min( min( lNW, lNE ), min( lSW, lSE ) ) );
  float lMax = max( lM, max( max( lNW, lNE ), max( lSW, lSE ) ) );

  vec2 dir = vec2(
    -( ( lNW + lNE ) - ( lSW + lSE ) ),
     ( ( lNW + lSW ) - ( lNE + lSE ) )
  );
  float reduce = max( ( lNW + lNE + lSW + lSE ) * 0.25 * 0.18, 1.0 / 128.0 );
  float rcp = 1.0 / ( min( abs( dir.x ), abs( dir.y ) ) + reduce );
  dir = clamp( dir * rcp, vec2( -8.0 ), vec2( 8.0 ) ) * uTexel;

  vec3 rgbA = 0.5 * (
    texture2D( tDiffuse, vUv + dir * ( 1.0 / 3.0 - 0.5 ) ).rgb +
    texture2D( tDiffuse, vUv + dir * ( 2.0 / 3.0 - 0.5 ) ).rgb );
  vec3 rgbB = rgbA * 0.5 + 0.25 * (
    texture2D( tDiffuse, vUv - dir * 0.5 ).rgb +
    texture2D( tDiffuse, vUv + dir * 0.5 ).rgb );

  float lB = luma( rgbB );
  gl_FragColor = vec4( ( lB < lMin || lB > lMax ) ? rgbA : rgbB, 1.0 );
}
```

FXAA clásico de 5 muestras: detecta la dirección del gradiente de luma en la
cruz de vecinos, suaviza a lo largo de la arista y evita emborronar bordes que
ya eran nítidos. Coste mínimo (5 texel fetches + aritmética) y no necesita
acceso a profundidad.

## 6. Presupuestos de rendimiento

| Parámetro | Valor | Nota |
| --------- | ----- | ---- |
| `pixelBudget` | 4.6e6 píxeles | Escala baja automáticamente en 4K |
| Escala RT | 1.5 (dpr<1.5), dpr (≤2) | Supersample para líneas limpias |
| `rtScene` | HalfFloat + Depth | El pase más caro; el resto es fullscreen |
| Pases | 3 fullscreen (ink, grade, fxaa) | 3 quads, sin geometría |
| Tinta | 5 fetches de depth + 1 color | Barata, O(log) nada |

En el clon, el mundo entero renderiza con este pipeline sobre ~5 800 draw
calls en la vista más pesada y mantiene el frame (los materiales se comparten
por caché). Para un constructor de mundos, el orden de magnitud es similar
mientras se respeten la caché de materiales, el instancing y el presupuesto de
píxeles.

## 7. Receta para WANDORIUS

1. Copiar `Pipeline` + `INK_SHADER` + `GRADE_SHADER` + `FXAA_SHADER` a un
   módulo nuevo de presentación (p. ej. `game-sakura-pipeline.ts`), sin tocar
   `game-core`.
2. Conectar `resize()` → `pipeline.setSize(w, h)`; el bucle pasa de
   `renderer.render(scene, camera)` a `pipeline.render()`.
3. `destroy()` debe llamar `pipeline.dispose()` (dispone RT y quads) además de
   los `renderer.dispose()`/`forceContextLoss()` que ya existen; el teardown
   de `game-playable-teardown.test.ts` seguirá cubriendo el resto.
4. `setPixelRatio(1)` en el renderer (la escala la decide el pipeline) y
   `antialias: false` (el FXAA lo sustituye).
5. Mantener banderas `enabled.ink`/`enabled.grade` para poder probar el look
   "sin tinta" de la decisión vigente del Bosque.

