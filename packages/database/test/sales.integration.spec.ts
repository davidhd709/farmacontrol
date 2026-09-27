import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma, cleanTestDatabase } from '../src';
import { Prisma } from '@prisma/client';

describe('Sales & Idempotency — Integridad de Persistencia en PostgreSQL (Integration)', () => {
  let customerId: string;
  let userId: string;
  let categoryId: string;
  let productId: string;
  let presentationId: string;
  let locationId: string;
  let lotId: string;

  beforeAll(async () => {
    await cleanTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();

    // 1. Usuario Cajero/Vendedor
    const user = await prisma.user.create({
      data: {
        username: 'vendedor_pos',
        passwordHash: 'argon2id$mockedhash',
        isActive: true,
      },
    });
    userId = user.id;

    // 2. Cliente
    const customer = await prisma.customer.create({
      data: {
        documentType: 'CC',
        documentNumber: '1098765432',
        name: 'Cliente Prueba Mostrador',
        isDefault: false,
        isActive: true,
      },
    });
    customerId = customer.id;

    // 3. Categoría y Producto con presentación
    const category = await prisma.category.create({
      data: {
        name: 'Medicamentos Generales',
        description: 'Categoría para pruebas de venta',
      },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        categoryId,
        code: 'MED-001',
        name: 'Amoxicilina 500mg',
        baseUnit: 'TABLETA',
        basePrice: new Prisma.Decimal('1000.00'),
        baseCost: new Prisma.Decimal('600.00'),
        requiresLotControl: true,
      },
    });
    productId = product.id;

    const presentation = await prisma.productPresentation.create({
      data: {
        productId,
        name: 'Caja x 10 Tabletas',
        conversionFactor: 10,
        price: new Prisma.Decimal('9500.00'),
        cost: new Prisma.Decimal('6000.00'),
        isDefault: true,
      },
    });
    presentationId = presentation.id;

    // 4. Ubicación y Lote disponible
    const location = await prisma.location.create({
      data: {
        code: 'MOSTRADOR-A',
        name: 'Estantería Mostrador A',
        isDefault: true,
      },
    });
    locationId = location.id;

    const lot = await prisma.inventoryLot.create({
      data: {
        productId,
        locationId,
        lotNumber: 'LOTE-AMOX-2026',
        expirationDate: new Date('2027-06-30'),
        currentQuantity: 100, // 100 tabletas
        isActive: true,
      },
    });
    lotId = lot.id;
  });

  afterAll(async () => {
    await cleanTestDatabase();
  });

  it('permite registrar una venta completa con líneas y asignación de lotes', async () => {
    const sale = await prisma.sale.create({
      data: {
        invoiceNumber: 'FAC-000001',
        customerId,
        status: 'COMPLETED',
        paymentMethod: 'EFECTIVO',
        subtotal: new Prisma.Decimal('19000.00'),
        taxTotal: new Prisma.Decimal('0.00'),
        discountTotal: new Prisma.Decimal('0.00'),
        total: new Prisma.Decimal('19000.00'),
        amountPaid: new Prisma.Decimal('20000.00'),
        changeGiven: new Prisma.Decimal('1000.00'),
        createdById: userId,
        lines: {
          create: [
            {
              productId,
              presentationId,
              presentationFactorHistorical: 10,
              quantityCommercial: new Prisma.Decimal('2.00'), // 2 cajas
              quantityBaseUnits: 20, // 20 tabletas
              unitPrice: new Prisma.Decimal('9500.00'),
              discount: new Prisma.Decimal('0.00'),
              subtotal: new Prisma.Decimal('19000.00'),
              taxRate: new Prisma.Decimal('0.00'),
              taxAmount: new Prisma.Decimal('0.00'),
              total: new Prisma.Decimal('19000.00'),
            },
          ],
        },
      },
      include: {
        lines: true,
      },
    });

    const lineId = sale.lines[0].id;

    // Crear la asignación FEFO que vincula la línea de venta con el lote específico
    const allocation = await prisma.saleLotAllocation.create({
      data: {
        saleId: sale.id,
        saleLineId: lineId,
        lotId,
        quantityBaseUnits: 20,
      },
    });

    expect(sale.id).toBeDefined();
    expect(sale.invoiceNumber).toBe('FAC-000001');
    expect(sale.total.toString()).toBe('19000');
    expect(sale.lines).toHaveLength(1);
    expect(sale.lines[0].quantityBaseUnits).toBe(20);

    expect(allocation.id).toBeDefined();
    expect(allocation.saleId).toBe(sale.id);
    expect(allocation.saleLineId).toBe(lineId);
    expect(allocation.lotId).toBe(lotId);
    expect(allocation.quantityBaseUnits).toBe(20);

    // Consulta con inclusión completa de relaciones
    const fullSale = await prisma.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: {
        customer: true,
        createdByUser: true,
        lines: {
          include: {
            product: true,
            presentation: true,
            lotAllocations: {
              include: {
                lot: true,
              },
            },
          },
        },
        lotAllocations: true,
      },
    });

    expect(fullSale.customer.name).toBe('Cliente Prueba Mostrador');
    expect(fullSale.lines[0].product.name).toBe('Amoxicilina 500mg');
    expect(fullSale.lines[0].lotAllocations[0].lot.lotNumber).toBe('LOTE-AMOX-2026');
  });

  it('rechaza números de factura duplicados mediante índice único', async () => {
    await prisma.sale.create({
      data: {
        invoiceNumber: 'FAC-DUP-01',
        customerId,
        status: 'COMPLETED',
        subtotal: new Prisma.Decimal('5000.00'),
        total: new Prisma.Decimal('5000.00'),
        createdById: userId,
      },
    });

    await expect(
      prisma.sale.create({
        data: {
          invoiceNumber: 'FAC-DUP-01',
          customerId,
          status: 'COMPLETED',
          subtotal: new Prisma.Decimal('5000.00'),
          total: new Prisma.Decimal('5000.00'),
          createdById: userId,
        },
      })
    ).rejects.toThrow();
  });

  it('rechaza subtotales o totales negativos mediante CHECK constraints de PostgreSQL', async () => {
    await expect(
      prisma.sale.create({
        data: {
          invoiceNumber: 'FAC-NEG-01',
          customerId,
          status: 'COMPLETED',
          subtotal: new Prisma.Decimal('-100.00'),
          total: new Prisma.Decimal('-100.00'),
          createdById: userId,
        },
      })
    ).rejects.toThrow();
  });

  it('permite registrar y consultar registros de idempotencia con request_hash y response_body', async () => {
    const key = 'idem-key-test-12345';
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const idempotency = await prisma.idempotencyKey.create({
      data: {
        key,
        userId,
        endpoint: '/api/v1/sales/confirm',
        requestHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        responseStatus: 201,
        responseBody: {
          id: 'sale-uuid-mock',
          invoiceNumber: 'FAC-000002',
          total: 19000,
        },
        expiresAt,
      },
    });

    expect(idempotency.id).toBeDefined();
    expect(idempotency.key).toBe(key);
    expect(idempotency.responseStatus).toBe(201);

    // Búsqueda por clave
    const found = await prisma.idempotencyKey.findUnique({
      where: { key },
    });
    expect(found).not.toBeNull();
    expect(found?.requestHash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');

    // Clave duplicada debe ser rechazada
    await expect(
      prisma.idempotencyKey.create({
        data: {
          key,
          userId,
          endpoint: '/api/v1/sales/confirm',
          requestHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          responseStatus: 201,
          responseBody: {},
          expiresAt,
        },
      })
    ).rejects.toThrow();
  });
});
