-- F6 (ADR-006): catálogo normativo colombiano versionado, perfil tributario de la empresa,
-- clasificación de proveedores y productos, impuestos por línea con su instantánea y los
-- propósitos contables del motor. Sin perfil tributario de la empresa nada cambia: las
-- operaciones existentes siguen sin impuestos, como antes.

ALTER TYPE "AccountingPurpose" ADD VALUE 'SALES_EXEMPT';
ALTER TYPE "AccountingPurpose" ADD VALUE 'INC_PAYABLE';
ALTER TYPE "AccountingPurpose" ADD VALUE 'WITHHOLDING_INCOME_PAYABLE';
ALTER TYPE "AccountingPurpose" ADD VALUE 'WITHHOLDING_VAT_PAYABLE';
ALTER TYPE "AccountingPurpose" ADD VALUE 'WITHHOLDING_ICA_PAYABLE';

-- ---------------------------------------------------------------------------
-- Catálogo normativo: lo mantiene el producto, no cada negocio
-- ---------------------------------------------------------------------------
CREATE TABLE "tax_rules" (
    "id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "tax_type" VARCHAR(16) NOT NULL,
    "treatment" VARCHAR(16),
    "description" VARCHAR(250) NOT NULL,
    "rate_pct" DECIMAL(7,4),
    "rate_min_per_mil" DECIMAL(7,3),
    "rate_max_per_mil" DECIMAL(7,3),
    "min_base_uvt" DECIMAL(10,2),
    "applies_to" VARCHAR(16) NOT NULL DEFAULT 'ANY',
    "payee_condition" VARCHAR(20) NOT NULL DEFAULT 'ANY',
    "legal_reference" VARCHAR(300) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "review_status" VARCHAR(32) NOT NULL DEFAULT 'PENDING_ADVISOR_REVIEW',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tax_rules_type_check"
        CHECK ("tax_type" IN ('IVA', 'INC', 'RETEFUENTE', 'RETEIVA', 'RETEICA')),
    -- El IVA siempre declara su tratamiento; las demás reglas no lo usan
    CONSTRAINT "tax_rules_treatment_check" CHECK (
        ("tax_type" = 'IVA' AND "treatment" IN ('GRAVADO', 'EXENTO', 'EXCLUIDO'))
        OR ("tax_type" <> 'IVA' AND "treatment" IS NULL)
    ),
    CONSTRAINT "tax_rules_rate_check" CHECK (
        ("tax_type" = 'RETEICA' AND "rate_pct" IS NULL
            AND "rate_min_per_mil" IS NOT NULL AND "rate_max_per_mil" >= "rate_min_per_mil"
            AND "rate_min_per_mil" >= 0)
        OR ("tax_type" <> 'RETEICA' AND "rate_pct" IS NOT NULL AND "rate_pct" >= 0 AND "rate_pct" <= 100
            AND "rate_min_per_mil" IS NULL AND "rate_max_per_mil" IS NULL)
    ),
    CONSTRAINT "tax_rules_iva_rate_check" CHECK (
        "tax_type" <> 'IVA' OR ("treatment" = 'GRAVADO') = ("rate_pct" > 0)
    ),
    CONSTRAINT "tax_rules_min_base_check" CHECK ("min_base_uvt" IS NULL OR "min_base_uvt" >= 0),
    CONSTRAINT "tax_rules_applies_to_check" CHECK ("applies_to" IN ('GOODS', 'SERVICES', 'ANY')),
    CONSTRAINT "tax_rules_payee_condition_check"
        CHECK ("payee_condition" IN ('DECLARANT', 'NON_DECLARANT', 'ANY')),
    CONSTRAINT "tax_rules_validity_check" CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
    CONSTRAINT "tax_rules_review_status_check"
        CHECK ("review_status" IN ('PENDING_ADVISOR_REVIEW', 'REVIEWED'))
);
CREATE UNIQUE INDEX "tax_rules_code_effective_from_key" ON "tax_rules"("code", "effective_from");
CREATE INDEX "tax_rules_tax_type_effective_from_idx" ON "tax_rules"("tax_type", "effective_from");

CREATE TABLE "uvt_values" (
    "year" INTEGER NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "legal_reference" VARCHAR(300) NOT NULL,
    "review_status" VARCHAR(32) NOT NULL DEFAULT 'PENDING_ADVISOR_REVIEW',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uvt_values_pkey" PRIMARY KEY ("year"),
    CONSTRAINT "uvt_values_value_check" CHECK ("value" > 0),
    CONSTRAINT "uvt_values_review_status_check"
        CHECK ("review_status" IN ('PENDING_ADVISOR_REVIEW', 'REVIEWED'))
);

-- Un cambio normativo es una versión nueva: el contenido no se edita desde la aplicación
CREATE TRIGGER tax_rules_immutable_trg
BEFORE UPDATE OR DELETE ON "tax_rules"
FOR EACH ROW EXECUTE FUNCTION prevent_movement_modification();
CREATE TRIGGER uvt_values_immutable_trg
BEFORE UPDATE OR DELETE ON "uvt_values"
FOR EACH ROW EXECUTE FUNCTION prevent_movement_modification();

-- Contenido inicial, PENDIENTE DE REVISIÓN del asesor tributario (ADR-006): es condición para
-- usar el motor en producción. Las bases de retención son las del Decreto 1625 de 2016; el
-- asesor debe confirmar si el Decreto 0572 de 2025 las modificó para la vigencia actual.
INSERT INTO "tax_rules"
    ("id", "code", "tax_type", "treatment", "description", "rate_pct", "rate_min_per_mil",
     "rate_max_per_mil", "min_base_uvt", "applies_to", "payee_condition", "legal_reference",
     "effective_from")
VALUES
    (gen_random_uuid(), 'IVA_19', 'IVA', 'GRAVADO', 'IVA tarifa general 19 %', 19, NULL, NULL, NULL, 'ANY', 'ANY', 'Estatuto Tributario art. 468', '2017-01-01'),
    (gen_random_uuid(), 'IVA_5', 'IVA', 'GRAVADO', 'IVA tarifa diferencial 5 %', 5, NULL, NULL, NULL, 'ANY', 'ANY', 'Estatuto Tributario arts. 468-1 y 468-3', '2017-01-01'),
    (gen_random_uuid(), 'IVA_EXENTO', 'IVA', 'EXENTO', 'Bienes y servicios exentos (gravados a tarifa 0 %)', 0, NULL, NULL, NULL, 'ANY', 'ANY', 'Estatuto Tributario arts. 477 y 481', '2017-01-01'),
    (gen_random_uuid(), 'IVA_EXCLUIDO', 'IVA', 'EXCLUIDO', 'Bienes y servicios excluidos de IVA', 0, NULL, NULL, NULL, 'ANY', 'ANY', 'Estatuto Tributario arts. 424 y 476', '2017-01-01'),
    (gen_random_uuid(), 'INC_8', 'INC', NULL, 'Impuesto nacional al consumo 8 % (restaurantes, cafeterías y bares)', 8, NULL, NULL, NULL, 'ANY', 'ANY', 'Estatuto Tributario arts. 512-1 y 512-9', '2017-01-01'),
    (gen_random_uuid(), 'INC_4', 'INC', NULL, 'Impuesto nacional al consumo 4 % (telefonía y datos)', 4, NULL, NULL, NULL, 'SERVICES', 'ANY', 'Estatuto Tributario art. 512-2', '2017-01-01'),
    (gen_random_uuid(), 'RTF_COMPRAS_DECL', 'RETEFUENTE', NULL, 'Retención en la fuente por compras generales (declarantes)', 2.5, NULL, NULL, 27, 'GOODS', 'DECLARANT', 'Decreto 1625 de 2016 art. 1.2.4.9.1', '2017-01-01'),
    (gen_random_uuid(), 'RTF_COMPRAS_NODECL', 'RETEFUENTE', NULL, 'Retención en la fuente por compras generales (no declarantes)', 3.5, NULL, NULL, 27, 'GOODS', 'NON_DECLARANT', 'Decreto 1625 de 2016 art. 1.2.4.9.1', '2017-01-01'),
    (gen_random_uuid(), 'RTF_SERVICIOS_DECL', 'RETEFUENTE', NULL, 'Retención en la fuente por servicios generales (declarantes)', 4, NULL, NULL, 4, 'SERVICES', 'DECLARANT', 'Decreto 1625 de 2016 art. 1.2.4.4.14', '2017-01-01'),
    (gen_random_uuid(), 'RTF_SERVICIOS_NODECL', 'RETEFUENTE', NULL, 'Retención en la fuente por servicios generales (no declarantes)', 6, NULL, NULL, 4, 'SERVICES', 'NON_DECLARANT', 'Decreto 1625 de 2016 art. 1.2.4.4.14', '2017-01-01'),
    (gen_random_uuid(), 'RETEIVA_15', 'RETEIVA', NULL, 'Retención de IVA 15 % del impuesto', 15, NULL, NULL, NULL, 'ANY', 'ANY', 'Estatuto Tributario arts. 437-1 y 437-2', '2017-01-01'),
    (gen_random_uuid(), 'RETEICA_INDUSTRIAL', 'RETEICA', NULL, 'Retención de ICA, actividades industriales (rango por mil)', NULL, 2, 7, NULL, 'ANY', 'ANY', 'Ley 14 de 1983 art. 33', '2017-01-01'),
    (gen_random_uuid(), 'RETEICA_COMERCIAL', 'RETEICA', NULL, 'Retención de ICA, actividades comerciales (rango por mil)', NULL, 2, 10, NULL, 'ANY', 'ANY', 'Ley 14 de 1983 art. 33', '2017-01-01'),
    (gen_random_uuid(), 'RETEICA_SERVICIOS', 'RETEICA', NULL, 'Retención de ICA, actividades de servicios (rango por mil)', NULL, 2, 10, NULL, 'ANY', 'ANY', 'Ley 14 de 1983 art. 33', '2017-01-01');

INSERT INTO "uvt_values" ("year", "value", "legal_reference") VALUES
    (2024, 47065, 'Resolución DIAN 000187 de 2023'),
    (2025, 49799, 'Resolución DIAN 000193 de 2024'),
    (2026, 52374, 'Resolución DIAN 000238 de 2025');

-- ---------------------------------------------------------------------------
-- Perfil tributario de la empresa: versiones de solo inserción con vigencia
-- ---------------------------------------------------------------------------
CREATE TABLE "company_tax_profiles" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "responsibilities" VARCHAR(8)[] NOT NULL,
    "ica_activity" VARCHAR(16),
    "ica_rate_per_mil" DECIMAL(7,3),
    "ica_withholding_agent" BOOLEAN NOT NULL DEFAULT false,
    "reason" VARCHAR(500) NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_tax_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "company_tax_profiles_ica_activity_check"
        CHECK ("ica_activity" IS NULL OR "ica_activity" IN ('INDUSTRIAL', 'COMERCIAL', 'SERVICIOS')),
    CONSTRAINT "company_tax_profiles_ica_check" CHECK (
        ("ica_activity" IS NULL AND "ica_rate_per_mil" IS NULL AND NOT "ica_withholding_agent")
        OR ("ica_activity" IS NOT NULL AND "ica_rate_per_mil" >= 0)
    ),
    CONSTRAINT "company_tax_profiles_reason_check" CHECK (length(btrim("reason")) > 0)
);
CREATE UNIQUE INDEX "company_tax_profiles_company_id_effective_from_key"
    ON "company_tax_profiles"("company_id", "effective_from");
ALTER TABLE "company_tax_profiles"
    ADD CONSTRAINT "company_tax_profiles_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "company_tax_profiles"
    ADD CONSTRAINT "company_tax_profiles_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TRIGGER company_tax_profiles_immutable_trg
BEFORE UPDATE OR DELETE ON "company_tax_profiles"
FOR EACH ROW EXECUTE FUNCTION prevent_movement_modification();

-- ---------------------------------------------------------------------------
-- Clasificación de proveedores y productos
-- ---------------------------------------------------------------------------
ALTER TABLE "suppliers"
    ADD COLUMN "tax_responsibilities" VARCHAR(8)[] NOT NULL DEFAULT '{}',
    ADD COLUMN "is_income_tax_declarant" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "product_tax_profiles"
    ADD COLUMN "tax_type" VARCHAR(8) NOT NULL DEFAULT 'IVA',
    ADD COLUMN "tax_rule_id" UUID,
    ADD CONSTRAINT "product_tax_profiles_tax_type_check" CHECK ("tax_type" IN ('IVA', 'INC'));
ALTER TABLE "product_tax_profiles"
    ADD CONSTRAINT "product_tax_profiles_tax_rule_id_fkey"
    FOREIGN KEY ("tax_rule_id") REFERENCES "tax_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Un producto puede tener IVA e INC activos a la vez: la superposición se impide por impuesto
ALTER TABLE "product_tax_profiles" DROP CONSTRAINT "product_tax_profiles_no_active_overlap";
ALTER TABLE "product_tax_profiles"
    ADD CONSTRAINT "product_tax_profiles_no_active_overlap"
    EXCLUDE USING gist (
        "product_id" WITH =,
        "operation" WITH =,
        "tax_type" WITH =,
        daterange("effective_from", "effective_to", '[]') WITH &&
    )
    WHERE ("status" = 'ACTIVE');
DROP INDEX IF EXISTS "product_tax_profiles_product_id_operation_status_effective_from_idx";
CREATE INDEX "product_tax_profiles_product_operation_type_idx"
    ON "product_tax_profiles"("product_id", "operation", "tax_type", "status", "effective_from");

-- La clasificación activa tampoco puede cambiar de impuesto ni de regla del catálogo
CREATE OR REPLACE FUNCTION guard_product_tax_profile_history() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'ACTIVE' THEN
            RAISE EXCEPTION 'ACTIVE tax profiles cannot be deleted'
                USING ERRCODE = '23514';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status = 'ACTIVE' THEN
        -- A profile can only be superseded prospectively. No classification,
        -- rate, documentary reference or past interval may be rewritten.
        IF NEW.id IS DISTINCT FROM OLD.id
            OR NEW.product_id IS DISTINCT FROM OLD.product_id
            OR NEW.operation IS DISTINCT FROM OLD.operation
            OR NEW.treatment IS DISTINCT FROM OLD.treatment
            OR NEW.rate_pct IS DISTINCT FROM OLD.rate_pct
            OR NEW.tax_type IS DISTINCT FROM OLD.tax_type
            OR NEW.tax_rule_id IS DISTINCT FROM OLD.tax_rule_id
            OR NEW.status IS DISTINCT FROM OLD.status
            OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
            OR NEW.document_reference IS DISTINCT FROM OLD.document_reference
            OR NEW.activated_by_id IS DISTINCT FROM OLD.activated_by_id
            OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
            OR NEW.created_at IS DISTINCT FROM OLD.created_at
            OR NEW.effective_to IS NOT DISTINCT FROM OLD.effective_to
            OR NEW.effective_to IS NULL
            OR NEW.effective_to <= CURRENT_DATE
            OR (OLD.effective_to IS NOT NULL AND NEW.effective_to >= OLD.effective_to)
        THEN
            RAISE EXCEPTION 'ACTIVE tax profile is immutable except a future shortening of effective_to'
                USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.status = 'ACTIVE' THEN
        IF NEW.effective_from < CURRENT_DATE THEN
            RAISE EXCEPTION 'Tax profile activation cannot start in the past'
                USING ERRCODE = '23514';
        END IF;
        NEW.activated_at := CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ---------------------------------------------------------------------------
-- Impuestos por línea con la instantánea de lo aplicado
-- ---------------------------------------------------------------------------
ALTER TABLE "sales"
    ADD COLUMN "inc_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD CONSTRAINT "sales_inc_total_check" CHECK ("inc_total" >= 0);
ALTER TABLE "sale_lines"
    ADD COLUMN "inc_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    ADD COLUMN "inc_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "tax_snapshot" JSONB,
    ADD CONSTRAINT "sale_lines_inc_check" CHECK ("inc_rate" >= 0 AND "inc_amount" >= 0);

-- La factura del proveedor: subtotal + IVA = total; la cuenta por pagar queda por el neto
ALTER TABLE "purchases"
    ADD COLUMN "subtotal" DECIMAL(12,2),
    ADD COLUMN "vat_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "withholding_income" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "withholding_vat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "withholding_ica" DECIMAL(12,2) NOT NULL DEFAULT 0,
    -- Detalle de las retenciones practicadas: concepto, base, tarifa y valor
    ADD COLUMN "tax_snapshot" JSONB,
    ADD CONSTRAINT "purchases_taxes_check" CHECK (
        "vat_total" >= 0 AND "withholding_income" >= 0 AND "withholding_vat" >= 0
        AND "withholding_ica" >= 0
        AND ("subtotal" IS NULL OR "subtotal" + "vat_total" = "total_amount")
        AND "withholding_income" + "withholding_vat" + "withholding_ica" <= "total_amount"
    );
ALTER TABLE "purchase_lines"
    ADD COLUMN "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    ADD COLUMN "vat_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN "tax_snapshot" JSONB,
    ADD CONSTRAINT "purchase_lines_vat_check" CHECK ("vat_rate" >= 0 AND "vat_amount" >= 0);
