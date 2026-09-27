-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_type" VARCHAR(20) NOT NULL DEFAULT 'CC',
    "document_number" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(50),
    "email" VARCHAR(100),
    "address" VARCHAR(200),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_document_number_key" ON "customers"("document_number");

-- CreateIndex
CREATE INDEX "customers_document_number_idx" ON "customers"("document_number");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers"("name");

-- CreateIndex
CREATE INDEX "customers_is_active_idx" ON "customers"("is_active");

-- CreateIndex
CREATE INDEX "customers_is_default_idx" ON "customers"("is_default");

-- Insert Default Customer (Consumidor Final / Cuantías Menores)
INSERT INTO "customers" ("id", "document_type", "document_number", "name", "is_default", "is_active", "created_at", "updated_at")
VALUES (
    gen_random_uuid(),
    'CC',
    '222222222222',
    'Consumidor Final (Cuantías Menores)',
    true,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("document_number") DO NOTHING;
