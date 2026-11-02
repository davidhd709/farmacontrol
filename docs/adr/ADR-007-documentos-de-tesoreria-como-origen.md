# ADR-007: La venta es su propio documento y los recibos y egresos originan el movimiento

- **Estado:** Aprobado
- **Fecha:** 2026-11-01
- **Origen:** Correcciones del cliente del 1 de noviembre de 2026 (`docs/correcciones-farmacontrol.md`)
- **Modifica:** ADR-002

## Contexto

ADR-002 generaba un recibo de caja (RC) o un comprobante de egreso (CE) por cada movimiento de caja o banco, incluidas las ventas ("por cada venta una factura y un recibo de caja", reunión del 4 de octubre). El cliente reportó que una venta generaba dos comprobantes y definió un principio nuevo: todo movimiento de dinero nace en un documento (venta, recibo de caja, comprobante de egreso, causación de gasto) y caja, bancos, cartera y cuentas por pagar son vistas de consulta.

## Decisión

1. **La venta es su propio documento.** Los movimientos con origen `SALE` o `SALE_CANCEL` ya no emiten RC/CE (migración `20261101090000_sales_are_their_own_document`). Los documentos ya emitidos se conservan: son inmutables y sus consecutivos ya fueron usados.
2. **El recibo de caja y el comprobante de egreso se registran como documento** (fase 3): el servicio de tesorería crea el documento con su consecutivo y el único movimiento de caja o banco que respalda, y vincula a él los abonos de cartera y los pagos de facturas que aplica. El trigger de ADR-002 sigue como red de seguridad para cualquier otro flujo que mueva dinero sin documento.

## Consecuencias

- El consecutivo RC/CE ya no avanza con cada venta.
- **Confirmado por el cliente (2026-11-02):** la venta de contado no genera recibo de caja; la factura registra directamente su movimiento en caja o bancos y un único asiento. El recibo de caja queda para abonos de cartera y otros ingresos manuales.
