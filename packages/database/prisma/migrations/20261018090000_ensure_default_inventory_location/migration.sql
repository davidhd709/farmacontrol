-- Una instalación nueva no tenía ninguna ubicación de inventario y la web no permite crearlas:
-- recibir la primera compra fallaba con "No existe ninguna ubicación de inventario activa".
-- Igual que el Consumidor Final, se crea una bodega principal, solo si no existe ninguna
-- ubicación (las bases que ya operan no cambian).
INSERT INTO "locations" ("id", "code", "name", "description", "is_default", "is_active", "created_at", "updated_at")
SELECT
    gen_random_uuid(),
    'BOD-PRINCIPAL',
    'Bodega principal',
    'Ubicación creada al instalar el sistema',
    true,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "locations");
