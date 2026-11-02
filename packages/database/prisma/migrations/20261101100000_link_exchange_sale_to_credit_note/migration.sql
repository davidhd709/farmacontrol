-- Correcciones del cliente (2026-11-01), fase 2: cambio de producto. La devolución (nota
-- crédito) queda vinculada a la venta nueva que entrega el producto de reemplazo. Una nota
-- crédito respalda a lo sumo un cambio. Las notas existentes quedan sin vínculo (NULL).
ALTER TABLE "credit_notes" ADD COLUMN "exchange_sale_id" UUID;

CREATE UNIQUE INDEX "credit_notes_exchange_sale_id_key" ON "credit_notes"("exchange_sale_id");

ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_exchange_sale_id_fkey"
  FOREIGN KEY ("exchange_sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
