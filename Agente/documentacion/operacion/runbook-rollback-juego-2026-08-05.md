# Runbook — Rollback de versión de mapa y assets del Bosque

> **Fecha:** 2026-08-05
> **Fase:** GAME-01 / Fase 8 (hardening y operación)
> **Alcance:** rollback de una publicación de mapa (`game_map_versions`) y de un
> asset 3D (`game_asset_versions`) sin romper partidas activas. Deploy de la
> aplicación queda fuera de alcance (solo Coolify Manager cuando se autorice).
> **Aplicable a:** primera instancia single-process documentada en GAME-01.

## 1. Principios

1. **Los snapshots publicados son inmutables.** Nunca se edita una versión
   activa en la base; el rollback es *publicar una versión anterior ya
   persistida* (o el borrador/fixture base), no mutar el historial.
2. **La publicación es una transición coordinada (decisión 8, 05-ago).** Al
   publicar, el servidor difunde `server_restart` con cuenta atrás de 5 min;
   tras ella el mundo migra a la versión nueva y los jugadores se reconectan
   con un ticket nuevo. No se mantienen salas con snapshots antiguos; el
   drenaje al expirar la cuenta recrea las salas con la versión nueva.
3. **La versión activa es única.** `idx_game_map_versions_active` y la
   activación transaccional garantizan que activar v2 desactiva v1 y viceversa.
4. **Los assets usan versiones inmutables content-addressed.** Revertir un
   asset = re-activar una versión anterior (`activate`); el archivo GLB por
   hash permanece intacto y las publicaciones antiguas no cambian.
5. **Rollback = publicar la versión buena.** Como toda publicación, un rollback
   dispara la transición coordinada: los jugadores reciben el aviso y migran
   juntos, sin partidas a medias en la versión dañada.

## 2. Diagnóstico (antes de tocar nada)

```bash
# Qué versión de mapa está activa hoy y su auditoría
curl -s http://localhost:3000/api/workspace/release | jq .            # release del OS (no el mapa)
curl -s "http://localhost:3000/api/admin/game/maps" ...               # listado admin de mapas (si existe)
curl -s "http://localhost:3000/api/game/maps/{map_id}" | jq .version  # versión pública activa
curl -s -H "x-csrf-token: ..." -b session_id=... \
  "http://localhost:3000/api/admin/game/audit/maps?entityId={map_id}" | jq  # historial de publicaciones
```

Confirmar:

- **Síntoma:** tras publicar (o tras el rollback), el contenido visible es
  incorrecto o el mundo quedó en una versión rota. Las partidas en curso ya
  no se conservan: la publicación migró a todos (decisión 8).
- **Huérfanos:** ninguna versión nueva puede haber sido publicada *después* del
  incidente con datos del borrador corrupto; si existen, documentar antes de
  activar una versión anterior.
- **Assets:** si el problema es un GLB con metadata/proxy incorrecto, el
  rollback es por asset (`activate` de una versión anterior), no global.

## 3. Rollback de una versión de mapa

### 3.1 Preparación

1. Abrir `Editor de mapa` en la app Bosque (admin) y cargar el estado actual.
2. Identificar la versión buena: normalmente `active - 1` (o la última que se
   verificó en navegador). El listado de auditoría `map.published` da el orden.
3. Si el borrador actual contiene el cambio dañino, **no publicarlo**; el
   rollback puede conservar el borrador intacto para análisis.

### 3.2 Reposición de la versión buena

El backend no expone todavía `POST /api/admin/game/maps/:id/rollback`; el
rollback se realiza publicando de nuevo el documento de la versión buena:

1. Cargar el snapshot JSONB de la versión buena (`game_map_versions`).
2. Validarlo localmente con el mismo contrato `MapVersion`
   (`validateMapVersion` / validación server-side).
3. Publicar con `POST /api/admin/game/maps` (AdminUser + CSRF) usando ese
   documento como borrador → `publishMap`. La publicación activa queda en la
   versión buena; el hash canónico y la activación atómica son idénticos al
   flujo normal.
4. Verificar `GET /api/game/maps/{map_id}`: devuelve la versión buena y su
   `contentHash`.

> **Nota:** publicar con el mismo documento crea una *versión nueva* con el
> mismo contenido (los snapshots son inmutables y únicos por diseño). El
> contenido visible es el correcto aunque el número de versión avance. No se
> edita SQL directamente salvo emergencia documentada (ver §6).

### 3.3 Verificación

```bash
curl -s "http://localhost:3000/api/game/maps/{map_id}" | jq '{version, contentHash, bounds}'
# Navegador: abrir Bosque → la sala nueva usa el contenido de la versión buena.
# Navegador: verificar el terreno/instancias/spawn esperados y que el editor
# muestra la versión activa correcta.
```

### 3.4 Post-rollback

- Registrar en `game_audit_events` (el flujo de publish ya lo hace con
  `map.published`).
- Documentar en completados: qué versión activó el incidente, qué se revirtió,
  qué queda del borrador dañino (se conserva para análisis).
- Si el incidente fue por validación insuficiente, abrir tarea de prevención.

## 4. Rollback de un asset 3D

1. En `Assets 3D` (configuración del Bosque → tab assets → versiones del
   asset): localizar la versión activa y la versión buena anterior.
2. **Re-activar la versión buena**: `PUT /api/admin/game/assets/:id/versions/:version/activate`
   (AdminUser + CSRF). La activación única desactiva la actual y congela la
   buena; el GLB por hash no se toca.
3. Verificar `GET /api/admin/game/assets/:id/versions` y el contrato público
   `{assetId}-v{version}`.
4. Si la metadata (proxy circle/aabb + scale) era el problema, editar primero
   la versión buena inactiva (permitido: solo inactivas) y después activarla.

> Los mapas publicados referencian `assetVersionId`; re-activar una versión
> anterior **no cambia** los mapas ya publicados (conservan su referencia).
> Los mapas nuevos usan la versión re-activada.

## 5. Reglas de no-hacer

- ❌ No `UPDATE`/`DELETE` directo sobre `game_map_versions` ni
  `game_asset_versions` activas: los triggers de inmutabilidad lo bloquean a
  propósito y saltarlos rompe la garantía de salas estables.
- ❌ No activar dos versiones a la vez (índice único parcial lo impide).
- ❌ No publicar/activar una versión dañada a sabiendas: la transición
  coordinada migra a TODOS los jugadores (decisión 8), no solo a salas nuevas;
  el impacto de una publicación mala es global e inmediato tras la cuenta atrás.
- ❌ No eliminar el borrador dañino antes de extraer la causa raíz.
- ❌ Deploy/restart vía SSH/Docker directo: solo `coolify-manager-rs` cuando se
  autorice.

## 6. Emergencia documentada (SQL directo)

Solo si la publicación falla y hay que restaurar lectura pública:

```sql
-- 1. Ver la versión activa y su hash
SELECT version, content_hash, is_active FROM game_map_versions
WHERE map_id = 'tu-mapa' ORDER BY version DESC LIMIT 5;

-- 2. Activar la versión buena en una transacción (el índice único parcial
--    exige desactivar primero; el servicio normal ya lo hace atómicamente).
BEGIN;
UPDATE game_map_versions SET is_active = false
 WHERE map_id = 'tu-mapa' AND is_active;
UPDATE game_map_versions SET is_active = true
 WHERE map_id = 'tu-mapa' AND version = {buena};
COMMIT;
```

Después de la emergencia: abrir tarea para exponer el endpoint de rollback
oficial y auditar por qué el servicio no bastó.

## 7. Métricas de verificación (Fase 8)

```bash
curl -s http://localhost:3000/api/game/metrics | jq
# active_players, joins, joins_rejected, disconnects, rooms_created,
# snapshots_sent, backpressure_evictions, rate_limited, sequence_rejected
# — solo conteos agregados, sin coordenadas ni identidades.
```

Tras un rollback, `rooms_created` sube al recrear salas; `active_players`
vuelve a 0 cuando las salas drenan (TTL de sala vacía 300 s por defecto).

## 8. Definition of Done del runbook

- [ ] La versión buena queda activa y verificada por `GET /api/game/maps/:id`.
- [ ] Los jugadores conectados recibieron `server_restart` y migraron tras la
  cuenta atrás (sin salas en la versión dañada; `rooms_created` sube al
  recrearlas y `active_players` vuelve a estabilizarse).
- [ ] El evento quedó auditado (`map.published` o `asset.version.activated`).
- [ ] El borrador dañino se conserva documentado para análisis.
- [ ] Las métricas agregadas confirman el estado operativo del realtime.
