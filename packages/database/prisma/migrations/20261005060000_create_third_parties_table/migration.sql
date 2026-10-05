-- CreateTable
CREATE TABLE "third_parties" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "person_type" VARCHAR(20) NOT NULL DEFAULT 'NATURAL',
    "document_type" VARCHAR(20) NOT NULL DEFAULT 'CC',
    "document_number" VARCHAR(50) NOT NULL,
    "verification_digit" VARCHAR(2),
    "name" VARCHAR(200) NOT NULL,
    "trade_name" VARCHAR(200),
    "contact_name" VARCHAR(100),
    "phone" VARCHAR(50),
    "email" VARCHAR(100),
    "address" VARCHAR(255),
    "city" VARCHAR(100),
    "department" VARCHAR(100),
    "tax_regime" VARCHAR(50) DEFAULT 'NO_RESPONSABLE_IVA',
    "is_customer" BOOLEAN NOT NULL DEFAULT false,
    "is_supplier" BOOLEAN NOT NULL DEFAULT false,
    "is_employee" BOOLEAN NOT NULL DEFAULT false,
    "is_other" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customer_id" UUID,
    "supplier_id" UUID,

    CONSTRAINT "third_parties_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "third_parties_document_number_key" ON "third_parties"("document_number");
CREATE UNIQUE INDEX "third_parties_customer_id_key" ON "third_parties"("customer_id");
CREATE UNIQUE INDEX "third_parties_supplier_id_key" ON "third_parties"("supplier_id");
CREATE INDEX "third_parties_document_number_idx" ON "third_parties"("document_number");
CREATE INDEX "third_parties_name_idx" ON "third_parties"("name");
CREATE INDEX "third_parties_is_customer_idx" ON "third_parties"("is_customer");
CREATE INDEX "third_parties_is_supplier_idx" ON "third_parties"("is_supplier");
CREATE INDEX "third_parties_is_employee_idx" ON "third_parties"("is_employee");
CREATE INDEX "third_parties_is_active_idx" ON "third_parties"("is_active");

-- AddForeignKey
ALTER TABLE "third_parties" ADD CONSTRAINT "third_parties_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "third_parties" ADD CONSTRAINT "third_parties_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill existing customers into third_parties
INSERT INTO "third_parties" (
    "id",
    "person_type",
    "document_type",
    "document_number",
    "name",
    "phone",
    "email",
    "address",
    "is_customer",
    "is_supplier",
    "is_employee",
    "is_other",
    "is_active",
    "customer_id",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid(),
    CASE WHEN "document_type" = 'NIT' THEN 'JURIDICA' ELSE 'NATURAL' END,
    "document_type",
    "document_number",
    "name",
    "phone",
    "email",
    "address",
    true,
    false,
    false,
    false,
    "is_active",
    "id",
    "created_at",
    "updated_at"
FROM "customers"
ON CONFLICT ("document_number") DO NOTHING;

-- Backfill existing suppliers into third_parties (or unify if same document)
INSERT INTO "third_parties" (
    "id",
    "person_type",
    "document_type",
    "document_number",
    "name",
    "contact_name",
    "phone",
    "email",
    "address",
    "is_customer",
    "is_supplier",
    "is_employee",
    "is_other",
    "is_active",
    "supplier_id",
    "created_at",
    "updated_at"
)
SELECT
    gen_random_uuid(),
    'JURIDICA',
    'NIT',
    "tax_id",
    "name",
    "contact_name",
    "phone",
    "email",
    "address",
    false,
    true,
    false,
    false,
    "is_active",
    "id",
    "created_at",
    "updated_at"
FROM "suppliers"
ON CONFLICT ("document_number") DO UPDATE SET
    "is_supplier" = true,
    "supplier_id" = EXCLUDED."supplier_id",
    "contact_name" = COALESCE("third_parties"."contact_name", EXCLUDED."contact_name");
