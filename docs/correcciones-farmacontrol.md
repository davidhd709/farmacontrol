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
| ⚠️ Quitar "Reservar", dejar "Detalle" | **No existe ningún botón "Reservar" en el código** (ver el inventario de la sección 3.3: el Libro Diario tiene "Detalle" y "Reversar"). Lo más cercano son los botones de acción por fila "Abonar"/"Pagar" junto a "Detalle" en `ReceivablesPage` y `PayablesPage`, y "Pagar / Abonar" en `ExpensesPage`. | **PENDIENTE de confirmar.** Las fases 3 y 4 retiran de esas tres pantallas los botones de pago (los pagos pasan a recibos y egresos), así que quedan solo "Detalle"/"Ver abonos". Si el cliente se refería a otra pantalla, debe indicarla. |
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
| `POST /receivables/:id/payments` | `POST /treasury/cash-receipts/collections` (abono a cartera) |
| `POST /payables/:id/payments` | `POST /treasury/disbursements` (tipo `PROVEEDOR`, `FACTURA_COMPRA`) |
| `POST /expenses/:id/payments` | `POST /treasury/disbursements` (tipo `PROVEEDOR`, `CAUSACION_GASTO`) |

Siguen activas las reversiones de abonos y pagos (`.../payments/:paymentId/reverse`), que son anulaciones con su propio movimiento y asiento. Los permisos de cada documento se definieron después (sección 3.4).

## 3.2 Causaciones sin proveedor (2026-11-02)

No se asignan proveedores automáticamente. En Gastos → "Sin proveedor" se listan las causaciones sin proveedor (fecha, concepto, beneficiario registrado, valor y saldo; `GET /expenses/without-supplier`) y se asigna uno a mano (`POST /expenses/:id/supplier`, permiso `expenses:manage`). La asignación no se reasigna (409), no aplica a causaciones anuladas y queda en auditoría (`expenses:supplier_assigned`: usuario, fecha, proveedor y beneficiario anterior).

## 3.3 Pantallas con "Reservar" y "Detalle" (inventario 2026-11-02, sin cambios)

No existe ni existió un botón **"Reservar"** en la web (búsqueda en `apps/web/src` y en el historial de git). La única pantalla con un botón de texto parecido junto a "Detalle" es el **Libro Diario**, que tiene **"Detalle"** y **"Reversar"** en cada asiento: es la candidata más probable (posible error de tipeo "Reservar" ↔ "Reversar").

| Pantalla | Ruta | Archivo | Botones de la fila |
|---|---|---|---|
| **Libro Diario** | `/accounting/journal` | `apps/web/src/features/accounting/pages/JournalEntriesPage.tsx` (líneas ~335–352) | **Detalle** y **Reversar** (este último solo con `accounting:manage` y si el asiento no es una reversión) |
| Cuentas por pagar | `/payables` | `apps/web/src/features/payables/pages/PayablesPage.tsx` (~161) | Detalle |
| Historial de compras | `/purchases` | `apps/web/src/features/purchases/pages/PurchasesListPage.tsx` (~254) | Ver Detalle y Devolución |
| Causación de gastos | `/expenses` | `apps/web/src/features/expenses/pages/ExpensesPage.tsx` (~485) | Ver detalle (icono) y Anular gasto |
| Auditoría y trazabilidad | `/audit` | `apps/web/src/features/audit/pages/AuditLogsPage.tsx` (~498) | Ver detalle de auditoría (icono) |
| Cuentas por cobrar | `/receivables` | `apps/web/src/features/receivables/pages/ReceivablesPage.tsx` | Ver Abonos (hace las veces de detalle; "Abonar" se retiró en la fase 3) |

Pendiente: que el cliente confirme si se refería al Libro Diario.

## 3.4 Permisos por documento de tesorería (decisión del cliente, 2026-11-02)

Cada documento tiene su permiso. El asiento automático que genera no exige el permiso contable; el permiso contable (`accounting:read`) sigue siendo necesario para los documentos manuales (el usuario elige la contrapartida) y para la contabilidad en general. Todo se valida en el backend.

| Documento | Ruta | Permiso | Roles |
|---|---|---|---|
| Recibo de caja de abono a cartera | `POST /treasury/cash-receipts/collections` | `recibo_caja.crear_abono` | cartera, admin |
| Recibo de caja manual (otros ingresos) | `POST /treasury/cash-receipts` (solo `kind: MANUAL`; un abono aquí responde 400 con la ruta correcta) | `accounting:read` + `cash:movements` (efectivo) o `treasury:manage` (transferencia) | admin |
| Comprobante de egreso a proveedor (facturas de compra y causaciones) | `POST /treasury/disbursements` (`kind: PROVEEDOR`) | `comprobante_egreso.crear` | admin |
| Comprobante de egreso manual | `POST /treasury/disbursements` (`kind: MANUAL`) | `comprobante_egreso.crear` + `accounting:read` + permiso del medio | admin |

- **Compras** conserva la causación y la consulta de cuentas por pagar, pero no paga (403).
- No existe un rol "tesorería": por ahora `comprobante_egreso.crear` solo lo tiene admin. Si se crea ese rol, basta asignarle el permiso.
- **Supervisor** tiene `receivables:manage` pero no `recibo_caja.crear_abono`: no registra recibos. Si debe hacerlo, se le asigna el permiso.
- En la web, cartera registra el recibo desde **Cuentas por cobrar → "Nuevo recibo de caja"** (solo abono a cartera; elige el cliente del maestro de clientes, sin acceso a terceros). En Recibos de Caja y Comprobantes de Egreso cada modo se ofrece según estos permisos.
- Pruebas por rol (`treasury-vouchers`, "permisos por documento"): cartera y admin abonan (201) aunque cartera no tenga permiso contable, y se publica el asiento cuadrado; cajero, compras, supervisor e inventario reciben 403; cartera no registra recibos manuales ni egresos; solo admin paga proveedores; un egreso manual sin permiso contable se rechaza.

## 3.5 Anulación propia por tipo de documento (verificación 2026-11-02)

> Resuelto en la sección 3.8: el cliente decidió retirar "Reversar" y se implementaron las anulaciones que faltaban.

Estado al momento de la verificación: Verificación en el código y con PostgreSQL real:

| Documento | ¿Anulación propia? | Ruta y permiso | Reverso contable | Dinero, inventario y saldos | En la web |
|---|---|---|---|---|---|
| **Venta** | **Sí** | `POST /sales/:id/cancel` (`sales:cancel`) | Reversa el asiento de la venta (`handleSaleCancelled`) | Reintegra inventario, devuelve caja o banco y anula la cartera; se rechaza si tiene notas crédito o abonos vigentes | Historial de ventas → Anular |
| **Devolución (nota crédito)** | **No** | — | — | Es definitiva una vez confirmada | — |
| **Recibo de caja de abono a cartera** | **Parcial**: se reversa cada abono, no el recibo | `POST /receivables/:id/payments/:paymentId/reverse` (`receivables:manage`) | Reversa el asiento del abono (`handleCustomerPaymentReversed`) | Restituye el saldo de la factura y saca el dinero de caja o banco con su propio movimiento y comprobante; el recibo sigue vigente (los documentos de tesorería son inmutables) | Cuentas por cobrar → Ver abonos → Revertir |
| **Recibo de caja manual** | **No** | — (la reversión de movimientos bancarios se retiró: 410) | — | Se corrige con el documento contrario (egreso manual), que es un registro nuevo, no un reverso | — |
| **Comprobante de egreso a proveedor** | **Parcial**: se reversa cada pago, no el comprobante | `POST /payables/:id/payments/:paymentId/reverse` (`payables:manage`) y `POST /expenses/payments/:paymentId/reverse` (`expenses:manage`) | Reversa el asiento del pago (`handleSupplierPaymentReversed` / `handleExpensePaymentReversed`) | Restituye el saldo y devuelve el dinero a caja o banco | Cuentas por pagar → movimientos → Revertir; Gastos → revertir pago |
| **Comprobante de egreso manual** | **No** | — | — | Igual que el recibo manual | — |
| **Causación de gasto** | **Sí** | `POST /expenses/:id/cancel` (`expenses:manage`) | Reversa el asiento de la causación (`handleExpenseCancelled`) | Exige revertir antes los pagos; si se pagó de contado, devuelve el dinero | Gastos → Anular gasto |

Pruebas existentes: `credit-and-debit-notes` (anular venta con notas crédito y anulación simultánea), `expenses` ("reversa pago de gasto…", "anula una causación pendiente…"), `sale.controller` y `accounting-audit-statement` (reversión de abonos de cartera). y `treasury-vouchers` ("revertir un pago a proveedor del comprobante…", agregada en esta verificación porque no existía), `accounting-audit-statement` (los anulados muestran el documento reversado).

**Riesgo del botón "Reversar" del Libro Diario.** Reversa cualquier asiento, también los automáticos. Lo comprobé con una venta de contado: reversar su asiento desde el Libro Diario responde 201, pero la venta sigue COMPLETADA, el inventario no vuelve (95 de 100) y el dinero sigue en caja; el mayor deja de cuadrar con los auxiliares. Si después se anula la venta, la anulación sale bien (inventario 100, egreso de caja) y no duplica el reverso, porque reutiliza el que ya existe; entre los dos momentos, la contabilidad y la operación no coinciden. Mientras el cliente decide, la recomendación es limitar el botón a los asientos manuales y reversar los automáticos solo desde la anulación de su documento.

Faltan anulaciones propias para la **nota crédito**, el **recibo de caja** y el **comprobante de egreso** como documento completo (y sus versiones manuales). Hay que decidir con el cliente si se agregan.

## 3.6 Saldo inicial bancario: diagnóstico antes de migrar (2026-11-02, sin cambios)

Decisión del cliente: una sola fuente. Los saldos iniciales se registran solo desde el asistente contable; la cuenta bancaria no genera asiento y muestra el saldo contable. Antes de migrar se pidió este reporte.

**Cómo funciona hoy (código).** Hay dos fuentes que no se hablan:

1. **Cuenta bancaria** (Tesorería → Bancos → nueva cuenta, campo "Saldo inicial"): `TreasuryService.createAccount` guarda `initial_balance` y `current_balance` y, si el valor es mayor que cero, crea un movimiento bancario `DEPOSIT` con `reference_document_type = 'INITIAL_BALANCE'`. **Nunca genera asiento**: no llama al motor contable, y el trigger de documentos de tesorería omite `INITIAL_BALANCE`, así que tampoco hay recibo de caja. Mueve el auxiliar de bancos, no el mayor.
2. **Asistente contable → saldos iniciales**: publica un asiento `OPENING_BALANCE` con las cuentas del PUC (incluidas las de bancos). Mueve el mayor, no el auxiliar.

Si la empresa usó las dos, el banco queda contado dos veces en la operación frente a la contabilidad, o el mayor y el auxiliar no coinciden. Por el código, **ningún saldo inicial bancario pudo haber generado asiento**: todos los que existan están sin asiento.

**Datos revisados.** La única base a la que tengo acceso es la local de desarrollo (`farmacia_db` en el contenedor `farmacia-postgres-dev`): **0 cuentas bancarias, 0 movimientos `INITIAL_BALANCE` y ningún asiento `OPENING_BALANCE`**. No hay nada que migrar ahí. La base del cliente no la he revisado: hay que ejecutar en ella el diagnóstico de solo lectura `infra/scripts/diagnostics/saldos-iniciales-bancarios.sql` (lo ejecuté sin errores en la base local), que lista:

1. cada cuenta bancaria con saldo inicial, si tiene movimiento inicial y cuántos asientos lo respaldan (hoy siempre 0);
2. los saldos iniciales vigentes del asistente y su neto en bancos (1110 y subcuentas);
3. por cuenta bancaria, el saldo del auxiliar frente al saldo contable de su subcuenta del PUC.

**Propuesta de migración (no ejecutada, espera aprobación).** Según lo que salga en la base del cliente:

- Cuenta con saldo inicial **y** el mismo valor en el asiento de saldos iniciales del asistente: no se crea asiento; solo se deja de usar el saldo inicial de la cuenta.
- Cuenta con saldo inicial **sin** respaldo en el asistente: registrar ese valor en los saldos iniciales del asistente (contra la cuenta de apertura que defina el contador) y no tocar el movimiento histórico, que es inmutable.
- Después: quitar el campo "Saldo inicial" del formulario de cuenta bancaria (la API lo rechazará con un mensaje que lleve al asistente) y mostrar en Bancos el **saldo contable** de la subcuenta del PUC, con el saldo del auxiliar como dato de conciliación mientras existan movimientos anteriores.

Pregunta para el cliente: ¿una cuenta sin subcuenta del PUC asignada se bloquea hasta que se le asigne, o muestra el saldo de la cuenta 1110 general?

## 3.7 Fechas de producción en el día de Bogotá (2026-11-02)

La base y el servidor corren en UTC; desde las 19:00 de Colombia la fecha UTC ya es la del día siguiente. Se revisaron edades, cortes, filtros desde/hasta y fechas de documentos. Las columnas de fecha calendario (`@db.Date`: vencimientos, fechas de compra, de gasto, de pago, de asiento, de documento) ya se manejaban bien; los filtros sobre instantes (`created_at`) ya usaban `businessDayStart/End`, y las edades ya contaban desde el día de emisión de Bogotá. Se corrigió:

| Dónde | Problema | Corrección |
|---|---|---|
| Base de datos: `guard_product_tax_profile_history` y `protect_accounting_mapped_account` | Comparaban con `CURRENT_DATE` (UTC). De noche, un perfil tributario que empieza "hoy" se rechazaba como iniciado en el pasado (la falla nocturna de `accounting-coverage`) | Migración `20261102120000_business_date_in_triggers`: función `business_date()` (día de Bogotá) y los dos triggers la usan. Solo reemplaza funciones |
| `POST /journal-entries/:id/reverse` sin fecha | El reverso tomaba la fecha UTC (quedaba con fecha de mañana) | `businessToday()` |
| Libro Diario, filtro "hasta" | `setHours(23,59)` con la hora local del servidor sobre una fecha calendario: según la zona podía incluir el día siguiente | Comparación por fecha calendario |
| Estado de cuenta por tercero | La fecha de la factura salía del `created_at` en UTC (una venta de las 23:30 aparecía al día siguiente) | Día de Bogotá |
| Estado de cuenta de proveedores | Igual, cuando el documento no tiene fecha de compra | Día de Bogotá |
| Importación del PUC | Mapeos vigentes calculados con el día UTC | Día de Bogotá |
| Web: atajos de fecha, Libro Diario, balance, gastos, saldos iniciales, perfiles tributarios, cierres y períodos | Usaban la zona horaria del equipo (bien en Colombia, mal en un equipo con otra zona) | `businessToday`, `businessYear` y `calendarMonthBounds` en `apps/web/src/utils/business-date.ts` |
| Web: recibo de caja, fecha de la factura a abonar | `createdAt.slice(0, 10)` (UTC) | Día de Bogotá |

Pruebas cerca de medianoche: `business-date-midnight` (integración con PostgreSQL: `business_date()` a las 23:59 y 00:00, triggers sin `CURRENT_DATE`, reverso a las 23:30, filtro "hasta", estado de cuenta de una factura de las 23:30), `business-date.spec` y `aging.spec` (23:59/00:00, cambio de año, edad a uno y otro lado de la medianoche) y `quick-date-range.test` en la web (último y primer minuto del mes, 31 de diciembre, febrero bisiesto; pasa con `TZ=Asia/Tokyo` y `TZ=America/Bogota`).

## 3.8 Sin "Reversar" en el Libro Diario: cada documento se anula (decisión del cliente, 2026-11-02)

El botón **"Reversar"** salió de la tabla del Libro Diario (queda solo **"Detalle"**) y la ruta `POST /journal-entries/:id/reverse` responde **410** en el backend. Las correcciones se hacen anulando el documento de origen. Antes de retirarlo se implementaron las anulaciones que faltaban (sección 3.5):

| Documento | Anulación | Ruta y permiso | Qué hace, en una transacción |
|---|---|---|---|
| Venta | ya existía | `POST /sales/:id/cancel` (`sales:cancel`) | Sin cambios. Ahora solo la bloquean las notas crédito **vigentes** |
| **Nota crédito (devolución)** | **nueva** | `POST /credit-notes/:id/cancel` (`sales:cancel`) | La mercancía reintegrada vuelve a salir de los mismos lotes (kardex `SALIDA_ANULACION_DEVOLUCION`, submayor `SALE_RETURN_CANCELLATION`); el reembolso vuelve a caja o banco, o la factura vuelve a deberse en cartera; se reversa el asiento y, si la mercancía sale a un costo distinto del que entró, se registra la diferencia entre inventario y costo de ventas (mayor = submayor). Se rechaza si el lote ya no tiene las unidades o si la devolución entregó un cambio vigente (primero se anula esa venta). En la web: Historial de ventas → **Notas crédito** → Anular |
| **Recibo de caja de abono** | **nueva** | `POST /treasury/cash-receipts/collections/:id/cancel` (`recibo_caja.crear_abono`) | Reversa cada abono vigente con su asiento y saca de caja o banco, en **un solo movimiento**, lo que seguía aplicado (los abonos revertidos antes uno a uno no se tocan) |
| **Recibo de caja manual** | **nueva** | `POST /treasury/cash-receipts/:id/cancel` (`accounting:read` + permiso del medio) | Reversa el asiento contra la contrapartida y saca el dinero |
| **Comprobante de egreso** (proveedor o manual) | **nueva** | `POST /treasury/disbursements/:id/cancel` (`comprobante_egreso.crear`; el manual además `accounting:read` + medio) | Reversa cada pago vigente (facturas de compra y causaciones) o el asiento manual y devuelve el dinero en un solo movimiento |
| Causación | ya existía | `POST /expenses/:id/cancel` (`expenses:manage`) | Sin cambios |
| **Nota contable manual**, saldos iniciales y cierre anual | **nueva ruta** | `POST /journal-entries/:id/annul` (`accounting:manage`) | Desde el **detalle** del asiento en el Libro Diario → Anular. Rechaza (409) cualquier asiento generado por un documento |

- Un documento de tesorería anulado queda `ANULADO` con usuario, fecha y motivo. El trigger de inmutabilidad solo permite ese cambio (VIGENTE → ANULADO, una vez); ningún otro campo se modifica y nunca se borra. Las notas crédito tienen `CONFIRMADA`/`ANULADA` con los mismos datos.
- El movimiento contrario de una anulación de tesorería (`TREASURY_DOCUMENT_CANCEL`) no genera otro recibo o egreso automático: pertenece al documento anulado.
- Los documentos automáticos (los recibos y egresos que generan ventas, devoluciones y anulaciones) no se anulan desde Tesorería (409): se anula su documento de origen.
- Una nota anulada deja de contar en los reportes tributarios, el top de productos y el saldo por devolver de la venta; en "Ver abonos" aparece la nota y su anulación.
- Migraciones: `20261102130000_document_annulments` (estados, trigger, tipo del submayor) y `20261102130100_credit_note_annulment_kardex_type` (tipo del kardex). Solo agregan columnas y reglas; los datos existentes quedan CONFIRMADA / VIGENTE.
- Pruebas: `document-annulments` (integración con PostgreSQL: devolución de contado y a cartera, bloqueos por lote y por cambio, recibo de abono con un abono ya revertido, egreso con factura y causación, recibo manual, documento automático, inmutabilidad, permisos), `accounting-engine-reports` (410 y 409 desde el libro, anulación de nota manual con y sin permiso) y en la web `journal-entries`, `document-annulments`.

## 4. Pendientes y dudas abiertas

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
