-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "movement_type" VARCHAR(50) NOT NULL,
    "product_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "presentation_id" UUID,
    "quantity_base_units" INTEGER NOT NULL,
    "presentation_factor_historical" INTEGER NOT NULL DEFAULT 1,
    "quantity_commercial" DECIMAL(12,4),
    "balance_after_base_units" INTEGER NOT NULL,
    "reference_document_type" VARCHAR(50),
    "reference_document_id" VARCHAR(100),
    "notes" VARCHAR(500),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_movements_balance_non_negative" CHECK ("balance_after_base_units" >= 0)
);

-- CreateIndex
CREATE INDEX "inventory_movements_product_id_idx" ON "inventory_movements"("product_id");

-- CreateIndex
CREATE INDEX "inventory_movements_lot_id_idx" ON "inventory_movements"("lot_id");

-- CreateIndex
CREATE INDEX "inventory_movements_movement_type_idx" ON "inventory_movements"("movement_type");

-- CreateIndex
CREATE INDEX "inventory_movements_created_at_idx" ON "inventory_movements"("created_at");

-- CreateIndex
CREATE INDEX "inventory_movements_reference_document_type_reference_docume_idx" ON "inventory_movements"("reference_document_type", "reference_document_id");

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "product_presentations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
