# Prevención: restauración de montaje tras inicialización (TDZ)

> Fecha: 2026-08-14 · Bloque: 138A-5 · Severidad: media · Origen: revisor 138A-4

## Regla

En cualquier módulo que restaure estado persistido al montar (escena, vista o controlador),
el bloque de restauración debe ejecutarse **después** de que estén inicializados todos los
constantes/funciones que invoca. Colocar `localStorage`/import-restore antes de esas
definiciones produce `ReferenceError` (temporal dead zone) que rompe el montaje completo.

## Síntoma real

`game-playable-scene.ts`: el bloque de restauración corría antes de `applyPick`, que a su vez
llamaba `applyTerrainMode`. Al montar con `wandorius:constructor:v1` guardado, la escena
fallaba con `ReferenceError: Cannot access 'applyPick' before initialization`.

## Corrección aplicada

- `game-playable-scene.ts`: bloque de restauración movido justo después de la definición de
  `updatePick`/`applyPick`, antes de `onOrbitStart`, con comentario `[138A-5]`.

## Verificación

- Test de integración pendiente: montar la escena real en jsdom con el estado precargado.
  No hay patrón de mock de `WebGLRenderer` en el repo; los tests de scene mockean el módulo
  completo. Si en el futuro se habilita un harness de scene con renderer mockeable, añadir el
  test aquí. Mientras tanto, la guardia estructural es: restauración siempre al final del
  bloque de setup, tras todos los consts usados.
