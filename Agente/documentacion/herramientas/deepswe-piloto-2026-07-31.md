# Piloto DeepSWE — tareas y ejecución

> **Fecha:** 2026-07-31  
> **Estado:** preparado; no ejecutado en este entorno  
> **Fuente:** [DeepSWE Run](https://deepswe.datacurve.ai/run)

## Objetivo

Preparar una ejecución pequeña y reproducible del benchmark DeepSWE sin modificar el repositorio `wandori.us`. DeepSWE no evalúa este repositorio directamente: usa 113 tareas originales, compatibles con Harbor, en repositorios open source separados y sandboxes aislados.

## Resultado del descubrimiento

La URL `/run` es documentación, no un formulario web. El flujo oficial usa **Pier**:

1. clonar el corpus `datacurve-ai/deep-swe`;
2. instalar `datacurve-pier`;
3. ejecutar un agente dentro de Docker o Modal;
4. extraer el parche del agente;
5. ejecutar el verificador en un entorno separado;
6. revisar los reportes generados.

El repositorio local no se modifica por el benchmark cuando Pier funciona con su aislamiento. Aun así, los jobs y las imágenes pueden consumir disco, tiempo y recursos de red.

## Piloto recomendado

### Opción A — subconjunto oficial reproducible

Es la opción preferida para comparar ejecuciones: Pier selecciona siempre el mismo subconjunto con la misma semilla.

En Windows, ejecutar este bloque desde **Git Bash o WSL**. Docker Desktop debe estar instalado y disponible para esa integración.

```bash
git clone https://github.com/datacurve-ai/deep-swe
cd deep-swe
uv tool install datacurve-pier

# Smoke test de infraestructura, sin llamadas a un modelo
pier run -p tasks --agent nop --n-tasks 10 --sample-seed 0 --env docker

# Ejecución real con OpenAI/Codex vía mini-swe-agent
export OPENAI_API_KEY="PEGA_LA_CLAVE_AQUI"
pier run -p tasks --agent mini-swe-agent --model openai/gpt-5.5 --n-tasks 10 --sample-seed 0 --env docker

# Alternativa real con Anthropic/Claude
export ANTHROPIC_API_KEY="PEGA_LA_CLAVE_AQUI"
pier run -p tasks --agent mini-swe-agent --model anthropic/claude-opus-4-8 --n-tasks 10 --sample-seed 0 --env docker
```

En PowerShell, usar `$env:OPENAI_API_KEY = "PEGA_LA_CLAVE_AQUI"` o `$env:ANTHROPIC_API_KEY = "PEGA_LA_CLAVE_AQUI"` antes del comando. No guardar claves en este repositorio ni en este documento.

> **Nota sobre coste:** `nop` verifica el pipeline sin resolver las tareas. Las ejecuciones con `mini-swe-agent` hacen llamadas al modelo y pueden generar costes. El piloto no debe ampliarse al corpus completo sin revisar presupuesto y tiempo.

### Opción B — cinco tareas explícitas para inspección

Estas rutas existen en el manifiesto `tasks/dataset.toml` del repositorio oficial. Se incluyen para poder inspeccionar instrucciones concretas sin depender de una selección aleatoria:

| Tarea                            | Área indicada por el nombre        | Ruta                                   |
| -------------------------------- | ---------------------------------- | -------------------------------------- |
| `abs-module-cache-flags`         | caché y flags de módulos en ABS    | `tasks/abs-module-cache-flags`         |
| `abs-stepped-slices`             | slices escalonados en ABS          | `tasks/abs-stepped-slices`             |
| `actionlint-action-pinning-lint` | lint de pinning de acciones        | `tasks/actionlint-action-pinning-lint` |
| `adaptix-name-mapping-aliases`   | aliases y mapeo de nombres         | `tasks/adaptix-name-mapping-aliases`   |
| `aiomonitor-task-snapshots-diff` | diferencias de snapshots de tareas | `tasks/aiomonitor-task-snapshots-diff` |

Antes de ejecutar una tarea explícita, revisar su `instruction.md`, `task.toml` y `environment/Dockerfile`:

```bash
cd deep-swe

# Inspección no ejecutable
cat tasks/abs-module-cache-flags/instruction.md
cat tasks/abs-module-cache-flags/task.toml

# Smoke test sin modelo para una tarea
pier run -p tasks/abs-module-cache-flags --agent nop --env docker

# Ejecución real de una tarea
pier run -p tasks/abs-module-cache-flags --agent mini-swe-agent --model openai/gpt-5.5 --env docker
```

Las otras cuatro se ejecutan sustituyendo la ruta por la correspondiente. El nombre de la tarea no sustituye a la instrucción: el prompt verificable es siempre el `instruction.md` incluido en el corpus.

## Modal como alternativa

Si Docker local no está disponible y se dispone de una cuenta/configuración de Modal, Pier permite usar sandboxes remotos:

```bash
pier run -p tasks --agent mini-swe-agent --model openai/gpt-5.5 --n-tasks 10 --sample-seed 0 --env modal
```

Modal puede requerir configuración adicional y también puede generar costes. No se ha configurado ni usado en esta preparación.

## Salidas esperadas

Pier deja los jobs bajo `jobs/<timestamp-or-name>/<trial-id>/`. Para cada trial, revisar como mínimo:

- `verifier/reward.json`: reward binario y fracciones de pruebas;
- `verifier/ctrf.json`: reporte estructurado de tests;
- `verifier/test-stdout.txt`: salida de la suite y razones de fallo;
- `verifier/run.log`: stdout/stderr completo;
- `verifier/reports/`: reportes nativos del framework.

El resultado de `nop` solo valida el arranque y el pipeline; no es una puntuación válida de capacidad de resolución.

## Bloqueo de esta preparación

La ejecución no se lanzó porque este entorno no tiene:

- `uv`;
- `pier`;
- `docker`;
- `OPENAI_API_KEY` ni `ANTHROPIC_API_KEY`.

Por tanto, no hay resultados ni costes registrados. Para ejecutar el piloto hace falta instalar/configurar esas dependencias y elegir un único proveedor de modelo. La clave debe proporcionarse mediante una variable de entorno local, nunca dentro del repositorio.

## Fuentes consultadas

- [Guía oficial de ejecución](https://deepswe.datacurve.ai/run)
- [README oficial de DeepSWE](https://github.com/datacurve-ai/deep-swe/blob/main/README.md)
- [README oficial de Pier](https://github.com/datacurve-ai/pier/blob/main/README.md)
- [Manifiesto de tareas](https://github.com/datacurve-ai/deep-swe/blob/main/tasks/dataset.toml)
