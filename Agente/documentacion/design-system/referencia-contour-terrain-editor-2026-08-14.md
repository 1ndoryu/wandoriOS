# Referencia de diseño — Contour Terrain Editor (artefacto Claude)

> **Fecha:** 2026-08-14 · **Origen:** artefacto público de Claude
> **Referencia:** <https://claude.ai/public/artifacts/f2ef09a2-9591-4bd0-aef5-efee3b8287e1>

## Descripción

Artefacto de diseño **"Contour — shape-driven terrain editor"**: un editor de terreno 3D
dirigido por formas, con campos de distancia con signo (SDF), curvas Bézier y esculpido de
alturas en tiempo real. Incluye controles tipo gizmo (mover/escalar), vista previa 3D
(Three.js), panel de capas (plano/superficie), inspector de objetos, modos de visualización
(sólido/suave/bloque, wireframe) y ajuste de color por capa.

Sirve como referencia visual e interactiva para el constructor de mundo del juego
(estilo Genshin / low-poly): paleta "slate-teal + brass" estilo instrumento topográfico,
paneles laterales compactos, control numérico + slider sincronizado en tiempo real, y
agrupación de opciones de terreno en secciones pequeñas.

## Datos del artefacto

| Campo | Valor |
|---|---|
| Título original | `contour-terrain-editor.html` |
| Título meta | Contour — Interactive 3D Terrain Editor Tool |
| Tipo | `text/html` (HTML + CSS + JS autocontenido, Three.js vía CDN) |
| Descripción | Shape-driven 3D terrain editor with signed distance fields, Bézier curves, and real-time height sculpting |
| Contenido | 90.621 caracteres |
| ID | `f2ef09a2-9591-4bd0-aef5-efee3b8287e1` |

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
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Contour — shape-driven terrain editor</title>
<style>
/* ============================================================
   CONTOUR — a survey-instrument look for a sculpting tool.
   Palette: deep slate-teal field, brass for the active object,
   contour-blue for everything you can grab but haven't selected.
   ============================================================ */
:root{
  --ink:      #0E1A1F;
  --panel:    #142329;
  --panel-2:  #1B2F37;
  --rule:     #2A464F;
  --text:     #D3E4E2;
  --muted:    #7C989F;
  --brass:    #F0BA4B;   /* selection / active */
  --contour:  #74AECB;   /* inactive handles, secondary data */
  --warn:     #E0705B;
  --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
  --sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{
  background:var(--ink); color:var(--text); font-family:var(--sans);
  display:flex; flex-direction:column; overflow:hidden;
}

/* ---------- masthead ---------- */
header{
  display:flex; align-items:center; gap:14px;
  padding:9px 16px; border-bottom:1px solid var(--rule);
  background:linear-gradient(180deg,#17272E,#122026);
  flex:0 0 auto;
}
.brand{font-family:var(--mono); font-size:12px; letter-spacing:.34em; text-transform:uppercase; white-space:nowrap}
.brand b{color:var(--brass); font-weight:600}
.brand span{color:var(--muted)}
header .spacer{flex:1}
.seg{display:flex; border:1px solid var(--rule); border-radius:5px; overflow:hidden}
.seg button{
  font-family:var(--mono); font-size:10.5px; letter-spacing:.14em; text-transform:uppercase;
  background:transparent; color:var(--muted); border:0; padding:6px 11px; cursor:pointer; white-space:nowrap;
}
.seg button+button{border-left:1px solid var(--rule)}
.seg button:hover{color:var(--text); background:#1E353D}
.seg button[aria-pressed="true"]{background:var(--brass); color:#12201F}
.seg button kbd{font-family:var(--mono); font-size:9px; opacity:.55; margin-left:5px}
.seg button:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible{
  outline:2px solid var(--brass); outline-offset:1px;
}

/* ---------- layout ---------- */
main{flex:1; display:flex; min-height:0}
#panel{
  width:318px; flex:0 0 318px; background:var(--panel);
  border-right:1px solid var(--rule); overflow-y:auto; overscroll-behavior:contain;
}
#panel::-webkit-scrollbar{width:9px}
#panel::-webkit-scrollbar-thumb{background:#27424B; border-radius:9px}
#stage{flex:1; position:relative; min-width:0}
#viewport{position:absolute; inset:0}
#viewport canvas{display:block; touch-action:none}

/* ---------- panel sections ---------- */
section{border-bottom:1px solid var(--rule)}
section>h2{
  margin:0; font-family:var(--mono); font-size:10.5px; letter-spacing:.2em; text-transform:uppercase;
  color:var(--muted); padding:12px 14px 8px; display:flex; align-items:center; gap:9px;
}
section>h2::after{content:""; flex:1; height:1px; background:
  repeating-linear-gradient(90deg,var(--rule) 0 3px, transparent 3px 6px);}
.body{padding:0 14px 15px}

/* ---------- controls ---------- */
.ctrl{margin:9px 0}
.ctrl-head{display:flex; justify-content:space-between; align-items:baseline; margin-bottom:4px}
.ctrl-label{font-size:11.5px; color:var(--text)}
.ctrl-val{font-family:var(--mono); font-size:11px; color:var(--brass)}
input[type=range]{
  -webkit-appearance:none; appearance:none; width:100%; height:16px; background:transparent; margin:0; cursor:ew-resize;
}
input[type=range]::-webkit-slider-runnable-track{height:2px; background:var(--rule)}
input[type=range]::-moz-range-track{height:2px; background:var(--rule)}
input[type=range]::-webkit-slider-thumb{
  -webkit-appearance:none; width:12px; height:12px; margin-top:-5px; border-radius:2px;
  background:var(--contour); border:1px solid #0E1A1F;
}
input[type=range]::-moz-range-thumb{width:12px;height:12px;border-radius:2px;background:var(--contour);border:1px solid #0E1A1F}
input[type=range]:hover::-webkit-slider-thumb{background:var(--brass)}
input[type=range]:hover::-moz-range-thumb{background:var(--brass)}

.row{display:flex; align-items:center; justify-content:space-between; gap:10px; margin:9px 0}
.row label{font-size:11.5px}
select{
  background:var(--panel-2); color:var(--text); border:1px solid var(--rule); border-radius:4px;
  font-family:var(--mono); font-size:11px; padding:4px 6px; min-width:126px;
}
input[type=color]{
  width:38px; height:22px; padding:0; border:1px solid var(--rule); border-radius:4px;
  background:var(--panel-2); cursor:pointer;
}
.check{display:flex; align-items:center; gap:8px; font-size:11.5px; cursor:pointer; margin:9px 0}
.check input{accent-color:var(--brass); width:14px; height:14px; cursor:pointer}

.btn{
  font-family:var(--mono); font-size:10.5px; letter-spacing:.12em; text-transform:uppercase;
  background:var(--panel-2); color:var(--text); border:1px solid var(--rule); border-radius:4px;
  padding:7px 9px; cursor:pointer; flex:1;
}
.btn:hover{border-color:var(--brass); color:var(--brass)}
.btn.danger:hover{border-color:var(--warn); color:var(--warn)}
.btns{display:flex; gap:6px; margin-top:10px; flex-wrap:wrap}

/* a rule that marks where a group of related controls begins */
.grp{
  font-family:var(--mono); font-size:9.5px; letter-spacing:.2em; text-transform:uppercase; color:var(--muted);
  margin:16px 0 2px; display:flex; align-items:center; gap:8px;
}
.grp::after{content:""; flex:1; height:1px; background:var(--rule)}

/* ---------- shape list ---------- */
.add-grid{display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:11px}
.add-grid .btn{display:flex; align-items:center; gap:7px; justify-content:flex-start; padding:8px}
.add-grid svg{flex:0 0 auto}
ul#shapelist{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:4px}
#shapelist li{
  display:flex; align-items:center; gap:9px; padding:6px 8px; border-radius:5px; cursor:pointer;
  border:1px solid transparent; background:var(--panel-2);
}
#shapelist li:hover{border-color:#365A64}
#shapelist li.sel{border-color:var(--brass); background:#22323099}
#shapelist .nm{flex:1; font-size:11.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
#shapelist .meta{font-family:var(--mono); font-size:10px; color:var(--muted)}
#shapelist li.off .nm,#shapelist li.off .meta{opacity:.4}
.icobtn{background:none; border:0; color:var(--muted); cursor:pointer; padding:2px; line-height:0; border-radius:3px}
.icobtn:hover{color:var(--brass)}
.thumb{width:22px; height:22px; flex:0 0 auto}
.empty{font-size:11.5px; color:var(--muted); line-height:1.55; padding:2px 0 4px; margin:0}
.stack-note{font-family:var(--mono); font-size:9.5px; color:var(--muted); letter-spacing:.06em; margin:9px 0 0}

/* ---------- viewport furniture ---------- */
#compass{
  position:absolute; top:14px; right:14px; width:52px; height:52px; pointer-events:none;
  color:var(--contour); opacity:.85;
}
#compass .rose{transform-origin:50% 50%}
#hint{
  position:absolute; left:14px; top:14px; font-family:var(--mono); font-size:10.5px; color:var(--muted);
  background:#0E1A1FCC; border:1px solid var(--rule); border-radius:5px; padding:7px 10px; line-height:1.7;
  pointer-events:none; letter-spacing:.03em;
}
#hint b{color:var(--contour); font-weight:500}
footer{
  flex:0 0 auto; display:flex; gap:22px; align-items:center; padding:6px 16px;
  border-top:1px solid var(--rule); background:#122026;
  font-family:var(--mono); font-size:10.5px; color:var(--muted); letter-spacing:.06em;
}
footer b{color:var(--text); font-weight:500}
footer .spacer{flex:1}

details.note{margin:0}
details.note summary{
  font-family:var(--mono); font-size:10.5px; letter-spacing:.2em; text-transform:uppercase; color:var(--muted);
  padding:12px 14px; cursor:pointer; list-style:none;
}
details.note summary::-webkit-details-marker{display:none}
details.note summary::before{content:"+ "; color:var(--brass)}
details.note[open] summary::before{content:"– "}
details.note p{font-size:11.5px; line-height:1.65; color:var(--muted); margin:0 0 10px}
details.note code{font-family:var(--mono); color:var(--contour); font-size:11px}

@media (max-width:900px){ #panel{width:268px; flex-basis:268px} .brand span{display:none} }
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
</head>
<body>

<header>
  <div class="brand"><b>Contour</b> <span>/ terrain</span></div>
  <div class="seg" id="gizmomode">
    <button data-g="translate" aria-pressed="true">Move<kbd>W</kbd></button>
    <button data-g="rotate" aria-pressed="false">Rotate<kbd>E</kbd></button>
    <button data-g="scale" aria-pressed="false">Scale<kbd>R</kbd></button>
  </div>
  <div class="spacer"></div>
  <div class="seg" id="viewmode">
    <button data-mode="solid" aria-pressed="true">Solid</button>
    <button data-mode="both" aria-pressed="false">Solid + wire</button>
    <button data-mode="wire" aria-pressed="false">Wireframe<kbd>V</kbd></button>
  </div>
  <div class="seg">
    <button id="topview">Top view</button>
    <button id="frameview">Frame<kbd>F</kbd></button>
  </div>
</header>

<main>
  <aside id="panel">

    <section>
      <h2>Shapes</h2>
      <div class="body">
        <div class="add-grid" id="addgrid"></div>
        <ul id="shapelist"></ul>
        <p class="stack-note">Evaluated top to bottom — later shapes win.</p>
      </div>
    </section>

    <section id="inspector-sec">
      <h2>Selected shape</h2>
      <div class="body" id="inspector"></div>
    </section>

    <section>
      <h2>Plane</h2>
      <div class="body" id="planebody"></div>
    </section>

    <section>
      <h2>Surface</h2>
      <div class="body" id="surfacebody"></div>
    </section>

    <details class="note">
      <summary>How it works</summary>
      <div class="body">
        <p>Every vertex of the plane asks each shape one question:
        <code>how far am I from you?</code></p>
        <p>That signed distance is negative inside a filled shape and positive outside. It becomes a
        weight — <code>1</code> at the shape, fading to <code>0</code> across the falloff band, bent by
        the falloff curve. The weight then pulls the vertex toward the shape's
        <b>height</b>: <code>y = mix(y, height, w)</code>.</p>
        <p>Height is the one value you never type: the gizmo's vertical axis is it, and the gizmo floats
        at that elevation with a dashed line down to the shape's footprint. Because height is an
        elevation rather than an amount, a shape reads the same wherever you drop it. Click any white
        or blue dot on a selected shape and the gizmo moves that point instead — anchors carry their
        Bézier handles, and Esc gives the gizmo back to the shape.</p>
        <p>By default every point of a shape sits on one flat plane and the shape has a single
        elevation. Turn on <b>per-point heights</b> and each point keeps its own — the gizmo's green
        axis lifts the selected one, elevations interpolate between neighbours the same way position
        does, and the shape's own height slides the whole profile up or down. Inside a filled polygon
        the height is a mean-value blend of every corner, so lifting two corners of a quad gives a
        genuinely flat tilted plane rather than a tent. A curve at −6 carves a riverbed to −6 whether the ground around it is flat or already
        a hillside. <b>Taper</b> lerps height and falloff from the curve's first anchor to its last, so
        one Bézier gives you a river that descends and widens.</p>
        <p>Circles use <code>length(p) − r</code>. Polygons and curves measure distance to the nearest
        edge segment with an even-odd inside test. Points take the minimum distance to any marker.</p>
      </div>
    </details>
  </aside>

  <div id="stage">
    <div id="viewport"></div>
    <div id="hint">
      <b>green axis</b> sets height · <b>red / blue</b> move on the plane<br>
      <b>click a point</b> to give it the gizmo · <b>esc</b> back to the shape<br>
      per-point heights let each point leave the plane<br>
      <b>drag</b> empty space to orbit · <b>right-drag</b> pan · <b>wheel</b> zoom
    </div>
    <svg id="compass" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" stroke-width="1" opacity=".35"/>
      <g class="rose">
        <path d="M50 10 L56 46 L50 42 L44 46 Z" fill="#F0BA4B"/>
        <path d="M50 90 L44 54 L50 58 L56 54 Z" fill="currentColor" opacity=".6"/>
        <text x="50" y="8" text-anchor="middle" font-size="13" font-family="ui-monospace,monospace" fill="#F0BA4B">N</text>
      </g>
    </svg>
  </div>
</main>

<footer>
  <span>verts <b id="st-verts">—</b></span>
  <span>tris <b id="st-tris">—</b></span>
  <span>shapes <b id="st-shapes">—</b></span>
  <span>height <b id="st-range">—</b></span>
  <span class="spacer"></span>
  <span id="st-msg">ready</span>
</footer>

<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
/* three.js r128 TransformControls, vendored verbatim (minified) because this
   sandbox only serves the core build from CDN. Nothing below was modified. */
!function(){const t=new THREE.Raycaster,e=new THREE.Vector3,n=new THREE.Vector3,o=new THREE.Quaternion,i={X:new THREE.Vector3(1,0,0),Y:new THREE.Vector3(0,1,0),Z:new THREE.Vector3(0,0,1)},s={type:"change"},a={type:"mouseDown"},r={type:"mouseUp",mode:null},l={type:"objectChange"};class h extends THREE.Object3D{constructor(t,e){super(),void 0===e&&(console.warn('THREE.TransformControls: The second parameter "domElement" is now mandatory.'),e=document),this.visible=!1,this.domElement=e;const n=new X;this._gizmo=n,this.add(n);const o=new Q;this._plane=o,this.add(o);const i=this;function a(t,e){let a=e;Object.defineProperty(i,t,{get:function(){return void 0!==a?a:e},set:function(e){a!==e&&(a=e,o[t]=e,n[t]=e,i.dispatchEvent({type:t+"-changed",value:e}),i.dispatchEvent(s))}}),i[t]=e,o[t]=e,n[t]=e}a("camera",t),a("object",void 0),a("enabled",!0),a("axis",null),a("mode","translate"),a("translationSnap",null),a("rotationSnap",null),a("scaleSnap",null),a("space","world"),a("size",1),a("dragging",!1),a("showX",!0),a("showY",!0),a("showZ",!0);const r=new THREE.Vector3,l=new THREE.Vector3,h=new THREE.Quaternion,u=new THREE.Quaternion,w=new THREE.Vector3,y=new THREE.Quaternion,T=new THREE.Vector3,R=new THREE.Vector3,H=new THREE.Vector3,M=new THREE.Vector3;a("worldPosition",r),a("worldPositionStart",l),a("worldQuaternion",h),a("worldQuaternionStart",u),a("cameraPosition",w),a("cameraQuaternion",y),a("pointStart",T),a("pointEnd",R),a("rotationAxis",H),a("rotationAngle",0),a("eye",M),this._offset=new THREE.Vector3,this._startNorm=new THREE.Vector3,this._endNorm=new THREE.Vector3,this._cameraScale=new THREE.Vector3,this._parentPosition=new THREE.Vector3,this._parentQuaternion=new THREE.Quaternion,this._parentQuaternionInv=new THREE.Quaternion,this._parentScale=new THREE.Vector3,this._worldScaleStart=new THREE.Vector3,this._worldQuaternionInv=new THREE.Quaternion,this._worldScale=new THREE.Vector3,this._positionStart=new THREE.Vector3,this._quaternionStart=new THREE.Quaternion,this._scaleStart=new THREE.Vector3,this._getPointer=c.bind(this),this._onPointerDown=p.bind(this),this._onPointerHover=E.bind(this),this._onPointerMove=d.bind(this),this._onPointerUp=m.bind(this),this.domElement.addEventListener("pointerdown",this._onPointerDown),this.domElement.addEventListener("pointermove",this._onPointerHover),this.domElement.ownerDocument.addEventListener("pointerup",this._onPointerUp)}updateMatrixWorld(){void 0!==this.object&&(this.object.updateMatrixWorld(),null===this.object.parent?console.error("TransformControls: The attached 3D object must be a part of the scene graph."):this.object.parent.matrixWorld.decompose(this._parentPosition,this._parentQuaternion,this._parentScale),this.object.matrixWorld.decompose(this.worldPosition,this.worldQuaternion,this._worldScale),this._parentQuaternionInv.copy(this._parentQuaternion).invert(),this._worldQuaternionInv.copy(this.worldQuaternion).invert()),this.camera.updateMatrixWorld(),this.camera.matrixWorld.decompose(this.cameraPosition,this.cameraQuaternion,this._cameraScale),this.eye.copy(this.cameraPosition).sub(this.worldPosition).normalize(),super.updateMatrixWorld(this)}pointerHover(e){if(void 0===this.object||!0===this.dragging)return;t.setFromCamera(e,this.camera);const n=u(this._gizmo.picker[this.mode],t);this.axis=n?n.object.name:null}pointerDown(e){if(void 0!==this.object&&!0!==this.dragging&&0===e.button&&null!==this.axis){t.setFromCamera(e,this.camera);const n=u(this._plane,t,!0);if(n){let t=this.space;if("scale"===this.mode?t="local":"E"!==this.axis&&"XYZE"!==this.axis&&"XYZ"!==this.axis||(t="world"),"local"===t&&"rotate"===this.mode){const t=this.rotationSnap;"X"===this.axis&&t&&(this.object.rotation.x=Math.round(this.object.rotation.x/t)*t),"Y"===this.axis&&t&&(this.object.rotation.y=Math.round(this.object.rotation.y/t)*t),"Z"===this.axis&&t&&(this.object.rotation.z=Math.round(this.object.rotation.z/t)*t)}this.object.updateMatrixWorld(),this.object.parent.updateMatrixWorld(),this._positionStart.copy(this.object.position),this._quaternionStart.copy(this.object.quaternion),this._scaleStart.copy(this.object.scale),this.object.matrixWorld.decompose(this.worldPositionStart,this.worldQuaternionStart,this._worldScaleStart),this.pointStart.copy(n.point).sub(this.worldPositionStart)}this.dragging=!0,a.mode=this.mode,this.dispatchEvent(a)}}pointerMove(a){const r=this.axis,h=this.mode,c=this.object;let E=this.space;if("scale"===h?E="local":"E"!==r&&"XYZE"!==r&&"XYZ"!==r||(E="world"),void 0===c||null===r||!1===this.dragging||-1!==a.button)return;t.setFromCamera(a,this.camera);const p=u(this._plane,t,!0);if(p){if(this.pointEnd.copy(p.point).sub(this.worldPositionStart),"translate"===h)this._offset.copy(this.pointEnd).sub(this.pointStart),"local"===E&&"XYZ"!==r&&this._offset.applyQuaternion(this._worldQuaternionInv),-1===r.indexOf("X")&&(this._offset.x=0),-1===r.indexOf("Y")&&(this._offset.y=0),-1===r.indexOf("Z")&&(this._offset.z=0),"local"===E&&"XYZ"!==r?this._offset.applyQuaternion(this._quaternionStart).divide(this._parentScale):this._offset.applyQuaternion(this._parentQuaternionInv).divide(this._parentScale),c.position.copy(this._offset).add(this._positionStart),this.translationSnap&&("local"===E&&(c.position.applyQuaternion(o.copy(this._quaternionStart).invert()),-1!==r.search("X")&&(c.position.x=Math.round(c.position.x/this.translationSnap)*this.translationSnap),-1!==r.search("Y")&&(c.position.y=Math.round(c.position.y/this.translationSnap)*this.translationSnap),-1!==r.search("Z")&&(c.position.z=Math.round(c.position.z/this.translationSnap)*this.translationSnap),c.position.applyQuaternion(this._quaternionStart)),"world"===E&&(c.parent&&c.position.add(e.setFromMatrixPosition(c.parent.matrixWorld)),-1!==r.search("X")&&(c.position.x=Math.round(c.position.x/this.translationSnap)*this.translationSnap),-1!==r.search("Y")&&(c.position.y=Math.round(c.position.y/this.translationSnap)*this.translationSnap),-1!==r.search("Z")&&(c.position.z=Math.round(c.position.z/this.translationSnap)*this.translationSnap),c.parent&&c.position.sub(e.setFromMatrixPosition(c.parent.matrixWorld))));else if("scale"===h){if(-1!==r.search("XYZ")){let t=this.pointEnd.length()/this.pointStart.length();this.pointEnd.dot(this.pointStart)<0&&(t*=-1),n.set(t,t,t)}else e.copy(this.pointStart),n.copy(this.pointEnd),e.applyQuaternion(this._worldQuaternionInv),n.applyQuaternion(this._worldQuaternionInv),n.divide(e),-1===r.search("X")&&(n.x=1),-1===r.search("Y")&&(n.y=1),-1===r.search("Z")&&(n.z=1);c.scale.copy(this._scaleStart).multiply(n),this.scaleSnap&&(-1!==r.search("X")&&(c.scale.x=Math.round(c.scale.x/this.scaleSnap)*this.scaleSnap||this.scaleSnap),-1!==r.search("Y")&&(c.scale.y=Math.round(c.scale.y/this.scaleSnap)*this.scaleSnap||this.scaleSnap),-1!==r.search("Z")&&(c.scale.z=Math.round(c.scale.z/this.scaleSnap)*this.scaleSnap||this.scaleSnap))}else if("rotate"===h){this._offset.copy(this.pointEnd).sub(this.pointStart);const t=20/this.worldPosition.distanceTo(e.setFromMatrixPosition(this.camera.matrixWorld));"E"===r?(this.rotationAxis.copy(this.eye),this.rotationAngle=this.pointEnd.angleTo(this.pointStart),this._startNorm.copy(this.pointStart).normalize(),this._endNorm.copy(this.pointEnd).normalize(),this.rotationAngle*=this._endNorm.cross(this._startNorm).dot(this.eye)<0?1:-1):"XYZE"===r?(this.rotationAxis.copy(this._offset).cross(this.eye).normalize(),this.rotationAngle=this._offset.dot(e.copy(this.rotationAxis).cross(this.eye))*t):"X"!==r&&"Y"!==r&&"Z"!==r||(this.rotationAxis.copy(i[r]),e.copy(i[r]),"local"===E&&e.applyQuaternion(this.worldQuaternion),this.rotationAngle=this._offset.dot(e.cross(this.eye).normalize())*t),this.rotationSnap&&(this.rotationAngle=Math.round(this.rotationAngle/this.rotationSnap)*this.rotationSnap),"local"===E&&"E"!==r&&"XYZE"!==r?(c.quaternion.copy(this._quaternionStart),c.quaternion.multiply(o.setFromAxisAngle(this.rotationAxis,this.rotationAngle)).normalize()):(this.rotationAxis.applyQuaternion(this._parentQuaternionInv),c.quaternion.copy(o.setFromAxisAngle(this.rotationAxis,this.rotationAngle)),c.quaternion.multiply(this._quaternionStart).normalize())}this.dispatchEvent(s),this.dispatchEvent(l)}}pointerUp(t){0===t.button&&(this.dragging&&null!==this.axis&&(r.mode=this.mode,this.dispatchEvent(r)),this.dragging=!1,this.axis=null)}dispose(){this.domElement.removeEventListener("pointerdown",this._onPointerDown),this.domElement.removeEventListener("pointermove",this._onPointerHover),this.domElement.ownerDocument.removeEventListener("pointermove",this._onPointerMove),this.domElement.ownerDocument.removeEventListener("pointerup",this._onPointerUp),this.traverse(function(t){t.geometry&&t.geometry.dispose(),t.material&&t.material.dispose()})}attach(t){return this.object=t,this.visible=!0,this}detach(){return this.object=void 0,this.visible=!1,this.axis=null,this}getMode(){return this.mode}setMode(t){this.mode=t}setTranslationSnap(t){this.translationSnap=t}setRotationSnap(t){this.rotationSnap=t}setScaleSnap(t){this.scaleSnap=t}setSize(t){this.size=t}setSpace(t){this.space=t}update(){console.warn("THREE.TransformControls: update function has no more functionality and therefore has been deprecated.")}}function c(t){if(this.domElement.ownerDocument.pointerLockElement)return{x:0,y:0,button:t.button};{const e=t.changedTouches?t.changedTouches[0]:t,n=this.domElement.getBoundingClientRect();return{x:(e.clientX-n.left)/n.width*2-1,y:-(e.clientY-n.top)/n.height*2+1,button:t.button}}}function E(t){if(this.enabled)switch(t.pointerType){case"mouse":case"pen":this.pointerHover(this._getPointer(t))}}function p(t){this.enabled&&(this.domElement.style.touchAction="none",this.domElement.ownerDocument.addEventListener("pointermove",this._onPointerMove),this.pointerHover(this._getPointer(t)),this.pointerDown(this._getPointer(t)))}function d(t){this.enabled&&this.pointerMove(this._getPointer(t))}function m(t){this.enabled&&(this.domElement.style.touchAction="",this.domElement.ownerDocument.removeEventListener("pointermove",this._onPointerMove),this.pointerUp(this._getPointer(t)))}function u(t,e,n){const o=e.intersectObject(t,!0);for(let t=0;t<o.length;t++)if(o[t].object.visible||n)return o[t];return!1}h.prototype.isTransformControls=!0;const w=new THREE.Euler,y=new THREE.Vector3(0,1,0),T=new THREE.Vector3(0,0,0),R=new THREE.Matrix4,H=new THREE.Quaternion,M=new THREE.Quaternion,b=new THREE.Vector3,v=new THREE.Matrix4,f=new THREE.Vector3(1,0,0),P=new THREE.Vector3(0,1,0),g=new THREE.Vector3(0,0,1),x=new THREE.Vector3,S=new THREE.Vector3,_=new THREE.Vector3;class X extends THREE.Object3D{constructor(){super(),this.type="TransformControlsGizmo";const t=new THREE.MeshBasicMaterial({depthTest:!1,depthWrite:!1,transparent:!0,side:THREE.DoubleSide,fog:!1,toneMapped:!1}),e=new THREE.LineBasicMaterial({depthTest:!1,depthWrite:!1,transparent:!0,linewidth:1,fog:!1,toneMapped:!1}),n=t.clone();n.opacity=.15;const o=t.clone();o.opacity=.33;const i=t.clone();i.color.set(16711680);const s=t.clone();s.color.set(65280);const a=t.clone();a.color.set(255);const r=t.clone();r.opacity=.25;const l=r.clone();l.color.set(16776960);const h=r.clone();h.color.set(65535);const c=r.clone();c.color.set(16711935);t.clone().color.set(16776960);const E=e.clone();E.color.set(16711680);const p=e.clone();p.color.set(65280);const d=e.clone();d.color.set(255);const m=e.clone();m.color.set(65535);const u=e.clone();u.color.set(16711935);const w=e.clone();w.color.set(16776960);const y=e.clone();y.color.set(7895160);const T=w.clone();T.opacity=.25;const R=new THREE.CylinderGeometry(0,.05,.2,12,1,!1),H=new THREE.BoxGeometry(.125,.125,.125),M=new THREE.BufferGeometry;function b(t,e){const n=new THREE.BufferGeometry,o=[];for(let n=0;n<=64*e;++n)o.push(0,Math.cos(n/32*Math.PI)*t,Math.sin(n/32*Math.PI)*t);return n.setAttribute("position",new THREE.Float32BufferAttribute(o,3)),n}M.setAttribute("position",new THREE.Float32BufferAttribute([0,0,0,1,0,0],3));const v={X:[[new THREE.Mesh(R,i),[1,0,0],[0,0,-Math.PI/2],null,"fwd"],[new THREE.Mesh(R,i),[1,0,0],[0,0,Math.PI/2],null,"bwd"],[new THREE.Line(M,E)]],Y:[[new THREE.Mesh(R,s),[0,1,0],null,null,"fwd"],[new THREE.Mesh(R,s),[0,1,0],[Math.PI,0,0],null,"bwd"],[new THREE.Line(M,p),null,[0,0,Math.PI/2]]],Z:[[new THREE.Mesh(R,a),[0,0,1],[Math.PI/2,0,0],null,"fwd"],[new THREE.Mesh(R,a),[0,0,1],[-Math.PI/2,0,0],null,"bwd"],[new THREE.Line(M,d),null,[0,-Math.PI/2,0]]],XYZ:[[new THREE.Mesh(new THREE.OctahedronGeometry(.1,0),r.clone()),[0,0,0],[0,0,0]]],XY:[[new THREE.Mesh(new THREE.PlaneGeometry(.295,.295),l.clone()),[.15,.15,0]],[new THREE.Line(M,w),[.18,.3,0],null,[.125,1,1]],[new THREE.Line(M,w),[.3,.18,0],[0,0,Math.PI/2],[.125,1,1]]],YZ:[[new THREE.Mesh(new THREE.PlaneGeometry(.295,.295),h.clone()),[0,.15,.15],[0,Math.PI/2,0]],[new THREE.Line(M,m),[0,.18,.3],[0,0,Math.PI/2],[.125,1,1]],[new THREE.Line(M,m),[0,.3,.18],[0,-Math.PI/2,0],[.125,1,1]]],XZ:[[new THREE.Mesh(new THREE.PlaneGeometry(.295,.295),c.clone()),[.15,0,.15],[-Math.PI/2,0,0]],[new THREE.Line(M,u),[.18,0,.3],null,[.125,1,1]],[new THREE.Line(M,u),[.3,0,.18],[0,-Math.PI/2,0],[.125,1,1]]]},f={X:[[new THREE.Mesh(new THREE.CylinderGeometry(.2,0,1,4,1,!1),n),[.6,0,0],[0,0,-Math.PI/2]]],Y:[[new THREE.Mesh(new THREE.CylinderGeometry(.2,0,1,4,1,!1),n),[0,.6,0]]],Z:[[new THREE.Mesh(new THREE.CylinderGeometry(.2,0,1,4,1,!1),n),[0,0,.6],[Math.PI/2,0,0]]],XYZ:[[new THREE.Mesh(new THREE.OctahedronGeometry(.2,0),n)]],XY:[[new THREE.Mesh(new THREE.PlaneGeometry(.4,.4),n),[.2,.2,0]]],YZ:[[new THREE.Mesh(new THREE.PlaneGeometry(.4,.4),n),[0,.2,.2],[0,Math.PI/2,0]]],XZ:[[new THREE.Mesh(new THREE.PlaneGeometry(.4,.4),n),[.2,0,.2],[-Math.PI/2,0,0]]]},P={START:[[new THREE.Mesh(new THREE.OctahedronGeometry(.01,2),o),null,null,null,"helper"]],END:[[new THREE.Mesh(new THREE.OctahedronGeometry(.01,2),o),null,null,null,"helper"]],DELTA:[[new THREE.Line(function(){const t=new THREE.BufferGeometry;return t.setAttribute("position",new THREE.Float32BufferAttribute([0,0,0,1,1,1],3)),t}(),o),null,null,null,"helper"]],X:[[new THREE.Line(M,o.clone()),[-1e3,0,0],null,[1e6,1,1],"helper"]],Y:[[new THREE.Line(M,o.clone()),[0,-1e3,0],[0,0,Math.PI/2],[1e6,1,1],"helper"]],Z:[[new THREE.Line(M,o.clone()),[0,0,-1e3],[0,-Math.PI/2,0],[1e6,1,1],"helper"]]},g={X:[[new THREE.Line(b(1,.5),E)],[new THREE.Mesh(new THREE.OctahedronGeometry(.04,0),i),[0,0,.99],null,[1,3,1]]],Y:[[new THREE.Line(b(1,.5),p),null,[0,0,-Math.PI/2]],[new THREE.Mesh(new THREE.OctahedronGeometry(.04,0),s),[0,0,.99],null,[3,1,1]]],Z:[[new THREE.Line(b(1,.5),d),null,[0,Math.PI/2,0]],[new THREE.Mesh(new THREE.OctahedronGeometry(.04,0),a),[.99,0,0],null,[1,3,1]]],E:[[new THREE.Line(b(1.25,1),T),null,[0,Math.PI/2,0]],[new THREE.Mesh(new THREE.CylinderGeometry(.03,0,.15,4,1,!1),T),[1.17,0,0],[0,0,-Math.PI/2],[1,1,.001]],[new THREE.Mesh(new THREE.CylinderGeometry(.03,0,.15,4,1,!1),T),[-1.17,0,0],[0,0,Math.PI/2],[1,1,.001]],[new THREE.Mesh(new THREE.CylinderGeometry(.03,0,.15,4,1,!1),T),[0,-1.17,0],[Math.PI,0,0],[1,1,.001]],[new THREE.Mesh(new THREE.CylinderGeometry(.03,0,.15,4,1,!1),T),[0,1.17,0],[0,0,0],[1,1,.001]]],XYZE:[[new THREE.Line(b(1,1),y),null,[0,Math.PI/2,0]]]},x={AXIS:[[new THREE.Line(M,o.clone()),[-1e3,0,0],null,[1e6,1,1],"helper"]]},S={X:[[new THREE.Mesh(new THREE.TorusGeometry(1,.1,4,24),n),[0,0,0],[0,-Math.PI/2,-Math.PI/2]]],Y:[[new THREE.Mesh(new THREE.TorusGeometry(1,.1,4,24),n),[0,0,0],[Math.PI/2,0,0]]],Z:[[new THREE.Mesh(new THREE.TorusGeometry(1,.1,4,24),n),[0,0,0],[0,0,-Math.PI/2]]],E:[[new THREE.Mesh(new THREE.TorusGeometry(1.25,.1,2,24),n)]],XYZE:[[new THREE.Mesh(new THREE.SphereGeometry(.7,10,8),n)]]},_={X:[[new THREE.Mesh(H,i),[.8,0,0],[0,0,-Math.PI/2]],[new THREE.Line(M,E),null,null,[.8,1,1]]],Y:[[new THREE.Mesh(H,s),[0,.8,0]],[new THREE.Line(M,p),null,[0,0,Math.PI/2],[.8,1,1]]],Z:[[new THREE.Mesh(H,a),[0,0,.8],[Math.PI/2,0,0]],[new THREE.Line(M,d),null,[0,-Math.PI/2,0],[.8,1,1]]],XY:[[new THREE.Mesh(H,l),[.85,.85,0],null,[2,2,.2]],[new THREE.Line(M,w),[.855,.98,0],null,[.125,1,1]],[new THREE.Line(M,w),[.98,.855,0],[0,0,Math.PI/2],[.125,1,1]]],YZ:[[new THREE.Mesh(H,h),[0,.85,.85],null,[.2,2,2]],[new THREE.Line(M,m),[0,.855,.98],[0,0,Math.PI/2],[.125,1,1]],[new THREE.Line(M,m),[0,.98,.855],[0,-Math.PI/2,0],[.125,1,1]]],XZ:[[new THREE.Mesh(H,c),[.85,0,.85],null,[2,.2,2]],[new THREE.Line(M,u),[.855,0,.98],null,[.125,1,1]],[new THREE.Line(M,u),[.98,0,.855],[0,-Math.PI/2,0],[.125,1,1]]],XYZX:[[new THREE.Mesh(new THREE.BoxGeometry(.125,.125,.125),r.clone()),[1.1,0,0]]],XYZY:[[new THREE.Mesh(new THREE.BoxGeometry(.125,.125,.125),r.clone()),[0,1.1,0]]],XYZZ:[[new THREE.Mesh(new THREE.BoxGeometry(.125,.125,.125),r.clone()),[0,0,1.1]]]},X={X:[[new THREE.Mesh(new THREE.CylinderGeometry(.2,0,.8,4,1,!1),n),[.5,0,0],[0,0,-Math.PI/2]]],Y:[[new THREE.Mesh(new THREE.CylinderGeometry(.2,0,.8,4,1,!1),n),[0,.5,0]]],Z:[[new THREE.Mesh(new THREE.CylinderGeometry(.2,0,.8,4,1,!1),n),[0,0,.5],[Math.PI/2,0,0]]],XY:[[new THREE.Mesh(H,n),[.85,.85,0],null,[3,3,.2]]],YZ:[[new THREE.Mesh(H,n),[0,.85,.85],null,[.2,3,3]]],XZ:[[new THREE.Mesh(H,n),[.85,0,.85],null,[3,.2,3]]],XYZX:[[new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.2),n),[1.1,0,0]]],XYZY:[[new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.2),n),[0,1.1,0]]],XYZZ:[[new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.2),n),[0,0,1.1]]]},Q={X:[[new THREE.Line(M,o.clone()),[-1e3,0,0],null,[1e6,1,1],"helper"]],Y:[[new THREE.Line(M,o.clone()),[0,-1e3,0],[0,0,Math.PI/2],[1e6,1,1],"helper"]],Z:[[new THREE.Line(M,o.clone()),[0,0,-1e3],[0,-Math.PI/2,0],[1e6,1,1],"helper"]]};function Y(t){const e=new THREE.Object3D;for(const n in t)for(let o=t[n].length;o--;){const i=t[n][o][0].clone(),s=t[n][o][1],a=t[n][o][2],r=t[n][o][3],l=t[n][o][4];i.name=n,i.tag=l,s&&i.position.set(s[0],s[1],s[2]),a&&i.rotation.set(a[0],a[1],a[2]),r&&i.scale.set(r[0],r[1],r[2]),i.updateMatrix();const h=i.geometry.clone();h.applyMatrix4(i.matrix),i.geometry=h,i.renderOrder=1/0,i.position.set(0,0,0),i.rotation.set(0,0,0),i.scale.set(1,1,1),e.add(i)}return e}this.gizmo={},this.picker={},this.helper={},this.add(this.gizmo.translate=Y(v)),this.add(this.gizmo.rotate=Y(g)),this.add(this.gizmo.scale=Y(_)),this.add(this.picker.translate=Y(f)),this.add(this.picker.rotate=Y(S)),this.add(this.picker.scale=Y(X)),this.add(this.helper.translate=Y(P)),this.add(this.helper.rotate=Y(x)),this.add(this.helper.scale=Y(Q)),this.picker.translate.visible=!1,this.picker.rotate.visible=!1,this.picker.scale.visible=!1}updateMatrixWorld(t){const n="local"===("scale"===this.mode?this.space:"local")?this.worldQuaternion:M;this.gizmo.translate.visible="translate"===this.mode,this.gizmo.rotate.visible="rotate"===this.mode,this.gizmo.scale.visible="scale"===this.mode,this.helper.translate.visible="translate"===this.mode,this.helper.rotate.visible="rotate"===this.mode,this.helper.scale.visible="scale"===this.mode;let i=[];i=i.concat(this.picker[this.mode].children),i=i.concat(this.gizmo[this.mode].children),i=i.concat(this.helper[this.mode].children);for(let t=0;t<i.length;t++){const s=i[t];let a;if(s.visible=!0,s.rotation.set(0,0,0),s.position.copy(this.worldPosition),a=this.camera.isOrthographicCamera?(this.camera.top-this.camera.bottom)/this.camera.zoom:this.worldPosition.distanceTo(this.cameraPosition)*Math.min(1.9*Math.tan(Math.PI*this.camera.fov/360)/this.camera.zoom,7),s.scale.set(1,1,1).multiplyScalar(a*this.size/7),"helper"!==s.tag){if(s.quaternion.copy(n),"translate"===this.mode||"scale"===this.mode){const t=.99,e=.2,o=0;"X"!==s.name&&"XYZX"!==s.name||Math.abs(y.copy(f).applyQuaternion(n).dot(this.eye))>t&&(s.scale.set(1e-10,1e-10,1e-10),s.visible=!1),"Y"!==s.name&&"XYZY"!==s.name||Math.abs(y.copy(P).applyQuaternion(n).dot(this.eye))>t&&(s.scale.set(1e-10,1e-10,1e-10),s.visible=!1),"Z"!==s.name&&"XYZZ"!==s.name||Math.abs(y.copy(g).applyQuaternion(n).dot(this.eye))>t&&(s.scale.set(1e-10,1e-10,1e-10),s.visible=!1),"XY"===s.name&&Math.abs(y.copy(g).applyQuaternion(n).dot(this.eye))<e&&(s.scale.set(1e-10,1e-10,1e-10),s.visible=!1),"YZ"===s.name&&Math.abs(y.copy(f).applyQuaternion(n).dot(this.eye))<e&&(s.scale.set(1e-10,1e-10,1e-10),s.visible=!1),"XZ"===s.name&&Math.abs(y.copy(P).applyQuaternion(n).dot(this.eye))<e&&(s.scale.set(1e-10,1e-10,1e-10),s.visible=!1),-1!==s.name.search("X")&&(y.copy(f).applyQuaternion(n).dot(this.eye)<o?"fwd"===s.tag?s.visible=!1:s.scale.x*=-1:"bwd"===s.tag&&(s.visible=!1)),-1!==s.name.search("Y")&&(y.copy(P).applyQuaternion(n).dot(this.eye)<o?"fwd"===s.tag?s.visible=!1:s.scale.y*=-1:"bwd"===s.tag&&(s.visible=!1)),-1!==s.name.search("Z")&&(y.copy(g).applyQuaternion(n).dot(this.eye)<o?"fwd"===s.tag?s.visible=!1:s.scale.z*=-1:"bwd"===s.tag&&(s.visible=!1))}else"rotate"===this.mode&&(H.copy(n),y.copy(this.eye).applyQuaternion(o.copy(n).invert()),-1!==s.name.search("E")&&s.quaternion.setFromRotationMatrix(R.lookAt(this.eye,T,P)),"X"===s.name&&(o.setFromAxisAngle(f,Math.atan2(-y.y,y.z)),o.multiplyQuaternions(H,o),s.quaternion.copy(o)),"Y"===s.name&&(o.setFromAxisAngle(P,Math.atan2(y.x,y.z)),o.multiplyQuaternions(H,o),s.quaternion.copy(o)),"Z"===s.name&&(o.setFromAxisAngle(g,Math.atan2(y.y,y.x)),o.multiplyQuaternions(H,o),s.quaternion.copy(o)));s.visible=s.visible&&(-1===s.name.indexOf("X")||this.showX),s.visible=s.visible&&(-1===s.name.indexOf("Y")||this.showY),s.visible=s.visible&&(-1===s.name.indexOf("Z")||this.showZ),s.visible=s.visible&&(-1===s.name.indexOf("E")||this.showX&&this.showY&&this.showZ),s.material._opacity=s.material._opacity||s.material.opacity,s.material._color=s.material._color||s.material.color.clone(),s.material.color.copy(s.material._color),s.material.opacity=s.material._opacity,this.enabled?this.axis&&(s.name===this.axis||this.axis.split("").some(function(t){return s.name===t})?(s.material.opacity=1,s.material.color.lerp(new THREE.Color(1,1,1),.5)):(s.material.opacity*=.25,s.material.color.lerp(new THREE.Color(1,1,1),.5))):(s.material.opacity*=.5,s.material.color.lerp(new THREE.Color(1,1,1),.5))}else s.visible=!1,"AXIS"===s.name?(s.position.copy(this.worldPositionStart),s.visible=!!this.axis,"X"===this.axis&&(o.setFromEuler(w.set(0,0,0)),s.quaternion.copy(n).multiply(o),Math.abs(y.copy(f).applyQuaternion(n).dot(this.eye))>.9&&(s.visible=!1)),"Y"===this.axis&&(o.setFromEuler(w.set(0,0,Math.PI/2)),s.quaternion.copy(n).multiply(o),Math.abs(y.copy(P).applyQuaternion(n).dot(this.eye))>.9&&(s.visible=!1)),"Z"===this.axis&&(o.setFromEuler(w.set(0,Math.PI/2,0)),s.quaternion.copy(n).multiply(o),Math.abs(y.copy(g).applyQuaternion(n).dot(this.eye))>.9&&(s.visible=!1)),"XYZE"===this.axis&&(o.setFromEuler(w.set(0,Math.PI/2,0)),y.copy(this.rotationAxis),s.quaternion.setFromRotationMatrix(R.lookAt(T,y,P)),s.quaternion.multiply(o),s.visible=this.dragging),"E"===this.axis&&(s.visible=!1)):"START"===s.name?(s.position.copy(this.worldPositionStart),s.visible=this.dragging):"END"===s.name?(s.position.copy(this.worldPosition),s.visible=this.dragging):"DELTA"===s.name?(s.position.copy(this.worldPositionStart),s.quaternion.copy(this.worldQuaternionStart),e.set(1e-10,1e-10,1e-10).add(this.worldPositionStart).sub(this.worldPosition).multiplyScalar(-1),e.applyQuaternion(this.worldQuaternionStart.clone().invert()),s.scale.copy(e),s.visible=this.dragging):(s.quaternion.copy(n),this.dragging?s.position.copy(this.worldPositionStart):s.position.copy(this.worldPosition),this.axis&&(s.visible=-1!==this.axis.search(s.name)))}super.updateMatrixWorld(t)}}X.prototype.isTransformControlsGizmo=!0;class Q extends THREE.Mesh{constructor(){super(new THREE.PlaneGeometry(1e5,1e5,2,2),new THREE.MeshBasicMaterial({visible:!1,wireframe:!0,side:THREE.DoubleSide,transparent:!0,opacity:.1,toneMapped:!1})),this.type="TransformControlsPlane"}updateMatrixWorld(t){let n=this.space;switch(this.position.copy(this.worldPosition),"scale"===this.mode&&(n="local"),x.copy(f).applyQuaternion("local"===n?this.worldQuaternion:M),S.copy(P).applyQuaternion("local"===n?this.worldQuaternion:M),_.copy(g).applyQuaternion("local"===n?this.worldQuaternion:M),y.copy(S),this.mode){case"translate":case"scale":switch(this.axis){case"X":y.copy(this.eye).cross(x),b.copy(x).cross(y);break;case"Y":y.copy(this.eye).cross(S),b.copy(S).cross(y);break;case"Z":y.copy(this.eye).cross(_),b.copy(_).cross(y);break;case"XY":b.copy(_);break;case"YZ":b.copy(x);break;case"XZ":y.copy(_),b.copy(S);break;case"XYZ":case"E":b.set(0,0,0)}break;default:b.set(0,0,0)}0===b.length()?this.quaternion.copy(this.cameraQuaternion):(v.lookAt(e.set(0,0,0),b,y),this.quaternion.setFromRotationMatrix(v)),super.updateMatrixWorld(t)}}Q.prototype.isTransformControlsPlane=!0,THREE.TransformControls=h,THREE.TransformControlsGizmo=X,THREE.TransformControlsPlane=Q}();
</script>
<script>
/* ============================================================================
   CONTOUR — a learning example: shape-driven terrain deformation in three.js
   ----------------------------------------------------------------------------
   deform() is the whole idea in about forty lines. Everything else is
   plumbing: camera, picking, gizmo wiring, UI.
   ============================================================================ */

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
let uid = 0;

/* ---------------------------------------------------------------- 1. State */

const state = {
  plane:   { width: 220, depth: 220, segX: 150, segY: 150, heightScale: 1 },
  surface: { base:'#7C9A5E', low:'#2E4A3C', high:'#E4DCC0', gradient:true,
             mode:'solid', wireColor:'#8FD0E8', sun: 0.9, flat:false },
  gizmo:   { mode:'translate', snap:false },
  shapes:  [],
  selectedId: null,
  selectedPoint: null,      // index into the selected shape's points, or null for the whole shape
};

/* A shape is plain data. `points` live in the shape's own 2D space
   (x → world X, y → world Z) before scale and rotation are applied. */
function makeShape(type){
  const s = {
    id: ++uid, type, name: type[0].toUpperCase()+type.slice(1)+' '+uid,
    enabled: true,
    x: 0, z: 0, rot: 0, sx: 1, sz: 1,      // placement — scale is per-axis
    height: 14, falloff: 18,               // the elevation this shape wants, and its fade
    heightEnd: 0, falloffEnd: 18, taper:false,   // curve-only: lerp from first to last anchor
    perPoint: false,                       // off: one flat elevation. on: every point carries its own
    curve: 'smooth', power: 1, blend: 'set',
    filled: true, closed: true, smooth: true,   // smooth = a Bézier control mirrors its partner
    radius: 22,                            // circle only
    dotRadius: 4,                          // points only
    points: [],
  };
  if (type === 'polygon'){
    const n = 5, r = 26;
    for (let i=0;i<n;i++) s.points.push({ x: Math.cos(i/n*TAU-Math.PI/2)*r, y: Math.sin(i/n*TAU-Math.PI/2)*r });
  } else if (type === 'points'){
    s.points = [{x:-16,y:-10},{x:6,y:-18},{x:14,y:12},{x:-10,y:14}];
    s.height = 8; s.falloff = 10; s.blend = 'max';
  } else if (type === 'bezier'){
    s.points = [{x:-42,y:16},{x:-18,y:-36},{x:16,y:36},{x:42,y:-14}];
    s.closed = false; s.filled = false; s.falloff = 12; s.falloffEnd = 20;
    s.height = 10; s.heightEnd = -4;
  }
  return s;
}
const selected = () => state.shapes.find(s => s.id === state.selectedId) || null;
const isCurve  = s => s.type === 'bezier';

/* --------------------------------------------------- 2. Shape → outline 2D */

/* The elevation channel rides through the same Bernstein weights as x and y,
   so a control point's height shapes the height profile exactly as it shapes
   the curve. e is only read when the shape is in per-point mode. */
const cubicAt = (p0,p1,p2,p3,t) => {
  const u = 1-t, a = u*u*u, b = 3*u*u*t, c = 3*u*t*t, d = t*t*t;
  return {
    x: a*p0.x + b*p1.x + c*p2.x + d*p3.x,
    y: a*p0.y + b*p1.y + c*p2.y + d*p3.y,
    e: a*(p0.e||0) + b*(p1.e||0) + c*(p2.e||0) + d*(p3.e||0),
  };
};
/* Cubic Bézier chain: anchor, control, control, anchor, control, control, anchor… */
function bezierOutline(pts, samples = 16){
  const out = [], segs = Math.max(0, Math.floor((pts.length-1)/3));
  if (segs === 0) return pts.slice();
  for (let s=0; s<segs; s++){
    const [p0,p1,p2,p3] = [pts[s*3], pts[s*3+1], pts[s*3+2], pts[s*3+3]];
    for (let i=0;i<samples;i++) out.push(cubicAt(p0,p1,p2,p3,i/samples));
  }
  out.push(pts[segs*3]);
  return out;
}
function circleOutline(r, n = 72){
  const out = [];
  for (let i=0;i<n;i++) out.push({ x: Math.cos(i/n*TAU)*r, y: Math.sin(i/n*TAU)*r, e:0 });
  return out;
}
function outlineLocal(s){
  if (s.type === 'circle') return circleOutline(s.radius);
  if (s.type === 'bezier') return bezierOutline(s.points);
  return s.points.map(p => ({ x:p.x, y:p.y, e:p.e||0 }));
}

/* ------------------------------------------------ 3. Placement + distances */

/* Scale happens in shape space, then rotation, then translation. */
function localToWorld(s, p){
  const c = Math.cos(s.rot), n = Math.sin(s.rot);
  const x = p.x * s.sx, y = p.y * s.sz;
  return { x: s.x + x*c - y*n, z: s.z + x*n + y*c };
}
function worldToLocal(s, wx, wz){
  const dx = wx - s.x, dz = wz - s.z;
  const c = Math.cos(-s.rot), n = Math.sin(-s.rot);
  return { x: (dx*c - dz*n) / s.sx, y: (dx*n + dz*c) / s.sz };
}

/* Cached per-shape data in world space, rebuilt whenever the shape changes.
   Keeping this out of the per-vertex loop is what keeps dragging live. */
function cacheShape(s){
  const local = outlineLocal(s);
  const pts = local.map(p => localToWorld(s, p));
  const closed = s.type === 'bezier' ? s.closed : true;
  const c = {
    pts, closed,
    hts: local.map(p => p.e || 0),          // elevation per outline sample
    a: s.radius * Math.abs(s.sx),               // circle semi-axes after scaling
    b: s.radius * Math.abs(s.sz),
    dotR: s.dotRadius * (Math.abs(s.sx) + Math.abs(s.sz)) * 0.5,
  };

  // arc length along the outline — drives taper and the falloff band
  const last = closed ? pts.length : pts.length - 1;
  const cum = [0];
  for (let i=0;i<last;i++){
    const a = pts[i], b = pts[(i+1)%pts.length];
    cum.push(cum[i] + Math.hypot(b.x-a.x, b.z-a.z));
  }
  c.cum = cum; c.total = cum[cum.length-1] || 1;

  let a=Infinity,b=-Infinity,d=Infinity,e=-Infinity;
  for (const p of pts){ a=Math.min(a,p.x); b=Math.max(b,p.x); d=Math.min(d,p.z); e=Math.max(e,p.z); }
  if (s.type === 'points'){ a-=c.dotR; b+=c.dotR; d-=c.dotR; e+=c.dotR; }
  const pad = Math.max(s.falloff, s.taper ? s.falloffEnd : 0, 0) + 1e-3;
  c.minX=a-pad; c.maxX=b+pad; c.minZ=d-pad; c.maxZ=e+pad;
  s._c = c;
}
const cacheAll = () => state.shapes.forEach(cacheShape);

/* Nearest point on a polyline. Also reports WHERE along it (0..1 by arc
   length) — that parameter is what taper lerps against. */
let _polyT = 0, _polyI = 0, _polyU = 0;
function distToPolyline(pts, cum, total, closed, x, z){
  let best = Infinity, bi = 0, bu = 0;
  const n = pts.length, last = closed ? n : n-1;
  for (let i=0;i<last;i++){
    const a = pts[i], b = pts[(i+1)%n];
    const vx = b.x-a.x, vz = b.z-a.z;
    const len2 = vx*vx + vz*vz;
    let t = len2 > 0 ? ((x-a.x)*vx + (z-a.z)*vz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - (a.x + vx*t), dz = z - (a.z + vz*t);
    const d2 = dx*dx + dz*dz;
    if (d2 < best){ best = d2; bi = i; bu = t; }
  }
  _polyT = (cum[bi] + bu*(cum[bi+1]-cum[bi])) / total;
  _polyI = bi; _polyU = bu;
  return Math.sqrt(best);
}
function inPolygon(pts, x, z){
  let inside = false;
  for (let i=0, j=pts.length-1; i<pts.length; j=i++){
    const a = pts[i], b = pts[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x-a.x)*(z-a.z)/(b.z-a.z) + a.x) inside = !inside;
  }
  return inside;
}

/* SIGNED distance: negative inside a filled shape, positive outside.
   One number is all the deformer needs from any shape type. */
function signedDistance(s, x, z){
  const c = s._c;
  _polyT = 0; _polyI = 0; _polyU = 0;
  if (s.type === 'circle'){
    // Rotate into the ellipse's own frame (rotation preserves distance).
    const dx = x - s.x, dz = z - s.z;
    const co = Math.cos(-s.rot), si = Math.sin(-s.rot);
    const X = dx*co - dz*si, Z = dx*si + dz*co;
    const a = c.a, b = c.b;
    let d;
    if (Math.abs(a-b) < 1e-6) d = Math.hypot(X, Z) - a;
    else {
      const f0 = (X*X)/(a*a) + (Z*Z)/(b*b) - 1;      // <0 inside, >0 outside — sign is exact
      if (Math.abs(X) < 1e-6 && Math.abs(Z) < 1e-6) d = -Math.min(a,b);
      else {
        // Walk the point onto the ellipse with a few Newton steps along ∇f,
        // then measure. Converges in 2–3 iterations; far cheaper than a polyline scan.
        let px = X, pz = Z;
        for (let k=0; k<3; k++){
          const f = (px*px)/(a*a) + (pz*pz)/(b*b) - 1;
          const gx = 2*px/(a*a), gz = 2*pz/(b*b);
          const gl = gx*gx + gz*gz;
          if (gl < 1e-12) break;
          px -= f/gl*gx; pz -= f/gl*gz;
        }
        d = Math.hypot(X-px, Z-pz) * (f0 < 0 ? -1 : 1);
      }
    }
    return s.filled ? d : Math.abs(d);
  }
  if (s.type === 'points'){
    let best = Infinity;
    for (let i=0;i<c.pts.length;i++){
      const p = c.pts[i];
      const d = (x-p.x)*(x-p.x) + (z-p.z)*(z-p.z);
      if (d < best){ best = d; _polyI = i; }
    }
    const d = Math.sqrt(best) - c.dotR;
    return s.filled ? d : Math.abs(d);
  }
  const d = distToPolyline(c.pts, c.cum, c.total, c.closed, x, z);
  if (s.filled && c.closed && c.pts.length > 2 && inPolygon(c.pts, x, z)) return -d;
  return d;
}

/* Mean value coordinates: a smooth weight per outline vertex for a point inside
   a closed shape. They reproduce a linear field exactly — four corners of a
   quad at two heights give a genuinely flat tilted plane, not a tent — and on
   the boundary they collapse to plain edge interpolation, so the interior joins
   the falloff band with no seam. The half-angle tangents come out of dot and
   cross products, so there is no trigonometry in the loop. */
let _mvcT = [], _mvcR = [];
function mvcHeight(pts, hts, x, z){
  const n = pts.length;
  if (_mvcT.length < n){ _mvcT = new Float64Array(n); _mvcR = new Float64Array(n); }
  for (let i=0;i<n;i++){
    const dx = pts[i].x - x, dz = pts[i].z - z;
    const r = Math.sqrt(dx*dx + dz*dz);
    if (r < 1e-6) return hts[i] || 0;               // sitting on a vertex
    _mvcR[i] = r;
  }
  for (let i=0;i<n;i++){
    const j = (i+1) % n;
    const ax = pts[i].x-x, az = pts[i].z-z, bx = pts[j].x-x, bz = pts[j].z-z;
    const cross = ax*bz - az*bx, dot = ax*bx + az*bz;
    if (Math.abs(cross) < 1e-9){
      if (dot < 0){                                  // exactly on this edge
        const t = _mvcR[i] / (_mvcR[i] + _mvcR[j]);
        return (hts[i]||0) + ((hts[j]||0) - (hts[i]||0)) * t;
      }
      _mvcT[i] = 0;
    } else {
      _mvcT[i] = (_mvcR[i]*_mvcR[j] - dot) / cross;  // tan(half the subtended angle)
    }
  }
  let ws = 0, hs = 0;
  for (let i=0;i<n;i++){
    const w = (_mvcT[(i-1+n)%n] + _mvcT[i]) / _mvcR[i];
    ws += w; hs += w * (hts[i] || 0);
  }
  return ws !== 0 ? hs/ws : (hts[0] || 0);
}

/* Elevation at the point the distance query just landed on. Inside a filled
   shape that's a blend of every vertex; on or outside the outline it's a lerp
   between the two samples either side of the hit; for scattered points it's
   simply the nearest marker's own elevation. */
function heightAtHit(s, x, z, d){
  const c = s._c, h = c.hts;
  if (s.type === 'points') return h[_polyI] || 0;
  if (d < 0 && s.filled && c.closed && c.pts.length > 2) return mvcHeight(c.pts, h, x, z);
  const n = h.length;
  const a = h[_polyI] || 0, b = h[(_polyI+1) % n] || 0;
  return a + (b-a)*_polyU;
}

/* Falloff curves: map t ∈ [0,1] (1 = full effect) to a weight. */
const CURVES = {
  linear:   t => t,
  smooth:   t => t*t*(3-2*t),
  gauss:    t => Math.exp(-5*(1-t)*(1-t)),
  dome:     t => Math.sqrt(1 - (1-t)*(1-t)),
  spike:    t => t*t*t,
  terrace:  t => Math.round(t*4)/4,
  constant: t => t > 0 ? 1 : 0,
};

/* ------------------------------------------------------------ 4. Three.js */

const viewportEl = document.getElementById('viewport');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0E1A1F');
scene.fog = new THREE.Fog('#0E1A1F', 420, 1000);

const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 4000);
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
viewportEl.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xcfe3e1, 0x16262c, 0.65));
scene.add(new THREE.AmbientLight(0x33525c, 0.35));
const sun = new THREE.DirectionalLight(0xfff3dd, 0.95);
scene.add(sun);

const terrainMat = new THREE.MeshStandardMaterial({
  vertexColors:true, roughness:0.95, metalness:0.0,
  polygonOffset:true, polygonOffsetFactor:1, polygonOffsetUnits:1,
});
const wireMat = new THREE.MeshBasicMaterial({
  color:new THREE.Color(state.surface.wireColor), wireframe:true,
  transparent:true, opacity:0.28, depthWrite:false,
});
let geo = null;
const terrain = new THREE.Mesh(new THREE.BufferGeometry(), terrainMat);
const wire    = new THREE.Mesh(terrain.geometry, wireMat);
terrain.rotation.x = wire.rotation.x = -Math.PI/2;   // plane lies in XZ, +Y is up
scene.add(terrain, wire);

const border = new THREE.LineLoop(new THREE.BufferGeometry(),
  new THREE.LineBasicMaterial({ color:0x3d6470 }));
scene.add(border);

const overlay = new THREE.Group();     // outlines, falloff bands, height markers, point handles
scene.add(overlay);

/* ------------------------------------------------- 5. Build / deform mesh */

function rebuildPlane(){
  const p = state.plane;
  if (geo) geo.dispose();
  geo = new THREE.PlaneGeometry(p.width, p.depth, p.segX, p.segY);
  terrain.geometry = wire.geometry = geo;
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count*3), 3));
  const hw = p.width/2, hd = p.depth/2;
  border.geometry.dispose();
  border.geometry = new THREE.BufferGeometry().setAttribute('position',
    new THREE.Float32BufferAttribute([-hw,0.02,-hd, hw,0.02,-hd, hw,0.02,hd, -hw,0.02,hd], 3));
  needDeform = true;
}

/* THE DEFORMER — every vertex against every shape, once per change. */
function deform(){
  const pos = geo.attributes.position, col = geo.attributes.color;
  const shapes = state.shapes.filter(s => s.enabled);
  const hs = state.plane.heightScale;
  let minH = Infinity, maxH = -Infinity;

  for (let i=0; i<pos.count; i++){
    // PlaneGeometry is built in XY and the mesh is rotated, so local (x, y)
    // maps to world (x, −z) and the local z channel becomes world height.
    const wx = pos.getX(i), wz = -pos.getY(i);
    let y = 0;

    for (const s of shapes){
      const c = s._c;
      if (wx < c.minX || wx > c.maxX || wz < c.minZ || wz > c.maxZ) continue;   // bbox reject

      const d = signedDistance(s, wx, wz);

      // where the height comes from: the points themselves, a taper along the
      // curve, or one flat elevation for the whole shape
      let height = s.height, falloff = s.falloff;
      if (s.perPoint) height = heightAtHit(s, wx, wz, d);
      else if (s.taper){ height = lerp(s.height, s.heightEnd, _polyT); falloff = lerp(s.falloff, s.falloffEnd, _polyT); }

      let t;
      if (falloff <= 0.0001) t = d <= 0 ? 1 : 0;
      else t = 1 - Math.max(d, 0) / falloff;      // 1 at/inside the edge → 0 at the falloff limit
      if (t <= 0) continue;
      if (t > 1) t = 1;

      let w = CURVES[s.curve](t);
      if (s.power !== 1) w = Math.pow(w, s.power);

      if      (s.blend === 'set') y = y*(1-w) + height*w;   // pull the ground TO this elevation
      else if (s.blend === 'add') y += height*w;
      else if (s.blend === 'max') y = Math.max(y, height*w);
      else                        y = Math.min(y, height*w);
    }

    y *= hs;
    pos.setZ(i, y);
    if (y < minH) minH = y;
    if (y > maxH) maxH = y;
  }

  const sur = state.surface;
  const base = new THREE.Color(sur.base), lo = new THREE.Color(sur.low), hi = new THREE.Color(sur.high);
  const span = (maxH - minH) || 1, tmp = new THREE.Color();
  for (let i=0; i<pos.count; i++){
    if (sur.gradient) tmp.copy(lo).lerp(hi, (pos.getZ(i) - minH)/span);
    else tmp.copy(base);
    col.setXYZ(i, tmp.r, tmp.g, tmp.b);
  }

  pos.needsUpdate = true; col.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  setText('st-verts', pos.count.toLocaleString());
  setText('st-tris', (state.plane.segX * state.plane.segY * 2).toLocaleString());
  setText('st-shapes', state.shapes.length);
  setText('st-range', `${minH.toFixed(1)} … ${maxH.toFixed(1)}`);
}

/* -------------------------------------------------- 6. Overlay + handles */

const HANDLES = [];                            // point handles only — the gizmo owns TRS
const sphereGeo = new THREE.SphereGeometry(1, 12, 10);
const matCache = {};
const flatMat = hex => matCache[hex] || (matCache[hex] =
  new THREE.MeshBasicMaterial({ color:hex, depthTest:false, transparent:true }));

function lineMat(hex, opacity=1, dashed=false){
  const o = { color:hex, depthTest:false, transparent:true, opacity };
  return dashed ? new THREE.LineDashedMaterial({ ...o, dashSize:3, gapSize:3 })
                : new THREE.LineBasicMaterial(o);
}
/* pts: [{x,z}] laid on the ground, or [{x,y,z}] when an elevation matters */
function pushLine(pts, mat, closed, dashed){
  const arr = [];
  for (const p of pts) arr.push(p.x, p.y || 0, p.z);
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(arr,3));
  const line = closed ? new THREE.LineLoop(g, mat) : new THREE.Line(g, mat);
  if (dashed) line.computeLineDistances();
  line.renderOrder = 10;
  overlay.add(line);
}
function pushHandle(x, y, z, hex, index, active){
  const m = new THREE.Mesh(sphereGeo, flatMat(hex));
  m.position.set(x, y, z);
  m.renderOrder = 12;
  m.userData = { index, active };
  overlay.add(m); HANDLES.push(m);
}

/* Offset the outline by the (possibly tapered) falloff distance, so you can
   see exactly how far the influence reaches. */
function falloffBand(s){
  const c = s._c, pts = c.pts, n = pts.length;
  if (n < 2) return [];
  let cx=0, cz=0;
  for (const p of pts){ cx += p.x; cz += p.z; }
  cx/=n; cz/=n;
  const A = [], B = [];
  for (let i=0;i<n;i++){
    const p = pts[i];
    let tx, tz;
    if (!c.closed && i === 0)        { tx = pts[1].x-p.x;      tz = pts[1].z-p.z; }
    else if (!c.closed && i === n-1) { tx = p.x-pts[n-2].x;    tz = p.z-pts[n-2].z; }
    else { const a = pts[(i-1+n)%n], b = pts[(i+1)%n]; tx = b.x-a.x; tz = b.z-a.z; }
    const L = Math.hypot(tx,tz) || 1;
    const nx = -tz/L, nz = tx/L;
    const f = s.taper ? lerp(s.falloff, s.falloffEnd, Math.min(1, c.cum[i]/c.total)) : s.falloff;
    A.push({ x:p.x+nx*f, z:p.z+nz*f });
    B.push({ x:p.x-nx*f, z:p.z-nz*f });
  }
  if (!c.closed) return [A, B];
  const out = (A[0].x-cx)**2 + (A[0].z-cz)**2 > (B[0].x-cx)**2 + (B[0].z-cz)**2 ? A : B;
  return [out];
}

/* Height is an elevation, so draw it: the outline is echoed at its own y. */
function heightMarker(s){
  const hs = state.plane.heightScale, c = s._c;
  const dim = lineMat(0xF0BA4B, 0.34, true);
  if (s.perPoint){
    // the profile the points describe; each point draws its own whisker below
    if (s.type !== 'points')
      pushLine(c.pts.map((p,i) => ({ x:p.x, y:(c.hts[i]||0)*hs, z:p.z })), dim, c.closed, true);
    return;
  }
  if (isCurve(s) && s.taper){
    const path = c.pts.map((p,i) => ({ x:p.x, y:lerp(s.height, s.heightEnd, Math.min(1, c.cum[i]/c.total))*hs, z:p.z }));
    pushLine(path, dim, false, true);
    for (const i of [0, c.pts.length-1]){
      pushLine([{ x:c.pts[i].x, y:0, z:c.pts[i].z }, path[i]], dim, false, true);
    }
  } else {
    const y = s.height * hs;
    if (s.type !== 'points') pushLine(c.pts.map(p => ({ x:p.x, y, z:p.z })), dim, c.closed, true);
    pushLine([{ x:s.x, y:0, z:s.z }, { x:s.x, y, z:s.z }], dim, false, true);
  }
}

function rebuildOverlay(){
  for (let i=overlay.children.length-1; i>=0; i--){
    const ch = overlay.children[i];
    if (ch.geometry && ch.geometry !== sphereGeo) ch.geometry.dispose();
    overlay.remove(ch);
  }
  HANDLES.length = 0;

  const hs = state.plane.heightScale;
  for (const s of state.shapes){
    const sel = s.id === state.selectedId;
    const col = !s.enabled ? 0x50686e : sel ? 0xF0BA4B : 0x74AECB;
    const op  = !s.enabled ? 0.5 : sel ? 1 : 0.62;
    const c = s._c;

    if (s.type === 'points'){
      c.pts.forEach((p,i) => {
        const y = s.perPoint ? (c.hts[i]||0)*hs : 0;
        pushLine(circleOutline(c.dotR).map(q => ({x:p.x+q.x, y, z:p.z+q.y})), lineMat(col,op), true);
      });
      if (sel && s.falloff > 0)
        for (const p of c.pts) pushLine(circleOutline(c.dotR + s.falloff).map(q => ({x:p.x+q.x, z:p.z+q.y})),
                                        lineMat(0xF0BA4B, 0.32, true), true, true);
    } else {
      pushLine(c.pts, lineMat(col, op), c.closed);
      if (sel && s.falloff > 0)
        for (const band of falloffBand(s)) pushLine(band, lineMat(0xF0BA4B, 0.32, true), c.closed, true);
    }
    if (!sel) continue;
    heightMarker(s);

    const py = i => s.perPoint ? (s.points[i].e || 0)*hs : 0;
    if (isCurve(s)){                                   // Bézier handle arms
      for (let i=0; i+1<s.points.length; i++){
        if (i % 3 === 1) continue;                     // control→control is not an arm
        const a = localToWorld(s, s.points[i]), b = localToWorld(s, s.points[i+1]);
        pushLine([{ x:a.x, y:py(i), z:a.z }, { x:b.x, y:py(i+1), z:b.z }],
                 lineMat(0x74AECB, 0.45, true), false, true);
      }
    }
    if (s.type !== 'circle'){
      s.points.forEach((p,i) => {
        const w = localToWorld(s, p), y = py(i);
        const on = i === state.selectedPoint;
        pushHandle(w.x, y, w.z, on ? 0xF0BA4B : (!isCurve(s) || i%3===0) ? 0xE8F2F0 : 0x74AECB, i, on);
        if (s.perPoint && Math.abs(y) > 1e-6)          // plumb line down to the footprint
          pushLine([{ x:w.x, y:0, z:w.z }, { x:w.x, y, z:w.z }], lineMat(0x74AECB, 0.28, true), false, true);
      });
    }
  }
  scaleHandles();
}
const scaleHandles = () => { const k = cam.dist*0.009; HANDLES.forEach(h => h.scale.setScalar(h.userData.active ? k*1.6 : k)); };

/* ------------------------------------------------------ 7. Orbit camera */

const cam = { target:new THREE.Vector3(0,0,0), theta:0.65, phi:0.95, dist:300 };
function updateCamera(){
  const sp = Math.sin(cam.phi), cp = Math.cos(cam.phi);
  camera.position.set(
    cam.target.x + cam.dist*sp*Math.sin(cam.theta),
    cam.target.y + cam.dist*cp,
    cam.target.z + cam.dist*sp*Math.cos(cam.theta));
  camera.lookAt(cam.target);
  document.querySelector('#compass .rose').style.transform = `rotate(${cam.theta*180/Math.PI}deg)`;
  scaleHandles();
}
function frameView(){
  const p = state.plane;
  cam.target.set(0,0,0);
  cam.dist = Math.max(p.width, p.depth) * 1.45;
  cam.theta = 0.65; cam.phi = 0.95;
  updateCamera();
}

/* Moving one point of a shape. Anchors carry their Bézier handles with them,
   and a handle mirrors its partner across the anchor so the curve stays smooth. */
function movePoint(s, i, local){
  const p = s.points, old = p[i];
  if (!old) return;
  const dx = local.x - old.x, dy = local.y - old.y;
  p[i] = { x:local.x, y:local.y, e:old.e || 0 };
  if (!isCurve(s)) return;

  if (i % 3 === 0){                                   // anchor — drag its handles along
    for (const j of [i-1, i+1])
      if (p[j]) p[j] = { x:p[j].x + dx, y:p[j].y + dy, e:p[j].e || 0 };
  } else if (s.smooth){                               // handle — mirror the one opposite
    const ai = i % 3 === 1 ? i-1 : i+1;
    const oi = i % 3 === 1 ? i-2 : i+2;
    const a = p[ai], o = p[oi];
    if (a && o){
      const vx = a.x - p[i].x, vy = a.y - p[i].y;
      const L = Math.hypot(vx, vy);
      if (L > 1e-6){
        const len = Math.hypot(o.x - a.x, o.y - a.y) || L;
        p[oi] = { x: a.x + vx/L*len, y: a.y + vy/L*len, e:o.e || 0 };
      }
    }
  }
}

/* The same rules, applied to the vertical: an anchor lifts its handles with it,
   and a handle's opposite reflects through the anchor so the profile stays smooth. */
function movePointHeight(s, i, e){
  const p = s.points;
  if (!p[i]) return;
  const de = e - (p[i].e || 0);
  p[i].e = e;
  if (!isCurve(s)) return;
  if (i % 3 === 0){
    for (const j of [i-1, i+1]) if (p[j]) p[j].e = (p[j].e || 0) + de;
  } else if (s.smooth){
    const ai = i % 3 === 1 ? i-1 : i+1, oi = i % 3 === 1 ? i-2 : i+2;
    if (p[ai] && p[oi]) p[oi].e = 2*(p[ai].e || 0) - e;
  }
}

/* Switching a shape into per-point mode shouldn't move the terrain: seed every
   point with the elevation it already had. */
function seedPointHeights(s){
  if (s.points.some(pt => pt.e !== undefined)) return;   // already carries elevations — leave them
  const n = s.points.length;
  s.points.forEach((pt, i) => {
    const t = n > 1 ? i/(n-1) : 0;
    pt.e = (s.taper && isCurve(s)) ? lerp(s.height, s.heightEnd, t) : s.height;
  });
  s.taper = false;
  if (n) s.height = s.points.reduce((a, pt) => a + pt.e, 0) / n;   // gizmo sits at the average
}

/* ------------------------------------------- 8. TransformControls gizmo */

/* The gizmo drives a proxy Object3D; the shape data is read back out of it.
   Two proxies: one for the shape as a whole, one for a single selected point.
   For the shape, the vertical axis IS its height, so the gizmo sits at the
   elevation the shape is asking for; rotation is locked to Y and scale to X/Z.
   For a point, only the ground plane is in play. */
const proxy = new THREE.Object3D();          // whole shape
const pointProxy = new THREE.Object3D();     // one point of it
scene.add(proxy, pointProxy);

const gizmo = new THREE.TransformControls(camera, renderer.domElement);
gizmo.setSize(0.9);
scene.add(gizmo);

/* height is authored in metres but drawn through the plane's height scale */
const hsSafe = () => (Math.abs(state.plane.heightScale) < 1e-3 ? 1 : state.plane.heightScale);

function applyGizmoAxes(){
  const m = state.gizmo.mode, s = selected();
  const onPoint = state.selectedPoint !== null;
  gizmo.showX = m !== 'rotate';
  gizmo.showZ = m !== 'rotate';
  // a point only gets a vertical axis if its shape lets points carry their own height
  gizmo.showY = m !== 'scale' && (!onPoint || !!(s && s.perPoint));
}
function setGizmoMode(m){
  state.gizmo.mode = m;
  gizmo.setMode(m);
  // rotating or scaling a single point means nothing — hand the gizmo back to the shape
  if (m !== 'translate' && state.selectedPoint !== null){
    state.selectedPoint = null;
    needOverlay = true;
    buildInspector();
  }
  applyGizmoAxes();
  syncProxy();
  document.querySelectorAll('#gizmomode button')
    .forEach(b => b.setAttribute('aria-pressed', String(b.dataset.g === m)));
}
/* point index → gizmo target. null hands the gizmo back to the whole shape. */
function selectPoint(i){
  const s = selected();
  if (i !== null && (!s || !s.points[i])) i = null;
  state.selectedPoint = i;
  if (i !== null && state.gizmo.mode !== 'translate') setGizmoMode('translate');
  applyGizmoAxes();
  syncProxy();
  needOverlay = true;
  buildInspector();
}
function setSnap(on){
  state.gizmo.snap = on;
  gizmo.translationSnap = on ? 2 : null;
  gizmo.rotationSnap    = on ? Math.PI/12 : null;
  gizmo.scaleSnap       = on ? 0.1 : null;
}
function syncProxy(){
  const s = selected();
  if (!s){ gizmo.detach(); return; }
  const pi = state.selectedPoint;
  if (pi !== null && s.points[pi]){
    const w = localToWorld(s, s.points[pi]);
    pointProxy.position.set(w.x, s.perPoint ? (s.points[pi].e || 0) * hsSafe() : 0, w.z);
    pointProxy.rotation.set(0,0,0);
    pointProxy.scale.set(1,1,1);
    gizmo.attach(pointProxy);
    return;
  }
  proxy.position.set(s.x, s.height * hsSafe(), s.z);
  proxy.rotation.set(0, -s.rot, 0);      // three rotates +X toward −Z; our rot is the opposite sense
  proxy.scale.set(s.sx, 1, s.sz);
  gizmo.attach(proxy);
}
gizmo.addEventListener('objectChange', () => {
  const s = selected();
  if (!s) return;
  if (gizmo.object === pointProxy){
    const i = state.selectedPoint;
    if (i === null || !s.points[i]) return;
    movePoint(s, i, worldToLocal(s, pointProxy.position.x, pointProxy.position.z));
    if (s.perPoint) movePointHeight(s, i, pointProxy.position.y / hsSafe());
    touch(s); syncInspector();
    return;
  }
  s.x = proxy.position.x; s.z = proxy.position.z;
  const newH = proxy.position.y / hsSafe();
  if (s.perPoint){                       // the shape gizmo lifts the whole profile
    const d = newH - s.height;
    for (const pt of s.points) pt.e = (pt.e || 0) + d;
  }
  s.height = newH;
  s.rot = -proxy.rotation.y;
  s.sx = Math.max(0.02, proxy.scale.x);
  s.sz = Math.max(0.02, proxy.scale.z);
  touch(s); refreshMeta(s); syncInspector();
});
gizmo.addEventListener('dragging-changed', e => { if (e.value) drag = null; });

/* ------------------------------------------------ 9. Pointer interaction */

const ray = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0,1,0), 0);
const hitPoint = new THREE.Vector3();
let drag = null;

function setRay(ev){
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(
    ((ev.clientX - r.left)/r.width)*2 - 1,
    -((ev.clientY - r.top)/r.height)*2 + 1), camera);
}
/* horizontal plane at height y — points are dragged on the plane they sit on */
function planeHit(y = 0){
  groundPlane.constant = -y;
  return ray.ray.intersectPlane(groundPlane, hitPoint) ? { x:hitPoint.x, z:hitPoint.z } : null;
}
function pick(g){
  // handles are picked in 3D: in per-point mode they float above the plane
  const hits = ray.intersectObjects(HANDLES, false);
  if (hits.length) return { kind:'point', index:hits[0].object.userData.index };
  if (!g) return null;
  const grab = cam.dist * 0.02;          // how close to an outline still counts as a hit
  for (let i=state.shapes.length-1; i>=0; i--){
    const s = state.shapes[i];
    if (!s.enabled) continue;
    const c = s._c;
    if (g.x < c.minX || g.x > c.maxX || g.z < c.minZ || g.z > c.maxZ) continue;
    if (signedDistance(s, g.x, g.z) < grab) return { kind:'shape', shape:s };
  }
  return null;
}

const dom = renderer.domElement;
dom.addEventListener('contextmenu', e => e.preventDefault());
dom.addEventListener('pointerdown', ev => {
  if (gizmo.axis) return;                       // the gizmo has this one
  dom.setPointerCapture(ev.pointerId);
  if (ev.button === 2 || ev.button === 1 || ev.shiftKey){
    drag = { mode:'pan', px:ev.clientX, py:ev.clientY };
    return;
  }
  setRay(ev);
  const g = planeHit(0);
  const hit = pick(g);
  if (hit && hit.kind === 'shape'){
    select(hit.shape.id);
    if (state.selectedPoint !== null) selectPoint(null);
    drag = { mode:'shape', kind:'move', s:hit.shape, ox:hit.shape.x-g.x, oz:hit.shape.z-g.z };
  } else if (hit){
    if (state.selectedPoint !== hit.index) selectPoint(hit.index);
    const sh = selected(), pt = sh && sh.points[hit.index];
    drag = { mode:'shape', kind:'point', index:hit.index, s:sh,
             planeY: sh && sh.perPoint && pt ? (pt.e || 0) * hsSafe() : 0 };
  } else {
    select(null);
    drag = { mode:'orbit', px:ev.clientX, py:ev.clientY };
  }
});
dom.addEventListener('pointermove', ev => {
  if (!drag) return;
  if (drag.mode === 'orbit'){
    cam.theta -= (ev.clientX - drag.px) * 0.006;
    cam.phi = Math.max(0.06, Math.min(Math.PI*0.492, cam.phi - (ev.clientY - drag.py)*0.006));
    drag.px = ev.clientX; drag.py = ev.clientY;
    updateCamera();
  } else if (drag.mode === 'pan'){
    const k = cam.dist * 0.0022;
    const right = new THREE.Vector3(Math.cos(cam.theta), 0, -Math.sin(cam.theta));
    const fwd   = new THREE.Vector3(Math.sin(cam.theta), 0,  Math.cos(cam.theta));
    cam.target.addScaledVector(right, -(ev.clientX - drag.px)*k)
              .addScaledVector(fwd,   -(ev.clientY - drag.py)*k);
    drag.px = ev.clientX; drag.py = ev.clientY;
    updateCamera();
  } else {
    setRay(ev);
    const g = planeHit(drag.planeY || 0); if (!g || !drag.s) return;
    const s = drag.s;
    if (drag.kind === 'move'){ s.x = g.x + drag.ox; s.z = g.z + drag.oz; }
    else movePoint(s, drag.index, worldToLocal(s, g.x, g.z));
    touch(s); syncProxy(); syncInspector();
  }
});
const endDrag = () => { drag = null; };
dom.addEventListener('pointerup', endDrag);
dom.addEventListener('pointercancel', endDrag);
dom.addEventListener('wheel', ev => {
  ev.preventDefault();
  cam.dist = Math.max(12, Math.min(1800, cam.dist * (1 + Math.sign(ev.deltaY)*0.1)));
  updateCamera();
}, { passive:false });

addEventListener('keydown', ev => {
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  const s = selected(), k = ev.key.toLowerCase();
  if      (k === 'w') setGizmoMode('translate');
  else if (k === 'e') setGizmoMode('rotate');
  else if (k === 'r') setGizmoMode('scale');
  else if (k === 'v') cycleViewMode();
  else if (k === 'f') frameView();
  else if (k === 'd' && s) duplicateShape(s);
  else if ((ev.key === 'Delete' || ev.key === 'Backspace') && s){ removeShape(s.id); ev.preventDefault(); }
  else if (ev.key === 'Escape'){ if (state.selectedPoint !== null) selectPoint(null); else select(null); }
});

/* ------------------------------------------------------ 10. Change plumbing */

let needDeform = false, needOverlay = false;
function touch(s){ if (s) cacheShape(s); else cacheAll(); needDeform = needOverlay = true; }
const setText = (id, v) => { document.getElementById(id).textContent = v; };
const msg = t => setText('st-msg', t);

function select(id){
  if (state.selectedId === id) return;
  state.selectedId = id;
  state.selectedPoint = null;
  applyGizmoAxes();
  needOverlay = true;
  syncProxy(); renderList(); buildInspector();
}
function addShape(type){
  const s = makeShape(type);
  s.x = (Math.random()-0.5) * state.plane.width * 0.35;
  s.z = (Math.random()-0.5) * state.plane.depth * 0.35;
  state.shapes.push(s);
  touch(s);
  state.selectedId = s.id; state.selectedPoint = null; applyGizmoAxes();
  syncProxy(); renderList(); buildInspector();
  msg(`added ${s.name}`);
}
function removeShape(id){
  const i = state.shapes.findIndex(s => s.id === id);
  if (i < 0) return;
  const [gone] = state.shapes.splice(i,1);
  if (state.selectedId === id){ state.selectedId = null; state.selectedPoint = null; gizmo.detach(); }
  needDeform = needOverlay = true;
  renderList(); buildInspector();
  msg(`removed ${gone.name}`);
}
function duplicateShape(s){
  const copy = JSON.parse(JSON.stringify(s));
  copy.id = ++uid; copy.name = s.name + ' copy';
  copy.x += 14; copy.z += 14; delete copy._c;
  state.shapes.push(copy);
  touch(copy);
  state.selectedId = copy.id; state.selectedPoint = null; applyGizmoAxes();
  syncProxy(); renderList(); buildInspector();
}
function removePoint(s, idx){
  const p = s.points;
  if (isCurve(s)){
    if (Math.floor((p.length-1)/3) < 2){ msg('a curve needs at least one segment'); return; }
    const i = idx == null ? p.length-1 : idx;
    const anchor = Math.round(i/3)*3;                        // the anchor this point belongs to
    const start = anchor === 0 ? 0 : anchor === p.length-1 ? p.length-3 : anchor-1;
    p.splice(start, 3);
  } else {
    if (p.length <= 3){ msg('a shape needs at least three points'); return; }
    p.splice(idx == null ? p.length-1 : idx, 1);
  }
  state.selectedPoint = null;
  applyGizmoAxes(); touch(s); syncProxy(); buildInspector(); renderList();
}
function reorder(s, dir){
  const i = state.shapes.indexOf(s), j = i + dir;
  if (j < 0 || j >= state.shapes.length) return;
  state.shapes.splice(i,1); state.shapes.splice(j,0,s);
  needDeform = true; renderList();
}

/* ------------------------------------------------------------- 11. UI kit */

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
function group(parent, label){ parent.append(el('div','grp', label)); }
function slider(parent, o){
  const row = el('div','ctrl'), head = el('div','ctrl-head'), val = el('span','ctrl-val');
  head.append(el('span','ctrl-label', o.label), val);
  const inp = el('input');
  inp.type='range'; inp.min=o.min; inp.max=o.max; inp.step=o.step;
  const fmt = v => (o.step < 1 ? (+v).toFixed(o.step < 0.05 ? 2 : 1) : (+v).toFixed(0)) + (o.unit||'');
  const set = v => { inp.value = v; val.textContent = fmt(v); };
  set(o.value);
  inp.addEventListener('input', () => { val.textContent = fmt(inp.value); o.onInput(+inp.value); });
  row.append(head, inp); parent.append(row);
  return { set };
}
function dropdown(parent, label, options, value, onChange){
  const row = el('div','row'); row.append(el('label', null, label));
  const sel = el('select');
  for (const [v,t] of options){ const o = el('option', null, t); o.value = v; sel.append(o); }
  sel.value = value;
  sel.addEventListener('change', () => onChange(sel.value));
  row.append(sel); parent.append(row);
}
function checkbox(parent, label, value, onChange){
  const lab = el('label','check'), inp = el('input');
  inp.type='checkbox'; inp.checked = value;
  inp.addEventListener('change', () => onChange(inp.checked));
  lab.append(inp, el('span', null, label));
  parent.append(lab);
}
function colorPick(parent, label, value, onChange){
  const row = el('div','row'); row.append(el('label', null, label));
  const inp = el('input'); inp.type='color'; inp.value = value;
  inp.addEventListener('input', () => onChange(inp.value));
  row.append(inp); parent.append(row);
}
function readout(parent, label){
  const row = el('div','row'), v = el('span','ctrl-val');
  row.append(el('label', null, label), v);
  parent.append(row);
  return { set: t => { v.textContent = t; } };
}
function button(parent, label, onClick, cls=''){
  const b = el('button','btn '+cls, label);
  b.addEventListener('click', onClick);
  parent.append(b);
}

/* tiny SVG glyph of a shape, drawn from its own outline */
function thumb(s){
  const pts = outlineLocal(s);
  let a=Infinity,b=-Infinity,c=Infinity,d=-Infinity;
  for (const p of pts){ a=Math.min(a,p.x); b=Math.max(b,p.x); c=Math.min(c,p.y); d=Math.max(d,p.y); }
  const w = Math.max(b-a, d-c, 1), cx=(a+b)/2, cy=(c+d)/2, k = 18/w;
  const map = p => `${(11 + (p.x-cx)*k).toFixed(1)},${(11 + (p.y-cy)*k).toFixed(1)}`;
  const stroke = s.id === state.selectedId ? '#F0BA4B' : '#74AECB';
  const inner = s.type === 'points'
    ? pts.map(p => { const [x,y] = map(p).split(','); return `<circle cx="${x}" cy="${y}" r="2"/>`; }).join('')
    : `<path d="M${pts.map(map).join(' L')}${(isCurve(s) ? s.closed : true) ? ' Z' : ''}"/>`;
  return `<svg class="thumb" viewBox="0 0 22 22" fill="none" stroke="${stroke}" stroke-width="1.4"
    stroke-linejoin="round">${inner}</svg>`;
}
const SHAPE_ICONS = {
  circle:  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"><circle cx="8" cy="8" r="6"/></svg>',
  polygon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="M8 2 14 6.5 11.7 13.5 4.3 13.5 2 6.5Z" stroke-linejoin="round"/></svg>',
  points:  '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="4" cy="5" r="1.7"/><circle cx="12" cy="4" r="1.7"/><circle cx="7" cy="12" r="1.7"/><circle cx="13" cy="11" r="1.7"/></svg>',
  bezier:  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="M2 12C4 4 12 12 14 4"/></svg>',
};

/* --------------------------------------------------------- 12. Shape list */

const listEl = document.getElementById('shapelist');
const metaEls = new Map();
const metaText = s => {
  if (s.perPoint && s.points.length){
    const es = s.points.map(pt => pt.e || 0);
    return `${Math.min(...es).toFixed(0)}…${Math.max(...es).toFixed(0)}m`;
  }
  return (s.taper && isCurve(s) ? `${s.height.toFixed(0)}→${s.heightEnd.toFixed(0)}` : s.height.toFixed(0)) + 'm';
};
function refreshMeta(s){ const e = metaEls.get(s.id); if (e) e.textContent = metaText(s); }
function renderList(){
  listEl.innerHTML = '';
  metaEls.clear();
  if (!state.shapes.length){
    const li = el('li','empty','No shapes yet. Add one above — it lands on the plane and starts pulling vertices immediately.');
    li.style.background = 'transparent';
    listEl.append(li);
    return;
  }
  for (const s of state.shapes){
    const li = el('li', (s.id===state.selectedId?'sel ':'') + (s.enabled?'':'off'));
    li.innerHTML = thumb(s) + `<span class="nm">${s.name}</span><span class="meta">${metaText(s)}</span>`;
    metaEls.set(s.id, li.querySelector('.meta'));
    const eye = el('button','icobtn', s.enabled
      ? '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8Z"/><circle cx="8" cy="8" r="1.8"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="M2 2l12 12M6.5 6.6A2 2 0 0 0 8 10M1 8s2.6-4.5 7-4.5c1 0 1.9.2 2.7.6M14.4 10.3c.4-.5.6-.9.6-.9S13.6 6.6 12 5.5"/></svg>');
    eye.title = s.enabled ? 'Hide from terrain' : 'Show in terrain';
    eye.addEventListener('click', e => { e.stopPropagation(); s.enabled = !s.enabled; needDeform = needOverlay = true; renderList(); });
    const del = el('button','icobtn','<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="M3 4h10M6.5 4V2.6h3V4M4.5 4l.6 9h5.8l.6-9"/></svg>');
    del.title = 'Delete shape';
    del.addEventListener('click', e => { e.stopPropagation(); removeShape(s.id); });
    li.append(eye, del);
    li.addEventListener('click', () => select(s.id));
    listEl.append(li);
  }
}
const addGrid = document.getElementById('addgrid');
for (const t of ['circle','polygon','points','bezier']){
  const b = el('button','btn', SHAPE_ICONS[t] + '<span>'+t+'</span>');
  b.addEventListener('click', () => addShape(t));
  addGrid.append(b);
}

/* ---------------------------------------------------------- 13. Inspector */

const inspEl = document.getElementById('inspector');
let syncFns = [];
const syncInspector = () => syncFns.forEach(f => f());

function buildInspector(){
  inspEl.innerHTML = '';
  syncFns = [];
  const s = selected();
  if (!s){
    inspEl.append(el('p','empty','Nothing selected. Click a shape in the list or in the viewport. The gizmo appears at the elevation the shape is asking for — the green axis raises and lowers it, red and blue slide it across the plane.'));
    return;
  }
  const ext = Math.max(state.plane.width, state.plane.depth);

  group(inspEl, 'Elevation');
  const hgt = readout(inspEl, s.perPoint ? 'Height — lifts every point' : 'Height — drag the green axis');
  if (s.type !== 'circle')
    checkbox(inspEl, 'Per-point heights', s.perPoint, v => {
      s.perPoint = v;
      if (v) seedPointHeights(s);
      touch(s); applyGizmoAxes(); syncProxy(); buildInspector(); renderList();
    });
  const pe = s.perPoint && state.selectedPoint !== null ? readout(inspEl, 'This point') : null;
  slider(inspEl, { label:'Falloff distance', min:0, max:120, step:0.5, value:s.falloff,
    onInput:v => { s.falloff = v; touch(s); } });
  dropdown(inspEl, 'Falloff curve', [
    ['linear','Linear'],['smooth','Smoothstep'],['gauss','Gaussian'],['dome','Dome'],
    ['spike','Spike'],['terrace','Terraced'],['constant','Hard edge'],
  ], s.curve, v => { s.curve = v; touch(s); });
  slider(inspEl, { label:'Curve bias', min:0.25, max:4, step:0.05, value:s.power,
    onInput:v => { s.power = v; touch(s); } });
  dropdown(inspEl, 'Blend', [
    ['set','Set — blend to height'],['add','Add'],['max','Keep highest'],['min','Keep lowest'],
  ], s.blend, v => { s.blend = v; touch(s); });

  if (isCurve(s) && !s.perPoint){
    group(inspEl, 'Taper along curve');
    checkbox(inspEl, 'Lerp from first anchor to last', s.taper, v => { s.taper = v; touch(s); buildInspector(); renderList(); });
    if (s.taper){
      slider(inspEl, { label:'End height', min:-60, max:60, step:0.5, unit:'m', value:s.heightEnd,
        onInput:v => { s.heightEnd = v; touch(s); refreshMeta(s); } });
      slider(inspEl, { label:'End falloff', min:0, max:120, step:0.5, value:s.falloffEnd,
        onInput:v => { s.falloffEnd = v; touch(s); } });
    }
  }

  group(inspEl, 'Placement');
  const px = slider(inspEl, { label:'Position X', min:-ext, max:ext, step:0.5, value:s.x, onInput:v => { s.x=v; touch(s); syncProxy(); } });
  const pz = slider(inspEl, { label:'Position Z', min:-ext, max:ext, step:0.5, value:s.z, onInput:v => { s.z=v; touch(s); syncProxy(); } });
  const rt = slider(inspEl, { label:'Rotation', min:0, max:360, step:1, unit:'°', value:s.rot*180/Math.PI,
    onInput:v => { s.rot = v*Math.PI/180; touch(s); syncProxy(); } });
  const cx = slider(inspEl, { label:'Scale X', min:0.05, max:5, step:0.01, unit:'×', value:s.sx, onInput:v => { s.sx=v; touch(s); syncProxy(); } });
  const cz = slider(inspEl, { label:'Scale Z', min:0.05, max:5, step:0.01, unit:'×', value:s.sz, onInput:v => { s.sz=v; touch(s); syncProxy(); } });
  syncFns.push(() => {
    hgt.set(s.height.toFixed(1) + ' m');
    if (pe) pe.set(((s.points[state.selectedPoint] || {}).e || 0).toFixed(1) + ' m');
    px.set(s.x.toFixed(1)); pz.set(s.z.toFixed(1));
    rt.set(((s.rot*180/Math.PI)%360+360)%360); cx.set(s.sx); cz.set(s.sz);
  });
  syncInspector();

  group(inspEl, 'Geometry');
  if (s.type === 'circle')
    slider(inspEl, { label:'Radius', min:1, max:120, step:0.5, value:s.radius, onInput:v => { s.radius=v; touch(s); } });
  if (s.type === 'points')
    slider(inspEl, { label:'Point radius', min:0, max:40, step:0.5, value:s.dotRadius, onInput:v => { s.dotRadius=v; touch(s); } });
  checkbox(inspEl, s.type === 'points' ? 'Solid dots (off = rings)' : 'Fill interior', s.filled,
    v => { s.filled = v; touch(s); });
  if (isCurve(s)) checkbox(inspEl, 'Close the curve', s.closed, v => { s.closed = v; touch(s); renderList(); });

  if (s.type !== 'circle'){
    const pi = state.selectedPoint;
    readout(inspEl, 'Point').set(pi === null ? `${s.points.length} total` : `${pi+1} of ${s.points.length}`);
    const nav = el('div','btns');
    button(nav, '‹ prev', () => selectPoint(((state.selectedPoint ?? 0) - 1 + s.points.length) % s.points.length));
    button(nav, 'next ›', () => selectPoint(((state.selectedPoint ?? -1) + 1) % s.points.length));
    if (pi !== null) button(nav, 'Whole shape', () => selectPoint(null));
    inspEl.append(nav);
    if (isCurve(s))
      checkbox(inspEl, 'Mirror the opposite handle', s.smooth, v => { s.smooth = v; });
  }

  const btns = el('div','btns');
  if (s.type !== 'circle'){
    button(btns, '+ point', () => {
      const p = s.points;
      if (isCurve(s)){
        const a = p[p.length-1], prev = p[p.length-2];
        const dx = a.x-prev.x, dy = a.y-prev.y, e = a.e;
        p.push({x:a.x+dx, y:a.y+dy, e},
               {x:a.x+dx*2.6-dy*0.9, y:a.y+dy*2.6+dx*0.9, e},
               {x:a.x+dx*3.4, y:a.y+dy*3.4, e});          // extends at the current elevation
      } else {
        const a = p[p.length-1], b = p[0];
        const e = a.e === undefined ? undefined : ((a.e||0) + (b.e||0))/2;
        p.push({ x:(a.x+b.x)/2 + 6, y:(a.y+b.y)/2 + 6, e });
      }
      touch(s); selectPoint(s.points.length-1); renderList();
    });
    button(btns, 'Remove point', () => removePoint(s, state.selectedPoint));
  }
  button(btns, 'Move up', () => reorder(s, -1));
  button(btns, 'Move down', () => reorder(s, 1));
  button(btns, 'Duplicate', () => duplicateShape(s));
  button(btns, 'Delete', () => removeShape(s.id), 'danger');
  inspEl.append(btns);
}

/* ------------------------------------------------- 14. Plane + surface UI */

function buildPlaneUI(){
  const p = state.plane, box = document.getElementById('planebody');
  box.innerHTML = '';
  slider(box, { label:'Width (X)', min:20, max:600, step:5, value:p.width,
                onInput:v => { p.width=v; rebuildPlane(); rebuildLater(); } });
  slider(box, { label:'Depth (Z)', min:20, max:600, step:5, value:p.depth,
                onInput:v => { p.depth=v; rebuildPlane(); rebuildLater(); } });
  slider(box, { label:'Subdivisions X', min:4, max:256, step:1, value:p.segX,
                onInput:v => { p.segX=v; rebuildPlane(); } });
  slider(box, { label:'Subdivisions Z', min:4, max:256, step:1, value:p.segY,
                onInput:v => { p.segY=v; rebuildPlane(); } });
  slider(box, { label:'Height scale', min:0, max:4, step:0.05, unit:'×', value:p.heightScale,
                onInput:v => { p.heightScale=v; needDeform = needOverlay = true; syncProxy(); } });
  const b = el('div','btns');
  button(b, 'Frame view', frameView);
  button(b, 'Clear shapes', () => {
    state.shapes.length = 0; state.selectedId = null; gizmo.detach();
    needDeform = needOverlay = true; renderList(); buildInspector(); msg('cleared');
  }, 'danger');
  box.append(b);
}
let rebuildTimer = null;
const rebuildLater = () => { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(buildInspector, 250); };

function buildSurfaceUI(){
  const s = state.surface, box = document.getElementById('surfacebody');
  box.innerHTML = '';
  checkbox(box, 'Colour by elevation', s.gradient, v => { s.gradient=v; needDeform=true; });
  colorPick(box, 'Low ground', s.low, v => { s.low=v; needDeform=true; });
  colorPick(box, 'High ground', s.high, v => { s.high=v; needDeform=true; });
  colorPick(box, 'Flat colour', s.base, v => { s.base=v; needDeform=true; });
  colorPick(box, 'Wireframe', s.wireColor, v => { s.wireColor=v; wireMat.color.set(v); });
  checkbox(box, 'Faceted shading', s.flat, v => { s.flat=v; terrainMat.flatShading=v; terrainMat.needsUpdate=true; });
  checkbox(box, 'Snap gizmo (2m · 15° · 0.1×)', state.gizmo.snap, setSnap);
  slider(box, { label:'Sun direction', min:0, max:360, step:1, unit:'°', value:s.sun*180/Math.PI,
                onInput:v => { s.sun = v*Math.PI/180; updateSun(); } });
}
const updateSun = () => sun.position.set(Math.cos(state.surface.sun)*180, 190, Math.sin(state.surface.sun)*180);

const modeBtns = [...document.querySelectorAll('#viewmode button')];
function setViewMode(m){
  state.surface.mode = m;
  terrain.visible = m !== 'wire';
  wire.visible    = m !== 'solid';
  wireMat.opacity = m === 'wire' ? 0.9 : 0.28;
  modeBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
}
modeBtns.forEach(b => b.addEventListener('click', () => setViewMode(b.dataset.mode)));
const cycleViewMode = () => {
  const order = ['solid','both','wire'];
  setViewMode(order[(order.indexOf(state.surface.mode)+1) % order.length]);
};
document.querySelectorAll('#gizmomode button').forEach(b => b.addEventListener('click', () => setGizmoMode(b.dataset.g)));
document.getElementById('frameview').addEventListener('click', frameView);
document.getElementById('topview').addEventListener('click', () => {
  cam.phi = 0.08; cam.theta = 0; updateCamera(); msg('top view — best for placing shapes');
});

/* ------------------------------------------------------------- 15. Start */

function starterScene(){
  const island = makeShape('circle');
  Object.assign(island, { name:'Island mass', x:-14, z:8, radius:60, sx:1, sz:0.85,
    height:12, falloff:46, curve:'dome', blend:'set' });

  const ridge = makeShape('bezier');
  Object.assign(ridge, { name:'Ridge line', x:-10, z:-30, sx:1.1, sz:0.7, rot:0.15,
    taper:true, height:34, heightEnd:16, falloff:16, falloffEnd:26, curve:'gauss', blend:'max' });

  const plateau = makeShape('polygon');
  Object.assign(plateau, { name:'Plateau', x:44, z:-30, sx:1.3, sz:1.0, rot:0.5,
    height:20, falloff:14, curve:'smooth', blend:'set' });

  const river = makeShape('bezier');
  Object.assign(river, { name:'River', x:6, z:24, sx:1.25, sz:1.1, rot:2.7,
    taper:true, height:2, heightEnd:-7, falloff:7, falloffEnd:15, curve:'smooth', blend:'set' });

  const crater = makeShape('circle');
  Object.assign(crater, { name:'Crater', x:-52, z:38, radius:15, height:-9, falloff:15, curve:'smooth', blend:'set' });

  const rocks = makeShape('points');
  Object.assign(rocks, { name:'Boulders', x:34, z:44, sx:1.6, sz:1.6, dotRadius:3,
    height:9, falloff:9, curve:'dome', blend:'max' });

  state.shapes.push(island, ridge, plateau, river, crater, rocks);
  state.selectedId = river.id;
}

function resize(){
  const w = viewportEl.clientWidth, h = viewportEl.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w/h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewportEl);

starterScene();
rebuildPlane();
cacheAll();
buildPlaneUI(); buildSurfaceUI(); renderList(); buildInspector();
setViewMode('solid'); setGizmoMode('translate'); setSnap(false);
syncProxy(); updateSun(); frameView(); resize();
needDeform = needOverlay = true;

function tick(){
  requestAnimationFrame(tick);
  if (needDeform){
    const t0 = performance.now();
    deform();
    needDeform = false;
    if (!drag && !gizmo.dragging) msg(`rebuilt in ${(performance.now()-t0).toFixed(1)} ms`);
  }
  if (needOverlay){ rebuildOverlay(); needOverlay = false; }
  renderer.render(scene, camera);
}
tick();
</script>
</body>
</html>
````

## Notas de uso

- Abrir el HTML completo en cualquier navegador; Three.js se carga desde CDN.
- La referencia queda guardada en este documento (código íntegro) y la URL original
  arriba por si se quiere volver al artefacto interactivo.
- En el constructor de mundo: los controles numéricos con slider sincronizado en tiempo
  real y el panel lateral por secciones son los patrones a replicar.