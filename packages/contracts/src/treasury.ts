export const BANK_ACCOUNT_TYPES = ['AHORROS', 'CORRIENTE', 'DIGITAL'] as const;
export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number];

export const BANK_MOVEMENT_TYPES = [
  'DEPOSIT',
  'WITHDRAWAL',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'FEE',
  'ADJUSTMENT',
] as const;
export type BankMovementType = (typeof BANK_MOVEMENT_TYPES)[number];

export interface BankAccountDto {
  id: string;
  bankName: string;
  accountType: BankAccountType;
  accountNumber: string;
  name: string;
  initialBalance: string;
  currentBalance: string;
  currency: string;
  isActive: boolean;
  notes: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBankAccountDto {
  bankName: string;
  accountType: BankAccountType;
  accountNumber: string;
  name: string;
  initialBalance?: string;
  notes?: string | null;
}

export interface UpdateBankAccountDto {
  name?: string;
  notes?: string | null;
  isActive?: boolean;
}

export interface BankMovementDto {
  id: string;
  bankAccountId: string;
  movementType: BankMovementType;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  concept: string;
  referenceDocumentType: string | null;
  referenceDocumentId: string | null;
  externalReference: string | null;
  movementDate: string;
  createdById: string;
  createdAt: string;
}

export interface CreateBankMovementDto {
  movementType: BankMovementType;
  amount: string;
  concept: string;
  externalReference?: string | null;
  referenceDocumentType?: string | null;
  referenceDocumentId?: string | null;
  movementDate?: string;
}

export interface BankAccountsSummaryDto {
  totalBalance: string;
  activeAccountsCount: number;
  totalAccountsCount: number;
  currency: string;
}
