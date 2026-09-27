-- AlterTable product_presentations: Add hierarchical packaging and sales/purchases configuration
ALTER TABLE "product_presentations"
    ADD COLUMN IF NOT EXISTS "unit_of_measure_id" UUID,
    ADD COLUMN IF NOT EXISTS "contained_presentation_id" UUID,
    ADD COLUMN IF NOT EXISTS "quantity_contained" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS "purchase_enabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "sale_enabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "is_default_purchase" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "is_default_sale" BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing presentations: quantity_contained = conversion_factor, is_default_sale = is_default
UPDATE "product_presentations"
SET "quantity_contained" = "conversion_factor",
    "is_default_sale" = "is_default"
WHERE "quantity_contained" = 1 AND "conversion_factor" > 1;

-- Add foreign key constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_presentations_unit_of_measure_id_fkey'
    ) THEN
        ALTER TABLE "product_presentations"
            ADD CONSTRAINT "product_presentations_unit_of_measure_id_fkey"
            FOREIGN KEY ("unit_of_measure_id") REFERENCES "units_of_measure"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'product_presentations_contained_presentation_id_fkey'
    ) THEN
        ALTER TABLE "product_presentations"
            ADD CONSTRAINT "product_presentations_contained_presentation_id_fkey"
            FOREIGN KEY ("contained_presentation_id") REFERENCES "product_presentations"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS "product_presentations_unit_of_measure_id_idx" ON "product_presentations"("unit_of_measure_id");
CREATE INDEX IF NOT EXISTS "product_presentations_contained_presentation_id_idx" ON "product_presentations"("contained_presentation_id");

-- AlterTable purchase_lines: Add historical presentation factor
ALTER TABLE "purchase_lines"
    ADD COLUMN IF NOT EXISTS "presentation_factor_historical" INTEGER NOT NULL DEFAULT 1;

-- Backfill purchase_lines historical factor
UPDATE "purchase_lines"
SET "presentation_factor_historical" = CASE
    WHEN "quantity_commercial" > 0 THEN ROUND("quantity_base_units" / "quantity_commercial")
    ELSE 1
END
WHERE "presentation_factor_historical" = 1 AND "quantity_commercial" > 0 AND "quantity_base_units" != "quantity_commercial";
