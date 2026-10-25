-- F8 (ADR-006): cobertura contable completa. Propósitos de sobrantes y faltantes de
-- inventario, INC devuelto en notas crédito y retenciones revertidas en notas débito.

ALTER TYPE "AccountingPurpose" ADD VALUE 'INVENTORY_SHRINKAGE';
ALTER TYPE "AccountingPurpose" ADD VALUE 'INVENTORY_SURPLUS';

ALTER TABLE "credit_notes"
    ADD COLUMN "inc_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD CONSTRAINT "credit_notes_inc_total_check" CHECK ("inc_total" >= 0);
ALTER TABLE "credit_note_lines"
    ADD COLUMN "inc_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    ADD COLUMN "inc_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD CONSTRAINT "credit_note_lines_inc_check" CHECK ("inc_rate" >= 0 AND "inc_amount" >= 0);

ALTER TABLE "debit_notes"
    ADD COLUMN "withholding_income" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "withholding_vat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "withholding_ica" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD CONSTRAINT "debit_notes_withholdings_check" CHECK (
        "withholding_income" >= 0 AND "withholding_vat" >= 0 AND "withholding_ica" >= 0
        AND "withholding_income" + "withholding_vat" + "withholding_ica" <= "total"
    );
