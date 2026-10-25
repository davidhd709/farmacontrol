-- F2 (ADR-005): submayor de valoración del inventario con promedio ponderado móvil.
-- Solo agrega tablas y una columna: no reescribe históricos ni imputa costos a ventas pasadas.

CREATE TABLE "inventory_cost_balances" (
    "product_id" UUID NOT NULL,
    "quantity_base_units" INTEGER NOT NULL,
    "total_value" DECIMAL(20,2) NOT NULL,
    "last_unit_cost" DECIMAL(20,6),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "inventory_cost_balances_pkey" PRIMARY KEY ("product_id"),
    CONSTRAINT "inventory_cost_balances_quantity_check" CHECK ("quantity_base_units" >= 0),
    CONSTRAINT "inventory_cost_balances_value_check" CHECK ("total_value" >= 0),
    -- Sin existencias no puede quedar valor: la última salida se lleva el saldo exacto
    CONSTRAINT "inventory_cost_balances_empty_check" CHECK ("quantity_base_units" > 0 OR "total_value" = 0),
    CONSTRAINT "inventory_cost_balances_last_cost_check" CHECK ("last_unit_cost" IS NULL OR "last_unit_cost" >= 0)
);

CREATE TABLE "inventory_valuation_movements" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "movement_type" VARCHAR(32) NOT NULL,
    "direction" VARCHAR(3) NOT NULL,
    "quantity_base_units" INTEGER NOT NULL,
    "value" DECIMAL(20,2) NOT NULL,
    "balance_quantity_after" INTEGER NOT NULL,
    "balance_value_after" DECIMAL(20,2) NOT NULL,
    "source_type" VARCHAR(64) NOT NULL,
    "source_id" VARCHAR(128) NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_valuation_movements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inventory_valuation_movements_type_check" CHECK ("movement_type" IN (
        'OPENING', 'PURCHASE', 'SALE', 'SALE_CANCELLATION', 'SALE_RETURN',
        'PURCHASE_RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'
    )),
    CONSTRAINT "inventory_valuation_movements_direction_check" CHECK ("direction" IN ('IN', 'OUT')),
    CONSTRAINT "inventory_valuation_movements_quantity_check" CHECK ("quantity_base_units" > 0),
    CONSTRAINT "inventory_valuation_movements_value_check" CHECK ("value" >= 0),
    CONSTRAINT "inventory_valuation_movements_balance_check" CHECK (
        "balance_quantity_after" >= 0 AND "balance_value_after" >= 0
        AND ("balance_quantity_after" > 0 OR "balance_value_after" = 0)
    )
);

CREATE INDEX "inventory_valuation_movements_product_id_created_at_idx"
    ON "inventory_valuation_movements"("product_id", "created_at");
CREATE INDEX "inventory_valuation_movements_source_type_source_id_idx"
    ON "inventory_valuation_movements"("source_type", "source_id");

ALTER TABLE "inventory_cost_balances"
    ADD CONSTRAINT "inventory_cost_balances_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_valuation_movements"
    ADD CONSTRAINT "inventory_valuation_movements_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_valuation_movements"
    ADD CONSTRAINT "inventory_valuation_movements_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- El submayor es de solo inserción, como el kardex y la caja
CREATE TRIGGER inventory_valuation_movements_immutable_trg
BEFORE UPDATE OR DELETE ON "inventory_valuation_movements"
FOR EACH ROW EXECUTE FUNCTION prevent_movement_modification();

-- Costo exacto retirado del inventario valorizado por cada línea de venta
ALTER TABLE "sale_lines" ADD COLUMN "cost_value" DECIMAL(20,2);
ALTER TABLE "sale_lines"
    ADD CONSTRAINT "sale_lines_cost_value_check" CHECK ("cost_value" IS NULL OR "cost_value" >= 0);
