# Correcciones solicitadas por el cliente — FarmaControl

**Fecha:** 2026-11-01 · **Rama:** `main` · **Estado:** EN PROGRESO (se actualiza al cerrar cada fase)

Este documento registra el análisis previo a las correcciones pedidas por el cliente tras revisar el sistema, la ubicación de cada una en el código y las decisiones tomadas. Lo que aquí se marca como hecho tiene commit en `main`.

## 1. Stack y estructura

| Capa | Tecnología | Ubicación |
|---|---|---|
| API | NestJS + TypeScript, REST `/api/v1` | `apps/api/src/modules/<módulo>/{presentation,application,domain,infrastructure}` |
| Web | React + Vite + MUI + React Router + TanStack Query + RHF + Zod | `apps/web/src/features/<módulo>/{api,components,pages,hooks,validation}` |
| Contratos compartidos | TypeScript | `packages/contracts/src` (DTO y permisos usados por API y web) |
| Base de datos | PostgreSQL 18 + Prisma | `packages/database/prisma/schema.prisma`, migraciones en `packages/database/prisma/migrations` |
| Pruebas | Vitest (unitarias e integración contra PostgreSQL temporal), Playwright (E2E) | `apps/*/test`, `packages/database/test`, `tests/e2e` |

Comandos de cierre de fase: `pnpm typecheck`, `pnpm lint`, `pnpm build` y `pnpm test <archivos afectados>` (crea un PostgreSQL efímero en Docker).

### Módulos relevantes para estas correcciones

| Módulo API | Responsabilidad actual | Pantallas web |
|---|---|---|
| `sales` | Venta POS con FEFO (`sale.service.ts`), anulación, notas crédito (`credit-notes.service.ts`) | `PosPage`, `PosPaymentDialog`, `SaleReceiptDialog`, `SalesHistoryPage`, `CreditNoteDialog` |
| `cash` | Movimientos de caja (`cash_movements`), movimiento manual con contrapartida | `CashPage`, `CreateCashMovementDialog` |
| `treasury` | Cuentas bancarias, movimientos bancarios, documentos RC/CE (`treasury_documents`, generados por trigger, ADR-002) | `TreasuryBankAccountsPage`, `BankMovementDialog`, `TreasuryDocumentsPage` |
| `receivables` | Cartera (`receivables`, `receivable_payments`), abonos y reversión | `ReceivablesPage`, `ReceivablePaymentDialog` |
| `payables` | Cuentas por pagar de compras (`payables`, `payable_payments`) | `PayablesPage`, `PayablePaymentDialog` |
| `expenses` | Causación de gastos (`expenses`, `expense_payments`) | `ExpensesPage`, `ExpenseFormDialog`, `ExpensePaymentDialog` |
| `accounting` | Motor de asientos (`accounting-engine.service.ts`), libro diario, reportes, PUC | `AccountingPages`, `JournalEntriesPage`, `ThirdPartiesReportPage`, etc. |
| `third-parties` | Directorio único de terceros (cliente/proveedor) | `ThirdPartiesPage`, `ThirdPartyAutocomplete` |
| `catalog` | Productos y presentaciones con `barcode` único | `ProductsPage`, `PosProductSearch` |

### Cómo se mueve el dinero hoy

Cada flujo (venta, abono, pago a proveedor, gasto, nota crédito, movimiento manual) inserta un movimiento en `cash_movements` o `bank_movements` y publica su asiento con `AccountingEngineService` en la misma transacción. Un trigger `AFTER INSERT` crea un recibo de caja (RC) o comprobante de egreso (CE) por cada movimiento (ADR-002). `journal.service` rechaza asientos descuadrados.

## 2. Ubicación de cada corrección

### Fase 1 — Bugs y ajustes de interfaz

| Ítem | Dónde está | Hallazgo / cambio |
|---|---|---|
| Dos comprobantes por venta | `sale.service.ts` (movimiento `INGRESO_VENTA`/`DEPOSIT` con referencia `SALE`), trigger `create_treasury_document_for_cash/bank` (migración `20261010160000`), `SaleReceiptDialog.tsx`, `index.css` (`@media print`) | **Causa raíz:** cada venta de contado emite su comprobante de venta y, además, el trigger de ADR-002 emite un recibo de caja RC por el mismo dinero (y un CE al anularla). Con el nuevo principio, la venta es en sí misma el documento: el trigger deja de generar RC/CE para movimientos con origen `SALE` o `SALE_CANCEL`. Los RC ya emitidos no se borran (son inmutables). Además, la impresión repetía el recibo: el diálogo se imprimía con `position: fixed` (Chrome lo repite en cada página que ocupa la pantalla de fondo) y el recibo mostraba el título "Comprobante de venta" dos veces. |
| Orden por fecha en Control de caja | `CashPage.tsx`, `cash-query.dto.ts`, `prisma-cash-movement.repository.ts` | Parámetro `sortOrder=asc\|desc` en `GET /cash-movements` y botón de orden. |
| Bancos: etiquetas de tipo en español, filtro Débito/Crédito, orden | `TreasuryBankAccountsPage.tsx`, `treasury.controller.ts`/`treasury.service.ts` (`listMovements`) | Etiquetas traducidas, filtro `direction=DEBITO\|CREDITO` (agrupa los tipos), `sortOrder`. |
| Renombrar ingreso manual como "Recibo de caja" | `CreateCashMovementDialog.tsx` (botón "+ Registrar Movimiento" de `CashPage`) | Es el registro de ingresos manuales actual. En la fase 3 se reemplaza por el formulario de recibo de caja en Tesorería. |
| ⚠️ Quitar "Reservar", dejar "Detalle" | **No existe ningún botón "Reservar" en el código** (búsqueda en `apps/web/src`). Lo más cercano son los botones de acción por fila "Abonar"/"Pagar" junto a "Detalle" en `ReceivablesPage` y `PayablesPage`, y "Pagar / Abonar" en `ExpensesPage`. | **PENDIENTE de confirmar.** Las fases 3 y 4 retiran de esas tres pantallas los botones de pago (los pagos pasan a recibos y egresos), así que quedan solo "Detalle"/"Ver abonos". Si el cliente se refería a otra pantalla, debe indicarla. |
| ⚠️ "Organizar diseño" | Sin pantalla identificada. | **PENDIENTE de confirmar la pantalla.** Las pantallas que se rehacen en este trabajo (Cuentas por pagar, Recibos, Egresos, Auditoría contable) siguen el estilo de las demás (encabezado con `HomeBackButton`, filtros en `Paper`, tabla `small`). |
| Eliminar Auxiliar de terceros | `navigation.tsx` (menú), `App.tsx` (ruta `/accounting/third-parties`), `ThirdPartiesReportPage.tsx` | Se retiran menú, ruta y página. El endpoint de la API se conserva porque lo usan los libros oficiales. Lo reemplaza el estado de cuenta por tercero de la fase 5. |

### Fase 2 — Ventas a crédito y cartera

| Ítem | Dónde está | Hallazgo / cambio |
|---|---|---|
| Selector Contado / Crédito | `PosPaymentDialog.tsx` | La API ya acepta `paymentMethod: 'CREDITO'` (abre la cuenta por cobrar a 30 días y no mueve caja), pero el POS no lo ofrecía. Se agrega el selector; crédito exige un cliente identificado (no "consumidor final"). |
| Venta a crédito → cartera, sin ingreso de caja | `sale.service.ts` (`receivablesLedger.openForSale`) | Ya implementado en la API; se cubre con prueba de extremo a extremo. |
| Devolución total o parcial | `credit-notes.service.ts`, `CreditNoteDialog.tsx`, `SalesHistoryPage.tsx` | Ya existe la nota crédito (reingresa al lote de origen, reversa contable, prorrateo). Se verifica el ajuste de cartera en ventas a crédito y se agrega el **cambio de producto**: la nota crédito marcada como cambio abre el POS con el cliente y la nueva venta queda vinculada (`sales.exchange_credit_note_id`). |
| Cards de créditos y "Ver abonos" | `ReceivablesPage.tsx`, `receivables.service.ts` | Las cards ya salen de `receivables` (que solo nacen de ventas a crédito). "Ver abonos" abría el formulario de pago: pasa a una vista de solo lectura con cada abono, su recibo de caja y el saldo después de cada movimiento. |

### Fase 3 — Tesorería: recibos y egresos

| Ítem | Dónde está | Cambio |
|---|---|---|
| Recibo de caja como único registro de ingresos | `TreasuryDocumentsPage.tsx`, nuevo `treasury-vouchers.service.ts` | `POST /treasury/cash-receipts`: ingreso manual (contrapartida contable) o abono a cartera (cliente + facturas). Un solo movimiento de caja o banco por el total, un abono por factura vinculado al RC (`receivable_payments.treasury_document_id`). |
| Comprobante de egreso como único registro de egresos | ídem | `POST /treasury/disbursements`: egreso manual o pago a proveedor seleccionando facturas de compra y causaciones del estado de cuenta. |
| Estado de cuenta del proveedor | nuevo `GET /payables/statement` | Facturas de compra y causaciones del proveedor con saldo, edad y pagos. |
| Caja y Bancos solo consulta | `CashPage.tsx`, `TreasuryBankAccountsPage.tsx` | Se retiran "Registrar movimiento" y "Movimiento". También se retiran los botones de abono/pago de cartera, cuentas por pagar y gastos. |

### Fase 4 — Cuentas por pagar y gastos

| Ítem | Dónde está | Cambio |
|---|---|---|
| Causación sin estado ni pago | `ExpenseFormDialog.tsx`, `ExpensesPage.tsx`, `expenses.service.ts` | Toda causación reconoce gasto contra pasivo (`SUPPLIERS`); se retira el medio de pago y el estado del formulario y de la tabla. La API rechaza causaciones pagadas de contado. Se vincula el proveedor (`expenses.supplier_id`). |
| Cuentas por pagar por filtro y por edades | `PayablesPage.tsx`, `payables.service.ts` | Sin consulta no muestra nada. Filtros: proveedor y fecha desde/hasta. Incluye facturas de compra y causaciones. Edades: Corriente (hasta 30 días), 31–60, 61–90 y más de 90, iguales a las de la cartera. |

### Fase 5 — Contabilidad

| Ítem | Cambio |
|---|---|
| Buscador de cuentas | Búsqueda rápida por código o nombre en el plan de cuentas. |
| Buscador de terceros con estado de cuenta | Nueva pantalla: al elegir un tercero muestra su cartera (nos debe) y sus cuentas por pagar (le debemos). |
| Auditoría contable | Nueva vista: asientos descuadrados (débitos ≠ créditos) y documentos anulados o reversados, con filtros de fecha y tipo de documento. |

### Fase 6 — Lector de código de barras

| Ítem | Cambio |
|---|---|
| Pistola en POS y en recepción de compras | `GET /products/barcode/:code` (coincidencia exacta en producto o presentación). Campo con foco automático: Enter busca y agrega, limpia y vuelve a enfocar; si el código no existe, aviso no bloqueante. |

## 3. Decisiones

1. **La venta es su propio documento.** Una venta de contado ya no genera además un recibo de caja. Esto reemplaza, solo para ventas y sus anulaciones, la regla de ADR-002 ("por cada venta una factura y un recibo de caja", reunión del 4 de octubre). Ver ADR-007.
2. **Los recibos y egresos nacen como documento.** El servicio crea el documento con su consecutivo y el movimiento de caja o banco que respalda; el trigger de ADR-002 queda como red de seguridad para los demás flujos.
3. **Un asiento por aplicación.** Un recibo que abona tres facturas publica tres asientos cuadrados (uno por abono, como hasta ahora) bajo el mismo documento, para conservar la reversión individual de abonos.
4. **Edades de cartera y cuentas por pagar.** Días vencidos desde la fecha de vencimiento: Corriente (no vencida o hasta 30 días), 31–60, 61–90, más de 90. Las causaciones sin vencimiento se miden desde su fecha.
5. **Cambio de producto.** La devolución reembolsa por el medio original (o reduce la cartera si fue a crédito) y la venta nueva se cobra normalmente, quedando vinculada a la nota crédito. El efecto neto en caja es la diferencia.

## 4. Pendientes y dudas abiertas

- Los endpoints antiguos de pago por factura (`POST /receivables/:id/payments`, `POST /payables/:id/payments`, `POST /expenses/:id/payments`) y los de movimientos manuales (`POST /cash-movements`, `POST /treasury/bank-accounts/:id/movements`) siguen en la API por compatibilidad: la interfaz ya no los usa y cada uno sigue emitiendo su RC/CE por el trigger. Retirarlos es una decisión aparte (rompe integraciones o scripts que los usen).
- Dos pruebas de integración preexistentes (`accounting-coverage` "nota crédito devuelve el INC…" y `full-system-lifecycle` "Estado de Resultados antes del cierre mensual") fallan cuando la fecha UTC ya cambió y en Bogotá sigue siendo el día anterior (entre las 19:00 y las 24:00): la base usa `CURRENT_DATE` y la prueba la fecha de negocio. No las introdujeron estas correcciones.

- ⚠️ Pantalla del botón "Reservar" (sección 2, fase 1).
- ⚠️ Pantalla de "Organizar diseño" (sección 2, fase 1).
- Confirmar con la contadora que la venta de contado sin recibo de caja adicional cumple lo acordado el 4 de octubre (decisión 1).
- Confirmar si los rangos de edad deben medirse desde el vencimiento (decisión 4) o desde la fecha de la factura.

## 5. Avance por fase

| Fase | Estado | Commit |
|---|---|---|
| 1 | IMPLEMENTADO | ver `git log` (`fix(ventas): …`) |
| 2 | IMPLEMENTADO | ver `git log` (`feat(ventas): …`) |
| 3 | IMPLEMENTADO | ver `git log` (`feat(tesoreria): …`) |
| 4 | IMPLEMENTADO | ver `git log` (`feat(cuentas-por-pagar): …`) |
| 5 | PENDIENTE | — |
| 6 | PENDIENTE | — |
