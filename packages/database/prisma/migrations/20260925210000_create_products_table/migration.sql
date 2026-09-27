-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "barcode" VARCHAR(50),
    "name" VARCHAR(150) NOT NULL,
    "generic_name" VARCHAR(150),
    "concentration" VARCHAR(50),
    "sanitary_registry" VARCHAR(50),
    "manufacturer" VARCHAR(100),
    "description" VARCHAR(500),
    "requires_lot_control" BOOLEAN NOT NULL DEFAULT true,
    "prescription_required" BOOLEAN NOT NULL DEFAULT false,
    "base_unit" VARCHAR(30) NOT NULL DEFAULT 'UNIDAD',
    "base_price" DECIMAL(12,2) NOT NULL,
    "base_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

-- CreateIndex (Case-insensitive unique SKU/code)
CREATE UNIQUE INDEX "products_code_lower_key" ON "products"(LOWER("code"));

-- CreateIndex (Unique barcode when present)
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_name_idx" ON "products"("name");

-- CreateIndex
CREATE INDEX "products_generic_name_idx" ON "products"("generic_name");

-- CreateIndex
CREATE INDEX "products_is_active_idx" ON "products"("is_active");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
