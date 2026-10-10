-- Cada cuenta bancaria se crea a partir de su subcuenta del PUC (acuerdo del 4 de octubre
-- de 2026): los asientos de sus movimientos usan esa subcuenta en lugar del propósito
-- genérico BANK. Nullable para las cuentas existentes, que se vinculan al editarlas.
ALTER TABLE "bank_accounts" ADD COLUMN "ledger_account_id" UUID;

CREATE UNIQUE INDEX "bank_accounts_ledger_account_id_key" ON "bank_accounts"("ledger_account_id");

ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_ledger_account_id_fkey"
  FOREIGN KEY ("ledger_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
