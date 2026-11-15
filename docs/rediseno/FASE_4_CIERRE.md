# Rediseño FarmaControl — Cierre de la fase 4 (tesorería, contabilidad, documentos e impresión)

Fecha: 2026-11-14. Base: `8aac5c4` (cierre de la fase 3).

Esta fase cambia el servidor en tres puntos, cada uno con su causa y sus pruebas por la ruta HTTP. No hay migraciones ni variables de entorno nuevas.

## Qué cambió

### Qué se puede hacer con cada recibo o egreso, y por qué

El detalle de un recibo o egreso indica sus acciones disponibles. Si una acción no está disponible, da el motivo concreto. Las reglas son las mismas que valida el servidor (`treasury-document-actions.ts`), y el servidor las sigue aplicando por su cuenta.

| Situación | Acciones | Motivo que se muestra |
|---|---|---|
| Documento anulado | Solo imprimir | «Documento anulado: no admite cambios…», con el motivo de la anulación |
| Automático (lo emitió otro documento) | Solo imprimir | «Lo generó la nota crédito NC-… Solo se imprime aquí: se corrige o anula desde ese documento», con el botón «Ir a notas crédito» (o ventas, cartera, cuentas por pagar, gastos o caja) |
| Sin `recibo_caja.anular` / `comprobante_egreso.anular` | Solo imprimir | Nombra el permiso que falta |
| Manual sin permiso contable | Solo imprimir | Lo exige la contrapartida contable elegida a mano |
| Manual sin permiso de caja o bancos | Solo imprimir | Anular devuelve el dinero al auxiliar |
| Puede anular, pero no registrar el reemplazo | Anular | «Puedes anularlo. Corregirlo emite un documento de reemplazo y exige además el permiso…» |
| Todo en orden | Corregir y anular | — |

Esto explica por qué algunos egresos vigentes permiten corrección y otros solo impresión. Los automáticos nacen de un movimiento de caja o banco de otro documento (reembolso de una nota crédito, anulación de un gasto, etc.), y la anulación de ese documento es la que los revierte.

**Los recibos y egresos no se editan en el sitio:** son inmutables en la base. Hay dos acciones:

- **Corregir:** anula el documento y emite un reemplazo.
- **Anular:** solo revierte.

La tabla muestra además una columna **Estado** (Vigente / Anulado) y el origen sin ids internos.

### D1: la corrección es atómica (cambio de servidor)

**Causa.** La web anulaba el documento y luego creaba el reemplazo, en dos llamadas y con una clave nueva en cada intento. Si la segunda fallaba (saldo, período bloqueado, red), el original quedaba anulado sin reemplazo.

**Cambio.** `POST /api/v1/treasury/documents/:id/correct` hace todo en una transacción serializable, con `Idempotency-Key`.

- **Anulación de siempre, extraída a `cancelInTransaction`:** reversa abonos o pagos (o el asiento manual) y devuelve el dinero.
- **Registro de siempre, extraído a `planCashReceipt`, `planDisbursement` y `planManual`:** emite el reemplazo con su movimiento y su asiento.
- **Vínculo entre los dos documentos:**
  - el motivo de la anulación del original dice «Corregido con RC-000002: …»;
  - el concepto del reemplazo nombra al original;
  - queda un evento de auditoría `treasury:document_corrected`.
- **El consecutivo se toma antes de anular,** porque el documento anulado es inmutable (trigger) y su motivo ya debe nombrar el reemplazo.

**Sin reglas nuevas.**

- El reemplazo conserva tipo, origen y cliente o proveedor, como ya lo hacía el formulario.
- Se exigen los permisos de anular y de crear el reemplazo.
- La reversión y el nuevo asiento quedan con fecha de hoy, como en la anulación existente. Por eso un período cerrado o un bloqueo de documentos que cubra hoy rechaza la corrección completa.

**En la web.**

- El formulario usa una sola llamada y conserva la clave entre reintentos.
- Ya no vuelve a aplicar abonos que se habían revertido uno a uno (antes los incluía).
- Si el servidor rechaza la corrección, avisa que el original sigue vigente.
- Los hooks del diálogo ya no se llaman después de un `return`.

### Impresión y PDF

**Membrete real en todos los documentos carta.**

- `PrintableDocumentLayout` usa `GET /company/letterhead`.
- Se eliminó `useCompanyInfo`, que imprimía «NIT: 900.000.000-1», «contacto@farmacontrol.com», la ciudad fija y «NIT: NIT:» duplicado.
- Lo que la empresa no tenga configurado no se imprime.

**Permisos del membrete (cambio de servidor).** Causa: tesorería, contabilidad y gastos imprimen documentos, pero el membrete solo lo podían leer ventas, compras y empresa. Ahora también lo leen:

- `accounting:read`;
- `recibo_caja.crear_abono` y `recibo_caja.crear_manual`;
- `comprobante_egreso.crear`;
- `expenses:read`.

El endpoint solo expone el membrete, no la configuración de la empresa.

**Salidas que faltaban, ahora conectadas.**

- **Compra:** «Imprimir» en su detalle abre la plantilla común (`PurchasePrintDialog`). La plantilla ahora incluye retenciones y «Por pagar al proveedor». Muestra «—» si la compra es anterior al motor tributario y no tiene subtotal. Cantidades y fechas salen formateadas, y se quitaron los `as any`.
- **Nota débito:** se imprime desde el detalle de la compra (lista «Devoluciones al proveedor») y desde el aviso de éxito al registrarla.

**Correcciones comunes a todas las plantillas.**

- **Encabezado de las tablas:** se veía blanco sobre blanco, en pantalla y en papel. El tema pintaba la celda encima del fondo oscuro.
- **Fecha del documento:** salía un día antes por la zona horaria (14/11 se veía 13/11).
- **Estado en español:** Recibida, Confirmada, Publicado…
- **Pie de página:** se quitó el «Página 1 de 1» fijo.
- **Asiento de reversión:** ya no se imprime como «ANULADO»; anulado es el asiento reversado.

**Hoja de impresión.**

- Los documentos carta tienen su propia página: carta, con márgenes de 14 × 12 mm. Antes heredaban los 3 mm de la tirilla POS.
- Al imprimir solo sale el documento. Antes podían salir también otro diálogo o un aviso abiertos; la prueba lo encontró con el detalle de la compra mientras se cerraba.
- El recibo de caja impreso muestra su **Origen**: abono a facturas, pago a proveedor, manual, o «Emitido automáticamente por la nota crédito NC-…».

### Kardex (pendiente de la fase 3, cambio de servidor)

**Causa.** Las entradas por compra guardan el id interno de la compra.

**Cambio.** El listado de movimientos devuelve `referenceDocumentNumber` con el número de factura, en una sola consulta de lectura por página. El Kardex lo muestra en lugar del id.

### Filtros e informes

- **Recibos y egresos:** fechas y búsqueda viven en la URL (`desde`, `hasta`, `q`). Se conservan al volver, recargar o compartir el enlace.
- **Corte frente a rango:**
  - el balance general dice «Saldos acumulados hasta este día, incluido»;
  - el balance de comprobación y el estado de resultados dicen «Movimientos del rango, ambos días incluidos».
- **Las dos auditorías se distinguen por título y ubicación:**
  - «Auditoría contable» (Contabilidad) revisa los libros: descuadres y anulaciones;
  - «Auditoría del sistema» (Configuración) registra quién hizo qué y cuándo.

  Cada una remite a la otra. Los títulos coinciden con el menú.

## Matriz de impresión y PDF por tipo de documento

| Documento | Plantilla | Dónde se abre | Verificación en navegador | Resultado |
|---|---|---|---|---|
| Venta (tirilla POS 80 mm) | `SaleReceiptDialog` | POS y detalle de venta | Fase 2 (captura del comprobante con membrete) | Sin cambios en esta fase |
| Recibo de caja | `TreasuryDocumentPrintDialog` | Recibos de caja | PDF `fase-4/recibo-anulado.pdf` | 1 hoja carta; membrete, consecutivo, fecha correcta, tercero, origen, facturas, total, aviso de anulado con motivo y vínculo al reemplazo; sin botones ni avisos de pantalla |
| Comprobante de egreso | `TreasuryDocumentPrintDialog` | Comprobantes de egreso | PDF `fase-4/egreso-automatico.pdf` | 1 hoja; membrete y «Emitido automáticamente por la nota crédito NC-…» |
| Compra | `PurchasePrintDialog` | Detalle de compra › Imprimir | PDF `fase-4/compra-varias-paginas.pdf` (45 líneas) | 5 hojas carta; encabezado de tabla repetido y legible en cada hoja; totales al final; estado «Recibida» |
| Nota débito | `DebitNotePrintDialog` | Detalle de compra y aviso de éxito | PDF `fase-4/nota-debito.pdf` | 1 hoja; membrete, ND, factura afectada, motivo, líneas y totales |
| Nota crédito | `CreditNotePrintDialog` | Notas crédito | No en esta fase | Recibe las correcciones comunes (membrete, encabezado de tabla, fecha, estado); falta su PDF en navegador |
| Gasto | `ExpensePrintDialog` | Gastos | No en esta fase | Igual que la nota crédito |
| Asiento contable | `JournalEntryPrintDialog` | Libro diario | No en esta fase | Correcciones comunes y estado correcto de la reversión; falta su PDF en navegador |

«Imprimir» y «Descargar PDF» abren el mismo cuadro del navegador. El PDF se guarda desde ahí, con el número del documento como nombre sugerido.

## Archivos principales

- **Servidor:**
  - `apps/api/src/modules/treasury/application/treasury-vouchers.service.ts`
  - `apps/api/src/modules/treasury/presentation/treasury-vouchers.controller.ts`
  - `apps/api/src/modules/company/presentation/company.controller.ts`
  - `apps/api/src/modules/inventory/infrastructure/adapters/prisma-inventory-movement.repository.ts`
- **Contratos:** `packages/contracts/src/treasury.ts` (`CorrectTreasuryDocumentPayload`) y `packages/contracts/src/index.ts` (`referenceDocumentNumber`).
- **Tesorería (web):**
  - `apps/web/src/features/treasury/treasury-document-actions.ts` (nuevo)
  - `pages/TreasuryDocumentsPage.tsx`
  - `components/TreasuryDocumentCorrectionDialog.tsx`
  - `api/treasury.api.ts`
- **Documentos:**
  - `apps/web/src/components/documents/PrintableDocumentLayout.tsx`
  - las seis plantillas `*PrintDialog.tsx`
  - `apps/web/src/index.css`
  - se eliminó `apps/web/src/features/company/hooks/useCompanyInfo.ts`
- **Compras e inventario:** `PurchaseDetailDialog.tsx`, `PurchasesListPage.tsx`, `DebitNoteDialog.tsx`, `InventoryMovementsPage.tsx`.
- **Informes y auditoría:** `BalanceSheetPage.tsx`, `TrialBalancePage.tsx`, `IncomeStatementPage.tsx`, `AccountingAuditPage.tsx`, `AuditLogsPage.tsx`.
- **Pruebas:**
  - `apps/api/test/integration/treasury-corrections.integration.spec.ts` (nuevo)
  - `company.integration.spec.ts`
  - `purchase.controller.integration.spec.ts`
  - `apps/web/test/treasury-documents.test.tsx`
  - `apps/web/test/purchases.test.tsx`
  - `tests/e2e/specs/redesign-phase4.spec.ts` (nuevo)

## Pruebas ejecutadas

### En código

| Comprobación | Resultado |
|---|---|
| `pnpm typecheck` | 0 errores |
| `pnpm lint` | 0 errores; advertencias: web 36 (antes 40), api 98, worker 3, database 3 |
| Pruebas web (`vitest`) | 56 archivos, 412 pruebas, todas pasan |
| Build web | correcto |
| API, corrección y tesorería: `treasury-corrections`, `treasury-vouchers`, `document-annulments`, `treasury-documents`, `company`, `purchase.controller`, `inventory.controller` | 7 archivos, 65 pruebas, todas pasan |
| API, Kardex e inventario: `inventory-adjustments`, `inventory-valuation`, `request-validation`, `accounting-coverage`, `costing-methods`, `treasury` | 6 archivos, 85 pruebas, todas pasan |

**Corrección atómica (PostgreSQL real, por HTTP):**

- **Abono de efectivo corregido a transferencia por otro valor.** La factura pasa de 6.000 a 7.000 de saldo: se reversan 4.000 y se aplican 3.000. Caja vuelve a 0 y el banco queda en 3.000. Los asientos cuadran, el original nombra su reemplazo y queda el evento de auditoría.
  - Un reintento con la misma clave devuelve la misma respuesta y no cambia nada.
  - Con otra clave da 409 sin efectos.
- **Reemplazo rechazado** (abono mayor al saldo): 400, y no cambian documentos, caja, bancos, asientos, cartera ni cuentas por pagar.
- **Bloqueo de documentos que cubre hoy:** se rechaza («…bloqueados…») y no cambia nada.
- **Egreso manual de 20.000 corregido a 15.000:** se reversa su asiento contra la contrapartida, caja queda en 85.000 y el capital neto en 85.000.
- **Pago a proveedor de 30.000 corregido a 20.000:** la cuenta por pagar queda en 30.000. Cambiar de proveedor se rechaza.
- **Reglas:** se rechaza el cambio de tipo y el de cliente, un motivo corto, el usuario sin permiso de anular (403) y la falta de `Idempotency-Key`. Un documento automático responde 409, «desde el documento de origen».

**Durante el trabajo:**

- La prueba del documento automático estaba envuelta en un `if` y nunca se ejecutaba: la venta de contado no emite comprobante. Se cambió por un movimiento de caja real con referencia a una nota crédito, que el trigger convierte en comprobante automático.
- La primera versión actualizaba el motivo del original después de anularlo; el trigger de inmutabilidad lo impide. Por eso el consecutivo se toma antes de anular.

### En navegador (Playwright, Chromium, `APP_ENVIRONMENT=pruebas`)

**Suite E2E completa:** 19 pasan y 5 omitidas (las mismas de antes). Las capturas de fases anteriores que la corrida regenera se restauraron.

**`redesign-phase4.spec.ts`.** Los datos los crea la propia corrida, y la empresa se configura si falta.

1. **Corrección de un recibo desde su detalle.**
   - Una venta a crédito de 8.000 tiene un abono de 3.000. Desde la pantalla se corrige a 2.000 y el saldo de la factura queda en 6.000.
   - El original queda «ANULADO» con «Corregido con RC-…: Ajuste en valores aplicados».
   - Su detalle no ofrece acciones y lo explica.
   - Su PDF:
     - tiene 1 hoja, con membrete, consecutivo, la fecha de hoy sin corrimiento, el cliente, el aviso de anulado y el vínculo al reemplazo;
     - no lleva datos de ejemplo, avisos ni botones de pantalla.
2. **Matriz de impresión.**
   - La compra de 45 líneas da 5 hojas carta (612 × 792 pt). El encabezado de la tabla se repite en la segunda hoja y los totales cierran la última.
   - La nota débito impresa desde el detalle de la compra da 1 hoja.
   - El egreso automático del reembolso de una nota crédito no ofrece anular, nombra su origen con el enlace «Ir a notas crédito», y su PDF dice «Emitido automáticamente por la nota crédito NC-…».

**Revisión visual de los PDFs** (convertidos a imagen con `pdftoppm`). Encontró dos defectos que las aserciones de texto no detectaban, los dos ya corregidos:

- el encabezado de la tabla era invisible;
- la fecha salía un día antes.

**Capturas y PDFs** en `docs/rediseno/fase-4/`.

No se verificó en el ambiente Vida Sana (sin acceso).

## Decisiones

- **D1 se resolvió con un endpoint atómico,** sin ampliar reglas contables. Reutiliza la anulación y el registro existentes; el tratamiento contable es el mismo que antes, solo que en una sola transacción.
- **Las acciones se calculan en la web con las reglas del servidor,** que sigue siendo la autoridad.
- **La compra se imprime con la plantilla común** y su detalle deja de ser imprimible, para que no haya dos formatos del mismo documento.
- **El membrete amplió sus permisos de lectura** solo a los módulos que imprimen; no expone la configuración de la empresa.
- **El Kardex resuelve el número de factura con una consulta de lectura** a compras, sin cambiar lo que se guarda en los movimientos.

## Pendientes

- **PDF en navegador de nota crédito, gasto y asiento contable.** Usan la misma plantilla con las correcciones comunes, pero no se generaron en esta fase.
- **Filtro por estado y exportación en recibos y egresos.** El API no filtra por estado ni exporta estos documentos; agregarlo es un cambio de servidor que no se hizo.
- **«Ir a …» desde un documento automático** abre el módulo de origen, no el documento exacto: esas páginas aún no reciben el documento por la URL.
- **D3 (anulación de notas débito)** sigue abierta: no existe la anulación en el servidor y requiere definir su tratamiento contable.
- **Formato pendiente.** Varios archivos que ya estaban sin formato (`PrintableDocumentLayout.tsx`, las plantillas, `PurchaseDetailDialog.tsx`, `treasury-vouchers.service.ts`, entre otros) no se reformatearon, para no mezclar ruido en el diff.
- **`codex-auditor`** no se ejecutó en esta fase.

## Siguiente paso

Fase 5: componente común de confirmación (crear, actualizar, eliminar, desactivar, anular), revisión como confirmación y botones que nombran la acción.
