import { describe, expect, it } from 'vitest';
import {
  companyTaxStatus,
  partyTaxStatus,
  perMilOf,
  percentOf,
  purchaseTaxes,
  saleLineTaxes,
  TaxClassificationMissingError,
  uvtToCents,
  type WithholdingRuleRef,
} from '../../src/modules/taxes/domain/tax-engine';

const IVA_19 = { code: 'IVA_19', treatment: 'GRAVADO', ratePct: '19.0000' };
const IVA_EXCLUIDO = { code: 'IVA_EXCLUIDO', treatment: 'EXCLUIDO', ratePct: '0.0000' };
const INC_8 = { code: 'INC_8', treatment: null, ratePct: '8.0000' };
const RTF: WithholdingRuleRef[] = [
  {
    code: 'RTF_COMPRAS_DECL',
    treatment: null,
    ratePct: '2.5000',
    appliesTo: 'GOODS',
    payeeCondition: 'DECLARANT',
    minBaseUvt: '27.00',
  },
  {
    code: 'RTF_COMPRAS_NODECL',
    treatment: null,
    ratePct: '3.5000',
    appliesTo: 'GOODS',
    payeeCondition: 'NON_DECLARANT',
    minBaseUvt: '27.00',
  },
  {
    code: 'RTF_SERVICIOS_DECL',
    treatment: null,
    ratePct: '4.0000',
    appliesTo: 'SERVICES',
    payeeCondition: 'DECLARANT',
    minBaseUvt: '4.00',
  },
];
const RETEIVA = { code: 'RETEIVA_15', treatment: null, ratePct: '15.0000' };
const UVT_2026 = '52374.00';

const responsible = companyTaxStatus({
  responsibilities: ['48'],
  icaWithholdingAgent: false,
  icaRatePerMil: null,
});
const supplier = partyTaxStatus({ taxResponsibilities: ['48'], isIncomeTaxDeclarant: true });

describe('motor tributario: cálculos base', () => {
  it('calcula porcentajes, por mil y bases en UVT al centavo', () => {
    expect(percentOf(100000n, '19.0000')).toBe(19000n);
    expect(percentOf(333n, '2.5000')).toBe(8n);
    expect(perMilOf(1000000n, '9.660')).toBe(9660n);
    expect(uvtToCents(UVT_2026, '27.00')).toBe(141409800n);
  });

  it('deriva el estado fiscal de las responsabilidades del RUT', () => {
    expect(
      companyTaxStatus({
        responsibilities: ['48', '13'],
        icaWithholdingAgent: true,
        icaRatePerMil: '9.66',
      }),
    ).toEqual({
      vatResponsible: true,
      withholdsIncome: true,
      withholdsVat: true,
      withholdsIca: true,
      icaRatePerMil: '9.66',
    });
    const simple = companyTaxStatus({
      responsibilities: ['47', '49'],
      icaWithholdingAgent: false,
      icaRatePerMil: null,
    });
    expect(simple.vatResponsible).toBe(false);
    expect(simple.withholdsIncome).toBe(false);
  });
});

describe('motor tributario: venta', () => {
  it('aplica IVA e INC con su instantánea', () => {
    const result = saleLineTaxes({
      day: '2026-10-25',
      productName: 'X',
      subtotalCents: 100000n,
      company: responsible,
      iva: IVA_19,
      inc: INC_8,
    });
    expect(result).toMatchObject({ ivaRate: 19, incRate: 8, treatment: 'GRAVADO' });
    expect(result.snapshot.items.map((i) => [i.taxType, i.amount])).toEqual([
      ['IVA', '190.00'],
      ['INC', '80.00'],
    ]);
  });

  it('no aplica un 0 % implícito: sin clasificación la venta se bloquea', () => {
    expect(() =>
      saleLineTaxes({
        day: '2026-10-25',
        productName: 'Jarabe',
        subtotalCents: 1000n,
        company: responsible,
        iva: null,
        inc: null,
      }),
    ).toThrow(TaxClassificationMissingError);
  });

  it('una empresa no responsable no cobra IVA aunque el producto sea gravado', () => {
    const notResponsible = companyTaxStatus({
      responsibilities: ['49'],
      icaWithholdingAgent: false,
      icaRatePerMil: null,
    });
    const result = saleLineTaxes({
      day: '2026-10-25',
      productName: 'X',
      subtotalCents: 1000n,
      company: notResponsible,
      iva: IVA_19,
      inc: null,
    });
    expect(result).toMatchObject({ ivaRate: 0, treatment: 'NO_RESPONSABLE' });
    expect(result.snapshot.items).toEqual([]);
  });

  it('un producto excluido queda con tratamiento EXCLUIDO y sin IVA', () => {
    const result = saleLineTaxes({
      day: '2026-10-25',
      productName: 'X',
      subtotalCents: 1000n,
      company: responsible,
      iva: IVA_EXCLUIDO,
      inc: null,
    });
    expect(result).toMatchObject({ ivaRate: 0, treatment: 'EXCLUIDO' });
  });
});

describe('motor tributario: compra', () => {
  const base = {
    day: '2026-10-25',
    withholdingRules: RTF,
    vatWithholdingRule: RETEIVA,
    uvtValue: UVT_2026,
  };
  const goods = (subtotalCents: bigint, iva = IVA_19) => ({
    key: 'l1',
    productName: 'Producto',
    subtotalCents,
    nature: 'GOODS' as const,
    iva,
  });

  it('IVA descontable y retención en la fuente sobre la base que supera 27 UVT', () => {
    const result = purchaseTaxes({
      ...base,
      lines: [goods(200000000n)],
      supplier,
      company: responsible,
    });
    expect(result.vatCents).toBe(38000000n);
    expect(result.vatDeductible).toBe(true);
    expect(result.withholdingIncomeCents).toBe(5000000n);
    expect(result.withholdingVatCents).toBe(0n);
  });

  it('por debajo de la base mínima no hay retención', () => {
    const result = purchaseTaxes({
      ...base,
      lines: [goods(100000000n)],
      supplier,
      company: responsible,
    });
    expect(result.withholdingIncomeCents).toBe(0n);
  });

  it('gran contribuyente practica ReteIVA, salvo a otro gran contribuyente', () => {
    const large = companyTaxStatus({
      responsibilities: ['48', '13'],
      icaWithholdingAgent: true,
      icaRatePerMil: '9.66',
    });
    const result = purchaseTaxes({ ...base, lines: [goods(200000000n)], supplier, company: large });
    expect(result.withholdingVatCents).toBe(5700000n);
    expect(result.withholdingIcaCents).toBe(1932000n);
    const largeSupplier = partyTaxStatus({
      taxResponsibilities: ['48', '13'],
      isIncomeTaxDeclarant: true,
    });
    expect(
      purchaseTaxes({
        ...base,
        lines: [goods(200000000n)],
        supplier: largeSupplier,
        company: large,
      }).withholdingVatCents,
    ).toBe(0n);
  });

  it('a un autorretenedor no se le practica retención en la fuente; a un no declarante, la tarifa mayor', () => {
    const selfWithholder = partyTaxStatus({
      taxResponsibilities: ['48', '15'],
      isIncomeTaxDeclarant: true,
    });
    expect(
      purchaseTaxes({
        ...base,
        lines: [goods(200000000n)],
        supplier: selfWithholder,
        company: responsible,
      }).withholdingIncomeCents,
    ).toBe(0n);
    const nonDeclarant = partyTaxStatus({
      taxResponsibilities: ['49'],
      isIncomeTaxDeclarant: false,
    });
    const result = purchaseTaxes({
      ...base,
      lines: [goods(200000000n)],
      supplier: nonDeclarant,
      company: responsible,
    });
    expect(result.vatCents).toBe(0n);
    expect(result.withholdingIncomeCents).toBe(7000000n);
  });

  it('un proveedor responsable exige la clasificación de compra del producto', () => {
    expect(() =>
      purchaseTaxes({
        ...base,
        lines: [{ ...goods(1000n), iva: null }],
        supplier,
        company: responsible,
      }),
    ).toThrow(TaxClassificationMissingError);
  });

  it('una empresa no responsable lleva el IVA como mayor costo', () => {
    const notResponsible = companyTaxStatus({
      responsibilities: ['49'],
      icaWithholdingAgent: false,
      icaRatePerMil: null,
    });
    expect(
      purchaseTaxes({ ...base, lines: [goods(1000n)], supplier, company: notResponsible })
        .vatDeductible,
    ).toBe(false);
  });
});
