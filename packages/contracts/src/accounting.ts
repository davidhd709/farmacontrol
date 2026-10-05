export const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE', 'COST'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

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
] as const;
export type AccountingPurpose = (typeof ACCOUNTING_PURPOSES)[number];

export interface AccountDto {
  id: string;
  code: string;
  name: string;
  type: AccountType;
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
  documentNumber: string;
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
  search?: string;
}


