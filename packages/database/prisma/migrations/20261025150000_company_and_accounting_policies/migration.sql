-- F3 (ADR-006): empresa, sucursales y políticas contables versionadas. Solo agrega
-- tablas y un propósito contable; no toca datos existentes.

ALTER TYPE "AccountingPurpose" ADD VALUE 'INVENTORY_COST_VARIANCE';

CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "legal_name" VARCHAR(200) NOT NULL,
    "trade_name" VARCHAR(200),
    "tax_id" VARCHAR(15) NOT NULL,
    "tax_id_check_digit" CHAR(1) NOT NULL,
    "sector_profile" VARCHAR(32) NOT NULL,
    "address" VARCHAR(250),
    "municipality_code" CHAR(5),
    "email" VARCHAR(150),
    "phone" VARCHAR(30),
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "companies_tax_id_check" CHECK ("tax_id" ~ '^[0-9]{5,15}$'),
    CONSTRAINT "companies_tax_id_check_digit_check" CHECK ("tax_id_check_digit" ~ '^[0-9]$'),
    CONSTRAINT "companies_sector_profile_check" CHECK ("sector_profile" IN ('PHARMACY')),
    CONSTRAINT "companies_municipality_code_check" CHECK ("municipality_code" IS NULL OR "municipality_code" ~ '^[0-9]{5}$'),
    CONSTRAINT "companies_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE'))
);
CREATE UNIQUE INDEX "companies_tax_id_key" ON "companies"("tax_id");
-- Modo dedicado: una sola empresa activa. F9 (modo compartido) retira este índice.
CREATE UNIQUE INDEX "companies_single_active_key" ON "companies" (("status")) WHERE "status" = 'ACTIVE';

CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "address" VARCHAR(250),
    "municipality_code" CHAR(5),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "branches_municipality_code_check" CHECK ("municipality_code" IS NULL OR "municipality_code" ~ '^[0-9]{5}$')
);
CREATE UNIQUE INDEX "branches_company_id_code_key" ON "branches"("company_id", "code");
-- Una sola sucursal principal por empresa
CREATE UNIQUE INDEX "branches_single_default_key" ON "branches"("company_id") WHERE "is_default";
ALTER TABLE "branches"
    ADD CONSTRAINT "branches_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "company_accounting_policies" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "costing_method" VARCHAR(32) NOT NULL,
    "opening_cost_source" VARCHAR(32) NOT NULL,
    "purchase_return_variance_purpose" VARCHAR(32) NOT NULL,
    "bonus_units_treatment" VARCHAR(32) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_accounting_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "company_accounting_policies_costing_method_check"
        CHECK ("costing_method" IN ('WEIGHTED_AVERAGE', 'FIFO', 'SPECIFIC_LOT')),
    CONSTRAINT "company_accounting_policies_opening_cost_source_check"
        CHECK ("opening_cost_source" IN ('LAST_PURCHASE_THEN_CATALOG', 'CATALOG')),
    CONSTRAINT "company_accounting_policies_variance_purpose_check"
        CHECK ("purchase_return_variance_purpose" IN ('COST_OF_SALES', 'INVENTORY_COST_VARIANCE')),
    CONSTRAINT "company_accounting_policies_bonus_units_check"
        CHECK ("bonus_units_treatment" IN ('ZERO_COST_IN_AVERAGE')),
    CONSTRAINT "company_accounting_policies_reason_check" CHECK (length(btrim("reason")) > 0)
);
CREATE UNIQUE INDEX "company_accounting_policies_company_id_effective_from_key"
    ON "company_accounting_policies"("company_id", "effective_from");
ALTER TABLE "company_accounting_policies"
    ADD CONSTRAINT "company_accounting_policies_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_accounting_policies"
    ADD CONSTRAINT "company_accounting_policies_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Las versiones de política son historia: se agrega una nueva en lugar de editar
CREATE TRIGGER company_accounting_policies_immutable_trg
BEFORE UPDATE OR DELETE ON "company_accounting_policies"
FOR EACH ROW EXECUTE FUNCTION prevent_movement_modification();
