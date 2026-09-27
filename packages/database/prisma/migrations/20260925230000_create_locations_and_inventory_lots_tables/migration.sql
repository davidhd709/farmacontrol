-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_lots" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "lot_number" VARCHAR(100) NOT NULL,
    "expiration_date" DATE NOT NULL,
    "current_quantity" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "inventory_lots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_lots_quantity_non_negative" CHECK ("current_quantity" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "locations_code_key" ON "locations"("code");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_lots_product_id_location_id_lot_number_key" ON "inventory_lots"("product_id", "location_id", "lot_number");

-- CreateIndex
CREATE INDEX "inventory_lots_product_id_idx" ON "inventory_lots"("product_id");

-- CreateIndex
CREATE INDEX "inventory_lots_location_id_idx" ON "inventory_lots"("location_id");

-- CreateIndex: Indice optimizado para FEFO
CREATE INDEX "inventory_lots_product_id_expiration_date_current_quantity_idx" ON "inventory_lots"("product_id", "expiration_date" ASC, "current_quantity");

-- CreateIndex: Indice para alertas de vencimiento por rango de fechas
CREATE INDEX "inventory_lots_expiration_date_idx" ON "inventory_lots"("expiration_date");

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
