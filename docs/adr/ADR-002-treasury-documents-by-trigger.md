# ADR-002: Recibos de caja y comprobantes de egreso generados en la base de datos

- **Estado:** Aprobado
- **Fecha:** 2026-10-10
- **Origen:** Reunión con la contadora del 4 de octubre de 2026 (`docs/reunion_04_oct_2026.md`)

## Contexto

Se acordó que todo ingreso de dinero tenga un recibo de caja (RC) y toda salida un comprobante de egreso (CE), con consecutivo propio y vinculados a los auxiliares de caja y bancos. "Por cada venta debe existir una factura de venta y un recibo de caja."

El dinero entra y sale por al menos diez flujos (ventas, anulaciones, abonos de cartera y sus reversiones, pagos a proveedores, gastos y sus pagos, notas crédito, movimientos manuales de caja y de bancos), y cada uno inserta directamente en `cash_movements` o `bank_movements`.

## Decisión

Los documentos se generan con triggers `AFTER INSERT` sobre `cash_movements` y `bank_movements`, en la misma transacción del movimiento:

- `INGRESO_*` en caja y cualquier movimiento bancario que no sea `WITHDRAWAL`, `TRANSFER_OUT` o `FEE` generan un RC; el resto, un CE.
- El saldo de apertura de una cuenta bancaria (`INITIAL_BALANCE`) no genera documento.
- El consecutivo sale de `treasury_document_sequences` con bloqueo de fila: sin huecos (una transacción revertida no consume número) y sin repetidos (en `SERIALIZABLE` la colisión es un error de serialización que los flujos de dinero ya reintentan).
- `treasury_documents` es inmutable, igual que los movimientos que respalda. Una anulación o reversión produce su propio movimiento y, por tanto, su propio documento.
- La migración generó los documentos de los movimientos existentes en orden cronológico.

## Alternativas descartadas

- **Llamar a un servicio desde cada flujo.** Exige tocar diez lugares y deja abierta la posibilidad de que un flujo nuevo mueva dinero sin documento.
- **`count() + 1` con bloqueo asesor.** En transacciones `SERIALIZABLE` la instantánea se toma antes del bloqueo y puede repetir el número.

## Consecuencias

- La regla "todo movimiento de dinero tiene documento" la garantiza la base de datos.
- Cada RC y cada CE se numeran en serie: dos ventas simultáneas esperan una a la otra solo en el instante de tomar el número.
- El formato `RC-000001` / `CE-000001` es provisional hasta que se definan la numeración y los datos legales de los documentos (decisión 12 de `docs/ESTADO_AVANCE.md`).
- El tercero se resuelve al consultar, a partir del documento de origen.
