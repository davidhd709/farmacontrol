import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InventoryLotDto, ProductDto, PurchaseDto, SaleDto } from '@farmacia/contracts';
import { createReceivePurchaseSchema } from '../src/features/purchases/validation/receive-purchase.schema';
import { createDebitNoteSchema } from '../src/features/purchases/validation/debit-note.schema';
import { createCreditNoteSchema } from '../src/features/sales/validation/credit-note.schema';
import { createAdjustInventorySchema } from '../src/features/inventory/validation/adjust-inventory.schema';

const products = [
  {
    id: 'product',
    inventoryControlMode: 'LOT_EXPIRY',
    presentations: [{ id: 'box', conversionFactor: 10 }],
  },
  { id: 'simple', inventoryControlMode: 'SIMPLE', presentations: [] },
  { id: 'lot', inventoryControlMode: 'LOT', presentations: [] },
  {
    id: 'serial',
    inventoryControlMode: 'SERIAL',
    presentations: [{ id: 'pair', conversionFactor: 2 }],
  },
  { id: 'service', inventoryControlMode: 'SERVICE', presentations: [] },
] as unknown as ProductDto[];
const validPurchase = {
  supplierId: 'supplier',
  invoiceNumber: ' fac-1 ',
  purchaseDate: '2026-01-01',
  dueDate: '2026-01-31',
  paymentCondition: 'CREDITO' as const,
  creditDays: '30',
  notes: '',
  lines: [
    {
      productId: 'product',
      presentationId: 'box',
      quantityCommercial: '0.5',
      unitCost: '10.25',
      lotNumber: ' lote ',
      expirationDate: '2099-12-31',
      serialNumbers: '',
    },
  ],
};
const purchaseSchema = createReceivePurchaseSchema(products);

describe('Esquema de recepción', () => {
  afterEach(() => vi.useRealTimers());
  it('acepta una recepción válida sin transformar los valores del formulario', () => {
    expect(purchaseSchema.parse(validPurchase)).toEqual(validPurchase);
  });
  it.each(['supplierId', 'invoiceNumber', 'purchaseDate', 'dueDate'] as const)(
    'requiere %s',
    (field) => {
      expect(purchaseSchema.safeParse({ ...validPurchase, [field]: '' }).success).toBe(false);
    },
  );
  it('requiere al menos una línea y vencimiento de factura no anterior a emisión', () => {
    expect(purchaseSchema.safeParse({ ...validPurchase, lines: [] }).success).toBe(false);
    expect(purchaseSchema.safeParse({ ...validPurchase, dueDate: '2025-12-31' }).success).toBe(
      false,
    );
    expect(
      purchaseSchema.safeParse({ ...validPurchase, dueDate: validPurchase.purchaseDate }).success,
    ).toBe(true);
  });
  it.each([
    ['productId', ''],
    ['lotNumber', '  '],
    ['expirationDate', ''],
    ['expirationDate', '2020-01-01'],
    ['quantityCommercial', '0'],
    ['quantityCommercial', '-1'],
    ['quantityCommercial', 'abc'],
    ['quantityCommercial', 'Infinity'],
    ['quantityCommercial', '0.15'],
    ['unitCost', ''],
    ['unitCost', '-1'],
    ['unitCost', '1.001'],
    ['unitCost', 'NaN'],
  ])('rechaza %s = %s', (field, value) => {
    expect(
      purchaseSchema.safeParse({
        ...validPurchase,
        lines: [{ ...validPurchase.lines[0], [field]: value }],
      }).success,
    ).toBe(false);
  });
  describe('lote, vencimiento y series según el modo del producto', () => {
    const line = (overrides: Record<string, string>) => ({
      ...validPurchase,
      lines: [
        {
          ...validPurchase.lines[0],
          presentationId: '',
          quantityCommercial: '2',
          lotNumber: '',
          expirationDate: '',
          ...overrides,
        },
      ],
    });
    const ok = (overrides: Record<string, string>) =>
      purchaseSchema.safeParse(line(overrides)).success;

    it('SIMPLE no exige lote ni vencimiento', () => {
      expect(ok({ productId: 'simple' })).toBe(true);
    });
    it('LOT exige lote pero no vencimiento', () => {
      expect(ok({ productId: 'lot' })).toBe(false);
      expect(ok({ productId: 'lot', lotNumber: 'L-1' })).toBe(true);
    });
    it('LOT_EXPIRY exige lote y vencimiento', () => {
      expect(ok({ productId: 'product', lotNumber: 'L-1' })).toBe(false);
      expect(ok({ productId: 'product', expirationDate: '2099-12-31' })).toBe(false);
    });
    it('SERIAL exige una serie distinta por unidad base y solo en la unidad base', () => {
      expect(ok({ productId: 'serial', serialNumbers: 'S-1' })).toBe(false);
      expect(ok({ productId: 'serial', serialNumbers: 's-1, S-1' })).toBe(false);
      expect(ok({ productId: 'serial', serialNumbers: 'S-1\nS-2' })).toBe(true);
      expect(
        ok({
          productId: 'serial',
          presentationId: 'pair',
          quantityCommercial: '1',
          serialNumbers: 'S-1,S-2',
        }),
      ).toBe(false);
    });
    it('SERVICE no se recibe como inventario', () => {
      expect(ok({ productId: 'service' })).toBe(false);
    });
  });
  it('acepta costo cero y avisa fracciones de unidad base sin presentación', () => {
    expect(
      purchaseSchema.safeParse({
        ...validPurchase,
        lines: [{ ...validPurchase.lines[0], unitCost: '0' }],
      }).success,
    ).toBe(true);
    expect(
      purchaseSchema.safeParse({
        ...validPurchase,
        lines: [{ ...validPurchase.lines[0], presentationId: '', quantityCommercial: '0.5' }],
      }).success,
    ).toBe(false);
  });
  it.each([
    ['mediodía', '2026-10-18T17:00:00Z'],
    ['8 p. m. en Bogotá, ya 19 de octubre en UTC', '2026-10-19T01:00:00Z'],
  ])('acepta vencimientos desde mañana según el día de Bogotá (%s)', (_label, now) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    const parse = (date: string) =>
      purchaseSchema.safeParse({
        ...validPurchase,
        purchaseDate: '2099-01-01',
        dueDate: '2099-01-31',
        lines: [{ ...validPurchase.lines[0], expirationDate: date }],
      }).success;
    expect(parse('2026-10-17')).toBe(false);
    expect(parse('2026-10-18')).toBe(false);
    expect(parse('2026-10-19')).toBe(true);
    expect(parse('2026-10-20')).toBe(true);
  });
});

const noteLines = [{ id: 'line', quantityCommercial: '5' }] as PurchaseDto['lines'];
const saleLines = [{ id: 'line', quantityCommercial: 5 }] as SaleDto['lines'];
for (const [name, schema, extra] of [
  ['débito', createDebitNoteSchema(noteLines), {}],
  ['crédito', createCreditNoteSchema(saleLines), { restock: true, refundMethod: 'EFECTIVO' }],
] as const) {
  describe(`Esquema nota ${name}`, () => {
    const valid = { quantities: { line: '2' }, reason: '  Devolución  ', ...extra };
    it('acepta una devolución válida sin transformar los valores', () =>
      expect(schema.parse(valid)).toEqual(valid));
    it.each(['', '  ', 'abcd'])('rechaza motivo insuficiente: %s', (reason) =>
      expect(schema.safeParse({ ...valid, reason }).success).toBe(false),
    );
    it.each(['', '0', '-1', '6', 'NaN', 'Infinity'])(
      'rechaza cantidades inválidas: %s',
      (quantity) =>
        expect(schema.safeParse({ ...valid, quantities: { line: quantity } }).success).toBe(false),
    );
    it('requiere una línea positiva y permite cantidades comerciales fraccionarias dentro del límite', () => {
      expect(schema.safeParse({ ...valid, quantities: {} }).success).toBe(false);
      expect(schema.safeParse({ ...valid, quantities: { line: '0.5' } }).success).toBe(true);
    });
  });
}

describe('Esquema de ajuste de inventario', () => {
  const schema = createAdjustInventorySchema([
    { id: 'lot', productId: 'product', currentQuantity: 5 },
  ] as InventoryLotDto[]);
  const valid = {
    productId: 'product',
    lotId: 'lot',
    adjustmentType: 'DECREMENTO',
    quantity: 3,
    reason: ' Conteo ',
    notes: '',
  };
  it('acepta un ajuste válido sin transformar los valores', () =>
    expect(schema.parse(valid)).toEqual(valid));
  it.each([
    ['productId', ''],
    ['lotId', ''],
    ['reason', '  '],
    ['quantity', 0],
    ['quantity', -1],
    ['quantity', 1.5],
    ['quantity', NaN],
    ['quantity', Infinity],
    ['quantity', 6],
    ['reason', 'a'.repeat(251)],
    ['notes', 'a'.repeat(501)],
  ])('rechaza %s inválido', (field, value) =>
    expect(schema.safeParse({ ...valid, [field]: value }).success).toBe(false),
  );
  it('permite agotar el saldo y conserva los límites de motivo y notas', () => {
    expect(
      schema.safeParse({ ...valid, quantity: 5, reason: 'a'.repeat(250), notes: 'a'.repeat(500) })
        .success,
    ).toBe(true);
    expect(schema.safeParse({ ...valid, adjustmentType: 'INCREMENTO', quantity: 6 }).success).toBe(
      true,
    );
  });
});
