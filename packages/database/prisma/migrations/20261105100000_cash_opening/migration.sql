-- FARM-TEST-001: vínculo inmutable entre una apertura contable y su saldo operativo.
-- No modifica saldos, movimientos ni asientos históricos. No inicializa ninguna caja.
CREATE TABLE "cash_openings" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "journal_entry_id" UUID NOT NULL,
    "cash_movement_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "effective_date" DATE NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cash_openings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cash_openings_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "cash_openings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "cash_openings_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "cash_openings_cash_movement_id_fkey" FOREIGN KEY ("cash_movement_id") REFERENCES "cash_movements"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "cash_openings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT "cash_openings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "cash_openings_journal_entry_id_key" ON "cash_openings"("journal_entry_id");
CREATE UNIQUE INDEX "cash_openings_cash_movement_id_key" ON "cash_openings"("cash_movement_id");
CREATE INDEX "cash_openings_company_id_idx" ON "cash_openings"("company_id");
CREATE INDEX "cash_openings_account_id_idx" ON "cash_openings"("account_id");
CREATE INDEX "cash_openings_created_by_id_idx" ON "cash_openings"("created_by_id");

-- La referencia es una identidad durable, independiente del TTL de claves HTTP.
CREATE UNIQUE INDEX "cash_movements_opening_source_key"
ON "cash_movements"("reference_document_id") WHERE "movement_type" = 'SALDO_APERTURA';
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_opening_reference_check"
CHECK ("movement_type" <> 'SALDO_APERTURA' OR (
    "reference_document_type" IS NOT DISTINCT FROM 'OPENING_BALANCE'
    AND NULLIF(btrim("reference_document_id"), '') IS NOT NULL
    AND "payment_method" = 'EFECTIVO'
));

CREATE TRIGGER cash_openings_immutable_trg
BEFORE UPDATE OR DELETE ON "cash_openings"
FOR EACH ROW EXECUTE FUNCTION prevent_movement_modification();

CREATE FUNCTION validate_cash_opening() RETURNS trigger AS $$
DECLARE
    entry_row journal_entries%ROWTYPE;
    movement_row cash_movements%ROWTYPE;
    mapped_account UUID;
    mapping_count INTEGER;
    cash_net NUMERIC;
BEGIN
    -- ADR-006: una empresa por base hasta F9. Nunca atribuir históricos ambiguos.
    IF (SELECT count(*) FROM companies) <> 1 OR NOT EXISTS (
        SELECT 1 FROM companies WHERE id = NEW.company_id AND status = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'La apertura de caja requiere una única empresa activa y sin otras empresas en la base.' USING ERRCODE = '23514';
    END IF;

    SELECT * INTO entry_row FROM journal_entries WHERE id = NEW.journal_entry_id;
    IF NOT FOUND OR entry_row.source_type <> 'OPENING_BALANCE'
        OR entry_row.status <> 'POSTED' OR entry_row.reversal_of_id IS NOT NULL
        OR entry_row.entry_date <> NEW.effective_date
        OR EXISTS (SELECT 1 FROM journal_entries WHERE reversal_of_id = NEW.journal_entry_id)
    THEN
        RAISE EXCEPTION 'La incorporación de caja requiere un asiento de apertura vigente y su fecha efectiva.' USING ERRCODE = '23514';
    END IF;

    SELECT count(*) INTO mapping_count FROM company_accounting_mappings m
    JOIN accounts a ON a.id = m.account_id
    WHERE m.purpose = 'CASH' AND m.status = 'ACTIVE'
      AND m.effective_from <= NEW.effective_date
      AND (m.effective_to IS NULL OR m.effective_to >= NEW.effective_date)
      AND a.is_active AND a.allows_movement;
    SELECT m.account_id INTO mapped_account FROM company_accounting_mappings m
    JOIN accounts a ON a.id = m.account_id
    WHERE m.purpose = 'CASH' AND m.status = 'ACTIVE'
      AND m.effective_from <= NEW.effective_date
      AND (m.effective_to IS NULL OR m.effective_to >= NEW.effective_date)
      AND a.is_active AND a.allows_movement
    LIMIT 1;
    IF mapping_count <> 1 OR mapped_account IS DISTINCT FROM NEW.account_id THEN
        RAISE EXCEPTION 'La cuenta de apertura no coincide con el único mapeo CASH vigente.' USING ERRCODE = '23514';
    END IF;
    SELECT COALESCE(sum(debit - credit), 0) INTO cash_net FROM journal_entry_lines
    WHERE journal_entry_id = NEW.journal_entry_id AND account_id = NEW.account_id;
    IF cash_net <> NEW.amount THEN
        RAISE EXCEPTION 'El efectivo incorporado no coincide con el neto contable de apertura.' USING ERRCODE = '23514';
    END IF;

    SELECT * INTO movement_row FROM cash_movements WHERE id = NEW.cash_movement_id;
    IF NOT FOUND OR movement_row.movement_type <> 'SALDO_APERTURA'
        OR movement_row.payment_method <> 'EFECTIVO'
        OR movement_row.reference_document_type IS DISTINCT FROM 'OPENING_BALANCE'
        OR movement_row.reference_document_id IS DISTINCT FROM NEW.journal_entry_id::text
        OR movement_row.amount <> NEW.amount OR movement_row.balance_after <> NEW.amount
        OR movement_row.created_by_user_id <> NEW.created_by_id
    THEN
        RAISE EXCEPTION 'El movimiento operativo no corresponde a la apertura contable.' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM cash_movements WHERE id <> NEW.cash_movement_id) THEN
        RAISE EXCEPTION 'No se puede incorporar una apertura de caja con movimientos previos.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER cash_openings_validate_trg BEFORE INSERT ON "cash_openings"
FOR EACH ROW EXECUTE FUNCTION validate_cash_opening();

-- Un movimiento de apertura no puede confirmarse sin el vínculo validado.
CREATE FUNCTION validate_cash_opening_movement_at_commit() RETURNS trigger AS $$
BEGIN
    IF NEW.movement_type = 'SALDO_APERTURA' AND NOT EXISTS (
        SELECT 1 FROM cash_openings WHERE cash_movement_id = NEW.id
    ) THEN
        RAISE EXCEPTION 'El movimiento de apertura requiere su vínculo contable inmutable.' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER cash_opening_movement_at_commit_trg
AFTER INSERT ON "cash_movements" DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_cash_opening_movement_at_commit();

-- Hasta existir una corrección operativa explícita, no anular solo el mayor.
CREATE FUNCTION guard_cash_opening_reversal() RETURNS trigger AS $$
BEGIN
    IF NEW.reversal_of_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM cash_openings WHERE journal_entry_id = NEW.reversal_of_id
    ) THEN
        RAISE EXCEPTION 'La apertura tiene saldo operativo de caja: requiere un procedimiento específico de corrección.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER journal_entries_cash_opening_reversal_trg BEFORE INSERT ON "journal_entries"
FOR EACH ROW EXECUTE FUNCTION guard_cash_opening_reversal();

CREATE OR REPLACE FUNCTION create_treasury_document_for_cash() RETURNS trigger AS $$
DECLARE
  doc_type text;
BEGIN
  -- La apertura es incorporación al auxiliar, no un recibo ni un egreso.
  IF NEW."movement_type" = 'SALDO_APERTURA' THEN
    RETURN NEW;
  END IF;
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
