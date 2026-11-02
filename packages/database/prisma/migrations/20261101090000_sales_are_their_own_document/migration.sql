-- Correcciones del cliente (2026-11-01), fase 1: una venta generaba dos comprobantes, el de
-- venta y un recibo de caja por el mismo dinero (y un comprobante de egreso al anularla).
-- La venta es su propio documento: los movimientos con origen SALE o SALE_CANCEL ya no emiten
-- RC/CE. Los documentos ya emitidos se conservan (son inmutables). Ver docs/adr/ADR-007.

CREATE OR REPLACE FUNCTION create_treasury_document_for_cash()
RETURNS TRIGGER AS $$
DECLARE
  doc_type text;
BEGIN
  IF NEW."amount" <= 0 OR NEW."reference_document_type" IN ('SALE', 'SALE_CANCEL') THEN
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
  -- El saldo de apertura de una cuenta no es un ingreso de dinero; la venta es su propio documento
  IF NEW."amount" <= 0
     OR NEW."reference_document_type" IN ('INITIAL_BALANCE', 'SALE', 'SALE_CANCEL') THEN
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
