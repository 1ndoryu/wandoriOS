# Referencia visual — Curved Island (estudio Three.js estilo New Horizons)

> **Fuente:** https://claude.ai/public/artifacts/2372d434-ce54-4da5-acae-f74a50570413
> **Fecha:** 2026-08-12
> **Uso:** referencia exacta del aspecto visual a replicar (mundo, personaje, agua, iluminación,
> bending, lluvia) integrado sobre el runtime `game-playable` existente. El usuario adaptará después
> los detalles visuales; la integración debe respetar el sistema actual.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<title>Curved Island — a New Horizons style Three.js study</title>
<style>
  /* ------------------------------------------------------------------
     UI shell. Palette is pulled straight out of the render: wet sand,
     bleached cliff stone, and the overcast teal of the sky.
  ------------------------------------------------------------------ */
  :root{
    --sand:      #f0b040;
    --sand-lite: #ffd98a;
    --stone:     #ece2df;
    --sky:       #aecfc4;
    --ink:       #3b4a46;
    --ink-soft:  #6e837c;
    --panel:     rgba(255,253,248,0.86);
  }
  *{ box-sizing:border-box; }
  html,body{ margin:0; height:100%; overflow:hidden; background:var(--sky); }
  body{
    font-family: ui-rounded, "SF Pro Rounded", "Nunito", "Quicksand", system-ui, sans-serif;
    color:var(--ink);
    -webkit-user-select:none; user-select:none;
    -webkit-tap-highlight-color:transparent;
  }
  canvas{ display:block; touch-action:none; }

  /* --- control panel --- */
  #panel{
    position:fixed; top:14px; right:14px; width:268px;
    background:var(--panel);
    backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
    border:1px solid rgba(255,255,255,0.7);
    border-radius:20px;
    box-shadow:0 10px 30px rgba(50,70,65,0.18);
    padding:14px 16px 16px;
    z-index:10;
    max-height:calc(100dvh - 28px);
    overflow-y:auto;
  }
  #panel.collapsed .body{ display:none; }
  #panel header{
    display:flex; align-items:center; gap:8px; cursor:pointer;
  }
  #panel h1{
    font-size:14px; letter-spacing:0.02em; margin:0; font-weight:800; flex:1;
  }
  #panel h1 small{ display:block; font-weight:600; font-size:10.5px; color:var(--ink-soft); letter-spacing:0.06em; text-transform:uppercase; margin-top:2px;}
  .chev{ font-size:12px; color:var(--ink-soft); transition:transform .2s ease; }
  #panel.collapsed .chev{ transform:rotate(-90deg); }

  .grp{ margin-top:14px; }
  .grp-title{
    font-size:10px; font-weight:800; letter-spacing:0.1em; text-transform:uppercase;
    color:var(--ink-soft); margin-bottom:8px;
    display:flex; align-items:center; gap:6px;
  }
  .grp-title::after{ content:""; flex:1; height:1px; background:rgba(110,131,124,0.22); }

  .row{ margin-bottom:11px; }
  .row label{ display:flex; justify-content:space-between; font-size:11.5px; font-weight:700; margin-bottom:5px; }
  .row label span{ color:var(--ink-soft); font-variant-numeric:tabular-nums; font-weight:600; }

  input[type=range]{
    -webkit-appearance:none; appearance:none; width:100%; height:5px; border-radius:99px;
    background:linear-gradient(90deg, var(--sand) 0%, var(--sand) var(--fill,50%), rgba(110,131,124,0.2) var(--fill,50%));
    outline:none;
  }
  input[type=range]::-webkit-slider-thumb{
    -webkit-appearance:none; width:17px; height:17px; border-radius:50%;
    background:#fff; border:3px solid var(--sand); cursor:grab;
    box-shadow:0 2px 5px rgba(60,80,75,.25);
  }
  input[type=range]::-moz-range-thumb{
    width:14px; height:14px; border-radius:50%; background:#fff; border:3px solid var(--sand); cursor:grab;
  }
  input[type=range]:focus-visible::-webkit-slider-thumb{ outline:2px solid var(--ink); outline-offset:2px; }

  .segs{ display:flex; gap:4px; background:rgba(110,131,124,0.13); padding:3px; border-radius:11px; }
  .segs button{
    flex:1; border:0; background:transparent; font:inherit; font-size:11px; font-weight:700;
    color:var(--ink-soft); padding:6px 4px; border-radius:8px; cursor:pointer;
  }
  .segs button.on{ background:#fff; color:var(--ink); box-shadow:0 1px 3px rgba(60,80,75,.18); }

  .btn{
    width:100%; border:0; font:inherit; font-size:12px; font-weight:800; cursor:pointer;
    padding:10px; border-radius:12px; background:var(--sand); color:#5a3a06;
    box-shadow:0 3px 0 #cf8f28; transition:transform .06s ease, box-shadow .06s ease;
  }
  .btn:active{ transform:translateY(2px); box-shadow:0 1px 0 #cf8f28; }

  .check{ display:flex; align-items:center; gap:8px; font-size:11.5px; font-weight:700; cursor:pointer; margin-bottom:9px;}
  .check input{ accent-color:var(--sand); width:15px; height:15px; }

  details.help{ margin-top:14px; font-size:11px; line-height:1.55; color:var(--ink-soft); }
  details.help summary{ cursor:pointer; font-weight:800; color:var(--ink); font-size:11px; letter-spacing:.03em; }
  details.help p{ margin:8px 0 0; }
  details.help code{ background:rgba(110,131,124,.14); padding:1px 4px; border-radius:4px; font-size:10px; }

  /* --- corner hints --- */
  #hint{
    position:fixed; left:14px; bottom:14px; z-index:10;
    background:var(--panel); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
    border:1px solid rgba(255,255,255,0.7);
    border-radius:14px; padding:9px 13px; font-size:11px; font-weight:700; line-height:1.6;
    box-shadow:0 8px 22px rgba(50,70,65,0.15); color:var(--ink-soft);
    pointer-events:none;
  }
  #hint b{ color:var(--ink); }
  #stats{
    position:fixed; left:14px; top:14px; z-index:10; font-size:10.5px; font-weight:700;
    color:rgba(59,74,70,.5); letter-spacing:.06em;
  }

  /* --- touch stick --- */
  #stick{ position:fixed; z-index:9; width:104px; height:104px; margin:-52px 0 0 -52px;
    border-radius:50%; border:2px solid rgba(255,255,255,.75); background:rgba(255,255,255,.2);
    display:none; pointer-events:none; }
  #stick i{ position:absolute; left:50%; top:50%; width:44px; height:44px; margin:-22px 0 0 -22px;
    border-radius:50%; background:rgba(255,255,255,.85); box-shadow:0 3px 10px rgba(0,0,0,.15); }

  @media (max-width:760px){
    #panel{ width:210px; top:10px; right:10px; padding:11px 13px 13px; }
    #hint{ font-size:10px; }
  }
</style>
</head>
<body>

<div id="stats"></div>

<div id="panel">
  <header id="panelHead">
    <h1>Curved Island<small>world bending study</small></h1>
    <div class="chev">▾</div>
  </header>

  <div class="body">
    <div class="grp">
      <div class="grp-title">World bending</div>
      <div class="row">
        <label>Curve down <span id="vBendDown">0.010</span></label>
        <input type="range" id="bendDown" min="0" max="0.030" step="0.0005" value="0.010">
      </div>
      <div class="row">
        <label>Horizon pull <span id="vBendPull">0.0040</span></label>
        <input type="range" id="bendPull" min="0" max="0.016" step="0.0002" value="0.0040">
      </div>
      <div class="row">
        <label>Bends around</label>
        <div class="segs" id="originSeg">
          <button data-v="player" class="on">Character</button>
          <button data-v="camera">Camera</button>
        </div>
      </div>
      <div class="row">
        <label>Presets</label>
        <div class="segs" id="presetSeg">
          <button data-v="flat">Flat</button>
          <button data-v="cozy" class="on">Cozy</button>
          <button data-v="marble">Marble</button>
        </div>
      </div>
    </div>

    <div class="grp">
      <div class="grp-title">Island</div>
      <div class="row">
        <label>Rain <span id="vRain">60%</span></label>
        <input type="range" id="rain" min="0" max="100" step="1" value="60">
      </div>
      <label class="check"><input type="checkbox" id="props" checked> Trees &amp; rocks</label>
      <label class="check"><input type="checkbox" id="follow" checked> Camera follows walk</label>
      <button class="btn" id="regen">Grow a new island</button>
    </div>

    <details class="help">
      <summary>How this works</summary>
      <p><b>Tiles.</b> A 46×46 grid of height levels. The sand cap is a slab that juts past the cell boundary wherever the ground drops, so it overhangs the rock instead of sharing its silhouette — which means each tile also needs a rim, an underside, corner squares and end caps to stay watertight.</p><p><b>Rock.</b> Each cliff face is a flat slab pinned to nothing at both tile seams, so two neighbours meet in a crisp V indent and outer corners resolve into a distinct corner post. Roughly every other panel also gets a horizontal crack band. The offset is clamped below <code>OVER</code> so rock can never reach past the lip above it.</p><p><b>Heights.</b> <code>LEVEL_Y</code> is a table, not a step size — full, half, full. Mixing cube-height terraces with half-height slabs is what stops a run of cliffs looking uniform.</p>
      <p><b>Bending.</b> Every material's vertex shader is patched via <code>onBeforeCompile</code>. Vertices are pushed to world space, dropped by <code>dist² × curve</code> away from the character, then projected. Nothing moves in the simulation — collision stays perfectly flat.</p>
      <p><b>Water.</b> A shore mask is blurred on the CPU into a texture, then banded into hard toon steps in the fragment shader for foam.</p>
    </details>
  </div>
</div>

<div id="hint"><b>WASD</b> or <b>arrows</b> to walk · <b>drag</b> to orbit · <b>scroll</b> to zoom · hover a tile to pick it</div>
<div id="stick"><i></i></div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
if (!window.THREE) {
  document.body.innerHTML = '<div style="padding:40px;font:16px system-ui">Could not load three.js from the CDN. Check your connection and reload.</div>';
}
(function () {
'use strict';

/* ==================================================================
   0.  CONFIG
   ================================================================== */
const GRID       = 46;    // tiles across the island grid
const TILE       = 1.0;   // world units per tile
const MAX_LEVEL  = 3;     // level 0 = beach, 3 = top plateau
// Terrace heights, not a uniform step. Mixing full cubes with half-height
// slabs is what gives a run of cliffs its variety.
const LEVEL_Y    = [0, 0.90, 1.35, 2.25];   // full, half, full
const levelY     = h => LEVEL_Y[h];
const WATER_Y    = -0.20;
const SKIRT_Y    = -0.95; // how far coastal cliff faces run down under the water
const OVER       = 0.105; // how far the sand cap juts out past the rock below
const RIM        = 0.140; // thickness of that cap
const FLARE      = 0.055; // how far a rock panel stands proud of its seam

const COL = {
  sky:       0xaecfc4,
  sand:      0xf7b845,  // grassy/sandy plateau tops
  sandBeach: 0xffd180,  // the pale beach ring at level 0
  rock:      0xe4d8c4,  // warm bone cliff stone
  rockFoot:  0.70,      // multiplier at the bottom of a cliff face (fake AO)
  leaf:      0x93d268,
  leafDark:  0x6cb84e,
  trunk:     0xcb9a63,
  boulder:   0xdccfba,
  body:      0x59c2e8,
  bodyDark:  0x3aa6cf,
  waterDeep: 0x36a79e,
  waterShal: 0x63c9bb,
  foam:      0xeafbf5
};

/* ==================================================================
   1.  DETERMINISTIC NOISE  (value noise + fbm)
   ================================================================== */
function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 144665);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
const fade = t => t * t * (3 - 2 * t);
function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi, seed),     b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  const u = fade(xf), v = fade(yf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm(x, y, seed, oct) {
  let f = 1, amp = 0.5, sum = 0, norm = 0;
  for (let i = 0; i < (oct || 4); i++) {
    sum += valueNoise(x * f, y * f, seed + i * 977) * amp;
    norm += amp; f *= 2; amp *= 0.5;
  }
  return sum / norm;
}

/* ==================================================================
   2.  PROCEDURAL TEXTURES  (drawn to canvas, tiled seamlessly)
   ------------------------------------------------------------------
   Both textures are near-white: the actual colour lives in the vertex
   colours, so one texture serves sand, beach and stone alike.
   ================================================================== */
function seamlessDots(ctx, S, count, radius, fill) {
  ctx.fillStyle = fill;
  for (let i = 0; i < count; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    const r = radius[0] + Math.random() * (radius[1] - radius[0]);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      ctx.beginPath();
      ctx.arc(x + ox * S, y + oy * S, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
function makeSandTexture() {
  const S = 160, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#e8e6e2'; g.fillRect(0, 0, S, S);
  seamlessDots(g, S, 260, [0.6, 2.2], 'rgba(255,255,255,0.95)'); // bright grains
  seamlessDots(g, S, 150, [0.5, 1.4], 'rgba(196,180,152,0.45)'); // dark flecks
  seamlessDots(g, S, 40,  [2.0, 4.0], 'rgba(255,255,255,0.35)'); // soft patches
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function makeRockTexture() {
  const S = 160, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  // Kept deliberately faint. The reference reads as solid toon colour with
  // shape coming from geometry, so the texture only breaks up the flatness.
  g.fillStyle = '#f4f1ec'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 16; i++) {
    const x = Math.random() * S, w = 2 + Math.random() * 7;
    g.fillStyle = Math.random() > 0.5
      ? 'rgba(196,183,163,0.045)' : 'rgba(255,255,255,0.30)';
    g.fillRect(x, 0, w, S);
    g.fillRect(x - S, 0, w, S);
  }
  seamlessDots(g, S, 45, [0.6, 1.6], 'rgba(255,255,255,0.35)');
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/* 3-band toon ramp used by every lit material */
function makeToonRamp(steps) {
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => {
    const b = Math.round(v * 255);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  });
  const t = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/* ==================================================================
   3.  WORLD BENDING
   ------------------------------------------------------------------
   The trick: intercept the vertex shader right where three.js would
   normally do modelViewMatrix * position, and instead go
   model -> world -> [bend] -> view -> clip.
   The uniforms are shared *objects*, so one assignment updates every
   patched material at once.
   ================================================================== */
const BEND = {
  uBendOrigin: { value: new THREE.Vector3() },
  uBendDown:   { value: 0.010 },
  uBendPull:   { value: 0.004 },
  uBendClamp:  { value: 75.0 }
};
const FOG = {
  uFogColor: { value: new THREE.Color(COL.sky) },
  uFogNear:  { value: 26.0 },
  uFogFar:   { value: 78.0 }
};

const BEND_PARS = `
uniform vec3  uBendOrigin;
uniform float uBendDown;
uniform float uBendPull;
uniform float uBendClamp;
vec3 applyWorldBend(vec3 wp){
  vec2  d    = wp.xz - uBendOrigin.xz;
  float len  = length(d);
  vec2  dir  = len > 0.0001 ? d / len : vec2(0.0);
  float dist = min(len, uBendClamp);
  float d2   = dist * dist;
  wp.y  -= d2 * uBendDown;   // sink away from the focus point
  wp.xz -= dir * d2 * uBendPull; // and pull the horizon in
  return wp;
}
`;

const BEND_PROJECT = `
  vec4 bentWorld = modelMatrix * vec4( transformed, 1.0 );
  bentWorld.xyz  = applyWorldBend( bentWorld.xyz );
  vec4 mvPosition = viewMatrix * bentWorld;
  gl_Position = projectionMatrix * mvPosition;
`;

/** Patch any stock three.js material so it obeys the curve. */
function bendable(mat) {
  mat.onBeforeCompile = shader => {
    shader.uniforms.uBendOrigin = BEND.uBendOrigin;
    shader.uniforms.uBendDown   = BEND.uBendDown;
    shader.uniforms.uBendPull   = BEND.uBendPull;
    shader.uniforms.uBendClamp  = BEND.uBendClamp;
    shader.vertexShader = BEND_PARS + shader.vertexShader
      .replace('#include <project_vertex>', BEND_PROJECT);
  };
  mat.customProgramCacheKey = () => 'worldbend-v1';
  return mat;
}

/* ==================================================================
   4.  RENDERER / SCENE / CAMERA
   ================================================================== */
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(COL.sky);
scene.fog = new THREE.Fog(COL.sky, FOG.uFogNear.value, FOG.uFogFar.value);

const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 400);

scene.add(new THREE.HemisphereLight(0xdcefe8, 0xffcf8a, 0.66));
const sun = new THREE.DirectionalLight(0xfff6e6, 0.48);
sun.position.set(6, 10, 4);
scene.add(sun);
const rim = new THREE.DirectionalLight(0xcfe6ff, 0.18);
rim.position.set(-6, 4, -5);
scene.add(rim);

/* ==================================================================
   5.  ISLAND HEIGHTMAP
   ------------------------------------------------------------------
   level = -1 -> ocean, 0 -> beach, 1..3 -> plateaus.
   A relaxation pass guarantees neighbouring land never differs by
   more than one level, so every tile is reachable on foot.
   ================================================================== */
const NEI = [[1,0],[-1,0],[0,1],[0,-1]];
const statsEl = document.getElementById('stats');
let statsBase = '', statsShown = '';
let level = null;

function generateIsland(seed) {
  const N = GRID, L = new Int8Array(N * N).fill(-1);
  const c = (N - 1) / 2;

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const nx = (i - c) / (N * 0.5);
      const nz = (j - c) / (N * 0.5);
      // wobbly, slightly oval coastline
      const d = Math.sqrt(nx * nx * 1.05 + nz * nz * 1.28);
      const warp = (fbm(i * 0.13, j * 0.13, seed, 4) - 0.5) * 0.66;
      const mask = 1.0 - d + warp;
      if (mask < 0.20) continue;                       // ocean

      // Terracing is driven mostly by noise, not by the radial mask —
      // otherwise every island comes out as concentric rings.
      const e  = fbm(i * 0.105 + 31.7, j * 0.105 + 11.3, seed + 9137, 3);
      const e2 = fbm(i * 0.26  + 71.2, j * 0.26  + 47.9, seed + 5511, 2); // crenellated edges
      const rim = Math.min(1, (mask - 0.20) * 3.6);    // fall away near the coast
      // push the south + west shoulders down so broad beaches form there
      const beachBias = Math.max(0, nz * 0.62 + (-nx) * 0.42) * 0.85;
      const hv = rim * 1.20 + (e - 0.46) * 3.8 + (e2 - 0.5) * 0.55 - beachBias;
      L[j * N + i] = Math.max(0, Math.min(MAX_LEVEL, Math.floor(hv * 2.05)));
    }
  }

  // walkability relaxation: no land-to-land step bigger than one level
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const id = j * N + i, h = L[id];
      if (h < 0) continue;
      let lo = 99;
      for (const [di, dj] of NEI) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        const nh = L[nj * N + ni];
        if (nh >= 0 && nh < lo) lo = nh;
      }
      if (lo < 99 && h > lo + 1) { L[id] = lo + 1; changed = true; }
    }
    if (!changed) break;
  }

  // trim lonely single tiles poking out of the sea
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const id = j * N + i;
    if (L[id] < 0) continue;
    let n = 0;
    for (const [di, dj] of NEI) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      if (L[nj * N + ni] >= 0) n++;
    }
    if (n <= 1) L[id] = -1;
  }
  return L;
}

const worldX = i => (i - GRID / 2 + 0.5) * TILE;
const cellI  = x => Math.floor(x / TILE + GRID / 2);
function levelAt(x, z) {
  const i = cellI(x), j = cellI(z);
  if (i < 0 || j < 0 || i >= GRID || j >= GRID) return -1;
  return level[j * GRID + i];
}

/* ==================================================================
   6.  TILE MESH BUILDER
   ------------------------------------------------------------------
   Faces are emitted by hand rather than via BoxGeometry so we can (a)
   skip every hidden face and (b) map UVs to *world* space, which makes
   the sand grain flow across tile seams instead of restarting.
   ================================================================== */
function Buf() { return { pos: [], nrm: [], uv: [], col: [] }; }

const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _nn = new THREE.Vector3();
/** n === null asks for a flat face normal derived from the corners. */
function pushQuad(B, p, n, uv, c) {
  if (!n) {
    _e1.set(p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]);
    _e2.set(p[3][0] - p[0][0], p[3][1] - p[0][1], p[3][2] - p[0][2]);
    _nn.crossVectors(_e1, _e2);
    if (_nn.lengthSq() < 1e-12) _nn.set(0, 1, 0); else _nn.normalize();
    n = [_nn.x, _nn.y, _nn.z];
  }
  const order = [0, 1, 2, 0, 2, 3];
  for (const k of order) {
    B.pos.push(p[k][0], p[k][1], p[k][2]);
    B.nrm.push(n[0], n[1], n[2]);
    if (B.uv) B.uv.push(uv[k][0], uv[k][1]);
    B.col.push(c[k][0], c[k][1], c[k][2]);
  }
}
function toGeometry(B) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
  g.setAttribute('normal',   new THREE.Float32BufferAttribute(B.nrm, 3));
  if (B.uv && B.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
  g.setAttribute('color',    new THREE.Float32BufferAttribute(B.col, 3));
  return g;
}
const _c = new THREE.Color();
function tint(hex, mul, jitter) {
  _c.setHex(hex);
  const m = mul * (1 + (jitter || 0));
  return [_c.r * m, _c.g * m, _c.b * m];
}

/* --- horizontal quad; up=false flips it to face down (overhang undersides) --- */
function quadY(B, x0, x1, z0, z1, y, up, c) {
  const p = up
    ? [[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]]
    : [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]];
  const uv = p.map(q => [q[0], q[2]]);
  pushQuad(B, p, null, uv, [c, c, c, c]);
}
/* --- vertical quad running from (ox,oz) along (ux,uz); outward normal = (-uz,0,ux) --- */
function quadV(B, ox, oz, ux, uz, len, yB, yT, cBot, cTop) {
  const ex = ox + ux * len, ez = oz + uz * len;
  const p = [[ox, yB, oz], [ex, yB, ez], [ex, yT, ez], [ox, yT, oz]];
  const uv = p.map(q => [ux !== 0 ? q[0] : q[2], q[1]]);
  pushQuad(B, p, null, uv, [cBot, cBot, cTop, cTop]);
}

/* ------------------------------------------------------------------
   THE ROCK FACE
   ------------------------------------------------------------------
   A cliff panel is not a quad. It is a small grid pushed outward by
   `wallOffset`, which is the piece doing all the visual work:

     lobe  - pinned to 0 at both tile edges, bulging in the middle.
             Pinning is what keeps the mesh watertight at corners, and
             it also produces the vertical crease at every tile seam.
     vert  - 0 at the top so the rock tucks in under the sand lip,
             ramping to full within the first fifth of the drop.
     n1/n2 - world-space noise, so bumps flow across tile boundaries
             instead of restarting per tile.
     crack - a gaussian gouge carving one crevasse per panel.
   ------------------------------------------------------------------ */
function wallProfile(u) {
  // A flat slab that ramps to nothing at both seams. Two neighbouring panels
  // therefore meet in a crisp V indent — the divider seen between tiles —
  // and pinning to zero is also what keeps corners watertight.
  const e = 0.085;
  return Math.max(0, Math.min(1, u / e, (1 - u) / e));
}
function wallOffset(u, dep, along, y, fd, cracks) {
  const lat  = wallProfile(u);
  const vert = Math.min(1, dep / 0.09);          // tuck in under the sand lip
  let d = FLARE * fd * lat * vert;
  // horizontal crack bands cut across the panel
  for (let k = 0; k < cracks.length; k++) {
    d -= FLARE * 0.60 * lat * Math.exp(-Math.pow((dep - cracks[k]) / 0.035, 2));
  }
  // just enough world-space noise that a long run of tiles isn't identical
  d += (valueNoise(along * 1.7, y * 1.3, 4411) - 0.5) * 0.013 * lat * vert;
  // a plinth where the rock meets the ground
  d += 0.016 * lat * Math.max(0, Math.min(1, (dep - 0.88) / 0.12));
  // never let the rock reach past the lip — the overhang has to stay readable
  return Math.max(0, Math.min(d, OVER - 0.022));
}
/* Solid toon shading: a hard shadow under the lip, recessed seams and cracks
   reading darker than the slab, and a darker plinth at the base. */
function shadeRock(dep, d) {
  const under  = 0.46 + 0.54 * Math.min(1, dep / 0.085);
  const plinth = 1 - 0.22 * Math.max(0, (dep - 0.80) / 0.20);
  const groove = 0.68 + 0.32 * Math.min(1, d / (FLARE * 0.85));
  return Math.max(0.24, Math.min(1.06, under * plinth * groove));
}

function rockWall(B, ox, oz, ux, uz, len, yB, yT, fd, cracks, jit) {
  const nx = -uz, nz = ux;             // outward
  const H = yT - yB;
  if (H <= 0.01) return;

  // Columns cluster around the seams; the middle of the panel is one flat
  // span, so the slab stays perfectly planar and reads as solid colour.
  const US = [0, 0.05, 0.085, 0.915, 0.95, 1];
  // Rows only where the profile actually changes: the lip tuck, any crack
  // band, and the plinth.
  const DS = [0, 0.05, 0.09, 0.80, 0.88, 0.94, 1];
  for (let k = 0; k < cracks.length; k++) {
    const c = cracks[k];
    DS.push(c - 0.045, c - 0.018, c + 0.018, c + 0.045);
  }
  DS.sort((a, b) => a - b);
  const deps = DS.filter((v, i) => v >= 0 && v <= 1 && (i === 0 || v - DS[i - 1] > 0.004));

  const rows = [];
  for (let jj = 0; jj < deps.length; jj++) {
    const dep = deps[jj], py = yT - H * dep;
    const row = [];
    for (let ii = 0; ii < US.length; ii++) {
      const u = US[ii];
      const bx = ox + ux * len * u, bz = oz + uz * len * u;
      const along = ux !== 0 ? bx : bz;
      const d = wallOffset(u, dep, along, py, fd, cracks);
      row.push([bx + nx * d, py, bz + nz * d, d, dep]);
    }
    rows.push(row);
  }
  // deps runs top -> bottom, so walk it backwards to keep the winding outward
  for (let jj = rows.length - 1; jj > 0; jj--) {
    for (let ii = 0; ii < US.length - 1; ii++) {
      const q = [rows[jj][ii], rows[jj][ii + 1], rows[jj - 1][ii + 1], rows[jj - 1][ii]];
      pushQuad(B,
        q.map(a => [a[0], a[1], a[2]]),
        null,
        q.map(a => [ux !== 0 ? a[0] : a[2], a[1]]),
        q.map(a => tint(COL.rock, shadeRock(a[4], a[3]), jit)));
    }
  }
}

function buildTerrain() {
  const tops = Buf(), sides = Buf();
  let count = 0;

  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const h = level[j * GRID + i];
      if (h < 0) continue;
      count++;

      const at = (di, dj) => {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= GRID || nj >= GRID) return -1;
        return level[nj * GRID + ni];
      };
      const nXp = at(1, 0), nXm = at(-1, 0), nZp = at(0, 1), nZm = at(0, -1);

      const x0 = worldX(i) - TILE / 2, x1 = x0 + TILE;
      const z0 = worldX(j) - TILE / 2, z1 = z0 + TILE;
      const yT = levelY(h);         // walkable surface
      const yR = yT - RIM;          // underside of the sand cap

      // a side overhangs only where the ground actually falls away
      const eXp = nXp < h ? OVER : 0, eXm = nXm < h ? OVER : 0;
      const eZp = nZp < h ? OVER : 0, eZm = nZm < h ? OVER : 0;
      const cx0 = x0 - eXm, cx1 = x1 + eXp, cz0 = z0 - eZm, cz1 = z1 + eZp;

      const jit  = (hash2(i, j, 7) - 0.5) * 0.06;
      const sand = h === 0 ? COL.sandBeach : COL.sand;
      const cTop = tint(sand, 1.0, jit);
      const rimT = tint(sand, 0.90, jit), rimB = tint(sand, 0.74, jit);
      const dark = tint(COL.rock, 0.42, jit);

      /* --- 1. the cap --- */
      quadY(tops, cx0, cx1, cz0, cz1, yT, true, cTop);

      /* --- 2. rims: span the FULL cap edge so perpendicular rims
             meet exactly at the corner post --- */
      if (eXp) quadV(tops, cx1, cz1,  0, -1, cz1 - cz0, yR, yT, rimB, rimT);
      if (eXm) quadV(tops, cx0, cz0,  0,  1, cz1 - cz0, yR, yT, rimB, rimT);
      if (eZp) quadV(tops, cx0, cz1,  1,  0, cx1 - cx0, yR, yT, rimB, rimT);
      if (eZm) quadV(tops, cx1, cz0, -1,  0, cx1 - cx0, yR, yT, rimB, rimT);

      /* --- 3. undersides: cell extent only, corners added once by X --- */
      if (eXp) quadY(sides, x1, cx1, z0, z1, yR, false, dark);
      if (eXm) quadY(sides, cx0, x0, z0, z1, yR, false, dark);
      if (eZp) quadY(sides, x0, x1, z1, cz1, yR, false, dark);
      if (eZm) quadY(sides, x0, x1, cz0, z0, yR, false, dark);
      if (eXp && eZp) quadY(sides, x1, cx1, z1, cz1, yR, false, dark);
      if (eXp && eZm) quadY(sides, x1, cx1, cz0, z0, yR, false, dark);
      if (eXm && eZp) quadY(sides, cx0, x0, z1, cz1, yR, false, dark);
      if (eXm && eZm) quadY(sides, cx0, x0, cz0, z0, yR, false, dark);

      /* --- 4. end caps where a lip stops mid-run --- */
      if (eXp && !eZp) quadV(tops, x1,  z1,  1,  0, eXp, yR, yT, rimB, rimT);
      if (eXp && !eZm) quadV(tops, cx1, z0, -1,  0, eXp, yR, yT, rimB, rimT);
      if (eXm && !eZp) quadV(tops, cx0, z1,  1,  0, eXm, yR, yT, rimB, rimT);
      if (eXm && !eZm) quadV(tops, x0,  z0, -1,  0, eXm, yR, yT, rimB, rimT);
      if (eZp && !eXp) quadV(tops, x1,  cz1, 0, -1, eZp, yR, yT, rimB, rimT);
      if (eZp && !eXm) quadV(tops, x0,  z1,  0,  1, eZp, yR, yT, rimB, rimT);
      if (eZm && !eXp) quadV(tops, x1,  z0,  0, -1, eZm, yR, yT, rimB, rimT);
      if (eZm && !eXm) quadV(tops, x0,  cz0, 0,  1, eZm, yR, yT, rimB, rimT);

      /* --- 5. the rock itself --- */
      const wall = (k, nh, ox, oz, ux, uz) => {
        const yB = nh >= 0 ? levelY(nh) : SKIRT_Y;
        const fd = 0.72 + hash2(i * 4 + k, j, seed + 31) * 0.42;   // how proud the slab sits
        // 0-2 horizontal cracks, placed away from the lip and the plinth
        const cracks = [];
        const r = hash2(i, j * 4 + k, seed + 77);
        if (r > 0.58) cracks.push(0.30 + hash2(i + k, j, seed + 101) * 0.34);
        if (r > 0.90) cracks.push(0.64 + hash2(i, j + k, seed + 211) * 0.14);
        rockWall(sides, ox, oz, ux, uz, TILE, yB, yR, fd, cracks, jit);
      };
      if (eXp) wall(0, nXp, x1, z1,  0, -1);
      if (eXm) wall(1, nXm, x0, z0,  0,  1);
      if (eZp) wall(2, nZp, x0, z1,  1,  0);
      if (eZm) wall(3, nZm, x1, z0, -1,  0);
    }
  }
  return { tops: toGeometry(tops), sides: toGeometry(sides), count };
}

/* ==================================================================
   7.  SHORE MASK  ->  texture the water shader reads for foam
   ================================================================== */
function buildShoreTexture() {
  const N = GRID;
  let f = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) f[k] = level[k] >= 0 ? 1 : 0;

  // three separable box-blur passes ≈ a soft distance field
  for (let pass = 0; pass < 3; pass++) {
    const g = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let s = 0, n = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= N || b >= N) { n++; continue; }
        s += f[b * N + a]; n++;
      }
      g[j * N + i] = s / n;
    }
    f = g;
  }

  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const v = Math.round(Math.min(1, f[j * N + i]) * 255);
    // canvas row 0 is the top; CanvasTexture flips Y, so mirror j here
    const o = ((N - 1 - j) * N + i) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  return t;
}

/* ==================================================================
   8.  TOON WATER
   ================================================================== */
const waterUniforms = {
  uTime:      { value: 0 },
  uShore:     { value: null },
  uMapOrigin: { value: new THREE.Vector2(-GRID / 2 * TILE, -GRID / 2 * TILE) },
  uMapSize:   { value: GRID * TILE },
  uDeep:      { value: new THREE.Color(COL.waterDeep) },
  uShallow:   { value: new THREE.Color(COL.waterShal) },
  uFoam:      { value: new THREE.Color(COL.foam) },
  uBendOrigin: BEND.uBendOrigin, uBendDown: BEND.uBendDown,
  uBendPull: BEND.uBendPull,     uBendClamp: BEND.uBendClamp,
  uFogColor: FOG.uFogColor, uFogNear: FOG.uFogNear, uFogFar: FOG.uFogFar
};

const waterMat = new THREE.ShaderMaterial({
  uniforms: waterUniforms,
  vertexShader: BEND_PARS + `
    uniform float uTime;
    varying vec3  vWorld;
    varying float vFogDepth;
    void main(){
      vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
      wp.y += sin(wp.x * 0.42 + uTime * 1.15) * 0.035
            + sin(wp.z * 0.57 - uTime * 0.85) * 0.035;
      vWorld = wp;
      vec4 mv = viewMatrix * vec4(applyWorldBend(wp), 1.0);
      vFogDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: `
    precision highp float;
    uniform sampler2D uShore;
    uniform vec2  uMapOrigin;
    uniform float uMapSize, uTime, uFogNear, uFogFar;
    uniform vec3  uDeep, uShallow, uFoam, uFogColor;
    varying vec3  vWorld;
    varying float vFogDepth;
    void main(){
      vec2 uv = (vWorld.xz - uMapOrigin) / uMapSize;
      float shore = texture2D(uShore, clamp(uv, 0.002, 0.998)).r;

      // wobble the shoreline so the foam is not a straight grid edge
      float wob = sin(vWorld.x * 1.15 + vWorld.z * 0.9  + uTime * 1.30) * 0.030
                + sin(vWorld.x * 2.70 - vWorld.z * 2.2  - uTime * 0.95) * 0.018;
      float s = shore + wob;

      // hard toon banding instead of a gradient
      vec3 col = uDeep;
      col = mix(col, mix(uDeep, uShallow, 0.55), step(0.06, s));
      col = mix(col, uShallow, step(0.20, s));
      float foam = step(0.34, s);
      col = mix(col, uFoam, foam * 0.9);

      // drifting sparkle stripes out in the open water
      float sp = step(0.90, sin(vWorld.x * 0.75 + vWorld.z * 1.6 + uTime * 0.45))
               * (1.0 - step(0.10, s));
      col = mix(col, uFoam, sp * 0.30);

      float f = smoothstep(uFogNear, uFogFar, vFogDepth);
      gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
    }
  `
});

const water = new THREE.Mesh(new THREE.PlaneGeometry(260, 260, 150, 150), waterMat);
water.rotation.x = -Math.PI / 2;
water.position.y = WATER_Y;
scene.add(water);

/* ==================================================================
   9.  MATERIALS + ISLAND ASSEMBLY
   ================================================================== */
const ramp = makeToonRamp([0.58, 0.75, 0.89, 1.0]);
const sandTex = makeSandTexture();
const rockTex = makeRockTexture();

const topMat = bendable(new THREE.MeshToonMaterial({
  map: sandTex, gradientMap: ramp, vertexColors: true
}));
const sideMat = bendable(new THREE.MeshToonMaterial({
  map: rockTex, gradientMap: ramp, vertexColors: true
}));
const propMat = bendable(new THREE.MeshToonMaterial({
  gradientMap: ramp, vertexColors: true
}));

let islandGroup = new THREE.Group();
let propsGroup  = new THREE.Group();
scene.add(islandGroup, propsGroup);

/* --- simple box helper for the scenery --- */
function addBox(B, cx, cy, cz, sx, sy, sz, hex, shadeFoot) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2;
  const y0 = cy,          y1 = cy + sy;
  const z0 = cz - sz / 2, z1 = cz + sz / 2;
  const top = tint(hex, 1.0, 0), bot = tint(hex, shadeFoot ? 0.72 : 1.0, 0);
  const faces = [
    { p: [[x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0]], n: [0,1,0],  c: [top,top,top,top] },
    { p: [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]], n: [0,-1,0], c: [bot,bot,bot,bot] },
    { p: [[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]], n: [1,0,0],  c: [bot,bot,top,top] },
    { p: [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]], n: [-1,0,0], c: [bot,bot,top,top] },
    { p: [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]], n: [0,0,1],  c: [bot,bot,top,top] },
    { p: [[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]], n: [0,0,-1], c: [bot,bot,top,top] }
  ];
  for (const f of faces) pushQuad(B, f.p, f.n, [[0,0],[0,0],[0,0],[0,0]], f.c);
}

function buildProps(seed) {
  const B = { pos: [], nrm: [], uv: null, col: [] };
  const used = new Set();
  let placed = 0, tries = 0;
  while (placed < 34 && tries < 900) {
    tries++;
    const i = Math.floor(hash2(tries, 11, seed) * GRID);
    const j = Math.floor(hash2(tries, 29, seed) * GRID);
    const key = j * GRID + i;
    if (used.has(key)) continue;
    const h = level[key];
    if (h < 1) continue;                             // keep the beaches clear
    if (hash2(i, j, seed + 5) < 0.55) continue;
    used.add(key);

    const x = worldX(i) + (hash2(i, j, seed + 1) - 0.5) * 0.4;
    const z = worldX(j) + (hash2(i, j, seed + 2) - 0.5) * 0.4;
    const y = levelY(h);
    const kind = hash2(i, j, seed + 3);

    if (kind > 0.34) {
      // stubby toon tree: trunk + two stacked leaf slabs
      const s = 0.85 + hash2(i, j, seed + 4) * 0.4;
      addBox(B, x, y, z, 0.20 * s, 0.62 * s, 0.20 * s, COL.trunk, true);
      addBox(B, x, y + 0.50 * s, z, 0.95 * s, 0.44 * s, 0.95 * s, COL.leafDark, true);
      addBox(B, x, y + 0.88 * s, z, 0.66 * s, 0.38 * s, 0.66 * s, COL.leaf, true);
    } else {
      const s = 0.4 + hash2(i, j, seed + 6) * 0.35;
      addBox(B, x, y, z, s, s * 0.75, s * 0.9, COL.boulder, true);
      addBox(B, x + s * 0.4, y, z - s * 0.2, s * 0.5, s * 0.4, s * 0.5, COL.boulder, true);
    }
    placed++;
  }
  return toGeometry(B);
}

/* --- (re)build everything for a given seed --- */
let seed = Math.floor(Math.random() * 99999);
function buildWorld(s) {
  seed = s;
  level = generateIsland(seed);

  islandGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  propsGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  islandGroup.clear ? islandGroup.clear() : (islandGroup.children.length = 0);
  propsGroup.clear ? propsGroup.clear() : (propsGroup.children.length = 0);

  const t = buildTerrain();
  islandGroup.add(new THREE.Mesh(t.tops, topMat));
  islandGroup.add(new THREE.Mesh(t.sides, sideMat));
  propsGroup.add(new THREE.Mesh(buildProps(seed), propMat));

  if (waterUniforms.uShore.value) waterUniforms.uShore.value.dispose();
  waterUniforms.uShore.value = buildShoreTexture();

  statsBase = 'seed ' + seed + ' · ' + t.count + ' tiles';
  statsEl.textContent = statsShown = statsBase;

  spawnPlayer();
}

/* ==================================================================
   10.  CHARACTER
   ================================================================== */
function capsuleGeometry(r, h, seg) {
  const pts = [], cap = 8;
  for (let i = 0; i <= cap; i++) {
    const a = -Math.PI / 2 + (i / cap) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * r, -h / 2 + Math.sin(a) * r));
  }
  for (let i = 0; i <= cap; i++) {
    const a = (i / cap) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.cos(a) * r, h / 2 + Math.sin(a) * r));
  }
  return new THREE.LatheGeometry(pts, seg || 26);
}

const R_BODY = 0.30, H_BODY = 0.52;
const CENTER_Y = H_BODY / 2 + R_BODY;    // capsule centre when feet are at 0

const player = new THREE.Group();
const body = new THREE.Group();
player.add(body);

const bodyMesh = new THREE.Mesh(
  capsuleGeometry(R_BODY, H_BODY),
  bendable(new THREE.MeshToonMaterial({
    color: COL.body, gradientMap: ramp, side: THREE.DoubleSide
  }))
);
body.add(bodyMesh);

// a pale band reads as clothing. An inscribed sphere would hide *inside* the
// capsule, so this is an open cylinder sitting a hair proud of the surface.
const belly = new THREE.Mesh(
  new THREE.CylinderGeometry(R_BODY * 1.012, R_BODY * 1.012, 0.24, 26, 1, true),
  bendable(new THREE.MeshToonMaterial({
    color: 0xfff6e2, gradientMap: ramp, side: THREE.DoubleSide
  }))
);
belly.position.y = -0.06;
body.add(belly);

const eyeMat = bendable(new THREE.MeshToonMaterial({ color: 0x35434a, gradientMap: ramp }));
const eyeGeo = new THREE.SphereGeometry(0.052, 12, 10);
for (const sx of [-1, 1]) {
  const e = new THREE.Mesh(eyeGeo, eyeMat);
  e.position.set(sx * 0.105, 0.20, 0.262);
  body.add(e);
}
const cheekMat = bendable(new THREE.MeshToonMaterial({ color: 0xffb2a4, gradientMap: ramp, transparent: true, opacity: 0.85 }));
for (const sx of [-1, 1]) {
  const ch = new THREE.Mesh(new THREE.CircleGeometry(0.05, 14), cheekMat);
  const a = sx * 0.56;                       // angle around the body
  ch.position.set(Math.sin(a) * R_BODY * 1.02, 0.10, Math.cos(a) * R_BODY * 1.02);
  ch.rotation.y = a;
  body.add(ch);
}
// little tuft so the silhouette isn't a plain pill
const tuft = new THREE.Mesh(
  new THREE.ConeGeometry(0.09, 0.16, 8),
  bendable(new THREE.MeshToonMaterial({ color: COL.bodyDark, gradientMap: ramp }))
);
tuft.position.set(0, R_BODY + H_BODY / 2 - 0.02, 0);
tuft.rotation.z = 0.2;
body.add(tuft);

// fake contact shadow (real shadow maps would need the depth shader bent too)
const shadowCanvas = document.createElement('canvas');
shadowCanvas.width = shadowCanvas.height = 64;
{
  const g = shadowCanvas.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(0.6, 'rgba(0,0,0,0.22)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
}
const blob = new THREE.Mesh(
  new THREE.PlaneGeometry(0.95, 0.95),
  bendable(new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(shadowCanvas), transparent: true,
    depthWrite: false, opacity: 0.5
  }))
);
blob.rotation.x = -Math.PI / 2;
scene.add(blob);
scene.add(player);

const P = { x: 0, z: 0, level: 0, y: 0, yaw: 0, speed: 0, walkPhase: 0 };

function spawnPlayer() {
  // start on the highest tile nearest the middle of the map
  let best = null, bestScore = -1e9;
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const h = level[j * GRID + i];
    if (h < 0) continue;
    const dx = i - GRID / 2, dz = j - GRID / 2;
    const score = h * 3 - Math.sqrt(dx * dx + dz * dz) * 0.4;
    if (score > bestScore) { bestScore = score; best = [i, j, h]; }
  }
  if (!best) best = [GRID >> 1, GRID >> 1, 0];
  P.x = worldX(best[0]); P.z = worldX(best[1]);
  P.level = best[2]; P.y = levelY(P.level);
  cam.yaw = 0.6; cam.pitch = 0.62; cam.dist = 11;
  cam.tx = P.x; cam.tz = P.z; cam.ty = P.y + 0.8;
}

/** Returns the level the player would stand on, or null if blocked. */
const FEET = [[0.24, 0.24], [-0.24, 0.24], [0.24, -0.24], [-0.24, -0.24], [0, 0]];
function probe(nx, nz) {
  let top = -1;
  for (const [ox, oz] of FEET) {
    const l = levelAt(nx + ox, nz + oz);
    if (l < 0) return null;             // off the island / in the sea
    if (l > top) top = l;
  }
  if (Math.abs(top - P.level) > 1) return null;  // cliff too tall to climb
  return top;
}

/* ==================================================================
   10b. TILE PICKING IN A BENT WORLD
   ------------------------------------------------------------------
   The bend lives in the vertex shader, so the geometry three.js would
   raycast against is still the FLAT mesh. Picking that directly works
   at zero curvature and drifts badly as you crank it up.

   The bend only moves a point radially around the origin plus straight
   down, so it inverts in closed form. Forward:

       bentR = r - pull * min(r, C)^2      (direction unchanged)
       bentY = y - down * min(r, C)^2

   Inverting the radial term is just a quadratic. So: march the camera
   ray through bent space, un-bend each sample back to flat world space,
   and test it against the heightmap.
   ================================================================== */
const raycaster = new THREE.Raycaster();
const pick = { ndc: new THREE.Vector2(), active: false, hit: false, i: -1, j: -1, l: -1 };
const _u = { x: 0, y: 0, z: 0 };

/** Bent-space point -> flat world point. false when past the fold. */
function unbend(qx, qy, qz, out) {
  const O = BEND.uBendOrigin.value;
  const pull = BEND.uBendPull.value, down = BEND.uBendDown.value, C = BEND.uBendClamp.value;
  const dx = qx - O.x, dz = qz - O.z;
  const rq = Math.sqrt(dx * dx + dz * dz);
  let r;
  if (pull < 1e-7) {
    r = rq;
  } else {
    const disc = 1 - 4 * pull * rq;
    if (disc < 0) return false;             // beyond where the world folds over
    r = (1 - Math.sqrt(disc)) / (2 * pull); // near branch, continuous at pull -> 0
    if (r > C) r = rq + pull * C * C;       // past the clamp the map is linear
  }
  const k = rq > 1e-6 ? r / rq : 0;
  out.x = O.x + dx * k;
  out.z = O.z + dz * k;
  const c = Math.min(r, C);
  out.y = qy + down * c * c;
  return true;
}

/** True when a flat-space point is at or below the terrain surface. */
function belowGround(p) {
  const l = levelAt(p.x, p.z);
  return l >= 0 && p.y <= levelY(l);
}

function pickTile() {
  raycaster.setFromCamera(pick.ndc, camera);
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  let tPrev = 0.3, found = -1;

  // coarse march, stepping wider as it gets further away
  for (let t = 0.3; t < 160; t += 0.22 + t * 0.02) {
    if (unbend(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t, _u) && belowGround(_u)) {
      found = t; break;
    }
    tPrev = t;
  }
  if (found < 0) { pick.hit = false; return; }

  // bisect the last gap for a clean tile boundary
  let a = tPrev, b = found;
  for (let k = 0; k < 16; k++) {
    const m = (a + b) * 0.5;
    if (unbend(o.x + d.x * m, o.y + d.y * m, o.z + d.z * m, _u) && belowGround(_u)) m;
    else a = m;
  }
  unbend(o.x + d.x * b, o.y + d.y * b, o.z + d.z * b, _u);
  const i = cellI(_u.x), j = cellI(_u.z);
  if (i < 0 || j < 0 || i >= GRID || j >= GRID) { pick.hit = false; return; }
  pick.hit = true; pick.i = i; pick.j = j; pick.l = level[j * GRID + i];
}

/* --- the highlight quad. It is bendable like everything else, and sits at
       the tile's FLAT position, so the shader curves it onto the right spot. --- */
const hlCanvas = document.createElement('canvas');
hlCanvas.width = hlCanvas.height = 128;
{
  const g = hlCanvas.getContext('2d');
  const r = 14, m = 7, s = 128 - m * 2;
  g.beginPath();
  g.moveTo(m + r, m);
  g.arcTo(m + s, m, m + s, m + s, r); g.arcTo(m + s, m + s, m, m + s, r);
  g.arcTo(m, m + s, m, m, r);         g.arcTo(m, m, m + s, m, r);
  g.closePath();
  g.fillStyle = 'rgba(255,255,255,0.16)'; g.fill();
  g.lineWidth = 9; g.strokeStyle = 'rgba(255,255,255,0.95)'; g.stroke();
}
const highlight = new THREE.Mesh(
  new THREE.PlaneGeometry(TILE, TILE),
  bendable(new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(hlCanvas),
    transparent: true, depthWrite: false, opacity: 0.9
  }))
);
highlight.rotation.x = -Math.PI / 2;
highlight.visible = false;
highlight.renderOrder = 2;
scene.add(highlight);

/* ==================================================================
   11.  RAIN  (positions solved entirely in the vertex shader)
   ================================================================== */
const RAIN_MAX = 1100, RAIN_AREA = 26;
const rainUniforms = {
  uTime: { value: 0 }, uAnchor: { value: new THREE.Vector3() },
  uArea: { value: RAIN_AREA }, uTop: { value: 15 }, uSpan: { value: 21 },
  uBendOrigin: BEND.uBendOrigin, uBendDown: BEND.uBendDown,
  uBendPull: BEND.uBendPull,     uBendClamp: BEND.uBendClamp
};
const rainGeo = new THREE.BufferGeometry();
{
  const pos = new Float32Array(RAIN_MAX * 2 * 3);
  const rnd = new Float32Array(RAIN_MAX * 2 * 3);
  for (let i = 0; i < RAIN_MAX; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * RAIN_AREA;
    const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
    const phase = Math.random() * 21;
    for (let k = 0; k < 2; k++) {
      const o = (i * 2 + k) * 3;
      pos[o] = 0; pos[o + 1] = k === 0 ? 0 : -0.55; pos[o + 2] = 0;
      rnd[o] = ox; rnd[o + 1] = phase; rnd[o + 2] = oz;
    }
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rainGeo.setAttribute('aRand',    new THREE.BufferAttribute(rnd, 3));
}
const rainMat = new THREE.ShaderMaterial({
  uniforms: rainUniforms,
  transparent: true, depthWrite: false,
  vertexShader: BEND_PARS + `
    attribute vec3 aRand;
    uniform float uTime, uArea, uTop, uSpan;
    uniform vec3  uAnchor;
    varying float vA;
    void main(){
      float y = uAnchor.y + uTop - mod(aRand.y + uTime * 15.0, uSpan);
      vec3 wp = vec3(uAnchor.x + aRand.x, y + position.y, uAnchor.z + aRand.z);
      vA = 1.0 - smoothstep(0.55, 1.0, length(aRand.xz) / uArea);
      vec4 mv = viewMatrix * vec4(applyWorldBend(wp), 1.0);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: `
    precision mediump float;
    varying float vA;
    void main(){ gl_FragColor = vec4(0.93, 0.98, 1.0, vA * 0.34); }
  `
});
const rain = new THREE.LineSegments(rainGeo, rainMat);
rain.frustumCulled = false;
scene.add(rain);

/* ==================================================================
   12.  INPUT  —  keyboard, mouse orbit, touch stick
   ================================================================== */
const keys = Object.create(null);
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

const cam = { yaw: 0.6, pitch: 0.62, dist: 11, tx: 0, ty: 0, tz: 0 };
const touchMove = { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 };
const orbit = { id: -1, px: 0, py: 0 };
const stickEl = document.getElementById('stick');
const stickNub = stickEl.firstElementChild;
const isTouchDevice = matchMedia('(pointer:coarse)').matches;

const cv = renderer.domElement;
cv.addEventListener('pointerdown', e => {
  const leftZone = e.clientX < innerWidth * 0.45 && e.clientY > innerHeight * 0.45;
  if (isTouchDevice && leftZone && !touchMove.active) {
    touchMove.active = true; touchMove.id = e.pointerId;
    touchMove.ox = e.clientX; touchMove.oy = e.clientY;
    touchMove.dx = touchMove.dy = 0;
    stickEl.style.display = 'block';
    stickEl.style.left = e.clientX + 'px';
    stickEl.style.top = e.clientY + 'px';
    stickNub.style.transform = 'translate(0,0)';
  } else if (orbit.id === -1) {
    orbit.id = e.pointerId; orbit.px = e.clientX; orbit.py = e.clientY;
  }
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointermove', e => {
  pick.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  pick.active = true;
  if (e.pointerId === touchMove.id && touchMove.active) {
    const dx = e.clientX - touchMove.ox, dy = e.clientY - touchMove.oy;
    const len = Math.hypot(dx, dy), max = 46;
    const k = len > max ? max / len : 1;
    touchMove.dx = (dx * k) / max; touchMove.dy = (dy * k) / max;
    stickNub.style.transform = 'translate(' + (dx * k) + 'px,' + (dy * k) + 'px)';
  } else if (e.pointerId === orbit.id) {
    cam.yaw   -= (e.clientX - orbit.px) * 0.006;
    cam.pitch -= (e.clientY - orbit.py) * 0.005;
    cam.pitch = Math.max(0.08, Math.min(1.25, cam.pitch));
    orbit.px = e.clientX; orbit.py = e.clientY;
  }
});
function endPointer(e) {
  if (e.pointerId === touchMove.id) {
    touchMove.active = false; touchMove.id = -1;
    touchMove.dx = touchMove.dy = 0; stickEl.style.display = 'none';
  }
  if (e.pointerId === orbit.id) orbit.id = -1;
}
cv.addEventListener('pointerleave', () => { pick.active = false; });
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('wheel', e => {
  e.preventDefault();
  cam.dist = Math.max(4, Math.min(26, cam.dist + e.deltaY * 0.012));
}, { passive: false });

/* ==================================================================
   13.  UI WIRING
   ================================================================== */
const $ = id => document.getElementById(id);
function bindRange(id, labelId, fmt, apply) {
  const el = $(id), lab = $(labelId);
  const paint = () => {
    const pct = (el.value - el.min) / (el.max - el.min) * 100;
    el.style.setProperty('--fill', pct + '%');
    lab.textContent = fmt(parseFloat(el.value));
  };
  el.addEventListener('input', () => { paint(); apply(parseFloat(el.value)); });
  paint(); apply(parseFloat(el.value));
  return el;
}
const bendDownEl = bindRange('bendDown', 'vBendDown', v => v.toFixed(4), v => BEND.uBendDown.value = v);
const bendPullEl = bindRange('bendPull', 'vBendPull', v => v.toFixed(4), v => BEND.uBendPull.value = v);
let rainAmount = 0.6;
bindRange('rain', 'vRain', v => Math.round(v) + '%', v => {
  rainAmount = v / 100;
  rain.visible = rainAmount > 0.001;
  rainGeo.setDrawRange(0, Math.floor(RAIN_MAX * rainAmount) * 2);
});

let bendOrigin = 'player';
$('originSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  [...e.currentTarget.children].forEach(c => c.classList.toggle('on', c === b));
  bendOrigin = b.dataset.v;
});
$('presetSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  [...e.currentTarget.children].forEach(c => c.classList.toggle('on', c === b));
  const p = { flat: [0, 0], cozy: [0.010, 0.004], marble: [0.026, 0.012] }[b.dataset.v];
  bendDownEl.value = p[0]; bendDownEl.dispatchEvent(new Event('input'));
  bendPullEl.value = p[1]; bendPullEl.dispatchEvent(new Event('input'));
});
$('props').addEventListener('change', e => { propsGroup.visible = e.target.checked; });
let camFollow = true;
$('follow').addEventListener('change', e => { camFollow = e.target.checked; });
$('regen').addEventListener('click', () => buildWorld(Math.floor(Math.random() * 99999)));
$('panelHead').addEventListener('click', () => $('panel').classList.toggle('collapsed'));
if (innerWidth < 760) $('panel').classList.add('collapsed');
if (isTouchDevice) $('hint').innerHTML = '<b>Drag bottom-left</b> to walk · <b>drag elsewhere</b> to orbit';
setTimeout(() => {
  const h = $('hint');
  h.style.transition = 'opacity 1s ease'; h.style.opacity = '0';
}, 9000);

/* ==================================================================
   14.  GO
   ================================================================== */
buildWorld(seed);

const clock = new THREE.Clock();
const camPos = new THREE.Vector3();
let time = 0;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;

  /* ---- gather input in camera space ---- */
  let ix = 0, iz = 0;
  if (keys.KeyW || keys.ArrowUp)    iz += 1;
  if (keys.KeyS || keys.ArrowDown)  iz -= 1;
  if (keys.KeyA || keys.ArrowLeft)  ix -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  if (touchMove.active) { ix += touchMove.dx; iz -= touchMove.dy; }
  const mag = Math.min(1, Math.hypot(ix, iz));   // analog magnitude, 0..1

  // forward = from camera toward the character, flattened
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  const rx = -fz, rz = fx;
  let mx = fx * iz + rx * ix, mz = fz * iz + rz * ix;
  const ml = Math.hypot(mx, mz);
  if (ml > 0.001) { mx /= ml; mz /= ml; }

  /* ---- move, one axis at a time so we slide along cliffs ---- */
  const SPEED = 3.6;
  const step = SPEED * mag * dt;
  if (step > 0) {
    let l = probe(P.x + mx * step, P.z);
    if (l !== null) { P.x += mx * step; P.level = l; }
    l = probe(P.x, P.z + mz * step);
    if (l !== null) { P.z += mz * step; P.level = l; }
    P.yaw = Math.atan2(mx, mz);
  }
  P.speed += ((step > 0 ? 1 : 0) - P.speed) * Math.min(1, dt * 12);

  // smooth the vertical pop when stepping up or down a terrace
  const targetY = levelY(P.level);
  P.y += (targetY - P.y) * Math.min(1, dt * 16);

  /* ---- character transform + a little walk squash ---- */
  player.position.set(P.x, P.y, P.z);
  const cur = player.rotation.y;
  let diff = P.yaw - cur;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  player.rotation.y = cur + diff * Math.min(1, dt * 12);

  P.walkPhase += dt * 11 * P.speed;
  const bob = Math.sin(P.walkPhase) * 0.05 * P.speed;
  body.position.y = CENTER_Y + Math.abs(bob);
  body.rotation.z = Math.sin(P.walkPhase * 0.5) * 0.06 * P.speed;
  const sq = 1 + Math.sin(P.walkPhase * 2) * 0.035 * P.speed;
  body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));

  blob.position.set(P.x, targetY + 0.015, P.z);
  blob.material.opacity = 0.5 - Math.max(0, P.y - targetY) * 0.4;

  /* ---- orbit camera ---- */
  const tgtX = camFollow ? P.x : cam.tx;
  const tgtZ = camFollow ? P.z : cam.tz;
  cam.tx += (tgtX - cam.tx) * Math.min(1, dt * 8);
  cam.tz += (tgtZ - cam.tz) * Math.min(1, dt * 8);
  cam.ty += ((P.y + 0.85) - cam.ty) * Math.min(1, dt * 6);

  const cd = Math.cos(cam.pitch) * cam.dist;
  camPos.set(
    cam.tx + Math.sin(cam.yaw) * cd,
    cam.ty + Math.sin(cam.pitch) * cam.dist,
    cam.tz + Math.cos(cam.yaw) * cd
  );
  camera.position.copy(camPos);
  camera.lookAt(cam.tx, cam.ty, cam.tz);

  /* ---- the bend focus: character, or the camera's ground point ---- */
  if (bendOrigin === 'player') BEND.uBendOrigin.value.set(P.x, P.y, P.z);
  else                        BEND.uBendOrigin.value.set(cam.tx, cam.ty, cam.tz);

  /* ---- tile pick + highlight (after the bend origin is current) ---- */
  if (pick.active) pickTile(); else pick.hit = false;
  highlight.visible = pick.hit;
  if (pick.hit) {
    highlight.position.set(worldX(pick.i), levelY(pick.l) + 0.02, worldX(pick.j));
    highlight.material.opacity = 0.62 + Math.sin(time * 4.5) * 0.16;
  }
  const label = pick.hit ? statsBase + ' · tile ' + pick.i + ',' + pick.j + ' · level ' + pick.l
                         : statsBase;
  if (label !== statsShown) { statsEl.textContent = statsShown = label; }

  waterUniforms.uTime.value = time;
  rainUniforms.uTime.value = time;
  rainUniforms.uAnchor.value.set(P.x, P.y, P.z);

  renderer.render(scene, camera);
}
tick();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
})();
</script>
</body>
</html>
```
