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
| **Recibo de caja de abono** | **nueva** | `POST /treasury/cash-receipts/collections/:id/cancel` (`recibo_caja.anular`, ver 3.11) | Reversa cada abono vigente con su asiento y saca de caja o banco, en **un solo movimiento**, lo que seguía aplicado (los abonos revertidos antes uno a uno no se tocan) |
| **Recibo de caja manual** | **nueva** | `POST /treasury/cash-receipts/:id/cancel` (`recibo_caja.anular` + `accounting:read` + permiso del medio) | Reversa el asiento contra la contrapartida y saca el dinero |
| **Comprobante de egreso** (proveedor o manual) | **nueva** | `POST /treasury/disbursements/:id/cancel` (`comprobante_egreso.anular`; el manual además `accounting:read` + medio) | Reversa cada pago vigente (facturas de compra y causaciones) o el asiento manual y devuelve el dinero en un solo movimiento |
| Causación | ya existía | `POST /expenses/:id/cancel` (`expenses:manage`) | Sin cambios |
| **Nota contable manual**, saldos iniciales y cierre anual | **nueva ruta** | `POST /journal-entries/:id/annul` (`accounting:manage`) | Desde el **detalle** del asiento en el Libro Diario → Anular. Rechaza (409) cualquier asiento generado por un documento |

- Un documento de tesorería anulado queda `ANULADO` con usuario, fecha y motivo. El trigger de inmutabilidad solo permite ese cambio (VIGENTE → ANULADO, una vez); ningún otro campo se modifica y nunca se borra. Las notas crédito tienen `CONFIRMADA`/`ANULADA` con los mismos datos.
- El movimiento contrario de una anulación de tesorería (`TREASURY_DOCUMENT_CANCEL`) no genera otro recibo o egreso automático: pertenece al documento anulado.
- Los documentos automáticos (los recibos y egresos que generan ventas, devoluciones y anulaciones) no se anulan desde Tesorería (409): se anula su documento de origen.
- Una nota anulada deja de contar en los reportes tributarios, el top de productos y el saldo por devolver de la venta; en "Ver abonos" aparece la nota y su anulación.
- Migraciones: `20261102130000_document_annulments` (estados, trigger, tipo del submayor) y `20261102130100_credit_note_annulment_kardex_type` (tipo del kardex). Solo agregan columnas y reglas; los datos existentes quedan CONFIRMADA / VIGENTE.
- Pruebas: `document-annulments` (integración con PostgreSQL: devolución de contado y a cartera, bloqueos por lote y por cambio, recibo de abono con un abono ya revertido, egreso con factura y causación, recibo manual, documento automático, inmutabilidad, permisos), `accounting-engine-reports` (410 y 409 desde el libro, anulación de nota manual con y sin permiso) y en la web `journal-entries`, `document-annulments`.

## 3.9 Ajustes del Libro Diario, paginación y fechas (2026-11-02)

- **Estado en español**: "Contabilizado" (antes POSTED), "Borrador", "Anulado" (asiento que ya fue anulado) y "Anulación" (el asiento que anula a otro). Los orígenes también salen en español (Venta, Devolución, Cobro de cartera, Causación, Saldos iniciales, Cierre anual…), nunca el código interno.
- **Documento Ref.** muestra el número legible (FAC-000007, NC-000001, RC-000003, CE-000002, la factura de compra, NTC-000001) con enlace a la pantalla donde se consulta, que abre ya filtrada (`?buscar=`): historial de ventas, recibos de caja, comprobantes de egreso, compras y gastos. Una anulación muestra el documento del asiento que anula. Lo resuelve la API (`sourceDocument` en `JournalEntryDto`, consulta de solo lectura en `journal-source-documents.ts`).
- **Paginación en español en toda la aplicación**: el tema de Material UI aplica el locale `esES` de forma global ("Filas por página:", "1–1 de 1", "Ir a la página siguiente"); se quitaron las etiquetas puestas tabla por tabla.
- **Fechas dd/mm/aaaa** en todas las tablas y vistas con `formatDate` / `formatDateTime` (`apps/web/src/utils/date-format.ts`): una fecha calendario se muestra tal cual y un instante se convierte al día de Bogotá (una venta de las 23:30 no aparece al día siguiente). Los campos de fecha de formularios y filtros usan el selector compartido `DateField` (ver 3.12).
- **Subtítulo** del Libro Diario: "Registro cronológico de los asientos contables generados por los documentos del sistema."
- Pruebas: `journal-entries.test` (enlace, estados, fechas, paginación, subtítulo), `date-format.test` (también cerca de medianoche y con `TZ=Asia/Tokyo`) y `accounting-audit-statement` (número legible de venta y recibo).

## 3.10 Revisión responsive y de diseño (2026-11-02)

Revisión de las 41 pantallas en 360, 768, 1024 y 1440 px, con capturas antes y después en `docs/responsive/` y un reporte automático de desbordes por pantalla (ver `docs/responsive/README.md`). Primero se corrigieron los componentes compartidos, para que el arreglo se propague:

| Componente | Cambio |
|---|---|
| **Tema** (`app-theme.ts`) | Botones: relleno uniforme (16 px; 12 px los pequeños), texto en una línea y sin encogerse por el contenido vecino (el "Consultar" de Cuentas por pagar ya no se sale). Títulos de página: todo `h1` con el mismo tamaño (1,75 rem; 1,375 rem en móvil). Tablas: encabezados en una línea y `TableContainer` con scroll horizontal propio. `Container` sin margen lateral propio: el layout da el margen y no se duplica en móvil |
| **Layout** | Menú lateral temporal (colapsable con el botón ☰) hasta 1199 px, es decir en móvil y tablet incluido 1024 px; fijo en escritorio. Empieza cerrado en móvil y tablet |
| **Espaciado** | Todas las pantallas usan el mismo margen vertical (`py: { xs: 1, md: 2 }`); antes variaba entre `p: 3`, `p: { xs: 2, md: 4 }` y `py: 4` |
| **`FilterBar`** (nuevo) | Grilla de filtros: una columna en móvil, dos en tablet y columnas de 200 a 280 px en escritorio (un campo de fecha ya no ocupa todo el ancho); acciones (Consultar, Filtrar, Limpiar) juntas, alineadas a la derecha y separadas; Enter consulta |
| **`PageHeader`** (nuevo) | Título, descripción y acciones; en móvil las acciones bajan debajo del título |
| **Grillas** | `1fr` → `minmax(0, 1fr)` en toda la app: una tabla ancha ya no estira la grilla fuera de la pantalla (el POS en 360 px) |

Pantallas ajustadas:

- **Barra de filtros**: Cuentas por pagar, Cuentas por cobrar, Libro Diario, Estado de resultados, Historial de ventas, Historial de compras, Lotes, Movimientos de inventario (Kardex), Control de caja y Auditoría (botón Limpiar).
- **Encabezado**: Cuentas por pagar, Cuentas por cobrar, Causación de gastos y Control de caja (sus botones se salían en 360 px).
- **Tablas con scroll propio**: Usuarios, Catálogo tributario, Causación de gastos, Saldos iniciales, Empresa (sucursales y política), Bloqueo de documentos, Cierre anual y las tablas de los diálogos (nota contable, devolución, nota débito, comprobante, causaciones sin proveedor, categorías, perfiles tributarios, recibo y egreso).
- **POS**: la búsqueda y el carrito ya no se recortan en 360 px.
- **Recibos de caja y comprobantes de egreso**: el número del documento es un enlace, no un botón sin relleno.
- **Todas**: título, margen vertical, botones y menú lateral (tema y layout).

Resultado del reporte: 0 pantallas con scroll horizontal de página, 0 botones cortados o sin relleno y 0 elementos recortados en los cuatro anchos.

## 3.11 Permiso propio para anular recibos y egresos; permisos API vs. web (2026-11-02)

Anular ya no usa el permiso de creación. Dos permisos nuevos: `recibo_caja.anular` y `comprobante_egreso.anular`. El seed los asigna a todo rol con permiso contable (`accounting:read`); hoy solo lo tiene admin. Cartera conserva `recibo_caja.crear_abono`.

| Ruta | Antes | Ahora |
|---|---|---|
| `POST /treasury/cash-receipts/collections/:id/cancel` | `recibo_caja.crear_abono` (cartera anulaba) | `recibo_caja.anular` |
| `POST /treasury/cash-receipts/:id/cancel` | `accounting:read` | `recibo_caja.anular` + `accounting:read` |
| `POST /treasury/disbursements/:id/cancel` | `comprobante_egreso.crear` | `comprobante_egreso.anular` |
| `POST /receivables/:id/payments/:paymentId/reverse` | `receivables:manage` (cartera y supervisor) | `receivables:manage` + `recibo_caja.anular`: reversar un abono anula parte de su recibo |
| `POST /payables/:id/payments/:paymentId/reverse` | `payables:manage` (compras y supervisor) | `payables:manage` + `comprobante_egreso.anular`: revertir un pago anula parte de su egreso |
| `POST /expenses/payments/:paymentId/reverse` | `expenses:manage` (supervisor) | `expenses:manage` + `comprobante_egreso.anular` |

En la web, "Anular" (Recibos de caja, Comprobantes de egreso), "Revertir" (Cuentas por cobrar → Ver abonos; Cuentas por pagar → detalle de la factura) y "Revertir pago" (Causación de gastos → detalle) siguen las mismas reglas. Cuentas por cobrar no tiene botón "Anular".

Pruebas: `document-annulments` (integración: cartera crea el abono y recibe 403 al anularlo y al reversar un abono; compras y supervisor reciben 403 al revertir pagos a proveedores y de causaciones; admin anula), `rbac` (solo los roles con `accounting:read` reciben los permisos de anulación) y en la web `document-annulments` y `receivables`.

**Cruce de permisos API vs. pantallas** (qué puede hacer cada rol por la API sin que la web se lo ofrezca). Las rutas de pago directo ya respondían 410. Lo que queda:

| Rol | Por la API puede | En la web | Estado |
|---|---|---|---|
| cartera | Anular recibos de abono; reversar abonos | Recibos de caja no está en su menú; "Revertir" sí se le mostraba | **Corregido** (tabla de arriba) |
| supervisor | Reversar abonos (`receivables:manage`) | "Revertir" en Ver abonos | **Corregido** |
| cartera | Crear, editar y desactivar clientes (`customers:manage`) | No tiene POS ni Terceros: ninguna pantalla de clientes | **Corregido** (2026-11-03): ve el directorio de terceros filtrado a clientes, crea y edita; no desactiva |
| cajero | Editar y desactivar clientes (`PUT`/`DELETE /customers/:id`) | El POS solo crea clientes | **Corregido** (2026-11-03): solo `customers:create` |
| compras | Crear, editar y desactivar proveedores (`suppliers:manage` en `/suppliers`) | Sin `third_parties:read` no ve Terceros | **Corregido** (2026-11-03): ve el directorio filtrado a proveedores, crea y edita; no desactiva |
| supervisor | Desactivar terceros (`third_parties:manage`) | "Desactivar" en Terceros | **Corregido** (2026-11-03): desactivar es solo de admin |
| compras, supervisor | Reversar pagos a proveedores (`payables:manage`) | "Revertir" en Cuentas por pagar | **Corregido**: exige `comprobante_egreso.anular` (2026-11-03) |
| supervisor | Reversar pagos de causaciones (`expenses:manage`) | "Revertir pago" en Causación de gastos | **Corregido**: exige `comprobante_egreso.anular` (2026-11-03) |
| inventario, supervisor | Encolar y consultar trabajos de alertas (`POST`/`GET /alerts/jobs`) | Solo "Escanear lotes ahora" (`/alerts/evaluate`) | Bajo riesgo; no se cambió |
| inventario, supervisor | Crear ubicaciones (`POST /inventory/locations`) | Ninguna pantalla crea ubicaciones | Bajo riesgo; no se cambió |

**Permisos de terceros (decisión del cliente, 2026-11-03).** Regla: lo que un rol no tiene en pantalla no lo puede hacer por la API.

| Acción | Ruta | Permiso | Roles |
|---|---|---|---|
| Ver el directorio de terceros | `GET /third-parties`, `GET /third-parties/:id` | `third_parties:read` (todos los tipos), o `customers:manage` (solo clientes) o `suppliers:manage` (solo proveedores) | admin, supervisor; cartera (clientes); compras (proveedores) |
| Crear y editar en el directorio | `POST /third-parties`, `PUT /third-parties/:id` | `third_parties:manage` (todos), o `customers:manage` / `suppliers:manage` con el mismo alcance | admin, supervisor; cartera; compras |
| Crear cliente desde el POS | `POST /customers` | `customers:create` (nuevo) | admin, supervisor, cajero, cartera |
| Editar cliente | `PUT /customers/:id` | `customers:manage` | admin, supervisor, cartera |
| Crear y editar proveedor | `POST`, `PUT /suppliers/:id` | `suppliers:manage` | admin, supervisor, compras |
| Desactivar y reactivar | `PATCH /third-parties/:id/deactivate` y `/activate`, `DELETE /customers/:id`, `DELETE /suppliers/:id` y `isActive` en cualquier `PUT` | `third_parties:deactivate` (nuevo) | admin |

- **El alcance lo aplica la API**, no solo la web: con alcance de clientes, el listado devuelve solo clientes aunque se pida `role=ALL`; pedir `role=SUPPLIER` (u otro tipo) responde 403; un proveedor por id responde 404 (no revela que existe). Crear o editar no puede asignar ni quitar tipos fuera del alcance (403), y el tercero debe conservar su tipo.
- Un `PUT` con `isActive` igual al estado actual no es un cambio y se acepta; cambiarlo exige `third_parties:deactivate`.
- En la web, cartera y compras ven "Directorio de Terceros" con una sola pestaña (Clientes o Proveedores); el formulario deja fijo su tipo y bloquea los demás. "Desactivar"/"Activar" solo aparecen con `third_parties:deactivate`; "Datos tributarios" del proveedor, con `suppliers:manage`. El POS ofrece "Nuevo cliente" con `customers:create`.
- **Compra con proveedor nuevo:** la recepción de compras no crea proveedores en línea; se elige de la lista (`GET /suppliers`). Compras los registra en el directorio.
- **Seed:** los roles base ahora se sincronizan: un permiso retirado de la definición se borra también en bases existentes (p. ej. `customers:manage` del cajero). Hay que ejecutar `pnpm db:seed:rbac` después de desplegar.
- `@RequireAnyPermissions` (nuevo) en el guard: basta uno de los permisos; la matriz de autorización lo entiende.
- Pruebas: `third-party-scope` (integración por rol: cajero, cartera, compras, inventario, supervisor y admin; seed que retira permisos), `authorization-matrix`, `permissions.guard` (unidad) y en la web `third-parties-scope`.

Los casos de bajo riesgo (trabajos de alertas, ubicaciones) quedan como están.

## 3.12 Selector de fecha compartido (2026-11-02)

Los 49 campos de fecha nativos (`<input type="date">`) de formularios y filtros se reemplazaron por un solo componente, `apps/web/src/components/DateField.tsx`, sobre el date picker de MUI X (`@mui/x-date-pickers` 9.15.0 con `dayjs`): español (es), formato **dd/mm/aaaa** y zona **America/Bogota**. Un cambio en ese componente llega a todas las pantallas; la recepción de compras lo usa a través de `PurchaseFormField`.

- **Mismo contrato que el input nativo:** recibe y entrega la fecha calendario `YYYY-MM-DD` como texto, sin convertirla a un instante, así que la API recibe exactamente el día elegido. Una fecha incompleta, inválida (30/02) o borrada se entrega como `''`.
- **Zona:** el "hoy" del calendario es el día de Bogotá, también desde un equipo en otra zona. La conversión se ancla al mediodía, porque `dayjs.tz` corre el día cuando la medianoche no existe en la zona del equipo (cambio de horario, p. ej. Santiago de Chile el 6 de septiembre).
- **Accesibilidad:** cada sección (día, mes, año) es un `spinbutton` con nombre; los campos sin etiqueta visible (líneas de compra) llevan `aria-label`. Los campos opcionales se pueden borrar con el botón de limpiar.
- **Pruebas:** `date-field.test` (ida y vuelta sin cambio de día con el equipo en Bogotá, UTC, Kiritimati +14, Pago Pago −11, Tokio y Santiago; escribir a las 23:59:59 y a las 00:00:01 de Bogotá; el "hoy" del calendario a las 22:30 de Bogotá con el equipo ya en el día siguiente; placeholder dd/mm/aaaa). Las pruebas web que escribían fechas usan `test/support-date.ts` y la E2E de compras `tests/e2e/support/date-field.ts`, que teclean la fecha como el usuario. Del lado de la API, el día de Bogotá ya estaba cubierto por `business-date-midnight` (3.7).
- **Responsive:** el selector es más ancho que el input nativo; en Balance General la fila "Fecha de corte + Consultar" ahora se envuelve a 360 px.

## 3.13 Diagnóstico de saldos bancarios, solo lectura (2026-11-02)

`packages/database/src/diagnostics/bank-balances.ts`, con la CLI `pnpm db:diagnose:banks`. Complementa la consulta SQL de la sección 3.6 con un reporte en markdown o CSV. **Se ejecuta contra una copia de la base del cliente, nunca contra producción**; no se ha ejecutado contra ninguna base del cliente.

```bash
# Restaurar la copia en una base aparte (docs/runbooks/backup-restore.md) y luego:
DIAGNOSTIC_DATABASE_URL=postgresql://usuario:clave@localhost:5434/farmacia_copia \
  pnpm db:diagnose:banks --copia --salida diagnostico-bancos.md
# CSV, un archivo por sección:
DIAGNOSTIC_DATABASE_URL=... pnpm db:diagnose:banks --copia --formato csv --salida diagnostico-bancos/
```

- **Salvaguardas:** no lee `DATABASE_URL` ni el `.env` de la aplicación (exige `DIAGNOSTIC_DATABASE_URL` o `--url`), exige `--copia`, se niega con `NODE_ENV=production`, abre la sesión con `default_transaction_read_only=on` y consulta dentro de una transacción `READ ONLY` con instantánea `REPEATABLE READ`. Si la sesión no queda en solo lectura, no genera el reporte.
- **1. Por cuenta bancaria:** saldo registrado (`current_balance`), saldo según sus movimientos, saldo contable de su subcuenta del PUC (débitos − créditos publicados) y las dos diferencias, más los saltos en la cadena de saldos de los movimientos. Las cuentas sin subcuenta propia se comparan en grupo contra la cuenta del propósito BANK, porque sus asientos no se pueden separar. Al final, el total registrado frente al total contable de bancos.
- **2. Saldos iniciales:** cada saldo inicial de cuenta bancaria con su movimiento, si tiene asiento propio y el neto vigente de los saldos iniciales del asistente en esa cuenta contable. Estados: sin asiento, respaldado por el asistente, respaldo parcial (el asistente tiene otro valor), con asiento propio, sin movimiento.
- **3. Asientos posiblemente duplicados:** asientos vigentes (ni reversados ni reversiones) que tocan cuentas de bancos y tienen la misma fecha y las mismas líneas; confianza ALTA si también coincide la descripción. Dos ventas iguales el mismo día también coinciden, así que son candidatos a revisar con el contador, no a borrar.
- Todo el dinero se calcula en SQL con `numeric` y se reporta con dos decimales.
- **Pruebas:** `bank-balance-diagnostic` (integración con PostgreSQL): diferencia contable por saldo inicial sin asiento, saldo inicial respaldado por el asistente, cuenta sin subcuenta y con la cadena rota, duplicados ALTA y MEDIA, un duplicado reversado que no cuenta, la sesión rechaza escrituras y los formatos markdown y CSV.

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
