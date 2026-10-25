-- F5 (ADR-006): capas de costo para PEPS y costo identificado por existencia, método con que
-- está valorizado cada saldo y constancia de las conversiones. No toca movimientos pasados:
-- los saldos existentes siguen en promedio ponderado hasta que la política cambie.

ALTER TABLE "inventory_cost_balances"
    ADD COLUMN "costing_method" VARCHAR(32) NOT NULL DEFAULT 'WEIGHTED_AVERAGE',
    ADD CONSTRAINT "inventory_cost_balances_costing_method_check"
        CHECK ("costing_method" IN ('WEIGHTED_AVERAGE', 'FIFO', 'SPECIFIC_LOT'));

CREATE TABLE "inventory_cost_layers" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "quantity_initial" INTEGER NOT NULL,
    "quantity_remaining" INTEGER NOT NULL,
    "value_initial" DECIMAL(20,2) NOT NULL,
    "value_remaining" DECIMAL(20,2) NOT NULL,
    "source_type" VARCHAR(64) NOT NULL,
    "source_id" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_cost_layers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inventory_cost_layers_quantity_check"
        CHECK ("quantity_initial" > 0 AND "quantity_remaining" >= 0 AND "quantity_remaining" <= "quantity_initial"),
    CONSTRAINT "inventory_cost_layers_value_check"
        CHECK ("value_initial" >= 0 AND "value_remaining" >= 0 AND "value_remaining" <= "value_initial"),
    -- Una capa vacía no conserva valor: la salida que la agota se lleva el remanente exacto
    CONSTRAINT "inventory_cost_layers_empty_check"
        CHECK ("quantity_remaining" > 0 OR "value_remaining" = 0)
);
CREATE INDEX "inventory_cost_layers_product_id_created_at_idx"
    ON "inventory_cost_layers"("product_id", "created_at");
CREATE INDEX "inventory_cost_layers_lot_id_idx" ON "inventory_cost_layers"("lot_id");
-- Capas abiertas: las que consume PEPS
CREATE INDEX "inventory_cost_layers_open_idx"
    ON "inventory_cost_layers"("product_id", "created_at", "id") WHERE "quantity_remaining" > 0;
ALTER TABLE "inventory_cost_layers"
    ADD CONSTRAINT "inventory_cost_layers_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- La capa pertenece a una existencia del mismo producto
ALTER TABLE "inventory_cost_layers"
    ADD CONSTRAINT "inventory_cost_layers_lot_id_product_id_fkey"
    FOREIGN KEY ("lot_id", "product_id") REFERENCES "inventory_lots"("id", "product_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "inventory_costing_conversions" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "from_method" VARCHAR(32) NOT NULL,
    "to_method" VARCHAR(32) NOT NULL,
    "quantity_base_units" INTEGER NOT NULL,
    "total_value" DECIMAL(20,2) NOT NULL,
    "policy_id" UUID,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_costing_conversions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inventory_costing_conversions_methods_check" CHECK (
        "from_method" IN ('WEIGHTED_AVERAGE', 'FIFO', 'SPECIFIC_LOT')
        AND "to_method" IN ('WEIGHTED_AVERAGE', 'FIFO', 'SPECIFIC_LOT')
        AND "from_method" <> "to_method"
    ),
    CONSTRAINT "inventory_costing_conversions_amounts_check"
        CHECK ("quantity_base_units" >= 0 AND "total_value" >= 0)
);
CREATE INDEX "inventory_costing_conversions_product_id_created_at_idx"
    ON "inventory_costing_conversions"("product_id", "created_at");
ALTER TABLE "inventory_costing_conversions"
    ADD CONSTRAINT "inventory_costing_conversions_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_costing_conversions"
    ADD CONSTRAINT "inventory_costing_conversions_policy_id_fkey"
    FOREIGN KEY ("policy_id") REFERENCES "company_accounting_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_costing_conversions"
    ADD CONSTRAINT "inventory_costing_conversions_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- La constancia de una conversión es historia, como el submayor
CREATE TRIGGER inventory_costing_conversions_immutable_trg
BEFORE UPDATE OR DELETE ON "inventory_costing_conversions"
FOR EACH ROW EXECUTE FUNCTION prevent_movement_modification();
