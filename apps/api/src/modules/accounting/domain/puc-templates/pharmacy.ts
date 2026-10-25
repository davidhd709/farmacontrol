import type { AccountingPurpose, AccountType } from '@farmacia/contracts';

/** Cuenta de una plantilla PUC: el padre se deduce del código (jerarquía del PUC). */
export interface PucTemplateAccount {
  code: string;
  name: string;
  type: AccountType;
  /** Solo las subcuentas son imputables */
  allowsMovement: boolean;
  /** Propósito contable que la plantilla mapea a esta subcuenta */
  purpose?: AccountingPurpose;
}

export interface PucTemplate {
  code: 'PHARMACY';
  name: string;
  legalBasis: string;
  accounts: PucTemplateAccount[];
}

const group = (code: string, name: string, type: AccountType): PucTemplateAccount => ({
  code,
  name,
  type,
  allowsMovement: false,
});
const leaf = (
  code: string,
  name: string,
  type: AccountType,
  purpose?: AccountingPurpose,
): PucTemplateAccount => ({ code, name, type, allowsMovement: true, purpose });

/**
 * Plantilla PUC del perfil farmacia (ADR-006, F7). Clases, grupos y cuentas son los del PUC
 * comercial; las subcuentas de seis dígitos son una propuesta del producto que la contadora
 * puede reemplazar: aplicar la plantilla nunca sobrescribe cuentas ni mapeos existentes.
 */
export const PHARMACY_PUC_TEMPLATE: PucTemplate = {
  code: 'PHARMACY',
  name: 'Droguería / farmacia (PUC comercial)',
  legalBasis: 'Decreto 2650 de 1993 (PUC para comerciantes)',
  accounts: [
    group('1', 'Activo', 'ASSET'),
    group('11', 'Disponible', 'ASSET'),
    group('1105', 'Caja', 'ASSET'),
    leaf('110505', 'Caja general', 'ASSET', 'CASH'),
    group('1110', 'Bancos', 'ASSET'),
    leaf('111005', 'Bancos moneda nacional', 'ASSET', 'BANK'),
    group('13', 'Deudores', 'ASSET'),
    group('1305', 'Clientes', 'ASSET'),
    leaf('130505', 'Clientes nacionales', 'ASSET', 'CUSTOMERS'),
    group('1355', 'Anticipo de impuestos y contribuciones o saldos a favor', 'ASSET'),
    leaf('135595', 'Anticipo de impuestos, otros', 'ASSET', 'SIMPLE_TAX_ADVANCE'),
    group('14', 'Inventarios', 'ASSET'),
    group('1435', 'Mercancías no fabricadas por la empresa', 'ASSET'),
    leaf('143501', 'Mercancías para la venta', 'ASSET', 'INVENTORY'),

    group('2', 'Pasivo', 'LIABILITY'),
    group('22', 'Proveedores', 'LIABILITY'),
    group('2205', 'Nacionales', 'LIABILITY'),
    leaf('220505', 'Proveedores nacionales', 'LIABILITY', 'SUPPLIERS'),
    group('23', 'Cuentas por pagar', 'LIABILITY'),
    group('2365', 'Retención en la fuente', 'LIABILITY'),
    leaf('236540', 'Retención en la fuente por compras', 'LIABILITY', 'WITHHOLDING_INCOME_PAYABLE'),
    group('2367', 'Impuesto a las ventas retenido', 'LIABILITY'),
    leaf('236705', 'Retención de IVA practicada', 'LIABILITY', 'WITHHOLDING_VAT_PAYABLE'),
    group('2368', 'Impuesto de industria y comercio retenido', 'LIABILITY'),
    leaf('236805', 'Retención de ICA practicada', 'LIABILITY', 'WITHHOLDING_ICA_PAYABLE'),
    group('24', 'Impuestos, gravámenes y tasas', 'LIABILITY'),
    group('2408', 'Impuesto sobre las ventas por pagar', 'LIABILITY'),
    leaf('240801', 'IVA generado en ventas', 'LIABILITY', 'VAT_OUTPUT'),
    leaf('240802', 'IVA descontable en compras (DB)', 'LIABILITY', 'VAT_INPUT'),
    leaf('240803', 'IVA descontable proporcional (DB)', 'LIABILITY', 'VAT_INPUT_COMMON'),
    group('2495', 'Otros impuestos', 'LIABILITY'),
    leaf('249505', 'Impuesto nacional al consumo por pagar', 'LIABILITY', 'INC_PAYABLE'),

    group('3', 'Patrimonio', 'EQUITY'),
    group('31', 'Capital social', 'EQUITY'),
    group('3105', 'Capital suscrito y pagado', 'EQUITY'),
    leaf('310505', 'Capital autorizado', 'EQUITY', 'CAPITAL'),
    group('36', 'Resultados del ejercicio', 'EQUITY'),
    group('3605', 'Utilidad del ejercicio', 'EQUITY'),
    leaf('360505', 'Utilidad del ejercicio', 'EQUITY', 'CURRENT_YEAR_RESULT'),
    group('37', 'Resultados de ejercicios anteriores', 'EQUITY'),
    group('3705', 'Utilidades acumuladas', 'EQUITY'),
    leaf('370505', 'Utilidades acumuladas', 'EQUITY', 'RETAINED_EARNINGS'),
    group('3710', 'Pérdidas acumuladas (DB)', 'EQUITY'),
    leaf('371005', 'Pérdidas acumuladas (DB)', 'EQUITY', 'ACCUMULATED_LOSSES'),

    group('4', 'Ingresos', 'INCOME'),
    group('41', 'Operacionales', 'INCOME'),
    group('4135', 'Comercio al por mayor y al por menor', 'INCOME'),
    leaf('413501', 'Venta de mercancías gravadas', 'INCOME', 'SALES_TAXED'),
    leaf('413502', 'Venta de mercancías exentas', 'INCOME', 'SALES_EXEMPT'),
    leaf('413503', 'Venta de mercancías excluidas o sin IVA', 'INCOME', 'SALES_EXCLUDED'),
    group('42', 'No operacionales', 'INCOME'),
    group('4250', 'Recuperaciones', 'INCOME'),
    leaf('425050', 'Sobrantes de inventario', 'INCOME', 'INVENTORY_SURPLUS'),
    group('4175', 'Devoluciones en ventas (DB)', 'INCOME'),
    leaf('417505', 'Devoluciones en ventas (DB)', 'INCOME', 'SALES_RETURNS'),
    leaf('417510', 'Descuentos en ventas (DB)', 'INCOME', 'SALES_DISCOUNTS'),

    group('5', 'Gastos', 'EXPENSE'),
    group('53', 'No operacionales', 'EXPENSE'),
    group('5315', 'Gastos extraordinarios', 'EXPENSE'),
    leaf('531520', 'Impuestos asumidos (IVA no descontable)', 'EXPENSE', 'VAT_NON_DEDUCTIBLE'),
    leaf('531595', 'Faltantes y bajas de inventario', 'EXPENSE', 'INVENTORY_SHRINKAGE'),

    group('6', 'Costos de ventas', 'COST'),
    group('61', 'Costo de ventas y de prestación de servicios', 'COST'),
    group('6135', 'Comercio al por mayor y al por menor', 'COST'),
    leaf('613501', 'Costo de mercancías vendidas', 'COST', 'COST_OF_SALES'),
    leaf('613502', 'Diferencias en costo de inventario', 'COST', 'INVENTORY_COST_VARIANCE'),
  ],
};

export const PUC_TEMPLATES = { PHARMACY: PHARMACY_PUC_TEMPLATE } as const;
