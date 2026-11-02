-- Correcciones del cliente (2026-11-02): las correcciones se hacen anulando el documento de
-- origen, no reversando asientos desde el Libro Diario. Faltaban las anulaciones de la nota
-- crédito y de los recibos de caja y comprobantes de egreso. Solo agrega columnas y ajusta
-- reglas: no modifica datos existentes (todo queda CONFIRMADA / VIGENTE).

-- Nota crédito: estado y datos de anulación
ALTER TABLE "credit_notes"
    ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'CONFIRMADA',
    ADD COLUMN "cancelled_at" TIMESTAMPTZ,
    ADD COLUMN "cancelled_by_id" UUID,
    ADD COLUMN "cancellation_reason" VARCHAR(500),
    ADD CONSTRAINT "credit_notes_status_check" CHECK ("status" IN ('CONFIRMADA', 'ANULADA')),
    ADD CONSTRAINT "credit_notes_cancellation_check" CHECK (
        ("status" = 'CONFIRMADA' AND "cancelled_at" IS NULL AND "cancelled_by_id" IS NULL AND "cancellation_reason" IS NULL)
        OR ("status" = 'ANULADA' AND "cancelled_at" IS NOT NULL AND "cancelled_by_id" IS NOT NULL AND "cancellation_reason" IS NOT NULL)
    ),
    ADD CONSTRAINT "credit_notes_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id")
        REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Documentos de tesorería: estado y datos de anulación
ALTER TABLE "treasury_documents"
    ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'VIGENTE',
    ADD COLUMN "cancelled_at" TIMESTAMPTZ,
    ADD COLUMN "cancelled_by_id" UUID,
    ADD COLUMN "cancellation_reason" VARCHAR(500),
    ADD CONSTRAINT "treasury_documents_status_check" CHECK ("status" IN ('VIGENTE', 'ANULADO')),
    ADD CONSTRAINT "treasury_documents_cancellation_check" CHECK (
        ("status" = 'VIGENTE' AND "cancelled_at" IS NULL AND "cancelled_by_id" IS NULL AND "cancellation_reason" IS NULL)
        OR ("status" = 'ANULADO' AND "cancelled_at" IS NOT NULL AND "cancelled_by_id" IS NOT NULL AND "cancellation_reason" IS NOT NULL)
    ),
    ADD CONSTRAINT "treasury_documents_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id")
        REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un documento de tesorería sigue siendo inmutable: la única modificación posible es anularlo
-- una vez (VIGENTE → ANULADO con fecha, usuario y motivo). Nunca se borra.
CREATE OR REPLACE FUNCTION guard_treasury_document_update() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'treasury_documents es un registro inmutable: los documentos no se borran; se anulan.'
            USING ERRCODE = '23514';
    END IF;
    IF OLD."status" = 'VIGENTE' AND NEW."status" = 'ANULADO'
        AND (to_jsonb(NEW) - ARRAY['status', 'cancelled_at', 'cancelled_by_id', 'cancellation_reason'])
            = (to_jsonb(OLD) - ARRAY['status', 'cancelled_at', 'cancelled_by_id', 'cancellation_reason'])
    THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'treasury_documents es un registro inmutable: solo se permite anular un documento vigente.'
        USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER "treasury_documents_immutable_trg" ON "treasury_documents";
CREATE TRIGGER "treasury_documents_immutable_trg"
BEFORE DELETE OR UPDATE ON "treasury_documents"
FOR EACH ROW EXECUTE FUNCTION guard_treasury_document_update();

-- El movimiento contrario de una anulación pertenece al documento anulado: no genera otro
CREATE OR REPLACE FUNCTION create_treasury_document_for_cash() RETURNS trigger AS $$
DECLARE
  doc_type text;
BEGIN
  IF NEW."amount" <= 0
     OR NEW."reference_document_type" IN ('SALE', 'SALE_CANCEL', 'TREASURY_DOCUMENT', 'TREASURY_DOCUMENT_CANCEL') THEN
    RETURN NEW;
  END IF;
  -- INGRESO_* (y nombres antiguos) entran a caja; todo lo demás sale
  IF NEW."movement_type" LIKE 'INGRESO%' OR NEW."movement_type" IN ('VENTA', 'APERTURA') THEN
    doc_type := 'RECIBO_CAJA';
  ELSE
    doc_type := 'COMPROBANTE_EGRESO';
  END IF;
  INSERT INTO "treasury_documents" (
    "document_type", "document_number", "document_date", "amount", "payment_method", "concept",
    "reference_document_type", "reference_document_id", "cash_movement_id", "created_by_id", "created_at"
  ) VALUES (
    doc_type, next_treasury_document_number(doc_type),
    (NEW."created_at" AT TIME ZONE 'America/Bogota')::date,
    NEW."amount", NEW."payment_method", NEW."reason",
    NEW."reference_document_type", NEW."reference_document_id", NEW."id", NEW."created_by_user_id", NEW."created_at"
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_treasury_document_for_bank() RETURNS trigger AS $$
DECLARE
  doc_type text;
BEGIN
  IF NEW."amount" <= 0
     OR NEW."reference_document_type" IN ('INITIAL_BALANCE', 'SALE', 'SALE_CANCEL', 'TREASURY_DOCUMENT', 'TREASURY_DOCUMENT_CANCEL') THEN
    RETURN NEW;
  END IF;
  IF NEW."movement_type" IN ('WITHDRAWAL', 'TRANSFER_OUT', 'FEE') THEN
    doc_type := 'COMPROBANTE_EGRESO';
  ELSE
    doc_type := 'RECIBO_CAJA';
  END IF;
  INSERT INTO "treasury_documents" (
    "document_type", "document_number", "document_date", "amount", "payment_method", "concept",
    "reference_document_type", "reference_document_id", "bank_movement_id", "bank_account_id",
    "created_by_id", "created_at"
  ) VALUES (
    doc_type, next_treasury_document_number(doc_type),
    (NEW."movement_date" AT TIME ZONE 'America/Bogota')::date,
    NEW."amount", 'TRANSFERENCIA', NEW."concept",
    NEW."reference_document_type", NEW."reference_document_id", NEW."id", NEW."bank_account_id",
    NEW."created_by_id", NEW."created_at"
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Submayor de inventario: salida por anulación de una devolución de cliente
ALTER TABLE "inventory_valuation_movements" DROP CONSTRAINT "inventory_valuation_movements_type_check";
ALTER TABLE "inventory_valuation_movements" ADD CONSTRAINT "inventory_valuation_movements_type_check"
    CHECK ("movement_type" IN (
        'OPENING', 'PURCHASE', 'SALE', 'SALE_CANCELLATION', 'SALE_RETURN', 'SALE_RETURN_CANCELLATION',
        'PURCHASE_RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'
    ));
