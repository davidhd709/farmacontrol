import type { To } from 'react-router-dom';

export interface LoginLocationState {
  from?: { pathname?: string; search?: string; hash?: string };
}

export function loginDestination(state: LoginLocationState | null): To {
  const from = state?.from;
  if (
    !from?.pathname?.startsWith('/') ||
    from.pathname.startsWith('//') ||
    from.pathname === '/login'
  )
    return '/';
  return { pathname: from.pathname, search: from.search, hash: from.hash };
}
