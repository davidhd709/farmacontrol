-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tax_id" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "contact_name" VARCHAR(100),
    "phone" VARCHAR(50),
    "email" VARCHAR(100),
    "address" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tax_id_key" ON "suppliers"("tax_id");

-- CreateIndex
CREATE INDEX "suppliers_tax_id_idx" ON "suppliers"("tax_id");

-- CreateIndex
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");

-- CreateIndex
CREATE INDEX "suppliers_is_active_idx" ON "suppliers"("is_active");
