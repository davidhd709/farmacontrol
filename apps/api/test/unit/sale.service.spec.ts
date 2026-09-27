import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Sale, SaleLine, SaleLotAllocation } from '../../src/modules/sales/domain/sale.entity';
import { SaleAlreadyCancelledException } from '../../src/modules/sales/domain/sale.exceptions';

describe('Sale Domain Entities & Business Rules (Unit)', () => {
  describe('SaleLine', () => {
    it('calcula correctamente subtotal, impuesto y total de la línea', () => {
      const line = SaleLine.create({
        saleId: 'sale-1',
        productId: 'prod-1',
        productName: 'Ibuprofeno 400mg',
        quantityCommercial: 3,
        unitPrice: 5000,
        discount: 1000,
        taxRate: 19,
      });

      // 3 * 5000 = 15000 - 1000 (descuento) = 14000 subtotal
      expect(line.subtotal).toBe(14000);
      // 14000 * 0.19 = 2660 impuesto
      expect(line.taxAmount).toBe(2660);
      // 14000 + 2660 = 16660 total
      expect(line.total).toBe(16660);
      expect(line.quantityBaseUnits).toBe(3);
    });

    it('calcula unidades base multiplicando por el factor de conversión histórico', () => {
      const line = SaleLine.create({
        saleId: 'sale-1',
        productId: 'prod-1',
        presentationFactorHistorical: 10,
        quantityCommercial: 2.5,
        unitPrice: 20000,
      });

      // 2.5 * 10 = 25 unidades base
      expect(line.quantityBaseUnits).toBe(25);
    });

    it('rechaza cantidades menores o iguales a cero', () => {
      expect(() =>
        SaleLine.create({
          saleId: 'sale-1',
          productId: 'prod-1',
          quantityCommercial: 0,
          unitPrice: 1000,
        })
      ).toThrow('La cantidad vendida debe ser mayor a cero');
    });
  });

  describe('Sale', () => {
    it('calcula los totales agregados de todas sus líneas y el cambio en efectivo', () => {
      const line1 = SaleLine.create({
        saleId: 'sale-1',
        productId: 'prod-1',
        quantityCommercial: 2,
        unitPrice: 5000,
      }); // total 10000

      const line2 = SaleLine.create({
        saleId: 'sale-1',
        productId: 'prod-2',
        quantityCommercial: 1,
        unitPrice: 15000,
      }); // total 15000

      const sale = Sale.create({
        invoiceNumber: 'FAC-000001',
        customerId: 'cust-1',
        paymentMethod: 'EFECTIVO',
        lines: [line1, line2],
        amountPaid: 30000,
        createdById: 'user-1',
      });

      expect(sale.total).toBe(25000);
      expect(sale.amountPaid).toBe(30000);
      expect(sale.changeGiven).toBe(5000);
      expect(sale.status).toBe('COMPLETED');
    });

    it('rechaza ventas en efectivo cuando el monto pagado es insuficiente', () => {
      const line = SaleLine.create({
        saleId: 'sale-1',
        productId: 'prod-1',
        quantityCommercial: 1,
        unitPrice: 10000,
      });

      expect(() =>
        Sale.create({
          invoiceNumber: 'FAC-000002',
          customerId: 'cust-1',
          paymentMethod: 'EFECTIVO',
          lines: [line],
          amountPaid: 8000, // Menor a 10000
          createdById: 'user-1',
        })
      ).toThrow('El monto recibido ($8000) no cubre el valor total de la venta ($10000)');
    });

    it('permite anular una venta activa y rechaza volver a anularla', () => {
      const line = SaleLine.create({
        saleId: 'sale-1',
        productId: 'prod-1',
        quantityCommercial: 1,
        unitPrice: 5000,
      });

      const sale = Sale.create({
        invoiceNumber: 'FAC-000003',
        customerId: 'cust-1',
        paymentMethod: 'EFECTIVO',
        lines: [line],
        createdById: 'user-1',
      });

      expect(sale.status).toBe('COMPLETED');
      sale.cancel();
      expect(sale.status).toBe('CANCELLED');

      expect(() => sale.cancel()).toThrow('La venta ya se encuentra anulada');
    });
  });
});
