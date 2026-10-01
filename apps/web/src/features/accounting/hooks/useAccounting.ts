import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAccount,
  fetchAccounts,
  fetchConfigurationStatus,
  fetchPurposes,
  updateAccount,
  updatePurpose,
  type AccountPayload,
} from '../api/accounting.api';

const accountsKey = ['accounting', 'accounts'] as const;
const purposesKey = ['accounting', 'purposes'] as const;
const statusKey = ['accounting', 'configuration-status'] as const;

export const useAccounts = () => useQuery({ queryKey: accountsKey, queryFn: fetchAccounts });
export const usePurposes = () => useQuery({ queryKey: purposesKey, queryFn: fetchPurposes });
export const useConfigurationStatus = () =>
  useQuery({ queryKey: statusKey, queryFn: fetchConfigurationStatus });

export function useCreateAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createAccount,
    onSuccess: () => void client.invalidateQueries({ queryKey: accountsKey }),
  });
}
export function useUpdateAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<AccountPayload> }) =>
      updateAccount(id, payload),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: accountsKey });
      void client.invalidateQueries({ queryKey: purposesKey });
      void client.invalidateQueries({ queryKey: statusKey });
    },
  });
}
export function useUpdatePurpose() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ purpose, accountId }: { purpose: string; accountId: string | null }) =>
      updatePurpose(purpose, accountId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: purposesKey });
      void client.invalidateQueries({ queryKey: statusKey });
    },
  });
}

export function useRefreshAccounting() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: accountsKey }),
      client.invalidateQueries({ queryKey: purposesKey }),
      client.invalidateQueries({ queryKey: statusKey }),
    ]);
}
