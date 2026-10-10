-- Terceros unificado (acuerdo del 4 de octubre de 2026): todo cliente y proveedor existente
-- queda registrado como tercero. Si el mismo documento ya es tercero, solo se agrega el rol.

-- Clientes ya registrados como tercero por documento: agregar rol y vínculo
UPDATE "third_parties" t
SET "is_customer" = true, "customer_id" = COALESCE(t."customer_id", c."id"), "updated_at" = now()
FROM "customers" c
WHERE c."document_number" = t."document_number"
  AND NOT EXISTS (SELECT 1 FROM "third_parties" x WHERE x."customer_id" = c."id");

-- Clientes sin tercero
INSERT INTO "third_parties" (
  "id", "document_type", "document_number", "name", "phone", "email", "address",
  "is_customer", "is_active", "customer_id", "updated_at"
)
SELECT gen_random_uuid(), c."document_type", c."document_number", c."name", c."phone", c."email", c."address",
       true, c."is_active", c."id", now()
FROM "customers" c
WHERE NOT EXISTS (SELECT 1 FROM "third_parties" x WHERE x."customer_id" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "third_parties" x WHERE x."document_number" = c."document_number");

-- Proveedores ya registrados como tercero por documento (NIT)
UPDATE "third_parties" t
SET "is_supplier" = true, "supplier_id" = COALESCE(t."supplier_id", s."id"), "updated_at" = now()
FROM "suppliers" s
WHERE s."tax_id" = t."document_number"
  AND NOT EXISTS (SELECT 1 FROM "third_parties" x WHERE x."supplier_id" = s."id");

-- Proveedores sin tercero
INSERT INTO "third_parties" (
  "id", "document_type", "document_number", "name", "contact_name", "phone", "email", "address",
  "is_supplier", "is_active", "supplier_id", "updated_at"
)
SELECT gen_random_uuid(), 'NIT', s."tax_id", s."name", s."contact_name", s."phone", s."email", s."address",
       true, s."is_active", s."id", now()
FROM "suppliers" s
WHERE NOT EXISTS (SELECT 1 FROM "third_parties" x WHERE x."supplier_id" = s."id")
  AND NOT EXISTS (SELECT 1 FROM "third_parties" x WHERE x."document_number" = s."tax_id");
