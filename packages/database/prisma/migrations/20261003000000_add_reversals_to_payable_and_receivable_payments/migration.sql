-- Agregar campos de reversión a payable_payments
ALTER TABLE "payable_payments" ADD COLUMN "is_reversed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "payable_payments" ADD COLUMN "reversed_at" TIMESTAMPTZ;
ALTER TABLE "payable_payments" ADD COLUMN "reversal_reason" VARCHAR(500);
ALTER TABLE "payable_payments" ADD COLUMN "reversed_by_user_id" UUID;

-- Agregar campos de reversión a receivable_payments
ALTER TABLE "receivable_payments" ADD COLUMN "is_reversed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "receivable_payments" ADD COLUMN "reversed_at" TIMESTAMPTZ;
ALTER TABLE "receivable_payments" ADD COLUMN "reversal_reason" VARCHAR(500);
ALTER TABLE "receivable_payments" ADD COLUMN "reversed_by_user_id" UUID;

-- Índices de consulta rápida
CREATE INDEX "payable_payments_is_reversed_idx" ON "payable_payments"("is_reversed");
CREATE INDEX "receivable_payments_is_reversed_idx" ON "receivable_payments"("is_reversed");
