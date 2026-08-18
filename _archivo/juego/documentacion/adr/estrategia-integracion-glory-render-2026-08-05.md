# Estrategia de integración y versionado — `glory-render` (Fase 0)

> **Fecha:** 2026-08-05 · **Epic:** GAME-02 · **Plan:** `Agente/planes/plan-glory-render-motor-juegos-2026-08-01.md`
> **ADR:** `Agente/documentacion/arquitectura/adr-glory-render-repositorio-agnostico-2026-08-01.md`
> **Auditoría:** `Agente/documentacion/arquitectura/auditoria-glory-render-fase0-2026-08-05.md`
> **Objetivo:** concretar la elección de integración inicial y la política de licencias, versionado,
> changelog, CI, quality gate y propietarios, para poder abrir la Fase 1 sin ambigüedad.

## 1. Integración inicial: submódulo fijado por commit + dependencia local en desarrollo

Decisión (coherente con el ADR §"Integración y repositorio"):

- **Producción/CI:** `glory-rust-template` fija `glory-render/` como **submódulo Git anclado a un commit**
  (etiqueta SemVer `vX.Y.Z` como referencia canónica; el commit es el artefacto reproducible).
  Nunca `git add -A` recursivo ni copias del historial interno.
- **Desarrollo:** dependencia local `file:`/workspace del paquete `@glory-render/core` (y `@glory-render/three`)
  para iterar sin publicar; la transición a remoto fijado ocurre solo cuando exista remoto.
- **Carga lazy:** el OS no paga el coste del motor al iniciar; `glory-render` entra bajo demanda (mismo
  patrón que la app Bosque con `MountedView`).
- **Actualización/rollback (procedimiento):**
  1. Actualizar el submódulo a la nueva etiqueta/commit.
  2. Correr la suite de vectores del consumidor (Bosque) + gate local.
  3. Verificar navegador (escena, editor, teardown) y budgets.
  4. Si algo regresa: volver al commit anterior (`git submodule update --checkout <prev>`), documentar
     la incompatibilidad y corregir en `glory-render` antes de reintentar.

## 2. Política de licencias

- `glory-render` se publica como **código propio** del proyecto (misma política que el workspace; no se
  empaqueta ni distribuye fuera). Sin dependencias de assets con licencias restrictivas.
- Todo archivo fuente lleva la cabecera estándar del proyecto (`/* <paquete> — ... */`) sin texto de
  licencia duplicado; la licencia vive en `LICENSE` del repo del motor y en `package.json` (`license`).
- No se incorporan deps de runtime mutables; las devDeps (type-check/test) se congelan por lockfile.

## 3. Versionado SemVer

- `0.x` durante la extracción y hasta tener dos consumidores reales y API estable.
- `1.0` solo cuando: (a) dos juegos consumen por contrato público, (b) API/límites/errores/lifecycle
  compatibles, (c) changelog + matriz de compatibilidad + rollback probados (Fase 5 del plan).
- Reglas de bump:
  - **MAJOR:** breaking change en exports públicos, contratos, invariantes o cuotas por defecto.
  - **MINOR:** nueva capacidad aditiva con vectores (nuevo helper, nuevo campo opcional).
  - **PATCH:** fix sin cambiar el contrato.
- El commit del submódulo se etiqueta con la versión (`v0.1.0`, ...) y el changelog se actualiza en el
  mismo commit.

## 4. Changelog y compatibilidad

- `CHANGELOG.md` por versión: añadido/cambiado/corregido/retirado, con enlace al commit y nota de
  migración cuando aplique.
- `docs/compatibility.md`: matriz de versiones del motor frente a consumidores (Bosque, segundo juego),
  deprecaciones y procedimiento de actualización/rollback.
- Cualquier cambio que altere vectores deterministas (simulación, colisión, streaming) exige
  re-ejecutar los fixtures del consumidor y registrar el cambio en el changelog.

## 5. CI y quality gate propio

- Gate independiente del repo del motor (mismo patrón que el orquestador del workspace):
  type-check, tests de vectores, lint, Sentinel (con reglas del motor, no del OS), VarSense si aplica,
  y budgets de tamaño (tree-shaking de solo `core`).
- En CI: ejecución full; en local: incremental con cooldown (misma filosofía que SNT-11: sin saltar
  ejecuciones pesadas sin justificación auditada).
- El consumidor (wandori.us) mantiene su propio gate; el motor nunca corre el gate del OS.

## 6. Propietarios y revisión

- **Propietario del motor:** quien ejecute GAME-02 (agente principal del bloque); decisiones de API y
  extracción requieren revisión del plan + ADR antes de mover código.
- Toda extracción nueva se propone con: módulo fuente, segundo uso plausible, vectores deterministas y
  frontera (qué permanece en Bosque). Sin segundo caso real, no se abstrae (criterio del plan).
- Cambios agnósticos se implementan primero en `glory-render` y se consumen desde Bosque por exports
  públicos; los adaptadores específicos viven en el consumidor salvo segundo caso real.

## Estado

- [x] Auditoría de la Frontera 0 (inventario/clasificación).
- [x] Estrategia de integración (submódulo fijado + local dev) — este documento.
- [x] Política de licencias, SemVer, changelog, CI/gate y propietarios — este documento.
- [ ] Aprobación de la frontera y lista de piezas extraíbles con evidencia de segundo uso (gate F0) —
  pendiente de la decisión del segundo juego y de la revisión del plan.
- [ ] Fase 1: crear `glory-render/` con `.git` propio, README, licencia, package.json, tsconfig y gate.
