import { createContext } from 'react';
import type { AuthUser, LoginCredentials } from '../auth.types';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

export interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  sessionError: Error | null;
  isLoggingIn: boolean;
  isLoggingOut: boolean;
  login: (credentials: LoginCredentials) => Promise<AuthUser>;
  logout: () => Promise<void>;
  retrySession: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
