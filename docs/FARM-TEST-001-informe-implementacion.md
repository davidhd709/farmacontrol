# FARM-TEST-001 — Informe de implementación local

Fecha: 2026-11-04 (Bogotá).

## Estado y control de cambios

Corrección implementada en la rama local `fix/farm-test-001-cash-opening`, creada desde
`49cc5afae676452153a2bb8a6ef0ea8baca5d210`. La rama original era
`fix/worker-idempotency-cleanup-di`; el árbol de trabajo estaba limpio antes de empezar.
No se sobrescribieron cambios del usuario. El commit local de entrega se identifica con
`git log -1 --oneline` en esta rama y se comunica en la entrega final.

No hubo push, PR, merge, despliegue, anulación de la apertura de Droguería Vida Sana ni
consultas o reparaciones sobre su base. Las migraciones se probaron exclusivamente en
contenedores efímeros identificados por el ejecutor del proyecto y eliminados al terminar.

## Causa confirmada

El asistente publicaba únicamente `JournalEntry`/`JournalEntryLine` con origen
`OPENING_BALANCE`. El saldo operativo se obtiene del último `CashMovement.balanceAfter`;
no se deriva del mayor. Sin movimientos de caja, el auxiliar devuelve cero. Un recibo
manual adicional publica otro débito y no sirve como reparación neutra.

## Solución y garantías

- El asistente publica un asiento y un movimiento `SALDO_APERTURA` dentro de la misma
  transacción SERIALIZABLE. Caja incorpora el neto de la cuenta configurada por `CASH`,
  sin códigos PUC fijos. Un neto cero no crea movimiento; uno negativo se rechaza.
- El movimiento no pasa por el motor contable y no crea recibos ni comprobantes.
  Su registro no aumenta ingresos, egresos, operaciones del día ni flujo operativo.
- `CashOpening` enlaza de forma única e inmutable empresa, asiento, movimiento y cuenta,
  con importe, fecha efectiva y responsable. La auditoría conserva motivo y modo de incorporación.
- La clave HTTP y su respuesta comparten la transacción. Unicidad por asiento y referencia
  protege contra duplicación incluso después de vencer la clave HTTP. El frontend conserva
  la clave durante un reintento del mismo contenido.
- El escritor de caja utiliza el cerrojo existente y asigna fechas crecientes bajo ese
  cerrojo; `balanceAfter` y consultas siguen un orden consistente. No reescribe históricos.
- Una reparación explícita incorpora el efectivo del asiento original tras validar
  empresa, vigencia, cuenta, importe, saldo contable y ausencia total de historial operativo.
- Se bloquea anular solamente el asiento de una apertura ya incorporada. Una corrección
  conjunta posterior requiere diseño específico. Las aperturas sin incorporación conservan
  su anulación anterior.

Alternativas descartadas: recibo manual (duplicación contable), lectura exclusiva del mayor
desde Caja (incompatible con la cadena operativa), reescritura por SQL de históricos y
sincronización eventual (innecesaria al compartir PostgreSQL).

La decisión completa consta en [ADR-008](adr/ADR-008-apertura-operativa-de-caja.md).

## Archivos modificados

| Área                           | Archivos                                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Modelo y migración             | `packages/database/prisma/schema.prisma`; `packages/database/prisma/migrations/20261105100000_cash_opening/migration.sql`                        |
| Contratos                      | `packages/contracts/src/accounting.ts`; `packages/contracts/src/cash.dto.ts`                                                                     |
| Coordinación contable y API    | `apps/api/src/modules/accounting/accounting.module.ts`; `application/accounting-setup.service.ts`; `presentation/accounting-setup.controller.ts` |
| Consulta y protección contable | `apps/api/src/modules/accounting/application/accounting-books.service.ts`; `application/journal.service.ts`                                      |
| Incorporación de Caja          | `apps/api/src/modules/cash/cash-opening.module.ts`; `application/cash-opening.service.ts`                                                        |
| Reglas, saldo y orden de Caja  | `apps/api/src/modules/cash/domain/cash-rules.ts`; `domain/cash-movement.entity.ts`; `infrastructure/prisma-cash-movement.repository.ts`          |
| Indicadores y reporte          | `apps/api/src/modules/reports/application/reports.service.ts`                                                                                    |
| Frontend                       | `apps/web/src/features/accounting/api/accounting-setup.api.ts`; `pages/AccountingSetupPage.tsx`; `apps/web/src/features/cash/pages/CashPage.tsx` |
| Pruebas API y dominio          | `apps/api/test/integration/cash-opening.integration.spec.ts`; `accounting-setup.integration.spec.ts`; `apps/api/test/unit/cash-rules.spec.ts`    |
| Pruebas frontend               | `apps/web/test/accounting-setup.test.tsx`; `apps/web/test/cash.test.tsx`                                                                         |
| Documentación                  | Este informe; ADR-008; `docs/runbooks/FARM-TEST-001-apertura-caja.md`                                                                            |

La migración crea vínculos, restricciones, unicidad y triggers de validación/inmutabilidad;
excluye la apertura del trigger de documentos y bloquea reversiones contables aisladas.
No contiene backfill ni modificaciones de saldos históricos. No modifica tablas bancarias.

## Pruebas y comandos ejecutados

Se instalaron las dependencias ya fijadas con `corepack pnpm install --frozen-lockfile`,
sin cambiar dependencias ni lockfile. Se generó el cliente local con
`corepack pnpm --filter @farmacia/database db:generate`, sin migrar bases persistentes.

El entorno carecía de `pnpm` en PATH y de clientes PostgreSQL host. Se usaron herramientas
temporales en `/tmp/farm-test-001-tools`: pnpm vía Corepack y clientes oficiales PG18 en
Docker, heredando exclusivamente la conexión efímera del ejecutor. Para jsdom se usó
Node 24.22.2 temporal; Node 20 del host no inicia el jsdom/undici fijado por el proyecto.
No se cambiaron dependencias para resolver esa incompatibilidad de entorno.

| Validación                 | Comando y resultado                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Línea base antes de editar | `pnpm test apps/api/test/integration/accounting-setup.integration.spec.ts apps/api/test/integration/cash.controller.integration.spec.ts apps/api/test/integration/treasury-vouchers.integration.spec.ts`: **26/26**, tres suites                                                                                                                                                                                                                           |
| Primera implementación     | Mismas suites más `cash-opening.integration.spec.ts`: 52 aprobadas y tres fallos de preparación/expectativa; corregidos antes de repetir                                                                                                                                                                                                                                                                                                                   |
| Regresión ampliada         | `pnpm test apps/api/test/integration/cash-opening.integration.spec.ts apps/api/test/integration/accounting-setup.integration.spec.ts apps/api/test/integration/cash.controller.integration.spec.ts apps/api/test/integration/treasury-vouchers.integration.spec.ts apps/api/test/integration/accounting-coverage.integration.spec.ts apps/api/test/integration/journal.integration.spec.ts apps/api/test/unit/cash-rules.spec.ts`: **94/94**, siete suites |
| Interfaz con Node24        | `corepack pnpm --filter @farmacia/web exec vitest run test/accounting-setup.test.tsx test/cash.test.tsx`: **8/8**, dos suites                                                                                                                                                                                                                                                                                                                              |
| Esquema                    | `corepack pnpm --filter @farmacia/database db:validate`: correcto                                                                                                                                                                                                                                                                                                                                                                                          |
| Tipos                      | `corepack pnpm -r typecheck`: correcto en todos los paquetes                                                                                                                                                                                                                                                                                                                                                                                               |
| Lint                       | `corepack pnpm -r lint`: cero errores; 134 advertencias en el conjunto del repositorio, sin ampliación de alcance para corregirlas                                                                                                                                                                                                                                                                                                                         |
| Compilación                | Con Node24, `corepack pnpm -r build`: correcto; Vite advierte de chunks superiores a 500 kB                                                                                                                                                                                                                                                                                                                                                                |
| Formato y diff             | Prettier de archivos nuevos/principales y pruebas: correcto; `git diff --check`: correcto. Se evitó reformatear masivamente archivos ajenos al cambio                                                                                                                                                                                                                                                                                                      |

Los tres fallos iniciales fueron una expectativa 400 frente al conflicto de configuración (409),
un fixture de expiración que infringía `expires_at > created_at` y un producto de prueba sin
costo para vender. Se corrigieron los fixtures y la expectativa; no se relajaron reglas del producto.
Los errores500 simulados y respuestas de rechazo que aparecen en los logs son casos negativos
de rollback y autorización, no fallos de las ejecuciones aprobadas.

La repetición final tras excluir la apertura del conteo de operaciones pasó **58/58 pruebas en
cuatro suites**: `cash-opening.integration.spec.ts`, `reports.integration.spec.ts`,
`apps/web/test/accounting-setup.test.tsx` y `apps/web/test/cash.test.tsx`, ejecutadas juntas
con Node24 y el mismo ejecutor efímero. Código de salida cero y contenedor eliminado.

## Cobertura y revisión independiente

Las pruebas cubren el escenario $2M/$6M/$8M por APIs públicas, asiento único, banco intacto,
conciliación cero, fecha efectiva histórica, CASH configurable, neto cero/negativo, reintentos,
claves vencidas, concurrencia, rollback antes y después de insertar efectivo, ventas y egresos
posteriores, cadena de saldos, rechazo de empresa incorrecta/ambigua, reparación existente,
cuenta/importe incorrectos, otros asientos, historial previo aun con saldo cero, permisos,
inmutabilidad, movimientos huérfanos y carrera entre reparación y anulación.

Los saldos operativos se generan por API pública. `JournalService.post()` solo representa
aperturas de versiones anteriores; no se siembran saldos operativos para simular la corrección.
Las escrituras directas inválidas en pruebas comprueban las restricciones de base de datos.

Un agente independiente revisó servicios, transacciones, migración, pruebas y documentación.
Detectó validación UUID coercitiva que podía producir 500 con arrays: corregida y cubierta con 400.
Solicitó probar la carrera reparación/anulación y el fallo después de insertar el movimiento:
ambos incorporados. La segunda pasada no encontró defectos bloqueantes pendientes.

## Límites y pendientes

- No se ha desplegado ni validado funcionalmente esta versión en la instalación de Droguería Vida Sana.
- La reparación del asiento original no se ejecutó. Requiere identificación y lectura previa de
  esa base, autorización expresa, migración estructural autorizada y comprobación posterior.
- Hasta F9 se admite una base dedicada con una sola empresa total, activa. Se rechaza atribución
  empresarial ambigua; no se presenta esto como soporte multiempresa compartido.
- Cualquier historial previo de Caja bloquea la reparación automática; no se recalcula ni borra.
- Los empates temporales históricos se desempatan por ID, sin reconstruir su orden real.
- `READY` sigue siendo configuración: no acredita conciliación universal. Bancos, cartera,
  proveedores, turnos y tributos quedan fuera de la corrección.
- No se incluye aún un flujo de compensación/anulación conjunta para aperturas incorporadas.

## Procedimiento propuesto para Droguería Vida Sana

El [runbook](runbooks/FARM-TEST-001-apertura-caja.md) prepara la revisión y la solicitud
`POST /api/v1/accounting/opening-balances/{asiento-original}/cash` con empresa y cuenta
verificadas, importe esperado `2000000.00`, motivo y clave idempotente.
La solicitud conservará el asiento original y los $6M bancarios, e incorporará un único
saldo de apertura en Caja si se cumplen todas las precondiciones. Este procedimiento
queda pendiente de autorización; no se aplicó sobre datos existentes.
