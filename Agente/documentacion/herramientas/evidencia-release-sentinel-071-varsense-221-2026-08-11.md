# Evidencia de la segunda release de Sentinel y VarSense

> Registro reproducible de la auditoría 2026-08-11. Los resultados iniciales se obtuvieron en worktrees
> aislados; después los commits se publicaron y adoptaron en wandorius y glory-rs-rest. Este documento no
> sustituye `doctor`, `quality:lock` ni el gate posterior a la adopción.

> **Addendum, corte final:** Sentinel `0.7.4` (`0349485c`, tag `v0.7.4`) incorpora la
> corrección POSIX de la matriz, resolución portable de PowerShell y diagnósticos de CI sobre el hardening
> de `0.7.2`/`0.7.3`. Las CI upstream #45 y #46 pasan consecutivamente. El VSIX actual es
> `glory-sentinel-0.7.4.vsix` (951778 bytes, SHA-256
> `BF01826858219A6A97CB42DB6A55FC6CE08696E3C1B9BE295DB18B6CD7B76BE5`). Los artefactos `0.7.1` de este
> archivo son evidencia histórica de rollback y adopción.

## Identidad de los artefactos

| Herramienta | Release preparada | Commit completo | Padre | Estado remoto |
| --- | --- | --- | --- | --- |
| Sentinel | 0.7.1, tag `v0.7.1` | `b22c8484fd2334f19a88f930c494091d02942e39` | `0dd9c2130d5aebeff384d1448218cf660e4aef6c` | publicado en `release/0.7.1` + tag |
| VarSense | 2.2.1, tag `v2.2.1` | `88f281f94e6febd02a386b7ed03d30d285eb82e1` | `998505c734c0cb040b2b7c53bfefadadb03b025f` | publicado en `release/2.2.1` + tag |

### Pin vigente tras la reauditoría

| Herramienta | Release | Commit | Estado remoto |
| --- | --- | --- |
| Sentinel | 0.7.4, tag `v0.7.4` | `0349485c121784513c7ecef8a8de1535e841a5ae` | publicado en `main` + tag; CI #45/#46 verdes |
| VarSense | 2.2.1, tag `v2.2.1` | `88f281f94e6febd02a386b7ed03d30d285eb82e1` | publicado en `release/2.2.1` + tag |

La identidad se comprobó con `git show refs/heads/release/<versión>` y
`git show refs/tags/v<versión>` en cada submódulo. No se usó una versión global para
sustituir estos commits.

## Sentinel 0.7.1

Worktree: `tools/sentinel/.sentinel/tmp/sentinel-release-071` (eliminado después de la comprobación).

Comandos ejecutados y resultado:

```text
npm install --ignore-scripts --no-audit --no-fund    PASS
npm run compile                                      PASS
npx mocha --no-config --ui tdd --timeout 10000 out/test/suite/projectInit.test.js
                                                     8 passing
npm run check:core                                   PASS
npm run smoke:lsp                                    PASS
```

La prueba focalizada cubre las cuatro variantes de `sentinel init --json`: escribe
configuración, lock y manifest, y no crea una carpeta privada ni scripts del consumidor.
El cambio corrige el defecto de `0dd9c21` y conserva la cobertura en la release `b22c848`.

El VSIX generado desde este commit con `npx --yes @vscode/vsce package --no-dependencies` es
`glory-sentinel-0.7.1.vsix`, 949807 bytes, SHA-256
`806B81240E0CDF3787E417056361E6AD6D4593D433A54741E0671EDEA988EF43`.

## VarSense 2.2.1

Worktree: `tools/varsense/.sentinel/tmp/varsense-instrumented` (eliminado después de la comprobación).

```text
npm run compile                                      PASS
npm run compile:tests                                PASS
npm run test                                         61 passing
  pretest: lint, check:core y smoke:lsp              PASS
```

La optimización consolida los patrones de descubrimiento en una pasada del provider y
reutiliza el snapshot del workspace durante el proceso CLI. La prueba de contrato nueva
verifica dos llamadas del provider (CSS y consumidores) y todos los patrones esperados.

### Medición instrumentada

La medición se ejecutó sobre el workspace real con el CLI `all`, salida JSON y el índice
persistentemente reutilizable. Cada ejecución terminó con código 0 y 335 archivos
descubiertos; se conservaron las métricas emitidas por el CLI y el tiempo de proceso observado:

| Ejecución | Tiempo CLI | Tiempo observado | Resultado |
| --- | ---: | ---: | --- |
| 1 (cold) | 3184 ms | 3288 ms | PASS |
| 2 (warm) | 2729 ms | 2810 ms | PASS |
| 3 (warm) | 2667 ms | 2743 ms | PASS |

Una salida representativa del primer ciclo registró `durationMs=3014`,
`discoveryMs=351`, `classIndexMs=883`, `variableIndexMs=1650` y RSS pico aproximado
de 146 MB. La comparación de los reportes mantuvo los mismos hallazgos; el cambio solo
reduce el trabajo repetido de descubrimiento.

La línea base anterior del consumidor (`.quality-bench/baseline-small.json`) queda
conservada como evidencia histórica: VarSense cold 12.665 s e incremental 1 ms.
No se reemplaza esa medición; se añade esta muestra del commit correctivo para que el gate
posterior a la adopción vuelva a comprobar el SLO de 6 s.

## Estado actual y pendientes reales

- `quality:setup`, doctor, lock y gates pasan con Sentinel 0.7.4 en wandorius y en el worktree
  aislado de glory-rs-rest; la suite del segundo consumidor cerró 232/233 (1 omitida).
- La suite upstream 0.7.4 cerró 558 passing/1 pending; lint 0 errores/12 warnings; `npm audit --omit=dev`
  queda en 0. El audit completo mantiene 1 high + 1 moderate de Mocha como deuda separada.
- La corrección del transporte de perfiles explícitos evita `SETUP ERROR` cuando el cambio no pertenece
  al perfil solicitado; está cubierta por `observe-integration.test.mjs` y publicada en `glory-rs-rest@3cd9e655`.
- Capa A retirada después de verificar PATH completo/sin runtime de desarrollo, smoke de enforcement (exit 78)
  y rollback de salida según el runbook. La capa B no se elimina por ese mismo cambio.

## Histórico de lo que quedó abierto en 0.7.1/0.7.3

- La CI de `main` del upstream aún no cumple el criterio de dos ejecuciones consecutivas verdes: VarSense
  [#8 pasó](https://github.com/1ndoryu/varsense/actions/runs/31551341521), pero Sentinel
  [#39 falló](https://github.com/1ndoryu/glory-sentinel/actions/runs/31551339627); además, los runs
  [#36](https://github.com/1ndoryu/glory-sentinel/actions/runs/31372934670),
  [#37](https://github.com/1ndoryu/glory-sentinel/actions/runs/31379295222) y
  [#38](https://github.com/1ndoryu/glory-sentinel/actions/runs/31380898957) terminaron en failure.
- Completar las dos ejecuciones CI consecutivas y la matriz multi-shell exigidas por el runbook antes de
  retirar la capa A.
- Resolver por separado el baseline `broadcast-mutex-riesgo-rs` de glory-rs-rest; no es un defecto de
  instalación de Sentinel y no debe ocultarse degradando el gate.
- Resolver la deuda de dependencias del upstream: `npm audit --json` local reportó 10 high y 1 moderate
  en Sentinel 0.7.1; GitHub mostró 12 alertas en el push de `main`.
- Repinear, regenerar lock, doctor, gate y rollback ya están completados y registrados en la auditoría.
