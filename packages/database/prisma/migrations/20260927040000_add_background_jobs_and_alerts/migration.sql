-- CreateTable
CREATE TABLE "inventory_alerts" (
    "id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "alert_type" VARCHAR(50) NOT NULL DEFAULT 'EXPIRATION',
    "severity" VARCHAR(20) NOT NULL,
    "days_remaining" INTEGER NOT NULL,
    "current_quantity" INTEGER NOT NULL,
    "is_resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMPTZ,
    "last_evaluated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "inventory_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "background_jobs" (
    "id" UUID NOT NULL,
    "job_type" VARCHAR(50) NOT NULL,
    "payload" JSONB,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "last_error" TEXT,
    "scheduled_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_alerts_lot_id_alert_type_key" ON "inventory_alerts"("lot_id", "alert_type");

-- CreateIndex
CREATE INDEX "inventory_alerts_product_id_idx" ON "inventory_alerts"("product_id");

-- CreateIndex
CREATE INDEX "inventory_alerts_severity_idx" ON "inventory_alerts"("severity");

-- CreateIndex
CREATE INDEX "inventory_alerts_is_resolved_idx" ON "inventory_alerts"("is_resolved");

-- CreateIndex
CREATE INDEX "inventory_alerts_days_remaining_idx" ON "inventory_alerts"("days_remaining");

-- CreateIndex
CREATE INDEX "inventory_alerts_last_evaluated_at_idx" ON "inventory_alerts"("last_evaluated_at");

-- CreateIndex
CREATE INDEX "background_jobs_status_scheduled_at_idx" ON "background_jobs"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "background_jobs_job_type_idx" ON "background_jobs"("job_type");

-- CreateIndex
CREATE INDEX "background_jobs_created_at_idx" ON "background_jobs"("created_at");

-- AddForeignKey
ALTER TABLE "inventory_alerts" ADD CONSTRAINT "inventory_alerts_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_alerts" ADD CONSTRAINT "inventory_alerts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
