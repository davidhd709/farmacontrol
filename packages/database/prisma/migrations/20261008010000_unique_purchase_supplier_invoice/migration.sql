-- AUD-008: una factura de proveedor solo puede recibirse una vez.
-- Si ya existen duplicados, la migración se detiene con un mensaje claro
-- para que se depuren manualmente antes de aplicar la restricción.
DO $$
DECLARE
  duplicated integer;
BEGIN
  SELECT count(*) INTO duplicated
  FROM (
    SELECT supplier_id, invoice_number
    FROM purchases
    GROUP BY supplier_id, invoice_number
    HAVING count(*) > 1
  ) d;

  IF duplicated > 0 THEN
    RAISE EXCEPTION 'Existen % facturas de proveedor registradas más de una vez en purchases; depúrelas antes de aplicar esta migración.', duplicated;
  END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "purchases_supplier_id_invoice_number_key" ON "purchases"("supplier_id", "invoice_number");
