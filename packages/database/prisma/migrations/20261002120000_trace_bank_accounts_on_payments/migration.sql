-- Existing sales and payments remain unassigned: their historical bank account is unknown.
ALTER TABLE "sales" ADD COLUMN "bank_account_id" UUID;
ALTER TABLE "receivable_payments" ADD COLUMN "bank_account_id" UUID;
ALTER TABLE "payable_payments" ADD COLUMN "bank_account_id" UUID;

CREATE INDEX "sales_bank_account_id_idx" ON "sales"("bank_account_id");
CREATE INDEX "receivable_payments_bank_account_id_idx" ON "receivable_payments"("bank_account_id");
CREATE INDEX "payable_payments_bank_account_id_idx" ON "payable_payments"("bank_account_id");

ALTER TABLE "sales" ADD CONSTRAINT "sales_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payable_payments" ADD CONSTRAINT "payable_payments_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
