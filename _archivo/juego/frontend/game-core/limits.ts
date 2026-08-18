/* GAME-01 — Presupuestos del núcleo lógico.
 * Una sola fuente para simulación y colisiones; estos límites son defensivos,
 * no sustituyen los presupuestos finales del juego realtime. */

export const GAME_CORE_LIMITS = {
  maxSpeedUnitsPerSecond: 32,
  maxDeltaSeconds: 0.25,
  minSubstepDistance: 0.01,
  maxSubstepsPerMove: 4096,
  maxSpatialCellsPerEntry: 4096,
} as const;
