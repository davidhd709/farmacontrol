-- Recibos de caja (RC) y comprobantes de egreso (CE) (acuerdo del 4 de octubre de 2026):
-- todo ingreso de dinero a caja o banco tiene su recibo de caja y toda salida su
-- comprobante de egreso, con consecutivo propio y vínculo al movimiento del auxiliar.
-- Se generan en la misma transacción que el movimiento (triggers), así ningún flujo
-- presente o futuro puede mover dinero sin documento. Ver docs/adr/ADR-002.
CREATE TABLE "treasury_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_type" VARCHAR(30) NOT NULL,
    "document_number" VARCHAR(20) NOT NULL,
    "document_date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "payment_method" VARCHAR(50) NOT NULL,
    "concept" VARCHAR(255) NOT NULL,
    "reference_document_type" VARCHAR(50),
    "reference_document_id" VARCHAR(100),
    "cash_movement_id" UUID,
    "bank_movement_id" UUID,
    "bank_account_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treasury_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "treasury_documents_type_check"
      CHECK ("document_type" IN ('RECIBO_CAJA', 'COMPROBANTE_EGRESO')),
    CONSTRAINT "treasury_documents_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "treasury_documents_one_source"
      CHECK (("cash_movement_id" IS NULL) <> ("bank_movement_id" IS NULL))
);

CREATE UNIQUE INDEX "treasury_documents_document_number_key" ON "treasury_documents"("document_number");
CREATE UNIQUE INDEX "treasury_documents_cash_movement_id_key" ON "treasury_documents"("cash_movement_id");
CREATE UNIQUE INDEX "treasury_documents_bank_movement_id_key" ON "treasury_documents"("bank_movement_id");
CREATE INDEX "treasury_documents_type_date_idx" ON "treasury_documents"("document_type", "document_date");
CREATE INDEX "treasury_documents_reference_idx" ON "treasury_documents"("reference_document_type", "reference_document_id");

ALTER TABLE "treasury_documents" ADD CONSTRAINT "treasury_documents_cash_movement_id_fkey"
  FOREIGN KEY ("cash_movement_id") REFERENCES "cash_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "treasury_documents" ADD CONSTRAINT "treasury_documents_bank_movement_id_fkey"
  FOREIGN KEY ("bank_movement_id") REFERENCES "bank_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "treasury_documents" ADD CONSTRAINT "treasury_documents_bank_account_id_fkey"
  FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "treasury_documents" ADD CONSTRAINT "treasury_documents_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Consecutivo sin saltos por tipo. Una fila por tipo con bloqueo de fila: en READ COMMITTED
-- la segunda transacción espera y toma el siguiente número; en SERIALIZABLE recibe un
-- conflicto de serialización que los flujos de dinero ya reintentan. Nunca hay números
-- repetidos y, si la transacción se revierte, el número no se consume.
CREATE TABLE "treasury_document_sequences" (
    "document_type" VARCHAR(30) NOT NULL,
    "last_value" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "treasury_document_sequences_pkey" PRIMARY KEY ("document_type")
);
INSERT INTO "treasury_document_sequences" ("document_type") VALUES ('RECIBO_CAJA'), ('COMPROBANTE_EGRESO');

CREATE OR REPLACE FUNCTION next_treasury_document_number(doc_type text)
RETURNS text AS $$
DECLARE
  next_value bigint;
BEGIN
  UPDATE "treasury_document_sequences"
  SET "last_value" = "last_value" + 1
  WHERE "document_type" = doc_type
  RETURNING "last_value" INTO next_value;
  IF next_value IS NULL THEN
    RAISE EXCEPTION 'Tipo de documento de tesorería desconocido: %', doc_type;
  END IF;
  RETURN CASE WHEN doc_type = 'RECIBO_CAJA' THEN 'RC-' ELSE 'CE-' END || lpad(next_value::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_treasury_document_for_cash()
RETURNS TRIGGER AS $$
DECLARE
  doc_type text;
BEGIN
  IF NEW."amount" <= 0 THEN
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

CREATE OR REPLACE FUNCTION create_treasury_document_for_bank()
RETURNS TRIGGER AS $$
DECLARE
  doc_type text;
BEGIN
  -- El saldo de apertura de una cuenta no es un ingreso de dinero
  IF NEW."amount" <= 0 OR NEW."reference_document_type" = 'INITIAL_BALANCE' THEN
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

-- Documentos de los movimientos ya registrados, en orden cronológico
DO $$
DECLARE
  movement record;
  doc_type text;
BEGIN
  FOR movement IN
    SELECT 'cash' AS source, c."id", c."movement_type", c."amount", c."payment_method", c."reason" AS concept,
           c."reference_document_type", c."reference_document_id", NULL::uuid AS bank_account_id,
           c."created_by_user_id" AS created_by_id, c."created_at", c."created_at" AS moved_at
    FROM "cash_movements" c WHERE c."amount" > 0
    UNION ALL
    SELECT 'bank', b."id", b."movement_type", b."amount", 'TRANSFERENCIA', b."concept",
           b."reference_document_type", b."reference_document_id", b."bank_account_id",
           b."created_by_id", b."created_at", b."movement_date"
    FROM "bank_movements" b
    WHERE b."amount" > 0 AND b."reference_document_type" IS DISTINCT FROM 'INITIAL_BALANCE'
    ORDER BY created_at, id
  LOOP
    IF movement.source = 'cash' THEN
      doc_type := CASE WHEN movement.movement_type LIKE 'INGRESO%' OR movement.movement_type IN ('VENTA', 'APERTURA')
                       THEN 'RECIBO_CAJA' ELSE 'COMPROBANTE_EGRESO' END;
    ELSE
      doc_type := CASE WHEN movement.movement_type IN ('WITHDRAWAL', 'TRANSFER_OUT', 'FEE')
                       THEN 'COMPROBANTE_EGRESO' ELSE 'RECIBO_CAJA' END;
    END IF;
    INSERT INTO "treasury_documents" (
      "document_type", "document_number", "document_date", "amount", "payment_method", "concept",
      "reference_document_type", "reference_document_id", "cash_movement_id", "bank_movement_id",
      "bank_account_id", "created_by_id", "created_at"
    ) VALUES (
      doc_type, next_treasury_document_number(doc_type),
      (movement.moved_at AT TIME ZONE 'America/Bogota')::date,
      movement.amount, movement.payment_method, movement.concept,
      movement.reference_document_type, movement.reference_document_id,
      CASE WHEN movement.source = 'cash' THEN movement.id END,
      CASE WHEN movement.source = 'bank' THEN movement.id END,
      movement.bank_account_id, movement.created_by_id, movement.created_at
    );
  END LOOP;
END $$;

CREATE TRIGGER cash_movements_treasury_document_trg
AFTER INSERT ON "cash_movements"
FOR EACH ROW EXECUTE FUNCTION create_treasury_document_for_cash();

CREATE TRIGGER bank_movements_treasury_document_trg
AFTER INSERT ON "bank_movements"
FOR EACH ROW EXECUTE FUNCTION create_treasury_document_for_bank();

-- Documentos emitidos: inmutables, como los movimientos que respaldan
CREATE TRIGGER treasury_documents_immutable_trg
BEFORE UPDATE OR DELETE ON "treasury_documents"
FOR EACH ROW EXECUTE FUNCTION prevent_movement_modification();
