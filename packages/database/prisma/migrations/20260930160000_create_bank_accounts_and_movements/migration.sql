-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL,
    "bank_name" VARCHAR(100) NOT NULL,
    "account_type" VARCHAR(50) NOT NULL,
    "account_number" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "initial_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "current_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'COP',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" VARCHAR(500),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_movements" (
    "id" UUID NOT NULL,
    "bank_account_id" UUID NOT NULL,
    "movement_type" VARCHAR(50) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balance_before" DECIMAL(14,2) NOT NULL,
    "balance_after" DECIMAL(14,2) NOT NULL,
    "concept" VARCHAR(255) NOT NULL,
    "reference_document_type" VARCHAR(50),
    "reference_document_id" VARCHAR(100),
    "external_reference" VARCHAR(100),
    "movement_date" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_bank_name_account_number_key" ON "bank_accounts"("bank_name", "account_number");

-- CreateIndex
CREATE INDEX "bank_accounts_is_active_idx" ON "bank_accounts"("is_active");

-- CreateIndex
CREATE INDEX "bank_accounts_bank_name_idx" ON "bank_accounts"("bank_name");

-- CreateIndex
CREATE INDEX "bank_accounts_created_by_id_idx" ON "bank_accounts"("created_by_id");

-- CreateIndex
CREATE INDEX "bank_movements_bank_account_id_movement_date_idx" ON "bank_movements"("bank_account_id", "movement_date");

-- CreateIndex
CREATE INDEX "bank_movements_movement_type_idx" ON "bank_movements"("movement_type");

-- CreateIndex
CREATE INDEX "bank_movements_reference_document_type_reference_document_i_idx" ON "bank_movements"("reference_document_type", "reference_document_id");

-- CreateIndex
CREATE INDEX "bank_movements_created_by_id_idx" ON "bank_movements"("created_by_id");

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_movements" ADD CONSTRAINT "bank_movements_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_movements" ADD CONSTRAINT "bank_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
