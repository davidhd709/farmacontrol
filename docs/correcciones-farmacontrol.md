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
| Renombrar ingreso manual como "Recibo de caja" | `CreateCashMovementDialog.tsx` (botón "+ Registrar Movimiento" de `CashPage`) | El registro se reemplazó en la fase 3 por el formulario de recibo de caja en Tesorería. Control de caja también muestra "Recibo de caja" en el movimiento y el filtro para `INGRESO_MANUAL`. |
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
| Buscador de cuentas | `AccountAutocomplete` (inicio del código o parte del nombre) en la nueva pantalla "Cuentas y Terceros" (con el auxiliar del periodo) y en la contrapartida de recibos y egresos manuales. El plan de cuentas ya tenía búsqueda. |
| Buscador de terceros con estado de cuenta | Nueva pantalla: al elegir un tercero muestra su cartera (nos debe) y sus cuentas por pagar (le debemos). |
| Auditoría contable | Nueva vista: asientos descuadrados (débitos ≠ créditos) y documentos anulados o reversados, con filtros de fecha y tipo de documento. |

### Fase 6 — Lector de código de barras

| Ítem | Cambio |
|---|---|
| Pistola en POS y en recepción de compras | `GET /products/barcode/:code` (coincidencia exacta en producto o presentación). Campo con foco automático: Enter busca y agrega, limpia y vuelve a enfocar; si el código no existe, aviso no bloqueante. |

## 3. Decisiones

1. **La venta es su propio documento** (confirmado por el cliente el 2026-11-02). Una venta de contado ya no genera además un recibo de caja. Esto reemplaza, solo para ventas y sus anulaciones, la regla de ADR-002 ("por cada venta una factura y un recibo de caja", reunión del 4 de octubre). Ver ADR-007.
2. **Los recibos y egresos nacen como documento.** El servicio crea el documento con su consecutivo y el movimiento de caja o banco que respalda; el trigger de ADR-002 queda como red de seguridad para los demás flujos.
3. **Un asiento por aplicación.** Un recibo que abona tres facturas publica tres asientos cuadrados (uno por abono, como hasta ahora) bajo el mismo documento, para conservar la reversión individual de abonos.
4. **Edades de cartera y cuentas por pagar.** Rangos: Corriente (0–30 días), 31–60, 61–90 y más de 90. La fecha base es configurable en la política contable de la empresa (`agingBaseDate`): `DUE_DATE_OR_ISSUE` (vencimiento; si el documento no tiene, emisión) es la regla vigente y la de toda versión que no la indique; `ISSUE_DATE` cuenta desde la emisión. La regla definitiva está pendiente de confirmación del cliente.
5. **Cambio de producto.** La devolución reembolsa por el medio original (o reduce la cartera si fue a crédito) y la venta nueva se cobra normalmente, quedando vinculada a la nota crédito. El efecto neto en caja es la diferencia.

## 3.1 Rutas retiradas (2026-11-02)

Todo ingreso o egreso de dinero nace en un recibo de caja o un comprobante de egreso. Estas rutas responden **410 Gone** con la ruta que las reemplaza; los registros históricos siguen consultables por sus `GET`:

| Ruta retirada | Reemplazo |
|---|---|
| `POST /cash-movements` | `POST /treasury/cash-receipts` o `POST /treasury/disbursements` (tipo `MANUAL`, efectivo) |
| `POST /treasury/bank-accounts/:id/movements` | Recibo o egreso `MANUAL` por transferencia |
| `POST /treasury/bank-accounts/:id/movements/:movementId/reverse` | El documento contrario (recibo o egreso manual) |
| `POST /receivables/:id/payments` | `POST /treasury/cash-receipts` (tipo `CARTERA`) |
| `POST /payables/:id/payments` | `POST /treasury/disbursements` (tipo `PROVEEDOR`, `FACTURA_COMPRA`) |
| `POST /expenses/:id/payments` | `POST /treasury/disbursements` (tipo `PROVEEDOR`, `CAUSACION_GASTO`) |

Siguen activas las reversiones de abonos y pagos (`.../payments/:paymentId/reverse`), que son anulaciones con su propio movimiento y asiento. Consecuencia para los roles: cartera y compras ya no registran abonos ni pagos por API (en la interfaz ya no podían desde la fase 3); los recibos y egresos exigen el permiso contable. Queda pendiente la decisión del cliente sobre los permisos del rol cartera.

## 3.2 Causaciones sin proveedor (2026-11-02)

No se asignan proveedores automáticamente. En Gastos → "Sin proveedor" se listan las causaciones sin proveedor (fecha, concepto, beneficiario registrado, valor y saldo; `GET /expenses/without-supplier`) y se asigna uno a mano (`POST /expenses/:id/supplier`, permiso `expenses:manage`). La asignación no se reasigna (409), no aplica a causaciones anuladas y queda en auditoría (`expenses:supplier_assigned`: usuario, fecha, proveedor y beneficiario anterior).

## 4. Pendientes y dudas abiertas

- `accounting-coverage` ("nota crédito devuelve el INC…") falla de noche, entre las 19:00 y las 24:00 de Bogotá, cuando la fecha UTC ya cambió: es preexistente. La prueba de `full-system-lifecycle` que dependía de octubre de 2026 se corrigió para usar la fecha de negocio de la corrida.

- ⚠️ Pantalla del botón "Reservar" (sección 2, fase 1).
- ⚠️ Pantalla de "Organizar diseño" (sección 2, fase 1).
- Confirmar la regla definitiva de fecha base de las edades (hoy: vencimiento con respaldo en emisión; configurable en Empresa → Política contable).

## 5. Avance por fase

| Fase | Estado | Commit |
|---|---|---|
| 1 | EN PROGRESO: falta identificar las pantallas de "Reservar" y "Organizar diseño" | `9ddf590` y ajustes posteriores |
| 2 | IMPLEMENTADO | ver `git log` (`feat(ventas): …`) |
| 3 | IMPLEMENTADO | ver `git log` (`feat(tesoreria): …`) |
| 4 | IMPLEMENTADO | ver `git log` (`feat(cuentas-por-pagar): …`) |
| 5 | IMPLEMENTADO | ver `git log` (`feat(contabilidad): …`) |
| 6 | IMPLEMENTADO | ver `git log` (`feat(catalogo): …`) |
