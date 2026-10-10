-- Bloqueo de documentos por fecha (acuerdo del 4 de octubre de 2026): una vez revisado un
-- corte, no se registran ni reversan asientos con fecha igual o anterior a locked_through.
-- Es distinto del cierre de período. Cada cambio es una fila nueva: el bloqueo vigente es
-- la última, y NULL significa sin bloqueo.
CREATE TABLE "document_locks" (
    "id" UUID NOT NULL,
    "locked_through" DATE,
    "reason" VARCHAR(500) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_locks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "document_locks_reason_not_blank" CHECK (btrim("reason") <> '')
);

CREATE INDEX "document_locks_created_at_idx" ON "document_locks"("created_at");
CREATE INDEX "document_locks_created_by_id_idx" ON "document_locks"("created_by_id");

ALTER TABLE "document_locks" ADD CONSTRAINT "document_locks_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Historial inmutable, igual que kardex y caja
CREATE TRIGGER document_locks_immutable_trg
BEFORE UPDATE OR DELETE ON "document_locks"
FOR EACH ROW EXECUTE FUNCTION prevent_movement_modification();
