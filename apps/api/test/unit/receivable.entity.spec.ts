import { describe, it, expect } from 'vitest';
import { Receivable } from '../../src/modules/receivables/domain/receivable.entity';

describe('Receivable Entity (Unit)', () => {
  it('calcula correctamente abonos parciales', () => {
    const r = new Receivable(
      'r-1',
      'sale-1',
      'cust-1',
      100000,
      0,
      100000,
      'PENDIENTE',
      new Date(),
      null,
      new Date(),
      new Date(),
    );

    r.applyPayment(40000);
    expect(r.amountPaid).toBe(40000);
    expect(r.balance).toBe(60000);
    expect(r.status).toBe('PENDIENTE');
  });

  it('cambia estado a PAGADA al saldar la deuda', () => {
    const r = new Receivable(
      'r-2',
      'sale-2',
      'cust-2',
      50000,
      0,
      50000,
      'PENDIENTE',
      new Date(),
      null,
      new Date(),
      new Date(),
    );

    r.applyPayment(50000);
    expect(r.status).toBe('PAGADA');
    expect(r.balance).toBe(0);
    expect(r.amountPaid).toBe(50000);
  });

  it('rechaza abono en cuenta ya PAGADA', () => {
    const r = new Receivable(
      'r-3',
      'sale-3',
      'cust-3',
      50000,
      50000,
      0,
      'PAGADA',
      new Date(),
      null,
      new Date(),
      new Date(),
    );

    expect(() => r.applyPayment(1000)).toThrow('estado "PAGADA"');
  });

  it('rechaza abono mayor al saldo pendiente', () => {
    const r = new Receivable(
      'r-4',
      'sale-4',
      'cust-4',
      30000,
      0,
      30000,
      'PENDIENTE',
      new Date(),
      null,
      new Date(),
      new Date(),
    );

    expect(() => r.applyPayment(50000)).toThrow('supera el saldo pendiente');
  });

  it('rechaza abono con monto no positivo o inválido', () => {
    const r = new Receivable(
      'r-5',
      'sale-5',
      'cust-5',
      30000,
      0,
      30000,
      'PENDIENTE',
      new Date(),
      null,
      new Date(),
      new Date(),
    );

    expect(() => r.applyPayment(0)).toThrow('mayor a cero');
    expect(() => r.applyPayment(-500)).toThrow('mayor a cero');
  });
});
