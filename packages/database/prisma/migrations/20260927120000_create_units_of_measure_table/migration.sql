-- CreateTable
CREATE TABLE "units_of_measure" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255),
    "category" VARCHAR(30) NOT NULL DEFAULT 'GENERAL',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "units_of_measure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "units_of_measure_code_key" ON "units_of_measure"("code");
CREATE UNIQUE INDEX "units_of_measure_name_key" ON "units_of_measure"("name");
CREATE UNIQUE INDEX "units_of_measure_code_lower_key" ON "units_of_measure"(LOWER("code"));
CREATE UNIQUE INDEX "units_of_measure_name_lower_key" ON "units_of_measure"(LOWER("name"));

-- Insert initial standard units for pharmaceutical and retail
INSERT INTO "units_of_measure" ("id", "code", "name", "description", "category", "is_active", "created_at", "updated_at") VALUES
('a0000000-0000-0000-0000-000000000001', 'TAB', 'Tableta / Pastilla', 'Unidad farmacéutica sólida para dosificación oral', 'FARMACEUTICA', true, NOW(), NOW()),
('a0000000-0000-0000-0000-000000000002', 'CAP', 'Cápsula', 'Cápsula con cubierta de gelatina', 'FARMACEUTICA', true, NOW(), NOW()),
('a0000000-0000-0000-0000-000000000003', 'BLIS', 'Blíster', 'Empaque alveolar que contiene múltiples tabletas o cápsulas', 'EMPAQUE', true, NOW(), NOW()),
('a0000000-0000-0000-0000-000000000004', 'CAJ', 'Caja', 'Caja comercial de presentación', 'EMPAQUE', true, NOW(), NOW()),
('a0000000-0000-0000-0000-000000000005', 'AMP', 'Ampolla', 'Ampolla o vial inyectable', 'FARMACEUTICA', true, NOW(), NOW()),
('a0000000-0000-0000-0000-000000000006', 'FCO', 'Frasco', 'Frasco de jarabe, suspensión, solución o gotas', 'FARMACEUTICA', true, NOW(), NOW()),
('a0000000-0000-0000-0000-000000000007', 'TUB', 'Tubo', 'Tubo colapsible para cremas, geles o ungüentos', 'FARMACEUTICA', true, NOW(), NOW()),
('a0000000-0000-0000-0000-000000000008', 'SOB', 'Sobre', 'Sobre con polvo, granulado o solución oral', 'FARMACEUTICA', true, NOW(), NOW()),
('a0000000-0000-0000-0000-000000000009', 'UND', 'Unidad', 'Artículo indivisible genérico', 'GENERAL', true, NOW(), NOW()),
('a0000000-0000-0000-0000-000000000010', 'PQT', 'Paquete', 'Paquete de snacks, galletas o víveres', 'RETAIL', true, NOW(), NOW()),
('a0000000-0000-0000-0000-000000000011', 'LAT', 'Lata', 'Lata de bebida, refresco o conserva', 'RETAIL', true, NOW(), NOW()),
('a0000000-0000-0000-0000-000000000012', 'BOT', 'Botella', 'Botella de agua, gaseosa o bebida hidratante', 'RETAIL', true, NOW(), NOW()),
('a0000000-0000-0000-0000-000000000013', 'SIX', 'Six-Pack', 'Empaque de 6 unidades (latas o botellas)', 'RETAIL', true, NOW(), NOW()),
('a0000000-0000-0000-0000-000000000014', 'PAC', 'Paca', 'Paca o bulto de paquetes o bebidas', 'RETAIL', true, NOW(), NOW()),
('a0000000-0000-0000-0000-000000000015', 'BOL', 'Bolsa', 'Bolsa de aseo, algodón, pañales o accesorios', 'GENERAL', true, NOW(), NOW()),
('a0000000-0000-0000-0000-000000000016', 'ML', 'Mililitro (mL)', 'Medida de volumen líquido', 'PESO_VOLUMEN', true, NOW(), NOW()),
('a0000000-0000-0000-0000-000000000017', 'G', 'Gramo (g)', 'Medida de peso o masa', 'PESO_VOLUMEN', true, NOW(), NOW())
ON CONFLICT DO NOTHING;
