-- Naturaleza débito/crédito de cada cuenta (acuerdo del 4 de octubre de 2026).
-- Define el signo del saldo en auxiliares y balance de comprobación: 4175 (descuentos y
-- devoluciones en ventas) es débito aunque pertenezca a los ingresos.
CREATE TYPE "AccountNature" AS ENUM ('DEBIT', 'CREDIT');

ALTER TABLE "accounts" ADD COLUMN "nature" "AccountNature";

-- 1. Naturaleza por defecto del tipo
UPDATE "accounts"
SET "nature" = CASE
  WHEN "type" IN ('ASSET', 'EXPENSE', 'COST', 'ORDER_DEBTOR') THEN 'DEBIT'::"AccountNature"
  ELSE 'CREDIT'::"AccountNature"
END;

-- 2. Correctoras del activo (PUC Decreto 2650): grupos 92, 97, 98 y 99 de la clase 1
UPDATE "accounts" SET "nature" = 'CREDIT'
WHERE "type" = 'ASSET' AND "code" ~ '^1[0-9](92|97|98|99)';

-- 3. Sufijo explícito en el nombre, heredado por las subcuentas que no traen el suyo
WITH RECURSIVE explicit AS (
  SELECT "id",
         CASE WHEN upper(btrim("name")) LIKE '%(DB)' THEN 'DEBIT' ELSE 'CREDIT' END::"AccountNature" AS nature
  FROM "accounts"
  WHERE upper(btrim("name")) LIKE '%(DB)' OR upper(btrim("name")) LIKE '%(CR)'
  UNION ALL
  SELECT child."id", explicit.nature
  FROM "accounts" child
  JOIN explicit ON child."parent_id" = explicit."id"
  WHERE upper(btrim(child."name")) NOT LIKE '%(DB)' AND upper(btrim(child."name")) NOT LIKE '%(CR)'
)
UPDATE "accounts" a SET "nature" = explicit.nature
FROM explicit WHERE a."id" = explicit."id";

ALTER TABLE "accounts" ALTER COLUMN "nature" SET NOT NULL;

-- Inserciones que no indican la naturaleza (seeds, cargas directas): misma regla que
-- inferAccountNature en el dominio. La aplicación siempre la envía explícita.
CREATE OR REPLACE FUNCTION infer_account_nature()
RETURNS TRIGGER AS $$
DECLARE
  type_nature "AccountNature";
  parent_nature "AccountNature";
BEGIN
  IF NEW."nature" IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW."type" IN ('ASSET', 'EXPENSE', 'COST', 'ORDER_DEBTOR') THEN
    type_nature := 'DEBIT';
  ELSE
    type_nature := 'CREDIT';
  END IF;
  IF upper(btrim(NEW."name")) LIKE '%(DB)' THEN
    NEW."nature" := 'DEBIT';
  ELSIF upper(btrim(NEW."name")) LIKE '%(CR)' THEN
    NEW."nature" := 'CREDIT';
  ELSE
    IF NEW."parent_id" IS NOT NULL THEN
      SELECT "nature" INTO parent_nature FROM "accounts" WHERE "id" = NEW."parent_id";
    END IF;
    -- Solo se hereda una naturaleza que el padre cambió respecto de su tipo
    IF parent_nature IS NOT NULL AND parent_nature <> type_nature THEN
      NEW."nature" := parent_nature;
    ELSIF NEW."type" = 'ASSET' AND NEW."code" ~ '^1[0-9](92|97|98|99)' THEN
      NEW."nature" := 'CREDIT';
    ELSE
      NEW."nature" := type_nature;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounts_infer_nature_trg
BEFORE INSERT ON "accounts"
FOR EACH ROW EXECUTE FUNCTION infer_account_nature();
