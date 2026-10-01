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
