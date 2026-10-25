import type { JournalBookDto, LedgerBookDto, ReconciliationDto } from '@farmacia/contracts';
import { apiRequest } from '../../../api/http-client';

/** Libros oficiales y conciliación (ADR-006, F8). */
export const fetchJournalBook = (from: string, to: string) =>
  apiRequest<JournalBookDto>(`accounting/books/journal?from=${from}&to=${to}`);

export const fetchLedgerBook = (from: string, to: string) =>
  apiRequest<LedgerBookDto>(`accounting/books/ledger?from=${from}&to=${to}`);

export const fetchReconciliation = () => apiRequest<ReconciliationDto>('accounting/reconciliation');
