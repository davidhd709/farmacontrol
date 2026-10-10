-- Kardex y caja son libros de solo inserción: las correcciones se registran con
-- movimientos nuevos (ajustes, reversiones), nunca editando ni borrando historia.

CREATE OR REPLACE FUNCTION prevent_movement_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '% es un registro inmutable: los movimientos confirmados no se modifican ni se borran.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_movements_immutable_trg
BEFORE UPDATE OR DELETE ON "inventory_movements"
FOR EACH ROW EXECUTE FUNCTION prevent_movement_modification();

CREATE TRIGGER cash_movements_immutable_trg
BEFORE UPDATE OR DELETE ON "cash_movements"
FOR EACH ROW EXECUTE FUNCTION prevent_movement_modification();

-- Tipos de movimiento de kardex conocidos. NOT VALID: se exige a partir de ahora sin
-- fallar por valores históricos que el endpoint genérico retirado pudo haber aceptado.
ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_movement_type_check"
  CHECK ("movement_type" IN (
    'ENTRADA_COMPRA',
    'SALIDA_VENTA',
    'AJUSTE_POSITIVO',
    'AJUSTE_NEGATIVO',
    'DEVOLUCION_CLIENTE',
    'DEVOLUCION_PROVEEDOR',
    'TRASLADO_ENTRADA',
    'TRASLADO_SALIDA',
    'ENTRADA_DEVOLUCION_VENTA',
    'SALIDA_DEVOLUCION_COMPRA'
  )) NOT VALID;
