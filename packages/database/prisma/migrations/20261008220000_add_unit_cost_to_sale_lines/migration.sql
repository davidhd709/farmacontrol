-- Costo por unidad base vigente al confirmar la venta (AUD-007).
-- Permite que notas crédito y reportes usen el costo histórico y no el actual.
-- Las ventas anteriores a esta migración quedan en NULL: no se inventa su costo.
ALTER TABLE "sale_lines" ADD COLUMN "unit_cost_base" DECIMAL(12,2);

ALTER TABLE "sale_lines"
  ADD CONSTRAINT "sale_lines_unit_cost_base_non_negative"
  CHECK ("unit_cost_base" IS NULL OR "unit_cost_base" >= 0);
