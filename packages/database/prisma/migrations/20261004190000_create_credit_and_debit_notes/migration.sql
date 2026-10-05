-- CreateTable
CREATE TABLE "credit_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "credit_note_number" VARCHAR(50) NOT NULL,
    "sale_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "tax_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "refund_method" VARCHAR(50) NOT NULL DEFAULT 'EFECTIVO',
    "restock" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_note_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "credit_note_id" UUID NOT NULL,
    "sale_line_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "lot_id" UUID,
    "quantity_commercial" DECIMAL(10,2) NOT NULL,
    "quantity_base_units" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_note_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debit_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "debit_note_number" VARCHAR(50) NOT NULL,
    "purchase_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "tax_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "debit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debit_note_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "debit_note_id" UUID NOT NULL,
    "purchase_line_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "quantity_commercial" DECIMAL(12,4) NOT NULL,
    "quantity_base_units" INTEGER NOT NULL,
    "unit_cost" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debit_note_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_credit_note_number_key" ON "credit_notes"("credit_note_number");
CREATE INDEX "credit_notes_sale_id_idx" ON "credit_notes"("sale_id");
CREATE INDEX "credit_notes_customer_id_idx" ON "credit_notes"("customer_id");
CREATE INDEX "credit_notes_credit_note_number_idx" ON "credit_notes"("credit_note_number");
CREATE INDEX "credit_notes_created_at_idx" ON "credit_notes"("created_at");

-- CreateIndex
CREATE INDEX "credit_note_lines_credit_note_id_idx" ON "credit_note_lines"("credit_note_id");
CREATE INDEX "credit_note_lines_sale_line_id_idx" ON "credit_note_lines"("sale_line_id");
CREATE INDEX "credit_note_lines_product_id_idx" ON "credit_note_lines"("product_id");
CREATE INDEX "credit_note_lines_lot_id_idx" ON "credit_note_lines"("lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "debit_notes_debit_note_number_key" ON "debit_notes"("debit_note_number");
CREATE INDEX "debit_notes_purchase_id_idx" ON "debit_notes"("purchase_id");
CREATE INDEX "debit_notes_supplier_id_idx" ON "debit_notes"("supplier_id");
CREATE INDEX "debit_notes_debit_note_number_idx" ON "debit_notes"("debit_note_number");
CREATE INDEX "debit_notes_created_at_idx" ON "debit_notes"("created_at");

-- CreateIndex
CREATE INDEX "debit_note_lines_debit_note_id_idx" ON "debit_note_lines"("debit_note_id");
CREATE INDEX "debit_note_lines_purchase_line_id_idx" ON "debit_note_lines"("purchase_line_id");
CREATE INDEX "debit_note_lines_product_id_idx" ON "debit_note_lines"("product_id");
CREATE INDEX "debit_note_lines_lot_id_idx" ON "debit_note_lines"("lot_id");

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "credit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_sale_line_id_fkey" FOREIGN KEY ("sale_line_id") REFERENCES "sale_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_note_lines" ADD CONSTRAINT "debit_note_lines_debit_note_id_fkey" FOREIGN KEY ("debit_note_id") REFERENCES "debit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "debit_note_lines" ADD CONSTRAINT "debit_note_lines_purchase_line_id_fkey" FOREIGN KEY ("purchase_line_id") REFERENCES "purchase_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "debit_note_lines" ADD CONSTRAINT "debit_note_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "debit_note_lines" ADD CONSTRAINT "debit_note_lines_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
