# Outlines: tinta screen-space + hull invertido

> Código fuente: `C:\tmp\sakura-crossing\src\core\post.js:22-98` (ink) y
> `C:\tmp\sakura-crossing\src\core\outline.js` (hull).

El juego usa **dos sistemas de línea independientes** porque ninguno solo
cumple los dos trabajos:

1. La **tinta screen-space** dibuja la línea de TODA la escena a partir del
   depth buffer (siluetas y pliegues), sin tocar la geometría.
2. El **hull invertido** da contornos gruesos y deliberados a objetos
   protagonistas (tren, portones de cruce, expendedoras), desplazando una
   cáscara BackSide en clip space.

## 1. Tinta screen-space: la segunda diferencia de profundidad

```glsl
// post.js:22-98 (INK_SHADER completo)
uniforms: {
  tDiffuse: { value: null },
  tDepth: { value: null },
  uTexel: { value: new THREE.Vector2() },
  uNear: { value: 0.25 },
  uFar: { value: 600 },
  uInk: { value: new THREE.Color(PAL.ink) },      // 0x39324f
  uThickness: { value: 1.35 },
  uSens: { value: 0.0042 },
  uConcave: { value: 0.026 },
  uConcaveAmount: { value: 0.42 },
  uFadeStart: { value: 40.0 },
  uFadeEnd: { value: 98.0 },
  uStrength: { value: 1.0 },
  uSkyDepth: { value: 420.0 },
},
fragmentShader: /* glsl */ `
  #include <packing>
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform vec2 uTexel;
  uniform float uNear, uFar;
  uniform vec3 uInk;
  uniform float uThickness, uSens, uConcave, uConcaveAmount;
  uniform float uFadeStart, uFadeEnd, uStrength, uSkyDepth;
  varying vec2 vUv;

  float linearDepth( vec2 uv ) {
    float d = texture2D( tDepth, uv ).x;
    return -perspectiveDepthToViewZ( d, uNear, uFar );
  }

  void main() {
    vec3 col = texture2D( tDiffuse, vUv ).rgb;

    vec2 t = uTexel * uThickness;
    float dc = linearDepth( vUv );

    if ( dc > uSkyDepth ) {
      // pure sky: nothing to ink
      gl_FragColor = vec4( col, 1.0 );
      return;
    }

    float dl = linearDepth( vUv - vec2( t.x, 0.0 ) );
    float dr = linearDepth( vUv + vec2( t.x, 0.0 ) );
    float du = linearDepth( vUv + vec2( 0.0, t.y ) );
    float dd = linearDepth( vUv - vec2( 0.0, t.y ) );

    // second difference of linear depth, normalised by distance
    float sx = ( dl + dr - 2.0 * dc ) / dc;
    float sy = ( du + dd - 2.0 * dc ) / dc;

    float convex  = max( 0.0,  sx ) + max( 0.0,  sy );
    float concave = max( 0.0, -sx ) + max( 0.0, -sy );

    float edge = smoothstep( uSens * 0.32, uSens, convex );
    edge = max( edge, smoothstep( uConcave, uConcave * 3.4, concave ) * uConcaveAmount );

    // let the background dissolve into the haze instead of getting busy
    edge *= 1.0 - smoothstep( uFadeStart, uFadeEnd, dc );
    edge *= uStrength;

    // ink keeps a whisper of the underlying hue so it never looks pasted on
    vec3 line = mix( uInk, col * 0.42, 0.22 );
    gl_FragColor = vec4( mix( col, line, clamp( edge, 0.0, 1.0 ) ), 1.0 );
  }
`,
```

### Por qué una segunda diferencia y no un Sobel

El comentario de cabecera del archivo lo explica mejor que cualquier
reescritura:

> *"A first difference would smear ink across the road wherever the surface is
> grazing the camera; the second difference is flat across any planar surface
> no matter how oblique, so it only fires on real silhouettes and real
> creases."*

Una primera diferencia (|dl − dr|) mide cuánto cambia la profundidad entre
píxeles vecinos: una carretera que se aleja en ángulo oblicuo cambia de
profundidad en cada píxel y se entintaría entera. La segunda diferencia
`(dl + dr − 2·dc)` mide la **curvatura** de la profundidad: en un plano, la
suma de los vecinos menos el doble del centro es ~0 aunque el plano sea
oblicuo; solo salta en siluetas (curvatura convexa) y esquinas interiores
(curvatura cóncava). Y se normaliza por `dc` para que la sensibilidad sea
relativa a la distancia, no absoluta.

El resultado imita las decisiones de un animador:

- **Convexo inka fuerte** (`smoothstep(0.0013, 0.0042, convex)`).
- **Cóncavo inka débil** (factor 0.42 sobre un umbral más alto): las esquinas
  interiores llevan "línea de contacto" tenue, como en el anime.
- **Fade con la distancia** (40→98): el fondo se disuelve en la niebla y no
  se llena de líneas.
- **El cielo no se entinta** (`uSkyDepth` 420).
- **La línea conserva un susurro del color de abajo** (`mix(uInk, col*0.42,
  0.22)`): no parece pegada encima.

### Uniforms de ajuste (valores del clon)

| Uniform | Valor | Efecto |
| ------- | ----- | ------ |
| `uThickness` | 1.35 (1.05 + 0.55·escala) | Grosor en texels, escala con resolución |
| `uSens` | 0.0042 | Umbral convexo (más bajo = más líneas) |
| `uConcave` | 0.026 | Umbral cóncavo (mucho más alto) |
| `uConcaveAmount` | 0.42 | Debilidad de las líneas cóncavas |
| `uFadeStart/End` | 40 / 98 | Disolución en niebla |
| `uInk` | 0x39324f | Color de tinta (violeta-negro) |

## 2. Hull invertido: contorno de grosor constante en píxeles

```glsl
// outline.js:15-43
const hullVert = /* glsl */ `
  uniform float uThickness;
  uniform vec2 uResolution;
  void main() {
    vec4 mv = modelViewMatrix * vec4( position, 1.0 );
    #ifdef USE_INSTANCING
      mv = modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
    #endif
    vec3 n = normalize( normalMatrix * normal );
    #ifdef USE_INSTANCING
      n = normalize( normalMatrix * mat3( instanceMatrix ) * normal );
    #endif
    vec4 clip = projectionMatrix * mv;
    vec3 clipN = normalize( ( projectionMatrix * vec4( n, 0.0 ) ).xyz );
    vec2 aspect = vec2( uResolution.y / uResolution.x, 1.0 );
    clip.xy += clipN.xy * aspect * uThickness * clip.w * 0.5;
    gl_Position = clip;
  }
`;
```

La idea: dibujar la misma malla con `side: BackSide`, desplazando cada vértice
en **clip space** a lo largo de su normal proyectada. Como el desplazamiento
se multiplica por `clip.w`, la línea mide lo mismo en píxeles sin importar la
distancia a cámara.

```js
// outline.js:51-70 (geometría suavizada)
function smoothedGeometry(geo) {
  if (smoothCache.has(geo)) return smoothCache.get(geo);
  let g;
  try {
    g = mergeVertices(geo.clone(), 1e-4);
    g.computeVertexNormals();
  } catch (e) {
    g = geo.clone();
  }
  // outlines only need positions and normals
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  }
  smoothCache.set(geo, g);
  return g;
}
```

`mergeVertices` fusiona vértices duplicados (los cubos y cilindros de three
los duplican por cara) y recalcula normales; sin ese paso, las normales por
cara harían que el hull se abriera como un pétalo en las esquinas.

```js
// outline.js:72-125
export function hullOutline(mesh, { thickness = 0.0038, color = PAL.ink, opacity = 1 } = {}) {
  if (!mesh || !mesh.geometry) return null;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uThickness: { value: thickness },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uResolution: { value: _resolution.clone() },
    },
    vertexShader: hullVert,
    fragmentShader: hullFrag,
    side: THREE.BackSide,
    transparent: opacity < 1,
    depthWrite: true,
    fog: false,
  });
  _materials.add(mat);

  const geo = smoothedGeometry(mesh.geometry);
  let shell;
  if (mesh.isInstancedMesh) {
    shell = new THREE.InstancedMesh(geo, mat, mesh.count);
    shell.instanceMatrix = mesh.instanceMatrix;
    shell.count = mesh.count;
  } else {
    shell = new THREE.Mesh(geo, mat);
  }
  shell.castShadow = false;
  shell.receiveShadow = false;
  shell.renderOrder = (mesh.renderOrder || 0) - 1;
  shell.frustumCulled = mesh.frustumCulled;
  mesh.add(shell);   // el shell es HIJO del mesh: sigue su transform
  return shell;
}

export function hullOutlineTree(root, opts = {}) {
  const targets = [];
  root.traverse((o) => {
    if (o.isMesh && !o.userData.noOutline && !o.userData.isOutline) targets.push(o);
  });
  for (const m of targets) {
    const shell = hullOutline(m, opts);
    if (shell) shell.userData.isOutline = true;
  }
  return root;
}
```

Detalles:

- `thickness = 0.0038` ≈ línea de 2 px a 1080p (unidades NDC).
- El shell es **hijo** del mesh: si el objeto se mueve, la línea lo sigue.
- Soporta `InstancedMesh` reutilizando `instanceMatrix`.
- `renderOrder - 1` para que la línea quede detrás del objeto sin z-fighting.
- `setOutlineResolution(w, h)` (línea 44) actualiza `uResolution` en todos los
  materiales de hull vivos; se llama con el tamaño real del render target del
  pipeline (`main.js:151`).
- `userData.noOutline` permite excluir mallas del pase automático
  (`hullOutlineTree`).

## 3. Cuándo usar cada uno

| Situación | Sistema |
| --------- | ------- |
| Toda la escena, siluetas generales, vegetación | Ink screen-space (barato, sin geometría extra) |
| Objetos protagonistas con contorno grueso y constante | Hull invertido |
| Distancia media/lejana | Solo ink + fade de niebla |
| Objetos muy detallados o con instancing masivo | Ink; el hull duplica geometría |

En el clon, el ink está **siempre encendido** y el hull se aplica por objeto
(tren, portones, expendedoras). La tecla `O` (`main.js:186`) apaga/enciende el
ink en caliente para comparar; la tecla `G` hace lo mismo con el grade.

## 4. Receta para el constructor de WANDORIUS

Estado actual: no hay outline de ningún tipo. Dos niveles de entrada:

1. **Mínimo viable:** copiar `INK_SHADER` al pipeline nuevo (paso 3 de
   [08-replicacion-constructor-wandorius.md](08-replicacion-constructor-wandorius.md)).
   Con `uThickness` escalando con la resolución del render target, el ink se
   ve bien incluso a 390px móvil.
2. **Detalle:** `hullOutline`/`hullOutlineTree` para objetos destacados del
   constructor (props, personajes), con `setOutlineResolution` sincronizado.

Recordar la decisión vigente del Bosque: "sin tinta como destino". Si el
usuario prueba el estilo Sakura y luego la descarta, el pipeline debe tener el
ink **apagable por bandera** (como `pipeline.enabled.ink`), para poder volver
al look sin tinta sin tocar el resto.

