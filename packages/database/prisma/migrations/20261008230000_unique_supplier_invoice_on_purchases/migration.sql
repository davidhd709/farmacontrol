-- Una factura de proveedor solo puede recibirse una vez (AUD-008).
-- Si ya existen duplicados, esta migración falla a propósito: deben revisarse antes de aplicarla.
CREATE UNIQUE INDEX "purchases_supplier_id_invoice_number_key" ON "purchases"("supplier_id", "invoice_number");
