# Runbook Coolify: backup, deploy, health y rollback

> **Fecha:** 2026-08-01  
> **Alcance:** procedimiento documentado; no ejecuta operaciones de producción.  
> **Autoridad:** `coolify-manager-rs` y la regla de no usar SSH directo.

## Preflight

- [ ] Existe el binario release de `coolify-manager-rs` en la ruta canónica.
- [ ] El nombre del sitio y la rama objetivo coinciden con el roadmap.
- [ ] El cambio tiene quality report PASS, commit y push.
- [ ] El operador confirmó si necesita backup; código puro puede usar `--skip-backup`.
- [ ] No hay migración destructiva ni cambio de secretos sin plan de reversión.

## Flujo normal

1. Ejecutar `deploy --name <sitio> --update` mediante el binario del manager.
2. Esperar la señal de progreso/fin con timeout; no mantener una espera ciega.
3. Ejecutar `health --name <sitio>` y comprobar HTTP, contenedor y dependencias.
4. Registrar el resultado y el commit desplegado en el reporte de la tarea.

Para cambios de código sin migraciones ni uploads, `deploy --name <sitio> --update --skip-backup` reduce el tiempo. Nunca usar `ssh`, `docker`, `scp` ni `curl` directo contra producción.

## Fallo y rollback

- Si el deploy falla antes del swap, conservar logs y ejecutar `health`; no repetir variantes a ciegas.
- Si el health posterior falla, ejecutar `redeploy --name <sitio>` una sola vez y volver a comprobar `health`.
- Si la versión sigue degradada, detener el avance y usar `restore --name <sitio>` con el backup confirmado; registrar qué se restauró.
- Después de restaurar, ejecutar `health`, revisar `logs` y confirmar que no quedan migraciones incompatibles.
- Todo incidente debe dejar una tarea de prevención o mejora del manager; nunca ocultar el fallo como warning.

## Evidencia y límites

- El quality gate verifica código, contratos y budgets; no sustituye health real ni revisión humana.
- MFA/passkey, proveedores reales de correo/pago, E2E, observabilidad de producción y autorización explícita de deploy permanecen fuera de este runbook.
- Si Coolify no cubre una operación, crear una mejora para `coolify-manager-rs`; no abrir un canal SSH alternativo.

## Definition of Done del procedimiento

- [ ] Preflight, deploy, health y rollback tienen comandos y criterio de salida.
- [ ] Existe una ruta de recuperación sin SSH directo.
- [ ] El reporte conserva commit, sitio, resultado y logs relevantes.
- [ ] El operador puede detenerse sin borrar datos ni repetir una operación opaca.
