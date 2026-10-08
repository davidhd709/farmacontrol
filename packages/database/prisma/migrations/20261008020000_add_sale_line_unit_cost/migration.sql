-- AUD-007: costo unitario (por unidad base) vigente al confirmar la venta.
-- Las notas crédito revierten el costo de venta con este valor histórico.
-- Nulo en ventas anteriores a esta migración.
ALTER TABLE "sale_lines" ADD COLUMN "unit_cost" DECIMAL(12,2);
