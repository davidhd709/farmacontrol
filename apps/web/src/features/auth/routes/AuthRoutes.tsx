import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

function SessionLoading() {
  return (
    <Box
      component="main"
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        p: 3,
        bgcolor: 'background.default',
      }}
    >
      <Stack spacing={2} aria-live="polite" sx={{ alignItems: 'center' }}>
        <CircularProgress size={32} aria-label="Verificando sesión" />
        <Typography color="text.secondary">Verificando tu sesión…</Typography>
      </Stack>
    </Box>
  );
}

function SessionError() {
  const { retrySession } = useAuth();

  return (
    <Box
      component="main"
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        p: 3,
        bgcolor: 'background.default',
      }}
    >
      <Stack spacing={2} sx={{ width: '100%', maxWidth: 440 }}>
        <Alert severity="error">
          No pudimos verificar tu sesión. Revisa la conexión con el servidor e intenta nuevamente.
        </Alert>
        <Button variant="contained" onClick={() => void retrySession()}>
          Intentar nuevamente
        </Button>
      </Stack>
    </Box>
  );
}

function AuthStateBoundary({ requireAuthentication }: { requireAuthentication: boolean }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <SessionLoading />;
  }

  if (status === 'error') {
    return <SessionError />;
  }

  if (requireAuthentication && status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!requireAuthentication && status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

export function ProtectedRoute() {
  return <AuthStateBoundary requireAuthentication />;
}

export function PublicOnlyRoute() {
  return <AuthStateBoundary requireAuthentication={false} />;
}
