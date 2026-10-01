-- Plan de cuentas y mapeo de propósitos (EP-11 / Slice 11.1).
-- La exclusión de intervalos por propósito requiere comparar enums con GiST.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE', 'COST');
CREATE TYPE "AccountingPurpose" AS ENUM (
    'CASH', 'BANK', 'CUSTOMERS', 'SUPPLIERS', 'INVENTORY',
    'SALES_TAXED', 'SALES_EXCLUDED', 'COST_OF_SALES',
    'VAT_OUTPUT', 'VAT_INPUT', 'VAT_INPUT_COMMON', 'VAT_NON_DEDUCTIBLE',
    'SIMPLE_TAX_ADVANCE', 'SALES_RETURNS', 'SALES_DISCOUNTS',
    'CAPITAL', 'CURRENT_YEAR_RESULT'
);
CREATE TYPE "AccountingMappingStatus" AS ENUM ('PENDING_MAPPING', 'ACTIVE', 'INACTIVE');

CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" "AccountType" NOT NULL,
    "parent_id" UUID,
    "level" INTEGER NOT NULL,
    "allows_movement" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "accounts_code_nonblank" CHECK (btrim("code") <> '' AND "code" = btrim("code")),
    CONSTRAINT "accounts_name_nonblank" CHECK (btrim("name") <> ''),
    CONSTRAINT "accounts_level_valid" CHECK ("level" >= 1 AND ("parent_id" IS NOT NULL OR "level" = 1)),
    CONSTRAINT "accounts_not_own_parent" CHECK ("parent_id" IS DISTINCT FROM "id")
);

CREATE TABLE "company_accounting_mappings" (
    "id" UUID NOT NULL,
    "purpose" "AccountingPurpose" NOT NULL,
    "account_id" UUID,
    "status" "AccountingMappingStatus" NOT NULL DEFAULT 'PENDING_MAPPING',
    "effective_from" DATE NOT NULL DEFAULT CURRENT_DATE,
    "effective_to" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "updated_by_id" UUID,
    CONSTRAINT "company_accounting_mappings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "company_accounting_mappings_active_has_account" CHECK ("status" <> 'ACTIVE' OR "account_id" IS NOT NULL),
    CONSTRAINT "company_accounting_mappings_pending_has_no_account" CHECK ("status" <> 'PENDING_MAPPING' OR "account_id" IS NULL),
    CONSTRAINT "company_accounting_mappings_dates_valid" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from")
);

CREATE UNIQUE INDEX "accounts_code_key" ON "accounts"("code");
CREATE INDEX "accounts_parent_id_idx" ON "accounts"("parent_id");
CREATE INDEX "accounts_name_idx" ON "accounts"("name");
CREATE INDEX "accounts_type_is_active_idx" ON "accounts"("type", "is_active");
CREATE INDEX "company_accounting_mappings_account_id_idx" ON "company_accounting_mappings"("account_id");
CREATE INDEX "company_accounting_mappings_updated_by_id_idx" ON "company_accounting_mappings"("updated_by_id");
CREATE INDEX "company_accounting_mappings_purpose_status_effective_from_idx" ON "company_accounting_mappings"("purpose", "status", "effective_from");
CREATE UNIQUE INDEX "company_accounting_mappings_one_pending_per_purpose"
    ON "company_accounting_mappings"("purpose") WHERE "status" = 'PENDING_MAPPING';

-- Inclusive end date; NULL means indefinite. This exclusion is concurrency-safe.
ALTER TABLE "company_accounting_mappings" ADD CONSTRAINT "company_accounting_mappings_no_active_overlap"
    EXCLUDE USING gist ("purpose" WITH =, daterange("effective_from", "effective_to", '[]') WITH &&)
    WHERE ("status" = 'ACTIVE');

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_accounting_mappings" ADD CONSTRAINT "company_accounting_mappings_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_accounting_mappings" ADD CONSTRAINT "company_accounting_mappings_updated_by_id_fkey"
    FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ACTIVE mappings must point to an active account that accepts postings. Locking
-- the account prevents a concurrent deactivation from racing the mapping write.
CREATE FUNCTION check_active_accounting_mapping_account() RETURNS trigger AS $$
DECLARE
    eligible BOOLEAN;
BEGIN
    IF NEW.status = 'ACTIVE' THEN
        SELECT (is_active AND allows_movement) INTO eligible
        FROM accounts WHERE id = NEW.account_id FOR SHARE;
        IF eligible IS DISTINCT FROM TRUE THEN
            RAISE EXCEPTION 'ACTIVE accounting mapping requires an active movement account'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER company_accounting_mappings_active_account_trg
BEFORE INSERT OR UPDATE OF account_id, status ON "company_accounting_mappings"
FOR EACH ROW EXECUTE FUNCTION check_active_accounting_mapping_account();

CREATE FUNCTION protect_accounting_mapped_account() RETURNS trigger AS $$
BEGIN
    IF (OLD.is_active AND NOT NEW.is_active) OR (OLD.allows_movement AND NOT NEW.allows_movement) THEN
        IF EXISTS (
            SELECT 1 FROM company_accounting_mappings
            WHERE account_id = NEW.id AND status = 'ACTIVE'
              AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
        ) THEN
            RAISE EXCEPTION 'Cannot deactivate or make non-postable an account with a current or future ACTIVE mapping'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounts_protect_mapped_account_trg
BEFORE UPDATE OF is_active, allows_movement ON "accounts"
FOR EACH ROW EXECUTE FUNCTION protect_accounting_mapped_account();
