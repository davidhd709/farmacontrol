-- Kardex: salida de la mercancía de una devolución que se anula (correcciones del cliente,
-- 2026-11-02). Se recrea la restricción con el tipo nuevo; sigue NOT VALID como la original,
-- así que no revalida filas históricas.
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_movement_type_check";
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_movement_type_check"
    CHECK ("movement_type" IN (
        'ENTRADA_COMPRA', 'SALIDA_VENTA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO',
        'DEVOLUCION_CLIENTE', 'DEVOLUCION_PROVEEDOR', 'TRASLADO_ENTRADA', 'TRASLADO_SALIDA',
        'ENTRADA_DEVOLUCION_VENTA', 'SALIDA_DEVOLUCION_COMPRA', 'SALIDA_ANULACION_DEVOLUCION'
    )) NOT VALID;
