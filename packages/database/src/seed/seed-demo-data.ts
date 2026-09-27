import { prisma } from '../index';

async function main() {
  console.log('[Seed Demo] Sembrando datos maestros para pruebas...');

  // 1. Ubicación
  const location = await prisma.location.upsert({
    where: { code: 'BOD-01' },
    update: {},
    create: {
      code: 'BOD-01',
      name: 'Bodega Principal',
      description: 'Estantería central climatizada',
    },
  });

  // 2. Categorías
  const catAntibioticos = await prisma.category.upsert({
    where: { name: 'Antibióticos' },
    update: {},
    create: { name: 'Antibióticos', description: 'Medicamentos antimicrobianos' },
  });

  const catAnalgesicos = await prisma.category.upsert({
    where: { name: 'Analgésicos y Antiinflamatorios' },
    update: {},
    create: { name: 'Analgésicos y Antiinflamatorios', description: 'Alivio del dolor y fiebre' },
  });

  const catGastro = await prisma.category.upsert({
    where: { name: 'Gastrointestinales' },
    update: {},
    create: { name: 'Gastrointestinales', description: 'Protectores gástricos y antiácidos' },
  });

  // 3. Productos y Presentaciones
  const p1 = await prisma.product.upsert({
    where: { code: 'MED-001' },
    update: {},
    create: {
      code: 'MED-001',
      name: 'Amoxicilina 500mg',
      description: 'Cápsulas antibióticas de amplio espectro',
      categoryId: catAntibioticos.id,
      baseUnit: 'CAP',
      baseCost: '400',
      basePrice: '800',
    },
  });

  await prisma.productPresentation.upsert({
    where: { barcode: '770000000001' },
    update: {},
    create: {
      productId: p1.id,
      name: 'Caja x 30 Cápsulas',
      conversionFactor: 30,
      barcode: '770000000001',
      price: '22000',
      cost: '11000',
      isDefault: true,
    },
  });

  const p2 = await prisma.product.upsert({
    where: { code: 'MED-002' },
    update: {},
    create: {
      code: 'MED-002',
      name: 'Ibuprofeno 400mg',
      description: 'Tabletas antiinflamatorias no esteroideas',
      categoryId: catAnalgesicos.id,
      baseUnit: 'TAB',
      baseCost: '250',
      basePrice: '500',
    },
  });

  await prisma.productPresentation.upsert({
    where: { barcode: '770000000002' },
    update: {},
    create: {
      productId: p2.id,
      name: 'Blíster x 10 Tabletas',
      conversionFactor: 10,
      barcode: '770000000002',
      price: '4500',
      cost: '2200',
      isDefault: true,
    },
  });

  const p3 = await prisma.product.upsert({
    where: { code: 'MED-003' },
    update: {},
    create: {
      code: 'MED-003',
      name: 'Omeprazol 20mg',
      description: 'Cápsulas inhibidoras de bomba de protones',
      categoryId: catGastro.id,
      baseUnit: 'CAP',
      baseCost: '300',
      basePrice: '700',
    },
  });

  await prisma.productPresentation.upsert({
    where: { barcode: '770000000003' },
    update: {},
    create: {
      productId: p3.id,
      name: 'Caja x 14 Cápsulas',
      conversionFactor: 14,
      barcode: '770000000003',
      price: '9000',
      cost: '3800',
      isDefault: true,
    },
  });

  // 4. Lotes con stock disponible para FEFO
  const lot1 = await prisma.inventoryLot.upsert({
    where: {
      productId_locationId_lotNumber: {
        productId: p1.id,
        locationId: location.id,
        lotNumber: 'LOT-AMX-2027',
      },
    },
    update: {
      currentQuantity: 150,
    },
    create: {
      productId: p1.id,
      lotNumber: 'LOT-AMX-2027',
      locationId: location.id,
      expirationDate: new Date('2027-08-15'),
      currentQuantity: 150,
    },
  });

  const lot2 = await prisma.inventoryLot.upsert({
    where: {
      productId_locationId_lotNumber: {
        productId: p2.id,
        locationId: location.id,
        lotNumber: 'LOT-IBU-2027',
      },
    },
    update: {
      currentQuantity: 200,
    },
    create: {
      productId: p2.id,
      lotNumber: 'LOT-IBU-2027',
      locationId: location.id,
      expirationDate: new Date('2027-04-10'),
      currentQuantity: 200,
    },
  });

  const lot3 = await prisma.inventoryLot.upsert({
    where: {
      productId_locationId_lotNumber: {
        productId: p3.id,
        locationId: location.id,
        lotNumber: 'LOT-OMP-2026',
      },
    },
    update: {
      currentQuantity: 100,
    },
    create: {
      productId: p3.id,
      lotNumber: 'LOT-OMP-2026',
      locationId: location.id,
      expirationDate: new Date('2026-11-20'),
      currentQuantity: 100,
    },
  });

  // 5. Cliente de demostración
  await prisma.customer.upsert({
    where: { documentNumber: '10203040' },
    update: {},
    create: {
      documentType: 'CC',
      documentNumber: '10203040',
      name: 'Carlos Gómez Restrepo',
      phone: '3001234567',
      email: 'carlos.gomez@ejemplo.com',
      address: 'Calle 45 # 12 - 34',
    },
  });

  // 6. Proveedor de demostración
  await prisma.supplier.upsert({
    where: { taxId: '900123456-1' },
    update: {},
    create: {
      taxId: '900123456-1',
      name: 'Distribuidora Farmacéutica del Norte S.A.S.',
      contactName: 'Disfarma Norte',
      phone: '6042345678',
      email: 'ventas@disfarmanorte.com',
      address: 'Zona Industrial Lote 4',
    },
  });

  console.log('[Seed Demo] Datos de prueba listos:');
  console.log('  - 3 Categorías farmacéuticas');
  console.log('  - 3 Productos con códigos de barra y presentaciones');
  console.log('  - 3 Lotes con 450 unidades base y fechas de vencimiento activas');
  console.log('  - 1 Cliente frecuente');
  console.log('  - 1 Proveedor de medicamentos');
}

main()
  .catch((err) => {
    console.error('[Seed Demo] Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
