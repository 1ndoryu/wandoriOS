/* 138A-12 — Shaders GLSL del skydome procedural del Constructor de mundo.
 * Strings puros separados de game-sky.ts para mantener el módulo de montaje
 * bajo el umbral de meta (<300 líneas efectivas). El material es único por
 * cúpula; el shader consume las uniforms que monta game-sky.ts (paleta,
 * sol, nubes fbm billow, warp, self-shadow de 2 pasos y capa lejana). */

export const SKY_VERTEX_SHADER = `
varying vec3 vPos;
void main(){
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const SKY_FRAGMENT_SHADER = `
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

const mat3 M = mat3( 0.00, 0.80, 0.60,
                    -0.80, 0.36,-0.48,
                    -0.60,-0.48, 0.64);

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

vec3 warpVec(vec3 p){
  if(uWarp < 0.001) return vec3(0.0);
  return (vec3(noise(p * 0.7 + 13.1),
               noise(p * 0.7 + 51.7),
               noise(p * 0.7 + 97.3)) * 2.0 - 1.0) * uWarp;
}

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

float modeMask(float y){
  if(uMode == 0){
    return smoothstep(uHighStart, uHighStart + 0.30, y);
  } else if(uMode == 1){
    float lower = smoothstep(uBandLow - 0.18, uBandLow + 0.06, y);
    float upper = 1.0 - smoothstep(uBandTop - 0.26, uBandTop, y);
    return clamp(lower * upper, 0.0, 1.0);
  }
  return 1.0;
}

vec4 cloudLayer(vec3 dir, float scale, float coverage, int oct, float driftMul){
  float mask = modeMask(dir.y);
  float cov  = coverage * mask;
  if(cov < 0.004) return vec4(0.0);

  float a = uTime * uDrift * driftMul;
  float ca = cos(a), sa = sin(a);
  vec3 d = vec3(ca * dir.x - sa * dir.z, dir.y, sa * dir.x + ca * dir.z);

  vec3 p = vec3(d.x, d.y * uSquash, d.z) * scale
         + vec3(uSeed)
         + vec3(0.0, uTime * uEvolve * 0.03, uTime * uEvolve * 0.05);

  vec3  wo = warpVec(p);
  float f0 = fbm(p + wo, oct);

  float thr   = mix(1.02, 0.24, cov);
  float alpha = smoothstep(thr, thr + uEdge, f0);
  if(alpha <= 0.001) return vec4(0.0);
  float thick = clamp((f0 - thr) / max(0.22, 1.0 - thr), 0.0, 1.0);

  vec3 sd = normalize(vec3(uSunDir.x, uSunDir.y * uSquash, uSunDir.z)) * scale * uStepScale;
  int  o2 = oct - 1; if(o2 < 2) o2 = 2;
  float f1 = fbm(p + wo + sd * 0.11, o2);
  float f2 = fbm(p + wo + sd * 0.30, o2);
  float occ = clamp((f1 - f0) * 3.2, 0.0, 1.0) * 0.62
            + clamp((f2 - f0) * 2.0, 0.0, 1.0) * 0.38;

  float sunProx = dot(dir, uSunDir) * 0.5 + 0.5;
  float lightv  = 1.0 - occ * uShadowStr;
  lightv        = mix(lightv, lightv * 0.62 + 0.38 * sunProx, 0.38);
  lightv       -= thick * 0.30;
  lightv       += max(0.0, uSunDir.y) * 0.10;
  lightv        = clamp(lightv, 0.0, 1.0);
  lightv        = mix(0.55, lightv, clamp(uSunInfluence, 0.0, 1.5));

  vec3 col = palette(lightv);
  col = mix(col, col * uSunColor * 1.05, 0.30 * clamp(uSunInfluence, 0.0, 1.0));

  float rim = (1.0 - thick) * pow(clamp(sunProx, 0.0, 1.0), 7.0);
  col += uSunColor * rim * uSilver * 1.5 * clamp(uSunInfluence, 0.0, 1.0);

  return vec4(col, alpha);
}

void main(){
  vec3 dir = normalize(vPos);

  float up  = clamp(dir.y, 0.0, 1.0);
  vec3  sky = mix(uHorizon, uZenith, pow(up, 0.55));
  sky = mix(sky, uGround, smoothstep(0.0, -0.30, dir.y) * 0.9);

  float cosA = dot(dir, uSunDir);
  float glow = pow(max(cosA, 0.0), mix(220.0, 4.0, clamp(uSunGlow, 0.0, 1.0)));
  sky += uSunColor * glow * 0.75 * clamp(uSunInfluence, 0.0, 1.5);
  float r    = uSunSize * 0.0022;
  float disc = smoothstep(1.0 - r, 1.0 - r * 0.55, cosA);
  sky = mix(sky, uSunColor * 1.18, disc * clamp(uSunInfluence, 0.0, 1.0));

  vec3 col = sky;

  if(uL2On > 0.5){
    vec4 far = cloudLayer(dir, uScale * uL2Scale, uL2Coverage, 4, 0.45);
    col = mix(col, far.rgb, far.a * uL2Opacity);
  }
  vec4 near = cloudLayer(dir, uScale, uCoverage, uOctaves, 1.0);
  col = mix(col, near.rgb, near.a);

  float hz = 1.0 - smoothstep(0.0, 0.30, abs(dir.y));
  col = mix(col, mix(uHorizon, uGround, step(dir.y, 0.0)), hz * uHaze * 0.7);

  gl_FragColor = vec4(col, 1.0);
}`;
