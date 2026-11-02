import type React from 'react';
import { vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../src/features/auth/context/auth-context';

/** Contexto de sesión mínimo para pantallas que consultan permisos. */
export function withAuth(ui: React.ReactElement, permissions: string[] = []) {
  const value: AuthContextValue = {
    user: { id: 'user-1', username: 'contadora', isActive: true, roles: [], permissions },
    roles: [],
    permissions,
    isAuthenticated: true,
    isLoading: false,
    error: null,
    login: vi.fn(),
    logout: vi.fn(),
    refreshSession: vi.fn(),
  };
  return <AuthContext.Provider value={value}>{ui}</AuthContext.Provider>;
}
