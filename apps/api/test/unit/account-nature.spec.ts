import { describe, expect, it } from 'vitest';
import {
  balanceByNature,
  defaultAccountNature,
  inferAccountNature,
} from '../../src/modules/accounting/domain/accounting-rules';

describe('Naturaleza de las cuentas (acuerdo del 4 de octubre)', () => {
  it('activos, costos y gastos son débito; pasivos, patrimonio e ingresos son crédito', () => {
    expect(defaultAccountNature('ASSET')).toBe('DEBIT');
    expect(defaultAccountNature('COST')).toBe('DEBIT');
    expect(defaultAccountNature('EXPENSE')).toBe('DEBIT');
    expect(defaultAccountNature('LIABILITY')).toBe('CREDIT');
    expect(defaultAccountNature('EQUITY')).toBe('CREDIT');
    expect(defaultAccountNature('INCOME')).toBe('CREDIT');
  });

  it('4175 es débito por el sufijo (DB) y sus subcuentas lo heredan', () => {
    const parent = inferAccountNature({
      code: '4175',
      name: 'DEVOLUCIONES, REBAJAS Y DESCUENTOS EN VENTAS (DB) ',
      type: 'INCOME',
      parentNature: 'CREDIT',
    });
    expect(parent).toBe('DEBIT');
    expect(
      inferAccountNature({
        code: '417506',
        name: 'DESCUENTOS CONDICIONADOS',
        type: 'INCOME',
        parentNature: parent,
      }),
    ).toBe('DEBIT');
  });

  it('las correctoras del activo son crédito aunque el padre sea débito', () => {
    expect(
      inferAccountNature({ code: '1592', name: 'DEPRECIACION ACUMULADA', type: 'ASSET', parentNature: 'DEBIT' }),
    ).toBe('CREDIT');
    expect(
      inferAccountNature({ code: '1399', name: 'PROVISIONES', type: 'ASSET', parentNature: 'DEBIT' }),
    ).toBe('CREDIT');
    expect(
      inferAccountNature({ code: '110505', name: 'CAJA GENERAL', type: 'ASSET', parentNature: 'DEBIT' }),
    ).toBe('DEBIT');
  });

  it('el sufijo (CR) gana sobre el tipo', () => {
    expect(
      inferAccountNature({
        code: '6225',
        name: 'DEVOLUCIONES REBAJAS Y DESCUENTOS EN COMPRAS (CR) ',
        type: 'COST',
      }),
    ).toBe('CREDIT');
  });

  it('el saldo es positivo cuando la cuenta está en su lado normal', () => {
    expect(balanceByNature('DEBIT', 500n, 200n)).toBe(300n);
    expect(balanceByNature('CREDIT', 500n, 200n)).toBe(-300n);
  });
});
