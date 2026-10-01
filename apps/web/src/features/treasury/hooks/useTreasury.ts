import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateBankAccountDto,
  CreateBankMovementDto,
  UpdateBankAccountDto,
} from '@farmacia/contracts';
import {
  createBankAccount,
  createBankMovement,
  getBankAccount,
  getBankAccounts,
  getBankAccountSummary,
  getBankMovements,
  updateBankAccount,
  type MovementFilterParams,
} from '../api/treasury.api';

export const TREASURY_KEYS = {
  all: ['treasury'] as const,
  accounts: (includeInactive = false) => ['treasury', 'accounts', { includeInactive }] as const,
  account: (id: string) => ['treasury', 'account', id] as const,
  summary: () => ['treasury', 'summary'] as const,
  movements: (accountId: string, params?: MovementFilterParams) =>
    ['treasury', 'movements', accountId, params] as const,
};

export function useBankAccounts(includeInactive = false) {
  return useQuery({
    queryKey: TREASURY_KEYS.accounts(includeInactive),
    queryFn: () => getBankAccounts(includeInactive),
  });
}

export function useBankAccountSummary() {
  return useQuery({
    queryKey: TREASURY_KEYS.summary(),
    queryFn: getBankAccountSummary,
  });
}

export function useBankAccount(id: string) {
  return useQuery({
    queryKey: TREASURY_KEYS.account(id),
    queryFn: () => getBankAccount(id),
    enabled: Boolean(id),
  });
}

export function useBankMovements(accountId: string, params: MovementFilterParams = {}) {
  return useQuery({
    queryKey: TREASURY_KEYS.movements(accountId, params),
    queryFn: () => getBankMovements(accountId, params),
    enabled: Boolean(accountId),
  });
}

export function useCreateBankAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBankAccountDto) => createBankAccount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury'] });
    },
  });
}

export function useUpdateBankAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBankAccountDto }) =>
      updateBankAccount(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['treasury'] });
      queryClient.invalidateQueries({ queryKey: TREASURY_KEYS.account(variables.id) });
    },
  });
}

export function useCreateBankMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, data }: { accountId: string; data: CreateBankMovementDto }) =>
      createBankMovement(accountId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['treasury'] });
      queryClient.invalidateQueries({ queryKey: TREASURY_KEYS.account(variables.accountId) });
      queryClient.invalidateQueries({
        queryKey: ['treasury', 'movements', variables.accountId],
      });
    },
  });
}
