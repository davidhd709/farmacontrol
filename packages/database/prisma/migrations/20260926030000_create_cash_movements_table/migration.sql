-- CreateTable
CREATE TABLE "cash_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "movement_type" VARCHAR(50) NOT NULL,
    "amount" DECIMAL(12, 2) NOT NULL,
    "payment_method" VARCHAR(50) NOT NULL DEFAULT 'EFECTIVO',
    "reason" VARCHAR(255) NOT NULL,
    "reference_document_type" VARCHAR(50),
    "reference_document_id" VARCHAR(100),
    "balance_after" DECIMAL(12, 2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" UUID NOT NULL,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cash_movements_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "cash_movements_balance_after_non_negative" CHECK ("balance_after" >= 0)
);

-- CreateIndex
CREATE INDEX "cash_movements_movement_type_idx" ON "cash_movements"("movement_type");

-- CreateIndex
CREATE INDEX "cash_movements_payment_method_idx" ON "cash_movements"("payment_method");

-- CreateIndex
CREATE INDEX "cash_movements_created_at_idx" ON "cash_movements"("created_at");

-- CreateIndex
CREATE INDEX "cash_movements_created_by_user_id_idx" ON "cash_movements"("created_by_user_id");

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
