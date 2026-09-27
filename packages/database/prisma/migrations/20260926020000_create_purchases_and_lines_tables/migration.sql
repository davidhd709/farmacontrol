-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "supplier_id" UUID NOT NULL,
    "invoice_number" VARCHAR(100) NOT NULL,
    "purchase_date" DATE NOT NULL,
    "total_amount" DECIMAL(12, 2) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'RECEIVED',
    "notes" VARCHAR(500),
    "received_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchases_total_amount_positive" CHECK ("total_amount" >= 0)
);

-- CreateTable
CREATE TABLE "purchase_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purchase_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "presentation_id" UUID,
    "lot_id" UUID NOT NULL,
    "quantity_commercial" DECIMAL(12, 4) NOT NULL,
    "quantity_base_units" INTEGER NOT NULL,
    "unit_cost" DECIMAL(12, 2) NOT NULL,
    "subtotal" DECIMAL(12, 2) NOT NULL,
    "lot_number" VARCHAR(100) NOT NULL,
    "expiration_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_lines_quantity_base_units_positive" CHECK ("quantity_base_units" > 0),
    CONSTRAINT "purchase_lines_unit_cost_non_negative" CHECK ("unit_cost" >= 0),
    CONSTRAINT "purchase_lines_subtotal_non_negative" CHECK ("subtotal" >= 0)
);

-- CreateIndex
CREATE INDEX "purchases_supplier_id_idx" ON "purchases"("supplier_id");

-- CreateIndex
CREATE INDEX "purchases_invoice_number_idx" ON "purchases"("invoice_number");

-- CreateIndex
CREATE INDEX "purchases_purchase_date_idx" ON "purchases"("purchase_date");

-- CreateIndex
CREATE INDEX "purchases_status_idx" ON "purchases"("status");

-- CreateIndex
CREATE INDEX "purchase_lines_purchase_id_idx" ON "purchase_lines"("purchase_id");

-- CreateIndex
CREATE INDEX "purchase_lines_product_id_idx" ON "purchase_lines"("product_id");

-- CreateIndex
CREATE INDEX "purchase_lines_lot_id_idx" ON "purchase_lines"("lot_id");

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_received_by_user_id_fkey" FOREIGN KEY ("received_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "product_presentations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
