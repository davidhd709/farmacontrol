-- Correcciones del cliente (2026-11-01), fase 3: el recibo de caja y el comprobante de egreso
-- son el documento de origen de todo ingreso o egreso manual de dinero (ADR-007). El servicio
-- de tesorería crea el documento, su único movimiento de caja o banco y los abonos o pagos de
-- las facturas que aplica; caja y bancos quedan como consulta.

-- 1. Datos propios del documento. Los documentos ya emitidos quedan AUTOMATICO, sin tercero
--    guardado: su tercero se sigue resolviendo desde el origen al consultarlos.
ALTER TABLE "treasury_documents"
  ADD COLUMN "origin" VARCHAR(20) NOT NULL DEFAULT 'AUTOMATICO',
  ADD COLUMN "customer_id" UUID,
  ADD COLUMN "supplier_id" UUID,
  ADD COLUMN "third_party_id" UUID,
  ADD COLUMN "counterpart_account_id" UUID;

ALTER TABLE "treasury_documents" ADD CONSTRAINT "treasury_documents_origin_check"
  CHECK ("origin" IN ('AUTOMATICO', 'MANUAL', 'CARTERA', 'PROVEEDOR'));
-- Un abono a cartera tiene cliente; un pago a proveedor, proveedor; uno manual, contrapartida
ALTER TABLE "treasury_documents" ADD CONSTRAINT "treasury_documents_origin_parties_check"
  CHECK (
    ("origin" <> 'CARTERA' OR "customer_id" IS NOT NULL)
    AND ("origin" <> 'PROVEEDOR' OR "supplier_id" IS NOT NULL)
    AND ("origin" <> 'MANUAL' OR "counterpart_account_id" IS NOT NULL)
  );

ALTER TABLE "treasury_documents" ADD CONSTRAINT "treasury_documents_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "treasury_documents" ADD CONSTRAINT "treasury_documents_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "treasury_documents" ADD CONSTRAINT "treasury_documents_third_party_id_fkey"
  FOREIGN KEY ("third_party_id") REFERENCES "third_parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "treasury_documents" ADD CONSTRAINT "treasury_documents_counterpart_account_id_fkey"
  FOREIGN KEY ("counterpart_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "treasury_documents_customer_id_idx" ON "treasury_documents"("customer_id");
CREATE INDEX "treasury_documents_supplier_id_idx" ON "treasury_documents"("supplier_id");

-- 2. Cada abono o pago de factura queda vinculado al recibo o egreso que lo respalda
ALTER TABLE "receivable_payments" ADD COLUMN "treasury_document_id" UUID;
ALTER TABLE "payable_payments" ADD COLUMN "treasury_document_id" UUID;
ALTER TABLE "expense_payments" ADD COLUMN "treasury_document_id" UUID;

ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_treasury_document_id_fkey"
  FOREIGN KEY ("treasury_document_id") REFERENCES "treasury_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payable_payments" ADD CONSTRAINT "payable_payments_treasury_document_id_fkey"
  FOREIGN KEY ("treasury_document_id") REFERENCES "treasury_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_treasury_document_id_fkey"
  FOREIGN KEY ("treasury_document_id") REFERENCES "treasury_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "receivable_payments_treasury_document_id_idx" ON "receivable_payments"("treasury_document_id");
CREATE INDEX "payable_payments_treasury_document_id_idx" ON "payable_payments"("treasury_document_id");
CREATE INDEX "expense_payments_treasury_document_id_idx" ON "expense_payments"("treasury_document_id");

-- 3. Vínculo de los pagos históricos con el documento que generó su movimiento (ADR-002).
--    Banco: el movimiento referencia el pago. Caja de cartera y proveedores: el movimiento
--    referencia la cuenta y se creó en la misma transacción que el pago (mismo instante y valor).
UPDATE "receivable_payments" p SET "treasury_document_id" = d."id"
FROM "treasury_documents" d
JOIN "bank_movements" b ON b."id" = d."bank_movement_id"
WHERE b."reference_document_type" = 'RECEIVABLE_PAYMENT' AND b."reference_document_id" = p."id"::text;

UPDATE "receivable_payments" p SET "treasury_document_id" = d."id"
FROM "treasury_documents" d
JOIN "cash_movements" c ON c."id" = d."cash_movement_id"
WHERE c."reference_document_type" = 'RECEIVABLE'
  AND c."reference_document_id" = p."receivable_id"::text
  AND c."movement_type" = 'INGRESO_MANUAL'
  AND c."amount" = p."amount"
  AND c."created_at" = p."created_at"
  AND p."treasury_document_id" IS NULL;

UPDATE "payable_payments" p SET "treasury_document_id" = d."id"
FROM "treasury_documents" d
JOIN "bank_movements" b ON b."id" = d."bank_movement_id"
WHERE b."reference_document_type" = 'PAYABLE_PAYMENT' AND b."reference_document_id" = p."id"::text;

UPDATE "payable_payments" p SET "treasury_document_id" = d."id"
FROM "treasury_documents" d
JOIN "cash_movements" c ON c."id" = d."cash_movement_id"
WHERE c."reference_document_type" = 'PAYABLE'
  AND c."reference_document_id" = p."payable_id"::text
  AND c."movement_type" = 'EGRESO_PAGO_PROVEEDOR'
  AND c."amount" = p."amount"
  AND c."created_at" = p."created_at"
  AND p."treasury_document_id" IS NULL;

UPDATE "expense_payments" p SET "treasury_document_id" = d."id"
FROM "treasury_documents" d
LEFT JOIN "cash_movements" c ON c."id" = d."cash_movement_id"
LEFT JOIN "bank_movements" b ON b."id" = d."bank_movement_id"
WHERE COALESCE(c."reference_document_type", b."reference_document_type") = 'EXPENSE_PAYMENT'
  AND COALESCE(c."reference_document_id", b."reference_document_id") = p."id"::text;

-- 4. Proveedor de la causación de gasto, para su estado de cuenta y el comprobante de egreso.
--    Las causaciones existentes se vinculan cuando el beneficiario coincide con el nombre de un
--    único proveedor; las demás quedan sin proveedor (NULL) y siguen visibles por fecha.
ALTER TABLE "expenses" ADD COLUMN "supplier_id" UUID;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "expenses_supplier_id_idx" ON "expenses"("supplier_id");

UPDATE "expenses" e SET "supplier_id" = s."id"
FROM "suppliers" s
WHERE lower(btrim(e."beneficiary")) = lower(btrim(s."name"))
  AND (SELECT count(*) FROM "suppliers" s2 WHERE lower(btrim(s2."name")) = lower(btrim(s."name"))) = 1;

-- 5. El movimiento de un documento creado por el servicio de tesorería ya tiene documento
CREATE OR REPLACE FUNCTION create_treasury_document_for_cash()
RETURNS TRIGGER AS $$
DECLARE
  doc_type text;
BEGIN
  IF NEW."amount" <= 0
     OR NEW."reference_document_type" IN ('SALE', 'SALE_CANCEL', 'TREASURY_DOCUMENT') THEN
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
  IF NEW."amount" <= 0
     OR NEW."reference_document_type" IN ('INITIAL_BALANCE', 'SALE', 'SALE_CANCEL', 'TREASURY_DOCUMENT') THEN
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
