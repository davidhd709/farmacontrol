-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity" VARCHAR(100) NOT NULL,
    "entity_id" VARCHAR(255),
    "details" JSONB,
    "ip_address" VARCHAR(45),
    "correlation_id" VARCHAR(100),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_events_user_id_idx" ON "audit_events"("user_id");

-- CreateIndex
CREATE INDEX "audit_events_action_idx" ON "audit_events"("action");

-- CreateIndex
CREATE INDEX "audit_events_entity_entity_id_idx" ON "audit_events"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at");

-- CreateIndex
CREATE INDEX "audit_events_correlation_id_idx" ON "audit_events"("correlation_id");

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Immutability Protection: Append-only enforcement on audit_events
CREATE OR REPLACE FUNCTION prevent_audit_events_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_events is an immutable append-only table. Modifying or deleting audit records is forbidden.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_immutable_trg
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_events_modification();
