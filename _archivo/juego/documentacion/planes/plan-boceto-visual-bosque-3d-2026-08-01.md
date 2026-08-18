# Plan — Segundo boceto visual Bosque 3D isométrico

> **ID de seguimiento:** `GAME-01-VIS-3D` (sin ID de tarea roadmap; `018A-91` pertenece al Finder).
> **Estado:** dirección 3D aprobada por el usuario; integración técnica validada, pendientes validaciones visuales de cierre y commit del prototipo.
> **Objetivo:** conservar evidencia del boceto que aprobó Three.js isométrico y cerrar su integración antes del renderer jugable.
> **Referencia:** `Agente/documentacion/producto/referencia-visual-bosque-2026-08-01.md`.

## Decisión de prototipo

- El primer programa `Bosque` y todos sus assets se conservan sin reemplazos.
- El segundo programa será `Bosque 3D`, registrado y cargado de forma independiente.
- Three.js se carga de forma lazy al abrir la app; no entra en el arranque del OS.
- La cámara empieza en vista isométrica y permite órbita con arrastre, zoom con rueda y restablecimiento mediante un único botón.
- Los objetos son primitivas low-poly provisionales: troncos, copas, pinos, rocas, agua, terreno y marcadores de escala.
- Los modelos finales serán aportados por el usuario y exportados como GLB; el OS los administra pero no edita su geometría.

## Límites

### Incluido

- [x] Escena 3D original monocroma inspirada en dibujo de tinta, sin calcar la referencia.
- [x] Cámara orbital real, limitada para conservar lectura isométrica y evitar perderse bajo el suelo.
- [x] ResizeObserver, pausa fuera de vista y teardown completo de render loop, listeners, controles y GPU.
- [x] Desktop/tablet en ventana y móvil a pantalla completa mediante el shell existente.
- [x] Estado vacío/error visible si WebGL no está disponible.
- [x] Comparación visual con el primer boceto y aprobación explícita del usuario.

### Excluido

- Personaje controlable, colisiones, físicas, inventario, gameplay o animación de mundo.
- Multijugador, WebSocket, salas, backend, base de datos, persistencia o editor admin.
- Importación, optimización o versionado de modelos finales.
- URL pública de sala, telemetría propia o contrato definitivo de cámara.

## Implementación por bloques

### A. Integración mínima

- [x] Añadir Three.js como dependencia runtime y registrar `game-3d` como app pública, singleton y full-bleed.
- [x] Añadir un segundo nodo al workspace sin mover ni borrar el primer `game`.
- [x] Mantener el módulo bajo límites SRP: vista/lifecycle, escena/composición/modelos y estilos separados.

### B. Dirección visual

- [x] Suelo claro con retícula/trama de tinta y borde de diorama.
- [x] Bosque con pinos angulares y árboles redondeados hechos de geometría simple.
- [x] Lagos planos oscuros, claro/camino, rocas y dos figuras abstractas para escala.
- [x] Materiales blanco, gris y negro; luz ambiental/direccional y sombras austeras.
- [x] HUD mínimo del OS: nombre del boceto, ayuda de cámara y botón `Recentrar`.

### C. Revisión real

- [ ] Verificar 1440×900 y 1024×768 con arrastre, zoom, resize, minimizar/restaurar y cerrar.
- [ ] Verificar 390×844 y 320px con interacción táctil y app a pantalla completa.
- [ ] Verificar tema claro/oscuro, reducción de movimiento, pérdida de WebGL y teardown.
- [x] Ejecutar pruebas dirigidas, type-check y build; Vitest dirigido: 18/18; consola sin errores en la apertura de `/forest-2d`.
- [ ] Ejecutar quality gate específico cuando GAME-01 tenga un ID de tarea habilitado; no reutilizar `018A-91` del Finder.

## Gate de salida

- [x] El usuario compara `Bosque` y `Bosque 3D` y elige Three.js 3D isométrico.
- [ ] Se documentan encuadre, densidad, escala, lenguaje geométrico y controles aprobados.
- [x] La decisión se registra en `adr-bosque-3d-assets-terreno-2d-2026-08-01.md`.
- [x] Ninguna lógica multijugador o de gameplay comenzó antes de esa decisión.

## Definition of Done

- Ambos bocetos siguen abribles como programas distintos.
- La cámara 3D responde con fluidez y no introduce listeners, RAF ni recursos GPU huérfanos al cerrar.
- Three.js permanece fuera del chunk inicial y el prototipo no conoce ventanas ni presentación móvil.
- El usuario puede revisar el resultado vivo en `npm run dev` y dar feedback sin que el boceto se confunda con una base definitiva.
