-- FARM-AUD-004: un ajuste podía registrar en el kardex un producto distinto al dueño del lote.
-- FARM-AUD-012: el motivo del ajuste se guardaba como 'MOTIVO: ...' en reference_document_id
-- (VARCHAR(100)) y un texto largo hacía fallar la operación.
-- El kardex es inmutable: ninguna fila histórica se modifica. Las restricciones nuevas se crean
-- NOT VALID (como inventory_movements_movement_type_check) para regir sobre movimientos nuevos.
--
-- Bloqueos en el mismo orden que las transacciones de inventario (lote y luego kardex) para no
-- formar un ciclo con ellas: SHARE ROW EXCLUSIVE en lotes impide escribirlos durante la creación
-- del índice; ACCESS EXCLUSIVE en el kardex cubre el cambio de columnas y restricciones.
-- lock_timeout: si una transacción abierta retiene las tablas, la migración falla y se revierte
-- en lugar de dejar en cola las ventas detrás de ella (ver docs/runbooks/inventory-adjustment-integrity-migration.md).
BEGIN;

SET LOCAL lock_timeout = '10s';

LOCK TABLE "inventory_lots" IN SHARE ROW EXCLUSIVE MODE;

LOCK TABLE "inventory_movements" IN ACCESS EXCLUSIVE MODE;

-- 1. FARM-AUD-012: el motivo tiene su propio campo; reference_document_id queda para documentos
ALTER TABLE "inventory_movements" ADD COLUMN "reason" VARCHAR(250);

-- Los ajustes manuales nuevos siempre llevan motivo. Los anteriores lo conservan en
-- reference_document_id y por eso la restricción no se valida sobre ellos.
ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_manual_adjustment_reason_check"
  CHECK ("reference_document_type" IS DISTINCT FROM 'AJUSTE_MANUAL' OR "reason" IS NOT NULL) NOT VALID;

-- 2. FARM-AUD-004: el lote del movimiento debe pertenecer a su producto, por cualquier ruta
CREATE UNIQUE INDEX "inventory_lots_id_product_id_key" ON "inventory_lots"("id", "product_id");

-- La clave compuesta sustituye a la de solo lote: también exige que el lote exista
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_lot_id_fkey";

ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_lot_id_product_id_fkey"
  FOREIGN KEY ("lot_id", "product_id") REFERENCES "inventory_lots"("id", "product_id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

-- Si el historial ya es consistente, la restricción queda validada por completo. Si no, se
-- informa y se mantiene NOT VALID: esos movimientos no se reescriben sin autorización.
DO $$
DECLARE
  mismatched_count INTEGER;
BEGIN
  SELECT count(*) INTO mismatched_count
  FROM "inventory_movements" m
  JOIN "inventory_lots" l ON l."id" = m."lot_id"
  WHERE m."product_id" <> l."product_id";

  IF mismatched_count = 0 THEN
    ALTER TABLE "inventory_movements"
      VALIDATE CONSTRAINT "inventory_movements_lot_id_product_id_fkey";
  ELSE
    RAISE NOTICE 'FARM-AUD-004: % movimiento(s) históricos registran un producto distinto al del lote; la restricción rige para movimientos nuevos y esos registros quedan para revisión.', mismatched_count;
  END IF;
END $$;

COMMIT;
