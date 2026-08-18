# Plan — Boceto visual ejecutable del Bosque

> **ID:** GAME-01-VIS
> **Estado:** primer boceto conservado para comparación; no aprobado como dirección final.
> **Objetivo:** abrir un programa real del OS y evaluar únicamente su identidad visual antes de diseñar lógica de juego.
> **Referencia:** `Agente/documentacion/producto/referencia-visual-bosque-2026-08-01.md`.

## Alcance

El programa `Bosque` abre con el runtime existente y muestra una escena cenital estática, original y responsive. Sirve para decidir composición, densidad, escala, lenguaje de árboles/agua/terreno, avatar y contraste dentro del OS.

### Incluido

- App lazy `game` con icono Lucide y contenido full-bleed.
- Escena estática HTML/SVG + CSS: dos tipos de árbol, agua, roca, claro/camino, avatar local y silueta remota de escala.
- Blanco/negro inicial, respetando tema claro/oscuro del OS sin perder lectura.
- Desktop/tablet en ventana y móvil a pantalla completa mediante el shell existente.
- Capturas y revisión del usuario con iteraciones visuales.

### Excluido

- Canvas animado, `requestAnimationFrame`, movimiento, controles, cámara o colisiones.
- WebSocket, salas, jugadores reales, login, backend, base de datos o persistencia.
- Editor admin, catálogo de assets, publicación, telemetría propia o lógica de gameplay.
- Uso directo, calco o distribución de la imagen de referencia.

## Composición del primer boceto

1. Fondo de papel/mapa con trama discreta.
2. Masa de coníferas más oscura en un lateral.
3. Grupo de árboles frondosos alrededor de un claro central.
4. Lago irregular y pequeño estanque para probar agua/trama.
5. Camino o apertura que guíe la lectura hacia el avatar.
6. Avatar local con contraste inequívoco y una figura remota secundaria.
7. Indicador mínimo de “boceto visual”; no habrá HUD de juego definitivo.

## Implementación mínima

- [ ] Registrar `game` mediante `registerLazy`; la app no conoce ventanas ni presentación móvil.
- [ ] Crear una vista estática con `MountedView` y teardown vacío/idempotente.
- [ ] Crear SVG original accesible con `title`/descripción y capas semánticas.
- [ ] Crear CSS dedicado que consuma tokens existentes; sin estilos inline ni decisiones visuales dispersas.
- [ ] Añadir el icono al workspace de demostración sin alterar otras posiciones publicadas.
- [ ] Verificar que cerrar/minimizar/restaurar usa el comportamiento normal del OS.

## Revisión visual

- [ ] 1440×900: escena completa, densidad y profundidad.
- [ ] 1024×768: composición en ventana más compacta.
- [ ] 390×844 y 320px: recorte/reencuadre móvil legible.
- [ ] Claro/oscuro, zoom 200% y contraste del avatar.
- [ ] Presentar al usuario y recoger cambios sobre árboles, agua, escala, densidad, paleta y UI.

## Gate de salida

- [ ] El usuario aprueba explícitamente el boceto dentro del OS.
- [ ] Las decisiones aprobadas se trasladan a la referencia visual/manual correspondiente.
- [ ] Se decide qué parte del SVG/CSS se conserva como asset conceptual y qué se reemplaza al pasar a Canvas.
- [ ] Solo después se habilita GAME-01 Fase 2 (ADR) y Fase 3 (renderer offline).

## Definition of Done

- Programa visible y abrible dentro del OS.
- Escena original, estática y responsive; ninguna lógica compleja añadida.
- No aumenta el arranque: el módulo visual carga al abrir la app.
- Type-check, prueba dirigida, quality gate y revisión real en navegador pasan.
- Referencia y feedback quedan documentados antes de avanzar.
