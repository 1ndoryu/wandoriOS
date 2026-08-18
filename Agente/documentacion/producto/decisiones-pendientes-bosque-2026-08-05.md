# Decisiones de producto pendientes — Bosque (GAME-01)

> **Fecha:** 2026-08-05
> **Origen:** Fase 0 y sección 12 de `Agente/planes/plan-juego-bosque-multijugador-2026-08-01.md`.
> **Uso:** checklist único para confirmar las decisiones de producto que bloquean el cierre
> formal de GAME-01. Nada de esto bloquea el código ya entregado; son confirmaciones para
> cerrar el DoD y guiar las fases futuras (9 en particular).

---

## 1. Referencia visual como atmósfera

**Estado:** ✅ **DECIDIDO (2026-08-05)** — la imagen es del usuario / tiene licencia, por lo
que puede usarse como base de assets con más libertad.

**Contexto:** la imagen `referencias/bosque-tinta-mapa-2026-08-01.png` es propiedad del usuario
(autoría/licencia confirmada). El plan ya no exige tratar la referencia como simple moodboard:
los assets pueden reinterpretarla o derivarse de ella con más libertad, manteniendo la
disciplina de no incrustarla como textura/sprite/tileset literal si no se desea.

**Resultado:**
- [x] Confirmar que la referencia se usa como atmósfera y no como asset para copiar → **se puede
  usar más libremente como base de assets** (decisión del usuario).
- [x] Confirmar que los elementos del boceto serán originales → los ya implementados (fixture y
  modelos 297A-30/33) siguen siendo originales; con la licencia confirmada se permite derivar
  de la referencia en assets futuros.
- [x] Registrar la licencia concreta en la referencia (`referencia-visual-bosque-2026-08-01.md`)
  para que quede constancia de la propiedad → se añadió la sección "Licencia y autoría"
  (propiedad del usuario confirmada el 05-ago).

## 2. Gramática visual

**Estado:** ✅ **DECIDIDO (2026-08-05)** — dirección visual cambiada por el usuario:

- **Estilo:** low poly **intermedio-bajo**, **verde stylized muy colorido**, como referencia
  visual estilo *Genshin Impact* (solo como referencia de estilo; no se incrustan assets de
  ese juego).
- **Cámara:** libre y movible como la de *Genshin Impact* (órbita controlada por el jugador);
  sustituye la cámara isométrica limitada del ADR.
- **Paleta:** verde con color stylized colorido (sustituye la dirección de tinta monocroma).
- **Detalle poligonal:** low poly intermedio-bajo (no flat-shading extremo ni alta densidad).

**Impacto:**
- [x] Actualizar `referencia-visual-bosque-2026-08-01.md` con la nueva dirección (verde
  stylized + cámara libre + Genshin como referencia de estilo).
- [x] Actualizar el ADR de Bosque: decisión de cámara (libre tipo Genshin), materiales
  (paleta verde stylized) y presupuesto de polígonos para low poly intermedio-bajo.
- [x] Ajustar el fixture/runtime a la nueva cámara y paleta — **implementado** (commit
  `e9d7e09d`): paleta verde stylized + cielo en runtime y preview del editor, cámara
  orbital libre (drag azimuth/polar, rueda/pinch zoom) con clamps, niebla y radio de
  streaming adaptativos al zoom, controles táctiles solo en móvil y fix de layout móvil
  (`100dvh`). Validado en navegador (píxeles verdes tipo Genshin, drag gira la cámara,
  D-pad visible solo <768px), gate 297A-77 PASS y 688/688 tests frontend.
- [ ] Contraste de estados (jugador local/remotos, selección, colisiones) con la nueva paleta.
- [ ] Modo oscuro y `prefers-reduced-motion` (sin movimiento parpadeante).

## 3. Capturas y aprobación visual

**Estado:** revisión del fixture actual realizada (05-ago).

- [x] Revisar el fixture actual (`/forest-playable`) — se mostró al usuario la captura del
  fixture en tinta; **se retiraron los bocetos Bosque y Bosque 3D** (game/game-3d) por
  decisión del usuario.
- [ ] Iterar densidad, escala, árboles, agua, avatar y contraste con la **nueva paleta verde
  stylized** y aprobación explícita de las capturas finales. La paleta y la cámara orbital
  ya están aplicadas y validadas en navegador (commit `e9d7e09d`); falta solo la aprobación
  artística final del usuario sobre capturas.

> La validación técnica del fixture ya está cerrada (05-ago): WebGL2, GPU Intel Iris Xe y
> personaje `forest-scout`. Esta casilla es la aprobación de **dirección artística**, no de funcionamiento.

## 4. Salas y mapa

**Estado:** ✅ **DECIDIDO (2026-08-05)** — **sin salas: un solo mapa único** para todos los
jugadores.

- Todos los jugadores comparten **un único mundo/mapa** (no hay salas separadas ni
  matchmaking ni instancias con cap 8 por sala).
- **Capacidad:** al ser un mundo único, la escala de jugadores simultáneos debe revisarse
  (el cap 8 actual era por sala; ahora el límite es global del mundo).

**Impacto en arquitectura (pendiente de planificar):**
- [ ] Revisar `GameRoomState` (multi-sala por `map.map_version()`, 297A-44/75) para un mundo
  único compartido.
- [ ] Definir el límite global de jugadores simultáneos y el presupuesto de snapshot/fanout
  para ese mundo único (el interés por proximidad ya existe).
- [x] Actualizar el plan, el ADR y el roadmap con la decisión → el roadmap ya no describe
  "salas de hasta 8" (objetivo = mundo único compartido), la sección 12 del plan marca las
  decisiones 1-6 como decididas y se creó
  `adr-bosque-mundo-unico-reinicio-coordinado-2026-08-05.md`.

## 5. Dirección cromática

**Estado:** ✅ **DECIDIDO (2026-08-05):**

- **Vegetación:** verdes saturados tipo Genshin (prados brillantes, follaje vivo).
- **Jugadores:** **sin distinción por color** — todos los jugadores usan el mismo esquema;
  los estados (selección, colisión, conexión) se comunican por otro medio si es necesario.
- **Agua/cielo:** aguas azules stylized y cielo despejado.
- El chrome del OS permanece monocromo; solo el contenido del juego usa la paleta verde stylized.
- **Implementación:** aplicada en runtime y preview del editor (commit `e9d7e09d`) —
  `MeshToonMaterial` en verdes (ink 0x2f6b2f, paper 0x7fbf4f, pale 0xa8d98a, middle 0x5a9e4b),
  agua 0x3d8bcd, líneas 0x1e4620 y cielo 0x87ceeb con luz hemisférica cálida.

## 5.1 Assets temporales

**Estado:** ✅ **DECIDIDO (2026-08-05)** — los assets que genere el agente (modelos low poly,
terreno, figuras) son **temporales/provisionales**; el usuario los reemplazará después por los
reales. Consecuencias:
- Los assets provisionales deben ser fáciles de sustituir sin romper contratos: se referencian
  por `assetVersionId`/categoría (catálogo de assets 297A-60/72), no por rutas internas.
- No invertir en pulir los provisionales; priorizar que el pipeline de importación/reemplazo
  (Assets 3D, 297A-72/73) funcione con los definitivos.
- Los fixtures y modelos del juego (`forest-models.ts`, fixture del mapa) pueden actualizarse a
  la nueva paleta sin afectar el contrato de mapa ni la autoridad server-side.

## 6. Controles y adaptación por dispositivo

**Estado:** ✅ **DECIDIDO (2026-08-05):**

- **Desktop/tablet (≥768):** **no se muestran los controles táctiles** — solo teclado
  (WASD/flechas) y ratón (drag para cámara).
- **Móvil (<768):** se muestran los controles táctiles (D-pad/joystick + cámara táctil).
- La visibilidad de los controles se condiciona al breakpoint del OS (misma presentación
  desktop/móvil ya existente en el runtime).

**Impacto:** ✅ **implementado** (commit `e9d7e09d`): el D-pad se oculta en desktop (base
`display: none`) y se muestra solo en <768px con el breakpoint del OS; el fixture ocupa
`100dvh` en móvil para que el canvas no se estire. Sin lógica duplicada (solo CSS).

## 7. Persistencia del invitado

**Estado:** ✅ **DECIDIDO (2026-08-05)** — se confirma la política actual (297A-51/76):

- El invitado es **efímero**: cookie `guest_game` con TTL de 2 h, revocada al autenticarse.
- Nada se transfiere de invitado a cuenta; el perfil de la cuenta (nombre + personaje) aplica
  al iniciar sesión.

## 8. Publicación en vivo de mapas

**Estado:** ✅ **DECIDIDO (2026-08-05)** — **transición coordinada con aviso de reinicio**.

- Al publicar una versión nueva del mapa, **el servidor avisa a todos los jugadores que el
  mundo se reiniciará en 5 minutos** (mensaje/evento broadcast).
- Tras la cuenta atrás, el mundo migra a la versión nueva de forma coordinada.
- No se mantienen salas con snapshots inmutables antiguos (reemplaza la decisión previa de
  "solo salas nuevas").

**Impacto en arquitectura (pendiente de planificar):**
- [x] Añadir el evento de aviso de reinicio (p. ej. `server_restart` con cuenta atrás) al
  contrato realtime v1 y al cliente → implementado: `server_restart` en `game-realtime.rs`
  (Rust) y `game-realtime.ts` (TS) con motivo bounded (200) y cuenta atrás 1..=3600 s,
  validación fail-closed en ambos stacks, tests en ambos lados y callback `onServerRestart`
  en `game-realtime-client.ts`.
- [ ] Implementar la cuenta atrás de 5 min y la migración coordinada en el servidor al publicar.
  → planificado como **297A-78** en `Agente/planes/plan-reinicio-coordinado-bosque-2026-08-05.md`
  (Fases 1-3: broadcast, trigger+drenaje, verificación); la **UX del aviso en el cliente** quedó
  implementada (banner de cuenta atrás `game-restart-notice.ts`, 6 tests, cableado a
  `onServerRestart`).
- [x] Revisar el runbook de rollback (297A-75) con la nueva política → `runbook-rollback-juego-2026-08-05.md`
  actualizado: la publicación es una transición coordinada (aviso 5 min + migración), sin salas
  con snapshots antiguos; el rollback también dispara la transición (impacto global tras la
  cuenta atrás).

## 9. Escalado futuro

**Estado:** ✅ **DECIDIDO (2026-08-05)** — **single-instance** para la primera versión.

- Un solo servidor con el mundo único; si se requieren réplicas, se elegirá
  almacenamiento/coordinación realtime en un ADR aparte.

---

## Resumen para confirmar de una vez

| # | Decisión | Alternativas | Recomendación |
|---|---|---|---|
| 1 | Referencia visual | Atmósfera vs asset | ✅ Base de assets (licencia del usuario) |
| 2 | Gramática visual | — | ✅ Low poly verde stylized (Genshin como referencia) + cámara libre |
| 3 | Capturas/aprobación | — | Revisado fixture actual; falta aprobar la paleta verde final |
| 4 | Salas/mapa | Única vs instancias | ✅ Un solo mapa único para todos |
| 5 | Cromática | — | ✅ Verdes saturados Genshin, sin distinción por jugador, agua azul/cielo |
| 5.1 | Assets | Temporales vs definitivos | ✅ Temporales; el usuario pone los reales después |
| 6 | Controles | Por dispositivo | ✅ Táctiles solo en móvil; teclado/ratón en desktop |
| 7 | Invitado | Perder vs reclamar | ✅ Confirmado: efímero (297A-76) |
| 8 | Publicación | Solo salas nuevas vs transición | ✅ Coordinada con aviso de reinicio en 5 min |
| 9 | Escalado | Single-instance vs réplicas | ✅ Single-instance |
