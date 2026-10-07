# Auditoría técnica — FarmaControl (2026-10-06)

Auditoría de solo lectura sobre `main` en `2a1bac2`. Sustituye como referencia vigente a `AUDITORIA_GLOBAL_Y_CONSOLIDACION_ENTREGA.md`, que quedó desactualizada.

## 1. Resumen ejecutivo

FarmaControl es un monolito modular bien encaminado. La venta con FEFO corre en una transacción `SERIALIZABLE` con `FOR UPDATE`, hay `CHECK` contra saldos negativos y la contabilidad es de partida doble con asientos inmutables protegidos por triggers. Typecheck y lint pasan; 693 de 696 pruebas pasan contra PostgreSQL real.

El riesgo está en los caminos alternativos al flujo principal de venta: ajustes de inventario, anulaciones combinadas con notas crédito, reintentos desde el POS y endpoints que mueven stock sin documento.

| Prioridad | Cantidad |
|---|---|
| P0 | 2 |
| P1 | 13 |
| P2 | 30 |
| P3 | 13 |

Hay además 3 decisiones de negocio pendientes (sección 6).

## 2. Alcance

**Revisado:** arquitectura y los 18 módulos del backend; los 31 controladores; `schema.prisma` y las 31 migraciones con su historial git; worker; frontend (POS en detalle); pruebas; Docker, Compose, Caddy, nginx; CI; secretos en git; `pnpm audit`; documentación.

**Ejecutado:** `pnpm typecheck`, `pnpm lint`, `db:test:check`, `pnpm test`.

**No revisado:** servidor de producción, DNS y TLS; pruebas de carga; E2E en navegador (no existen); `prisma migrate diff`; payables, expenses y treasury solo por muestreo.

## 3. Resultado de calidad

| Comando | Resultado |
|---|---|
| `pnpm typecheck` | 0 errores |
| `pnpm lint` | 0 errores, 128 advertencias (`no-explicit-any`) |
| `pnpm test` | 693/696 (105/107 archivos), 15 min |

Las 3 fallas son timeouts del `beforeEach` (`cleanTestDatabase` + `seedRbac`); ejecutadas solas pasan 14/14. Causa: `apps/api/vitest.config.ts` no define `hookTimeout` y el de la raíz no se aplica a los proyectos (queda en 10 s).

## 4. Fortalezas verificadas

- Venta en una transacción única: FEFO con `FOR UPDATE` ordenado por vencimiento, kardex, caja, banco, CxC e idempotencia (`sale.service.ts:143-462`).
- `CHECK` de no negatividad en lotes, kardex, caja y compras; asientos `POSTED` inmutables por trigger con balance validado al commit.
- Balance contable en centavos `bigint`; control de período cerrado centralizado en `postOnce`/`reverseOnce`.
- Todos los controladores con `SessionAuthGuard` + `PermissionsGuard`; sesiones opacas con hash; Argon2id con protección contra enumeración; sin `$queryRawUnsafe`; backups con `execFile` sin shell.
- Pagos de cartera con advisory lock y hash de idempotencia que incluye usuario y endpoint.
- Ninguna migración modificada después de su commit.
- FEFO concurrente y anulación concurrente probadas con PostgreSQL real; sin `.skip` ni `.only`.

## 5. Hallazgos P0 y P1

### P0

**AUD-001 · Inventario — actualización perdida en ajustes.**
`inventory/infrastructure/adapters/prisma-inventory-movement.repository.ts:19-43`. Lee el lote con `findUnique` sin bloqueo (READ COMMITTED) y escribe el saldo absoluto. Un ajuste concurrente con una venta pierde uno de los dos cambios y corrompe stock y `balance_after`. Recomendación: `SELECT … FOR UPDATE` y prueba de concurrencia.

**AUD-002 · Anular una venta con notas crédito duplica la devolución.**
`sales/application/sale.service.ts:508-650`. `cancelSale` no revisa notas crédito: reintegra todas las asignaciones, retira el total de caja/banco y reversa el asiento completo. Recomendación: rechazar la anulación si existen notas crédito.

### P1

| ID | Área | Problema | Evidencia |
|---|---|---|---|
| AUD-003 | POS + API | Venta duplicada al reintentar: el POS genera una `Idempotency-Key` nueva por intento y el backend solo la exige en transferencias. | `PosPage.tsx:328`, `sale.service.ts:115-119` |
| AUD-004 | Inventario | Stock movido sin documento: `allocate-fefo` descuenta sin venta ni caja; `POST /inventory/movements` acepta cualquier tipo; `createLot` con cantidad inicial no deja kardex. | `inventory-lot.controller.ts:77-95`, `inventory-lot.service.ts:121-130` |
| AUD-005 | Inventario | Movimientos sin autor: se lee `req.session?.userId`, pero el guard pone el usuario en `request.user`. | `inventory-lot.controller.ts:85,104,131`, `inventory-movement.controller.ts:79,130` |
| AUD-006 | Cartera | Se anula una venta a crédito con abonos sin devolverlos; `revertPayment` reabre una CxC `CANCELADA`. | `sale.service.ts:629-634`, `receivables.service.ts:440-445` |
| AUD-007 | Notas crédito | Reembolso ignora descuento; reintegra todo al primer lote; transferencia sin movimiento de tesorería; excedente perdido en cartera; costo actual en vez de histórico; sin validación, permiso propio ni idempotencia. | `credit-notes.service.ts:173-297` |
| AUD-008 | Compras | La recepción sobrescribe vencimiento y reactiva lotes inactivos; sin UNIQUE `(proveedor, factura)` ni idempotencia; factor recalculado en vez de guardado. | `prisma-purchase.repository.ts:67-77` |
| AUD-009 | Notas débito | Saldo de CxP recortado a 0 sin ajustar pagado ni total; rompe `saldo = total - pagado`. | `debit-notes.service.ts` (~245-265) |
| AUD-010 | Dinero | Aritmética con `number` en el dominio de venta (subtotales, totales, IVA). | `sale.entity.ts:131,284-295`, `sale.service.ts:195-216` |
| AUD-011 | Ventas | Precio y descuento sin control ni límites para cualquier usuario con `SALES_CREATE`. | `confirm-sale.dto.ts:107-110` |
| AUD-012 | Seguridad | Sin `trust proxy`, el rate limit del login es global: 5 intentos de cualquiera bloquean a todos 15 min. | `main.ts`, `auth.controller.ts:57-58` |
| AUD-013 | DevOps | Backups solo manuales, sin cifrar y en el mismo host; el cron del runbook apunta a la máquina del desarrollador. | `docker-compose.production.yml:134-155`, `backup-restore.md:57-66` |
| AUD-014 | POS | Dos peticiones por tecla sin debounce ni cancelación; Enter agrega el primer resultado de la última respuesta recibida. | `PosPage.tsx:410-428` |
| AUD-015 | Documentación | README con `pnpm dev` inexistente, Swagger inexistente y conteo de pruebas falso. | `README.md:139,145,155` |

## 6. Decisiones de negocio pendientes

1. **Productos sin control de lote:** se venden sin descontar inventario ni tope (`sale.service.ts:224-296`); backlog T-09 PENDIENTE.
2. **IVA en ventas:** siempre 0; los perfiles tributarios no se usan (`sale.service.ts:298-311`).
3. **Plan frente a código:** `PLAN_DESARROLLO.md` marca como PENDIENTE/BLOQUEADO gastos, estados financieros, notas y cierre fiscal, que ya están implementados.

## 7. Hallazgos P2

- **Backend:** idempotencia de ventas sin usuario/endpoint en el hash, sin expiración y con reintentos ante duplicado concurrente; asiento omitido en silencio si falta mapeo (también salta el período cerrado); fechas contables en UTC; consecutivos con `count()+1`; módulos que escriben tablas ajenas y lógica FEFO/caja duplicada.
- **Base de datos:** kardex y caja sin trigger de inmutabilidad; `movement_type` VARCHAR libre; signo de salidas inconsistente.
- **Worker:** VENCIDO el día D mientras el POS vende; UTC; P2002 con ejecuciones solapadas; cola sin `SKIP LOCKED`; fuera de los `projects` de Vitest.
- **API:** ~15 endpoints sin validación en tiempo de ejecución; paginación sin tope o con NaN; sin OpenAPI.
- **Seguridad:** inyección de fórmulas en CSV; CORS con localhost en producción y `http://` fijo; SPA sin CSP/HSTS/X-Frame-Options; bloqueo de la cuenta `admin` con 5 intentos; `pnpm audit` con 5 avisos altos (multer).
- **DevOps:** 5 dumps de `farmacia_test` versionados (incluyen `users` y `sessions`); API sin `enableShutdownHooks`; `/health` sin BD; sin rotación de logs; topología nginx/Caddy contradictoria.
- **Frontend:** presentación por defecto ignorada; sin manejo global de 401/403; rutas sin restricción por permiso; no se puede elegir cliente existente en el POS; errores tragados; `number` para dinero.
- **Pruebas:** `tests/e2e` vacío; sin idempotencia concurrente; notas sin pruebas de permisos ni concurrencia; sin pruebas de período cerrado para ventas/compras/gastos; endpoints de inventario sin pruebas de API; falta `hookTimeout` en `apps/api`.
- **Documentación:** auditoría previa desactualizada; copias de documentos base en la raíz divergentes de `docs/`.

## 8. Hallazgos P3

Redondeo de cantidades y `parseFloat` en Excel; 500 donde corresponde 403/400; `POST /users` sin protección del último admin ni auditoría; rate limiting en memoria; `SESSION_SECRET` sin uso; 12 componentes de más de 600 líneas; formularios sin RHF/Zod; botones de ícono sin nombre accesible; POS sin vista previa de lotes FEFO; runbook con rutas locales; 128 advertencias de `any`.

## 9. Riesgos

- Hasta 10 reintentos `SERIALIZABLE` por venta bajo carga.
- Auditoría registrada fuera de la transacción de negocio.
- `CURRENT_DATE` en FEFO depende de la zona horaria de la sesión de PostgreSQL.

## 10. Plan de acción

1. **Integridad de datos (P0):** AUD-001 y AUD-002 con pruebas sobre PostgreSQL real.
2. **Dinero y documentos (P1):** AUD-003, AUD-004, AUD-005; después AUD-006 a AUD-009, previa decisión de la sección 6.
3. **Producción:** `trust proxy`, backups programados, cifrados y externos con prueba de restauración, cabeceras en la SPA, CORS de producción.
4. **Estabilidad:** Zod en endpoints sin validar, paginación con tope, contabilidad sin omisiones silenciosas y en America/Bogota, pruebas de período cerrado, dinero de la venta en centavos/`Decimal`.
5. **Mantenibilidad:** contratos transaccionales de inventario y caja, triggers de inmutabilidad, OpenAPI.
6. **Mejoras:** E2E del POS, manejo de 401, refactor de componentes grandes, reconciliar documentación.
