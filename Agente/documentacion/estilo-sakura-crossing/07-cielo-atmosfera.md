# Cielo, nubes y atmósfera

> Código fuente: `C:\tmp\sakura-crossing\src\core\sky.js` (cúpula, nubes,
> colinas) y `C:\tmp\sakura-crossing\src\main.js:30-38,78-84` (fog, clear
> color y cúpula que sigue a la cámara).

## 1. La cúpula pintada con banding intencional

El cielo no es una textura ni un gradiente suave: es una esfera
`ShaderMaterial` BackSide con 3 colores y **cuantización visible** que lee
como fondo de arte pintado (airbrush con bandas), no como cielo físico:

```glsl
// sky.js:12-55 (buildSky, extracto)
const geo = new THREE.SphereGeometry(radius, 32, 20);
const mat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: true,
  fog: false,
  uniforms: {
    uTop: { value: new THREE.Color(PAL.skyTop) },    // 0x8fbdea
    uMid: { value: new THREE.Color(PAL.skyMid) },    // 0xd4e8fa
    uHaze: { value: new THREE.Color(PAL.skyHaze) },  // 0xfbe7e9 (rosa)
    uBands: { value: 26.0 },
  },
  vertexShader: /* glsl */ `
    varying vec3 vWorld;
    void main() {
      vec4 wp = modelMatrix * vec4( position, 1.0 );
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uTop, uMid, uHaze;
    uniform float uBands;
    varying vec3 vWorld;

    void main() {
      float h = normalize( vWorld ).y;
      // soft quantisation: mostly smooth, with a faint painted step
      float t = clamp( h * 1.15 + 0.02, 0.0, 1.0 );
      float q = floor( t * uBands ) / uBands;
      t = mix( t, q, 0.35 );

      vec3 col = mix( uHaze, uMid, smoothstep( 0.0, 0.30, t ) );
      col = mix( col, uTop, smoothstep( 0.26, 0.92, t ) );

      // a touch of warmth low in the sky, opposite the sun
      col = mix( col, uHaze, smoothstep( 0.12, -0.05, h ) * 0.6 );
      gl_FragColor = vec4( col, 1.0 );
    }
  `,
});
const dome = new THREE.Mesh(geo, mat);
dome.frustumCulled = false;
dome.renderOrder = -10;
scene.add(dome);
```

Decisiones:

- **`uBands = 26` con mezcla al 35 %**: el gradiente es casi suave pero se ve
  un paso de pintura muy sutil (`t = mix(t, q, 0.35)`), como bandas de
  aerógrafo. No es un fallo: es el estilo.
- **`uHaze` rosa abajo** (`0xfbe7e9`) y mezcla cálida cerca del horizonte
  (`smoothstep(0.12, -0.05, h)·0.6`): el cielo no es azul puro; tiene rosa
  cálido en la línea del horizonte, coherente con la paleta "tarde a través
  de la flor".
- **`fog: false`**: el cielo no se ve afectado por la niebla (sería
  redundante).
- **`renderOrder = -10` y `frustumCulled = false`**: siempre detrás de todo.
- El comentario del autor: *"Slight banding is intentional — it reads as
  airbrushed background art rather than a physical sky."*

## 2. Nubes billboard (22 grupos)

```js
// sky.js:58-93 (extracto)
const tex = cloudTex();
const rng = rngKit(7781);
const clouds = new THREE.Group();
const matA = flat({ color: PAL.cloud, map: tex, transparent: true, opacity: 0.62, depthWrite: false, fog: false, cache: false });
const matB = flat({ color: PAL.cloudShade, map: tex, transparent: true, opacity: 0.34, depthWrite: false, fog: false, cache: false });
matA.map.wrapS = matA.map.wrapT = THREE.ClampToEdgeWrapping;

for (let i = 0; i < 22; i++) {
  const r = rng.range(220, 350);
  const a = rng.range(0, Math.PI * 2);
  const w = rng.range(90, 210);
  const h = w * rng.range(0.24, 0.34);
  const y = rng.range(46, 140);
  const g = new THREE.Group();
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), matB);
  back.position.set(2, -h * 0.1, -1.5);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), matA);
  g.add(back, front);
  g.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
  g.lookAt(0, y * 0.55, 0);
  g.renderOrder = -9;
  clouds.add(g);
}
clouds.frustumCulled = false;
scene.add(clouds);
```

Receta:

- Cada nube = 2 planos superpuestos (sombra atrás `0xe6e6f2` al 0.34, frente
  blanco `0xfdfaf8` al 0.62), lo que da volumen plano sin geometría.
- `depthWrite: false` y `renderOrder = -9`: las nubes no escriben profundidad
  ni interfieren con la escena.
- Semilla fija (`rngKit(7781)`): el cielo es determinista, no cambia entre
  sesiones.
- Como la cúpula, las nubes se **recentran en la cámara** cada frame
  (`main.js:229-230`): son un "cielo infinito" alrededor del jugador.

## 3. Colinas distantes: siluetas planas

```js
// sky.js:96-140 (extracto)
export function buildDistantHills(scene) {
  const layers = [
    { z: -330, h: 46, color: PAL.hillFar, width: 900, bumps: 9, y: -6 },
    { z: -250, h: 34, color: PAL.hill, width: 760, bumps: 7, y: -4 },
  ];
  for (const L of layers) {
    const pts = [];
    const n = 90;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = (t - 0.5) * L.width;
      let y = 0;
      for (let b = 1; b <= L.bumps; b++) {
        y += Math.sin(t * Math.PI * b * 1.7 + b * 2.1) * (L.h / (b * 1.25));
      }
      pts.push(new THREE.Vector2(x, Math.max(2, y * 0.55 + L.h * 0.55)));
    }
    const shape = new THREE.Shape();
    shape.moveTo(pts[0].x, -60);
    pts.forEach((p) => shape.lineTo(p.x, p.y));
    shape.lineTo(pts[pts.length - 1].x, -60);
    shape.closePath();
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      flat({ color: L.color, fog: false })   // MeshBasicMaterial: unlit
    );
    mesh.position.set(rng.range(-30, 30), L.y, L.z);
    mesh.renderOrder = -8;
    group.add(mesh);
  }
  ...
}
```

Reglas:

- Perfiles generados con senos superpuestos (relieve "de dibujo", sin ruido).
- Material `flat()` (MeshBasicMaterial): **las colinas lejanas no se iluminan,
  se pintan** — la lejanía de un fondo anime es pintura plana, no 3D.
- Dos capas (`hillFar` 0xd8dded y `hill` 0xc6cfe6) para profundidad por valor.
- Espejo detrás de la cámara para que al girar se siga leyendo un valle.

## 4. Niebla y clear color

```js
// main.js:30-38
renderer.setClearColor(new THREE.Color(PAL.fog), 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(PAL.fog, 44, 205);
```

- `PAL.fog 0xe6ecf7`: gris-azul muy claro, coherente con el cielo `skyMid`.
- `Fog(near 44, far 205)`: la distancia orbital/peatonal del juego; todo lo
  que pasa de 205 unidades se disuelve en la niebla, y el fade de tinta (40→98)
  termina antes para que el fondo no tenga líneas.
- La cúpula y las nubes se recentran en la cámara; las colinas no (son
  lejanas fijas), pero la niebla y el `renderOrder` las funden con el cielo.

## 5. Receta para el constructor de WANDORIUS

Estado actual: `scene.background = new THREE.Color(0xaecfc4)` + `Fog` lineal,
sin cielo pintado ni nubes (el plan 138A-12 ya prevé un skydome con nubes por
capas). Para acercarse al estilo Sakura:

1. Sustituir el color de fondo por la cúpula 3-tonos con `uBands` (o el
   skydome de 138A-12, que es más ambicioso y comparte la misma idea de
   "cielo pintado").
2. Recentrar cúpula y nubes en la cámara cada frame (patrón
   `sky.dome.position.copy(camera.position)`).
3. Paleta de cielo Sakura: `skyTop 0x8fbdea`, `skyMid 0xd4e8fa`,
   `skyHaze 0xfbe7e9`, `fog 0xe6ecf7` — sustituye al `0xaecfc4` actual (verde
   grisáceo) si el usuario decide probar el estilo.
4. Colinas lejanas con `flat()` como capas de fondo para el horizonte.

