import { useMemo, type PropsWithChildren } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/auth.api';
import type { AuthUser, LoginCredentials } from '../auth.types';
import { AuthContext, type AuthContextValue, type AuthStatus } from './auth-context';

export const authQueryKey = ['auth', 'current-user'] as const;

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: authQueryKey,
    queryFn: ({ signal }) => authApi.getCurrentUser(signal),
    staleTime: 60_000,
  });

  const loginMutation = useMutation({
    mutationFn: (credentials: LoginCredentials) => authApi.login(credentials),
    onSuccess: ({ user }) => {
      queryClient.setQueryData<AuthUser | null>(authQueryKey, user);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      queryClient.setQueryData<AuthUser | null>(authQueryKey, null);
    },
  });

  let status: AuthStatus = 'unauthenticated';
  if (sessionQuery.isPending) {
    status = 'loading';
  } else if (sessionQuery.isError) {
    status = 'error';
  } else if (sessionQuery.data) {
    status = 'authenticated';
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user: sessionQuery.data ?? null,
      status,
      sessionError: sessionQuery.error,
      isLoggingIn: loginMutation.isPending,
      isLoggingOut: logoutMutation.isPending,
      login: async (credentials) => {
        const response = await loginMutation.mutateAsync(credentials);
        return response.user;
      },
      logout: async () => {
        await logoutMutation.mutateAsync();
      },
      retrySession: async () => {
        await sessionQuery.refetch();
      },
    }),
    [loginMutation, logoutMutation, sessionQuery, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
