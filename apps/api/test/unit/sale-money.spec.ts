import { describe, it, expect } from 'vitest';
import { Sale, SaleLine } from '../../src/modules/sales/domain/sale.entity';
import {
  lineGrossCents,
  moneyToCents,
  percentageOfCents,
  quantityToHundredths,
  SaleMoneyError,
} from '../../src/modules/sales/domain/sale-money';

/**
 * AUD-010: los montos de la venta se calculan en centavos enteros, sin acumular
 * errores de coma flotante.
 */
describe('Aritmética monetaria de ventas en centavos (AUD-010)', () => {
  const baseLine = { saleId: 'sale-1', productId: 'prod-1' };

  it('convierte valores con dos decimales sin error de redondeo', () => {
    expect(moneyToCents(0.1)).toBe(10n);
    expect(moneyToCents(1234.56)).toBe(123456n);
    expect(moneyToCents(19.99)).toBe(1999n);
    expect(quantityToHundredths(1.15)).toBe(115n);
  });

  it('rechaza más de dos decimales, negativos y valores no numéricos', () => {
    expect(() => moneyToCents(0.123)).toThrow(SaleMoneyError);
    expect(() => moneyToCents(-1)).toThrow(SaleMoneyError);
    expect(() => moneyToCents(Number.NaN)).toThrow(SaleMoneyError);
  });

  it('calcula bruto e IVA redondeando a la mitad hacia arriba', () => {
    // 1.5 × 333.33 = 499.995 → 500.00
    expect(lineGrossCents(150n, 33333n)).toBe(50000n);
    // 19 % de 0.05 = 0.0095 → 0.01
    expect(percentageOfCents(5n, 19)).toBe(1n);
    // 19 % de 10 000 = 1 900
    expect(percentageOfCents(1000000n, 19)).toBe(190000n);
  });

  it('una línea de 3 × 0.10 vale exactamente 0.30', () => {
    const line = SaleLine.create({ ...baseLine, quantityCommercial: 3, unitPrice: 0.1 });
    expect(line.subtotal).toBe(0.3);
    expect(line.total).toBe(0.3);
  });

  it('la suma de muchas líneas pequeñas es exacta', () => {
    const lines = Array.from({ length: 10 }, () =>
      SaleLine.create({ ...baseLine, quantityCommercial: 1, unitPrice: 0.1 }),
    );
    const sale = Sale.create({
      invoiceNumber: 'FV-1',
      customerId: 'c-1',
      paymentMethod: 'EFECTIVO',
      lines,
      amountPaid: 1,
      createdById: 'u-1',
    });
    expect(sale.total).toBe(1);
    expect(sale.changeGiven).toBe(0);
  });

  it('aplica descuento e IVA sobre el neto', () => {
    const line = SaleLine.create({
      ...baseLine,
      quantityCommercial: 2,
      unitPrice: 10000,
      discount: 1000,
      taxRate: 19,
    });
    expect(line.subtotal).toBe(19000);
    expect(line.taxAmount).toBe(3610);
    expect(line.total).toBe(22610);
  });

  it('rechaza un descuento mayor que el valor de la línea en lugar de recortarlo a cero', () => {
    expect(() =>
      SaleLine.create({ ...baseLine, quantityCommercial: 1, unitPrice: 1000, discount: 1500 }),
    ).toThrow('El descuento no puede superar el valor de la línea');
  });

  it('el efectivo insuficiente se detecta por centavos', () => {
    const line = SaleLine.create({ ...baseLine, quantityCommercial: 3, unitPrice: 0.1 });
    expect(() =>
      Sale.create({
        invoiceNumber: 'FV-2',
        customerId: 'c-1',
        paymentMethod: 'EFECTIVO',
        lines: [line],
        amountPaid: 0.29,
        createdById: 'u-1',
      }),
    ).toThrow('no cubre el valor total');
  });
});
