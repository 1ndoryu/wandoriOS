# Referencia de diseño — Skydome Procedural Painted Clouds (artefacto Claude)

> **Fecha:** 2026-08-14 · **Origen:** artefacto público de Claude
> **Referencia:** <https://claude.ai/public/artifacts/df7858d4-faff-453e-91a4-1446bea3f188>

## Descripción

Artefacto de diseño **"Skydome — Procedural Painted Clouds"**: una cúpula de cielo 3D
interactiva con nubes pintadas proceduralmente. Incluye un panel de control en tiempo real
para ajustar cobertura de nubes, iluminación y animación, con paleta de cielo "deep/shadow/mid/
light/high" estilo pintura al óleo.

Sirve como referencia para el cielo y ambiente del constructor de mundo del juego: cúpula
de cielo (skydome) procedural, nubes pintadas por capas, luz direccional + luz ambiental
sincronizadas con los controles, y panel compacto de ajustes en vivo.

## Datos del artefacto

| Campo | Valor |
|---|---|
| Título original | `skydome-clouds.html` |
| Tipo | `text/html` (HTML + CSS + JS autocontenido, Three.js vía CDN) |
| Descripción | Explore an interactive 3D sky dome with procedurally generated painted clouds. Adjust coverage, lighting, and animation in real-time |
| Contenido | 31.472 caracteres |
| ID | `df7858d4-faff-453e-91a4-1446bea3f188` |

## Cómo se obtuvo

1. Página pública SPA: `https://claude.ai/public/artifacts/<id>` (no trae el código embebido).
2. Endpoint público del artefacto (con User-Agent de navegador):
   `https://claude.ai/api/published_artifacts/<id>` → JSON con `title`, `description`, `type`, `content`.
3. El código completo se copió a continuación tal cual.

## Código completo

````html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>Skydome — Procedural Painted Clouds</title>
<style>
  :root{
    --deep:#5C8399;
    --shadow:#7DA2B6;
    --mid:#AAC0C6;
    --light:#DDD9C3;
    --high:#F6EED6;
    --ink:#16232B;
    --panel:rgba(18,32,40,.72);
    --panel-solid:#122028;
    --line:rgba(246,238,214,.14);
    --line-strong:rgba(246,238,214,.28);
  }
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;overflow:hidden;background:var(--ink);}
  body{
    font-family:"Inter Tight","Helvetica Neue",Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased;
    color:var(--high);
  }
  canvas{display:block}

  /* ---------- panel ---------- */
  #ui{
    position:fixed; top:0; right:0; height:100%;
    width:318px; z-index:10;
    background:var(--panel);
    backdrop-filter:blur(18px) saturate(1.2);
    -webkit-backdrop-filter:blur(18px) saturate(1.2);
    border-left:1px solid var(--line-strong);
    display:flex; flex-direction:column;
    transition:transform .35s cubic-bezier(.2,.8,.2,1);
  }
  #ui.hidden{transform:translateX(100%)}

  .head{
    padding:18px 20px 14px;
    border-bottom:1px solid var(--line-strong);
    flex:0 0 auto;
  }
  .head h1{
    margin:0; font-size:13px; font-weight:600;
    letter-spacing:.24em; text-transform:uppercase;
    color:var(--high);
  }
  .head p{
    margin:6px 0 0; font-size:11px; line-height:1.5;
    color:var(--mid); letter-spacing:.02em;
  }

  .scroll{overflow-y:auto; overscroll-behavior:contain; padding-bottom:60px; flex:1 1 auto;}
  .scroll::-webkit-scrollbar{width:8px}
  .scroll::-webkit-scrollbar-thumb{background:rgba(246,238,214,.16); border-radius:8px}

  section{border-bottom:1px solid var(--line)}
  .sec-head{
    display:flex; align-items:center; gap:8px;
    padding:12px 20px; cursor:pointer; user-select:none;
  }
  .sec-head:hover{background:rgba(246,238,214,.04)}
  .sec-head h2{
    margin:0; font-size:10px; font-weight:600;
    letter-spacing:.2em; text-transform:uppercase; color:var(--light);
    flex:1;
  }
  .caret{
    width:8px;height:8px;border-right:1.5px solid var(--mid);border-bottom:1.5px solid var(--mid);
    transform:rotate(45deg);transition:transform .25s ease;margin-bottom:3px;
  }
  section.collapsed .caret{transform:rotate(-45deg);margin-bottom:0}
  section.collapsed .body{display:none}
  .body{padding:2px 20px 16px}

  .row{margin:0 0 13px}
  .row:last-child{margin-bottom:2px}
  .lab{
    display:flex; justify-content:space-between; align-items:baseline;
    font-size:11px; letter-spacing:.04em; color:var(--mid); margin-bottom:6px;
  }
  .val{
    font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
    font-size:10.5px; color:var(--high); opacity:.85;
    font-variant-numeric:tabular-nums;
  }
  input[type=range]{
    -webkit-appearance:none; appearance:none; width:100%; height:18px;
    background:transparent; cursor:pointer; display:block;
  }
  input[type=range]::-webkit-slider-runnable-track{
    height:2px; background:rgba(246,238,214,.2); border-radius:2px;
  }
  input[type=range]::-moz-range-track{height:2px;background:rgba(246,238,214,.2);border-radius:2px}
  input[type=range]::-webkit-slider-thumb{
    -webkit-appearance:none; width:12px;height:12px;border-radius:50%;
    background:var(--high); margin-top:-5px;
    border:0; box-shadow:0 0 0 1px rgba(18,32,40,.5);
    transition:transform .12s ease;
  }
  input[type=range]::-moz-range-thumb{
    width:12px;height:12px;border-radius:50%;background:var(--high);border:0;
  }
  input[type=range]:hover::-webkit-slider-thumb{transform:scale(1.25)}
  input[type=range]:focus-visible{outline:none}
  input[type=range]:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 3px rgba(170,192,198,.55)}

  .seg{display:grid;gap:5px;margin-bottom:12px}
  .seg.c3{grid-template-columns:repeat(3,1fr)}
  .seg.c2{grid-template-columns:repeat(2,1fr)}
  .seg.c4{grid-template-columns:repeat(4,1fr)}
  .seg button{
    font:inherit; font-size:10px; letter-spacing:.07em; text-transform:uppercase;
    padding:9px 4px; color:var(--mid); cursor:pointer;
    background:rgba(246,238,214,.05);
    border:1px solid var(--line); border-radius:2px;
    transition:all .18s ease; line-height:1.25;
  }
  .seg button:hover{background:rgba(246,238,214,.12);color:var(--high)}
  .seg button[aria-pressed=true]{
    background:var(--high); color:var(--ink); border-color:var(--high); font-weight:600;
  }
  .seg button:focus-visible{outline:2px solid var(--mid);outline-offset:1px}

  .tog{
    display:flex;align-items:center;justify-content:space-between;
    padding:8px 0; font-size:11.5px; color:var(--light);
    cursor:pointer; letter-spacing:.03em;
  }
  .tog .sw{
    width:32px;height:17px;border-radius:20px;background:rgba(246,238,214,.16);
    position:relative;transition:background .2s ease;flex:0 0 auto;
  }
  .tog .sw::after{
    content:"";position:absolute;top:2.5px;left:2.5px;width:12px;height:12px;
    border-radius:50%;background:var(--mid);transition:all .2s cubic-bezier(.2,.8,.2,1);
  }
  .tog[aria-pressed=true] .sw{background:rgba(246,238,214,.85)}
  .tog[aria-pressed=true] .sw::after{left:17.5px;background:var(--ink)}

  .note{font-size:10.5px;line-height:1.55;color:rgba(170,192,198,.75);margin:0 0 12px}
  .hint{font-size:10px;color:rgba(170,192,198,.6);margin:10px 0 0;line-height:1.5}

  .act{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:14px 20px 20px}
  .act button{
    font:inherit;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;
    padding:11px 6px;border-radius:2px;cursor:pointer;
    background:transparent;border:1px solid var(--line-strong);color:var(--light);
    transition:all .18s ease;
  }
  .act button:hover{background:var(--high);color:var(--ink);border-color:var(--high)}

  /* ---------- hud ---------- */
  #hud{
    position:fixed;left:0;bottom:0;z-index:9;
    padding:14px 18px;pointer-events:none;
    font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
    font-size:10px;letter-spacing:.08em;color:rgba(246,238,214,.55);
    text-shadow:0 1px 3px rgba(0,0,0,.45);
  }
  #hud b{font-weight:600;color:rgba(246,238,214,.9)}
  #toggleUI{
    position:fixed;top:14px;right:14px;z-index:11;
    width:36px;height:36px;border-radius:2px;cursor:pointer;
    background:var(--panel);backdrop-filter:blur(12px);
    border:1px solid var(--line-strong);color:var(--high);
    display:none;align-items:center;justify-content:center;
    font-size:15px;line-height:1;
  }
  #ui.hidden ~ #toggleUI{display:flex}

  @media (max-width:760px){
    #ui{width:100%;max-width:100%;height:56%;top:auto;bottom:0;border-left:0;border-top:1px solid var(--line-strong)}
    #ui.hidden{transform:translateY(100%)}
    #hud{bottom:auto;top:0}
  }
  @media (prefers-reduced-motion:reduce){
    *{transition-duration:.01ms !important}
  }
</style>
</head>
<body>

<div id="hud">
  <b id="fps">--</b> FPS &nbsp;·&nbsp; DRAG TO ORBIT &nbsp;·&nbsp; SCROLL TO ZOOM &nbsp;·&nbsp; <b>H</b> HIDES PANEL
</div>

<div id="ui">
  <div class="head">
    <h1>Skydome</h1>
    <p>A single inverted sphere wraps the scene. Everything you see above the grid is one fragment shader.</p>
  </div>

  <div class="scroll" id="scroll"></div>

  <div class="act">
    <button id="reseed">New sky</button>
    <button id="reset">Reset all</button>
  </div>
</div>
<button id="toggleUI" title="Show panel (H)">☰</button>

<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
/* ============================================================================
   SKYDOME WITH PROCEDURAL PAINTED CLOUDS
   ----------------------------------------------------------------------------
   The whole sky is ONE mesh: a big sphere rendered from the inside (BackSide).
   A fragment shader turns each pixel's view direction into a colour:

     direction  ->  3D billow-noise field  ->  hard threshold (silhouette)
                ->  self-shadow by sampling toward the sun
                ->  posterise the light into flat bands  ->  palette lookup

   The threshold gives the crisp cauliflower edge; the posterised bands give
   the flat painted look instead of a soft photographic gradient.
   ==========================================================================*/

/* ---------------------------------------------------------------- palettes */
const PRESETS = {
  day: {
    name:'Day',
    zenith:0x8FB6CE, horizon:0xEFE4C8, ground:0x9FB0B4, sun:0xFFF6DC,
    deep:0x5C8399, shadow:0x7DA2B6, mid:0xAAC0C6, light:0xDDD9C3, high:0xF6EED6,
    sunEl:38, sunAz:150
  },
  golden: {
    name:'Golden',
    zenith:0x6E94BE, horizon:0xF7C99A, ground:0xA89380, sun:0xFFDCA0,
    deep:0x5F7A96, shadow:0x8F93A8, mid:0xCBAFA6, light:0xF0C9A4, high:0xFFEBC8,
    sunEl:9, sunAz:200
  },
  dusk: {
    name:'Dusk',
    zenith:0x3E4E78, horizon:0xB98CA0, ground:0x4A4A62, sun:0xFFC5A8,
    deep:0x34405E, shadow:0x56628A, mid:0x8A7E9C, light:0xC79BA0, high:0xEFC3B0,
    sunEl:2, sunAz:250
  },
  overcast: {
    name:'Overcast',
    zenith:0x9AA9B4, horizon:0xC8CDD0, ground:0xA5ADB2, sun:0xE9EEF2,
    deep:0x6D7C88, shadow:0x8895A0, mid:0xA6B2BA, light:0xC9D1D6, high:0xE6EBEE,
    sunEl:52, sunAz:110
  }
};

/* ------------------------------------------------------------- parameters */
const DEFAULTS = {
  preset:'day',
  mode:1,              // 0 = high altitude, 1 = equator band, 2 = everywhere
  highStart:0.16,      // mode 0: elevation where clouds begin
  bandTop:0.46,        // mode 1: how far up the band reaches
  bandLow:-0.22,       // mode 1: how far below the horizon it sinks
  coverage:0.60,
  scale:3.10,
  squash:1.55,
  puff:0.82,           // 0 = soft fbm, 1 = billow (cauliflower)
  edge:0.030,          // silhouette hardness
  warp:0.42,
  octaves:6,
  bands:5.0,
  posterize:0.80,
  shadowStr:1.15,
  stepScale:0.28,
  silver:0.55,
  layer2:true,
  l2Coverage:0.42,
  l2Scale:1.30,
  l2Opacity:0.55,
  haze:0.55,
  sunEl:38,
  sunAz:150,
  sunInfluence:1.0,
  sunSize:2.2,
  sunGlow:0.75,
  animate:true,
  drift:0.012,
  evolve:0.35,
  seed:37.0,
  grid:true,
  props:true,
  autoRotate:false,
  quality:1.0
};
const P = Object.assign({}, DEFAULTS);

/* ------------------------------------------------------------ three basics */
const renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth/innerHeight, 0.1, 4000);

/* ------------------------------------------------------------- the shaders */
const vert = `
varying vec3 vPos;
void main(){
  vPos = position;                     // object space == direction, sphere is at origin
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const frag = `
precision highp float;
varying vec3 vPos;

uniform float uTime;
uniform vec3  uSunDir, uSunColor;
uniform float uSunInfluence, uSunSize, uSunGlow;
uniform vec3  uZenith, uHorizon, uGround;
uniform vec3  uCDeep, uCShadow, uCMid, uCLight, uCHigh;

uniform int   uMode;
uniform float uHighStart, uBandTop, uBandLow;
uniform float uCoverage, uScale, uSquash, uPuff, uEdge, uWarp;
uniform int   uOctaves;
uniform float uBands, uPosterize, uShadowStr, uStepScale, uSilver;
uniform float uDrift, uEvolve, uSeed, uHaze;
uniform float uL2On, uL2Coverage, uL2Scale, uL2Opacity;

/* --- value noise (iq's hash) ------------------------------------------- */
float hash(vec3 p){
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i+vec3(0,0,0)), hash(i+vec3(1,0,0)), f.x),
                 mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
                 mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
}

/* Rotating each octave kills the grid alignment of value noise. */
const mat3 M = mat3( 0.00, 0.80, 0.60,
                    -0.80, 0.36,-0.48,
                    -0.60,-0.48, 0.64);

/* fbm that blends smooth noise with BILLOW noise (1-|n|).
   Billow is what gives cumulus its stacked cauliflower lumps. */
float fbm(vec3 p, int oct){
  float amp = 0.5, sum = 0.0, norm = 0.0;
  for(int i = 0; i < 8; i++){
    if(i >= oct) break;
    float n = noise(p) * 2.0 - 1.0;
    sum  += amp * mix(n * 0.5 + 0.5, 1.0 - abs(n), uPuff);
    norm += amp;
    p = M * p * 2.03 + 5.17;
    amp *= 0.5;
  }
  return sum / norm;
}

/* Low frequency domain warp -> lumps lean and curl instead of sitting in a grid */
vec3 warpVec(vec3 p){
  if(uWarp < 0.001) return vec3(0.0);
  return (vec3(noise(p * 0.7 + 13.1),
               noise(p * 0.7 + 51.7),
               noise(p * 0.7 + 97.3)) * 2.0 - 1.0) * uWarp;
}

/* Flat painted ramp. Posterising BEFORE the palette lookup is what makes the
   colours read as brush blocks rather than a photographic gradient. */
vec3 palette(float t){
  float b = max(2.0, uBands);
  float q = floor(t * b + 0.5) / b;
  t = mix(t, q, uPosterize);
  vec3 c = mix(uCDeep,  uCShadow, smoothstep(0.00, 0.30, t));
  c      = mix(c,       uCMid,    smoothstep(0.28, 0.56, t));
  c      = mix(c,       uCLight,  smoothstep(0.54, 0.80, t));
  c      = mix(c,       uCHigh,   smoothstep(0.78, 1.00, t));
  return c;
}

/* Where clouds are ALLOWED to exist, from the three modes. */
float modeMask(float y){
  if(uMode == 0){                                   // high in the sky
    return smoothstep(uHighStart, uHighStart + 0.30, y);
  } else if(uMode == 1){                            // band around the equator
    float lower = smoothstep(uBandLow - 0.18, uBandLow + 0.06, y);
    float upper = 1.0 - smoothstep(uBandTop - 0.26, uBandTop, y);
    return clamp(lower * upper, 0.0, 1.0);
  }
  return 1.0;                                       // everywhere
}

vec4 cloudLayer(vec3 dir, float scale, float coverage, int oct, float driftMul){
  float mask = modeMask(dir.y);
  float cov  = coverage * mask;
  if(cov < 0.004) return vec4(0.0);

  /* Wind = slowly spinning the sample direction around Y.
     Evolve = sliding through the noise field so lumps grow and dissolve. */
  float a = uTime * uDrift * driftMul;
  float ca = cos(a), sa = sin(a);
  vec3 d = vec3(ca * dir.x - sa * dir.z, dir.y, sa * dir.x + ca * dir.z);

  vec3 p = vec3(d.x, d.y * uSquash, d.z) * scale
         + vec3(uSeed)
         + vec3(0.0, uTime * uEvolve * 0.03, uTime * uEvolve * 0.05);

  vec3  wo = warpVec(p);
  float f0 = fbm(p + wo, oct);

  /* Threshold -> crisp silhouette. cov 0 = nothing, cov 1 = solid overcast. */
  float thr   = mix(1.02, 0.24, cov);
  float alpha = smoothstep(thr, thr + uEdge, f0);
  if(alpha <= 0.001) return vec4(0.0);
  float thick = clamp((f0 - thr) / max(0.22, 1.0 - thr), 0.0, 1.0);

  /* Cheap self shadowing: march two short steps toward the sun and ask
     "is there MORE cloud that way?" If yes, this spot is in shade. */
  vec3 sd = normalize(vec3(uSunDir.x, uSunDir.y * uSquash, uSunDir.z)) * scale * uStepScale;
  int  o2 = oct - 1; if(o2 < 2) o2 = 2;
  float f1 = fbm(p + wo + sd * 0.11, o2);
  float f2 = fbm(p + wo + sd * 0.30, o2);
  float occ = clamp((f1 - f0) * 3.2, 0.0, 1.0) * 0.62
            + clamp((f2 - f0) * 2.0, 0.0, 1.0) * 0.38;

  float sunProx = dot(dir, uSunDir) * 0.5 + 0.5;
  float lightv  = 1.0 - occ * uShadowStr;
  lightv        = mix(lightv, lightv * 0.62 + 0.38 * sunProx, 0.38);
  lightv       -= thick * 0.30;                       // dense cores sit darker
  lightv       += max(0.0, uSunDir.y) * 0.10;         // high sun lifts everything
  lightv        = clamp(lightv, 0.0, 1.0);
  lightv        = mix(0.55, lightv, clamp(uSunInfluence, 0.0, 1.5));

  vec3 col = palette(lightv);
  col = mix(col, col * uSunColor * 1.05, 0.30 * clamp(uSunInfluence, 0.0, 1.0));

  /* Silver lining: thin edges facing the sun blow out to warm white. */
  float rim = (1.0 - thick) * pow(clamp(sunProx, 0.0, 1.0), 7.0);
  col += uSunColor * rim * uSilver * 1.5 * clamp(uSunInfluence, 0.0, 1.0);

  return vec4(col, alpha);
}

void main(){
  vec3 dir = normalize(vPos);

  /* --- sky gradient --- */
  float up  = clamp(dir.y, 0.0, 1.0);
  vec3  sky = mix(uHorizon, uZenith, pow(up, 0.55));
  sky = mix(sky, uGround, smoothstep(0.0, -0.30, dir.y) * 0.9);

  /* --- sun disc + glow --- */
  float cosA = dot(dir, uSunDir);
  float glow = pow(max(cosA, 0.0), mix(220.0, 4.0, clamp(uSunGlow, 0.0, 1.0)));
  sky += uSunColor * glow * 0.75 * clamp(uSunInfluence, 0.0, 1.5);
  float r    = uSunSize * 0.0022;
  float disc = smoothstep(1.0 - r, 1.0 - r * 0.55, cosA);
  sky = mix(sky, uSunColor * 1.18, disc * clamp(uSunInfluence, 0.0, 1.0));

  vec3 col = sky;

  /* --- far layer first, near layer over the top --- */
  if(uL2On > 0.5){
    vec4 far = cloudLayer(dir, uScale * uL2Scale, uL2Coverage, 4, 0.45);
    col = mix(col, far.rgb, far.a * uL2Opacity);
  }
  vec4 near = cloudLayer(dir, uScale, uCoverage, uOctaves, 1.0);
  col = mix(col, near.rgb, near.a);

  /* --- horizon haze pulls distant cloud bases into the sky --- */
  float hz = 1.0 - smoothstep(0.0, 0.30, abs(dir.y));
  col = mix(col, mix(uHorizon, uGround, step(dir.y, 0.0)), hz * uHaze * 0.7);

  gl_FragColor = vec4(col, 1.0);
}`;

/* ------------------------------------------------------------- the skydome */
const uni = {
  uTime:{value:0}, uSunDir:{value:new THREE.Vector3(0,1,0)},
  uSunColor:{value:new THREE.Color()}, uSunInfluence:{value:P.sunInfluence},
  uSunSize:{value:P.sunSize}, uSunGlow:{value:P.sunGlow},
  uZenith:{value:new THREE.Color()}, uHorizon:{value:new THREE.Color()},
  uGround:{value:new THREE.Color()},
  uCDeep:{value:new THREE.Color()}, uCShadow:{value:new THREE.Color()},
  uCMid:{value:new THREE.Color()}, uCLight:{value:new THREE.Color()},
  uCHigh:{value:new THREE.Color()},
  uMode:{value:P.mode}, uHighStart:{value:P.highStart},
  uBandTop:{value:P.bandTop}, uBandLow:{value:P.bandLow},
  uCoverage:{value:P.coverage}, uScale:{value:P.scale}, uSquash:{value:P.squash},
  uPuff:{value:P.puff}, uEdge:{value:P.edge}, uWarp:{value:P.warp},
  uOctaves:{value:P.octaves}, uBands:{value:P.bands}, uPosterize:{value:P.posterize},
  uShadowStr:{value:P.shadowStr}, uStepScale:{value:P.stepScale}, uSilver:{value:P.silver},
  uDrift:{value:P.drift}, uEvolve:{value:P.evolve}, uSeed:{value:P.seed}, uHaze:{value:P.haze},
  uL2On:{value:P.layer2?1:0}, uL2Coverage:{value:P.l2Coverage},
  uL2Scale:{value:P.l2Scale}, uL2Opacity:{value:P.l2Opacity}
};

const domeMat = new THREE.ShaderMaterial({
  uniforms:uni, vertexShader:vert, fragmentShader:frag,
  side:THREE.BackSide, depthWrite:false, fog:false
});
const dome = new THREE.Mesh(new THREE.SphereGeometry(1200, 64, 48), domeMat);
dome.frustumCulled = false;
scene.add(dome);

/* ------------------------------------------------------- floor + landmarks */
const grid = new THREE.GridHelper(160, 32, 0xF6EED6, 0x7DA2B6);
grid.material.transparent = true;
grid.material.opacity = 0.30;
grid.material.depthWrite = false;
scene.add(grid);

const shadowPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.ShadowMaterial({ opacity:0.24 })
);
shadowPlane.rotation.x = -Math.PI / 2;
shadowPlane.position.y = -0.01;
shadowPlane.receiveShadow = true;
scene.add(shadowPlane);

const props = new THREE.Group();
scene.add(props);
[
  { g:new THREE.BoxGeometry(7,14,7),                 c:0xDDD9C3, p:[-16,7,-8] },
  { g:new THREE.IcosahedronGeometry(6,0),            c:0xAAC0C6, p:[14,6,10]  },
  { g:new THREE.TorusKnotGeometry(4,1.4,110,16),     c:0x7DA2B6, p:[2,9,-20]  },
  { g:new THREE.CylinderGeometry(3,4.6,10,6),        c:0x5C8399, p:[22,5,-14] }
].forEach(o => {
  const m = new THREE.Mesh(o.g, new THREE.MeshStandardMaterial({
    color:o.c, roughness:0.85, metalness:0.0, flatShading:true
  }));
  m.position.set(...o.p);
  m.castShadow = true; m.receiveShadow = true;
  props.add(m);
});

/* Real lights driven by the same sun vector, so the panel's sun controls
   move the sky AND the shadows on the ground together. */
const sunLight = new THREE.DirectionalLight(0xFFF6DC, 1.0);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
const sc = sunLight.shadow.camera;
sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
scene.add(sunLight, sunLight.target);
const hemi = new THREE.HemisphereLight(0xAAC0C6, 0x5C8399, 0.55);
scene.add(hemi);

/* ------------------------------------------------------------- the camera */
const cam = { theta:0.62, phi:1.30, radius:74, tTheta:0.62, tPhi:1.30, tRadius:74, target:new THREE.Vector3(0,6,0) };
function applyCamera(){
  cam.theta  += (cam.tTheta  - cam.theta)  * 0.12;
  cam.phi    += (cam.tPhi    - cam.phi)    * 0.12;
  cam.radius += (cam.tRadius - cam.radius) * 0.12;
  const s = Math.sin(cam.phi);
  camera.position.set(
    cam.target.x + cam.radius * s * Math.sin(cam.theta),
    cam.target.y + cam.radius * Math.cos(cam.phi),
    cam.target.z + cam.radius * s * Math.cos(cam.theta)
  );
  camera.lookAt(cam.target);
}
let dragging = false, lx = 0, ly = 0;
const el = renderer.domElement;
el.addEventListener('pointerdown', e => { dragging = true; lx = e.clientX; ly = e.clientY; el.setPointerCapture(e.pointerId); });
el.addEventListener('pointerup',   e => { dragging = false; });
el.addEventListener('pointermove', e => {
  if(!dragging) return;
  cam.tTheta -= (e.clientX - lx) * 0.005;
  cam.tPhi    = Math.max(0.06, Math.min(3.08, cam.tPhi - (e.clientY - ly) * 0.005));
  lx = e.clientX; ly = e.clientY;
});
el.addEventListener('wheel', e => {
  e.preventDefault();
  cam.tRadius = Math.max(3, Math.min(600, cam.tRadius * (1 + Math.sign(e.deltaY) * 0.1)));
}, { passive:false });

/* --------------------------------------------------------------- plumbing */
function applyPreset(key){
  const s = PRESETS[key];
  uni.uZenith.value.setHex(s.zenith);
  uni.uHorizon.value.setHex(s.horizon);
  uni.uGround.value.setHex(s.ground);
  uni.uSunColor.value.setHex(s.sun);
  uni.uCDeep.value.setHex(s.deep);
  uni.uCShadow.value.setHex(s.shadow);
  uni.uCMid.value.setHex(s.mid);
  uni.uCLight.value.setHex(s.light);
  uni.uCHigh.value.setHex(s.high);
  sunLight.color.setHex(s.sun);
  hemi.color.setHex(s.mid); hemi.groundColor.setHex(s.deep);
  P.sunEl = s.sunEl; P.sunAz = s.sunAz;
  P.preset = key;
}

function sync(){
  uni.uMode.value = P.mode;
  uni.uHighStart.value = P.highStart;
  uni.uBandTop.value = P.bandTop;
  uni.uBandLow.value = P.bandLow;
  uni.uCoverage.value = P.coverage;
  uni.uScale.value = P.scale;
  uni.uSquash.value = P.squash;
  uni.uPuff.value = P.puff;
  uni.uEdge.value = P.edge;
  uni.uWarp.value = P.warp;
  uni.uOctaves.value = P.octaves;
  uni.uBands.value = P.bands;
  uni.uPosterize.value = P.posterize;
  uni.uShadowStr.value = P.shadowStr;
  uni.uStepScale.value = P.stepScale;
  uni.uSilver.value = P.silver;
  uni.uDrift.value = P.drift;
  uni.uEvolve.value = P.evolve;
  uni.uSeed.value = P.seed;
  uni.uHaze.value = P.haze;
  uni.uL2On.value = P.layer2 ? 1 : 0;
  uni.uL2Coverage.value = P.l2Coverage;
  uni.uL2Scale.value = P.l2Scale;
  uni.uL2Opacity.value = P.l2Opacity;
  uni.uSunInfluence.value = P.sunInfluence;
  uni.uSunSize.value = P.sunSize;
  uni.uSunGlow.value = P.sunGlow;

  const el2 = THREE.MathUtils.degToRad(P.sunEl);
  const az  = THREE.MathUtils.degToRad(P.sunAz);
  const dir = new THREE.Vector3(Math.cos(el2)*Math.sin(az), Math.sin(el2), Math.cos(el2)*Math.cos(az)).normalize();
  uni.uSunDir.value.copy(dir);
  sunLight.position.copy(dir).multiplyScalar(160);
  sunLight.target.position.set(0,0,0);
  sunLight.intensity = Math.max(0, dir.y) * 1.35 * P.sunInfluence;
  hemi.intensity = 0.35 + 0.35 * P.sunInfluence;

  grid.visible = P.grid;
  props.visible = P.props;
  shadowPlane.visible = P.props;

  renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * P.quality);
  renderer.setSize(innerWidth, innerHeight);
}

/* ------------------------------------------------------------------- UI kit */
const root = document.getElementById('scroll');
function section(title, open = true){
  const s = document.createElement('section');
  if(!open) s.className = 'collapsed';
  s.innerHTML = '<div class="sec-head"><h2>' + title + '</h2><span class="caret"></span></div><div class="body"></div>';
  s.querySelector('.sec-head').onclick = () => s.classList.toggle('collapsed');
  root.appendChild(s);
  return s.querySelector('.body');
}
function slider(parent, label, key, min, max, step, fmt){
  const row = document.createElement('div');
  row.className = 'row';
  const f = fmt || (v => (+v).toFixed(step < 1 ? 2 : 0));
  row.innerHTML = '<div class="lab"><span>' + label + '</span><span class="val"></span></div>';
  const inp = document.createElement('input');
  inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = P[key];
  inp.setAttribute('aria-label', label);
  const out = row.querySelector('.val');
  out.textContent = f(P[key]);
  inp.oninput = () => { P[key] = parseFloat(inp.value); out.textContent = f(P[key]); sync(); };
  row.appendChild(inp);
  parent.appendChild(row);
  return { set:v => { inp.value = v; out.textContent = f(v); }, row };
}
function segment(parent, cols, items, active, cb){
  const box = document.createElement('div');
  box.className = 'seg c' + cols;
  const btns = items.map((it, i) => {
    const b = document.createElement('button');
    b.textContent = it;
    b.setAttribute('aria-pressed', String(i === active));
    b.onclick = () => { btns.forEach((x, j) => x.setAttribute('aria-pressed', String(j === i))); cb(i); };
    box.appendChild(b);
    return b;
  });
  parent.appendChild(box);
  return { select:i => btns.forEach((x, j) => x.setAttribute('aria-pressed', String(j === i))) };
}
function toggle(parent, label, key, cb){
  const t = document.createElement('div');
  t.className = 'tog'; t.tabIndex = 0; t.setAttribute('role','switch');
  t.setAttribute('aria-pressed', String(P[key]));
  t.innerHTML = '<span>' + label + '</span><span class="sw"></span>';
  const flip = () => {
    P[key] = !P[key];
    t.setAttribute('aria-pressed', String(P[key]));
    sync(); if(cb) cb(P[key]);
  };
  t.onclick = flip;
  t.onkeydown = e => { if(e.key === ' ' || e.key === 'Enter'){ e.preventDefault(); flip(); } };
  parent.appendChild(t);
  return { set:v => t.setAttribute('aria-pressed', String(v)) };
}
function note(parent, text){
  const p = document.createElement('p');
  p.className = 'note'; p.textContent = text;
  parent.appendChild(p);
}

/* ------------------------------------------------------------ build panel */
// 1. Cloud placement
const bPlace = section('Cloud placement');
note(bPlace, 'Where on the dome clouds are allowed to form.');
const modeSeg = segment(bPlace, 3, ['Up high','Band','All over'], P.mode, i => {
  P.mode = i; sync(); refreshModeRows();
});
const rHigh = slider(bPlace, 'Lowest altitude', 'highStart', -0.2, 0.8, 0.01);
const rTop  = slider(bPlace, 'Band reaches up to', 'bandTop', 0.05, 1.0, 0.01);
const rLow  = slider(bPlace, 'Band sinks below', 'bandLow', -0.8, 0.2, 0.01);
function refreshModeRows(){
  rHigh.row.style.display = P.mode === 0 ? '' : 'none';
  rTop.row.style.display  = P.mode === 1 ? '' : 'none';
  rLow.row.style.display  = P.mode === 1 ? '' : 'none';
}
refreshModeRows();

// 2. Cloud shape
const bShape = section('Cloud shape');
slider(bShape, 'Coverage', 'coverage', 0, 1, 0.01);
slider(bShape, 'Puffiness', 'puff', 0, 1, 0.01);
slider(bShape, 'Cloud size', 'scale', 1, 9, 0.05);
slider(bShape, 'Flatten', 'squash', 0.5, 3.5, 0.05);
slider(bShape, 'Edge hardness', 'edge', 0.004, 0.3, 0.002, v => (+v).toFixed(3));
slider(bShape, 'Curl', 'warp', 0, 1.2, 0.01);
slider(bShape, 'Detail octaves', 'octaves', 2, 8, 1, v => (+v).toFixed(0));

// 3. Painted look
const bPaint = section('Painted look');
note(bPaint, 'Fewer bands and a hard edge give the flat illustrated style from the reference.');
slider(bPaint, 'Colour bands', 'bands', 2, 14, 1, v => (+v).toFixed(0));
slider(bPaint, 'Posterise', 'posterize', 0, 1, 0.01);
slider(bPaint, 'Shadow depth', 'shadowStr', 0, 2, 0.01);
slider(bPaint, 'Shadow spread', 'stepScale', 0.05, 0.9, 0.01);
slider(bPaint, 'Silver lining', 'silver', 0, 1.5, 0.01);

// 4. Sun
const bSun = section('Sun');
segment(bSun, 4, ['Day','Golden','Dusk','Grey'], 0, i => {
  applyPreset(['day','golden','dusk','overcast'][i]);
  sunEl.set(P.sunEl); sunAz.set(P.sunAz); sync();
});
const sunEl = slider(bSun, 'Height', 'sunEl', -12, 90, 0.5, v => (+v).toFixed(0) + '°');
const sunAz = slider(bSun, 'Direction', 'sunAz', 0, 360, 1, v => (+v).toFixed(0) + '°');
slider(bSun, 'Influence', 'sunInfluence', 0, 1.5, 0.01);
slider(bSun, 'Disc size', 'sunSize', 0.3, 8, 0.1);
slider(bSun, 'Glow spread', 'sunGlow', 0, 1, 0.01);

// 5. Weather + motion
const bAir = section('Sky and motion');
toggle(bAir, 'Clouds move with time', 'animate');
slider(bAir, 'Wind speed', 'drift', 0, 0.12, 0.001, v => (+v).toFixed(3));
slider(bAir, 'Billow over time', 'evolve', 0, 2, 0.01);
slider(bAir, 'Horizon haze', 'haze', 0, 1, 0.01);
toggle(bAir, 'Distant second layer', 'layer2');
slider(bAir, 'Far layer coverage', 'l2Coverage', 0, 1, 0.01);
slider(bAir, 'Far layer size', 'l2Scale', 0.4, 3, 0.05);
slider(bAir, 'Far layer strength', 'l2Opacity', 0, 1, 0.01);

// 6. Scene
const bScene = section('Scene', false);
toggle(bScene, 'Grid floor', 'grid');
toggle(bScene, 'Landmark objects', 'props');
toggle(bScene, 'Auto orbit', 'autoRotate');
slider(bScene, 'Render quality', 'quality', 0.4, 1, 0.05);
const hint = document.createElement('p');
hint.className = 'hint';
hint.textContent = 'Drop render quality first if the frame rate dips — the cloud shader is the expensive part, not the geometry.';
bScene.appendChild(hint);

/* --------------------------------------------------------------- buttons */
document.getElementById('reseed').onclick = () => { P.seed = Math.random() * 500; sync(); };
document.getElementById('reset').onclick = () => {
  Object.assign(P, DEFAULTS);
  applyPreset(DEFAULTS.preset);
  location.reload();
};
const ui = document.getElementById('ui');
document.getElementById('toggleUI').onclick = () => ui.classList.remove('hidden');
addEventListener('keydown', e => {
  if(e.key === 'h' || e.key === 'H') ui.classList.toggle('hidden');
});

/* ------------------------------------------------------------------- loop */
applyPreset(P.preset);
sync();

let t = 0, last = performance.now(), fpsT = 0, frames = 0;
const fpsEl = document.getElementById('fps');

function loop(){
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if(P.animate) t += dt;
  uni.uTime.value = t;

  if(P.autoRotate) cam.tTheta += dt * 0.06;
  applyCamera();

  renderer.render(scene, camera);

  frames++; fpsT += dt;
  if(fpsT > 0.5){ fpsEl.textContent = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
}
loop();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
</script>
</body>
</html>
````

## Notas de uso

- Abrir el HTML completo en cualquier navegador; Three.js se carga desde CDN.
- La referencia queda guardada en este documento (código íntegro) y la URL original
  arriba por si se quiere volver al artefacto interactivo.
- Para el constructor de mundo: el skydome procedural con nubes pintadas, la luz
  sincronizada con los controles y el panel de ajustes en vivo son los patrones a replicar.