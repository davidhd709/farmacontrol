-- EP-11 / Slice 11.3a: documented, versioned SKU tax profiles.
-- Inclusive effective_to; NULL means an unbounded future interval.
-- No legal tax rates or product classifications are preloaded.
CREATE TYPE "TaxProfileOperation" AS ENUM ('SALE', 'PURCHASE');
CREATE TYPE "TaxTreatment" AS ENUM ('GRAVADO', 'EXENTO', 'EXCLUIDO', 'NO_APLICA');
CREATE TYPE "TaxProfileStatus" AS ENUM ('DRAFT', 'ACTIVE');

CREATE TABLE "product_tax_profiles" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "operation" "TaxProfileOperation" NOT NULL,
    "treatment" "TaxTreatment" NOT NULL,
    "rate_pct" DECIMAL(7,4),
    "status" "TaxProfileStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "document_reference" VARCHAR(500),
    "activated_by_id" UUID,
    "activated_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "product_tax_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "product_tax_profiles_dates_valid"
        CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
    CONSTRAINT "product_tax_profiles_rate_valid"
        CHECK (
            "rate_pct" IS NULL
            OR (
                "rate_pct" <= 100
                AND (
                    ("treatment" = 'GRAVADO' AND "rate_pct" > 0)
                    OR ("treatment" <> 'GRAVADO' AND "rate_pct" = 0)
                )
            )
        ),
    CONSTRAINT "product_tax_profiles_active_complete"
        CHECK (
            "status" <> 'ACTIVE'
            OR (
                "rate_pct" IS NOT NULL
                AND "document_reference" IS NOT NULL
                AND btrim("document_reference") <> ''
                AND "activated_by_id" IS NOT NULL
                AND "activated_at" IS NOT NULL
            )
        ),
    CONSTRAINT "product_tax_profiles_draft_not_activated"
        CHECK ("status" <> 'DRAFT' OR ("activated_by_id" IS NULL AND "activated_at" IS NULL))
);

CREATE INDEX "product_tax_profiles_product_id_operation_status_effective_from_idx"
    ON "product_tax_profiles"("product_id", "operation", "status", "effective_from");
CREATE INDEX "product_tax_profiles_activated_by_id_idx"
    ON "product_tax_profiles"("activated_by_id");

ALTER TABLE "product_tax_profiles"
    ADD CONSTRAINT "product_tax_profiles_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_tax_profiles"
    ADD CONSTRAINT "product_tax_profiles_activated_by_id_fkey"
    FOREIGN KEY ("activated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing accounting migrations install btree_gist; keep this migration safe
-- if the extension has not yet been enabled in a fresh environment.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- The exclusion constraint is concurrency-safe and rejects overlapping ACTIVE
-- date ranges for the same product and operation. Drafts may overlap.
ALTER TABLE "product_tax_profiles"
    ADD CONSTRAINT "product_tax_profiles_no_active_overlap"
    EXCLUDE USING gist (
        "product_id" WITH =,
        "operation" WITH =,
        daterange("effective_from", "effective_to", '[]') WITH &&
    )
    WHERE ("status" = 'ACTIVE');

CREATE FUNCTION guard_product_tax_profile_history() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'ACTIVE' THEN
            RAISE EXCEPTION 'ACTIVE tax profiles cannot be deleted'
                USING ERRCODE = '23514';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status = 'ACTIVE' THEN
        -- A profile can only be superseded prospectively. No classification,
        -- rate, documentary reference or past interval may be rewritten.
        IF NEW.id IS DISTINCT FROM OLD.id
            OR NEW.product_id IS DISTINCT FROM OLD.product_id
            OR NEW.operation IS DISTINCT FROM OLD.operation
            OR NEW.treatment IS DISTINCT FROM OLD.treatment
            OR NEW.rate_pct IS DISTINCT FROM OLD.rate_pct
            OR NEW.status IS DISTINCT FROM OLD.status
            OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
            OR NEW.document_reference IS DISTINCT FROM OLD.document_reference
            OR NEW.activated_by_id IS DISTINCT FROM OLD.activated_by_id
            OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
            OR NEW.created_at IS DISTINCT FROM OLD.created_at
            OR NEW.effective_to IS NOT DISTINCT FROM OLD.effective_to
            OR NEW.effective_to IS NULL
            OR NEW.effective_to <= CURRENT_DATE
            OR (OLD.effective_to IS NOT NULL AND NEW.effective_to >= OLD.effective_to)
        THEN
            RAISE EXCEPTION 'ACTIVE tax profile is immutable except a future shortening of effective_to'
                USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.status = 'ACTIVE' THEN
        IF NEW.effective_from < CURRENT_DATE THEN
            RAISE EXCEPTION 'Tax profile activation cannot start in the past'
                USING ERRCODE = '23514';
        END IF;
        NEW.activated_at := CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_tax_profiles_history_guard
    BEFORE INSERT OR UPDATE OR DELETE ON "product_tax_profiles"
    FOR EACH ROW EXECUTE FUNCTION guard_product_tax_profile_history();
