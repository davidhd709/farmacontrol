-- EP-11 / Slice 11.1: preserve historical mappings in every status.
-- A purpose has at most one mapping on any calendar date, regardless of status.
BEGIN;

LOCK TABLE "company_accounting_mappings" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "company_accounting_mappings" a
        JOIN "company_accounting_mappings" b
          ON a."purpose" = b."purpose"
         AND a."id" < b."id"
         AND daterange(a."effective_from", a."effective_to", '[]')
             && daterange(b."effective_from", b."effective_to", '[]')
    ) THEN
        RAISE EXCEPTION 'Overlapping accounting mapping periods exist; resolve them before migrating'
            USING ERRCODE = '23514';
    END IF;
END;
$$;

DROP INDEX "company_accounting_mappings_one_pending_per_purpose";
ALTER TABLE "company_accounting_mappings"
    DROP CONSTRAINT "company_accounting_mappings_no_active_overlap";

-- Inclusive effective_to; NULL means an unbounded future interval.
ALTER TABLE "company_accounting_mappings"
    ADD CONSTRAINT "company_accounting_mappings_no_period_overlap"
    EXCLUDE USING gist (
        "purpose" WITH =,
        daterange("effective_from", "effective_to", '[]') WITH &&
    );

COMMIT;
