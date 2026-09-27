import { describe, it, expect } from 'vitest';
import { Payable } from '../../src/modules/payables/domain/payable.entity';

describe('Payable Entity (Unit)', () => {
  it('aplica pagos parciales y cierra correctamente', () => {
    const p = new Payable(
      'p-1',
      'purch-1',
      'sup-1',
      200000,
      0,
      200000,
      'PENDIENTE',
      new Date(),
      null,
      new Date(),
      new Date(),
    );

    p.applyPayment(100000);
    expect(p.amountPaid).toBe(100000);
    expect(p.balance).toBe(100000);
    expect(p.status).toBe('PENDIENTE');

    p.applyPayment(100000);
    expect(p.amountPaid).toBe(200000);
    expect(p.balance).toBe(0);
    expect(p.status).toBe('PAGADA');
  });

  it('rechaza pago en cuenta ya PAGADA', () => {
    const p = new Payable(
      'p-2',
      'purch-2',
      'sup-2',
      10000,
      10000,
      0,
      'PAGADA',
      new Date(),
      null,
      new Date(),
      new Date(),
    );

    expect(() => p.applyPayment(1000)).toThrow('estado "PAGADA"');
  });

  it('rechaza pago mayor al saldo pendiente', () => {
    const p = new Payable(
      'p-3',
      'purch-3',
      'sup-3',
      25000,
      0,
      25000,
      'PENDIENTE',
      new Date(),
      null,
      new Date(),
      new Date(),
    );

    expect(() => p.applyPayment(30000)).toThrow('supera el saldo pendiente');
  });

  it('rechaza pago con monto no positivo', () => {
    const p = new Payable(
      'p-4',
      'purch-4',
      'sup-4',
      25000,
      0,
      25000,
      'PENDIENTE',
      new Date(),
      null,
      new Date(),
      new Date(),
    );

    expect(() => p.applyPayment(0)).toThrow('mayor a cero');
    expect(() => p.applyPayment(-100)).toThrow('mayor a cero');
  });
});
