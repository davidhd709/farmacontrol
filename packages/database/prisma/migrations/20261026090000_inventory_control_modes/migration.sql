-- F4 (ADR-006): modos de control multisector para productos y existencias.
-- Conserva el historial de lotes, hace opcionales lote/vencimiento según el modo y protege
-- los cambios de modo frente a escrituras concurrentes.

BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE "products", "inventory_lots", "purchase_lines" IN ACCESS EXCLUSIVE MODE;

ALTER TABLE "products"
    ADD COLUMN "inventory_control_mode" VARCHAR(16);

UPDATE "products" AS product
SET "inventory_control_mode" = CASE
    WHEN product."requires_lot_control" THEN 'LOT_EXPIRY'
    WHEN EXISTS (
        SELECT 1
        FROM "inventory_lots" AS lot
        WHERE lot."product_id" = product."id"
    ) THEN 'LOT_EXPIRY'
    ELSE 'SIMPLE'
END;

ALTER TABLE "products"
    ALTER COLUMN "inventory_control_mode" SET NOT NULL,
    ADD CONSTRAINT "products_inventory_control_mode_check"
        CHECK ("inventory_control_mode" IN ('SERVICE', 'SIMPLE', 'LOT', 'LOT_EXPIRY', 'SERIAL'));

ALTER TABLE "products"
    DROP COLUMN "requires_lot_control";

ALTER TABLE "inventory_lots"
    ALTER COLUMN "lot_number" DROP NOT NULL,
    ALTER COLUMN "expiration_date" DROP NOT NULL,
    ADD COLUMN "control_mode" VARCHAR(16);

UPDATE "inventory_lots" AS lot
SET "control_mode" = product."inventory_control_mode"
FROM "products" AS product
WHERE product."id" = lot."product_id";

ALTER TABLE "inventory_lots"
    ALTER COLUMN "control_mode" SET NOT NULL,
    ADD CONSTRAINT "inventory_lots_control_mode_check"
        CHECK ("control_mode" IN ('SIMPLE', 'LOT', 'LOT_EXPIRY', 'SERIAL')),
    ADD CONSTRAINT "inventory_lots_control_mode_shape_check"
        CHECK (
            ("control_mode" = 'SIMPLE'
                AND "lot_number" IS NULL
                AND "expiration_date" IS NULL)
            OR ("control_mode" = 'LOT'
                AND "lot_number" IS NOT NULL
                AND "expiration_date" IS NULL)
            OR ("control_mode" = 'LOT_EXPIRY'
                AND "lot_number" IS NOT NULL
                AND "expiration_date" IS NOT NULL)
            OR ("control_mode" = 'SERIAL'
                AND "lot_number" IS NOT NULL
                AND "expiration_date" IS NULL
                AND "current_quantity" <= 1)
        ),
    ADD CONSTRAINT "inventory_lots_lot_number_nonempty_check"
        CHECK ("lot_number" IS NULL OR length(btrim("lot_number")) > 0);

CREATE UNIQUE INDEX "inventory_lots_simple_product_location_key"
    ON "inventory_lots"("product_id", "location_id")
    WHERE "lot_number" IS NULL;

CREATE UNIQUE INDEX "inventory_lots_serial_product_number_key"
    ON "inventory_lots"("product_id", "lot_number")
    WHERE "control_mode" = 'SERIAL';

ALTER TABLE "purchase_lines"
    ALTER COLUMN "lot_number" DROP NOT NULL,
    ALTER COLUMN "expiration_date" DROP NOT NULL,
    ADD CONSTRAINT "purchase_lines_lot_number_nonempty_check"
        CHECK ("lot_number" IS NULL OR length(btrim("lot_number")) > 0);

CREATE FUNCTION guard_inventory_lot_insert_control_mode() RETURNS trigger AS $$
DECLARE
    product_control_mode VARCHAR(16);
BEGIN
    SELECT "inventory_control_mode"
    INTO product_control_mode
    FROM "products"
    WHERE "id" = NEW."product_id"
    FOR SHARE;

    IF NOT FOUND
        OR product_control_mode = 'SERVICE'
        OR product_control_mode IS DISTINCT FROM NEW."control_mode" THEN
        RAISE EXCEPTION
            'INVENTORY_CONTROL_MODE_MISMATCH: producto %, modo vigente %, modo de existencia %',
            NEW."product_id",
            COALESCE(product_control_mode, '<no existe>'),
            NEW."control_mode"
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_lots_control_mode_insert_trg
BEFORE INSERT ON "inventory_lots"
FOR EACH ROW EXECUTE FUNCTION guard_inventory_lot_insert_control_mode();

CREATE FUNCTION guard_inventory_lot_identity_update() RETURNS trigger AS $$
BEGIN
    IF NEW."product_id" IS DISTINCT FROM OLD."product_id"
        OR NEW."control_mode" IS DISTINCT FROM OLD."control_mode" THEN
        RAISE EXCEPTION
            'INVENTORY_LOT_IDENTITY_IMMUTABLE: product_id y control_mode de una existencia son inmutables'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_lots_identity_immutable_trg
BEFORE UPDATE OF "control_mode", "product_id" ON "inventory_lots"
FOR EACH ROW EXECUTE FUNCTION guard_inventory_lot_identity_update();

CREATE FUNCTION guard_product_inventory_control_mode_update() RETURNS trigger AS $$
BEGIN
    IF NEW."inventory_control_mode" IS DISTINCT FROM OLD."inventory_control_mode"
        AND EXISTS (
            SELECT 1
            FROM "inventory_lots" AS lot
            WHERE lot."product_id" = OLD."id"
        ) THEN
        RAISE EXCEPTION
            'INVENTORY_CONTROL_MODE_LOCKED: el producto % tiene existencias registradas',
            OLD."id"
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_inventory_control_mode_locked_trg
BEFORE UPDATE OF "inventory_control_mode" ON "products"
FOR EACH ROW EXECUTE FUNCTION guard_product_inventory_control_mode_update();

COMMIT;
