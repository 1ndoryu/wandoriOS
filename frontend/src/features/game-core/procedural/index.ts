/* GAME-01 — API pública del toolkit procedural del Bosque (138A-1/138A-2).
 * Paquete de datos puros: ruido determinista, heightfield de isla, mesh suave,
 * vegetación con presupuestos y mallas low-poly (árboles + césped por matas).
 * No importa Three/DOM/red; los adaptadores visuales viven en la capa app. */

export * from './noise';
export * from './heightmap';
export * from './heightfield-mesh';
export * from './vegetation';
export * from './vegetation-mesh';
export * from './tree-mesh';
export * from './grass-mesh';
export * from './grass-field';
export * from './vegetation-lowpoly';
export * from './water-mesh';
export * from './rain-mesh';
export * from './terrain-options';
export * from './sky-options';
export * from './sky-presets';
export * from './sky-limits';
