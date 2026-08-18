/* 138A-15 — Pipeline de postprocesado ink → grade → fxaa (Sakura Crossing).
 * Adaptación de `C:\tmp\sakura-crossing\src\core\post.js` sin depender de
 * `three/addons` (FullScreenQuad casero) y sin llamadas GL en el constructor
 * (los tests corren en jsdom sin WebGL; `dispose()` debe ser seguro).
 *
 * Flujo:  escena → rtScene (HalfFloat + depthTexture) → ink → grade → fxaa → pantalla.
 * - ink: outlines screen-space por segunda diferencia de profundidad
 *   linealizada (solo siluetas/pliegues, no mancha superficies planas).
 * - grade: split-tone anime (sombra violeta / luz papel cálido), lift,
 *   saturación, viñeta y conversión lineal→sRGB.
 * - fxaa: suavizado final de las líneas.
 * Referencia completa: `Agente/documentacion/estilo-sakura-crossing/05-outlines-tinta.md`
 * y `06-color-grading-postprocesado.md`. */

import * as THREE from 'three';

const INK_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4( position.xy, 0.0, 1.0 );
  }
`;

const INK_FRAGMENT_SHADER = /* glsl */ `
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
      gl_FragColor = vec4( col, 1.0 );
      return;
    }
    float dl = linearDepth( vUv - vec2( t.x, 0.0 ) );
    float dr = linearDepth( vUv + vec2( t.x, 0.0 ) );
    float du = linearDepth( vUv + vec2( 0.0, t.y ) );
    float dd = linearDepth( vUv - vec2( 0.0, t.y ) );
    float sx = ( dl + dr - 2.0 * dc ) / dc;
    float sy = ( du + dd - 2.0 * dc ) / dc;
    float convex  = max( 0.0,  sx ) + max( 0.0,  sy );
    float concave = max( 0.0, -sx ) + max( 0.0, -sy );
    float edge = smoothstep( uSens * 0.32, uSens, convex );
    edge = max( edge, smoothstep( uConcave, uConcave * 3.4, concave ) * uConcaveAmount );
    edge *= 1.0 - smoothstep( uFadeStart, uFadeEnd, dc );
    edge *= uStrength;
    vec3 line = mix( uInk, col * 0.42, 0.22 );
    gl_FragColor = vec4( mix( col, line, clamp( edge, 0.0, 1.0 ) ), 1.0 );
  }
`;

const GRADE_FRAGMENT_SHADER = /* glsl */ `
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
    float k = smoothstep( 0.02, 0.55, l );
    c *= mix( uShadowTint, uLightTint, k );
    c += vec3( uWarmth, uWarmth * 0.45, 0.0 ) * l * 0.35;
    c = c + uLift * ( 1.0 - k );
    c = mix( vec3( l ), c, uSaturation );
    float r = length( vUv - 0.5 ) * 1.42;
    c *= 1.0 - uVignette * pow( clamp( r, 0.0, 1.0 ), 2.6 );
    gl_FragColor = vec4( linearToSRGB( max( c, vec3( 0.0 ) ) ), 1.0 );
  }
`;

const FXAA_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uTexel;
  varying vec2 vUv;

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
`;

interface Pass {
  readonly material: THREE.ShaderMaterial;
  readonly quad: THREE.Mesh;
}

export interface PipelineEnabled {
  readonly ink: boolean;
  /** Grade siempre activo mientras el pipeline existe (convierte a sRGB). */
  readonly fxaa: boolean;
}

export interface SakuraPipelineHandle {
  readonly active: () => boolean;
  readonly setEnabled: (enabled: PipelineEnabled) => void;
  readonly setSize: (width: number, height: number, devicePixelRatio?: number) => void;
  /** Renderiza escena → pipeline → pantalla; no-op si está desactivado. */
  readonly render: () => void;
  readonly dispose: () => void;
}

const PIXEL_BUDGET = 4.6e6;

function makeQuad(shader: {
  readonly uniforms: Record<string, THREE.IUniform>;
  readonly fragmentShader: string;
}): Pass {
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(shader.uniforms),
    vertexShader: INK_VERTEX_SHADER,
    fragmentShader: shader.fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  quad.renderOrder = 99;
  return { material, quad };
}

interface PipelineRenderer {
  readonly setPixelRatio: (value: number) => void;
  readonly setSize: (width: number, height: number, updateStyle?: boolean) => void;
  readonly setRenderTarget: (target: THREE.WebGLRenderTarget | null) => void;
  readonly clear: () => void;
  readonly render: (scene: THREE.Object3D, camera: THREE.Camera) => void;
}

/** Pipeline propio sin `three/addons`. El constructor NO toca GL (los RT y
 *  texturas se crean pero no se suben a la GPU hasta el primer render). */
export function createSakuraPipeline(
  renderer: PipelineRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
): SakuraPipelineHandle {
  let enabled: PipelineEnabled = { ink: false, fxaa: true };
  let size = new THREE.Vector2(1, 1);
  let disposed = false;

  const rtOptions = {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
    colorSpace: THREE.NoColorSpace,
  };
  const rtScene = new THREE.WebGLRenderTarget(2, 2, rtOptions);
  const depthTexture = new THREE.DepthTexture(2, 2);
  depthTexture.format = THREE.DepthFormat;
  depthTexture.type = THREE.UnsignedIntType;
  depthTexture.minFilter = THREE.NearestFilter;
  depthTexture.magFilter = THREE.NearestFilter;
  rtScene.depthTexture = depthTexture;
  const rtA = new THREE.WebGLRenderTarget(2, 2, { ...rtOptions, depthBuffer: false });
  const rtB = new THREE.WebGLRenderTarget(2, 2, {
    ...rtOptions,
    type: THREE.UnsignedByteType,
    depthBuffer: false,
  });

  const ink = makeQuad({
    uniforms: {
      tDiffuse: { value: null },
      tDepth: { value: depthTexture },
      uTexel: { value: new THREE.Vector2() },
      uNear: { value: 0.25 },
      uFar: { value: 600 },
      uInk: { value: new THREE.Color(0x2a2235) },
      uThickness: { value: 1.35 },
      uSens: { value: 0.0042 },
      uConcave: { value: 0.026 },
      uConcaveAmount: { value: 0.42 },
      uFadeStart: { value: 40 },
      uFadeEnd: { value: 98 },
      uStrength: { value: 1 },
      uSkyDepth: { value: 420 },
    },
    fragmentShader: INK_FRAGMENT_SHADER,
  });
  const grade = makeQuad({
    uniforms: {
      tDiffuse: { value: null },
      uShadowTint: { value: new THREE.Color(0xada8d0) },
      uLightTint: { value: new THREE.Color(0xfff7e8) },
      uSaturation: { value: 1.12 },
      uLift: { value: 0.032 },
      uVignette: { value: 0.15 },
      uWarmth: { value: 0.05 },
    },
    fragmentShader: GRADE_FRAGMENT_SHADER,
  });
  const fxaa = makeQuad({
    uniforms: {
      tDiffuse: { value: null },
      uTexel: { value: new THREE.Vector2() },
    },
    fragmentShader: FXAA_FRAGMENT_SHADER,
  });

  const passes = { ink, grade, fxaa };
  const renderTargets = [rtScene, rtA, rtB];

  return {
    active: () => !disposed && (enabled.ink || enabled.fxaa),
    setEnabled(next) {
      enabled = { ink: next.ink, fxaa: next.fxaa };
    },
    setSize(width, height, devicePixelRatio = 1) {
      if (disposed) return;
      const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
        ? devicePixelRatio
        : 1;
      let scale = dpr < 1.5 ? 1.5 : Math.min(dpr, 2);
      if (width * height * scale * scale > PIXEL_BUDGET) {
        scale = Math.max(1, Math.sqrt(PIXEL_BUDGET / (width * height)));
      }
      const rw = Math.max(2, Math.floor(width * scale));
      const rh = Math.max(2, Math.floor(height * scale));
      size.set(rw, rh);

      renderer.setPixelRatio(1);
      renderer.setSize(width, height, true);
      rtScene.setSize(rw, rh);
      rtA.setSize(rw, rh);
      rtB.setSize(rw, rh);

      const texel = new THREE.Vector2(1 / rw, 1 / rh);
      (ink.material.uniforms.uTexel.value as THREE.Vector2).copy(texel);
      (fxaa.material.uniforms.uTexel.value as THREE.Vector2).copy(texel);
      ink.material.uniforms.uNear.value = camera.near;
      ink.material.uniforms.uFar.value = camera.far;
      ink.material.uniforms.uThickness.value = 1.05 + 0.55 * scale;
    },
    render() {
      if (disposed || (!enabled.ink && !enabled.fxaa)) return;
      renderer.setRenderTarget(rtScene);
      renderer.clear();
      renderer.render(scene, camera);

      let source: THREE.Texture = rtScene.texture;
      if (enabled.ink) {
        ink.material.uniforms.tDiffuse.value = source;
        renderer.setRenderTarget(rtA);
        renderer.render(passes.ink.quad, SCREEN_CAMERA);
        source = rtA.texture;
      }

      grade.material.uniforms.tDiffuse.value = source;
      renderer.setRenderTarget(enabled.fxaa ? rtB : null);
      renderer.render(passes.grade.quad, SCREEN_CAMERA);

      if (enabled.fxaa) {
        fxaa.material.uniforms.tDiffuse.value = rtB.texture;
        renderer.setRenderTarget(null);
        renderer.render(passes.fxaa.quad, SCREEN_CAMERA);
      }
      renderer.setRenderTarget(null);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      renderTargets.forEach(target => target.dispose());
      passes.ink.quad.geometry.dispose();
      passes.grade.quad.geometry.dispose();
      passes.fxaa.quad.geometry.dispose();
      passes.ink.material.dispose();
      passes.grade.material.dispose();
      passes.fxaa.material.dispose();
    },
  };
}

/** Cámara fija para los quads fullscreen (no requiere GL ni resize). */
const SCREEN_CAMERA = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
