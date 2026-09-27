-- CreateTable
CREATE TABLE "product_presentations" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "barcode" VARCHAR(50),
    "conversion_factor" INTEGER NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "product_presentations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_presentations_factor_positive" CHECK ("conversion_factor" > 0),
    CONSTRAINT "chk_presentations_price_non_negative" CHECK ("price" >= 0),
    CONSTRAINT "chk_presentations_cost_non_negative" CHECK ("cost" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "product_presentations_barcode_key" ON "product_presentations"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "product_presentations_product_id_name_key" ON "product_presentations"("product_id", "name");

-- CreateIndex
CREATE INDEX "product_presentations_product_id_idx" ON "product_presentations"("product_id");

-- CreateIndex
CREATE INDEX "product_presentations_product_id_is_active_idx" ON "product_presentations"("product_id", "is_active");

-- AddForeignKey
ALTER TABLE "product_presentations" ADD CONSTRAINT "product_presentations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
