-- AlterTable
ALTER TABLE "cash_movements" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "customers" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "idempotency_keys" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "purchase_lines" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "purchases" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sale_lines" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sale_lot_allocations" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sales" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "suppliers" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "receivables" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(12,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    "due_date" DATE NOT NULL,
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "receivables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receivable_payments" (
    "id" UUID NOT NULL,
    "receivable_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_method" VARCHAR(50) NOT NULL DEFAULT 'EFECTIVO',
    "notes" VARCHAR(500),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receivable_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payables" (
    "id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(12,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    "due_date" DATE NOT NULL,
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payable_payments" (
    "id" UUID NOT NULL,
    "payable_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_method" VARCHAR(50) NOT NULL DEFAULT 'EFECTIVO',
    "notes" VARCHAR(500),
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payable_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "receivables_sale_id_key" ON "receivables"("sale_id");

-- CreateIndex
CREATE INDEX "receivables_customer_id_idx" ON "receivables"("customer_id");

-- CreateIndex
CREATE INDEX "receivables_status_idx" ON "receivables"("status");

-- CreateIndex
CREATE INDEX "receivables_due_date_idx" ON "receivables"("due_date");

-- CreateIndex
CREATE INDEX "receivable_payments_receivable_id_idx" ON "receivable_payments"("receivable_id");

-- CreateIndex
CREATE INDEX "receivable_payments_created_at_idx" ON "receivable_payments"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payables_purchase_id_key" ON "payables"("purchase_id");

-- CreateIndex
CREATE INDEX "payables_supplier_id_idx" ON "payables"("supplier_id");

-- CreateIndex
CREATE INDEX "payables_status_idx" ON "payables"("status");

-- CreateIndex
CREATE INDEX "payables_due_date_idx" ON "payables"("due_date");

-- CreateIndex
CREATE INDEX "payable_payments_payable_id_idx" ON "payable_payments"("payable_id");

-- CreateIndex
CREATE INDEX "payable_payments_created_at_idx" ON "payable_payments"("created_at");

-- CreateIndex
CREATE INDEX "product_presentations_barcode_idx" ON "product_presentations"("barcode");

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_receivable_id_fkey" FOREIGN KEY ("receivable_id") REFERENCES "receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payables" ADD CONSTRAINT "payables_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_payments" ADD CONSTRAINT "payable_payments_payable_id_fkey" FOREIGN KEY ("payable_id") REFERENCES "payables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_payments" ADD CONSTRAINT "payable_payments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "inventory_movements_reference_document_type_reference_docume_id" RENAME TO "inventory_movements_reference_document_type_reference_docum_idx";
