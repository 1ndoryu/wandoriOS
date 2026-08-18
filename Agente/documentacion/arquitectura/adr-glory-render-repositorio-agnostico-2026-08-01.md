# ADR — `glory-render`: motor de juegos reutilizable

> **Fecha:** 2026-08-01
> **Estado:** propuesto; se ejecuta después de estabilizar GAME-01.
> **Ámbito:** motor agnóstico para futuros juegos, alojado dentro del workspace pero con repositorio Git propio.

## Contexto

El primer juego está aportando lógica pura reutilizable en `frontend/src/features/game-core/` (bounds, colisión, spatial hash, simulación determinista, snapshots e interpolación). Si se copia esa lógica para cada juego aparecerán divergencias, fixes duplicados y contratos incompatibles. El repositorio principal también contiene el OS, la identidad de wandori.us, cuentas, analytics y modelos de dominio que no deben entrar en un motor común.

## Decisión

Crear `glory-render/` dentro de `glory-rust-template/` como repositorio independiente. La carpeta se integra al proyecto principal mediante un contrato de paquete/submódulo explícito, no mediante copias ni imports profundos a sus archivos internos.

`glory-render` tendrá un núcleo independiente del OS, del juego y del backend, con adaptadores reemplazables:

```text
glory-render/
  packages/core/          # simulación, geometría, límites, snapshots, reloj
  packages/contracts/     # interfaces de input, cámara, mundo, renderer y lifecycle
  packages/three/         # adaptador Three.js; no es requisito del core
  packages/test-fixtures/ # mapas/escenarios deterministas pequeños
  examples/               # Bosque y un juego mínimo de conformidad
  docs/                   # API, versionado, migraciones y compatibilidad
```

El repositorio usará SemVer, changelog, fixtures de contrato y quality gate propio. `glory-rust-template` fijará una versión/commit de `glory-render`; una actualización se prueba en el juego consumidor antes de aceptarse.

## Límites

| Pertenece a `glory-render` | Permanece en wandori.us o en cada juego |
|---|---|
| Vectores, bounds, colisión, spatial hash, simulación fija, interpolación y snapshots | AppRegistry, WindowManager, taskbar, rutas del OS y presentación móvil |
| Contratos de input, cámara, renderer, reloj, lifecycle y consulta de mundo | Cuenta, invitado, permisos, salas, tickets, WebSocket y persistencia de negocio |
| Validación genérica de mapas/manifest con límites configurables | Esquema de Bosque, assets concretos, terreno editorial y reglas de publicación |
| Adaptadores Three.js y futuras implementaciones de renderer | Analítica con eventos de wandori.us, auditoría admin y comercio |
| Fixtures y vectores de prueba portables | UI, estilo visual, textos, personajes y decisiones de producto de un juego |

El core no importará DOM, Vite, Three.js, Axum, SQLx, `AppRegistry`, stores del OS, secrets ni endpoints. El adaptador puede depender del motor gráfico, pero no puede modificar el dominio de forma implícita.

## Integración y repositorio

- La carpeta física será `glory-rust-template/glory-render/`; su `.git` y remoto serán independientes.
- Cuando exista remoto, el proyecto principal la fijará como submódulo o referencia de commit; nunca se hará `git add` recursivo de su historial interno.
- Durante desarrollo se permitirá una dependencia local (`file:`/workspace) para iterar; CI y producción usarán un commit/artefacto fijado y reproducible.
- La carga de `glory-render` seguirá siendo lazy para que el OS no pague el coste del juego al iniciar.
- Cambios agnósticos se implementan primero en `glory-render`; los adaptadores específicos se quedan en el consumidor salvo que exista un segundo caso real.

## Compatibilidad y seguridad

- Los schemas y vectores deterministas son la frontera entre lenguajes; no se promete compartir implementación TypeScript/Rust hasta tener un segundo consumidor.
- Toda API pública documenta invariantes, límites, errores y coste esperado.
- Assets, scripts, shaders, URLs y datos de red nunca se ejecutan desde el core.
- El motor no conoce identidad ni autoridad: el servidor/consumidor valida antes de llamar a la simulación.

## Consecuencias

- Se evita duplicar lógica en futuros juegos y se puede actualizar un fix una sola vez.
- La extracción requiere una fase de inventario, API estable, pruebas de compatibilidad y una migración sin copias temporales.
- El primer repositorio puede contener solo core + adaptador Three; no se debe convertir prematuramente en un engine universal con editor, red o backend.

## Criterio para extraer algo

Una pieza solo entra en `glory-render` si es pura o tiene una interfaz aislada, no menciona wandori.us ni Bosque, tiene un segundo uso plausible y puede probarse con fixtures deterministas. Si solo existe para una decisión de producto, un endpoint, un asset o el shell del OS, permanece en el consumidor.
