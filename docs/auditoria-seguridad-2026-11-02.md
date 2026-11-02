# Auditoría de seguridad — correcciones del cliente (ronda del 2026-11-02)

**Alcance:** lo cambiado desde `790cf67`: recibos de caja y comprobantes de egreso, causaciones (incluida la asignación de proveedor), devoluciones y cambios de producto, anulaciones y reversiones, auditoría contable, estados de cuenta, retiro de rutas antiguas, fecha base de edades y lector de código de barras.
**Método:** revisión del código de controladores y servicios, más pruebas de integración contra PostgreSQL real para cada hallazgo corregido. La auditoría la hizo el orquestador (sin subagentes), con una auditoría previa de Codex sobre las fases 1 a 6 (hallazgos ya corregidos en `df76a22`).

## 1. Resultado

| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| 1 | La contrapartida de un recibo o egreso **manual** aceptaba cualquier cuenta imputable, incluidas las de control con auxiliar (caja, bancos, clientes, proveedores, inventario y la subcuenta de una cuenta bancaria). Un "ingreso manual" contra Clientes bajaba la cartera en el libro sin abonar ninguna factura: un abono sin factura y descuadre entre mayor y auxiliar. | **Alta** | **Corregido**: 400 con explicación. Prueba: `treasury-vouchers` "no puede usar una cuenta de control". |
| 2 | Un `thirdPartyId` inexistente en un recibo o egreso manual terminaba en error de llave foránea (500). | Baja | **Corregido**: 400 "El tercero indicado no existe". |
| 3 | La venta que entrega un cambio de producto no dejaba en su auditoría la nota crédito que reemplaza (sí quedaba en `credit_notes.exchange_sale_id`). | Baja | **Corregido**: `sales:sale_confirmed` incluye `exchangeCreditNoteId`. |
| 4 | Rutas antiguas que movían dinero sin documento de origen (`POST /cash-movements`, movimientos y reversiones bancarias manuales, pagos por factura). | Media | **Corregido** en el punto 2: responden 410; caja y bancos quedan de solo consulta en la API. |
| 5 | `GET /payables/statement` exige `payables:read` y devuelve también causaciones de gasto (descripción y valores), visibles para un rol sin `expenses:read` (p. ej. compras). | Baja | **Aceptado**: el cliente pidió que cuentas por pagar incluya las causaciones. Si debe restringirse, filtrarlas por `expenses:read`. |
| 6 | Abonos, pagos y sus reversiones los autoriza el permiso de cartera, cuentas por pagar o gastos, sin exigir el permiso de caja o bancos (sí se exige en movimientos manuales). | Informativo | **Resuelto por decisión del cliente**: permiso por documento (`recibo_caja.crear_abono`, `comprobante_egreso.crear`); ver `docs/correcciones-farmacontrol.md` §3.4. Las reversiones siguen con `receivables:manage` / `payables:manage`. |
| 7 | El saldo inicial de una cuenta bancaria crea un movimiento `INITIAL_BALANCE` sin asiento (la apertura contable se registra con los saldos iniciales del asistente, F7). | Informativo | Sin cambio en esta ronda (anterior a las correcciones). |

Sin hallazgos críticos.

## 2. Verificación por punto

### Autorización en backend
Todo endpoint nuevo o modificado declara su permiso en el controlador (`PermissionsGuard`), y la matriz de autorización (`authorization-matrix`) exige un permiso explícito en cada ruta con sesión.

| Endpoint | Permiso |
|---|---|
| `POST /treasury/cash-receipts/collections` (abono a cartera) | `recibo_caja.crear_abono` |
| `POST /treasury/cash-receipts` (solo manual) | `accounting:read` + `cash:movements` (efectivo) o `treasury:manage` (transferencia) |
| `POST /treasury/disbursements` | `comprobante_egreso.crear`; el manual además `accounting:read` + permiso del medio |
| `GET /treasury/documents[/:id]`, `GET /accounting/audit`, `GET /third-parties/:id/statement` | `accounting:read` |
| `POST /expenses`, `POST /expenses/:id/supplier`, `POST /expenses/:id/cancel`, reversión de pago de gasto | `expenses:manage` |
| `GET /expenses/without-supplier`, `GET /expenses/:id/movements` | `expenses:read` |
| `POST /sales/:id/credit-notes` (devolución) | `sales:credit_note` |
| `POST /sales/:id/cancel` (anulación) | `sales:cancel` |
| `POST /sales/confirm` (incluido el cambio de producto) | `sales:create` |
| Reversión de abonos / pagos de proveedor | `receivables:manage` / `payables:manage` |
| `GET /payables/statement`, `GET /payables/:id/movements` | `payables:read` |
| `GET /receivables/:id/movements` | `receivables:read` |
| `GET /products/barcode/:code` | `products:read` |

### Acceso a registros ajenos (IDOR)
El sistema es de una sola empresa (modo dedicado, ADR-003): no hay registros de otro inquilino. Dentro de la empresa, las relaciones se validan en el servidor:
- un recibo de cartera solo abona facturas **del cliente del recibo** y un egreso solo paga facturas y causaciones **del proveedor del egreso** (400 en otro caso; prueba "rechaza facturas de otro cliente");
- una reversión exige que el pago pertenezca a la factura de la URL (`payment.receivableId === :id`, `payment.payableId === :id`);
- el cambio de producto solo se vende al **mismo cliente** de la devolución y una sola vez (bloqueo de fila);
- la asignación de proveedor no reasigna una causación que ya tiene proveedor (409).

### Caja y bancos de solo lectura en la API
`POST /cash-movements`, `POST /treasury/bank-accounts/:id/movements` y su reversión responden 410 sin crear movimientos (prueba "las rutas antiguas … responden 410 sin mover dinero"). `PUT /treasury/bank-accounts/:id` solo cambia nombre, notas, estado y subcuenta del PUC, nunca el saldo. Los únicos que mueven dinero son las ventas, las notas crédito, las anulaciones y reversiones, y los recibos y egresos.

### Montos
- Los valores son decimales con máximo 2 decimales, mayores que cero; se rechazan negativos, cero, texto y más de 2 decimales (prueba "valida montos").
- Abono o pago ≤ saldo, bajo `SELECT … FOR UPDATE` de la factura en una transacción `SERIALIZABLE`.
- Una factura no puede repetirse en el mismo documento.
- **Doble pago simultáneo:** tres recibos simultáneos con claves distintas por el saldo total dejan 1 abono, saldo 0 y un movimiento de caja; dos egresos simultáneos, 1 pago. Con la misma clave, el reintento devuelve el mismo documento.
- Venta a crédito: la API rechaza un monto recibido y lo guarda en cero.

### Anulaciones y devoluciones
Solo por los permisos de la tabla anterior. Cada una reversa su asiento (`journalService.reverse`), deja movimiento propio (con su RC/CE cuando mueve dinero) y auditoría con el usuario: `sales:sale_cancelled`, `sales:credit_note_confirmed`, `REVERSE_RECEIVABLE_PAYMENT`, `REVERSE_PAYABLE_PAYMENT`, `expenses:expense_cancelled` y `expenses:expense_payment_reversed`. También guardan `reversedByUserId`. Los documentos de tesorería y los movimientos son inmutables (triggers).

### Asientos cuadrados en transacción
Cada documento publica su asiento en la misma transacción que su movimiento y sus aplicaciones. Un trigger diferido de PostgreSQL (`journal_entries_validate_at_commit_trg`) rechaza al confirmar cualquier asiento publicado que no cuadre o no tenga dos líneas. La auditoría contable no encuentra descuadres en los documentos nuevos (prueba `accounting-audit-statement`), y la venta de contado genera un único asiento (prueba `credit-sales-and-returns`).
