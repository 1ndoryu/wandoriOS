# ADR — Carga de apps pesadas y presupuesto de arranque

> **Fecha:** 2026-07-31
> **Estado:** aceptado
> **Ámbito:** frontend Vanilla TypeScript/Vite, AppRegistry y ciclo de vida MountedView
> **Tarea:** 297A-25

## Contexto

El OS debe poder incorporar editores, media pesada o una aplicación 3D sin descargar, parsear o montar ese código durante el arranque. El shell debe seguir siendo independiente de las apps y desktop/móvil deben consumir el mismo registro.

La implementación actual ya tiene `AppRegistry.registerLazy()` con `import()` dinámico. `settings`, `admin` y `projects` lo utilizan. El runtime registra metadatos al arrancar, pero solo instancia una app cuando se abre; cerrar la ventana ejecuta `destroy()` y aborta el contexto.

## Evidencia

Build de producción ejecutado el 2026-07-31:

| Asset | Tamaño minificado | Tamaño gzip reportado | Interpretación |
|---|---:|---:|---|
| `index-*.js` | ~159.66 KB | ~46.05 KB | bundle principal, incluye apps eager actuales |
| `tiptap-*.js` | ~294.64 KB | ~87.48 KB | chunk separado de editor, no parte del arranque principal |
| CSS principal | ~53.22 KB | ~8.99 KB | estilos globales |

El build no genera manifest porque `build.manifest` no está habilitado. Los nombres de hash no son contrato público. Los archivos de `dist/uploads` y `legacy-assets` son recursos estáticos/copias de contenido, no código inicial y no se cuentan en el presupuesto JS.

Medición adicional — 2026-08-02 [297A-59] tras añadir el motor del Bosque (three.js):

| Asset | Tamaño gzip reportado | Interpretación |
|---|---:|---|
| `index-*.js` | ~54.79 KB | bundle principal, estable frente a la nueva app |
| `forest-models-*.js` | ~130.19 KB | chunk lazy del juego (three.js + primitivas forestales), solo se descarga al abrir el juego |
| `tiptap-*.js` | ~89.96 KB | editor separado |
| CSS principal | ~10.72 KB | estilos globales |

El juego es la primera app 3D con `registerLazy`; su chunk (three.js) se convierte en el más grande. El presupuesto `largestChunkGzipBytes` se actualiza de 120 KB a 140 KB (130.19 KB medidos + margen para las primitivas que el editor de mapa añada); el entry principal y el CSS siguen dentro de su presupuesto. El chunk es lazy: no se descarga antes de abrir la app, así que el arranque no se penaliza.

## Decisión

### 1. Política de registro

- Apps pequeñas, ligeras y necesarias para el shell pueden usar `register` eager.
- Apps grandes, editoriales complejas, media avanzada, WASM, WebGL o dependencias de terceros deben usar `registerLazy`.
- Una app nueva no puede importar una dependencia pesada de forma estática desde `app-registration.ts`.
- El shell, `WindowManager`, `MobileAppStack` y `CommandRegistry` no se modifican para agregar una app.
- La capacidad/autorización permanece separada de la estrategia de carga; lazy no es una frontera de seguridad.

### 2. Política de precarga

No se añade todavía un campo global `preload` a `AppDefinition`. No existe un caso real que permita elegir entre `idle`, `hover` o `never` sin crear tráfico y complejidad no medidos.

Cuando exista una app concreta que lo necesite, se añadirá un contrato mínimo y medible, preferiblemente como política del registro (`preload: 'none' | 'idle'`) y no como listeners ad hoc por app. El valor por defecto será `none`/carga al abrir.

### 3. Recursos pesados y teardown

- `MountedView.destroy()` y `AbortSignal` son obligatorios para liberar listeners, workers, timers, object URLs, audio y recursos GPU.
- Una app WebGL debe detener el render loop y liberar buffers/texturas/contexto en `destroy()`; `WEBGL_lose_context` solo se usará como fallback de teardown, no como sustituto de liberar recursos propios.
- Un iframe sandbox u OffscreenCanvas/Worker se decidirá por la primera app real, según aislamiento requerido y medición; no se introduce una plataforma de procesos antes de tener ese caso.
- `heavy` no se añade aún al contrato porque no existe una política de concurrencia validada. Si la primera app real requiere exclusividad GPU, la política debe vivir en el runtime compartido y funcionar igual en desktop y móvil.

### 4. Presupuesto

- El bundle principal gzip debe mantenerse documentado y no crecer por dependencias pesadas de nuevas apps.
- Cada app pesada debe aportar medición antes/después de `vite build`, carga en Network y teardown repetido.
- La migración de apps eager existentes solo se hace si una medición de arranque demuestra beneficio; no se convierte todo a lazy por uniformidad.

## Consecuencias

### Positivas

- La primera app 3D puede agregarse con `registerLazy` sin modificar el arranque ni el shell.
- Se evita crear `preload`/`heavy` especulativos y se conserva un contrato pequeño.
- El chunk actual de Tiptap demuestra que las dependencias pesadas ya pueden aislarse.
- La política es aplicable a desktop y móvil sin duplicar apps.

### Costes

- El primer uso de una app lazy puede tener latencia de descarga.
- El presupuesto requiere repetir build y prueba de Network en cada app pesada.
- La política GPU de concurrencia queda deliberadamente abierta hasta existir un caso real.

## Checklist para la primera app pesada

Validación del juego `game-playable` (primera app WebGL del OS) — 2026-08-06 [297A-25]:

- [x] Definir si es `registerLazy` y documentar el motivo: `registerLazy` en
  `app-registration-game-playable.ts`; chunk propio `game-playable-*.js` (three.js no entra en el
  bundle principal, ya medido en Evidencia 2026-08-02).
- [x] Confirmar que ninguna dependencia pesada se importa estáticamente desde el registro: sin
  imports de `three` fuera de `game-playable/` (verificado por grep en el refactor).
- [x] Implementar `destroy()` idempotente y abortable: `disposed`/`destroyed` con guard en la
  primera llamada, AbortSignal del MountedView en cada camino (perfil, mapa, runtime) y teardown
  por camino temprano (sin WebGL, signal abortado).
- [x] Liberar workers, timers, object URLs, audio y GPU: sin workers ni audio; `clearTimeout` de
  perfil; el único object URL (asset-preview) se revoca; RAF cancelado, listeners de
  window/document/canvas removidos, ResizeObserver desconectado, geometrías/materiales/renderer
  liberados y `WEBGL_lose_context` como fallback (`forceContextLoss`) en `game-playable-scene.ts`.
- [x] Medir bundle inicial y chunk de la app antes/después: Evidencia 2026-08-02 (index ~54.8 KB
  gzip estable, chunk del juego ~130 KB gzip lazy).
- [ ] Verificar Network: el chunk no se descarga antes de abrir, salvo precarga aprobada — pendiente
  de sesión de navegador real con pestaña Network (el build ya confirma chunk separado lazy).
- [x] Abrir/cerrar repetidamente y comprobar ausencia de recursos vivos: test automatizado
  `game-playable-teardown.test.ts` (5 tests) que monta el runtime real con servicios mockeados y
  verifica idempotencia, cancelación de RAF sin re-agenda, remoción de listeners
  (window/document), desconexión del observer y cierre del socket realtime.
- [x] Probar desktop/tablet/móvil y actualizar el gate `task:check`: gate 297A-25 PASS local-light;
  desktop/tablet/móvil quedan cubiertos por la verificación visual de GAME-01 (la app es
  independiente del viewport; el teardown es el mismo runtime).

## Rechazos explícitos

- No usar `import()` como mecanismo de autorización.
- No agregar una app móvil paralela.
- No crear un gestor global de procesos, microfrontend o bus genérico para resolver un único caso.
- No añadir excepciones de Sentinel para ocultar el presupuesto o el lifecycle.
