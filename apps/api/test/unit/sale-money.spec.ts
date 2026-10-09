import { describe, it, expect } from 'vitest';
import { Sale, SaleLine } from '../../src/modules/sales/domain/sale.entity';

/**
 * AUD-010: los importes de la venta se calculan en centavos exactos, no con
 * aritmética de coma flotante.
 */
describe('Dinero de la venta en centavos exactos', () => {
  const line = (overrides: Partial<Parameters<typeof SaleLine.create>[0]> = {}) =>
    SaleLine.create({
      saleId: 'sale',
      productId: 'product',
      quantityCommercial: 1,
      unitPrice: 1000,
      ...overrides,
    });

  it('subtotal exacto: 3 x 0.10 = 0.30', () => {
    expect(line({ quantityCommercial: 3, unitPrice: 0.1 }).subtotal).toBe(0.3);
  });

  it('IVA con redondeo half-up al centavo: 19% de 10.50 = 2.00', () => {
    const l = line({ unitPrice: 10.5, taxRate: 19 });
    expect(l.taxAmount).toBe(2);
    expect(l.total).toBe(12.5);
  });

  it('cantidad fraccionaria redondea el subtotal al centavo: 1.5 x 333.33 = 500.00', () => {
    const l = line({ quantityCommercial: 1.5, unitPrice: 333.33, presentationFactorHistorical: 2 });
    expect(l.subtotal).toBe(500);
  });

  it('suma de líneas exacta y un pago en efectivo igual al total es suficiente', () => {
    const sale = Sale.create({
      invoiceNumber: 'V-1',
      customerId: 'c',
      paymentMethod: 'EFECTIVO',
      createdById: 'u',
      lines: [line({ unitPrice: 0.1 }), line({ unitPrice: 0.2 })],
      amountPaid: 0.3,
    });
    expect(sale.total).toBe(0.3);
    expect(sale.changeGiven).toBe(0);
  });

  it('cambio exacto: paga 1.00 por 0.70', () => {
    const sale = Sale.create({
      invoiceNumber: 'V-2',
      customerId: 'c',
      paymentMethod: 'EFECTIVO',
      createdById: 'u',
      lines: [line({ unitPrice: 0.7 })],
      amountPaid: 1,
    });
    expect(sale.changeGiven).toBe(0.3);
  });

  it('rechaza importes con más de dos decimales', () => {
    expect(() => line({ unitPrice: 10.005 })).toThrow(/decimales/);
    expect(() => line({ discount: 0.001 })).toThrow(/decimales/);
  });

  it('rechaza cantidades que no equivalen a unidades base enteras', () => {
    expect(() => line({ quantityCommercial: 0.33, presentationFactorHistorical: 3 })).toThrow(
      /unidades base enteras/,
    );
  });
});
