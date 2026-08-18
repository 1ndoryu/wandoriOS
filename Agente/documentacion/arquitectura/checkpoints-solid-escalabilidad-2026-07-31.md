# Checkpoints SOLID y escalabilidad

> **Fecha:** 2026-07-31  
> **Uso:** referencia reusable para cada fase del roadmap; no sustituye los criterios específicos del plan dueño.

## Gate reusable S1–S5

- **S1 — Responsabilidad:** cada módulo, componente, servicio y comando tiene una sola razón de cambio; chrome, contenido, persistencia, permisos y analítica no se mezclan.
- **S2 — Extensión:** apps, recursos, comandos, proveedores y presentaciones se agregan mediante registros/adaptadores; no se modifican condicionales globales ni se crean duplicados por plataforma.
- **S3 — Interfaces:** contratos pequeños y orientados a capacidades; no exponer métodos que un consumidor no necesita ni acoplar UI a detalles de infraestructura.
- **S4 — Inversión:** UI depende de contratos; servicios orquestan; repositories/adaptadores hacen I/O; SQL y DOM no cruzan límites de dominio.
- **S5 — Escala y evidencia:** límites de tamaño respetados, sin N+1, estado derivado, listeners sin teardown o fallos silenciosos; existe un segundo caso real, prueba negativa, rollback y evidencia del quality gate.

## Evidencia por fase

| Fase | Evidencia mínima antes de cerrar |
| --- | --- |
| 297A-9 Runtime | Una nueva app se registra sin modificar el shell; WindowManager, comandos y rutas se desmontan correctamente. |
| 297A-10 Recursos | Un nuevo `resourceKind` conserva DTO público/admin, transacción, permisos y migración reversible. |
| 297A-11 Workspace | Una referencia nueva soporta mover/copiar/papelera/undo atómicos sin mutar el recurso original. |
| 297A-12 Móvil | El mismo AppRegistry funciona en launcher y desktop; cambiar breakpoint conserva ruta, recurso y estado permitido. |
| 297A-18 Tema | Un tercer tema de prueba puede consumir tokens sin reescribir componentes, apps ni comandos. |
| 297A-13 Cuentas | Otro proveedor o dispositivo usa el mismo contrato de identidad/overlay y muestra conflictos sin restaurar tombstones. |
| 297A-14 Editorial | Un nuevo tipo de documento reutiliza editor, capacidades, preview, papelera y audit sin ampliar el Admin monolítico. |
| 297A-15 Comercio | Otro proveedor de pago o versión usa adaptadores; autoridad de precio, webhook, entitlement y grant sigue server-side. |
| 297A-16 Analytics | Un evento nuevo entra por catálogo/dispatcher, respeta allowlist y no obliga a reescribir agregados o paneles. |
| 297A-17 Hardening | Local/CI ejecutan las mismas reglas, el runbook permite rollback y ninguna excepción oculta deuda estructural. |

## Procedimiento

1. Antes de editar, identificar el límite SOLID afectado y el segundo caso que debe seguir funcionando.
2. Durante la implementación, extender por composición, registry o adaptador; si aparece un `if` por app/plataforma, detenerse y rediseñar.
3. Al cierre, adjuntar en el plan la evidencia S1–S5, ejecutar `npm run task:check -- {ID}` y registrar excepciones justificadas.
4. Si se detecta una regla automatizable, crear prevención para Sentinel/VarSense; no silenciar el hallazgo.

## Definition of Done

- [ ] Evidencia S1–S5 enlazada desde el checklist de la fase.
- [ ] Prueba positiva, negativa y de regresión ejecutadas.
- [ ] Límites, rendimiento, teardown, errores y rollback revisados.
- [ ] Documentación, roadmap y quality report sincronizados.
