export const ACCOUNT_TYPES = [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'INCOME',
  'EXPENSE',
  'COST',
  'ORDER_DEBTOR',
  'ORDER_CREDITOR',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Naturaleza: lado por el que aumenta la cuenta. Define el signo de su saldo. */
export const ACCOUNT_NATURES = ['DEBIT', 'CREDIT'] as const;
export type AccountNature = (typeof ACCOUNT_NATURES)[number];

export const ACCOUNTING_PURPOSES = [
  'CASH',
  'BANK',
  'CUSTOMERS',
  'SUPPLIERS',
  'INVENTORY',
  'SALES_TAXED',
  'SALES_EXCLUDED',
  'COST_OF_SALES',
  'VAT_OUTPUT',
  'VAT_INPUT',
  'VAT_INPUT_COMMON',
  'VAT_NON_DEDUCTIBLE',
  'SIMPLE_TAX_ADVANCE',
  'SALES_RETURNS',
  'SALES_DISCOUNTS',
  'CAPITAL',
  'CURRENT_YEAR_RESULT',
  'RETAINED_EARNINGS',
  'ACCUMULATED_LOSSES',
  // Diferencias de costo en devoluciones a proveedor (ADR-006, F3)
  'INVENTORY_COST_VARIANCE',
  // Motor tributario (ADR-006, F6)
  'SALES_EXEMPT',
  'INC_PAYABLE',
  'WITHHOLDING_INCOME_PAYABLE',
  'WITHHOLDING_VAT_PAYABLE',
  'WITHHOLDING_ICA_PAYABLE',
  // Cobertura contable completa (ADR-006, F8)
  'INVENTORY_SHRINKAGE',
  'INVENTORY_SURPLUS',
] as const;
export type AccountingPurpose = (typeof ACCOUNTING_PURPOSES)[number];

/**
 * Catálogo centralizado de nombres en español contable colombiano para cada propósito
 * del motor de contabilización (REQ-007). Los códigos internos (`AccountingPurpose`)
 * se conservan intactos en la base de datos y contratos del API.
 */
export const ACCOUNTING_PURPOSE_LABELS: Record<AccountingPurpose, string> = {
  CASH: 'Caja general',
  BANK: 'Bancos',
  CUSTOMERS: 'Clientes (Cuentas por cobrar)',
  SUPPLIERS: 'Proveedores (Cuentas por pagar)',
  INVENTORY: 'Inventarios de mercancías',
  SALES_TAXED: 'Ingresos por ventas gravadas',
  SALES_EXCLUDED: 'Ingresos por ventas excluidas o sin IVA',
  SALES_EXEMPT: 'Ingresos por ventas exentas',
  COST_OF_SALES: 'Costo de mercancías vendidas',
  VAT_OUTPUT: 'IVA generado en ventas',
  VAT_INPUT: 'IVA descontable en compras',
  VAT_INPUT_COMMON: 'IVA descontable proporcional (uso común)',
  VAT_NON_DEDUCTIBLE: 'IVA no descontable (gasto)',
  SIMPLE_TAX_ADVANCE: 'Anticipo de impuestos / Régimen Simple',
  SALES_RETURNS: 'Devoluciones en ventas',
  SALES_DISCOUNTS: 'Descuentos comerciales en ventas',
  CAPITAL: 'Capital social',
  CURRENT_YEAR_RESULT: 'Resultado del ejercicio actual',
  RETAINED_EARNINGS: 'Utilidades acumuladas',
  ACCUMULATED_LOSSES: 'Pérdidas acumuladas',
  INVENTORY_COST_VARIANCE: 'Diferencias en costo de inventario',
  INC_PAYABLE: 'Impuesto nacional al consumo por pagar',
  WITHHOLDING_INCOME_PAYABLE: 'Retención en la fuente por pagar',
  WITHHOLDING_VAT_PAYABLE: 'Retención de IVA (ReteIVA) por pagar',
  WITHHOLDING_ICA_PAYABLE: 'Retención de ICA (ReteICA) por pagar',
  INVENTORY_SHRINKAGE: 'Faltantes y bajas de inventario',
  INVENTORY_SURPLUS: 'Sobrantes de inventario',
};

/**
 * Descripción funcional en español de cada propósito contable para orientar la asignación de cuentas PUC.
 */
export const ACCOUNTING_PURPOSE_DESCRIPTIONS: Record<AccountingPurpose, string> = {
  CASH: 'Efectivo en caja para ventas de contado, recibos de caja y egresos en efectivo.',
  BANK: 'Cuentas bancarias predeterminadas para recaudos y pagos por transferencia.',
  CUSTOMERS: 'Cartera de clientes por ventas a crédito y aplicación de recibos de caja.',
  SUPPLIERS: 'Obligaciones con proveedores por compras a crédito y comprobantes de egreso.',
  INVENTORY: 'Existencias valorizadas de productos para la venta.',
  SALES_TAXED: 'Ingresos operacionales por venta de mercancías gravadas con IVA o INC.',
  SALES_EXCLUDED: 'Ingresos operacionales por venta de mercancías excluidas o no gravadas.',
  SALES_EXEMPT: 'Ingresos operacionales por venta de mercancías exentas de IVA (tarifa 0%).',
  COST_OF_SALES: 'Costo de ventas descargado del inventario al confirmar facturas.',
  VAT_OUTPUT: 'Impuesto sobre las ventas (IVA) recaudado en facturas de venta.',
  VAT_INPUT: 'IVA pagado en compras de mercancías descontable en la declaración.',
  VAT_INPUT_COMMON: 'IVA descontable sujeto a prorrateo entre operaciones gravadas, exentas y excluidas.',
  VAT_NON_DEDUCTIBLE: 'Impuesto sobre las ventas asumido como mayor valor del gasto o costo no descontable.',
  SIMPLE_TAX_ADVANCE: 'Anticipos de impuestos, retenciones a favor o anticipos del Régimen Simple (RST).',
  SALES_RETURNS: 'Disminución de ingresos por notas crédito y devoluciones de clientes.',
  SALES_DISCOUNTS: 'Descuentos otorgados en facturas de venta.',
  CAPITAL: 'Aportes sociales y contrapartida patrimonial en saldos iniciales de apertura.',
  CURRENT_YEAR_RESULT: 'Utilidad o pérdida neta determinada al cierre de cada período contable.',
  RETAINED_EARNINGS: 'Utilidades de ejercicios anteriores trasladadas en el cierre anual.',
  ACCUMULATED_LOSSES: 'Pérdidas de ejercicios anteriores trasladadas en el cierre anual.',
  INVENTORY_COST_VARIANCE: 'Ajuste por diferencia entre el costo de compra devuelto a proveedor y el costo promedio.',
  INC_PAYABLE: 'Impuesto Nacional al Consumo (INC) causado en ventas.',
  WITHHOLDING_INCOME_PAYABLE: 'Retención en la fuente a título de renta practicada en compras y gastos.',
  WITHHOLDING_VAT_PAYABLE: 'Retención de impuesto sobre las ventas practicada a proveedores.',
  WITHHOLDING_ICA_PAYABLE: 'Retención de industria y comercio practicada en compras y servicios.',
  INVENTORY_SHRINKAGE: 'Gasto no operacional por mermas, vencimientos, bajas o ajustes negativos de stock.',
  INVENTORY_SURPLUS: 'Ingreso o recuperación por ajustes positivos de stock y sobrantes físicos.',
};

export function getAccountingPurposeLabel(purpose: string | null | undefined): string {
  if (!purpose) return '';
  return (ACCOUNTING_PURPOSE_LABELS as Record<string, string>)[purpose] ?? purpose;
}

export function getAccountingPurposeDescription(purpose: string | null | undefined): string {
  if (!purpose) return '';
  return (ACCOUNTING_PURPOSE_DESCRIPTIONS as Record<string, string>)[purpose] ?? '';
}

export interface AccountDto {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  nature: AccountNature;
  parentId: string | null;
  level: number;
  allowsMovement: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountInput {
  code: string;
  name: string;
  type: AccountType;
  /** Si se omite se infiere del tipo, del nombre (DB)/(CR) y de la cuenta padre. */
  nature?: AccountNature;
  parentId?: string | null;
  allowsMovement: boolean;
  isActive?: boolean;
}

export interface AccountingPurposeDto {
  purpose: AccountingPurpose;
  accountId: string | null;
  account: AccountDto | null;
  status: 'PENDING_MAPPING' | 'ACTIVE' | 'INACTIVE';
}

export interface AccountingConfigurationStatusDto {
  total: number;
  configured: number;
  missing: AccountingPurpose[];
  status: 'INCOMPLETE' | 'READY';
}

export interface AccountImportRowDto {
  row: number;
  code: string;
  name: string;
  type: string;
  nature: AccountNature | null;
  parentCode: string | null;
  allowsMovement: boolean | null;
  isActive: boolean | null;
  purpose: string | null;
  errors: string[];
  warnings: string[];
}

export interface AccountImportPreviewDto {
  previewHash: string;
  validCount: number;
  errorCount: number;
  warningCount: number;
  rows: AccountImportRowDto[];
}

// ===== ASflight/PARTIDA DOBLE (LIBRO DIARIO) =====

export type JournalEntryStatus = 'DRAFT' | 'POSTED';

export interface JournalEntryLineDto {
  id: string;
  position: number;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  purpose?: AccountingPurpose | null;
  description?: string | null;
  debit: string;
  credit: string;
}

export interface JournalSourceDocumentDto {
  number: string;
  href: string | null;
}

export interface JournalEntryDto {
  id: string;
  entryDate: string;
  description: string;
  sourceType: string;
  sourceId: string;
  status: JournalEntryStatus;
  createdById?: string | null;
  createdByName?: string | null;
  createdAt: string;
  postedAt?: string | null;
  reversalOfId?: string | null;
  reversalReason?: string | null;
  /** Asiento que lo anuló (reversó), si existe */
  reversedByEntryId?: string | null;
  /** Documento de origen legible (FAC-000007, RC-000003…) y la pantalla donde se consulta */
  sourceDocument?: JournalSourceDocumentDto | null;
  lines: JournalEntryLineDto[];
  totalDebit: string;
  totalCredit: string;
}

export interface JournalEntryQueryFilters {
  fromDate?: string;
  toDate?: string;
  sourceType?: string;
  status?: JournalEntryStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface ReverseJournalEntryPayload {
  entryDate?: string;
  reason: string;
}

// ===== REPORTES CONTABLES (BALANCE DE COMPROBACIÓN Y LIBRO MAYOR) =====

export interface TrialBalanceRowDto {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  accountNature: AccountNature;
  initialBalance: string;
  totalDebit: string;
  totalCredit: string;
  finalBalance: string;
}

export interface TrialBalanceReportDto {
  fromDate: string;
  toDate: string;
  generatedAt: string;
  rows: TrialBalanceRowDto[];
  totalDebit: string;
  totalCredit: string;
  isBalanced: boolean;
}

export interface GeneralLedgerMovementDto {
  journalEntryId: string;
  date: string;
  description: string;
  sourceType: string;
  sourceId: string;
  debit: string;
  credit: string;
  balanceAfter: string;
}

export interface GeneralLedgerReportDto {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountNature: AccountNature;
  fromDate: string;
  toDate: string;
  initialBalance: string;
  finalBalance: string;
  totalDebit: string;
  totalCredit: string;
  movements: GeneralLedgerMovementDto[];
}

// ===== ESTADOS FINANCIEROS (ESTADO DE RESULTADOS Y BALANCE GENERAL) =====

export interface OperatingExpenseItemDto {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: string;
}

export interface IncomeStatementReportDto {
  fromDate: string;
  toDate: string;
  generatedAt: string;
  grossSales: string;
  returns: string;
  discounts: string;
  netSales: string;
  costOfGoodsSold: string;
  grossProfit: string;
  grossMarginPercentage: number;
  operatingExpenses: OperatingExpenseItemDto[];
  totalOperatingExpenses: string;
  operatingIncome: string;
  operatingMarginPercentage: number;
  netIncome: string;
}

export interface BalanceSheetAccountItemDto {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  balance: string;
}

export interface BalanceSheetCategoryGroupDto {
  title: string;
  total: string;
  accounts: BalanceSheetAccountItemDto[];
}

export interface BalanceSheetReportDto {
  asOfDate: string;
  generatedAt: string;
  assets: {
    current: {
      cashAndBanks: BalanceSheetCategoryGroupDto;
      receivables: BalanceSheetCategoryGroupDto;
      inventory: BalanceSheetCategoryGroupDto;
      otherCurrent: BalanceSheetCategoryGroupDto;
      total: string;
    };
    nonCurrent: {
      propertyPlantEquipment: BalanceSheetCategoryGroupDto;
      otherNonCurrent: BalanceSheetCategoryGroupDto;
      total: string;
    };
    totalAssets: string;
  };
  liabilities: {
    current: {
      suppliers: BalanceSheetCategoryGroupDto;
      taxes: BalanceSheetCategoryGroupDto;
      otherPayables: BalanceSheetCategoryGroupDto;
      total: string;
    };
    nonCurrent: {
      longTermPayables: BalanceSheetCategoryGroupDto;
      total: string;
    };
    totalLiabilities: string;
  };
  equity: {
    capital: BalanceSheetCategoryGroupDto;
    retainedEarnings: BalanceSheetCategoryGroupDto;
    currentPeriodResult: string;
    totalEquity: string;
  };
  totalLiabilitiesAndEquity: string;
  isBalanced: boolean;
  difference: string;
}

// ===== PERIODOS CONTABLES Y CIERRE FISCAL =====

export type FiscalPeriodStatus = 'OPEN' | 'CLOSED';

export interface FiscalPeriodDto {
  id: string;
  year: number;
  month: number;
  name: string;
  startDate: string;
  endDate: string;
  status: FiscalPeriodStatus;
  closedAt: string | null;
  closedById: string | null;
  closedByName: string | null;
  reopenedAt: string | null;
  reopenedById: string | null;
  reopenedByName: string | null;
  reopenReason: string | null;
  closingEntryId: string | null;
  notes: string | null;
  entriesCount: number;
  totalDebits: string;
  totalCredits: string;
}

export interface GenerateFiscalPeriodsPayload {
  year: number;
}

export interface CloseFiscalPeriodPayload {
  notes?: string;
  generateClosingEntry?: boolean;
}

export interface ReopenFiscalPeriodPayload {
  reason: string;
}

// ===== REPORTE AUXILIAR DE TERCEROS / MEDIOS MAGNÉTICOS (RF-034) =====

export interface ThirdPartyRowDto {
  thirdPartyId?: string | null;
  documentType?: string | null;
  documentNumber: string;
  verificationDigit?: string | null;
  personType?: string | null;
  taxRegime?: string | null;
  city?: string | null;
  department?: string | null;
  name: string;
  role: 'CUSTOMER' | 'SUPPLIER' | 'BENEFICIARY' | 'OTHER';
  initialBalance: string;
  totalDebit: string;
  totalCredit: string;
  finalBalance: string;
}

export interface ThirdPartyReportDto {
  fromDate: string;
  toDate: string;
  accountId?: string | null;
  accountCode?: string | null;
  generatedAt: string;
  rows: ThirdPartyRowDto[];
  totalDebit: string;
  totalCredit: string;
}

export interface ThirdPartyReportFilters {
  fromDate?: string;
  toDate?: string;
  accountId?: string;
  thirdPartyId?: string;
  search?: string;
}

// ===== BLOQUEO DE DOCUMENTOS POR FECHA =====

export interface DocumentLockDto {
  id: string;
  /** null = sin bloqueo */
  lockedThrough: string | null;
  reason: string;
  createdById: string;
  createdByName: string | null;
  createdAt: string;
}

export interface DocumentLockStatusDto {
  current: DocumentLockDto | null;
  history: DocumentLockDto[];
}

export interface SetDocumentLockPayload {
  /** YYYY-MM-DD; null retira el bloqueo */
  lockedThrough: string | null;
  reason: string;
}

// ===== NOTAS CONTABLES MANUALES =====

export interface ManualNoteLinePayload {
  accountId: string;
  /** Importe decimal como texto, p. ej. "150000.00"; un solo lado positivo por línea */
  debit: string;
  credit: string;
  description?: string;
}

export interface CreateManualNotePayload {
  /** Fecha contable elegida (YYYY-MM-DD); respeta períodos cerrados y bloqueo de documentos */
  entryDate: string;
  description: string;
  lines: ManualNoteLinePayload[];
}

export interface ManualNoteCreatedDto {
  journalEntryId: string;
  noteNumber: string;
}

// ===== CIERRE ANUAL =====

export interface AnnualClosingLineDto {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
}

export interface AnnualClosingPreviewDto {
  year: number;
  /** Fecha del asiento: 31 de diciembre del año */
  entryDate: string;
  /** Positivo = utilidad (a utilidades acumuladas); negativo = pérdida (a pérdidas acumuladas) */
  netResult: string;
  destinationPurpose: 'RETAINED_EARNINGS' | 'ACCUMULATED_LOSSES' | null;
  destinationAccount: { id: string; code: string; name: string } | null;
  lines: AnnualClosingLineDto[];
  /** Asiento de cierre vigente del año, si ya se cerró */
  existingEntryId: string | null;
}

export interface AnnualClosingResultDto {
  year: number;
  journalEntryId: string;
  netResult: string;
}

/** Asistente de configuración contable (ADR-006, F7). */
export type AccountingSetupCheckKey =
  | 'COMPANY'
  | 'CHART_OF_ACCOUNTS'
  | 'OPERATING_PURPOSES'
  | 'EQUITY_PURPOSES'
  | 'TAX_PURPOSES'
  | 'OPENING_BALANCES'
  | 'INVENTORY_RECONCILIATION';

export interface AccountingSetupCheckDto {
  key: AccountingSetupCheckKey;
  label: string;
  ok: boolean;
  /** Si es false, el requisito es recomendado o informativo y no impide READY */
  required: boolean;
  detail: string;
  missingPurposes?: AccountingPurpose[];
}

export interface PucTemplateSummaryDto {
  code: string;
  name: string;
  legalBasis: string;
  accounts: number;
  mappedPurposes: number;
}

export interface AccountingSetupDto {
  status: 'READY' | 'INCOMPLETE';
  checks: AccountingSetupCheckDto[];
  template: PucTemplateSummaryDto;
  inventory: { ledgerBalance: string; valuationBalance: string; difference: string } | null;
}

export interface ApplyPucTemplateResultDto {
  template: string;
  accountsCreated: string[];
  accountsExisting: string[];
  /** Cuenta con el mismo código y otro tipo: se deja como está */
  conflicts: Array<{ code: string; reason: string }>;
  purposesMapped: AccountingPurpose[];
  purposesKept: AccountingPurpose[];
}

export interface OpeningBalanceLinePayload {
  accountId: string;
  debit: string;
  credit: string;
  description?: string | null;
}

export interface CreateOpeningBalancePayload {
  entryDate: string;
  reason: string;
  lines: OpeningBalanceLinePayload[];
}

export interface OpeningBalanceDto {
  journalEntryId: string;
  entryDate: string;
  totalDebit: string;
  totalCredit: string;
  lines: Array<{ accountId: string; accountCode: string; accountName: string; debit: string; credit: string }>;
}

/** Incorporación explícita de efectivo ya contabilizado; no publica otro asiento. */
export interface IncorporateOpeningCashPayload {
  companyId: string;
  accountId: string;
  expectedAmount: string;
  reason: string;
}

export interface CashOpeningDto {
  id: string;
  companyId: string;
  journalEntryId: string;
  cashMovementId: string;
  accountId: string;
  amount: string;
  effectiveDate: string;
  createdById: string;
  createdAt: string;
}

/** Libros oficiales y conciliación (ADR-006, F8). Fechas YYYY-MM-DD; dinero como texto. */
export interface JournalBookDto {
  from: string;
  to: string;
  entries: Array<{
    id: string;
    entryDate: string;
    description: string;
    sourceType: string;
    lines: Array<{ accountCode: string; accountName: string; debit: string; credit: string }>;
  }>;
  totalDebit: string;
  totalCredit: string;
}

export interface LedgerBookDto {
  from: string;
  to: string;
  accounts: Array<{
    accountId: string;
    code: string;
    name: string;
    nature: AccountNature;
    /** Saldos con el signo de la naturaleza: positivo en su lado normal */
    openingBalance: string;
    debit: string;
    credit: string;
    closingBalance: string;
  }>;
  totalDebit: string;
  totalCredit: string;
}

export interface ReconciliationItemDto {
  key: 'CASH' | 'BANK' | 'CUSTOMERS' | 'SUPPLIERS' | 'INVENTORY';
  label: string;
  ledgerBalance: string;
  subledgerBalance: string;
  difference: string;
  ok: boolean;
  detail: string;
}

export interface ReconciliationDto {
  items: ReconciliationItemDto[];
  /** Débitos y créditos publicados cuadran (partida doble) */
  balanced: boolean;
  totalDebit: string;
  totalCredit: string;
}

// ===== AUDITORÍA CONTABLE (correcciones del cliente, 2026-11-01) =====

/** DESCUADRADOS: asientos con débitos ≠ créditos o documentos que no cuadran con lo aplicado. */
export type AccountingAuditView = 'DESCUADRADOS' | 'ANULADOS';

export interface AccountingAuditItemDto {
  /** Asiento del documento; null cuando el descuadre es del documento de tesorería */
  journalEntryId: string | null;
  date: string;
  /** Tipo de documento de origen (sourceType del asiento o TREASURY_DOCUMENT) */
  documentType: string;
  documentId: string;
  documentNumber: string | null;
  description: string;
  totalDebit: string;
  totalCredit: string;
  /** Débitos − créditos del asiento, o valor del documento − valor aplicado */
  difference: string;
  lineCount: number;
  /** Anulación: asiento de reversión, su fecha y su motivo */
  reversalEntryId: string | null;
  reversalDate: string | null;
  reversalReason: string | null;
}

export interface AccountingAuditDto {
  view: AccountingAuditView;
  items: AccountingAuditItemDto[];
  /** Hay más resultados que el máximo mostrado: acotar fechas o tipo */
  truncated: boolean;
  maxRows: number;
  /** Tipos de documento con asientos, para el filtro */
  documentTypes: string[];
}

export interface AccountingAuditFilters {
  view: AccountingAuditView;
  fromDate?: string;
  toDate?: string;
  documentType?: string;
}
