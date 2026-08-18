# Prevención — Precisión documental al cerrar un bloque (gate)

> **Fecha:** 2026-08-14 · **Origen:** reservas documentales del
> `supervisor_reviewer` en 138A-7 (deuda de líneas mal reportada y conteos de
> tests imprecisos en la completada).

## Reglas

1. **El resumen de warnings del gate en la completada debe coincidir con el
   JSON del reporte** (`.quality-reports/check/<ID>/latest.json`): antes de
   escribir "warnings preexistentes sin cambios", comparar el conteo y las
   líneas reales de `limite-lineas`/`limite-lineas-nivel-2` y
   `dom-access-outside-platform` con el reporte; si un archivo ya advertido
   creció, declararlo como deuda con su número efectivo y registrarla en el
   plan (bloque de auditoría), no como "sin cambios".
2. **Los conteos de tests en la completada salen del conteo real de `it(`**
   por archivo (`Select-String -Pattern '\bit\(' <archivo>.test.ts`), no de
   memoria ni de totales inferidos; reportar desglose por archivo y suma.
   Los "nuevos del bloque" se calculan contra el estado previo del commit.
3. Las afirmaciones de gate PASS solo se escriben después de la corrida real
   con el estado final de los archivos (docs editadas antes del rerun final).

## Cierre

Es prevención documental, no regla de herramienta nueva: el analyzer
`limite-lineas` y el conteo `it(` ya existen; el flujo de cierre debe
verificarlos. Cuando se implemente en el flujo del gate (p. ej. un paso de
`gate:check` que valide la completada contra el JSON), archivar esta
prevención y reflejarla en la fuente canónica.
