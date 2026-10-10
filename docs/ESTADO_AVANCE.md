# Estado de avance — FarmaControl

**Corte:** 10 de octubre de 2026 · rama `main` · referencia: [auditoría 2026-10-06](AUDITORIA_2026-10-06.md)

Este documento resume qué se corrigió desde la auditoría técnica, qué falta para llegar al 100 % y qué decisiones del cliente bloquean el cierre. Lo que aquí figura como hecho está en `main` con pruebas ejecutadas contra PostgreSQL real.

## 1. Resumen

| Fase | Contenido | Estado |
|---|---|---|
| 0 | Higiene de base: pruebas estables, worker en la suite, README | **IMPLEMENTADO** |
| 1 | Integridad de datos y dinero (P0, P1 de backend y P2 de integridad) | **IMPLEMENTADO** (cerrada el 10 de octubre); lo que depende del cliente quedó con la opción conservadora (sección 4) |
| 2 | Producción y seguridad | **IMPLEMENTADO** (10 de octubre); falta que el cliente provea el destino externo de respaldos (sección 3) |
| 3 | Acuerdos de la reunión del 4 de octubre | PENDIENTE |
| 4 | Contrato de API y estabilidad | PENDIENTE |
| 5 | Frontend y UX | PENDIENTE |
| 6 | Pruebas de cierre (E2E, concurrencia, permisos) | PENDIENTE |
| 7 | Decisiones del cliente | EN PROGRESO: preguntas identificadas, sin respuesta |
| 8 | Aceptación (UAT) y release v1.0.0 | PENDIENTE |

**Calidad al corte:** typecheck sin errores, lint sin errores (advertencias `any` preexistentes), **783 pruebas en 115 archivos, todas en verde** (una corrida previa tuvo 1 falla intermitente que no se repitió).

## 2. Qué se hizo

### Fase 0 — Higiene

| Cambio | Commit |
|---|---|
| Timeouts de Vitest en `apps/api` (eliminó 3 fallas intermitentes) | `35afd5e` |
| Worker incluido en `pnpm test` | `6941675` |
| 5 dumps de la base de pruebas fuera del repositorio | `7f4170f` |
| README con comandos reales; auditoría anterior marcada obsoleta (AUD-015) | `35afd5e`, `c186d0e` |

### Fase 1 — Integridad de datos y dinero

| Hallazgo | Qué pasaba | Qué hace ahora | Commit |
|---|---|---|---|
| AUD-001 (P0) | Ajustes concurrentes perdían saldo de lote | Bloqueo de fila al registrar movimientos | `2c30993` |
| AUD-002 (P0) | Anular una venta con notas crédito duplicaba la devolución | Se rechaza la anulación | `c9db132` |
| AUD-003 | Reintentar en el POS podía duplicar la venta | `Idempotency-Key` obligatoria y estable | `7a95332` |
| AUD-005 | Ajustes, lotes y ubicaciones sin autor | Se registra el usuario autenticado | `cca0023` |
| AUD-004 | Endpoints movían stock sin venta ni kardex | Retirados; lote con cantidad inicial deja kardex | `7750699` |
| AUD-006 | Anular venta a crédito con abonos los perdía; la reversión reabría cuentas canceladas | 409 mientras haya abonos; no se reabre una CxC cancelada | `bf7e754` |
| AUD-007 | Notas crédito: valor bruto sin descuento, todo al primer lote, caja en transferencias, excedente perdido, costo actual, sin permiso ni idempotencia | Prorrateo exacto, lote de origen, medio de pago original, 409 por excedente, costo histórico, permiso `sales:credit_note`, validación e idempotencia | `efb4f7d`, `b58acfb`, `c590b41` |
| AUD-009 | Nota débito rompía `saldo = total − pagado` | Total y saldo bajan juntos; 409 por excedente | `4d02ed4` |
| AUD-008 | Recepción reescribía vencimiento y reactivaba lotes; factura duplicable; factor recalculado | 409 en lote con otro vencimiento o inactivo; UNIQUE proveedor+factura; factor guardado | `4e1abd3` |
| AUD-010 | Dinero de la venta con coma flotante (un pago exacto podía rechazarse) | Cálculo en centavos con redondeo half-up | `d180a07` |
| AUD-011 | Cualquier cajero podía cambiar precios y descuentos sin límite | Permisos `sales:price_override` y `sales:discount`; descuento ≤ valor de la línea | `429759e` |
| P2 contabilidad | Sin mapeo contable no se validaba el período cerrado | El período cerrado se valida siempre | `5bc02e0` |
| P2 base de datos | Kardex y caja editables; tipo de movimiento libre | Triggers de inmutabilidad; tipos de kardex restringidos | ver `git log` |
| Notas débito | Cualquiera con `purchases:receive` las emitía; sin validación ni idempotencia; lote leído sin bloqueo; cantidades redondeadas; kardex referenciaba la factura | Permiso `purchases:debit_note`, validación, `Idempotency-Key`, bloqueo de compra y lote, unidades base enteras, kardex con el número ND | ver `git log` |
| P2 signo del kardex | Las salidas por venta o devolución se mostraban como `+N` | La pantalla de movimientos muestra el sentido según el tipo | ver `git log` |

Además: cantidades que no dan unidades base enteras se rechazan en compras y ventas, en lugar de redondearse en silencio.

### Fase 2 — Producción y seguridad

| Hallazgo | Qué pasaba | Qué hace ahora | Commit |
|---|---|---|---|
| AUD-012 | Sin `trust proxy`, 5 fallos de cualquiera bloqueaban el login de todos; el bloqueo por cuenta dejaba a cualquiera bloquear al `admin` | `TRUST_PROXY=1` detrás de Caddy; bloqueo por IP+usuario (5) y por IP (20, `AUTH_RATE_LIMIT_IP_MAX_ATTEMPTS`) | `5ab4a01` |
| Producción | Sin `enableShutdownHooks`; `/health` respondía 200 con la base caída | Apagado ordenado con SIGTERM; `/health` hace `SELECT 1` y responde 503 sin exponer el error | `5ab4a01`, `5e2525a` |
| CORS | Producción aceptaba los orígenes `localhost` y `http://`; un origen rechazado daba 500 | Solo los orígenes configurados en `https`; rechazo sin cabeceras CORS | `308f08d`, `d1635ab` |
| Cabeceras SPA | La SPA salía sin CSP, HSTS ni X-Frame-Options; dos topologías de proxy contradictorias | CSP estricta, HSTS, X-Frame-Options, COOP y Permissions-Policy en Caddy; tope de 10 MB en la API; se retiró `infra/nginx` | `d1635ab` |
| AUD-013 | **`pg_dump` 17 contra PostgreSQL 18: todo respaldo en producción fallaba**; respaldos manuales, sin cifrar, en el mismo servidor; runbook con rutas del equipo de desarrollo | Cliente PostgreSQL 18; respaldo diario programado con copia cifrada (`age`) fuera del servidor (`rclone`); `restore-drill.sh`; errores de `pg_dump`/`pg_restore` ya no se ocultan; runbook reescrito | `c857ecb`, `b9213be`, `b063338` |
| CSV | Un texto que empezaba por `=`, `+`, `-` o `@` se ejecutaba como fórmula al abrir el reporte | Se neutraliza con un apóstrofo; los números no cambian | `7db3cda` |
| Dependencias | `multer` con 4 avisos altos; `mysql2` y `source-map-js` vulnerables | Overrides a versiones parcheadas; ver sección 6 lo que queda | ver `git log` |

Verificación de infraestructura: `caddy validate`; Caddy real delante de servicios simulados (cabeceras, `X-Forwarded-For` falsificado descartado, 413 sobre 10 MB); imagen de la API construida y probada contra `postgres:18` (migraciones, `/health` 200/503, SIGTERM en 1 s, respaldo como usuario `node`); `tests/infra/run-backup-e2e.sh` (19 verificaciones); el bundle de la SPA no usa `eval` ni `new Function`.

## 3. Pasos obligatorios al desplegar estos cambios

1. **Respaldo** de la base antes de migrar.
2. **Revisar duplicados** de factura por proveedor: la migración `20261008230000_unique_supplier_invoice_on_purchases` falla a propósito si existen.
   ```sql
   SELECT supplier_id, invoice_number, count(*) FROM purchases
   GROUP BY 1, 2 HAVING count(*) > 1;
   ```
3. `prisma migrate deploy` (3 migraciones nuevas: costo histórico en líneas de venta, UNIQUE de facturas, inmutabilidad de movimientos).
4. `pnpm db:seed:rbac` para crear los permisos nuevos (`sales:credit_note`, `sales:price_override`, `sales:discount`, `purchases:debit_note`) y asignarlos a los roles.
5. Revisar si hay cuentas por cobrar `CANCELADA` con abonos vigentes (de antes de AUD-006): ya no se reabren, pero ese dinero no se devolvió.

Fase 2:

6. **Reconstruir las imágenes** (`docker compose ... build`): cambian la base de Node y el cliente de PostgreSQL.
7. **Respaldo externo:** generar el par de claves `age` fuera del servidor, crear el destino (bucket u otro servidor) y completar `infra/compose/backup.env` (ver `docs/runbooks/backup-restore.md`). Hasta entonces el respaldo diario se genera en local y el job reporta error.
8. Levantar `backup-scheduler`, forzar un respaldo y hacer el **primer simulacro** desde la copia externa.
9. Verificar en el navegador del servidor de pruebas que la SPA carga sin errores de CSP en la consola.

## 4. Decisiones del cliente pendientes

Ninguna se implementó por supuesto; las que se tocaron quedaron con la opción conservadora.

| # | Decisión | Qué desbloquea | Estado actual en el sistema |
|---|---|---|---|
| 1 | Una o varias cajas, apertura, arqueo y tolerancias | HU-015 turnos de caja | No existe |
| 2 | Inventario sin lote y cantidades fraccionarias | T-09 completo | Recepción siempre exige lote |
| 3 | IVA: productos gravados, tarifas | T-16 | La venta siempre usa IVA 0 |
| 4 | Tope de descuento, quién autoriza, motivo | T-19, T-20 | Permiso `sales:discount` (cajero lo conserva); sin tope porcentual |
| 5 | Quién emite notas crédito y notas débito | T-18 | Admin y supervisor (los roles inventario y compras perdieron las notas débito) |
| 6 | Reembolso en efectivo de ventas a crédito no pagadas | — | Permitido |
| 7 | Excedente de una devolución sobre el saldo (cliente o proveedor) | Saldo a favor | Se rechaza con 409 |
| 8 | Operar sin contabilidad configurada | — | La venta se registra y el asiento se omite con un aviso en el log |
| 9 | Cupo y plazo de crédito | HU-BLOQ-02 | No existe |
| 10 | Excepción a FEFO | HU-BLOQ-01 | FEFO obligatorio |
| 11 | Matriz completa acción × rol | T-18 | Seed actual |
| 12 | Datos legales y consecutivo del comprobante | T-03 | Comprobante sin datos legales |
| 13 | Proceso de devolución a proveedor y descuento de compra | T-12, T-15 | No existe |
| 14 | Reglas de promociones | T-37 a T-39 | No existe |
| 15 | Canal del recordatorio de pago y franja "Corriente" en cartera | Fase 3 | No existe / franja extra |
| 16 | Nombre del sistema | T-01 | FarmaControl provisional |
| 17 | Participantes, duración y criterio de la UAT | T-40, T-41 | — |

## 5. Qué falta por fase

### Fase 3 — Acuerdos del 4 de octubre
- Naturaleza débito/crédito en el PUC.
- Bloqueo de documentos por fecha (distinto del cierre de período).
- Notas contables manuales con fecha elegida.
- Cierre anual hacia 3705/3710.
- Recibos de caja y comprobantes de egreso con consecutivo, ligados a caja y bancos.
- Columnas Débito / Crédito / Saldo en caja y bancos.
- Cuentas bancarias vinculadas a cuentas del PUC.
- Descuentos de venta contabilizados en 4175 (T-31).
- Filtros rápidos de fecha en todos los reportes.
- Terceros unificado: retirar pantallas separadas de clientes y proveedores.
- Botón manual de recordatorio de pago.
- Aviso a proveedor a 110–120 días del vencimiento.

### Fase 4 — API y estabilidad
- OpenAPI en `/api/v1/docs`.
- Validación en los ~15 endpoints que no validan; paginación con tope.
- Fechas de negocio en America/Bogota (contabilidad, FEFO, worker).
- Worker: VENCIDO el día D, `SKIP LOCKED`, ejecuciones solapadas.
- Errores de dominio con 400/403/409 en vez de 500.
- Contratos transaccionales para que ningún módulo escriba tablas ajenas.
- Expiración y limpieza de claves de idempotencia.

### Fase 5 — Frontend
- POS: debounce y cancelación de búsquedas (AUD-014); elegir cliente existente; presentación por defecto; vista previa FEFO.
- Manejo global de 401/403 y rutas protegidas por permiso.
- Reportes: margen potencial (T-32), más vendidos (T-34), ventas por día (T-35), mejoras de legibilidad (T-36), detalle detrás de alertas (T-11), cifras del dashboard (T-02).
- Accesibilidad de botones de ícono; formularios críticos con React Hook Form y Zod.

### Fase 6 — Pruebas de cierre
- E2E con Playwright (hoy `tests/e2e` está vacío).
- Concurrencia y permisos en los flujos que aún no la tienen.

### Fase 8 — Aceptación y release
- Ambiente UAT limpio con el PUC completo; simulación de varios días con el cliente.
- Auditoría final de seguridad y rendimiento; tag v1.0.0; manual por rol.

## 6. Deuda técnica conocida

- **Signo del kardex en la base:** las salidas por venta y devolución se guardan con cantidad positiva y los ajustes negativos con cantidad negativa. El historial es inmutable, así que el sentido se deduce del tipo (así lo hace la pantalla). Unificar el signo exige una decisión y una migración de lectura, no de datos.
- **`IdempotencyService`** vive en `sales/infrastructure` y lo usan también las notas débito; moverlo a un módulo compartido cuando se aborden los contratos entre módulos (Fase 4).
- **Consecutivos** (`count() + 1`): se mantienen porque, con reintento en transacción serializable, producen numeración sin saltos. Una secuencia de PostgreSQL deja huecos al revertir, lo que no conviene para documentos con numeración legal. A revisar cuando se defina el comprobante.
- **Tipos de movimiento de caja:** sin restricción; las pruebas usan valores fuera del contrato (`APERTURA`, `EGRESO`). Revisar datos reales antes de restringirlos.
- **Auditoría fuera de la transacción** en varios servicios (lotes, compras).
- **Prueba intermitente:** el `beforeEach` de `product-tax-profile` puede superar 30 s con el disco lento.
- **`pnpm audit` restante:** `vitest` 3 arrastra `tinypool` (2 críticas) y `@vitest/mocker`: solo desarrollo, no llegan a la imagen; requiere migrar a Vitest 4 como tarea aparte. `deepmerge-ts` (alta) viene fijado por `prisma` 7.10 y solo lo usa la CLI al leer su configuración. `uuid` 8 en `exceljs`: el aviso afecta a v3/v5/v6 con búfer y `exceljs` solo usa `v4()`.
- **Rate limit en memoria:** válido con una sola instancia de la API. Un ataque distribuido contra una cuenta solo lo frena el límite por IP y el costo de Argon2.
- **RPO de 24 horas:** no hay archivado continuo de WAL (PITR).
- **Límite por IP en la farmacia:** si todos los equipos salen por la misma IP pública, 20 fallos en 15 minutos bloquean el login en la sede; ajustable con `AUTH_RATE_LIMIT_IP_MAX_ATTEMPTS`.
- 128 advertencias de lint por `any` y componentes de más de 600 líneas, a reducir solo cuando se toquen.

## 7. Siguiente paso recomendado

Enviar al cliente las decisiones de la sección 4 junto con el pedido del destino externo de respaldos (fase 2, paso 7) y seguir con la **Fase 3** (acuerdos del 4 de octubre, ya aprobados por el cliente salvo el canal del recordatorio, decisión 15) o la **Fase 4** (contrato de API y estabilidad), que no depende de ninguna decisión.
