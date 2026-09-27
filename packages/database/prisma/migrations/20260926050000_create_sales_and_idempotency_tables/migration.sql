-- CreateTable sales
CREATE TABLE "sales" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_number" VARCHAR(50) NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
    "payment_method" VARCHAR(50) NOT NULL DEFAULT 'EFECTIVO',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "tax_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "change_given" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" VARCHAR(500),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sales_subtotal_positive_check" CHECK ("subtotal" >= 0),
    CONSTRAINT "sales_tax_positive_check" CHECK ("tax_total" >= 0),
    CONSTRAINT "sales_discount_positive_check" CHECK ("discount_total" >= 0),
    CONSTRAINT "sales_total_positive_check" CHECK ("total" >= 0),
    CONSTRAINT "sales_amount_paid_positive_check" CHECK ("amount_paid" >= 0),
    CONSTRAINT "sales_change_given_positive_check" CHECK ("change_given" >= 0)
);

-- CreateTable sale_lines
CREATE TABLE "sale_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sale_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "presentation_id" UUID,
    "presentation_factor_historical" INTEGER NOT NULL DEFAULT 1,
    "quantity_commercial" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "quantity_base_units" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sale_lines_quantity_commercial_check" CHECK ("quantity_commercial" > 0),
    CONSTRAINT "sale_lines_quantity_base_check" CHECK ("quantity_base_units" > 0),
    CONSTRAINT "sale_lines_unit_price_check" CHECK ("unit_price" >= 0),
    CONSTRAINT "sale_lines_total_check" CHECK ("total" >= 0)
);

-- CreateTable sale_lot_allocations
CREATE TABLE "sale_lot_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sale_id" UUID NOT NULL,
    "sale_line_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "quantity_base_units" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_lot_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sale_lot_allocations_quantity_check" CHECK ("quantity_base_units" > 0)
);

-- CreateTable idempotency_keys
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" VARCHAR(100) NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" VARCHAR(200) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "idempotency_keys_expires_check" CHECK ("expires_at" > "created_at")
);

-- Indexes for sales
CREATE UNIQUE INDEX "sales_invoice_number_key" ON "sales"("invoice_number");
CREATE INDEX "sales_invoice_number_idx" ON "sales"("invoice_number");
CREATE INDEX "sales_customer_id_idx" ON "sales"("customer_id");
CREATE INDEX "sales_status_idx" ON "sales"("status");
CREATE INDEX "sales_created_at_idx" ON "sales"("created_at");
CREATE INDEX "sales_created_by_id_idx" ON "sales"("created_by_id");

-- Indexes for sale_lines
CREATE INDEX "sale_lines_sale_id_idx" ON "sale_lines"("sale_id");
CREATE INDEX "sale_lines_product_id_idx" ON "sale_lines"("product_id");
CREATE INDEX "sale_lines_presentation_id_idx" ON "sale_lines"("presentation_id");

-- Indexes for sale_lot_allocations
CREATE INDEX "sale_lot_allocations_sale_id_idx" ON "sale_lot_allocations"("sale_id");
CREATE INDEX "sale_lot_allocations_sale_line_id_idx" ON "sale_lot_allocations"("sale_line_id");
CREATE INDEX "sale_lot_allocations_lot_id_idx" ON "sale_lot_allocations"("lot_id");

-- Indexes for idempotency_keys
CREATE UNIQUE INDEX "idempotency_keys_key_key" ON "idempotency_keys"("key");
CREATE INDEX "idempotency_keys_key_idx" ON "idempotency_keys"("key");
CREATE INDEX "idempotency_keys_user_id_idx" ON "idempotency_keys"("user_id");
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- Foreign Keys
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "product_presentations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_lot_allocations" ADD CONSTRAINT "sale_lot_allocations_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_lot_allocations" ADD CONSTRAINT "sale_lot_allocations_sale_line_id_fkey" FOREIGN KEY ("sale_line_id") REFERENCES "sale_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_lot_allocations" ADD CONSTRAINT "sale_lot_allocations_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
