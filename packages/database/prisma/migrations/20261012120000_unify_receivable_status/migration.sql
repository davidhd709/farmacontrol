-- FARM-AUD-003: la anulación de ventas a crédito guardaba 'CANCELADA', un estado que el contrato
-- de cartera (PENDIENTE, PAGADA, ANULADA) no reconoce. Se regulariza a 'ANULADA' solo donde su
-- significado está confirmado (la venta de origen está anulada) y se impide cualquier otro valor.
-- No cambia importes, abonos, notas ni relaciones.
-- Transacción y bloqueo explícitos: ninguna escritura concurrente puede colarse entre la
-- validación, la regularización y la restricción, y un fallo no deja cambios parciales.
BEGIN;

LOCK TABLE "receivables" IN ACCESS EXCLUSIVE MODE;

-- 1. Detenerse ante datos cuyo significado no está confirmado, sin modificar nada
DO $$
DECLARE
  unknown_count INTEGER;
  unconfirmed_count INTEGER;
BEGIN
  SELECT count(*) INTO unknown_count
  FROM "receivables"
  WHERE "status" NOT IN ('PENDIENTE', 'PAGADA', 'ANULADA', 'CANCELADA');

  IF unknown_count > 0 THEN
    RAISE EXCEPTION 'FARM-AUD-003: % cuenta(s) por cobrar con estado no reconocido; revisarlas antes de migrar.', unknown_count;
  END IF;

  SELECT count(*) INTO unconfirmed_count
  FROM "receivables" r
  JOIN "sales" s ON s."id" = r."sale_id"
  WHERE r."status" = 'CANCELADA' AND s."status" <> 'CANCELLED';

  IF unconfirmed_count > 0 THEN
    RAISE EXCEPTION 'FARM-AUD-003: % cuenta(s) por cobrar CANCELADA de una venta no anulada; revisarlas antes de migrar.', unconfirmed_count;
  END IF;
END $$;

-- 2. Regularizar al estado canónico
UPDATE "receivables" r
SET "status" = 'ANULADA'
FROM "sales" s
WHERE s."id" = r."sale_id"
  AND r."status" = 'CANCELADA'
  AND s."status" = 'CANCELLED';

-- 3. Ningún camino puede volver a escribir un estado fuera del contrato
ALTER TABLE "receivables"
ADD CONSTRAINT "chk_receivables_status_allowed"
CHECK ("status" IN ('PENDIENTE', 'PAGADA', 'ANULADA'));

COMMIT;
