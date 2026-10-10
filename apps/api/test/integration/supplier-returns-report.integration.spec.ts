import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { cleanTestDatabase, prisma } from '@farmacia/database';
import { AppModule } from '../../src/app.module';
import { ReportsService } from '../../src/modules/reports/application/reports.service';

/** Lotes por vencer para avisar al proveedor (120 a 110 días) y devolver antes de 90 días. */
describe('Reporte de devoluciones a proveedor por vencimiento', () => {
  let app: INestApplication;
  let reports: ReportsService;
  const reference = '2026-10-10';

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
    reports = module.get(ReportsService);
  }, 45000);

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
  });

  const inDays = (days: number) => new Date(Date.parse(`${reference}T00:00:00Z`) + days * 86_400_000);

  it('clasifica los lotes por la ventana de aviso y muestra el proveedor de la última compra', async () => {
    const user = await prisma.user.create({ data: { username: 'compras_dev', passwordHash: 'x' } });
    const location = await prisma.location.create({ data: { code: 'BOD', name: 'Bodega', isDefault: true } });
    const category = await prisma.category.create({ data: { name: 'Antibióticos' } });
    const product = await prisma.product.create({
      data: { code: 'AMX-500', name: 'Amoxicilina 500 mg', categoryId: category.id, basePrice: 1000, baseCost: 500 },
    });
    const viejo = await prisma.supplier.create({ data: { taxId: '800111', name: 'Proveedor anterior' } });
    const actual = await prisma.supplier.create({ data: { taxId: '900222', name: 'Drogas del Caribe', phone: '6053334455' } });

    const lot = (lotNumber: string, days: number, currentQuantity = 10) =>
      prisma.inventoryLot.create({
        data: { productId: product.id, locationId: location.id, lotNumber, expirationDate: inDays(days), currentQuantity },
      });
    const avisar = await lot('L-120', 120);
    await lot('L-110', 110);
    await lot('L-100', 100);
    await lot('L-090', 90);
    await lot('L-121', 121);
    await lot('L-VENCIDO', 0);
    await lot('L-SIN-STOCK', 115, 0);

    // El lote L-120 llegó en dos compras: manda la más reciente
    for (const [supplier, invoice, date] of [
      [viejo, 'F-OLD', '2026-01-10'],
      [actual, 'F-NEW', '2026-06-01'],
    ] as const) {
      const purchase = await prisma.purchase.create({
        data: { supplierId: supplier.id, invoiceNumber: invoice, status: 'RECEIVED', purchaseDate: new Date(date), totalAmount: 5000, receivedByUserId: user.id },
      });
      await prisma.purchaseLine.create({
        data: {
          purchaseId: purchase.id, productId: product.id, lotId: avisar.id, quantityCommercial: 10, quantityBaseUnits: 10,
          unitCost: 500, subtotal: 5000, lotNumber: 'L-120', expirationDate: inDays(120),
        },
      });
    }

    const report = await reports.getSupplierReturnsReport(reference);
    expect(report.items.map((i) => [i.lotNumber, i.status])).toEqual([
      ['L-090', 'FUERA_DE_PLAZO'],
      ['L-100', 'AVISO_ATRASADO'],
      ['L-110', 'AVISAR_AHORA'],
      ['L-120', 'AVISAR_AHORA'],
    ]);
    expect(report.notifyNowCount).toBe(2);
    expect(report.lateNoticeCount).toBe(1);
    expect(report.outOfWindowCount).toBe(1);
    const l120 = report.items.find((i) => i.lotNumber === 'L-120')!;
    expect(l120).toMatchObject({ supplierName: 'Drogas del Caribe', supplierPhone: '6053334455', lastPurchaseInvoice: 'F-NEW', daysRemaining: 120 });
    expect(report.items.find((i) => i.lotNumber === 'L-110')!.supplierName).toBeNull();

    const csv = reports.exportSupplierReturnsCsv(report);
    expect(csv).toContain('Estado,Proveedor,Teléfono');
    expect(csv).toContain('Avisar al proveedor,Drogas del Caribe');
  });
});
