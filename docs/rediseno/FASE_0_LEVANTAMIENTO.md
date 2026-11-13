# Rediseño FarmaControl — Fase 0: estado real

**Fecha:** 2026-11-12 · **Rama:** `main` en `554a474` · **Alcance:** levantamiento previo al rediseño de navegación, inicio, documentos e impresión.

Todo lo de este documento sale del código. Lo que se observó en la interfaz del entorno de Droguería Vida Sana se marca como **observado en interfaz**. Lo que no se pudo comprobar en un navegador se marca como **pendiente de navegador**.

## 0. Punto de partida del repositorio

- Al empezar, el `main` local estaba **16 commits por detrás** de `origin/main` (`1f2ea6e` → `554a474`). El árbol de trabajo estaba limpio y se avanzó por *fast-forward*. Esos commits incluyen el cambio de contraseña propia, Notas Crédito como pantalla, la corrección de recibos y egresos, las plantillas imprimibles (tirilla térmica y formato carta) y la importación de productos. Esto explica por qué el entorno de prueba mostraba funciones que no estaban en el `main` local. **Todo el rediseño se hace sobre `554a474` o posterior.**
- Los puertos locales 3000 y 5173 los ocupa otro proyecto (contenedor `labpanel-main`). El entorno FarmaControl no está levantado en esta máquina. Las comprobaciones de este documento se hicieron sobre el código y las pruebas automatizadas, no en navegador.

## 1. Comandos reales de verificación

| Comando | Qué hace |
|---|---|
| `pnpm typecheck` | `tsc` en todos los paquetes |
| `pnpm lint` | ESLint en todos los paquetes |
| `pnpm --filter @farmacia/web test` | Vitest + Testing Library del frontend (jsdom, sin base de datos) |
| `pnpm --filter @farmacia/web build` | `tsc -b && vite build` |
| `pnpm test` | Suite completa con PostgreSQL efímero en Docker (`infra/scripts/test-with-ephemeral-db.sh`) |
| `pnpm test:e2e` | Playwright (`tests/e2e/specs`: auth, permissions, pos-fefo, purchase, receivables, reports, sales-history, responsive) |

Resultado de la línea base: sección 9.

## 2. Mapa de rutas, layout y componentes

### 2.1 Shell

| Pieza | Archivo | Símbolo |
|---|---|---|
| Rutas | `apps/web/src/App.tsx` | `App`, todas las páginas con `lazy()` |
| Menú y permisos por ruta | `apps/web/src/app/navigation.tsx` | `menuGroups`, `routeNavigation`, `navigationForPath`, `entryPermissions` |
| Guardia de ruta | `apps/web/src/features/auth/routes/RequirePermission.tsx` | `RequirePermission`: busca la entrada de `routeNavigation` con el prefijo más largo y exige cualquiera de sus permisos. Una ruta sin entrada muestra `NoPermissionState`. |
| Sesión | `features/auth/routes/AuthRoutes.tsx` | `ProtectedRoute`, `PublicOnlyRoute` (cambio forzado de contraseña temporal) |
| Layout | `components/layout/AppLayout.tsx` | Drawer temporal por debajo de `lg` y persistente desde `lg` |
| Menú lateral | `components/layout/AppSidebar.tsx` | `SIDEBAR_WIDTH = 260`. Pie fijo: «FarmaControl v1.0 • Producción» (línea 191) |
| Barra superior | `components/layout/AppNavbar.tsx` | Nueva venta, Alertas (insignia con vencidos + críticos), avatar + rol, Cambiar contraseña, Cerrar sesión como botones sueltos |
| Encabezado de página | `components/layout/PageHeader.tsx` | `PageHeader` (título h1, descripción, acciones, botón de volver) |
| Filtros | `components/layout/FilterBar.tsx` | `FilterBar` (grilla responsive y acciones a la derecha) |
| Tema | `theme/app-theme.ts` | `appTheme`, primario `#0F766E`, locale `esES`, botones de 44 px |
| Confirmación | `components/ConfirmDialog.tsx`, `components/SweetModal.tsx`, `context/AlertModalContext.tsx` | |
| Sin permiso | `components/NoPermissionState.tsx` | |
| Dinero | `utils/money.ts` (`formatMoney`, `toCents`, `fromCents`); `utils/print-document.ts` (`formatCurrencyCop`) | Hay **tres formateadores COP** distintos: `formatMoney`, `formatCurrencyCop` y funciones locales `currency`/`money` en `AuthenticatedHomePage.tsx` y `TreasuryDocumentsPage.tsx` |
| Fechas | `utils/date-format.ts`, `utils/business-date.ts`, `components/DateField.tsx`, `components/QuickDateRange.tsx` | |
| Impresión | `components/documents/PrintableDocumentLayout.tsx` (Imprimir / Descargar PDF), `utils/print-document.ts`, `index.css` `@media print` (`.print-document`, `.no-print`) | «Descargar PDF» abre el cuadro de impresión del navegador con el título del documento como nombre de archivo; no genera el PDF en el servidor |

### 2.2 Rutas y menú actual

El menú tiene 9 grupos y **37 accesos**. El grupo «Inventario» incluye compras y alertas. «Contabilidad y finanzas» mezcla caja, bancos, recibos, egresos, cartera, gastos y estados financieros. «Configuración contable» mezcla libros oficiales y conciliación con parametrización.

| Ruta | Página | Grupo actual | Permiso (cualquiera) | Grupo propuesto (fase 1) |
|---|---|---|---|---|
| `/` | `AuthenticatedHomePage` | (botón superior) | sesión | Inicio |
| `/pos` | `PosPage` | Ventas | `sales:create` | Ventas |
| `/sales` | `SalesHistoryPage` | Ventas | `sales:read` | Ventas |
| `/credit-notes` | `CreditNotesPage` | Ventas | `sales:read` | Ventas (devoluciones de clientes) |
| `/purchases/receive` | `ReceivePurchasePage` | Inventario | `purchases:receive` | Compras |
| `/purchases` | `PurchasesListPage` | Inventario | `purchases:read` | Compras (incluye notas débito) |
| `/inventory/lots` | `InventoryLotsPage` | Inventario | `inventory:read` | Inventario |
| `/inventory/movements` | `InventoryMovementsPage` | Inventario | `inventory:read` | Inventario |
| `/alerts` | `ExpirationAlertsPage` | Inventario | `inventory:read` | Inventario + barra superior |
| `/products` | `ProductsPage` | Inventario | `products:read` | Inventario |
| `/categories` | `CategoriesPage` | Inventario | `categories:read` | Inventario |
| `/units-of-measure` | `UnitsOfMeasurePage` | Inventario | `categories:read` | Inventario |
| `/third-parties` | `ThirdPartiesPage` | Terceros | `third_parties:read`, `customers:manage`, `suppliers:manage` | Terceros |
| `/customers`, `/suppliers` | redirigen a `/third-parties` | — | — | se conservan |
| `/cash` | `CashPage` | Cont. y finanzas | `cash:read` | Tesorería |
| `/treasury/bank-accounts` | `TreasuryBankAccountsPage` | Cont. y finanzas | `treasury:read` | Tesorería |
| `/treasury/receipts` | `CashReceiptsPage` | Cont. y finanzas | `accounting:read`, `recibo_caja.crear_manual` | Tesorería |
| `/treasury/disbursements` | `DisbursementVouchersPage` | Cont. y finanzas | `accounting:read`, `comprobante_egreso.crear` | Tesorería |
| `/receivables` | `ReceivablesPage` | Cont. y finanzas | `receivables:read` | Tesorería |
| `/payables` | `PayablesPage` | Cont. y finanzas | `payables:read` | Tesorería |
| `/expenses` | `ExpensesPage` | Cont. y finanzas | `expenses:read` | Contabilidad |
| `/accounting/journal` | `JournalEntriesPage` | Cont. y finanzas | `accounting:read` | Contabilidad |
| `/accounting/audit` | `AccountingAuditPage` | Cont. y finanzas | `accounting:read` | Contabilidad |
| `/accounting/trial-balance` | `TrialBalancePage` | Cont. y finanzas | `accounting:read` | Contabilidad |
| `/accounting/income-statement` | `IncomeStatementPage` | Cont. y finanzas | `accounting:read` | Contabilidad |
| `/accounting/balance-sheet` | `BalanceSheetPage` | Cont. y finanzas | `accounting:read` | Contabilidad |
| `/accounting/periods` | `FiscalPeriodsPage` | Cont. y finanzas | `accounting:read` | Contabilidad |
| `/accounting/books` | `OfficialBooksPage` | Config. contable | `accounting:read` | Contabilidad |
| `/accounting/reconciliation` | `ReconciliationPage` | Config. contable | `accounting:read` | Contabilidad |
| `/tax-reports` | `TaxDraftsPage` | Config. contable | `accounting:read` | Contabilidad |
| `/accounting/lookup` | `AccountingLookupPage` | fuera del menú | `accounting:read` | se conserva fuera del menú |
| `/reports` | `ReportsPage` | Reportes | `reports:read` | Reportes |
| `/company` | `CompanySettingsPage` | Config. contable | `company:read` | Configuración |
| `/users` | `UsersPage` | Configuración | `users:read` | Configuración |
| `/backups` | `BackupManagementPage` | Configuración | `backups:manage` | Configuración |
| `/audit` | `AuditLogsPage` | Configuración | `audit:read` | Configuración (auditoría del sistema) |
| `/accounting/setup` | `AccountingSetupPage` | Config. contable | `accounting:read` | Configuración |
| `/tax-catalog` | `TaxCatalogPage` | Config. contable | `products:read` | Configuración |
| `/accounting/accounts` | `AccountsPage` | Config. contable | `accounting:read` | Configuración |
| `/accounting/purposes` | `PurposesPage` | Config. contable | `accounting:read` | Configuración |
| `/accounting/import` | `ImportAccountsPage` | Config. contable | `accounting:manage` | Configuración |

**Protección doble.** La ruta la protege `RequirePermission`, que usa la misma tabla del menú, y cada endpoint la protege `PermissionsGuard` con `@RequirePermissions` / `@RequireAnyPermissions`. Si se reagrupa el menú sin cambiar `path` ni `permission`, la protección de rutas no cambia.

**No existe «Detalle de venta».** Una venta se consulta en `SaleReceiptDialog` (comprobante), `SaleCreditNotesDialog` y `SaleActionHistoryDialog`, siempre desde la tabla de `/sales`. El API ya expone `GET /sales/:id` (`sales:read`).

## 3. Servicios por dominio (API)

| Dominio | Controlador | Escritura relevante |
|---|---|---|
| Ventas | `sales/presentation/controllers/sale.controller.ts` | `POST /sales/fefo-preview`, `POST /sales/confirm` (Idempotency-Key), `POST /sales/:id/cancel` |
| Devolución a cliente | `sales/presentation/controllers/credit-notes.controller.ts` | `POST /sales/:saleId/credit-notes`, `POST /credit-notes/:id/cancel` |
| Compras | `purchases/presentation/controllers/purchase.controller.ts` | `POST /purchases/receive` |
| Devolución a proveedor | `purchases/presentation/controllers/debit-notes.controller.ts` | `POST /purchases/:purchaseId/debit-notes` (sin anulación) |
| Recibos y egresos | `treasury/presentation/treasury-vouchers.controller.ts` | `POST /treasury/cash-receipts[/collections]`, `POST /treasury/disbursements`, `POST …/:id/cancel` |
| Consulta de documentos | `treasury/presentation/treasury-documents.controller.ts` | solo lectura |
| Cartera / CxP | `receivables.controller.ts`, `payables.controller.ts` | pagos y reversiones |
| Gastos | `expenses/presentation/expenses.controller.ts` | crear, pagar, anular, revertir pago |
| Asientos | `accounting/presentation/journal.controller.ts`, `manual-notes.controller.ts` | reversar, anular, nota manual |

## 4. Matriz inicial de documentos y acciones

Las «acciones visibles» se tomaron del código del frontend. La «condición del servidor» es el permiso del endpoint; las reglas de estado y período se aplican dentro del servicio.

| Documento | Origen | Estados | Ver / consultar | Acción visible y condición en pantalla | Condición del servidor | Imprimible |
|---|---|---|---|---|---|---|
| Venta (factura POS) | POS | `COMPLETED`, `CANCELLED` | `/sales` → Comprobante | Devolución: `COMPLETED` + `sales:credit_note`. Anular: `COMPLETED` + `sales:cancel`. Notas crédito e historial: siempre | `sales:cancel`; 409 si tiene notas crédito o abonos vigentes | Sí: `SaleReceiptDialog` (tirilla térmica), Imprimir + PDF. **El encabezado es fijo en el código** («FARMACONTROL · Calle Principal # 12-34 · Barranquilla», `SaleReceiptDialog.tsx:142-151`), no usa los datos de la empresa (`useCompanyInfo`) |
| Nota crédito (devolución de cliente) | Venta | `CONFIRMADA`, `ANULADA` | `/credit-notes`, desde la venta | Crear: `sales:credit_note`. Anular: `CONFIRMADA` + `sales:cancel` | `sales:credit_note` / `sales:cancel` + Idempotency-Key | Sí: `CreditNotePrintDialog` |
| Compra (recepción) | Recepción | `RECEIVED` (se muestra el código en inglés) | `/purchases` → `PurchaseDetailDialog` | Nota débito: `RECEIVED` + `purchases:debit_note`. Sin anulación | `purchases:receive` | Sí: `PurchaseDetailDialog` con impresión propia. `PurchasePrintDialog` existe y **no se usa** |
| Nota débito (devolución a proveedor) | Compra | confirmada | desde la compra | Crear con `DebitNoteDialog`, que no usa pasos ni el resumen de la nota crédito | `purchases:debit_note`; sin endpoint de anulación | `DebitNotePrintDialog` existe y **no está conectado a ninguna pantalla** |
| Recibo de caja | `AUTOMATICO` (venta), `CARTERA`, `MANUAL` | `VIGENTE`, `ANULADO` | `/treasury/receipts` | Corregir y Anular: `VIGENTE` + origen ≠ `AUTOMATICO` + `recibo_caja.anular` (+ `accounting:read` si es `MANUAL`) | colecciones: `recibo_caja.anular`; manual: `recibo_caja.anular` + `accounting:read`; `AUTOMATICO` se rechaza | Sí: `TreasuryDocumentPrintDialog` |
| Comprobante de egreso | `AUTOMATICO`, `PROVEEDOR`, `MANUAL` | `VIGENTE`, `ANULADO` | `/treasury/disbursements` | Igual que el recibo, con `comprobante_egreso.anular` | `comprobante_egreso.anular`; `AUTOMATICO` se rechaza | Sí: `TreasuryDocumentPrintDialog` |
| Causación de gasto | Gastos | `PENDIENTE`, pagado, `ANULADO` | `/expenses` | Pagar, anular, revertir pago según `expenses:manage` (+ `comprobante_egreso.anular` para revertir) | igual | Sí: `ExpensePrintDialog` |
| Abono de cartera | Cartera | vigente / revertido | `/receivables` | Revertir: `receivables:manage` + `recibo_caja.anular` | igual | A través de su recibo de caja |
| Pago a proveedor | CxP | vigente / revertido | `/payables` | Revertir: `payables:manage` + `comprobante_egreso.anular` | igual | A través de su egreso |
| Asiento / nota contable | Libro Diario | `POSTED`, reversado, anulado | `/accounting/journal` | Nota manual, reversar, anular: `accounting:manage` | `accounting:manage` + período abierto | Sí: `JournalEntryPrintDialog` |

### 4.1 Por qué algunos egresos vigentes permiten corrección y otros solo impresión

`TreasuryDocumentsPage.canAnnul` (`features/treasury/pages/TreasuryDocumentsPage.tsx:148`) muestra **Corregir** y **Anular** solo si se cumplen todas estas condiciones:

1. `status === 'VIGENTE'`;
2. `origin !== 'AUTOMATICO'`. Los egresos automáticos los generan otra operación (devolución en efectivo de una venta, gasto pagado al causarse, etc.) y el servidor rechaza su anulación directa;
3. el usuario tiene `comprobante_egreso.anular` (o `recibo_caja.anular`);
4. si el origen es `MANUAL`, también tiene `accounting:read`.

Un egreso `AUTOMATICO` vigente queda solo con **Imprimir**, y la pantalla no explica por qué ni dónde corregirlo. Esto confirma lo **observado en interfaz**. La fase 4 debe mostrar el motivo («Generado por la nota crédito NC-…; corríjalo desde ese documento») con un enlace al documento de origen.

### 4.2 Riesgo detectado en la corrección actual

`TreasuryDocumentCorrectionDialog.handleExecuteCorrection` hace la corrección en **dos peticiones separadas desde el navegador**: `cancelTreasuryDocument` y después `createCashReceipt` / `createDisbursement`, con una `Idempotency-Key` nueva en cada intento. Si la segunda petición falla, el documento original queda anulado sin reemplazo y el dinero ya reversado. Esto incumple la regla de atomicidad del proyecto. Además, el componente llama a sus hooks después de un `return null` condicional (`if (!document) return null;`, línea 62), lo que rompe las reglas de hooks de React cuando `document` pasa de `null` a un valor.

**Decisión pendiente (fase 4):** convertir la corrección en una operación de servidor atómica (`POST /treasury/{tipo}/:id/correct`) o restringir la corrección a los campos que no tocan importes ni asientos. Cualquiera de las dos exige validar antes el tratamiento contable.

## 5. «Cargando cliente…» en el POS

**Dónde.** `features/sales/pages/PosPage.tsx:476` muestra `selectedCustomer ? selectedCustomer.name : 'Cargando cliente...'`. El efecto de carga inicial (línea ~156) llama a `fetchDefaultCustomer()` (`GET /customers/default`, `customers:read`) y, **si falla, solo escribe en consola**. El estado queda en `null` y la etiqueta muestra «Cargando…» indefinidamente.

**Causas posibles, en orden de probabilidad:**

1. **Manejo del estado (confirmada en código).** Cualquier error (404, 403, red) se presenta como una carga que nunca termina. No hay estado de error, reintento ni alternativa.
2. **Datos (posible en el servidor).** `GET /customers/default` devuelve 404 si no hay un cliente con `isDefault = true` e `isActive = true`. La entidad `Customer` impide desactivar el cliente por defecto, pero `CustomersLedger.setActive`, `update` y `upsert` (`customers/application/customers-ledger.ts`), que usa Terceros al desactivar o editar un tercero cliente, **no tienen esa protección**. Si alguien desactivó en Terceros el tercero de «Consumidor Final», el POS quedó así. `sale.service.ts:405` responde entonces 409 «No se encontró el cliente por defecto» a toda venta sin cliente.
3. **Permisos.** Un rol sin `customers:read` recibe 403. Admin, supervisor y cajero lo tienen según `rbac.seed.ts`, así que esta causa no aplica a la cuenta administradora revisada.

**Pendiente de navegador / datos:** comprobar en el entorno de prueba con `GET /api/v1/customers/default` cuál de las causas 2 o 3 ocurre. La fase 2 corrige el manejo del estado (carga, error con reintento, aviso cuando no hay consumidor final). La protección del servidor (causa 2) se documenta como cambio de servidor acotado.

## 6. Etiqueta del ambiente

«FarmaControl v1.0 • Producción» está **fijo en el código** (`AppSidebar.tsx:191`). No depende de ninguna variable. `NODE_ENV` no sirve como señal porque el despliegue de pruebas usa el mismo `docker-compose.production.yml` con `NODE_ENV: production`. El nombre de la empresa tampoco es una señal confiable.

**Propuesta fase 1:** variable explícita de despliegue `APP_ENVIRONMENT` (`produccion` | `pruebas` | `desarrollo`) leída por el API en tiempo de ejecución y expuesta en `GET /health` como `environment`. La misma imagen sirve para ambos ambientes y la etiqueta la decide la configuración del servidor, no el *build*. Sin la variable, la interfaz **no muestra ninguna etiqueta** (no presume producción).

## 7. Otros hallazgos de interfaz contrastados

| Observado | En código |
|---|---|
| Menú de más de 30 accesos, compras en Inventario, tesorería mezclada con contabilidad | Confirmado: 37 accesos (sección 2.2) |
| Inicio con franja de saludo y conteo de permisos, alertas solas en otra fila | Confirmado: banner con «Tu sesión está activa con N permisos», chips de roles y un panel fijo de «Avisos operativos y reglas críticas» con texto técnico (FEFO) |
| POS con buscador enfocado, carrito, total y F2 | Confirmado (`PosPage`, `PosProductSearch`) |
| Devolución de clientes con pasos y resumen; proveedores con diálogo distinto | Confirmado: `CreditNoteDialog` (pasos) frente a `DebitNoteDialog` (un formulario) |
| Impresión y PDF en comprobantes | Confirmado para venta, nota crédito, recibo, egreso, gasto, asiento y compra. Falta en nota débito (componente sin conectar) |
| Corrección y anulación solo en algunos egresos vigentes | Explicado en 4.1 |
| Pie «Producción» en pruebas | Explicado en 6 |
| Códigos en inglés (`RECEIVED`) | `PurchasesListPage.tsx:239` muestra `purchase.status` sin traducir |

## 8. Decisiones de negocio pendientes

| # | Decisión | Afecta | Qué se hace mientras tanto |
|---|---|---|---|
| D1 | Corrección de recibos y egresos: ¿operación atómica en el servidor o solo campos no contables? | Fase 4 | Se mantiene el flujo actual y se documenta el riesgo |
| D2 | Si no hay consumidor final activo, ¿se bloquea el POS o se exige elegir cliente? (hoy el servidor rechaza la venta) | Fase 2 | El POS avisa y pide elegir cliente, sin inventar un cliente por defecto |
| D3 | ¿Se permite anular notas débito? (no existe endpoint) | Fase 3 | Fuera de alcance. Se muestra «sin anulación» con su motivo |
| D4 | Valor y responsable de `APP_ENVIRONMENT` en cada despliegue | Fase 1 | Sin la variable no se muestra etiqueta |
| D5 | ¿El cliente por defecto se puede desactivar desde Terceros? Hoy sí, por una vía que se salta la regla de la entidad | Fase 2 | Se propone bloquearlo en el servidor (regla ya existente en `Customer`) |

## 9. Línea base de verificación (sobre `554a474`, antes de cambios)

| Comando | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | OK |
| `pnpm typecheck` | **Falló en `apps/api`** con 76 errores por artefactos viejos tras el pull (cliente Prisma sin regenerar, `@farmacia/contracts/dist` sin compilar). Tras `pnpm db:generate` y `pnpm --filter @farmacia/contracts build`: **OK**. No es un defecto del código, pero el README debería indicar ambos pasos después de actualizar la rama |
| `pnpm lint` | OK: 0 errores (avisos: web 40, api 98, worker 3, database 3) |
| `pnpm --filter @farmacia/web test` (suite completa) | 12 fallas de 372 |
| Las 4 suites que fallaron, ejecutadas solas sobre `HEAD` limpio | **1 falla determinista**: `document-annulments.test.tsx › el recibo de abono se anula desde su detalle…` busca el botón «Anular» y el commit `0716836` lo renombró «Anular Documento». Las otras 11 (`accounting-setup`, `accounting`, `third-parties`) solo fallan por *timeout* de 10 s cuando corre la suite completa |

Recorridos críticos con datos de prueba: las E2E de Playwright (`pnpm test:e2e`) crean su propia base, administrador, cajero y productos. Se usan como línea base y como recorrido en navegador real en las fases siguientes.
